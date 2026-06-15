// The "week of" key for a digest batch: the most recent Sunday on or before
// `now`, as a UTC YYYY-MM-DD string. Shared by the cron and the on-demand
// trigger so both target the same batch for a given week.
export function currentWeekOf(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // getUTCDay: Sunday = 0
  return d.toISOString().slice(0, 10);
}
