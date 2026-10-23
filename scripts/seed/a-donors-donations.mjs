// Member A seed data: donors, ~6 months of whole-blood and apheresis donations (through
// sp_record_donation, so every row passes the eligibility trigger) and recall-call history.
// Eligibility in the simulation is computed from the database's own rule tables.
import { addDays, bulkInsert, DAY, rng, sqlDate, sqlDateTime, startOfToday } from "./util.mjs";

const FIRST_M = ["Aarav", "Vivaan", "Aditya", "Arjun", "Rohan", "Karthik", "Siddharth", "Rahul", "Manoj", "Suresh",
  "Nikhil", "Pranav", "Varun", "Harsha", "Akash", "Deepak", "Ganesh", "Kiran", "Mohit", "Naveen", "Prakash",
  "Rakesh", "Sandeep", "Tejas", "Vikram", "Yash", "Abhishek", "Chetan", "Darshan", "Imran"];
const FIRST_F = ["Ananya", "Diya", "Meera", "Priya", "Kavya", "Sneha", "Pooja", "Divya", "Lakshmi", "Nandini",
  "Aishwarya", "Bhavana", "Deepika", "Harini", "Keerthi", "Madhuri", "Nisha", "Pallavi", "Rashmi", "Shreya",
  "Swathi", "Tanvi", "Usha", "Varsha", "Fathima", "Sahana", "Ritu", "Anjali", "Gayathri", "Manasa"];
const LAST = ["Rao", "Sharma", "Reddy", "Iyer", "Nair", "Gowda", "Kumar", "Shetty", "Patil", "Menon", "Hegde",
  "Bhat", "Naidu", "Joshi", "Kulkarni", "Pillai", "Das", "Khan", "Verma", "Prasad", "Murthy", "Acharya",
  "Krishnan", "Raju", "Singh", "Desai", "Kamath", "Shenoy", "Varma", "Ali"];
const STREETS = ["1st Main", "2nd Cross", "4th Main", "8th Cross", "Temple Road", "MG Road", "Park Street",
  "Lake View Road", "Church Street", "School Road"];

const GROUP_SHARE = { "O+": 35, "B+": 30, "A+": 21, "AB+": 8, "O-": 2, "B-": 2, "A-": 1, "AB-": 1 };
const GROUPS = Object.keys(GROUP_SHARE);
const ageOn = (dob, date) => {
  let age = date.getFullYear() - dob.getFullYear();
  const m = date.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && date.getDate() < dob.getDate())) age--;
  return age;
};

export async function seedDonorsAndDonations(conn, { donors: donorCount = 900, days = 365 } = {}) {
  const r = rng(20261022);
  const today = startOfToday();

  // The same rule tables the trigger uses.
  const [typeRows] = await conn.query("SELECT * FROM donation_type");
  const types = Object.fromEntries(typeRows.map((t) => [t.type_code, t]));
  const [ruleRows] = await conn.query("SELECT previous_type, next_type, gender, min_days FROM donation_interval_rule");
  const ruleDays = new Map(ruleRows.map((x) => [`${x.previous_type}|${x.next_type}|${x.gender}`, x.min_days]));
  const [pins] = await conn.query("SELECT pincode, city FROM pincode");
  // Most donors live in Bengaluru; a few in Mysuru and Tumakuru (outside the default recall radius).
  const pinWeight = (p) => (p.city === "Bengaluru" ? 10 : 2);

  // --------------------------------------------------------------------------------- donors
  const donors = [];
  const usedPhones = new Set();
  for (let i = 0; i < donorCount; i++) {
    const gender = r.chance(0.62) ? "M" : r.chance(0.97) ? "F" : "O";
    const first = r.pick(gender === "F" ? FIRST_F : gender === "M" ? FIRST_M : [...FIRST_M, ...FIRST_F]);
    const last = r.pick(LAST);
    // Mostly 19-58, a few older donors who age out of eligibility.
    const age = r.chance(0.05) ? r.int(62, 70) : r.int(19, 58);
    const dob = addDays(today, -(age * 365 + r.int(0, 364)));
    let phone;
    do phone = `${r.pick(["9", "8", "7", "6"])}${r.int(100000000, 999999999)}`;
    while (usedPhones.has(phone));
    usedPhones.add(phone);
    const weight = r.chance(0.04) ? r.float(40, 44.5) : gender === "F" ? r.float(46, 78) : r.float(52, 95);
    donors.push({
      full_name: `${first} ${last}`,
      gender,
      date_of_birth: sqlDate(dob),
      dob,
      weight_kg: weight,
      blood_group: r.weighted(GROUPS, (g) => GROUP_SHARE[g]),
      phone,
      email: r.chance(0.6) ? `${first}.${last}${i}`.toLowerCase() + "@example.com" : null,
      preferred_channel: r.weighted(["call", "sms", "email"], (c) => ({ call: 5, sms: 3, email: 2 })[c]),
      address_line: `#${r.int(1, 480)}, ${r.pick(STREETS)}`,
      pincode: r.weighted(pins, pinWeight).pincode,
      is_active: !r.chance(0.015),
      registered_at: sqlDateTime(addDays(today, -r.int(days + 10, days + 400))),
      // hidden traits that shape the simulation
      propensity: r.chance(0.25) ? r.float(2, 4) : r.float(0.2, 1.2), // regulars vs occasional donors
      reliability: r.float(0.1, 0.95, 2), // chance of turning up when recalled
      apheresisRegular: false,
      history: [], // { type, at }
    });
  }
  // Rare groups need a few more donors or the recall list is empty.
  for (const d of donors.slice(0, 40)) d.blood_group = r.pick(["O-", "B-", "A-", "AB-"]);
  // About 5% of donors are regular platelet-apheresis donors.
  for (const d of donors) if (d.weight_kg >= 55 && ageOn(d.dob, today) <= 55 && r.chance(0.06)) d.apheresisRegular = true;

  await bulkInsert(conn, "donor",
    ["full_name", "gender", "date_of_birth", "weight_kg", "blood_group", "phone", "email",
      "preferred_channel", "address_line", "pincode", "is_active", "registered_at"],
    donors.map((d) => [d.full_name, d.gender, d.date_of_birth, d.weight_kg, d.blood_group, d.phone, d.email,
      d.preferred_channel, d.address_line, d.pincode, d.is_active, d.registered_at]));
  const [[{ firstId }]] = await conn.query("SELECT MIN(donor_id) AS firstId FROM donor");
  donors.forEach((d, i) => (d.donor_id = firstId + i));

  // --------------------------------------------------------------------------------- eligibility
  const eligibleOn = (d, type, at) => {
    const t = types[type];
    const age = ageOn(d.dob, at);
    if (!d.is_active || d.weight_kg < t.min_weight_kg || age < t.min_age || age > t.max_age) return false;
    if (!d.history.length && age > t.max_age_first) return false;
    for (const h of d.history) {
      const gap = ruleDays.get(`${h.type}|${type}|${d.gender}`);
      if (gap && at.getTime() < h.at.getTime() + gap * DAY) return false;
    }
    const same = d.history.filter((h) => h.type === type);
    if (t.max_per_7_days && same.filter((h) => at - h.at < 7 * DAY).length >= t.max_per_7_days) return false;
    if (t.max_per_365_days && same.filter((h) => at - h.at < 365 * DAY).length >= t.max_per_365_days) return false;
    return true;
  };

  // --------------------------------------------------------------------------------- donations
  const scheduled = new Map(); // day index -> donors coming in because they were recalled
  const donations = [];
  const screeningVisits = []; // { donor, at, deferred } — used by the MongoDB screening seed
  const bagSeq = {};
  let recallCount = 0;

  const record = async (d, type, at) => {
    const year = at.getFullYear();
    bagSeq[year] = (bagSeq[year] ?? 0) + 1;
    const bag = `BB${year}${String(bagSeq[year]).padStart(6, "0")}`;
    const hb = d.gender === "F" ? r.float(12.5, 15.2) : r.float(13.0, 16.8);
    const weight = Math.max(Number((d.weight_kg + (r.next() - 0.5) * 2).toFixed(1)), types[type].min_weight_kg);
    const volume = type === "plateletpheresis" ? r.int(200, 300) : weight >= 55 ? 450 : 350;
    const platelets = type === "plateletpheresis" ? r.int(170, 380) : null;
    await conn.query("CALL sp_record_donation(?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, TRUE, @id)",
      [d.donor_id, type, bag, sqlDateTime(at), volume, hb, weight, platelets]);
    d.history.push({ type, at });
    donations.push({ donorId: d.donor_id, type, donatedAt: at });
    screeningVisits.push({ donor: d, at: new Date(at.getTime() - r.int(10, 40) * 60_000), deferred: false });
  };

  for (let day = -days; day <= -1; day++) {
    const date = addDays(today, day);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const at = () => new Date(date.getTime() + r.int(9 * 60, 17 * 60) * 60_000);

    // Recall drives: every ~11 days call whole-blood donors of a group that is running low.
    if ((day + days) % 11 === 5) {
      const group = r.weighted(GROUPS, (g) => (g.endsWith("-") ? 6 : GROUP_SHARE[g] / 5));
      const pool = donors.filter((d) => d.blood_group === group && eligibleOn(d, "whole_blood", date)).slice(0, 6);
      for (const d of pool) {
        const contactedAt = new Date(date.getTime() + r.int(9, 17) * 3_600_000);
        await conn.query(
          "INSERT INTO recall_contact (donor_id, blood_group, donation_type, contacted_at, channel) VALUES (?, ?, 'whole_blood', ?, ?)",
          [d.donor_id, group, sqlDateTime(contactedAt), d.preferred_channel]);
        recallCount++;
        if (r.chance(d.reliability)) {
          const comeOn = day + r.int(1, 9);
          if (comeOn <= -1) scheduled.set(comeOn, [...(scheduled.get(comeOn) ?? []), d]);
        }
      }
    }

    // Whole-blood walk-ins and recalled donors.
    const visitors = [...(scheduled.get(day) ?? [])];
    const walkIns = r.poisson(weekend ? 9 : 6);
    for (let i = 0; i < walkIns; i++) {
      const pool = donors.filter((d) => !d.apheresisRegular && eligibleOn(d, "whole_blood", date) && !visitors.includes(d));
      if (!pool.length) break;
      visitors.push(r.weighted(pool, (d) => d.propensity));
    }
    for (const d of visitors) {
      const when = at();
      if (!eligibleOn(d, "whole_blood", when)) continue;
      // About 1 in 7 visitors is deferred by the screening questionnaire and does not donate.
      if (r.chance(0.14)) {
        screeningVisits.push({ donor: d, at: when, deferred: true });
        continue;
      }
      await record(d, "whole_blood", when);
    }

    // Platelet apheresis appointments (weekdays).
    if (!weekend) {
      for (let i = r.poisson(0.9); i > 0; i--) {
        const when = at();
        const pool = donors.filter((d) => d.apheresisRegular && eligibleOn(d, "plateletpheresis", when));
        if (pool.length) await record(r.pick(pool), "plateletpheresis", when);
      }
    }
  }

  // Close old recall calls that did not lead to a donation (the trigger already marked the ones that did).
  await conn.query(`
    UPDATE recall_contact
       SET outcome = IF(MOD(contact_id, 3) = 0, 'declined', 'no_response'),
           responded_at = contacted_at + INTERVAL 2 DAY
     WHERE outcome = 'pending' AND contacted_at < NOW() - INTERVAL 14 DAY`);

  return { donors, donations, screeningVisits, recallCount };
}
