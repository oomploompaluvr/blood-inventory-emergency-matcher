import mysql from "mysql2/promise";

/** Deterministic random numbers, so every reset produces the same sample data. */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max, dp = 1) => Number((min + next() * (max - min)).toFixed(dp)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    weighted(items, weightOf) {
      const total = items.reduce((s, x) => s + weightOf(x), 0);
      let r = next() * total;
      for (const x of items) if ((r -= weightOf(x)) <= 0) return x;
      return items[items.length - 1];
    },
    /** Poisson-distributed count with mean lambda. */
    poisson(lambda) {
      const L = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= next();
      } while (p > L);
      return k - 1;
    },
  };
}

const pad = (n) => String(n).padStart(2, "0");
/** JS Date -> 'YYYY-MM-DD HH:MM:SS' in local time (what MySQL DATETIME expects). */
export const sqlDateTime = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const sqlDate = (d) => sqlDateTime(d).slice(0, 10);
export const DAY = 86_400_000;

export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(d, days) {
  return new Date(d.getTime() + days * DAY);
}

/** Seeding runs as the schema owner (it calls procedures and writes every table). */
export async function ownerConnection() {
  for (const k of ["MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_OWNER_USER", "MYSQL_OWNER_PASSWORD"]) {
    if (!process.env[k]) throw new Error(`${k} is not set (run with --env-file=.env.local)`);
  }
  return mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_OWNER_USER,
    password: process.env.MYSQL_OWNER_PASSWORD,
    dateStrings: true,
    decimalNumbers: true,
  });
}

/** INSERT many rows in chunks. */
export async function bulkInsert(conn, table, columns, rows, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    await conn.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ?`, [part]);
  }
}
