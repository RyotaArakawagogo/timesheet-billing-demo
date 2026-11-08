import { isValidLocalDate } from './dates.ts';
import { formatUsd, parseDollarsToCents } from './money.ts';
import type { Member, RateEntry } from './types.ts';

export interface NewRateInput {
  memberId: string;
  /** YYYY-MM-DD, local date in the company zone */
  effectiveFrom: string;
  /** Dollars as typed, e.g. "52" or "52.50" */
  hourlyRate: string;
}

export type AddRateResult = { ok: true; rates: RateEntry[]; added: RateEntry } | { ok: false; error: string };

/** Validates and appends a rate. Returns a new array; the input is not modified. */
export function addRate(rates: readonly RateEntry[], members: readonly Member[], input: NewRateInput): AddRateResult {
  const member = members.find((m) => m.id === input.memberId);
  if (!member) return { ok: false, error: 'Select a member.' };
  if (!isValidLocalDate(input.effectiveFrom)) return { ok: false, error: 'Enter the effective date as YYYY-MM-DD.' };
  let cents: number;
  try {
    cents = parseDollarsToCents(input.hourlyRate);
  } catch {
    return { ok: false, error: 'Enter the hourly rate in dollars with up to two decimals, for example 52.50.' };
  }
  if (cents <= 0) return { ok: false, error: 'The hourly rate must be greater than zero.' };
  const clash = rates.find((r) => r.memberId === member.id && r.effectiveFrom === input.effectiveFrom);
  if (clash) {
    return {
      ok: false,
      error: `${member.name} already has a rate effective from ${input.effectiveFrom} (${formatUsd(clash.hourlyRateCents)}/h). Choose a different effective date.`,
    };
  }
  const nextNumber = Math.max(0, ...rates.map((r) => Number(/^r(\d+)$/.exec(r.id)?.[1] ?? 0))) + 1;
  const added: RateEntry = { id: `r${String(nextNumber).padStart(2, '0')}`, memberId: member.id, effectiveFrom: input.effectiveFrom, hourlyRateCents: cents };
  return { ok: true, rates: [...rates, added], added };
}

/**
 * Rate in effect for a member on a local work date: the rate entry with the
 * latest effectiveFrom that is <= workDate. null means Rate missing.
 *
 * `workDate` must come from dates.workDateOf (company time zone).
 * Two entries with the same effectiveFrom for one member are treated as a data error.
 */
export function resolveRate(rates: readonly RateEntry[], memberId: string, workDate: string): RateEntry | null {
  let best: RateEntry | null = null;
  for (const r of rates) {
    if (r.memberId !== memberId || r.effectiveFrom > workDate) continue;
    if (best && r.effectiveFrom === best.effectiveFrom) {
      throw new Error(`Duplicate rate for ${memberId} effective ${r.effectiveFrom} (${best.id}, ${r.id})`);
    }
    if (!best || r.effectiveFrom > best.effectiveFrom) best = r;
  }
  return best;
}

/** A member's rate history, oldest first. */
export function rateHistory(rates: readonly RateEntry[], memberId: string): RateEntry[] {
  return rates.filter((r) => r.memberId === memberId).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}
