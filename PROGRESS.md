# Palm Beach digital: progress

## Plan
- See `PLAN.md`: version 1 hot seat (2-4 players, 5 characters, no tutorial), version 2 + tutorial, version 3 + AI. Steam later.
- **Current step: 1.0** (not started).

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

## Next
Step 1.0 in `PLAN.md`.

## Open questions for Lars
- OK to start step 1.0?
- Support popup texts (`SUPPORT_POPUP.md`): approve before step 1.6.
- Photos: party-menu background and a Palm Beach banner for the popup (before step 1.6).
- The Netlify site for palmbeach.backhansgames.com (before step 1.7).
- Steam (later): its own Steam app, or part of Gold Coast Gambits?
