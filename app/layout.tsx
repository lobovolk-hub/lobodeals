import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { OutboundAnalytics } from '@/components/outbound-analytics'
import { Geist, Geist_Mono } from 'next/font/google'
import { SiteFooter, SiteHeader } from '@/components/site-shell'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com').replace(
  /\/$/,
  ''
)
const configuredGtmId = process.env.NEXT_PUBLIC_GTM_ID
const gtmId =
  configuredGtmId && /^GTM-[A-Z0-9]+$/.test(configuredGtmId)
    ? configuredGtmId
    : undefined

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'LoboDeals',
  title: {
    default: 'LoboDeals — Official game sales',
    template: '%s | LoboDeals',
  },
  description:
    'Find official digital game stores and see their live or announced sale campaigns.',
  authors: [{ name: 'LoboDeals' }],
  creator: 'LoboDeals',
  publisher: 'LoboVolk',
  openGraph: {
    type: 'website',
    siteName: 'LoboDeals',
    title: 'LoboDeals — Official game sales',
    description:
      'Official digital game stores and their live or announced sale campaigns.',
    url: '/',
    images: [
      {
        url: '/og/lobodeals-og.png',
        width: 1200,
        height: 630,
        alt: 'LoboDeals — Official game sales.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LoboDeals — Official game sales',
    description:
      'Official digital game stores and their live or announced sale campaigns.',
    images: ['/og/lobodeals-og.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#101010',
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#101010] text-[#f4f1eb]">
        <OutboundAnalytics />
        {gtmId ? (
          <>
            <Script id="google-tag-manager" strategy="afterInteractive">
              {`
                (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
                new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${gtmId}');
              `}
            </Script>
            <noscript>
              <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
                height="0"
                width="0"
                title="Google Tag Manager"
                className="hidden"
              />
            </noscript>
          </>
        ) : null}

        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}
