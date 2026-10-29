import type { AppData, Job, ScheduleResult, Unscheduled, Worker } from './types'
import { DAY, addDays, blockedForSpace, hoursReport, schedule, stintsOf } from './scheduler'
import type { HoursAlert } from './scheduler'

const PLAN_FROM = 5 * 60
const PLAN_TO = 24 * 60
const STEP = 30
const COLORS = ['#d9822b', '#3a8f7b', '#8e5bb5', '#c04f6a', '#4a7fc1']

/** Unscheduled jobs that more people can fix (not blocked by a space constraint or a too-short window). */
const fixableByStaff = (u: Unscheduled) => u.reason.startsWith('כל העובדים תפוסים') || u.reason.startsWith('אין עובד במשמרת')

export interface HireWindow { day: number; start: number; end: number; jobs: number; /** optional second window the same day (split shift) */ second?: { start: number; end: number } }
export interface Hire { worker: Worker; windows: HireWindow[]; weeklyMin: number }
export interface HireRecommendation {
  hires: Hire[]
  /** jobs that were unscheduled and are placed once the hires join */
  resolved: number
  /** jobs that stay unscheduled: blocked by a constraint no extra person can fix */
  unfixable: Unscheduled[]
}

type Win = { start: number; end: number }

/**
 * Where could extra cleaners actually be useful on `day`? For every unplaced job the allowed times (its window minus the
 * times the space is blocked) are spread as "demand" over 30-minute slots. The busiest stretches become one or two windows
 * (a split shift), together at most one person's daily limit - so people are not asked to stand around while cleaning is forbidden.
 */
function planDayWindows(data: AppData, weekStart: string, day: number, jobs: Job[], maxDay: number): [Win, Win?] | null {
  const SLOTS = (PLAN_TO - PLAN_FROM) / STEP
  const demand = Array<number>(SLOTS).fill(0)
  for (const j of jobs) {
    const lo = Math.max(j.earliest, day * DAY + PLAN_FROM), hi = Math.min(j.deadline, day * DAY + PLAN_TO)
    if (hi - lo < j.duration) continue
    const blocked = blockedForSpace(data, j.spaceId, weekStart)
    const ok: number[] = []
    for (let i = 0; i < SLOTS; i++) {
      const a = day * DAY + PLAN_FROM + i * STEP, b = a + STEP
      if (b <= lo || a >= hi) continue
      if (blocked.some(([x, y]) => a < y && b > x)) continue
      ok.push(i)
    }
    for (const i of ok) demand[i] += j.duration / Math.max(1, ok.length)
  }
  // contiguous runs of useful slots; runs closer than 2h are one stint
  const runs: { s: number; e: number; d: number }[] = []
  for (let i = 0; i < SLOTS; i++) {
    if (demand[i] <= 0) continue
    const last = runs[runs.length - 1]
    if (last && i * STEP - last.e < 120) { last.e = (i + 1) * STEP; last.d += demand[i] }
    else runs.push({ s: i * STEP, e: (i + 1) * STEP, d: demand[i] })
  }
  if (!runs.length) return null
  const top = runs.sort((a, b) => b.d - a.d).slice(0, 2)
  const chosen: Win[] = []
  let left = maxDay
  for (const r of top.sort((a, b) => a.s - b.s)) {
    const len = Math.min(r.e - r.s, left)
    if (len < 60) continue
    chosen.push({ start: PLAN_FROM + r.s, end: PLAN_FROM + r.s + len })
    left -= len
  }
  return chosen.length ? [chosen[0], chosen[1]] : null
}

/** Worker shifts from per-day windows (first window + optional second window). */
function shiftsOf(win: HireWindow[]): Pick<Worker, 'shifts' | 'extra'> {
  return {
    shifts: Array.from({ length: 7 }, (_, d) => { const w = win.find((k) => k.day === d); return w ? { start: w.start, end: w.end } : null }),
    extra: Array.from({ length: 7 }, (_, d) => win.find((k) => k.day === d)?.second ?? null),
  }
}
const winMin = (w: HireWindow) => w.end - w.start + (w.second ? w.second.end - w.second.start : 0)

/** Union of two hires' windows per day (overlapping / close windows merge; at most two windows, one person's daily limit). */
function mergeHires(a: Hire, b: Hire, maxDay: number, maxWeek: number): HireWindow[] | null {
  const out: HireWindow[] = []
  for (let d = 0; d < 7; d++) {
    const parts: Win[] = []
    for (const h of [a, b]) {
      const w = h.windows.find((x) => x.day === d)
      if (w) { parts.push({ start: w.start, end: w.end }); if (w.second) parts.push(w.second) }
    }
    if (!parts.length) continue
    parts.sort((x, y) => x.start - y.start)
    const merged: Win[] = []
    for (const p of parts) {
      const last = merged[merged.length - 1]
      if (last && p.start - last.end < 120) last.end = Math.max(last.end, p.end)
      else merged.push({ ...p })
    }
    let left = maxDay
    const keep: Win[] = []
    for (const w of [...merged].sort((x, y) => (y.end - y.start) - (x.end - x.start)).slice(0, 2)) {
      const len = Math.min(w.end - w.start, left)
      if (len < 60) continue
      keep.push({ start: w.start, end: w.start + len }); left -= len
    }
    keep.sort((x, y) => x.start - y.start)
    if (keep.length) out.push({ day: d, start: keep[0].start, end: keep[0].end, second: keep[1], jobs: 0 })
  }
  const total = out.reduce((acc, w) => acc + winMin(w), 0)
  return out.length && total <= maxWeek ? out : null
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
      const w = planDayWindows(data, weekStart, day, jobs, maxDay)
      if (w) windows.push({ day, start: w[0].start, end: w[0].end, second: w[1], jobs: jobs.length })
    }
    if (!windows.length) break

    // respect the weekly limit: keep the days that fix the most jobs
    windows.sort((x, y) => y.jobs - x.jobs)
    const kept: HireWindow[] = []
    let total = 0
    for (const w of windows) {
      if (total + winMin(w) > maxWeek && kept.length) continue
      kept.push(w); total += winMin(w)
    }
    kept.sort((x, y) => x.day - y.day)

    const mk = (win: HireWindow[]): Worker => ({
      id: `rec-${n + 1}`, siteId, name: `עובד נוסף ${n + 1}`, color: COLORS[n % COLORS.length], absences: [], ...shiftsOf(win),
    })

    // Candidate 1: windows targeted at the days that have unplaced jobs.
    // Candidate 2 (when 1 does not help, e.g. the shortage is spread over several days): the same useful times on every working day.
    const allDays: HireWindow[] = []
    for (const d of data.settings.workDays) {
      const moved = todo.map((u) => ({ ...u.job, earliest: d * DAY + (u.job.earliest % DAY), deadline: d * DAY + (((u.job.deadline - 1) % DAY) + 1) }))
      const w = planDayWindows(data, weekStart, d, moved, maxDay)
      if (w) allDays.push({ day: d, start: w[0].start, end: w[0].end, second: w[1], jobs: 0 })
    }
    const total2 = allDays.reduce((acc, w) => acc + winMin(w), 0)
    const candidates: { win: HireWindow[]; total: number }[] = [{ win: kept, total }]
    if (allDays.length && total2 <= maxWeek) candidates.push({ win: allDays, total: total2 })

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

/** Group days that share the same window(s), e.g. "א׳ ב׳ ג׳ · 06:00–09:00 + 16:30–22:00". */
export function groupWindows(windows: HireWindow[]): { days: number[]; start: number; end: number; second?: { start: number; end: number } }[] {
  const groups: { days: number[]; start: number; end: number; second?: { start: number; end: number } }[] = []
  for (const w of windows) {
    const g = groups.find((x) => x.start === w.start && x.end === w.end && x.second?.start === w.second?.start && x.second?.end === w.second?.end)
    if (g) g.days.push(w.day)
    else groups.push({ days: [w.day], start: w.start, end: w.end, second: w.second })
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

  const extendLoop = () => {
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
  }
  extendLoop()

  // Phase 1b: a second person with the same availability as an existing worker (often the simplest fix), then extend again.
  const hires: Hire[] = []
  for (let n = 0; n < 2 && sc.obj > 0; n++) {
    let bestClone: { worker: Worker; res: ScheduleResult; sc: ReturnType<typeof score>; weeklyMin: number } | null = null
    for (const w of cur.workers.filter((x) => !hires.some((h) => h.worker.id === x.id))) {
      const clone: Worker = { ...w, id: `rec-c${n + 1}-${w.id}`, name: `עובד נוסף ${hires.length + 1}`, color: COLORS[hires.length % COLORS.length], absences: [] }
      const trial = { ...cur, workers: [...cur.workers, clone] }
      const r2 = schedule(trial, weekStart), s2 = score(r2, trial)
      if (s2.obj < sc.obj && (!bestClone || s2.obj < bestClone.sc.obj)) {
        const weeklyMin = [...w.shifts, ...(w.extra ?? [])].reduce((acc, x) => acc + (x ? x.end - x.start : 0), 0)
        bestClone = { worker: clone, res: r2, sc: s2, weeklyMin }
      }
    }
    if (!bestClone) break
    const win: HireWindow[] = []
    for (let d = 0; d < 7; d++) {
      const f = bestClone.worker.shifts[d], e = bestClone.worker.extra?.[d] ?? undefined
      if (f) win.push({ day: d, start: f.start, end: f.end, second: e, jobs: 0 })
    }
    hires.push({ worker: bestClone.worker, windows: win, weeklyMin: bestClone.weeklyMin })
    cur = { ...cur, workers: [...cur.workers, bestClone.worker] }
    res = bestClone.res; sc = bestClone.sc
    extendLoop() // maybe widen availability of the people we already have (e.g. a longer Friday)
  }

  // Phase 2: still not solved -> hire.
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
      return iv.length ? { d, start: Math.min(...iv.map((p) => p.start - d * DAY)), n: iv.length, stints: stintsOf(iv.map((p) => [p.start - d * DAY, p.end - d * DAY])) } : null
    }).filter((x): x is { d: number; start: number; n: number; stints: [number, number][] } => x !== null && data.settings.workDays.includes(x.d)).sort((a, b) => b.n - a.n)
    let accepted = false
    for (let k = 2; k <= presByDay.length && !accepted; k++) {
      const chosen = presByDay.slice(0, k)
      // the new person takes over the same stints (max two, at most one day's hours) the overloaded workers have on those days
      const win: HireWindow[] = chosen.map((x) => {
        let left = maxDay
        const parts: Win[] = []
        for (const [a, b] of x.stints.slice(0, 2)) {
          const len = Math.min(Math.ceil((b - a) / STEP) * STEP, left)
          if (len < 60) continue
          parts.push({ start: Math.floor(a / STEP) * STEP, end: Math.floor(a / STEP) * STEP + len }); left -= len
        }
        return { day: x.d, start: parts[0]?.start ?? x.start, end: parts[0]?.end ?? x.start + maxDay, second: parts[1], jobs: x.n }
      }).sort((a, b) => a.day - b.day)
      const total = win.reduce((a, x) => a + winMin(x), 0)
      if (total > maxWeek) break
      const worker: Worker = {
        id: `rec-o${n + 1}`, siteId, name: `עובד נוסף ${hires.length + 1}`, color: COLORS[(hires.length) % COLORS.length], absences: [],
        ...shiftsOf(win),
      }
      const trial = { ...cur, workers: [...cur.workers, worker] }
      const r2 = schedule(trial, weekStart), s2 = score(r2, trial)
      if (s2.obj < sc.obj) { hires.push({ worker, windows: win, weeklyMin: total }); cur = trial; res = r2; sc = s2; accepted = true }
    }
    if (!accepted) break
  }

  // Consolidate: try to replace two hires by one person who covers both sets of windows (fewer people for the same result).
  for (let again = true; again && hires.length > 1;) {
    again = false
    const base = cur.workers.filter((w) => !hires.some((h) => h.worker.id === w.id))
    const target = score(res, cur).obj
    outer: for (let i = 0; i < hires.length; i++) {
      for (let j = i + 1; j < hires.length; j++) {
        const win = mergeHires(hires[i], hires[j], maxDay, maxWeek)
        if (!win) continue
        const merged: Worker = { ...hires[i].worker, ...shiftsOf(win) }
        const others = hires.filter((_, k) => k !== i && k !== j)
        const trial = { ...cur, workers: [...base, ...others.map((h) => h.worker), merged] }
        const r2 = schedule(trial, weekStart), s2 = score(r2, trial)
        if (s2.obj <= target) {
          const nextHires = [...others, { worker: merged, windows: win, weeklyMin: win.reduce((acc, w) => acc + winMin(w), 0) }]
          hires.length = 0; hires.push(...nextHires)
          cur = trial; res = r2; sc = s2; again = true
          break outer
        }
      }
    }
  }
  hires.forEach((h, i) => { h.worker.name = `עובד נוסף ${i + 1}` })

  return {
    extensions: [...extMap.values()].sort((a, b) => a.workerName.localeCompare(b.workerName) || a.day - b.day),
    hires,
    after: { unscheduled: res.unscheduled, alerts: sc.alerts },
    before,
  }
}
