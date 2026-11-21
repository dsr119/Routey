import { stripe } from "@/lib/stripe";
import { recordStripePayment } from "@/lib/invoicing";

// Stripe calls this when a client pays. Set the endpoint in the Stripe
// dashboard to <APP_URL>/api/stripe/webhook and put its signing secret in
// STRIPE_WEBHOOK_SECRET.
export async function POST(request: Request) {
  const s = stripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !secret) return new Response("Stripe is not set up", { status: 503 });

  const body = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  let event;
  try {
    event = s.webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  // Card payments finish right away. Bank payments finish days later and
  // arrive as async_payment_succeeded.
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    await recordStripePayment(event.data.object);
  }
  return Response.json({ received: true });
}
