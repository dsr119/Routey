import { describe, expect, it } from "vitest";
import {
  LOCK_MINUTES,
  MAX_FAILED_ATTEMPTS,
  afterFailedAttempt,
  isLocked,
  isValidLoginId,
  isValidPin,
  randomLoginId,
  randomPin,
} from "@/lib/auth-rules";

describe("PIN and ID format", () => {
  it("accepts exactly 6 digits for a PIN", () => {
    expect(isValidPin("012345")).toBe(true);
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("12a456")).toBe(false);
  });

  it("accepts exactly 7 digits for an ID", () => {
    expect(isValidLoginId("1234567")).toBe(true);
    expect(isValidLoginId("123456")).toBe(false);
  });

  it("makes IDs that never start with 0 and stay 7 digits", () => {
    expect(randomLoginId(() => 0)).toBe("1000000");
    expect(randomLoginId(() => 0.999999999)).toBe("9999999");
    for (let i = 0; i < 200; i++) expect(isValidLoginId(randomLoginId())).toBe(true);
  });

  it("pads PINs to 6 digits", () => {
    expect(randomPin(() => 0)).toBe("000000");
    for (let i = 0; i < 200; i++) expect(isValidPin(randomPin())).toBe(true);
  });
});

describe("lockout", () => {
  const now = new Date("2026-11-18T12:00:00Z");

  it("counts failures without locking until the limit", () => {
    expect(afterFailedAttempt(0, now)).toEqual({ failedAttempts: 1, lockedUntil: null });
    expect(afterFailedAttempt(MAX_FAILED_ATTEMPTS - 2, now).lockedUntil).toBeNull();
  });

  it("locks on the last allowed failure and resets the count", () => {
    const result = afterFailedAttempt(MAX_FAILED_ATTEMPTS - 1, now);
    expect(result.failedAttempts).toBe(0);
    expect(result.lockedUntil?.getTime()).toBe(now.getTime() + LOCK_MINUTES * 60_000);
  });

  it("is locked only before the lock time", () => {
    const until = new Date(now.getTime() + 1000);
    expect(isLocked(until, now)).toBe(true);
    expect(isLocked(until, new Date(now.getTime() + 2000))).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
});
