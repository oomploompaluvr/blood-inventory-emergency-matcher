// Creates the MongoDB collections with JSON-schema validators and indexes, and installs the
// screening questionnaire template. Safe to re-run.   npm run mongo:init
import { MongoClient } from "mongodb";
import { pathToFileURL } from "node:url";
import { DEFAULT_TEMPLATE } from "../src/lib/screening-rules.mjs";

// ---------------------------------------------------------------- Member A collections
const SCREENING_VALIDATOR = {
  $jsonSchema: {
    bsonType: "object",
    required: ["donorId", "templateVersion", "submittedAt", "answers", "result", "deferralReasons"],
    properties: {
      donorId: { bsonType: "int", minimum: 1, description: "donor.donor_id in MySQL" },
      donorName: { bsonType: "string" },
      gender: { enum: ["M", "F", "O"] },
      bloodGroup: { enum: ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"] },
      templateVersion: { bsonType: "int", minimum: 1 },
      submittedAt: { bsonType: "date" },
      answers: {
        bsonType: "array",
        items: {
          bsonType: "object",
          required: ["questionId", "question", "answer"],
          properties: { questionId: { bsonType: "string" }, question: { bsonType: "string" } },
        },
      },
      result: { enum: ["eligible", "deferred"] },
      deferralReasons: { bsonType: "array", items: { bsonType: "string" } },
      deferredUntil: { bsonType: ["date", "null"] },
      reviewNote: { bsonType: "string", maxLength: 500 },
    },
  },
};

const TEMPLATE_VALIDATOR = {
  $jsonSchema: {
    bsonType: "object",
    required: ["version", "title", "active", "questions"],
    properties: {
      version: { bsonType: "int", minimum: 1 },
      active: { bsonType: "bool" },
      questions: {
        bsonType: "array",
        minItems: 1,
        items: {
          bsonType: "object",
          required: ["id", "text", "type"],
          properties: { type: { enum: ["yes_no", "number", "text", "choice"] } },
        },
      },
    },
  },
};

async function ensureCollection(db, name, validator) {
  const exists = await db.listCollections({ name }).hasNext();
  if (exists) await db.command({ collMod: name, validator, validationLevel: "strict" });
  else await db.createCollection(name, { validator, validationLevel: "strict" });
}

export async function initMongo(db) {
  await ensureCollection(db, "questionnaire_templates", TEMPLATE_VALIDATOR);
  await ensureCollection(db, "screening_responses", SCREENING_VALIDATOR);

  await db.collection("questionnaire_templates").createIndex({ version: 1 }, { unique: true });
  const responses = db.collection("screening_responses");
  await responses.createIndex({ donorId: 1, submittedAt: -1 });
  await responses.createIndex({ result: 1, submittedAt: -1 });
  await responses.createIndex({ "deferrals.reason": 1 });

  await db.collection("questionnaire_templates").updateOne(
    { version: DEFAULT_TEMPLATE.version },
    { $setOnInsert: DEFAULT_TEMPLATE },
    { upsert: true },
  );

  // ---------------------------------------------------------- Member B: audit_log goes here
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set in .env.local");
    process.exit(1);
  }
  const client = await new MongoClient(process.env.MONGODB_URI).connect();
  try {
    await initMongo(client.db(process.env.MONGODB_DB ?? "lifeline"));
    console.log("MongoDB collections, validators and indexes ready.");
  } finally {
    await client.close();
  }
}
