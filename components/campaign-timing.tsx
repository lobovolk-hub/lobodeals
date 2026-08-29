'use client'

import { getCampaignCounter } from '@/lib/campaign-timing'
import {
  formatCompactCampaignBoundary,
  type CampaignBoundary,
  type CampaignState,
} from '@/lib/sales'
import { useSharedSecondClock } from '@/lib/use-shared-second-clock'

type CampaignTimingProps = {
  boundary: CampaignBoundary
  label: 'Starts' | 'Started' | 'Ends'
  state: Extract<CampaignState, 'live' | 'upcoming'>
}

export function CampaignTiming({
  boundary,
  label,
  state,
}: CampaignTimingProps) {
  const currentTime = useSharedSecondClock()
  const counter = currentTime
    ? getCampaignCounter(boundary, state, label, new Date(currentTime))
    : null
  const formatted = formatCompactCampaignBoundary(boundary)

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
