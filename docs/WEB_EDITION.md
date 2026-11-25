# Palm Beach: the web edition

*Rewritten for Palm Beach in step 1.0 (25 Nov 2026). The original Boca Raton text, with every detail of how the Boca Web Party Edition was built: `_to_delete/boca_docs/WEB_EDITION.md`.*

The web edition runs in a browser with no Steam and no Electron. It is phase 1 of Palm Beach and will live at **palmbeach.backhansgames.com**.

## 1. Decisions for Palm Beach (from PLAN.md and PROGRESS.md)

| # | Decision |
|:-:|---|
| 1 | **Version 1:** 2–4 people on one screen (hot seat). No tutorial, no AI. |
| 2 | **Five characters:** Roxana, Mr. Flagler, Bright Shell, Carina, Skip. The other five are locked. |
| 3 | **Gold is open** everywhere. |
| 4 | **Choosing characters:** Random, Pick 2 and Open Draft. With only five characters, unpicked Pick 2 cards go back to the pool. |
| 5 | **Variation:** Lake Worth (all Luxury Cards and the Auction Map Card face down). |
| 6 | **Support Us popup** with the design in `SUPPORT_POPUP.md`; main button to Kickstarter. |
| 7 | Version 2 adds a tutorial, version 3 adds AI opponents and the solo Automa. |

## 2. Running and building

| Command | What it does |
|---|---|
| `npm run dev:web` | Starts the game for development at http://localhost:5173 |
| `npm run build:web` | Builds the finished web game into **`dist-web/`** |
| `npm run play:web:build` | Builds `dist-web/` and opens exactly that build in the browser |
| `npm run check` | Tests, three builds, secret scan, Steam files in place |

The web edition is chosen by the file `.env.web`, which holds only `VITE_GAME_EDITION=web`. It must never hold secrets.

### Uploading to Netlify (Lars does this, by hand)

1. `npm run check` ends with **ALL CHECKS PASSED**.
2. `npm run build:web` writes a fresh `dist-web/`.
3. In Netlify, open the **Palm Beach** site → **Deploys** → drag the `dist-web` folder onto the drop area.
4. Open the site and play a short game.

**Never upload to the Boca Raton site** (bocaraton.backhansgames.com). Never upload `dist/` (that is a Steam build). To undo an upload, open an earlier deploy in Netlify and click **Publish deploy**.

## 3. How the editions are told apart

`js/config.js` reads `VITE_GAME_EDITION`:

| Value | Edition | Flag that is true |
|---|---|---|
| `web` | Web | `GameConfig.isWeb` |
| `full` | Steam Full | `GameConfig.isFullGame` |
| not set | Steam Demo | `GameConfig.isDemo` |

**Rule:** web-only behaviour goes behind `GameConfig.isWeb` or a CSS rule under `html.edition-web`. The Palm Beach **rules** go in shared code, so the Steam editions get them too.

## 4. What the web edition has today (inherited from Boca)

- One party menu after the splash screen: names, 2–4 players, draft mode, START MATCH, SUPPORT US, TUTORIAL.
- No Quit button, no Steam overlay, no Steam promos, developer hotkeys off.
- Its own save key: `palmBeachWebSave`.
- The board centred in the window, a notice for very small windows, tap-to-preview in Open Draft on touch screens.

Still Boca and to be changed: the Support Us popup texts and banner (step 1.6), the party-menu background photo (Lars), and playing the game after START MATCH (steps 1.4–1.6). The TUTORIAL button is hidden until version 2.

CSS marker classes: `.steam-only` and `.hide-on-web` hide an element on the web; `.web-only` shows it only on the web.

## 5. Rules for working on the web edition

1. Keep the Steam and Electron files in place and working: `electron-main.js`, `electron-builder.*.json`, `publish_*.sh`, `steam/`, `build/`, `.env.full`.
2. Absolute pixel positions on the 3840 × 2160 canvas. The only exception is the small-window notice.
3. Put logic in pure functions that can be tested without a browser (like `js/web_party.js`).
4. Never put secrets in `.env.web`, in documents or in the build.

## 6. Tests

`tests/web_edition.test.js` covers the web edition's menu, save keys, draft modes, Support Us popup and window sizes. Palm Beach rule tests are added in step 1.1 under `tests/`. `npm run check` runs them all.

## 7. Not tested yet

- Safari, Firefox, a real iPad or phone. Only the built-in Chromium browser has been used.
- Phones are too small for the board; tablets in landscape are the smallest target.

## 8. Before the first public upload (step 1.7 checklist)

1. `npm run check` passes, and the secret scan is run on the exact `dist-web` that is uploaded.
2. Licences of the music, sounds and art are fine for the web (`ASSETS.md`).
3. Privacy: the page loads the Overpass font from Google Fonts, which sends each visitor's IP address to Google (matters in the EU). Hosting the font ourselves removes this. The game stores only `localStorage`: no cookies, no accounts, no statistics.
4. `index.html` still lists remote addresses for packages the game never loads (`@google/genai`, `vite`, `@tailwindcss/vite`, `electron`). Remove them from the web build.
5. Nothing on screen says Boca Raton or Gold Coast Gambits by mistake (splash picture, popup, links).
6. Play through with 2, 3 and 4 players in all three draft modes.
7. Test on Safari, Firefox and a real iPad.
