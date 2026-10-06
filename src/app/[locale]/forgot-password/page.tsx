"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { localeHref, resolveLocale } from "@/lib/locale";
import { Link } from "@/i18n/navigation";

export default function ForgotPasswordPage() {
  const t = useTranslations("forgot");
  const locale = resolveLocale(useLocale());
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.requestPasswordReset({
      email,
      fetchOptions: { headers: { 'x-app-locale': locale } },
      // After clicking the email link the user lands on /reset-password?token=…
      // (localized: the letter must return in the language of this request).
      redirectTo: localeHref(locale, "/reset-password"),
    });
    if (err) {
      setError(t("errGeneric"));
      setLoading(false);
      return;
    }
    // Same answer for existing and non-existing addresses.
    setDone(true);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-4xl">{t("title")}</h1>

      {done ? (
        <>
          <p className="mt-4 text-ink/60">{t("doneText")}</p>
          <Link
            href="/sign-in"
            className="font-display mt-8 inline-block bg-ink px-6 py-3 text-sm tracking-wide text-paper"
          >
            {t("backToSignIn")}
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-ink/60">{t("intro")}</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium tracking-wide text-ink/60"
              >
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="press font-display w-full bg-accent px-5 py-2.5 text-sm tracking-wide text-accent-ink transition-opacity disabled:opacity-50"
            >
              {loading ? t("submitting") : t("submit")}
            </button>
          </form>
          <p className="mt-6 text-sm text-ink/60">
            <Link href="/sign-in" className="text-accent-deep underline underline-offset-2">
              {t("backToSignIn")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
