import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { badRequest } from "../api";
import { db, query } from "../mysql";
import type { Session } from "../session";
import { BLOOD_GROUPS } from "./donors";

export interface ProcessableUnit extends RowDataPacket {
  unit_id: number;
  unit_code: string;
  blood_group: string;
  volume_ml: number;
  expires_at: string;
}

export interface ProcessedRow extends RowDataPacket {
  unit_id: number;
  unit_code: string;
  component_code: "PAED" | "PPLT";
  blood_group: string;
  volume_ml: number;
  collected_at: string;
  expires_at: string;
  effective_status: string;
  sources: string;   // comma-separated parent unit codes
  donors: number;    // distinct donors behind the unit
}

/** Available, unexpired units of one component type (read through the expiry-on-read view). */
export async function availableUnits(session: Session, component: "RBC" | "PLT", group?: string) {
  if (group && !BLOOD_GROUPS.includes(group as (typeof BLOOD_GROUPS)[number])) badRequest("Unknown blood group");
  return query<ProcessableUnit>(
    session.role,
    `SELECT unit_id, unit_code, blood_group, volume_ml, expires_at
       FROM v_unit_status
      WHERE component_code = ? AND effective_status = 'available' ${group ? "AND blood_group = ?" : ""}
      ORDER BY expires_at
      LIMIT 60`,
    group ? [component, group] : [component],
  );
}

/** Recently made aliquots and pools with the units (and number of donors) they came from. */
export async function recentlyProcessed(session: Session, limit = 20) {
  return query<ProcessedRow>(
    session.role,
    `SELECT c.unit_id, c.unit_code, c.component_code, c.blood_group, c.volume_ml, c.collected_at, c.expires_at,
            c.effective_status,
            GROUP_CONCAT(p.unit_code ORDER BY p.unit_code SEPARATOR ', ') AS sources,
            COUNT(DISTINCT dn.donor_id)                                   AS donors
       FROM v_unit_status c
       JOIN unit_lineage l   ON l.child_unit_id = c.unit_id
       JOIN blood_component p ON p.unit_id = l.parent_unit_id
       JOIN donation dn      ON dn.donation_id = p.donation_id
      WHERE c.component_code IN ('PAED', 'PPLT')
      GROUP BY c.unit_id
      ORDER BY c.collected_at DESC, c.unit_id DESC
      LIMIT ?`,
    [limit],
  );
}

// OUT parameters live in session variables, so CALL and SELECT must share one connection.
async function callWithOut(session: Session, sql: string, params: unknown[]) {
  const conn = await db(session.role).getConnection();
  try {
    await conn.query(sql, params);
    const [[row]] = await conn.query<(RowDataPacket & { id: number })[]>("SELECT @out_id AS id");
    return row.id;
  } finally {
    conn.release();
  }
}

export async function splitPaediatric(session: Session, unitId: number, parts: number) {
  if (!Number.isInteger(unitId)) badRequest("Choose a unit");
  if (![2, 3, 4].includes(parts)) badRequest("Split into 2, 3 or 4 aliquots");
  return { firstAliquotId: await callWithOut(session, "CALL sp_split_paediatric(?, ?, @out_id)", [unitId, parts]) };
}

export async function poolPlatelets(session: Session, unitIds: number[]) {
  if (!Array.isArray(unitIds) || !unitIds.every(Number.isInteger)) badRequest("Choose the platelet units to pool");
  if (unitIds.length < 4 || unitIds.length > 6) badRequest("A pool needs 4-6 units");
  return { poolId: await callWithOut(session, "CALL sp_pool_platelets(?, @out_id)", [JSON.stringify(unitIds)]) };
}
