// Palm Beach rules: the game from start to finish.
//
// This file runs the 8 rounds, the auctions and the final scoring. It never draws anything and never
// assumes a human. Every decision goes through ONE function, "askPlayer":
//
//   - Version 1 (hot seat): the screen answers with the player's clicks.
//   - Version 2 (tutorial): a lesson script answers.
//   - Version 3 (AI): an AI answers.
//
// askPlayer(request, game) may return the answer directly or as a Promise. The requests:
//
//   { type: 'CHOOSE_CARD',  playerId, round, options: [cardId] }            -> cardId
//   { type: 'REROLL',       playerId, cardId, roll, needed, rerollsLeft }   -> true / false
//   { type: 'DIAMOND_TRADE', playerId, diamonds, cost }                     -> anything (the player presses OK)
//   { type: 'BID',          playerId, kind, card, highBid, highBidder, minBid, maxBid }
//                                                          -> { action: 'BID', amount } or { action: 'PASS' }
//   { type: 'PEEK_AUCTION_MAP', playerId, propertyId }                      -> anything (Kingston has looked)
//   { type: 'CHOOSE_LUXURY_PEEK', playerId, count, options: [slotId] }      -> [slotId] (Edith chooses 5)
//   { type: 'SHOW_LUXURY_PEEK', playerId, cards: [{slotId, card}] }         -> anything (Edith has looked)
//
// "emit(event, game)" tells the screen what just happened (for animations, sounds and the log). It may
// return a Promise; the game waits for it, so an animation can finish before the game goes on.

import { ROUNDS, getCharacter } from './data.js';
import { createRng } from './rng.js';
import { startPlayerForRound, turnOrder, nextSeat } from './initiative.js';
import { faceDownCards, isRowComplete, findCard, rollNeeded, rollSucceeds, applyFlip, canReroll, spendReroll } from './flipping.js';
import { diamondTradeCost, mustTradeDiamonds, tradeDiamonds, giveLuxuryCard } from './diamonds.js';
import { createAuction, minimumBid, canBid, placeBid, passBid } from './auction.js';
import { finalScoring } from './scoring.js';

const noEvents = () => {};

/** Plays a whole game. Returns the final scoring. */
export async function playGame(game, askPlayer, { rng = createRng(), emit = noEvents } = {}) {
    const ctx = { game, askPlayer, rng, emit };
    await playStartPowers(ctx);
    for (let round = 1; round <= ROUNDS; round++) {
        await playRound(ctx, round);
    }
    await playPropertyAuction(ctx);
    return endGame(ctx);
}

// ---- Start of the game: Kingston and Edith spend their red counter (rulebook p5 and p12) -------------
export async function playStartPowers(ctx) {
    const { game, askPlayer, emit } = ctx;
    for (const player of game.players) {
        const peek = getCharacter(player.characterId).startPeek;
        if (!peek || player.powers < 1) continue;
        player.powers -= 1;      // a spent counter goes back to the box

        if (peek === 'AUCTION_MAP') {
            player.peeked = { auctionMapPropertyId: game.auctionMapCard.propertyId };
            await askPlayer({ type: 'PEEK_AUCTION_MAP', playerId: player.id, propertyId: game.auctionMapCard.propertyId }, game);
        } else if (peek === 'LUXURY_5') {
            const slots = game.luxuryByRound.flat();
            const count = Math.min(5, slots.length);
            const chosen = await askPlayer({ type: 'CHOOSE_LUXURY_PEEK', playerId: player.id, count, options: slots.map(s => s.slotId) }, game);
            if (!Array.isArray(chosen) || chosen.length !== count || new Set(chosen).size !== count
                || !chosen.every(id => slots.some(s => s.slotId === id))) {
                throw new Error(`Edith must choose ${count} different Luxury Cards beside the rows.`);
            }
            const cards = chosen.map(slotId => ({ slotId, card: slots.find(s => s.slotId === slotId).card }));
            player.peeked = { luxury: cards.map(c => ({ slotId: c.slotId, cardId: c.card.id })) };
            await askPlayer({ type: 'SHOW_LUXURY_PEEK', playerId: player.id, cards }, game);
        }
        await emit({ type: 'START_POWER_USED', playerId: player.id, peek }, game);
    }
}

// ---- One round: initiative, card flipping phase, Luxury Auction(s) ---------------------------------
export async function playRound(ctx, round) {
    await startRound(ctx, round);
    await playFlippingPhase(ctx);
    await playLuxuryAuctions(ctx);
    await ctx.emit({ type: 'ROUND_END', round }, ctx.game);
}

/** The start of a round: the lowest initiative number becomes the start player. (Its own step, so a tutorial lesson can play one part of a round.) */
export async function startRound(ctx, round) {
    const { game, emit } = ctx;
    game.round = round;
    game.startPlayer = startPlayerForRound(game, round);
    await emit({ type: 'ROUND_START', round, startPlayer: game.startPlayer }, game);
}

// ---- Card flipping phase ---------------------------------------------------------------------------
export async function playFlippingPhase(ctx) {
    const { game, emit } = ctx;
    game.phase = 'FLIPPING';
    let seat = game.startPlayer;
    while (!isRowComplete(game)) {
        game.currentPlayer = seat;
        await playFlipTurn(ctx, game.players[seat]);
        seat = nextSeat(game, seat);
    }
    game.currentPlayer = null;
    await emit({ type: 'FLIPPING_DONE', round: game.round }, game);
}

/** One player's turn: choose a face-down card in the row and try to flip it. */
export async function playFlipTurn(ctx, player) {
    const { game, askPlayer, rng, emit } = ctx;
    const options = faceDownCards(game).map(c => c.id);
    await emit({ type: 'TURN_START', playerId: player.id, round: game.round }, game);

    const cardId = await askPlayer({ type: 'CHOOSE_CARD', playerId: player.id, round: game.round, options }, game);
    if (!options.includes(cardId)) throw new Error(`Player ${player.id} must choose a face-down card in row ${game.round}.`);
    const card = findCard(game, cardId);

    const needed = rollNeeded(player, card);
    let roll = null;
    if (needed !== null) {
        roll = rng.die();
        await emit({ type: 'ROLL', playerId: player.id, cardId, roll, needed, success: roll >= needed }, game);
        // Optional re-rolls: only after a miss, only with a yellow counter, and the player may say no.
        while (canReroll(player, card, roll)) {
            const again = await askPlayer({ type: 'REROLL', playerId: player.id, cardId, roll, needed, rerollsLeft: player.rerolls }, game);
            if (!again) break;
            spendReroll(player);
            roll = rng.die();       // the new roll must be kept
            await emit({ type: 'REROLL', playerId: player.id, cardId, roll, needed, success: roll >= needed, rerollsLeft: player.rerolls }, game);
        }
        if (!rollSucceeds(player, card, roll)) {
            // The card stays face down for a later attempt. No bonus on a failed roll.
            await emit({ type: 'FLIP_FAILED', playerId: player.id, cardId, roll }, game);
            return { flipped: false, cardId, roll };
        }
    }

    const reward = applyFlip(game, player, card, roll);
    await emit({ type: 'CARD_FLIPPED', playerId: player.id, cardId, cardType: card.type, roll, reward }, game);
    await resolveDiamondTrades(ctx, player);
    return { flipped: true, cardId, roll, reward };
}

/** The Automatic Diamond Trade: the moment a player has 4 Diamonds (Mr. Flagler 3). */
export async function resolveDiamondTrades(ctx, player) {
    const { game, askPlayer, emit } = ctx;
    while (mustTradeDiamonds(game, player)) {
        // Lars, 25 Nov 2026: a popup with OK. The trade itself is not a choice.
        await askPlayer({ type: 'DIAMOND_TRADE', playerId: player.id, diamonds: player.diamonds, cost: diamondTradeCost(player) }, game);
        const { card, cost } = tradeDiamonds(game, player);
        await emit({ type: 'DIAMOND_TRADE', playerId: player.id, card, cost, rerollsGained: card.rerolls || 0 }, game);
    }
}

// ---- Luxury Auction(s) -----------------------------------------------------------------------------
export async function playLuxuryAuctions(ctx) {
    const { game, emit } = ctx;
    game.phase = 'LUXURY_AUCTION';
    // Rounds 4 and 6: two cards, one after the other. The start player opens both.
    for (const slot of game.luxuryByRound[game.round - 1]) {
        slot.faceUp = true;
        await emit({ type: 'AUCTION_START', kind: 'LUXURY', round: game.round, slotId: slot.slotId, card: slot.card, startPlayer: game.startPlayer }, game);
        const outcome = await runAuction(ctx, 'LUXURY', slot.card);
        slot.sold = true;
        if (outcome.winner !== null) {
            const winner = game.players[outcome.winner];
            winner.gold -= outcome.price;                          // pays the Bank
            giveLuxuryCard(winner, slot.card, 'AUCTION');
            slot.wonBy = winner.id;
            slot.price = outcome.price;
            await emit({ type: 'AUCTION_WON', kind: 'LUXURY', playerId: winner.id, card: slot.card, price: outcome.price, rerollsGained: slot.card.rerolls || 0 }, game);
        } else {
            // Everyone passed (PLAN.md, decision 8): the card is removed from the game, unsold.
            slot.wonBy = null;
            game.unsoldLuxury.push(slot.card);
            await emit({ type: 'AUCTION_UNSOLD', kind: 'LUXURY', card: slot.card }, game);
        }
    }
}

/**
 * Runs the bidding for one card. Returns { winner: seat or null, price }.
 * A player who cannot afford the lowest allowed bid passes without being asked.
 */
export async function runAuction(ctx, kind, card) {
    const { game, askPlayer, emit } = ctx;
    const auction = createAuction(turnOrder(game, game.startPlayer));
    game.auction = { kind, cardId: card.id, state: auction };

    while (!auction.done) {
        const seat = auction.turn;
        const player = game.players[seat];
        game.currentPlayer = seat;

        if (!canBid(auction, player.gold)) {
            passBid(auction, seat);
            await emit({ type: 'PASS', kind, playerId: seat, forced: true }, game);
            continue;
        }

        const minBid = minimumBid(auction);
        const answer = await askPlayer({
            type: 'BID', playerId: seat, kind, card,
            highBid: auction.highBid, highBidder: auction.highBidder, minBid, maxBid: player.gold
        }, game);

        if (answer && answer.action === 'BID') {
            placeBid(auction, seat, answer.amount, player.gold);
            await emit({ type: 'BID', kind, playerId: seat, amount: answer.amount }, game);
        } else if (answer && answer.action === 'PASS') {
            passBid(auction, seat);
            await emit({ type: 'PASS', kind, playerId: seat, forced: false }, game);
        } else {
            throw new Error(`Player ${seat} must bid or pass.`);
        }
    }

    game.currentPlayer = null;
    game.auction = null;
    return { winner: auction.winner, price: auction.winner === null ? 0 : auction.highBid };
}

// ---- End of the game: the Property Auction (rulebook p15) ------------------------------------------
export async function playPropertyAuction(ctx) {
    const { game, emit } = ctx;
    game.phase = 'PROPERTY_AUCTION';

    // Flip the Auction Map Card. It shows which Property Card is auctioned; the other two go back to the box.
    // (Lars, 25 Nov 2026: the card is flipped and stays on the map even if nobody bids.)
    game.auctionMapCard.faceUp = true;
    game.property = game.propertyCards.find(p => p.id === game.auctionMapCard.propertyId);
    game.discardedProperties = game.propertyCards.filter(p => p.id !== game.property.id);
    await emit({ type: 'AUCTION_MAP_FLIPPED', propertyId: game.property.id, property: game.property }, game);

    // Characters who collect gold before that property's auction take it now. They keep it whatever happens next.
    for (const player of game.players) {
        const pg = getCharacter(player.characterId).propertyGold;
        if (pg && pg.propertyId === game.property.id) {
            player.gold += pg.gold;
            await emit({ type: 'CHARACTER_GOLD', playerId: player.id, gold: pg.gold, propertyId: game.property.id }, game);
        }
    }

    // Same rules as a Luxury Auction; the start player of round 8 opens.
    await emit({ type: 'AUCTION_START', kind: 'PROPERTY', round: game.round, card: game.property, startPlayer: game.startPlayer }, game);
    const outcome = await runAuction(ctx, 'PROPERTY', game.property);
    if (outcome.winner !== null) {
        const winner = game.players[outcome.winner];
        winner.gold -= outcome.price;
        winner.property = { ...game.property, price: outcome.price };
        await emit({ type: 'AUCTION_WON', kind: 'PROPERTY', playerId: winner.id, card: game.property, price: outcome.price }, game);
    } else {
        // Everyone passed: nobody gets a Property Card; it is discarded.
        game.propertyUnsold = true;
        await emit({ type: 'AUCTION_UNSOLD', kind: 'PROPERTY', card: game.property }, game);
    }
}

export async function endGame(ctx) {
    const { game, emit } = ctx;
    game.phase = 'GAME_OVER';
    game.currentPlayer = null;
    game.result = finalScoring(game);
    await emit({ type: 'GAME_OVER', result: game.result }, game);
    return game.result;
}
