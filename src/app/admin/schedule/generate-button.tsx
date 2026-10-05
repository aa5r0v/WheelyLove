"use client";

import { useState } from "react";
import { generateFromTemplates } from "../actions";

export default function GenerateButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await generateFromTemplates();
      setMsg(`Създадени нови часове: ${r.created} (вече съществуващите са пропуснати).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Грешка при генериране.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? "Генериране…" : "Генерирай часове за 8 седмици"}
      </button>
      {msg && (
        <p role="status" className="mt-2 text-sm text-neutral-700">
          {msg}
        </p>
      )}
    </div>
  );
}
