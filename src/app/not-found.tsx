import Link from "next/link";

// За пътища извън [locale] дървото (напр. неподдържан локал префик): тук няма
// преводачески контекст, затова е неутрално двуезично.
export default function RootNotFound() {
  return (
    <html lang="bg">
      <body className="flex min-h-full flex-col items-center justify-center gap-4 bg-paper px-4 text-center text-ink">
        <h1 className="font-display text-4xl">Страницата не е намерена · Page not found</h1>
        <p className="text-sm text-ink/60">
          Линкът може да е стар или грешно въведен. · The link may be outdated or mistyped.
        </p>
        <div className="flex gap-4">
          <Link href="/" className="font-display bg-accent px-6 py-3 text-sm tracking-wide text-accent-ink">
            Към началото
          </Link>
          <Link href="/en" className="font-display border-2 border-ink px-6 py-3 text-sm tracking-wide">
            Home
          </Link>
        </div>
      </body>
    </html>
  );
}
