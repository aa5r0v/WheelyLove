import { getDb } from "../src/db";
import { classSessions, instructors, sports } from "../src/db/schema";

function at(daysFromNow: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const db = getDb();
  const allSports = await db.select().from(sports);
  const allInstructors = await db.select().from(instructors);
  const sportBySlug = Object.fromEntries(allSports.map((s) => [s.slug, s]));
  const instructorBySlug = Object.fromEntries(
    allInstructors.map((i) => [i.slug, i])
  );

  const rows = [
    {
      sportId: sportBySlug["spinning"].id,
      instructorId: instructorBySlug["ruzhi"].id,
      startTime: at(1, 18, 0),
      endTime: at(1, 19, 0),
      capacity: 15,
      priceCents: 600,
    },
    {
      sportId: sportBySlug["spinning"].id,
      instructorId: instructorBySlug["ruzhi"].id,
      startTime: at(3, 7, 0),
      endTime: at(3, 8, 0),
      capacity: 15,
      priceCents: 600,
    },
    {
      sportId: sportBySlug["pilates"].id,
      instructorId: instructorBySlug["ani"].id,
      startTime: at(1, 9, 0),
      endTime: at(1, 10, 0),
      capacity: 10,
      priceCents: 600,
    },
    {
      sportId: sportBySlug["pilates"].id,
      instructorId: instructorBySlug["ani"].id,
      startTime: at(2, 19, 0),
      endTime: at(2, 20, 0),
      capacity: 10,
      priceCents: 600,
    },
    {
      sportId: sportBySlug["steel-training"].id,
      instructorId: instructorBySlug["steel-coach"].id,
      startTime: at(2, 18, 0),
      endTime: at(2, 19, 0),
      capacity: 12,
      priceCents: 600,
    },
    {
      sportId: sportBySlug["steel-training"].id,
      instructorId: instructorBySlug["steel-coach"].id,
      startTime: at(4, 18, 0),
      endTime: at(4, 19, 0),
      capacity: 12,
      priceCents: 600,
    },
  ];

  await db.insert(classSessions).values(rows);
  console.log(`Seeded ${rows.length} sessions.`);
}

main().then(() => process.exit(0));
