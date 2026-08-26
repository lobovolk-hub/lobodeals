import type { MetadataRoute } from 'next'
import { stores } from '@/lib/stores'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com').replace(
  /\/$/,
  ''
)

const routes = [
  '',
  '/sales',
  '/about',
  '/playstation',
  '/pc',
  '/nintendo',
  '/xbox',
  ...stores.map(({ slug }) => `/services/${slug}`),
]

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route, index) => ({
    url: `${siteUrl}${route}`,
    changeFrequency: route === '/sales' ? 'daily' : 'weekly',
    priority: index === 0 ? 1 : route === '/sales' ? 0.9 : 0.8,
  }))
}
