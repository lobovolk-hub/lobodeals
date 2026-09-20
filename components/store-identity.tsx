import type { CSSProperties } from 'react'
import type { Store, StoreSlug } from '@/lib/stores'

type IdentityVariant = 'standard' | 'platform' | 'campaign' | 'mini' | 'hero'

// Interface accents, not reproductions of official marks or brand guidelines.
type Treatment = { accent: string; composition: string; suffix?: string }
const treatments = {
  'playstation-store': { accent: '#52a9f0', composition: 'precision', suffix: 'Store' },
  'nintendo-eshop': { accent: '#ed5367', composition: 'bracket', suffix: 'eShop' },
  'microsoft-store': { accent: '#79cd78', composition: 'stride', suffix: 'Store' },
  steam: { accent: '#b7c0c9', composition: 'metal' },
  'epic-games-store': { accent: '#a38af0', composition: 'cut-frame', suffix: 'Store' },
  gog: { accent: '#c090dc', composition: 'opposed' },
  'ea-app': { accent: '#ef8076', composition: 'steps', suffix: 'app' },
  'ubisoft-store': { accent: '#91c9e9', composition: 'offset', suffix: 'Store' },
  'battle-net': { accent: '#55b6eb', composition: 'segments' },
  'rockstar-store': { accent: '#e0b756', composition: 'corners', suffix: 'Store' },
} satisfies Record<StoreSlug, Treatment>

function IdentityPlate({ name, treatment, variant, identity }: {
  name: string
  treatment: Treatment
  variant: IdentityVariant
  identity: string
}) {
  const split = variant !== 'mini' && treatment.suffix && name.endsWith(` ${treatment.suffix}`)
  const primary = split ? name.slice(0, -(treatment.suffix!.length + 1)) : name
  return (
    <div
      data-identity={identity}
      data-identity-variant={variant}
      data-composition={treatment.composition}
      className={`identity-plate identity-plate--${variant}`}
      style={{ '--identity-accent': treatment.accent } as CSSProperties}
    >
      {Array.from({ length: variant === 'mini' ? 2 : 4 }, (_, index) => (
        <span key={index} className={`identity-plate__shape identity-plate__shape--${index + 1}`} aria-hidden="true" />
      ))}
      <span className={`identity-plate__name${primary.length > 9 ? ' identity-plate__name--long' : ''}`}>
        {split ? <><span className="identity-plate__primary">{primary}</span>{' '}<span className="identity-plate__secondary">{treatment.suffix}</span></> : name}
      </span>
    </div>
  )
}

export function StoreIdentity({ store, variant = 'standard' }: {
  store: Pick<Store, 'slug' | 'name'>
  variant?: IdentityVariant
}) {
  return <IdentityPlate name={store.name} identity={store.slug}
    treatment={treatments[store.slug as StoreSlug] ?? { accent: '#aaa8a4', composition: 'neutral' }} variant={variant} />
}

// PC is a platform, deliberately separate from the canonical store registry.
export function PCIdentity({ variant = 'platform' }: { variant?: IdentityVariant }) {
  return <IdentityPlate name="PC" identity="pc" treatment={{ accent: '#aaa8a4', composition: 'graphite' }} variant={variant} />
}
