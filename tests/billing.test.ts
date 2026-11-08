import { describe, expect, it } from 'vitest';
import { computeInvoice, computeMonth } from '../src/domain/billing.ts';
import { billingMonthOf } from '../src/domain/dates.ts';
import { MONTHS, independentAmount, independentLocalDate, independentRate, scenarios, seed } from './helpers.ts';

const ds = seed();

const missingIdsFromFixture = (memberId: string, month: string) =>
  scenarios.cases.rateMissing.filter((c) => c.memberId === memberId && c.localDate.startsWith(month)).map((c) => c.entryId).sort();

describe('[Pitfall: rate missing] work logged before a rate exists stops the invoice', () => {
  it.each([
    ['m07', '2026-02', 6, 'started Feb 9, first rate from Feb 16'],
    ['m08', '2026-02', 6, 'started Feb 23, first rate from Mar 1'],
    ['m09', '2026-04', 4, 'joined Apr 29, no rate registered'],
  ])('%s %s is blocked with the %i offending entries listed (%s)', (memberId, month, count) => {
    const inv = computeInvoice(ds, memberId, month);
    expect(inv.status).toBe('blocked');
    expect(inv.totalCents).toBeNull();
    expect(inv.sections).toEqual([]);
    const ids = inv.missingRate.map((m) => m.entryId).sort();
    expect(ids).toHaveLength(count);
    expect(ids).toEqual(missingIdsFromFixture(memberId, month));
  });

  it('those are the only blocked invoices in the data', () => {
    const blocked = MONTHS.flatMap((m) => computeMonth(ds, m)).filter((i) => i.status === 'blocked').map((i) => `${i.memberId} ${i.month}`);
    expect(blocked).toEqual(['m07 2026-02', 'm08 2026-02', 'm09 2026-04']);
  });

  it('the same member is billed normally in months where every entry has a rate', () => {
    expect(computeInvoice(ds, 'm07', '2026-03').status).toBe('ready');
    expect(computeInvoice(ds, 'm08', '2026-03').status).toBe('ready');
  });

  it('registering the missing rate unblocks the invoice and bills those entries at that rate', () => {
    const fixed = seed();
    fixed.rates.push({ id: 'r-new', memberId: 'm07', effectiveFrom: '2026-02-09', hourlyRateCents: 5400 });
    const inv = computeInvoice(fixed, 'm07', '2026-02');
    expect(inv.status).toBe('ready');
    const lines = inv.sections.flatMap((s) => s.lines);
    for (const id of missingIdsFromFixture('m07', '2026-02')) {
      expect(lines.find((l) => l.entryId === id)?.rateId).toBe('r-new');
    }
  });
});

describe('monthly invoice calculation', () => {
  const all = MONTHS.flatMap((m) => computeMonth(ds, m));

  it('a mid-month rate change splits the month by work date (m02, March: $72.00 until Mar 15, $78.00 from Mar 16)', () => {
    const inv = computeInvoice(ds, 'm02', '2026-03');
    expect(inv.status).toBe('ready');
    const lines = inv.sections.flatMap((s) => s.lines);
    expect(lines.some((l) => l.hourlyRateCents === 7200)).toBe(true);
    expect(lines.some((l) => l.hourlyRateCents === 7800)).toBe(true);
    for (const l of lines) expect(l.hourlyRateCents).toBe(l.workDate < '2026-03-16' ? 7200 : 7800);
  });

  it('every line agrees with an independent calculation (Intl dates, own rate lookup, Math.round)', () => {
    const mismatches: string[] = [];
    for (const inv of all) {
      for (const l of inv.sections.flatMap((s) => s.lines)) {
        const e = ds.timeEntries.find((x) => x.id === l.entryId)!;
        const date = independentLocalDate(e.startedAt, ds.company.timeZone);
        const rate = independentRate(ds.rates, e.memberId, date);
        if (l.workDate !== date || l.hourlyRateCents !== rate || l.amountCents !== independentAmount(e.minutes, rate!)) mismatches.push(l.entryId);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('total = sum of project subtotals = sum of line amounts', () => {
    for (const inv of all.filter((i) => i.status === 'ready')) {
      const lineSum = inv.sections.flatMap((s) => s.lines).reduce((s, l) => s + l.amountCents, 0);
      const sectionSum = inv.sections.reduce((s, x) => s + x.amountCents, 0);
      expect(inv.totalCents).toBe(sectionSum);
      expect(inv.totalCents).toBe(lineSum);
      for (const s of inv.sections) expect(s.minutes).toBe(s.lines.reduce((a, l) => a + l.minutes, 0));
    }
  });

  it('every entry belongs to exactly one invoice; a ready invoice bills all of its entries', () => {
    const invoices = MONTHS.flatMap((m) => computeMonth(ds, m));
    expect(invoices.reduce((s, i) => s + i.entryCount, 0)).toBe(ds.timeEntries.length);
    const lineIds = invoices.flatMap((i) => i.sections.flatMap((s) => s.lines.map((l) => l.entryId)));
    expect(new Set(lineIds).size).toBe(lineIds.length);
    for (const i of invoices) {
      if (i.status === 'ready') expect(i.sections.reduce((s, x) => s + x.lines.length, 0)).toBe(i.entryCount);
      // A blocked invoice lists only the entries without a rate and bills nothing.
      else expect(i.missingRate.length).toBeLessThanOrEqual(i.entryCount);
    }
  });

  it('lines are grouped under the project they were logged to, sections ordered by project code', () => {
    for (const inv of all) {
      expect(inv.sections.map((s) => s.projectCode)).toEqual([...inv.sections.map((s) => s.projectCode)].sort());
      for (const s of inv.sections) {
        for (const l of s.lines) expect(ds.timeEntries.find((e) => e.id === l.entryId)!.projectId).toBe(s.projectId);
      }
    }
  });

  it('only entries of the requested month and member are included', () => {
    const inv = computeInvoice(ds, 'm05', '2026-04');
    for (const l of inv.sections.flatMap((s) => s.lines)) {
      const e = ds.timeEntries.find((x) => x.id === l.entryId)!;
      expect(e.memberId).toBe('m05');
      expect(billingMonthOf(e.startedAt, ds.company.timeZone)).toBe('2026-04');
    }
  });

  it('invoice number, issue date and due date (paymentTermsDays = 30)', () => {
    const feb = computeInvoice(ds, 'm01', '2026-02');
    expect(feb.invoiceNumber).toBe('LVS-202602-01');
    expect(feb.issueDate).toBe('2026-03-01');
    expect(feb.dueDate).toBe('2026-03-31');
    const apr = computeInvoice(ds, 'm05', '2026-04');
    expect(apr.issueDate).toBe('2026-05-01');
    expect(apr.dueDate).toBe('2026-05-31');
  });

  it('only members who logged time in the month get an invoice', () => {
    expect(computeMonth(ds, '2026-02').map((i) => i.memberId)).not.toContain('m09');
    expect(computeMonth(ds, '2026-04').map((i) => i.memberId)).toContain('m09');
  });
});
