import "server-only";
import { NextResponse } from "next/server";
import { dbErrorMessage } from "./mysql";
import { HttpError } from "./session";

/** Wrap a route handler body: known errors become 4xx JSON, anything else a logged 500. */
export async function handle(fn: () => Promise<unknown>) {
  try {
    const data = await fn();
    return NextResponse.json(data ?? { ok: true });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = dbErrorMessage(err);
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: "Something went wrong on the server" }, { status: 500 });
  }
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
}

export function badRequest(message: string): never {
  throw new HttpError(400, message);
}

export function toInt(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) badRequest(`${field} must be a whole number`);
  return n;
}
