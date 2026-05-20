import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com').replace(/\/$/, '')

type SitemapItem = {
  slug: string | null
  updated_at: string | null
}

const MAX_ITEM_ROUTES = 750

export const revalidate = 86400

function itemRoute(
  item: SitemapItem,
  priority: number,
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] = 'weekly'
): MetadataRoute.Sitemap[number] | null {
  if (!item.slug) {
    return null
  }

  const route: MetadataRoute.Sitemap[number] = {
    url: `${siteUrl}/us/playstation/${encodeURIComponent(item.slug)}`,
    changeFrequency,
    priority,
  }

  if (item.updated_at) {
    route.lastModified = new Date(item.updated_at)
  }

  return route
}

async function fetchRows(
  label: string,
  query: PromiseLike<{ data: unknown; error: unknown }>
): Promise<SitemapItem[]> {
  const { data, error } = await query

  if (error) {
    console.error(`Sitemap bucket failed: ${label}`, error)
    return []
  }

  return Array.isArray(data) ? (data as SitemapItem[]) : []
}

function baseQuery() {
  return supabase
    .from('catalog_public_cache')
    .select('slug, updated_at')
    .eq('region_code', 'us')
    .eq('storefront', 'playstation')
    .not('slug', 'is', null)
}

async function fetchSitemapItems() {
  const today = new Date().toISOString().slice(0, 10)

  const [
    activeDeals,
    monthlyGames,
    topMetacritic,
    latestReleases,
    upcomingReleases,
  ] = await Promise.all([
    fetchRows(
      'active-deals',
      baseQuery()
        .or('has_deal.eq.true,has_ps_plus_deal.eq.true')
        .order('updated_at', { ascending: false })
        .limit(250)
    ),

    fetchRows(
      'monthly-games',
      baseQuery()
        .eq('is_ps_plus_monthly_game', true)
        .order('updated_at', { ascending: false })
        .limit(25)
    ),

    fetchRows(
      'top-metacritic',
      supabase
        .from('catalog_public_cache')
        .select('slug, updated_at, metacritic_score')
        .eq('region_code', 'us')
        .eq('storefront', 'playstation')
        .eq('content_type', 'game')
        .eq('item_type_label', 'game')
        .not('slug', 'is', null)
        .not('metacritic_score', 'is', null)
        .order('metacritic_score', { ascending: false })
        .limit(200)
    ),

    fetchRows(
      'latest-releases',
      supabase
        .from('catalog_public_cache')
        .select('slug, updated_at, release_date')
        .eq('region_code', 'us')
        .eq('storefront', 'playstation')
        .eq('content_type', 'game')
        .eq('item_type_label', 'game')
        .not('slug', 'is', null)
        .not('release_date', 'is', null)
        .lte('release_date', today)
        .order('release_date', { ascending: false })
        .limit(150)
    ),

    fetchRows(
      'upcoming-releases',
      supabase
        .from('catalog_public_cache')
        .select('slug, updated_at, release_date')
        .eq('region_code', 'us')
        .eq('storefront', 'playstation')
        .eq('content_type', 'game')
        .eq('item_type_label', 'game')
        .not('slug', 'is', null)
        .not('release_date', 'is', null)
        .gt('release_date', today)
        .order('release_date', { ascending: true })
        .limit(150)
    ),
  ])

  const seen = new Set<string>()
  const routes: MetadataRoute.Sitemap = []

  function add(items: SitemapItem[], priority: number) {
    for (const item of items) {
      if (!item.slug || seen.has(item.slug)) {
        continue
      }

      const route = itemRoute(item, priority)

      if (!route) {
        continue
      }

      seen.add(item.slug)
      routes.push(route)

      if (routes.length >= MAX_ITEM_ROUTES) {
        return
      }
    }
  }

  add(activeDeals, 0.8)
  add(monthlyGames, 0.8)
  add(topMetacritic, 0.7)
  add(latestReleases, 0.7)
  add(upcomingReleases, 0.7)

  return routes.slice(0, MAX_ITEM_ROUTES)
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
    const itemRoutes = await fetchSitemapItems()
    return [...staticRoutes, ...itemRoutes]
  } catch {
    return staticRoutes
  }
}
