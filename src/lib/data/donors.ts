import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { badRequest } from "../api";
import { execute, query } from "../mysql";
import type { Role, Session } from "../session";

export const BLOOD_GROUPS = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] as const;
export const GENDERS = { M: "Male", F: "Female", O: "Other" } as const;
export const CHANNELS = ["call", "sms", "email"] as const;

export interface DonorRow extends RowDataPacket {
  donor_id: number;
  user_id: number | null;
  full_name: string;
  gender: keyof typeof GENDERS;
  date_of_birth: string;
  weight_kg: number;
  blood_group: string;
  phone: string;
  email: string | null;
  preferred_channel: (typeof CHANNELS)[number];
  address_line: string | null;
  pincode: string;
  is_active: number;
  registered_at: string;
}

export interface EligibilityRow extends RowDataPacket {
  donor_id: number;
  full_name: string;
  gender: keyof typeof GENDERS;
  blood_group: string;
  pincode: string;
  area: string;
  city: string;
  weight_kg: number;
  is_active: number;
  age: number;
  last_donation_at: string | null;
  total_donations: number;
  next_whole_blood_date: string;
  next_apheresis_date: string;
  eligible_now: number;
  apheresis_eligible_now: number;
}

export interface PincodeRow extends RowDataPacket {
  pincode: string;
  area: string;
  city: string;
}

export async function listPincodes(role: Role) {
  return query<PincodeRow>(role, "SELECT pincode, area, city FROM pincode ORDER BY city, pincode");
}

export interface DonorListRow extends EligibilityRow {
  phone: string;
}

export async function listDonors(role: Role, opts: { q?: string; group?: string; eligible?: boolean; limit?: number } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.q) {
    where.push("(e.full_name LIKE ? OR d.phone LIKE ? OR e.donor_id = ?)");
    params.push(`%${opts.q}%`, `%${opts.q}%`, Number(opts.q) || 0);
  }
  if (opts.group) {
    where.push("e.blood_group = ?");
    params.push(opts.group);
  }
  if (opts.eligible) where.push("e.eligible_now = 1");
  params.push(opts.limit ?? 100);
  return query<DonorListRow>(
    role,
    `SELECT e.*, d.phone
       FROM v_donor_eligibility e
       JOIN donor d ON d.donor_id = e.donor_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY e.donor_id DESC
      LIMIT ?`,
    params,
  );
}

export async function getDonor(role: Role, donorId: number) {
  const [donor] = await query<DonorRow>(role, "SELECT * FROM donor WHERE donor_id = ?", [donorId]);
  if (!donor) return null;
  const [eligibility] = await query<EligibilityRow>(role, "SELECT * FROM v_donor_eligibility WHERE donor_id = ?", [donorId]);
  return { donor, eligibility };
}

export interface HistoryRow extends RowDataPacket {
  donation_id: number;
  donation_type: string;
  bag_number: string;
  donated_at: string;
  volume_ml: number;
  hemoglobin_g_dl: number;
}

export async function donationHistory(role: Role, donorId: number) {
  return query<HistoryRow>(
    role,
    "SELECT * FROM v_donor_history WHERE donor_id = ? ORDER BY donated_at DESC",
    [donorId],
  );
}

// ---------------------------------------------------------------------------------------------
// Input validation (the database checks everything again; this just gives friendlier messages)
// ---------------------------------------------------------------------------------------------
export interface DonorInput {
  full_name: string;
  gender: string;
  date_of_birth: string;
  weight_kg: number | string;
  blood_group: string;
  phone: string;
  email?: string | null;
  preferred_channel?: string;
  address_line?: string | null;
  pincode: string;
}

export function cleanDonorInput(body: Partial<DonorInput>) {
  const full_name = String(body.full_name ?? "").trim();
  const phone = String(body.phone ?? "").replace(/[\s-]/g, "");
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const pincode = String(body.pincode ?? "").trim();
  const address_line = body.address_line ? String(body.address_line).trim().slice(0, 150) : null;
  const weight = Number(body.weight_kg);
  if (full_name.length < 2) badRequest("Full name is required");
  if (!(String(body.gender) in GENDERS)) badRequest("Gender must be M, F or O");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.date_of_birth ?? ""))) badRequest("Date of birth is required");
  if (!Number.isFinite(weight) || weight < 20 || weight > 250) badRequest("Weight must be between 20 and 250 kg");
  if (!BLOOD_GROUPS.includes(body.blood_group as (typeof BLOOD_GROUPS)[number])) badRequest("Choose a blood group");
  if (!/^\+?\d{10,14}$/.test(phone)) badRequest("Phone must be 10-14 digits");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) badRequest("Email looks invalid");
  if (!/^[1-9]\d{5}$/.test(pincode)) badRequest("PIN code must be 6 digits");
  const channel = body.preferred_channel ?? "call";
  if (!CHANNELS.includes(channel as (typeof CHANNELS)[number])) badRequest("Preferred channel must be call, sms or email");
  return {
    full_name, gender: String(body.gender), date_of_birth: String(body.date_of_birth), weight_kg: weight,
    blood_group: String(body.blood_group), phone, email, preferred_channel: channel, address_line, pincode,
  };
}

async function checkPincode(role: Role, pincode: string) {
  const [row] = await query<RowDataPacket>(role, "SELECT 1 FROM pincode WHERE pincode = ?", [pincode]);
  if (!row) badRequest(`PIN code ${pincode} is not in the PIN-code list`);
}

export async function createDonor(session: Session, body: Partial<DonorInput>) {
  const d = cleanDonorInput(body);
  await checkPincode(session.role, d.pincode);
  const result = await execute(
    session.role,
    `INSERT INTO donor (user_id, full_name, gender, date_of_birth, weight_kg, blood_group, phone, email,
                        preferred_channel, address_line, pincode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.role === "donor" ? session.userId : null,
      d.full_name, d.gender, d.date_of_birth, d.weight_kg, d.blood_group, d.phone, d.email,
      d.preferred_channel, d.address_line, d.pincode,
    ],
  );
  return result.insertId;
}

// Donors may only change contact details (the database enforces this with column-level grants);
// staff may also correct weight, deactivate, etc.
const DONOR_EDITABLE = ["phone", "email", "preferred_channel", "address_line", "pincode"] as const;
const STAFF_EDITABLE = [...DONOR_EDITABLE, "full_name", "weight_kg", "is_active", "date_of_birth", "gender", "blood_group"] as const;

export async function updateDonor(session: Session, donorId: number, patch: Record<string, unknown>) {
  const allowed: readonly string[] = session.role === "donor" ? DONOR_EDITABLE : STAFF_EDITABLE;
  const current = await getDonor(session.role, donorId);
  if (!current) badRequest("Donor not found");
  // Re-validate the full record with the patch applied.
  const merged = { ...current.donor, ...patch } as unknown as Partial<DonorInput>;
  const clean = cleanDonorInput(merged) as Record<string, unknown>;
  clean.is_active = patch.is_active === undefined ? current.donor.is_active : Boolean(patch.is_active);

  const fields = Object.keys(patch).filter((k) => allowed.includes(k));
  if (!fields.length) badRequest("Nothing you are allowed to change was sent");
  if (fields.includes("pincode")) await checkPincode(session.role, String(clean.pincode));
  await execute(
    session.role,
    `UPDATE donor SET ${fields.map((f) => `${f} = ?`).join(", ")} WHERE donor_id = ?`,
    [...fields.map((f) => clean[f]), donorId],
  );
}

/** Donor portal: the donor record linked to the signed-in donor. */
export function ownDonorId(session: Session): number | null {
  return session.role === "donor" ? (session.donorId ?? null) : null;
}
