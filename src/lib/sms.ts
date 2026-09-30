import twilio from "twilio";
import { formatDateTimeShort } from "./format";

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!_client) {
    _client = twilio(
      process.env.TWILIO_ACCOUNT_SID!,
      process.env.TWILIO_AUTH_TOKEN!
    );
  }
  return _client;
}

function isConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
  );
}

async function sendSms(to: string, body: string) {
  if (!isConfigured()) {
    console.warn("Twilio not configured — skipping SMS to", to);
    return;
  }
  try {
    await getClient().messages.create({
      to,
      from: process.env.TWILIO_FROM_NUMBER!,
      body,
    });
  } catch (err) {
    console.error("Failed to send SMS:", err);
  }
}

type BookingSmsInfo = {
  to: string;
  sportName: string;
  startTime: Date;
};

export async function sendBookingConfirmationSms(info: BookingSmsInfo) {
  const dateStr = formatDateTimeShort(info.startTime);
  await sendSms(
    info.to,
    `WheelyLove: резервацията ти за ${info.sportName} на ${dateStr} е приета. Плащането е на място.`
  );
}

export async function sendBookingReminderSms(info: BookingSmsInfo) {
  const dateStr = formatDateTimeShort(info.startTime);
  await sendSms(
    info.to,
    `WheelyLove: напомняне за ${info.sportName} на ${dateStr}. До скоро!`
  );
}

export async function sendBookingCancelledSms(
  info: BookingSmsInfo & { reason: "booking" | "session" }
) {
  const dateStr = formatDateTimeShort(info.startTime);
  await sendSms(
    info.to,
    info.reason === "session"
      ? `WheelyLove: тренировката ${info.sportName} на ${dateStr} е отменена. Извиняваме се!`
      : `WheelyLove: резервацията ти за ${info.sportName} на ${dateStr} е отказана.`
  );
}
