#!/usr/bin/env bash
# リポジトリの mod / layout を、Windows 側で動く herdr-app の app home に反映して確かめる。
#
#   scripts/deploy.sh <mod名>   mods/<mod名>/ を app home の mods/<mod名>/ にコピーし、herdr-app check を通す
#   scripts/deploy.sh layout    layouts/main-viewer.json をコピーし、herdr-app status の errors が空かを見る
#
# 生成物（gpui-kit.d.ts / jsconfig.json）はコピーしない。終了コードは check / status の結果。
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
target=${1:-}
if [ -z "$target" ]; then
  echo "usage: scripts/deploy.sh <mod名> | layout" >&2
  exit 2
fi

cmd=/mnt/c/Windows/System32/cmd.exe
winhome=$(wslpath "$("$cmd" /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r')")
app="$winhome/AppData/Local/Programs/herdr-app/herdr-app.exe"
apphome_win=$("$cmd" /c 'echo %HERDR_APP_HOME%' 2>/dev/null | tr -d '\r')
if [ -n "$apphome_win" ] && [ "$apphome_win" != "%HERDR_APP_HOME%" ]; then
  apphome=$(wslpath "$apphome_win")
else
  apphome="$winhome/.config/herdr-app"
fi

status_errors() {
  "$app" status | python3 -c 'import json, sys; e = json.load(sys.stdin).get("errors", []); print(json.dumps(e, ensure_ascii=False)); sys.exit(1 if e else 0)'
}

if [ "$target" = layout ]; then
  cp "$repo/layouts/main-viewer.json" "$apphome/layouts/main-viewer.json"
  sleep 2
  if status_errors; then
    echo "layout deployed: errors empty"
  else
    echo "layout deployed: herdr-app status has errors" >&2
    exit 1
  fi
  exit 0
fi

case "$target" in
  *[!a-z0-9-]*) echo "invalid mod name: $target" >&2; exit 2 ;;
esac
src="$repo/mods/$target"
if [ ! -f "$src/main.js" ]; then
  echo "no mod: $src/main.js" >&2
  exit 2
fi
dest="$apphome/mods/$target"
mkdir -p "$dest"
rsync -r --delete --exclude gpui-kit.d.ts --exclude jsconfig.json "$src/" "$dest/"
"$app" check "$(wslpath -w "$dest")"
