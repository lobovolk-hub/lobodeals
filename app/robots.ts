import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/login',
          '/profile',
          '/tracked',
          '/reset-password',
        ],
      },
    ],
    sitemap: 'https://www.lobodeals.com/sitemap.xml',
  }
}