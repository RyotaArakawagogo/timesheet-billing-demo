/**
 * The ONLY place that decides which local day / month an instant belongs to.
 * Every caller passes the company time zone explicitly; nothing here reads the
 * browser's zone or uses UTC calendar fields.
 */
import { DateTime } from 'luxon';
import { DomainError } from './types.ts';

/** Display text is always en-US, whatever the browser language is. */
export const DISPLAY_LOCALE = 'en-US';

function inZone(iso: string, timeZone: string): DateTime {
  const utc = DateTime.fromISO(iso, { zone: 'utc', locale: DISPLAY_LOCALE });
  if (!utc.isValid) throw new DomainError('invalid_timestamp', `Invalid timestamp: ${iso}`);
  const local = utc.setZone(timeZone);
  if (!local.isValid) throw new DomainError('invalid_time_zone', `Invalid time zone: ${timeZone}`);
  return local;
}

/** Local calendar date (YYYY-MM-DD) of a work entry's start, in the company zone. */
export function workDateOf(startedAt: string, timeZone: string): string {
  return inZone(startedAt, timeZone).toISODate()!;
}

/** Billing month (YYYY-MM) of a work entry, in the company zone. */
export function billingMonthOf(startedAt: string, timeZone: string): string {
  return workDateOf(startedAt, timeZone).slice(0, 7);
}

/** Local wall-clock start time (HH:mm) in the company zone, for display. */
export function localTimeOf(startedAt: string, timeZone: string): string {
  return inZone(startedAt, timeZone).toFormat('HH:mm');
}

/** Local zone abbreviation at that instant (e.g. CST / CDT), for display. */
export function zoneAbbreviationAt(startedAt: string, timeZone: string): string {
  return inZone(startedAt, timeZone).toFormat('ZZZZ');
}

/** Invoice issue date: first day after the billing month (plain calendar arithmetic). */
export function issueDateFor(month: string): string {
  return DateTime.fromISO(`${month}-01`, { zone: 'utc' }).plus({ months: 1 }).toISODate()!;
}

/** Plain calendar arithmetic on a local date (no zone involved). */
export function addDaysToDate(localDate: string, days: number): string {
  return DateTime.fromISO(localDate, { zone: 'utc' }).plus({ days }).toISODate()!;
}

/** Months (YYYY-MM) covered by the given entries, ascending. */
export function monthsOf(startedAts: readonly string[], timeZone: string): string[] {
  return [...new Set(startedAts.map((s) => billingMonthOf(s, timeZone)))].sort();
}

export function isValidLocalDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value, { zone: 'utc' }).isValid;
}
