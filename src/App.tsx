import { useMemo, useState } from 'react'
import type { Override } from './types'
import { addDays, floorMoves, overrideKey, schedule, weekStartOf } from './scheduler'
import { useData } from './store'
import ScheduleView from './ScheduleView'
import PrintView from './PrintView'
import StaffingView from './StaffingView'
import { MatrixView, SettingsView, SpacesView, WorkersView } from './Editors'

const TABS = [
  { id: 'schedule', label: 'לוח שבועי' },
  { id: 'staffing', label: 'כמה עובדים צריך' },
  { id: 'spaces', label: 'חללים' },
  { id: 'matrix', label: 'מטריצה' },
  { id: 'workers', label: 'עובדים' },
  { id: 'settings', label: 'הגדרות' },
] as const

export default function App() {
  const { data, setData, reset } = useData()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('schedule')
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date().toISOString().slice(0, 10)))

  const [siteId, setSiteId] = useState(() => {
    let id = ''
    try { id = localStorage.getItem('ezer-site') ?? '' } catch { /* ignore */ }
    return data.sites.some((x) => x.id === id) ? id : data.sites[0].id
  })
  const changeSite = (id: string) => { setSiteId(id); try { localStorage.setItem('ezer-site', id) } catch { /* ignore */ } }
  const siteData = useMemo(() => {
    const spaces = data.spaces.filter((s) => s.siteId === siteId)
    return {
      ...data, spaces,
      workers: data.workers.filter((w) => w.siteId === siteId),
      manualJobs: data.manualJobs.filter((m) => spaces.some((s) => s.id === m.spaceId)),
    }
  }, [data, siteId])
  const result = useMemo(() => schedule(siteData, weekStart), [siteData, weekStart])

  const setOverride = (jobId: string, o: Override | null) =>
    setData((d) => {
      const overrides = { ...d.overrides }
      const k = overrideKey(weekStart, jobId)
      if (o === null) delete overrides[k]
      else overrides[k] = o
      return { ...d, overrides }
    })

  const moves = floorMoves(result, siteData).total
  const multiFloor = (data.sites.find((x) => x.id === siteId)?.floors.length ?? 1) > 1
  const total = result.jobs.length
  const placed = result.placements.length
  const warns = result.placements.filter((p) => p.warnings.length).length
  const minutes = result.placements.reduce((s, p) => s + (p.end - p.start), 0)
  const end = addDays(weekStart, 6)
  const fmtD = (iso: string) => `${iso.slice(8)}.${iso.slice(5, 7)}`

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo">✦</span>
          <div><h1>אופטימיזציית לו״ז ניקיון</h1><small>עזר מציון</small></div>
          <select className="site-select" value={siteId} onChange={(e) => changeSite(e.target.value)} aria-label="בחירת סניף">
            {data.sites.map((x) => <option key={x.id} value={x.id}>📍 {x.name}</option>)}
          </select>
        </div>
        <nav className="tabs">
          {TABS.map((t) => <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </nav>
      </header>

      <main>
        {tab === 'schedule' && (
          <>
            <div className="weekbar">
              <div className="weeknav">
                <button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="שבוע קודם">‹</button>
                <b>שבוע {fmtD(weekStart)} – {fmtD(end)}</b>
                <button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="שבוע הבא">›</button>
                <button className="pdf" onClick={() => window.print()}>⤓ ייצוא PDF</button>
                <button className="today" onClick={() => setWeekStart(weekStartOf(new Date().toISOString().slice(0, 10)))}>השבוע</button>
              </div>
              <div className="kpis">
                <div className="kpi"><b>{total ? Math.round((placed / total) * 100) : 100}%</b><span>שובצו ({placed}/{total})</span></div>
                <div className={`kpi ${result.unscheduled.length ? 'bad' : ''}`}><b>{result.unscheduled.length}</b><span>ללא שיבוץ</span></div>
                <div className={`kpi ${warns ? 'warn' : ''}`}><b>{warns}</b><span>אזהרות עקיפה</span></div>
                <div className="kpi"><b>{(minutes / 60).toFixed(1)}</b><span>שעות ניקיון</span></div>
                {multiFloor && <div className="kpi"><b>{moves}</b><span>מעברי קומה בשבוע</span></div>}
              </div>
            </div>
            <PrintView data={siteData} siteName={data.sites.find((x) => x.id === siteId)?.name ?? ''} weekStart={weekStart} result={result} />
            <ScheduleView siteId={siteId} data={siteData} weekStart={weekStart} result={result} setOverride={setOverride} />
          </>
        )}
        {tab === 'staffing' && (
          <>
            <div className="weekbar">
              <div className="weeknav">
                <button onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="שבוע קודם">‹</button>
                <b>שבוע {fmtD(weekStart)} – {fmtD(end)}</b>
                <button onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="שבוע הבא">›</button>
              </div>
            </div>
            <StaffingView data={siteData} weekStart={weekStart} siteName={data.sites.find((x) => x.id === siteId)?.name ?? ''} />
          </>
        )}
        {tab === 'spaces' && <SpacesView data={data} setData={setData} siteId={siteId} />}
        {tab === 'matrix' && <MatrixView data={data} setData={setData} />}
        {tab === 'workers' && <WorkersView data={data} setData={setData} siteId={siteId} />}
        {tab === 'settings' && <SettingsView data={data} setData={setData} reset={reset} siteId={siteId} />}
      </main>
      <footer>כל שינוי בנתונים מחשב את הלו״ז מחדש אוטומטית · הנתונים נשמרים בדפדפן</footer>
    </div>
  )
}
