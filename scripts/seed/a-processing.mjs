// Member A: back-fills component processing (paediatric aliquots, platelet pools) at a past time.
// Live processing goes through sp_split_paediatric / sp_pool_platelets; these helpers write the
// same rows directly because the procedures always use NOW() as the processing time.
import { sqlDateTime } from "./util.mjs";

async function insertUnit(conn, u) {
  const [res] = await conn.query(
    `INSERT INTO blood_component (unit_code, donation_id, component_code, blood_group, volume_ml,
                                  collected_at, expires_at, status, status_changed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
    [u.unit_code, u.donation_id, u.component_code, u.blood_group, u.volume_ml, u.collected_at, u.expires_at, u.collected_at]);
  return { ...u, unit_id: res.insertId };
}

/** Split a red cell unit into `parts` paediatric aliquots at time `at`. Returns the new units. */
export async function backfillAliquots(conn, parent, parts, at) {
  const children = [];
  for (let i = 1; i <= parts; i++) {
    children.push(await insertUnit(conn, {
      unit_code: `${parent.unit_code}-P${i}`,
      donation_id: parent.donation_id,
      component_code: "PAED",
      blood_group: parent.blood_group,
      volume_ml: Math.floor(parent.volume_ml / parts),
      collected_at: sqlDateTime(at),
      expires_at: parent.expires_at,
    }));
  }
  await conn.query("INSERT INTO unit_lineage (parent_unit_id, child_unit_id) VALUES ?",
    [children.map((c) => [parent.unit_id, c.unit_id])]);
  await conn.query("UPDATE blood_component SET status = 'processed', status_changed_at = ? WHERE unit_id = ?",
    [sqlDateTime(at), parent.unit_id]);
  return children;
}

/** Pool 4-6 same-group platelet units from different donors at time `at`. Returns the pool unit. */
export async function backfillPool(conn, sources, at) {
  const expires = sources.map((s) => s.expires_at).sort()[0];
  const pool = await insertUnit(conn, {
    unit_code: `TMP${sources[0].unit_id}-${Date.now()}`,
    donation_id: null,
    component_code: "PPLT",
    blood_group: sources[0].blood_group,
    volume_ml: sources.reduce((s, u) => s + u.volume_ml, 0),
    collected_at: sqlDateTime(at),
    expires_at: expires,
  });
  pool.unit_code = `POOL${at.getFullYear()}${String(pool.unit_id).padStart(7, "0")}`;
  await conn.query("UPDATE blood_component SET unit_code = ? WHERE unit_id = ?", [pool.unit_code, pool.unit_id]);
  await conn.query("INSERT INTO unit_lineage (parent_unit_id, child_unit_id) VALUES ?",
    [sources.map((s) => [s.unit_id, pool.unit_id])]);
  await conn.query("UPDATE blood_component SET status = 'processed', status_changed_at = ? WHERE unit_id IN (?)",
    [sqlDateTime(at), sources.map((s) => s.unit_id)]);
  return pool;
}
