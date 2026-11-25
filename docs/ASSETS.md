# Boca Raton: Asset Catalog & Reusability Guide

This document catalogues all graphical spritesheets, UI components, audio files, shaders, and fonts in the *Boca Raton* repository. It explains how assets are bundled, loaded, and scaled, and evaluates their potential for reuse in a future web version or a sister game project.

---

## 1. Asset Bundling & Resolution Loading Strategy

### 1.1 The Vite URL Asset Pattern
To ensure asset paths resolve identically across Vite dev server, Electron packaged builds, and static web deployments (e.g. Netlify), all assets are imported using explicit static string literals:
```javascript
const assetUrl = new URL(/* @vite-ignore */ "../assets/example.webp", import.meta.url).href;
```

### 1.2 High-DPI Resolution Switching (`@2x`)
In `js/data.js`, a display density check dynamically chooses between standard and `@2x` high-resolution textures:
```javascript
const isHighRes = (typeof window !== 'undefined' && (window.devicePixelRatio || 1) >= 1.25);

export const CHEAT_SHEET_URL = isHighRes
    ? new URL("../assets/cheat_sheet@2x.webp", import.meta.url).href
    : new URL("../assets/cheat_sheet.webp", import.meta.url).href;
```

---

## 2. Spritesheets & Visual Assets

All visual assets reside in the `public/assets/` directory and use modern **WebP** compression:

### 2.1 Game Cards & Spritesheets

| Asset File | Resolution / Format | Grid / Layout | Contents | Reusability |
| :--- | :--- | :--- | :--- | :--- |
| `map_cards_front.webp` | High-res WebP (1.95 MB)| 8 cols × 8 rows (64 cards) | Map cards representing Lagoon, Waterfronts, Blocks, Atlantic, and Landmarks. | High for sister Florida game; specific to map logic. |
| `map_cards_back.webp` | WebP (53 KB) | Single texture | Patterned card backing for map cards. | Very High. |
| `character_cards_print.webp` | WebP (522 KB) | 5 cols × 2 rows (10 cards) | The 10 Local characters (Leja, Roxana, Addison, Flagler, Kingston, Post, Eric, Bright Shell, Carina, Silviano). Card aspect: 400×686. | Very High for character reuse. |
| `visitors_sprite.webp` | WebP (484 KB) | 5 cols × 2 rows (10 cards) | The 10 Visitor bots (Goober, Superboy, Surfer Dude, Boss Cat, Robot, Pirate, Flamingo Queen, Magician, Twins, Gran Gran). | Very High for bot reuse. |
| `luxury_cards_front.webp` | WebP (123 KB) | Grid (17 cards) | The 17 Luxury Cards (1 pt, 2 pt, 3 pt items). | High for economic game mechanics. |
| `luxury_card_back.webp` | WebP (17 KB) | Single texture | Card back for luxury decks. | Very High. |
| `auction_cards_front.webp`| WebP (733 KB) | 3 cards | Property Cards: Mar-a-Lago, Gulf Stream Golf Club, Spanish River Park. | High. |
| `auction_map_back.webp` | WebP (65 KB) | Single texture | Card back for Property Auction cards. | Very High. |

### 2.2 Board, Playermats & UI Graphics

| Asset File | Description | Purpose |
| :--- | :--- | :--- |
| `playermat.webp` / `@2x` | Player dashboard mat texture | Displays player stats, active character, and inventories. |
| `cheat_sheet.webp` / `@2x` | Rules cheat sheet graphic | In-game reference for dice difficulty, costs, and rewards. |
| `tournament.webp` / `@2x` | Tournament background artwork | Used as CSS background on tournament selection screens. |
| `tutorial.webp` / `@2x` | Tutorial overlay graphic | Visual backdrop for guided tutorial steps. |
| `open_none.webp` | Variation card preview | Boca Raton (Closed) mode thumbnail. |
| `open_property_cards.webp`| Variation card preview | Spanish Variation thumbnail. |
| `open_luxury_cards.webp` | Variation card preview | Red Reef Variation thumbnail. |
| `open_all.webp` | Variation card preview | Mizner Variation thumbnail. |
| `dices_3_6.webp`, `dice_5_6.webp` | Dice reference graphics | Visual aids showing required successful die faces. |
| `splash.webp`, `game_logo.webp` | Splash artwork & logo | Title screen and branding assets. |
| `backhans_games_logo.webp`| Developer studio logo | Studio branding on startup screen. |

---

## 3. Audio Assets

The sound engine in `js/audio.js` supports dynamic volume control, ducking, muting, and stereo effects.

### 3.1 Background Music (BGM)
The game includes a 4-track playlist plus a title theme. In Electron desktop builds, high-fidelity AAC tracks (`_hq.aac`) are streamed; standard MP3 tracks provide lightweight fallbacks for browsers:

| Track Name | MP3 File (Browser) | HQ AAC File (Desktop) | Mood / Context |
| :--- | :--- | :--- | :--- |
| **Title Theme** | `startscreen64.mp3` (3.2 MB) | `startscreen64_hq.aac` (4.8 MB) | Upbeat, inviting retro-tropical theme. |
| **Game Track 1** | `game_track_01.mp3` (2.6 MB) | `game_track_01_hq.aac` (3.9 MB) | Relaxed coastal jazz / lounge. |
| **Game Track 2** | `game_track_02.mp3` (1.8 MB) | `game_track_02_hq.aac` (2.7 MB) | Mellow Florida afternoon groove. |
| **Game Track 3** | `game_track_03.mp3` (3.7 MB) | `game_track_03_hq.aac` (5.5 MB) | Strategic thinking rhythm. |
| **Game Track 4** | `game_track_04.mp3` (3.2 MB) | `game_track_04_hq.aac` (4.7 MB) | Late-game building tempo. |

### 3.2 Sound Effects (SFX)

| SFX Key | Audio File | Triggering Event |
| :--- | :--- | :--- |
| `flip` | `card_flip.mp3` | Card reveal on the board or in decks. |
| `gold_small` | `gold_small.mp3` | Earning 1 to 4 Au. |
| `gold_large` | `gold_large.mp3` | Earning 5+ Au (line bonuses, large payouts). |
| `pay` | `pay_gold.mp3` | Spending gold on Luxury cards or auctions. |
| `dice_loop` | `dice_loop.mp3` | Rolling dice sound effect. |
| `dice_success` | `dice_success.mp3` | Passing a dice difficulty check. |
| `dice_fail` | `dice_fail.mp3` | Failing a dice difficulty check. |
| `auction_alert`| `auction_alert.mp3` | Property Auction triggered. |
| `bid` | `bid_raise.mp3` | Raising a bid in an auction. |
| `fold` | `bid_fold.mp3` | Folding in an auction. |
| `win` | `auction_win.mp3` | Winning a property auction. |
| `bonus_card` | `bonus_card.mp3` | Completing a Row or Column bonus. |
| `the_gong` | `the_gong.mp3` | Match start / variation gong fanfare. |
| `turn_switch` | `switch_002.ogg` | Turn passing to next player. |
| `winner_song` | `winner.mp3` | Victory fanfare on Game Over screen. |

---

## 4. Typography & Styling Components

### 4.1 Typography
The game uses the **Overpass** Google Font (`font-overpass`, Sans-serif, weights 200, 400, 700, 900).
- Loaded via Google Fonts CDN in `index.html`.
- Scaled via Tailwind arbitrary font sizes (`text-[60px]`, `text-[40px]`, `text-[32px]`).

### 4.2 Reusable V2 Glass Plate Panels
All hub panels, setup modals, and compendium cards share the **V2 Glass Plate Recipe**:
```css
.v2-panel {
    background-color: rgba(38, 56, 92, 0.5); /* Navy blue at 50% opacity */
    backdrop-filter: blur(12px);             /* Frosted glass blur */
    border: 1px solid rgba(255, 255, 255, 0.1); /* Subtle white border */
    border-radius: 1.5rem;                   /* rounded-3xl */
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}
```

### 4.3 Playing Card Standard Dimensions
- Standard card element: `w-[400px] h-[686px]` (approx. 1:1.715 golden ratio).
- Standard hover transition: `hover:scale-[1.75] hover:z-[200] z-[10] transition-transform duration-300 ease-out`.

---

## 5. WebGL Shaders

The background features an animated GLSL fragment shader (`src/shaders/water.frag`) rendered on `#shader-bg`:
- Normalized UV coordinates computed from screen resolution.
- 3 layered sine waves (`sin(uv.x * 7.0 + time * 1.2)`, etc.) create an organic water shimmer.
- Four dynamic color palettes (Navy/Pool Blue, Deep Burgundy/Rose Red, Turquoise, Sunset Orange) transition smoothly to match the current menu screen.

---

## 6. Licensing & Attribution Considerations

Before publishing the web version or reusing assets in new commercial titles, note the following:
1. **Developer Assets**: Backhans Games logo, title logos, and game rulebook graphics are proprietary to Backhans Games.
2. **Third-Party Imagery & Music**: The repository does not currently contain a dedicated `ATTRIBUTION.md` or third-party license manifest for individual sound clips or stock illustrations. An audit should verify commercial licenses for music tracks and SFX before public browser hosting.
3. **Historical References**: Real-world estate names (Mar-a-Lago, Whitehall, Gumbo Limbo) and historical figures (Henry Flagler, Addison Mizner, Marjorie Merriweather Post) are used as fair-use cultural/historical references.
