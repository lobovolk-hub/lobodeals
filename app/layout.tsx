import type { Metadata } from 'next'
import Script from 'next/script'
import { Geist, Geist_Mono } from 'next/font/google'
import { SiteFooter, SiteHeader } from '@/components/site-shell'
import { DetailsAutoClose } from '@/components/details-auto-close'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://lobodeals.com'
const gtmId = process.env.NEXT_PUBLIC_GTM_ID

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'LoboDeals',
  title: {
    default: 'LoboDeals — PlayStation deals, prices, and game tracking',
    template: '%s | LoboDeals',
  },
  description:
    'Track PlayStation games, compare prices, discover current deals, and follow upcoming PS4 and PS5 releases in one catalog.',
  keywords: [
    'PlayStation deals',
    'PS5 deals',
    'PS4 deals',
    'PlayStation game prices',
    'video game deals',
    'game price tracker',
    'LoboDeals',
  ],
  authors: [{ name: 'LoboDeals' }],
  creator: 'LoboDeals',
  publisher: 'LoboDeals',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'LoboDeals',
    title: 'LoboDeals — PlayStation deals, prices, and game tracking',
    description:
      'Track PlayStation games, compare prices, discover current deals, and follow upcoming PS4 and PS5 releases in one catalog.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LoboDeals — PlayStation deals, prices, and game tracking',
    description:
      'Track PlayStation games, compare prices, discover current deals, and follow upcoming PS4 and PS5 releases in one catalog.',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
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
      {gtmId ? (
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${gtmId}');
          `}
        </Script>
      ) : null}

      <body className="min-h-full bg-black text-white">
        {gtmId ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0"
              width="0"
              style={{ display: 'none', visibility: 'hidden' }}
            />
          </noscript>
        ) : null}

        <DetailsAutoClose />

        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <div className="flex-1">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}
