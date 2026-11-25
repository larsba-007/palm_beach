// Palm Beach table: the words shown on screen during a match.
// Plain functions with no screen code, so the tests can read them and Lars's texts live in one place.

import { ROUNDS } from '../rules/data.js';
import { initiativeOf } from '../rules/initiative.js';

const TYPE_NAMES = { LAGOON: 'Lagoon', ATLANTIC: 'Atlantic', WATERFRONT: 'Waterfront', BLOCK: 'Block' };
export const nameOf = (game, playerId) => game.players[playerId].name;

/** Lars, 25 Nov 2026: "You have 4 diamonds. Trade in for a Luxury Card." with an OK button. */
export function diamondTradeMessage(request) {
    return { title: 'DIAMOND TRADE', text: `You have ${request.cost} diamonds. Trade in for a Luxury Card.`, ok: 'OK' };
}

export function rerollMessage(request, cardType) {
    const left = request.rerollsLeft;
    return {
        title: `YOU ROLLED ${request.roll}`,
        text: `${TYPE_NAMES[cardType]} needs ${request.needed} or more. Spend a re-roll and roll again? You have ${left} re-roll${left === 1 ? '' : 's'}.`,
        yes: 'RE-ROLL',
        no: 'NO THANKS'
    };
}

export function roundStartMessage(game, round) {
    const starter = game.players[game.startPlayer];
    return `ROUND ${round}: ${starter.name.toUpperCase()} STARTS (${initiativeOf(starter.characterId, round)})`;
}

export function statusText(game) {
    const phase = { FLIPPING: 'FLIP CARDS', LUXURY_AUCTION: 'LUXURY AUCTION', PROPERTY_AUCTION: 'PROPERTY AUCTION', GAME_OVER: 'GAME OVER' }[game.phase] || '';
    const left = game.round ? `ROUND ${game.round} OF ${ROUNDS}${phase ? ` · ${phase}` : ''}` : '';
    const right = (game.currentPlayer !== null && game.phase === 'FLIPPING') ? `${nameOf(game, game.currentPlayer).toUpperCase()}: CHOOSE A CARD IN ROW ${game.round}` : '';
    return { left, right };
}

/** What the player gets, in words: "8 Au", "1 Diamond + 1 Au". */
export function rewardText(reward) {
    const parts = [];
    if (reward.diamonds) parts.push(`${reward.diamonds} Diamond${reward.diamonds === 1 ? '' : 's'}`);
    if (reward.gold) parts.push(`${reward.gold} Au`);
    return parts.join(' + ');
}
