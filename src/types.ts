export type Level = 1 | 2 | 3

/** Minutes are "minutes since midnight" within a day; day is 0=Sunday … 6=Saturday. */
export interface TimeWindow {
  id: string
  day: number
  start: number
  end: number
  label: string
}

/** Cell of the matrix: how long and how often a space of this type / level is cleaned. */
export interface MatrixCell {
  minutes: number
  perWeek: number
}

export interface SpaceType {
  id: string
  name: string
  matrix: Record<Level, MatrixCell>
}

/** Daily activity in a space; the space must be cleaned after it ends. */
export interface Activity extends TimeWindow {
  /** Cleaning must be finished within this many minutes after the activity ends. */
  withinMin: number
}

/** One-off event pinned to a calendar date. */
export interface SpecialEvent {
  id: string
  date: string // YYYY-MM-DD
  start: number
  end: number
  label: string
  /** Clean must finish before the event starts (0 = no pre-clean). */
  cleanBefore: boolean
  /** Clean must finish within N minutes after the event ends (0 = no post-clean). */
  cleanAfterWithinMin: number
}

export interface Site {
  id: string
  name: string
}

export interface Space {
  id: string
  siteId: string
  name: string
  typeId: string
  level: Level
  /** Optional per-space overrides of the matrix cell. */
  minutesOverride?: number
  perWeekOverride?: number
  /** Recurring weekly windows in which cleaning is impossible. */
  blocked: TimeWindow[]
  activities: Activity[]
  events: SpecialEvent[]
}

export interface Worker {
  id: string
  siteId: string
  name: string
  color: string
  /** Shift per day (index 0..6), null = off. */
  shifts: ({ start: number; end: number } | null)[]
  /** Dates (YYYY-MM-DD) on which the worker is absent. */
  absences: string[]
}

export interface ManualJob {
  id: string
  spaceId: string
  label: string
  duration: number
  date: string
  from: number
  to: number
}

export interface Override {
  skip?: boolean
  pin?: { workerId: string; start: number } // start = absolute minutes from week start
  duration?: number
}

export interface Settings {
  dayStart: number
  dayEnd: number
  /** Minutes between consecutive jobs of the same worker (travel / equipment). */
  buffer: number
  workDays: number[]
  /** Dates with no work at all (holidays, election days). */
  closedDates: string[]
}

export interface AppData {
  sites: Site[]
  settings: Settings
  types: SpaceType[]
  spaces: Space[]
  workers: Worker[]
  manualJobs: ManualJob[]
  /** key = `${weekStart}|${jobId}` */
  overrides: Record<string, Override>
}

export type JobKind = 'routine' | 'activity' | 'event' | 'manual'

export interface Job {
  id: string
  spaceId: string
  kind: JobKind
  label: string
  duration: number
  /** Absolute minutes from week start (Sunday 00:00). */
  earliest: number
  deadline: number
  priority: number
}

export interface Placement {
  jobId: string
  workerId: string
  start: number
  end: number
  pinned: boolean
  warnings: string[]
}

export interface Unscheduled {
  job: Job
  reason: string
}

export interface ScheduleResult {
  jobs: Job[]
  placements: Placement[]
  unscheduled: Unscheduled[]
  skipped: Job[]
}
