// Palm Beach rules: components, setup, characters and initiative.
// Source: docs/palm_beach/rules-palm-beach.md and the printed rulebook v1.0 (p2-5, p7, p11-13, p15, p20).
import { assert, R, check, newGame } from './pb_helpers.js';

console.log('Palm Beach rules: components, setup, characters, initiative\n');

await check('64 Map Cards: 8 Lagoon, 16 Waterfront (8 + 8), 32 Block, 8 Atlantic', () => {
    assert.equal(R.MAP_CARDS.length, 64);
    const n = (f) => R.MAP_CARDS.filter(f).length;
    assert.equal(n(c => c.type === 'LAGOON'), 8);
    assert.equal(n(c => c.type === 'WATERFRONT'), 16);
    assert.equal(n(c => c.deck === 'WF_LAGOON'), 8);
    assert.equal(n(c => c.deck === 'WF_ATLANTIC'), 8);
    assert.equal(n(c => c.type === 'BLOCK'), 32);
    assert.equal(n(c => c.type === 'ATLANTIC'), 8);
});

await check('Bonus circles: 9 Block Bonus Cards (+5), 8 landmarks (+2), 4 landmarks (+1), in the right places', () => {
    const plus5 = R.MAP_CARDS.filter(c => c.bonus === 5);
    const plus2 = R.MAP_CARDS.filter(c => c.bonus === 2);
    const plus1 = R.MAP_CARDS.filter(c => c.bonus === 1);
    assert.equal(plus5.length, 9);
    assert.ok(plus5.every(c => c.type === 'BLOCK' && c.isBlockBonus), '+5 cards are all Block cards');
    assert.deepEqual(plus5.map(c => c.spriteIndex), [2, 5, 10, 19, 27, 45, 52, 60, 61], 'same 9 cards as bonusIndices in js/ui.js');
    assert.equal(plus2.length, 8);
    const count = (list, deck) => list.filter(c => c.deck === deck).length;
    assert.deepEqual([count(plus2, 'LAGOON'), count(plus2, 'WF_LAGOON'), count(plus2, 'BLOCK'), count(plus2, 'ATLANTIC')], [1, 1, 5, 1]);
    assert.equal(plus1.length, 4);
    assert.ok(plus1.every(c => c.deck === 'WF_ATLANTIC'), '+1 landmarks are Waterfront cards on the Atlantic side');
    assert.ok(R.MAP_CARDS.filter(c => !c.isBlockBonus).every(c => c.bonus !== 5));
});

await check('17 Luxury Cards: 5 x 3 points, 7 x 2 points, 5 x 1 point; tiger 2 re-rolls, watch and handbag 1', () => {
    assert.equal(R.LUXURY_CARDS.length, 17);
    const byPoints = (p) => R.LUXURY_CARDS.filter(c => c.points === p);
    assert.equal(byPoints(3).length, 5);
    assert.equal(byPoints(2).length, 7);
    assert.equal(byPoints(1).length, 5);
    const rerolls = Object.fromEntries(R.LUXURY_CARDS.filter(c => c.rerolls).map(c => [c.name, c.rerolls]));
    assert.deepEqual(rerolls, { Handbag: 1, Watch: 1, Tiger: 2 });
    assert.ok(R.LUXURY_CARDS.filter(c => c.rerolls).every(c => c.points === 1));
    assert.equal(new Set(R.LUXURY_CARDS.map(c => c.id)).size, 17);
});

await check('3 Property Cards: Mar-a-Lago 4, Gulf Stream Golf Course 3, Spanish River Park 2; 3 Auction Map Cards', () => {
    assert.deepEqual(R.PROPERTY_CARDS.map(p => [p.name, p.points]), [['Mar-a-Lago', 4], ['Gulf Stream Golf Course', 3], ['Spanish River Park', 2]]);
    assert.deepEqual(R.AUCTION_MAP_CARDS.map(c => c.propertyId).sort(), ['GULF_STREAM', 'MAR_A_LAGO', 'SPANISH_RIVER']);
});

await check('10 characters with the counters, Diamonds and initiative numbers printed in the rulebook (p13, p20)', () => {
    const printed = {
        ROXANA:       [0, 0, 0, [70, 20, 40, 60, 95, 60, 50, 80]],
        ERIC:         [0, 0, 0, [20, 30, 70, 10, 90, 40, 60, 90]],
        ADDISON:      [0, 2, 0, [95, 95, 95, 95, 30, 30, 30, 30]],
        POST:         [0, 1, 0, [80, 40, 10, 90, 40, 70, 80, 40]],
        FLAGLER:      [0, 0, 0, [90, 90, 90, 80, 10, 95, 90, 50]],
        BRIGHT_SHELL: [0, 1, 0, [30, 60, 30, 30, 20, 20, 20, 10]],
        KINGSTON:     [1, 0, 1, [40, 10, 20, 50, 80, 90, 70, 60]],
        CARINA:       [0, 0, 0, [50, 80, 50, 20, 70, 80, 10, 70]],
        EDITH:        [1, 0, 1, [10, 50, 80, 70, 60, 50, 40, 95]],
        SKIP:         [0, 0, 0, [60, 70, 60, 40, 50, 10, 95, 20]]
    };
    assert.equal(R.CHARACTERS.length, 10);
    for (const [id, [powers, rerolls, diamonds, initiative]] of Object.entries(printed)) {
        const c = R.getCharacter(id);
        assert.deepEqual([c.powers, c.rerolls, c.diamonds], [powers, rerolls, diamonds], `${id} counters`);
        assert.deepEqual(c.initiative, initiative, `${id} initiative`);
    }
    assert.deepEqual(R.CHARACTERS.map(c => c.slot), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'picture order: Edith, Roxana, Addison, Flagler, Kingston / Post, Eric, Bright Shell, Carina, Skip');
});

await check('No two characters share an initiative number in any round (a tie would be a bug)', () => {
    assert.deepEqual(R.findInitiativeClashes(), []);
    const clash = R.findInitiativeClashes([{ id: 'A', initiative: [1, 2, 3, 4, 5, 6, 7, 8] }, { id: 'B', initiative: [9, 2, 9, 9, 9, 9, 9, 9] }]);
    assert.deepEqual(clash, [{ round: 2, number: 2, characters: ['A', 'B'] }]);
});

await check('Version 1 characters: Roxana, Mr. Flagler, Bright Shell, Carina, Skip', () => {
    assert.deepEqual([...R.V1_CHARACTER_IDS].sort(), ['BRIGHT_SHELL', 'CARINA', 'FLAGLER', 'ROXANA', 'SKIP']);
    assert.ok(R.V1_CHARACTER_IDS.every(id => !R.getCharacter(id).startPeek), 'no secret-look powers on a shared screen');
});

await check('Setup: rows 1-6 have 9 cards (Lagoon, Waterfront, 5 Block, Waterfront, Atlantic), rows 7-8 have 5', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA']);
    assert.equal(game.rows.length, 8);
    const long = ['LAGOON', 'WATERFRONT', 'BLOCK', 'BLOCK', 'BLOCK', 'BLOCK', 'BLOCK', 'WATERFRONT', 'ATLANTIC'];
    const short = ['LAGOON', 'WATERFRONT', 'BLOCK', 'WATERFRONT', 'ATLANTIC'];
    game.rows.forEach((row, i) => {
        assert.deepEqual(row.map(c => c.type), i < 6 ? long : short, `row ${i + 1}`);
        assert.equal(row[1].deck, 'WF_LAGOON');
        assert.equal(row[row.length - 2].deck, 'WF_ATLANTIC');
        assert.ok(row.every(c => c.faceUp === false && c.row === i + 1), 'all face down');
    });
    const all = game.rows.flat();
    assert.equal(all.length, 64);
    assert.equal(new Set(all.map(c => c.id)).size, 64, 'every Map Card is used exactly once');
});

await check('Setup: 10 Luxury Cards beside the rows (two at rows 4 and 6), 7 in the Diamond trade pile, all face down', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER']);
    assert.deepEqual(game.luxuryByRound.map(s => s.length), [1, 1, 1, 2, 1, 2, 1, 1]);
    assert.equal(game.luxuryByRound.flat().length, 10);
    assert.equal(game.tradePile.length, 7);
    assert.ok(game.luxuryByRound.flat().every(s => s.faceUp === false));
    const ids = [...game.luxuryByRound.flat().map(s => s.card.id), ...game.tradePile.map(c => c.id)];
    assert.equal(new Set(ids).size, 17, 'all 17 Luxury Cards, none twice');
});

await check('Setup: 1 of the 3 Auction Map Cards, face down; over many games each one is drawn', () => {
    const seen = new Set();
    for (let seed = 1; seed <= 60; seed++) {
        const { game } = newGame(['ROXANA', 'FLAGLER'], { seed });
        assert.equal(game.auctionMapCard.faceUp, false);
        seen.add(game.auctionMapCard.propertyId);
    }
    assert.equal(seen.size, 3);
});

await check('Setup: everyone starts with 5 Au and the counters and Diamonds on their card', () => {
    const { game } = newGame(['ADDISON', 'KINGSTON', 'EDITH', 'POST', 'BRIGHT_SHELL']);
    assert.ok(game.players.every(p => p.gold === 5));
    assert.deepEqual(game.players.map(p => [p.powers, p.rerolls, p.diamonds]), [[0, 2, 0], [1, 0, 1], [1, 0, 1], [0, 1, 0], [0, 1, 0]]);
    assert.ok(game.players.every(p => p.luxuryCards.length === 0 && p.property === null));
});

await check('Setup: 1-5 players, no character twice', () => {
    assert.throws(() => newGame([]), /1-5 players/);
    assert.throws(() => newGame(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA', 'SKIP', 'ERIC']), /1-5 players/);
    assert.throws(() => newGame(['ROXANA', 'ROXANA']), /same character/);
    assert.doesNotThrow(() => newGame(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA', 'SKIP']));
});

await check('Setup is repeatable: the same seed gives the same table, another seed a different one', () => {
    const a = newGame(['ROXANA', 'FLAGLER'], { seed: 42 }).game;
    const b = newGame(['ROXANA', 'FLAGLER'], { seed: 42 }).game;
    const c = newGame(['ROXANA', 'FLAGLER'], { seed: 43 }).game;
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.rows, c.rows);
});

await check('Variations: Lake Worth all closed; Jupiter Inlet second card of rounds 4 and 6 open; Peanut Island Auction Map Card open, no Kingston', () => {
    const jupiter = newGame(['ROXANA', 'FLAGLER'], { variation: 'JUPITER_INLET' }).game;
    const open = jupiter.luxuryByRound.flat().filter(s => s.faceUp).map(s => s.slotId);
    assert.deepEqual(open, ['lux-r4-2', 'lux-r6-2']);
    assert.equal(jupiter.auctionMapCard.faceUp, false);
    const peanut = newGame(['ROXANA', 'FLAGLER'], { variation: 'PEANUT_ISLAND' }).game;
    assert.equal(peanut.auctionMapCard.faceUp, true);
    assert.ok(peanut.luxuryByRound.flat().every(s => !s.faceUp));
    assert.throws(() => newGame(['KINGSTON', 'FLAGLER'], { variation: 'PEANUT_ISLAND' }), /Kingston/);
    assert.throws(() => newGame(['ROXANA', 'FLAGLER'], { variation: 'RED_REEF' }), /Unknown variation/);
});

await check('Initiative: the lowest number starts the round (rulebook examples)', () => {
    // Rules text: round 3, Edith 80, Bright Shell 30, Skip 60 -> Bright Shell starts.
    const a = newGame(['EDITH', 'BRIGHT_SHELL', 'SKIP']).game;
    assert.equal(a.players[R.startPlayerForRound(a, 3)].characterId, 'BRIGHT_SHELL');
    // Rulebook p7: Edith has the lowest R1 number (10). p9: round 2, Kingston starts (10).
    const b = newGame(['KINGSTON', 'ERIC', 'ROXANA', 'EDITH']).game;
    assert.equal(b.players[R.startPlayerForRound(b, 1)].characterId, 'EDITH');
    assert.equal(b.players[R.startPlayerForRound(b, 2)].characterId, 'KINGSTON');
    // Rulebook p14: round 4 Eric 10, Roxana 60, Edith 70 -> Eric; round 5 -> Edith (60).
    const c = newGame(['ERIC', 'ROXANA', 'EDITH']).game;
    assert.equal(c.players[R.startPlayerForRound(c, 4)].characterId, 'ERIC');
    assert.equal(c.players[R.startPlayerForRound(c, 5)].characterId, 'EDITH');
});

await check('Initiative: start players of all 8 rounds for the five version 1 characters', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA', 'SKIP']);
    const starters = [1, 2, 3, 4, 5, 6, 7, 8].map(r => game.players[R.startPlayerForRound(game, r)].characterId);
    assert.deepEqual(starters, ['BRIGHT_SHELL', 'ROXANA', 'BRIGHT_SHELL', 'CARINA', 'FLAGLER', 'SKIP', 'CARINA', 'BRIGHT_SHELL']);
});

await check('Turn order goes clockwise from the start player', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA']);
    assert.deepEqual(R.turnOrder(game, 2), [2, 3, 0, 1]);
    assert.equal(R.nextSeat(game, 3), 0);
    assert.throws(() => R.initiativeOf('ROXANA', 9), /Round must be 1-8/);
});

console.log('\nAll setup and data checks passed.');
