// Palm Beach rules: whole games, from setup to final scoring.
// 1. One scripted 4-player game, printed round by round, with every step checked by an independent bookkeeper.
// 2. Hundreds of random games (2-5 players, all characters, all variations) checked the same way.
import { assert, R, check, newGame } from './pb_helpers.js';

console.log('Palm Beach rules: full games\n');

const nameOf = (game, seat) => R.getCharacter(game.players[seat].characterId).name;

/**
 * Plays one whole game and checks it against the rules while it runs.
 * The bookkeeper counts gold on its own from the events, so a mistake in the engine's gold handling shows up.
 */
async function playAndAudit({ characterIds, seed, variation, askPlayer, print = false }) {
    const { game, rng } = newGame(characterIds, { seed, variation });
    const say = (line) => { if (print) console.log(line); };
    const ledger = game.players.map(() => R.START_GOLD);
    const count = { rounds: 0, luxuryAuctions: 0, propertyAuctions: 0, trades: 0, rolls: 0, failed: 0, unsold: 0 };
    let expectedSeat = null;
    let phase = null;

    const emit = (e, g) => {
        // Rules that must hold after every single step.
        g.players.forEach(p => {
            assert.ok(p.gold >= 0, `${p.characterId} has negative gold`);
            assert.ok(p.rerolls >= 0 && p.diamonds >= 0 && p.powers >= 0);
        });
        switch (e.type) {
            case 'ROUND_START': {
                count.rounds += 1;
                assert.equal(e.round, count.rounds, 'rounds are played 1 to 8 in order');
                const lowest = Math.min(...g.players.map(p => R.initiativeOf(p.characterId, e.round)));
                assert.equal(R.initiativeOf(g.players[e.startPlayer].characterId, e.round), lowest, 'lowest initiative starts');
                assert.ok(g.rows.slice(0, e.round - 1).flat().every(c => c.faceUp), 'all earlier rows are face up');
                assert.ok(g.rows.slice(e.round - 1).flat().every(c => !c.faceUp), 'this row and later rows are face down');
                expectedSeat = e.startPlayer;
                phase = 'FLIPPING';
                say(`\nRound ${e.round} (row ${e.round}, ${g.rows[e.round - 1].length} cards). ${nameOf(g, e.startPlayer)} starts with ${lowest}.`);
                break;
            }
            case 'TURN_START':
                assert.equal(e.playerId, expectedSeat, 'flipping turns go clockwise');
                expectedSeat = R.nextSeat(g, expectedSeat);
                break;
            case 'ROLL': case 'REROLL':
                count.rolls += 1;
                assert.ok(e.roll >= 1 && e.roll <= 6);
                break;
            case 'FLIP_FAILED':
                count.failed += 1;
                assert.equal(R.findCard(g, e.cardId).faceUp, false);
                say(`  ${nameOf(g, e.playerId)} rolls ${e.roll}: the card stays face down.`);
                break;
            case 'CARD_FLIPPED': {
                const card = R.findCard(g, e.cardId);
                assert.equal(card.row, g.round, 'only cards in the current row are flipped');
                assert.equal(card.faceUp, true);
                ledger[e.playerId] += e.reward.gold;
                const what = e.reward.diamonds ? `1 Diamond${e.reward.gold ? ` + ${e.reward.gold} Au` : ''}` : `${e.reward.gold} Au`;
                say(`  ${nameOf(g, e.playerId)} flips ${card.type.toLowerCase()}${e.roll ? ` (rolls ${e.roll})` : ''}: ${what}.`);
                break;
            }
            case 'DIAMOND_TRADE':
                count.trades += 1;
                assert.ok(g.players[e.playerId].diamonds < R.diamondTradeCost(g.players[e.playerId]));
                say(`  ${nameOf(g, e.playerId)} trades ${e.cost} Diamonds for the ${e.card.name} (${e.card.points} point${e.card.points > 1 ? 's' : ''}).`);
                break;
            case 'FLIPPING_DONE':
                assert.ok(R.isRowComplete(g), 'the phase ends only when the whole row is face up');
                phase = 'AUCTION';
                break;
            case 'AUCTION_START':
                assert.equal(phase === 'AUCTION' || e.kind === 'PROPERTY', true, 'auctions come after the flipping phase');
                if (e.kind === 'LUXURY') count.luxuryAuctions += 1; else count.propertyAuctions += 1;
                break;
            case 'BID':
                assert.ok(e.amount <= g.players[e.playerId].gold, 'never bid more gold than you have');
                break;
            case 'AUCTION_WON':
                ledger[e.playerId] -= e.price;
                say(`  Auction: ${nameOf(g, e.playerId)} pays ${e.price} Au for ${e.kind === 'PROPERTY' ? e.card.name : `the ${e.card.name}`} (${e.card.points} point${e.card.points > 1 ? 's' : ''}).`);
                break;
            case 'AUCTION_UNSOLD':
                count.unsold += 1;
                say(`  Auction: nobody bids on ${e.card.name}.`);
                break;
            case 'AUCTION_MAP_FLIPPED':
                assert.equal(count.rounds, 8, 'the Auction Map Card is flipped after round 8');
                assert.equal(count.luxuryAuctions, 10, 'after the last Luxury Auction');
                say(`\nProperty Auction: the Auction Map Card shows ${e.property.name} (${e.property.points} points).`);
                break;
            case 'CHARACTER_GOLD':
                ledger[e.playerId] += e.gold;
                say(`  ${nameOf(g, e.playerId)} collects ${e.gold} Au.`);
                break;
            default:
        }
        g.players.forEach(p => assert.equal(p.gold, ledger[p.id], `${p.characterId}: gold matches the bookkeeper after ${e.type}`));
    };

    const result = await R.playGame(game, askPlayer, { rng, emit });

    // Rules that must hold when the game is over.
    assert.equal(game.phase, 'GAME_OVER');
    assert.equal(count.rounds, 8);
    assert.equal(count.luxuryAuctions, 10, 'ten Luxury Auctions');
    assert.equal(count.propertyAuctions, 1, 'one Property Auction');
    assert.ok(game.rows.flat().every(c => c.faceUp), 'all 64 Map Cards are face up');
    assert.equal(game.rows.flat().length, 64);
    const owned = game.players.flatMap(p => p.luxuryCards);
    assert.equal(owned.length + game.unsoldLuxury.length + game.tradePile.length, 17, 'all 17 Luxury Cards are accounted for');
    assert.equal(new Set([...owned, ...game.unsoldLuxury, ...game.tradePile].map(c => c.id)).size, 17, 'no Luxury Card twice');
    assert.equal(owned.filter(c => c.source === 'AUCTION').length + game.unsoldLuxury.length, 10);
    assert.equal(owned.filter(c => c.source === 'DIAMOND_TRADE').length, count.trades);
    assert.equal(game.tradePile.length, 7 - count.trades);
    assert.ok(game.luxuryByRound.flat().every(s => s.faceUp && s.sold));
    assert.equal(game.auctionMapCard.faceUp, true);
    const holders = game.players.filter(p => p.property);
    assert.equal(holders.length, game.propertyUnsold ? 0 : 1, 'at most one Property Card is owned');
    if (holders.length) assert.equal(holders[0].property.id, game.auctionMapCard.propertyId);
    game.players.forEach(p => {
        assert.ok(p.diamonds < R.diamondTradeCost(p) || game.tradePile.length === 0, 'nobody is left holding a full set of Diamonds');
        assert.equal(result.scores[p.id].prestige, p.luxuryCards.reduce((s, c) => s + c.points, 0) + (p.property ? p.property.points : 0));
    });
    const top = Math.max(...result.scores.map(s => s.prestige));
    assert.ok(result.winners.length >= 1 && result.winners.every(w => result.scores[w].prestige === top), 'winners have the most Prestige Points');
    return { game, result, count };
}

// A sensible scripted player: takes Waterfront first, then Block, then Atlantic, then Lagoon; always re-rolls;
// pays up to 4 Au per point for a Luxury Card (more in later rounds) and up to all its gold for the property.
const sensiblePlayer = (request, game) => {
    switch (request.type) {
        case 'CHOOSE_CARD': {
            const row = game.rows[request.round - 1];
            const prefer = ['WATERFRONT', 'BLOCK', 'ATLANTIC', 'LAGOON'];
            const options = request.options.map(id => row.find(c => c.id === id));
            return options.sort((a, b) => prefer.indexOf(a.type) - prefer.indexOf(b.type))[0].id;
        }
        case 'REROLL': return true;
        case 'BID': {
            const limit = request.kind === 'PROPERTY' ? request.maxBid : request.card.points * (3 + game.round);
            return request.minBid <= Math.min(limit, request.maxBid) ? { action: 'BID', amount: request.minBid } : { action: 'PASS' };
        }
        case 'CHOOSE_LUXURY_PEEK': return request.options.slice(0, request.count);
        default: return true;
    }
};

// A player who does anything legal at random (driven by its own seeded dice, so runs are repeatable).
const randomPlayer = (seed) => {
    const dice = R.createRng(seed);
    return (request) => {
        switch (request.type) {
            case 'CHOOSE_CARD': return request.options[dice.int(request.options.length)];
            case 'REROLL': return dice.int(2) === 0;
            case 'BID': {
                if (dice.int(3) === 0) return { action: 'PASS' };
                const amount = request.minBid + dice.int(Math.min(4, request.maxBid - request.minBid + 1));
                return { action: 'BID', amount };
            }
            case 'CHOOSE_LUXURY_PEEK': return dice.shuffle(request.options).slice(0, request.count);
            default: return true;
        }
    };
};

await check('A full 4-player game played by script, from setup to final scoring (printed below)', async () => {
    const characterIds = ['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA'];
    console.log('   Players, clockwise: Roxana, Mr. Flagler, Bright Shell, Carina. Seed 2026.');
    const { game, result, count } = await playAndAudit({ characterIds, seed: 2026, askPlayer: sensiblePlayer, print: true });
    console.log('\nFinal scoring:');
    for (const s of result.scores) {
        console.log(`  ${nameOf(game, s.playerId).padEnd(13)} ${String(s.prestige).padStart(2)} Prestige Points (Luxury ${s.luxuryPoints}, Property ${s.propertyPoints}), ${s.gold} Au left`);
    }
    console.log(`  Winner: ${result.winners.map(w => nameOf(game, w)).join(' and ')} (decided by ${result.decidedBy.toLowerCase()}).`);
    console.log(`  ${count.rolls} die rolls, ${count.failed} failed flips, ${count.trades} Diamond trades, ${count.unsold} unsold cards.\n`);
});

await check('The same seed and the same choices give exactly the same game again', async () => {
    const run = () => playAndAudit({ characterIds: ['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA'], seed: 2026, askPlayer: sensiblePlayer });
    const [a, b] = [await run(), await run()];
    assert.deepEqual(a.game, b.game);
    const c = await playAndAudit({ characterIds: ['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA'], seed: 2027, askPlayer: sensiblePlayer });
    assert.notDeepEqual(a.game.rows, c.game.rows);
});

await check('Version 1 games with 2, 3, 4 and 5 players (the five version 1 characters), 100 games each', async () => {
    const pool = [...R.V1_CHARACTER_IDS];
    for (const players of [2, 3, 4, 5]) {
        for (let seed = 1; seed <= 100; seed++) {
            const characterIds = R.createRng(seed * 31 + players).shuffle(pool).slice(0, players);
            await playAndAudit({ characterIds, seed, askPlayer: seed % 2 ? sensiblePlayer : randomPlayer(seed) });
        }
    }
});

await check('600 random games: 1-5 players, all 10 characters, all three variations, players who do anything legal', async () => {
    const all = R.CHARACTERS.map(c => c.id);
    const variations = Object.values(R.VARIATIONS);
    const totals = { trades: 0, unsold: 0, propertyUnsold: 0, shared: 0, decided: {} };
    for (let seed = 1; seed <= 600; seed++) {
        const pick = R.createRng(seed * 7919);
        const variation = variations[seed % 3];
        const pool = variation === 'PEANUT_ISLAND' ? all.filter(id => id !== 'KINGSTON') : all;
        const characterIds = pick.shuffle(pool).slice(0, 1 + (seed % 5));
        const { game, result, count } = await playAndAudit({ characterIds, seed, variation, askPlayer: randomPlayer(seed + 1000) });
        totals.trades += count.trades;
        totals.unsold += count.unsold;
        totals.propertyUnsold += game.propertyUnsold ? 1 : 0;
        totals.decided[result.decidedBy] = (totals.decided[result.decidedBy] || 0) + 1;
    }
    // The random games must really have reached the unusual corners of the rules.
    assert.ok(totals.trades > 0, 'Diamond trades happened');
    assert.ok(totals.unsold > 0, 'some cards went unsold');
    assert.ok(totals.decided.PROPERTY > 0 && totals.decided.GOLD > 0 && totals.decided.POINTS > 0, 'every tiebreaker step was used');
    console.log(`      (${totals.trades} Diamond trades, ${totals.unsold} unsold cards; decided by points ${totals.decided.POINTS}, property ${totals.decided.PROPERTY}, gold ${totals.decided.GOLD}, shared ${totals.decided.SHARED || 0})`);
});

await check('The engine also works when the player answers later (as clicks on a screen do)', async () => {
    const slowPlayer = (request, game) => new Promise(resolve => setImmediate(() => resolve(sensiblePlayer(request, game))));
    const fast = await playAndAudit({ characterIds: ['SKIP', 'CARINA'], seed: 9, askPlayer: sensiblePlayer });
    const slow = await playAndAudit({ characterIds: ['SKIP', 'CARINA'], seed: 9, askPlayer: slowPlayer });
    assert.deepEqual(slow.game, fast.game);
});

await check('The rules engine has no screen code: it runs without a browser and imports nothing outside js/rules/', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve('js/rules');
    for (const file of fs.readdirSync(dir)) {
        const text = fs.readFileSync(path.join(dir, file), 'utf8');
        const imports = [...text.matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
        assert.ok(imports.every(i => i.startsWith('./')), `${file} imports only from js/rules/`);
        assert.ok(!/\b(document|window|localStorage)\b/.test(text), `${file} does not touch the browser`);
    }
});

console.log('\nAll full-game checks passed.');
