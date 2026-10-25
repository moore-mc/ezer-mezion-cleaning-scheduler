import type { AppData, ScheduleResult } from './types'
import { DAY, DAY_NAMES, addDays, fmt } from './scheduler'

export default function PrintView({ data, weekStart, result, siteName }: { siteName: string; data: AppData; weekStart: string; result: ScheduleResult }) {
  const job = new Map(result.jobs.map((j) => [j.id, j]))
  const space = (id: string) => {
    const sp = data.spaces.find((s) => s.id === id)
    const site = data.sites.find((x) => x.id === sp?.siteId)
    return `${sp?.name ?? ''}${site && site.floors.length > 1 ? ` (${site.floors[sp?.floor ?? 0]})` : ''}`
  }
  const date = (d: number) => { const iso = addDays(weekStart, d); return `${iso.slice(8)}/${iso.slice(5, 7)}` }
  return (
    <div className="print-only">
      <h1>עזר מציון – {siteName} – לו״ז ניקיון שבועי · {date(0)} – {date(6)}</h1>
      {DAY_NAMES.map((n, d) => {
        const closed = data.settings.closedDates.includes(addDays(weekStart, d))
        const rows = data.workers.map((w) => ({ w, ps: result.placements.filter((p) => p.workerId === w.id && Math.floor(p.start / DAY) === d) }))
        if (!closed && rows.every((r) => r.ps.length === 0)) return null
        return (
          <div className="print-day" key={d}>
            <h3>יום {n} · {date(d)}{closed && ' · סגור'}</h3>
            {!closed && (
              <table><tbody>
                {rows.filter((r) => r.ps.length).map(({ w, ps }) => (
                  <tr key={w.id}><th>{w.name}</th><td>{ps.map((p) => (
                    <div key={p.jobId}><b className="ltr">{fmt(p.start)}–{fmt(p.end)}</b> · {space(job.get(p.jobId)!.spaceId)} · {job.get(p.jobId)!.label}{p.pinned && ' 📌'}</div>
                  ))}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
        )
      })}
      {result.unscheduled.length > 0 && (
        <div className="print-day"><h3>משימות ללא שיבוץ</h3><table><tbody>
          {result.unscheduled.map(({ job: j, reason }) => (
            <tr key={j.id}><th>{DAY_NAMES[Math.floor(j.earliest / DAY)]}</th><td>{space(j.spaceId)} · {j.label} – {reason}</td></tr>
          ))}
        </tbody></table></div>
      )}
    </div>
  )
}
