// Palm Beach table (step 1.2): where everything lies, and that the table is drawn from the rules-engine game.
// Source: PLAN.md "Table layout (Lars's decisions, 25 Nov 2026)".
import fs from 'node:fs';
import { assert, R, check, newGame } from './pb_helpers.js';
import * as L from '../js/pb/layout.js';

console.log('Palm Beach table: layout\n');

const overlaps = (a, b) => a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
const box = (pos, width = L.CARD, height = L.CARD) => ({ left: pos.left, top: pos.top, width: pos.width ?? width, height: pos.height ?? height });

await check('Rows 1-6 lie in 9 columns; rows 7-8 use columns 1-3 and 8-9 (Lagoon, Waterfront, Block ... Waterfront, Atlantic)', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER']);
    game.rows.forEach((row, i) => {
        const columns = row.map(c => L.mapCardPosition(c, row.length).column);
        assert.deepEqual(columns, i < 6 ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 7, 8], `row ${i + 1}`);
        row.forEach(c => assert.equal(L.mapCardPosition(c, row.length).top, i * 250));
    });
    const last = game.rows[7];
    assert.deepEqual(last.map(c => c.type), ['LAGOON', 'WATERFRONT', 'BLOCK', 'WATERFRONT', 'ATLANTIC']);
});

await check('The Auction Map Card lies at the end of rows 7 and 8, in the space of the four missing Blocks', () => {
    assert.deepEqual({ ...L.AUCTION_MAP }, { left: 750, top: 1500, width: 1000, height: 500 });
    const { game } = newGame(['ROXANA', 'FLAGLER']);
    const cards = game.rows.flatMap(row => row.map(c => box(L.mapCardPosition(c, row.length))));
    assert.equal(cards.length, 64);
    assert.ok(cards.every(c => !overlaps(c, L.AUCTION_MAP)), 'no Map Card lies under the Auction Map Card');
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) assert.ok(!overlaps(cards[i], cards[j]), 'no two Map Cards overlap');
    assert.ok(cards.every(c => c.left >= 0 && c.top >= 0 && c.left + 250 <= L.BOARD_WIDTH && c.top + 250 <= L.BOARD_HEIGHT));
});

await check('All 3 Property Cards lie on the Auction Map Card, side by side', () => {
    const cards = [0, 1, 2].map(i => box(L.propertyCardPosition(i)));
    cards.forEach(c => {
        assert.ok(c.left >= L.AUCTION_MAP.left && c.left + c.width <= L.AUCTION_MAP.left + L.AUCTION_MAP.width, 'inside the card, left to right');
        assert.ok(c.top >= L.AUCTION_MAP.top && c.top + c.height <= L.AUCTION_MAP.top + L.AUCTION_MAP.height, 'inside the card, top to bottom');
    });
    assert.ok(!overlaps(cards[0], cards[1]) && !overlaps(cards[1], cards[2]));
    assert.ok(cards[0].top === cards[1].top && cards[1].top === cards[2].top, 'side by side');
    assert.deepEqual([...L.PROPERTY_TABLE_ORDER], ['MAR_A_LAGO', 'GULF_STREAM', 'SPANISH_RIVER']);
});

await check('One Luxury Card to the right of each row; rows 4 and 6 have two stacked, the lower one showing a little', () => {
    for (let round = 1; round <= 8; round++) {
        const top = L.luxuryCardPosition(round, 0);
        assert.equal(top.top, 160 + (round - 1) * 250, `beside row ${round}`);
        assert.ok(top.left >= 0 && top.left + 250 <= 430, 'inside the 430 px right sidebar');
    }
    for (const round of [4, 6]) {
        const top = L.luxuryCardPosition(round, 0);
        const lower = L.luxuryCardPosition(round, 1);
        assert.ok(top.zIndex > lower.zIndex, 'the card auctioned first is on top');
        const showing = lower.left - top.left;
        assert.ok(showing >= 15 && showing <= 40, 'the lower card shows a little');
        assert.ok(lower.left + 250 <= 430);
        assert.equal(lower.top, top.top);
    }
});

await check('Every card shows the right picture from its sprite sheet', () => {
    assert.deepEqual(L.mapFrontSprite(0), { x: -0, y: -0, size: '2000px 2000px' });
    assert.deepEqual(L.mapFrontSprite(61), { x: -1250, y: -1750, size: '2000px 2000px' });
    assert.deepEqual(['LAGOON', 'WF_LAGOON', 'BLOCK', 'WF_ATLANTIC', 'ATLANTIC'].map(d => L.mapBackSprite(d).x), [-0, -250, -500, -750, -1000]);
    assert.throws(() => L.mapBackSprite('SWAMP'), /Unknown card back/);
    // Luxury sheet: column 1 = 1 point (5 cards), column 2 = 2 points (7), column 3 = 3 points (5).
    for (const card of R.LUXURY_CARDS) {
        const s = L.luxuryFrontSprite(card.spriteIndex);
        assert.equal(s.x, -(card.points - 1) * 250, `${card.name} is in the ${card.points}-point column`);
        assert.ok(s.y <= 0 && s.y >= -1500);
    }
    assert.equal(new Set(R.LUXURY_CARDS.map(c => JSON.stringify(L.luxuryFrontSprite(c.spriteIndex)))).size, 17);
    assert.deepEqual(['SPANISH_RIVER', 'GULF_STREAM', 'MAR_A_LAGO'].map(p => L.propertyFrontSprite(p).x), [-0, -250, -500]);
    assert.deepEqual(['MAR_A_LAGO', 'GULF_STREAM', 'SPANISH_RIVER'].map(p => L.auctionMapFrontSprite(p).y), [-0, -500, -1000]);
});

// ---- Drawing: a tiny stand-in for the browser page, enough to count what is drawn -----------------
function fakeDocument() {
    const make = (id = '') => {
        const classes = new Set();
        const el = {
            id, style: {}, dataset: {}, children: [], textContent: '', title: '',
            classList: {
                add: (...c) => c.forEach(x => classes.add(x)), remove: (...c) => c.forEach(x => classes.delete(x)),
                toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c)
            },
            set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(x => classes.add(x)); },
            get className() { return [...classes].join(' '); },
            set innerHTML(v) { if (v === '') el.children = []; },
            appendChild: (child) => { el.children.push(child); return child; },
            remove: () => {},
            querySelectorAll: () => []
        };
        return el;
    };
    const byId = { 'board-wrapper': make('board-wrapper'), 'grid-container': make('grid-container'), 'right-sidebar': make('right-sidebar') };
    return {
        byId,
        createElement: () => make(),
        getElementById: (id) => byId[id] || byId['right-sidebar'].children.find(c => c.id === id) || null
    };
}

globalThis.window = globalThis.window || {};
const T = await import('../js/pb/table.js');

await check('The table is drawn from the game: 64 Map Cards face down, the Auction Map Card, 3 Property Cards, 10 Luxury Cards', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER', 'BRIGHT_SHELL', 'CARINA']);
    const doc = fakeDocument();
    T.renderPalmBeachTable(game, doc);
    const board = doc.byId['grid-container'].children;
    const has = (el, c) => el.classList.contains(c);
    assert.equal(board.filter(el => has(el, 'pb-map-card')).length, 64);
    assert.ok(board.filter(el => has(el, 'pb-map-card')).every(el => !has(el, 'pb-face-up') && el.style.backgroundImage.includes('pb_map_cards_back')));
    assert.equal(board.filter(el => has(el, 'pb-auction-map')).length, 1);
    assert.equal(board.filter(el => has(el, 'pb-property-card')).length, 3);
    const luxury = doc.getElementById('pb-luxury-column').children;
    assert.equal(luxury.length, 10);
    assert.ok(luxury.every(el => !has(el, 'pb-face-up')), 'all Luxury Cards closed (Lake Worth)');
    assert.ok(doc.byId['board-wrapper'].classList.contains('pb-table'));
});

await check('The top card of each stack of two carries the number 2; no other card does', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER']);
    const doc = fakeDocument();
    T.renderPalmBeachTable(game, doc);
    const withBadge = doc.getElementById('pb-luxury-column').children.filter(el => el.children.some(c => c.classList.contains('pb-stack-count')));
    assert.deepEqual(withBadge.map(el => el.dataset.slotId), ['lux-r4-1', 'lux-r6-1']);
    assert.ok(withBadge.every(el => el.children[0].textContent === '2'));
});

await check('The Diamond stack and the pile of 7 Luxury Cards for Diamond trades are in the game but not drawn', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER']);
    const doc = fakeDocument();
    T.renderPalmBeachTable(game, doc);
    assert.equal(game.tradePile.length, 7);
    const drawn = [...doc.byId['grid-container'].children, ...doc.getElementById('pb-luxury-column').children];
    const drawnSlots = new Set(drawn.map(el => el.dataset.slotId).filter(Boolean));
    assert.equal(drawnSlots.size, 10);
    assert.ok(!drawn.some(el => /trade|diamond/i.test(el.id)));
});

await check('Cards are drawn as the game says: a flipped Map Card shows its front, an open Luxury Card its picture', () => {
    const { game } = newGame(['ROXANA', 'FLAGLER'], { variation: 'JUPITER_INLET' });
    game.rows[0][2].faceUp = true;
    const doc = fakeDocument();
    T.renderPalmBeachTable(game, doc);
    const flipped = doc.byId['grid-container'].children.find(el => el.dataset.cardId === game.rows[0][2].id);
    assert.ok(flipped.classList.contains('pb-face-up') && flipped.style.backgroundImage.includes('map_cards_front'));
    const open = doc.getElementById('pb-luxury-column').children.filter(el => el.classList.contains('pb-face-up')).map(el => el.dataset.slotId);
    assert.deepEqual(open, ['lux-r4-2', 'lux-r6-2'], 'Jupiter Inlet: the second cards of rounds 4 and 6 lie open');
});

await check('The players from the party menu become Palm Beach characters, in seating order', () => {
    const menuPlayers = [{ name: 'Anna', character: { id: 9 } }, { name: 'Bo', character: { id: 3 } }, { name: 'Cy', character: { id: 7 } }];
    const { game, seed } = T.createPalmBeachGame(menuPlayers, { seed: 5 });
    assert.deepEqual(game.players.map(p => [p.name, p.characterId]), [['Anna', 'SKIP'], ['Bo', 'FLAGLER'], ['Cy', 'BRIGHT_SHELL']]);
    assert.equal(seed, 5);
    assert.throws(() => T.palmBeachCharacterId({ id: 42 }), /No Palm Beach character/);
});

await check('The table has its own styles, and the Boca parts it replaces are switched off', () => {
    const css = fs.readFileSync('index.css', 'utf8');
    for (const id of ['#auction-A', '#auction-B', '#deck-container-0', '#deck-container-1', '#deck-container-2', '#objective-btn']) {
        assert.ok(css.includes(`#board-wrapper.pb-table ${id}`), `${id} is hidden on the Palm Beach table`);
    }
    assert.ok(fs.existsSync('public/assets/pb_map_cards_back.webp'));
    const html = fs.readFileSync('index.html', 'utf8');
    assert.ok(html.includes('id="settings-cog-btn"') && html.includes('id="luxury-decks-title"'));
});

console.log('\nAll table layout checks passed.');
