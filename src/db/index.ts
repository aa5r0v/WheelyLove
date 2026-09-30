import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

function createDb() {
  const client = postgres(process.env.DATABASE_URL!, { max: 10 });
  return drizzle(client, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}

export type Db = ReturnType<typeof getDb>;
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
