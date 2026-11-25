// Palm Beach table: the final scoring screen and the cheat sheet (step 1.6).
// Placed with absolute pixels inside the scaled table (3840 x 2160 canvas). No rules here: the scores
// come from js/rules/scoring.js and the reward numbers from js/rules/data.js.

import { CHARACTER_SPRITE_PRINT_URL } from '../data.js';
import { getCharacter } from '../rules/data.js';
import { characterSprite } from './layout.js';
import { finalScoreTable, cheatSheet } from './messages.js';

function el(doc, className, text) {
    const e = doc.createElement('div');
    e.className = className;
    if (text !== undefined) e.textContent = String(text);
    return e;
}
function at(e, left, top, width, height) {
    e.style.position = 'absolute';
    e.style.left = `${left}px`;
    e.style.top = `${top}px`;
    if (width !== undefined) e.style.width = `${width}px`;
    if (height !== undefined) e.style.height = `${height}px`;
    return e;
}
function button(doc, label, className, onclick) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    b.onclick = onclick;
    return b;
}

const ROW = 170;
const COLS = { place: 60, card: 180, name: 310, luxury: 1010, property: 1290, prestige: 1570, gold: 1930 };

/**
 * Shows the final scoring. Returns a Promise with what the players chose: 'AGAIN' or 'MENU'.
 * @param {{boardGameLink?: string}} [options]  text of the quiet link to the board game popup (web edition only)
 */
export function showFinalScreen(game, { boardGameLink = '' } = {}, doc = document) {
    const wrapper = doc.getElementById('board-wrapper');
    if (!wrapper) return Promise.resolve('MENU');
    doc.getElementById('pb-final-layer')?.remove();
    const table = finalScoreTable(game.result);
    const height = 400 + table.rows.length * ROW + 330 + (boardGameLink ? 90 : 0);

    const layer = el(doc, '');
    layer.id = 'pb-final-layer';
    const box = at(el(doc, 'v2-panel'), 715, Math.max(40, Math.round((2160 - height) / 2)), 2400, height);
    box.id = 'pb-final';

    box.appendChild(at(el(doc, 'pb-final-title', table.title), 0, 60, 2400));
    box.appendChild(at(el(doc, 'pb-final-how', table.how), 0, 190, 2400));
    [['LUXURY', COLS.luxury, 280], ['PROPERTY', COLS.property, 280], ['PRESTIGE', COLS.prestige, 360], ['GOLD LEFT', COLS.gold, 400]].forEach(([label, left, width]) => {
        box.appendChild(at(el(doc, 'pb-final-head', label), left, 310, width));
    });

    table.rows.forEach((row, i) => {
        const top = 380 + i * ROW;
        const line = at(el(doc, `pb-final-row${row.isWinner ? ' pb-final-winner' : ''}`), 40, top, 2320, ROW - 16);
        line.dataset.playerId = String(row.playerId);
        box.appendChild(line);
        box.appendChild(at(el(doc, 'pb-final-place', row.place), COLS.place, top, 100, ROW - 16));
        const card = at(el(doc, 'pb-final-card'), COLS.card, top + 6, 83, 142);
        const sprite = characterSprite(getCharacter(row.characterId).slot, 83, 142);
        card.style.backgroundImage = `url('${CHARACTER_SPRITE_PRINT_URL}')`;
        card.style.backgroundSize = sprite.size;
        card.style.backgroundPosition = `${sprite.x}px ${sprite.y}px`;
        box.appendChild(card);
        box.appendChild(at(el(doc, 'pb-final-name', row.name), COLS.name, top, 680, ROW - 16));
        box.appendChild(at(el(doc, 'pb-final-num', row.luxuryPoints), COLS.luxury, top, 280, ROW - 16));
        box.appendChild(at(el(doc, 'pb-final-num', row.propertyPoints), COLS.property, top, 280, ROW - 16));
        box.appendChild(at(el(doc, 'pb-final-num pb-final-prestige', row.prestige), COLS.prestige, top, 360, ROW - 16));
        box.appendChild(at(el(doc, 'pb-final-num pb-final-gold', `${row.gold} Au`), COLS.gold, top, 400, ROW - 16));
    });

    layer.appendChild(box);
    wrapper.appendChild(layer);

    return new Promise(resolve => {
        const done = (value) => { layer.remove(); resolve(value); };
        const buttonsTop = 400 + table.rows.length * ROW + 40;
        box.appendChild(at(button(doc, 'PLAY AGAIN', 'pb-dialog-btn pb-dialog-btn-primary pb-final-btn', () => done('AGAIN')), 560, buttonsTop, 600, 130));
        box.appendChild(at(button(doc, 'PARTY MENU', 'pb-dialog-btn pb-final-btn', () => done('MENU')), 1240, buttonsTop, 600, 130));
        if (boardGameLink) {
            // A quiet link (not a button) that opens the board game popup. The popup never opens by itself.
            const open = () => { if (typeof window !== 'undefined' && window.app?.showSupportModal) window.app.showSupportModal(); };
            box.appendChild(at(button(doc, boardGameLink, 'pb-final-link', open), 600, buttonsTop + 180, 1200, 70));
        }
    });
}

export function closeFinalScreen(doc = document) {
    doc.getElementById('pb-final-layer')?.remove();
}

/** Opens the cheat sheet: the reward table and the short rules. Closes on CLOSE or a click outside. */
export function showCheatSheet(doc = document) {
    const wrapper = doc.getElementById('board-wrapper');
    if (!wrapper) return;
    closeCheatSheet(doc);
    const sheet = cheatSheet();
    const layer = el(doc, '');
    layer.id = 'pb-cheat-layer';
    layer.onclick = (event) => { if (event.target === layer) closeCheatSheet(doc); };
    const height = 250 + sheet.table.length * 110 + sheet.lines.length * 130 + 200;
    const box = at(el(doc, 'v2-panel'), 1225, Math.round((2160 - height) / 2), 2100, height);
    box.id = 'pb-cheat';
    box.appendChild(at(el(doc, 'pb-final-title', sheet.title), 0, 60, 2100));
    sheet.table.forEach(([type, roll, reward], i) => {
        const top = 220 + i * 110;
        box.appendChild(at(el(doc, 'pb-cheat-row'), 80, top, 1940, 96));
        box.appendChild(at(el(doc, 'pb-cheat-type', type), 120, top, 700, 96));
        box.appendChild(at(el(doc, 'pb-cheat-roll', roll), 820, top, 560, 96));
        box.appendChild(at(el(doc, 'pb-cheat-reward', reward), 1380, top, 600, 96));
    });
    sheet.lines.forEach((line, i) => {
        box.appendChild(at(el(doc, 'pb-cheat-line', line), 100, 250 + sheet.table.length * 110 + i * 130, 1900, 120));
    });
    box.appendChild(at(button(doc, 'CLOSE', 'pb-dialog-btn pb-final-btn', () => closeCheatSheet(doc)), 800, height - 180, 500, 120));
    layer.appendChild(box);
    wrapper.appendChild(layer);
}

export function closeCheatSheet(doc = document) {
    doc.getElementById('pb-cheat-layer')?.remove();
}

/** The "? REWARDS" button in the top-right corner of the table, under COMPENDIUM. */
export function ensureCheatSheetButton(doc = document) {
    const sidebar = doc.getElementById('right-sidebar');
    if (!sidebar || doc.getElementById('pb-rules-btn')) return;
    const b = button(doc, '? REWARDS', '', () => showCheatSheet(doc));
    b.id = 'pb-rules-btn';
    sidebar.appendChild(b);
}
