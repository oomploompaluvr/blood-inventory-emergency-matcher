#!/usr/bin/env bash
# Drops and rebuilds the lifeline database from db/NN_*.sql, then creates the
# per-role MySQL accounts the app connects with. Safe to re-run any time.
#   npm run db:reset            (schema only)
#   npm run db:seed             (sample data, see scripts/seed.mjs)
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.local}"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE"; exit 1; }
set -a; source "$ENV_FILE"; set +a

MYSQL_BIN="${MYSQL_BIN:-$(command -v mysql || echo /usr/local/mysql/bin/mysql)}"
: "${MYSQL_HOST:?}" "${MYSQL_PORT:?}" "${MYSQL_DATABASE:?}" "${MYSQL_OWNER_USER:?}" "${MYSQL_OWNER_PASSWORD:?}"

# Pass the password through a private temp file instead of the command line.
CNF="$(mktemp)"
trap 'rm -f "$CNF"' EXIT
chmod 600 "$CNF"
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword="%s"\n' \
  "$MYSQL_HOST" "$MYSQL_PORT" "$MYSQL_OWNER_USER" "$MYSQL_OWNER_PASSWORD" > "$CNF"
sql() { "$MYSQL_BIN" --defaults-extra-file="$CNF" "$@"; }

echo "Recreating database $MYSQL_DATABASE"
sql -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"

for f in db/[0-9][0-9]_*.sql; do
  echo "  loading $f"
  sql "$MYSQL_DATABASE" < "$f"
done

echo "Creating app accounts"
for role in admin lab hospital donor; do
  var="MYSQL_$(echo "$role" | tr '[:lower:]' '[:upper:]')_PASSWORD"
  pw="${!var:?$var is not set in $ENV_FILE}"
  for host in localhost 127.0.0.1; do
    sql <<SQL
CREATE USER IF NOT EXISTS 'll_${role}'@'${host}' IDENTIFIED BY '${pw}';
ALTER USER 'll_${role}'@'${host}' IDENTIFIED BY '${pw}';
GRANT ll_role_${role} TO 'll_${role}'@'${host}';
SET DEFAULT ROLE ll_role_${role} TO 'll_${role}'@'${host}';
SQL
  done
done

echo "Database ready."
