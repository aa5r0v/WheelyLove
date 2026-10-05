import { isGoogleEnabled } from "@/lib/google-auth";
import SignInForm from "./sign-in-form";

// The Google button depends on the runtime environment, never on build time.
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const rawNext = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  return (
    <SignInForm
      googleEnabled={isGoogleEnabled()}
      oauthError={!!sp.error}
      next={typeof rawNext === "string" ? rawNext : undefined}
    />
  );
}
