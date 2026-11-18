import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

// Null until STRIPE_SECRET_KEY is set. Use a test key (sk_test_...) until
// the business is ready to take real money.
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) {
    // STRIPE_API_URL only exists so tests can point at a fake server.
    const fake = process.env.STRIPE_API_URL ? new URL(process.env.STRIPE_API_URL) : null;
    client = new Stripe(key, {
      ...(fake && {
        host: fake.hostname,
        port: fake.port,
        protocol: fake.protocol.replace(":", "") as "http" | "https",
      }),
    });
  }
  return client;
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
