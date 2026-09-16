/** NSE cash-equity session: 09:15–15:30 IST, Monday–Friday. Does not account for exchange holidays. */
export function isNseMarketOpen(date: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''

  const weekday = get('weekday') // 'Mon', 'Tue', ...
  if (weekday === 'Sat' || weekday === 'Sun') return false

  const hour = Number(get('hour')) % 24 // normalize a possible "24" midnight edge case
  const minute = Number(get('minute'))
  const minutesSinceMidnight = hour * 60 + minute

  const openAt = 9 * 60 + 15
  const closeAt = 15 * 60 + 30
  return minutesSinceMidnight >= openAt && minutesSinceMidnight <= closeAt
}
