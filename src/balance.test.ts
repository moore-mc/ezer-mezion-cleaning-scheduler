import { schedule, weekStartOf } from './scheduler'
import { seed } from './seed'
const ws = weekStartOf(new Date().toISOString().slice(0, 10))
for (const site of seed.sites) {
  const d = { ...seed, spaces: seed.spaces.filter((s) => s.siteId === site.id), workers: seed.workers.filter((w) => w.siteId === site.id) }
  const r = schedule(d, ws)
  console.log(site.name, `placed ${r.placements.length}/${r.jobs.length}`)
  for (const w of d.workers) console.log('  ', w.name, (r.placements.filter((p) => p.workerId === w.id).reduce((a, p) => a + p.end - p.start, 0) / 60).toFixed(1), 'h')
  r.unscheduled.forEach((u) => console.log('   ✗', u.job.id, u.reason))
}
