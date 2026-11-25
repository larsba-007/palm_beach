# Palm Beach digital version: project brief for Claude Code

Lars Backhans (Backhans Games) is making a digital version of the board game **Palm Beach**.
The digital **Boca Raton** game already exists (published on Steam as *Gold Coast Gambits*, demo + full).
Palm Beach is built as a **separate copy** of that code (this folder), changed to Palm Beach rules, characters and art.
Lars is a game designer, not a programmer: explain choices in plain words, and ask before big decisions.

## Folder map (this folder is the whole project and one git repository)

| Path | What it is | Rules for Claude |
|---|---|---|
| `js/`, `index.html`, `index.css`, `public/`, `tests/`, `scripts/` ... | **The game code.** Started as a copy of the Boca Raton web code (25 Nov 2026). | Edit freely. Commit after each finished step. |
| `PLAN.md` | The build plan: versions, steps, table layout, Lars's decisions. | Follow it. Only Lars changes it. |
| `PROGRESS.md` | What is done, what is next, open questions. | Update after every step. |
| `SUPPORT_POPUP.md` | Design and texts of the support popup. | Use in step 1.6. |
| `docs/palm_beach/` | **The Palm Beach rules**, rulebook PDFs, lore, colour palette. | Read before changing game logic. Don't change the rules files. |
| `docs/*.md` (ARCHITECTURE, WEB_EDITION, ...) and `docs/CLAUDE_BOCA_INHERITED.md` | Technical documents inherited from Boca Raton. | Good on technology, **wrong on game rules** (they describe Boca). Rewrite for Palm Beach in step 1.0. |
| `assets_source/palm_beach_print/` | Art cut from the print files (no bleed). | Sources: export game-ready `.webp` files into `public/assets/`. |

The Boca Raton game lives in another folder (`/Users/lars/code/boca_raton`) and is live on Steam. **Never open, edit, build or publish it from this project.**

## The rules (source of truth)

1. `docs/palm_beach/rules-palm-beach.md`: Palm Beach rules in text, including solo mode (Automa). **Start here.**
2. `docs/palm_beach/PalmBeach_Rulebook_v1.0.pdf`: the final printed rulebook (20 Nov 2026). If it disagrees with the .md, the PDF wins: tell Lars.
3. `docs/palm_beach/rules-boca-raton.md` + `docs/palm_beach/BocaRaton_Rulebook_v1.0.pdf`: what the inherited code implements.
4. `docs/palm_beach/landmark-lore.md`, `docs/palm_beach/compendium-lore-draft.md`, `docs/palm_beach/GoldCoast_Compendium_v1.0.pdf`: landmark and character stories.
5. `docs/palm_beach/color-palette.md`: brand colours.

**Rule changes are Lars's decisions only.** If the rules are unclear or missing something the code needs (an edge case, a tie, a timing question), stop and ask Lars. Never invent a rule silently.

## Biggest differences: Boca Raton code → Palm Beach

The Boca game is free-turn ("flip any card or buy a Luxury Card"). Palm Beach is **round-based**:
- **8 rounds, one row per round.** Rows 1–6 have 9 cards, rows 7–8 have 5 cards plus the Auction Map Card.
- **Initiative:** each character has a number per round (R1–R8); lowest starts the round and opens the auction(s).
- **Flipping phase:** players take turns flipping cards **in the current row** until the whole row is face up.
- **Waterfront gives 1 Diamond** (not 4 Au). **4 Diamonds (Mr. Flagler 3) = automatic trade** for the top card of a 7-card face-down Luxury pile.
- **Luxury Auction every round** (two in rounds 4 and 6: 10 in total). No Luxury piles with 5/10/15 Au prices.
- **One Property Auction at the end** (1 of 3 Auction Map Cards). No Waterfront-column auctions, no row/column bonuses.
- **Everyone starts with 5 Au.** Counters: red Powers, yellow Re-rolls. **No blue Extra Turns** (blue = Automa marker in solo).
- **Characters:** 10 Palm Beach characters with new powers and initiative numbers. Edith and Skip are new; Leja and Silviano are not in Palm Beach.
- **Variations:** Lake Worth (standard), Jupiter Inlet, Peanut Island; Pick 2 / Random / Open Draft.
- **Solo mode** against the Automa (Standard / Hard / Expert), fully described in the rules file.
- 1–5 players.

Much can be reused: the board view and card flipping, dice, auction bidding UI, landmarks, audio, menus, save/achievements, Electron/Steam wrapping, the design system.

## Where the code comes from

- This folder started as a snapshot of the Boca Raton branch **`feature/web-version`** (commit `a756aef`, 22 Oct 2026), taken 25 Nov 2026, without node_modules, builds, git history or secrets. That branch holds all three Boca editions in one codebase: Steam Full, Steam Demo and the **Web Party Edition** (live at bocaraton.backhansgames.com).
- Already changed before the first commit: `public/assets/map_cards_front.webp` and `character_cards_print.webp` (Palm Beach print art), `public/assets/diamond.webp` (new), `bonusIndices` in `js/ui.js`, blanked values in `.env.example`, `.env.local` added to `.gitignore`. See `PLAN.md`, "Art".
- **The first git commit is the reference point** for "how Boca did it". Later, `git show <first commit>:<file>` shows the original Boca web code.
- **Inherited Boca documents:** `docs/CLAUDE_BOCA_INHERITED.md`, `README.md`, `walkthrough.md` and the `.md` files directly in `docs/` were written for Boca Raton. `docs/GAME_RULES.md` is NOT the Palm Beach rules. Until they are rewritten, this file, `PLAN.md` and `docs/palm_beach/` win.

## Release plan: web first, Steam later (plan for Steam from day one)

1. **Phase 1: Palm Beach web version**, similar to the Boca Web Party Edition: runs in the browser, built with `npm run build:web` into `dist-web/`, hosted on Netlify. Read `docs/WEB_EDITION.md` first: it describes exactly how the Boca web version is built.
2. **Phase 2: Palm Beach on Steam** (Electron, like *Gold Coast Gambits*).

Because Steam comes later, **build the web version so nothing has to be rewritten for Steam**:
- Keep the three-edition design: one codebase, `GameConfig.isWeb` / `isDemo` / `isFullGame` (`VITE_GAME_EDITION`). Put web-only behaviour behind `GameConfig.isWeb`, as Boca does. Put the Palm Beach **rules** in shared code that every edition uses.
- Keep the Electron and Steam parts in place: `electron-main.js`, `electron-builder.*.json`, `steam/`, `build/`, `publish_*.sh`, `js/AchievementManager.js`, `js/SaveManager.js`. Don't delete them to "clean up".
- Keep `npm run check` working (tests, the three builds, the secret scan) and extend it with Palm Beach tests.
- Design achievements, saves and stats for Palm Beach with Steam in mind. Use new save keys so Palm Beach never reads or overwrites Boca saves in the same browser.
- **Steam App IDs:** the copied IDs (4307400 full, 4547980 demo) belong to Boca Raton. Mark them as placeholders in the code; Lars supplies Palm Beach IDs in phase 2. Never run the publish scripts before that.
- **Netlify:** never upload Palm Beach to the Boca site. Lars creates a separate site and does every upload himself.

The versions, the table layout and the open questions for Lars are in `PLAN.md`.

## Technical rules (inherited from Boca, see `DESIGN_RECIPE.md` and `.agents/AGENTS.md`)

- Vite + plain JavaScript modules in `js/`, Tailwind, Electron for desktop/Steam.
- Run it: `npm install && npm run dev:web` (web edition), then open the address shown in a browser. More commands in `docs/DEVELOPMENT.md` and `TESTING_EDITIONS.md`.
- **Layout:** everything is positioned absolutely on a fixed 4K virtual canvas (3840 × 2160) that is scaled as a whole. Don't use flowing/responsive layouts.
- Keep the Boca look (glass panels, fonts, colours) unless Lars asks for a Palm Beach look.
- Images go in `public/assets/` as `.webp`, like the Boca files.
- Tests are in `tests/`. Add tests for Palm Beach rules (initiative order, Diamond trade, auctions, Automa).

## Things not to do without asking Lars

- Don't run `publish_mac.sh`, `publish_win.sh` or anything that uploads to Steam or Apple. Palm Beach has **no Steam App IDs yet**; the copied ones belong to Boca Raton.
- Never commit secrets (`.env`, `.env.local`, passwords, API keys). Don't copy `.env` files from the Boca project.
- Don't touch the Boca project (`/Users/lars/code/boca_raton`).
- Don't delete Lars's files; move unused ones to a `_to_delete/` folder instead.

## How to work

0. **Follow `PLAN.md`**: three versions (1 hot seat, 2 + tutorial, 3 + AI), built step by step, with the table layout Lars decided and the open questions he must answer. Read it at the start of every session.
1. Before coding a new part, write a short plan and let Lars approve it.
2. Work in small steps that can be tried in the browser. Commit after each step with a clear message.
3. Keep `PROGRESS.md` up to date: what's done, what's next, open questions for Lars.
4. When something needs Lars's art (a missing card image, a board), list exactly which file, size and format.
5. **Git and backup:** this folder is its own git repository. Commit after every step. Push to the private GitHub repository once Lars has set it up (step 1.0). Never force-push.
