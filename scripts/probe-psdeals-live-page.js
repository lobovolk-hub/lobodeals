async (page) => {
  const result = await page.evaluate(() => {
    const anchors = [...document.querySelectorAll('a.game-collection-item-link[href*="/us-store/game/"]')]

    return {
      title: document.title,
      url: location.href,
      cards: anchors.length,
      sample: anchors.slice(0, 10).map((anchor) => ({
        title: anchor.querySelector('.game-collection-item-details-title')?.textContent?.replace(/\s+/g, ' ').trim() || null,
        href: anchor.href,
      })),
    }
  })

  return JSON.stringify(result, null, 2)
}
