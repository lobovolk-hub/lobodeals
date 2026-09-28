import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import vm from 'node:vm'
import { createElement } from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { loadModule } from './helpers/load-module.mjs'

const enCopy = 'LoboDeals helps you find official digital game stores and see which sale campaigns are live or coming next.'
const esCopy = 'LoboDeals te ayuda a encontrar tiendas digitales oficiales de videojuegos y ver qué campañas de ofertas están activas o llegarán próximamente.'
const oldKey = 'Find official digital game stores and see which sale campaigns are live or coming next.'
const seo = await loadModule('lib/seo.ts')
const { dictionaries, t } = await loadModule('lib/i18n.ts')
const { HomeHero } = await loadModule('components/home-hero.tsx')

// Render the real route and hero in memory. Omit the asynchronous Sales subtree:
// this identity test must neither call the backend nor generate Next type files.
async function renderHomeRoute(file) {
  const source = await readFile(file, 'utf8')
  const code = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  const dependencies = {
    'react/jsx-runtime': jsxRuntime,
    '@/components/home-page': { default: ({ locale }) => createElement(HomeHero, { locale }) },
    '@/lib/seo': seo,
  }
  vm.runInNewContext(code, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  }, { filename: file })
  return { html: renderToStaticMarkup(createElement(exports.default)), metadata: exports.metadata }
}

test('English home renders exactly one safely serialized WebSite with only the approved fields', async () => {
  const { html } = await renderHomeRoute('app/page.tsx')
  const scripts = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1)
  assert.deepEqual(JSON.parse(scripts[0][1]), {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'LoboDeals',
    alternateName: 'lobodeals.com',
    url: 'https://lobodeals.com/',
  })
  assert.doesNotMatch(scripts[0][1], /<|SearchAction|Organization|Brand|sameAs/)
})

test('Spanish home renders no English canonical identity declaration', async () => {
  const { html } = await renderHomeRoute('app/es/page.tsx')
  assert.doesNotMatch(html, /application\/ld\+json|schema\.org|WebSite/)
  assert.ok(html.includes(esCopy))
})

test('structured identity is owned only by the English root, never a shared layout or component', async () => {
  const declarations = []
  for (const directory of ['app', 'components', 'lib']) {
    for (const file of await readdir(directory, { recursive: true })) {
      if (!/\.[jt]sx?$/.test(file)) continue
      const path = `${directory}/${file}`.replaceAll('\\', '/')
      const source = await readFile(path, 'utf8')
      if (/application\/ld\+json|schema\.org|@context/.test(source)) declarations.push(path)
    }
  }
  assert.deepEqual(declarations, ['app/page.tsx'])
})

for (const [locale, copy, otherCopy] of [['en', enCopy, esCopy], ['es', esCopy, enCopy]]) {
  test(`${locale} hero renders the exact approved description once with the existing H1 and eyebrow`, () => {
    assert.equal(t(locale, enCopy), copy)
    assert.equal(Object.values(dictionaries[locale]).filter(value => value === copy).length, 1)
    assert.equal(Object.hasOwn(dictionaries[locale], oldKey), false)
    const html = renderToStaticMarkup(createElement(HomeHero, { locale }))
    assert.equal(html.split(copy).length - 1, 1)
    assert.ok(!html.includes(otherCopy))
    assert.ok(!html.includes(oldKey))
    assert.ok(!html.includes('Encuentra tiendas digitales oficiales de videojuegos y descubre qué campañas de ofertas están activas o próximas.'))
    assert.ok(html.includes(t(locale, 'Know where official game sales are happening')))
    assert.ok(html.includes(t(locale, 'Official game sales')))
    assert.equal((html.match(/<h1\b/g) || []).length, 1)
  })
}

test('home route metadata preserves English canonical/indexing and Spanish Phase A', async () => {
  for (const [file, english] of [['app/page.tsx', true], ['app/es/page.tsx', false]]) {
    const { metadata } = await renderHomeRoute(file)
    assert.deepEqual(metadata.robots, { index: english, follow: true })
    assert.equal(metadata.alternates.canonical, english ? '/' : null)
    assert.equal(metadata.alternates.languages, undefined)
    if (english) {
      assert.equal(new URL(metadata.alternates.canonical, 'https://lobodeals.com').href, 'https://lobodeals.com/')
      assert.equal(metadata.title.absolute, 'LoboDeals — Official game sales')
    }
  }
})
