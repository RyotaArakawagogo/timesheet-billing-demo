/**
 * Pitfall: time-zone boundary.
 * Entries are stored in UTC. Deciding "which day" from the UTC calendar date puts
 * late-evening work (America/Chicago is UTC-6 / UTC-5) on the next day: the wrong
 * rate, or the wrong month. The app decides the day only in dates.workDateOf,
 * in the company time zone. Each case below is one real entry in the seed data.
 */
import { describe, expect, it } from 'vitest';
import { computeInvoice } from '../src/domain/billing.ts';
import { billingMonthOf, localTimeOf, workDateOf, zoneAbbreviationAt } from '../src/domain/dates.ts';
import { lineAmountCents } from '../src/domain/money.ts';
import { resolveRate } from '../src/domain/rates.ts';
import { entry, independentLocalDate, scenarios, seed, utcCalendarDate } from './helpers.ts';

const ds = seed();
const TZ = ds.company.timeZone;

function findInInvoice(memberId: string, month: string, entryId: string) {
  const inv = computeInvoice(ds, memberId, month);
  const line = inv.sections.flatMap((s) => s.lines).find((l) => l.entryId === entryId);
  const missing = inv.missingRate.find((m) => m.entryId === entryId);
  return { inv, line, missing };
}

interface RateCase { entryId: string; memberId: string; localDate: string; localTime: string; utcDate: string; rateCents: number | null; utcRateCents: number }

/** Shared body: the trap is real (UTC date gives another rate) and the app avoids it. */
function expectLocalRate(c: RateCase) {
  const e = entry(ds, c.entryId);
  expect(e.memberId).toBe(c.memberId);
  expect(workDateOf(e.startedAt, TZ)).toBe(c.localDate);
  expect(localTimeOf(e.startedAt, TZ)).toBe(c.localTime);

  // The trap: judging the day by the UTC calendar date picks a different rate.
  expect(utcCalendarDate(e.startedAt)).toBe(c.utcDate);
  expect(resolveRate(ds.rates, c.memberId, c.utcDate)?.hourlyRateCents).toBe(c.utcRateCents);

  // The app: the invoice uses the rate of the local work date.
  const { line, missing } = findInInvoice(c.memberId, c.localDate.slice(0, 7), c.entryId);
  if (c.rateCents === null) {
    expect(line).toBeUndefined();
    expect(missing?.workDate).toBe(c.localDate);
  } else {
    expect(line?.hourlyRateCents).toBe(c.rateCents);
    expect(line?.amountCents).toBe(lineAmountCents(e.minutes, c.rateCents));
  }
}

describe('[Pitfall: time zone] rate is chosen by the local work date, not the UTC date', () => {
  it('te-0113: Feb 17 23:45 CST is billed at the Feb 17 rate $69.00, not the Feb 18 rate $71.50', () => {
    expectLocalRate({ entryId: 'te-0113', memberId: 'm06', localDate: '2026-02-17', localTime: '23:45', utcDate: '2026-02-18', rateCents: 6900, utcRateCents: 7150 });
  });

  it('te-0195: Feb 28 23:30 CST is Rate missing (first rate starts Mar 1); a UTC date would wrongly find $49.50', () => {
    expectLocalRate({ entryId: 'te-0195', memberId: 'm08', localDate: '2026-02-28', localTime: '23:30', utcDate: '2026-03-01', rateCents: null, utcRateCents: 4950 });
  });

  it('te-0322: Mar 15 23:35 CDT is billed at the Mar 15 rate $72.00, not the Mar 16 rate $78.00', () => {
    expectLocalRate({ entryId: 'te-0322', memberId: 'm02', localDate: '2026-03-15', localTime: '23:35', utcDate: '2026-03-16', rateCents: 7200, utcRateCents: 7800 });
  });

  it('te-0460: Mar 31 23:40 CDT is billed at the March rate $82.50, not the Apr 1 rate $86.00', () => {
    expectLocalRate({ entryId: 'te-0460', memberId: 'm05', localDate: '2026-03-31', localTime: '23:40', utcDate: '2026-04-01', rateCents: 8250, utcRateCents: 8600 });
  });

  it('te-0557: Apr 12 23:15 CDT is billed at the Apr 12 rate $64.00, not the Apr 13 rate $67.50', () => {
    expectLocalRate({ entryId: 'te-0557', memberId: 'm04', localDate: '2026-04-12', localTime: '23:15', utcDate: '2026-04-13', rateCents: 6400, utcRateCents: 6750 });
  });
});

interface MonthCase { entryId: string; memberId: string; localMonth: string; utcMonth: string }

function expectLocalMonth(c: MonthCase) {
  const e = entry(ds, c.entryId);
  expect(e.memberId).toBe(c.memberId);
  expect(billingMonthOf(e.startedAt, TZ)).toBe(c.localMonth);
  // The trap: the UTC calendar month is the next month.
  expect(utcCalendarDate(e.startedAt).slice(0, 7)).toBe(c.utcMonth);

  const inLocal = findInInvoice(c.memberId, c.localMonth, c.entryId);
  expect(inLocal.line ?? inLocal.missing).toBeDefined();
  const inUtc = findInInvoice(c.memberId, c.utcMonth, c.entryId);
  expect(inUtc.line ?? inUtc.missing).toBeUndefined();
}

describe('[Pitfall: time zone] billing month is decided by the local work date, not the UTC date', () => {
  it('te-0194: Feb 28 23:20 CST belongs to the February invoice, not March', () => {
    expectLocalMonth({ entryId: 'te-0194', memberId: 'm01', localMonth: '2026-02', utcMonth: '2026-03' });
  });

  it('te-0195: Feb 28 23:30 CST blocks the February invoice (Rate missing) and does not leak into March', () => {
    expectLocalMonth({ entryId: 'te-0195', memberId: 'm08', localMonth: '2026-02', utcMonth: '2026-03' });
    expect(computeInvoice(ds, 'm08', '2026-02').status).toBe('blocked');
  });

  it('te-0460: Mar 31 23:40 CDT belongs to the March invoice, not April', () => {
    expectLocalMonth({ entryId: 'te-0460', memberId: 'm05', localMonth: '2026-03', utcMonth: '2026-04' });
  });

  it('te-0719: Apr 30 23:10 CDT belongs to the April invoice, not May (outside the data period)', () => {
    expectLocalMonth({ entryId: 'te-0719', memberId: 'm02', localMonth: '2026-04', utcMonth: '2026-05' });
    expect(computeInvoice(ds, 'm02', '2026-05').entryCount).toBe(0);
  });
});

describe('[Pitfall: time zone] daylight saving time change (Mar 8, 2026)', () => {
  it('te-0259: Mar 7 23:30 CST (UTC-6, night before DST) stays on Mar 7', () => {
    const e = entry(ds, 'te-0259');
    expect(e.startedAt).toBe('2026-03-08T05:30:00Z');
    expect(workDateOf(e.startedAt, TZ)).toBe('2026-03-07');
    expect(zoneAbbreviationAt(e.startedAt, TZ)).toBe('CST');
  });

  it('te-0260: Mar 8 01:15 CST, spanning the 02:00 -> 03:00 jump, is on Mar 8 and keeps its 60 minutes', () => {
    const e = entry(ds, 'te-0260');
    expect(workDateOf(e.startedAt, TZ)).toBe('2026-03-08');
    expect(localTimeOf(e.startedAt, TZ)).toBe('01:15');
    expect(e.minutes).toBe(60);
    const end = new Date(Date.parse(e.startedAt) + e.minutes * 60_000).toISOString();
    expect(localTimeOf(end, TZ)).toBe('03:15');
    expect(zoneAbbreviationAt(end, TZ)).toBe('CDT');
  });

  it('te-0261: Mar 8 20:50 CDT (UTC-5, first evening after DST) stays on Mar 8', () => {
    const e = entry(ds, 'te-0261');
    expect(e.startedAt).toBe('2026-03-09T01:50:00Z');
    expect(workDateOf(e.startedAt, TZ)).toBe('2026-03-08');
    expect(zoneAbbreviationAt(e.startedAt, TZ)).toBe('CDT');
  });
});

describe('dates.workDateOf', () => {
  it('agrees with an independent Intl-based conversion for every seed entry', () => {
    const wrong = ds.timeEntries.filter((e) => workDateOf(e.startedAt, TZ) !== independentLocalDate(e.startedAt, TZ));
    expect(wrong).toEqual([]);
  });

  it('the hand-written cases above are exactly the ones the generator flagged', () => {
    const ids = (k: string) => scenarios.cases[k].map((c) => c.entryId).sort();
    expect(ids('utcJudgementChangesRate')).toEqual(['te-0113', 'te-0195', 'te-0322', 'te-0460', 'te-0557']);
    expect(ids('utcJudgementChangesMonth')).toEqual(['te-0194', 'te-0195', 'te-0460', 'te-0719']);
    expect(ids('dstTransition')).toEqual(['te-0259', 'te-0260', 'te-0261']);
  });

  it('rejects an invalid timestamp and an invalid zone instead of guessing', () => {
    expect(() => workDateOf('2026-02-30T10:00:00Z', TZ)).toThrow(/Invalid timestamp/);
    expect(() => workDateOf('2026-02-10T10:00:00Z', 'Mars/Olympus')).toThrow(/Invalid time zone/);
  });
});
