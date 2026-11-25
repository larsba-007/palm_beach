# Palm Beach tutorial: the script (step 2.1)

**Status: approved by Lars, 25 Nov 2026, and built (steps 2.2 and 2.3).** A test checks that the game's bubble texts are the ones in this file, word for word: change a text here AND in `js/pb/tutorial_lessons.js`.
Lars: change any text directly in this file, or tell Claude what to change.

## Decided by Lars (25 Nov 2026)

1. The tutorial is **one short guided game**, not text screens.
2. The learner plays **Bright Shell** against a scripted **Roxana**.
3. "Board game rule" notes are in: **one per chapter**.

## How it works

- Four chapters, about 5 minutes together. Each chapter can be replayed on its own.
- A text bubble points at one thing. Only that thing can be clicked. The game then moves on.
- The cards and the dice are fixed, so every learner sees exactly what is written here.
- Roxana's turns play by themselves. She is a script, not an AI.
- Each chapter starts from its own fixed table. Chapters 3 and 4 jump ahead in the game ("A few rounds later").
- All numbers below follow the rules file (`docs/palm_beach/rules-palm-beach.md`): Block 3 Au, Atlantic 3–6 gives 6 Au, Lagoon 4–6 gives 8 Au, Waterfront 1 Diamond, 4 Diamonds = 1 Luxury Card, everyone starts with 5 Au.

In the tables: **You** = the learner (Bright Shell). "Click" is what the learner must do. A row without a click is something the game shows by itself.

---

## Chapter 1: Flip cards

**Table at the start:** round 1, row 1 face down (9 cards). You: 5 Au, 1 re-roll. Roxana: 5 Au.

| # | Bubble text | Points at | Click / what happens | After |
|---|---|---|---|---|
| 1.1 | Welcome to Palm Beach! The player with the most Prestige Points after 8 rounds wins. | The middle of the table | Click NEXT | |
| 1.2 | Each round is played on one row. First you flip its cards for gold, then you bid on a Luxury Card. | Row 1 and the Luxury Card beside it | Click NEXT | |
| 1.3 | The lowest initiative number starts the round. You have 30 and Roxana has 70: you start. | The R1 numbers on both character cards | Click NEXT | |
| 1.4 | Block cards are safe. Flip one and take 3 Au. | A Block card | Click the Block card | You 8 Au |
| 1.5 | Roxana tries an Atlantic card. She needs 3 or higher on the die. | The Atlantic card | Roxana rolls 5: the card flips | Roxana 11 Au |
| 1.6 | An Atlantic card gives 6 Au. Roxana's power gives her 5 Au extra for rolling 5 or 6. | Roxana's character card | Click NEXT | Roxana 16 Au |
| 1.7 | The Lagoon pays most: 8 Au. You need 4 or higher. | The Lagoon card | Click the Lagoon card. You roll 2 | |
| 1.8 | A 2: missed! You have a yellow re-roll counter. Use it to roll again. | The RE-ROLL button | Click RE-ROLL. You roll 5: the card flips | You 16 Au, 0 re-rolls |
| 1.9 | Without a re-roll the card stays face down, and anyone can try it later. | The flipped Lagoon card | Click NEXT | |
| 1.10 | (no bubble) | | Roxana flips a Block card | Roxana 19 Au |
| 1.11 | Some cards hide a yellow circle with extra gold. Try this one. | A Block card | Click the Block card: it shows +5 | You 24 Au (3 + 5) |
| 1.12 | Waterfront cards give a Diamond instead of gold. | A Waterfront card | Roxana flips it | Roxana 1 Diamond |
| 1.13 | Take the other Waterfront card. | The other Waterfront card | Click the Waterfront card | You 1 Diamond |
| 1.14 | (no bubble) | | Roxana flips a Block card | Roxana 22 Au |
| 1.15 | Flip the last card. When the whole row is face up, the auction begins. | The last Block card | Click the Block card | You 27 Au |

**Board game rule (shown with 1.7):** At the table, say which card you want before you roll.

---

## Chapter 2: The Luxury Auction

**Table at the start:** continues from chapter 1. You 27 Au, Roxana 22 Au. The Luxury Card of round 1 is the Sports Car (2 Prestige Points).

| # | Bubble text | Points at | Click / what happens | After |
|---|---|---|---|---|
| 2.1 | Every round ends with an auction. The Luxury Card is turned face up: a Sports Car, worth 2 Prestige Points. | The Sports Car | Click NEXT | |
| 2.2 | The start player bids first. The lowest bid is 1 Au. | The BID 1 button | Click BID 1 | Bid: you 1 |
| 2.3 | Roxana raises to 4 Au. Now you raise or pass. If you pass, you are out of this auction. | The bid window | Click NEXT | Bid: Roxana 4 |
| 2.4 | Raise by 3. | The RAISE +3 button | Click RAISE +3 | Bid: you 7 |
| 2.5 | Roxana raises to 8 Au. You can never bid more gold than you have, and neither can she. | Both players' gold | Click NEXT | Bid: Roxana 8 |
| 2.6 | Raise by 1. | The RAISE +1 button | Click RAISE +1. Roxana passes | Bid: you 9 |
| 2.7 | Sold! You pay 9 Au to the Bank and take the card. | Your panel, where the card lands | Click NEXT | You 18 Au, 2 Prestige Points |
| 2.8 | Gold is only for bidding. At the end, Prestige Points decide who wins. | Your Prestige Points | Click NEXT | |

**Board game rule (shown with 2.5):** In the board game your gold is secret, so nobody knows how high the others can go.

---

## Chapter 3: Diamonds

**Table at the start:** "A few rounds later." Round 5, row 5 face down. You: 3 Diamonds, the Sports Car, 12 Au, 0 re-rolls. Roxana: 1 Diamond, a Hotel (3 Prestige Points), 10 Au. You start (your R5 is 20, Roxana's is 95).

| # | Bubble text | Points at | Click / what happens | After |
|---|---|---|---|---|
| 3.1 | A few rounds later. You have 3 Diamonds. | The Diamonds under your character card | Click NEXT | |
| 3.2 | 4 Diamonds are traded for a Luxury Card, with no auction. Flip a Waterfront card. | A Waterfront card | Click the Waterfront card | You 4 Diamonds |
| 3.3 | (the game's own popup) You have 4 diamonds. Trade in for a Luxury Card. | The OK button | Click OK. A card flies to your panel | You 0 Diamonds |
| 3.4 | A Tiger! It is worth 1 Prestige Point and gives you 2 re-roll counters. | The Tiger in your panel | Click NEXT | You 3 Prestige Points, 2 re-rolls |
| 3.5 | The trade happens by itself every time you reach 4 Diamonds. | Your Diamonds (now empty) | Click NEXT | |

**Board game rule (shown with 3.3):** At the table, give 4 Diamonds to the Bank and take the top card of the face-down Luxury pile.

---

## Chapter 4: The ending

**Table at the start:** "The last round." Round 8, row 8 face down (5 cards) with the Auction Map Card and the 3 Property Cards. You: Sports Car + Tiger (3 Prestige Points), 14 Au, 2 re-rolls. Roxana: Hotel (3 Prestige Points), 9 Au. You start (your R8 is 10, Roxana's is 80). The Luxury Card of round 8 is the Shoes (1 Prestige Point). The Auction Map Card is Spanish River Park.

| # | Bubble text | Points at | Click / what happens | After |
|---|---|---|---|---|
| 4.1 | The last round. Rows 7 and 8 are short, and the Auction Map Card lies at the end. | Row 8 and the Auction Map Card | Click NEXT | |
| 4.2 | It hides which of the 3 Property Cards is sold at the very end. You and Roxana both have 3 Prestige Points. | The 3 Property Cards | Click NEXT | |
| 4.3 | Try the Atlantic card: 3 or higher. | The Atlantic card | Click the Atlantic card. You roll 4: it flips | You 20 Au |
| 4.4 | (no bubble) | | Roxana flips the Block card | Roxana 12 Au |
| 4.5 | Now the Lagoon: 4 or higher. | The Lagoon card | Click the Lagoon card. You roll 3 | |
| 4.6 | Missed. The Tiger gave you re-rolls: use one. | The RE-ROLL button | Click RE-ROLL. You roll 6: it flips | You 28 Au, 1 re-roll |
| 4.7 | (no bubble) | | Roxana flips a Waterfront card | Roxana 1 Diamond |
| 4.8 | Flip the last card. | The other Waterfront card | Click the Waterfront card | You 1 Diamond |
| 4.9 | The last Luxury Card: Shoes, 1 Prestige Point. You may pass, and save your gold for the Property. | The PASS button | Click PASS. Roxana bids 1 Au and takes the Shoes | Roxana 4 Prestige Points, 11 Au |
| 4.10 | Now the Auction Map Card is flipped: Spanish River Park, worth 2 Prestige Points. | The Auction Map Card | Click NEXT. The other two Property Cards leave | |
| 4.11 | Some characters collect gold before "their" property is sold. Roxana takes 10 Au. | Roxana's character card | Click NEXT | Roxana 21 Au |
| 4.12 | You need this card to win. Open with 5 Au. | The BID 5 button | Click BID 5. Roxana raises to 10 | Bid: Roxana 10 |
| 4.13 | Raise by 5 again. | The RAISE +5 button | Click RAISE +5. Roxana raises to 20 | Bid: Roxana 20 |
| 4.14 | Roxana has 21 Au. Bid 21 and she cannot go higher. | The RAISE +1 button | Click RAISE +1. Roxana passes | You 7 Au, 5 Prestige Points |
| 4.15 | The game is over. You have 5 Prestige Points and Roxana has 4: you win! | The final scoring screen | Click NEXT | |
| 4.16 | On a tie, the player with the Property Card wins. After that, the most gold left. | The final scoring screen | Click NEXT | |
| 4.17 | That is all of Palm Beach. Gather your friends! | The final scoring screen | Buttons: PLAY A REAL GAME (goes to the party menu) · CHAPTERS (the party menu with the chapter list open) | |

**Board game rule (shown with 4.10):** At the table, the other two Property Cards go back in the box.

---

## What the tutorial does not teach

- The other characters' powers (they are on the character cards and in the Compendium).
- Two Luxury Cards in rounds 4 and 6 (the game shows the number 2 on the stack).
- Landmark cards with +1 and +2 circles (same idea as the +5 circle in chapter 1).
- What happens if everyone passes.

## Open points for Lars

1. Is the length right (15 + 8 + 5 + 17 steps)?
2. Chapter 4, step 4.9 gives a piece of advice ("save your gold for the Property"). Is that advice you want to give?
3. Where does the tutorial start from: see the question about the start screen in the chat (option A, B or C).
