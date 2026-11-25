// Palm Beach rules: Luxury Auctions, the Property Auction, final scoring and the tiebreaker.
// Source: rules-palm-beach.md, rulebook v1.0 p10, p14-15, p19, PLAN.md decision 8, and Lars's answers of 25 Nov 2026.
import { assert, R, check, newGame } from './pb_helpers.js';

console.log('Palm Beach rules: auctions and scoring\n');

/**
 * A game standing at the Luxury Auction of a round, with bids given in advance.
 * script: one answer per bidding turn, in order: a number = bid that amount, 'pass' = pass.
 */
function auctionTable(characterIds, { round = 1, gold = null, script = [], seed = 1 } = {}) {
    const { game } = newGame(characterIds, { seed });
    game.round = round;
    game.startPlayer = R.startPlayerForRound(game, round);
    if (gold) game.players.forEach((p, i) => { p.gold = gold[i]; });
    const events = [];
    const requests = [];
    const queue = script.slice();
    const ctx = {
        game, rng: R.createRng(seed), emit: (e) => { events.push(e); },
        askPlayer: (request) => {
            requests.push(request);
            if (request.type !== 'BID') return true;
            if (!queue.length) throw new Error('The test script ran out of bids.');
            const next = queue.shift();
            return next === 'pass' ? { action: 'PASS' } : { action: 'BID', amount: next };
        }
    };
    return { game, ctx, events, requests, bidders: () => requests.filter(r => r.type === 'BID').map(r => r.playerId), left: () => queue.length };
}

await check('The round\'s Luxury Card is turned face up and the start player bids first, then clockwise', async () => {
    // Round 1 with Roxana (70), Flagler (90), Bright Shell (30), Carina (50): Bright Shell (seat 2) starts.
    const t = auctionTable(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA'], { script: [1, 'pass', 'pass', 'pass'] });
    const slot = t.game.luxuryByRound[0][0];
    await R.playLuxuryAuctions(t.ctx);
    assert.equal(slot.faceUp, true);
    assert.deepEqual(t.bidders(), [2, 3, 0, 1]);
    assert.equal(t.events.find(e => e.type === 'AUCTION_START').startPlayer, 2);
});

await check('The winner pays the Bank and takes the card (rulebook p10 example: 5, 7, 8, 10, pass, pass)', async () => {
    // Kingston has 12 Au. Kingston 5, Edith 7, Eric 8, Kingston 10, Edith passes, Eric can't afford more and passes.
    const t = auctionTable(['KINGSTON', 'EDITH', 'ERIC'], { round: 3, gold: [12, 20, 8], script: [5, 7, 8, 10, 'pass'] });
    assert.equal(t.game.startPlayer, 0, 'round 3: Kingston (20) starts');
    const card = t.game.luxuryByRound[2][0].card;
    await R.playLuxuryAuctions(t.ctx);
    const kingston = t.game.players[0];
    assert.equal(kingston.gold, 2);
    assert.equal(kingston.luxuryCards[0].id, card.id);
    assert.equal(kingston.luxuryCards[0].source, 'AUCTION');
    assert.deepEqual([t.game.players[1].gold, t.game.players[2].gold], [20, 8], 'the others keep their gold');
    assert.equal(t.left(), 0);
    assert.deepEqual(t.events.filter(e => e.type === 'PASS').map(e => [e.playerId, e.forced]), [[1, false], [2, true]], 'Eric (8 Au) cannot beat 10 and passes without being asked');
    const won = t.events.find(e => e.type === 'AUCTION_WON');
    assert.deepEqual([won.playerId, won.price], [0, 10]);
});

await check('Lowest bid is 1 Au; each raise is at least 1 Au more; whole numbers only', async () => {
    const a = R.createAuction([0, 1, 2]);
    assert.equal(R.minimumBid(a), 1);
    assert.throws(() => R.placeBid(a, 0, 0, 10), /at least 1 Au/);
    assert.throws(() => R.placeBid(a, 0, 1.5, 10), /whole number/);
    R.placeBid(a, 0, 1, 10);
    assert.equal(R.minimumBid(a), 2);
    assert.throws(() => R.placeBid(a, 1, 1, 10), /at least 2 Au/);
    R.placeBid(a, 1, 6, 10);                 // a raise may be more than +1
    assert.equal(R.minimumBid(a), 7);
    // The request sent to the player carries the same limits.
    const t = auctionTable(['ROXANA', 'FLAGLER'], { gold: [9, 9], script: [3, 'pass'] });
    await R.playLuxuryAuctions(t.ctx);
    const [first, second] = t.requests.filter(r => r.type === 'BID');
    assert.deepEqual([first.minBid, first.maxBid, first.highBid], [1, 9, 0]);
    assert.deepEqual([second.minBid, second.maxBid, second.highBid, second.highBidder], [4, 9, 3, first.playerId]);
});

await check('You can never bid more gold than you have', async () => {
    const a = R.createAuction([0, 1]);
    assert.throws(() => R.placeBid(a, 0, 6, 5), /never bid more gold than you have/);
    R.placeBid(a, 0, 5, 5);                  // bidding everything is allowed
    assert.equal(a.highBid, 5);
    const t = auctionTable(['ROXANA', 'FLAGLER'], { gold: [5, 5], script: [6] });
    await assert.rejects(R.playLuxuryAuctions(t.ctx), /never bid more gold than you have/);
});

await check('Once you pass you are out of this auction; a player who cannot afford the next bid passes without being asked', async () => {
    // Seats 0, 1, 2 with 20, 3, 20 Au. Round 2 with Roxana, Skip, Carina: Roxana (20) starts.
    const t = auctionTable(['ROXANA', 'SKIP', 'CARINA'], { round: 2, gold: [20, 3, 20], script: [2, 3, 'pass', 6, 'pass'] });
    assert.equal(t.game.startPlayer, 0);
    // Roxana 2, Skip 3, Carina passes, Roxana 6, Skip cannot afford 7 (forced pass) -> Roxana wins... Skip is not asked.
    await R.playLuxuryAuctions(t.ctx);
    assert.deepEqual(t.bidders(), [0, 1, 2, 0], 'Carina is never asked again after passing; Skip is not asked when he cannot afford 7');
    assert.equal(t.left(), 1, 'the last scripted answer was not needed');
    const forced = t.events.filter(e => e.type === 'PASS' && e.forced).map(e => e.playerId);
    assert.deepEqual(forced, [1]);
    assert.equal(t.game.players[0].gold, 14);
});

await check('The start player may pass; the last player left may still take the card for 1 Au', async () => {
    const t = auctionTable(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL'], { script: ['pass', 'pass', 1] });
    const order = R.turnOrder(t.game, t.game.startPlayer);
    await R.playLuxuryAuctions(t.ctx);
    assert.deepEqual(t.bidders(), order);
    const winner = t.game.players[order[2]];
    assert.equal(winner.luxuryCards.length, 1);
    assert.equal(winner.gold, 4);
});

await check('Everyone passes on a Luxury Card: it is removed from the game, unsold, and nobody pays', async () => {
    const t = auctionTable(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL'], { script: ['pass', 'pass', 'pass'] });
    const card = t.game.luxuryByRound[0][0].card;
    await R.playLuxuryAuctions(t.ctx);
    assert.ok(t.game.players.every(p => p.luxuryCards.length === 0 && p.gold === 5));
    assert.deepEqual(t.game.unsoldLuxury.map(c => c.id), [card.id]);
    assert.ok(t.events.some(e => e.type === 'AUCTION_UNSOLD' && e.kind === 'LUXURY'));
    assert.equal(t.game.tradePile.length, 7, 'the unsold card does not go to the Diamond trade pile');
});

await check('Rounds 4 and 6: two cards, one after the other; the start player opens both; a pass counts for one card only', async () => {
    for (const round of [4, 6]) {
        // First card: start player bids 1, the others pass. Second card: start player passes, next bids 1, last passes.
        const t = auctionTable(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL'], { round, script: [1, 'pass', 'pass', 'pass', 1, 'pass'] });
        const order = R.turnOrder(t.game, t.game.startPlayer);
        const [first, second] = t.game.luxuryByRound[round - 1].map(s => s.card);
        await R.playLuxuryAuctions(t.ctx);
        const starts = t.events.filter(e => e.type === 'AUCTION_START');
        assert.equal(starts.length, 2);
        assert.deepEqual(starts.map(e => e.startPlayer), [order[0], order[0]]);
        assert.deepEqual(t.bidders(), [...order, ...order], 'everyone is back in for the second card');
        assert.equal(t.game.players[order[0]].luxuryCards[0].id, first.id);
        assert.equal(t.game.players[order[1]].luxuryCards[0].id, second.id);
    }
});

await check('A Luxury Card with re-rolls won at auction gives yellow counters at once', async () => {
    const t = auctionTable(['ROXANA', 'FLAGLER'], { script: [1, 'pass'] });
    t.game.luxuryByRound[0][0].card = { ...R.LUXURY_CARDS.find(c => c.name === 'Watch') };
    await R.playLuxuryAuctions(t.ctx);
    const winner = t.game.players.find(p => p.luxuryCards.length === 1);
    assert.equal(winner.rerolls, 1);          // rulebook p10: "takes the gold watch and its yellow counter"
});

await check('Property Auction: the Auction Map Card is flipped and shows the property; the other two are discarded', async () => {
    const t = auctionTable(['FLAGLER', 'BRIGHT_SHELL', 'SKIP'], { round: 8, gold: [30, 30, 30], script: [10, 'pass', 'pass'] });
    const propertyId = t.game.auctionMapCard.propertyId;
    await R.playPropertyAuction(t.ctx);
    assert.equal(t.game.auctionMapCard.faceUp, true);
    assert.equal(t.game.property.id, propertyId);
    assert.equal(t.game.discardedProperties.length, 2);
    assert.ok(!t.game.discardedProperties.some(p => p.id === propertyId));
    // The start player of round 8 opens (Bright Shell, 10).
    const opener = t.requests.find(r => r.type === 'BID');
    assert.equal(t.game.players[opener.playerId].characterId, 'BRIGHT_SHELL');
    assert.equal(opener.kind, 'PROPERTY');
    const winner = t.game.players[opener.playerId];
    assert.equal(winner.property.id, propertyId);
    assert.equal(winner.gold, 20);
});

await check('Characters collect their gold before their own property\'s auction: Ms. Post 15, Roxana 10, Carina 10', async () => {
    const expected = { MAR_A_LAGO: { POST: 15 }, SPANISH_RIVER: { ROXANA: 10 }, GULF_STREAM: { CARINA: 10 } };
    const seen = new Set();
    for (let seed = 1; seed <= 40 && seen.size < 3; seed++) {
        const t = auctionTable(['POST', 'ROXANA', 'CARINA', 'SKIP'], { round: 8, seed, script: ['pass', 'pass', 'pass', 'pass'] });
        const propertyId = t.game.auctionMapCard.propertyId;
        if (seen.has(propertyId)) continue;
        seen.add(propertyId);
        await R.playPropertyAuction(t.ctx);
        for (const p of t.game.players) {
            assert.equal(p.gold, 5 + (expected[propertyId][p.characterId] || 0), `${p.characterId} when ${propertyId} is auctioned`);
        }
        // The gold arrives before the bidding starts, so it can be bid.
        const firstBid = t.requests.find(r => r.type === 'BID');
        assert.equal(firstBid.maxBid, t.game.players[firstBid.playerId].gold);
        const order = t.events.map(e => e.type);
        assert.ok(order.indexOf('AUCTION_MAP_FLIPPED') < order.indexOf('CHARACTER_GOLD'));
        assert.ok(order.indexOf('CHARACTER_GOLD') < order.lastIndexOf('AUCTION_START'));
    }
    assert.equal(seen.size, 3, 'all three properties were tested');
});

await check('Everyone passes at the Property Auction: the card is still flipped, nobody gets a property, character gold is kept', async () => {
    let t;
    for (let seed = 1; seed <= 40; seed++) {
        t = auctionTable(['ROXANA', 'FLAGLER'], { round: 8, seed, script: ['pass', 'pass'] });
        if (t.game.auctionMapCard.propertyId === 'SPANISH_RIVER') break;
    }
    await R.playPropertyAuction(t.ctx);
    assert.equal(t.game.auctionMapCard.faceUp, true);
    assert.equal(t.game.propertyUnsold, true);
    assert.ok(t.game.players.every(p => p.property === null));
    assert.equal(t.game.players[0].gold, 15, 'Roxana keeps her 10 Au');
});

await check('Final scoring: Prestige Points = Luxury Cards + Property Card; most points wins', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'SKIP']);
    const lux = (name) => ({ ...R.LUXURY_CARDS.find(c => c.name === name) });
    game.players[0].luxuryCards = [lux('Rocket'), lux('Wine')];                   // 4
    game.players[1].luxuryCards = [lux('Rings')];                                  // 2 + 4
    game.players[1].property = { ...R.PROPERTY_CARDS[0] };
    game.players[2].luxuryCards = [lux('Hotel'), lux('Tiger')];                    // 4
    const result = R.finalScoring(game);
    assert.deepEqual(result.scores.map(s => s.prestige), [4, 6, 4]);
    assert.deepEqual(result.winners, [1]);
    assert.equal(result.decidedBy, 'POINTS');
    assert.equal(R.prestigeOf(game.players[1]), 6);
});

await check('Tiebreaker 1: the tied player holding the Property Card wins', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'SKIP']);
    const lux = (name) => ({ ...R.LUXURY_CARDS.find(c => c.name === name) });
    game.players[0].luxuryCards = [lux('Rocket'), lux('Hotel')];                   // 6, lots of gold
    game.players[0].gold = 50;
    game.players[1].luxuryCards = [lux('Rings'), lux('Racehorse')];                // 4 + 2 = 6, has the property
    game.players[1].property = { ...R.PROPERTY_CARDS[2] };
    game.players[1].gold = 0;
    const result = R.finalScoring(game);
    assert.deepEqual(result.winners, [1]);
    assert.equal(result.decidedBy, 'PROPERTY');
});

await check('Tiebreaker 2: no tied player has the property -> most gold left wins; a property holder who is not tied does not matter', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'SKIP']);
    const lux = (name) => ({ ...R.LUXURY_CARDS.find(c => c.name === name) });
    game.players[0].luxuryCards = [lux('Rocket'), lux('Hotel')];                   // 6
    game.players[0].gold = 7;
    game.players[1].luxuryCards = [lux('Submarine'), lux('Superyacht')];           // 6
    game.players[1].gold = 9;
    game.players[2].property = { ...R.PROPERTY_CARDS[2] };                         // 2, not tied
    game.players[2].gold = 99;
    const result = R.finalScoring(game);
    assert.deepEqual(result.winners, [1]);
    assert.equal(result.decidedBy, 'GOLD');
});

await check('Tiebreaker 3: still tied -> those players share the victory', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'SKIP']);
    const lux = (name) => ({ ...R.LUXURY_CARDS.find(c => c.name === name) });
    game.players[0].luxuryCards = [lux('Rocket')];
    game.players[1].luxuryCards = [lux('Hotel')];
    game.players[2].luxuryCards = [lux('Wine')];
    game.players.forEach(p => { p.gold = 4; });
    const result = R.finalScoring(game);
    assert.deepEqual(result.winners, [0, 1]);
    assert.equal(result.decidedBy, 'SHARED');
});

console.log('\nAll auction and scoring checks passed.');
