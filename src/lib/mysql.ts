import "server-only";
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import type { Role } from "./session";

// The app never connects as a single all-powerful user. Each application role maps to its
// own MySQL account (ll_admin, ll_lab, ...) whose privileges come from db/40_a_access_control.sql,
// so the database itself enforces what a hospital or donor may read.
const ROLE_PASSWORD_ENV: Record<Role, string> = {
  admin: "MYSQL_ADMIN_PASSWORD",
  lab: "MYSQL_LAB_PASSWORD",
  hospital: "MYSQL_HOSPITAL_PASSWORD",
  donor: "MYSQL_DONOR_PASSWORD",
};

const globalPools = globalThis as unknown as { __llPools?: Map<Role, Pool> };
const pools = (globalPools.__llPools ??= new Map<Role, Pool>());

export function db(role: Role): Pool {
  let pool = pools.get(role);
  if (!pool) {
    const password = process.env[ROLE_PASSWORD_ENV[role]];
    if (!password) throw new Error(`${ROLE_PASSWORD_ENV[role]} is not set in .env.local`);
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST ?? "127.0.0.1",
      port: Number(process.env.MYSQL_PORT ?? 3306),
      database: process.env.MYSQL_DATABASE ?? "lifeline",
      user: `ll_${role}`,
      password,
      connectionLimit: 5,
      dateStrings: true, // keep DATETIME as 'YYYY-MM-DD HH:MM:SS' — no timezone surprises
      decimalNumbers: true,
    });
    pools.set(role, pool);
  }
  return pool;
}

export async function query<T extends RowDataPacket>(role: Role, sql: string, params: unknown[] = []) {
  const [rows] = await db(role).query<T[]>(sql, params);
  return rows;
}

export async function execute(role: Role, sql: string, params: unknown[] = []) {
  const [result] = await db(role).execute<ResultSetHeader>(sql, params as never[]);
  return result;
}

/** CALL a procedure that returns one result set. */
export async function callProc<T extends RowDataPacket>(role: Role, sql: string, params: unknown[] = []) {
  const [sets] = await db(role).query<T[][]>(sql, params);
  return sets[0];
}

/**
 * Errors raised by our own triggers/procedures (SIGNAL SQLSTATE '45000') and by CHECK / UNIQUE
 * constraints are user mistakes, not crashes: turn them into a readable message.
 */
export function dbErrorMessage(err: unknown): string | null {
  const e = err as { errno?: number; sqlMessage?: string };
  switch (e?.errno) {
    case 1644: // SIGNAL from a trigger or procedure
      return e.sqlMessage ?? "Rejected by the database";
    case 3819: // CHECK constraint
      return `Invalid value (${e.sqlMessage?.match(/'([^']+)'/)?.[1] ?? "check constraint"})`;
    case 1062: { // UNIQUE
      const key = e.sqlMessage?.match(/for key '([^']+)'/)?.[1] ?? "";
      return `Already exists: ${key.split(".").pop() ?? "duplicate value"}`;
    }
    case 1216: // FK (short form, shown to accounts without access to the parent table)
    case 1452: // FK
      if (e.sqlMessage?.includes("pincode")) return "Unknown PIN code — it is not in the PIN-code list yet";
      return "Refers to a record that does not exist";
    case 1142:
    case 1143:
    case 1370: // permission denied for this MySQL role
      return "Your role is not allowed to do that (blocked by the database)";
    default:
      return null;
  }
}
