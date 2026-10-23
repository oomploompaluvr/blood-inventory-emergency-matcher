// Loads ~12 months of sample history into a freshly reset database.
//   npm run db:reset && npm run db:seed
import { MongoClient } from "mongodb";
import { initMongo } from "../mongo-init.mjs";
import { seedDonorsAndDonations } from "./a-donors-donations.mjs";
import { seedScreening } from "./a-screening.mjs";
import { DEMO_PASSWORD, seedHospitalActivity } from "./b-hospital-activity.mjs";
import { ownerConnection } from "./util.mjs";

const started = Date.now();
const conn = await ownerConnection();
try {
  const [[{ n }]] = await conn.query("SELECT COUNT(*) AS n FROM donor");
  if (n > 0) throw new Error("Database already has data — run `npm run db:reset` first.");

  console.log("Member A: donors, donations, recall history ...");
  const a = await seedDonorsAndDonations(conn);
  const apheresis = a.donations.filter((d) => d.type === "plateletpheresis").length;
  console.log(`  ${a.donors.length} donors, ${a.donations.length} donations (${apheresis} apheresis), ${a.recallCount} recall calls`);

  console.log("Member B (starter): hospitals, users, tests, requests, issues ...");
  const b = await seedHospitalActivity(conn);
  console.log(`  ${b.hospitals} hospitals, ${b.patients} patients, ${b.users} users, ${b.tests} tests, ${b.requests} requests, ` +
    `${b.issues} units issued, ${b.pools} platelet pools, ${b.aliquotSplits} paediatric splits`);

  // What the nightly expiry job would have done over those six months.
  await conn.query(`UPDATE blood_component SET status = 'expired', status_changed_at = expires_at
                     WHERE status IN ('collected', 'testing', 'available', 'reserved') AND expires_at < NOW()`);

  if (process.env.MONGODB_URI) {
    console.log("MongoDB: collections + screening questionnaires ...");
    const client = await new MongoClient(process.env.MONGODB_URI).connect();
    try {
      const db = client.db(process.env.MONGODB_DB ?? "lifeline");
      await initMongo(db);
      console.log(`  ${await seedScreening(db, a.screeningVisits)} screening responses`);
    } finally {
      await client.close();
    }
  } else {
    console.log("MONGODB_URI not set — skipped MongoDB seed.");
  }

  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s. Demo password for every seeded login: ${DEMO_PASSWORD}`);
} finally {
  await conn.end();
}
