import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

// The 0004+ migrations must be additive only (safe on the live database) and
// must have been applied to the test database (npm run db:migrate).
const drizzleDir = path.resolve(__dirname, "../../drizzle");

describe("trainings migrations are additive", () => {
  const files = readdirSync(drizzleDir).filter(
    (f) => /^\d{4}_.*\.sql$/.test(f) && Number(f.slice(0, 4)) >= 4
  );

  it("exist in the journal order", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s has no destructive statement and every NOT NULL column has a DEFAULT", (f) => {
    const text = readFileSync(path.join(drizzleDir, f), "utf8");
    expect(text).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE|CONSTRAINT)\b/i);
    // An index holds no data: dropping one is allowed only AFTER the same file
    // has created its replacement unique index (0006 swaps the generator key).
    const drop = text.search(/\bDROP\s+INDEX\b/i);
    if (drop >= 0) {
      const create = text.search(/\bCREATE\s+UNIQUE\s+INDEX\b/i);
      expect(create, "DROP INDEX without a replacement created before it").toBeGreaterThanOrEqual(0);
      expect(create).toBeLessThan(drop);
    }
    expect(text).not.toMatch(/\bTRUNCATE\b|\bDELETE\s+FROM\b|\bRENAME\b|\bALTER\s+COLUMN\b/i);
    for (const stmt of text.split("--> statement-breakpoint")) {
      if (/ADD COLUMN/i.test(stmt) && /NOT NULL/i.test(stmt)) {
        expect(stmt, stmt).toMatch(/DEFAULT/i);
      }
    }
  });
});

describe("sports training columns exist in the test database", () => {
  it("has level, default_duration_min, default_price_cents, default_capacity with the expected defaults", async () => {
    const rows = await getDb().execute(sql`
      select column_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public' and table_name = 'sports'
        and column_name in ('level','default_duration_min','default_price_cents','default_capacity')`);
    const by = Object.fromEntries(
      (rows as unknown as { column_name: string; is_nullable: string; column_default: string | null }[]).map(
        (r) => [r.column_name, r]
      )
    );
    expect(Object.keys(by).sort()).toEqual([
      "default_capacity",
      "default_duration_min",
      "default_price_cents",
      "level",
    ]);
    expect(by.level.column_default).toContain("'all'");
    expect(by.default_capacity.column_default).toBe("12");
    expect(by.default_duration_min.is_nullable).toBe("YES");
    expect(by.default_price_cents.is_nullable).toBe("YES");
  });
});
