import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { badRequest } from "../api";
import { callProc, execute, query } from "../mysql";
import type { Session } from "../session";
import { DONATION_TYPES } from "./donations";
import { BLOOD_GROUPS, CHANNELS } from "./donors";

export interface CandidateRow extends RowDataPacket {
  donor_id: number;
  full_name: string;
  phone: string;
  pincode: string;
  area: string;
  city: string;
  blood_group: string;
  distance_km: number;
  last_donation_at: string | null;
  last_donation_type: string | null;
  total_donations: number;
  donations_last_year: number;   // of the recalled donation type
  yearly_target: number;
  required_gap_days: number | null;
  eligible_since: string | null;
  days_since_last: number | null;
  recalls_answered: number;
  recalls_closed: number;
  reliability: number;
  last_contacted_at: string | null;
  priority_score: number;
}

export const RECALL_SORTS = {
  priority: "Priority (closest + most frequent)",
  distance: "Closest first",
  frequency: "Most frequent donors first",
} as const;
export type RecallSort = keyof typeof RECALL_SORTS;

export interface RecallLogRow extends RowDataPacket {
  contact_id: number;
  donor_id: number;
  full_name: string;
  phone: string;
  blood_group: string;
  donation_type: string;
  channel: string;
  contacted_at: string;
  outcome: "pending" | "donated" | "declined" | "no_response";
  responded_at: string | null;
}

export const OUTCOMES = ["pending", "donated", "declined", "no_response"] as const;

function checkGroup(group: string) {
  if (!BLOOD_GROUPS.includes(group as (typeof BLOOD_GROUPS)[number])) badRequest("Unknown blood group");
}

function checkType(type: string) {
  if (!(type in DONATION_TYPES)) badRequest("Unknown donation type");
}

export async function recallCandidates(
  session: Session, group: string, type = "whole_blood", radiusKm = 25, sort: string = "priority", limit = 30,
) {
  checkGroup(group);
  checkType(type);
  if (!(sort in RECALL_SORTS)) badRequest("Unknown sort order");
  const radius = Math.min(Math.max(Number(radiusKm) || 25, 1), 500);
  return callProc<CandidateRow>(session.role, "CALL sp_recall_candidates(?, ?, ?, ?, ?)", [group, type, radius, sort, limit]);
}

export async function recallLog(session: Session, group?: string, limit = 50) {
  return query<RecallLogRow>(
    session.role,
    `SELECT * FROM v_recall_log ${group ? "WHERE blood_group = ?" : ""} ORDER BY contacted_at DESC LIMIT ?`,
    group ? [group, limit] : [limit],
  );
}

export async function markContacted(session: Session, donorId: number, group: string, type = "whole_blood", channel = "call") {
  checkGroup(group);
  checkType(type);
  if (!CHANNELS.includes(channel as (typeof CHANNELS)[number])) badRequest("Channel must be call, sms or email");
  const r = await execute(
    session.role,
    "INSERT INTO recall_contact (donor_id, blood_group, donation_type, contacted_by, channel) VALUES (?, ?, ?, ?, ?)",
    [donorId, group, type, session.userId, channel],
  );
  return r.insertId;
}

export async function setOutcome(session: Session, contactId: number, outcome: string) {
  if (!OUTCOMES.includes(outcome as (typeof OUTCOMES)[number])) badRequest("Unknown outcome");
  const r = await execute(
    session.role,
    `UPDATE recall_contact
        SET outcome = ?, responded_at = IF(? = 'pending', NULL, COALESCE(responded_at, NOW()))
      WHERE contact_id = ?`,
    [outcome, outcome, contactId],
  );
  if (!r.affectedRows) badRequest("Recall contact not found");
}
