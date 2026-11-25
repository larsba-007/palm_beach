/**
 * web_party.js
 * Rules of the Web Party Edition (2-4 human players on one screen, Red Reef only, no visitors/AI).
 * Pure functions with no DOM access so they can be unit tested. Used by main.js only when
 * GameConfig.isWeb is true; Steam Full and Demo never call into this module.
 */

export const WEB_PARTY = {
    minPlayers: 2,
    maxPlayers: 4,
    // The only game variation of the Web edition (Red Reef = open luxury cards, closed auction)
    variation: 'JAEGA',
    // The tutorial button plays the guided Gambit 1 first, then the lessons continue in this order
    tutorialGambitId: 1,
    tutorialGambitIds: [1, 2, 3, 4]
};

/** Keeps a requested player count within 2-4 (non-numbers fall back to the minimum). */
export function clampWebPlayers(count) {
    const n = Math.round(Number(count));
    if (!Number.isFinite(n)) return WEB_PARTY.minPlayers;
    return Math.min(WEB_PARTY.maxPlayers, Math.max(WEB_PARTY.minPlayers, n));
}

/**
 * Forces the match config to the Web Party rules: 2-4 humans, never any visitors,
 * no hidden-bot-money leftovers from a gambit. Mutates and returns the config.
 */
export function applyWebPartyConfig(config) {
    config.humans = clampWebPlayers(config.humans);
    config.bots = 0;
    config.showBotMoney = false;
    return config;
}

/** Default party name for a 0-based player slot, e.g. PLAYER 1. */
export function defaultPartyName(index) {
    return `PLAYER ${index + 1}`;
}

/**
 * True when a name box still holds the Steam-style default ("LOCAL", "LOCAL 1") or is empty,
 * so it can be replaced by the party default without touching a name the players typed.
 */
export function isSteamDefaultName(value) {
    return /^(LOCAL( \d)?)?$/i.test(String(value ?? '').trim());
}

/**
 * What happens after a tutorial gambit ends (button on the end-of-match screen):
 * - lost: retry the same gambit
 * - won, more lessons left: start the next lesson (Gambits 1 -> 2 -> 3 -> 4)
 * - won the last lesson (or not a tutorial gambit): finish and return to the party menu
 * @returns {{action: 'START', gambitId: number} | {action: 'FINISH'}}
 */
export function nextWebTutorialStep(currentId, isWin) {
    const ids = WEB_PARTY.tutorialGambitIds;
    if (!ids.includes(currentId)) return { action: 'FINISH' };
    if (!isWin) return { action: 'START', gambitId: currentId };
    const next = ids[ids.indexOf(currentId) + 1];
    return next === undefined ? { action: 'FINISH' } : { action: 'START', gambitId: next };
}

/** Label of the primary end-of-match button during the Web tutorial. */
export function webTutorialPrimaryLabel(currentId, isWin) {
    if (!isWin) return 'RETRY';
    return nextWebTutorialStep(currentId, true).action === 'START' ? 'NEXT LESSON' : 'FINISH TUTORIAL';
}

/** The tutorial is played under player 1's typed name; an empty box keeps the previous name. */
export function pickTutorialName(typedName, previousName) {
    const typed = String(typedName ?? '').trim();
    if (typed) return typed;
    return String(previousName ?? '').trim() || defaultPartyName(0);
}

/**
 * Ids of the tutorial lesson popups that live directly on the page (g1-intro-overlay, g2-bonus-overlay,
 * g2-step-popup, g4-popup-overlay, ...). They are removed when the party menu opens, so a lesson that was
 * left halfway cannot leave its popup floating over the menu.
 */
export function isTutorialPopupId(id) {
    return /^g[1-9]-[a-z0-9-]*-(overlay|popup)$/.test(String(id ?? ''));
}

// ---- Small windows, touch screens and keyboards (Web only) ----

/** Height of the fixed 4K virtual canvas (js/main.js scales it with min(w/3840, h/2160)). */
export const WEB_CANVAS_HEIGHT = 2160;

/**
 * Vertical offset (px) that centers the scaled in-game board when the window is taller than the 16:9 canvas.
 * 0 when the board fills the height (or for invalid input).
 */
export function webBoardOffsetY(viewportHeight, zoom, canvasHeight = WEB_CANVAS_HEIGHT) {
    const h = Number(viewportHeight);
    const z = Number(zoom);
    if (!Number.isFinite(h) || !Number.isFinite(z) || h <= 0 || z <= 0) return 0;
    return Math.max(0, Math.round((h - canvasHeight * z) / 2));
}

/**
 * True when the focused element is a text box, so a resize caused by a touch keyboard can be ignored
 * (the keyboard shrinks window.innerHeight and would otherwise rescale the whole menu while typing).
 */
export function isTextEntryElement(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag !== 'INPUT') return false;
    const type = String(el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(type);
}

/**
 * Which hint the small-window notice should show: 'ROTATE' for portrait windows, 'SMALL' for landscape
 * windows narrower than 1024 px, otherwise null (no hint). Invalid sizes give null.
 */
export function webSizeHint(width, height) {
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    if (h > w) return 'ROTATE';
    if (w < 1024) return 'SMALL';
    return null;
}

export const WEB_SIZE_HINT_TEXT = {
    ROTATE: 'ROTATE YOUR DEVICE: THE GAME PLAYS BEST IN LANDSCAPE.',
    SMALL: 'SMALL WINDOW: BEST ON A LAPTOP, DESKTOP OR TABLET (1024 PX WIDE OR MORE).'
};

/**
 * Open Draft shows its card details on hover. Touch screens (no hover) get tap-to-preview instead:
 * first tap enlarges a card, a second tap on it chooses it. Only on Web.
 * @param {boolean} isWeb
 * @param {Function|null} matchMedia window.matchMedia (or null)
 */
export function usesTapToPreview(isWeb, matchMedia) {
    if (!isWeb || typeof matchMedia !== 'function') return false;
    const query = matchMedia('(hover: none)');
    return !!(query && query.matches);
}
