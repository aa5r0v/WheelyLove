"use client";

import { useState } from "react";

export default function BookButton({
  sessionId,
  disabled,
  signedIn,
  label,
}: {
  sessionId: number;
  disabled: boolean;
  signedIn: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startBooking() {
    if (!signedIn) {
      window.location.href = "/sign-in";
      return;
    }
    setOpen(true);
  }

  async function submit() {
    if (!phone.trim()) {
      setError("Моля, въведи телефонен номер за потвърждение.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, phone }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.href = "/booking/success";
      } else {
        setError(data.error ?? "Грешка при създаване на резервация.");
        setLoading(false);
      }
    } catch {
      setError("Възникна грешка. Опитайте отново.");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={startBooking}
        disabled={disabled}
        className="press font-display bg-ink px-5 py-2 text-sm tracking-wide text-paper disabled:cursor-not-allowed disabled:bg-ink/20"
      >
        {disabled ? "Пълно" : (label ?? "Резервирай")}
      </button>
    );
  }

  return (
    <div className="pop-in w-60 border-2 border-accent bg-paper p-4">
      <label className="block text-xs font-medium tracking-wide text-ink/60">
        Телефон за потвърждение
      </label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+359..."
        className="mt-1 w-full border border-line/20 px-2 py-1.5 text-sm outline-none transition-colors focus:border-accent-deep"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button
        onClick={submit}
        disabled={loading}
        className="press font-display mt-3 w-full bg-accent px-3 py-2 text-sm tracking-wide text-accent-ink transition-opacity disabled:opacity-50"
      >
        {loading ? "Запазване…" : "Запази място"}
      </button>
      <p className="mt-2 text-center text-[11px] text-ink/40">
        Плащането е на място, преди тренировката
      </p>
    </div>
  );
}
