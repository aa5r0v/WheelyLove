import { getDb } from "@/db";
import { sports } from "@/db/schema";
import { createSport } from "../actions";
import SportRow from "./sport-row";
import { LEVEL_LABELS, SPORT_LEVELS } from "@/lib/trainings";

export default async function AdminSportsPage() {
  const db = getDb();
  const allSports = await db.select().from(sports);

  return (
    <div>
      <h1 className="text-2xl font-bold">Спортове</h1>

      <div className="mt-6 space-y-2">
        {allSports.map((s) => (
          <SportRow key={s.id} sport={s} />
        ))}
      </div>

      <form
        action={createSport}
        className="mt-6 grid gap-3 rounded-lg border border-neutral-200 bg-white p-5 sm:grid-cols-5"
      >
        <input
          name="name"
          placeholder="Име"
          required
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        />
        <input
          name="slug"
          placeholder="slug (напр. crossfit)"
          required
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        />
        <input
          name="color"
          type="color"
          defaultValue="#6366f1"
          className="h-9 rounded-md border border-neutral-300"
        />
        <input
          name="description"
          placeholder="Описание"
          className="rounded-md border border-neutral-300 px-2 py-1.5 sm:col-span-2"
        />
        <select
          name="level"
          defaultValue={"all"}
          aria-label="Ниво"
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        >
          {SPORT_LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABELS[l]}
            </option>
          ))}
        </select>
        <input
          name="defaultDurationMin"
          type="number"
          min={1}
          placeholder="Минути"
          aria-label="Продължителност (мин)"
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        />
        <input
          name="defaultPrice"
          type="number"
          min={0}
          step="0.01"
          placeholder="Цена (€)"
          aria-label="Цена по подразбиране (€)"
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        />
        <input
          name="defaultCapacity"
          type="number"
          min={1}
          defaultValue={12}
          placeholder="Капацитет"
          aria-label="Капацитет по подразбиране"
          className="rounded-md border border-neutral-300 px-2 py-1.5"
        />
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-white sm:col-span-5"
        >
          Добави спорт
        </button>
      </form>
    </div>
  );
}
