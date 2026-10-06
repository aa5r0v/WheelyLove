import { getLocale, getTranslations } from "next-intl/server";
import ResendVerification from "@/app/resend-verification";
import { localeHref, resolveLocale } from "@/lib/locale";

// Shown to signed-in users whose email is not verified yet: without verification
// they cannot book, and the original link may be long gone.
export default async function VerifyEmailBanner({ email }: { email: string }) {
  const t = await getTranslations("myBookings");
  const locale = resolveLocale(await getLocale());
  return (
    <div className="mt-6 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm">
      <p className="font-medium">{t("verifyBanner", { email })}</p>
      <div className="mt-1">
        <ResendVerification email={email} callbackURL={localeHref(locale, "/my-bookings")} />
      </div>
    </div>
  );
}
