import type { ReactNode } from 'react'
import { fmt, parseTime, DAY_NAMES } from './scheduler'

export const uid = (p: string) => `${p}${Math.random().toString(36).slice(2, 8)}`

export function TimeInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <input className="inp time" type="time" value={fmt(value)} onChange={(e) => e.target.value && onChange(parseTime(e.target.value))} />
}

export function NumInput({ value, onChange, min = 0, max, suffix }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; suffix?: string
}) {
  return (
    <span className="numwrap">
      <input className="inp num" type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))} />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  )
}

export function DaySelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select className="inp" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {DAY_NAMES.map((n, i) => <option key={i} value={i}>{n}</option>)}
    </select>
  )
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && <header className="card-h"><h3>{title}</h3><div>{actions}</div></header>}
      {children}
    </section>
  )
}

export function Btn({ kind = 'ghost', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: 'primary' | 'ghost' | 'danger' }) {
  return <button {...p} className={`btn ${kind} ${p.className ?? ''}`} />
}

export function LevelPill({ level }: { level: number }) {
  return <span className={`lvl lvl${level}`}>רמה {level}</span>
}
