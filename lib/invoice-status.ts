// Where an invoice stands, as the owner's dashboard shows it. Kept free of
// database code so it is easy to test.

export type InvoiceState = "not_sent" | "not_opened" | "opened" | "overdue" | "paid" | "void";

export const STATE_LABELS: Record<InvoiceState, string> = {
  not_sent: "Not sent",
  not_opened: "Sent, not opened",
  opened: "Opened, not paid",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

const DAY = 86_400_000;

export function invoiceState(
  invoice: { status: string; dueAt: Date | null; firstViewedAt: Date | null },
  now: Date,
): InvoiceState {
  if (invoice.status === "draft") return "not_sent";
  if (invoice.status === "paid") return "paid";
  if (invoice.status === "void") return "void";
  if (invoice.dueAt && invoice.dueAt.getTime() < now.getTime()) return "overdue";
  return invoice.firstViewedAt ? "opened" : "not_opened";
}

// Whole days past the due date, or 0 if it isn't due yet.
export function daysOverdue(dueAt: Date | null, now: Date): number {
  if (!dueAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - dueAt.getTime()) / DAY));
}

export function dueDate(sentAt: Date, termsDays: number): Date {
  return new Date(sentAt.getTime() + termsDays * DAY);
}

// Turns a US phone number as people type it into the +1XXXXXXXXXX form
// texting needs. Returns null if it doesn't look like a US number.
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed.replace(/[\s().-]/g, ""))) {
    const plus = "+" + trimmed.replace(/\D/g, "");
    return plus.startsWith("+1") ? (plus.length === 12 ? plus : null) : plus;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export type DashboardInvoice = {
  status: string;
  totalCents: number;
  dueAt: Date | null;
  firstViewedAt: Date | null;
  paidAt: Date | null;
};

// The numbers across the top of the invoice dashboard. `month` is the
// current YYYY-MM in the business's time zone; `monthOf` turns a date into
// the same form.
export function summarize(rows: DashboardInvoice[], now: Date, month: string, monthOf: (d: Date) => string) {
  const sum = { owedCents: 0, owedCount: 0, overdueCents: 0, overdueCount: 0, paidMonthCents: 0, paidMonthCount: 0, notSentCount: 0 };
  for (const r of rows) {
    const state = invoiceState(r, now);
    if (state === "not_sent") sum.notSentCount++;
    if (state === "not_opened" || state === "opened" || state === "overdue") {
      sum.owedCents += r.totalCents;
      sum.owedCount++;
    }
    if (state === "overdue") {
      sum.overdueCents += r.totalCents;
      sum.overdueCount++;
    }
    if (state === "paid" && r.paidAt && monthOf(r.paidAt) === month) {
      sum.paidMonthCents += r.totalCents;
      sum.paidMonthCount++;
    }
  }
  return sum;
}
