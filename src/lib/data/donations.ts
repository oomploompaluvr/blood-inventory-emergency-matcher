import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { badRequest } from "../api";
import { mongoConfigured } from "../mongo";
import { db, query } from "../mysql";
import type { Session } from "../session";
import { latestScreening } from "./screening";

export interface UnitRow extends RowDataPacket {
  unit_id: number;
  unit_code: string;
  component_code: string;
  blood_group: string;
  volume_ml: number;
  collected_at: string;
  expires_at: string;
  status: string;
}

export interface RecentDonationRow extends RowDataPacket {
  donation_id: number;
  donation_type: string;
  bag_number: string;
  donated_at: string;
  volume_ml: number;
  hemoglobin_g_dl: number;
  donor_id: number;
  full_name: string;
  blood_group: string;
  units: number;
}

export async function recentDonations(session: Session, limit = 15) {
  return query<RecentDonationRow>(
    session.role,
    `SELECT dn.donation_id, dn.donation_type, dn.bag_number, dn.donated_at, dn.volume_ml, dn.hemoglobin_g_dl,
            d.donor_id, d.full_name, d.blood_group,
            (SELECT COUNT(*) FROM blood_component u WHERE u.donation_id = dn.donation_id) AS units
       FROM donation dn
       JOIN donor d ON d.donor_id = dn.donor_id
      ORDER BY dn.donated_at DESC
      LIMIT ?`,
    [limit],
  );
}

export async function unitsOfDonation(session: Session, donationId: number) {
  return query<UnitRow>(
    session.role,
    `SELECT unit_id, unit_code, component_code, blood_group, volume_ml,
            collected_at, expires_at, status
       FROM blood_component WHERE donation_id = ? ORDER BY component_code <> 'WB', component_code`,
    [donationId],
  );
}

/** Next free bag number in the printed format BB + year + 6 digits. */
export async function suggestBagNumber(session: Session) {
  const year = new Date().getFullYear();
  const [row] = await query<RowDataPacket & { last: string | null }>(
    session.role,
    "SELECT MAX(bag_number) AS last FROM donation WHERE bag_number LIKE ?",
    [`BB${year}%`],
  );
  const next = row?.last ? Number(row.last.slice(6)) + 1 : 1;
  return `BB${year}${String(next).padStart(6, "0")}`;
}

export const DONATION_TYPES = { whole_blood: "Whole blood", plateletpheresis: "Platelet apheresis" } as const;
export type DonationType = keyof typeof DONATION_TYPES;

export interface DonationInput {
  donor_id: number | string;
  donation_type?: string;
  bag_number: string;
  platelet_count_k?: number | string | null;
  volume_ml: number | string;
  hemoglobin_g_dl: number | string;
  weight_kg: number | string;
  separate?: boolean;
  notes?: string;
}

/**
 * Records a donation through sp_record_donation (which runs the eligibility trigger and, for whole
 * blood, splits the bag into components in one transaction). Before that, if MongoDB is configured,
 * the donor must have passed the screening questionnaire within the last 3 days.
 * Type-specific limits (age, weight, volume, gaps, apheresis caps) are enforced by the database.
 */
export async function recordDonation(session: Session, body: Partial<DonationInput>) {
  const donorId = Number(body.donor_id);
  const volume = Number(body.volume_ml);
  const hb = Number(body.hemoglobin_g_dl);
  const weight = Number(body.weight_kg);
  const bag = String(body.bag_number ?? "").trim().toUpperCase();
  const type = (body.donation_type ?? "whole_blood") as DonationType;
  const platelets = body.platelet_count_k === undefined || body.platelet_count_k === null || body.platelet_count_k === ""
    ? null : Number(body.platelet_count_k);
  if (!Number.isInteger(donorId) || donorId <= 0) badRequest("Choose a donor");
  if (!(type in DONATION_TYPES)) badRequest("Unknown donation type");
  if (!/^BB\d{10}$/.test(bag)) badRequest("Bag number must look like BB2026000123");
  if (!Number.isInteger(volume)) badRequest("Volume is required");
  if (platelets !== null && !Number.isInteger(platelets)) badRequest("Platelet count must be a whole number");
  if (!Number.isFinite(hb)) badRequest("Haemoglobin is required");
  if (!Number.isFinite(weight)) badRequest("Weight is required");

  let screeningRef: string | null = null;
  if (mongoConfigured()) {
    const s = await latestScreening(donorId);
    const fresh = s && Date.now() - new Date(s.submittedAt).getTime() < 3 * 86_400_000;
    if (!s || !fresh) badRequest("No screening questionnaire in the last 3 days — fill one in first");
    if (s.result !== "eligible")
      badRequest(`Latest screening deferred this donor: ${s.deferralReasons.join("; ")}`);
    screeningRef = String(s._id);
  }

  // OUT parameters live in session variables, so CALL and SELECT must share one connection.
  const conn = await db(session.role).getConnection();
  try {
    await conn.query("CALL sp_record_donation(?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, @donation_id)", [
      donorId, type, bag, volume, hb, weight, platelets, screeningRef, session.userId, body.separate !== false,
    ]);
    const [[row]] = await conn.query<(RowDataPacket & { id: number })[]>("SELECT @donation_id AS id");
    if (body.notes) await conn.execute("UPDATE donation SET notes = ? WHERE donation_id = ?", [String(body.notes).slice(0, 255), row.id]);
    return { donationId: row.id, units: await unitsOfDonation(session, row.id) };
  } finally {
    conn.release();
  }
}
