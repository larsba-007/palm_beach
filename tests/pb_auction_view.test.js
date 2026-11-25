// Palm Beach step 1.5: the auctions on screen. The auction rules are tested in pb_auctions_and_scoring.test.js;
// here: the bid buttons, the words in the auction window, and a whole game played through those buttons.
import fs from 'node:fs';
import { assert, R, check, newGame } from './pb_helpers.js';
import * as M from '../js/pb/messages.js';

console.log('Palm Beach: auctions on screen\n');

await check('Bid buttons use the Boca system: raise the highest bid by 1, 3 or 5 Au', () => {
    assert.deepEqual([...M.RAISE_STEPS], [1, 3, 5]);
    // Nobody has bid yet: the buttons are opening bids of 1, 3 and 5 Au.
    const first = M.bidChoices({ highBid: 0, highBidder: null, minBid: 1, maxBid: 20 });
    assert.deepEqual(first.map(c => [c.label, c.amount, c.enabled]), [['BID 1', 1, true], ['BID 3', 3, true], ['BID 5', 5, true]]);
    // The highest bid is 7: the buttons bid 8, 10 and 12.
    const raise = M.bidChoices({ highBid: 7, highBidder: 2, minBid: 8, maxBid: 20 });
    assert.deepEqual(raise.map(c => [c.label, c.amount, c.hint]), [['RAISE +1', 8, '8 Au'], ['RAISE +3', 10, '10 Au'], ['RAISE +5', 12, '12 Au']]);
    assert.ok(raise.every(c => c.amount >= 8), 'every raise is at least 1 Au more');
});

await check('A raise the player cannot afford is switched off: you can never bid more gold than you have', () => {
    const choices = M.bidChoices({ highBid: 7, highBidder: 2, minBid: 8, maxBid: 10 });
    assert.deepEqual(choices.map(c => c.enabled), [true, true, false]);
    const poor = M.bidChoices({ highBid: 0, highBidder: null, minBid: 1, maxBid: 2 });
    assert.deepEqual(poor.map(c => c.enabled), [true, false, false]);
    // Every amount a button offers is accepted by the rules, for any state of an auction.
    for (let gold = 1; gold <= 12; gold++) {
        for (let high = 0; high < gold; high++) {
            const auction = R.createAuction([0, 1]);
            if (high > 0) { R.placeBid(auction, 0, high, 99); } else { auction.turn = 1; }
            const request = { highBid: auction.highBid, highBidder: auction.highBidder, minBid: R.minimumBid(auction), maxBid: gold };
            for (const c of M.bidChoices(request).filter(x => x.enabled)) {
                const copy = structuredClone(auction);
                assert.doesNotThrow(() => R.placeBid(copy, 1, c.amount, gold), `gold ${gold}, highest ${high}, button ${c.label}`);
            }
        }
    }
});

await check('The auction window says what is auctioned, the highest bid, who is in and whose turn it is', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL']);
    game.round = 3;
    assert.equal(M.auctionTitle(game, 'LUXURY'), 'LUXURY AUCTION · ROUND 3');
    assert.equal(M.auctionTitle(game, 'PROPERTY'), 'PROPERTY AUCTION');
    assert.equal(M.cardLine({ name: 'Rocket', points: 3 }), 'ROCKET · 3 PRESTIGE POINTS');
    assert.equal(M.cardLine({ name: 'Wine', points: 1 }), 'WINE · 1 PRESTIGE POINT');

    const auction = R.createAuction([2, 0, 1]);            // Bright Shell starts, then clockwise
    assert.deepEqual(M.highBidText(game, auction), { amount: 'NO BID YET', who: 'The lowest bid is 1 Au' });
    R.placeBid(auction, 2, 3, 5);
    R.passBid(auction, 0);
    assert.deepEqual(M.highBidText(game, auction), { amount: '3 Au', who: 'Highest bid: P3' });
    assert.deepEqual(M.bidderStatuses(game, auction).map(b => [b.name, b.status, b.isTurn]), [['P3', 'HIGHEST', false], ['P1', 'PASSED', false], ['P2', 'IN', true]]);
    assert.equal(M.bidTurnText(game, { playerId: 1, maxBid: 5 }), 'P2: BID OR PASS. YOU HAVE 5 Au.');
});

await check('Messages for a won card, an unsold card, a forced pass and the end of the game', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER']);
    assert.equal(M.auctionWonText(game, { kind: 'LUXURY', playerId: 1, card: { name: 'Rocket' }, price: 12 }), 'P2 WINS THE ROCKET FOR 12 Au');
    assert.equal(M.auctionWonText(game, { kind: 'PROPERTY', playerId: 0, card: { name: 'Mar-a-Lago' }, price: 40 }), 'P1 WINS MAR-A-LAGO FOR 40 Au');
    assert.equal(M.auctionUnsoldText({ kind: 'LUXURY', card: { name: 'Wine' } }), 'NOBODY BID. THE WINE IS REMOVED FROM THE GAME.');
    assert.equal(M.auctionUnsoldText({ kind: 'PROPERTY', card: { name: 'Spanish River Park' } }), 'NOBODY BID. NO ONE GETS SPANISH RIVER PARK.');
    assert.equal(M.forcedPassText(game, 0), 'P1 CANNOT AFFORD A HIGHER BID AND PASSES');
    const one = M.gameOverText({ winners: [1], decidedBy: 'PROPERTY', scores: [{ name: 'P1', prestige: 6, gold: 9 }, { name: 'P2', prestige: 6, gold: 0 }] });
    assert.equal(one.title, 'P2 WINS');
    assert.match(one.text, /P1: 6 Prestige Points, 9 Au.*P2: 6 Prestige Points, 0 Au.*tie, won by the Property Card/);
    const shared = M.gameOverText({ winners: [0, 1], decidedBy: 'SHARED', scores: [{ name: 'P1', prestige: 6, gold: 9 }, { name: 'P2', prestige: 6, gold: 9 }] });
    assert.equal(shared.title, 'P1 & P2 WIN');
});

await check('200 whole games bid only through the buttons: every game ends properly and nobody ever overbids', async () => {
    let sold = 0, unsold = 0, properties = 0;
    for (let seed = 1; seed <= 200; seed++) {
        const dice = R.createRng(seed + 500);
        const players = 2 + (seed % 4);
        const characterIds = R.createRng(seed).shuffle(R.CHARACTERS.map(c => c.id)).slice(0, players);
        const { game, rng } = newGame(characterIds, { seed });
        const askPlayer = (request) => {
            if (request.type === 'CHOOSE_CARD') return request.options[dice.int(request.options.length)];
            if (request.type === 'REROLL') return true;
            if (request.type === 'CHOOSE_LUXURY_PEEK') return request.options.slice(0, request.count);
            if (request.type !== 'BID') return true;
            const buttons = M.bidChoices(request).filter(c => c.enabled);
            if (!buttons.length || dice.int(3) === 0) return { action: 'PASS' };
            return { action: 'BID', amount: buttons[dice.int(buttons.length)].amount };
        };
        const result = await R.playGame(game, askPlayer, { rng, emit: (e) => { if (e.type === 'BID') assert.ok(e.amount <= game.players[e.playerId].gold); } });
        assert.equal(game.phase, 'GAME_OVER');
        assert.ok(game.players.every(p => p.gold >= 0));
        assert.ok(result.winners.length >= 1);
        sold += game.players.reduce((n, p) => n + p.luxuryCards.filter(c => c.source === 'AUCTION').length, 0);
        unsold += game.unsoldLuxury.length;
        properties += game.players.some(p => p.property) ? 1 : 0;
        assert.equal(game.players.reduce((n, p) => n + p.luxuryCards.filter(c => c.source === 'AUCTION').length, 0) + game.unsoldLuxury.length, 10, 'ten Luxury Auctions');
    }
    assert.ok(sold > 1500 && properties > 150, 'most cards are sold when players use the buttons');
    console.log(`      (${sold} Luxury Cards sold, ${unsold} unsold, ${properties} of 200 Property Cards sold)`);
});

await check('The auction window is wired to the engine: it asks the bidder, and shows bids, passes, wins and unsold cards', () => {
    const match = fs.readFileSync('js/pb/match.js', 'utf8');
    assert.match(match, /case 'BID':[\s\S]{0,200}return askBid\(request, game\);/);
    for (const event of ['AUCTION_START', 'BID', 'PASS', 'AUCTION_WON', 'AUCTION_UNSOLD', 'AUCTION_MAP_FLIPPED', 'CHARACTER_GOLD']) {
        assert.ok(match.includes(`case '${event}'`), `shows ${event}`);
    }
    assert.ok(!/STEP 1\.5/i.test(match.replace(/\/\/.*$/gm, '')), 'no "comes in step 1.5" message is left on screen');
    const view = fs.readFileSync('js/pb/auction_view.js', 'utf8');
    assert.ok(!/\.gold\s*[+\-]=|placeBid|passBid/.test(view), 'the window decides nothing: paying and the bidding rules stay in the engine');
    assert.match(view, /btn\.disabled = !choice\.enabled/);
    const css = fs.readFileSync('index.css', 'utf8');
    for (const id of ['#pb-auction-layer', '#pb-auction', '.pb-bid-btn']) assert.ok(css.includes(id), `${id} is styled`);
});

await check('After the Property Auction only the auctioned Property Card is left on the table, and none once it is won', async () => {
    globalThis.window = globalThis.window || {};
    const T = await import('../js/pb/table.js');
    const source = fs.readFileSync('js/pb/table.js', 'utf8');
    assert.match(source, /\(owned \|\| game\.propertyUnsold\) \? \[\] : \[game\.property\.id\]/);
    assert.ok(typeof T.renderPalmBeachTable === 'function');
});

console.log('\nAll auction-on-screen checks passed.');
