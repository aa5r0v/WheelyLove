import type { Metadata } from "next";

// Частна страница: няма място в индекса на търсачите.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
