import { useMemo } from 'react'
import type { AppData } from './types'
import { DAY, DAY_NAMES, addDays, fmt } from './scheduler'
import { planStaffing } from './staffing'
import { Card } from './ui'

const FTE_HOURS = 42

export default function StaffingView({ data, weekStart, siteName }: { data: AppData; weekStart: string; siteName: string }) {
  const plan = useMemo(() => planStaffing(data, weekStart), [data, weekStart])
  const space = (id: string) => data.spaces.find((s) => s.id === id)?.name ?? ''
  const have = data.workers.length
  const gap = plan.peak - have
  const hrs = (m: number) => (m / 60).toFixed(1)
  const date = (d: number) => { const iso = addDays(weekStart, d); return `${iso.slice(8)}/${iso.slice(5, 7)}` }
  const maxHour = Math.max(1, ...plan.days.flatMap((d) => d.hourly))

  return (
    <div className="stack">
      <Card title={`תכנון כוח אדם – ${siteName} · שבוע ${date(0)}–${date(6)}`}>
        <p className="muted">
          כמה עובדי ניקיון נדרשים ומתי, כדי לבצע את כל המשימות שנגזרות מהמטריצה, הפעילויות והאירועים – בהתחשב במגבלות כל חלל.
          החישוב לא תלוי ברשימת העובדים הקיימת: הוא מניח שאפשר לגייס עובדים בכל שעה בין 05:00 ל-24:00.
        </p>
        <div className="kpis wide">
          <div className="kpi"><b>{plan.peak}</b><span>עובדים בשיא (בו־זמנית)</span></div>
          <div className="kpi"><b>{hrs(plan.workMin)}</b><span>שעות ניקיון בשבוע</span></div>
          <div className="kpi"><b>{hrs(plan.presenceMin)}</b><span>שעות נוכחות נדרשות</span></div>
          <div className="kpi"><b>{plan.presenceMin ? Math.round((plan.workMin / plan.presenceMin) * 100) : 0}%</b><span>ניצולת (עבודה / נוכחות)</span></div>
          <div className="kpi"><b>{(plan.presenceMin / 60 / FTE_HOURS).toFixed(1)}</b><span>היקף משרות ({FTE_HOURS} ש׳ שבועיות)</span></div>
        </div>
        <p className={gap > 0 ? 'bad box' : 'ok-note'}>
          {gap > 0
            ? `בסניף מוגדרים ${have} עובדים, והשיא הנדרש הוא ${plan.peak} – חסרים ${gap}.`
            : `בסניף מוגדרים ${have} עובדים – מספיק לשיא הנדרש (${plan.peak}). שימו לב שהמשמרות שלהם צריכות להתאים לשעות שלמטה.`}
        </p>
      </Card>

      <Card title="מתי צריך עובדים – לפי יום">
        <div className="table-wrap">
          <table className="matrix staff">
            <thead><tr><th>יום</th><th>מפת עומס לפי שעה (05–24)</th><th>משמרות מומלצות</th><th>שעות ניקיון</th></tr></thead>
            <tbody>
              {plan.days.map((d) => (
                <tr key={d.day}>
                  <td><b>{DAY_NAMES[d.day]}</b><br /><small className="muted">{date(d.day)}</small></td>
                  <td>
                    <div className="heat" dir="rtl">
                      {d.hourly.slice(5).map((c, i) => (
                        <i key={i} title={`${String(5 + i).padStart(2, '0')}:00 – ${c} עובדים`}
                          style={{ opacity: c ? 0.25 + 0.75 * (c / maxHour) : 0.07 }}>{c || ''}</i>
                      ))}
                    </div>
                  </td>
                  <td>
                    {d.blocks.length === 0 ? <span className="muted">אין עבודה</span> : d.blocks.map((b, i) => (
                      <div key={i} className="blockline">
                        <b className="ltr">{fmt(b.start)}–{fmt(b.end)}</b>
                        <span className="chip">{b.workers} {b.workers === 1 ? 'עובד' : 'עובדים'}</span>
                        <small className="muted">{hrs(b.workMin)} ש׳ ניקיון</small>
                      </div>
                    ))}
                  </td>
                  <td>{hrs(d.workMin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">משמרת = רצף עבודה בלי רווח של יותר משעתיים. מספר העובדים במשמרת הוא השיא של משימות מקבילות בה.</p>
      </Card>

      {plan.infeasible.length > 0 && (
        <Card title={`משימות שלא ניתן לבצע גם עם עובדים נוספים (${plan.infeasible.length})`}>
          <ul className="list">
            {plan.infeasible.map(({ job, reason }) => (
              <li key={job.id}>
                <b>{space(job.spaceId)}</b> · {job.label}
                <small>{DAY_NAMES[Math.floor(job.earliest / DAY)]} {fmt(job.earliest)}–{fmt(job.deadline)}</small>
                <em className="bad">{reason === 'אין עובד במשמרת בחלון הזמן הנדרש' ? 'החלון מחוץ לשעות 05:00–24:00 או ביום סגור' : reason}</em>
              </li>
            ))}
          </ul>
          <p className="muted">כאן צריך לשנות אילוץ: להרחיב את חלון הניקיון, לבטל חסימה או לדלג על המשימה.</p>
        </Card>
      )}
    </div>
  )
}
