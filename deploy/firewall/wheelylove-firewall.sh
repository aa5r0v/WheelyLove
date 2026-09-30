#!/usr/bin/env bash
# WheelyLove egress firewall - idempotent.
#   wheelylove-firewall.sh apply    create/refresh the rules
#   wheelylove-firewall.sh remove   delete every rule and chain this script created
#   wheelylove-firewall.sh status   show the rules with packet counters
#
# Scope (nothing else on the box is touched):
#   * DOCKER-USER gets ONE jump, matched on  -i wl-egress0 AND -s 172.28.61.0/24
#       -> chain WHEELYLOVE:  drops the app's traffic to other hosts/containers/VPN/private ranges,
#                             allows only web ports (default 80,443) to the public internet.
#   * INPUT gets ONE jump per WheelyLove bridge (-i wl-egress0 / wl-internal0)
#       -> chain WHEELYLOVE-IN: a container may NOT open connections to the host itself
#                               (QHub :4000, netdata :19999, postgres, ...). Replies are allowed.
#     (Packets addressed to the host itself go through INPUT, not FORWARD, so the DOCKER-USER
#      "--dst-type LOCAL" rule alone would not stop them - that is why INPUT is covered too.)
#
# Env override: EGRESS_PORTS="80,443" (default). EGRESS_PORTS="" = allow every port to the public internet.
set -euo pipefail

EGRESS_SUBNET="172.28.61.0/24"
EGRESS_BR="wl-egress0"
INTERNAL_BR="wl-internal0"
EGRESS_PORTS="${EGRESS_PORTS-80,443}"

CH_FWD="WHEELYLOVE"
CH_IN="WHEELYLOVE-IN"
IPT="iptables -w 10"

chain_exists() { $IPT -S "$1" >/dev/null 2>&1; }

fresh_chain() {
  if chain_exists "$1"; then $IPT -F "$1"; else $IPT -N "$1"; fi
}

ensure_jump() {   # ensure_jump <parent-chain> <rule...>  (insert at top only if not present)
  local parent="$1"; shift
  $IPT -C "$parent" "$@" 2>/dev/null || $IPT -I "$parent" 1 "$@"
}

drop_jump() {     # remove a jump (all duplicates)
  local parent="$1"; shift
  while $IPT -D "$parent" "$@" 2>/dev/null; do :; done
}

apply() {
  echo "==> WheelyLove firewall: apply"

  # DOCKER-USER exists only after dockerd has started (systemd unit orders us After=docker.service).
  local i=0
  until chain_exists DOCKER-USER; do
    i=$((i+1)); [ "$i" -le 30 ] || { echo "ERROR: chain DOCKER-USER not found (is docker running?)" >&2; exit 1; }
    sleep 1
  done

  # ---- forwarded traffic of the app container ----
  fresh_chain "$CH_FWD"
  $IPT -A "$CH_FWD" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
  $IPT -A "$CH_FWD" -m addrtype --dst-type LOCAL -j DROP
  for net in 0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 \
             172.16.0.0/12 192.0.0.0/24 192.168.0.0/16 198.18.0.0/15 224.0.0.0/3; do
    $IPT -A "$CH_FWD" -d "$net" -j DROP
  done
  if [ -n "$EGRESS_PORTS" ]; then
    $IPT -A "$CH_FWD" -p tcp -m multiport --dports "$EGRESS_PORTS" -j RETURN
    $IPT -A "$CH_FWD" -j DROP
  else
    $IPT -A "$CH_FWD" -j RETURN
  fi
  ensure_jump DOCKER-USER -i "$EGRESS_BR" -s "$EGRESS_SUBNET" -j "$CH_FWD"

  # ---- traffic from the WheelyLove bridges to the host itself ----
  fresh_chain "$CH_IN"
  $IPT -A "$CH_IN" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  $IPT -A "$CH_IN" -j DROP
  ensure_jump INPUT -i "$EGRESS_BR"   -j "$CH_IN"
  ensure_jump INPUT -i "$INTERNAL_BR" -j "$CH_IN"

  echo "    ok: rules active (egress ports: ${EGRESS_PORTS:-ALL})"
}

remove() {
  echo "==> WheelyLove firewall: remove"
  drop_jump DOCKER-USER -i "$EGRESS_BR" -s "$EGRESS_SUBNET" -j "$CH_FWD"
  drop_jump INPUT -i "$EGRESS_BR"   -j "$CH_IN"
  drop_jump INPUT -i "$INTERNAL_BR" -j "$CH_IN"
  for c in "$CH_FWD" "$CH_IN"; do
    if chain_exists "$c"; then $IPT -F "$c"; $IPT -X "$c"; fi
  done
  echo "    ok: removed"
}

status() {
  echo "--- DOCKER-USER";    $IPT -S DOCKER-USER || true
  echo "--- INPUT (ours)";   $IPT -S INPUT | grep -E "WHEELYLOVE" || echo "(no WheelyLove jumps in INPUT)"
  for c in "$CH_FWD" "$CH_IN"; do
    echo "--- $c"; $IPT -L "$c" -n -v 2>/dev/null || echo "(chain missing)"
  done
}

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }
case "${1:-}" in
  apply)  apply ;;
  remove) remove ;;
  status) status ;;
  *) echo "usage: $0 apply|remove|status" >&2; exit 2 ;;
esac
