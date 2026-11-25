# Support popup: new design for both web games

*Decided by Lars 25 Nov 2026: the main button goes to **Kickstarter**, and the same change is made in the **Boca Raton** web game and the **Palm Beach** web game. Texts below are proposals until Lars has approved them.*

## What changes (both games)

1. **Named for what the player gets.** The party-menu button says **THE BOARD GAME** (was SUPPORT US). The popup heading says **PLAY IT ON YOUR TABLE**.
2. **One main action: Kickstarter.** The Kickstarter card comes first and is the larger one. Its button is the only solid one in the popup.
3. **VIP link under the main button**, as a plain text link (not a button).
4. **Steam is a smaller second card.**
5. **No 50 % badge until the real shop page exists.** Today the Steam-key link is a placeholder that opens the backhansgames.com front page, so the popup promises an offer the page doesn't show.
6. **A quiet link on the game-over screen**, under the main button, that opens the same popup. The popup never opens by itself.
7. **Tracking stays:** the UTM tags on every link. If Lars makes a custom referral tag for the Kickstarter page, it is added to the Kickstarter link in `js/support_links.js`.

Copy rules (from the Kickstarter notes): never write "click Notify me for 10 % off". Boca Raton = push your luck, Palm Beach = bidding.

## Texts: Boca Raton web game

| Place | Text |
|---|---|
| Party-menu button | THE BOARD GAME |
| Popup heading | PLAY IT ON YOUR TABLE |
| Card 1 heading (green, main) | COMING TO KICKSTARTER |
| Card 1 text | Boca Raton is one of two games in the box: Boca Raton (push your luck) and Palm Beach (bidding). 1–5 players, solo mode, 45–60 min. |
| Card 1 button | NOTIFY ME ON LAUNCH → |
| Card 1 link | https://www.kickstarter.com/projects/backhansgames/boca-raton-and-palm-beach |
| Text link under the button | Join the VIP list for the 15% Early Bird → https://backhansgames.com/go |
| Card 2 heading (yellow, smaller) | THE FULL GAME ON STEAM |
| Card 2 text | Gold Coast Gambits: all 10 characters, AI opponents and 50 solo challenges. |
| Card 2 button | VIEW ON STEAM → |
| Card 2 link | https://store.steampowered.com/app/4307400/ |
| Game-over screen link | Liked it? It's a real board game → |
| Banner photo | unchanged |

## Texts: Palm Beach web game

Same as Boca Raton except:

| Place | Text |
|---|---|
| Card 1 text | Palm Beach is one of two games in the box: Palm Beach (bidding) and Boca Raton (push your luck). 1–5 players, solo mode, 45–60 min. |
| Card 2 heading | PLAY BOCA RATON ON STEAM |
| Card 2 text | The other game in the box, as Gold Coast Gambits. |
| Tracking | `utm_source=web_palm_beach` |
| Banner photo | the Palm Beach side set up, with Diamonds and gold bars (Lars's photo, 2560 × 900) |

Palm Beach is not on Steam, so the Palm Beach popup must never say "get the full Steam game".

## Where it is in the code

- Texts and links: `js/support_links.js` (the only file for wording).
- Popup markup: `index.html`, `#support-modal`; menu button `#v3-support-btn`.
- Tests that check the wording and layout: `tests/web_edition.test.js`, tests 35–38. They must be updated with the new texts.
- Everything stays behind `GameConfig.isWeb` / `.web-only`, so the Steam builds don't change.
