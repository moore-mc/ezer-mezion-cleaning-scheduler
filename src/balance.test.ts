import { schedule, weekStartOf } from './scheduler'
import { planStaffing } from './staffing'
import { seed } from './seed'
const ws = weekStartOf(new Date().toISOString().slice(0, 10))
for (const site of seed.sites) {
  const d = { ...seed, spaces: seed.spaces.filter((s) => s.siteId === site.id), workers: seed.workers.filter((w) => w.siteId === site.id) }
  const r = schedule(d, ws)
  const p = planStaffing(d, ws)
  console.log(site.name, `spaces ${d.spaces.length} placed ${r.placements.length}/${r.jobs.length}`, `| need peak ${p.peak}, ${(p.workMin / 60).toFixed(1)}h/week, have ${d.workers.length}`)
  for (const w of d.workers) console.log('  ', w.name, (r.placements.filter((x) => x.workerId === w.id).reduce((a, x) => a + x.end - x.start, 0) / 60).toFixed(1), 'h')
  r.unscheduled.slice(0, 3).forEach((u) => console.log('   ✗', u.job.id, u.reason))
}
