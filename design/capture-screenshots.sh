#!/usr/bin/env bash
set -euo pipefail

CHROME="${CHROME:-/usr/bin/chromium}"
OUT="${OUT:-design/screenshots}"
mkdir -p "$OUT/before" "$OUT/after"

capture() {
  local phase="$1" base="$2" slug="$3" path="$4" width="$5" height="$6" theme="$7"
  local args=(--headless=new --no-sandbox --disable-gpu --hide-scrollbars --disable-dev-shm-usage --force-device-scale-factor=1 --virtual-time-budget=2500 "--window-size=${width},${height}" "--screenshot=${OUT}/${phase}/${slug}-${width}-${theme}.png")
  if [[ "$theme" == "dark" ]]; then args+=(--force-dark-mode); fi
  timeout 25 "$CHROME" "${args[@]}" "${base}${path}" >/dev/null 2>&1
}

LIVE='https://flufollower.com'
LOCAL='http://localhost:8788'
declare -A paths=( [home]='/' [florida]='/state/florida/' [states]='/states/' [alerts]='/alerts/' [404]='/not-a-page-for-audit' )
for phase in ${PHASE:-before after}; do
  base="$LIVE"; [[ "$phase" == "after" ]] && base="$LOCAL"
  for slug in home florida states alerts 404; do
    for viewport in '390 844' '1440 1000'; do
      read -r width height <<<"$viewport"
      for theme in light dark; do
        capture "$phase" "$base" "$slug" "${paths[$slug]}" "$width" "$height" "$theme"
      done
    done
  done
done

find "$OUT" -type f -name '*.png' | sort
