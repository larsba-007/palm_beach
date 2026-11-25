// Palm Beach rules: the card flipping phase, character powers, re-rolls, Diamonds and the automatic trade.
// Source: rules-palm-beach.md, rulebook v1.0 p8-9, p12-14, and Lars's answers of 25 Nov 2026 (PROGRESS.md).
import { assert, R, check, newGame, cardOfType, fakeCard, fakePlayer } from './pb_helpers.js';

console.log('Palm Beach rules: flipping, powers, re-rolls, Diamonds\n');

/** Starts round 1 of a game and gives the tools to play single turns with chosen die rolls. */
function table(characterIds, { rolls = [], answers = {}, seed = 1, round = 1 } = {}) {
    const { game } = newGame(characterIds, { seed });
    game.round = round;
    game.phase = 'FLIPPING';
    game.startPlayer = R.startPlayerForRound(game, round);
    const events = [];
    const requests = [];
    const ctx = {
        game,
        rng: R.createScriptedRng(rolls, seed),
        emit: (e) => { events.push(e); },
        askPlayer: (request) => {
            requests.push(request);
            const answer = answers[request.type];
            return typeof answer === 'function' ? answer(request) : answer;
        }
    };
    const turn = (seat, type) => {
        const card = cardOfType(game, type);
        answers.CHOOSE_CARD = card.id;
        return R.playFlipTurn(ctx, game.players[seat]).then(result => ({ ...result, card }));
    };
    return { game, ctx, events, requests, turn, answers };
}

await check('Rewards: Lagoon 8 Au, Atlantic 6 Au, Block 3 Au, Waterfront 1 Diamond', () => {
    const p = fakePlayer('BRIGHT_SHELL');
    assert.deepEqual([R.flipReward(p, fakeCard('LAGOON'), 4).gold, R.flipReward(p, fakeCard('ATLANTIC'), 3).gold, R.flipReward(p, fakeCard('BLOCK')).gold], [8, 6, 3]);
    const wf = R.flipReward(p, fakeCard('WATERFRONT'));
    assert.deepEqual([wf.gold, wf.diamonds], [0, 1]);
});

await check('Die rolls: Lagoon needs 4-6, Atlantic needs 3-6, Block and Waterfront need no roll', () => {
    const p = fakePlayer('BRIGHT_SHELL');
    assert.equal(R.rollNeeded(p, fakeCard('LAGOON')), 4);
    assert.equal(R.rollNeeded(p, fakeCard('ATLANTIC')), 3);
    assert.equal(R.rollNeeded(p, fakeCard('BLOCK')), null);
    assert.equal(R.rollNeeded(p, fakeCard('WATERFRONT')), null);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(r => R.rollSucceeds(p, fakeCard('LAGOON'), r)), [false, false, false, true, true, true]);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map(r => R.rollSucceeds(p, fakeCard('ATLANTIC'), r)), [false, false, true, true, true, true]);
});

await check('Bonus circles: +5 on a Block Bonus Card (8 Au in all), +2 and +1 on landmarks', () => {
    const p = fakePlayer('BRIGHT_SHELL');
    assert.equal(R.flipReward(p, fakeCard('BLOCK', 5)).gold, 8);
    assert.equal(R.flipReward(p, fakeCard('BLOCK', 2)).gold, 5);
    assert.equal(R.flipReward(p, fakeCard('LAGOON', 2), 4).gold, 10);
    assert.equal(R.flipReward(p, fakeCard('ATLANTIC', 2), 6).gold, 8);
    // Rulebook p9: "You flip a Waterfront card with a +1 circle and take 1 Diamond and 1 Au."
    const wf = R.flipReward(p, fakeCard('WATERFRONT', 1));
    assert.deepEqual([wf.gold, wf.diamonds], [1, 1]);
});

await check('Eric: 10 Au instead of 5 for a Block Bonus Card (13 Au in all); landmarks pay him as normal', () => {
    const eric = fakePlayer('ERIC');
    assert.equal(R.flipReward(eric, fakeCard('BLOCK', 5)).gold, 13);     // rulebook p9 and p14
    assert.equal(R.flipReward(eric, fakeCard('BLOCK', 2)).gold, 5);
    assert.equal(R.flipReward(eric, fakeCard('BLOCK')).gold, 3);
});

await check('Roxana: +5 Au on a 5 or 6 on an Atlantic card, not on a 3 or 4, not on a Lagoon', () => {
    const roxana = fakePlayer('ROXANA');
    assert.deepEqual([3, 4, 5, 6].map(r => R.flipReward(roxana, fakeCard('ATLANTIC'), r).gold), [6, 6, 11, 11]);   // rulebook p9: a 4 gives 6; p14: a 5 gives 11
    assert.equal(R.flipReward(roxana, fakeCard('LAGOON'), 6).gold, 8);
});

await check('Carina: +5 Au on a 5 or 6 on a Lagoon card, not on a 4, not on an Atlantic', () => {
    const carina = fakePlayer('CARINA');
    assert.deepEqual([4, 5, 6].map(r => R.flipReward(carina, fakeCard('LAGOON'), r).gold), [8, 13, 13]);
    assert.equal(R.flipReward(carina, fakeCard('ATLANTIC'), 6).gold, 6);
});

await check('Addison: +5 Au on a 6 on an Atlantic or Lagoon card, not on a 5', () => {
    const addison = fakePlayer('ADDISON');
    assert.deepEqual([R.flipReward(addison, fakeCard('ATLANTIC'), 6).gold, R.flipReward(addison, fakeCard('LAGOON'), 6).gold], [11, 13]);
    assert.deepEqual([R.flipReward(addison, fakeCard('ATLANTIC'), 5).gold, R.flipReward(addison, fakeCard('LAGOON'), 5).gold], [6, 8]);
});

await check('Skip: flips Atlantic cards without a roll, still gets the landmark bonus, still rolls for Lagoon', async () => {
    const skip = fakePlayer('SKIP');
    assert.equal(R.rollNeeded(skip, fakeCard('ATLANTIC')), null);
    assert.equal(R.rollNeeded(skip, fakeCard('LAGOON')), 4);
    assert.equal(R.flipReward(skip, fakeCard('ATLANTIC', 2), null).gold, 8);
    // In a game: no die is rolled for his Atlantic card.
    const t = table(['SKIP', 'ROXANA'], { rolls: [1] });
    const result = await t.turn(0, 'ATLANTIC');
    assert.equal(result.flipped, true);
    assert.equal(result.roll, null);
    assert.equal(t.ctx.rng.rollsLeft(), 1, 'the die was not rolled');
    assert.ok(!t.events.some(e => e.type === 'ROLL'));
    assert.equal(t.game.players[0].gold, 5 + 6 + result.card.bonus);
});

await check('A turn: choose a face-down card in the current row; Block and Waterfront flip at once', async () => {
    const t = table(['ROXANA', 'FLAGLER']);
    const block = await t.turn(0, 'BLOCK');
    assert.equal(block.card.faceUp, true);
    assert.equal(t.game.players[0].gold, 5 + 3 + block.card.bonus);
    const wf = await t.turn(1, 'WATERFRONT');
    assert.equal(wf.card.faceUp, true);
    assert.equal(t.game.players[1].diamonds, 1);
    assert.equal(t.game.players[1].gold, 5 + wf.card.bonus);
    assert.equal(R.faceDownCards(t.game).length, 7);
});

await check('Only face-down cards in the current row may be chosen', async () => {
    const t = table(['ROXANA', 'FLAGLER']);
    const offered = () => t.requests.filter(r => r.type === 'CHOOSE_CARD').at(-1).options;
    const first = await t.turn(0, 'BLOCK');
    await t.turn(1, 'BLOCK');
    assert.equal(offered().length, 8, 'the flipped card is no longer offered');
    assert.ok(!offered().includes(first.card.id));
    assert.ok(offered().every(id => t.game.rows[0].some(c => c.id === id)), 'only row 1 cards in round 1');
    // A card from another row, or a face-up card, is refused.
    t.answers.CHOOSE_CARD = t.game.rows[1][0].id;
    await assert.rejects(R.playFlipTurn(t.ctx, t.game.players[0]), /must choose a face-down card in row 1/);
    t.answers.CHOOSE_CARD = first.card.id;
    await assert.rejects(R.playFlipTurn(t.ctx, t.game.players[0]), /must choose a face-down card in row 1/);
});

await check('Failed roll: the card stays face down, no gold and no bonus, and anyone can try it again later', async () => {
    const t = table(['ROXANA', 'FLAGLER'], { rolls: [3, 2, 5] });
    const lagoon = await t.turn(0, 'LAGOON');           // rolls 3: fails
    assert.equal(lagoon.flipped, false);
    assert.equal(lagoon.card.faceUp, false);
    assert.equal(t.game.players[0].gold, 5);
    const atlantic = await t.turn(1, 'ATLANTIC');       // rolls 2: fails
    assert.equal(atlantic.flipped, false);
    assert.equal(t.game.players[1].gold, 5);
    assert.equal(R.faceDownCards(t.game).length, 9);
    const again = await t.turn(1, 'LAGOON');            // another player tries the same Lagoon: rolls 5
    assert.equal(again.card.id, lagoon.card.id);
    assert.equal(again.flipped, true);
    assert.equal(t.game.players[1].gold, 5 + 8 + again.card.bonus);
});

await check('Re-roll: offered only after a miss and only with a yellow counter; saying no keeps the counter', async () => {
    // Bright Shell has 1 yellow counter.
    const t = table(['BRIGHT_SHELL', 'ROXANA'], { rolls: [2, 4, 1], answers: { REROLL: false } });
    const miss = await t.turn(0, 'LAGOON');             // rolls 2, says no
    assert.equal(miss.flipped, false);
    assert.equal(t.game.players[0].rerolls, 1, 'the counter is kept');
    assert.equal(t.requests.filter(r => r.type === 'REROLL').length, 1);
    await t.turn(0, 'LAGOON');                          // rolls 4: success, no question asked
    assert.equal(t.requests.filter(r => r.type === 'REROLL').length, 1, 'no re-roll offered after a success');
    await t.turn(1, 'ATLANTIC');                        // Roxana rolls 1 with no counters: no question
    assert.equal(t.requests.filter(r => r.type === 'REROLL').length, 1, 'no re-roll offered without a counter');
});

await check('Re-roll: spending a counter rolls again and the new roll is kept; as many times as you have counters', async () => {
    // Addison has 2 yellow counters. Rolls 1, then 2, then 6.
    const t = table(['ADDISON', 'ROXANA'], { rolls: [1, 2, 6], answers: { REROLL: true } });
    const result = await t.turn(0, 'LAGOON');
    assert.equal(result.flipped, true);
    assert.equal(result.roll, 6);
    assert.equal(t.game.players[0].rerolls, 0);
    assert.equal(t.game.players[0].gold, 5 + 8 + 5 + result.card.bonus, 'Addison: +5 for the 6 that was kept');
    assert.equal(t.requests.filter(r => r.type === 'REROLL').length, 2);
    // Out of counters: a second card that misses stays face down.
    const t2 = table(['BRIGHT_SHELL', 'ROXANA'], { rolls: [1, 2], answers: { REROLL: true } });
    const miss = await t2.turn(0, 'ATLANTIC');
    assert.equal(miss.flipped, false);
    assert.equal(miss.roll, 2, 'the new roll is kept even when it also misses');
    assert.equal(t2.game.players[0].rerolls, 0);
});

await check('The phase ends when all cards in the row are face up; turns go clockwise from the start player', async () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA'], { seed: 5 });
    game.round = 1;
    game.startPlayer = R.startPlayerForRound(game, 1);        // Bright Shell (30), seat 2
    const turns = [];
    const ctx = {
        game, rng: R.createRng(5), emit: (e) => { if (e.type === 'TURN_START') turns.push(e.playerId); },
        askPlayer: (r) => (r.type === 'CHOOSE_CARD' ? r.options[0] : true)
    };
    await R.playFlippingPhase(ctx);
    assert.ok(R.isRowComplete(game));
    assert.equal(game.rows[0].filter(c => c.faceUp).length, 9);
    assert.ok(game.rows.slice(1).flat().every(c => !c.faceUp), 'other rows are untouched');
    assert.equal(turns[0], 2);
    turns.forEach((seat, i) => assert.equal(seat, (2 + i) % 4, `turn ${i + 1} goes to the next seat clockwise`));
    assert.ok(turns.length >= 9);
});

await check('Rows 7 and 8 have 5 cards to flip', async () => {
    const { game } = newGame(['ROXANA', 'FLAGLER'], { seed: 3 });
    game.round = 7;
    game.startPlayer = R.startPlayerForRound(game, 7);
    const ctx = { game, rng: R.createRng(3), emit: () => {}, askPlayer: (r) => (r.type === 'CHOOSE_CARD' ? r.options[0] : true) };
    await R.playFlippingPhase(ctx);
    assert.equal(game.rows[6].length, 5);
    assert.ok(game.rows[6].every(c => c.faceUp));
});

await check('Automatic Diamond Trade at 4 Diamonds: Diamonds back to the Bank, top card of the pile to the player', async () => {
    const t = table(['ROXANA', 'FLAGLER']);
    const roxana = t.game.players[0];
    roxana.diamonds = 3;
    const top = t.game.tradePile.at(-1);
    await t.turn(0, 'WATERFRONT');
    assert.equal(roxana.diamonds, 0);
    assert.equal(roxana.luxuryCards.length, 1);
    assert.equal(roxana.luxuryCards[0].id, top.id);
    assert.equal(roxana.luxuryCards[0].source, 'DIAMOND_TRADE');
    assert.equal(t.game.tradePile.length, 6);
    assert.equal(roxana.rerolls, top.rerolls, 're-rolls on the card are added at once');
    // Lars: a popup with OK is shown before the trade happens.
    const popup = t.requests.find(r => r.type === 'DIAMOND_TRADE');
    assert.deepEqual([popup.playerId, popup.diamonds, popup.cost], [0, 4, 4]);
    assert.ok(t.events.some(e => e.type === 'DIAMOND_TRADE' && e.card.id === top.id));
});

await check('No trade at 3 Diamonds for others; Mr. Flagler trades at 3', async () => {
    const t = table(['ROXANA', 'FLAGLER']);
    t.game.players[0].diamonds = 2;
    t.game.players[1].diamonds = 2;
    await t.turn(0, 'WATERFRONT');
    assert.equal(t.game.players[0].diamonds, 3);
    assert.equal(t.game.players[0].luxuryCards.length, 0);
    await t.turn(1, 'WATERFRONT');
    assert.equal(t.game.players[1].diamonds, 0);
    assert.equal(t.game.players[1].luxuryCards.length, 1);
    assert.equal(t.requests.find(r => r.type === 'DIAMOND_TRADE').cost, 3);
    assert.equal(R.diamondTradeCost(t.game.players[0]), 4);
    assert.equal(R.diamondTradeCost(t.game.players[1]), 3);
});

await check('A Luxury Card with re-rolls from a Diamond trade gives yellow counters that work on the next roll', async () => {
    const t = table(['SKIP', 'ROXANA'], { rolls: [1, 6], answers: { REROLL: true } });
    const skip = t.game.players[0];
    const tiger = R.LUXURY_CARDS.find(c => c.name === 'Tiger');
    t.game.tradePile.push({ ...tiger });                 // put the tiger on top of the pile
    skip.diamonds = 3;
    await t.turn(0, 'WATERFRONT');
    assert.equal(skip.rerolls, 2);
    // Lars: Skip can use the re-roll on a Lagoon card.
    const lagoon = await t.turn(0, 'LAGOON');            // rolls 1, re-rolls a 6
    assert.equal(lagoon.flipped, true);
    assert.equal(skip.rerolls, 1);
});

await check('Starting Diamonds count: Kingston starts with 1 and trades on his 3rd Waterfront card', async () => {
    const t = table(['KINGSTON', 'ROXANA']);
    const kingston = t.game.players[0];
    assert.equal(kingston.diamonds, 1);
    await t.turn(0, 'WATERFRONT');
    assert.equal(kingston.diamonds, 2);                  // rulebook p9: "with his starting Diamond he now has 2"
    kingston.diamonds = 3;
    await t.turn(0, 'WATERFRONT');
    assert.equal(kingston.luxuryCards.length, 1);
    assert.equal(kingston.diamonds, 0);
});

await check('Kingston and Edith spend their red counter at the start and secretly look at cards', async () => {
    const { game } = newGame(['KINGSTON', 'EDITH', 'ROXANA']);
    const requests = [];
    const ctx = {
        game, rng: R.createRng(1), emit: () => {},
        askPlayer: (r) => { requests.push(r); return r.type === 'CHOOSE_LUXURY_PEEK' ? ['lux-r4-1', 'lux-r4-2', 'lux-r6-1', 'lux-r6-2', 'lux-r8-1'] : true; }
    };
    await R.playStartPowers(ctx);
    assert.deepEqual(game.players.map(p => p.powers), [0, 0, 0]);
    assert.equal(requests.find(r => r.type === 'PEEK_AUCTION_MAP').propertyId, game.auctionMapCard.propertyId);
    assert.equal(game.auctionMapCard.faceUp, false, 'the card stays face down for everyone else');
    const choose = requests.find(r => r.type === 'CHOOSE_LUXURY_PEEK');
    assert.equal(choose.count, 5);
    assert.equal(choose.options.length, 10, 'the 10 cards beside the rows, not the trade pile');
    const shown = requests.find(r => r.type === 'SHOW_LUXURY_PEEK');
    assert.equal(shown.cards.length, 5);
    assert.equal(shown.cards[0].card.id, game.luxuryByRound[3][0].card.id);
    assert.ok(game.luxuryByRound.flat().every(s => !s.faceUp));
    assert.equal(game.players[2].peeked, null);
    // Edith must choose exactly 5 different cards.
    const again = newGame(['EDITH', 'ROXANA']).game;
    await assert.rejects(R.playStartPowers({ game: again, rng: R.createRng(1), emit: () => {}, askPlayer: (r) => (r.type === 'CHOOSE_LUXURY_PEEK' ? ['lux-r1-1'] : true) }), /must choose 5/);
});

console.log('\nAll flipping and Diamond checks passed.');
