/**
 * Invoice detail CSV. Formats an InvoiceResult; performs no calculation.
 * One row per line, then one row per project subtotal, then the invoice total.
 */
import { centsToDecimal, formatHours } from '../domain/money.ts';
import type { InvoiceResult, ReadyInvoice } from '../domain/billing.ts';
import { DomainError } from '../domain/types.ts';

export const CSV_HEADER = [
  'Invoice number',
  'Row type',
  'Project code',
  'Project',
  'Client',
  'Work date',
  'Start (local)',
  'Description',
  'Minutes',
  'Hours',
  'Rate (USD/h)',
  'Amount (USD)',
] as const;

function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function assertReady(inv: InvoiceResult): asserts inv is ReadyInvoice {
  if (inv.status !== 'ready') {
    throw new DomainError('invoice_blocked', `${inv.invoiceNumber} is blocked: ${inv.missingRate.length} entries have no rate`);
  }
}

export function invoiceToCsvRows(inv: InvoiceResult): string[][] {
  assertReady(inv);
  const rows: string[][] = [[...CSV_HEADER]];
  for (const s of inv.sections) {
    for (const l of s.lines) {
      rows.push([inv.invoiceNumber, 'line', s.projectCode, s.projectName, s.client, l.workDate, l.localStart, l.description, String(l.minutes), formatHours(l.minutes), centsToDecimal(l.hourlyRateCents), centsToDecimal(l.amountCents)]);
    }
    rows.push([inv.invoiceNumber, 'subtotal', s.projectCode, s.projectName, s.client, '', '', '', String(s.minutes), formatHours(s.minutes), '', centsToDecimal(s.amountCents)]);
  }
  rows.push([inv.invoiceNumber, 'total', '', '', '', '', '', '', String(inv.totalMinutes), formatHours(inv.totalMinutes), '', centsToDecimal(inv.totalCents)]);
  return rows;
}

/** RFC 4180 style: CRLF line endings, quoted when needed. No BOM (added at download time). */
export function invoiceToCsv(inv: InvoiceResult): string {
  return invoiceToCsvRows(inv).map((r) => r.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

export function csvFileName(inv: InvoiceResult): string {
  return `${inv.invoiceNumber}.csv`;
}
