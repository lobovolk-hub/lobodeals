'use client'

import { useMemo, useState } from 'react'

type PriceHistoryRow = {
  observed_at: string
  price_kind: string
  price_amount: number
}

type GroupedPoint = {
  date: string
  regular: number | null
  psPlus: number | null
}

type Segment = {
  start: string
  end: string
  regular: number | null
  psPlus: number | null
}

type TooltipState = {
  x: number
  y: number
  date: string
  label: string
  amount: number
} | null

type PriceHistoryChartProps = {
  rows: PriceHistoryRow[]
  basePriceAmount: number | null
  currencyCode?: string | null
  dealEndsAt?: string | null
}

function formatPrice(amount: number | null, currencyCode?: string | null) {
  if (amount === null) return '—'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode || 'USD',
  }).format(amount)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function toDayString(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toISOString().slice(0, 10)
}

function isPastDate(value: string | null | undefined) {
  if (!value) return false
  return new Date(value).getTime() < Date.now()
}

function normalizeRows(rows: PriceHistoryRow[]) {
  const now = new Date()
  const cutoff = new Date()
  cutoff.setFullYear(now.getFullYear() - 2)

  return rows
    .filter((row) => new Date(row.observed_at) >= cutoff)
    .sort(
      (a, b) =>
        new Date(a.observed_at).getTime() - new Date(b.observed_at).getTime()
    )
}

function groupRowsByDay(rows: PriceHistoryRow[]): GroupedPoint[] {
  const grouped = new Map<string, GroupedPoint>()

  for (const row of rows) {
    const day = row.observed_at.slice(0, 10)

    const current = grouped.get(day) || {
      date: day,
      regular: null,
      psPlus: null,
    }

    if (row.price_kind === 'regular') {
      current.regular = row.price_amount
    }

    if (row.price_kind === 'ps_plus') {
      current.psPlus = row.price_amount
    }

    grouped.set(day, current)
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )
}

function buildSegments(
  points: GroupedPoint[],
  basePrice: number,
  dealEndsAt?: string | null
): Segment[] {
  if (points.length === 0) return []

  const today = toDayString(new Date())
  const segments: Segment[] = []

  let currentRegular: number | null = null
  let currentPsPlus: number | null = null

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]

    if (point.regular !== null) {
      currentRegular = point.regular
    }

    if (point.psPlus !== null) {
      currentPsPlus = point.psPlus
    }

    const nextPoint = points[index + 1]
    const end = nextPoint?.date || today

    segments.push({
      start: point.date,
      end,
      regular: currentRegular,
      psPlus: currentPsPlus,
    })
  }

  if (dealEndsAt && isPastDate(dealEndsAt)) {
    const dealEndDay = toDayString(dealEndsAt)
    const lastSegment = segments[segments.length - 1]

    if (
      lastSegment &&
      lastSegment.start < dealEndDay &&
      dealEndDay < lastSegment.end
    ) {
      lastSegment.end = dealEndDay

      segments.push({
        start: dealEndDay,
        end: today,
        regular: basePrice,
        psPlus: null,
      })
    }
  }

  return segments.filter((segment) => segment.start <= segment.end)
}

function getTickDates(start: string, end: string, count = 5) {
  const startMs = new Date(`${start}T00:00:00`).getTime()
  const endMs = new Date(`${end}T00:00:00`).getTime()

  if (endMs <= startMs) return [start]

  const ticks: string[] = []

  for (let index = 0; index < count; index += 1) {
    const ratio = index / (count - 1)
    const value = new Date(startMs + (endMs - startMs) * ratio)
      .toISOString()
      .slice(0, 10)

    ticks.push(value)
  }

  return ticks
}

function shouldShowRegular(segment: Segment, basePrice: number) {
  return segment.regular !== null && segment.regular < basePrice
}

function shouldShowPsPlus(segment: Segment, basePrice: number) {
  if (segment.psPlus === null) return false
  if (segment.psPlus >= basePrice) return false

  if (segment.regular !== null && segment.psPlus >= segment.regular) {
    return false
  }

  return true
}

function getAxisValues(basePrice: number, segments: Segment[]) {
  const values = new Set<number>()
  values.add(basePrice)

  for (const segment of segments) {
    if (shouldShowRegular(segment, basePrice) && segment.regular !== null) {
      values.add(segment.regular)
    }

    if (shouldShowPsPlus(segment, basePrice) && segment.psPlus !== null) {
      values.add(segment.psPlus)
    }
  }

  return Array.from(values).sort((a, b) => b - a)
}

export function PriceHistoryChart({
  rows,
  basePriceAmount,
  currencyCode,
  dealEndsAt,
}: PriceHistoryChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const normalizedRows = useMemo(() => normalizeRows(rows), [rows])
  const points = useMemo(() => groupRowsByDay(normalizedRows), [normalizedRows])

  const observedValues = normalizedRows
    .map((row) => row.price_amount)
    .filter((value) => Number.isFinite(value))

  const fallbackBase =
    observedValues.length > 0 ? Math.max(...observedValues) : null

  const basePrice = basePriceAmount ?? fallbackBase

  const segments = useMemo(() => {
    if (!basePrice) return []
    return buildSegments(points, basePrice, dealEndsAt)
  }, [points, basePrice, dealEndsAt])

  if (!basePrice || points.length === 0 || segments.length === 0) {
    return null
  }

  const startDate = segments[0].start
  const endDate = segments[segments.length - 1].end

  const width = 920
  const height = 330
  const paddingLeft = 86
  const paddingRight = 28
  const paddingTop = 28
  const paddingBottom = 44

  const graphWidth = width - paddingLeft - paddingRight
  const graphHeight = height - paddingTop - paddingBottom

  const axisValues = getAxisValues(basePrice, segments)
  const minVisibleValue = Math.min(...axisValues)
  const maxVisibleValue = Math.max(...axisValues)

  const startMs = new Date(`${startDate}T00:00:00`).getTime()
  const endMs = new Date(`${endDate}T00:00:00`).getTime()
  const totalMs = Math.max(endMs - startMs, 24 * 60 * 60 * 1000)

  const getX = (dateValue: string) => {
    const valueMs = new Date(`${dateValue}T00:00:00`).getTime()
    return paddingLeft + ((valueMs - startMs) / totalMs) * graphWidth
  }

  const getY = (value: number) => {
    if (maxVisibleValue === minVisibleValue) {
      return paddingTop + graphHeight / 2
    }

    return (
      paddingTop +
      ((maxVisibleValue - value) / (maxVisibleValue - minVisibleValue)) *
        graphHeight
    )
  }

  const tickDates = getTickDates(startDate, endDate)

  function renderDot({
    x,
    y,
    date,
    label,
    amount,
    className,
  }: {
    x: number
    y: number
    date: string
    label: string
    amount: number
    className: string
  }) {
    return (
      <g key={`${label}-${date}-${x}-${y}`}>
        <circle cx={x} cy={y} r="4" className={className} />

        <circle
          cx={x}
          cy={y}
          r="9"
          fill="transparent"
          className="cursor-pointer"
          onMouseEnter={() =>
            setTooltip({
              x,
              y,
              date,
              label,
              amount,
            })
          }
          onMouseMove={() =>
            setTooltip({
              x,
              y,
              date,
              label,
              amount,
            })
          }
        />
      </g>
    )
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 md:p-8">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-black tracking-tight">Price history</h2>

        <div className="flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-zinc-600 px-3 py-1 text-white">
            Base
          </span>
          <span className="rounded-full bg-emerald-400 px-3 py-1 text-black">
            Deal
          </span>
          <span className="rounded-full bg-yellow-400 px-3 py-1 text-black">
            PS+ Deal
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[780px]"
          role="img"
          aria-label="Price history chart"
          onMouseLeave={() => setTooltip(null)}
        >
          <line
            x1={paddingLeft}
            y1={paddingTop}
            x2={paddingLeft}
            y2={height - paddingBottom}
            className="stroke-zinc-700"
            strokeWidth="1"
          />

          <line
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            className="stroke-zinc-700"
            strokeWidth="1"
          />

          {axisValues.map((value) => {
            const y = getY(value)
            const isBase = Math.abs(value - basePrice) < 0.01

            return (
              <g key={value}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  className={isBase ? 'stroke-zinc-300' : 'stroke-zinc-800'}
                  strokeWidth={isBase ? '2' : '1'}
                  strokeDasharray={isBase ? '8 8' : '0'}
                />

                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className={
                    isBase
                      ? 'fill-zinc-300 text-[12px]'
                      : 'fill-zinc-500 text-[12px]'
                  }
                >
                  {formatPrice(value, currencyCode)}
                </text>
              </g>
            )
          })}

          {segments.map((segment, index) => {
            if (!shouldShowRegular(segment, basePrice)) return null
            if (segment.regular === null) return null

            const x1 = getX(segment.start)
            const x2 = getX(segment.end)
            const y = getY(segment.regular)

            return (
              <g key={`regular-line-${segment.start}-${index}`}>
                <line
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  className="stroke-emerald-300"
                  strokeWidth="4"
                  strokeLinecap="round"
                />

                {renderDot({
                  x: x1,
                  y,
                  date: segment.start,
                  label: 'Deal',
                  amount: segment.regular,
                  className: 'fill-emerald-300',
                })}

                {renderDot({
                  x: x2,
                  y,
                  date: segment.end,
                  label: 'Deal',
                  amount: segment.regular,
                  className: 'fill-emerald-300',
                })}
              </g>
            )
          })}

          {segments.slice(0, -1).map((segment, index) => {
            const nextSegment = segments[index + 1]

            const currentValue = segment.regular ?? basePrice
            const nextValue = nextSegment.regular ?? basePrice

            if (Math.abs(currentValue - nextValue) < 0.01) return null
            if (currentValue >= basePrice && nextValue >= basePrice) return null

            const x = getX(segment.end)

            return (
              <line
                key={`regular-join-${segment.end}-${index}`}
                x1={x}
                y1={getY(currentValue)}
                x2={x}
                y2={getY(nextValue)}
                className="stroke-emerald-300"
                strokeWidth="4"
                strokeLinecap="round"
              />
            )
          })}

          {segments.map((segment, index) => {
            if (!shouldShowPsPlus(segment, basePrice)) return null
            if (segment.psPlus === null) return null

            const x1 = getX(segment.start)
            const x2 = getX(segment.end)
            const y = getY(segment.psPlus)

            return (
              <g key={`psplus-line-${segment.start}-${index}`}>
                <line
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  className="stroke-yellow-300"
                  strokeWidth="4"
                  strokeLinecap="round"
                />

                {renderDot({
                  x: x1,
                  y,
                  date: segment.start,
                  label: 'PS+ Deal',
                  amount: segment.psPlus,
                  className: 'fill-yellow-300',
                })}

                {renderDot({
                  x: x2,
                  y,
                  date: segment.end,
                  label: 'PS+ Deal',
                  amount: segment.psPlus,
                  className: 'fill-yellow-300',
                })}
              </g>
            )
          })}

          {segments.slice(0, -1).map((segment, index) => {
            const nextSegment = segments[index + 1]

            const currentVisible =
              shouldShowPsPlus(segment, basePrice) && segment.psPlus !== null
                ? segment.psPlus
                : basePrice

            const nextVisible =
              shouldShowPsPlus(nextSegment, basePrice) &&
              nextSegment.psPlus !== null
                ? nextSegment.psPlus
                : basePrice

            if (Math.abs(currentVisible - nextVisible) < 0.01) return null
            if (currentVisible >= basePrice && nextVisible >= basePrice) return null

            const x = getX(segment.end)

            return (
              <line
                key={`psplus-join-${segment.end}-${index}`}
                x1={x}
                y1={getY(currentVisible)}
                x2={x}
                y2={getY(nextVisible)}
                className="stroke-yellow-300"
                strokeWidth="4"
                strokeLinecap="round"
              />
            )
          })}

                    {tickDates.map((tick, index) => {
            const x = getX(tick)

            return (
              <g key={`${tick}-${index}`}>
                <line
                  x1={x}
                  y1={height - paddingBottom}
                  x2={x}
                  y2={height - paddingBottom + 6}
                  className="stroke-zinc-600"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={height - 12}
                  textAnchor="middle"
                  className="fill-zinc-500 text-[11px]"
                >
                  {formatDate(tick)}
                </text>
              </g>
            )
          })}

          {tooltip ? (
            <g
              transform={`translate(${Math.min(
                Math.max(tooltip.x + 12, paddingLeft),
                width - paddingRight - 150
              )}, ${Math.max(tooltip.y - 58, paddingTop)})`}
            >
              <rect
                width="138"
                height="48"
                rx="10"
                className="fill-black stroke-zinc-700"
              />
              <text x="10" y="18" className="fill-white text-[11px] font-bold">
                {formatDate(tooltip.date)}
              </text>
              <text
                x="10"
                y="34"
                className={
                  tooltip.label === 'PS+ Deal'
                    ? 'fill-yellow-300 text-[11px] font-bold'
                    : 'fill-emerald-300 text-[11px] font-bold'
                }
              >
                {tooltip.label}: {formatPrice(tooltip.amount, currencyCode)}
              </text>
            </g>
          ) : null}
        </svg>
      </div>
    </section>
  )
}   