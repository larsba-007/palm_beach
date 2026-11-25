# Palm Beach: how the code is organised

*Rewritten for Palm Beach in step 1.0 (25 Nov 2026). The original Boca Raton text: `_to_delete/boca_docs/ARCHITECTURE.md`.*

## 1. The short version

- One web page (`index.html`) run by plain JavaScript modules in `js/`, bundled with **Vite**, styled with **Tailwind** and `index.css`.
- For Steam it is wrapped in **Electron** (`electron-main.js`). For the web it is just the built folder `dist-web/`.
- Three editions share the code: Web, Steam Demo, Steam Full. `js/config.js` sets exactly one of `GameConfig.isWeb` / `isDemo` / `isFullGame` from `VITE_GAME_EDITION`.
- Everything on screen sits at fixed pixel positions on a **3840 × 2160 canvas** that is scaled as a whole to fit the window (see `DESIGN_RECIPE.md`).

## 2. What is Palm Beach and what is still Boca

The code started as a copy of the Boca Raton game. It is changed step by step (`PLAN.md`).

| Part | Status after step 1.0 |
|---|---|
| Name, window title, in-game title, save keys | **Palm Beach** |
| Character card pictures, Map Card fronts, Diamond picture | **Palm Beach** art |
| Game rules (`js/game.js`) | **Boca**: free turns, Luxury piles with prices, row and column bonuses, two mid-board auctions, Extra Turns |
| Character powers and counters (`js/characters.js`) | **Boca** |
| The board on screen (`js/ui.js`) | **Boca** layout |
| AI opponents (`js/ai_engine.js`, `js/ai_knowledge.js`, `js/bots.js`) | **Boca**, not used in Palm Beach version 1 |
| Campaign (`js/gambit_data.js`), tutorial lessons | **Boca**, not used in Palm Beach version 1 |
| Splash picture | Still says "Boca Raton and Palm Beach / Gold Coast Gambits" (the text is part of the picture) |

## 3. Where Palm Beach is going (PLAN.md, "How the code is built")

Palm Beach is round-based: 8 rounds, initiative, a flipping phase and an auction every round. Boca's `js/game.js` (2,900 lines) is built around free turns, so it is **not** bent into Palm Beach. Instead:

- **The rules engine in `js/rules/`** (done in step 1.1): small files with no screen code, tested by `tests/pb_*.test.js`.
  `data.js` (cards, characters, numbers), `rng.js` (shuffle and die, repeatable from a seed), `setup.js`, `initiative.js`, `flipping.js`, `diamonds.js`, `auction.js`, `scoring.js`, and `engine.js` (the whole game). Import everything from `js/rules/index.js`.
- **One "ask the player" point.** Every decision (which card, re-roll or not, bid or pass) goes through the `askPlayer(request, game)` function given to `playGame`. Version 1 answers with clicks, version 2 with a tutorial script, version 3 with an AI. The engine never assumes a human. The list of requests is at the top of `js/rules/engine.js`.
- **Events.** The engine tells the screen what happened through `emit(event, game)` (card flipped, die rolled, bid made, ...) and waits for it, so an animation can finish before the game goes on.
- **The engine is not connected to the screen yet.** That happens in steps 1.2–1.5.
- **The screen code** (`js/ui.js`, `js/main.js`) is reused where it fits: the scaling canvas, card and dice animations, the bidding window, landmark pop-ups, audio, the party menu.
- **The rules are shared code**, so the Steam editions get them without a rewrite. Web-only behaviour stays behind `GameConfig.isWeb`.

## 4. The files

| Path | What it is |
|---|---|
| `index.html`, `index.css` | The page, all panels and pop-ups, the styles |
| `js/main.js` | Menus, screens, scaling, events (inherited) |
| `js/game.js` | **Boca** rules: turns, flips, dice, auctions |
| `js/ui.js` | Drawing the board, cards, animations |
| `js/state.js` | The one `state` object with everything about the running game and the saved profile |
| `js/config.js` | Which edition, and whether it runs in Electron |
| `js/SaveManager.js` | Saving: a file in Electron, `localStorage` in the browser |
| `js/data.js` | Board size, picture and sound addresses, Property Cards |
| `js/characters.js` | The 10 characters (still Boca texts and powers) |
| `js/landmarks.js` | Landmarks and their bonus gold |
| `js/draft_logic.js` | Choosing characters: Random, Pick 2, Open Draft |
| `js/web_party.js` | Web edition rules as pure, tested functions (the model for the new rules engine) |
| `js/support_links.js` | Texts and links of the Support Us popup |
| `js/audio.js`, `js/background.js`, `src/shaders/water.frag` | Sound and the animated water background |
| `js/AchievementManager.js`, `js/UnlockManager.js`, `js/StatsUI.js` | Achievements, unlocks, statistics (Steam; keep) |
| `js/ai_engine.js`, `js/ai_knowledge.js`, `js/bots.js`, `js/gambit_data.js`, `js/tutorial.js` | Boca AI, campaign and tutorial |
| `electron-main.js`, `electron-builder.*.json`, `build/`, `steam/`, `publish_*.sh` | Electron and Steam packaging (phase 2; keep, never run the publish scripts) |
| `tests/` | Tests, run with `npm run check` |
| `scripts/check-all.mjs` | The safety check behind `npm run check` |
| `scripts/png-to-webp.cjs` | Turns a PNG into `.webp` |
| `public/assets/` | Pictures and sound used by the game |
| `assets_source/palm_beach_print/` | Art cut from the print files (sources) |

## 5. Saving

- **Web:** `localStorage` key `palmBeachWebSave`.
- **Steam editions in a browser:** `palmBeachSaveGame`. **In Electron:** `profile.json` in the folder `palm-beach-save`.
- A small flag is stored as `palmBeachDontShowTutorialRecommended`.
- Palm Beach never reads or writes the Boca keys (`bocaRatonWebSave`, `bocaRatonSaveGame`, `bocaRatonProfile`, `boca_scores`). Boca's old save migration in `js/state.js` is switched off.

## 6. The 4K canvas

`initAutoZoom()` in `js/main.js` measures the window and scales the whole 3840 × 2160 stage with one factor (`min(width / 3840, height / 2160)`, never below 0.1). Because everything is scaled together, every element must have a fixed pixel position and size. Flowing layouts break. Details in `DESIGN_RECIPE.md`.

## 7. Steam and Electron (phase 2)

Steam code is only in `electron-main.js` and behind safe checks in `AchievementManager.js`. In a browser those checks find no Electron and do nothing. The Steam App IDs in the code belong to Boca Raton and are marked `PLACEHOLDER` (see `STEAM_VERSIONS.md`).
