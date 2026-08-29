'use client'

import { CampaignTiming } from '@/components/campaign-timing'
import { StoreLogo } from '@/components/store-logo'
import {
  formatCompactCampaignBoundary,
  type CampaignBoundary,
  type CampaignWithStore,
} from '@/lib/sales'

type UpcomingCampaignListProps = {
  campaigns: readonly CampaignWithStore[]
  showStore: boolean
}

function dateTimeValue(boundary: CampaignBoundary): string {
  return boundary.precision === 'date' ? boundary.date : boundary.dateTime
}

function CampaignDateRange({
  starts,
  ends,
}: {
  starts?: CampaignBoundary
  ends?: CampaignBoundary
}) {
  if (!starts && !ends) return <span>Timing not published</span>

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {starts ? (
        <time dateTime={dateTimeValue(starts)}>
          {formatCompactCampaignBoundary(starts)}
        </time>
      ) : (
        <span>Start not published</span>
      )}
      {ends ? (
        <>
          <span aria-hidden="true">→</span>
          <time dateTime={dateTimeValue(ends)}>
            {formatCompactCampaignBoundary(ends)}
          </time>
        </>
      ) : null}
    </span>
  )
}

export function UpcomingCampaignList({
  campaigns,
  showStore,
}: UpcomingCampaignListProps) {
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-[#151515]">
      {campaigns.map(({ campaign, store }) => {
        const timing = campaign.starts
          ? { boundary: campaign.starts, label: 'Starts' as const }
          : campaign.ends
            ? { boundary: campaign.ends, label: 'Ends' as const }
            : null

        return (
          <article
            key={campaign.id}
            className="border-b border-white/10 last:border-b-0"
          >
            <a
              href={campaign.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View ${campaign.name} on ${store.name} (opens in a new tab)`}
              className="group grid min-h-24 gap-3 px-4 py-4 transition-colors hover:bg-white/[0.045] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#f87171] sm:px-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(13rem,0.8fr)_minmax(13rem,0.85fr)_auto] lg:items-center lg:gap-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                {showStore ? (
                  <div className="shrink-0 rounded-md border border-white/10 bg-white/[0.035]">
                    <StoreLogo store={store} variant="mini" />
                  </div>
                ) : null}
                <div className="min-w-0">
                  {showStore ? (
                    <p className="truncate text-[0.68rem] font-black uppercase tracking-[0.13em] text-[#8f8e8b]">
                      {store.name}
                    </p>
                  ) : null}
                  <h3 className="mt-1 text-base font-semibold leading-snug tracking-[-0.015em] text-white sm:text-lg">
                    {campaign.name}
                  </h3>
                </div>
              </div>

              <div className="[&>p]:mt-0">
                {timing ? (
                  <CampaignTiming
                    boundary={timing.boundary}
                    label={timing.label}
                    state="upcoming"
                  />
                ) : (
                  <p className="text-sm font-semibold text-[#9b9a98]">
                    Officially announced
                  </p>
                )}
              </div>

              <p className="text-sm tabular-nums text-[#aaa8a4]">
                <CampaignDateRange
                  starts={campaign.starts}
                  ends={campaign.ends}
                />
              </p>

              <span className="inline-flex min-h-11 items-center text-sm font-bold text-white transition-colors group-hover:text-[#ef7777] lg:justify-end">
                Official sale <span className="ml-2" aria-hidden="true">↗</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </span>
            </a>
          </article>
        )
      })}
    </div>
  )
}
