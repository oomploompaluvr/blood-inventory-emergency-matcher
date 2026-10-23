#!/usr/bin/env bash
# Runs the SQL test files in db/tests/ as the schema owner, then checks the database
# privileges by connecting as each app role.   npm run db:test
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.local}"
set -a; source "$ENV_FILE"; set +a
MYSQL_BIN="${MYSQL_BIN:-$(command -v mysql || echo /usr/local/mysql/bin/mysql)}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cnf() { # cnf <file> <user> <password>
  printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword="%s"\ndatabase=%s\n' \
    "$MYSQL_HOST" "$MYSQL_PORT" "$2" "$3" "$MYSQL_DATABASE" > "$TMP/$1"
  chmod 600 "$TMP/$1"
}
cnf owner.cnf "$MYSQL_OWNER_USER" "$MYSQL_OWNER_PASSWORD"
cnf hospital.cnf ll_hospital "$MYSQL_HOSPITAL_PASSWORD"
cnf donor.cnf ll_donor "$MYSQL_DONOR_PASSWORD"
cnf lab.cnf ll_lab "$MYSQL_LAB_PASSWORD"

failed=0
for f in db/tests/*.sql; do
  echo "== $f"
  out="$("$MYSQL_BIN" --defaults-extra-file="$TMP/owner.cnf" --table < "$f")"
  echo "$out"
  if grep -q "| FAIL" <<< "$out"; then failed=1; fi
done

echo "== Access control (connecting as each app role)"
n=0; pass=0
expect() { # expect <allow|deny> <role> <description> <sql>
  n=$((n + 1))
  if "$MYSQL_BIN" --defaults-extra-file="$TMP/$2.cnf" -e "$4" > /dev/null 2> "$TMP/err"; then got=allow; else got=deny; fi
  if [ "$got" = "$1" ]; then pass=$((pass + 1)); echo "PASS  $3"
  else failed=1; echo "FAIL  $3 (expected $1, got $got: $(head -c 200 "$TMP/err"))"; fi
}
expect allow hospital "hospital can read stock counts"            "SELECT * FROM v_hospital_stock LIMIT 1"
expect deny  hospital "hospital cannot read the donor table"      "SELECT full_name FROM donor LIMIT 1"
expect deny  hospital "hospital cannot read donations"            "SELECT * FROM donation LIMIT 1"
expect deny  hospital "hospital cannot read unit-level stock"     "SELECT * FROM blood_component LIMIT 1"
expect deny  hospital "hospital cannot call the donation procedure" "CALL sp_record_donation(1,'whole_blood','BB2026999999',NULL,450,14,70,NULL,NULL,NULL,TRUE,@x)"
expect allow donor    "donor can read own history view"           "SELECT * FROM v_donor_history LIMIT 1"
expect allow donor    "donor can update contact details"          "UPDATE donor SET pincode = pincode WHERE donor_id = 0"
expect deny  donor    "donor cannot change blood group (column grant)" "UPDATE donor SET blood_group = 'O-' WHERE donor_id = 0"
expect deny  donor    "donor cannot deactivate a donor (column grant)" "UPDATE donor SET is_active = 0 WHERE donor_id = 0"
expect deny  donor    "donor cannot read raw donation rows"       "SELECT * FROM donation LIMIT 1"
expect deny  donor    "donor cannot read the recall log"          "SELECT * FROM recall_contact LIMIT 1"
expect allow lab      "lab can read the shortage forecast"        "SELECT * FROM v_shortage_forecast LIMIT 1"
expect allow lab      "lab can call donor recall"                 "CALL sp_recall_candidates('O-', 'whole_blood', 25, 'priority', 1)"
expect deny  hospital "hospital cannot pool or split units"       "CALL sp_pool_platelets('[1,2,3,4]', @x)"
expect deny  donor    "donor cannot change the rule tables"       "UPDATE donation_interval_rule SET min_days = 1"
expect deny  lab      "lab cannot delete donors"                  "DELETE FROM donor WHERE donor_id = 0"
expect deny  lab      "lab cannot alter tables"                   "ALTER TABLE donor ADD COLUMN x INT"
echo "$pass / $n access-control checks passed"

# Hosted MySQL services sometimes disable the Event Scheduler. Nothing breaks (stock queries use
# v_unit_status, which treats past-expiry units as expired on read), but say so.
sched="$("$MYSQL_BIN" --defaults-extra-file="$TMP/owner.cnf" -N -e "SELECT @@event_scheduler")"
if [ "$sched" = "ON" ]; then echo "Event Scheduler: ON"
else echo "Event Scheduler: $sched — expiry job will not run; stock still correct via v_unit_status (expiry on read)"; fi

exit $failed
