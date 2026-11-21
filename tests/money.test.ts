import { describe, expect, it } from "vitest";
import { centsToInput, formatCents, parseDollars } from "@/lib/money";

describe("parseDollars", () => {
  it("reads common ways of typing a price", () => {
    expect(parseDollars("45")).toBe(4500);
    expect(parseDollars("45.5")).toBe(4550);
    expect(parseDollars("45.05")).toBe(4505);
    expect(parseDollars("$1,045.50")).toBe(104550);
    expect(parseDollars(" 0.99 ")).toBe(99);
  });

  it("rejects anything that isn't a price", () => {
    expect(parseDollars("")).toBeNull();
    expect(parseDollars("abc")).toBeNull();
    expect(parseDollars("4.555")).toBeNull();
    expect(parseDollars("-5")).toBeNull();
  });
});

describe("formatCents", () => {
  it("shows dollars and cents", () => {
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(4505)).toBe("$45.05");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
    expect(formatCents(-250)).toBe("-$2.50");
  });

  it("round-trips through the input format", () => {
    expect(parseDollars(centsToInput(4550))).toBe(4550);
  });
});
