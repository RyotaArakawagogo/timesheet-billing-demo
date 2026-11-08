import { DateTime } from 'luxon';
import { DISPLAY_LOCALE } from '../domain/dates.ts';

/** Plain calendar date, formatted in en-US regardless of the browser language. */
const plain = (isoDate: string) => DateTime.fromISO(isoDate, { zone: 'utc', locale: DISPLAY_LOCALE });

/** "2026-03" -> "March 2026" */
export function monthLabel(month: string): string {
  return plain(`${month}-01`).toFormat('LLLL yyyy');
}

/** "2026-03-16" -> "Mar 16, 2026" */
export function dateLabel(date: string): string {
  return plain(date).toFormat('LLL d, yyyy');
}

/** "2026-03-16" -> "Mon, Mar 16" */
export function shortDateLabel(date: string): string {
  return plain(date).toFormat('ccc, LLL d');
}
