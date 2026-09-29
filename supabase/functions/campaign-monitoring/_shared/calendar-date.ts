// Calendar comparisons across all civil offsets (UTC-12 through UTC+14).
// These bounds describe uncertainty; they are never a campaign's end instant.
export function calendarDateIsPast(date: string, now: Date): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(now.getTime()) &&
    date < new Date(now.getTime() - 12 * 3_600_000).toISOString().slice(0, 10)
}

export function calendarDateIsFuture(date: string, now: Date): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(now.getTime()) &&
    date > new Date(now.getTime() + 14 * 3_600_000).toISOString().slice(0, 10)
}
