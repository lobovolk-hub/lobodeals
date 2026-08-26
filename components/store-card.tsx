import Link from 'next/link'
import { StoreLogo } from '@/components/store-logo'
import { platformLabels, type Store } from '@/lib/stores'

type StoreCardProps = {
  store: Store
}

export function StoreCard({ store }: StoreCardProps) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-white/10 bg-[#171717] p-4 transition-colors hover:border-[#990303] hover:bg-[#1b1b1b]">
      <StoreLogo store={store} />

      <div className="flex flex-1 flex-col pt-4">
        <h3 className="text-lg font-semibold tracking-tight text-white">
          {store.name}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-6 text-[#9b9a98]">
          {store.description}
        </p>
        <ul
          aria-label={`${store.name} platforms`}
          className="mt-4 flex flex-wrap gap-1.5"
        >
          {store.platforms.map((platform) => (
            <li
              key={platform}
              className="rounded-sm border border-white/10 px-2 py-1 text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[#a09f9d]"
            >
              {platformLabels[platform]}
            </li>
          ))}
        </ul>
        <Link
          href={`/services/${store.slug}`}
          className="mt-4 inline-flex min-h-11 items-center border-t border-white/10 pt-3 text-sm font-semibold text-white transition-colors hover:text-[#d66b6b]"
        >
          View store <span className="ml-2" aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  )
}
