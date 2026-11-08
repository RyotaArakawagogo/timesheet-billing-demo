/**
 * Test helpers. The "independent" helpers below deliberately avoid src/domain
 * (no Luxon, own rate lookup, own rounding) so they can catch errors in it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { seedDataset } from '../src/data/seed/index.ts';
import type { Dataset, RateEntry } from '../src/domain/types.ts';
import { PDF_LINE_HEADER } from '../src/export/pdf.ts';

export const seed = (): Dataset => seedDataset();

export const scenarios = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/scenarios.json', import.meta.url)), 'utf8'),
) as {
  timeZone: string;
  cases: Record<string, { entryId: string; memberId: string; localDate: string; localTime: string; utcDate: string; rateCents: number | null }[]>;
};

export const MONTHS = ['2026-02', '2026-03', '2026-04'] as const;

export function entry(ds: Dataset, id: string) {
  const e = ds.timeEntries.find((x) => x.id === id);
  if (!e) throw new Error(`fixture entry ${id} not found`);
  return e;
}

// ---------------------------------------------------------------------------
// Independent re-implementation (Intl + plain arithmetic)
// ---------------------------------------------------------------------------
export function independentLocalDate(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function independentRate(rates: RateEntry[], memberId: string, date: string): number | null {
  const hit = rates
    .filter((r) => r.memberId === memberId && r.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  return hit ? hit.hourlyRateCents : null;
}

/** Math.round is half-up for non-negative values. */
export const independentAmount = (minutes: number, rateCents: number): number => Math.round((minutes * rateCents) / 60);

/** The naive (buggy) way: the calendar date of the UTC timestamp. */
export const utcCalendarDate = (iso: string): string => iso.slice(0, 10);

// ---------------------------------------------------------------------------
// Reading the outputs back
// ---------------------------------------------------------------------------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

/** "$1,234.50" or "1234.50" -> 123450 */
export function moneyToCents(s: string): number {
  const m = /^\$?([\d,]+)\.(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`not money: ${s}`);
  return Number(m[1].replace(/,/g, '')) * 100 + Number(m[2]);
}

const cellText = (c: unknown): string => (typeof c === 'string' ? c : String((c as { text: unknown }).text ?? ''));

export interface PdfSection {
  title: string;
  lines: string[][];
  subtotal: string[];
}

/** Walk the pdfmake definition and pull out each per-project line table. */
export function pdfSections(def: TDocumentDefinitions): PdfSection[] {
  const out: PdfSection[] = [];
  const visit = (node: Content | Content[] | undefined): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const n = node as unknown as Record<string, unknown>;
    if (Array.isArray(n.stack)) {
      const stack = n.stack as Record<string, unknown>[];
      const tableNode = stack.find((s) => s && typeof s === 'object' && 'table' in s) as { table: { body: unknown[][] } } | undefined;
      const header = tableNode?.table.body[0]?.map(cellText);
      if (tableNode && JSON.stringify(header) === JSON.stringify(PDF_LINE_HEADER)) {
        const body = tableNode.table.body.map((r) => r.map(cellText));
        out.push({ title: cellText(stack[0]), lines: body.slice(1, -1), subtotal: body[body.length - 1] });
        return;
      }
      visit(n.stack as Content[]);
    }
    if (Array.isArray(n.columns)) visit(n.columns as Content[]);
  };
  visit(def.content);
  return out;
}

/** The invoice total cell: last table in content whose first cell starts with "Total". */
export function pdfTotal(def: TDocumentDefinitions): string {
  const content = def.content as unknown as Record<string, unknown>[];
  for (const node of [...content].reverse()) {
    const body = (node.table as { body?: unknown[][] } | undefined)?.body;
    if (body && cellText(body[0][0]).startsWith('Total')) return cellText(body[0][1]);
  }
  throw new Error('no total in PDF definition');
}
