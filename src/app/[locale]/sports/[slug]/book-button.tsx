"use client";

import { useId, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getOwnEmail } from "@/app/[locale]/my-bookings/actions";
import { sessionSignInHref } from "@/lib/safe-next";
import { localeHref, resolveLocale } from "@/lib/locale";
import ResendVerification from "@/app/resend-verification";

// Само за показване: българските номера се групират, останалите оставят E.164.
function displayPhone(phone: string) {
  const m = phone.match(/^\+359(\d{2})(\d{3})(\d{4})$/);
  return m ? `+359 ${m[1]} ${m[2]} ${m[3]}` : phone;
}

export default function BookButton({
  sessionId,
  disabled,
  signedIn,
  label,
  savedPhone,
}: {
  sessionId: number;
  disabled: boolean;
  signedIn: boolean;
  label?: string;
  // Зареден от сървъра (винаги от сесията на потребителя): без мигане на празно поле.
  savedPhone?: string | null;
}) {
  const t = useTranslations("bookButton");
  const locale = resolveLocale(useLocale());
  // Пълният (с префикс) път — за return-following след вход (next/navigation
  // дава реалния URL, включително /en, така че езикът оцелява през входа).
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = [pathname, searchParams.toString()].filter(Boolean).join("?");
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(savedPhone ?? "");
  // Със записан телефон панелът е само потвърждение; полето се отваря с „Смени".
  const [editing, setEditing] = useState(!savedPhone);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  // Уникално за всеки BookButton (по няколко на страница).
  const phoneInputId = useId();

  function startBooking() {
    if (!signedIn) {
      // Bring the user back to this exact session after they sign in.
      window.location.href = sessionSignInHref(page, sessionId);
      return;
    }
    setOpen(true);
  }

  async function submit() {
    if (editing && !phone.trim()) {
      setError(t("errPhoneRequired"));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-locale": locale },
        // locale: сървърът го whitelist-ва до bg/en и го записва в резервацията.
        body: JSON.stringify({ sessionId, phone, locale }),
      });
      const data = await res.json();
      if (data.ok) {
        const id = data.bookingId;
        const dest =
          Number.isInteger(id) && id > 0 ? `/booking/success?s=${id}` : "/booking/success";
        window.location.href = localeHref(locale, dest);
        return;
      }
      setError(data.error ?? t("errBooking"));
      // 403 = unverified email: offer the resend flow right here (the email is
      // needed for the letter, fetched from the session, never from the client).
      if (res.status === 403) {
        setVerifyEmail(await getOwnEmail().catch(() => null));
      }
      setLoading(false);
    } catch {
      setError(t("errNetwork"));
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
        {disabled ? t("full") : (label ?? t("reserve"))}
      </button>
    );
  }

  return (
    <div className="pop-in w-60 border-2 border-accent bg-paper p-4">
      {editing ? (
        <>
          <label htmlFor={phoneInputId} className="block text-xs font-medium tracking-wide text-ink/60">
            {t("phoneLabel")}
          </label>
          <input
            id={phoneInputId}
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+359..."
            autoFocus
            className="mt-1 w-full border border-line/20 px-2 py-1.5 text-sm outline-none transition-colors focus:border-accent-deep"
          />
          <p className="mt-1 text-[11px] text-ink/50">{t("phoneHint")}</p>
        </>
      ) : (
        <p className="flex items-center gap-1 text-sm text-ink/70">
          {t("phoneWord")} <span className="font-medium text-ink">{displayPhone(phone)}</span>
          <span aria-hidden="true" className="text-ink/40">
            ·
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-11 text-sm text-accent-deep underline underline-offset-2 hover:text-ink"
          >
            {t("change")}
          </button>
        </p>
      )}
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
        {loading ? t("saving") : t("save")}
      </button>
      <p className="mt-2 text-center text-[11px] text-ink/40">{t("payNote")}</p>
    </div>
  );
}
