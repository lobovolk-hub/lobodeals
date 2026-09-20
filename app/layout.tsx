import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { OutboundAnalytics } from '@/components/outbound-analytics'
import { Geist, Geist_Mono, Roboto } from 'next/font/google'
import { SiteFooter, SiteHeader } from '@/components/site-shell'
import './globals.css'
import { requestLocale } from '@/lib/request-locale'
import { createHomeMetadata } from '@/lib/seo'
import { t } from '@/lib/i18n'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const identityRoboto = Roboto({
  variable: '--font-identity',
  subsets: ['latin'],
  weight: '900',
  style: 'normal',
  display: 'swap',
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

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale()
  const home = createHomeMetadata(locale)
  return {
    ...home,
    alternates: { canonical: null },
    metadataBase: new URL(siteUrl),
    applicationName: 'LoboDeals',
    title: { default: t(locale, 'LoboDeals — Official game sales'), template: '%s | LoboDeals' },
    authors: [{ name: 'LoboDeals' }],
    creator: 'LoboDeals',
    publisher: 'LoboVolk',
  }
}

export const viewport: Viewport = {
  themeColor: '#101010',
  colorScheme: 'dark',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await requestLocale()
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${identityRoboto.variable} h-full antialiased`}
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
          <SiteHeader locale={locale} />
          <div className="flex-1">{children}</div>
          <SiteFooter locale={locale} />
        </div>
      </body>
    </html>
  )
}
