import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions, instructors, sports } from "@/db/schema";
import { fromSofiaDateTime } from "./format";
import {
  ADMIN_BOOKINGS_PAGE_SIZE,
  MAX_ADMIN_BOOKINGS_PAGE,
  fetchAdminBookingsPage,
  firstParam,
  isValidDateInput,
  parsePageParam,
  resolveAdminBookingsFilters,
  type AdminBookingsFilters,
} from "./admin-bookings";

// ============================================================ чисти параметри

describe("firstParam", () => {
  it("взима първата стойност при масив (повторен URL параметър)", () => {
    expect(firstParam(["9", "2"])).toBe("9");
    expect(firstParam(["5"])).toBe("5");
  });

  it("поддържа липсваща и обикновена стойност", () => {
    expect(firstParam(undefined)).toBeUndefined();
    expect(firstParam("3")).toBe("3");
  });
});

describe("parsePageParam", () => {
  it("липсваща, празна и боклук стойност → 1", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("")).toBe(1);
    expect(parsePageParam("abc")).toBe(1);
    expect(parsePageParam("1e3")).toBe(1);
    expect(parsePageParam("1.5")).toBe(1);
    expect(parsePageParam("+2")).toBe(1);
    expect(parsePageParam("2,3")).toBe(1);
  });

  it("отрицателни и нула → 1", () => {
    expect(parsePageParam("-3")).toBe(1);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-0")).toBe(1);
  });

  it("валидни номера минават, с trim и водещи нули", () => {
    expect(parsePageParam("1")).toBe(1);
    expect(parsePageParam(" 2 ")).toBe(2);
    expect(parsePageParam("007")).toBe(7);
  });

  it("огромни стойности се ограничават до MAX_ADMIN_BOOKINGS_PAGE", () => {
    expect(parsePageParam("100001")).toBe(MAX_ADMIN_BOOKINGS_PAGE);
    expect(parsePageParam("99999999999999999999999999")).toBe(1); // над 15 цифри
    expect(parsePageParam("999999999999999")).toBe(MAX_ADMIN_BOOKINGS_PAGE);
  });
});

describe("isValidDateInput", () => {
  it("rejects years that Date.UTC would reinterpret as the twentieth century", () => {
    for (const date of ["0000-01-01", "0001-01-01", "0099-12-31"]) {
      expect(isValidDateInput(date)).toBe(false);
      expect(resolveAdminBookingsFilters({ from: date }).ok).toBe(false);
      expect(resolveAdminBookingsFilters({ to: date }).ok).toBe(false);
    }
  });

  it("приема истински календарни дати", () => {
    expect(isValidDateInput("2026-03-08")).toBe(true);
    expect(isValidDateInput("2024-02-29")).toBe(true); // високосна
    expect(isValidDateInput("2026-12-31")).toBe(true);
  });

  it("отхвърля несъществуващи календарни дати", () => {
    expect(isValidDateInput("2026-02-30")).toBe(false);
    expect(isValidDateInput("2026-04-31")).toBe(false);
    expect(isValidDateInput("2026-13-01")).toBe(false);
    expect(isValidDateInput("2026-00-10")).toBe(false);
    expect(isValidDateInput("2026-03-00")).toBe(false);
  });

  it("отхвърля грешни формати и боклук", () => {
    expect(isValidDateInput("2026-3-8")).toBe(false);
    expect(isValidDateInput("26-03-08")).toBe(false);
    expect(isValidDateInput("2026-03-08T00:00")).toBe(false);
    expect(isValidDateInput("abcd-ef-gh")).toBe(false);
    expect(isValidDateInput("")).toBe(false);
    expect(isValidDateInput("'2026-03-08'")).toBe(false);
    expect(isValidDateInput("2026-03-08'; DROP TABLE bookings;--")).toBe(false);
  });
});

describe("resolveAdminBookingsFilters", () => {
  it("без параметри: ok, без филтри, hasAny=false", () => {
    const r = resolveAdminBookingsFilters({});
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hasAny).toBe(false);
      expect(r.filters).toEqual({});
    }
  });

  it("само from: началото на деня в софийско време", () => {
    const r = resolveAdminBookingsFilters({ from: "2026-03-08" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.filters.from?.getTime()).toBe(
        fromSofiaDateTime("2026-03-08", "00:00").getTime()
      );
      expect(r.filters.toExclusive).toBeUndefined();
    }
  });

  it("to е включителна: крайът е 00:00 на следващия ден (ексключивно)", () => {
    const r = resolveAdminBookingsFilters({ to: "2026-03-08" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.filters.toExclusive?.getTime()).toBe(
        fromSofiaDateTime("2026-03-08", "00:00", 1).getTime()
      );
      expect(r.filters.from).toBeUndefined();
    }
  });

  it("невалидна from дата → грешка за полето, не тихо разширяване", () => {
    const r = resolveAdminBookingsFilters({ from: "2026-02-30" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.field === "from")).toBe(true);
  });

  it("невалидна to стойност → грешка за полето", () => {
    const r = resolveAdminBookingsFilters({ to: "10.03.2026" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.field === "to")).toBe(true);
  });

  it("обърнат диапазон (до преди от) → четима грешка", () => {
    const r = resolveAdminBookingsFilters({ from: "2026-03-10", to: "2026-03-08" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const e = r.errors.find((x) => x.field === "to");
      expect(e?.message).toContain("преди");
    }
  });

  it("еднакви дати са валидни (цял един ден)", () => {
    const r = resolveAdminBookingsFilters({ from: "2026-03-08", to: "2026-03-08" });
    expect(r.ok).toBe(true);
  });

  it("валиден статус минава, боклук статус → грешка", () => {
    expect(resolveAdminBookingsFilters({ status: "pending" }).ok).toBe(true);
    expect(resolveAdminBookingsFilters({ status: "confirmed" }).ok).toBe(true);
    expect(resolveAdminBookingsFilters({ status: "cancelled" }).ok).toBe(true);
    const bad = resolveAdminBookingsFilters({ status: "banana" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.some((e) => e.field === "status")).toBe(true);
  });

  it("празният статус (Всички) не е филтър", () => {
    const r = resolveAdminBookingsFilters({ status: "" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hasAny).toBe(false);
      expect(r.filters.status).toBeUndefined();
    }
  });

  it("невалидните полета се докладват едновременно, не само първото", () => {
    const r = resolveAdminBookingsFilters({
      from: "2026-02-30",
      to: "боклук",
      status: "banana",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const fields = r.errors.map((e) => e.field).sort();
      expect(fields).toEqual(["from", "status", "to"]);
    }
  });
});

// ============================================================ DST граници

describe("resolveAdminBookingsFilters: DST граници (Europe/Sofia)", () => {
  const dayLengthMs = (from: string, to: string) => {
    const r = resolveAdminBookingsFilters({ from, to });
    if (!r.ok || !r.filters.from || !r.filters.toExclusive) throw new Error("unreachable");
    return r.filters.toExclusive.getTime() - r.filters.from.getTime();
  };

  it("пролетното превъртане (2026-03-29): локалният ден е 23 часа", () => {
    // Наивна UTC математика би дала 24 ч; в София 03:00 става 04:00.
    expect(dayLengthMs("2026-03-29", "2026-03-29")).toBe(23 * 3600 * 1000);
  });

  it("есенното връщане (2026-10-25): локалният ден е 25 часа", () => {
    // 04:00 се връща на 03:00 — денят се повтаря един час.
    expect(dayLengthMs("2026-10-25", "2026-10-25")).toBe(25 * 3600 * 1000);
  });

  it("обхвати през сезонните превключвания се броят в локални дни", () => {
    // 27–31 март 2026: 5 календарни дни, от които един е 23 ч → 119 ч.
    expect(dayLengthMs("2026-03-27", "2026-03-31")).toBe(119 * 3600 * 1000);
    // 23–27 октомври 2026: 5 календарни дни, от които един е 25 ч → 121 ч.
    expect(dayLengthMs("2026-10-23", "2026-10-27")).toBe(121 * 3600 * 1000);
  });

  it("границите са точно 00:00 софийско на съответните дни", () => {
    const r = resolveAdminBookingsFilters({ from: "2026-03-29", to: "2026-10-25" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.filters.from?.getTime()).toBe(fromSofiaDateTime("2026-03-29", "00:00").getTime());
      expect(r.filters.toExclusive?.getTime()).toBe(
        fromSofiaDateTime("2026-10-25", "00:00", 1).getTime()
      );
    }
  });
});

// ============================================================ реална Postgres

// Всички резервации споделят ЕДИН createdAt — така ORDER BY created_at DESC
// само по него е недетерминиран и тестът доказва нуждата от id DESC tiebreaker.
const SAME_CREATED_AT = new Date("2026-11-01T12:00:00.000Z");

type Fixture = { email: string; sessionKey: string; status: "pending" | "confirmed" | "cancelled" };

describe("fetchAdminBookingsPage (реална Postgres)", () => {
  const db = getDb();
  const tag = `abq-${Date.now()}`;
  let sportId: number;
  let instructorId: number;
  let sessionIds: number[];
  let fixtures: Fixture[] = [];

  beforeAll(async () => {
    const [sport] = await db
      .insert(sports)
      .values({ slug: `${tag}-sport`, name: "ABQ Test Sport" })
      .returning();
    sportId = sport.id;

    const [instructor] = await db
      .insert(instructors)
      .values({ slug: `${tag}-instructor`, name: "ABQ Test Instructor" })
      .returning();
    instructorId = instructor.id;

    const mk = (start: Date) => ({
      sportId,
      instructorId,
      startTime: start,
      endTime: new Date(start.getTime() + 3600_000),
      capacity: 100,
      priceCents: 600,
    });
    const rows = await db
      .insert(classSessions)
      .values([
        mk(fromSofiaDateTime("2026-03-28", "10:00")), // s1: ден преди пролетното превключване
        mk(fromSofiaDateTime("2026-03-29", "04:30")), // s2: ДЕНЯ на превъртането (03:00→04:00)
        mk(fromSofiaDateTime("2026-10-25", "01:30")), // s3: ДНЯ на връщането (04:00→03:00)
        mk(fromSofiaDateTime("2026-10-26", "09:00")), // s4: ден след есенното връщане
      ])
      .returning({ id: classSessions.id });
    sessionIds = rows.map((r) => r.id);

    // 20 резервации на всяка от s1..s3 (статус по i%3) + 5 потвърдени на s4.
    const statuses = ["pending", "confirmed", "cancelled"] as const;
    const values: (typeof bookings.$inferInsert)[] = [];
    fixtures = [];
    let n = 0;
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < 20; i++) {
        const status = statuses[i % 3];
        const email = `${tag}-${n}@test.local`;
        values.push({
          sessionId: sessionIds[s],
          userId: `${tag}-user-${n}`,
          userEmail: email,
          userPhone: "+359900000000",
          status,
          paymentMethod: "cash",
          createdAt: SAME_CREATED_AT,
        });
        fixtures.push({ email, sessionKey: `s${s + 1}`, status });
        n++;
      }
    }
    for (let i = 0; i < 5; i++) {
      const email = `${tag}-${n}@test.local`;
      values.push({
        sessionId: sessionIds[3],
        userId: `${tag}-user-${n}`,
        userEmail: email,
        userPhone: "+359900000000",
        status: "confirmed",
        paymentMethod: "cash",
        createdAt: SAME_CREATED_AT,
      });
      fixtures.push({ email, sessionKey: "s4", status: "confirmed" });
      n++;
    }
    await db.insert(bookings).values(values);
  });

  afterAll(async () => {
    // FK ред: bookings → class_sessions → sports/instructors.
    if (sessionIds?.length) await db.delete(bookings).where(inArray(bookings.sessionId, sessionIds));
    if (sessionIds?.length) await db.delete(classSessions).where(inArray(classSessions.id, sessionIds));
    if (instructorId) await db.delete(instructors).where(eq(instructors.id, instructorId));
    if (sportId) await db.delete(sports).where(eq(sports.id, sportId));
  });

  const sessionOf = (email: string) => fixtures.find((f) => f.email === email)?.sessionKey;

  // Обхожда всички страници за даден филтър и връща редовете в ред.
  async function collectAll(filters: AdminBookingsFilters) {
    const first = await fetchAdminBookingsPage(db, filters, 1);
    const all = [...first.rows];
    for (let p = 2; p <= first.totalPages; p++) {
      const pageData = await fetchAdminBookingsPage(db, filters, p);
      expect(pageData.page).toBe(p);
      all.push(...pageData.rows);
    }
    return { first, all };
  }

  it("без филтри: 3 страници по 25, стабилен ред, без дублирани редове", async () => {
    const { first, all } = await collectAll({});
    expect(first.total).toBe(65);
    expect(first.totalPages).toBe(3);
    expect(first.rows.length).toBe(ADMIN_BOOKINGS_PAGE_SIZE);

    // Всички имат един и същи createdAt → редът се определя от id DESC.
    expect(new Set(all.map((r) => r.createdAt.getTime())).size).toBe(1);
    const ids = all.map((r) => r.id);
    expect(new Set(ids).size).toBe(65);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).toBeLessThan(ids[i - 1]);

    // Независим оракул: същите id-та, направо от базата.
    const expected = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(inArray(bookings.sessionId, sessionIds))
      .orderBy(desc(bookings.createdAt), desc(bookings.id));
    expect(ids).toEqual(expected.map((r) => r.id));
  });

  it("страница 2 е различен набор и заедно с 1 и 3 пълват точно 65 реда", async () => {
    const p1 = await fetchAdminBookingsPage(db, {}, 1);
    const p2 = await fetchAdminBookingsPage(db, {}, 2);
    const p3 = await fetchAdminBookingsPage(db, {}, 3);
    expect(p2.rows.length).toBe(25);
    expect(p3.rows.length).toBe(15);
    const union = new Set([...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id));
    expect(union.size).toBe(65);
    // Максималният id на страница 2 е по-малък от минималния на страница 1.
    expect(Math.max(...p2.rows.map((r) => r.id))).toBeLessThan(
      Math.min(...p1.rows.map((r) => r.id))
    );
  });

  it("извъндиапазонна страница се привежда към последната валидна", async () => {
    const page = await fetchAdminBookingsPage(db, {}, 999);
    expect(page.page).toBe(3);
    expect(page.rows.length).toBe(15);
    expect(page.totalPages).toBe(3);

    const page4 = await fetchAdminBookingsPage(db, {}, 4);
    expect(page4.page).toBe(3);
  });

  it("филтър по статус: броят и всички редове са с този статус", async () => {
    // 21 pending (7 на всяка от s1..s3), 26 confirmed (+5 на s4), 18 cancelled.
    const pending = await collectAll({ status: "pending" });
    expect(pending.first.total).toBe(21);
    expect(pending.all.every((r) => r.status === "pending")).toBe(true);

    const confirmed = await collectAll({ status: "confirmed" });
    expect(confirmed.first.total).toBe(26);
    expect(confirmed.all.every((r) => r.status === "confirmed")).toBe(true);

    const cancelled = await collectAll({ status: "cancelled" });
    expect(cancelled.first.total).toBe(18);
    expect(cancelled.all.every((r) => r.status === "cancelled")).toBe(true);
    expect(cancelled.all.length).toBe(18); // броят == събраните редове
  });

  it("дата на тренировката: включително от/до, през пролетното превъртане", async () => {
    // 28–29 март обхваща s1 (28-ми, 10:00) и s2 (29-ти, 04:30 след превъртането).
    const r1 = resolveAdminBookingsFilters({ from: "2026-03-28", to: "2026-03-29" });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      const { first, all } = await collectAll(r1.filters);
      expect(first.total).toBe(40);
      expect(all.length).toBe(40);
      const keys = new Set(all.map((r) => sessionOf(r.userEmail)));
      expect(keys).toEqual(new Set(["s1", "s2"]));
    }

    // Само 29 март (23-часов локален ден): само s2.
    const r2 = resolveAdminBookingsFilters({ from: "2026-03-29", to: "2026-03-29" });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const { first, all } = await collectAll(r2.filters);
      expect(first.total).toBe(20);
      expect(all.every((r) => sessionOf(r.userEmail) === "s2")).toBe(true);
    }
  });

  it("дата на тренировката: през есенното връщане на часовника", async () => {
    // Само 25 октомври (25-часов локален ден): само s3 (01:30 софийско).
    const r1 = resolveAdminBookingsFilters({ from: "2026-10-25", to: "2026-10-25" });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      const { first, all } = await collectAll(r1.filters);
      expect(first.total).toBe(20);
      expect(all.every((r) => sessionOf(r.userEmail) === "s3")).toBe(true);
    }

    // Само 26 октомври: само s4 (затова s4 има собствени резервации).
    const r2 = resolveAdminBookingsFilters({ from: "2026-10-26", to: "2026-10-26" });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const { first, all } = await collectAll(r2.filters);
      expect(first.total).toBe(5);
      expect(all.every((r) => sessionOf(r.userEmail) === "s4")).toBe(true);
    }
  });

  it("комбинирани филтри: диапазон + статус едновременно", async () => {
    // 25–26 октомври + confirmed → s3 (7 confirmed) + s4 (5 confirmed) = 12.
    const r = resolveAdminBookingsFilters({
      from: "2026-10-25",
      to: "2026-10-26",
      status: "confirmed",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const { first, all } = await collectAll(r.filters);
      expect(first.total).toBe(12);
      expect(all.length).toBe(12);
      expect(all.every((x) => x.status === "confirmed")).toBe(true);
      const bySession = new Map<string, number>();
      for (const row of all) {
        const k = sessionOf(row.userEmail) ?? "?";
        bySession.set(k, (bySession.get(k) ?? 0) + 1);
      }
      expect(bySession.get("s3")).toBe(7);
      expect(bySession.get("s4")).toBe(5);
    }
  });

  it("празен резултат: total 0, една страница, нула реда", async () => {
    const r = resolveAdminBookingsFilters({ from: "2027-01-01", to: "2027-01-02" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const page = await fetchAdminBookingsPage(db, r.filters, 1);
      expect(page.total).toBe(0);
      expect(page.totalPages).toBe(1);
      expect(page.rows).toEqual([]);
    }
  });
});
