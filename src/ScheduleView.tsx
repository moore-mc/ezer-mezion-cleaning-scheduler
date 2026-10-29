import { useMemo, useState } from 'react'
import type { AppData, Job, Override, Placement, ScheduleResult, Worker } from './types'
import { groupWindows, recommendFixes } from './recommend'
import type { FixPlan } from './recommend'
import { DAY, DAY_NAMES, addDays, fmt, hoursReport, overrideKey, stintsOf } from './scheduler'
import { Btn, Card, DaySelect, NumInput, TimeInput } from './ui'


/** Golden-angle hues give every space type its own distinct colour. */
const hueOf = (idx: number) => Math.round((idx * 137.508 + 20) % 360)

type Group = 'daily' | 'weekly' | 'monthly' | 'activity' | 'event' | 'manual'
const GROUPS: { id: Group; title: string; hint: string }[] = [
  { id: 'daily', title: 'ניקיון יומי', hint: 'רשימת המשימות היומית של החלל' },
  { id: 'weekly', title: 'ניקיון שבועי', hint: 'פעם בשבוע – משימות עומק שלא עושים כל יום' },
  { id: 'monthly', title: 'ניקיון חודשי', hint: 'פעם בחודש – משימות עומק' },
  { id: 'activity', title: 'אחרי פעילות', hint: 'ניקיון חובה בסיום פעילות קבועה בחלל' },
  { id: 'event', title: 'אירוע מיוחד', hint: 'ניקיון לפני / אחרי אירוע ביומן' },
  { id: 'manual', title: 'משימה חד־פעמית', hint: 'משימה שהוגדרה ידנית' },
]
const groupOf = (jobId: string, kind: string): Group =>
  jobId.startsWith('w|') ? 'weekly' : jobId.startsWith('mo|') ? 'monthly' : kind === 'activity' ? 'activity' : kind === 'event' ? 'event' : kind === 'manual' ? 'manual' : 'daily'

const KIND_LABEL = { routine: 'שוטף', activity: 'אחרי פעילות', event: 'אירוע מיוחד', manual: 'ידני' }

interface Props {
  siteId: string
  data: AppData
  weekStart: string
  result: ScheduleResult
  setOverride: (jobId: string, o: Override | null) => void
  applyPlan: (plan: FixPlan) => void
}

export default function ScheduleView({ siteId, data, weekStart, result, setOverride, applyPlan }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [day, setDay] = useState(() => {
    const i = Math.round((Date.parse(today) - Date.parse(weekStart)) / 86400000)
    return i >= 0 && i < 7 ? i : 0
  })
  const [selected, setSelected] = useState<string | null>(null)
  const [spaceSel, setSpaceSel] = useState<{ spaceId: string; group: Group; jobId: string } | null>(null)

  const jobById = useMemo(() => new Map(result.jobs.map((j) => [j.id, j])), [result])
  const spaceName = (id: string) => data.spaces.find((s) => s.id === id)?.name ?? '—'
  const hours = useMemo(() => hoursReport(result, data), [result, data])
  const hh = (m: number) => (m / 60).toFixed(1)
  const plan = useMemo(() => (result.unscheduled.length || hours.alerts.length ? recommendFixes(data, weekStart, siteId) : null), [result, hours, data, weekStart, siteId])
  const SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  const typeIdx = (spaceId: string) => data.types.findIndex((t) => t.id === data.spaces.find((s) => s.id === spaceId)?.typeId)
  const hue = (spaceId: string) => ({ ['--h' as string]: hueOf(Math.max(0, typeIdx(spaceId))) }) as React.CSSProperties
  const DayList = () => {
    const mine = (wid: string) => result.placements.filter((p) => p.workerId === wid && Math.floor(p.start / DAY) === day)
    if (!result.placements.some((p) => Math.floor(p.start / DAY) === day)) return <p className="muted">אין משימות ביום זה.</p>
    return (
      <div className="cols">
        {data.workers.map((w) => {
          const list = mine(w.id)
          const absent = w.absences.includes(addDays(weekStart, day))
          // group by kind of cleaning, then one row per space (several rounds show ×N)
          const groups = new Map<Group, Map<string, { jobId: string; spaceId: string; n: number; labels: Set<string> }>>()
          for (const p of list) {
            const j = jobById.get(p.jobId)!
            const g = groupOf(j.id, j.kind)
            const m = groups.get(g) ?? new Map()
            const e = m.get(j.spaceId) ?? { jobId: p.jobId, spaceId: j.spaceId, n: 0, labels: new Set<string>() }
            e.n++
            if (g === 'activity' || g === 'event' || g === 'manual') e.labels.add(j.label)
            m.set(j.spaceId, e); groups.set(g, m)
          }
          const sortRows = (m: Map<string, { jobId: string; spaceId: string; n: number; labels: Set<string> }>) =>
            [...m.values()].sort((a, b) => typeIdx(a.spaceId) - typeIdx(b.spaceId) || spaceName(a.spaceId).localeCompare(spaceName(b.spaceId), 'he', { numeric: true }))
          const total = list.reduce((a, p) => a + p.end - p.start, 0)
          const spacesCount = new Set(list.map((p) => jobById.get(p.jobId)!.spaceId)).size
          return (
            <div className="col" key={w.id}>
              <header style={{ borderColor: w.color }}>
                <b><i style={{ background: w.color }} />{w.name}</b>
                <small>{absent ? 'נעדר' : `${spacesCount} חללים`}</small>
                {!absent && <strong className="sumh">{hh(total)} שעות ניקיון</strong>}
              </header>
              {list.length === 0 && <p className="muted pad">{absent ? '' : 'אין משימות'}</p>}
              {GROUPS.filter((g) => groups.has(g.id)).map((g) => (
                <section key={g.id} className="grp">
                  <h5 title={g.hint}>{g.title} <small>({groups.get(g.id)!.size}){g.id === 'weekly' && ' · משימות עומק, פעם בשבוע'}{g.id === 'monthly' && ' · משימות עומק, פעם בחודש'}{g.id === 'activity' && ' · אחרי פעילות קבועה'}</small></h5>
                  <ul className="tl-list">
                    {sortRows(groups.get(g.id)!).map((r) => (
                      <li key={r.spaceId}>
                        <button style={hue(r.spaceId)} className={`lrow ${spaceSel?.spaceId === r.spaceId && spaceSel.group === g.id ? 'sel' : ''}`}
                          onClick={() => setSpaceSel({ spaceId: r.spaceId, group: g.id, jobId: r.jobId })}>
                          <i className="dot tcol" />
                          <b>{spaceName(r.spaceId)}</b>
                          <span className="lm">{[...r.labels].join(' · ')}{r.n > 1 && ` ×${r.n}`}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )
        })}
      </div>
    )
  }

  const FixPanel = ({ plan }: { plan: FixPlan }) => {
    const none = plan.extensions.length === 0 && plan.hires.length === 0
    const solved = plan.after.unscheduled.length === 0 && plan.after.alerts.length === 0
    const win = (w: { start: number; end: number } | null) => (w ? `${fmt(w.start)}–${fmt(w.end)}` : 'לא עבד')
    return (
      <div className="reco">
        <h4>💡 המלצה לפתרון</h4>
        {none ? (
          <p className="muted">לא מצאתי תוספת שעות או עובדים שתשפר את המצב. כדאי לשנות אילוץ של חלל, לקצר סבבים או לשבץ ידנית.</p>
        ) : (
          <>
            {plan.extensions.length > 0 && (
              <div>
                <b>להוסיף שעות לעובדים קיימים</b>
                <ul>
                  {plan.extensions.map((e) => (
                    <li key={`${e.workerId}|${e.day}`} className="rli">
                      <div><b>{e.workerName}</b> · יום {DAY_NAMES[e.day]}: <span className="ltr">{win(e.before)}</span> ← <span className="ltr">{win(e.after)}</span> <small className="muted">(+{hh(e.addedMin)} ש׳)</small></div>
                      <Btn onClick={() => applyPlan({ ...plan, extensions: [e], hires: [] })}>החל</Btn>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan.hires.length > 0 && (
              <div>
                <b>להוסיף {plan.hires.length === 1 ? 'עובד אחד' : `${plan.hires.length} עובדים`}</b>
                <ul>
                  {plan.hires.map((h) => (
                    <li key={h.worker.id} className="rli">
                      <div>
                        <b>{h.worker.name}</b> <small className="muted">· כ-{hh(h.weeklyMin)} ש׳ בשבוע</small>
                        {groupWindows(h.windows).map((g, i) => (
                          <div key={i}>{g.days.map((d) => SHORT[d]).join(' ')} · <span className="ltr">{fmt(g.start)}–{fmt(g.end)}</span></div>
                        ))}
                      </div>
                      <Btn onClick={() => applyPlan({ ...plan, extensions: [], hires: [h] })}>הוסף עובד</Btn>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className={solved ? 'ok-note' : 'muted'}>
              {solved
                ? '✓ אחרי ההמלצה כל המשימות משובצות ואין התראות שעות נוספות.'
                : `אחרי ההמלצה: ${plan.after.unscheduled.length} משימות ללא שיבוץ · ${plan.after.alerts.length} התראות שעות נוספות (כעת: ${plan.before.unscheduled} · ${plan.before.alerts}).`}
              {' '}אפשר להחיל כל המלצה בנפרד – ההמלצות מחושבות מחדש אחרי כל שינוי. ההמלצה מעדיפה הוספת שעות לעובדים קיימים לפני גיוס, ושומרת על {data.settings.maxDailyHours} שעות ביום.
            </p>
            <Btn kind="primary" onClick={() => applyPlan(plan)}>{plan.extensions.length + plan.hires.length > 1 ? 'החל את כל ההמלצות' : 'החל את ההמלצה'}</Btn>
          </>
        )}
      </div>
    )
  }
  const dayTypes = [...new Set(result.placements.filter((p) => Math.floor(p.start / DAY) === day).map((p) => typeIdx(jobById.get(p.jobId)!.spaceId)))]
    .filter((i) => i >= 0).sort((a, b) => a - b)
  const closed = data.settings.closedDates.includes(addDays(weekStart, day))

  const perDay = DAY_NAMES.map((_, d) => ({
    placed: result.placements.filter((p) => Math.floor(p.start / DAY) === d).length,
    bad: result.unscheduled.filter((u) => Math.floor(u.job.earliest / DAY) === d).length,
  }))

  const selJob = selected ? jobById.get(selected) ?? result.skipped.find((j) => j.id === selected) : undefined
  const selPlacement = result.placements.find((p) => p.jobId === selected)
  const selUnsched = result.unscheduled.find((u) => u.job.id === selected)

  const overridden = Object.entries(data.overrides)
    .filter(([k]) => k.startsWith(weekStart + '|'))
    .map(([k, o]) => ({ id: k.slice(weekStart.length + 1), o }))

  return (
    <div className="sched">
      <div className="daytabs">
        {DAY_NAMES.map((n, d) => {
          const isClosed = data.settings.closedDates.includes(addDays(weekStart, d))
          return (
            <button key={d} className={`daytab ${d === day ? 'on' : ''} ${isClosed ? 'closed' : ''}`} onClick={() => setDay(d)}>
              <b>{n}</b>
              <small>{addDays(weekStart, d).slice(8)}/{addDays(weekStart, d).slice(5, 7)}</small>
              <span className="dots">
                {isClosed ? 'סגור' : <>{perDay[d].placed} משימות{perDay[d].bad > 0 && <em className="bad"> · {perDay[d].bad} ללא שיבוץ</em>}</>}
              </span>
            </button>
          )
        })}
      </div>

      <Card title={`משימות העובדים – יום ${DAY_NAMES[day]}`} actions={<div className="legend">{dayTypes.map((i) => <span key={i}><i style={{ ['--h' as string]: hueOf(i) } as React.CSSProperties} className="tcol" />{data.types[i].name}</span>)}</div>}>
        {closed ? <p className="muted">היום מסומן כיום סגור (חג / ללא עבודה).</p> : <DayList />}
      </Card>

      {hours.alerts.length > 0 && (
        <Card title={`התראות שעות נוספות (${hours.alerts.length})`}>
          <ul className="list">
            {hours.alerts.map((a, i) => (
              <li key={i}>
                <b>{data.workers.find((w) => w.id === a.workerId)?.name}</b>
                <span>{a.day === null ? 'סה״כ שבועי' : `יום ${DAY_NAMES[a.day]}`}: <b className="bad">{hh(a.minutes)} ש׳</b> (המקסימום {hh(a.limit)} ש׳)</span>
              </li>
            ))}
          </ul>
          {plan && <FixPanel plan={plan} />}
          <p className="muted">נוכחות = משימות רצופות מההתחלה ועד הסוף; הפסקה של שעתיים ומעלה נחשבת כזמן חופשי. אפשר לפתור בהוספת עובד, בהרחבת זמינות של עובדים אחרים או בקיצור הסבבים.</p>
        </Card>
      )}

      <div className="two">
        <Card title={`ללא שיבוץ (${result.unscheduled.length})`}>
          {result.unscheduled.length === 0 ? <p className="ok-note">✓ כל המשימות שובצו בהצלחה</p> : (
            <ul className="list">
              {result.unscheduled.map(({ job, reason }) => (
                <li key={job.id} className={selected === job.id ? 'sel' : ''} onClick={() => { setSelected(job.id); setDay(Math.floor(job.earliest / DAY)) }}>
                  <b>{spaceName(job.spaceId)}</b> · {job.label}
                  <small>{DAY_NAMES[Math.floor(job.earliest / DAY)]} <span className="ltr">{fmt(job.earliest)}–{fmt(job.deadline)}</span> · {job.duration} דק׳</small>
                  <em className="bad">{reason}</em>
                </li>
              ))}
            </ul>
          )}
          {plan && <FixPanel plan={plan} />}
        </Card>

        <Card title={`שינויים ידניים (${overridden.length})`}>
          {overridden.length === 0 ? <p className="muted">אין שינויים. לחצו על משימה בלוח כדי להזיז, לשנות או לדלג.</p> : (
            <ul className="list">
              {overridden.map(({ id, o }) => {
                const j = jobById.get(id) ?? result.skipped.find((s) => s.id === id)
                if (!j) return null
                return (
                  <li key={id} onClick={() => setSelected(id)}>
                    <b>{spaceName(j.spaceId)}</b> · {j.label}
                    <small>{o.skip ? 'דילוג' : o.pin ? `נעוץ: ${DAY_NAMES[Math.floor(o.pin.start / DAY)]} ${fmt(o.pin.start)}` : `משך ${o.duration} דק׳`}</small>
                    <Btn onClick={(e) => { e.stopPropagation(); setOverride(id, null) }}>בטל</Btn>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {spaceSel && (
        <SpacePanel data={data} spaceId={spaceSel.spaceId} group={spaceSel.group}
          onClose={() => setSpaceSel(null)} onEdit={() => { setSelected(spaceSel.jobId); setSpaceSel(null) }} />
      )}

      {selJob && (
        <JobPanel key={selJob.id + (selPlacement?.start ?? '')} data={data} job={selJob} placement={selPlacement}
          unscheduled={selUnsched?.reason} override={data.overrides[overrideKey(weekStart, selJob.id)]}
          spaceName={spaceName(selJob.spaceId)} onClose={() => setSelected(null)}
          onChange={(o) => setOverride(selJob.id, o)} />
      )}
    </div>
  )
}

function JobPanel({ data, job, placement, unscheduled, override, spaceName, onClose, onChange }: {
  data: AppData; job: Job; placement?: Placement; unscheduled?: string; override?: Override
  spaceName: string; onClose: () => void; onChange: (o: Override | null) => void
}) {
  const initStart = placement?.start ?? job.earliest
  const [workerId, setWorkerId] = useState(placement?.workerId ?? data.workers[0]?.id ?? '')
  const [d, setD] = useState(Math.floor(initStart / DAY))
  const [t, setT] = useState(initStart % DAY)
  const [dur, setDur] = useState(job.duration)
  const skipped = override?.skip

  const apply = (patch: Override) => onChange({ ...override, skip: false, ...patch })

  return (
    <aside className="panel" role="dialog" aria-label="עריכת משימה">
      <header>
        <div><small>{KIND_LABEL[job.kind]}</small><h3>{spaceName}</h3><p>{job.label}</p></div>
        <button className="x" onClick={onClose} aria-label="סגור">×</button>
      </header>
      <dl>
        <dt>חלון נדרש</dt><dd>{DAY_NAMES[Math.floor(job.earliest / DAY)]} <span className="ltr">{fmt(job.earliest)} – {fmt(job.deadline)}</span>{job.deadline - job.earliest >= DAY ? ` (עד ${DAY_NAMES[Math.floor(job.deadline / DAY) % 7]})` : ''}</dd>
        <dt>שיבוץ נוכחי</dt>
        <dd>{skipped ? 'דולג ידנית' : placement ? <>{data.workers.find((w) => w.id === placement.workerId)?.name} · <span className="ltr">{fmt(placement.start)}–{fmt(placement.end)}</span></> : 'לא שובץ'}</dd>
      </dl>
      {unscheduled && <p className="bad box">{unscheduled}</p>}
      {placement?.warnings.map((w) => <p key={w} className="warnbox">⚠ {w}</p>)}

      <h4>עקיפה ידנית</h4>
      <label>עובד
        <select className="inp" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
          {data.workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>
      <div className="row">
        <label>יום<DaySelect value={d} onChange={setD} /></label>
        <label>שעה<TimeInput value={t} onChange={setT} /></label>
      </div>
      <Btn kind="primary" onClick={() => apply({ pin: { workerId, start: d * DAY + t } })}>📌 קבע ידנית (נעוץ)</Btn>

      <label>משך (דקות)<NumInput value={dur} min={5} onChange={setDur} suffix="דק׳" /></label>
      <Btn onClick={() => apply({ duration: dur })}>עדכן משך</Btn>

      <div className="row end">
        {skipped
          ? <Btn onClick={() => onChange(override && (override.pin || override.duration) ? { ...override, skip: false } : null)}>בטל דילוג</Btn>
          : <Btn kind="danger" onClick={() => onChange({ ...override, skip: true })}>דלג על משימה זו</Btn>}
        {override && <Btn onClick={() => onChange(null)}>חזור לאוטומטי</Btn>}
      </div>
    </aside>
  )
}

function SpacePanel({ data, spaceId, group, onClose, onEdit }: {
  data: AppData; spaceId: string; group: Group; onClose: () => void; onEdit: () => void
}) {
  const space = data.spaces.find((x) => x.id === spaceId)
  const type = data.types.find((t) => t.id === space?.typeId)
  const g = GROUPS.find((x) => x.id === group)!
  // after an activity / event / one-off task the space gets its daily clean; weekly / monthly use their own lists
  const list = group === 'weekly' ? type?.tasks?.weekly : group === 'monthly' ? type?.tasks?.monthly : type?.tasks?.daily
  const cell = type?.matrix[space?.level ?? 1]
  const rounds = space?.roundsOverride ?? cell?.roundsPerDay
  return (
    <aside className="panel" role="dialog" aria-label="מה מנקים בחלל">
      <header>
        <div><small>{type?.name} · רמה {space?.level}</small><h3>{space?.name}</h3><p>{g.title}</p></div>
        <button className="x" onClick={onClose} aria-label="סגור">×</button>
      </header>
      <p className="muted">{g.hint}.{group === 'daily' && rounds ? ` מתבצע ${rounds === 1 ? 'פעם אחת' : `${rounds} פעמים (סבבים)`} ביום בכל יום עבודה.` : ''}{group === 'weekly' ? ' מתבצע פעם אחת בשבוע, ביום קבוע שנבחר לחלל.' : ''}{group === 'monthly' ? ' מתבצע פעם ב-4 שבועות.' : ''}</p>
      <h4>מה מנקים</h4>
      {list && list.length > 0 ? (
        <ul className="checklist">{list.map((t) => <li key={t}>{t}</li>)}</ul>
      ) : (
        <p className="muted">לא הוגדרה רשימת משימות לסוג החלל הזה (ניתן להגדיר בלשונית "מטריצה").</p>
      )}
      <Btn onClick={onEdit}>עריכת השיבוץ (הזזה / דילוג)</Btn>
    </aside>
  )
}
