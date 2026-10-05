#!/usr/bin/env bash
# Alarm for failed outgoing emails: counts the [email:FAILED] markers that
# src/lib/email.ts logs for every rejected Resend send (auth letters also
# throw; transactional ones are only logged - those are the ones nobody would
# otherwise notice). Prints a short summary grouped by letter type, WITHOUT any
# email addresses (the log lines themselves carry only masked addresses).
#
#   check-email-failures.sh [since]     since: docker logs --since argument,
#                                       default 15m
#
# Exit codes: 0 = no failures in the period; 1 = failures found; die() on
# container/log problems. Meant for a 15-minute cron (see deploy/README.md §7):
#   */15 * * * * root /srv/wheelylove/deploy/scripts/check-email-failures.sh 15m 2>&1 | logger -t wheelylove-email
set -uo pipefail
# shellcheck source=lib.sh
. "$(dirname "$(readlink -f "$0")")/lib.sh"

[ "$#" -le 1 ] || die "usage: $0 [since]"
SINCE="${1:-15m}"

# console.error goes to the container's stderr -> merge streams, then keep
# only the marker lines and reduce them to the letter type.
counts="$(
  docker logs --since "$SINCE" "$WL_APP_CONTAINER" 2>&1 \
    | sed -n 's/.*\[email:FAILED\] \([a-z-]\{1,\}\) .*/\1/p' \
    | sort | uniq -c
)" || die "cannot read docker logs of $WL_APP_CONTAINER (is the container running?)"

[ -n "$counts" ] || exit 0

total="$(printf '%s\n' "$counts" | awk '{s += $1} END {print s}')"
summary="$(printf '%s\n' "$counts" | awk '{printf "%s: %s, ", $2, $1}' | sed 's/, $//')"
warn "EMAIL FAILURES in the last $SINCE: $total total ($summary). Addresses stay out of the summary - see docker logs for the masked ones."
exit 1
