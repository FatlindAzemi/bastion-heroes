/**
 * Local calendar helpers for the daily quest reset (spec 8.5: "Every day at
 * 00:00 local time"). Kept free of `Date.now()` so tests can pass a fixed date.
 */

/** The local YYYY-MM-DD key of a date. */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today's local date key. */
export function todayKey(now: Date = new Date()): string {
  return localDateKey(now);
}
