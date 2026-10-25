import type {
  AppData, Job, Override, Placement, ScheduleResult, Space, Unscheduled, Worker,
} from './types'

export const DAY = 1440
export const WEEK = DAY * 7
const STEP = 5

type Interval = [number, number]

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

const overlaps = (a: Interval, b: Interval, pad = 0) => a[0] < b[1] + pad && a[1] + pad > b[0]

function cellOf(data: AppData, space: Space) {
  const type = data.types.find((t) => t.id === space.typeId)
  const base = type?.matrix[space.level] ?? { minutes: 30, roundsPerDay: 1 }
  return {
    minutes: space.minutesOverride ?? base.minutes,
    rounds: space.roundsOverride ?? base.roundsPerDay,
    weeklyMin: type?.weeklyMin ?? 0,
    monthlyMin: type?.monthlyMin ?? 0,
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
    if (cell.minutes > 0 && cell.rounds > 0) {
      for (const day of openDays) {
        const dayEnd = endOf(day)
        const slot = (dayEnd - dayStart) / cell.rounds
        for (let i = 0; i < cell.rounds; i++) {
          jobs.push({
            id: `r|${space.id}|${day}|${i}`,
            spaceId: space.id,
            kind: 'routine',
            label: cell.rounds > 1 ? `סבב ${i + 1}/${cell.rounds}` : 'ניקיון יומי',
            duration: cell.minutes,
            earliest: day * DAY + (cell.rounds === 1 ? pick(day, dayStart, dayEnd)[0] : Math.round(dayStart + i * slot)),
            deadline: day * DAY + (cell.rounds === 1 ? pick(day, dayStart, dayEnd)[1] : Math.round(dayStart + (i + 1) * slot)),
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
        const day = openDays[h % openDays.length]
        jobs.push({ id: `w|${space.id}`, spaceId: space.id, kind: 'routine', label: 'ניקיון שבועי', duration: cell.weeklyMin,
          earliest: day * DAY + pick(day, dayStart, endOf(day))[0], deadline: day * DAY + pick(day, dayStart, endOf(day))[1], priority: 8 })
      }
      if (cell.monthlyMin > 0 && (weekNo + h) % 4 === 0) {
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

function blockedFor(space: Space | undefined, weekStart: string): Interval[] {
  if (!space) return []
  const out: Interval[] = []
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
  busy: Interval[]
  load: number[] // minutes assigned per day
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

// ───────────── main ─────────────

/** `pack` = ignore workload balancing and always take the earliest slot (used for staffing estimates). */
export function schedule(data: AppData, weekStart: string, opts: { pack?: boolean } = {}): ScheduleResult {
  const allJobs = generateJobs(data, weekStart)
  const spaceById = new Map(data.spaces.map((s) => [s.id, s]))
  const ovr = (id: string): Override | undefined => data.overrides[overrideKey(weekStart, id)]

  const skipped: Job[] = []
  const jobs: Job[] = []
  for (const j of allJobs) {
    const o = ovr(j.id)
    if (o?.skip) { skipped.push(j); continue }
    jobs.push(o?.duration ? { ...j, duration: o.duration } : j)
  }

  const states: WorkerState[] = data.workers.map((w) => ({
    worker: w, shifts: shiftsFor(w, data, weekStart), busy: [], load: Array(7).fill(0),
  }))
  const stateById = new Map(states.map((s) => [s.worker.id, s]))
  const place = (st: WorkerState, job: Job, start: number) => {
    st.busy.push([start, start + job.duration])
    st.load[Math.min(6, Math.floor(start / DAY))] += job.duration
  }

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
    if (blockedFor(spaceById.get(job.spaceId), weekStart).some((b) => overlaps(iv, b))) warnings.push('החלל חסום לניקיון בשעה זו')
    if (st.busy.some((b) => overlaps(iv, b, 0))) warnings.push('חפיפה עם משימה אחרת של העובד')
    if (iv[0] < job.earliest || iv[1] > job.deadline) warnings.push('מחוץ לחלון הזמן הנדרש')
    place(st, job, pin.start)
    placements.push({ jobId: job.id, workerId: st.worker.id, start: pin.start, end: iv[1], pinned: true, warnings })
  }

  // Greedy earliest-deadline-first: tightest windows first, then highest priority.
  auto.sort((a, b) =>
    (a.deadline - a.earliest - a.duration) - (b.deadline - b.earliest - b.duration) ||
    b.priority - a.priority || a.earliest - b.earliest)

  for (const job of auto) {
    const blocked = blockedFor(spaceById.get(job.spaceId), weekStart)
    let best: { st: WorkerState; t: number; cost: number } | null = null
    for (const st of states) {
      const t = findStart(st, job, blocked, buffer)
      if (t === null) continue
      const dayLoad = st.load[Math.min(6, Math.floor(t / DAY))]
      const weekLoad = st.load.reduce((a, b) => a + b, 0)
      // pack = first-fit: fill the lowest-numbered worker first so the headcount stays minimal
      const cost = opts.pack
        ? states.indexOf(st) * 1e6 + t
        : (t - job.earliest) * 0.25 + dayLoad * 0.6 + weekLoad * 0.5 // earlier start + balanced workload (day & week)
      if (!best || cost < best.cost) best = { st, t, cost }
    }
    if (!best) { unscheduled.push({ job, reason: diagnose(states, job, blocked, buffer) }); continue }
    place(best.st, job, best.t)
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
