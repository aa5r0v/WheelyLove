"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateOwnPhone } from "./actions";

export default function PhoneForm({ initialPhone }: { initialPhone: string | null }) {
  const t = useTranslations("myBookings");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    try {
      const res = await updateOwnPhone(phone);
      if (res.ok) {
        setPhone(res.phone);
        setState("saved");
        setMessage(null);
      } else {
        setState("error");
        setMessage(res.error);
      }
    } catch {
      setState("error");
      setMessage(t("errNetwork"));
    }
  }

  return (
    <form onSubmit={save} className="mt-6 border-l-4 border-line/20 bg-paper-dim p-4 text-sm">
      <label htmlFor="own-phone" className="block text-xs font-medium tracking-wide text-ink/60">
        {t("phoneLabel")}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="own-phone"
          type="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setState("idle");
          }}
          placeholder="+359..."
          className="w-full max-w-xs border border-line/20 px-2 py-1.5 outline-none focus:border-accent-deep"
        />
        <button
          disabled={state === "busy"}
          className="press font-display bg-accent px-3 py-1.5 tracking-wide text-accent-ink disabled:opacity-50"
        >
          {t("phoneSave")}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-ink/50">{t("phoneHint")}</p>
      {state === "saved" && <p className="mt-1 text-xs text-green-700">{t("phoneSaved")}</p>}
      {state === "error" && message && <p className="mt-1 text-xs text-red-600">{message}</p>}
    </form>
  );
}
