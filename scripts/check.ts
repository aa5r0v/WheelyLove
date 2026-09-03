import { getDb } from "../src/db";
import { classSessions, instructors, sports } from "../src/db/schema";

async function main() {
  const db = getDb();
  console.log("sports:", await db.select().from(sports));
  console.log("instructors:", await db.select().from(instructors));
  console.log("sessions count:", (await db.select().from(classSessions)).length);
}

main().then(() => process.exit(0));
