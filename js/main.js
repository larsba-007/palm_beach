

import { GameConfig } from './config.js';
import { state, loadProfile, saveProfile } from './state.js';
import { enterPalmBeachTutorial } from './game.js';
import { openChapterList, closeChapterList } from './pb/tutorial_menu.js';
import { startGame, buyLuxury, nextTurn, startTurnCycle, processMove, triggerAuction, finalizePlayerSetup, initGame, handleFlip, auctionLoop, rotateAuctionTurn, assignBotCharacters, confirmReroll, cancelReroll, confirmResign, log, checkLineBonuses, handleGambit2Step10Progress } from './game.js';
import { setupBoard, initPlayerCards, updateUI, updateCardVisuals, setupAuctionVisuals, animateCellFlip, flyTextAnimation, flyCardAnimation, rollDiceVisual, getCharacterCardStyle, flyTextAnimation as flyText, loadHighScores, getLuxuryCardStyle, playAuctionBonuses, animateAuctionWin, highlightBotButton, animateJaegaSetup, updateAuctionUI, renderNewsFeed, renderCharacterGrid, selectGalleryItem, openCharacterGallery, openBotGallery, openCompendiumCharacter, openCompendiumVisitor, showGambitBrief, closeGambitBrief, showGambitObjectivesModal, closeGambitObjectivesModal, showObjectiveImpossibleModal, closeObjectiveImpossibleModal, quitFromImpossibleObjective, showCompendium, closeCompendium, setCompendiumTab, setCompendiumMenuState, runTutorialStep, dismissLandmarkDossier, showLandmarkDossier, showResignModal, closeResignModal, showAbout, closeAbout, renderPropertyCompendium, selectPropertyItem, renderCompendiumCharacterCard, renderCompendiumVisitorCard } from './ui.js';
import { AchievementManager } from './AchievementManager.js';
import './UnlockManager.js';
import { audioMgr } from './audio.js';
import * as Debug from './debug.js';
import { CHARACTERS, LUXURY_BACK_URL, LUXURY_CARD_SPRITE_URL, CHARACTER_SPRITE_PRINT_URL, PROPERTY_SPRITE_URL, TRAIT_DESCRIPTIONS, GAMBIT_LEVEL_INFO } from './data.js';
import { getPick2CandidatePool, drawPick2Candidates, resolvePick2Selection, isPick2BlockedInDemo } from './draft_logic.js';

import { TutorialManager } from './tutorial.js';
import { EXIT_PROMO } from './exit_promo.js';
import { START_MENU_PROMO } from './start_menu_pop_up.js';
import { initBackgroundShader } from './background.js';
import { GAMBIT_CAMPAIGN } from './gambit_data.js';
window.GAMBIT_CAMPAIGN = GAMBIT_CAMPAIGN; // Expose for the evaluation engine
import { botRoster } from './bots.js';
import { SaveManager } from './SaveManager.js';
import { GAME_VARIATIONS, DRAFT_MODES } from './unlock_data.js';
import { WEB_PARTY, clampWebPlayers, applyWebPartyConfig, defaultPartyName, isSteamDefaultName, nextWebTutorialStep, webTutorialPrimaryLabel, pickTutorialName, isTutorialPopupId, webBoardOffsetY, isTextEntryElement, webSizeHint, WEB_SIZE_HINT_TEXT } from './web_party.js';
import { SUPPORT_US, getVisibleSupportOffers } from './support_links.js';
import { buildBotKnowledgeState, inspectBotKnowledge, validateBotKnowledge, testBotKnowledgeFirewall, runBotKnowledgeSelfTests, inspectBotMapDecision, chooseMapCell, chooseLuxuryDeck, isLuxuryPurchaseAllowed, inspectBotLuxuryDecision, chooseAuctionAction, inspectBotAuctionDecision, isFullStrategicVisitor, isGranGranVisitor } from './ai_knowledge.js';
import { AU_PER_PRESTIGE, PRESTIGE_PER_AU, EXPECTED_CLOSED_LUXURY_PRESTIGE, LUXURY_SUCCESS_RATE, LUXURY_REROLL_SUCCESS_RATE, getLuxuryAttemptSuccessRate, REROLL_RESOURCE_COST_PRESTIGE_EQ, REROLL_ACQUISITION_VALUE_PRESTIGE_EQ, MAR_A_LAGO_TIEBREAK_PREMIUM_AU, PLAYER_COUNT_DENIAL_FACTOR, POST_AUCTION_MIN_RESERVE, getPostAuctionReserve, evaluatePostAuctionLuxuryPlan, TRAP_OPPORTUNITY_PENALTY_AU, evaluateLineSetupValue, evaluateLineHandoffOpportunity, evaluateWaterfrontAuctionTiming, evaluateWaterfrontAdvanceReadiness, STRATEGIC_PERSONALITY_PROFILES, getStrategicPersonality, getStrategicPersonalityProfile, getAuctionUrgencyPersonalityStrength, MAP_PERSONALITY_PROFILES, getMapRegion, getMapPersonalityPrestigeEq, calculateMapRepetitionPenalty, evaluateBlockBonusOpportunity, PUBLIC_LANDMARK_GROUPS, getLandmarkGroup, evaluateLandmarkOpportunity, getGoldRetentionFactor, getBaseGoldRetentionFactor, evaluateEndgameWinLock, getRelevantUpcomingAuction, getExpectedUpcomingAuctionValue, estimateAuctionUrgencyAndIncome, estimateProjectedOpponentAuctionGolds, getAuctionContestability, evaluateVisibleLuxuryMarket, calculateStrategicAuctionBidCeiling, evaluateStrategicAuctionBid, getLuxuryRerollReserve, shouldBotUseMapReroll, resolveStrategicLuxuryRerollDecision, analyzeStrategicContext, formatStrategicContextSummary, evaluateTurnActions, formatActionEvaluationSummary, compareLegacyAndStrategicDecision, resolveBotTurnExecution, runStrategicEngineSelfTests, USE_STRATEGIC_AI, USE_STRATEGIC_FULL_BOTS, AI_DEPTH_FEATURES, getAiDepthFeatures, chooseLowLuxuryCandidate, __botRerollHistory, recordBotReroll, clearBotRerollHistory, inspectBotRerollHistory } from './ai_engine.js';
import { USE_STRATEGIC_GRAN_GRAN, setStrategicGranGranEnabled, setStrategicFullBotsEnabled } from './game.js';


/**
 * Developer inspection helper: Builds sanitized knowledge, validates it,
 * analyzes strategic context, prints the formatted summary, and records history.
 *
 * @param {Object|number} [botParam] - The bot player or ID (defaults to first bot or active player)
 * @param {Object} [stateParam] - The raw game state (defaults to window.state)
 * @returns {Object} The strategic context report
 */
function inspectBotStrategicContext(botParam, stateParam) {
    const s = stateParam || (typeof window !== 'undefined' ? window.state : null);
    if (!s) {
        console.warn("[AI STRATEGIC CONTEXT INSPECTOR] No game state available.");
        return null;
    }

    let bot = botParam;
    if (bot === undefined && s.players) {
        bot = s.players.find(p => p.type === 'BOT') || s.players[0];
    } else if (typeof bot === 'number' && s.players) {
        bot = s.players.find(p => p.botId === bot) || s.players.find(p => p.id === bot) || s.players[bot];
    }

    const knowledge = buildBotKnowledgeState(s, bot);
    const validation = validateBotKnowledge(knowledge);
    if (!validation.valid) {
        console.error("[AI STRATEGIC CONTEXT INSPECTOR] Knowledge validation failed!", validation.errors);
    }

    const context = analyzeStrategicContext(bot, knowledge);

    if (typeof window !== 'undefined') {
        window.__lastBotStrategicContext = context;
        if (!Array.isArray(window.__botStrategicContextHistory)) {
            window.__botStrategicContextHistory = [];
        }
        const stableBotId = bot ? (bot.botId !== undefined ? bot.botId : (bot.botRef?.id ?? (typeof bot === 'number' ? bot : null))) : null;
        const playerId = bot?.id !== undefined ? bot.id : null;
        window.__botStrategicContextHistory.push({
            timestamp: Date.now(),
            turn: s.turn,
            botId: stableBotId,
            playerId: playerId,
            context
        });
        if (window.__botStrategicContextHistory.length > 50) {
            window.__botStrategicContextHistory.shift();
        }
    }

    const summaryText = formatStrategicContextSummary(context);
    console.group(`[AI STRATEGIC CONTEXT] ${context?.bot?.name || 'BOT'}`);
    console.log(summaryText);
    console.groupEnd();

    return context;
}

/**
 * Developer inspection helper: Builds sanitized knowledge, validates it,
 * analyzes strategic context, evaluates turn actions (Map vs Luxury),
 * prints the formatted summary, and records history.
 *
 * @param {Object|number} [botParam] - The bot player or ID
 * @param {Object} [stateParam] - The raw game state (defaults to window.state)
 * @returns {Object} The action evaluation report
 */
function inspectBotActionEvaluation(botParam, stateParam) {
    const s = stateParam || (typeof window !== 'undefined' ? window.state : null);
    if (!s) {
        console.warn("[AI ACTION EVALUATOR INSPECTOR] No game state available.");
        return null;
    }

    let bot = botParam;
    if (bot === undefined && s.players) {
        bot = s.players.find(p => p.type === 'BOT') || s.players[0];
    } else if (typeof bot === 'number' && s.players) {
        bot = s.players.find(p => p.botId === bot) || s.players.find(p => p.id === bot) || s.players[bot];
    }

    const knowledge = buildBotKnowledgeState(s, bot);
    const validation = validateBotKnowledge(knowledge);
    if (!validation.valid) {
        console.error("[AI ACTION EVALUATOR INSPECTOR] Knowledge validation failed!", validation.errors);
    }

    const context = analyzeStrategicContext(bot, knowledge);
    const evaluation = evaluateTurnActions(bot, knowledge, context);

    if (typeof window !== 'undefined') {
        window.__lastBotActionEvaluation = evaluation;
        if (!Array.isArray(window.__botActionEvaluationHistory)) {
            window.__botActionEvaluationHistory = [];
        }
        const stableBotId = bot ? (bot.botId !== undefined ? bot.botId : (bot.botRef?.id ?? (typeof bot === 'number' ? bot : null))) : null;
        const playerId = bot?.id !== undefined ? bot.id : null;
        window.__botActionEvaluationHistory.push({
            timestamp: Date.now(),
            turn: s.turn,
            botId: stableBotId,
            playerId: playerId,
            evaluation
        });
        if (window.__botActionEvaluationHistory.length > 50) {
            window.__botActionEvaluationHistory.shift();
        }
    }

    const summaryText = formatActionEvaluationSummary(evaluation);
    console.group(`[AI ACTION EVALUATION] ${evaluation?.bot?.name || 'BOT'}`);
    console.log(summaryText);
    console.groupEnd();

    return evaluation;
}

/**
 * Convenience developer helper to run all Bot AI test suites (Knowledge Firewall + Strategic Engine).
 * @returns {{ knowledge: Object, strategic: Object, allPassed: boolean, totalCount: number, totalPassed: number }}
 */
function runAllBotAITests() {
    const knowledge = runBotKnowledgeSelfTests();
    const strategic = runStrategicEngineSelfTests();
    const allPassed = (knowledge.allPassed === true && strategic.allPassed === true);
    const kCount = knowledge.count || knowledge.results.length;
    const kPassed = knowledge.passedCount || knowledge.results.filter(r => r.passed).length;
    const sCount = strategic.count || strategic.results.length;
    const sPassed = strategic.passedCount || strategic.results.filter(r => r.passed).length;
    const totalCount = kCount + sCount;
    const totalPassed = kPassed + sPassed;

    console.group(`BOT AI TEST SUITE — ${allPassed ? 'ALL PASSED' : 'FAILURES DETECTED'}`);
    console.log(`Knowledge / Firewall: ${knowledge.allPassed ? 'PASS' : 'FAIL'} (${kPassed}/${kCount})`);
    console.log(`Strategic Engine:     ${strategic.allPassed ? 'PASS' : 'FAIL'} (${sPassed}/${sCount})`);
    console.log(`Overall:              ${allPassed ? 'PASS' : 'FAIL'} (${totalPassed}/${totalCount})`);
    console.groupEnd();

    return {
        knowledge,
        strategic,
        allPassed,
        totalCount,
        totalPassed
    };
}

/**
 * Self-test suite for settings pacing governors and landmark timing controls.
 * @returns {{ allPassed: boolean, count: number, passedCount: number, results: Array }}
 */
export function runSettingsTimingSelfTests() {
    const results = [];
    const savedSettings = { ...state.settings };

    try {
        // Test A — Default Settings Values
        {
            const passAnim = (savedSettings.animationSpeed === 3 || savedSettings.animationSpeed === undefined);
            const passBot = (savedSettings.botTurnSpeed === 3 || savedSettings.botTurnSpeed === undefined);
            const passDice = (savedSettings.diceSpeed === 3 || savedSettings.diceSpeed === undefined);
            const passLandmarkManual = (savedSettings.landmarkManualClose === false);
            const passLandmarkDuration = (savedSettings.landmarkDisplayDuration === 2 || savedSettings.landmarkDisplayDuration === undefined);

            const passed = passAnim && passBot && passDice && passLandmarkManual && passLandmarkDuration;
            results.push({ test: 'Settings Test A — Default Pacing & Landmark Settings', passed, details: { savedSettings } });
        }

        // Test B — Bot Timing Scale (0, 100, 250, 500 ms)
        {
            state.settings.botTurnSpeed = 1;
            const d1 = window.getBotTurnDelay();
            state.settings.botTurnSpeed = 2;
            const d2 = window.getBotTurnDelay();
            state.settings.botTurnSpeed = 3;
            const d3 = window.getBotTurnDelay();
            state.settings.botTurnSpeed = 4;
            const d4 = window.getBotTurnDelay();

            const passed = d1 === 0 && d2 === 100 && d3 === 250 && d4 === 500;
            results.push({ test: 'Settings Test B — Bot Turn Speed Scale (0, 100, 250, 500 ms)', passed, details: { d1, d2, d3, d4 } });
        }

        // Test C — Bot Auction Delay Scale (100, 250, 450, 750 ms)
        {
            state.settings.botTurnSpeed = 1;
            const a1 = window.getBotAuctionDelay();
            state.settings.botTurnSpeed = 2;
            const a2 = window.getBotAuctionDelay();
            state.settings.botTurnSpeed = 3;
            const a3 = window.getBotAuctionDelay();
            state.settings.botTurnSpeed = 4;
            const a4 = window.getBotAuctionDelay();

            const passed = a1 === 100 && a2 === 250 && a3 === 450 && a4 === 750;
            results.push({ test: 'Settings Test C — Bot Auction Delay Scale (100, 250, 450, 750 ms)', passed, details: { a1, a2, a3, a4 } });
        }

        // Test D — Dice Duration Scale (50, 150, 300, 600 ms)
        {
            state.settings.diceSpeed = 1;
            const d1 = window.getDiceDuration();
            state.settings.diceSpeed = 2;
            const d2 = window.getDiceDuration();
            state.settings.diceSpeed = 3;
            const d3 = window.getDiceDuration();
            state.settings.diceSpeed = 4;
            const d4 = window.getDiceDuration();

            const passed = d1 === 50 && d2 === 150 && d3 === 300 && d4 === 600;
            results.push({ test: 'Settings Test D — Dice Duration Scale (50, 150, 300, 600 ms)', passed, details: { d1, d2, d3, d4 } });
        }

        // Test E — Landmark Display Duration Scale (700, 1400, 3000 ms)
        {
            state.settings.landmarkDisplayDuration = 1;
            const d1 = window.getLandmarkInfoDuration();
            state.settings.landmarkDisplayDuration = 2;
            const d2 = window.getLandmarkInfoDuration();
            state.settings.landmarkDisplayDuration = 3;
            const d3 = window.getLandmarkInfoDuration();

            const passed = d1 === 700 && d2 === 1400 && d3 === 3000;
            results.push({ test: 'Settings Test E — Landmark Duration Scale (700, 1400, 3000 ms)', passed, details: { d1, d2, d3 } });
        }

        // Test F — Animation Speed Events Scale (Flip, Flight, Burst, Auction)
        {
            state.settings.animationSpeed = 1;
            const flip1 = window.getAnimationDelay(900, 'flip');
            const flight1 = window.getAnimationDelay(900, 'flight');
            const burst1 = window.getAnimationDelay(900, 'burst');
            const auction1 = window.getAnimationDelay(900, 'auction');

            state.settings.animationSpeed = 2;
            const flip2 = window.getAnimationDelay(900, 'flip');
            const flight2 = window.getAnimationDelay(900, 'flight');

            state.settings.animationSpeed = 3;
            const flip3 = window.getAnimationDelay(900, 'flip');
            const flight3 = window.getAnimationDelay(900, 'flight');

            state.settings.animationSpeed = 4;
            const flip4 = window.getAnimationDelay(900, 'flip');
            const flight4 = window.getAnimationDelay(900, 'flight');

            const passed = flip1 === 0 && flight1 === 50 && burst1 === 100 && auction1 === 50 &&
                flip2 === 80 && flight2 === 180 &&
                flip3 === 140 && flight3 === 350 &&
                flip4 === 250 && flight4 === 700;

            results.push({ test: 'Settings Test F — Animation Speed Event Mappings', passed, details: { flip1, flight1, flip2, flight2, flip3, flight3, flip4, flight4 } });
        }

        // Test G — Control Independence & Bot Speed Dependency
        {
            state.settings.animationSpeed = 1;
            state.settings.botTurnSpeed = 4;
            state.settings.diceSpeed = 2;

            const passBotDelayUpdates = window.getBotTurnDelay() === 500;
            const passBotAuctionUpdates = window.getBotAuctionDelay() === 750;
            const passAnimDoesNotAffectBot = window.getBotTurnDelay() === 500;
            const passAnimDoesNotAffectDice = window.getDiceDuration() === 150;

            state.settings.diceSpeed = 4;
            const passDiceDoesNotAffectAnim = window.getAnimationDelay(900, 'flight') === 50;

            const passed = passBotDelayUpdates && passBotAuctionUpdates && passAnimDoesNotAffectBot && passAnimDoesNotAffectDice && passDiceDoesNotAffectAnim;
            results.push({ test: 'Settings Test G — Control Independence & Bot Speed Governors', passed, details: { passBotDelayUpdates, passBotAuctionUpdates, passAnimDoesNotAffectBot, passAnimDoesNotAffectDice, passDiceDoesNotAffectAnim } });
        }

        // Test H.1 — AUTO MODE: Exact duration verification for durations 1 (700ms), 2 (1400ms), 3 (3000ms) and no timer in Manual mode
        {
            let tempZone = document.querySelector('.right-sidebar-zone');
            let createdZone = false;
            if (!tempZone) {
                tempZone = document.createElement('div');
                tempZone.className = 'right-sidebar-zone';
                document.body.appendChild(tempZone);
                createdZone = true;
            }

            const origSetTimeout = window.setTimeout;
            const capturedDurations = [];
            let timerCounter = 100;

            window.setTimeout = (fn, ms) => {
                capturedDurations.push(ms);
                return ++timerCounter;
            };

            const dummyLandmark = { name: "Test Landmark", bonusType: "PLUS_ONE_AU", location: "Test", description: "Test" };
            const dummyCell = { spriteIndex: 0 };

            try {
                // Duration 1 -> exactly 700ms
                state.settings.landmarkManualClose = false;
                state.settings.landmarkDisplayDuration = 1;
                showLandmarkDossier(dummyLandmark, dummyCell, false, "Tester");
                dismissLandmarkDossier();

                // Duration 2 -> exactly 1400ms
                state.settings.landmarkDisplayDuration = 2;
                showLandmarkDossier(dummyLandmark, dummyCell, false, "Tester");
                dismissLandmarkDossier();

                // Duration 3 -> exactly 3000ms
                state.settings.landmarkDisplayDuration = 3;
                showLandmarkDossier(dummyLandmark, dummyCell, false, "Tester");
                dismissLandmarkDossier();

                // Manual mode -> NO timeout scheduled
                state.settings.landmarkManualClose = true;
                const countBeforeManual = capturedDurations.length;
                showLandmarkDossier(dummyLandmark, dummyCell, false, "Tester");
                const manualTimerNull = window.landmarkAutoCloseTimer === null;
                const noTimeoutScheduled = capturedDurations.length === countBeforeManual;
                dismissLandmarkDossier();

                const durationsMatch = capturedDurations[0] === 700 && capturedDurations[1] === 1400 && capturedDurations[2] === 3000;
                const passed = durationsMatch && manualTimerNull && noTimeoutScheduled;
                results.push({ test: 'Settings Test H.1 — Exact Landmark Auto Durations (700ms, 1400ms, 3000ms) & Manual Mode Invariant', passed, details: { capturedDurations, manualTimerNull, noTimeoutScheduled } });
            } finally {
                window.setTimeout = origSetTimeout;
                if (createdZone && tempZone) tempZone.remove();
            }
        }

        // Test H.2 — MANUAL MODE: Creates NO auto-close timer
        {
            let tempZone = document.querySelector('.right-sidebar-zone');
            let createdZone = false;
            if (!tempZone) {
                tempZone = document.createElement('div');
                tempZone.className = 'right-sidebar-zone';
                document.body.appendChild(tempZone);
                createdZone = true;
            }

            state.settings.landmarkManualClose = true;
            const dummyLandmark = { name: "Test Landmark", bonusType: "PLUS_ONE_AU", location: "Test", description: "Test" };
            const dummyCell = { spriteIndex: 0 };

            showLandmarkDossier(dummyLandmark, dummyCell, false, "Tester");
            const noTimerCreated = window.landmarkAutoCloseTimer === null;
            dismissLandmarkDossier();

            const passed = noTimerCreated;
            results.push({ test: 'Settings Test H.2 — Landmark Manual Mode Creates NO Timer', passed, details: { noTimerCreated } });

            if (createdZone && tempZone) tempZone.remove();
        }

        // Test H.3 — SECOND LANDMARK SAFETY: clearTimeout(timerA), single active timer, and stale callback A rejection
        {
            let tempZone = document.querySelector('.right-sidebar-zone');
            let createdZone = false;
            if (!tempZone) {
                tempZone = document.createElement('div');
                tempZone.className = 'right-sidebar-zone';
                document.body.appendChild(tempZone);
                createdZone = true;
            }

            state.settings.landmarkManualClose = false;
            state.settings.landmarkDisplayDuration = 2;
            const dummyLandmarkA = { name: "Landmark A", bonusType: "PLUS_ONE_AU", location: "Loc A", description: "Desc A" };
            const dummyLandmarkB = { name: "Landmark B", bonusType: "PLUS_TWO_AU", location: "Loc B", description: "Desc B" };
            const dummyCell = { spriteIndex: 0 };

            let timerCounter = 500;
            const capturedTimeouts = [];
            const clearedTimerIds = [];

            const origSetTimeout = window.setTimeout;
            const origClearTimeout = window.clearTimeout;

            window.setTimeout = (fn, ms) => {
                const id = ++timerCounter;
                capturedTimeouts.push({ id, fn, ms });
                return id;
            };
            window.clearTimeout = (id) => {
                clearedTimerIds.push(id);
            };

            let completionCountA = 0;
            let completionCountB = 0;
            const onCompleteA = () => { completionCountA++; };
            const onCompleteB = () => { completionCountB++; };

            try {
                // 1. Open Landmark A
                showLandmarkDossier(dummyLandmarkA, dummyCell, false, "Tester A", onCompleteA);
                const timerA = window.landmarkAutoCloseTimer;
                const callbackA = capturedTimeouts[0]?.fn;

                // 2. Open Landmark B before timerA expires
                showLandmarkDossier(dummyLandmarkB, dummyCell, false, "Tester B", onCompleteB);
                const timerB = window.landmarkAutoCloseTimer;
                const timerACleared = clearedTimerIds.includes(timerA);
                const exactlyOneTimer = timerB !== null && timerB !== timerA;

                // 3. Manually invoke captured stale callback A
                if (callbackA) {
                    callbackA();
                }

                // Landmark B must remain open, timer B remains authoritative, and onCompletes are not prematurely fired
                const overlayBRemains = document.getElementById('landmark-dossier-overlay') !== null;
                const timerBAuthoritative = window.landmarkAutoCloseTimer === timerB;
                const onCompleteANotCalled = completionCountA === 0;
                const onCompleteBNotCalled = completionCountB === 0;

                // 4. Finally dismiss Landmark B
                dismissLandmarkDossier();
                const overlayGoneAfterDismiss = document.getElementById('landmark-dossier-overlay') === null;
                const onCompleteBCalledOnce = completionCountB === 1;

                const passed = timerACleared && exactlyOneTimer && overlayBRemains &&
                    timerBAuthoritative && onCompleteANotCalled && onCompleteBNotCalled &&
                    overlayGoneAfterDismiss && onCompleteBCalledOnce;

                results.push({
                    test: 'Settings Test H.3 — Second Landmark Safety: clearTimeout(timerA), Single Timer, and Stale Callback Guard',
                    passed,
                    details: { timerA, timerB, timerACleared, overlayBRemains, timerBAuthoritative, completionCountA, completionCountB }
                });
            } finally {
                window.setTimeout = origSetTimeout;
                window.clearTimeout = origClearTimeout;
                if (createdZone && tempZone) tempZone.remove();
            }
        }

        // Test H.4 — EARLY MANUAL DISMISS: Timer cancelled, overlay removed, onComplete called once
        {
            let tempZone = document.querySelector('.right-sidebar-zone');
            let createdZone = false;
            if (!tempZone) {
                tempZone = document.createElement('div');
                tempZone.className = 'right-sidebar-zone';
                document.body.appendChild(tempZone);
                createdZone = true;
            }

            state.settings.landmarkManualClose = false;
            let completionCount = 0;
            const onCompleteSpy = () => { completionCount++; };
            const dummyLandmark = { name: "Test Landmark", bonusType: "PLUS_ONE_AU", location: "Test", description: "Test" };
            const dummyCell = { spriteIndex: 0 };

            showLandmarkDossier(dummyLandmark, dummyCell, false, "Tester", onCompleteSpy);
            dismissLandmarkDossier();
            // Call dismiss a second time to ensure onComplete is strictly single-use
            dismissLandmarkDossier();

            const overlayGone = document.getElementById('landmark-dossier-overlay') === null;
            const catcherGone = document.getElementById('landmark-click-catcher') === null;
            const timerNull = window.landmarkAutoCloseTimer === null;
            const onCompleteSingle = completionCount === 1;

            const passed = overlayGone && catcherGone && timerNull && onCompleteSingle;
            results.push({ test: 'Settings Test H.4 — Early Manual Dismiss Clean State & Single onComplete', passed, details: { overlayGone, catcherGone, timerNull, completionCount } });

            if (createdZone && tempZone) tempZone.remove();
        }

        // Test H.5 — AUTO DISMISS: Timer callback closes overlay & executes onComplete once
        {
            let tempZone = document.querySelector('.right-sidebar-zone');
            let createdZone = false;
            if (!tempZone) {
                tempZone = document.createElement('div');
                tempZone.className = 'right-sidebar-zone';
                document.body.appendChild(tempZone);
                createdZone = true;
            }

            state.settings.landmarkManualClose = false;
            let autoCompletionCount = 0;
            const onCompleteSpy = () => { autoCompletionCount++; };
            const dummyLandmark = { name: "Test Landmark", bonusType: "PLUS_ONE_AU", location: "Test", description: "Test" };
            const dummyCell = { spriteIndex: 0 };

            // Mock setTimeout to capture callback
            const origSetTimeout = window.setTimeout;
            let capturedCallback = null;
            window.setTimeout = (fn, ms) => {
                capturedCallback = fn;
                return 99999;
            };

            try {
                showLandmarkDossier(dummyLandmark, dummyCell, false, "Tester", onCompleteSpy);
                // Execute auto-close callback
                if (capturedCallback) capturedCallback();
            } finally {
                window.setTimeout = origSetTimeout;
            }

            const autoOverlayGone = document.getElementById('landmark-dossier-overlay') === null;
            const autoTimerNull = window.landmarkAutoCloseTimer === null;
            const autoCompleteSingle = autoCompletionCount === 1;

            const passed = autoOverlayGone && autoTimerNull && autoCompleteSingle;
            results.push({ test: 'Settings Test H.5 — Auto Dismiss Execution & Clean State', passed, details: { autoOverlayGone, autoTimerNull, autoCompletionCount } });

            if (createdZone && tempZone) tempZone.remove();
        }
    } finally {
        // Restore settings
        Object.assign(state.settings, savedSettings);
        applySpeedCSS();
    }

    const allPassed = results.every(r => r.passed);
    const count = results.length;
    const passedCount = results.filter(r => r.passed).length;

    console.group(`[SETTINGS & PACING SELF-TESTS] Summary: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} (${passedCount}/${count})`);
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

export function runGambitProgressionSelfTests() {
    const results = [];

    // Helper to simulate state in test
    const originalCleared = state.playerProfile?.clearedGambits ? [...state.playerProfile.clearedGambits] : [];
    const originalSeen = state.playerProfile?.seenGambitLevelIntros ? [...state.playerProfile.seenGambitLevelIntros] : [];
    const origGameConfig = window.GameConfig;
    const origHasSetLocalName = state.settings.hasSetLocalName;
    window.GameConfig = { isFullGame: true };
    state.settings.hasSetLocalName = true;

    try {
        // A. Fresh profile enters Gambit page -> Level 1 plate auto-opens.
        state.playerProfile.clearedGambits = [];
        state.playerProfile.seenGambitLevelIntros = [];
        
        let candidateA = null;
        for (let l = 1; l <= 10; l++) {
            if (isLevelUnlocked(l) && !state.playerProfile.seenGambitLevelIntros.includes(l)) {
                candidateA = l;
                break;
            }
        }
        const passedA = candidateA === 1;
        results.push({ test: 'Gambit Test A — Fresh profile enters Gambit page: Level 1 auto-opens', passed: passedA, details: { candidateA } });

        // B. Level 1 already seen -> does not auto-open again.
        state.playerProfile.seenGambitLevelIntros = [1];
        let candidateB = null;
        for (let l = 1; l <= 10; l++) {
            if (isLevelUnlocked(l) && !state.playerProfile.seenGambitLevelIntros.includes(l)) {
                candidateB = l;
                break;
            }
        }
        const passedB = candidateB === null;
        results.push({ test: 'Gambit Test B — Level 1 already seen: does not auto-open again', passed: passedB, details: { candidateB } });

        // C. Player completes fourth required Level 1 Gambit -> Level 2 becomes unlocked, Level 2 is pending/unseen.
        state.playerProfile.clearedGambits = [1, 2, 3, 4];
        state.playerProfile.seenGambitLevelIntros = [1];
        const isL2Unlocked = isLevelUnlocked(2);
        let candidateC = null;
        for (let l = 1; l <= 10; l++) {
            if (isLevelUnlocked(l) && !state.playerProfile.seenGambitLevelIntros.includes(l)) {
                candidateC = l;
                break;
            }
        }
        const passedC = isL2Unlocked === true && candidateC === 2;
        results.push({ test: 'Gambit Test C — Level 1 4-clears unlocks Level 2 as pending auto-intro', passed: passedC, details: { isL2Unlocked, candidateC } });

        // D. Game Over screen appears -> Level 2 plate does NOT appear over Game Over.
        let plateCalledDuringGameOver = 0;
        let popupCalledDuringGameOver = 0;
        const origShowPlateD = app.showGambitLevelPlate;
        const origShowPopupD = app.showLevelUnlockedPopup;
        app.showGambitLevelPlate = () => { plateCalledDuringGameOver++; };
        app.showLevelUnlockedPopup = () => { popupCalledDuringGameOver++; };

        try {
            state.activeGambitId = 4;
            state.playerProfile.clearedGambits = [1, 2, 3, 4];
            state.isGameOver = true;
            const passedD = plateCalledDuringGameOver === 0 && popupCalledDuringGameOver === 0;
            results.push({ test: 'Gambit Test D — Game Over does NOT show Level plate over results', passed: passedD, details: { plateCalledDuringGameOver, popupCalledDuringGameOver } });
        } finally {
            app.showGambitLevelPlate = origShowPlateD;
            app.showLevelUnlockedPopup = origShowPopupD;
        }

        // E. Player presses GAMBIT SELECT -> campaign opens, Level 2 plate appears, no pending continuation created.
        state.playerProfile.clearedGambits = [1, 2, 3, 4];
        state.playerProfile.seenGambitLevelIntros = [1];
        state.activeGambitId = 4;
        app.pendingNextGambitAction = null;
        let plateOpenedLevelE = null;
        const origShowPlateE = app.showGambitLevelPlate;
        app.showGambitLevelPlate = (lvl, isAuto) => {
            plateOpenedLevelE = lvl;
            if (origShowPlateE) origShowPlateE(lvl, isAuto);
        };

        try {
            app.handleGambitExit();
            const hadNoContinuation = app.pendingNextGambitAction === null;
            app.closeGambitLevelPlate();
            const passedE = plateOpenedLevelE === 2 && hadNoContinuation;
            results.push({ test: 'Gambit Test E — GAMBIT SELECT returns to campaign and triggers Level 2 plate without continuation', passed: passedE, details: { plateOpenedLevelE, hadNoContinuation } });
        } finally {
            app.showGambitLevelPlate = origShowPlateE;
            app.closeGambitLevelPlate();
        }

        // F. Player presses NEXT GAMBIT -> campaign opens, Level 2 plate appears, continuation queued and selects remaining Gambit 5 on close.
        state.playerProfile.clearedGambits = [1, 2, 3, 4];
        state.playerProfile.seenGambitLevelIntros = [1];
        state.activeGambitId = 4;
        app.pendingNextGambitAction = null;
        let plateOpenedLevelF = null;
        let startGambitCalledF = false;
        const origShowPlateF = app.showGambitLevelPlate;
        const origStartGambitF = app.startGambit;
        app.showGambitLevelPlate = (lvl, isAuto) => {
            plateOpenedLevelF = lvl;
            if (origShowPlateF) origShowPlateF(lvl, isAuto);
        };
        app.startGambit = () => { startGambitCalledF = true; };

        try {
            app.handleGambitAction(true);
            const hasContinuationWhileOpen = typeof app.pendingNextGambitAction === 'function';
            const notStartedPrematurely = !startGambitCalledF;
            
            // Now close/continue plate
            app.closeGambitLevelPlate();
            const continuationCleared = app.pendingNextGambitAction === null;
            const gambit5Selected = app.selectedGambitId === 5;

            const passedF = plateOpenedLevelF === 2 && hasContinuationWhileOpen && notStartedPrematurely && continuationCleared && gambit5Selected;
            results.push({ test: 'Gambit Test F — NEXT GAMBIT at 4/5 queues continuation and selects remaining Gambit 5 in current Level upon close', passed: passedF, details: { plateOpenedLevelF, hasContinuationWhileOpen, notStartedPrematurely, continuationCleared, gambit5Selected } });
        } finally {
            app.showGambitLevelPlate = origShowPlateF;
            app.startGambit = origStartGambitF;
            app.pendingNextGambitAction = null;
            app.closeGambitLevelPlate();
        }

        // F2. Player completes 5 of 5 in Level 1 -> NEXT GAMBIT automatically advances to Gambit 6 of Level 2.
        state.playerProfile.clearedGambits = [1, 2, 3, 4, 5];
        state.playerProfile.seenGambitLevelIntros = [1, 2];
        state.activeGambitId = 5;
        app.pendingNextGambitAction = null;
        let startGambitCalledF2 = false;
        const origStartGambitF2 = app.startGambit;
        app.startGambit = () => { startGambitCalledF2 = true; };

        try {
            app.handleGambitAction(true);
            const gambit6Selected = app.selectedGambitId === 6;
            const passedF2 = gambit6Selected && startGambitCalledF2;
            results.push({ test: 'Gambit Test F2 — NEXT GAMBIT at 5/5 automatically advances and starts Gambit 6 of next Level', passed: passedF2, details: { gambit6Selected, startGambitCalledF2 } });
        } finally {
            app.startGambit = origStartGambitF2;
            app.pendingNextGambitAction = null;
        }

        // G. Missing Modal Safety: If modal or inner DOM is missing, level is NOT marked seen.
        state.playerProfile.seenGambitLevelIntros = [1];
        const origGetElementById = document.getElementById;
        document.getElementById = (id) => {
            if (id === 'gambit-level-modal' || id === 'gambit-level-plate-inner') return null;
            return origGetElementById(id);
        };

        try {
            app.showGambitLevelPlate(2, true);
            const notMarkedWhenMissing = !state.playerProfile.seenGambitLevelIntros.includes(2);
            
            // Restore DOM
            document.getElementById = origGetElementById;
            app.showGambitLevelPlate(2, true);
            const markedAfterRestore = state.playerProfile.seenGambitLevelIntros.includes(2);

            const passedG = notMarkedWhenMissing && markedAfterRestore;
            results.push({ test: 'Gambit Test G — Missing modal safety: seen state written only after successful presentation', passed: passedG, details: { notMarkedWhenMissing, markedAfterRestore } });
        } finally {
            document.getElementById = origGetElementById;
            app.closeGambitLevelPlate();
        }

        // H. Click unlocked Level label -> plate opens manually without altering seen list if not auto-intro.
        state.playerProfile.seenGambitLevelIntros = [1, 2];
        app.showGambitLevelPlate(2, false);
        const passedH = state.playerProfile.seenGambitLevelIntros.length === 2 && state.playerProfile.seenGambitLevelIntros.includes(1) && state.playerProfile.seenGambitLevelIntros.includes(2);
        app.closeGambitLevelPlate();
        results.push({ test: 'Gambit Test H — Manual Level label click opens plate without modifying seen list', passed: passedH });

        // I. Click locked future Level label -> plate opens with LOCKED state and correct unlock requirement.
        state.playerProfile.clearedGambits = [1, 2, 3, 4]; // Only Level 2 unlocked
        const isL7Unlocked = isLevelUnlocked(7);
        const l7Info = GAMBIT_LEVEL_INFO.find(g => g.level === 7);
        const passedI = !isL7Unlocked && l7Info && l7Info.subtitle === 'ADVANCED PLAY';
        results.push({ test: 'Gambit Test I — Locked future Level label opens with LOCKED status and requirement', passed: passedI, details: { isL7Unlocked, l7Info: l7Info?.subtitle } });

        // J. Previewing locked Level does NOT mark its auto-intro as seen.
        app.showGambitLevelPlate(7, false);
        const passedJ = !state.playerProfile.seenGambitLevelIntros.includes(7);
        app.closeGambitLevelPlate();
        results.push({ test: 'Gambit Test J — Previewing locked Level does NOT mark auto-intro as seen', passed: passedJ, details: { seen: state.playerProfile.seenGambitLevelIntros } });

        // K. After that Level actually unlocks -> its automatic unlock plate still appears.
        state.playerProfile.clearedGambits = [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24, 26, 27, 28, 29];
        state.playerProfile.seenGambitLevelIntros = [1, 2, 3, 4, 5, 6];
        const isL7NowUnlocked = isLevelUnlocked(7);
        let candidateK = null;
        for (let l = 1; l <= 10; l++) {
            if (isLevelUnlocked(l) && !state.playerProfile.seenGambitLevelIntros.includes(l)) {
                candidateK = l;
                break;
            }
        }
        const passedK = isL7NowUnlocked && candidateK === 7;
        results.push({ test: 'Gambit Test K — Newly unlocked Level 7 auto-intro triggers on campaign entry', passed: passedK, details: { isL7NowUnlocked, candidateK } });

        // L. Level 1 START GAMBIT 1 CTA routes correctly.
        const l1Info = GAMBIT_LEVEL_INFO.find(g => g.level === 1);
        const passedL = l1Info && l1Info.primaryCta === 'START GAMBIT 1';
        results.push({ test: 'Gambit Test L — Level 1 START GAMBIT 1 CTA metadata and routing verified', passed: passedL, details: { cta: l1Info?.primaryCta } });

        // M. Level 2 Data Model: locals is empty (no fake PICK 2 character), visitors has SURFER DUDE, setupTags has PICK 2.
        const l2Info = GAMBIT_LEVEL_INFO.find(g => g.level === 2);
        const passedM = l2Info && Array.isArray(l2Info.locals) && l2Info.locals.length === 0 && l2Info.visitors.includes("SURFER DUDE") && l2Info.setupTags.includes("PICK 2");
        results.push({ test: 'Gambit Test M — Level 2 data model has empty locals and preserves PICK 2 in setupTags', passed: passedM, details: { locals: l2Info?.locals, visitors: l2Info?.visitors, setupTags: l2Info?.setupTags } });

        // N. Level Plate Local Card Static Mode: No hover enlargement, no cursor-pointer, no onclick handler.
        const staticLocalCard = renderCompendiumCharacterCard("KINGSTONE", { disableClick: true, disableHoverScale: true });
        const passedN = staticLocalCard.includes('w-[400px]') && staticLocalCard.includes('h-[686px]') && !staticLocalCard.includes('hover:scale-[1.75]') && !staticLocalCard.includes('onclick=') && !staticLocalCard.includes('cursor-pointer');
        results.push({ test: 'Gambit Test N — Level Plate Local card renders static 400x686 without hover scale or click handler', passed: passedN });

        // O. Level Plate Visitor Card Static Mode: No hover enlargement, no cursor-pointer, no onclick handler.
        const staticVisitorCard = renderCompendiumVisitorCard("SURFER DUDE", { disableClick: true, disableHoverScale: true });
        const passedO = staticVisitorCard.includes('w-[400px]') && staticVisitorCard.includes('h-[686px]') && !staticVisitorCard.includes('hover:scale-[1.75]') && !staticVisitorCard.includes('onclick=') && !staticVisitorCard.includes('cursor-pointer');
        results.push({ test: 'Gambit Test O — Level Plate Visitor card renders static 400x686 without hover scale or click handler', passed: passedO });

        // P. Compendium Interactive Mode Preserved: Standard cards retain hover:scale-[1.75], cursor-pointer, and openCompendium handlers.
        const interactiveLocal = renderCompendiumCharacterCard("MS. POST");
        const interactiveVisitor = renderCompendiumVisitorCard("PIRATE");
        const passedP = interactiveLocal.includes('hover:scale-[1.75]') && interactiveLocal.includes('cursor-pointer') && interactiveLocal.includes('openCompendiumCharacter') &&
                        interactiveVisitor.includes('hover:scale-[1.75]') && interactiveVisitor.includes('cursor-pointer') && interactiveVisitor.includes('openCompendiumVisitor');
        results.push({ test: 'Gambit Test P — Compendium standard cards retain full hover scale and openCompendium click interactions', passed: passedP });

        // Q. Visitor Identity & Local 10 Inspection Helpers: openCompendiumVisitor & openCompendiumCharacter work reliably.
        openCompendiumVisitor("GRAN GRAN");
        const detailNameElQ1 = document.getElementById('gallery-detail-name');
        const isGranGranSelected = detailNameElQ1 && (detailNameElQ1.innerText.toUpperCase() === 'GRAN GRAN');
        openCompendiumCharacter("ERIC");
        const detailNameElQ2 = document.getElementById('gallery-detail-name');
        const isEricSelected = detailNameElQ2 && (detailNameElQ2.innerText.toUpperCase() === 'ERIC');
        closeCompendium();
        const passedQ = isGranGranSelected && isEricSelected;
        results.push({ test: 'Gambit Test Q — Compendium inspection helpers resolve authoritative Gran Gran (Bot ID 10) and Eric (Character ID 6)', passed: passedQ });

        // R. PICK 2 Special Case: Non-clickable and does not route to fake/unrelated detail target.
        const pick2Card = renderCompendiumCharacterCard("PICK 2");
        const passedR = !pick2Card.includes('onclick="app.openCompendium') && pick2Card.includes('PICK 2') && pick2Card.includes('select-none');
        results.push({ test: 'Gambit Test R — PICK 2 special case is non-clickable with no invalid detail route', passed: passedR });

        // S. Level Plate V2 Typography Scale: Verifies 60px title, 40px description, 34px bullets, 28px tags and footer.
        app.showGambitLevelPlate(2, false);
        const innerHtmlS = document.getElementById('gambit-level-plate-inner')?.innerHTML || '';
        const has60pxTitle = innerHtmlS.includes('text-[60px]');
        const has40pxDesc = innerHtmlS.includes('text-[40px]');
        const has34pxBullets = innerHtmlS.includes('text-[34px]');
        const has28pxTags = innerHtmlS.includes('text-[28px]');
        const passedS = has60pxTitle && has40pxDesc && has34pxBullets && has28pxTags;
        results.push({ test: 'Gambit Test S — Level Plate body typography adheres to V2 40px scale with 34px bullets and 28px tags', passed: passedS });
        app.closeGambitLevelPlate();

        // T. Gambit Campaign Level Tabs: Mini V2 glass tab with info symbol ⓘ and click cursor.
        app.renderGambitGridV2();
        const gridHtmlT = document.getElementById('gambit-grid-v2')?.innerHTML || '';
        const hasGlassTab = gridHtmlT.includes('bg-[#26385C]/40') && gridHtmlT.includes('rounded-xl');
        const hasInfoSymbol = gridHtmlT.includes('ⓘ');
        const hasCursor = gridHtmlT.includes('cursor-pointer');
        const passedT = hasGlassTab && hasInfoSymbol && hasCursor;
        results.push({ test: 'Gambit Test T — Gambit campaign renders compact V2 glass tabs with info symbol ⓘ', passed: passedT });

        // U. Main Campaign Backplate Geometry: 3400px plate width and right content shifted to left-[1340px].
        const stageEl = document.getElementById('panel-3-gambits-v2');
        const stageHtml = stageEl ? stageEl.innerHTML : '';
        const has3400pxWidth = stageHtml.includes('w-[3400px]');
        const has1340pxShift = stageHtml.includes('left-[1340px]');
        const passedU = has3400pxWidth && has1340pxShift;
        results.push({ test: 'Gambit Test U — Main campaign backplate widened to 3400px with right-side content shifted to left-[1340px]', passed: passedU, details: { has3400pxWidth, has1340pxShift } });

        // V. Normal Board Game Match Objectives: Full standard victory, game end, and tiebreak explanation.
        state.activeGambitId = null;
        showGambitObjectivesModal(false);
        const sectionsElV = document.getElementById('gambit-obj-sections');
        const htmlV = sectionsElV ? sectionsElV.innerHTML : '';
        const hasWinTheGameV = htmlV.includes('WIN THE GAME');
        const hasHowToWinV = htmlV.includes('HOW TO WIN');
        const hasGameEndV = htmlV.includes('GAME END') && htmlV.includes('All Map Cards have been flipped');
        const hasTiebreakerV = htmlV.includes('TIEBREAKER') && htmlV.includes('MAR-A-LAGO') && htmlV.includes('MOST GOLD REMAINING');
        const passedV = hasWinTheGameV && hasHowToWinV && hasGameEndV && hasTiebreakerV;
        results.push({ test: 'Gambit Test V — Normal Custom Board Game match objectives contains complete standard victory & tiebreak rules', passed: passedV });
        closeGambitObjectivesModal();

        // W. END_GAME Gambit (Gambit 13 & 23): Standard victory explanation displayed for normal end-game ranking matches.
        state.activeGambitId = 13;
        showGambitObjectivesModal(false);
        const htmlW1 = document.getElementById('gambit-obj-sections')?.innerHTML || '';
        state.activeGambitId = 23;
        showGambitObjectivesModal(false);
        const htmlW2 = document.getElementById('gambit-obj-sections')?.innerHTML || '';
        const passedW = htmlW1.includes('HOW TO WIN') && htmlW1.includes('TIEBREAKER') && htmlW2.includes('HOW TO WIN') && htmlW2.includes('TIEBREAKER');
        results.push({ test: 'Gambit Test W — END_GAME Gambits (13 & 23) display standard victory, game end, and tiebreak rules', passed: passedW });
        closeGambitObjectivesModal();

        // X. END_GAME Composite Gambit (Gambit 50): Preserves specific objectives AND includes standard victory rules.
        state.activeGambitId = 50;
        showGambitObjectivesModal(false);
        const htmlX = document.getElementById('gambit-obj-sections')?.innerHTML || '';
        const hasSpecificGoalsX = htmlX.includes('LUXURY HUNT') && htmlX.includes('MAP SPECIALIST');
        const hasStandardWinX = htmlX.includes('WIN THE GAME') && htmlX.includes('TIEBREAKER') && htmlX.includes('MAR-A-LAGO');
        const passedX = hasSpecificGoalsX && hasStandardWinX;
        results.push({ test: 'Gambit Test X — END_GAME Composite Gambit (50) preserves specific objectives alongside standard victory rules', passed: passedX });
        closeGambitObjectivesModal();

        // Y. MID_GAME Prestige Race (Gambit 14): Excludes standard game end and tiebreaker.
        state.activeGambitId = 14;
        showGambitObjectivesModal(false);
        const htmlY = document.getElementById('gambit-obj-sections')?.innerHTML || '';
        const hasPrestigeRaceY = htmlY.includes('PRESTIGE SPRINT') || htmlY.includes('PRESTIGE');
        const excludesStdGameEndY = !htmlY.includes('All Map Cards have been flipped') && !htmlY.includes('TIEBREAKER');
        const passedY = hasPrestigeRaceY && excludesStdGameEndY;
        results.push({ test: 'Gambit Test Y — MID_GAME Prestige Race (Gambit 14) excludes standard game end & tiebreak explanation', passed: passedY });
        closeGambitObjectivesModal();

        // Z. MID_GAME Luxury & Property Races (Gambit 32 & 11): Exclude standard game end and tiebreaker.
        state.activeGambitId = 32;
        showGambitObjectivesModal(false);
        const htmlZ1 = document.getElementById('gambit-obj-sections')?.innerHTML || '';
        state.activeGambitId = 11;
        showGambitObjectivesModal(false);
        const htmlZ2 = document.getElementById('gambit-obj-sections')?.innerHTML || '';
        const excludesStdZ1 = !htmlZ1.includes('All Map Cards have been flipped') && !htmlZ1.includes('TIEBREAKER');
        const excludesStdZ2 = !htmlZ2.includes('All Map Cards have been flipped') && !htmlZ2.includes('TIEBREAKER');
        const passedZ = excludesStdZ1 && excludesStdZ2;
        results.push({ test: 'Gambit Test Z — MID_GAME Luxury (32) & Property (11) races exclude standard game end explanation', passed: passedZ });
        closeGambitObjectivesModal();

        // AA. Hexagonal vs Circular Gambit Tile Rendering: Hex nodes (5, 10, ... 50) receive .gambit-hexagon; circular nodes (1-4) do not.
        const hexIndices = [];
        for (let row = 1; row <= 10; row++) {
            for (let col = 1; col <= 5; col++) {
                if (col === 5) hexIndices.push((row - 1) * 5 + col);
            }
        }
        const expectedHexes = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
        const hexMatch = hexIndices.length === 10 && hexIndices.every((v, idx) => v === expectedHexes[idx]);
        results.push({ test: 'Gambit Test AA — Hexagonal Gambit tiles (5, 10, ... 50) receive dedicated .gambit-hexagon class while circular nodes do not', passed: hexMatch });

    } finally {
        state.playerProfile.clearedGambits = originalCleared;
        state.playerProfile.seenGambitLevelIntros = originalSeen;
        state.settings.hasSetLocalName = origHasSetLocalName;
        window.GameConfig = origGameConfig;
    }

    const allPassed = results.every(r => r.passed);
    const count = results.length;
    const passedCount = results.filter(r => r.passed).length;

    console.group(`[GAMBIT PROGRESSION SELF-TESTS] Summary: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} (${passedCount}/${count})`);
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

// Expose state globally for Debug/God Mode tools
window.state = state;
window.GameConfig = GameConfig;

// Web Party Edition: flag <html> so index.css can hide Steam-only / promo elements (.steam-only)
if (GameConfig.isWeb && typeof document !== 'undefined') document.documentElement.classList.add('edition-web');

// Web Party Edition: start downloading the party menu background while the splash screen is showing
if (GameConfig.isWeb && typeof Image !== 'undefined') new Image().src = new URL(/* @vite-ignore */ '../assets/board_game.webp', import.meta.url).href;
window.saveProfile = saveProfile;
window.AchievementManager = AchievementManager;
window.buildBotKnowledgeState = buildBotKnowledgeState;
window.inspectBotKnowledge = inspectBotKnowledge;
window.validateBotKnowledge = validateBotKnowledge;
window.testBotKnowledgeFirewall = testBotKnowledgeFirewall;
window.runBotKnowledgeSelfTests = runBotKnowledgeSelfTests;
window.runStrategicEngineSelfTests = runStrategicEngineSelfTests;
window.runAllBotAITests = runAllBotAITests;
window.runSettingsTimingSelfTests = runSettingsTimingSelfTests;
window.runGambitProgressionSelfTests = runGambitProgressionSelfTests;
window.inspectBotMapDecision = inspectBotMapDecision;
window.chooseMapCell = chooseMapCell;
window.chooseLuxuryDeck = chooseLuxuryDeck;
window.isLuxuryPurchaseAllowed = isLuxuryPurchaseAllowed;
window.inspectBotLuxuryDecision = inspectBotLuxuryDecision;
window.chooseAuctionAction = chooseAuctionAction;
window.inspectBotAuctionDecision = inspectBotAuctionDecision;

// Phase 5A: Economic Context Engine Globals
window.AU_PER_PRESTIGE = AU_PER_PRESTIGE;
window.PRESTIGE_PER_AU = PRESTIGE_PER_AU;
window.EXPECTED_CLOSED_LUXURY_PRESTIGE = EXPECTED_CLOSED_LUXURY_PRESTIGE;
window.LUXURY_SUCCESS_RATE = LUXURY_SUCCESS_RATE;
window.POST_AUCTION_MIN_RESERVE = POST_AUCTION_MIN_RESERVE;
window.getPostAuctionReserve = getPostAuctionReserve;
window.evaluateEndgameWinLock = evaluateEndgameWinLock;
window.getRelevantUpcomingAuction = getRelevantUpcomingAuction;
window.getExpectedUpcomingAuctionValue = getExpectedUpcomingAuctionValue;
window.estimateAuctionUrgencyAndIncome = estimateAuctionUrgencyAndIncome;
window.estimateProjectedOpponentAuctionGolds = estimateProjectedOpponentAuctionGolds;
window.getAuctionContestability = getAuctionContestability;
window.getBaseGoldRetentionFactor = getBaseGoldRetentionFactor;
window.analyzeStrategicContext = analyzeStrategicContext;
window.inspectBotStrategicContext = inspectBotStrategicContext;
window.formatStrategicContextSummary = formatStrategicContextSummary;
window.__lastBotStrategicContext = null;
window.__botStrategicContextHistory = [];

// Phase 5B / 5B.6 / 5B.7 / 5B.8 / 5B.9: Action Valuation Engine & Control Gate Globals
window.TRAP_OPPORTUNITY_PENALTY_AU = TRAP_OPPORTUNITY_PENALTY_AU;
window.evaluateLineSetupValue = evaluateLineSetupValue;
window.evaluateLineHandoffOpportunity = evaluateLineHandoffOpportunity;
window.evaluateWaterfrontAuctionTiming = evaluateWaterfrontAuctionTiming;
window.getGoldRetentionFactor = getGoldRetentionFactor;
window.evaluateTurnActions = evaluateTurnActions;
window.formatActionEvaluationSummary = formatActionEvaluationSummary;
window.inspectBotActionEvaluation = inspectBotActionEvaluation;
window.resolveBotTurnExecution = resolveBotTurnExecution;
window.USE_STRATEGIC_AI = USE_STRATEGIC_AI;
window.USE_STRATEGIC_FULL_BOTS = USE_STRATEGIC_FULL_BOTS;
window.setStrategicFullBotsEnabled = setStrategicFullBotsEnabled;
window.USE_STRATEGIC_GRAN_GRAN = USE_STRATEGIC_GRAN_GRAN;
window.setStrategicGranGranEnabled = setStrategicGranGranEnabled;
window.AI_DEPTH_FEATURES = AI_DEPTH_FEATURES;
window.getAiDepthFeatures = getAiDepthFeatures;
window.chooseLowLuxuryCandidate = chooseLowLuxuryCandidate;
window.__strategicBotDecisionHistory = [];
window.MAR_A_LAGO_TIEBREAK_PREMIUM_AU = MAR_A_LAGO_TIEBREAK_PREMIUM_AU;
window.REROLL_RESOURCE_COST_PRESTIGE_EQ = REROLL_RESOURCE_COST_PRESTIGE_EQ;
window.REROLL_ACQUISITION_VALUE_PRESTIGE_EQ = REROLL_ACQUISITION_VALUE_PRESTIGE_EQ;
window.PLAYER_COUNT_DENIAL_FACTOR = PLAYER_COUNT_DENIAL_FACTOR;
window.LUXURY_REROLL_SUCCESS_RATE = LUXURY_REROLL_SUCCESS_RATE;
window.getLuxuryAttemptSuccessRate = getLuxuryAttemptSuccessRate;
window.evaluateVisibleLuxuryMarket = evaluateVisibleLuxuryMarket;
window.calculateStrategicAuctionBidCeiling = calculateStrategicAuctionBidCeiling;
window.evaluateStrategicAuctionBid = evaluateStrategicAuctionBid;
window.shouldBotUseMapReroll = shouldBotUseMapReroll;
window.resolveStrategicLuxuryRerollDecision = resolveStrategicLuxuryRerollDecision;
window.evaluateWaterfrontAdvanceReadiness = evaluateWaterfrontAdvanceReadiness;
window.evaluatePostAuctionLuxuryPlan = evaluatePostAuctionLuxuryPlan;
window.getLuxuryRerollReserve = getLuxuryRerollReserve;
window.STRATEGIC_PERSONALITY_PROFILES = STRATEGIC_PERSONALITY_PROFILES;
window.getStrategicPersonality = getStrategicPersonality;
window.getStrategicPersonalityProfile = getStrategicPersonalityProfile;
window.getAuctionUrgencyPersonalityStrength = getAuctionUrgencyPersonalityStrength;
window.MAP_PERSONALITY_PROFILES = MAP_PERSONALITY_PROFILES;
window.getMapRegion = getMapRegion;
window.getMapPersonalityPrestigeEq = getMapPersonalityPrestigeEq;
window.calculateMapRepetitionPenalty = calculateMapRepetitionPenalty;
window.evaluateBlockBonusOpportunity = evaluateBlockBonusOpportunity;
window.PUBLIC_LANDMARK_GROUPS = PUBLIC_LANDMARK_GROUPS;
window.getLandmarkGroup = getLandmarkGroup;
window.evaluateLandmarkOpportunity = evaluateLandmarkOpportunity;
window.__lastBotActionEvaluation = null;
window.__botActionEvaluationHistory = [];

// Phase 5E.3a: Bot Reroll Telemetry
window.__botRerollHistory = __botRerollHistory;
window.recordBotReroll = recordBotReroll;
window.clearBotRerollHistory = clearBotRerollHistory;
window.inspectBotRerollHistory = inspectBotRerollHistory;

// --- LIVE BOT MAP DECISION DEBUG CAPTURE ---
window.__lastBotMapDecision = null;
window.__botMapDecisionHistory = [];
window.inspectLastBotMapDecision = function() {
    console.log("[LAST BOT MAP DECISION]", window.__lastBotMapDecision);
    return window.__lastBotMapDecision;
};
window.inspectBotMapDecisionHistory = function() {
    console.log("[BOT MAP DECISION HISTORY] (Total entries: " + window.__botMapDecisionHistory.length + ")", window.__botMapDecisionHistory);
    return window.__botMapDecisionHistory;
};

// --- LIVE BOT LUXURY DECISION DEBUG CAPTURE ---
window.__lastBotLuxuryDecision = null;
window.__botLuxuryDecisionHistory = [];
window.inspectLastBotLuxuryDecision = function() {
    console.log("[LAST BOT LUXURY DECISION]", window.__lastBotLuxuryDecision);
    return window.__lastBotLuxuryDecision;
};
window.inspectBotLuxuryDecisionHistory = function() {
    console.log("[BOT LUXURY DECISION HISTORY] (Total entries: " + window.__botLuxuryDecisionHistory.length + ")", window.__botLuxuryDecisionHistory);
    return window.__botLuxuryDecisionHistory;
};

// --- LIVE BOT AUCTION DECISION DEBUG CAPTURE ---
window.__lastBotAuctionDecision = null;
window.__botAuctionDecisionHistory = [];
window.inspectLastBotAuctionDecision = function() {
    console.log("[LAST BOT AUCTION DECISION]", window.__lastBotAuctionDecision);
    return window.__lastBotAuctionDecision;
};
window.inspectBotAuctionDecisionHistory = function() {
    console.log("[BOT AUCTION DECISION HISTORY] (Total entries: " + window.__botAuctionDecisionHistory.length + ")", window.__botAuctionDecisionHistory);
    return window.__botAuctionDecisionHistory;
};

// --- PHASE 5B.5 / 5B.6 / 5B.7 / 5B.8 / 5B.9: GRAN GRAN SHADOW MODE INSTRUMENTATION & HELPERS ---
window.compareLegacyAndStrategicDecision = compareLegacyAndStrategicDecision;
window.__lastGranGranShadowDecision = null;
window.__granGranShadowHistory = [];

window.inspectGranGranShadowHistory = function() {
    const history = window.__granGranShadowHistory || [];
    console.group(`[GRAN GRAN SHADOW HISTORY] (Total entries: ${history.length})`);
    console.table(history.map(h => ({
        index: h.decisionIndex !== undefined ? h.decisionIndex : '-',
        turn: h.turnCount,
        mode: h.executionMode || 'LEGACY',
        classification: h.classification,
        agreement: h.agreement ? '✔ AGREE' : '✘ DISAGREE',
        diff: h.utilityDifference !== null && h.utilityDifference !== undefined ? Number(h.utilityDifference).toFixed(4) : '-',
        auRetention: h.strategicContextSummary?.auRetentionFactor !== undefined ? h.strategicContextSummary.auRetentionFactor : '-',
        postReserve: h.strategicContextSummary?.postAuctionReserveAu !== undefined ? h.strategicContextSummary.postAuctionReserveAu : '-',
        winLock: h.endgameWinLock?.canLockWin ? `YES (${h.endgameWinLock.currentOutcome})` : (h.endgameWinLock?.applicable ? `NO (${h.endgameWinLock.reason})` : '-'),
        legacyAction: `${h.legacy.action} (${h.legacy.targetId !== null ? h.legacy.targetId : 'N/A'}${h.legacy.utility !== null && h.legacy.utility !== undefined ? ` @ ${h.legacy.utility}` : ''})`,
        strategicAction: `${h.strategic.action} (${h.strategic.targetId !== null ? h.strategic.targetId : 'N/A'})`,
        strategicUtility: h.strategic.utility,
        executed: `${h.executedAction || '-'} (${h.executedTargetId !== null && h.executedTargetId !== undefined ? h.executedTargetId : '-'})`,
        fallback: h.usedFallback ? `YES (${h.fallbackReason})` : 'NO',
        setupEV: h.bestMap?.expectedSetupPrestigeEq !== undefined ? h.bestMap.expectedSetupPrestigeEq : '-',
        reason: h.legacy.reason
    })));
    console.log("Raw History Array:", history);
    console.groupEnd();
    return history;
};

window.summarizeGranGranShadowHistory = function() {
    const history = window.__granGranShadowHistory || [];
    const totalDecisions = history.length;
    let agreements = 0;
    let equivalentMapTies = 0;
    let closeDecisions = 0;
    let disagreements = 0;
    let mapVsLuxuryDisagreements = 0;
    let differentMapTargets = 0;
    let differentLuxuryPiles = 0;
    let noComparisonCount = 0;
    let legacyMapCount = 0;
    let legacyLuxuryCount = 0;
    let strategicMapCount = 0;
    let strategicLuxuryCount = 0;
    let strategicExecutionCount = 0;
    let legacyExecutionCount = 0;
    let fallbackCount = 0;
    let winLockCount = 0;

    history.forEach(entry => {
        if (entry.agreement || entry.classification === "AGREE") {
            agreements++;
        } else if (entry.classification !== "NO_COMPARISON") {
            disagreements++;
        }

        if (entry.classification === "EQUIVALENT_MAP_TIE") {
            equivalentMapTies++;
        } else if (entry.classification === "CLOSE_DECISION") {
            closeDecisions++;
        } else if (entry.classification === "DISAGREE_MAP_VS_LUXURY") {
            mapVsLuxuryDisagreements++;
        } else if (entry.classification === "DISAGREE_MAP_TARGET") {
            differentMapTargets++;
        } else if (entry.classification === "DISAGREE_LUXURY_PILE") {
            differentLuxuryPiles++;
        } else if (entry.classification === "NO_COMPARISON") {
            noComparisonCount++;
        }

        if (entry.legacy?.action === "MAP") legacyMapCount++;
        if (entry.legacy?.action === "BUY_LUXURY") legacyLuxuryCount++;
        if (entry.strategic?.action === "MAP") strategicMapCount++;
        if (entry.strategic?.action === "BUY_LUXURY") strategicLuxuryCount++;

        if (entry.executionMode === "STRATEGIC") strategicExecutionCount++;
        else legacyExecutionCount++;
        if (entry.usedFallback) fallbackCount++;
        if (entry.endgameWinLock?.canLockWin) winLockCount++;
    });

    const meaningfulDisagreementCount = mapVsLuxuryDisagreements + differentMapTargets + differentLuxuryPiles;
    const meaningfulDisagreements = meaningfulDisagreementCount;

    const agreementRate = totalDecisions > 0
        ? ((agreements / totalDecisions) * 100).toFixed(1) + "%"
        : "0.0%";

    const summary = {
        totalDecisions,
        agreements,
        equivalentMapTies,
        closeDecisions,
        disagreements,
        meaningfulDisagreementCount,
        meaningfulDisagreements,
        agreementRate,
        mapVsLuxuryDisagreements,
        differentMapTargets,
        differentLuxuryPiles,
        noComparisonCount,
        legacyMapCount,
        legacyLuxuryCount,
        strategicMapCount,
        strategicLuxuryCount,
        strategicExecutionCount,
        legacyExecutionCount,
        fallbackCount,
        winLockCount
    };

    console.group(`[GRAN GRAN SHADOW SUMMARY] (${totalDecisions} Decisions Recorded)`);
    console.log(`Agreement Rate:             ${agreementRate} (${agreements}/${totalDecisions})`);
    console.log(`Total Agreements:           ${agreements}`);
    console.log(`Equivalent Map Ties:        ${equivalentMapTies}`);
    console.log(`Close Decisions:            ${closeDecisions}`);
    console.log(`Total Disagreements:        ${disagreements}`);
    console.log(`Meaningful Disagreements:   ${meaningfulDisagreementCount}`);
    console.log(`  - Map vs Luxury:          ${mapVsLuxuryDisagreements}`);
    console.log(`  - Different Map Target:   ${differentMapTargets}`);
    console.log(`  - Different Luxury Pile:  ${differentLuxuryPiles}`);
    console.log(`No-Comparison Count:        ${noComparisonCount}`);
    console.log(`Legacy Choices:             Map: ${legacyMapCount} | Luxury: ${legacyLuxuryCount}`);
    console.log(`Strategic Choices:          Map: ${strategicMapCount} | Luxury: ${strategicLuxuryCount}`);
    console.log(`Execution Mode Breakdown:   STRATEGIC: ${strategicExecutionCount} | LEGACY: ${legacyExecutionCount} (Fallbacks: ${fallbackCount})`);
    console.log(`Endgame Win-Locks:          ${winLockCount}`);
    console.groupEnd();

    return summary;
};

window.inspectGranGranShadowDisagreements = function() {
    const history = window.__granGranShadowHistory || [];
    const disagreements = history.filter(h => !h.agreement && h.classification !== "NO_COMPARISON");
    console.group(`[GRAN GRAN SHADOW DISAGREEMENTS] (${disagreements.length} entries)`);
    console.table(disagreements.map(h => ({
        index: h.decisionIndex !== undefined ? h.decisionIndex : '-',
        turn: h.turnCount,
        classification: h.classification,
        diff: h.utilityDifference !== null && h.utilityDifference !== undefined ? Number(h.utilityDifference).toFixed(4) : '-',
        auRetention: h.strategicContextSummary?.auRetentionFactor !== undefined ? h.strategicContextSummary.auRetentionFactor : '-',
        legacy: `${h.legacy.action} -> ${h.legacy.targetId !== null ? h.legacy.targetId : 'N/A'}${h.legacy.utility !== null && h.legacy.utility !== undefined ? ` (Util: ${h.legacy.utility})` : ''} (${h.legacy.reason || ''})`,
        strategic: `${h.strategic.action} -> ${h.strategic.targetId !== null ? h.strategic.targetId : 'N/A'} (Util: ${h.strategic.utility})`,
        bestMap: h.bestMap ? `${h.bestMap.cellId} (Util: ${h.bestMap.utility?.toFixed(2)}${h.bestMap.expectedSetupPrestigeEq !== undefined ? `, Setup: ${h.bestMap.expectedSetupPrestigeEq.toFixed(2)}` : ''})` : 'None',
        bestLuxury: h.bestLuxury ? `Deck ${h.bestLuxury.deckId} (Util: ${h.bestLuxury.utility?.toFixed(2)})` : 'None'
    })));
    console.log("Full Disagreement Objects:", disagreements);
    console.groupEnd();
    return disagreements;
};

window.clearGranGranShadowHistory = function() {
    window.__granGranShadowHistory = [];
    window.__lastGranGranShadowDecision = null;
    console.log("[GRAN GRAN SHADOW] History and last decision cleared.");
    return [];
};

window.exportGranGranShadowHistory = function() {
    const history = window.__granGranShadowHistory || [];
    const jsonStr = JSON.stringify(history, null, 2);
    console.log("[GRAN GRAN SHADOW] Exported JSON representation:", jsonStr);
    return jsonStr;
};

// --- GLOBAL TIMING GOVERNORS & HELPERS ---
window.getAnimationDelay = function(baseMs, eventType = 'general') {
    const speed = window.state?.settings?.animationSpeed || 3;

    // Explicit Event Type Overrides
    if (eventType === 'flip') {
        if (speed === 1) return 0;
        if (speed === 2) return 80;
        if (speed === 3) return 140;
        return 250;
    }
    if (eventType === 'flight') {
        if (speed === 1) return 50;
        if (speed === 2) return 180;
        if (speed === 3) return 350;
        return 700;
    }
    if (eventType === 'burst') {
        if (speed === 1) return 100;
        if (speed === 2) return 300;
        if (speed === 3) return 500;
        return 1000;
    }
    if (eventType === 'auction') {
        if (speed === 1) return 50;
        if (speed === 2) return 150;
        if (speed === 3) return 350;
        return 1000;
    }

    // General gameplay animation multiplier
    if (speed === 1) return Math.max(25, Math.round(baseMs * 0.10));
    if (speed === 2) return Math.max(25, Math.round(baseMs * 0.45));
    if (speed === 3) return Math.max(25, Math.round(baseMs * 0.70));
    return Math.round(baseMs * 1.0);
};

window.getBotTurnDelay = function() {
    const speed = window.state?.settings?.botTurnSpeed || 3;
    if (speed === 1) return 0;
    if (speed === 2) return 100;
    if (speed === 3) return 250;
    return 500;
};

export function getBotAuctionDelay() {
    const speed = window.state?.settings?.botTurnSpeed || 3;
    if (speed === 1) return 100;
    if (speed === 2) return 250;
    if (speed === 3) return 450;
    return 750;
}
window.getBotAuctionDelay = getBotAuctionDelay;

window.getDiceDuration = function() {
    const speed = window.state?.settings?.diceSpeed || 3;
    if (speed === 1) return 50;
    if (speed === 2) return 150;
    if (speed === 3) return 300;
    return 600;
};

export function getLandmarkInfoDuration() {
    const durationSetting = window.state?.settings?.landmarkDisplayDuration || 2;
    if (durationSetting === 1) return 700;
    if (durationSetting === 3) return 3000;
    return 1400;
}
window.getLandmarkInfoDuration = getLandmarkInfoDuration;

// Legacy getDelay routing for unmapped callers
window.getDelay = function(baseMs, type = 'logic') {
    if (type === 'bot_auction' || type === 'auction_bot') {
        return window.getBotAuctionDelay();
    }
    if (type === 'bot' || type === 'thinking') {
        return window.getBotTurnDelay();
    }
    if (type === 'dice') {
        return window.getDiceDuration();
    }
    if (type === 'visual' || type === 'burst') {
        return window.getAnimationDelay(baseMs, 'burst');
    }
    if (type === 'auction') {
        return window.getAnimationDelay(baseMs, 'auction');
    }
    if (type === 'flight') {
        return window.getAnimationDelay(baseMs, 'flight');
    }
    if (type === 'flip') {
        return window.getAnimationDelay(baseMs, 'flip');
    }
    return window.getAnimationDelay(baseMs, 'general');
};

export function applySpeedCSS() {
    const animSpeed = window.state?.settings?.animationSpeed || 3;
    const diceSpeed = window.state?.settings?.diceSpeed || 3;
    
    let styleEl = document.getElementById('speed-override-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'speed-override-style';
        document.head.appendChild(styleEl);
    }

    const flipDurations = { 1: '0ms', 2: '80ms', 3: '140ms', 4: '250ms' };
    const flightDurations = { 1: '50ms', 2: '180ms', 3: '350ms', 4: '700ms' };
    const burstDurations = { 1: '100ms', 2: '300ms', 3: '500ms', 4: '1000ms' };
    const diceDurations = { 1: '50ms', 2: '150ms', 3: '300ms', 4: '600ms' };

    const flipDuration = flipDurations[animSpeed] || '140ms';
    const flightDuration = flightDurations[animSpeed] || '350ms';
    const burstDuration = burstDurations[animSpeed] || '500ms';
    const diceDuration = diceDurations[diceSpeed] || '300ms';

    styleEl.innerHTML = `
        /* 1. Card flip duration */
        .flipper {
            transition-duration: ${flipDuration} !important;
        }

        /* 2. Custom flight speeds for luxury cards zooming across the screen */
        .flying-card, .transition-all, .transition-transform:not([class*="hover\\:"]) {
            transition-duration: ${flightDuration} !important;
        }

        /* 3. Custom burst speeds for gold values (+5, +3) to lock-step with JS timers */
        .animate-burst, .animate-burst-gold {
            animation-duration: ${burstDuration} !important;
        }
        
        /* 4. Speed up dice */
        .animate-dice-spin, .cube.spinning {
            animation-duration: ${diceDuration} !important;
        }

        /* 5. PROTECT IDLE PHYSICS & HOVER LIFTS: Always normal speed */
        [class*="hover\\:-translate-y"], [class*="hover\\:scale"], button, .btn, .animate-pulse, .v2-slider {
            transition-duration: 300ms !important;
        }

        /* 6. PROTECT BOARD IDLE ANIMATIONS (Wave & Shimmer) */
        .wave-anim {
            animation-duration: 0.8s !important;
            transition-duration: 200ms !important;
        }
        .shimmer-active::after {
            animation-duration: 1.5s !important;
        }
        .bonus-pop {
            transition-duration: 200ms !important;
        }
    `;
}

// Native audio fallback for ultra-fast startup clicks before WebAudio context initializes
const uiClickUrl = new URL(/* @vite-ignore */ '../assets/audio/boca_click5.ogg', import.meta.url).href;
const nativeClickAudio = new Audio(uiClickUrl);
nativeClickAudio.volume = 0.6;

// Safe Exit Flag (Top Level Global)
window.isSafeExit = false;

// Expose Game/UI functions globally for Debug/God Mode (prevents circular dependencies)
window.updateUI = updateUI;
window.updateCardVisuals = updateCardVisuals;
window.triggerAuction = triggerAuction;
window.startTurnCycle = startTurnCycle;
window.SaveManager = SaveManager;
window.checkLineBonuses = checkLineBonuses;
window.handleGambit2Step10Progress = handleGambit2Step10Progress;

// Helper function for shuffling arrays
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function isLevelUnlocked(level) {
    if (level === 1) return true;
    const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
    if (isDemo && level > 4) return false;

    if (!state || !state.playerProfile || !Array.isArray(state.playerProfile.clearedGambits)) {
        return false;
    }

    const cleared = state.playerProfile.clearedGambits;
    const prevLevel = level - 1;
    const startId = (prevLevel - 1) * 5 + 1;
    const endId = prevLevel * 5;
    
    let clearedCount = 0;
    for (let id = startId; id <= endId; id++) {
        if (cleared.includes(id)) {
            clearedCount++;
        }
    }
    return clearedCount >= 4;
}

function isGambitUnlocked(gambitId) {
    const level = Math.ceil(gambitId / 5);
    return isLevelUnlocked(level);
}

// Electron Native Zoom Configuration
function configureGameWindow() {
    if (GameConfig.isElectron) {
        // DISABLED: Native Electron zoom conflicts with CSS-based incremental scaling
        // The initAutoZoom() function now handles all scaling for both web and Electron
        // using CSS transforms with stepped breakpoints (1.0, 0.95, 0.90, 0.85, 0.80)

        /* ORIGINAL CODE - Disabled to allow CSS scaling:
        try {
            const { webFrame } = window.require('electron');

            const applyZoom = () => {
                const MIN_WIDTH = 1440;
                const MIN_HEIGHT = 840;

                // Calculate scale ratio based on minimum requirements
                const scale = Math.min(
                    window.innerWidth / MIN_WIDTH,
                    window.innerHeight / MIN_HEIGHT
                );

                // Cap scale at 1.0 to prevent upscaling artifacts on large screens
                // (Game is optimized for 1440p but should scale down for smaller laptops)
                webFrame.setZoomFactor(Math.min(scale, 1.0));
            };

            // Apply immediately on load
            applyZoom();

            // Re-calculate on window resize
            window.addEventListener('resize', applyZoom);

            console.log("[Electron] Native Zoom Configured");
        } catch (e) {
            console.warn("Failed to configure Electron game window:", e);
        }
        */

        console.log("[Electron] Using CSS-based incremental scaling");
    }
}

// Define app object
// Web Party Edition: one card of the Support Us popup (heading, text, optional badge, link button)
function buildSupportOfferCard(offer) {
    const card = document.createElement('div');
    // The main offer (Kickstarter) is the larger card; the other one is smaller.
    card.className = `${offer.main ? 'flex-[3]' : 'flex-[2]'} flex flex-col items-center text-center rounded-3xl border-4 bg-white/5 p-12`;
    card.style.borderColor = offer.accent;

    const heading = document.createElement('h3');
    heading.className = 'text-[52px] font-black uppercase tracking-wider text-white font-overpass leading-tight mb-6';
    heading.textContent = offer.heading;
    card.appendChild(heading);

    if (offer.text) {
        const text = document.createElement('p');
        text.className = 'text-[40px] font-light text-white/85 font-overpass leading-snug mb-8';
        text.textContent = offer.text;
        card.appendChild(text);
    }

    if (offer.badge) {
        // Plain colored text on purpose: a filled pill would look like a second button
        const badge = document.createElement('div');
        badge.className = 'text-[40px] font-black uppercase tracking-wider font-overpass leading-tight mb-10';
        badge.style.color = offer.accent;
        badge.textContent = offer.badge;
        card.appendChild(badge);
    }

    // A real link that opens in a new tab (noopener: the new page cannot control this one)
    const link = document.createElement('a');
    link.href = offer.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'mt-auto w-full h-[120px] flex items-center justify-center rounded-full text-[42px] font-black uppercase text-black font-overpass hover:scale-105 transition-transform cursor-pointer no-underline';
    if (offer.main) {
        // The only solid button in the popup
        link.style.backgroundColor = offer.accent;
    } else {
        link.style.backgroundColor = 'transparent';
        link.style.border = `4px solid ${offer.accent}`;
        link.style.color = '#ffffff';
    }
    link.textContent = offer.buttonLabel;
    card.appendChild(link);

    if (offer.extraLink && offer.extraHref) {
        // A plain text link under the button (not a button)
        const extra = document.createElement('a');
        extra.href = offer.extraHref;
        extra.target = '_blank';
        extra.rel = 'noopener noreferrer';
        extra.className = 'mt-8 text-[36px] font-light text-white/85 hover:text-white underline font-overpass cursor-pointer';
        extra.textContent = offer.extraLink.label;
        card.appendChild(extra);
    }

    return card;
}

const app = {
    selectedGambitId: null,
    runTutorialStep,
    startTurnCycle,
    showGambitObjectivesModal,
    closeGambitObjectivesModal,
    showObjectiveImpossibleModal,
    closeObjectiveImpossibleModal,
    quitFromImpossibleObjective,
    showGambitBrief: () => showGambitObjectivesModal(false),
    closeGambitBrief: () => closeGambitObjectivesModal(),
    showCompendium,
    closeCompendium,
    setCompendiumTab,
    dismissLandmarkDossier,
    showLandmarkDossier,
    showResignModal,
    closeResignModal,
    showAbout,
    closeAbout,
    confirmResign,
    setCompendiumMenuState,
    renderPropertyCompendium,
    selectPropertyItem,
    handleGambitAction: (isWin) => {
        const performAction = () => {
            state.isGameOver = false;
            const gameOverScreen = document.getElementById('game-over-screen');
            if (gameOverScreen) {
                gameOverScreen.classList.add('hidden');
                gameOverScreen.innerHTML = '';
            }
            
            // If not a gambit, just go back to setup or hub
            if (!state.activeGambitId) {
                app.goToSetupV2();
                return;
            }

            // Web Party Edition: the tutorial chains Gambits 1-4 (retry / next lesson / finish), no campaign screens
            if (GameConfig.isWeb) {
                app.advanceWebTutorial(isWin);
                return;
            }

            if (isWin) {
                const currentId = state.activeGambitId;
                const currentLevel = Math.ceil(currentId / 5);
                const levelStart = (currentLevel - 1) * 5 + 1;
                const levelEnd = currentLevel * 5;
                
                const cleared = (state.playerProfile && Array.isArray(state.playerProfile.clearedGambits))
                    ? state.playerProfile.clearedGambits
                    : [];

                // Count completed Gambits in current level
                let clearedCountInLevel = 0;
                for (let id = levelStart; id <= levelEnd; id++) {
                    if (cleared.includes(id)) {
                        clearedCountInLevel++;
                    }
                }

                let nextId = null;

                if (clearedCountInLevel < 5) {
                    // A. Fewer than 5 completed in current level: find next unsolved within current level
                    // 1. Search forward numerically from current Gambit
                    for (let id = currentId + 1; id <= levelEnd; id++) {
                        if (!cleared.includes(id)) {
                            nextId = id;
                            break;
                        }
                    }
                    // 2. Wrap around to the beginning of current level if needed
                    if (nextId === null) {
                        for (let id = levelStart; id < currentId; id++) {
                            if (!cleared.includes(id)) {
                                nextId = id;
                                break;
                            }
                        }
                    }
                    // Fallback to current if all in level are somehow cleared
                    if (nextId === null) {
                        nextId = currentId;
                    }

                    // If completing 4 of 5 unlocked the next level and its intro plate is pending,
                    // present the campaign plate while keeping nextId (remaining uncleared Gambit) queued as continuation
                    const nextLevel = currentLevel + 1;
                    const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
                    const isNextLevelValid = !isDemo || nextLevel <= 4;
                    if (nextLevel <= 10 && isNextLevelValid && isLevelUnlocked(nextLevel) && !state.playerProfile.seenGambitLevelIntros?.includes(nextLevel)) {
                        state.activeGambitId = nextId;
                        app.pendingNextGambitAction = () => {
                            app.selectGambitV2(nextId);
                        };
                        app.goToGambitsV2();
                        return;
                    }
                } else {
                    // B. Completed all 5 of 5 in current level: advance to first Gambit of next level
                    const nextLevel = currentLevel + 1;
                    const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;

                    if (isDemo && nextLevel > 4) {
                        // Demo completed!
                        app.goToGambitsV2();
                        setTimeout(() => { if (app.showStartPromoModal) app.showStartPromoModal(); }, 500);
                        return;
                    }

                    const firstGambitNextLevel = (nextLevel - 1) * 5 + 1;
                    const maxGambits = (typeof GAMBIT_CAMPAIGN !== 'undefined' && Array.isArray(GAMBIT_CAMPAIGN)) 
                        ? GAMBIT_CAMPAIGN.length 
                        : 50;

                    if (firstGambitNextLevel > maxGambits) {
                        // Campaign completed!
                        app.goToGambitsV2();
                        return;
                    }

                    nextId = firstGambitNextLevel;
                    state.activeGambitId = nextId;

                    // If newly unlocked level intro is pending, store continuation and navigate to campaign to present the plate first
                    if (nextLevel <= 10 && !state.playerProfile.seenGambitLevelIntros?.includes(nextLevel)) {
                        app.pendingNextGambitAction = () => {
                            app.selectGambitV2(firstGambitNextLevel);
                        };
                        app.goToGambitsV2();
                        return;
                    }
                }

                state.activeGambitId = nextId;
            }
            app.selectGambitV2(state.activeGambitId);
            app.startGambit();
        };

        const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
        if (isDemo && app.showPromoModal) {
            app.showPromoModal(performAction);
            return;
        }

        performAction();
    },
    startGame: (isGambit = false) => {
        state.isGameOver = false;

        // Web Party Edition: a custom match always runs the party rules (Red Reef, 2-4 humans, no visitors)
        if (GameConfig.isWeb && !isGambit) {
            state.activeGambitId = null;
            app.enforceWebPartyRules();
        }
        audioMgr.startGameMusic();
        
        // Ensure cinematic winner overlay is hidden and reset
        const overlay = document.getElementById('cinematic-winner-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            const victoryTitle = document.getElementById('cinematic-victory-title');
            const cardContainer = document.getElementById('cinematic-winner-card-container');
            const btnEl = document.getElementById('cinematic-see-results-btn');
            if (victoryTitle) victoryTitle.classList.remove('bounce-in-top');
            if (cardContainer) cardContainer.classList.remove('swirl-in-right-fwd');
            if (btnEl) btnEl.classList.remove('bounce-in-top');
        }

        // Clean up scatter classes
        const leftSidebar = document.getElementById('left-sidebar');
        const rightSidebar = document.getElementById('right-sidebar');
        if (leftSidebar) {
            leftSidebar.classList.remove('scatter-left');
        }
        if (rightSidebar) {
            rightSidebar.classList.remove('scatter-right');
        }

        // Track stats
        if (state.stats) {
            state.stats.totalGamesPlayed++;
            if (!state.activeGambitId) {
                if (window.AchievementManager) {
                    window.AchievementManager.unlock('PLAY_FIRST_CUSTOM_MATCH');
                    if (state.config.humans === 4) {
                        window.AchievementManager.unlock('FOUR_PLAYER_LOCAL_MATCH');
                    }
                }
            }
            saveProfile();
        }

        // Always show Game UI immediately
        const gameUI = document.getElementById('game-ui');
        if (gameUI) {
            gameUI.style.display = ''; // Clear inline 'none'
            gameUI.classList.remove('opacity-0', 'pointer-events-none');
            gameUI.style.opacity = '1';
            gameUI.style.pointerEvents = 'auto';
        }

        // Hide V2 Hub
        const v2Container = document.getElementById('ui-v2-container');
        if (v2Container) {
            v2Container.style.display = 'none';
        }
        
        startGame(); // Call the legacy game.js function
    },
    buyLuxury,
    handleFlip,

    showConfrontationModal: () => {
        if (state.activeGambitId === 1 || state.activeGambitId === 2 || state.activeGambitId === 3 || state.activeGambitId === 4) {
            startTurnCycle();
            return;
        }
        showGambitObjectivesModal(true);
    },

    enterGame: () => {
        console.log("enterGame called");
        // 1. Immediate UI Transition (Don't wait for Audio)
        document.body.classList.remove('bg-black');
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('opacity-0');
            splash.classList.add('pointer-events-none');
        }
        
        // V2 Switcheroo: Show V2 Hub instead of Legacy Start Screen
        const v2Container = document.getElementById('ui-v2-container');
        if (v2Container) {
            v2Container.style.display = 'flex';
            v2Container.classList.add('active');
            // Ensure Hub is the active panel
            app.goToMainHub();
        }

        // 2. Audio Initialization (Async/Safe)
        if (typeof audioMgr !== 'undefined' && audioMgr.init) {
            // First sync engine with loaded state
            app.syncAudioWithSettings();
            
            audioMgr.init().then(() => {
                // Re-sync after init to ensure context-dependent gains are set
                app.syncAudioWithSettings();
                if (audioMgr.startBGM) audioMgr.startBGM('title_theme');
            }).catch(e => console.warn("Audio Init Warning:", e));
        } else {
            console.warn("Audio Manager not available.");
        }

        // Initialize Quit Button for Electron (Start Screen & Pause Menu)
        if (GameConfig.isElectron) {
            const quitBtns = ['btn-quit-desktop', 'btn-start-quit'];
            quitBtns.forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.classList.remove('hidden');
            });
        }

        // Fix: Explicitly bind Return to Title button (Inline onclick failing in Electron)
        const returnBtn = document.getElementById('btn-return-title');
        if (returnBtn) {
            // Remove old listeners to prevent duplicates if enterGame is called multiple times
            const newBtn = returnBtn.cloneNode(true);
            returnBtn.parentNode.replaceChild(newBtn, returnBtn);
            newBtn.addEventListener('click', () => {
                console.log("Explicit Click Listener Fired");
                app.exitToTitle();
            });
        }

        // Initial Sync of Settings UI
        app.syncSettingsUI();

        // Force resize to ensure AutoZoom calculates correctly for the new 4K stage
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 150);
    },

    setMusicVolume: async (val) => {
        const volume = val / 100;
        if (state.settings) {
            state.settings.musicVolume = volume;
            if (state.settings.isMuted) {
                state.settings.isMuted = false;
                if (audioMgr && audioMgr.setMusicMuted) audioMgr.setMusicMuted(false);
            }
        }
        if (audioMgr && audioMgr.setMusicVolume) audioMgr.setMusicVolume(volume);
        app.syncSettingsUI(); // Sync other sliders
        saveProfile(); // Persist to file
    },

    setSfxVolume: async (val) => {
        const volume = val / 100;
        if (state.settings) {
            state.settings.sfxVolume = volume;
            if (state.settings.isSfxMuted) {
                state.settings.isSfxMuted = false;
                if (audioMgr && audioMgr.setSfxMuted) audioMgr.setSfxMuted(false);
            }
        }
        if (audioMgr && audioMgr.setSfxVolume) audioMgr.setSfxVolume(volume);
        app.syncSettingsUI(); // Sync other sliders
        saveProfile(); // Persist to file
    },


    isMatchActive: () => {
        if (!window.state) return false;
        if (state.mode === 'HUB' || state.mode === 'SETUP' || state.mode === 'GAMBITS' || state.mode === 'GAME_OVER' || state.mode === 'TITLE') {
            return false;
        }
        return true;
    },

    openGodMode: () => {
        if (state.godMode) {
            Debug.toggleGodMode();
            app.togglePause(); // Close menu
        }
    },



    togglePause: () => {
        app.toggleSettings();
    },

    toggleConcierge: () => {
        app.toggleSettings();
    },

    toggleSettings: (event) => {
        if (event && event.target && event.target.id !== 'unified-settings-modal' && event.target.closest('#unified-settings-inner')) {
            return;
        }
        const modal = document.getElementById('unified-settings-modal');
        if (!modal) return;
        const isHidden = modal.classList.contains('hidden');
        
        // Detect if Compendium overlay is active
        const compModal = document.getElementById('compendium-modal');
        const isCompOpen = compModal && !compModal.classList.contains('hidden');

        if (isHidden) {
            modal.classList.remove('hidden');
            state.paused = true;
            app.syncSettingsUI(); 

            const inner = document.getElementById('unified-settings-inner');
            if (inner) {
                inner.style.transform = `scale(${state.zoom || 1.0})`;
                inner.classList.add('animate-pop-in');
                inner.addEventListener('animationend', () => {
                    inner.classList.remove('animate-pop-in');
                }, { once: true });
            }
            
            // Context Sensitive Button Logic
            const btn = document.getElementById('settings-quit-btn');
            if (btn) {
                if (app.isMatchActive()) {
                    btn.innerText = 'LEAVE MATCH';
                    btn.style.display = 'block';
                } else {
                    btn.innerText = 'QUIT TO DESKTOP';
                    // Web Party Edition: a browser tab has no desktop to quit to
                    btn.style.display = GameConfig.isWeb ? 'none' : 'block';
                }
            }
        } else {
            modal.classList.add('hidden');
            state.paused = false;
        }
    },

    handleSettingsExit: () => {
        const modal = document.getElementById('unified-settings-modal');
        if (modal) modal.classList.add('hidden'); // Hide Settings panel

        if (app.isMatchActive()) {
            app.showAbortMatchModal();
        } else {
            const compModal = document.getElementById('compendium-modal');
            const isCompOpen = compModal && !compModal.classList.contains('hidden');
            if (isCompOpen) app.closeCompendium();
            app.quitToDesktop();
        }
    },

    showAbortMatchModal: () => {
        const modal = document.getElementById('abort-match-modal');
        if (modal) {
            const inner = document.getElementById('abort-match-inner');
            if (inner) {
                inner.style.transform = `scale(${state.zoom || 1.0})`;
                inner.classList.add('animate-pop-in');
                inner.addEventListener('animationend', () => {
                    inner.classList.remove('animate-pop-in');
                }, { once: true });
            }
            modal.classList.remove('hidden');
        }
    },

    closeAbortMatchModal: () => {
        const modal = document.getElementById('abort-match-modal');
        if (modal) modal.classList.add('hidden');
        state.paused = false;
    },

    confirmAbortMatch: () => {
        app.closeAbortMatchModal();
        state.paused = false;
        state.isGameOver = false;

        // Contextual Destinations on Confirmation (YES, I'M SURE)
        if (state.activeGambitId) {
            // From Gambit Match: Bypasses Game Over screen and returns directly to Gambit Select Screen
            app.handleGambitExit();
        } else {
            // From Custom Board Game Match: Bypasses Game Over screen and returns directly to Custom Setup Screen
            app.handleCustomMatchExit('SETUP');
        }
    },

    showTutorialRecommendedModal: () => {
        const modal = document.getElementById('tutorial-recommended-modal');
        if (modal) {
            const cb = document.getElementById('dont-show-tutorial-cb');
            if (cb) cb.checked = false;
            const inner = document.getElementById('tutorial-recommended-inner');
            if (inner) {
                inner.style.transform = `scale(${state.zoom || 1.0})`;
                inner.classList.add('animate-pop-in');
                inner.addEventListener('animationend', () => {
                    inner.classList.remove('animate-pop-in');
                }, { once: true });
            }
            modal.classList.remove('hidden');
        }
    },

    closeTutorialRecommendedModal: () => {
        const modal = document.getElementById('tutorial-recommended-modal');
        if (modal) modal.classList.add('hidden');
    },

    confirmTutorialRecommended: () => {
        const cb = document.getElementById('dont-show-tutorial-cb');
        if (cb && cb.checked) {
            localStorage.setItem('palmBeachDontShowTutorialRecommended', 'true');
        }
        app.closeTutorialRecommendedModal();
        app.goToSetupV2(true);
    },

    showLevelUnlockedPopup: (nextLevel, currentLevel) => {
        const modal = document.getElementById('level-unlocked-modal');
        if (!modal) return;

        const titleEl = document.getElementById('level-unlocked-title');
        const descEl = document.getElementById('level-unlocked-desc');
        if (titleEl) titleEl.innerText = `LEVEL ${nextLevel} UNLOCKED`;
        if (descEl) descEl.innerText = `You completed 4 of 5 Gambits in Level ${currentLevel}.`;

        const inner = document.getElementById('level-unlocked-inner');
        if (inner) {
            inner.style.transform = `scale(${state.zoom || 1.0})`;
            inner.classList.add('animate-pop-in');
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
        modal.classList.remove('hidden');
    },

    closeLevelUnlockedPopup: () => {
        const modal = document.getElementById('level-unlocked-modal');
        if (modal) modal.classList.add('hidden');
    },

    showGambitLevelPlate: (level, isAutoIntro = false) => {
        const info = GAMBIT_LEVEL_INFO.find(i => i.level === level) || GAMBIT_LEVEL_INFO[0];
        const modal = document.getElementById('gambit-level-modal');
        const inner = document.getElementById('gambit-level-plate-inner');
        if (!modal || !inner) return;

        const isUnlocked = isLevelUnlocked(level);
        const cleared = state.playerProfile?.clearedGambits || [];
        const isCompleted = [1, 2, 3, 4, 5].every(c => cleared.includes((level - 1) * 5 + c));

        // Badges Status
        let badgeHtml = '';
        if (!isUnlocked) {
            badgeHtml = '<span class="ml-5 px-5 py-2 rounded-full bg-red-500/30 border border-red-400/50 text-red-300 text-[26px] font-black uppercase tracking-wider font-overpass">LOCKED</span>';
        } else if (isCompleted) {
            badgeHtml = '<span class="ml-5 px-5 py-2 rounded-full bg-emerald-500/30 border border-emerald-400/50 text-emerald-300 text-[26px] font-black uppercase tracking-wider font-overpass">COMPLETED</span>';
        } else {
            badgeHtml = '<span class="ml-5 px-5 py-2 rounded-full bg-[#F3C80D]/30 border border-[#F3C80D]/50 text-[#F3C80D] text-[26px] font-black uppercase tracking-wider font-overpass">UNLOCKED</span>';
        }

        // Lock Description
        let lockMessageHtml = '';
        if (!isUnlocked) {
            lockMessageHtml = `<div class="mt-4 py-2.5 px-6 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 font-bold text-[28px] uppercase tracking-wider font-overpass inline-block">Complete 4 of 5 Gambits in Level ${level - 1} to unlock.</div>`;
        }

        // Cards Section: Data-driven from info.locals and info.visitors
        const localsList = info.locals || [];
        const visitorsList = (level === 10) ? [] : (info.visitors || []);

        let cardsSectionHtml = '';
        if (localsList.length > 0 && visitorsList.length > 0) {
            cardsSectionHtml = `
                <div class="border-t border-white/10 pt-6 pb-6 my-2 w-full flex flex-col items-center">
                    <div class="text-[36px] font-black text-white/80 uppercase tracking-[0.15em] mb-6 text-center font-overpass">NEW THIS LEVEL</div>
                    <div class="flex items-start justify-center gap-20 w-full">
                        <!-- Locals Column -->
                        <div class="flex flex-col items-center">
                            <div class="text-[30px] font-bold text-white/70 uppercase tracking-widest mb-4 font-overpass text-center">${localsList.length > 1 ? 'LOCALS' : 'LOCAL'}</div>
                            <div class="flex items-center justify-center gap-6">
                                ${localsList.map(name => renderCompendiumCharacterCard(name, { disableClick: true, disableHoverScale: true })).join('')}
                            </div>
                        </div>
                        <!-- Visitors Column -->
                        <div class="flex flex-col items-center">
                            <div class="text-[30px] font-bold text-white/70 uppercase tracking-widest mb-4 font-overpass text-center">${visitorsList.length > 1 ? 'VISITORS' : 'VISITOR'}</div>
                            <div class="flex items-center justify-center gap-6">
                                ${visitorsList.map(name => renderCompendiumVisitorCard(name, { disableClick: true, disableHoverScale: true })).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (localsList.length > 0) {
            cardsSectionHtml = `
                <div class="border-t border-white/10 pt-6 pb-6 my-2 w-full flex flex-col items-center">
                    <div class="text-[36px] font-black text-white/80 uppercase tracking-[0.15em] mb-6 text-center font-overpass">NEW THIS LEVEL</div>
                    <div class="flex items-start justify-center w-full">
                        <!-- Locals Column Centered -->
                        <div class="flex flex-col items-center">
                            <div class="text-[30px] font-bold text-white/70 uppercase tracking-widest mb-4 font-overpass text-center">${localsList.length > 1 ? 'LOCALS' : 'LOCAL'}</div>
                            <div class="flex items-center justify-center gap-6">
                                ${localsList.map(name => renderCompendiumCharacterCard(name, { disableClick: true, disableHoverScale: true })).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else if (visitorsList.length > 0) {
            cardsSectionHtml = `
                <div class="border-t border-white/10 pt-6 pb-6 my-2 w-full flex flex-col items-center">
                    <div class="text-[36px] font-black text-white/80 uppercase tracking-[0.15em] mb-6 text-center font-overpass">NEW THIS LEVEL</div>
                    <div class="flex items-start justify-center w-full">
                        <!-- Visitors Column Centered -->
                        <div class="flex flex-col items-center">
                            <div class="text-[30px] font-bold text-white/70 uppercase tracking-widest mb-4 font-overpass text-center">${visitorsList.length > 1 ? 'VISITORS' : 'VISITOR'}</div>
                            <div class="flex items-center justify-center gap-6">
                                ${visitorsList.map(name => renderCompendiumVisitorCard(name, { disableClick: true, disableHoverScale: true })).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Bullets & Tags
        const bulletsHtml = info.expect.map(e => `
            <li class="flex items-start gap-4">
                <span class="text-[#F3C80D] font-black text-[34px] leading-none mt-1 shrink-0">•</span>
                <span class="leading-snug">${e}</span>
            </li>
        `).join('');

        const tagsHtml = info.setupTags.map(t => `
            <span class="px-5 py-2 rounded-xl bg-white/10 border border-white/20 text-white/80 font-overpass font-bold text-[28px] uppercase tracking-wider whitespace-nowrap">${t}</span>
        `).join('');

        // Action Buttons
        let ctaHtml = '';
        if (level === 1) {
            ctaHtml = `
                <button onclick="app.startFromGambitLevelPlate(1)" class="btn-v2-glossy px-12 py-4 text-[32px] font-black uppercase text-black bg-[#F3C80D] rounded-full hover:scale-105 transition-transform cursor-pointer shadow-[0_0_25px_rgba(243,200,13,0.5)] font-overpass">
                    ${info.primaryCta || 'START GAMBIT 1'} →
                </button>
            `;
        } else {
            ctaHtml = `
                <button onclick="app.closeGambitLevelPlate()" class="btn-v2-glossy px-10 py-3.5 text-[28px] font-black uppercase text-white bg-white/10 border border-white/30 rounded-full hover:bg-white/20 hover:scale-105 transition-all cursor-pointer font-overpass">
                    CONTINUE
                </button>
            `;
        }

        inner.innerHTML = `
            <!-- Top Header & Close -->
            <div class="flex items-start justify-between w-full mb-4">
                <div class="flex-1 mr-8">
                    <div class="flex items-center">
                        <h2 class="text-[60px] font-black font-overpass text-white uppercase tracking-widest leading-none drop-shadow-md">
                            LEVEL ${level}
                        </h2>
                        ${badgeHtml}
                    </div>
                    <div class="text-[40px] font-light text-white/90 font-overpass leading-relaxed mt-4 max-w-[1550px]">
                        ${info.body}
                    </div>
                    ${lockMessageHtml}
                </div>
                <button id="btn-close-level-plate" onclick="app.closeGambitLevelPlate()" class="flex items-center gap-3 text-white/80 hover:text-[#F3C80D] transition-colors cursor-pointer pt-2 shrink-0 group">
                    <svg class="w-12 h-12 pointer-events-none transition-transform group-hover:rotate-90" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                    <span class="font-overpass font-black text-[36px] uppercase tracking-widest pointer-events-none">CLOSE</span>
                </button>
            </div>

            <!-- New Characters / Visuals (Dominant Card Center) -->
            ${cardsSectionHtml}

            <!-- Expectations & Setup Tags (Lower Secondary Section) -->
            <div class="border-t border-white/10 pt-6 pb-4 grid grid-cols-2 gap-16 w-full">
                <div>
                    <div class="text-[32px] font-black text-[#F3C80D] uppercase tracking-wider mb-4 font-overpass">EXPECT:</div>
                    <ul class="space-y-4 text-[34px] font-light text-white/90 font-overpass leading-relaxed">
                        ${bulletsHtml}
                    </ul>
                </div>
                <div>
                    <div class="text-[32px] font-black text-white/90 uppercase tracking-wider mb-4 font-overpass">SETUP:</div>
                    <div class="flex flex-wrap gap-3.5">
                        ${tagsHtml}
                    </div>
                </div>
            </div>

            <!-- Footer / Action Row -->
            <div class="border-t border-white/10 pt-6 mt-2 flex items-center justify-between w-full">
                <div class="text-[28px] font-light text-white/60 uppercase tracking-wider font-overpass">
                    ${info.footer}
                </div>
                <div>
                    ${ctaHtml}
                </div>
            </div>
        `;

        modal.classList.remove('hidden');
        inner.style.transform = `scale(${state.zoom || 1.0})`;
        if (inner.classList) inner.classList.add('animate-pop-in');
        if (typeof inner.addEventListener === 'function') {
            inner.addEventListener('animationend', () => {
                if (inner.classList) inner.classList.remove('animate-pop-in');
            }, { once: true });
        }

        // Mark as seen only after successful presentation in the DOM
        if (isAutoIntro) {
            if (!state.playerProfile.seenGambitLevelIntros) {
                state.playerProfile.seenGambitLevelIntros = [];
            }
            if (!state.playerProfile.seenGambitLevelIntros.includes(level)) {
                state.playerProfile.seenGambitLevelIntros.push(level);
                saveProfile();
            }
        }
    },

    closeGambitLevelPlate: (event) => {
        if (event && event.target && event.target.id !== 'gambit-level-modal' && event.target.id !== 'btn-close-level-plate' && !event.target.closest('#btn-close-level-plate')) {
            return;
        }
        const modal = document.getElementById('gambit-level-modal');
        if (modal) modal.classList.add('hidden');

        if (app.pendingLevel1OnboardingCue) {
            state.onboardingCueGambit1 = true;
            app.pendingLevel1OnboardingCue = false;
            app.renderGambitGridV2();
        }

        if (app.pendingNextGambitAction) {
            const action = app.pendingNextGambitAction;
            app.pendingNextGambitAction = null;
            action();
        }
    },

    startFromGambitLevelPlate: (gambitId) => {
        app.pendingLevel1OnboardingCue = false;
        state.onboardingCueGambit1 = false;
        const modal = document.getElementById('gambit-level-modal');
        if (modal) modal.classList.add('hidden');
        app.selectGambitV2(gambitId);
    },

    // Sync all Settings UI elements
    syncSettingsUI: () => {
        if (!state.settings) return;

        // 1. Volumes
        const musVol = Math.round(state.settings.musicVolume * 100);
        const sfxVol = Math.round(state.settings.sfxVolume * 100);

        const uMusic = document.getElementById('unified-music-vol');
        if (uMusic) uMusic.value = musVol;

        const uSfx = document.getElementById('unified-sfx-vol');
        if (uSfx) uSfx.value = sfxVol;

        // 2. Mute Checkboxes
        const isMusicMuted = state.settings.isMuted;
        const isSfxMuted = state.settings.isSfxMuted;
        
        const musicUnified = document.getElementById('unified-music-mute');
        if (musicUnified) musicUnified.checked = isMusicMuted;

        const sfxUnified = document.getElementById('unified-sfx-mute');
        if (sfxUnified) sfxUnified.checked = isSfxMuted;

        // 4. Fullscreen
        const fullscreenUnified = document.getElementById('unified-fullscreen');
        if (fullscreenUnified) fullscreenUnified.checked = !!document.fullscreenElement;

        // 5. Game Pacing Sliders
        const animEl = document.getElementById('setting-anim-speed');
        if (animEl) animEl.value = state.settings.animationSpeed || 3;

        const botEl = document.getElementById('setting-bot-speed');
        if (botEl) botEl.value = state.settings.botTurnSpeed || 3;

        const diceEl = document.getElementById('setting-dice-speed');
        if (diceEl) diceEl.value = state.settings.diceSpeed || 3;

        // 6. Landmark Settings
        app.updateLandmarkSettingsUI();
    },

    // Sync Audio Engine with State Settings
    syncAudioWithSettings: () => {
        if (!state.settings || !audioMgr) return;
        
        audioMgr.setMusicVolume(state.settings.musicVolume);
        audioMgr.setSfxVolume(state.settings.sfxVolume);
        
        audioMgr.setMusicMuted(!!state.settings.isMuted);
        audioMgr.setSfxMuted(!!state.settings.isSfxMuted);
        
        console.log("[Audio] Synced engine with loaded settings");
    },

    setAnimationSpeed: (val) => {
        state.settings.animationSpeed = parseInt(val, 10);
        applySpeedCSS();
        saveProfile();
    },

    setBotTurnSpeed: (val) => {
        state.settings.botTurnSpeed = parseInt(val, 10);
        saveProfile();
    },

    setDiceSpeed: (val) => {
        state.settings.diceSpeed = parseInt(val, 10);
        applySpeedCSS();
        saveProfile();
    },

    setLandmarkManualClose: (checked) => {
        state.settings.landmarkManualClose = !!checked;
        app.updateLandmarkSettingsUI();
        saveProfile();
    },

    setLandmarkDisplayDuration: (val) => {
        state.settings.landmarkDisplayDuration = parseInt(val, 10);
        app.updateLandmarkSettingsUI();
        saveProfile();
    },

    updateLandmarkSettingsUI: () => {
        const manualCheck = document.getElementById('setting-landmark-manual-close');
        if (manualCheck) manualCheck.checked = !!state.settings.landmarkManualClose;

        const isManual = !!state.settings.landmarkManualClose;
        const durationContainer = document.getElementById('setting-landmark-duration-container');
        if (durationContainer) {
            if (isManual) {
                durationContainer.classList.add('opacity-40', 'pointer-events-none', 'grayscale');
            } else {
                durationContainer.classList.remove('opacity-40', 'pointer-events-none', 'grayscale');
            }
        }

        const duration = state.settings.landmarkDisplayDuration || 2;
        [1, 2, 3].forEach(d => {
            const btn = document.getElementById(`landmark-duration-btn-${d}`);
            if (btn) {
                if (d === duration) {
                    btn.classList.add('bg-[#F3C80D]', 'text-[#26385C]', 'font-black');
                    btn.classList.remove('bg-white/10', 'text-white', 'font-normal');
                } else {
                    btn.classList.remove('bg-[#F3C80D]', 'text-[#26385C]', 'font-black');
                    btn.classList.add('bg-white/10', 'text-white', 'font-normal');
                }
            }
        });
    },

    // Legacy fallback
    setGameSpeed: (val) => {
        const speed = parseInt(val, 10);
        state.settings.animationSpeed = speed;
        state.settings.botTurnSpeed = speed;
        state.settings.diceSpeed = speed;
        applySpeedCSS();
        saveProfile();
    },

    // Consolidated Audio Update Logic
    updateAudioConfig: (musicMute, sfxMute) => {
        if (state.settings) {
            state.settings.isMuted = !!musicMute;
            state.settings.isSfxMuted = !!sfxMute;
        }

        // Apply directly to Engine
        if (audioMgr) {
            audioMgr.setMusicMuted(!!musicMute);
            audioMgr.setSfxMuted(!!sfxMute);
        }

        app.syncSettingsUI();
        saveProfile();
    },

    updateAudioFromPauseMenu: () => {
        const musicMute = document.getElementById('pause-check-music').checked;
        const sfxMute = document.getElementById('pause-check-sfx').checked;
        app.updateAudioConfig(musicMute, sfxMute);
    },

    updateAudioFromStartScreen: () => {
        const musicMute = document.getElementById('start-check-music').checked;
        const sfxMute = document.getElementById('start-check-sfx').checked;
        app.updateAudioConfig(musicMute, sfxMute);
    },

    toggleFullScreen: () => {
        console.log("[UI] toggleFullScreen triggered. isElectron:", GameConfig.isElectron);
        
        if (GameConfig.isElectron) {
            try {
                // Try multiple ways to get require for Electron
                const requireFunc = window.require || (window.top && window.top.require);
                
                if (requireFunc) {
                    const electron = requireFunc('electron');
                    const ipc = electron.ipcRenderer || (electron.default && electron.default.ipcRenderer);
                    
                    if (ipc) {
                        console.log("[Electron] Sending app:toggle-fullscreen IPC");
                        ipc.send('app:toggle-fullscreen');
                        return; // Exit if IPC sent successfully
                    }
                }
            } catch (e) {
                console.warn("[Electron] IPC Fullscreen toggle attempt failed:", e);
            }
        }
        
        // Fallback for Web (Standard Fullscreen API)
        console.log("[Web] Using standard Fullscreen API fallback");
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`[Web] Fullscreen request failed: ${err.message}`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    },

    setBoardZoom: (val) => {
        const wrapper = document.getElementById('game-scale-wrapper');
        const board = document.getElementById('board-wrapper');
        const gameOverScreen = document.getElementById('game-over-content');
        const galleryScale = document.getElementById('gallery-scale-wrapper');
        const compendiumScale = document.getElementById('compendium-scale-wrapper');

        // Scale the new 4K board wrapper
        if (board) {
            state.zoom = val; // Sync state for animations
            // Web Party Edition: center the board vertically when the window is taller than the 16:9 canvas
            const offsetY = GameConfig.isWeb ? webBoardOffsetY(window.innerHeight, val) : 0;
            board.style.transform = offsetY > 0 ? `translateY(${offsetY}px) scale(${val})` : `scale(${val})`;
        }

        if (galleryScale) galleryScale.style.transform = `scale(${val})`;
        if (compendiumScale) compendiumScale.style.transform = `scale(${val})`;
        if (gameOverScreen) gameOverScreen.style.transform = `scale(${val})`;
        
        const draftScale = document.getElementById('draft-scale-wrapper');
        if (draftScale) draftScale.style.transform = `scale(${val})`;
        
        const messageInner = document.getElementById('message-inner');
        if (messageInner) messageInner.style.transform = `scale(${val})`;
        
        const v2Content = document.getElementById('ui-v2-content');
        if (v2Content) v2Content.style.transform = `scale(${val})`;

        const settingsScale = document.getElementById('unified-settings-inner');
        if (settingsScale) settingsScale.style.transform = `scale(${val})`;

        const gambitObjInner = document.getElementById('gambit-objective-inner');
        if (gambitObjInner) gambitObjInner.style.transform = `scale(${val})`;

        const objImpossibleInner = document.getElementById('objective-impossible-inner');
        if (objImpossibleInner) objImpossibleInner.style.transform = `scale(${val})`;

        const resignInner = document.getElementById('resign-inner');
        if (resignInner) resignInner.style.transform = `scale(${val})`;

        const abortInner = document.getElementById('abort-match-inner');
        if (abortInner) abortInner.style.transform = `scale(${val})`;

        const aboutInner = document.getElementById('about-inner');
        if (aboutInner) aboutInner.style.transform = `scale(${val})`;

        // Web Party Edition: keep the Support Us popup scaled with the window
        if (GameConfig.isWeb) {
            const supportInner = document.getElementById('support-inner');
            if (supportInner) supportInner.style.transform = `scale(${val})`;
        }

        const promoInner = document.getElementById('promo-inner');
        if (promoInner) promoInner.style.transform = `scale(${val})`;

        const v2AbilityInner = document.getElementById('v2-ability-inner');
        if (v2AbilityInner) v2AbilityInner.style.transform = `scale(${val})`;

        const g1IntroInner = document.getElementById('g1-intro-inner');
        if (g1IntroInner) g1IntroInner.style.transform = `scale(${val})`;

        const g4PopupInner = document.getElementById('g4-popup-inner');
        if (g4PopupInner) g4PopupInner.style.transform = `scale(${val})`;

        const tutorialToast = document.getElementById('tutorial-toast');
        if (tutorialToast) tutorialToast.style.transform = `scale(${val})`;

        const startPromoInner = document.getElementById('start-promo-inner');
        if (startPromoInner) startPromoInner.style.transform = `scale(${val})`;

        const gambitLevelPlateInner = document.getElementById('gambit-level-plate-inner');
        if (gambitLevelPlateInner) gambitLevelPlateInner.style.transform = `scale(${val})`;

        const display = Math.round(val * 100) + '%';
        const el1 = document.getElementById('zoom-val');
        const el2 = document.getElementById('pause-zoom-val');
        if (el1) el1.innerText = display;
        if (el2) el2.innerText = display;

        // Sync Sliders
        const slider1 = document.getElementById('board-zoom');
        const slider2 = document.getElementById('pause-board-zoom');
        if (slider1 && slider1.value != val) slider1.value = val;
        if (slider2 && slider2.value != val) slider2.value = val;
    },

    openGallery: () => {
        if (app.openCharacterGallery) {
            app.openCharacterGallery();
        }
    },

    closeGallery: () => {
        const gallery = document.getElementById('gallery-modal');
        if (gallery) gallery.classList.add('hidden');
    },

    // Updated to open Rulebook via Settings
    openRulebook: () => {
        const modal = document.getElementById('rulebook-modal');
        if (modal) modal.classList.remove('hidden');
        // Close settings if open
        const settings = document.getElementById('pause-menu');
        if (settings && !settings.classList.contains('hidden')) settings.classList.add('hidden');
    },

    closeRulebook: () => {
        const modal = document.getElementById('rulebook-modal');
        if (modal) modal.classList.add('hidden');
    },

    triggerGameOver: (winnerName) => {
        document.body.classList.remove('bg-black');

        const modal = document.getElementById('message-modal');
        const title = document.getElementById('msg-title');
        const body = document.getElementById('msg-body');
        const actions = document.getElementById('msg-actions');

        modal.classList.remove('hidden');
        title.innerText = "GAME OVER";
        title.classList.add('text-[#DA795A]');

        body.innerHTML = `<span class="text-4xl text-white block mb-4">${winnerName} Wins!</span>`;

        actions.innerHTML = `
            <button onclick="app.exitToTitle()" class="w-full py-4 bg-[#DA795A] hover:bg-[#C0684A] text-black font-black text-xl uppercase rounded shadow-lg">Play Again</button>
            <button onclick="app.exitToTitle()" class="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold uppercase rounded border border-slate-500 mt-2">Exit to Title</button>
        `;

        audioMgr.stopBGM();
        audioMgr.play('win_jingle');
    },

    showConfirmation: (title, message, onConfirm) => {
        const modal = document.getElementById('message-modal');
        const titleEl = document.getElementById('msg-title');
        const bodyEl = document.getElementById('msg-body');
        const actionsEl = document.getElementById('msg-actions');

        if (!modal) return;

        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // Force flex
        modal.style.zIndex = '9999'; // Force top
        modal.style.pointerEvents = 'auto'; // Force clickable

        titleEl.innerText = title;
        bodyEl.innerHTML = message;

        const inner = document.getElementById('message-inner');
        if (inner) inner.style.transform = `scale(${state.zoom || 1.0})`;

        // Clear previous actions
        actionsEl.innerHTML = '';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = "text-[60px] font-black text-white font-overpass hover:text-[#F3C80D] transition-colors cursor-pointer bg-transparent border-none";
        cancelBtn.innerText = "CANCEL";
        cancelBtn.onclick = () => {
            modal.classList.add('hidden');
            modal.style.display = 'none'; // Clear force flex
            
            // UNPAUSE GAME IF CANCELLED
            if (window.state && window.state.paused) {
                window.state.paused = false;
                if (window.state.mode === 'AUCTION') {
                    if (window.auctionLoop) window.auctionLoop();
                } else if (window.state.mode === 'GAME' && !window.state.isProcessing) {
                    if (window.startTurnCycle) window.startTurnCycle();
                }
            }
        };

        const confirmBtn = document.createElement('button');
        confirmBtn.className = "text-[60px] font-black text-white font-overpass hover:text-red-500 transition-colors cursor-pointer bg-transparent border-none";
        confirmBtn.innerText = "YES, I'M SURE";
        confirmBtn.onclick = () => {
            modal.classList.add('hidden');
            modal.style.display = 'none'; // Clear force flex
            onConfirm();
        };

        actionsEl.appendChild(cancelBtn);
        actionsEl.appendChild(confirmBtn);
    },

    showMessage: (titleText, messageHtml, customButtonHtml = null) => {
        const modal = document.getElementById('message-modal');
        const titleEl = document.getElementById('msg-title');
        const bodyEl = document.getElementById('msg-body');
        const actionsEl = document.getElementById('msg-actions');

        if (!modal) return;

        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.style.zIndex = '9999';
        modal.style.pointerEvents = 'auto';

        if (titleEl) titleEl.innerText = titleText;
        if (bodyEl) bodyEl.innerHTML = messageHtml;
        if (actionsEl) {
            if (customButtonHtml) {
                if (typeof customButtonHtml === 'string' && !customButtonHtml.includes('<')) {
                    actionsEl.innerHTML = `<button onclick="app.closeMessageModal()" class="text-[60px] font-black text-white font-overpass hover:text-[#F3C80D] transition-colors cursor-pointer bg-transparent border-none uppercase tracking-widest drop-shadow-md">${customButtonHtml}</button>`;
                } else {
                    actionsEl.innerHTML = customButtonHtml;
                }
            } else {
                actionsEl.innerHTML = `<button onclick="app.closeMessageModal()" class="text-[60px] font-black text-white font-overpass hover:text-[#F3C80D] transition-colors cursor-pointer bg-transparent border-none uppercase tracking-widest drop-shadow-md">SPLENDID</button>`;
            }
        }
        
        const inner = document.getElementById('message-inner');
        if (inner) {
            inner.style.transform = `scale(${state.zoom || 1.0})`;
            inner.classList.add('animate-pop-in');
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
    },

    closeMessageModal: () => {
        const modal = document.getElementById('message-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
            modal.style.pointerEvents = 'none';
        }
    },

    showCustomMatchLockedModal: (message) => {
        audioMgr.play('error');
        app.showMessage("LOCKED", `<div class="text-white text-[28px] font-normal font-overpass">${message}</div>`);
    },

    pendingPromoAction: null,

    showPromoModal: (onConfirm) => {
        // Web Party Edition: no Kickstarter/Steam promo, continue straight to the pending action
        if (GameConfig.isWeb) {
            if (onConfirm) onConfirm(); else app.exitToTitle(true);
            return;
        }
        const modal = document.getElementById('promo-modal');
        if (!modal) return;

        app.pendingPromoAction = onConfirm || null;

        document.getElementById('promo-title').innerText = EXIT_PROMO.title;
        document.getElementById('promo-body').innerHTML = EXIT_PROMO.text;
        
        document.getElementById('promo-ks-img').src = EXIT_PROMO.kickstarter.image;
        document.getElementById('promo-ks-link').href = EXIT_PROMO.kickstarter.link;
        
        document.getElementById('promo-steam-img').src = EXIT_PROMO.steam.image;
        document.getElementById('promo-steam-link').href = EXIT_PROMO.steam.link;

        const confirmBtn = document.getElementById('promo-btn-confirm');
        if (confirmBtn) {
            confirmBtn.innerText = "CONTINUE";
            confirmBtn.onclick = () => {
                modal.classList.add('hidden');
                if (app.pendingPromoAction) {
                    const cb = app.pendingPromoAction;
                    app.pendingPromoAction = null;
                    cb();
                } else {
                    app.exitToTitle(true);
                }
            };
        }

        const inner = document.getElementById('promo-inner');
        if (inner) {
            inner.style.transform = `scale(${state.zoom || 1.0})`;
            inner.classList.add('animate-pop-in');
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }

        modal.classList.remove('hidden');
    },

    closePromoModal: () => {
        const modal = document.getElementById('promo-modal');
        if (modal) modal.classList.add('hidden');
        app.pendingPromoAction = null;
    },

    handleGambitExit: () => {
        const isGambit = !!state.activeGambitId;

        const performExit = () => {
            state.isGameOver = false;

            // 1. Hide Game Over Screen completely
            const gameOverScreen = document.getElementById('game-over-screen');
            if (gameOverScreen) {
                gameOverScreen.className = 'hidden';
                gameOverScreen.style.display = 'none';
                gameOverScreen.innerHTML = '';
            }

            // 2. Hide the Game UI
            const gameUI = document.getElementById('game-ui');
            if (gameUI) {
                gameUI.classList.add('opacity-0', 'pointer-events-none');
                gameUI.style.display = 'none';
            }

            // 3. Restore V2 Container
            const v2Container = document.getElementById('ui-v2-container');
            if (v2Container) {
                v2Container.style.display = 'flex';
                v2Container.classList.add('active');
            }

            // 4. Navigate
            if (isGambit) {
                // Web Party Edition: the tutorial returns to the party menu, there is no campaign screen
                if (GameConfig.isWeb) app.goToMainHub(); else app.goToGambitsV2();
            } else {
                if (app.exitToTitle) app.exitToTitle(false);
            }

            // 5. Cleanup
            state.activeGambitId = null;

            // 6. Force AutoZoom recalculation
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        };

        const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
        if (isDemo && app.showPromoModal) {
            app.showPromoModal(performExit);
            return;
        }

        performExit();
    },

    handleCustomMatchExit: (destination) => {
        const performExit = () => {
            state.isGameOver = false;

            // 1. Hide Game Over Screen completely
            const gameOverScreen = document.getElementById('game-over-screen');
            if (gameOverScreen) {
                gameOverScreen.className = 'hidden';
                gameOverScreen.style.display = 'none';
                gameOverScreen.innerHTML = '';
            }

            // 2. Hide the Game UI
            const gameUI = document.getElementById('game-ui');
            if (gameUI) {
                gameUI.classList.add('opacity-0', 'pointer-events-none');
                gameUI.style.display = 'none';
            }

            // 3. Restore V2 Container
            const v2Container = document.getElementById('ui-v2-container');
            if (v2Container) {
                v2Container.style.display = 'flex';
                v2Container.classList.add('active');
            }

            // 4. Navigate
            if (destination === 'SETUP') {
                app.goToSetupV2();
            } else {
                app.goToMainHub();
            }

            // 5. Force AutoZoom recalculation
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        };

        const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
        if (isDemo && app.showPromoModal) {
            app.showPromoModal(performExit);
            return;
        }

        performExit();
    },

    seamlessReturnToHub: () => {
        // 1. Stop audio
        if (window.audioMgr) window.audioMgr.stopBGM();
        
        // 2. Reset Game State
        if (window.state) {
            window.state.mode = 'HUB';
            window.state.players = [];
            window.state.gameStarted = false;
            window.state.activeGambitId = null;
            window.state.isProcessing = false;
            window.state.paused = false;
        }

        // 3. Hide all Game Modals
        const modals = ['rulebook-modal', 'gallery-modal', 'ability-modal', 'message-modal', 'god-mode-overlay', 'resign-modal', 'confrontation-modal', 'compendium-modal'];
        modals.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
                if (id === 'message-modal') el.style.display = 'none';
            }
        });

        const centralAuction = document.getElementById('central-auction-ui');
        if(centralAuction) centralAuction.classList.add('hidden');
        
        const diceOverlay = document.getElementById('dice-overlay');
        if(diceOverlay) diceOverlay.classList.add('hidden');

        // 4. Hide Game Board
        const gameUI = document.getElementById('game-ui');
        if (gameUI) {
            gameUI.classList.add('opacity-0', 'pointer-events-none');
            gameUI.style.display = 'none';
        }

        // 5. Hide Game Over Screen
        const gameOverScreen = document.getElementById('game-over-screen');
        if (gameOverScreen) {
            gameOverScreen.classList.add('hidden');
            gameOverScreen.style.display = 'none';
            gameOverScreen.innerHTML = '';
        }

        // 6. Restore V2 Container & Go to Hub
        const v2Container = document.getElementById('ui-v2-container');
        if (v2Container) {
            v2Container.style.display = 'flex';
            v2Container.classList.add('active');
        }

        // --- NEW: Restore the inner content div if the Compendium hid it! ---
        const v2Content = document.getElementById('ui-v2-content');
        if (v2Content) {
            v2Content.style.display = ''; // Clear inline display:none
        }
        
        app.goToMainHub();
        
        // Force resize calculation
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    },

    selectingBotForSlot: null,
    customBotSelection: [null, null, null],
    // Web Party Edition: party settings saved while the tutorial runs (the gambits overwrite them)
    webPartySnapshot: null,
    // Web Party Edition: small-window notice dismissed by the player, and the card previewed by a first tap
    webSizeHintDismissed: false,
    openDraftTapKey: null,
    openBotSelection: (slot) => {
        if (slot > state.config.bots) return;
        app.selectingBotForSlot = slot;
        app.showCompendium();
        app.setCompendiumTab('BOTS');
    },
    confirmBotSelection: (botId) => {
        if (!app.selectingBotForSlot) return;
        app.customBotSelection[app.selectingBotForSlot - 1] = botId;
        app.selectingBotForSlot = null;
        app.closeCompendium();
        app.updateSetupUI();
    },

    showCelebrationOverlay: (gambitId) => {
        const unlocks = window.UnlockManager ? window.UnlockManager.getUnlocksForGambit(gambitId) : [];
        if (unlocks.length === 0) {
            app.handleGambitExit();
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'celebration-overlay';
        overlay.className = "fixed inset-0 z-[9999] bg-blue-900/95 flex flex-col items-center justify-center font-overpass pointer-events-auto animate-pop-in";
        overlay.innerHTML = `
            <div class="flex flex-col items-center bg-[#26385C] border-[10px] border-[#F3C80D] p-20 rounded-[80px] shadow-[0_0_100px_rgba(243,200,13,0.5)] max-w-[1600px]">
                <div class="text-[#F3C80D] text-[120px] font-black uppercase mb-4 drop-shadow-2xl">UNLOCKED!</div>
                <div class="text-white text-[50px] font-black uppercase mb-12 opacity-80 tracking-widest">YOU CLEARED GAMBIT ${gambitId}</div>
                
                <div class="flex flex-wrap justify-center gap-10 mb-16">
                    ${unlocks.map(item => `
                        <div class="flex flex-col items-center p-10 bg-white/5 rounded-[40px] border-2 border-white/20 min-w-[400px]">
                            <div class="text-[#F3C80D] font-black text-[32px] uppercase tracking-[0.3em] mb-4">${item.type}</div>
                            <div class="text-white text-[56px] font-black text-center leading-none">${item.name}</div>
                        </div>
                    `).join('')}
                </div>

                <button onclick="document.getElementById('celebration-overlay').remove(); app.handleGambitExit();" class="btn-v2-glossy w-[800px] h-[150px] flex justify-center items-center text-[60px] font-black uppercase text-black bg-[#F3C80D] rounded-full hover:scale-110 transition-transform cursor-pointer">
                    RETURN TO CAMPAIGN
                </button>
            </div>
        `;
        document.body.appendChild(overlay);
    },

    // Web Party Edition: the Support Us popup. Opens only when the player clicks the button, never automatically.
    // Web Party Edition: start downloading the Support Us banner (once), e.g. when the button is hovered or touched
    preloadSupportBanner: () => {
        if (!GameConfig.isWeb) return;
        const banner = document.getElementById('support-banner');
        if (banner && !banner.getAttribute('src')) {
            banner.src = new URL(/* @vite-ignore */ '../assets/board_game_support_us.webp', import.meta.url).href;
        }
    },

    showSupportModal: () => {
        if (!GameConfig.isWeb) return;
        const modal = document.getElementById('support-modal');
        const list = document.getElementById('support-offers');
        if (!modal || !list) return;
        app.preloadSupportBanner();

        document.getElementById('support-title').innerText = SUPPORT_US.title;
        list.replaceChildren(...getVisibleSupportOffers().map(buildSupportOfferCard));

        const inner = document.getElementById('support-inner');
        if (inner) inner.style.transform = `scale(${state.zoom || 1.0})`;

        modal.classList.remove('hidden');
    },

    closeSupportModal: () => {
        const modal = document.getElementById('support-modal');
        if (modal) modal.classList.add('hidden');
    },

    showStartPromoModal: () => {
        // Web Party Edition: no Steam/Kickstarter start promo
        if (GameConfig.isWeb) return;
        const modal = document.getElementById('start-promo-modal');
        if (!modal) return;
        
        document.getElementById('start-promo-body').innerHTML = START_MENU_PROMO.text;
        document.getElementById('start-promo-steam-img').src = START_MENU_PROMO.steam.image;
        document.getElementById('start-promo-steam-link').href = START_MENU_PROMO.steam.link;
        
        const inner = document.getElementById('start-promo-inner');
        if (inner) inner.style.transform = `scale(${state.zoom || 1.0})`;
        
        modal.classList.remove('hidden');
    },

    exitToTitle: (skipConfirmation = false) => {

        // Auto-skip if in TUTORIAL mode
        if (state && state.mode === 'TUTORIAL') {
            console.log("Exiting TUTORIAL - Auto-skipping confirmation");
            skipConfirmation = true;
        }

        // Define reset logic: Use a hard reload to perfectly clear JS memory, intervals, and audio
        const executeReset = () => {
            sessionStorage.setItem('skipSplash', 'true');
            window.isSafeExit = true;
            window.location.reload();
        };

        // In JavaScript inline handlers, the first argument defaults to the Event object.
        if (skipConfirmation instanceof Event) {
            skipConfirmation = false;
        }

        // If skipping confirmation, instantly reload
        if (skipConfirmation === true) {
            console.log("Skipping confirmation for exitToTitle");
            executeReset();
            return;
        }

        // Otherwise show confirmation
        const pauseMenu = document.getElementById('pause-menu');
        if (pauseMenu) pauseMenu.classList.add('hidden'); // Ensure the pause menu doesn't block the visual modal

        app.showConfirmation(
            "TAKE ME BACK TO START SCREEN!",
            "Are you sure you want to quit the current game?",
            executeReset
        );
    },

    hardWipeSaveData: async () => {
        console.log("app.hardWipeSaveData() called");
        await SaveManager.hardWipeSaveData();
    },

    quitToDesktop: () => {
        const settingsModal = document.getElementById('unified-settings-modal');
        if (settingsModal) settingsModal.classList.add('hidden');

        app.showConfirmation(
            "QUIT TO DESKTOP?",
            "Are you sure you want to quit the game?",
            () => {
                const performQuit = () => {
                    try {
                        window.isSafeExit = true;
                        if (typeof window.require !== 'undefined') {
                            const { ipcRenderer } = window.require('electron');
                            ipcRenderer.send('app:quit');
                        } else {
                            window.close();
                        }
                    } catch (e) {
                        console.error("Quit failed:", e);
                    }
                };

                const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
                if (isDemo && app.showPromoModal) {
                    app.showPromoModal(performQuit);
                    return;
                }

                performQuit();
            }
        );
    },

    handleAuctionAction: (action, clickingPlayerId, amount = 1) => {
        const aa = state.activeAuction;
        if (!aa || !aa.participants || aa.turnIndex === undefined) return;

        const activePlayerId = aa.participants[aa.turnIndex];

        // Safety check if triggered via UI buttons
        if (clickingPlayerId === undefined) {
            // Verify it's a HUMAN turn and player exists
            const currentPlayer = state.players[activePlayerId];
            if (!currentPlayer || currentPlayer.type !== 'HUMAN') return;
        } else if (clickingPlayerId !== activePlayerId) {
            return; // Not your turn
        }

        if (action === 'pass') {
            audioMgr.play('fold');
            aa.participants = aa.participants.filter(id => id !== activePlayerId);
            aa.turnIndex--;
        } else {
            const player = state.players[activePlayerId];
            if (!player) return; // Guard clause

            if (player.gold < (aa.currentBid + amount)) {
                console.warn("Insufficient funds logic bypass attempted");
                return;
            }
            audioMgr.play('bid');
            aa.currentBid += amount;
            player.lastBid = aa.currentBid;
            aa.highestBidder = player;
        }

        rotateAuctionTurn();
        updateUI();
        auctionLoop();
    },

    playAuctionBonuses,
    animateAuctionWin,
    highlightBotButton,
    animateJaegaSetup,

    startDraftPhase: () => {
        state.mode = 'DRAFT';
        state.draftOrder = state.players.filter(p => p.type === 'HUMAN').map(p => p.id);
        state.isProcessing = false;

        const available = getPick2CandidatePool(state.activeGambitId, CHARACTERS, window.UnlockManager);

        // Store the dynamic pool
        state.draftAvailablePool = shuffle(available);
        state.currentDraftCandidates = [];

        document.getElementById('ui-v2-container').style.display = 'none';
        document.getElementById('game-ui').classList.remove('opacity-0', 'pointer-events-none');
        initPlayerCards();
        app.nextDraftTurn();
    },
    nextDraftTurn: () => {
        if (state.draftOrder.length === 0) {
            document.getElementById('draft-overlay').classList.add('hidden');
            assignBotCharacters(); 
            return;
        }
        
        // Peek at the current player without shifting the queue yet
        const playerId = state.draftOrder[0];
        const player = state.players[playerId];
        
        // Draw up to 2 cards from the pool
        state.currentDraftCandidates = drawPick2Candidates(state.draftAvailablePool);

        const overlay = document.getElementById('draft-overlay');
        const header = document.getElementById('draft-header');
        if (header) {
            header.innerText = `${player.name.toUpperCase()} IS DRAFTING`;
            header.className = "absolute top-[60px] left-1/2 -translate-x-1/2 text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass m-0 leading-none";
        }

        overlay.classList.remove('hidden');
        overlay.classList.add('flex', 'items-center', 'justify-center');

        const container = document.getElementById('draft-cards-container');

        container.innerHTML = state.currentDraftCandidates.map((char, i) => {
            const posX = (char.id % 5) * 25;
            const posY = Math.floor(char.id / 5) * 100;
            return `<div onclick="app.selectDraftCharacter(${playerId}, ${i})" class="draft-card v2-playing-card relative w-[650px] h-[1114px] rounded-[28px] shrink-0 hover:scale-[1.077] hover:z-[200] z-[10] cursor-pointer overflow-visible">
                 <div class="absolute inset-0 bg-no-repeat rounded-[28px]" style="background-image: url('${CHARACTER_SPRITE_PRINT_URL}'); background-size: 500% 200%; background-position: ${posX}% ${posY}%; z-index: 0;"></div>
            </div>`;
        }).join('');

        container.classList.remove('pointer-events-none');
    },
    selectDraftCharacter: (playerId, candidateIndex) => {
        if (state.isProcessing) return;
        state.isProcessing = true;

        const char = resolvePick2Selection(state, playerId, candidateIndex, finalizePlayerSetup, { recycleUnpicked: GameConfig.isWeb });

        app.animateDraftChoice(playerId, char.id, candidateIndex, () => {
            state.isProcessing = false;
            initPlayerCards(); 
            app.nextDraftTurn();
        });
    },
    animateDraftChoice: (playerId, charId, index, callback) => {
        const cardEls = document.querySelectorAll('.draft-card');
        const chosenEl = cardEls[index];
        if (!chosenEl) { callback(); return; }
        const rect = chosenEl.getBoundingClientRect();
        const flyer = document.createElement('div');
        flyer.className = 'draft-flyer v2-playing-card relative overflow-hidden rounded-[28px] w-[650px] h-[1114px]';
        flyer.innerHTML = chosenEl.innerHTML;
        flyer.style.position = 'fixed'; flyer.style.top = `${rect.top}px`; flyer.style.left = `${rect.left}px`; flyer.style.margin = '0';
        document.body.appendChild(flyer);
        const targetEl = document.getElementById(`player-card-${playerId}`);
        const targetRect = targetEl.getBoundingClientRect();
        requestAnimationFrame(() => {
            flyer.style.top = `${targetRect.top}px`; flyer.style.left = `${targetRect.left}px`; flyer.style.width = '100px'; flyer.style.height = '150px'; flyer.style.opacity = '0'; flyer.style.transform = 'scale(0.5)';
        });
        setTimeout(() => { flyer.remove(); callback(); }, 350);
    },

    startOpenDraft: () => {
        state.mode = 'OPEN_DRAFT';
        // ONLY Humans draft. Visitors are pre-selected in setup.
        state.draftOrder = state.players.filter(p => p.type === 'HUMAN').map(p => p.id);
        state.openDraftPool = [...CHARACTERS];
        state.openDraftTaken = {};
        state.isProcessing = false;

        // Ensure V2 UI is visible for the compendium
        document.getElementById('ui-v2-container').style.display = 'flex';
        // Hide the setup panel so it doesn't bleed through
        const setupPanel = document.getElementById('panel-2-setup');
        if (setupPanel) setupPanel.classList.add('hidden');

        app.showCompendium();

        // Hide regular compendium nav during draft
        const nav = document.querySelector('.compendium-nav');
        if (nav) nav.classList.add('hidden');

        // Hide back button during draft
        const backBtn = document.getElementById('compendium-back-btn');
        if (backBtn) backBtn.classList.add('hidden');

        app.nextOpenDraftTurn();
    },
    nextOpenDraftTurn: () => {
        if (state.draftOrder.length === 0) {
            app.selectingLocalForSlot = null; // Clear flag
            app.closeCompendium(true);
            
            // Restore nav
            const nav = document.querySelector('.compendium-nav');
            if (nav) nav.classList.remove('hidden');

            // Restore back button
            const backBtn = document.getElementById('compendium-back-btn');
            if (backBtn) backBtn.classList.remove('hidden');

            // Boot the game
            assignBotCharacters();
            return;
        }
        
        const playerId = state.draftOrder[0];
        const player = state.players.find(p => p.id === playerId);
        
        if (!player) {
            state.draftOrder.shift();
            app.nextOpenDraftTurn();
            return;
        }

        app.selectingLocalForSlot = playerId; // Set flag

        const header = document.getElementById('gallery-header');
        if (header) {
            header.innerText = `${player.name.toUpperCase()} IS DRAFTING`;
            header.className = "absolute top-[60px] left-1/2 -translate-x-1/2 text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass m-0 leading-none";
        }

        // Render the specialized Open Draft grid
        app.renderCharacterGrid(true, playerId);
    },

    handleOpenDraftPick: (charId) => {
        if (state.isProcessing) return; // Prevent double clicks

        // Only guard against double clicks for humans
        if (state.draftOrder.length > 0) {
            const currentPlayerId = state.draftOrder[0];
            const p = state.players.find(pl => pl.id === currentPlayerId);
            if (p && p.type === 'HUMAN') {
                state.isProcessing = true;
            }
        }

        const playerId = state.draftOrder.shift();
        const char = CHARACTERS.find(c => c.id === charId);
        state.players[playerId].character = char;
        state.openDraftTaken[charId] = { playerId };
        finalizePlayerSetup(state.players[playerId]);

        app.selectingLocalForSlot = null; // Clear flag
        app.nextOpenDraftTurn();

        // Release lock after short delay to prevent double-click race
        setTimeout(() => {
            state.isProcessing = false;
        }, 300);
    },

    setHumanCount: (count) => {
        // Web Party Edition: 2-4 human players, never any visitors
        if (GameConfig.isWeb) {
            state.config.humans = clampWebPlayers(count);
            state.config.bots = 0;
            app.updateSetupUI();
            return;
        }
        if (count > 4 && !GameConfig.isFullGame) {
            app.showStartPromoModal();
            return;
        }
        state.config.humans = count;

        // Cap total players at 4. If humans + bots > 4, reduce bots.
        if (state.config.humans + state.config.bots > 4) {
            state.config.bots = 4 - state.config.humans;
        }

        // Ensure 1-player is prevented (if humans is 1, bots must be at least 1)
        if (state.config.humans === 1 && state.config.bots === 0) {
            state.config.bots = 1;
        }

        app.updateSetupUI();
    },

    setBotCount: (count) => {
        // Web Party Edition has no visitors/AI opponents
        if (GameConfig.isWeb) return;
        state.config.bots = count;

        // Cap total players at 4. If humans + bots > 4, reduce humans.
        if (state.config.humans + state.config.bots > 4) {
            state.config.humans = 4 - state.config.bots;
            if (state.config.humans < 1) {
                state.config.humans = 1;
                state.config.bots = 3; // Force bots to 3 so total is 4 (1 human + 3 bots)
            }
        }

        // Ensure 1-player is prevented (if bots is 0, humans must be at least 2)
        if (state.config.bots === 0 && state.config.humans === 1) {
            state.config.humans = 2;
        }

        app.updateSetupUI();
    },

    setSetupMode: (mode) => {
        const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
        if (isPick2BlockedInDemo(mode, !isDemo, state.activeGambitId, GameConfig.isWeb)) {
            if (window.app.showStartPromoModal) window.app.showStartPromoModal();
            return;
        }

        const setupPanel = document.getElementById('panel-2-setup');
        const inSetupUI = setupPanel && !setupPanel.classList.contains('hidden');

        if (inSetupUI) {
            if (!window.UnlockManager.isDraftModeUnlocked(mode)) {
                const data = window.UnlockManager.getDraftModeData(mode);
                window.app.showCustomMatchLockedModal(`Clear Gambit ${data.unlockGambit} to unlock ${data.name}.`);
                return; // Abort selection
            }
        }

        state.config.setupMode = mode;
        if (inSetupUI) window.app.updateSetupUI();
    },
    updateSetupUI: () => {
        if (!window.UnlockManager) return;
        const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
        
        const lockHtml = (text) => `<div class="flex flex-col items-center justify-center gap-2"><svg class="w-16 h-16 text-white drop-shadow-2xl" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path></svg><span class="text-white text-[40px] font-black drop-shadow-2xl uppercase text-center leading-none">${text}</span></div>`;
        const galleryLockHtml = (text) => `<div class="flex flex-col items-center justify-center gap-2 pointer-events-none"><span class="text-white text-5xl mb-2 drop-shadow-lg">🔒</span><span class="text-white font-black text-[24px] tracking-widest text-center uppercase drop-shadow-md font-overpass leading-none">${text}</span></div>`;

        document.querySelectorAll('[data-variation]').forEach(el => {
            const key = el.getAttribute('data-variation');
            let isUnlocked = window.UnlockManager.isVariationUnlocked(key);
            let lockText = window.UnlockManager.getVariationData(key).unlockGambit;
            
            if (isDemo && key === 'MIZNER') {
                isUnlocked = false;
                lockText = "FULL VERSION";
            }

            const baseLockName = key.toLowerCase().replace('spanish', 'roxana').replace('red_reef', 'jaega').replace('mizner', 'tournament').replace('boca_raton', 'none');
            const lockV2 = document.getElementById(`v2-var-lock-${baseLockName}`);
            const lockV3 = document.getElementById(`v3-var-lock-${baseLockName}`);

            if (!isUnlocked) {
                if (key === 'MIZNER') {
                    el.classList.add('grayscale');
                    el.classList.remove('brightness-50');
                    if (lockV2) { lockV2.classList.remove('hidden'); lockV2.classList.remove('backdrop-blur-sm'); lockV2.innerHTML = galleryLockHtml(lockText); }
                    if (lockV3) { lockV3.classList.remove('hidden'); lockV3.classList.remove('backdrop-blur-sm'); lockV3.innerHTML = galleryLockHtml(lockText); }
                } else {
                    el.classList.add('grayscale', 'brightness-50');
                    if (lockV2) { lockV2.classList.remove('hidden'); lockV2.innerHTML = lockHtml(lockText); }
                    if (lockV3) { lockV3.classList.remove('hidden'); lockV3.innerHTML = lockHtml(lockText); }
                }
            } else {
                el.classList.remove('grayscale', 'brightness-50');
                if (lockV2) lockV2.classList.add('hidden');
                if (lockV3) lockV3.classList.add('hidden');
            }
        });

        document.querySelectorAll('[data-mode]').forEach(el => {
            const key = el.getAttribute('data-mode');
            let isUnlocked = window.UnlockManager.isDraftModeUnlocked(key);
            let lockText = window.UnlockManager.getDraftModeData(key).unlockGambit;

            if (isDemo && !GameConfig.isWeb && key === 'PICK_2') {
                isUnlocked = false;
                lockText = "FULL VERSION";
            }
            
            const baseLockName = key.toLowerCase().replace('pick_2', 'pair').replace('open_draft', 'open').replace('pre_selected', 'random');
            const lockV2 = document.getElementById(`v2-lock-${baseLockName}`);
            const lockV3 = document.getElementById(`v3-lock-${baseLockName}`);

            if (!isUnlocked) {
                if (key === 'PICK_2') {
                    el.classList.add('grayscale');
                    el.classList.remove('brightness-50');
                    if (lockV2) { lockV2.classList.remove('hidden'); lockV2.classList.remove('backdrop-blur-sm'); lockV2.innerHTML = galleryLockHtml(lockText); }
                    if (lockV3) { lockV3.classList.remove('hidden'); lockV3.classList.remove('backdrop-blur-sm'); lockV3.innerHTML = galleryLockHtml(lockText); }
                } else {
                    el.classList.add('grayscale', 'brightness-50');
                    if (lockV2) { lockV2.classList.remove('hidden'); lockV2.innerHTML = lockHtml(lockText); }
                    if (lockV3) { lockV3.classList.remove('hidden'); lockV3.innerHTML = lockHtml(lockText); }
                }
            } else {
                el.classList.remove('grayscale', 'brightness-50');
                if (key === 'OPEN_DRAFT') {
                    el.innerHTML = `<div id="v3-lock-open" class="hidden absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-[20px] z-10"></div>OPEN DRAFT`;
                }
                if (lockV2) lockV2.classList.add('hidden');
                if (lockV3) lockV3.classList.add('hidden');
            }
        });

        [1, 2, 3, 4].forEach(n => {
            const btnV3 = document.getElementById(`v3-human-${n}`);
            const inputV3 = document.getElementById(`v3-input-name-${n-1}`);
            if (btnV3 && inputV3) {
                const isDisabled = n > (4 - state.config.bots) || (state.config.bots === 0 && n === 1);
                
                if (isDisabled) {
                    btnV3.classList.add('grayscale', 'opacity-30', 'border-transparent', 'bg-white/5');
                    btnV3.classList.remove('border-[8px]', 'border-[#F3C80D]', 'shadow-[0_0_30px_rgba(243,200,13,0.5)]', 'opacity-100', 'border-4', 'border-white', 'border-white/30', 'opacity-50', 'bg-white/20', 'bg-[#F3C80D]/25', 'shadow-md', 'hover:border-white/60');
                } else if (state.config.humans === n) {
                    btnV3.classList.add('border-[8px]', 'border-[#F3C80D]', 'shadow-[0_0_30px_rgba(243,200,13,0.5)]', 'opacity-100', 'bg-[#F3C80D]/25');
                    btnV3.classList.remove('border-4', 'grayscale', 'opacity-30', 'opacity-50', 'border-transparent', 'border-white', 'border-white/30', 'bg-white/20', 'bg-white/5', 'hover:border-white/60');
                } else {
                    btnV3.classList.add('border-4', 'border-white/30', 'bg-white/20', 'shadow-md', 'opacity-100', 'hover:border-white/60');
                    btnV3.classList.remove('border-[8px]', 'border-[#F3C80D]', 'shadow-[0_0_30px_rgba(243,200,13,0.5)]', 'border-transparent', 'grayscale', 'opacity-30', 'opacity-50', 'bg-[#F3C80D]/25', 'bg-white/5', 'border-white');
                }
                
                if (n <= state.config.humans) {
                    if (inputV3.value.includes("🔒")) inputV3.value = GameConfig.isWeb ? defaultPartyName(n - 1) : `LOCAL ${n}`;
                    inputV3.classList.add('opacity-100');
                    inputV3.classList.remove('opacity-30', 'grayscale', 'pointer-events-none');
                    inputV3.readOnly = false;
                } else {
                    if (inputV3.value.includes("🔒")) inputV3.value = GameConfig.isWeb ? defaultPartyName(n - 1) : `LOCAL ${n}`;
                    inputV3.classList.add('opacity-30', 'grayscale', 'pointer-events-none');
                    inputV3.classList.remove('opacity-100');
                    inputV3.readOnly = true;
                }
            }
        });

        for (let i = 0; i <= 3; i++) {
            const btnV3 = document.getElementById(`v3-bot-${i}`);
            if (btnV3) {
                const isDisabled = i > (4 - state.config.humans) || (state.config.humans === 1 && i === 0);
                
                if (isDisabled) {
                    btnV3.classList.add('grayscale', 'opacity-30', 'border-transparent', 'bg-white/5');
                    btnV3.classList.remove('border-[8px]', 'border-[#F3C80D]', 'shadow-[0_0_30px_rgba(243,200,13,0.5)]', 'opacity-100', 'border-4', 'border-white', 'border-white/30', 'opacity-50', 'bg-white/20', 'bg-[#F3C80D]/25', 'shadow-md', 'hover:border-white/60');
                } else if (state.config.bots === i) {
                    btnV3.classList.add('border-[8px]', 'border-[#F3C80D]', 'shadow-[0_0_30px_rgba(243,200,13,0.5)]', 'opacity-100', 'bg-[#F3C80D]/25');
                    btnV3.classList.remove('border-4', 'grayscale', 'opacity-30', 'opacity-50', 'border-transparent', 'pointer-events-none', 'border-white', 'border-white/30', 'border-yellow-400', 'bg-white/20', 'bg-white/5', 'hover:border-white/60');
                } else {
                    btnV3.classList.add('border-4', 'border-white/30', 'bg-white/20', 'shadow-md', 'opacity-100', 'hover:border-white/60');
                    btnV3.classList.remove('border-[8px]', 'border-[#F3C80D]', 'shadow-[0_0_30px_rgba(243,200,13,0.5)]', 'border-transparent', 'grayscale', 'opacity-30', 'pointer-events-none', 'opacity-50', 'border-yellow-400', 'border-white', 'bg-[#F3C80D]/25', 'bg-white/5');
                }
            }
        }

        // Visitor Images Sync slots 1-3
        for (let i = 1; i <= 3; i++) {
            const imgBox = document.getElementById(`v3-visitor-img-${i}`);
            const nameBox = document.getElementById(`v3-visitor-name-${i}`);
            if (imgBox) {
                if (i > state.config.bots) {
                    imgBox.classList.add('opacity-30', 'grayscale', 'pointer-events-none');
                    imgBox.style.backgroundImage = 'none';
                    imgBox.innerHTML = '';
                    if (nameBox) nameBox.innerText = '';
                } else {
                    imgBox.classList.remove('opacity-30', 'grayscale', 'pointer-events-none');
                    const selectedBotId = app.customBotSelection ? app.customBotSelection[i - 1] : null;
                    if (selectedBotId) {
                        const bIndex = selectedBotId - 1;
                        const bgX = (bIndex % 5) * 25;
                        const bgY = Math.floor(bIndex / 5) * 100;
                        imgBox.style.backgroundImage = `url('assets/visitors_sprite.webp')`;
                        imgBox.style.backgroundSize = '500% 200%';
                        imgBox.style.backgroundPosition = `${bgX}% ${bgY}%`;
                        imgBox.style.backgroundOrigin = 'border-box';
                        imgBox.innerHTML = '';
                        
                        if (nameBox) {
                            const botData = botRoster.find(b => b.id === selectedBotId);
                            nameBox.innerText = botData ? botData.name : `VISITOR ${selectedBotId}`;
                        }
                    } else {
                        imgBox.style.backgroundImage = 'none';
                        imgBox.innerHTML = `<div class="absolute inset-0 flex items-center justify-center font-overpass font-black text-[32px] text-white/30 uppercase text-center pointer-events-none">SELECT<br>VISITOR</div>`;
                        if (nameBox) nameBox.innerText = '';
                    }
                }
            }
        }

        const variationsV3 = { 'NONE': 'v3-var-none', 'ROXANA': 'v3-var-roxana', 'JAEGA': 'v3-var-jaega', 'TOURNAMENT': 'v3-var-tournament' };
        Object.keys(variationsV3).forEach(vKey => {
            const btnV3 = document.getElementById(variationsV3[vKey]);
            if (btnV3) {
                if (state.gameVariation === vKey) {
                    btnV3.classList.add('border-8', 'border-[#F3C80D]', 'shadow-[0_0_30px_rgba(243,200,13,0.5)]');
                    btnV3.classList.remove('border-4', 'border-white', 'border-white/30', 'border-transparent', 'hover:border-white/60');
                } else {
                    btnV3.classList.add('border-4', 'border-white/30', 'shadow-lg', 'hover:border-white/60');
                    btnV3.classList.remove('border-8', 'border-[#F3C80D]', 'shadow-[0_0_30px_rgba(243,200,13,0.5)]', 'border-transparent', 'border-white');
                }
            }
        });

        const draftModesV3 = { 'RANDOM': 'v3-setup-random', 'PAIR': 'v3-setup-pair', 'OPEN': 'v3-setup-open' };
        Object.keys(draftModesV3).forEach(mKey => {
            const btnV3 = document.getElementById(draftModesV3[mKey]);
            if (btnV3) {
                if (state.config.setupMode === mKey) {
                    btnV3.classList.add('border-4', 'border-[#F3C80D]', 'shadow-[0_0_30px_rgba(243,200,13,0.5)]', 'bg-[#F3C80D]/25');
                    btnV3.classList.remove('border-white/30', 'border-transparent', 'bg-white/20', 'hover:border-white/60');
                } else {
                    btnV3.classList.add('border-4', 'border-white/30', 'bg-white/20', 'shadow-md', 'hover:border-white/60');
                    btnV3.classList.remove('border-4', 'border-[#F3C80D]', 'shadow-[0_0_30px_rgba(243,200,13,0.5)]', 'border-transparent', 'bg-[#F3C80D]/25');
                }
            }
        });
    },

    toggleBotMoney: () => {
        state.config.showBotMoney = !state.config.showBotMoney;
        const btn = document.getElementById('btn-toggle-bot-money');
        const btnV2 = document.getElementById('v2-btn-bot-money');
        const label = state.config.showBotMoney ? "SHOW" : "HIDE";
        if (btn) {
            btn.innerText = label;
            if (state.config.showBotMoney) {
                btn.classList.remove('bg-slate-600');
                btn.classList.add('bg-[#DA795A]');
            } else {
                btn.classList.remove('bg-[#DA795A]');
                btn.classList.add('bg-slate-600');
            }
        }
        if (btnV2) {
            btnV2.innerText = label;
            if (state.config.showBotMoney) btnV2.classList.add('active');
            else btnV2.classList.remove('active');
        }
    },

    setVariation: (variation) => {
        const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
        const inCustomMatch = !state.activeGambitId;
        if (isDemo && variation === 'TOURNAMENT' && inCustomMatch) {
            if (window.app.showStartPromoModal) window.app.showStartPromoModal();
            return;
        }

        const setupPanel = document.getElementById('panel-2-setup');
        const inSetupUI = setupPanel && !setupPanel.classList.contains('hidden');

        if (inSetupUI) {
            if (!window.UnlockManager.isVariationUnlocked(variation)) {
                const data = window.UnlockManager.getVariationData(variation);
                window.app.showCustomMatchLockedModal(`Clear Gambit ${data.unlockGambit} to unlock ${data.name}.`);
                return; // Abort selection
            }
        }
        
        state.gameVariation = variation;
        state.config.jaegaVariation = (variation === 'JAEGA');
        state.config.roxanaVariation = (variation === 'ROXANA');
        state.config.miznerVariation = (variation === 'TOURNAMENT');

        if (inSetupUI) window.app.updateSetupUI();
    },

    toggleCheatSheet: () => {
        const el = document.getElementById('in-game-cheat-sheet');
        if (el) el.classList.toggle('hidden');
    },

    toggleAbility: () => {
        const player = state.players[state.turn];
        if (!player || player.counters <= 0) return;

        if (player.character.name === 'ERIC') {
            state.abilityActive = !state.abilityActive;
            if (state.abilityActive) {
                state.ericMode = { remaining: 3 };
                player.counters = Math.max(0, player.counters - 1);
                // Highlight waterfronts
                updateUI(); // Pulse button
            } else {
                state.ericMode = null;
                player.counters++;
                updateUI();
            }

        } else if (player.character.name === 'SILVIANO') {
            state.abilityActive = !state.abilityActive;
            if (state.abilityActive) {
                // Validation: Check if luxury cards available and can afford cheapest
                const availableDecks = state.luxuryDecks.filter(d => d.cards.length > 0);
                if (availableDecks.length === 0) {
                    app.showMessage("CANNOT ACTIVATE", "You can't buy a Luxury Card (All decks empty).", "OK");
                    state.abilityActive = false;
                    return;
                }
                const minCost = Math.min(...availableDecks.map(d => d.cost));

                // Note: The logic requires validating if user CAN buy.
                // It does not force buying immediately, but activates the MODE.
                // However, strictly adhering to "check so that there are Luxury cards available and that he has money"
                if (player.gold < minCost) {
                    app.showMessage("CANNOT ACTIVATE", "You can't buy a Luxury Card (Insufficient Gold).", "OK");
                    state.abilityActive = false;
                    return;
                }

                state.silvianoActive = true;
                player.counters = Math.max(0, player.counters - 1);
                updateUI();

                // Show instructional message for Silviano
                app.showMessage(
                    "DOUBLE ACTION!",
                    "You have activated Silviano's Double Action.<br><br>1. <strong>Pick a Map Card</strong><br><span class='text-sm opacity-75'>THEN</span><br>2. <strong>Buy a Luxury Card</strong>",
                    "LET'S DO IT"
                );

            } else {
                state.silvianoActive = false;
                player.counters++;
                updateUI();
            }
        } else if (player.character.name === 'BRIGHT SHELL') {
            // Reroll is handled in processMove logic
        }
        updateUI();
    },

    openInlineCommandPopup: (playerId) => {
        // Prevent opening while dice are active or reroll is pending
        const diceOverlay = document.getElementById('dice-overlay');
        const isDiceVisible = diceOverlay && !diceOverlay.classList.contains('hidden');
        if (state.rerollPending || isDiceVisible) {
            return;
        }

        const player = state.players[playerId];
        if (!player) return;

        state.viewedPopupPlayerId = playerId;

        const container = document.getElementById('inline-command-popup-container');
        const inner = document.getElementById('inline-command-popup-inner');
        if (!container || !inner) return;

        // Update Text / Header
        const titleEl = document.getElementById('inline-popup-title');
        const descEl = document.getElementById('inline-popup-desc');
        
        let charName = "???";
        let charDesc = "";

        if (player.type === 'BOT') {
            const bot = botRoster.find(b => b.id === player.botId);
            charName = player.name || (bot ? bot.name : "VISITOR");
            const intLabel = bot?.intelligence ? (bot.intelligence.charAt(0) + bot.intelligence.slice(1).toLowerCase()) : "Standard";
            const rerolls = bot?.abilities?.maxRerolls || 0;
            const rerollText = rerolls === 1 ? "1 Re-roll" : (rerolls > 1 ? `${rerolls} Re-rolls` : "");
            charDesc = bot ? (rerollText ? `${bot.description}<br><br><strong>INTELLIGENCE:</strong> ${intLabel}<br><strong>RE-ROLLS:</strong> ${rerollText}` : `${bot.description}<br><br><strong>INTELLIGENCE:</strong> ${intLabel}`) : "Visitor";
        } else {
            charName = player.character ? player.character.name : "LOCAL";
            charDesc = player.character ? player.character.ability : "No active character";
        }

        titleEl.innerText = charName;
        descEl.innerHTML = charDesc;

        // Update Labels
        document.getElementById('inline-label-power').innerText = `POWERS LEFT: ${player.counters || 0}`;
        document.getElementById('inline-label-reroll').innerText = `REROLLS LEFT: ${player.rerolls || 0}`;
        document.getElementById('inline-label-extraturn').innerText = `EXTRA TURNS LEFT: ${player.extraTurns || 0}`;

        // Positioning
        const invEl = document.getElementById(`inventory-${playerId}`);
        const boardWrapper = document.getElementById('board-wrapper');
        if (invEl && boardWrapper) {
            const invRect = invEl.getBoundingClientRect();
            const parentRect = boardWrapper.getBoundingClientRect();
            const zoom = state.zoom || 1.0;
            
            // Calculate unscaled offsets relative to the board wrapper
            const unscaledLeft = (invRect.left - parentRect.left) / zoom;
            const unscaledTop = (invRect.top - parentRect.top) / zoom;

            // Apply offsets (left is unscaledLeft + 50)
            let leftOffset = unscaledLeft + 50;
            let topOffset = unscaledTop;

            // Clamp vertical position so it stays within 2160px bounds
            if (topOffset + 920 > 2160) {
                topOffset = 2160 - 920 - 50;
            }
            if (topOffset < 50) {
                topOffset = 50;
            }

            inner.style.left = `${leftOffset}px`;
            inner.style.top = `${topOffset}px`;
        }

        // Enable / Disable buttons based on State & Logic
        const isActivePlayer = (playerId === state.turn);
        const actionUsed = !!state.actionUsedThisTurn;
        const rerollPending = !!state.rerollPending;

        const btnPower = document.getElementById('inline-btn-power');
        const btnReroll = document.getElementById('inline-btn-reroll');
        const btnExtraTurn = document.getElementById('inline-btn-extraturn');
        const btnActivate = document.getElementById('inline-btn-activate');

        // Reset toggle/activate state when opening
        state.selectedPopupAction = null;
        if (btnPower) btnPower.classList.remove('gold-glow-btn');
        if (btnExtraTurn) btnExtraTurn.classList.remove('gold-glow-btn');
        if (btnActivate) {
            btnActivate.disabled = true;
            btnActivate.classList.remove('emerald-glow-btn');
        }

        // Reset disabled states
        btnPower.disabled = true;
        btnReroll.disabled = true;
        btnExtraTurn.disabled = true;

        if (isActivePlayer && !actionUsed && !rerollPending) {
            // Normal turn, action not used yet
            // Power: Leja, Eric, Roxana, Ms. Post, Carina, and Silviano have manual active powers.
            const hasManualPower = player.character && ['LEJA', 'ROXANA', 'MS. POST', 'ERIC', 'CARINA', 'SILVIANO'].includes(player.character.name);
            if (hasManualPower && player.counters > 0) {
                btnPower.disabled = false;
            }
            
            // Rerolls can't be used voluntarily
            btnReroll.disabled = true;

            // Extra turn can be used
            if (player.extraTurns > 0 && state.activeGambitId !== 4) {
                btnExtraTurn.disabled = false;
            }
        }

        const closeBtn = document.getElementById('inline-close-btn');
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                if (e) e.stopPropagation();
                app.closeInlineCommandPopup();
            };
            if (state.activeGambitId === 4) {
                closeBtn.classList.add('hidden');
            } else {
                closeBtn.classList.remove('hidden');
            }
        }

        // Show the container and run Option A animation clean-up
        container.classList.remove('hidden');
        inner.classList.add('animate-pop-in');
        inner.addEventListener('animationend', () => {
            inner.classList.remove('animate-pop-in');
        }, { once: true });

        if (state.activeGambitId === 4 && state.tutorialStep === 1) {
            state.tutorialStep = 2;
            if (window.app && window.app.showG4Popup2) {
                window.app.showG4Popup2();
            }
        }
    },

    closeInlineCommandPopup: (actionExecuted = false) => {
        if (state.activeGambitId === 4 && !actionExecuted) {
            return;
        }
        const container = document.getElementById('inline-command-popup-container');
        if (container) {
            container.classList.add('hidden');
        }

        state.selectedPopupAction = null;
        const btnActivate = document.getElementById('inline-btn-activate');
        if (btnActivate) {
            btnActivate.classList.remove('emerald-glow-btn');
            btnActivate.disabled = true;
        }

        // If a reroll was pending, and they did not execute a reroll, they accepted fate
        if (state.rerollPending && !actionExecuted) {
            app.cancelReroll();
        }
    },

    selectPopupAction: (actionType) => {
        if (state.activeGambitId === 4 && actionType !== 'POWER') {
            return;
        }
        const player = state.players[state.viewedPopupPlayerId !== undefined ? state.viewedPopupPlayerId : state.turn];
        if (!player) return;

        const btnPower = document.getElementById('inline-btn-power');
        const btnExtraTurn = document.getElementById('inline-btn-extraturn');
        const btnActivate = document.getElementById('inline-btn-activate');

        if (actionType === 'POWER') {
            if (state.selectedPopupAction === 'POWER') {
                state.selectedPopupAction = null;
                if (btnPower) btnPower.classList.remove('gold-glow-btn');
            } else {
                state.selectedPopupAction = 'POWER';
                if (btnPower) btnPower.classList.add('gold-glow-btn');
                if (btnExtraTurn) btnExtraTurn.classList.remove('gold-glow-btn');
            }
        } else if (actionType === 'EXTRA_TURN') {
            if (state.selectedPopupAction === 'EXTRA_TURN') {
                state.selectedPopupAction = null;
                if (btnExtraTurn) btnExtraTurn.classList.remove('gold-glow-btn');
            } else {
                state.selectedPopupAction = 'EXTRA_TURN';
                if (btnExtraTurn) btnExtraTurn.classList.add('gold-glow-btn');
                if (btnPower) btnPower.classList.remove('gold-glow-btn');
            }
        }

        if (btnActivate) {
            btnActivate.disabled = !state.selectedPopupAction;
            if (state.selectedPopupAction) {
                btnActivate.classList.add('emerald-glow-btn');
            } else {
                btnActivate.classList.remove('emerald-glow-btn');
            }
        }
    },

    activateSelectedAction: () => {
        if (!state.selectedPopupAction) return;
        const actionType = state.selectedPopupAction;
        state.selectedPopupAction = null;
        app.executePopupAction(actionType);
    },

    executePopupAction: (actionType) => {
        const player = state.players[state.turn];
        if (!player) return;

        if (state.activeGambitId === 4 && actionType !== 'POWER') {
            app.showMessage("INVALID CHOICE", "select the POWER to continue.", "OK");
            return;
        }

        if (actionType === 'POWER') {
            if (player.type === 'HUMAN') {
                if (window.AchievementManager) window.AchievementManager.unlock('USE_A_CHARACTER_POWER');
            }
            // Active character powers
            if (player.character) {
                if (player.character.name === 'ERIC') {
                    state.abilityActive = true;
                    state.ericMode = { remaining: 3 };
                    player.counters = Math.max(0, player.counters - 1);
                    log("Eric's ability activated!", 'success');
                    state.actionUsedThisTurn = true; // Eric's power spends his turn action
                    updateUI();
                    app.closeInlineCommandPopup(true);
                } else if (player.character.name === 'LEJA') {
                    const validDecks = state.luxuryDecks.filter(d => d.cards.length > 1);
                    if (validDecks.length === 0) {
                        const contentHtml = `<button onclick="app.closeSideAbilityPopup()" class="w-full py-5 bg-[#1e293b]/70 hover:bg-[#334155]/70 border border-white/10 rounded-2xl text-[32px] font-black uppercase tracking-widest text-white shadow-lg cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all font-overpass">OK</button>`;
                        app.openSideAbilityPopup("LEJA'S POWER", "Powers can not be used. No piles with more than 1 card.", contentHtml, () => {});
                        app.closeInlineCommandPopup(true);
                        return;
                    }
                    state.lejaTargetingActive = true;
                    state.luxuryDecks.forEach((deck, idx) => {
                        if (deck.cards.length > 1) {
                            const deckEl = document.getElementById(`deck-container-${idx}`);
                            if (deckEl) {
                                deckEl.classList.add('luxury-deck-highlight', 'border-yellow-500');
                            }
                        }
                    });
                    app.openSideAbilityPopup("LEJA'S POWER", "Select a Luxury Card pile. The top card is placed at the bottom and the new top card is revealed face-up.", "", () => {
                        app.closeSideAbilityPopup();
                    });
                    app.closeInlineCommandPopup(true);
                } else if (player.character.name === 'SILVIANO') {
                    // Validation: Check if luxury cards available and can afford cheapest
                    const availableDecks = state.luxuryDecks.filter(d => d.cards.length > 0);
                    if (availableDecks.length === 0) {
                        app.showMessage("CANNOT ACTIVATE", "You can't buy a Luxury Card (All decks empty).", "OK");
                        app.closeInlineCommandPopup(true);
                        return;
                    }
                    const minCost = Math.min(...availableDecks.map(d => d.cost));
                    if (player.gold < minCost) {
                        app.showMessage("CANNOT ACTIVATE", "You can't buy a Luxury Card (Insufficient Gold).", "OK");
                        app.closeInlineCommandPopup(true);
                        return;
                    }

                    state.abilityActive = true;
                    state.silvianoActive = true;
                    state.silvianoActions = [];
                    player.counters = Math.max(0, player.counters - 1);
                    log("Silviano's ability activated!", 'success');
                    app.openSideAbilityPopup(
                        "SILVIANO'S POWER",
                        "You have activated Silviano's Double Action.<br><br>1. <strong>Pick a Map Card</strong><br>THEN<br>2. <strong>Buy a Luxury Card</strong>",
                        "",
                        () => {
                            state.silvianoActive = false;
                            state.abilityActive = false;
                            state.silvianoActions = [];
                            player.counters++;
                            log("Silviano's ability deactivated.", 'info');
                            updateUI();
                        },
                        "CANCEL"
                    );
                    updateUI();
                    app.closeInlineCommandPopup(true);
                } else if (player.character.name === 'ROXANA') {
                    const otherPlayers = state.players.filter(p => p.id !== player.id && p.status !== 'Resigned' && p.status !== 'Folded');
                    if (otherPlayers.length === 0) {
                        app.showMessage("CANNOT ACTIVATE", "There are no other active players to target.", "OK");
                        app.closeInlineCommandPopup(true);
                        return;
                    }
                    const contentHtml = otherPlayers.map(op => {
                        return `<button onclick="app.executeRoxanaSkip(${op.id})" class="w-full py-6 bg-[#1e293b]/70 hover:bg-[#334155]/70 border border-white/10 rounded-2xl text-[32px] font-black uppercase tracking-wider text-white shadow-lg cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all font-overpass">${op.name} (${op.character ? op.character.name : 'VISITOR'})</button>`;
                    }).join('');
                    
                    app.openSideAbilityPopup("ROXANA'S POWER", "Spend 1 counter to force any player to skip their next turn. Select target player:", contentHtml, () => {});
                    app.closeInlineCommandPopup(true);
                } else if (player.character.name === 'MS. POST') {
                    const validDecks = state.luxuryDecks.filter(d => d.cards.length > 0);
                    if (validDecks.length === 0) {
                        app.showMessage("CANNOT ACTIVATE", "All luxury decks are empty.", "OK");
                        app.closeInlineCommandPopup(true);
                        return;
                    }
                    state.postTargetingActive = true;
                    state.luxuryDecks.forEach((deck, idx) => {
                        if (deck.cards.length > 0) {
                            const deckEl = document.getElementById(`deck-container-${idx}`);
                            if (deckEl) {
                                deckEl.classList.add('luxury-deck-highlight', 'border-yellow-500');
                            }
                        }
                    });
                    app.openSideAbilityPopup("MS. POST'S POWER", "On your turn (no action cost), place 1 or more counters<br>on any Luxury Piles. For other players, acquiring a<br>card from those piles costs +2 Au per counter.<br><br>Click an active Luxury Deck on the right sidebar to place a tax counter.", "", () => {
                        app.closeSideAbilityPopup();
                    });
                    app.closeInlineCommandPopup(true);
                } else if (player.character.name === 'CARINA') {
                    const validCells = state.grid.filter(c => !c.flipped && !c.empty && (c.type === 'BLOCK' || c.type === 'WF_L' || c.type === 'WF_R'));
                    if (validCells.length === 0) {
                        app.showMessage("CANNOT ACTIVATE", "There are no face-down Blocks or Waterfronts to lock.", "OK");
                        app.closeInlineCommandPopup(true);
                        return;
                    }
                    state.carinaTargetingActive = true;
                    validCells.forEach(cell => {
                        const cellEl = document.getElementById(`cell-container-${cell.id}`);
                        if (cellEl) {
                            cellEl.classList.add('board-cell-highlight', 'border-yellow-500');
                        }
                    });
                    app.openSideAbilityPopup("CARINA'S POWER", "On your turn (no action cost), place 1 counter on a face-down Block or Waterfront.<br><br>Click any face-down Block or Waterfront card on the board to lock it.", "", () => {
                        app.closeSideAbilityPopup();
                    });
                    app.closeInlineCommandPopup(true);
                }
            }
        } else if (actionType === 'EXTRA_TURN') {
            if (player.type === 'HUMAN') {
                if (window.AchievementManager) window.AchievementManager.unlock('TAKE_AN_EXTRA_TURN');
            }
            player.extraTurns = Math.max(0, player.extraTurns - 1);
            state.extraTurnActive = true;
            state.actionUsedThisTurn = true;
            log(`${player.name} activated an Extra Turn! It will trigger at the end of this turn.`, 'success');
            updateUI();
            app.closeInlineCommandPopup(true);
        }
    },

    showAbility: (id, isBot = false) => {
        // Redirect to inline command popup
        let foundPlayer = state.players.find(p => isBot ? p.botId === id : (p.character && p.character.id === id));
        if (foundPlayer) {
            app.openInlineCommandPopup(foundPlayer.id);
        }
    },
    closeAbility: () => {
        app.closeInlineCommandPopup();
    },

    openSideAbilityPopup: (title, desc, contentHtml, onCancel, cancelBtnText = "Cancel") => {
        const popup = document.getElementById('side-ability-popup');
        const titleEl = document.getElementById('side-popup-title');
        const descEl = document.getElementById('side-popup-desc');
        const contentEl = document.getElementById('side-popup-content');
        const cancelBtn = document.getElementById('side-popup-cancel');

        if (!popup || !titleEl || !descEl || !contentEl || !cancelBtn) return;

        titleEl.innerText = title;
        descEl.innerHTML = desc;
        contentEl.innerHTML = contentHtml || '';
        cancelBtn.innerText = cancelBtnText;
        
        popup.classList.remove('hidden');
        popup.classList.add('animate-pop-in');

        // Responsive Popup Scaling Option A: clean up entrance animation once done
        popup.addEventListener('animationend', () => {
            popup.classList.remove('animate-pop-in');
        }, { once: true });

        // Clean up previous event listeners by cloning button
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

        newCancelBtn.addEventListener('click', () => {
            app.closeSideAbilityPopup();
            if (onCancel) onCancel();
        });
    },

    closeSideAbilityPopup: () => {
        const popup = document.getElementById('side-ability-popup');
        if (popup) {
            popup.classList.add('hidden');
        }
        // Remove yellow borders and ability states
        document.querySelectorAll('.luxury-deck-highlight').forEach(el => el.classList.remove('luxury-deck-highlight', 'border-yellow-500'));
        document.querySelectorAll('.board-cell-highlight').forEach(el => el.classList.remove('board-cell-highlight', 'border-yellow-500'));
        state.postTargetingActive = false;
        state.carinaTargetingActive = false;
        state.lejaTargetingActive = false;
    },

    executeLejaCycle: (deckIndex) => {
        const player = state.players[state.turn];
        if (!player || player.counters <= 0) return;
        const deck = state.luxuryDecks[deckIndex];
        if (deck && deck.cards.length > 1) {
            const topCard = deck.cards.pop();
            deck.cards.unshift(topCard);
            deck.isFlippedOpen = true;
            player.counters = Math.max(0, player.counters - 1);
            log(`${player.name} (Leja) cycled Luxury Deck ${deckIndex + 1}!`, 'success');
            audioMgr.play('flip');
            app.closeSideAbilityPopup();

            if (state.activeGambitId === 4 && state.tutorialStep === 2) {
                if (window.app && window.app.advanceG4Step3) {
                    window.app.advanceG4Step3();
                }
            }

            updateUI();
        }
    },

    executeRoxanaSkip: (targetId) => {
        const player = state.players[state.turn];
        if (!player || player.counters <= 0) return;
        const target = state.players[targetId];
        if (!target) return;
        player.counters = Math.max(0, player.counters - 1);
        target.skipNextTurn = true;
        
        if (player.type === 'HUMAN') {
            if (!player.skippedPlayersMap) player.skippedPlayersMap = {};
            player.skippedPlayersMap[targetId] = (player.skippedPlayersMap[targetId] || 0) + 1;
            if (player.skippedPlayersMap[targetId] >= 2) {
                if (window.AchievementManager) window.AchievementManager.unlock('SKIP_SAME_PLAYER_TWICE');
            }
        }

        log(`${player.name} (Roxana) forces ${target.name} to skip their next turn!`, 'success');
        app.closeSideAbilityPopup();
        updateUI();
    },

    executePostTax: (deckIndex) => {
        const player = state.players[state.turn];
        if (!player || player.counters <= 0) return;
        
        if (!state.luxuryTaxCounters) {
            state.luxuryTaxCounters = [0, 0, 0];
        }
        
        state.luxuryTaxCounters[deckIndex] = (state.luxuryTaxCounters[deckIndex] || 0) + 1;
        player.counters = Math.max(0, player.counters - 1);
        
        log(`${player.name} (Ms. Post) added a Luxury Pile tax on Deck ${deckIndex + 1}!`, 'success');
        audioMgr.play('gold_small');
        
        app.closeSideAbilityPopup();
        updateUI();
    },

    executeCarinaLock: (cell) => {
        const player = state.players[state.turn];
        if (!player || player.counters <= 0) return;
        
        if (!state.carinaLockedCells) {
            state.carinaLockedCells = {};
        }

        state.carinaLockedCells[cell.id] = true;
        player.counters = Math.max(0, player.counters - 1);
        
        log(`${player.name} (Carina) locked cell ${cell.id}!`, 'success');
        audioMgr.play('dice_fail');
        
        app.closeSideAbilityPopup();
        updateUI();
    },



    confirmSilviano: () => {
        // Deprecated modal flow, now handled via active toggle button.
        // Keeping empty function if needed for legacy ref or remove.
        document.getElementById('message-modal').classList.add('hidden');
    },

    nextTurnFromModal: () => {
        document.getElementById('message-modal').classList.add('hidden');
        nextTurn();
    },


    reroll: confirmReroll,
    cancelReroll: cancelReroll,

    // New Function: Report Bug / Feedback
    openBugReport: () => {
        const url = 'https://forms.gle/V1kwGAYUiJWX4WAi6';
        if (GameConfig.isElectron) {
            try {
                // Dynamic require to avoid build issues if not in electron, 
                // though isElectron check should suffice.
                const { shell } = window.require('electron');
                shell.openExternal(url);
            } catch (e) {
                console.warn("Failed to open external link via Electron:", e);
                window.open(url, '_blank');
            }
        } else {
            window.open(url, '_blank');
        }
    },

    openWishlist: () => {
        // PLACEHOLDER: this is the Boca Raton (Gold Coast Gambits) Steam page. Palm Beach has no Steam page yet.
        const url = 'https://store.steampowered.com/app/4307400/Gold_Coast_Gambits_Boca_Raton__Palm_Beach/';
        if (GameConfig.isElectron) {
            try {
                const { shell } = window.require('electron');
                shell.openExternal(url);
            } catch (e) {
                console.warn("Failed to open external link via Electron:", e);
                window.open(url, '_blank');
            }
        } else {
            window.open(url, '_blank');
        }
    },

    openDiscordOverlay: () => {
        const url = 'https://discord.gg/JaUdatCSTK';
        if (GameConfig.isElectron) {
            try {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.send('open-discord-overlay', url);
            } catch (e) {
                console.warn("Failed to send open-discord-overlay IPC event:", e);
                window.open(url, '_blank');
            }
        } else {
            window.open(url, '_blank');
        }
    },

    selectGalleryItem,
    renderCharacterGrid,
    openCharacterGallery,
    openBotGallery,
    openCompendiumCharacter,
    openCompendiumVisitor,

    // God Mode
    openGodMode: Debug.openGodMode,
    godRevealMap: Debug.godRevealMap,
    godForceAuction: Debug.godForceAuction,
    godSuperBoost: Debug.godSuperBoost,
    toggleMapEditMode: Debug.toggleMapEditMode,
    godDistributeLuxury: Debug.godDistributeLuxury,
    closeGodMode: Debug.closeGodMode,
    toggleDebugPanel: Debug.toggleDebugPanel,
    godForceGameOver: Debug.godForceGameOver,

    godForceWin: () => {
        if (window.state && window.state.players) {
            // Rig the scores to guarantee a human win
            window.state.players.forEach(p => {
                if (p.type === 'HUMAN') {
                    p.prestige = 9999;
                    p.gold = 9999;
                } else {
                    p.prestige = 0;
                    p.gold = 0;
                }
            });
        }
        
        // Bypass the execution lock just in case it was stuck, then end game
        if (window.state) window.state.isGameOver = false;
        app.triggerGameOver('GOD MODE WIN');
    },

    godForceLose: () => {
        if (!window.state || window.state.players.length < 2) return;
        
        // Bypass the execution lock
        if (window.state) window.state.isGameOver = false;
        
        window.state.forcedWinnerId = window.state.players[1].id;
        app.triggerGameOver('GOD MODE LOSE');
    },

    triggerGameOver: (reason) => {
        if (state.mode === 'GAME_OVER') return;

        state.mode = 'GAME_OVER';
        state.gameOverTriggered = true;

        document.body.classList.remove('bg-black');

        // Close settings, rulebooks, pause menus, and all other active game modals
        const modalIds = [
            'resign-modal', 'ability-modal', 'central-auction-ui', 'god-mode-overlay',
            'compendium-modal', 'confrontation-modal', 'promo-modal', 'start-promo-modal', 'support-modal',
            'unified-settings-modal', 'message-modal', 'rulebook-modal', 'gambit-brief-modal', 'about-modal',
            'gambit-objective-modal', 'objective-impossible-modal'
        ];
        modalIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        if (app.closeInlineCommandPopup) {
            app.closeInlineCommandPopup();
        }

        // 1. The Great UI Scatter: Slide Left and Right sidebars off-screen
        const leftSidebar = document.getElementById('left-sidebar');
        const rightSidebar = document.getElementById('right-sidebar');
        setTimeout(() => {
            if (state.mode !== 'GAME_OVER') return;
            if (leftSidebar) {
                leftSidebar.classList.add('scatter-left');
            }
            if (rightSidebar) {
                rightSidebar.classList.add('scatter-right');
            }
        }, 1000);

        // 2. The Final Reveal: Automatically flip all face-down map cards & auction cards face-up
        let flippedAny = false;
        if (state.grid) {
            state.grid.forEach(cell => {
                if (cell && !cell.empty && !cell.flipped) {
                    cell.flipped = true;
                    updateCardVisuals(cell);
                    flippedAny = true;
                }
            });
        }
        if (state.auctions) {
            ['A', 'B'].forEach(id => {
                const auc = state.auctions[id];
                if (auc && auc.card && !auc.triggered && !auc.resolved) {
                    auc.flipped = true;
                    setupAuctionVisuals(id, auc.card, false);
                    flippedAny = true;
                }
            });
        }
        if (flippedAny) {
            audioMgr.play('flip');
        }

        // Determine Winner using standard algorithm
        const sortedPlayers = [...state.players].sort((a, b) => {
            const vpA = a.prestige || 0;
            const vpB = b.prestige || 0;
            if (vpB !== vpA) return vpB - vpA;

            const hasMaraA = a.inventory ? a.inventory.some(c => c.name === 'Mar-a-Lago') : false;
            const hasMaraB = b.inventory ? b.inventory.some(c => c.name === 'Mar-a-Lago') : false;
            if (hasMaraA && !hasMaraB) return -1;
            if (!hasMaraA && hasMaraB) return 1;

            return (b.gold || 0) - (a.gold || 0);
        });

        const winner = (state.forcedWinnerId !== undefined)
            ? state.players.find(p => p.id === state.forcedWinnerId)
            : sortedPlayers[0];

        // Retrieve Winner details (supports bots and characters)
        let charName = "???";
        let charTitle = "WINNER";
        let bgStyle = "";
        
        if (winner) {
            if (winner.type === 'BOT' && winner.botId) {
                const botData = botRoster.find(b => b.id === winner.botId);
                charName = winner.name;
                charTitle = botData ? botData.name : "VISITOR";
                const botSpriteURL = new URL("/assets/visitors_sprite.webp", import.meta.url).href;
                const bIndex = winner.botId - 1;
                const bX = (bIndex % 5) * 25;
                const bY = Math.floor(bIndex / 5) * 100;
                bgStyle = `background-image: url('${botSpriteURL}'); background-size: 500% 200%; background-position: ${bX}% ${bY}%;`;
            } else if (winner.character) {
                charName = winner.character.name;
                charTitle = winner.character.title;
                const charId = winner.character.id;
                const posX = (charId % 5) * 25;
                const posY = Math.floor(charId / 5) * 100;
                const spriteURL = CHARACTER_SPRITE_PRINT_URL;
                bgStyle = `background-image: url('${spriteURL}'); background-size: 500% 200%; background-position: ${posX}% ${posY}%;`;
            } else {
                charName = winner.name || "PLAYER";
                charTitle = "WINNER";
                bgStyle = "background-color: #334155;";
            }
        }

        // Apply styling and name details to cinematic Winner presentation card
        const overlay = document.getElementById('cinematic-winner-overlay');
        const victoryTitle = document.getElementById('cinematic-victory-title');
        const cardContainer = document.getElementById('cinematic-winner-card-container');
        const portrait = document.getElementById('cinematic-winner-portrait');
        const nameEl = document.getElementById('cinematic-winner-name');
        const titleEl = document.getElementById('cinematic-winner-title');
        const btnEl = document.getElementById('cinematic-see-results-btn');

        if (nameEl) nameEl.innerText = charName;
        if (titleEl) titleEl.innerText = charTitle;
        if (portrait) portrait.style.cssText = bgStyle;

        if (overlay) {
            // Reset animation classes to guarantee they re-trigger
            if (victoryTitle) victoryTitle.classList.remove('bounce-in-top');
            if (cardContainer) cardContainer.classList.remove('swirl-in-right-fwd');
            if (btnEl) btnEl.classList.remove('bounce-in-top');

            // Keep it hidden initially while sidebars scatter
            overlay.classList.add('hidden');

            // Delay showing the winner presentation so the scatter animation of player cards is clearly visible first
            setTimeout(() => {
                // Check in case user exited the game while waiting
                if (state.mode !== 'GAME_OVER') return;

                // Force browser reflow to reset transitions/animations
                void overlay.offsetWidth;

                // Show the overlay
                overlay.classList.remove('hidden');

                // Add animation classes back
                if (victoryTitle) victoryTitle.classList.add('bounce-in-top');
                if (cardContainer) cardContainer.classList.add('swirl-in-right-fwd');
                if (btnEl) btnEl.classList.add('bounce-in-top');
            }, 1800);
        }

        const curtain = document.getElementById('curtain-call');
        if (curtain) {
            document.getElementById('curtain-reason').innerText = reason;
        }

        audioMgr.stopBGM();
        audioMgr.play('the_gong');
    },

    handleSeeResults: () => {
        const overlay = document.getElementById('cinematic-winner-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }

        // Clean up scatter classes so next match starts correctly
        const leftSidebar = document.getElementById('left-sidebar');
        const rightSidebar = document.getElementById('right-sidebar');
        if (leftSidebar) {
            leftSidebar.classList.remove('scatter-left');
        }
        if (rightSidebar) {
            rightSidebar.classList.remove('scatter-right');
        }

        // Transition to standard statistics screen
        app.revealWinner();
    },

    // (Tournament UI functions removed)

    revealWinner: async (forcedWinner) => {
        try {
            if (state.isGameOver) {
                console.log("[EndGame] revealWinner blocked by lock");
                return;
            }
            state.isGameOver = true;

            const curtain = document.getElementById('curtain-call');
            if (curtain) curtain.classList.add('hidden');

            const screen = document.getElementById('game-over-screen');
            if (!screen) return;
            screen.classList.remove('hidden');
            screen.style.display = '';

            // --- NEW: Hide the active game board so the shader is exposed ---
            const gameUI = document.getElementById('game-ui');
            if (gameUI) {
                gameUI.style.display = 'none';
            }
            // ---------------------------------------------------------------

            // Reset container classes for the specific requested layout
            screen.className = "fixed inset-0 z-[400] flex flex-col items-center justify-center font-overpass pointer-events-auto";

            if (!state.players || state.players.length === 0) {
                console.error("[EndGame] No players found in state");
                screen.innerHTML = `<div class="text-white text-4xl">ERROR: NO PLAYERS FOUND</div><button onclick="app.exitToTitle()" class="btn-v2-glossy mt-10 px-10 py-5 text-black">EXIT</button>`;
                return;
            }

            // Determine Winner
            const sortedPlayers = [...state.players].sort((a, b) => {
                const vpA = a.prestige || 0;
                const vpB = b.prestige || 0;
                if (vpB !== vpA) return vpB - vpA;

                const hasMaraA = a.inventory ? a.inventory.some(c => c.name === 'Mar-a-Lago') : false;
                const hasMaraB = b.inventory ? b.inventory.some(c => c.name === 'Mar-a-Lago') : false;
                if (hasMaraA && !hasMaraB) return -1;
                if (!hasMaraA && hasMaraB) return 1;

                return (b.gold || 0) - (a.gold || 0);
            });

            const winner = forcedWinner || (state.forcedWinnerId !== undefined ? state.players.find(p => p.id === state.forcedWinnerId) : sortedPlayers[0]);
            const isHumanWin = winner && winner.type && winner.type.toUpperCase() === 'HUMAN';

            // --- GAMBIT VICTORY HOOK ---
            let gambitMessageHTML = "";
            let shouldShowLevelUnlocked = false;
            let unlockedNextLevelNum = 0;
            let unlockedCurrentLevelNum = 0;
            const isGambit = !!state.activeGambitId;

            if (isGambit) {
                const gambit = window.GAMBIT_CAMPAIGN.find(g => g.id === state.activeGambitId);
                if (gambit) {
                    if (!state.playerProfile.gambitStreaks) state.playerProfile.gambitStreaks = {};
                    if (!state.playerProfile.clearedGambits) state.playerProfile.clearedGambits = [];

                    const currentGambitId = state.activeGambitId;
                    const currentLevel = Math.ceil(currentGambitId / 5);
                    const nextLevel = currentLevel + 1;
                    
                    // Check if next level was ALREADY unlocked prior to marking this match
                    const wasNextLevelUnlocked = isLevelUnlocked(nextLevel);

                    const requiredWins = gambit.winStreakRequired || 1;

                    // Evaluate Gambit Win Condition at End Game
                    let gambitSuccess = isHumanWin; // Default fallback to 1st place
                    if (state.matchForfeited || state.gambitImpossible) {
                        gambitSuccess = false; // Instant fail on forfeit or impossible objective
                    } else if (gambit.winCondition && window.evaluateGambitCondition) {
                        const humanPlayer = state.players.find(p => p.type === 'HUMAN');
                        gambitSuccess = window.evaluateGambitCondition(humanPlayer, gambit.winCondition, false, sortedPlayers).met;
                    }

                    if (gambitSuccess) {
                        state.playerProfile.gambitStreaks[gambit.id] = (state.playerProfile.gambitStreaks[gambit.id] || 0) + 1;
                        const currentStreak = state.playerProfile.gambitStreaks[gambit.id];
                        if (currentStreak >= requiredWins) {
                            if (!state.playerProfile.clearedGambits.includes(gambit.id)) {
                                state.playerProfile.clearedGambits.push(gambit.id);
                            }
                            gambitMessageHTML = `
                                <div class="flex flex-col items-center text-center">
                                    <div class="text-[#F3C80D] text-[48px] font-black uppercase font-overpass leading-none drop-shadow-2xl">GAMBIT ${gambit.id} SOLVED!</div>
                                    ${GameConfig.isWeb ? '' : `<div class="text-white text-[32px] font-light uppercase font-overpass whitespace-nowrap mt-2">REWARD: ${gambit.brief?.unlockReward || 'NEW ASSETS'}</div>`}
                                </div>
                            `;

                            // Check if completing this Gambit has unlocked the next level for the first time
                            if (nextLevel <= 10) {
                                const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
                                const isNextLevelValid = !isDemo || nextLevel <= 4;
                                if (isNextLevelValid && !wasNextLevelUnlocked && isLevelUnlocked(nextLevel)) {
                                    shouldShowLevelUnlocked = true;
                                    unlockedNextLevelNum = nextLevel;
                                    unlockedCurrentLevelNum = currentLevel;
                                }
                            }
                        } else {
                            const needed = requiredWins - currentStreak;
                            gambitMessageHTML = `<div class="flex flex-col items-center text-center"><div class="text-white text-[48px] font-black uppercase font-overpass leading-none">STREAK +1</div><div class="text-white text-[32px] font-light uppercase font-overpass whitespace-nowrap mt-2">WIN ${needed} MORE IN A ROW TO SOLVE</div></div>`;
                        }
                    } else {
                        state.playerProfile.gambitStreaks[gambit.id] = 0;
                        let failTitle = state.matchForfeited ? "MATCH FORFEITED" : "STREAK RESET";
                        let failSubtitle = `YOU MUST WIN ${requiredWins} IN A ROW`;
                        
                        // Fix the grammar for standard 1-win Gambits
                        if (requiredWins === 1) {
                            failTitle = state.matchForfeited ? "MATCH FORFEITED" : `GAMBIT ${gambit.id} FAILED!`;
                            failSubtitle = ""; // Suppress "TRY AGAIN"
                        }

                        const failColor = state.matchForfeited ? "text-gray-400" : "text-white";
                        gambitMessageHTML = `<div class="flex flex-col items-center text-center"><div class="${failColor} text-[48px] font-black uppercase font-overpass leading-none drop-shadow-2xl">${failTitle}</div>${failSubtitle ? `<div class="text-white text-[32px] font-light uppercase font-overpass whitespace-nowrap mt-2">${failSubtitle}</div>` : ''}</div>`;
                    }
                    await saveProfile();
                }
            } else if (state.matchForfeited) {
                gambitMessageHTML = `
                    <div class="flex flex-col items-center text-center">
                        <div class="text-gray-400 text-[48px] font-black uppercase font-overpass leading-none drop-shadow-2xl">MATCH FORFEITED</div>
                    </div>
                `;
            }

            // Calculate Stats for Awards
            const maxGold = Math.max(...state.players.map(p => p.totalGold || 0));
            let maxAvgRoll = 0;
            let maxMapAvg = 0;
            let minMapAvg = Infinity;
            state.players.forEach(p => {
                const avg = p.rollCount > 0 ? (p.rollSum / p.rollCount) : 0;
                if (avg > maxAvgRoll) maxAvgRoll = avg;
                
                const mapAvg = p.mapCardsFlipped > 0 ? (p.totalGold / p.mapCardsFlipped) : 0;
                if (mapAvg > maxMapAvg) maxMapAvg = mapAvg;
                if (mapAvg < minMapAvg) minMapAvg = mapAvg;
            });

            // Update Career Stats
            const human = state.players.find(p => p.type === 'HUMAN');
            if (human) {
                if (isHumanWin) {
                    state.stats.totalWins++;
                    
                    // Track defeated bots
                    if (!state.stats.defeatedBots) state.stats.defeatedBots = [];
                    state.players.forEach(p => {
                        if (p.type === 'BOT' && p.botId) {
                            if (!state.stats.defeatedBots.includes(p.botId)) {
                                state.stats.defeatedBots.push(p.botId);
                            }
                        }
                    });

                    // Track won characters in custom board games
                    if (!state.activeGambitId && human.character) {
                        const cName = human.character.name.toUpperCase();
                        if (!state.stats.wonCharacters) state.stats.wonCharacters = [];
                        if (!state.stats.wonCharacters.includes(cName)) {
                            state.stats.wonCharacters.push(cName);
                        }
                    }
                } else {
                    state.stats.totalLosses++;
                }

                // Check game duration achievements
                const duration = Date.now() - (state.startTime || Date.now());
                if (isHumanWin && duration < 10 * 60 * 1000) {
                    if (window.AchievementManager) window.AchievementManager.unlock('WIN_UNDER_10_MINUTES');
                }
                if (duration > 2 * 60 * 60 * 1000) {
                    if (window.AchievementManager) window.AchievementManager.unlock('PLAY_OVER_2_HOURS');
                }

                if (isHumanWin && state.activeGambitId) {
                    if (!state.playerProfile.clearedGambits.includes(state.activeGambitId)) {
                        state.playerProfile.clearedGambits.push(state.activeGambitId);
                    }
                }
                
                if ((human.prestige || 0) > (state.stats.highestPrestigeScore || 0)) {
                    state.stats.highestPrestigeScore = human.prestige;
                }
                
                if (human.character) {
                    const cName = human.character.name;
                    if (!state.stats.characterStats) state.stats.characterStats = {};
                    if (!state.stats.characterStats[cName]) state.stats.characterStats[cName] = { wins: 0, losses: 0 };
                    if (isHumanWin) state.stats.characterStats[cName].wins++;
                    else state.stats.characterStats[cName].losses++;
                }

                if (!state.stats.highScores) state.stats.highScores = [];
                state.stats.highScores.push({ 
                    name: human.name, 
                    vp: human.prestige || 0, 
                    type: 'HUMAN', 
                    date: new Date().toISOString(),
                    character: human.character?.name || "Unknown"
                });
                state.stats.highScores.sort((a, b) => b.vp - a.vp);
                if (state.stats.highScores.length > 20) state.stats.highScores = state.stats.highScores.slice(0, 20);
                
                if (window.AchievementManager) AchievementManager.check();
                await saveProfile();
            }

            if (window.audioMgr) audioMgr.play('winner_song');

            const duration = Date.now() - (state.startTime || Date.now());
            const totalSeconds = Math.floor(duration / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;

            let timeStr = "";
            if (hours >= 1) {
                timeStr = `${hours}h ${minutes}m`;
            } else {
                timeStr = `${minutes}m ${seconds}s`;
            }

            // Configure Action Bar button labels & actions according to matrix
            let secondaryBtnText = "";
            let secondaryBtnOnClick = "";
            let primaryBtnText = "";
            let primaryBtnOnClick = "";

            const isGambitMatch = !!state.activeGambitId;
            if (isGambitMatch) {
                if (isHumanWin) {
                    secondaryBtnText = GameConfig.isWeb ? "PARTY MENU" : "GAMBITS SELECT";
                    secondaryBtnOnClick = "app.handleGambitExit()";
                    primaryBtnText = GameConfig.isWeb ? webTutorialPrimaryLabel(state.activeGambitId, true) : "NEXT GAMBIT";
                    primaryBtnOnClick = "app.handleGambitAction(true)";
                } else {
                    secondaryBtnText = GameConfig.isWeb ? "PARTY MENU" : "GAMBITS SELECT";
                    secondaryBtnOnClick = "app.handleGambitExit()";
                    primaryBtnText = "RETRY";
                    primaryBtnOnClick = "app.handleGambitAction(false)";
                }
            } else if (GameConfig.isWeb) {
                // Web Party Edition: the party menu is the only menu, so MAIN MENU and BACK TO SETUP led to the same
                // place. One button is enough.
                primaryBtnText = "MAIN MENU";
                primaryBtnOnClick = "app.handleCustomMatchExit('MENU')";
            } else {
                secondaryBtnText = "MAIN MENU";
                secondaryBtnOnClick = "app.handleCustomMatchExit('MENU')";
                primaryBtnText = "BACK TO SETUP";
                primaryBtnOnClick = "app.handleCustomMatchExit('SETUP')";
            }

            let playerColumnsHTML = "";

            sortedPlayers.forEach((p, index) => {
                const rank = index + 1;
                const isWinner = rank === 1;
                const prestige = p.prestige;
                const hasMara = p.inventory.some(c => c.name === 'Mar-a-Lago');

                let charNameStr = "???";
                let bgUrl = '';
                let bgSize = '500% 200%';
                let bgPosXPercent = 0;
                let bgPosYPercent = 0;

                if (p.type === 'BOT') {
                    const bot = botRoster.find(b => b.id === p.botId);
                    charNameStr = bot ? bot.name : `BOT ${p.botId}`;
                    bgUrl = new URL("/assets/visitors_sprite.webp", import.meta.url).href;
                    const bIndex = p.botId - 1;
                    bgPosXPercent = (bIndex % 5) * 25;
                    bgPosYPercent = Math.floor(bIndex / 5) * 100;
                } else {
                    charNameStr = p.character ? p.character.name : p.name;
                    bgUrl = new URL("/assets/character_cards_print.webp", import.meta.url).href;
                    if (p.character) {
                        const charIndex = CHARACTERS.findIndex(c => c.id === p.character.id);
                        const posIndex = charIndex > -1 ? charIndex : (p.character.id || 0);
                        bgPosXPercent = (posIndex % 5) * 25;
                        bgPosYPercent = Math.floor(posIndex / 5) * 100;
                    }
                }

                // Label Logic: LOCAL / VISITOR X
                let topLabel = "";
                if (p.type === 'BOT') {
                    topLabel = (p.name || "VISITOR").toUpperCase();
                } else {
                    if (state.activeGambitId) {
                        topLabel = state.settings.localName || "LOCAL";
                    } else {
                        const humanIndex = state.players.filter(pl => pl.type === 'HUMAN').indexOf(p) + 1;
                        topLabel = p.name || `LOCAL ${humanIndex}`;
                    }
                }

                // Luxury Stats
                const luxCards = p.inventory.filter(c => c.type === 'LUXURY');
                const totalLuxPts = luxCards.reduce((acc, c) => acc + c.points, 0);
                const avgLux = luxCards.length > 0 ? (totalLuxPts / luxCards.length).toFixed(1) : "0.0";

                // Roll Stats
                const rawAvgRoll = p.rollCount > 0 ? (p.rollSum / p.rollCount) : 0;
                const displayAvgRoll = rawAvgRoll.toFixed(1);

                const mapAvgGold = p.mapCardsFlipped > 0 ? (p.totalGold / p.mapCardsFlipped) : 0;
                const displayMapAvg = mapAvgGold.toFixed(1);

                // Awards Checks
                const isWealthiest = (p.totalGold === maxGold && p.totalGold > 0);
                const isLuckiest = (p.rollCount > 0 && Math.abs(mapAvgGold - maxMapAvg) < 0.001 && maxMapAvg > 0);
                const isUnluckiest = (p.rollCount > 0 && Math.abs(mapAvgGold - minMapAvg) < 0.001 && minMapAvg > 0);

                // New stats
                const spentGold = p.totalGold - p.gold;
                const goldPerPrestige = prestige > 0 ? (spentGold / prestige).toFixed(1) : "0.0";

                // Styles
                const rankColor = isWinner ? 'text-[#F3C80D]' : 'text-white';
                const borderHighlight = isWinner ? 'border-4 border-[#F3C80D]' : 'border border-white/10';
                const trophyHtml = isWinner ? '<span class="text-[64px] drop-shadow-2xl mr-3">🏆</span>' : '';
                
                playerColumnsHTML += `
                <div class="flex flex-col items-center w-[520px]">
                    <!-- Unified Header Area -->
                    <div class="h-[90px] flex flex-col items-center justify-center mb-2">
                        <div class="text-[64px] font-black font-overpass leading-none flex items-center justify-center ${rankColor} mb-1">
                            ${trophyHtml}#${rank}
                        </div>
                        <div class="text-[32px] font-black text-white uppercase tracking-widest font-overpass drop-shadow-lg">
                            ${topLabel}
                        </div>
                    </div>

                    <div class="v2-glass-plate w-[420px] h-[680px] p-0 flex flex-col items-center overflow-hidden mb-3 shrink-0 relative bg-no-repeat ${borderHighlight} rounded-[22px]" style="background-image: url('${bgUrl}'); background-size: ${bgSize}; background-position: ${bgPosXPercent}% ${bgPosYPercent}%;">
                    </div>

                    <div class="v2-glass-plate w-[520px] h-[150px] p-4 flex flex-col justify-center mb-3 shrink-0">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[32px] font-black text-white uppercase font-overpass leading-none">PRESTIGE:</span>
                            <span class="text-[32px] font-black ${rankColor} uppercase font-overpass leading-none">${prestige}</span>
                        </div>
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[32px] font-black text-white uppercase font-overpass leading-none">MAR-A-LAGO:</span>
                            <span class="text-[32px] font-black text-white uppercase font-overpass leading-none">${hasMara ? 'YES' : 'NO'}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-[32px] font-black text-white uppercase font-overpass leading-none">GOLD (END):</span>
                            <span class="text-[32px] font-black text-white uppercase font-overpass leading-none">${p.gold}</span>
                        </div>
                    </div>

                    <div class="v2-glass-plate w-[520px] h-[210px] p-4 flex flex-col justify-center shrink-0">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[26px] font-light text-white/80 uppercase font-overpass leading-none">AVG ROLL (LUCK):</span>
                            <span class="text-[26px] font-light text-white uppercase font-overpass leading-none">${displayAvgRoll}</span>
                        </div>
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[26px] font-light text-white/80 uppercase font-overpass leading-none">TOTAL GOLD:</span>
                            <span class="text-[26px] font-light text-white uppercase font-overpass leading-none">${p.totalGold} AU</span>
                        </div>
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[26px] font-light text-white/80 uppercase font-overpass leading-none">GOLD/PRESTIGE:</span>
                            <span class="text-[26px] font-light text-white uppercase font-overpass leading-none">${goldPerPrestige} AU</span>
                        </div>
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[26px] font-light text-white/80 uppercase font-overpass leading-none">GOLD/MAPCARD:</span>
                            <span class="text-[26px] font-light text-white uppercase font-overpass leading-none">${displayMapAvg} PTS</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-[26px] font-light text-white/80 uppercase font-overpass leading-none">AVG LUXURY CARD:</span>
                            <span class="text-[26px] font-light text-white uppercase font-overpass leading-none">${avgLux} PTS</span>
                        </div>
                    </div>

                    <!-- Awards under stats -->
                    <div class="flex flex-row flex-wrap justify-center items-center gap-2.5 mt-3 min-h-[44px] z-20">
                        ${isWealthiest ? '<div class="bg-green-600 text-white font-black font-overpass text-[22px] py-1 px-5 uppercase rounded-lg shadow-xl border border-green-800 tracking-wider">RICH</div>' : ''}
                        ${isLuckiest ? '<div class="bg-green-600 text-white font-black font-overpass text-[22px] py-1 px-5 uppercase rounded-lg shadow-xl border border-green-800 tracking-wider">LUCKY</div>' : ''}
                        ${isUnluckiest ? '<div class="bg-red-600 text-white font-black font-overpass text-[22px] py-1 px-5 uppercase rounded-lg shadow-xl border border-red-800 tracking-wider">BAD LUCK</div>' : ''}
                    </div>
                </div>
                `;
            });

            const zoomVal = state.zoom || 1.0;
            
            screen.innerHTML = `
                <div id="game-over-content" class="origin-center flex-shrink-0 flex flex-col items-center justify-center w-[3840px] h-[2160px] relative" style="transform: scale(${zoomVal}); transform-origin: center;">
                    <!-- GAME OVER Header & Duration centered above the plate -->
                    <div class="absolute top-[60px] left-1/2 -translate-x-1/2 z-50 flex flex-col items-center pointer-events-none text-center">
                        <div class="text-[90px] font-black text-white uppercase tracking-[0.2em] leading-none drop-shadow-lg font-overpass mb-3">GAME OVER</div>
                        <div class="text-[32px] font-bold text-white/80 uppercase tracking-widest leading-none font-overpass">GAME DURATION: ${timeStr}</div>
                    </div>

                    <!-- Main Glass Plate -->
                    <div id="game-over-plate" class="v2-panel absolute top-[250px] left-1/2 -translate-x-1/2 w-[2840px] h-[1660px] flex flex-col items-center justify-between p-10 overflow-visible bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl animate-pop-in">
                        <!-- Optional Gambit Outcome Subtitle -->
                        ${gambitMessageHTML ? `<div class="mt-2 text-center pointer-events-none">${gambitMessageHTML}</div>` : ''}

                        <!-- Stats Grid / Player Columns (with 100px space below to action bar) -->
                        <div class="flex flex-row justify-center items-start gap-[50px] w-full mt-2 mb-[100px] z-10">
                            ${playerColumnsHTML}
                        </div>

                        <!-- Bottom Action Bar -->
                        <div class="flex flex-row justify-center items-center gap-10 w-full mb-2 z-20 pointer-events-auto">
                            <button onclick="${secondaryBtnOnClick}"${secondaryBtnText ? '' : ' style="display:none"'} class="w-[520px] h-[120px] flex justify-center items-center font-overpass text-[44px] font-black uppercase text-white bg-transparent border-4 border-white/30 hover:border-white rounded-full leading-none shadow-2xl cursor-pointer hover:bg-white/10 hover:scale-105 transition-all tracking-widest drop-shadow-md">
                                ${secondaryBtnText}
                            </button>
                            <button onclick="${primaryBtnOnClick}" class="w-[520px] h-[120px] flex justify-center items-center btn-v2-glossy btn-start-pulse font-overpass text-[44px] font-black uppercase text-black bg-white rounded-full leading-none shadow-2xl cursor-pointer hover:scale-105 transition-all tracking-widest pt-1">
                                ${primaryBtnText}
                            </button>
                        </div>
                    </div>

                    <button onclick="app.togglePause()" class="absolute bottom-[48px] right-[167px] z-[60] text-white hover:text-[#F3C80D] transition-transform hover:rotate-90 hover:scale-110 drop-shadow-lg cursor-pointer pointer-events-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-24 w-24" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>`;

            // Animation clean-up to prevent resize flickers (standalone scale property fallback)
            const inner = document.getElementById('game-over-plate');
            if (inner) {
                inner.addEventListener('animationend', () => {
                    inner.classList.remove('animate-pop-in');
                }, { once: true });
            }

            // Re-apply current zoom to the new game-over content
            if (window.app && window.app.setBoardZoom) {
                window.app.setBoardZoom(state.zoom || 1.0);
            }
            
            // Force AutoZoom to recalculate immediately to guarantee perfect fit
            setTimeout(() => window.dispatchEvent(new Event('resize')), 10);

            // If it's NOT a gambit, show the screen immediately. 
            // If it IS a gambit, revealWinner already showed the intermediate overlay.
            screen.classList.remove('hidden');

            // Reset forfeit flag for the next match
            state.matchForfeited = false;
        } catch (e) {
            console.error("[EndGame] revealWinner crashed:", e);
            const screen = document.getElementById('game-over-screen');
            if (screen) {
                screen.classList.remove('hidden');
                screen.innerHTML = `<div class="text-white text-4xl">ERROR: END-GAME CRASHED</div><button onclick="app.exitToTitle()" class="btn-v2-glossy mt-10 px-10 py-5 text-black">EXIT</button>`;
            }
        }
    },


    resetHumanScores: async () => {
        if (state.stats) {
            state.stats.highScores = [];
            await saveProfile();
        }
        loadHighScores();
    },

    // Removed toggleConcierge implementation as it is now an alias at the top

    setHumans: (count, el) => {
        // Toggle active class in the row
        const row = el.closest('.v2-toggle-row');
        row.querySelectorAll('.v2-small-btn').forEach(btn => btn.classList.remove('active'));
        el.classList.add('active');
        console.log(`Humans set to: ${count}`);
    },

    setBots: (count, el) => {
        // Toggle active class in the row
        const row = el.closest('.v2-toggle-row');
        row.querySelectorAll('.v2-small-btn').forEach(btn => btn.classList.remove('active'));
        el.classList.add('active');
        console.log(`Bots set to: ${count}`);
    },







    startGambit: () => {
        if (!app.selectedGambitId) return;
        const gambit = GAMBIT_CAMPAIGN.find(g => g.id === app.selectedGambitId);
        if (!gambit) return;

        // STRICT DEMO GUARD: Block execution if somehow triggered
        const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
        if (isDemo && app.selectedGambitId > 20) {
            if (app.showStartPromoModal) app.showStartPromoModal();
            return;
        }

        state.activeGambitId = gambit.id;

        // 1. Map Setup Variations directly from brief.luxuryCards and brief.auctionCards
        let variation = "NONE";
        const luxOpen = gambit.brief && gambit.brief.luxuryCards === "Open";
        const aucOpen = gambit.brief && gambit.brief.auctionCards === "Open";
        if (luxOpen && aucOpen) {
            variation = "TOURNAMENT";
        } else if (luxOpen && !aucOpen) {
            variation = "JAEGA";
        } else if (!luxOpen && aucOpen) {
            variation = "ROXANA";
        } else if (!luxOpen && !aucOpen) {
            variation = "NONE";
        } else {
            const variationMap = {
                "Boca Raton": "NONE",
                "Spanish Variation": "ROXANA",
                "Red Reef Variation": "JAEGA",
                "Mizner Variation": "TOURNAMENT"
            };
            variation = variationMap[gambit.brief ? gambit.brief.boardSetup : ""] || "NONE";
        }
        app.setVariation(variation);

        // 2. Map Draft Modes from the new brief.draft string
        const draftMap = {
            "Pre-Selected": "RANDOM", // Bypasses draft UI, forced via setTimeout below
            "Pick 2": "PAIR",
            "Open Draft": "OPEN"
        };
        app.setSetupMode(draftMap[gambit.brief.draft] || "RANDOM");

        // 3. Configure Rules & Players
        state.config.showBotMoney = gambit.botMoneyVisible;
        state.config.humans = 1;
        const botCount = (gambit.opponents || []).filter(id => id && id > 0).length;
        state.config.bots = Math.min(botCount, 3);
        app.updateSetupUI();

        // 1. Hide the Gambit Menu Immediately
        const panelV2 = document.getElementById('panel-3-gambits-v2');
        if (panelV2) {
            panelV2.style.display = 'none';
        }
        
        // Initialize the base game first to populate state.players (pass true for gambit transition)
        app.startGame(true);

        if (gambit.brief.draft !== "Pre-Selected") {
            return;
        }

        // Force pre-selected character into the human player's slot
        const humanPlayer = state.players.find(p => p.type.toUpperCase() === 'HUMAN');
        if (gambit.brief.draft === "Pre-Selected" && humanPlayer && gambit.playAs) {
            const lookupName = gambit.playAs === "BRIGHTSHELL" ? "BRIGHT SHELL" : gambit.playAs;
            const forcedChar = CHARACTERS.find(c => c.name.toUpperCase() === lookupName.toUpperCase());
            if (forcedChar) {
                humanPlayer.character = forcedChar;
                humanPlayer.name = state.settings.localName || "LOCAL";
                finalizePlayerSetup(humanPlayer);
            }
        }

        // REFRESH UI
        initPlayerCards();
        updateUI();

        // Reveal Board and then show Confrontation Modal
        const revealAndShowModal = () => {
            const v2Container = document.getElementById('ui-v2-container');
            if (v2Container) v2Container.style.display = 'none'; 
            
            const gameUI = document.getElementById('game-ui');
            if (gameUI) {
                gameUI.classList.remove('opacity-0', 'pointer-events-none');
                gameUI.style.transition = 'opacity 0.4s ease-in';
                gameUI.style.opacity = '1';
                gameUI.style.pointerEvents = 'auto';
            }

            // Trigger the Confrontation Modal immediately
            app.showConfrontationModal();
        };

        // Minimal delay to ensure DOM state is settled
        setTimeout(revealAndShowModal, 50);
    },




    // Web Party Edition: Red Reef only, 2-4 local players, no visitors, party default names
    enforceWebPartyRules: () => {
        app.setVariation(WEB_PARTY.variation);
        applyWebPartyConfig(state.config);
        for (let i = 0; i < 4; i++) {
            const input = document.getElementById(`v3-input-name-${i}`);
            if (input && isSteamDefaultName(input.value)) input.value = defaultPartyName(i);
        }
    },

    // Web Party Edition: the Tutorial button plays the guided first Gambit
    // PALM BEACH tutorial (step 2.3). From the start screen (LEARN TO PLAY) or from the party menu's chapter list.
    startPalmBeachTutorial: (lessonId) => {
        const splash = document.getElementById('splash-screen');
        if (splash && !splash.classList.contains('opacity-0')) app.enterGame();     // leaves the start screen, starts the sound
        closeChapterList();
        enterPalmBeachTutorial(lessonId);
    },
    openPalmBeachChapters: () => {
        openChapterList(document.getElementById('panel-2-setup'), (lessonId) => app.startPalmBeachTutorial(lessonId));
    },
    closePalmBeachChapters: () => closeChapterList(),

    startWebTutorial: () => {
        // Hide the party menu first: while it is open, setVariation/setSetupMode apply the custom-match
        // unlock checks and would block the tutorial's Red Reef with a "LOCKED" message
        const setup = document.getElementById('panel-2-setup');
        if (setup) {
            setup.classList.add('hidden');
            setup.style.display = 'none';
        }
        // Remember the party settings (the tutorial gambits overwrite them) and play under player 1's name
        app.webPartySnapshot = { humans: state.config.humans, setupMode: state.config.setupMode };
        const nameInput = document.getElementById('v3-input-name-0');
        state.settings.localName = pickTutorialName(nameInput ? nameInput.value : '', state.settings.localName);
        app.selectGambitV2(WEB_PARTY.tutorialGambitId);
        app.startGambit();
    },

    // Web Party Edition: after a tutorial gambit, chain to the next lesson, retry, or finish to the party menu
    advanceWebTutorial: (isWin) => {
        const step = nextWebTutorialStep(state.activeGambitId, isWin);
        if (step.action === 'START') {
            app.selectGambitV2(step.gambitId);
            app.startGambit();
        } else {
            app.handleGambitExit();
        }
    },

    // Web Party Edition: show the dismissible "small window / rotate your device" notice when it applies
    updateWebSizeHint: (width, height) => {
        const el = document.getElementById('web-size-hint');
        const text = document.getElementById('web-size-hint-text');
        if (!el || !text) return;
        const kind = webSizeHint(width, height);
        if (!kind || app.webSizeHintDismissed) {
            el.style.display = 'none';
            return;
        }
        text.innerText = WEB_SIZE_HINT_TEXT[kind];
        el.style.display = 'flex';
    },

    dismissWebSizeHint: () => {
        app.webSizeHintDismissed = true;
        const el = document.getElementById('web-size-hint');
        if (el) el.style.display = 'none';
    },

    // Web Party Edition: touch screens have no hover, so a first tap previews an Open Draft card and a second tap on it chooses it
    tapOpenDraftCard: (charId) => {
        const tapKey = `${state.draftOrder[0]}:${charId}`;
        if (app.openDraftTapKey === tapKey) {
            app.openDraftTapKey = null;
            app.handleOpenDraftPick(charId);
            return;
        }
        app.openDraftTapKey = tapKey;
        document.querySelectorAll('[id^="gallery-thumb-"]').forEach(el => el.classList.remove('draft-previewed'));
        const card = document.getElementById(`gallery-thumb-${charId}`);
        if (card) card.classList.add('draft-previewed');
        const header = document.getElementById('gallery-header');
        const player = state.players.find(p => p.id === state.draftOrder[0]);
        if (header && player) header.innerText = `${player.name.toUpperCase()}: TAP AGAIN TO CHOOSE`;
    },

    // Web Party Edition: remove lesson popups/toast that a half-finished tutorial would leave over the party menu
    clearWebTutorialUI: () => {
        document.querySelectorAll('[id]').forEach(el => { if (isTutorialPopupId(el.id)) el.remove(); });
        ['tutorial-toast', 'toast-dismiss-btn', 'tutorial-arrow'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    },

    // Web Party Edition: bring back the player count and draft mode the tutorial gambits overwrote
    restoreWebPartySnapshot: () => {
        if (!app.webPartySnapshot) return;
        state.config.humans = app.webPartySnapshot.humans;
        state.config.setupMode = app.webPartySnapshot.setupMode;
        app.webPartySnapshot = null;
    },

    goToSetup: () => {
        app.goToSetupV2();
    },

    goToSetupV2: (bypassReminder = false) => {
        if (!bypassReminder && !GameConfig.isWeb) {
            const cleared = (state.playerProfile && Array.isArray(state.playerProfile.clearedGambits)) ? state.playerProfile.clearedGambits : [];
            const first4Completed = [1, 2, 3, 4].every(id => cleared.includes(id));
            const dontShow = localStorage.getItem('palmBeachDontShowTutorialRecommended') === 'true';

            if (!first4Completed && !dontShow) {
                app.showTutorialRecommendedModal();
                return;
            }
        }

        state.isGameOver = false;
        state.gameStarted = false; // FIXED STATE BLEED
        state.mode = 'SETUP';      // FIXED STATE BLEED
        state.activeGambitId = null; 

        const hub = document.getElementById('panel-1-hub');
        const setup = document.getElementById('panel-2-setup');
        const gambit = document.getElementById('panel-3-gambits');
        const gambitV2 = document.getElementById('panel-3-gambits-v2');
        const logo = document.getElementById('v2-main-logo');
        
        if (hub) {
            hub.classList.add('hidden');
            hub.style.display = 'none';
        }
        if (setup) {
            setup.classList.remove('hidden');
            setup.style.display = 'block';
        }
        if (gambit) {
            gambit.classList.add('hidden');
            gambit.style.display = 'none';
        }
        if (gambitV2) {
            gambitV2.classList.add('hidden');
            gambitV2.style.display = 'none';
        }
        if (logo) logo.classList.add('hidden');
        
        // Initialize V2 Defaults (2 Locals, 2 Visitors, Random Unlocked Bots)
        if (GameConfig.isWeb) {
            app.clearWebTutorialUI();
            app.restoreWebPartySnapshot();
            app.enforceWebPartyRules();
        } else if (app.customBotSelection.every(b => b === null)) {
            state.config.humans = 2;
            state.config.bots = 2;
            
            const pool = [1, 2, 3, 4, 5];
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            app.customBotSelection = [pool[0], pool[1], pool[2]];
        }
        
        // Populate first human player input with localName if still default
        const input0 = document.getElementById('v3-input-name-0');
        if (!GameConfig.isWeb && input0 && (input0.value === 'LOCAL 1' || input0.value === 'LOCAL')) {
            input0.value = state.settings.localName || 'LOCAL';
        }
        
        // Explicitly refresh setup UI to ensure locks are evaluated immediately
        app.updateSetupUI();
    },
    
    goToMenu: () => {
        if (window.app && window.app.goToMainHub) {
            window.app.goToMainHub();
        } else {
            window.app.exitToTitle();
        }
    },

    goToMainHub: () => {
        // Web Party Edition has a single menu after the splash screen: the party setup screen
        if (GameConfig.isWeb) {
            app.goToSetupV2(true);
            return;
        }
        state.isGameOver = false;
        state.gameStarted = false; // FIXED STATE BLEED
        state.mode = 'HUB';        // FIXED STATE BLEED
        const hub = document.getElementById('panel-1-hub');
        const setup = document.getElementById('panel-2-setup');
        const gambit = document.getElementById('panel-3-gambits');
        const gambitV2 = document.getElementById('panel-3-gambits-v2');
        const logo = document.getElementById('v2-main-logo');
        
        if (hub) {
            hub.classList.remove('hidden');
            hub.style.display = 'block';
        }
        if (setup) {
            setup.classList.add('hidden');
            setup.style.display = 'none';
        }
        if (gambit) {
            gambit.classList.add('hidden');
            gambit.style.display = 'none';
        }
        if (gambitV2) {
            gambitV2.classList.add('hidden');
            gambitV2.style.display = 'none';
        }
        if (logo) logo.classList.remove('hidden');
    },



    goToGambitsV2() {
        if (!state.settings.hasSetLocalName) {
            app.showLocalNamePopup(() => {
                app.goToGambitsV2();
            });
            return;
        }

        const v2Container = document.getElementById('ui-v2-container');
        if (v2Container) {
            v2Container.style.display = 'flex';
            v2Container.classList.add('active');
        }

        const v2Content = document.getElementById('ui-v2-content');
        if (v2Content) {
            v2Content.style.display = '';
        }

        state.isGameOver = false;  // FIXED STATE BLEED
        state.gameStarted = false; // FIXED STATE BLEED
        state.mode = 'GAMBITS';    // FIXED STATE BLEED
        const hub = document.getElementById('panel-1-hub');
        const setup = document.getElementById('panel-2-setup');
        const setupV2 = document.getElementById('panel-2-setup-v2');
        const gambit = document.getElementById('panel-3-gambits');
        const gambitV2 = document.getElementById('panel-3-gambits-v2');
        const logo = document.getElementById('v2-main-logo');

        if (hub) {
            hub.classList.add('hidden');
            hub.style.display = 'none';
        }
        if (setup) {
            setup.classList.add('hidden');
            setup.style.display = 'none';
        }
        if (setupV2) {
            setupV2.classList.add('hidden');
            setupV2.style.display = 'none';
        }
        if (gambit) {
            gambit.classList.add('hidden');
            gambit.style.display = 'none';
        }
        if (logo) logo.classList.add('hidden');
        
        if (gambitV2) {
            gambitV2.classList.remove('hidden');
            gambitV2.style.display = 'block';
            gambitV2.style.opacity = '1';
            gambitV2.style.pointerEvents = 'auto';
        }

        this.renderGambitGridV2();
        
        const cleared = state.playerProfile.clearedGambits || [];
        let activeId = 1;
        const nextGambit = GAMBIT_CAMPAIGN.find(g => !cleared.includes(g.id) && isGambitUnlocked(g.id));
        if (nextGambit) {
            activeId = nextGambit.id;
        } else {
            const highestUnlocked = GAMBIT_CAMPAIGN.filter(g => isGambitUnlocked(g.id)).pop();
            if (highestUnlocked) {
                activeId = highestUnlocked.id;
            } else {
                activeId = 1;
            }
        }

        this.selectGambitV2(activeId);
        this.updateLocalNameDisplays();

        // Progression Onboarding: Auto-show earliest unlocked level that has not had its auto-intro shown
        const seenIntros = state.playerProfile?.seenGambitLevelIntros || [];
        let autoLevel = null;
        for (let l = 1; l <= 10; l++) {
            if (isLevelUnlocked(l) && !seenIntros.includes(l)) {
                autoLevel = l;
                break;
            }
        }
        if (autoLevel !== null) {
            if (autoLevel === 1) {
                app.pendingLevel1OnboardingCue = true;
            }
            this.showGambitLevelPlate(autoLevel, true);
        }
    },

    showLocalNamePopup(callback) {
        const popup = document.getElementById('local-name-popup');
        const inner = document.getElementById('local-name-popup-inner');
        const input = document.getElementById('input-local-name');
        
        if (!popup || !inner || !input) return;
        
        input.value = state.settings.localName || 'LOCAL';
        this.localNameCallback = callback || null;
        
        popup.classList.remove('hidden');
        inner.classList.add('animate-pop-in');
        
        setTimeout(() => input.focus(), 100);
        
        inner.addEventListener('animationend', () => {
            inner.classList.remove('animate-pop-in');
        }, { once: true });
    },

    closeLocalNamePopup(event) {
        if (event && event.target.id !== 'local-name-popup') return;
        const popup = document.getElementById('local-name-popup');
        if (popup) popup.classList.add('hidden');
        this.localNameCallback = null;
    },

    submitLocalName() {
        const input = document.getElementById('input-local-name');
        const popup = document.getElementById('local-name-popup');
        if (!input || !popup) return;
        
        let name = input.value.trim().toUpperCase();
        if (!name) name = 'LOCAL';
        
        state.settings.localName = name;
        state.settings.hasSetLocalName = true;
        saveProfile();
        
        this.updateLocalNameDisplays();
        popup.classList.add('hidden');
        
        if (this.localNameCallback) {
            const cb = this.localNameCallback;
            this.localNameCallback = null;
            cb();
        }
    },

    updateLocalNameDisplays() {
        const name = state.settings.localName || 'LOCAL';
        const localHeader = document.getElementById('local-card-header-v2');
        if (localHeader) {
            localHeader.innerText = name + ':';
        }
        
        const input0 = document.getElementById('v3-input-name-0');
        if (input0 && (input0.value === 'LOCAL 1' || input0.value === 'LOCAL' || input0.value === '')) {
            input0.value = name;
        }
        
        state.players.forEach(p => {
            if (p.type === 'HUMAN') {
                p.name = name;
                const nameEl = document.getElementById(`p-name-${p.id}`);
                if (nameEl) nameEl.innerText = name;
            }
        });
    },

    renderGambitGridV2() {
        const container = document.getElementById('gambit-grid-v2');
        if (!container) return;
        container.innerHTML = '';

        const levels = 10;
        const hueMap = {1: 160, 2: 190, 3: 210, 4: 230, 5: 260, 6: 285, 7: 320, 8: 345, 9: 15, 10: 40};

        for (let row = 1; row <= levels; row++) {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'flex flex-row items-center gap-6 mb-6';
            
            const rowHue = hueMap[row];
            const isLevelFinished = [1,2,3,4,5].every(c => state.playerProfile.clearedGambits.includes((row-1)*5 + c));
            
            const isUnlockedLevel = isLevelUnlocked(row);
            const rowLabel = document.createElement('div');
            rowLabel.className = 'w-[400px] flex justify-end items-center pr-6 select-none';

            const tabButton = document.createElement('button');
            const lockedClass = isUnlockedLevel ? 'opacity-100' : 'opacity-60 hover:opacity-100';
            tabButton.className = `bg-[#26385C]/40 hover:bg-[#26385C]/70 backdrop-blur-md border border-white/15 hover:border-[#F3C80D]/40 rounded-xl px-5 py-2.5 shadow-md hover:shadow-[0_0_18px_rgba(243,200,13,0.15)] cursor-pointer transition-all hover:scale-[1.02] flex items-center justify-between gap-4 group font-overpass ${lockedClass}`;

            const labelText = row === 1 ? 'LEVEL 1 · INTRO' : `LEVEL ${row}`;
            tabButton.innerHTML = `
                <span class="text-[34px] font-black uppercase tracking-wider transition-colors drop-shadow-sm font-overpass" style="color: hsl(${rowHue}, 100%, 80%);">${labelText}</span>
                <span class="text-[26px] text-white/50 group-hover:text-[#F3C80D] transition-colors leading-none font-bold">ⓘ</span>
            `;
            tabButton.onclick = () => app.showGambitLevelPlate(row);

            rowLabel.appendChild(tabButton);
            rowDiv.appendChild(rowLabel);

            for (let col = 1; col <= 5; col++) {
                const i = (row - 1) * 5 + col;
                const node = document.createElement('div');
                node.className = 'gambit-node';
                if (col === 5) node.classList.add('gambit-hexagon');
                
                node.style.setProperty('--node-hue', rowHue);
                node.style.setProperty('--node-lightness', `${90 - (col * 10)}%`);
                node.innerText = i;

                if (i === 1 && state.onboardingCueGambit1) {
                    node.classList.add('ring-4', 'ring-[#F3C80D]', 'animate-pulse', 'shadow-[0_0_35px_rgba(243,200,13,0.9)]');
                }

                const isCleared = state.playerProfile.clearedGambits.includes(i);
                const isUnlocked = isGambitUnlocked(i);
                const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;

                if (isDemo && i > 20 && !state.godMode) {
                    // DEMO HARD LOCK: Gambits 21+ trigger promo modal, but shown with numbers & in color
                    node.classList.add('gambit-node-locked');
                    node.onclick = () => { if (app.showStartPromoModal) app.showStartPromoModal(); };
                } else if (isCleared) {
                    node.classList.add('gambit-node-cleared');
                    node.onclick = () => app.selectGambitV2(i);
                } else if (isUnlocked || state.godMode) {
                    node.classList.add('gambit-node-active');
                    node.onclick = () => app.selectGambitV2(i);
                } else {
                    node.classList.add('gambit-node-locked');
                }

                if (i === this.selectedGambitId) {
                    node.classList.add('gambit-node-selected');
                }
                rowDiv.appendChild(node);
            }
            container.appendChild(rowDiv);
        }
    },

    selectGambitV2(id) {
        if (id === 1 && state.onboardingCueGambit1) {
            state.onboardingCueGambit1 = false;
            this.renderGambitGridV2();
        }

        const gambit = GAMBIT_CAMPAIGN.find(g => g.id === id);
        if (!gambit) return;

        this.selectedGambitId = id;
        window.state.activeGambitId = id;

        // Update grid nodes visually
        document.querySelectorAll('.gambit-node').forEach(node => {
            if (parseInt(node.innerText) === id) {
                node.classList.add('gambit-node-selected');
            } else {
                node.classList.remove('gambit-node-selected');
            }
        });

        const botSpriteURL = new URL("/assets/visitors_sprite.webp", import.meta.url).href;
        
        // 1. Header & Strategy Brief
        const titleEl = document.getElementById('gambit-title-v2');
        if (titleEl) titleEl.innerText = `GAMBIT ${id} : ${gambit.name.toUpperCase()}`;

        const lockEl = document.getElementById('stat-unlock-v2');
        if (lockEl) lockEl.innerText = gambit.brief.unlockReward || "NONE";
        
        const luxStatus = (gambit.brief && gambit.brief.luxuryCards) ? gambit.brief.luxuryCards : ((gambit.brief && gambit.brief.boardSetup && (gambit.brief.boardSetup.includes("Red Reef") || gambit.brief.boardSetup.includes("Mizner"))) ? "Open" : "Closed");
        const aucStatus = (gambit.brief && gambit.brief.auctionCards) ? gambit.brief.auctionCards : ((gambit.brief && gambit.brief.boardSetup && (gambit.brief.boardSetup.includes("Spanish") || gambit.brief.boardSetup.includes("Mizner"))) ? "Open" : "Closed");
        const draftText = (gambit.brief && gambit.brief.draft) ? gambit.brief.draft : "Pre-Selected";
        const botMoneyText = gambit.botMoneyVisible ? "Yes" : "No";

        const setEl = document.getElementById('stat-set-v2');
        if (setEl) {
            setEl.innerHTML = `
                <div>Luxury Cards: <span class="font-bold text-white">${luxStatus}</span></div>
                <div>Auction Cards: <span class="font-bold text-white">${aucStatus}</span></div>
                <div>Draft: <span class="font-bold text-white">${draftText}</span></div>
                <div>Bot Money visible: <span class="font-bold text-white">${botMoneyText}</span></div>
            `;
        }
        
        const varImgEl = document.getElementById('gambit-variation-img-v2');
        if (varImgEl) {
            let imgKey = "Boca Raton";
            if (luxStatus === "Open" && aucStatus === "Open") imgKey = "Mizner Variation";
            else if (luxStatus === "Open" && aucStatus === "Closed") imgKey = "Red Reef Variation";
            else if (luxStatus === "Closed" && aucStatus === "Open") imgKey = "Spanish Variation";
            else imgKey = "Boca Raton";

            const variationImages = {
                "Boca Raton": new URL("/assets/open_none.webp", import.meta.url).href,
                "Spanish Variation": new URL("/assets/open_property_cards.webp", import.meta.url).href,
                "Red Reef Variation": new URL("/assets/open_luxury_cards.webp", import.meta.url).href,
                "Mizner Variation": new URL("/assets/open_all.webp", import.meta.url).href
            };
            const resolvedUrl = variationImages[imgKey];
            if (resolvedUrl) {
                varImgEl.style.backgroundImage = `url('${resolvedUrl}')`;
                varImgEl.style.display = 'block';
            } else {
                varImgEl.style.display = 'none';
            }
        }
        
        const fundsEl = document.getElementById('stat-funds-v2');
        if (fundsEl) fundsEl.innerText = gambit.botMoneyVisible ? "SHOW" : "HIDDEN";
        
        // Use the new dynamic evaluation engine text for the objective!
        const objEl = document.getElementById('stat-obj-v2');
        if (objEl) {
            objEl.innerText = (gambit.winCondition && gambit.winCondition.uiText) 
                ? gambit.winCondition.uiText.replace("GOAL: ", "") 
                : gambit.brief.condition;
        }
        
        // 3. Player Card (YOU)
        const playerCardEl = document.getElementById('player-card-v2');
        if (playerCardEl) {
            const draftType = (gambit.brief && gambit.brief.draft) ? gambit.brief.draft : "Pre-Selected";
            const playAsClean = (gambit.playAs || "").replace('_', ' ').toUpperCase();
            if (draftType === "Open Draft" || playAsClean === "OPEN DRAFT") {
                playerCardEl.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-[50px] font-black text-white/30 uppercase text-center font-overpass px-6 leading-normal select-none pointer-events-none">OPEN DRAFT</div>`;
            } else if (draftType === "Pick 2" || playAsClean === "PICK 2") {
                playerCardEl.innerHTML = `<div class="absolute inset-0 flex items-center justify-center text-[50px] font-black text-white/30 uppercase text-center font-overpass px-6 leading-normal select-none pointer-events-none">PICK 2</div>`;
            } else {
                const lookupNameRaw = gambit.playAs === "BRIGHTSHELL" ? "BRIGHT SHELL" : gambit.playAs;
                const lookupName = lookupNameRaw === "KINGSTONE" ? "KINGSTON" : lookupNameRaw;
                const playerChar = CHARACTERS.find(c => c.name.toUpperCase() === lookupName.toUpperCase());
                if (playerChar) {
                    const charIndex = CHARACTERS.findIndex(c => c.name === playerChar.name);
                    const posX = (charIndex % 5) * 25;
                    const posY = Math.floor(charIndex / 5) * 100;
                    playerCardEl.innerHTML = `<div class="absolute inset-0 bg-no-repeat rounded-[18px]" style="background-image: url('${CHARACTER_SPRITE_PRINT_URL}'); background-size: 500% 200%; background-position: ${posX}% ${posY}%;"></div>`;
                }
            }
        }

        // 4. Opponents Logic (Bot Slots 1-3)
        for (let i = 0; i < 3; i++) {
            const botNum = gambit.opponents[i];
            const nameEl = document.getElementById(`bot-${i+1}-name-v2`);
            const abilityEl = document.getElementById(`bot-${i+1}-ability-v2`);
            const loreEl = document.getElementById(`bot-${i+1}-lore-v2`);
            const cardEl = document.getElementById(`bot-${i+1}-card-v2`);
            const headerEl = document.getElementById(`bot-${i+1}-header-v2`);
            
            if (cardEl) {
                const colEl = cardEl.parentElement;
                if (botNum) {
                    if (colEl) colEl.style.display = 'flex';
                    const botData = botRoster.find(b => b.id === botNum);
                    if (botData) {
                        if (headerEl) headerEl.innerText = `${botData.name.toUpperCase()}:`;
                        if (nameEl) nameEl.innerText = botData.name;
                        if (loreEl) loreEl.innerText = ""; // Lore removed to make room for Strategy Brief
                        const intLabel = botData.intelligence ? (botData.intelligence.charAt(0) + botData.intelligence.slice(1).toLowerCase()) : "Standard";
                        const rerolls = botData.abilities?.maxRerolls || 0;
                        const rerollText = rerolls === 1 ? "1 Re-roll" : (rerolls > 1 ? `${rerolls} Re-rolls` : "");
                        if (abilityEl) abilityEl.innerText = rerollText ? `INTELLIGENCE: ${intLabel} • ${rerollText}` : `INTELLIGENCE: ${intLabel}`;

                        // Coordinate Math: 5 columns, 2 rows (percentage crop from recipe)
                        const posX = ((botNum - 1) % 5) * 25;
                        const posY = Math.floor((botNum - 1) / 5) * 100;
                        cardEl.innerHTML = `<div class="absolute inset-0 bg-no-repeat rounded-[18px]" style="background-image: url('${botSpriteURL}'); background-size: 500% 200%; background-position: ${posX}% ${posY}%;"></div>`;
                    }
                } else {
                    // Hide the column entirely if there is no visitor in this slot
                    if (colEl) colEl.style.display = 'none';
                }
            }
        }

        // 5. Dynamic Glow for Start Button
        const hueMap = {1: 160, 2: 190, 3: 210, 4: 230, 5: 260, 6: 285, 7: 320, 8: 345, 9: 15, 10: 40};
        const level = Math.ceil(id / 5);
        const btnHue = hueMap[level];
        const btnLightness = 90 - (((id - 1) % 5 + 1) * 10);
        const startBtn = document.getElementById('btn-start-gambit-v2');
        if (startBtn) {
            startBtn.style.setProperty('--node-hue', btnHue);
            startBtn.style.setProperty('--node-lightness', `${btnLightness}%`);
        }
    },

    restoreVisibleUIForCurrentState: () => {
        // 1. Recalculate zoom and ensure valid dimensions
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w > 0 && h > 0) {
            const scaleX = w / 3840;
            const scaleY = h / 2160;
            const zoom = Math.max(0.1, Math.min(scaleX, scaleY));
            app.setBoardZoom(zoom);
        }

        // 2. Restore state-specific visible root UI without indiscriminate display
        if (state.gameStarted && !state.isGameOver) {
            // Active match: ensure game-ui is visible and interactive
            const gameUI = document.getElementById('game-ui');
            if (gameUI) {
                if (gameUI.style.display === 'none') {
                    gameUI.style.display = '';
                }
                gameUI.classList.remove('opacity-0', 'pointer-events-none');
                gameUI.style.opacity = '1';
                gameUI.style.pointerEvents = 'auto';
            }
        } else if (state.mode === 'GAMBITS') {
            const v2Container = document.getElementById('ui-v2-container');
            if (v2Container) {
                v2Container.style.display = 'flex';
                v2Container.classList.add('active');
            }
            const v2Content = document.getElementById('ui-v2-content');
            if (v2Content && v2Content.style.display === 'none') {
                v2Content.style.display = '';
            }
            const gambitV2 = document.getElementById('panel-3-gambits-v2');
            if (gambitV2 && gambitV2.classList.contains('hidden')) {
                gambitV2.classList.remove('hidden');
                gambitV2.style.display = 'block';
            }
        } else if (state.mode === 'SETUP') {
            const v2Container = document.getElementById('ui-v2-container');
            if (v2Container) {
                v2Container.style.display = 'flex';
                v2Container.classList.add('active');
            }
            const setupV2 = document.getElementById('panel-2-setup-v2');
            if (setupV2 && setupV2.classList.contains('hidden')) {
                setupV2.classList.remove('hidden');
                setupV2.style.display = 'block';
            }
        } else if (state.mode === 'HUB' || state.mode === 'TITLE') {
            const v2Container = document.getElementById('ui-v2-container');
            if (v2Container) {
                v2Container.style.display = 'flex';
                v2Container.classList.add('active');
            }
            const hub = document.getElementById('panel-1-hub');
            if (hub && hub.classList.contains('hidden')) {
                hub.classList.remove('hidden');
                hub.style.display = 'block';
            }
        } else if (state.mode === 'GAME_OVER' || state.isGameOver) {
            const screen = document.getElementById('game-over-screen');
            if (screen && screen.classList.contains('hidden')) {
                screen.classList.remove('hidden');
                screen.style.display = '';
            }
        }
    }
};

// Mount app
window.app = app;
console.log("App mounted to window", window.app);

// Initial Setup
app.updateSetupUI();
app.setVariation('JAEGA');
renderNewsFeed();

if (import.meta.env?.DEV) {
    Debug.setupVisualConsole();
}

// Configure Window (Zoom)
configureGameWindow();

// Handle Electron Native Close Button via IPC
if (GameConfig.isElectron && typeof window.require !== 'undefined') {
    try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.on('window:close-request', () => {
            // Check if we are outside of active gameplay
            if (state.gameOverTriggered || window.isSafeExit || state.mode === 'TITLE' || state.mode === 'TUTORIAL') {
                ipcRenderer.send('app:quit');
            } else {
                // If in-game, ask for confirmation
                app.togglePause(); // Ensure pause menu is closed so they see the modal clearly
                app.quitToDesktop();
            }
        });
    } catch (e) {
        console.warn("Could not bind electron close handler:", e);
    }
}

// Load High Scores
loadHighScores();

// Skip Splash Screen if returning from a Soft Reset
window.addEventListener('DOMContentLoaded', async () => {
    // God Mode defaults to OFF for all builds
    state.godMode = false;
    const devHud = document.getElementById('dev-hud');
    if (devHud) devHud.classList.add('hidden');

    // Show/hide wishlist links based on edition (Demo only)
    const isDemo = !GameConfig || GameConfig.isDemo;
    const wishlistBtn = document.getElementById('wishlist-btn');
    if (wishlistBtn) {
        if (isDemo) {
            wishlistBtn.classList.remove('hidden');
        } else {
            wishlistBtn.classList.add('hidden');
        }
    }

    // Load player progress
    await loadProfile();

    // Check achievement conditions retroactively for loaded stats/profile progress
    if (typeof AchievementManager !== 'undefined' && AchievementManager.check) {
        AchievementManager.check();
    }

    // Sync loaded achievements with Steam (in case they were unlocked offline or in the demo)
    if (typeof AchievementManager !== 'undefined' && AchievementManager.syncWithSteam) {
        AchievementManager.syncWithSteam();
    }

    // Apply speed settings immediately after load
    applySpeedCSS();

    // Sync Settings UI & Audio Engine with loaded data
    if (app.syncAudioWithSettings) app.syncAudioWithSettings();
    if (app.syncSettingsUI) app.syncSettingsUI();

    if (sessionStorage.getItem('skipSplash') === 'true') {
        sessionStorage.removeItem('skipSplash');
        if (window.app && window.app.enterGame) {
            // Slight delay to ensure DOM is fully ready
            setTimeout(() => window.app.enterGame(), 50);
        }
    }
});

// Auto-Zoom Implementation
let autoZoomTimer;
function initAutoZoom() {
    console.log("[AutoZoom] Initialized (Responsive Width / Conditional Zoom)");

    const handleResize = () => {
        clearTimeout(autoZoomTimer);
        autoZoomTimer = setTimeout(() => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            if (!w || !h || w <= 0 || h <= 0) {
                // Ignore zero/invalid dimensions triggered while minimized or during Alt+Tab
                return;
            }

            // Web Party Edition: a touch keyboard shrinks the window while a name is typed. Keep the layout
            // still until the box loses focus (the focusout listener below rescales afterwards).
            if (GameConfig.isWeb && isTextEntryElement(document.activeElement)) return;

            // 1. Hide the legacy resolution curtain (we scale infinitely now)
            const curtain = document.getElementById('resolution-curtain');
            if (curtain) curtain.classList.add('hidden');

            // 2. Always Fit Logic (4K Base)
            const scaleX = w / 3840;
            const scaleY = h / 2160;
            const zoom = Math.max(0.1, Math.min(scaleX, scaleY));

            // Apply zoom
            app.setBoardZoom(zoom);
            if (GameConfig.isWeb) app.updateWebSizeHint(w, h);
            console.log(`[AutoZoom] W:${w} H:${h} -> Zoom:${zoom.toFixed(3)}`);
        }, 100); // Debounce
    };

    window.addEventListener('resize', handleResize);
    // Web Party Edition: rescale once a name box loses focus (the resize guard above skipped the keyboard resizes)
    if (GameConfig.isWeb) document.addEventListener('focusout', handleResize);
    window.addEventListener('focus', () => {
        app.restoreVisibleUIForCurrentState();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            app.restoreVisibleUIForCurrentState();
        }
    });

    // Initial check
    handleResize();
}

initAutoZoom();

// Check Settings UI Visibility Criteria
function checkSettingsUI() {
    // Get all UI elements (both Start Menu and Pause Menu)
    const settingsFullscreenBtn = document.getElementById('settings-fullscreen-btn');
    const pauseFullscreenBtn = document.getElementById('pause-fullscreen-btn');
    const pauseZoomContainer = document.getElementById('pause-zoom-container');

    // 1. Fullscreen Button Visibility
    // Hide if in Electron (users use OS window controls)
    const hideFullscreen = GameConfig.isElectron;

    if (settingsFullscreenBtn) {
        settingsFullscreenBtn.style.display = hideFullscreen ? 'none' : 'block';
    }
    if (pauseFullscreenBtn) {
        pauseFullscreenBtn.style.display = hideFullscreen ? 'none' : 'block';
    }

    // 2. Zoom Slider Visibility (Pause Menu only)
    // Only show if window width > 1440px (Desktop view where manual scaling makes sense)
    const showZoom = window.innerWidth > 1440;

    if (pauseZoomContainer) {
        pauseZoomContainer.style.display = showZoom ? 'flex' : 'none';
    }
}

// Initialize Settings UI Check
checkSettingsUI();
window.addEventListener('resize', () => {
    requestAnimationFrame(checkSettingsUI);
});

// Unlock Full Version UI
function unlockFullVersionUI() {
    if (GameConfig.isFullGame) {
        // Variation Buttons
        ['btn-var-roxana', 'btn-var-jaega', 'btn-var-tournament'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.classList.remove('grayscale');
                const lockContainer = btn.querySelector('svg')?.parentElement;
                if (lockContainer && lockContainer.classList.contains('absolute')) {
                    lockContainer.remove();
                }
            }
        });
        
        // Setup Buttons (Humans & Draft Logic)
        ['btn-human-3', 'btn-human-4', 'btn-setup-pair', 'btn-setup-open'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                const svg = btn.querySelector('svg');
                if (svg) svg.remove();
                
                // Remove locked "Demo" styles
                btn.classList.remove('bg-slate-800', 'text-slate-400', 'border', 'border-slate-700', 'hover:brightness-110');
                
                // Add standard interactive styles
                btn.classList.add('btn-secondary');
            }
        });
    }
}
unlockFullVersionUI();

// 4. Initialize Background Shader
initBackgroundShader();


// 2. Web/Renderer Safe Reload Protection
// Prevent accidental close/refresh during gameplay
window.addEventListener('beforeunload', (e) => {
    // Electron relies on IPC close requests, so we must not block the window natively here
    if (GameConfig.isElectron) return;

    // Bypass if we are intentionally quitting/reloading via UI
    if (window.isSafeExit) {
        console.log("Safe Exit flag active - bypassing beforeunload");
        return;
    }

    // If game is in progress (checking if state exists and mode isn't just 'TITLE')
    if (state && state.mode !== 'TITLE') {
        console.log("Blocking unload - Game in progress");
        e.preventDefault();
        e.returnValue = ''; // Trigger browser confirmation dialog
        return '';
    }
});

// 3. Escape Key to Toggle Settings
window.addEventListener('keydown', (e) => {
    // Secret Dev HUD Toggle: Ctrl + Shift + D
    // Web Party Edition: dev hotkeys are disabled (typing a name with "u" must never hide the menu)
    if (!GameConfig.isWeb && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        state.godMode = !state.godMode;
        const devHud = document.getElementById('dev-hud');
        if (devHud) {
            if (state.godMode) {
                devHud.classList.remove('hidden');
                console.log("God Mode: ENABLED");
            } else {
                devHud.classList.add('hidden');
                console.log("God Mode: DISABLED");
            }
        }
        return; // Prevent other default actions
    }

    // Developer Toggle: V2 UI Container ('U' key)
    if (!GameConfig.isWeb && e.key.toLowerCase() === 'u') {
        const v2Container = document.getElementById('ui-v2-container');
        if (v2Container) {
            const isV2Visible = window.getComputedStyle(v2Container).display !== 'none';
            if (isV2Visible) {
                v2Container.style.display = 'none';
                v2Container.classList.remove('active');
                console.log("V2 UI: HIDDEN");
            } else {
                v2Container.style.display = 'flex';
                v2Container.classList.add('active');
                console.log("V2 UI: VISIBLE (DEBUG MODE)");
            }
        }
    }

    if (e.key === 'Escape') {
        if (state && state.mode === 'OPEN_DRAFT') {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // 1. Check open overlay modals
        const objectiveModal = document.getElementById('gambit-objective-modal');
        const isObjectiveOpen = objectiveModal && !objectiveModal.classList.contains('hidden');

        if (isObjectiveOpen) {
            app.closeGambitObjectivesModal();
            return;
        }

        const abortModal = document.getElementById('abort-match-modal');
        const isAbortOpen = abortModal && !abortModal.classList.contains('hidden');

        const compModal = document.getElementById('compendium-modal');
        const isCompOpen = compModal && !compModal.classList.contains('hidden');

        if (isAbortOpen) {
            app.closeAbortMatchModal();
            return;
        }

        if (isCompOpen) {
            app.closeCompendium();
            return;
        }

        const modals = ['unified-settings-modal', 'rulebook-modal', 'gallery-modal', 'ability-modal', 'message-modal', 'god-mode-overlay', 'resign-modal', 'confrontation-modal', 'promo-modal', 'start-promo-modal', 'support-modal', 'about-modal', 'local-name-popup', 'abort-match-modal', 'tutorial-recommended-modal', 'level-unlocked-modal'];
        const openModal = modals.find(id => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden');
        });

        if (openModal) {
            if (openModal === 'god-mode-overlay') {
                Debug.closeGodMode();
            } else if (openModal === 'unified-settings-modal') {
                app.toggleSettings();
            } else if (openModal === 'local-name-popup') {
                app.closeLocalNamePopup();
            } else if (openModal === 'promo-modal') {
                app.closePromoModal();
            } else {
                document.getElementById(openModal).classList.add('hidden');
            }
            return;
        }

        // 2. Contextual ESC Behavior (No overlay modal open)
        if (app.isMatchActive()) {
            // Active Gameplay (In-Match): Pressing ESC opens the Pause / Settings Overlay
            app.togglePause();
        } else {
            // Selection / Menu Screens (e.g. Gambit Select, Custom Setup):
            // Pressing ESC acts directly as a Back action, returning to Main Menu
            if (state.mode === 'SETUP' || state.mode === 'GAMBITS') {
                app.goToMainHub();
            }
        }
    }
});

// Initialize loop
requestAnimationFrame(checkSettingsUI);

// 5. GLOBAL FUNCTION EXPORT (The "Gemini Pattern" - Final Fix)
// Explicitly attach to window to bypass Vite module scoping and use native confirm
window.forceReturnToTitle = function () {
    console.log("Global forceReturnToTitle CALLED");

    // Use native confirm for maximum reliability
    if (!confirm("RETURN TO TITLE?\n\nAre you sure you want to quit? Unsaved progress will be lost.")) {
        return;
    }

    try {
        console.log("Executing Soft Reset...");

        // Hide Game UI Layers
        document.body.classList.remove('bg-black');
        const ids = ['game-ui', 'board-container', 'pause-menu', 'message-modal', 'gallery-modal', 'ability-modal'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('hidden');
                el.style.display = 'none'; // Force hide
            }
        });

        // Show V2 Hub
        const v2Container = document.getElementById('ui-v2-container');
        if (v2Container) {
            v2Container.style.display = 'flex';
            v2Container.classList.add('active');
            app.goToMainHub();
        }

        // Reset Game State
        if (window.audioMgr) window.audioMgr.stopBGM();
        if (window.state) {
            window.state.mode = 'TITLE';
            window.state.players = [];
            window.state.gameStarted = false;
        }

    } catch (e) {
        console.error("Force Reset Failed", e);
        window.location.reload();
    }
};

// Attach app to window for external access (e.g., from HTML)
window.app = app;
window.accessibleApp = app;
console.log("App initialized and exposed as window.app and window.accessibleApp");

// Initialize version display using Vite-injected defines
(function initVersionDisplay() {
    const buildVersion = typeof __BUILD_VERSION__ !== 'undefined' ? __BUILD_VERSION__ : '1.0.0';
    const buildDate = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'Local Dev';

    const splashVer = document.getElementById('splash-version-info');
    if (splashVer) {
        splashVer.innerText = `v${buildVersion} (${buildDate})`;
    }

    const hubVer = document.getElementById('hub-version-info');
    if (hubVer) {
        hubVer.innerText = `v${buildVersion} (${buildDate})`;
    }

    const settingsVer = document.getElementById('settings-version-info');
    if (settingsVer) {
        settingsVer.innerText = `v${buildVersion} (${buildDate})`;
    }

    const aboutVer = document.getElementById('about-version-info');
    if (aboutVer) {
        aboutVer.innerText = `Version ${buildVersion} - Build: ${buildDate}`;
    }
})();

// Explicitly bind the tutorial finish button and END GAME button (Robust for Electron)
// We use a polling strategy to ensure we catch it even if rendered late
// 5. GLOBAL DELEGATED LISTENER (The "Nuclear Option" for Electron/Web Consistency)
// This catches clicks on specific IDs regardless of when they were added or how they are nested.
document.addEventListener('click', (e) => {
    // 1. Tutorial Finish Button
    if (e.target && (e.target.id === 'tutorial-finish-btn' || e.target.closest('#tutorial-finish-btn'))) {
        console.log("Global Delegate: Tutorial Finish Clicked");
        e.preventDefault();
        e.stopPropagation();
        window.isSafeExit = true;
        if (app && app.exitToTitle) app.exitToTitle(true);
    }

    // 2. End Game Button (Pause Menu)
    if (e.target && (e.target.id === 'btn-return-title' || e.target.closest('#btn-return-title'))) {
        console.log("Global Delegate: End Game Clicked");
        e.preventDefault();
        e.stopPropagation();
        if (app && app.exitToTitle) app.exitToTitle();
    }

    // 3. Global Generic UI Click Sound
    const isUiClickTarget = e.target && (
        e.target.closest('button') || 
        e.target.tagName?.toLowerCase() === 'a' || 
        e.target.closest('.clickable') || 
        (e.target.tagName?.toLowerCase() === 'input' && (e.target.type === 'checkbox' || e.target.type === 'radio')) ||
        e.target.closest('.card') // Catch draft menu/gallery map cards if they don't have standard button markup
    );
    
    if (isUiClickTarget) {
        const uiContainerPaths = [
            '#splash-screen', '#ui-v2-container', '#pause-menu', '#game-over-screen',
            '#draft-overlay', '#gallery-modal', '#tournament-modal', '#roxana-modal', 
            '#jaega-modal', '#ability-modal', '#message-modal', '#tutorial-layer', 
            '#rulebook-modal', '#promo-modal', '#start-promo-modal', '#support-modal'
        ];
        
        const isMenuClick = uiContainerPaths.some(path => e.target.closest(path));
        const isGearIcon = e.target.closest('button[onclick="app.togglePause()"]');
        
        if (isMenuClick || isGearIcon) {
            // Respect Global SFX Mute/Volume settings
            const isSFXBlocked = audioMgr && audioMgr.config && !audioMgr.config.sfx;
            const currentSFXVol = (audioMgr && typeof audioMgr.sfxVolume === 'number') ? audioMgr.sfxVolume : 0.5;
            
            if (!isSFXBlocked) {
                // First Priority: Check if AudioManager is fully loaded so it uses the standard pipeline
                if (audioMgr && audioMgr.ctx && audioMgr.buffers && audioMgr.buffers['ui_click']) {
                    audioMgr.play('ui_click', { volume: 0.6 });
                } else if (nativeClickAudio) {
                    // Secondary Priority: If AudioManager is still booting/suspended (like the Splash Screen intro), force Native Audio!
                    nativeClickAudio.volume = Math.max(0, Math.min(1, Math.pow(currentSFXVol, 3) * 0.6));
                    nativeClickAudio.currentTime = 0;
                    nativeClickAudio.play().catch(err => console.warn("Native Click Audio Blocked (Auto-play policy):", err));
                }
            }
        }
    }
}, true); // Important: 'true' enables Capturing Mode so we intercept the click BEFORE standard UI stopPropagation() happens


