# Palm Beach: development guide

*Rewritten for Palm Beach in step 1.0 (25 Nov 2026). Original Boca text: `_to_delete/boca_docs/DEVELOPMENT.md`.*

## 1. What you need

- Node.js 20 or newer (checked with v25.2) and npm.
- A Mac or Windows PC. Steam and SteamCMD are only needed in phase 2.

First time, in the project folder:

```bash
npm install
```

## 2. Commands

| Command | What it does |
|---|---|
| `npm run dev:web` | **Web edition** for development, at http://localhost:5173 |
| `npm run play:web` | The same, and opens the browser |
| `npm run build:web` | Builds the web game into `dist-web/` |
| `npm run play:web:build` | Builds `dist-web/` and opens that exact build |
| `npm run check` | The safety check (section 3) |
| `npm run dev` / `npm run dev:full` | Steam Demo / Steam Full rules in a browser |
| `npm run play:demo` / `npm run play:full` | Steam Demo / Steam Full in an Electron window |
| `npm run build:demo:mac`, `build:full:mac`, `build:demo:win`, `build:full:win` | Packaged Steam builds (phase 2) |

**Never run `publish_mac.sh` or `publish_win.sh`.** They upload to Steam and Apple, and Palm Beach has no Steam App IDs yet.

## 3. Tests and the safety check

```bash
npm run check
```

It does four things and prints PASS or FAIL for each:
1. Runs every `tests/*.test.js` file.
2. Builds the three editions into a temporary folder (it does not touch `dist/` or `dist-web/`) and checks each build is the right edition.
3. Scans the web build for keys, passwords and Steam code.
4. Checks the Steam and Electron files are still in the project.

Run one test file alone:

```bash
node tests/web_edition.test.js
```

The ten test files that came with the Boca code test Boca behaviour (drafts, the web menu, save keys, Boca regressions). Palm Beach rule tests are added from step 1.1. Boca tests are removed only together with the Boca code they test.

## 4. Tools

- **Browser developer tools** (F12, or Cmd+Opt+I on a Mac) show errors in the Console.
- `window.state` holds the running game and can be inspected in the Console.
- God mode (`Ctrl+Shift+D`) and the `U` key exist in the Steam editions and are switched off on the web.
- **Pictures:** this Mac has no `cwebp`. Convert with
  `npx electron scripts/png-to-webp.cjs <input.png> <output.webp> [quality] [width]`.

## 5. Things to know

- Line endings are LF in this copy.
- `dist/`, `dist-web/`, `node_modules/`, `.env` and `.env.local` are not in git.
- `npm install` reports security warnings in old packages inherited from Boca. They are development tools, not part of the web game; updating them is a separate job.
