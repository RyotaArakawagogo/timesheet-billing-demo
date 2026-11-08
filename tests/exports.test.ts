/**
 * Pitfall: output formats drift.
 * If PDF and CSV each compute amounts, a change to one (e.g. how the rate is chosen)
 * leaves the other on the old rule. Both are built from the same InvoiceResult, and
 * these tests read the outputs back and compare them line by line.
 */
import { describe, expect, it } from 'vitest';
import { computeInvoice, computeMonth, type ReadyInvoice } from '../src/domain/billing.ts';
import { formatHours } from '../src/domain/money.ts';
import { CSV_HEADER, invoiceToCsv } from '../src/export/csv.ts';
import { buildInvoicePdf } from '../src/export/pdf.ts';
import { MONTHS, moneyToCents, parseCsv, pdfSections, pdfTotal, seed } from './helpers.ts';

const ds = seed();
const ready = MONTHS.flatMap((m) => computeMonth(ds, m)).filter((i): i is ReadyInvoice => i.status === 'ready');

/** Normalised line: project code, date, start, description, minutes-as-hours, rate cents, amount cents. */
type Norm = [string, string, string, string, string, number, number];

function csvLines(inv: ReadyInvoice) {
  const rows = parseCsv(invoiceToCsv(inv));
  expect(rows[0]).toEqual([...CSV_HEADER]);
  const body = rows.slice(1);
  const col = (name: (typeof CSV_HEADER)[number]) => CSV_HEADER.indexOf(name);
  const lines: Norm[] = body
    .filter((r) => r[col('Row type')] === 'line')
    .map((r) => [r[col('Project code')], r[col('Work date')], r[col('Start (local)')], r[col('Description')], r[col('Hours')], moneyToCents(r[col('Rate (USD/h)')]), moneyToCents(r[col('Amount (USD)')])]);
  const subtotals = body.filter((r) => r[col('Row type')] === 'subtotal').map((r) => [r[col('Project code')], moneyToCents(r[col('Amount (USD)')])] as const);
  const totalRows = body.filter((r) => r[col('Row type')] === 'total');
  expect(totalRows).toHaveLength(1);
  return { lines, subtotals, total: moneyToCents(totalRows[0][col('Amount (USD)')]), totalHours: totalRows[0][col('Hours')] };
}

function pdfLines(inv: ReadyInvoice) {
  const def = buildInvoicePdf(inv);
  const sections = pdfSections(def);
  const code = (title: string) => title.split(/\s{2,}/)[0];
  const lines: Norm[] = sections.flatMap((s) => s.lines.map((r) => [code(s.title), r[0], r[1], r[2], r[3], moneyToCents(r[4]), moneyToCents(r[5])] as Norm));
  const subtotals = sections.map((s) => [code(s.title), moneyToCents(s.subtotal[5])] as const);
  return { lines, subtotals, total: moneyToCents(pdfTotal(def)) };
}

describe('[Pitfall: output formats drift] PDF and CSV come from one calculation and match', () => {
  it(`covers every ready invoice in the data (${ready.length} invoices)`, () => {
    expect(ready.length).toBeGreaterThan(20);
  });

  it('PDF and CSV have the same lines, in the same order, with the same rate and amount', () => {
    for (const inv of ready) expect(pdfLines(inv).lines, inv.invoiceNumber).toEqual(csvLines(inv).lines);
  });

  it('PDF and CSV have the same project subtotals and the same total', () => {
    for (const inv of ready) {
      const csv = csvLines(inv);
      const pdf = pdfLines(inv);
      expect(pdf.subtotals, inv.invoiceNumber).toEqual(csv.subtotals);
      expect(pdf.total, inv.invoiceNumber).toBe(csv.total);
    }
  });

  it('both totals equal the calculation result, and the CSV lines add up to it', () => {
    for (const inv of ready) {
      const csv = csvLines(inv);
      expect(csv.total).toBe(inv.totalCents);
      expect(pdfLines(inv).total).toBe(inv.totalCents);
      expect(csv.lines.reduce((s, l) => s + l[6], 0)).toBe(inv.totalCents);
      expect(csv.totalHours).toBe(formatHours(inv.totalMinutes));
    }
  });

  it('every entry of the invoice appears once in each output', () => {
    for (const inv of ready) {
      const n = inv.sections.reduce((s, x) => s + x.lines.length, 0);
      expect(csvLines(inv).lines).toHaveLength(n);
      expect(pdfLines(inv).lines).toHaveLength(n);
    }
  });
});

describe('outputs refuse a blocked invoice', () => {
  const blocked = computeInvoice(ds, 'm07', '2026-02');

  it('CSV is not produced when the invoice is blocked', () => {
    expect(blocked.status).toBe('blocked');
    expect(() => invoiceToCsv(blocked)).toThrow(/blocked/);
  });

  it('PDF is not produced when the invoice is blocked', () => {
    expect(() => buildInvoicePdf(blocked)).toThrow(/blocked/);
  });
});

describe('output details', () => {
  it('CSV quotes cells containing commas or quotes', () => {
    const copy = seed();
    const target = copy.timeEntries.find((e) => e.memberId === 'm01' && e.startedAt.startsWith('2026-02-1'))!;
    target.description = 'Review, "final" pass';
    const inv = computeInvoice(copy, 'm01', '2026-02');
    const text = invoiceToCsv(inv);
    expect(text).toContain('"Review, ""final"" pass"');
    expect(parseCsv(text).some((r) => r.includes('Review, "final" pass'))).toBe(true);
  });

  it('PDF shows the contractor name and address, the studio as bill-to, and the due date', () => {
    const inv = computeInvoice(ds, 'm02', '2026-03');
    const json = JSON.stringify(buildInvoicePdf(inv));
    expect(json).toContain('Fernández Web Studio LLC');
    expect(json).toContain('72 Larch Terrace');
    expect(json).toContain('Larkspur & Vale Studio');
    expect(json).toContain(inv.dueDate);
  });
});
