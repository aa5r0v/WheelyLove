import { Resend } from "resend";
import nodemailer, { type Transporter } from "nodemailer";
import { formatDateTimeLong } from "./format";
import { googleCalendarUrl, sessionCalendarDescription, sessionCalendarTitle } from "./calendar";
import { STUDIO_ADDRESS_LINE, STUDIO_DIRECTIONS_URL } from "./studio";
import { localeHref } from "./locale";
import type { AppLocale } from "@/i18n/routing";

let _resend: Resend | null = null;

function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

// EMAIL_FROM (e.g. "WheelyLove <adelina@purepoint.bg>") wins; the relay only
// accepts senders from the Workspace domain.
const FROM =
  process.env.EMAIL_FROM?.trim() || `WheelyLove <reservations@${process.env.RESEND_EMAIL_DOMAIN}>`;

// reservations@ has no mailbox — route customer replies to the studio's inbox.
const STUDIO_EMAIL = "wheelylove@abv.bg";
const STUDIO_PHONE = "+359 886 573 880";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wheelylove.net";

const INK = "#0a0a0a";
const ACCENT = "#3fa34d";
const MUTED = "#666666";

// ------------------------------------------------------------------ texts (i18n)

type EmailTexts = {
  footerQuestions: string;
  conf: { subject: string; heading: string; payOnSite: string; cancelHint: string; button: string };
  rem: { subject: string; heading: string; arriveEarly: string; payOnSite: string; button: string };
  waitlist: { subject: string; heading: string; wasWaiting: string; button: string };
  cancelled: {
    subjectBooking: string;
    subjectSession: string;
    headingBooking: string;
    headingSession: string;
    sessionBody: string;
    button: string;
  };
  existing: { subject: string; heading: string; p1: string; p2: string; p3: string; button: string };
  verify: { subject: string; heading: string; p1: string; p2: string; button: string };
  reset: { subject: string; heading: string; p1: string; p2: string; button: string };
  cal: { addToCalendar: string; ics: string; howToGet: string; placeLine: string };
  det: { sport: string; instructor: string; dateTime: string; place: string };
};

const TEXTS: Record<AppLocale, EmailTexts> = {
  bg: {
    footerQuestions: "Въпроси? Отговори на този имейл или се обади на",
    conf: {
      subject: "Резервацията ти е приета: {sport} — {date}",
      heading: "Резервацията ти е приета 🎉",
      payOnSite: "Плащането е на място, преди началото на тренировката.",
      cancelHint:
        "Ако не можеш да дойдеш, откажи резервацията от „Моите резервации“, за да освободиш мястото за някой друг.",
      button: "Моите резервации",
    },
    rem: {
      subject: "Напомняне: {sport} — {date}",
      heading: "Очакваме те скоро! 🚴",
      arriveEarly: "Ела 10 минути по-рано. Не забравяй вода и кърпа.",
      payOnSite: "Плащането е на място — преди началото на тренировката.",
      button: "Моите резервации",
    },
    waitlist: {
      subject: "Освободи се място: {sport} — {date}",
      heading: "Освободи се място!",
      wasWaiting:
        "Беше в списъка за чакащи за този час. Мястото е за този, който се запише пръв — побързай.",
      button: "Запиши се сега",
    },
    cancelled: {
      subjectBooking: "Отказана резервация: {sport} — {date}",
      subjectSession: "Тренировката е отменена: {sport} — {date}",
      headingBooking: "Резервацията е отказана",
      headingSession: "Тренировката е отменена",
      sessionBody:
        "За съжаление трябваше да отменим тази тренировка. Извиняваме се за неудобството — ще се радваме да те видим на друг час.",
      button: "Виж свободните часове",
    },
    existing: {
      subject: "Вече имаш профил в WheelyLove",
      heading: "Вече имаш профил в WheelyLove",
      p1: "Някой се опита да се регистрира с този имейл адрес, а профил с него вече съществува.",
      p2: "Ако не си бил ти, игнорирай писмото — нищо не се е променило.",
      p3: "Ако си забравил паролата, задай нова от бутона по-долу.",
      button: "Задай нова парола",
    },
    verify: {
      subject: "Потвърди имейла си в WheelyLove",
      heading: "Добре дошли в WheelyLove! 🎉",
      p1: "За да резервираш тренировка, първо потвърди имейл адреса си. Натисни бутона по-долу — валиден е 24 часа.",
      p2: "Ако не си създал акаунт в WheelyLove, просто игнорирай това писмо.",
      button: "Потвърди имейл",
    },
    reset: {
      subject: "Задай нова парола в WheelyLove",
      heading: "Смяна на паролата",
      p1: "Получихме заявка за нова парола за твоя акаунт. Натисни бутона по-долу, за да зададеш нова — линкът е валиден 1 час.",
      p2: "Ако не си поискал смяна на паролата, игнорирай това писмо — паролата ти няма да се промени.",
      button: "Задай нова парола",
    },
    cal: {
      addToCalendar: "Добави тренировката в календара си:",
      ics: "Apple / Outlook (.ics)",
      howToGet: "как да стигна",
      placeLine: "Мястото:",
    },
    det: { sport: "Тренировка", instructor: "Инструктор", dateTime: "Дата и час", place: "Място" },
  },
  en: {
    footerQuestions: "Questions? Reply to this email or call",
    conf: {
      // "accepted", not "confirmed": payment happens on site, so the booking is
      // pending until then ("confirmed" is the paid status).
      subject: "Your booking has been accepted: {sport} — {date}",
      heading: "Your booking has been accepted 🎉",
      payOnSite: "Payment is on site, before the class starts.",
      cancelHint:
        "If you can't make it, cancel the booking from “My bookings” so someone else can take the spot.",
      button: "My bookings",
    },
    rem: {
      subject: "Reminder: {sport} — {date}",
      heading: "See you soon! 🚴",
      arriveEarly: "Come 10 minutes early. Don't forget water and a towel.",
      payOnSite: "Payment is on site — before the class starts.",
      button: "My bookings",
    },
    waitlist: {
      subject: "A spot opened up: {sport} — {date}",
      heading: "A spot opened up!",
      wasWaiting:
        "You were on the waitlist for this class. The spot goes to whoever books first — hurry up.",
      button: "Book now",
    },
    cancelled: {
      subjectBooking: "Booking cancelled: {sport} — {date}",
      subjectSession: "Class cancelled: {sport} — {date}",
      headingBooking: "Your booking is cancelled",
      headingSession: "This class is cancelled",
      sessionBody:
        "Unfortunately we had to cancel this class. We're sorry for the inconvenience — we'd be happy to see you at another time.",
      button: "See available classes",
    },
    existing: {
      subject: "You already have a WheelyLove account",
      heading: "You already have a WheelyLove account",
      p1: "Someone tried to sign up with this email address, but an account with it already exists.",
      p2: "If that wasn't you, ignore this email — nothing has changed.",
      p3: "If you forgot your password, set a new one with the button below.",
      button: "Set a new password",
    },
    verify: {
      subject: "Confirm your email in WheelyLove",
      heading: "Welcome to WheelyLove! 🎉",
      p1: "To book a class, first confirm your email address. Press the button below — it is valid for 24 hours.",
      p2: "If you didn't create a WheelyLove account, simply ignore this email.",
      button: "Confirm email",
    },
    reset: {
      subject: "Set a new password in WheelyLove",
      heading: "Password change",
      p1: "We received a request for a new password for your account. Press the button below to set one — the link is valid for 1 hour.",
      p2: "If you didn't request a password change, ignore this letter — your password will not change.",
      button: "Set a new password",
    },
    cal: {
      addToCalendar: "Add the class to your calendar:",
      ics: "Apple / Outlook (.ics)",
      howToGet: "how to get here",
      placeLine: "Location:",
    },
    det: { sport: "Class", instructor: "Instructor", dateTime: "Date & time", place: "Location" },
  },
};

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}


// Началната страница във футера: bg → корена, en → /en (без наклонена в края).
function footerHomeUrl(locale: AppLocale): string {
  return locale === "en" ? `${SITE_URL}/en` : SITE_URL;
}

// Email clients ignore <style> and external CSS, so everything is inline and table-based.
// Езикът определя само линка „начало“ във футера (bg → корена, en → /en).
function layout(params: {
  heading: string;
  body: string;
  footerQuestion: string;
  locale: AppLocale;
  button?: { label: string; url: string };
}) {
  const button = params.button
    ? `
      <tr>
        <td style="padding: 8px 32px 8px;">
          <a href="${params.button.url}"
             style="display: inline-block; background: ${ACCENT}; color: #ffffff; text-decoration: none;
                    font-weight: bold; letter-spacing: 0.5px; padding: 12px 24px;">
            ${params.button.label}
          </a>
        </td>
      </tr>`
    : "";

  return `
  <div style="background: #f2f9f1; padding: 24px 12px; font-family: Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="max-width: 560px; margin: 0 auto; background: #ffffff; border-top: 4px solid ${ACCENT};">
      <tr>
        <td style="background: ${INK}; padding: 16px 32px;">
          <img src="${SITE_URL}/email-logo.png" width="40" height="40" alt=""
               style="vertical-align: middle; border: 0;" />
          <span style="vertical-align: middle; color: #ffffff; font-size: 20px; font-weight: bold;
                       letter-spacing: 1px; margin-left: 8px;">WHEELYLOVE</span>
        </td>
      </tr>
      <tr>
        <td style="padding: 28px 32px 8px; color: ${INK}; font-size: 15px; line-height: 1.6;">
          <h1 style="margin: 0 0 16px; font-size: 22px; color: ${INK};">${params.heading}</h1>
          ${params.body}
        </td>
      </tr>
      ${button}
      <tr>
        <td style="padding: 24px 32px 28px; color: ${MUTED}; font-size: 13px; line-height: 1.5;">
          <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 0 0 16px;" />
          ${params.footerQuestion}
          <a href="tel:${STUDIO_PHONE.replace(/\s/g, "")}" style="color: ${ACCENT};">${STUDIO_PHONE}</a>.<br />
          WheelyLove · <a href="${footerHomeUrl(params.locale)}" style="color: ${ACCENT};">${footerHomeUrl(params.locale).replace(/^https?:\/\//, "")}</a>
        </td>
      </tr>
    </table>
  </div>`;
}

function details(rows: [string, string][]) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0"
           style="width: 100%; margin: 0 0 16px; background: #f2f9f1; border-left: 4px solid ${ACCENT};">
      ${rows
        .map(
          ([label, value]) => `
        <tr>
          <td style="padding: 8px 12px; color: ${MUTED}; width: 110px; vertical-align: top;">${label}</td>
          <td style="padding: 8px 12px; font-weight: bold;">${value}</td>
        </tr>`
        )
        .join("")}
    </table>`;
}

// The recipient is never logged in full: first character + domain is enough
// to correlate with Resend's dashboard without leaking the address into logs.
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0]}***@${domain}`;
}

// kind "auth": verification / password-reset letters. These THROW on failure so
// that Better Auth can tell the client the letter was not sent (the
// /send-verification-email endpoint awaits the sender directly). Note: the
// sign-up / sign-in dispatch inside better-auth runs through
// runInBackgroundOrAwait, which catches and logs such errors itself - there the
// throw only improves the server log, it cannot reach the HTTP response.
// kind "transactional": booking letters - a failed send must not fail the
// booking itself, so the error is logged (with the marker) and swallowed.
async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  kind: "auth" | "transactional";
  type: string;
}) {
  const { data, error } = getSmtp()
    ? await sendViaSmtp(params)
    : await getResend().emails.send({
        from: FROM,
        replyTo: STUDIO_EMAIL,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      });
  if (error) {
    // Clear marker for log searches; no letter content, no full address.
    console.error(
      `[email:FAILED] ${params.type} to=${maskEmail(params.to)}`,
      error
    );
    if (params.kind === "auth") {
      throw new Error(`The mail server rejected the ${params.type} email.`);
    }
  }
  return data;
}

// SMTP transport (Google Workspace SMTP relay: smtp-relay.gmail.com:587, the
// VPS IP is allowed in the Workspace admin console, no password). Used when
// SMTP_HOST is set; otherwise Resend. Same { data, error } shape as Resend so
// the failure handling above is identical for both.
let _smtp: Transporter | null | undefined;

function getSmtp(): Transporter | null {
  if (_smtp !== undefined) return _smtp;
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return (_smtp = null);
  const user = process.env.SMTP_USER?.trim();
  _smtp = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    requireTLS: true,
    // Google's relay rejects a bare container hostname in EHLO.
    name: process.env.SMTP_HELO_NAME || new URL(SITE_URL).hostname,
    auth: user ? { user, pass: process.env.SMTP_PASS ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return _smtp;
}

async function sendViaSmtp(params: { to: string; subject: string; html: string }) {
  try {
    const info = await getSmtp()!.sendMail({
      from: FROM,
      replyTo: STUDIO_EMAIL,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    return { data: { id: info.messageId }, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? { message: err.message } : { message: String(err) } };
  }
}

type BookingEmailInfo = {
  to: string;
  sessionId: number;
  sportName: string;
  instructorName: string;
  startTime: Date;
  endTime: Date;
  // Езикът на писмото; при резервации — запазеният при създаването локейл.
  locale?: AppLocale;
};

// Calendar + navigation links for the booked session — the same three targets
// as the buttons on /booking/success. Plain <a> tags with inline styles only:
// email clients drop <style> blocks and scripts.
function calendarLinksHtml(info: BookingEmailInfo, locale: AppLocale) {
  const t = TEXTS[locale].cal;
  const link = `color: ${ACCENT}; text-decoration: underline;`;
  const googleUrl = googleCalendarUrl({
    title: sessionCalendarTitle(info.sportName),
    start: info.startTime,
    end: info.endTime,
    details: sessionCalendarDescription(info.instructorName, locale),
    location: STUDIO_ADDRESS_LINE,
  });
  return `
        <p style="margin: 0 0 12px;">${t.addToCalendar}
          <a href="${googleUrl}" style="${link}">Google Calendar</a> ·
          <a href="${SITE_URL}/api/calendar/session/${info.sessionId}?l=${locale}" style="${link}">${t.ics}</a>
        </p>
        <p style="margin: 0 0 12px;">${t.placeLine} ${STUDIO_ADDRESS_LINE} —
          <a href="${STUDIO_DIRECTIONS_URL}" style="${link}">${t.howToGet}</a>
        </p>`;
}

export async function sendBookingConfirmationEmail(info: BookingEmailInfo) {
  const locale = info.locale ?? "bg";
  const t = TEXTS[locale];
  const dateStr = formatDateTimeLong(info.startTime, locale);
  const det = t.det;

  await sendEmail({
    to: info.to,
    kind: "transactional",
    type: "booking-confirmation",
    subject: fill(t.conf.subject, { sport: info.sportName, date: dateStr }),
    html: layout({
      locale,
      heading: t.conf.heading,
      footerQuestion: t.footerQuestions,
      body: `
        ${details([
          [det.sport, info.sportName],
          [det.instructor, info.instructorName],
          [det.dateTime, dateStr],
          [det.place, STUDIO_ADDRESS_LINE],
        ])}
        ${calendarLinksHtml(info, locale)}
        <p style="margin: 0 0 12px;">${t.conf.payOnSite}</p>
        <p style="margin: 0 0 12px;">${t.conf.cancelHint}</p>
      `,
      button: { label: t.conf.button, url: `${SITE_URL}${localeHref(locale, "/my-bookings")}` },
    }),
  });
}

export async function sendBookingReminderEmail(info: BookingEmailInfo) {
  const locale = info.locale ?? "bg";
  const t = TEXTS[locale];
  const dateStr = formatDateTimeLong(info.startTime, locale);
  const det = t.det;

  await sendEmail({
    to: info.to,
    kind: "transactional",
    type: "booking-reminder",
    subject: fill(t.rem.subject, { sport: info.sportName, date: dateStr }),
    html: layout({
      locale,
      heading: t.rem.heading,
      footerQuestion: t.footerQuestions,
      body: `
        ${details([
          [det.sport, info.sportName],
          [det.instructor, info.instructorName],
          [det.dateTime, dateStr],
          [det.place, STUDIO_ADDRESS_LINE],
        ])}
        ${calendarLinksHtml(info, locale)}
        <p style="margin: 0 0 12px;">${t.rem.arriveEarly}</p>
        <p style="margin: 0 0 12px;">${t.rem.payOnSite}</p>
      `,
      button: { label: t.rem.button, url: `${SITE_URL}${localeHref(locale, "/my-bookings")}` },
    }),
  });
}

export async function sendWaitlistSpotOpenEmail(info: {
  to: string;
  sportName: string;
  startTime: Date;
  bookUrl: string;
  // Езикът на този човек от списъка (запазен при записването му).
  locale?: AppLocale;
}) {
  const locale = info.locale ?? "bg";
  const t = TEXTS[locale];
  const dateStr = formatDateTimeLong(info.startTime, locale);

  await sendEmail({
    to: info.to,
    kind: "transactional",
    type: "waitlist-spot-open",
    subject: fill(t.waitlist.subject, { sport: info.sportName, date: dateStr }),
    html: layout({
      locale,
      heading: t.waitlist.heading,
      footerQuestion: t.footerQuestions,
      body: `
        ${details([
          [t.det.sport, info.sportName],
          [t.det.dateTime, dateStr],
        ])}
        <p style="margin: 0 0 12px;">${t.waitlist.wasWaiting}</p>
      `,
      button: { label: t.waitlist.button, url: info.bookUrl },
    }),
  });
}

type BookingCancelledInfo = {
  to: string;
  sportName: string;
  startTime: Date;
  // "session" when the studio cancelled the whole class, not just this booking.
  reason: "booking" | "session";
  // Езикът, запазен при създаването на резервацията.
  locale?: AppLocale;
};

export async function sendBookingCancelledEmail(info: BookingCancelledInfo) {
  const locale = info.locale ?? "bg";
  const t = TEXTS[locale];
  const dateStr = formatDateTimeLong(info.startTime, locale);

  const sessionCancelled = info.reason === "session";

  await sendEmail({
    to: info.to,
    kind: "transactional",
    type: "booking-cancelled",
    subject: fill(
      sessionCancelled ? t.cancelled.subjectSession : t.cancelled.subjectBooking,
      { sport: info.sportName, date: dateStr }
    ),
    html: layout({
      locale,
      heading: sessionCancelled ? t.cancelled.headingSession : t.cancelled.headingBooking,
      footerQuestion: t.footerQuestions,
      body: `
        ${details([
          [t.det.sport, info.sportName],
          [t.det.dateTime, dateStr],
        ])}
        ${sessionCancelled ? `<p style="margin: 0 0 12px;">${t.cancelled.sessionBody}</p>` : ""}
      `,
      button: { label: t.cancelled.button, url: `${SITE_URL}${localeHref(locale, "/#schedule")}` },
    }),
  });
}

// ---------------------------------------------------------------- auth emails

// Sent when someone tries to sign up with an address that already belongs to
// an account (onExistingUserSignUp in src/lib/auth.ts): the owner must hear
// about it and gets the way back in.
export async function sendExistingAccountEmail(info: { to: string; locale?: AppLocale }) {
  const locale = info.locale ?? "bg";
  const t = TEXTS[locale].existing;
  await sendEmail({
    to: info.to,
    kind: "auth",
    type: "existing-account",
    subject: t.subject,
    html: layout({
      locale,
      heading: t.heading,
      footerQuestion: TEXTS[locale].footerQuestions,
      body: `
        <p style="margin: 0 0 12px;">${t.p1}</p>
        <p style="margin: 0 0 12px;">${t.p2}</p>
        <p style="margin: 0 0 12px;">${t.p3}</p>
      `,
      button: { label: t.button, url: `${SITE_URL}${localeHref(locale, "/forgot-password")}` },
    }),
  });
}

// url contains a one-time token; it expires after 24 hours.
export async function sendVerificationEmail(info: { to: string; url: string; locale?: AppLocale }) {
  const locale = info.locale ?? "bg";
  const t = TEXTS[locale].verify;
  await sendEmail({
    to: info.to,
    kind: "auth",
    type: "verification",
    subject: t.subject,
    html: layout({
      locale,
      heading: t.heading,
      footerQuestion: TEXTS[locale].footerQuestions,
      body: `
        <p style="margin: 0 0 12px;">${t.p1}</p>
        <p style="margin: 0 0 12px;">${t.p2}</p>
      `,
      button: { label: t.button, url: info.url },
    }),
  });
}

// url contains a one-time token; it expires after 1 hour.
export async function sendPasswordResetEmail(info: { to: string; url: string; locale?: AppLocale }) {
  const locale = info.locale ?? "bg";
  const t = TEXTS[locale].reset;
  await sendEmail({
    to: info.to,
    kind: "auth",
    type: "password-reset",
    subject: t.subject,
    html: layout({
      locale,
      heading: t.heading,
      footerQuestion: TEXTS[locale].footerQuestions,
      body: `
        <p style="margin: 0 0 12px;">${t.p1}</p>
        <p style="margin: 0 0 12px;">${t.p2}</p>
      `,
      button: { label: t.button, url: info.url },
    }),
  });
}
