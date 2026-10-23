import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { query } from "../mysql";
import type { Role } from "../session";

export type StockStatus = "critical" | "low" | "ok";

export interface ForecastRow extends RowDataPacket {
  blood_group: string;
  family_code: string;
  family_name: string;
  units_available: number;
  expiring_in_3_days: number;
  earliest_expiry: string | null;
  issued_last_30d: number;
  avg_daily_use_30d: number;
  avg_daily_use_7d: number;
  low_days: number;
  critical_days: number;
  days_of_stock: number | null;
  demand_trend: "rising" | "falling" | "steady" | "none";
  stock_status: StockStatus;
}

export interface HospitalStockRow extends RowDataPacket {
  blood_group: string;
  family_code: string;
  units_available: number;
}

export interface TrendRow extends RowDataPacket {
  day: string;
  units_issued: number;
  avg_7d: number;
  avg_30d: number;
}

export async function shortageForecast(role: Role, family?: string) {
  return query<ForecastRow>(
    role,
    `SELECT * FROM v_shortage_forecast
      ${family ? "WHERE family_code = ?" : ""}
      ORDER BY FIELD(blood_group, 'O+','O-','A+','A-','B+','B-','AB+','AB-'), family_code`,
    family ? [family] : [],
  );
}

/** Hospitals only get counts, through the restricted view. */
export async function hospitalStock(role: Role) {
  return query<HospitalStockRow>(
    role,
    `SELECT * FROM v_hospital_stock
      ORDER BY FIELD(blood_group, 'O+','O-','A+','A-','B+','B-','AB+','AB-'), family_code`,
  );
}

export async function usageTrend(role: Role, bloodGroup: string, family: string, days = 60) {
  return query<TrendRow>(
    role,
    `SELECT day, units_issued, avg_7d, avg_30d
       FROM v_usage_trend
      WHERE blood_group = ? AND family_code = ? AND day >= CURDATE() - INTERVAL ? DAY
      ORDER BY day`,
    [bloodGroup, family, days],
  );
}
