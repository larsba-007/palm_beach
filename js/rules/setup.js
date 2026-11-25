// Palm Beach rules: setting up a new game (rulebook p4-5, "Game setup").
// Pure: no screen code. Returns one plain "game" object that holds everything about the game.

import {
    ROUNDS, START_GOLD, MIN_PLAYERS, MAX_PLAYERS, MAP_CARDS, LUXURY_CARDS, PROPERTY_CARDS, AUCTION_MAP_CARDS,
    VARIATIONS, DECKS, rowLayout, luxuryCardsInRound, getCharacter
} from './data.js';
import { createRng } from './rng.js';

/**
 * Creates a new game, ready for round 1.
 * @param {object} options
 * @param {{name: string, characterId: string}[]} options.players  in seating order (clockwise)
 * @param {object} [options.rng]        random source (see rng.js); default: a new one
 * @param {string} [options.variation]  one of VARIATIONS; default Lake Worth
 */
export function createGame({ players, rng = createRng(), variation = VARIATIONS.LAKE_WORTH } = {}) {
    if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
        throw new Error(`Palm Beach is for ${MIN_PLAYERS}-${MAX_PLAYERS} players.`);
    }
    if (!Object.values(VARIATIONS).includes(variation)) throw new Error(`Unknown variation: ${variation}`);
    const characterIds = players.map(p => p.characterId);
    if (new Set(characterIds).size !== characterIds.length) throw new Error('Two players cannot play the same character.');
    if (variation === VARIATIONS.PEANUT_ISLAND && characterIds.includes('KINGSTON')) {
        throw new Error('Peanut Island: remove Kingston before choosing characters.');
    }

    // 1. Map Cards: sort by back, shuffle each type, lay out the 8 rows face down.
    const piles = {};
    for (const deck of Object.values(DECKS)) piles[deck] = rng.shuffle(MAP_CARDS.filter(c => c.deck === deck));
    const rows = [];
    for (let round = 1; round <= ROUNDS; round++) {
        rows.push(rowLayout(round).map((deck, position) => ({ ...piles[deck].pop(), row: round, position, faceUp: false })));
    }

    // 2. Auction Map Card: 1 of 3 at random; the other two go back to the box unseen.
    const auctionMapCard = { ...rng.shuffle(AUCTION_MAP_CARDS)[0], faceUp: variation === VARIATIONS.PEANUT_ISLAND };

    // 3. Luxury Cards: 10 beside the rows (two beside rows 4 and 6), 7 in the pile for Diamond trades.
    const luxuryDeck = rng.shuffle(LUXURY_CARDS).map(c => ({ ...c }));
    const luxuryByRound = [];
    for (let round = 1; round <= ROUNDS; round++) {
        const slots = [];
        for (let i = 0; i < luxuryCardsInRound(round); i++) {
            const secondCard = i === 1;
            slots.push({
                slotId: `lux-r${round}-${i + 1}`,
                round,
                card: luxuryDeck.pop(),
                faceUp: variation === VARIATIONS.JUPITER_INLET && secondCard,
                sold: false
            });
        }
        luxuryByRound.push(slots);
    }
    const tradePile = luxuryDeck;      // the 7 cards left, face down

    // 5-6. Players: 5 Au, plus the counters and Diamonds shown on the character card.
    const gamePlayers = players.map((p, seat) => {
        const character = getCharacter(p.characterId);
        return {
            id: seat,                  // seat number; play goes clockwise = rising seat number
            name: p.name || `Player ${seat + 1}`,
            characterId: character.id,
            gold: START_GOLD,
            powers: character.powers,  // red counters
            rerolls: character.rerolls, // yellow counters
            diamonds: character.diamonds,
            luxuryCards: [],
            property: null,
            peeked: null               // what Kingston or Edith secretly saw at the start
        };
    });

    return {
        game: 'PALM_BEACH',
        variation,
        phase: 'SETUP',                // SETUP, FLIPPING, LUXURY_AUCTION, PROPERTY_AUCTION, GAME_OVER
        round: 0,                      // 1-8 while playing
        startPlayer: null,             // seat of the player who started the current round
        currentPlayer: null,           // seat of the player whose turn it is
        players: gamePlayers,
        rows,                          // rows[0] is row 1
        luxuryByRound,                 // luxuryByRound[0] is round 1
        tradePile,
        auctionMapCard,
        propertyCards: PROPERTY_CARDS.map(c => ({ ...c })),
        property: null,                // the Property Card that is auctioned (known when the Auction Map Card is flipped)
        discardedProperties: [],
        unsoldLuxury: [],              // Luxury Cards nobody bid on (removed from the game)
        propertyUnsold: false,
        result: null                   // final scoring
    };
}

export function getPlayer(game, playerId) {
    const player = game.players[playerId];
    if (!player) throw new Error(`Unknown player: ${playerId}`);
    return player;
}
