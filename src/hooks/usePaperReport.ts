import { useEffect, useState } from 'react'
import { growwConfig } from '../config/groww'
import { upstoxConfig } from '../config/upstox'
import type { PaperBook } from '../engine/paperTrader'

const REFRESH_MS = 60_000

export interface PaperDayRecord {
  date: string
  ticks: number
  macroLevel: string | null
  books: Record<string, PaperBook>
}

export interface PaperDayLive extends PaperDayRecord {
  notes: string[]
  netTargetPct?: number
  macro: { level: string; riskOffHeadlines: string[] } | null
  lastTickAt: string | null
}

export interface PaperReport {
  state: PaperDayLive | null
  history: PaperDayRecord[]
}

/** Polls the Worker's public, read-only /paper/report (the mock-trading ledger written by the scheduled scan). */
export function usePaperReport() {
  const [report, setReport] = useState<PaperReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const proxyUrl = upstoxConfig?.proxyUrl ?? growwConfig?.proxyUrl
    if (!proxyUrl) {
      setError('no data service configured in this build (local dev needs a .env.local)')
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        const response = await fetch(`${proxyUrl}/paper/report`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = (await response.json()) as PaperReport
        if (!cancelled) {
          setReport(data)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the track record.')
      }
    }
    load()
    const timer = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  return { report, error }
}
