#!/usr/bin/env bash
# WheelyLove deploy - run ON THE VPS as root.
#
#   deploy.sh /path/to/release.tar.gz            build on the VPS (memory-limited builder) and deploy
#   deploy.sh --image-tar app.tar migrate.tar /path/to/release.tar.gz
#                                                use prebuilt images (docker save output) - no build on the VPS
#
# The tarball is produced on your machine with:  git archive --format=tar.gz -o release.tar.gz HEAD
#
# Flow: preflight -> unpack -> build (or load) -> db up -> pre-deploy backup -> migrate
#       -> switch app -> health check (auto-rollback on failure) -> cleanup.
# Previous image tag is kept (state/prev_tag.env) so deploy/rollback.sh works in seconds.
# Downtime: the app container is recreated -> ~5-20 s of 502 from nginx. The db is never restarted.
set -euo pipefail
HERE="$(dirname "$(readlink -f "$0")")"
# shellcheck source=scripts/lib.sh
. "$HERE/scripts/lib.sh"

BUILDER="wl-builder"
BUILDER_MEM="2g"            # hard cap for the whole build (RAM+swap)
BUILDER_CPU_QUOTA="150000"  # 1.5 CPU (period 100000)
MIN_AVAIL_MB=2800           # refuse to build if less RAM is available
KEEP_RELEASES=3

APP_TAR=""; MIG_TAR=""; TARBALL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --image-tar) APP_TAR="${2:?app image tar}"; MIG_TAR="${3:?migrate image tar}"; shift 3 ;;
    -*) die "unknown option $1" ;;
    *)  TARBALL="$1"; shift ;;
  esac
done
[ -n "$TARBALL" ] && [ -f "$TARBALL" ] || die "usage: deploy.sh [--image-tar APP.tar MIGRATE.tar] release.tar.gz"

require_root
exec 9>/var/lock/wheelylove-deploy.lock
flock -n 9 || die "another deploy is running"

# ------------------------------------------------------------------ 1. preflight
log "1/9 preflight"
require_mount
[ -f "$WL_ENV" ] || die "$WL_ENV missing - run install.sh"
[ -f "$WL_TAG_ENV" ] || die "$WL_TAG_ENV missing - run install.sh"
[ "$(stat -c %a "$WL_ENV")" = "600" ] || die "$WL_ENV must be mode 600"
if grep -q 'CHANGE_ME' "$WL_ENV"; then
  grep -n 'CHANGE_ME' "$WL_ENV" | sed 's/=.*/=.../' >&2
  die "placeholders (CHANGE_ME) still in $WL_ENV - fill them in first"
fi
docker info >/dev/null 2>&1 || die "docker is not running"
ok "loop disk mounted, env file complete"
df -h "$WL_BASE" | sed 's/^/    /'
AVAIL_MB="$(awk '/MemAvailable/ {print int($2/1024)}' /proc/meminfo)"
echo "    RAM available: ${AVAIL_MB} MB"
if [ -z "$APP_TAR" ] && [ "$AVAIL_MB" -lt "$MIN_AVAIL_MB" ] && [ "${FORCE:-0}" != "1" ]; then
  die "only ${AVAIL_MB} MB RAM available (< ${MIN_AVAIL_MB}); a build needs ~2 GB. Retry later or FORCE=1."
fi

# ------------------------------------------------------------------ 2. unpack
ID="$(date -u +%Y%m%d-%H%M%S)"
SHA="$( (gzip -dc "$TARBALL" 2>/dev/null | git get-tar-commit-id 2>/dev/null) || true)"
[ -n "$SHA" ] && ID="$ID-${SHA:0:7}"
REL="$WL_BASE/releases/$ID"
log "2/9 unpack -> $REL"
mkdir -p "$REL"
tar -xzf "$TARBALL" -C "$REL" --no-same-owner
for f in Dockerfile package.json package-lock.json deploy/docker-compose.yml; do
  [ -f "$REL/$f" ] || die "release is missing $f"
done
[ -d "$REL/drizzle" ] || die "release has no ./drizzle directory (migrations) - commit the generated migrations"
ok "release $ID unpacked"

OLD_TAG="$(tag_get "$WL_TAG_ENV")"
trap 'rc=$?; [ $rc -ne 0 ] && echo "deploy FAILED (exit $rc). Running app (tag: ${OLD_TAG:-none}) was not replaced unless stated above." >&2' EXIT

# ------------------------------------------------------------------ 3. build or load
if [ -n "$APP_TAR" ]; then
  log "3/9 load prebuilt images"
  docker load -i "$APP_TAR" >/dev/null
  docker load -i "$MIG_TAR" >/dev/null
  # The release id is generated above from the clock, so prebuilt images cannot know it in advance:
  # they are loaded as wheelylove-app:prebuilt / wheelylove-migrate:prebuilt and re-tagged here.
  image_exists "wheelylove-app:prebuilt" && image_exists "wheelylove-migrate:prebuilt" \
    || die "tarballs must contain wheelylove-app:prebuilt and wheelylove-migrate:prebuilt (tag them so before docker save)"
  docker tag wheelylove-app:prebuilt "wheelylove-app:$ID"
  docker tag wheelylove-migrate:prebuilt "wheelylove-migrate:$ID"
  docker rmi wheelylove-app:prebuilt wheelylove-migrate:prebuilt >/dev/null
else
  log "3/9 build on the VPS in a memory-limited builder (RAM cap $BUILDER_MEM, 1.5 CPU)"
  if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
    docker buildx create --name "$BUILDER" --driver docker-container \
      --driver-opt "memory=$BUILDER_MEM" --driver-opt "memory-swap=$BUILDER_MEM" \
      --driver-opt cpu-period=100000 --driver-opt "cpu-quota=$BUILDER_CPU_QUOTA" >/dev/null
  fi
  docker buildx inspect "$BUILDER" --bootstrap >/dev/null
  # SAFETY: prove the limit is really applied, otherwise do not build on a production box.
  CID="$(docker ps -aq --filter "name=buildx_buildkit_${BUILDER}" | head -n1)"
  [ -n "$CID" ] || die "builder container not found"
  MEM_SET="$(docker inspect -f '{{.HostConfig.Memory}}' "$CID")"
  MEM_EXPECT=$(( ${BUILDER_MEM%g} * 1024 * 1024 * 1024 ))
  [ "$MEM_SET" = "$MEM_EXPECT" ] || die "builder memory limit not applied (got '$MEM_SET', expected $MEM_EXPECT). Remove it: docker buildx rm $BUILDER  - or use --image-tar."
  ok "builder limits verified: memory=$BUILDER_MEM"

  BUILD_ARGS=()
  for k in NEXT_PUBLIC_APP_URL; do
    v="$(env_get "$WL_ENV" "$k")"
    [ -n "$v" ] && BUILD_ARGS+=(--build-arg "$k=$v")
  done

  echo "    building app image (this takes a few minutes)..."
  docker buildx build --builder "$BUILDER" --load --progress=plain \
    --target runner -t "wheelylove-app:$ID" \
    "${BUILD_ARGS[@]}" "$REL"
  echo "    building migrate image..."
  docker buildx build --builder "$BUILDER" --load --progress=plain \
    --target migrate -t "wheelylove-migrate:$ID" "$REL"
  docker buildx stop "$BUILDER" >/dev/null 2>&1 || true   # frees the builder RAM, keeps the layer cache
  ok "images built: wheelylove-app:$ID, wheelylove-migrate:$ID"
fi

export WL_COMPOSE_FILE="$REL/deploy/docker-compose.yml"

# ------------------------------------------------------------------ 4. database up
log "4/9 database"
APP_TAG="$ID" compose up -d --wait --wait-timeout 90 db
ok "db healthy"

# ------------------------------------------------------------------ 5. backup before migrating
log "5/9 pre-deploy backup"
"$HERE/scripts/backup.sh" pre-deploy

# ------------------------------------------------------------------ 6. migrate
log "6/9 migrations (drizzle-kit migrate)"
if ! APP_TAG="$ID" timeout 300 docker compose -p wheelylove -f "$WL_COMPOSE_FILE" \
      --env-file "$WL_ENV" --env-file "$WL_TAG_ENV" run --rm migrate; then
  die "migration failed - app NOT switched (old app keeps running). Fix the migration; restore from the pre-deploy dump only if the db was left half-migrated."
fi
ok "migrations applied"

# ------------------------------------------------------------------ 7. switch the app
log "7/9 switch app to $ID (was: ${OLD_TAG:-none})"
if APP_TAG="$ID" compose up -d --no-deps --remove-orphans --wait --wait-timeout 120 app && wait_app_ready 60; then
  ok "new version is live"
else
  warn "new version did NOT become healthy - rolling back"
  docker logs --tail 40 "$WL_APP_CONTAINER" 2>&1 | sed 's/^/    | /' || true
  if [ -n "$OLD_TAG" ] && [ "$OLD_TAG" != "none" ] && image_exists "wheelylove-app:$OLD_TAG"; then
    APP_TAG="$OLD_TAG" compose up -d --no-deps --wait --wait-timeout 120 app || true
    wait_app_ready 60 && warn "rolled back to $OLD_TAG (db migrations stay applied - keep them backward compatible)"
  else
    warn "no previous version to roll back to; app is down"
  fi
  exit 1
fi

# ------------------------------------------------------------------ 8. record state
log "8/9 record state"
if [ -n "$OLD_TAG" ] && [ "$OLD_TAG" != "none" ]; then tag_set "$WL_PREV_ENV" "$OLD_TAG"; fi
tag_set "$WL_TAG_ENV" "$ID"
ln -sfn "releases/$ID" "$WL_BASE/current"
mkdir -p "$WL_BASE/deploy"
cp -a "$REL/deploy/." "$WL_BASE/deploy/"
chmod +x "$WL_BASE/deploy/"*.sh "$WL_BASE/deploy/scripts/"*.sh "$WL_BASE/deploy/firewall/"*.sh
ok "current -> releases/$ID ; previous tag: ${OLD_TAG:-none}"
# Drift check: files that are installed OUTSIDE /srv/wheelylove need install.sh to be re-run.
if ! cmp -s "$REL/deploy/firewall/wheelylove-firewall.sh" /usr/local/sbin/wheelylove-firewall \
   || ! cmp -s "$REL/deploy/nginx/wheelylove.conf" /etc/nginx/sites-available/wheelylove \
   || ! cmp -s "$REL/deploy/nginx/wheelylove-proxy.conf" /etc/nginx/snippets/wheelylove-proxy.conf \
   || ! cmp -s "$REL/deploy/nginx/wheelylove-ratelimit.conf" /etc/nginx/conf.d/wheelylove-ratelimit.conf; then
  warn "firewall/nginx files in this release differ from what is installed -> review, then run: bash $WL_BASE/deploy/install.sh"
fi

# ------------------------------------------------------------------ 9. cleanup
log "9/9 cleanup (keep $KEEP_RELEASES releases, current + previous images)"
ls -1dt "$WL_BASE"/releases/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES+1)) | xargs -r rm -rf
KEEP_TAGS="$ID ${OLD_TAG:-}"
for repo in wheelylove-app wheelylove-migrate; do
  docker images --format '{{.Tag}}' "$repo" | while read -r t; do
    case " $KEEP_TAGS " in *" $t "*) ;; *) docker rmi "$repo:$t" >/dev/null 2>&1 || true ;; esac
  done
done
docker buildx prune --builder "$BUILDER" --keep-storage 1GB -f >/dev/null 2>&1 || true
docker image prune -f >/dev/null 2>&1 || true
ok "cleanup done"

echo
echo "DEPLOY OK: wheelylove-app:$ID   (rollback: bash $WL_BASE/deploy/rollback.sh)"
