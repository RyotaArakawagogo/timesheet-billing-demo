/** Integer-cent arithmetic. No floating point is used for money. */

/** Amount for one entry: round_half_up(minutes * hourlyRateCents / 60), in cents. */
export function lineAmountCents(minutes: number, hourlyRateCents: number): number {
  if (!Number.isInteger(minutes) || minutes < 0) throw new RangeError(`minutes must be a non-negative integer: ${minutes}`);
  if (!Number.isInteger(hourlyRateCents) || hourlyRateCents < 0) throw new RangeError(`rate must be non-negative integer cents: ${hourlyRateCents}`);
  const product = minutes * hourlyRateCents;
  if (!Number.isSafeInteger(product * 2 + 60)) throw new RangeError('amount out of range');
  // floor(product / 60 + 1/2) using integers only
  return Math.floor((product * 2 + 60) / 120);
}

/** Hours for display, rounded half up to 2 decimals, from integer minutes. */
export function formatHours(minutes: number): string {
  const hundredths = Math.floor((minutes * 100 * 2 + 60) / 120);
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, '0')}`;
}

/** Cents -> "1234.50" (no symbol, no grouping). Used by CSV. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Cents -> "$1,234.50". Used by screens and PDF. */
export function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** "68.50" -> 6850. Rejects more than 2 decimals. */
export function parseDollarsToCents(value: string): number {
  const m = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(value);
  if (!m) throw new RangeError(`Not a dollar amount: ${value}`);
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}
