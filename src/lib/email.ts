import { Resend } from "resend";
import { formatDateTimeLong } from "./format";

let _resend: Resend | null = null;

function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY!);
  return _resend;
}

const FROM = `WheelyLove <reservations@${process.env.RESEND_EMAIL_DOMAIN}>`;

async function sendEmail(params: { to: string; subject: string; html: string }) {
  const { data, error } = await getResend().emails.send({
    from: FROM,
    to: [params.to],
    subject: params.subject,
    html: params.html,
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
    subject: `Напомняне: ${info.sportName} утре в ${info.startTime.toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" })}`,
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
