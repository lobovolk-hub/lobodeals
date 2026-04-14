import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

type CacheRow = {
  slug: string | null
  updated_at: string | null
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for sitemap')
  }

  return createClient(url, serviceRole)
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://www.lobodeals.com'

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1,
    },
    {
      url: `${baseUrl}/pc`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/catalog`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/data-deletion`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ]

  try {
    const supabase = getServiceSupabase()

    const { data, error } = await supabase
      .from('pc_public_catalog_cache')
      .select('slug, updated_at')
      .eq('steam_type', 'game')
      .order('updated_at', { ascending: false })

    if (error) {
      throw error
    }

    const gameRoutes: MetadataRoute.Sitemap = (Array.isArray(data) ? data : [])
      .map((row) => row as CacheRow)
      .filter((row) => typeof row.slug === 'string' && row.slug.trim().length > 0)
      .map((row) => ({
        url: `${baseUrl}/pc/${encodeURIComponent(String(row.slug).trim())}`,
        lastModified: row.updated_at ? new Date(row.updated_at) : new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.8,
      }))

    return [...staticRoutes, ...gameRoutes]
  } catch (error) {
    console.error('sitemap generation error', error)
    return staticRoutes
  }
}