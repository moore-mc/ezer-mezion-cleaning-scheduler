import { schedule, weekStartOf, fmt, DAY_NAMES, DAY, addDays } from './scheduler'
import { seed } from './seed'

const ws = weekStartOf(new Date().toISOString().slice(0, 10))
let fail = 0
const ok = (c: boolean, m: string) => { if (!c) { fail++; console.error('FAIL', m) } else console.log('ok  ', m) }

ok(weekStartOf(addDays(ws, 3)) === ws, 'weekStartOf')

const r = schedule(seed, ws)
console.log(`jobs=${r.jobs.length} placed=${r.placements.length} unscheduled=${r.unscheduled.length}`)
r.unscheduled.forEach((u) => console.log('  ✗', u.job.id, u.reason))

// no overlaps per worker, within shifts, outside blocked windows
for (const w of seed.workers) {
  const ps = r.placements.filter((p) => p.workerId === w.id).sort((a, b) => a.start - b.start)
  for (let i = 1; i < ps.length; i++) if (ps[i].start < ps[i - 1].end) { fail++; console.error('overlap', w.name) }
  for (const p of ps) {
    const d = Math.floor(p.start / DAY), s = w.shifts[d]
    if (!s || p.start % DAY < s.start || p.end % DAY > s.end) { fail++; console.error('outside shift', w.name, p) }
  }
}
for (const p of r.placements) {
  const job = r.jobs.find((j) => j.id === p.jobId)!
  if (p.start < job.earliest || p.end > job.deadline) { fail++; console.error('window violated', job.id) }
}
ok(true, 'no overlaps / shifts / windows violations above')

// activity jobs satisfied
const act = r.placements.filter((p) => p.jobId.startsWith('a|'))
const actTotal = seed.spaces.reduce((n, sp) => n + sp.activities.length, 0)
ok(act.length + r.unscheduled.filter((u) => u.job.kind === 'activity').length === actTotal, `all ${actTotal} activity jobs accounted for (${act.length} placed)`)

// override: skip + pin
const jid = r.placements[0].jobId
const k = `${ws}|${jid}`
const r2 = schedule({ ...seed, overrides: { [k]: { pin: { workerId: 'w4', start: 3 * DAY + 600 } } } }, ws)
const pp = r2.placements.find((p) => p.jobId === jid)!
ok(pp.pinned && pp.workerId === 'w4' && pp.start === 3 * DAY + 600, 'pin override respected')
const r3 = schedule({ ...seed, overrides: { [k]: { skip: true } } }, ws)
ok(!r3.placements.some((p) => p.jobId === jid) && r3.skipped.length === 1, 'skip override respected')

// closed date removes the day
const r4 = schedule({ ...seed, settings: { ...seed.settings, closedDates: [addDays(ws, 2)] } }, ws)
ok(!r4.placements.some((p) => Math.floor(p.start / DAY) === 2), 'closed date has no work')

for (const p of r.placements.slice(0, 12)) {
  const j = r.jobs.find((x) => x.id === p.jobId)!
  const sp = seed.spaces.find((s) => s.id === j.spaceId)!
  console.log(DAY_NAMES[Math.floor(p.start / DAY)], fmt(p.start), '-', fmt(p.end), seed.workers.find((w) => w.id === p.workerId)!.name, sp.name, j.label)
}
process.exit(fail ? 1 : 0)
