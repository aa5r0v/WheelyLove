"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import GoogleButton from "@/app/google-button";

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
}: {
  googleEnabled: boolean;
  oauthError: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    oauthError
      ? "Входът с Google не успя. Ако вече имаш профил с този имейл, влез с парола."
      : null
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.signIn.email({ email, password });
    if (err) {
      setError(errorText(err.code));
      setLoading(false);
      return;
    }
    router.push("/");
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
          <GoogleButton label="Вход с Google" />
        </div>
      )}

      <div className="mt-6 space-y-2 text-sm text-ink/60">
        <p>
          Нямаш профил?{" "}
          <Link href="/sign-up" className="text-accent-deep underline underline-offset-2">
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
