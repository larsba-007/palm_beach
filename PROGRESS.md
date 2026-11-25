# Palm Beach digital: progress

## Plan
- See `PLAN.md`: version 1 hot seat (2-4 players, 5 characters, no tutorial), version 2 + tutorial, version 3 + AI. Steam later.
- **Current step: 1.7 done** (release check; `dist-web` built, not uploaded). Version 1 is waiting for Lars's play-test, pictures and upload.

## Done (before the first commit, 25 Nov 2026)
- Project folder set up at `/Users/lars/code/palm_beach`: the game code, `CLAUDE.md`, `PLAN.md`, `SUPPORT_POPUP.md`, the rules in `docs/palm_beach/`, the art sources in `assets_source/`.
- The code is a snapshot of the Boca branch `feature/web-version` (commit a756aef): the Web Party Edition plus both Steam editions. Left out: node_modules, builds, git history, `.env`, `.env.local`. The Apple and Steam values in `.env.example` were blanked.
- Lars's decisions recorded in `PLAN.md` (characters, open gold, draft modes, all cards closed, support popup, everyone-passes rule, GitHub backup).
- Art from the print files, no bleed: `map_cards_front.webp` (with +5, +2, +1 circles), `character_cards_print.webp` (10 Palm Beach cards), `diamond.webp`. `bonusIndices` in `js/ui.js` changed to the 9 printed +5 cards. All 10 test files passed after these changes (run with node, 25 Nov).
- `npm install` and `npm run dev:web` work (25 Nov, Claude Code). The copied Boca game runs; the new character cards and Map Card fronts show correctly. The board, card backs, Luxury/Property/Auction cards, titles and counters are still Boca.
- The printed rulebook PDF (`PalmBeach_Rulebook_v1.0.pdf`, 20 pages) was compared with `rules-palm-beach.md` on 25 Nov: **no rule differences found.** All initiative numbers are unique in every round.

## Lars's rule answers (25 Nov 2026, for the rules engine in step 1.1)
1. **Gold is open everywhere** in the web version.
2. **Diamonds never run out** in the Bank.
3. **The pile of 7 Luxury Cards** (for Diamond trades) never runs out.
4. **Diamond trade:** when a player gets the 4th Diamond (Mr. Flagler: 3rd), a popup shows: "You have 4 diamonds. Trade in for a Luxury Card." with an **OK** button. OK takes the Diamonds and gives the Luxury Card, with an animation. The trade is not optional.
5. **Failed roll:** the card stays face down and is tried again later, until it is flipped.
6. **Skip** flips Atlantic cards without rolling. He still gets landmark bonuses. Re-roll counters he gets from Luxury Cards can be used on Lagoon cards.
7. **Re-rolls are optional.** The player is asked only after a failed Lagoon or Atlantic roll, and only if they have a yellow counter. They can always say no.
8. **Re-roll counters from a Luxury Card** are added at once and work from the next roll.
9. **Everyone passes at the Property Auction:** the Auction Map Card is still flipped and stays on the map; the Property Cards are discarded, nobody gets one. Characters keep the gold they collected before the auction.
10. **Gold before the Property Auction** only for characters whose power says so, and only for their own property.
11. **Raises:** always at least +1 Au. Same bidding system as the Boca game.
12. **Pick 2 with only 5 characters:** unpicked cards go back to the pool (as in the Boca web version). Not in the later full version with 10 characters.
13. **Two characters with the same initiative number in a round is a bug** (tests check this).

## Version 1 characters (changed by Lars 25 Nov 2026, replaces decision 1 in PLAN.md)
**Roxana, Mr. Flagler, Bright Shell, Carina, Skip.** The other five are locked. (Ms. Post is out, Roxana is in. Edith and Kingston stay out: secret peeks don't work on a shared screen.) `PLAN.md` still lists the old five: Lars to update it, or tell Claude Code to.

## Step 1.0 (25 Nov 2026): done
- Git repository started. First commit `7da64a8` = the Boca web snapshot + Palm Beach art (the reference point for "how Boca did it").
- Renamed to Palm Beach: app name, browser tab title, the title at the top of the table (`palm_beach_logo.webp`), About text, Electron product names.
- Own save keys: `palmBeachWebSave`, `palmBeachSaveGame`, Electron folder `palm-beach-save`. Boca's old save migration is switched off, so Boca saves are never read.
- Boca's Steam App IDs (4307400, 4547980) and Steam store links marked `PLACEHOLDER` in the code. `js/steam_appid.txt` still holds 4307400 (the file can only hold a number).
- Docs rewritten for Palm Beach: `README.md`, `docs/ARCHITECTURE.md`, `WEB_EDITION.md`, `DEVELOPMENT.md`, `TESTING_EDITIONS.md`, `STEAM_VERSIONS.md`, `ASSETS.md`, `GIT_WORKFLOW.md`, `GAME_RULES.md` (now a pointer to the Palm Beach rules). The Boca originals are in `_to_delete/boca_docs/`.
- `npm run check`: ALL 15 CHECKS PASSED. Its fourth check now confirms the Steam and Electron files are still in the project (Boca compared them with its `main` branch, which means nothing here).
- New tool `scripts/png-to-webp.cjs` (this Mac has no cwebp).
- Moved to `_to_delete/`: two empty stray files from the project root, and a nameless `.webp` from `public/assets/`.
- **GitHub backup:** the private repository `larsba-007/palm_beach` on github.com, branch `main`. Push after every step with `git push`.
- **Not changed: the splash picture.** Its title ("Boca Raton and Palm Beach / Gold Coast Gambits") is part of the picture.
- `CLAUDE.md` still mentions `docs/CLAUDE_BOCA_INHERITED.md` and says the docs are not rewritten yet. Lars to update, or tell Claude Code to.

## Step 1.1 (25 Nov 2026): done
The Palm Beach rules engine, with no screen code, in `js/rules/`:

| File | What it holds |
|---|---|
| `data.js` | The 64 Map Cards and their bonus circles, 17 Luxury Cards, 3 Property Cards, the 10 characters (powers, counters, initiative), the numbers (5 Au, 8 rounds, 4 Diamonds) |
| `rng.js` | Shuffling and the die. A game can be replayed exactly from its seed. |
| `setup.js` | Laying out a new game |
| `initiative.js` | Who starts each round, turn order |
| `flipping.js` | Die rolls, rewards, bonus circles, character powers, re-rolls |
| `diamonds.js` | The Automatic Diamond Trade, Luxury Cards with re-rolls |
| `auction.js` | One auction: bid, raise, pass |
| `scoring.js` | Prestige Points and the tiebreaker |
| `engine.js` | The whole game: 8 rounds, auctions, Property Auction, scoring. Every decision goes through one "ask the player" point. |

- **Tests:** 59 named checks in four files (`tests/pb_*.test.js`), each tied to a rule in the rulebook or to one of Lars's answers. A scripted 4-player game is printed round by round: `node tests/pb_full_game.test.js`. 1,000 more games (1–5 players, all 10 characters, all variations) are played and audited in the same file.
- `npm run check`: ALL 19 CHECKS PASSED.
- **Nothing on screen has changed.** The game in the browser still plays by Boca rules until steps 1.2–1.5 connect the screen to the new engine.
- All 10 characters and all three variations are in the engine (the tests need them); version 1 will only offer the five chosen characters and Lake Worth.
- Not built: the solo Automa (version 3).

### Choices made in step 1.1 (1–4 confirmed by Lars 25 Nov 2026; 5 explained, waiting for his OK)
1. **Re-roll only after a miss** (Lars's answer 7). The rulebook says "whenever you roll". So Roxana or Carina cannot spend a re-roll on a successful roll to hunt for a 5–6 bonus.
2. **A player who cannot afford the next bid passes automatically**, without being asked.
3. **The last player left may still buy for 1 Au** when everyone before them passed.
4. **Nobody may skip a turn** in the flipping phase: you must choose a face-down card in the row.
5. **Clockwise = the order of the seats** in the party menu (player 1, 2, 3, 4).

## Step 1.2 (25 Nov 2026): done
The Palm Beach table is on screen. Start a match from the party menu to see it. Nothing is clickable yet.

- **Board:** rows 1–6 with 9 cards, rows 7–8 with 5 cards (Lagoon, Waterfront, Block ... Waterfront, Atlantic), all face down. The cards are dealt by the rules engine, so every match has a new layout.
- **Auction Map Card:** at the end of rows 7 and 8, face down, with the **3 Property Cards on it, side by side, face up** (Mar-a-Lago IV, Gulf Stream III, Spanish River II).
- **Luxury Cards:** one face-down card to the right of each row. Rows 4 and 6 have two stacked: the lower card shows a little to the right, and the top card carries the number 2.
- **Not drawn:** the Bank's Diamonds and the pile of 7 Luxury Cards for Diamond trades. They are in the game.
- **Title:** PALM BEACH at the top.
- **Card backs:** new file `pb_map_cards_back.webp` from the print art, with its own back for Waterfront on the Atlantic side (Boca showed "Waterfront Lagoon" on both sides).
- **Moved:** RESIGN and the settings wheel are now in the bottom-left corner, because the Luxury Cards fill the right side from top to bottom. COMPENDIUM stays top right.
- **Switched off on the Palm Beach table:** Boca's two mid-board auctions, the three Luxury piles with prices, the campaign OBJECTIVE button.
- New code: `js/pb/layout.js` (positions, pure and tested) and `js/pb/table.js` (drawing). 11 new checks in `tests/pb_table_layout.test.js`. `npm run check`: ALL 20 CHECKS PASSED.
- Checked in the browser at 1920 × 1080 and 1366 × 768.

### Still Boca on screen after step 1.2 (fixed in step 1.3)
- The player panels top left: Boca counters (Extra Turns), Boca starting values, no Diamonds.
- The characters you can pick: still the Boca demo slots (Edith, Ms. Post, Bright Shell, Carina, Skip), not the five chosen for version 1.
- The Boca tutorial button still starts the Boca tutorial with the Boca board.

### Choices made in step 1.2 that Lars should look at
1. The 3 Property Cards lie **face up** on the Auction Map Card (everyone knows which three exist).
2. Luxury Cards are the same size as the Map Cards (250 px), so they touch each other down the right side.
3. RESIGN and the settings wheel moved to the bottom-left corner.
4. The Waterfront card backs still show "+4 Au" beside the Diamond, as printed (the rulebook explains it).

## Step 1.3 (25 Nov 2026): done
The party menu deals Palm Beach characters and the player panels show the Palm Beach game.

- **Five open characters:** Roxana, Mr. Flagler, Bright Shell, Carina, Skip. The other five show "FULL GAME" and cannot be picked. Random, Pick 2 and Open Draft all use these five.
- **Character texts** (`js/characters.js`) are Palm Beach now. The rules (power, counters, Diamonds, initiative) are read from the rules engine, so they exist in one place only. Leja and Silviano are gone; Edith and Skip are in their slots.
- **Player panels** (left side), one per player in seating order: name, character card, **Diamonds under the card**, gold (open), Prestige Points, re-rolls, and the cards won (Property Card first).
  - Diamonds: one place per Diamond needed for the trade (4, Mr. Flagler 3); the player's own are bright, the rest faint.
  - The character card grows when the pointer is on it, so the power and the initiative numbers can be read.
  - No Extra Turns, no Powers counter (none of the five has a red counter).
- **Seating:** seats follow the order of the names in the party menu. The menu now says "in the order you sit, clockwise". Fixed a bug found on the way: the draft shuffled the players and that became the seat order.
- **Tutorial button hidden** on the party menu (version 1 has no tutorial; Boca's lessons teach Boca rules).
- New code: `js/pb/panels.js`, panel positions in `js/pb/layout.js`. 8 new checks in `tests/pb_characters_and_panels.test.js`. `npm run check`: ALL 20 CHECKS PASSED.
- Checked in the browser: Random and Open Draft with 3 and 4 players, Pick 2 with 4 players, panels with gold, Diamonds and won cards filled in by hand.

### For Lars to look at after step 1.3
1. **Character stories** in `js/characters.js` are short drafts from `docs/palm_beach/compendium-lore-draft.md`, with the Boca-power sentences replaced. They show in the Compendium. Lars approves the texts.
2. The party menu has two buttons now (SUPPORT US, START MATCH) and an empty place where TUTORIAL was. To be tidied in step 1.6.
3. The party-menu background photo is still the Boca Raton board.
4. One Boca test was set aside (`_to_delete/boca_tests/`): it tested Eric's Boca power, which Palm Beach does not have.
5. The Compendium and the Boca campaign screens were not gone through; they still hold Boca texts in places (step 1.6).

## Step 1.4 (25 Nov 2026): done
The card flipping phase of all 8 rounds can be played, hot seat. The rules engine runs the game; the screen only asks and shows.

- **Start of a round:** a message names the round, the start player and the initiative number. The start player has a star, and the row being played has a gold frame.
- **Turns:** the player whose turn it is has a gold name bar, and the top line says "PLAYER 2: CHOOSE A CARD IN ROW 3". Only face-down cards in the current row can be clicked. Turns go clockwise.
- **Lagoon and Atlantic:** the die rolls on screen. On a miss the card stays face down with a message. Skip flips Atlantic cards with no die.
- **Re-roll:** after a miss, a player with a yellow counter is asked "Spend a re-roll and roll again?" with RE-ROLL and NO THANKS.
- **Rewards:** the card turns over, and "+8 Au" or a Diamond flies to the player's panel. Bonus circles are included. Landmark cards show the landmark's story beside the board (the Boca pop-up).
- **Diamond trade:** the popup "You have 4 diamonds. Trade in for a Luxury Card." with OK (3 for Mr. Flagler). Then the new Luxury Card appears large in the middle of the table and flies to the player's panel.
- **End of the row:** "ROW 3 IS COMPLETE", then the next round.
- **After round 8:** the Auction Map Card is flipped, the other two Property Cards are removed, characters collect their gold, and a simple box lists the points.
- New code: `js/pb/match.js` (connects engine and screen), `js/pb/effects.js` (dice, flips, flying rewards, popups), `js/pb/messages.js` (the words on screen). 8 new checks in `tests/pb_match_messages.test.js`. `npm run check`: ALL 21 CHECKS PASSED.
- Checked in the browser: a whole 3-player game played to the end by an automatic clicker with no errors (all 64 cards flipped, Diamond trades happened), and the re-roll and Diamond trade popups looked at by hand.

### Not in step 1.4 (on purpose)
- **No auctions yet** (added in step 1.5).
- **No final scoring screen** (step 1.6): only a simple box with the points.
- **A match is not saved.** Reloading the page or leaving the match ends it.

### For Lars to look at after step 1.4
1. The speed: messages stay about 1.5 seconds, the landmark pop-up closes by itself or on a click.
2. The landmark pop-up covers the Luxury Cards on the right while it is open.
3. The "new Luxury Card" moment: is it enough, or should it be bigger?

## Step 1.5 (25 Nov 2026): done
A complete game can be played from start to finish: 8 rounds of flipping, 10 Luxury Auctions, the Property Auction, a winner.

- **Luxury Auction after each row:** the round's Luxury Card is turned face up beside its row, then the auction window opens. In rounds 4 and 6 the two cards are auctioned one after the other; the start player opens both.
- **The auction window** shows the card large, its Prestige Points, the highest bid and who made it, and every player as IN, PASSED or BID n, with their gold.
- **Bidding uses the Boca system** (Lars's answer): buttons that raise the highest bid by 1, 3 or 5 Au, and PASS. The first bidder sees BID 1, BID 3, BID 5. A raise the player cannot afford is switched off.
- **Passing:** once you pass you are out of that auction. A player who cannot afford a higher bid passes automatically, with a message.
- **Winning:** the winner pays, the card appears large and flies to their panel; re-rolls on the card are added at once.
- **Nobody bids:** the Luxury Card is removed from the game, with a message.
- **Property Auction after round 8:** the Auction Map Card is flipped, the other two Property Cards are removed, characters collect their gold (with a message), then the property is auctioned the same way. If nobody bids, nobody gets it.
- **End:** a box names the winner, everyone's Prestige Points and gold, and how a tie was decided. (The proper final scoring screen is step 1.6.)
- New code: `js/pb/auction_view.js`; auction words in `js/pb/messages.js`. 7 new checks in `tests/pb_auction_view.test.js`, including 200 whole games bid only through the buttons. `npm run check`: ALL 22 CHECKS PASSED.
- Checked in the browser: one auction bid by hand (bids, a pass, a forced pass, the win), then a whole 3-player game played to the end by an automatic clicker with no errors. The Property Card was sold and a winner was named.

### For Lars to look at after step 1.5
1. **Raising by 1, 3 or 5** is the Boca system. A Property Auction with 60 Au on each side takes many clicks. Want a bigger step too (for example +10)?
2. After the end box, the table stays as it is. RESIGN (bottom left) goes back to the menu. A proper end screen with PLAY AGAIN is step 1.6.
3. Not tried by hand: games with 2, 4 and 5 players through the auctions (the tests cover them; the browser run was 3 players).

## Step 1.6 (25 Nov 2026): done
End of game and polish.

- **Final scoring screen:** the winner in the title, how the game was decided in words (most points, Property Card, most gold, or shared), and a table with every player's Luxury points, Property points, Prestige Points and gold left. Buttons **PLAY AGAIN** (same names, new draft) and **PARTY MENU**.
- **RESIGN** now ends the match and goes straight back to the party menu, with nothing left on screen. (It used to open Boca's game-over screen.)
- **Cheat sheet:** a "? REWARDS" button under COMPENDIUM opens the Palm Beach reward table and the short rules. The numbers come from the rules engine.
- **Round and phase indicator and whose turn** were already in place from steps 1.4–1.5 ("ROUND 3 OF 8 · LUXURY AUCTION").
- **Sounds:** gong at round start, a click when the turn changes, dice, card flip, gold, auction alert, bid, pass, win, and the winner song at the end.
- **Board game popup, new design** (`SUPPORT_POPUP.md`): the party-menu button says THE BOARD GAME, the popup heading is PLAY IT ON YOUR TABLE, Kickstarter is the larger first card with the only solid button, the VIP list is a plain text link under it, Steam is the smaller second card about Boca Raton. No 50 % badge. Tracking tag `utm_source=web_palm_beach`. A quiet link on the final scoring screen opens the same popup (web edition only); it never opens by itself.
- **Party menu:** two buttons, centred: THE BOARD GAME and START MATCH.
- **Compendium:** the RULES tab now holds the Palm Beach rules (`js/pb/rules_text.js`). The Boca-only tabs are hidden: Visitors (Boca's AI), Member Profile (Boca campaign statistics), Lore (an empty page). The Block Bonus text no longer talks about Boca's columns.
- **Small-window notice:** inherited from the Boca web edition, unchanged.
- New code: `js/pb/end_screen.js`, `js/pb/rules_text.js`. 8 new checks in `tests/pb_end_and_polish.test.js`; the popup and menu tests in `tests/web_edition.test.js` were rewritten for the new design. `npm run check`: ALL 23 CHECKS PASSED.
- Checked in the browser: the final screen (with a tie decided by the Property Card), the cheat sheet, the popup, the party menu, the Compendium rules, RESIGN back to the menu and starting a new match after it.

### For Lars to approve or supply after step 1.6
1. **Board game popup texts:** built with the proposals in `SUPPORT_POPUP.md`. Lars approves them; changes are made in `js/support_links.js` only.
2. **Character stories** in `js/characters.js` (drafts).
3. **Compendium rules text** in `js/pb/rules_text.js` (a summary of the rulebook, written by Claude).
4. **Photos still showing Boca Raton:** the splash picture (title in the picture), the party-menu background (`board_game.webp`, 2560 × 1440) and the popup banner (`board_game_support_us.webp`, 2560 × 900, under 500 KB).
5. **Compendium "Board game" page:** still the Boca text and photos, with one sentence changed to name Palm Beach.
6. Not done by hand: the PLAY AGAIN button at the end of a full game (the same code was run directly and worked).

## Step 1.7 (25 Nov 2026): release check done, `dist-web` built. NOT uploaded (Lars uploads).

### Checked and passed
- **`npm run check`:** ALL 23 CHECKS PASSED (20 test files, the three builds, the secret scan, Steam files in place).
- **Play-throughs in the browser** (development version, fastest speed setting, played to the end by an automatic clicker through the real buttons, no errors in any of them):

  | Players | Draft | Result |
  |---|---|---|
  | 2 | Random | Played to the final screen and back to the party menu |
  | 3 | Pick 2 | All 64 cards flipped, 3 Diamond trades, 1 unsold card, Gulf Stream sold, a winner named |
  | 4 | Open Draft | All 64 cards flipped, 4 Diamond trades, Mar-a-Lago sold, a winner named |

- **`dist-web` built** with `npm run build:web`: 51 MB, 80 files.
- **Secret scan of that exact `dist-web`:** no keys, passwords or Steam code.
- **The built version tried in the browser** (`npm run preview:web`): starts as the web edition, a match starts, cards flip, no file fails to load, the save key is `palmBeachWebSave`.
- **Remote addresses:** none is loaded by the page itself (the font is hosted with the game since the font change below). Kickstarter, Steam and backhansgames.com are links that open only on a click.

### Fixed during the check
- Removed the list of remote addresses for packages the game never loads (`@google/genai`, `vite`, `@tailwindcss/vite`, `electron`) from `index.html`.
- Hid the "Bot turn speed" setting (version 1 has no AI players).
- The die on screen now follows the "Dice speed" setting.

### NOT checked (Claude Code cannot)
- **Safari, Firefox, a real iPad or phone.** Only the built-in Chromium browser was used. Audio start, fullscreen and touch should be tried there.
- **A full game clicked by hand by people.** The play-throughs were automatic and at the fastest speed, so nobody has judged the pace or the feel.
- **5 players:** not offered in the web menu (2–4), so not played on screen; the rules tests cover it.
- **Licences** of the music, sounds and stock pictures inherited from Boca: there is no list in the project.

### Lars decides before uploading
1. **Three pictures still show Boca Raton:** the splash screen (the title "Boca Raton and Palm Beach / Gold Coast Gambits" is part of the picture), the party-menu background and the popup banner. Files and sizes: see step 1.6 above and `docs/ASSETS.md`.
2. **Texts written or proposed by Claude:** the popup texts (`js/support_links.js`), the Compendium rules (`js/pb/rules_text.js`), the character stories (`js/characters.js`).
3. ~~Google Fonts~~ **Done 25 Nov (Lars said yes):** the Overpass font is now hosted with the game (`public/assets/fonts/`, two files, 85 KB together; free to use under the SIL Open Font License). The page no longer fetches anything from another server by itself. Checked in the built version: the font loads from the game's own address and no outside address is contacted. `dist-web` was rebuilt and scanned again after this change.
4. **The Compendium "Board game" page** still has the Boca text and photos.
5. **The Steam link in the popup** goes to the Boca Raton (Gold Coast Gambits) store page, on purpose.

### How Lars uploads
1. `npm run check` (must end with ALL CHECKS PASSED).
2. `npm run build:web` (writes a fresh `dist-web/`).
3. Optional: `npm run play:web:build` to try exactly that build.
4. In Netlify, open the **Palm Beach** site → Deploys → drag the `dist-web` folder onto the drop area. Never the Boca Raton site.
5. Open the site and play a short game.

## Next
Version 1 is ready for Lars's own play-test and upload. After that: version 2 (tutorial), step 2.1: agree on the lessons.

## Open questions for Lars
- **Splash picture:** a new `splash.webp` (3840 × 2160, under 1 MB) that says Palm Beach, or the same photo without text.
- **Luxury, Property and Auction Map Card pictures** are Boca's files: are they the same as the printed Palm Beach cards? (See `docs/ASSETS.md`.)
- Support popup texts (`SUPPORT_POPUP.md`): approve before step 1.6.
- Photos: party-menu background and a Palm Beach banner for the popup (before step 1.6).
- The Netlify site for palmbeach.backhansgames.com (before step 1.7).
- Steam (later): its own Steam app, or part of Gold Coast Gambits?
