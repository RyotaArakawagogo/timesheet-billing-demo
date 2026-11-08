import { useMemo, useState } from 'react';
import { computeMonth, type InvoiceResult } from '../../domain/billing.ts';
import { monthsOf } from '../../domain/dates.ts';
import { formatHours, formatUsd } from '../../domain/money.ts';
import type { Dataset } from '../../domain/types.ts';
import { Select } from '../components/Select.tsx';
import { downloadInvoiceCsv, downloadInvoicePdf } from '../download.ts';
import { dateLabel, monthLabel, shortDateLabel } from '../format.ts';
import { href, type Page } from '../route.ts';

interface Props {
  ds: Dataset;
  params: URLSearchParams;
  navigate: (page: Page, params?: Record<string, string | undefined>) => void;
}

export function BillingPage({ ds, params, navigate }: Props) {
  const tz = ds.company.timeZone;
  const months = useMemo(() => monthsOf(ds.timeEntries.map((e) => e.startedAt), tz), [ds.timeEntries, tz]);
  const month = months.includes(params.get('month') ?? '') ? params.get('month')! : months[months.length - 1];
  const invoices = useMemo(() => computeMonth(ds, month), [ds, month]);
  const selected = invoices.find((i) => i.memberId === params.get('member')) ?? invoices[0];
  const ready = invoices.filter((i) => i.status === 'ready');
  const blockedCount = invoices.length - ready.length;

  return (
    <section>
      <div className="page-head">
        <h1>Billing</h1>
        <div className="filters">
          <Select label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onChange={(v) => navigate('billing', { month: v })} />
        </div>
      </div>

      <div className="table-wrap">
        <table className="data invoices">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Member</th>
              <th className="num">Entries</th>
              <th className="num">Hours</th>
              <th className="num">Amount</th>
              <th>Due date</th>
              <th>Status</th>
              <th>Export</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.invoiceNumber} className={inv === selected ? 'selected' : undefined}>
                <td className="nowrap">
                  <a href={href('billing', { month, member: inv.memberId })}>{inv.invoiceNumber}</a>
                </td>
                <td className="nowrap">{inv.memberName}</td>
                <td className="num">{inv.entryCount}</td>
                <td className="num">{formatHours(inv.totalMinutes)}</td>
                <td className="num">{inv.totalCents === null ? '—' : formatUsd(inv.totalCents)}</td>
                <td className="nowrap">{dateLabel(inv.dueDate)}</td>
                <td className="nowrap">
                  {inv.status === 'ready' ? 'Ready' : <span className="alert">Blocked: {inv.missingRate.length} without a rate</span>}
                </td>
                <td className="nowrap">
                  <ExportButtons inv={inv} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Ready invoices ({ready.length} of {invoices.length})</td>
              <td className="num">{formatHours(ready.reduce((s, i) => s + i.totalMinutes, 0))}</td>
              <td className="num">{formatUsd(ready.reduce((s, i) => s + (i.totalCents ?? 0), 0))}</td>
              <td colSpan={3} className="muted">
                {blockedCount > 0 ? `${blockedCount} blocked invoice${blockedCount > 1 ? 's are' : ' is'} not included` : ''}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {selected && <InvoiceDetail inv={selected} />}
    </section>
  );
}

function ExportButtons({ inv }: { inv: InvoiceResult }) {
  const [busy, setBusy] = useState(false);
  const disabled = inv.status !== 'ready';
  const reason = disabled ? 'Not available until every entry has a rate' : undefined;
  return (
    <span className="btn-group">
      <button
        type="button"
        className="btn small"
        disabled={disabled || busy}
        title={reason}
        onClick={async () => {
          setBusy(true);
          try {
            await downloadInvoicePdf(inv);
          } finally {
            setBusy(false);
          }
        }}
      >
        PDF
      </button>
      <button type="button" className="btn small" disabled={disabled} title={reason} onClick={() => downloadInvoiceCsv(inv)}>
        CSV
      </button>
    </span>
  );
}

function InvoiceDetail({ inv }: { inv: InvoiceResult }) {
  const f = inv.from;
  return (
    <div className="detail">
      <h2>
        {inv.invoiceNumber} <span className="muted">· {inv.memberName}</span>
      </h2>
      <dl className="meta">
        <div>
          <dt>From</dt>
          <dd>
            {f.legalName}
            <br />
            {f.addressLine1}
            {f.addressLine2 && `, ${f.addressLine2}`}
            <br />
            {f.city}, {f.region} {f.postalCode}
          </dd>
        </div>
        <div>
          <dt>Bill to</dt>
          <dd>
            {inv.billTo.name}
            <br />
            {inv.billTo.address.line1}
            <br />
            {inv.billTo.address.city}, {inv.billTo.address.region} {inv.billTo.address.postalCode}
          </dd>
        </div>
        <div>
          <dt>Billing period</dt>
          <dd>{monthLabel(inv.month)}</dd>
        </div>
        <div>
          <dt>Issue date</dt>
          <dd>{dateLabel(inv.issueDate)}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{dateLabel(inv.dueDate)}</dd>
        </div>
      </dl>

      {inv.status === 'blocked' ? (
        <>
          <p className="alert">
            Not issued. {inv.missingRate.length} of {inv.entryCount} entries have no rate in effect on their work date, so no amounts are calculated for this invoice.{' '}
            <a href={href('rates')}>Add a rate</a>
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>Work date</th>
                <th>Start</th>
                <th>Project</th>
                <th>Description</th>
                <th className="num">Hours</th>
              </tr>
            </thead>
            <tbody>
              {inv.missingRate.map((m) => (
                <tr key={m.entryId}>
                  <td>{shortDateLabel(m.workDate)}</td>
                  <td>{m.localStart}</td>
                  <td>{m.projectCode}</td>
                  <td>{m.description}</td>
                  <td className="num">{formatHours(m.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          {inv.sections.map((s) => (
            <div key={s.projectId} className="section">
              <h3>
                {s.projectCode} {s.projectName} <span className="muted">· {s.client}</span>
              </h3>
              <table className="data">
                <thead>
                  <tr>
                    <th>Work date</th>
                    <th>Start</th>
                    <th>Description</th>
                    <th className="num">Hours</th>
                    <th className="num">Rate</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {s.lines.map((l) => (
                    <tr key={l.entryId}>
                      <td className="nowrap">{shortDateLabel(l.workDate)}</td>
                      <td>{l.localStart}</td>
                      <td>{l.description}</td>
                      <td className="num">{formatHours(l.minutes)}</td>
                      <td className="num">{formatUsd(l.hourlyRateCents)}</td>
                      <td className="num">{formatUsd(l.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Subtotal</td>
                    <td className="num">{formatHours(s.minutes)}</td>
                    <td />
                    <td className="num">{formatUsd(s.amountCents)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ))}
          <p className="invoice-total">
            Total {formatHours(inv.totalMinutes)} h · <strong>{formatUsd(inv.totalCents)}</strong>
          </p>
        </>
      )}
    </div>
  );
}
