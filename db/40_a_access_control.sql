-- =====================================================================
-- 40  Member A: database-level access control
--     One MySQL role per application role. The app connects as a different
--     MySQL account depending on who is logged in (src/lib/mysql.ts), so even
--     a bug in the UI cannot let a hospital read donor identities.
--
--     The login accounts themselves (ll_admin, ll_lab, ll_hospital, ll_donor)
--     are created by db/reset.sh with passwords from .env.local.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Restricted views
-- ---------------------------------------------------------------------

-- Hospitals see how many units of each family exist, never which donor they came from.
CREATE VIEW v_hospital_stock AS
SELECT blood_group, family_code, SUM(units_available) AS units_available
FROM v_current_stock
WHERE family_code IS NOT NULL
GROUP BY blood_group, family_code;

-- Donor portal: a donor's own history, without lab-internal columns.
CREATE VIEW v_donor_history AS
SELECT dn.donation_id,
       dn.donor_id,
       dn.bag_number,
       dn.donated_at,
       dn.donation_type,
       dn.volume_ml,
       dn.hemoglobin_g_dl
FROM donation dn;


-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
DROP ROLE IF EXISTS ll_role_admin, ll_role_lab, ll_role_hospital, ll_role_donor;
CREATE ROLE ll_role_admin, ll_role_lab, ll_role_hospital, ll_role_donor;

-- Admin: full data access (no DDL — schema changes go through the owner account).
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON lifeline.* TO ll_role_admin;

-- Lab technician: donors, donations, units, tests, recall.
GRANT SELECT ON lifeline.blood_group          TO ll_role_lab;
GRANT SELECT ON lifeline.component_type       TO ll_role_lab;
GRANT SELECT ON lifeline.stock_family         TO ll_role_lab;
GRANT SELECT ON lifeline.pincode              TO ll_role_lab;
GRANT SELECT ON lifeline.blood_bank           TO ll_role_lab;
GRANT SELECT ON lifeline.donation_type        TO ll_role_lab;
GRANT SELECT ON lifeline.donation_interval_rule TO ll_role_lab;
GRANT SELECT ON lifeline.unit_lineage         TO ll_role_lab;
GRANT SELECT ON lifeline.v_unit_status        TO ll_role_lab;
GRANT SELECT, INSERT, UPDATE ON lifeline.donor          TO ll_role_lab;
GRANT SELECT, INSERT, UPDATE ON lifeline.donation       TO ll_role_lab;
GRANT SELECT, INSERT, UPDATE ON lifeline.blood_component TO ll_role_lab;
GRANT SELECT, INSERT, UPDATE ON lifeline.recall_contact TO ll_role_lab;
GRANT SELECT, INSERT, UPDATE ON lifeline.test_result    TO ll_role_lab;
GRANT SELECT ON lifeline.v_donor_eligibility  TO ll_role_lab;
GRANT SELECT ON lifeline.v_current_stock      TO ll_role_lab;
GRANT SELECT ON lifeline.v_shortage_forecast  TO ll_role_lab;
GRANT SELECT ON lifeline.v_usage_trend        TO ll_role_lab;
GRANT SELECT ON lifeline.v_recall_log         TO ll_role_lab;
GRANT SELECT ON lifeline.v_donor_history      TO ll_role_lab;
GRANT EXECUTE ON PROCEDURE lifeline.sp_record_donation   TO ll_role_lab;
GRANT EXECUTE ON PROCEDURE lifeline.sp_recall_candidates TO ll_role_lab;
GRANT EXECUTE ON PROCEDURE lifeline.sp_split_paediatric  TO ll_role_lab;
GRANT EXECUTE ON PROCEDURE lifeline.sp_pool_platelets    TO ll_role_lab;

-- Hospital: stock counts and its own requests. No donor, donation or unit tables at all.
GRANT SELECT ON lifeline.blood_group      TO ll_role_hospital;
GRANT SELECT ON lifeline.component_type   TO ll_role_hospital;
GRANT SELECT ON lifeline.stock_family     TO ll_role_hospital;
GRANT SELECT ON lifeline.v_hospital_stock TO ll_role_hospital;
GRANT SELECT, INSERT ON lifeline.blood_request TO ll_role_hospital;

-- Donor: register, keep contact details up to date, read own history / eligibility.
-- Column-level grants: a donor can change their phone or address but not their blood group or weight.
GRANT SELECT ON lifeline.blood_group TO ll_role_donor;
GRANT SELECT ON lifeline.pincode     TO ll_role_donor;
GRANT SELECT (donor_id, user_id, full_name, gender, date_of_birth, weight_kg, blood_group,
              phone, email, preferred_channel, address_line, pincode, is_active, registered_at)
      ON lifeline.donor TO ll_role_donor;
GRANT INSERT (user_id, full_name, gender, date_of_birth, weight_kg, blood_group,
              phone, email, preferred_channel, address_line, pincode)
      ON lifeline.donor TO ll_role_donor;
GRANT UPDATE (phone, email, preferred_channel, address_line, pincode) ON lifeline.donor TO ll_role_donor;
GRANT SELECT ON lifeline.v_donor_history     TO ll_role_donor;
GRANT SELECT ON lifeline.v_donor_eligibility TO ll_role_donor;
