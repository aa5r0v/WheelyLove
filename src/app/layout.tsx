import type { Metadata } from "next";
import { Oswald, Inter } from "next/font/google";
import { ClerkProvider, Show, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import RegisterServiceWorker from "./register-sw";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html
        lang="bg"
        className={`${oswald.variable} ${inter.variable} h-full antialiased`}
      >
        <body className="flex min-h-full flex-col bg-paper text-ink">
          <header className="sticky top-0 z-40 border-b-2 border-accent bg-ink text-paper">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
              <Link
                href="/"
                className="font-display flex items-center gap-2 text-2xl tracking-wide text-paper"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                WheelyLove
              </Link>
              <nav className="flex items-center gap-5 text-sm font-medium">
                <Link href="/gallery" className="hidden hover:text-accent sm:inline">
                  Галерия
                </Link>
                <Link href="/my-bookings" className="hover:text-accent">
                  Моите резервации
                </Link>
                <Show when="signed-in">
                  <Link href="/admin" className="hover:text-accent">
                    Админ
                  </Link>
                  <UserButton />
                </Show>
                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button className="rounded-none bg-accent px-4 py-2 font-display text-sm tracking-wide text-accent-ink">
                      Вход
                    </button>
                  </SignInButton>
                </Show>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t-2 border-accent bg-ink px-4 py-10 text-paper sm:px-6">
            <div className="mx-auto max-w-6xl">
              <p className="font-display text-xl tracking-wide">WheelyLove</p>
              <p className="mt-2 text-sm text-paper/60">
                <a href="mailto:wheelylove@abv.bg" className="hover:text-accent">
                  wheelylove@abv.bg
                </a>{" "}
                ·{" "}
                <a href="tel:+359886573880" className="hover:text-accent">
                  +359 886 573 880
                </a>
              </p>
            </div>
          </footer>
          <RegisterServiceWorker />
        </body>
      </html>
    </ClerkProvider>
  );
}
