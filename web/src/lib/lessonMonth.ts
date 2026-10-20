// Home's "Your lessons this month": which days this month had a lesson
// recorded, and how many weeks in a row (ending this week, or last week if
// none yet this week) had at least one. A habit, never a judgment of the
// teaching.

export type LessonMonth = {
  monthLabel: string
  /// Day of the week the 1st falls on, Monday = 0, so the grid lines up.
  firstWeekday: number
  daysInMonth: number
  recordedDays: Set<number>
  count: number
  today: number
  weekStreak: number
}

function mondayOf(d: Date): number {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x.getTime()
}

export function lessonMonth(dates: Date[], now: Date): LessonMonth {
  const y = now.getFullYear()
  const m = now.getMonth()
  const inMonth = dates.filter((d) => d.getFullYear() === y && d.getMonth() === m)
  const weeks = new Set(dates.map(mondayOf))
  // Walk back a calendar week at a time (not a fixed 7 days, which daylight
  // saving would throw off by an hour).
  const cursor = new Date(mondayOf(now))
  if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7)
  let weekStreak = 0
  while (weeks.has(cursor.getTime())) {
    weekStreak++
    cursor.setDate(cursor.getDate() - 7)
  }
  return {
    monthLabel: now.toLocaleDateString(undefined, { month: 'long' }).toUpperCase(),
    firstWeekday: (new Date(y, m, 1).getDay() + 6) % 7,
    daysInMonth: new Date(y, m + 1, 0).getDate(),
    recordedDays: new Set(inMonth.map((d) => d.getDate())),
    count: inMonth.length,
    today: now.getDate(),
    weekStreak,
  }
}
