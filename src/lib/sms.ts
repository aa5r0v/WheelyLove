import twilio from "twilio";

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
  const dateStr = info.startTime.toLocaleString("bg-BG", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  await sendSms(
    info.to,
    `WheelyLove: резервацията ти за ${info.sportName} на ${dateStr} е потвърдена.`
  );
}

export async function sendBookingReminderSms(info: BookingSmsInfo) {
  const dateStr = info.startTime.toLocaleString("bg-BG", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  await sendSms(
    info.to,
    `WheelyLove: напомняне за ${info.sportName} на ${dateStr}. До скоро!`
  );
}

export async function sendBookingCancelledSms(info: BookingSmsInfo) {
  const dateStr = info.startTime.toLocaleString("bg-BG", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  await sendSms(
    info.to,
    `WheelyLove: резервацията ти за ${info.sportName} на ${dateStr} е отказана.`
  );
}
