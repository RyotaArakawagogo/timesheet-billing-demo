import { useMemo } from 'react';
import { billingMonthOf, localTimeOf, monthsOf, workDateOf, zoneAbbreviationAt } from '../../domain/dates.ts';
import { formatHours, formatUsd } from '../../domain/money.ts';
import { resolveRate } from '../../domain/rates.ts';
import type { Dataset } from '../../domain/types.ts';
import { HorizontalBars } from '../components/HorizontalBars.tsx';
import { Select } from '../components/Select.tsx';
import { monthLabel, shortDateLabel } from '../format.ts';
import type { Page } from '../route.ts';

interface Props {
  ds: Dataset;
  params: URLSearchParams;
  navigate: (page: Page, params?: Record<string, string | undefined>) => void;
}

export function TimeEntriesPage({ ds, params, navigate }: Props) {
  const tz = ds.company.timeZone;
  const months = useMemo(() => monthsOf(ds.timeEntries.map((e) => e.startedAt), tz), [ds.timeEntries, tz]);
  const month = months.includes(params.get('month') ?? '') ? params.get('month')! : months[months.length - 1];
  const memberId = params.get('member') ?? '';
  const projectId = params.get('project') ?? '';
  const set = (patch: Record<string, string>) => navigate('entries', { month, member: memberId, project: projectId, ...patch });

  const memberName = (id: string) => ds.members.find((m) => m.id === id)?.name ?? id;
  const projectOf = (id: string) => ds.projects.find((p) => p.id === id)!;

  const rows = useMemo(
    () =>
      ds.timeEntries
        .filter((e) => billingMonthOf(e.startedAt, tz) === month && (!memberId || e.memberId === memberId) && (!projectId || e.projectId === projectId))
        .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))
        .map((e) => {
          const workDate = workDateOf(e.startedAt, tz);
          return { e, workDate, rate: resolveRate(ds.rates, e.memberId, workDate) };
        }),
    [ds, tz, month, memberId, projectId],
  );

  const totalMinutes = rows.reduce((s, r) => s + r.e.minutes, 0);
  const missing = rows.filter((r) => !r.rate).length;

  const bars = ds.projects
    .map((p) => {
      const own = rows.filter((r) => r.e.projectId === p.id);
      const minutes = own.reduce((s, r) => s + r.e.minutes, 0);
      return {
        key: p.id,
        label: `${p.code}  ${p.name}`,
        detail: `${p.code} · ${p.client}`,
        value: minutes,
        valueLabel: `${formatHours(minutes)} h`,
        tooltip: `${formatHours(minutes)} h across ${own.length} entries`,
      };
    })
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value);

  const scope = memberId ? `, ${memberName(memberId)}` : '';

  return (
    <section>
      <div className="page-head">
        <h1>Time entries</h1>
        <div className="filters">
          <Select label="Month" value={month} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} onChange={(v) => set({ month: v })} />
          <Select label="Member" value={memberId} options={[{ value: '', label: 'All members' }, ...ds.members.map((m) => ({ value: m.id, label: m.name }))]} onChange={(v) => set({ member: v })} />
          <Select label="Project" value={projectId} options={[{ value: '', label: 'All projects' }, ...ds.projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))]} onChange={(v) => set({ project: v })} />
        </div>
      </div>

      <HorizontalBars title={`Hours by project, ${monthLabel(month)}${scope}`} bars={bars} ariaLabel="Hours by project for the selected filters" />

      <p className="summary">
        {rows.length} entries · {formatHours(totalMinutes)} h
        {missing > 0 && <span className="alert"> · {missing} without a rate</span>}
        <span className="muted"> · Dates and start times in {tz}</span>
      </p>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Work date</th>
              <th>Start</th>
              <th>Member</th>
              <th>Project</th>
              <th>Description</th>
              <th className="num">Hours</th>
              <th className="num">Rate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, workDate, rate }) => (
              <tr key={e.id}>
                <td className="nowrap">{shortDateLabel(workDate)}</td>
                <td className="nowrap">
                  {localTimeOf(e.startedAt, tz)} <span className="muted">{zoneAbbreviationAt(e.startedAt, tz)}</span>
                </td>
                <td className="nowrap">{memberName(e.memberId)}</td>
                <td className="nowrap">{projectOf(e.projectId).code}</td>
                <td>{e.description}</td>
                <td className="num">{formatHours(e.minutes)}</td>
                <td className="num">{rate ? formatUsd(rate.hourlyRateCents) : '—'}</td>
                <td className="nowrap">{rate ? '' : <span className="alert">Rate missing</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
