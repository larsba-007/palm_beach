// Palm Beach table: draws the table on screen from a rules-engine game (js/rules/).
// Step 1.2: the table is shown, nothing is clickable yet. Clicks and animations come in steps 1.4 and 1.5.
//
// Not shown on the table (Lars, PLAN.md): the Bank's Diamonds and the pile of 7 Luxury Cards for Diamond trades.
// They exist in the game (game.tradePile) but are invisible.

import { CARD_SPRITE_URL, LUXURY_CARD_SPRITE_URL, LUXURY_BACK_URL, AUCTION_CARD_SPRITE_URL, AUCTION_BACK_URL, PROPERTY_SPRITE_URL } from '../data.js';
import { createGame } from '../rules/setup.js';
import { createRng } from '../rules/rng.js';
import { CHARACTERS, VARIATIONS } from '../rules/data.js';
import {
    CARD, BOARD_WIDTH, BOARD_HEIGHT, AUCTION_MAP, PROPERTY_TABLE_ORDER,
    mapCardPosition, propertyCardPosition, luxuryCardPosition,
    mapFrontSprite, mapBackSprite, luxuryFrontSprite, propertyFrontSprite, auctionMapFrontSprite
} from './layout.js';

export const PB_MAP_BACK_URL = new URL(/* @vite-ignore */ '../../assets/pb_map_cards_back.webp', import.meta.url).href;

/**
 * The Boca menu and draft give each player a character by its slot in the character picture (0-9).
 * The Palm Beach cards sit in the same slots, so the slot tells us the Palm Beach character.
 */
export function palmBeachCharacterId(bocaCharacter) {
    const character = CHARACTERS.find(c => c.slot === bocaCharacter?.id);
    if (!character) throw new Error(`No Palm Beach character in slot ${bocaCharacter?.id}`);
    return character.id;
}

/** Creates the Palm Beach game for the players chosen in the party menu, in seating order. */
export function createPalmBeachGame(menuPlayers, { seed = Date.now(), variation = VARIATIONS.LAKE_WORTH } = {}) {
    const rng = createRng(seed);
    // Seats go clockwise in the order the names were typed in the party menu (Lars, 25 Nov 2026),
    // whatever order the draft was held in.
    const seated = menuPlayers.slice().sort((a, b) => (a.menuSeat ?? 0) - (b.menuSeat ?? 0));
    const game = createGame({
        players: seated.map(p => ({ name: p.name, characterId: palmBeachCharacterId(p.character) })),
        rng,
        variation
    });
    return { game, rng, seed };
}

function place(el, { left, top, width = CARD, height = CARD, zIndex }) {
    el.style.position = 'absolute';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    if (zIndex !== undefined) el.style.zIndex = String(zIndex);
}

function paint(el, url, sprite) {
    el.style.backgroundImage = `url('${url}')`;
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = sprite.size;
    el.style.backgroundPosition = `${sprite.x}px ${sprite.y}px`;
}

/** Shows one Map Card face up or face down. */
export function paintMapCard(el, card) {
    if (card.faceUp) paint(el, CARD_SPRITE_URL, mapFrontSprite(card.spriteIndex));
    else paint(el, PB_MAP_BACK_URL, mapBackSprite(card.deck));
    el.classList.toggle('pb-face-up', !!card.faceUp);
}

/** Shows one Luxury Card face up or face down. */
export function paintLuxuryCard(el, slot) {
    if (slot.faceUp) paint(el, LUXURY_CARD_SPRITE_URL, luxuryFrontSprite(slot.card.spriteIndex));
    else paint(el, LUXURY_BACK_URL, { x: 0, y: 0, size: '250px 250px' });
    el.classList.toggle('pb-face-up', !!slot.faceUp);
}

/** Shows the Auction Map Card face up or face down. */
export function paintAuctionMapCard(el, auctionMapCard) {
    if (auctionMapCard.faceUp) paint(el, AUCTION_CARD_SPRITE_URL, auctionMapFrontSprite(auctionMapCard.propertyId));
    else paint(el, AUCTION_BACK_URL, { x: 0, y: 0, size: '1000px 500px' });
    el.classList.toggle('pb-face-up', !!auctionMapCard.faceUp);
}

/**
 * Draws the whole Palm Beach table for this game.
 * Uses the existing game screen: the board area (#grid-container) and the right sidebar (#right-sidebar).
 */
export function renderPalmBeachTable(game, doc = document) {
    const wrapper = doc.getElementById('board-wrapper');
    const board = doc.getElementById('grid-container');
    const sidebar = doc.getElementById('right-sidebar');
    if (!board || !sidebar) throw new Error('The game screen is missing: cannot draw the Palm Beach table.');

    // Switches off the Boca parts of the screen (two mid-board auctions, three priced Luxury piles): see index.css, ".pb-table".
    if (wrapper) wrapper.classList.add('pb-table');

    // Fetch the card fronts now, so a card shows its picture the moment it is flipped.
    if (typeof Image !== 'undefined') {
        for (const url of [CARD_SPRITE_URL, LUXURY_CARD_SPRITE_URL, AUCTION_CARD_SPRITE_URL]) new Image().src = url;
    }

    // ---- The board: 8 rows of Map Cards -------------------------------------------------------
    board.innerHTML = '';
    board.style.width = `${BOARD_WIDTH}px`;
    board.style.height = `${BOARD_HEIGHT}px`;

    for (const row of game.rows) {
        for (const card of row) {
            const el = doc.createElement('div');
            el.id = `pb-card-${card.id}`;
            el.className = 'pb-card pb-map-card';
            el.dataset.cardId = card.id;
            el.dataset.row = String(card.row);
            el.dataset.type = card.type;
            place(el, mapCardPosition(card, row.length));
            paintMapCard(el, card);
            board.appendChild(el);
        }
    }

    // ---- The Auction Map Card, with the 3 Property Cards on it, side by side ---------------------
    const auctionMap = doc.createElement('div');
    auctionMap.id = 'pb-auction-map';
    auctionMap.className = 'pb-card pb-auction-map';
    place(auctionMap, AUCTION_MAP);
    paintAuctionMapCard(auctionMap, game.auctionMapCard);
    board.appendChild(auctionMap);

    PROPERTY_TABLE_ORDER.forEach((propertyId, index) => {
        const property = game.propertyCards.find(p => p.id === propertyId);
        const el = doc.createElement('div');
        el.id = `pb-property-${propertyId}`;
        el.className = 'pb-card pb-property-card';
        el.dataset.propertyId = propertyId;
        el.title = `${property.name}: ${property.points} Prestige Points`;
        place(el, { ...propertyCardPosition(index), zIndex: 3 });
        paint(el, PROPERTY_SPRITE_URL, propertyFrontSprite(propertyId));
        board.appendChild(el);
    });

    // ---- Luxury Cards: one to the right of each row, two stacked at rows 4 and 6 -------------------
    let column = doc.getElementById('pb-luxury-column');
    if (!column) {
        column = doc.createElement('div');
        column.id = 'pb-luxury-column';
        sidebar.appendChild(column);
    }
    column.innerHTML = '';

    for (const slots of game.luxuryByRound) {
        slots.forEach((slot, indexInRow) => {
            if (slot.sold) return;
            const el = doc.createElement('div');
            el.id = `pb-luxury-${slot.slotId}`;
            el.className = 'pb-card pb-luxury-card';
            el.dataset.slotId = slot.slotId;
            el.dataset.round = String(slot.round);
            place(el, luxuryCardPosition(slot.round, indexInRow));
            paintLuxuryCard(el, slot);
            // The top card of a stack of two carries the number 2.
            const waiting = slots.filter(s => !s.sold).length;
            if (indexInRow === 0 && waiting === 2) {
                const badge = doc.createElement('div');
                badge.className = 'pb-stack-count';
                badge.textContent = '2';
                el.appendChild(badge);
            }
            column.appendChild(el);
        });
    }
}

/** Removes the Palm Beach table again (used when leaving a match). */
export function clearPalmBeachTable(doc = document) {
    doc.getElementById('board-wrapper')?.classList.remove('pb-table');
    doc.getElementById('pb-luxury-column')?.remove();
    const board = doc.getElementById('grid-container');
    if (board) {
        board.querySelectorAll('.pb-card').forEach(el => el.remove());
        board.style.width = '';
        board.style.height = '';
    }
}
