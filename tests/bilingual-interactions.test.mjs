import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { createRequire } from 'node:module'
import { loadModule } from './helpers/load-module.mjs'

const require = createRequire(import.meta.url)
async function evaluate(file, dependencies, globals = {}) {
  const code = ts.transpileModule(await readFile(file, 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, {
    exports, ...globals,
    require: (name) => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      throw new Error(`Unexpected dependency ${name}`)
    },
  }, { filename: file })
  return exports
}

test('one delegated click emits one event with document language and all existing fields; cleanup prevents duplicates', async () => {
  const callbacks = new Set(), cleanups = []
  const document = { documentElement: { lang: 'es' }, addEventListener: (_, cb) => callbacks.add(cb), removeEventListener: (_, cb) => callbacks.delete(cb) }
  const window = { dataLayer: [] }
  class Element { constructor(link) { this.link = link } closest() { return this.link } }
  const { OutboundAnalytics } = await evaluate('components/outbound-analytics.tsx', {
    react: { useEffect: (effect) => cleanups.push(effect()) },
  }, { document, window, Element })
  const data = { analyticsSurface: 'sales', outboundType: 'sale', storeSlug: 'steam', storeName: 'Steam', saleCampaignId: 'sale-1', saleCampaignName: 'Customer Appreciation Sale', linkMode: 'official' }
  const click = (dataset) => callbacks.forEach((cb) => cb({ target: new Element({ dataset }) }))
  OutboundAnalytics()
  click(data)
  assert.equal(window.dataLayer.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(window.dataLayer[0])), {
    event: 'lobodeals_outbound_click', ui_language: 'es', surface: 'sales', outbound_type: 'sale', store_slug: 'steam', store_name: 'Steam', link_mode: 'official', sale_campaign_id: 'sale-1', sale_campaign_name: 'Customer Appreciation Sale',
  })
  cleanups.pop()()
  assert.equal(callbacks.size, 0)
  OutboundAnalytics()
  assert.equal(callbacks.size, 1)
  document.documentElement.lang = 'en'
  click({ ...data, outboundType: 'store' })
  assert.equal(window.dataLayer.length, 2)
  assert.equal(window.dataLayer[1].ui_language, 'en')
  assert.equal(window.dataLayer[1].sale_campaign_id, null)
  assert.equal(window.dataLayer[1].sale_campaign_name, null)
  click({ ...data, saleCampaignName: '' })
  callbacks.forEach((cb) => cb({ target: new Element(null) }))
  assert.equal(window.dataLayer.length, 2)
  cleanups.pop()()
})

test('selector writes preference before full navigation and preserves the query/fragment', async () => {
  let pathname = '/es/sales'
  const history = []
  const document = { set cookie(value) { history.push(['cookie', value]) } }
  const window = { location: { protocol: 'https:', search: '?store=steam', hash: '#upcoming', assign: (url) => history.push(['navigate', url]) } }
  const jsx = (type, props) => ({ type, props })
  const { LanguageSelector } = await evaluate('components/language-selector.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { usePathname: () => pathname },
    '@/lib/localized-routes': await loadModule('lib/localized-routes.ts'),
    '@/lib/language-preference': await loadModule('lib/language-preference.ts'),
    '@/lib/i18n': await loadModule('lib/i18n.ts'),
  }, { document, window })
  for (const [locale, index, target] of [['es', 0, '/sales'], ['en', 1, '/es/sales']]) {
    history.length = 0
    const element = LanguageSelector({ locale })
    const anchor = element.props.children[index]
    let prevented = false
    anchor.props.onClick({ preventDefault() { prevented = true } })
    assert.equal(prevented, true)
    assert.equal(history[0][0], 'cookie')
    assert.match(history[0][1], index === 0 ? /lobodeals_language=en/ : /lobodeals_language=es/)
    assert.deepEqual(history[1], ['navigate', `${target}?store=steam#upcoming`])
  }
  pathname = '/es/not-a-route'
  assert.equal(LanguageSelector({ locale: 'es' }), null)
})

test('actual proxy redirects at most once, records explicit ES and protects request locale from spoofing', async () => {
  const { NextRequest } = require('next/server')
  const { proxy } = await evaluate('proxy.ts', {
    'next/server': require('next/server'),
    './lib/locale': await loadModule('lib/locale.ts'),
    './lib/localized-routes': await loadModule('lib/localized-routes.ts'),
    './lib/language-preference': await loadModule('lib/language-preference.ts'),
  }, { Headers })
  const request = (path, headers = {}) => new NextRequest(`https://lobodeals.test${path}`, { headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0', ...headers } })
  const first = proxy(request('/?store=steam', { 'accept-language': 'es-PE' }))
  assert.equal(first.status, 307)
  assert.equal(first.headers.get('location'), 'https://lobodeals.test/es?store=steam')
  assert.equal(first.cookies.get('lobodeals_language').value, 'es')
  assert.match(first.headers.get('cache-control'), /private, no-store/)
  const explicit = proxy(request('/es/sales', { cookie: 'lobodeals_language=en' }))
  assert.equal(explicit.status, 200)
  assert.equal(explicit.cookies.get('lobodeals_language').value, 'es')
  assert.equal(explicit.headers.get('x-middleware-request-x-lobodeals-locale'), 'es')
  const english = proxy(request('/sales', { cookie: 'lobodeals_language=es', 'accept-language': 'es', 'x-lobodeals-locale': 'es' }))
  assert.equal(english.status, 200)
  assert.equal(english.headers.get('location'), null)
  assert.equal(english.cookies.get('lobodeals_language').value, 'en')
  assert.equal(english.headers.get('x-middleware-request-x-lobodeals-locale'), 'en')
  for (const path of ['/es/not-found.html', '/es/services/not-a-store', '/es/services/microsoft-store']) {
    const response = proxy(request(path, { cookie: 'lobodeals_language=en' }))
    assert.equal(response.headers.get('location'), null)
    assert.equal(response.headers.get('x-middleware-request-x-lobodeals-locale'), 'es')
    assert.equal(response.cookies.get('lobodeals_language'), undefined)
    if (path.includes('/services/')) {
      assert.equal(response.status, 404)
      assert.equal(new URL(response.headers.get('x-middleware-rewrite')).pathname, '/es/404')
    }
  }
  for (const headers of [{ 'user-agent': 'Twitterbot' }, { purpose: 'prefetch' }, { accept: 'text/x-component' }]) {
    const response = proxy(request('/sales', { 'accept-language': 'es', ...headers }))
    assert.equal(response.headers.get('location'), null)
    assert.equal(response.cookies.get('lobodeals_language'), undefined)
  }
})

test('Spanish application error shows approved copy and keeps retry functional', async () => {
  const jsx = (type, props) => ({ type, props })
  const { ApplicationError } = await evaluate('components/application-error.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { usePathname: () => '/es/sales' },
    '@/lib/locale': await loadModule('lib/locale.ts'),
    '@/lib/i18n': await loadModule('lib/i18n.ts'),
  })
  let retried = false
  const element = ApplicationError({ retry: () => { retried = true } })
  assert.deepEqual(Array.from(element.props.children, child => child.props.children), ['Esta página no pudo cargarse', 'Recarga para intentarlo de nuevo o vuelve atrás.', 'Recargar'])
  element.props.children[2].props.onClick()
  assert.equal(retried, true)
})
