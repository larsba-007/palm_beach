# Claude Code Developer Guide: Boca Raton (Gold Coast Gambits)

Welcome! You are taking over primary AI development for **Boca Raton** (published on Steam as **Gold Coast Gambits**), developed by **Backhans Games**.

The project creator **develops exclusively through AI-assisted coding and does not read or edit source code directly**. You are responsible for ensuring high code quality, system safety, and clear, human-oriented communication.

---

## 1. Quick Technical Reference

- **Language / Engine**: Pure Modern JavaScript (ES Modules), HTML5, CSS3.
- **Styling**: Tailwind CSS (v4) and custom CSS (`index.css`).
- **Shader Pipeline**: WebGL Fragment Shader (`src/shaders/water.frag`) compiled via `vite-plugin-glsl`.
- **Bundler**: Vite (`vite.config.ts`).
- **Desktop Runtime**: Electron (`electron-main.js`) with native Steamworks (`steamworks.js`).
- **Target Resolution**: Fixed 4K Virtual Canvas (`3840px × 2160px`) scaled dynamically via CSS transform.

---

## 2. Crucial Coding Rules & Constraints

> [!IMPORTANT]
> **LAYOUT RULE: ALWAYS USE ABSOLUTE POSITIONING**
> Always position all panels, buttons, grids, text boxes, and card views inside game screens (`panel-1-hub`, `panel-2-setup`, `panel-3-gambits-v2`, `game-ui`) using **absolute coordinates** (`position: absolute; top: ...px; left: ...px; width: ...px; height: ...px;`) relative to the fixed 4K canvas (`3840px × 2160px`) or relative to `.v2-panel` glass plate boundaries.
> 
> *Rationale*: The game uses a continuous viewport scaling wrapper that transforms the entire screen via a CSS scale factor. Absolute coordinate systems prevent elements from reflowing, breaking margins, wrapping text lines, or offsetting card heights when browser windows resize.

### Other Key Conventions:
- **Preserve Documentation & Comments**: Maintain all existing comments and docstrings.
- **No Direct Mutation of Knowledge**: When writing AI bot behaviors, never read hidden cards or secret player gold directly from `state`. Always access through `ai_knowledge.js` firewall.
- **Safe Asset URLs**: When referencing assets, always use `new URL(/* @vite-ignore */ '../assets/...', import.meta.url).href` with static string literals.
- **Platform Separation**: Never import Node.js or Electron modules in renderer files without guarding with `if (GameConfig.isElectron)`.
- **Web Edition Isolation**: Any Web-only behavior must sit behind `GameConfig.isWeb` (or a CSS rule scoped to `html.edition-web`) so Steam Full and Demo stay exactly as they are. Put Web logic in the pure module `js/web_party.js` and cover it in `tests/web_edition.test.js`.
- **Line Endings**: `js/*.js`, `index.html` and `index.css` have CRLF endings in the Windows working copy. Preserve them when editing.

---

## 3. Working with the User (Non-Programmer)

- **Explain "Why" and "What", Not Raw Code**: Explain gameplay consequences, visual updates, and strategic impact in plain language.
- **Be Methodical**: When making changes, make targeted edits and verify against existing tests before reporting completion.
- **Do Not Guess Missing Rules**: If a game rule or design decision is ambiguous, ask the user for clarification rather than assuming.

---

## 4. Full, Demo and Web Version Management

- All three editions share the **same codebase**. The Steam editions are released from `main`; the Web edition is developed on `feature/web-version`.
- **Full Version**: Built via `vite build --mode full` (`GameConfig.isFullGame === true`, Steam App ID `4307400`).
- **Demo Version**: Built via `vite build` (`GameConfig.isDemo === true`, Steam App ID `4547980`).
- **Web Party Edition**: Built via `npm run build:web` into `dist-web/` (`GameConfig.isWeb === true`, `.env.web`). Browser only, 2-4 players on one screen, Red Reef only, no AI opponents, Demo character pool. It keeps `isFullGame` false (so it inherits the Demo restrictions) and opts out of Steam behavior with explicit `isWeb` checks. Details: `docs/WEB_EDITION.md`.
- When introducing new features, always evaluate whether the feature belongs in the Demo or must be gated in `js/UnlockManager.js` and `js/main.js`, and whether the Web edition needs its own behavior.

---

## 5. Safe Git Practices

- **Never Force-Push**: Never use `git push --force` or modify public history.
- **Do Not Break Live Steam**: The `main` branch directly feeds the live Steam release pipelines (`publish_mac.sh` and `publish_win.sh`). Do not change `main` without the product owner's explicit approval, and never publish or upload builds to Steam from a feature branch.
- **Frozen Refs**: Never modify the branch `AG-Steam-current-version` or the tag `ag-steam-handover-2026-10-21`.
- **Develop Web Features on `feature/web-version`**: Always work on a feature branch before implementing browser-specific adjustments or major refactorings.
- **Never Commit Secrets**: Ensure `.env.local` or files with API keys and Apple passwords are never staged or committed. `.env.web` and `.env.full` hold only the edition flag and are safe. Credential cleanup of the historical files is a separate, pending task (`docs/GIT_WORKFLOW.md`). Never display, copy or put credentials into docs, logs, prompts or browser builds.

---

## 6. Testing & Quality Commands

```bash
# Start local browser dev server (Demo mode)
npm run dev

# Start local browser dev server (Full mode)
npm run dev:full

# Web Party Edition: dev server, build into dist-web/, preview the build
npm run dev:web
npm run build:web
npm run preview:web

# Friendly short names for the owner's testing (aliases of the commands above)
npm run play:full
npm run play:demo
npm run play:web
npm run play:web:build

# One command that checks everything (tests, 3 builds, Web secret scan, Steam files unchanged)
npm run check

# Run desktop Electron app locally
npm run electron:dev
npm run electron:dev:full

# Run individual regression test suites
node tests/gambit_progression.test.js
node tests/open_draft_escape_regression.test.js
node tests/pick_2_draft_regression.test.js
node tests/auction_audio_regression.test.js
node tests/web_edition.test.js

# Run all test files
for f in tests/*.test.js; do echo "== $f"; node "$f"; done

# Build production executables
npm run build:demo:win
npm run build:full:win
npm run build:demo:mac
npm run build:full:mac
```

---

## 7. Documentation Index

For exhaustive technical and design details, consult the `docs/` library:

- [ARCHITECTURE.md](docs/ARCHITECTURE.md): System architecture, module map, data flow, scaling engine.
- [GAME_RULES.md](docs/GAME_RULES.md): Complete board layout, dice checks, luxury market, auctions, characters, bots, win conditions.
- [STEAM_VERSIONS.md](docs/STEAM_VERSIONS.md): Full vs Demo gating, promotional popups, Steamworks SDK integration.
- [WEB_EDITION.md](docs/WEB_EDITION.md): Web Party Edition: differences from Steam, code map, tests, verification status, known limits, pre-launch checklist.
- [ASSETS.md](docs/ASSETS.md): Spritesheets, textures, music tracks, sound effects, typography, licensing.
- [GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md): Git remotes, branches, credentials risk, and cross-platform conventions.
- [DEVELOPMENT.md](docs/DEVELOPMENT.md): Detailed installation, commands, tests, and debugging utilities.
- [TESTING_EDITIONS.md](docs/TESTING_EDITIONS.md): The owner's copy-paste cheat sheet of start / test / stop commands for the three editions.
- [WEB_MIGRATION.md](docs/WEB_MIGRATION.md): Original comparison of web deployment pathways (Option 1 was built) and sister game architecture.
- [PROJECT_STATUS.md](docs/PROJECT_STATUS.md): Current completion status, known bugs, technical debt, and prioritized roadmap.
- [DESIGN_RECIPE.md](DESIGN_RECIPE.md): V2 glass panel CSS recipes, Overpass typography, and card scaling specifications.
