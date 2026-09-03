import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe() {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

export async function refundPayment(paymentIntentId: string) {
  try {
    await getStripe().refunds.create({ payment_intent: paymentIntentId });
    return true;
  } catch (err) {
    console.error("Failed to refund payment:", err);
    return false;
  }
}
