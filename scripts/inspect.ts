import { sql } from "drizzle-orm";
import { getDb } from "../src/db";

async function main() {
  const db = getDb();
  const tables = ["bookings", "class_sessions", "instructors", "gallery_items"];
  for (const t of tables) {
    const r = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${t}`
    );
    console.log(t, ":", r.rows.map((row) => row.column_name).join(", "));
  }
}

main().then(() => process.exit(0));
