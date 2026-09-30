#!/usr/bin/env bash
# WheelyLove uninstall / rollback of install.sh - run ON THE VPS as root.
#   uninstall.sh                 remove nginx vhost, firewall chains/unit, timer, cron. Containers and data stay.
#   uninstall.sh --remove-stack  additionally stop and remove the containers/networks (data volume is kept)
# It NEVER deletes /srv/wheelylove data, the loop image or backups. The final, manual commands are printed.
set -euo pipefail
HERE="$(dirname "$(readlink -f "$0")")"
# shellcheck source=scripts/lib.sh
. "$HERE/scripts/lib.sh"
require_root

REMOVE_STACK=0
[ "${1:-}" = "--remove-stack" ] && REMOVE_STACK=1

log "1/5 nginx: remove WheelyLove vhost (test before reload)"
BK="$(mktemp -d)"
for f in /etc/nginx/sites-available/wheelylove /etc/nginx/conf.d/wheelylove-ratelimit.conf /etc/nginx/snippets/wheelylove-proxy.conf; do
  [ -f "$f" ] && cp -a "$f" "$BK/" || true
done
rm -f /etc/nginx/sites-enabled/wheelylove /etc/nginx/sites-available/wheelylove \
      /etc/nginx/conf.d/wheelylove-ratelimit.conf /etc/nginx/snippets/wheelylove-proxy.conf
if nginx -t; then
  systemctl reload nginx; ok "nginx reloaded"
else
  warn "nginx -t failed after removal - restoring files, nginx not reloaded"
  cp -a "$BK/wheelylove" /etc/nginx/sites-available/ 2>/dev/null || true
  cp -a "$BK/wheelylove-ratelimit.conf" /etc/nginx/conf.d/ 2>/dev/null || true
  cp -a "$BK/wheelylove-proxy.conf" /etc/nginx/snippets/ 2>/dev/null || true
  [ -f /etc/nginx/sites-available/wheelylove ] && ln -sfn /etc/nginx/sites-available/wheelylove /etc/nginx/sites-enabled/wheelylove
  die "investigate nginx manually"
fi
rm -rf "$BK"

log "2/5 timers and cron"
systemctl disable --now wheelylove-reminders.timer >/dev/null 2>&1 || true
rm -f /etc/systemd/system/wheelylove-reminders.timer /etc/systemd/system/wheelylove-reminders.service /etc/cron.d/wheelylove-backup
ok "removed"

if [ "$REMOVE_STACK" -eq 1 ]; then
  log "3/5 stop and remove containers + networks (volumes/data are kept)"
  if [ -f "$WL_TAG_ENV" ] && [ -f "$WL_BASE/current/deploy/docker-compose.yml" ]; then
    compose down --remove-orphans || true
  else
    docker rm -f "$WL_APP_CONTAINER" "$WL_DB_CONTAINER" 2>/dev/null || true
    docker network rm wl-egress wl-internal 2>/dev/null || true
  fi
  ok "stack removed"
else
  log "3/5 containers left running (use --remove-stack to stop them)"
fi

log "4/5 firewall"
systemctl disable --now wheelylove-firewall.service >/dev/null 2>&1 || true
[ -x /usr/local/sbin/wheelylove-firewall ] && /usr/local/sbin/wheelylove-firewall remove || true
rm -f /etc/systemd/system/wheelylove-firewall.service /usr/local/sbin/wheelylove-firewall
systemctl daemon-reload
ok "chains WHEELYLOVE / WHEELYLOVE-IN and their jumps removed"

log "5/5 what is left (on purpose)"
cat <<EOF
    Data and images were NOT deleted. To delete EVERYTHING permanently (irreversible!), by hand:
      umount $WL_BASE
      sed -i '\\|^/srv/wheelylove.img |d' /etc/fstab
      rm /srv/wheelylove.img
      docker rmi \$(docker images -q 'wheelylove-*')
      docker buildx rm wl-builder
EOF
