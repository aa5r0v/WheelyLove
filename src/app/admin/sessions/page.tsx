import { asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, instructors, sports } from "@/db/schema";
import { createSession } from "../actions";
import SessionRow from "./session-row";
import { requireAdminPage } from "@/lib/admin-page";

export default async function AdminSessionsPage() {
  await requireAdminPage();
  const db = getDb();
  const allSports = await db.select().from(sports).orderBy(asc(sports.name));
  const allInstructors = await db
    .select()
    .from(instructors)
    .orderBy(asc(instructors.name));
  const allSessions = await db
    .select({
      id: classSessions.id,
      sportId: classSessions.sportId,
      instructorId: classSessions.instructorId,
      startTime: classSessions.startTime,
      endTime: classSessions.endTime,
      capacity: classSessions.capacity,
      bookedCount: classSessions.bookedCount,
      priceCents: classSessions.priceCents,
      sportName: sports.name,
      sportColor: sports.color,
      instructorName: instructors.name,
    })
    .from(classSessions)
    .innerJoin(sports, eq(classSessions.sportId, sports.id))
    .innerJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(isNull(classSessions.cancelledAt))
    .orderBy(asc(classSessions.startTime));

  return (
    <div>
      <h1 className="text-2xl font-bold">Часове по календари</h1>

      {allInstructors.length === 0 ? (
        <p className="mt-4 text-sm text-amber-600">
          Първо добави поне един инструктор в &quot;Инструктори&quot;, преди
          да създадеш часове.
        </p>
      ) : (
        <form
          action={createSession}
          className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-5 sm:grid-cols-6"
        >
          <select
            name="sportId"
            required
            className="rounded-md border border-neutral-300 px-2 py-1.5 sm:col-span-2"
          >
            {allSports.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            name="instructorId"
            required
            className="rounded-md border border-neutral-300 px-2 py-1.5 sm:col-span-2"
          >
            {allInstructors.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            name="capacity"
            placeholder="Капацитет"
            defaultValue={12}
            required
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          />
          <input
            type="number"
            name="price"
            placeholder="Цена (€)"
            step="0.01"
            required
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          />
          <input
            type="date"
            name="date"
            required
            className="rounded-md border border-neutral-300 px-2 py-1.5 sm:col-span-2"
          />
          <input
            type="time"
            name="startTime"
            required
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          />
          <input
            type="time"
            name="endTime"
            required
            className="rounded-md border border-neutral-300 px-2 py-1.5"
          />
          <div className="sm:col-span-2">
            <label className="block text-xs text-neutral-500">
              Повтори всяка седмица, брой пъти
            </label>
            <input
              type="number"
              name="repeatWeeks"
              placeholder="1"
              min={1}
              defaultValue={1}
              className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-4 py-1.5 text-white sm:col-span-6"
          >
            Добави час
          </button>
        </form>
      )}

      <div className="mt-6 space-y-2">
        {allSessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            sports={allSports}
            instructors={allInstructors}
          />
        ))}
      </div>
    </div>
  );
}
