# Palm Beach: the Steam editions (phase 2)

*Rewritten for Palm Beach in step 1.0 (25 Nov 2026). The original Boca text, with all Steamworks details: `_to_delete/boca_docs/STEAM_VERSIONS.md`.*

Palm Beach comes to the web first. Steam is phase 2. This page says what is kept ready and what must not be used yet.

## 1. Steam App IDs: placeholders only

| ID in the code | Belongs to |
|---|---|
| `4307400` | **Boca Raton** / Gold Coast Gambits (full game) |
| `4547980` | **Boca Raton** / Gold Coast Gambits Demo |

Palm Beach has **no Steam App IDs yet**. Lars supplies them in phase 2. Until then:

- `electron-main.js` still starts Steamworks with the Boca IDs, marked `PLACEHOLDER`.
- `js/steam_appid.txt` holds `4307400` (the file can only hold a number, so the note is here).
- The Steam store links in `js/main.js`, `js/blog.js`, `js/exit_promo.js` and `js/start_menu_pop_up.js` point at the Boca store page, marked `PLACEHOLDER`.
- **Never run `publish_mac.sh` or `publish_win.sh`.** They would upload Palm Beach into the Boca Raton Steam app.

Open question for Lars: will Palm Beach be its own Steam app, or part of Gold Coast Gambits?

## 2. One codebase, three editions

`VITE_GAME_EDITION` chooses the edition when the game is built: `full` (Steam Full), not set (Steam Demo), `web` (Web). `.env.full` holds `VITE_GAME_EDITION=full`. The Demo is the default because it is the safest thing to build by accident.

Electron decides Demo or Full from the app's name: if the name contains "demo", it uses the Demo App ID. The product names are now **Palm Beach** and **Palm Beach Demo** (`electron-builder.full.json`, `electron-builder.demo.json`).

## 3. What is kept for Steam

`electron-main.js`, `electron-builder.*.json`, `build/` (Mac entitlements), `steam/` (upload templates), `publish_*.sh`, `js/AchievementManager.js`, `js/SaveManager.js`, `.env.full`, `.env.example`. `npm run check` fails if one of them disappears.

## 4. Before phase 2 starts

1. Palm Beach App IDs and depot IDs from Lars; replace every `PLACEHOLDER`.
2. Decide what the Demo contains (Boca's Demo locks are tied to the Boca campaign).
3. Palm Beach achievements and statistics.
4. Start both Steam editions in Electron and check saving, fullscreen, quitting, the Steam overlay and achievements.
5. Possible inherited bug to check: on Windows the Demo's product name may not contain "demo", so the Demo could start with the Full App ID.
