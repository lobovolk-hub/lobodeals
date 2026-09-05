'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CampaignCard } from '@/components/campaign-card'
import type { AnalyticsSurface } from '@/lib/analytics'
import { UpcomingCampaignList } from '@/components/upcoming-campaign-list'
import { UpcomingRail } from '@/components/upcoming-rail'
import {
  getNextExactBoundary,
  groupCampaigns,
  type OfficialCampaign,
} from '@/lib/sales'

type CampaignSectionsProps = {
  campaigns: readonly OfficialCampaign[]
  idPrefix: string
  analyticsSurface: AnalyticsSurface
  showStore?: boolean
  dataUnavailable?: boolean
  homePreview?: boolean
  emptyLiveMessage?: string
  emptyUpcomingMessage?: string
}

const MAX_TIMEOUT_DELAY = 2_147_000_000
const BOUNDARY_SETTLE_DELAY = 50

export function CampaignSections({
  campaigns,
  idPrefix,
  analyticsSurface,
  showStore = true,
  dataUnavailable = false,
  homePreview = false,
  emptyLiveMessage = 'No live official store campaigns are available in the current Sales feed.',
  emptyUpcomingMessage = 'No upcoming official store campaigns are available in the current Sales feed.',
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
      {dataUnavailable ? (
        <aside
          aria-label="Sales data availability"
          className="border-t border-amber-200/15 bg-amber-100/[0.035]"
        >
          <p className="mx-auto w-full max-w-7xl px-4 py-3 text-sm text-[#c8bda7] sm:px-6 lg:px-8">
            Sales data is temporarily unavailable.
          </p>
        </aside>
      ) : null}

      <section
        aria-labelledby={`${idPrefix}-live-heading`}
        className={`relative overflow-hidden border-t border-white/10 ${
          homePreview
            ? 'bg-[radial-gradient(circle_at_10%_10%,rgba(153,3,3,0.11),transparent_34%)]'
            : ''
        }`}
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
            <div
              className={`mt-5 grid gap-4 ${
                homePreview
                  ? 'md:grid-cols-2 xl:grid-cols-3'
                  : 'lg:grid-cols-2'
              }`}
            >
              {groups.live.map(({ campaign, store }) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  store={store}
                  state="live"
                  showStore={showStore}
                  analyticsSurface={analyticsSurface}
                />
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-lg border border-dashed border-white/15 bg-[#171717] px-5 py-5 text-sm leading-6 text-[#9b9a98]">
              {dataUnavailable
                ? 'Current campaign availability cannot be confirmed right now.'
                : emptyLiveMessage}
            </p>
          )}
        </div>
      </section>

      <section
        aria-labelledby={`${idPrefix}-upcoming-heading`}
        className={`overflow-x-clip border-t border-white/10 ${
          homePreview ? 'home-upcoming-section' : ''
        }`}
      >
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#71706e]">
                Announced official campaigns
              </p>
              <h2
                id={`${idPrefix}-upcoming-heading`}
                className="mt-2 text-2xl font-semibold tracking-tight text-white"
              >
                Upcoming
              </h2>
            </div>
            {homePreview && groups.upcoming.length > 0 ? (
              <Link
                href="/sales"
                className="inline-flex min-h-11 items-center text-sm font-bold text-white underline decoration-[#990303] decoration-2 underline-offset-4 transition-colors hover:text-[#ef7777]"
              >
                View all upcoming sales <span className="ml-2" aria-hidden="true">→</span>
              </Link>
            ) : null}
          </div>
          {groups.upcoming.length > 0 ? (
            homePreview ? (
              <UpcomingRail>
                {groups.upcoming.map(({ campaign, store }) => (
                  <div
                    key={campaign.id}
                    className="w-[min(84vw,21rem)] shrink-0 snap-start sm:w-[21rem] lg:w-[22rem]"
                  >
                    <CampaignCard
                      campaign={campaign}
                      store={store}
                      state="upcoming"
                      showStore={showStore}
                      analyticsSurface={analyticsSurface}
                      compact
                    />
                  </div>
                ))}
              </UpcomingRail>
            ) : (
              <UpcomingCampaignList
                campaigns={groups.upcoming}
                showStore={showStore}
                analyticsSurface={analyticsSurface}
              />
            )
          ) : (
            <p className="mt-5 rounded-lg border border-dashed border-white/15 bg-[#171717] px-5 py-5 text-sm leading-6 text-[#9b9a98]">
              {dataUnavailable
                ? 'Upcoming campaign availability cannot be confirmed right now.'
                : emptyUpcomingMessage}
            </p>
          )}
        </div>
      </section>
    </>
  )
}
