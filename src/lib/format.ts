// Dates are local YYYY-MM-DD strings. Parse them with new Date(y, m-1, d)
// so they never shift across a timezone boundary.

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function parseISO(iso: string): Date {
  const [y, m, d] = (iso || todayISO()).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Spelled out here rather than left to Intl, whose en-AU data differs
// between engines ("Sep" vs "Sept", a comma after the weekday or not).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const mon = (d: Date) => MONTHS[d.getMonth()].slice(0, 3);

/** "30 Sep 2026" */
export function dateMedium(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${mon(d)} ${d.getFullYear()}`;
}
/** "7 October 2026" */
export function dateLong(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
/** "7 Oct" */
export function dateShort(iso: string): string {
  const d = parseISO(iso);
  return `${d.getDate()} ${mon(d)}`;
}
/** "Wed 7 Oct 2026" */
export function dateMasthead(iso: string): string {
  const d = parseISO(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${mon(d)} ${d.getFullYear()}`;
}

/** "YYYY-MM" shifted by a number of months. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** "October" for "2026-10" */
export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1];
/** "October 2026" for "2026-10" */
export const monthYear = (month: string) => `${monthName(month)} ${month.slice(0, 4)}`;

/** "$1,245.00" */
export function money(n: number): string {
  return (Number(n) || 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

/** "$1,245", whole dollars. */
export function money0(n: number): string {
  return (Number(n) || 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
}

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}
