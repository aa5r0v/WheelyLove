"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { emailAuthClient } from "@/lib/auth-client";
import GoogleButton from "@/app/google-button";
import ResendVerification from "@/app/resend-verification";
import { DEFAULT_NEXT, safeNext, verifiedSignInUrl } from "@/lib/safe-next";
import { localeHref, resolveLocale } from "@/lib/locale";
import { Link } from "@/i18n/navigation";

export default function SignInForm({
  googleEnabled,
  oauthError,
  verified,
  next,
}: {
  googleEnabled: boolean;
  oauthError: boolean;
  // Arrived from the email-verification letter (the email is confirmed now).
  verified?: boolean;
  // Where to go after signing in (the page the guest came from); sanitized.
  next?: string;
}) {
  const t = useTranslations("signIn");
  const locale = resolveLocale(useLocale());
  const router = useRouter();
  // next носи пълния (с /en) път от страницата, от която е зададен; при
  // липсващ/несигурен next падаме в графика на ЕЗИКА на страницата.
  const target = (() => {
    const safe = safeNext(next);
    return safe === DEFAULT_NEXT ? localeHref(locale, DEFAULT_NEXT) : safe;
  })();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(oauthError ? t("errOauth") : null);
  const [needsVerification, setNeedsVerification] = useState(false);

  function errorText(code: string | null | undefined) {
    if (code === "EMAIL_NOT_VERIFIED") return t("errNotVerified");
    if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "USER_NOT_FOUND") return t("errInvalid");
    return t("errGeneric");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    // Verification links return to sign-in; a successful password login goes
    // directly to the selected class without the default redirect plugin.
    const { error: err } = await emailAuthClient.signIn.email({
      email,
      password,
      callbackURL: verifiedSignInUrl(target, locale),
      fetchOptions: { headers: { "x-app-locale": locale } },
    });
    if (err) {
      setError(errorText(err.code));
      setNeedsVerification(err.code === "EMAIL_NOT_VERIFIED");
      setLoading(false);
      return;
    }
    router.push(target);
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">{t("title")}</h1>
      <p className="mt-2 text-ink/60">{t("intro")}</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
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
            {t("password")}
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-line/20 bg-paper px-3 py-2 text-sm outline-none transition-colors focus:border-accent-deep"
          />
        </div>
        {verified && !error && (
          <p className="text-sm text-green-700">{t("verifiedNote")}</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {needsVerification && email && (
          <div>
            <ResendVerification email={email} callbackURL={target} />
          </div>
        )}
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

      <div className="mt-6 space-y-2 text-sm text-ink/60">
        <p>
          {t("noAccount")}{" "}
          <Link
            href={`/sign-up?next=${encodeURIComponent(target)}`}
            className="text-accent-deep underline underline-offset-2"
          >
            {t("signUpLink")}
          </Link>
        </p>
        <p>
          <Link href="/forgot-password" className="text-accent-deep underline underline-offset-2">
            {t("forgot")}
          </Link>
        </p>
      </div>
    </div>
  );
}
