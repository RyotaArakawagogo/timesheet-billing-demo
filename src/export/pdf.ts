/**
 * Invoice PDF as a pdfmake document definition. Formats an InvoiceResult; performs
 * no calculation. Rendering/downloading is done in the UI layer from this definition.
 */
import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { formatHours, formatUsd } from '../domain/money.ts';
import type { InvoiceResult } from '../domain/billing.ts';
import { assertReady } from './csv.ts';

/**
 * Page-break rule:
 * - A project section with at most this many lines fits on one LETTER page, so it is kept
 *   together (moved whole to the next page instead of being split).
 * - The first section is never kept together: it starts right below the invoice header, and
 *   moving it would leave page 1 almost empty.
 * Known limit: pdfmake cannot keep a table's last row with the next one, so the subtotal row
 * of a split section (the first section, or one longer than this) can start a new page.
 */
export const PDF_KEEP_TOGETHER_MAX_LINES = 30;

export const keepSectionTogether = (sectionIndex: number, lineCount: number): boolean =>
  sectionIndex > 0 && lineCount <= PDF_KEEP_TOGETHER_MAX_LINES;

/** Header row of every per-project line table. Tests locate line tables by it. */
export const PDF_LINE_HEADER = ['Date', 'Start', 'Description', 'Hours', 'Rate', 'Amount'] as const;

const ACCENT = '#2F5D8A';
const RULE = '#C9CED6';
const TEXT = '#2B2F36';
const MUTED = '#5E6672';

function addressLines(a: { addressLine1?: string; addressLine2?: string; line1?: string; city: string; region: string; postalCode: string; country: string }): string[] {
  const street = a.line1 ?? a.addressLine1 ?? '';
  return [street, a.addressLine2 ?? '', `${a.city}, ${a.region} ${a.postalCode}`, a.country].filter((s) => s !== '');
}

const right = (text: string, bold = false): TableCell => ({ text, alignment: 'right', bold });

export function buildInvoicePdf(inv: InvoiceResult): TDocumentDefinitions {
  assertReady(inv);

  const sections: Content[] = inv.sections.map((s, i) => ({
    unbreakable: keepSectionTogether(i, s.lines.length),
    stack: [
      { text: `${s.projectCode}  ${s.projectName}`, style: 'sectionTitle' },
      { text: s.client, style: 'muted', margin: [0, 0, 0, 4] },
      {
        table: {
          headerRows: 1,
          widths: [58, 34, '*', 40, 52, 62],
          body: [
            PDF_LINE_HEADER.map((h, i) => (i >= 3 ? { text: h, style: 'th', alignment: 'right' } : { text: h, style: 'th' })),
            ...s.lines.map((l) => [l.workDate, l.localStart, l.description, right(formatHours(l.minutes)), right(formatUsd(l.hourlyRateCents)), right(formatUsd(l.amountCents))] as TableCell[]),
            [{ text: 'Subtotal', colSpan: 3, bold: true }, '', '', right(formatHours(s.minutes), true), '', right(formatUsd(s.amountCents), true)],
          ],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 1 || i === node.table.body.length - 1 ? 0.75 : 0.25),
          vLineWidth: () => 0,
          hLineColor: () => RULE,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
      },
    ],
    margin: [0, 0, 0, 14],
  }));

  return {
    pageSize: 'LETTER',
    pageMargins: [48, 48, 48, 56],
    info: { title: `Invoice ${inv.invoiceNumber}`, author: inv.from.legalName },
    defaultStyle: { fontSize: 9, color: TEXT },
    styles: {
      title: { fontSize: 16, bold: true, color: ACCENT },
      label: { color: MUTED, fontSize: 8 },
      th: { bold: true, color: MUTED, fontSize: 8 },
      sectionTitle: { bold: true, fontSize: 10 },
      muted: { color: MUTED },
    },
    footer: (page: number, pages: number) => ({ text: `${inv.invoiceNumber}  ·  Page ${page} of ${pages}`, alignment: 'right', margin: [48, 16, 48, 0], style: 'muted', fontSize: 8 }),
    content: [
      {
        columns: [
          { stack: [{ text: 'Invoice', style: 'title' }, { text: inv.from.legalName, bold: true, margin: [0, 6, 0, 0] }, ...addressLines(inv.from)] },
          {
            width: 'auto',
            table: {
              body: [
                [{ text: 'Invoice number', style: 'label' }, inv.invoiceNumber],
                [{ text: 'Billing period', style: 'label' }, inv.month],
                [{ text: 'Issue date', style: 'label' }, inv.issueDate],
                [{ text: 'Due date', style: 'label' }, inv.dueDate],
              ],
            },
            layout: 'noBorders',
          },
        ],
      },
      { text: 'Bill to', style: 'label', margin: [0, 18, 0, 2] },
      { stack: [{ text: inv.billTo.name, bold: true }, ...addressLines(inv.billTo.address)], margin: [0, 0, 0, 18] },
      ...sections,
      {
        table: {
          widths: ['*', 62],
          body: [[{ text: `Total (${formatHours(inv.totalMinutes)} h)`, bold: true, alignment: 'right' }, right(formatUsd(inv.totalCents), true)]],
        },
        layout: { hLineWidth: (i: number) => (i === 0 ? 0.75 : 0), vLineWidth: () => 0, hLineColor: () => TEXT },
      },
      { text: `Dates and times are in ${inv.timeZone}. Amounts are rounded half up to the cent per line.`, style: 'muted', fontSize: 8, margin: [0, 16, 0, 0] },
    ],
  };
}

export function pdfFileName(inv: InvoiceResult): string {
  return `${inv.invoiceNumber}.pdf`;
}
