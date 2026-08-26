import { StoreLogo } from '@/components/store-logo'
import {
  formatCampaignBoundary,
  type CampaignState,
  type CampaignWithStore,
} from '@/lib/sales'

type CampaignCardProps = CampaignWithStore & {
  state: Extract<CampaignState, 'live' | 'upcoming'>
  showStore: boolean
}

export function CampaignCard({
  campaign,
  store,
  state,
  showStore,
}: CampaignCardProps) {
  return (
    <article className="grid h-full gap-4 rounded-lg border border-white/10 bg-[#171717] p-4 sm:grid-cols-[5rem_minmax(0,1fr)]">
      <StoreLogo store={store} compact />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p
            className={`text-[0.7rem] font-bold uppercase tracking-[0.18em] ${
              state === 'live' ? 'text-[#d75a5a]' : 'text-[#898784]'
            }`}
          >
            {state === 'live' ? 'Live now' : 'Upcoming'}
          </p>
          {showStore ? (
            <p className="border-l border-white/15 pl-3 text-xs font-semibold text-[#aaa8a4]">
              {store.name}
            </p>
          ) : null}
        </div>

        <h3 className="mt-2 text-lg font-semibold leading-6 text-white">
          {campaign.name}
        </h3>

        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs leading-5 text-[#9b9a98]">
          <div>
            <dt className="font-semibold text-[#d0cdc7]">
              {campaign.starts.precision === 'date' ? 'Start date' : 'Starts'}
            </dt>
            <dd>
              <time
                dateTime={
                  campaign.starts.precision === 'date'
                    ? campaign.starts.date
                    : campaign.starts.dateTime
                }
              >
                {formatCampaignBoundary(campaign.starts)}
              </time>
            </dd>
          </div>
          {campaign.ends ? (
            <div>
              <dt className="font-semibold text-[#d0cdc7]">
                {campaign.ends.precision === 'date' ? 'End date' : 'Ends'}
              </dt>
              <dd>
                <time
                  dateTime={
                    campaign.ends.precision === 'date'
                      ? campaign.ends.date
                      : campaign.ends.dateTime
                  }
                >
                  {formatCampaignBoundary(campaign.ends)}
                </time>
              </dd>
            </div>
          ) : null}
        </dl>

        <a
          href={campaign.officialUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-white underline decoration-[#990303] decoration-2 underline-offset-4 transition-colors hover:text-[#d66b6b]"
        >
          View official campaign <span className="ml-2" aria-hidden="true">↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </article>
  )
}
