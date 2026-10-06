import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { instructors, sessionTemplates, sports } from "@/db/schema";
import { createTemplate } from "../actions";
import GenerateButton from "./generate-button";
import TemplateFields from "./template-fields";
import TemplateRow from "./template-row";
import { requireAdminPage } from "@/lib/admin-page";

export default async function AdminSchedulePage() {
  await requireAdminPage();
  const db = getDb();
  const allSports = await db.select({ id: sports.id, name: sports.name }).from(sports).orderBy(asc(sports.name));
  const allInstructors = await db
    .select({ id: instructors.id, name: instructors.name })
    .from(instructors)
    .orderBy(asc(instructors.name));
  const templates = await db
    .select({
      id: sessionTemplates.id,
      sportId: sessionTemplates.sportId,
      instructorId: sessionTemplates.instructorId,
      weekday: sessionTemplates.weekday,
      startTime: sessionTemplates.startTime,
      durationMin: sessionTemplates.durationMin,
      capacity: sessionTemplates.capacity,
      priceCents: sessionTemplates.priceCents,
      active: sessionTemplates.active,
      sportName: sports.name,
      sportColor: sports.color,
      instructorName: instructors.name,
    })
    .from(sessionTemplates)
    .innerJoin(sports, eq(sessionTemplates.sportId, sports.id))
    .innerJoin(instructors, eq(sessionTemplates.instructorId, instructors.id))
    .orderBy(asc(sessionTemplates.weekday), asc(sessionTemplates.startTime));

  return (
    <div>
      <h1 className="text-2xl font-bold">График (шаблон)</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600">
        Седмичен шаблон в часово време на София. „Генерирай“ създава часовете за следващите 8 седмици и
        може да се натиска многократно: вече създадените часове (с резервации, редактирани или
        отменени) не се променят и не се създават повторно. Единичен час се отменя от „Часове“.
      </p>

      <div className="mt-6">
        <GenerateButton />
      </div>

      <div className="mt-6 space-y-2">
        {templates.map((t) => (
          <TemplateRow key={t.id} t={t} sports={allSports} instructors={allInstructors} />
        ))}
        {templates.length === 0 && <p className="text-sm text-neutral-500">Още няма шаблони.</p>}
      </div>

      {allInstructors.length === 0 || allSports.length === 0 ? (
        <p className="mt-6 text-sm text-amber-600">Първо добави поне една тренировка и един инструктор.</p>
      ) : (
        <form
          action={createTemplate}
          className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-5 sm:grid-cols-4"
        >
          <TemplateFields sports={allSports} instructors={allInstructors} />
          <p className="text-xs text-neutral-500 sm:col-span-4">
            Празни продължителност, капацитет или цена се взимат от настройките на тренировката.
          </p>
          <button type="submit" className="rounded-md bg-neutral-900 px-4 py-1.5 text-white sm:col-span-4">
            Добави към шаблона
          </button>
        </form>
      )}
    </div>
  );
}
