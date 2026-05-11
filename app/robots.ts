import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/catalog',
        '/deals',
        '/us/playstation/',
      ],
      disallow: [
        '/auth/',
        '/login',
        '/profile',
        '/tracked',
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}