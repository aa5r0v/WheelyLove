import { isGoogleEnabled } from "@/lib/google-auth";
import SignUpForm from "./sign-up-form";

// The Google button depends on the runtime environment, never on build time.
export const dynamic = "force-dynamic";

export default function SignUpPage() {
  return <SignUpForm googleEnabled={isGoogleEnabled()} />;
}
