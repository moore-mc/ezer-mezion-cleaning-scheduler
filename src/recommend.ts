import type { AppData, Job, ScheduleResult, Unscheduled, Worker } from './types'
import { DAY, addDays, hoursReport, schedule } from './scheduler'
import type { HoursAlert } from './scheduler'

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

// ───────────── unified fix plan: extend hours of existing workers first, then hire ─────────────

export interface Extension {
  workerId: string
  workerName: string
  day: number
  /** availability before / after, minutes in day (before = null when the worker was off that day) */
  before: { start: number; end: number } | null
  after: { start: number; end: number }
  addedMin: number
}

export interface FixPlan {
  extensions: Extension[]
  hires: Hire[]
  /** state after applying the whole plan */
  after: { unscheduled: Unscheduled[]; alerts: HoursAlert[] }
  /** state before */
  before: { unscheduled: number; alerts: number }
}

const EXT_STEP = 120

function score(res: ScheduleResult, data: AppData): { obj: number; alerts: HoursAlert[] } {
  const { alerts } = hoursReport(res, data)
  const excess = alerts.reduce((a, x) => a + (x.minutes - x.limit), 0)
  return { obj: res.unscheduled.length * 1000 + excess * 3, alerts }
}

export function recommendFixes(data: AppData, weekStart: string, siteId: string): FixPlan {
  const maxDay = data.settings.maxDailyHours * 60
  const maxWeek = data.settings.maxWeeklyHours * 60
  const closed = new Set(data.settings.closedDates)
  const dateOf = (d: number) => addDays(weekStart, d)

  let cur = data
  let res = schedule(cur, weekStart)
  let sc = score(res, cur)
  const before = { unscheduled: res.unscheduled.length, alerts: sc.alerts.length }
  const extMap = new Map<string, Extension>()

  // Phase 1: give existing workers more hours, 2h at a time, where it helps the most per added minute.
  for (let step = 0; step < 8 && sc.obj > 0; step++) {
    // where is the problem? (centre of unplaced jobs + the jobs of overloaded workers, per day)
    const pts = new Map<number, number[]>()
    const add = (d: number, m: number) => pts.set(d, [...(pts.get(d) ?? []), m])
    for (const u of res.unscheduled.filter(fixableByStaff)) add(Math.floor(u.job.earliest / DAY), (u.job.earliest + u.job.deadline) / 2 % DAY)
    const overloaded = new Set(sc.alerts.map((a) => a.workerId))
    for (const p of res.placements) if (overloaded.has(p.workerId)) add(Math.floor(p.start / DAY), ((p.start + p.end) / 2) % DAY)
    const days = [...pts.keys()].sort((a, b) => pts.get(b)!.length - pts.get(a)!.length).slice(0, 5)
    const rep = hoursReport(res, cur)

    let best: { worker: Worker; day: number; win: { start: number; end: number }; gain: number; per: number; sc: ReturnType<typeof score>; res: ScheduleResult } | null = null
    for (const w of cur.workers) {
      if ((rep.byWorker[w.id]?.week ?? 0) >= maxWeek) continue // already at the weekly limit
      for (const d of days) {
        if (closed.has(dateOf(d)) || w.absences.includes(dateOf(d)) || !data.settings.workDays.includes(d)) continue
        const sh = w.shifts[d]
        const c = pts.get(d)!.reduce((a, b) => a + b, 0) / pts.get(d)!.length
        const wins: { start: number; end: number }[] = []
        if (sh) {
          if (sh.end - sh.start >= maxDay) continue
          const inc = Math.min(EXT_STEP, maxDay - (sh.end - sh.start))
          wins.push({ start: sh.start, end: Math.min(PLAN_TO, sh.end + inc) }, { start: Math.max(PLAN_FROM, sh.start - inc), end: sh.end }) // later end / earlier start
        } else {
          wins.push({ start: Math.max(PLAN_FROM, Math.round((c - 120) / 30) * 30), end: Math.min(PLAN_TO, Math.round((c + 120) / 30) * 30) }) // a new day of 4h
        }
        for (const win of wins) {
          const added = win.end - win.start - (sh ? sh.end - sh.start : 0)
          if (added <= 0) continue
          const trial = { ...cur, workers: cur.workers.map((x) => x.id === w.id ? { ...x, shifts: x.shifts.map((s, i) => i === d ? win : s) } : x) }
          const r2 = schedule(trial, weekStart), s2 = score(r2, trial)
          const gain = sc.obj - s2.obj
          if (gain > 0 && (!best || gain / added > best.per)) best = { worker: w, day: d, win, gain, per: gain / added, sc: s2, res: r2 }
        }
      }
    }
    if (!best) break
    const w = best.worker, d = best.day
    const key = `${w.id}|${d}`
    const prev = extMap.get(key)
    const orig = prev ? prev.before : w.shifts[d]
    extMap.set(key, {
      workerId: w.id, workerName: w.name, day: d, before: orig, after: best.win,
      addedMin: best.win.end - best.win.start - (orig ? orig.end - orig.start : 0),
    })
    cur = { ...cur, workers: cur.workers.map((x) => x.id === w.id ? { ...x, shifts: x.shifts.map((s, i) => i === d ? best!.win : s) } : x) }
    res = best.res; sc = best.sc
  }

  // Phase 2: still not solved -> hire.
  const hires: Hire[] = []
  if (sc.obj > 0 && res.unscheduled.some(fixableByStaff)) {
    const rec = recommendHires(cur, weekStart, siteId)
    for (const h of rec.hires) { hires.push(h); cur = { ...cur, workers: [...cur.workers, h.worker] } }
    res = schedule(cur, weekStart); sc = score(res, cur)
  }
  // overtime only (or still overloaded): a new person who takes over the busiest days of the overloaded workers
  for (let n = 0; n < 3 && sc.alerts.length > 0; n++) {
    const over = new Set(sc.alerts.map((a) => a.workerId))
    const presByDay = Array.from({ length: 7 }, (_, d) => {
      const iv = res.placements.filter((p) => over.has(p.workerId) && Math.floor(p.start / DAY) === d)
      return iv.length ? { d, start: Math.min(...iv.map((p) => p.start - d * DAY)), n: iv.length } : null
    }).filter((x): x is { d: number; start: number; n: number } => x !== null && data.settings.workDays.includes(x.d)).sort((a, b) => b.n - a.n)
    let accepted = false
    for (let k = 2; k <= presByDay.length && !accepted; k++) {
      const chosen = presByDay.slice(0, k)
      const win: HireWindow[] = chosen.map((x) => ({ day: x.d, start: Math.floor(x.start / STEP) * STEP, end: Math.min(PLAN_TO, Math.floor(x.start / STEP) * STEP + maxDay), jobs: x.n })).sort((a, b) => a.day - b.day)
      const total = win.reduce((a, x) => a + x.end - x.start, 0)
      if (total > maxWeek) break
      const worker: Worker = {
        id: `rec-o${n + 1}`, siteId, name: `עובד נוסף ${hires.length + 1}`, color: COLORS[(hires.length) % COLORS.length], absences: [],
        shifts: Array.from({ length: 7 }, (_, d) => { const w = win.find((x) => x.day === d); return w ? { start: w.start, end: w.end } : null }),
      }
      const trial = { ...cur, workers: [...cur.workers, worker] }
      const r2 = schedule(trial, weekStart), s2 = score(r2, trial)
      if (s2.obj < sc.obj) { hires.push({ worker, windows: win, weeklyMin: total }); cur = trial; res = r2; sc = s2; accepted = true }
    }
    if (!accepted) break
  }

  return {
    extensions: [...extMap.values()].sort((a, b) => a.workerName.localeCompare(b.workerName) || a.day - b.day),
    hires,
    after: { unscheduled: res.unscheduled, alerts: sc.alerts },
    before,
  }
}
