// Админ списък „Резервации": парсване/валидиране на URL параметри и истинско
// SQL паргиниране (LIMIT/OFFSET) с общ брой заедно със същите JOIN-ове и WHERE
// като страницата с редовете. Никакъв PII не се логва оттук.
import { and, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { getDb, type Db } from "@/db";
import { bookings, classSessions, sports } from "@/db/schema";
import { fromSofiaDateTime } from "./format";

export const ADMIN_BOOKINGS_PAGE_SIZE = 25;

// Горна граница за номера на страница преди да видим броя редове: offset-ът
// остава малък int (≤ 2 499 975) и не може да прелее при умножение.
export const MAX_ADMIN_BOOKINGS_PAGE = 100_000;

export const BOOKING_STATUSES = ["pending", "confirmed", "cancelled"] as const;
export type BookingStatusFilter = (typeof BOOKING_STATUSES)[number];

export type AdminBookingsSearchParams = {
  [key: string]: string | string[] | undefined;
};

// Първата стойност при повторен параметър (?page=2&page=7 → "2"); липсващото
// остава undefined. Никога не хвърля грешка за боклук от клиента.
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Номер на страница от URL: боклук, отрицателни, дробни и огромни стойности
// се привеждат до 1; горната граница пази offset-а малък. Извъндиапазонът
// спрямо реалния брой страници се привежда по-късно от fetchAdminBookingsPage.
export function parsePageParam(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const trimmed = raw.trim();
  if (!/^\d{1,15}$/.test(trimmed)) return 1;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1) return 1;
  return Math.min(n, MAX_ADMIN_BOOKINGS_PAGE);
}

// „ГГГГ-ММ-ДД", който е и истинска календарна дата (2026-02-30 не минава).
export function isValidDateInput(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  // Date.UTC maps years 0–99 to 1900–1999; reject them before conversion.
  if (y < 100 || m < 1 || m > 12) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= daysInMonth;
}

export type AdminBookingsFilterError = {
  field: "from" | "to" | "status";
  message: string;
};

export type AdminBookingsFilters = {
  // [от 00:00 софийско] — включително локалната начална дата
  from?: Date;
  // [до 00:00 софийско на следващия ден) — включително локалната крайна дата
  toExclusive?: Date;
  status?: BookingStatusFilter;
};

export type ResolvedAdminBookingsFilters =
  | { ok: true; filters: AdminBookingsFilters; hasAny: boolean }
  | { ok: false; errors: AdminBookingsFilterError[] };

// Валидира raw стойностите от URL. Невалиден филтър НЕ се игнорира тихо —
// връща се грешка и страницата не пуска заявка, за да не покажем невярно
// „всички резервации" под прикритие на филтриран резултат.
export function resolveAdminBookingsFilters(input: {
  from?: string;
  to?: string;
  status?: string;
}): ResolvedAdminBookingsFilters {
  const errors: AdminBookingsFilterError[] = [];
  const filters: AdminBookingsFilters = {};
  let hasAny = false;

  const from = input.from?.trim();
  const to = input.to?.trim();
  const status = input.status?.trim();

  let fromDate: Date | undefined;
  if (from) {
    hasAny = true;
    if (isValidDateInput(from)) fromDate = fromSofiaDateTime(from, "00:00");
    else errors.push({ field: "from", message: "„От“ не е валидна дата (формат ГГГГ-ММ-ДД)." });
  }

  let toDate: Date | undefined;
  if (to) {
    hasAny = true;
    if (isValidDateInput(to)) toDate = fromSofiaDateTime(to, "00:00");
    else errors.push({ field: "to", message: "„До“ не е валидна дата (формат ГГГГ-ММ-ДД)." });
  }

  if (status) {
    hasAny = true;
    if ((BOOKING_STATUSES as readonly string[]).includes(status)) {
      filters.status = status as BookingStatusFilter;
    } else {
      errors.push({ field: "status", message: "Непозната стойност за статус." });
    }
  }

  if (fromDate && toDate && toDate.getTime() < fromDate.getTime()) {
    errors.push({ field: "to", message: "„До“ е преди „От“." });
  }

  if (errors.length > 0) return { ok: false, errors };

  if (fromDate) filters.from = fromDate;
  // Крайната дата е включителна: [от 00:00] … [до+1 ден 00:00) софийско.
  if (to && toDate) filters.toExclusive = fromSofiaDateTime(to, "00:00", 1);

  return { ok: true, filters, hasAny };
}

export type AdminBookingRow = {
  id: number;
  status: string;
  paymentMethod: string;
  userEmail: string;
  userPhone: string;
  createdAt: Date;
  startTime: Date;
  sportName: string;
  priceCents: number;
};

export type AdminBookingsPage = {
  rows: AdminBookingRow[];
  total: number;
  page: number;
  totalPages: number;
};

const rowSelection = {
  id: bookings.id,
  status: bookings.status,
  paymentMethod: bookings.paymentMethod,
  userEmail: bookings.userEmail,
  userPhone: bookings.userPhone,
  createdAt: bookings.createdAt,
  startTime: classSessions.startTime,
  sportName: sports.name,
  priceCents: classSessions.priceCents,
};

function bookingConditions(filters: AdminBookingsFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.from) conditions.push(gte(classSessions.startTime, filters.from));
  if (filters.toExclusive) conditions.push(lt(classSessions.startTime, filters.toExclusive));
  if (filters.status) conditions.push(eq(bookings.status, filters.status));
  if (conditions.length === 0) return undefined;
  return and(...conditions);
}

// Двете заявки (брой и редове) ползват един и същ `where` и едни и същи
// JOIN-ове — WHERE филтрира по class_sessions.start_time, така че броят без
// JOIN-овете би бил или грешен, или SQL грешка.
export async function fetchAdminBookingsPage(
  db: Db,
  filters: AdminBookingsFilters,
  requestedPage: number
): Promise<AdminBookingsPage> {
  const where = bookingConditions(filters);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .where(where);

  const totalPages = Math.max(1, Math.ceil(total / ADMIN_BOOKINGS_PAGE_SIZE));
  // Извъндиапазонна страница (напр. ?page=999) → последната валидна страница.
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * ADMIN_BOOKINGS_PAGE_SIZE;

  const rows = await db
    .select(rowSelection)
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .where(where)
    .orderBy(desc(bookings.createdAt), desc(bookings.id))
    .limit(ADMIN_BOOKINGS_PAGE_SIZE)
    .offset(offset);

  return { rows, total, page, totalPages };
}

// Удобство за страницата: един вход за суровите URL параметри.
export async function getAdminBookingsPage(
  sp: AdminBookingsSearchParams
): Promise<
  | { ok: false; errors: AdminBookingsFilterError[] }
  | { ok: true; hasAny: boolean; data: AdminBookingsPage }
> {
  const resolved = resolveAdminBookingsFilters({
    from: firstParam(sp.from),
    to: firstParam(sp.to),
    status: firstParam(sp.status),
  });
  if (!resolved.ok) return { ok: false, errors: resolved.errors };
  const data = await fetchAdminBookingsPage(
    getDb(),
    resolved.filters,
    parsePageParam(firstParam(sp.page))
  );
  return { ok: true, hasAny: resolved.hasAny, data };
}
