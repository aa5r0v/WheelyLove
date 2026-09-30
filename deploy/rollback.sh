#!/usr/bin/env bash
# WheelyLove rollback - run ON THE VPS as root.
#   rollback.sh          switch back to the previous app version (state/prev_tag.env)
#   rollback.sh <tag>    switch to a specific image tag (see: docker images wheelylove-app)
# Running rollback twice swaps back again (the tags are exchanged).
# NOTE: this only changes the APP. Database migrations are NOT undone. If a migration must be undone,
# restore a dump:  see README (pre-deploy-*.dump files in /srv/wheelylove/backups).
set -euo pipefail
HERE="$(dirname "$(readlink -f "$0")")"
# shellcheck source=scripts/lib.sh
. "$HERE/scripts/lib.sh"

require_root
require_mount
exec 9>/var/lock/wheelylove-deploy.lock
flock -n 9 || die "a deploy/rollback is running"

CUR="$(tag_get "$WL_TAG_ENV")"
TARGET="${1:-$(tag_get "$WL_PREV_ENV")}"
[ -n "$TARGET" ] || die "no previous version recorded (state/prev_tag.env is empty)"
[ "$TARGET" != "$CUR" ] || die "already running $CUR"

log "1/3 check image wheelylove-app:$TARGET"
image_exists "wheelylove-app:$TARGET" || die "image wheelylove-app:$TARGET not found (docker images wheelylove-app)"
ok "image present"

log "2/3 switch app: $CUR -> $TARGET"
if [ -d "$WL_BASE/releases/$TARGET/deploy" ]; then
  export WL_COMPOSE_FILE="$WL_BASE/releases/$TARGET/deploy/docker-compose.yml"
fi
APP_TAG="$TARGET" compose up -d --no-deps --wait --wait-timeout 120 app || die "app did not become healthy on $TARGET (run: docker logs $WL_APP_CONTAINER)"

log "3/3 health check + record state"
wait_app_ready 60 || die "loopback check failed"
tag_set "$WL_PREV_ENV" "$CUR"
tag_set "$WL_TAG_ENV" "$TARGET"
[ -d "$WL_BASE/releases/$TARGET" ] && ln -sfn "releases/$TARGET" "$WL_BASE/current"
ok "now running $TARGET (previous: $CUR)"
echo
echo "ROLLBACK OK"
