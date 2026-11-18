// Invoice totals. All amounts are whole cents. Tax rates are thousandths of a
// percent, so 8.875% (as in New York City) is 8875 and stays exact.

export type Line = { quantity: number; unitCents: number; taxable: boolean };

export function lineTotal(line: Line): number {
  return line.quantity * line.unitCents;
}

export function totals(lines: Line[], taxRateMilli: number) {
  const subtotalCents = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const taxableCents = lines.filter((l) => l.taxable).reduce((sum, l) => sum + lineTotal(l), 0);
  // Tax is figured once on the taxable total and rounded to the nearest cent.
  const taxCents = Math.round((taxableCents * taxRateMilli) / 100_000);
  return { subtotalCents, taxableCents, taxCents, totalCents: subtotalCents + taxCents };
}

// "8.875" or "8.875%" -> 8875. Returns null for anything that isn't 0 to 100.
export function parsePercent(input: string): number | null {
  const cleaned = input.replace(/[%\s]/g, "");
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(cleaned)) return null;
  const milli = Math.round(Number(cleaned) * 1000);
  return milli <= 100_000 ? milli : null;
}

export function formatPercent(rateMilli: number): string {
  return `${(rateMilli / 1000).toFixed(3).replace(/\.?0+$/, "")}%`;
}
