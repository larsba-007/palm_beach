// Palm Beach rules: the fixed facts of the game (cards, characters, numbers).
// Source of truth: docs/palm_beach/rules-palm-beach.md and the printed rulebook v1.0.
// Pure data: no screen code, no browser. Every edition (Web, Steam) uses this file.

export const ROUNDS = 8;
export const START_GOLD = 5;
export const DIAMOND_TRADE_COST = 4;          // Mr. Flagler: 3 (see CHARACTERS)
export const MIN_BID = 1;
export const MIN_PLAYERS = 1;                 // 1 = solo against the Automa (version 3)
export const MAX_PLAYERS = 5;

// The four Map Card types (what the rules call them).
export const CARD_TYPES = Object.freeze({
    LAGOON: 'LAGOON',
    WATERFRONT: 'WATERFRONT',
    BLOCK: 'BLOCK',
    ATLANTIC: 'ATLANTIC'
});

// What each type needs and gives. minRoll null = no die roll.
export const CARD_RULES = Object.freeze({
    LAGOON:     { minRoll: 4,    gold: 8, diamonds: 0 },
    ATLANTIC:   { minRoll: 3,    gold: 6, diamonds: 0 },
    WATERFRONT: { minRoll: null, gold: 0, diamonds: 1 },
    BLOCK:      { minRoll: null, gold: 3, diamonds: 0 }
});

// The five card backs (Waterfront has a Lagoon-side and an Atlantic-side back). Each back is shuffled on its own.
export const DECKS = Object.freeze({
    LAGOON: 'LAGOON',
    WF_LAGOON: 'WF_LAGOON',
    BLOCK: 'BLOCK',
    WF_ATLANTIC: 'WF_ATLANTIC',
    ATLANTIC: 'ATLANTIC'
});

const DECK_TO_TYPE = {
    LAGOON: CARD_TYPES.LAGOON,
    WF_LAGOON: CARD_TYPES.WATERFRONT,
    BLOCK: CARD_TYPES.BLOCK,
    WF_ATLANTIC: CARD_TYPES.WATERFRONT,
    ATLANTIC: CARD_TYPES.ATLANTIC
};

// Rows 1-6: 9 cards. Rows 7-8: 5 cards (the Auction Map Card takes the place of four Blocks).
export const ROW_LAYOUT_LONG = Object.freeze([
    DECKS.LAGOON, DECKS.WF_LAGOON, DECKS.BLOCK, DECKS.BLOCK, DECKS.BLOCK, DECKS.BLOCK, DECKS.BLOCK, DECKS.WF_ATLANTIC, DECKS.ATLANTIC
]);
export const ROW_LAYOUT_SHORT = Object.freeze([
    DECKS.LAGOON, DECKS.WF_LAGOON, DECKS.BLOCK, DECKS.WF_ATLANTIC, DECKS.ATLANTIC
]);
export const SHORT_ROWS = Object.freeze([7, 8]);

export function rowLayout(round) {
    return SHORT_ROWS.includes(round) ? ROW_LAYOUT_SHORT : ROW_LAYOUT_LONG;
}

// Rounds 4 and 6 have two Luxury Cards; the others have one. 10 in all.
export function luxuryCardsInRound(round) {
    return (round === 4 || round === 6) ? 2 : 1;
}

// ---- The 64 Map Cards -------------------------------------------------------------------------
// spriteIndex = position in public/assets/map_cards_front.webp (row * 8 + column, 8 x 8 cards).
// Column 0 = Lagoon, 1 = Waterfront (Lagoon side), 2-5 = Block, 6 = Waterfront (Atlantic side), 7 = Atlantic.
// The yellow circles printed on the cards (assets_source/palm_beach_print/map_cards/_sprite_positions.csv):
const PRINTED_BONUS = {
    2: 5, 5: 5, 10: 5, 19: 5, 27: 5, 45: 5, 52: 5, 60: 5, 61: 5,      // 9 Block Bonus Cards
    15: 2, 16: 2, 21: 2, 34: 2, 44: 2, 49: 2, 51: 2, 59: 2,            // 8 landmarks with +2
    6: 1, 38: 1, 54: 1, 62: 1                                           // 4 landmarks with +1
};
const SPRITE_COLUMN_DECK = [DECKS.LAGOON, DECKS.WF_LAGOON, DECKS.BLOCK, DECKS.BLOCK, DECKS.BLOCK, DECKS.BLOCK, DECKS.WF_ATLANTIC, DECKS.ATLANTIC];

export const MAP_CARDS = Object.freeze(Array.from({ length: 64 }, (_, spriteIndex) => {
    const deck = SPRITE_COLUMN_DECK[spriteIndex % 8];
    const bonus = PRINTED_BONUS[spriteIndex] || 0;
    return Object.freeze({
        id: `map-${spriteIndex}`,
        spriteIndex,
        deck,
        type: DECK_TO_TYPE[deck],
        bonus,                              // extra gold in the yellow circle: 0, 1, 2 or 5
        isBlockBonus: bonus === 5           // the 9 "Block Bonus Cards" (Eric's power)
    });
}));

// ---- The 17 Luxury Cards ------------------------------------------------------------------------
// spriteIndex = position in public/assets/luxury_cards_front.webp (same order as the Boca file).
export const LUXURY_CARDS = Object.freeze([
    { id: 'lux-wine',        name: 'Wine',          points: 1, rerolls: 0, spriteIndex: 0 },
    { id: 'lux-shoes',       name: 'Shoes',         points: 1, rerolls: 0, spriteIndex: 1 },
    { id: 'lux-handbag',     name: 'Handbag',       points: 1, rerolls: 1, spriteIndex: 2 },
    { id: 'lux-watch',       name: 'Watch',         points: 1, rerolls: 1, spriteIndex: 3 },
    { id: 'lux-tiger',       name: 'Tiger',         points: 1, rerolls: 2, spriteIndex: 4 },
    { id: 'lux-rings',       name: 'Rings',         points: 2, rerolls: 0, spriteIndex: 5 },
    { id: 'lux-racing-yacht', name: 'Racing Yacht', points: 2, rerolls: 0, spriteIndex: 6 },
    { id: 'lux-racehorse',   name: 'Racehorse',     points: 2, rerolls: 0, spriteIndex: 7 },
    { id: 'lux-sports-car',  name: 'Sports Car',    points: 2, rerolls: 0, spriteIndex: 8 },
    { id: 'lux-gyrocopter',  name: 'Gyrocopter',    points: 2, rerolls: 0, spriteIndex: 9 },
    { id: 'lux-private-jet', name: 'Private Jet',   points: 2, rerolls: 0, spriteIndex: 10 },
    { id: 'lux-art-gallery', name: 'Art Gallery',   points: 2, rerolls: 0, spriteIndex: 11 },
    { id: 'lux-sports-team', name: 'Sports Team',   points: 3, rerolls: 0, spriteIndex: 12 },
    { id: 'lux-hotel',       name: 'Hotel',         points: 3, rerolls: 0, spriteIndex: 13 },
    { id: 'lux-rocket',      name: 'Rocket',        points: 3, rerolls: 0, spriteIndex: 14 },
    { id: 'lux-submarine',   name: 'Submarine',     points: 3, rerolls: 0, spriteIndex: 15 },
    { id: 'lux-superyacht',  name: 'Superyacht',    points: 3, rerolls: 0, spriteIndex: 16 }
].map(c => Object.freeze({ ...c, kind: 'LUXURY' })));

// ---- Property Cards and Auction Map Cards --------------------------------------------------------
export const PROPERTY_IDS = Object.freeze({
    MAR_A_LAGO: 'MAR_A_LAGO',
    GULF_STREAM: 'GULF_STREAM',
    SPANISH_RIVER: 'SPANISH_RIVER'
});

export const PROPERTY_CARDS = Object.freeze([
    { id: PROPERTY_IDS.MAR_A_LAGO,    name: 'Mar-a-Lago',              points: 4 },
    { id: PROPERTY_IDS.GULF_STREAM,   name: 'Gulf Stream Golf Course', points: 3 },
    { id: PROPERTY_IDS.SPANISH_RIVER, name: 'Spanish River Park',      points: 2 }
].map(c => Object.freeze({ ...c, kind: 'PROPERTY' })));

// One Auction Map Card per property. One of the three is drawn at setup; it decides which property is auctioned.
export const AUCTION_MAP_CARDS = Object.freeze(PROPERTY_CARDS.map(p => Object.freeze({
    id: `auction-map-${p.id}`,
    propertyId: p.id
})));

// ---- The 10 Palm Beach characters ---------------------------------------------------------------
// slot = position in public/assets/character_cards_print.webp (5 x 2 cards).
// initiative = the numbers R1..R8 printed on the card. Lowest starts the round.
// Powers are written as data so the rules code has no "if character is X" lines:
//   rollBonus       extra gold when the kept die roll on one of these card types is at least minRoll
//   propertyGold    gold collected just before that property's auction
//   blockBonusGold  gold from a Block Bonus Card's circle (instead of 5)
//   diamondTradeCost Diamonds needed for the automatic trade (instead of 4)
//   noRollTypes     card types this character flips without rolling
//   startPeek       what the character secretly looks at when spending the red counter at the start
export const CHARACTER_IDS = Object.freeze({
    EDITH: 'EDITH', ROXANA: 'ROXANA', ADDISON: 'ADDISON', FLAGLER: 'FLAGLER', KINGSTON: 'KINGSTON',
    POST: 'POST', ERIC: 'ERIC', BRIGHT_SHELL: 'BRIGHT_SHELL', CARINA: 'CARINA', SKIP: 'SKIP'
});

export const CHARACTERS = Object.freeze([
    { id: 'EDITH', slot: 0, name: 'Edith', title: 'The Flamingo Queen',
      ability: 'Spend the red counter at the start: secretly look at any 5 face-down Luxury Cards beside the rows.',
      powers: 1, rerolls: 0, diamonds: 1, initiative: [10, 50, 80, 70, 60, 50, 40, 95],
      startPeek: 'LUXURY_5' },
    { id: 'ROXANA', slot: 1, name: 'Roxana', title: 'The Actress',
      ability: 'Roll 5-6 on an Atlantic card: +5 Au extra. Collect 10 Au before the Spanish River Park auction.',
      powers: 0, rerolls: 0, diamonds: 0, initiative: [70, 20, 40, 60, 95, 60, 50, 80],
      rollBonus: { types: ['ATLANTIC'], minRoll: 5, gold: 5 },
      propertyGold: { propertyId: 'SPANISH_RIVER', gold: 10 } },
    { id: 'ADDISON', slot: 2, name: 'Addison', title: 'The Architect',
      ability: 'Roll a 6 on an Atlantic or Lagoon card: +5 Au extra.',
      powers: 0, rerolls: 2, diamonds: 0, initiative: [95, 95, 95, 95, 30, 30, 30, 30],
      rollBonus: { types: ['ATLANTIC', 'LAGOON'], minRoll: 6, gold: 5 } },
    { id: 'FLAGLER', slot: 3, name: 'Mr. Flagler', title: 'The Industrialist',
      ability: 'Trade 3 Diamonds (instead of 4) for a Luxury Card.',
      powers: 0, rerolls: 0, diamonds: 0, initiative: [90, 90, 90, 80, 10, 95, 90, 50],
      diamondTradeCost: 3 },
    { id: 'KINGSTON', slot: 4, name: 'Kingston', title: 'The Tennis Player',
      ability: 'Spend the red counter at the start: secretly look at the Auction Map Card.',
      powers: 1, rerolls: 0, diamonds: 1, initiative: [40, 10, 20, 50, 80, 90, 70, 60],
      startPeek: 'AUCTION_MAP' },
    { id: 'POST', slot: 5, name: 'Ms. Post', title: 'The Heiress',
      ability: 'Collect 15 Au before the Mar-a-Lago auction.',
      powers: 0, rerolls: 1, diamonds: 0, initiative: [80, 40, 10, 90, 40, 70, 80, 40],
      propertyGold: { propertyId: 'MAR_A_LAGO', gold: 15 } },
    { id: 'ERIC', slot: 6, name: 'Eric', title: 'The Tech Mogul',
      ability: '10 Au instead of 5 for a Block Bonus Card.',
      powers: 0, rerolls: 0, diamonds: 0, initiative: [20, 30, 70, 10, 90, 40, 60, 90],
      blockBonusGold: 10 },
    { id: 'BRIGHT_SHELL', slot: 7, name: 'Bright Shell', title: 'Jaega Tribe',
      ability: 'Very low initiative numbers: starts most rounds.',
      powers: 0, rerolls: 1, diamonds: 0, initiative: [30, 60, 30, 30, 20, 20, 20, 10] },
    { id: 'CARINA', slot: 8, name: 'Carina', title: 'The Golfer',
      ability: 'Roll 5-6 on a Lagoon card: +5 Au extra. Collect 10 Au before the Gulf Stream auction.',
      powers: 0, rerolls: 0, diamonds: 0, initiative: [50, 80, 50, 20, 70, 80, 10, 70],
      rollBonus: { types: ['LAGOON'], minRoll: 5, gold: 5 },
      propertyGold: { propertyId: 'GULF_STREAM', gold: 10 } },
    { id: 'SKIP', slot: 9, name: 'Skip', title: 'Reef Road Waterman',
      ability: 'Flip Atlantic cards without rolling the die.',
      powers: 0, rerolls: 0, diamonds: 0, initiative: [60, 70, 60, 40, 50, 10, 95, 20],
      noRollTypes: ['ATLANTIC'] }
].map(c => Object.freeze(c)));

export function getCharacter(characterId) {
    const character = CHARACTERS.find(c => c.id === characterId);
    if (!character) throw new Error(`Unknown character: ${characterId}`);
    return character;
}

// Version 1 (web, hot seat): Lars's decision 25 Nov 2026. The other five are locked.
export const V1_CHARACTER_IDS = Object.freeze(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA', 'SKIP']);

// ---- Game variations ----------------------------------------------------------------------------
export const VARIATIONS = Object.freeze({
    LAKE_WORTH: 'LAKE_WORTH',         // standard: all Luxury Cards and the Auction Map Card face down
    JUPITER_INLET: 'JUPITER_INLET',   // rounds 4 and 6: the second Luxury Card lies face up from the start
    PEANUT_ISLAND: 'PEANUT_ISLAND'    // the Auction Map Card lies face up; Kingston is removed
});
