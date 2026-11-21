import "server-only";
import { toE164 } from "./invoice-status";

// Sends a text through Twilio when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
// TWILIO_FROM are set. Without them nothing is sent and the message is printed
// to the server log. Only invoices are texted.
export async function sendText(to: string, body: string): Promise<{ sent: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const number = toE164(to);
  if (!number) return { sent: false, error: "The client's phone number doesn't look right." };
  if (!sid || !token || !from) {
    console.log(`[text not sent, no TWILIO keys] to ${number}: ${body}`);
    return { sent: false, error: "Texting isn't set up yet." };
  }
  try {
    // TWILIO_API_URL only exists so tests can point at a fake server.
    const base = process.env.TWILIO_API_URL ?? "https://api.twilio.com";
    const res = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: number, From: from, Body: body }),
    });
    if (!res.ok) return { sent: false, error: `Text failed (${res.status}).` };
    return { sent: true };
  } catch {
    return { sent: false, error: "Couldn't reach the texting service." };
  }
}
