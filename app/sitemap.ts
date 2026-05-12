import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com').replace(/\/$/, '')

type SitemapItem = {
  slug: string
}

const MAX_SITEMAP_URLS = 50000
const STATIC_ROUTE_COUNT = 3
const MAX_ITEM_ROUTES = MAX_SITEMAP_URLS - STATIC_ROUTE_COUNT
const PAGE_SIZE = 1000

export const revalidate = 86400

async function fetchSitemapItems() {
  const items: SitemapItem[] = []

  for (let from = 0; from < MAX_ITEM_ROUTES; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, MAX_ITEM_ROUTES - 1)

    const { data, error } = await supabase
      .from('catalog_public_cache')
      .select('slug')
      .eq('region_code', 'us')
      .eq('storefront', 'playstation')
      .not('slug', 'is', null)
      .order('slug', { ascending: true })
      .range(from, to)

    if (error) {
      throw error
    }

    if (!data || data.length === 0) {
      break
    }

    items.push(...(data as SitemapItem[]))

    if (data.length < PAGE_SIZE) {
      break
    }
  }

  return items
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${siteUrl}/catalog`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/deals`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ]

  try {
    const data = await fetchSitemapItems()
    const seen = new Set<string>()

    const itemRoutes: MetadataRoute.Sitemap = data
      .filter((item) => {
        if (!item.slug || seen.has(item.slug)) {
          return false
        }

        seen.add(item.slug)
        return true
      })
      .slice(0, MAX_ITEM_ROUTES)
      .map((item) => ({
        url: `${siteUrl}/us/playstation/${encodeURIComponent(item.slug)}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: 0.7,
      }))

    return [...staticRoutes, ...itemRoutes]
  } catch {
    return staticRoutes
  }
}
