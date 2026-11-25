// ai_knowledge.js - AI Anti-Cheating Information Firewall & Validation (Phase 1, 2, 3A, 3B)
// Constructs sanitized, whitelisted snapshots of the game state containing only
// information that a human player can legitimately see at the current moment,
// validates that no hidden information leaks exist, and provides pure Map & Luxury decision helpers.

import { botRoster } from './bots.js';
import { CHARACTERS } from './characters.js';
import { GAMBIT_CAMPAIGN } from './gambit_data.js';
import { landmarkData } from './landmarks.js';

/**
 * Checks if a Luxury Deck's top card is currently face-up/open under current rules.
 * @param {Object} deck - The raw deck object from state.luxuryDecks
 * @param {Object} state - The game state
 * @returns {boolean}
 */
export function isLuxuryDeckOpen(deck, state) {
    if (!deck) return false;
    if (deck.isFlippedOpen === true) return true;
    if (state.activeGambitId === 1) return true;
    
    // Red Reef (Jaega) or Mizner Tournament open luxury variation
    const hasOpenLuxuryVariation = Boolean(state.config?.jaegaVariation || state.config?.miznerVariation);
    if (hasOpenLuxuryVariation && state.jaegaRevealed) return true;

    return false;
}

/**
 * Checks if an Auction Property card is currently face-up/visible to players.
 * @param {Object} auction - The raw auction object from state.auctions[id]
 * @param {string} auctionId - 'A' or 'B'
 * @param {Object} state - The game state
 * @returns {boolean}
 */
export function isAuctionVisible(auction, auctionId, state) {
    if (!auction) return false;
    if (auction.flipped === true || auction.triggered === true) return true;
    
    // Active auction in progress
    if (state.mode === 'AUCTION' && state.activeAuction && state.activeAuction.id === auctionId) {
        return true;
    }

    // Spanish River (Roxana) or Mizner Tournament open auction variation
    const hasOpenAuctionVariation = Boolean(state.config?.roxanaVariation || state.config?.miznerVariation);
    if (hasOpenAuctionVariation && state.roxanaRevealed) return true;

    return false;
}

/**
 * Constructs a sanitized representation of a single Map Card cell.
 * Conceals spriteIndex, bonus state, and landmark identities on unrevealed cards.
 * @param {Object} cell - Raw cell object from state.grid
 * @param {Object} state - The game state
 * @returns {Object}
 */
export function getBotVisibleMapCell(cell, state) {
    if (!cell) return null;

    const isLocked = Boolean(
        (state?.carinaLockedCells && state.carinaLockedCells[cell.id]) ||
        (state?.activeGambitId === 1 && (cell.type === 'WF_L' || cell.type === 'WF_R') && cell.r === 7)
    );

    const safeCell = {
        id: String(cell.id),
        r: cell.r,
        c: cell.c,
        type: cell.type,
        value: cell.value !== undefined ? cell.value : 0,
        difficulty: cell.difficulty !== undefined ? cell.difficulty : 0,
        empty: Boolean(cell.empty),
        flipped: Boolean(cell.flipped),
        locked: isLocked
    };

    if (cell.flipped) {
        // Revealed card: Human players can now see the front face and bonus effect
        safeCell.isBonus = Boolean(cell.isBonus);
        safeCell.spriteIndex = cell.spriteIndex !== undefined ? cell.spriteIndex : null;
    } else {
        // Face-down card: Strictly concealed
        safeCell.isBonus = null;
        safeCell.spriteIndex = null;
    }

    return safeCell;
}

/**
 * Constructs a sanitized representation of a Luxury Deck pile.
 * Conceals all cards in the deck, and conceals the top card unless it is face-up.
 * @param {Object} deck - Raw deck object from state.luxuryDecks
 * @param {Object} state - The game state
 * @param {number} deckIndex - Index of the deck (0, 1, 2)
 * @returns {Object}
 */
export function getBotVisibleLuxuryDeck(deck, state, deckIndex = 0) {
    const taxCount = (state && state.luxuryTaxCounters) ? (state.luxuryTaxCounters[deck?.id !== undefined ? deck.id : deckIndex] || 0) : 0;

    if (!deck) {
        return {
            id: deckIndex,
            cost: deckIndex === 0 ? 5 : (deckIndex === 1 ? 10 : 15),
            taxCount,
            cardsRemaining: 0,
            isOpen: false,
            visibleCard: null
        };
    }

    const cardsRemaining = Array.isArray(deck.cards) ? deck.cards.length : 0;
    const isOpen = isLuxuryDeckOpen(deck, state);
    let visibleCard = null;

    if (isOpen && cardsRemaining > 0) {
        const topCard = deck.cards[deck.cards.length - 1];
        if (topCard) {
            let rerollsGranted = 0;
            if (topCard.rerollsGranted !== undefined && topCard.rerollsGranted !== null) {
                rerollsGranted = topCard.rerollsGranted;
            } else if (topCard.spriteIndex === 2 || topCard.spriteIndex === 3) {
                rerollsGranted = 1;
            } else if (topCard.spriteIndex === 4) {
                rerollsGranted = 2;
            } else if (topCard.name === "Designer Handbag" || topCard.name === "Luxury Watch") {
                rerollsGranted = 1;
            } else if (topCard.name === "Tiger Experience") {
                rerollsGranted = 2;
            }

            visibleCard = {
                name: topCard.name,
                points: topCard.points !== undefined ? topCard.points : 1,
                cost: topCard.cost !== undefined ? topCard.cost : (deck.cost || 5),
                tier: topCard.tier !== undefined ? topCard.tier : (deckIndex + 1),
                type: 'LUXURY',
                rerollsGranted
            };
        }
    }

    return {
        id: deck.id !== undefined ? deck.id : deckIndex,
        cost: deck.cost !== undefined ? deck.cost : (deckIndex === 0 ? 5 : (deckIndex === 1 ? 10 : 15)),
        taxCount,
        cardsRemaining,
        isOpen,
        visibleCard
    };
}

/**
 * Constructs a sanitized representation of an Auction slot.
 * Conceals property identity and prestige points unless face-up/revealed.
 * @param {Object} auction - Raw auction object from state.auctions[id]
 * @param {string} auctionId - 'A' or 'B'
 * @param {Object} state - The game state
 * @returns {Object}
 */
export function getBotVisibleAuction(auction, auctionId, state) {
    if (!auction) {
        return {
            id: auctionId,
            resolved: false,
            triggered: false,
            isVisible: false,
            visibleCard: null
        };
    }

    const isVisible = isAuctionVisible(auction, auctionId, state);
    let visibleCard = null;

    if (isVisible && auction.card) {
        visibleCard = {
            id: auction.card.id,
            name: auction.card.name,
            points: auction.card.points !== undefined ? auction.card.points : 2
        };
    }

    return {
        id: auctionId,
        resolved: Boolean(auction.resolved),
        triggered: Boolean(auction.triggered),
        isVisible,
        visibleCard
    };
}

/**
 * Constructs a sanitized representation of an Active Auction in progress.
 * @param {Object} activeAuction - Raw active auction object from state.activeAuction
 * @param {number|null} requestingBotId - The ID of the bot requesting knowledge
 * @param {Object} state - The game state
 * @returns {Object|null}
 */
export function getBotVisibleActiveAuction(activeAuction, requestingBotId, state) {
    if (!activeAuction || !activeAuction.id || state.mode !== 'AUCTION') {
        return null;
    }

    const participants = Array.isArray(activeAuction.participants) ? [...activeAuction.participants] : [];
    const turnIndex = activeAuction.turnIndex !== undefined ? activeAuction.turnIndex : 0;
    const activePlayerId = (turnIndex >= 0 && turnIndex < participants.length) ? participants[turnIndex] : null;

    const isVisible = (activeAuction.isVisible !== undefined)
        ? Boolean(activeAuction.isVisible)
        : isAuctionVisible(activeAuction, activeAuction.id, state);

    let visibleCard = null;
    if (isVisible && activeAuction.card) {
        visibleCard = {
            id: activeAuction.card.id,
            name: activeAuction.card.name,
            points: activeAuction.card.points !== undefined ? activeAuction.card.points : 2
        };
    }

    return {
        id: activeAuction.id,
        currentBid: activeAuction.currentBid || 0,
        turnIndex,
        activePlayerId,
        highestBidderId: activeAuction.highestBidder ? (typeof activeAuction.highestBidder === 'object' ? activeAuction.highestBidder.id : activeAuction.highestBidder) : null,
        participants,
        isVisible,
        visibleCard,
        card: visibleCard
    };
}

/**
 * Constructs a sanitized representation of a Player.
 * Only public information and public inventories are visible.
 * @param {Object} player - Raw player object from state.players
 * @param {number|null} requestingBotId - The ID of the bot requesting knowledge
 * @param {Object} state - The game state
 * @returns {Object}
 */
export function getBotVisiblePlayer(player, requestingBotId, state) {
    if (!player) return null;

    const isSelf = (requestingBotId !== null && player.id === requestingBotId);
    const isHuman = (player.type === 'HUMAN');
    const showBotMoney = Boolean(state.config?.showBotMoney !== false);

    // Gold visibility rule:
    // 1. Human gold is always public on the playermat.
    // 2. A bot always knows its own gold.
    // 3. Opponent bot gold is visible if showBotMoney is enabled; otherwise hidden (null).
    let visibleGold = null;
    let visibleTotalGold = null;

    if (isHuman || isSelf || showBotMoney) {
        visibleGold = player.gold !== undefined ? player.gold : 0;
        visibleTotalGold = player.totalGold !== undefined ? player.totalGold : 0;
    }

    // Public inventory (cards placed on playermat)
    const sanitizedInventory = (player.inventory || []).map(card => ({
        id: card.id !== undefined ? card.id : null,
        name: card.name || 'Unknown Item',
        type: card.type || 'LUXURY',
        points: card.points !== undefined ? card.points : 0,
        cost: card.cost !== undefined ? card.cost : 0,
        tier: card.tier !== undefined ? card.tier : null,
        sourcePile: card.sourcePile || card.deckPile || null
    }));

    // Public character definition (if assigned)
    let sanitizedCharacter = null;
    if (player.character) {
        sanitizedCharacter = {
            name: player.character.name,
            title: player.character.title || '',
            description: player.character.description || ''
        };
    }

    return {
        id: player.id,
        name: player.name || `Player ${player.id + 1}`,
        type: player.type || 'HUMAN',
        isSelf,
        gold: visibleGold,
        totalGold: visibleTotalGold,
        prestige: player.prestige !== undefined ? player.prestige : 0,
        bankedPrestige: player.bankedPrestige !== undefined ? player.bankedPrestige : 0,
        totalPrestige: (player.prestige || 0) + (player.bankedPrestige || 0),
        counters: player.counters !== undefined ? player.counters : 0,
        rerolls: player.rerolls !== undefined ? player.rerolls : 0,
        extraTurns: player.extraTurns !== undefined ? player.extraTurns : 0,
        status: player.status || 'Ready',
        cardsCount: player.cards !== undefined ? player.cards : sanitizedInventory.length,
        mapCardsFlipped: player.mapCardsFlipped !== undefined ? player.mapCardsFlipped : 0,
        lastBid: player.lastBid !== undefined ? player.lastBid : 0,
        inventory: sanitizedInventory,
        character: sanitizedCharacter,
        botId: player.botId !== undefined ? player.botId : null
    };
}

/**
 * Builds the complete, sanitized AI knowledge snapshot for a bot.
 * This object is guaranteed to contain ONLY information legally accessible to a human player.
 * @param {Object} rawState - The raw game state (window.state or state)
 * @param {Object|number} botOrId - The bot player object or bot player ID
 * @returns {Object} A brand-new sanitized knowledge state object
 */
export function buildBotKnowledgeState(rawState, botOrId) {
    if (!rawState) return null;

    const botId = (typeof botOrId === 'object' && botOrId !== null) ? botOrId.id : (botOrId !== undefined ? botOrId : null);

    const isJaegaOpen = Boolean((rawState.config?.jaegaVariation || rawState.config?.miznerVariation) && rawState.jaegaRevealed);
    const isRoxanaOpen = Boolean((rawState.config?.roxanaVariation || rawState.config?.miznerVariation) && rawState.roxanaRevealed);

    const safeKnowledge = {
        turn: rawState.turn,
        turnCount: rawState.turnCount || 0,
        mode: rawState.mode || 'GAME',
        isGameOver: Boolean(rawState.isGameOver || rawState.gameOverTriggered),
        activeGambitId: rawState.activeGambitId || null,
        selfPlayerId: botId,

        // Public match rules and variation status
        rules: {
            jaegaVariation: Boolean(rawState.config?.jaegaVariation),
            roxanaVariation: Boolean(rawState.config?.roxanaVariation),
            miznerVariation: Boolean(rawState.config?.miznerVariation),
            showBotMoney: Boolean(rawState.config?.showBotMoney !== false),
            isOpenLuxury: isJaegaOpen || (rawState.activeGambitId === 1),
            isOpenAuction: isRoxanaOpen,
            difficulty: rawState.config?.difficulty || 'NORMAL'
        },

        // Sanitized Board Grid
        grid: Array.isArray(rawState.grid)
            ? rawState.grid.map(cell => getBotVisibleMapCell(cell, rawState))
            : [],

        // Sanitized Luxury Decks
        luxuryDecks: Array.isArray(rawState.luxuryDecks)
            ? rawState.luxuryDecks.map((deck, idx) => getBotVisibleLuxuryDeck(deck, rawState, idx))
            : [],

        // Sanitized Auction Slots
        auctions: {
            A: getBotVisibleAuction(rawState.auctions?.A, 'A', rawState),
            B: getBotVisibleAuction(rawState.auctions?.B, 'B', rawState)
        },

        // Sanitized Active Auction (if in progress)
        activeAuction: getBotVisibleActiveAuction(rawState.activeAuction, botId, rawState),

        // Sanitized Players List
        players: Array.isArray(rawState.players)
            ? rawState.players.map(p => getBotVisiblePlayer(p, botId, rawState))
            : []
    };

    // Public aggregate revealed counts derived safely from sanitized grid (Phase 5B.13)
    const sanitizedGrid = safeKnowledge.grid || [];
    safeKnowledge.publicBonusCounts = {
        col3RevealedBonuses: sanitizedGrid.filter(c => c.flipped && c.c === 2 && c.isBonus).length,
        col3RevealedCards: sanitizedGrid.filter(c => c.flipped && c.c === 2 && !c.empty).length,
        col4_6RevealedBonuses: sanitizedGrid.filter(c => c.flipped && (c.c >= 3 && c.c <= 5) && c.isBonus).length,
        col4_6RevealedCards: sanitizedGrid.filter(c => c.flipped && (c.c >= 3 && c.c <= 5) && !c.empty).length,
        col7RevealedBonuses: sanitizedGrid.filter(c => c.flipped && c.c === 6 && c.isBonus).length,
        col7RevealedCards: sanitizedGrid.filter(c => c.flipped && c.c === 6 && !c.empty).length
    };

    const isFlippedLandmark = (c) => {
        if (!c.flipped || c.spriteIndex === null || c.spriteIndex === undefined) return false;
        const spriteRow = Math.floor(c.spriteIndex / 8);
        const spriteCol = c.spriteIndex % 8;
        return landmarkData.some(l => l.row === spriteRow && l.col === spriteCol);
    };

    safeKnowledge.publicLandmarkCounts = {
        revealedLandmarks: sanitizedGrid.filter(isFlippedLandmark).length,
        revealedLandmarksTotal: sanitizedGrid.filter(isFlippedLandmark).length,
        totalPossibleLandmarks: 12,
        revealedLandmarksByGroup: {
            LAGOON: sanitizedGrid.filter(c => c.c === 0 && isFlippedLandmark(c)).length,
            WF_L: sanitizedGrid.filter(c => c.c === 1 && isFlippedLandmark(c)).length,
            BLOCK_COL3: sanitizedGrid.filter(c => c.c === 2 && isFlippedLandmark(c)).length,
            BLOCK_COL4_6: sanitizedGrid.filter(c => c.c >= 3 && c.c <= 5 && isFlippedLandmark(c)).length,
            BLOCK_COL7: sanitizedGrid.filter(c => c.c === 6 && isFlippedLandmark(c)).length,
            WF_R: sanitizedGrid.filter(c => c.c === 7 && isFlippedLandmark(c)).length,
            ATLANTIC: sanitizedGrid.filter(c => c.c === 8 && isFlippedLandmark(c)).length
        },
        revealedCardsByLandmarkGroup: {
            LAGOON: sanitizedGrid.filter(c => c.flipped && c.c === 0 && !c.empty).length,
            WF_L: sanitizedGrid.filter(c => c.flipped && c.c === 1 && !c.empty).length,
            BLOCK_COL3: sanitizedGrid.filter(c => c.flipped && c.c === 2 && !c.empty).length,
            BLOCK_COL4_6: sanitizedGrid.filter(c => c.flipped && (c.c >= 3 && c.c <= 5) && !c.empty).length,
            BLOCK_COL7: sanitizedGrid.filter(c => c.flipped && c.c === 6 && !c.empty).length,
            WF_R: sanitizedGrid.filter(c => c.flipped && c.c === 7 && !c.empty).length,
            ATLANTIC: sanitizedGrid.filter(c => c.flipped && c.c === 8 && !c.empty).length
        }
    };

    return safeKnowledge;
}

/**
 * Validates an AI knowledge snapshot for hidden-information leaks or illegal raw references.
 * Inspects the snapshot itself without relying on or referencing raw state.
 * @param {Object} snapshot - The sanitized AI knowledge state
 * @param {Object} [options={}] - Validation options
 * @param {boolean} [options.throwOnError=false] - Whether to throw an Error if validation fails
 * @returns {{ valid: boolean, errors: Array<{ domain: string, id: string|number|null, field: string, message: string }>, warnings: Array<string> }}
 */
export function validateBotKnowledge(snapshot, options = {}) {
    const errors = [];
    const warnings = [];

    if (!snapshot || typeof snapshot !== 'object') {
        errors.push({
            domain: "GLOBAL",
            id: null,
            field: "snapshot",
            message: "Sanitized knowledge snapshot is null or not an object."
        });
        if (options.throwOnError) {
            throw new Error("AI KNOWLEDGE LEAK DETECTED: Snapshot is null or invalid.");
        }
        return { valid: false, errors, warnings };
    }

    // 1. Root-Level Invariant Checks
    const forbiddenRootKeys = ['botRef', 'hooks', 'rawState', 'SaveManager', 'audioMgr'];
    for (const key of forbiddenRootKeys) {
        if (key in snapshot && snapshot[key] !== undefined) {
            errors.push({
                domain: "GLOBAL",
                id: null,
                field: key,
                message: `Root knowledge snapshot leaked forbidden raw engine property '${key}'.`
            });
        }
    }

    // 2. Map Grid Validation
    if (Array.isArray(snapshot.grid)) {
        snapshot.grid.forEach(cell => {
            if (!cell || cell.empty) return;

            // Closed map cards must never expose spriteIndex or isBonus
            if (cell.flipped === false) {
                if (cell.spriteIndex !== null && cell.spriteIndex !== undefined) {
                    errors.push({
                        domain: "MAP",
                        id: cell.id,
                        field: "spriteIndex",
                        message: `Closed map card ${cell.id} exposed hidden spriteIndex (${cell.spriteIndex}).`
                    });
                }
                if (cell.isBonus !== null && cell.isBonus !== undefined) {
                    errors.push({
                        domain: "MAP",
                        id: cell.id,
                        field: "isBonus",
                        message: `Closed map card ${cell.id} exposed hidden isBonus (${cell.isBonus}).`
                    });
                }
            }

            // Check forbidden raw fields on cell
            if ('cards' in cell) {
                errors.push({
                    domain: "MAP",
                    id: cell.id,
                    field: "cards",
                    message: `Map cell ${cell.id} exposed forbidden 'cards' property.`
                });
            }
        });
    }

    // 3. Luxury Deck Validation
    if (Array.isArray(snapshot.luxuryDecks)) {
        snapshot.luxuryDecks.forEach(deck => {
            if (!deck) return;

            // Must never contain raw cards array
            if ('cards' in deck && deck.cards !== undefined) {
                errors.push({
                    domain: "LUXURY",
                    id: deck.id,
                    field: "cards",
                    message: `Sanitized Luxury pile ${deck.id} contains forbidden raw 'cards' array.`
                });
            }

            // Closed deck must have visibleCard === null
            if (deck.isOpen === false) {
                if (deck.visibleCard !== null && deck.visibleCard !== undefined) {
                    errors.push({
                        domain: "LUXURY",
                        id: deck.id,
                        field: "visibleCard",
                        message: `Closed Luxury pile ${deck.id} exposed visibleCard (${JSON.stringify(deck.visibleCard)}).`
                    });
                }
            } else if (deck.isOpen === true && deck.visibleCard) {
                // Open deck visibleCard checks
                const card = deck.visibleCard;
                const suspiciousKeys = ['cards', 'deck', 'nextCard', 'allCards', 'sourceDeck', 'deckPileCards'];
                for (const key of suspiciousKeys) {
                    if (key in card) {
                        errors.push({
                            domain: "LUXURY",
                            id: deck.id,
                            field: key,
                            message: `Open Luxury pile ${deck.id} visibleCard exposed suspicious nested field '${key}'.`
                        });
                    }
                }

                // Whitelisted fields on visibleCard
                const allowedKeys = new Set(['id', 'name', 'points', 'cost', 'tier', 'type', 'spriteIndex', 'sourcePile', 'deckPile', 'rerollsGranted']);
                for (const key of Object.keys(card)) {
                    if (!allowedKeys.has(key)) {
                        errors.push({
                            domain: "LUXURY",
                            id: deck.id,
                            field: key,
                            message: `Open Luxury pile ${deck.id} visibleCard exposed unexpected field '${key}'.`
                        });
                    }
                }
            }
        });
    }

    // 4. Auction Validation
    if (snapshot.auctions) {
        ['A', 'B'].forEach(auctionId => {
            const auction = snapshot.auctions[auctionId];
            if (!auction) return;

            // Must not expose raw card fields directly on the auction wrapper
            const forbiddenAuctionKeys = ['card', 'property', 'propertyId', 'mapY', 'spriteX'];
            for (const key of forbiddenAuctionKeys) {
                if (key in auction && auction[key] !== undefined) {
                    errors.push({
                        domain: "AUCTION",
                        id: auctionId,
                        field: key,
                        message: `Sanitized auction ${auctionId} exposed raw property '${key}'.`
                    });
                }
            }

            // Concealed auction must have visibleCard === null
            if (auction.isVisible === false) {
                if (auction.visibleCard !== null && auction.visibleCard !== undefined) {
                    errors.push({
                        domain: "AUCTION",
                        id: auctionId,
                        field: "visibleCard",
                        message: `Concealed auction ${auctionId} exposed visibleCard (${JSON.stringify(auction.visibleCard)}).`
                    });
                }
            } else if (auction.isVisible === true && auction.visibleCard) {
                // Whitelist on visibleCard
                const card = auction.visibleCard;
                const allowedKeys = new Set(['id', 'name', 'points', 'spriteIndex', 'type']);
                for (const key of Object.keys(card)) {
                    if (!allowedKeys.has(key)) {
                        errors.push({
                            domain: "AUCTION",
                            id: auctionId,
                            field: key,
                            message: `Visible auction ${auctionId} visibleCard exposed unexpected field '${key}'.`
                        });
                    }
                }
            }
        });
    }

    // 5. Active Auction Validation
    if (snapshot.activeAuction) {
        const aa = snapshot.activeAuction;
        if ('rawState' in aa || 'botRef' in aa) {
            errors.push({
                domain: "AUCTION",
                id: aa.id,
                field: "activeAuction",
                message: "Active auction exposed internal engine properties."
            });
        }
    }

    // 6. Players Validation
    if (Array.isArray(snapshot.players)) {
        snapshot.players.forEach(p => {
            if (!p) return;

            const forbiddenPlayerKeys = ['botRef', 'hooks', 'rawState', 'ghostChar'];
            for (const key of forbiddenPlayerKeys) {
                if (key in p && p[key] !== undefined) {
                    errors.push({
                        domain: "PLAYER",
                        id: p.id,
                        field: key,
                        message: `Sanitized player ${p.id} exposed internal property '${key}'.`
                    });
                }
            }
        });
    }

    const valid = errors.length === 0;

    if (!valid && options.throwOnError === true) {
        const summary = errors.map(e => `[${e.domain}] ${e.id !== null && e.id !== undefined ? `(${e.id}) ` : ''}${e.field}: ${e.message}`).join('\n');
        throw new Error(`AI KNOWLEDGE LEAK DETECTED (${errors.length} errors):\n${summary}`);
    }

    return {
        valid,
        errors,
        warnings
    };
}

/**
 * Developer helper function for inspecting the sanitized state in the console.
 * Builds the snapshot, runs validation, and prints a structured pass/fail report.
 * @param {Object} [stateParam] - Optional state object (defaults to window.state)
 * @param {Object|number} [botParam] - Optional bot object or ID (defaults to first bot)
 * @returns {{ knowledge: Object, report: Object }}
 */
export function inspectBotKnowledge(stateParam, botParam) {
    const s = stateParam || (typeof window !== 'undefined' ? window.state : null);
    if (!s) {
        console.warn("[AI KNOWLEDGE INSPECTOR] No state available to inspect.");
        return null;
    }

    let b = botParam;
    if (b === undefined && s.players) {
        const firstBot = s.players.find(p => p.type === 'BOT');
        b = firstBot ? firstBot.id : 0;
    } else if (typeof b === 'number' && s.players) {
        const found = s.players.find(p => p.botId === b) || s.players.find(p => p.id === b) || s.players[b];
        if (found) b = found;
    }

    const knowledge = buildBotKnowledgeState(s, b);
    const report = validateBotKnowledge(knowledge);

    console.group(`[AI KNOWLEDGE INSPECTOR] Snapshot for Bot Player ${typeof b === 'object' ? (b.name || b.id) : b}`);
    console.log("Full Sanitized Knowledge State:", knowledge);
    console.log("Sanitized Luxury Decks:", knowledge.luxuryDecks);
    console.log("Sanitized Auctions:", knowledge.auctions);
    console.log("Sanitized Players:", knowledge.players);

    if (report.valid) {
        console.log("%c[AI FIREWALL] PASS — No hidden-information leaks detected.", "color: #10B981; font-weight: bold;");
    } else {
        console.warn(`%c[AI FIREWALL] FAIL — ${report.errors.length} hidden-information leak(s) detected:`, "color: #EF4444; font-weight: bold;");
        console.table(report.errors);
    }
    console.groupEnd();

    return { knowledge, report };
}

/**
 * Browser developer test helper to quickly validate the firewall on the live game state.
 * @param {Object} [stateParam] - Optional state object (defaults to window.state)
 * @param {Object|number} [botParam] - Optional bot object or ID
 * @returns {Object} The validation report
 */
export function testBotKnowledgeFirewall(stateParam, botParam) {
    const s = stateParam || (typeof window !== 'undefined' ? window.state : null);
    if (!s) {
        console.warn("[AI FIREWALL TEST] No game state available to test.");
        return { valid: false, errors: [{ domain: "GLOBAL", id: null, field: "state", message: "No game state available." }], warnings: [] };
    }

    let b = botParam;
    if (b === undefined && s.players) {
        const firstBot = s.players.find(p => p.type === 'BOT');
        b = firstBot ? firstBot.id : 0;
    } else if (typeof b === 'number' && s.players) {
        const found = s.players.find(p => p.botId === b) || s.players.find(p => p.id === b) || s.players[b];
        if (found) b = found;
    }

    const snapshot = buildBotKnowledgeState(s, b);
    const report = validateBotKnowledge(snapshot);

    if (report.valid) {
        console.log(`%cAI FIREWALL TEST: PASS\n0 leaks detected.`, "color: #10B981; font-weight: bold;");
    } else {
        console.error(`%cAI FIREWALL TEST: FAIL\n${report.errors.length} leak(s) detected:`, "color: #EF4444; font-weight: bold;");
        console.table(report.errors);
    }

    return report;
}

// ============================================================================
// PHASE 3A: PURE MAP REASONING & SELECTION HELPERS
// ============================================================================

/**
 * Retrieves all valid, unrevealed, non-empty map cells from sanitized knowledge.
 * Note: Carina-locked cells are legal candidates (requiring roll 5 or 6 for non-Carina players).
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {Array<Object>} List of sanitized available map cells
 */
export function getAvailableMapCells(knowledge) {
    if (!knowledge || !Array.isArray(knowledge.grid)) return [];
    return knowledge.grid.filter(cell => !cell.flipped && !cell.empty);
}

/**
 * Counts remaining unrevealed cards per row and column from sanitized knowledge.
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {{ rowCounts: number[], colCounts: number[] }}
 */
export function analyzeBoardLines(knowledge) {
    const rowCounts = Array(8).fill(0);
    const colCounts = Array(9).fill(0);
    const rowSelectable = Array(8).fill(0);
    const colSelectable = Array(9).fill(0);
    const rowLocked = Array(8).fill(0);
    const colLocked = Array(9).fill(0);

    if (!knowledge || !Array.isArray(knowledge.grid)) {
        return {
            rowCounts,
            colCounts,
            rowUnresolved: rowCounts,
            colUnresolved: colCounts,
            rowSelectable,
            colSelectable,
            rowLocked,
            colLocked
        };
    }

    knowledge.grid.forEach(cell => {
        if (!cell.flipped && !cell.empty) {
            const isLocked = Boolean(cell.locked);
            if (cell.r >= 0 && cell.r < 8) {
                rowCounts[cell.r]++;
                if (isLocked) rowLocked[cell.r]++;
                else rowSelectable[cell.r]++;
            }
            if (cell.c >= 0 && cell.c < 9) {
                colCounts[cell.c]++;
                if (isLocked) colLocked[cell.c]++;
                else colSelectable[cell.c]++;
            }
        }
    });

    return {
        rowCounts,
        colCounts,
        rowUnresolved: rowCounts,
        colUnresolved: colCounts,
        rowSelectable,
        colSelectable,
        rowLocked,
        colLocked
    };
}

/**
 * Identifies 'Finishers' — moves that immediately complete a row or column (only 1 unrevealed tile left).
 * @param {Array<Object>} availableCells - Available sanitized cells
 * @param {number[]} rowCounts - Remaining cell count per row
 * @param {number[]} colCounts - Remaining cell count per column
 * @returns {Array<Object>} List of finisher cells
 */
export function findFinishers(availableCells, rowCounts, colCounts) {
    if (!Array.isArray(availableCells)) return [];
    return availableCells.filter(m => (rowCounts && rowCounts[m.r] === 1) || (colCounts && colCounts[m.c] === 1));
}

/**
 * Identifies 'Traps' — moves that leave exactly 1 card remaining in a row or column (giving line bonus to next player).
 * @param {Array<Object>} availableCells - Available sanitized cells
 * @param {number[]} rowCounts - Remaining cell count per row
 * @param {number[]} colCounts - Remaining cell count per column
 * @returns {Array<Object>} List of trap cells
 */
export function findTrapCells(availableCells, rowCounts, colCounts) {
    if (!Array.isArray(availableCells)) return [];
    return availableCells.filter(m => (rowCounts && rowCounts[m.r] === 2) || (colCounts && colCounts[m.c] === 2));
}

/**
 * Filters cells that are neither Finishers nor Traps.
 * @param {Array<Object>} availableCells - Available sanitized cells
 * @param {Array<Object>} finishers - Finisher cells
 * @param {Array<Object>} traps - Trap cells
 * @returns {Array<Object>} Safe moves
 */
export function findSafeCells(availableCells, finishers, traps) {
    if (!Array.isArray(availableCells)) return [];
    const finisherIds = new Set((finishers || []).map(f => f.id));
    const trapIds = new Set((traps || []).map(t => t.id));
    return availableCells.filter(m => !finisherIds.has(m.id) && !trapIds.has(m.id));
}

/**
 * Resolves the authoritative AI depth ('LOW', 'MEDIUM', 'FULL') for a bot.
 * Checks bot.botRef.aiDepth, bot.aiDepth, looks up in botRoster via botId / botRef.id,
 * and falls back gracefully to intelligenceLevel or name.
 * @param {Object} bot - The bot player object
 * @returns {"LOW"|"MEDIUM"|"FULL"}
 */
export function getBotAiDepth(bot) {
    if (!bot) return 'LOW';
    if (bot.aiDepth) return bot.aiDepth;
    if (bot.botRef?.aiDepth) return bot.botRef.aiDepth;
    const int = (typeof bot.intelligenceLevel === 'number') ? bot.intelligenceLevel : ((bot.botRef && typeof bot.botRef.intelligenceLevel === 'number') ? bot.botRef.intelligenceLevel : null);
    if (int !== null) {
        if (int >= 7) return 'FULL';
        if (int >= 4) return 'MEDIUM';
        return 'LOW';
    }
    const bId = (bot.botId !== undefined && bot.botId !== null)
        ? bot.botId
        : (bot.botRef && bot.botRef.id !== undefined && bot.botRef.id !== null ? bot.botRef.id : null);
    if (bId !== null) {
        const rosterEntry = botRoster.find(r => r.id === bId);
        if (rosterEntry?.aiDepth) return rosterEntry.aiDepth;
    }
    const name = bot.name || (bot.botRef && bot.botRef.name);
    if (name) {
        const rosterEntry = botRoster.find(r => r.name?.toUpperCase() === name.toUpperCase());
        if (rosterEntry?.aiDepth) return rosterEntry.aiDepth;
    }
    return 'LOW';
}

/**
 * Identifies if a bot is a FULL Strategic AI Visitor (Phase 5E.2a Data-Driven Routing).
 * Purely data-driven: routes based on getBotAiDepth(bot) === "FULL".
 * Human players are strictly always false.
 * @param {Object} bot - The player / bot object
 * @returns {boolean}
 */
export function isFullStrategicVisitor(bot) {
    if (!bot) return false;
    if (bot.type === 'HUMAN') return false;
    return getBotAiDepth(bot) === 'FULL';
}

/**
 * Identifies if a bot is specifically Gran Gran (ID 10).
 * Checks bot.botId, bot.botRef?.id, or bot.name.
 * Strictly ignores player.id so turn-order shuffling never creates false Gran Gran detections.
 * @param {Object} bot - The player / bot object
 * @returns {boolean}
 */
export function isGranGranVisitor(bot) {
    if (!bot) return false;
    if (bot.botId === 10) return true;
    if (bot.botRef && bot.botRef.id === 10) return true;
    if (bot.type === 'BOT' && (bot.name === 'Gran Gran' || bot.name === 'GRAN GRAN')) return true;
    return false;
}

/**
 * Pure sanitized Map AI decision function (Phase 5E.1 Tier Routing).
 * Evaluates the board solely using sanitized knowledge and returns the chosen cell ID.
 * @param {Object} bot - The bot player definition or state reference
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {{ chosenCellId: string|null, reason: string, chosenCell: Object|null, finishers: string[], traps: string[], safeMoves: string[] }}
 */
export function chooseMapCell(bot, knowledge) {
    if (!knowledge) return { chosenCellId: null, reason: "NO_KNOWLEDGE", chosenCell: null, finishers: [], traps: [], safeMoves: [] };

    const availableMoves = getAvailableMapCells(knowledge);
    if (availableMoves.length === 0) {
        return { chosenCellId: null, reason: "NO_LEGAL_MOVES", chosenCell: null, finishers: [], traps: [], safeMoves: [] };
    }

    const { rowCounts, colCounts } = analyzeBoardLines(knowledge);
    const finishers = findFinishers(availableMoves, rowCounts, colCounts);
    const traps = findTrapCells(availableMoves, rowCounts, colCounts);
    const safeMoves = findSafeCells(availableMoves, finishers, traps);

    const depth = getBotAiDepth(bot);

    let pick = null;
    let reason = "RANDOM";

    if (depth === 'LOW') {
        // TIER LOW: Simple / random legal decision without deep line or trap lookahead
        pick = availableMoves[Math.floor(Math.random() * availableMoves.length)];
        reason = "TIER_LOW_RANDOM";
    } else {
        // TIER MEDIUM & FULL: Snipes line completions immediately, avoids traps to protect line bonuses
        if (finishers.length > 0) {
            pick = finishers[Math.floor(Math.random() * finishers.length)];
            reason = "FINISHER";
        } else {
            const candidateMoves = safeMoves.length > 0 ? safeMoves : availableMoves;
            pick = candidateMoves[Math.floor(Math.random() * candidateMoves.length)];
            reason = safeMoves.length > 0 ? "SAFE_MOVE_FALLBACK" : "TRAP_FORCED_MOVE";
        }
    }

    return {
        chosenCellId: pick ? pick.id : null,
        reason: reason,
        chosenCell: pick ? { id: pick.id, r: pick.r, c: pick.c, type: pick.type } : null,
        finishers: (finishers || []).map(f => f.id),
        traps: (traps || []).map(t => t.id),
        safeMoves: (safeMoves || []).map(s => s.id)
    };
}

/**
 * Developer helper for inspecting Map AI decision making for a bot.
 * @param {Object} state - Live engine state
 * @param {number|Object} [botParam] - Optional bot index, botId, or bot player object
 * @returns {{ knowledge: Object, report: Object, decision: Object }}
 */
export function inspectBotMapDecision(state, botParam) {
    const s = state || (typeof window !== 'undefined' ? window.state : null);
    if (!s) return null;

    let bot = botParam;
    if (bot === undefined && s.players) {
        bot = s.players.find(p => p.type === 'BOT') || s.players[0];
    } else if (typeof bot === 'number' && s.players) {
        bot = s.players.find(p => p.botId === bot) || s.players.find(p => p.id === bot) || s.players[bot];
    }

    const knowledge = buildBotKnowledgeState(s, bot);
    const report = validateBotKnowledge(knowledge);
    const decision = chooseMapCell(bot, knowledge);

    console.group(`[MAP DECISION INSPECTOR] Move for Bot Player ${typeof bot === 'object' ? (bot.name || bot.id) : bot}`);
    console.log("Decision Result:", decision);
    console.log("Available Moves:", getAvailableMapCells(knowledge));
    console.log("Line Finishers:", decision.finishers);
    console.log("Traps Avoided:", decision.traps);
    console.log("Safe Candidates:", decision.safeMoves);
    console.groupEnd();

    return { knowledge, report, decision };
}

/**
 * Calculates the effective Luxury purchase cost for a bot on a sanitized deck.
 * Takes Ms. Post character ability into account (exempt from luxury tax).
 * @param {Object} bot - The bot player object
 * @param {Object} deck - The sanitized luxury deck object
 * @returns {number} Cost in gold
 */
export function getBotLuxuryCost(bot, deck) {
    if (!deck) return 999;
    let actualCost = deck.cost !== undefined ? deck.cost : 5;
    if (bot && (!bot.character || bot.character.name !== 'MS. POST')) {
        const taxCount = deck.taxCount || 0;
        actualCost += taxCount * 2;
    }
    return actualCost;
}

/**
 * Returns available, affordable sanitized Luxury decks with remaining cards.
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} bot - The bot player object
 * @returns {Array<Object>} Affordable sanitized luxury decks
 */
export function getAvailableLuxuryDecks(knowledge, bot) {
    if (!knowledge || !Array.isArray(knowledge.luxuryDecks)) return [];
    const selfPlayer = (knowledge.players || []).find(p => p.id === knowledge.selfPlayerId) || bot;
    const botGold = (selfPlayer && selfPlayer.gold !== null && selfPlayer.gold !== undefined) ? selfPlayer.gold : (bot?.gold || 0);
    return knowledge.luxuryDecks.filter(d => d.cardsRemaining > 0 && botGold >= getBotLuxuryCost(bot, d));
}

/**
 * Determines if Luxury purchase is legally allowed under current game rules.
 * Pure function consuming only sanitized knowledge.
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {{ allowed: boolean, reason: string|null }}
 */
export function isLuxuryPurchaseAllowed(knowledge) {
    if (!knowledge) return { allowed: false, reason: "NO_KNOWLEDGE" };
    if (
        knowledge.activeGambitId === 1 ||
        knowledge.activeGambitId === 2 ||
        knowledge.activeGambitId === 3 ||
        knowledge.activeGambitId === 11
    ) {
        return { allowed: false, reason: "GAMBIT_RESTRICTED" };
    }
    return { allowed: true, reason: null };
}

/**
 * Retrieves the list of sanitized player participants in the active auction.
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} [bot] - Optional bot player reference
 * @returns {Array<Object>} List of sanitized player objects
 */
export function getAuctionParticipants(knowledge, bot) {
    if (!knowledge || !knowledge.activeAuction || !Array.isArray(knowledge.activeAuction.participants)) {
        return [];
    }
    const participantIds = new Set(knowledge.activeAuction.participants);
    return (knowledge.players || []).filter(p => participantIds.has(p.id));
}

/**
 * Retrieves the currently visible Property card in the active auction, if public.
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {Object|null} Sanitized card object or null if concealed
 */
export function getVisibleAuctionCard(knowledge) {
    if (!knowledge || !knowledge.activeAuction) return null;
    return knowledge.activeAuction.visibleCard || knowledge.activeAuction.card || null;
}

/**
 * Pure sanitized Luxury Deck AI decision function (Phase 5E.1 Tier Routing).
 * @param {Object} bot - The bot player definition or state reference
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {{ action: "BUY_LUXURY" | "NO_LUXURY", deckId: number|null, reason: string }}
 */
export function chooseLuxuryDeck(bot, knowledge) {
    if (!knowledge || !Array.isArray(knowledge.luxuryDecks)) {
        return { action: "NO_LUXURY", deckId: null, reason: "INVALID_KNOWLEDGE" };
    }

    const availableMoves = getAvailableMapCells(knowledge);
    const { rowCounts, colCounts } = analyzeBoardLines(knowledge);
    const finishers = findFinishers(availableMoves, rowCounts, colCounts);

    const depth = getBotAiDepth(bot);
    const personality = (bot && bot.personality) || (bot && bot.botRef && bot.botRef.personality) || 'BALANCED';

    // Finisher priority: Non-LOW bots prioritize finishing a line over luxury
    const hasFinisherToSnipe = (depth !== 'LOW' && finishers.length > 0);
    if (hasFinisherToSnipe) {
        return { action: "NO_LUXURY", deckId: null, reason: "FINISHER_PRIORITY" };
    }

    const affordableDecks = getAvailableLuxuryDecks(knowledge, bot);
    if (affordableDecks.length === 0) {
        return { action: "NO_LUXURY", deckId: null, reason: "NO_AFFORDABLE_DECKS" };
    }

    // Waterfront tracking (Auction imminent)
    const wflCount = colCounts[1];
    const wfrCount = colCounts[7];
    const waterfrontImminent = (wflCount > 0 && wflCount <= 2) || (wfrCount > 0 && wfrCount <= 2);

    const selfPlayer = (knowledge.players || []).find(p => p.id === knowledge.selfPlayerId) || bot;
    const botGold = (selfPlayer && selfPlayer.gold !== null && selfPlayer.gold !== undefined) ? selfPlayer.gold : (bot?.gold || 0);

    let wantsToBuy = false;
    let preferredDeck = null;
    let reason = "NO_LUXURY";

    if (depth === 'LOW') {
        // TIER LOW: Basic affordability, simple purchase desire
        if (personality === 'SPENDER' || personality === 'CRAZY_SPENDER') {
            wantsToBuy = (Math.random() < 0.75);
        } else {
            wantsToBuy = (Math.random() < 0.5);
        }

        if (wantsToBuy) {
            const sortedDecks = [...affordableDecks].sort((a, b) => b.cost - a.cost);
            preferredDeck = sortedDecks[0];
            reason = "TIER_LOW_BUY";
        } else {
            reason = "TIER_LOW_SAVE";
        }
    } else {
        // TIER MEDIUM & FULL (legacy fallback): Auction awareness, visible card awareness, bankroll discipline
        let holdForAuction = false;

        const nextAucA = (!knowledge.auctions?.A?.triggered && knowledge.auctions?.A?.isVisible) ? knowledge.auctions.A.visibleCard : null;
        const nextAucB = (!knowledge.auctions?.B?.triggered && knowledge.auctions?.B?.isVisible) ? knowledge.auctions.B.visibleCard : null;
        const marALagoExposed = ((nextAucA && nextAucA.name === "Mar-a-Lago") || (nextAucB && nextAucB.name === "Mar-a-Lago"));

        if (marALagoExposed && botGold < 30) {
            holdForAuction = true;
            reason = "HOLD_FOR_MAR_A_LAGO";
        } else if (waterfrontImminent && botGold < 25) {
            holdForAuction = true;
            reason = "HOLD_FOR_IMMINENT_AUCTION";
        }

        if (!holdForAuction) {
            const visible3Pt = affordableDecks.find(d => d.visibleCard && d.visibleCard.points >= 3);
            const deck15 = affordableDecks.find(d => d.cost === 15);
            const visible2Pt = affordableDecks.find(d => d.visibleCard && d.visibleCard.points === 2);

            if (visible3Pt) {
                wantsToBuy = true;
                preferredDeck = visible3Pt;
                reason = "TIER_MEDIUM_SNIPE_3PT";
            } else if (visible2Pt) {
                wantsToBuy = true;
                preferredDeck = visible2Pt;
                reason = "TIER_MEDIUM_OPEN_2PT_BUY";
            } else if (deck15 && botGold >= 20) {
                wantsToBuy = true;
                preferredDeck = deck15;
                reason = "TIER_MEDIUM_15AU_BUY";
            } else if (botGold >= 15) {
                preferredDeck = affordableDecks.find(d => d.cost === 10) || affordableDecks[0];
                wantsToBuy = true;
                reason = "TIER_MEDIUM_MODERATE_BUY";
            } else {
                wantsToBuy = false;
                reason = "TIER_MEDIUM_SAVE";
            }
        }
    }

    if (wantsToBuy && preferredDeck) {
        return { action: "BUY_LUXURY", deckId: preferredDeck.id, reason };
    }

    return { action: "NO_LUXURY", deckId: null, reason };
}

/**
 * Developer helper for inspecting Luxury AI decision making for a bot.
 * @param {Object} state - Live engine state
 * @param {number|Object} [botParam] - Optional bot index, botId, or bot player object
 * @returns {{ knowledge: Object, report: Object, decision: Object }}
 */
export function inspectBotLuxuryDecision(state, botParam) {
    const s = state || (typeof window !== 'undefined' ? window.state : null);
    if (!s) return null;

    let bot = botParam;
    if (bot === undefined && s.players) {
        bot = s.players.find(p => p.type === 'BOT') || s.players[0];
    } else if (typeof bot === 'number' && s.players) {
        bot = s.players.find(p => p.botId === bot) || s.players.find(p => p.id === bot) || s.players[bot];
    }

    const knowledge = buildBotKnowledgeState(s, bot);
    const report = validateBotKnowledge(knowledge);
    const decision = chooseLuxuryDeck(bot, knowledge);

    console.group(`[LUXURY DECISION INSPECTOR] Choice for Bot Player ${typeof bot === 'object' ? (bot.name || bot.id) : bot}`);
    console.log("Decision Result:", decision);
    console.log("Affordable Decks:", getAvailableLuxuryDecks(knowledge, bot));
    console.groupEnd();

    return { knowledge, report, decision };
}

// ============================================================================
// AUCTION AI DECISION ENGINE (PHASE 3 & PHASE 5E.1)
// ============================================================================

/**
 * Calculates the maximum bid ceiling for a bot using purely sanitized public state.
 * @param {Object} bot - The bot player object
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {{ limit: number, reason: string }}
 */
export function calculateLegacyBidLimit(bot, knowledge) {
    if (!knowledge || !knowledge.activeAuction) {
        return { limit: 0, reason: "NO_ACTIVE_AUCTION" };
    }

    const selfPlayer = (knowledge.players || []).find(p => p.id === knowledge.selfPlayerId) || bot;
    const botGold = (selfPlayer && selfPlayer.gold !== null && selfPlayer.gold !== undefined) ? selfPlayer.gold : (bot?.gold || 0);

    // Campaign overrides
    if (knowledge.activeGambitId === 3) {
        return { limit: Math.min(botGold, 30), reason: "GAMBIT3_TARGET_BID" };
    }
    if (knowledge.activeGambitId === 11) {
        return { limit: botGold, reason: "GAMBIT11_ALL_IN" };
    }

    const depth = getBotAiDepth(bot);
    const visibleCard = getVisibleAuctionCard(knowledge);
    const points = visibleCard ? (visibleCard.points || 2) : 2;
    const propertyName = visibleCard ? visibleCard.name : null;

    const aa = knowledge.activeAuction;
    const otherParticipants = (knowledge.players || []).filter(p => p.id !== (selfPlayer ? selfPlayer.id : bot?.id) && aa.participants.includes(p.id));
    const knownOtherGolds = otherParticipants.map(p => p.gold).filter(g => g !== null && g !== undefined);
    const otherMaxGold = knownOtherGolds.length > 0 ? Math.max(...knownOtherGolds) : null;

    let limit = botGold;
    let reason = "ALL_IN";

    if (depth === 'LOW') {
        // LOW AI: Simple continuation or panic fold
        if (Math.random() < 0.3) {
            limit = 0;
            reason = "NOVICE_PANIC_FOLD";
        } else {
            limit = botGold;
            reason = "NOVICE_CONTINUE";
        }
    } else if (depth === 'FULL') {
        // FULL AI fallback: Shark bidding (Bleeds opponent if richer, otherwise all-in)
        if (otherMaxGold !== null && botGold > otherMaxGold) {
            limit = otherMaxGold + 1;
            reason = "SHARK_BLEED_OPPONENT";
        } else {
            limit = botGold;
            reason = "SHARK_ALL_IN";
        }
    } else {
        // MEDIUM AI: Opportunist valuation based on points and bankroll
        if (propertyName === 'Mar-a-Lago' || points >= 4) {
            limit = botGold;
            reason = "OPPORTUNIST_MAR_A_LAGO";
        } else {
            limit = Math.min(botGold, Math.max(points * 6, botGold - 10));
            reason = "OPPORTUNIST_BID";
        }
    }

    if (limit > 0 && limit < 5) {
        limit = Math.min(botGold, 5);
    }
    limit = Math.min(botGold, limit);

    return { limit, reason };
}

/**
 * Pure sanitized auction bidding decision function.
 * Evaluates whether to raise or pass and by how much, without inspecting raw state.
 * @param {Object} bot - The bot player object
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {{ action: "RAISE" | "PASS", amount: number, targetBid: number|null, maxBid: number, reason: string }}
 */
export function chooseAuctionAction(bot, knowledge) {
    if (!knowledge || !knowledge.activeAuction) {
        return { action: "PASS", amount: 0, targetBid: null, maxBid: 0, reason: "NO_ACTIVE_AUCTION" };
    }

    const aa = knowledge.activeAuction;
    const botId = (bot && bot.id !== undefined) ? bot.id : knowledge.selfPlayerId;
    if (!Array.isArray(aa.participants) || !aa.participants.includes(botId)) {
        return { action: "PASS", amount: 0, targetBid: null, maxBid: 0, reason: "NOT_A_PARTICIPANT" };
    }

    const { limit, reason } = calculateLegacyBidLimit(bot, knowledge);
    const capBid = knowledge.activeGambitId === 11 ? 9999 : 50;
    const targetBid = (aa.currentBid || 0) + 1;

    if (targetBid <= limit && (aa.currentBid || 0) < capBid) {
        return {
            action: "RAISE",
            amount: 1,
            targetBid: targetBid,
            maxBid: limit,
            reason: reason
        };
    } else {
        return {
            action: "PASS",
            amount: 0,
            targetBid: null,
            maxBid: limit,
            reason: limit === 0 ? reason : (targetBid > limit ? "BID_LIMIT_EXCEEDED" : "AUCTION_CAP_REACHED")
        };
    }
}

/**
 * Developer helper for inspecting Auction AI decision making for a bot.
 * @param {Object|number} [botParam] - Bot object or bot player ID
 * @param {Object} [stateParam] - Game state (defaults to window.state)
 * @returns {Object} The auction decision breakdown
 */
export function inspectBotAuctionDecision(botParam, stateParam) {
    const s = stateParam || (typeof window !== 'undefined' ? window.state : null);
    if (!s) {
        console.warn("[BOT AUCTION INSPECTOR] No game state available.");
        return null;
    }

    let bot = botParam;
    if (bot === undefined && s.players) {
        bot = s.players.find(p => p.type === 'BOT') || s.players[0];
    } else if (typeof bot === 'number' && s.players) {
        bot = s.players.find(p => p.botId === bot) || s.players.find(p => p.id === bot) || s.players[bot];
    }

    const knowledge = buildBotKnowledgeState(s, bot);
    const decision = chooseAuctionAction(bot, knowledge);

    console.group(`BOT AUCTION DECISION — ${bot ? (bot.name || `Bot ${bot.id}`) : 'Unknown'}`);
    console.log(`Action: ${decision.action}`);
    console.log(`Amount: ${decision.amount}`);
    console.log(`Target Bid: ${decision.targetBid}`);
    console.log(`Max Bid Limit: ${decision.maxBid}`);
    console.log(`Reason: ${decision.reason}`);
    console.log("Active Auction State:", knowledge.activeAuction);
    console.groupEnd();

    return {
        bot,
        decision,
        activeAuction: knowledge.activeAuction
    };
}

/**
 * Controlled self-tests for the anti-cheating validator, map decision logic, and luxury decision logic.
 * @returns {{ allPassed: boolean, results: Array<{ test: string, passed: boolean, details?: any }> }}
 */
export function runBotKnowledgeSelfTests() {
    const results = [];

    // Base valid mock snapshot generator
    const createBaseValidSnapshot = () => ({
        turn: 0,
        turnCount: 1,
        mode: 'GAME',
        isGameOver: false,
        activeGambitId: null,
        selfPlayerId: 1,
        rules: {
            jaegaVariation: false,
            roxanaVariation: false,
            miznerVariation: false,
            showBotMoney: true,
            isOpenLuxury: false,
            isOpenAuction: false,
            difficulty: 'NORMAL'
        },
        grid: [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 8, difficulty: 4, empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, empty: false, flipped: true, locked: false, isBonus: false, spriteIndex: 3 }
        ],
        luxuryDecks: [
            { id: 0, cost: 5, taxCount: 0, cardsRemaining: 6, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, taxCount: 0, cardsRemaining: 6, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, taxCount: 0, cardsRemaining: 6, isOpen: false, visibleCard: null }
        ],
        auctions: {
            A: { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null },
            B: { id: 'B', resolved: false, triggered: false, isVisible: false, visibleCard: null }
        },
        activeAuction: null,
        players: [
            { id: 0, name: 'Local 1', type: 'HUMAN', gold: 10, totalGold: 10, prestige: 0, inventory: [] },
            { id: 1, name: 'Superboy', type: 'BOT', gold: 0, totalGold: 0, prestige: 0, inventory: [] }
        ]
    });

    // Test A — Closed Map Leak (spriteIndex exposed on flipped=false cell)
    {
        const snap = createBaseValidSnapshot();
        snap.grid[0].spriteIndex = 42;
        const res = validateBotKnowledge(snap);
        const passed = !res.valid && res.errors.some(e => e.domain === 'MAP' && e.field === 'spriteIndex');
        results.push({ test: 'Test A — Closed Map spriteIndex Leak', passed, details: res.errors });
    }

    // Test B — Hidden Bonus Leak (isBonus exposed on flipped=false cell)
    {
        const snap = createBaseValidSnapshot();
        snap.grid[0].isBonus = true;
        const res = validateBotKnowledge(snap);
        const passed = !res.valid && res.errors.some(e => e.domain === 'MAP' && e.field === 'isBonus');
        results.push({ test: 'Test B — Hidden Bonus Leak', passed, details: res.errors });
    }

    // Test C — Closed Luxury Leak (visibleCard exposed on isOpen=false deck)
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0].visibleCard = { name: "Luxury Yacht", points: 3 };
        const res = validateBotKnowledge(snap);
        const passed = !res.valid && res.errors.some(e => e.domain === 'LUXURY' && e.field === 'visibleCard');
        results.push({ test: 'Test C — Closed Luxury visibleCard Leak', passed, details: res.errors });
    }

    // Test D — Raw Luxury Deck Leak (cards array attached to deck)
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0].cards = [{ name: "Private Jet", points: 2 }];
        const res = validateBotKnowledge(snap);
        const passed = !res.valid && res.errors.some(e => e.domain === 'LUXURY' && e.field === 'cards');
        results.push({ test: 'Test D — Raw Luxury Deck cards Array Leak', passed, details: res.errors });
    }

    // Test E — Hidden Auction Leak (visibleCard exposed on isVisible=false auction)
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.visibleCard = { id: 0, name: "Mar-a-Lago", points: 4 };
        const res = validateBotKnowledge(snap);
        const passed = !res.valid && res.errors.some(e => e.domain === 'AUCTION' && e.field === 'visibleCard');
        results.push({ test: 'Test E — Hidden Auction visibleCard Leak', passed, details: res.errors });
    }

    // Test F — Valid Snapshot (Clean pass)
    {
        const snap = createBaseValidSnapshot();
        const res = validateBotKnowledge(snap);
        const passed = res.valid && res.errors.length === 0;
        results.push({ test: 'Test F — Valid Snapshot (Clean PASS)', passed, details: res.errors });
    }

    // Test G — Strict Mode Error Throwing
    {
        const snap = createBaseValidSnapshot();
        snap.grid[0].spriteIndex = 99;
        let threw = false;
        try {
            validateBotKnowledge(snap, { throwOnError: true });
        } catch (e) {
            threw = true;
        }
        results.push({ test: 'Test G — Strict Mode throwOnError', passed: threw });
    }

    // Test H — Map Finisher Detection
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r4c0', r: 4, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c7', r: 4, c: 7, type: 'WF_R', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c8', r: 4, c: 8, type: 'ATLANTIC', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c0', r: 1, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c7', r: 1, c: 7, type: 'WF_R', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r0c8', r: 0, c: 8, type: 'ATLANTIC', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c8', r: 1, c: 8, type: 'ATLANTIC', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null }
        ];
        const avail = getAvailableMapCells(snap);
        const { rowCounts, colCounts } = analyzeBoardLines(snap);
        const finishers = findFinishers(avail, rowCounts, colCounts);
        const passed = finishers.length === 1 && finishers[0].id === 'r4c2';
        results.push({ test: 'Test H — Map Finisher Detection', passed, details: finishers });
    }

    // Test I — Map Trap Detection
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r2c0', r: 2, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r2c7', r: 2, c: 7, type: 'WF_R', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r2c8', r: 2, c: 8, type: 'ATLANTIC', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r3c2', r: 3, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c0', r: 1, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r3c0', r: 3, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null }
        ];
        const avail = getAvailableMapCells(snap);
        const { rowCounts, colCounts } = analyzeBoardLines(snap);
        const traps = findTrapCells(avail, rowCounts, colCounts);
        const passed = traps.length === 2 && traps.some(t => t.id === 'r2c1') && traps.some(t => t.id === 'r2c2');
        results.push({ test: 'Test I — Map Trap Detection', passed, details: traps });
    }

    // Test J — No Hidden Field Dependency (Map AI)
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 4, botId: 4, intelligenceLevel: 6 }; // Pirate
        snap.grid = [
            { id: 'r1c0', r: 1, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null }
        ];
        const decision = chooseMapCell(bot, snap);
        const passed = decision.chosenCellId !== null && snap.grid.some(c => c.id === decision.chosenCellId);
        results.push({ test: 'Test J — No Hidden Field Dependency', passed, details: decision });
    }

    // Test K — No Legal Moves Available
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null }
        ];
        const decision = chooseMapCell({ id: 1, intelligenceLevel: 1 }, snap);
        const passed = decision.chosenCellId === null && decision.reason === 'NO_LEGAL_MOVES';
        results.push({ test: 'Test K — No Move Available Graceful Handling', passed, details: decision });
    }

    // Helper to create grid with no finishers and no imminent waterfronts
    const createNoFinisherGrid = () => [
        { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
        { id: 'r0c1', r: 0, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
        { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
        { id: 'r1c0', r: 1, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
        { id: 'r1c1', r: 1, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
        { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
        { id: 'r2c0', r: 2, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
        { id: 'r2c1', r: 2, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
        { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null }
    ];

    // Test L — Closed Luxury Pile Decision (No hidden card access needed)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = createNoFinisherGrid();
        const bot = { id: 10, botId: 10, intelligenceLevel: 10, gold: 20, personality: 'SAVER' };
        snap.players[1] = { id: 10, name: 'Anonymous', type: 'BOT', gold: 20, totalGold: 20, prestige: 0, inventory: [] };
        // Decks closed, visibleCard is null
        snap.luxuryDecks = [
            { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null }
        ];
        const decision = chooseLuxuryDeck(bot, snap);
        const passed = decision.action === 'BUY_LUXURY' && decision.deckId === 2;
        results.push({ test: 'Test L — Closed Luxury Pile Decision', passed, details: decision });
    }

    // Test M — Open Luxury Pile Decision (Uses visible top card)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = createNoFinisherGrid();
        snap.rules.isOpenLuxury = true;
        const bot = { id: 3, botId: 3, intelligenceLevel: 5, gold: 12, personality: 'MODERATE' };
        snap.players[1] = { id: 3, name: 'Surfer Dude', type: 'BOT', gold: 12, totalGold: 12, prestige: 0, inventory: [] };
        // Deck 1 has visible 2pt card
        snap.luxuryDecks = [
            { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Snorkel", points: 1, cost: 5 } },
            { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Jet Ski", points: 2, cost: 10 } },
            { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15 } }
        ];
        const decision = chooseLuxuryDeck(bot, snap);
        const passed = decision.action === 'BUY_LUXURY' && decision.deckId === 1 && (decision.reason === 'TIER_MEDIUM_OPEN_2PT_BUY' || decision.reason === 'SURFER_OPEN_2PT_BUY');
        results.push({ test: 'Test M — Open Luxury Pile Decision', passed, details: decision });
    }

    // Test N — No Hidden Deck Dependency (No cards array present)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = createNoFinisherGrid();
        const bot = { id: 7, botId: 7, intelligenceLevel: 7, gold: 18, personality: 'MODERATE' };
        snap.players[1] = { id: 7, name: 'The Twins', type: 'BOT', gold: 18, totalGold: 18, prestige: 0, inventory: [] };
        // Ensure none of the decks contain .cards
        snap.luxuryDecks = [
            { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null }
        ];
        const decision = chooseLuxuryDeck(bot, snap);
        const passed = decision.action === 'BUY_LUXURY' && (decision.deckId === 1 || decision.deckId === 2);
        results.push({ test: 'Test N — No Hidden Deck Dependency', passed, details: decision });
    }

    // Test O — Empty Luxury Pile
    {
        const snap = createBaseValidSnapshot();
        snap.grid = createNoFinisherGrid();
        const bot = { id: 10, botId: 10, intelligenceLevel: 10, gold: 30 };
        snap.players[1] = { id: 10, name: 'Anonymous', type: 'BOT', gold: 30, totalGold: 30, prestige: 0, inventory: [] };
        // Deck 2 is empty
        snap.luxuryDecks = [
            { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, taxCount: 0, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];
        const decision = chooseLuxuryDeck(bot, snap);
        const passed = decision.action === 'BUY_LUXURY' && decision.deckId !== 2;
        results.push({ test: 'Test O — Empty Luxury Pile Never Selected', passed, details: decision });
    }

    // Test P — Unaffordable Pile
    {
        const snap = createBaseValidSnapshot();
        snap.grid = createNoFinisherGrid();
        const bot = { id: 10, botId: 10, intelligenceLevel: 10, gold: 7 };
        snap.players[1] = { id: 10, name: 'Anonymous', type: 'BOT', gold: 7, totalGold: 7, prestige: 0, inventory: [] };
        snap.luxuryDecks = [
            { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null }
        ];
        const decision = chooseLuxuryDeck(bot, snap);
        const passed = decision.deckId !== 1 && decision.deckId !== 2;
        results.push({ test: 'Test P — Unaffordable Pile Never Selected', passed, details: decision });
    }

    // Test Q — Finisher Priority Over Luxury
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 4, botId: 4, intelligenceLevel: 6, gold: 25 }; // Smart bot (int >= 4)
        snap.players[1] = { id: 4, name: 'Pirate', type: 'BOT', gold: 25, totalGold: 25, prestige: 0, inventory: [] };
        // Row 4 has only 1 tile remaining -> Finisher exists!
        snap.grid = [
            { id: 'r4c0', r: 4, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c7', r: 4, c: 7, type: 'WF_R', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c8', r: 4, c: 8, type: 'ATLANTIC', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null }
        ];
        const decision = chooseLuxuryDeck(bot, snap);
        const passed = decision.action === 'NO_LUXURY' && decision.reason === 'FINISHER_PRIORITY';
        results.push({ test: 'Test Q — Finisher Priority Over Luxury', passed, details: decision });
    }

    // Test R — Hidden Auction (Concealed Mar-a-Lago does not trigger gold holding)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = createNoFinisherGrid();
        snap.rules.isOpenAuction = false;
        const bot = { id: 4, botId: 4, intelligenceLevel: 6, gold: 20, personality: 'MODERATE' };
        snap.players[1] = { id: 4, name: 'Pirate', type: 'BOT', gold: 20, totalGold: 20, prestige: 0, inventory: [] };
        // Auction is concealed: visibleCard is null
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        const decision = chooseLuxuryDeck(bot, snap);
        const passed = decision.reason !== 'HOLD_FOR_MAR_A_LAGO';
        results.push({ test: 'Test R — Concealed Auction Disallows Card Cheating', passed, details: decision });
    }

    // Test S — Open Auction (Revealed Mar-a-Lago causes gold hold for Pirate)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = createNoFinisherGrid();
        snap.rules.isOpenAuction = true;
        const bot = { id: 4, botId: 4, intelligenceLevel: 6, gold: 20, personality: 'MODERATE' };
        snap.players[1] = { id: 4, name: 'Pirate', type: 'BOT', gold: 20, totalGold: 20, prestige: 0, inventory: [] };
        // Auction is open: visibleCard is Mar-a-Lago
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: true, visibleCard: { id: 0, name: "Mar-a-Lago", points: 4 } };
        const decision = chooseLuxuryDeck(bot, snap);
        const passed = decision.action === 'NO_LUXURY' && decision.reason === 'HOLD_FOR_MAR_A_LAGO';
        results.push({ test: 'Test S — Open Auction Mar-a-Lago Gold Hold', passed, details: decision });
    }

    // ============================================================================
    // AUCTION DECISION TESTS (PHASE 3C)
    // ============================================================================

    // Test T — Hidden Property Auction (visibleCard is null, runs safely without card points/name)
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 5, botId: 5, aiDepth: 'MEDIUM', intelligenceLevel: 5, gold: 20, personality: 'MODERATE' };
        snap.players[1] = { id: 5, name: 'Robot', type: 'BOT', gold: 20, totalGold: 20, prestige: 0, inventory: [] };
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            turnIndex: 1,
            activePlayerId: 5,
            highestBidderId: 0,
            participants: [0, 5],
            isVisible: false,
            visibleCard: null,
            card: null
        };
        const decision = chooseAuctionAction(bot, snap);
        const passed = decision.action === 'RAISE' && decision.maxBid > 0 && (decision.reason === 'OPPORTUNIST_BID' || decision.reason === 'OPPORTUNIST_MODERATE');
        results.push({ test: 'Test T — Hidden Property Auction Reasoning', passed, details: decision });
    }

    // Test U — Visible 2P Property Auction (Calculates legacy cap from visible points)
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 5, botId: 5, aiDepth: 'MEDIUM', intelligenceLevel: 5, gold: 20, personality: 'MODERATE' };
        snap.players[1] = { id: 5, name: 'Robot', type: 'BOT', gold: 20, totalGold: 20, prestige: 0, inventory: [] };
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            turnIndex: 1,
            activePlayerId: 5,
            highestBidderId: 0,
            participants: [0, 5],
            isVisible: true,
            visibleCard: { id: 1, name: "Spanish River", points: 2 },
            card: { id: 1, name: "Spanish River", points: 2 }
        };
        const decision = chooseAuctionAction(bot, snap);
        // Opportunist Moderate with 20 Au, points=2: Math.min(20, Math.max(2*6, 20-10)) = 12
        const passed = decision.action === 'RAISE' && decision.maxBid === 12 && decision.targetBid === 6;
        results.push({ test: 'Test U — Visible 2P Property Value Cap', passed, details: decision });
    }

    // Test V — Visible Mar-a-Lago (Opportunist goes all-in)
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 4, botId: 4, intelligenceLevel: 6, gold: 25, personality: 'MODERATE' };
        snap.players[1] = { id: 4, name: 'Pirate', type: 'BOT', gold: 25, totalGold: 25, prestige: 0, inventory: [] };
        snap.activeAuction = {
            id: 'A',
            currentBid: 15,
            turnIndex: 1,
            activePlayerId: 4,
            highestBidderId: 0,
            participants: [0, 4],
            isVisible: true,
            visibleCard: { id: 0, name: "Mar-a-Lago", points: 4 },
            card: { id: 0, name: "Mar-a-Lago", points: 4 }
        };
        const decision = chooseAuctionAction(bot, snap);
        const passed = decision.action === 'RAISE' && decision.maxBid === 25 && (decision.reason === 'OPPORTUNIST_MAR_A_LAGO' || decision.reason === 'PIRATE_MAR_A_LAGO');
        results.push({ test: 'Test V — Visible Mar-a-Lago Triggers Pirate Max Bid', passed, details: decision });
    }

    // Test W — Hidden Mar-a-Lago Cannot Trigger Special Logic
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 4, botId: 4, intelligenceLevel: 6, gold: 25, personality: 'MODERATE' };
        snap.players[1] = { id: 4, name: 'Pirate', type: 'BOT', gold: 25, totalGold: 25, prestige: 0, inventory: [] };
        snap.activeAuction = {
            id: 'A',
            currentBid: 10,
            turnIndex: 1,
            activePlayerId: 4,
            highestBidderId: 0,
            participants: [0, 4],
            isVisible: false,
            visibleCard: null,
            card: null
        };
        const decision = chooseAuctionAction(bot, snap);
        // Because visibleCard is null, propertyName is null -> PIRATE_MAR_A_LAGO must not trigger
        const passed = decision.reason !== 'OPPORTUNIST_MAR_A_LAGO' && decision.reason !== 'PIRATE_MAR_A_LAGO' && decision.maxBid === 15;
        results.push({ test: 'Test W — Hidden Mar-a-Lago Cannot Trigger Special Logic', passed, details: decision });
    }

    // Test X — Cannot Overbid Wallet
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, intelligenceLevel: 10, gold: 12 };
        snap.players[1] = { id: 10, name: 'Gran Gran', type: 'BOT', gold: 12, totalGold: 12, prestige: 0, inventory: [] };
        snap.activeAuction = {
            id: 'A',
            currentBid: 10,
            turnIndex: 1,
            activePlayerId: 10,
            highestBidderId: 0,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 0, name: "Mar-a-Lago", points: 4 },
            card: { id: 0, name: "Mar-a-Lago", points: 4 }
        };
        const decision = chooseAuctionAction(bot, snap);
        const passed = decision.maxBid <= 12 && (decision.targetBid === null || decision.targetBid <= 12);
        results.push({ test: 'Test X — Cannot Overbid Wallet', passed, details: decision });
    }

    // Test Y — Opponent Gold Hidden (Graceful handling when opponent gold is null)
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, aiDepth: 'FULL', intelligenceLevel: 10, gold: 20 };
        snap.players[0].gold = null; // Opponent gold hidden
        snap.players[1] = { id: 10, name: 'Gran Gran', type: 'BOT', gold: 20, totalGold: 20, prestige: 0, inventory: [] };
        snap.activeAuction = {
            id: 'A',
            currentBid: 10,
            turnIndex: 1,
            activePlayerId: 10,
            highestBidderId: 0,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 1, name: "Spanish River", points: 2 },
            card: { id: 1, name: "Spanish River", points: 2 }
        };
        const decision = chooseAuctionAction(bot, snap);
        const passed = decision.action === 'RAISE' && decision.maxBid === 20 && decision.reason === 'SHARK_ALL_IN';
        results.push({ test: 'Test Y — Opponent Gold Hidden Graceful Handling', passed, details: decision });
    }

    // Test Z — Opponent Gold Public (Bleed out opponent logic)
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, aiDepth: 'FULL', intelligenceLevel: 10, gold: 20 };
        snap.players[0].gold = 14; // Opponent has 14 Au
        snap.players[1] = { id: 10, name: 'Gran Gran', type: 'BOT', gold: 20, totalGold: 20, prestige: 0, inventory: [] };
        snap.activeAuction = {
            id: 'A',
            currentBid: 10,
            turnIndex: 1,
            activePlayerId: 10,
            highestBidderId: 0,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 1, name: "Spanish River", points: 2 },
            card: { id: 1, name: "Spanish River", points: 2 }
        };
        const decision = chooseAuctionAction(bot, snap);
        const passed = decision.action === 'RAISE' && decision.maxBid === 15 && decision.reason === 'SHARK_BLEED_OPPONENT';
        results.push({ test: 'Test Z — Opponent Gold Public Bleed Logic', passed, details: decision });
    }

    // Test AA — Fold at Legacy Bid Limit
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 5, botId: 5, aiDepth: 'MEDIUM', intelligenceLevel: 5, gold: 20, personality: 'MODERATE' };
        snap.players[1] = { id: 5, name: 'Robot', type: 'BOT', gold: 20, totalGold: 20, prestige: 0, inventory: [] };
        snap.activeAuction = {
            id: 'A',
            currentBid: 12, // Limit is 12, so next bid 13 exceeds limit
            turnIndex: 1,
            activePlayerId: 5,
            highestBidderId: 0,
            participants: [0, 5],
            isVisible: true,
            visibleCard: { id: 1, name: "Spanish River", points: 2 },
            card: { id: 1, name: "Spanish River", points: 2 }
        };
        const decision = chooseAuctionAction(bot, snap);
        const passed = decision.action === 'PASS' && decision.amount === 0 && decision.targetBid === null;
        results.push({ test: 'Test AA — Fold at Legacy Bid Limit', passed, details: decision });
    }

    // Test AB — Legal Raise Generation
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 5, botId: 5, aiDepth: 'MEDIUM', intelligenceLevel: 5, gold: 20, personality: 'MODERATE' };
        snap.players[1] = { id: 5, name: 'Robot', type: 'BOT', gold: 20, totalGold: 20, prestige: 0, inventory: [] };
        snap.activeAuction = {
            id: 'A',
            currentBid: 3,
            turnIndex: 1,
            activePlayerId: 5,
            highestBidderId: 0,
            participants: [0, 5],
            isVisible: true,
            visibleCard: { id: 1, name: "Spanish River", points: 2 },
            card: { id: 1, name: "Spanish River", points: 2 }
        };
        const decision = chooseAuctionAction(bot, snap);
        const passed = decision.action === 'RAISE' && decision.amount === 1 && decision.targetBid === 4;
        results.push({ test: 'Test AB — Legal Incremental Raise', passed, details: decision });
    }

    // ==========================================
    // VISITOR ROSTER & INVARIANT TESTS (PHASE 5E.0 / 5E.1)
    // ==========================================

    // Test AC — Visitor Roster Length & Sequential IDs 1..10
    {
        const isTen = botRoster.length === 10;
        const ids = botRoster.map(b => b.id);
        const expectedIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const idsMatch = JSON.stringify(ids) === JSON.stringify(expectedIds);
        const passed = isTen && idsMatch;
        results.push({ test: 'Test AC — Visitor Roster Length & Sequential IDs 1..10', passed, details: { len: botRoster.length, ids } });
    }

    // Test AD — Visitor Canonical Names Mapping 1..10 (Phase 5E.1 Boss Cat)
    {
        const expectedNames = [
            "Goober",
            "Superboy",
            "Surfer Dude",
            "Boss Cat",
            "Robot",
            "Pirate",
            "Flamingo Queen",
            "Magician",
            "The Twins",
            "Gran Gran"
        ];
        const actualNames = botRoster.map(b => b.name);
        const passed = JSON.stringify(actualNames) === JSON.stringify(expectedNames);
        results.push({ test: 'Test AD — Visitor Canonical Names Mapping 1..10', passed, details: { actualNames, expectedNames } });
    }

    // Test AE — Authoritative Starting Rerolls [0, 0, 0, 0, 0, 0, 0, 1, 3, 6]
    {
        const actualRerolls = botRoster.map(b => b.abilities?.maxRerolls);
        const expectedRerolls = [0, 0, 0, 0, 0, 0, 0, 1, 3, 6];
        const passed = JSON.stringify(actualRerolls) === JSON.stringify(expectedRerolls);
        results.push({ test: 'Test AE — Authoritative Starting Rerolls [0, 0, 0, 0, 0, 0, 0, 1, 3, 6]', passed, details: { actualRerolls, expectedRerolls } });
    }

    // Test AF — All Visitors Stripped of Old Powers (Wealth, Modifiers, Hooks)
    {
        const noWealthBonus = botRoster.every(b => !b.abilities?.startingWealthBonus || b.abilities.startingWealthBonus === 0);
        const noRollModifiers = botRoster.every(b => b.abilities?.rollModifier === null || b.abilities?.rollModifier === undefined);
        const noHooks = botRoster.every(b => !b.hooks || Object.keys(b.hooks).length === 0);
        const passed = noWealthBonus && noRollModifiers && noHooks;
        results.push({ test: 'Test AF — All Visitors Stripped of Old Powers (Wealth, Modifiers, Hooks)', passed, details: { noWealthBonus, noRollModifiers, noHooks } });
    }

    // Test AG — Visitor Boss Cat Present & Leja / Anonymous Absent from Visitors
    {
        const bossCat = botRoster.find(b => b.id === 4);
        const isBossCatId4 = bossCat && bossCat.name === 'Boss Cat';
        const hasVisitorLeja = botRoster.some(b => b.name === 'Leja' || b.name === 'LEJA');
        const hasAnonymous = botRoster.some(b => b.name === 'Anonymous' || b.name === 'ANONYMOUS');
        const passed = isBossCatId4 && !hasVisitorLeja && !hasAnonymous;
        results.push({ test: 'Test AG — Visitor Boss Cat Present & Leja / Anonymous Absent from Visitors', passed, details: { isBossCatId4, hasVisitorLeja, hasAnonymous } });
    }

    // Test AH — Metadata Fields Present (intelligence, aiDepth, personality, intelligenceLevel)
    {
        const allHaveIntelligence = botRoster.every(b => ['LOW', 'MEDIUM', 'HIGH'].includes(b.intelligence));
        const allHaveAiDepth = botRoster.every(b => ['LOW', 'MEDIUM', 'FULL'].includes(b.aiDepth));
        const allHavePersonality = botRoster.every(b => ['BALANCED', 'CAUTIOUS', 'AGGRESSIVE'].includes(b.personality));
        const allHaveIntLevel = botRoster.every((b, idx) => b.intelligenceLevel === idx + 1);
        const passed = allHaveIntelligence && allHaveAiDepth && allHavePersonality && allHaveIntLevel;
        results.push({ test: 'Test AH — Metadata Fields Present (intelligence, aiDepth, personality, intelligenceLevel)', passed, details: { allHaveIntelligence, allHaveAiDepth, allHavePersonality, allHaveIntLevel } });
    }

    // Test AI — Pirate Power Removal Invariant (No Starting Wealth, No Lagoon Steal Hook)
    {
        const pirate = botRoster.find(b => b.id === 6);
        const pirateWealthZero = pirate?.abilities?.startingWealthBonus === 0;
        const pirateNoHooks = !pirate?.hooks || !pirate.hooks.onMapCardFlipped;
        const pirateRerollsZero = pirate?.abilities?.maxRerolls === 0;
        const passed = pirateWealthZero && pirateNoHooks && pirateRerollsZero;
        results.push({ test: 'Test AI — Pirate Power Removal Invariant', passed, details: { pirateWealthZero, pirateNoHooks, pirateRerollsZero } });
    }

    // Test AJ — Magician Power Removal Invariant (No Starting Wine Hook, MaxRerolls 1)
    {
        const magician = botRoster.find(b => b.id === 8);
        const magicianNoHooks = !magician?.hooks || !magician.hooks.onGameStart;
        const magicianWealthZero = magician?.abilities?.startingWealthBonus === 0;
        const magicianRerollOne = magician?.abilities?.maxRerolls === 1;
        const passed = magicianNoHooks && magicianWealthZero && magicianRerollOne;
        results.push({ test: 'Test AJ — Magician Power Removal Invariant', passed, details: { magicianNoHooks, magicianWealthZero, magicianRerollOne } });
    }

    // Test AK — Knowledge Firewall Luxury rerollsGranted Whitelist & Closed Masking (Phase 5B.14)
    {
        const snap = createBaseValidSnapshot();
        // Open deck with Designer Handbag exposing rerollsGranted = 1
        snap.luxuryDecks[0] = {
            id: 0,
            cost: 5,
            taxCount: 0,
            cardsRemaining: 5,
            isOpen: true,
            visibleCard: {
                name: "Designer Handbag",
                points: 1,
                cost: 5,
                tier: 1,
                type: 'LUXURY',
                rerollsGranted: 1
            }
        };
        // Closed deck with visibleCard = null
        snap.luxuryDecks[1] = {
            id: 1,
            cost: 10,
            taxCount: 0,
            cardsRemaining: 5,
            isOpen: false,
            visibleCard: null
        };

        const resOpen = validateBotKnowledge(snap);
        const openPassed = resOpen.valid && resOpen.errors.length === 0;

        // Verify that if a closed deck leaks visibleCard (or reroll info), firewall rejects it
        const snapClosedLeak = createBaseValidSnapshot();
        snapClosedLeak.luxuryDecks[1] = {
            id: 1,
            cost: 10,
            taxCount: 0,
            cardsRemaining: 5,
            isOpen: false,
            visibleCard: { name: "Tiger Experience", points: 2, rerollsGranted: 2 }
        };
        const resClosed = validateBotKnowledge(snapClosedLeak);
        const closedBlocked = !resClosed.valid && resClosed.errors.some(e => e.domain === 'LUXURY' && e.field === 'visibleCard');

        const passed = openPassed && closedBlocked;
        results.push({
            test: 'Test AK — Luxury rerollsGranted whitelisted for open deck & blocked for closed deck',
            passed,
            details: { openPassed, closedBlocked, openErrors: resOpen.errors, closedErrors: resClosed.errors }
        });
    }

    // Test AL — Local Character LEJA Preserved Separately from Visitor Boss Cat (Phase 5E.1)
    {
        const localLeja = CHARACTERS.find(c => c.name === 'LEJA' || c.name === 'Leja');
        const isLocalLejaPresent = Boolean(localLeja && localLeja.id === 0);
        const visitorBossCat = botRoster.find(b => b.id === 4);
        const isVisitorBossCat = Boolean(visitorBossCat && visitorBossCat.name === 'Boss Cat');
        const passed = isLocalLejaPresent && isVisitorBossCat;
        results.push({
            test: 'Test AL — Local Character LEJA Preserved Separately from Visitor Boss Cat',
            passed,
            details: { isLocalLejaPresent, isVisitorBossCat }
        });
    }

    // Test AM — isGranGranVisitor Invariant (Ignores Shuffled Player ID) (Phase 5E.1)
    {
        const isGranGran1 = isGranGranVisitor({ id: 0, botId: 10, name: "Gran Gran", type: "BOT" });
        const isGranGran2 = isGranGranVisitor({ id: 10, botId: 9, name: "The Twins", type: "BOT" });
        const isGranGran3 = isGranGranVisitor({ id: 10, name: "Human Player", type: "HUMAN" });
        const isGranGran4 = isGranGranVisitor({ id: 2, botId: 10, name: "Gran Gran", type: "BOT" });
        const passed = isGranGran1 === true && isGranGran2 === false && isGranGran3 === false && isGranGran4 === true;
        results.push({
            test: 'Test AM — isGranGranVisitor Invariant (Ignores Shuffled Player ID)',
            passed,
            details: { isGranGran1, isGranGran2, isGranGran3, isGranGran4 }
        });
    }

    // Test AN — getBotAiDepth Tier Routing Across All Roster Bots (Phase 5E.1)
    {
        const lowBots = [1, 2, 3].map(id => botRoster.find(b => b.id === id)).every(b => getBotAiDepth(b) === 'LOW');
        const mediumBots = [4, 5, 6].map(id => botRoster.find(b => b.id === id)).every(b => getBotAiDepth(b) === 'MEDIUM');
        const fullBots = [7, 8, 9, 10].map(id => botRoster.find(b => b.id === id)).every(b => getBotAiDepth(b) === 'FULL');
        const passed = lowBots && mediumBots && fullBots;
        results.push({
            test: 'Test AN — getBotAiDepth Tier Routing Across All Roster Bots',
            passed,
            details: { lowBots, mediumBots, fullBots }
        });
    }

    // Test AO — isFullStrategicVisitor Tier & Invariant Validation (Phase 5E.2)
    {
        const fullBotsPass = [7, 8, 9, 10].every(id => {
            const b = botRoster.find(r => r.id === id);
            return isFullStrategicVisitor({ id: 0, botId: id, name: b.name, type: 'BOT', aiDepth: b.aiDepth }) === true;
        });
        const legacyBotsPass = [1, 2, 3, 4, 5, 6].every(id => {
            const b = botRoster.find(r => r.id === id);
            return isFullStrategicVisitor({ id: 0, botId: id, name: b.name, type: 'BOT', aiDepth: b.aiDepth }) === false;
        });
        const humanShuffledPass = isFullStrategicVisitor({ id: 10, name: "Human Player", type: "HUMAN" }) === false;
        const lowBotShuffledToSeat10 = isFullStrategicVisitor({ id: 10, botId: 1, name: "Goober", type: "BOT", aiDepth: 'LOW' }) === false;

        const passed = fullBotsPass && legacyBotsPass && humanShuffledPass && lowBotShuffledToSeat10;
        results.push({
            test: 'Test AO — isFullStrategicVisitor Tier & Invariant Validation',
            passed,
            details: { fullBotsPass, legacyBotsPass, humanShuffledPass, lowBotShuffledToSeat10 }
        });
    }

    // Test AP — Data-Driven Routing Regression (Hypothetical Overrides) (Phase 5E.2a)
    {
        // Hypothetical Bot with botId: 5 (normally Robot/MEDIUM) but aiDepth: "FULL" => TRUE
        const hypotheticalFull = isFullStrategicVisitor({ id: 0, botId: 5, name: "Super Robot", type: 'BOT', aiDepth: 'FULL' });
        // Hypothetical Bot with botId: 9 (normally Twins/FULL) but aiDepth: "MEDIUM" => FALSE
        const hypotheticalMedium = isFullStrategicVisitor({ id: 1, botId: 9, name: "Nerfed Twins", type: 'BOT', aiDepth: 'MEDIUM' });
        // Hypothetical Bot with no botId but aiDepth: "FULL" => TRUE
        const depthOnlyFull = isFullStrategicVisitor({ id: 2, name: "Custom Bot", type: 'BOT', aiDepth: 'FULL' });
        // Human with aiDepth: "FULL" => strictly FALSE
        const humanFull = isFullStrategicVisitor({ id: 3, name: "Human Player", type: 'HUMAN', aiDepth: 'FULL' });

        const passed = hypotheticalFull === true && hypotheticalMedium === false && depthOnlyFull === true && humanFull === false;
        results.push({
            test: 'Test AP — Data-Driven Routing Regression (Hypothetical Overrides)',
            passed,
            details: { hypotheticalFull, hypotheticalMedium, depthOnlyFull, humanFull }
        });
    }

    // Test AQ — Stable Bot Identity Regression Tests A..D (Phase 5E.6a)
    {
        // A: { id: 10, type: "BOT" } with no botId/name/aiDepth => LOW fallback
        const testA = getBotAiDepth({ id: 10, type: "BOT" });
        // B: { id: 4, type: "BOT" } with no metadata => LOW fallback
        const testB = getBotAiDepth({ id: 4, type: "BOT" });
        // C: Shuffled Goober at seat 10 => LOW
        const testC = getBotAiDepth({ id: 10, botId: 1, aiDepth: "LOW", type: "BOT" });
        // D: Shuffled Gran Gran at seat 1 => FULL
        const testD = getBotAiDepth({ id: 1, botId: 10, aiDepth: "FULL", type: "BOT" });

        const passed = testA === "LOW" && testB === "LOW" && testC === "LOW" && testD === "FULL";
        results.push({
            test: 'Test AQ — Stable Bot Identity Regression Tests A..D (Phase 5E.6a)',
            passed,
            details: { testA, testB, testC, testD }
        });
    }

    const allPassed = results.every(r => r.passed);
    const count = results.length;
    const passedCount = results.filter(r => r.passed).length;

    console.group(`[AI KNOWLEDGE SELF-TESTS] Summary: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} (${passedCount}/${count})`);
    results.forEach(r => {
        if (r.passed) {
            console.log(`%c✔ ${r.test}`, "color: #10B981;");
        } else {
            console.error(`%c✘ ${r.test}`, "color: #EF4444;", r.details);
        }
    });
    console.groupEnd();

    return { allPassed, count, passedCount, results };
}
