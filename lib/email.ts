import "server-only";

export type Email = { to: string; subject: string; text: string; replyTo?: string | null };

// Sends through Resend when RESEND_API_KEY and EMAIL_FROM are set.
// Without them nothing is sent and the message is printed to the server log,
// which is handy on a laptop.
export async function sendEmail(email: Email): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.log(`[email not sent, no RESEND_API_KEY] to ${email.to}: ${email.subject}\n${email.text}`);
    return { sent: false, error: "Email isn't set up yet." };
  }
  try {
    // RESEND_API_URL only exists so tests can point at a fake server.
    const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        ...(email.replyTo && { reply_to: email.replyTo }),
      }),
    });
    if (!res.ok) return { sent: false, error: `Email failed (${res.status}).` };
    return { sent: true };
  } catch {
    return { sent: false, error: "Couldn't reach the email service." };
  }
}
