// Palm Beach table: what the players see happen (dice, card flips, flying rewards, popups, messages).
// Every effect returns a Promise that finishes when the effect is over, so the game waits for it.
// Screen code only: the rules are in js/rules/.

import { CARD_SPRITE_URL, LUXURY_CARD_SPRITE_URL, PROPERTY_SPRITE_URL } from '../data.js';
import { audioMgr } from '../audio.js';
import { landmarkData } from '../landmarks.js';
import { showLandmarkDossier } from '../ui.js';
import { state } from '../state.js';
import { PB_MAP_BACK_URL } from './table.js';
import { DIAMOND_URL } from './panels.js';
import { luxuryFrontSprite, propertyFrontSprite } from './layout.js';

const BACK_ORDER = ['LAGOON', 'WF_LAGOON', 'BLOCK', 'WF_ATLANTIC', 'ATLANTIC'];

/** Waits; follows the player's speed setting when the game has one. */
export function wait(ms) {
    const scaled = (typeof window !== 'undefined' && window.getDelay) ? window.getDelay(ms) : ms;
    return new Promise(resolve => setTimeout(resolve, Math.max(0, scaled)));
}

const zoom = () => state.zoom || 1;
const play = (sound) => { try { audioMgr.play(sound); } catch { /* sound is never allowed to stop the game */ } };
export const playSound = play;

// ---- The die ---------------------------------------------------------------------------------------
/** Rolls the die on screen and shows the result. */
export async function rollDice(result) {
    const overlay = document.getElementById('dice-overlay');
    const cube = document.getElementById('dice-cube');
    const msg = document.getElementById('dice-message');
    if (!overlay || !cube) return;
    cube.style.transform = '';
    overlay.classList.remove('hidden');
    cube.classList.add('spinning');
    if (msg) { msg.style.opacity = '0'; msg.innerText = ''; }
    try { audioMgr.startDiceLoop(); } catch { /* no sound */ }
    await wait(650);
    cube.classList.remove('spinning');
    try { audioMgr.stopDiceLoop(); } catch { /* no sound */ }
    const faces = { 1: [0, 0], 2: [0, 180], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [90, 0] };
    const [x, y] = faces[result];
    cube.style.transform = `rotateX(${x + 360}deg) rotateY(${y + 720}deg)`;
    await wait(450);
    if (msg) { msg.style.opacity = '1'; msg.innerText = String(result); }
}

export function hideDice() {
    const overlay = document.getElementById('dice-overlay');
    const cube = document.getElementById('dice-cube');
    if (overlay) overlay.classList.add('hidden');
    if (cube) cube.style.transform = 'translateZ(-50px)';
}

// ---- Flipping a Map Card ----------------------------------------------------------------------------
/** Turns a Map Card over on screen (like turning a page), from its back to its front. */
export async function flipMapCard(el, card) {
    const rect = el.getBoundingClientRect();
    const container = document.createElement('div');
    container.className = 'flip-container';
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    container.style.width = `${rect.width}px`;
    container.style.height = `${rect.height}px`;
    container.style.zIndex = '100';
    container.style.pointerEvents = 'none';

    const flipper = document.createElement('div');
    flipper.className = 'flipper';
    const back = document.createElement('div');
    back.className = 'flip-face flip-face-back bg-white';
    back.style.backgroundImage = `url('${PB_MAP_BACK_URL}')`;
    back.style.backgroundSize = '500% 100%';
    back.style.backgroundPosition = `${(BACK_ORDER.indexOf(card.deck) / 4) * 100}% 0%`;
    const front = document.createElement('div');
    front.className = 'flip-face flip-face-front bg-white';
    front.style.backgroundImage = `url('${CARD_SPRITE_URL}')`;
    front.style.backgroundSize = '800% 800%';
    front.style.backgroundPosition = `${((card.spriteIndex % 8) / 7) * 100}% ${(Math.floor(card.spriteIndex / 8) / 7) * 100}%`;
    flipper.appendChild(back);
    flipper.appendChild(front);
    container.appendChild(flipper);
    document.body.appendChild(container);

    await wait(40);
    container.classList.add('flip');
    play('flip');
    if (card.isBlockBonus) play('bonus_card');
    await wait(850);
    container.remove();
}

// ---- Rewards flying to the player ---------------------------------------------------------------------
function fly(fromEl, toEl, build, ms = 800) {
    if (!fromEl || !toEl) return Promise.resolve();
    const from = fromEl.getBoundingClientRect();
    const to = toEl.getBoundingClientRect();
    const flyer = document.createElement('div');
    flyer.className = 'flying-text pb-flyer';
    build(flyer);
    flyer.style.left = `${from.left + from.width / 2}px`;
    flyer.style.top = `${from.top + from.height / 2}px`;
    flyer.style.transform = `translate(-50%, -50%) scale(${zoom()})`;
    document.body.appendChild(flyer);
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            flyer.style.transition = `left ${ms}ms cubic-bezier(0.3, 0, 0.5, 1), top ${ms}ms cubic-bezier(0.3, 0, 0.5, 1)`;
            flyer.style.left = `${to.left + to.width / 2}px`;
            flyer.style.top = `${to.top + to.height / 2}px`;
        });
        setTimeout(() => { flyer.remove(); resolve(); }, ms + 80);
    });
}

/** "+8 Au" flies from the card to the player's gold. */
export function flyGold(fromEl, playerId, gold) {
    play(gold >= 5 ? 'gold_large' : 'gold_small');
    return fly(fromEl, document.getElementById(`pb-gold-${playerId}`), (f) => { f.textContent = `+${gold} Au`; f.classList.add('pb-flyer-gold'); });
}

/** A Diamond flies from the card to the player's Diamonds. */
export function flyDiamond(fromEl, playerId) {
    play('gold_small');
    const target = document.querySelector(`#pb-panel-${playerId} .pb-panel-diamonds`);
    return fly(fromEl, target, (f) => {
        const img = document.createElement('img');
        img.src = DIAMOND_URL;
        img.style.width = '140px';
        f.appendChild(img);
    });
}

// ---- Landmarks ------------------------------------------------------------------------------------------
/** The landmark on this Map Card, or null. (Landmarks are listed by their place in the Map Card picture.) */
export function landmarkOf(card) {
    const row = Math.floor(card.spriteIndex / 8);
    const col = card.spriteIndex % 8;
    return landmarkData.find(l => l.row === row && l.col === col) || null;
}

/** Shows the landmark's story beside the board (the pop-up inherited from Boca). Ends when it closes. */
export function showLandmark(card) {
    const landmark = landmarkOf(card);
    if (!landmark) return Promise.resolve();
    return new Promise(resolve => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        showLandmarkDossier(landmark, { spriteIndex: card.spriteIndex }, false, '', finish);
        setTimeout(finish, 12000);      // never let a pop-up hold the game for ever
    });
}

// ---- A new Luxury Card (Automatic Diamond Trade) ----------------------------------------------------------
/**
 * A player gets a card: it appears large in the middle of the table, then flies to the player's panel.
 * Used for the "new Luxury Card" moment after a Diamond trade, and when a card is won at auction.
 * @param {{kind?: 'LUXURY'|'PROPERTY', hold?: number}} [options]  hold = how long the card stays in the middle (ms)
 */
export async function revealWonCard(card, playerId, { kind = 'LUXURY', hold = 1700 } = {}) {
    const board = document.getElementById('grid-container');
    const panel = document.getElementById(`pb-panel-${playerId}`);
    if (!board) return;
    const b = board.getBoundingClientRect();
    const size = 620 * zoom();
    const el = document.createElement('div');
    el.className = 'pb-luxury-reveal';
    const sprite = kind === 'PROPERTY' ? propertyFrontSprite(card.id) : luxuryFrontSprite(card.spriteIndex);
    const f = size / 250;
    const [w, h] = sprite.size.split(' ').map(v => parseFloat(v) * f);
    el.style.backgroundImage = `url('${kind === 'PROPERTY' ? PROPERTY_SPRITE_URL : LUXURY_CARD_SPRITE_URL}')`;
    el.style.backgroundSize = `${w}px ${h}px`;
    el.style.backgroundPosition = `${sprite.x * f}px ${sprite.y * f}px`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${b.left + b.width / 2 - size / 2}px`;
    el.style.top = `${b.top + b.height / 2 - size / 2}px`;
    el.style.transform = 'scale(0.1) rotate(-12deg)';
    el.style.opacity = '0';
    document.body.appendChild(el);
    play('win');
    await wait(30);
    el.style.transform = 'scale(1) rotate(0deg)';
    el.style.opacity = '1';
    await wait(hold);
    if (panel) {
        const p = panel.getBoundingClientRect();
        el.style.transition = 'all 0.7s cubic-bezier(0.5, 0, 0.3, 1)';
        el.style.left = `${p.left + p.width / 2 - size / 2}px`;
        el.style.top = `${p.top + p.height * 0.8 - size / 2}px`;
        el.style.transform = 'scale(0.12)';
        el.style.opacity = '0.3';
        await wait(720);
    }
    el.remove();
}

/** The "new Luxury Card" moment after a Diamond trade. */
export function revealLuxuryCard(card, playerId) {
    return revealWonCard(card, playerId, { kind: 'LUXURY' });
}

// ---- Popups and messages (inside the scaled table, placed with absolute pixels) -----------------------------
/**
 * A popup with a title, a text and buttons. Returns the value of the button that was pressed.
 * @param {{title: string, text: string, buttons: {label: string, value: any, primary?: boolean}[]}} options
 */
export function showDialog({ title, text, buttons }) {
    const wrapper = document.getElementById('board-wrapper');
    if (!wrapper) return Promise.resolve(buttons[0]?.value);
    document.getElementById('pb-dialog-layer')?.remove();
    const layer = document.createElement('div');
    layer.id = 'pb-dialog-layer';
    const box = document.createElement('div');
    box.id = 'pb-dialog';
    box.className = 'v2-panel';
    const h = document.createElement('div');
    h.className = 'pb-dialog-title';
    h.textContent = title;
    const p = document.createElement('div');
    p.className = 'pb-dialog-text';
    p.textContent = text;
    const row = document.createElement('div');
    row.className = 'pb-dialog-buttons';
    box.appendChild(h);
    box.appendChild(p);
    box.appendChild(row);
    layer.appendChild(box);
    wrapper.appendChild(layer);
    return new Promise(resolve => {
        buttons.forEach((b) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `pb-dialog-btn${b.primary ? ' pb-dialog-btn-primary' : ''}`;
            btn.textContent = b.label;
            btn.onclick = () => { layer.remove(); resolve(b.value); };
            row.appendChild(btn);
        });
    });
}

/** A short message over the board that goes away by itself. */
export async function showToast(text, ms = 1500) {
    const wrapper = document.getElementById('board-wrapper');
    if (!wrapper) return;
    document.getElementById('pb-toast')?.remove();
    const el = document.createElement('div');
    el.id = 'pb-toast';
    el.textContent = text;
    wrapper.appendChild(el);
    await wait(ms);
    el.remove();
}

/** The line at the top of the table: round and phase on the left of the title, whose turn it is on the right. */
export function setStatus(left, right) {
    const zone = document.querySelector('#board-wrapper .center-grid-zone');
    if (!zone) return;
    const ensure = (id) => {
        let el = document.getElementById(id);
        if (!el) { el = document.createElement('div'); el.id = id; el.className = 'pb-status'; zone.appendChild(el); }
        return el;
    };
    ensure('pb-status-round').textContent = left || '';
    ensure('pb-status-turn').textContent = right || '';
}

/** The gold frame round the row that is being played. */
export function frameRow(round) {
    const board = document.getElementById('grid-container');
    if (!board) return;
    let frame = document.getElementById('pb-row-frame');
    if (!round) { frame?.remove(); return; }
    if (!frame) { frame = document.createElement('div'); frame.id = 'pb-row-frame'; }
    frame.style.top = `${(round - 1) * 250}px`;
    board.appendChild(frame);       // (re)append: the table may have been drawn again
}
