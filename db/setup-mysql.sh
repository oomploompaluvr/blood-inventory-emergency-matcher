#!/usr/bin/env bash
# One-time setup, run by a person who knows the MySQL root password.
# Creates the schema-owner account the other scripts use. Passwords come from .env.local.
#   bash db/setup-mysql.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.local}"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE — copy .env.example to .env.local and fill it in first."; exit 1; }
set -a; source "$ENV_FILE"; set +a

MYSQL_BIN="${MYSQL_BIN:-$(command -v mysql || echo /usr/local/mysql/bin/mysql)}"
: "${MYSQL_HOST:?}" "${MYSQL_PORT:?}" "${MYSQL_DATABASE:?}" "${MYSQL_OWNER_USER:?}" "${MYSQL_OWNER_PASSWORD:?}"

echo "Connecting to MySQL at $MYSQL_HOST:$MYSQL_PORT as root (you will be asked for the root password)."
"$MYSQL_BIN" -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u root -p <<SQL
-- Triggers and stored functions need this when binary logging is on (MySQL 8 default).
SET PERSIST log_bin_trust_function_creators = 1;
-- Member B's daily expiry job is a MySQL event. Stock is still correct without it, because every
-- stock query reads v_unit_status (expiry on read), but turn the scheduler on where we can.
SET PERSIST event_scheduler = ON;

CREATE USER IF NOT EXISTS '${MYSQL_OWNER_USER}'@'localhost' IDENTIFIED BY '${MYSQL_OWNER_PASSWORD}';
CREATE USER IF NOT EXISTS '${MYSQL_OWNER_USER}'@'127.0.0.1' IDENTIFIED BY '${MYSQL_OWNER_PASSWORD}';
ALTER USER '${MYSQL_OWNER_USER}'@'localhost' IDENTIFIED BY '${MYSQL_OWNER_PASSWORD}';
ALTER USER '${MYSQL_OWNER_USER}'@'127.0.0.1' IDENTIFIED BY '${MYSQL_OWNER_PASSWORD}';

-- Owns the lifeline schema and may hand out privileges on it to the app roles.
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_OWNER_USER}'@'localhost' WITH GRANT OPTION;
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_OWNER_USER}'@'127.0.0.1' WITH GRANT OPTION;
-- Needed to create the per-role app accounts in db/reset.sh.
GRANT CREATE USER, CREATE ROLE, DROP ROLE, ROLE_ADMIN ON *.* TO '${MYSQL_OWNER_USER}'@'localhost';
GRANT CREATE USER, CREATE ROLE, DROP ROLE, ROLE_ADMIN ON *.* TO '${MYSQL_OWNER_USER}'@'127.0.0.1';
SQL

echo "Done. Now run: npm run db:reset"
