# Palm Beach: trying each edition (cheat sheet)

*Rewritten for Palm Beach in step 1.0 (25 Nov 2026). Original Boca text: `_to_delete/boca_docs/TESTING_EDITIONS.md`.*

Run these in the project folder (`/Users/lars/code/palm_beach`).

| I want to... | Command |
|---|---|
| Play the **web edition** while it is being built | `npm run play:web` |
| Play the web edition exactly as it will be uploaded | `npm run play:web:build` |
| Check that nothing is broken | `npm run check` |
| Try the Steam Demo in a window (phase 2) | `npm run play:demo` |
| Try the Steam Full game in a window (phase 2) | `npm run play:full` |

## What `npm run check` verifies

1. All tests pass.
2. The Web, Steam Demo and Steam Full editions all build, and each is the edition it should be.
3. The web build contains no keys, passwords or Steam code.
4. The Steam and Electron files are still in the project.

The last line must say **ALL CHECKS PASSED**.

## Things to know

- Stop a running game server with Ctrl+C in the terminal.
- The web edition and the Steam editions save in different places, so they never mix. None of them touches Boca Raton saves.
- A saved game from an older build can look odd after the rules change. In the browser Console, `localStorage.removeItem('palmBeachWebSave')` followed by a reload starts fresh.
- The Steam editions have not been started for Palm Beach yet. They need their own check before phase 2.
