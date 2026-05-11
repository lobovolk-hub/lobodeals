import type { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com'

type SitemapItem = {
  slug: string
}

export const revalidate = 86400

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

  const { data, error } = await supabase
    .from('catalog_public_cache')
    .select('slug')
    .eq('region_code', 'us')
    .eq('storefront', 'playstation')
    .not('slug', 'is', null)
    .range(0, 49999)

  if (error || !data) {
    return staticRoutes
  }

  const itemRoutes: MetadataRoute.Sitemap = (data as SitemapItem[])
    .filter((item) => item.slug)
    .map((item) => ({
      url: `${siteUrl}/us/playstation/${encodeURIComponent(item.slug)}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    }))

  return [...staticRoutes, ...itemRoutes]
}