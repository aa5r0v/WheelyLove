"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getOwnEmail, getOwnPhone } from "@/app/my-bookings/actions";
import { sessionSignInHref } from "@/lib/safe-next";
import ResendVerification from "@/app/resend-verification";

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = [pathname, searchParams.toString()].filter(Boolean).join("?");
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);

  function startBooking() {
    if (!signedIn) {
      // Bring the user back to this exact session after they sign in.
      window.location.href = sessionSignInHref(page, sessionId);
      return;
    }
    setOpen(true);
    // Prefill the saved number: the phone is asked only once.
    getOwnPhone()
      .then((saved) => {
        if (saved) setPhone((cur) => (cur ? cur : saved));
      })
      .catch(() => {});
  }

  async function submit() {
    if (!phone.trim()) {
      setError("Моля, въведи телефон за връзка.");
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
        const id = data.bookingId;
        window.location.href =
          Number.isInteger(id) && id > 0 ? `/booking/success?s=${id}` : "/booking/success";
        return;
      }
      setError(data.error ?? "Грешка при създаване на резервация.");
      // 403 = unverified email: offer the resend flow right here (the email is
      // needed for the letter, fetched from the session, never from the client).
      if (res.status === 403) {
        setVerifyEmail(await getOwnEmail().catch(() => null));
      }
      setLoading(false);
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
        Телефон за връзка
      </label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+359..."
        className="mt-1 w-full border border-line/20 px-2 py-1.5 text-sm outline-none transition-colors focus:border-accent-deep"
      />
      <p className="mt-1 text-[11px] text-ink/50">
        Ползваме го само ако часът се промени или отмени.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {verifyEmail && (
        <div className="mt-2">
          <ResendVerification email={verifyEmail} callbackURL={page} />
        </div>
      )}
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
