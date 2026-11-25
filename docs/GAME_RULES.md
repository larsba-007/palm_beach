# Boca Raton: Authoritative Game Rules

This document specifies all verified gameplay rules, board layout geometry, turn sequences, card systems, economy, auctions, characters, AI bot behaviors, and win/loss conditions implemented in the *Boca Raton* source code.

---

## 1. Game Setup & Board Geometry

### 1.1 Board Dimensions and Grid Layout
- The game board is an **8 Row × 9 Column** grid ($8 \times 9 = 72$ cells total).
- **Rows**: Indexed 0 to 7 (Top to Bottom).
- **Columns**: Indexed 0 to 8 (West/Left to East/Right).

```
 Col:    0         1         2         3         4         5         6         7         8
     +--------+--------+--------+--------+--------+--------+--------+--------+--------+
R0   | Lagoon | WF_L   | Block  | Block  | Block  | Block  | Block  | WF_R   | Atlant |
R1   | Lagoon | WF_L   | Block  | [   AUCTION A   ]  | Block  | WF_R   | Atlant |
R2   | Lagoon | WF_L   | Block  | [   AUCTION A   ]  | Block  | WF_R   | Atlant |
R3   | Lagoon | WF_L   | Block  | Block  | Block  | Block  | Block  | WF_R   | Atlant |
R4   | Lagoon | WF_L   | Block  | Block  | Block  | Block  | Block  | WF_R   | Atlant |
R5   | Lagoon | WF_L   | Block  | [   AUCTION B   ]  | Block  | WF_R   | Atlant |
R6   | Lagoon | WF_L   | Block  | [   AUCTION B   ]  | Block  | WF_R   | Atlant |
R7   | Lagoon | WF_L   | Block  | Block  | Block  | Block  | Block  | WF_R   | Atlant |
     +--------+--------+--------+--------+--------+--------+--------+--------+--------+
```

### 1.2 Column Types & Values

| Column | Name | Type | Value (Au Earned) | Dice Difficulty (1d6) | Required Roll | Success Rate |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: |
| **0** | **Lagoon** (West) | Coastal Water | **8 Au** | 4 | **4, 5, or 6** | 50.0% |
| **1** | **Waterfront Left** | Waterfront Border | **4 Au** | 0 | Guaranteed (No roll) | 100.0% |
| **2–6**| **City Blocks** | Inland Blocks | **3 Au** | 0 | Guaranteed (No roll) | 100.0% |
| **7** | **Waterfront Right** | Waterfront Border | **4 Au** | 0 | Guaranteed (No roll) | 100.0% |
| **8** | **Atlantic** (East) | Ocean Water | **6 Au** | 3 | **3, 4, 5, or 6** | 66.7% |

### 1.3 Property Auction Slots (Central Cards)
16 cells in the center of the grid are physically occupied by two Property Cards placed face-down (or face-up depending on variation):
- **Auction A Slots**: Rows 1–2, Columns 3–6 ($2 \times 4 = 8$ cells).
- **Auction B Slots**: Rows 5–6, Columns 3–6 ($2 \times 4 = 8$ cells).
- Total playable map cells on the board: $72 - 16 = \mathbf{56}$ map cells.

### 1.4 Player Capacity & Variations
- **Player Count**: 2 to 4 players (1 human + 1 to 3 bots in standard play, or up to 4 local humans).
- **Board Variations**:
  - **Boca Raton (Standard)**: All Luxury Piles and Property Cards start face-down (closed).
  - **Spanish Variation**: Both Property Cards start face-up (open auctions).
  - **Red Reef Variation**: The top card of all 3 Luxury Piles starts face-up (open market).
  - **Mizner Variation**: Both Luxury Piles and Property Cards start face-up (open information).

---

## 2. Turn Structure

Each turn proceeds sequentially in a clockwise rotation (`state.turn` increments modulo `players.length`):

1. **Turn Start (`startTurnCycle`)**:
   - Status updates to `Active`.
   - Action flag reset (`actionUsedThisTurn = false`).
   - If player is skipped (via Roxana's power), skip is consumed and turn immediately passes.
2. **Action Phase (Choose ONE primary turn action)**:
   - **Action A: Flip a Map Card** (from an unrevealed grid cell).
   - **Action B: Buy/Roll for a Luxury Card** (from Deck 0, 1, or 2).
   - *(Optional Free Actions)*: Use Character Powers, spend Re-roll counters during rolls, spend Extra Turn counters.
3. **Bonus Resolution Phase**:
   - Check cell-specific bonuses (Landmark lore bonus, character waterfront bonus).
   - Check line bonuses (`checkLineBonuses`): evaluate if the newly flipped cell completed a 9-card row or 8-card column.
4. **Auction Check Phase**:
   - If Waterfront Left (Col 1) has 0 cards remaining and Auction A is unheld $\rightarrow$ trigger Auction A.
   - If Waterfront Right (Col 7) has 0 cards remaining and Auction B is unheld $\rightarrow$ trigger Auction B.
5. **End-of-Turn / Victory Check (`nextTurn`)**:
   - Check campaign objectives or game-over triggers.
   - If extra turn active, grant immediate repeat turn; otherwise pass to next player.

---

## 3. Core Mechanics

### 3.1 Flipping Map Cards
- A player clicks an unflipped map cell.
- If `difficulty > 0` (Lagoon or Atlantic):
  - A 1d6 roll is initiated.
  - If roll $\ge$ difficulty, the card is flipped, visual flip animation plays, and Au is added to player's wallet (`player.gold`).
  - If roll $<$ difficulty:
    - The player is prompted to use a **Re-roll counter** (if available).
    - If re-rolled successfully, card is flipped and Au awarded.
    - If no re-roll used or final re-roll fails, the turn ends with **no card flipped and 0 Au earned**.

### 3.2 Row and Column Bonuses
- When all 9 cells in a Row (including auction spacer gaps that count as occupied) become flipped, a **Row Bonus** triggers.
- When all 8 cells in a Column become flipped, a **Column Bonus** triggers.
- **Award**: **5 Au** base payout (awarded to the specific player who placed the completing flip).
- **Special Rule**: If **Addison Mizner** triggers the bonus, his ability increases the award to **10 Au**.

### 3.3 Historical Landmarks
There are 10 unique landmarks mapped to specific board coordinates:
- Flipping a landmark awards **+2 Au** (or **+1 Au**) immediately on top of the standard cell payout.
- Verified Landmarks:
  1. *Ocean Ridge Natural Area* (R2, C0 — Lagoon): **+2 Au**
  2. *Henry Flagler Museum / Whitehall* (R6, C1 — Waterfront): **+2 Au**
  3. *Little Red Schoolhouse* (R4, C2 — Block): **+2 Au**
  4. *Pan's Garden* (R6, C3 — Block): **+2 Au**
  5. *Church of Bethesda-By-The-Sea* (R7, C3 — Block): **+2 Au**
  6. *The Society of the Four Arts* (R5, C4 — Block): **+2 Au**
  7. *Gumbo Limbo Nature Center* (R2, C5 — Block): **+2 Au**
  8. *Ocean Front Beach* (R0, C6 — Waterfront): **+1 Au**
  9. *Ocean Ridge Hammock Park* (R4, C6 — Waterfront): **+1 Au**
  10. *Gulf Stream Golf Club Landmark* (R6, C6 — Waterfront): **+1 Au**

---

## 4. The Luxury Market

Luxury cards provide **Prestige Points** (the core win condition). There are 17 Luxury Cards divided across 3 purchase tiers:

### 4.1 Luxury Decks

| Deck Index | Base Cost | Dice Difficulty (1d6) | Required Roll | Success Rate | Tier / Cards Available |
| :---: | :---: | :---: | :---: | :---: | :--- |
| **Deck 0** | **5 Au** | 5 | **5 or 6** | 33.3% | Low-cost entry (1–2 pt cards) |
| **Deck 1** | **10 Au** | 3 | **3, 4, 5, or 6** | 66.7% | Mid-cost balanced (2 pt cards) |
| **Deck 2** | **15 Au** | 0 | Guaranteed (No roll) | 100.0% | Premium guaranteed (2–3 pt cards) |

### 4.2 The 17 Luxury Cards
- **1-Point Cards (5 cards)**: Wine Cellar, Designer Shoes, Designer Handbag, Luxury Watch, Tiger Experience.
- **2-Point Cards (7 cards)**: Diamond Rings, Sailing Yacht, Horse, Sports Car, Personal Drone, Private Jet, Art Gallery.
- **3-Point Cards (5 cards)**: Football Team, Luxury Hotel, Rocket Ship, Submarine, Luxury Yacht.

### 4.3 Purchase Rules
1. Player pays the gold cost upfront (including any taxes placed by Ms. Post).
2. If the deck requires a roll (`difficulty > 0`), 1d6 is rolled.
3. If successful, the top card is moved to the player's inventory, and Prestige Points increase by the card value.
4. If failed, the player may spend Re-roll counters. If all fail, **the paid Au is lost** and the card remains on top of the pile.

---

## 5. Property Auctions

Property cards represent iconic real estate and grant significant Prestige Points and tiebreak power.

### 5.1 The 3 Property Cards
1. **Mar-a-Lago**: **4 Prestige Points**. *Special Power: Ultimate Tiebreaker.* If the game ends in a tie, the player holding Mar-a-Lago automatically wins the match.
2. **Gulf Stream Golf Club**: **3 Prestige Points**.
3. **Spanish River Park**: **2 Prestige Points**.

### 5.2 Triggering an Auction
- **Auction A**: Triggers when all 8 cards in **Column 1 (Waterfront Left)** are flipped.
- **Auction B**: Triggers when all 8 cards in **Column 7 (Waterfront Right)** are flipped.
- Two properties are randomly selected at game start for A and B; the 3rd remains in the box (or is pre-assigned in specific Gambits).

### 5.3 Bidding Rules (English Ascending Auction)
1. **Opening Bid**: Starts at 1 Au (or 0 Au).
2. **Rotation**: Proceeds sequentially among active bidders.
3. **Actions**:
   - **Raise**: Increase the high bid by at least +1 Au (up to player's current gold balance).
   - **Fold**: Permanently exit the auction.
4. **Resolution**: When all other players fold, the remaining high bidder pays the bid amount to the bank and receives the Property Card into their inventory.

---

## 6. Playable Locals (Character Abilities)

| Character | Title | Starting Powers | Starting Re-rolls | Starting Extra Turns | Special Ability |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **BRIGHT SHELL** | Jaega Tribe | 0 | **6** | 0 | **Passive**: No active power, but starts with 6 Re-rolls. |
| **LEJA** | The Pop Artist | 3 | 2 | 1 | **Free Action**: Move top card of 1 Luxury Pile to the bottom, revealing the new top card. Any tax counters remain. |
| **ROXANA** | The Actress | 2 | 3 | 0 | **Free Action**: Collect 10 Au before Spanish River auction. Spend 1 counter to force any player to skip their next turn. |
| **ADDISON** | The Architect | 0 | 1 | 2 | **Passive**: Receives 10 Au (instead of 5 Au) on row and column line bonuses. |
| **MR. FLAGLER** | The Industrialist | 0 | 2 | 1 | **Passive**: Starts with 10 Au. Takes an extra turn on Turn 1 without spending an Extra Turn counter. |
| **KINGSTON** | The Tennis Player | 0 | 2 | 2 | **Passive**: Receives +1 extra Au whenever flipping a Waterfront card. |
| **MS. POST** | The Heiress | 3 | 1 | 1 | **Free Action**: Collect 20 Au before Mar-a-Lago auction. Spend counters to place a +2 Au tax on Luxury Piles for opponents. |
| **ERIC** | The Tech Mogul | 1 | 2 | 0 | **Turn Action**: Flip up to 3 Waterfront Cards and receive 8 Au. *Interruption Rule: If any flip triggers an Auction, power ends immediately and remaining flips are lost.* |
| **CARINA** | The Golfer | 3 | 2 | 1 | **Free Action**: Collect 10 Au before Gulf Stream auction. Place counters on face-down Blocks/Waterfronts; other players must roll 5 or 6 to flip them. |
| **SILVIANO** | The Fashion Designer | 3 | 3 | 0 | **Free Action**: Spend 1 counter to buy or roll for an extra Luxury Card (must pick a Map card first). |

---

## 7. AI Bot Roster (The Visitors)

The 10 Visitors feature progressive difficulty scaling:

| Visitor | Difficulty | AI Depth | Personality | Re-rolls | Playstyle |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Goober** | 1 (Low) | LOW | Balanced | 0 | Unpredictable, simple moves, ignores deep synergy. |
| **Superboy** | 2 (Low) | LOW | Balanced | 0 | Enthusiastic, targets obvious cards, buys early. |
| **Surfer Dude** | 3 (Low) | LOW | Aggressive | 0 | Coastal focus; takes high risks on Lagoon and Atlantic. |
| **Boss Cat** | 4 (Med) | MEDIUM | Cautious | 0 | Hoards wealth, avoids low-probability dice checks. |
| **Robot** | 5 (Med) | MEDIUM | Balanced | 0 | Pure mathematical expected-value optimizer. |
| **Pirate** | 6 (Med) | MEDIUM | Aggressive | 0 | High bidding, aggressive dice gambits on coastal waters. |
| **Flamingo Queen** | 7 (High)| FULL | Balanced | 0 | Adaptive multi-threat, dynamically pivots to race leaders. |
| **Magician** | 8 (High)| FULL | Aggressive | **1** | Uses re-rolls aggressively to force high-value flips. |
| **The Twins** | 9 (High)| FULL | Balanced | **3** | High recovery capacity, efficient luxury collection. |
| **Gran Gran** | 10 (High)| FULL | Cautious | **6** | Elite strategic AI; pristine gold management and auction timing. |

---

## 8. Win & Loss Conditions

### 8.1 Standard / Custom Match
A standard match ends immediately upon either of two triggers:
1. **Map Completed**: Every playable cell on the 8×9 board has been flipped (`state.grid.every(c => c.flipped || c.empty)`).
2. **Prestige Exhaustion**: All 3 Luxury Decks are completely sold out (`cards.length === 0`) AND both Property Auctions have concluded (`bothAuctionsDone`).

#### Winner Determination Algorithm:
1. **Primary Score**: The player with the highest total **Prestige Points** wins.
2. **Tiebreaker 1 (Mar-a-Lago)**: If tied, the player who owns the **Mar-a-Lago Property Card** wins.
3. **Tiebreaker 2 (Highest Wealth)**: If still tied, the tied player with the highest remaining **Gold (Au)** wins.

### 8.2 Gambit Campaign Matches
Gambits can feature non-standard victory conditions:
- **Mid-Game Races**: Reaching a set Prestige target (e.g. 10 or 12 pts) first. If an opponent reaches it first, the player loses immediately.
- **Specific Card Acquisition**: Winning while holding specific Luxury Cards (e.g. Designer Handbag or Diamond Rings).
- **Region Objectives**: Flipping all Atlantic, Lagoon, or Block cells before match end.
- **Early Impossibility Detection**: The engine calculates if required cards are exhausted; if a solo objective becomes mathematically impossible, an "Objective Impossible" prompt allows early surrender.

---

## 9. Rules Verification & Open Questions

### Verified Facts (from Source Code):
- Dice rolls are strictly 1d6 integer rolls from 1 to 6.
- The 16 central auction cells cannot be flipped as standard map cards.
- Line bonuses are strictly awarded to the single player whose move completed the 9th cell of a row or 8th cell of a column.
- Re-roll counters are persistent across turns until consumed; they do not regenerate each round unless granted by specific 1-point luxury card effects.

### Ambiguities / Edge Cases to Note:
1. *Multiplayer Local Matches*: While the code supports local multi-human play (`humans: 2-4`), UI focus and prompt flows are heavily optimized for 1 Human vs Bots.
2. *Simultaneous Line Completions*: If a move simultaneously completes both a Row and a Column, the engine queues two separate sequential wave animations and awards 10 Au total (or 20 Au for Addison).
