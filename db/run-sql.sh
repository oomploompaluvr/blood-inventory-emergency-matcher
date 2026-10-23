#!/usr/bin/env bash
# Runs one SQL file against the lifeline database as the schema owner.
#   bash db/run-sql.sh db/examples/a_dml_examples.sql
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.local}"
set -a; source "$ENV_FILE"; set +a
MYSQL_BIN="${MYSQL_BIN:-$(command -v mysql || echo /usr/local/mysql/bin/mysql)}"
[ -f "${1:-}" ] || { echo "Usage: bash db/run-sql.sh <file.sql>"; exit 1; }

CNF="$(mktemp)"
trap 'rm -f "$CNF"' EXIT
chmod 600 "$CNF"
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword="%s"\ndatabase=%s\n' \
  "$MYSQL_HOST" "$MYSQL_PORT" "$MYSQL_OWNER_USER" "$MYSQL_OWNER_PASSWORD" "$MYSQL_DATABASE" > "$CNF"
"$MYSQL_BIN" --defaults-extra-file="$CNF" --table < "$1"
