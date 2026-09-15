"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";

export default function BookButton({
  sessionId,
  disabled,
}: {
  sessionId: number;
  disabled: boolean;
}) {
  const { isSignedIn } = useUser();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState<"card" | "cash" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startBooking() {
    if (!isSignedIn) {
      window.location.href = "/sign-in";
      return;
    }
    setOpen(true);
  }

  async function submit(paymentMethod: "card" | "cash") {
    if (!phone.trim()) {
      setError("Моля, въведи телефонен номер за потвърждение.");
      return;
    }
    if (paymentMethod === "card") {
      setError("Плащането с карта все още не е налично. Моля, избери плащане на място.");
      return;
    }
    setError(null);
    setLoading(paymentMethod);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, phone, paymentMethod }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.ok) {
        window.location.href = "/booking/success";
      } else {
        setError(data.error ?? "Грешка при създаване на резервация.");
        setLoading(null);
      }
    } catch {
      setError("Възникна грешка. Опитайте отново.");
      setLoading(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={startBooking}
        disabled={disabled}
        className="font-display bg-ink px-5 py-2 text-sm tracking-wide text-paper disabled:cursor-not-allowed disabled:bg-ink/20"
      >
        {disabled ? "Пълно" : "Резервирай"}
      </button>
    );
  }

  return (
    <div className="w-60 border-2 border-accent bg-paper p-4">
      <label className="block text-xs font-medium tracking-wide text-ink/60">
        Телефон за потвърждение
      </label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+359..."
        className="mt-1 w-full border border-line/20 px-2 py-1.5 text-sm outline-none focus:border-accent-deep"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex flex-col gap-2">
        <button
          onClick={() => submit("card")}
          disabled={loading !== null}
          className="font-display bg-accent px-3 py-2 text-sm tracking-wide text-accent-ink disabled:opacity-50"
        >
          {loading === "card" ? "Зареждане…" : "Плати с карта"}
        </button>
        <p className="text-center text-[11px] text-ink/40">
          Плащането с карта временно не е налично
        </p>
        <button
          onClick={() => submit("cash")}
          disabled={loading !== null}
          className="font-display border border-ink px-3 py-2 text-sm tracking-wide disabled:opacity-50"
        >
          {loading === "cash" ? "Зареждане…" : "Плащане на място"}
        </button>
      </div>
    </div>
  );
}
