# Boca Raton: Web Party Edition

The **Web Party Edition** is the third edition of the game, next to Steam Full and Steam Demo. It runs directly in a modern browser, with no Steam and no Electron, and it is built for **2-4 people sharing one screen** ("hot-seat" party play).

All three editions share one codebase, the same game rules, graphics, audio and board engine. The Web edition adds its own edition setting, its own menu and its own restrictions on top of that code. **Steam Full and Steam Demo must stay exactly as they are**: every Web-specific change is behind `GameConfig.isWeb`, which is `false` in both Steam builds.

> Status: development is complete on the branch `feature/web-version` (Steps 1-7). It is hosted on Netlify at https://bocaraton.backhansgames.com, updated by hand (section 2). See section 8 for what has and has not been verified.

---

## 1. Product decisions

| # | Decision |
| :-: | :--- |
| 1 | The only game variation is **Red Reef** (open luxury cards, closed auction cards). |
| 2 | **2-4 human players**, no single-player mode, **no AI opponents** in party matches. |
| 3 | Hot-seat play reuses the engine that already existed for local multiplayer. |
| 4 | Hidden information is **not** handled specially. The game has no per-player secrets in Red Reef; gold is public and Pick 2 candidates are visible to the whole room (accepted). |
| 5 | The character pool is the **Steam Demo pool**: Bright Shell, Leja, Silviano, Carina, Ms. Post. |
| 6 | All three draft modes are available: **Random, Pick 2, Open Draft**. |
| 7 | After the splash screen there is **one menu**: type names, choose 2-4 players, choose a draft mode, press Start. |
| 8 | A **Tutorial** button plays the guided first level (Gambits 1-4) and returns to the menu. |

---

## 2. Running and building

| Command | What it does |
| :--- | :--- |
| `npm run dev:web` | Vite dev server in Web mode (`vite --mode web`, default `http://localhost:5173`). |
| `npm run build:web` | Production build into **`dist-web/`** (`vite build --mode web --outDir dist-web`). |
| `npm run preview:web` | Serves `dist-web/` locally (default `http://localhost:4173`). |

- The Web edition is selected by `.env.web`, which contains only `VITE_GAME_EDITION=web`. It must never contain secrets.
- `dist-web/` is git-ignored and is **never written by Steam scripts**. Electron and the Steam builds load `dist/`; the Web commands never touch that folder.
### Updating the live site on Netlify
The Web edition is hosted at **https://bocaraton.backhansgames.com** (Netlify project of the same name, team Backhans Games). There is no Git connection or build on Netlify: each update is a manual upload ("Netlify Drop").

1. `npm run check` must end with **ALL 15 CHECKS PASSED** (includes the secret scan).
2. `npm run build:web` writes a fresh `dist-web/` (Vite empties it first).
3. Optional: `npm run play:web:build` to try the exact build locally.
4. In Netlify: Projects -> bocaraton.backhansgames.com -> **Deploys** tab -> drag the **`dist-web`** folder onto the drop area at the bottom.
5. Open the site and play a short match.

To undo, open an earlier deploy in the Deploys list and click **Publish deploy**. Never upload `dist/`: since the Web edition exists, `npm run build` produces the Steam Demo. The upload is the owner's step (it publishes); Claude Code prepares and checks the folder.

- Vite also loads `.env.local` in every mode. Vite only puts a variable into the browser bundle if client code references it, and no client code references the Gemini key, so the build is clean today. Still scan every Web build (section 8).

---

## 3. How the editions are told apart

`js/config.js` resolves exactly one edition from `VITE_GAME_EDITION` (function `resolveEdition`):

| `VITE_GAME_EDITION` | `isFullGame` | `isDemo` | `isWeb` | Built by |
| :--- | :-: | :-: | :-: | :--- |
| `full` | true | false | false | `vite build --mode full` (Steam Full) |
| not set / anything else | false | true | false | `vite build` (Steam Demo, the safe default) |
| `web` | false | false | true | `vite build --mode web` (Web) |

**Design rule:** the Web edition keeps `isFullGame` false, so it **inherits every Demo restriction** (the 5-character pool, no Mizner, and so on). It then opts out of Steam-specific behavior with explicit `GameConfig.isWeb` checks. A Steam build can therefore never run any Web code path.

---

## 4. What is different on the Web

| Area | Web Party Edition | Steam (unchanged) |
| :--- | :--- | :--- |
| After the splash | One party menu (the setup screen, reworked) | Hub with Solo Gambits / Play Board Game / Quit |
| Variation | Red Reef, forced at every match start | Player's choice |
| Players | 2-4 humans, 0 visitors | 1-4 locals + 0-3 visitors |
| Default names | `PLAYER 1`-`PLAYER 4`; typed names are never overwritten | `LOCAL` / `LOCAL n` |
| Random draft | Only the 5 Demo characters | Demo: all 10; Full: all 10 |
| Pick 2 | Available; unpicked cards return to the bottom of the pool so 4 players always get 2 candidates | Demo: locked; Full: unpicked card is discarded |
| Open Draft | The 5 Demo characters selectable; others show `FULL GAME` | Demo: shows `GAMBIT n` locks |
| Tutorial | Button on the party menu: Gambits 1 -> 2 -> 3 -> 4, played under player 1's name, then back to the menu | Campaign screen |
| Promos and links | No Kickstarter / Steam promos, wishlist, Discord, bug-report, news feed or Kickstarter banner | Demo shows them |
| Quit | No Quit button, no "Quit to Desktop" | Quit to desktop |
| Steam overlay ticker | Not started | Runs in the background |
| Dev hotkeys | `Ctrl+Shift+D` (god mode) and `U` (hide menu) are disabled | Active |
| Saves | Browser `localStorage`, key `bocaRatonWebSave` | `bocaRatonSaveGame` (browser) / `profile.json` (Electron) |
| Party menu buttons and heading | Heading "READY TO PLAY?" with the subtitle "Grab your friends. Let the games begin."; one row of three equal buttons: **SUPPORT US ♥** (left), **START MATCH** (middle, the only solid yellow one), **TUTORIAL** (right) | Original setup screen |
| Support Us popup | Opened only by the SUPPORT US button (never automatically): a banner photo (`public/assets/board_game_support_us.webp`, 2560x900) across the top, then two separate offer cards (Steam key at 50% off; the Kickstarter board game). The banner is downloaded only when the button is hovered/touched or the popup is opened. Closes with the X, CLOSE, Escape or a click outside. Links open in a new tab and carry tracking tags. Texts and links live in `js/support_links.js` | Not present |
| Party menu background | Full-window photo `public/assets/board_game.webp` (2560x1440), scaled with "cover" (fills the window, trims the edges, centered), shown only while the party menu is open, preloaded during the splash screen. No dark layer yet; how to add one is in the comment above the rule in `index.css`. | Animated water background |
| Window sizes | Board centered vertically, small-window notice, keyboard-resize guard, tap-to-preview in Open Draft on touch screens | Unchanged |

---

## 5. Code map

### New module: `js/web_party.js` (pure functions, no DOM, unit tested)
- `WEB_PARTY` constants (2-4 players, variation `JAEGA`, tutorial gambits `[1, 2, 3, 4]`).
- Party rules: `clampWebPlayers`, `applyWebPartyConfig`, `defaultPartyName`, `isSteamDefaultName`.
- Tutorial: `nextWebTutorialStep`, `webTutorialPrimaryLabel`, `pickTutorialName`, `isTutorialPopupId`.
- Small windows and touch: `webBoardOffsetY`, `isTextEntryElement`, `webSizeHint`, `WEB_SIZE_HINT_TEXT`, `usesTapToPreview`.

### Existing files with Web branches (all behind `GameConfig.isWeb`)
| File | What changed |
| :--- | :--- |
| `js/config.js` | `resolveEdition()` and `GameConfig.isWeb`. |
| `js/main.js` | `goToMainHub` redirects to the party menu; `goToSetupV2`, `startGame`, `setHumanCount`, `setBotCount`; new `app` methods `enforceWebPartyRules`, `startWebTutorial`, `advanceWebTutorial`, `restoreWebPartySnapshot`, `clearWebTutorialUI`, `updateWebSizeHint`, `dismissWebSizeHint`, `tapOpenDraftCard`; promo modals skipped; `handleGambitAction` / `handleGambitExit` / end-screen labels for the tutorial; `setBoardZoom` centering; `initAutoZoom` keyboard guard and size notice; dev hotkeys. |
| `js/draft_logic.js` | `getRandomDraftPool`, optional `recycleUnpicked` in `resolvePick2Selection`, optional `isWeb` in `isPick2BlockedInDemo`. |
| `js/UnlockManager.js` | `isDraftModeUnlocked` lets Web use Pick 2. |
| `js/game.js` | Random draft pool; blank-name fallback `Player n`. |
| `js/SaveManager.js` | `getSaveKey()`, Web save key, Web-safe hard wipe (removes only its own keys). |
| `js/ui.js` | Kickstarter banner and news feed hidden; Open Draft lock label and tap-to-preview. |
| `index.html`, `index.css` | Marker classes (below), party-menu markup and layout, size notice, tap preview, splash button scaling. |

### Marker classes (set up in `index.css`)
| Class | Effect |
| :--- | :--- |
| `html.edition-web` | Added by `main.js` when `isWeb` is true. Every Web CSS rule is scoped to it. |
| `.steam-only` | Element is **hidden** on Web (Quit, Discord, Report Bug, Change Local Name, Kickstarter banner). |
| `.hide-on-web` | Element is hidden on Web (variation picker, visitor section). |
| `.web-only` | Element is **shown only** on Web (party heading, Tutorial button, size notice). |
| `.draft-previewed` | Previewed Open Draft card on touch screens. |

---

### Changing the Support Us popup (texts and links)
Edit **only** `js/support_links.js`; no other file needs to change.
- The `url` of the Steam-key offer is a **placeholder** (`https://www.backhansgames.com`). Replace it with the real webshop page once it exists.
- Each offer has a heading, a text line, an optional badge (for example the 50% label), a button label, an accent color and a `url`. The cards are shown in the order of the list.
- An offer whose `url` is empty or not an http/https address is not shown, so there is never a dead button.
- Tracking: every link gets `utm_source=web_party`, `utm_medium=support_popup` and `utm_campaign=<offer id>` (the Steam-key offer is `steam-key`, the board game is `board-game`), so visits show up in your web statistics. Set `tracking` to `{}` to switch it off.
- The 50% label is the offer's `badge`: it is shown as plain colored text on purpose (a filled pill looked like a second button).
- **Banner picture:** replace `public/assets/board_game_support_us.webp` with a new file of the same name. Keep it **2560 x 900** (about 2.8:1, shown 2000 px wide edge to edge) and under 500 KB, with the top-right corner clear (the close button sits there) and the important content in the middle 60%. The tests check the size.
- After editing, run `npm run check`. The tests expect the current wording, so a deliberate text change needs the matching line in `tests/web_edition.test.js` (Test 35) updated.

---

## 6. Rules for working on the Web edition

1. **Steam must stay unchanged.** Put every Web change behind `GameConfig.isWeb`, or behind a CSS rule scoped to `.edition-web`. Never edit `electron-main.js`, `electron-builder.*.json`, `publish_*.sh`, `steam/` or `.env.full` for Web work.
2. **Absolute layout rule still applies.** Web party-menu elements use absolute pixel coordinates inside the 2840x1660 `.v2-panel` plate of `#panel-2-setup`. The only exception is the small-window notice, which is a browser-level overlay in real viewport pixels.
3. **Prefer pure helpers** in `js/web_party.js` for logic, so it can be tested without a browser.
4. **Test both directions:** a Web test for the new behavior and an assertion that the Steam path is unchanged.
5. **Line endings:** the source files in `js/`, `index.html` and `index.css` use CRLF in the Windows working copy. Edit them with tools that preserve line endings.
6. **Never put secrets in `.env.web`, docs, logs or the Web build.**

---

## 7. Tests

`tests/web_edition.test.js` (38 checks) covers the Web edition; the other nine files cover shared and Steam behavior. Run all of them:

```bash
for f in tests/*.test.js; do echo "== $f"; node "$f"; done
```

| Checks | Covers |
| :-: | :--- |
| 1-5 | Edition flags: exactly one of Full / Demo / Web; unset means Demo |
| 6-7 | Web npm scripts, `dist-web`, `.env.web` holds no secrets; Steam scripts unchanged |
| 8-10 | Save key per edition, Steam save/load/wipe round trip, Web-safe wipe |
| 11-13 | Steam-only items hidden only on Web; promos skipped; dev hotkeys off; overlay ticker |
| 14-19 | Party rules (2-4 players, 0 visitors, Red Reef), names, menu wiring, markup, scoped CSS |
| 20-23 | Pick 2 unlock per edition, Random pool, 2/3/4-player Pick 2 drafts (randomized), Steam rule unchanged |
| 24-27 | Tutorial chain, player 1's name, Web-only wiring, lesson popup cleanup |
| 28-32 | Board centering, keyboard guard, size notice, tap-to-preview, splash button |
| 33-34 | One game-over button; party menu background picture |
| 35-37 | Support Us: texts and links, tracking tags, no dead/unsafe offers; equal button row; popup is Web-only, opens only on click, closes four ways, links open in a new tab |
| 38 | Support Us banner photo (2560x900, loaded on demand), close button readable on white, badge is plain text |

`npm run check` runs all of these test files and also builds the three editions, scans the Web build for secrets and confirms the Steam files are unchanged; see [TESTING_EDITIONS.md](TESTING_EDITIONS.md).

> **Earlier flaky test, now fixed:** `eric_power_auction_interruption_regression.test.js` used to end with a random exit code because its mock bot lacked `player.inventory` (a timer then threw `TypeError ... reading 'push'`). The mock bots now have the fields the game expects, and the file exited 0 in 40 of 40 runs.

---

## 8. Verification status

### Done (built-in Chromium browser, Windows)
- Web, Demo and Full builds all compile; each build reports the right edition.
- Secret scan of `dist-web` (no Gemini key, Apple / Steam passwords, Steamworks code): clean after every step.
- Party matches with 2, 3 and 4 players in all three draft modes, including an auction; leaving a match; reload persistence.
- All four tutorial lessons chained, including a loss and RETRY, PARTY MENU, and leaving a lesson halfway. (The wins were forced by setting each lesson's win condition; the guided text steps were not clicked through.)
- Window sizes 1366x768, 1440x900, 1024x768, 800x450, 768x1024, 375x812; keyboard-resize guard; simulated touch-only screen for tap-to-preview.
- Steam Demo build re-checked in the browser after the changes that touch shared code: menus, locks, promos, Pick 2 lock, campaign end screen, board transform.
- `git diff main` shows no change to `electron-main.js`, `electron-builder.*.json`, `publish_*.sh`, `steam/` or `.env.full`.

### Not done
- **Steam builds were not launched in Electron.** Achievements, Steam overlay, quit, fullscreen and saves must be checked by the product owner on a real Steam build before anything is merged to `main`.
- **Safari (macOS and iPadOS), Firefox and mobile Chrome were not tested.** Only Chromium was available. Audio start-up, fullscreen and WebGL behavior should be checked there.
- **No real phone or tablet was used.** Touch behavior was simulated.
- No performance or load testing of the Netlify site.

---

## 9. Known limitations and open decisions

1. **Phones are not supported in v1.** At 375 px wide the board is about 1 cm across. Phones in portrait get a "rotate your device" notice; landscape phones are still tiny. Tablets in landscape (1024 px wide and up) are the smallest target.
2. **Lock label wording:** locked characters in Open Draft read `FULL GAME`, the same wording the Steam Demo compendium uses. It hints at the paid game; a neutral `LOCKED` is a one-line change if preferred.
3. **No privacy or hand-off screens.** Pick 2 candidates and gold are visible to everyone in the room (decision 4).
4. **Tutorial Gambit 3 has one scripted AI visitor** (it is a lesson about auctions). It is the only AI opponent in the Web edition.
5. **Stats and achievements:** nothing is sent to Steam, but the shared code still records career stats and a local achievements list in the Web save, crediting the first human player. No review was done of which Web screens display them.
6. **Console access:** `window.state` and the debug helpers exist in every build. Disabling the hotkeys is a convenience, not an anti-cheat measure, and a party game on one shared screen is assumed.
7. **Branding:** the party menu shows a text heading, not the game logo.
8. **`FULL GAME` / Steam links:** no "Get the full game" link exists anywhere on Web. Adding one is a product decision.
9. **Possible Steam bug, unrelated to Web and not touched:** the Windows Demo build's product name does not contain "demo", and `electron-main.js` picks the Steam App ID from that name, so the Windows Demo may start Steamworks with the Full App ID. Verify separately.

---

## 10. Before any public hosting (checklist, none of it done yet)

1. **Credential cleanup** (separate task, see `GIT_WORKFLOW.md`): `.env.local` and `.env.example` are tracked in Git and contain credentials. Rotate them, untrack/scrub the files, and decide what to do about Git history. Do this before the repository or any build is made public.
2. Run the secret scan on the exact `dist-web` that will be uploaded.
3. Check the licenses of the music, sound and art for web distribution (`ASSETS.md`).
4. Privacy: the page loads the Overpass font from Google Fonts (an external request that sends visitors' IP addresses to Google, which matters in the EU). Self-hosting the font removes this. The game itself uses only `localStorage`: no cookies, no analytics, no accounts.
5. `index.html` still carries an import map pointing at remote CDNs for packages the game never imports (`@google/genai`, `vite`, `@tailwindcss/vite`, `electron`). They are not fetched today; removing them from the Web build is tidy and safer.
6. Choose a host, serve over HTTPS, and cache hashed assets under `assets/` for a long time.
7. Test on Safari, Firefox and a real iPad (section 8).
8. The product owner launches the Steam Full and Demo builds in Electron once more, then decides about merging `feature/web-version` into `main` by pull request. Never push to `main` or to the frozen `AG-Steam-current-version` branch without explicit approval.
