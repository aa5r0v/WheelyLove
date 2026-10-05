import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import Link from "next/link";
import Image from "next/image";
import RegisterServiceWorker from "./register-sw";
import HeaderNav from "./header-nav";
import { getSession } from "@/lib/auth";
import "./globals.css";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "WheelyLove — Резервации",
  description: "Резервирай тренировка по спининг, пилатес или steel training",
  manifest: "/manifest.webmanifest",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the session here makes every page dynamic (cookies), which is
  // fine: nothing may be prerendered with a user context anyway.
  const session = await getSession();

  return (
    <html
      lang="bg"
      className={`${oswald.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <header className="sticky top-0 z-40 border-b-2 border-accent bg-ink text-paper">
          <div className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/logo.png"
                alt="WheelyLove"
                width={44}
                height={44}
                className="h-9 w-9 object-contain sm:h-11 sm:w-11"
                priority
              />
              <span className="font-display text-xl tracking-wide text-paper sm:text-2xl">
                WheelyLove
              </span>
            </Link>
            <HeaderNav
              user={
                session
                  ? {
                      email: session.user.email,
                      isAdmin: session.user.role === "admin",
                      // Only a menu hint; /instructor re-checks everything on the server.
                      isInstructor: session.user.role === "instructor",
                    }
                  : null
              }
            />
          </div>
        </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t-2 border-accent bg-ink px-4 py-10 text-paper sm:px-6">
            <div className="mx-auto max-w-6xl">
              <div className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt="WheelyLove"
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                />
                <p className="font-display text-xl tracking-wide">WheelyLove</p>
              </div>
              <p className="mt-2 text-sm text-paper/60">
                <a href="mailto:wheelylove@abv.bg" className="hover:text-accent">
                  wheelylove@abv.bg
                </a>{" "}
                ·{" "}
                <a href="tel:+359886573880" className="hover:text-accent">
                  +359 886 573 880
                </a>
              </p>
              <p className="mt-4 text-sm text-paper/60">
                <Link href="/terms" className="hover:text-accent">
                  Общи условия
                </Link>{" "}
                ·{" "}
                <Link href="/privacy" className="hover:text-accent">
                  Политика за поверителност
                </Link>
              </p>
            </div>
          </footer>
          <RegisterServiceWorker />
        </body>
      </html>
  );
}
