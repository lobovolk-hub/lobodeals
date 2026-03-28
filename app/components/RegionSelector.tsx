'use client'

import { useEffect, useState } from 'react'
import {
  REGION_OPTIONS,
  REGION_STORAGE_KEY,
  RegionCode,
  isRegionCode,
} from '@/lib/region'

export default function RegionSelector({
  compact = false,
}: {
  compact?: boolean
}) {
  const [region, setRegion] = useState<RegionCode>('GLOBAL')

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(REGION_STORAGE_KEY)
        : null

    if (stored && isRegionCode(stored)) {
      setRegion(stored)
    }
  }, [])

  const handleChange = (nextRegion: string) => {
    if (!isRegionCode(nextRegion)) return

    setRegion(nextRegion)
    window.localStorage.setItem(REGION_STORAGE_KEY, nextRegion)
    window.dispatchEvent(
      new CustomEvent('lobodeals-region-change', {
        detail: nextRegion,
      })
    )
  }

  return (
    <div
      className={
        compact
          ? 'flex items-center gap-2'
          : 'flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3'
      }
    >
      {!compact && (
        <label className="text-xs uppercase tracking-wider text-zinc-500">
          Region
        </label>
      )}

      <select
        value={region}
        onChange={(e) => handleChange(e.target.value)}
        className={
          compact
            ? 'rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none'
            : 'rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none'
        }
      >
        {REGION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}