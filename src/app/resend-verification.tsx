"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { resendOutcomeText } from "@/app/[locale]/my-bookings/resend-outcome";
import { resolveLocale } from "@/lib/locale";
import { verifiedSignInUrl } from "@/lib/safe-next";

// The resend flow of the /my-bookings banner, reusable wherever booking is
// blocked by an unverified email. callbackURL is where the letter takes the
// user after they verify (current page, so they can continue what they started).
export default function ResendVerification({
  email,
  callbackURL,
}: {
  email: string;
  callbackURL: string;
}) {
  const t = useTranslations("resend");
  const locale = resolveLocale(useLocale());
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);

  async function resend() {
    setState("busy");
    // A failed resend (Resend down, rate limit 429, ...) must not be reported
    // as "sent" - the user would wait for a letter that never comes.
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: verifiedSignInUrl(callbackURL, locale),
      fetchOptions: { headers: { 'x-app-locale': locale } },
    });
    if (error) {
      setErrorStatus(typeof error.status === "number" ? error.status : undefined);
      setState("error");
    } else {
      setState("sent");
    }
  }

  if (state === "sent" || state === "error") {
    return (
      <p className={state === "sent" ? "text-sm text-ink/60" : "text-sm text-red-600"}>
        {resendOutcomeText(state === "sent", errorStatus, locale)}
      </p>
    );
  }

  return (
    <button
      onClick={resend}
      disabled={state === "busy"}
      className="text-sm text-accent-deep underline underline-offset-2 disabled:opacity-50"
    >
      {state === "busy" ? t("busy") : t("send")}
    </button>
  );
}
