#!/bin/sh
set -eu
# Railway mounts a root-owned volume; prepare it before dropping privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown node:node "$DATA_DIR"
  exec gosu node "$0" "$@"
fi
exec "$@"
