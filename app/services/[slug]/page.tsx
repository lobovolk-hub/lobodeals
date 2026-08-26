import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CampaignSections } from '@/components/campaign-sections'
import { StoreLogo } from '@/components/store-logo'
import { getCampaignsByStore } from '@/lib/sales'
import { loadOfficialCampaigns } from '@/lib/sales-source'
import {
  getStoreBySlug,
  platformLabels,
  storeStaticParams,
} from '@/lib/stores'

type StorePageProps = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return storeStaticParams
}

export async function generateMetadata({
  params,
}: StorePageProps): Promise<Metadata> {
  const { slug } = await params
  const store = getStoreBySlug(slug)

  if (!store) notFound()

  return {
    title: store.name,
    description: store.description,
    alternates: { canonical: `/services/${store.slug}` },
    openGraph: {
      title: store.name,
      description: store.description,
      url: `/services/${store.slug}`,
    },
  }
}

export default async function StoreProfilePage({ params }: StorePageProps) {
  const { slug } = await params
  const store = getStoreBySlug(slug)

  if (!store) notFound()

  const campaigns = getCampaignsByStore(
    await loadOfficialCampaigns(),
    store.slug
  )

  return (
    <main>
      <article>
        <header className="border-b border-white/10">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-8">
            <StoreLogo store={store} />
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c84b4b]">
                Official store profile
              </p>
              <h1 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
                {store.name}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-[#aaa8a4]">
                {store.description}
              </p>
              <a
                href={store.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-md bg-[#990303] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#b20a0a]"
              >
                Visit official store <span className="ml-2" aria-hidden="true">↗</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>
          </div>
        </header>

        <section
          aria-labelledby="store-details-heading"
          className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
        >
          <h2 id="store-details-heading" className="sr-only">
            Store details
          </h2>
          <dl className="grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 sm:grid-cols-3">
            <div className="bg-[#171717] p-5">
              <dt className="text-xs font-bold uppercase tracking-[0.18em] text-[#71706e]">
                Platforms
              </dt>
              <dd className="mt-3">
                <ul className="flex flex-wrap gap-2">
                  {store.platforms.map((platform) => (
                    <li key={platform}>
                      <Link
                        href={`/${platform}`}
                        className="inline-flex min-h-11 items-center rounded-md border border-white/10 px-3 text-sm font-semibold text-white transition-colors hover:border-[#990303]"
                      >
                        {platformLabels[platform]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
            <div className="bg-[#171717] p-5">
              <dt className="text-xs font-bold uppercase tracking-[0.18em] text-[#71706e]">
                Digital scope
              </dt>
              <dd className="mt-3 text-sm leading-6 text-[#aaa8a4]">
                {store.digitalScope}
              </dd>
            </div>
            <div className="bg-[#171717] p-5">
              <dt className="text-xs font-bold uppercase tracking-[0.18em] text-[#71706e]">
                Tracked market
              </dt>
              <dd className="mt-3 text-sm leading-6 text-[#aaa8a4]">
                {store.marketScope}
              </dd>
            </div>
          </dl>
        </section>
      </article>

      <CampaignSections
        campaigns={campaigns}
        idPrefix={`store-${store.slug}`}
        showStore={false}
      />
    </main>
  )
}
