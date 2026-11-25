# Palm Beach: pictures and sound

*Rewritten for Palm Beach in step 1.0 (25 Nov 2026). Original Boca text: `_to_delete/boca_docs/ASSETS.md`.*

Everything the game shows or plays is in `public/assets/`. Pictures are `.webp`. The print sources are in `assets_source/palm_beach_print/`.

## 1. Palm Beach art (in place)

| File | Size | What it is |
|---|---|---|
| `map_cards_front.webp` | 2000 × 2000 | The 64 Map Card fronts, 8 × 8 cards of 250 px, with the yellow +5, +2 and +1 circles. Card number = row × 8 + column. |
| `character_cards_print.webp` | 3500 × 2400 | The 10 Palm Beach character cards, 5 × 2 cards of 700 × 1200. Order: Edith, Roxana, Addison, Mr. Flagler, Kingston / Ms. Post, Eric, Bright Shell, Carina, Skip. |
| `diamond.webp` | 358 × 258 | The Diamond, transparent. Not used on screen yet. |
| `palm_beach_logo.webp` | 1440 × 240 | The PALM BEACH title, transparent. Shown at the top of the table. Made from `assets_source/palm_beach_print/other/LOGO_palm_beach_gold.png`. |

## 2. Still Boca Raton art (to check or replace)

| File | Size | Used for | What is needed |
|---|---|---|---|
| `splash.webp` | 3840 × 2160 | The first screen | **The title in the picture says "Boca Raton and Palm Beach / Gold Coast Gambits".** Lars: a new picture, 3840 × 2160 `.webp`, under 1 MB, or the same photo without text so the Palm Beach logo can be laid on top. |
| `map_cards_back.webp` | 1000 × 250 | The four Map Card backs | The Waterfront back shows +4 Au. Step 1.2: make new backs from `assets_source/palm_beach_print/other/BACK_MAP_*.png` (they show the Diamond). |
| `luxury_cards_front.webp` | 750 × 1750 | The 17 Luxury Cards | Lars to confirm they match the printed Palm Beach cards (same 17 cards in both games?). |
| `luxury_card_back.webp` | 250 × 250 | Luxury Card back | Compare with `BACK_LUX_1_TIGER.png` in step 1.2. |
| `property_cards_front.webp` | 750 × 250 | The 3 Property Cards | Lars to confirm. |
| `auction_cards_front.webp`, `auction_map_back.webp` | 1000 × 1500, 1000 × 500 | Auction Map Cards | Palm Beach has one Auction Map Card covering rows 7–8. Step 1.2. |
| `board_game.webp` | 2560 × 1440 | Party menu background photo | Lars: a Palm Beach photo, same size, before step 1.6. |
| `board_game_support_us.webp` | 2560 × 900 | Support Us popup banner | Lars: a Palm Beach banner, same size, under 500 KB, before step 1.6. |
| `cheat_sheet.webp` (+ `@2x`) | 250 × 250, 500 × 500 | Reward table | Step 1.6: Palm Beach reward table. |
| `playermat.webp` (+ `@2x`) | 1240 × 1180 | Player panel | Check in step 1.3. |
| `game_logo.webp`, `game_logo_splash.webp`, `boca_raton_logo.webp` | | Gold Coast Gambits and Boca titles | No longer shown. Kept for the Steam phase. |
| `visitors_sprite.webp`, `tournament*.webp`, `tutorial*.webp`, `open_*.webp`, `boardg*.webp`, `introduction_en.webp`, `rulebook01.webp`, `post-1_image.webp`, `sprite.webp`, Steam and Kickstarter logos | | Boca AI visitors, campaign, tutorial, variation pictures, promos | Not used in Palm Beach version 1. |

## 3. Sound (`public/assets/audio/`)

Inherited from Boca and reused as it is: the title theme, four music tracks (MP3 for browsers, AAC for Electron) and the effects (card flip, gold, pay, dice, auction alert, bid, pass, win, bonus, gong, turn switch, winner).

Palm Beach will need a sound for getting a Diamond and for the Diamond trade (step 1.4); an existing effect can stand in.

## 4. How pictures are loaded

- Addresses are written in `js/data.js` as `new URL("../assets/name.webp", import.meta.url).href`, so they work in development, in the web build and in Electron.
- Some pictures have an `@2x` twin for sharp screens.
- New pictures: `.webp`, exported from the sources in `assets_source/`. Convert with `npx electron scripts/png-to-webp.cjs <input.png> <output.webp>`.

## 5. Look and fonts

Font: Overpass (loaded from Google Fonts; see the privacy note in `WEB_EDITION.md`). Glass panels, colours and card sizes: `DESIGN_RECIPE.md`. Palm Beach brand colours: `docs/palm_beach/color-palette.md`.

## 6. Licences

There is no list of licences for the music, sound effects and stock pictures inherited from Boca. Check them before the first public upload (step 1.7). The Backhans Games logo, the titles and the card art belong to Backhans Games.
