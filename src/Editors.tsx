import { Fragment, useEffect, useState } from 'react'
import type { AppData, FreqRule, Level, SiteRule, Space, SpaceType, Worker } from './types'
import { DAY_NAMES, spaceMinutes } from './scheduler'
import { Btn, Card, DaySelect, LevelPill, Modal, NumInput, TimeInput, uid } from './ui'

type SetData = (f: (d: AppData) => AppData) => void
const LEVELS: Level[] = [1, 2, 3]
const COLORS = ['#2f7f6f', '#c2703d', '#5b6bbf', '#b5476b', '#7a8f2a', '#2e86a8']

// ───────────── matrix ─────────────

/** Monthly list frequency presets, in weeks. */
export const EVERY_PRESETS = [
  { w: 1, label: 'כל שבוע' },
  { w: 2, label: 'כל שבועיים' },
  { w: 4, label: 'פעם בחודש' },
  { w: 8, label: 'פעם בחודשיים' },
  { w: 13, label: 'פעם ב-3 חודשים' },
  { w: 26, label: 'פעם בחצי שנה' },
  { w: 52, label: 'פעם בשנה' },
]

const LIST_KEYS = [
  { k: 'daily', label: 'יומי' },
  { k: 'weekly', label: 'שבועי' },
  { k: 'monthly', label: 'חודשי' },
  { k: 'yearly', label: 'שנתי (לעיון בלבד)' },
] as const

export function MatrixView({ data, setData }: { data: AppData; setData: SetData }) {
  // edits are kept as a draft until "שמור" is pressed, so the schedule is not recalculated on every keystroke
  const [draft, setDraft] = useState<SpaceType[]>(data.types)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  useEffect(() => { setDraft(data.types) }, [data.types])
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.types)
  const save = () => { setData((d) => ({ ...d, types: draft })); setSavedAt(Date.now()) }
  const patchType = (id: string, f: (t: SpaceType) => SpaceType) => {
    setSavedAt(null)
    setDraft((ts) => ts.map((t) => t.id === id ? f(t) : t))
  }
  const upd = (typeId: string, lvl: Level, key: 'minutes' | 'roundsPerDay', v: number) =>
    patchType(typeId, (t) => ({ ...t, matrix: { ...t.matrix, [lvl]: { ...t.matrix[lvl], [key]: v } } }))
  const setList = (typeId: string, k: (typeof LIST_KEYS)[number]['k'], text: string) =>
    patchType(typeId, (t) => ({
      ...t,
      tasks: { daily: [], weekly: [], monthly: [], yearly: [], ...t.tasks, [k]: text.split('\n').map((x) => x.trim()).filter(Boolean) },
    }))
  return (
    <Card title="מטריצת ניקיון – סוגי חללים"
      actions={<div className="row wrap">
        {dirty ? <small className="bad">יש שינויים שלא נשמרו</small> : savedAt ? <small className="ok-note">✓ נשמר</small> : null}
        {dirty && <Btn onClick={() => setDraft(data.types)}>בטל שינויים</Btn>}
        <Btn kind="primary" disabled={!dirty} onClick={save}>שמור</Btn>
        <Btn onClick={() => {
          const name = prompt('שם סוג חלל חדש')
          if (!name) return
          const c = (r: number) => ({ minutes: 30, roundsPerDay: r })
          setSavedAt(null)
          setDraft((ts) => [...ts, { id: uid('t-'), name, weeklyMin: 0, monthlyMin: 0, weeklyTimes: 1, monthlyEveryWeeks: 4, matrix: { 1: c(1), 2: c(2), 3: c(5) }, tasks: { daily: [], weekly: [], monthly: [], yearly: [] } }])
        }}>+ סוג חלל</Btn></div>}>
      <div className="legendbox">
        <p><b>איך קוראים את המטריצה:</b> לכל סוג חלל יש רשימות משימות בשלוש תדירויות, וכאן קובעים <b>כמה זמן</b> לוקח כל ניקיון ו<b>כמה פעמים</b> הוא מתבצע.</p>
        <ul>
          <li><b>ניקיון יומי</b> – הרשימה היומית של החלל. מתבצע בכל יום עבודה; כמה <b>סבבים ביום</b> תלוי ברמת הפעילות של החלל (1 = נמוכה, 3 = גבוהה).</li>
          <li><b>ניקיון שבועי</b> – משימות עומק שלא עושים כל יום (למשל חלונות, ארונות). קובעים כמה דקות וכמה <b>פעמים בשבוע</b> (ברירת מחדל: פעם אחת).</li>
          <li><b>ניקיון חודשי</b> – משימות עומק נוספות. קובעים כמה דקות וכל כמה זמן: <b>פעם בחודש, פעם בחודשיים, פעם ב-3 חודשים</b> ועוד (או מספר שבועות לבחירתך).</li>
          <li><b>שנתי</b> – רשימה לעיון בלבד; לא נכנסת ללו״ז.</li>
        </ul>
        <p className="muted">משכי הזמן הם הערכה ונקבעים כאן; אפשר לעקוף אותם בכל חלל. את רשימות המשימות עצמן אפשר להוסיף ולערוך בלחיצה על "רשימות משימות" מתחת לשם הסוג.</p>
      </div>
      <div className="table-wrap">
        <table className="matrix mx">
          <thead>
            <tr className="grp-h">
              <th rowSpan={2}>סוג חלל</th>
              <th colSpan={3} className="g-daily">ניקיון יומי</th>
              <th className="g-weekly">ניקיון שבועי</th>
              <th className="g-monthly">ניקיון חודשי</th>
            </tr>
            <tr>
              {LEVELS.map((l) => <th key={l} className="g-daily"><LevelPill level={l} /></th>)}
              <th className="g-weekly">דקות · פעמים בשבוע</th>
              <th className="g-monthly">דקות · כל כמה זמן</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((t) => (
              <tr key={t.id}>
                <td>
                  <input className="inp name" value={t.name} onChange={(e) => patchType(t.id, (x) => ({ ...x, name: e.target.value }))} />
                  <details className="tasks">
                    <summary>רשימות משימות ({t.tasks?.daily.length ?? 0} יומי · {t.tasks?.weekly.length ?? 0} שבועי · {t.tasks?.monthly.length ?? 0} חודשי)</summary>
                    <div className="listedit">
                      {LIST_KEYS.map(({ k, label }) => (
                        <label key={k}>{label}
                          <textarea className="inp" rows={Math.max(3, (t.tasks?.[k].length ?? 0) + 1)} value={(t.tasks?.[k] ?? []).join('\n')}
                            placeholder="משימה בכל שורה" onChange={(e) => setList(t.id, k, e.target.value)} />
                        </label>
                      ))}
                    </div>
                  </details>
                </td>
                {LEVELS.map((l) => (
                  <td key={l} className="g-daily">
                    <div className="cellgrid">
                      <NumInput value={t.matrix[l].minutes} min={0} onChange={(v) => upd(t.id, l, 'minutes', v)} suffix="דק׳ לסבב" />
                      <NumInput value={t.matrix[l].roundsPerDay} max={12} onChange={(v) => upd(t.id, l, 'roundsPerDay', v)} suffix="סבבים/יום" />
                    </div>
                  </td>
                ))}
                <td className="g-weekly">
                  <div className="cellgrid">
                    <NumInput value={t.weeklyMin} onChange={(v) => patchType(t.id, (x) => ({ ...x, weeklyMin: v }))} suffix="דק׳" />
                    <NumInput value={t.weeklyTimes ?? 1} min={1} max={7} onChange={(v) => patchType(t.id, (x) => ({ ...x, weeklyTimes: Math.max(1, v) }))} suffix="פעמים בשבוע" />
                  </div>
                </td>
                <td className="g-monthly">
                  <div className="cellgrid">
                    <NumInput value={t.monthlyMin} onChange={(v) => patchType(t.id, (x) => ({ ...x, monthlyMin: v }))} suffix="דק׳" />
                    <select className="inp" value={EVERY_PRESETS.some((p) => p.w === (t.monthlyEveryWeeks ?? 4)) ? (t.monthlyEveryWeeks ?? 4) : 0}
                      onChange={(e) => {
                        let w = Number(e.target.value)
                        if (w === 0) { const v = Number(prompt('כל כמה שבועות לבצע את הניקיון החודשי?', String(t.monthlyEveryWeeks ?? 4))); if (!v || v < 1) return; w = Math.round(v) }
                        patchType(t.id, (x) => ({ ...x, monthlyEveryWeeks: w }))
                      }}>
                      {EVERY_PRESETS.map((p) => <option key={p.w} value={p.w}>{p.label}</option>)}
                      <option value={0}>{EVERY_PRESETS.some((p) => p.w === (t.monthlyEveryWeeks ?? 4)) ? 'אחר (בשבועות)…' : `כל ${t.monthlyEveryWeeks} שבועות`}</option>
                    </select>
                  </div>
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
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<{ name: string; typeId: string; level: Level }>({ name: '', typeId: data.types[0]?.id ?? '', level: 2 })
  const startAdd = () => { setForm({ name: '', typeId: data.types[0]?.id ?? '', level: 2 }); setAdding(true) }
  const add = () => {
    if (!form.name.trim()) return
    const id = uid('s-')
    setData((d) => ({ ...d, spaces: [{ id, siteId, name: form.name.trim(), typeId: form.typeId, level: form.level, blocked: [], activities: [], events: [] }, ...d.spaces] }))
    setOpen(id)
    setAdding(false)
  }
  return (
    <div className="stack">
      <div className="bar"><h2>חללים ({spaces.length})</h2><Btn kind="primary" onClick={startAdd}>+ הוסף חלל</Btn></div>
      {adding && (
        <Modal title="הוספת חלל" submitLabel="הוסף חלל" onClose={() => setAdding(false)} onSubmit={add}>
          <label>שם החלל<input className="inp" autoFocus required value={form.name} placeholder="למשל: חדר ישיבות" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label>סוג חלל
            <select className="inp" value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })}>
              {data.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>רמת פעילות
            <select className="inp" value={form.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) as Level })}>
              {LEVELS.map((l) => <option key={l} value={l}>רמה {l}</option>)}
            </select>
          </label>
          <p className="muted">מגבלות, פעילויות ואירועים מוסיפים אחרי היצירה, בכרטיס החלל.</p>
        </Modal>
      )}
      <SiteTotals data={data} siteId={siteId} />
      <SiteHoursCard data={data} setData={setData} siteId={siteId} />
      <SiteRulesCard data={data} setData={setData} siteId={siteId} />
      <FreqRulesCard data={data} setData={setData} siteId={siteId} />
      <SpaceTable data={data} spaces={spaces} siteId={siteId} open={open}
        onLevel={(id, level) => patch(id, { level })}
        onOpen={(id) => {
          setOpen(open === id ? null : id)
          setTimeout(() => document.getElementById('space-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
        }}
        renderDetail={(s) => {
        const type = data.types.find((t) => t.id === s.typeId)
        const cell = type?.matrix[s.level]
        const isOpen = open === s.id
        return (
          <div id="space-detail" key={s.id}><Card>
            <div className="space-h" onClick={() => setOpen(isOpen ? null : s.id)}>
              <div>
                <b>{s.name}</b> <LevelPill level={s.level} />
                <small>{type?.name} · {s.minutesOverride ?? cell?.minutes} דק׳ × {s.roundsOverride ?? cell?.roundsPerDay} סבבים ביום · {s.blocked.length} חסימות · {s.activities.length} פעילויות · {s.events.length} אירועים</small>
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
                  <label>עקיפת סבבים<NumInput value={s.roundsOverride ?? 0} max={12} onChange={(v) => patch(s.id, { roundsOverride: v || undefined })} suffix="ביום (0=מטריצה)" /></label>
                  <label>תדירות ניקיון יומי<NumInput value={s.timesPerWeek ?? 0} max={7} onChange={(v) => patch(s.id, { timesPerWeek: v || undefined })} suffix="פעמים בשבוע (0=לפי הסניף)" /></label>
                  <label>שעת ניקיון מועדפת
                    <select className="inp" value={s.slot ?? ''} onChange={(e) => patch(s.id, { slot: (e.target.value || undefined) as Space['slot'] })}>
                      <option value="">אוטומטי</option>
                      <option value="morning">בוקר (עד 12:00)</option>
                      <option value="evening">ערב (אחרי 12:00)</option>
                    </select>
                  </label>
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
          </Card></div>
        )
      }} />
    </div>
  )
}

// ───────────── workers ─────────────

export function WorkersView({ data, setData, siteId }: { data: AppData; setData: SetData; siteId: string }) {
  const workers = data.workers.filter((w) => w.siteId === siteId)
  const patch = (id: string, p: Partial<Worker>) => setData((d) => ({ ...d, workers: d.workers.map((w) => w.id === id ? { ...w, ...p } : w) }))
  const [absDate, setAbsDate] = useState('')
  const [addingW, setAddingW] = useState(false)
  const [newName, setNewName] = useState('')
  return (
    <div className="stack">
      <div className="bar"><h2>עובדי ניקיון ({workers.length})</h2>
        <Btn kind="primary" onClick={() => { setNewName(''); setAddingW(true) }}>+ הוסף עובד</Btn></div>
      {addingW && (
        <Modal title="הוספת עובד" submitLabel="הוסף עובד" onClose={() => setAddingW(false)} onSubmit={() => {
          if (!newName.trim()) return
          setData((d) => ({
            ...d, workers: [{
              id: uid('w-'), siteId, name: newName.trim(), color: COLORS[d.workers.length % COLORS.length], absences: [],
              shifts: [{ start: 420, end: 900 }, { start: 420, end: 900 }, { start: 420, end: 900 }, { start: 420, end: 900 }, { start: 420, end: 900 }, null, null],
            }, ...d.workers],
          }))
          setAddingW(false)
        }}>
          <label>שם העובד<input className="inp" autoFocus required value={newName} onChange={(e) => setNewName(e.target.value)} /></label>
          <p className="muted">ברירת מחדל: ראשון–חמישי 07:00–15:00. את המשמרות אפשר לשנות בכרטיס העובד.</p>
        </Modal>
      )}
      {workers.map((w) => (
        <Card key={w.id}>
          <div className="row wrap">
            <input type="color" className="color" value={w.color} onChange={(e) => patch(w.id, { color: e.target.value })} aria-label="צבע" />
            <input className="inp name" value={w.name} onChange={(e) => patch(w.id, { name: e.target.value })} />
            <Btn kind="danger" onClick={() => confirm(`למחוק את ${w.name}?`) && setData((d) => ({ ...d, workers: d.workers.filter((x) => x.id !== w.id) }))}>מחק</Btn>
          </div>
          <div className="shifts">
            <p className="muted" style={{ gridColumn: '1 / -1' }}>זמינות העובד: המערכת משתמשת בשעות האלה לפי הצורך ולא חייבת למלא אותן. {w.shifts.some((sh) => sh && sh.end - sh.start > data.settings.maxDailyHours * 60) ? `⚠ יש ימים עם חלון ארוך מ-${data.settings.maxDailyHours} שעות – המערכת תשבץ עד ${data.settings.maxDailyHours} שעות ביום ותתריע אם חורגת.` : ''}</p>
            {DAY_NAMES.map((n, d) => {
              const s = w.shifts[d]
              const setShift = (v: { start: number; end: number } | null) => patch(w.id, { shifts: w.shifts.map((x, i) => i === d ? v : x) })
              return (
                <div className={`shift-row ${s ? '' : 'off'}`} key={d}>
                  <label className="inline"><input type="checkbox" checked={!!s} onChange={(e) => setShift(e.target.checked ? { start: 7 * 60, end: 15 * 60 } : null)} /> {n}</label>
                  {s ? <><TimeInput value={s.start} onChange={(v) => setShift({ ...s, start: v })} /><span>–</span><TimeInput value={s.end} onChange={(v) => setShift({ ...s, end: v })} /></> : <span className="muted">לא זמין</span>}
                </div>
              )
            })}
          </div>
          <div className="row wrap">
            <b>היעדרויות (לא זמין בתאריכים):</b>
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
          <label>סוף יום שישי<TimeInput value={st.fridayEnd} onChange={(v) => set({ fridayEnd: v })} /></label>
          <label>מרווח בין משימות<NumInput value={st.buffer} onChange={(v) => set({ buffer: v })} suffix="דק׳" /></label>
        </div>
        <div className="row wrap">
          <label>מקסימום שעות ביום (לפני שעות נוספות)<NumInput value={st.maxDailyHours} min={1} max={16} onChange={(v) => set({ maxDailyHours: v })} suffix="שעות" /></label>
          <label>מקסימום שעות בשבוע<NumInput value={st.maxWeeklyHours} min={1} max={80} onChange={(v) => set({ maxWeeklyHours: v })} suffix="שעות" /></label>
          <small className="muted">חריגה מהמקסימום מסומנת כהתראה בלוח. המערכת נמנעת מחריגה כשאפשר, אבל לא אוסרת אותה. ברירת מחדל: 8 שעות ביום ו-42 בשבוע; כדאי לאמת מול הסכם ההעסקה.</small>
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

function SpaceTable({ data, siteId, open, onLevel, onOpen, renderDetail }: {
  data: AppData; spaces: Space[]; siteId: string; open: string | null
  onLevel: (id: string, l: Level) => void; onOpen: (id: string) => void; renderDetail: (s: Space) => React.ReactNode
}) {
  const [all, setAll] = useState(false)
  const groups = (all ? data.sites : data.sites.filter((x) => x.id === siteId))
    .map((site) => ({ site, rows: data.spaces.filter((x) => x.siteId === site.id) }))
  const sum = (rows: Space[]) => [1, 2, 3].map((l) => rows.filter((x) => x.level === l).length)
  return (
    <Card title="רשימת חללים ורמת פעילות"
      actions={<label className="inline"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> הצג את כל הסניפים</label>}>
      {groups.map(({ site, rows }) => {
        const [a, b, c] = sum(rows)
        return (
          <div key={site.id} className="site-group">
            <h4>{site.name} <small className="muted">· {rows.length} חללים · רמה 1: {a} · רמה 2: {b} · רמה 3: {c}</small></h4>
            <div className="table-wrap">
              <table className="matrix compact">
                <thead><tr><th>חלל</th><th>סוג חלל</th><th>רמת פעילות</th><th>ניקיון יומי</th><th>שבועי</th><th>חודשי</th><th>ש׳ ליום (ממוצע)</th><th>אילוצים</th><th /></tr></thead>
                <tbody>
                  {rows.map((sp) => {
                    const type = data.types.find((t) => t.id === sp.typeId)
                    const cell = type?.matrix[sp.level]
                    return (
                      <Fragment key={sp.id}>
                      <tr className={open === sp.id ? 'hl' : ''}>
                        <td><b>{sp.name}</b></td>
                        <td>{type?.name}</td>
                        <td>
                          <select className={`inp lvlsel lvl${sp.level}`} value={sp.level} aria-label={`רמת פעילות – ${sp.name}`}
                            onChange={(e) => onLevel(sp.id, Number(e.target.value) as Level)}>
                            {LEVELS.map((l) => <option key={l} value={l}>רמה {l}</option>)}
                          </select>
                        </td>
                        {(() => {
                          const m = spaceMinutes(data, sp)
                          const rounds = sp.roundsOverride ?? cell?.roundsPerDay ?? 0
                          const mins = sp.minutesOverride ?? cell?.minutes ?? 0
                          return (
                            <>
                              <td>{m.daily > 0 ? <>{mins} דק׳{rounds > 1 && ` × ${rounds}`}{m.times < data.settings.workDays.length && <small className="muted"> · {m.times} ימים בשבוע</small>}</> : <span className="muted">—</span>}</td>
                              <td>{m.weekly > 0 ? `${m.weekly} דק׳` : <span className="muted">—</span>}</td>
                              <td>{m.monthly > 0 ? `${m.monthly} דק׳` : <span className="muted">—</span>}</td>
                            </>
                          )
                        })()}
                        <td><b>{(spaceMinutes(data, sp).avgPerDay / 60).toFixed(2)}</b></td>
                        <td className="muted">{sp.blocked.length + sp.activities.length + sp.events.length || '—'}</td>
                        <td><Btn onClick={() => onOpen(sp.id)}>{open === sp.id ? 'סגור' : 'פרטים'}</Btn></td>
                      </tr>
                      {open === sp.id && <tr className="detail"><td colSpan={9}>{renderDetail(sp)}</td></tr>}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </Card>
  )
}

function SiteHoursCard({ data, setData, siteId }: { data: AppData; setData: SetData; siteId: string }) {
  const site = data.sites.find((x) => x.id === siteId)
  if (!site) return null
  const setHours = (h: { start: number; end: number }) => setData((d) => ({ ...d, sites: d.sites.map((x) => x.id === siteId ? { ...x, hours: h } : x) }))
  const hrs = { start: site.hours?.start ?? data.settings.dayStart, end: site.hours?.end ?? data.settings.dayEnd }
  return (
    <Card title={`שעות פעילות – ${site.name}`}>
      <div className="row wrap">
        <label>מתחילת היום<TimeInput value={hrs.start} onChange={(v) => setHours({ ...hrs, start: v })} /></label>
        <label>עד<TimeInput value={hrs.end} onChange={(v) => setHours({ ...hrs, end: v })} /></label>
        <small className="muted">סבבי ניקיון חוזרים (רמה 2–3) מתפזרים בתוך השעות האלה</small>
      </div>
    </Card>
  )
}

function SiteTotals({ data, siteId }: { data: AppData; siteId: string }) {
  const rows = data.spaces.filter((x) => x.siteId === siteId).map((sp) => spaceMinutes(data, sp))
  const sum = (k: 'daily' | 'weekly' | 'monthly' | 'avgPerDay' | 'perWeek' | 'per4Weeks') => rows.reduce((a, r) => a + r[k], 0)
  const days = Math.max(1, data.settings.workDays.length)
  const h = (m: number) => (m / 60).toFixed(1)
  return (
    <Card title="סכום שעות ניקיון בסניף">
      <div className="kpis wide">
        <div className="kpi"><b>{h(sum('avgPerDay'))}</b><span>שעות ביום (ממוצע, כולל שבועי וחודשי)</span></div>
        <div className="kpi"><b>{h(sum('perWeek'))}</b><span>שעות בשבוע</span></div>
        <div className="kpi"><b>{h(sum('per4Weeks'))}</b><span>שעות ב-4 שבועות</span></div>
      </div>
      <p className="muted">
        הממוצע היומי = ניקיון יומי ({h(sum('daily'))} ש׳) + הניקיון השבועי מחולק ל-{days} ימי עבודה ({h(sum('weekly') / days)} ש׳) + הניקיון החודשי מחולק ל-4 שבועות ו-{days} ימים ({h(sum('monthly') / (4 * days))} ש׳).
        החישוב לפי המטריצה, כולל עקיפות בכל חלל; ניקיון שנתי לא נכלל.
      </p>
    </Card>
  )
}

type Mode = 'all' | 'except' | 'only'

/** "Applies to": all spaces / all but some / only some - with quick selection by space type. */
function SpacePicker({ data, siteId, mode, spaceIds, onChange }: {
  data: AppData; siteId: string; mode: Mode; spaceIds: string[]; onChange: (p: { mode?: Mode; spaceIds?: string[] }) => void
}) {
  const spaces = data.spaces.filter((x) => x.siteId === siteId)
  const typesHere = [...new Set(spaces.map((x) => x.typeId))].map((id) => data.types.find((t) => t.id === id)).filter(Boolean) as SpaceType[]
  const toggle = (sid: string) => onChange({ spaceIds: spaceIds.includes(sid) ? spaceIds.filter((x) => x !== sid) : [...spaceIds, sid] })
  const toggleType = (typeId: string) => {
    const ids = spaces.filter((x) => x.typeId === typeId).map((x) => x.id)
    const all = ids.every((i) => spaceIds.includes(i))
    onChange({ spaceIds: all ? spaceIds.filter((i) => !ids.includes(i)) : [...new Set([...spaceIds, ...ids])] })
  }
  return (
    <>
      <label>חל על
        <select className="inp" value={mode} onChange={(e) => onChange({ mode: e.target.value as Mode })}>
          <option value="all">כל החללים בסניף</option>
          <option value="except">כל החללים חוץ מ…</option>
          <option value="only">רק החללים שבחרתי</option>
        </select>
      </label>
      {mode !== 'all' && (
        <details className="rulespaces" open={spaceIds.length === 0} style={{ flexBasis: '100%' }}>
          <summary>{mode === 'except' ? 'חללים שהכלל לא חל עליהם' : 'חללים שהכלל חל עליהם'} ({spaceIds.length})</summary>
          <div className="row wrap">
            {typesHere.map((t) => {
              const ids = spaces.filter((x) => x.typeId === t.id).map((x) => x.id)
              const on = ids.every((i) => spaceIds.includes(i))
              return <button key={t.id} className={`chipbtn ${on ? 'on' : ''}`} onClick={() => toggleType(t.id)}>{t.name} ({ids.length})</button>
            })}
          </div>
          <div className="spacechecks">
            {spaces.map((x) => (
              <label className="inline" key={x.id}><input type="checkbox" checked={spaceIds.includes(x.id)} onChange={() => toggle(x.id)} /> {x.name}</label>
            ))}
          </div>
        </details>
      )}
    </>
  )
}

function SiteRulesCard({ data, setData, siteId }: { data: AppData; setData: SetData; siteId: string }) {
  const site = data.sites.find((x) => x.id === siteId)
  if (!site) return null
  const rules = site.rules ?? []
  const setRules = (next: SiteRule[]) => setData((d) => ({ ...d, sites: d.sites.map((x) => x.id === siteId ? { ...x, rules: next } : x) }))
  const patch = (id: string, p: Partial<SiteRule>) => setRules(rules.map((r) => r.id === id ? { ...r, ...p } : r))
  return (
    <Card title="אילוצי שעות לכל הסניף"
      actions={<Btn onClick={() => setRules([...rules, { id: uid('r-'), label: 'אילוץ חדש', days: [0, 1, 2, 3, 4], start: 9 * 60, end: 16 * 60 + 30, mode: 'all', spaceIds: [] }])}>+ הוסף אילוץ</Btn>}>
      <p className="muted">שעות שבהן <b>אי אפשר לנקות</b>, בבת אחת לכל החללים בסניף, או לכולם חוץ מחללים מסוימים, או רק לחללים שבחרת. אילוץ של חלל בודד נשאר בכרטיס החלל.</p>
      {rules.length === 0 && <p className="muted">אין אילוצים ברמת הסניף.</p>}
      {rules.map((r) => (
        <div className="siterule" key={r.id}>
          <div className="row wrap">
            <input className="inp" style={{ minWidth: 280 }} value={r.label} aria-label="שם האילוץ" onChange={(e) => patch(r.id, { label: e.target.value })} />
            <Btn kind="danger" onClick={() => confirm(`למחוק את האילוץ "${r.label}"?`) && setRules(rules.filter((x) => x.id !== r.id))}>מחק</Btn>
          </div>
          <div className="row wrap">
            <b>ימים:</b>
            {DAY_NAMES.map((n, d) => (
              <label className="inline" key={d}>
                <input type="checkbox" checked={r.days.includes(d)} onChange={(e) => patch(r.id, { days: e.target.checked ? [...r.days, d].sort() : r.days.filter((x) => x !== d) })} /> {n}
              </label>
            ))}
          </div>
          <div className="row wrap">
            <label>לא מנקים מהשעה<TimeInput value={r.start} onChange={(v) => patch(r.id, { start: v })} /></label>
            <label>עד<TimeInput value={r.end} onChange={(v) => patch(r.id, { end: v })} /></label>
            <SpacePicker data={data} siteId={siteId} mode={r.mode} spaceIds={r.spaceIds} onChange={(p) => patch(r.id, p)} />
          </div>
        </div>
      ))}
    </Card>
  )
}

function FreqRulesCard({ data, setData, siteId }: { data: AppData; setData: SetData; siteId: string }) {
  const site = data.sites.find((x) => x.id === siteId)
  if (!site) return null
  const rules = site.freqRules ?? []
  const days = data.settings.workDays.length
  const setRules = (next: FreqRule[]) => setData((d) => ({ ...d, sites: d.sites.map((x) => x.id === siteId ? { ...x, freqRules: next } : x) }))
  const patch = (id: string, p: Partial<FreqRule>) => setRules(rules.map((r) => r.id === id ? { ...r, ...p } : r))
  return (
    <Card title="תדירות ניקיון לכל הסניף"
      actions={<Btn onClick={() => setRules([...rules, { id: uid('f-'), label: 'תדירות חדשה', mode: 'all', spaceIds: [], timesPerWeek: 2 }])}>+ הוסף תדירות</Btn>}>
      <p className="muted">
        ברירת המחדל: הניקיון היומי מתבצע בכל יום עבודה ({days} ימים בשבוע). כאן אפשר להגדיר <b>כמה פעמים בשבוע</b> לנקות את הניקיון היומי – לכל החללים, לכולם חוץ מחללים מסוימים, או רק לחללים שבחרת.
        הימים מתפזרים על פני השבוע. כללים מאוחרים גוברים על קודמים, ותדירות שהוגדרה בכרטיס חלל גוברת על הכל. ניקיון שבועי וחודשי לא מושפע.
      </p>
      {rules.length === 0 && <p className="muted">אין כללי תדירות ברמת הסניף.</p>}
      {rules.map((r) => (
        <div className="siterule" key={r.id}>
          <div className="row wrap">
            <input className="inp" style={{ minWidth: 280 }} value={r.label} aria-label="שם הכלל" onChange={(e) => patch(r.id, { label: e.target.value })} />
            <Btn kind="danger" onClick={() => confirm(`למחוק את הכלל "${r.label}"?`) && setRules(rules.filter((x) => x.id !== r.id))}>מחק</Btn>
          </div>
          <div className="row wrap">
            <label>ניקיון יומי<NumInput value={r.timesPerWeek} min={1} max={days} onChange={(v) => patch(r.id, { timesPerWeek: Math.min(days, Math.max(1, v)) })} suffix="פעמים בשבוע" /></label>
            <SpacePicker data={data} siteId={siteId} mode={r.mode} spaceIds={r.spaceIds} onChange={(p) => patch(r.id, p)} />
          </div>
        </div>
      ))}
    </Card>
  )
}
