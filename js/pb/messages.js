// Palm Beach table: the words shown on screen during a match.
// Plain functions with no screen code, so the tests can read them and Lars's texts live in one place.

import { ROUNDS, CARD_RULES, DIAMOND_TRADE_COST, MIN_BID, getCharacter } from '../rules/data.js';
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

// ---- Final scoring screen and cheat sheet (step 1.6) --------------------------------------------------

const TIEBREAK_TEXT = {
    POINTS: 'Most Prestige Points.',
    PROPERTY: 'Tied on Prestige Points: the tied player holding the Property Card wins.',
    GOLD: 'Tied on Prestige Points, and no tied player holds the Property Card: most gold left wins.',
    SHARED: 'Tied on Prestige Points and on gold: the victory is shared.'
};

/**
 * The final scoring table: winners first, then by Prestige Points, Property Card and gold.
 * @returns {{title: string, how: string, rows: object[]}}
 */
export function finalScoreTable(result) {
    const winners = new Set(result.winners);
    const ordered = result.scores.slice().sort((a, b) =>
        (winners.has(b.playerId) - winners.has(a.playerId))
        || (b.prestige - a.prestige)
        || (b.hasProperty - a.hasProperty)
        || (b.gold - a.gold)
        || (a.playerId - b.playerId));
    const rows = ordered.map((s, index) => ({
        ...s,
        isWinner: winners.has(s.playerId),
        place: winners.has(s.playerId) ? 1 : index + 1
    }));
    const names = rows.filter(r => r.isWinner).map(r => r.name.toUpperCase());
    return {
        title: `${names.join(' & ')} ${names.length === 1 ? 'WINS' : 'SHARE THE VICTORY'}`,
        how: TIEBREAK_TEXT[result.decidedBy],
        rows
    };
}


/** The cheat sheet: the Palm Beach reward table and the short rules, with the numbers taken from the rules engine. */
export function cheatSheet() {
    const roll = (type) => (CARD_RULES[type].minRoll ? `Roll ${CARD_RULES[type].minRoll}–6` : 'No roll');
    const reward = (type) => (CARD_RULES[type].diamonds ? `${CARD_RULES[type].diamonds} Diamond` : `${CARD_RULES[type].gold} Au`);
    return {
        title: 'REWARDS AND RULES',
        table: [
            ['LAGOON', roll('LAGOON'), reward('LAGOON')],
            ['ATLANTIC', roll('ATLANTIC'), reward('ATLANTIC')],
            ['WATERFRONT', roll('WATERFRONT'), reward('WATERFRONT')],
            ['BLOCK', roll('BLOCK'), reward('BLOCK')]
        ],
        lines: [
            'Yellow circle on a card: +5, +2 or +1 Au extra, paid when the card is flipped.',
            'Failed roll: the card stays face down. Spend a yellow re-roll counter to roll again.',
            `${DIAMOND_TRADE_COST} Diamonds (Mr. Flagler ${getCharacter('FLAGLER').diamondTradeCost}): trade them at once for a Luxury Card.`,
            `Auction after every row: lowest bid ${MIN_BID} Au, raise by at least 1 Au, never bid more than you have. Pass and you are out.`,
            'After round 8: the Property Auction. Most Prestige Points wins; a tie goes to the Property Card, then to the most gold.'
        ]
    };
}
