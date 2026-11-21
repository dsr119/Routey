import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { businesses, clients, invoiceLines, invoices } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { recordInvoiceView, startCheckout } from "@/lib/invoicing";
import { formatCents } from "@/lib/money";
import InvoiceView from "@/components/InvoiceView";

export const dynamic = "force-dynamic";

// Public page behind the emailed pay link. The token is the only key, so it
// shows this one invoice and nothing else.
async function load(token: string) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return null;
  const invoice = await db.query.invoices.findFirst({ where: eq(invoices.payToken, token) });
  if (!invoice || invoice.status === "draft") return null;
  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoice.id))
    .orderBy(asc(invoiceLines.id));
  const client = await db.query.clients.findFirst({ where: eq(clients.id, invoice.clientId) });
  const business = await db.query.businesses.findFirst({ where: eq(businesses.id, invoice.businessId) });
  return business ? { invoice, lines, client, business } : null;
}

// Link previews in texting and email apps, and email link scanners, fetch the
// page before anyone taps it. They name themselves in the user agent, so skip them.
const PREVIEW_BOTS = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|discord|scan|safelinks|curl|wget/i;

async function countView(invoiceId: number, businessId: number) {
  const agent = (await headers()).get("user-agent") ?? "";
  if (!agent || PREVIEW_BOTS.test(agent)) return;
  const user = await getCurrentUser();
  if (user && user.businessId === businessId && user.role !== "client") return;
  try {
    await recordInvoiceView(invoiceId);
  } catch (e) {
    // Never keep a client from paying because the view count failed.
    console.error("Couldn't record invoice view", e);
  }
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; error?: string }>;
}) {
  const { token } = await params;
  const { paid, error } = await searchParams;
  const data = await load(token);
  if (!data) notFound();
  const { invoice, business } = data;
  if (invoice.status === "sent") await countView(invoice.id, business.id);

  async function pay() {
    "use server";
    const result = await startCheckout(token);
    if (result.url) redirect(result.url);
    redirect(`/pay/${token}?error=${encodeURIComponent(result.error ?? "Something went wrong.")}`);
  }

  return (
    <main style={{ maxWidth: 640 }}>
      {invoice.status === "paid" && <p className="notice">Paid. Thank you!</p>}
      {invoice.status === "void" && <p className="notice">This invoice was canceled. Nothing is owed.</p>}
      {invoice.status === "sent" && paid && (
        <p className="notice">Thank you! Your payment is going through. This page will show Paid shortly.</p>
      )}
      {error && <p className="error">{error}</p>}

      <InvoiceView {...data} serviceAddress={null} serviceDate={null} />

      {invoice.status === "sent" && !paid && (
        <form action={pay}>
          <button className="big">Pay {formatCents(invoice.totalCents)}</button>
          <p className="muted">You&apos;ll enter your card on Stripe&apos;s secure page.</p>
        </form>
      )}
      {business.phone && <p className="muted">Questions? Call {business.phone}.</p>}
    </main>
  );
}
