#!/usr/bin/env bash
# WheelyLove first-time setup - run ON THE VPS as root, from an unpacked release:
#     mkdir -p /root/wl-src && tar -xzf /root/release.tar.gz -C /root/wl-src
#     bash /root/wl-src/deploy/install.sh
# Safe to run again (idempotent). It does NOT start the app (deploy.sh does) and does not touch
# other services. Steps: preflight -> loop disk -> dirs/.env -> firewall unit -> nginx vhost
# (nginx -t BEFORE reload, auto-undo on failure) -> timers/cron.
set -euo pipefail
SRC="$(dirname "$(readlink -f "$0")")"        # .../deploy of the unpacked release
# shellcheck source=scripts/lib.sh
. "$SRC/scripts/lib.sh"

IMG="/srv/wheelylove.img"
IMG_SIZE="6G"
MIN_FREE_GB=12
NGX_AVAIL="/etc/nginx/sites-available/wheelylove"
NGX_ENABLED="/etc/nginx/sites-enabled/wheelylove"
NGX_RATE="/etc/nginx/conf.d/wheelylove-ratelimit.conf"
NGX_PROXY="/etc/nginx/snippets/wheelylove-proxy.conf"

require_root

# ------------------------------------------------------------------ 1. preflight (read-only)
log "1/7 preflight checks"
command -v docker >/dev/null && docker compose version >/dev/null || die "docker compose not available"
docker buildx version >/dev/null 2>&1 || warn "docker buildx missing - builds on the VPS will not work (use --image-tar)"
command -v nginx >/dev/null || die "nginx not installed"
command -v iptables >/dev/null || die "iptables not installed"
command -v fallocate >/dev/null && command -v mkfs.ext4 >/dev/null || die "fallocate/mkfs.ext4 missing"
[ -f /etc/ssl/cloudflare/purepoint-origin.crt ] && [ -f /etc/ssl/cloudflare/purepoint-origin.key ] \
  || die "Cloudflare origin cert /etc/ssl/cloudflare/purepoint-origin.{crt,key} not found"
[ -f /etc/nginx/cloudflare-allow.conf ] || die "/etc/nginx/cloudflare-allow.conf not found (origin lock)"
[ -f "$SRC/.env.production.example" ] || die "deploy/.env.production.example is missing from the release (it is git-ignored by '.env*' - add it with: git add -f deploy/.env.production.example)"
if ss -ltn | awk '{print $4}' | grep -qE '[:.]5610$'; then
  docker ps --format '{{.Names}}' | grep -qx "$WL_APP_CONTAINER" || die "port 5610 is already in use by something else"
fi
for net in 172.28.61. 172.28.62.; do
  if ip -4 route | grep -q "^$net" && ! ip -4 route | grep "^$net" | grep -qE 'wl-(egress|internal)0'; then
    die "subnet $net* is already routed on this host"
  fi
done
ok "docker, nginx, cert, origin-lock file present; port 5610 and subnets 172.28.61/62.0/24 free"

# ------------------------------------------------------------------ 2. loop disk
log "2/7 isolated disk ($IMG_SIZE ext4 loop image -> $WL_BASE)"
if mountpoint -q "$WL_BASE"; then
  ok "$WL_BASE already mounted"
else
  if [ ! -f "$IMG" ]; then
    FREE_GB="$(df -BG --output=avail /srv | tail -n1 | tr -dc '0-9')"
    [ "$FREE_GB" -ge "$MIN_FREE_GB" ] || die "only ${FREE_GB} GB free on /srv (< ${MIN_FREE_GB})"
    [ -z "$(ls -A "$WL_BASE" 2>/dev/null)" ] || die "$WL_BASE exists and is not empty - refusing to mount over it"
    fallocate -l "$IMG_SIZE" "$IMG"      # really reserves the space: it can never grow beyond this
    chmod 600 "$IMG"
    mkfs.ext4 -q -F -L wheelylove -m 0 "$IMG"
    ok "created $IMG"
  fi
  mkdir -p "$WL_BASE"
  grep -qF "$IMG $WL_BASE " /etc/fstab || \
    echo "$IMG $WL_BASE ext4 loop,nosuid,nodev,noatime,nofail 0 2" >> /etc/fstab
  mount "$WL_BASE"
fi
findmnt -no SOURCE,FSTYPE,OPTIONS "$WL_BASE" | sed 's/^/    /'
df -h "$WL_BASE" | sed 's/^/    /'

# ------------------------------------------------------------------ 3. dirs, env, tools
log "3/7 directories, .env, scripts"
mkdir -p "$WL_BASE"/{pgdata,backups,releases,state,deploy,uploads}
chown 70:70 "$WL_BASE/pgdata"; chmod 700 "$WL_BASE/pgdata"     # uid 70 = postgres in postgres:17-alpine
# uid 10001 = the app user in the container; nginx (www-data) only needs to READ.
chown 10001:10001 "$WL_BASE/uploads"; chmod 755 "$WL_BASE/uploads"
chmod 700 "$WL_BASE/backups"
[ -f "$WL_TAG_ENV" ] || tag_set "$WL_TAG_ENV" none
if [ ! -f "$WL_ENV" ]; then
  ( umask 077; cp "$SRC/.env.production.example" "$WL_ENV" )
  sed -i "s|CHANGE_ME_POSTGRES_PASSWORD|$(openssl rand -hex 24)|; s|CHANGE_ME_CRON_SECRET|$(openssl rand -hex 24)|; s|CHANGE_ME_BETTER_AUTH_SECRET|$(openssl rand -hex 32)|" "$WL_ENV"
  ok "created $WL_ENV with random POSTGRES_PASSWORD, CRON_SECRET and BETTER_AUTH_SECRET"
  echo "    >>> fill in the remaining CHANGE_ME values:  nano $WL_ENV"
else
  ok "$WL_ENV exists (not touched)"
  for k in $(grep -oE '^[#[:space:]]*[A-Z0-9_]+=' "$SRC/.env.production.example" | tr -d '#= ' | sort -u); do
    grep -qE "^#?[[:space:]]*$k=" "$WL_ENV" || warn "variable $k is in the template but not in $WL_ENV"
  done
fi
chown root:root "$WL_ENV"; chmod 600 "$WL_ENV"
if [ "$(readlink -f "$SRC")" != "$(readlink -f "$WL_BASE/deploy")" ]; then
  cp -a "$SRC/." "$WL_BASE/deploy/"
else
  ok "deployment scripts are already installed in $WL_BASE/deploy"
fi
chmod +x "$WL_BASE/deploy/"*.sh "$WL_BASE/deploy/scripts/"*.sh "$WL_BASE/deploy/firewall/"*.sh
install -m 0755 "$SRC/firewall/wheelylove-firewall.sh" /usr/local/sbin/wheelylove-firewall
ok "scripts in $WL_BASE/deploy, firewall script in /usr/local/sbin/wheelylove-firewall"

# ------------------------------------------------------------------ 4. firewall
log "4/7 firewall (own chains WHEELYLOVE / WHEELYLOVE-IN, scoped to the WheelyLove bridges only)"
install -m 0644 "$SRC/systemd/wheelylove-firewall.service" /etc/systemd/system/wheelylove-firewall.service
systemctl daemon-reload
systemctl enable wheelylove-firewall.service >/dev/null 2>&1
systemctl restart wheelylove-firewall.service
/usr/local/sbin/wheelylove-firewall status | sed 's/^/    /'

# ------------------------------------------------------------------ 5. nginx
log "5/7 nginx vhost (test before reload)"
mkdir -p /etc/nginx/snippets
BK="$(mktemp -d)"
for f in "$NGX_AVAIL" "$NGX_RATE" "$NGX_PROXY"; do [ -f "$f" ] && cp -a "$f" "$BK/$(basename "$f")" || true; done
install -m 0644 "$SRC/nginx/wheelylove-ratelimit.conf" "$NGX_RATE"
install -m 0644 "$SRC/nginx/wheelylove-proxy.conf" "$NGX_PROXY"
install -m 0644 "$SRC/nginx/wheelylove.conf" "$NGX_AVAIL"
ln -sfn "$NGX_AVAIL" "$NGX_ENABLED"
if nginx -t 2>&1 | sed 's/^/    /'; [ "${PIPESTATUS[0]}" -eq 0 ]; then
  systemctl reload nginx
  ok "nginx reloaded (graceful, other vhosts unaffected)"
else
  warn "nginx -t FAILED - undoing the nginx changes, nginx NOT reloaded"
  rm -f "$NGX_ENABLED"
  for f in "$NGX_AVAIL" "$NGX_RATE" "$NGX_PROXY"; do
    if [ -f "$BK/$(basename "$f")" ]; then cp -a "$BK/$(basename "$f")" "$f"; else rm -f "$f"; fi
  done
  nginx -t
  die "nginx config rejected; see errors above"
fi
rm -rf "$BK"

# ------------------------------------------------------------------ 6. timers and cron
log "6/7 daily reminders (systemd timer, 08:00 UTC) and nightly backup (cron)"
install -m 0644 "$SRC/systemd/wheelylove-reminders.service" /etc/systemd/system/wheelylove-reminders.service
install -m 0644 "$SRC/systemd/wheelylove-reminders.timer"   /etc/systemd/system/wheelylove-reminders.timer
systemctl daemon-reload
systemctl enable --now wheelylove-reminders.timer >/dev/null 2>&1
install -m 0644 "$SRC/cron/wheelylove-backup" /etc/cron.d/wheelylove-backup
systemctl list-timers wheelylove-reminders.timer --no-pager | sed 's/^/    /'

# ------------------------------------------------------------------ 7. done
log "7/7 done"
cat <<EOF
    Next steps:
      1. nano $WL_ENV              (replace every CHANGE_ME)
      2. Cloudflare DNS: A record  wheelylove -> 164.138.216.72  (proxied), SSL/TLS mode: Full (strict)
      3. deploy:  bash $WL_BASE/deploy/deploy.sh /root/release.tar.gz
    Undo everything installed here:  bash $WL_BASE/deploy/uninstall.sh
EOF
