import ResendVerification from "@/app/resend-verification";

// Shown to signed-in users whose email is not verified yet: without verification
// they cannot book, and the original link may be long gone.
export default function VerifyEmailBanner({ email }: { email: string }) {
  return (
    <div className="mt-6 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm">
      <p className="font-medium">
        Потвърди имейла си ({email}), за да можеш да резервираш тренировка.
      </p>
      <div className="mt-1">
        <ResendVerification email={email} callbackURL="/my-bookings" />
      </div>
    </div>
  );
}
