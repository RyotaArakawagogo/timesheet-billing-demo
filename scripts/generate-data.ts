/**
 * Deterministic generator for the fictional seed data.
 *
 * Run: node scripts/generate-data.ts   (Node >= 22.18, native type stripping)
 *
 * All people, companies, projects, addresses and numbers are fictional.
 *
 * This script intentionally does NOT import the app's domain modules. It converts
 * local wall-clock times with its own Intl-based helper and resolves rates with its
 * own implementation, so tests can check the app against an independent path.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEED = 20260201;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = join(ROOT, 'src', 'data', 'seed');
const FIXTURE_DIR = join(ROOT, 'tests', 'fixtures');

const COMPANY = {
  name: 'Larkspur & Vale Studio',
  timeZone: 'America/Chicago',
  currency: 'USD',
  invoicePrefix: 'LVS',
  paymentTermsDays: 30,
  address: {
    line1: '2150 W Hollis Street, Suite 3',
    city: 'Chicago',
    region: 'IL',
    postalCode: '60612',
    country: 'United States',
  },
} as const;

/** Local (company time zone) calendar dates, inclusive. */
const PERIOD = { from: '2026-02-01', to: '2026-04-30' } as const;

// ---------------------------------------------------------------------------
// Types (mirror the app types; kept local to stay independent)
// ---------------------------------------------------------------------------
interface Member { id: string; name: string; role: string }
interface Project { id: string; code: string; name: string; client: string }
interface RateEntry {
  id: string;
  memberId: string;
  /** Local date (YYYY-MM-DD, company time zone) from which the rate applies. */
  effectiveFrom: string;
  hourlyRateCents: number;
}
interface TimeEntry {
  id: string;
  memberId: string;
  projectId: string;
  /** UTC instant, ISO 8601 with Z. */
  startedAt: string;
  minutes: number;
  description: string;
}
interface BillingProfile {
  memberId: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const randInt = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];

// ---------------------------------------------------------------------------
// Independent time-zone helpers (Intl only)
// ---------------------------------------------------------------------------
const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: COMPANY.timeZone,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
interface WallClock { y: number; m: number; d: number; h: number; mi: number; s: number }
function wallClockAt(utcMs: number): WallClock {
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return { y: parts.year, m: parts.month, d: parts.day, h: parts.hour === 24 ? 0 : parts.hour, mi: parts.minute, s: parts.second };
}
function offsetMs(utcMs: number): number {
  const w = wallClockAt(utcMs);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - utcMs;
}
/** Local wall-clock time in the company zone -> UTC epoch ms. Throws for times skipped by DST. */
function localToUtcMs(date: string, h: number, mi: number): number {
  const [y, m, d] = date.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, h, mi);
  let utc = naive - offsetMs(naive);
  const second = naive - offsetMs(utc);
  if (second !== utc) utc = second;
  const w = wallClockAt(utc);
  if (w.y !== y || w.m !== m || w.d !== d || w.h !== h || w.mi !== mi) {
    throw new Error(`Local time ${date} ${h}:${mi} does not exist in ${COMPANY.timeZone}`);
  }
  return utc;
}
const pad = (n: number): string => String(n).padStart(2, '0');
const localDateOf = (utcMs: number): string => {
  const w = wallClockAt(utcMs);
  return `${w.y}-${pad(w.m)}-${pad(w.d)}`;
};
const localTimeOf = (utcMs: number): string => {
  const w = wallClockAt(utcMs);
  return `${pad(w.h)}:${pad(w.mi)}`;
};
const utcDateOf = (utcMs: number): string => new Date(utcMs).toISOString().slice(0, 10);
const toIso = (utcMs: number): string => new Date(utcMs).toISOString().replace('.000Z', 'Z');

/** Plain calendar arithmetic, no time zone involved. */
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
function* datesBetween(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}
const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

// ---------------------------------------------------------------------------
// Fictional organisation
// ---------------------------------------------------------------------------
const PROJECTS: Project[] = [
  { id: 'p101', code: 'FWC-WEB', name: 'Website rebuild', client: 'Fernwood Family Clinic' },
  { id: 'p102', code: 'QLC-PKG', name: 'Packaging refresh', client: 'Quarry Lane Coffee Roasters' },
  { id: 'p103', code: 'TMM-APP', name: 'Exhibit companion app', client: 'Tidewater Maritime Museum' },
  { id: 'p104', code: 'MPB-SHOP', name: 'Online store', client: 'Maple & Pine Books' },
  { id: 'p105', code: 'LVS-DS', name: 'Internal design system', client: 'Larkspur & Vale Studio' },
];

interface MemberPlan {
  member: Member;
  projects: string[];
  rates: { effectiveFrom: string; hourlyRateCents: number }[];
  /** First local date the member logs time (may precede the first rate on purpose). */
  activeFrom: string;
  weekdayProbability: number;
  tasks: string[];
}

const PLANS: MemberPlan[] = [
  {
    member: { id: 'm01', name: 'Amara Okafor', role: 'UI Designer' },
    projects: ['p104', 'p101', 'p105'],
    rates: [{ effectiveFrom: '2025-10-01', hourlyRateCents: 6850 }],
    activeFrom: PERIOD.from,
    weekdayProbability: 0.85,
    tasks: ['Page wireframes', 'Design review', 'Component library updates', 'Checkout flow mockups', 'Design QA on staging'],
  },
  {
    member: { id: 'm02', name: 'Mateo Fernández', role: 'Front-end Developer' },
    projects: ['p101', 'p104'],
    rates: [
      { effectiveFrom: '2025-11-01', hourlyRateCents: 7200 },
      { effectiveFrom: '2026-03-16', hourlyRateCents: 7800 },
    ],
    activeFrom: PERIOD.from,
    weekdayProbability: 0.9,
    tasks: ['Navigation refactor', 'Form validation', 'Accessibility fixes', 'Code review', 'Responsive layout fixes', 'Build pipeline maintenance'],
  },
  {
    member: { id: 'm03', name: 'Yuki Tanabe', role: 'Illustrator' },
    projects: ['p102', 'p103'],
    rates: [{ effectiveFrom: '2025-09-01', hourlyRateCents: 5850 }],
    activeFrom: PERIOD.from,
    weekdayProbability: 0.5,
    tasks: ['Spot illustrations', 'Icon set revisions', 'Illustration sketches', 'Final artwork export'],
  },
  {
    member: { id: 'm04', name: 'Priya Raman', role: 'Brand Designer' },
    projects: ['p102', 'p104'],
    rates: [
      { effectiveFrom: '2026-01-01', hourlyRateCents: 6400 },
      { effectiveFrom: '2026-04-13', hourlyRateCents: 6750 },
    ],
    activeFrom: PERIOD.from,
    weekdayProbability: 0.8,
    tasks: ['Logo exploration', 'Brand guideline layout', 'Packaging mockups', 'Color system review', 'Client presentation prep'],
  },
  {
    member: { id: 'm05', name: 'Lukas Novák', role: 'Back-end Developer' },
    projects: ['p101', 'p103'],
    rates: [
      { effectiveFrom: '2025-08-01', hourlyRateCents: 8250 },
      { effectiveFrom: '2026-04-01', hourlyRateCents: 8600 },
    ],
    activeFrom: PERIOD.from,
    weekdayProbability: 0.8,
    tasks: ['CMS API integration', 'Database migration', 'Search indexing', 'Deployment and monitoring', 'Bug triage'],
  },
  {
    member: { id: 'm06', name: 'Sofia Lindqvist', role: 'Motion Designer' },
    projects: ['p103', 'p102'],
    rates: [
      { effectiveFrom: '2025-12-01', hourlyRateCents: 6900 },
      { effectiveFrom: '2026-02-18', hourlyRateCents: 7150 },
    ],
    activeFrom: PERIOD.from,
    weekdayProbability: 0.6,
    tasks: ['Exhibit intro animation', 'Storyboard revisions', 'Lottie export', 'Sound sync pass'],
  },
  {
    member: { id: 'm07', name: 'Hamid Rahimi', role: 'Copywriter' },
    projects: ['p102', 'p101', 'p104'],
    // Started 2026-02-09; first rate applies from 2026-02-16.
    rates: [{ effectiveFrom: '2026-02-16', hourlyRateCents: 5400 }],
    activeFrom: '2026-02-09',
    weekdayProbability: 0.7,
    tasks: ['Homepage copy draft', 'Product description edits', 'Newsletter copy', 'Microcopy review', 'Tone of voice notes'],
  },
  {
    member: { id: 'm08', name: 'Leilani Kahale', role: 'Project Coordinator' },
    projects: ['p104', 'p103', 'p101', 'p105'],
    // Started 2026-02-23; first rate applies from 2026-03-01.
    rates: [{ effectiveFrom: '2026-03-01', hourlyRateCents: 4950 }],
    activeFrom: '2026-02-23',
    weekdayProbability: 0.85,
    tasks: ['Sprint planning', 'Client status call', 'Timeline update', 'Resource scheduling', 'Meeting notes'],
  },
  {
    member: { id: 'm09', name: 'Thandiwe Nkosi', role: 'Junior Designer' },
    projects: ['p104', 'p102'],
    // Joined 2026-04-29. No rate registered yet.
    rates: [],
    activeFrom: '2026-04-29',
    weekdayProbability: 0.95,
    tasks: ['Product page layouts', 'Banner resizing', 'Asset preparation', 'Design review notes'],
  },
];

const PROFILES: BillingProfile[] = [
  { memberId: 'm01', legalName: 'Amara Okafor', addressLine1: '1418 N Alder Row', addressLine2: 'Apt 2F', city: 'Chicago', region: 'IL', postalCode: '60622', country: 'United States' },
  { memberId: 'm02', legalName: 'Fernández Web Studio LLC', addressLine1: '72 Larch Terrace', addressLine2: '', city: 'Evanston', region: 'IL', postalCode: '60201', country: 'United States' },
  { memberId: 'm03', legalName: 'Yuki Tanabe', addressLine1: '905 Quill Avenue', addressLine2: 'Unit 4', city: 'Milwaukee', region: 'WI', postalCode: '53212', country: 'United States' },
  { memberId: 'm04', legalName: 'Priya Raman Design', addressLine1: '3310 W Bellwood Lane', addressLine2: '', city: 'Chicago', region: 'IL', postalCode: '60618', country: 'United States' },
  { memberId: 'm05', legalName: 'Novák Software LLC', addressLine1: '48 Copperleaf Court', addressLine2: 'Suite 210', city: 'Madison', region: 'WI', postalCode: '53703', country: 'United States' },
  { memberId: 'm06', legalName: 'Sofia Lindqvist', addressLine1: '58 Rowan Hollow', addressLine2: '', city: 'Minneapolis', region: 'MN', postalCode: '55408', country: 'United States' },
  { memberId: 'm07', legalName: 'Hamid Rahimi', addressLine1: '2207 S Wren Street', addressLine2: '', city: 'Chicago', region: 'IL', postalCode: '60608', country: 'United States' },
  { memberId: 'm08', legalName: 'Leilani Kahale', addressLine1: '615 Juniper Bend', addressLine2: 'Apt 9', city: 'Oak Park', region: 'IL', postalCode: '60302', country: 'United States' },
  { memberId: 'm09', legalName: 'Thandiwe Nkosi', addressLine1: '1290 E Marlow Street', addressLine2: '', city: 'Chicago', region: 'IL', postalCode: '60615', country: 'United States' },
];

// ---------------------------------------------------------------------------
// Hand-placed edge cases (local wall-clock times in the company zone)
// ---------------------------------------------------------------------------
type CaseKind = 'monthEndLateNight' | 'rateChangeEveLateNight' | 'dstTransition';
interface InjectedEntry {
  kind: CaseKind; memberId: string; projectId: string; localDate: string; h: number; mi: number; minutes: number; description: string; note: string;
}
const INJECTED: InjectedEntry[] = [
  { kind: 'monthEndLateNight', memberId: 'm01', projectId: 'p101', localDate: '2026-02-28', h: 23, mi: 20, minutes: 95, description: 'Design QA on staging', note: 'Last day of Feb; UTC date is Mar 1' },
  { kind: 'monthEndLateNight', memberId: 'm08', projectId: 'p103', localDate: '2026-02-28', h: 23, mi: 30, minutes: 45, description: 'Timeline update', note: 'Before first rate (from Mar 1); UTC date Mar 1 would wrongly find a rate' },
  { kind: 'monthEndLateNight', memberId: 'm05', projectId: 'p101', localDate: '2026-03-31', h: 23, mi: 40, minutes: 70, description: 'Deployment and monitoring', note: 'Last day of Mar; UTC date Apr 1 would pick the Apr 1 rate and the April invoice' },
  { kind: 'monthEndLateNight', memberId: 'm02', projectId: 'p101', localDate: '2026-04-30', h: 23, mi: 10, minutes: 50, description: 'Accessibility fixes', note: 'Last day of Apr; UTC date is May 1 (outside the period)' },
  { kind: 'rateChangeEveLateNight', memberId: 'm06', projectId: 'p103', localDate: '2026-02-17', h: 23, mi: 45, minutes: 40, description: 'Lottie export', note: 'Day before rate change (Feb 18); UTC date is Feb 18' },
  { kind: 'rateChangeEveLateNight', memberId: 'm02', projectId: 'p104', localDate: '2026-03-15', h: 23, mi: 35, minutes: 65, description: 'Code review', note: 'Day before rate change (Mar 16); UTC date is Mar 16' },
  { kind: 'rateChangeEveLateNight', memberId: 'm04', projectId: 'p102', localDate: '2026-04-12', h: 23, mi: 15, minutes: 80, description: 'Client presentation prep', note: 'Day before rate change (Apr 13); UTC date is Apr 13' },
  { kind: 'dstTransition', memberId: 'm05', projectId: 'p103', localDate: '2026-03-07', h: 23, mi: 30, minutes: 60, description: 'Database migration', note: 'Night before DST starts (CST, UTC-6)' },
  { kind: 'dstTransition', memberId: 'm01', projectId: 'p105', localDate: '2026-03-08', h: 1, mi: 15, minutes: 60, description: 'Component library updates', note: 'Spans the 02:00 -> 03:00 DST jump; ends 03:15 CDT' },
  { kind: 'dstTransition', memberId: 'm03', projectId: 'p103', localDate: '2026-03-08', h: 20, mi: 50, minutes: 75, description: 'Final artwork export', note: 'First evening after DST starts (CDT, UTC-5)' },
];

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------
let rateSeq = 0;
const rates: RateEntry[] = PLANS.flatMap((p) =>
  p.rates.map((r) => ({ id: `r${String(++rateSeq).padStart(2, '0')}`, memberId: p.member.id, effectiveFrom: r.effectiveFrom, hourlyRateCents: r.hourlyRateCents })),
);

/** Independent rate resolution: latest base rate with effectiveFrom <= workDate. */
function resolveRate(memberId: string, workDate: string): RateEntry | null {
  const candidates = rates.filter((r) => r.memberId === memberId && r.effectiveFrom <= workDate);
  return candidates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------
interface Draft { memberId: string; projectId: string; startMs: number; minutes: number; description: string; injected?: InjectedEntry }
const drafts: Draft[] = [];

for (const plan of PLANS) {
  const projectFor = (): string => (rand() < 0.5 ? plan.projects[0] : pick(plan.projects));
  for (const date of datesBetween(plan.activeFrom, PERIOD.to)) {
    const dow = weekdayOf(date);
    const weekend = dow === 0 || dow === 6;
    if (rand() >= (weekend ? 0.04 : plan.weekdayProbability)) continue;

    // Daytime blocks: start 08:00-10:30, 1-3 blocks with gaps, stop before 18:00.
    let cursor = randInt(8 * 60, 10 * 60 + 30);
    const blocks = weekend ? 1 : randInt(1, 3);
    for (let i = 0; i < blocks; i++) {
      const minutes = randInt(20, 240);
      if (cursor + minutes > 18 * 60) break;
      drafts.push({ memberId: plan.member.id, projectId: projectFor(), startMs: localToUtcMs(date, Math.floor(cursor / 60), cursor % 60), minutes, description: pick(plan.tasks) });
      cursor += minutes + randInt(10, 75);
    }
    // Occasional evening block (19:00-21:30 local). In America/Chicago this is already the next UTC day.
    if (!weekend && rand() < 0.05) {
      const start = randInt(19 * 60, 21 * 60 + 30);
      drafts.push({ memberId: plan.member.id, projectId: projectFor(), startMs: localToUtcMs(date, Math.floor(start / 60), start % 60), minutes: randInt(25, 90), description: pick(plan.tasks) });
    }
  }
}
for (const inj of INJECTED) {
  drafts.push({ memberId: inj.memberId, projectId: inj.projectId, startMs: localToUtcMs(inj.localDate, inj.h, inj.mi), minutes: inj.minutes, description: inj.description, injected: inj });
}
drafts.sort((a, b) => a.startMs - b.startMs || a.memberId.localeCompare(b.memberId));

const timeEntries: TimeEntry[] = drafts.map((d, i) => ({
  id: `te-${String(i + 1).padStart(4, '0')}`,
  memberId: d.memberId,
  projectId: d.projectId,
  startedAt: toIso(d.startMs),
  minutes: d.minutes,
  description: d.description,
}));
const injectedById = new Map<string, InjectedEntry>();
drafts.forEach((d, i) => d.injected && injectedById.set(timeEntries[i].id, d.injected));

// ---------------------------------------------------------------------------
// Self-checks (fail loudly instead of writing bad data)
// ---------------------------------------------------------------------------
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`Self-check failed: ${msg}`);
}
const members = PLANS.map((p) => p.member);
for (const m of members) {
  const own = timeEntries.filter((e) => e.memberId === m.id);
  for (let i = 1; i < own.length; i++) {
    assert(Date.parse(own[i].startedAt) >= Date.parse(own[i - 1].startedAt) + own[i - 1].minutes * 60_000, `overlap for ${m.id} at ${own[i].startedAt}`);
  }
}
for (const e of timeEntries) {
  const plan = PLANS.find((p) => p.member.id === e.memberId)!;
  assert(plan.projects.includes(e.projectId), `${e.id} project ${e.projectId} not assigned to ${e.memberId}`);
}

const workDateOf = (e: TimeEntry): string => localDateOf(Date.parse(e.startedAt));
const describe = (e: TimeEntry) => {
  const ms = Date.parse(e.startedAt);
  return {
    entryId: e.id, memberId: e.memberId, projectId: e.projectId, startedAt: e.startedAt,
    localDate: localDateOf(ms), localTime: localTimeOf(ms), utcDate: utcDateOf(ms), minutes: e.minutes,
    rateCents: resolveRate(e.memberId, localDateOf(ms))?.hourlyRateCents ?? null,
  };
};

const cases = {
  /** Rate entries that take effect inside the period. */
  rateChangesInPeriod: rates
    .filter((r) => r.effectiveFrom >= PERIOD.from && r.effectiveFrom <= PERIOD.to)
    .map((r) => ({ rateId: r.id, memberId: r.memberId, effectiveFrom: r.effectiveFrom, hourlyRateCents: r.hourlyRateCents, midMonth: r.effectiveFrom.slice(8) !== '01' })),
  rateMissing: timeEntries.filter((e) => resolveRate(e.memberId, workDateOf(e)) === null).map(describe),
  monthEndLateNight: [] as object[],
  rateChangeEveLateNight: [] as object[],
  dstTransition: [] as object[],
  utcJudgementChangesRate: timeEntries
    .filter((e) => (resolveRate(e.memberId, utcDateOf(Date.parse(e.startedAt)))?.hourlyRateCents ?? null) !== (resolveRate(e.memberId, workDateOf(e))?.hourlyRateCents ?? null))
    .map((e) => ({ ...describe(e), utcJudgedRateCents: resolveRate(e.memberId, utcDateOf(Date.parse(e.startedAt)))?.hourlyRateCents ?? null })),
  utcJudgementChangesMonth: timeEntries.filter((e) => workDateOf(e).slice(0, 7) !== utcDateOf(Date.parse(e.startedAt)).slice(0, 7)).map(describe),
};

for (const e of timeEntries) {
  const inj = injectedById.get(e.id);
  if (!inj) continue;
  const info = { ...describe(e), note: inj.note };
  assert(info.localDate === inj.localDate, `${e.id} local date`);
  if (inj.h >= 18) assert(info.localDate !== info.utcDate, `${e.id} should cross the UTC date line`);
  cases[inj.kind].push(info);
}
for (const c of cases.rateChangeEveLateNight as ReturnType<typeof describe>[]) {
  assert(cases.rateChangesInPeriod.some((r) => r.memberId === c.memberId && r.effectiveFrom === c.utcDate), `${c.entryId} UTC date should equal a rate change date`);
  assert(cases.utcJudgementChangesRate.some((u) => u.entryId === c.entryId), `${c.entryId} should get a different rate under UTC judgement`);
}
const missingByMemberMonth = [...new Set(cases.rateMissing.map((r) => `${r.memberId} ${r.localDate.slice(0, 7)}`))].sort();
assert(JSON.stringify(missingByMemberMonth) === JSON.stringify(['m07 2026-02', 'm08 2026-02', 'm09 2026-04']), `rate-missing invoices: ${missingByMemberMonth.join(', ')}`);
assert(PROFILES.every((p) => p.legalName && p.addressLine1 && p.city && p.postalCode && p.country), 'every billing profile is complete');

const naturalCrossings = timeEntries.filter((e) => !injectedById.has(e.id) && workDateOf(e) !== utcDateOf(Date.parse(e.startedAt))).length;

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
mkdirSync(SEED_DIR, { recursive: true });
mkdirSync(FIXTURE_DIR, { recursive: true });
const write = (path: string, data: unknown) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');

write(join(SEED_DIR, 'company.json'), COMPANY);
write(join(SEED_DIR, 'members.json'), members);
write(join(SEED_DIR, 'projects.json'), PROJECTS);
write(join(SEED_DIR, 'rates.json'), rates);
write(join(SEED_DIR, 'time-entries.json'), timeEntries);
write(join(SEED_DIR, 'billing-profiles.json'), PROFILES);
write(join(FIXTURE_DIR, 'scenarios.json'), { generatedBy: 'scripts/generate-data.ts', seed: SEED, timeZone: COMPANY.timeZone, period: PERIOD, cases });

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const months = ['2026-02', '2026-03', '2026-04'];
console.log(`seed=${SEED} tz=${COMPANY.timeZone} period=${PERIOD.from}..${PERIOD.to}`);
console.log(`members=${members.length} projects=${PROJECTS.length} rates=${rates.length} timeEntries=${timeEntries.length} profiles=${PROFILES.length}`);
console.log('member  entries   hours  ' + months.join('  ') + '  rateMissing');
for (const m of members) {
  const own = timeEntries.filter((e) => e.memberId === m.id);
  const hours = own.reduce((s, e) => s + e.minutes, 0) / 60;
  const perMonth = months.map((mo) => String(own.filter((e) => workDateOf(e).startsWith(mo)).length).padStart(7));
  const missing = own.filter((e) => resolveRate(e.memberId, workDateOf(e)) === null).length;
  console.log(`${m.id}     ${String(own.length).padStart(5)}  ${hours.toFixed(2).padStart(6)}  ${perMonth.join('  ')}  ${String(missing).padStart(11)}`);
}
console.log('project  entries   hours');
for (const p of PROJECTS) {
  const own = timeEntries.filter((e) => e.projectId === p.id);
  console.log(`${p.id}     ${String(own.length).padStart(5)}  ${(own.reduce((s, e) => s + e.minutes, 0) / 60).toFixed(2).padStart(6)}`);
}
console.log(`blocked invoices (rate missing): ${missingByMemberMonth.join(', ')}`);
console.log(`entries with fractional hours: ${timeEntries.filter((e) => e.minutes % 60 !== 0).length}/${timeEntries.length}`);
console.log(`natural (non-injected) entries whose UTC date differs from local date: ${naturalCrossings}`);
for (const [k, v] of Object.entries(cases)) console.log(`case ${k}: ${v.length}`);
