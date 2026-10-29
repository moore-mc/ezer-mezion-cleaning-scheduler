import type { AppData, Job, Unscheduled, Worker } from './types'
import { DAY, schedule } from './scheduler'

const PLAN_FROM = 5 * 60
const PLAN_TO = 24 * 60
const STEP = 30
const COLORS = ['#d9822b', '#3a8f7b', '#8e5bb5', '#c04f6a', '#4a7fc1']

/** Unscheduled jobs that more people can fix (not blocked by a space constraint or a too-short window). */
const fixableByStaff = (u: Unscheduled) => u.reason.startsWith('כל העובדים תפוסים') || u.reason.startsWith('אין עובד במשמרת')

export interface HireWindow { day: number; start: number; end: number; jobs: number }
export interface Hire { worker: Worker; windows: HireWindow[]; weeklyMin: number }
export interface HireRecommendation {
  hires: Hire[]
  /** jobs that were unscheduled and are placed once the hires join */
  resolved: number
  /** jobs that stay unscheduled: blocked by a constraint no extra person can fix */
  unfixable: Unscheduled[]
}

/**
 * Greedy: add one extra cleaner at a time. For every day that still has unplaced jobs the cleaner gets the
 * (at most `maxDailyHours` long) window that covers the most unplaced cleaning minutes; then the week is re-scheduled.
 * Stops when everything fixable is placed.
 */
export function recommendHires(data: AppData, weekStart: string, siteId: string): HireRecommendation {
  const maxDay = data.settings.maxDailyHours * 60
  const maxWeek = data.settings.maxWeeklyHours * 60
  let current = data
  let result = schedule(current, weekStart)
  const startUnsched = result.unscheduled.length
  const hires: Hire[] = []

  for (let n = 0; n < 10; n++) {
    const todo = result.unscheduled.filter(fixableByStaff)
    if (!todo.length) break

    const byDay = new Map<number, Job[]>()
    for (const u of todo) {
      const d = Math.floor(u.job.earliest / DAY)
      byDay.set(d, [...(byDay.get(d) ?? []), u.job])
    }

    const windows: HireWindow[] = []
    for (const [day, jobs] of byDay) {
      let best: { s: number; score: number; covered: Job[] } | null = null
      for (let s = PLAN_FROM; s + 60 <= PLAN_TO; s += STEP) {
        const e = Math.min(s + maxDay, PLAN_TO)
        const covered = jobs.filter((j) => {
          const a = Math.max(j.earliest, day * DAY + s), b = Math.min(j.deadline, day * DAY + e)
          return b - a >= j.duration
        })
        const score = covered.reduce((a, j) => a + j.duration, 0)
        if (!best || score > best.score) best = { s, score, covered }
      }
      if (!best || !best.covered.length) continue
      const need = best.covered.reduce((a, j) => a + j.duration + data.settings.buffer, 0)
      let start = Math.max(best.s, Math.min(...best.covered.map((j) => j.earliest - day * DAY)))
      let end = Math.min(best.s + maxDay, Math.max(...best.covered.map((j) => j.deadline - day * DAY)), PLAN_TO)
      // widen to fit the work, but never beyond one person's daily limit
      const len = Math.min(maxDay, Math.ceil(need / 30) * 30)
      if (end - start < len) end = Math.min(PLAN_TO, start + len)
      if (end - start < len) start = Math.max(PLAN_FROM, end - len)
      windows.push({ day, start: Math.floor(start / STEP) * STEP, end: Math.ceil(end / STEP) * STEP, jobs: best.covered.length })
    }
    if (!windows.length) break

    // respect the weekly limit: keep the days that fix the most jobs
    windows.sort((x, y) => y.jobs - x.jobs)
    const kept: HireWindow[] = []
    let total = 0
    for (const w of windows) {
      if (total + (w.end - w.start) > maxWeek && kept.length) continue
      kept.push(w); total += w.end - w.start
    }
    kept.sort((x, y) => x.day - y.day)

    const mk = (win: HireWindow[]): Worker => ({
      id: `rec-${n + 1}`, siteId, name: `עובד נוסף ${n + 1}`, color: COLORS[n % COLORS.length], absences: [],
      shifts: Array.from({ length: 7 }, (_, d) => {
        const w = win.find((k) => k.day === d)
        return w ? { start: w.start, end: w.end } : null
      }),
    })

    // Candidate 1: windows targeted at the days that have unplaced jobs.
    // Candidate 2 (when 1 does not help, e.g. the shortage is spread over several days): the same time-of-day window on every working day.
    const tod = todo.map((j) => ({ a: j.job.earliest % DAY, b: ((j.job.deadline - 1) % DAY) + 1 }))
    const wa = Math.min(...tod.map((x) => x.a)), wb = Math.max(...tod.map((x) => x.b))
    const allDays: HireWindow[] = data.settings.workDays.map((d) => ({
      day: d, start: Math.max(PLAN_FROM, wa), end: Math.min(PLAN_TO, Math.max(wb, wa + 60), Math.max(PLAN_FROM, wa) + maxDay), jobs: 0,
    }))
    const total2 = allDays.reduce((acc, w) => acc + (w.end - w.start), 0)
    const candidates: { win: HireWindow[]; total: number }[] = [{ win: kept, total }]
    if (total2 <= maxWeek) candidates.push({ win: allDays, total: total2 })

    let accepted = false
    for (const c of candidates) {
      const worker = mk(c.win)
      const next = schedule({ ...current, workers: [...current.workers, worker] }, weekStart)
      if (next.unscheduled.length < result.unscheduled.length) {
        hires.push({ worker, windows: c.win, weeklyMin: c.total })
        current = { ...current, workers: [...current.workers, worker] }
        result = next
        accepted = true
        break
      }
    }
    if (!accepted) break // no extra person helps
  }

  return { hires, resolved: startUnsched - result.unscheduled.length, unfixable: result.unscheduled }
}

/** Group days that share the same window, e.g. "א׳ ב׳ ג׳ · 15:00–19:00". */
export function groupWindows(windows: HireWindow[]): { days: number[]; start: number; end: number }[] {
  const groups: { days: number[]; start: number; end: number }[] = []
  for (const w of windows) {
    const g = groups.find((x) => x.start === w.start && x.end === w.end)
    if (g) g.days.push(w.day)
    else groups.push({ days: [w.day], start: w.start, end: w.end })
  }
  return groups
}
