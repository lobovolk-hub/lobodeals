# Store identity system and historical provenance

## Active visual system — Stage 2, 19 September 2026

The frontend uses original LoboDeals identity panels implemented in HTML/CSS.
The visual correction of 20 September 2026 keeps a shared angular vocabulary
while giving each store a distinct composition: a dark gradient, two to four
geometric pieces, and prominent text with secondary store descriptors where
appropriate. Compact identities use only two small accents and the full name.
Steam uses silver/graphite, Epic violet, and GOG a separate purple treatment.
The implementation awaits Johan's visual review; technical validation does not
constitute visual approval.
Roboto Black (900, normal, Latin) is self-hosted through next/font/google and
scoped to the identity panels. Geist remains the general site typography.
The colors are LoboDeals interface accents, not official brand guidelines.
No official symbols, traced marks, monograms, or downloaded store artwork form
part of this system. These panels are not official logos or a trademark license.

PC is a platform, not a store. Its neutral PCIdentity panel appears in the Home
slide and platform card; it never uses Steam. The /pc heading keeps its existing
PC text. Store names, routes, ordering, campaign data, official campaign artwork,
CTAs, analytics, bilingual behavior, and card structure are unchanged.

The former official identity assets are no longer consumed by the frontend.
The ten historical files were deleted locally after the Stage 2 gate passed:
zero runtime consumers, successful tests/build, EN/ES checks at 1440 and 360 px,
and verified original identity fallbacks. No backup copies were retained.
This local removal does not claim deletion from deployed versions or CDN caches.

## Historical official asset provenance — inactive


Historical inventory for the ten canonical LoboDeals stores, consolidated on
25 August 2026. Each asset was stored unchanged from an official page,
first-party CDN, or official media kit recorded during the local transition
audit. This file records provenance; it is not a trademark license.

Before Stage 2, the public UI placed official logos in normalized containers.
The original files were unchanged; GOG and Ubisoft received a CSS brightness/invert
filter in the UI. Xbox also appeared as a decorative campaign fallback watermark.

| Store | Local asset | Recorded official source | Status |
|---|---|---|---|
| PlayStation Store | `public/services/playstation-store/logo.png` | [PlayStation Store](https://www.playstation.com/en-au/about-playstation-store/) and its first-party image CDN | HISTORICAL — INACTIVE |
| Nintendo eShop | `public/services/nintendo-eshop/logo.png` | [Nintendo US](https://www.nintendo.com/us/) and its first-party asset CDN | HISTORICAL — INACTIVE |
| Xbox Store | `public/platforms/xbox/logo.png` | [Xbox US](https://www.xbox.com/en-US/) and its official global header asset | HISTORICAL — INACTIVE |
| Steam | `public/services/steam/logo.png` | [Steam Store](https://store.steampowered.com/) and its official static CDN | HISTORICAL — INACTIVE |
| Epic Games Store | `public/services/epic-games-store/logo.png` | [Epic Games Store](https://store.epicgames.com/en-US/) and its first-party CDN | HISTORICAL — INACTIVE |
| GOG | `public/services/gog/logo.png` | [GOG press kit](https://www.gog.com/pressroom/press-kit/) | HISTORICAL — INACTIVE |
| EA app | `public/services/ea-app/logo.png` | [EA games](https://www.ea.com/games) and its first-party content CDN | HISTORICAL — INACTIVE |
| Ubisoft Store | `public/services/ubisoft-store/logo.svg` | Exact inline SVG recorded from the [Ubisoft Store US](https://store.ubisoft.com/us/home) UI | HISTORICAL — INACTIVE |
| Battle.net | `public/services/battle-net/logo.svg` | [Battle.net desktop](https://download.battle.net/en-us/desktop) and its first-party content CDN | HISTORICAL — INACTIVE |
| Rockstar Store | `public/services/rockstar-store/logo.svg` | [Rockstar Store](https://store.rockstargames.com/) and the official Contentful SVG referenced directly by the Store footer | HISTORICAL — INACTIVE |

The former Xbox identity used `public/platforms/xbox/logo.png`, downloaded
unchanged from the official Xbox global header asset published by
`https://www.xbox.com/en-US/` at
`https://uhf.microsoft.com/images/xbox/RW8TP2.png`. It was the official white
header variant selected for contrast on the dark-only UI. It represented the
canonical Xbox Store throughout the former gaming frontend while the
store slug, URLs, and backend entity remain unchanged.

The former Rockstar Store identity used the official R★ SVG referenced directly by
`https://store.rockstargames.com/` from its Contentful image CDN. The asset was
stored unchanged as `public/services/rockstar-store/logo.svg` at its native
139 x 128 viewBox dimensions. LoboDeals previously composed that verified R★ mark with
plain UI text as the `R★ | Store` lockup; the Rockstar mark itself is not
redrawn or modified.

The former Home platform spotlight reused the verified PlayStation Store, Nintendo,
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
approved brand-only hero therefore remained in place at that review; no homepage, store-page,
product-page, social, stock, fan, or generated character image was imported.

The historical files and their provenance remain recoverable through Git. Do not
keep backup copies in public or describe the former official assets as active.
Future identity changes must preserve this history and document the original
LoboDeals implementation separately. Official campaign artwork remains governed
by the existing Sales policy and is outside this identity replacement.
