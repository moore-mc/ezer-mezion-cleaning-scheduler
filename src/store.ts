import { useEffect, useState } from 'react'
import type { AppData } from './types'
import { seed } from './seed'

const KEY = 'ezer-cleaning-scheduler-v3'

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as AppData
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
