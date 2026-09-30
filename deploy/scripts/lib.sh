#!/usr/bin/env bash
# Shared helpers for the WheelyLove deploy scripts. Source it, do not run it.

WL_BASE="/srv/wheelylove"
WL_ENV="$WL_BASE/.env"
WL_STATE="$WL_BASE/state"
WL_TAG_ENV="$WL_STATE/tag.env"          # APP_TAG=<image tag currently deployed>
WL_PREV_ENV="$WL_STATE/prev_tag.env"    # APP_TAG=<previous tag, for rollback>
WL_HOST_PORT=5610
WL_APP_CONTAINER="wheelylove-app"
WL_DB_CONTAINER="wheelylove-db"

log()  { printf '\n==> %s\n' "$*"; }
ok()   { printf '    ok: %s\n' "$*"; }
warn() { printf '    WARN: %s\n' "$*" >&2; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

require_root() { [ "$(id -u)" -eq 0 ] || die "run as root"; }

require_mount() {
  mountpoint -q "$WL_BASE" || die "$WL_BASE is not a mounted loop disk. Run deploy/install.sh first (or: mount $WL_BASE)."
}

# env_get <file> <KEY>  -> value (no quotes handling: the env format forbids quotes)
env_get() { grep -E "^$2=" "$1" 2>/dev/null | tail -n1 | cut -d= -f2- || true; }

tag_get() { env_get "$1" APP_TAG; }

tag_set() {   # tag_set <file> <tag>
  ( umask 077; printf 'APP_TAG=%s\n' "$2" > "$1.tmp" ) && mv -f "$1.tmp" "$1"
}

# docker compose with the project's env files. Compose file defaults to the "current" release.
compose() {
  docker compose -p wheelylove \
    -f "${WL_COMPOSE_FILE:-$WL_BASE/current/deploy/docker-compose.yml}" \
    --env-file "$WL_ENV" --env-file "$WL_TAG_ENV" "$@"
}

image_exists() { docker image inspect "$1" >/dev/null 2>&1; }

# wait_app_ready [seconds]  -> 0 when the container is healthy AND answers on loopback
wait_app_ready() {
  local limit="${1:-120}" waited=0 status code
  while [ "$waited" -lt "$limit" ]; do
    status="$(docker inspect -f '{{if .State.Running}}{{.State.Health.Status}}{{else}}stopped{{end}}' "$WL_APP_CONTAINER" 2>/dev/null || echo missing)"
    case "$status" in
      healthy)
        code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "http://127.0.0.1:$WL_HOST_PORT${HEALTH_PATH:-/}" || echo 000)"
        if [ "$code" -ge 100 ] && [ "$code" -lt 500 ]; then ok "app healthy, loopback answers HTTP $code"; return 0; fi
        ;;
      unhealthy|stopped|missing) echo "    container state: $status"; return 1 ;;
    esac
    sleep 3; waited=$((waited+3))
  done
  echo "    timeout after ${limit}s waiting for healthy (last status: $status)"
  return 1
}
