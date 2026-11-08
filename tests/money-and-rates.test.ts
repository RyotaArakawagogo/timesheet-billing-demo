import { describe, expect, it } from 'vitest';
import { centsToDecimal, formatHours, formatUsd, lineAmountCents, parseDollarsToCents } from '../src/domain/money.ts';
import { addRate, rateHistory, resolveRate } from '../src/domain/rates.ts';
import type { RateEntry } from '../src/domain/types.ts';
import { seed } from './helpers.ts';

describe('money: rounding half up per line, integer cents', () => {
  it.each([
    [60, 6850, 6850], // exact hour
    [1, 6850, 114], // 114.1667 -> 114
    [155, 6850, 17696], // 17695.8333 -> 17696
    [1, 30, 1], // 0.5 -> 1 (half up)
    [3, 10, 1], // 0.5 -> 1
    [1, 90, 2], // 1.5 -> 2
    [5, 6, 1], // 0.5 -> 1
    [0, 7200, 0],
  ])('%i min at %i ¢/h = %i ¢', (minutes, rate, expected) => {
    expect(lineAmountCents(minutes, rate)).toBe(expected);
  });

  it('rejects fractional minutes or cents rather than rounding them silently', () => {
    expect(() => lineAmountCents(1.5, 6850)).toThrow(RangeError);
    expect(() => lineAmountCents(10, 68.5)).toThrow(RangeError);
    expect(() => lineAmountCents(-1, 6850)).toThrow(RangeError);
  });

  it('formats hours from minutes, half up to 2 decimals', () => {
    expect(formatHours(155)).toBe('2.58');
    expect(formatHours(1)).toBe('0.02');
    expect(formatHours(3)).toBe('0.05');
    expect(formatHours(90)).toBe('1.50');
    expect(formatHours(0)).toBe('0.00');
  });

  it('formats and parses cents without floating point', () => {
    expect(formatUsd(123456)).toBe('$1,234.56');
    expect(formatUsd(5)).toBe('$0.05');
    expect(centsToDecimal(123456)).toBe('1234.56');
    expect(parseDollarsToCents('68.5')).toBe(6850);
    expect(parseDollarsToCents('72')).toBe(7200);
    expect(() => parseDollarsToCents('68.505')).toThrow(RangeError);
  });
});

describe('rates: the rate in effect on the local work date', () => {
  const { rates } = seed();

  it('a mid-month change applies from its effective date (inclusive)', () => {
    expect(resolveRate(rates, 'm02', '2026-03-15')?.hourlyRateCents).toBe(7200);
    expect(resolveRate(rates, 'm02', '2026-03-16')?.hourlyRateCents).toBe(7800);
    expect(resolveRate(rates, 'm06', '2026-02-17')?.hourlyRateCents).toBe(6900);
    expect(resolveRate(rates, 'm06', '2026-02-18')?.hourlyRateCents).toBe(7150);
  });

  it('returns null before the first rate, never 0 and never a later rate', () => {
    expect(resolveRate(rates, 'm07', '2026-02-15')).toBeNull();
    expect(resolveRate(rates, 'm07', '2026-02-16')?.hourlyRateCents).toBe(5400);
    expect(resolveRate(rates, 'm09', '2026-04-30')).toBeNull();
  });

  it("never uses another member's rate", () => {
    const only: RateEntry[] = [{ id: 'x1', memberId: 'm01', effectiveFrom: '2025-01-01', hourlyRateCents: 6850 }];
    expect(resolveRate(only, 'm02', '2026-03-01')).toBeNull();
  });

  it('treats two rates with the same effective date as a data error', () => {
    const dup: RateEntry[] = [
      { id: 'a', memberId: 'm01', effectiveFrom: '2026-03-01', hourlyRateCents: 7000 },
      { id: 'b', memberId: 'm01', effectiveFrom: '2026-03-01', hourlyRateCents: 7100 },
    ];
    expect(() => resolveRate(dup, 'm01', '2026-03-05')).toThrow(/Duplicate rate/);
  });

  it('adding a rate on an existing effective date is rejected with a message, and nothing changes', () => {
    const ds = seed();
    const res = addRate(ds.rates, ds.members, { memberId: 'm07', effectiveFrom: '2026-02-16', hourlyRate: '56' });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Hamid Rahimi already has a rate effective from 2026-02-16 ($54.00/h). Choose a different effective date.');
    expect(ds.rates).toEqual(seed().rates);
  });

  it('adding a valid rate returns a new list with a new id; invalid input is rejected', () => {
    const ds = seed();
    const res = addRate(ds.rates, ds.members, { memberId: 'm09', effectiveFrom: '2026-04-29', hourlyRate: '52.50' });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.added).toEqual({ id: 'r13', memberId: 'm09', effectiveFrom: '2026-04-29', hourlyRateCents: 5250 });
      expect(res.rates).toHaveLength(ds.rates.length + 1);
    }
    expect(ds.rates).toHaveLength(12);
    expect(addRate(ds.rates, ds.members, { memberId: 'm09', effectiveFrom: '2026-02-30', hourlyRate: '52' }).ok).toBe(false);
    expect(addRate(ds.rates, ds.members, { memberId: 'm09', effectiveFrom: '2026-04-29', hourlyRate: '0' }).ok).toBe(false);
    expect(addRate(ds.rates, ds.members, { memberId: 'm09', effectiveFrom: '2026-04-29', hourlyRate: '52.505' }).ok).toBe(false);
    expect(addRate(ds.rates, ds.members, { memberId: 'x', effectiveFrom: '2026-04-29', hourlyRate: '52' }).ok).toBe(false);
  });

  it('lists a member history oldest first', () => {
    expect(rateHistory(rates, 'm02').map((r) => r.effectiveFrom)).toEqual(['2025-11-01', '2026-03-16']);
  });
});
