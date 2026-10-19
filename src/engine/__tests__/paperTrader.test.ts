import { describe, expect, it } from 'vitest'
import { PAPER_COST_RATES } from '../costs'
import {
  DEFAULT_PAPER_POLICY,
  assessMacro,
  breadthStandAside,
  netPnl,
  newBook,
  planEntry,
  ratioVeto,
  splitCompleted,
  summarizeBook,
  targetForNetPct,
  tickBook,
  type Candidate,
  type PaperPolicy,
} from '../paperTrader'
import type { Candle } from '../../types'

const bar = (time: string, o: number, h: number, l: number, c: number): Candle => ({ time, open: o, high: h, low: l, close: c, volume: 1000 })
const policy: PaperPolicy = { ...DEFAULT_PAPER_POLICY, netTargetPct: 0.003 }
const cand = (over: Partial<Candidate> = {}): Candidate => ({ symbol: 'ABC', name: 'ABC Ltd', fillPrice: 100, fillBarTime: '10:00', atr: 0.5, score: 40, ...over })

describe('targetForNetPct', () => {
  it('returns a target whose net profit is exactly the required share of buy value', () => {
    const t = targetForNetPct(100, 50, 0.003, PAPER_COST_RATES)!
    const { net } = netPnl(100, t, 50, PAPER_COST_RATES)
    expect(net).toBeGreaterThanOrEqual(100 * 50 * 0.003)
    expect(net).toBeLessThan(100 * 50 * 0.003 + 1)
  })
  it('target gross move exceeds net bar because costs must be covered first', () => {
    const t = targetForNetPct(100, 50, 0.003, PAPER_COST_RATES)!
    expect((t - 100) / 100).toBeGreaterThan(0.003)
  })
})

describe('splitCompleted', () => {
  it('treats a bar as forming until its 5 minutes elapse', () => {
    const c = [bar('10:00', 1, 1, 1, 1), bar('10:05', 1, 1, 1, 1)]
    const r = splitCompleted(c, '10:07')
    expect(r.completed.map((x) => x.time)).toEqual(['10:00'])
    expect(r.forming?.time).toBe('10:05')
  })
})

describe('planEntry', () => {
  it('refuses a 3% net target when ATR says it is not plausible', () => {
    const r = planEntry(cand(), 20000, 20000, DEFAULT_PAPER_POLICY)
    expect('reason' in r).toBe(true)
  })
  it('plans a 0.3% net trade when ATR allows it, respecting the position cap', () => {
    const r = planEntry(cand({ atr: 0.4 }), 20000, 20000, policy)
    expect('plan' in r).toBe(true)
    if ('plan' in r) {
      expect(r.plan.qty * 100).toBeLessThanOrEqual(20000 * 0.4)
      expect(r.plan.target).toBeGreaterThan(100)
      expect(r.plan.stop).toBeLessThan(100)
    }
  })
})

describe('tickBook exits', () => {
  const open = () => {
    const book = newBook(20000)
    book.open.push({ symbol: 'ABC', name: 'ABC', qty: 50, entryPrice: 100, entryBarTime: '10:00', entryTime: '10:07', stop: 99, target: 101, score: 40 })
    return book
  }
  const run = (book: ReturnType<typeof open>, bars: Candle[], now: string) =>
    tickBook(book, { nowHHMM: now, nowMs: 0, candlesBySymbol: { ABC: bars }, candidates: [], standAside: null }, policy, [])

  it('exits at target and charges costs', () => {
    const book = open()
    run(book, [bar('10:00', 100, 100, 100, 100), bar('10:05', 100, 101.2, 100, 101)], '10:12')
    expect(book.closed[0].exitReason).toBe('TARGET')
    expect(book.closed[0].netPnl).toBeLessThan(book.closed[0].grossPnl)
  })
  it('assumes stop first when one bar touches both', () => {
    const book = open()
    run(book, [bar('10:05', 100, 102, 98.5, 100)], '10:12')
    expect(book.closed[0].exitReason).toBe('STOP')
  })
  it('fills a gap-down at the open, not the stop', () => {
    const book = open()
    run(book, [bar('10:05', 97, 98, 96, 97)], '10:12')
    expect(book.closed[0].exitPrice).toBe(97)
  })
  it('squares off at the close after the cutoff', () => {
    const book = open()
    run(book, [bar('15:10', 100, 100.4, 99.8, 100.2)], '15:16')
    expect(book.closed[0].exitReason).toBe('SQUARE_OFF')
    expect(book.open).toHaveLength(0)
  })
})

describe('tickBook entries', () => {
  const input = (now: string, standAside: string | null = null) => ({ nowHHMM: now, nowMs: 0, candlesBySymbol: {}, candidates: [cand({ atr: 0.4 })], standAside })
  it('does not enter outside the window or when standing aside', () => {
    const a = newBook(20000), b = newBook(20000)
    tickBook(a, input('09:20'), policy, [])
    tickBook(b, input('10:00', 'risk-off'), policy, [])
    expect(a.open).toHaveLength(0)
    expect(b.open).toHaveLength(0)
  })
  it('enters once and never re-enters the same symbol', () => {
    const book = newBook(20000)
    tickBook(book, input('10:00'), policy, [])
    tickBook(book, input('10:05'), policy, [])
    expect(book.open).toHaveLength(1)
  })
})

describe('summaries and gates', () => {
  it('reports net % of buy turnover and target status', () => {
    const book = newBook(20000)
    tickBook(book, { nowHHMM: '10:00', nowMs: 0, candlesBySymbol: {}, candidates: [cand({ atr: 0.4 })], standAside: null }, policy, [])
    const pos = book.open[0]
    tickBook(book, { nowHHMM: '10:30', nowMs: 0, candlesBySymbol: { ABC: [bar('10:05', 100, pos.target + 0.1, 100, pos.target)] }, candidates: [], standAside: null }, policy, [])
    const s = summarizeBook(book, 0.003)
    expect(s.trades).toBe(1)
    expect(s.meetsTarget).toBe(true)
    expect(s.netPctOfTurnover).toBeGreaterThanOrEqual(0.3)
  })
  it('flags macro risk only with several risk-off headlines', () => {
    expect(assessMacro(['war escalates', 'calm day']).level).toBe('NORMAL')
    expect(assessMacro(['war escalates', 'missile strike', 'oil surges', 'market crash fears']).level).toBe('ELEVATED')
  })
  it('stands aside on broad weakness', () => {
    expect(breadthStandAside(Array(20).fill(-1.5))).not.toBeNull()
    expect(breadthStandAside(Array(20).fill(0.2))).toBeNull()
  })
})

describe('ratioVeto', () => {
  const r = (pe: string, sector: string, roe = '10%') => [
    { name: 'P/E', companyValue: pe, sectorValue: sector },
    { name: 'ROE', companyValue: roe, sectorValue: '15%' },
  ]
  it('vetoes negative ROE and P/E over 3x sector, passes ordinary names and missing data', () => {
    expect(ratioVeto(r('20', '12', '-4%'))).toMatch(/negative ROE/)
    expect(ratioVeto(r('50', '12'))).toMatch(/over 3x/)
    expect(ratioVeto(r('20', '12'))).toBeNull()
    expect(ratioVeto(undefined)).toBeNull()
  })
})
