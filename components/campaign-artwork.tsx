'use client'

import { useState } from 'react'
import { StoreLogo } from '@/components/store-logo'
import { getStoreVisualClassName } from '@/lib/store-visuals'
import type { Store } from '@/lib/stores'
import type { CampaignState } from '@/lib/sales'

type CampaignArtworkProps = {
  artworkUrl?: string
  campaignName: string
  compact: boolean
  state: Extract<CampaignState, 'live' | 'upcoming'>
  store: Store
}

function ArtworkFallback({
  campaignName,
  compact,
  state,
  store,
}: Omit<CampaignArtworkProps, 'artworkUrl'>) {
  return (
    <div
      data-artwork-fallback
      className={`relative aspect-video overflow-hidden bg-gradient-to-br ${getStoreVisualClassName(
        store.slug
      )}`}
    >
      <div
        className={`pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full blur-3xl ${
          state === 'live' ? 'bg-[#990303]/35' : 'bg-white/10'
        }`}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-14 h-48 w-48 rounded-full bg-black/45 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-5 top-1/2 h-px -rotate-6 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        aria-hidden="true"
      />
      <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-2 text-white/70">
          <div className="rounded-md border border-white/10 bg-black/15 px-1">
            <StoreLogo store={store} variant="mini" />
          </div>
          <span className="truncate text-[0.62rem] font-black uppercase tracking-[0.14em]">
            {store.name}
          </span>
        </div>

        <p
          data-campaign-title-art
          aria-hidden="true"
          className={`line-clamp-3 max-w-[92%] text-balance font-black uppercase leading-[0.92] tracking-[-0.045em] text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform duration-200 group-hover:translate-x-0.5 ${
            compact ? 'text-2xl sm:text-[1.7rem]' : 'text-3xl sm:text-[2rem]'
          }`}
        >
          {campaignName}
        </p>

        <div className="flex items-center gap-2 text-[0.6rem] font-bold uppercase tracking-[0.18em] text-white/55">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              state === 'live' ? 'bg-[#ef7777]' : 'bg-white/45'
            }`}
            aria-hidden="true"
          />
          Official sale campaign
        </div>
      </div>
    </div>
  )
}

export function CampaignArtwork({
  artworkUrl,
  campaignName,
  compact,
  state,
  store,
}: CampaignArtworkProps) {
  const [failed, setFailed] = useState(false)

  if (!artworkUrl || failed) {
    return (
      <ArtworkFallback
        campaignName={campaignName}
        compact={compact}
        state={state}
        store={store}
      />
    )
  }

  return (
    <div className="relative aspect-video overflow-hidden bg-[#111]">
      {/* Official remote metadata can use many first-party CDNs, so this MVP
          intentionally avoids a server image proxy and its SSRF surface. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={artworkUrl}
        alt={`${campaignName} official campaign artwork`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        onError={(event) => {
          event.currentTarget.hidden = true
          setFailed(true)
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent"
        aria-hidden="true"
      />
    </div>
  )
}
