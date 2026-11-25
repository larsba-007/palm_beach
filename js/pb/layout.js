// Palm Beach table: where everything lies (PLAN.md, "Table layout", Lars's decisions 25 Nov 2026).
// Pure numbers, no screen code, so the layout can be tested without a browser.
// All positions are pixels on the fixed 3840 x 2160 canvas (absolute layout rule, DESIGN_RECIPE.md).

export const CARD = 250;                    // every Map, Luxury and Property Card is 250 x 250 on the table
export const BOARD_WIDTH = 9 * CARD;        // 2250
export const BOARD_HEIGHT = 8 * CARD;       // 2000

// Rows 7 and 8 have 5 cards: Lagoon, Waterfront, Block ... Waterfront, Atlantic.
// The four missing Blocks (columns 3-6) leave room for the Auction Map Card.
const SHORT_ROW_COLUMNS = [0, 1, 2, 7, 8];

/** Position of a Map Card inside the board (the board's top-left corner is 0, 0). */
export function mapCardPosition(card, rowLength) {
    const column = rowLength === 5 ? SHORT_ROW_COLUMNS[card.position] : card.position;
    return { left: column * CARD, top: (card.row - 1) * CARD, column };
}

/** The Auction Map Card: at the end of rows 7 and 8, in the space of the four missing Block cards (1000 x 500). */
export const AUCTION_MAP = Object.freeze({ left: 3 * CARD, top: 6 * CARD, width: 4 * CARD, height: 2 * CARD });

/** The 3 Property Cards lie on the Auction Map Card, side by side. Positions inside the board. */
export function propertyCardPosition(index) {
    const gap = 25;
    const first = AUCTION_MAP.left + (AUCTION_MAP.width - (3 * CARD + 2 * gap)) / 2;       // centred: 100 px from the card's edge
    return { left: first + index * (CARD + gap), top: AUCTION_MAP.top + 100 };
}

// Luxury Cards: one face-down card to the right of each row, in the right sidebar (430 px wide).
// Rows 4 and 6 have two cards stacked: the lower card shows a little to the right of the top card,
// and the top card carries the number 2.
export const LUXURY_COLUMN = Object.freeze({ left: 78, boardTop: 160, stackOffset: 26 });

/**
 * Position of a Luxury Card inside the right sidebar.
 * @param {number} round      1-8
 * @param {number} indexInRow 0 = the card auctioned first (on top), 1 = the second card (underneath)
 */
export function luxuryCardPosition(round, indexInRow) {
    return {
        left: LUXURY_COLUMN.left + indexInRow * LUXURY_COLUMN.stackOffset,
        top: LUXURY_COLUMN.boardTop + (round - 1) * CARD,
        zIndex: indexInRow === 0 ? 2 : 1
    };
}

// ---- Where each picture sits in its sprite sheet (background-position in pixels) ----------------

/** Map Card front: public/assets/map_cards_front.webp, 8 x 8 cards of 250 px. */
export function mapFrontSprite(spriteIndex) {
    return { x: -(spriteIndex % 8) * CARD, y: -Math.floor(spriteIndex / 8) * CARD, size: '2000px 2000px' };
}

/** Map Card back: public/assets/pb_map_cards_back.webp, 5 backs in a row. */
const BACK_ORDER = ['LAGOON', 'WF_LAGOON', 'BLOCK', 'WF_ATLANTIC', 'ATLANTIC'];
export function mapBackSprite(deck) {
    const index = BACK_ORDER.indexOf(deck);
    if (index < 0) throw new Error(`Unknown card back: ${deck}`);
    return { x: -index * CARD, y: 0, size: '1250px 250px' };
}

/** Luxury Card front: public/assets/luxury_cards_front.webp, 3 columns (1, 2, 3 points) of 250 px cards. */
export function luxuryFrontSprite(spriteIndex) {
    let col = 0, row = spriteIndex;
    if (spriteIndex > 11) { col = 2; row = spriteIndex - 12; } else if (spriteIndex > 4) { col = 1; row = spriteIndex - 5; }
    return { x: -col * CARD, y: -row * CARD, size: '750px 1750px' };
}

/** Property Card front: public/assets/property_cards_front.webp: Spanish River, Gulf Stream, Mar-a-Lago. */
const PROPERTY_ORDER = ['SPANISH_RIVER', 'GULF_STREAM', 'MAR_A_LAGO'];
export function propertyFrontSprite(propertyId) {
    return { x: -PROPERTY_ORDER.indexOf(propertyId) * CARD, y: 0, size: '750px 250px' };
}

/** Auction Map Card front: public/assets/auction_cards_front.webp: Mar-a-Lago, Gulf Stream, Spanish River (1000 x 500 each). */
const AUCTION_MAP_ORDER = ['MAR_A_LAGO', 'GULF_STREAM', 'SPANISH_RIVER'];
export function auctionMapFrontSprite(propertyId) {
    return { x: 0, y: -AUCTION_MAP_ORDER.indexOf(propertyId) * 500, size: '1000px 1500px' };
}

/** The order the 3 Property Cards lie in on the table: highest first (IV, III, II). */
export const PROPERTY_TABLE_ORDER = Object.freeze(['MAR_A_LAGO', 'GULF_STREAM', 'SPANISH_RIVER']);
