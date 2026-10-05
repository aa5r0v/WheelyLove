import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings, classSessions } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin-page";

export default async function AdminDashboard() {
  await requireAdminPage();
  const db = getDb();

  const [[{ totalSessions }], [{ totalBookings }], [{ revenueCents }]] =
    await Promise.all([
      db.select({ totalSessions: sql<number>`count(*)`.mapWith(Number) }).from(classSessions),
      db
        .select({ totalBookings: sql<number>`count(*)`.mapWith(Number) })
        .from(bookings)
        .where(sql`${bookings.status} in ('confirmed', 'pending')`),
      db
        .select({
          revenueCents: sql<number>`coalesce(sum(${classSessions.priceCents}), 0)`.mapWith(Number),
        })
        .from(bookings)
        .innerJoin(classSessions, sql`${bookings.sessionId} = ${classSessions.id}`)
        .where(sql`${bookings.status} = 'confirmed'`),
    ]);

  return (
    <div>
      <h1 className="text-2xl font-bold">Табло</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">Насрочени часове</p>
          <p className="mt-1 text-3xl font-bold">{totalSessions}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">Активни резервации</p>
          <p className="mt-1 text-3xl font-bold">{totalBookings}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <p className="text-sm text-neutral-500">Приходи (потвърдени)</p>
          <p className="mt-1 text-3xl font-bold">
            {(revenueCents / 100).toFixed(2)} €
          </p>
        </div>
      </div>
    </div>
  );
}
