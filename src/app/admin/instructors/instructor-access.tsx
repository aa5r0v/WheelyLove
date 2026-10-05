"use client";

import { useActionState } from "react";
import { linkInstructorAccess, type InstructorAccessState } from "../actions";

// "Свържи с акаунт": the exact refusal reason (e.g. an admin account) is shown
// next to the form.
export default function InstructorAccess({ instructorId }: { instructorId: number }) {
  const [state, action, pending] = useActionState<InstructorAccessState, FormData>(
    linkInstructorAccess.bind(null, instructorId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input
        name="email"
        type="email"
        required
        placeholder="Имейл на съществуващ акаунт"
        className="min-w-60 flex-1 rounded-md border border-neutral-300 px-2 py-1.5"
      />
      <button
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-1.5 text-white disabled:opacity-50"
      >
        Свържи с акаунт
      </button>
      {state.error && <p className="w-full text-red-600">{state.error}</p>}
      {state.ok && <p className="w-full text-green-700">{state.ok}</p>}
    </form>
  );
}
