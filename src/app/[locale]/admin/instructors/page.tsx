import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { classSessions, instructors, sessionTemplates, user } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin-page";
import InstructorArchivedRow from "./instructor-archived-row";
import InstructorCreateForm from "./instructor-create";
import InstructorRow from "./instructor-row";

export default async function AdminInstructorsPage() {
  await requireAdminPage();
  const db = getDb();
  const [all, sessionCounts, templateCounts] = await Promise.all([
    db
      .select({
        id: instructors.id,
        name: instructors.name,
        slug: instructors.slug,
        specialties: instructors.specialties,
        email: instructors.email,
        phone: instructors.phone,
        bio: instructors.bio,
        photoUrl: instructors.photoUrl,
        accountEmail: user.email,
        archivedAt: instructors.archivedAt,
      })
      .from(instructors)
      .leftJoin(user, eq(user.id, instructors.userId))
      .orderBy(asc(instructors.name)),
    db
      .select({ instructorId: classSessions.instructorId, n: sql<number>`count(*)::int` })
      .from(classSessions)
      .groupBy(classSessions.instructorId),
    db
      .select({ instructorId: sessionTemplates.instructorId, n: sql<number>`count(*)::int` })
      .from(sessionTemplates)
      .groupBy(sessionTemplates.instructorId),
  ]);
  const counts = (rows: { instructorId: number; n: number }[]) =>
    new Map(rows.map((r) => [r.instructorId, r.n]));
  const sMap = counts(sessionCounts);
  const tMap = counts(templateCounts);
  const withCounts = (i: (typeof all)[number]) => ({
    ...i,
    sessionCount: sMap.get(i.id) ?? 0,
    templateCount: tMap.get(i.id) ?? 0,
  });
  const active = all.filter((i) => !i.archivedAt).map(withCounts);
  const archived = all.filter((i) => i.archivedAt).map(withCounts);

  return (
    <div>
      <h1 className="text-2xl font-bold">Инструктори</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600">
        Изтриването е завинаги и е възможно само когато инструкторът няма нито един
        час или шаблон. Архивирането премахва профила от сайта и спира новите
        часове, но запазва историята: вече създадените часове и резервациите
        остават.
      </p>

      <div className="mt-6 space-y-2">
        {active.map((i) => (
          <InstructorRow key={i.id} instructor={i} />
        ))}
        {active.length === 0 && (
          <p className="text-sm text-neutral-500">Още няма активни инструктори.</p>
        )}
      </div>

      <InstructorCreateForm />

      {archived.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-bold">Архивирани</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Възстановяването връща профила в списъка, но НЕ свързва автоматично
            акаунт за панела и НЕ включва шаблоните — направи го ръчно, ако е нужно.
          </p>
          <div className="mt-3 space-y-2">
            {archived.map((i) => (
              <InstructorArchivedRow key={i.id} instructor={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
