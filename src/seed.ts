import type { AppData, Level, Space, SpaceType, Worker } from './types'
import { addDays, toISO, weekStartOf } from './scheduler'
import { BASE_TASKS, FILE_SITES, FILE_TYPES } from './fileData'

// ── Source: " מטריצת ניקיון.xlsx" ──
// The file defines WHAT is cleaned (task lists per space type) and HOW OFTEN (rounds per day per activity level),
// but not how long a round takes. Durations below are an estimate (minutes per task item) – editable in the matrix tab.
const MIN_PER_DAILY_ITEM = 1.5
const MIN_PER_WEEKLY_ITEM = 3
const MIN_PER_MONTHLY_ITEM = 4
/** Level sheet: 1 → one round, 2 → "2–3" rounds, 3 → "5–6" rounds (lower bound used). */
const ROUNDS: Record<Level, number> = { 1: 1, 2: 2, 3: 5 }

const h = (hh: number, mm = 0) => hh * 60 + mm
const round5 = (m: number) => Math.max(5, Math.round(m / 5) * 5)
const slug = (name: string) => 't-' + name.replace(/[^֐-׿a-zA-Z0-9]+/g, '-')

const types: SpaceType[] = FILE_TYPES.map((t) => {
  // "Exceptional" types carry their own full list; all others = basic list + their own list.
  const merge = (k: 'daily' | 'weekly' | 'monthly' | 'yearly') => (t.exceptional ? t[k] : [...BASE_TASKS[k], ...t[k]])
  const tasks = { daily: merge('daily'), weekly: merge('weekly'), monthly: merge('monthly'), yearly: merge('yearly') }
  const minutes = tasks.daily.length ? Math.max(10, round5(tasks.daily.length * MIN_PER_DAILY_ITEM)) : 0
  const cell = (l: Level) => ({ minutes, roundsPerDay: tasks.daily.length ? ROUNDS[l] : 0 })
  return {
    id: slug(t.name), name: t.name, tasks,
    matrix: { 1: cell(1), 2: cell(2), 3: cell(3) },
    weeklyMin: tasks.weekly.length ? Math.max(10, round5(tasks.weekly.length * MIN_PER_WEEKLY_ITEM)) : 0,
    monthlyMin: tasks.monthly.length ? Math.max(10, round5(tasks.monthly.length * MIN_PER_MONTHLY_ITEM)) : 0,
  }
})

// Daycare rooms and the gymboree are cleaned ONCE a day (before the kids arrive / after they leave) at every activity
// level, and the full clean takes ~60 min – so they override the generic per-level rounds.
const ONCE_A_DAY: Record<string, number> = { 'גן / מעון': 60, "ג'ימבורי": 60, 'חצר / גינת משחקים': 30 }
for (const t of types) {
  const minutes = ONCE_A_DAY[t.name]
  if (!minutes) continue
  const cell = { minutes, roundsPerDay: 1 }
  t.matrix = { 1: { ...cell }, 2: { ...cell }, 3: { ...cell } }
}

const sites = [
  { id: 'bb', name: 'בני ברק – גוטמאכר 8 (מעון)', hours: { start: h(7, 30), end: h(17) } },
  { id: 'pt', name: 'פתח תקווה – שושנים 12', hours: { start: h(8), end: h(18) } },
  { id: 'rg', name: 'רמת גן – שד׳ ירושלים', hours: { start: h(8), end: h(17) } },
]

const spaces: Space[] = FILE_SITES.flatMap((site) =>
  site.rows.flatMap((row) =>
    row.codes.map((code): Space => ({
      id: `${site.id}-${code}`, siteId: site.id, name: `${row.type} ${code}`,
      typeId: slug(row.type), level: row.level,
      blocked: [], activities: [], events: [],
    }))))

// ── Demo constraints ──
// The file has no schedule data, so these are ILLUSTRATIVE constraints per site (editable in the "חללים" tab).
const SUN_THU = [0, 1, 2, 3, 4]
const byId = new Map(spaces.map((x) => [x.id, x]))
const block = (ids: string[], days: number[], start: number, end: number, label: string) =>
  ids.forEach((id) => days.forEach((d) => byId.get(id)?.blocked.push({ id: `${id}-b${d}-${start}`, day: d, start, end, label })))
const activity = (ids: string[], days: number[], start: number, end: number, label: string, withinMin: number) =>
  ids.forEach((id) => days.forEach((d) => byId.get(id)?.activities.push({ id: `${id}-a${d}-${start}`, day: d, start, end, label, withinMin })))
const thisWeekDay = (d: number) => addDays(weekStartOf(toISO(new Date())), d)

// בני ברק – מעון גוטמאכר. הנחה: המעון פעיל א׳–ה׳ 07:30–16:30 (שישי סגור) ואי אפשר לנקות את חללי הילדים בזמן הפעילות.
block(['bb-H1', 'bb-H2'], SUN_THU, h(7, 30), h(16, 30), 'שעות פעילות המעון')
block(['bb-K1', 'bb-K2', 'bb-K3', 'bb-K4'], SUN_THU, h(7, 30), h(16, 30), 'ילדים בחצר / שעות המעון')
block(['bb-L1'], SUN_THU, h(7, 30), h(19), 'שעות פעילות הג׳ימבורי')
block(['bb-E1', 'bb-E2', 'bb-E3'], [0, 2], h(9), h(10), 'ישיבת צוות')
// מטבח המעון: ניקיון חובה אחרי כל ארוחה (המטבח חסום בזמן הארוחה עצמה).
activity(['bb-A1'], SUN_THU, h(7, 45), h(8, 45), 'ארוחת בוקר של הילדים', 90)
activity(['bb-A1'], SUN_THU, h(12), h(13), 'ארוחת צהריים של הילדים', 90)
activity(['bb-A1'], SUN_THU, h(15, 30), h(16, 15), 'ארוחת אחה״צ של הילדים', 90)
// פתח תקווה – שושנים 12
// הנחה: קבלת קהל והשאלת ציוד פתוחים א׳–ה׳ 09:00–13:00 / 09:00–14:00; המועדונית והחצר פעילות אחה״צ 15:00–18:00.
block(['pt-L1'], SUN_THU, h(9), h(13), 'קבלת קהל')
block(['pt-M1'], SUN_THU, h(9), h(14), 'שעות השאלת ציוד')
block(['pt-K1'], SUN_THU, h(15), h(18), 'פעילות מועדונית בחצר')
block(['pt-G1', 'pt-G2', 'pt-G3'], [1, 3], h(10), h(11), 'ישיבת צוות')
activity(['pt-F1', 'pt-F2'], [1, 3], h(17), h(20), 'חוג / הרצאת ערב', 120)
activity(['pt-F1'], [5], h(8), h(11), 'אירוע שישי בבוקר', 180)
byId.get('pt-F2')?.events.push({ id: 'pt-F2-ev1', date: thisWeekDay(2), start: h(18), end: h(21), label: 'אירוע התרמה', cleanBefore: true, cleanAfterWithinMin: 60 })
// רמת גן – שד׳ ירושלים
// הנחה: קבלת קהל פתוחה 09:00–13:00, השאלת ציוד 09:00–14:00.
block(['rg-F1'], SUN_THU, h(9), h(13), 'קבלת קהל')
block(['rg-G1'], SUN_THU, h(9), h(14), 'שעות השאלת ציוד')
block(['rg-D1'], SUN_THU, h(9), h(10), 'ישיבת בוקר')
activity(['rg-H1'], [1], h(18), h(20, 30), 'אירוע ערב', 90)

type Shift = { start: number; end: number } | null
const w = (id: string, siteId: string, name: string, color: string, start: number, end: number, fri: Shift): Worker => ({
  id, siteId, name, color, absences: [],
  shifts: [{ start, end }, { start, end }, { start, end }, { start, end }, { start, end }, fri, null],
})
const morning = { start: h(7), end: h(12) }

// Demo workers (the file has no staff data) – use the "how many cleaners" tab for a real estimate.
const FRI_MORNING = { start: h(6), end: h(14) }
const workers: Worker[] = [
  // בני ברק: Friday is a compressed 06–14 day, so everybody (also the evening crew) works it.
  w('w1', 'bb', 'רונית', '#2f7f6f', h(6), h(14), FRI_MORNING),
  w('w2', 'bb', 'מרים', '#5b6bbf', h(9), h(17), FRI_MORNING),
  w('w3', 'bb', 'עמית', '#2e86a8', h(6), h(14), FRI_MORNING),
  w('w4', 'bb', 'יוסי', '#c2703d', h(9), h(17), FRI_MORNING),
  w('w5', 'bb', 'נועה', '#b5476b', h(14), h(22), FRI_MORNING),
  // פתח תקווה
  w('w6', 'pt', 'דנה', '#b5476b', h(6), h(14), FRI_MORNING),
  w('w7', 'pt', 'אבי', '#7a8f2a', h(8), h(16), FRI_MORNING),
  w('w8', 'pt', 'שרה', '#2e86a8', h(14), h(22), FRI_MORNING),
  // רמת גן
  w('w9', 'rg', 'חנן', '#8a6bbf', h(6), h(14), FRI_MORNING),
  w('w10', 'rg', 'ליאת', '#2e86a8', h(14), h(22), null),
]

export const seed: AppData = {
  sites,
  settings: { dayStart: h(6), dayEnd: h(22), fridayEnd: h(14), buffer: 0, maxDailyHours: 8, maxWeeklyHours: 42, workDays: [0, 1, 2, 3, 4, 5], closedDates: [] },
  types, spaces, workers,
  manualJobs: [],
  overrides: {},
}
