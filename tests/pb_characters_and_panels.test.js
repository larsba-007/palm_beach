// Palm Beach step 1.3: the characters in the menus and the player panels.
// Source: PLAN.md step 1.3 and "Table layout" point 7; PROGRESS.md (the five version 1 characters, seating order).
import fs from 'node:fs';
import { assert, R, check, newGame } from './pb_helpers.js';
import * as L from '../js/pb/layout.js';

console.log('Palm Beach: characters in the menus, player panels\n');

globalThis.window = globalThis.window || {};
const { CHARACTERS } = await import('../js/characters.js');
const P = await import('../js/pb/panels.js');
const T = await import('../js/pb/table.js');

await check('The menus show the 10 Palm Beach characters, each in its picture slot, with the rules-engine numbers', () => {
    assert.equal(CHARACTERS.length, 10);
    assert.deepEqual(CHARACTERS.map(c => c.id), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual(CHARACTERS.map(c => c.name), ['EDITH', 'ROXANA', 'ADDISON', 'MR. FLAGLER', 'KINGSTON', 'MS. POST', 'ERIC', 'BRIGHT SHELL', 'CARINA', 'SKIP']);
    for (const c of CHARACTERS) {
        const rules = R.getCharacter(c.pbId);
        assert.equal(rules.slot, c.id);
        assert.deepEqual([c.startPowers, c.startRerolls, c.startDiamonds], [rules.powers, rules.rerolls, rules.diamonds], c.name);
        assert.equal(c.ability, rules.ability);
        assert.deepEqual(c.initiative, rules.initiative);
        assert.equal(c.startExtraTurns, 0, 'no Extra Turns in Palm Beach');
        assert.ok(c.description.length > 40 && c.hometown, `${c.name} has a story and a hometown`);
    }
    assert.ok(!CHARACTERS.some(c => /LEJA|SILVIANO/.test(c.name)), 'Leja and Silviano are Boca Raton only');
});

await check('No Boca Raton power is left in the character texts', () => {
    const text = fs.readFileSync('js/characters.js', 'utf8') + CHARACTERS.map(c => c.ability).join(' ');
    for (const boca of [/Luxury Pile/i, /skip their next turn/i, /row or column bonus/i, /\+1 Turn/i, /Extra Turn counter/i, /Start the game with 10 Au/i]) {
        assert.ok(!boca.test(text), `found a Boca rule: ${boca}`);
    }
});

await check('Version 1: Roxana, Mr. Flagler, Bright Shell, Carina and Skip are open; the other five are locked', async () => {
    globalThis.window.GameConfig = { isFullGame: false };
    globalThis.window.state = { activeGambitId: null };
    const { UnlockManager } = await import('../js/UnlockManager.js');
    const open = CHARACTERS.filter(c => UnlockManager.isEntityUnlocked({ ...c, unlockGambit: 99 })).map(c => c.name).sort();
    assert.deepEqual(open, ['BRIGHT SHELL', 'CARINA', 'MR. FLAGLER', 'ROXANA', 'SKIP']);
});

await check('Seats follow the order of the names in the party menu, whatever order the draft was held in', () => {
    // The draft shuffled the players: Cy drafted first. Their menu seats are still Anna 0, Bo 1, Cy 2.
    const drafted = [
        { name: 'Cy', menuSeat: 2, character: { id: 7 } },
        { name: 'Anna', menuSeat: 0, character: { id: 9 } },
        { name: 'Bo', menuSeat: 1, character: { id: 3 } }
    ];
    const { game } = T.createPalmBeachGame(drafted, { seed: 3 });
    assert.deepEqual(game.players.map(p => p.name), ['Anna', 'Bo', 'Cy']);
    assert.deepEqual(game.players.map(p => p.id), [0, 1, 2]);
    assert.deepEqual(R.turnOrder(game, 1).map(seat => game.players[seat].name), ['Bo', 'Cy', 'Anna'], 'clockwise');
    const source = fs.readFileSync('js/game.js', 'utf8');
    assert.ok(source.indexOf('p.menuSeat = idx') < source.indexOf('shuffle(state.players)'), 'the seat is noted before the draft shuffle');
});

await check('A panel shows gold, Prestige Points, re-rolls, Diamonds and the cards won, straight from the game', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL']);
    const start = game.players.map(p => P.panelFacts(game, p));
    assert.deepEqual(start.map(f => [f.gold, f.prestige, f.rerolls, f.diamonds]), [[5, 0, 0, 0], [5, 0, 0, 0], [5, 0, 1, 0]]);
    assert.deepEqual(start.map(f => f.diamondSlots), [4, 3, 4], 'Mr. Flagler needs 3 Diamonds, the others 4');
    assert.ok(start.every(f => f.won.length === 0 && !f.isCurrent));

    const roxana = game.players[0];
    roxana.gold = 21;
    roxana.diamonds = 2;
    R.giveLuxuryCard(roxana, { ...R.LUXURY_CARDS.find(c => c.name === 'Tiger') }, 'AUCTION');
    R.giveLuxuryCard(roxana, { ...R.LUXURY_CARDS.find(c => c.name === 'Rocket') }, 'DIAMOND_TRADE');
    roxana.property = { ...R.PROPERTY_CARDS[2] };
    game.currentPlayer = 0;
    game.startPlayer = 0;
    const f = P.panelFacts(game, roxana);
    assert.deepEqual([f.gold, f.prestige, f.rerolls, f.diamonds], [21, 1 + 3 + 2, 2, 2]);
    assert.deepEqual(f.won.map(c => c.name), ['Spanish River Park', 'Tiger', 'Rocket'], 'the Property Card first, then Luxury Cards in the order won');
    assert.ok(f.isCurrent && f.isStartPlayer);
});

await check('Panels for 2, 3, 4 and 5 players fit side by side in the left side (1118 px), without overlapping', () => {
    for (const count of [1, 2, 3, 4, 5]) {
        const p = L.panelLayout(count);
        for (let seat = 0; seat < count; seat++) {
            assert.ok(p.left(seat) >= 0 && p.left(seat) + p.width <= 1118, `${count} players: panel ${seat + 1} fits`);
            if (seat > 0) assert.ok(p.left(seat) >= p.left(seat - 1) + p.width, 'no overlap');
        }
        // Diamonds lie under the character card (PLAN.md, table layout point 7).
        assert.ok(p.diamondsTop >= p.cardTop + p.cardHeight);
        assert.ok(p.statsTop > p.diamondsTop && p.wonTop > p.statsTop);
        assert.ok(Math.abs(p.cardHeight / p.width - 1200 / 700) < 0.005, 'the character card keeps its shape');
    }
});

await check('Won cards are shown in true size; up to 5 lie fully visible, more than 5 overlap like in Boca Raton', () => {
    const p = L.panelLayout(4);
    assert.equal(p.wonSize, 250, 'true size: the same 250 px as the cards on the table');
    assert.ok(p.wonCard(0, 1).left >= 0 && p.wonCard(0, 1).left + p.wonSize <= p.width, 'the card fits inside the panel');
    const bottomOfTable = 2160 - 16;
    for (let total = 1; total <= 18; total++) {
        const cards = Array.from({ length: total }, (_, n) => p.wonCard(n, total));
        const last = cards[total - 1];
        assert.ok(p.hostTop + p.top + last.top + p.wonSize <= bottomOfTable, `${total} cards: the last card is still on the table`);
        const steps = cards.slice(1).map((c, i) => c.top - cards[i].top);
        if (total <= 5) {
            assert.ok(steps.every(step => step >= p.wonSize), `${total} cards: none overlaps`);
        } else {
            assert.ok(steps.every(step => step < p.wonSize && step >= 50), `${total} cards: they overlap, and at least 50 px of each stays visible`);
        }
        // As in Boca: the first card lies on top.
        assert.ok(cards.every((c, i) => i === 0 || c.zIndex < cards[i - 1].zIndex));
    }
    // The four small controls moved to the top-right corner, so nothing lies under the won cards.
    const css = fs.readFileSync('index.css', 'utf8');
    assert.match(css, /#board-wrapper\.pb-table #resign-btn \{\s*left: 50px;\s*top: 106px;/);
    assert.match(css, /#board-wrapper\.pb-table #settings-cog-btn \{\s*right: auto;\s*left: 332px;\s*top: 72px;/);
    assert.ok(!css.includes('left: -3350px'), 'RESIGN and the settings wheel are no longer in the bottom-left corner');
    // 5 players (not offered in the web menu yet): the cards shrink to the narrower panel.
    assert.equal(L.panelLayout(5).wonSize, 214);
});

await check('Character pictures and small won cards come from the right place in their sprite sheets', () => {
    assert.deepEqual(L.characterSprite(0, 265, 454), { x: -0, y: -0, size: '1325px 908px' });
    assert.deepEqual(L.characterSprite(9, 265, 454), { x: -1060, y: -454, size: '1325px 908px' });
    assert.deepEqual(L.scaleSprite({ x: -500, y: -250, size: '750px 1750px' }, 125), { x: -250, y: -125, size: '375px 875px' });
});

await check('Party menu: seating note added, Boca tutorial button hidden, Boca panels not updated during a Palm Beach match', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.match(html, /TYPE THE NAMES<br>IN THE ORDER YOU SIT, CLOCKWISE/);
    const css = fs.readFileSync('index.css', 'utf8');
    assert.match(css, /#v3-tutorial-btn,\s*#v3-tutorial-btn \+ div\s*\{\s*display:\s*none\s*!important/);
    const ui = fs.readFileSync('js/ui.js', 'utf8');
    assert.match(ui, /export function updateUI\(\) \{[\s\S]{0,300}if \(state\.pb\) return;/);
});

console.log('\nAll character and panel checks passed.');
