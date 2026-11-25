// Palm Beach step 1.4: the flipping phase on screen. The rules themselves are tested in
// pb_flipping_and_diamonds.test.js; here: the words the players see, and how the screen is wired to the engine.
import fs from 'node:fs';
import { assert, R, check, newGame } from './pb_helpers.js';
import * as M from '../js/pb/messages.js';

console.log('Palm Beach: the flipping phase on screen\n');

await check('Diamond trade popup uses Lars\'s words, with the right number of Diamonds, and one OK button', () => {
    const four = M.diamondTradeMessage({ type: 'DIAMOND_TRADE', playerId: 0, diamonds: 4, cost: 4 });
    assert.equal(four.text, 'You have 4 diamonds. Trade in for a Luxury Card.');
    assert.equal(four.ok, 'OK');
    const flagler = M.diamondTradeMessage({ type: 'DIAMOND_TRADE', playerId: 0, diamonds: 3, cost: 3 });
    assert.equal(flagler.text, 'You have 3 diamonds. Trade in for a Luxury Card.');
});

await check('Re-roll question: says the roll, what the card needs and how many re-rolls are left; yes and no', () => {
    const m = M.rerollMessage({ roll: 2, needed: 4, rerollsLeft: 1 }, 'LAGOON');
    assert.equal(m.title, 'YOU ROLLED 2');
    assert.match(m.text, /Lagoon needs 4 or more/);
    assert.match(m.text, /You have 1 re-roll\./);
    assert.ok(m.yes && m.no, 'the player can always say no');
    assert.match(M.rerollMessage({ roll: 1, needed: 3, rerollsLeft: 2 }, 'ATLANTIC').text, /Atlantic needs 3 or more.*You have 2 re-rolls\./);
});

await check('Round start message names the start player and the initiative number', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL']);
    game.round = 1;
    game.startPlayer = R.startPlayerForRound(game, 1);
    assert.equal(M.roundStartMessage(game, 1), 'ROUND 1: P3 STARTS (30)');
    game.round = 5;
    game.startPlayer = R.startPlayerForRound(game, 5);
    assert.equal(M.roundStartMessage(game, 5), 'ROUND 5: P2 STARTS (10)');
});

await check('Status line: round and phase, and whose turn it is and in which row', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER']);
    assert.deepEqual(M.statusText(game), { left: '', right: '' });
    game.round = 3; game.phase = 'FLIPPING'; game.currentPlayer = 1;
    assert.deepEqual(M.statusText(game), { left: 'ROUND 3 OF 8 · FLIP CARDS', right: 'P2: CHOOSE A CARD IN ROW 3' });
    game.phase = 'LUXURY_AUCTION'; game.currentPlayer = null;
    assert.deepEqual(M.statusText(game), { left: 'ROUND 3 OF 8 · LUXURY AUCTION', right: '' });
});

await check('Reward in words', () => {
    assert.equal(M.rewardText({ gold: 8, diamonds: 0 }), '8 Au');
    assert.equal(M.rewardText({ gold: 0, diamonds: 1 }), '1 Diamond');
    assert.equal(M.rewardText({ gold: 1, diamonds: 1 }), '1 Diamond + 1 Au');
});

await check('The screen plays the game through the rules engine: one place asks the players, one place shows what happened', () => {
    const match = fs.readFileSync('js/pb/match.js', 'utf8');
    // The engine runs the match (a tutorial lesson may give its own part of the game to play: step 2.2).
    assert.match(match, /play = playGame/);
    assert.match(match, /await play\(game, askPlayer, \{ rng, emit \}\)/, 'the engine runs the match');
    for (const request of ['CHOOSE_CARD', 'REROLL', 'DIAMOND_TRADE', 'BID']) assert.ok(match.includes(`case '${request}'`), `answers ${request}`);
    for (const event of ['ROUND_START', 'TURN_START', 'ROLL', 'FLIP_FAILED', 'CARD_FLIPPED', 'DIAMOND_TRADE', 'FLIPPING_DONE', 'GAME_OVER']) {
        assert.ok(match.includes(`case '${event}'`), `shows ${event}`);
    }
    // No rule is decided on the screen side: rewards, rolls and trades all come from the engine's events.
    assert.ok(!/\.gold\s*[+\-]=|\.diamonds\s*[+\-]=|\.rerolls\s*[+\-]=|rng\.die\(/.test(match), 'match.js changes no gold, Diamonds or re-rolls and rolls no die');
    const effects = fs.readFileSync('js/pb/effects.js', 'utf8');
    assert.ok(!/\.gold\s*[+\-]=|\.diamonds\s*[+\-]=/.test(effects));
    // Only face-down cards of the current row get a click: the engine's list of options decides.
    assert.match(match, /request\.options\.map\(cardEl\)/);
    // A match that was left (RESIGN, new match) stops instead of going on in the background.
    assert.match(match, /if \(!isCurrent\(\)\) return stopped\(\);/);
    assert.match(fs.readFileSync('js/game.js', 'utf8'), /runPalmBeachMatch\(thisMatch, \{\s*isCurrent: \(\) => state\.pb === thisMatch,/);
});

await check('Landmark cards are the 12 cards with a +2 or +1 circle', async () => {
    const { landmarkData } = await import('../js/landmarks.js');
    const landmarkSprites = landmarkData.map(l => l.row * 8 + l.col).sort((a, b) => a - b);
    const circled = R.MAP_CARDS.filter(c => c.bonus === 1 || c.bonus === 2).map(c => c.spriteIndex).sort((a, b) => a - b);
    assert.deepEqual(landmarkSprites, circled);
    for (const l of landmarkData) {
        const card = R.MAP_CARDS[l.row * 8 + l.col];
        assert.equal(card.bonus, l.bonusType === 'PLUS_ONE_AU' ? 1 : 2, `${l.name} pays what its circle shows`);
    }
});

console.log('\nAll flipping-on-screen checks passed.');
