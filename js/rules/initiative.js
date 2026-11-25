// Palm Beach rules: who starts each round (rulebook p7 and p11, "Initiative").
// The lowest initiative number for the round starts the round and bids first in the auction(s).

import { ROUNDS, CHARACTERS, getCharacter } from './data.js';

/** The initiative number printed on a character card for a round (1-8). */
export function initiativeOf(characterId, round) {
    if (!Number.isInteger(round) || round < 1 || round > ROUNDS) throw new Error(`Round must be 1-${ROUNDS}.`);
    return getCharacter(characterId).initiative[round - 1];
}

/** The seat of the player who starts the round. */
export function startPlayerForRound(game, round) {
    let best = null;
    for (const player of game.players) {
        const number = initiativeOf(player.characterId, round);
        if (best && number === best.number) {
            // Lars, 25 Nov 2026: two characters with the same number in a round is a bug, not a rule.
            throw new Error(`Initiative tie in round ${round}: ${best.player.characterId} and ${player.characterId} both have ${number}.`);
        }
        if (!best || number < best.number) best = { player, number };
    }
    return best.player.id;
}

/** Seats in playing order: the start player first, then clockwise. */
export function turnOrder(game, startPlayer) {
    const count = game.players.length;
    return Array.from({ length: count }, (_, i) => (startPlayer + i) % count);
}

/** The seat to the left of this one (next clockwise). */
export function nextSeat(game, seat) {
    return (seat + 1) % game.players.length;
}

/** Checks the printed table: no two characters share a number in any round. Returns the list of clashes (empty = fine). */
export function findInitiativeClashes(characters = CHARACTERS) {
    const clashes = [];
    for (let round = 1; round <= ROUNDS; round++) {
        const seen = new Map();
        for (const c of characters) {
            const number = c.initiative[round - 1];
            if (seen.has(number)) clashes.push({ round, number, characters: [seen.get(number), c.id] });
            seen.set(number, c.id);
        }
    }
    return clashes;
}
