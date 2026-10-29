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
  /** Minutes for one cleaning round of the daily list. */
  minutes: number
  /** How many rounds of the daily list per working day. */
  roundsPerDay: number
}

export interface TaskLists {
  daily: string[]
  weekly: string[]
  monthly: string[]
  yearly: string[]
}

export interface SpaceType {
  id: string
  name: string
  matrix: Record<Level, MatrixCell>
  /** Minutes for the once-a-week list / once-a-month list (0 = none). */
  weeklyMin: number
  monthlyMin: number
  /** How many times a week the weekly list is done (default 1). */
  weeklyTimes?: number
  /** How many times in 4 weeks the monthly list is done: 1, 2 or 4 (default 1). */
  monthlyTimes?: number
  tasks?: TaskLists
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

export interface SiteRule {
  id: string
  label: string
  days: number[]
  start: number
  end: number
  /** all = every space; except = every space but `spaceIds`; only = just `spaceIds` */
  mode: 'all' | 'except' | 'only'
  spaceIds: string[]
}

export interface FreqRule {
  id: string
  label: string
  mode: 'all' | 'except' | 'only'
  spaceIds: string[]
  /** The daily cleaning is done this many times a week (spread over the working days) instead of every day. */
  timesPerWeek: number
}

export interface Site {
  id: string
  name: string
  /** Opening hours: repeated cleaning rounds (activity level 2-3) are spread inside them. Default: whole working day. */
  hours?: { start: number; end: number }
  /** Site-wide hour constraints: windows in which cleaning is not allowed, for all / some spaces of the site. */
  rules?: SiteRule[]
  /** Site-wide cleaning frequency (times a week) for all / some spaces. */
  freqRules?: FreqRule[]
}

export interface Space {
  id: string
  siteId: string
  name: string
  typeId: string
  level: Level
  /** Optional per-space overrides of the matrix cell (rounds per day / minutes per round). */
  minutesOverride?: number
  roundsOverride?: number
  /** Daily cleaning only this many times a week (overrides the site rule). */
  timesPerWeek?: number
  /** Preferred part of the day for once-a-day / weekly cleans: before 12:00 or after 12:00. */
  slot?: 'morning' | 'evening'
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
  /** Friday ends earlier (before Shabbat). */
  fridayEnd: number
  /** Minutes between consecutive jobs of the same worker (travel / equipment). */
  buffer: number
  /** Presence beyond this many hours a day / week triggers an overtime warning (standard Israeli day = 8h, week = 42h). */
  maxDailyHours: number
  maxWeeklyHours: number
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
