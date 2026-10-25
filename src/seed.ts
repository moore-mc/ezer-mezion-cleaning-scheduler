import type { AppData, Level, Space, SpaceType, Worker } from './types'
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

const sites = [
  { id: 'bb', name: 'בני ברק – גוטמאכר 8 (מעון)' },
  { id: 'pt', name: 'פתח תקווה – שושנים 12' },
  { id: 'rg', name: 'רמת גן – שד׳ ירושלים' },
]

const spaces: Space[] = FILE_SITES.flatMap((site) =>
  site.rows.flatMap((row) =>
    row.codes.map((code): Space => ({
      id: `${site.id}-${code}`, siteId: site.id, name: `${row.type} ${code}`,
      typeId: slug(row.type), level: row.level,
      blocked: [], activities: [], events: [],
    }))))

type Shift = { start: number; end: number } | null
const w = (id: string, siteId: string, name: string, color: string, start: number, end: number, fri: Shift): Worker => ({
  id, siteId, name, color, absences: [],
  shifts: [{ start, end }, { start, end }, { start, end }, { start, end }, { start, end }, fri, null],
})
const morning = { start: h(7), end: h(12) }

// Demo workers (the file has no staff data) – use the "how many cleaners" tab for a real estimate.
const workers: Worker[] = [
  w('w1', 'bb', 'רונית', '#2f7f6f', h(6), h(14), { start: h(6), end: h(14) }),
  w('w2', 'bb', 'מרים', '#5b6bbf', h(6), h(14), { start: h(6), end: h(14) }),
  w('w3', 'bb', 'יוסי', '#c2703d', h(14), h(22), null),
  w('w4', 'bb', 'נועה', '#b5476b', h(14), h(22), null),
  w('w5', 'pt', 'דנה', '#b5476b', h(6), h(14), { start: h(6), end: h(14) }),
  w('w6', 'pt', 'אבי', '#7a8f2a', h(6), h(14), { start: h(6), end: h(14) }),
  w('w7', 'pt', 'שרה', '#2e86a8', h(14), h(22), null),
  w('w8', 'pt', 'דוד', '#c2703d', h(14), h(22), null),
  w('w9', 'rg', 'חנן', '#8a6bbf', h(6), h(14), { start: h(6), end: h(14) }),
  w('w10', 'rg', 'ליאת', '#2e86a8', h(14), h(22), null),
]

export const seed: AppData = {
  sites,
  settings: { dayStart: h(6), dayEnd: h(22), fridayEnd: h(14), buffer: 5, workDays: [0, 1, 2, 3, 4, 5], closedDates: [] },
  types, spaces, workers,
  manualJobs: [],
  overrides: {},
}
