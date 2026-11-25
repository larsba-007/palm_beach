// Helpers for the Palm Beach rules tests (not a test file itself).
import assert from 'node:assert/strict';
import * as R from '../js/rules/index.js';

export { assert, R };

let count = 0;
/** Runs one named check and prints a line for it. */
export async function check(name, fn) {
    count += 1;
    try {
        await fn();
        console.log(`✓ ${String(count).padStart(2, ' ')}. ${name}`);
    } catch (error) {
        console.error(`✗ ${String(count).padStart(2, ' ')}. ${name}`);
        throw error;
    }
}

/** A new game with these characters, in seating order. */
export function newGame(characterIds, { seed = 1, variation } = {}) {
    const rng = R.createRng(seed);
    const game = R.createGame({ players: characterIds.map((characterId, i) => ({ name: `P${i + 1}`, characterId })), rng, variation });
    return { game, rng };
}

/** The first face-down card of a type in the current row. */
export function cardOfType(game, type, round = game.round) {
    return R.faceDownCards(game, round).find(c => c.type === type);
}

/** A made-up card for reward tests. */
export function fakeCard(type, bonus = 0) {
    return { id: `fake-${type}-${bonus}`, type, bonus, isBlockBonus: bonus === 5, row: 1, faceUp: false };
}

/** A made-up player for reward tests. */
export function fakePlayer(characterId, extra = {}) {
    const c = R.getCharacter(characterId);
    return { id: 0, name: c.name, characterId, gold: R.START_GOLD, powers: c.powers, rerolls: c.rerolls, diamonds: c.diamonds, luxuryCards: [], property: null, ...extra };
}

/**
 * A simple scripted player for whole games: flips the first face-down card, re-rolls when it can,
 * and bids up to "limit(request, game)" Au.
 */
export function scriptedPlayer({ limit = () => 0, chooseCard = (r) => r.options[0], reroll = () => true, log = null } = {}) {
    return (request, game) => {
        if (log) log.push(request);
        switch (request.type) {
            case 'CHOOSE_CARD': return chooseCard(request, game);
            case 'REROLL': return reroll(request, game);
            case 'BID': {
                const max = Math.min(limit(request, game), request.maxBid);
                return request.minBid <= max ? { action: 'BID', amount: request.minBid } : { action: 'PASS' };
            }
            case 'CHOOSE_LUXURY_PEEK': return request.options.slice(0, request.count);
            default: return true;
        }
    };
}
