import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Role = "admin" | "lab" | "hospital" | "donor";
export const ROLES: Role[] = ["admin", "lab", "hospital", "donor"];

export interface Session {
  userId: number | null;
  role: Role;
  name: string;
  donorId?: number | null; // set when role = donor
  hospitalId?: number | null; // set when role = hospital
}

// ---------------------------------------------------------------------------------------------
// SHARED CONTRACT between Member A and Member B.
//
// Member B owns authentication (users table, bcrypt, signed session cookie, route protection).
// Until that lands, this file uses an UNSIGNED development cookie picked on /login so every
// module can be built and demoed per role. Member B replaces the body of getSession() (and the
// /login page) — everything else in the app only depends on the Session shape above.
// ---------------------------------------------------------------------------------------------
export const DEV_SESSION_COOKIE = "ll_dev_session";

export async function getSession(): Promise<Session | null> {
  const raw = (await cookies()).get(DEV_SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Session;
    return ROLES.includes(s.role) ? s : null;
  } catch {
    return null;
  }
}

/** For pages: redirect to /login when signed out, or home when the role is not allowed. */
export async function requirePageRole(...allowed: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (allowed.length && !allowed.includes(session.role)) redirect("/");
  return session;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For API route handlers: throws HttpError(401/403), turned into JSON by handle(). */
export async function requireApiRole(...allowed: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Not signed in");
  if (allowed.length && !allowed.includes(session.role)) throw new HttpError(403, "Not allowed for your role");
  return session;
}

/** Change fields of the current session (e.g. a donor who just registered gets their donorId). */
export async function updateSession(patch: Partial<Session>) {
  const current = await getSession();
  if (!current) return;
  (await cookies()).set(DEV_SESSION_COOKIE, JSON.stringify({ ...current, ...patch }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}
