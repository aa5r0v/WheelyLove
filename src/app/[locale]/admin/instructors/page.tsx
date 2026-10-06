import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { instructors, user } from "@/db/schema";
import { createInstructor, deleteInstructor, removeInstructorAccess } from "../actions";
import InstructorAccess from "./instructor-access";
import { requireAdminPage } from "@/lib/admin-page";

export default async function AdminInstructorsPage() {
  await requireAdminPage();
  const db = getDb();
  const all = await db
    .select({
      id: instructors.id,
      name: instructors.name,
      specialties: instructors.specialties,
      email: instructors.email,
      phone: instructors.phone,
      accountEmail: user.email,
    })
    .from(instructors)
    .leftJoin(user, eq(user.id, instructors.userId))
    .orderBy(asc(instructors.name));

  return (
    <div>
      <h1 className="text-2xl font-bold">Инструктори</h1>

      <div className="mt-6 space-y-2">
        {all.map((i) => (
          <div
            key={i.id}
            className="rounded-lg border border-neutral-200 bg-white p-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{i.name}</p>
                <p className="text-sm text-neutral-500">
                  {i.specialties} · {i.email} · {i.phone}
                </p>
              </div>
              <form
                action={async () => {
                  "use server";
                  await deleteInstructor(i.id);
                }}
              >
                <button className="text-sm text-red-600 hover:underline">
                  Изтрий
                </button>
              </form>
            </div>
            <div className="mt-3 border-t border-neutral-100 pt-3 text-sm">
              {i.accountEmail ? (
                <form
                  action={async () => {
                    "use server";
                    await removeInstructorAccess(i.id);
                  }}
                  className="flex items-center justify-between"
                >
                  <span>Достъп до панела: {i.accountEmail}</span>
                  <button className="text-red-600 hover:underline">Махни достъпа</button>
                </form>
              ) : (
                <InstructorAccess instructorId={i.id} />
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        action={createInstructor}
        className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-5 sm:grid-cols-2"
      >
        <input
          name="name"
          placeholder="Име"
          required
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        />
        <input
          name="slug"
          placeholder="slug (напр. ani)"
          required
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        />
        <input
          name="specialties"
          placeholder="Специалност (напр. Пилатес)"
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        />
        <input
          name="phone"
          placeholder="Телефон"
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        />
        <input
          name="email"
          type="email"
          placeholder="Имейл"
          className="rounded-md border border-neutral-300 px-2 py-1.5 sm:col-span-2"
        />
        <textarea
          name="bio"
          placeholder="Био"
          rows={3}
          className="rounded-md border border-neutral-300 px-2 py-1.5 sm:col-span-2"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-white sm:col-span-2"
        >
          Добави инструктор
        </button>
      </form>
    </div>
  );
}
