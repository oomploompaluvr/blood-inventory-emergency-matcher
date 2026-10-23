# Report — Member A sections (draft)

> Draft for the project report. Each section maps to a rubric item. Replace `[Screenshot: …]` with real
> screenshots from the running app, and the introduction / architecture / conclusion are written jointly.

---

## A1. ER diagram, schema and DDL (Member A tables)

**Tables owned:** `donation_type`, `donation_interval_rule`, `donor`, `donation`, `blood_component`,
`unit_lineage`, `recall_contact` (`db/10_a_donor_donation.sql`), plus the shared reference tables
`blood_group`, `stock_family`, `component_type`, `pincode`, `blood_bank` (`db/01_shared_reference.sql`).

Key decisions (full ER diagram in `docs/er-diagram.md`):

- **One row per physical bag.** A donation produces several units with different shelf lives (platelets 5 days,
  red cells 42, plasma 365), so stock is tracked per component in `blood_component`, not per donation.
- **Lineage is a graph.** `unit_lineage(parent_unit_id, child_unit_id)` records which bag was made from which:
  whole blood → components, red cells → paediatric aliquots, and 4-6 platelet units from *different donors* →
  one pool. A pool has several parents and no single `donation_id`, which is why tracing needs recursion.
- **Rules as data.** Eligibility limits live in `donation_type` and `donation_interval_rule` (each rule row
  stores its source, NBTC 2017), so the trigger has no hard-coded numbers.
- **Location by PIN code.** Donors give a PIN code (FK to `pincode`), which stores an approximate centre point;
  recall distance is computed between PIN-code centres.
- **Integrity in the schema:** CHECK constraints (phone format, volume range, Hb range, recall outcome needs a
  response time, "a unit without a donation must be a pool"), UNIQUE (phone, email, bag number, unit code) and
  foreign keys on every reference.

**ALTER and DROP** (`db/35_a_migration.sql`): `ALTER TABLE donor ADD COLUMN preferred_channel …`,
`ALTER TABLE donation ADD CONSTRAINT chk_bag_number_format …`, and `DROP TABLE donor_import_staging`
(a staging table used once to import the paper register).

[Screenshot: ER diagram]

## A2. DML

`db/examples/a_dml_examples.sql` (run: `npm run db:dml`) shows, inside a rolled-back transaction:
multi-row `INSERT` of donors; `INSERT` of a donation (firing the eligibility and after-insert triggers);
`INSERT … SELECT` of components with expiry computed from `component_type`; `UPDATE` of contact details,
`UPDATE … JOIN` releasing tested units, a set-based `UPDATE` deactivating donors over 65; `DELETE` of a
mistaken recall call and of a donor with no donations (a donor with donations cannot be deleted — FK).
In the application the same operations run through parameterised queries in `src/lib/data/donors.ts`.

## A3. Trigger: donation eligibility

`trg_donation_eligibility` (BEFORE INSERT on `donation`) rejects an ineligible donation with
`SIGNAL SQLSTATE '45000'` and a readable message. It reads the limits for the donation type and checks:

| Rule | Whole blood | Platelet apheresis |
|---|---|---|
| Age | 18-65 (first-time donors ≤ 60) | 18-60 |
| Weight | ≥ 45 kg (450 ml bag needs ≥ 55 kg) | ≥ 50 kg |
| Haemoglobin | ≥ 12.5 g/dL | ≥ 12.5 g/dL |
| Platelet count | — | ≥ 150 ×10³/µL |
| Gap after whole blood | men 90 days, women 120 days | 28 days |
| Gap after apheresis | 28 days | 48 hours |
| Frequency cap | — | 2 per 7 days, 24 per year |

The gap is checked in both directions in time, so a back-dated entry cannot break the gap before a donation
already on record. Other triggers: `trg_donor_bi/bu` (date of birth, blood group locked once donations exist),
`trg_donation_ai` (refreshes donor weight and closes a pending recall call as "donated" when the donor gives
blood within 14 days), `trg_unit_status_time`.

[Screenshot: donation form showing "Donor not eligible: haemoglobin 11.5 g/dL is below 12.5"]

## A4. Procedure: record a donation and split it into components

`sp_record_donation` runs in one transaction with an `EXIT HANDLER … ROLLBACK; RESIGNAL`. It inserts the
donation (the trigger validates it), then for whole blood creates the bag plus red cells, plasma and platelets
with their own expiry dates and lineage links; for apheresis it creates one single-donor platelet unit. If any
step fails nothing is saved (test: "Rejected calls left no partial donation rows").

Processing procedures: `sp_split_paediatric` (one red cell unit → 2-4 aliquots that keep the parent's expiry) and
`sp_pool_platelets` (4-6 same-group platelet units → one pool, input as a JSON array read with `JSON_TABLE`).
Both lock their source rows with `SELECT … FOR UPDATE` so two technicians cannot process the same bag.

[Screenshot: "Donation recorded" table listing the 4 units]

## A5. NoSQL: screening questionnaire (MongoDB)

- **`questionnaire_templates`** holds the questions (yes/no, number, choice, text; `showIf` e.g. the pregnancy
  question for women only; `defer` rule with reason and number of days). The form is generated from it, so
  questions change without a schema migration.
- **`screening_responses`**: one document per visit — answers, result, deferral reasons, deferred-until date.
  Collections are created with `$jsonSchema` validators and indexes (`scripts/mongo-init.mjs`).
- **CRUD:** create (submit questionnaire), read (list / view), update (staff correct answers → outcome is
  re-evaluated; review note), delete (admin, e.g. entered against the wrong donor).
- **Aggregation** (deferral report): `$match` → `$facet` { totals; `$unwind` deferrals → `$group` by reason →
  `$sort`; `$group` by month } .
- **Link to MySQL:** a donation is only accepted if the donor passed screening in the last 3 days; the
  response's `_id` is stored in `donation.screening_ref`.

Why MongoDB: answers are a variable list that changes with each template version, with free-text fields —
it does not fit a fixed table schema.

[Screenshot: dynamic questionnaire] [Screenshot: deferral report]

## A6. CTE + window functions: shortage forecast

- `v_usage_trend`: a **recursive CTE** builds a calendar of the last 120 days (so days with no issues count as 0),
  cross-joined with every blood group and stock family; **window functions**
  `AVG(...) OVER (PARTITION BY blood_group, family_code ORDER BY day ROWS BETWEEN 29 PRECEDING AND CURRENT ROW)`
  give the 30-day (and 7-day) moving average.
- `v_shortage_forecast`: days of stock = units available ÷ max(7-day avg, 30-day avg), so a sudden spike is not
  hidden; status critical / low / ok from per-family thresholds (red cells 3 / 7 days, platelets 1 / 2,
  plasma 5 / 14); trend rising / falling / steady.
- Stock counts read `v_unit_status`, which treats a unit past its expiry as expired at read time — the forecast
  stays correct even if the nightly expiry event does not run (Event Scheduler disabled).

[Screenshot: stock dashboard with colour-coded cards and the 60-day chart]

## A7. Correlated subquery: donor recall

`sp_recall_candidates(group, donation_type, radius_km, sort, limit)` lists donors of the needed group who are
eligible **today** for that donation type (age, weight, first-time rule, and the minimum gap since their last
donation — via `fn_next_eligible_date`). For each donor row, **correlated subqueries** compute: last donation,
donations of that type in the last 12 months, the gap rule that applies, recall calls answered / closed, last
contact. Priority = 45% closeness + 35% donation frequency (capped at the type's yearly maximum) + 20% past
recall response; sort options: priority, closest, most frequent. Distance uses `ST_Distance_Sphere` between
PIN-code centres. "Mark contacted" inserts into `recall_contact`; a later donation closes the call through the
trigger.

[Screenshot: recall list with gap column]

## A8. Authentication & RBAC — database side

- One MySQL role per application role (`ll_role_admin`, `ll_role_lab`, `ll_role_hospital`, `ll_role_donor`) and one
  login account per role; the app connects with the account matching the signed-in user (`src/lib/mysql.ts`).
- **Restricted views:** `v_hospital_stock` (counts per group and family — no donor or unit details),
  `v_donor_history` (a donor's own donations without lab columns).
- **Column-level grants:** a donor can `UPDATE (phone, email, preferred_channel, address_line, pincode)` but not
  blood group, weight or active flag.
- Verified by `npm run db:test`, which logs in as each role: e.g. a hospital account is denied `SELECT` on
  `donor`, `donation` and `blood_component`; a donor is denied changing their blood group.

## A9. Testing

`npm run db:test` runs 54 SQL test cases (`db/tests/a_donor_donation_tests.sql`) — each either expects the
database to reject an action and checks the message, or checks the data it produced — plus 17 privilege checks
per role. Examples: under-18 / underweight / low-Hb donations rejected; 90 vs 120-day gap; apheresis 48 h, 2 per
week; first-time donor over 60 rejected; donation split into 4 units with correct expiry; pool of 4 donors reached
by a recursive trace; expired unit reported as expired on read.

[Screenshot: test output]
