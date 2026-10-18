import { addDays, weekStartOf, toISO } from './scheduler'
import type { AppData, Level, MatrixCell, SpaceType, Worker } from './types'

const h = (hh: number, mm = 0) => hh * 60 + mm
const cells = (a: [number, number], b: [number, number], c: [number, number]): Record<Level, MatrixCell> => ({
  1: { minutes: a[0], perWeek: a[1] },
  2: { minutes: b[0], perWeek: b[1] },
  3: { minutes: c[0], perWeek: c[1] },
})

const types: SpaceType[] = [
  { id: 't-office', name: 'משרדים', matrix: cells([30, 2], [40, 3], [45, 5]) },
  { id: 't-hall', name: 'אולם / מועדונית', matrix: cells([45, 2], [60, 3], [90, 5]) },
  { id: 't-wc', name: 'שירותים', matrix: cells([20, 3], [25, 5], [30, 6]) },
  { id: 't-reception', name: 'עמדת קבלת קהל', matrix: cells([20, 3], [30, 5], [40, 6]) },
  { id: 't-cold', name: 'חדר קירור / ציוד', matrix: cells([25, 1], [30, 2], [40, 3]) },
  { id: 't-clinic', name: 'חדר טיפול / מרפאה', matrix: cells([25, 3], [35, 5], [45, 6]) },
  { id: 't-lobby', name: 'לובי ומסדרונות', matrix: cells([20, 2], [30, 4], [40, 6]) },
  { id: 't-kitchen', name: 'מטבח / חדר אוכל', matrix: cells([30, 3], [45, 5], [60, 6]) },
]

type Shift = { start: number; end: number } | null
const w = (id: string, siteId: string, name: string, color: string, start: number, end: number, fri: Shift): Worker => ({
  id, siteId, name, color, absences: [],
  shifts: [{ start, end }, { start, end }, { start, end }, { start, end }, { start, end }, fri, null],
})

const workers: Worker[] = [
  w('w1', 'pt', 'רונית', '#2f7f6f', h(6), h(14), { start: h(6), end: h(13) }),
  w('w2', 'pt', 'יוסי', '#c2703d', h(14), h(22, 30), null),
  w('w4', 'gt', 'דנה', '#b5476b', h(15), h(23), null),
  w('w7', 'gt', 'אבי', '#7a8f2a', h(7), h(15), { start: h(7), end: h(12) }),
  w('w5', 'rg', 'שרה', '#2e86a8', h(7), h(15), { start: h(7), end: h(12) }),
  w('w6', 'rg', 'חנן', '#8a6bbf', h(13), h(21), null),
  w('w3', 'pt', 'מרים', '#5b6bbf', h(8), h(16), { start: h(7), end: h(13) }),
]

export const seed: AppData = {
  sites: [
    { id: 'pt', name: 'פתח תקווה' },
    { id: 'gt', name: 'גוטמן / מעון שיקומי' },
    { id: 'rg', name: 'רמת גן' },
  ],
  settings: { dayStart: h(6), dayEnd: h(22), buffer: 5, workDays: [0, 1, 2, 3, 4, 5], closedDates: [] },
  types,
  workers,
  manualJobs: [],
  overrides: {},
  spaces: [
    {
      id: 's1', siteId: 'pt', name: 'מועדונית', typeId: 't-hall', level: 3,
      blocked: [{ id: 'b1', day: 1, start: h(10), end: h(12), label: 'שיעור קבוע' }],
      activities: [
        { id: 'a1', day: 1, start: h(18), end: h(21), label: 'חוג ערב', withinMin: 12 * 60 },
        { id: 'a2', day: 3, start: h(18), end: h(21), label: 'חוג ערב', withinMin: 12 * 60 },
        { id: 'a3', day: 5, start: h(8), end: h(11), label: 'קבלת שבת', withinMin: 3 * 60 },
      ],
      events: [
        { id: 'ev1', date: addDays(weekStartOf(toISO(new Date())), 4), start: h(19), end: h(22), label: 'אירוע התרמה', cleanBefore: true, cleanAfterWithinMin: 10 * 60 },
      ],
    },
    {
      id: 's2', siteId: 'pt', name: 'משרדים – קומה א׳', typeId: 't-office', level: 2,
      blocked: [0, 1, 2, 3, 4].map((d) => ({ id: `b2-${d}`, day: d, start: h(9), end: h(11), label: 'ישיבות צוות' })),
      activities: [], events: [],
    },
    {
      id: 's8', siteId: 'gt', name: 'אולם אירועים', typeId: 't-hall', level: 3,
      blocked: [{ id: 'b8', day: 0, start: h(8), end: h(10), label: 'הצבת ציוד' }],
      activities: [
        { id: 'a8', day: 0, start: h(19), end: h(22), label: 'הרצאת ערב', withinMin: 11 * 60 },
        { id: 'a9', day: 4, start: h(19), end: h(22, 30), label: 'מפגש קהילה', withinMin: 12 * 60 },
        { id: 'a10', day: 5, start: h(9), end: h(12), label: 'שיעור שישי בבוקר', withinMin: 90 },
      ],
      events: [],
    },
    { id: 's9', siteId: 'gt', name: 'חדר טיפול 1', typeId: 't-clinic', level: 3, blocked: [0, 1, 2, 3].map((d) => ({ id: `b9-${d}`, day: d, start: h(10), end: h(13), label: 'קבלת מטופלים' })), activities: [], events: [] },
    { id: 's10', siteId: 'gt', name: 'חדר טיפול 2', typeId: 't-clinic', level: 2, blocked: [{ id: 'b10', day: 2, start: h(8), end: h(12), label: 'קבלת מטופלים' }], activities: [], events: [] },
    { id: 's11', siteId: 'rg', name: 'לובי כניסה', typeId: 't-lobby', level: 3, blocked: [], activities: [], events: [] },
    { id: 's12', siteId: 'rg', name: 'מסדרון קומה ב׳', typeId: 't-lobby', level: 1, blocked: [], activities: [], events: [] },
    { id: 's13', siteId: 'rg', name: 'שירותים – קומה ב׳', typeId: 't-wc', level: 2, blocked: [], activities: [], events: [] },
    { id: 's3', siteId: 'pt', name: 'עמדת קבלת קהל', typeId: 't-reception', level: 3, blocked: [], activities: [], events: [] },
    { id: 's4', siteId: 'pt', name: 'שירותים – כניסה', typeId: 't-wc', level: 3, blocked: [], activities: [], events: [] },
    { id: 's5', siteId: 'pt', name: 'חדר השאלת ציוד', typeId: 't-cold', level: 1, blocked: [], activities: [], events: [] },
    { id: 's6', siteId: 'pt', name: 'חדר קירור', typeId: 't-cold', level: 2, blocked: [{ id: 'b6', day: 2, start: h(8), end: h(12), label: 'קבלת סחורה' }], activities: [], events: [] },
    {
      id: 's7', siteId: 'pt', name: 'חדר אוכל', typeId: 't-kitchen', level: 2, blocked: [],
      activities: [{ id: 'a7', day: 2, start: h(19), end: h(21, 30), label: 'ארוחת תמיכה', withinMin: 90 }],
      events: [],
    },
  ],
}
