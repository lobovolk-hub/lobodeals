# Official store brand assets

Operational inventory for the ten canonical LoboDeals stores, consolidated on
25 August 2026. A verified asset is stored unchanged from an official page,
first-party CDN, or official media kit recorded during the local transition
audit. This file records provenance; it is not a trademark license.

The public UI places every verified logo inside a normalized container while
preserving its proportions. No logo is recolored, redrawn, or used as campaign
artwork.

| Store | Local asset | Recorded official source | Status |
|---|---|---|---|
| PlayStation Store | `public/services/playstation-store/logo.png` | [PlayStation Store](https://www.playstation.com/en-au/about-playstation-store/) and its first-party image CDN | VERIFIED |
| Nintendo eShop | `public/services/nintendo-eshop/logo.png` | [Nintendo US](https://www.nintendo.com/us/) and its first-party asset CDN | VERIFIED |
| Microsoft / Xbox Store | `public/platforms/xbox/logo.png` | [Xbox US](https://www.xbox.com/en-US/) and its official global header asset | VERIFIED |
| Steam | `public/services/steam/logo.png` | [Steam Store](https://store.steampowered.com/) and its official static CDN | VERIFIED |
| Epic Games Store | `public/services/epic-games-store/logo.png` | [Epic Games Store](https://store.epicgames.com/en-US/) and its first-party CDN | VERIFIED |
| GOG | `public/services/gog/logo.png` | [GOG press kit](https://www.gog.com/pressroom/press-kit/) | VERIFIED |
| EA app | `public/services/ea-app/logo.png` | [EA games](https://www.ea.com/games) and its first-party content CDN | VERIFIED |
| Ubisoft Store | `public/services/ubisoft-store/logo.svg` | Exact inline SVG recorded from the [Ubisoft Store US](https://store.ubisoft.com/us/home) UI | VERIFIED |
| Battle.net | `public/services/battle-net/logo.svg` | [Battle.net desktop](https://download.battle.net/en-us/desktop) and its first-party content CDN | VERIFIED |
| Rockstar Store | — | No appropriate, verifiable Rockstar Store logo exists in the authorized local asset set. The UI uses a plain text fallback and must not invent or recreate a logo. | UNRESOLVED |

The Xbox identity uses `public/platforms/xbox/logo.png`, downloaded
unchanged from the official Xbox global header asset published by
`https://www.xbox.com/en-US/` at
`https://uhf.microsoft.com/images/xbox/RW8TP2.png`. It is the official white
header variant selected for contrast on the dark-only UI. It represents the
canonical Microsoft / Xbox Store throughout the gaming frontend while the
store slug, URLs, and backend entity remain unchanged.

The Home platform spotlight reuses the verified PlayStation Store, Nintendo,
Steam, and Xbox assets above as brand-only fallbacks. No campaign, game,
publisher, stock, third-party, or generated artwork is stored for the hero.

## Home character artwork review — 27 August 2026

No character or game background asset was added in Visual Pass 4.1. The review
covered the official [Sony Interactive Entertainment Asset Library](https://sonyinteractive.com/en/news/asset-library/),
[Xbox Wire media resources](https://news.xbox.com/en-us/media/),
[Nintendo US terms](https://www.nintendo.com/us/terms-of-use/), and
[Valve press resources](https://www.valvesoftware.com/en/press). The reviewed
official resources did not establish a sufficiently clear reuse basis for this
persistent third-party site treatment across the four platform slides. The
approved brand-only hero therefore remains in place; no homepage, store-page,
product-page, social, stock, fan, or generated character image was imported.

When replacing any asset, record an official source and preserve the original
file. Do not add third-party store, comparator, aggregator, tracker, campaign,
game, or retailer artwork.
