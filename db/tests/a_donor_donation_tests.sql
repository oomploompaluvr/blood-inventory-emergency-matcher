-- =====================================================================
-- Member A: database-level test cases.  Run with `npm run db:test`.
-- Each case either expects the database to REJECT an action (and checks the
-- error message) or checks the data the database produced. Test rows use
-- phone numbers starting +9100000 and are deleted at the end.
-- =====================================================================

DROP TEMPORARY TABLE IF EXISTS test_log;
CREATE TEMPORARY TABLE test_log (
    n       INT AUTO_INCREMENT PRIMARY KEY,
    name    VARCHAR(120),
    passed  BOOLEAN,
    detail  VARCHAR(300)
);

DROP PROCEDURE IF EXISTS t_expect_error;
DROP PROCEDURE IF EXISTS t_check;
DROP PROCEDURE IF EXISTS t_cleanup;

DELIMITER //

-- Run p_sql; pass if it fails with a message containing p_expected.
CREATE PROCEDURE t_expect_error(IN p_name VARCHAR(120), IN p_sql TEXT, IN p_expected VARCHAR(200))
BEGIN
    DECLARE v_msg TEXT DEFAULT NULL;
    BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
            GET DIAGNOSTICS CONDITION 1 v_msg = MESSAGE_TEXT;
        SET @t_sql = p_sql;
        PREPARE stmt FROM @t_sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END;
    INSERT INTO test_log (name, passed, detail)
    VALUES (p_name, v_msg IS NOT NULL AND v_msg LIKE CONCAT('%', p_expected, '%'),
            COALESCE(LEFT(v_msg, 300), 'no error was raised'));
END //

CREATE PROCEDURE t_check(IN p_name VARCHAR(120), IN p_ok BOOLEAN, IN p_detail VARCHAR(300))
BEGIN
    INSERT INTO test_log (name, passed, detail) VALUES (p_name, COALESCE(p_ok, FALSE), p_detail);
END //

-- Removes every unit made from test donors, including pools and aliquots made from them.
CREATE PROCEDURE t_cleanup()
BEGIN
    DROP TEMPORARY TABLE IF EXISTS t_units;
    CREATE TEMPORARY TABLE t_units (unit_id INT PRIMARY KEY);
    INSERT INTO t_units
    WITH RECURSIVE tree AS (
        SELECT u.unit_id FROM blood_component u
        JOIN donation dn ON dn.donation_id = u.donation_id
        JOIN donor d ON d.donor_id = dn.donor_id
        WHERE d.phone LIKE '+9100000%'
        UNION
        SELECT l.child_unit_id FROM tree t JOIN unit_lineage l ON l.parent_unit_id = t.unit_id
    )
    SELECT unit_id FROM tree;
    DELETE l FROM unit_lineage l JOIN t_units t ON t.unit_id = l.parent_unit_id;
    DELETE l FROM unit_lineage l JOIN t_units t ON t.unit_id = l.child_unit_id;
    DELETE u FROM blood_component u JOIN t_units t ON t.unit_id = u.unit_id;
    DELETE rc FROM recall_contact rc JOIN donor d ON d.donor_id = rc.donor_id WHERE d.phone LIKE '+9100000%';
    DELETE dn FROM donation dn JOIN donor d ON d.donor_id = dn.donor_id WHERE d.phone LIKE '+9100000%';
    DELETE FROM donor WHERE phone LIKE '+9100000%';
    DROP TEMPORARY TABLE t_units;
END //

DELIMITER ;

CALL t_cleanup();

-- Test donors -------------------------------------------------------------------------------
INSERT INTO donor (full_name, gender, date_of_birth, weight_kg, blood_group, phone, pincode) VALUES
 ('Test Male Ok',     'M', CURDATE() - INTERVAL 30 YEAR, 70, 'O-', '+9100000001', '560011'),
 ('Test Female Ok',   'F', CURDATE() - INTERVAL 28 YEAR, 58, 'A+', '+9100000002', '560034'),
 ('Test Seventeen',   'M', CURDATE() - INTERVAL 17 YEAR, 60, 'B+', '+9100000003', '560038'),
 ('Test Light',       'F', CURDATE() - INTERVAL 25 YEAR, 48, 'O+', '+9100000004', '560070'),
 ('Test Inactive',    'M', CURDATE() - INTERVAL 40 YEAR, 80, 'O+', '+9100000005', '560085'),
 ('Test Apheresis',   'M', CURDATE() - INTERVAL 35 YEAR, 72, 'B+', '+9100000006', '560085'),
 ('Test Sixty-two',   'M', CURDATE() - INTERVAL 62 YEAR, 72, 'B+', '+9100000007', '560085'),
 ('Test Pool 1',      'M', CURDATE() - INTERVAL 30 YEAR, 70, 'AB-', '+9100000011', '560011'),
 ('Test Pool 2',      'M', CURDATE() - INTERVAL 31 YEAR, 70, 'AB-', '+9100000012', '560011'),
 ('Test Pool 3',      'M', CURDATE() - INTERVAL 32 YEAR, 70, 'AB-', '+9100000013', '560011'),
 ('Test Pool 4',      'M', CURDATE() - INTERVAL 33 YEAR, 70, 'AB-', '+9100000014', '560011'),
 ('Test Pool Other',  'M', CURDATE() - INTERVAL 34 YEAR, 70, 'A-',  '+9100000015', '560011');
SELECT donor_id INTO @male     FROM donor WHERE phone = '+9100000001';
SELECT donor_id INTO @female   FROM donor WHERE phone = '+9100000002';
SELECT donor_id INTO @minor    FROM donor WHERE phone = '+9100000003';
SELECT donor_id INTO @light    FROM donor WHERE phone = '+9100000004';
SELECT donor_id INTO @inactive FROM donor WHERE phone = '+9100000005';
SELECT donor_id INTO @aph      FROM donor WHERE phone = '+9100000006';
SELECT donor_id INTO @older    FROM donor WHERE phone = '+9100000007';
UPDATE donor SET is_active = FALSE WHERE donor_id = @inactive;

-- 1. Registration rules -----------------------------------------------------------------------
CALL t_expect_error('Registration: date of birth in the future is rejected',
  "INSERT INTO donor (full_name, gender, date_of_birth, weight_kg, blood_group, phone, pincode)
   VALUES ('X','M', CURDATE() + INTERVAL 1 DAY, 60, 'O+', '+9100000099', '560011')",
  'cannot be in the future');
CALL t_expect_error('Registration: invalid phone number is rejected (CHECK)',
  "INSERT INTO donor (full_name, gender, date_of_birth, weight_kg, blood_group, phone, pincode)
   VALUES ('X','M','1990-01-01', 60, 'O+', '12ab', '560011')",
  'chk_donor_phone');
CALL t_expect_error('Registration: unknown blood group is rejected (FK)',
  "INSERT INTO donor (full_name, gender, date_of_birth, weight_kg, blood_group, phone, pincode)
   VALUES ('X','M','1990-01-01', 60, 'C+', '+9100000098', '560011')",
  'fk_donor_group');
CALL t_expect_error('Registration: unknown PIN code is rejected (FK)',
  "INSERT INTO donor (full_name, gender, date_of_birth, weight_kg, blood_group, phone, pincode)
   VALUES ('X','M','1990-01-01', 60, 'O+', '+9100000097', '999999')",
  'fk_donor_pincode');

-- 2. Whole-blood eligibility --------------------------------------------------------------------
CALL t_expect_error('Whole blood: donor under 18 is rejected',
  CONCAT("CALL sp_record_donation(", @minor, ", 'whole_blood', 'BB2026900001', NULL, 350, 14, 60, NULL, NULL, NULL, TRUE, @x)"),
  'outside 18-65');
CALL t_expect_error('Whole blood: weight below 45 kg is rejected',
  CONCAT("CALL sp_record_donation(", @male, ", 'whole_blood', 'BB2026900002', NULL, 350, 14, 44, NULL, NULL, NULL, TRUE, @x)"),
  'below 45.0 kg');
CALL t_expect_error('Whole blood: 450 ml bag for a donor under 55 kg is rejected',
  CONCAT("CALL sp_record_donation(", @light, ", 'whole_blood', 'BB2026900003', NULL, 450, 13.5, 48, NULL, NULL, NULL, TRUE, @x)"),
  '450 ml bags need');
CALL t_expect_error('Whole blood: bag must be 350 or 450 ml',
  CONCAT("CALL sp_record_donation(", @male, ", 'whole_blood', 'BB2026900004', NULL, 400, 14, 70, NULL, NULL, NULL, TRUE, @x)"),
  '350 ml or 450 ml');
CALL t_expect_error('Whole blood: haemoglobin below 12.5 is rejected',
  CONCAT("CALL sp_record_donation(", @male, ", 'whole_blood', 'BB2026900005', NULL, 450, 11.9, 70, NULL, NULL, NULL, TRUE, @x)"),
  'haemoglobin');
CALL t_expect_error('Whole blood: deactivated donor is rejected',
  CONCAT("CALL sp_record_donation(", @inactive, ", 'whole_blood', 'BB2026900006', NULL, 450, 14, 80, NULL, NULL, NULL, TRUE, @x)"),
  'deactivated');
CALL t_expect_error('Donation time in the future is rejected',
  CONCAT("CALL sp_record_donation(", @male, ", 'whole_blood', 'BB2026900007', NOW() + INTERVAL 1 DAY, 450, 14, 70, NULL, NULL, NULL, TRUE, @x)"),
  'in the future');
CALL t_expect_error('Bag number must match BB + year + 6 digits (CHECK)',
  CONCAT("CALL sp_record_donation(", @male, ", 'whole_blood', 'BAG-1', NULL, 450, 14, 70, NULL, NULL, NULL, TRUE, @x)"),
  'chk_bag_number_format');

SELECT COUNT(*) INTO @n FROM donation dn JOIN donor d USING (donor_id) WHERE d.phone LIKE '+9100000%';
CALL t_check('Rejected calls left no partial donation rows (transaction rolled back)', @n = 0, CONCAT(@n, ' rows'));

-- 3. Separation and the lineage graph -------------------------------------------------------------
CALL sp_record_donation(@male, 'whole_blood', 'BB2026900010', NOW() - INTERVAL 95 DAY, 450, 14.2, 70, NULL, NULL, NULL, TRUE, @d1);
SELECT COUNT(*) INTO @n FROM blood_component WHERE donation_id = @d1;
CALL t_check('Whole blood donation creates 4 units (WB + RBC, FFP, PLT)', @n = 4, CONCAT(@n, ' units'));
SELECT COUNT(*) INTO @n FROM unit_lineage l
  JOIN blood_component p ON p.unit_id = l.parent_unit_id
  JOIN blood_component c ON c.unit_id = l.child_unit_id
 WHERE p.donation_id = @d1 AND p.component_code = 'WB' AND p.status = 'processed';
CALL t_check('Lineage links the processed whole-blood bag to its 3 components', @n = 3, CONCAT(@n, ' edges'));
SELECT TIMESTAMPDIFF(DAY, collected_at, expires_at) INTO @n FROM blood_component WHERE donation_id = @d1 AND component_code = 'PLT';
CALL t_check('Platelets expire 5 days after collection', @n = 5, CONCAT(@n, ' days'));
SELECT TIMESTAMPDIFF(DAY, collected_at, expires_at) INTO @n FROM blood_component WHERE donation_id = @d1 AND component_code = 'FFP';
CALL t_check('Plasma expires 365 days after collection', @n = 365, CONCAT(@n, ' days'));
SELECT blood_group INTO @g FROM blood_component WHERE donation_id = @d1 AND component_code = 'RBC';
CALL t_check('Units inherit the donor blood group', @g = 'O-', @g);

-- 4. Gaps between donations (rule table, by sex and donation type) ---------------------------------
CALL t_expect_error('Gap: man cannot give whole blood again within 90 days',
  CONCAT("CALL sp_record_donation(", @male, ", 'whole_blood', 'BB2026900011', NOW() - INTERVAL 10 DAY, 450, 14, 70, NULL, NULL, NULL, TRUE, @x)"),
  'not eligible for whole blood until');
CALL t_expect_error('Gap: back-dated donation too close to a later one is rejected',
  CONCAT("CALL sp_record_donation(", @male, ", 'whole_blood', 'BB2026900012', NOW() - INTERVAL 150 DAY, 450, 14, 70, NULL, NULL, NULL, TRUE, @x)"),
  'too close to their donation');
CALL sp_record_donation(@male, 'whole_blood', 'BB2026900013', NOW(), 450, 14.0, 70, NULL, NULL, NULL, FALSE, @d2);
CALL t_check('Gap: man can give whole blood again after 95 days', @d2 IS NOT NULL, CONCAT('donation ', @d2));
SELECT COUNT(*) INTO @n FROM blood_component WHERE donation_id = @d2;
CALL t_check('Unseparated donation stays a single whole-blood unit', @n = 1, CONCAT(@n, ' units'));
CALL sp_record_donation(@female, 'whole_blood', 'BB2026900014', NOW() - INTERVAL 100 DAY, 450, 13.0, 58, NULL, NULL, NULL, TRUE, @x);
CALL t_expect_error('Gap: woman needs 120 days between whole-blood donations (100 is not enough)',
  CONCAT("CALL sp_record_donation(", @female, ", 'whole_blood', 'BB2026900015', NOW(), 450, 13, 58, NULL, NULL, NULL, TRUE, @x)"),
  'not eligible for whole blood');
SELECT next_whole_blood_date INTO @dt FROM v_donor_eligibility WHERE donor_id = @female;
CALL t_check('Next whole-blood date for a woman = last donation + 120 days',
  @dt = DATE(NOW() - INTERVAL 100 DAY) + INTERVAL 120 DAY, CAST(@dt AS CHAR));
CALL t_expect_error('Gap: whole blood -> apheresis needs 28 days',
  CONCAT("CALL sp_record_donation(", @female, ", 'plateletpheresis', 'BB2026900016', NOW() - INTERVAL 80 DAY, 250, 13, 58, 250, NULL, NULL, TRUE, @x)"),
  'not eligible for platelet apheresis until');
CALL t_expect_error('First-time whole-blood donor over 60 is rejected (limit 65 applies to repeat donors)',
  CONCAT("CALL sp_record_donation(", @older, ", 'whole_blood', 'BB2026900017', NULL, 450, 14, 72, NULL, NULL, NULL, TRUE, @x)"),
  'first-time donors must be 60');

-- 5. Platelet apheresis ------------------------------------------------------------------------
CALL t_expect_error('Apheresis: weight below 50 kg is rejected (whole blood allows 45)',
  CONCAT("CALL sp_record_donation(", @light, ", 'plateletpheresis', 'BB2026900020', NULL, 250, 13, 48, 250, NULL, NULL, TRUE, @x)"),
  'below 50.0 kg');
CALL t_expect_error('Apheresis: donors over 60 are rejected (whole blood allows 65)',
  CONCAT("CALL sp_record_donation(", @older, ", 'plateletpheresis', 'BB2026900021', NULL, 250, 14, 72, 250, NULL, NULL, TRUE, @x)"),
  'outside 18-60');
CALL t_expect_error('Apheresis: platelet count below 150 is rejected',
  CONCAT("CALL sp_record_donation(", @aph, ", 'plateletpheresis', 'BB2026900022', NULL, 250, 14, 72, 120, NULL, NULL, TRUE, @x)"),
  'platelet count');
CALL sp_record_donation(@aph, 'plateletpheresis', 'BB2026900023', NOW() - INTERVAL 6 DAY, 250, 14, 72, 240, NULL, NULL, TRUE, @a1);
SELECT GROUP_CONCAT(component_code) INTO @g FROM blood_component WHERE donation_id = @a1;
CALL t_check('Apheresis creates one single-donor platelet unit and nothing to separate', @g = 'SDP', @g);
CALL t_expect_error('Apheresis: 48 hours between procedures',
  CONCAT("CALL sp_record_donation(", @aph, ", 'plateletpheresis', 'BB2026900024', NOW() - INTERVAL 5 DAY, 250, 14, 72, 240, NULL, NULL, TRUE, @x)"),
  'not eligible for platelet apheresis until');
CALL sp_record_donation(@aph, 'plateletpheresis', 'BB2026900025', NOW() - INTERVAL 3 DAY, 250, 14, 72, 240, NULL, NULL, TRUE, @a2);
CALL t_check('Apheresis: allowed again after 72 hours', @a2 IS NOT NULL, CONCAT('donation ', @a2));
CALL t_expect_error('Apheresis: at most 2 procedures in 7 days',
  CONCAT("CALL sp_record_donation(", @aph, ", 'plateletpheresis', 'BB2026900026', NOW() - INTERVAL 1 DAY, 250, 14, 72, 240, NULL, NULL, TRUE, @x)"),
  'at most 2');
CALL t_expect_error('Gap: apheresis -> whole blood needs 28 days',
  CONCAT("CALL sp_record_donation(", @aph, ", 'whole_blood', 'BB2026900027', NOW(), 450, 14, 72, NULL, NULL, NULL, TRUE, @x)"),
  'not eligible for whole blood until');

-- 6. Data integrity after donations ---------------------------------------------------------
CALL t_expect_error('Blood group cannot be changed once donations exist',
  CONCAT("UPDATE donor SET blood_group = 'A+' WHERE donor_id = ", @male), 'cannot change after donations');
SELECT weight_kg INTO @w FROM donor WHERE donor_id = @male;
CALL t_check('Donor weight is refreshed from the latest donation', @w = 70.0, CAST(@w AS CHAR));

-- 7. Paediatric aliquots: a third level in the lineage ------------------------------------------
SELECT unit_id INTO @rbc FROM blood_component WHERE donation_id = @d1 AND component_code = 'RBC';
UPDATE blood_component SET status = 'available', expires_at = NOW() + INTERVAL 10 DAY WHERE unit_id = @rbc;
CALL t_expect_error('Aliquots: 5 parts is rejected (2-4 allowed)',
  CONCAT("CALL sp_split_paediatric(", @rbc, ", 5, @x)"), '2-4 aliquots');
CALL sp_split_paediatric(@rbc, 4, @p1);
SELECT COUNT(*), MIN(volume_ml), MAX(expires_at) INTO @n, @v, @e FROM blood_component c
  JOIN unit_lineage l ON l.child_unit_id = c.unit_id WHERE l.parent_unit_id = @rbc AND c.component_code = 'PAED';
SELECT expires_at INTO @pe FROM blood_component WHERE unit_id = @rbc;
CALL t_check('Split creates 4 paediatric aliquots that keep the parent expiry', @n = 4 AND @e = @pe, CONCAT(@n, ' aliquots of ', @v, ' ml'));
SELECT status INTO @s FROM blood_component WHERE unit_id = @rbc;
CALL t_check('Split parent is marked processed', @s = 'processed', @s);
CALL t_expect_error('Aliquots: an already-split unit cannot be split again',
  CONCAT("CALL sp_split_paediatric(", @rbc, ", 2, @x)"), 'available, unexpired');
CALL t_expect_error('Aliquots: only red cell units can be split',
  CONCAT("CALL sp_split_paediatric(", @p1, ", 2, @x)"), 'Only packed red cell');

-- 8. Platelet pools: one unit with several parents (several donors) --------------------------------
CALL sp_record_donation((SELECT donor_id FROM donor WHERE phone = '+9100000011'), 'whole_blood', 'BB2026900031', NOW() - INTERVAL 1 DAY, 450, 14, 70, NULL, NULL, NULL, TRUE, @x);
CALL sp_record_donation((SELECT donor_id FROM donor WHERE phone = '+9100000012'), 'whole_blood', 'BB2026900032', NOW() - INTERVAL 1 DAY, 450, 14, 70, NULL, NULL, NULL, TRUE, @x);
CALL sp_record_donation((SELECT donor_id FROM donor WHERE phone = '+9100000013'), 'whole_blood', 'BB2026900033', NOW() - INTERVAL 1 DAY, 450, 14, 70, NULL, NULL, NULL, TRUE, @x);
CALL sp_record_donation((SELECT donor_id FROM donor WHERE phone = '+9100000014'), 'whole_blood', 'BB2026900034', NOW() - INTERVAL 1 DAY, 450, 14, 70, NULL, NULL, NULL, TRUE, @x);
CALL sp_record_donation((SELECT donor_id FROM donor WHERE phone = '+9100000015'), 'whole_blood', 'BB2026900035', NOW() - INTERVAL 1 DAY, 450, 14, 70, NULL, NULL, NULL, TRUE, @x);
UPDATE blood_component SET status = 'available' WHERE unit_code IN
  ('BB2026900031-PLT', 'BB2026900032-PLT', 'BB2026900033-PLT', 'BB2026900034-PLT', 'BB2026900035-PLT');
SELECT JSON_ARRAYAGG(unit_id) INTO @four FROM blood_component
 WHERE unit_code IN ('BB2026900031-PLT', 'BB2026900032-PLT', 'BB2026900033-PLT', 'BB2026900034-PLT');
SELECT JSON_ARRAYAGG(unit_id) INTO @mixed FROM blood_component
 WHERE unit_code IN ('BB2026900031-PLT', 'BB2026900032-PLT', 'BB2026900033-PLT', 'BB2026900035-PLT');
CALL t_expect_error('Pool: fewer than 4 units is rejected',
  "CALL sp_pool_platelets(JSON_ARRAY(1, 2, 3), @x)", '4-6 units');
CALL t_expect_error('Pool: mixed blood groups are rejected',
  CONCAT("CALL sp_pool_platelets('", @mixed, "', @x)"), 'same blood group');
CALL sp_pool_platelets(@four, @pool);
SELECT COUNT(DISTINCT dn.donor_id) INTO @n FROM unit_lineage l
  JOIN blood_component p ON p.unit_id = l.parent_unit_id
  JOIN donation dn ON dn.donation_id = p.donation_id
 WHERE l.child_unit_id = @pool;
CALL t_check('Pool has 4 parents from 4 different donors', @n = 4, CONCAT(@n, ' donors'));
SELECT donation_id IS NULL INTO @b FROM blood_component WHERE unit_id = @pool;
CALL t_check('Pool has no single donation_id (only reachable through the lineage)', @b = 1, CAST(@b AS CHAR));
CALL t_expect_error('Pool: a source already used in a pool cannot be pooled again',
  CONCAT("CALL sp_pool_platelets('", @four, "', @x)"), 'available, unexpired');
CALL t_expect_error('Pool: a unit with no donation must be a pool (CHECK)',
  "INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml, collected_at, expires_at)
   VALUES ('X1', NULL, 'RBC', 'O+', 200, NOW(), NOW() + INTERVAL 1 DAY)", 'chk_unit_pool_has_no_donation');
-- Forward trace from one donor reaches the pool through the lineage graph (what safety recall does).
WITH RECURSIVE tree AS (
    SELECT u.unit_id FROM blood_component u JOIN donation dn ON dn.donation_id = u.donation_id
     WHERE dn.bag_number = 'BB2026900031'
    UNION
    SELECT l.child_unit_id FROM tree t JOIN unit_lineage l ON l.parent_unit_id = t.unit_id
)
SELECT COUNT(*) INTO @n FROM tree WHERE unit_id = @pool;
CALL t_check('Recursive trace from one donor reaches the pooled unit', @n = 1, CONCAT(@n, ' match'));

-- 9. Recall: a donation within 14 days of a call closes it as "donated" ---------------------
INSERT INTO recall_contact (donor_id, blood_group, contacted_at) VALUES (@light, 'O+', NOW() - INTERVAL 2 DAY);
SET @contact = LAST_INSERT_ID();
CALL sp_record_donation(@light, 'whole_blood', 'BB2026900040', NOW(), 350, 13.1, 48, NULL, NULL, NULL, TRUE, @x);
SELECT outcome INTO @o FROM recall_contact WHERE contact_id = @contact;
CALL t_check('Recall call is marked donated by the donation trigger', @o = 'donated', @o);
CALL t_expect_error('Recall outcome other than pending needs a response time (CHECK)',
  CONCAT("UPDATE recall_contact SET outcome = 'declined', responded_at = NULL WHERE contact_id = ", @contact),
  'chk_recall_response');

-- 10. Expiry on read and forecast views ------------------------------------------------------
SELECT unit_id INTO @u FROM blood_component WHERE unit_code = 'BB2026900035-PLT';
UPDATE blood_component SET collected_at = NOW() - INTERVAL 10 DAY, expires_at = NOW() - INTERVAL 1 HOUR WHERE unit_id = @u;
SELECT CONCAT(status, ' -> ', effective_status) INTO @s FROM v_unit_status WHERE unit_id = @u;
CALL t_check('Expired unit still marked available counts as expired on read (no Event Scheduler needed)',
  @s = 'available -> expired', @s);
SELECT COUNT(*) INTO @n FROM v_current_stock;
CALL t_check('Stock view has every group x component (8 x 7 = 56 rows)', @n = 56, CONCAT(@n, ' rows'));
SELECT COUNT(*) INTO @n FROM v_usage_trend WHERE blood_group = 'O+' AND family_code = 'RBC';
CALL t_check('Usage trend has one row per day for 120 days (zero days included)', @n = 120, CONCAT(@n, ' rows'));
SELECT COUNT(*) INTO @n FROM v_shortage_forecast
 WHERE (days_of_stock < critical_days AND stock_status <> 'critical')
    OR (days_of_stock >= low_days AND stock_status <> 'ok');
CALL t_check('Forecast status matches the family thresholds', @n = 0, CONCAT(@n, ' mismatches'));

-- Results ------------------------------------------------------------------------------------
CALL t_cleanup();
DROP PROCEDURE t_expect_error;
DROP PROCEDURE t_check;
DROP PROCEDURE t_cleanup;

SELECT n AS '#', IF(passed, 'PASS', 'FAIL') AS result, name, detail FROM test_log ORDER BY n;
SELECT CONCAT(SUM(passed), ' / ', COUNT(*), ' passed') AS summary FROM test_log;
