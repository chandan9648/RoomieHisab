/**
 * Month handling. Expense dates are stored as plain "YYYY-MM-DD" local calendar
 * days, never as UTC timestamps, so an expense added at 11pm IST stays on the
 * day the roommate actually bought the thing.
 */

export const ALL_TIME = "all" as const;
export type MonthFilter = string | typeof ALL_TIME;

const pad = (n: number) => String(n).padStart(2, "0");

/** Today as a local "YYYY-MM-DD". */
export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The current local month as "YYYY-MM". */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/** "2026-10-16" -> "2026-10" */
export function monthKeyOf(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function isValidDateISO(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

/** "2026-10" -> "October 2026" */
export function formatMonthKey(key: MonthFilter): string {
  if (key === ALL_TIME) return "All time";
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** "2026-10-16" -> "16 Oct 2026" */
export function formatDateISO(dateISO: string): string {
  if (!isValidDateISO(dateISO)) return dateISO;
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Every month that has expenses, newest first, always including the current
 * month so a fresh household still has something to select.
 */
export function monthsWithData(dates: string[], now: Date = new Date()): string[] {
  const keys = new Set<string>([currentMonthKey(now)]);
  for (const d of dates) if (d) keys.add(monthKeyOf(d));
  return [...keys].sort((a, b) => b.localeCompare(a));
}

export function matchesMonth(dateISO: string, filter: MonthFilter): boolean {
  return filter === ALL_TIME || monthKeyOf(dateISO) === filter;
}

/** The month before/after `key`, as "YYYY-MM". */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const probe = new Date(y, m - 1 + delta, 1);
  return `${probe.getFullYear()}-${pad(probe.getMonth() + 1)}`;
}
