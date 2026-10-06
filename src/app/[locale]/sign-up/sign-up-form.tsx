"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import GoogleButton from "@/app/google-button";
import { DEFAULT_NEXT, safeNext, verifiedSignInUrl } from "@/lib/safe-next";
import { localeHref, resolveLocale } from "@/lib/locale";
import { Link } from "@/i18n/navigation";

const MIN_PASSWORD = 10;

export default function SignUpForm({
  googleEnabled,
  next,
}: {
  googleEnabled: boolean;
  // Where the verification letter should lead after confirming; sanitized.
  next?: string;
}) {
  const t = useTranslations("signUp");
  const locale = resolveLocale(useLocale());
  const target = (() => {
    const safe = safeNext(next);
    return safe === DEFAULT_NEXT ? localeHref(locale, DEFAULT_NEXT) : safe;
  })();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function errorText(code: string | null | undefined) {
    if (code === "PASSWORD_TOO_SHORT" || code === "INVALID_PASSWORD") {
      return t("errShort", { min: MIN_PASSWORD });
    }
    if (code === "INVALID_EMAIL") {
      return t("errInvalidEmail");
    }
    return t("errGeneric");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(t("errShort", { min: MIN_PASSWORD }));
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.signUp.email({
      name,
      email,
      password,
      // Lands in the verification letter: after confirming the email the user
      // signs in and returns to the page they were booking from (no automatic
      // session - see src/lib/auth.ts).
      callbackURL: verifiedSignInUrl(target, locale),
      fetchOptions: { headers: { 'x-app-locale': locale } },
    });
    if (err) {
      setError(errorText(err.code));
      setLoading(false);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
        <p className="text-xs font-semibold tracking-[0.3em] text-accent">{t("doneLabel")}</p>
        <h1 className="font-display mt-3 text-4xl">{t("doneTitle")}</h1>
        {/* One text for every outcome (registered or not): sign-up must not
            reveal whether the address already has an account. */}
        <p className="mt-4 text-ink/60">{t("doneText")}</p>
        <p className="mt-2 text-sm text-ink/50">{t("doneHint")}</p>
        <Link
          href="/schedule"
          className="font-display mt-8 inline-block bg-ink px-6 py-3 text-sm tracking-wide text-paper"
        >
          {t("toSchedule")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">{t("title")}</h1>
      <p className="mt-2 text-ink/60">{t("intro")}</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="name" className="block text-xs font-medium tracking-wide text-ink/60">
            {t("name")}
          </label>
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full border border-line/20 bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-accent-deep"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-xs font-medium tracking-wide text-ink/60">
            {t("email")}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-line/20 bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-accent-deep"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-xs font-medium tracking-wide text-ink/60">
            {t("passwordLabel", { min: MIN_PASSWORD })}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-line/20 bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-accent-deep"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="press font-display w-full bg-accent px-5 py-2.5 text-sm tracking-wide text-accent-ink transition-opacity disabled:opacity-50"
        >
          {loading ? t("submitting") : t("submit")}
        </button>
      </form>

      {googleEnabled && (
        <div className="mt-6">
          <GoogleButton label={t("google")} next={target} />
        </div>
      )}

      <p className="mt-6 text-sm text-ink/60">
        {t("hasAccount")}{" "}
        <Link
          href={`/sign-in?next=${encodeURIComponent(target)}`}
          className="text-accent-deep underline underline-offset-2"
        >
          {t("signInLink")}
        </Link>
      </p>
    </div>
  );
}
