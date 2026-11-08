/**
 * Display text must be English (en-US) whatever language the browser uses.
 * Luxon otherwise follows the runtime default locale, so force a Japanese default here.
 */
import { Settings } from 'luxon';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { computeInvoice } from '../src/domain/billing.ts';
import { localTimeOf, zoneAbbreviationAt } from '../src/domain/dates.ts';
import { formatUsd } from '../src/domain/money.ts';
import { buildInvoicePdf, keepSectionTogether, PDF_KEEP_TOGETHER_MAX_LINES } from '../src/export/pdf.ts';
import { dateLabel, monthLabel, shortDateLabel } from '../src/ui/format.ts';
import { seed } from './helpers.ts';

const NON_LATIN = /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/;

describe('display formats are en-US even when the default locale is Japanese', () => {
  const original = Settings.defaultLocale;
  beforeAll(() => {
    Settings.defaultLocale = 'ja-JP';
  });
  afterAll(() => {
    Settings.defaultLocale = original;
  });

  it('month and date labels', () => {
    expect(monthLabel('2026-03')).toBe('March 2026');
    expect(dateLabel('2026-03-16')).toBe('Mar 16, 2026');
    expect(shortDateLabel('2026-03-16')).toBe('Mon, Mar 16');
  });

  it('times and time-zone abbreviations', () => {
    expect(localTimeOf('2026-03-16T04:35:00Z', 'America/Chicago')).toBe('23:35');
    expect(zoneAbbreviationAt('2026-02-18T05:45:00Z', 'America/Chicago')).toBe('CST');
    expect(zoneAbbreviationAt('2026-03-16T04:35:00Z', 'America/Chicago')).toBe('CDT');
  });

  it('money', () => {
    expect(formatUsd(123456789)).toBe('$1,234,567.89');
  });

  it('the PDF definition contains no Japanese characters', () => {
    expect(JSON.stringify(buildInvoicePdf(computeInvoice(seed(), 'm02', '2026-03')))).not.toMatch(NON_LATIN);
  });
});

describe('PDF page breaks', () => {
  const sectionFlags = (memberId: string, month: string) => {
    const inv = computeInvoice(seed(), memberId, month);
    const nodes = (buildInvoicePdf(inv).content as unknown as { unbreakable?: boolean; stack?: unknown[] }[]).filter((n) => Array.isArray(n.stack) && 'unbreakable' in n);
    expect(nodes).toHaveLength(inv.sections.length);
    return inv.sections.map((s, i) => ({ lines: s.lines.length, keep: nodes[i].unbreakable }));
  };

  it('the first project section may split (it starts right below the header), so page 1 is never left empty', () => {
    // LVS-202603-02: FWC-WEB has 29 lines; keeping it together would push it to page 2.
    expect(sectionFlags('m02', '2026-03')).toEqual([{ lines: 29, keep: false }, { lines: 10, keep: true }]);
  });

  it(`later sections are kept together when they have at most ${PDF_KEEP_TOGETHER_MAX_LINES} lines`, () => {
    expect(keepSectionTogether(1, PDF_KEEP_TOGETHER_MAX_LINES)).toBe(true);
    expect(keepSectionTogether(1, PDF_KEEP_TOGETHER_MAX_LINES + 1)).toBe(false);
    expect(keepSectionTogether(0, 1)).toBe(false);
    // LVS-202604-01: FWC-WEB 3, LVS-DS 10, MPB-SHOP 30 lines.
    expect(sectionFlags('m01', '2026-04')).toEqual([{ lines: 3, keep: false }, { lines: 10, keep: true }, { lines: 30, keep: true }]);
  });
});
