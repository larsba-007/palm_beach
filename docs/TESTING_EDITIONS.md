# Testing the three editions: cheat sheet

Short commands to start, test and stop **Steam Full**, **Steam Demo** and the **Web Party Edition**. The block below is plain text on purpose, so it can be copied straight into Google Keep.

## Copy-paste cheat sheet (plain text)

```
BOCA RATON - START, TEST, STOP

FIRST: open a terminal in the project folder
  Windows: cd C:\code\boca\boca-raton
  Mac:     cd /Users/lars/code/boca_raton
(The commands are the same on Mac and Windows.)


START A GAME

STEAM FULL (desktop window)
  npm run play:full

STEAM DEMO (desktop window)
  npm run play:demo

WEB PARTY GAME (opens in your browser, live)
  npm run play:web

WEB PARTY GAME, as it would be hosted
  npm run play:web:build


IS EVERYTHING STILL OK?
  npm run check
  Runs all tests, builds all three editions, scans the Web
  build for keys/passwords, and confirms the Steam files are
  unchanged. Ends with: ALL CHECKS PASSED  or  N CHECKS FAILED.
  It changes nothing in the project and uploads nothing.


STOP
  Desktop game: close the game window
  Web: close the browser tab
  Terminal: press Ctrl+C to stop the server


OLD NAMES (still work, same thing)
  npm run electron:dev:full   = play:full
  npm run electron:dev        = play:demo
  npm run dev:web             = play:web (without opening the browser)


RUN ONE TEST FILE
  node tests/web_edition.test.js


SEND A PATCH TO STEAM (only when YOU decide)
  Close the game first. Do ONE edition at a time:
  1. npm run build:full:win   -> upload to Steam
  2. npm run build:demo:win   -> upload to Steam
  Each build erases the dist folder, so building both and
  then uploading loses the first one.
  Alternative (Git Bash): ./publish_win.sh full
                          ./publish_win.sh demo
  The Web game has no Steam patch. It goes to Netlify (below).


UPDATE THE WEB GAME ON NETLIFY (bocaraton.backhansgames.com)
  1. npm run check          -> must say ALL 15 CHECKS PASSED
  2. npm run build:web      -> makes the folder dist-web
  3. (optional) npm run play:web:build  -> try it, Ctrl+C to stop
  4. app.netlify.com -> Projects -> bocaraton.backhansgames.com
     -> Deploys tab
  5. Drag the dist-web folder (NOT dist) onto the drop area
     at the bottom of the Deploys page
     Windows: C:\code\boca\boca-raton\dist-web
     Mac:     /Users/lars/code/boca_raton/dist-web
  6. Open https://bocaraton.backhansgames.com and play a match
  UNDO: Deploys tab -> click an older deploy -> Publish deploy
  Do NOT use "npm run build" for Netlify: that builds the
  Steam Demo into dist, not the Web party game.


WARNINGS
- Steam must be running to test achievements and overlay.
  Without it the game still starts; the terminal says
  "Steam API initialization skipped". That is normal.
- When testing locally, the DEMO also starts Steam as the
  FULL game, so achievements earned while testing the Demo
  may go to the Full game.
- Never paste or share the .env files (they hold keys and passwords).
```

## What each command does

| Command | What it runs | Notes |
| :--- | :--- | :--- |
| `npm run play:full` | `vite build --mode full && electron .` | Same as the older `electron:dev:full`. Rebuilds into `dist/`, then opens the Electron window. |
| `npm run play:demo` | `vite build && electron .` | Same as the older `electron:dev`. Builds the Demo (no edition setting means Demo). |
| `npm run play:web` | `vite --mode web --open` | Web dev server; opens the browser. Code changes show up on reload. Press `Ctrl+C` to stop. |
| `npm run play:web:build` | `vite build --mode web --outDir dist-web && vite preview --outDir dist-web --open` | Builds the production Web bundle into `dist-web/` and serves it as a host would. |
| `npm run check` | `node scripts/check-all.mjs` | The safety check, below. |

The older names (`electron:dev`, `electron:dev:full`, `dev:web`, `build:web`, `preview:web`, the `build:*:win` / `build:*:mac` scripts) are unchanged.

## What `npm run check` verifies

1. **Tests:** every file in `tests/` passes.
2. **Builds:** Steam Demo, Steam Full and Web all build, and each bundle reports the right edition. The builds go into a temporary folder that is deleted afterwards, so `dist/` and `dist-web/` are not touched.
3. **Secret scan:** the Web build contains no API keys, Apple / Steam passwords, private keys or the Steamworks module. Only file names are ever printed, never values.
4. **Steam files unchanged:** `electron-main.js`, both `electron-builder` configs, both `publish_*.sh` scripts, `steam/` and `.env.full` are identical to `main`.

It prints one `PASS` or `FAIL` line per item and exits with code 1 if anything failed. It needs a local `main` branch to compare against. It does **not** test that the Electron window opens or that Steam features work: launch `play:full` and `play:demo` yourself for that.

## Things to know

- **Every build empties `dist/`.** `vite build` clears `dist/`, and `build:full:win` / `build:demo:win` write their Electron output inside `dist/` (`dist/full-game`, `dist/demo-game`). Build and upload one edition before building the next.
- **Local Electron tests cannot tell Demo from Full for Steam.** `electron-main.js` chooses the Steam App ID from the app name (a name containing "demo" means Demo). In local runs the name has no "demo", so both `play:demo` and `play:full` start Steamworks as the Full game (App ID 4307400). This is the same root cause as the possible Windows Demo build issue in [PROJECT_STATUS.md](PROJECT_STATUS.md) (known bug 6). It has not been changed.
- **Steam must be running** for achievements and the overlay. Without it the game starts anyway and the terminal prints `Steam API initialization skipped`.
- **The Web edition needs neither Steam nor Electron.** It is hosted on Netlify at https://bocaraton.backhansgames.com (team Backhans Games, uploaded by hand with Netlify Drop). The update routine is in the cheat sheet above and in [WEB_EDITION.md](WEB_EDITION.md) section 2.
- **The old routine is wrong now.** Before the Web edition existed, the site was updated with `npm run build` and the `dist` folder. That command now builds the Steam Demo. Always upload `dist-web`.
- None of these commands publishes or uploads anything. Only the drag-and-drop on Netlify does.
