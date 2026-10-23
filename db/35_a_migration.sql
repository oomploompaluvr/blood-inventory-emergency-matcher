-- =====================================================================
-- 35  Member A: schema evolution (ALTER + DROP)
--     Changes made after the first version of the schema was in use.
-- =====================================================================

-- ALTER 1: donors asked to be contacted on their preferred channel during recalls.
ALTER TABLE donor
    ADD COLUMN preferred_channel ENUM('call','sms','email') NOT NULL DEFAULT 'call' AFTER email;

-- ALTER 2: bag numbers follow the printed label format "BB" + year + 6 digits (e.g. BB2026000123).
ALTER TABLE donation
    ADD CONSTRAINT chk_bag_number_format CHECK (REGEXP_LIKE(bag_number, '^BB[0-9]{4}[0-9]{6}$'));

-- DROP: the staging table was only needed for the one-time import of the paper register.
DROP TABLE IF EXISTS donor_import_staging;
