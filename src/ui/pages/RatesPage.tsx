import { useMemo, useState, type FormEvent } from 'react';
import { addDaysToDate, localTimeOf, workDateOf } from '../../domain/dates.ts';
import { formatHours, formatUsd } from '../../domain/money.ts';
import { addRate, rateHistory, resolveRate } from '../../domain/rates.ts';
import type { Dataset } from '../../domain/types.ts';
import { dateLabel, shortDateLabel } from '../format.ts';
import { href } from '../route.ts';

interface Props {
  ds: Dataset;
  setDs: (ds: Dataset) => void;
}

export function RatesPage({ ds, setDs }: Props) {
  const tz = ds.company.timeZone;
  const [memberId, setMemberId] = useState(ds.members[0].id);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [hourlyRate, setHourlyRate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const missing = useMemo(
    () =>
      ds.timeEntries
        .map((e) => ({ e, workDate: workDateOf(e.startedAt, tz) }))
        .filter(({ e, workDate }) => !resolveRate(ds.rates, e.memberId, workDate))
        .sort((a, b) => a.e.memberId.localeCompare(b.e.memberId) || Date.parse(a.e.startedAt) - Date.parse(b.e.startedAt)),
    [ds, tz],
  );

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    const res = addRate(ds.rates, ds.members, { memberId, effectiveFrom, hourlyRate });
    if (!res.ok) {
      setError(res.error);
      setLastAdded(null);
      return;
    }
    setDs({ ...ds, rates: res.rates });
    setError(null);
    const name = ds.members.find((m) => m.id === memberId)!.name;
    setLastAdded(`Added ${formatUsd(res.added.hourlyRateCents)}/h for ${name}, effective ${dateLabel(res.added.effectiveFrom)}.`);
    setEffectiveFrom('');
    setHourlyRate('');
  };

  return (
    <section>
      <div className="page-head">
        <h1>Rates</h1>
      </div>
      <p className="lede">
        A rate applies from its effective date until the day before the member’s next rate. Each entry is billed at the rate in effect on its work date in {tz}.
      </p>

      <h2>Add a rate</h2>
      <form className="form-row" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span className="field-label">Member</span>
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {ds.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Effective from</span>
          <input
            type="text"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            placeholder="YYYY-MM-DD"
            autoComplete="off"
            spellCheck={false}
            size={12}
            aria-describedby="effective-from-hint"
          />
          <span id="effective-from-hint" className="visually-hidden">
            Format YYYY-MM-DD, local date in {tz}
          </span>
        </label>
        <label className="field">
          <span className="field-label">Hourly rate (USD)</span>
          <input type="text" inputMode="decimal" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="52.50" autoComplete="off" size={10} />
        </label>
        <button type="submit" className="btn primary">
          Add rate
        </button>
      </form>
      {error && (
        <p className="form-message alert" role="alert">
          {error}
        </p>
      )}
      {lastAdded && (
        <p className="form-message" role="status">
          {lastAdded} <a href={href('billing')}>Open billing</a>
        </p>
      )}

      <h2>Rate history</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Effective from</th>
              <th>Applies until</th>
              <th className="num">Hourly rate</th>
            </tr>
          </thead>
          <tbody>
            {ds.members.map((m) => {
              const history = rateHistory(ds.rates, m.id);
              if (history.length === 0) {
                return (
                  <tr key={m.id} className="group-start">
                    <td>{m.name}</td>
                    <td>{m.role}</td>
                    <td colSpan={3} className="alert">
                      No rate on file
                    </td>
                  </tr>
                );
              }
              return history.map((r, i) => (
                <tr key={r.id} className={i === 0 ? 'group-start' : undefined}>
                  <td>{i === 0 ? m.name : ''}</td>
                  <td>{i === 0 ? m.role : ''}</td>
                  <td>{dateLabel(r.effectiveFrom)}</td>
                  <td className={history[i + 1] ? undefined : 'muted'}>{history[i + 1] ? dateLabel(addDaysToDate(history[i + 1].effectiveFrom, -1)) : 'Current'}</td>
                  <td className="num">{formatUsd(r.hourlyRateCents)}</td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      <h2>
        Entries without a rate <span className="count">{missing.length}</span>
      </h2>
      {missing.length === 0 ? (
        <p className="muted">Every entry has a rate in effect on its work date.</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Member</th>
                <th>Work date</th>
                <th>Start</th>
                <th>Project</th>
                <th className="num">Hours</th>
                <th>Earliest rate on file</th>
              </tr>
            </thead>
            <tbody>
              {missing.map(({ e, workDate }) => {
                const first = rateHistory(ds.rates, e.memberId)[0];
                return (
                  <tr key={e.id}>
                    <td>{ds.members.find((m) => m.id === e.memberId)!.name}</td>
                    <td>{shortDateLabel(workDate)}</td>
                    <td>{localTimeOf(e.startedAt, tz)}</td>
                    <td>{ds.projects.find((p) => p.id === e.projectId)!.code}</td>
                    <td className="num">{formatHours(e.minutes)}</td>
                    <td>{first ? `${dateLabel(first.effectiveFrom)} (${formatUsd(first.hourlyRateCents)})` : <span className="alert">None</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
