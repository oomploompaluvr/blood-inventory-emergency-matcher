-- =====================================================================
-- Member A: DML examples (INSERT / UPDATE / DELETE) on donors and donations.
-- Run with `npm run db:dml` on a seeded database. Everything happens inside one
-- transaction that is ROLLED BACK at the end, so the data is left unchanged.
-- (The app does the same operations through src/lib/data/donors.ts and
--  sp_record_donation; this file shows them as plain SQL.)
-- =====================================================================

START TRANSACTION;

-- ---------------------------------------------------------------- INSERT
-- 1. Register two donors (multi-row INSERT). DOB and PIN code are checked by trigger / FK.
INSERT INTO donor (full_name, gender, date_of_birth, weight_kg, blood_group, phone, email,
                   preferred_channel, address_line, pincode)
VALUES ('Ishaan Rao',  'M', '1998-03-14', 72.5, 'O-', '9000011111', 'ishaan.rao@example.com', 'sms',  '#12, 4th Main', '560085'),
       ('Meghana Iyer','F', '2001-11-02', 54.0, 'B+', '9000022222', NULL,                     'call', '#7, Temple Road', '560011');

SET @ishaan  = (SELECT donor_id FROM donor WHERE phone = '9000011111');
SET @meghana = (SELECT donor_id FROM donor WHERE phone = '9000022222');

-- 2. Record a whole-blood donation. The BEFORE INSERT trigger checks age, weight, Hb and the
--    gap rules; the AFTER INSERT trigger copies today's weight back to the donor.
INSERT INTO donation (donor_id, donation_type, bag_number, donated_at, volume_ml, hemoglobin_g_dl, weight_kg)
VALUES (@ishaan, 'whole_blood', 'BB2026990001', NOW() - INTERVAL 1 HOUR, 450, 14.6, 73.0);
SET @d1 = LAST_INSERT_ID();

-- 3. INSERT ... SELECT: create the bag and its components, with expiry taken from component_type.
INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml, collected_at, expires_at)
SELECT CONCAT('BB2026990001-', ct.component_code), @d1, ct.component_code, 'O-',
       ROUND(450 * ct.volume_ratio), NOW() - INTERVAL 1 HOUR,
       NOW() - INTERVAL 1 HOUR + INTERVAL ct.shelf_life_days DAY
FROM component_type ct
WHERE ct.component_code IN ('RBC', 'FFP', 'PLT');

-- 4. Log a recall call for the second donor.
INSERT INTO recall_contact (donor_id, blood_group, donation_type, channel)
VALUES (@meghana, 'B+', 'whole_blood', 'call');

SELECT 'After INSERT' AS step, d.donor_id, d.full_name, d.weight_kg,
       (SELECT COUNT(*) FROM donation dn WHERE dn.donor_id = d.donor_id)           AS donations,
       (SELECT COUNT(*) FROM blood_component u
          JOIN donation dn ON dn.donation_id = u.donation_id
         WHERE dn.donor_id = d.donor_id)                                          AS units
FROM donor d WHERE d.donor_id IN (@ishaan, @meghana);

-- ---------------------------------------------------------------- UPDATE
-- 5. Donor changes phone number and moves to a new PIN code.
UPDATE donor
   SET phone = '9000033333', pincode = '560102', address_line = '#45, 27th Main, HSR Layout'
 WHERE donor_id = @meghana;

-- 6. Add a note to the donation.
UPDATE donation SET notes = 'Mild dizziness after donation, recovered in 10 min' WHERE donation_id = @d1;

-- 7. UPDATE with a JOIN: the lab clears the new units for use (testing finished).
UPDATE blood_component u
  JOIN donation dn ON dn.donation_id = u.donation_id
   SET u.status = 'available'
 WHERE dn.donation_id = @d1 AND u.status = 'collected';

-- 8. Close the recall call: donor declined.
UPDATE recall_contact SET outcome = 'declined', responded_at = NOW()
 WHERE donor_id = @meghana AND outcome = 'pending';

-- 9. Deactivate donors who are now too old to donate (age > 65): a set-based UPDATE.
UPDATE donor
   SET is_active = FALSE
 WHERE is_active AND TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) > 65;
SELECT 'Deactivated (age > 65)' AS step, ROW_COUNT() AS rows_changed;

SELECT 'After UPDATE' AS step, d.full_name, d.phone, d.pincode, p.area,
       rc.outcome AS recall_outcome
FROM donor d
JOIN pincode p ON p.pincode = d.pincode
LEFT JOIN recall_contact rc ON rc.donor_id = d.donor_id
WHERE d.donor_id = @meghana;
SELECT 'After UPDATE' AS step, unit_code, status FROM blood_component WHERE donation_id = @d1;

-- ---------------------------------------------------------------- DELETE
-- 10. Remove a recall call logged by mistake.
DELETE FROM recall_contact WHERE donor_id = @meghana;

-- 11. A donor who never donated asks to be removed completely.
DELETE FROM donor WHERE donor_id = @meghana AND NOT EXISTS (SELECT 1 FROM donation WHERE donor_id = @meghana);
SELECT 'After DELETE' AS step, COUNT(*) AS meghana_rows FROM donor WHERE donor_id = @meghana;

-- Foreign keys stop deleting a donor who has donations (their units must stay traceable):
--   DELETE FROM donor WHERE donor_id = @ishaan;   -- fails with ERROR 1451 (FK fk_donation_donor)

ROLLBACK;

SELECT 'Rolled back - no data was changed' AS done,
       (SELECT COUNT(*) FROM donor WHERE phone IN ('9000011111', '9000022222', '9000033333')) AS example_rows_left;
