#!/usr/bin/env bash
# Database backup: pg_dump (custom format) inside the db container -> /srv/wheelylove/backups
#   backup.sh            nightly (called by /etc/cron.d/wheelylove-backup)
#   backup.sh pre-deploy same, different file prefix (deploy.sh calls it before migrating)
# Rotation: files older than 14 days are deleted - but only after a NEW non-empty dump was written.
# NOTE: backups sit on the same server (same loop disk). Copy them off-server too (see README).
set -euo pipefail
# shellcheck source=lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"

PREFIX="${1:-nightly}"
KEEP_DAYS=14
DIR="$WL_BASE/backups"

require_root
require_mount
docker inspect -f '{{.State.Running}}' "$WL_DB_CONTAINER" 2>/dev/null | grep -q true \
  || die "container $WL_DB_CONTAINER is not running"

umask 077
mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/${PREFIX}-${STAMP}.dump"

log "pg_dump -> $OUT"
docker exec "$WL_DB_CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl' > "$OUT.part"
[ -s "$OUT.part" ] || { rm -f "$OUT.part"; die "dump is empty"; }
mv "$OUT.part" "$OUT"
ok "$(du -h "$OUT" | cut -f1) written"

log "rotation: delete dumps older than $KEEP_DAYS days"
find "$DIR" -maxdepth 1 -type f -name '*.dump' -mtime +"$KEEP_DAYS" -print -delete
ok "done"
