import type { AppData, Job } from './types'
import { DAY, schedule } from './scheduler'

/** Planning window in which a new cleaner could be asked to work. */
export const PLAN_START = 5 * 60
export const PLAN_END = 24 * 60
const MAX_WORKERS = 20
const BLOCK_GAP = 120 // gaps shorter than this keep two jobs in the same shift block

export interface ShiftBlock {
  start: number // minutes in day
  end: number
  workers: number // peak concurrent cleaners in the block
  workMin: number // cleaning minutes inside the block
}

export interface DayPlan {
  day: number
  blocks: ShiftBlock[]
  peak: number
  workMin: number
  /** cleaners needed per hour 0..23, for the heat strip */
  hourly: number[]
}

export interface StaffingPlan {
  /** Minimum number of distinct cleaners able to cover everything (jobs may be anywhere in the planning window). */
  minWorkers: number
  peak: number
  workMin: number
  presenceMin: number
  days: DayPlan[]
  infeasible: { job: Job; reason: string }[]
  totalJobs: number
}

export function planStaffing(data: AppData, weekStart: string): StaffingPlan {
  // Only "skip" and "duration" overrides matter; pins refer to real workers.
  const overrides: AppData['overrides'] = {}
  for (const [k, o] of Object.entries(data.overrides)) {
    if (o.skip || o.duration) overrides[k] = { skip: o.skip, duration: o.duration }
  }
  const virtual = (n: number) => Array.from({ length: n }, (_, i) => ({
    id: `v${i + 1}`, siteId: '', name: `עובד ${i + 1}`, color: '#888', absences: [],
    shifts: Array.from({ length: 7 }, () => ({ start: PLAN_START, end: PLAN_END })),
  }))

  let best = schedule({ ...data, workers: virtual(1), overrides }, weekStart, { pack: true })
  let bestN = 1
  for (let n = 2; n <= MAX_WORKERS && best.unscheduled.length > 0; n++) {
    const r = schedule({ ...data, workers: virtual(n), overrides }, weekStart, { pack: true })
    if (r.unscheduled.length < best.unscheduled.length) { best = r; bestN = n }
    else if (n - bestN >= 3) break // more people no longer help: the rest is blocked by constraints
  }

  const days: DayPlan[] = []
  for (let d = 0; d < 7; d++) {
    const ivs = best.placements
      .filter((p) => Math.floor(p.start / DAY) === d)
      .map((p) => [p.start - d * DAY, p.end - d * DAY] as [number, number])
      .sort((a, b) => a[0] - b[0])
    if (!ivs.length) { days.push({ day: d, blocks: [], peak: 0, workMin: 0, hourly: Array(24).fill(0) }); continue }

    const groups: [number, number][][] = []
    for (const iv of ivs) {
      const g = groups[groups.length - 1]
      if (g && iv[0] - Math.max(...g.map((x) => x[1])) < BLOCK_GAP) g.push(iv)
      else groups.push([iv])
    }
    const blocks: ShiftBlock[] = groups.map((g) => ({
      start: Math.min(...g.map((x) => x[0])),
      end: Math.max(...g.map((x) => x[1])),
      workers: peakOf(g),
      workMin: g.reduce((a, x) => a + x[1] - x[0], 0),
    }))
    const hourly = Array.from({ length: 24 }, (_, h) => peakOf(ivs.filter((x) => x[0] < (h + 1) * 60 && x[1] > h * 60)))
    days.push({
      day: d, blocks, hourly,
      peak: Math.max(...blocks.map((b) => b.workers)),
      workMin: blocks.reduce((a, b) => a + b.workMin, 0),
    })
  }

  return {
    minWorkers: bestN,
    peak: Math.max(0, ...days.map((d) => d.peak)),
    workMin: days.reduce((a, d) => a + d.workMin, 0),
    presenceMin: days.reduce((a, d) => a + d.blocks.reduce((s, b) => s + (b.end - b.start) * b.workers, 0), 0),
    days,
    infeasible: best.unscheduled.map((u) => ({ job: u.job, reason: u.reason })),
    totalJobs: best.jobs.length,
  }
}

/** Max number of simultaneously running intervals. */
function peakOf(ivs: [number, number][]): number {
  const ev = ivs.flatMap(([s, e]) => [[s, 1], [e, -1]] as [number, number][]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let cur = 0, peak = 0
  for (const [, d] of ev) { cur += d; peak = Math.max(peak, cur) }
  return peak
}
