import { Resend } from "resend";
import { formatDateTimeLong } from "./format";

let _resend: Resend | null = null;

function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

const FROM = `WheelyLove <reservations@${process.env.RESEND_EMAIL_DOMAIN}>`;

// reservations@ has no mailbox — route customer replies to the studio's inbox.
const STUDIO_EMAIL = "wheelylove@abv.bg";
const STUDIO_PHONE = "+359 886 573 880";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wheelylove.net";

const INK = "#0a0a0a";
const ACCENT = "#3fa34d";
const MUTED = "#666666";

// Email clients ignore <style> and external CSS, so everything is inline and table-based.
function layout(params: { heading: string; body: string; button?: { label: string; url: string } }) {
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
          Въпроси? Отговори на този имейл или се обади на
          <a href="tel:${STUDIO_PHONE.replace(/\s/g, "")}" style="color: ${ACCENT};">${STUDIO_PHONE}</a>.<br />
          WheelyLove · <a href="${SITE_URL}" style="color: ${ACCENT};">${SITE_URL.replace(/^https?:\/\//, "")}</a>
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
  const { data, error } = await getResend().emails.send({
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
      throw new Error(`Resend rejected the ${params.type} email.`);
    }
  }
  return data;
}

type BookingEmailInfo = {
  to: string;
  sportName: string;
  instructorName: string;
  startTime: Date;
};

export async function sendBookingConfirmationEmail(info: BookingEmailInfo) {
  const dateStr = formatDateTimeLong(info.startTime);

  await sendEmail({
    to: info.to,
    kind: "transactional",
    type: "booking-confirmation",
    subject: `Резервацията ти е приета: ${info.sportName} — ${dateStr}`,
    html: layout({
      heading: "Резервацията ти е приета 🎉",
      body: `
        ${details([
          ["Тренировка", info.sportName],
          ["Инструктор", info.instructorName],
          ["Дата и час", dateStr],
        ])}
        <p style="margin: 0 0 12px;">Плащането е на място, преди началото на тренировката.</p>
        <p style="margin: 0 0 12px;">Ако не можеш да дойдеш, откажи резервацията от „Моите резервации“,
          за да освободиш мястото за някой друг.</p>
      `,
      button: { label: "Моите резервации", url: `${SITE_URL}/my-bookings` },
    }),
  });
}

export async function sendBookingReminderEmail(info: BookingEmailInfo) {
  const dateStr = formatDateTimeLong(info.startTime);

  await sendEmail({
    to: info.to,
    kind: "transactional",
    type: "booking-reminder",
    subject: `Напомняне: ${info.sportName} — ${dateStr}`,
    html: layout({
      heading: "Очакваме те скоро! 🚴",
      body: `
        ${details([
          ["Тренировка", info.sportName],
          ["Инструктор", info.instructorName],
          ["Дата и час", dateStr],
        ])}
        <p style="margin: 0 0 12px;">Ела 10 минути по-рано. Не забравяй вода и кърпа.</p>
        <p style="margin: 0 0 12px;">Плащането е на място — преди началото на тренировката.</p>
      `,
      button: { label: "Моите резервации", url: `${SITE_URL}/my-bookings` },
    }),
  });
}

export async function sendWaitlistSpotOpenEmail(info: {
  to: string;
  sportName: string;
  startTime: Date;
  bookUrl: string;
}) {
  const dateStr = formatDateTimeLong(info.startTime);

  await sendEmail({
    to: info.to,
    kind: "transactional",
    type: "waitlist-spot-open",
    subject: `Освободи се място: ${info.sportName} — ${dateStr}`,
    html: layout({
      heading: "Освободи се място!",
      body: `
        ${details([
          ["Тренировка", info.sportName],
          ["Дата и час", dateStr],
        ])}
        <p style="margin: 0 0 12px;">Беше в списъка за чакащи за този час. Мястото е за този,
          който се запише пръв — побързай.</p>
      `,
      button: { label: "Запиши се сега", url: info.bookUrl },
    }),
  });
}

type BookingCancelledInfo = {
  to: string;
  sportName: string;
  startTime: Date;
  // "session" when the studio cancelled the whole class, not just this booking.
  reason: "booking" | "session";
};

export async function sendBookingCancelledEmail(info: BookingCancelledInfo) {
  const dateStr = formatDateTimeLong(info.startTime);

  const sessionCancelled = info.reason === "session";

  await sendEmail({
    to: info.to,
    kind: "transactional",
    type: "booking-cancelled",
    subject: sessionCancelled
      ? `Тренировката е отменена: ${info.sportName} — ${dateStr}`
      : `Отказана резервация: ${info.sportName} — ${dateStr}`,
    html: layout({
      heading: sessionCancelled ? "Тренировката е отменена" : "Резервацията е отказана",
      body: `
        ${details([
          ["Тренировка", info.sportName],
          ["Дата и час", dateStr],
        ])}
        ${
          sessionCancelled
            ? `<p style="margin: 0 0 12px;">За съжаление трябваше да отменим тази тренировка.
                 Извиняваме се за неудобството — ще се радваме да те видим на друг час.</p>`
            : ""
        }
      `,
      button: { label: "Виж свободните часове", url: `${SITE_URL}/#schedule` },
    }),
  });
}

// ---------------------------------------------------------------- auth emails

// Sent when someone tries to sign up with an address that already belongs to
// an account (onExistingUserSignUp in src/lib/auth.ts): the owner must hear
// about it and gets the way back in.
export async function sendExistingAccountEmail(info: { to: string }) {
  await sendEmail({
    to: info.to,
    kind: "auth",
    type: "existing-account",
    subject: "Вече имаш профил в WheelyLove",
    html: layout({
      heading: "Вече имаш профил в WheelyLove",
      body: `
        <p style="margin: 0 0 12px;">Някой се опита да се регистрира с този имейл адрес,
          а профил с него вече съществува.</p>
        <p style="margin: 0 0 12px;">Ако не си бил ти, игнорирай писмото — нищо не се е променило.</p>
        <p style="margin: 0 0 12px;">Ако си забравил паролата, задай нова от бутона по-долу.</p>
      `,
      button: { label: "Задай нова парола", url: `${SITE_URL}/forgot-password` },
    }),
  });
}

// url contains a one-time token; it expires after 24 hours.
export async function sendVerificationEmail(info: { to: string; url: string }) {
  await sendEmail({
    to: info.to,
    kind: "auth",
    type: "verification",
    subject: "Потвърди имейла си в WheelyLove",
    html: layout({
      heading: "Добре дошли в WheelyLove! 🎉",
      body: `
        <p style="margin: 0 0 12px;">За да резервираш тренировка, първо потвърди имейл адреса си.
          Натисни бутона по-долу — валиден е 24 часа.</p>
        <p style="margin: 0 0 12px;">Ако не си създал акаунт в WheelyLove, просто игнорирай това писмо.</p>
      `,
      button: { label: "Потвърди имейл", url: info.url },
    }),
  });
}

// url contains a one-time token; it expires after 1 hour.
export async function sendPasswordResetEmail(info: { to: string; url: string }) {
  await sendEmail({
    to: info.to,
    kind: "auth",
    type: "password-reset",
    subject: "Задай нова парола в WheelyLove",
    html: layout({
      heading: "Смяна на паролата",
      body: `
        <p style="margin: 0 0 12px;">Получихме заявка за нова парола за твоя акаунт.
          Натисни бутона по-долу, за да зададеш нова — линкът е валиден 1 час.</p>
        <p style="margin: 0 0 12px;">Ако не си поискал смяна на паролата, игнорирай това писмо —
          паролата ти няма да се промени.</p>
      `,
      button: { label: "Задай нова парола", url: info.url },
    }),
  });
}
