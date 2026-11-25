<div align="center">
  <h1>🌴 Boca Raton (Gold Coast Gambits)</h1>
  <p><strong>A high-stakes strategy board game set in Palm Beach and Boca Raton.</strong></p>
  <p>Published on Steam as <em>Gold Coast Gambits</em> by Backhans Games.</p>
</div>

---

## 1. Project Overview

**Boca Raton** is a digital board game combining real estate acquisition, high-stakes auctions, luxury item collection, and strategic character abilities across the barrier islands of South Florida.

The game exists in three editions that share one codebase:
1. **Gold Coast Gambits (Steam Full Version)** — App ID `4307400`
2. **Gold Coast Gambits Demo (Steam Demo Version)** — App ID `4547980`
3. **Web Party Edition** — plays in a browser, no Steam, for 2-4 people sharing one screen. Developed on the branch `feature/web-version`; **not yet hosted or published** (see [docs/WEB_EDITION.md](docs/WEB_EDITION.md)).

A sister game utilizing the same graphical assets and chassis is planned for a later phase.

---

## 2. Technology Stack

- **Frontend / Engine**: Pure Modern JavaScript (ES Modules, HTML5, CSS3).
- **Styling**: Tailwind CSS (v4) with custom glassmorphism styles (`index.css`).
- **Dynamic Shaders**: WebGL Fragment Shader (`src/shaders/water.frag`) compiled via `vite-plugin-glsl`.
- **Bundler & Tooling**: Vite (`vite.config.ts`), TypeScript definitions (`tsconfig.json`).
- **Desktop Runtime**: Electron (`electron-main.js`) with native Steamworks SDK hooks (`steamworks.js`).
- **Layout Architecture**: 4K Virtual Canvas (`3840px × 2160px`) with continuous contain-scale transforms.

---

## 3. Quick Start & Local Development

### Prerequisites
- Node.js (v20+ recommended, verified on v24.15.0)
- npm

### Installation
```bash
# Clone the repository
git clone https://github.com/larsba-007/boca-raton.git
cd boca-raton

# Install dependencies
npm install
```

### Running Locally
```bash
# Run in web browser (Demo mode default)
npm run dev

# Run in web browser (Full Game mode)
npm run dev:full

# Run in web browser (Web Party Edition)
npm run dev:web

# Friendly short names (one per edition) and the safety check
npm run play:full       # Steam Full in an Electron window
npm run play:demo       # Steam Demo in an Electron window
npm run play:web        # Web Party Edition, opens in the browser
npm run play:web:build  # Web Party Edition as it would be hosted
npm run check           # all tests + 3 builds + secret scan + Steam files unchanged

# Run desktop Electron application locally (Demo mode)
npm run electron:dev

# Run desktop Electron application locally (Full Game mode)
npm run electron:dev:full
```

---

## 4. Building & Publishing for Steam

### 4.1 Production Executables
```bash
# Windows Builds (Output: dist/demo-game or dist/full-game)
npm run build:demo:win
npm run build:full:win

# macOS Builds (Output: dist/demo-game or dist/full-game)
npm run build:demo:mac
npm run build:full:mac
```

### 4.2 Automated Steam Publishing Pipelines

#### 🟢 Updating the Demo Version (App ID: 4547980)
- **macOS Build & Deploy**:
  ```bash
  ./publish_mac.sh demo
  ```
- **Windows Build & Deploy (from Mac / Git Bash)**:
  ```bash
  ./publish_win.sh demo
  ```

#### 🔵 Updating the Full Version (App ID: 4307400)
- **macOS Build & Deploy**:
  ```bash
  ./publish_mac.sh full
  ```
- **Windows Build & Deploy (from Mac / Git Bash)**:
  ```bash
  ./publish_win.sh full
  ```

*After running either publish script, navigate to your Steamworks Partner Portal (`SteamPipe -> Builds`), select the newly uploaded Build ID, and set it live on your `default` or `beta` branch.*

### 4.3 Web Party Edition (no Steam, nothing is uploaded)
```bash
# Build into dist-web/ (git-ignored; does not touch the dist/ folder Electron uses)
npm run build:web

# Serve that build locally
npm run preview:web
```
Scan `dist-web/` for secrets before it is ever uploaded (see [docs/WEB_EDITION.md](docs/WEB_EDITION.md)).

---

## 5. Technical Documentation Library

Detailed technical documentation is maintained in the `docs/` directory:

| Document | Topic |
| :--- | :--- |
| **[CLAUDE.md](CLAUDE.md)** | Developer instructions for Claude Code and AI coding assistants. |
| **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** | System architecture, modules, rendering, state, and platform abstraction. |
| **[GAME_RULES.md](docs/GAME_RULES.md)** | Complete authoritative rules: board layout, dice checks, luxury market, auctions, characters, bots, win conditions. |
| **[STEAM_VERSIONS.md](docs/STEAM_VERSIONS.md)** | Full vs Demo gating, promotional modals, and Steamworks SDK integration. |
| **[WEB_EDITION.md](docs/WEB_EDITION.md)** | The Web Party Edition: what differs from Steam, code map, tests, verification status, known limits, pre-launch checklist. |
| **[ASSETS.md](docs/ASSETS.md)** | Spritesheets, textures, music tracks, sound effects, fonts, shaders, and licensing. |
| **[GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)** | Git setup, credentials risks, cross-platform workflows, and branching strategy. |
| **[DEVELOPMENT.md](docs/DEVELOPMENT.md)** | Commands, test suites, in-game debugging utilities, and platform notes. |
| **[TESTING_EDITIONS.md](docs/TESTING_EDITIONS.md)** | One-page cheat sheet (copy-paste ready) to start, test and stop Steam Full, Steam Demo and the Web edition. |
| **[WEB_MIGRATION.md](docs/WEB_MIGRATION.md)** | Original analysis of browser deployment options (Option 1 was built) and future sister game extensibility. |
| **[PROJECT_STATUS.md](docs/PROJECT_STATUS.md)** | Feature completion checklist, known bugs, technical debt, and prioritized roadmap. |
| **[DESIGN_RECIPE.md](DESIGN_RECIPE.md)** | 4K layout constraints, V2 glass plates, Overpass typography, and card scaling rules. |
