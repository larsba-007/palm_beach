// Palm Beach step 1.6: final scoring screen, cheat sheet, the rules in the Compendium, leaving a match, sounds.
import fs from 'node:fs';
import { assert, R, check, newGame } from './pb_helpers.js';
import * as M from '../js/pb/messages.js';
import { palmBeachRules, palmBeachRulesHtml } from '../js/pb/rules_text.js';

console.log('Palm Beach: end of game and polish\n');

const lux = (name) => ({ ...R.LUXURY_CARDS.find(c => c.name === name) });

await check('Final scoring table: the winner first, then by Prestige Points; says how the game was decided', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'SKIP']);
    game.players[0].luxuryCards = [lux('Wine')];                       // 1
    game.players[1].luxuryCards = [lux('Rocket'), lux('Rings')];       // 5
    game.players[2].luxuryCards = [lux('Hotel')];                      // 3
    const t = M.finalScoreTable(R.finalScoring(game));
    assert.equal(t.title, 'P2 WINS');
    assert.equal(t.how, 'Most Prestige Points.');
    assert.deepEqual(t.rows.map(r => [r.place, r.name, r.prestige, r.isWinner]), [[1, 'P2', 5, true], [2, 'P3', 3, false], [3, 'P1', 1, false]]);
    assert.deepEqual(t.rows.map(r => [r.luxuryPoints, r.propertyPoints]), [[5, 0], [3, 0], [1, 0]]);
});

await check('Final scoring table: each tiebreaker step is explained in words', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'SKIP']);
    game.players[0].luxuryCards = [lux('Rocket'), lux('Hotel')];       // 6, 50 Au
    game.players[0].gold = 50;
    game.players[1].luxuryCards = [lux('Rings'), lux('Racehorse')];    // 4 + 2 = 6, holds the property
    game.players[1].property = { ...R.PROPERTY_CARDS[2] };
    let t = M.finalScoreTable(R.finalScoring(game));
    assert.equal(t.title, 'P2 WINS');
    assert.match(t.how, /the tied player holding the Property Card wins/);
    assert.deepEqual(t.rows.map(r => r.name), ['P2', 'P1', 'P3'], 'the winner is listed first even with less gold');

    game.players[1].property = null;                                    // now 6 against 4: no tie
    game.players[1].luxuryCards.push(lux('Art Gallery'));               // 6 against 6, no property
    game.players[1].gold = 9;
    t = M.finalScoreTable(R.finalScoring(game));
    assert.equal(t.title, 'P1 WINS');
    assert.match(t.how, /most gold left wins/);

    game.players[1].gold = 50;
    t = M.finalScoreTable(R.finalScoring(game));
    assert.equal(t.title, 'P1 & P2 SHARE THE VICTORY');
    assert.match(t.how, /the victory is shared/);
    assert.deepEqual(t.rows.map(r => r.place), [1, 1, 3]);
});

await check('Cheat sheet: the Palm Beach reward table, with numbers taken from the rules engine', () => {
    const sheet = M.cheatSheet();
    assert.deepEqual(sheet.table, [
        ['LAGOON', 'Roll 4–6', '8 Au'],
        ['ATLANTIC', 'Roll 3–6', '6 Au'],
        ['WATERFRONT', 'No roll', '1 Diamond'],
        ['BLOCK', 'No roll', '3 Au']
    ]);
    const text = sheet.lines.join(' ');
    assert.match(text, /\+5, \+2 or \+1 Au extra/);
    assert.match(text, /4 Diamonds \(Mr\. Flagler 3\)/);
    assert.match(text, /lowest bid 1 Au, raise by at least 1 Au, never bid more than you have/);
    assert.match(text, /a tie goes to the Property Card, then to the most gold/);
    assert.ok(!/4 Au|row or column|Extra Turn|15 Au/.test(JSON.stringify(sheet)), 'no Boca Raton rule on the Palm Beach cheat sheet');
});

await check('Compendium rules are the Palm Beach rules, with no Boca Raton rule left', () => {
    const sections = palmBeachRules();
    assert.deepEqual(sections.map(s => s.heading), ['OBJECTIVE', 'A ROUND', 'MAP CARDS', 'DIAMONDS', 'RE-ROLLS', 'AUCTIONS', 'THE PROPERTY AUCTION', 'WINNING']);
    const text = JSON.stringify(sections);
    for (const must of ['Everyone starts with 5 Au', '8 rounds', 'lowest number starts the round', 'Roll 4–6. 8 Au', 'Roll 3–6. 6 Au', 'no roll. 1 Diamond', 'no roll. 3 Au',
        '4 Diamonds (Mr. Flagler: 3)', 'Rounds 4 and 6 have two cards', 'lowest bid is 1 Au', 'never bid more gold than you have', 'Mar-a-Lago (4 points)', 'worth 2–4 Prestige Points']) {
        assert.ok(text.includes(must), `the rules say: ${must}`);
    }
    for (const boca of [/15 Au PILE/i, /buy the top card/i, /row and column/i, /Extra Turn/i, /WATERFRONT \(4 Au\)/i, /Visitor/i, /final Waterfront card/i]) {
        assert.ok(!boca.test(text), `Boca rule found: ${boca}`);
    }
    const html = palmBeachRulesHtml();
    assert.ok(html.includes('PROPERTY AUCTION') && !/<script/i.test(html));
    const ui = fs.readFileSync('js/ui.js', 'utf8');
    assert.match(ui, /tabName === 'RULES'\) \{[\s\S]{0,300}content = palmBeachRulesHtml\(\);/);
    assert.ok(!ui.includes('15 Au PILE'), 'the Boca rules text is gone from the Compendium');
});

await check('Compendium: Boca-only tabs are hidden, and the Block Bonus text matches Palm Beach', () => {
    const css = fs.readFileSync('index.css', 'utf8');
    assert.match(css, /#comp-tab-BOTS,\s*#comp-tab-PROFILE,\s*#comp-tab-LORE\s*\{\s*display:\s*none\s*!important/);
    const html = fs.readFileSync('index.html', 'utf8');
    assert.ok(html.includes('9 Block Bonus Cards</strong> among the 32 Block cards'));
    assert.ok(!html.includes('BONUS CARD COUNTS'), 'the Boca column counts are gone');
});

await check('Final screen and leaving: PLAY AGAIN and PARTY MENU, RESIGN returns to the menu, nothing is left on screen', () => {
    const end = fs.readFileSync('js/pb/end_screen.js', 'utf8');
    assert.match(end, /'PLAY AGAIN'[\s\S]{0,120}done\('AGAIN'\)/);
    assert.match(end, /'PARTY MENU'[\s\S]{0,120}done\('MENU'\)/);
    assert.ok(!/\.gold\s*[+\-]=|prestige\s*[+\-]=/.test(end), 'the screen only shows the scores');
    const match = fs.readFileSync('js/pb/match.js', 'utf8');
    assert.match(match, /case 'GAME_OVER': \{[\s\S]{0,500}await showFinalScreen\(game, \{ boardGameLink \}\);\s*if \(isCurrent\(\)\) onFinished\(choice\);/);
    for (const cleaned of ['hideDice()', 'closeAuction()', 'closeFinalScreen()', 'closeCheatSheet()', 'frameRow(null)', "setStatus('', '')"]) {
        assert.ok(match.slice(match.indexOf('export function leavePalmBeachMatch')).includes(cleaned), `leaving a match runs ${cleaned}`);
    }
    const game = fs.readFileSync('js/game.js', 'utf8');
    assert.match(game, /export function confirmResign\(\) \{[\s\S]{0,260}if \(state\.pb\) \{[\s\S]{0,200}leavePalmBeachTable\(false\);\s*return;/);
    assert.match(game, /export function leavePalmBeachTable\(playAgain = false\) \{\s*leavePalmBeachMatch\(\);\s*state\.pb = null;/);
    assert.match(game, /onFinished: \(choice\) => leavePalmBeachTable\(choice === 'AGAIN'\)/);
});

await check('The link to the board game popup is on the final screen in the web edition only, and the popup never opens by itself', () => {
    const game = fs.readFileSync('js/game.js', 'utf8');
    assert.match(game, /boardGameLink: \(window\.GameConfig && window\.GameConfig\.isWeb\) \? SUPPORT_US\.gameOverLink : ''/);
    const end = fs.readFileSync('js/pb/end_screen.js', 'utf8');
    assert.match(end, /if \(boardGameLink\) \{/);
    assert.ok(!/setTimeout\([^)]*showSupportModal/.test(end), 'no timer opens the popup');
    assert.equal([...end.matchAll(/showSupportModal\(\)/g)].length, 1, 'only the link opens it');
});

await check('Sounds: round start, turn change, dice, flip, gold, bids, pass, win and the winner song', () => {
    const match = fs.readFileSync('js/pb/match.js', 'utf8');
    const effects = fs.readFileSync('js/pb/effects.js', 'utf8');
    const data = fs.readFileSync('js/data.js', 'utf8');
    const code = match + effects;
    for (const sound of ['the_gong', 'turn_switch', 'flip', 'bonus_card', 'gold_small', 'gold_large', 'auction_alert', 'bid', 'fold', 'win', 'winner_song']) {
        assert.ok(code.includes(`'${sound}'`), `${sound} is played`);
        assert.ok(new RegExp(`\\b${sound}:`).test(data), `${sound} exists in js/data.js`);
    }
    assert.ok(effects.includes('startDiceLoop') && effects.includes('stopDiceLoop'));
});

console.log('\nAll end-of-game and polish checks passed.');
