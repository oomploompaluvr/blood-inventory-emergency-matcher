-- =====================================================================
-- 30  Member A: shortage forecast and donor recall
--     Runs after 20_ because usage is measured from Member B's issue table.
-- =====================================================================

-- Link Member A's tables to the shared users table now that it exists.
ALTER TABLE donor          ADD CONSTRAINT fk_donor_user      FOREIGN KEY (user_id)      REFERENCES users (user_id);
ALTER TABLE donation       ADD CONSTRAINT fk_donation_user   FOREIGN KEY (collected_by) REFERENCES users (user_id);
ALTER TABLE recall_contact ADD CONSTRAINT fk_recall_user     FOREIGN KEY (contacted_by) REFERENCES users (user_id);


-- ---------------------------------------------------------------------
-- Shortage forecast (per blood group and stock family: red cells, platelets, plasma)
-- ---------------------------------------------------------------------

-- Units issued per day, blood group and family. A platelet dose counts once whether it was a
-- random-donor unit, an apheresis unit or a pool.
CREATE VIEW v_daily_usage AS
SELECT DATE(i.issued_at)  AS usage_date,
       u.blood_group,
       ct.family_code,
       COUNT(*)           AS units_issued
FROM issue i
JOIN blood_component u ON u.unit_id = i.unit_id
JOIN component_type ct ON ct.component_code = u.component_code
WHERE ct.family_code IS NOT NULL
GROUP BY DATE(i.issued_at), u.blood_group, ct.family_code;

-- Daily usage for the last 120 complete days with 7- and 30-day moving averages.
--   * recursive CTE builds a calendar so days with zero issues still count as zero
--   * window functions compute the moving averages per group + family
CREATE VIEW v_usage_trend AS
WITH RECURSIVE calendar (day) AS (
    SELECT CURDATE() - INTERVAL 120 DAY
    UNION ALL
    SELECT day + INTERVAL 1 DAY FROM calendar WHERE day < CURDATE() - INTERVAL 1 DAY
),
daily AS (
    SELECT c.day,
           g.group_code                     AS blood_group,
           f.family_code,
           COALESCE(du.units_issued, 0)     AS units_issued
    FROM calendar c
    CROSS JOIN blood_group g
    CROSS JOIN stock_family f
    LEFT JOIN v_daily_usage du
           ON du.usage_date = c.day
          AND du.blood_group = g.group_code
          AND du.family_code = f.family_code
)
SELECT day,
       blood_group,
       family_code,
       units_issued,
       AVG(units_issued) OVER w7   AS avg_7d,
       AVG(units_issued) OVER w30  AS avg_30d,
       SUM(units_issued) OVER w30  AS total_30d
FROM daily
WINDOW w7  AS (PARTITION BY blood_group, family_code ORDER BY day ROWS BETWEEN 6  PRECEDING AND CURRENT ROW),
       w30 AS (PARTITION BY blood_group, family_code ORDER BY day ROWS BETWEEN 29 PRECEDING AND CURRENT ROW);

-- Days of stock left per blood group and family, with a colour status.
-- Demand rate = the higher of the 7-day and 30-day averages, so a sudden spike is not hidden.
CREATE VIEW v_shortage_forecast AS
WITH latest AS (
    SELECT blood_group, family_code, avg_7d, avg_30d, total_30d
    FROM v_usage_trend
    WHERE day = CURDATE() - INTERVAL 1 DAY
),
stock AS (
    SELECT blood_group, family_code,
           SUM(units_available)    AS units_available,
           SUM(expiring_in_3_days) AS expiring_in_3_days,
           MIN(earliest_expiry)    AS earliest_expiry
    FROM v_current_stock
    WHERE family_code IS NOT NULL
    GROUP BY blood_group, family_code
),
joined AS (
    SELECT s.blood_group,
           s.family_code,
           f.name                                   AS family_name,
           f.low_days,
           f.critical_days,
           s.units_available,
           s.expiring_in_3_days,
           s.earliest_expiry,
           l.total_30d                              AS issued_last_30d,
           l.avg_30d,
           l.avg_7d,
           GREATEST(l.avg_7d, l.avg_30d)            AS demand_rate
    FROM stock s
    JOIN stock_family f ON f.family_code = s.family_code
    JOIN latest l       ON l.blood_group = s.blood_group AND l.family_code = s.family_code
)
SELECT blood_group,
       family_code,
       family_name,
       units_available,
       expiring_in_3_days,
       earliest_expiry,
       issued_last_30d,
       ROUND(avg_30d, 2)                                         AS avg_daily_use_30d,
       ROUND(avg_7d, 2)                                          AS avg_daily_use_7d,
       low_days,
       critical_days,
       IF(demand_rate = 0, NULL, ROUND(units_available / demand_rate, 1)) AS days_of_stock,
       CASE WHEN avg_30d = 0                THEN 'none'
            WHEN avg_7d > avg_30d * 1.25    THEN 'rising'
            WHEN avg_7d < avg_30d * 0.75    THEN 'falling'
            ELSE 'steady' END                                    AS demand_trend,
       CASE WHEN demand_rate = 0 THEN IF(units_available = 0, 'low', 'ok')
            WHEN units_available / demand_rate < critical_days   THEN 'critical'
            WHEN units_available / demand_rate < low_days        THEN 'low'
            ELSE 'ok' END                                        AS stock_status
FROM joined;


-- ---------------------------------------------------------------------
-- Donor recall
-- ---------------------------------------------------------------------

DELIMITER //

-- Donors of the needed group who are eligible TODAY for the given donation type (the minimum gap
-- since their last donation has passed, age and weight are within limits), within p_radius_km.
--
-- Priority score (0-1), highest first:
--   45%  proximity   = 1 - distance / radius   (distance between PIN-code centres)
--   35%  frequency   = donations OF THIS TYPE in the last 12 months / yearly target, capped at 1
--                      (target = the type's yearly cap if it has one, e.g. apheresis 24; otherwise 4,
--                       the most whole-blood donations a man can make in a year)
--   20%  reliability = (recalls answered with a donation + 1) / (recalls closed + 2)
--                      smoothed so a donor never called before starts at 0.5
-- p_sort: 'priority' (default), 'distance' (closest first) or 'frequency' (most donations first).
-- Every donor-specific number is a correlated subquery, re-evaluated for each donor row.
CREATE PROCEDURE sp_recall_candidates(
    IN p_blood_group VARCHAR(3),
    IN p_type        VARCHAR(16),
    IN p_radius_km   DECIMAL(6,1),
    IN p_sort        VARCHAR(10),
    IN p_limit       INT
)
BEGIN
    SELECT ranked.*,
           DATEDIFF(CURDATE(), DATE(last_donation_at))                          AS days_since_last,
           ROUND(0.45 * (1 - distance_km / p_radius_km)
               + 0.35 * LEAST(donations_last_year / yearly_target, 1)
               + 0.20 * reliability, 3)                                         AS priority_score
    FROM (
        SELECT d.donor_id,
               d.full_name,
               d.phone,
               d.pincode,
               dp.area,
               dp.city,
               d.blood_group,
               ROUND(ST_Distance_Sphere(POINT(dp.longitude, dp.latitude),
                                        POINT(bp.longitude, bp.latitude)) / 1000, 1)  AS distance_km,
               (SELECT MAX(dn.donated_at) FROM donation dn
                 WHERE dn.donor_id = d.donor_id)                                      AS last_donation_at,
               (SELECT dn.donation_type FROM donation dn
                 WHERE dn.donor_id = d.donor_id ORDER BY dn.donated_at DESC LIMIT 1)  AS last_donation_type,
               (SELECT COUNT(*) FROM donation dn
                 WHERE dn.donor_id = d.donor_id)                                      AS total_donations,
               (SELECT COUNT(*) FROM donation dn
                 WHERE dn.donor_id = d.donor_id AND dn.donation_type = p_type
                   AND dn.donated_at > NOW() - INTERVAL 365 DAY)                      AS donations_last_year,
               COALESCE(t.max_per_365_days, 4)                                        AS yearly_target,
               -- the rule gap that applies to this donor's latest donation -> p_type
               (SELECT r.min_days FROM donation dn
                  JOIN donation_interval_rule r
                    ON r.previous_type = dn.donation_type AND r.next_type = p_type AND r.gender = d.gender
                 WHERE dn.donor_id = d.donor_id ORDER BY dn.donated_at DESC LIMIT 1)  AS required_gap_days,
               DATE(fn_next_eligible_at(d.donor_id, p_type, NOW()))                   AS eligible_since,
               (SELECT COUNT(*) FROM recall_contact rc
                 WHERE rc.donor_id = d.donor_id AND rc.outcome = 'donated')           AS recalls_answered,
               (SELECT COUNT(*) FROM recall_contact rc
                 WHERE rc.donor_id = d.donor_id AND rc.outcome <> 'pending')          AS recalls_closed,
               ROUND(((SELECT COUNT(*) FROM recall_contact rc
                        WHERE rc.donor_id = d.donor_id AND rc.outcome = 'donated') + 1)
                   / ((SELECT COUNT(*) FROM recall_contact rc
                        WHERE rc.donor_id = d.donor_id AND rc.outcome <> 'pending') + 2), 3) AS reliability,
               (SELECT MAX(rc.contacted_at) FROM recall_contact rc
                 WHERE rc.donor_id = d.donor_id)                                      AS last_contacted_at
        FROM donor d
        JOIN pincode dp       ON dp.pincode = d.pincode
        JOIN blood_bank b     ON b.bank_id = 1
        JOIN pincode bp       ON bp.pincode = b.pincode
        JOIN donation_type t  ON t.type_code = p_type
        WHERE d.blood_group = p_blood_group
          AND d.is_active
          AND d.weight_kg >= t.min_weight_kg
          AND TIMESTAMPDIFF(YEAR, d.date_of_birth, CURDATE()) BETWEEN t.min_age
              AND IF(EXISTS (SELECT 1 FROM donation dn WHERE dn.donor_id = d.donor_id), t.max_age, t.max_age_first)
          -- the minimum gap since their last donation (any type) has passed
          AND fn_next_eligible_date(d.donor_id, p_type) <= CURDATE()
    ) ranked
    WHERE distance_km <= p_radius_km
    ORDER BY
        CASE WHEN p_sort = 'distance'  THEN distance_km END ASC,
        CASE WHEN p_sort = 'frequency' THEN donations_last_year END DESC,
        CASE WHEN p_sort = 'frequency' THEN total_donations END DESC,
        CASE WHEN p_sort NOT IN ('distance', 'frequency') OR p_sort IS NULL THEN
            ROUND(0.45 * (1 - distance_km / p_radius_km)
                + 0.35 * LEAST(donations_last_year / yearly_target, 1)
                + 0.20 * reliability, 3) END DESC,
        distance_km ASC,
        donations_last_year DESC
    LIMIT p_limit;
END //

DELIMITER ;

-- Recall call log with names, for the "contacted" list on the recall page.
CREATE VIEW v_recall_log AS
SELECT rc.contact_id,
       rc.donor_id,
       d.full_name,
       d.phone,
       rc.blood_group,
       rc.donation_type,
       rc.channel,
       rc.contacted_at,
       rc.outcome,
       rc.responded_at,
       rc.contacted_by
FROM recall_contact rc
JOIN donor d ON d.donor_id = rc.donor_id;
