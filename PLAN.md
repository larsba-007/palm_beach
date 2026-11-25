# Palm Beach web game: build plan

*Plan agreed with Lars 25 Nov 2026. Claude Code follows this plan step by step. Each step ends with something Lars can try in the browser. Changes to the plan are Lars's decisions.*

## The three versions

| Version | What it is | Players | Released when |
|---|---|---|---|
| **1** | Web game, **hot seat only**. No tutorial, no AI. **5 characters** to pick from. | 2–4 people on one screen | Lars uploads `dist-web` to the new Netlify site |
| **2** | Version 1 **+ tutorial** | 2–4 | Same site, new upload |
| **3** | Version 2 **+ AI opponents** | 1–4 (humans + AI) | Same site, new upload |
| Later | Steam version (Electron). Not part of this plan, but nothing in versions 1–3 may block it (see `CLAUDE.md`, "Release plan"). | | |

Lars creates the Netlify site and does every upload himself. Claude Code prepares and checks the `dist-web` folder.

## Table layout (Lars's decisions, 25 Nov 2026)

The table uses the same setup as the Boca Raton game, changed like this:

1. **Title:** the text **PALM BEACH** at the top of the game.
2. **Map cards:** rows 1–6 have 9 cards, rows 7–8 have 5 cards (Lagoon, Waterfront, Block, Waterfront, Atlantic).
3. **Auction Map Card:** at the end of rows 7 and 8, in the space the four missing Block cards leave.
4. **Property Cards:** all 3 lie **on the Auction Map Card, side by side**.
5. **Luxury Cards:** one face-down card **to the right of each row**. Rows 4 and 6 have **2 cards stacked**: the lower card shows a little under the top card, and the top card carries the number **2** to show there are two.
6. **Not shown on the table:** the Bank's **stack of Diamonds** and the **pile of 7 Luxury Cards** for Diamond trades. They exist in the game but are invisible. When a player has 4 Diamonds (Mr. Flagler 3), the trade happens by itself and the player gets a new Luxury Card.
7. **A player's Diamonds** are shown **under their character card**.

Everything is placed with absolute coordinates on the 3840 × 2160 canvas, as in Boca (`DESIGN_RECIPE.md`).

## How the code is built (so versions 2 and 3 and Steam fit later)

- **New rules engine in small, tested files.** Palm Beach is round-based (8 rounds, initiative, flipping phase, auctions), Boca is free-turn. Don't bend Boca's 2,900-line `js/game.js` into Palm Beach. Write the Palm Beach rules as new pure modules with no screen code (the way `js/web_party.js` is written), each with tests:
  - setup (deal the 64 Map Cards into rows, 10 Luxury Cards beside rows, 7 in the hidden pile, 1 of 3 Auction Map Cards)
  - rounds and initiative order
  - flipping phase (dice, rewards, bonus circles, re-rolls, character powers)
  - Diamonds and the automatic trade
  - Luxury Auctions and the Property Auction
  - scoring and tiebreaker
- **The engine never assumes a human.** Every decision (which card to flip, re-roll or not, bid or pass) goes through one "ask the player" point. Version 1 answers it with clicks. Version 2 lets the tutorial script it. Version 3 lets an AI answer it. This is what makes versions 2 and 3 additions instead of rewrites.
- **Reuse from Boca:** the 4K scaling canvas, board and card drawing, flip and dice animations, the auction bidding window, landmarks and their pop-ups, audio, the water background, the party menu, saves, `npm run check`.
- **Remove or switch off for Palm Beach:** the three Luxury piles with prices (5/10/15 Au), row and column bonuses, Extra Turns (blue counters), the two mid-board auctions, the 50-Gambit campaign, Boca character powers, Boca's AI visitors (until version 3 decides what to reuse).
- **Editions stay:** web-only things sit behind `GameConfig.isWeb`; the rules are shared code so the Steam version gets them for free.
- **Own save key** so Palm Beach never touches Boca saves in the same browser.

## Version 1: hot seat (steps)

Each step: short plan → Lars says OK → build → tests pass → Lars tries it in the browser → commit.

| Step | What Claude Code does | What Lars can see or try |
|---|---|---|
| 1.0 | `git init`, first commit of the folder as it is (the Boca web snapshot + the Palm Beach art). Connect the private GitHub repository and push (if the `gh` tool is signed in, create the repository with it; otherwise ask Lars to create an empty private repository on github.com and give you its address). Rename to Palm Beach (app name, titles, save key). Mark Boca's Steam IDs as placeholders. Rewrite the inherited Boca docs in `` so they describe Palm Beach. | The game still starts (`npm run dev:web`); it says PALM BEACH. |
| 1.1 | **Rules engine, no screen yet.** The pure modules above, with tests for every rule in `docs/palm_beach/rules-palm-beach.md`. A scripted full game runs in the tests from setup to final scoring. | A test report: "a full 4-player game played by script, all rules checked". |
| 1.2 | **The table.** Board with the Palm Beach layout above: rows, Luxury Cards on the right (stacks of 2 at rows 4 and 6), Auction Map Card with the 3 Property Cards on it, title. Hidden Diamond stack and hidden Luxury pile. | The Palm Beach table on screen, nothing clickable yet. |
| 1.3 | **Characters.** The 5 Palm Beach characters (Bright Shell, Skip, Mr. Flagler, Carina, Ms. Post) with their powers, counters, Diamonds and initiative numbers. Player panels: gold, re-rolls, Diamonds under the character card, Luxury Cards won. | The party menu deals characters; the panels show the right things. |
| 1.4 | **Flipping phase.** Initiative decides the start player each round; only the current row can be clicked; dice for Lagoon and Atlantic, re-rolls, rewards, bonus circles, landmark pop-ups; Waterfront gives a Diamond; automatic Diamond trade with a "new Luxury Card" moment. | Play the flipping phase of all 8 rounds, hot seat. |
| 1.5 | **Auctions.** Luxury Auction after each row (two at rounds 4 and 6), start player opens, raise or pass, never more than you have. Property Auction after round 8: flip the Auction Map Card, pay out character gold, auction, end. | A complete game from start to finish. |
| 1.6 | **End of game and polish.** Final scoring and tiebreaker screen, round and phase indicator ("Round 3 · Auction"), whose turn it is, sounds, small-window notice, cheat sheet with the Palm Beach reward table. | A game that feels finished. |
| 1.7 | **Release check.** `npm run check` (tests, builds, secret scan), play-through with 2, 3 and 4 players, checklist from `docs/WEB_EDITION.md` section 10. Build `dist-web`. | Lars uploads `dist-web` to Netlify. **Version 1 is live.** |

## Version 2: + tutorial

| Step | What Claude Code does |
|---|---|
| 2.1 | Lars and Claude agree on the lessons first (proposal: 1. Flip cards: the four types and the die. 2. Diamonds and the trade. 3. A Luxury Auction. 4. A short full game: 2 rounds + Property Auction). |
| 2.2 | Tutorial engine: a lesson is a fixed setup + a script of steps that points at things and waits for the right click. It uses the same "ask the player" point as the game, so no rules are copied. Any opponent in a lesson is scripted, not AI. |
| 2.3 | Build the lessons, a TUTORIAL button on the party menu, tests that every lesson can be completed. |
| 2.4 | Release check and upload, as 1.7. |

Boca's tutorial lessons teach Boca rules and can't be reused; the pop-up look and the button can.

## Version 3: + AI

| Step | What Claude Code does |
|---|---|
| 3.1 | Lars decides the AI design. Proposal: start with the **Automa from the rulebook** as the solo opponent (Standard / Hard / Expert): it is already designed, tested by simulation and simple. Then add **AI players for 2–4 player games** that flip and bid like a person. |
| 3.2 | AI flipping: which card in the row (risk vs gold vs Diamonds, own character power, re-rolls). |
| 3.3 | AI bidding: what a Luxury Card and the Property are worth to it, given gold left, rounds left and who is ahead. The AI must not peek at face-down cards (keep Boca's "knowledge firewall" idea from `ai_knowledge.js`). |
| 3.4 | Difficulty levels or personalities; the party menu lets each seat be Human or AI; many simulated games in the tests to check the AI is neither hopeless nor unbeatable. |
| 3.5 | Release check and upload. |

## Lars's decisions (25 Nov 2026)

| # | Question | Decision |
|---|---|---|
| 1 | Which 5 characters in version 1? | **Bright Shell, Skip, Mr. Flagler, Carina, Ms. Post.** Not Kingston or Edith (secret peeks don't work on a shared screen). |
| 2 | Secret gold | **Gold is open** in the web version, as in the Boca web version. |
| 3 | How characters are chosen | **Pick 2, Random and Open Draft**, as in the Boca web version. |
| 4 | Variation | **All cards closed** (Luxury Cards and the Auction Map Card face down), the board game's default (Lake Worth). |
| 5 | Support Us popup | **Yes**, with the new design in `SUPPORT_POPUP.md`: main button to Kickstarter. Lars approves the final texts. |
| 6 | Art | **Done 25 Nov from the print files** (no bleed): see "Art" below. |
| 7 | Name and address | **Palm Beach**, palmbeach.backhansgames.com. |
| 8 | Everyone passes in an auction | **The card is removed from the game, unsold.** (Claude's assumption, Lars to confirm: the same for the Property Card, so nobody gets it.) |
| 9 | Backup | **A new private GitHub repository** for this project, set up in step 1.0. Push after every step. |
| 10 | Sharing code with Boca | Build Palm Beach version 1 here first, with new parts written as clean, shareable modules. Move them back into Boca piece by piece afterwards. Merge into one codebase when Palm Beach goes to Steam. |

## Art (done 25 Nov 2026, from the LongPack print files, cut at the die line so there is no bleed)

Already in `public/assets/`:
- `map_cards_front.webp` (2000 × 2000, 8 × 8 cards of 250 px): the 64 printed Map Card fronts **with the yellow +5, +2 and +1 circles**. Same positions as the Boca file, so sprite index = row × 8 + column still holds.
- `character_cards_print.webp` (3500 × 2400, 5 × 2 cards of 700 × 1200): the **10 Palm Beach character cards**. Order: Edith, Roxana, Addison, Mr. Flagler, Kingston / Ms. Post, Eric, Bright Shell, Carina, Skip (Edith sits in Leja's old slot, Skip in Silviano's; the other eight keep their slot).
- `js/ui.js`: `bonusIndices` changed to the 9 cards that have a printed +5: `[2, 5, 10, 19, 27, 45, 52, 60, 61]`. **The Boca digital game used 4 different bonus cards than the printed game** (old list `[2, 10, 3, 11, 19, 27, 35, 5, 13]`). The 12 landmark positions in `js/landmarks.js` already match the printed +2 and +1 circles.
- `diamond.webp` (358 × 258, transparent): the Diamond, cut from the Palm Beach board art. Source: `assets_source/palm_beach_print/other/DIAMOND.png`.

Sources in `assets_source/palm_beach_print/`:
- `characters/`: the 10 Palm Beach cards and the card back, 1654 × 2836.
- `map_cards/`: the 64 Map Card fronts, 1024 × 1024, and `_sprite_positions.csv` (which print tile sits at which row, column and sprite index, and its printed bonus).
- `other/`: card backs (Lagoon, Waterfront Lagoon, Block, Waterfront Atlantic, Atlantic, Luxury, Property), and `LOGO_palm_beach_gold.png` (the PALM BEACH title, 1440 × 240, transparent).
- `board_palm_L.png`, `board_palm_R.png`: the Palm Beach side of the Main Board.

Still to make (Claude Code, step 1.2–1.3): the Palm Beach board strip for the top of the table, a party-menu background photo (Lars), and the Palm Beach character texts in `js/characters.js`. The Waterfront card backs already show the Diamond.

## Support popup

Decided by Lars 25 Nov 2026: main button to **Kickstarter**, same design in the Boca and Palm Beach web games. The design and the texts are in **`SUPPORT_POPUP.md`** (in this folder). Lars approves the texts before step 1.6. The Boca web game is changed separately, in the Boca project, not from here.

## Rules for the work

- One step at a time; never start the next before Lars has tried the last.
- If the rules are unclear or the code needs a rule that isn't written, stop and ask Lars.
- Update `PROGRESS.md` after every step.
- Never touch the Boca project (`/Users/lars/code/boca_raton`), never upload anything, never run the Steam publish scripts.
