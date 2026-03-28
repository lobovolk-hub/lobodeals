'use client'

import { useEffect, useState } from 'react'
import {
  getRegionDescription,
  getRegionLabel,
  getRegionShortNote,
  REGION_STORAGE_KEY,
  RegionCode,
  isRegionCode,
} from '@/lib/region'

export default function RegionNotice({
  compact = false,
}: {
  compact?: boolean
}) {
  const [region, setRegion] = useState<RegionCode>('GLOBAL')

  useEffect(() => {
    const loadRegion = () => {
      const stored =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(REGION_STORAGE_KEY)
          : null

      if (stored && isRegionCode(stored)) {
        setRegion(stored)
      } else {
        setRegion('GLOBAL')
      }
    }

    loadRegion()

    const handleRegionChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      const nextRegion = customEvent.detail

      if (nextRegion && isRegionCode(nextRegion)) {
        setRegion(nextRegion)
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
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
        <span className="font-medium text-zinc-200">
          Region: {getRegionLabel(region)}
        </span>{' '}
        · {getRegionShortNote(region)}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
      <p className="text-sm font-medium text-amber-200">
        Region: {getRegionLabel(region)}
      </p>
      <p className="mt-1 text-sm text-amber-100/80">
        {getRegionDescription(region)}
      </p>
    </div>
  )
}