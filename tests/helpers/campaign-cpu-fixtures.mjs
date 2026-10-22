import assert from 'node:assert/strict'

// Synthetic campaign prose, not captured production data or a campaign registry.
export function timingFixture(store, size = 4000, count = 1) {
  assert.ok(['gog', 'microsoft-store'].includes(store))
  assert.ok(Number.isInteger(size) && size >= 0 && size <= 100000)
  assert.ok(Number.isInteger(count) && count >= 1 && count <= 50)
  const prose = 'sale '.repeat(Math.floor(size / 5))
  const now = new Date('2026-10-21T00:00:00Z')
  let requests = 0
  if (store === 'gog') {
    const tabs = Array.from({ length: count }, (_, i) => ({ title: `Example ${i} Sale`,
      bigThingy: { url: `https://www.gog.com/promo/example_${i}_sale` } }))
    return { now, calls: () => requests, fetch: async input => {
      requests++
      const url = String(input)
      if (url === 'https://www.gog.com/en/') return new Response('<script id="gogcom-store-state">{}</script><promo-banner-section></promo-banner-section>')
      if (url === 'https://www.gog.com/frontpage/rss') return new Response('<rss><channel><title>GOG.com News</title></channel></rss>')
      if (url === 'https://www.gog.com/en/now_on_sale?countryCode=US&locale=en-US&currencyCode=USD') return Response.json({ tabs })
      const tab = tabs.find(t => t.bigThingy.url === url)
      assert.ok(tab, `Unexpected fixture URL: ${url}`)
      return new Response(`<h1>${tab.title}</h1><p>${prose}</p>`)
    } }
  }
  const channels = Array.from({ length: count }, (_, i) => `CampsiteChannel.Games.Sale.2026.example${i}`)
  const source = channels.map((channel, i) => `<a href="https://www.xbox.com/games/browse/${channel}">SHOP MORE</a>
    <script>{"channelMetadata":{"${channel}":{"type":2,"data":{"channelTitleModuleData":{"title":"Example ${i} Sale"}}}}}</script>`).join('')
  return { now, calls: () => requests, fetch: async input => {
    requests++
    const url = String(input)
    if (url === 'https://www.xbox.com/en-US/promotions/sales/sales-and-specials') return new Response(source)
    assert.ok(url.startsWith('https://www.xbox.com/games/browse/CampsiteChannel.Games.Sale.2026.example'), url)
    return new Response(`<h1>Example Sale</h1><p>${prose}</p>`)
  } }
}
