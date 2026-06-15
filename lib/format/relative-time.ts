// Coarse relative-time label for "Last analyzed". Null -> "Not analyzed".
// Callers that want a verb prefix ("Analyzed 2d ago") add it only when the date
// is non-null, so the null branch reads "Not analyzed" cleanly.
export function formatRelativeTime(date: Date | null, now: Date = new Date()): string {
  if (!date) return "Not analyzed";
  const sec = Math.floor((now.getTime() - new Date(date).getTime()) / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}
