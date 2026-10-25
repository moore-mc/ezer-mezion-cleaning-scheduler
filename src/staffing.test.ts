import { weekStartOf } from './scheduler'
import { planStaffing } from './staffing'
import { schedule } from './scheduler'
import { seed } from './seed'

const ws = weekStartOf(new Date().toISOString().slice(0, 10))
let fail = 0
for (const site of seed.sites) {
  const d = { ...seed, spaces: seed.spaces.filter((s) => s.siteId === site.id), workers: [] }
  const p = planStaffing(d, ws)
  console.log(site.name, 'min', p.minWorkers, 'peak', p.peak, 'workH', (p.workMin / 60).toFixed(1), 'infeasible', p.infeasible.length, 'of', p.totalJobs)
  p.days.forEach((x) => console.log('  day', x.day, x.blocks.map((b) => `${b.start}-${b.end}x${b.workers}`).join(' ')))
  // sanity: running the real scheduler with `peak` anonymous full-day workers must place everything feasible
  const virt = Array.from({ length: p.minWorkers }, (_, i) => ({ id: `v${i}`, siteId: '', name: 'v', color: '', absences: [], shifts: Array(7).fill({ start: 300, end: 1440 }) }))
  const r = schedule({ ...d, workers: virt }, ws, { pack: true })
  if (r.unscheduled.length !== p.infeasible.length) { fail++; console.error('mismatch') }
}
process.exit(fail ? 1 : 0)
