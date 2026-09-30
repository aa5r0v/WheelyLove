#!/usr/bin/env bash
# Called daily by wheelylove-reminders.timer. Runs the reminders job on loopback.
# The secret is read from the env file and handed to curl on STDIN (curl -K -),
# so it never appears in `ps` or in shell history.
set -euo pipefail

ENV_FILE="/srv/wheelylove/.env"
PORT=5610

SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | tail -n1 | cut -d= -f2- || true)"
[ -n "$SECRET" ] || { echo "CRON_SECRET missing in $ENV_FILE" >&2; exit 1; }
case "$SECRET" in *CHANGE_ME*) echo "CRON_SECRET is still a placeholder" >&2; exit 1 ;; esac

# printf is a shell builtin -> no process with the secret in its arguments.
printf 'header = "Authorization: Bearer %s"\n' "$SECRET" \
  | curl -fsS --max-time 240 -K - "http://127.0.0.1:${PORT}/api/cron/reminders"
echo
