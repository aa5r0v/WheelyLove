import { isGoogleEnabled } from "@/lib/google-auth";
import SignUpForm from "./sign-up-form";
import type { Metadata } from "next";

// The Google button depends on the runtime environment, never on build time.
export const dynamic = "force-dynamic";


// Частна страница: няма място в индекса на търсачите.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SignUpPage(
{
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawNext = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  return (
    <SignUpForm
      googleEnabled={isGoogleEnabled()}
      next={typeof rawNext === "string" ? rawNext : undefined}
    />
  );
}
