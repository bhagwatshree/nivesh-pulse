// Reads/writes the paper-trading ledger in the Worker's KV
// (/internal/paper/{state,history}). Shared by the scan and the report.

import type { PaperBook, PaperDayState, BookSummary } from '../../src/engine/paperTrader'

export const PROXY_URL = process.env.PROXY_URL ?? 'https://nivesh-pulse-upstox-proxy.bhagwatshree.workers.dev'

export interface DayRecord {
  date: string
  ticks: number
  firstTickAt: string | null
  lastTickAt: string | null
  macroLevel: string | null
  summaries: BookSummary[]
  books: Record<string, PaperBook>
  reported: boolean
}

function headers(secret: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` }
}

export async function loadPaper<T>(name: 'state' | 'history', secret: string): Promise<T | null> {
  const response = await fetch(`${PROXY_URL}/internal/paper/${name}`, { headers: headers(secret) })
  if (!response.ok) throw new Error(`Loading paper ${name} failed: HTTP ${response.status}`)
  return (await response.json()) as T | null
}

export async function savePaper(name: 'state' | 'history', value: unknown, secret: string): Promise<void> {
  const response = await fetch(`${PROXY_URL}/internal/paper/${name}`, {
    method: 'POST',
    headers: headers(secret),
    body: JSON.stringify(value),
  })
  if (!response.ok) throw new Error(`Saving paper ${name} failed: HTTP ${response.status}`)
}

export type { PaperDayState }
