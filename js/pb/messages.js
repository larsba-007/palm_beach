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

// ---- Auctions (step 1.5) ----------------------------------------------------------------------------
// Lars, 25 Nov 2026: "You always have to bid at least +1 Au. Use the same system as for Boca":
// buttons that raise the highest bid by 1, 3 or 5 Au, and a button to pass.
export const RAISE_STEPS = Object.freeze([1, 3, 5]);

/**
 * The buttons a bidder gets. A raise the player cannot afford is shown but switched off.
 * @param {{highBid: number, highBidder: number|null, minBid: number, maxBid: number}} request  the engine's BID request
 */
export function bidChoices(request) {
    const base = request.highBidder === null ? 0 : request.highBid;
    const first = request.highBidder === null;
    return RAISE_STEPS.map(step => {
        const amount = base + step;
        return {
            step,
            amount,
            label: first ? `BID ${amount}` : `RAISE +${step}`,
            hint: `${amount} Au`,
            enabled: amount >= request.minBid && amount <= request.maxBid
        };
    });
}

export function auctionTitle(game, kind) {
    return kind === 'PROPERTY' ? 'PROPERTY AUCTION' : `LUXURY AUCTION · ROUND ${game.round}`;
}

export function cardLine(card) {
    return `${card.name.toUpperCase()} · ${card.points} PRESTIGE POINT${card.points === 1 ? '' : 'S'}`;
}

export function highBidText(game, auction) {
    if (auction.highBidder === null) return { amount: 'NO BID YET', who: 'The lowest bid is 1 Au' };
    return { amount: `${auction.highBid} Au`, who: `Highest bid: ${nameOf(game, auction.highBidder)}` };
}

export function bidTurnText(game, request) {
    return `${nameOf(game, request.playerId).toUpperCase()}: BID OR PASS. YOU HAVE ${request.maxBid} Au.`;
}

/** One line per player in bidding order: still in, passed, or holding the highest bid. */
export function bidderStatuses(game, auction) {
    return auction.order.map(seat => ({
        playerId: seat,
        name: nameOf(game, seat),
        gold: game.players[seat].gold,
        status: auction.highBidder === seat ? 'HIGHEST' : (auction.active.includes(seat) ? 'IN' : 'PASSED'),
        isTurn: auction.turn === seat
    }));
}

export function auctionWonText(game, e) {
    return `${nameOf(game, e.playerId).toUpperCase()} WINS ${e.kind === 'PROPERTY' ? '' : 'THE '}${e.card.name.toUpperCase()} FOR ${e.price} Au`;
}

export function auctionUnsoldText(e) {
    return e.kind === 'PROPERTY'
        ? `NOBODY BID. NO ONE GETS ${e.card.name.toUpperCase()}.`
        : `NOBODY BID. THE ${e.card.name.toUpperCase()} IS REMOVED FROM THE GAME.`;
}

export function forcedPassText(game, playerId) {
    return `${nameOf(game, playerId).toUpperCase()} CANNOT AFFORD A HIGHER BID AND PASSES`;
}

/** The lines of the end-of-game box (the full scoring screen is step 1.6). */
export function gameOverText(result) {
    const names = result.winners.map(id => result.scores[id].name);
    const how = { POINTS: 'most Prestige Points', PROPERTY: 'tie, won by the Property Card', GOLD: 'tie, won by most gold left', SHARED: 'shared victory' }[result.decidedBy];
    const scores = result.scores.map(s => `${s.name}: ${s.prestige} Prestige Points, ${s.gold} Au`).join('  ·  ');
    return { title: `${names.join(' & ').toUpperCase()} WIN${names.length === 1 ? 'S' : ''}`, text: `${scores}. (${how}.)` };
}
