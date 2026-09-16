import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { loadModule } from './helpers/load-module.mjs'

const { locales, isLocale, localeFromPath } = await loadModule('lib/locale.ts')
const { dictionaries, t } = await loadModule('lib/i18n.ts')
const { englishPublicRoutes, localizedHref, isPublicPath, isCurrentRoute } = await loadModule('lib/localized-routes.ts')
const { initialLocale, resolveLanguage, shouldNegotiate, preferenceCookie } = await loadModule('lib/language-preference.ts')
const { formatBoundary, spanishMonths } = await loadModule('lib/date-format.ts')
const { getCampaignCounter } = await loadModule('lib/campaign-timing.ts')
const { createPageMetadata, createHomeMetadata, SOCIAL_IMAGE } = await loadModule('lib/seo.ts')
const { stores, storeProfileStaticParams } = await loadModule('lib/stores.ts')
const source = (file) => readFile(file, 'utf8')

test('locale contract accepts only en/es and derives the document language from its path', () => {
  assert.deepEqual(locales, ['en', 'es'])
  for (const value of ['EN', 'es-PE', null, '', 'fr']) assert.equal(isLocale(value), false)
  assert.equal(localeFromPath('/es/not-found.html'), 'es')
  assert.equal(localeFromPath('/esoteric'), 'en')
})

test('151 approved message keys have parity, matching variables and no pending or English fallback', () => {
  assert.equal(Object.keys(dictionaries.en).length, 151)
  assert.deepEqual(Object.keys(dictionaries.en), Object.keys(dictionaries.es))
  for (const key of ['Back', 'Store']) assert.equal(Object.hasOwn(dictionaries.en, key), false)
  for (const key of Object.keys(dictionaries.en)) {
    assert.equal(t('en', key, Object.fromEntries([...key.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], 'Official Name']))).includes('undefined'), false)
    assert.doesNotMatch(dictionaries.es[key], /PENDIENTE|APPROVED STRING REQUIRED/)
    assert.notEqual(dictionaries.es[key], dictionaries.en[key])
    assert.deepEqual([...key.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), [...dictionaries.es[key].matchAll(/\{\w+\}/g)].map(m => m[0]).sort())
  }
  assert.throws(() => t('es', 'not a registered key'), /Unknown public message/)
})

test('approved Spanish copy remains exact', () => {
  assert.equal(t('es', 'Sales'), 'Ofertas')
  assert.equal(t('es', 'Official sale'), 'Campaña oficial')
  assert.equal(t('es', 'Official sale campaign'), 'Campaña oficial')
  assert.equal(t('es', 'Official campaigns'), 'Campañas oficiales')
  assert.equal(t('es', 'Official game sales'), 'Campañas oficiales de videojuegos')
  assert.equal(t('es', 'Know where official game sales are happening'), 'Descubre qué campañas de descuentos de videojuegos están activas')
  assert.equal(t('es', 'Starts'), 'Inicia')
  assert.equal(t('es', 'Ends'), 'Finaliza')
  assert.equal(t('es', 'Live'), 'Activa')
  assert.equal(t('es', 'Live now'), 'Activas ahora')
  assert.equal(t('es', 'Upcoming'), 'Próximamente')
})

test('14 canonical English routes have exactly 14 idempotent Spanish equivalents', () => {
  assert.equal(englishPublicRoutes.length, 14)
  const spanish = englishPublicRoutes.map((route) => localizedHref(route, 'es'))
  assert.equal(new Set(spanish).size, 14)
  englishPublicRoutes.forEach((route, index) => {
    assert.equal(localizedHref(spanish[index], 'en'), route)
    assert.equal(localizedHref(spanish[index], 'es'), spanish[index])
    assert.ok(isPublicPath(spanish[index]))
    assert.doesNotMatch(spanish[index], /\/es\/es/)
  })
  assert.equal(localizedHref('/sales?store=steam#upcoming', 'es'), '/es/sales?store=steam#upcoming')
  for (const value of ['/en/sales', '/es/es/sales', '/catalog', 'https://store.steampowered.com/']) {
    assert.equal(isPublicPath(value), false)
    assert.equal(localizedHref(value, 'es'), value)
  }
})

test('only seven independent profiles are eligible in either language', () => {
  assert.equal(storeProfileStaticParams.length, 7)
  for (const slug of ['playstation-store', 'nintendo-eshop', 'microsoft-store', 'not-a-store']) {
    assert.equal(isPublicPath(`/es/services/${slug}`), false)
    assert.equal(resolveLanguage(`/es/services/${slug}`, 'es', 'es-PE'), null)
  }
})

test('explicit Spanish URL wins over a saved English preference', () => {
  assert.deepEqual(resolveLanguage('/es/sales', 'en', 'en-US'), { locale: 'es', pathname: '/es/sales' })
  assert.deepEqual(resolveLanguage('/es', 'en', 'fr'), { locale: 'es', pathname: '/es' })
})

test('concrete English URLs win over saved Spanish and browser detection', () => {
  assert.deepEqual(resolveLanguage('/sales', 'en', 'es-PE'), { locale: 'en', pathname: '/sales' })
  assert.deepEqual(resolveLanguage('/sales', 'es', 'en-US'), { locale: 'en', pathname: '/sales' })
  assert.deepEqual(resolveLanguage('/sales', 'invalid', 'es-PE'), { locale: 'en', pathname: '/sales' })
  assert.deepEqual(resolveLanguage('/services/gog', 'es', 'es-PE'), { locale: 'en', pathname: '/services/gog' })
  assert.deepEqual(resolveLanguage('/es/services/gog', 'en', 'en-US'), { locale: 'es', pathname: '/es/services/gog' })
})

test('only neutral root negotiates and saved preference overrides browser detection', () => {
  for (const header of ['es-PE', 'es-MX']) assert.deepEqual(resolveLanguage('/', null, header), { locale: 'es', pathname: '/es' })
  for (const header of ['en-US', 'fr', 'ja']) assert.deepEqual(resolveLanguage('/', null, header), { locale: 'en', pathname: '/' })
  assert.deepEqual(resolveLanguage('/', 'en', 'es-PE'), { locale: 'en', pathname: '/' })
  assert.deepEqual(resolveLanguage('/', 'es', 'en-US'), { locale: 'es', pathname: '/es' })
})

test('Back and Forward respect each concrete history URL regardless of last saved language', () => {
  let preference = 'en'
  for (const path of ['/es/sales', '/sales', '/es/sales', '/sales']) {
    const decision = resolveLanguage(path, preference, 'es-PE')
    assert.equal(decision.pathname, path)
    assert.equal(decision.locale, path.startsWith('/es/') ? 'es' : 'en')
    preference = decision.locale
  }
})

test('first visit respects Accept-Language priority, q=0 and stable tie order', () => {
  for (const header of ['es', 'es-PE', 'es-MX,en;q=0.8', 'en;q=0.2,es;q=0.9']) assert.equal(initialLocale(header), 'es')
  for (const header of [null, '', 'fr', 'en,es;q=0.9', 'es;q=0,en', 'es;q=broken,en', 'es;q=1.1,en', 'en;q=0.8,es;q=0.8']) assert.equal(initialLocale(header), 'en')
})

test('negotiation stabilizes after at most one redirect and remembers initial English too', () => {
  for (const route of englishPublicRoutes) for (const browser of ['es-PE', 'fr']) {
    const first = resolveLanguage(route, null, browser)
    const next = resolveLanguage(first.pathname, first.locale, browser)
    assert.deepEqual(next, first)
  }
  assert.match(preferenceCookie('en', true), /lobodeals_language=en; Path=\/; Max-Age=31536000; SameSite=Lax; Secure/)
  assert.doesNotMatch(preferenceCookie('es', false), /Secure/)
})

test('crawler, prefetch, RSC and non-document requests are not negotiated', () => {
  const headers = (extra = {}) => new Headers({ accept: 'text/html', 'user-agent': 'Mozilla/5.0', ...extra })
  assert.equal(shouldNegotiate('GET', headers(), ''), true)
  assert.equal(shouldNegotiate('POST', headers(), ''), false)
  assert.equal(shouldNegotiate('GET', headers({ accept: 'text/x-component' }), ''), false)
  assert.equal(shouldNegotiate('GET', headers(), '?_rsc=token'), false)
  for (const extra of [{ purpose: 'prefetch' }, { 'sec-purpose': 'prefetch' }, ...['Googlebot', 'Twitterbot', 'facebookexternalhit', 'Slackbot', 'WhatsApp'].map((ua) => ({ 'user-agent': ua }))]) {
    assert.equal(shouldNegotiate('GET', headers(extra), ''), false)
  }
  for (const path of ['/robots.txt', '/sitemap.xml', '/og/lobodeals-og-v2.png', '/api/test', '/_next/static/test.js', '/login']) assert.equal(resolveLanguage(path, 'es', 'es'), null)
})

test('navigation preserves PC activation for profiles in both languages', () => {
  assert.equal(isCurrentRoute('/es/services/gog', '/pc'), true)
  assert.equal(isCurrentRoute('/services/gog', '/pc'), true)
  assert.equal(isCurrentRoute('/es/xbox', '/xbox'), true)
  assert.equal(isCurrentRoute('/es/xbox', '/pc'), false)
  assert.equal(isCurrentRoute('/es/services/not-a-store', '/pc'), false)
})

test('each metadata route keeps EN canonical, ES noindex/no canonical and V2 social images', () => {
  for (const route of englishPublicRoutes) for (const locale of locales) {
    const metadata = createPageMetadata({ title: 'Steam', description: 'Official digital PC store sales, live and announced.', canonical: route, locale })
    assert.equal(metadata.alternates.canonical, locale === 'en' ? route : null)
    assert.deepEqual(metadata.robots, { index: locale === 'en', follow: true })
    assert.equal(metadata.openGraph.url, localizedHref(route, locale))
    assert.equal(metadata.openGraph.images[0].url, SOCIAL_IMAGE)
    assert.equal(metadata.twitter.images[0].url, SOCIAL_IMAGE)
    assert.equal(metadata.title, 'Steam')
    assert.equal(metadata.alternates.languages, undefined)
  }
  assert.equal(createHomeMetadata('en').title.absolute, 'LoboDeals — Official game sales')
  assert.equal(createPageMetadata({ title: 'Sales', description: 'Live and upcoming official digital store sale campaigns.', canonical: '/sales', locale: 'es' }).title, 'Ofertas')
})

test('sitemap remains English-only, robots allows crawlers, root SSR reads validated path locale', async () => {
  const { default: sitemap } = await loadModule('app/sitemap.ts')
  assert.equal(sitemap().length, 14)
  assert.ok(sitemap().every(({ url }) => !new URL(url).pathname.startsWith('/es')))
  const { default: robots } = await loadModule('app/robots.ts')
  assert.equal(robots().rules.allow, '/')
  assert.equal(robots().rules.disallow, undefined)
  assert.match(await source('app/layout.tsx'), /const locale = await requestLocale\(\)[\s\S]*lang=\{locale\}/)
  assert.match(await source('proxy.ts'), /headers\.set\('x-lobodeals-locale', localeFromPath\(pathname\)\)/)
})

test('Spanish date-only uses the twelve approved months without an invented hour', () => {
  assert.deepEqual(spanishMonths, ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'])
  spanishMonths.forEach((month, index) => {
    const boundary = { precision: 'date', date: `2026-${String(index + 1).padStart(2, '0')}-15` }
    assert.equal(formatBoundary(boundary, 'es'), `15 ${month} 2026`)
    assert.doesNotMatch(formatBoundary(boundary, 'es'), /UTC|:|AM|PM/)
  })
  assert.throws(() => formatBoundary({ precision: 'date', date: '2026-02-29' }, 'es'), RangeError)
})

test('exact instants preserve UTC conversion and published minute display in both languages', () => {
  const boundary = { precision: 'datetime', dateTime: '2026-09-15T01:30:45+02:00' }
  assert.equal(formatBoundary(boundary, 'es'), '14 sep 2026, 11:30 PM UTC')
  assert.equal(formatBoundary(boundary, 'en'), 'Sep 14, 2026, 11:30 PM UTC')
})

test('semantic countdown does not depend on visible translated labels', () => {
  const boundary = { precision: 'date', date: '2026-09-15' }, now = new Date(2026, 8, 15, 12)
  assert.equal(getCampaignCounter(boundary, 'upcoming', 'start', now, 'en'), 'Starts today')
  assert.equal(getCampaignCounter(boundary, 'live', 'end', now, 'en'), 'Ends today')
  for (const locale of locales) assert.equal(getCampaignCounter(boundary, 'live', 'started', now, locale), null)
  assert.equal(getCampaignCounter(boundary, 'upcoming', 'start', now, 'es'), dictionaries.es['Starts today'])
})

test('rendered campaign cards keep official names, URLs, date precision and analytics attributes', async () => {
  const { CampaignCard } = await loadModule('components/campaign-card.tsx')
  const campaign = { id: 'official-campaign', name: 'Customer Appreciation Sale', storeSlug: 'steam', officialUrl: 'https://store.steampowered.com/sale/official', starts: { precision: 'date', date: '2026-09-15' }, lifecycle: { basis: 'official-source', state: 'upcoming' } }
  for (const locale of locales) {
    const html = renderToStaticMarkup(createElement(CampaignCard, { campaign, store: stores.find((s) => s.slug === 'steam'), state: 'upcoming', showStore: true, analyticsSurface: 'sales', locale }))
    assert.match(html, /Customer Appreciation Sale/)
    assert.match(html, /data-sale-campaign-name="Customer Appreciation Sale"/)
    assert.match(html, /data-store-name="Steam"/)
    assert.match(html, /href="https:\/\/store.steampowered.com\/sale\/official"/)
    assert.match(html, /dateTime="2026-09-15"/)
    assert.match(html, locale === 'es' ? /15 sep 2026/ : /Sep 15, 2026/)
  }
})

test('rendered Home and profile links preserve the selected language', async () => {
  const { HomeHero } = await loadModule('components/home-hero.tsx')
  const { StoreProfileHero } = await loadModule('components/store-profile-hero.tsx')
  const { StoreCard } = await loadModule('components/store-card.tsx')
  const home = renderToStaticMarkup(createElement(HomeHero, { locale: 'es' }))
  assert.match(home, /href="\/es\/sales"/)
  assert.match(home, /href="\/es\/pc"/)
  assert.match(home, /Descubre qué campañas de descuentos de videojuegos están activas/)
  const steam = stores.find((store) => store.slug === 'steam')
  assert.match(renderToStaticMarkup(createElement(StoreProfileHero, { store: steam, locale: 'es' })), /href="\/es\/pc"/)
  assert.match(renderToStaticMarkup(createElement(StoreCard, { store: steam, locale: 'es' })), /href="\/es\/services\/steam"/)
  assert.equal(stores.length, 10)
  assert.equal(stores.filter((store) => store.name === 'Xbox Store').length, 1)
})

test('About renders approved Spanish paragraphs, social URLs, contacts and timing', async () => {
  const { default: About } = await loadModule('components/about-page.tsx')
  const html = renderToStaticMarkup(createElement(About, { locale: 'es' }))
  assert.match(html, /LoboDeals te ayuda a encontrar tiendas digitales oficiales y saber cuándo sus campañas están activas o han sido anunciadas\./)
  assert.match(html, /LoboVolk es una marca independiente de videojuegos y el creador detrás de LoboDeals, enfocado en cobertura, reseñas, gameplays y contenido sobre videojuegos\./)
  assert.match(html, /Las horas exactas solo se muestran cuando la fuente las proporciona\./)
  for (const value of ['https://www.youtube.com/@LoboVolk', 'https://www.tiktok.com/@lobovolk2', 'https://www.facebook.com/LoboVolk2', 'https://www.instagram.com/lobovolk2/', 'mailto:contact@lobodeals.com', 'mailto:business@lobodeals.com']) assert.ok(html.includes(value))
  assert.doesNotMatch(html, /data-lobodeals-outbound/)
  assert.doesNotMatch(renderToStaticMarkup(createElement(About, { locale: 'en' })), /Exact times may be shown in your local time/)
})

test('approved Spanish 404, metadata, accessibility and countdown render real copy', async () => {
  const { NotFoundView } = await loadModule('components/not-found-view.tsx')
  const html = renderToStaticMarkup(createElement(NotFoundView, { locale: 'es' }))
  assert.match(html, /404 · Página no encontrada/)
  assert.match(html, /Esta página no forma parte de LoboDeals\./)
  assert.match(html, /Ir al inicio/)
  assert.doesNotMatch(html, /PENDIENTE|APPROVED STRING REQUIRED/)
  assert.equal(createHomeMetadata('es').title.absolute, 'LoboDeals — Campañas oficiales de videojuegos')
  assert.equal(t('es', 'View {value0} on {value1} (opens in a new tab)', { value0: 'Steam Summer Sale', value1: 'Steam' }), 'Ver Steam Summer Sale en Steam (se abre en una pestaña nueva)')
  assert.equal(t('es', 'Language'), 'Idioma')
  assert.equal(t('es', 'Business, partnerships, affiliate matters, publishers/agencies, professional opportunities.'), 'Negocios, alianzas, afiliación, publishers/agencias y oportunidades profesionales.')
  assert.equal(getCampaignCounter({ precision: 'date', date: '2026-09-17' }, 'live', 'end', new Date(2026, 8, 15, 12), 'es'), 'Quedan 2 días')
})
