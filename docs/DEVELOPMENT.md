# Boca Raton: Development & Build Guide

This document outlines the local development setup, package scripts, build pipelines, testing suites, debugging tools, and platform limitations across Windows and macOS.

---

## 1. Prerequisites & Environment Setup

### 1.1 System Requirements
- **Node.js**: v20.x or higher (Tested and verified on Node.js v24.15.0).
- **npm**: v10.x or higher.
- **Operating System**: macOS (Apple Silicon or Intel) or Windows 10/11 (x64).
- **Optional (Steam Integration)**: Steam client installed and running locally for Steamworks API hooks.
- **Optional (Steam Deployment)**: SteamCMD installed and configured in `.env`.

### 1.2 Installation
```bash
# Clone the repository
git clone https://github.com/larsba-007/boca-raton.git
cd boca-raton

# Install npm dependencies
npm install
```

---

## 2. Development Commands

| Command | Target / Mode | Description |
| :--- | :--- | :--- |
| `npm run dev` | Web (Demo) | Starts Vite dev server in Demo mode at `http://localhost:5173`. |
| `npm run dev:full` | Web (Full) | Starts Vite dev server in Full mode (`--mode full`). |
| `npm run dev:web` | **Web Party Edition** | Starts Vite dev server in Web mode (`--mode web`). See [WEB_EDITION.md](WEB_EDITION.md). |
| `npm run play:full` | Desktop (Full) | Friendly name for `electron:dev:full`. |
| `npm run play:demo` | Desktop (Demo) | Friendly name for `electron:dev`. |
| `npm run play:web` | **Web Party Edition** | `dev:web` plus opening the browser. |
| `npm run play:web:build` | **Web Party Edition** (built) | Builds `dist-web/` and serves it with `preview`, opening the browser. |
| `npm run check` | All three editions | Safety check: all tests, three builds into a temporary folder, Web secret scan, Steam files identical to `main`. Prints PASS / FAIL. See [TESTING_EDITIONS.md](TESTING_EDITIONS.md). |
| `npm run preview` | Web (Static) | Serves the production build from `dist/` locally. |
| `npm run preview:web` | Web Party Edition (Static) | Serves the Web build from `dist-web/` locally (default `http://localhost:4173`). |
| `npm run electron:dev` | Desktop (Demo) | Builds the app and launches Electron in Demo mode. |
| `npm run electron:dev:full` | Desktop (Full) | Builds the app with `--mode full` and launches Electron in Full mode. |

---

## 3. Production Build Commands

### 3.1 Windows Electron Builds

```bash
# Build Windows Demo (Outputs to dist/demo-game)
npm run build:demo:win

# Build Windows Full Version (Outputs to dist/full-game)
npm run build:full:win
```

### 3.2 macOS Electron Builds

```bash
# Build macOS Demo (ARM64 bundle in dist/demo-game)
npm run build:demo:mac

# Build macOS Full Version (ARM64 bundle in dist/full-game)
npm run build:full:mac
```

### 3.3 Web Party Edition Build

```bash
# Build the Web edition into dist-web/ (git-ignored; never touches dist/ used by Electron)
npm run build:web
```

After every Web build, scan `dist-web/` for secrets before uploading it anywhere (see [WEB_EDITION.md](WEB_EDITION.md) section 8). The build must not contain API keys, passwords or Steamworks code.

---

## 4. Test Suite & Quality Verification

Tests are pure Node.js native ESM regression suites located in `tests/`. They use Node's built-in `node:assert/strict` and custom mock DOM environments without heavy third-party testing dependencies.

### 4.1 Running Tests

```bash
# Run a specific regression test
node tests/gambit_progression.test.js

# Run all regression tests in PowerShell (Windows)
Get-ChildItem tests/*.test.js | ForEach-Object { Write-Host "Running $_..."; node $_.FullName }

# Run all regression tests in Bash (macOS)
for f in tests/*.test.js; do echo "Running $f..."; node "$f"; done

# Run everything (tests + three builds + secret scan + Steam files unchanged) and get PASS / FAIL
npm run check
```

### 4.2 Test Coverage Inventory

| Test File | Focus & Verification | Status |
| :--- | :--- | :---: |
| `auction_audio_regression.test.js` | Verifies BGM preservation and SFX during property auctions. | **Passing** |
| `electron_lifecycle_regression.test.js`| Tests single-instance locks, window focus return, kiosk mode, and Alt+Tab safety. | **Passing** |
| `gambit_2_line_bonus_regression.test.js`| Validates row bonus line check animations and Step 10 progression in Gambit 2. | **Passing** |
| `gambit_navigation_regression.test.js` | Ensures campaign panel return transitions and modal hierarchy remain visible. | **Passing** |
| `gambit_progression.test.js` | Validates 4/5 level unlock logic, plate continuation, and missing gambit selection. | **Passing** |
| `luxury_tax_token_compositing_regression.test.js`| Verifies DOM z-index hierarchy and Ms. Post's luxury tax token wrappers. | **Passing** |
| `open_draft_escape_regression.test.js` | Escape key modal prioritization (closing overlays without opening Settings). | **Passing** |
| `pick_2_draft_regression.test.js` | Character candidate pools, candidate discard, and Demo gating for PAIR drafts. | **Passing** |
| `web_edition.test.js` | **Web Party Edition (38 checks)**: edition flags, build scripts, save key, Steam-only hiding, party rules, menu wiring, drafts, tutorial chain, small windows and touch. Also asserts that the Steam paths are unchanged. | **Passing** |
| `eric_power_auction_interruption_regression.test.js`| Tests Eric's 3-flip ability interruption when an auction triggers. | **Passing** |

> [!NOTE]
> This file used to end with a random exit code: after Eric's turn the mock bot takes a real turn (a timer in `game.js`), and when the bot chose to buy a luxury card it pushed onto `player.inventory`, a field the mock bot did not have (`TypeError ... reading 'push'`). The mock bots now have `inventory`, `prestige` and `cards`, and the file exited 0 in 40 of 40 runs. It was a test-harness problem, not a gameplay defect.

---

## 5. Developer & Debugging Utilities

### 5.1 DevTools
- In development (`npm run electron:dev`), DevTools can be toggled using **F12** or **Ctrl+Shift+I** (Cmd+Opt+I on Mac).
- In production packaged builds (`app.isPackaged === true`), DevTools shortcuts and right-click inspection are strictly disabled.

### 5.2 Safe Reload Protection
- To prevent accidental loss of active matches or tournament progress, **F5**, **Ctrl+R**, and **Cmd+R** are intercepted and blocked in `electron-main.js`.
- In-game reloads can be triggered via `ipcRenderer.send('game:reload')` or `SaveManager.hardWipeSaveData()`.
- In a browser (including the Web edition) there is no Electron: a `beforeunload` handler asks for confirmation when a match is in progress, and a match is lost on reload (only the profile is saved).

### 5.3 AI Telemetry & Strategic Context Inspector
The strategic bot AI exposes real-time telemetry directly to the console:
- `inspectBotStrategicContext(botId)`: Prints full evaluation of gold reserves, prestige pacing, and auction bid ceilings.
- `inspectBotActionEvaluation(botId)`: Compares expected values between picking map cells vs buying luxury cards.
- `window.__botStrategicContextHistory`: Rolling buffer of the last 50 bot strategic evaluations.

### 5.4 God Mode & Simulation
- `state.godMode`: Exposes debug controls to force immediate victories, instant Au grants, or unlock all Gambits. Toggled with `Ctrl+Shift+D`; the "U" key hides the menu UI. Both hotkeys are **disabled in the Web edition** (they remain active in the Steam builds).
- `state.simulationMode`: Suppresses animation timers and UI transitions for high-speed AI headless self-play.
