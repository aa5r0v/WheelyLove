"use client";

import { useState } from "react";
import { updateSession, cancelSession } from "../actions";
import {
  formatDateTimeShort,
  toSofiaDateInput,
  toSofiaTimeInput,
} from "@/lib/format";

type Sport = { id: number; name: string };
type Instructor = { id: number; name: string };

type Session = {
  id: number;
  sportId: number;
  instructorId: number;
  startTime: Date;
  endTime: Date;
  capacity: number;
  bookedCount: number;
  priceCents: number;
  sportName: string;
  sportColor: string;
  instructorName: string;
};


export default function SessionRow({
  session,
  sports,
  instructors,
}: {
  session: Session;
  sports: Sport[];
  instructors: Instructor[];
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate(formData: FormData) {
    setError(null);
    try {
      await updateSession(session.id, formData);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between border border-neutral-200 bg-white p-3">
        <div className="flex items-center gap-3">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: session.sportColor }}
          />
          <div>
            <p className="font-medium">
              {session.sportName} · {formatDateTimeShort(session.startTime)}
            </p>
            <p className="text-sm text-neutral-500">
              {session.instructorName} · {session.bookedCount}/
              {session.capacity} записани ·{" "}
              {(session.priceCents / 100).toFixed(2)} €
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-neutral-700 hover:underline"
          >
            Редактирай
          </button>
          <form
            action={async () => {
              await cancelSession(session.id);
            }}
          >
            <button className="text-sm text-red-600 hover:underline">
              Отмени часа
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form
      action={handleUpdate}
      className="grid gap-2 border border-neutral-300 bg-neutral-50 p-3 sm:grid-cols-6"
    >
      <select
        name="sportId"
        defaultValue={session.sportId}
        className="rounded-md border border-neutral-300 px-2 py-1.5 sm:col-span-2"
      >
        {sports.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        name="instructorId"
        defaultValue={session.instructorId}
        className="rounded-md border border-neutral-300 px-2 py-1.5 sm:col-span-2"
      >
        {instructors.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        name="capacity"
        defaultValue={session.capacity}
        min={session.bookedCount}
        className="rounded-md border border-neutral-300 px-2 py-1.5"
      />
      <input
        type="number"
        name="price"
        step="0.01"
        defaultValue={(session.priceCents / 100).toFixed(2)}
        className="rounded-md border border-neutral-300 px-2 py-1.5"
      />
      <input
        type="date"
        name="date"
        defaultValue={toSofiaDateInput(session.startTime)}
        className="rounded-md border border-neutral-300 px-2 py-1.5 sm:col-span-2"
      />
      <input
        type="time"
        name="startTime"
        defaultValue={toSofiaTimeInput(session.startTime)}
        className="rounded-md border border-neutral-300 px-2 py-1.5"
      />
      <input
        type="time"
        name="endTime"
        defaultValue={toSofiaTimeInput(session.endTime)}
        className="rounded-md border border-neutral-300 px-2 py-1.5"
      />
      {error && <p className="text-sm text-red-600 sm:col-span-6">{error}</p>}
      <div className="flex gap-3 sm:col-span-6">
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-1.5 text-sm text-white"
        >
          Запази
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-sm text-neutral-600 hover:underline"
        >
          Отказ
        </button>
      </div>
    </form>
  );
}
