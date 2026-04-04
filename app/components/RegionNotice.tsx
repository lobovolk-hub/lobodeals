'use client'

import { useEffect, useState } from 'react'
import {
  DEFAULT_REGION,
  REGION_STORAGE_KEY,
  RegionCode,
  getRegionShortNote,
  isRegionCode,
} from '@/lib/region'

export default function RegionNotice({
  compact = false,
}: {
  compact?: boolean
}) {
  const [region, setRegion] = useState<RegionCode>(DEFAULT_REGION)

  useEffect(() => {
    const loadRegion = () => {
      const stored =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(REGION_STORAGE_KEY)
          : null

      if (stored && isRegionCode(stored)) {
        setRegion(stored)
        return
      }

      setRegion(DEFAULT_REGION)
    }

    loadRegion()

    const handleRegionChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      const value = customEvent.detail

      if (value && isRegionCode(value)) {
        setRegion(value)
      } else {
        loadRegion()
      }
    }

    window.addEventListener(
      'lobodeals-region-change',
      handleRegionChange as EventListener
    )

    return () => {
      window.removeEventListener(
        'lobodeals-region-change',
        handleRegionChange as EventListener
      )
    }
  }, [])

  if (compact) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-400">
        {getRegionShortNote(region)}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-400">
      {getRegionShortNote(region)}
    </div>
  )
}