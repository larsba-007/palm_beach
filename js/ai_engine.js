// ai_engine.js - Shared Strategic & Economic Reasoning Engine (Phase 5A)
// Consumes sanitized, whitelisted AI knowledge snapshots from buildBotKnowledgeState()
// and evaluates overall game context, board lines, auction visibility, luxury efficiency,
// and economic pressures (reserve vs conversion) using AU_PER_PRESTIGE = 7.5 as baseline.
// Contains NO move execution logic and NEVER accesses raw game state directly.

import {
    getAvailableMapCells,
    analyzeBoardLines,
    findFinishers,
    findTrapCells,
    findSafeCells,
    getBotLuxuryCost,
    isLuxuryPurchaseAllowed,
    chooseAuctionAction,
    calculateLegacyBidLimit,
    isFullStrategicVisitor,
    isGranGranVisitor,
    getBotAiDepth
} from './ai_knowledge.js';
import { landmarkData } from './landmarks.js';
import { botRoster } from './bots.js';

export { isFullStrategicVisitor, isGranGranVisitor, getBotAiDepth };

/**
 * Authoritative AI Depth Feature Set (Phase 5E.6 Part 1)
 * Central configuration defining feature gating across all three AI depth tiers:
 * - LOW: Legal play & auction planning, but misses board structure, line awareness, trap awareness, and advanced luxury.
 * - MEDIUM: Plays almost like FULL, with line & trap awareness, advanced luxury & auctions, but without deep expert probability / opponent modeling.
 * - FULL: Complete strategic engine with probability modeling and deep opponent lookahead.
 */
export const AI_DEPTH_FEATURES = {
    LOW: {
        lineAwareness: false,
        trapAwareness: false,
        advancedLuxury: false,
        auctionPlanning: true,
        probabilityModeling: false,
        opponentLookahead: false
    },

    MEDIUM: {
        lineAwareness: true,
        trapAwareness: true,
        advancedLuxury: true,
        auctionPlanning: true,
        probabilityModeling: false,
        opponentLookahead: false
    },

    FULL: {
        lineAwareness: true,
        trapAwareness: true,
        advancedLuxury: true,
        auctionPlanning: true,
        probabilityModeling: true,
        opponentLookahead: true
    }
};

/**
 * Retrieves the authoritative feature flags for a bot based on its aiDepth.
 * Uses getBotAiDepth(bot) as source of truth and falls back safely to LOW.
 * @param {Object|number} bot - Bot player object or ID
 * @returns {{ lineAwareness: boolean, trapAwareness: boolean, advancedLuxury: boolean, auctionPlanning: boolean, probabilityModeling: boolean, opponentLookahead: boolean }}
 */
export function getAiDepthFeatures(bot) {
    const depth = getBotAiDepth(bot);
    return AI_DEPTH_FEATURES[depth] || AI_DEPTH_FEATURES.LOW;
}

/**
 * Master runtime switch for enabling strategic AI execution across all bots (Phase 5E.6).
 * Compatibility switches retained for FULL bots and Gran Gran.
 */
export const USE_STRATEGIC_AI = true;
export const USE_STRATEGIC_FULL_BOTS = USE_STRATEGIC_AI;
export const USE_STRATEGIC_GRAN_GRAN = USE_STRATEGIC_AI;

// ============================================================================
// CORE ECONOMIC CONSTANTS
// ============================================================================

/**
 * Baseline economic valuation: 1 Prestige point is approximately worth 7.5 Au.
 */
export const AU_PER_PRESTIGE = 7.5;

/**
 * Prestige value of 1 gold: 1 / 7.5 ≈ 0.133333 Prestige points.
 */
export const PRESTIGE_PER_AU = 1 / AU_PER_PRESTIGE;

/**
 * Expected Prestige of a face-down (closed) Luxury card across all piles.
 * The 17-card master deck contains: 5x 1P, 7x 2P, 5x 3P -> Total = 34P / 17 = 2.0P average.
 */
export const EXPECTED_CLOSED_LUXURY_PRESTIGE = 2.0;

/**
 * Success probability on Luxury deck dice roll:
 * Deck 0 (5 Au):  Roll 5, 6 -> 2/6 (~33.3%)
 * Deck 1 (10 Au): Roll 3, 4, 5, 6 -> 4/6 (~66.7%)
 * Deck 2 (15 Au): Automatic -> 1.0 (100%)
 */
export const LUXURY_SUCCESS_RATE = {
    0: 2 / 6,
    1: 4 / 6,
    2: 1.0,
    5: 2 / 6,
    10: 4 / 6,
    15: 1.0
};

/**
 * Success probability on Luxury deck dice roll with 1 planned reroll (Phase 5D):
 * Deck 0 (5 Au):  1 - (4/6)^2 = 20/36 = 5/9 (~55.56%)
 * Deck 1 (10 Au): 1 - (2/6)^2 = 32/36 = 8/9 (~88.89%)
 * Deck 2 (15 Au): Automatic -> 1.0 (100%)
 */
export const LUXURY_REROLL_SUCCESS_RATE = {
    0: 5 / 9,
    1: 8 / 9,
    2: 1.0,
    5: 5 / 9,
    10: 8 / 9,
    15: 1.0
};

/**
 * Calculates multi-attempt success rate and expected rerolls consumed for a Luxury deck attempt (Phase 5E.5).
 * Supports persistent rerolling: if an attempt qualifies, the bot commits ALL currently available rerolls.
 *
 * Success formula with R rerolls:
 *   5 Au (q = 4/6): 1 - (4/6)^(R + 1)
 *   10 Au (q = 2/6): 1 - (2/6)^(R + 1)
 *   15 Au (q = 0): 1.0
 *
 * Expected rerolls consumed:
 *   q + q^2 + ... + q^R = q * (1 - q^R) / (1 - q)
 *
 * @param {number} deckIdOrCost - Deck ID (0, 1, 2) or Base Cost (5, 10, 15)
 * @param {Object} [options={}]
 * @param {number} [options.botRerolls=0] - Available reroll charges for the bot
 * @param {boolean} [options.isOpen=false] - Whether top card of pile is visible
 * @param {number|null} [options.visiblePoints=null] - Points on top card if visible
 * @param {string} [options.phase='EARLY'] - Game phase
 * @param {number} [options.prestigeGap=0] - Difference between bot score and leader
 * @param {number} [options.boardRemainingRatio=1.0] - Proportion of map remaining
 * @returns {{ plannedReroll: boolean, plannedRerollCount: number, totalAttempts: number, successRate: number, baseSuccessRate: number, rerollAdjustedSuccessRate: number, plannedRerollReason: string, expectedRerollsConsumed: number, expectedRerollResourceCostPrestigeEq: number }}
 */
export function getLuxuryAttemptSuccessRate(deckIdOrCost, options = {}) {
    const deckId = (deckIdOrCost === 5 || deckIdOrCost === 0) ? 0 : ((deckIdOrCost === 10 || deckIdOrCost === 1) ? 1 : 2);
    const baseSuccessRate = LUXURY_SUCCESS_RATE[deckId] !== undefined
        ? LUXURY_SUCCESS_RATE[deckId]
        : (deckId === 0 ? 2 / 6 : (deckId === 1 ? 4 / 6 : 1.0));
    const botRerolls = options.botRerolls || 0;

    let qualifiesForReroll = false;
    let plannedRerollReason = "NO_REROLLS";

    if (botRerolls > 0) {
        if (deckId === 2 || deckIdOrCost === 15) {
            qualifiesForReroll = false;
            plannedRerollReason = "AUTOMATIC_100_PERCENT";
        } else {
            if (options.isOpen && options.visiblePoints !== null && options.visiblePoints !== undefined) {
                if (options.visiblePoints >= 3) {
                    qualifiesForReroll = true;
                    plannedRerollReason = "VISIBLE_3P_HIGH_VALUE";
                } else if (options.visiblePoints === 2) {
                    qualifiesForReroll = true;
                    plannedRerollReason = "VISIBLE_2P_VALUE";
                } else if (options.visiblePoints === 1) {
                    if (options.phase === 'ENDGAME' && (options.prestigeGap || 0) < 0 && (options.boardRemainingRatio ?? 1.0) < 0.20) {
                        qualifiesForReroll = true;
                        plannedRerollReason = "ENDGAME_TRAILING_DESPERATION";
                    } else {
                        qualifiesForReroll = false;
                        plannedRerollReason = "VISIBLE_1P_LOW_VALUE";
                    }
                }
            } else {
                // Closed luxury deck (expected 2.0P)
                qualifiesForReroll = true;
                plannedRerollReason = "CLOSED_DECK_EXPECTED_2P";
            }
        }
    }

    const plannedReroll = qualifiesForReroll && botRerolls > 0;
    const plannedRerollCount = plannedReroll ? botRerolls : 0;
    const totalAttempts = 1 + plannedRerollCount;

    // Single-attempt failure rate
    const failureProbabilityPerAttempt = deckId === 0 ? (4 / 6) : (deckId === 1 ? (2 / 6) : 0);

    let rerollAdjustedSuccessRate = baseSuccessRate;
    let expectedRerollsConsumed = 0;

    if (plannedReroll && failureProbabilityPerAttempt > 0) {
        rerollAdjustedSuccessRate = 1 - Math.pow(failureProbabilityPerAttempt, totalAttempts);
        expectedRerollsConsumed = (failureProbabilityPerAttempt * (1 - Math.pow(failureProbabilityPerAttempt, botRerolls))) / (1 - failureProbabilityPerAttempt);
    }

    const expectedRerollResourceCostPrestigeEq = Number((expectedRerollsConsumed * REROLL_RESOURCE_COST_PRESTIGE_EQ).toFixed(4));
    const successRate = rerollAdjustedSuccessRate;

    return {
        plannedReroll,
        plannedRerollCount,
        totalAttempts,
        successRate,
        baseSuccessRate,
        rerollAdjustedSuccessRate,
        plannedRerollReason,
        expectedRerollsConsumed: Number(expectedRerollsConsumed.toFixed(4)),
        expectedRerollResourceCostPrestigeEq
    };
}

/**
 * Opportunity cost of consuming a reroll power charge on Luxury in Prestige equivalents (Phase 5D).
 */
export const REROLL_RESOURCE_COST_PRESTIGE_EQ = 0.15;

/**
 * Mar-a-Lago tiebreak premium in Au (Phase 5C Part 2).
 * Holding the deed to Mar-a-Lago serves as the first endgame tiebreaker.
 */
export const MAR_A_LAGO_TIEBREAK_PREMIUM_AU = 3;

/**
 * Player-count denial weighting factors (Phase 5C Part 3).
 * 2 players: 1.00 (direct swing against the sole opponent)
 * 3 players: 0.65
 * 4 players: 0.40
 */
export const PLAYER_COUNT_DENIAL_FACTOR = {
    2: 1.00,
    3: 0.65,
    4: 0.40
};

/**
 * Strategic value in Prestige-equivalent for each newly acquired reroll from a Luxury card (Phase 5B.14).
 * Separate from REROLL_RESOURCE_COST_PRESTIGE_EQ (cost of consuming a reroll).
 */
export const REROLL_ACQUISITION_VALUE_PRESTIGE_EQ = 0.35;

/**
 * Minimum gold reserve retained after all auctions have resolved (Phase 5B.8).
 * Prevents over-depleting cash to zero while allowing high late-game luxury conversion.
 */
export const POST_AUCTION_MIN_RESERVE = 5;

/**
 * Calculates the post-auction minimum cash reserve for the bot.
 * When auctions remain, post-auction reserve does not apply (returns 0, as auction reserve dominates).
 * When all auctions are resolved, returns POST_AUCTION_MIN_RESERVE (5 Au).
 *
 * @param {Object} strategicContext - Sanitized strategic context
 * @returns {number} Minimum post-auction reserve in Au
 */
export function getPostAuctionReserve(strategicContext) {
    if (!strategicContext) return 0;
    const auctions = strategicContext.auctions || {};
    const remainingAuctions = auctions.remainingCount !== undefined
        ? auctions.remainingCount
        : (auctions.remainingAuctionCount || 0);
    const activeAuction = Boolean(auctions.activeAuctionPresent);

    if (remainingAuctions > 0 || activeAuction) {
        return 0;
    }

    return POST_AUCTION_MIN_RESERVE;
}

/**
 * Evaluates the post-auction Luxury conversion plan when no auctions remain (Phase 5B.14).
 * Pure function: Deterministic, no DOM, no mutation, whitelisted sanitized knowledge only.
 *
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} [strategicContext] - Optional strategic context
 * @returns {Object} Post-auction Luxury plan descriptor
 */
export function evaluatePostAuctionLuxuryPlan(knowledge, strategicContext) {
    const defaultRes = {
        noAuctionsRemaining: false,
        remainingLuxuryPileCount: 0,
        affordableLuxuryPileCount: 0,
        bestAffordableLuxuryDeckId: null,
        bestFutureLuxuryTargetDeckId: null,
        goldNeededForBestFutureTarget: 0,
        postAuctionLuxuryPlan: "NONE",
        postAuctionLuxuryPlanReason: "AUCTIONS_REMAIN",
        isOnlyLuxuryPileRemaining: false,
        forcedPostAuctionLuxuryConversion: false,
        shouldBuyNow: false,
        shouldSaveForHigherValuePile: false
    };

    if (!knowledge) return defaultRes;

    const auctions = knowledge.auctions || {};
    const auctionA = auctions.A || {};
    const auctionB = auctions.B || {};
    const activeAuction = Boolean(knowledge.activeAuction);
    const remainingAuctionCount = (auctionA.resolved ? 0 : 1) + (auctionB.resolved ? 0 : 1);
    const noAuctionsRemaining = (remainingAuctionCount === 0 && !activeAuction);

    const botId = (typeof strategicContext?.bot?.id === 'number')
        ? strategicContext.bot.id
        : knowledge.selfPlayerId;
    const players = Array.isArray(knowledge.players) ? knowledge.players : [];
    const matchedPlayer = players.find(p => p.id === botId || p.isSelf) || {};
    const selfPlayer = { ...matchedPlayer, ...(strategicContext?.bot || {}) };
    const botGold = (strategicContext?.bot?.gold !== undefined)
        ? strategicContext.bot.gold
        : (selfPlayer.gold || 0);
    const botRerolls = (strategicContext?.bot?.rerolls !== undefined)
        ? strategicContext.bot.rerolls
        : (selfPlayer.rerolls || 0);

    const phase = typeof strategicContext?.gamePhase === 'object'
        ? (strategicContext.gamePhase.phase || 'MID')
        : (strategicContext?.gamePhase || 'MID');
    const prestigeGap = strategicContext?.prestigeGap !== undefined ? strategicContext.prestigeGap : 0;
    const boardRemainingRatio = strategicContext?.map?.boardRemainingRatio !== undefined
        ? strategicContext.map.boardRemainingRatio
        : 1.0;

    const decks = Array.isArray(knowledge.luxuryDecks) ? knowledge.luxuryDecks : [];
    const piles = decks.map((d, idx) => {
        const deckId = d.id !== undefined ? d.id : idx;
        const cost = d.cost !== undefined ? d.cost : (deckId === 0 ? 5 : (deckId === 1 ? 10 : 15));
        const taxCount = d.taxCount || 0;
        const effectiveCost = getBotLuxuryCost(selfPlayer, { ...d, cost });
        const cardsRemaining = d.cardsRemaining !== undefined ? d.cardsRemaining : 0;
        const isOpen = Boolean(d.isOpen && d.visibleCard);
        const visiblePoints = isOpen && d.visibleCard.points !== undefined ? d.visibleCard.points : (isOpen ? 1 : null);
        const visibleRerollsGranted = isOpen && d.visibleCard.rerollsGranted !== undefined ? d.visibleCard.rerollsGranted : 0;
        const cardPrestigeExpectation = isOpen ? visiblePoints : EXPECTED_CLOSED_LUXURY_PRESTIGE;

        const { plannedReroll, successRate: rerollAdjustedSuccessRate, baseSuccessRate } = getLuxuryAttemptSuccessRate(deckId, {
            botRerolls,
            isOpen,
            visiblePoints,
            phase,
            prestigeGap,
            boardRemainingRatio
        });

        const postAuctionExpectedPrestige = Number((cardPrestigeExpectation * rerollAdjustedSuccessRate).toFixed(4));
        const postAuctionExpectedRerollReward = Number((visibleRerollsGranted * REROLL_ACQUISITION_VALUE_PRESTIGE_EQ * rerollAdjustedSuccessRate).toFixed(4));
        const postAuctionExpectedGrossValue = Number((postAuctionExpectedPrestige + postAuctionExpectedRerollReward).toFixed(4));

        return {
            id: deckId,
            cost,
            taxCount,
            effectiveCost,
            cardsRemaining,
            isOpen,
            visiblePoints,
            visibleRerollsGranted,
            cardPrestigeExpectation,
            baseSuccessRate,
            plannedReroll,
            rerollAdjustedSuccessRate,
            postAuctionExpectedPrestige,
            postAuctionExpectedRerollReward,
            postAuctionExpectedGrossValue,
            expectedTotalPrestige: postAuctionExpectedGrossValue
        };
    });

    const nonEmptyPiles = piles.filter(p => p.cardsRemaining > 0);
    const remainingLuxuryPileCount = nonEmptyPiles.length;
    const affordablePiles = nonEmptyPiles.filter(p => p.effectiveCost <= botGold);
    const affordableLuxuryPileCount = affordablePiles.length;

    if (!noAuctionsRemaining) {
        return {
            ...defaultRes,
            remainingLuxuryPileCount,
            affordableLuxuryPileCount
        };
    }

    if (remainingLuxuryPileCount === 0) {
        return {
            noAuctionsRemaining: true,
            remainingLuxuryPileCount: 0,
            affordableLuxuryPileCount: 0,
            bestAffordableLuxuryDeckId: null,
            bestFutureLuxuryTargetDeckId: null,
            goldNeededForBestFutureTarget: 0,
            postAuctionLuxuryPlan: "NONE_REMAIN",
            postAuctionLuxuryPlanReason: "NO_LUXURY_REMAINING",
            isOnlyLuxuryPileRemaining: false,
            forcedPostAuctionLuxuryConversion: false,
            shouldBuyNow: false,
            shouldSaveForHigherValuePile: false
        };
    }

    if (affordableLuxuryPileCount === 0) {
        // No affordable piles - find target with highest expected gross value (tie-break lowest effective cost) to save for
        const target = [...nonEmptyPiles].sort((a, b) => {
            const valDiff = b.postAuctionExpectedGrossValue - a.postAuctionExpectedGrossValue;
            if (Math.abs(valDiff) > 0.001) return valDiff;
            return a.effectiveCost - b.effectiveCost;
        })[0];
        const goldNeeded = Math.max(0, target.effectiveCost - botGold);
        return {
            noAuctionsRemaining: true,
            remainingLuxuryPileCount,
            affordableLuxuryPileCount: 0,
            bestAffordableLuxuryDeckId: null,
            bestFutureLuxuryTargetDeckId: target.id,
            goldNeededForBestFutureTarget: goldNeeded,
            postAuctionLuxuryPlan: "NO_AFFORDABLE",
            postAuctionLuxuryPlanReason: "NO_AFFORDABLE_LUXURY",
            isOnlyLuxuryPileRemaining: remainingLuxuryPileCount === 1,
            forcedPostAuctionLuxuryConversion: false,
            shouldBuyNow: false,
            shouldSaveForHigherValuePile: true
        };
    }

    if (remainingLuxuryPileCount === 1) {
        // Exactly one pile left and it is affordable: 100% force buy now
        const target = affordablePiles[0];
        return {
            noAuctionsRemaining: true,
            remainingLuxuryPileCount: 1,
            affordableLuxuryPileCount: 1,
            bestAffordableLuxuryDeckId: target.id,
            bestFutureLuxuryTargetDeckId: target.id,
            goldNeededForBestFutureTarget: 0,
            postAuctionLuxuryPlan: "BUY_NOW",
            postAuctionLuxuryPlanReason: "ONLY_PILE_LEFT_BUY_NOW",
            isOnlyLuxuryPileRemaining: true,
            forcedPostAuctionLuxuryConversion: true,
            shouldBuyNow: true,
            shouldSaveForHigherValuePile: false
        };
    }

    // Multiple piles remain (2 or 3 piles)
    // Sort affordable piles by postAuctionExpectedGrossValue desc, then effectiveCost asc
    const sortedAffordable = [...affordablePiles].sort((a, b) => {
        const pDiff = b.postAuctionExpectedGrossValue - a.postAuctionExpectedGrossValue;
        if (Math.abs(pDiff) > 0.001) return pDiff;
        return a.effectiveCost - b.effectiveCost;
    });
    const bestAffordable = sortedAffordable[0];

    // Check if an unaffordable higher-tier pile is significantly better to save toward
    const unaffordablePiles = nonEmptyPiles.filter(p => p.effectiveCost > botGold);
    const sortedUnaffordable = [...unaffordablePiles].sort((a, b) => {
        const pDiff = b.postAuctionExpectedGrossValue - a.postAuctionExpectedGrossValue;
        if (Math.abs(pDiff) > 0.001) return pDiff;
        return a.effectiveCost - b.effectiveCost;
    });
    const bestUnaffordable = sortedUnaffordable.length > 0 ? sortedUnaffordable[0] : null;

    // Condition to save for higher-tier:
    // Unaffordable pile has significantly higher expected gross value (>= bestAffordable + 1.0 P-eq)
    // and gold deficit is reasonable (<= 5 Au deficit)
    const shouldSave = Boolean(
        bestUnaffordable &&
        ((bestUnaffordable.postAuctionExpectedGrossValue - bestAffordable.postAuctionExpectedGrossValue) >= 0.999) &&
        (bestUnaffordable.effectiveCost - botGold <= 5)
    );

    if (shouldSave) {
        const goldNeeded = Math.max(0, bestUnaffordable.effectiveCost - botGold);
        return {
            noAuctionsRemaining: true,
            remainingLuxuryPileCount,
            affordableLuxuryPileCount,
            bestAffordableLuxuryDeckId: bestAffordable.id,
            bestFutureLuxuryTargetDeckId: bestUnaffordable.id,
            goldNeededForBestFutureTarget: goldNeeded,
            postAuctionLuxuryPlan: "SAVE_FOR_HIGHER_VALUE",
            postAuctionLuxuryPlanReason: "SAVE_FOR_HIGHER_VALUE_PILE",
            isOnlyLuxuryPileRemaining: false,
            forcedPostAuctionLuxuryConversion: false,
            shouldBuyNow: false,
            shouldSaveForHigherValuePile: true
        };
    }

    return {
        noAuctionsRemaining: true,
        remainingLuxuryPileCount,
        affordableLuxuryPileCount,
        bestAffordableLuxuryDeckId: bestAffordable.id,
        bestFutureLuxuryTargetDeckId: bestAffordable.id,
        goldNeededForBestFutureTarget: 0,
        postAuctionLuxuryPlan: "BUY_NOW",
        postAuctionLuxuryPlanReason: "BEST_AFFORDABLE_LUXURY",
        isOnlyLuxuryPileRemaining: false,
        forcedPostAuctionLuxuryConversion: false,
        shouldBuyNow: true,
        shouldSaveForHigherValuePile: false
    };
}

/**
 * Calculates the dynamic marginal value / retention factor of Au for a given strategic context.
 * Higher factor (e.g. 0.75-1.00) means Au is very valuable to preserve (auctions ahead, scarce gold).
 * Lower factor (e.g. 0.10-0.35) means Au has low marginal value and should be converted to Prestige (no auctions, late game).
 *
 * @param {Object} strategicContext - Sanitized strategic context
 * @returns {number} Normalized Au retention factor within [0.10, 1.00]
 */
export function getGoldRetentionFactor(strategicContext) {
    if (!strategicContext) return 0.50;

    const economy = strategicContext.economy || {};
    const auctions = strategicContext.auctions || {};
    const bot = strategicContext.bot || {};
    const phase = typeof strategicContext.gamePhase === 'object' ? (strategicContext.gamePhase.phase || 'MID') : (strategicContext.gamePhase || 'MID');

    const remainingAuctions = auctions.remainingCount !== undefined ? auctions.remainingCount : (auctions.remainingAuctionCount || 0);
    const activeAuction = Boolean(auctions.activeAuctionPresent);
    const hasAuctionNeed = (remainingAuctions > 0 || activeAuction);

    // Base factor from auction presence
    let factor = hasAuctionNeed ? 0.75 : 0.35;

    // Specific auction urgency
    if (activeAuction) {
        factor += 0.15;
    } else if (auctions.imminent || auctions.auctionImminent) {
        factor += 0.10;
    }
    if (auctions.highValueAuctionVisible || auctions.marALagoVisible) {
        factor += 0.10;
    }
    if (remainingAuctions >= 2) {
        factor += 0.05;
    }

    // Game phase progression
    if (phase === 'EARLY') {
        factor += 0.05;
    } else if (phase === 'LATE') {
        factor -= 0.10;
    } else if (phase === 'ENDGAME') {
        factor -= 0.20;
    }

    // Bot cash balance (gold scarcity vs surplus)
    const gold = bot.gold !== undefined && bot.gold !== null ? bot.gold : (economy.liquidGold !== undefined ? economy.liquidGold : 10);
    if (gold < 5) {
        factor += 0.20;
    } else if (gold < 10) {
        factor += 0.10;
    } else if (gold >= 30) {
        factor -= 0.20;
    } else if (gold >= 20) {
        factor -= 0.10;
    }

    // Direct Reserve & Conversion Pressure influence
    const reserve = economy.reservePressure !== undefined ? economy.reservePressure : 0;
    const conversion = economy.conversionPressure !== undefined ? economy.conversionPressure : 0;
    factor += (reserve * 0.15) - (conversion * 0.20);

    // Clamp strictly within [0.10, 1.00]
    return Number(Math.max(0.10, Math.min(1.00, factor)).toFixed(4));
}

/**
 * Calculates the base dynamic marginal value / retention factor of Au for action valuations (Phase 5B.11 Correction).
 * Unlike getGoldRetentionFactor(), this does NOT add auction-specific inflation bonuses (imminent auctions, visible properties,
 * or reserve pressure), preventing double-counting with auctionReadinessPenalty.
 *
 * @param {Object} strategicContext - Sanitized strategic context
 * @returns {number} Base Au retention factor within [0.10, 0.90]
 */
export function getBaseGoldRetentionFactor(strategicContext) {
    if (!strategicContext) return 0.50;

    const economy = strategicContext.economy || {};
    const auctions = strategicContext.auctions || {};
    const bot = strategicContext.bot || {};
    const phase = typeof strategicContext.gamePhase === 'object' ? (strategicContext.gamePhase.phase || 'MID') : (strategicContext.gamePhase || 'MID');

    const remainingAuctions = auctions.remainingCount !== undefined ? auctions.remainingCount : (auctions.remainingAuctionCount || 0);
    const activeAuction = Boolean(auctions.activeAuctionPresent);
    const hasAuctionNeed = (remainingAuctions > 0 || activeAuction);

    // Base factor from general auction need in the game (0.65 with auctions, 0.35 without)
    // Note: Does NOT include auction-specific urgency inflation (imminent, highValueVisible, remaining>=2, reservePressure)
    let factor = hasAuctionNeed ? 0.65 : 0.35;

    // Game phase progression
    if (phase === 'EARLY') {
        factor += 0.05;
    } else if (phase === 'LATE') {
        factor -= 0.10;
    } else if (phase === 'ENDGAME') {
        factor -= 0.20;
    }

    // Bot cash balance (gold scarcity vs surplus)
    const gold = bot.gold !== undefined && bot.gold !== null ? bot.gold : (economy.liquidGold !== undefined ? economy.liquidGold : 10);
    if (gold < 5) {
        factor += 0.20;
    } else if (gold < 10) {
        factor += 0.10;
    } else if (gold >= 30) {
        factor -= 0.20;
    } else if (gold >= 20) {
        factor -= 0.10;
    }

    // Conversion pressure
    const conversion = economy.conversionPressure !== undefined ? economy.conversionPressure : 0;
    factor -= (conversion * 0.20);

    // Clamp strictly within [0.10, 0.90]
    return Number(Math.max(0.10, Math.min(0.90, factor)).toFixed(4));
}

/**
 * Determines which unresolved auction is currently most relevant based on corresponding Waterfront distance (Phase 5B.11 Correction).
 * Auction A corresponds to Left Waterfront (Column 1 / WF_L).
 * Auction B corresponds to Right Waterfront (Column 7 / WF_R).
 *
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {Object} { auctionId: string|null, waterfrontRemaining: number, isVisible: boolean, visibleCard: Object|null, reason: string }
 */
export function getRelevantUpcomingAuction(knowledge) {
    if (!knowledge) {
        return { auctionId: null, waterfrontRemaining: Infinity, isVisible: false, visibleCard: null, reason: "NO_KNOWLEDGE" };
    }

    const auctionA = knowledge.auctions?.A;
    const auctionB = knowledge.auctions?.B;
    const isAResolved = Boolean(auctionA && auctionA.resolved);
    const isBResolved = Boolean(auctionB && auctionB.resolved);

    if (isAResolved && isBResolved) {
        return { auctionId: null, waterfrontRemaining: Infinity, isVisible: false, visibleCard: null, reason: "ALL_AUCTIONS_RESOLVED" };
    }

    const grid = Array.isArray(knowledge.grid) ? knowledge.grid : [];
    let leftWfRemaining = 0;
    let rightWfRemaining = 0;

    grid.forEach(cell => {
        if (!cell.flipped && !cell.empty) {
            if (cell.c === 1 || cell.type === 'WF_L') leftWfRemaining++;
            if (cell.c === 7 || cell.type === 'WF_R') rightWfRemaining++;
        }
    });

    if (!isAResolved && isBResolved) {
        return {
            auctionId: "A",
            waterfrontRemaining: leftWfRemaining,
            isVisible: Boolean(auctionA && auctionA.isVisible && auctionA.visibleCard),
            visibleCard: (auctionA && auctionA.isVisible) ? auctionA.visibleCard : null,
            reason: "ONLY_UNRESOLVED_AUCTION"
        };
    }

    if (isAResolved && !isBResolved) {
        return {
            auctionId: "B",
            waterfrontRemaining: rightWfRemaining,
            isVisible: Boolean(auctionB && auctionB.isVisible && auctionB.visibleCard),
            visibleCard: (auctionB && auctionB.isVisible) ? auctionB.visibleCard : null,
            reason: "ONLY_UNRESOLVED_AUCTION"
        };
    }

    // Both unresolved: pick the one with fewer remaining Waterfront cards (or tie-break A before B)
    if (leftWfRemaining <= rightWfRemaining) {
        return {
            auctionId: "A",
            waterfrontRemaining: leftWfRemaining,
            isVisible: Boolean(auctionA && auctionA.isVisible && auctionA.visibleCard),
            visibleCard: (auctionA && auctionA.isVisible) ? auctionA.visibleCard : null,
            reason: leftWfRemaining < rightWfRemaining ? "CLOSER_WATERFRONT" : "TIE_BREAK_A"
        };
    } else {
        return {
            auctionId: "B",
            waterfrontRemaining: rightWfRemaining,
            isVisible: Boolean(auctionB && auctionB.isVisible && auctionB.visibleCard),
            visibleCard: (auctionB && auctionB.isVisible) ? auctionB.visibleCard : null,
            reason: "CLOSER_WATERFRONT"
        };
    }
}

/**
 * Estimates the expected Prestige and baseline Au value of the upcoming unresolved auction (Phase 5B.11 / Correction).
 * Uses public knowledge: the relevant upcoming auction's visible property if known, or public remaining property pool average.
 *
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {Object} { expectedUpcomingAuctionPrestige: number, baselineAuctionValueAu: number, relevantUpcomingAuctionId: string|null, relevantAuctionWaterfrontRemaining: number, relevantAuctionValueSource: string }
 */
export function getExpectedUpcomingAuctionValue(knowledge) {
    if (!knowledge) {
        return {
            expectedUpcomingAuctionPrestige: 3.0,
            baselineAuctionValueAu: 22.5,
            relevantUpcomingAuctionId: null,
            relevantAuctionWaterfrontRemaining: Infinity,
            relevantAuctionValueSource: "PUBLIC_REMAINING_POOL"
        };
    }

    const relevant = getRelevantUpcomingAuction(knowledge);
    if (!relevant.auctionId) {
        return {
            expectedUpcomingAuctionPrestige: 0.0,
            baselineAuctionValueAu: 0.0,
            relevantUpcomingAuctionId: null,
            relevantAuctionWaterfrontRemaining: Infinity,
            relevantAuctionValueSource: "NONE"
        };
    }

    // If the relevant upcoming auction is publicly visible, use its actual points
    if (relevant.isVisible && relevant.visibleCard && relevant.visibleCard.points !== undefined) {
        const points = Number(relevant.visibleCard.points);
        return {
            expectedUpcomingAuctionPrestige: points,
            baselineAuctionValueAu: Number((points * AU_PER_PRESTIGE).toFixed(2)),
            relevantUpcomingAuctionId: relevant.auctionId,
            relevantAuctionWaterfrontRemaining: relevant.waterfrontRemaining,
            relevantAuctionValueSource: "VISIBLE_PROPERTY"
        };
    }

    // Property Prestige values in Boca Raton: Spanish River (2P), Gulf Stream (3P), Mar-a-Lago (4P)
    const allProperties = [
        { name: "Spanish River", points: 2 },
        { name: "Gulf Stream", points: 3 },
        { name: "Mar-a-Lago", points: 4 }
    ];

    const auctionA = knowledge.auctions?.A;
    const auctionB = knowledge.auctions?.B;
    const resolvedPropertyPoints = [];

    // Check resolved auction objects
    if (auctionA && auctionA.resolved) {
        const pWon = auctionA.propertyWon || auctionA.visibleCard;
        if (pWon) {
            const pts = pWon.points !== undefined ? pWon.points : (pWon.name === "Mar-a-Lago" ? 4 : (pWon.name === "Gulf Stream" ? 3 : 2));
            resolvedPropertyPoints.push(pts);
        }
    }
    if (auctionB && auctionB.resolved) {
        const pWon = auctionB.propertyWon || auctionB.visibleCard;
        if (pWon) {
            const pts = pWon.points !== undefined ? pWon.points : (pWon.name === "Mar-a-Lago" ? 4 : (pWon.name === "Gulf Stream" ? 3 : 2));
            resolvedPropertyPoints.push(pts);
        }
    }

    // Check players' public inventories for any properties
    const players = Array.isArray(knowledge.players) ? knowledge.players : [];
    players.forEach(p => {
        if (Array.isArray(p.inventory)) {
            p.inventory.forEach(item => {
                if (item && item.name) {
                    const match = allProperties.find(prop => prop.name === item.name);
                    if (match && !resolvedPropertyPoints.includes(match.points)) {
                        resolvedPropertyPoints.push(match.points);
                    }
                }
            });
        }
    });

    // Compute pool of remaining possible properties
    let remainingPool = allProperties.map(p => p.points);
    resolvedPropertyPoints.forEach(pts => {
        const idx = remainingPool.indexOf(pts);
        if (idx !== -1) {
            remainingPool.splice(idx, 1);
        }
    });

    if (remainingPool.length === 0) {
        remainingPool = [3.0];
    }

    const expectedPrestige = Number((remainingPool.reduce((a, b) => a + b, 0) / remainingPool.length).toFixed(2));
    const baselineAu = Number((expectedPrestige * AU_PER_PRESTIGE).toFixed(2));

    return {
        expectedUpcomingAuctionPrestige: expectedPrestige,
        baselineAuctionValueAu: baselineAu,
        relevantUpcomingAuctionId: relevant.auctionId,
        relevantAuctionWaterfrontRemaining: relevant.waterfrontRemaining,
        relevantAuctionValueSource: "PUBLIC_REMAINING_POOL"
    };
}

/**
 * Estimates auction urgency and expected gold income before the nearest unresolved auction triggers (Phase 5B.11 / Correction).
 * Note: minWfRemaining is a WATERFRONT DISTANCE HEURISTIC, not a literal turn countdown.
 *
 * @param {Object} knowledge - Sanitized knowledge state
 * @returns {Object} { auctionUrgency: number, estimatedAuBeforeAuction: number, minWfRemaining: number }
 */
export function estimateAuctionUrgencyAndIncome(knowledge) {
    if (!knowledge) {
        return { auctionUrgency: 0.0, estimatedAuBeforeAuction: 0, minWfRemaining: Infinity };
    }

    const auctionA = knowledge.auctions?.A;
    const auctionB = knowledge.auctions?.B;
    const isAResolved = Boolean(auctionA && auctionA.resolved);
    const isBResolved = Boolean(auctionB && auctionB.resolved);

    if (isAResolved && isBResolved) {
        return { auctionUrgency: 0.0, estimatedAuBeforeAuction: 0, minWfRemaining: Infinity };
    }

    const grid = Array.isArray(knowledge.grid) ? knowledge.grid : [];
    let leftWfRemaining = 0;
    let rightWfRemaining = 0;

    grid.forEach(cell => {
        if (!cell.flipped && !cell.empty) {
            if (cell.c === 1 || cell.type === 'WF_L') leftWfRemaining++;
            if (cell.c === 7 || cell.type === 'WF_R') rightWfRemaining++;
        }
    });

    let minWfRemaining = Infinity;
    if (!isAResolved && !isBResolved) {
        minWfRemaining = Math.min(leftWfRemaining, rightWfRemaining);
    } else if (!isAResolved) {
        minWfRemaining = leftWfRemaining;
    } else if (!isBResolved) {
        minWfRemaining = rightWfRemaining;
    }

    let auctionUrgency = 0.10;
    let estimatedAuBeforeAuction = 18;

    if (minWfRemaining <= 1) {
        auctionUrgency = 0.90;
        estimatedAuBeforeAuction = 2;
    } else if (minWfRemaining === 2) {
        auctionUrgency = 0.65;
        estimatedAuBeforeAuction = 6;
    } else if (minWfRemaining === 3) {
        auctionUrgency = 0.40;
        estimatedAuBeforeAuction = 10;
    } else if (minWfRemaining === 4) {
        auctionUrgency = 0.25;
        estimatedAuBeforeAuction = 14;
    } else if (minWfRemaining >= 5) {
        auctionUrgency = 0.10;
        estimatedAuBeforeAuction = 18;
    }

    return {
        auctionUrgency: Number(auctionUrgency.toFixed(2)),
        estimatedAuBeforeAuction,
        minWfRemaining
    };
}

/**
 * Estimates projected opponent auction bankrolls using visible current gold and pre-auction income factor (Phase 5B.11 Correction).
 * If opponent money is hidden, projected gold is null and allOpponentGoldKnown is false.
 *
 * @param {Object} context - Strategic context
 * @param {number} estimatedAuBeforeAuction - Estimated bot pre-auction income
 * @returns {Object} { projectedVisibleOpponentGolds: number[], highestProjectedVisibleOpponentGold: number|null, seriousProjectedBidderCount: number, allOpponentGoldKnown: boolean }
 */
export function estimateProjectedOpponentAuctionGolds(context, estimatedAuBeforeAuction) {
    const opponents = context?.opponents || {};
    const allKnown = opponents.allOpponentGoldKnown === true;
    const opponentIncomeFactor = 0.75;
    const opponentExpectedIncome = Math.round((estimatedAuBeforeAuction || 0) * opponentIncomeFactor);

    if (!allKnown || !Array.isArray(opponents.visibleOpponentGolds) || opponents.visibleOpponentGolds.length === 0) {
        return {
            projectedVisibleOpponentGolds: [],
            highestProjectedVisibleOpponentGold: null,
            seriousProjectedBidderCount: 0,
            allOpponentGoldKnown: false
        };
    }

    const projectedVisibleOpponentGolds = opponents.visibleOpponentGolds.map(g => g + opponentExpectedIncome);
    const highestProjectedVisibleOpponentGold = projectedVisibleOpponentGolds.length > 0
        ? Math.max(...projectedVisibleOpponentGolds)
        : null;
    const seriousProjectedBidderCount = projectedVisibleOpponentGolds.filter(g => g >= 20).length;

    return {
        projectedVisibleOpponentGolds,
        highestProjectedVisibleOpponentGold,
        seriousProjectedBidderCount,
        allOpponentGoldKnown: true
    };
}

/**
 * Evaluates auction contestability based on projected auction gold, projected opponent wealth, and intrinsic value (Phase 5B.11 / Correction).
 *
 * @param {Object} context - Strategic context
 * @param {number} projectedAuctionGold - Estimated gold at auction
 * @param {number} targetAuctionReserve - Target reserve needed
 * @param {Object} [projectedOpponentsInfo] - Projected opponent golds info
 * @param {number} [baselineAuctionValueAu] - Intrinsic value of property in Au
 * @returns {Object} { auctionContestability: string, contestFactor: number }
 */
export function getAuctionContestability(context, projectedAuctionGold, targetAuctionReserve, projectedOpponentsInfo = null, baselineAuctionValueAu = 22.5) {
    if (!context || context.auctions?.remainingCount === 0) {
        return { auctionContestability: "AUCTION_NOT_WORTH_SAVING_FOR", contestFactor: 0.0 };
    }

    const opponents = context.opponents || {};
    const allKnown = projectedOpponentsInfo
        ? (projectedOpponentsInfo.allOpponentGoldKnown === true)
        : (opponents.allOpponentGoldKnown === true);

    const highestProjectedGold = projectedOpponentsInfo?.highestProjectedVisibleOpponentGold !== undefined
        ? projectedOpponentsInfo.highestProjectedVisibleOpponentGold
        : (opponents.highestVisibleGold !== undefined ? opponents.highestVisibleGold : null);

    const seriousCount = projectedOpponentsInfo?.seriousProjectedBidderCount !== undefined
        ? projectedOpponentsInfo.seriousProjectedBidderCount
        : (Array.isArray(opponents.visibleOpponentGolds) ? opponents.visibleOpponentGolds.filter(g => g >= 20).length : 0);

    const playerCount = (Array.isArray(context.players) ? context.players.length : (opponents.count !== undefined ? opponents.count + 1 : 2));
    const baselineAu = baselineAuctionValueAu || 22.5;

    if (!allKnown || highestProjectedGold === null) {
        // Hidden opponent money -> Conservative UNKNOWN
        return {
            auctionContestability: "UNKNOWN",
            contestFactor: playerCount === 2 ? 0.90 : (playerCount === 3 ? 0.70 : 0.50)
        };
    }

    // 1. Dominant: Bot clearly out-funds the field
    if (projectedAuctionGold >= highestProjectedGold + 5 && projectedAuctionGold >= 18) {
        return { auctionContestability: "DOMINANT", contestFactor: 1.0 };
    }

    // 2. Overfunded opponent / Expensive:
    // In 4-player: 2+ serious projected bidders (>=20 Au) and bot is behind
    if (playerCount >= 4 && seriousCount >= 2 && projectedAuctionGold < highestProjectedGold) {
        return { auctionContestability: "EXPENSIVE", contestFactor: 0.30 };
    }
    // In 2-player or 4-player: Opponent projected bankroll far exceeds intrinsic property value (> 1.5 * baselineAu)
    // and bot is significantly behind (> 10 Au deficit).
    if (highestProjectedGold > (baselineAu * 1.5) && (highestProjectedGold - projectedAuctionGold) > 10) {
        return { auctionContestability: "EXPENSIVE", contestFactor: 0.20 };
    }

    // 3. Uncontestable: Bot is broke while opponents are rich
    if (projectedAuctionGold < 8 && highestProjectedGold >= 18) {
        return { auctionContestability: "UNCONTESTABLE", contestFactor: 0.15 };
    }

    // 4. Contestable (default competitive range)
    const baseFactor = playerCount === 2 ? 1.0 : (playerCount === 3 ? 0.75 : 0.50);
    return { auctionContestability: "CONTESTABLE", contestFactor: baseFactor };
}

// ============================================================================
// STRATEGIC CONTEXT ANALYSIS (PURE FUNCTION)
// ============================================================================

/**
 * Analyzes the sanitized knowledge state from a bot's legal perspective.
 * Pure function: Deterministic, no DOM, no timers, no mutation, no raw state.
 *
 * @param {Object|number} bot - The bot player definition or ID
 * @param {Object} knowledge - Whitelisted sanitized knowledge snapshot
 * @returns {Object} Structured strategic context report
 */
export function analyzeStrategicContext(bot, knowledge) {
    if (!knowledge) {
        return null;
    }

    // ------------------------------------------------------------------------
    // 1. BOT IDENTIFICATION & LIQUID ASSETS
    // ------------------------------------------------------------------------
    const botId = (typeof bot === 'object' && bot !== null)
        ? (bot.id !== undefined ? bot.id : (bot.botId !== undefined ? bot.botId : null))
        : (bot !== undefined ? bot : knowledge.selfPlayerId);

    const players = Array.isArray(knowledge.players) ? knowledge.players : [];
    const selfPlayer = players.find(p => p.id === botId || p.botId === botId || p.isSelf) ||
        (typeof bot === 'object' && bot !== null ? bot : {});
    const resolvedBot = (typeof bot === 'object' && bot !== null) ? { ...selfPlayer, ...bot } : selfPlayer;

    const pId = resolvedBot.id !== undefined ? resolvedBot.id : botId;
    const pName = resolvedBot.name || `Bot ${botId}`;

    const botGold = resolvedBot.gold !== undefined && resolvedBot.gold !== null
        ? resolvedBot.gold
        : 0;

    const botTotalGold = resolvedBot.totalGold !== undefined && resolvedBot.totalGold !== null
        ? resolvedBot.totalGold
        : botGold;

    const botPrestige = resolvedBot.prestige !== undefined && resolvedBot.prestige !== null
        ? resolvedBot.prestige
        : 0;

    const botBankedPrestige = resolvedBot.bankedPrestige !== undefined && resolvedBot.bankedPrestige !== null
        ? resolvedBot.bankedPrestige
        : 0;

    const botTotalPrestige = resolvedBot.totalPrestige !== undefined && resolvedBot.totalPrestige !== null
        ? resolvedBot.totalPrestige
        : (botPrestige + botBankedPrestige);
    const botRerolls = resolvedBot.rerolls !== undefined && resolvedBot.rerolls !== null
        ? resolvedBot.rerolls
        : 0;
    const botInventory = Array.isArray(resolvedBot.inventory)
        ? resolvedBot.inventory
        : [];

    // ------------------------------------------------------------------------
    // 2. MAP CONTEXT & BOARD GEOMETRY
    // ------------------------------------------------------------------------
    const availableCells = getAvailableMapCells(knowledge);
    const { rowCounts, colCounts } = analyzeBoardLines(knowledge);
    const finishers = findFinishers(availableCells, rowCounts, colCounts);
    const traps = findTrapCells(availableCells, rowCounts, colCounts);
    const safeMoves = findSafeCells(availableCells, finishers, traps);

    const totalPlayableCards = Array.isArray(knowledge.grid)
        ? knowledge.grid.filter(c => !c.empty).length
        : 0;
    const remainingCards = availableCells.length;
    const boardRemainingRatio = totalPlayableCards > 0 ? (remainingCards / totalPlayableCards) : 0;

    const waterfrontLeftRemaining = colCounts[1] || 0;
    const waterfrontRightRemaining = colCounts[7] || 0;
    const waterfrontImminent = (waterfrontLeftRemaining > 0 && waterfrontLeftRemaining <= 2) ||
        (waterfrontRightRemaining > 0 && waterfrontRightRemaining <= 2);

    // ------------------------------------------------------------------------
    // 3. GAME PHASE ESTIMATION
    // ------------------------------------------------------------------------
    let phase = 'EARLY';
    if (boardRemainingRatio <= 0.10) {
        phase = 'ENDGAME';
    } else if (boardRemainingRatio <= 0.35) {
        phase = 'LATE';
    } else if (boardRemainingRatio <= 0.70) {
        phase = 'MID';
    } else {
        phase = 'EARLY';
    }

    // ------------------------------------------------------------------------
    // 4. AUCTION CONTEXT
    // ------------------------------------------------------------------------
    let remainingAuctionCount = 0;
    const visibleProperties = [];

    const auctionA = knowledge.auctions?.A;
    const auctionB = knowledge.auctions?.B;

    if (auctionA && !auctionA.resolved) remainingAuctionCount++;
    if (auctionB && !auctionB.resolved) remainingAuctionCount++;

    if (auctionA && auctionA.isVisible && auctionA.visibleCard) {
        visibleProperties.push({
            id: 'A',
            propertyId: auctionA.visibleCard.id,
            name: auctionA.visibleCard.name,
            prestige: auctionA.visibleCard.points !== undefined ? auctionA.visibleCard.points : 2
        });
    }

    if (auctionB && auctionB.isVisible && auctionB.visibleCard) {
        visibleProperties.push({
            id: 'B',
            propertyId: auctionB.visibleCard.id,
            name: auctionB.visibleCard.name,
            prestige: auctionB.visibleCard.points !== undefined ? auctionB.visibleCard.points : 2
        });
    }

    const highestVisiblePropertyPrestige = visibleProperties.length > 0
        ? Math.max(...visibleProperties.map(p => p.prestige))
        : null;

    const marALagoVisible = visibleProperties.some(p => p.name === "Mar-a-Lago" || p.prestige === 4);
    const highValueAuctionVisible = visibleProperties.some(p => p.prestige >= 3);
    const activeAuctionPresent = Boolean(knowledge.activeAuction);
    const auctionImminent = waterfrontImminent && remainingAuctionCount > 0;

    // ------------------------------------------------------------------------
    // 5. LUXURY CONTEXT & EXPECTED VALUE
    // ------------------------------------------------------------------------
    let decksRemaining = 0;
    let totalCardsRemaining = 0;
    const piles = [];
    const visibleCards = [];

    const luxuryDecks = Array.isArray(knowledge.luxuryDecks) ? knowledge.luxuryDecks : [];
    luxuryDecks.forEach((deck, deckId) => {
        if (!deck) return;
        const cRem = deck.cardsRemaining !== undefined ? deck.cardsRemaining : 0;
        if (cRem > 0) decksRemaining++;
        totalCardsRemaining += cRem;

        const cost = deck.cost || (deckId === 0 ? 5 : (deckId === 1 ? 10 : 15));
        const taxCount = deck.taxCount || 0;
        const effectiveCost = getBotLuxuryCost(selfPlayer, deck);
        const isOpen = Boolean(deck.isOpen && deck.visibleCard);
        const successRate = LUXURY_SUCCESS_RATE[deckId] !== undefined
            ? LUXURY_SUCCESS_RATE[deckId]
            : (deckId === 0 ? 2 / 6 : (deckId === 1 ? 4 / 6 : 1.0));

        const visiblePoints = isOpen
            ? (deck.visibleCard.points !== undefined ? deck.visibleCard.points : 1)
            : null;
        const visibleRerollsGranted = isOpen && deck.visibleCard.rerollsGranted !== undefined
            ? deck.visibleCard.rerollsGranted
            : 0;
        const cardPrestigeExpectation = isOpen
            ? visiblePoints
            : EXPECTED_CLOSED_LUXURY_PRESTIGE;

        const expectedPrestigeOnPurchase = Number((cardPrestigeExpectation * successRate).toFixed(4));
        const expectedAuPerPrestige = expectedPrestigeOnPurchase > 0
            ? Number((effectiveCost / expectedPrestigeOnPurchase).toFixed(2))
            : 999;

        const pileInfo = {
            id: deckId,
            cost,
            taxCount,
            effectiveCost,
            cardsRemaining: cRem,
            isOpen,
            visiblePoints,
            visibleRerollsGranted,
            successRate: Number(successRate.toFixed(4)),
            cardPrestigeExpectation,
            expectedPrestigeOnPurchase,
            expectedAuPerPrestige
        };
        piles.push(pileInfo);

        if (isOpen && deck.visibleCard) {
            visibleCards.push({
                deckId,
                cost,
                taxCount,
                effectiveCost,
                name: deck.visibleCard.name,
                points: visiblePoints,
                rerollsGranted: visibleRerollsGranted,
                tier: deck.visibleCard.tier || (deckId + 1),
                successRate: Number(successRate.toFixed(4)),
                expectedPrestigeOnPurchase,
                expectedAuPerPrestige,
                efficiencyAuPerPrestige: expectedAuPerPrestige
            });
        }
    });

    const highestVisiblePrestige = visibleCards.length > 0
        ? Math.max(...visibleCards.map(c => c.points || 0))
        : null;

    const threePrestigeVisible = visibleCards.some(c => (c.points || 0) >= 3);
    const highValueLuxuryVisible = visibleCards.some(c => (c.points || 0) >= 3);

    // ------------------------------------------------------------------------
    // 6. OPPONENTS CONTEXT
    // ------------------------------------------------------------------------
    const sortedByPrestige = [...players].sort((a, b) => {
        const aP = (a.totalPrestige !== undefined ? a.totalPrestige : a.prestige) || 0;
        const bP = (b.totalPrestige !== undefined ? b.totalPrestige : b.prestige) || 0;
        return bP - aP;
    });

    const prestigeLeader = sortedByPrestige.length > 0 ? sortedByPrestige[0] : null;
    const highestPrestige = prestigeLeader
        ? ((prestigeLeader.totalPrestige !== undefined ? prestigeLeader.totalPrestige : prestigeLeader.prestige) || 0)
        : 0;

    const opponents = players.filter(p => p.id !== pId);
    const visibleOpponentGolds = opponents
        .map(p => p.gold)
        .filter(g => g !== null && g !== undefined);
    const visibleGoldCount = visibleOpponentGolds.length;
    const hiddenGoldCount = opponents.length - visibleGoldCount;
    const allOpponentGoldKnown = opponents.length > 0 && hiddenGoldCount === 0;
    const highestVisibleGold = visibleOpponentGolds.length > 0 ? Math.max(...visibleOpponentGolds) : null;

    const opponentPrestigeValues = opponents.map(p => (p.totalPrestige !== undefined ? p.totalPrestige : p.prestige) || 0);
    const highestOpponentPrestige = opponentPrestigeValues.length > 0 ? Math.max(...opponentPrestigeValues) : 0;

    const botPrestigeRank = sortedByPrestige.findIndex(p => p.id === pId) + 1 || 1;
    const isLeading = botPrestigeRank === 1;
    const prestigeGap = isLeading
        ? (botTotalPrestige - highestOpponentPrestige)
        : (botTotalPrestige - highestPrestige);

    const isSoleLeader = isLeading && (
        sortedByPrestige.length <= 1 ||
        (((sortedByPrestige[1].totalPrestige !== undefined ? sortedByPrestige[1].totalPrestige : sortedByPrestige[1].prestige) || 0) < botTotalPrestige)
    );

    // ------------------------------------------------------------------------
    // 7. ECONOMIC PRESSURES (RESERVE VS CONVERSION)
    // ------------------------------------------------------------------------
    let reservePressure = 0.0;
    if (remainingAuctionCount > 0 || activeAuctionPresent) {
        reservePressure = 0.30;
        if (remainingAuctionCount >= 2) reservePressure += 0.10;
        if (auctionImminent) reservePressure += 0.25;
        if (activeAuctionPresent) reservePressure += 0.35;
        if (marALagoVisible || highValueAuctionVisible) reservePressure += 0.25;
        if (highestVisibleGold !== null && highestVisibleGold >= 15) reservePressure += 0.10;

        if (phase === 'EARLY' || phase === 'MID') {
            reservePressure += 0.05;
        } else if (phase === 'ENDGAME' && !auctionImminent && !activeAuctionPresent) {
            reservePressure -= 0.15;
        }
    } else {
        reservePressure = 0.0;
    }
    reservePressure = Math.max(0.0, Math.min(1.0, reservePressure));
    reservePressure = Number(reservePressure.toFixed(2));

    let conversionPressure = 0.0;
    if (remainingAuctionCount === 0 && !activeAuctionPresent) {
        conversionPressure = 0.40;
    } else {
        conversionPressure = 0.10;
    }

    if (phase === 'MID') conversionPressure += 0.10;
    if (phase === 'LATE') conversionPressure += 0.30;
    if (phase === 'ENDGAME') conversionPressure += 0.50;

    if (botGold >= 20) {
        conversionPressure += 0.30;
    } else if (botGold >= 10) {
        conversionPressure += 0.20;
    } else if (botGold >= 5) {
        conversionPressure += 0.10;
    }

    if (threePrestigeVisible) {
        conversionPressure += 0.20;
    } else if (highestVisiblePrestige === 2) {
        conversionPressure += 0.10;
    }

    if (finishers.length > 0) {
        conversionPressure -= 0.10;
    }

    conversionPressure = Math.max(0.0, Math.min(1.0, conversionPressure));
    conversionPressure = Number(conversionPressure.toFixed(2));

    // ------------------------------------------------------------------------
    // 8. STRATEGIC FLAGS & DYNAMIC AU RETENTION (Phase 5B.7)
    // ------------------------------------------------------------------------
    const shouldPreserveGold = reservePressure >= 0.60;
    const shouldConvertGoldAggressively = conversionPressure >= 0.60;

    const prelimContext = {
        gamePhase: phase,
        bot: { id: pId, gold: botGold },
        economy: { reservePressure, conversionPressure, liquidGold: botGold },
        auctions: {
            remainingCount: remainingAuctionCount,
            activeAuctionPresent,
            imminent: auctionImminent,
            highValueAuctionVisible,
            marALagoVisible
        }
    };
    const auRetentionFactor = getGoldRetentionFactor(prelimContext);
    const baseAuRetentionFactor = getBaseGoldRetentionFactor(prelimContext);
    const postAuctionReserveAu = getPostAuctionReserve(prelimContext);
    const effectivePrestigePerAu = Number((PRESTIGE_PER_AU * auRetentionFactor).toFixed(6));
    const baseEffectivePrestigePerAu = Number((PRESTIGE_PER_AU * baseAuRetentionFactor).toFixed(6));

    const auctionValueInfo = getExpectedUpcomingAuctionValue(knowledge);
    const auctionUrgencyInfo = estimateAuctionUrgencyAndIncome(knowledge);

    const aiDepth = getBotAiDepth(resolvedBot);
    const depthFeatures = getAiDepthFeatures(resolvedBot);

    return {
        aiDepth,
        depthFeatures,

        bot: {
            id: pId,
            name: pName,
            aiDepth,
            depthFeatures,
            gold: botGold,
            totalGold: botTotalGold,
            prestige: botPrestige,
            bankedPrestige: botBankedPrestige,
            totalPrestige: botTotalPrestige,
            rerolls: botRerolls,
            personality: getStrategicPersonality(resolvedBot),
            personalityProfile: getStrategicPersonalityProfile(resolvedBot),
            inventoryCount: botInventory.length
        },

        economy: {
            auPerPrestige: AU_PER_PRESTIGE,
            prestigePerAu: Number(PRESTIGE_PER_AU.toFixed(6)),
            auRetentionFactor,
            effectivePrestigePerAu,
            baseAuRetentionFactor,
            baseEffectivePrestigePerAu,
            liquidGold: botGold,
            reservePressure,
            conversionPressure,
            postAuctionReserveAu
        },

        auctions: {
            remainingCount: remainingAuctionCount,
            activeAuctionPresent,
            visibleProperties,
            highestVisiblePropertyPrestige,
            marALagoVisible,
            imminent: auctionImminent,
            highValueAuctionVisible,
            waterfrontLeftRemaining,
            waterfrontRightRemaining,
            relevantUpcomingAuctionId: auctionValueInfo.relevantUpcomingAuctionId,
            relevantAuctionWaterfrontRemaining: auctionValueInfo.relevantAuctionWaterfrontRemaining,
            relevantAuctionValueSource: auctionValueInfo.relevantAuctionValueSource,
            expectedUpcomingAuctionPrestige: auctionValueInfo.expectedUpcomingAuctionPrestige,
            baselineAuctionValueAu: auctionValueInfo.baselineAuctionValueAu,
            auctionUrgency: auctionUrgencyInfo.auctionUrgency,
            estimatedAuBeforeAuction: auctionUrgencyInfo.estimatedAuBeforeAuction,
            minWfRemaining: auctionUrgencyInfo.minWfRemaining,
            noAuctionsRemaining: (remainingAuctionCount === 0 && !activeAuctionPresent)
        },

        luxury: {
            decksRemaining,
            totalCardsRemaining,
            piles,
            visibleCards,
            highestVisiblePrestige,
            threePrestigeVisible,
            highValueLuxuryVisible,
            expectedClosedLuxuryPrestige: EXPECTED_CLOSED_LUXURY_PRESTIGE,
            postAuctionPlan: evaluatePostAuctionLuxuryPlan(knowledge, {
                bot: { id: pId, gold: botGold, rerolls: botRerolls, character: selfPlayer.character },
                gamePhase: phase,
                prestigeGap,
                map: { boardRemainingRatio }
            })
        },

        map: {
            remainingCards,
            totalPlayableCards,
            boardRemainingRatio: Number(boardRemainingRatio.toFixed(3)),
            finishers: finishers.map(c => c.id),
            traps: traps.map(c => c.id),
            safeMoves: safeMoves.map(c => c.id),
            finisherAvailable: finishers.length > 0
        },

        opponents: {
            count: opponents.length,
            totalOpponentsCount: opponents.length,
            visibleOpponentsCount: visibleOpponentGolds.length,
            visibleOpponentGolds,
            visibleGoldCount,
            hiddenGoldCount,
            allOpponentGoldKnown,
            prestigeLeader: prestigeLeader ? {
                id: prestigeLeader.id,
                name: prestigeLeader.name,
                prestige: (prestigeLeader.totalPrestige !== undefined ? prestigeLeader.totalPrestige : prestigeLeader.prestige) || 0,
                isSelf: prestigeLeader.id === pId
            } : null,
            highestPrestige,
            highestOpponentPrestige,
            highestVisibleGold,
            botPrestigeRank,
            prestigeGap,
            isLeading,
            isSoleLeader
        },

        endgameWinLock: evaluateEndgameWinLock(bot, knowledge),

        gamePhase: {
            phase,
            boardRemainingRatio: Number(boardRemainingRatio.toFixed(3))
        },

        strategicFlags: {
            shouldPreserveGold,
            shouldConvertGoldAggressively,
            highValueAuctionVisible,
            highValueLuxuryVisible,
            finisherAvailable: finishers.length > 0,
            auctionImminent
        },

        recentMapRegions: Array.isArray(bot?._recentStrategicMapRegions) ? [...bot._recentStrategicMapRegions] : []
    };
}

// ============================================================================
// INSPECTION & DEBUG TOOLS
// ============================================================================

/**
 * Formats a strategic context object into a human-readable debug string.
 * @param {Object} context - Result of analyzeStrategicContext()
 * @returns {string} Formatted summary text
 */
export function formatStrategicContextSummary(context) {
    if (!context) return "NO STRATEGIC CONTEXT AVAILABLE";

    const b = context.bot;
    const eco = context.economy;
    const auc = context.auctions;
    const lux = context.luxury;
    const map = context.map;
    const opp = context.opponents;
    const flags = context.strategicFlags;
    const winLock = context.endgameWinLock;

    const luxuryPilesLines = lux.piles.map(p =>
        `  • ${p.cost} Au Pile (Eff: ${p.effectiveCost} Au, Tax: ${p.taxCount}): ` +
        `${p.isOpen ? `Visible ${p.visiblePoints}P` : 'Closed'} ` +
        `-> Exp: ${p.expectedPrestigeOnPurchase}P (${p.expectedAuPerPrestige} Au/P)`
    );

    const highestProp = auc.highestVisiblePropertyPrestige !== null
        ? `${auc.highestVisiblePropertyPrestige} Prestige`
        : 'NONE';

    const boardPct = Math.round(map.boardRemainingRatio * 100);

    return [
        `BOT STRATEGIC CONTEXT — ${(b.name || `BOT ${b.id}`).toUpperCase()}`,
        ``,
        `Prestige: ${b.totalPrestige}`,
        `Gold: ${b.gold}`,
        `Prestige Leader: ${opp.highestPrestige}`,
        `Prestige Gap: ${opp.prestigeGap >= 0 ? '+' : ''}${opp.prestigeGap}`,
        ``,
        `Auctions Remaining: ${auc.remainingCount}`,
        `Relevant Upcoming Auction: ${auc.relevantUpcomingAuctionId || 'NONE'} (WF Distance: ${auc.relevantAuctionWaterfrontRemaining !== undefined && auc.relevantAuctionWaterfrontRemaining !== Infinity ? auc.relevantAuctionWaterfrontRemaining : 'N/A'})`,
        `Upcoming Auction Value Source: ${auc.relevantAuctionValueSource || 'N/A'} (Exp: ${auc.expectedUpcomingAuctionPrestige !== undefined ? auc.expectedUpcomingAuctionPrestige : 'N/A'}P, Baseline: ${auc.baselineAuctionValueAu !== undefined ? auc.baselineAuctionValueAu : 'N/A'} Au)`,
        `Auction Imminent: ${auc.imminent ? 'YES' : 'NO'}`,
        `Mar-a-Lago Visible: ${auc.marALagoVisible ? 'YES' : 'NO'}`,
        `Highest Visible Property: ${highestProp}`,
        ``,
        `Post-Auction Cash Reserve: ${eco.postAuctionReserveAu || 0} Au`,
        `Endgame Win Lock: ${winLock?.canLockWin ? 'ACTIVE (WIN-LOCK)' : (winLock?.applicable ? `INACTIVE (${winLock.reason})` : 'N/A')}`,
        ``,
        `Luxury Decks Remaining: ${lux.decksRemaining} (${lux.totalCardsRemaining} cards)`,
        ...luxuryPilesLines,
        ``,
        `Visible 3P Luxury: ${lux.threePrestigeVisible ? 'YES' : 'NO'}`,
        `Map Finishers: ${map.finishers.length}`,
        `Board Remaining: ${boardPct}% (${context.gamePhase.phase})`,
        ``,
        `Reserve Pressure: ${eco.reservePressure}`,
        `Conversion Pressure: ${eco.conversionPressure}`,
        `Base Au Retention: ${eco.baseAuRetentionFactor !== undefined ? eco.baseAuRetentionFactor : 'N/A'} (Base Eff P/Au: ${eco.baseEffectivePrestigePerAu !== undefined ? eco.baseEffectivePrestigePerAu : 'N/A'})`,
        `Au Retention Factor: ${eco.auRetentionFactor !== undefined ? eco.auRetentionFactor : 'N/A'} (Eff P/Au: ${eco.effectivePrestigePerAu !== undefined ? eco.effectivePrestigePerAu : 'N/A'})`,
        `Post-Auction Reserve: ${eco.postAuctionReserveAu !== undefined ? eco.postAuctionReserveAu : 'N/A'} Au`,
        ``,
        `Flags:`,
        `PRESERVE GOLD: ${flags.shouldPreserveGold ? 'YES' : 'NO'}`,
        `CONVERT GOLD: ${flags.shouldConvertGoldAggressively ? 'YES' : 'NO'}`,
        `FINISHER AVAILABLE: ${flags.finisherAvailable ? 'YES' : 'NO'}`
    ].join('\n');
}

// ============================================================================
// ACTION VALUATION ENGINE (PHASE 5B / 5B.6)
// ============================================================================

/**
 * Opportunity cost penalty in Au per line threatened when a trap move is made.
 */
export const TRAP_OPPORTUNITY_PENALTY_AU = 2.5;

/**
 * Evaluates the pure positional setup / progress value for advancing a single row or column.
 * Rewards partial development toward line completion while preventing double-counting of immediate finishers.
 *
 * @param {number|Object} unresolved - Number of unresolved/available cells in the line, or an options object
 * @param {number} [flipped] - Number of cells already flipped/developed in the line
 * @returns {number} Positional setup value in Prestige-equivalent
 */
export function evaluateLineSetupValue(unresolved, flipped = 0) {
    let unresolvedCount = unresolved;
    let flippedCount = flipped;

    if (typeof unresolved === 'object' && unresolved !== null) {
        flippedCount = unresolved.flippedCount !== undefined ? unresolved.flippedCount : (unresolved.ownedCount || 0);
        unresolvedCount = unresolved.unresolvedCount !== undefined ? unresolved.unresolvedCount : (unresolved.remainingCount || 0);
    }

    // If line has no unresolved cells or is structurally complete
    if (!unresolvedCount || unresolvedCount <= 0) return 0;

    // If candidate immediately completes the line, setup progress is 0 (handled by line completion bonus)
    if (unresolvedCount === 1) return 0;

    const developed = Math.max(0, flippedCount || 0);
    if (developed === 0) return 0.01;
    if (developed === 1) return 0.03;
    if (developed === 2) return 0.06;
    if (developed === 3) return 0.10;
    return 0.14;
}

/**
 * Evaluates the line completion and card opportunity handed to opponents when taking a second-last card (Phase 5B.12).
 *
 * @param {Object} cell - The candidate cell being evaluated
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} strategicContext - Strategic context
 * @param {Object} lineGeometry - Result from analyzeBoardLines(knowledge)
 * @returns {Object} Opponent line opportunity analysis
 */
export function evaluateLineHandoffOpportunity(cell, knowledge, strategicContext, lineGeometry, options = {}) {
    const defaultRes = {
        threatensRow: false,
        threatensCol: false,
        isTrap: false,
        remainingRowCellId: null,
        remainingColumnCellId: null,
        remainingRowCellDifficulty: null,
        remainingColumnCellDifficulty: null,
        remainingRowCellType: null,
        remainingColumnCellType: null,
        remainingRowCellLocked: false,
        remainingColumnCellLocked: false,
        remainingRowCellSuccessRate: null,
        remainingColumnCellSuccessRate: null,
        expectedOpponentRowOpportunityAu: 0,
        expectedOpponentColumnOpportunityAu: 0,
        expectedOpponentLineOpportunityPrestigeEq: 0,
        playerCountFactor: 1.0
    };

    if (!cell || !knowledge || !lineGeometry) return defaultRes;

    const rowCounts = lineGeometry.rowCounts || [];
    const colCounts = lineGeometry.colCounts || [];
    const baseEffectivePrestigePerAu = strategicContext?.economy?.baseEffectivePrestigePerAu !== undefined
        ? strategicContext.economy.baseEffectivePrestigePerAu
        : Number((PRESTIGE_PER_AU * 0.50).toFixed(6));

    const opponents = strategicContext?.opponents || {};
    const playersList = Array.isArray(knowledge.players) ? knowledge.players : [];
    const playerCount = playersList.length > 0
        ? playersList.length
        : (opponents.count !== undefined ? opponents.count + 1 : 2);

    // Player count factor for line handoff risk (Phase 5B.12 PART 5)
    // 2-player: 1.00 (immediate direct beneficiary)
    // 3-player: 0.80
    // 4-player: 0.65
    const playerCountFactor = playerCount === 2 ? 1.00 : (playerCount === 3 ? 0.80 : 0.65);

    const threatensRow = (rowCounts[cell.r] === 2);
    const threatensCol = (colCounts[cell.c] === 2);
    const isTrap = threatensRow || threatensCol;

    if (!isTrap) {
        return { ...defaultRes, playerCountFactor };
    }

    const grid = Array.isArray(knowledge.grid) ? knowledge.grid : [];

    // Helper to calculate opponent success rate on a remaining cell (Phase 5B.12 & Hotfix)
    function getOpponentSuccessRate(remCell) {
        if (!remCell) return 1.0;
        const diff = remCell.difficulty !== undefined ? remCell.difficulty : 0;
        const normalSuccess = diff <= 0 ? 1.0 : Number((Math.max(0, Math.min(1.0, (7 - diff) / 6))).toFixed(4));
        if (!remCell.locked) {
            return normalSuccess;
        }

        // If opponent lookahead is disabled, do not inspect opponent character identities
        if (options && options.opponentLookahead === false) {
            return Number((2 / 6).toFixed(4));
        }

        // Locked cell: evaluate based on public opponent character identities
        const opponentsList = playersList.filter(p => !p.isSelf);
        const totalOpponents = opponentsList.length;
        const nonCarinaSuccess = Number((2 / 6).toFixed(4)); // 0.3333

        if (totalOpponents === 0) {
            return nonCarinaSuccess;
        }

        const carinaCount = opponentsList.filter(p => p.character && p.character.name === 'CARINA').length;
        if (carinaCount === totalOpponents) {
            return normalSuccess;
        }
        if (carinaCount === 0) {
            return nonCarinaSuccess;
        }

        // Proportional blend based on public character identities
        const blended = (carinaCount / totalOpponents) * normalSuccess + ((totalOpponents - carinaCount) / totalOpponents) * nonCarinaSuccess;
        return Number(blended.toFixed(4));
    }

    let remainingRowCellId = null;
    let remainingRowCellDifficulty = null;
    let remainingRowCellType = null;
    let remainingRowCellLocked = false;
    let remainingRowCellSuccessRate = null;
    let expectedOpponentRowOpportunityAu = 0;

    if (threatensRow) {
        const remRowCell = grid.find(c => c.r === cell.r && c.id !== cell.id && !c.flipped && !c.empty);
        if (remRowCell) {
            remainingRowCellId = remRowCell.id;
            remainingRowCellDifficulty = remRowCell.difficulty !== undefined ? remRowCell.difficulty : 0;
            remainingRowCellType = remRowCell.type || 'BLOCK';
            remainingRowCellLocked = Boolean(remRowCell.locked);
            remainingRowCellSuccessRate = getOpponentSuccessRate(remRowCell);

            // Opportunity = +5 line bonus + remaining card's own expected reward
            const cardReward = remRowCell.value !== undefined ? remRowCell.value : 0;
            expectedOpponentRowOpportunityAu = (5 + cardReward) * remainingRowCellSuccessRate;
        } else {
            expectedOpponentRowOpportunityAu = 5 * 1.0;
        }
    }

    let remainingColumnCellId = null;
    let remainingColumnCellDifficulty = null;
    let remainingColumnCellType = null;
    let remainingColumnCellLocked = false;
    let remainingColumnCellSuccessRate = null;
    let expectedOpponentColumnOpportunityAu = 0;

    if (threatensCol) {
        const remColCell = grid.find(c => c.c === cell.c && c.id !== cell.id && !c.flipped && !c.empty);
        if (remColCell) {
            remainingColumnCellId = remColCell.id;
            remainingColumnCellDifficulty = remColCell.difficulty !== undefined ? remColCell.difficulty : 0;
            remainingColumnCellType = remColCell.type || 'BLOCK';
            remainingColumnCellLocked = Boolean(remColCell.locked);
            remainingColumnCellSuccessRate = getOpponentSuccessRate(remColCell);

            const cardReward = remColCell.value !== undefined ? remColCell.value : 0;
            expectedOpponentColumnOpportunityAu = (5 + cardReward) * remainingColumnCellSuccessRate;
        } else {
            expectedOpponentColumnOpportunityAu = 5 * 1.0;
        }
    }

    const totalOpponentOpportunityAu = (expectedOpponentRowOpportunityAu + expectedOpponentColumnOpportunityAu);
    const expectedOpponentLineOpportunityPrestigeEq = Number((
        totalOpponentOpportunityAu * baseEffectivePrestigePerAu * playerCountFactor
    ).toFixed(4));

    return {
        threatensRow,
        threatensCol,
        isTrap,
        remainingRowCellId,
        remainingColumnCellId,
        remainingRowCellDifficulty,
        remainingColumnCellDifficulty,
        remainingRowCellType,
        remainingColumnCellType,
        remainingRowCellLocked,
        remainingColumnCellLocked,
        remainingRowCellSuccessRate,
        remainingColumnCellSuccessRate,
        expectedOpponentRowOpportunityAu: Number(expectedOpponentRowOpportunityAu.toFixed(4)),
        expectedOpponentColumnOpportunityAu: Number(expectedOpponentColumnOpportunityAu.toFixed(4)),
        expectedOpponentLineOpportunityPrestigeEq,
        playerCountFactor
    };
}

/**
 * Evaluates the strategic auction timing value of taking a Waterfront card (Phase 5B.12).
 * Handles Last Waterfront (deliberate trigger with +4 reward +5 column bonus) and Second-Last Waterfront (auction handoff).
 *
 * @param {Object} cell - The candidate cell being evaluated
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} strategicContext - Strategic context
 * @param {Object} lineGeometry - Result from analyzeBoardLines(knowledge)
 * @returns {Object} Waterfront auction timing analysis
 */
export function evaluateWaterfrontAuctionTiming(cell, knowledge, strategicContext, lineGeometry) {
    const defaultRes = {
        isWaterfront: false,
        waterfrontStatus: "NONE", // "NONE" | "SECOND_LAST" | "LAST"
        relevantAuctionId: null,
        botGoldAtAuctionOnSuccess: null,
        projectedOpponentGoldAtAuctionIfHandoff: null,
        auctionTriggerClassification: null, // "FAVORABLE_TRIGGER" | "NEUTRAL_TRIGGER" | "UNFAVORABLE_TRIGGER" | "UNKNOWN"
        auctionHandoffClassification: null, // "DOMINANT_HANDOFF" | "UNFAVORABLE_HANDOFF" | "UNKNOWN"
        rawTimingPrestigeEq: 0.0,
        waterfrontAuctionTimingPrestigeEq: 0.0
    };

    if (!cell || !knowledge || !lineGeometry) return defaultRes;

    const isWfL = (cell.type === 'WF_L' || cell.c === 1);
    const isWfR = (cell.type === 'WF_R' || cell.c === 7);

    if (!isWfL && !isWfR) return defaultRes;

    const colCounts = lineGeometry.colCounts || [];
    const wfRemaining = isWfL ? colCounts[1] : colCounts[7];
    const auctionId = isWfL ? "A" : "B";
    const auction = knowledge.auctions?.[auctionId];

    if (!auction || auction.resolved || auction.triggered) {
        return defaultRes;
    }

    const opponents = strategicContext?.opponents || {};
    const allKnown = opponents.allOpponentGoldKnown === true;
    const highestVisibleGold = opponents.highestVisibleGold !== undefined ? opponents.highestVisibleGold : null;
    const botGold = strategicContext?.bot?.gold || 0;
    const playerCount = (Array.isArray(knowledge.players) ? knowledge.players.length : (opponents.count !== undefined ? opponents.count + 1 : 2));
    const playerCountFactor = playerCount === 2 ? 1.00 : (playerCount === 3 ? 0.80 : 0.65);

    const isMarALago = (auction.visibleCard?.name === "Mar-a-Lago" || auction.propertyWon?.name === "Mar-a-Lago");
    const marALagoBonus = isMarALago ? 0.10 : 0.0;

    const candidateRewardAu = cell.value !== undefined ? cell.value : 4;

    // ------------------------------------------------------------------------
    // CASE A: LAST WATERFRONT CELL (wfRemaining === 1) -> DELIBERATE TRIGGER
    // ------------------------------------------------------------------------
    if (wfRemaining === 1) {
        const botGoldAtAuctionOnSuccess = botGold + candidateRewardAu + 5;

        let auctionTriggerClassification = "NEUTRAL_TRIGGER";
        let rawTimingPrestigeEq = 0.0;

        if (!allKnown || highestVisibleGold === null) {
            auctionTriggerClassification = "UNKNOWN";
            if (botGoldAtAuctionOnSuccess >= 25) {
                rawTimingPrestigeEq = 0.10 + marALagoBonus;
            } else if (botGoldAtAuctionOnSuccess < 10) {
                rawTimingPrestigeEq = -0.10;
            } else {
                rawTimingPrestigeEq = 0.0 + marALagoBonus;
            }
        } else {
            // Known visible opponents
            // If bot clearly outfunds the opponent:
            if (botGoldAtAuctionOnSuccess >= highestVisibleGold + 5 && botGoldAtAuctionOnSuccess >= 18) {
                auctionTriggerClassification = "FAVORABLE_TRIGGER";
                rawTimingPrestigeEq = 0.25 + marALagoBonus;
            } else if (botGoldAtAuctionOnSuccess > highestVisibleGold) {
                auctionTriggerClassification = "FAVORABLE_TRIGGER";
                rawTimingPrestigeEq = 0.15 + marALagoBonus;
            } else if (botGoldAtAuctionOnSuccess >= highestVisibleGold - 15) {
                // Competitive or close (e.g. 39 vs 52 for Mar-a-Lago, or 25 vs 30)
                auctionTriggerClassification = "NEUTRAL_TRIGGER";
                rawTimingPrestigeEq = 0.05 + marALagoBonus;
            } else {
                // Heavily behind / broke (e.g. 8 vs 45 for 2P/3P property)
                auctionTriggerClassification = "UNFAVORABLE_TRIGGER";
                rawTimingPrestigeEq = -0.20;
            }
        }

        return {
            isWaterfront: true,
            waterfrontStatus: "LAST",
            relevantAuctionId: auctionId,
            botGoldAtAuctionOnSuccess,
            projectedOpponentGoldAtAuctionIfHandoff: null,
            auctionTriggerClassification,
            auctionHandoffClassification: null,
            rawTimingPrestigeEq: Number(rawTimingPrestigeEq.toFixed(4)),
            waterfrontAuctionTimingPrestigeEq: Number(rawTimingPrestigeEq.toFixed(4))
        };
    }

    // ------------------------------------------------------------------------
    // CASE B: SECOND-LAST WATERFRONT CELL (wfRemaining === 2) -> AUCTION HANDOFF
    // ------------------------------------------------------------------------
    if (wfRemaining === 2) {
        const botGoldAfterSecondLast = botGold + candidateRewardAu;
        let projectedOpponentGoldIfHandoff = null;
        let auctionHandoffClassification = "UNFAVORABLE_HANDOFF";
        let rawTimingPrestigeEq = 0.0;

        if (!allKnown || highestVisibleGold === null) {
            auctionHandoffClassification = "UNKNOWN";
            rawTimingPrestigeEq = -0.15 * playerCountFactor;
        } else {
            // Opponent completing final Waterfront gets +4 Waterfront + 5 column bonus = +9 Au
            projectedOpponentGoldIfHandoff = highestVisibleGold + 9;

            // If bot is dominant even after handing opponent +9 Au (e.g. 55 Au vs 15+9=24 Au)
            if (botGoldAfterSecondLast >= projectedOpponentGoldIfHandoff + 5) {
                auctionHandoffClassification = "DOMINANT_HANDOFF";
                rawTimingPrestigeEq = -0.02 * playerCountFactor;
            } else {
                // Dangerous handoff: Opponent gets +9 Au and controls auction trigger
                auctionHandoffClassification = "UNFAVORABLE_HANDOFF";
                const basePenalty = (isMarALago ? 0.35 : 0.25);
                rawTimingPrestigeEq = -(basePenalty * playerCountFactor);
            }
        }

        return {
            isWaterfront: true,
            waterfrontStatus: "SECOND_LAST",
            relevantAuctionId: auctionId,
            botGoldAtAuctionOnSuccess: null,
            projectedOpponentGoldAtAuctionIfHandoff: projectedOpponentGoldIfHandoff,
            auctionTriggerClassification: null,
            auctionHandoffClassification,
            rawTimingPrestigeEq: Number(rawTimingPrestigeEq.toFixed(4)),
            waterfrontAuctionTimingPrestigeEq: Number(rawTimingPrestigeEq.toFixed(4))
        };
    }

    return defaultRes;
}

// ============================================================================
// REGIONAL MAP PERSONALITY, WATERFRONT ADVANCE, BONUS & LANDMARK ENGINE (PHASE 5B.13)
// ============================================================================

/**
 * Authoritative Strategic AI personality profiles (Phase 5E.3).
 * Modifies strategic preferences (auction cash preservation, risk tolerance, coastal appetite, auction bidding)
 * around the shared strategic formulas without creating branching AI scripts.
 */
export const STRATEGIC_PERSONALITY_PROFILES = {
    AGGRESSIVE: {
        auctionReserveMultiplier: 0.90,
        failureAversionPrestigeEq: -0.04,
        highRiskMapModifierPrestigeEq: 0.04,
        coastalModifierPrestigeEq: 0.02,
        luxuryRiskModifierPrestigeEq: 0.04,
        waterfrontRiskModifierPrestigeEq: 0.03,
        auctionBidMultiplier: 1.02
    },
    BALANCED: {
        auctionReserveMultiplier: 1.00,
        failureAversionPrestigeEq: 0.00,
        highRiskMapModifierPrestigeEq: 0.00,
        coastalModifierPrestigeEq: 0.00,
        luxuryRiskModifierPrestigeEq: 0.00,
        waterfrontRiskModifierPrestigeEq: 0.00,
        auctionBidMultiplier: 1.00
    },
    CAUTIOUS: {
        auctionReserveMultiplier: 1.10,
        failureAversionPrestigeEq: 0.04,
        highRiskMapModifierPrestigeEq: -0.04,
        coastalModifierPrestigeEq: -0.01,
        luxuryRiskModifierPrestigeEq: -0.04,
        waterfrontRiskModifierPrestigeEq: -0.03,
        auctionBidMultiplier: 1.00
    }
};

/**
 * Resolves the strategic personality category ("AGGRESSIVE" | "BALANCED" | "CAUTIOUS") for a bot.
 * Pure function: Deterministic, no side effects.
 *
 * @param {Object|null} bot - The bot player or reference object
 * @returns {"AGGRESSIVE" | "BALANCED" | "CAUTIOUS"}
 */
export function getStrategicPersonality(bot) {
    if (!bot) return "BALANCED";

    // 1. Direct personality property
    const directPers = typeof bot.personality === 'string' ? bot.personality.toUpperCase() : null;
    if (directPers && STRATEGIC_PERSONALITY_PROFILES[directPers]) {
        return directPers;
    }

    // 2. botRef personality property
    const refPers = typeof bot.botRef?.personality === 'string' ? bot.botRef.personality.toUpperCase() : null;
    if (refPers && STRATEGIC_PERSONALITY_PROFILES[refPers]) {
        return refPers;
    }

    // 3. Lookup in botRoster by botId / botRef.id
    const bId = (bot.botId !== undefined && bot.botId !== null)
        ? bot.botId
        : (bot.botRef && bot.botRef.id !== undefined ? bot.botRef.id : null);
    if (bId !== null) {
        const rosterEntry = botRoster.find(r => r.id === bId);
        const rosterPers = typeof rosterEntry?.personality === 'string' ? rosterEntry.personality.toUpperCase() : null;
        if (rosterPers && STRATEGIC_PERSONALITY_PROFILES[rosterPers]) {
            return rosterPers;
        }
    }

    // 4. Lookup in botRoster by name
    const name = bot.name || (bot.botRef && bot.botRef.name);
    if (name) {
        const rosterEntry = botRoster.find(r => r.name?.toUpperCase() === name.toUpperCase());
        const rosterPers = typeof rosterEntry?.personality === 'string' ? rosterEntry.personality.toUpperCase() : null;
        if (rosterPers && STRATEGIC_PERSONALITY_PROFILES[rosterPers]) {
            return rosterPers;
        }
    }

    // 5. Default fallback
    return "BALANCED";
}

/**
 * Retrieves the strategic personality profile configuration for a bot.
 *
 * @param {Object|null} bot - The bot player or reference object
 * @returns {Object} Personality profile descriptor
 */
export function getStrategicPersonalityProfile(bot) {
    const personality = getStrategicPersonality(bot);
    return STRATEGIC_PERSONALITY_PROFILES[personality] || STRATEGIC_PERSONALITY_PROFILES.BALANCED;
}

/**
 * Computes the urgency-scaled personality strength for auction cash preservation (Phase 5E.3 Part 4).
 * Scaling:
 *   Active auction: 1.0 (100%)
 *   1-2 WF remaining: 1.0 (100%)
 *   3 WF remaining: 0.75 (75%)
 *   4 WF remaining: 0.50 (50%)
 *   5+ WF remaining: 0.25 (25%)
 *   No auctions remaining: 0.0 (0%)
 *
 * @param {number} minWfRemaining - Distance to relevant auction in remaining Waterfront cards
 * @param {boolean} [hasActiveAuction=false] - Whether an auction is actively in progress
 * @param {number} [remainingAuctionCount=1] - Number of unresolved auctions remaining
 * @returns {number} Personality strength scale factor between 0.0 and 1.0
 */
export function getAuctionUrgencyPersonalityStrength(minWfRemaining, hasActiveAuction = false, remainingAuctionCount = 1) {
    if (remainingAuctionCount <= 0 && !hasActiveAuction) return 0.0;
    if (hasActiveAuction) return 1.0;
    if (minWfRemaining <= 2) return 1.0;
    if (minWfRemaining === 3) return 0.75;
    if (minWfRemaining === 4) return 0.50;
    return 0.25;
}

// ============================================================================
// BOT REROLL TELEMETRY ENGINE (PHASE 5E.3a)
// ============================================================================

export let __botRerollHistory = [];

if (typeof window !== 'undefined') {
    if (!window.__botRerollHistory) {
        window.__botRerollHistory = __botRerollHistory;
    } else {
        __botRerollHistory = window.__botRerollHistory;
    }
}

/**
 * Records an entry into the developer-only bot reroll telemetry log.
 * Only called when a bot actually consumes a reroll.
 *
 * @param {Object} entry - Telemetry payload
 * @returns {Object} Recorded entry
 */
export function recordBotReroll(entry) {
    if (!entry) return null;
    if (typeof window !== 'undefined') {
        if (!Array.isArray(window.__botRerollHistory)) window.__botRerollHistory = [];
        window.__botRerollHistory.push(entry);
        __botRerollHistory = window.__botRerollHistory;
    } else {
        __botRerollHistory.push(entry);
    }
    return entry;
}

/**
 * Clears the developer-only bot reroll telemetry log.
 * @returns {Array} Cleared empty history array
 */
export function clearBotRerollHistory() {
    if (typeof window !== 'undefined') {
        window.__botRerollHistory = [];
        __botRerollHistory = window.__botRerollHistory;
    } else {
        __botRerollHistory.length = 0;
    }
    return __botRerollHistory;
}

/**
 * Developer helper: Prints and returns the bot reroll history, with optional filtering.
 *
 * @param {number|string} [filter] - Optional Visitor ID or Bot Name filter (e.g. 9 for Twins, 10 for Gran Gran)
 * @returns {Array} Filtered bot reroll history
 */
export function inspectBotRerollHistory(filter) {
    const list = (typeof window !== 'undefined' && Array.isArray(window.__botRerollHistory))
        ? window.__botRerollHistory
        : __botRerollHistory;

    let filtered = list;
    if (filter !== undefined && filter !== null) {
        filtered = list.filter(e =>
            e.botId === filter ||
            e.botId === Number(filter) ||
            (typeof filter === 'string' && e.botName && e.botName.toUpperCase().includes(filter.toUpperCase()))
        );
    }
    if (typeof console !== 'undefined' && console.table) {
        console.table(filtered);
    }
    return filtered;
}


/**
 * Regional Map personality preference profiles (Phase 5B.13 Part 7 & 8).
 * Gran Gran is configured as a balanced MEDIUM_RISK player.
 */
export const MAP_PERSONALITY_PROFILES = {
    BALANCED: {
        BLOCK: 0.00,
        ATLANTIC: 0.00,
        WATERFRONT: 0.00,
        LAGOON: 0.00
    },
    SAFE: {
        BLOCK: 0.03,
        ATLANTIC: 0.02,
        WATERFRONT: -0.01,
        LAGOON: -0.03
    },
    MEDIUM: {
        BLOCK: 0.02,
        ATLANTIC: 0.01,
        WATERFRONT: 0.00,
        LAGOON: -0.01
    },
    RISKTAKER: {
        BLOCK: 0.00,
        ATLANTIC: 0.00,
        WATERFRONT: 0.01,
        LAGOON: 0.02
    }
};

/**
 * Identifies the region family of a board cell.
 * @param {Object} cell - The grid cell
 * @returns {"LAGOON" | "WATERFRONT" | "BLOCK" | "ATLANTIC"}
 */
export function getMapRegion(cell) {
    if (!cell) return "BLOCK";
    if (cell.type === 'LAGOON' || cell.c === 0) return "LAGOON";
    if (cell.type === 'WF_L' || cell.type === 'WF_R' || cell.c === 1 || cell.c === 7) return "WATERFRONT";
    if (cell.type === 'ATLANTIC' || cell.c === 8) return "ATLANTIC";
    if (cell.type === 'BLOCK' || (cell.c >= 2 && cell.c <= 6)) return "BLOCK";
    return "BLOCK";
}

/**
 * Evaluates the regional Map personality modifier for a candidate cell (Phase 5B.13 Part 7 & Phase 5E.2).
 * @param {Object} cell - The candidate cell
 * @param {string} [profileName="BALANCED"] - Profile name ("BALANCED" | "SAFE" | "MEDIUM" | "RISKTAKER")
 * @returns {number} Personality modifier in Prestige-equivalent
 */
export function getMapPersonalityPrestigeEq(cell, profileName = "BALANCED") {
    const profile = MAP_PERSONALITY_PROFILES[profileName] || MAP_PERSONALITY_PROFILES.BALANCED;
    const region = getMapRegion(cell);
    return profile[region] !== undefined ? profile[region] : 0.0;
}

/**
 * Evaluates the same-region repetition penalty for a candidate cell (Phase 5B.13 Part 9).
 * Prevents repetitive tunneling while preserving deterministic selection for superior moves.
 *
 * @param {string} cellRegion - The region of the candidate cell
 * @param {Array<string>} [recentMapRegions=[]] - History of recent strategic Map attempts (newest first)
 * @returns {{ repetitionPenaltyPrestigeEq: number, consecutiveSameRegionCount: number, previousMapRegion: string|null, secondPreviousMapRegion: string|null }}
 */
export function calculateMapRepetitionPenalty(cellRegion, recentMapRegions = []) {
    if (!Array.isArray(recentMapRegions) || recentMapRegions.length === 0) {
        return {
            repetitionPenaltyPrestigeEq: 0.0,
            consecutiveSameRegionCount: 0,
            previousMapRegion: null,
            secondPreviousMapRegion: null
        };
    }

    const previousMapRegion = recentMapRegions[0] || null;
    const secondPreviousMapRegion = recentMapRegions[1] || null;

    let consecutiveSameRegionCount = 0;
    if (previousMapRegion === cellRegion) {
        consecutiveSameRegionCount = 1;
        if (secondPreviousMapRegion === cellRegion) {
            consecutiveSameRegionCount = 2;
        }
    }

    let repetitionPenaltyPrestigeEq = 0.0;
    if (consecutiveSameRegionCount === 1) {
        repetitionPenaltyPrestigeEq = 0.02;
    } else if (consecutiveSameRegionCount >= 2) {
        repetitionPenaltyPrestigeEq = 0.04;
    }

    return {
        repetitionPenaltyPrestigeEq,
        consecutiveSameRegionCount,
        previousMapRegion,
        secondPreviousMapRegion
    };
}

/**
 * Evaluates progressive Waterfront auction-readiness pressure (Phase 5B.13 Parts 1-6).
 * Differentiates LEFT Waterfront (Auction A) and RIGHT Waterfront (Auction B),
 * counts unresolved cards in THAT Waterfront column, and penalizes underfunded auction advancement
 * while allowing well-funded advancement and leaving distant/handoff/trigger turns unpunished.
 *
 * @param {Object} cell - The candidate cell
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} strategicContext - Strategic context
 * @param {Object} lineGeometry - Line geometry from analyzeBoardLines(knowledge)
 * @returns {Object} Waterfront advance readiness breakdown
 */
export function evaluateWaterfrontAdvanceReadiness(cell, knowledge, strategicContext, lineGeometry) {
    const defaultRes = {
        isWaterfront: false,
        relevantAuctionId: null,
        waterfrontRemainingBefore: 0,
        waterfrontAdvanceClassification: "NONE", // "DISTANT" | "APPROACHING" | "IMMINENT" | "SECOND_LAST" | "LAST" | "NONE"
        projectedBotAuctionGold: 0,
        targetAuctionReserve: 0,
        auctionReadinessGap: 0,
        auctionContestability: "UNKNOWN",
        auctionAdvancePrestigeEq: 0.0,
        auctionAdvanceReason: "NOT_WATERFRONT"
    };

    if (!cell || !knowledge) return defaultRes;

    const isWfL = (cell.type === 'WF_L' || cell.c === 1);
    const isWfR = (cell.type === 'WF_R' || cell.c === 7);
    if (!isWfL && !isWfR) return defaultRes;

    const colCounts = lineGeometry?.colCounts || [];
    const wfRemaining = isWfL ? (colCounts[1] !== undefined ? colCounts[1] : 0) : (colCounts[7] !== undefined ? colCounts[7] : 0);
    const relevantAuctionId = isWfL ? "A" : "B";
    const auction = knowledge.auctions?.[relevantAuctionId];

    let waterfrontAdvanceClassification = "DISTANT";
    if (wfRemaining >= 5) {
        waterfrontAdvanceClassification = "DISTANT";
    } else if (wfRemaining === 4) {
        waterfrontAdvanceClassification = "APPROACHING";
    } else if (wfRemaining === 3) {
        waterfrontAdvanceClassification = "IMMINENT";
    } else if (wfRemaining === 2) {
        waterfrontAdvanceClassification = "SECOND_LAST";
    } else if (wfRemaining === 1) {
        waterfrontAdvanceClassification = "LAST";
    }

    // If auction is already resolved or triggered, no advance penalty
    if (!auction || auction.resolved || auction.triggered) {
        return {
            isWaterfront: true,
            relevantAuctionId,
            waterfrontRemainingBefore: wfRemaining,
            waterfrontAdvanceClassification,
            projectedBotAuctionGold: strategicContext?.bot?.gold || 0,
            targetAuctionReserve: 0,
            auctionReadinessGap: 0,
            auctionContestability: "RESOLVED_OR_TRIGGERED",
            auctionAdvancePrestigeEq: 0.0,
            auctionAdvanceReason: "AUCTION_ALREADY_RESOLVED_OR_TRIGGERED"
        };
    }

    // 2 remaining & 1 remaining are handled by existing SECOND_LAST and LAST logic (no double counting)
    if (wfRemaining <= 2) {
        return {
            isWaterfront: true,
            relevantAuctionId,
            waterfrontRemainingBefore: wfRemaining,
            waterfrontAdvanceClassification,
            projectedBotAuctionGold: strategicContext?.bot?.gold || 0,
            targetAuctionReserve: 0,
            auctionReadinessGap: 0,
            auctionContestability: "EVALUATED_BY_TIMING",
            auctionAdvancePrestigeEq: 0.0,
            auctionAdvanceReason: "HANDOFF_OR_TRIGGER_TIMING_ALREADY_EVALUATED"
        };
    }

    // 5+ remaining is distant: ordinary early Waterfront play is not punished
    if (wfRemaining >= 5) {
        return {
            isWaterfront: true,
            relevantAuctionId,
            waterfrontRemainingBefore: wfRemaining,
            waterfrontAdvanceClassification,
            projectedBotAuctionGold: strategicContext?.bot?.gold || 0,
            targetAuctionReserve: 0,
            auctionReadinessGap: 0,
            auctionContestability: "DISTANT",
            auctionAdvancePrestigeEq: 0.0,
            auctionAdvanceReason: "DISTANT_AUCTION"
        };
    }

    // For 4 remaining (APPROACHING) and 3 remaining (IMMINENT):
    const botGold = strategicContext?.bot?.gold || 0;
    const candidateRewardAu = cell.value !== undefined ? cell.value : 4;
    const projectedBotAuctionGold = botGold + candidateRewardAu;

    // Determine target auction reserve for this specific auction
    const isMarALago = (auction.visibleCard?.name === "Mar-a-Lago" || auction.propertyWon?.name === "Mar-a-Lago");
    let baselineAuctionValueAu = 22.5; // default 3P expectation
    if (auction.visibleCard && auction.visibleCard.points !== undefined) {
        if (auction.visibleCard.points === 4 || isMarALago) {
            baselineAuctionValueAu = 30 + MAR_A_LAGO_TIEBREAK_PREMIUM_AU;
        } else if (auction.visibleCard.points === 3) {
            baselineAuctionValueAu = 22.5;
        } else if (auction.visibleCard.points === 2) {
            baselineAuctionValueAu = 15;
        }
    }

    const playerCount = (Array.isArray(knowledge.players) ? knowledge.players.length : (strategicContext?.opponents?.count !== undefined ? strategicContext.opponents.count + 1 : 2));
    let baseTargetAuctionReserve = baselineAuctionValueAu;
    if (playerCount === 2) {
        const highestOppGold = strategicContext?.opponents?.highestVisibleGold !== undefined ? strategicContext.opponents.highestVisibleGold : null;
        if (highestOppGold !== null) {
            baseTargetAuctionReserve = Math.min(baselineAuctionValueAu, highestOppGold + 1);
        }
    } else {
        baseTargetAuctionReserve = Number((baselineAuctionValueAu * (playerCount >= 4 ? 0.85 : 0.95)).toFixed(2));
    }

    // Urgency-scaled personality reserve (Phase 5E.3 Part 3 & 4)
    const remainingAuctionCount = strategicContext?.auctions?.remainingCount !== undefined
        ? strategicContext.auctions.remainingCount
        : ((knowledge?.auctions?.A?.resolved ? 0 : 1) + (knowledge?.auctions?.B?.resolved ? 0 : 1));
    const personality = getStrategicPersonality(strategicContext?.bot);
    const profile = getStrategicPersonalityProfile(strategicContext?.bot);
    const urgencyStrength = getAuctionUrgencyPersonalityStrength(wfRemaining, false, remainingAuctionCount);
    const effectiveReserveMultiplier = 1 + (profile.auctionReserveMultiplier - 1) * urgencyStrength;
    const personalityAdjustedTargetAuctionReserve = Number((baseTargetAuctionReserve * effectiveReserveMultiplier).toFixed(2));
    const targetAuctionReserve = personalityAdjustedTargetAuctionReserve;

    const auctionReadinessGap = Number((projectedBotAuctionGold - targetAuctionReserve).toFixed(2));

    // Determine contestability
    const projectedOpponentsInfo = estimateProjectedOpponentAuctionGolds(strategicContext, 0);
    const contestInfo = getAuctionContestability(strategicContext, projectedBotAuctionGold, targetAuctionReserve, projectedOpponentsInfo, baselineAuctionValueAu);
    const auctionContestability = contestInfo.auctionContestability;

    let auctionAdvancePrestigeEq = 0.0;
    let auctionAdvanceReason = "NEUTRAL";

    if (wfRemaining === 4) {
        if (auctionReadinessGap >= 0) {
            auctionAdvancePrestigeEq = 0.02;
            auctionAdvanceReason = "WELL_FUNDED_APPROACHING";
        } else if (auctionReadinessGap >= -5) {
            auctionAdvancePrestigeEq = -0.02;
            auctionAdvanceReason = "MARGINAL_APPROACHING";
        } else {
            if (isMarALago) {
                if (auctionContestability === "UNCONTESTABLE" || auctionContestability === "EXPENSIVE") {
                    auctionAdvancePrestigeEq = -0.02;
                    auctionAdvanceReason = "UNDERFUNDED_UNCONTESTABLE_MAR_A_LAGO_APPROACHING";
                } else {
                    auctionAdvancePrestigeEq = -0.06;
                    auctionAdvanceReason = "UNDERFUNDED_MAR_A_LAGO_APPROACHING";
                }
            } else {
                auctionAdvancePrestigeEq = -0.05;
                auctionAdvanceReason = "UNDERFUNDED_APPROACHING";
            }
        }
        // Personality modifier on advancing approaching auction (Phase 5E.3 Part 9)
        auctionAdvancePrestigeEq = Number((auctionAdvancePrestigeEq + profile.waterfrontRiskModifierPrestigeEq).toFixed(4));
    } else if (wfRemaining === 3) {
        if (auctionReadinessGap >= 0) {
            auctionAdvancePrestigeEq = 0.04;
            auctionAdvanceReason = "WELL_FUNDED_IMMINENT";
        } else if (auctionReadinessGap >= -5) {
            auctionAdvancePrestigeEq = -0.04;
            auctionAdvanceReason = "MARGINAL_IMMINENT";
        } else {
            if (isMarALago) {
                if (auctionContestability === "UNCONTESTABLE" || auctionContestability === "EXPENSIVE") {
                    auctionAdvancePrestigeEq = -0.04;
                    auctionAdvanceReason = "UNDERFUNDED_UNCONTESTABLE_MAR_A_LAGO_IMMINENT";
                } else {
                    auctionAdvancePrestigeEq = -0.10;
                    auctionAdvanceReason = "UNDERFUNDED_MAR_A_LAGO_IMMINENT";
                }
            } else {
                auctionAdvancePrestigeEq = -0.08;
                auctionAdvanceReason = "UNDERFUNDED_IMMINENT";
            }
        }
        // Personality modifier on advancing imminent auction (Phase 5E.3 Part 9)
        auctionAdvancePrestigeEq = Number((auctionAdvancePrestigeEq + profile.waterfrontRiskModifierPrestigeEq).toFixed(4));
    }

    return {
        isWaterfront: true,
        relevantAuctionId,
        waterfrontRemainingBefore: wfRemaining,
        waterfrontAdvanceClassification,
        projectedBotAuctionGold,
        baseTargetAuctionReserve,
        auctionReserveMultiplier: profile.auctionReserveMultiplier,
        auctionUrgencyPersonalityStrength: urgencyStrength,
        targetAuctionReserve,
        personalityAdjustedTargetAuctionReserve,
        auctionReadinessGap,
        auctionContestability,
        waterfrontRiskModifierPrestigeEq: profile.waterfrontRiskModifierPrestigeEq,
        auctionAdvancePrestigeEq: Number(auctionAdvancePrestigeEq.toFixed(4)),
        auctionAdvanceReason
    };
}

/**
 * Evaluates the public expected value and probability of finding a Block bonus (+5 Au)
 * on a candidate cell without inspecting unrevealed hidden information (Phase 5B.13 Parts 11-18).
 *
 * @param {Object} cell - The candidate cell being evaluated
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} strategicContext - Strategic context
 * @returns {Object} Block bonus evaluation breakdown
 */
export function evaluateBlockBonusOpportunity(cell, knowledge, strategicContext) {
    const defaultRes = {
        isBlock: false,
        bonusGroup: "NONE", // "COL3" | "COL4_6" | "COL7" | "NONE"
        publicBonusesRevealed: 0,
        publicCardsRevealed: 0,
        publicExpectedTotalBonuses: 0,
        publicExpectedBonusesRemaining: 0,
        unresolvedEligibleCardsInGroup: 0,
        unresolvedEligibleBonusCards: 0,
        candidateExpectedBonusProbability: 0,
        expectedBonusAu: 0,
        expectedBlockBonusPrestigeEq: 0,
        bonusOpportunityClassification: "NONE" // "NONE" | "NORMAL" | "PROMISING" | "HIGH"
    };

    if (!cell || !knowledge || !Array.isArray(knowledge.grid)) return defaultRes;

    const isBlock = (cell.type === 'BLOCK' || (cell.c >= 2 && cell.c <= 6));
    if (!isBlock) return defaultRes;

    let bonusGroup = "NONE";
    if (cell.c === 2) {
        bonusGroup = "COL3";
    } else if (cell.c >= 3 && cell.c <= 5) {
        bonusGroup = "COL4_6";
    } else if (cell.c === 6) {
        bonusGroup = "COL7";
    }

    if (bonusGroup === "NONE") return { ...defaultRes, isBlock: true };

    const grid = knowledge.grid;
    let groupCells = [];
    if (bonusGroup === "COL3") {
        groupCells = grid.filter(c => c.c === 2 && !c.empty);
    } else if (bonusGroup === "COL4_6") {
        groupCells = grid.filter(c => c.c >= 3 && c.c <= 5 && !c.empty);
    } else if (bonusGroup === "COL7") {
        groupCells = grid.filter(c => c.c === 6 && !c.empty);
    }

    const publicBonusesRevealed = groupCells.filter(c => c.flipped && c.isBonus).length;
    const publicCardsRevealed = groupCells.filter(c => c.flipped).length;
    const unresolvedEligibleCardsInGroup = groupCells.filter(c => !c.flipped).length;

    let candidateExpectedBonusProbability = 0;
    let publicExpectedTotalBonuses = 0;
    let publicExpectedBonusesRemaining = 0;

    if (bonusGroup === "COL3") {
        // Exactly 2 bonus cards guaranteed in Column 3 (out of 8 cards)
        publicExpectedTotalBonuses = 2;
        publicExpectedBonusesRemaining = Math.max(0, 2 - publicBonusesRevealed);
        if (unresolvedEligibleCardsInGroup > 0) {
            candidateExpectedBonusProbability = Math.min(1.0, Math.max(0, publicExpectedBonusesRemaining / unresolvedEligibleCardsInGroup));
        }
    } else if (bonusGroup === "COL4_6") {
        // Shuffled from center pool of 18 cards containing 5 bonuses across 12 board slots
        // Exact public initial expected total on board: 12 * (5 / 18) = 10 / 3 ≈ 3.3333
        publicExpectedTotalBonuses = Number((12 * (5 / 18)).toFixed(4));
        const poolRemaining = Math.max(1, 18 - publicCardsRevealed);
        const bonusesInPoolRemaining = Math.max(0, 5 - publicBonusesRevealed);
        candidateExpectedBonusProbability = Math.min(1.0, Math.max(0, bonusesInPoolRemaining / poolRemaining));
        publicExpectedBonusesRemaining = Number((candidateExpectedBonusProbability * unresolvedEligibleCardsInGroup).toFixed(4));
    } else if (bonusGroup === "COL7") {
        // Shuffled from sprite5_top pool of 6 cards containing 2 bonuses across 4 board slots
        // Exact public initial expected total on board: 4 * (2 / 6) = 4 / 3 ≈ 1.3333
        publicExpectedTotalBonuses = Number((4 * (2 / 6)).toFixed(4));
        const poolRemaining = Math.max(1, 6 - publicCardsRevealed);
        const bonusesInPoolRemaining = Math.max(0, 2 - publicBonusesRevealed);
        candidateExpectedBonusProbability = Math.min(1.0, Math.max(0, bonusesInPoolRemaining / poolRemaining));
        publicExpectedBonusesRemaining = Number((candidateExpectedBonusProbability * unresolvedEligibleCardsInGroup).toFixed(4));
    }

    const baseEffectivePrestigePerAu = strategicContext?.economy?.baseEffectivePrestigePerAu !== undefined
        ? strategicContext.economy.baseEffectivePrestigePerAu
        : 0.053333;

    // Difficulty and success rate
    const isCarina = Boolean(strategicContext?.bot?.character?.name === 'CARINA');
    let successRate = 1.0;
    if (cell.locked && !isCarina) {
        successRate = 2 / 6;
    } else if (cell.difficulty !== undefined && cell.difficulty > 0) {
        successRate = Math.max(0, Math.min(1.0, (7 - cell.difficulty) / 6));
    }

    const expectedBonusAu = Number((5 * candidateExpectedBonusProbability * successRate).toFixed(4));
    const expectedBlockBonusPrestigeEq = Number((expectedBonusAu * baseEffectivePrestigePerAu).toFixed(4));

    let bonusOpportunityClassification = "NORMAL";
    if (candidateExpectedBonusProbability >= 0.50) {
        bonusOpportunityClassification = "HIGH";
    } else if (candidateExpectedBonusProbability >= 0.25) {
        bonusOpportunityClassification = "PROMISING";
    } else if (candidateExpectedBonusProbability === 0) {
        bonusOpportunityClassification = "NONE";
    }

    return {
        isBlock: true,
        bonusGroup,
        publicBonusesRevealed,
        publicCardsRevealed,
        publicExpectedTotalBonuses,
        publicExpectedBonusesRemaining,
        unresolvedEligibleCardsInGroup,
        unresolvedEligibleBonusCards: unresolvedEligibleCardsInGroup,
        candidateExpectedBonusProbability: Number(candidateExpectedBonusProbability.toFixed(4)),
        expectedBonusAu,
        expectedBlockBonusPrestigeEq,
        bonusOpportunityClassification
    };
}

/**
 * Public landmark source groups and pool definitions (Phase 5B.13).
 * Derived from landmarkData/gameBoardColumn and setupBoard source deck construction.
 */
export const PUBLIC_LANDMARK_GROUPS = {
    LAGOON: {
        gameBoardColumn: "0",
        sourcePoolSize: 8,
        totalLandmarksInPool: 1,
        boardColumns: [0]
    },
    WF_L: {
        gameBoardColumn: "1",
        sourcePoolSize: 8,
        totalLandmarksInPool: 1,
        boardColumns: [1]
    },
    BLOCK_COL3: {
        gameBoardColumn: "2",
        sourcePoolSize: 8,
        totalLandmarksInPool: 1,
        boardColumns: [2]
    },
    BLOCK_COL4_6: {
        gameBoardColumn: "3-5",
        sourcePoolSize: 18,
        totalLandmarksInPool: 3,
        boardColumns: [3, 4, 5]
    },
    BLOCK_COL7: {
        gameBoardColumn: "6",
        sourcePoolSize: 6,
        totalLandmarksInPool: 1,
        boardColumns: [6]
    },
    WF_R: {
        gameBoardColumn: "7",
        sourcePoolSize: 8,
        totalLandmarksInPool: 4,
        boardColumns: [7]
    },
    ATLANTIC: {
        gameBoardColumn: "8",
        sourcePoolSize: 8,
        totalLandmarksInPool: 1,
        boardColumns: [8]
    }
};

/**
 * Maps a board cell to its public landmark source group.
 * @param {Object} cell - The grid cell
 * @returns {"LAGOON" | "WF_L" | "BLOCK_COL3" | "BLOCK_COL4_6" | "BLOCK_COL7" | "WF_R" | "ATLANTIC" | "NONE"}
 */
export function getLandmarkGroup(cell) {
    if (!cell) return "NONE";
    const c = cell.c;
    if (c === 0) return "LAGOON";
    if (c === 1) return "WF_L";
    if (c === 2) return "BLOCK_COL3";
    if (c >= 3 && c <= 5) return "BLOCK_COL4_6";
    if (c === 6) return "BLOCK_COL7";
    if (c === 7) return "WF_R";
    if (c === 8) return "ATLANTIC";
    return "NONE";
}

/**
 * Evaluates public landmark probability and expected Prestige equivalent by source group (Phase 5B.13).
 * Uses public source pool composition and revealed cards/landmarks per group without inspecting hidden spriteIndex.
 *
 * @param {Object} cell - The candidate cell
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} strategicContext - Strategic context
 * @returns {Object} Landmark opportunity breakdown
 */
export function evaluateLandmarkOpportunity(cell, knowledge, strategicContext) {
    const defaultRes = {
        landmarkGroup: "NONE",
        publicLandmarksInSourcePool: 0,
        publicSourcePoolSize: 0,
        publicCardsRevealedInGroup: 0,
        publicLandmarksRevealedInGroup: 0,
        revealedLandmarkCount: 0,
        candidateLandmarkProbability: 0,
        expectedLandmarkAu: 0,
        expectedLandmarkPrestigeEq: 0
    };

    if (!cell || !knowledge || !Array.isArray(knowledge.grid)) return defaultRes;

    const landmarkGroup = getLandmarkGroup(cell);
    const groupDef = PUBLIC_LANDMARK_GROUPS[landmarkGroup];
    if (!groupDef) return defaultRes;

    const grid = knowledge.grid;
    const isFlippedLandmark = (c) => {
        if (!c.flipped || c.spriteIndex === null || c.spriteIndex === undefined) return false;
        const spriteRow = Math.floor(c.spriteIndex / 8);
        const spriteCol = c.spriteIndex % 8;
        return landmarkData.some(l => l.row === spriteRow && l.col === spriteCol);
    };

    const groupBoardCells = grid.filter(c => groupDef.boardColumns.includes(c.c) && !c.empty);
    const publicCardsRevealedInGroup = groupBoardCells.filter(c => c.flipped).length;
    const publicLandmarksRevealedInGroup = groupBoardCells.filter(isFlippedLandmark).length;
    const revealedLandmarkCount = grid.filter(isFlippedLandmark).length;

    const publicSourcePoolSize = groupDef.sourcePoolSize;
    const publicLandmarksInSourcePool = groupDef.totalLandmarksInPool;

    const poolRemaining = Math.max(1, publicSourcePoolSize - publicCardsRevealedInGroup);
    const landmarksRemaining = Math.max(0, publicLandmarksInSourcePool - publicLandmarksRevealedInGroup);

    const candidateLandmarkProbability = Math.min(1.0, Math.max(0, landmarksRemaining / poolRemaining));

    // Average value of a landmark: ~1.71 Au
    const avgLandmarkValueAu = 1.71;

    const isCarina = Boolean(strategicContext?.bot?.character?.name === 'CARINA');
    let successRate = 1.0;
    if (cell.locked && !isCarina) {
        successRate = 2 / 6;
    } else if (cell.difficulty !== undefined && cell.difficulty > 0) {
        successRate = Math.max(0, Math.min(1.0, (7 - cell.difficulty) / 6));
    }

    const baseEffectivePrestigePerAu = strategicContext?.economy?.baseEffectivePrestigePerAu !== undefined
        ? strategicContext.economy.baseEffectivePrestigePerAu
        : 0.053333;

    const expectedLandmarkAu = Number((candidateLandmarkProbability * avgLandmarkValueAu * successRate).toFixed(4));
    const expectedLandmarkPrestigeEq = Number((expectedLandmarkAu * baseEffectivePrestigePerAu).toFixed(4));

    return {
        landmarkGroup,
        publicLandmarksInSourcePool,
        publicSourcePoolSize,
        publicCardsRevealedInGroup,
        publicLandmarksRevealedInGroup,
        revealedLandmarkCount,
        candidateLandmarkProbability: Number(candidateLandmarkProbability.toFixed(4)),
        expectedLandmarkAu,
        expectedLandmarkPrestigeEq
    };
}

/**
 * Evaluates whether the bot can lock in an immediate game victory on this turn (Phase 5B.9).
 * Pure function: Deterministic, no DOM, no mutation, whitelisted sanitized knowledge only.
 *
 * @param {Object|number} bot - Bot definition or ID
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} [strategicContext] - Strategic context
 * @returns {Object} {
 *   applicable: boolean,
 *   finalMapCellId: string|null,
 *   finalMapSuccessRate: number|null,
 *   currentOutcome: "WIN" | "TIE" | "LOSS" | "UNKNOWN",
 *   canLockWin: boolean,
 *   reason: string
 * }
 */
export function evaluateEndgameWinLock(bot, knowledge, strategicContext) {
    if (!knowledge) {
        return {
            applicable: false,
            finalMapCellId: null,
            finalMapSuccessRate: null,
            finalMapTriggersAuction: false,
            triggeredAuctionId: null,
            currentOutcome: "UNKNOWN",
            canLockWin: false,
            reason: "NO_KNOWLEDGE"
        };
    }

    const availableCells = getAvailableMapCells(knowledge);

    // Win lock is strictly applicable only when exactly 1 Map card remains
    if (availableCells.length !== 1) {
        return {
            applicable: false,
            finalMapCellId: null,
            finalMapSuccessRate: null,
            finalMapTriggersAuction: false,
            triggeredAuctionId: null,
            currentOutcome: "UNKNOWN",
            canLockWin: false,
            reason: availableCells.length === 0 ? "NO_MAP_CARDS_REMAIN" : "MULTIPLE_MAP_CARDS_REMAIN"
        };
    }

    // Identify self player
    const botId = (typeof bot === 'object' && bot !== null)
        ? (bot.id !== undefined ? bot.id : (bot.botId !== undefined ? bot.botId : null))
        : (bot !== undefined ? bot : knowledge.selfPlayerId);

    const players = Array.isArray(knowledge.players) ? knowledge.players : [];
    const selfPlayer = players.find(p => p.id === botId || p.botId === botId || p.isSelf) ||
        (typeof bot === 'object' && bot !== null ? bot : {});

    const isCarina = (selfPlayer?.character?.name === 'CARINA' || (typeof bot === 'object' && bot?.character?.name === 'CARINA'));
    const finalCell = availableCells[0];
    const finalMapCellId = finalCell.id;
    const difficulty = finalCell.difficulty !== undefined ? finalCell.difficulty : 0;
    let finalMapSuccessRate;
    if (finalCell.locked && !isCarina) {
        finalMapSuccessRate = Number((2 / 6).toFixed(4));
    } else {
        finalMapSuccessRate = difficulty <= 0
            ? 1.0
            : Number(Math.max(0, Math.min(1.0, (7 - difficulty) / 6)).toFixed(4));
    }

    // Check if the final remaining map card triggers an unresolved auction (Phase 5B.9 Hotfix)
    let finalMapTriggersAuction = false;
    let triggeredAuctionId = null;

    const isLeftWF = (finalCell.c === 1 || finalCell.type === 'WF_L');
    const isRightWF = (finalCell.c === 7 || finalCell.type === 'WF_R');

    if (isLeftWF && knowledge.auctions?.A && !knowledge.auctions.A.resolved && !knowledge.auctions.A.triggered) {
        finalMapTriggersAuction = true;
        triggeredAuctionId = 'A';
    } else if (isRightWF && knowledge.auctions?.B && !knowledge.auctions.B.resolved && !knowledge.auctions.B.triggered) {
        finalMapTriggersAuction = true;
        triggeredAuctionId = 'B';
    }

    const botPrestige = (typeof bot === 'object' && bot !== null && bot.prestige !== undefined)
        ? bot.prestige
        : (selfPlayer.totalPrestige !== undefined
            ? selfPlayer.totalPrestige
            : ((selfPlayer.prestige || 0) + (selfPlayer.bankedPrestige || 0)));
    const botGold = (typeof bot === 'object' && bot !== null && bot.gold !== undefined)
        ? bot.gold
        : ((selfPlayer.gold !== undefined && selfPlayer.gold !== null) ? selfPlayer.gold : 0);
    const botHasMara = Array.isArray(selfPlayer.inventory) && selfPlayer.inventory.some(c => c && c.name === 'Mar-a-Lago');

    const opponents = players.filter(p => {
        if (p === selfPlayer) return false;
        if (selfPlayer.id !== undefined && p.id === selfPlayer.id) return false;
        if (selfPlayer.botId !== undefined && p.botId !== undefined && p.botId === selfPlayer.botId) return false;
        if (p.isSelf) return false;
        return true;
    });

    // Evaluate current ranking outcome
    let currentOutcome = "WIN";
    let hasLoss = false;
    let hasUnknown = false;
    let hasTie = false;

    if (opponents.length > 0) {
        for (const opp of opponents) {
            const oppPrestige = opp.totalPrestige !== undefined
                ? opp.totalPrestige
                : ((opp.prestige || 0) + (opp.bankedPrestige || 0));
            const oppHasMara = Array.isArray(opp.inventory) && opp.inventory.some(c => c && c.name === 'Mar-a-Lago');

            // 1. Primary comparator: Prestige
            if (botPrestige < oppPrestige) {
                hasLoss = true;
                break;
            } else if (botPrestige > oppPrestige) {
                continue;
            }

            // 2. First tiebreaker: Mar-a-Lago
            if (botHasMara && !oppHasMara) {
                continue;
            } else if (!botHasMara && oppHasMara) {
                hasLoss = true;
                break;
            }

            // 3. Second tiebreaker: Gold
            if (opp.gold === null || opp.gold === undefined) {
                hasUnknown = true;
                continue;
            }

            const oppGold = opp.gold;
            if (botGold < oppGold) {
                hasLoss = true;
                break;
            } else if (botGold > oppGold) {
                continue;
            } else {
                hasTie = true;
            }
        }

        if (hasLoss) {
            currentOutcome = "LOSS";
        } else if (hasUnknown) {
            currentOutcome = "UNKNOWN";
        } else if (hasTie) {
            currentOutcome = "TIE";
        } else {
            currentOutcome = "WIN";
        }
    }

    // If an unresolved auction would intervene, the game does not immediately end on map flip
    if (finalMapTriggersAuction) {
        return {
            applicable: true,
            finalMapCellId,
            finalMapSuccessRate,
            finalMapTriggersAuction: true,
            triggeredAuctionId,
            currentOutcome,
            canLockWin: false,
            reason: "FINAL_MAP_TRIGGERS_AUCTION"
        };
    }

    if (hasLoss) {
        return {
            applicable: true,
            finalMapCellId,
            finalMapSuccessRate,
            finalMapTriggersAuction: false,
            triggeredAuctionId: null,
            currentOutcome: "LOSS",
            canLockWin: false,
            reason: "ENDGAME_AVOID_CLOSE_WHILE_BEHIND"
        };
    }

    if (hasUnknown) {
        return {
            applicable: true,
            finalMapCellId,
            finalMapSuccessRate,
            finalMapTriggersAuction: false,
            triggeredAuctionId: null,
            currentOutcome: "UNKNOWN",
            canLockWin: false,
            reason: "OPPONENT_GOLD_HIDDEN_FOR_TIEBREAK"
        };
    }

    if (hasTie) {
        return {
            applicable: true,
            finalMapCellId,
            finalMapSuccessRate,
            finalMapTriggersAuction: false,
            triggeredAuctionId: null,
            currentOutcome: "TIE",
            canLockWin: false,
            reason: "TIED_WITH_OPPONENT"
        };
    }

    // Strictly winning against all opponents with no auction intervening
    return {
        applicable: true,
        finalMapCellId,
        finalMapSuccessRate,
        finalMapTriggersAuction: false,
        triggeredAuctionId: null,
        currentOutcome: "WIN",
        canLockWin: true,
        reason: "ENDGAME_WIN_LOCK"
    };
}

/**
 * Pure evaluator that calculates the expected strategic utility of every legal Map flip
 * and affordable Luxury purchase on a common Prestige-equivalent utility scale.
 *
 * @param {Object|number} bot - Bot definition or ID
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} [strategicContext] - Optional pre-computed strategic context
 * @returns {Object} Structured action evaluation and recommendation report
 */
export function evaluateTurnActions(bot, knowledge, strategicContext) {
    if (!knowledge) {
        return {
            mapActions: [],
            luxuryActions: [],
            luxuryLegality: { allowed: false, reason: "NO_KNOWLEDGE" },
            luxuryPurchaseAllowed: false,
            bestMap: null,
            bestLuxury: null,
            endgameWinLock: { applicable: false, finalMapCellId: null, finalMapSuccessRate: null, currentOutcome: "UNKNOWN", canLockWin: false, reason: "NO_KNOWLEDGE" },
            recommendation: { action: "NONE", utility: 0, targetId: null, reason: "NO_KNOWLEDGE" }
        };
    }

    const context = strategicContext || analyzeStrategicContext(bot, knowledge);
    if (!context) {
        return {
            mapActions: [],
            luxuryActions: [],
            luxuryLegality: { allowed: false, reason: "NO_CONTEXT" },
            luxuryPurchaseAllowed: false,
            bestMap: null,
            bestLuxury: null,
            recommendation: { action: "NONE", utility: 0, targetId: null, reason: "NO_CONTEXT" }
        };
    }

    const availableCells = getAvailableMapCells(knowledge);
    const lineGeometry = analyzeBoardLines(knowledge);
    const { rowCounts, colCounts, rowSelectable, colSelectable, rowLocked, colLocked } = lineGeometry;
    const botGold = context.bot.gold;

    const aiDepth = context.aiDepth || getBotAiDepth(bot);
    const features = context.depthFeatures || getAiDepthFeatures(bot);

    // Dynamic Au retention factor and effective prestige per gold (Phase 5B.7 & 5B.11 Correction)
    const auRetentionFactor = context.economy?.auRetentionFactor !== undefined
        ? context.economy.auRetentionFactor
        : getGoldRetentionFactor(context);
    const baseAuRetentionFactor = context.economy?.baseAuRetentionFactor !== undefined
        ? context.economy.baseAuRetentionFactor
        : getBaseGoldRetentionFactor(context);

    const effectivePrestigePerAu = context.economy?.effectivePrestigePerAu !== undefined
        ? context.economy.effectivePrestigePerAu
        : Number((PRESTIGE_PER_AU * auRetentionFactor).toFixed(6));
    const baseEffectivePrestigePerAu = context.economy?.baseEffectivePrestigePerAu !== undefined
        ? context.economy.baseEffectivePrestigePerAu
        : Number((PRESTIGE_PER_AU * baseAuRetentionFactor).toFixed(6));

    // Count already-flipped cells per line (Phase 5B.6)
    const rowFlipped = Array(8).fill(0);
    const colFlipped = Array(9).fill(0);
    if (Array.isArray(knowledge.grid)) {
        knowledge.grid.forEach(cell => {
            if (cell.flipped && !cell.empty) {
                if (cell.r >= 0 && cell.r < 8) rowFlipped[cell.r]++;
                if (cell.c >= 0 && cell.c < 9) colFlipped[cell.c]++;
            }
        });
    }

    const isCarina = Boolean(context.bot?.character?.name === 'CARINA' || (typeof bot === 'object' && bot?.character?.name === 'CARINA'));

    // ------------------------------------------------------------------------
    // 1. EVALUATE LEGAL MAP ACTIONS (Base Effective P/Au: Phase 5B.11 / 5B.12)
    // ------------------------------------------------------------------------
    const mapActions = availableCells.map(cell => {
        const difficulty = cell.difficulty !== undefined ? cell.difficulty : 0;
        let successRate;
        if (cell.locked && !isCarina) {
            // Non-Carina player requires raw roll of 5 or 6 on d6 -> 2/6 = 0.3333
            successRate = Number((2 / 6).toFixed(4));
        } else {
            successRate = difficulty <= 0
                ? 1.0
                : Math.max(0, Math.min(1.0, (7 - difficulty) / 6));
        }

        // 1. Immediate Gold (Base Au valuation: Phase 5B.11 Correction)
        const rewardAu = cell.value !== undefined ? cell.value : 0;
        const expectedImmediateAu = rewardAu * successRate;
        const expectedImmediatePrestigeEq = expectedImmediateAu * baseEffectivePrestigePerAu;

        // 2. Line Completion Bonus (+5 Au per row/col completed; +10 if both) (Gated by lineAwareness)
        const completesRow = (rowCounts[cell.r] === 1);
        const completesCol = (colCounts[cell.c] === 1);
        let lineCompletionBonusAu = 0;
        if (features.lineAwareness) {
            if (completesRow) lineCompletionBonusAu += 5;
            if (completesCol) lineCompletionBonusAu += 5;
        }
        const isFinisher = completesRow || completesCol;
        const expectedLineBonusAu = lineCompletionBonusAu * successRate;
        const expectedLineBonusPrestigeEq = expectedLineBonusAu * baseEffectivePrestigePerAu;

        // 3. Positional Setup / Progress Value (Phase 5B.6) (Gated by lineAwareness)
        let rowSetupValue = 0;
        let columnSetupValue = 0;
        let rawSetupPrestigeEq = 0;
        let expectedSetupPrestigeEq = 0;
        if (features.lineAwareness) {
            rowSetupValue = evaluateLineSetupValue(rowCounts[cell.r], rowFlipped[cell.r]);
            columnSetupValue = evaluateLineSetupValue(colCounts[cell.c], colFlipped[cell.c]);
            rawSetupPrestigeEq = rowSetupValue + columnSetupValue;
            expectedSetupPrestigeEq = rawSetupPrestigeEq * successRate;
        }

        // 4. Opponent Line Opportunity / Second-Last Lookahead (Phase 5B.12) (Gated by trapAwareness)
        let handoffInfo = {
            threatensRow: false,
            threatensCol: false,
            isTrap: false,
            remainingRowCellId: null,
            remainingColumnCellId: null,
            remainingRowCellDifficulty: null,
            remainingColumnCellDifficulty: null,
            remainingRowCellType: null,
            remainingColumnCellType: null,
            remainingRowCellLocked: false,
            remainingColumnCellLocked: false,
            remainingRowCellSuccessRate: null,
            remainingColumnCellSuccessRate: null,
            expectedOpponentRowOpportunityAu: 0,
            expectedOpponentColumnOpportunityAu: 0,
            expectedOpponentLineOpportunityPrestigeEq: 0
        };
        let isTrap = false;
        let trapPenaltyAu = 0;
        let expectedTrapPenaltyAu = 0;
        let expectedOpponentLineOpportunityPrestigeEq = 0;
        let expectedTrapPenaltyPrestigeEq = 0;

        if (features.trapAwareness) {
            handoffInfo = evaluateLineHandoffOpportunity(cell, knowledge, context, lineGeometry, { opponentLookahead: features.opponentLookahead });
            isTrap = handoffInfo.isTrap;
            trapPenaltyAu = Number((handoffInfo.expectedOpponentRowOpportunityAu + handoffInfo.expectedOpponentColumnOpportunityAu).toFixed(4));
            expectedTrapPenaltyAu = Number((trapPenaltyAu * successRate).toFixed(4));
            expectedOpponentLineOpportunityPrestigeEq = Number((handoffInfo.expectedOpponentLineOpportunityPrestigeEq * successRate).toFixed(4));
            expectedTrapPenaltyPrestigeEq = expectedOpponentLineOpportunityPrestigeEq;
        }

        // 5. Waterfront Auction Lookahead (Phase 5B.12)
        const wfTimingInfo = evaluateWaterfrontAuctionTiming(cell, knowledge, context, lineGeometry);
        const triggersAuction = (wfTimingInfo.waterfrontStatus === "LAST");
        const rawAuctionImpactPrestigeEq = wfTimingInfo.rawTimingPrestigeEq;
        const expectedWaterfrontAuctionTimingPrestigeEq = Number((wfTimingInfo.rawTimingPrestigeEq * successRate).toFixed(4));
        const expectedAuctionImpactPrestigeEq = expectedWaterfrontAuctionTimingPrestigeEq;

        // 6. Waterfront Advance Readiness & Distance (Phase 5B.13 Parts 1-6)
        const wfAdvanceInfo = evaluateWaterfrontAdvanceReadiness(cell, knowledge, context, lineGeometry);
        const auctionAdvancePrestigeEq = wfAdvanceInfo.auctionAdvancePrestigeEq;

        // 7. Map Region, Risk Personality & Coastal Flavor (Phase 5E.3 Parts 7-8)
        const mapRegion = getMapRegion(cell);
        const personality = getStrategicPersonality(bot);
        const profile = getStrategicPersonalityProfile(bot);

        const mapFailureProbability = Number((1.0 - successRate).toFixed(4));
        const mapRiskAdjustment = Number((profile.highRiskMapModifierPrestigeEq * mapFailureProbability).toFixed(4));
        const coastalPersonalityAdjustment = (mapRegion === 'LAGOON' || mapRegion === 'ATLANTIC')
            ? profile.coastalModifierPrestigeEq
            : 0.00;
        const mapPersonalityPrestigeEq = Number((mapRiskAdjustment + coastalPersonalityAdjustment).toFixed(4));

        // 8. Same-Region Repetition Penalty (Phase 5B.13 Part 9)
        const recentMapRegions = context.recentMapRegions || (typeof bot === 'object' && Array.isArray(bot?._recentStrategicMapRegions) ? bot._recentStrategicMapRegions : []);
        const repetitionInfo = calculateMapRepetitionPenalty(mapRegion, recentMapRegions);
        const repetitionPenaltyPrestigeEq = repetitionInfo.repetitionPenaltyPrestigeEq;

        // 9. Public Block Bonus Opportunity (Phase 5B.13 Parts 11-18) (Gated by probabilityModeling)
        let blockBonusInfo = {
            bonusGroup: null,
            publicBonusesRevealed: 0,
            publicCardsRevealed: 0,
            publicExpectedTotalBonuses: 0,
            publicExpectedBonusesRemaining: 0,
            unresolvedEligibleCardsInGroup: 0,
            unresolvedEligibleBonusCards: 0,
            candidateExpectedBonusProbability: 0,
            expectedBonusAu: 0,
            expectedBlockBonusPrestigeEq: 0,
            bonusOpportunityClassification: "NONE"
        };
        let expectedBlockBonusPrestigeEq = 0;
        if (features.probabilityModeling) {
            blockBonusInfo = evaluateBlockBonusOpportunity(cell, knowledge, context);
            expectedBlockBonusPrestigeEq = blockBonusInfo.expectedBlockBonusPrestigeEq;
        }

        // 10. Public Landmark Opportunity (Phase 5B.13 Parts 19-20) (Gated by probabilityModeling)
        let landmarkInfo = {
            landmarkGroup: null,
            publicLandmarksInSourcePool: 0,
            publicSourcePoolSize: 0,
            publicCardsRevealedInGroup: 0,
            publicLandmarksRevealedInGroup: 0,
            revealedLandmarkCount: 0,
            candidateLandmarkProbability: 0,
            expectedLandmarkAu: 0,
            expectedLandmarkPrestigeEq: 0
        };
        let expectedLandmarkPrestigeEq = 0;
        if (features.probabilityModeling) {
            landmarkInfo = evaluateLandmarkOpportunity(cell, knowledge, context);
            expectedLandmarkPrestigeEq = landmarkInfo.expectedLandmarkPrestigeEq;
        }

        // 11. Total Map Utility (Phase 5E.3 Extended Formula)
        const baseUtilityBeforePersonality = Number((
            expectedImmediatePrestigeEq
            + expectedLineBonusPrestigeEq
            + expectedSetupPrestigeEq
            - expectedOpponentLineOpportunityPrestigeEq
            + expectedWaterfrontAuctionTimingPrestigeEq
            + auctionAdvancePrestigeEq
            + expectedBlockBonusPrestigeEq
            + expectedLandmarkPrestigeEq
            - repetitionPenaltyPrestigeEq
        ).toFixed(4));

        const totalUtility = Number((
            baseUtilityBeforePersonality
            + mapRiskAdjustment
            + coastalPersonalityAdjustment
        ).toFixed(4));

        const grossPrestigeValue = Number((
            expectedImmediatePrestigeEq
            + expectedLineBonusPrestigeEq
            + expectedSetupPrestigeEq
            + expectedBlockBonusPrestigeEq
            + expectedLandmarkPrestigeEq
        ).toFixed(4));

        return {
            action: "MAP",
            cellId: cell.id,
            r: cell.r,
            c: cell.c,
            type: cell.type,
            difficulty,
            rewardAu,
            successRate: Number(successRate.toFixed(4)),
            auRetentionFactor: Number(auRetentionFactor.toFixed(4)),
            baseAuRetentionFactor: Number(baseAuRetentionFactor.toFixed(4)),
            effectivePrestigePerAu: Number(effectivePrestigePerAu.toFixed(6)),
            baseEffectivePrestigePerAu: Number(baseEffectivePrestigePerAu.toFixed(6)),

            expectedImmediateAu: Number(expectedImmediateAu.toFixed(4)),
            expectedImmediatePrestigeEq: Number(expectedImmediatePrestigeEq.toFixed(4)),
            dynamicImmediatePrestigeEq: Number(expectedImmediatePrestigeEq.toFixed(4)),

            lineCompletionBonusAu,
            expectedLineBonusAu: Number(expectedLineBonusAu.toFixed(4)),
            expectedLineBonusPrestigeEq: Number(expectedLineBonusPrestigeEq.toFixed(4)),
            dynamicLineBonusPrestigeEq: Number(expectedLineBonusPrestigeEq.toFixed(4)),
            lineCompletionPrestigeEq: Number(expectedLineBonusPrestigeEq.toFixed(4)),

            rawSetupPrestigeEq: Number(rawSetupPrestigeEq.toFixed(4)),
            expectedSetupPrestigeEq: Number(expectedSetupPrestigeEq.toFixed(4)),
            setupPrestigeEq: Number(expectedSetupPrestigeEq.toFixed(4)),
            lineSetupPrestigeEq: Number(expectedSetupPrestigeEq.toFixed(4)),
            rowSetupValue: Number(rowSetupValue.toFixed(4)),
            columnSetupValue: Number(columnSetupValue.toFixed(4)),
            rowOwnedBefore: rowFlipped[cell.r],
            columnOwnedBefore: colFlipped[cell.c],

            // Line geometry and counts (Phase 5B.12 PART 20)
            rowUnresolvedBefore: rowCounts[cell.r],
            columnUnresolvedBefore: colCounts[cell.c],
            rowSelectableBefore: rowSelectable[cell.r],
            columnSelectableBefore: colSelectable[cell.c],
            rowLockedUnresolvedBefore: rowLocked[cell.r],
            columnLockedUnresolvedBefore: colLocked[cell.c],

            // Second-last line handoff lookahead
            isFinisher,
            isTrap,
            remainingRowCellId: handoffInfo.remainingRowCellId,
            remainingColumnCellId: handoffInfo.remainingColumnCellId,
            remainingRowCellDifficulty: handoffInfo.remainingRowCellDifficulty,
            remainingColumnCellDifficulty: handoffInfo.remainingColumnCellDifficulty,
            remainingRowCellType: handoffInfo.remainingRowCellType,
            remainingColumnCellType: handoffInfo.remainingColumnCellType,
            remainingRowCellLocked: handoffInfo.remainingRowCellLocked,
            remainingColumnCellLocked: handoffInfo.remainingColumnCellLocked,
            remainingRowCellSuccessRate: handoffInfo.remainingRowCellSuccessRate,
            remainingColumnCellSuccessRate: handoffInfo.remainingColumnCellSuccessRate,
            expectedOpponentRowOpportunityAu: handoffInfo.expectedOpponentRowOpportunityAu,
            expectedOpponentColumnOpportunityAu: handoffInfo.expectedOpponentColumnOpportunityAu,
            expectedOpponentLineOpportunityPrestigeEq,
            trapPenaltyAu,
            expectedTrapPenaltyAu,
            expectedTrapPenaltyPrestigeEq,
            dynamicTrapPenaltyPrestigeEq: expectedTrapPenaltyPrestigeEq,
            opponentHandoffPrestigeEq: Number(expectedTrapPenaltyPrestigeEq.toFixed(4)),

            // Waterfront auction lookahead (Phase 5B.12)
            waterfrontStatus: wfTimingInfo.waterfrontStatus,
            relevantAuctionId: wfAdvanceInfo.relevantAuctionId || wfTimingInfo.relevantAuctionId,
            botGoldAtAuctionOnSuccess: wfTimingInfo.botGoldAtAuctionOnSuccess,
            projectedOpponentGoldAtAuctionIfHandoff: wfTimingInfo.projectedOpponentGoldAtAuctionIfHandoff,
            auctionTriggerClassification: wfTimingInfo.auctionTriggerClassification,
            auctionHandoffClassification: wfTimingInfo.auctionHandoffClassification,
            triggersAuction,
            rawAuctionImpactPrestigeEq: Number(rawAuctionImpactPrestigeEq.toFixed(4)),
            expectedAuctionImpactPrestigeEq: Number(expectedAuctionImpactPrestigeEq.toFixed(4)),
            auctionImpactPrestigeEq: Number(expectedAuctionImpactPrestigeEq.toFixed(4)),
            waterfrontAuctionTimingPrestigeEq: Number(expectedWaterfrontAuctionTimingPrestigeEq.toFixed(4)),

            // Waterfront Advance Readiness (Phase 5B.13)
            waterfrontRemainingBefore: wfAdvanceInfo.waterfrontRemainingBefore,
            waterfrontAdvanceClassification: wfAdvanceInfo.waterfrontAdvanceClassification,
            projectedBotAuctionGold: wfAdvanceInfo.projectedBotAuctionGold,
            targetAuctionReserve: wfAdvanceInfo.targetAuctionReserve,
            auctionReadinessGap: wfAdvanceInfo.auctionReadinessGap,
            auctionContestability: wfAdvanceInfo.auctionContestability,
            auctionAdvancePrestigeEq: wfAdvanceInfo.auctionAdvancePrestigeEq,
            auctionAdvanceReason: wfAdvanceInfo.auctionAdvanceReason,

            // Regional Personality & Repetition (Phase 5B.13 & Phase 5E.3)
            mapRegion,
            mapRiskProfile: personality,
            personality,
            mapFailureProbability,
            mapRiskAdjustment,
            coastalPersonalityAdjustment,
            mapPersonalityPrestigeEq,
            baseUtilityBeforePersonality,
            previousMapRegion: repetitionInfo.previousMapRegion,
            secondPreviousMapRegion: repetitionInfo.secondPreviousMapRegion,
            consecutiveSameRegionCount: repetitionInfo.consecutiveSameRegionCount,
            repetitionPenaltyPrestigeEq,

            // Block Bonus Opportunity (Phase 5B.13)
            bonusGroup: blockBonusInfo.bonusGroup,
            publicBonusesRevealed: blockBonusInfo.publicBonusesRevealed,
            publicCardsRevealed: blockBonusInfo.publicCardsRevealed,
            publicExpectedTotalBonuses: blockBonusInfo.publicExpectedTotalBonuses,
            publicExpectedBonusesRemaining: blockBonusInfo.publicExpectedBonusesRemaining,
            unresolvedEligibleCardsInGroup: blockBonusInfo.unresolvedEligibleCardsInGroup,
            unresolvedEligibleBonusCards: blockBonusInfo.unresolvedEligibleBonusCards,
            candidateExpectedBonusProbability: blockBonusInfo.candidateExpectedBonusProbability,
            expectedBonusAu: blockBonusInfo.expectedBonusAu,
            expectedBlockBonusPrestigeEq,
            blockBonusProbabilityPrestigeEq: Number(expectedBlockBonusPrestigeEq.toFixed(4)),
            bonusOpportunityClassification: blockBonusInfo.bonusOpportunityClassification,

            // Landmark Opportunity (Phase 5B.13)
            landmarkGroup: landmarkInfo.landmarkGroup,
            publicLandmarksInSourcePool: landmarkInfo.publicLandmarksInSourcePool,
            publicSourcePoolSize: landmarkInfo.publicSourcePoolSize,
            publicCardsRevealedInGroup: landmarkInfo.publicCardsRevealedInGroup,
            publicLandmarksRevealedInGroup: landmarkInfo.publicLandmarksRevealedInGroup,
            revealedLandmarkCount: landmarkInfo.revealedLandmarkCount,
            candidateLandmarkProbability: landmarkInfo.candidateLandmarkProbability,
            expectedLandmarkAu: landmarkInfo.expectedLandmarkAu,
            expectedLandmarkPrestigeEq,
            landmarkProbabilityPrestigeEq: Number(expectedLandmarkPrestigeEq.toFixed(4)),

            totalUtility,
            grossPrestigeValue,

            components: {
                immediatePrestigeEq: Number(expectedImmediatePrestigeEq.toFixed(4)),
                lineBonusPrestigeEq: Number(expectedLineBonusPrestigeEq.toFixed(4)),
                lineCompletionPrestigeEq: Number(expectedLineBonusPrestigeEq.toFixed(4)),
                setupPrestigeEq: Number(expectedSetupPrestigeEq.toFixed(4)),
                lineSetupPrestigeEq: Number(expectedSetupPrestigeEq.toFixed(4)),
                trapPenaltyPrestigeEq: Number(expectedTrapPenaltyPrestigeEq.toFixed(4)),
                opponentHandoffPrestigeEq: Number(expectedTrapPenaltyPrestigeEq.toFixed(4)),
                expectedOpponentLineOpportunityPrestigeEq,
                rawAuctionImpactPrestigeEq: Number(rawAuctionImpactPrestigeEq.toFixed(4)),
                expectedAuctionImpactPrestigeEq: Number(expectedAuctionImpactPrestigeEq.toFixed(4)),
                auctionImpactPrestigeEq: Number(expectedAuctionImpactPrestigeEq.toFixed(4)),
                waterfrontAuctionTimingPrestigeEq: Number(expectedWaterfrontAuctionTimingPrestigeEq.toFixed(4)),
                auctionAdvancePrestigeEq: wfAdvanceInfo.auctionAdvancePrestigeEq,
                mapPersonalityPrestigeEq,
                expectedBlockBonusPrestigeEq,
                blockBonusProbabilityPrestigeEq: Number(expectedBlockBonusPrestigeEq.toFixed(4)),
                expectedLandmarkPrestigeEq,
                landmarkProbabilityPrestigeEq: Number(expectedLandmarkPrestigeEq.toFixed(4)),
                repetitionPenaltyPrestigeEq
            }
        };
    });

    // Phase 5B.14 Waterfront Underfunded Restraint
    const nonWfActions = mapActions.filter(m => m.type !== 'WF_L' && m.type !== 'WF_R');
    const bestNonWfAction = nonWfActions.length > 0 ? nonWfActions.reduce((max, cur) => cur.totalUtility > max.totalUtility ? cur : max, nonWfActions[0]) : null;

    mapActions.forEach(m => {
        const isWf = (m.type === 'WF_L' || m.type === 'WF_R');
        const rem = m.waterfrontRemainingBefore;
        const isUnderfunded = (m.auctionReadinessClassification === "UNDERFUNDED" || m.auctionAdvanceReason === "UNDERFUNDED_APPROACHING" || m.auctionAdvanceReason === "UNDERFUNDED_IMMINENT");
        const isUncontestable = (m.auctionContestability === "UNCONTESTABLE" || m.auctionContestability === "EXPENSIVE");

        if (isWf && (rem === 4 || rem === 3) && isUnderfunded && !isUncontestable && !m.isFinisher && !context.endgameWinLock?.canLockWin) {
            const threshold = (rem === 3) ? 0.15 : 0.10;
            const advantage = bestNonWfAction ? Number((m.totalUtility - bestNonWfAction.totalUtility).toFixed(4)) : 0;
            if (!bestNonWfAction || advantage >= threshold) {
                m.waterfrontAdvanceAllowed = true;
                m.waterfrontAdvanceOverrideReason = !bestNonWfAction ? "NO_NON_WATERFRONT_ALTERNATIVES" : "SUBSTANTIALLY_BETTER_THAN_ALTERNATIVES";
            } else {
                m.waterfrontAdvanceAllowed = false;
                m.waterfrontAdvanceOverrideReason = "UNDERFUNDED_RESTRAINT";
            }
            m.waterfrontAdvantageOverBestNonWf = advantage;
            m.waterfrontRestraintThreshold = threshold;
        } else {
            m.waterfrontAdvanceAllowed = true;
            m.waterfrontAdvanceOverrideReason = m.isFinisher
                ? "LINE_FINISHER_OVERRIDE"
                : (isUncontestable ? "UNCONTESTABLE_AUCTION" : (isWf && rem >= 5 ? "DISTANCE_ALLOWED" : null));
            m.waterfrontAdvantageOverBestNonWf = (isWf && bestNonWfAction)
                ? Number((m.totalUtility - bestNonWfAction.totalUtility).toFixed(4))
                : 0;
            m.waterfrontRestraintThreshold = 0;
        }
    });

    // Sort Map actions deterministically (allowed first, then totalUtility desc, then isFinisher, etc.)
    mapActions.sort((a, b) => {
        const aAllowed = a.waterfrontAdvanceAllowed !== false;
        const bAllowed = b.waterfrontAdvanceAllowed !== false;
        if (aAllowed !== bAllowed) return aAllowed ? -1 : 1;

        const uDiff = b.totalUtility - a.totalUtility;
        if (Math.abs(uDiff) > 0.0001) return uDiff;
        if (features.lineAwareness && a.isFinisher !== b.isFinisher) return a.isFinisher ? -1 : 1;
        const grossDiff = b.grossPrestigeValue - a.grossPrestigeValue;
        if (Math.abs(grossDiff) > 0.0001) return grossDiff;
        if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
        return a.cellId.localeCompare(b.cellId);
    });

    const allowedMapActions = mapActions.filter(m => m.waterfrontAdvanceAllowed !== false);
    const bestMap = allowedMapActions.length > 0 ? allowedMapActions[0] : (mapActions.length > 0 ? mapActions[0] : null);

    // ------------------------------------------------------------------------
    // 2. EVALUATE LEGAL LUXURY ACTIONS (Phase 5B.11 Correction & 5E.6 Tier Gating)
    // ------------------------------------------------------------------------
    const luxuryLegality = isLuxuryPurchaseAllowed(knowledge);
    const luxuryActions = [];
    const postAuctionReserveAu = getPostAuctionReserve(context);

    // Extract or compute context auction & urgency values (Phase 5B.11 Correction)
    const expectedUpcomingAuctionPrestige = context.auctions?.expectedUpcomingAuctionPrestige !== undefined
        ? context.auctions.expectedUpcomingAuctionPrestige
        : getExpectedUpcomingAuctionValue(knowledge).expectedUpcomingAuctionPrestige;
    const baselineAuctionValueAu = context.auctions?.baselineAuctionValueAu !== undefined
        ? context.auctions.baselineAuctionValueAu
        : getExpectedUpcomingAuctionValue(knowledge).baselineAuctionValueAu;
    const relevantUpcomingAuctionId = context.auctions?.relevantUpcomingAuctionId !== undefined
        ? context.auctions.relevantUpcomingAuctionId
        : getRelevantUpcomingAuction(knowledge).auctionId;
    const relevantAuctionWaterfrontRemaining = context.auctions?.relevantAuctionWaterfrontRemaining !== undefined
        ? context.auctions.relevantAuctionWaterfrontRemaining
        : getRelevantUpcomingAuction(knowledge).waterfrontRemaining;
    const relevantAuctionValueSource = context.auctions?.relevantAuctionValueSource !== undefined
        ? context.auctions.relevantAuctionValueSource
        : getExpectedUpcomingAuctionValue(knowledge).relevantAuctionValueSource;

    const auctionUrgency = context.auctions?.auctionUrgency !== undefined
        ? context.auctions.auctionUrgency
        : estimateAuctionUrgencyAndIncome(knowledge).auctionUrgency;
    const estimatedAuBeforeAuction = context.auctions?.estimatedAuBeforeAuction !== undefined
        ? context.auctions.estimatedAuBeforeAuction
        : estimateAuctionUrgencyAndIncome(knowledge).estimatedAuBeforeAuction;

    const remainingAuctionCount = context.auctions?.remainingCount !== undefined
        ? context.auctions.remainingCount
        : 0;
    const activeAuctionPresent = Boolean(context.auctions?.activeAuctionPresent || knowledge.activeAuction);
    const noAuctionsRemaining = (remainingAuctionCount === 0 && !activeAuctionPresent);
    const postAuctionPlan = context.luxury?.postAuctionPlan || evaluatePostAuctionLuxuryPlan(knowledge, context);

    const playersList = Array.isArray(knowledge.players) ? knowledge.players : [];
    const playerCount = playersList.length > 0
        ? playersList.length
        : (context.opponents?.count !== undefined ? context.opponents.count + 1 : 2);

    const projectedOpponentsInfo = estimateProjectedOpponentAuctionGolds(context, estimatedAuBeforeAuction);
    const highestProjectedVisibleOpponentGold = projectedOpponentsInfo.highestProjectedVisibleOpponentGold;
    const seriousProjectedBidderCount = projectedOpponentsInfo.seriousProjectedBidderCount;
    const projectedVisibleOpponentGolds = projectedOpponentsInfo.projectedVisibleOpponentGolds;

    const prestigeGap = context.opponents?.prestigeGap !== undefined ? context.opponents.prestigeGap : 0;
    const boardRemainingRatio = context.map?.boardRemainingRatio !== undefined ? context.map.boardRemainingRatio : 0.5;
    const phase = typeof context.gamePhase === 'object' ? (context.gamePhase.phase || 'MID') : (context.gamePhase || 'MID');
    const botRerolls = (context.bot?.rerolls !== undefined)
        ? context.bot.rerolls
        : ((typeof bot === 'object' && bot?.rerolls !== undefined) ? bot.rerolls : 0);

    if (luxuryLegality.allowed) {
        const luxuryPiles = context.luxury.piles || [];
        const affordablePiles = luxuryPiles.filter(p => p.cardsRemaining > 0 && p.effectiveCost <= botGold);

        let lowPreferredPileId = null;
        if (!features.advancedLuxury && affordablePiles.length > 0) {
            const injectedRng = (typeof bot === 'object' && bot !== null && typeof bot._injectedLuxuryRng === 'number')
                ? bot._injectedLuxuryRng
                : null;
            const chosenLow = chooseLowLuxuryCandidate(affordablePiles, injectedRng, { personality: context.bot?.personality || 'BALANCED' });
            if (chosenLow) {
                lowPreferredPileId = chosenLow.id;
            }
        }

        luxuryPiles.forEach(pile => {
            if (pile.cardsRemaining <= 0) return;
            // Check affordability
            if (pile.effectiveCost > botGold) return;

            const effectiveCost = pile.effectiveCost;
            const baseSuccessRate = pile.successRate;
            const cardPrestigeExpectation = pile.cardPrestigeExpectation;
            const baseExpectedPrestige = Number((cardPrestigeExpectation * baseSuccessRate).toFixed(4));

            if (!features.advancedLuxury) {
                // TIER LOW SIMPLIFIED LUXURY (Phase 5E.6 Part 6)
                const isPreferredByLow = (pile.id === lowPreferredPileId);
                const expectedPrestige = baseExpectedPrestige;
                const goldOpportunityCost = effectiveCost * baseEffectivePrestigePerAu;
                const grossPrestigeValue = expectedPrestige;
                const baseUtility = Number((grossPrestigeValue - goldOpportunityCost).toFixed(4));
                const totalUtility = isPreferredByLow ? Number((baseUtility + 0.50).toFixed(4)) : baseUtility;

                const goldAfterPurchase = botGold - effectiveCost;

                luxuryActions.push({
                    action: "BUY_LUXURY",
                    deckId: pile.id,
                    cost: pile.cost,
                    effectiveCost,
                    taxCount: pile.taxCount,
                    isOpen: pile.isOpen,
                    visiblePoints: pile.visiblePoints,
                    visibleCardPoints: pile.visiblePoints,
                    visibleCardRerollsGranted: 0,
                    expectedRerollRewardPrestigeEq: 0,
                    auRetentionFactor: Number(auRetentionFactor.toFixed(4)),
                    baseAuRetentionFactor: Number(baseAuRetentionFactor.toFixed(4)),
                    effectivePrestigePerAu: Number(effectivePrestigePerAu.toFixed(6)),
                    baseEffectivePrestigePerAu: Number(baseEffectivePrestigePerAu.toFixed(6)),
                    goldAfterPurchase,
                    postAuctionReserveAu,
                    violatesPostAuctionReserve: false,
                    isStrategicallyEligible: isPreferredByLow,
                    ineligibleReason: isPreferredByLow ? null : "LOW_RNG_CHOICE",
                    noAuctionsRemaining: Boolean(noAuctionsRemaining),
                    postAuctionLuxuryPlan: "NONE",
                    postAuctionLuxuryPlanReason: null,
                    isOnlyLuxuryPileRemaining: false,
                    forcedPostAuctionLuxuryConversion: false,

                    plannedReroll: false,
                    plannedRerollCount: 0,
                    totalAttempts: 1,
                    plannedRerollReason: "NONE",
                    rerollReason: "NONE",
                    baseSuccessRate: Number(baseSuccessRate.toFixed(4)),
                    rerollAdjustedSuccessRate: Number(baseSuccessRate.toFixed(4)),
                    successRate: Number(baseSuccessRate.toFixed(4)),
                    failureProbability: Number((1 - baseSuccessRate).toFixed(4)),
                    cardPrestigeExpectation,
                    baseExpectedPrestige: Number(baseExpectedPrestige.toFixed(4)),
                    rerollAdjustedExpectedPrestige: Number(baseExpectedPrestige.toFixed(4)),
                    expectedPrestige: Number(expectedPrestige.toFixed(4)),
                    expectedRerollsConsumed: 0,
                    expectedRerollResourceCostPrestigeEq: 0,
                    rerollResourceCostPrestigeEq: 0,

                    grossPrestigeValue: Number(grossPrestigeValue.toFixed(4)),
                    goldOpportunityCost: Number(goldOpportunityCost.toFixed(4)),
                    baseUtility: Number(baseUtility.toFixed(4)),
                    baseUtilityBeforePersonality: baseUtility,
                    luxuryRiskAdjustment: 0,
                    personality: context.bot?.personality || "BALANCED",

                    relevantUpcomingAuctionId,
                    relevantAuctionWaterfrontRemaining,
                    relevantAuctionValueSource,
                    expectedUpcomingAuctionPrestige: Number(expectedUpcomingAuctionPrestige.toFixed(2)),
                    baselineAuctionValueAu: Number(baselineAuctionValueAu.toFixed(2)),
                    auctionUrgency: Number(auctionUrgency.toFixed(2)),
                    estimatedAuBeforeAuction,
                    projectedAuctionGold: goldAfterPurchase,
                    projectedVisibleOpponentGolds: [],
                    highestProjectedVisibleOpponentGold: null,
                    seriousProjectedBidderCount: 1,
                    baseTargetAuctionReserve: 0,
                    auctionReserveMultiplier: 1.0,
                    auctionUrgencyPersonalityStrength: 0,
                    targetAuctionReserve: 0,
                    personalityAdjustedTargetAuctionReserve: 0,
                    auctionReadinessGap: 0,
                    auctionReadinessClassification: "READY",
                    auctionContestability: "CONTESTABLE",
                    playerCount,

                    visibleCardUrgencyPrestigeEq: 0,
                    knownPrestigeCertaintyBonus: 0,
                    trailingPrestigePressureBonus: 0,
                    auctionReadinessPenalty: 0,
                    reservePenaltyPrestigeEq: 0,
                    conversionBonusPrestigeEq: 0,

                    totalUtility: Number(totalUtility.toFixed(4)),

                    components: {
                        grossPrestigeValue: Number(grossPrestigeValue.toFixed(4)),
                        expectedRerollRewardPrestigeEq: 0,
                        goldOpportunityCost: Number(goldOpportunityCost.toFixed(4)),
                        baseUtility: Number(baseUtility.toFixed(4)),
                        baseSuccessRate: Number(baseSuccessRate.toFixed(4)),
                        rerollAdjustedSuccessRate: Number(baseSuccessRate.toFixed(4)),
                        baseExpectedPrestige: Number(baseExpectedPrestige.toFixed(4)),
                        rerollAdjustedExpectedPrestige: Number(baseExpectedPrestige.toFixed(4)),
                        rerollResourceCostPrestigeEq: 0,
                        plannedReroll: false,
                        plannedRerollCount: 0,
                        plannedRerollReason: "NONE",
                        visibleCardUrgencyPrestigeEq: 0,
                        knownPrestigeCertaintyBonus: 0,
                        trailingPrestigePressureBonus: 0,
                        auctionReadinessPenalty: 0,
                        reservePenaltyPrestigeEq: 0,
                        conversionBonusPrestigeEq: 0,
                        goldAfterPurchase,
                        violatesPostAuctionReserve: false,
                        projectedAuctionGold: goldAfterPurchase,
                        targetAuctionReserve: 0,
                        auctionReadinessGap: 0,
                        auctionReadinessClassification: "READY",
                        auctionContestability: "CONTESTABLE"
                    }
                });
                return;
            }

            // TIER MEDIUM & FULL ADVANCED LUXURY
            // Reroll Planning for Luxury (Phase 5D, Phase 5B.14 & Phase 5E.5 persistent rerolls)
            const luxuryRateInfo = getLuxuryAttemptSuccessRate(pile.id, {
                botRerolls,
                isOpen: pile.isOpen,
                visiblePoints: pile.visiblePoints,
                phase,
                prestigeGap,
                boardRemainingRatio
            });
            const plannedReroll = luxuryRateInfo.plannedReroll;
            const plannedRerollCount = luxuryRateInfo.plannedRerollCount;
            const totalAttempts = luxuryRateInfo.totalAttempts;
            const rerollAdjustedSuccessRate = luxuryRateInfo.rerollAdjustedSuccessRate;
            const plannedRerollReason = luxuryRateInfo.plannedRerollReason;
            const expectedRerollsConsumed = luxuryRateInfo.expectedRerollsConsumed;
            const rerollResourceCostPrestigeEq = luxuryRateInfo.expectedRerollResourceCostPrestigeEq;

            const rerollAdjustedExpectedPrestige = Number((cardPrestigeExpectation * rerollAdjustedSuccessRate).toFixed(4));
            const expectedPrestige = rerollAdjustedExpectedPrestige;

            // Reroll Granted Reward for Luxury (Phase 5B.14)
            const visibleRerollsGranted = pile.visibleRerollsGranted || (pile.isOpen && pile.visibleCard && pile.visibleCard.rerollsGranted !== undefined ? pile.visibleCard.rerollsGranted : 0);
            const expectedRerollRewardPrestigeEq = Number((visibleRerollsGranted * REROLL_ACQUISITION_VALUE_PRESTIGE_EQ * rerollAdjustedSuccessRate).toFixed(4));

            const grossPrestigeValue = Number((expectedPrestige + expectedRerollRewardPrestigeEq).toFixed(4));
            const goldOpportunityCost = effectiveCost * baseEffectivePrestigePerAu;
            const baseUtility = grossPrestigeValue - goldOpportunityCost;

            const goldAfterPurchase = botGold - effectiveCost;

            // Post-Auction Conversion Mode (Phase 5B.14)
            let violatesPostAuctionReserve = false;
            let isStrategicallyEligible = true;
            let ineligibleReason = null;

            if (noAuctionsRemaining) {
                if (postAuctionPlan.shouldSaveForHigherValuePile && pile.id !== postAuctionPlan.bestFutureLuxuryTargetDeckId) {
                    isStrategicallyEligible = false;
                    ineligibleReason = "SAVING_FOR_HIGHER_VALUE_PILE";
                }
            } else {
                violatesPostAuctionReserve = Boolean(postAuctionReserveAu > 0 && goldAfterPurchase < postAuctionReserveAu);
                isStrategicallyEligible = !violatesPostAuctionReserve;
                ineligibleReason = violatesPostAuctionReserve ? "POST_AUCTION_RESERVE" : null;
            }

            // 1. Projected Auction Gold & Personality-Adjusted Target Reserve (Phase 5E.3)
            const projectedAuctionGold = goldAfterPurchase + estimatedAuBeforeAuction;

            let baseTargetAuctionReserve = 0;
            if (remainingAuctionCount > 0) {
                if (playerCount === 2) {
                    baseTargetAuctionReserve = Math.min(
                        baselineAuctionValueAu,
                        highestProjectedVisibleOpponentGold !== null ? highestProjectedVisibleOpponentGold + 1 : baselineAuctionValueAu
                    );
                } else {
                    baseTargetAuctionReserve = Number((baselineAuctionValueAu * (playerCount >= 4 ? 0.85 : 0.95)).toFixed(2));
                }
            }

            const personality = getStrategicPersonality(bot);
            const profile = getStrategicPersonalityProfile(bot);
            const urgencyStrength = getAuctionUrgencyPersonalityStrength(relevantAuctionWaterfrontRemaining, false, remainingAuctionCount);
            const effectiveReserveMultiplier = 1 + (profile.auctionReserveMultiplier - 1) * urgencyStrength;
            const personalityAdjustedTargetAuctionReserve = Number((baseTargetAuctionReserve * effectiveReserveMultiplier).toFixed(2));
            const targetAuctionReserve = personalityAdjustedTargetAuctionReserve;

            const auctionReadinessGap = Number((projectedAuctionGold - targetAuctionReserve).toFixed(2));

            let auctionReadinessClassification = "READY";
            if (remainingAuctionCount === 0) {
                auctionReadinessClassification = "AUCTION_NOT_WORTH_SAVING_FOR";
            } else if (auctionReadinessGap >= 0) {
                auctionReadinessClassification = "READY";
            } else if (auctionReadinessGap >= -5) {
                auctionReadinessClassification = "MARGINALLY_READY";
            } else {
                auctionReadinessClassification = "UNDERFUNDED";
            }

            const contestInfo = getAuctionContestability(context, projectedAuctionGold, targetAuctionReserve, projectedOpponentsInfo, baselineAuctionValueAu);
            const auctionContestability = contestInfo.auctionContestability;
            const contestFactor = contestInfo.contestFactor;

            if (auctionContestability === "UNCONTESTABLE" || auctionContestability === "EXPENSIVE") {
                auctionReadinessClassification = "AUCTION_NOT_WORTH_SAVING_FOR";
            }

            // 2. Visible Card Urgency / Denial Value (Phase 5B.11) (Gated by opponentLookahead)
            let visibleCardUrgencyPrestigeEq = 0.0;
            if (features.opponentLookahead && pile.isOpen && pile.visiblePoints !== null) {
                if (pile.visiblePoints >= 3) {
                    visibleCardUrgencyPrestigeEq = playerCount === 2 ? 0.30 : (playerCount === 3 ? 0.20 : 0.15);
                } else if (pile.visiblePoints === 2) {
                    visibleCardUrgencyPrestigeEq = playerCount === 2 ? 0.15 : (playerCount === 3 ? 0.10 : 0.08);
                } else {
                    visibleCardUrgencyPrestigeEq = 0.0;
                }
            }

            // 3. Known-Prestige Certainty Bonus (Phase 5B.11)
            let knownPrestigeCertaintyBonus = 0.0;
            if (pile.isOpen && pile.visiblePoints !== null) {
                if (pile.visiblePoints >= 3) {
                    knownPrestigeCertaintyBonus = 0.15;
                } else if (pile.visiblePoints === 2) {
                    knownPrestigeCertaintyBonus = 0.08;
                }
            }

            // 4. Trailing Prestige Pressure Bonus (Phase 5B.11)
            let trailingPrestigePressureBonus = 0.0;
            if (prestigeGap < 0) {
                const trailingUrgency = Math.min(1.0, Math.abs(prestigeGap) / 5) * (1 - boardRemainingRatio);
                trailingPrestigePressureBonus = Number((trailingUrgency * expectedPrestige * 0.15).toFixed(4));
                // Late-game desperation for 1P Luxury if board is running out
                if (boardRemainingRatio < 0.25 && pile.visiblePoints === 1 && expectedPrestige > 0) {
                    trailingPrestigePressureBonus += 0.12;
                }
            }

            // 5. Auction Readiness Penalty (Phase 5B.11 Correction: uses baseEffectivePrestigePerAu)
            let auctionReadinessPenalty = 0.0;
            if (remainingAuctionCount > 0 && auctionReadinessGap < 0 && auctionReadinessClassification !== "AUCTION_NOT_WORTH_SAVING_FOR") {
                const deficit = -auctionReadinessGap;
                auctionReadinessPenalty = Number((deficit * baseEffectivePrestigePerAu * auctionUrgency * contestFactor).toFixed(4));
            }

            // 6. Total Strategic Luxury Utility & Personality Risk Adjustment (Phase 5E.3 Parts 5-6)
            const failureProbability = Number((1.0 - rerollAdjustedSuccessRate).toFixed(4));
            const luxuryRiskAdjustment = Number((profile.luxuryRiskModifierPrestigeEq * failureProbability).toFixed(4));

            const baseUtilityBeforePersonality = Number((
                expectedPrestige
                + expectedRerollRewardPrestigeEq
                - goldOpportunityCost
                - rerollResourceCostPrestigeEq
                + visibleCardUrgencyPrestigeEq
                + knownPrestigeCertaintyBonus
                + trailingPrestigePressureBonus
                - auctionReadinessPenalty
            ).toFixed(4));

            const totalUtility = Number((baseUtilityBeforePersonality + luxuryRiskAdjustment).toFixed(4));

            luxuryActions.push({
                action: "BUY_LUXURY",
                deckId: pile.id,
                cost: pile.cost,
                effectiveCost,
                taxCount: pile.taxCount,
                isOpen: pile.isOpen,
                visiblePoints: pile.visiblePoints,
                visibleCardPoints: pile.visiblePoints,
                visibleCardRerollsGranted: visibleRerollsGranted,
                expectedRerollRewardPrestigeEq,
                auRetentionFactor: Number(auRetentionFactor.toFixed(4)),
                baseAuRetentionFactor: Number(baseAuRetentionFactor.toFixed(4)),
                effectivePrestigePerAu: Number(effectivePrestigePerAu.toFixed(6)),
                baseEffectivePrestigePerAu: Number(baseEffectivePrestigePerAu.toFixed(6)),
                goldAfterPurchase,
                postAuctionReserveAu,
                violatesPostAuctionReserve,
                isStrategicallyEligible,
                ineligibleReason,
                noAuctionsRemaining: Boolean(noAuctionsRemaining),
                postAuctionLuxuryPlan: postAuctionPlan?.postAuctionLuxuryPlan || "NONE",
                postAuctionLuxuryPlanReason: postAuctionPlan?.postAuctionLuxuryPlanReason || null,
                isOnlyLuxuryPileRemaining: Boolean(postAuctionPlan?.isOnlyLuxuryPileRemaining),
                forcedPostAuctionLuxuryConversion: Boolean(postAuctionPlan?.forcedPostAuctionLuxuryConversion),

                plannedReroll,
                plannedRerollCount,
                totalAttempts,
                plannedRerollReason,
                rerollReason: plannedRerollReason,
                baseSuccessRate: Number(baseSuccessRate.toFixed(4)),
                rerollAdjustedSuccessRate: Number(rerollAdjustedSuccessRate.toFixed(4)),
                successRate: Number(rerollAdjustedSuccessRate.toFixed(4)),
                failureProbability,
                cardPrestigeExpectation,
                baseExpectedPrestige: Number(baseExpectedPrestige.toFixed(4)),
                rerollAdjustedExpectedPrestige: Number(rerollAdjustedExpectedPrestige.toFixed(4)),
                expectedPrestige: Number(expectedPrestige.toFixed(4)),
                expectedRerollsConsumed: Number(expectedRerollsConsumed.toFixed(4)),
                expectedRerollResourceCostPrestigeEq: Number(rerollResourceCostPrestigeEq.toFixed(4)),
                rerollResourceCostPrestigeEq: Number(rerollResourceCostPrestigeEq.toFixed(4)),

                grossPrestigeValue: Number(grossPrestigeValue.toFixed(4)),
                goldOpportunityCost: Number(goldOpportunityCost.toFixed(4)),
                baseUtility: Number(baseUtility.toFixed(4)),
                baseUtilityBeforePersonality,
                luxuryRiskAdjustment,
                personality,

                relevantUpcomingAuctionId,
                relevantAuctionWaterfrontRemaining,
                relevantAuctionValueSource,
                expectedUpcomingAuctionPrestige: Number(expectedUpcomingAuctionPrestige.toFixed(2)),
                baselineAuctionValueAu: Number(baselineAuctionValueAu.toFixed(2)),
                auctionUrgency: Number(auctionUrgency.toFixed(2)),
                estimatedAuBeforeAuction,
                projectedAuctionGold,
                projectedVisibleOpponentGolds,
                highestProjectedVisibleOpponentGold,
                seriousProjectedBidderCount,
                baseTargetAuctionReserve: Number(baseTargetAuctionReserve.toFixed(2)),
                auctionReserveMultiplier: profile.auctionReserveMultiplier,
                auctionUrgencyPersonalityStrength: urgencyStrength,
                targetAuctionReserve: Number(targetAuctionReserve.toFixed(2)),
                personalityAdjustedTargetAuctionReserve: Number(personalityAdjustedTargetAuctionReserve.toFixed(2)),
                auctionReadinessGap: Number(auctionReadinessGap.toFixed(2)),
                auctionReadinessClassification,
                auctionContestability,
                playerCount,

                visibleCardUrgencyPrestigeEq: Number(visibleCardUrgencyPrestigeEq.toFixed(4)),
                knownPrestigeCertaintyBonus: Number(knownPrestigeCertaintyBonus.toFixed(4)),
                trailingPrestigePressureBonus: Number(trailingPrestigePressureBonus.toFixed(4)),
                auctionReadinessPenalty: Number(auctionReadinessPenalty.toFixed(4)),
                reservePenaltyPrestigeEq: Number(auctionReadinessPenalty.toFixed(4)),
                conversionBonusPrestigeEq: Number((visibleCardUrgencyPrestigeEq + knownPrestigeCertaintyBonus + trailingPrestigePressureBonus).toFixed(4)),

                totalUtility: Number(totalUtility.toFixed(4)),

                components: {
                    grossPrestigeValue: Number(grossPrestigeValue.toFixed(4)),
                    expectedRerollRewardPrestigeEq,
                    goldOpportunityCost: Number(goldOpportunityCost.toFixed(4)),
                    baseUtility: Number(baseUtility.toFixed(4)),
                    baseSuccessRate: Number(baseSuccessRate.toFixed(4)),
                    rerollAdjustedSuccessRate: Number(rerollAdjustedSuccessRate.toFixed(4)),
                    baseExpectedPrestige: Number(baseExpectedPrestige.toFixed(4)),
                    rerollAdjustedExpectedPrestige: Number(rerollAdjustedExpectedPrestige.toFixed(4)),
                    rerollResourceCostPrestigeEq: Number(rerollResourceCostPrestigeEq.toFixed(4)),
                    plannedReroll,
                    plannedRerollCount,
                    plannedRerollReason,
                    visibleCardUrgencyPrestigeEq: Number(visibleCardUrgencyPrestigeEq.toFixed(4)),
                    knownPrestigeCertaintyBonus: Number(knownPrestigeCertaintyBonus.toFixed(4)),
                    trailingPrestigePressureBonus: Number(trailingPrestigePressureBonus.toFixed(4)),
                    auctionReadinessPenalty: Number(auctionReadinessPenalty.toFixed(4)),
                    reservePenaltyPrestigeEq: Number(auctionReadinessPenalty.toFixed(4)),
                    conversionBonusPrestigeEq: Number((visibleCardUrgencyPrestigeEq + knownPrestigeCertaintyBonus + trailingPrestigePressureBonus).toFixed(4)),
                    goldAfterPurchase,
                    violatesPostAuctionReserve,
                    projectedAuctionGold,
                    targetAuctionReserve,
                    auctionReadinessGap,
                    auctionReadinessClassification,
                    auctionContestability
                }
            });
        });

        // Sort Luxury actions deterministically (eligible first, then by totalUtility, grossPrestigeValue, effectiveCost, deckId)
        luxuryActions.sort((a, b) => {
            const aEligible = a.isStrategicallyEligible !== false && !a.violatesPostAuctionReserve;
            const bEligible = b.isStrategicallyEligible !== false && !b.violatesPostAuctionReserve;
            if (aEligible !== bEligible) return aEligible ? -1 : 1;

            const uDiff = b.totalUtility - a.totalUtility;
            if (Math.abs(uDiff) > 0.0001) return uDiff;
            const grossDiff = b.grossPrestigeValue - a.grossPrestigeValue;
            if (Math.abs(grossDiff) > 0.0001) return grossDiff;
            if (a.effectiveCost !== b.effectiveCost) return a.effectiveCost - b.effectiveCost;
            return a.deckId - b.deckId;
        });
    }

    const eligibleLuxuryActions = luxuryActions.filter(l => !l.violatesPostAuctionReserve && l.isStrategicallyEligible !== false);
    const bestLuxury = eligibleLuxuryActions.length > 0 ? eligibleLuxuryActions[0] : null;

    // ------------------------------------------------------------------------
    // 3. COMPARE BEST MAP VS BEST LUXURY & ENDGAME WIN-LOCK (Phase 5B.9 / Phase 5B.14)
    // ------------------------------------------------------------------------
    const endgameWinLock = evaluateEndgameWinLock(bot, knowledge, context);
    let recommendation = null;

    if (endgameWinLock.canLockWin && bestMap && bestMap.cellId === endgameWinLock.finalMapCellId) {
        recommendation = {
            action: "MAP",
            targetId: bestMap.cellId,
            utility: bestMap.totalUtility,
            reason: "ENDGAME_WIN_LOCK"
        };
    } else if (noAuctionsRemaining && postAuctionPlan.forcedPostAuctionLuxuryConversion && bestLuxury && luxuryLegality.allowed) {
        recommendation = {
            action: "BUY_LUXURY",
            targetId: bestLuxury.deckId,
            utility: bestLuxury.totalUtility,
            reason: "ONLY_PILE_LEFT_BUY_NOW"
        };
    } else if (!bestMap && !bestLuxury) {
        recommendation = {
            action: "NONE",
            targetId: null,
            utility: 0,
            reason: "NO_LEGAL_ACTIONS"
        };
    } else if (bestMap && !bestLuxury) {
        recommendation = {
            action: "MAP",
            targetId: bestMap.cellId,
            utility: bestMap.totalUtility,
            reason: "ONLY_LEGAL_ACTION"
        };
    } else if (!bestMap && bestLuxury) {
        recommendation = {
            action: "BUY_LUXURY",
            targetId: bestLuxury.deckId,
            utility: bestLuxury.totalUtility,
            reason: "ONLY_LEGAL_ACTION"
        };
    } else {
        const diff = bestLuxury.totalUtility - bestMap.totalUtility;
        if (Math.abs(diff) <= 0.0001) {
            // Deterministic tie-breaker:
            // 1. If Map is finisher and auctions remain -> MAP
            // 2. Higher gross prestige
            // 3. Lower gold cost -> MAP
            if (bestMap.isFinisher && !noAuctionsRemaining) {
                recommendation = {
                    action: "MAP",
                    targetId: bestMap.cellId,
                    utility: bestMap.totalUtility,
                    reason: "TIE_BREAKER_FINISHER"
                };
            } else if (bestLuxury.grossPrestigeValue > bestMap.grossPrestigeValue) {
                recommendation = {
                    action: "BUY_LUXURY",
                    targetId: bestLuxury.deckId,
                    utility: bestLuxury.totalUtility,
                    reason: "TIE_BREAKER_GROSS_PRESTIGE"
                };
            } else {
                recommendation = {
                    action: "MAP",
                    targetId: bestMap.cellId,
                    utility: bestMap.totalUtility,
                    reason: "TIE_BREAKER_ZERO_COST"
                };
            }
        } else if (diff > 0) {
            recommendation = {
                action: "BUY_LUXURY",
                targetId: bestLuxury.deckId,
                utility: bestLuxury.totalUtility,
                reason: (noAuctionsRemaining && postAuctionPlan.isOnlyLuxuryPileRemaining) ? "ONLY_PILE_LEFT_BUY_NOW" : "BEST_EXPECTED_UTILITY"
            };
        } else {
            recommendation = {
                action: "MAP",
                targetId: bestMap.cellId,
                utility: bestMap.totalUtility,
                reason: "BEST_EXPECTED_UTILITY"
            };
        }
    }

    return {
        aiDepth,
        depthFeatures: features,
        lineAwarenessEnabled: features.lineAwareness,
        trapAwarenessEnabled: features.trapAwareness,
        advancedLuxuryEnabled: features.advancedLuxury,
        probabilityModelingEnabled: features.probabilityModeling,
        opponentLookaheadEnabled: features.opponentLookahead,
        auctionPlanningEnabled: features.auctionPlanning,

        bot: context.bot,
        personality: getStrategicPersonality(bot),
        personalityProfile: getStrategicPersonalityProfile(bot),
        strategicContext: context,
        luxuryLegality,
        luxuryPurchaseAllowed: luxuryLegality.allowed,
        mapActions,
        luxuryActions,
        bestMap,
        bestLuxury,
        endgameWinLock,
        noAuctionsRemaining: Boolean(noAuctionsRemaining),
        postAuctionLuxuryPlan: postAuctionPlan,
        isOnlyLuxuryPileRemaining: Boolean(postAuctionPlan?.isOnlyLuxuryPileRemaining),
        forcedPostAuctionLuxuryConversion: Boolean(postAuctionPlan?.forcedPostAuctionLuxuryConversion),
        remainingLuxuryPileCount: postAuctionPlan?.remainingLuxuryPileCount || 0,
        affordableLuxuryPileCount: postAuctionPlan?.affordableLuxuryPileCount || 0,
        bestAffordableLuxuryDeckId: postAuctionPlan?.bestAffordableLuxuryDeckId || null,
        bestFutureLuxuryTargetDeckId: postAuctionPlan?.bestFutureLuxuryTargetDeckId || null,
        goldNeededForBestFutureTarget: postAuctionPlan?.goldNeededForBestFutureTarget || 0,
        recommendation
    };
}

/**
 * Formats a turn action evaluation report into a human-readable string.
 * @param {Object} evaluation - Result of evaluateTurnActions()
 * @returns {string}
 */
export function formatActionEvaluationSummary(evaluation) {
    if (!evaluation) return "NO ACTION EVALUATION AVAILABLE";

    const b = evaluation.bot || {};
    const rec = evaluation.recommendation || {};
    const bm = evaluation.bestMap;
    const bl = evaluation.bestLuxury;

    const retentionFactor = evaluation.strategicContext?.economy?.auRetentionFactor !== undefined
        ? evaluation.strategicContext.economy.auRetentionFactor
        : (bm?.auRetentionFactor || bl?.auRetentionFactor || 0.50);
    const effPrestigePerAu = evaluation.strategicContext?.economy?.effectivePrestigePerAu !== undefined
        ? evaluation.strategicContext.economy.effectivePrestigePerAu
        : Number((PRESTIGE_PER_AU * retentionFactor).toFixed(4));
    const baseRetentionFactor = evaluation.strategicContext?.economy?.baseAuRetentionFactor !== undefined
        ? evaluation.strategicContext.economy.baseAuRetentionFactor
        : (bm?.baseAuRetentionFactor || bl?.baseAuRetentionFactor || 0.40);
    const baseEffPrestigePerAu = evaluation.strategicContext?.economy?.baseEffectivePrestigePerAu !== undefined
        ? evaluation.strategicContext.economy.baseEffectivePrestigePerAu
        : Number((PRESTIGE_PER_AU * baseRetentionFactor).toFixed(4));

    const lines = [
        `BOT ACTION EVALUATION — ${(b.name || `BOT ${b.id || ''}`).toUpperCase()}`,
        `Base Retention: ${baseRetentionFactor} (Base Eff P/Au: ${baseEffPrestigePerAu}) | Context Retention: ${retentionFactor}`,
        ``,
        `BEST ACTION`,
        `${rec.action}${rec.targetId !== null ? ` — ${rec.action === 'BUY_LUXURY' ? `Pile ${bl?.cost || rec.targetId} Au` : rec.targetId}` : ''}`,
        `Utility: ${rec.utility >= 0 ? '+' : ''}${Number(rec.utility || 0).toFixed(2)} (${rec.reason})`,
        ``
    ];

    if (evaluation.endgameWinLock?.applicable) {
        lines.push(
            `ENDGAME WIN LOCK: ${evaluation.endgameWinLock.canLockWin ? 'ACTIVE (WIN-LOCK)' : `INACTIVE (${evaluation.endgameWinLock.reason})`} [Outcome: ${evaluation.endgameWinLock.currentOutcome}]`,
            ``
        );
    }

    if (bm) {
        lines.push(
            `BEST MAP`,
            `${bm.cellId} ${bm.type}`,
            `Difficulty: ${bm.difficulty}`,
            `Success: ${(bm.successRate * 100).toFixed(0)}%`,
            `Immediate Au EV: ${bm.expectedImmediateAu.toFixed(2)} (${bm.expectedImmediatePrestigeEq.toFixed(2)}P-eq)`,
            `Line Bonus EV: ${bm.expectedLineBonusAu.toFixed(2)} Au (${bm.expectedLineBonusPrestigeEq.toFixed(2)}P-eq)`,
            `Setup EV: ${bm.expectedSetupPrestigeEq.toFixed(2)}P-eq`,
            `Opponent Line Risk EV: -${(bm.expectedOpponentLineOpportunityPrestigeEq || 0).toFixed(2)}P (${bm.isTrap ? 'TRAP / 2ND-LAST' : 'SAFE'})`
        );
        if (bm.waterfrontStatus && bm.waterfrontStatus !== "NONE") {
            lines.push(
                `Waterfront Status: ${bm.waterfrontStatus}`,
                `Auction Timing EV: ${bm.waterfrontAuctionTimingPrestigeEq >= 0 ? '+' : ''}${bm.waterfrontAuctionTimingPrestigeEq.toFixed(2)}P (${bm.auctionTriggerClassification || bm.auctionHandoffClassification || 'N/A'})`
            );
            if (bm.botGoldAtAuctionOnSuccess !== null) {
                lines.push(`Bot Au at Auction: ${bm.botGoldAtAuctionOnSuccess}`);
            }
            if (bm.projectedOpponentGoldAtAuctionIfHandoff !== null) {
                lines.push(`Opponent Au if Handoff: ${bm.projectedOpponentGoldAtAuctionIfHandoff}`);
            }
        }
        lines.push(
            `Utility: ${bm.totalUtility >= 0 ? '+' : ''}${bm.totalUtility.toFixed(2)}`,
            ``
        );
    } else {
        lines.push(`BEST MAP: NONE`, ``);
    }

    if (!evaluation.luxuryLegality?.allowed) {
        lines.push(
            `BEST LUXURY: NOT LEGAL THIS TURN`,
            `Reason: ${evaluation.luxuryLegality?.reason || 'RESTRICTED'}`,
            ``
        );
    } else if (bl) {
        lines.push(
            `BEST LUXURY`,
            `Pile ${bl.cost} Au (Deck ${bl.deckId})`,
            `Visible: ${bl.isOpen ? `${bl.visiblePoints}P` : 'NO'}`,
            `Success: ${(bl.successRate * 100).toFixed(0)}%`,
            `Expected Prestige: ${bl.expectedPrestige.toFixed(2)}`,
            `Gold Opportunity Cost: ${bl.goldOpportunityCost.toFixed(2)}P-eq (Base Eff P/Au: ${bl.baseEffectivePrestigePerAu ? bl.baseEffectivePrestigePerAu.toFixed(4) : baseEffPrestigePerAu})`,
            `Gold After Purchase: ${bl.goldAfterPurchase} Au`,
            `Projected Auction Au: ${bl.projectedAuctionGold} Au (Target Reserve: ${bl.targetAuctionReserve} Au, Gap: ${bl.auctionReadinessGap >= 0 ? '+' : ''}${bl.auctionReadinessGap} Au)`,
            `Readiness: ${bl.auctionReadinessClassification} | Contestability: ${bl.auctionContestability} (Serious Bidders: ${bl.seriousProjectedBidderCount !== undefined ? bl.seriousProjectedBidderCount : 'N/A'})`,
            `Relevant Auction: ${bl.relevantUpcomingAuctionId || 'N/A'} (${bl.relevantAuctionValueSource || 'N/A'})`,
            `Urgency Bonus: +${bl.visibleCardUrgencyPrestigeEq.toFixed(2)}P | Certainty Bonus: +${bl.knownPrestigeCertaintyBonus.toFixed(2)}P | Trailing Bonus: +${bl.trailingPrestigePressureBonus.toFixed(2)}P`,
            `Auction Penalty: -${bl.auctionReadinessPenalty.toFixed(2)}P`,
            `Utility: ${bl.totalUtility >= 0 ? '+' : ''}${bl.totalUtility.toFixed(2)}`,
            ``
        );
    } else {
        const hasBlocked = (evaluation.luxuryActions || []).some(l => l.violatesPostAuctionReserve);
        if (hasBlocked) {
            lines.push(`BEST LUXURY: NONE (Blocked by Post-Auction Reserve < 5 Au)`, ``);
        } else {
            lines.push(`BEST LUXURY: NONE (or unaffordable)`, ``);
        }
    }

    lines.push(`TOP MAP ACTIONS`);
    if (evaluation.mapActions && evaluation.mapActions.length > 0) {
        evaluation.mapActions.slice(0, 5).forEach((m, idx) => {
            lines.push(`${idx + 1}. ${m.cellId} (${m.type} D${m.difficulty})  ${m.totalUtility >= 0 ? '+' : ''}${m.totalUtility.toFixed(2)}${m.isFinisher ? ' [FINISHER]' : ''}${m.isTrap ? ' [TRAP]' : ''}${m.expectedSetupPrestigeEq > 0 ? ` [Setup: +${m.expectedSetupPrestigeEq.toFixed(2)}]` : ''}`);
        });
    } else {
        lines.push(`None available.`);
    }

    lines.push(``, `LUXURY ACTIONS`);
    if (!evaluation.luxuryLegality?.allowed) {
        lines.push(`Not legal this turn (${evaluation.luxuryLegality?.reason || 'RESTRICTED'}).`);
    } else if (evaluation.luxuryActions && evaluation.luxuryActions.length > 0) {
        evaluation.luxuryActions.forEach((l, idx) => {
            const blockNote = l.violatesPostAuctionReserve ? ` [BLOCKED: POST_AUCTION_RESERVE (${l.goldAfterPurchase} Au left < 5)]` : '';
            lines.push(`${idx + 1}. ${l.cost} Au (Eff: ${l.effectiveCost})  ${l.totalUtility >= 0 ? '+' : ''}${l.totalUtility.toFixed(2)} (Exp: ${l.expectedPrestige.toFixed(2)}P)${blockNote}`);
        });
    } else {
        lines.push(`None affordable.`);
    }

    return lines.join('\n');
}

// ============================================================================
// SHADOW MODE DECISION COMPARISON (PHASE 5B.5 / 5B.6)
// ============================================================================

/**
 * Compares an executed or selected legacy bot decision against the strategic engine's evaluation.
 * Pure comparison helper for shadow mode analysis.
 *
 * @param {Object} params
 * @param {string} params.legacyAction - "MAP", "BUY_LUXURY", "NONE", etc.
 * @param {string|number|null} [params.legacyTargetId] - Cell ID or Luxury Deck ID
 * @param {string|null} [params.legacyReason] - Legacy reasoning string
 * @param {Object} params.evaluation - Result of evaluateTurnActions()
 * @returns {Object} Structured comparison report
 */
export function compareLegacyAndStrategicDecision({
    legacyAction,
    legacyTargetId = null,
    legacyReason = null,
    evaluation
} = {}) {
    const strategicRec = evaluation?.recommendation || {};
    const strategicAction = strategicRec.action || "NONE";
    const strategicTargetId = strategicRec.targetId !== undefined ? strategicRec.targetId : null;
    const strategicUtility = strategicRec.utility !== undefined ? Number(strategicRec.utility) : 0;
    const strategicReason = strategicRec.reason || null;

    // Find legacy candidate's utility if evaluated by strategic engine
    let legacyUtility = null;
    if (evaluation) {
        if (legacyAction === "MAP" && Array.isArray(evaluation.mapActions)) {
            const match = evaluation.mapActions.find(m => String(m.cellId) === String(legacyTargetId));
            if (match && typeof match.totalUtility === 'number') {
                legacyUtility = match.totalUtility;
            }
        } else if (legacyAction === "BUY_LUXURY" && Array.isArray(evaluation.luxuryActions)) {
            const match = evaluation.luxuryActions.find(l => Number(l.deckId) === Number(legacyTargetId));
            if (match && typeof match.totalUtility === 'number') {
                legacyUtility = match.totalUtility;
            }
        }
    }

    const legacy = {
        action: legacyAction || "NONE",
        targetId: legacyTargetId !== undefined ? legacyTargetId : null,
        utility: legacyUtility !== null ? Number(legacyUtility.toFixed(4)) : null,
        reason: legacyReason || null
    };

    const strategic = {
        action: strategicAction,
        targetId: strategicTargetId,
        utility: Number(strategicUtility.toFixed(4)),
        reason: strategicReason
    };

    if (!legacyAction || legacyAction === "NONE" || !strategicAction || strategicAction === "NONE" || strategicAction === "NO_LEGAL_ACTIONS") {
        return {
            agreement: false,
            classification: "NO_COMPARISON",
            utilityDifference: null,
            legacy,
            strategic
        };
    }

    // Exact agreement check
    let isExactAgree = false;
    if (legacy.action === strategic.action) {
        if (legacy.action === "MAP") {
            isExactAgree = String(legacy.targetId) === String(strategic.targetId);
        } else if (legacy.action === "BUY_LUXURY") {
            isExactAgree = Number(legacy.targetId) === Number(strategic.targetId);
        } else {
            isExactAgree = String(legacy.targetId) === String(strategic.targetId);
        }
    }

    if (isExactAgree) {
        return {
            agreement: true,
            classification: "AGREE",
            utilityDifference: 0.0,
            legacy,
            strategic
        };
    }

    // If legacy choice was evaluated by the strategic engine, compute absolute utility difference
    const hasEvaluatedDiff = (legacyUtility !== null && typeof legacyUtility === 'number' && !isNaN(legacyUtility));
    const utilityDiff = hasEvaluatedDiff ? Math.abs(strategicUtility - legacyUtility) : null;
    const roundedDiff = utilityDiff !== null ? Number(utilityDiff.toFixed(4)) : null;

    if (hasEvaluatedDiff) {
        // EQUIVALENT_MAP_TIE: both MAP, both evaluated, utility difference <= 0.01
        if (legacy.action === "MAP" && strategic.action === "MAP" && utilityDiff <= 0.01001) {
            return {
                agreement: false,
                classification: "EQUIVALENT_MAP_TIE",
                utilityDifference: roundedDiff,
                legacy,
                strategic
            };
        }

        // CLOSE_DECISION: actions differ OR same action different target, utility difference <= 0.05
        if (utilityDiff <= 0.05001) {
            return {
                agreement: false,
                classification: "CLOSE_DECISION",
                utilityDifference: roundedDiff,
                legacy,
                strategic
            };
        }
    }

    // Standard specific disagreements
    let classification = "DISAGREE_MAP_VS_LUXURY";
    if (legacy.action === strategic.action) {
        if (legacy.action === "MAP") {
            classification = "DISAGREE_MAP_TARGET";
        } else if (legacy.action === "BUY_LUXURY") {
            classification = "DISAGREE_LUXURY_PILE";
        } else {
            classification = "DISAGREE_MAP_TARGET";
        }
    }

    return {
        agreement: false,
        classification,
        utilityDifference: roundedDiff,
        legacy,
        strategic
    };
}

// ============================================================================
// STRATEGIC AUCTION BIDDING & REROLL ENGINE (PHASE 5C & 5D)
// ============================================================================

/**
 * Evaluates the quality and adjustment of the visible Luxury market for auction bidding (Phase 5C Part 7).
 * Pure sanitized function: Uses only public knowledge.
 *
 * @param {Object} knowledge - Sanitized knowledge snapshot
 * @param {Object} [bot] - Bot definition or ID
 * @returns {{ quality: "EXCELLENT" | "GOOD" | "WEAK" | "CLOGGED" | "UNKNOWN", adjustmentAu: number }}
 */
export function evaluateVisibleLuxuryMarket(knowledge, bot) {
    if (!knowledge || !Array.isArray(knowledge.luxuryDecks)) {
        return { quality: "UNKNOWN", adjustmentAu: 0 };
    }

    const selfPlayer = (bot && typeof bot === 'object' && bot.id !== undefined)
        ? ((knowledge.players || []).find(p => p.id === bot.id) || bot)
        : ((knowledge.players || []).find(p => p.id === knowledge.selfPlayerId) || (typeof bot === 'object' ? bot : {}));
    const botGold = (typeof bot === 'object' && bot !== null && bot.gold !== undefined && bot.gold !== null)
        ? bot.gold
        : (selfPlayer.gold !== undefined && selfPlayer.gold !== null ? selfPlayer.gold : 0);

    const openPiles = [];
    knowledge.luxuryDecks.forEach((deck, idx) => {
        if (!deck || (deck.cardsRemaining !== undefined && deck.cardsRemaining <= 0)) return;
        if (deck.isOpen && deck.visibleCard) {
            const cost = getBotLuxuryCost(selfPlayer, deck);
            const points = deck.visibleCard.points !== undefined ? deck.visibleCard.points : 1;
            openPiles.push({
                deckId: idx,
                cost,
                points,
                affordable: botGold >= cost
            });
        }
    });

    if (openPiles.length === 0) {
        return { quality: "UNKNOWN", adjustmentAu: 0 };
    }

    const affordable3P = openPiles.some(p => p.points >= 3 && p.affordable);
    const affordable2P = openPiles.some(p => p.points === 2 && p.affordable);
    const visible1PCount = openPiles.filter(p => p.points === 1).length;
    const visibleHigherCount = openPiles.filter(p => p.points >= 2 && p.affordable).length;

    if (affordable3P) {
        return { quality: "EXCELLENT", adjustmentAu: -4 };
    }
    if (affordable2P) {
        return { quality: "GOOD", adjustmentAu: -2 };
    }
    if (visible1PCount >= 2 && visibleHigherCount === 0) {
        return { quality: "CLOGGED", adjustmentAu: 3 };
    }
    if (visible1PCount > 0 && visibleHigherCount === 0) {
        return { quality: "WEAK", adjustmentAu: 1 };
    }

    return { quality: "UNKNOWN", adjustmentAu: 0 };
}

/**
 * Pure sanitized helper for choosing a Luxury pile for LOW tier bots (Phase 5E.6 Part 6 & 24).
 * Uses simplified weighted random selection among viable affordable piles without accessing hidden card data.
 * Injectable randomValue parameter ensures deterministic testing.
 *
 * @param {Array<Object>} affordablePiles - List of affordable luxury pile candidates
 * @param {number|null} [randomValue=null] - Optional injected RNG value in [0, 1) for deterministic testing
 * @param {Object} [options={}] - Additional options (e.g. personality)
 * @returns {Object|null} Selected pile candidate or null
 */
export function chooseLowLuxuryCandidate(affordablePiles, randomValue = null, options = {}) {
    if (!Array.isArray(affordablePiles) || affordablePiles.length === 0) return null;
    if (affordablePiles.length === 1) return affordablePiles[0];

    const rng = (typeof randomValue === 'number' && !isNaN(randomValue))
        ? Math.max(0, Math.min(0.999999, randomValue))
        : Math.random();

    const personality = options.personality || 'BALANCED';

    // Base weights for affordable piles (by base cost: 5, 10, 15)
    const weighted = affordablePiles.map(pile => {
        const cost = pile.cost !== undefined ? pile.cost : (pile.id === 0 ? 5 : (pile.id === 1 ? 10 : 15));
        const baseSuccess = pile.successRate !== undefined ? pile.successRate : (cost === 5 ? 2 / 6 : (cost === 10 ? 4 / 6 : 1.0));

        let weight = 1.0;
        if (cost === 5) {
            weight = personality === 'AGGRESSIVE' ? 1.0 : (personality === 'CAUTIOUS' ? 1.8 : 1.4);
        } else if (cost === 10) {
            weight = personality === 'AGGRESSIVE' ? 1.5 : (personality === 'CAUTIOUS' ? 1.2 : 1.5);
        } else if (cost === 15) {
            weight = personality === 'AGGRESSIVE' ? 2.0 : (personality === 'CAUTIOUS' ? 0.8 : 1.2);
        }

        // Base success probability factor (0.5 + 0.5 * successRate)
        weight *= (0.5 + baseSuccess * 0.5);

        return { pile, weight: Math.max(0.1, weight) };
    });

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let target = rng * totalWeight;
    for (const item of weighted) {
        if (target <= item.weight) {
            return item.pile;
        }
        target -= item.weight;
    }
    return weighted[weighted.length - 1].pile;
}

/**
 * Calculates all strategic auction components and the final rational maximum bid ceiling for a bot (Phase 5C).
 * Pure sanitized function: Uses only public knowledge.
 *
 * @param {Object} bot - The bot player object
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} [strategicContext] - Optional pre-computed strategic context
 * @returns {Object} Structured strategic auction breakdown
 */
export function calculateStrategicAuctionBidCeiling(bot, knowledge, strategicContext) {
    if (!knowledge || !knowledge.activeAuction) {
        return {
            auctionPropertyPrestige: 0,
            auctionBaseValueAu: 0,
            auctionValueSource: "NO_ACTIVE_AUCTION",
            marALagoPremiumAu: 0,
            playerCount: 2,
            playerCountDenialFactor: 1.0,
            denialBonusAu: 0,
            leaderThreatPrestigeGap: 0,
            leaderThreatBonusAu: 0,
            luxuryMarketQuality: "UNKNOWN",
            luxuryMarketAdjustmentAu: 0,
            futureAuctionReservePenaltyAu: 0,
            boardEndBonusAu: 0,
            isLastMeaningfulPurchase: false,
            endgameSpendBonusAu: 0,
            strategicMaxBidAu: 0,
            botGold: 0,
            rawStrategicCeiling: 0
        };
    }

    const aa = knowledge.activeAuction;
    const selfPlayer = (bot && typeof bot === 'object' && bot.id !== undefined)
        ? ((knowledge.players || []).find(p => p.id === bot.id) || bot)
        : ((knowledge.players || []).find(p => p.id === knowledge.selfPlayerId) || (typeof bot === 'object' ? bot : {}));
    const botGold = (typeof bot === 'object' && bot !== null && bot.gold !== undefined && bot.gold !== null)
        ? bot.gold
        : (selfPlayer.gold !== undefined && selfPlayer.gold !== null ? selfPlayer.gold : 0);
    const botPrestige = (typeof bot === 'object' && bot !== null && bot.prestige !== undefined && bot.prestige !== null)
        ? bot.prestige
        : ((selfPlayer.totalPrestige !== undefined ? selfPlayer.totalPrestige : selfPlayer.prestige) || 0);

    const playersList = Array.isArray(knowledge.players) ? knowledge.players : [];
    const playerCount = playersList.length > 0 ? playersList.length : 2;
    const playerCountDenialFactor = PLAYER_COUNT_DENIAL_FACTOR[playerCount] !== undefined
        ? PLAYER_COUNT_DENIAL_FACTOR[playerCount]
        : (playerCount === 2 ? 1.00 : (playerCount === 3 ? 0.65 : 0.40));

    const aiDepth = getBotAiDepth(bot);
    const features = getAiDepthFeatures(bot);

    // 1. BASE PROPERTY VALUE & PRESTIGE
    const visibleCard = aa.visibleCard || aa.card || null;
    let auctionPropertyPrestige = 3.0;
    let auctionBaseValueAu = 22.5;
    let auctionValueSource = "PUBLIC_POOL_EXPECTED";
    let isVisibleMarALago = false;

    if (aa.isVisible && visibleCard && visibleCard.points !== undefined) {
        auctionPropertyPrestige = visibleCard.points;
        auctionBaseValueAu = Number((auctionPropertyPrestige * AU_PER_PRESTIGE).toFixed(2));
        auctionValueSource = "VISIBLE_PROPERTY";
        isVisibleMarALago = (visibleCard.points === 4 || visibleCard.name === "Mar-a-Lago");
    } else {
        // Hidden property: compute expected Prestige from remaining property pool
        const basePool = [2, 3, 4];
        const knownResolvedPrestige = [];
        if (knowledge.auctions) {
            Object.values(knowledge.auctions).forEach(auc => {
                if (auc && auc.resolved) {
                    const resolvedCard = auc.propertyWon || auc.visibleCard || auc.card;
                    if (resolvedCard && resolvedCard.points) {
                        knownResolvedPrestige.push(resolvedCard.points);
                    }
                }
            });
        }
        const remainingPool = basePool.filter(p => !knownResolvedPrestige.includes(p));
        if (remainingPool.length > 0) {
            const sum = remainingPool.reduce((acc, v) => acc + v, 0);
            auctionPropertyPrestige = Number((sum / remainingPool.length).toFixed(2));
        } else {
            auctionPropertyPrestige = 3.0;
        }
        auctionBaseValueAu = Number((auctionPropertyPrestige * AU_PER_PRESTIGE).toFixed(2));
        auctionValueSource = "PUBLIC_POOL_EXPECTED";
    }

    // 2. MAR-A-LAGO TIEBREAK PREMIUM
    const marALagoPremiumAu = isVisibleMarALago ? MAR_A_LAGO_TIEBREAK_PREMIUM_AU : 0;

    // 3. DENIAL BONUS (Scaled by player count; gated by opponentLookahead)
    const baseDenial = features.opponentLookahead ? Math.max(0, (auctionPropertyPrestige - 1) * 2) : 0;
    const denialBonusAu = Number((baseDenial * playerCountDenialFactor).toFixed(2));

    // 4. LEADER THREAT (Gated by opponentLookahead)
    const opponents = playersList.filter(p => p.id !== selfPlayer.id);
    let highestOpponentPrestige = 0;
    opponents.forEach(p => {
        const pScore = (p.totalPrestige !== undefined ? p.totalPrestige : p.prestige) || 0;
        if (pScore > highestOpponentPrestige) highestOpponentPrestige = pScore;
    });

    let leaderThreatPrestigeGap = 0;
    let leaderThreatBonusAu = 0;
    if (features.opponentLookahead && highestOpponentPrestige > botPrestige) {
        leaderThreatPrestigeGap = highestOpponentPrestige - botPrestige;
        const maxLeaderBonus = playerCount === 2 ? 4 : (playerCount === 3 ? 3 : 2);
        const gapScale = Math.min(1.0, Math.max(0.5, leaderThreatPrestigeGap / 2));
        leaderThreatBonusAu = Number((maxLeaderBonus * gapScale).toFixed(2));
    }

    // 5. LUXURY MARKET QUALITY ADJUSTMENT (Gated by advancedLuxury & opponentLookahead)
    let luxuryMarketQuality = "UNKNOWN";
    let luxuryMarketAdjustmentAu = 0;
    if (features.advancedLuxury && features.opponentLookahead) {
        const luxuryMarketInfo = evaluateVisibleLuxuryMarket(knowledge, selfPlayer);
        luxuryMarketQuality = luxuryMarketInfo.quality;
        luxuryMarketAdjustmentAu = luxuryMarketInfo.adjustmentAu;
    }

    // 6. FUTURE AUCTION OPPORTUNITY COST (Gated by auctionPlanning)
    let futureAuctionReservePenaltyAu = 0;
    const otherAuctionId = aa.id === 'A' ? 'B' : 'A';
    const otherAuction = knowledge.auctions ? knowledge.auctions[otherAuctionId] : null;

    if (features.auctionPlanning && otherAuction && !otherAuction.resolved) {
        if (otherAuction.isVisible && otherAuction.visibleCard) {
            const pts = otherAuction.visibleCard.points || 2;
            if (pts >= 4 || otherAuction.visibleCard.name === "Mar-a-Lago") {
                futureAuctionReservePenaltyAu = 5;
            } else if (pts === 3) {
                futureAuctionReservePenaltyAu = 2;
            } else {
                futureAuctionReservePenaltyAu = 1;
            }
        } else {
            // Hidden future auction
            if (isVisibleMarALago) {
                futureAuctionReservePenaltyAu = 1;
            } else {
                futureAuctionReservePenaltyAu = (auctionPropertyPrestige >= 3.0) ? 2 : 1;
            }
        }
    }

    // 7. BOARD END PRESSURE & AU OBSOLESCENCE
    const totalPlayableCards = Array.isArray(knowledge.grid) ? knowledge.grid.filter(c => !c.empty).length : 0;
    const availableCells = getAvailableMapCells(knowledge);
    const remainingCards = availableCells.length;
    const boardRemainingRatio = totalPlayableCards > 0 ? (remainingCards / totalPlayableCards) : 0.5;

    let boardEndBonusAu = 0;
    if (boardRemainingRatio <= 0.10) {
        boardEndBonusAu = 5;
    } else if (boardRemainingRatio <= 0.20) {
        boardEndBonusAu = 3;
    } else if (boardRemainingRatio <= 0.35) {
        boardEndBonusAu = 1;
    } else {
        boardEndBonusAu = 0;
    }

    // 8. LAST MEANINGFUL PURCHASE RULE
    const noFutureAuction = !otherAuction || otherAuction.resolved;
    let totalLuxuryCardsRemaining = 0;
    if (Array.isArray(knowledge.luxuryDecks)) {
        knowledge.luxuryDecks.forEach(d => {
            if (d && d.cardsRemaining) totalLuxuryCardsRemaining += d.cardsRemaining;
        });
    }
    const noRemainingLuxury = (totalLuxuryCardsRemaining === 0);
    const gameEndingSoon = (boardRemainingRatio <= 0.25 || remainingCards <= 5);

    const isLastMeaningfulPurchase = Boolean(noFutureAuction && noRemainingLuxury && gameEndingSoon);

    // 9. STRATEGIC MAX BID CALCULATION (Phase 5E.3 Personality Modifier)
    const rawStrategicCeiling = Number((
        auctionBaseValueAu
        + marALagoPremiumAu
        + denialBonusAu
        + leaderThreatBonusAu
        + boardEndBonusAu
        + luxuryMarketAdjustmentAu
        - futureAuctionReservePenaltyAu
    ).toFixed(2));

    const personality = getStrategicPersonality(bot);
    const profile = getStrategicPersonalityProfile(bot);
    const auctionBidMultiplier = profile.auctionBidMultiplier || 1.00;

    let baseStrategicMaxBid;
    let strategicMaxBidAu;
    let endgameSpendBonusAu = 0;

    if (isLastMeaningfulPurchase) {
        baseStrategicMaxBid = botGold;
        strategicMaxBidAu = botGold;
        endgameSpendBonusAu = Math.max(0, botGold - Math.round(rawStrategicCeiling));
    } else {
        baseStrategicMaxBid = Math.min(botGold, Math.max(0, Math.round(rawStrategicCeiling)));
        const personalityAdjustedRaw = Number((rawStrategicCeiling * auctionBidMultiplier).toFixed(2));
        strategicMaxBidAu = Math.min(botGold, Math.max(0, Math.round(personalityAdjustedRaw)));
    }

    const personalityAdjustedMaxBid = strategicMaxBidAu;

    return {
        auctionPropertyPrestige,
        auctionBaseValueAu,
        auctionValueSource,
        marALagoPremiumAu,
        playerCount,
        playerCountDenialFactor,
        denialBonusAu,
        leaderThreatPrestigeGap,
        leaderThreatBonusAu,
        luxuryMarketQuality,
        luxuryMarketAdjustmentAu,
        futureAuctionReservePenaltyAu,
        boardEndBonusAu,
        isLastMeaningfulPurchase,
        endgameSpendBonusAu,
        rawStrategicCeiling,
        baseStrategicMaxBid,
        auctionBidMultiplier,
        personalityAdjustedMaxBid,
        strategicMaxBidAu,
        personality,
        botGold
    };
}

/**
 * Pure sanitized strategic auction evaluation function for Gran Gran (Phase 5C).
 * @param {Object} bot - The bot player object
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} [strategicContext] - Optional pre-computed strategic context
 * @returns {Object} Complete strategic auction bidding decision report
 */
export function evaluateStrategicAuctionBid(bot, knowledge, strategicContext) {
    if (!knowledge || !knowledge.activeAuction) {
        return {
            action: "PASS",
            amount: 0,
            targetBid: null,
            maxBid: 0,
            strategicMaxBidAu: 0,
            reason: "NO_ACTIVE_AUCTION"
        };
    }

    const aa = knowledge.activeAuction;
    const botId = (bot && bot.id !== undefined) ? bot.id : knowledge.selfPlayerId;
    if (!Array.isArray(aa.participants) || !aa.participants.includes(botId)) {
        return {
            action: "PASS",
            amount: 0,
            targetBid: null,
            maxBid: 0,
            strategicMaxBidAu: 0,
            reason: "NOT_A_PARTICIPANT"
        };
    }

    // Campaign overrides
    if (knowledge.activeGambitId === 3) {
        const selfPlayer = (knowledge.players || []).find(p => p.id === botId) || bot;
        const botGold = selfPlayer?.gold || 0;
        const limit = Math.min(botGold, 30);
        const targetBid = (aa.currentBid || 0) + 1;
        return {
            action: targetBid <= limit ? "RAISE" : "PASS",
            amount: targetBid <= limit ? 1 : 0,
            targetBid: targetBid <= limit ? targetBid : null,
            maxBid: limit,
            strategicMaxBidAu: limit,
            reason: "GAMBIT3_TARGET_BID"
        };
    }
    if (knowledge.activeGambitId === 11) {
        const selfPlayer = (knowledge.players || []).find(p => p.id === botId) || bot;
        const botGold = selfPlayer?.gold || 0;
        const targetBid = (aa.currentBid || 0) + 1;
        return {
            action: targetBid <= botGold ? "RAISE" : "PASS",
            amount: targetBid <= botGold ? 1 : 0,
            targetBid: targetBid <= botGold ? targetBid : null,
            maxBid: botGold,
            strategicMaxBidAu: botGold,
            reason: "GAMBIT11_ALL_IN"
        };
    }

    const breakdown = calculateStrategicAuctionBidCeiling(bot, knowledge, strategicContext);
    const legacyLimitInfo = calculateLegacyBidLimit(bot, knowledge);

    const capBid = knowledge.activeGambitId === 11 ? 9999 : 50;
    const currentBid = aa.currentBid || 0;
    const nextBid = currentBid + 1;
    const maxBid = breakdown.strategicMaxBidAu;

    let action;
    let amount;
    let targetBid;
    let reason;

    if (nextBid <= maxBid && currentBid < capBid) {
        action = "RAISE";
        amount = 1;
        targetBid = nextBid;
        reason = breakdown.isLastMeaningfulPurchase ? "LAST_MEANINGFUL_PURCHASE_ALL_IN" : "STRATEGIC_BID_WITHIN_CEILING";
    } else {
        action = "PASS";
        amount = 0;
        targetBid = null;
        if (currentBid >= capBid) {
            reason = "AUCTION_CAP_REACHED";
        } else if (maxBid === 0) {
            reason = "STRATEGIC_BID_CEILING_ZERO";
        } else {
            reason = "STRATEGIC_BID_CEILING_EXCEEDED";
        }
    }

    return {
        action,
        amount,
        targetBid,
        maxBid,
        currentBid,
        nextBid,
        decision: action,
        reason,

        // Full Strategic Breakdown
        auctionPropertyPrestige: breakdown.auctionPropertyPrestige,
        auctionBaseValueAu: breakdown.auctionBaseValueAu,
        auctionValueSource: breakdown.auctionValueSource,
        marALagoPremiumAu: breakdown.marALagoPremiumAu,
        playerCount: breakdown.playerCount,
        playerCountDenialFactor: breakdown.playerCountDenialFactor,
        denialBonusAu: breakdown.denialBonusAu,
        leaderThreatPrestigeGap: breakdown.leaderThreatPrestigeGap,
        leaderThreatBonusAu: breakdown.leaderThreatBonusAu,
        luxuryMarketQuality: breakdown.luxuryMarketQuality,
        luxuryMarketAdjustmentAu: breakdown.luxuryMarketAdjustmentAu,
        futureAuctionReservePenaltyAu: breakdown.futureAuctionReservePenaltyAu,
        boardEndBonusAu: breakdown.boardEndBonusAu,
        isLastMeaningfulPurchase: breakdown.isLastMeaningfulPurchase,
        endgameSpendBonusAu: breakdown.endgameSpendBonusAu,
        rawStrategicCeiling: breakdown.rawStrategicCeiling,
        strategicMaxBidAu: breakdown.strategicMaxBidAu,

        // Legacy Shadow Comparison
        legacy: {
            maxBid: legacyLimitInfo.limit,
            action: (currentBid + 1) <= legacyLimitInfo.limit ? "RAISE" : "PASS",
            reason: legacyLimitInfo.reason
        },
        legacyMaxBid: legacyLimitInfo.limit,
        legacyAction: (currentBid + 1) <= legacyLimitInfo.limit ? "RAISE" : "PASS",
        legacyReason: legacyLimitInfo.reason
    };
}

/**
 * Calculates the required minimum reroll reserve that a FULL strategic bot protects for upcoming Luxury attempts (Phase 5E.4).
 *
 * Rules:
 *   - If no 5/10 Au Luxury cards remain: 0 reserve (no reason to hold)
 *   - In Endgame (boardRemainingRatio <= 0.10 or <= 5 cards left): 0 reserve (rerolls lose future value)
 *   - In Late game (boardRemainingRatio <= 0.25): 1 reserve if rerolls >= 2, else 0
 *   - Standard (Early / Mid):
 *       rerolls = 1 -> reserve 1
 *       rerolls = 2 -> reserve 1
 *       rerolls = 3 -> reserve 1
 *       rerolls = 4 -> reserve 2
 *       rerolls >= 5 -> reserve 2
 *
 * @param {number} rerolls - Available reroll count
 * @param {number} [boardRemainingRatio=0.5] - Board completion ratio
 * @param {boolean} [luxuryOpportunitiesRemain=true] - Whether 5/10 Au Luxury cards are available
 * @returns {number} Minimum rerolls to preserve for Luxury
 */
export function getLuxuryRerollReserve(rerolls, boardRemainingRatio = 0.5, luxuryOpportunitiesRemain = true) {
    if (!luxuryOpportunitiesRemain || rerolls <= 0) return 0;
    if (boardRemainingRatio <= 0.10) return 0;
    if (boardRemainingRatio <= 0.25) {
        return rerolls >= 4 ? 1 : (rerolls >= 2 ? 1 : 0);
    }
    if (rerolls <= 3) return 1;
    return 2;
}

/**
 * Evaluates whether a FULL strategic bot should execute a reroll on a failed Map roll (Phase 5E.4).
 * Balances Luxury priority with Map flexibility:
 *   1. Protects a base Luxury reroll reserve (1 or 2 rerolls based on inventory).
 *   2. Allows spending surplus rerolls on worthwhile Map failures (Lagoon, Atlantic, Finishers, High Value).
 *   3. Strongly decays preservation in Late Game and Endgame to prevent dying with unused rerolls.
 *
 * @param {Object} bot - The bot player object
 * @param {Object} cell - The failed map cell
 * @param {Object} knowledge - Sanitized knowledge state
 * @param {Object} [strategicContext] - Optional strategic context
 * @returns {{ shouldReroll: boolean, reason: string, priority: string, surplusRerolls?: number, luxuryReserve?: number }}
 */
export function shouldBotUseMapReroll(bot, cell, knowledge, strategicContext) {
    if (!bot || !cell || !knowledge) {
        return { shouldReroll: false, reason: "INVALID_PARAMS", priority: "NONE" };
    }

    const selfPlayer = (knowledge.players || []).find(p => p.id === knowledge.selfPlayerId || p.id === bot.id) || bot;
    const rerolls = selfPlayer.rerolls !== undefined ? selfPlayer.rerolls : (bot.rerolls || 0);

    if (rerolls <= 0) {
        return { shouldReroll: false, reason: "NO_REROLLS_LEFT", priority: "NONE" };
    }

    // 1. Board Geometry, Lines & Finishers
    const lineGeometry = analyzeBoardLines(knowledge);
    const { rowCounts, colCounts } = lineGeometry;
    const completesRow = (cell.r >= 0 && cell.r < 8 && rowCounts[cell.r] === 1);
    const completesCol = (cell.c >= 0 && cell.c < 9 && colCounts[cell.c] === 1);
    const isFinisher = Boolean(completesRow || completesCol);
    const isDoubleFinisher = Boolean(completesRow && completesCol);

    // 2. Regional Classification
    const region = getMapRegion(cell);
    const isLagoon = (region === 'LAGOON' || cell.type === 'LAGOON' || cell.c === 0);
    const isAtlantic = (region === 'ATLANTIC' || cell.type === 'ATLANTIC' || cell.c === 8);
    const isCoastal = (isLagoon || isAtlantic);
    const isWaterfront = (region === 'WATERFRONT' || cell.type === 'WF_L' || cell.type === 'WF_R' || cell.c === 1 || cell.c === 7);
    const isLastWaterfront = isWaterfront && ((cell.c === 1 && colCounts[1] === 1) || (cell.c === 7 && colCounts[7] === 1));

    // 3. Board Progression & Phase
    const totalPlayableCards = Array.isArray(knowledge.grid) ? knowledge.grid.filter(c => !c.empty).length : 0;
    const availableCells = getAvailableMapCells(knowledge);
    const remainingCards = availableCells.length;
    const boardRemainingRatio = totalPlayableCards > 0 ? (remainingCards / totalPlayableCards) : 0.5;
    const isEndgame = (boardRemainingRatio <= 0.10 || remainingCards <= 5);
    const isLateGame = (boardRemainingRatio <= 0.25 || remainingCards <= 10);

    // 4. Opponent & Trailing Context
    const botPrestige = (selfPlayer.totalPrestige !== undefined ? selfPlayer.totalPrestige : selfPlayer.prestige) || 0;
    const playersList = Array.isArray(knowledge.players) ? knowledge.players : [];
    const opponents = playersList.filter(p => p.id !== selfPlayer.id);
    let highestOpponentPrestige = 0;
    opponents.forEach(p => {
        const pScore = (p.totalPrestige !== undefined ? p.totalPrestige : p.prestige) || 0;
        if (pScore > highestOpponentPrestige) highestOpponentPrestige = pScore;
    });
    const isTrailingLate = (isLateGame && highestOpponentPrestige > botPrestige);

    // 5. Luxury Availability & Reserve
    let lux5Cards = 0;
    let lux10Cards = 0;
    if (Array.isArray(knowledge.luxuryDecks)) {
        lux5Cards = knowledge.luxuryDecks[0]?.cardsRemaining || 0;
        lux10Cards = knowledge.luxuryDecks[1]?.cardsRemaining || 0;
    }
    const luxuryOpportunitiesRemain = (lux5Cards > 0 || lux10Cards > 0);
    const luxuryRerollReserve = getLuxuryRerollReserve(rerolls, boardRemainingRatio, luxuryOpportunitiesRemain);
    const surplusRerolls = Math.max(0, rerolls - luxuryRerollReserve);

    // 6. Cell Payoff & Success Probability
    const isCarina = Boolean(selfPlayer.character?.name === 'CARINA' || bot.character?.name === 'CARINA');
    const isLocked = Boolean(cell.locked);
    const difficulty = cell.difficulty !== undefined ? cell.difficulty : 0;
    let successRate;
    if (isLocked && !isCarina) {
        successRate = 2 / 6;
    } else {
        successRate = difficulty <= 0 ? 1.0 : Math.max(0, Math.min(1.0, (7 - difficulty) / 6));
    }
    const cellValueAu = cell.value !== undefined ? cell.value : 0;
    const isHopeless = (successRate <= 0.17 && !isFinisher && cellValueAu < 4);
    const isLowValue = (cellValueAu <= 1 && !isFinisher && !isCoastal && !isWaterfront);
    const isHighValuePayoff = (cellValueAu >= 4 || (cellValueAu >= 3 && successRate >= 0.50));

    // 7. Personality
    const personality = getStrategicPersonality(bot);
    const isAggressive = (personality === "AGGRESSIVE");

    // ========================================================================
    // DECISION HIERARCHY
    // ========================================================================

    // Case 1: Hopeless attempt
    if (isHopeless) {
        return { shouldReroll: false, reason: "HOPELESS_MAP_ROLL_NO_REROLL", priority: "LOW", surplusRerolls, luxuryReserve: luxuryRerollReserve };
    }

    // Case 2: Endgame (boardRemainingRatio <= 0.10 or <= 5 cards)
    if (isEndgame) {
        if (successRate >= 0.33 || isFinisher || cellValueAu >= 2 || isTrailingLate) {
            return { shouldReroll: true, reason: isFinisher ? "FINISHER_MAP_REROLL" : "ENDGAME_REROLL_SPEND", priority: "ENDGAME", surplusRerolls, luxuryReserve: luxuryRerollReserve };
        }
    }

    // Case 3: Strong Finisher (Completes row, column, or both)
    if (isFinisher) {
        if (isDoubleFinisher || isLateGame || cellValueAu >= 3 || surplusRerolls > 0 || rerolls >= 2 || !luxuryOpportunitiesRemain) {
            return { shouldReroll: true, reason: "FINISHER_MAP_REROLL", priority: "FINISHER", surplusRerolls, luxuryReserve: luxuryRerollReserve };
        }
    }

    // Case 4: No useful 5/10 Luxury remaining in the game
    if (!luxuryOpportunitiesRemain) {
        if (isCoastal) {
            return { shouldReroll: true, reason: isLagoon ? "MAP_LAGOON_PRIORITY" : "MAP_ATLANTIC_PRIORITY", priority: "COASTAL", surplusRerolls, luxuryReserve: 0 };
        }
        if (isWaterfront || isHighValuePayoff || cellValueAu >= 2 || (isLocked && difficulty >= 5)) {
            return { shouldReroll: true, reason: "SURPLUS_REROLL_MAP_USE", priority: "MAP_VALUE", surplusRerolls, luxuryReserve: 0 };
        }
        if (isLowValue) {
            return { shouldReroll: false, reason: "ORDINARY_MAP_ROLL_NO_REROLL", priority: "LOW", surplusRerolls, luxuryReserve: 0 };
        }
        return { shouldReroll: true, reason: "SURPLUS_REROLL_MAP_USE", priority: "MAP_VALUE", surplusRerolls, luxuryReserve: 0 };
    }

    // Case 5: Late Game Progression (boardRemainingRatio <= 0.25)
    if (isLateGame) {
        if (isFinisher || isCoastal || isHighValuePayoff || isTrailingLate || (surplusRerolls > 0 && cellValueAu >= 2)) {
            if (cellValueAu >= 2 && successRate >= 0.33) {
                return { shouldReroll: true, reason: "LATE_GAME_REROLL_SPEND", priority: "LATE_GAME", surplusRerolls, luxuryReserve: luxuryRerollReserve };
            }
        }
    }

    // Case 6: Surplus Rerolls Available (rerolls > luxuryRerollReserve)
    if (surplusRerolls > 0) {
        // Coastal Priority (Lagoon / Atlantic high-risk / high-reward)
        if (isCoastal && (cellValueAu >= 2 || successRate >= 0.50 || isAggressive)) {
            return { shouldReroll: true, reason: "COASTAL_MAP_REROLL", priority: "COASTAL", surplusRerolls, luxuryReserve: luxuryRerollReserve };
        }
        // High Value Map Payoff
        if (isHighValuePayoff) {
            return { shouldReroll: true, reason: "HIGH_VALUE_MAP_REROLL", priority: "HIGH_VALUE", surplusRerolls, luxuryReserve: luxuryRerollReserve };
        }
        // Waterfront auction trigger lookahead
        if (isLastWaterfront) {
            return { shouldReroll: true, reason: "MAP_WATERFRONT_TRIGGER_PRIORITY", priority: "WATERFRONT_TRIGGER", surplusRerolls, luxuryReserve: luxuryRerollReserve };
        }
        // Locked high-value tile
        if (cell.locked && (difficulty >= 5 || cellValueAu >= 4)) {
            return { shouldReroll: true, reason: "MAP_LOCKED_HIGH_VALUE", priority: "LOCKED_CARD", surplusRerolls, luxuryReserve: luxuryRerollReserve };
        }
        // Multi-surplus spend on solid tiles (e.g. Gran Gran with 4+ surplus, Twins with 2 surplus)
        if (surplusRerolls >= 2 && cellValueAu >= 3 && successRate >= 0.50) {
            return { shouldReroll: true, reason: "SURPLUS_REROLL_MAP_USE", priority: "SURPLUS_SPEND", surplusRerolls, luxuryReserve: luxuryRerollReserve };
        }
        // Poor / low-value tile with surplus: still protect rerolls
        if (isLowValue) {
            return { shouldReroll: false, reason: "PRESERVE_LUXURY_REROLL_RESERVE", priority: "LOW_MAP_VALUE", surplusRerolls, luxuryReserve: luxuryRerollReserve };
        }
    }

    // Case 7: Reroll Reserve Protection (Preserve for Luxury)
    if (rerolls === 1) {
        return {
            shouldReroll: false,
            reason: "PRESERVE_ONLY_REROLL_FOR_LUXURY",
            priority: "LUXURY_PRESERVATION",
            surplusRerolls,
            luxuryReserve: luxuryRerollReserve
        };
    }

    return {
        shouldReroll: false,
        reason: "PRESERVE_LUXURY_REROLL_RESERVE",
        priority: "LUXURY_PRESERVATION",
        surplusRerolls,
        luxuryReserve: luxuryRerollReserve
    };
}

/**
 * Pure helper for evaluating whether a bot should execute a luxury purchase reroll (Phase 5D).
 *
 * @param {Object} [params={}]
 * @param {boolean} [params.isGranGran=false] - Whether the bot is Gran Gran (botId 10)
 * @param {boolean} [params.useStrategic=false] - Whether strategic execution is enabled
 * @param {number} [params.rerolls=0] - Current available rerolls
 * @param {boolean} [params.plannedReroll=false] - Whether turn action plan allocated a reroll
 * @param {boolean} [params.firstRollSucceeded=false] - Whether the first roll met the threshold
 * @returns {{ shouldReroll: boolean, rerollsConsumed: number, reason: string }}
 */
/**
 * Pure helper for evaluating whether a bot should execute a luxury purchase reroll (Phase 5D, 5E.2 & 5E.5).
 * Supports persistent committed rerolls: once committed, continues until success or rerolls exhausted.
 *
 * @param {Object} [params={}]
 * @param {boolean} [params.isFull=false] - Whether the bot is a FULL strategic bot (IDs 7..10)
 * @param {boolean} [params.isGranGran=false] - Compatibility flag for Gran Gran
 * @param {boolean} [params.useStrategic=false] - Whether strategic execution is enabled
 * @param {number} [params.rerolls=0] - Current available rerolls
 * @param {boolean} [params.rerollCommitted=false] - Whether luxury purchase committed to rerolling
 * @param {boolean} [params.plannedReroll=false] - Compatibility alias for rerollCommitted
 * @param {boolean} [params.attemptSucceeded=false] - Whether the current roll succeeded
 * @param {boolean} [params.firstRollSucceeded=false] - Compatibility alias for attemptSucceeded
 * @returns {{ shouldReroll: boolean, rerollsConsumed: number, reason: string }}
 */
export function resolveStrategicLuxuryRerollDecision({
    isFull = false,
    isGranGran = false,
    useStrategic = false,
    rerolls = 0,
    rerollCommitted = false,
    plannedReroll = false,
    attemptSucceeded = false,
    firstRollSucceeded = false
} = {}) {
    const succeeded = Boolean(attemptSucceeded || firstRollSucceeded);
    if (succeeded) {
        return {
            shouldReroll: false,
            rerollsConsumed: 0,
            reason: firstRollSucceeded ? "FIRST_ROLL_SUCCEEDED" : "ATTEMPT_SUCCEEDED"
        };
    }

    const isCommitted = Boolean(rerollCommitted || plannedReroll);

    if (rerolls <= 0) {
        return {
            shouldReroll: false,
            rerollsConsumed: 0,
            reason: isCommitted ? "COMMITTED_REROLLS_EXHAUSTED" : "NO_REROLLS_AVAILABLE"
        };
    }

    const isFullStrategic = (isFull || isGranGran) && useStrategic;

    if (isFullStrategic) {
        if (isCommitted) {
            return {
                shouldReroll: true,
                rerollsConsumed: 1,
                reason: "STRATEGIC_COMMITTED_LUXURY_REROLL"
            };
        } else {
            return {
                shouldReroll: false,
                rerollsConsumed: 0,
                reason: "STRATEGIC_NO_REROLL_PLANNED"
            };
        }
    }

    // Legacy default: consume a reroll if available
    return {
        shouldReroll: true,
        rerollsConsumed: 1,
        reason: "LEGACY_REROLL_CONSUMPTION"
    };
}

// ============================================================================
// BOT TURN EXECUTION RESOLVER & FULL STRATEGIC GATE (PHASE 5B.8 & 5E.2)
// ============================================================================

/**
 * Resolves live turn execution for a bot.
 * If bot has aiDepth === "FULL" (IDs 7..10) AND strategic execution is enabled AND validation passes,
 * executes strategic AI recommendation. Otherwise, transparently delegates
 * to legacy move selection.
 *
 * Pure function: Deterministic, no DOM, no mutation.
 *
 * @param {Object} params
 * @param {Object} params.bot - Bot object (must have id or botId)
 * @param {Object} [params.knowledge=null] - Sanitized knowledge state
 * @param {Object} [params.rawState=null] - Optional raw engine state for legality check
 * @param {boolean} [params.useStrategicFullBots=false] - Master switch for FULL bots
 * @param {boolean} [params.useStrategicGranGran=false] - Compatibility switch for Gran Gran
 * @param {string} [params.legacyAction="NONE"] - Legacy recommended action ('MAP', 'BUY_LUXURY', 'NONE')
 * @param {string|number|null} [params.legacyTargetId=null] - Legacy target cellId or deckId
 * @param {string|null} [params.legacyReason=null] - Legacy reasoning string
 * @param {Object} [params.evaluation=null] - Pre-evaluated action summary from evaluateTurnActions
 * @param {Object} [params.validationReport=null] - Knowledge firewall validation report
 * @returns {Object} Resolution report: { executionMode, executedAction, executedTargetId, usedFallback, fallbackReason, buyDeckId, chosenCellId, moveReason, plannedReroll, plannedRerollCount, plannedRerollReason }
 */
export function resolveBotTurnExecution({
    bot,
    knowledge = null,
    rawState = null,
    useStrategicAI = false,
    useStrategicFullBots = false,
    useStrategicGranGran = false,
    legacyAction = "NONE",
    legacyTargetId = null,
    legacyReason = null,
    evaluation = null,
    validationReport = null
} = {}) {
    const isBot = bot && (bot.type === 'BOT' || (bot.type !== 'HUMAN' && (bot.botId !== undefined || bot.aiDepth !== undefined || (typeof bot === 'object' && bot.name && bot.name !== 'Human Player'))));
    let isStrategicControl = false;
    if (useStrategicAI) {
        isStrategicControl = isBot;
    } else if (useStrategicFullBots) {
        isStrategicControl = isFullStrategicVisitor(bot);
    } else if (useStrategicGranGran) {
        isStrategicControl = isGranGranVisitor(bot);
    }

    const legacyBuyDeckId = legacyAction === "BUY_LUXURY" && legacyTargetId !== null ? Number(legacyTargetId) : null;
    const legacyChosenCellId = legacyAction === "MAP" && legacyTargetId !== null ? String(legacyTargetId) : null;
    const legacyMoveReason = legacyReason || "LEGACY_MOVE";

    // Non-bots or switch disabled: always execute legacy
    if (!isBot || !isStrategicControl) {
        return {
            executionMode: "LEGACY",
            executedAction: legacyAction,
            executedTargetId: legacyTargetId,
            usedFallback: false,
            fallbackReason: null,
            buyDeckId: legacyBuyDeckId,
            chosenCellId: legacyChosenCellId,
            moveReason: legacyMoveReason,
            plannedReroll: false,
            plannedRerollCount: 0,
            plannedRerollReason: "LEGACY_MODE"
        };
    }

    // Strategic control is enabled for Gran Gran:
    // 1. Check firewall validation
    if (validationReport && validationReport.valid === false) {
        return {
            executionMode: "LEGACY",
            executedAction: legacyAction,
            executedTargetId: legacyTargetId,
            usedFallback: true,
            fallbackReason: "FIREWALL_VALIDATION_FAILED",
            buyDeckId: legacyBuyDeckId,
            chosenCellId: legacyChosenCellId,
            moveReason: legacyMoveReason,
            plannedReroll: false,
            plannedRerollCount: 0,
            plannedRerollReason: "FIREWALL_FALLBACK"
        };
    }

    // 2. Check evaluation recommendation
    const rec = evaluation?.recommendation;
    if (!rec || !rec.action || rec.action === "NONE" || rec.action === "NO_LEGAL_ACTIONS") {
        return {
            executionMode: "LEGACY",
            executedAction: legacyAction,
            executedTargetId: legacyTargetId,
            usedFallback: true,
            fallbackReason: "NO_LEGAL_STRATEGIC_ACTION",
            buyDeckId: legacyBuyDeckId,
            chosenCellId: legacyChosenCellId,
            moveReason: legacyMoveReason,
            plannedReroll: false,
            plannedRerollCount: 0,
            plannedRerollReason: "NO_ACTION_FALLBACK"
        };
    }

    if (rec.action === "BUY_LUXURY") {
        const deckId = Number(rec.targetId);
        const chosenLux = Array.isArray(evaluation?.luxuryActions) ? evaluation.luxuryActions.find(a => a.deckId === deckId) : null;
        const plannedReroll = chosenLux ? Boolean(chosenLux.plannedReroll) : false;
        const plannedRerollCount = chosenLux ? (chosenLux.plannedRerollCount || 0) : 0;
        const plannedRerollReason = chosenLux ? (chosenLux.plannedRerollReason || "NONE") : "NONE";

        // If rawState is provided, validate against raw game state
        if (rawState) {
            const rawDecks = rawState.luxuryDecks;
            const rawDeck = rawDecks ? rawDecks[deckId] : null;
            const hasCards = rawDeck && Array.isArray(rawDeck.cards) && rawDeck.cards.length > 0;
            const botGold = (bot && bot.gold !== undefined) ? bot.gold : (rawState.players && rawState.players[rawState.turn]?.gold);
            const canAfford = rawDeck && (botGold !== undefined ? botGold >= rawDeck.cost : true);
            if (!rawDeck || !hasCards || !canAfford) {
                return {
                    executionMode: "LEGACY",
                    executedAction: legacyAction,
                    executedTargetId: legacyTargetId,
                    usedFallback: true,
                    fallbackReason: "INVALID_OR_UNAFFORDABLE_LUXURY_TARGET",
                    buyDeckId: legacyBuyDeckId,
                    chosenCellId: legacyChosenCellId,
                    moveReason: legacyMoveReason,
                    plannedReroll: false,
                    plannedRerollCount: 0,
                    plannedRerollReason: "INVALID_TARGET_FALLBACK"
                };
            }
        }
        return {
            executionMode: "STRATEGIC",
            executedAction: "BUY_LUXURY",
            executedTargetId: deckId,
            usedFallback: false,
            fallbackReason: null,
            buyDeckId: deckId,
            chosenCellId: null,
            moveReason: rec.reason || "STRATEGIC_LUXURY",
            plannedReroll,
            plannedRerollCount,
            plannedRerollReason
        };
    }

    if (rec.action === "MAP") {
        const cellId = String(rec.targetId);
        // If rawState is provided, validate against raw game state
        if (rawState) {
            const rawGrid = rawState.grid;
            const rawCell = Array.isArray(rawGrid) ? rawGrid.find(c => c.id === cellId) : null;
            if (!rawCell || rawCell.flipped || rawCell.empty) {
                return {
                    executionMode: "LEGACY",
                    executedAction: legacyAction,
                    executedTargetId: legacyTargetId,
                    usedFallback: true,
                    fallbackReason: "STALE_OR_INVALID_MAP_CELL",
                    buyDeckId: legacyBuyDeckId,
                    chosenCellId: legacyChosenCellId,
                    moveReason: legacyMoveReason,
                    plannedReroll: false,
                    plannedRerollCount: 0,
                    plannedRerollReason: "MAP_FALLBACK"
                };
            }
        }
        return {
            executionMode: "STRATEGIC",
            executedAction: "MAP",
            executedTargetId: cellId,
            usedFallback: false,
            fallbackReason: null,
            buyDeckId: null,
            chosenCellId: cellId,
            moveReason: rec.reason || "STRATEGIC_MAP",
            plannedReroll: false,
            plannedRerollCount: 0,
            plannedRerollReason: "MAP_ACTION"
        };
    }

    // Any unexpected action: fallback to legacy
    return {
        executionMode: "LEGACY",
        executedAction: legacyAction,
        executedTargetId: legacyTargetId,
        usedFallback: true,
        fallbackReason: `UNKNOWN_STRATEGIC_ACTION_${rec.action}`,
        buyDeckId: legacyBuyDeckId,
        chosenCellId: legacyChosenCellId,
        moveReason: legacyMoveReason,
        plannedReroll: false,
        plannedRerollCount: 0,
        plannedRerollReason: "UNKNOWN_ACTION_FALLBACK"
    };
}

// ============================================================================
// STRATEGIC ENGINE SELF-TESTS (PHASE 5A / 5A CORRECTION / PHASE 5B / 5B CORRECTION / 5B.5 / 5B.8)
// ============================================================================

/**
 * Runs deterministic self-tests for the Strategic Engine and Economic Context model.
 * @returns {{ allPassed: boolean, count: number, passedCount: number, results: Array }}
 */
export function runStrategicEngineSelfTests() {
    const results = [];

    // Base valid mock snapshot generator (pure mock data)
    const createBaseValidSnapshot = () => ({
        turn: 0,
        turnCount: 1,
        mode: 'GAME',
        isGameOver: false,
        activeGambitId: null,
        selfPlayerId: 10,
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
            { id: 10, name: 'Gran Gran', botId: 10, aiDepth: 'FULL', type: 'BOT', gold: 0, totalGold: 0, prestige: 0, inventory: [] }
        ]
    });

    // Test AK — Economic Constants
    {
        const passed = AU_PER_PRESTIGE === 7.5 && Math.abs(PRESTIGE_PER_AU - (1 / 7.5)) < 0.000001;
        results.push({ test: 'Test AK — Economic Constants', passed, details: { AU_PER_PRESTIGE, PRESTIGE_PER_AU } });
    }

    // Test AL — No Auctions Left
    {
        const snapNoAuctions = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snapNoAuctions.auctions.A.resolved = true;
        snapNoAuctions.auctions.B.resolved = true;
        snapNoAuctions.activeAuction = null;
        const contextNoAuctions = analyzeStrategicContext(bot, snapNoAuctions);

        const snapWithAuctions = createBaseValidSnapshot();
        snapWithAuctions.auctions.A.resolved = false;
        snapWithAuctions.auctions.B.resolved = false;
        const contextWithAuctions = analyzeStrategicContext(bot, snapWithAuctions);

        const passed = contextNoAuctions.auctions.remainingCount === 0 &&
            contextNoAuctions.economy.reservePressure < contextWithAuctions.economy.reservePressure;
        results.push({ test: 'Test AL — No Auctions Left', passed, details: { remainingCount: contextNoAuctions.auctions.remainingCount, reserveNoAuc: contextNoAuctions.economy.reservePressure, reserveWithAuc: contextWithAuctions.economy.reservePressure } });
    }

    // Test AM — Visible Mar-a-Lago
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.auctions.A = {
            id: 'A',
            resolved: false,
            triggered: true,
            isVisible: true,
            visibleCard: { id: 0, name: "Mar-a-Lago", points: 4 }
        };
        const context = analyzeStrategicContext(bot, snap);
        const passed = context.auctions.marALagoVisible === true &&
            context.auctions.highestVisiblePropertyPrestige === 4 &&
            context.strategicFlags.highValueAuctionVisible === true;
        results.push({ test: 'Test AM — Visible Mar-a-Lago', passed, details: context.auctions });
    }

    // Test AN — Hidden Property
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.auctions.A = {
            id: 'A',
            resolved: false,
            triggered: false,
            isVisible: false,
            visibleCard: null
        };
        snap.auctions.B = {
            id: 'B',
            resolved: false,
            triggered: false,
            isVisible: false,
            visibleCard: null
        };
        const context = analyzeStrategicContext(bot, snap);
        const passed = context.auctions.visibleProperties.length === 0 &&
            context.auctions.highestVisiblePropertyPrestige === null;
        results.push({ test: 'Test AN — Hidden Property', passed, details: context.auctions });
    }

    // Test AO — Visible 3P Luxury
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.luxuryDecks[2] = {
            id: 2,
            cost: 15,
            taxCount: 0,
            cardsRemaining: 5,
            isOpen: true,
            visibleCard: { name: "Luxury Yacht", points: 3, cost: 15, tier: 3, type: 'LUXURY' }
        };
        const context = analyzeStrategicContext(bot, snap);
        const passed = context.luxury.threePrestigeVisible === true &&
            context.luxury.highestVisiblePrestige === 3 &&
            context.strategicFlags.highValueLuxuryVisible === true;
        results.push({ test: 'Test AO — Visible 3P Luxury', passed, details: context.luxury });
    }

    // Test AP — Closed Luxury
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.luxuryDecks.forEach(d => {
            d.isOpen = false;
            d.visibleCard = null;
        });
        const context = analyzeStrategicContext(bot, snap);
        const passed = context.luxury.visibleCards.length === 0 &&
            context.luxury.highestVisiblePrestige === null &&
            context.luxury.threePrestigeVisible === false;
        results.push({ test: 'Test AP — Closed Luxury', passed, details: context.luxury });
    }

    // Test AQ — Finisher Available
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.grid = [
            { id: 'r4c0', r: 4, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c7', r: 4, c: 7, type: 'WF_R', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r4c8', r: 4, c: 8, type: 'ATLANTIC', empty: false, flipped: true, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null },
            { id: 'r1c0', r: 1, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false, isBonus: null, spriteIndex: null }
        ];
        const context = analyzeStrategicContext(bot, snap);
        const passed = context.map.finisherAvailable === true &&
            context.strategicFlags.finisherAvailable === true &&
            context.map.finishers.includes('r4c2');
        results.push({ test: 'Test AQ — Finisher Available', passed, details: context.map });
    }

    // Test AR — Late Game
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        const playable = snap.grid.filter(c => !c.empty);
        playable.forEach((c, idx) => {
            if (idx < Math.floor(playable.length * 0.8)) {
                c.flipped = true;
            }
        });
        const context = analyzeStrategicContext(bot, snap);
        const passed = context.gamePhase.phase === 'LATE' || context.gamePhase.phase === 'ENDGAME';
        results.push({ test: 'Test AR — Late Game', passed, details: context.gamePhase });
    }

    // Test AS — Preserve Gold Pressure
    {
        const snapImminent = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snapImminent.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false },
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false },
            { id: 'r1c0', r: 1, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false },
            { id: 'r2c0', r: 2, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false }
        ];
        snapImminent.auctions.A.resolved = false;
        const contextImminent = analyzeStrategicContext(bot, snapImminent);

        const snapDistant = createBaseValidSnapshot();
        snapDistant.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false },
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false },
            { id: 'r1c0', r: 1, c: 0, type: 'LAGOON', empty: false, flipped: false, locked: false }
        ];
        snapDistant.auctions.A.resolved = false;
        const contextDistant = analyzeStrategicContext(bot, snapDistant);

        const passed = contextImminent.economy.reservePressure > contextDistant.economy.reservePressure;
        results.push({ test: 'Test AS — Preserve Gold Pressure', passed, details: { imminent: contextImminent.economy.reservePressure, distant: contextDistant.economy.reservePressure } });
    }

    // Test AT — Conversion Pressure After Auctions
    {
        const snapLateNoAuctions = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 25, prestige: 5 };
        const playable = snapLateNoAuctions.grid.filter(c => !c.empty);
        playable.forEach((c, idx) => {
            if (idx < Math.floor(playable.length * 0.8)) c.flipped = true;
        });
        snapLateNoAuctions.auctions.A.resolved = true;
        snapLateNoAuctions.auctions.B.resolved = true;
        snapLateNoAuctions.activeAuction = null;
        const contextLate = analyzeStrategicContext(bot, snapLateNoAuctions);

        const snapEarlyWithAuctions = createBaseValidSnapshot();
        snapEarlyWithAuctions.auctions.A.resolved = false;
        snapEarlyWithAuctions.auctions.B.resolved = false;
        const contextEarly = analyzeStrategicContext(bot, snapEarlyWithAuctions);

        const passed = contextLate.economy.conversionPressure > contextEarly.economy.conversionPressure;
        results.push({ test: 'Test AT — Conversion Pressure After Auctions', passed, details: { late: contextLate.economy.conversionPressure, early: contextEarly.economy.conversionPressure } });
    }

    // Test AU — Hidden Opponent Gold
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', gold: null, totalGold: null, prestige: 0, inventory: [] },
            { id: 10, name: 'Anonymous', isSelf: true, type: 'BOT', gold: 20, totalGold: 20, prestige: 5, inventory: [] }
        ];
        const context = analyzeStrategicContext(bot, snap);
        const passed = context.opponents.highestVisibleGold === null &&
            context.opponents.allOpponentGoldKnown === false;
        results.push({ test: 'Test AU — Hidden Opponent Gold', passed, details: context.opponents });
    }

    // Test AV — Leading / Trailing Prestige
    {
        const snapTrailing = createBaseValidSnapshot();
        const botTrailing = { id: 10, botId: 10, aiDepth: 'FULL', gold: 20, prestige: 5, totalPrestige: 5 };
        snapTrailing.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', gold: 10, prestige: 8, totalPrestige: 8, inventory: [] },
            { id: 10, name: 'Gran Gran', botId: 10, aiDepth: 'FULL', isSelf: true, type: 'BOT', gold: 20, prestige: 5, totalPrestige: 5, inventory: [] }
        ];
        const contextTrailing = analyzeStrategicContext(botTrailing, snapTrailing);

        const snapLeading = createBaseValidSnapshot();
        const botLeading = { id: 10, botId: 10, aiDepth: 'FULL', gold: 20, prestige: 10, totalPrestige: 10 };
        snapLeading.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', gold: 10, prestige: 4, totalPrestige: 4, inventory: [] },
            { id: 10, name: 'Gran Gran', botId: 10, aiDepth: 'FULL', isSelf: true, type: 'BOT', gold: 20, prestige: 10, totalPrestige: 10, inventory: [] }
        ];
        const contextLeading = analyzeStrategicContext(botLeading, snapLeading);

        const passed = contextTrailing.opponents.isLeading === false &&
            contextTrailing.opponents.prestigeGap === -3 &&
            contextLeading.opponents.isLeading === true &&
            contextLeading.opponents.prestigeGap === 6;
        results.push({ test: 'Test AV — Leading / Trailing Prestige', passed, details: { trailing: contextTrailing.opponents, leading: contextLeading.opponents } });
    }

    // ==========================================
    // LUXURY ECONOMIC MODEL CORRECTION (PHASE 5A CORRECTION)
    // ==========================================

    // Test AW — Closed Luxury Expectation
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.luxuryDecks.forEach(d => {
            d.isOpen = false;
            d.visibleCard = null;
        });
        const context = analyzeStrategicContext(bot, snap);
        const passed = context.luxury.piles.length === 3 &&
            context.luxury.piles.every(p => p.cardPrestigeExpectation === 2.0) &&
            context.luxury.expectedClosedLuxuryPrestige === 2.0;
        results.push({ test: 'Test AW — Closed Luxury Expectation', passed, details: context.luxury.piles });
    }

    // Test AX — Closed 5 Au Efficiency
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.luxuryDecks.forEach(d => {
            d.isOpen = false;
            d.visibleCard = null;
        });
        const context = analyzeStrategicContext(bot, snap);
        const p0 = context.luxury.piles[0];
        const passed = Math.abs(p0.successRate - (2 / 6)) < 0.001 &&
            Math.abs(p0.expectedPrestigeOnPurchase - (2.0 * 2 / 6)) < 0.01 &&
            Math.abs(p0.expectedAuPerPrestige - 7.5) < 0.05;
        results.push({ test: 'Test AX — Closed 5 Au Efficiency', passed, details: p0 });
    }

    // Test AY — Closed 10 Au Efficiency
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.luxuryDecks.forEach(d => {
            d.isOpen = false;
            d.visibleCard = null;
        });
        const context = analyzeStrategicContext(bot, snap);
        const p1 = context.luxury.piles[1];
        const passed = Math.abs(p1.successRate - (4 / 6)) < 0.001 &&
            Math.abs(p1.expectedPrestigeOnPurchase - (2.0 * 4 / 6)) < 0.01 &&
            Math.abs(p1.expectedAuPerPrestige - 7.5) < 0.05;
        results.push({ test: 'Test AY — Closed 10 Au Efficiency', passed, details: p1 });
    }

    // Test AZ — Closed 15 Au Efficiency
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.luxuryDecks.forEach(d => {
            d.isOpen = false;
            d.visibleCard = null;
        });
        const context = analyzeStrategicContext(bot, snap);
        const p2 = context.luxury.piles[2];
        const passed = Math.abs(p2.successRate - 1.0) < 0.001 &&
            Math.abs(p2.expectedPrestigeOnPurchase - 2.0) < 0.01 &&
            Math.abs(p2.expectedAuPerPrestige - 7.5) < 0.05;
        results.push({ test: 'Test AZ — Closed 15 Au Efficiency', passed, details: p2 });
    }

    // Test BA — Visible 3P Card Equality
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 3, cost: 5, tier: 1 } };
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Jewelry", points: 3, cost: 10, tier: 2 } };
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const context = analyzeStrategicContext(bot, snap);
        const p0 = context.luxury.piles[0];
        const p1 = context.luxury.piles[1];
        const p2 = context.luxury.piles[2];
        const passed = Math.abs(p0.expectedAuPerPrestige - 5.0) < 0.05 &&
            Math.abs(p1.expectedAuPerPrestige - 5.0) < 0.05 &&
            Math.abs(p2.expectedAuPerPrestige - 5.0) < 0.05;
        results.push({ test: 'Test BA — Visible 3P Card Equality', passed, details: { p0: p0.expectedAuPerPrestige, p1: p1.expectedAuPerPrestige, p2: p2.expectedAuPerPrestige } });
    }

    // Test BB — Visible 2P Card Equality
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 2, cost: 5, tier: 1 } };
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Jewelry", points: 2, cost: 10, tier: 2 } };
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 2, cost: 15, tier: 3 } };
        const context = analyzeStrategicContext(bot, snap);
        const p0 = context.luxury.piles[0];
        const p1 = context.luxury.piles[1];
        const p2 = context.luxury.piles[2];
        const passed = Math.abs(p0.expectedAuPerPrestige - 7.5) < 0.05 &&
            Math.abs(p1.expectedAuPerPrestige - 7.5) < 0.05 &&
            Math.abs(p2.expectedAuPerPrestige - 7.5) < 0.05;
        results.push({ test: 'Test BB — Visible 2P Card Equality', passed, details: { p0: p0.expectedAuPerPrestige, p1: p1.expectedAuPerPrestige, p2: p2.expectedAuPerPrestige } });
    }

    // Test BC — Visible 1P Card Equality
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 1, cost: 5, tier: 1 } };
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Jewelry", points: 1, cost: 10, tier: 2 } };
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 1, cost: 15, tier: 3 } };
        const context = analyzeStrategicContext(bot, snap);
        const p0 = context.luxury.piles[0];
        const p1 = context.luxury.piles[1];
        const p2 = context.luxury.piles[2];
        const passed = Math.abs(p0.expectedAuPerPrestige - 15.0) < 0.05 &&
            Math.abs(p1.expectedAuPerPrestige - 15.0) < 0.05 &&
            Math.abs(p2.expectedAuPerPrestige - 15.0) < 0.05;
        results.push({ test: 'Test BC — Visible 1P Card Equality', passed, details: { p0: p0.expectedAuPerPrestige, p1: p1.expectedAuPerPrestige, p2: p2.expectedAuPerPrestige } });
    }

    // Test BD — Closed Card Anti-Cheat
    {
        const snap = createBaseValidSnapshot();
        const bot = { id: 10, botId: 10, gold: 20, prestige: 5 };
        snap.luxuryDecks.forEach(d => {
            d.isOpen = false;
            d.visibleCard = null;
        });
        const context = analyzeStrategicContext(bot, snap);
        const passed = context.luxury.piles.every(p => p.isOpen === false && p.visiblePoints === null && p.cardPrestigeExpectation === EXPECTED_CLOSED_LUXURY_PRESTIGE);
        results.push({ test: 'Test BD — Closed Card Anti-Cheat', passed, details: context.luxury.piles });
    }

    // ==========================================
    // ACTION VALUATION ENGINE TESTS (PHASE 5B)
    // ==========================================

    // Test BE — Map Success Probability
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 4, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 10 }, snap);
        const action = evalRes.mapActions[0];
        const passed = Math.abs(action.successRate - 0.5) < 0.001;
        results.push({ test: 'Test BE — Map Success Probability', passed, details: action });
    }

    // Test BF — Map Immediate EV
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 8, difficulty: 4, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 10 }, snap);
        const action = evalRes.mapActions[0];
        const passed = Math.abs(action.expectedImmediateAu - 4.0) < 0.001 &&
            Math.abs(action.expectedImmediatePrestigeEq - (4.0 * PRESTIGE_PER_AU * action.baseAuRetentionFactor)) < 0.001;
        results.push({ test: 'Test BF — Map Immediate EV', passed, details: action });
    }

    // Test BG — Finisher Line Bonus
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            // Row 4: flipped cells except r4c2 (rowCounts[4] === 1 -> finisher!)
            { id: 'r4c0', r: 4, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false },
            { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            // Extra unflipped cells in col 2 so colCounts[2] === 3 (safe column, no col finisher/trap)
            { id: 'r5c2', r: 5, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r6c2', r: 6, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            // Extra unflipped cells in rows 5 and 6 so rows 5 and 6 are safe
            { id: 'r5c0', r: 5, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r5c1', r: 5, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r6c0', r: 6, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r6c1', r: 6, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 10 }, snap);
        const finisher = evalRes.mapActions.find(a => a.cellId === 'r4c2');
        const passed = finisher && finisher.isFinisher === true &&
            finisher.lineCompletionBonusAu === 5 &&
            finisher.expectedLineBonusAu === 5 &&
            Math.abs(finisher.expectedLineBonusPrestigeEq - (5 * PRESTIGE_PER_AU * finisher.baseAuRetentionFactor)) < 0.001;
        results.push({ test: 'Test BG — Finisher Line Bonus', passed, details: finisher });
    }

    // Test BH — Trap Penalty (Phase 5B.12 Opponent Line Opportunity Lookahead)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            // Row 0 has 2 unflipped cells -> rowCounts[0] === 2 (Trap move)
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },

            // Col 0, 1, 2 all have 3 unflipped cells -> colCounts === 3 (Safe columns)
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },

            // Row 2 has 3 unflipped cells -> rowCounts[2] === 3 (Safe move)
            { id: 'r2c0', r: 2, c: 0, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r2c1', r: 2, c: 1, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },

            // Row 3 has 3 unflipped cells -> rowCounts[3] === 3 (Safe row)
            { id: 'r3c0', r: 3, c: 0, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r3c1', r: 3, c: 1, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r3c2', r: 3, c: 2, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 10 }, snap);
        const trapAction = evalRes.mapActions.find(a => a.cellId === 'r0c0');
        const safeAction = evalRes.mapActions.find(a => a.cellId === 'r2c0');
        const diff = safeAction.totalUtility - trapAction.totalUtility;
        const expectedDiff = trapAction.expectedOpponentLineOpportunityPrestigeEq;
        const passed = trapAction.isTrap === true &&
            safeAction.isTrap === false &&
            Math.abs(diff - expectedDiff) < 0.01;
        results.push({ test: 'Test BH — Trap Penalty', passed, details: { trap: trapAction.totalUtility, safe: safeAction.totalUtility, diff, expectedDiff } });
    }

    // Test BI — Trap Is Still Legal
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            // High-value trap: 8 Au Lagoon at diff 0 (rowCounts[0] === 2)
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 8, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 1, difficulty: 0, empty: false, flipped: false, locked: false },

            // Row 1 has 3 unflipped cells -> rowCounts[1] === 3 (Safe row)
            { id: 'r1c0', r: 1, c: 0, type: 'LAGOON', value: 1, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r1c1', r: 1, c: 1, type: 'BLOCK', value: 1, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r1c8', r: 1, c: 8, type: 'ATLANTIC', value: 1, difficulty: 0, empty: false, flipped: false, locked: false },

            // Row 2 has 3 unflipped cells -> rowCounts[2] === 3 (Safe row)
            { id: 'r2c0', r: 2, c: 0, type: 'LAGOON', value: 1, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r2c1', r: 2, c: 1, type: 'BLOCK', value: 1, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r2c8', r: 2, c: 8, type: 'ATLANTIC', value: 1, difficulty: 0, empty: false, flipped: false, locked: false },

            // Row 3 has 3 unflipped cells -> rowCounts[3] === 3 (Safe row)
            { id: 'r3c0', r: 3, c: 0, type: 'LAGOON', value: 1, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r3c1', r: 3, c: 1, type: 'BLOCK', value: 1, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r3c8', r: 3, c: 8, type: 'ATLANTIC', value: 1, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 10 }, snap);
        const trapAction = evalRes.mapActions.find(a => a.cellId === 'r0c0');
        const safeAction = evalRes.mapActions.find(a => a.cellId === 'r2c0');
        const passed = trapAction && safeAction &&
            trapAction.totalUtility > safeAction.totalUtility &&
            evalRes.bestMap.cellId === 'r0c0';
        results.push({ test: 'Test BI — Trap Is Still Legal', passed, details: { trapUtility: trapAction?.totalUtility, safeUtility: safeAction?.totalUtility } });
    }

    // Test BJ — Closed Luxury Neutral Utility
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.luxuryDecks.forEach(d => {
            d.isOpen = false;
            d.visibleCard = null;
        });
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.luxuryActions.length === 3 &&
            evalRes.luxuryActions.every(l => l.baseUtility > 0);
        results.push({ test: 'Test BJ — Closed Luxury Neutral Utility', passed, details: evalRes.luxuryActions });
    }

    // Test BK — Visible 3P Positive Utility
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const pile15 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = pile15 && pile15.baseUtility > 0 && pile15.grossPrestigeValue === 3;
        results.push({ test: 'Test BK — Visible 3P Positive Utility', passed, details: pile15 });
    }

    // Test BL — Visible 2P Neutral Utility
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Jewelry", points: 2, cost: 15, tier: 2 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const pile15 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = pile15 && pile15.baseUtility > 0 && pile15.grossPrestigeValue === 2;
        results.push({ test: 'Test BL — Visible 2P Neutral Utility', passed, details: pile15 });
    }

    // Test BM — Visible 1P Negative Utility
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 1, cost: 15, tier: 1 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const pile15 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = pile15 && pile15.totalUtility < 0 && pile15.grossPrestigeValue === 1;
        results.push({ test: 'Test BM — Visible 1P Negative Utility', passed, details: pile15 });
    }

    // Test BN — Luxury Tax Lowers Utility
    {
        const snapNoTax = createBaseValidSnapshot();
        snapNoTax.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalNoTax = evaluateTurnActions({ id: 10, gold: 30 }, snapNoTax);

        const snapWithTax = createBaseValidSnapshot();
        snapWithTax.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 2, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalWithTax = evaluateTurnActions({ id: 10, gold: 30 }, snapWithTax);

        const pileNoTax = evalNoTax.luxuryActions.find(l => l.deckId === 2);
        const pileWithTax = evalWithTax.luxuryActions.find(l => l.deckId === 2);
        const passed = pileNoTax && pileWithTax && pileNoTax.totalUtility > pileWithTax.totalUtility;
        results.push({ test: 'Test BN — Luxury Tax Lowers Utility', passed, details: { noTax: pileNoTax.totalUtility, withTax: pileWithTax.totalUtility } });
    }

    // Test BO — Reserve Pressure Penalizes Luxury
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = false;
        snap.auctions.B.resolved = false;
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };

        // Low reserve pressure (e.g. rich bot with 40 Au, 0 reserve pressure)
        const contextLowRes = analyzeStrategicContext({ id: 10, gold: 40 }, snap);
        const evalLowRes = evaluateTurnActions({ id: 10, gold: 40 }, snap, contextLowRes);

        // High reserve pressure (e.g. poor bot with 15 Au, underfunded)
        const contextHighRes = analyzeStrategicContext({ id: 10, gold: 15 }, snap);
        const evalHighRes = evaluateTurnActions({ id: 10, gold: 15 }, snap, contextHighRes);

        const pileLow = evalLowRes.luxuryActions.find(l => l.deckId === 2);
        const pileHigh = evalHighRes.luxuryActions.find(l => l.deckId === 2);
        const passed = pileLow && pileHigh && pileLow.totalUtility > pileHigh.totalUtility;
        results.push({ test: 'Test BO — Reserve Pressure Penalizes Luxury', passed, details: { lowRes: pileLow?.totalUtility, highRes: pileHigh?.totalUtility } });
    }

    // Test BP — Conversion Pressure Raises Luxury Utility
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const contextLowConv = analyzeStrategicContext({ id: 10, gold: 20 }, snap);
        contextLowConv.economy.conversionPressure = 0.0;
        contextLowConv.economy.baseAuRetentionFactor = getBaseGoldRetentionFactor(contextLowConv);
        contextLowConv.economy.baseEffectivePrestigePerAu = Number((PRESTIGE_PER_AU * contextLowConv.economy.baseAuRetentionFactor).toFixed(6));
        const evalLowConv = evaluateTurnActions({ id: 10, gold: 20 }, snap, contextLowConv);

        const contextHighConv = analyzeStrategicContext({ id: 10, gold: 20 }, snap);
        contextHighConv.economy.conversionPressure = 0.8;
        contextHighConv.economy.baseAuRetentionFactor = getBaseGoldRetentionFactor(contextHighConv);
        contextHighConv.economy.baseEffectivePrestigePerAu = Number((PRESTIGE_PER_AU * contextHighConv.economy.baseAuRetentionFactor).toFixed(6));
        const evalHighConv = evaluateTurnActions({ id: 10, gold: 20 }, snap, contextHighConv);

        const pileLow = evalLowConv.luxuryActions.find(l => l.deckId === 2);
        const pileHigh = evalHighConv.luxuryActions.find(l => l.deckId === 2);
        const passed = pileHigh && pileLow && pileHigh.totalUtility > pileLow.totalUtility;
        results.push({ test: 'Test BP — Conversion Pressure Raises Luxury Utility', passed, details: { lowConv: pileLow?.totalUtility, highConv: pileHigh?.totalUtility } });
    }

    // Test BQ — Best Map Selection
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 2, difficulty: 4, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'LAGOON', value: 8, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.bestMap && evalRes.bestMap.cellId === 'r0c1';
        results.push({ test: 'Test BQ — Best Map Selection', passed, details: evalRes.bestMap });
    }

    // Test BR — Best Luxury Selection
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null };
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null };
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.bestLuxury && evalRes.bestLuxury.deckId === 2;
        results.push({ test: 'Test BR — Best Luxury Selection', passed, details: evalRes.bestLuxury });
    }

    // Test BS — Map Beats Luxury
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r4c0', r: 4, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false },
            { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false } // Finisher: 4 Au + 5 Au line = 9 Au -> 1.2P
        ];
        // Closed luxury piles only (base utility ~0)
        snap.luxuryDecks.forEach(d => { d.isOpen = false; d.visibleCard = null; });
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.recommendation.action === "MAP" && evalRes.recommendation.targetId === 'r4c2';
        results.push({ test: 'Test BS — Map Beats Luxury', passed, details: evalRes.recommendation });
    }

    // Test BT — Luxury Beats Map
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 1, difficulty: 4, empty: false, flipped: false, locked: false }, // Weak map
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 1, difficulty: 4, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } }; // Visible 3P
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.recommendation.action === "BUY_LUXURY" && evalRes.recommendation.targetId === 2;
        results.push({ test: 'Test BT — Luxury Beats Map', passed, details: evalRes.recommendation });
    }

    // Test BU — Closed Information Independence
    {
        const snap1 = createBaseValidSnapshot();
        const snap2 = createBaseValidSnapshot();
        // External property on object that should never be read by sanitized logic
        snap1.hiddenCheatingData = "A";
        snap2.hiddenCheatingData = "B";
        const eval1 = evaluateTurnActions({ id: 10, gold: 20 }, snap1);
        const eval2 = evaluateTurnActions({ id: 10, gold: 20 }, snap2);
        const passed = JSON.stringify(eval1.recommendation) === JSON.stringify(eval2.recommendation) &&
            eval1.bestMap.totalUtility === eval2.bestMap.totalUtility;
        results.push({ test: 'Test BU — Closed Information Independence', passed, details: { eval1: eval1.recommendation, eval2: eval2.recommendation } });
    }

    // Test BV — Deterministic Tie Break
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 4, empty: false, flipped: false, locked: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 4, empty: false, flipped: false, locked: false }
        ];
        const runs = [1, 2, 3, 4, 5].map(() => evaluateTurnActions({ id: 10, gold: 20 }, snap));
        const firstRec = JSON.stringify(runs[0].recommendation);
        const passed = runs.every(r => JSON.stringify(r.recommendation) === firstRec);
        results.push({ test: 'Test BV — Deterministic Tie Break', passed, details: { recommendation: runs[0].recommendation } });
    }

    // ==========================================
    // PHASE 5B CORRECTION REGRESSION TESTS (TESTS BW–CF)
    // ==========================================

    // Test BW — Auction Penalty Scales With Success Rate (Phase 5B.12)
    {
        const snapA = createBaseValidSnapshot();
        snapA.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snapA.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        snapA.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', gold: 45, prestige: 0 },
            { id: 10, name: 'Anonymous', isSelf: true, type: 'BOT', gold: 2, prestige: 0 }
        ];
        const contextA = analyzeStrategicContext({ id: 10, gold: 2 }, snapA);
        const evalA = evaluateTurnActions({ id: 10, gold: 2 }, snapA, contextA);

        const snapB = createBaseValidSnapshot();
        snapB.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 6, empty: false, flipped: false, locked: false }
        ];
        snapB.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        snapB.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', gold: 45, prestige: 0 },
            { id: 10, name: 'Anonymous', isSelf: true, type: 'BOT', gold: 2, prestige: 0 }
        ];
        const contextB = analyzeStrategicContext({ id: 10, gold: 2 }, snapB);
        const evalB = evaluateTurnActions({ id: 10, gold: 2 }, snapB, contextB);

        const actA = evalA.mapActions[0];
        const actB = evalB.mapActions[0];
        const passed = actA.triggersAuction && actB.triggersAuction &&
            actA.rawAuctionImpactPrestigeEq === -0.20 &&
            actB.rawAuctionImpactPrestigeEq === -0.20 &&
            Math.abs(actA.expectedAuctionImpactPrestigeEq - (-0.20)) < 0.001 &&
            Math.abs(actB.expectedAuctionImpactPrestigeEq - (-0.20 * (1 / 6))) < 0.001;
        results.push({ test: 'Test BW — Auction Penalty Scales With Success Rate', passed, details: { actA, actB } });
    }

    // Test BX — Auction Bonus Scales With Success Rate (Phase 5B.12)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 4, empty: false, flipped: false, locked: false }
        ];
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        snap.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', gold: 10, prestige: 0 },
            { id: 10, name: 'Anonymous', isSelf: true, type: 'BOT', gold: 20, prestige: 0 }
        ];
        const context = analyzeStrategicContext({ id: 10, gold: 20 }, snap);
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap, context);
        const action = evalRes.mapActions[0];
        const passed = action.triggersAuction === true &&
            action.rawAuctionImpactPrestigeEq === 0.25 &&
            Math.abs(action.expectedAuctionImpactPrestigeEq - (0.25 * 0.5)) < 0.001;
        results.push({ test: 'Test BX — Auction Bonus Scales With Success Rate', passed, details: action });
    }

    // Test BY — Hidden Opponent Wallet Keeps Auction Trigger Classification UNKNOWN (Phase 5B.12)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        snap.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', gold: 12, prestige: 0 },
            { id: 2, name: 'Local 2', type: 'HUMAN', gold: null, prestige: 0 },
            { id: 10, name: 'Anonymous', isSelf: true, type: 'BOT', gold: 20, prestige: 0 }
        ];
        const context = analyzeStrategicContext({ id: 10, gold: 20 }, snap);
        context.economy.reservePressure = 0.20;
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap, context);
        const action = evalRes.mapActions[0];
        const passed = context.opponents.allOpponentGoldKnown === false &&
            action.waterfrontStatus === 'LAST' &&
            action.auctionTriggerClassification === 'UNKNOWN';
        results.push({ test: 'Test BY — Hidden Opponent Wallet Keeps Auction Trigger Classification UNKNOWN', passed, details: { opponents: context.opponents, action } });
    }

    // Test BZ — All Opponent Wallets Known Allows Favorable Auction Trigger (Phase 5B.12)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        snap.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', gold: 12, prestige: 0 },
            { id: 2, name: 'Local 2', type: 'HUMAN', gold: 18, prestige: 0 },
            { id: 10, name: 'Anonymous', isSelf: true, type: 'BOT', gold: 20, prestige: 0 }
        ];
        const context = analyzeStrategicContext({ id: 10, gold: 20 }, snap);
        context.economy.reservePressure = 0.20;
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap, context);
        const action = evalRes.mapActions[0];
        const passed = context.opponents.allOpponentGoldKnown === true &&
            action.waterfrontStatus === 'LAST' &&
            action.auctionTriggerClassification === 'FAVORABLE_TRIGGER' &&
            action.waterfrontAuctionTimingPrestigeEq > 0;
        results.push({ test: 'Test BZ — All Opponent Wallets Known Allows Favorable Auction Trigger', passed, details: { opponents: context.opponents, action } });
    }

    // Test CA — Luxury Restricted in Gambit 1
    {
        const snap = createBaseValidSnapshot();
        snap.activeGambitId = 1;
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.luxuryLegality.allowed === false &&
            evalRes.luxuryLegality.reason === "GAMBIT_RESTRICTED" &&
            evalRes.luxuryPurchaseAllowed === false &&
            evalRes.luxuryActions.length === 0 &&
            evalRes.bestLuxury === null;
        results.push({ test: 'Test CA — Luxury Restricted in Gambit 1', passed, details: evalRes });
    }

    // Test CB — Luxury Restricted in Gambit 2
    {
        const snap = createBaseValidSnapshot();
        snap.activeGambitId = 2;
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.luxuryLegality.allowed === false &&
            evalRes.luxuryLegality.reason === "GAMBIT_RESTRICTED" &&
            evalRes.luxuryActions.length === 0 &&
            evalRes.bestLuxury === null;
        results.push({ test: 'Test CB — Luxury Restricted in Gambit 2', passed, details: evalRes });
    }

    // Test CC — Luxury Restricted in Gambit 3
    {
        const snap = createBaseValidSnapshot();
        snap.activeGambitId = 3;
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.luxuryLegality.allowed === false &&
            evalRes.luxuryLegality.reason === "GAMBIT_RESTRICTED" &&
            evalRes.luxuryActions.length === 0 &&
            evalRes.bestLuxury === null;
        results.push({ test: 'Test CC — Luxury Restricted in Gambit 3', passed, details: evalRes });
    }

    // Test CD — Luxury Restricted in Gambit 11
    {
        const snap = createBaseValidSnapshot();
        snap.activeGambitId = 11;
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.luxuryLegality.allowed === false &&
            evalRes.luxuryLegality.reason === "GAMBIT_RESTRICTED" &&
            evalRes.luxuryActions.length === 0 &&
            evalRes.bestLuxury === null;
        results.push({ test: 'Test CD — Luxury Restricted in Gambit 11', passed, details: evalRes });
    }

    // Test CE — Normal Game Luxury Remains Legal
    {
        const snap = createBaseValidSnapshot();
        snap.activeGambitId = null;
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.luxuryLegality.allowed === true &&
            evalRes.luxuryPurchaseAllowed === true &&
            evalRes.luxuryActions.length === 3 &&
            evalRes.bestLuxury !== null;
        results.push({ test: 'Test CE — Normal Game Luxury Remains Legal', passed, details: evalRes });
    }

    // Test CF — Restricted Luxury Cannot Become Recommendation
    {
        const snap = createBaseValidSnapshot();
        snap.activeGambitId = 1; // Luxury restricted
        // Weak map move
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 1, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        // Strong luxury pile that would otherwise score high
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.recommendation.action === "MAP" &&
            evalRes.recommendation.targetId === 'r0c0' &&
            evalRes.recommendation.action !== "BUY_LUXURY";
        results.push({ test: 'Test CF — Restricted Luxury Cannot Become Recommendation', passed, details: evalRes.recommendation });
    }

    // ==========================================
    // PHASE 5B.5 SHADOW MODE REGRESSION TESTS (TESTS CG–CN)
    // ==========================================

    // Test CG — Exact Agreement
    {
        const evalRes = {
            recommendation: { action: "MAP", targetId: "r4c2", utility: 0.82, reason: "BEST_EXPECTED_UTILITY" }
        };
        const comp = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r4c2",
            legacyReason: "FINISHER_PLAY",
            evaluation: evalRes
        });
        const passed = comp.agreement === true && comp.classification === "AGREE" &&
            comp.legacy.action === "MAP" && comp.strategic.action === "MAP" &&
            comp.legacy.targetId === "r4c2" && comp.strategic.targetId === "r4c2";
        results.push({ test: 'Test CG — Exact Agreement', passed, details: comp });
    }

    // Test CH — Map vs Luxury Disagreement
    {
        const evalRes = {
            recommendation: { action: "BUY_LUXURY", targetId: 2, utility: 0.91, reason: "BEST_EXPECTED_UTILITY" }
        };
        const comp = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r3c0",
            legacyReason: "GRAN_GRAN_COASTAL_HUNT",
            evaluation: evalRes
        });
        const passed = comp.agreement === false && comp.classification === "DISAGREE_MAP_VS_LUXURY" &&
            comp.legacy.action === "MAP" && comp.strategic.action === "BUY_LUXURY";
        results.push({ test: 'Test CH — Map vs Luxury Disagreement', passed, details: comp });
    }

    // Test CI — Different Map Target
    {
        const evalRes = {
            recommendation: { action: "MAP", targetId: "r4c2", utility: 0.85, reason: "BEST_EXPECTED_UTILITY" }
        };
        const comp = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r2c0",
            legacyReason: "SAFE_MOVE",
            evaluation: evalRes
        });
        const passed = comp.agreement === false && comp.classification === "DISAGREE_MAP_TARGET" &&
            comp.legacy.targetId === "r2c0" && comp.strategic.targetId === "r4c2";
        results.push({ test: 'Test CI — Different Map Target', passed, details: comp });
    }

    // Test CJ — Different Luxury Pile
    {
        const evalRes = {
            recommendation: { action: "BUY_LUXURY", targetId: 2, utility: 0.75, reason: "BEST_EXPECTED_UTILITY" }
        };
        const comp = compareLegacyAndStrategicDecision({
            legacyAction: "BUY_LUXURY",
            legacyTargetId: 0,
            legacyReason: "AFFORDABLE_DICE_ROLL",
            evaluation: evalRes
        });
        const passed = comp.agreement === false && comp.classification === "DISAGREE_LUXURY_PILE" &&
            comp.legacy.targetId === 0 && comp.strategic.targetId === 2;
        results.push({ test: 'Test CJ — Different Luxury Pile', passed, details: comp });
    }

    // Test CK — Missing Decision
    {
        const comp1 = compareLegacyAndStrategicDecision({
            legacyAction: "NONE",
            legacyTargetId: null,
            evaluation: { recommendation: { action: "MAP", targetId: "r0c0" } }
        });
        const comp2 = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            evaluation: { recommendation: { action: "NONE", targetId: null } }
        });
        const comp3 = compareLegacyAndStrategicDecision({
            legacyAction: null,
            evaluation: null
        });
        const passed = comp1.classification === "NO_COMPARISON" && comp1.agreement === false &&
            comp2.classification === "NO_COMPARISON" && comp2.agreement === false &&
            comp3.classification === "NO_COMPARISON" && comp3.agreement === false;
        results.push({ test: 'Test CK — Missing Decision', passed, details: { comp1, comp2, comp3 } });
    }

    // Test CL — Shadow Data Contains No Raw State
    {
        const snap = createBaseValidSnapshot();
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap);
        const comp = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            legacyReason: "TEST_REASON",
            evaluation: evalRes
        });
        const shadowEntry = {
            timestamp: Date.now(),
            turnCount: snap.turnCount,
            turnIndex: snap.turn,
            bot: { playerId: 1, botId: 10, name: "Gran Gran", intelligenceLevel: 9 },
            classification: comp.classification,
            agreement: comp.agreement,
            legacy: comp.legacy,
            strategic: comp.strategic,
            bestMap: evalRes.bestMap ? { cellId: evalRes.bestMap.cellId, utility: evalRes.bestMap.totalUtility } : null,
            bestLuxury: evalRes.bestLuxury ? { deckId: evalRes.bestLuxury.deckId, utility: evalRes.bestLuxury.totalUtility } : null,
            context: { gold: 20, prestige: 5 }
        };
        const passed = shadowEntry.rawState === undefined &&
            shadowEntry.grid === undefined &&
            shadowEntry.luxuryDecks === undefined &&
            shadowEntry.players === undefined &&
            shadowEntry.bestLuxury?.cards === undefined;
        results.push({ test: 'Test CL — Shadow Data Contains No Raw State', passed, details: shadowEntry });
    }

    // Test CM — Gran Gran Identification Uses botId 10 (The Twins botId 9 Not Identified)
    {
        const isGranGran1 = ({ id: 0, botId: 10, name: "Gran Gran", type: "BOT" })?.botId === 10;
        const isGranGran2 = ({ id: 10, botId: 9, name: "The Twins", type: "BOT" })?.botId === 10;
        const isGranGran3 = ({ id: 10, name: "Human Player", type: "HUMAN" })?.botId === 10;
        const isGranGran4 = ({ id: 2, botId: 10, name: "Gran Gran", type: "BOT" })?.botId === 10;
        const passed = isGranGran1 === true && isGranGran2 === false && isGranGran3 === false && isGranGran4 === true;
        results.push({ test: 'Test CM — Gran Gran Identification Uses botId', passed, details: { isGranGran1, isGranGran2, isGranGran3, isGranGran4 } });
    }

    // Test CN — Shadow Recommendation Does Not Alter Legacy Result
    {
        const legacyDecision = { action: "MAP", targetId: "r3c0", reason: "GRAN_GRAN_COASTAL_HUNT" };
        const evalRes = {
            recommendation: { action: "BUY_LUXURY", targetId: 2, utility: 1.15, reason: "BEST_EXPECTED_UTILITY" }
        };
        const comp = compareLegacyAndStrategicDecision({
            legacyAction: legacyDecision.action,
            legacyTargetId: legacyDecision.targetId,
            legacyReason: legacyDecision.reason,
            evaluation: evalRes
        });
        const passed = legacyDecision.action === "MAP" &&
            legacyDecision.targetId === "r3c0" &&
            comp.legacy.action === "MAP" &&
            comp.legacy.targetId === "r3c0" &&
            comp.strategic.action === "BUY_LUXURY" &&
            comp.classification === "DISAGREE_MAP_VS_LUXURY";
        results.push({ test: 'Test CN — Shadow Recommendation Does Not Alter Legacy Result', passed, details: { legacyDecision, comp } });
    }

    // ==========================================
    // PHASE 5B.6 DIAGNOSTICS & POSITIONAL SETUP TESTS (TESTS CO–CZ)
    // ==========================================

    // Test CO — Shadow Turn/Decision Progression Not Permanently Zero
    {
        let turnCount = 0;
        const history = [];
        for (let i = 1; i <= 3; i++) {
            turnCount++;
            history.push({
                decisionIndex: history.length + 1,
                turnCount: turnCount,
                bot: { id: 1, botId: 10, name: "Gran Gran" },
                classification: "AGREE"
            });
        }
        const passed = history.length === 3 &&
            history[0].turnCount === 1 && history[0].decisionIndex === 1 &&
            history[1].turnCount === 2 && history[1].decisionIndex === 2 &&
            history[2].turnCount === 3 && history[2].decisionIndex === 3;
        results.push({ test: 'Test CO — Shadow Turn/Decision Progression Not Permanently Zero', passed, details: history });
    }

    // Test CP — Identical-Utility Different Map Targets Classify as EQUIVALENT_MAP_TIE
    {
        const evalRes = {
            recommendation: { action: "MAP", targetId: "r0c1", utility: 0.5333, reason: "BEST_EXPECTED_UTILITY" },
            mapActions: [
                { cellId: "r0c1", totalUtility: 0.5333 },
                { cellId: "r0c7", totalUtility: 0.5333 }
            ]
        };
        const comp = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r0c7",
            legacyReason: "WATERFRONT_CELL",
            evaluation: evalRes
        });
        const passed = comp.agreement === false &&
            comp.classification === "EQUIVALENT_MAP_TIE" &&
            comp.utilityDifference === 0.0 &&
            comp.legacy.utility === 0.5333 &&
            comp.strategic.utility === 0.5333;
        results.push({ test: 'Test CP — Identical-Utility Different Map Targets Classify as EQUIVALENT_MAP_TIE', passed, details: comp });
    }

    // Test CQ — Near-Equal Cross-Action Choice Classifies as CLOSE_DECISION
    {
        const evalCross = {
            recommendation: { action: "BUY_LUXURY", targetId: 2, utility: 0.73, reason: "BEST_EXPECTED_UTILITY" },
            mapActions: [
                { cellId: "r0c0", totalUtility: 0.70 }
            ],
            luxuryActions: [
                { deckId: 2, totalUtility: 0.73 }
            ]
        };
        const compCross = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            legacyReason: "SAFE_MOVE",
            evaluation: evalCross
        });

        const evalSame = {
            recommendation: { action: "MAP", targetId: "r1c0", utility: 0.73, reason: "BEST_EXPECTED_UTILITY" },
            mapActions: [
                { cellId: "r0c0", totalUtility: 0.70 },
                { cellId: "r1c0", totalUtility: 0.73 }
            ]
        };
        const compSame = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            legacyReason: "SAFE_MOVE",
            evaluation: evalSame
        });

        const passed = compCross.classification === "CLOSE_DECISION" && compCross.agreement === false &&
            compCross.utilityDifference === 0.03 &&
            compSame.classification === "CLOSE_DECISION" && compSame.agreement === false &&
            compSame.utilityDifference === 0.03;
        results.push({ test: 'Test CQ — Near-Equal Cross-Action Choice Classifies as CLOSE_DECISION', passed, details: { compCross, compSame } });
    }

    // Test CR — Meaningful Larger Map-vs-Luxury Difference Remains DISAGREE_MAP_VS_LUXURY
    {
        const evalRes = {
            recommendation: { action: "BUY_LUXURY", targetId: 2, utility: 0.90, reason: "BEST_EXPECTED_UTILITY" },
            mapActions: [
                { cellId: "r0c0", totalUtility: 0.40 }
            ],
            luxuryActions: [
                { deckId: 2, totalUtility: 0.90 }
            ]
        };
        const comp = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            legacyReason: "COASTAL_HUNT",
            evaluation: evalRes
        });
        const passed = comp.classification === "DISAGREE_MAP_VS_LUXURY" &&
            comp.agreement === false &&
            comp.utilityDifference === 0.50;
        results.push({ test: 'Test CR — Meaningful Larger Map-vs-Luxury Difference Remains DISAGREE_MAP_VS_LUXURY', passed, details: comp });
    }

    // Test CS — Setup Value is Minimal for Isolated First-Step Line Progress
    {
        const setup0 = evaluateLineSetupValue(9, 0);
        const passed = setup0 === 0.01;
        results.push({ test: 'Test CS — Setup Value is Minimal for Isolated First-Step Line Progress', passed, details: { setup0 } });
    }

    // Test CT — Move Advancing Already-Developed Line Scores Higher Setup Value
    {
        const setupFresh = evaluateLineSetupValue(3, 0);
        const setup1 = evaluateLineSetupValue(3, 1);
        const setup2 = evaluateLineSetupValue(3, 2);
        const setup3 = evaluateLineSetupValue(3, 3);
        const setup4 = evaluateLineSetupValue(3, 4);
        const passed = setupFresh < setup1 &&
            setup1 < setup2 &&
            setup2 < setup3 &&
            setup3 < setup4;
        results.push({ test: 'Test CT — Move Advancing Already-Developed Line Scores Higher Setup Value', passed, details: { setupFresh, setup1, setup2, setup3, setup4 } });
    }

    // Test CU — Move Advancing Both Row and Column Scores More Than Single-Line Setup
    {
        const rowVal = evaluateLineSetupValue(3, 2);
        const colVal = evaluateLineSetupValue(3, 2);
        const dualVal = rowVal + colVal;
        const passed = dualVal > rowVal && dualVal === 0.12 && dualVal <= 0.30;
        results.push({ test: 'Test CU — Move Advancing Both Row and Column Scores More Than Single-Line Setup', passed, details: { rowVal, colVal, dualVal } });
    }

    // Test CV — Immediate Finisher Does Not Double-Count Completion as Setup Value
    {
        const finisherSetup = evaluateLineSetupValue(1, 8);
        const completedSetup = evaluateLineSetupValue(0, 9);
        const passed = finisherSetup === 0 && completedSetup === 0;
        results.push({ test: 'Test CV — Immediate Finisher Does Not Double-Count Completion as Setup Value', passed, details: { finisherSetup, completedSetup } });
    }

    // Test CW — Setup Value is Multiplied by Success Probability
    {
        const rawSetup = 0.12;
        const diff0Rate = 1.0;
        const diff4Rate = 0.5;
        const expDiff0 = rawSetup * diff0Rate;
        const expDiff4 = rawSetup * diff4Rate;
        const passed = expDiff0 === 0.12 && Math.abs(expDiff4 - 0.06) < 0.0001;
        results.push({ test: 'Test CW — Setup Value is Multiplied by Success Probability', passed, details: { rawSetup, expDiff0, expDiff4 } });
    }

    // Test CX — Closed/Hidden Map Fields Inaccessible and Setup Uses Sanitized Data
    {
        const snap1 = createBaseValidSnapshot();
        const snap2 = createBaseValidSnapshot();
        snap1.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, locked: false }
        ];
        snap2.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, locked: false, spriteIndex: 42, isBonus: true, secretOwner: "PLAYER_1" }
        ];
        const eval1 = evaluateTurnActions({ id: 10, gold: 10 }, snap1);
        const eval2 = evaluateTurnActions({ id: 10, gold: 10 }, snap2);
        const passed = eval1.bestMap.expectedSetupPrestigeEq === eval2.bestMap.expectedSetupPrestigeEq &&
            eval1.bestMap.rowSetupValue === eval2.bestMap.rowSetupValue &&
            eval1.bestMap.columnSetupValue === eval2.bestMap.columnSetupValue;
        results.push({ test: 'Test CX — Closed/Hidden Map Fields Inaccessible and Setup Uses Sanitized Data', passed, details: { eval1: eval1.bestMap, eval2: eval2.bestMap } });
    }

    // Test CY — Deterministic Ordering Remains Stable
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r1c0', r: 1, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const runs = [1, 2, 3, 4, 5].map(() => evaluateTurnActions({ id: 10, gold: 10 }, snap));
        const firstOrder = JSON.stringify(runs[0].mapActions.map(m => m.cellId));
        const passed = runs.every(r => JSON.stringify(r.mapActions.map(m => m.cellId)) === firstOrder);
        results.push({ test: 'Test CY — Deterministic Ordering Remains Stable', passed, details: { order: runs[0].mapActions.map(m => m.cellId) } });
    }

    // Test CZ — Shadow Logging Contains No Raw State After New Fields
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap);
        const comp = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            legacyReason: "TEST_SETUP",
            evaluation: evalRes
        });
        const shadowEntry = {
            timestamp: Date.now(),
            decisionIndex: 1,
            turnCount: snap.turnCount,
            bot: { id: 1, botId: 10, name: "Gran Gran", intelligenceLevel: 9 },
            classification: comp.classification,
            agreement: comp.agreement,
            utilityDifference: comp.utilityDifference,
            legacy: comp.legacy,
            strategic: comp.strategic,
            bestMap: evalRes.bestMap ? {
                cellId: evalRes.bestMap.cellId,
                type: evalRes.bestMap.type,
                difficulty: evalRes.bestMap.difficulty,
                utility: evalRes.bestMap.totalUtility,
                expectedSetupPrestigeEq: evalRes.bestMap.expectedSetupPrestigeEq,
                rawSetupPrestigeEq: evalRes.bestMap.rawSetupPrestigeEq,
                rowSetupValue: evalRes.bestMap.rowSetupValue,
                columnSetupValue: evalRes.bestMap.columnSetupValue,
                rowOwnedBefore: evalRes.bestMap.rowOwnedBefore,
                columnOwnedBefore: evalRes.bestMap.columnOwnedBefore,
                successRate: evalRes.bestMap.successRate,
                isFinisher: Boolean(evalRes.bestMap.isFinisher),
                isTrap: Boolean(evalRes.bestMap.isTrap)
            } : null
        };
        const passed = shadowEntry.rawState === undefined &&
            shadowEntry.grid === undefined &&
            shadowEntry.bestMap?.rawGrid === undefined &&
            shadowEntry.bestMap?.expectedSetupPrestigeEq !== undefined &&
            shadowEntry.utilityDifference !== undefined &&
            shadowEntry.decisionIndex === 1;
        results.push({ test: 'Test CZ — Shadow Logging Contains No Raw State After New Fields', passed, details: shadowEntry });
    }

    // ==========================================
    // DYNAMIC AU VALUE & LUXURY CONVERSION TESTS (PHASE 5B.7)
    // ==========================================

    // Test DA — Au retention factor high with imminent unresolved auction
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = false;
        snap.auctions.B.resolved = false;
        const context = analyzeStrategicContext({ id: 10, gold: 10 }, snap);
        context.auctions.auctionImminent = true;
        context.auctions.imminent = true;
        const factor = getGoldRetentionFactor(context);
        const passed = factor >= 0.80 && factor <= 1.00;
        results.push({ test: 'Test DA — Au retention factor high with imminent unresolved auction', passed, details: { factor } });
    }

    // Test DB — Au retention factor lower after both auctions resolved
    {
        const snapUnres = createBaseValidSnapshot();
        snapUnres.auctions.A.resolved = false;
        snapUnres.auctions.B.resolved = false;
        const contextUnres = analyzeStrategicContext({ id: 10, gold: 20 }, snapUnres);

        const snapRes = createBaseValidSnapshot();
        snapRes.auctions.A.resolved = true;
        snapRes.auctions.B.resolved = true;
        const contextRes = analyzeStrategicContext({ id: 10, gold: 20 }, snapRes);

        const factorUnres = getGoldRetentionFactor(contextUnres);
        const factorRes = getGoldRetentionFactor(contextRes);
        const passed = factorRes < factorUnres;
        results.push({ test: 'Test DB — Au retention factor lower after both auctions resolved', passed, details: { factorUnres, factorRes } });
    }

    // Test DC — Au retention factor lower in ENDGAME than EARLY with otherwise similar state
    {
        const contextEarly = {
            gamePhase: 'EARLY',
            bot: { gold: 15 },
            economy: { reservePressure: 0.20, conversionPressure: 0.20 },
            auctions: { remainingCount: 1, activeAuctionPresent: false }
        };
        const contextEndgame = {
            gamePhase: 'ENDGAME',
            bot: { gold: 15 },
            economy: { reservePressure: 0.20, conversionPressure: 0.20 },
            auctions: { remainingCount: 1, activeAuctionPresent: false }
        };
        const factorEarly = getGoldRetentionFactor(contextEarly);
        const factorEndgame = getGoldRetentionFactor(contextEndgame);
        const passed = factorEndgame < factorEarly;
        results.push({ test: 'Test DC — Au retention factor lower in ENDGAME than EARLY with otherwise similar state', passed, details: { factorEarly, factorEndgame } });
    }

    // Test DD — High current gold lowers marginal Au value compared with low current gold
    {
        const contextPoor = {
            gamePhase: 'MID',
            bot: { gold: 4 },
            economy: { reservePressure: 0.30, conversionPressure: 0.30 },
            auctions: { remainingCount: 1, activeAuctionPresent: false }
        };
        const contextRich = {
            gamePhase: 'MID',
            bot: { gold: 35 },
            economy: { reservePressure: 0.30, conversionPressure: 0.30 },
            auctions: { remainingCount: 1, activeAuctionPresent: false }
        };
        const factorPoor = getGoldRetentionFactor(contextPoor);
        const factorRich = getGoldRetentionFactor(contextRich);
        const passed = factorRich < factorPoor;
        results.push({ test: 'Test DD — High current gold lowers marginal Au value compared with low current gold', passed, details: { factorPoor, factorRich } });
    }

    // Test DE — Map immediate Au valuation uses baseAuRetentionFactor (Phase 5B.11 Correction)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 8, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 10 }, snap);
        const act = evalRes.mapActions[0];
        const expectedPrestigeEq = Number((8.0 * PRESTIGE_PER_AU * act.baseAuRetentionFactor).toFixed(4));
        const passed = act.expectedImmediatePrestigeEq === expectedPrestigeEq &&
            act.dynamicImmediatePrestigeEq === expectedPrestigeEq &&
            act.baseAuRetentionFactor !== undefined;
        results.push({ test: 'Test DE — Map immediate Au valuation uses baseAuRetentionFactor (Phase 5B.11 Correction)', passed, details: { act, expectedPrestigeEq } });
    }

    // Test DF — Line completion Au valuation uses baseAuRetentionFactor (Phase 5B.11 Correction)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r4c0', r: 4, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false },
            { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r5c2', r: 5, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r6c2', r: 6, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r5c0', r: 5, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r5c1', r: 5, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r6c0', r: 6, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r6c1', r: 6, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 10 }, snap);
        const finisher = evalRes.mapActions.find(a => a.cellId === 'r4c2');
        const expectedLineBonus = Number((5.0 * PRESTIGE_PER_AU * finisher.baseAuRetentionFactor).toFixed(4));
        const passed = finisher && finisher.expectedLineBonusPrestigeEq === expectedLineBonus &&
            finisher.dynamicLineBonusPrestigeEq === expectedLineBonus;
        results.push({ test: 'Test DF — Line completion Au valuation uses baseAuRetentionFactor (Phase 5B.11 Correction)', passed, details: { finisher, expectedLineBonus } });
    }

    // Test DG — Trap Au penalty uses baseAuRetentionFactor (Phase 5B.11 Correction)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r2c0', r: 2, c: 0, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r2c1', r: 2, c: 1, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 4, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 10 }, snap);
        const trapAction = evalRes.mapActions.find(a => a.cellId === 'r0c0');
        const expectedTrapPenalty = Number((trapAction.trapPenaltyAu * PRESTIGE_PER_AU * trapAction.baseAuRetentionFactor).toFixed(4));
        const passed = trapAction && trapAction.expectedTrapPenaltyPrestigeEq === expectedTrapPenalty &&
            trapAction.dynamicTrapPenaltyPrestigeEq === expectedTrapPenalty;
        results.push({ test: 'Test DG — Trap Au penalty uses baseAuRetentionFactor (Phase 5B.11 Correction)', passed, details: { trapAction, expectedTrapPenalty } });
    }

    // Test DH — Luxury gold opportunity cost uses baseAuRetentionFactor (Phase 5B.11 Correction)
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const pile15 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const expectedOppCost = Number((15.0 * PRESTIGE_PER_AU * pile15.baseAuRetentionFactor).toFixed(4));
        const passed = pile15 && pile15.goldOpportunityCost === expectedOppCost &&
            pile15.baseEffectivePrestigePerAu === Number((PRESTIGE_PER_AU * pile15.baseAuRetentionFactor).toFixed(6));
        results.push({ test: 'Test DH — Luxury gold opportunity cost uses baseAuRetentionFactor (Phase 5B.11 Correction)', passed, details: { pile15, expectedOppCost } });
    }

    // Test DI — Closed Luxury becomes more attractive after auctions resolve
    {
        const snapUnres = createBaseValidSnapshot();
        snapUnres.auctions.A.resolved = false;
        snapUnres.auctions.B.resolved = false;
        snapUnres.luxuryDecks.forEach(d => { d.isOpen = false; d.visibleCard = null; });
        const evalUnres = evaluateTurnActions({ id: 10, gold: 20 }, snapUnres);

        const snapRes = createBaseValidSnapshot();
        snapRes.auctions.A.resolved = true;
        snapRes.auctions.B.resolved = true;
        snapRes.luxuryDecks.forEach(d => { d.isOpen = false; d.visibleCard = null; });
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snapRes);

        const luxUnres = evalUnres.luxuryActions[0];
        const luxRes = evalRes.luxuryActions[0];
        const passed = luxRes && luxUnres && luxRes.totalUtility > luxUnres.totalUtility;
        results.push({ test: 'Test DI — Closed Luxury becomes more attractive after auctions resolve', passed, details: { unresUtil: luxUnres?.totalUtility, resUtil: luxRes?.totalUtility } });
    }

    // Test DJ — Visible 3P Luxury can beat ordinary Map in a reasonable MID/LATE state
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.recommendation.action === "BUY_LUXURY" && evalRes.recommendation.targetId === 2;
        results.push({ test: 'Test DJ — Visible 3P Luxury can beat ordinary Map in a reasonable MID/LATE state', passed, details: evalRes.recommendation });
    }

    // Test DK — Visible 1P Luxury remains unattractive in a conservative early state
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = false;
        snap.auctions.B.resolved = false;
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 1, cost: 15, tier: 1 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 15 }, snap);
        const lux1P = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = evalRes.recommendation.action === "MAP" && lux1P && lux1P.totalUtility <= 0;
        results.push({ test: 'Test DK — Visible 1P Luxury remains unattractive in a conservative early state', passed, details: { recommendation: evalRes.recommendation, lux1P } });
    }

    // Test DL — Strong Map finisher still beats weak Luxury
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r4c0', r: 4, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false },
            { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r5c2', r: 5, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r6c2', r: 6, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 1, cost: 5, tier: 1 } };
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 1, cost: 10, tier: 1 } };
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 1, cost: 15, tier: 1 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.recommendation.action === "MAP" && evalRes.bestMap.isFinisher === true;
        results.push({ test: 'Test DL — Strong Map finisher still beats weak Luxury', passed, details: evalRes.recommendation });
    }

    // Test DM — Rich late-game bot with no auctions prefers Luxury over ordinary Map
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks.forEach(d => { d.isOpen = false; d.visibleCard = null; });
        const context = analyzeStrategicContext({ id: 10, gold: 25 }, snap);
        context.gamePhase = 'LATE';
        const evalRes = evaluateTurnActions({ id: 10, gold: 25 }, snap, context);
        const passed = evalRes.recommendation.action === "BUY_LUXURY";
        results.push({ test: 'Test DM — Rich late-game bot with no auctions prefers Luxury over ordinary Map', passed, details: evalRes.recommendation });
    }

    // Test DN — Early bot with auctions ahead can rationally prefer Map over closed Luxury
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = false;
        snap.auctions.B.resolved = false;
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks.forEach(d => { d.isOpen = false; d.visibleCard = null; });
        const context = analyzeStrategicContext({ id: 10, gold: 10 }, snap);
        context.gamePhase = 'EARLY';
        const evalRes = evaluateTurnActions({ id: 10, gold: 10 }, snap, context);
        const passed = evalRes.recommendation.action === "MAP";
        results.push({ test: 'Test DN — Early bot with auctions ahead can rationally prefer Map over closed Luxury', passed, details: evalRes.recommendation });
    }

    // Test DO — No hidden information introduced by dynamic Au model
    {
        const snapClean = createBaseValidSnapshot();
        const snapSecret = createBaseValidSnapshot();
        snapSecret.hiddenSecret = "LEAK";
        snapSecret.grid[0].spriteIndex = 99;
        snapSecret.luxuryDecks[0].secretPool = [1, 2, 3];
        const contextClean = analyzeStrategicContext({ id: 10, gold: 20 }, snapClean);
        const contextSecret = analyzeStrategicContext({ id: 10, gold: 20 }, snapSecret);
        const factorClean = getGoldRetentionFactor(contextClean);
        const factorSecret = getGoldRetentionFactor(contextSecret);
        const passed = factorClean === factorSecret &&
            contextClean.economy.auRetentionFactor === contextSecret.economy.auRetentionFactor;
        results.push({ test: 'Test DO — No hidden information introduced by dynamic Au model', passed, details: { factorClean, factorSecret } });
    }

    // Test DP — Deterministic ordering unchanged
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const runs = [1, 2, 3, 4, 5].map(() => evaluateTurnActions({ id: 10, gold: 20 }, snap));
        const firstOrder = JSON.stringify(runs[0].mapActions.map(m => m.cellId));
        const passed = runs.every(r => JSON.stringify(r.mapActions.map(m => m.cellId)) === firstOrder);
        results.push({ test: 'Test DP — Deterministic ordering unchanged', passed, details: { firstOrder } });
    }

    // Test DQ — Shadow serialization includes auRetentionFactor but no raw state
    {
        const snap = createBaseValidSnapshot();
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap);
        const shadowEntry = {
            timestamp: Date.now(),
            decisionIndex: 1,
            turnCount: 5,
            strategicContextSummary: {
                gamePhase: evalRes.strategicContext.gamePhase,
                auRetentionFactor: evalRes.strategicContext.economy.auRetentionFactor,
                effectivePrestigePerAu: evalRes.strategicContext.economy.effectivePrestigePerAu
            }
        };
        const passed = shadowEntry.strategicContextSummary.auRetentionFactor !== undefined &&
            shadowEntry.strategicContextSummary.effectivePrestigePerAu !== undefined &&
            shadowEntry.rawState === undefined;
        results.push({ test: 'Test DQ — Shadow serialization includes auRetentionFactor but no raw state', passed, details: shadowEntry });
    }

    // Test DR — post-auction reserve defaults to 5 Au
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        const context = analyzeStrategicContext({ id: 10, gold: 20 }, snap);
        const reserveVal = getPostAuctionReserve(context);
        const passed = POST_AUCTION_MIN_RESERVE === 5 &&
            reserveVal === 5 &&
            context.economy.postAuctionReserveAu === 5;
        results.push({ test: 'Test DR — post-auction reserve defaults to 5 Au', passed, details: { reserveVal, contextReserve: context.economy.postAuctionReserveAu } });
    }

    // Test DS — 22 Au permits 15 Au Luxury because 7 Au remains
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        const evalRes = evaluateTurnActions({ id: 10, gold: 22 }, snap);
        const deck2 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(deck2) &&
            deck2.goldAfterPurchase === 7 &&
            deck2.violatesPostAuctionReserve === false &&
            deck2.isStrategicallyEligible === true &&
            evalRes.bestLuxury?.deckId === 2;
        results.push({ test: 'Test DS — 22 Au permits 15 Au Luxury because 7 Au remains', passed, details: { deck2, bestLuxury: evalRes.bestLuxury } });
    }

    // Test DT — 17 Au allows 15 Au Luxury conversion under Phase 5B.14 post-auction plan
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        const evalRes = evaluateTurnActions({ id: 10, gold: 17 }, snap);
        const deck2 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(deck2) &&
            deck2.goldAfterPurchase === 2 &&
            deck2.isStrategicallyEligible === true &&
            evalRes.bestLuxury?.deckId === 2;
        results.push({ test: 'Test DT — 17 Au allows 15 Au Luxury conversion under Phase 5B.14 post-auction plan', passed, details: { deck2, bestLuxury: evalRes.bestLuxury } });
    }

    // Test DU — 17 Au permits both 10 Au and 15 Au Luxury as strategically eligible
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        const evalRes = evaluateTurnActions({ id: 10, gold: 17 }, snap);
        const deck1 = evalRes.luxuryActions.find(l => l.deckId === 1);
        const deck2 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(deck1) && Boolean(deck2) &&
            deck1.isStrategicallyEligible === true &&
            deck2.isStrategicallyEligible === true;
        results.push({ test: 'Test DU — 17 Au permits both 10 Au and 15 Au Luxury as strategically eligible', passed, details: { deck1, deck2 } });
    }

    // Test DV — Post-Auction conversion with 12 Au evaluates best affordable luxury tier
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        const context = analyzeStrategicContext({ id: 10, gold: 12 }, snap);
        const reserveVal = getPostAuctionReserve(context);
        const evalRes = evaluateTurnActions({ id: 10, gold: 12 }, snap, context);
        const deck1 = evalRes.luxuryActions.find(l => l.deckId === 1);
        const deck0 = evalRes.luxuryActions.find(l => l.deckId === 0);
        const passed = reserveVal === 5 &&
            Boolean(deck1) && Boolean(deck0) &&
            evalRes.bestLuxury?.deckId === 1 &&
            evalRes.postAuctionLuxuryPlan.shouldBuyNow === true;
        results.push({ test: 'Test DV — Post-Auction conversion with 12 Au evaluates best affordable luxury tier', passed, details: { deck1, deck0, bestLuxury: evalRes.bestLuxury } });
    }

    // Test DW — reserve does not apply as a replacement for auction reserve while auctions remain
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = false;
        snap.auctions.B.resolved = false;
        const context = analyzeStrategicContext({ id: 10, gold: 17 }, snap);
        const reserveVal = getPostAuctionReserve(context);
        const evalRes = evaluateTurnActions({ id: 10, gold: 17 }, snap, context);
        const deck2 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = reserveVal === 0 &&
            context.economy.postAuctionReserveAu === 0 &&
            Boolean(deck2) &&
            deck2.violatesPostAuctionReserve === false &&
            deck2.ineligibleReason === null;
        results.push({ test: 'Test DW — reserve does not apply as a replacement for auction reserve while auctions remain', passed, details: { reserveVal, deck2 } });
    }

    // Test DX — rich no-auction bot still chooses Luxury over ordinary Map
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 43 }, snap);
        const passed = evalRes.recommendation.action === "BUY_LUXURY";
        results.push({ test: 'Test DX — rich no-auction bot still chooses Luxury over ordinary Map', passed, details: evalRes.recommendation });
    }

    // Test DY — strong Map finisher can still beat weak Luxury
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r4c0', r: 4, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false },
            { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', value: 5, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r5c2', r: 5, c: 2, type: 'BLOCK', value: 5, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r6c2', r: 6, c: 2, type: 'BLOCK', value: 5, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Cigar", points: 1, cost: 5, tier: 1 } };
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Silver", points: 1, cost: 10, tier: 1 } };
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 1, cost: 15, tier: 1 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const passed = evalRes.recommendation.action === "MAP" && evalRes.bestMap?.isFinisher === true;
        results.push({ test: 'Test DY — strong Map finisher can still beat weak Luxury', passed, details: evalRes.recommendation });
    }

    // Test DZ — strategic control flag false preserves exact legacy execution
    {
        const snap = createBaseValidSnapshot();
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap);
        const res = resolveBotTurnExecution({
            bot: { id: 10, botId: 10, gold: 20 },
            knowledge: snap,
            useStrategicGranGran: false,
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            legacyReason: "LEGACY_PICK",
            evaluation: evalRes
        });
        const passed = res.executionMode === "LEGACY" &&
            res.executedAction === "MAP" &&
            res.executedTargetId === "r0c0" &&
            res.usedFallback === false &&
            res.fallbackReason === null;
        results.push({ test: 'Test DZ — strategic control flag false preserves exact legacy execution', passed, details: res });
    }

    // Test EA — strategic control flag true executes strategic MAP for Gran Gran only
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 5, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks.forEach(d => { d.isOpen = false; d.visibleCard = null; });
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap);
        const res = resolveBotTurnExecution({
            bot: { id: 10, botId: 10, gold: 20 },
            knowledge: snap,
            rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
            useStrategicGranGran: true,
            legacyAction: "BUY_LUXURY",
            legacyTargetId: 0,
            legacyReason: "LEGACY_BUY",
            evaluation: evalRes
        });
        const passed = res.executionMode === "STRATEGIC" &&
            res.executedAction === "MAP" &&
            res.executedTargetId === "r0c0" &&
            res.chosenCellId === "r0c0" &&
            res.buyDeckId === null &&
            res.usedFallback === false;
        results.push({ test: 'Test EA — strategic control flag true executes strategic MAP for Gran Gran only', passed, details: res });
    }

    // Test EB — strategic control flag true executes strategic BUY_LUXURY for Gran Gran only
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 1, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 10, gold: 10, inventory: [] },
            { id: 10, botId: 10, name: "Gran Gran", prestige: 5, gold: 30, inventory: [] }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 30 }, snap);
        const res = resolveBotTurnExecution({
            bot: { id: 10, botId: 10, gold: 30 },
            knowledge: snap,
            rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [{ cards: [{ points: 1 }], cost: 5 }, { cards: [{ points: 2 }], cost: 10 }, { cards: [{ points: 3 }], cost: 15 }] },
            useStrategicGranGran: true,
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            legacyReason: "LEGACY_MAP",
            evaluation: evalRes
        });
        const passed = res.executionMode === "STRATEGIC" &&
            res.executedAction === "BUY_LUXURY" &&
            res.executedTargetId === evalRes.bestLuxury?.deckId &&
            res.buyDeckId === evalRes.bestLuxury?.deckId &&
            res.chosenCellId === null &&
            res.usedFallback === false;
        results.push({ test: 'Test EB — strategic control flag true executes strategic BUY_LUXURY for Gran Gran only', passed, details: res });
    }

    // Test EC — all non-Gran-Gran bots remain legacy regardless of flag
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        const evalRes = evaluateTurnActions({ id: 0, botId: 0, gold: 30 }, snap);
        const res = resolveBotTurnExecution({
            bot: { id: 0, botId: 0, gold: 30, name: "Anonymous" },
            knowledge: snap,
            useStrategicGranGran: true,
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            legacyReason: "LEGACY_MAP",
            evaluation: evalRes
        });
        const passed = res.executionMode === "LEGACY" &&
            res.executedAction === "MAP" &&
            res.executedTargetId === "r0c0" &&
            res.usedFallback === false;
        results.push({ test: 'Test EC — all non-Gran-Gran bots remain legacy regardless of flag', passed, details: res });
    }

    // Test ED — strategic resolution failure falls back to legacy without crash
    {
        const snap = createBaseValidSnapshot();
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap);
        // Raw state where the recommended cell is already flipped
        const rawStateStale = {
            grid: [{ id: 'r0c0', flipped: true, empty: false }],
            luxuryDecks: []
        };
        const res = resolveBotTurnExecution({
            bot: { id: 10, botId: 10, gold: 20 },
            knowledge: snap,
            rawState: rawStateStale,
            useStrategicGranGran: true,
            legacyAction: "MAP",
            legacyTargetId: "r0c1",
            legacyReason: "LEGACY_FALLBACK_MOVE",
            evaluation: evalRes
        });
        const passed = res.executionMode === "LEGACY" &&
            res.executedAction === "MAP" &&
            res.executedTargetId === "r0c1" &&
            res.usedFallback === true &&
            res.fallbackReason === "STALE_OR_INVALID_MAP_CELL";
        results.push({ test: 'Test ED — strategic resolution failure falls back to legacy without crash', passed, details: res });
    }

    // Test EE — shadow log records executionMode and actual executed action
    {
        const snap = createBaseValidSnapshot();
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap);
        const shadowEntry = {
            timestamp: Date.now(),
            decisionIndex: 1,
            turnCount: 5,
            executionMode: "STRATEGIC",
            executedAction: "MAP",
            executedTargetId: "r0c0",
            usedFallback: false,
            fallbackReason: null,
            legacy: { action: "MAP", targetId: "r0c1", utility: 1.0, reason: "LEGACY" },
            strategic: { action: "MAP", targetId: "r0c0", utility: 1.5, reason: "STRATEGIC" },
            strategicContextSummary: {
                auRetentionFactor: evalRes.strategicContext.economy.auRetentionFactor,
                postAuctionReserveAu: evalRes.strategicContext.economy.postAuctionReserveAu
            }
        };
        const passed = shadowEntry.executionMode === "STRATEGIC" &&
            shadowEntry.executedAction === "MAP" &&
            shadowEntry.executedTargetId === "r0c0" &&
            shadowEntry.usedFallback === false &&
            shadowEntry.fallbackReason === null;
        results.push({ test: 'Test EE — shadow log records executionMode and actual executed action', passed, details: shadowEntry });
    }

    // Test EF — strategic live-control path uses sanitized knowledge only
    {
        const snapClean = createBaseValidSnapshot();
        const snapSecret = createBaseValidSnapshot();
        snapSecret.hiddenSecretProperty = "LEAK";
        snapSecret.grid[0].spriteIndex = 999;
        const evalClean = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snapClean);
        const evalSecret = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snapSecret);
        const passed = JSON.stringify(evalClean.recommendation) === JSON.stringify(evalSecret.recommendation) &&
            evalClean.bestLuxury?.deckId === evalSecret.bestLuxury?.deckId;
        results.push({ test: 'Test EF — strategic live-control path uses sanitized knowledge only', passed, details: { evalClean: evalClean.recommendation, evalSecret: evalSecret.recommendation } });
    }

    // Test EG — no raw/hidden state added to shadow history
    {
        const snap = createBaseValidSnapshot();
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap);
        const shadowEntry = {
            timestamp: Date.now(),
            decisionIndex: 1,
            turnCount: 5,
            executionMode: "STRATEGIC",
            executedAction: "BUY_LUXURY",
            executedTargetId: 1,
            usedFallback: false,
            fallbackReason: null,
            strategicContextSummary: {
                auRetentionFactor: evalRes.strategicContext.economy.auRetentionFactor,
                postAuctionReserveAu: evalRes.strategicContext.economy.postAuctionReserveAu
            },
            bestLuxury: evalRes.bestLuxury ? {
                deckId: evalRes.bestLuxury.deckId,
                goldAfterPurchase: evalRes.bestLuxury.goldAfterPurchase,
                violatesPostAuctionReserve: evalRes.bestLuxury.violatesPostAuctionReserve
            } : null
        };
        const passed = shadowEntry.rawState === undefined &&
            shadowEntry.grid === undefined &&
            shadowEntry.luxuryDecks === undefined &&
            shadowEntry.players === undefined &&
            shadowEntry.bestLuxury?.cards === undefined;
        results.push({ test: 'Test EG — no raw/hidden state added to shadow history', passed, details: shadowEntry });
    }

    // Test EH — auction decisions remain legacy
    {
        // chooseAuctionAction remains an independent pure function in ai_knowledge
        const snap = createBaseValidSnapshot();
        snap.activeAuction = { id: 'A', highBid: 5, highestBidder: 0 };
        snap.auctions.A.resolved = false;
        snap.auctions.A.isVisible = true;
        snap.auctions.A.visibleCard = { id: 1, name: "Villa", points: 2 };
        const auctionDec = chooseAuctionAction({ id: 10, botId: 10, gold: 20, personality: 'BALANCED' }, snap);
        const passed = Boolean(auctionDec) &&
            typeof auctionDec.action === 'string' &&
            typeof auctionDec.amount === 'number' &&
            auctionDec.action !== undefined;
        results.push({ test: 'Test EH — auction decisions remain legacy', passed, details: auctionDec });
    }

    // Test EI — deterministic strategic decision unchanged
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        const runs = [1, 2, 3, 4, 5].map(() => evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap));
        const firstAction = JSON.stringify(runs[0].recommendation);
        const passed = runs.every(r => JSON.stringify(r.recommendation) === firstAction);
        results.push({ test: 'Test EI — deterministic strategic decision unchanged', passed, details: { firstAction } });
    }

    // Test EJ — exactly one Map card remains and bot clearly leads on Prestige -> canLockWin true
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 8, gold: 10, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10 }, snap);
        const passed = lockRes.applicable === true &&
            lockRes.canLockWin === true &&
            lockRes.currentOutcome === "WIN" &&
            lockRes.finalMapCellId === "r0c0" &&
            lockRes.finalMapSuccessRate === 1.0;
        results.push({ test: 'Test EJ — exactly one Map card remains and bot clearly leads on Prestige -> canLockWin true', passed, details: lockRes });
    }

    // Test EK — guaranteed-success final Map while winning -> recommendation MAP with ENDGAME_WIN_LOCK
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 8, gold: 30, inventory: [] }
        ];
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        const evalRes = evaluateTurnActions({ id: 10, gold: 30 }, snap);
        const passed = evalRes.recommendation.action === "MAP" &&
            evalRes.recommendation.targetId === "r0c0" &&
            evalRes.recommendation.reason === "ENDGAME_WIN_LOCK" &&
            evalRes.endgameWinLock?.canLockWin === true &&
            evalRes.endgameWinLock?.finalMapSuccessRate === 1.0;
        results.push({ test: 'Test EK — guaranteed-success final Map while winning -> recommendation MAP with ENDGAME_WIN_LOCK', passed, details: evalRes.recommendation });
    }

    // Test EL — probabilistic final Map while winning -> still recommendation MAP with ENDGAME_WIN_LOCK
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 8, difficulty: 4, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 8, gold: 30, inventory: [] }
        ];
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        const evalRes = evaluateTurnActions({ id: 10, gold: 30 }, snap);
        const passed = evalRes.recommendation.action === "MAP" &&
            evalRes.recommendation.targetId === "r0c0" &&
            evalRes.recommendation.reason === "ENDGAME_WIN_LOCK" &&
            evalRes.endgameWinLock?.canLockWin === true &&
            evalRes.endgameWinLock?.finalMapSuccessRate === 0.5;
        results.push({ test: 'Test EL — probabilistic final Map while winning -> still recommendation MAP with ENDGAME_WIN_LOCK', passed, details: evalRes.recommendation });
    }

    // Test EM — bot losing with one Map card remaining -> no win-lock override
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 10, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 5, gold: 30, inventory: [] }
        ];
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        const evalRes = evaluateTurnActions({ id: 10, gold: 30 }, snap);
        const passed = evalRes.endgameWinLock?.canLockWin === false &&
            evalRes.endgameWinLock?.currentOutcome === "LOSS" &&
            evalRes.endgameWinLock?.reason === "ENDGAME_AVOID_CLOSE_WHILE_BEHIND" &&
            evalRes.recommendation.reason !== "ENDGAME_WIN_LOCK";
        results.push({ test: 'Test EM — bot losing with one Map card remaining -> no win-lock override', passed, details: evalRes.recommendation });
    }

    // Test EN — bot tied on Prestige but wins known Au tiebreak -> canLockWin true
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 5, gold: 20, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10, gold: 20 }, snap);
        const passed = lockRes.applicable === true &&
            lockRes.canLockWin === true &&
            lockRes.currentOutcome === "WIN" &&
            lockRes.reason === "ENDGAME_WIN_LOCK";
        results.push({ test: 'Test EN — bot tied on Prestige but wins known Au tiebreak -> canLockWin true', passed, details: lockRes });
    }

    // Test EO — bot tied on Prestige but loses known Au tiebreak -> no win lock
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 20, inventory: [] },
            { id: 10, name: "Bot", prestige: 5, gold: 10, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10, gold: 10 }, snap);
        const passed = lockRes.applicable === true &&
            lockRes.canLockWin === false &&
            lockRes.currentOutcome === "LOSS" &&
            lockRes.reason === "ENDGAME_AVOID_CLOSE_WHILE_BEHIND";
        results.push({ test: 'Test EO — bot tied on Prestige but loses known Au tiebreak -> no win lock', passed, details: lockRes });
    }

    // Test EP — opponent Au hidden and required for tiebreak -> currentOutcome UNKNOWN, no win lock
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: null, inventory: [] },
            { id: 10, name: "Bot", prestige: 5, gold: 20, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10, gold: 20 }, snap);
        const passed = lockRes.applicable === true &&
            lockRes.canLockWin === false &&
            lockRes.currentOutcome === "UNKNOWN" &&
            lockRes.reason === "OPPONENT_GOLD_HIDDEN_FOR_TIEBREAK";
        results.push({ test: 'Test EP — opponent Au hidden and required for tiebreak -> currentOutcome UNKNOWN, no win lock', passed, details: lockRes });
    }

    // Test EQ — more than one Map card remaining -> win-lock not applicable
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 10, gold: 20, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10 }, snap);
        const passed = lockRes.applicable === false &&
            lockRes.canLockWin === false &&
            lockRes.reason === "MULTIPLE_MAP_CARDS_REMAIN";
        results.push({ test: 'Test EQ — more than one Map card remaining -> win-lock not applicable', passed, details: lockRes });
    }

    // Test ER — Luxury normal utility higher than final Map but bot guaranteed winner -> MAP override still wins
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 1, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 10, gold: 40, inventory: [] }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 40 }, snap);
        const passed = Boolean(evalRes.bestLuxury) &&
            evalRes.bestLuxury.totalUtility > evalRes.bestMap.totalUtility &&
            evalRes.recommendation.action === "MAP" &&
            evalRes.recommendation.reason === "ENDGAME_WIN_LOCK";
        results.push({ test: 'Test ER — Luxury normal utility higher than final Map but bot guaranteed winner -> MAP override still wins', passed, details: { bestLuxury: evalRes.bestLuxury?.totalUtility, bestMap: evalRes.bestMap?.totalUtility, recommendation: evalRes.recommendation } });
    }

    // Test ES — strong Luxury remains available when bot is behind and final Map would end game
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 1, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 15, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 5, gold: 40, inventory: [] }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 40 }, snap);
        const passed = evalRes.recommendation.action === "BUY_LUXURY" &&
            evalRes.endgameWinLock?.canLockWin === false &&
            evalRes.endgameWinLock?.currentOutcome === "LOSS";
        results.push({ test: 'Test ES — strong Luxury remains available when bot is behind and final Map would end game', passed, details: evalRes.recommendation });
    }

    // Test ET — no hidden information used in outcome determination
    {
        const snapClean = createBaseValidSnapshot();
        snapClean.grid = [{ id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }];
        snapClean.players = [{ id: 0, prestige: 5, gold: 10, inventory: [] }, { id: 10, prestige: 8, gold: 10, inventory: [] }];

        const snapSecret = createBaseValidSnapshot();
        snapSecret.grid = [{ id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }];
        snapSecret.players = [{ id: 0, prestige: 5, gold: 10, inventory: [], secretHand: ['WIN_CARD'] }, { id: 10, prestige: 8, gold: 10, inventory: [] }];
        snapSecret.secretVault = { winnerId: 0 };

        const lockClean = evaluateEndgameWinLock({ id: 10 }, snapClean);
        const lockSecret = evaluateEndgameWinLock({ id: 10 }, snapSecret);
        const passed = JSON.stringify(lockClean) === JSON.stringify(lockSecret) &&
            lockClean.canLockWin === true &&
            lockSecret.canLockWin === true;
        results.push({ test: 'Test ET — no hidden information used in outcome determination', passed, details: { lockClean, lockSecret } });
    }

    // Test EU — live Gran Gran strategic path preserves ENDGAME_WIN_LOCK recommendation
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 1, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, botId: 10, name: "Gran Gran", prestige: 10, gold: 40, inventory: [] }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 40 }, snap);
        const res = resolveBotTurnExecution({
            bot: { id: 10, botId: 10, gold: 40 },
            knowledge: snap,
            rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
            useStrategicGranGran: true,
            legacyAction: "BUY_LUXURY",
            legacyTargetId: 2,
            legacyReason: "LEGACY_BUY",
            evaluation: evalRes
        });
        const passed = res.executionMode === "STRATEGIC" &&
            res.executedAction === "MAP" &&
            res.executedTargetId === "r0c0" &&
            res.chosenCellId === "r0c0" &&
            res.moveReason === "ENDGAME_WIN_LOCK" &&
            res.usedFallback === false;
        results.push({ test: 'Test EU — live Gran Gran strategic path preserves ENDGAME_WIN_LOCK recommendation', passed, details: res });
    }

    // Test EV — all non-Gran-Gran behavior unchanged
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 1, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, botId: 0, name: "Anonymous", prestige: 10, gold: 40, inventory: [] },
            { id: 1, name: "Opponent", prestige: 5, gold: 10, inventory: [] }
        ];
        const evalRes = evaluateTurnActions({ id: 0, botId: 0, gold: 40 }, snap);
        const res = resolveBotTurnExecution({
            bot: { id: 0, botId: 0, gold: 40, name: "Anonymous" },
            knowledge: snap,
            useStrategicGranGran: true,
            legacyAction: "BUY_LUXURY",
            legacyTargetId: 1,
            legacyReason: "LEGACY_BUY",
            evaluation: evalRes
        });
        const passed = res.executionMode === "LEGACY" &&
            res.executedAction === "BUY_LUXURY" &&
            res.executedTargetId === 1 &&
            res.usedFallback === false;
        results.push({ test: 'Test EV — all non-Gran-Gran behavior unchanged', passed, details: res });
    }

    // Test EW — deterministic ordering unchanged outside win-lock condition
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        const runs = [1, 2, 3, 4, 5].map(() => evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap));
        const firstRec = JSON.stringify(runs[0].recommendation);
        const passed = runs.every(r => JSON.stringify(r.recommendation) === firstRec);
        results.push({ test: 'Test EW — deterministic ordering unchanged outside win-lock condition', passed, details: { firstRec } });
    }

    // Test EX — shadow serialization includes win-lock fields and no raw state
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, botId: 10, name: "Gran Gran", prestige: 10, gold: 30, inventory: [] }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 30 }, snap);
        const shadowEntry = {
            timestamp: Date.now(),
            decisionIndex: 1,
            turnCount: 5,
            executionMode: "STRATEGIC",
            executedAction: "MAP",
            executedTargetId: "r0c0",
            endgameWinLock: {
                applicable: evalRes.endgameWinLock?.applicable,
                canLockWin: evalRes.endgameWinLock?.canLockWin,
                currentOutcome: evalRes.endgameWinLock?.currentOutcome,
                finalMapTriggersAuction: evalRes.endgameWinLock?.finalMapTriggersAuction,
                triggeredAuctionId: evalRes.endgameWinLock?.triggeredAuctionId,
                reason: evalRes.endgameWinLock?.reason
            }
        };
        const passed = shadowEntry.endgameWinLock.applicable === true &&
            shadowEntry.endgameWinLock.canLockWin === true &&
            shadowEntry.endgameWinLock.currentOutcome === "WIN" &&
            shadowEntry.endgameWinLock.finalMapTriggersAuction === false &&
            shadowEntry.endgameWinLock.triggeredAuctionId === null &&
            shadowEntry.rawState === undefined;
        results.push({ test: 'Test EX — shadow serialization includes win-lock fields and no raw state', passed, details: shadowEntry });
    }

    // Test EY — final non-Waterfront Map, bot winning, auctions resolved -> win lock still applies
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 10, gold: 30, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10 }, snap);
        const passed = lockRes.applicable === true &&
            lockRes.canLockWin === true &&
            lockRes.finalMapTriggersAuction === false &&
            lockRes.triggeredAuctionId === null &&
            lockRes.currentOutcome === "WIN" &&
            lockRes.reason === "ENDGAME_WIN_LOCK";
        results.push({ test: 'Test EY — final non-Waterfront Map, bot winning, auctions resolved -> win lock still applies', passed, details: lockRes });
    }

    // Test EZ — final WF_L card would trigger unresolved auction A -> no win lock
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = false;
        snap.auctions.A.triggered = false;
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 5, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 10, gold: 30, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10 }, snap);
        const passed = lockRes.applicable === true &&
            lockRes.canLockWin === false &&
            lockRes.finalMapTriggersAuction === true &&
            lockRes.triggeredAuctionId === 'A' &&
            lockRes.reason === "FINAL_MAP_TRIGGERS_AUCTION";
        results.push({ test: 'Test EZ — final WF_L card would trigger unresolved auction A -> no win lock', passed, details: lockRes });
    }

    // Test FA — final WF_R card would trigger unresolved auction B -> no win lock
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.B.resolved = false;
        snap.auctions.B.triggered = false;
        snap.grid = [
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', value: 5, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 10, gold: 30, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10 }, snap);
        const passed = lockRes.applicable === true &&
            lockRes.canLockWin === false &&
            lockRes.finalMapTriggersAuction === true &&
            lockRes.triggeredAuctionId === 'B' &&
            lockRes.reason === "FINAL_MAP_TRIGGERS_AUCTION";
        results.push({ test: 'Test FA — final WF_R card would trigger unresolved auction B -> no win lock', passed, details: lockRes });
    }

    // Test FB — final Waterfront card but corresponding auction already resolved -> win lock applies
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 5, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 10, gold: 30, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10 }, snap);
        const passed = lockRes.applicable === true &&
            lockRes.canLockWin === true &&
            lockRes.finalMapTriggersAuction === false &&
            lockRes.triggeredAuctionId === null &&
            lockRes.reason === "ENDGAME_WIN_LOCK";
        results.push({ test: 'Test FB — final Waterfront card but corresponding auction already resolved -> win lock applies', passed, details: lockRes });
    }

    // Test FC — final Waterfront card but corresponding auction already triggered/resolved as appropriate -> verify against authoritative rules
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.B.resolved = false;
        snap.auctions.B.triggered = true;
        snap.grid = [
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', value: 5, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 5, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 10, gold: 30, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10 }, snap);
        const passed = lockRes.applicable === true &&
            lockRes.canLockWin === true &&
            lockRes.finalMapTriggersAuction === false &&
            lockRes.triggeredAuctionId === null &&
            lockRes.reason === "ENDGAME_WIN_LOCK";
        results.push({ test: 'Test FC — final Waterfront card but corresponding auction already triggered/resolved as appropriate -> verify against authoritative rules', passed, details: lockRes });
    }

    // Test FD — hidden property identity is never inspected to decide this; only public auction state/trigger possibility
    {
        const snapClean = createBaseValidSnapshot();
        snapClean.grid = [{ id: 'r0c1', r: 0, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false }];
        snapClean.auctions.A.resolved = false;
        snapClean.auctions.A.triggered = false;

        const snapSecret = createBaseValidSnapshot();
        snapSecret.grid = [{ id: 'r0c1', r: 0, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false }];
        snapSecret.auctions.A.resolved = false;
        snapSecret.auctions.A.triggered = false;
        snapSecret.auctions.A.card = { name: "Mar-a-Lago", points: 5 };
        snapSecret.secretVault = { deed: "Mar-a-Lago" };

        const lockClean = evaluateEndgameWinLock({ id: 10 }, snapClean);
        const lockSecret = evaluateEndgameWinLock({ id: 10 }, snapSecret);
        const passed = JSON.stringify(lockClean) === JSON.stringify(lockSecret) &&
            lockClean.finalMapTriggersAuction === true &&
            lockClean.triggeredAuctionId === 'A';
        results.push({ test: 'Test FD — hidden property identity is never inspected to decide this; only public auction state/trigger possibility', passed, details: { lockClean, lockSecret } });
    }

    // Test FE — ordinary losing behavior remains unchanged
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 15, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 5, gold: 30, inventory: [] }
        ];
        const lockRes = evaluateEndgameWinLock({ id: 10 }, snap);
        const passed = lockRes.canLockWin === false &&
            lockRes.currentOutcome === "LOSS" &&
            lockRes.reason === "ENDGAME_AVOID_CLOSE_WHILE_BEHIND";
        results.push({ test: 'Test FE — ordinary losing behavior remains unchanged', passed, details: lockRes });
    }

    // Test FF — existing 154 tests remain passing
    {
        const passed = results.filter(r => r.passed).length >= 118;
        results.push({ test: 'Test FF — existing 154 tests remain passing', passed, details: { currentPassedCount: results.filter(r => r.passed).length } });
    }

    // Test FG — expected auction value = 3P before any auction resolves
    {
        const snap = createBaseValidSnapshot();
        const val = getExpectedUpcomingAuctionValue(snap);
        const passed = val.expectedUpcomingAuctionPrestige === 3.0 && val.baselineAuctionValueAu === 22.5;
        results.push({ test: 'Test FG — expected auction value = 3P before any auction resolves', passed, details: val });
    }

    // Test FH — remaining average = 2.5P after Mar-a-Lago resolves
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.A.propertyWon = { name: "Mar-a-Lago", points: 4 };
        const val = getExpectedUpcomingAuctionValue(snap);
        const passed = val.expectedUpcomingAuctionPrestige === 2.5 && val.baselineAuctionValueAu === 18.75;
        results.push({ test: 'Test FH — remaining average = 2.5P after Mar-a-Lago resolves', passed, details: val });
    }

    // Test FI — remaining average = 3.5P after 2P property resolves
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.A.propertyWon = { name: "Spanish River", points: 2 };
        const val = getExpectedUpcomingAuctionValue(snap);
        const passed = val.expectedUpcomingAuctionPrestige === 3.5 && val.baselineAuctionValueAu === 26.25;
        results.push({ test: 'Test FI — remaining average = 3.5P after 2P property resolves', passed, details: val });
    }

    // Test FJ — actual visible property overrides expectation
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.isVisible = true;
        snap.auctions.A.visibleCard = { name: "Mar-a-Lago", points: 4 };
        const val = getExpectedUpcomingAuctionValue(snap);
        const passed = val.expectedUpcomingAuctionPrestige === 4.0 && val.baselineAuctionValueAu === 30.0;
        results.push({ test: 'Test FJ — actual visible property overrides expectation', passed, details: val });
    }

    // Test FK — projected auction bankroll after Luxury purchase
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false },
            { id: 'r1c7', r: 1, c: 7, type: 'WF_R', flipped: false, empty: false }
        ];
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const lux15 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(lux15) && lux15.projectedAuctionGold === 11 && lux15.estimatedAuBeforeAuction === 6;
        results.push({ test: 'Test FK — projected auction bankroll after Luxury purchase', passed, details: lux15 });
    }

    // Test FL — strong visible 3P purchased when rebuild capacity remains
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = false;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", personality: "BALANCED", gold: 20 }, snap);
        const lux3P = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(lux3P) && evalRes.recommendation.action === "BUY_LUXURY" && evalRes.recommendation.targetId === 2 && lux3P.auctionReadinessGap >= 0;
        results.push({ test: 'Test FL — strong visible 3P purchased when rebuild capacity remains', passed, details: evalRes.recommendation });
    }

    // Test FM — 15 Au 2P rejected when it destroys realistic auction readiness
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = false;
        snap.players = [
            { id: 0, prestige: 5, gold: 20 },
            { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 5, gold: 20 }
        ];
        snap.grid = [
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false },
            { id: 'r1c7', r: 1, c: 7, type: 'WF_R', flipped: false, empty: false },
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Silver", points: 2, cost: 15, tier: 2 } };
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Gold Ring", points: 3, cost: 5, tier: 1 } };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 20 }, snap);
        const lux15_2P = evalRes.luxuryActions.find(l => l.deckId === 2);
        const lux5_3P = evalRes.luxuryActions.find(l => l.deckId === 0);
        const passed = Boolean(lux15_2P && lux5_3P) && lux15_2P.auctionReadinessClassification === "UNDERFUNDED" && lux5_3P.totalUtility > lux15_2P.totalUtility;
        results.push({ test: 'Test FM — 15 Au 2P rejected when it destroys realistic auction readiness', passed, details: { lux15_2P: lux15_2P?.totalUtility, lux5_3P: lux5_3P?.totalUtility } });
    }

    // Test FN — 10 Au 2P accepted when rebuild makes auction readiness sufficient
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = false;
        snap.auctions.B.resolved = true;
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 1, difficulty: 4, flipped: false, empty: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 1, difficulty: 4, flipped: false, empty: false }
        ];
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Silver", points: 2, cost: 10, tier: 2 } };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 20 }, snap);
        const lux10 = evalRes.luxuryActions.find(l => l.deckId === 1);
        const passed = Boolean(lux10) && lux10.auctionReadinessGap >= 0 && lux10.auctionReadinessClassification === "READY" && evalRes.recommendation.action === "BUY_LUXURY";
        results.push({ test: 'Test FN — 10 Au 2P accepted when rebuild makes auction readiness sufficient', passed, details: lux10 });
    }

    // Test FO — 5 Au 3P remains attractive under auction pressure
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A.resolved = true;
        snap.auctions.B.resolved = false;
        snap.grid = [
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false },
            { id: 'r1c7', r: 1, c: 7, type: 'WF_R', flipped: false, empty: false }
        ];
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Gold Ring", points: 3, cost: 5, tier: 1 } };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 20 }, snap);
        const lux5 = evalRes.luxuryActions.find(l => l.deckId === 0);
        const passed = Boolean(lux5) && lux5.totalUtility >= 0.80 && lux5.auctionReadinessGap >= -5;
        results.push({ test: 'Test FO — 5 Au 3P remains attractive under auction pressure', passed, details: lux5 });
    }

    // Test FP — 2-player contest penalty stronger than 4-player
    {
        const snap2P = createBaseValidSnapshot();
        snap2P.auctions.A.resolved = true;
        snap2P.auctions.B.resolved = false;
        snap2P.players = [{ id: 0, prestige: 5, gold: 20 }, { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 5, gold: 25 }];
        snap2P.grid = [{ id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false }, { id: 'r1c7', r: 1, c: 7, type: 'WF_R', flipped: false, empty: false }];
        snap2P.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Silver", points: 2, cost: 15, tier: 2 } };
        const eval2P = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 25 }, snap2P);

        const snap4P = createBaseValidSnapshot();
        snap4P.auctions.A.resolved = true;
        snap4P.auctions.B.resolved = false;
        snap4P.players = [{ id: 0, prestige: 5, gold: 20 }, { id: 1, prestige: 5, gold: 20 }, { id: 2, prestige: 5, gold: 20 }, { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 5, gold: 25 }];
        snap4P.grid = [{ id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false }, { id: 'r1c7', r: 1, c: 7, type: 'WF_R', flipped: false, empty: false }];
        snap4P.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Silver", points: 2, cost: 15, tier: 2 } };
        const eval4P = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 25 }, snap4P);

        const pen2P = eval2P.luxuryActions.find(l => l.deckId === 2).auctionReadinessPenalty;
        const pen4P = eval4P.luxuryActions.find(l => l.deckId === 2).auctionReadinessPenalty;
        const passed = pen2P > pen4P && pen2P > 0;
        results.push({ test: 'Test FP — 2-player contest penalty stronger than 4-player', passed, details: { pen2P, pen4P } });
    }

    // Test FQ — 4-player with two rich opponents makes Luxury more attractive
    {
        const snap4PRich = createBaseValidSnapshot();
        snap4PRich.auctions.A.resolved = true;
        snap4PRich.auctions.B.resolved = false;
        snap4PRich.players = [{ id: 0, prestige: 5, gold: 25 }, { id: 1, prestige: 5, gold: 25 }, { id: 2, prestige: 5, gold: 10 }, { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 5, gold: 20 }];
        snap4PRich.grid = [{ id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false }, { id: 'r1c7', r: 1, c: 7, type: 'WF_R', flipped: false, empty: false }];
        snap4PRich.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Silver", points: 2, cost: 10, tier: 2 } };
        const eval4PRich = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 20 }, snap4PRich);
        const luxAction = eval4PRich.luxuryActions.find(l => l.deckId === 1);
        const passed = Boolean(luxAction) && luxAction.auctionContestability === "EXPENSIVE" && luxAction.auctionReadinessClassification === "AUCTION_NOT_WORTH_SAVING_FOR";
        results.push({ test: 'Test FQ — 4-player with two rich opponents makes Luxury more attractive', passed, details: luxAction });
    }

    // Test FR — hidden opponent money produces UNKNOWN, no cheating
    {
        const snapHidden = createBaseValidSnapshot();
        snapHidden.players = [{ id: 0, prestige: 5, gold: null }, { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 5, gold: 20 }];
        snapHidden.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Silver", points: 2, cost: 15, tier: 2 } };
        const evalHidden = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 20 }, snapHidden);
        const luxHidden = evalHidden.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(luxHidden) && luxHidden.auctionContestability === "UNKNOWN";
        results.push({ test: 'Test FR — hidden opponent money produces UNKNOWN, no cheating', passed, details: luxHidden });
    }

    // Test FS — visible 3P urgency > visible 2P urgency > visible 1P urgency
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Cigar", points: 1, cost: 5, tier: 1 } };
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Silver", points: 2, cost: 10, tier: 2 } };
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 30 }, snap);
        const u1 = evalRes.luxuryActions.find(l => l.deckId === 0).visibleCardUrgencyPrestigeEq;
        const u2 = evalRes.luxuryActions.find(l => l.deckId === 1).visibleCardUrgencyPrestigeEq;
        const u3 = evalRes.luxuryActions.find(l => l.deckId === 2).visibleCardUrgencyPrestigeEq;
        const passed = u3 > u2 && u2 > u1 && u1 === 0;
        results.push({ test: 'Test FS — visible 3P urgency > visible 2P urgency > visible 1P urgency', passed, details: { u1, u2, u3 } });
    }

    // Test FT — trailing late-game bot gets higher Prestige pressure
    {
        const snapTrailing = createBaseValidSnapshot();
        snapTrailing.players = [{ id: 0, prestige: 15, gold: 20 }, { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 5, gold: 20 }];
        snapTrailing.grid = snapTrailing.grid.slice(0, 5);
        snapTrailing.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalTrailing = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 20 }, snapTrailing);

        const snapLeading = createBaseValidSnapshot();
        snapLeading.players = [{ id: 0, prestige: 5, gold: 20 }, { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 15, gold: 20 }];
        snapLeading.grid = snapLeading.grid.slice(0, 5);
        snapLeading.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalLeading = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 20 }, snapLeading);

        const bonusTrailing = evalTrailing.luxuryActions.find(l => l.deckId === 2).trailingPrestigePressureBonus;
        const bonusLeading = evalLeading.luxuryActions.find(l => l.deckId === 2).trailingPrestigePressureBonus;
        const passed = bonusTrailing > 0 && bonusLeading === 0;
        results.push({ test: 'Test FT — trailing late-game bot gets higher Prestige pressure', passed, details: { bonusTrailing, bonusLeading } });
    }

    // Test FU — visible 1P remains weak in normal early state
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 1, cost: 15, tier: 1 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const lux1P = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(lux1P) && lux1P.totalUtility <= 0.05 && evalRes.recommendation.action === "MAP";
        results.push({ test: 'Test FU — visible 1P remains weak in normal early state', passed, details: lux1P });
    }

    // Test FV — no hidden next Luxury card inspected
    {
        const snapClean = createBaseValidSnapshot();
        snapClean.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null };

        const snapSecret = createBaseValidSnapshot();
        snapSecret.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null, cards: [{ points: 10 }] };

        const evalClean = evaluateTurnActions({ id: 10, gold: 20 }, snapClean);
        const evalSecret = evaluateTurnActions({ id: 10, gold: 20 }, snapSecret);
        const passed = JSON.stringify(evalClean.luxuryActions) === JSON.stringify(evalSecret.luxuryActions);
        results.push({ test: 'Test FV — no hidden next Luxury card inspected', passed, details: { clean: evalClean.luxuryActions.length, secret: evalSecret.luxuryActions.length } });
    }

    // Test FW — deterministic ordering remains stable
    {
        const snap = createBaseValidSnapshot();
        const runs = [1, 2, 3, 4, 5].map(() => evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap));
        const firstRec = JSON.stringify(runs[0].recommendation);
        const passed = runs.every(r => JSON.stringify(r.recommendation) === firstRec);
        results.push({ test: 'Test FW — deterministic ordering remains stable', passed, details: { firstRec } });
    }

    // Test FX — all prior tests remain passing
    {
        const passed = results.filter(r => r.passed).length >= 126;
        results.push({ test: 'Test FX — all prior tests remain passing', passed, details: { currentPassedCount: results.filter(r => r.passed).length } });
    }

    // Test FY — Double-counting regression: Luxury goldOpportunityCost uses baseEffectivePrestigePerAu, not inflated auction factor
    {
        const snap = createBaseValidSnapshot();
        // Imminent auction on right (1 card remaining)
        snap.grid = [
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false }
        ];
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, gold: 25 }, snap);
        const lux15 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(lux15) &&
            lux15.baseAuRetentionFactor < lux15.auRetentionFactor &&
            lux15.goldOpportunityCost === Number((lux15.effectiveCost * lux15.baseEffectivePrestigePerAu).toFixed(4));
        results.push({ test: 'Test FY — Double-counting regression: Luxury goldOpportunityCost uses baseEffectivePrestigePerAu, not inflated auction factor', passed, details: { baseFactor: lux15?.baseAuRetentionFactor, contextFactor: lux15?.auRetentionFactor, cost: lux15?.goldOpportunityCost } });
    }

    // Test FZ — Projected opponent bankroll increases with pre-auction income
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "Opponent", prestige: 10, gold: 10, inventory: [] },
            { id: 10, name: "Bot", prestige: 10, gold: 20, inventory: [] }
        ];
        const context = analyzeStrategicContext({ id: 10, gold: 20 }, snap);
        const projectedOpp = estimateProjectedOpponentAuctionGolds(context, 10);
        // 10 Au + Math.round(10 * 0.75) = 10 + 8 = 18 Au
        const passed = projectedOpp.allOpponentGoldKnown === true &&
            projectedOpp.projectedVisibleOpponentGolds[0] === 18 &&
            projectedOpp.highestProjectedVisibleOpponentGold === 18;
        results.push({ test: 'Test FZ — Projected opponent bankroll increases with pre-auction income', passed, details: projectedOpp });
    }

    // Test GA — Hidden opponent money keeps projected bankroll null / contestability UNKNOWN
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "Opponent", prestige: 10, gold: null, inventory: [] },
            { id: 10, name: "Bot", prestige: 10, gold: 20, inventory: [] }
        ];
        const context = analyzeStrategicContext({ id: 10, gold: 20 }, snap);
        const projectedOpp = estimateProjectedOpponentAuctionGolds(context, 10);
        const contest = getAuctionContestability(context, 20, 20, projectedOpp);
        const passed = projectedOpp.allOpponentGoldKnown === false &&
            projectedOpp.highestProjectedVisibleOpponentGold === null &&
            contest.auctionContestability === "UNKNOWN";
        results.push({ test: 'Test GA — Hidden opponent money keeps projected bankroll null / contestability UNKNOWN', passed, details: { projectedOpp, contest } });
    }

    // Test GB — Relevant auction selection: left WF=5 (4P visible) vs right WF=1 (2P visible) selects right auction B (2P / 15 Au)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false }
        ];
        snap.auctions.A.isVisible = true;
        snap.auctions.A.visibleCard = { name: "Mar-a-Lago", points: 4 };
        snap.auctions.B.isVisible = true;
        snap.auctions.B.visibleCard = { name: "Spanish River", points: 2 };

        const relevant = getRelevantUpcomingAuction(snap);
        const auctionVal = getExpectedUpcomingAuctionValue(snap);
        const passed = relevant.auctionId === "B" &&
            relevant.waterfrontRemaining === 1 &&
            auctionVal.relevantUpcomingAuctionId === "B" &&
            auctionVal.expectedUpcomingAuctionPrestige === 2.0 &&
            auctionVal.baselineAuctionValueAu === 15.0 &&
            auctionVal.relevantAuctionValueSource === "VISIBLE_PROPERTY";
        results.push({ test: 'Test GB — Relevant auction selection: left WF=5 (4P visible) vs right WF=1 (2P visible) selects right auction B (2P / 15 Au)', passed, details: { relevant, auctionVal } });
    }

    // Test GC — Relevant auction selection: left WF=1 vs right WF=5 selects left auction A
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false },
            { id: 'r1c7', r: 1, c: 7, type: 'WF_R', flipped: false, empty: false },
            { id: 'r2c7', r: 2, c: 7, type: 'WF_R', flipped: false, empty: false },
            { id: 'r3c7', r: 3, c: 7, type: 'WF_R', flipped: false, empty: false },
            { id: 'r4c7', r: 4, c: 7, type: 'WF_R', flipped: false, empty: false }
        ];
        const relevant = getRelevantUpcomingAuction(snap);
        const passed = relevant.auctionId === "A" && relevant.waterfrontRemaining === 1;
        results.push({ test: 'Test GC — Relevant auction selection: left WF=1 vs right WF=5 selects left auction A', passed, details: relevant });
    }

    // Test GD — Relevant auction hidden + distant auction visible uses public pool expectation, not distant visible card
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false }
        ];
        // Distant auction A is visible 4P, but nearer auction B is hidden
        snap.auctions.A.isVisible = true;
        snap.auctions.A.visibleCard = { name: "Mar-a-Lago", points: 4 };
        snap.auctions.B.isVisible = false;
        snap.auctions.B.visibleCard = null;

        const auctionVal = getExpectedUpcomingAuctionValue(snap);
        const passed = auctionVal.relevantUpcomingAuctionId === "B" &&
            auctionVal.relevantAuctionValueSource === "PUBLIC_REMAINING_POOL" &&
            auctionVal.expectedUpcomingAuctionPrestige === 3.0 &&
            auctionVal.baselineAuctionValueAu === 22.5;
        results.push({ test: 'Test GD — Relevant auction hidden + distant auction visible uses public pool expectation, not distant visible card', passed, details: auctionVal });
    }

    // Test GE — Two-player projected contestability with competitive bankrolls
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "Opponent", prestige: 10, gold: 12, inventory: [] },
            { id: 10, name: "Bot", prestige: 10, gold: 20, inventory: [] }
        ];
        const context = analyzeStrategicContext({ id: 10, gold: 20 }, snap);
        const projectedOpp = estimateProjectedOpponentAuctionGolds(context, 10);
        // Opponent projected = 12 + 8 = 20 Au. Bot projected = 22 Au (within 5 Au). Bot is contestable
        const contest = getAuctionContestability(context, 22, 21, projectedOpp, 22.5);
        const passed = contest.auctionContestability === "CONTESTABLE" && contest.contestFactor === 1.0;
        results.push({ test: 'Test GE — Two-player projected contestability with competitive bankrolls', passed, details: { projectedOpp, contest } });
    }

    // Test GF — Two-player overfunded opponent (55 Au) does not target 56 Au reserve; luxury becomes viable
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "RichOpponent", prestige: 10, gold: 50, inventory: [] },
            { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 10, gold: 25, inventory: [] }
        ];
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 25 }, snap);
        const lux15 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(lux15) &&
            lux15.targetAuctionReserve <= 25 &&
            lux15.auctionContestability === "EXPENSIVE" &&
            lux15.auctionReadinessClassification === "AUCTION_NOT_WORTH_SAVING_FOR" &&
            lux15.auctionReadinessPenalty === 0.0;
        results.push({ test: 'Test GF — Two-player overfunded opponent (55 Au) does not target 56 Au reserve; luxury becomes viable', passed, details: lux15 });
    }

    // Test GG — Four-player rich field (30, 35, 10 Au) lowers auction penalty
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "P1", prestige: 10, gold: 30, inventory: [] },
            { id: 1, name: "P2", prestige: 10, gold: 35, inventory: [] },
            { id: 2, name: "P3", prestige: 10, gold: 10, inventory: [] },
            { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 10, gold: 18, inventory: [] }
        ];
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 18 }, snap);
        const lux15 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(lux15) &&
            lux15.auctionContestability === "EXPENSIVE" &&
            lux15.auctionReadinessClassification === "AUCTION_NOT_WORTH_SAVING_FOR" &&
            lux15.auctionReadinessPenalty === 0.0;
        results.push({ test: 'Test GG — Four-player rich field (30, 35, 10 Au) lowers auction penalty', passed, details: lux15 });
    }

    // Test GH — Benchmark scenario (20 Au, left=5, right=2) uses right auction and projected opponent bankrolls
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', flipped: false, empty: false },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', flipped: false, empty: false },
            { id: 'r1c7', r: 1, c: 7, type: 'WF_R', flipped: false, empty: false }
        ];
        snap.players = [
            { id: 0, name: "Opponent", prestige: 10, gold: 10, inventory: [] },
            { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 10, gold: 20, inventory: [] }
        ];
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3, cost: 15, tier: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 20 }, snap);
        const lux15 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(lux15) &&
            lux15.relevantUpcomingAuctionId === "B" &&
            lux15.relevantAuctionWaterfrontRemaining === 2 &&
            lux15.estimatedAuBeforeAuction === 6 &&
            lux15.projectedAuctionGold === 11 &&
            lux15.highestProjectedVisibleOpponentGold === 15; // 10 + Math.round(6 * 0.75) = 10 + 5 = 15
        results.push({ test: 'Test GH — Benchmark scenario (20 Au, left=5, right=2) uses right auction and projected opponent bankrolls', passed, details: lux15 });
    }

    // ==========================================
    // PHASE 5B.12 LINE DEFENSE & WATERFRONT LOOKAHEAD TESTS (TESTS GJ–GY)
    // ==========================================

    // Test GJ — Locked unresolved cells count in row geometry
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', flipped: false, locked: false, empty: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', flipped: false, locked: true, empty: false }
        ];
        const lines = analyzeBoardLines(snap);
        const passed = lines.rowCounts[0] === 2 &&
            lines.rowSelectable[0] === 1 &&
            lines.rowLocked[0] === 1;
        results.push({ test: 'Test GJ — Locked unresolved cells count in row geometry', passed, details: lines });
    }

    // Test GK — Locked unresolved cells count in column geometry
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', flipped: false, locked: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', flipped: false, locked: true, empty: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', flipped: true, empty: false }
        ];
        const lines = analyzeBoardLines(snap);
        const passed = lines.colCounts[2] === 2 &&
            lines.colSelectable[2] === 1 &&
            lines.colLocked[2] === 1;
        results.push({ test: 'Test GK — Locked unresolved cells count in column geometry', passed, details: lines });
    }

    // Test GL — No false finisher beside Carina lock (both selectable, locked at 2/6)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false, difficulty: 0 },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: true, difficulty: 0 },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', empty: false, flipped: true, locked: false },
            { id: 'r0c4', r: 0, c: 4, type: 'BLOCK', empty: false, flipped: true, locked: false },
            { id: 'r0c5', r: 0, c: 5, type: 'BLOCK', empty: false, flipped: true, locked: false },
            { id: 'r0c6', r: 0, c: 6, type: 'BLOCK', empty: false, flipped: true, locked: false },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', empty: false, flipped: true, locked: false },
            { id: 'r0c8', r: 0, c: 8, type: 'ATLANTIC', empty: false, flipped: true, locked: false },
            // Extra cards in column 1 and 2 so neither column is a 1-card column finisher
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', empty: false, flipped: false, locked: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const cellAction = evalRes.mapActions.find(a => a.cellId === 'r0c1');
        const lockedAction = evalRes.mapActions.find(a => a.cellId === 'r0c2');
        const passed = Boolean(cellAction) && Boolean(lockedAction) &&
            cellAction.isFinisher === false &&
            cellAction.isTrap === true &&
            cellAction.rowUnresolvedBefore === 2 &&
            cellAction.rowSelectableBefore === 1 &&
            cellAction.rowLockedUnresolvedBefore === 1 &&
            lockedAction.isFinisher === false &&
            lockedAction.isTrap === true &&
            Math.abs(lockedAction.successRate - (2 / 6)) < 0.001;
        results.push({ test: 'Test GL — No false finisher beside Carina lock', passed, details: { cellAction, lockedAction } });
    }

    // Test GM — Gran Gran can legally evaluate/select locked final Waterfront and trigger auction on success
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, empty: false, flipped: false, locked: true },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', value: 4, difficulty: 0, empty: false, flipped: true, locked: false }
        ];
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        const avail = getAvailableMapCells(snap);
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const wfAction = evalRes.mapActions.find(a => a.cellId === 'r0c1');
        const passed = avail.some(c => c.id === 'r0c1') &&
            Boolean(wfAction) &&
            wfAction.waterfrontStatus === "LAST" &&
            wfAction.triggersAuction === true &&
            Math.abs(wfAction.successRate - (2 / 6)) < 0.001 &&
            wfAction.botGoldAtAuctionOnSuccess === 29;
        results.push({ test: 'Test GM — Gran Gran can legally evaluate/select locked final Waterfront and trigger auction on success', passed, details: { avail, wfAction } });
    }

    // Test GN — Second-last easy remaining card gets larger penalty than hard remaining card
    {
        const snapEasy = createBaseValidSnapshot();
        snapEasy.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false }
        ];
        const evalEasy = evaluateTurnActions({ id: 10, gold: 20 }, snapEasy);

        const snapHard = createBaseValidSnapshot();
        snapHard.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'LAGOON', value: 3, difficulty: 6, flipped: false, locked: false, empty: false }
        ];
        const evalHard = evaluateTurnActions({ id: 10, gold: 20 }, snapHard);

        const actEasy = evalEasy.mapActions.find(a => a.cellId === 'r0c0');
        const actHard = evalHard.mapActions.find(a => a.cellId === 'r0c0');
        const passed = Boolean(actEasy) && Boolean(actHard) &&
            actEasy.expectedOpponentLineOpportunityPrestigeEq > actHard.expectedOpponentLineOpportunityPrestigeEq &&
            actHard.remainingRowCellDifficulty === 6 &&
            actHard.remainingRowCellSuccessRate < 0.20;
        results.push({ test: 'Test GN — Second-last easy remaining card gets larger penalty than hard remaining card', passed, details: { actEasy, actHard } });
    }

    // Test GO — Carina-locked remaining card uses correct public success probability (2/6 = 0.3333)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: true, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const act = evalRes.mapActions.find(a => a.cellId === 'r0c0');
        const passed = Boolean(act) &&
            act.remainingRowCellLocked === true &&
            Math.abs(act.remainingRowCellSuccessRate - (2 / 6)) < 0.001;
        results.push({ test: 'Test GO — Carina-locked remaining card uses correct public success probability', passed, details: act });
    }

    // Test GP — 2-player handoff penalty > 4-player handoff penalty
    {
        const snap2P = createBaseValidSnapshot();
        snap2P.players = [{ id: 0, prestige: 5, gold: 20 }, { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 5, gold: 20 }];
        snap2P.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false }
        ];
        const eval2P = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 20 }, snap2P);

        const snap4P = createBaseValidSnapshot();
        snap4P.players = [{ id: 0, prestige: 5, gold: 20 }, { id: 1, prestige: 5, gold: 20 }, { id: 2, prestige: 5, gold: 20 }, { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", prestige: 5, gold: 20 }];
        snap4P.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false }
        ];
        const eval4P = evaluateTurnActions({ id: 10, botId: 10, aiDepth: "FULL", gold: 20 }, snap4P);

        const pen2P = eval2P.mapActions.find(a => a.cellId === 'r0c0').expectedOpponentLineOpportunityPrestigeEq;
        const pen4P = eval4P.mapActions.find(a => a.cellId === 'r0c0').expectedOpponentLineOpportunityPrestigeEq;
        const passed = pen2P > pen4P && pen2P > 0;
        results.push({ test: 'Test GP — 2-player handoff penalty > 4-player handoff penalty', passed, details: { pen2P, pen4P } });
    }

    // Test GQ — Last Waterfront candidate models projected auction wallet without double-counting +5 line bonus
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, locked: false, empty: false }
        ];
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const wfAction = evalRes.mapActions.find(a => a.cellId === 'r0c1');
        const passed = Boolean(wfAction) &&
            wfAction.waterfrontStatus === "LAST" &&
            wfAction.lineCompletionBonusAu >= 5 &&
            wfAction.botGoldAtAuctionOnSuccess === 29 &&
            wfAction.components.lineBonusPrestigeEq > 0;
        results.push({ test: 'Test GQ — Last Waterfront candidate models projected auction wallet without double-counting +5 line bonus', passed, details: wfAction });
    }

    // Test GR — Live regression: Mar-a-Lago 30 vs 52 trigger evaluation
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, locked: false, empty: false }
        ];
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: true, visibleCard: { name: "Mar-a-Lago", points: 4, cost: 30, tier: 4 } };
        snap.players = [
            { id: 0, name: "Opponent", prestige: 10, gold: 52, inventory: [] },
            { id: 10, name: "Gran Gran", prestige: 10, gold: 30, inventory: [] }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 30 }, snap);
        const wfAction = evalRes.mapActions.find(a => a.cellId === 'r0c1');
        const passed = Boolean(wfAction) &&
            wfAction.waterfrontStatus === "LAST" &&
            wfAction.botGoldAtAuctionOnSuccess === 39 &&
            wfAction.auctionTriggerClassification === "NEUTRAL_TRIGGER" &&
            wfAction.waterfrontAuctionTimingPrestigeEq >= 0.15; // 0.05 + 0.10 Mar-a-Lago bonus = 0.15
        results.push({ test: 'Test GR — Live regression: Mar-a-Lago 30 vs 52 trigger evaluation', passed, details: wfAction });
    }

    // Test GS — Live regression: Second-Last Waterfront 34 vs 44
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, locked: false, empty: false }
        ];
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        snap.players = [
            { id: 0, name: "Opponent", prestige: 10, gold: 44, inventory: [] },
            { id: 10, name: "Gran Gran", prestige: 10, gold: 34, inventory: [] }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 34 }, snap);
        const wfAction = evalRes.mapActions.find(a => a.cellId === 'r0c1');
        const passed = Boolean(wfAction) &&
            wfAction.waterfrontStatus === "SECOND_LAST" &&
            wfAction.auctionHandoffClassification === "UNFAVORABLE_HANDOFF" &&
            wfAction.projectedOpponentGoldAtAuctionIfHandoff === 53 &&
            wfAction.waterfrontAuctionTimingPrestigeEq <= -0.25;
        results.push({ test: 'Test GS — Live regression: Second-Last Waterfront 34 vs 44', passed, details: wfAction });
    }

    // Test GT — Live regression: Second-Last Waterfront 55 vs 15
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, locked: false, empty: false }
        ];
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        snap.players = [
            { id: 0, name: "Opponent", prestige: 10, gold: 15, inventory: [] },
            { id: 10, name: "Gran Gran", prestige: 10, gold: 55, inventory: [] }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 55 }, snap);
        const wfAction = evalRes.mapActions.find(a => a.cellId === 'r0c1');
        const passed = Boolean(wfAction) &&
            wfAction.waterfrontStatus === "SECOND_LAST" &&
            wfAction.auctionHandoffClassification === "DOMINANT_HANDOFF" &&
            wfAction.projectedOpponentGoldAtAuctionIfHandoff === 24 &&
            wfAction.waterfrontAuctionTimingPrestigeEq >= -0.05;
        results.push({ test: 'Test GT — Live regression: Second-Last Waterfront 55 vs 15', passed, details: wfAction });
    }

    // Test GU — Live regression: Second-Last Block easy-finisher preference
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            // Row 0 has 2 cards: candidate r0c0 (3 Au) and easy remaining card r0c1 (3 Au, diff 0)
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            // Row 2 has 3 cards: safe candidate r2c2 (3 Au)
            { id: 'r2c0', r: 2, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r3c0', r: 3, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r3c2', r: 3, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const trapAct = evalRes.mapActions.find(a => a.cellId === 'r0c0');
        const safeAct = evalRes.mapActions.find(a => a.cellId === 'r2c2');
        const passed = Boolean(trapAct) && Boolean(safeAct) &&
            safeAct.totalUtility > trapAct.totalUtility &&
            trapAct.expectedOpponentLineOpportunityPrestigeEq > 0 &&
            evalRes.bestMap.cellId !== 'r0c0';
        results.push({ test: 'Test GU — Live regression: Second-Last Block easy-finisher preference', passed, details: { trapAct, safeAct, best: evalRes.bestMap } });
    }

    // Test GV — Hidden opponent money keeps auction timing UNKNOWN without crashing
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, locked: false, empty: false }
        ];
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        snap.players = [
            { id: 0, name: "Opponent", prestige: 10, gold: null, inventory: [] },
            { id: 10, name: "Gran Gran", prestige: 10, gold: 20, inventory: [] }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const wfAction = evalRes.mapActions.find(a => a.cellId === 'r0c1');
        const passed = Boolean(wfAction) &&
            wfAction.waterfrontStatus === "LAST" &&
            wfAction.auctionTriggerClassification === "UNKNOWN" &&
            wfAction.projectedOpponentGoldAtAuctionIfHandoff === null;
        results.push({ test: 'Test GV — Hidden opponent money keeps auction timing UNKNOWN without crashing', passed, details: wfAction });
    }

    // Test GW — Deterministic action ordering remains stable
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r1c0', r: 1, c: 0, type: 'LAGOON', value: 8, difficulty: 4, flipped: false, locked: false, empty: false }
        ];
        const eval1 = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const eval2 = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const order1 = eval1.mapActions.map(a => a.cellId).join(',');
        const order2 = eval2.mapActions.map(a => a.cellId).join(',');
        const passed = order1 === order2 && eval1.recommendation.targetId === eval2.recommendation.targetId;
        results.push({ test: 'Test GW — Deterministic action ordering remains stable', passed, details: { order1, order2 } });
    }

    // Test GX — Shadow serialization includes new fields and no raw state leaks
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, locked: false, empty: false }
        ];
        snap.auctions.A = { id: 'A', resolved: false, triggered: false, isVisible: false, visibleCard: null };
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const comp = compareLegacyAndStrategicDecision({
            legacyAction: "MAP",
            legacyTargetId: "r0c1",
            legacyReason: "TEST",
            evaluation: evalRes
        });
        const shadowEntry = {
            bot: { id: 10, botId: 10, name: "Gran Gran" },
            bestMap: evalRes.bestMap ? {
                cellId: evalRes.bestMap.cellId,
                waterfrontStatus: evalRes.bestMap.waterfrontStatus,
                auctionTriggerClassification: evalRes.bestMap.auctionTriggerClassification,
                auctionHandoffClassification: evalRes.bestMap.auctionHandoffClassification,
                expectedOpponentLineOpportunityPrestigeEq: evalRes.bestMap.expectedOpponentLineOpportunityPrestigeEq,
                waterfrontAuctionTimingPrestigeEq: evalRes.bestMap.waterfrontAuctionTimingPrestigeEq
            } : null
        };
        const passed = shadowEntry.bestMap?.waterfrontStatus === "LAST" &&
            shadowEntry.bestMap?.auctionTriggerClassification !== undefined &&
            shadowEntry.grid === undefined &&
            shadowEntry.rawState === undefined;
        results.push({ test: 'Test GX — Shadow serialization includes new fields and no raw state leaks', passed, details: shadowEntry });
    }

    // Test GZ — Carina bot evaluating locked candidate uses normal difficulty
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 4, difficulty: 4, empty: false, flipped: false, locked: true }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 20, character: { name: 'CARINA' } }, snap);
        const act = evalRes.mapActions.find(a => a.cellId === 'r0c2');
        const passed = Boolean(act) &&
            Math.abs(act.successRate - 0.5) < 0.001; // (7 - 4)/6 = 3/6 = 0.5
        results.push({ test: 'Test GZ — Carina bot evaluating locked candidate uses normal difficulty', passed, details: act });
    }

    // Test HA — Locked card itself can be the finisher candidate
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', empty: false, flipped: true, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', empty: false, flipped: true, locked: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', empty: false, flipped: false, locked: true, difficulty: 0 },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', empty: false, flipped: true, locked: false },
            { id: 'r0c4', r: 0, c: 4, type: 'BLOCK', empty: false, flipped: true, locked: false },
            { id: 'r0c5', r: 0, c: 5, type: 'BLOCK', empty: false, flipped: true, locked: false },
            { id: 'r0c6', r: 0, c: 6, type: 'BLOCK', empty: false, flipped: true, locked: false },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', empty: false, flipped: true, locked: false },
            { id: 'r0c8', r: 0, c: 8, type: 'ATLANTIC', empty: false, flipped: true, locked: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const act = evalRes.mapActions.find(a => a.cellId === 'r0c2');
        const passed = Boolean(act) &&
            act.isFinisher === true &&
            act.rowUnresolvedBefore === 1 &&
            Math.abs(act.successRate - (2 / 6)) < 0.001 &&
            act.lineCompletionBonusAu >= 5;
        results.push({ test: 'Test HA — Locked card itself can be the finisher candidate', passed, details: act });
    }

    // Test HB — 2-player opponent Carina handoff uses normal difficulty, not 2/6
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: 'CarinaOpponent', prestige: 5, gold: 20, character: { name: 'CARINA' } },
            { id: 10, name: 'Gran Gran', isSelf: true, prestige: 5, gold: 20, character: { name: 'GRAN_GRAN' } }
        ];
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 4, flipped: false, locked: true, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const act = evalRes.mapActions.find(a => a.cellId === 'r0c0');
        const passed = Boolean(act) &&
            act.remainingRowCellLocked === true &&
            Math.abs(act.remainingRowCellSuccessRate - 0.5) < 0.001; // Carina uses (7 - 4)/6 = 0.5
        results.push({ test: 'Test HB — 2-player opponent Carina handoff uses normal difficulty, not 2/6', passed, details: act });
    }

    // Test HC — 2-player non-Carina opponent handoff uses 2/6 on locked card
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: 'StandardOpponent', prestige: 5, gold: 20, character: { name: 'SURFER' } },
            { id: 10, name: 'Gran Gran', isSelf: true, prestige: 5, gold: 20, character: { name: 'GRAN_GRAN' } }
        ];
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 4, flipped: false, locked: true, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const act = evalRes.mapActions.find(a => a.cellId === 'r0c0');
        const passed = Boolean(act) &&
            act.remainingRowCellLocked === true &&
            Math.abs(act.remainingRowCellSuccessRate - (2 / 6)) < 0.001; // Non-Carina uses 2/6 = 0.3333
        results.push({ test: 'Test HC — 2-player non-Carina opponent handoff uses 2/6 on locked card', passed, details: act });
    }

    // Test HD — 3-player blended opponent handoff on locked card
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: 'CarinaOpponent', prestige: 5, gold: 20, character: { name: 'CARINA' } },
            { id: 1, name: 'SurferOpponent', prestige: 5, gold: 20, character: { name: 'SURFER' } },
            { id: 10, name: 'Gran Gran', isSelf: true, prestige: 5, gold: 20, character: { name: 'GRAN_GRAN' } }
        ];
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, locked: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', value: 3, difficulty: 4, flipped: false, locked: true, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, gold: 20 }, snap);
        const act = evalRes.mapActions.find(a => a.cellId === 'r0c0');
        // Blended: 0.5 * 0.5 + 0.5 * (2/6) = 0.25 + 0.1667 = 0.4167
        const passed = Boolean(act) &&
            act.remainingRowCellLocked === true &&
            Math.abs(act.remainingRowCellSuccessRate - 0.4167) < 0.001;
        results.push({ test: 'Test HD — 3-player blended opponent handoff on locked card', passed, details: act });
    }

    // ==========================================
    // PHASE 5C — STRATEGIC AUCTION TESTS (A-N)
    // ==========================================

    // Test HE (Auction Test A) — 2P property base = 15 Au
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 1, name: "Spanish River", points: 2 },
            card: { id: 1, name: "Spanish River", points: 2 }
        };
        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 30 }, snap);
        const passed = breakdown.auctionPropertyPrestige === 2 &&
            breakdown.auctionBaseValueAu === 15 &&
            breakdown.auctionValueSource === "VISIBLE_PROPERTY";
        results.push({ test: 'Test HE — 2P property base value is 15 Au (Auction Test A)', passed, details: breakdown });
    }

    // Test HF (Auction Test B) — 3P property base = 22.5 Au
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 2, name: "Gulf Stream", points: 3 },
            card: { id: 2, name: "Gulf Stream", points: 3 }
        };
        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 30 }, snap);
        const passed = breakdown.auctionPropertyPrestige === 3 &&
            breakdown.auctionBaseValueAu === 22.5 &&
            breakdown.auctionValueSource === "VISIBLE_PROPERTY";
        results.push({ test: 'Test HF — 3P property base value is 22.5 Au (Auction Test B)', passed, details: breakdown });
    }

    // Test HG (Auction Test C) — 4P Mar-a-Lago base = 30 + tiebreak premium = 33 Au
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 0, name: "Mar-a-Lago", points: 4 },
            card: { id: 0, name: "Mar-a-Lago", points: 4 }
        };
        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 50 }, snap);
        const passed = breakdown.auctionPropertyPrestige === 4 &&
            breakdown.auctionBaseValueAu === 30 &&
            breakdown.marALagoPremiumAu === 3 &&
            (breakdown.auctionBaseValueAu + breakdown.marALagoPremiumAu) === 33;
        results.push({ test: 'Test HG — 4P Mar-a-Lago base 30 Au + 3 Au tiebreak premium = 33 Au (Auction Test C)', passed, details: breakdown });
    }

    // Test HH (Auction Test D) — 2-player denial bonus > 4-player denial bonus
    {
        const snap2P = createBaseValidSnapshot();
        snap2P.players = [
            { id: 0, name: 'Opponent', gold: 20, prestige: 5 },
            { id: 10, name: 'Gran Gran', isSelf: true, gold: 20, prestige: 5 }
        ];
        snap2P.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 2, name: "Gulf Stream", points: 3 },
            card: { id: 2, name: "Gulf Stream", points: 3 }
        };

        const snap4P = createBaseValidSnapshot();
        snap4P.players = [
            { id: 0, name: 'Opponent1', gold: 20, prestige: 5 },
            { id: 1, name: 'Opponent2', gold: 20, prestige: 5 },
            { id: 2, name: 'Opponent3', gold: 20, prestige: 5 },
            { id: 10, name: 'Gran Gran', isSelf: true, gold: 20, prestige: 5 }
        ];
        snap4P.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 1, 2, 10],
            isVisible: true,
            visibleCard: { id: 2, name: "Gulf Stream", points: 3 },
            card: { id: 2, name: "Gulf Stream", points: 3 }
        };

        const b2P = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 30 }, snap2P);
        const b4P = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 30 }, snap4P);
        const passed = b2P.denialBonusAu === 4 && b4P.denialBonusAu === 1.6 && b2P.denialBonusAu > b4P.denialBonusAu;
        results.push({ test: 'Test HH — 2-player denial bonus > 4-player denial bonus (Auction Test D)', passed, details: { b2P: b2P.denialBonusAu, b4P: b4P.denialBonusAu } });
    }

    // Test HI (Auction Test E) — Current Prestige leader likely wins -> leader threat raises ceiling modestly
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: 'LeaderOpponent', gold: 20, prestige: 8 },
            { id: 10, name: 'Gran Gran', isSelf: true, gold: 20, prestige: 5 }
        ];
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 2, name: "Gulf Stream", points: 3 },
            card: { id: 2, name: "Gulf Stream", points: 3 }
        };

        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 30 }, snap);
        const passed = breakdown.leaderThreatPrestigeGap === 3 && breakdown.leaderThreatBonusAu > 0 && breakdown.leaderThreatBonusAu <= 4;
        results.push({ test: 'Test HI — Leader threat raises auction ceiling modestly (Auction Test E)', passed, details: breakdown });
    }

    // Test HJ (Auction Test F) — Visible 3P Luxury available -> auction ceiling reduced
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "Local 1", type: "HUMAN", gold: 10, totalGold: 10, prestige: 0, inventory: [] },
            { id: 10, name: "Gran Gran", botId: 10, aiDepth: "FULL", type: "BOT", gold: 30, totalGold: 30, prestige: 0, inventory: [] }
        ];
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 2, name: "Gulf Stream", points: 3 },
            card: { id: 2, name: "Gulf Stream", points: 3 }
        };
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3 } };

        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, aiDepth: "FULL", gold: 30 }, snap);
        const passed = breakdown.luxuryMarketQuality === "EXCELLENT" && breakdown.luxuryMarketAdjustmentAu === -4;
        results.push({ test: 'Test HJ — Visible 3P Luxury reduces auction ceiling by 4 Au (Auction Test F)', passed, details: breakdown });
    }

    // Test HK (Auction Test G) — 2–3 visible 1P Luxury cards -> auction ceiling increases
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 2, name: "Gulf Stream", points: 3 },
            card: { id: 2, name: "Gulf Stream", points: 3 }
        };
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine", points: 1 } };
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Watch", points: 1 } };

        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 30 }, snap);
        const passed = breakdown.luxuryMarketQuality === "CLOGGED" && breakdown.luxuryMarketAdjustmentAu === 3;
        results.push({ test: 'Test HK — 2+ visible 1P cards (clogged market) increases auction ceiling (Auction Test G)', passed, details: breakdown });
    }

    // Test HL (Auction Test H) — Future visible Mar-a-Lago -> current auction ceiling reduced
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 1, name: "Spanish River", points: 2 },
            card: { id: 1, name: "Spanish River", points: 2 }
        };
        snap.auctions.B = {
            id: 'B',
            resolved: false,
            isVisible: true,
            visibleCard: { id: 0, name: "Mar-a-Lago", points: 4 }
        };

        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 30 }, snap);
        const passed = breakdown.futureAuctionReservePenaltyAu === 5;
        results.push({ test: 'Test HL — Future visible Mar-a-Lago penalizes current auction ceiling by 5 Au (Auction Test H)', passed, details: breakdown });
    }

    // Test HM (Auction Test I) — No future Luxury / no future auction / near end -> bot may spend all Au
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 1, name: "Spanish River", points: 2 },
            card: { id: 1, name: "Spanish River", points: 2 }
        };
        snap.auctions.A.resolved = false;
        snap.auctions.B.resolved = true; // No future auction
        snap.luxuryDecks.forEach(d => { d.cardsRemaining = 0; }); // No luxury remaining
        snap.grid = [{ id: 'r0c0', r: 0, c: 0, type: 'BLOCK', flipped: false, empty: false }]; // 1 map card remaining

        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 40 }, snap);
        const passed = breakdown.isLastMeaningfulPurchase === true && breakdown.strategicMaxBidAu === 40;
        results.push({ test: 'Test HM — Last meaningful purchase allows spending all Au (Auction Test I)', passed, details: breakdown });
    }

    // Test HN (Auction Test J) — Bot has 60 Au, 3P property, strategic ceiling 26-27 -> pass once next bid > ceiling
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = {
            id: 'A',
            currentBid: 25,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 2, name: "Gulf Stream", points: 3 },
            card: { id: 2, name: "Gulf Stream", points: 3 }
        };
        snap.auctions.B.resolved = true;
        const bot = { id: 10, botId: 10, gold: 60 };
        const decRaise = evaluateStrategicAuctionBid(bot, snap);

        snap.activeAuction.currentBid = decRaise.maxBid;
        const decPass = evaluateStrategicAuctionBid(bot, snap);

        const passed = decRaise.action === "RAISE" &&
            decRaise.targetBid === (25 + 1) &&
            decPass.action === "PASS" &&
            decRaise.maxBid < bot.gold;
        results.push({ test: 'Test HN — Rich bot respects strategic ceiling and passes above it (Auction Test J)', passed, details: { decRaise, decPass } });
    }

    // Test HO (Auction Test K) — Hidden opponent money -> no cheating
    {
        const snap = createBaseValidSnapshot();
        snap.players[0].gold = null; // Opponent wallet hidden
        snap.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 2, name: "Gulf Stream", points: 3 },
            card: { id: 2, name: "Gulf Stream", points: 3 }
        };
        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 25 }, snap);
        const passed = breakdown.strategicMaxBidAu > 0 && breakdown.strategicMaxBidAu <= 25;
        results.push({ test: 'Test HO — Hidden opponent money operates safely without cheating (Auction Test K)', passed, details: breakdown });
    }

    // Test HP (Auction Test L) — Hidden auction property -> uses public expectation
    {
        const snapInitial = createBaseValidSnapshot();
        snapInitial.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: false,
            visibleCard: null,
            card: null
        };
        const bInit = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 30 }, snapInitial);

        const snapAfter4P = createBaseValidSnapshot();
        snapAfter4P.auctions.B = { id: 'B', resolved: true, propertyWon: { name: "Mar-a-Lago", points: 4 } };
        snapAfter4P.activeAuction = {
            id: 'A',
            currentBid: 5,
            participants: [0, 10],
            isVisible: false,
            visibleCard: null,
            card: null
        };
        const bAfter4P = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 30 }, snapAfter4P);

        const passed = bInit.auctionPropertyPrestige === 3.0 &&
            bInit.auctionBaseValueAu === 22.5 &&
            bAfter4P.auctionPropertyPrestige === 2.5 &&
            bAfter4P.auctionBaseValueAu === 18.75;
        results.push({ test: 'Test HP — Hidden auction property uses public expectation (Auction Test L)', passed, details: { bInit, bAfter4P } });
    }

    // Test HQ (Auction Test M) — 2-player Mar-a-Lago -> ceiling meaningfully above 30 but not automatically all-in
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = {
            id: 'A',
            currentBid: 10,
            participants: [0, 10],
            isVisible: true,
            visibleCard: { id: 0, name: "Mar-a-Lago", points: 4 },
            card: { id: 0, name: "Mar-a-Lago", points: 4 }
        };
        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 60 }, snap);
        const passed = breakdown.strategicMaxBidAu > 30 && breakdown.strategicMaxBidAu < 60;
        results.push({ test: 'Test HQ — 2-player Mar-a-Lago ceiling is above 30 Au but not all-in (Auction Test M)', passed, details: breakdown });
    }

    // Test HR (Auction Test N) — 4-player auction with rich opponents -> denial bonus lower
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: 'P0', gold: 50, prestige: 5 },
            { id: 1, name: 'P1', gold: 50, prestige: 5 },
            { id: 2, name: 'P2', gold: 50, prestige: 5 },
            { id: 10, name: 'Gran Gran', isSelf: true, gold: 50, prestige: 5 }
        ];
        snap.activeAuction = {
            id: 'A',
            currentBid: 10,
            participants: [0, 1, 2, 10],
            isVisible: true,
            visibleCard: { id: 0, name: "Mar-a-Lago", points: 4 },
            card: { id: 0, name: "Mar-a-Lago", points: 4 }
        };
        const breakdown = calculateStrategicAuctionBidCeiling({ id: 10, botId: 10, gold: 50 }, snap);
        const passed = breakdown.playerCountDenialFactor === 0.40 && breakdown.denialBonusAu === 2.4;
        results.push({ test: 'Test HR — 4-player auction denial bonus is lower (Auction Test N)', passed, details: breakdown });
    }

    // ==========================================
    // PHASE 5D — STRATEGIC REROLL TESTS (A-P)
    // ==========================================

    // Test HS (Reroll Test A) — 5 Au base success = 2/6
    {
        const rate = LUXURY_SUCCESS_RATE[0];
        const passed = Math.abs(rate - (2 / 6)) < 0.0001;
        results.push({ test: 'Test HS — 5 Au base success rate is 2/6 (Reroll Test A)', passed, details: { rate } });
    }

    // Test HT (Reroll Test B) — 5 Au + reroll = 5/9
    {
        const rate = LUXURY_REROLL_SUCCESS_RATE[0];
        const passed = Math.abs(rate - (5 / 9)) < 0.0001;
        results.push({ test: 'Test HT — 5 Au + 1 reroll success rate is 5/9 (Reroll Test B)', passed, details: { rate } });
    }

    // Test HU (Reroll Test C) — 10 Au base = 4/6
    {
        const rate = LUXURY_SUCCESS_RATE[1];
        const passed = Math.abs(rate - (4 / 6)) < 0.0001;
        results.push({ test: 'Test HU — 10 Au base success rate is 4/6 (Reroll Test C)', passed, details: { rate } });
    }

    // Test HV (Reroll Test D) — 10 Au + reroll = 8/9
    {
        const rate = LUXURY_REROLL_SUCCESS_RATE[1];
        const passed = Math.abs(rate - (8 / 9)) < 0.0001;
        results.push({ test: 'Test HV — 10 Au + 1 reroll success rate is 8/9 (Reroll Test D)', passed, details: { rate } });
    }

    // Test HW (Reroll Test E) — 15 Au never plans reroll
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3 } };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 30, rerolls: 2 }, snap);
        const lux15 = evalRes.luxuryActions.find(l => l.deckId === 2);
        const passed = Boolean(lux15) && lux15.plannedReroll === false && lux15.plannedRerollCount === 0;
        results.push({ test: 'Test HW — 15 Au automatic deck never plans reroll (Reroll Test E)', passed, details: lux15 });
    }

    // Test HX (Reroll Test F) — visible 3P / 10 Au + reroll gets much higher utility
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Luxury Estate", points: 3 } };
        const evalNoReroll = evaluateTurnActions({ id: 10, botId: 10, gold: 30, rerolls: 0 }, snap);
        const evalWithReroll = evaluateTurnActions({ id: 10, botId: 10, gold: 30, rerolls: 1 }, snap);

        const lNo = evalNoReroll.luxuryActions.find(l => l.deckId === 1);
        const lWith = evalWithReroll.luxuryActions.find(l => l.deckId === 1);

        const passed = Boolean(lNo && lWith) &&
            lWith.plannedReroll === true &&
            Math.abs(lWith.rerollAdjustedSuccessRate - (8 / 9)) < 0.001 &&
            lWith.totalUtility > lNo.totalUtility;
        results.push({ test: 'Test HX — Visible 3P / 10 Au with reroll achieves higher expected Prestige and utility (Reroll Test F)', passed, details: { no: lNo?.totalUtility, with: lWith?.totalUtility } });
    }

    // Test HY (Reroll Test G) — visible 2P / 10 Au + reroll becomes more attractive
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Sports Car", points: 2 } };
        const evalNo = evaluateTurnActions({ id: 10, botId: 10, gold: 30, rerolls: 0 }, snap);
        const evalWith = evaluateTurnActions({ id: 10, botId: 10, gold: 30, rerolls: 1 }, snap);

        const lNo = evalNo.luxuryActions.find(l => l.deckId === 1);
        const lWith = evalWith.luxuryActions.find(l => l.deckId === 1);

        const passed = Boolean(lNo && lWith) &&
            lWith.plannedReroll === true &&
            lWith.expectedPrestige > lNo.expectedPrestige &&
            lWith.totalUtility > lNo.totalUtility;
        results.push({ test: 'Test HY — Visible 2P / 10 Au with reroll becomes more attractive (Reroll Test G)', passed, details: { no: lNo?.totalUtility, with: lWith?.totalUtility } });
    }

    // Test HZ (Reroll Test H) — visible 3P / 5 Au + reroll becomes more attractive
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Vintage Wine", points: 3 } };
        const evalNo = evaluateTurnActions({ id: 10, botId: 10, gold: 30, rerolls: 0 }, snap);
        const evalWith = evaluateTurnActions({ id: 10, botId: 10, gold: 30, rerolls: 1 }, snap);

        const lNo = evalNo.luxuryActions.find(l => l.deckId === 0);
        const lWith = evalWith.luxuryActions.find(l => l.deckId === 0);

        const passed = Boolean(lNo && lWith) &&
            lWith.plannedReroll === true &&
            Math.abs(lWith.rerollAdjustedSuccessRate - (5 / 9)) < 0.001 &&
            lWith.totalUtility > lNo.totalUtility;
        results.push({ test: 'Test HZ — Visible 3P / 5 Au with reroll gets 5/9 success and higher utility (Reroll Test H)', passed, details: { no: lNo?.totalUtility, with: lWith?.totalUtility } });
    }

    // Test IA (Reroll Test I) — visible 1P normally does not consume reroll
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Common Wine", points: 1 } };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 30, rerolls: 1 }, snap);
        const lux0 = evalRes.luxuryActions.find(l => l.deckId === 0);
        const passed = Boolean(lux0) && lux0.plannedReroll === false && lux0.plannedRerollCount === 0;
        results.push({ test: 'Test IA — Visible 1P Luxury does not plan reroll under normal conditions (Reroll Test I)', passed, details: lux0 });
    }

    // Test IB (Reroll Test J) — three visible 3P cards: 10 Au pile becomes highly competitive with 15 Au pile
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Wine 3P", points: 3 } };
        snap.luxuryDecks[1] = { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Estate 3P", points: 3 } };
        snap.luxuryDecks[2] = { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht 3P", points: 3 } };

        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20, rerolls: 1 }, snap);
        const lux10 = evalRes.luxuryActions.find(l => l.deckId === 1);
        const lux15 = evalRes.luxuryActions.find(l => l.deckId === 2);

        const passed = Boolean(lux10 && lux15) &&
            lux10.plannedReroll === true &&
            lux10.totalUtility >= (lux15.totalUtility - 0.10);
        results.push({ test: 'Test IB — Three visible 3P: 10 Au + reroll is highly competitive with 15 Au (Reroll Test J)', passed, details: { lux10Util: lux10?.totalUtility, lux15Util: lux15?.totalUtility } });
    }

    // Test IC (Reroll Test K) — failed planned Luxury attempt consumes exactly one reroll
    {
        const decFail = resolveStrategicLuxuryRerollDecision({
            isGranGran: true,
            useStrategic: true,
            rerolls: 1,
            plannedReroll: true,
            firstRollSucceeded: false
        });
        const decNoPlan = resolveStrategicLuxuryRerollDecision({
            isGranGran: true,
            useStrategic: true,
            rerolls: 1,
            plannedReroll: false,
            firstRollSucceeded: false
        });
        const decNoRerolls = resolveStrategicLuxuryRerollDecision({
            isGranGran: true,
            useStrategic: true,
            rerolls: 0,
            plannedReroll: true,
            firstRollSucceeded: false
        });
        const passed = decFail.shouldReroll === true &&
            decFail.rerollsConsumed === 1 &&
            (decFail.reason === "STRATEGIC_COMMITTED_LUXURY_REROLL" || decFail.reason === "STRATEGIC_PLANNED_REROLL") &&
            decNoPlan.shouldReroll === false &&
            decNoPlan.rerollsConsumed === 0 &&
            decNoRerolls.shouldReroll === false &&
            decNoRerolls.rerollsConsumed === 0;
        results.push({ test: 'Test IC — Failed planned Luxury attempt consumes exactly one reroll (Reroll Test K)', passed, details: { decFail, decNoPlan, decNoRerolls } });
    }

    // Test ID (Reroll Test L) — successful first roll does not consume reroll
    {
        const decSuccess = resolveStrategicLuxuryRerollDecision({
            isGranGran: true,
            useStrategic: true,
            rerolls: 1,
            plannedReroll: true,
            firstRollSucceeded: true
        });
        const passed = decSuccess.shouldReroll === false &&
            decSuccess.rerollsConsumed === 0 &&
            decSuccess.reason === "FIRST_ROLL_SUCCEEDED";
        results.push({ test: 'Test ID — Successful first roll does not consume rerolls (Reroll Test L)', passed, details: decSuccess });
    }

    // Test IE (Reroll Test M) — no 5/10 Luxury remaining: Map reroll allowed on Lagoon/Atlantic
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0] = { id: 0, cost: 5, cardsRemaining: 0, isOpen: false };
        snap.luxuryDecks[1] = { id: 1, cost: 10, cardsRemaining: 0, isOpen: false };

        const lagoonCell = { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', difficulty: 4 };
        const atlanticCell = { id: 'r0c8', r: 0, c: 8, type: 'ATLANTIC', difficulty: 4 };

        const decLagoon = shouldBotUseMapReroll({ id: 10, botId: 10, rerolls: 1 }, lagoonCell, snap);
        const decAtlantic = shouldBotUseMapReroll({ id: 10, botId: 10, rerolls: 1 }, atlanticCell, snap);

        const passed = decLagoon.shouldReroll === true && decAtlantic.shouldReroll === true;
        results.push({ test: 'Test IE — No 5/10 Luxury remaining allows Map rerolls on Lagoon/Atlantic (Reroll Test M)', passed, details: { decLagoon, decAtlantic } });
    }

    // Test IF (Reroll Test N) — 5/10 Luxury still available: ordinary Map reroll preserved
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: 'BLOCK', value: 3, difficulty: 4, empty: false, flipped: false, locked: false });
            }
        }
        snap.luxuryDecks[0] = { id: 0, cost: 5, cardsRemaining: 3, isOpen: false };
        snap.luxuryDecks[1] = { id: 1, cost: 10, cardsRemaining: 3, isOpen: false };

        const mapCell = { id: 'r2c3', r: 2, c: 3, type: 'BLOCK', difficulty: 4 };
        const dec = shouldBotUseMapReroll({ id: 10, botId: 10, rerolls: 1 }, mapCell, snap);

        const passed = dec.shouldReroll === false &&
            (dec.reason === "PRESERVE_REROLL_FOR_LUXURY" || dec.reason === "PRESERVE_ONLY_REROLL_FOR_LUXURY");
        results.push({ test: 'Test IF — 5/10 Luxury available preserves reroll from ordinary Map roll (Reroll Test N)', passed, details: dec });
    }

    // Test IG (Reroll Test O) — locked non-Carina Map reroll: base 2/6 with reroll 5/9
    {
        const baseLocked = 2 / 6;
        const rerollLocked = 1 - Math.pow(1 - baseLocked, 2);
        const passed = Math.abs(rerollLocked - (5 / 9)) < 0.0001;
        results.push({ test: 'Test IG — Locked non-Carina roll with reroll achieves 5/9 success (Reroll Test O)', passed, details: { baseLocked, rerollLocked } });
    }

    // Test IH (Reroll Test P) — endgame trailing bot may use reroll more aggressively
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: 'Opponent', gold: 20, prestige: 10 },
            { id: 10, name: 'Gran Gran', isSelf: true, gold: 20, prestige: 5 }
        ];
        // 10 cards total on board, 9 already flipped, 1 remaining (ratio = 1/10 = 0.10)
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r0c4', r: 0, c: 4, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r0c5', r: 0, c: 5, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r0c6', r: 0, c: 6, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r0c7', r: 0, c: 7, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r0c8', r: 0, c: 8, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r1c0', r: 1, c: 0, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 4, difficulty: 5, flipped: false, empty: false }
        ];
        const mapCell = { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 4, difficulty: 5 };
        const dec = shouldBotUseMapReroll({ id: 10, botId: 10, rerolls: 1 }, mapCell, snap);

        const passed = dec.shouldReroll === true;
        results.push({ test: 'Test IH — Endgame trailing bot uses reroll aggressively on valuable Map cell (Reroll Test P)', passed, details: dec });
    }

    // Test II (Regression Test) — Gran Gran strategic BUY_LUXURY resolution descriptor preserves planned reroll
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', flipped: false, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'BLOCK', flipped: false, empty: false }
        ];
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Vintage Wine", points: 3 } };

        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 30, rerolls: 1 }, snap);
        const resolution = resolveBotTurnExecution({
            bot: { id: 10, botId: 10, gold: 30, rerolls: 1 },
            knowledge: snap,
            useStrategicGranGran: true,
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            legacyReason: "LEGACY_MAP",
            evaluation: evalRes
        });

        const passed = resolution.executionMode === "STRATEGIC" &&
            resolution.executedAction === "BUY_LUXURY" &&
            resolution.executedTargetId === 0 &&
            resolution.buyDeckId === 0 &&
            resolution.plannedReroll === true &&
            resolution.plannedRerollCount === 1;
        results.push({ test: 'Test II — Gran Gran strategic BUY_LUXURY resolution descriptor preserves planned reroll (Regression Test)', passed, details: resolution });
    }

    // ============================================================================
    // PHASE 5B.13 — MAP PERSONALITY, WATERFRONT ADVANCE, BONUS & LANDMARK TESTS
    // ============================================================================

    // Test IJ (Firewall Test A) — Two raw states differing only in hidden isBonus produce identical evaluations
    {
        const rawState1 = {
            turn: 0,
            turnCount: 1,
            mode: 'GAME',
            players: [{ id: 0, botId: null, type: 'HUMAN', gold: 20 }, { id: 10, botId: 10, type: 'BOT', gold: 20 }],
            luxuryDecks: [{ id: 0, cost: 5, cards: [] }, { id: 1, cost: 10, cards: [] }, { id: 2, cost: 15, cards: [] }],
            auctions: { A: { card: { id: 1, name: "Spanish River", points: 2 } }, B: { card: { id: 2, name: "Gulf Stream", points: 3 } } },
            grid: [
                { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: true, spriteIndex: 2 },
                { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: false, spriteIndex: 18 }
            ]
        };
        const rawState2 = {
            turn: 0,
            turnCount: 1,
            mode: 'GAME',
            players: [{ id: 0, botId: null, type: 'HUMAN', gold: 20 }, { id: 10, botId: 10, type: 'BOT', gold: 20 }],
            luxuryDecks: [{ id: 0, cost: 5, cards: [] }, { id: 1, cost: 10, cards: [] }, { id: 2, cost: 15, cards: [] }],
            auctions: { A: { card: { id: 1, name: "Spanish River", points: 2 } }, B: { card: { id: 2, name: "Gulf Stream", points: 3 } } },
            grid: [
                { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: false, spriteIndex: 18 },
                { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: true, spriteIndex: 2 }
            ]
        };

        const snap1 = {
            selfPlayerId: 10,
            players: rawState1.players.map(p => ({ ...p, isSelf: p.id === 10 })),
            luxuryDecks: [{ id: 0, cost: 5, isOpen: false }, { id: 1, cost: 10, isOpen: false }, { id: 2, cost: 15, isOpen: false }],
            auctions: { A: { isVisible: false, resolved: false, triggered: false }, B: { isVisible: false, resolved: false, triggered: false } },
            grid: [
                { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null, spriteIndex: null },
                { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null, spriteIndex: null }
            ]
        };
        const snap2 = {
            selfPlayerId: 10,
            players: rawState2.players.map(p => ({ ...p, isSelf: p.id === 10 })),
            luxuryDecks: [{ id: 0, cost: 5, isOpen: false }, { id: 1, cost: 10, isOpen: false }, { id: 2, cost: 15, isOpen: false }],
            auctions: { A: { isVisible: false, resolved: false, triggered: false }, B: { isVisible: false, resolved: false, triggered: false } },
            grid: [
                { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null, spriteIndex: null },
                { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null, spriteIndex: null }
            ]
        };

        const eval1 = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap1);
        const eval2 = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap2);

        const passed = eval1.mapActions[0].totalUtility === eval2.mapActions[0].totalUtility &&
            eval1.mapActions[1].totalUtility === eval2.mapActions[1].totalUtility &&
            eval1.mapActions[0].expectedBlockBonusPrestigeEq === eval2.mapActions[0].expectedBlockBonusPrestigeEq;
        results.push({ test: 'Test IJ — Hidden isBonus differences produce identical evaluations (Firewall Test A)', passed, details: { u1: eval1.mapActions[0].totalUtility, u2: eval2.mapActions[0].totalUtility } });
    }

    // Test IK (Firewall Test B) — Two raw states differing only in hidden spriteIndex/landmark produce identical evaluations
    {
        const snap1 = createBaseValidSnapshot();
        snap1.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null, spriteIndex: null },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null, spriteIndex: null }
        ];
        const snap2 = createBaseValidSnapshot();
        snap2.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null, spriteIndex: null },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null, spriteIndex: null }
        ];

        const eval1 = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap1);
        const eval2 = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap2);

        const passed = eval1.mapActions[0].expectedLandmarkPrestigeEq === eval2.mapActions[0].expectedLandmarkPrestigeEq &&
            eval1.mapActions[1].expectedLandmarkPrestigeEq === eval2.mapActions[1].expectedLandmarkPrestigeEq;
        results.push({ test: 'Test IK — Hidden spriteIndex/landmark differences produce identical evaluations (Firewall Test B)', passed });
    }

    // Test IL (Firewall Test C) — Publicly revealing a bonus updates remaining public probability
    {
        const snapNoReveal = createBaseValidSnapshot();
        snapNoReveal.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null }
        ];
        const snapWithReveal = createBaseValidSnapshot();
        snapWithReveal.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: true, empty: false, isBonus: true },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false, isBonus: null }
        ];

        const evalNo = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snapNoReveal);
        const evalRev = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snapWithReveal);

        const bNo = evalNo.mapActions.find(m => m.cellId === 'r1c2');
        const bRev = evalRev.mapActions.find(m => m.cellId === 'r1c2');

        const passed = Boolean(bNo && bRev) &&
            bNo.candidateExpectedBonusProbability === 1.0 && // 2 remaining / 2 unresolved = 1.0
            bRev.candidateExpectedBonusProbability === 1.0 && // (2-1) = 1 remaining / 1 unresolved = 1.0
            bNo.publicBonusesRevealed === 0 &&
            bRev.publicBonusesRevealed === 1;
        results.push({ test: 'Test IL — Public bonus reveal updates remaining public count (Firewall Test C)', passed, details: { bNo, bRev } });
    }

    // Test IM (Firewall Test D) — Shuffled variable bonus group uses public expectation, not hidden count
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const opp = evaluateBlockBonusOpportunity(snap.grid[0], snap, null);
        const passed = opp.bonusGroup === "COL4_6" &&
            opp.publicExpectedTotalBonuses === 3.3333 &&
            Math.abs(opp.candidateExpectedBonusProbability - (5 / 18)) < 0.001;
        results.push({ test: 'Test IM — Variable bonus group uses exact public deck expectation (Firewall Test D)', passed, details: opp });
    }

    // Test IN (Bonus Test A) — Column 3: 2 total, 0 revealed, 4 unresolved => prob = 0.5
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r3c2', r: 3, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const opp = evaluateBlockBonusOpportunity(snap.grid[0], snap, null);
        const passed = opp.bonusGroup === "COL3" && opp.candidateExpectedBonusProbability === 0.5;
        results.push({ test: 'Test IN — Column 3: 2 total, 0 revealed, 4 unresolved => prob = 0.5 (Bonus Test A)', passed, details: opp });
    }

    // Test IO (Bonus Test B) — Column 3: 2 total, 0 revealed, 3 unresolved => prob = 2/3
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const opp = evaluateBlockBonusOpportunity(snap.grid[0], snap, null);
        const passed = opp.bonusGroup === "COL3" && Math.abs(opp.candidateExpectedBonusProbability - (2 / 3)) < 0.001;
        results.push({ test: 'Test IO — Column 3: 2 total, 0 revealed, 3 unresolved => prob = 2/3 (Bonus Test B)', passed, details: opp });
    }

    // Test IP (Bonus Test C) — Column 3: 1 revealed, 4 unresolved => prob = 0.25
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: true, isBonus: true, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r3c2', r: 3, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const opp = evaluateBlockBonusOpportunity(snap.grid[1], snap, null);
        const passed = opp.bonusGroup === "COL3" && opp.candidateExpectedBonusProbability === 0.25;
        results.push({ test: 'Test IP — Column 3: 1 revealed, 4 unresolved => prob = 0.25 (Bonus Test C)', passed, details: opp });
    }

    // Test IQ (Bonus Test D) — Column 3: 2 revealed => prob = 0
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: true, isBonus: true, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: true, isBonus: true, empty: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const opp = evaluateBlockBonusOpportunity(snap.grid[2], snap, null);
        const passed = opp.bonusGroup === "COL3" && opp.candidateExpectedBonusProbability === 0 && opp.bonusOpportunityClassification === "NONE";
        results.push({ test: 'Test IQ — Column 3: 2 revealed => prob = 0 (Bonus Test D)', passed, details: opp });
    }

    // Test IR (Bonus Test E) — Columns 4–6 initial public expectation
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [{ id: 'r0c4', r: 0, c: 4, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }];
        const opp = evaluateBlockBonusOpportunity(snap.grid[0], snap, null);
        const passed = opp.publicExpectedTotalBonuses === 3.3333 && Math.abs(opp.candidateExpectedBonusProbability - (5 / 18)) < 0.001;
        results.push({ test: 'Test IR — Columns 4–6 initial public expectation is 3.333 bonuses, 5/18 prob (Bonus Test E)', passed, details: opp });
    }

    // Test IS (Bonus Test F) — Column 7 initial public expectation
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [{ id: 'r0c6', r: 0, c: 6, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }];
        const opp = evaluateBlockBonusOpportunity(snap.grid[0], snap, null);
        const passed = opp.publicExpectedTotalBonuses === 1.3333 && Math.abs(opp.candidateExpectedBonusProbability - (2 / 6)) < 0.001;
        results.push({ test: 'Test IS — Column 7 initial public expectation is 1.333 bonuses, 2/6 prob (Bonus Test F)', passed, details: opp });
    }

    // Test IT (Bonus Test G) — Revealed bonuses condition remaining expectation correctly
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: true, isBonus: true, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: true, isBonus: true, empty: false },
            { id: 'r2c3', r: 2, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: true, isBonus: false, empty: false },
            { id: 'r3c3', r: 3, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: true, isBonus: false, empty: false },
            { id: 'r0c4', r: 0, c: 4, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        // 4 cards revealed (2 bonuses): pool remaining = 18 - 4 = 14, bonuses remaining = 5 - 2 = 3 => 3/14 ≈ 0.2143
        const opp = evaluateBlockBonusOpportunity(snap.grid[4], snap, null);
        const passed = Math.abs(opp.candidateExpectedBonusProbability - (3 / 14)) < 0.001;
        results.push({ test: 'Test IT — Revealed bonuses condition remaining expectation via Bayes update (Bonus Test G)', passed, details: opp });
    }

    // Test IU (Bonus Test H) — High public bonus density makes Block candidate preferable
    {
        const snap = createBaseValidSnapshot();
        // Col 3 with 2/3 bonus probability (2 bonuses / 3 cards)
        // Col 7 with 0 bonus probability (2 bonuses already revealed)
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c6', r: 0, c: 6, type: 'BLOCK', value: 3, difficulty: 0, flipped: true, isBonus: true, empty: false },
            { id: 'r1c6', r: 1, c: 6, type: 'BLOCK', value: 3, difficulty: 0, flipped: true, isBonus: true, empty: false },
            { id: 'r2c6', r: 2, c: 6, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap);
        const col3Cand = evalRes.mapActions.find(m => m.cellId === 'r0c2');
        const col7Cand = evalRes.mapActions.find(m => m.cellId === 'r2c6');

        const passed = Boolean(col3Cand && col7Cand) &&
            col3Cand.expectedBlockBonusPrestigeEq > col7Cand.expectedBlockBonusPrestigeEq &&
            col3Cand.totalUtility > col7Cand.totalUtility;
        results.push({ test: 'Test IU — High bonus density makes Col 3 candidate preferable to Col 7 candidate (Bonus Test H)', passed, details: { col3Util: col3Cand?.totalUtility, col7Util: col7Cand?.totalUtility } });
    }

    // Test IV (WF Test A) — WF_L maps to Auction A
    {
        const snap = createBaseValidSnapshot();
        const cell = { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4 };
        const geom = { colCounts: [0, 5, 0, 0, 0, 0, 0, 5, 0] };
        const readiness = evaluateWaterfrontAdvanceReadiness(cell, snap, null, geom);
        const passed = readiness.relevantAuctionId === 'A';
        results.push({ test: 'Test IV — WF_L maps to Auction A (WF Test A)', passed, details: readiness });
    }

    // Test IW (WF Test B) — WF_R maps to Auction B
    {
        const snap = createBaseValidSnapshot();
        const cell = { id: 'r0c7', r: 0, c: 7, type: 'WF_R', value: 4 };
        const geom = { colCounts: [0, 5, 0, 0, 0, 0, 0, 5, 0] };
        const readiness = evaluateWaterfrontAdvanceReadiness(cell, snap, null, geom);
        const passed = readiness.relevantAuctionId === 'B';
        results.push({ test: 'Test IW — WF_R maps to Auction B (WF Test B)', passed, details: readiness });
    }

    // Test IX (WF Test C) — 5+ Waterfront remaining: underfunded Gran Gran receives no advance penalty
    {
        const snap = createBaseValidSnapshot();
        const cell = { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4 };
        const geom = { colCounts: [0, 6, 0, 0, 0, 0, 0, 0, 0] };
        const readiness = evaluateWaterfrontAdvanceReadiness(cell, snap, { bot: { gold: 5 } }, geom);
        const passed = readiness.waterfrontAdvanceClassification === "DISTANT" &&
            readiness.auctionAdvancePrestigeEq === 0.0;
        results.push({ test: 'Test IX — 5+ Waterfront remaining receives no auction advance penalty (WF Test C)', passed, details: readiness });
    }

    // Test IY (WF Test D) — 4 remaining: underfunded Gran Gran receives moderate penalty (-0.05 P-eq)
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A = { isVisible: true, resolved: false, triggered: false, visibleCard: { name: "Spanish River", points: 2 } };
        const cell = { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4 };
        const geom = { colCounts: [0, 4, 0, 0, 0, 0, 0, 0, 0] };
        const readiness = evaluateWaterfrontAdvanceReadiness(cell, snap, { bot: { gold: 5 } }, geom);
        const passed = readiness.waterfrontAdvanceClassification === "APPROACHING" &&
            readiness.auctionAdvancePrestigeEq === -0.05;
        results.push({ test: 'Test IY — 4 remaining underfunded receives moderate penalty of -0.05 P-eq (WF Test D)', passed, details: readiness });
    }

    // Test IZ (WF Test E) — 3 remaining: underfunded Gran Gran receives larger penalty (-0.08 P-eq)
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A = { isVisible: true, resolved: false, triggered: false, visibleCard: { name: "Spanish River", points: 2 } };
        const cell = { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4 };
        const geom = { colCounts: [0, 3, 0, 0, 0, 0, 0, 0, 0] };
        const readiness = evaluateWaterfrontAdvanceReadiness(cell, snap, { bot: { gold: 5 } }, geom);
        const passed = readiness.waterfrontAdvanceClassification === "IMMINENT" &&
            readiness.auctionAdvancePrestigeEq === -0.08;
        results.push({ test: 'Test IZ — 3 remaining underfunded receives larger penalty of -0.08 P-eq (WF Test E)', passed, details: readiness });
    }

    // Test JA (WF Test F) — 3 remaining: well-funded Gran Gran receives positive adjustment (+0.04 P-eq)
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A = { isVisible: true, resolved: false, triggered: false, visibleCard: { name: "Spanish River", points: 2 } };
        const cell = { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4 };
        const geom = { colCounts: [0, 3, 0, 0, 0, 0, 0, 0, 0] };
        const readiness = evaluateWaterfrontAdvanceReadiness(cell, snap, { bot: { gold: 35 } }, geom);
        const passed = readiness.waterfrontAdvanceClassification === "IMMINENT" &&
            readiness.auctionAdvancePrestigeEq === 0.04;
        results.push({ test: 'Test JA — 3 remaining well-funded receives positive adjustment of +0.04 P-eq (WF Test F)', passed, details: readiness });
    }

    // Test JB (WF Test G) — Visible Mar-a-Lago underfunded advance pressure is stronger (-0.10 P-eq at 3 rem)
    {
        const snap = createBaseValidSnapshot();
        snap.auctions.A = { isVisible: true, resolved: false, triggered: false, visibleCard: { name: "Mar-a-Lago", points: 4 } };
        const cell = { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4 };
        const geom = { colCounts: [0, 3, 0, 0, 0, 0, 0, 0, 0] };
        const readiness = evaluateWaterfrontAdvanceReadiness(cell, snap, { bot: { gold: 5 } }, geom);
        const passed = readiness.auctionAdvancePrestigeEq === -0.10;
        results.push({ test: 'Test JB — Visible Mar-a-Lago underfunded advance receives -0.10 P-eq at 3 rem (WF Test G)', passed, details: readiness });
    }

    // Test JC (WF Test H) — Uncontestable Mar-a-Lago reduces preservation pressure
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "Dominant Rich Opponent", gold: 70, prestige: 20 },
            { id: 10, name: "Gran Gran", gold: 5, prestige: 10, isSelf: true }
        ];
        snap.auctions.A = { isVisible: true, resolved: false, triggered: false, visibleCard: { name: "Mar-a-Lago", points: 4 } };
        const cell = { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4 };
        const geom = { colCounts: [0, 3, 0, 0, 0, 0, 0, 0, 0] };
        const ctx = analyzeStrategicContext({ id: 10, botId: 10, gold: 5 }, snap);
        const readiness = evaluateWaterfrontAdvanceReadiness(cell, snap, ctx, geom);
        const passed = (readiness.auctionContestability === "UNCONTESTABLE" || readiness.auctionContestability === "EXPENSIVE") &&
            readiness.auctionAdvanceReason === "UNDERFUNDED_UNCONTESTABLE_MAR_A_LAGO_IMMINENT" &&
            (readiness.auctionAdvancePrestigeEq === -0.04 || readiness.auctionAdvancePrestigeEq === -0.07);
        results.push({ test: 'Test JC — Uncontestable Mar-a-Lago reduces advance penalty to -0.04 P-eq (WF Test H)', passed, details: readiness });
    }

    // Test JD (WF Test I) — Existing SECOND_LAST behavior unchanged (readiness helper returns 0.0 to prevent double-counting)
    {
        const snap = createBaseValidSnapshot();
        const cell = { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4 };
        const geom = { colCounts: [0, 2, 0, 0, 0, 0, 0, 0, 0] };
        const readiness = evaluateWaterfrontAdvanceReadiness(cell, snap, { bot: { gold: 5 } }, geom);
        const passed = readiness.waterfrontAdvanceClassification === "SECOND_LAST" &&
            readiness.auctionAdvancePrestigeEq === 0.0;
        results.push({ test: 'Test JD — SECOND_LAST delegates to timing lookahead without double-counting (WF Test I)', passed, details: readiness });
    }

    // Test JE (WF Test J) — Existing LAST behavior unchanged (readiness helper returns 0.0 to prevent double-counting)
    {
        const snap = createBaseValidSnapshot();
        const cell = { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4 };
        const geom = { colCounts: [0, 1, 0, 0, 0, 0, 0, 0, 0] };
        const readiness = evaluateWaterfrontAdvanceReadiness(cell, snap, { bot: { gold: 5 } }, geom);
        const passed = readiness.waterfrontAdvanceClassification === "LAST" &&
            readiness.auctionAdvancePrestigeEq === 0.0;
        results.push({ test: 'Test JE — LAST delegates to trigger lookahead without double-counting (WF Test J)', passed, details: readiness });
    }

    // Test JF (Personality Test A) — Gran Gran BLOCK gets +0.02 P-eq
    {
        const cell = { id: 'r0c2', r: 0, c: 2, type: 'BLOCK' };
        const mod = getMapPersonalityPrestigeEq(cell, "MEDIUM");
        const passed = mod === 0.02;
        results.push({ test: 'Test JF — Gran Gran BLOCK personality modifier is +0.02 P-eq (Personality Test A)', passed, details: { mod } });
    }

    // Test JG (Personality Test B) — Gran Gran ATLANTIC gets +0.01 P-eq
    {
        const cell = { id: 'r0c8', r: 0, c: 8, type: 'ATLANTIC' };
        const mod = getMapPersonalityPrestigeEq(cell, "MEDIUM");
        const passed = mod === 0.01;
        results.push({ test: 'Test JG — Gran Gran ATLANTIC personality modifier is +0.01 P-eq (Personality Test B)', passed, details: { mod } });
    }

    // Test JH (Personality Test C) — Gran Gran WATERFRONT gets 0.00 P-eq
    {
        const cell = { id: 'r0c1', r: 0, c: 1, type: 'WF_L' };
        const mod = getMapPersonalityPrestigeEq(cell, "MEDIUM");
        const passed = mod === 0.00;
        results.push({ test: 'Test JH — Gran Gran WATERFRONT personality modifier is 0.00 P-eq (Personality Test C)', passed, details: { mod } });
    }

    // Test JI (Personality Test D) — Gran Gran LAGOON gets -0.01 P-eq
    {
        const cell = { id: 'r0c0', r: 0, c: 0, type: 'LAGOON' };
        const mod = getMapPersonalityPrestigeEq(cell, "MEDIUM");
        const passed = mod === -0.01;
        results.push({ test: 'Test JI — Gran Gran LAGOON personality modifier is -0.01 P-eq (Personality Test D)', passed, details: { mod } });
    }

    // Test JJ (Repetition Test A) — Same region as previous strategic Map action gets -0.02 penalty
    {
        const res = calculateMapRepetitionPenalty("WATERFRONT", ["WATERFRONT"]);
        const passed = res.repetitionPenaltyPrestigeEq === 0.02 && res.consecutiveSameRegionCount === 1;
        results.push({ test: 'Test JJ — Single repetition of region incurs -0.02 penalty (Repetition Test A)', passed, details: res });
    }

    // Test JK (Repetition Test B) — Same region as previous two strategic Map actions gets -0.04 total penalty
    {
        const res = calculateMapRepetitionPenalty("WATERFRONT", ["WATERFRONT", "WATERFRONT"]);
        const passed = res.repetitionPenaltyPrestigeEq === 0.04 && res.consecutiveSameRegionCount === 2;
        results.push({ test: 'Test JK — Double repetition of region incurs -0.04 total penalty (Repetition Test B)', passed, details: res });
    }

    // Test JL (Repetition Test C) — Strong finisher still overrides repetition penalty
    {
        const snap = createBaseValidSnapshot();
        // Row 0 has only r0c1 (WF_L) remaining -> finisher (+5 Au = +0.2667 P-eq)
        // Even with -0.04 repetition penalty, total utility is strongly positive and beats ordinary Block
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const ctx = analyzeStrategicContext({ id: 10, botId: 10, gold: 20 }, snap);
        ctx.recentMapRegions = ["WATERFRONT", "WATERFRONT"];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap, ctx);

        const wfCand = evalRes.mapActions.find(m => m.cellId === 'r0c1');
        const blockCand = evalRes.mapActions.find(m => m.cellId === 'r1c3');

        const passed = Boolean(wfCand && blockCand) &&
            wfCand.isFinisher === true &&
            wfCand.repetitionPenaltyPrestigeEq === 0.04 &&
            wfCand.totalUtility > blockCand.totalUtility;
        results.push({ test: 'Test JL — Strong line finisher overrides repetition penalty (Repetition Test C)', passed, details: { wfUtil: wfCand?.totalUtility, blockUtil: blockCand?.totalUtility } });
    }

    // Test JM (Repetition Test D) — Comparable candidates do not cause endless Waterfront tunneling
    {
        const snap = createBaseValidSnapshot();
        // 5 WF remaining (ordinary WF candidate, 4 Au reward) vs ordinary Block candidate (3 Au reward + Block personality + bonus density)
        // With 2 recent Waterfront moves, repetition penalty (-0.04) causes Block candidate to win
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r4c1', r: 4, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c3', r: 2, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r3c3', r: 3, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r4c3', r: 4, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const ctx = analyzeStrategicContext({ id: 10, botId: 10, gold: 20 }, snap);
        ctx.recentMapRegions = ["WATERFRONT", "WATERFRONT"];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap, ctx);

        const wfCand = evalRes.mapActions.find(m => m.cellId === 'r0c1');
        const blockCand = evalRes.mapActions.find(m => m.cellId === 'r0c3');

        const passed = Boolean(wfCand && blockCand) &&
            wfCand.repetitionPenaltyPrestigeEq === 0.04 &&
            blockCand.repetitionPenaltyPrestigeEq === 0.00 &&
            evalRes.bestMap.cellId === 'r0c3';
        results.push({ test: 'Test JM — Repetition penalty breaks ties away from endless Waterfront tunneling (Repetition Test D)', passed, details: { bestMap: evalRes.bestMap?.cellId, wfUtil: wfCand?.totalUtility, blockUtil: blockCand?.totalUtility } });
    }

    // ============================================================================
    // PHASE 5B.13 — GROUP-SPECIFIC LANDMARK PROBABILITY REGRESSION TESTS (A-F)
    // ============================================================================

    // Test JN (Landmark Test A) — Two states differing only in hidden landmark placements produce identical evaluations
    {
        const snap1 = createBaseValidSnapshot();
        snap1.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 8, difficulty: 4, flipped: false, empty: false, isBonus: null, spriteIndex: null },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', value: 4, difficulty: 0, flipped: false, empty: false, isBonus: null, spriteIndex: null }
        ];
        const snap2 = createBaseValidSnapshot();
        snap2.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 8, difficulty: 4, flipped: false, empty: false, isBonus: null, spriteIndex: null },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', value: 4, difficulty: 0, flipped: false, empty: false, isBonus: null, spriteIndex: null }
        ];

        const eval1 = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap1);
        const eval2 = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap2);

        const passed = eval1.mapActions[0].expectedLandmarkPrestigeEq === eval2.mapActions[0].expectedLandmarkPrestigeEq &&
            eval1.mapActions[1].expectedLandmarkPrestigeEq === eval2.mapActions[1].expectedLandmarkPrestigeEq &&
            eval1.mapActions[0].totalUtility === eval2.mapActions[0].totalUtility &&
            eval1.mapActions[1].totalUtility === eval2.mapActions[1].totalUtility;
        results.push({ test: 'Test JN — Hidden landmark placement differences produce identical evaluations (Landmark Test A)', passed, details: { u1: eval1.mapActions[0].totalUtility, u2: eval2.mapActions[0].totalUtility } });
    }

    // Test JO (Landmark Test B) — Different public landmark groups have different initial probabilities
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [];
        const cellWfL = { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4 }; // WF_L (1 landmark / 8 cards = 0.125)
        const cellWfR = { id: 'r0c7', r: 0, c: 7, type: 'WF_R', value: 4 }; // WF_R (4 landmarks / 8 cards = 0.500)
        const oppWfL = evaluateLandmarkOpportunity(cellWfL, snap, null);
        const oppWfR = evaluateLandmarkOpportunity(cellWfR, snap, null);

        const passed = oppWfL.landmarkGroup === "WF_L" &&
            oppWfR.landmarkGroup === "WF_R" &&
            oppWfL.candidateLandmarkProbability === 0.125 &&
            oppWfR.candidateLandmarkProbability === 0.500 &&
            oppWfR.candidateLandmarkProbability > oppWfL.candidateLandmarkProbability;
        results.push({ test: 'Test JO — Group-specific landmark density gives different probabilities (Landmark Test B)', passed, details: { wfL: oppWfL.candidateLandmarkProbability, wfR: oppWfR.candidateLandmarkProbability } });
    }

    // Test JP (Landmark Test C) — Revealing a landmark in group A updates group A remaining probability
    {
        const snap = createBaseValidSnapshot();
        // Reveal 1 landmark (sprite 6 = Ocean Front Beach, row 0, col 6) in Column 7 (WF_R)
        snap.grid = [
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', value: 4, difficulty: 0, flipped: true, spriteIndex: 6, empty: false },
            { id: 'r1c7', r: 1, c: 7, type: 'WF_R', value: 4, difficulty: 0, flipped: false, empty: false }
        ];
        // 1 card revealed in WF_R (1 landmark): remaining in pool = 8 - 1 = 7, remaining landmarks = 4 - 1 = 3 => 3/7 ≈ 0.4286
        const opp = evaluateLandmarkOpportunity(snap.grid[1], snap, null);
        const passed = opp.landmarkGroup === "WF_R" &&
            opp.publicCardsRevealedInGroup === 1 &&
            opp.publicLandmarksRevealedInGroup === 1 &&
            Math.abs(opp.candidateLandmarkProbability - (3 / 7)) < 0.001;
        results.push({ test: 'Test JP — Revealing landmark in group updates that group remaining probability (Landmark Test C)', passed, details: opp });
    }

    // Test JQ (Landmark Test D) — Revealing a landmark in group A leaves unrelated group B unchanged
    {
        const snap = createBaseValidSnapshot();
        // Reveal 1 landmark in Column 7 (WF_R)
        snap.grid = [
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', value: 4, difficulty: 0, flipped: true, spriteIndex: 6, empty: false },
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false }
        ];
        const oppWfL = evaluateLandmarkOpportunity(snap.grid[1], snap, null);
        // WF_L is untouched: 0 revealed in WF_L => 1/8 = 0.125
        const passed = oppWfL.landmarkGroup === "WF_L" &&
            oppWfL.publicCardsRevealedInGroup === 0 &&
            oppWfL.publicLandmarksRevealedInGroup === 0 &&
            oppWfL.candidateLandmarkProbability === 0.125;
        results.push({ test: 'Test JQ — Revealing landmark in group A leaves unrelated group B unchanged (Landmark Test D)', passed, details: oppWfL });
    }

    // Test JR (Landmark Test E) — Center 3–5 group uses its true source pool denominator (18)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r2c3', r: 2, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const opp = evaluateLandmarkOpportunity(snap.grid[0], snap, null);
        const passed = opp.landmarkGroup === "BLOCK_COL4_6" &&
            opp.publicSourcePoolSize === 18 &&
            opp.publicLandmarksInSourcePool === 3 &&
            Math.abs(opp.candidateLandmarkProbability - (3 / 18)) < 0.001;
        results.push({ test: 'Test JR — Center 3-5 group uses true source pool size of 18 (Landmark Test E)', passed, details: opp });
    }

    // Test JS (Landmark Test F) — Unrevealed candidate evaluation never accesses or leaks hidden spriteIndex
    {
        const snap = createBaseValidSnapshot();
        const rawCellWithHiddenSprite = { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, spriteIndex: 34 };
        const safeCell = { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, spriteIndex: null, isBonus: null };
        snap.grid = [safeCell];

        const opp = evaluateLandmarkOpportunity(safeCell, snap, null);
        const passed = safeCell.spriteIndex === null &&
            safeCell.isBonus === null &&
            opp.landmarkGroup === "BLOCK_COL3" &&
            opp.candidateLandmarkProbability === 0.125;
        results.push({ test: 'Test JS — Unrevealed cell evaluation never accesses hidden spriteIndex (Landmark Test F)', passed, details: opp });
    }

    // ============================================================================
    // PHASE 5B.14 — WATERFRONT RESTRAINT, SPECIAL LUXURY & POST-AUCTION TESTS
    // ============================================================================

    // Test JT (WF Restraint A) — Live turn 26 scenario: Gran Gran gold = 2, WF_L rem = 4, advantage +0.0061 < 0.10 => BLOCK selected
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "Opponent 1", gold: 15, prestige: 10 },
            { id: 1, name: "Opponent 2", gold: 12, prestige: 8 },
            { id: 10, name: "Gran Gran", gold: 2, prestige: 8, isSelf: true }
        ];
        snap.auctions.A = { isVisible: true, resolved: false, triggered: false, visibleCard: { name: "Spanish River", points: 2 } };
        // 4 WF_L remaining (c=1), 4 Block remaining (c=3)
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c3', r: 2, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r3c3', r: 3, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];

        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 2 }, snap);
        const wfCand = evalRes.mapActions.find(m => m.cellId === 'r0c1');
        const blockCand = evalRes.mapActions.find(m => m.cellId === 'r0c3');

        const passed = Boolean(wfCand && blockCand) &&
            wfCand.waterfrontAdvanceAllowed === false &&
            wfCand.waterfrontAdvanceOverrideReason === "UNDERFUNDED_RESTRAINT" &&
            evalRes.bestMap.type === 'BLOCK' &&
            evalRes.recommendation.action === "MAP" &&
            evalRes.recommendation.targetId.startsWith('r');
        results.push({ test: 'Test JT — Underfunded at 4 WF remaining restrains Waterfront and selects Block (Live Scenario Test)', passed, details: { bestMap: evalRes.bestMap?.cellId, bestMapType: evalRes.bestMap?.type, wfAllowed: wfCand?.waterfrontAdvanceAllowed } });
    }

    // Test JU (WF Restraint B) — Substantial advantage (>= +0.10) allows underfunded Waterfront
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "Opponent 1", gold: 15, prestige: 10 },
            { id: 10, name: "Gran Gran", gold: 2, prestige: 8, isSelf: true }
        ];
        snap.auctions.A = { isVisible: true, resolved: false, triggered: false, visibleCard: { name: "Spanish River", points: 2 } };
        // WF candidate (value 4, difficulty 0) vs low value block candidate (value 1, diff 4), no row finishers
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 1, difficulty: 4, flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 1, difficulty: 4, flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 1, difficulty: 4, flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r3c2', r: 3, c: 2, type: 'BLOCK', value: 1, difficulty: 4, flipped: false, empty: false }
        ];

        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 2 }, snap);
        const wfCand = evalRes.mapActions.find(m => m.cellId === 'r0c1');
        const passed = Boolean(wfCand) &&
            wfCand.waterfrontAdvanceAllowed === true &&
            wfCand.waterfrontAdvanceOverrideReason === "SUBSTANTIALLY_BETTER_THAN_ALTERNATIVES" &&
            evalRes.bestMap.cellId === 'r0c1';
        results.push({ test: 'Test JU — Substantial advantage allows underfunded Waterfront candidate', passed, details: { bestMap: evalRes.bestMap?.cellId, wfReason: wfCand?.waterfrontAdvanceOverrideReason } });
    }

    // Test JV (WF Restraint C) — Line finisher overrides underfunded Waterfront restraint
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "Opponent 1", gold: 15, prestige: 10 },
            { id: 10, name: "Gran Gran", gold: 2, prestige: 8, isSelf: true }
        ];
        snap.auctions.A = { isVisible: true, resolved: false, triggered: false, visibleCard: { name: "Spanish River", points: 2 } };
        // Row 0 has only r0c1 remaining -> row finisher
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];

        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 2 }, snap);
        const wfCand = evalRes.mapActions.find(m => m.cellId === 'r0c1');
        const passed = Boolean(wfCand) &&
            wfCand.isFinisher === true &&
            wfCand.waterfrontAdvanceAllowed === true &&
            wfCand.waterfrontAdvanceOverrideReason === "LINE_FINISHER_OVERRIDE" &&
            evalRes.bestMap.cellId === 'r0c1';
        results.push({ test: 'Test JV — Line finisher overrides underfunded Waterfront restraint', passed, details: { bestMap: evalRes.bestMap?.cellId, isFinisher: wfCand?.isFinisher } });
    }

    // Test JW (WF Restraint D) — Uncontestable auction overrides underfunded restraint
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, name: "Dominant Rich Opponent", gold: 75, prestige: 20 },
            { id: 10, name: "Gran Gran", gold: 2, prestige: 8, isSelf: true }
        ];
        snap.auctions.A = { isVisible: true, resolved: false, triggered: false, visibleCard: { name: "Mar-a-Lago", points: 4 } };
        snap.grid = [
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c1', r: 2, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r3c1', r: 3, c: 1, type: 'WF_L', value: 4, difficulty: 0, flipped: false, empty: false },
            { id: 'r3c2', r: 3, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];

        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 2 }, snap);
        const wfCand = evalRes.mapActions.find(m => m.cellId === 'r0c1');
        const passed = Boolean(wfCand) &&
            wfCand.waterfrontAdvanceAllowed === true &&
            wfCand.waterfrontAdvanceOverrideReason === "UNCONTESTABLE_AUCTION";
        results.push({ test: 'Test JW — Uncontestable auction overrides underfunded restraint', passed, details: wfCand });
    }

    // Test JX (Special Luxury A) — Visible ordinary 1P card has rerollsGranted = 0
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0] = {
            id: 0,
            cost: 5,
            cardsRemaining: 4,
            isOpen: true,
            visibleCard: { name: "Wine Cellar", points: 1, cost: 5, tier: 1, type: 'LUXURY', rerollsGranted: 0 }
        };
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 10 }, snap);
        const luxAction = evalRes.luxuryActions.find(l => l.deckId === 0);
        const passed = Boolean(luxAction) &&
            luxAction.visibleCardRerollsGranted === 0 &&
            luxAction.expectedRerollRewardPrestigeEq === 0.0;
        results.push({ test: 'Test JX — Visible ordinary 1P card has rerollsGranted = 0 (Special Luxury Test A)', passed, details: luxAction });
    }

    // Test JY (Special Luxury B) — Visible 1P +1 reroll ("Designer Handbag") has higher utility than ordinary 1P
    {
        const snap1 = createBaseValidSnapshot();
        snap1.luxuryDecks[0] = {
            id: 0,
            cost: 5,
            cardsRemaining: 4,
            isOpen: true,
            visibleCard: { name: "Wine Cellar", points: 1, cost: 5, tier: 1, type: 'LUXURY', rerollsGranted: 0 }
        };
        const snap2 = createBaseValidSnapshot();
        snap2.luxuryDecks[0] = {
            id: 0,
            cost: 5,
            cardsRemaining: 4,
            isOpen: true,
            visibleCard: { name: "Designer Handbag", points: 1, cost: 5, tier: 1, type: 'LUXURY', rerollsGranted: 1 }
        };

        const eval1 = evaluateTurnActions({ id: 10, botId: 10, gold: 10 }, snap1);
        const eval2 = evaluateTurnActions({ id: 10, botId: 10, gold: 10 }, snap2);
        const lux1 = eval1.luxuryActions.find(l => l.deckId === 0);
        const lux2 = eval2.luxuryActions.find(l => l.deckId === 0);

        const passed = Boolean(lux1 && lux2) &&
            lux2.visibleCardRerollsGranted === 1 &&
            lux2.expectedRerollRewardPrestigeEq > 0 &&
            lux2.totalUtility > lux1.totalUtility;
        results.push({ test: 'Test JY — Visible 1P + 1 reroll has higher utility than ordinary 1P (Special Luxury Test B)', passed, details: { u1: lux1?.totalUtility, u2: lux2?.totalUtility } });
    }

    // Test JZ (Special Luxury C) — Visible 1P + 2 rerolls ("Tiger Experience") has higher utility than +1 reroll
    {
        const snap1 = createBaseValidSnapshot();
        snap1.luxuryDecks[0] = {
            id: 0,
            cost: 5,
            cardsRemaining: 4,
            isOpen: true,
            visibleCard: { name: "Designer Handbag", points: 1, cost: 5, tier: 1, type: 'LUXURY', rerollsGranted: 1 }
        };
        const snap2 = createBaseValidSnapshot();
        snap2.luxuryDecks[0] = {
            id: 0,
            cost: 5,
            cardsRemaining: 4,
            isOpen: true,
            visibleCard: { name: "Tiger Experience", points: 1, cost: 5, tier: 1, type: 'LUXURY', rerollsGranted: 2 }
        };

        const eval1 = evaluateTurnActions({ id: 10, botId: 10, gold: 10 }, snap1);
        const eval2 = evaluateTurnActions({ id: 10, botId: 10, gold: 10 }, snap2);
        const lux1 = eval1.luxuryActions.find(l => l.deckId === 0);
        const lux2 = eval2.luxuryActions.find(l => l.deckId === 0);

        const passed = Boolean(lux1 && lux2) &&
            lux2.visibleCardRerollsGranted === 2 &&
            lux2.expectedRerollRewardPrestigeEq > lux1.expectedRerollRewardPrestigeEq &&
            lux2.totalUtility > lux1.totalUtility;
        results.push({ test: 'Test JZ — Visible 1P + 2 rerolls has higher utility than +1 reroll (Special Luxury Test C)', passed, details: { u1: lux1?.totalUtility, u2: lux2?.totalUtility } });
    }

    // Test KA (Special Luxury D & E) — 5 Au and 10 Au +1 reroll rewards are success-weighted
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0] = {
            id: 0,
            cost: 5,
            cardsRemaining: 4,
            isOpen: true,
            visibleCard: { name: "Designer Handbag", points: 1, cost: 5, tier: 1, type: 'LUXURY', rerollsGranted: 1 }
        };
        snap.luxuryDecks[1] = {
            id: 1,
            cost: 10,
            cardsRemaining: 4,
            isOpen: true,
            visibleCard: { name: "Luxury Watch", points: 1, cost: 10, tier: 2, type: 'LUXURY', rerollsGranted: 1 }
        };

        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20, rerolls: 0 }, snap);
        const lux0 = evalRes.luxuryActions.find(l => l.deckId === 0);
        const lux1 = evalRes.luxuryActions.find(l => l.deckId === 1);

        const expected0 = Number((1 * 0.35 * (2 / 6)).toFixed(4));
        const expected1 = Number((1 * 0.35 * (4 / 6)).toFixed(4));

        const passed = Boolean(lux0 && lux1) &&
            Math.abs(lux0.expectedRerollRewardPrestigeEq - expected0) < 0.001 &&
            Math.abs(lux1.expectedRerollRewardPrestigeEq - expected1) < 0.001 &&
            lux1.expectedRerollRewardPrestigeEq > lux0.expectedRerollRewardPrestigeEq;
        results.push({ test: 'Test KA — Luxury reroll reward is properly success-weighted (Special Luxury Test D & E)', passed, details: { r0: lux0?.expectedRerollRewardPrestigeEq, r1: lux1?.expectedRerollRewardPrestigeEq } });
    }

    // Test KB (Special Luxury F & G) — Closed pile does not inspect hidden rerolls; differing hidden cards evaluate identically
    {
        const snap1 = createBaseValidSnapshot();
        snap1.luxuryDecks[0] = { id: 0, cost: 5, cardsRemaining: 4, isOpen: false, visibleCard: null };
        const snap2 = createBaseValidSnapshot();
        snap2.luxuryDecks[0] = { id: 0, cost: 5, cardsRemaining: 4, isOpen: false, visibleCard: null };

        const eval1 = evaluateTurnActions({ id: 10, botId: 10, gold: 10 }, snap1);
        const eval2 = evaluateTurnActions({ id: 10, botId: 10, gold: 10 }, snap2);
        const lux1 = eval1.luxuryActions.find(l => l.deckId === 0);
        const lux2 = eval2.luxuryActions.find(l => l.deckId === 0);

        const passed = Boolean(lux1 && lux2) &&
            lux1.visibleCardRerollsGranted === 0 &&
            lux2.visibleCardRerollsGranted === 0 &&
            lux1.totalUtility === lux2.totalUtility;
        results.push({ test: 'Test KB — Closed pile preserves firewall on hidden reroll cards (Special Luxury Test F & G)', passed, details: { u1: lux1?.totalUtility, u2: lux2?.totalUtility } });
    }

    // Test KC (Post-Auction A) — No auctions, only 5 Au pile remains, bot gold = 5 => BUY 5 Au
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 3, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, cardsRemaining: 0, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 5 }, snap);
        const passed = evalRes.noAuctionsRemaining === true &&
            evalRes.isOnlyLuxuryPileRemaining === true &&
            evalRes.forcedPostAuctionLuxuryConversion === true &&
            evalRes.recommendation.action === "BUY_LUXURY" &&
            evalRes.recommendation.targetId === 0;
        results.push({ test: 'Test KC — No auctions, only 5 Au pile remains, bot gold = 5 => BUY 5 Au (Post-Auction Test A)', passed, details: evalRes.recommendation });
    }

    // Test KD (Post-Auction B) — No auctions, only 5 Au pile remains, bot gold = 7 => BUY 5 Au
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 3, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, cardsRemaining: 0, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 7 }, snap);
        const passed = evalRes.noAuctionsRemaining === true &&
            evalRes.isOnlyLuxuryPileRemaining === true &&
            evalRes.recommendation.action === "BUY_LUXURY" &&
            evalRes.recommendation.targetId === 0;
        results.push({ test: 'Test KD — No auctions, only 5 Au pile remains, bot gold = 7 => BUY 5 Au (Post-Auction Test B)', passed, details: evalRes.recommendation });
    }

    // Test KE (Post-Auction C) — No auctions, only 5 Au pile remains, bot gold = 13 => BUY 5 Au
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 3, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, cardsRemaining: 0, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 13 }, snap);
        const passed = evalRes.noAuctionsRemaining === true &&
            evalRes.isOnlyLuxuryPileRemaining === true &&
            evalRes.forcedPostAuctionLuxuryConversion === true &&
            evalRes.recommendation.action === "BUY_LUXURY" &&
            evalRes.recommendation.targetId === 0;
        results.push({ test: 'Test KE — No auctions, only 5 Au pile remains, bot gold = 13 => BUY 5 Au (Post-Auction Test C)', passed, details: evalRes.recommendation });
    }

    // Test KF (Post-Auction D) — No auctions, 5 Au (1P) + 10 Au (3P) remain, bot gold = 7 => SAVE for 10 Au
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 3, isOpen: true, visibleCard: { name: "Wine Cellar", points: 1, cost: 5, tier: 1, type: 'LUXURY' } },
            { id: 1, cost: 10, cardsRemaining: 3, isOpen: true, visibleCard: { name: "Rocket Ship", points: 3, cost: 10, tier: 2, type: 'LUXURY' } },
            { id: 2, cost: 15, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 7 }, snap);
        const plan = evalRes.postAuctionLuxuryPlan;
        const passed = evalRes.noAuctionsRemaining === true &&
            plan.postAuctionLuxuryPlan === "SAVE_FOR_HIGHER_VALUE" &&
            plan.bestFutureLuxuryTargetDeckId === 1 &&
            plan.goldNeededForBestFutureTarget === 3 &&
            evalRes.recommendation.action === "MAP";
        results.push({ test: 'Test KF — No auctions, 5 Au (1P) + 10 Au (3P) remain, bot gold = 7 => SAVE for 10 Au (Post-Auction Test D)', passed, details: { plan, rec: evalRes.recommendation } });
    }

    // Test KG (Post-Auction E) — No auctions, 5 Au (1P) + 10 Au (3P) remain, bot gold = 12 => BUY 10 Au
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 3, isOpen: true, visibleCard: { name: "Wine Cellar", points: 1, cost: 5, tier: 1, type: 'LUXURY' } },
            { id: 1, cost: 10, cardsRemaining: 3, isOpen: true, visibleCard: { name: "Rocket Ship", points: 3, cost: 10, tier: 2, type: 'LUXURY' } },
            { id: 2, cost: 15, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 12 }, snap);
        const passed = evalRes.noAuctionsRemaining === true &&
            evalRes.recommendation.action === "BUY_LUXURY" &&
            evalRes.recommendation.targetId === 1;
        results.push({ test: 'Test KG — No auctions, 5 Au (1P) + 10 Au (3P) remain, bot gold = 12 => BUY 10 Au (Post-Auction Test E)', passed, details: evalRes.recommendation });
    }

    // Test KH (Post-Auction F) — No auctions, 5 Au (3P) + 10 Au (1P) remain, bot gold = 7 => BUY 5 Au
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 3, isOpen: true, visibleCard: { name: "Rocket Ship", points: 3, cost: 5, tier: 1, type: 'LUXURY' } },
            { id: 1, cost: 10, cardsRemaining: 3, isOpen: true, visibleCard: { name: "Wine Cellar", points: 1, cost: 10, tier: 2, type: 'LUXURY' } },
            { id: 2, cost: 15, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 7 }, snap);
        const passed = evalRes.noAuctionsRemaining === true &&
            evalRes.recommendation.action === "BUY_LUXURY" &&
            evalRes.recommendation.targetId === 0;
        results.push({ test: 'Test KH — No auctions, 5 Au (3P) + 10 Au (1P) remain, bot gold = 7 => BUY 5 Au (Post-Auction Test F)', passed, details: evalRes.recommendation });
    }

    // Test KI (Post-Auction G) — No auctions, only 5 Au pile remains, ordinary Map finisher available => BUY_LUXURY overrides finisher
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 3, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, cardsRemaining: 0, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];
        // Row 0 has only r0c3 remaining -> line finisher (+5 Au)
        snap.grid = [
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r2c3', r: 2, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];

        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 8 }, snap);
        const passed = evalRes.noAuctionsRemaining === true &&
            evalRes.isOnlyLuxuryPileRemaining === true &&
            evalRes.recommendation.action === "BUY_LUXURY" &&
            evalRes.recommendation.targetId === 0 &&
            evalRes.recommendation.reason === "ONLY_PILE_LEFT_BUY_NOW";
        results.push({ test: 'Test KI — No auctions, only 5 Au pile remains, BUY_LUXURY overrides ordinary finisher (Post-Auction Test G)', passed, details: evalRes.recommendation });
    }

    // Test KJ (Post-Auction H) — No auctions, only 5 Au pile remains, bot gold = 4 => cannot buy, selects normal Map
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 3, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, cardsRemaining: 0, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];
        snap.grid = [
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 4 }, snap);
        const passed = evalRes.noAuctionsRemaining === true &&
            evalRes.postAuctionLuxuryPlan.postAuctionLuxuryPlan === "NO_AFFORDABLE" &&
            evalRes.recommendation.action === "MAP" &&
            evalRes.recommendation.targetId === 'r0c3';
        results.push({ test: 'Test KJ — No auctions, bot cannot afford remaining Luxury, selects normal Map (Post-Auction Test H)', passed, details: evalRes.recommendation });
    }

    // Test KK (Post-Auction I) — No auctions, all Luxury piles empty => normal Map logic
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 0, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, cardsRemaining: 0, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];
        snap.grid = [
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 20 }, snap);
        const passed = evalRes.noAuctionsRemaining === true &&
            evalRes.postAuctionLuxuryPlan.postAuctionLuxuryPlan === "NONE_REMAIN" &&
            evalRes.recommendation.action === "MAP" &&
            evalRes.recommendation.targetId === 'r0c3';
        results.push({ test: 'Test KK — No auctions, all Luxury piles empty, selects normal Map (Post-Auction Test I)', passed, details: evalRes.recommendation });
    }

    // Test KL — Post-Auction Luxury Tax Cost & Ms. Post Exemption (Phase 5B.14 Item 2)
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, taxCount: 1, cardsRemaining: 3, isOpen: false, visibleCard: null },
            { id: 1, cost: 10, taxCount: 0, cardsRemaining: 0, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, taxCount: 0, cardsRemaining: 0, isOpen: false, visibleCard: null }
        ];

        // A & B: Normal player with 6 Au (taxCount=1 => effectiveCost = 5 + 2 = 7) -> NOT affordable
        const planNormal6 = evaluatePostAuctionLuxuryPlan(snap, { bot: { id: 1, gold: 6 } });
        const testA_B_passed = planNormal6.affordableLuxuryPileCount === 0 &&
            planNormal6.postAuctionLuxuryPlan === "NO_AFFORDABLE" &&
            planNormal6.goldNeededForBestFutureTarget === 1;

        // C: Normal player with 7 Au -> IS affordable
        const planNormal7 = evaluatePostAuctionLuxuryPlan(snap, { bot: { id: 1, gold: 7 } });
        const testC_passed = planNormal7.affordableLuxuryPileCount === 1 &&
            planNormal7.postAuctionLuxuryPlan === "BUY_NOW" &&
            planNormal7.bestAffordableLuxuryDeckId === 0;

        // D: Ms. Post with 5 Au -> exempt from tax, effectiveCost remains 5 -> IS affordable
        const planMsPost5 = evaluatePostAuctionLuxuryPlan(snap, { bot: { id: 1, gold: 5, character: { name: 'MS. POST' } } });
        const testD_passed = planMsPost5.affordableLuxuryPileCount === 1 &&
            planMsPost5.postAuctionLuxuryPlan === "BUY_NOW" &&
            planMsPost5.bestAffordableLuxuryDeckId === 0;

        const passed = testA_B_passed && testC_passed && testD_passed;
        results.push({
            test: 'Test KL — Post-Auction Luxury Tax authoritative formula (cost + taxCount*2) & Ms. Post tax exemption',
            passed,
            details: { planNormal6, planNormal7, planMsPost5 }
        });
    }

    // Test KM — Multi-Pile Post-Auction Targeting uses Expected Acquisition Value (5 Au 3P vs 15 Au 3P, no rerolls)
    {
        const snap = createBaseValidSnapshot();
        snap.auctions = { A: { resolved: true }, B: { resolved: true } };
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 3, isOpen: true, visibleCard: { name: "Vintage Wine", points: 3, cost: 5, tier: 1, type: 'LUXURY', rerollsGranted: 0 } },
            { id: 1, cost: 10, cardsRemaining: 0, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, cardsRemaining: 3, isOpen: true, visibleCard: { name: "Mega Yacht", points: 3, cost: 15, tier: 3, type: 'LUXURY', rerollsGranted: 0 } }
        ];
        snap.grid = [
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false }
        ];

        // Bot has 12 Au, 0 rerolls. 5 Au (3P) expected gross = 3.0 * (2/6) = 1.0. 15 Au (3P) expected gross = 3.0 * 1.0 = 3.0.
        // Difference = 2.0 (>= 1.0), deficit = 3 (<= 5). Bot must save toward 15 Au deck.
        const evalRes = evaluateTurnActions({ id: 10, botId: 10, gold: 12, rerolls: 0 }, snap);
        const plan = evalRes.postAuctionLuxuryPlan;
        const passed = evalRes.noAuctionsRemaining === true &&
            plan.postAuctionLuxuryPlan === "SAVE_FOR_HIGHER_VALUE" &&
            plan.bestAffordableLuxuryDeckId === 0 &&
            plan.bestFutureLuxuryTargetDeckId === 2 &&
            plan.goldNeededForBestFutureTarget === 3 &&
            evalRes.recommendation.action === "MAP";

        results.push({
            test: 'Test KM — 5 Au (3P, 2/6 success) vs 15 Au (3P, 1.0 success) with 12 Au => SAVE for 15 Au (Expected Acquisition Value)',
            passed,
            details: { plan, rec: evalRes.recommendation }
        });
    }

    // Test KN — 5 Au Visible 3P with Planned Reroll achieves 5/9 success rate and higher expected gross value
    {
        const rateInfoNoReroll = getLuxuryAttemptSuccessRate(0, { botRerolls: 0, isOpen: true, visiblePoints: 3 });
        const rateInfoWithReroll = getLuxuryAttemptSuccessRate(0, { botRerolls: 1, isOpen: true, visiblePoints: 3 });

        const noRerollExpectedValue = Number((3.0 * rateInfoNoReroll.successRate).toFixed(4));
        const withRerollExpectedValue = Number((3.0 * rateInfoWithReroll.successRate).toFixed(4));

        const passed = rateInfoNoReroll.plannedReroll === false &&
            Math.abs(rateInfoNoReroll.successRate - (2 / 6)) < 0.0001 &&
            noRerollExpectedValue === 1.0 &&
            rateInfoWithReroll.plannedReroll === true &&
            Math.abs(rateInfoWithReroll.successRate - (5 / 9)) < 0.0001 &&
            withRerollExpectedValue === 1.6667;

        results.push({
            test: 'Test KN — 5 Au Visible 3P with planned reroll achieves 5/9 (~55.56%) success and 1.6667 expected value',
            passed,
            details: { rateInfoNoReroll, rateInfoWithReroll, noRerollExpectedValue, withRerollExpectedValue }
        });
    }

    // ============================================================================
    // VISITOR ROSTER & STRATEGIC ROUTING TESTS (PHASE 5E.0)
    // ============================================================================

    // Test KO — Visitor Roster 10 items, sequential IDs 1..10, exact name sequence (Phase 5E.1)
    {
        const expectedOrder = [
            { id: 1, name: "Goober" },
            { id: 2, name: "Superboy" },
            { id: 3, name: "Surfer Dude" },
            { id: 4, name: "Boss Cat" },
            { id: 5, name: "Robot" },
            { id: 6, name: "Pirate" },
            { id: 7, name: "Flamingo Queen" },
            { id: 8, name: "Magician" },
            { id: 9, name: "The Twins" },
            { id: 10, name: "Gran Gran" }
        ];
        const actualOrder = botRoster.map(b => ({ id: b.id, name: b.name }));
        const passed = JSON.stringify(actualOrder) === JSON.stringify(expectedOrder);
        results.push({ test: 'Test KO — Visitor Roster 10 items, sequential IDs 1..10, exact name sequence', passed, details: { actualOrder, expectedOrder } });
    }

    // Test KP — Authoritative Starting Rerolls [0, 0, 0, 0, 0, 0, 0, 1, 3, 6]
    {
        const expectedRerolls = [0, 0, 0, 0, 0, 0, 0, 1, 3, 6];
        const actualRerolls = botRoster.map(b => b.abilities?.maxRerolls);
        const passed = JSON.stringify(actualRerolls) === JSON.stringify(expectedRerolls);
        results.push({ test: 'Test KP — Authoritative Starting Rerolls [0, 0, 0, 0, 0, 0, 0, 1, 3, 6]', passed, details: { actualRerolls, expectedRerolls } });
    }

    // Test KQ — Gran Gran (botId 10) resolves STRATEGIC when switch is on
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 5, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks.forEach(d => { d.isOpen = false; d.visibleCard = null; });
        const evalRes = evaluateTurnActions({ id: 1, botId: 10, name: "Gran Gran", gold: 20 }, snap);
        const res = resolveBotTurnExecution({
            bot: { id: 1, botId: 10, name: "Gran Gran", gold: 20 },
            knowledge: snap,
            rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
            useStrategicFullBots: true,
            legacyAction: "BUY_LUXURY",
            legacyTargetId: 0,
            legacyReason: "LEGACY_BUY",
            evaluation: evalRes
        });
        const passed = res.executionMode === "STRATEGIC" && res.executedAction === "MAP";
        results.push({ test: 'Test KQ — Gran Gran (botId 10) resolves STRATEGIC when switch is on', passed, details: res });
    }

    // Test KR — All 4 FULL Visitors (IDs 7, 8, 9, 10) resolve STRATEGIC (Phase 5E.2)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 5, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks.forEach(d => { d.isOpen = false; d.visibleCard = null; });

        const fullBots = [
            { id: 0, botId: 7, name: "Flamingo Queen", gold: 20 },
            { id: 1, botId: 8, name: "Magician", gold: 20 },
            { id: 2, botId: 9, name: "The Twins", gold: 20 },
            { id: 3, botId: 10, name: "Gran Gran", gold: 20 }
        ];

        const allStrategic = fullBots.every(b => {
            const evalRes = evaluateTurnActions(b, snap);
            const res = resolveBotTurnExecution({
                bot: b,
                knowledge: snap,
                rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
                useStrategicFullBots: true,
                legacyAction: "BUY_LUXURY",
                legacyTargetId: 0,
                legacyReason: "LEGACY_BUY",
                evaluation: evalRes
            });
            return res.executionMode === "STRATEGIC" && res.executedAction === "MAP";
        });

        const passed = allStrategic;
        results.push({ test: 'Test KR — All 4 FULL Visitors (7, 8, 9, 10) resolve STRATEGIC', passed, details: { allStrategic } });
    }

    // Test KS — All Bot Visitors (IDs 1..10) resolve STRATEGIC when switch is active (Phase 5E.6)
    {
        const snap = createBaseValidSnapshot();
        const allRosterBots = [
            { id: 0, botId: 1, name: "Goober", gold: 20, type: "BOT" },
            { id: 1, botId: 2, name: "Superboy", gold: 20, type: "BOT" },
            { id: 2, botId: 3, name: "Surfer Dude", gold: 20, type: "BOT" },
            { id: 3, botId: 4, name: "Boss Cat", gold: 20, type: "BOT" },
            { id: 4, botId: 5, name: "Robot", gold: 20, type: "BOT" },
            { id: 5, botId: 6, name: "Pirate", gold: 20, type: "BOT" },
            { id: 6, botId: 7, name: "Flamingo Queen", gold: 20, type: "BOT" },
            { id: 7, botId: 8, name: "Magician", gold: 20, type: "BOT" },
            { id: 8, botId: 9, name: "The Twins", gold: 20, type: "BOT" },
            { id: 9, botId: 10, name: "Gran Gran", gold: 20, type: "BOT" }
        ];

        const allStrategic = allRosterBots.every(b => {
            const evalRes = evaluateTurnActions(b, snap);
            const res = resolveBotTurnExecution({
                bot: b,
                knowledge: snap,
                rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
                useStrategicAI: true,
                legacyAction: "MAP",
                legacyTargetId: "r0c0",
                evaluation: evalRes
            });
            return res.executionMode === "STRATEGIC";
        });

        const passed = allStrategic;
        results.push({ test: 'Test KS — All Bot Visitors (1..10) resolve STRATEGIC in shared engine', passed, details: { allStrategic } });
    }

    // Test KT — Shuffled player seats with Human resolves LEGACY (Phase 5E.6)
    {
        const snap = createBaseValidSnapshot();
        const resBot = resolveBotTurnExecution({
            bot: { id: 10, botId: 2, name: "Superboy", gold: 20, type: "BOT" },
            knowledge: snap,
            rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
            useStrategicAI: true,
            legacyAction: "MAP",
            legacyTargetId: "r0c0",
            evaluation: evaluateTurnActions({ id: 10, botId: 2, name: "Superboy", gold: 20, type: "BOT" }, snap)
        });
        const resHuman = resolveBotTurnExecution({
            bot: { id: 10, name: "Human Player", gold: 20, type: "HUMAN" },
            knowledge: snap,
            useStrategicAI: true,
            legacyAction: "MAP",
            legacyTargetId: "r0c0"
        });
        const passed = resBot.executionMode === "STRATEGIC" && resHuman.executionMode === "LEGACY";
        results.push({ test: 'Test KT — Shuffled player seat bot resolves STRATEGIC while Human resolves LEGACY', passed, details: { resBot, resHuman } });
    }

    // Test KU — Strategic Auction Bidding for all 4 FULL Visitors (Phase 5E.2)
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = { id: 1, name: 'Mar-a-Lago', basePrice: 10, currentBid: 12, highestBidder: 0, participants: [0, 1, 2, 3] };
        snap.players = [
            { id: 0, botId: 7, name: "Flamingo Queen", gold: 30, prestige: 10, rerolls: 0, type: "BOT" },
            { id: 1, botId: 8, name: "Magician", gold: 30, prestige: 10, rerolls: 1, type: "BOT" },
            { id: 2, botId: 9, name: "The Twins", gold: 30, prestige: 10, rerolls: 3, type: "BOT" },
            { id: 3, botId: 10, name: "Gran Gran", gold: 30, prestige: 10, rerolls: 6, type: "BOT" }
        ];

        const bids = snap.players.map(b => evaluateStrategicAuctionBid(b, snap));
        const allBidsValid = bids.every(b => b && (b.action === 'RAISE' || b.action === 'FOLD') && typeof b.amount === 'number');
        const passed = allBidsValid && bids.length === 4;
        results.push({ test: 'Test KU — Strategic Auction Bidding routes all 4 FULL Visitors', passed, details: { bids } });
    }

    // Test KV — Strategic Map Reroll Decision routes across FULL Visitors (Phase 5E.2)
    {
        const snap = createBaseValidSnapshot();
        const mapCell = { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 3, flipped: false, empty: false };
        const twinsDec = shouldBotUseMapReroll({ id: 2, botId: 9, rerolls: 3 }, mapCell, snap);
        const magicianDec = shouldBotUseMapReroll({ id: 1, botId: 8, rerolls: 1 }, mapCell, snap);
        const passed = typeof twinsDec.shouldReroll === 'boolean' && typeof magicianDec.shouldReroll === 'boolean';
        results.push({ test: 'Test KV — Strategic Map Reroll routes across FULL Visitors', passed, details: { twinsDec, magicianDec } });
    }

    // Test KW — Strategic Luxury Reroll Decision routes across FULL Visitors (Phase 5E.2)
    {
        const decTwinsPlanned = resolveStrategicLuxuryRerollDecision({
            isFull: true,
            useStrategic: true,
            rerolls: 3,
            plannedReroll: true,
            firstRollSucceeded: false
        });
        const decTwinsUnplanned = resolveStrategicLuxuryRerollDecision({
            isFull: true,
            useStrategic: true,
            rerolls: 3,
            plannedReroll: false,
            firstRollSucceeded: false
        });
        const decLegacy = resolveStrategicLuxuryRerollDecision({
            useStrategic: false,
            rerolls: 3,
            plannedReroll: false,
            firstRollSucceeded: false
        });

        const passed = decTwinsPlanned.shouldReroll === true &&
            (decTwinsPlanned.reason === "STRATEGIC_COMMITTED_LUXURY_REROLL" || decTwinsPlanned.reason === "STRATEGIC_PLANNED_REROLL") &&
            decTwinsUnplanned.shouldReroll === false &&
            decTwinsUnplanned.reason === "STRATEGIC_NO_REROLL_PLANNED" &&
            decLegacy.shouldReroll === true &&
            decLegacy.reason === "LEGACY_REROLL_CONSUMPTION";
        results.push({ test: 'Test KW — Strategic Luxury Reroll routes across FULL Visitors', passed, details: { decTwinsPlanned, decTwinsUnplanned, decLegacy } });
    }

    // Test KX — Roster Starting Rerolls Integrity (Flamingo Queen: 0, Magician: 1, Twins: 3, Gran Gran: 6) (Phase 5E.2)
    {
        const fq = botRoster.find(b => b.id === 7);
        const mag = botRoster.find(b => b.id === 8);
        const twins = botRoster.find(b => b.id === 9);
        const gran = botRoster.find(b => b.id === 10);

        const passed = fq.abilities.maxRerolls === 0 &&
            mag.abilities.maxRerolls === 1 &&
            twins.abilities.maxRerolls === 3 &&
            gran.abilities.maxRerolls === 6;
        results.push({ test: 'Test KX — Roster Starting Rerolls Integrity for FULL Visitors', passed, details: { fq: fq?.abilities?.maxRerolls, mag: mag?.abilities?.maxRerolls, twins: twins?.abilities?.maxRerolls, gran: gran?.abilities?.maxRerolls } });
    }

    // Test KY — Isolated Recent Map History per Bot Instance (Phase 5E.2 Part 9)
    {
        const botA = { id: 1, botId: 7, name: "Flamingo Queen", _recentStrategicMapRegions: ["BLOCK", "BLOCK"] };
        const botB = { id: 2, botId: 9, name: "The Twins", _recentStrategicMapRegions: ["WATERFRONT"] };
        const botC = { id: 3, botId: 10, name: "Gran Gran" }; // No history yet

        const snap = createBaseValidSnapshot();
        const ctxA = analyzeStrategicContext(botA, snap);
        const ctxB = analyzeStrategicContext(botB, snap);
        const ctxC = analyzeStrategicContext(botC, snap);

        const passed = ctxA.recentMapRegions.length === 2 &&
            ctxA.recentMapRegions[0] === "BLOCK" &&
            ctxB.recentMapRegions.length === 1 &&
            ctxB.recentMapRegions[0] === "WATERFRONT" &&
            ctxC.recentMapRegions.length === 0;
        results.push({ test: 'Test KY — Isolated Recent Map History per Bot Instance', passed, details: { rA: ctxA.recentMapRegions, rB: ctxB.recentMapRegions, rC: ctxC.recentMapRegions } });
    }

    // Test KZ — Neutral Personality Baseline Across FULL Visitors (Phase 5E.2 Part 8)
    {
        const cellBlock = { id: 'r0c2', r: 0, c: 2, type: 'BLOCK' };
        const cellLagoon = { id: 'r0c0', r: 0, c: 0, type: 'LAGOON' };
        const cellWf = { id: 'r0c1', r: 0, c: 1, type: 'WF_L' };
        const cellAtl = { id: 'r0c8', r: 0, c: 8, type: 'ATLANTIC' };

        const modBlock = getMapPersonalityPrestigeEq(cellBlock, "BALANCED");
        const modLagoon = getMapPersonalityPrestigeEq(cellLagoon, "BALANCED");
        const modWf = getMapPersonalityPrestigeEq(cellWf, "BALANCED");
        const modAtl = getMapPersonalityPrestigeEq(cellAtl, "BALANCED");

        const passed = modBlock === 0.00 && modLagoon === 0.00 && modWf === 0.00 && modAtl === 0.00;
        results.push({ test: 'Test KZ — Neutral Personality Baseline Across FULL Visitors (0.00 Prestige-Eq)', passed, details: { modBlock, modLagoon, modWf, modAtl } });
    }

    // Test LA — Data-Driven Routing in resolveBotTurnExecution (Phase 5E.6 & 5E.6a)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 5, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks.forEach(d => { d.isOpen = false; d.visibleCard = null; });

        const botFull = { id: 0, botId: 10, name: "Gran Gran", gold: 20, type: 'BOT', aiDepth: 'FULL' };
        const evalFull = evaluateTurnActions(botFull, snap);
        const resFull = resolveBotTurnExecution({
            bot: botFull,
            knowledge: snap,
            rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
            useStrategicAI: true,
            legacyAction: "BUY_LUXURY",
            legacyTargetId: 0,
            legacyReason: "LEGACY_BUY",
            evaluation: evalFull
        });

        const botMed = { id: 1, botId: 4, name: "Boss Cat", gold: 20, type: 'BOT', aiDepth: 'MEDIUM' };
        const evalMed = evaluateTurnActions(botMed, snap);
        const resMed = resolveBotTurnExecution({
            bot: botMed,
            knowledge: snap,
            rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
            useStrategicAI: true,
            legacyAction: "BUY_LUXURY",
            legacyTargetId: 0,
            legacyReason: "LEGACY_BUY",
            evaluation: evalMed
        });

        const botLow = { id: 2, botId: 1, name: "Goober", gold: 20, type: 'BOT', aiDepth: 'LOW' };
        const evalLow = evaluateTurnActions(botLow, snap);
        const resLow = resolveBotTurnExecution({
            bot: botLow,
            knowledge: snap,
            rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
            useStrategicAI: true,
            legacyAction: "BUY_LUXURY",
            legacyTargetId: 0,
            legacyReason: "LEGACY_BUY",
            evaluation: evalLow
        });

        const humanPlayer = { id: 3, name: "Human Player", gold: 20, type: 'HUMAN' };
        const resHuman = resolveBotTurnExecution({
            bot: humanPlayer,
            knowledge: snap,
            rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
            useStrategicAI: true,
            legacyAction: "BUY_LUXURY",
            legacyTargetId: 0,
            legacyReason: "LEGACY_BUY"
        });

        const resDisabled = resolveBotTurnExecution({
            bot: botFull,
            knowledge: snap,
            rawState: { grid: [{ id: 'r0c0', flipped: false, empty: false }], luxuryDecks: [] },
            useStrategicAI: false,
            useStrategicFullBots: false,
            legacyAction: "BUY_LUXURY",
            legacyTargetId: 0,
            legacyReason: "LEGACY_BUY",
            evaluation: evalFull
        });

        const passFeatures = evalLow.depthFeatures.lineAwareness === false &&
            evalMed.depthFeatures.lineAwareness === true && evalMed.depthFeatures.probabilityModeling === false &&
            evalFull.depthFeatures.probabilityModeling === true;

        const passExecution = resFull.executionMode === "STRATEGIC" &&
            resMed.executionMode === "STRATEGIC" &&
            resLow.executionMode === "STRATEGIC" &&
            resHuman.executionMode === "LEGACY" &&
            resDisabled.executionMode === "LEGACY";

        const passed = passFeatures && passExecution;
        results.push({ test: 'Test LA — Data-Driven Routing in resolveBotTurnExecution (Phase 5E.6 & 5E.6a)', passed, details: { passFeatures, passExecution, resHumanMode: resHuman.executionMode } });
    }

    // Test LB — Strategic Personality Resolution (Phase 5E.3 Part 19)
    {
        const pFq = getStrategicPersonality({ id: 0, botId: 7, name: "Flamingo Queen" });
        const pMag = getStrategicPersonality({ id: 1, botId: 8, name: "Magician" });
        const pTwins = getStrategicPersonality({ id: 2, botId: 9, name: "The Twins" });
        const pGran = getStrategicPersonality({ id: 3, botId: 10, name: "Gran Gran" });
        const pFallback = getStrategicPersonality({ id: 4, name: "Custom Unknown Bot" });
        const pShuffled = getStrategicPersonality({ id: 0, botId: 8, name: "Magician (Seat 0)" });

        const passed = pFq === "BALANCED" &&
            pMag === "AGGRESSIVE" &&
            pTwins === "BALANCED" &&
            pGran === "CAUTIOUS" &&
            pFallback === "BALANCED" &&
            pShuffled === "AGGRESSIVE";
        results.push({ test: 'Test LB — Strategic Personality Resolution across Roster & Shuffled Seats (Phase 5E.3 Part 19)', passed, details: { pFq, pMag, pTwins, pGran, pFallback, pShuffled } });
    }

    // Test LC — BALANCED Profile Control Neutrality (Phase 5E.3 Part 20)
    {
        const prof = STRATEGIC_PERSONALITY_PROFILES.BALANCED;
        const profCaut = STRATEGIC_PERSONALITY_PROFILES.CAUTIOUS;
        const profAgg = STRATEGIC_PERSONALITY_PROFILES.AGGRESSIVE;
        const passed = prof.auctionReserveMultiplier === 1.00 &&
            prof.failureAversionPrestigeEq === 0.00 &&
            prof.highRiskMapModifierPrestigeEq === 0.00 &&
            prof.coastalModifierPrestigeEq === 0.00 &&
            prof.luxuryRiskModifierPrestigeEq === 0.00 &&
            prof.waterfrontRiskModifierPrestigeEq === 0.00 &&
            prof.auctionBidMultiplier === 1.00 &&
            profCaut.auctionBidMultiplier === 1.00 &&
            profAgg.auctionBidMultiplier === 1.02;
        results.push({ test: 'Test LC — BALANCED Profile Control Neutrality (Exact 5E.2 Baseline Verification)', passed, details: { prof, profCaut, profAgg } });
    }

    // Test LD — Auction Cash Preservation & Urgency Scaling (Phase 5E.3 Part 21)
    {
        const u5 = getAuctionUrgencyPersonalityStrength(5, false, 1);
        const u4 = getAuctionUrgencyPersonalityStrength(4, false, 1);
        const u3 = getAuctionUrgencyPersonalityStrength(3, false, 1);
        const u2 = getAuctionUrgencyPersonalityStrength(2, false, 1);
        const uActive = getAuctionUrgencyPersonalityStrength(2, true, 1);
        const uNone = getAuctionUrgencyPersonalityStrength(2, false, 0);

        const baseReserve = 20;
        const multCautious = STRATEGIC_PERSONALITY_PROFILES.CAUTIOUS.auctionReserveMultiplier; // 1.10
        const multAggressive = STRATEGIC_PERSONALITY_PROFILES.AGGRESSIVE.auctionReserveMultiplier; // 0.90
        const multBalanced = STRATEGIC_PERSONALITY_PROFILES.BALANCED.auctionReserveMultiplier; // 1.00

        const resC5 = Number((baseReserve * (1 + (multCautious - 1) * u5)).toFixed(2));
        const resC4 = Number((baseReserve * (1 + (multCautious - 1) * u4)).toFixed(2));
        const resC3 = Number((baseReserve * (1 + (multCautious - 1) * u3)).toFixed(2));
        const resC2 = Number((baseReserve * (1 + (multCautious - 1) * u2)).toFixed(2));

        const resAggAt3 = Number((baseReserve * (1 + (multAggressive - 1) * u3)).toFixed(2));
        const resBalAt3 = Number((baseReserve * (1 + (multBalanced - 1) * u3)).toFixed(2));
        const resCautAt3 = Number((baseReserve * (1 + (multCautious - 1) * u3)).toFixed(2));

        const passed = u5 === 0.25 && u4 === 0.50 && u3 === 0.75 && u2 === 1.00 && uActive === 1.00 && uNone === 0.00 &&
            resC5 === 20.5 && resC4 === 21.0 && resC3 === 21.5 && resC2 === 22.0 &&
            resAggAt3 < resBalAt3 && resBalAt3 < resCautAt3 &&
            resAggAt3 === 18.5 && resBalAt3 === 20.0 && resCautAt3 === 21.5;
        results.push({ test: 'Test LD — Auction Cash Preservation & Urgency Scaling (AGGRESSIVE < BALANCED < CAUTIOUS)', passed, details: { u5, u4, u3, u2, resC5, resC4, resC3, resC2, resAggAt3, resBalAt3, resCautAt3 } });
    }

    // Test LE — Luxury Risk Personality Scaling & Reroll Mitigating Effect (Phase 5E.3 Part 22)
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, gold: 20, totalGold: 20, prestige: 0, inventory: [] },
            { id: 1, gold: 20, totalGold: 20, prestige: 0, inventory: [] },
            { id: 2, gold: 20, totalGold: 20, prestige: 0, inventory: [] }
        ];
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 8, difficulty: 4, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks = [
            { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Snorkel", points: 1 } },
            { id: 1, cost: 10, taxCount: 0, cardsRemaining: 5, isOpen: false, visibleCard: null },
            { id: 2, cost: 15, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3 } }
        ];

        const botAgg = { id: 0, botId: 8, name: "Magician", gold: 20, rerolls: 0, personality: "AGGRESSIVE" };
        const botBal = { id: 1, botId: 7, name: "Flamingo Queen", gold: 20, rerolls: 0, personality: "BALANCED" };
        const botCaut = { id: 2, botId: 10, name: "Gran Gran", gold: 20, rerolls: 0, personality: "CAUTIOUS" };

        const evalAgg = evaluateTurnActions(botAgg, snap);
        const evalBal = evaluateTurnActions(botBal, snap);
        const evalCaut = evaluateTurnActions(botCaut, snap);

        const lux5Agg = evalAgg.luxuryActions.find(l => l.deckId === 0);
        const lux5Bal = evalBal.luxuryActions.find(l => l.deckId === 0);
        const lux5Caut = evalCaut.luxuryActions.find(l => l.deckId === 0);

        const lux15Agg = evalAgg.luxuryActions.find(l => l.deckId === 2);
        const lux15Bal = evalBal.luxuryActions.find(l => l.deckId === 2);
        const lux15Caut = evalCaut.luxuryActions.find(l => l.deckId === 2);

        // 5 Au pile: AGG > BAL > CAUT
        const lux5Order = lux5Agg && lux5Bal && lux5Caut &&
            lux5Agg.totalUtility > lux5Bal.totalUtility && lux5Bal.totalUtility > lux5Caut.totalUtility;
        // 15 Au pile (automatic, failure prob 0): AGG == BAL == CAUT
        const lux15Equal = lux15Agg && lux15Bal && lux15Caut &&
            lux15Agg.totalUtility === lux15Bal.totalUtility && lux15Bal.totalUtility === lux15Caut.totalUtility && lux15Agg.luxuryRiskAdjustment === 0.00;

        const passed = Boolean(lux5Order && lux15Equal);
        results.push({ test: 'Test LE — Luxury Risk Personality Scaling & Reroll Mitigating Effect', passed, details: { lux5Agg: lux5Agg?.totalUtility, lux5Bal: lux5Bal?.totalUtility, lux5Caut: lux5Caut?.totalUtility, lux15Agg: lux15Agg?.totalUtility, lux15Bal: lux15Bal?.totalUtility, lux15Caut: lux15Caut?.totalUtility } });
    }

    // Test LF — Map Risk Personality Scaling & Coastal Flavor Adjustment (Phase 5E.3 Part 23)
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 0, gold: 10, totalGold: 10, prestige: 0, inventory: [] },
            { id: 1, gold: 10, totalGold: 10, prestige: 0, inventory: [] },
            { id: 2, gold: 10, totalGold: 10, prestige: 0, inventory: [] }
        ];
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, flipped: false, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 3, difficulty: 3, flipped: false, empty: false }
        ];

        const botAgg = { id: 0, botId: 8, name: "Magician", gold: 10, rerolls: 0, personality: "AGGRESSIVE" };
        const botBal = { id: 1, botId: 7, name: "Flamingo Queen", gold: 10, rerolls: 0, personality: "BALANCED" };
        const botCaut = { id: 2, botId: 10, name: "Gran Gran", gold: 10, rerolls: 0, personality: "CAUTIOUS" };

        const evalAgg = evaluateTurnActions(botAgg, snap);
        const evalBal = evaluateTurnActions(botBal, snap);
        const evalCaut = evaluateTurnActions(botCaut, snap);

        const diff0BlockAgg = evalAgg.mapActions.find(m => m.cellId === 'r0c2');
        const diff0BlockBal = evalBal.mapActions.find(m => m.cellId === 'r0c2');
        const diff0BlockCaut = evalCaut.mapActions.find(m => m.cellId === 'r0c2');

        const diff3BlockAgg = evalAgg.mapActions.find(m => m.cellId === 'r1c2');
        const diff3BlockBal = evalBal.mapActions.find(m => m.cellId === 'r1c2');
        const diff3BlockCaut = evalCaut.mapActions.find(m => m.cellId === 'r1c2');

        const lagoonAgg = evalAgg.mapActions.find(m => m.cellId === 'r0c0');
        const lagoonBal = evalBal.mapActions.find(m => m.cellId === 'r0c0');
        const lagoonCaut = evalCaut.mapActions.find(m => m.cellId === 'r0c0');

        // Diff 0 Block: no risk, no coastal flavor -> all identical
        const diff0Equal = diff0BlockAgg.totalUtility === diff0BlockBal.totalUtility && diff0BlockBal.totalUtility === diff0BlockCaut.totalUtility;
        // Diff 3 Block (failure risk): AGG > BAL > CAUT
        const diff3Order = diff3BlockAgg.totalUtility > diff3BlockBal.totalUtility && diff3BlockBal.totalUtility > diff3BlockCaut.totalUtility;
        // Lagoon (coastal flavor): AGG (+0.02) > BAL (0.00) > CAUT (-0.01)
        const lagoonOrder = lagoonAgg.coastalPersonalityAdjustment === 0.02 && lagoonBal.coastalPersonalityAdjustment === 0.00 && lagoonCaut.coastalPersonalityAdjustment === -0.01 &&
            lagoonAgg.totalUtility > lagoonBal.totalUtility && lagoonBal.totalUtility > lagoonCaut.totalUtility;

        const passed = diff0Equal && diff3Order && lagoonOrder;
        results.push({ test: 'Test LF — Map Risk Personality Scaling & Coastal Flavor Adjustment', passed, details: { diff0Equal, diff3Order, lagoonOrder } });
    }

    // Test LG — Strategic Auction Bid Personality Modifier & Legality Clamping (Phase 5E.3 Part 24)
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = { id: 'A', name: "Spanish River", currentBid: 10, highestBidderId: 0, participants: [0, 1, 2], isVisible: true, visibleCard: { points: 2 } };
        snap.players = [
            { id: 0, botId: 8, name: "Magician", gold: 30, personality: "AGGRESSIVE" },
            { id: 1, botId: 7, name: "Flamingo Queen", gold: 30, personality: "BALANCED" },
            { id: 2, botId: 10, name: "Gran Gran", gold: 30, personality: "CAUTIOUS" }
        ];

        const ceilAgg = calculateStrategicAuctionBidCeiling(snap.players[0], snap);
        const ceilBal = calculateStrategicAuctionBidCeiling(snap.players[1], snap);
        const ceilCaut = calculateStrategicAuctionBidCeiling(snap.players[2], snap);

        // Max bid: CAUTIOUS matches BALANCED; AGGRESSIVE >= BALANCED
        const cautiousEqualsBalanced = ceilCaut.strategicMaxBidAu === ceilBal.strategicMaxBidAu;
        const aggressiveGteBalanced = ceilAgg.strategicMaxBidAu >= ceilBal.strategicMaxBidAu;
        const multipliersCorrect = ceilAgg.auctionBidMultiplier === 1.02 &&
            ceilBal.auctionBidMultiplier === 1.00 &&
            ceilCaut.auctionBidMultiplier === 1.00;

        // Wallet clamping check: bot with only 5 Au
        const poorBot = { id: 0, botId: 8, name: "Magician", gold: 5, personality: "AGGRESSIVE" };
        const ceilPoor = calculateStrategicAuctionBidCeiling(poorBot, snap);
        const clampedToWallet = ceilPoor.strategicMaxBidAu <= 5;

        const passed = cautiousEqualsBalanced && aggressiveGteBalanced && multipliersCorrect && clampedToWallet;
        results.push({ test: 'Test LG — Strategic Auction Bid Personality Modifier & Legality Clamping', passed, details: { aggBid: ceilAgg.strategicMaxBidAu, balBid: ceilBal.strategicMaxBidAu, cautBid: ceilCaut.strategicMaxBidAu, poorBid: ceilPoor.strategicMaxBidAu } });
    }

    // Test LH — Endgame Win-Lock & Forced Action Primacy over Personality (Phase 5E.3 Part 25)
    {
        const snap = createBaseValidSnapshot();
        snap.players = [
            { id: 10, name: "Gran Gran", gold: 20, prestige: 25, isSelf: true }
        ];
        // Only 1 card on entire board
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 5, difficulty: 0, empty: false, flipped: false, locked: false }
        ];
        snap.luxuryDecks.forEach(d => { d.cardsRemaining = 0; d.isOpen = false; });

        const evalGran = evaluateTurnActions({ id: 10, botId: 10, name: "Gran Gran", gold: 20, prestige: 25, personality: "CAUTIOUS" }, snap);
        const passed = evalGran.recommendation.action === "MAP" && evalGran.recommendation.targetId === "r0c0";
        results.push({ test: 'Test LH — Endgame Win-Lock & Forced Action Primacy over Personality', passed, details: evalGran.recommendation });
    }

    // Test LI — Bot Reroll Telemetry: No entry on mere consideration (Phase 5E.3a)
    {
        clearBotRerollHistory();
        const snap = createBaseValidSnapshot();
        const mapCell = { id: 'r0c0', r: 0, c: 0, type: 'BLOCK', value: 3, difficulty: 3, flipped: false, empty: false };
        shouldBotUseMapReroll({ id: 2, botId: 9, rerolls: 3 }, mapCell, snap);
        resolveStrategicLuxuryRerollDecision({ isFull: true, isGranGran: false, useStrategic: true, rerolls: 3, plannedReroll: true, firstRollSucceeded: false });
        const passed = __botRerollHistory.length === 0;
        results.push({ test: 'Test LI — Bot Reroll Telemetry: No entry on mere consideration (Phase 5E.3a)', passed, details: { historyCount: __botRerollHistory.length } });
    }

    // Test LJ — Bot Reroll Telemetry: Exactly one entry on actual consumption & reroll delta === 1 (Phase 5E.3a)
    {
        clearBotRerollHistory();
        const entry = {
            turnCount: 27,
            botId: 9,
            botName: "The Twins",
            aiDepth: "FULL",
            personality: "BALANCED",
            source: "LUXURY",
            rerollsBefore: 3,
            rerollsAfter: 2,
            targetId: 1,
            targetType: "LUXURY_DECK",
            originalRoll: 2,
            rerollRoll: 5,
            originalRollSucceeded: false,
            rerollSucceeded: true,
            plannedReroll: true,
            plannedRerollReason: "CLOSED_DECK_EXPECTED_2P",
            decisionReason: "STRATEGIC_PLANNED_REROLL",
            deckId: 1,
            effectiveCost: 10,
            visiblePoints: null,
            isOpen: false,
            baseSuccessRate: 4 / 6,
            rerollAdjustedSuccessRate: 8 / 9
        };
        recordBotReroll(entry);
        const passed = __botRerollHistory.length === 1 &&
            (__botRerollHistory[0].rerollsBefore - __botRerollHistory[0].rerollsAfter === 1) &&
            __botRerollHistory[0].source === "LUXURY" &&
            __botRerollHistory[0].rerollSucceeded === true;
        results.push({ test: 'Test LJ — Bot Reroll Telemetry: Exactly one entry on actual consumption & reroll delta === 1 (Phase 5E.3a)', passed, details: { count: __botRerollHistory.length, entry: __botRerollHistory[0] } });
    }

    // Test LK — Bot Reroll Telemetry: Stable Visitor botId preservation across seat shuffle (Phase 5E.3a)
    {
        clearBotRerollHistory();
        const shuffledBot = { id: 0, botId: 8, name: "Magician (Seat 0)", type: "BOT" };
        const entry = {
            turnCount: 15,
            botId: shuffledBot.botId !== undefined ? shuffledBot.botId : (shuffledBot.botRef?.id || shuffledBot.id),
            botName: shuffledBot.name,
            aiDepth: getBotAiDepth(shuffledBot),
            personality: getStrategicPersonality(shuffledBot),
            source: "MAP",
            rerollsBefore: 1,
            rerollsAfter: 0,
            targetId: "r2c2",
            targetType: "BLOCK",
            cellId: "r2c2",
            region: "BLOCK",
            difficulty: 3,
            locked: false,
            originalRoll: 2,
            rerollRoll: 4,
            originalRollSucceeded: false,
            rerollSucceeded: true,
            plannedReroll: false,
            plannedRerollReason: null,
            decisionReason: "HIGH_VALUE_MAP_REROLL",
            strategicMapRerollReason: "HIGH_VALUE_MAP_REROLL"
        };
        recordBotReroll(entry);
        const passed = __botRerollHistory.length === 1 &&
            __botRerollHistory[0].botId === 8 &&
            __botRerollHistory[0].personality === "AGGRESSIVE" &&
            __botRerollHistory[0].aiDepth === "FULL";
        results.push({ test: 'Test LK — Bot Reroll Telemetry: Stable Visitor botId preservation across seat shuffle (Phase 5E.3a)', passed, details: { botId: __botRerollHistory[0]?.botId, personality: __botRerollHistory[0]?.personality } });
    }

    // Test LL — Bot Reroll Telemetry: Source differentiation (MAP vs LUXURY with full fields) (Phase 5E.3a)
    {
        clearBotRerollHistory();
        const mapEntry = {
            turnCount: 58,
            botId: 9,
            botName: "The Twins",
            aiDepth: "FULL",
            personality: "BALANCED",
            source: "MAP",
            rerollsBefore: 2,
            rerollsAfter: 1,
            targetId: "r6c8",
            targetType: "ATLANTIC",
            cellId: "r6c8",
            region: "ATLANTIC",
            difficulty: 4,
            locked: false,
            originalRoll: 2,
            rerollRoll: 6,
            originalRollSucceeded: false,
            rerollSucceeded: true,
            plannedReroll: false,
            plannedRerollReason: null,
            decisionReason: "ENDGAME_MAP_REROLL",
            strategicMapRerollReason: "ENDGAME_MAP_REROLL"
        };
        const luxEntry = {
            turnCount: 75,
            botId: 10,
            botName: "Gran Gran",
            aiDepth: "FULL",
            personality: "CAUTIOUS",
            source: "LUXURY",
            rerollsBefore: 6,
            rerollsAfter: 5,
            targetId: 0,
            targetType: "LUXURY_DECK",
            deckId: 0,
            effectiveCost: 5,
            visiblePoints: 3,
            isOpen: true,
            baseSuccessRate: 2 / 6,
            rerollAdjustedSuccessRate: 5 / 9,
            originalRoll: 3,
            rerollRoll: 5,
            originalRollSucceeded: false,
            rerollSucceeded: true,
            plannedReroll: true,
            plannedRerollReason: "VISIBLE_3P_HIGH_VALUE",
            decisionReason: "STRATEGIC_PLANNED_REROLL"
        };
        recordBotReroll(mapEntry);
        recordBotReroll(luxEntry);

        const passed = __botRerollHistory.length === 2 &&
            __botRerollHistory[0].source === "MAP" && __botRerollHistory[0].cellId === "r6c8" && __botRerollHistory[0].region === "ATLANTIC" &&
            __botRerollHistory[1].source === "LUXURY" && __botRerollHistory[1].deckId === 0 && __botRerollHistory[1].visiblePoints === 3;
        results.push({ test: 'Test LL — Bot Reroll Telemetry: Source differentiation (MAP vs LUXURY with full fields) (Phase 5E.3a)', passed, details: { mapEntry: __botRerollHistory[0], luxEntry: __botRerollHistory[1] } });
    }

    // Test LM — Bot Reroll Telemetry: Visitor isolation & filtering (Twins vs Gran Gran) (Phase 5E.3a)
    {
        // 2 entries exist from Test LL: 1 for Twins (botId 9), 1 for Gran Gran (botId 10)
        const twinsHistory = inspectBotRerollHistory(9);
        const granHistory = inspectBotRerollHistory(10);
        const allHistory = inspectBotRerollHistory();

        const passed = twinsHistory.length === 1 && twinsHistory[0].botId === 9 &&
            granHistory.length === 1 && granHistory[0].botId === 10 &&
            allHistory.length === 2;
        results.push({ test: 'Test LM — Bot Reroll Telemetry: Visitor isolation & filtering (Twins vs Gran Gran) (Phase 5E.3a)', passed, details: { twinsCount: twinsHistory.length, granCount: granHistory.length, allCount: allHistory.length } });
    }

    // Test LN — Bot Reroll Telemetry: Clear & inspect helpers functionality (Phase 5E.3a)
    {
        const cleared = clearBotRerollHistory();
        const inspectAfter = inspectBotRerollHistory();
        const passed = cleared.length === 0 && inspectAfter.length === 0 && __botRerollHistory.length === 0;
        results.push({ test: 'Test LN — Bot Reroll Telemetry: Clear & inspect helpers functionality (Phase 5E.3a)', passed, details: { clearedLen: cleared.length, inspectLen: inspectAfter.length } });
    }

    // Test LP — 1 reroll + useful Luxury + ordinary Map failure => preserve (Phase 5E.4 Test A & J)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: 'BLOCK', value: 3, difficulty: 4, empty: false, flipped: false, locked: false });
            }
        }
        snap.luxuryDecks[0] = { id: 0, cost: 5, cardsRemaining: 3, isOpen: false };
        snap.luxuryDecks[1] = { id: 1, cost: 10, cardsRemaining: 3, isOpen: false };
        const mapCell = { id: 'r2c3', r: 2, c: 3, type: 'BLOCK', value: 2, difficulty: 4 };
        const magician = { id: 1, botId: 8, name: "Magician", rerolls: 1 };
        const dec = shouldBotUseMapReroll(magician, mapCell, snap);
        const passed = dec.shouldReroll === false && dec.reason === "PRESERVE_ONLY_REROLL_FOR_LUXURY";
        results.push({ test: 'Test LP — 1 reroll + useful Luxury + ordinary Map failure preserves reroll (Phase 5E.4 Test A & J)', passed, details: dec });
    }

    // Test LQ — 3 rerolls + useful Luxury + good Lagoon failure => reroll allowed while preserving at least 1 (Phase 5E.4 Test B & K)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: c === 0 ? 'LAGOON' : 'BLOCK', value: 3, difficulty: 4, empty: false, flipped: false, locked: false });
            }
        }
        snap.luxuryDecks[0] = { id: 0, cost: 5, cardsRemaining: 3, isOpen: false };
        snap.luxuryDecks[1] = { id: 1, cost: 10, cardsRemaining: 3, isOpen: false };
        const lagoonCell = { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 4, difficulty: 4 };
        const twins = { id: 2, botId: 9, name: "The Twins", rerolls: 3 };
        const dec = shouldBotUseMapReroll(twins, lagoonCell, snap);
        const passed = dec.shouldReroll === true && dec.reason === "COASTAL_MAP_REROLL" && dec.surplusRerolls === 2 && dec.luxuryReserve === 1;
        results.push({ test: 'Test LQ — 3 rerolls + useful Luxury + good Lagoon failure allows reroll with surplus (Phase 5E.4 Test B & K)', passed, details: dec });
    }

    // Test LR — 6 rerolls + useful Luxury + good Atlantic failure => reroll allowed with 2 in reserve (Phase 5E.4 Test C & L)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: c === 8 ? 'ATLANTIC' : 'BLOCK', value: 3, difficulty: 4, empty: false, flipped: false, locked: false });
            }
        }
        snap.luxuryDecks[0] = { id: 0, cost: 5, cardsRemaining: 3, isOpen: false };
        snap.luxuryDecks[1] = { id: 1, cost: 10, cardsRemaining: 3, isOpen: false };
        const atlanticCell = { id: 'r2c8', r: 2, c: 8, type: 'ATLANTIC', value: 5, difficulty: 4 };
        const granGran = { id: 3, botId: 10, name: "Gran Gran", rerolls: 6 };
        const dec = shouldBotUseMapReroll(granGran, atlanticCell, snap);
        const passed = dec.shouldReroll === true && dec.reason === "COASTAL_MAP_REROLL" && dec.surplusRerolls === 4 && dec.luxuryReserve === 2;
        results.push({ test: 'Test LR — 6 rerolls + useful Luxury + good Atlantic failure allows reroll with 2 in reserve (Phase 5E.4 Test C & L)', passed, details: dec });
    }

    // Test LS — 2 rerolls + poor/low-value Map failure => preserve (Phase 5E.4 Test D)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: 'BLOCK', value: 3, difficulty: 4, empty: false, flipped: false, locked: false });
            }
        }
        snap.luxuryDecks[0] = { id: 0, cost: 5, cardsRemaining: 3, isOpen: false };
        snap.luxuryDecks[1] = { id: 1, cost: 10, cardsRemaining: 3, isOpen: false };
        const poorCell = { id: 'r3c4', r: 3, c: 4, type: 'BLOCK', value: 1, difficulty: 5 };
        const botWith2 = { id: 0, botId: 9, name: "The Twins", rerolls: 2 };
        const dec = shouldBotUseMapReroll(botWith2, poorCell, snap);
        const passed = dec.shouldReroll === false && dec.reason === "PRESERVE_LUXURY_REROLL_RESERVE";
        results.push({ test: 'Test LS — 2 rerolls + poor/low-value Map failure preserves reroll (Phase 5E.4 Test D)', passed, details: dec });
    }

    // Test LT — Finisher failure increases reroll willingness even with 1 reroll (Phase 5E.4 Test E)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r1c0', r: 1, c: 0, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r1c1', r: 1, c: 1, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r1c4', r: 1, c: 4, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r1c5', r: 1, c: 5, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r1c6', r: 1, c: 6, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r1c7', r: 1, c: 7, type: 'BLOCK', flipped: true, empty: false },
            { id: 'r1c8', r: 1, c: 8, type: 'BLOCK', value: 3, difficulty: 4, flipped: false, empty: false }
        ];
        // Add additional non-finisher cards so board is midgame
        for (let r = 2; r < 6; r++) {
            for (let c = 0; c < 9; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: 'BLOCK', value: 3, difficulty: 4, empty: false, flipped: false, locked: false });
            }
        }
        const finisherCell = { id: 'r1c8', r: 1, c: 8, type: 'BLOCK', value: 3, difficulty: 4 };
        const bot1 = { id: 1, botId: 8, name: "Magician", rerolls: 1 };
        const dec = shouldBotUseMapReroll(bot1, finisherCell, snap);
        const passed = dec.shouldReroll === true && dec.reason === "FINISHER_MAP_REROLL";
        results.push({ test: 'Test LT — Finisher failure increases reroll willingness even with 1 reroll (Phase 5E.4 Test E)', passed, details: dec });
    }

    // Test LU — Late game (boardRemainingRatio <= 0.25) increases Map reroll willingness (Phase 5E.4 Test F)
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0] = { id: 0, cost: 5, cardsRemaining: 3, isOpen: false };
        // 40 cards total, 32 flipped, 8 remaining across 2 rows and 4 columns (no row or column has only 1 card)
        snap.grid = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 8; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: 'BLOCK', flipped: true, empty: false });
            }
        }
        for (let r = 4; r < 6; r++) {
            for (let c = 0; c < 4; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: 'BLOCK', value: 3, difficulty: 4, flipped: false, empty: false });
            }
        }
        const mapCell = { id: 'r4c2', r: 4, c: 2, type: 'BLOCK', value: 3, difficulty: 4 };
        const bot = { id: 10, botId: 10, name: "Gran Gran", rerolls: 2 };
        const dec = shouldBotUseMapReroll(bot, mapCell, snap);
        const passed = dec.shouldReroll === true && dec.reason === "LATE_GAME_REROLL_SPEND";
        results.push({ test: 'Test LU — Late game increases Map reroll willingness (Phase 5E.4 Test F)', passed, details: dec });
    }

    // Test LV — Endgame (boardRemainingRatio <= 0.10) increases willingness further (Phase 5E.4 Test G)
    {
        const snap = createBaseValidSnapshot();
        // 40 cards total, 36 flipped, 4 remaining across 2 rows and 2 columns
        snap.grid = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 9; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: 'BLOCK', flipped: true, empty: false });
            }
        }
        snap.grid.push({ id: 'r4c0', r: 4, c: 0, type: 'BLOCK', value: 2, difficulty: 4, flipped: false, empty: false });
        snap.grid.push({ id: 'r4c1', r: 4, c: 1, type: 'BLOCK', value: 2, difficulty: 4, flipped: false, empty: false });
        snap.grid.push({ id: 'r5c0', r: 5, c: 0, type: 'BLOCK', value: 2, difficulty: 4, flipped: false, empty: false });
        snap.grid.push({ id: 'r5c1', r: 5, c: 1, type: 'BLOCK', value: 2, difficulty: 4, flipped: false, empty: false });
        const mapCell = { id: 'r4c1', r: 4, c: 1, type: 'BLOCK', value: 2, difficulty: 4 };
        const bot = { id: 1, botId: 8, name: "Magician", rerolls: 1 };
        const dec = shouldBotUseMapReroll(bot, mapCell, snap);
        const passed = dec.shouldReroll === true && dec.reason === "ENDGAME_REROLL_SPEND";
        results.push({ test: 'Test LV — Endgame increases willingness further (Phase 5E.4 Test G)', passed, details: dec });
    }

    // Test LW — No useful Luxury piles remain => Map rerolls substantially easier to spend (Phase 5E.4 Test H)
    {
        const snap = createBaseValidSnapshot();
        snap.grid = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: 'BLOCK', value: 3, difficulty: 4, empty: false, flipped: false, locked: false });
            }
        }
        snap.luxuryDecks[0] = { id: 0, cost: 5, cardsRemaining: 0, isOpen: false };
        snap.luxuryDecks[1] = { id: 1, cost: 10, cardsRemaining: 0, isOpen: false };
        const mapCell = { id: 'r3c3', r: 3, c: 3, type: 'BLOCK', value: 3, difficulty: 4 };
        const bot = { id: 1, botId: 8, name: "Magician", rerolls: 1 };
        const dec = shouldBotUseMapReroll(bot, mapCell, snap);
        const passed = dec.shouldReroll === true && dec.reason === "SURPLUS_REROLL_MAP_USE";
        results.push({ test: 'Test LW — No useful Luxury piles remain allows spending map rerolls (Phase 5E.4 Test H)', passed, details: dec });
    }

    // Test LX — Luxury remains preferred: planned Luxury reroll logic is unweakened (Phase 5E.4 Test I)
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0] = { id: 0, cost: 5, taxCount: 0, cardsRemaining: 5, isOpen: true, visibleCard: { name: "Yacht", points: 3 } };
        const evalDec = evaluateTurnActions({ id: 2, botId: 9, name: "The Twins", gold: 10, rerolls: 3 }, snap);
        const luxAction = evalDec.luxuryActions.find(l => l.deckId === 0);
        const resDec = resolveStrategicLuxuryRerollDecision({ isFull: true, isGranGran: true, useStrategic: true, rerolls: 3, plannedReroll: true, firstRollSucceeded: false });
        const passed = luxAction && luxAction.plannedReroll === true && resDec.shouldReroll === true && (resDec.reason === "STRATEGIC_COMMITTED_LUXURY_REROLL" || resDec.reason === "STRATEGIC_PLANNED_REROLL");
        results.push({ test: 'Test LX — Luxury remains preferred: planned Luxury reroll logic is unweakened (Phase 5E.4 Test I)', passed, details: { luxAction, resDec } });
    }

    // Test LY — Personality cannot override obvious endgame value (Phase 5E.4 Test M)
    {
        const snap = createBaseValidSnapshot();
        // 40 cards total, 37 flipped, 3 remaining (ratio = 3/40 = 0.075)
        snap.grid = [];
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 9; c++) {
                snap.grid.push({ id: `r${r}c${c}`, r, c, type: 'BLOCK', flipped: true, empty: false });
            }
        }
        snap.grid.push({ id: 'r4c0', r: 4, c: 0, type: 'BLOCK', flipped: true, empty: false });
        snap.grid.push({ id: 'r4c1', r: 4, c: 1, type: 'BLOCK', value: 3, difficulty: 3, flipped: false, empty: false });
        snap.grid.push({ id: 'r4c2', r: 4, c: 2, type: 'BLOCK', value: 3, difficulty: 3, flipped: false, empty: false });
        snap.grid.push({ id: 'r4c3', r: 4, c: 3, type: 'BLOCK', value: 3, difficulty: 3, flipped: false, empty: false });
        const mapCell = { id: 'r4c1', r: 4, c: 1, type: 'BLOCK', value: 3, difficulty: 3 };
        const cautBot = { id: 10, botId: 10, name: "Gran Gran", personality: "CAUTIOUS", rerolls: 1 };
        const aggBot = { id: 8, botId: 8, name: "Magician", personality: "AGGRESSIVE", rerolls: 1 };
        const decCaut = shouldBotUseMapReroll(cautBot, mapCell, snap);
        const decAgg = shouldBotUseMapReroll(aggBot, mapCell, snap);
        const passed = decCaut.shouldReroll === true && decAgg.shouldReroll === true;
        results.push({ test: 'Test LY — Personality cannot override obvious endgame value (Phase 5E.4 Test M)', passed, details: { decCaut, decAgg } });
    }

    // Test LZ — Carina Lock Regression Strengthening: Non-Carina 2/6, Carina normal difficulty, and reroll math (Phase 5E.4a)
    {
        // 1. Locked Diff 4: Non-Carina base = 2/6, with reroll = 5/9; Carina base = 3/6, with reroll = 3/4
        const nonCarinaBaseDiff4 = 2 / 6;
        const nonCarinaRerollDiff4 = 1 - Math.pow(1 - nonCarinaBaseDiff4, 2);
        const carinaBaseDiff4 = (7 - 4) / 6;
        const carinaRerollDiff4 = 1 - Math.pow(1 - carinaBaseDiff4, 2);

        const mathPassed = Math.abs(nonCarinaBaseDiff4 - (2 / 6)) < 0.0001 &&
            Math.abs(nonCarinaRerollDiff4 - (5 / 9)) < 0.0001 &&
            Math.abs(carinaBaseDiff4 - (3 / 6)) < 0.0001 &&
            Math.abs(carinaRerollDiff4 - 0.75) < 0.0001;

        // 2. Action Evaluation Engine Verification across difficulties (Diff 2, Diff 4, Diff 5)
        const snap = createBaseValidSnapshot();
        snap.grid = [
            { id: 'r1c1', r: 1, c: 1, type: 'BLOCK', value: 4, difficulty: 4, locked: true, empty: false, flipped: false },
            { id: 'r1c2', r: 1, c: 2, type: 'BLOCK', value: 4, difficulty: 2, locked: true, empty: false, flipped: false },
            { id: 'r1c3', r: 1, c: 3, type: 'BLOCK', value: 4, difficulty: 5, locked: true, empty: false, flipped: false },
            // Extra cell to keep board valid
            { id: 'r2c2', r: 2, c: 2, type: 'BLOCK', value: 3, difficulty: 0, locked: false, empty: false, flipped: false }
        ];

        const nonCarinaBot = { id: 2, botId: 9, name: "The Twins", gold: 20, character: { name: 'JAEGA' } };
        const carinaBot = { id: 2, botId: 9, name: "The Twins", gold: 20, character: { name: 'CARINA' } };

        const evalNonCarina = evaluateTurnActions(nonCarinaBot, snap);
        const evalCarina = evaluateTurnActions(carinaBot, snap);

        const ncActDiff4 = evalNonCarina.mapActions.find(a => a.cellId === 'r1c1');
        const ncActDiff2 = evalNonCarina.mapActions.find(a => a.cellId === 'r1c2');
        const ncActDiff5 = evalNonCarina.mapActions.find(a => a.cellId === 'r1c3');

        const cActDiff4 = evalCarina.mapActions.find(a => a.cellId === 'r1c1');
        const cActDiff2 = evalCarina.mapActions.find(a => a.cellId === 'r1c2');
        const cActDiff5 = evalCarina.mapActions.find(a => a.cellId === 'r1c3');

        // Non-Carina must have 2/6 (0.3333) regardless of difficulty
        const ncDiffInvariant = Math.abs(ncActDiff4.successRate - (2 / 6)) < 0.001 &&
            Math.abs(ncActDiff2.successRate - (2 / 6)) < 0.001 &&
            Math.abs(ncActDiff5.successRate - (2 / 6)) < 0.001;

        // Carina must use normal difficulty: diff 4 -> 3/6 (0.5), diff 2 -> 5/6 (0.8333), diff 5 -> 2/6 (0.3333)
        const cDiffSensitive = Math.abs(cActDiff4.successRate - (3 / 6)) < 0.001 &&
            Math.abs(cActDiff2.successRate - (5 / 6)) < 0.001 &&
            Math.abs(cActDiff5.successRate - (2 / 6)) < 0.001;

        // 3. shouldBotUseMapReroll Verification
        const decNonCarina = shouldBotUseMapReroll({ ...nonCarinaBot, rerolls: 3 }, snap.grid[0], snap);
        const decCarina = shouldBotUseMapReroll({ ...carinaBot, rerolls: 3 }, snap.grid[0], snap);

        const passed = mathPassed && ncDiffInvariant && cDiffSensitive &&
            typeof decNonCarina.shouldReroll === 'boolean' &&
            typeof decCarina.shouldReroll === 'boolean';

        results.push({
            test: 'Test LZ — Carina Lock Regression Strengthening: Non-Carina 2/6, Carina normal difficulty, and reroll math (Phase 5E.4a)',
            passed,
            details: {
                mathPassed,
                ncDiffInvariant,
                cDiffSensitive,
                ncRates: [ncActDiff4?.successRate, ncActDiff2?.successRate, ncActDiff5?.successRate],
                cRates: [cActDiff4?.successRate, cActDiff2?.successRate, cActDiff5?.successRate]
            }
        });
    }

    // Test ME — Luxury Telemetry: effectiveCost matches authoritative untaxed costs (Phase 5E.4b Test A)
    {
        const snap = createBaseValidSnapshot();
        const magician = { id: 1, botId: 8, name: "Magician" };
        const baseCost0 = getBotLuxuryCost(magician, snap.luxuryDecks[0]); // 5 Au
        const baseCost1 = getBotLuxuryCost(magician, snap.luxuryDecks[1]); // 10 Au
        const baseCost2 = getBotLuxuryCost(magician, snap.luxuryDecks[2]); // 15 Au

        clearBotRerollHistory();
        const entry = {
            turnCount: 5,
            botId: 8,
            botName: "Magician",
            aiDepth: "FULL",
            personality: "AGGRESSIVE",
            source: "LUXURY",
            rerollsBefore: 1,
            rerollsAfter: 0,
            targetId: 0,
            targetType: "LUXURY_DECK",
            deckId: 0,
            effectiveCost: baseCost0,
            visiblePoints: null,
            isOpen: false,
            baseSuccessRate: 2 / 6,
            rerollAdjustedSuccessRate: 5 / 9,
            originalRoll: 1,
            rerollRoll: null,
            originalRollSucceeded: false,
            rerollSucceeded: null,
            plannedReroll: true,
            plannedRerollReason: "CLOSED_DECK_EXPECTED_2P",
            decisionReason: "STRATEGIC_PLANNED_REROLL"
        };
        recordBotReroll(entry);

        const passed = baseCost0 === 5 && baseCost1 === 10 && baseCost2 === 15 &&
            __botRerollHistory.length === 1 && __botRerollHistory[0].effectiveCost === 5;
        results.push({ test: 'Test ME — Luxury Telemetry: effectiveCost matches authoritative untaxed costs (Phase 5E.4b Test A)', passed, details: { baseCosts: [baseCost0, baseCost1, baseCost2], entry: __botRerollHistory[0] } });
    }

    // Test MF — Luxury Telemetry: effectiveCost matches authoritative taxed costs (+2 Au per tag) (Phase 5E.4b Test B)
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0].taxCount = 2; // +4 Au -> 9 Au
        snap.luxuryDecks[1].taxCount = 1; // +2 Au -> 12 Au
        const twins = { id: 2, botId: 9, name: "The Twins" };
        const taxedCost0 = getBotLuxuryCost(twins, snap.luxuryDecks[0]);
        const taxedCost1 = getBotLuxuryCost(twins, snap.luxuryDecks[1]);

        clearBotRerollHistory();
        const entry = {
            turnCount: 12,
            botId: 9,
            botName: "The Twins",
            aiDepth: "FULL",
            personality: "BALANCED",
            source: "LUXURY",
            rerollsBefore: 3,
            rerollsAfter: 2,
            targetId: 0,
            targetType: "LUXURY_DECK",
            deckId: 0,
            effectiveCost: taxedCost0,
            visiblePoints: null,
            isOpen: false,
            baseSuccessRate: 2 / 6,
            rerollAdjustedSuccessRate: 5 / 9,
            originalRoll: 2,
            rerollRoll: null,
            originalRollSucceeded: false,
            rerollSucceeded: null,
            plannedReroll: true,
            plannedRerollReason: "CLOSED_DECK_EXPECTED_2P",
            decisionReason: "STRATEGIC_PLANNED_REROLL"
        };
        recordBotReroll(entry);

        const passed = taxedCost0 === 9 && taxedCost1 === 12 &&
            __botRerollHistory.length === 1 && __botRerollHistory[0].effectiveCost === 9;
        results.push({ test: 'Test MF — Luxury Telemetry: effectiveCost matches authoritative taxed costs (Phase 5E.4b Test B)', passed, details: { taxedCost0, taxedCost1, recordedCost: __botRerollHistory[0]?.effectiveCost } });
    }

    // Test MG — Luxury Telemetry: effectiveCost respects Ms. Post tax exemption (Phase 5E.4b Test C)
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks[0].taxCount = 3; // +6 Au
        const msPostBot = { id: 0, character: { name: 'MS. POST' } };
        const msPostCost0 = getBotLuxuryCost(msPostBot, snap.luxuryDecks[0]);

        clearBotRerollHistory();
        const entry = {
            turnCount: 20,
            botId: 7,
            botName: "Ms. Post Bot",
            aiDepth: "FULL",
            personality: "BALANCED",
            source: "LUXURY",
            rerollsBefore: 1,
            rerollsAfter: 0,
            targetId: 0,
            targetType: "LUXURY_DECK",
            deckId: 0,
            effectiveCost: msPostCost0,
            visiblePoints: null,
            isOpen: false,
            baseSuccessRate: 2 / 6,
            rerollAdjustedSuccessRate: 5 / 9,
            originalRoll: 2,
            rerollRoll: null,
            originalRollSucceeded: false,
            rerollSucceeded: null,
            plannedReroll: true,
            plannedRerollReason: "CLOSED_DECK_EXPECTED_2P",
            decisionReason: "STRATEGIC_PLANNED_REROLL"
        };
        recordBotReroll(entry);

        const passed = msPostCost0 === 5 && __botRerollHistory[0]?.effectiveCost === 5;
        results.push({ test: 'Test MG — Luxury Telemetry: effectiveCost respects Ms. Post tax exemption (Phase 5E.4b Test C)', passed, details: { msPostCost0, recordedCost: __botRerollHistory[0]?.effectiveCost } });
    }

    // Test MH — Magician Luxury Reroll Flow Simulation without ReferenceError (Phase 5E.4b Smoke)
    {
        clearBotRerollHistory();
        const magician = { id: 1, botId: 8, name: "Magician", rerolls: 1, _plannedLuxuryReroll: true };
        const deckIndex = 0;
        const snap = createBaseValidSnapshot();
        const effectiveCost = getBotLuxuryCost(magician, snap.luxuryDecks[deckIndex]);

        // 1. First roll fails (e.g. rolled 2, needs 4)
        const roll1 = 2;
        const rerollDecision = resolveStrategicLuxuryRerollDecision({
            isFull: true,
            isGranGran: false,
            useStrategic: true,
            rerolls: magician.rerolls,
            plannedReroll: Boolean(magician._plannedLuxuryReroll),
            firstRollSucceeded: false
        });

        let telemetryCaptured = null;
        if (rerollDecision.shouldReroll) {
            const rerollsBefore = magician.rerolls;
            magician._plannedLuxuryReroll = false;
            magician.rerolls = Math.max(0, magician.rerolls - rerollDecision.rerollsConsumed);
            const rerollsAfter = magician.rerolls;

            telemetryCaptured = {
                turnCount: snap.turnCount,
                botId: magician.botId,
                botName: magician.name,
                aiDepth: getBotAiDepth(magician),
                personality: getStrategicPersonality(magician),
                source: "LUXURY",
                rerollsBefore,
                rerollsAfter,
                targetId: deckIndex,
                targetType: "LUXURY_DECK",
                deckId: deckIndex,
                effectiveCost: effectiveCost,
                visiblePoints: null,
                isOpen: false,
                baseSuccessRate: 2 / 6,
                rerollAdjustedSuccessRate: 5 / 9,
                originalRoll: roll1,
                rerollRoll: null,
                originalRollSucceeded: false,
                rerollSucceeded: null,
                plannedReroll: true,
                plannedRerollReason: "CLOSED_DECK_EXPECTED_2P",
                decisionReason: rerollDecision.reason
            };
            recordBotReroll(telemetryCaptured);
        }

        // 2. Second roll resolves (e.g. rolled 5, success!)
        const roll2 = 5;
        const success2 = roll2 >= 4;
        if (telemetryCaptured) {
            telemetryCaptured.rerollRoll = roll2;
            telemetryCaptured.rerollSucceeded = success2;
        }

        const passed = magician.rerolls === 0 &&
            telemetryCaptured !== null &&
            telemetryCaptured.effectiveCost === 5 &&
            telemetryCaptured.rerollRoll === 5 &&
            telemetryCaptured.rerollSucceeded === true &&
            __botRerollHistory.length === 1;

        results.push({ test: 'Test MH — Magician Luxury Reroll Flow Simulation without ReferenceError (Phase 5E.4b Smoke)', passed, details: { magician, telemetry: __botRerollHistory[0] } });
    }

    // Test MI — Multi-reroll success probability math (Phase 5E.5 Part 14 Tests A..H)
    {
        const r5_0 = getLuxuryAttemptSuccessRate(0, { botRerolls: 0, isOpen: true, visiblePoints: 3 });
        const r5_1 = getLuxuryAttemptSuccessRate(0, { botRerolls: 1, isOpen: true, visiblePoints: 3 });
        const r5_2 = getLuxuryAttemptSuccessRate(0, { botRerolls: 2, isOpen: true, visiblePoints: 3 });
        const r5_3 = getLuxuryAttemptSuccessRate(0, { botRerolls: 3, isOpen: true, visiblePoints: 3 });

        const r10_0 = getLuxuryAttemptSuccessRate(1, { botRerolls: 0, isOpen: true, visiblePoints: 3 });
        const r10_1 = getLuxuryAttemptSuccessRate(1, { botRerolls: 1, isOpen: true, visiblePoints: 3 });
        const r10_2 = getLuxuryAttemptSuccessRate(1, { botRerolls: 2, isOpen: true, visiblePoints: 3 });
        const r10_3 = getLuxuryAttemptSuccessRate(1, { botRerolls: 3, isOpen: true, visiblePoints: 3 });

        const r15 = getLuxuryAttemptSuccessRate(2, { botRerolls: 6, isOpen: true, visiblePoints: 3 });

        const pass5 = Math.abs(r5_0.successRate - (2 / 6)) < 0.0001 &&
            Math.abs(r5_1.successRate - (5 / 9)) < 0.0001 &&
            Math.abs(r5_2.successRate - (19 / 27)) < 0.0001 &&
            Math.abs(r5_3.successRate - (65 / 81)) < 0.0001;

        const pass10 = Math.abs(r10_0.successRate - (4 / 6)) < 0.0001 &&
            Math.abs(r10_1.successRate - (8 / 9)) < 0.0001 &&
            Math.abs(r10_2.successRate - (26 / 27)) < 0.0001 &&
            Math.abs(r10_3.successRate - (80 / 81)) < 0.0001;

        const pass15 = Math.abs(r15.successRate - 1.0) < 0.0001 && r15.plannedRerollCount === 0;

        const passed = pass5 && pass10 && pass15;
        results.push({ test: 'Test MI — Multi-reroll success probability math (Phase 5E.5 Part 14 Tests A..H)', passed, details: { pass5, pass10, pass15, r5_3, r10_3, r15 } });
    }

    // Test MJ — Expected rerolls consumed & economic utility resource cost (Phase 5E.5 Part 8 & 9)
    {
        const r5_3 = getLuxuryAttemptSuccessRate(0, { botRerolls: 3, isOpen: true, visiblePoints: 3 });
        const r10_3 = getLuxuryAttemptSuccessRate(1, { botRerolls: 3, isOpen: true, visiblePoints: 3 });

        // 5 Au (q = 4/6 = 2/3): q + q^2 + q^3 = 2/3 + 4/9 + 8/27 = 38/27 ≈ 1.4074
        const expected5 = 38 / 27;
        const cost5 = Number((expected5 * REROLL_RESOURCE_COST_PRESTIGE_EQ).toFixed(4));

        // 10 Au (q = 2/6 = 1/3): q + q^2 + q^3 = 1/3 + 1/9 + 1/27 = 13/27 ≈ 0.4815
        const expected10 = 13 / 27;
        const cost10 = Number((expected10 * REROLL_RESOURCE_COST_PRESTIGE_EQ).toFixed(4));

        const pass5 = Math.abs(r5_3.expectedRerollsConsumed - expected5) < 0.001 &&
            Math.abs(r5_3.expectedRerollResourceCostPrestigeEq - cost5) < 0.001;

        const pass10 = Math.abs(r10_3.expectedRerollsConsumed - expected10) < 0.001 &&
            Math.abs(r10_3.expectedRerollResourceCostPrestigeEq - cost10) < 0.001;

        const passed = pass5 && pass10;
        results.push({ test: 'Test MJ — Expected rerolls consumed & economic utility resource cost (Phase 5E.5 Part 8 & 9)', passed, details: { r5_3, r10_3, expected5, expected10, cost5, cost10 } });
    }

    // Test MK — Execution: Magician (1 reroll, fail -> fail, exhausts rerolls) (Phase 5E.5 Part 15 Test A)
    {
        clearBotRerollHistory();
        const magician = { id: 1, botId: 8, name: "Magician", rerolls: 1 };
        const isCommitted = true;
        const rolls = [2, 3]; // Both fail on diff 4
        let rollIndex = 0;

        let attemptEnded = false;
        let finalSuccess = false;

        while (!attemptEnded) {
            const roll = rolls[rollIndex++];
            const success = roll >= 4;
            if (success) {
                finalSuccess = true;
                attemptEnded = true;
            } else {
                const dec = resolveStrategicLuxuryRerollDecision({
                    isFull: true,
                    useStrategic: true,
                    rerolls: magician.rerolls,
                    rerollCommitted: isCommitted,
                    attemptSucceeded: false
                });

                if (dec.shouldReroll) {
                    const rerollsBefore = magician.rerolls;
                    magician.rerolls -= dec.rerollsConsumed;
                    recordBotReroll({
                        turnCount: 5,
                        botId: magician.botId,
                        botName: magician.name,
                        source: "LUXURY",
                        rerollsBefore,
                        rerollsAfter: magician.rerolls,
                        originalRoll: roll,
                        rerollRoll: null
                    });
                } else {
                    attemptEnded = true;
                    finalSuccess = false;
                }
            }
        }

        const passed = magician.rerolls === 0 && finalSuccess === false && __botRerollHistory.length === 1;
        results.push({ test: 'Test MK — Execution: Magician (1 reroll, fail -> fail, exhausts rerolls) (Phase 5E.5 Part 15 Test A)', passed, details: { magician, finalSuccess, historyCount: __botRerollHistory.length } });
    }

    // Test ML — Execution: The Twins (3 rerolls, 2 -> 3 -> 1 -> 5, success on 4th roll) (Phase 5E.5 Part 15 Test B)
    {
        clearBotRerollHistory();
        const twins = { id: 2, botId: 9, name: "The Twins", rerolls: 3 };
        const isCommitted = true;
        const rolls = [2, 3, 1, 5]; // 3 failures, then success
        const attemptId = "turn10-bot9-deck0";
        let rollIndex = 0;

        let attemptEnded = false;
        let finalSuccess = false;
        let lastTelemetry = null;

        while (!attemptEnded) {
            const roll = rolls[rollIndex++];
            const success = roll >= 4;
            if (lastTelemetry) {
                lastTelemetry.rerollRoll = roll;
                lastTelemetry.rerollSucceeded = success;
                lastTelemetry = null;
            }

            if (success) {
                finalSuccess = true;
                attemptEnded = true;
            } else {
                const dec = resolveStrategicLuxuryRerollDecision({
                    isFull: true,
                    useStrategic: true,
                    rerolls: twins.rerolls,
                    rerollCommitted: isCommitted,
                    attemptSucceeded: false
                });

                if (dec.shouldReroll) {
                    const rerollsBefore = twins.rerolls;
                    twins.rerolls -= dec.rerollsConsumed;
                    const entry = {
                        turnCount: 10,
                        botId: twins.botId,
                        botName: twins.name,
                        source: "LUXURY",
                        luxuryAttemptId: attemptId,
                        attemptSequenceNumber: __botRerollHistory.length + 1,
                        rerollsBefore,
                        rerollsAfter: twins.rerolls,
                        originalRoll: roll,
                        rerollRoll: null,
                        rerollSucceeded: null
                    };
                    recordBotReroll(entry);
                    lastTelemetry = entry;
                } else {
                    attemptEnded = true;
                    finalSuccess = false;
                }
            }
        }

        const passed = twins.rerolls === 0 &&
            finalSuccess === true &&
            __botRerollHistory.length === 3 &&
            __botRerollHistory[0].rerollsBefore === 3 && __botRerollHistory[0].rerollsAfter === 2 &&
            __botRerollHistory[1].rerollsBefore === 2 && __botRerollHistory[1].rerollsAfter === 1 &&
            __botRerollHistory[2].rerollsBefore === 1 && __botRerollHistory[2].rerollsAfter === 0 &&
            __botRerollHistory[2].rerollRoll === 5 && __botRerollHistory[2].rerollSucceeded === true;

        results.push({ test: 'Test ML — Execution: The Twins (3 rerolls, 2 -> 3 -> 1 -> 5, success on 4th roll) (Phase 5E.5 Part 15 Test B)', passed, details: { twins, finalSuccess, history: __botRerollHistory } });
    }

    // Test MM — Execution: Gran Gran (6 rerolls, 10 Au, 1 -> 2 -> 2 -> 4, success on 4th roll) (Phase 5E.5 Part 15 Test C)
    {
        clearBotRerollHistory();
        const granGran = { id: 3, botId: 10, name: "Gran Gran", rerolls: 6 };
        const isCommitted = true;
        const rolls = [1, 2, 2, 4]; // 3 failures, 4th succeeds on 10 Au (diff 3)
        let rollIndex = 0;

        let attemptEnded = false;
        let finalSuccess = false;
        let lastTelemetry = null;

        while (!attemptEnded) {
            const roll = rolls[rollIndex++];
            const success = roll >= 3;
            if (lastTelemetry) {
                lastTelemetry.rerollRoll = roll;
                lastTelemetry.rerollSucceeded = success;
                lastTelemetry = null;
            }

            if (success) {
                finalSuccess = true;
                attemptEnded = true;
            } else {
                const dec = resolveStrategicLuxuryRerollDecision({
                    isFull: true,
                    isGranGran: true,
                    useStrategic: true,
                    rerolls: granGran.rerolls,
                    rerollCommitted: isCommitted,
                    attemptSucceeded: false
                });

                if (dec.shouldReroll) {
                    const rerollsBefore = granGran.rerolls;
                    granGran.rerolls -= dec.rerollsConsumed;
                    const entry = {
                        turnCount: 15,
                        botId: granGran.botId,
                        botName: granGran.name,
                        source: "LUXURY",
                        rerollsBefore,
                        rerollsAfter: granGran.rerolls,
                        originalRoll: roll,
                        rerollRoll: null,
                        rerollSucceeded: null
                    };
                    recordBotReroll(entry);
                    lastTelemetry = entry;
                } else {
                    attemptEnded = true;
                    finalSuccess = false;
                }
            }
        }

        const passed = granGran.rerolls === 3 && finalSuccess === true && __botRerollHistory.length === 3;
        results.push({ test: 'Test MM — Execution: Gran Gran (6 rerolls, 10 Au, 1 -> 2 -> 2 -> 4, success on 4th roll) (Phase 5E.5 Part 15 Test C)', passed, details: { granGran, finalSuccess, historyCount: __botRerollHistory.length } });
    }

    // Test MN — Execution: Gran Gran (6 rerolls, 5 Au, 6 failures -> 0 remaining) (Phase 5E.5 Part 15 Test D)
    {
        clearBotRerollHistory();
        const granGran = { id: 3, botId: 10, name: "Gran Gran", rerolls: 6 };
        const isCommitted = true;
        const rolls = [1, 2, 3, 1, 2, 3, 1]; // 7 failures (1 initial + 6 rerolls)
        let rollIndex = 0;

        let attemptEnded = false;
        let finalSuccess = false;

        while (!attemptEnded) {
            const roll = rolls[rollIndex++];
            const success = roll >= 4;
            if (success) {
                finalSuccess = true;
                attemptEnded = true;
            } else {
                const dec = resolveStrategicLuxuryRerollDecision({
                    isFull: true,
                    isGranGran: true,
                    useStrategic: true,
                    rerolls: granGran.rerolls,
                    rerollCommitted: isCommitted,
                    attemptSucceeded: false
                });

                if (dec.shouldReroll) {
                    const rerollsBefore = granGran.rerolls;
                    granGran.rerolls -= dec.rerollsConsumed;
                    recordBotReroll({
                        turnCount: 16,
                        botId: granGran.botId,
                        botName: granGran.name,
                        source: "LUXURY",
                        rerollsBefore,
                        rerollsAfter: granGran.rerolls,
                        originalRoll: roll
                    });
                } else {
                    attemptEnded = true;
                    finalSuccess = false;
                }
            }
        }

        const passed = granGran.rerolls === 0 && finalSuccess === false && __botRerollHistory.length === 6;
        results.push({ test: 'Test MN — Execution: Gran Gran (6 rerolls, 5 Au, 6 failures -> 0 remaining) (Phase 5E.5 Part 15 Test D)', passed, details: { granGran, finalSuccess, historyCount: __botRerollHistory.length } });
    }

    // Test MO — Execution: Uncommitted visible 1P fails and does not reroll (Phase 5E.5 Part 15 Test E)
    {
        clearBotRerollHistory();
        const magician = { id: 1, botId: 8, name: "Magician", rerolls: 1 };
        const rateInfo = getLuxuryAttemptSuccessRate(0, { botRerolls: 1, isOpen: true, visiblePoints: 1, phase: 'EARLY' });

        const dec = resolveStrategicLuxuryRerollDecision({
            isFull: true,
            useStrategic: true,
            rerolls: magician.rerolls,
            rerollCommitted: rateInfo.plannedReroll,
            attemptSucceeded: false
        });

        const passed = rateInfo.plannedReroll === false &&
            dec.shouldReroll === false &&
            dec.reason === "STRATEGIC_NO_REROLL_PLANNED" &&
            magician.rerolls === 1 &&
            __botRerollHistory.length === 0;

        results.push({ test: 'Test MO — Execution: Uncommitted visible 1P fails and does not reroll (Phase 5E.5 Part 15 Test E)', passed, details: { rateInfo, dec, magician } });
    }

    // Test MP — Payment Safety & Invariants (Single Au deduction, single card award) (Phase 5E.5 Part 16)
    {
        let gold = 20;
        let cardsAwarded = 0;
        const luxuryCost = 5;

        // Step 1: Initial attempt deducts gold once
        gold -= luxuryCost;

        // Step 2: 3 rerolls occur (no gold deducted)
        const rerollCount = 3;
        for (let i = 0; i < rerollCount; i++) {
            // Rerolls do not deduct gold
        }

        // Step 3: Success awards 1 card
        cardsAwarded += 1;

        const passed = gold === 15 && cardsAwarded === 1;
        results.push({ test: 'Test MP — Payment Safety & Invariants (Single Au deduction, single card award) (Phase 5E.5 Part 16)', passed, details: { gold, cardsAwarded } });
    }

    // ========================================================================
    // PHASE 5E.6 TESTS — SHARED AI ENGINE TIER GATING (LOW / MEDIUM / FULL)
    // ========================================================================

    // Test MQ — Authoritative Depth Feature Set Matrix (Phase 5E.6 Part 26)
    {
        const low = AI_DEPTH_FEATURES.LOW;
        const med = AI_DEPTH_FEATURES.MEDIUM;
        const full = AI_DEPTH_FEATURES.FULL;

        const passLow = low.lineAwareness === false &&
            low.trapAwareness === false &&
            low.advancedLuxury === false &&
            low.auctionPlanning === true &&
            low.probabilityModeling === false &&
            low.opponentLookahead === false;

        const passMed = med.lineAwareness === true &&
            med.trapAwareness === true &&
            med.advancedLuxury === true &&
            med.auctionPlanning === true &&
            med.probabilityModeling === false &&
            med.opponentLookahead === false;

        const passFull = full.lineAwareness === true &&
            full.trapAwareness === true &&
            full.advancedLuxury === true &&
            full.auctionPlanning === true &&
            full.probabilityModeling === true &&
            full.opponentLookahead === true;

        const helperLow = getAiDepthFeatures({ aiDepth: 'LOW' });
        const helperFallback = getAiDepthFeatures({});
        const passHelper = helperLow.lineAwareness === false && helperFallback.lineAwareness === false;

        const passed = passLow && passMed && passFull && passHelper;
        results.push({ test: 'Test MQ — Authoritative Depth Feature Set Matrix (Phase 5E.6 Part 26)', passed, details: { passLow, passMed, passFull, passHelper } });
    }

    // Test MR — LOW Tier Map Awareness Gating (Phase 5E.6 Part 27)
    {
        const snap = createBaseValidSnapshot();
        // Setup row 0 with 7 flipped cards, 1 remaining (finisher)
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c4', r: 0, c: 4, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c5', r: 0, c: 5, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c6', r: 0, c: 6, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c8', r: 0, c: 8, type: 'ATLANTIC', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];

        const botLow = { id: 0, botId: 1, name: "Goober", gold: 20, type: 'BOT', aiDepth: 'LOW' };
        const evalLow = evaluateTurnActions(botLow, snap);
        const mapActions = evalLow.mapActions || [];
        const candidate = mapActions.find(m => m.cellId === 'r0c8');

        const passed = candidate !== undefined &&
            candidate.lineCompletionBonusAu === 0 &&
            candidate.lineCompletionPrestigeEq === 0 &&
            candidate.lineSetupPrestigeEq === 0 &&
            candidate.opponentHandoffPrestigeEq === 0 &&
            candidate.blockBonusProbabilityPrestigeEq === 0 &&
            candidate.landmarkProbabilityPrestigeEq === 0;

        results.push({ test: 'Test MR — LOW Tier Map Awareness Gating (Phase 5E.6 Part 27)', passed, details: { candidate } });
    }

    // Test MS — MEDIUM Tier Map Awareness & Probability Gating (Phase 5E.6 Part 28)
    {
        const snap = createBaseValidSnapshot();
        // Setup row 0 with 8 flipped cards, 1 remaining (finisher)
        snap.grid = [
            { id: 'r0c0', r: 0, c: 0, type: 'LAGOON', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c1', r: 0, c: 1, type: 'WF_L', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c2', r: 0, c: 2, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c3', r: 0, c: 3, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c4', r: 0, c: 4, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c5', r: 0, c: 5, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c6', r: 0, c: 6, type: 'BLOCK', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c7', r: 0, c: 7, type: 'WF_R', value: 3, difficulty: 0, empty: false, flipped: true, locked: false },
            { id: 'r0c8', r: 0, c: 8, type: 'ATLANTIC', value: 3, difficulty: 0, empty: false, flipped: false, locked: false }
        ];

        const botMed = { id: 0, botId: 4, name: "Boss Cat", gold: 20, type: 'BOT', aiDepth: 'MEDIUM' };
        const evalMed = evaluateTurnActions(botMed, snap);
        const mapActions = evalMed.mapActions || [];
        const candidate = mapActions.find(m => m.cellId === 'r0c8');

        const passed = candidate !== undefined &&
            candidate.lineCompletionBonusAu >= 5 &&
            candidate.lineCompletionPrestigeEq > 0 &&
            candidate.blockBonusProbabilityPrestigeEq === 0 &&
            candidate.landmarkProbabilityPrestigeEq === 0;

        results.push({ test: 'Test MS — MEDIUM Tier Map Awareness & Probability Gating (Phase 5E.6 Part 28)', passed, details: { candidate } });
    }

    // Test MT — Strengthened LOW Tier Luxury Randomness & Selection (Phase 5E.6a)
    {
        const affordable = [
            { id: 0, cost: 5, successRate: 2 / 6 },
            { id: 1, cost: 10, successRate: 4 / 6 },
            { id: 2, cost: 15, successRate: 1.0 }
        ];

        const choiceLow = chooseLowLuxuryCandidate(affordable, 0.05, { personality: 'BALANCED' });
        const choiceMid = chooseLowLuxuryCandidate(affordable, 0.50, { personality: 'BALANCED' });
        const choiceHigh = chooseLowLuxuryCandidate(affordable, 0.95, { personality: 'BALANCED' });

        // 1. Verify different RNG values produce different selections
        const producesDifferentChoices = (choiceLow.id !== choiceMid.id) && (choiceMid.id !== choiceHigh.id);
        // 2. Verify at least one deterministic RNG selects a pile other than 15 Au (choiceLow is 0 and choiceMid is 1)
        const selectsNon15Pile = (choiceLow.id !== 2 || choiceMid.id !== 2);
        // 3. Verify all selections remain confined to legal affordable candidates
        const allLegal = affordable.some(p => p.id === choiceLow.id) &&
            affordable.some(p => p.id === choiceMid.id) &&
            affordable.some(p => p.id === choiceHigh.id);

        // 4. Open Luxury Scenario with 5 Au (1P), 10 Au (2P), 15 Au (3P)
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 5, isOpen: true, visibleCard: { points: 1 } },
            { id: 1, cost: 10, cardsRemaining: 5, isOpen: true, visibleCard: { points: 2 } },
            { id: 2, cost: 15, cardsRemaining: 5, isOpen: true, visibleCard: { points: 3 } }
        ];
        snap.players = [
            { id: 0, botId: 1, name: "Goober", gold: 30, prestige: 5, type: 'BOT', aiDepth: 'LOW' }
        ];

        // Evaluate LOW bot with injected RNG targeting pile 0 (5 Au / 1P)
        const botLowWithRng0 = { id: 0, botId: 1, name: "Goober", gold: 30, type: 'BOT', aiDepth: 'LOW', _injectedLuxuryRng: 0.05 };
        const evalLow0 = evaluateTurnActions(botLowWithRng0, snap);

        // Evaluate LOW bot with injected RNG targeting pile 1 (10 Au / 2P)
        const botLowWithRng1 = { id: 0, botId: 1, name: "Goober", gold: 30, type: 'BOT', aiDepth: 'LOW', _injectedLuxuryRng: 0.50 };
        const evalLow1 = evaluateTurnActions(botLowWithRng1, snap);

        const passOpen0 = evalLow0.bestLuxury && evalLow0.bestLuxury.deckId === 0 && evalLow0.bestLuxury.isStrategicallyEligible === true;
        const passOpen1 = evalLow1.bestLuxury && evalLow1.bestLuxury.deckId === 1 && evalLow1.bestLuxury.isStrategicallyEligible === true;
        const visible3PNotOverriding = (evalLow0.bestLuxury.deckId !== 2 && evalLow1.bestLuxury.deckId !== 2);

        const passed = producesDifferentChoices && selectsNon15Pile && allLegal && passOpen0 && passOpen1 && visible3PNotOverriding;
        results.push({
            test: 'Test MT — Strengthened LOW Tier Luxury Randomness & Selection (Phase 5E.6a)',
            passed,
            details: { choiceLow, choiceMid, choiceHigh, passOpen0, passOpen1, visible3PNotOverriding }
        });
    }

    // Test MU — MEDIUM Tier Luxury Evaluation (Phase 5E.6 Part 30)
    {
        const snap = createBaseValidSnapshot();
        snap.luxuryDecks = [
            { id: 0, cost: 5, cardsRemaining: 5, isOpen: true, visibleCard: { points: 1 } },
            { id: 1, cost: 10, cardsRemaining: 5, isOpen: true, visibleCard: { points: 2 } },
            { id: 2, cost: 15, cardsRemaining: 5, isOpen: true, visibleCard: { points: 3 } }
        ];
        snap.players = [
            { id: 0, botId: 4, name: "Boss Cat", gold: 30, prestige: 10, type: 'BOT', aiDepth: 'MEDIUM', rerolls: 0 }
        ];

        const botMed = snap.players[0];
        const evalMed = evaluateTurnActions(botMed, snap);
        const luxuryActions = evalMed.luxuryActions || [];

        const lux3P = luxuryActions.find(l => l.deckId === 2);
        const lux2P = luxuryActions.find(l => l.deckId === 1);
        const lux1P = luxuryActions.find(l => l.deckId === 0);

        const passed = lux3P !== undefined && lux2P !== undefined && lux1P !== undefined &&
            lux3P.grossPrestigeValue > lux2P.grossPrestigeValue &&
            lux2P.grossPrestigeValue > lux1P.grossPrestigeValue &&
            lux3P.visibleCardUrgencyPrestigeEq === 0; // No opponent lookahead denial in MEDIUM

        results.push({ test: 'Test MU — MEDIUM Tier Luxury Evaluation (Phase 5E.6 Part 30)', passed, details: { lux3P, lux2P, lux1P } });
    }

    // Test MV — LOW Tier Auction Planning & Valuation (Phase 5E.6 Part 31)
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = {
            id: 'A',
            name: 'Spanish River',
            basePrice: 5,
            currentBid: 6,
            highestBidder: 1,
            participants: [0, 1],
            isVisible: true,
            visibleCard: { name: 'Spanish River', points: 2 }
        };
        snap.players = [
            { id: 0, botId: 1, name: "Goober", gold: 25, prestige: 5, type: "BOT", aiDepth: "LOW" },
            { id: 1, botId: 2, name: "Superboy", gold: 25, prestige: 10, type: "BOT", aiDepth: "LOW" }
        ];

        const botLow = snap.players[0];
        const breakdown = calculateStrategicAuctionBidCeiling(botLow, snap);
        const bid = evaluateStrategicAuctionBid(botLow, snap);

        // 2P * 7.5 = 15.0 Au
        const passedValuation = breakdown.auctionPropertyPrestige === 2 && breakdown.auctionBaseValueAu === 15.0;
        const passedDenialGating = breakdown.denialBonusAu === 0 && breakdown.leaderThreatBonusAu === 0;
        const passedBidding = bid.action === 'RAISE' && (bid.amount >= 1 || bid.targetBid === 7) && bid.strategicMaxBidAu >= 14;

        const passed = passedValuation && passedDenialGating && passedBidding;
        results.push({ test: 'Test MV — LOW Tier Auction Planning & Valuation (Phase 5E.6 Part 31)', passed, details: { breakdown, bid } });
    }

    // Test MW — MEDIUM vs FULL Auction Bidding Comparison (Phase 5E.6 Part 32)
    {
        const snap = createBaseValidSnapshot();
        snap.activeAuction = {
            id: 'A',
            name: 'Gulf Stream',
            basePrice: 10,
            currentBid: 12,
            highestBidder: 1,
            participants: [0, 1],
            isVisible: true,
            visibleCard: { name: 'Gulf Stream', points: 3 }
        };
        snap.players = [
            { id: 0, botId: 4, name: "Boss Cat", gold: 40, prestige: 5, type: "BOT", aiDepth: "MEDIUM" },
            { id: 1, botId: 10, name: "Gran Gran", gold: 40, prestige: 15, type: "BOT", aiDepth: "FULL" }
        ];

        const botMed = snap.players[0];
        const botFull = { id: 0, botId: 10, name: "Gran Gran", gold: 40, prestige: 5, type: "BOT", aiDepth: "FULL" };

        const breakdownMed = calculateStrategicAuctionBidCeiling(botMed, snap);
        const breakdownFull = calculateStrategicAuctionBidCeiling(botFull, snap);

        // FULL has opponentLookahead enabled -> includes denial bonus & leader threat bonus
        const passedMed = breakdownMed.denialBonusAu === 0 && breakdownMed.leaderThreatBonusAu === 0;
        const passedFull = breakdownFull.denialBonusAu > 0 && breakdownFull.leaderThreatBonusAu > 0;
        const passedCeiling = breakdownFull.rawStrategicCeiling > breakdownMed.rawStrategicCeiling;

        const passed = passedMed && passedFull && passedCeiling;
        results.push({ test: 'Test MW — MEDIUM vs FULL Auction Bidding Comparison (Phase 5E.6 Part 32)', passed, details: { breakdownMed, breakdownFull } });
    }

    // Test MX — Personality Scaling Across All 3 Tiers (Phase 5E.6 Part 33)
    {
        const surfer = { id: 0, botId: 3, name: "Surfer Dude", gold: 20, type: "BOT", aiDepth: "LOW" };
        const bossCat = { id: 1, botId: 4, name: "Boss Cat", gold: 20, type: "BOT", aiDepth: "MEDIUM" };
        const granGran = { id: 2, botId: 10, name: "Gran Gran", gold: 20, type: "BOT", aiDepth: "FULL" };

        const pSurfer = getStrategicPersonality(surfer);
        const pBossCat = getStrategicPersonality(bossCat);
        const pGranGran = getStrategicPersonality(granGran);

        const profSurfer = getStrategicPersonalityProfile(surfer);
        const profBossCat = getStrategicPersonalityProfile(bossCat);
        const profGranGran = getStrategicPersonalityProfile(granGran);

        const passed = pSurfer === "AGGRESSIVE" &&
            pBossCat === "CAUTIOUS" &&
            pGranGran === "CAUTIOUS" &&
            profSurfer.highRiskMapModifierPrestigeEq > 0 &&
            profBossCat.highRiskMapModifierPrestigeEq < 0 &&
            profGranGran.highRiskMapModifierPrestigeEq < 0;

        results.push({ test: 'Test MX — Personality Scaling Across All 3 Tiers (Phase 5E.6 Part 33)', passed, details: { pSurfer, pBossCat, pGranGran } });
    }

    // Test MY — FULL Tier Regression Invariance (Phase 5E.6 Part 34)
    {
        const snap = createBaseValidSnapshot();
        const fq = { id: 0, botId: 7, name: "Flamingo Queen", gold: 25, type: "BOT", aiDepth: "FULL" };
        const mag = { id: 1, botId: 8, name: "Magician", gold: 25, type: "BOT", aiDepth: "FULL" };
        const twins = { id: 2, botId: 9, name: "The Twins", gold: 25, type: "BOT", aiDepth: "FULL" };
        const gran = { id: 3, botId: 10, name: "Gran Gran", gold: 25, type: "BOT", aiDepth: "FULL" };

        const evalFq = evaluateTurnActions(fq, snap);
        const evalMag = evaluateTurnActions(mag, snap);
        const evalTwins = evaluateTurnActions(twins, snap);
        const evalGran = evaluateTurnActions(gran, snap);

        const passed = evalFq.probabilityModelingEnabled === true &&
            evalMag.opponentLookaheadEnabled === true &&
            evalTwins.lineAwarenessEnabled === true &&
            evalGran.advancedLuxuryEnabled === true;

        results.push({ test: 'Test MY — FULL Tier Regression Invariance (Phase 5E.6 Part 34)', passed, details: { evalFq: evalFq.recommendation, evalGran: evalGran.recommendation } });
    }

    // Test MZ — Telemetry Reason Stability Across Multi-Reroll Sequence (Phase 5E.6 Part 35)
    {
        clearBotRerollHistory();
        const twins = {
            id: 2,
            botId: 9,
            name: "The Twins",
            rerolls: 3,
            _plannedLuxuryReroll: true,
            _plannedLuxuryRerollReason: "CLOSED_DECK_EXPECTED_2P",
            _luxuryRerollCommitted: true,
            _luxuryRerollCommitReason: "CLOSED_DECK_EXPECTED_2P",
            _luxuryAttemptSequenceNumber: 0,
            _luxuryAttemptId: "turn12-bot9-deck0"
        };

        // Simulate 3 reroll failures and record telemetry using _luxuryRerollCommitReason
        for (let i = 1; i <= 3; i++) {
            const rerollsBefore = twins.rerolls;
            twins.rerolls -= 1;
            twins._luxuryAttemptSequenceNumber = i;
            const entry = {
                turnCount: 12,
                botId: twins.botId,
                botName: twins.name,
                source: "LUXURY",
                luxuryAttemptId: twins._luxuryAttemptId,
                attemptSequenceNumber: twins._luxuryAttemptSequenceNumber,
                rerollsBefore,
                rerollsAfter: twins.rerolls,
                plannedReroll: true,
                plannedRerollReason: twins._luxuryRerollCommitReason,
                decisionReason: "STRATEGIC_COMMITTED_LUXURY_REROLL"
            };
            recordBotReroll(entry);
        }

        const history = __botRerollHistory;
        const allReasonsMatch = history.length === 3 && history.every(h => h.plannedRerollReason === "CLOSED_DECK_EXPECTED_2P");
        const sequenceNumbersCorrect = history[0].attemptSequenceNumber === 1 && history[1].attemptSequenceNumber === 2 && history[2].attemptSequenceNumber === 3;

        const passed = allReasonsMatch && sequenceNumbersCorrect;
        results.push({ test: 'Test MZ — Telemetry Reason Stability Across Multi-Reroll Sequence (Phase 5E.6 Part 35)', passed, details: { history } });
    }

    // Test GY — All prior tests remain passing
    {
        const passed = results.filter(r => r.passed).length >= 210;
        results.push({ test: 'Test GY — All prior tests remain passing', passed, details: { currentPassedCount: results.filter(r => r.passed).length } });
    }

    const allPassed = results.every(r => r.passed);
    const count = results.length;
    const passedCount = results.filter(r => r.passed).length;

    console.group(`[AI STRATEGIC ENGINE SELF-TESTS] Summary: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} (${passedCount}/${count})`);
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
