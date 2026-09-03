"use client";

import { useState } from "react";
import { updateSport } from "../actions";

type Sport = {
  id: number;
  slug: string;
  name: string;
  color: string;
  description: string | null;
};

export default function SportRow({ sport }: { sport: Sport }) {
  const [editing, setEditing] = useState(false);

  async function handleUpdate(formData: FormData) {
    await updateSport(sport.id, formData);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-3">
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: sport.color }}
        />
        <p className="font-medium">{sport.name}</p>
        <p className="text-sm text-neutral-500">/{sport.slug}</p>
        <button
          onClick={() => setEditing(true)}
          className="ml-auto text-sm text-neutral-700 hover:underline"
        >
          Редактирай
        </button>
      </div>
    );
  }

  return (
    <form
      action={handleUpdate}
      className="grid gap-2 rounded-lg border border-neutral-300 bg-neutral-50 p-3 sm:grid-cols-5"
    >
      <input
        name="name"
        defaultValue={sport.name}
        required
        className="rounded-md border border-neutral-300 px-2 py-1.5"
      />
      <input
        name="color"
        type="color"
        defaultValue={sport.color}
        className="h-9 rounded-md border border-neutral-300"
      />
      <input
        name="description"
        defaultValue={sport.description ?? ""}
        className="rounded-md border border-neutral-300 px-2 py-1.5 sm:col-span-2"
      />
      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white"
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
