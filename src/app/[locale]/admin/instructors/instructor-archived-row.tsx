"use client";

import { useState, useTransition } from "react";
import { restoreInstructor, type InstructorActionState } from "../actions";

// Archived instructor: the row stays for history; restore only clears
// archived_at (no account relink, no template re-activation).
export default function InstructorArchivedRow({
  instructor,
}: {
  instructor: { id: number; name: string; slug: string; sessionCount: number; templateCount: number };
}) {
  const [state, setState] = useState<InstructorActionState>({});
  const [pending, start] = useTransition();

  const submitRestore = () => {
    start(async () => setState(await restoreInstructor(instructor.id)));
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-neutral-700">
            {instructor.name}{" "}
            <span className="text-xs font-normal text-neutral-400">(архивиран)</span>
          </p>
          <p className="text-sm text-neutral-500">
            /{instructor.slug} · {instructor.sessionCount} часа · {instructor.templateCount}{" "}
            шаблона
          </p>
        </div>
        <form action={submitRestore}>
          <button
            disabled={pending}
            className="text-sm text-neutral-700 hover:underline disabled:opacity-50"
          >
            {pending ? "Възстановяване…" : "Възстанови"}
          </button>
        </form>
      </div>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.ok && <p className="mt-2 text-sm text-green-700">{state.ok}</p>}
    </div>
  );
}
