// Login rules kept free of database code so they are easy to test.

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;
export const SESSION_DAYS = 30;

export function isValidPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8;
}

export function isValidLoginId(id: string): boolean {
  return /^\d{7}$/.test(id);
}

// A 7-digit ID that never starts with 0, so it reads the same written down.
export function randomLoginId(random: () => number = Math.random): string {
  return String(1_000_000 + Math.floor(random() * 9_000_000));
}

export function randomPin(random: () => number = Math.random): string {
  return String(Math.floor(random() * 1_000_000)).padStart(6, "0");
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

// What to store after a wrong PIN or password.
export function afterFailedAttempt(
  failedAttempts: number,
  now: Date,
): { failedAttempts: number; lockedUntil: Date | null } {
  const next = failedAttempts + 1;
  if (next >= MAX_FAILED_ATTEMPTS) {
    return {
      failedAttempts: 0,
      lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
    };
  }
  return { failedAttempts: next, lockedUntil: null };
}
