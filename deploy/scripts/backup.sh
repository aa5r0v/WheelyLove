#!/usr/bin/env bash
# Backups -> /srv/wheelylove/backups (on the loop disk):
#   1. pg_dump of the database (custom format)
#   2. tar.gz of /srv/wheelylove/uploads (gallery images/videos)
#   backup.sh            nightly (called by /etc/cron.d/wheelylove-backup)
#   backup.sh pre-deploy same, different file prefix (deploy.sh calls it before migrating)
# Rotation: dumps and upload tars older than 14 days are deleted - but only after a
# NEW non-empty dump AND tar were written.
# NOTE: backups sit on the same server (same loop disk). Copy them off-server too (see README).
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"

PREFIX="${1:-nightly}"
KEEP_DAYS=14
DIR="$WL_BASE/backups"

require_root
require_mount
[ -d "$WL_BASE/uploads" ] || die "$WL_BASE/uploads is missing (run install.sh)"
docker inspect -f '{{.State.Running}}' "$WL_DB_CONTAINER" 2>/dev/null | grep -q true \
  || die "container $WL_DB_CONTAINER is not running"

umask 077
mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/${PREFIX}-${STAMP}.dump"
TAR_OUT="$DIR/${PREFIX}-${STAMP}-uploads.tar.gz"

log "pg_dump -> $OUT"
docker exec "$WL_DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$OUT.part"
[ -s "$OUT.part" ] || { rm -f "$OUT.part"; die "dump is empty"; }
mv "$OUT.part" "$OUT"
ok "$(du -h "$OUT" | cut -f1) written"

log "tar uploads -> $TAR_OUT"
tar -czf "$TAR_OUT.part" -C "$WL_BASE" uploads
[ -s "$TAR_OUT.part" ] || { rm -f "$TAR_OUT.part"; die "uploads tar is empty"; }
mv "$TAR_OUT.part" "$TAR_OUT"
ok "$(du -h "$TAR_OUT" | cut -f1) written"

log "rotation: delete backups older than $KEEP_DAYS days"
find "$DIR" -maxdepth 1 -type f \( -name '*.dump' -o -name '*-uploads.tar.gz' \) -mtime +"$KEEP_DAYS" -print -delete
ok "done"
