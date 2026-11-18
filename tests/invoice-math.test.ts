import { describe, expect, it } from "vitest";
import { formatPercent, parsePercent, totals } from "@/lib/invoice-math";

describe("totals", () => {
  it("adds tax only on taxable lines", () => {
    const t = totals(
      [
        { quantity: 1, unitCents: 4500, taxable: true },
        { quantity: 2, unitCents: 1000, taxable: false },
      ],
      8000,
    );
    expect(t).toEqual({ subtotalCents: 6500, taxableCents: 4500, taxCents: 360, totalCents: 6860 });
  });

  it("rounds tax to the nearest cent", () => {
    // 6.25% of $10.10 is 63.125 cents.
    expect(totals([{ quantity: 1, unitCents: 1010, taxable: true }], 6250).taxCents).toBe(63);
    // 6.25% of $10.12 is 63.25 cents, 6.25% of $10.16 is 63.5 cents.
    expect(totals([{ quantity: 1, unitCents: 1016, taxable: true }], 6250).taxCents).toBe(64);
  });

  it("keeps NYC's 8.875% exact", () => {
    expect(totals([{ quantity: 1, unitCents: 10000, taxable: true }], 8875).taxCents).toBe(888);
    expect(totals([{ quantity: 1, unitCents: 100000, taxable: true }], 8875).taxCents).toBe(8875);
  });

  it("handles no lines and no tax", () => {
    expect(totals([], 8000).totalCents).toBe(0);
    expect(totals([{ quantity: 3, unitCents: 999, taxable: true }], 0).totalCents).toBe(2997);
  });
});

describe("percent", () => {
  it("reads typed rates", () => {
    expect(parsePercent("8")).toBe(8000);
    expect(parsePercent("6.25%")).toBe(6250);
    expect(parsePercent("8.875")).toBe(8875);
    expect(parsePercent("0")).toBe(0);
  });

  it("rejects bad rates", () => {
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
    expect(parsePercent("101")).toBeNull();
    expect(parsePercent("-1")).toBeNull();
  });

  it("shows rates without trailing zeros", () => {
    expect(formatPercent(8000)).toBe("8%");
    expect(formatPercent(6250)).toBe("6.25%");
    expect(formatPercent(8875)).toBe("8.875%");
  });
});
