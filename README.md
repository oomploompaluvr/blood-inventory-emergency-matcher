# LifeLine — Blood Component Inventory & Emergency Matching System

DBMS Experiential Learning, Level 3 mini project · **Next.js · MySQL 8 · MongoDB**

Tracks every blood component from donation to patient, enforces medical rules inside the database
(eligibility, testing, compatibility, expiry), forecasts shortages, recalls eligible donors, reserves
emergency bundles atomically and traces any unit back to its donor.

## Setup

Requirements: Node 20+, MySQL 8, MongoDB (local or Atlas).

```bash
npm install
cp .env.example .env.local      # fill in passwords (any random strings) and MONGODB_URI
bash db/setup-mysql.sh          # once: asks for the MySQL root password, creates the schema owner
npm run db:reset                # builds the schema and the per-role MySQL accounts
npm run db:seed                 # ~6 months of sample history (MySQL + MongoDB)
npm run db:test                 # database tests: rules + access control
npm run db:dml                  # INSERT / UPDATE / DELETE examples (rolled back, data unchanged)
npm run dev                     # http://localhost:3000
```

`npm run mongo:init` (re)creates the MongoDB collections, validators and indexes on its own;
`db:seed` runs it too.

## Repository layout

| Path | Contents |
|---|---|
| `docs/er-diagram.md` | ER diagram, ownership, **design decisions to defend in the viva**, MongoDB collections |
| `db/01_shared_reference.sql` | Blood groups, stock families, component types (shelf lives), PIN codes, blood bank |
| `db/10_a_donor_donation.sql` | Donation types + interval rules, donor / donation / unit / lineage tables, eligibility trigger, `sp_record_donation`, `sp_split_paediatric`, `sp_pool_platelets`, expiry-on-read view |
| `db/20_b_core_tables.sql` | Hospitals, patients, users, compatibility, tests, requests, issues (Member B) |
| `db/30_a_forecast_recall.sql` | Usage trend (recursive CTE + window functions), shortage forecast, `sp_recall_candidates` |
| `db/35_a_migration.sql` | Schema evolution: ALTER + DROP |
| `db/40_a_access_control.sql` | MySQL roles, grants (incl. column-level) and restricted views |
| `db/tests/` | SQL test cases; `db/run-tests.sh` also checks privileges per role |
| `db/examples/a_dml_examples.sql` | DML examples on donors and donations |
| `docs/report-member-a.md` | Report draft for Member A's modules |
| `scripts/seed/` | Deterministic seed data (`a-*` Member A, `b-*` Member B) |
| `scripts/mongo-init.mjs` | MongoDB collections with `$jsonSchema` validators + indexes |
| `src/lib/` | DB access (`mysql.ts` connects as a different MySQL user per role), session, data modules |
| `src/app/` | Pages and API route handlers |

## How access control works

The app never connects to MySQL as one all-powerful user. Each application role has its own MySQL account
(`ll_admin`, `ll_lab`, `ll_hospital`, `ll_donor`) with a matching role, so the database itself refuses
what a role should not do — a hospital account cannot `SELECT` from `donor` at all and only sees
`v_hospital_stock` (counts); a donor can update their phone or city but not their blood group (column grants).

## Modules

| Module | Member | Database work | App |
|---|---|---|---|
| Donor & donation | A | rule-table eligibility trigger (whole blood + platelet apheresis), `sp_record_donation` (transaction + component split) | `/donors`, `/donations/new`, `/me` |
| Component processing | A | `sp_split_paediatric`, `sp_pool_platelets` (locked transactions, `unit_lineage` graph) | `/processing` |
| Screening questionnaire | A | MongoDB `screening_responses` CRUD, deferral-reason aggregation | `/screening`, `/screening/new`, `/screening/report` |
| Shortage forecast | A | `v_usage_trend` (recursive CTE + window functions), `v_shortage_forecast` | `/stock` |
| Donor recall | A | `sp_recall_candidates` (correlated subqueries, PIN-code distance, per donation type), recall trigger | `/recall` |
| Database access control | A | roles, grants, restricted views | role-specific navigation |
| Testing & unit lifecycle | B | status trigger, expiry event (stock stays correct without it: `v_unit_status`) | `/lab`, `/units` |
| Hospital requests & issuing | B | FEFO allocation procedure | `/requests` |
| Emergency bundle | B | `SELECT … FOR UPDATE` transaction | `/emergency` |
| Safety recall | B | recursive CTE over `unit_lineage` → issue → request → patient | `/safety-recall` |
| Unit audit log | B | MongoDB `audit_log` | unit timeline |
| Authentication | B | `users` + bcrypt | login, sessions, route protection |

## Notes for Member B

- **Login:** `src/lib/session.ts` currently reads an unsigned development cookie set by `/login`
  (`/api/dev-session`). Replace the body of `getSession()` and the `/login` page with real authentication;
  keep the `Session` type — every page and API route depends only on it. Seeded logins use the password
  printed by `npm run db:seed`.
- **Your tables:** `db/20_b_core_tables.sql` is a starter version so the forecast had data to work with.
  It is yours to extend (status trigger, procedures, expiry event, your ALTER + DROP) and to commit.
- **Seed:** `scripts/seed/b-hospital-activity.mjs` simulates requests and issues in JavaScript. Once your
  allocation procedure exists you may switch it to call that instead.
- **Unit lineage:** there is no `parent_unit_id` column. Parent → child links live in `unit_lineage`
  (whole blood → components, red cells → paediatric aliquots, 4-6 platelet units → one pool). Pools have
  `donation_id` NULL, so your safety-recall CTE must walk `unit_lineage`, then `issue → blood_request → patient`.
  `docs/er-diagram.md` explains why; `db/tests/a_donor_donation_tests.sql` has a working trace to copy from.
- **Unit status `processed`:** a bag that was separated, split or pooled. Your status trigger should treat it
  as final, like `issued`.
- **Requests** are per patient and per stock family (`RBC`, `PLT`, `FFP`); any compatible component type of
  that family may be issued (platelets: `PLT`, `SDP` or `PPLT`; neonatal red cells: `PAED` aliquots).
- **Expiry:** count stock from `v_unit_status.effective_status`, not `blood_component.status`, so nothing
  depends on the Event Scheduler being on.
- **Placeholders:** `/lab`, `/units`, `/requests`, `/emergency`, `/safety-recall` are empty pages linked from
  the navigation (`src/lib/nav.ts`).
- **MongoDB:** add your `audit_log` collection in `scripts/mongo-init.mjs` (marked).
