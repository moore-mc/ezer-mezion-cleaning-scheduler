import { useEffect, useState } from 'react'
import type { AppData } from './types'
import { seed } from './seed'

const KEY = 'ezer-cleaning-scheduler-v5'

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw) as AppData
      d.settings = { ...seed.settings, ...d.settings }
      // keep user edits but refresh site names (fixes the earlier misspelling)
      return { ...d, sites: d.sites.map((x) => ({ ...x, name: seed.sites.find((y) => y.id === x.id)?.name ?? x.name })) }
    }
  } catch { /* storage unavailable – fall back to seed */ }
  return seed
}

export function useData() {
  const [data, setData] = useState<AppData>(load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(data)) } catch { /* ignore */ }
  }, [data])
  const reset = () => setData(seed)
  return { data, setData, reset }
}
