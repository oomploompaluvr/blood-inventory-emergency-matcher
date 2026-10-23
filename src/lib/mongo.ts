import "server-only";
import { MongoClient, type Db } from "mongodb";

// MongoDB holds the documents that do not fit a fixed table schema:
//   screening_responses, questionnaire_templates  (Member A)
//   audit_log                                     (Member B)
// Collections, validators and indexes are created by `npm run mongo:init`.

const g = globalThis as unknown as { __llMongo?: Promise<MongoClient> };

export function mongoConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

export async function mongo(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in .env.local");
  g.__llMongo ??= new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect();
  return (await g.__llMongo).db(process.env.MONGODB_DB ?? "lifeline");
}
