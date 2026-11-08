/**
 * The single source of invoice numbers. PDF and CSV only format what this returns.
 *
 * Spec:
 * - An entry belongs to the billing month of its local start date (company zone).
 * - Its rate is the member's rate in effect on that local date (rates.resolveRate),
 *   looked up every time the invoice is calculated.
 * - Line amount = round_half_up(minutes * hourlyRateCents / 60) in integer cents.
 *   Project subtotal = sum of its line amounts. Total = sum of subtotals.
 * - If any entry in the month has no rate, the invoice is blocked: no amounts are
 *   produced, and the offending entries are listed.
 */
import { addDaysToDate, billingMonthOf, issueDateFor, localTimeOf, workDateOf } from './dates.ts';
import { lineAmountCents } from './money.ts';
import { resolveRate } from './rates.ts';
import type { BillingProfile, Company, Dataset, TimeEntry } from './types.ts';

export interface InvoiceLine {
  entryId: string;
  workDate: string;
  localStart: string;
  description: string;
  minutes: number;
  hourlyRateCents: number;
  rateId: string;
  amountCents: number;
}

export interface ProjectSection {
  projectId: string;
  projectCode: string;
  projectName: string;
  client: string;
  lines: InvoiceLine[];
  minutes: number;
  amountCents: number;
}

export interface MissingRateEntry {
  entryId: string;
  workDate: string;
  localStart: string;
  projectId: string;
  projectCode: string;
  description: string;
  minutes: number;
}

interface InvoiceBase {
  invoiceNumber: string;
  memberId: string;
  memberName: string;
  /** YYYY-MM */
  month: string;
  issueDate: string;
  dueDate: string;
  totalMinutes: number;
  entryCount: number;
  from: BillingProfile;
  billTo: Pick<Company, 'name' | 'address'>;
  timeZone: string;
}

export interface ReadyInvoice extends InvoiceBase {
  status: 'ready';
  sections: ProjectSection[];
  totalCents: number;
  missingRate: [];
}

export interface BlockedInvoice extends InvoiceBase {
  status: 'blocked';
  sections: [];
  totalCents: null;
  missingRate: MissingRateEntry[];
}

export type InvoiceResult = ReadyInvoice | BlockedInvoice;

export function invoiceNumberFor(company: Company, memberId: string, month: string): string {
  return `${company.invoicePrefix}-${month.replace('-', '')}-${memberId.replace(/^m/, '')}`;
}

function entriesFor(ds: Dataset, memberId: string, month: string): TimeEntry[] {
  const tz = ds.company.timeZone;
  return ds.timeEntries
    .filter((e) => e.memberId === memberId && billingMonthOf(e.startedAt, tz) === month)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt) || a.id.localeCompare(b.id));
}

export function computeInvoice(ds: Dataset, memberId: string, month: string): InvoiceResult {
  const tz = ds.company.timeZone;
  const member = ds.members.find((m) => m.id === memberId);
  if (!member) throw new Error(`Unknown member ${memberId}`);
  const from = ds.billingProfiles.find((p) => p.memberId === memberId);
  if (!from) throw new Error(`No billing profile for ${memberId}`);
  const projectOf = (id: string) => {
    const p = ds.projects.find((x) => x.id === id);
    if (!p) throw new Error(`Unknown project ${id}`);
    return p;
  };

  const entries = entriesFor(ds, memberId, month);
  const issueDate = issueDateFor(month);
  const base: InvoiceBase = {
    invoiceNumber: invoiceNumberFor(ds.company, memberId, month),
    memberId,
    memberName: member.name,
    month,
    issueDate,
    dueDate: addDaysToDate(issueDate, ds.company.paymentTermsDays),
    totalMinutes: entries.reduce((s, e) => s + e.minutes, 0),
    entryCount: entries.length,
    from,
    billTo: { name: ds.company.name, address: ds.company.address },
    timeZone: tz,
  };

  const lines: (InvoiceLine & { projectId: string })[] = [];
  const missingRate: MissingRateEntry[] = [];
  for (const e of entries) {
    const workDate = workDateOf(e.startedAt, tz);
    const localStart = localTimeOf(e.startedAt, tz);
    const rate = resolveRate(ds.rates, e.memberId, workDate);
    if (!rate) {
      missingRate.push({ entryId: e.id, workDate, localStart, projectId: e.projectId, projectCode: projectOf(e.projectId).code, description: e.description, minutes: e.minutes });
      continue;
    }
    lines.push({
      entryId: e.id,
      projectId: e.projectId,
      workDate,
      localStart,
      description: e.description,
      minutes: e.minutes,
      hourlyRateCents: rate.hourlyRateCents,
      rateId: rate.id,
      amountCents: lineAmountCents(e.minutes, rate.hourlyRateCents),
    });
  }

  if (missingRate.length > 0) {
    return { ...base, status: 'blocked', sections: [], totalCents: null, missingRate };
  }

  const sections: ProjectSection[] = [...new Set(lines.map((l) => l.projectId))]
    .map((projectId) => {
      const p = projectOf(projectId);
      const own = lines.filter((l) => l.projectId === projectId).map(({ projectId: _omit, ...line }) => line);
      return {
        projectId,
        projectCode: p.code,
        projectName: p.name,
        client: p.client,
        lines: own,
        minutes: own.reduce((s, l) => s + l.minutes, 0),
        amountCents: own.reduce((s, l) => s + l.amountCents, 0),
      };
    })
    .sort((a, b) => a.projectCode.localeCompare(b.projectCode));

  return { ...base, status: 'ready', sections, totalCents: sections.reduce((s, x) => s + x.amountCents, 0), missingRate: [] };
}

/** One invoice per member who logged time in the month, in member order. */
export function computeMonth(ds: Dataset, month: string): InvoiceResult[] {
  const tz = ds.company.timeZone;
  const active = new Set(ds.timeEntries.filter((e) => billingMonthOf(e.startedAt, tz) === month).map((e) => e.memberId));
  return ds.members.filter((m) => active.has(m.id)).map((m) => computeInvoice(ds, m.id, month));
}
