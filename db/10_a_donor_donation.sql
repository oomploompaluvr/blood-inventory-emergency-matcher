-- =====================================================================
-- 10  Member A: donors, donations and blood components
--     Tables, data-driven eligibility rules (rule tables + functions + triggers),
--     procedures that record / separate / split / pool units, and stock views.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Donation types and the rules between them
-- ---------------------------------------------------------------------
-- Eligibility differs by donation type, so the numbers live in tables, not in code.
-- Source: NBTC / NACO "Guidelines for Blood Donor Selection & Blood Donor Referral" (2017).
-- The pre-apheresis platelet count (>= 150 x10^3/uL) is standard apheresis practice; it is not
-- part of the donor-selection summary, so check it with the blood centre.
-- If a guideline changes, change the row - no code changes.
CREATE TABLE donation_type (
    type_code         VARCHAR(16)   PRIMARY KEY,
    name              VARCHAR(40)   NOT NULL UNIQUE,
    min_age           TINYINT       NOT NULL,
    max_age           TINYINT       NOT NULL,
    max_age_first     TINYINT       NOT NULL,      -- oldest age at which a FIRST-time donor is accepted
    min_weight_kg     DECIMAL(4,1)  NOT NULL,
    min_hb_g_dl       DECIMAL(3,1)  NOT NULL,
    min_platelets_k   SMALLINT      NULL,          -- pre-donation platelet count (x10^3/uL), apheresis only
    min_volume_ml     SMALLINT      NOT NULL,
    max_volume_ml     SMALLINT      NOT NULL,
    max_per_7_days    TINYINT       NULL,          -- NULL = no weekly cap
    max_per_365_days  TINYINT       NULL,
    CONSTRAINT chk_type_age    CHECK (min_age >= 18 AND max_age > min_age AND max_age_first BETWEEN min_age AND max_age),
    CONSTRAINT chk_type_volume CHECK (min_volume_ml > 0 AND max_volume_ml >= min_volume_ml)
);

INSERT INTO donation_type VALUES
    ('whole_blood',      'Whole blood',        18, 65, 60, 45.0, 12.5, NULL, 350, 450, NULL, NULL),
    ('plateletpheresis', 'Platelet apheresis', 18, 60, 60, 50.0, 12.5, 150,  150, 500, 2,    24);

-- Minimum gap from a previous donation of one type to the next donation of another type.
CREATE TABLE donation_interval_rule (
    previous_type  VARCHAR(16)       NOT NULL,
    next_type      VARCHAR(16)       NOT NULL,
    gender         ENUM('M','F','O') NOT NULL,
    min_days       SMALLINT          NOT NULL,
    source         VARCHAR(120)      NOT NULL,
    PRIMARY KEY (previous_type, next_type, gender),
    CONSTRAINT fk_rule_prev FOREIGN KEY (previous_type) REFERENCES donation_type (type_code),
    CONSTRAINT fk_rule_next FOREIGN KEY (next_type)     REFERENCES donation_type (type_code),
    CONSTRAINT chk_rule_days CHECK (min_days > 0)
);

INSERT INTO donation_interval_rule VALUES
    ('whole_blood',      'whole_blood',      'M',  90, 'NBTC 2017: whole blood, men 90 days'),
    ('whole_blood',      'whole_blood',      'F', 120, 'NBTC 2017: whole blood, women 120 days'),
    ('whole_blood',      'whole_blood',      'O',  90, 'NBTC 2017: whole blood (non-binary donors treated as men)'),
    ('plateletpheresis', 'plateletpheresis', 'M',   2, 'NBTC 2017: 48 hours between apheresis procedures'),
    ('plateletpheresis', 'plateletpheresis', 'F',   2, 'NBTC 2017: 48 hours between apheresis procedures'),
    ('plateletpheresis', 'plateletpheresis', 'O',   2, 'NBTC 2017: 48 hours between apheresis procedures'),
    ('plateletpheresis', 'whole_blood',      'M',  28, 'NBTC 2017: whole blood not before 28 days after platelet apheresis (red cells reinfused)'),
    ('plateletpheresis', 'whole_blood',      'F',  28, 'NBTC 2017: whole blood not before 28 days after platelet apheresis (red cells reinfused)'),
    ('plateletpheresis', 'whole_blood',      'O',  28, 'NBTC 2017: whole blood not before 28 days after platelet apheresis (red cells reinfused)'),
    ('whole_blood',      'plateletpheresis', 'M',  28, 'NBTC 2017: plateletpheresis not before 28 days after whole blood'),
    ('whole_blood',      'plateletpheresis', 'F',  28, 'NBTC 2017: plateletpheresis not before 28 days after whole blood'),
    ('whole_blood',      'plateletpheresis', 'O',  28, 'NBTC 2017: plateletpheresis not before 28 days after whole blood');


-- ---------------------------------------------------------------------
-- Donors, donations, units
-- ---------------------------------------------------------------------
CREATE TABLE donor (
    donor_id       INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT           NULL UNIQUE,      -- login account, if the donor registered online (FK added in 30_)
    full_name      VARCHAR(100)  NOT NULL,
    gender         ENUM('M','F','O') NOT NULL,
    date_of_birth  DATE          NOT NULL,
    weight_kg      DECIMAL(5,1)  NOT NULL,         -- latest measured weight
    blood_group    VARCHAR(3)    NOT NULL,
    phone          VARCHAR(15)   NOT NULL UNIQUE,
    email          VARCHAR(120)  NULL UNIQUE,
    address_line   VARCHAR(150)  NULL,
    pincode        CHAR(6)       NOT NULL,         -- location used for recall distance
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,   -- FALSE = permanently deferred / opted out
    registered_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_donor_group   FOREIGN KEY (blood_group) REFERENCES blood_group (group_code),
    CONSTRAINT fk_donor_pincode FOREIGN KEY (pincode)     REFERENCES pincode (pincode),
    CONSTRAINT chk_donor_weight CHECK (weight_kg BETWEEN 20 AND 250),
    CONSTRAINT chk_donor_phone  CHECK (REGEXP_LIKE(phone, '^[+]?[0-9]{10,14}$')),
    CONSTRAINT chk_donor_email  CHECK (email IS NULL OR email LIKE '%_@_%._%')
);
CREATE INDEX ix_donor_group ON donor (blood_group, is_active);

CREATE TABLE donation (
    donation_id      INT AUTO_INCREMENT PRIMARY KEY,
    donor_id         INT           NOT NULL,
    donation_type    VARCHAR(16)   NOT NULL DEFAULT 'whole_blood',
    bag_number       VARCHAR(20)   NOT NULL UNIQUE,
    donated_at       DATETIME      NOT NULL,
    volume_ml        SMALLINT      NOT NULL,
    hemoglobin_g_dl  DECIMAL(4,1)  NOT NULL,
    platelet_count_k SMALLINT      NULL,           -- x10^3/uL, measured before apheresis
    weight_kg        DECIMAL(5,1)  NOT NULL,       -- measured on the day
    screening_ref    CHAR(24)      NULL,           -- _id of the MongoDB screening_responses document
    collected_by     INT           NULL,           -- users.user_id of the lab technician (FK added in 30_)
    notes            VARCHAR(255)  NULL,
    CONSTRAINT fk_donation_donor FOREIGN KEY (donor_id)      REFERENCES donor (donor_id),
    CONSTRAINT fk_donation_type  FOREIGN KEY (donation_type) REFERENCES donation_type (type_code),
    CONSTRAINT chk_donation_volume CHECK (volume_ml BETWEEN 100 AND 600),
    CONSTRAINT chk_donation_hb     CHECK (hemoglobin_g_dl BETWEEN 3 AND 25),
    CONSTRAINT chk_donation_plt    CHECK (platelet_count_k IS NULL OR platelet_count_k BETWEEN 10 AND 1500),
    CONSTRAINT chk_donation_weight CHECK (weight_kg BETWEEN 20 AND 250)
);
CREATE INDEX ix_donation_donor_date ON donation (donor_id, donated_at);
CREATE INDEX ix_donation_date ON donation (donated_at);

-- One row per physical bag. Pooled platelets come from several donations, so they have no
-- single donation_id; where every unit came from is recorded in unit_lineage instead.
CREATE TABLE blood_component (
    unit_id            INT AUTO_INCREMENT PRIMARY KEY,
    unit_code          VARCHAR(40)  NOT NULL UNIQUE,     -- printed on the label
    donation_id        INT          NULL,                -- NULL only for pooled units
    component_code     VARCHAR(4)   NOT NULL,
    blood_group        VARCHAR(3)   NOT NULL,
    volume_ml          SMALLINT     NOT NULL,
    collected_at       DATETIME     NOT NULL,            -- when this bag was made
    expires_at         DATETIME     NOT NULL,
    status             ENUM('collected','testing','available','reserved','issued',
                            'discarded','expired','processed') NOT NULL DEFAULT 'collected',
    status_changed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_unit_donation  FOREIGN KEY (donation_id)    REFERENCES donation (donation_id),
    CONSTRAINT fk_unit_component FOREIGN KEY (component_code) REFERENCES component_type (component_code),
    CONSTRAINT fk_unit_group     FOREIGN KEY (blood_group)    REFERENCES blood_group (group_code),
    CONSTRAINT chk_unit_volume   CHECK (volume_ml > 0),
    CONSTRAINT chk_unit_expiry   CHECK (expires_at > collected_at),
    CONSTRAINT chk_unit_pool_has_no_donation CHECK ((donation_id IS NULL) = (component_code = 'PPLT'))
);
CREATE INDEX ix_unit_stock ON blood_component (status, blood_group, component_code, expires_at);

-- Parent -> child edges between units. A graph, not a tree:
--   whole blood  -> red cells / plasma / platelets      (separation)
--   red cells    -> 2-4 paediatric aliquots             (sp_split_paediatric)
--   4-6 platelet units from different donors -> 1 pool  (sp_pool_platelets: several parents)
-- Tracing a donor forward therefore needs a recursive query over this table.
CREATE TABLE unit_lineage (
    parent_unit_id  INT  NOT NULL,
    child_unit_id   INT  NOT NULL,
    PRIMARY KEY (parent_unit_id, child_unit_id),
    CONSTRAINT fk_lineage_parent FOREIGN KEY (parent_unit_id) REFERENCES blood_component (unit_id),
    CONSTRAINT fk_lineage_child  FOREIGN KEY (child_unit_id)  REFERENCES blood_component (unit_id),
    CONSTRAINT chk_lineage_not_self CHECK (parent_unit_id <> child_unit_id)
);
CREATE INDEX ix_lineage_child ON unit_lineage (child_unit_id);

-- Donor recall: every time staff contact a donor during a shortage.
CREATE TABLE recall_contact (
    contact_id    INT AUTO_INCREMENT PRIMARY KEY,
    donor_id      INT          NOT NULL,
    blood_group   VARCHAR(3)   NOT NULL,             -- group that was short when the donor was called
    donation_type VARCHAR(16)  NOT NULL DEFAULT 'whole_blood',
    contacted_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    contacted_by  INT          NULL,                 -- users.user_id (FK added in 30_)
    channel       ENUM('call','sms','email') NOT NULL DEFAULT 'call',
    outcome       ENUM('pending','donated','declined','no_response') NOT NULL DEFAULT 'pending',
    responded_at  DATETIME     NULL,
    CONSTRAINT fk_recall_donor FOREIGN KEY (donor_id)      REFERENCES donor (donor_id),
    CONSTRAINT fk_recall_group FOREIGN KEY (blood_group)   REFERENCES blood_group (group_code),
    CONSTRAINT fk_recall_type  FOREIGN KEY (donation_type) REFERENCES donation_type (type_code),
    CONSTRAINT chk_recall_response CHECK (outcome = 'pending' OR responded_at IS NOT NULL)
);
CREATE INDEX ix_recall_donor ON recall_contact (donor_id, contacted_at);

-- Raw CSV rows from the paper register, imported once; dropped in 35_a_migration.sql.
CREATE TABLE donor_import_staging (
    row_no       INT AUTO_INCREMENT PRIMARY KEY,
    raw_name     VARCHAR(200),
    raw_phone    VARCHAR(40),
    raw_group    VARCHAR(10),
    raw_dob      VARCHAR(20),
    imported_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);


DELIMITER //

-- ---------------------------------------------------------------------
-- Eligibility functions (used by the trigger, views and donor recall)
-- ---------------------------------------------------------------------

-- Earliest moment the donor may make a donation of p_type, from every earlier donation of any type
-- and the interval rules. NULL if nothing in their history restricts it.
CREATE FUNCTION fn_next_eligible_at(p_donor_id INT, p_type VARCHAR(16), p_before DATETIME)
RETURNS DATETIME READS SQL DATA
BEGIN
    DECLARE v_at DATETIME;
    SELECT MAX(d.donated_at + INTERVAL r.min_days DAY) INTO v_at
    FROM donation d
    JOIN donor dn ON dn.donor_id = d.donor_id
    JOIN donation_interval_rule r
      ON r.previous_type = d.donation_type AND r.next_type = p_type AND r.gender = dn.gender
    WHERE d.donor_id = p_donor_id AND d.donated_at <= p_before;
    RETURN v_at;
END //

-- Calendar date shown to people: today if they may donate now.
CREATE FUNCTION fn_next_eligible_date(p_donor_id INT, p_type VARCHAR(16))
RETURNS DATE READS SQL DATA
BEGIN
    RETURN GREATEST(CURDATE(), COALESCE(DATE(fn_next_eligible_at(p_donor_id, p_type, NOW())), CURDATE()));
END //

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- Date of birth cannot be checked with CHECK (CURDATE() is not allowed there).
CREATE TRIGGER trg_donor_bi BEFORE INSERT ON donor FOR EACH ROW
BEGIN
    IF NEW.date_of_birth > CURDATE() THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Date of birth cannot be in the future';
    END IF;
    IF TIMESTAMPDIFF(YEAR, NEW.date_of_birth, CURDATE()) < 16 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donors must be at least 16 to register';
    END IF;
END //

CREATE TRIGGER trg_donor_bu BEFORE UPDATE ON donor FOR EACH ROW
BEGIN
    IF NEW.date_of_birth > CURDATE() THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Date of birth cannot be in the future';
    END IF;
    IF NEW.blood_group <> OLD.blood_group
       AND EXISTS (SELECT 1 FROM donation WHERE donor_id = OLD.donor_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Blood group cannot change after donations exist; correct it through a lab re-test';
    END IF;
END //

-- The core rule: a donation is rejected inside the database if the donor is not eligible for
-- that type of donation. Every limit comes from donation_type / donation_interval_rule.
CREATE TRIGGER trg_donation_eligibility BEFORE INSERT ON donation FOR EACH ROW
BEGIN
    DECLARE v_dob DATE;
    DECLARE v_gender CHAR(1);
    DECLARE v_active BOOLEAN;
    DECLARE v_age INT;
    DECLARE v_min_age, v_max_age, v_max_first, v_cap7, v_cap365 TINYINT;
    DECLARE v_min_wt DECIMAL(4,1);
    DECLARE v_min_hb DECIMAL(3,1);
    DECLARE v_min_plt, v_min_vol, v_max_vol SMALLINT;
    DECLARE v_type_name VARCHAR(40);
    DECLARE v_next DATETIME;
    DECLARE v_later DATETIME;
    DECLARE v_count INT;
    DECLARE v_msg VARCHAR(255);

    SELECT date_of_birth, gender, is_active INTO v_dob, v_gender, v_active
    FROM donor WHERE donor_id = NEW.donor_id;
    IF v_dob IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor not eligible: donor does not exist';
    END IF;
    IF NOT v_active THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor not eligible: donor is deactivated / permanently deferred';
    END IF;
    IF NEW.donated_at > NOW() + INTERVAL 5 MINUTE THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donation time cannot be in the future';
    END IF;

    SELECT name, min_age, max_age, max_age_first, min_weight_kg, min_hb_g_dl, min_platelets_k, min_volume_ml,
           max_volume_ml, max_per_7_days, max_per_365_days
      INTO v_type_name, v_min_age, v_max_age, v_max_first, v_min_wt, v_min_hb, v_min_plt, v_min_vol,
           v_max_vol, v_cap7, v_cap365
    FROM donation_type WHERE type_code = NEW.donation_type;

    -- Age, weight, haemoglobin, platelet count, volume: limits depend on the donation type.
    SET v_age = TIMESTAMPDIFF(YEAR, v_dob, DATE(NEW.donated_at));
    IF v_age NOT BETWEEN v_min_age AND v_max_age THEN
        SET v_msg = CONCAT('Donor not eligible: age ', v_age, ' is outside ', v_min_age, '-', v_max_age,
                           ' for ', LOWER(v_type_name));
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
    IF v_age > v_max_first AND NOT EXISTS (SELECT 1 FROM donation WHERE donor_id = NEW.donor_id) THEN
        SET v_msg = CONCAT('Donor not eligible: first-time donors must be ', v_max_first, ' or younger (age ', v_age, ')');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
    IF NEW.weight_kg < v_min_wt THEN
        SET v_msg = CONCAT('Donor not eligible: weight ', NEW.weight_kg, ' kg is below ', v_min_wt,
                           ' kg for ', LOWER(v_type_name));
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
    IF NEW.hemoglobin_g_dl < v_min_hb THEN
        SET v_msg = CONCAT('Donor not eligible: haemoglobin ', NEW.hemoglobin_g_dl, ' g/dL is below ', v_min_hb);
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
    IF v_min_plt IS NOT NULL AND (NEW.platelet_count_k IS NULL OR NEW.platelet_count_k < v_min_plt) THEN
        SET v_msg = CONCAT('Donor not eligible: platelet count must be at least ', v_min_plt, ' x10^3/uL for apheresis');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
    IF NEW.volume_ml NOT BETWEEN v_min_vol AND v_max_vol THEN
        SET v_msg = CONCAT('Volume must be ', v_min_vol, '-', v_max_vol, ' ml for ', LOWER(v_type_name));
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;
    IF NEW.donation_type = 'whole_blood' THEN
        IF NEW.volume_ml NOT IN (350, 450) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Whole blood bags are 350 ml or 450 ml';
        END IF;
        IF NEW.volume_ml = 450 AND NEW.weight_kg < 55 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Donor not eligible: 450 ml bags need at least 55 kg; use a 350 ml bag';
        END IF;
    END IF;

    -- Gap after earlier donations of any type (rule table, by sex and by type pair).
    SET v_next = fn_next_eligible_at(NEW.donor_id, NEW.donation_type, NEW.donated_at);
    IF v_next IS NOT NULL AND NEW.donated_at < v_next THEN
        SET v_msg = CONCAT('Donor not eligible for ', LOWER(v_type_name), ' until ',
                           DATE_FORMAT(v_next, '%Y-%m-%d %H:%i'), ' (minimum gap after their last donation)');
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;

    -- Back-dated entries must not break the gap before a donation already on record either.
    SELECT MIN(d.donated_at) INTO v_later
    FROM donation d
    JOIN donation_interval_rule r
      ON r.previous_type = NEW.donation_type AND r.next_type = d.donation_type AND r.gender = v_gender
    WHERE d.donor_id = NEW.donor_id
      AND d.donated_at > NEW.donated_at
      AND d.donated_at < NEW.donated_at + INTERVAL r.min_days DAY;
    IF v_later IS NOT NULL THEN
        SET v_msg = CONCAT('Donor not eligible: too close to their donation on ', DATE(v_later));
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
    END IF;

    -- Frequency caps (apheresis: at most 2 a week and 24 a year).
    IF v_cap7 IS NOT NULL THEN
        SELECT COUNT(*) INTO v_count FROM donation
        WHERE donor_id = NEW.donor_id AND donation_type = NEW.donation_type
          AND donated_at > NEW.donated_at - INTERVAL 7 DAY AND donated_at <= NEW.donated_at;
        IF v_count >= v_cap7 THEN
            SET v_msg = CONCAT('Donor not eligible: at most ', v_cap7, ' ', LOWER(v_type_name), ' donations in 7 days');
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
        END IF;
    END IF;
    IF v_cap365 IS NOT NULL THEN
        SELECT COUNT(*) INTO v_count FROM donation
        WHERE donor_id = NEW.donor_id AND donation_type = NEW.donation_type
          AND donated_at > NEW.donated_at - INTERVAL 365 DAY AND donated_at <= NEW.donated_at;
        IF v_count >= v_cap365 THEN
            SET v_msg = CONCAT('Donor not eligible: at most ', v_cap365, ' ', LOWER(v_type_name), ' donations in a year');
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_msg;
        END IF;
    END IF;
END //

-- After a donation: refresh the donor's recorded weight and close any open recall call
-- that this donation answered (this is what the recall reliability score is built on).
CREATE TRIGGER trg_donation_ai AFTER INSERT ON donation FOR EACH ROW
BEGIN
    UPDATE donor SET weight_kg = NEW.weight_kg WHERE donor_id = NEW.donor_id;

    UPDATE recall_contact
       SET outcome = 'donated', responded_at = NEW.donated_at
     WHERE donor_id = NEW.donor_id
       AND outcome IN ('pending', 'no_response')
       AND NEW.donated_at BETWEEN contacted_at AND contacted_at + INTERVAL 14 DAY;
END //

-- Keep status_changed_at honest for every status change (used for audit and the lab queue),
-- unless the statement sets it explicitly (e.g. back-filling history).
CREATE TRIGGER trg_unit_status_time BEFORE UPDATE ON blood_component FOR EACH ROW
BEGIN
    IF NEW.status <> OLD.status AND NEW.status_changed_at <=> OLD.status_changed_at THEN
        SET NEW.status_changed_at = NOW();
    END IF;
END //

-- ---------------------------------------------------------------------
-- Procedure: record a donation (and separate whole blood into components)
-- ---------------------------------------------------------------------
-- All-or-nothing: if the eligibility trigger rejects the donation, or any unit insert
-- fails, nothing is written. p_donated_at NULL means "now".
CREATE PROCEDURE sp_record_donation(
    IN  p_donor_id       INT,
    IN  p_type           VARCHAR(16),
    IN  p_bag_number     VARCHAR(20),
    IN  p_donated_at     DATETIME,
    IN  p_volume_ml      SMALLINT,
    IN  p_hemoglobin     DECIMAL(4,1),
    IN  p_weight_kg      DECIMAL(5,1),
    IN  p_platelets_k    SMALLINT,
    IN  p_screening_ref  CHAR(24),
    IN  p_collected_by   INT,
    IN  p_separate       BOOLEAN,
    OUT p_donation_id    INT
)
BEGIN
    DECLARE v_group VARCHAR(3);
    DECLARE v_at DATETIME DEFAULT COALESCE(p_donated_at, NOW());
    DECLARE v_wb_id INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    INSERT INTO donation (donor_id, donation_type, bag_number, donated_at, volume_ml, hemoglobin_g_dl,
                          platelet_count_k, weight_kg, screening_ref, collected_by)
    VALUES (p_donor_id, p_type, p_bag_number, v_at, p_volume_ml, p_hemoglobin,
            p_platelets_k, p_weight_kg, p_screening_ref, p_collected_by);
    SET p_donation_id = LAST_INSERT_ID();

    SELECT blood_group INTO v_group FROM donor WHERE donor_id = p_donor_id;

    IF p_type = 'plateletpheresis' THEN
        -- Apheresis collects platelets directly: one single-donor platelet unit, nothing to separate.
        INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml,
                                     collected_at, expires_at)
        SELECT CONCAT(p_bag_number, '-SDP'), p_donation_id, 'SDP', v_group, p_volume_ml,
               v_at, v_at + INTERVAL shelf_life_days DAY
        FROM component_type WHERE component_code = 'SDP';
    ELSE
        INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml,
                                     collected_at, expires_at, status)
        SELECT CONCAT(p_bag_number, '-WB'), p_donation_id, 'WB', v_group, p_volume_ml,
               v_at, v_at + INTERVAL shelf_life_days DAY, IF(p_separate, 'processed', 'collected')
        FROM component_type WHERE component_code = 'WB';
        SET v_wb_id = LAST_INSERT_ID();

        IF p_separate THEN
            INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml,
                                         collected_at, expires_at)
            SELECT CONCAT(p_bag_number, '-', component_code), p_donation_id, component_code, v_group,
                   ROUND(p_volume_ml * volume_ratio), v_at, v_at + INTERVAL shelf_life_days DAY
            FROM component_type
            WHERE component_code IN ('RBC', 'FFP', 'PLT');

            INSERT INTO unit_lineage (parent_unit_id, child_unit_id)
            SELECT v_wb_id, unit_id FROM blood_component
            WHERE donation_id = p_donation_id AND unit_id <> v_wb_id;
        END IF;
    END IF;

    COMMIT;
END //

-- ---------------------------------------------------------------------
-- Procedure: split a red cell unit into paediatric aliquots
-- ---------------------------------------------------------------------
-- Neonates need small volumes; splitting one adult unit (with a sterile connecting device)
-- lets several transfusions for the same baby come from ONE donor. Aliquots keep the parent's
-- expiry. The parent row is locked so two technicians cannot split the same bag.
CREATE PROCEDURE sp_split_paediatric(IN p_unit_id INT, IN p_parts TINYINT, OUT p_first_child INT)
BEGIN
    DECLARE v_component VARCHAR(4);
    DECLARE v_status VARCHAR(12);
    DECLARE v_volume SMALLINT;
    DECLARE v_expires DATETIME;
    DECLARE v_group VARCHAR(3);
    DECLARE v_code VARCHAR(40);
    DECLARE v_donation INT;
    DECLARE i TINYINT DEFAULT 1;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;
    SELECT component_code, status, volume_ml, expires_at, blood_group, unit_code, donation_id
      INTO v_component, v_status, v_volume, v_expires, v_group, v_code, v_donation
    FROM blood_component WHERE unit_id = p_unit_id
    FOR UPDATE;

    IF v_component IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unit not found';
    END IF;
    IF v_component <> 'RBC' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only packed red cell units can be split into paediatric aliquots';
    END IF;
    IF v_status <> 'available' OR v_expires <= NOW() THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only an available, unexpired unit can be split';
    END IF;
    IF p_parts NOT BETWEEN 2 AND 4 OR v_volume / p_parts < 50 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Split into 2-4 aliquots of at least 50 ml each';
    END IF;

    WHILE i <= p_parts DO
        INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml,
                                     collected_at, expires_at, status)
        VALUES (CONCAT(v_code, '-P', i), v_donation, 'PAED', v_group, FLOOR(v_volume / p_parts),
                NOW(), v_expires, 'available');
        INSERT INTO unit_lineage (parent_unit_id, child_unit_id) VALUES (p_unit_id, LAST_INSERT_ID());
        IF i = 1 THEN SET p_first_child = LAST_INSERT_ID(); END IF;
        SET i = i + 1;
    END WHILE;

    UPDATE blood_component SET status = 'processed' WHERE unit_id = p_unit_id;
    COMMIT;
END //

-- ---------------------------------------------------------------------
-- Procedure: pool 4-6 random-donor platelet units into one adult dose
-- ---------------------------------------------------------------------
-- The pool has several parents (one per donor), so it is linked through unit_lineage only.
-- It expires with its earliest-expiring source.  p_unit_ids is a JSON array, e.g. '[12, 15, 19, 22]'.
CREATE PROCEDURE sp_pool_platelets(IN p_unit_ids JSON, OUT p_pool_id INT)
BEGIN
    DECLARE v_n INT DEFAULT JSON_LENGTH(p_unit_ids);
    DECLARE v_found, v_distinct_ids, v_groups, v_usable INT;
    DECLARE v_group VARCHAR(3);
    DECLARE v_expires DATETIME;
    DECLARE v_volume INT;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF v_n IS NULL OR v_n NOT BETWEEN 4 AND 6 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'A platelet pool needs 4-6 units';
    END IF;

    START TRANSACTION;
    -- Lock the source bags for the rest of the transaction.
    SELECT COUNT(*), COUNT(DISTINCT blood_group), MIN(blood_group), MIN(expires_at), SUM(volume_ml),
           SUM(component_code = 'PLT' AND status = 'available' AND expires_at > NOW())
      INTO v_found, v_groups, v_group, v_expires, v_volume, v_usable
    FROM blood_component
    WHERE unit_id IN (SELECT id FROM JSON_TABLE(p_unit_ids, '$[*]' COLUMNS (id INT PATH '$')) j)
    FOR UPDATE;

    SELECT COUNT(DISTINCT id) INTO v_distinct_ids
    FROM JSON_TABLE(p_unit_ids, '$[*]' COLUMNS (id INT PATH '$')) j;

    IF v_distinct_ids <> v_n OR v_found <> v_n THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Pool sources must be distinct, existing units';
    END IF;
    IF v_usable <> v_n THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Every source must be an available, unexpired random-donor platelet unit';
    END IF;
    IF v_groups <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'All platelet units in a pool must have the same blood group';
    END IF;

    INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml,
                                 collected_at, expires_at, status)
    VALUES (CONCAT('TMP', REPLACE(UUID(), '-', '')), NULL, 'PPLT', v_group, v_volume, NOW(), v_expires, 'available');
    SET p_pool_id = LAST_INSERT_ID();
    UPDATE blood_component SET unit_code = CONCAT('POOL', DATE_FORMAT(NOW(), '%Y'), LPAD(p_pool_id, 7, '0'))
    WHERE unit_id = p_pool_id;

    INSERT INTO unit_lineage (parent_unit_id, child_unit_id)
    SELECT id, p_pool_id FROM JSON_TABLE(p_unit_ids, '$[*]' COLUMNS (id INT PATH '$')) j;

    UPDATE blood_component SET status = 'processed'
    WHERE unit_id IN (SELECT id FROM JSON_TABLE(p_unit_ids, '$[*]' COLUMNS (id INT PATH '$')) j);
    COMMIT;
END //

DELIMITER ;


-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------

-- Per donor: age, last donation and next eligible date for each donation type.
CREATE VIEW v_donor_eligibility AS
SELECT d.donor_id,
       d.full_name,
       d.gender,
       d.blood_group,
       d.pincode,
       p.area,
       p.city,
       d.weight_kg,
       d.is_active,
       TIMESTAMPDIFF(YEAR, d.date_of_birth, CURDATE())                   AS age,
       stats.last_donation_at,
       COALESCE(stats.total_donations, 0)                                AS total_donations,
       fn_next_eligible_date(d.donor_id, 'whole_blood')                  AS next_whole_blood_date,
       fn_next_eligible_date(d.donor_id, 'plateletpheresis')             AS next_apheresis_date,
       (d.is_active
        AND TIMESTAMPDIFF(YEAR, d.date_of_birth, CURDATE()) BETWEEN wb.min_age
            AND IF(stats.total_donations IS NULL, wb.max_age_first, wb.max_age)
        AND d.weight_kg >= wb.min_weight_kg
        AND fn_next_eligible_date(d.donor_id, 'whole_blood') <= CURDATE())        AS eligible_now,
       (d.is_active
        AND TIMESTAMPDIFF(YEAR, d.date_of_birth, CURDATE()) BETWEEN ap.min_age
            AND IF(stats.total_donations IS NULL, ap.max_age_first, ap.max_age)
        AND d.weight_kg >= ap.min_weight_kg
        AND fn_next_eligible_date(d.donor_id, 'plateletpheresis') <= CURDATE())   AS apheresis_eligible_now
FROM donor d
JOIN pincode p ON p.pincode = d.pincode
JOIN donation_type wb ON wb.type_code = 'whole_blood'
JOIN donation_type ap ON ap.type_code = 'plateletpheresis'
LEFT JOIN (SELECT donor_id, MAX(donated_at) AS last_donation_at, COUNT(*) AS total_donations
           FROM donation GROUP BY donor_id) stats ON stats.donor_id = d.donor_id;

-- Expiry on read: a unit past its expiry time counts as expired here even if the nightly expiry
-- job (Member B's MySQL event) has not run — e.g. on hosts where the Event Scheduler is disabled.
-- Everything that counts stock reads this view, never the raw status column.
CREATE VIEW v_unit_status AS
SELECT u.*,
       CASE WHEN u.status IN ('collected', 'testing', 'available', 'reserved') AND u.expires_at <= NOW()
            THEN 'expired' ELSE u.status END                              AS effective_status
FROM blood_component u;

-- Current usable stock for every blood group x component (zeros included).
CREATE VIEW v_current_stock AS
SELECT g.group_code                                                       AS blood_group,
       ct.component_code,
       ct.family_code,
       COUNT(u.unit_id)                                                   AS units_available,
       COALESCE(SUM(u.volume_ml), 0)                                      AS volume_ml,
       COALESCE(SUM(u.expires_at < NOW() + INTERVAL 3 DAY), 0)            AS expiring_in_3_days,
       MIN(u.expires_at)                                                  AS earliest_expiry
FROM blood_group g
CROSS JOIN component_type ct
LEFT JOIN v_unit_status u
       ON u.blood_group = g.group_code
      AND u.component_code = ct.component_code
      AND u.effective_status = 'available'
GROUP BY g.group_code, ct.component_code, ct.family_code;
