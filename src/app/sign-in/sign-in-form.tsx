"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import GoogleButton from "@/app/google-button";
import ResendVerification from "@/app/resend-verification";
import { safeNext } from "@/lib/safe-next";

function errorText(code: string | null | undefined) {
  if (code === "EMAIL_NOT_VERIFIED") {
    return "Потвърди имейла си — изпратихме ти нов линк. Провери пощата си (и папка „Спам“).";
  }
  if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "USER_NOT_FOUND") {
    return "Грешен имейл или парола.";
  }
  return "Възникна грешка. Опитай отново.";
}

export default function SignInForm({
  googleEnabled,
  oauthError,
  next,
}: {
  googleEnabled: boolean;
  oauthError: boolean;
  // Where to go after signing in (the page the guest came from); sanitized.
  next?: string;
}) {
  const router = useRouter();
  const target = safeNext(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    oauthError
      ? "Входът с Google не успя. Ако вече имаш профил с този имейл, влез с парола."
      : null
  );
  const [needsVerification, setNeedsVerification] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    // callbackURL only matters when the email is unverified: the fresh
    // verification letter then leads back to the page the user wanted.
    const { error: err } = await authClient.signIn.email({
      email,
      password,
      callbackURL: target,
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
      <h1 className="font-display text-4xl">Вход</h1>
      <p className="mt-2 text-ink/60">Влез, за да резервираш тренировка.</p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-medium tracking-wide text-ink/60">
            Имейл
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
            Парола
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
          {loading ? "Влизане…" : "Влез"}
        </button>
      </form>

      {googleEnabled && (
        <div className="mt-6">
          <GoogleButton label="Вход с Google" next={target} />
        </div>
      )}

      <div className="mt-6 space-y-2 text-sm text-ink/60">
        <p>
          Нямаш профил?{" "}
          <Link
            href={`/sign-up?next=${encodeURIComponent(target)}`}
            className="text-accent-deep underline underline-offset-2"
          >
            Регистрация
          </Link>
        </p>
        <p>
          <Link href="/forgot-password" className="text-accent-deep underline underline-offset-2">
            Забравена парола?
          </Link>
        </p>
      </div>
    </div>
  );
}
