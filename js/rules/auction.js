// Palm Beach rules: one auction (rulebook p10, "Luxury Auction"; the Property Auction uses the same rules).
//
// - The start player bids first or passes. Going clockwise, each player raises or passes.
// - The lowest bid is 1 Au; each raise is at least 1 Au more.
// - Once you pass, you are out of this auction.
// - You can never bid more gold than you have.
// - When one bidder is left, they pay the Bank and take the card.
// - If everyone passes, nobody gets the card (Lars: a Luxury Card is removed unsold; a Property Card is discarded).
//
// Pure: this file only keeps track of one auction. Paying and handing over the card happen in engine.js.

import { MIN_BID } from './data.js';

/**
 * @param {number[]} order  seats in bidding order: the start player first, then clockwise
 */
export function createAuction(order) {
    if (!order.length) throw new Error('An auction needs at least one bidder.');
    return {
        order: order.slice(),
        active: order.slice(),      // seats still in the auction
        highBid: 0,
        highBidder: null,
        turn: order[0],             // seat whose turn it is to bid or pass
        done: false,
        winner: null                // seat of the winner; null when done = nobody bid
    };
}

/** The lowest bid the next bidder may make. */
export function minimumBid(auction) {
    return auction.highBidder === null ? MIN_BID : auction.highBid + 1;
}

/** True if a player with this much gold can still bid. */
export function canBid(auction, gold) {
    return gold >= minimumBid(auction);
}

function advance(auction, fromSeat) {
    // Finished? One bidder left who has bid, or nobody left.
    if (auction.active.length === 0) {
        auction.done = true;
        auction.turn = null;
        return;
    }
    if (auction.active.length === 1 && auction.highBidder === auction.active[0]) {
        auction.done = true;
        auction.winner = auction.highBidder;
        auction.turn = null;
        return;
    }
    // Next seat clockwise (in bidding order) that is still in.
    const start = auction.order.indexOf(fromSeat);
    for (let step = 1; step <= auction.order.length; step++) {
        const seat = auction.order[(start + step) % auction.order.length];
        if (auction.active.includes(seat)) {
            auction.turn = seat;
            return;
        }
    }
}

/** The player whose turn it is makes a bid. */
export function placeBid(auction, seat, amount, gold) {
    if (auction.done) throw new Error('The auction is over.');
    if (seat !== auction.turn) throw new Error(`It is not player ${seat}'s turn to bid.`);
    if (!Number.isInteger(amount)) throw new Error('A bid must be a whole number of Au.');
    if (amount < minimumBid(auction)) throw new Error(`The bid must be at least ${minimumBid(auction)} Au.`);
    if (amount > gold) throw new Error('You can never bid more gold than you have.');
    auction.highBid = amount;
    auction.highBidder = seat;
    advance(auction, seat);
}

/** The player whose turn it is passes and is out of this auction. */
export function passBid(auction, seat) {
    if (auction.done) throw new Error('The auction is over.');
    if (seat !== auction.turn) throw new Error(`It is not player ${seat}'s turn.`);
    auction.active = auction.active.filter(s => s !== seat);
    advance(auction, seat);
}
