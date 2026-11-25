// js/draft_logic.js - Pure logic helper for Pick 2 (PAIR) character drafting

/**
 * Determines the character pool for the Random draft.
 * - Steam editions: every character (unchanged behavior).
 * - Web Party Edition: only the characters the UnlockManager allows (the 5 Demo characters).
 *
 * @param {Array} allCharacters
 * @param {Object|null} unlockManager
 * @param {boolean} isWeb
 * @returns {Array} List of characters the Random draft may deal
 */
export function getRandomDraftPool(allCharacters = [], unlockManager = null, isWeb = false) {
    if (isWeb && unlockManager && typeof unlockManager.isEntityUnlocked === 'function') {
        return allCharacters.filter(char => unlockManager.isEntityUnlocked(char));
    }
    return [...allCharacters];
}

/**
 * Determines the available character pool for Pick 2 drafting.
 * - In Gambit 10, the pool consists strictly of EDITH (Boca: Leja) and BRIGHT SHELL.
 * - In Gambit 15, the pool consists strictly of KINGSTON and BRIGHT SHELL.
 * - In standard matches, filters against the UnlockManager if present.
 *
 * @param {number|null} activeGambitId
 * @param {Array} allCharacters
 * @param {Object|null} unlockManager
 * @returns {Array} List of available characters
 */
export function getPick2CandidatePool(activeGambitId, allCharacters = [], unlockManager = null) {
    if (activeGambitId === 10) {
        return allCharacters.filter(c => c.name === 'EDITH' || c.name === 'BRIGHT SHELL');
    }
    if (activeGambitId === 15) {
        return allCharacters.filter(c => c.name === 'KINGSTON' || c.name === 'BRIGHT SHELL');
    }
    if (unlockManager && typeof unlockManager.isEntityUnlocked === 'function') {
        return allCharacters.filter(char => unlockManager.isEntityUnlocked(char));
    }
    return [...allCharacters];
}

/**
 * Draws up to 2 candidates from the available draft pool without recycling.
 * Mutates the draftAvailablePool by popping.
 *
 * @param {Array} draftAvailablePool
 * @returns {Array} Array of 1 or 2 drawn characters
 */
export function drawPick2Candidates(draftAvailablePool) {
    const candidates = [];
    if (Array.isArray(draftAvailablePool)) {
        if (draftAvailablePool.length > 0) candidates.push(draftAvailablePool.pop());
        if (draftAvailablePool.length > 0) candidates.push(draftAvailablePool.pop());
    }
    return candidates;
}

/**
 * Resolves a player's Pick 2 character choice:
 * - Assigns the chosen character to state.players[playerId].character
 * - Calls finalizePlayerSetup if provided
 * - The unpicked card is discarded (NOT returned to state.draftAvailablePool),
 *   unless options.recycleUnpicked is set (Web Party Edition): then it goes to the bottom of the pool
 *   so every later player is still dealt two candidates (4 players on a 5-character pool).
 * - Shifts the current player from state.draftOrder
 *
 * @param {Object} state
 * @param {number} playerId
 * @param {number} candidateIndex
 * @param {Function} [finalizePlayerSetup]
 * @param {{recycleUnpicked?: boolean}} [options]
 * @returns {Object} The chosen character
 */
export function resolvePick2Selection(state, playerId, candidateIndex, finalizePlayerSetup = null, options = {}) {
    const char = state.currentDraftCandidates[candidateIndex];
    const player = state.players.find(p => p.id === playerId) || state.players[playerId];
    if (player) {
        player.character = char;
        if (typeof finalizePlayerSetup === 'function') {
            finalizePlayerSetup(player);
        }
    }

    // Web Party Edition: put the unpicked candidate(s) at the bottom of the pool (draws pop from the end)
    if (options && options.recycleUnpicked && Array.isArray(state.draftAvailablePool)) {
        const unpicked = state.currentDraftCandidates.filter((_, i) => i !== candidateIndex);
        state.draftAvailablePool.unshift(...unpicked);
    }

    // Remove current player from queue now that selection is locked in
    if (Array.isArray(state.draftOrder) && state.draftOrder.length > 0) {
        state.draftOrder.shift();
    }

    return char;
}

/**
 * Validates whether Pick 2 / Pair mode selection is blocked by Demo edition rules.
 *
 * @param {string} mode
 * @param {boolean} isFullGame
 * @param {number|null} activeGambitId
 * @param {boolean} [isWeb] Web Party Edition keeps Pick 2 available
 * @returns {boolean} True if blocked in Demo custom match
 */
export function isPick2BlockedInDemo(mode, isFullGame, activeGambitId, isWeb = false) {
    const isPairMode = (mode === 'PAIR' || mode === 'PICK_2');
    const inCustomMatch = !activeGambitId;
    return !isFullGame && !isWeb && isPairMode && inCustomMatch;
}
