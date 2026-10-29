import type {
  AppData, SiteRule, FreqRule, Job, Override, Placement, ScheduleResult, Space, Unscheduled, Worker,
} from './types'

export const DAY = 1440
export const WEEK = DAY * 7
const STEP = 5

type Interval = [number, number]
type Busy = [number, number]

// ───────────── date helpers ─────────────

export function toISO(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toISO(d)
}

/** Sunday of the week containing `iso`. */
export function weekStartOf(iso: string): string {
  return addDays(iso, -parseISO(iso).getUTCDay())
}

/** Day index (0..6) of `date` inside the week, or -1 when outside. */
export function dayIndex(date: string, weekStart: string): number {
  const diff = Math.round((parseISO(date).getTime() - parseISO(weekStart).getTime()) / 86400000)
  return diff >= 0 && diff < 7 ? diff : -1
}

export function overrideKey(weekStart: string, jobId: string): string {
  return `${weekStart}|${jobId}`
}

// ───────────── interval helpers ─────────────

const overlaps = (a: Interval, b: readonly number[], pad = 0) => a[0] < b[1] + pad && a[1] + pad > b[0]

function cellOf(data: AppData, space: Space) {
  const type = data.types.find((t) => t.id === space.typeId)
  const base = type?.matrix[space.level] ?? { minutes: 30, roundsPerDay: 1 }
  const site = data.sites.find((x) => x.id === space.siteId)
  const o = site?.overrides?.byType?.[space.typeId]
  const pct = (site?.overrides?.scalePct ?? 100) / 100
  const scale = (m: number) => (m > 0 ? Math.max(1, Math.round(m * pct)) : 0)
  return {
    minutes: space.minutesOverride ?? scale(o?.daily ?? base.minutes), // a space's own value is not scaled
    rounds: space.roundsOverride ?? base.roundsPerDay,
    weeklyMin: scale(o?.weekly ?? type?.weeklyMin ?? 0),
    monthlyMin: scale(o?.monthly ?? type?.monthlyMin ?? 0),
    weeklyTimes: Math.max(1, o?.weeklyTimes ?? type?.weeklyTimes ?? 1),
    monthlyEvery: Math.max(1, Math.round(o?.monthlyEveryWeeks ?? type?.monthlyEveryWeeks ?? 4)),
  }
}

/** How many times a week the daily cleaning of a space runs: the space's own value, else the last matching site rule, else every working day. */
export function freqFor(data: AppData, space: Space): number | undefined {
  if (space.timesPerWeek && space.timesPerWeek > 0) return space.timesPerWeek
  const rules: FreqRule[] = data.sites.find((x) => x.id === space.siteId)?.freqRules ?? []
  let f: number | undefined
  for (const r of rules) {
    const hit = r.mode === 'all' || (r.mode === 'only' ? r.spaceIds.includes(space.id) : !r.spaceIds.includes(space.id))
    if (hit && r.timesPerWeek > 0) f = r.timesPerWeek
  }
  return f
}

/** Cleaning minutes of one space: per working day (daily rounds), per week (weekly list) and per 4 weeks (monthly list). */
export function spaceMinutes(data: AppData, space: Space) {
  const c = cellOf(data, space)
  const days = Math.max(1, data.settings.workDays.length)
  const times = Math.min(days, freqFor(data, space) ?? days) // days a week the daily cleaning runs
  const daily = c.minutes > 0 && c.rounds > 0 ? c.minutes * c.rounds : 0 // per cleaning day
  const weekly = c.weeklyMin * Math.min(c.weeklyTimes, days) // per week
  const monthly = c.monthlyMin * (4 / c.monthlyEvery) // average per 4 weeks
  return {
    daily, weekly, monthly, times,
    /** average per working day, with weekly / monthly lists spread over the days they cover */
    avgPerDay: (daily * times) / days + weekly / days + monthly / (4 * days),
    perWeek: daily * times + weekly + monthly / 4,
    per4Weeks: daily * times * 4 + weekly * 4 + monthly,
  }
}

function closedDays(data: AppData, weekStart: string): Set<number> {
  const s = new Set<number>()
  for (const d of data.settings.closedDates) {
    const i = dayIndex(d, weekStart)
    if (i >= 0) s.add(i)
  }
  return s
}

// ───────────── job generation ─────────────

export function generateJobs(data: AppData, weekStart: string): Job[] {
  const jobs: Job[] = []
  const closed = closedDays(data, weekStart)
  const openDays = data.settings.workDays.filter((d) => !closed.has(d))

  for (const space of data.spaces) {
    const cell = cellOf(data, space)

    // 1. Daily rounds from the matrix: the day is cut into equal slots, one slot per round.
    const { dayStart } = data.settings
    const endOf = (day: number) => (day === 5 ? data.settings.fridayEnd : data.settings.dayEnd)
    const NOON = 12 * 60
    /** Narrow a whole-day window to the space's preferred half of the day. */
    const pick = (day: number, from: number, to: number): [number, number] => {
      if (space.slot === 'morning' && to - from > 0) return [from, Math.min(to, NOON)]
      if (space.slot === 'evening') return [Math.max(from, NOON), to]
      return [from, to]
    }
    // days on which the daily cleaning runs: every working day, or `freq` days a week spread over them
    const freq = freqFor(data, space)
    const hSpace = [...space.id].reduce((a, c) => a + c.charCodeAt(0), 0)
    const dailyDays = freq && freq < openDays.length
      ? Array.from({ length: freq }, (_, i) => openDays[(Math.floor(((i + 0.5) * openDays.length) / freq) + hSpace) % openDays.length])
      : openDays
    if (cell.minutes > 0 && cell.rounds > 0) {
      for (const day of dailyDays) {
        const dayEnd = endOf(day)
        // repeated rounds happen while the site is open; a single round may use the whole working day
        const hrs = data.sites.find((x) => x.id === space.siteId)?.hours
        const rFrom = cell.rounds > 1 && hrs ? Math.max(dayStart, hrs.start) : dayStart
        const rTo = cell.rounds > 1 && hrs ? Math.min(dayEnd, Math.max(hrs.end, rFrom + 60)) : dayEnd
        const slot = (rTo - rFrom) / cell.rounds
        for (let i = 0; i < cell.rounds; i++) {
          jobs.push({
            id: `r|${space.id}|${day}|${i}`,
            spaceId: space.id,
            kind: 'routine',
            label: cell.rounds > 1 ? `סבב ${i + 1}/${cell.rounds}` : 'ניקיון יומי',
            duration: cell.minutes,
            earliest: day * DAY + (cell.rounds === 1 ? pick(day, dayStart, dayEnd)[0] : Math.round(rFrom + i * slot)),
            deadline: day * DAY + (cell.rounds === 1 ? pick(day, dayStart, dayEnd)[1] : Math.round(rFrom + (i + 1) * slot)),
            priority: 10 + space.level * 3,
          })
        }
      }
    }

    // 1b. Weekly list once a week; monthly list once every four weeks (spread by a per-space offset).
    if (openDays.length) {
      const h = [...space.id].reduce((a, c) => a + c.charCodeAt(0), 0)
      const weekNo = Math.floor(parseISO(weekStart).getTime() / (7 * 86400000))
      if (cell.weeklyMin > 0) {
        const n = Math.min(cell.weeklyTimes, openDays.length)
        for (let i = 0; i < n; i++) {
          const day = openDays[(Math.floor(((i + 0.5) * openDays.length) / n) + h) % openDays.length]
          jobs.push({ id: `w|${space.id}|${i}`, spaceId: space.id, kind: 'routine', label: 'ניקיון שבועי', duration: cell.weeklyMin,
            earliest: day * DAY + pick(day, dayStart, endOf(day))[0], deadline: day * DAY + pick(day, dayStart, endOf(day))[1], priority: 8 })
        }
      }
      // monthly list: every N weeks (spread across spaces by a per-space offset)
      if (cell.monthlyMin > 0 && (weekNo + h) % cell.monthlyEvery === 0) {
        const day = openDays[(h + 1) % openDays.length]
        jobs.push({ id: `mo|${space.id}`, spaceId: space.id, kind: 'routine', label: 'ניקיון חודשי', duration: cell.monthlyMin,
          earliest: day * DAY + pick(day, dayStart, endOf(day))[0], deadline: day * DAY + pick(day, dayStart, endOf(day))[1], priority: 6 })
      }
    }

    // 2. Mandatory cleaning after daily activities.
    for (const act of space.activities) {
      if (closed.has(act.day)) continue
      const earliest = act.day * DAY + act.end
      jobs.push({
        id: `a|${act.id}`,
        spaceId: space.id,
        kind: 'activity',
        label: `אחרי ${act.label}`,
        duration: cell.minutes,
        earliest,
        deadline: Math.min(earliest + act.withinMin, WEEK),
        priority: 100,
      })
    }

    // 3. Special events pinned to the calendar.
    for (const ev of space.events) {
      const day = dayIndex(ev.date, weekStart)
      if (day < 0) continue
      const evStart = day * DAY + ev.start
      const evEnd = day * DAY + ev.end
      if (ev.cleanBefore) {
        jobs.push({
          id: `e|${ev.id}|pre`,
          spaceId: space.id,
          kind: 'event',
          label: `לפני ${ev.label}`,
          duration: cell.minutes,
          earliest: Math.max(day * DAY + data.settings.dayStart, evStart - 6 * 60),
          deadline: evStart,
          priority: 120,
        })
      }
      if (ev.cleanAfterWithinMin > 0) {
        jobs.push({
          id: `e|${ev.id}|post`,
          spaceId: space.id,
          kind: 'event',
          label: `אחרי ${ev.label}`,
          duration: cell.minutes,
          earliest: evEnd,
          deadline: Math.min(evEnd + ev.cleanAfterWithinMin, WEEK),
          priority: 120,
        })
      }
    }
  }

  // 4. Manual one-off tasks.
  for (const m of data.manualJobs) {
    const day = dayIndex(m.date, weekStart)
    if (day < 0) continue
    jobs.push({
      id: `m|${m.id}`,
      spaceId: m.spaceId,
      kind: 'manual',
      label: m.label,
      duration: m.duration,
      earliest: day * DAY + m.from,
      deadline: day * DAY + m.to,
      priority: 90,
    })
  }

  return jobs
}

// ───────────── availability ─────────────

function blockedFor(space: Space | undefined, weekStart: string, rules: SiteRule[] = []): Interval[] {
  if (!space) return []
  const out: Interval[] = []
  for (const r of rules) {
    const hit = r.mode === 'all' || (r.mode === 'only' ? r.spaceIds.includes(space.id) : !r.spaceIds.includes(space.id))
    if (hit) for (const d of r.days) out.push([d * DAY + r.start, d * DAY + r.end])
  }
  for (const b of space.blocked) out.push([b.day * DAY + b.start, b.day * DAY + b.end])
  for (const a of space.activities) out.push([a.day * DAY + a.start, a.day * DAY + a.end])
  for (const e of space.events) {
    const d = dayIndex(e.date, weekStart)
    if (d >= 0) out.push([d * DAY + e.start, d * DAY + e.end])
  }
  return out
}

function shiftsFor(worker: Worker, data: AppData, weekStart: string): Interval[] {
  const closed = closedDays(data, weekStart)
  const out: Interval[] = []
  worker.shifts.forEach((s, d) => {
    if (!s || closed.has(d)) return
    if (worker.absences.includes(addDays(weekStart, d))) return
    out.push([d * DAY + s.start, d * DAY + s.end])
  })
  return out
}

interface WorkerState {
  worker: Worker
  shifts: Interval[]
  busy: Busy[]
  load: number[] // minutes assigned per day
  pres: number[] // minutes of presence per day (see presenceMin)
}

function findStart(
  st: WorkerState, job: Job, blocked: Interval[], buffer: number,
  opts: { ignoreBusy?: boolean; ignoreBlocked?: boolean } = {},
): number | null {
  const lo = Math.ceil(job.earliest / STEP) * STEP
  const hi = job.deadline - job.duration
  for (let t = lo; t <= hi; t += STEP) {
    const iv: Interval = [t, t + job.duration]
    if (!st.shifts.some((s) => iv[0] >= s[0] && iv[1] <= s[1])) continue
    if (!opts.ignoreBlocked && blocked.some((b) => overlaps(iv, b))) continue
    if (!opts.ignoreBusy && st.busy.some((b) => overlaps(iv, b, buffer))) continue
    return t
  }
  return null
}

function diagnose(states: WorkerState[], job: Job, blocked: Interval[], buffer: number): string {
  if (job.deadline - job.duration < job.earliest) return 'החלון קצר מדי ביחס למשך הניקיון'
  if (!states.some((s) => findStart(s, job, [], buffer, { ignoreBusy: true }) !== null)) {
    return 'אין עובד במשמרת בחלון הזמן הנדרש'
  }
  if (!states.some((s) => findStart(s, job, blocked, buffer, { ignoreBusy: true }) !== null)) {
    return 'החלל חסום לניקיון בכל שעות המשמרות בחלון'
  }
  return 'כל העובדים תפוסים בחלון הזמן – נדרש עובד נוסף או הזזת משימה'
}

// ───────────── working hours ─────────────

/** Gaps shorter than this keep two jobs in one continuous stint; longer gaps count as a split shift (off duty in between). */
const STINT_GAP = 120

/** Continuous stints of work in a day: consecutive jobs with a gap shorter than STINT_GAP are one stint. */
export function stintsOf(intervals: readonly (readonly number[])[]): [number, number][] {
  const iv = intervals.map((x) => [x[0], x[1]] as [number, number]).sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const [a, b] of iv) {
    const last = out[out.length - 1]
    if (last && a - last[1] < STINT_GAP) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/** Minutes of presence in a day: the length of all stints. */
export function presenceMin(intervals: readonly (readonly number[])[]): number {
  return stintsOf(intervals).reduce((a, [x, y]) => a + (y - x), 0)
}

export interface HoursAlert { workerId: string; day: number | null; minutes: number; limit: number }

/** Per-worker presence by day / week, and the overtime alerts (daily over the daily limit, weekly over the weekly limit). */
export function hoursReport(result: ScheduleResult, data: AppData) {
  const dayLimit = data.settings.maxDailyHours * 60, weekLimit = data.settings.maxWeeklyHours * 60
  const alerts: HoursAlert[] = []
  const byWorker: Record<string, { days: number[]; week: number }> = {}
  for (const w of data.workers) {
    const mine = result.placements.filter((p) => p.workerId === w.id)
    const days = Array.from({ length: 7 }, (_, d) => presenceMin(mine.filter((p) => Math.floor(p.start / DAY) === d).map((p) => [p.start, p.end])))
    const week = days.reduce((a, b) => a + b, 0)
    byWorker[w.id] = { days, week }
    days.forEach((m, d) => { if (m > dayLimit) alerts.push({ workerId: w.id, day: d, minutes: m, limit: dayLimit }) })
    if (week > weekLimit) alerts.push({ workerId: w.id, day: null, minutes: week, limit: weekLimit })
  }
  return { byWorker, alerts }
}

// ───────────── main ─────────────

/** `pack` = ignore workload balancing and always take the earliest slot (used for staffing estimates). */
export function schedule(data: AppData, weekStart: string, opts: { pack?: boolean } = {}): ScheduleResult {
  const allJobs = generateJobs(data, weekStart)
  const spaceById = new Map(data.spaces.map((s) => [s.id, s]))
  const rulesOf = (spaceId: string): SiteRule[] => data.sites.find((x) => x.id === spaceById.get(spaceId)?.siteId)?.rules ?? []
  const ovr = (id: string): Override | undefined => data.overrides[overrideKey(weekStart, id)]

  const skipped: Job[] = []
  const jobs: Job[] = []
  for (const j of allJobs) {
    const o = ovr(j.id)
    if (o?.skip) { skipped.push(j); continue }
    jobs.push(o?.duration ? { ...j, duration: o.duration } : j)
  }

  const states: WorkerState[] = data.workers.map((w) => ({
    worker: w, shifts: shiftsFor(w, data, weekStart), busy: [], load: Array(7).fill(0), pres: Array(7).fill(0),
  }))
  const stateById = new Map(states.map((s) => [s.worker.id, s]))
  const place = (st: WorkerState, job: Job, start: number) => {
    st.busy.push([start, start + job.duration])
    st.load[Math.min(6, Math.floor(start / DAY))] += job.duration
    const pd = Math.min(6, Math.floor(start / DAY))
    st.pres[pd] = presenceMin(st.busy.filter((b) => Math.floor(b[0] / DAY) === pd))
  }

  // two cleaners never work in the same space at the same time
  const spaceBusy = new Map<string, Interval[]>()
  const markSpace = (spaceId: string, a: number, b: number) => spaceBusy.set(spaceId, [...(spaceBusy.get(spaceId) ?? []), [a, b]])
  const placements: Placement[] = []
  const unscheduled: Unscheduled[] = []
  const buffer = data.settings.buffer

  // Manual pins first – they are respected even when they break a rule (flagged as warnings).
  const auto: Job[] = []
  for (const job of jobs) {
    const pin = ovr(job.id)?.pin
    const st = pin ? stateById.get(pin.workerId) : undefined
    if (!pin || !st) { auto.push(job); continue }
    const iv: Interval = [pin.start, pin.start + job.duration]
    const warnings: string[] = []
    if (!st.shifts.some((s) => iv[0] >= s[0] && iv[1] <= s[1])) warnings.push('מחוץ למשמרת העובד')
    if (blockedFor(spaceById.get(job.spaceId), weekStart, rulesOf(job.spaceId)).some((b) => overlaps(iv, b))) warnings.push('החלל חסום לניקיון בשעה זו')
    if (st.busy.some((b) => overlaps(iv, b, 0))) warnings.push('חפיפה עם משימה אחרת של העובד')
    if (iv[0] < job.earliest || iv[1] > job.deadline) warnings.push('מחוץ לחלון הזמן הנדרש')
    place(st, job, pin.start)
    markSpace(job.spaceId, pin.start, iv[1])
    placements.push({ jobId: job.id, workerId: st.worker.id, start: pin.start, end: iv[1], pinned: true, warnings })
  }

  // Greedy earliest-deadline-first: tightest windows first, then highest priority.
  // Greedy earliest-deadline-first: tightest windows first, then highest priority.
  const slack = (j: Job) => j.deadline - j.earliest - j.duration
  auto.sort((a, b) => slack(a) - slack(b) || b.priority - a.priority || a.earliest - b.earliest)

  for (const job of auto) {
    const blocked = blockedFor(spaceById.get(job.spaceId), weekStart, rulesOf(job.spaceId))
    let best: { st: WorkerState; t: number; cost: number } | null = null
    for (const st of states) {
      const t = findStart(st, job, blocked.concat(spaceBusy.get(job.spaceId) ?? []), buffer)
      if (t === null) continue
      const dayLoad = st.load[Math.min(6, Math.floor(t / DAY))]
      const weekLoad = st.load.reduce((a, b) => a + b, 0)
      // pack = first-fit: fill the lowest-numbered worker first so the headcount stays minimal
      // overtime: stay within the daily hours limit whenever possible (allowed, but flagged, when unavoidable)
      const dIdx = Math.min(6, Math.floor(t / DAY))
      const dayIv = st.busy.filter((b) => Math.floor(b[0] / DAY) === dIdx)
      const dayAfter = presenceMin([...dayIv, [t, t + job.duration]])
      const weekAfter = st.pres.reduce((a, b) => a + b, 0) - st.pres[dIdx] + dayAfter
      const over = (dayAfter > data.settings.maxDailyHours * 60 ? (opts.pack ? 1e7 : 2000) : 0) +
        (weekAfter > data.settings.maxWeeklyHours * 60 ? (opts.pack ? 5e6 : 1000) : 0)
      const cost = opts.pack
        ? states.indexOf(st) * 1e6 + t + over
        : (t - job.earliest) * 0.25 + dayLoad * 0.6 + weekLoad * 0.5 + over // earlier start + balanced workload (day & week)
      if (!best || cost < best.cost) best = { st, t, cost }
    }
    if (!best) { unscheduled.push({ job, reason: diagnose(states, job, blocked, buffer) }); continue }
    place(best.st, job, best.t)
    markSpace(job.spaceId, best.t, best.t + job.duration)
    placements.push({
      jobId: job.id, workerId: best.st.worker.id, start: best.t, end: best.t + job.duration, pinned: false, warnings: [],
    })
  }

  placements.sort((a, b) => a.start - b.start)
  return { jobs, placements, unscheduled, skipped }
}

// ───────────── formatting ─────────────

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

export function fmt(min: number): string {
  const m = ((min % DAY) + DAY) % DAY
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function parseTime(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
