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

const CONTACT_FOOTER = `
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0 12px;" />
  <p style="font-family: sans-serif; font-size: 13px; color: #666;">
    Въпроси? Отговори на този имейл или се обади на
    <a href="tel:${STUDIO_PHONE.replace(/\s/g, "")}">${STUDIO_PHONE}</a>.<br />
    WheelyLove · ${STUDIO_EMAIL}
  </p>
`;

async function sendEmail(params: { to: string; subject: string; html: string }) {
  const { data, error } = await getResend().emails.send({
    from: FROM,
    replyTo: STUDIO_EMAIL,
    to: [params.to],
    subject: params.subject,
    html: params.html + CONTACT_FOOTER,
  });
  if (error) {
    console.error("Failed to send email:", error);
  }
  return data;
}

type BookingEmailInfo = {
  to: string;
  sportName: string;
  instructorName: string;
  startTime: Date;
  paymentMethod: "card" | "cash";
};

export async function sendBookingConfirmationEmail(info: BookingEmailInfo) {
  const dateStr = formatDateTimeLong(info.startTime);

  const paymentNote =
    info.paymentMethod === "cash"
      ? "Плащането е в брой на място, преди началото на тренировката."
      : "Плащането с карта е потвърдено.";

  await sendEmail({
    to: info.to,
    subject: `Потвърдена резервация: ${info.sportName} — ${dateStr}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.5;">
        <h2>Резервацията е потвърдена 🎉</h2>
        <p><strong>Тренировка:</strong> ${info.sportName}</p>
        <p><strong>Инструктор:</strong> ${info.instructorName}</p>
        <p><strong>Дата и час:</strong> ${dateStr}</p>
        <p>${paymentNote}</p>
        <p>До скоро!</p>
      </div>
    `,
  });
}

export async function sendBookingReminderEmail(info: BookingEmailInfo) {
  const dateStr = formatDateTimeLong(info.startTime);

  await sendEmail({
    to: info.to,
    subject: `Напомняне: ${info.sportName} — ${dateStr}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.5;">
        <h2>Напомняне за тренировка</h2>
        <p><strong>Тренировка:</strong> ${info.sportName}</p>
        <p><strong>Инструктор:</strong> ${info.instructorName}</p>
        <p><strong>Дата и час:</strong> ${dateStr}</p>
        <p>Очакваме те!</p>
      </div>
    `,
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
    subject: `Освободи се място: ${info.sportName} — ${dateStr}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.5;">
        <h2>Освободи се място!</h2>
        <p><strong>Тренировка:</strong> ${info.sportName}</p>
        <p><strong>Дата и час:</strong> ${dateStr}</p>
        <p>Мястото е за този, който се запише пръв — побързай.</p>
        <p><a href="${info.bookUrl}">Запиши се сега</a></p>
      </div>
    `,
  });
}

type BookingCancelledInfo = {
  to: string;
  sportName: string;
  startTime: Date;
  refunded: boolean;
};

export async function sendBookingCancelledEmail(info: BookingCancelledInfo) {
  const dateStr = formatDateTimeLong(info.startTime);
  const refundNote = info.refunded
    ? "Сумата ще бъде възстановена по картата ти в рамките на няколко работни дни."
    : "";

  await sendEmail({
    to: info.to,
    subject: `Отказана резервация: ${info.sportName} — ${dateStr}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.5;">
        <h2>Резервацията е отказана</h2>
        <p><strong>Тренировка:</strong> ${info.sportName}</p>
        <p><strong>Дата и час:</strong> ${dateStr}</p>
        <p>${refundNote}</p>
      </div>
    `,
  });
}
