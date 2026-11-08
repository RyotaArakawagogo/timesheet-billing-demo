import { useMemo, useState } from 'react';
import { seedDataset } from '../data/seed/index.ts';
import type { Dataset } from '../domain/types.ts';
import { BillingPage } from './pages/BillingPage.tsx';
import { RatesPage } from './pages/RatesPage.tsx';
import { TimeEntriesPage } from './pages/TimeEntriesPage.tsx';
import { PAGES, href, useRoute } from './route.ts';

export function App() {
  // Edits live only in memory for this tab; nothing is persisted.
  const initial = useMemo(() => seedDataset(), []);
  const [ds, setDs] = useState<Dataset>(initial);
  const [route, navigate] = useRoute();
  const modified = ds !== initial;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">{ds.company.name}</span>
          <span className="brand-sub">Contractor billing</span>
        </div>
        <nav className="tabs" aria-label="Sections">
          {PAGES.map((p) => (
            <a key={p.id} href={href(p.id)} className={route.page === p.id ? 'tab active' : 'tab'} aria-current={route.page === p.id ? 'page' : undefined}>
              {p.label}
            </a>
          ))}
        </nav>
        <div className="topbar-right">
          <span className="muted">Time zone: {ds.company.timeZone}</span>
          <button type="button" className="btn" onClick={() => setDs(initial)} disabled={!modified} title={modified ? 'Discard rates added in this tab' : 'No changes to discard'}>
            Reset demo data
          </button>
        </div>
      </header>

      <main className="content">
        {route.page === 'entries' && <TimeEntriesPage ds={ds} params={route.params} navigate={navigate} />}
        {route.page === 'rates' && <RatesPage ds={ds} setDs={setDs} />}
        {route.page === 'billing' && <BillingPage ds={ds} params={route.params} navigate={navigate} />}
      </main>

      <footer className="footer muted">
        All people, companies, addresses and figures are fictional. Rates added here are kept in this browser tab only and are discarded on reload.
      </footer>
    </div>
  );
}
