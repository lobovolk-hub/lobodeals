'use client'

import type { Locale } from '@/lib/locale'

import { t } from '@/lib/i18n'
import { getCampaignCounter, type TimingPurpose } from '@/lib/campaign-timing'
import {
  formatCompactCampaignBoundary,
} from '@/lib/public-sales-runtime'
import type {
  CampaignBoundary,
  CampaignState,
} from '@/lib/sales'
import { useSharedSecondClock } from '@/lib/use-shared-second-clock'

type CampaignTimingProps = {
  locale?: Locale
  boundary: CampaignBoundary
  purpose: TimingPurpose
  state: Extract<CampaignState, 'live' | 'upcoming'>
}

export function CampaignTiming({ locale = 'en',
  boundary,
  purpose,
  state,
}: CampaignTimingProps) {
  const label = t(locale, purpose === 'end' ? 'Ends' : purpose === 'started' ? 'Started' : 'Starts')
  const currentTime = useSharedSecondClock()
  const counter = currentTime
    ? getCampaignCounter(boundary, state, purpose, new Date(currentTime), locale)
    : null
  const formatted = formatCompactCampaignBoundary(boundary, locale)

  return (
    <p className="mt-3 text-sm font-semibold tabular-nums text-[#b7b4ae]">
      {counter ? (
        <span className="font-bold text-[#ebe7df]">{counter}</span>
      ) : null}
      {counter ? <span aria-hidden="true"> · </span> : `${label} `}
      {counter && boundary.precision === 'date' ? `${label} ` : null}
      <time
        dateTime={
          boundary.precision === 'date' ? boundary.date : boundary.dateTime
        }
        className={counter ? 'text-[#b7b4ae]' : 'text-[#ebe7df]'}
      >
        {formatted}
      </time>
    </p>
  )
}
