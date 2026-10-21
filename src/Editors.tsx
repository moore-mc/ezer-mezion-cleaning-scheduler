import { useState } from 'react'
import type { AppData, Level, Space, Worker } from './types'
import { DAY_NAMES } from './scheduler'
import { Btn, Card, DaySelect, LevelPill, NumInput, TimeInput, uid } from './ui'

type SetData = (f: (d: AppData) => AppData) => void
const LEVELS: Level[] = [1, 2, 3]
const COLORS = ['#2f7f6f', '#c2703d', '#5b6bbf', '#b5476b', '#7a8f2a', '#2e86a8']

// ───────────── matrix ─────────────

export function MatrixView({ data, setData }: { data: AppData; setData: SetData }) {
  const upd = (typeId: string, lvl: Level, key: 'minutes' | 'perWeek', v: number) =>
    setData((d) => ({
      ...d,
      types: d.types.map((t) => t.id === typeId ? { ...t, matrix: { ...t.matrix, [lvl]: { ...t.matrix[lvl], [key]: v } } } : t),
    }))
  return (
    <Card title="מטריצת סוגי חללים × רמת פעילות"
      actions={<Btn onClick={() => {
        const name = prompt('שם סוג חלל חדש')
        if (!name) return
        setData((d) => ({ ...d, types: [...d.types, { id: uid('t-'), name, matrix: { 1: { minutes: 30, perWeek: 2 }, 2: { minutes: 40, perWeek: 3 }, 3: { minutes: 50, perWeek: 5 } } }] }))
      }}>+ סוג חלל</Btn>}>
      <p className="muted">לכל שילוב של סוג חלל ורמת פעילות (1 = נמוכה, 3 = גבוהה): משך ניקיון בדקות, וכמה פעמים בשבוע. ניתן לעקוף כל ערך בנפרד בכל חלל.</p>
      <div className="table-wrap">
        <table className="matrix">
          <thead>
            <tr><th>סוג חלל</th>{LEVELS.map((l) => <th key={l}><LevelPill level={l} /></th>)}<th /></tr>
          </thead>
          <tbody>
            {data.types.map((t) => (
              <tr key={t.id}>
                <td><input className="inp name" value={t.name} onChange={(e) => setData((d) => ({ ...d, types: d.types.map((x) => x.id === t.id ? { ...x, name: e.target.value } : x) }))} /></td>
                {LEVELS.map((l) => (
                  <td key={l}>
                    <div className="cellgrid">
                      <NumInput value={t.matrix[l].minutes} min={5} onChange={(v) => upd(t.id, l, 'minutes', v)} suffix="דק׳" />
                      <NumInput value={t.matrix[l].perWeek} max={7} onChange={(v) => upd(t.id, l, 'perWeek', v)} suffix="×/שבוע" />
                    </div>
                  </td>
                ))}
                <td>
                  {!data.spaces.some((s) => s.typeId === t.id) &&
                    <Btn kind="danger" onClick={() => setData((d) => ({ ...d, types: d.types.filter((x) => x.id !== t.id) }))}>מחק</Btn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ───────────── spaces ─────────────

export function SpacesView({ data, setData, siteId }: { data: AppData; setData: SetData; siteId: string }) {
  const spaces = data.spaces.filter((s) => s.siteId === siteId)
  const [open, setOpen] = useState<string | null>(spaces[0]?.id ?? null)
  const patch = (id: string, p: Partial<Space>) => setData((d) => ({ ...d, spaces: d.spaces.map((s) => s.id === id ? { ...s, ...p } : s) }))
  const add = () => {
    const id = uid('s-')
    setData((d) => ({ ...d, spaces: [{ id, siteId, name: 'חלל חדש', typeId: d.types[0]?.id ?? '', level: 2, blocked: [], activities: [], events: [] }, ...d.spaces] }))
    setOpen(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return (
    <div className="stack">
      <div className="bar"><h2>חללים ({spaces.length})</h2><Btn kind="primary" onClick={add}>+ הוסף חלל</Btn></div>
      {spaces.map((s) => {
        const type = data.types.find((t) => t.id === s.typeId)
        const cell = type?.matrix[s.level]
        const isOpen = open === s.id
        return (
          <Card key={s.id}>
            <div className="space-h" onClick={() => setOpen(isOpen ? null : s.id)}>
              <div>
                <b>{s.name}</b> <LevelPill level={s.level} />
                <small>{type?.name} · {s.minutesOverride ?? cell?.minutes} דק׳ × {s.perWeekOverride ?? cell?.perWeek} בשבוע · {s.blocked.length} חסימות · {s.activities.length} פעילויות · {s.events.length} אירועים</small>
              </div>
              <span className="chev">{isOpen ? '▲' : '▼'}</span>
            </div>
            {isOpen && (
              <div className="space-body">
                <div className="row wrap">
                  <label>שם<input className="inp" value={s.name} onChange={(e) => patch(s.id, { name: e.target.value })} /></label>
                  <label>סוג חלל
                    <select className="inp" value={s.typeId} onChange={(e) => patch(s.id, { typeId: e.target.value })}>
                      {data.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </label>
                  <label>רמת פעילות
                    <select className="inp" value={s.level} onChange={(e) => patch(s.id, { level: Number(e.target.value) as Level })}>
                      {LEVELS.map((l) => <option key={l} value={l}>רמה {l}</option>)}
                    </select>
                  </label>
                  <label>עקיפת משך<NumInput value={s.minutesOverride ?? 0} onChange={(v) => patch(s.id, { minutesOverride: v || undefined })} suffix="דק׳ (0=מטריצה)" /></label>
                  <label>עקיפת תדירות<NumInput value={s.perWeekOverride ?? 0} max={7} onChange={(v) => patch(s.id, { perWeekOverride: v || undefined })} suffix="×/שבוע (0=מטריצה)" /></label>
                </div>

                <h4>🚫 מגבלות – מתי אי אפשר לנקות <small>(שבועי קבוע)</small></h4>
                {s.blocked.map((b) => (
                  <div className="row wrap item" key={b.id}>
                    <DaySelect value={b.day} onChange={(v) => patch(s.id, { blocked: s.blocked.map((x) => x.id === b.id ? { ...x, day: v } : x) })} />
                    <TimeInput value={b.start} onChange={(v) => patch(s.id, { blocked: s.blocked.map((x) => x.id === b.id ? { ...x, start: v } : x) })} />
                    <span>עד</span>
                    <TimeInput value={b.end} onChange={(v) => patch(s.id, { blocked: s.blocked.map((x) => x.id === b.id ? { ...x, end: v } : x) })} />
                    <input className="inp" placeholder="סיבה" value={b.label} onChange={(e) => patch(s.id, { blocked: s.blocked.map((x) => x.id === b.id ? { ...x, label: e.target.value } : x) })} />
                    <Btn kind="danger" onClick={() => patch(s.id, { blocked: s.blocked.filter((x) => x.id !== b.id) })}>×</Btn>
                  </div>
                ))}
                <Btn onClick={() => patch(s.id, { blocked: [...s.blocked, { id: uid('b-'), day: 0, start: 9 * 60, end: 11 * 60, label: '' }] })}>+ מגבלה</Btn>

                <h4>🔁 פעילויות יומיומיות – חובה לנקות אחריהן</h4>
                {s.activities.map((a) => {
                  const set = (p: Partial<typeof a>) => patch(s.id, { activities: s.activities.map((x) => x.id === a.id ? { ...x, ...p } : x) })
                  return (
                    <div className="row wrap item" key={a.id}>
                      <DaySelect value={a.day} onChange={(v) => set({ day: v })} />
                      <TimeInput value={a.start} onChange={(v) => set({ start: v })} />
                      <span>עד</span>
                      <TimeInput value={a.end} onChange={(v) => set({ end: v })} />
                      <input className="inp" placeholder="שם הפעילות" value={a.label} onChange={(e) => set({ label: e.target.value })} />
                      <label className="inline">לנקות תוך<NumInput value={Math.round(a.withinMin / 60 * 10) / 10} onChange={(v) => set({ withinMin: Math.round(v * 60) })} suffix="שעות" /></label>
                      <Btn kind="danger" onClick={() => patch(s.id, { activities: s.activities.filter((x) => x.id !== a.id) })}>×</Btn>
                    </div>
                  )
                })}
                <Btn onClick={() => patch(s.id, { activities: [...s.activities, { id: uid('a-'), day: 1, start: 18 * 60, end: 21 * 60, label: 'פעילות ערב', withinMin: 720 }] })}>+ פעילות</Btn>

                <h4>📅 אירועים מיוחדים – נעוצים ביומן</h4>
                {s.events.map((ev) => {
                  const set = (p: Partial<typeof ev>) => patch(s.id, { events: s.events.map((x) => x.id === ev.id ? { ...x, ...p } : x) })
                  return (
                    <div className="row wrap item" key={ev.id}>
                      <input className="inp" type="date" value={ev.date} onChange={(e) => set({ date: e.target.value })} />
                      <TimeInput value={ev.start} onChange={(v) => set({ start: v })} />
                      <span>עד</span>
                      <TimeInput value={ev.end} onChange={(v) => set({ end: v })} />
                      <input className="inp" placeholder="שם האירוע" value={ev.label} onChange={(e) => set({ label: e.target.value })} />
                      <label className="inline"><input type="checkbox" checked={ev.cleanBefore} onChange={(e) => set({ cleanBefore: e.target.checked })} /> ניקיון לפני</label>
                      <label className="inline">ניקיון אחרי תוך<NumInput value={Math.round(ev.cleanAfterWithinMin / 60 * 10) / 10} onChange={(v) => set({ cleanAfterWithinMin: Math.round(v * 60) })} suffix="שעות (0=ללא)" /></label>
                      <Btn kind="danger" onClick={() => patch(s.id, { events: s.events.filter((x) => x.id !== ev.id) })}>×</Btn>
                    </div>
                  )
                })}
                <Btn onClick={() => patch(s.id, { events: [...s.events, { id: uid('e-'), date: new Date().toISOString().slice(0, 10), start: 18 * 60, end: 21 * 60, label: 'אירוע', cleanBefore: true, cleanAfterWithinMin: 600 }] })}>+ אירוע</Btn>

                <div className="row end">
                  <Btn kind="danger" onClick={() => confirm(`למחוק את "${s.name}"?`) && setData((d) => ({ ...d, spaces: d.spaces.filter((x) => x.id !== s.id) }))}>מחק חלל</Btn>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

// ───────────── workers ─────────────

export function WorkersView({ data, setData, siteId }: { data: AppData; setData: SetData; siteId: string }) {
  const workers = data.workers.filter((w) => w.siteId === siteId)
  const patch = (id: string, p: Partial<Worker>) => setData((d) => ({ ...d, workers: d.workers.map((w) => w.id === id ? { ...w, ...p } : w) }))
  const [absDate, setAbsDate] = useState('')
  return (
    <div className="stack">
      <div className="bar"><h2>עובדי ניקיון ({workers.length})</h2>
        <Btn kind="primary" onClick={() => setData((d) => ({
          ...d, workers: [{
            id: uid('w-'), siteId, name: 'עובד חדש', color: COLORS[d.workers.length % COLORS.length], absences: [],
            shifts: [{ start: 420, end: 900 }, { start: 420, end: 900 }, { start: 420, end: 900 }, { start: 420, end: 900 }, { start: 420, end: 900 }, null, null],
          }, ...d.workers],
        }))}>+ הוסף עובד</Btn></div>
      {workers.map((w) => (
        <Card key={w.id}>
          <div className="row wrap">
            <input type="color" className="color" value={w.color} onChange={(e) => patch(w.id, { color: e.target.value })} aria-label="צבע" />
            <input className="inp name" value={w.name} onChange={(e) => patch(w.id, { name: e.target.value })} />
            <Btn kind="danger" onClick={() => confirm(`למחוק את ${w.name}?`) && setData((d) => ({ ...d, workers: d.workers.filter((x) => x.id !== w.id) }))}>מחק</Btn>
          </div>
          <div className="shifts">
            {DAY_NAMES.map((n, d) => {
              const s = w.shifts[d]
              const setShift = (v: { start: number; end: number } | null) => patch(w.id, { shifts: w.shifts.map((x, i) => i === d ? v : x) })
              return (
                <div className={`shift-row ${s ? '' : 'off'}`} key={d}>
                  <label className="inline"><input type="checkbox" checked={!!s} onChange={(e) => setShift(e.target.checked ? { start: 7 * 60, end: 15 * 60 } : null)} /> {n}</label>
                  {s ? <><TimeInput value={s.start} onChange={(v) => setShift({ ...s, start: v })} /><span>–</span><TimeInput value={s.end} onChange={(v) => setShift({ ...s, end: v })} /></> : <span className="muted">חופש</span>}
                </div>
              )
            })}
          </div>
          <div className="row wrap">
            <b>היעדרויות:</b>
            {w.absences.map((a) => <span className="chip" key={a}>{a}<button onClick={() => patch(w.id, { absences: w.absences.filter((x) => x !== a) })}>×</button></span>)}
            <input className="inp" type="date" value={absDate} onChange={(e) => setAbsDate(e.target.value)} />
            <Btn onClick={() => { if (absDate && !w.absences.includes(absDate)) { patch(w.id, { absences: [...w.absences, absDate] }); setAbsDate('') } }}>+ היעדרות</Btn>
          </div>
        </Card>
      ))}
    </div>
  )
}

// ───────────── settings + manual jobs ─────────────

export function SettingsView({ data, setData, reset, siteId }: { data: AppData; setData: SetData; reset: () => void; siteId: string }) {
  const st = data.settings
  const [closed, setClosed] = useState('')
  const set = (p: Partial<typeof st>) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } }))
  return (
    <div className="stack">
      <Card title="הגדרות כלליות">
        <div className="row wrap">
          <label>תחילת יום עבודה<TimeInput value={st.dayStart} onChange={(v) => set({ dayStart: v })} /></label>
          <label>סוף יום עבודה<TimeInput value={st.dayEnd} onChange={(v) => set({ dayEnd: v })} /></label>
          <label>מרווח בין משימות<NumInput value={st.buffer} onChange={(v) => set({ buffer: v })} suffix="דק׳" /></label>
        </div>
        <div className="row wrap">
          <b>ימי ניקיון שוטף:</b>
          {DAY_NAMES.map((n, d) => (
            <label className="inline" key={d}>
              <input type="checkbox" checked={st.workDays.includes(d)} onChange={(e) => set({ workDays: e.target.checked ? [...st.workDays, d].sort() : st.workDays.filter((x) => x !== d) })} /> {n}
            </label>
          ))}
        </div>
      </Card>

      <Card title="ימים סגורים (חגים / בחירות)">
        <div className="row wrap">
          {st.closedDates.map((c) => <span className="chip" key={c}>{c}<button onClick={() => set({ closedDates: st.closedDates.filter((x) => x !== c) })}>×</button></span>)}
          <input className="inp" type="date" value={closed} onChange={(e) => setClosed(e.target.value)} />
          <Btn onClick={() => { if (closed && !st.closedDates.includes(closed)) { set({ closedDates: [...st.closedDates, closed].sort() }); setClosed('') } }}>+ יום סגור</Btn>
        </div>
      </Card>

      <ManualJobs data={data} setData={setData} siteId={siteId} />

      <Card title="נתונים">
        <Btn kind="danger" onClick={() => confirm('לאפס את כל הנתונים לדוגמה?') && reset()}>אפס לנתוני דוגמה</Btn>
      </Card>
    </div>
  )
}

function ManualJobs({ data, setData, siteId }: { data: AppData; setData: SetData; siteId: string }) {
  const spaces = data.spaces.filter((s) => s.siteId === siteId)
  const patch = (id: string, p: object) => setData((d) => ({ ...d, manualJobs: d.manualJobs.map((m) => m.id === id ? { ...m, ...p } : m) }))
  return (
    <Card title="משימות חד־פעמיות" actions={<Btn onClick={() => spaces[0] && setData((d) => ({
      ...d, manualJobs: [...d.manualJobs, { id: uid('m-'), spaceId: spaces[0].id, label: 'ניקיון מיוחד', duration: 45, date: new Date().toISOString().slice(0, 10), from: 7 * 60, to: 15 * 60 }],
    }))}>+ משימה</Btn>}>
      {data.manualJobs.filter((m) => spaces.some((s) => s.id === m.spaceId)).length === 0 && <p className="muted">משימות שאינן נגזרות מהמטריצה (למשל: ניקוי אחרי תקלה).</p>}
      {data.manualJobs.filter((m) => spaces.some((s) => s.id === m.spaceId)).map((m) => (
        <div className="row wrap item" key={m.id}>
          <select className="inp" value={m.spaceId} onChange={(e) => patch(m.id, { spaceId: e.target.value })}>
            {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="inp" value={m.label} onChange={(e) => patch(m.id, { label: e.target.value })} />
          <input className="inp" type="date" value={m.date} onChange={(e) => patch(m.id, { date: e.target.value })} />
          <TimeInput value={m.from} onChange={(v) => patch(m.id, { from: v })} /><span>עד</span><TimeInput value={m.to} onChange={(v) => patch(m.id, { to: v })} />
          <NumInput value={m.duration} min={5} onChange={(v) => patch(m.id, { duration: v })} suffix="דק׳" />
          <Btn kind="danger" onClick={() => setData((d) => ({ ...d, manualJobs: d.manualJobs.filter((x) => x.id !== m.id) }))}>×</Btn>
        </div>
      ))}
    </Card>
  )
}
