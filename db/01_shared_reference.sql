-- =====================================================================
-- 01  Shared reference data (finalised together by Member A and Member B)
--     Small lookup tables every other module points at.
-- =====================================================================

CREATE TABLE blood_group (
    group_code  VARCHAR(3)              PRIMARY KEY,
    abo         ENUM('A','B','AB','O')  NOT NULL,
    rh          ENUM('+','-')           NOT NULL,
    population_share_pct DECIMAL(4,1)   NOT NULL,       -- approx. share in India, used for seed realism
    CONSTRAINT uq_blood_group UNIQUE (abo, rh),
    CONSTRAINT chk_group_code CHECK (group_code = CONCAT(abo, rh))
);

INSERT INTO blood_group (group_code, abo, rh, population_share_pct) VALUES
    ('O+','O','+',35.0), ('B+','B','+',30.0), ('A+','A','+',21.0), ('AB+','AB','+',8.0),
    ('O-','O','-', 2.0), ('B-','B','-', 2.0), ('A-','A','-', 1.0), ('AB-','AB','-',1.0);

-- What hospitals ask for and what the shortage forecast tracks. Several physical component
-- types can satisfy one family (e.g. a platelet dose can be a random-donor unit, an apheresis
-- unit or a pool). low_days / critical_days colour the forecast dashboard.
CREATE TABLE stock_family (
    family_code    VARCHAR(4)    PRIMARY KEY,
    name           VARCHAR(40)   NOT NULL UNIQUE,
    low_days       DECIMAL(4,1)  NOT NULL,
    critical_days  DECIMAL(4,1)  NOT NULL,
    CONSTRAINT chk_family_thresholds CHECK (critical_days > 0 AND low_days > critical_days)
);

INSERT INTO stock_family VALUES
    ('RBC', 'Red cells', 7, 3),
    ('PLT', 'Platelets', 2, 1),
    ('FFP', 'Plasma',   14, 5);

-- Physical component types. family_code NULL = not forecast (whole blood is separated before use;
-- paediatric aliquots are reserved for neonates).
CREATE TABLE component_type (
    component_code   VARCHAR(4)   PRIMARY KEY,
    name             VARCHAR(40)  NOT NULL UNIQUE,
    family_code      VARCHAR(4)   NULL,
    shelf_life_days  SMALLINT     NOT NULL,
    storage          VARCHAR(40)  NOT NULL,
    volume_ratio     DECIMAL(3,2) NULL,           -- share of a whole-blood donation it gets when separated
    CONSTRAINT fk_component_family FOREIGN KEY (family_code) REFERENCES stock_family (family_code),
    CONSTRAINT chk_shelf_life    CHECK (shelf_life_days > 0),
    CONSTRAINT chk_volume_ratio  CHECK (volume_ratio IS NULL OR (volume_ratio > 0 AND volume_ratio <= 1))
);

INSERT INTO component_type VALUES
    ('WB',   'Whole blood',                 NULL,   35, '2-6 °C',             1.00),
    ('RBC',  'Packed red cells',            'RBC',  42, '2-6 °C',             0.62),
    ('FFP',  'Fresh frozen plasma',         'FFP', 365, '-30 °C or colder',   0.44),
    ('PLT',  'Random-donor platelets',      'PLT',   5, '20-24 °C, agitated', 0.11),
    ('SDP',  'Single-donor (apheresis) platelets', 'PLT', 5, '20-24 °C, agitated', NULL),
    ('PPLT', 'Pooled platelets',            'PLT',   5, '20-24 °C, agitated', NULL),
    ('PAED', 'Paediatric red cell aliquot', NULL,   42, '2-6 °C',             NULL);

-- Indian PIN codes with an approximate centre point. Donors, hospitals and the blood bank are
-- located by PIN code, so "distance" in donor recall = distance between PIN-code centres
-- (accurate to roughly 1-3 km inside a city), never a made-up number.
CREATE TABLE pincode (
    pincode    CHAR(6)       PRIMARY KEY,
    area       VARCHAR(60)   NOT NULL,
    city       VARCHAR(60)   NOT NULL,
    latitude   DECIMAL(9,6)  NOT NULL,
    longitude  DECIMAL(9,6)  NOT NULL,
    CONSTRAINT chk_pincode_format CHECK (REGEXP_LIKE(pincode, '^[1-9][0-9]{5}$')),
    CONSTRAINT chk_pincode_lat    CHECK (latitude  BETWEEN -90  AND 90),
    CONSTRAINT chk_pincode_lng    CHECK (longitude BETWEEN -180 AND 180)
);

INSERT INTO pincode VALUES
    ('560001', 'MG Road',                 'Bengaluru', 12.976200, 77.603300),
    ('560002', 'City Market',             'Bengaluru', 12.963400, 77.573700),
    ('560004', 'Basavanagudi',            'Bengaluru', 12.941700, 77.575500),
    ('560010', 'Rajajinagar',             'Bengaluru', 12.991000, 77.555000),
    ('560011', 'Jayanagar',               'Bengaluru', 12.930800, 77.583800),
    ('560024', 'Hebbal',                  'Bengaluru', 13.035800, 77.597000),
    ('560032', 'RT Nagar',                'Bengaluru', 13.021000, 77.596000),
    ('560034', 'Koramangala',             'Bengaluru', 12.935200, 77.624500),
    ('560037', 'Marathahalli',            'Bengaluru', 12.956900, 77.701100),
    ('560038', 'Indiranagar',             'Bengaluru', 12.978400, 77.640800),
    ('560040', 'Vijayanagar',             'Bengaluru', 12.971900, 77.532900),
    ('560043', 'Kalyan Nagar',            'Bengaluru', 13.022100, 77.640300),
    ('560050', 'Banashankari 1st Stage',  'Bengaluru', 12.938700, 77.556000),
    ('560060', 'Kengeri',                 'Bengaluru', 12.917700, 77.483800),
    ('560064', 'Yelahanka',               'Bengaluru', 13.100700, 77.596300),
    ('560066', 'Whitefield',              'Bengaluru', 12.969800, 77.750000),
    ('560068', 'Bommanahalli',            'Bengaluru', 12.901000, 77.624000),
    ('560070', 'Banashankari 2nd Stage',  'Bengaluru', 12.925000, 77.546800),
    ('560076', 'BTM Layout',              'Bengaluru', 12.910000, 77.610000),
    ('560078', 'JP Nagar',                'Bengaluru', 12.906300, 77.585700),
    ('560085', 'Banashankari 3rd Stage',  'Bengaluru', 12.934500, 77.534600),
    ('560092', 'Sahakar Nagar',           'Bengaluru', 13.062300, 77.588000),
    ('560093', 'CV Raman Nagar',          'Bengaluru', 12.985000, 77.663000),
    ('560098', 'Rajarajeshwari Nagar',    'Bengaluru', 12.927400, 77.515500),
    ('560100', 'Electronic City',         'Bengaluru', 12.845200, 77.660200),
    ('560102', 'HSR Layout',              'Bengaluru', 12.911600, 77.647400),
    ('570001', 'Mysuru City',             'Mysuru',    12.308000, 76.655000),
    ('570017', 'Vijayanagar, Mysuru',     'Mysuru',    12.337500, 76.618000),
    ('570023', 'Kuvempunagar',            'Mysuru',    12.284000, 76.628000),
    ('572101', 'Tumakuru City',           'Tumakuru',  13.340900, 77.101000),
    ('572102', 'Batawadi',                'Tumakuru',  13.327000, 77.115000);

-- Single-row table: where this blood bank is.
CREATE TABLE blood_bank (
    bank_id  TINYINT       PRIMARY KEY DEFAULT 1,
    name     VARCHAR(100)  NOT NULL,
    pincode  CHAR(6)       NOT NULL,
    CONSTRAINT chk_single_bank   CHECK (bank_id = 1),
    CONSTRAINT fk_bank_pincode   FOREIGN KEY (pincode) REFERENCES pincode (pincode)
);

INSERT INTO blood_bank VALUES (1, 'LifeLine Blood Bank', '560085');
