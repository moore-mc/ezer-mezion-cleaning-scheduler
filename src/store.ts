import { useEffect, useState } from 'react'
import type { AppData } from './types'
import { seed } from './seed'

const KEY = 'ezer-cleaning-scheduler-v15'

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw) as AppData
      d.settings = { ...seed.settings, ...d.settings }
      // one-off migration: the old default gap between tasks (5 min) becomes 0; a value the user chose is left alone
      try {
        if (!localStorage.getItem('ezer-m-buffer0')) {
          if (d.settings.buffer === 5) d.settings.buffer = 0
          localStorage.setItem('ezer-m-buffer0', '1')
        }
      } catch { /* ignore */ }
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
