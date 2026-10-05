"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { resendOutcomeText } from "./resend-outcome";

// Shown to signed-in users whose email is not verified yet: without verification
// they cannot book, and the original link may be long gone.
export default function VerifyEmailBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [errorStatus, setErrorStatus] = useState<number | undefined>(undefined);

  async function resend() {
    setState("busy");
    // A failed resend (Resend down, rate limit 429, ...) must not be reported
    // as "sent" - the user would wait for a letter that never comes.
    const { error } = await authClient.sendVerificationEmail({ email });
    if (error) {
      setErrorStatus(typeof error.status === "number" ? error.status : undefined);
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <div className="mt-6 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm">
      <p className="font-medium">
            Потвърди имейла си ({email}), за да можеш да резервираш тренировка.
      </p>
      {state === "sent" ? (
        <p className="mt-1 text-ink/60">{resendOutcomeText(true)}</p>
      ) : state === "error" ? (
        <p className="mt-1 text-red-600">{resendOutcomeText(false, errorStatus)}</p>
      ) : (
        <button
          onClick={resend}
          disabled={state === "busy"}
          className="mt-1 text-accent-deep underline underline-offset-2 disabled:opacity-50"
        >
          {state === "busy" ? "Изпращане…" : "Изпрати нов линк за потвърждение"}
        </button>
      )}
    </div>
  );
}
