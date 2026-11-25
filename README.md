# Palm Beach: the digital board game

The digital version of the board game **Palm Beach** by Backhans Games (game design: Lars Backhans).

It is built from a copy of the digital **Boca Raton** game (on Steam as *Gold Coast Gambits*) and changed step by step to the Palm Beach rules, characters and art. The Boca Raton game is a separate project and is never touched from here.

## Where things stand

| | |
|---|---|
| The plan | [PLAN.md](PLAN.md): version 1 hot seat, version 2 + tutorial, version 3 + AI, Steam later |
| What is done and what is next | [PROGRESS.md](PROGRESS.md) |
| The rules (source of truth) | [docs/palm_beach/rules-palm-beach.md](docs/palm_beach/rules-palm-beach.md) and the printed rulebook PDF beside it |
| Instructions for Claude Code | [CLAUDE.md](CLAUDE.md) |

**Until steps 1.1 to 1.6 are done, the game on screen still plays by Boca Raton rules.** Only the name, the title, the save keys, the character cards and the Map Card fronts are Palm Beach so far.

## Run it

```bash
npm install
```

```bash
npm run dev:web
```

Then open the address it prints (normally http://localhost:5173).

## Check that nothing is broken

```bash
npm run check
```

It runs all tests, builds the three editions into a temporary folder, scans the web build for secrets and checks that the Steam and Electron files are still there. It must end with **ALL CHECKS PASSED**.

## The three editions (one codebase)

| Edition | Command | For |
|---|---|---|
| **Web** (phase 1) | `npm run dev:web`, `npm run build:web` → `dist-web/` | The browser, hot seat. Hosted on Netlify by Lars. |
| Steam Demo (phase 2) | `npm run dev`, `npm run play:demo` | Electron. Not released for Palm Beach yet. |
| Steam Full (phase 2) | `npm run dev:full`, `npm run play:full` | Electron. Not released for Palm Beach yet. |

## Documents

| Document | About |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is organised, and what is still Boca code |
| [docs/WEB_EDITION.md](docs/WEB_EDITION.md) | The web edition: decisions, building, upload, release checklist |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Commands, tests, tools |
| [docs/TESTING_EDITIONS.md](docs/TESTING_EDITIONS.md) | Short cheat sheet for trying each edition |
| [docs/STEAM_VERSIONS.md](docs/STEAM_VERSIONS.md) | The Steam editions (phase 2) and the placeholder App IDs |
| [docs/ASSETS.md](docs/ASSETS.md) | Pictures and sound: what is Palm Beach, what is still Boca |
| [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) | Git, backup and secrets |
| [DESIGN_RECIPE.md](DESIGN_RECIPE.md) | The look: 4K canvas, glass panels, fonts (inherited from Boca, still valid) |
| [SUPPORT_POPUP.md](SUPPORT_POPUP.md) | The Support Us popup (step 1.6) |

The original Boca Raton documents are kept in `_to_delete/boca_docs/` and in the first git commit (`git show 7da64a8:docs/ARCHITECTURE.md`).

## Never do from this project

- Never run `publish_mac.sh` or `publish_win.sh`: Palm Beach has no Steam App IDs yet.
- Never upload to the Boca Raton Netlify site. Lars uploads `dist-web` to the Palm Beach site himself.
- Never commit secrets (`.env`, `.env.local`).

© 2026 Backhans Games
