'use client'

import { useEffect, useState } from 'react'
import { CampaignCard } from '@/components/campaign-card'
import {
  getNextExactBoundary,
  groupCampaigns,
  type OfficialCampaign,
} from '@/lib/sales'

type CampaignSectionsProps = {
  campaigns: readonly OfficialCampaign[]
  idPrefix: string
  showStore?: boolean
}

const MAX_TIMEOUT_DELAY = 2_147_000_000
const BOUNDARY_SETTLE_DELAY = 50

export function CampaignSections({
  campaigns,
  idPrefix,
  showStore = true,
}: CampaignSectionsProps) {
  const [currentTime, setCurrentTime] = useState<number | null>(null)

  useEffect(() => {
    let boundaryUpdate: number | undefined

    const updateCurrentTime = () => {
      const now = Date.now()
      setCurrentTime(now)

      const nextBoundary = getNextExactBoundary(campaigns, now)

      if (nextBoundary !== null) {
        const delay = Math.min(
          nextBoundary - now + BOUNDARY_SETTLE_DELAY,
          MAX_TIMEOUT_DELAY
        )

        boundaryUpdate = window.setTimeout(updateCurrentTime, delay)
      }
    }

    const initialUpdate = window.setTimeout(updateCurrentTime, 0)

    return () => {
      window.clearTimeout(initialUpdate)
      if (boundaryUpdate !== undefined) window.clearTimeout(boundaryUpdate)
    }
  }, [campaigns])

  const groups = groupCampaigns(
    campaigns,
    currentTime === null ? undefined : new Date(currentTime)
  )

  return (
    <>
      <section
        aria-labelledby={`${idPrefix}-live-heading`}
        className="border-t border-white/10"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c84b4b]">
            Active official campaigns
          </p>
          <h2
            id={`${idPrefix}-live-heading`}
            className="mt-2 text-2xl font-semibold tracking-tight text-white"
          >
            Live now
          </h2>
          {groups.live.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {groups.live.map(({ campaign, store }) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  store={store}
                  state="live"
                  showStore={showStore}
                />
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-lg border border-dashed border-white/15 bg-[#171717] px-5 py-5 text-sm leading-6 text-[#9b9a98]">
              No live official store campaigns are available in the current
              Sales feed.
            </p>
          )}
        </div>
      </section>

      <section
        aria-labelledby={`${idPrefix}-upcoming-heading`}
        className="border-t border-white/10"
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71706e]">
            Announced official campaigns
          </p>
          <h2
            id={`${idPrefix}-upcoming-heading`}
            className="mt-2 text-2xl font-semibold tracking-tight text-white"
          >
            Upcoming
          </h2>
          {groups.upcoming.length > 0 ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {groups.upcoming.map(({ campaign, store }) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  store={store}
                  state="upcoming"
                  showStore={showStore}
                />
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-lg border border-dashed border-white/15 bg-[#171717] px-5 py-5 text-sm leading-6 text-[#9b9a98]">
              No upcoming official store campaigns are available in the current
              Sales feed.
            </p>
          )}
        </div>
      </section>
    </>
  )
}
