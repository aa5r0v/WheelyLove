"use client";

import { useState } from "react";
import { deleteTemplate, updateTemplate } from "../actions";
import TemplateFields from "./template-fields";
import { WEEKDAY_LABELS } from "@/lib/trainings";

type Opt = { id: number; name: string };
export type TemplateView = {
  id: number;
  sportId: number;
  instructorId: number;
  weekday: number;
  startTime: string;
  durationMin: number;
  capacity: number;
  priceCents: number;
  active: boolean;
  sportName: string;
  sportColor: string;
  instructorName: string;
};

export default function TemplateRow({
  t,
  sports,
  instructors,
}: {
  t: TemplateView;
  sports: Opt[];
  instructors: Opt[];
}) {
  const [editing, setEditing] = useState(false);

  async function save(fd: FormData) {
    await updateTemplate(t.id, fd);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: t.sportColor }} />
        <p className="font-medium">
          {WEEKDAY_LABELS[t.weekday - 1]} {t.startTime}
        </p>
        <p className="text-sm text-neutral-600">
          {t.sportName} · {t.instructorName} · {t.durationMin} мин · {t.capacity} места ·{" "}
          {(t.priceCents / 100).toFixed(2)} €
        </p>
        {!t.active && <span className="text-xs text-amber-600">неактивен</span>}
        <button onClick={() => setEditing(true)} className="ml-auto text-sm hover:underline">
          Редактирай
        </button>
        <button
          onClick={async () => {
            if (confirm("Изтриване на шаблона? Вече създадените часове остават.")) await deleteTemplate(t.id);
          }}
          className="text-sm text-red-600 hover:underline"
        >
          Изтрий
        </button>
      </div>
    );
  }

  return (
    <form action={save} className="grid gap-2 rounded-lg border border-neutral-300 bg-neutral-50 p-3 sm:grid-cols-4">
      <TemplateFields
        sports={sports}
        instructors={instructors}
        d={{
          sportId: t.sportId,
          instructorId: t.instructorId,
          weekday: t.weekday,
          startTime: t.startTime,
          durationMin: t.durationMin,
          capacity: t.capacity,
          price: (t.priceCents / 100).toFixed(2),
        }}
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={t.active} /> Активен
      </label>
      <div className="flex gap-3 sm:col-span-4">
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white">
          Запази
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-sm text-neutral-600 hover:underline">
          Отказ
        </button>
      </div>
    </form>
  );
}
