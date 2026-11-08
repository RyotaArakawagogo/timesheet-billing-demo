import { useCallback, useEffect, useState } from 'react';

export type Page = 'entries' | 'rates' | 'billing';
export const PAGES: { id: Page; label: string }[] = [
  { id: 'entries', label: 'Time entries' },
  { id: 'rates', label: 'Rates' },
  { id: 'billing', label: 'Billing' },
];

export interface Route {
  page: Page;
  params: URLSearchParams;
}

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const page = (PAGES.find((p) => p.id === path)?.id ?? 'entries') as Page;
  return { page, params: new URLSearchParams(query) };
}

export function href(page: Page, params: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();
  return `#/${page}${q ? `?${q}` : ''}`;
}

/** Hash-based routing: filters live in the URL so a view can be linked to directly. */
export function useRoute(): [Route, (page: Page, params?: Record<string, string | undefined>) => void] {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const navigate = useCallback((page: Page, params: Record<string, string | undefined> = {}) => {
    window.location.hash = href(page, params);
  }, []);
  return [route, navigate];
}
