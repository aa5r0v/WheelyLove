"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";

export default function GoogleButton({
  label,
  next,
}: {
  label: string;
  // Where to return after Google sign-in; sanitized (only relative paths).
  next?: string;
}) {
  const [busy, setBusy] = useState(false);
  const target = safeNext(next);

  async function go() {
    setBusy(true);
    // Sends the browser to Google; on return Better Auth sets the session cookie.
    await authClient.signIn.social({
      provider: "google",
      callbackURL: target,
      errorCallbackURL: `/sign-in?next=${encodeURIComponent(target)}`,
    });
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="press font-display flex min-h-11 w-full items-center justify-center gap-2 border border-ink px-5 py-2.5 text-sm tracking-wide transition-opacity disabled:opacity-50"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.4z" />
        <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3z" />
        <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A12 12 0 0 0 1.8 7.1l3.8 3C6.5 6.8 9 4.8 12 4.8z" />
      </svg>
      {busy ? "Пренасочване…" : label}
    </button>
  );
}
