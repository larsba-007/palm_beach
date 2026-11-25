# Boca Raton: Project Status & Roadmap

This document summarizes the current development status, completed features, known bugs, technical debt, and prioritized next steps for Claude Code.

---

## 1. Currently Completed Features

### 1.1 Core Game Systems
- [x] **8×9 Game Board Engine**: 56 map cells, 16 central auction cells, 4 distinct terrain regions (Lagoon, Waterfront, City Block, Atlantic).
- [x] **10 Playable Local Characters**: Full implementation of starting powers, re-rolls, extra turns, and unique character abilities (Leja, Roxana, Addison, Flagler, Kingston, Post, Eric, Bright Shell, Carina, Silviano).
- [x] **10 Visitor AI Opponents**: 3 intelligence tiers, 3 AI depths, and 3 distinct personalities (Goober through Gran Gran) with authentic knowledge firewalls.
- [x] **50 Gambit Campaign**: 10 distinct campaign levels (5 Gambits per level) featuring custom mid-game and end-game objectives, progressive 4/5 unlocks, and impossibility detection.
- [x] **Property Auction System**: Turn-based English ascending auctions for Mar-a-Lago (tiebreaker), Gulf Stream, and Spanish River.
- [x] **17 Luxury Cards**: 3 purchase tiers (5, 10, 15 Au) with dice difficulty checks and Prestige scoring.
- [x] **Line Bonuses & Landmarks**: 5 Au row/column completion payouts, Addison Mizner 10 Au bonus, and 10 historical Florida landmarks with lore dossiers.
- [x] **Character Drafting**: Pre-Selected, Pick 2 (Pair), and Open Draft mechanics.

### 1.2 Presentation, Audio & UX
- [x] **4K Virtual Canvas Scaling System**: Containment scaling to any window size (minimum zoom 0.1) without text reflow. Comfortable from about 1024 px wide upward; phones are too small (see section 2).
- [x] **Dynamic WebGL Background**: `water.frag` shader with 4 reactive color palettes matching game screens.
- [x] **Comprehensive Audio Engine**: 4 BGM tracks, title theme, 15 SFX cues, volume controls, and sound ducking.
- [x] **V2 Glass Plate UI**: Standardized frosted glass modals, compendiums, dossiers, tutorials, and settings menus.

### 1.3 Platform & Distribution
- [x] **Steam Desktop Releases**: Fully automated packaging and SteamCMD pipelines for Windows and macOS.
- [x] **Steamworks Integration**: Steam Overlay 60 FPS hooking, Discord overlay activation, and 25+ native Steam achievements.
- [x] **Cross-Platform Persistence**: `SaveManager.js` supporting Electron filesystem and browser `localStorage`.
- [x] **Demo & Full Feature Gating**: Seamless runtime and build-time separation between Demo and Full versions.
- [x] **Web Party Edition (developed, not published)**: Third edition for browsers, 2-4 players on one screen, Red Reef only, no AI opponents, Random / Pick 2 / Open Draft with the Demo character pool, one party menu, guided Tutorial (Gambits 1-4), own save slot, small-window and touch handling, a party-menu background photo, a "Support Us" popup (Steam-key offer and Kickstarter board game, with a banner photo), a one-button game-over screen, and the short commands `npm run play:full` / `play:demo` / `play:web` / `play:web:build` / `check`. Lives on `feature/web-version`; see [WEB_EDITION.md](WEB_EDITION.md) for what is verified and what is not.

---

## 2. Known Bugs & Limitations

1. **Phones are too small to play (all editions in a browser)**:
   - The old "Window Too Narrow" overlay is dead code: it is hidden on every resize, so there is no minimum window width. The real limit is legibility: roughly 1024 px wide and up works; a phone in portrait shows a board about 1 cm across. The Web edition shows a "rotate your device / small window" notice. Phones are out of scope for the Web v1.
2. **Tracked Secrets in Git (NOT remediated; separate task)**:
   - `.env.local` is tracked and `VITE_GEMINI_API_KEY` has a value.
   - `.env.example` is tracked and `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` and `STEAM_USERNAME` have values.
   - Details and the safe `.gitignore` fix (keep `.env.full` and `.env.web` tracked): [GIT_WORKFLOW.md](GIT_WORKFLOW.md) section 2.
3. **Dangling WebP Asset with Space**:
   - `public/assets/ .webp` (476 KB) is tracked in Git with a leading space in its filename and is unreferenced anywhere in code.
4. **Eric regression test: fixed**:
   - The test used to exit 0 or 1 at random (a timer in its mock setup threw on a missing `player.inventory` of the mock bot; 5 of 6 runs exited 1). The mock bots now carry `inventory`, `prestige` and `cards`, and the file exited 0 in 40 of 40 runs. It was a test-harness artifact, not a gameplay defect.
5. **No `"test"` script in `package.json`** (partly addressed):
   - `npm run check` now runs every test file plus the three builds, the Web secret scan and the Steam-files check, and prints PASS / FAIL (see [TESTING_EDITIONS.md](TESTING_EDITIONS.md)). A plain `npm test` entry point still does not exist.
6. **Possible wrong Steam App ID in the Windows Demo build (unverified, not touched)**:
   - `electron-main.js` picks the Steam App ID from the Electron product name (a name containing "demo" means the Demo ID). The Windows Demo script builds with the generic product name "Boca Raton Board Game", which has no "demo", so it may start Steamworks with the Full App ID. The macOS Demo uses a separate config that is named "Gold Coast Gambits Demo". Check this on a real Windows Demo build.
7. **Web edition: stats are still recorded**:
   - Shared code records career stats and a local achievement list in the Web save and credits the first human player. Nothing is sent to Steam. Which Web screens show these numbers has not been reviewed.

---

## 3. Technical Debt

1. **Monolithic Files**:
   - `js/main.js`: about 6,080 lines (handles window events, UI bindings, modals, loop orchestration).
   - `js/ui.js`: about 4,620 lines (creates DOM elements, renders cards, executes CSS/JS animations).
   - `js/game.js`: about 2,870 lines (implements turn cycles, dice checks, auctions, line bonuses).
   - *Impact*: Large files increase token consumption for AI assistants. Modularizing these into sub-modules will lower AI maintenance costs. The Web edition keeps its logic in the small pure module `js/web_party.js` for this reason.
2. **Unused Dependencies**:
   - `@google/genai` is listed in `package.json` and `index.html` importmap, but is never imported or executed in game source code. The importmap also lists remote URLs for `vite`, `@tailwindcss/vite` and `electron`, which the game never imports.
   - `index.tsx` is an empty 1-line file left over to prevent Vite build conflicts.
   - `js/tutorial.js` (`TutorialManager`) is legacy: nothing starts it. The tutorial lessons that actually run for Gambits 1-4 live in `js/ui.js` (`runTutorialStep` and the `showG*` popups).
3. **Direct HTML String Template Concatenation**:
   - Several UI modals and tooltips use raw template literals injected via `innerHTML`. While safe in this isolated client, modernizing to component-based rendering will improve maintainability.

---

## 4. Current Development Status

The Steam game is **stable, feature-complete, and actively deployed on Steam** (`main` is untouched).

The **Web Party Edition is developed** on `feature/web-version` (Steps 1-7: edition setup, Web-only restrictions, party menu, drafts, tutorial, small windows and touch, final checks and docs; then the testing shortcuts, the party-menu background, the one-button game-over screen and the Support Us popup). It is **not merged** into `main`. It is hosted on Netlify at https://bocaraton.backhansgames.com, updated by hand by uploading `dist-web/` (routine: [WEB_EDITION.md](WEB_EDITION.md) section 2). The branch is pushed to `origin/feature/web-version`. `npm run check` passed (15 of 15) on the last commit. Details and verification status: [WEB_EDITION.md](WEB_EDITION.md).

---

## 5. Prioritized Next Steps

| Priority | Task | Objective & Guidance |
| :---: | :--- | :--- |
| **P1** | **Credential Remediation** | Separate, approved task: rotate the Gemini key and the Apple app-specific password, untrack `.env.local`, scrub `.env.example`, fix `.gitignore` (keep `.env.full` and `.env.web`). See [GIT_WORKFLOW.md](GIT_WORKFLOW.md). |
| **P1** | **Launch-check the Steam builds in Electron** | Before any merge to `main`: run Full and Demo in Electron and check achievements, Steam overlay, quit, fullscreen and saves. This was not verified during the Web work. |
| **P1** | **Web: test on real browsers and devices** | Safari (macOS and iPadOS), Firefox, a real iPad. Only Chromium was used. |
| **P1** | **Replace the placeholder Steam-key link** | The "GET MY STEAM KEY" button in the Support Us popup goes to `https://www.backhansgames.com` until the webshop page exists. Change `url` in `js/support_links.js` (one line; see [WEB_EDITION.md](WEB_EDITION.md), "Changing the Support Us popup"). Also confirm the Kickstarter link and the wording of the 50% offer (end date / conditions). |
| **P1** | **Push the unpushed commits** | Only when the product owner asks (`git push origin feature/web-version`, never force). Check with `git status -sb`. |
| **P2** | **Web: hosting and release decisions** | Host, HTTPS, self-hosted font (Google Fonts leaks visitor IPs), asset licenses for web, logo on the party menu. Checklist: [WEB_EDITION.md](WEB_EDITION.md) section 10. |
| **P2** | **Web: first-time visitor / slow-connection test (idea, not built)** | The first visit downloads about 2 MB on load, about 4.5 MB of sound when Start is pressed and about 2.5 MB of music when a match starts; there is no loading indicator. Proposed: a local "slow connection" server (`play:web:slow` style commands, plus profiles where sound or pictures fail), then a first-visit test and a decision about any fixes. Until then use Chrome DevTools: Network tab with "Disable cache" and throttling, in a private window. |
| **P2** | **Decide on merging `feature/web-version`** | Only through a reviewed pull request, after the checks above. |
| **P3** | **Optional: add a plain `npm test` script** | `npm run check` already runs the tests; `"test"` could simply point at the same script or at `node --test tests/*.test.js`. (The Eric test is already fixed.) |
| **P2** | **Verify the Windows Demo Steam App ID** | See known bug 6. |
| **P2** | **Remove Dead Dependencies** | Remove `@google/genai` from `package.json` and the importmap, and delete `public/assets/ .webp`. |
| **P4** | **Sister Game Modularization** | Extract rules engine into standalone modules for the new game with different rules. See [WEB_MIGRATION.md](WEB_MIGRATION.md). |

Done: snapshot tag `ag-steam-handover-2026-10-21` (replaces the planned `v1.0.0-steam`), branch `feature/web-version`, Web edition, tablet/small-window scaling (done differently: there was no 1280 px barrier to lower).

---

## 6. Handover for a new Claude Code session

**Read first:** `CLAUDE.md`, [WEB_EDITION.md](WEB_EDITION.md) (what the Web edition is, code map, tests, verification status, pre-launch checklist) and [TESTING_EDITIONS.md](TESTING_EDITIONS.md) (the owner's command cheat sheet). The owner is a non-programmer who works step by step: describe results in plain language, make **one approved step at a time**, and ask before anything outward-facing.

### What the previous session built (all on `feature/web-version`, one commit per step)
1. Edition setting `GameConfig.isWeb` + Web build commands (`dist-web/`, `.env.web`). 2. Steam-only items hidden, dev hotkeys off, own save key. 3. One party menu (names, 2-4 players, draft mode, Start, Tutorial). 4. Pick 2 unlocked on Web with recycled cards so 4 players work; Random limited to the 5 Demo characters. 5. Tutorial chains Gambits 1-4 under player 1's name, then back to the menu. 6. Small windows, touch (tap-to-preview in Open Draft), keyboard-resize guard, vertical board centering. 7. Docs. Then: `play:*` shortcuts and `npm run check`, Eric test fixed, party-menu background photo (`board_game.webp`, 2560x1440, "cover", no dark layer), one MAIN MENU button on the game-over screen, heading "READY TO PLAY?", row **SUPPORT US ♥ | START MATCH | TUTORIAL** (equal size), and the Support Us popup (banner `board_game_support_us.webp` 2560x900; texts and links in `js/support_links.js`).

### Product decisions (do not re-litigate without the owner)
- Web edition = party game: **Red Reef only, 2-4 humans on one screen, no AI opponents** (except the scripted visitor in tutorial Gambit 3), Demo character pool (Bright Shell, Leja, Silviano, Carina, Ms. Post), Random / Pick 2 / Open Draft, existing hot-seat engine reused, **no hidden-information screens** (accepted), one menu after the splash, Tutorial button = Gambits 1-4.
- **Steam Full and Demo must stay unchanged.** Every Web branch is behind `GameConfig.isWeb` or CSS scoped to `html.edition-web`. Never modify `main`, `AG-Steam-current-version` or the tag `ag-steam-handover-2026-10-21`; never force-push; never publish to Steam.
- Phones are out of scope for v1 (tablets in landscape, about 1024 px wide and up, are the smallest target).
- Background picture: option "cover", **no dark overlay for now** (owner may ask for one later; the way is in a comment in `index.css`).
- Support Us: Web only, **opens only on a click, never automatically**, never during a match; two clearly separate offers; links open in a new tab with tracking tags (`utm_source=web_party`); the 50% label is plain text, not a button look. Steam-key link is a **placeholder** (`https://www.backhansgames.com`).
- Locked characters in Open Draft read "FULL GAME" (same wording as the Demo compendium); a neutral "LOCKED" is a one-line change if the owner prefers.

### Open items and next steps
See section 5. In short: replace the placeholder webshop link; push the 2 unpushed commits when asked; credential cleanup (separate approved task, nothing done: `.env.local` and `.env.example` are tracked with real values); the owner must launch the Steam Full and Demo builds in Electron before any merge to `main`; test on Safari, Firefox and a real iPad; hosting decisions; decide on merging by pull request; verify the Windows Demo Steam App ID (known bug 6); optional first-time-visitor / slow-connection test.

### Practical notes and pitfalls
- **Run everything with `npm run check`** (tests, three builds, Web secret scan, Steam files identical to `main`; must print ALL 15 CHECKS PASSED). Short commands: `play:full`, `play:demo`, `play:web`, `play:web:build`.
- **Line endings:** `js/*.js`, `index.html`, `index.css`, `package.json` are CRLF in the Windows working copy. Edit them with exact-match scripts or tools that preserve CRLF; `sed -i` strips CRs. Docs and new files are LF.
- **Shell quoting:** never put backticks inside a `bash -c "..."` or `node -e "..."` string; the shell runs them as commands (this garbled a doc once). Write helper scripts to a file instead.
- **Test servers:** start Vite with `node node_modules/vite/bin/vite.js ...` (not `npx`), stop it afterwards, close browser tabs (the game plays music), reset the viewport. In the built-in browser, screenshots can be cropped or lag a frame and coordinate clicks can miss; confirm layout with `getBoundingClientRect()` and use element clicks.
- **A Web preview server may still be running on port 4173** (started by the previous session for the owner). Stop it when done: PowerShell `Stop-Process -Id (Get-NetTCPConnection -LocalPort 4173 -State Listen).OwningProcess`.
- Local Electron tests start Steam as the **Full** App ID even for the Demo (the app name has no "demo"); do not test achievements from the Demo. Every `vite build` empties `dist/`: build and upload one Steam edition at a time.
