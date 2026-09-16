import { useId, useMemo, useState } from 'react'
import type { Candle } from '../types'
import { inr } from '../lib/allocation'

interface CandlestickChartProps {
  candles: Candle[]
  symbol: string
  positive: boolean
}

const WIDTH = 760
const HEIGHT = 286
const PAD = { top: 18, right: 72, bottom: 30, left: 16 }

export default function CandlestickChart({ candles, symbol, positive }: CandlestickChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const rawId = useId()
  const gradientId = `chart-${rawId.replace(/:/g, '')}`

  const chart = useMemo(() => {
    const minimum = Math.min(...candles.map((candle) => candle.low))
    const maximum = Math.max(...candles.map((candle) => candle.high))
    const padding = (maximum - minimum) * 0.14 || 1
    const low = minimum - padding
    const high = maximum + padding
    const innerWidth = WIDTH - PAD.left - PAD.right
    const innerHeight = HEIGHT - PAD.top - PAD.bottom
    const step = innerWidth / candles.length
    const y = (value: number) => PAD.top + ((high - value) / (high - low)) * innerHeight
    const x = (index: number) => PAD.left + step * index + step / 2

    let cumulativeVolume = 0
    let cumulativePriceVolume = 0
    const vwap = candles.map((candle) => {
      const typical = (candle.high + candle.low + candle.close) / 3
      cumulativeVolume += candle.volume
      cumulativePriceVolume += typical * candle.volume
      return cumulativePriceVolume / cumulativeVolume
    })
    const ema: number[] = []
    const multiplier = 2 / (5 + 1)
    candles.forEach((candle, index) => {
      ema.push(index === 0 ? candle.close : candle.close * multiplier + ema[index - 1] * (1 - multiplier))
    })

    const makePath = (values: number[]) =>
      values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(value)}`).join(' ')

    return { low, high, x, y, step, vwapPath: makePath(vwap), emaPath: makePath(ema) }
  }, [candles])

  const active = hovered === null ? candles.length - 1 : hovered
  const candle = candles[active]
  const movement = candle.close - candle.open

  return (
    <div className="chart-shell">
      <div className="chart-legend" aria-live="polite">
        <span className="chart-symbol">{symbol}</span>
        <span>O&nbsp; {inr(candle.open, 2)}</span>
        <span>H&nbsp; {inr(candle.high, 2)}</span>
        <span>L&nbsp; {inr(candle.low, 2)}</span>
        <span className={movement >= 0 ? 'text-buy' : 'text-exit'}>C&nbsp; {inr(candle.close, 2)}</span>
      </div>

      <svg
        className="candlestick-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${symbol} illustrative five-minute candlestick chart`}
        onMouseLeave={() => setHovered(null)}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const relativeX = ((event.clientX - rect.left) / rect.width) * WIDTH - PAD.left
          const index = Math.max(0, Math.min(candles.length - 1, Math.floor(relativeX / chart.step)))
          setHovered(index)
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={positive ? '#147d64' : '#c64f55'} stopOpacity="0.16" />
            <stop offset="100%" stopColor={positive ? '#147d64' : '#c64f55'} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const value = chart.high - (chart.high - chart.low) * tick
          const y = PAD.top + (HEIGHT - PAD.top - PAD.bottom) * tick
          return (
            <g key={tick}>
              <line x1={PAD.left} y1={y} x2={WIDTH - PAD.right + 10} y2={y} className="chart-gridline" />
              <text x={WIDTH - PAD.right + 18} y={y + 4} className="chart-axis-label">
                {value.toFixed(0)}
              </text>
            </g>
          )
        })}

        {candles.map((item, index) => {
          const x = chart.x(index)
          const isUp = item.close >= item.open
          const bodyY = chart.y(Math.max(item.open, item.close))
          const bodyHeight = Math.max(2, Math.abs(chart.y(item.open) - chart.y(item.close)))
          return (
            <g key={`${item.time}-${index}`} className={hovered === index ? 'candle candle-active' : 'candle'}>
              <line
                x1={x}
                x2={x}
                y1={chart.y(item.high)}
                y2={chart.y(item.low)}
                className={isUp ? 'candle-up' : 'candle-down'}
              />
              <rect
                x={x - Math.min(10, chart.step * 0.24)}
                width={Math.min(20, chart.step * 0.48)}
                y={bodyY}
                height={bodyHeight}
                rx="2"
                className={isUp ? 'candle-up-fill' : 'candle-down-fill'}
              />
              {(index === 0 || index === candles.length - 1 || index % 3 === 0) && (
                <text x={x} y={HEIGHT - 9} textAnchor="middle" className="chart-axis-label">
                  {item.time}
                </text>
              )}
            </g>
          )
        })}

        <path d={chart.vwapPath} className="vwap-line" />
        <path d={chart.emaPath} className="ema-line" />

        {hovered !== null && (
          <g className="crosshair">
            <line
              x1={chart.x(hovered)}
              x2={chart.x(hovered)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
            />
            <circle cx={chart.x(hovered)} cy={chart.y(candle.close)} r="4.5" />
          </g>
        )}
      </svg>

      <div className="chart-key" aria-hidden="true">
        <span><i className="key-line key-ema" /> EMA 5</span>
        <span><i className="key-line key-vwap" /> VWAP</span>
        <span className="demo-chart-label">Illustrative replay</span>
      </div>
    </div>
  )
}
