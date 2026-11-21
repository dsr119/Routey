import { describe, expect, it } from "vitest";
import { daysOverdue, dueDate, invoiceState, summarize, toE164 } from "@/lib/invoice-status";

const now = new Date("2026-11-21T15:00:00Z");
const past = new Date("2026-11-19T15:00:00Z");
const future = new Date("2026-11-25T15:00:00Z");

describe("invoiceState", () => {
  it("follows the stored status for drafts, paid and void", () => {
    expect(invoiceState({ status: "draft", dueAt: past, firstViewedAt: null }, now)).toBe("not_sent");
    expect(invoiceState({ status: "paid", dueAt: past, firstViewedAt: null }, now)).toBe("paid");
    expect(invoiceState({ status: "void", dueAt: past, firstViewedAt: null }, now)).toBe("void");
  });

  it("tells opened from not opened while it isn't due yet", () => {
    expect(invoiceState({ status: "sent", dueAt: future, firstViewedAt: null }, now)).toBe("not_opened");
    expect(invoiceState({ status: "sent", dueAt: future, firstViewedAt: past }, now)).toBe("opened");
  });

  it("calls it overdue once the due date passes, opened or not", () => {
    expect(invoiceState({ status: "sent", dueAt: past, firstViewedAt: null }, now)).toBe("overdue");
    expect(invoiceState({ status: "sent", dueAt: past, firstViewedAt: past }, now)).toBe("overdue");
  });

  it("treats invoices without a due date as never overdue", () => {
    expect(invoiceState({ status: "sent", dueAt: null, firstViewedAt: null }, now)).toBe("not_opened");
  });
});

describe("due dates", () => {
  it("adds the terms to the send date", () => {
    expect(dueDate(new Date("2026-11-01T12:00:00Z"), 15).toISOString()).toBe("2026-11-16T12:00:00.000Z");
    expect(dueDate(now, 0).getTime()).toBe(now.getTime());
  });

  it("counts whole days overdue", () => {
    expect(daysOverdue(past, now)).toBe(2);
    expect(daysOverdue(future, now)).toBe(0);
    expect(daysOverdue(null, now)).toBe(0);
  });
});

describe("toE164", () => {
  it("reads US numbers however they're typed", () => {
    expect(toE164("(518) 555-0100")).toBe("+15185550100");
    expect(toE164("518.555.0100")).toBe("+15185550100");
    expect(toE164("1 518 555 0100")).toBe("+15185550100");
    expect(toE164("+1 518-555-0100")).toBe("+15185550100");
  });

  it("rejects things that aren't phone numbers", () => {
    expect(toE164("555-0100")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164("+1 518 555 01")).toBeNull();
  });
});

describe("summarize", () => {
  const monthOf = (d: Date) => d.toISOString().slice(0, 7);
  it("adds up owed, overdue, paid this month and not sent", () => {
    const rows = [
      { status: "draft", totalCents: 500, dueAt: null, firstViewedAt: null, paidAt: null },
      { status: "sent", totalCents: 1000, dueAt: future, firstViewedAt: null, paidAt: null },
      { status: "sent", totalCents: 2000, dueAt: past, firstViewedAt: past, paidAt: null },
      { status: "paid", totalCents: 3000, dueAt: past, firstViewedAt: past, paidAt: past },
      { status: "paid", totalCents: 4000, dueAt: null, firstViewedAt: null, paidAt: new Date("2026-10-30T12:00:00Z") },
      { status: "void", totalCents: 9000, dueAt: past, firstViewedAt: null, paidAt: null },
    ];
    expect(summarize(rows, now, "2026-11", monthOf)).toEqual({
      owedCents: 3000,
      owedCount: 2,
      overdueCents: 2000,
      overdueCount: 1,
      paidMonthCents: 3000,
      paidMonthCount: 1,
      notSentCount: 1,
    });
  });
});
