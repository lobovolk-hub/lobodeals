'use client'

import { useEffect, useState } from 'react'
import {
  DEFAULT_REGION,
  REGION_OPTIONS,
  REGION_STORAGE_KEY,
  RegionCode,
  getRegionShortLabel,
  isRegionCode,
} from '@/lib/region'

type RegionSelectorProps = {
  compact?: boolean
}

export default function RegionSelector({
  compact = false,
}: RegionSelectorProps) {
  const [region, setRegion] = useState<RegionCode>(DEFAULT_REGION)

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(REGION_STORAGE_KEY)
        : null

    if (stored && isRegionCode(stored)) {
      setRegion(stored)
      return
    }

    setRegion(DEFAULT_REGION)
  }, [])

  const handleChange = (nextValue: string) => {
    if (!isRegionCode(nextValue)) return

    setRegion(nextValue)

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REGION_STORAGE_KEY, nextValue)
      window.dispatchEvent(
        new CustomEvent('lobodeals-region-change', {
          detail: nextValue,
        })
      )
    }
  }

  return (
    <div className={compact ? 'inline-flex items-center' : 'flex flex-col gap-2'}>
      {!compact ? (
        <label className="text-sm font-medium text-zinc-300">
          Region
        </label>
      ) : null}

      <select
        value={region}
        onChange={(e) => handleChange(e.target.value)}
        className={`rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-100 outline-none ${
          compact ? 'min-w-[72px] px-3 py-2 text-sm' : 'px-4 py-3 text-sm'
        }`}
      >
        {REGION_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {getRegionShortLabel(option)}
          </option>
        ))}
      </select>
    </div>
  )
}