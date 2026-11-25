

import { CHARACTERS, AUCTION_SLOTS, PROPERTY_CARDS, FISCAL_TYPES, LUXURY_PREFS, GAME_SPRITE_URL, LUXURY_BACK_URL } from './data.js';
import { landmarkData } from './landmarks.js';
import { audioMgr } from './audio.js';
import { state } from './state.js';
import { createPalmBeachGame, renderPalmBeachTable, clearPalmBeachTable } from './pb/table.js';
import { renderPalmBeachPanels, clearPalmBeachPanels } from './pb/panels.js';
import { setupBoard, initPlayerCards, updateUI, updateCardVisuals, animateCellFlip, flyTextAnimation, flyCardAnimation, rollDiceVisual, getCharacterCardStyle, loadHighScores, setupAuctionVisuals, showAuctionBonusPopup, animateAuctionWin, triggerWaveAnimation, animateJaegaSetup, animateRoxanaSetup, showVariationSplash, centerBoardView, highlightTargetCell, clearTargetHighlight, showTurnBanner, hideDiceOverlay } from './ui.js';
import * as Debug from './debug.js';
import { TutorialManager } from './tutorial.js';
import { botRoster } from './bots.js';
import { getRandomDraftPool } from './draft_logic.js';
import { GAMBIT_CAMPAIGN } from './gambit_data.js';
import { buildBotKnowledgeState, validateBotKnowledge, getAvailableMapCells, analyzeBoardLines, findFinishers, findTrapCells, findSafeCells, chooseMapCell, chooseLuxuryDeck, chooseAuctionAction, isFullStrategicVisitor, isGranGranVisitor, getBotAiDepth, getBotLuxuryCost } from './ai_knowledge.js';
import { analyzeStrategicContext, evaluateTurnActions, compareLegacyAndStrategicDecision, formatStrategicContextSummary, resolveBotTurnExecution, shouldBotUseMapReroll, evaluateStrategicAuctionBid, resolveStrategicLuxuryRerollDecision, USE_STRATEGIC_FULL_BOTS, getStrategicPersonality, getMapRegion, LUXURY_SUCCESS_RATE, getLuxuryAttemptSuccessRate, recordBotReroll, __botRerollHistory, inspectBotRerollHistory, clearBotRerollHistory } from './ai_engine.js';

/**
 * Developer / Test Gate: When true, enables the strategic engine for all FULL bots (IDs 7..10) (Phase 5E.2).
 * Default is now true for active playtesting.
 */
export let USE_STRATEGIC_FULL_BOTS_STATE = true;
export let USE_STRATEGIC_GRAN_GRAN = USE_STRATEGIC_FULL_BOTS_STATE;

export function setStrategicFullBotsEnabled(enabled) {
    USE_STRATEGIC_FULL_BOTS_STATE = Boolean(enabled);
    USE_STRATEGIC_GRAN_GRAN = USE_STRATEGIC_FULL_BOTS_STATE;
    if (typeof window !== 'undefined') {
        window.USE_STRATEGIC_FULL_BOTS = USE_STRATEGIC_FULL_BOTS_STATE;
        window.USE_STRATEGIC_GRAN_GRAN = USE_STRATEGIC_FULL_BOTS_STATE;
    }
}

export function setStrategicGranGranEnabled(enabled) {
    setStrategicFullBotsEnabled(enabled);
}

// Re-export state
export { state };
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function tickUpText(element, start, end, duration) {
    const range = end - start;
    const startTime = performance.now();
    
    function update(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = Math.floor(start + range * progress);
        element.textContent = `+${current} Au`;
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    requestAnimationFrame(update);
}

function clearBotHighlights() {
    document.querySelectorAll('.bot-highlight').forEach(el => el.remove());
}

let granGranShadowDecisionCounter = 0;

function clearBotFocus() {
    document.querySelectorAll('.bot-focus').forEach(el => el.classList.remove('bot-focus'));
}

export function log(msg, type) {
    if (state.players[state.turn]) { state.players[state.turn].status = msg; updateUI(); }
    console.log(`[GAME] ${msg} (${type})`);
}

// --- GAME LOGIC ---

export function startGame() {
    audioMgr.init().then(() => {
        const sfxEl = document.getElementById('start-check-sfx');
        const musicEl = document.getElementById('start-check-music');

        // Default to true (unmuted) if elements not found, or use current value
        const sfxMuted = sfxEl ? sfxEl.checked : false;
        const musicMuted = musicEl ? musicEl.checked : false;

        // Note: The UI checkboxes are "Mute" toggles, so checked = muted
        // But audioMgr.updateConfig expects boolean for "enabled" (true = sound on)
        // Wait, let's check audioMgr.updateConfig signature. 
        // SyncSettingsUI in main.js says: const isSfxMuted = !audioMgr.config.sfx;
        // So config.sfx = true means sound ON.
        // The checkboxes are "Mute", so checked = true means sound OFF.
        // So we should pass !sfxMuted, !musicMuted.

        // HOWEVER, the previous code was:
        // const sfx = document.getElementById('check-sfx').checked;
        // audioMgr.updateConfig(sfx, music);
        // This implied that 'checked' meant 'enabled' in the old UI?
        // Let's look at index.html labels:
        // Start Screen: "Mute" label next to checkbox. So checked = Muted.

        // Let's check audioMgr.updateConfig implementation in audio.js (I need to read it first to be sure)
        // Check main.js usage: app.updateAudioFromStartScreen() calls audioMgr.updateConfig(!sfxMuted, !musicMuted) ??
        // I will assume for now that I need to invert the value if the checkbox is "Mute".
        // But wait, the previous code `audioMgr.updateConfig(sfx, music)` passed the checked value directly.
        // If the old UI had "Sound On" checkbox, then checked=true means sound on.
        // The new UI has "Mute" checkbox.

        // Let's simply read from the AudioMgr's current state which should be the source of truth if initialized?
        // Or if we want to sync FROM the start screen UI (which user might have just clicked):
        // If start-check-sfx is checked, it means MUTED.

        // I will first READ audio.js to see what updateConfig expects.
    });

    // Reset State
    state.turn = 0;
    state.mode = 'GAME';
    state.gameStarted = true;
    state.debugExtraTurns = 0;
    state.simulationMode = false;
    state.turnCount = 0;
    granGranShadowDecisionCounter = 0;
    state.startTime = Date.now();
    state.abilityActive = false;
    state.rerollPending = null;
    state.ericMode = null;
    state.godMode = false;
    state.jaegaRevealed = false;
    state.roxanaRevealed = false;
    state.gameOverTriggered = false;
    state.isGameOver = false;
    state.forcedWinnerId = undefined;

    // Initialize Mizner State
    if (state.config.miznerVariation) {
        state.config.roxanaVariation = true;
        state.config.jaegaVariation = true;
    }

    state.players = [];

    const humanCount = state.config.humans;
    const botCount = state.config.bots;
    const setupMode = state.config.setupMode;

    // Initialize Humans
    for (let i = 0; i < humanCount; i++) {
        const input = document.getElementById(`input-human-${i}`);
        const inputV3 = document.getElementById(`v3-input-name-${i}`);
        const inputV2 = document.getElementById(`v2-input-name-${i}`);
        const fallbackName = `${window.GameConfig && window.GameConfig.isWeb ? 'Player' : 'Local'} ${i + 1}`;
        let pName = (inputV3 && inputV3.value.trim()) || (inputV2 && inputV2.value.trim()) || (input && input.value.trim()) || fallbackName;
        
        // Strip padlocks and fallback text
        pName = pName.replace(/🔒/g, '').trim();
        if (pName === "EMPTY" || pName === "FULL VERSION" || pName === "FULL GAME") pName = fallbackName;
        
        state.players.push({
            id: i, name: pName, type: 'HUMAN',
            gold: 0, totalGold: 0, prestige: 0, bankedPrestige: 0, cards: 0, mapCardsFlipped: 0, inventory: [], lastBid: 0,
            character: null, counters: 0, status: 'Ready',
            rollSum: 0, rollCount: 0, justDidDoubleAction: false,
            rerolls: 2, extraTurns: 1
        });
    }

    // Initialize Bots
    let gambit = null;
    if (state.activeGambitId) {
        gambit = GAMBIT_CAMPAIGN.find(g => g.id === state.activeGambitId);
    }

    for (let i = 0; i < botCount; i++) {
        const input = document.getElementById(`input-bot-${i}`);
        
        let botId = i + 1; 
        if (!state.activeGambitId && window.app && window.app.customBotSelection && window.app.customBotSelection[i]) {
            botId = window.app.customBotSelection[i];
        } else if (gambit && gambit.opponents[i]) {
            botId = gambit.opponents[i];
        }
        
        const botDef = botRoster.find(b => b.id === botId) || botRoster[0];
        
        // Do NOT read v2/v3 inputs here, they belong exclusively to humans.
        let pName = (input && input.value.trim()) || (botDef ? botDef.name.toUpperCase() : `Visitor ${i + 1}`);
        if (pName === "EMPTY" || pName.startsWith("Visitor ")) pName = (botDef ? botDef.name.toUpperCase() : `Visitor ${i + 1}`);
        
        let initialGold = 0;
        let botRerolls = 0;
        let ghostChar = null;
        
        if (botDef.abilities) {
            initialGold = botDef.abilities.startingWealthBonus || 0;
            botRerolls = botDef.abilities.maxRerolls || 0;
            
            // Assign a fallback visual ghost character (UI safely ignores this for Bots now)
            ghostChar = CHARACTERS.find(c => c.name === 'LEJA') || CHARACTERS[0];
        }

        state.players.push({
            id: humanCount + i, name: pName, type: 'BOT',
            gold: initialGold, totalGold: initialGold, prestige: 0, bankedPrestige: 0, prestigePoints: 0, cards: 0, mapCardsFlipped: 0, inventory: [], lastBid: 0,
            character: ghostChar, counters: 0, status: 'Ready', personality: null, luxuryPreference: null,
            rollSum: 0, rollCount: 0, botRef: botDef, botId: botDef.id,
            intelligenceLevel: botDef.intelligenceLevel,
            rerolls: botRerolls, extraTurns: 0
        });
    }

    // Shuffle turn order
    // PALM BEACH: remember where each player sits (the order of the names in the party menu = clockwise round the table).
    // The shuffle below only decides who drafts first.
    state.players.forEach((p, idx) => { p.menuSeat = idx; });
    shuffle(state.players);
    state.players.forEach((p, idx) => p.id = idx);

    // ROUTING
    if (setupMode === 'PAIR') {
        window.app.startDraftPhase();
        return;
    } else if (setupMode === 'OPEN') {
        window.app.startOpenDraft();
        return;
    } else {
        // RANDOM MODE
        // Web Party Edition deals only from the unlocked (Demo) characters; Steam editions deal from all
        let availableChars = getRandomDraftPool(CHARACTERS, window.UnlockManager, !!(window.GameConfig && window.GameConfig.isWeb));

        availableChars = shuffle(availableChars);

        state.players.filter(p => p.type === 'HUMAN').forEach(p => {
            p.character = availableChars.pop();
            finalizePlayerSetup(p);
        });

        state.players.filter(p => p.type === 'BOT').forEach(p => {
            finalizePlayerSetup(p);
        });

        initGame();
    }
}

export function assignBotCharacters() {
    state.players.filter(p => p.type === 'BOT').forEach(p => {
        finalizePlayerSetup(p);
    });
    initGame();
    if (state.activeGambitId && window.app && typeof window.app.showConfrontationModal === 'function') {
        window.app.showConfrontationModal();
    }
}

export function finalizePlayerSetup(p) {
    if (p.type === 'HUMAN') {
        if (state.activeGambitId) {
            p.name = (window.state && window.state.settings && window.state.settings.localName) ? window.state.settings.localName : 'LOCAL';
        }
        if (!p.character) return;
        p.rerolls = state.activeGambitId === 11 ? 5 : p.character.startRerolls;
        p.extraTurns = p.character.startExtraTurns;
        p.counters = p.character.startPowers;
        if (p.character.name === 'MR. FLAGLER') {
            p.gold = 10;
            p.totalGold = 10;
        }
    }
    if (p.type === 'BOT') {
        const maxRerolls = (p.botRef && p.botRef.abilities) ? (p.botRef.abilities.maxRerolls || 0) : 0;
        p.rerolls = maxRerolls;
        p.counters = 0;
        p.extraTurns = 0;
        
        p.personality = (p.botRef && p.botRef.personality) ? p.botRef.personality : 'BALANCED';
        p.aiDepth = (p.botRef && p.botRef.aiDepth) ? p.botRef.aiDepth : 'LOW';
        p.luxuryPreference = 'SEMI_SAFE';
    }
}

export function initGame() {
    if (state.mode !== 'TUTORIAL') state.mode = 'GAME';
    if (state.activeGambitId === 1 || state.activeGambitId === 2 || state.activeGambitId === 3 || state.activeGambitId === 4) {
        state.tutorialStep = 1;
    } else {
        state.tutorialStep = 0;
    }
    state.gambit2IntroShown = false;

    // Clean up tutorial highlights, gold-frames, dimming, overlays and messages from previous matches
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
    document.querySelectorAll('.gold-frame-col').forEach(el => el.classList.remove('gold-frame-col'));
    document.querySelectorAll('.gold-frame-row').forEach(el => el.classList.remove('gold-frame-row'));

    // Clean up cinematic winner overlay and scatter classes
    const cinematicWinnerOverlay = document.getElementById('cinematic-winner-overlay');
    if (cinematicWinnerOverlay) {
        cinematicWinnerOverlay.classList.add('hidden');
        const victoryTitle = document.getElementById('cinematic-victory-title');
        const cardContainer = document.getElementById('cinematic-winner-card-container');
        const btnEl = document.getElementById('cinematic-see-results-btn');
        if (victoryTitle) victoryTitle.classList.remove('bounce-in-top');
        if (cardContainer) cardContainer.classList.remove('swirl-in-right-fwd');
        if (btnEl) btnEl.classList.remove('bounce-in-top');
    }

    const leftSidebar = document.getElementById('left-sidebar');
    const rightSidebar = document.getElementById('right-sidebar');
    if (leftSidebar) {
        leftSidebar.classList.remove('scatter-left');
    }
    if (rightSidebar) {
        rightSidebar.classList.remove('scatter-right');
    }

    const board = document.getElementById('game-board');
    if (board) {
        board.classList.remove('opacity-30', 'pointer-events-none', 'grayscale');
    }

    const toast = document.getElementById('tutorial-toast');
    if (toast) toast.classList.add('hidden');

    const toastDismissBtn = document.getElementById('toast-dismiss-btn');
    if (toastDismissBtn) toastDismissBtn.classList.add('hidden');

    const arrow = document.getElementById('tutorial-arrow');
    if (arrow) arrow.classList.add('hidden');

    const g1IntroOverlay = document.getElementById('g1-intro-overlay');
    if (g1IntroOverlay) g1IntroOverlay.remove();

    const g1Step2Overlay = document.getElementById('g1-step2-overlay');
    if (g1Step2Overlay) g1Step2Overlay.remove();

    const g2IntroOverlay = document.getElementById('g2-intro-overlay');
    if (g2IntroOverlay) g2IntroOverlay.remove();

    const g2BonusOverlay = document.getElementById('g2-bonus-overlay');
    if (g2BonusOverlay) g2BonusOverlay.remove();

    const g2LandmarkOverlay = document.getElementById('g2-landmark-overlay');
    if (g2LandmarkOverlay) g2LandmarkOverlay.remove();

    const g2LandmarkClickOverlay = document.getElementById('g2-landmark-click-overlay');
    if (g2LandmarkClickOverlay) g2LandmarkClickOverlay.remove();

    const g2CompendiumOverlay = document.getElementById('g2-compendium-overlay');
    if (g2CompendiumOverlay) g2CompendiumOverlay.remove();

    const g2RowBonusOverlay = document.getElementById('g2-row-bonus-overlay');
    if (g2RowBonusOverlay) g2RowBonusOverlay.remove();

    const g2RowBonusesOverlay = document.getElementById('g2-row-bonuses-overlay');
    if (g2RowBonusesOverlay) g2RowBonusesOverlay.remove();

    const g2ColBonusesOverlay = document.getElementById('g2-col-bonuses-overlay');
    if (g2ColBonusesOverlay) g2ColBonusesOverlay.remove();

    const g2DynamicMapsOverlay = document.getElementById('g2-dynamic-maps-overlay');
    if (g2DynamicMapsOverlay) g2DynamicMapsOverlay.remove();

    const g2EndOverlay = document.getElementById('g2-end-overlay');
    if (g2EndOverlay) g2EndOverlay.remove();

    const landmarkDossierOverlay = document.getElementById('landmark-dossier-overlay');
    if (landmarkDossierOverlay) landmarkDossierOverlay.remove();

    const g2StepPopup = document.getElementById('g2-step-popup');
    if (g2StepPopup) g2StepPopup.remove();

    const g3StepPopup = document.getElementById('g3-step-popup');
    if (g3StepPopup) g3StepPopup.remove();

    // Cleaned up Tournament sequencing

    state.luxuryTaxCounters = [0, 0, 0];
    state.carinaLockedCells = {};
    state.lejaTargetingActive = false;
    state.postTargetingActive = false;
    state.carinaTargetingActive = false;
    state.gambitImpossible = false;
    state.gambitImpossibleReason = "";
    state.gambitFailedObjectives = [];
    state.gambitImpossiblePopupShown = false;

    state.luxuryDecks = [
        { id: 0, cost: 5, cards: [], roll: 5, isFlippedOpen: false },
        { id: 1, cost: 10, cards: [], roll: 3, isFlippedOpen: false },
        { id: 2, cost: 15, cards: [], roll: 0, isFlippedOpen: false },
    ];
    generateLuxuryDecks();

    // --- BOT HOOKS: GAME START ---
    state.players.forEach(p => {
        if (p.type === 'BOT' && p.botRef?.hooks?.onGameStart) {
            p.botRef.hooks.onGameStart(state, p);
        }
    });

    const props = [...PROPERTY_CARDS];
    shuffle(props);
    if (state.activeGambitId === 3) {
        const gulfStreamCard = PROPERTY_CARDS.find(p => p.id === 1);
        const otherCards = PROPERTY_CARDS.filter(p => p.id !== 1);
        shuffle(otherCards);
        state.auctions = {
            A: { card: gulfStreamCard, flipped: false, triggered: false, resolved: false },
            B: { card: otherCards[0], flipped: false, triggered: false, resolved: false }
        };
    } else {
        state.auctions = {
            A: { card: props.pop(), flipped: false, triggered: false, resolved: false },
            B: { card: props.pop(), flipped: false, triggered: false, resolved: false }
        };
    }

    state.jaegaRevealed = (state.activeGambitId === 4);
    state.roxanaRevealed = false;
    state.gameOverTriggered = false;

    const v2Container = document.getElementById('ui-v2-container');
    if (v2Container) v2Container.style.display = 'none';

    setupBoard();
    initPlayerCards();
    updateUI();

    // PALM BEACH (step 1.2): a normal match shows the Palm Beach table instead of the Boca board.
    // The Boca turn cycle is not started: nothing is clickable until steps 1.4 and 1.5 connect the rules engine.
    state.pb = null;
    if (state.mode !== 'TUTORIAL' && !state.activeGambitId) {
        state.pb = createPalmBeachGame(state.players);
        if (typeof window !== 'undefined') window.pb = state.pb;
        // Draws the table and the panels again from the game (call after the game has changed).
        state.pb.refresh = () => {
            renderPalmBeachTable(state.pb.game);
            renderPalmBeachPanels(state.pb.game);
        };
        state.pb.refresh();
        document.getElementById('game-ui').classList.remove('opacity-0', 'pointer-events-none');
        centerBoardView();
        return;
    }
    clearPalmBeachTable();
    clearPalmBeachPanels();

    if (state.mode === 'TUTORIAL') {
        document.getElementById('game-ui').classList.remove('opacity-0', 'pointer-events-none');
        state.players[0].status = "Learning...";
        centerBoardView();
        updateUI();
        return;
    }

    let variation = state.config.jaegaVariation ? 'RED REEF' : (state.config.roxanaVariation ? 'SPANISH' : 'STANDARD');

    if (state.config.miznerVariation) {
        variation = `MIZNER VARIATION`;
    }

    // --- GAMBIT 1: THE HOOK (Inject 200 Au) ---
    if (state.activeGambitId === 1) {
        const human = state.players.find(p => p.type === 'HUMAN');
        if (human) {
            human.gold = 200;
            human.totalGold = 200;
        }
    }

    if (state.activeGambitId === 3) {
        const human = state.players.find(p => p.type === 'HUMAN');
        if (human) {
            human.gold = 40;
            human.totalGold = 40;
            human.inventory = [];
            human.prestige = 0;
            human.bankedPrestige = 0;
            human.cards = 0;
        }
        state.players.forEach(p => {
            if (p.type === 'BOT') {
                p.gold = 30;
                p.totalGold = 30;
                p.inventory = [];
                p.prestige = 0;
                p.bankedPrestige = 0;
                p.cards = 0;
            }
        });
    }

    centerBoardView();

    const runGameStart = () => {
        if (state.activeGambitId) {
            // Initialize variation state variables and visuals for Gambits since animations are bypassed
            if (state.config.jaegaVariation || state.config.miznerVariation) {
                state.jaegaRevealed = true;
            }
            if (state.config.roxanaVariation || state.config.miznerVariation) {
                state.roxanaRevealed = true;
                if (state.auctions.A.card) setupAuctionVisuals('A', state.auctions.A.card, false);
                if (state.auctions.B.card) setupAuctionVisuals('B', state.auctions.B.card, false);
            }

            // For Gambits, the Confrontation Modal in main.js handles the start trigger.
            updateUI();
            return;
        }

        if (state.config.miznerVariation) {
            animateJaegaSetup(() => {
                audioMgr.play('the_gong');
                state.jaegaRevealed = true;
                setTimeout(() => {
                    animateRoxanaSetup(() => {
                        audioMgr.play('the_gong');
                        state.roxanaRevealed = true;
                        setupAuctionVisuals('A', state.auctions.A.card);
                        setupAuctionVisuals('B', state.auctions.B.card);
                        updateUI();
                        setTimeout(() => startTurnCycle(), window.getDelay ? window.getDelay(300) : 300);
                    });
                }, window.getDelay ? window.getDelay(500) : 500);
            });
        } else if (state.config.jaegaVariation) {
            animateJaegaSetup(() => {
                audioMgr.play('the_gong');
                state.jaegaRevealed = true;
                updateUI();
                setTimeout(() => startTurnCycle(), window.getDelay ? window.getDelay(300) : 300);
            });
        } else if (state.config.roxanaVariation) {
            animateRoxanaSetup(() => {
                audioMgr.play('the_gong');
                state.roxanaRevealed = true;
                setupAuctionVisuals('A', state.auctions.A.card);
                setupAuctionVisuals('B', state.auctions.B.card);
                updateUI();
                setTimeout(() => startTurnCycle(), window.getDelay ? window.getDelay(300) : 300);
            });
        } else {
            updateUI();
            const startDelay = (typeof window !== 'undefined' && window.getDelay) ? window.getDelay(300) : 300;
            setTimeout(() => {
                startTurnCycle();
            }, startDelay);
        }
    };

    runGameStart();
}

function generateLuxuryDecks() {
    // Exact Luxury Card names per design specification
    const LUXURY_NAMES = [
        // 0-4 (1 pt)
        "Wine Cellar", "Designer Shoes", "Designer Handbag", "Luxury Watch", "Tiger Experience", 
        // 5-11 (2 pts)
        "Diamond Rings", "Sailing Yacht", "Horse", "Sports Car", "Personal Drone", "Private Jet", "Art Gallery", 
        // 12-16 (3 pts)
        "Football Team", "Luxury Hotel", "Rocket Ship", "Submarine", "Luxury Yacht" 
    ];
    let masterDeck = [];
    for (let i = 0; i < 17; i++) {
        let pts = 1;
        if (i > 4) pts = 2;
        if (i > 11) pts = 3;
        masterDeck.push({ spriteIndex: i, points: pts, type: 'LUXURY', name: LUXURY_NAMES[i] || 'Luxury Item' });
    }

    shuffle(masterDeck);
    // Explicitly track the source pile (5 Au, 10 Au, 15 Au) directly on each card
    state.luxuryDecks[0].cards = masterDeck.splice(0, 6).map(c => ({...c, cost: 5, tier: 1, sourcePile: 5, deckPile: 5}));
    state.luxuryDecks[1].cards = masterDeck.splice(0, 6).map(c => ({...c, cost: 10, tier: 2, sourcePile: 10, deckPile: 10}));
    state.luxuryDecks[2].cards = masterDeck.splice(0, masterDeck.length).map(c => ({...c, cost: 15, tier: 3, sourcePile: 15, deckPile: 15}));
    state.luxuryDecks.forEach(d => { d.isFlippedOpen = false; });
}

export function evaluateGambitCondition(player, condition, isMidGame, sortedPlayers = []) {
    if (!condition) return { met: true, isFail: false };
    if (!player) return { met: false, isFail: false };
    
    if (player.type === 'HUMAN' && window.state && window.state.gambitImpossible) {
        return { met: false, isFail: true };
    }

    if (isMidGame && condition.evaluateAt !== 'MID_GAME' && condition.evaluateAt !== 'MID_OR_END_GAME') return { met: false, isFail: false };

    const params = condition.params || {};
    let met = true;
    let isFail = false;

    // 1. Property Limit Check (Fail immediately if player exceeds maxProperties limit)
    const props = player.inventory.filter(c => c.type === 'PROPERTY').length;
    if (params.maxProperties !== undefined && props > params.maxProperties) {
        return { met: false, isFail: true };
    }

    // 2. Mathematical Elimination Check for Properties (Mid-Game)
    if (isMidGame && params.minProperties) {
        const botProps = (window.state.players || [])
            .filter(p => p.type === 'BOT')
            .reduce((acc, bot) => acc + bot.inventory.filter(c => c.type === 'PROPERTY').length, 0);
        
        // There are a maximum of 2 property auctions per game
        const remainingAuctions = 2 - botProps - props;
        if (props + remainingAuctions < params.minProperties) {
            return { met: false, isFail: true };
        }
    }

    if (params.requireGulfStream) {
        const humanPlayer = window.state.players.find(p => p.type === 'HUMAN');
        const botPlayer = window.state.players.find(p => p.type === 'BOT');
        
        const humanHasGulfStream = humanPlayer && humanPlayer.inventory.some(c => c.type === 'PROPERTY' && c.id === 1);
        const botHasGulfStream = botPlayer && botPlayer.inventory.some(c => c.type === 'PROPERTY' && c.id === 1);
        
        if (humanHasGulfStream) {
            return { met: true, isFail: false };
        } else if (botHasGulfStream) {
            return { met: false, isFail: true };
        } else {
            met = false;
        }
    }

    if (params.tutorialComplete && state.tutorialStep === 15) {
        // met stays true
    } else if (params.tutorialComplete) {
        met = false;
    }

    if (params.minGold && player.totalGold < params.minGold) met = false;
    if (params.needsLineBonus && !(player.hasRowBonus || player.hasColBonus)) met = false;
    if (params.requireRowCol && !(player.hasRowBonus || player.hasColBonus)) met = false;
    if (params.minProperties && props < params.minProperties) met = false;

    // Type B: Prestige condition
    if (params.minPrestige) {
        if (condition.evaluateAt === 'MID_OR_END_GAME' && !isMidGame) {
            // Do not require 15 prestige if evaluating at the end of the game naturally
        } else if (player.prestige < params.minPrestige) {
            met = false;
        }
    }

    // Type F: Luxury Card Sprint count
    const luxuryCards = player.inventory.filter(c => c.type === 'LUXURY');
    if (params.minLuxuryCards && luxuryCards.length < params.minLuxuryCards) {
        met = false;
    }

    // Type C: Luxury Hunt (Acquire at least 1 of the named luxury cards)
    if (params.luxuryCardOptions && Array.isArray(params.luxuryCardOptions) && params.luxuryCardOptions.length > 0) {
        const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const aliasMap = {
            vintagewine: 'winecellar',
            winecellar: 'winecellar',
            goldwatch: 'luxurywatch',
            luxurywatch: 'luxurywatch',
            tiger: 'tigerexperience',
            tigerexperience: 'tigerexperience',
            racingsailboat: 'sailingyacht',
            sailingyacht: 'sailingyacht',
            helicopter: 'personaldrone',
            personaldrone: 'personaldrone',
            soccerteam: 'footballteam',
            footballteam: 'footballteam',
            megamansion: 'luxuryhotel',
            luxuryhotel: 'luxuryhotel',
            rocket: 'rocketship',
            rocketship: 'rocketship',
            superyacht: 'luxuryyacht',
            luxuryyacht: 'luxuryyacht'
        };

        const targetNorms = params.luxuryCardOptions.map(opt => {
            const n = normalize(opt);
            return aliasMap[n] || n;
        });

        const hasNamedCard = luxuryCards.some(card => {
            const n = normalize(card.name);
            const resolved = aliasMap[n] || n;
            return targetNorms.includes(resolved);
        });

        if (!hasNamedCard) met = false;
    }

    // Type D: Luxury Portfolio (Acquire at least 1 Luxury Card from each pile: 15 Au, 10 Au, and 5 Au)
    if (params.requireLuxuryFromEachPile) {
        const has5Au = luxuryCards.some(c => c.sourcePile === 5 || c.deckPile === 5 || c.cost === 5 || c.tier === 1);
        const has10Au = luxuryCards.some(c => c.sourcePile === 10 || c.deckPile === 10 || c.cost === 10 || c.tier === 2);
        const has15Au = luxuryCards.some(c => c.sourcePile === 15 || c.deckPile === 15 || c.cost === 15 || c.tier === 3);
        if (!has5Au || !has10Au || !has15Au) met = false;
    }

    // Type E: Map Specialist objectives
    if (params.minLagoon && (player.lagoonFlipped || 0) < params.minLagoon) met = false;
    if (params.minAtlantic && (player.atlanticFlipped || 0) < params.minAtlantic) met = false;
    if (params.minWaterfrontLagoon && (player.waterfrontLagoonFlipped || 0) < params.minWaterfrontLagoon) met = false;
    if (params.minWaterfrontAtlantic && (player.waterfrontAtlanticFlipped || 0) < params.minWaterfrontAtlantic) met = false;
    if (params.minBlock && (player.blockFlipped || 0) < params.minBlock) met = false;

    // Legacy parameters backward compatibility
    const t0 = luxuryCards.filter(c => (c.cost === 5 || c.tier === 1)).length;
    const t1 = luxuryCards.filter(c => (c.cost === 10 || c.tier === 2)).length;
    const t2 = luxuryCards.filter(c => (c.cost === 15 || c.tier === 3)).length;
    if (params.minTier0 && t0 < params.minTier0) met = false;
    if (params.minTier1 && t1 < params.minTier1) met = false;
    if (params.minTier2 && t2 < params.minTier2) met = false;

    if (params.requireTigerOrHorse) {
        const hasTigerOrHorse = luxuryCards.some(c => (c.name.toLowerCase().includes('tiger') || c.name.toLowerCase().includes('horse')));
        if (!hasTigerOrHorse) met = false;
    }
    if (params.requireSubOrRocket) {
        const hasSubOrRocket = luxuryCards.some(c => (c.name.toLowerCase().includes('submarine') || c.name.toLowerCase().includes('rocket')));
        if (!hasSubOrRocket) met = false;
    }

    if (params.specificLuxuryIds) {
        const hasSpecific = luxuryCards.some(c => params.specificLuxuryIds.includes(c.spriteIndex));
        if (!hasSpecific) met = false;
    }

    // End Game Rank Check
    if (!isMidGame && sortedPlayers.length > 0) {
        const rank = sortedPlayers.indexOf(player) + 1;
        if (params.minRank && rank > params.minRank) met = false;
        
        if (params.botMustLose) {
            const bot = sortedPlayers.find(x => x.botId === params.botMustLose);
            if (!bot || sortedPlayers.indexOf(bot) !== sortedPlayers.length - 1) met = false;
        }
        if (params.botMustWin) {
            const bot = sortedPlayers.find(x => x.botId === params.botMustWin);
            if (!bot || sortedPlayers.indexOf(bot) !== 0) met = false;
        }
    }

    return { met, isFail };
}

window.evaluateGambitCondition = evaluateGambitCondition;

export function checkGambitObjectiveImpossibility() {
    if (!state.activeGambitId) return { isImpossible: false, reason: "", failedObjectives: [] };
    const gambit = (window.GAMBIT_CAMPAIGN || GAMBIT_CAMPAIGN).find(g => g.id === state.activeGambitId);
    if (!gambit || !gambit.winCondition) return { isImpossible: false, reason: "", failedObjectives: [] };

    const humanPlayer = (state.players || []).find(p => p.type === 'HUMAN');
    const botPlayers = (state.players || []).filter(p => p.type === 'BOT');
    if (!humanPlayer) return { isImpossible: false, reason: "", failedObjectives: [] };

    const cond = gambit.winCondition;
    const params = cond.params || {};
    const failedObjectives = [];
    let primaryReason = "";

    const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const aliasMap = {
        vintagewine: 'winecellar', winecellar: 'winecellar',
        goldwatch: 'luxurywatch', luxurywatch: 'luxurywatch',
        tiger: 'tigerexperience', tigerexperience: 'tigerexperience',
        racingsailboat: 'sailingyacht', sailingyacht: 'sailingyacht',
        helicopter: 'personaldrone', personaldrone: 'personaldrone',
        soccerteam: 'footballteam', footballteam: 'footballteam',
        megamansion: 'luxuryhotel', luxuryhotel: 'luxuryhotel',
        rocket: 'rocketship', rocketship: 'rocketship',
        superyacht: 'luxuryyacht', luxuryyacht: 'luxuryyacht'
    };

    const matchName = (cName, targetName) => {
        const n1 = aliasMap[normalize(cName)] || normalize(cName);
        const n2 = aliasMap[normalize(targetName)] || normalize(targetName);
        return n1 === n2 || n1.includes(n2) || n2.includes(n1);
    };

    // 1. Scenario 1: Luxury Hunt (Type C)
    if (params.luxuryCardOptions && Array.isArray(params.luxuryCardOptions) && params.luxuryCardOptions.length > 0) {
        const cardOptions = params.luxuryCardOptions;
        const humanHasAny = cardOptions.some(name =>
            humanPlayer.inventory.some(c => c.type === 'LUXURY' && matchName(c.name, name))
        );

        if (!humanHasAny) {
            const bothTakenByBots = cardOptions.every(name =>
                botPlayers.some(p => p.inventory.some(c => c.type === 'LUXURY' && matchName(c.name, name)))
            );
            if (bothTakenByBots) {
                const reason = `"${cardOptions[0]}" and "${cardOptions[1]}" have both been taken by opponents.`;
                failedObjectives.push({
                    type: 'C',
                    reason,
                    detail: 'Both required Luxury Cards were taken by opponents.'
                });
                if (!primaryReason) primaryReason = reason;
            }
        }
    }

    // 2. Scenario 2: Luxury Portfolio (Type D)
    if (params.requireLuxuryFromEachPile) {
        const has15 = humanPlayer.inventory.some(c => c.type === 'LUXURY' && (c.sourcePile === 15 || c.deckPile === 15 || c.cost === 15 || c.tier === 3));
        const has10 = humanPlayer.inventory.some(c => c.type === 'LUXURY' && (c.sourcePile === 10 || c.deckPile === 10 || c.cost === 10 || c.tier === 2));
        const has5 = humanPlayer.inventory.some(c => c.type === 'LUXURY' && (c.sourcePile === 5 || c.deckPile === 5 || c.cost === 5 || c.tier === 1));

        const deck15Empty = !state.luxuryDecks || !state.luxuryDecks[2] || state.luxuryDecks[2].cards.length === 0;
        const deck10Empty = !state.luxuryDecks || !state.luxuryDecks[1] || state.luxuryDecks[1].cards.length === 0;
        const deck5Empty = !state.luxuryDecks || !state.luxuryDecks[0] || state.luxuryDecks[0].cards.length === 0;

        if (!has15 && deck15Empty) {
            const reason = "The 15 Au Luxury pile is empty, and you have not collected a card from that pile.";
            failedObjectives.push({ type: 'D', pile: 15, reason, detail: 'The 15 Au Luxury pile is empty.' });
            if (!primaryReason) primaryReason = reason;
        }
        if (!has10 && deck10Empty) {
            const reason = "The 10 Au Luxury pile is empty, and you have not collected a card from that pile.";
            failedObjectives.push({ type: 'D', pile: 10, reason, detail: 'The 10 Au Luxury pile is empty.' });
            if (!primaryReason) primaryReason = reason;
        }
        if (!has5 && deck5Empty) {
            const reason = "The 5 Au Luxury pile is empty, and you have not collected a card from that pile.";
            failedObjectives.push({ type: 'D', pile: 5, reason, detail: 'The 5 Au Luxury pile is empty.' });
            if (!primaryReason) primaryReason = reason;
        }
    }

    // 3. Scenario 3: Map Specialist (Type E)
    if (state.grid) {
        if (params.minLagoon) {
            const cur = humanPlayer.lagoonFlipped || 0;
            const rem = state.grid.filter(c => !c.empty && !c.flipped && c.type === 'LAGOON').length;
            if (cur + rem < params.minLagoon) {
                const reason = `There are not enough Lagoon cards remaining to reach your target of ${params.minLagoon}.`;
                failedObjectives.push({ type: 'E', mapType: 'LAGOON', label: 'Lagoon', reason, detail: 'Not enough Lagoon cards remain.' });
                if (!primaryReason) primaryReason = reason;
            }
        }
        if (params.minWaterfrontLagoon) {
            const cur = humanPlayer.waterfrontLagoonFlipped || 0;
            const rem = state.grid.filter(c => !c.empty && !c.flipped && c.type === 'WF_L').length;
            if (cur + rem < params.minWaterfrontLagoon) {
                const reason = `There are not enough Waterfront Lagoon cards remaining to reach your target of ${params.minWaterfrontLagoon}.`;
                failedObjectives.push({ type: 'E', mapType: 'WF_L', label: 'Waterfront Lagoon', reason, detail: 'Not enough Waterfront Lagoon cards remain.' });
                if (!primaryReason) primaryReason = reason;
            }
        }
        if (params.minBlock) {
            const cur = humanPlayer.blockFlipped || 0;
            const rem = state.grid.filter(c => !c.empty && !c.flipped && c.type === 'BLOCK').length;
            if (cur + rem < params.minBlock) {
                const reason = `There are not enough Block cards remaining to reach your target of ${params.minBlock}.`;
                failedObjectives.push({ type: 'E', mapType: 'BLOCK', label: 'Block', reason, detail: 'Not enough Block cards remain.' });
                if (!primaryReason) primaryReason = reason;
            }
        }
        if (params.minWaterfrontAtlantic) {
            const cur = humanPlayer.waterfrontAtlanticFlipped || 0;
            const rem = state.grid.filter(c => !c.empty && !c.flipped && c.type === 'WF_R').length;
            if (cur + rem < params.minWaterfrontAtlantic) {
                const reason = `There are not enough Waterfront Atlantic cards remaining to reach your target of ${params.minWaterfrontAtlantic}.`;
                failedObjectives.push({ type: 'E', mapType: 'WF_R', label: 'Waterfront Atlantic', reason, detail: 'Not enough Waterfront Atlantic cards remain.' });
                if (!primaryReason) primaryReason = reason;
            }
        }
        if (params.minAtlantic) {
            const cur = humanPlayer.atlanticFlipped || 0;
            const rem = state.grid.filter(c => !c.empty && !c.flipped && c.type === 'ATLANTIC').length;
            if (cur + rem < params.minAtlantic) {
                const reason = `There are not enough Atlantic cards remaining to reach your target of ${params.minAtlantic}.`;
                failedObjectives.push({ type: 'E', mapType: 'ATLANTIC', label: 'Atlantic', reason, detail: 'Not enough Atlantic cards remain.' });
                if (!primaryReason) primaryReason = reason;
            }
        }
    }

    // 4. Special Property Restrictions (Gambit 11, 23)
    if (params.minProperties) {
        const humanProps = humanPlayer.inventory.filter(c => c.type === 'PROPERTY').length;
        const botProps = botPlayers.reduce((acc, b) => acc + b.inventory.filter(c => c.type === 'PROPERTY').length, 0);
        const remainingAuctions = 2 - botProps - humanProps;
        if (humanProps + remainingAuctions < params.minProperties) {
            const reason = "An opponent has acquired a Property Card, making it impossible to win both auctions.";
            failedObjectives.push({ type: 'PROPERTY', reason, detail: 'Property auction lost.' });
            if (!primaryReason) primaryReason = reason;
        }
    } else if (params.maxProperties === 0) {
        const humanProps = humanPlayer.inventory.filter(c => c.type === 'PROPERTY').length;
        if (humanProps > 0) {
            const reason = "You acquired a Property Card, violating the zero-property auction restriction.";
            failedObjectives.push({ type: 'PROPERTY', reason, detail: 'Property card acquired.' });
            if (!primaryReason) primaryReason = reason;
        }
    }

    return {
        isImpossible: failedObjectives.length > 0,
        reason: primaryReason,
        failedObjectives
    };
}

export function checkAndNotifyGambitImpossibility() {
    if (!state.activeGambitId || state.isGameOver || state.mode !== 'GAME') return false;
    const result = checkGambitObjectiveImpossibility();
    if (result.isImpossible) {
        state.gambitImpossible = true;
        state.gambitImpossibleReason = result.reason;
        state.gambitFailedObjectives = result.failedObjectives;

        if (!state.gambitImpossiblePopupShown) {
            state.gambitImpossiblePopupShown = true;
            if (window.app && typeof window.app.showObjectiveImpossibleModal === 'function') {
                window.app.showObjectiveImpossibleModal(result.reason);
            }
            return true;
        }
    }
    return false;
}

export function startTurnCycle() {
    if (state.isGameOver) return;
    if (state.gameOverTriggered) return;
    if (state.paused) { setTimeout(startTurnCycle, window.getDelay(500)); return; }
    if (state.mode === 'TUTORIAL') return;
    if (state.mode !== 'GAME') return; // Guard against ghost timers

    state.turnCount = (state.turnCount || 0) + 1;

    const player = state.players[state.turn];
    if (!player) {
        state.turn = 0;
        setTimeout(startTurnCycle, window.getDelay(50));
        return;
    }

    // Mr. Flagler's Free First Turn
    if (player.character && player.character.name === 'MR. FLAGLER' && !player.firstTurnTaken) {
        player.firstTurnTaken = true;
        state.extraTurnActive = true;
        log(`${player.name} (Mr. Flagler) receives a free extra turn at the end of this turn!`, 'success');
    }

    showTurnBanner(player.name, player.type === 'HUMAN');

    state.isProcessing = false;
    state.abilityActive = false;
    state.actionUsedThisTurn = false;
    state.ericMode = null;
    state.rerollPending = null;
    state.silvianoActive = false;
    state.silvianoActions = [];
    state.luxuryBoughtThisTurn = 0;
    player.turnsTakenCount = (player.turnsTakenCount || 0) + 1;
    if (window.app && window.app.closeSideAbilityPopup) {
        window.app.closeSideAbilityPopup();
    }
    document.getElementById('reroll-controls').classList.add('hidden');
    clearBotFocus();

    if (state.simulationMode) player.type = 'BOT';

    if (player.type === 'HUMAN') {
        player.status = state.debugExtraTurns > 0 ? "GOD MODE TURN" : "YOUR TURN";
        player.justDidDoubleAction = false;
        updateUI();
        if ([1, 2, 3, 4].includes(state.activeGambitId) && window.app && window.app.runTutorialStep) {
            window.app.runTutorialStep();
        }
    } else {
        player.status = "Thinking...";
        updateUI();
        state.isProcessing = true;
        const delay = window.getBotTurnDelay ? window.getBotTurnDelay() : 250;
        setTimeout(() => runBotTurn(player), delay);
    }
}

export function handleFlip(cell) {
    if (state.carinaTargetingActive) {
        if (!cell.flipped && (cell.type === 'BLOCK' || cell.type === 'WF_L' || cell.type === 'WF_R')) {
            window.app.executeCarinaLock(cell);
        }
        return;
    }

    // Intercept click on already flipped landmark card to show dossier
    if (cell.flipped) {
        const spriteRow = Math.floor(cell.spriteIndex / 8);
        const spriteCol = cell.spriteIndex % 8;
        const landmark = landmarkData.find(l => l.row === spriteRow && l.col === spriteCol);
        if (landmark && !state.isProcessing) {
            window.app.showLandmarkDossier(landmark, cell, false, "", null);
        }
        return;
    }

    // --- GAMBIT 3: Disable manual map flipping during tutorial introduction ---
    if (state.activeGambitId === 3 && state.tutorialStep <= 3) {
        return;
    }

    // --- GAMBIT 4: Disable manual map flipping during tutorial ---
    if (state.activeGambitId === 4) {
        return;
    }

    // --- GAMBIT 1: Disable Map ---
    if (state.activeGambitId === 1) {
        if (window.app && window.app.showMessage) {
            window.app.showMessage("MAP DISABLED", "<div class='text-[40px] leading-tight'>For this lesson, focus on the right sidebar.<br>Spend your <span class='text-[#F3C80D] font-black'>200 Au</span> to buy Luxury Cards and earn Prestige Points!</div>");
        }
        return;
    }

    if (state.mode === 'TUTORIAL') {
        if (state.tutorialStep === 'PRACTICE') {
            if (state.isProcessing || cell.flipped) return;
            processMove(cell);
            return;
        }
        return;
    }

    // Intercept landmark clicks in Step 8 of Gambit 2
    if (state.activeGambitId === 2 && state.tutorialStep === 8) {
        const spriteRow = Math.floor(cell.spriteIndex / 8);
        const spriteCol = cell.spriteIndex % 8;
        const landmark = landmarkData.find(l => l.row === spriteRow && l.col === spriteCol);
        if (landmark) {
            window.app.showLandmarkDossier(landmark, cell, false, "", null);
        }
        return;
    }

    if (state.godMode) {
        cell.flipped = !cell.flipped;
        if (cell.flipped) {
            updateCardVisuals(cell);
        } else {
            const cellEl = document.getElementById(`cell-container-${cell.id}`);
            const frontEl = document.getElementById(`cell-front-${cell.id}`);
            cellEl.style.backgroundImage = `url('${GAME_SPRITE_URL}')`;
            frontEl.classList.add('hidden');
            cellEl.classList.remove('bonus-effect', 'bg-white', 'cursor-default');
        }
        return;
    }

    if (state.mode !== 'GAME' || state.isProcessing || cell.flipped || state.players[state.turn].type !== 'HUMAN') return;

    // SHIFTED TO GAMBIT 2: Guided Map Clicking
    if (state.activeGambitId === 2 && state.tutorialStep <= 5) {
        if (state.tutorialStep === 1 && !(cell.r === 4 && cell.c === 2)) return;
        if (state.tutorialStep === 2 && !(cell.r === 4 && (cell.c === 1 || cell.c === 7))) return;
        if (state.tutorialStep === 3 && !(cell.r === 4 && cell.c === 8)) return;
        if (state.tutorialStep === 4 && !(cell.r === 4 && cell.c === 0)) return;
        if (state.tutorialStep === 5 && !(cell.r === 4 && cell.c === 3)) return;
    }
    if (state.activeGambitId === 2 && state.tutorialStep === 10 && cell.r !== 4) {
        return;
    }



    // Prevent Map Flip if Silviano already did one this turn
    if (state.silvianoActive && state.silvianoActions.includes('MAP')) {
        window.app.showMessage("ACTION LIMIT", "You already flipped a Map Card.<br>Now you must <strong>Buy a Luxury Card</strong>.", "OK");
        return;
    }

    if (state.ericMode) {
        if (cell.type === 'WF_L' || cell.type === 'WF_R') {
            state.isProcessing = true;
            state.ericMode.remaining--;

            animateCellFlip(cell, 0, false, () => {
                cell.flipped = true;
                updateCardVisuals(cell);
                const player = state.players[state.turn];
                player.mapCardsFlipped = (player.mapCardsFlipped || 0) + 1;
                if (cell.type === 'WF_L') player.waterfrontLagoonFlipped = (player.waterfrontLagoonFlipped || 0) + 1;
                if (cell.type === 'WF_R') player.waterfrontAtlanticFlipped = (player.waterfrontAtlanticFlipped || 0) + 1;
                checkLineBonuses(player, cell, () => {
                    const auctionId = getPendingAuction();
                    const colCells = state.grid.filter(c => c.c === cell.c && !c.empty);
                    const isColComplete = colCells.every(c => c.flipped);

                    if (auctionId || isColComplete || state.ericMode.remaining <= 0) {
                        state.ericMode = null;
                        state.abilityActive = false;
                        // Flying money animation removed
                        audioMgr.play('gold_large');
                        player.gold += 8;
                        player.totalGold += 8;
                        updateUI();

                        if (auctionId) {
                            setTimeout(() => triggerAuction(auctionId), window.getDelay(500));
                        } else {
                            nextTurn();
                        }
                    } else if (state.ericMode && state.ericMode.remaining > 0) {
                        state.isProcessing = false;
                        updateUI();
                    } else {
                        state.ericMode = null; state.abilityActive = false;
                        // Flying money animation removed
                        audioMgr.play('gold_large');
                        player.gold += 8;
                        player.totalGold += 8;
                        updateUI();
                        nextTurn();
                    }
                });
            });
        } else {
            log("Must choose Waterfront!", "fail");
        }
        return;
    }

    processMove(cell);
}

export function processMove(cell) {
    state.isProcessing = true;
    const player = state.players[state.turn];
    const targetId = `cell-container-${cell.id}`;

    // 1. Highlight Immediately
    document.getElementById(`cell-container-${cell.id}`)?.classList.remove('tutorial-highlight');
    highlightTargetCell(targetId);

    if (state.simulationMode) console.log(`[SIM] Processing Move on ${cell.id}`);

    const runLogic = () => {
        const isLocked = state.carinaLockedCells && state.carinaLockedCells[cell.id];
        const isCarina = player.character && player.character.name === 'CARINA';
        const needsRoll = (cell.difficulty > 0) || (isLocked && !isCarina);

        if (needsRoll) {
            let roll = Math.floor(Math.random() * 6) + 1;
            
            if (state.activeGambitId === 2 && state.tutorialStep === 3) roll = 5;
            if (state.activeGambitId === 2 && state.tutorialStep === 4) roll = 6;

            player.rollSum += roll; player.rollCount++;

            rollDiceVisual(roll, () => {
                let effectiveRoll = roll;
                let bonusApplied = false;

                if (player.type === 'BOT' && player.botRef && player.botRef.abilities && player.botRef.abilities.rollModifier) {
                    const mod = player.botRef.abilities.rollModifier;
                    if (mod.regions.includes("ALL") || mod.regions.includes(cell.type)) {
                        effectiveRoll += mod.value;
                        bonusApplied = true;
                    }
                }
                
                let success = false;
                if (isLocked && !isCarina) {
                    success = (roll === 5 || roll === 6);
                } else {
                    success = (effectiveRoll >= cell.difficulty);
                }

                if (player._pendingBotMapRerollTelemetry) {
                    player._pendingBotMapRerollTelemetry.rerollRoll = roll;
                    player._pendingBotMapRerollTelemetry.rerollSucceeded = success;
                    player._pendingBotMapRerollTelemetry = null;
                }

                if (success) {
                    if (bonusApplied && roll < cell.difficulty && !isLocked) {
                        const cellEl = document.getElementById(`cell-container-${cell.id}`);
                        const bonusText = document.createElement('span');
                        bonusText.className = 'absolute top-1/2 left-1/2 -mt-[30px] text-[#F3C80D] font-black text-[60px] font-overpass z-50 animate-burst pointer-events-none whitespace-nowrap';
                        bonusText.innerText = "+1 SKILL!";

                        cellEl.appendChild(bonusText);
                        setTimeout(() => bonusText.remove(), window.getDelay(1000));
                    }

                    audioMgr.play('dice_success');
                    if (player.type === 'HUMAN' && player.isExecutingReroll) {
                        if (window.AchievementManager) window.AchievementManager.unlock('SUCCESSFUL_RE_ROLL');
                        player.consecutiveMissedRerolls = 0;
                        player.isExecutingReroll = false;
                    }
                    completeMoveSuccess(player, cell);
                } else {
                    if (state.mode === 'GAME') {
                        if (player.rerolls > 0) {
                            if (player.type === 'HUMAN') {
                                state.rerollPending = { cell, type: 'REROLL_POWER' };
                                document.getElementById('dice-overlay').classList.remove('hidden');
                                document.getElementById('reroll-controls').classList.remove('hidden');
                                return;
                            } else {
                                const isBot = player.type === 'BOT';
                                const isStrategicActive = Boolean(
                                    typeof window !== 'undefined'
                                        ? (window.USE_STRATEGIC_AI !== undefined ? window.USE_STRATEGIC_AI : (window.USE_STRATEGIC_FULL_BOTS !== undefined ? window.USE_STRATEGIC_FULL_BOTS : (window.USE_STRATEGIC_GRAN_GRAN !== undefined ? window.USE_STRATEGIC_GRAN_GRAN : USE_STRATEGIC_FULL_BOTS_STATE)))
                                        : USE_STRATEGIC_FULL_BOTS_STATE
                                );
                                let shouldReroll = true;
                                let decisionReason = "LEGACY_REROLL_CONSUMPTION";
                                if (isBot && isStrategicActive) {
                                    const knowledge = buildBotKnowledgeState(state, player);
                                    const rerollDecision = shouldBotUseMapReroll(player, cell, knowledge);
                                    shouldReroll = rerollDecision.shouldReroll;
                                    decisionReason = rerollDecision.reason;
                                }

                                if (shouldReroll) {
                                    const rerollsBefore = player.rerolls;
                                    player.rerolls = Math.max(0, player.rerolls - 1);
                                    const rerollsAfter = player.rerolls;

                                    const telemetryEntry = {
                                        turnCount: state.turnCount !== undefined ? state.turnCount : (state.turn || 0),
                                        botId: player.botId !== undefined ? player.botId : (player.botRef?.id !== undefined ? player.botRef.id : player.id),
                                        botName: player.name,
                                        aiDepth: getBotAiDepth(player),
                                        personality: getStrategicPersonality(player),
                                        source: "MAP",
                                        rerollsBefore,
                                        rerollsAfter,
                                        targetId: cell.id,
                                        targetType: cell.type || "MAP_CELL",
                                        cellId: cell.id,
                                        region: getMapRegion(cell),
                                        difficulty: cell.difficulty !== undefined ? cell.difficulty : 0,
                                        locked: Boolean(isLocked && !isCarina),
                                        originalRoll: roll,
                                        rerollRoll: null,
                                        originalRollSucceeded: false,
                                        rerollSucceeded: null,
                                        plannedReroll: false,
                                        plannedRerollReason: null,
                                        decisionReason: decisionReason,
                                        strategicMapRerollReason: decisionReason
                                    };
                                    player._pendingBotMapRerollTelemetry = telemetryEntry;
                                    recordBotReroll(telemetryEntry);

                                    audioMgr.play('dice_loop');
                                    setTimeout(() => processMove(cell), window.getDelay(1000));
                                    return;
                                }
                            }
                        } else if (player.type === 'BOT' && player.counters > 0) {
                            player.counters = Math.max(0, player.counters - 1);
                            audioMgr.play('dice_loop');
                            setTimeout(() => processMove(cell), window.getDelay(1000));
                            return;
                        }
                    }
                    audioMgr.play('dice_fail');
                    if (player.type === 'HUMAN' && player.isExecutingReroll) {
                        player.consecutiveMissedRerolls = (player.consecutiveMissedRerolls || 0) + 1;
                        if (player.consecutiveMissedRerolls >= 3) {
                            if (window.AchievementManager) window.AchievementManager.unlock('MISS_3_RE_ROLLS');
                        }
                        player.isExecutingReroll = false;
                    }
                    clearBotHighlights();
                    clearBotFocus();
                    log(`Failed roll.`, 'fail');
                    player.status = "Failed Roll";
                    const cellEl = document.getElementById(`cell-container-${cell.id}`);
                    const miss = document.createElement('span');
                    miss.className = "absolute inset-0 flex items-center justify-center text-white font-black text-[80px] font-overpass drop-shadow-lg animate-bounce z-30";
                    miss.innerText = "MISS!";

                    cellEl.appendChild(miss);
                    setTimeout(() => {
                        miss.remove();
                        clearTargetHighlight(targetId);
                        if (state.mode === 'TUTORIAL') {
                            state.isProcessing = false;
                        } else {
                            finalizeTurn('MAP');
                        }
                    }, window.getDelay(1000));
                }
            });
        } else {
            completeMoveSuccess(player, cell);
        }
    };

    // 2. Smart Delay (Bots wait 500ms to show target, Humans go instantly)
    if (player.type === 'BOT') {
        setTimeout(runLogic, window.getDelay(500));
    } else {
        runLogic();
    }
}

function completeMoveSuccess(player, cell) {
    if (state.carinaLockedCells && state.carinaLockedCells[cell.id]) {
        delete state.carinaLockedCells[cell.id];
    }
    const targetId = `cell-container-${cell.id}`;
    // Highlight stays during bonus animation, cleared in triggerFlip
    clearBotHighlights();
    clearBotFocus();
    let earned = cell.value;
    if (state.activeGambitId === 2 && state.tutorialStep === 5 && cell.r === 4 && cell.c === 3) {
        cell.isBonus = true;
    }
    let isBonus = cell.isBonus;
    if (player.character && player.character.name === "KINGSTON" && (cell.c === 1 || cell.c === 7)) earned += 1;

    const cellEl = document.getElementById(targetId);
    const rewardContainer = cellEl.querySelector('.reward-container');
    const rewardBase = cellEl.querySelector('.reward-base');

    if (cell.type === 'BLOCK') {
        if (rewardBase) {
            rewardBase.textContent = '+3 Au';
        }
        const rewardBonus = cellEl.querySelector('.reward-bonus');
        if (rewardBonus) {
            rewardBonus.style.display = 'none';
        }
    }

    const triggerFlip = () => {
        // Clear highlight before flip starts
        clearTargetHighlight(targetId);

        // Update static card state and visuals immediately so it's ready underneath the flip
        cell.flipped = true;
        updateCardVisuals(cell);

        // Hide original reward container to prevent "ghosting" after the flip finishes
        if (rewardContainer) rewardContainer.style.visibility = 'hidden';

        animateCellFlip(cell, earned, isBonus, () => {
            player.mapCardsFlipped = (player.mapCardsFlipped || 0) + 1;
            if (cell.type === 'ATLANTIC') {
                player.atlanticFlipped = (player.atlanticFlipped || 0) + 1;
            }
            if (cell.type === 'LAGOON') {
                player.lagoonFlipped = (player.lagoonFlipped || 0) + 1;
            }
            if (cell.type === 'WF_L') {
                player.waterfrontLagoonFlipped = (player.waterfrontLagoonFlipped || 0) + 1;
            }
            if (cell.type === 'WF_R') {
                player.waterfrontAtlanticFlipped = (player.waterfrontAtlanticFlipped || 0) + 1;
            }
            if (cell.type === 'BLOCK') {
                player.blockFlipped = (player.blockFlipped || 0) + 1;
            }

            // --- BOT HOOKS: MAP CARD FLIPPED ---
            state.players.forEach(p => {
                if (p.type === 'BOT' && p.botRef?.hooks?.onMapCardFlipped) {
                    p.botRef.hooks.onMapCardFlipped(state, player, cell, audioMgr);
                }
            });


            // Handle Bonus Explosion (BLOCK cards cols 2-6)
            if (isBonus && cell.c >= 2 && cell.c <= 6) {
                // Re-apply highlight during bonus explosion
                highlightTargetCell(targetId);

                // Reset and show rewardBase on the card front so it displays the base value
                if (rewardBase) {
                    rewardBase.classList.remove('animate-burst');
                    rewardBase.textContent = `+${earned} Au`;
                    rewardBase.style.opacity = '1';
                    rewardBase.style.transform = 'translateX(-50%) scale(1)';
                    rewardBase.style.display = 'block';
                    rewardBase.style.visibility = 'visible';
                }

                // Show container again for the bonus burst
                if (rewardContainer) {
                    rewardContainer.style.display = 'block';
                    rewardContainer.style.visibility = 'visible';
                }
                cellEl.style.zIndex = '100';
                
                setTimeout(() => {
                    // Create green bonus element and float it up
                    const greenBonus = document.createElement('div');
                    greenBonus.className = 'reward-green-bonus';
                    greenBonus.textContent = '+5 Au BONUS!';
                    cellEl.appendChild(greenBonus);

                    audioMgr.play('gold_large');

                    // Tick up the text from base value (earned) to total value (earned + 5)
                    if (rewardBase) {
                        tickUpText(rewardBase, earned, earned + 5, window.getDelay(400));
                    }

                    setTimeout(() => {
                        greenBonus.remove();
                        cellEl.style.zIndex = '';
                        clearTargetHighlight(targetId); // Clear after bonus is done
                        
                        // Hide the container now that the bonus explosion is complete
                        if (rewardContainer) {
                            rewardContainer.style.display = 'none';
                            rewardContainer.style.visibility = 'hidden';
                        }

                        // Remove reward-bonus element if present (like ? tag)
                        const rewardBonus = cellEl.querySelector('.reward-bonus');
                        if (rewardBonus) {
                            rewardBonus.remove();
                        }

                        if (state.activeGambitId === 2 && state.tutorialStep === 5) {
                            state.tutorialStep = 6;
                            if (window.app && window.app.runTutorialStep) {
                                window.app.runTutorialStep();
                            }
                        }
                    }, window.getDelay(1500, 'visual')); // 'visual' keeps it on screen longer
                }, window.getDelay(100)); // Reduced from 600ms
            }


            if (earned >= 5) {
                audioMgr.play('gold_large');
            } else {
                audioMgr.play('gold_small');
            }

            player.gold += earned;
            player.totalGold += earned;
            if (isBonus && cell.c >= 2 && cell.c <= 6) {
                player.gold += 5;
                player.totalGold += 5;
            }
            
            // Track Career Stats
            if (player.type === 'HUMAN' && state.stats) {
                state.stats.totalAuEarned += earned;
                if (isBonus && cell.c >= 2 && cell.c <= 6) {
                    state.stats.totalAuEarned += 5;
                }
                AchievementManager.check(); // Real-time check for gold milestones
            }

            updateUI();

            // Calculate the sprite's original grid coordinates (Row-Major Sheet)
            const spriteRow = Math.floor(cell.spriteIndex / 8);
            const spriteCol = cell.spriteIndex % 8;
            const landmark = landmarkData.find(l => l.row === spriteRow && l.col === spriteCol);

            if (landmark) {
                let greenText = "";
                if (landmark.bonusType === "PLUS_ONE_AU") {
                    greenText = "+1 Au BONUS";
                } else if (landmark.bonusType === "PLUS_TWO_AU") {
                    greenText = "+2 Au BONUS";
                } else if (landmark.bonusType === "EXTRA_TURN") {
                    greenText = "EXTRA TURN";
                }

                if (greenText) {
                    const greenBonus = document.createElement('div');
                    greenBonus.className = 'reward-green-bonus';
                    greenBonus.textContent = greenText;
                    cellEl.appendChild(greenBonus);
                    setTimeout(() => {
                        greenBonus.remove();
                    }, window.getDelay(1500, 'visual'));
                }

                if (landmark.bonusType === "PLUS_ONE_AU") {
                    player.gold += 1;
                    player.totalGold += 1;
                    if (player.type === 'HUMAN' && state.stats) {
                        state.stats.totalAuEarned += 1;
                    }
                } else if (landmark.bonusType === "PLUS_TWO_AU") {
                    player.gold += 2;
                    player.totalGold += 2;
                    if (player.type === 'HUMAN' && state.stats) {
                        state.stats.totalAuEarned += 2;
                    }
                } else if (landmark.bonusType === "EXTRA_TURN") {
                    state.extraTurn = true;
                }
                
                state.isProcessing = true;
                updateUI(); // Reflect any immediate gold updates

                const callback = () => {
                    state.isProcessing = false;
                    checkLineBonuses(player, cell, () => {
                        if (state.mode === 'TUTORIAL') {
                            state.isProcessing = false;
                            TutorialManager.handleInteractionSuccess();
                            return;
                        }

                        if (player.character && player.character.name === "ADDISON" && player.lastBonus) {
                            player.lastBonus = false;
                            flyTextAnimation(`player-card-${player.id}`, player.id, "Skill!", () => {
                                updateUI(); finalizeTurn('MAP');
                            });
                        } else {
                            finalizeTurn('MAP');
                        }
                    });
                };

                if (player.type === 'HUMAN') {
                    window.app.showLandmarkDossier(landmark, cell, false, "", callback);
                } else {
                    window.app.showLandmarkDossier(landmark, cell, true, player.name, callback);
                }
            } else {
                checkLineBonuses(player, cell, () => {
                    if (state.mode === 'TUTORIAL') {
                        state.isProcessing = false;
                        TutorialManager.handleInteractionSuccess();
                        return;
                    }

                    if (player.character && player.character.name === "ADDISON" && player.lastBonus) {
                        player.lastBonus = false;
                        flyTextAnimation(`player-card-${player.id}`, player.id, "Skill!", () => {
                            updateUI(); finalizeTurn('MAP');
                        });
                    } else {
                        finalizeTurn('MAP');
                    }
                });
            }
        });
    };

    if (rewardBase) {
        if (rewardContainer) {
            rewardContainer.style.display = 'block';
            rewardContainer.style.visibility = 'visible';
        }
        // Remove drift classes and trigger burst
        rewardBase.classList.remove('animate-spark-v', 'animate-spark-h');
        rewardBase.classList.add('animate-burst');
        audioMgr.play('gold_small');
        cellEl.style.zIndex = '100';

        // Wait 1000ms (1.0s burst), then flip immediately
        setTimeout(() => {
            rewardBase.remove();
            cellEl.style.zIndex = '';
            triggerFlip();
        }, window.getDelay(1000, 'visual')); // 'visual' keeps it on screen longer

    } else {
        triggerFlip();
    }
}

function finalizeTurn(actionType) {
    if (state.mode === 'TUTORIAL') return;
    if (state.mode === 'AUCTION') return;

    // Handle Silviano's Active Double Action
    if (state.silvianoActive) {
        if (!state.silvianoActions.includes(actionType)) {
            state.silvianoActions.push(actionType);
        }

        const hasDoneMap = state.silvianoActions.includes('MAP');
        const hasDoneLuxury = state.silvianoActions.includes('LUXURY');

        if (hasDoneMap && hasDoneLuxury) {
            state.silvianoActive = false;
            if (window.app && window.app.closeSideAbilityPopup) {
                window.app.closeSideAbilityPopup();
            }
            // Proceed to next turn normally
        } else {
            // Player still has one action left
            state.isProcessing = false;
            const remaining = hasDoneMap ? "Buy Luxury" : "Flip Map";
            const player = state.players[state.turn];
            player.status = `Bonus Action: ${remaining}!`;
            flyTextAnimation(`player-card-${player.id}`, player.id, "DOUBLE ACTION!", null);
            updateUI();
            return; // STOP here, do not proceed to nextTurn or Auctions yet
        }
    }

    const auctionId = getPendingAuction();

    // Only trigger auction if there is a pending auction ID.
    // We intentionally ignore actionType to ensure auctions triggered during Silviano's double turn
    // Advance tutorial step if applicable (steps 1-4 increment automatically)
    if (state.activeGambitId === 2 && state.tutorialStep < 5 && actionType === 'MAP') {
        state.tutorialStep++;
        if (window.app && window.app.runTutorialStep) {
            window.app.runTutorialStep();
        }
    }
    if (handleGambit2Step10Progress(state, actionType)) {
        return;
    }

    if (auctionId) {
        const player = state.players[state.turn];
        player.status = "Auction Pending!";
        updateUI();
        setTimeout(() => triggerAuction(auctionId), window.getDelay(500));
    } else {
        setTimeout(() => nextTurn(), window.getDelay(300));
    }
}

export function handleGambit2Step10Progress(state, actionType = 'MAP') {
    if (state.activeGambitId === 2 && state.tutorialStep === 10 && actionType === 'MAP') {
        const row4Cells = state.grid.filter(c => c.r === 4 && !c.empty);
        const row4Complete = row4Cells.length === 9 && row4Cells.every(c => c.flipped);
        if (row4Complete) {
            const overlay = document.getElementById('g2-row-bonus-overlay');
            if (overlay) overlay.remove();
            state.tutorialStep = 11;
            if (window.app && window.app.runTutorialStep) {
                window.app.runTutorialStep();
            }
            return true;
        }
    }
    return false;
}
if (typeof window !== 'undefined') {
    window.handleGambit2Step10Progress = handleGambit2Step10Progress;
}

export function checkLineBonuses(player, cell, onComplete) {
    const rowCells = state.grid.filter(c => c.r === cell.r && !c.empty);
    const rowFlippedCount = rowCells.filter(c => c.flipped).length;
    const colCells = state.grid.filter(c => c.c === cell.c && !c.empty);
    const colFlippedCount = colCells.filter(c => c.flipped).length;

    const tasks = [];
    if (rowCells.length === 9 && rowFlippedCount === 9) {
        tasks.push({ type: 'ROW', cells: rowCells.sort((a, b) => a.c - b.c) });
    }
    if (colCells.length === 8 && colFlippedCount === 8) {
        tasks.push({ type: 'COLUMN', cells: colCells.sort((a, b) => a.r - b.r) });
    }

    if (tasks.length > 0) {
        player.lastBonus = true;
        player.hasLineBonus = true;
        
        tasks.forEach(task => {
            if (task.type === 'ROW') player.hasRowBonus = true;
            if (task.type === 'COLUMN') player.hasColBonus = true;
        });

        function runTasks() {
            if (tasks.length === 0) {
                onComplete();
                return;
            }
            const task = tasks.shift();
            triggerWaveAnimation(task.cells, player, task.type, runTasks);
        }
        runTasks();
    } else {
        onComplete();
    }
}
if (typeof window !== 'undefined') {
    window.checkLineBonuses = checkLineBonuses;
}

function getPendingAuction() {
    const leftRemaining = state.grid.filter(c => c.c === 1 && !c.flipped && !c.empty).length;
    if (leftRemaining === 0 && !state.auctions.A.triggered) return 'A';

    const rightRemaining = state.grid.filter(c => c.c === 7 && !c.flipped && !c.empty).length;
    if (rightRemaining === 0 && !state.auctions.B.triggered) return 'B';

    return null;
}

export function triggerAuction(id) {
    if (state.simulationMode) console.log(`[SIM] AUCTION TRIGGERED (${id})`);

    if (state.mode === 'AUCTION' && state.activeAuction && state.activeAuction.id === id) return;

    // Ensure central UI is visible by scrolling to top
    const boardContainer = document.getElementById('board-container');
    if (boardContainer) boardContainer.scrollTop = 0;

    audioMgr.play('auction_alert');
    state.mode = 'AUCTION';

    state.isProcessing = false;
    state.ericMode = null;
    state.silvianoActive = false; // Auction cancels double action remainder
    if (window.app && window.app.closeSideAbilityPopup) {
        window.app.closeSideAbilityPopup();
    }

    const auc = state.auctions[id];
    auc.triggered = true; auc.flipped = true;

    // Flip the map card immediately, but don't show center card yet
    setupAuctionVisuals(id, auc.card, false);

    // DELAY 2 Seconds
    setTimeout(() => {
        // Show center card and UI
        setupAuctionVisuals(id, auc.card, true);
        document.getElementById('central-auction-ui').classList.remove('hidden');

        const bonuses = [];
        const propName = auc.card.name;

        state.players.forEach(p => {
            if (!p.character) return;
            let bonus = 0;
            if (propName.includes("Spanish River")) {
                if (p.character.name === "ROXANA") bonus = 10;
            } else if (propName.includes("Gulf Stream")) {
                if (p.character.name === "CARINA") bonus = 10;
            } else if (propName.includes("Mar-a-Lago")) {
                if (p.character.name === "MS. POST") bonus = 20;
            }

            if (bonus > 0) {
                bonuses.push({
                    player: p,
                    amount: bonus,
                    reason: "BONUS!",
                    cardName: propName
                });
            }
        });

        const popupBonuses = bonuses.map(b => ({ playerName: b.player.name, amount: b.amount }));
        
        showAuctionBonusPopup(popupBonuses, propName, () => {
            bonuses.forEach(b => {
                b.player.gold += b.amount;
                b.player.totalGold += b.amount;
                if (b.player.type === 'HUMAN' && state.stats) {
                    state.stats.totalAuEarned += b.amount;
                }
            });
            updateUI();
            initAuction(id, auc);
        });
    }, window.getDelay(1500));
}

function initAuction(id, auc) {
    const startPlayerId = state.turn;
    state.players.forEach(p => p.lastBid = 0);

    const participants = state.players.map(p => p.id);
    const startIndex = participants.indexOf(startPlayerId);

    state.activeAuction = {
        id: id,
        card: { ...auc.card, type: 'PROPERTY' },
        currentBid: 0,
        highestBidder: null,
        participants: participants,
        turnIndex: startIndex,
        botLimits: {}
    };

    updateUI();
    setTimeout(() => auctionLoop(), window.getDelay(500));
}

export function rotateAuctionTurn() {
    const aa = state.activeAuction;
    aa.turnIndex = (aa.turnIndex + 1) % aa.participants.length;
}

export function auctionLoop() {
    if (state.gameOverTriggered) return;
    if (state.paused) { setTimeout(auctionLoop, window.getDelay(500)); return; }

    const aa = state.activeAuction;
    if (state.simulationMode && aa) console.log(`[SIM] Auction Loop Bid: ${aa.currentBid}`);

    // Use the new Central UI, removed the old text
    // document.getElementById('central-auction-bid')... handled in UI.js updateAuctionUI

    if (aa.participants.length === 1) { resolveAuction(aa.participants[0]); return; }

    if (aa.turnIndex >= aa.participants.length) aa.turnIndex = 0;

    const activePlayerId = aa.participants[aa.turnIndex];
    const player = state.players[activePlayerId];

    state.players.forEach(p => p.status = p.id === activePlayerId ? "Bidding..." : "Waiting");
    if (aa.highestBidder) aa.highestBidder.status = "High Bidder";

    updateUI();

    if (player.type === 'HUMAN' && !state.simulationMode) {
        const minBid = aa.currentBid + 1;
        if (player.gold < minBid) {
            // Force pass if can't match +1
            if (player.gold <= aa.currentBid) {
                window.app.handleAuctionAction('pass', player.id);
            }
        }
    }
    else if (player.type === 'BOT' || state.simulationMode) {
        runBotBid(player);
    }
}

async function runBotBid(bot) {
    const auctionDelay = window.getBotAuctionDelay ? window.getBotAuctionDelay() : 450;
    await new Promise(resolve => setTimeout(resolve, auctionDelay));

    try {
        const aa = state.activeAuction;
        if (!aa || !aa.participants || !aa.participants.includes(bot.id)) return;

        // --- 1. BUILD & VALIDATE SANITIZED KNOWLEDGE ---
        const knowledge = buildBotKnowledgeState(state, bot);
        const validationReport = validateBotKnowledge(knowledge);
        if (!validationReport.valid) {
            console.error("[BOT AUCTION AI] Invalid AI knowledge snapshot detected:", validationReport.errors);
        }

        // --- 2. EVALUATE SANITIZED DECISION ---
        const isBot = bot.type === 'BOT';
        const isStrategicActive = Boolean(
            typeof window !== 'undefined'
                ? (window.USE_STRATEGIC_AI !== undefined ? window.USE_STRATEGIC_AI : (window.USE_STRATEGIC_FULL_BOTS !== undefined ? window.USE_STRATEGIC_FULL_BOTS : (window.USE_STRATEGIC_GRAN_GRAN !== undefined ? window.USE_STRATEGIC_GRAN_GRAN : USE_STRATEGIC_FULL_BOTS_STATE)))
                : USE_STRATEGIC_FULL_BOTS_STATE
        );

        let decision;
        let executionMode = "LEGACY";

        if (isBot && isStrategicActive) {
            decision = evaluateStrategicAuctionBid(bot, knowledge);
            executionMode = "STRATEGIC";
        } else {
            decision = chooseAuctionAction(bot, knowledge);
            executionMode = "LEGACY";
        }

        // --- 3. LIVE DEBUG CAPTURE ON WINDOW ---
        if (typeof window !== 'undefined') {
            const auctionHistoryEntry = {
                botId: bot.botId !== undefined ? bot.botId : bot.id,
                botName: bot.name,
                turnCount: state.turnCount,
                executionMode,
                action: decision.action,
                amount: decision.amount,
                currentBid: aa.currentBid || 0,
                nextBid: (aa.currentBid || 0) + 1,
                targetBid: decision.targetBid,
                maxBid: decision.maxBid,
                reason: decision.reason,

                // Strategic Breakdown Fields (Sanitized Public Information Only)
                auctionPropertyPrestige: decision.auctionPropertyPrestige !== undefined ? decision.auctionPropertyPrestige : null,
                auctionBaseValueAu: decision.auctionBaseValueAu !== undefined ? decision.auctionBaseValueAu : null,
                auctionValueSource: decision.auctionValueSource || null,
                marALagoPremiumAu: decision.marALagoPremiumAu !== undefined ? decision.marALagoPremiumAu : 0,
                playerCountDenialFactor: decision.playerCountDenialFactor !== undefined ? decision.playerCountDenialFactor : null,
                denialBonusAu: decision.denialBonusAu !== undefined ? decision.denialBonusAu : null,
                leaderThreatPrestigeGap: decision.leaderThreatPrestigeGap !== undefined ? decision.leaderThreatPrestigeGap : 0,
                leaderThreatBonusAu: decision.leaderThreatBonusAu !== undefined ? decision.leaderThreatBonusAu : 0,
                luxuryMarketQuality: decision.luxuryMarketQuality || null,
                luxuryMarketAdjustmentAu: decision.luxuryMarketAdjustmentAu !== undefined ? decision.luxuryMarketAdjustmentAu : 0,
                futureAuctionReservePenaltyAu: decision.futureAuctionReservePenaltyAu !== undefined ? decision.futureAuctionReservePenaltyAu : 0,
                boardEndBonusAu: decision.boardEndBonusAu !== undefined ? decision.boardEndBonusAu : 0,
                isLastMeaningfulPurchase: Boolean(decision.isLastMeaningfulPurchase),
                strategicMaxBidAu: decision.strategicMaxBidAu !== undefined ? decision.strategicMaxBidAu : null,
                legacyMaxBid: decision.legacyMaxBid !== undefined ? decision.legacyMaxBid : (executionMode === "LEGACY" ? decision.maxBid : null),
                legacyAction: decision.legacyAction || (executionMode === "LEGACY" ? decision.action : null)
            };

            window.__lastBotAuctionDecision = auctionHistoryEntry;
            if (!Array.isArray(window.__botAuctionDecisionHistory)) {
                window.__botAuctionDecisionHistory = [];
            }
            window.__botAuctionDecisionHistory.push(auctionHistoryEntry);
            if (window.__botAuctionDecisionHistory.length > 100) {
                window.__botAuctionDecisionHistory.shift();
            }

            console.log(`[BOT AUCTION DECISION LIVE] [${executionMode}] ${bot.name}: ${decision.action} (${decision.reason})`, window.__lastBotAuctionDecision);
        }

        // --- 4. EXECUTE DECISION AT AUTHORITATIVE ENGINE BOUNDARY ---
        if (decision.action === 'RAISE') {
            window.app.handleAuctionAction('raise', bot.id, decision.amount || 1);
        } else {
            window.app.handleAuctionAction('pass', bot.id);
        }
    } catch (e) {
        console.error("Bot Bid Error", e);
        window.app.handleAuctionAction('pass', bot.id);
    }
}

function resolveAuction(winnerId) {
    const aa = state.activeAuction;
    const winner = state.players.find(p => p.id === winnerId);

    winner.gold -= aa.currentBid;
    if (winner.type === 'HUMAN' && aa.currentBid > 50) {
        if (window.AchievementManager) window.AchievementManager.unlock('SPEND_50_AU');
    }

    winner.inventory.push(aa.card);
    if (aa.card.points) winner.prestige += aa.card.points;
    winner.cards++;

    state.auctions[aa.id].resolved = true;

    // Hide UI
    document.getElementById('central-auction-ui').classList.add('hidden');

    animateAuctionWin(aa.id, aa.card, winner.id, () => {
        state.mode = 'GAME';
        state.activeAuction = null;
        updateUI();
        nextTurn();
    });
}

export function getLuxuryCost(player, deckIndexOrObject) {
    const deck = typeof deckIndexOrObject === 'object' ? deckIndexOrObject : state.luxuryDecks[deckIndexOrObject];
    if (!deck) return 999;
    
    let actualCost = deck.cost;
    if (player && (!player.character || player.character.name !== 'MS. POST')) {
        const taxCount = state.luxuryTaxCounters ? (state.luxuryTaxCounters[deck.id] || 0) : 0;
        actualCost += taxCount * 2;
    }
    return actualCost;
}

export function buyLuxury(deckIndex) {
    const player = state.players[state.turn];

    if (state.lejaTargetingActive) {
        if (player && player.type === 'HUMAN') {
            window.app.executeLejaCycle(deckIndex);
        }
        return;
    }

    if (state.postTargetingActive) {
        if (player && player.type === 'HUMAN') {
            window.app.executePostTax(deckIndex);
        }
        return;
    }

    if (state.activeGambitId === 2 || state.activeGambitId === 3 || state.activeGambitId === 4) return false;

    // Prevent Luxury Buy if Silviano already did one this turn
    if (state.silvianoActive && state.silvianoActions.includes('LUXURY')) {
        window.app.showMessage("LIMIT REACHED", "You already bought a Luxury Card!", "OK");
        return;
    }

    // NEW: Strict Order
    if (state.silvianoActive && !state.silvianoActions.includes('MAP')) {
        window.app.showMessage("INVALID ORDER", "Silviano's Ability Rule:<br><br>You must <strong>Pick a Map Card</strong> first!", "OK");
        return;
    }

    // Allow buying if GAME or TUTORIAL mode
    if ((state.mode !== 'GAME' && state.mode !== 'TUTORIAL') || state.isProcessing || player.type !== 'HUMAN') return;

    const deck = state.luxuryDecks[deckIndex];
    const actualCost = getLuxuryCost(player, deck);
    if (player.gold < actualCost) {
        log("Not enough gold!", "fail");
        return;
    }
    if (deck.cards.length === 0) return;

    processLuxuryBuy(player, deckIndex);
}

function processLuxuryBuy(player, deckIndex, isReroll = false) {
    state.isProcessing = true;
    const deck = state.luxuryDecks[deckIndex];
    const targetId = `deck-${deckIndex}`; // Target card directly, not the wrapper

    // 1. Highlight
    highlightTargetCell(targetId);

    const runLogic = () => {
        const effectiveCost = getLuxuryCost(player, deckIndex);
        if (!isReroll) {
            player.gold -= effectiveCost;
            if (player.type === 'HUMAN' && effectiveCost > 50) {
                if (window.AchievementManager) window.AchievementManager.unlock('SPEND_50_AU');
            }
            // Phase 5E.5 & 5E.6: Capture commitment for persistent Luxury rerolls across all available charges
            if (player.type === 'BOT') {
                player._luxuryRerollCommitted = Boolean(player._plannedLuxuryReroll);
                player._luxuryRerollCommitReason = player._plannedLuxuryRerollReason || null;
                player._luxuryAttemptSequenceNumber = 0;
                player._luxuryAttemptId = `turn${state.turnCount !== undefined ? state.turnCount : (state.turn || 0)}-bot${player.botId !== undefined ? player.botId : (player.botRef?.id !== undefined ? player.botRef.id : player.id)}-deck${deckIndex}`;
            }
            updateUI();
        }

        const difficulty = deck.roll;

        const finishBuy = (success) => {
            // Clean up persistent luxury reroll flags
            if (player.type === 'BOT') {
                player._luxuryRerollCommitted = false;
                player._luxuryRerollCommitReason = null;
                player._plannedLuxuryReroll = false;
                player._plannedLuxuryRerollReason = null;
                player._luxuryAttemptSequenceNumber = 0;
                player._luxuryAttemptId = null;
            }

            if (success) {
                const card = deck.cards.pop();
                deck.isFlippedOpen = false;
                player.inventory.push(card);
                player.prestige += card.points;
                player.cards++;

                // Track luxury bought this turn
                if (player.type === 'HUMAN') {
                    state.luxuryBoughtThisTurn = (state.luxuryBoughtThisTurn || 0) + 1;
                    if (state.luxuryBoughtThisTurn >= 2) {
                        if (window.AchievementManager) window.AchievementManager.unlock('BUY_2_LUXURY_CARDS');
                    }
                    if (player.isExecutingReroll) {
                        if (window.AchievementManager) window.AchievementManager.unlock('SUCCESSFUL_RE_ROLL');
                        player.consecutiveMissedRerolls = 0;
                        player.isExecutingReroll = false;
                    }
                    if (player.character && player.character.name === 'MR. FLAGLER' && player.turnsTakenCount === 1 && card.points === 3) {
                        if (window.AchievementManager) window.AchievementManager.unlock('FLAGLER_DOMINATES');
                    }
                }

                // Give bonus rerolls for specific Tier 1 (1 point) luxury cards
                if (card.spriteIndex === 2) {
                    player.rerolls = (player.rerolls || 0) + 1;
                } else if (card.spriteIndex === 3) {
                    player.rerolls = (player.rerolls || 0) + 1;
                } else if (card.spriteIndex === 4) {
                    player.rerolls = (player.rerolls || 0) + 2;
                }

                if (state.luxuryTaxCounters) {
                    state.luxuryTaxCounters[deckIndex] = 0;
                }

                flyCardAnimation(deckIndex, player.id, card, () => {
                    // 3. Clear Highlight
                    clearTargetHighlight(targetId);

                    audioMgr.play('gold_small');
                    updateUI();

                    if (state.mode === 'TUTORIAL') {
                        state.isProcessing = false;
                        TutorialManager.handleInteractionSuccess();
                        return;
                    }

                    finalizeTurn('LUXURY');
                });
            } else {
                log("Luxury Buy Failed!", "fail");
                audioMgr.play('dice_fail');
                if (player.type === 'HUMAN' && player.isExecutingReroll) {
                    player.consecutiveMissedRerolls = (player.consecutiveMissedRerolls || 0) + 1;
                    if (player.consecutiveMissedRerolls >= 3) {
                        if (window.AchievementManager) window.AchievementManager.unlock('MISS_3_RE_ROLLS');
                    }
                    player.isExecutingReroll = false;
                }
                updateUI();

                // Clear highlight on fail after short visual delay
                setTimeout(() => {
                    clearTargetHighlight(targetId);
                    if (state.mode === 'TUTORIAL') {
                        state.isProcessing = false;
                        return;
                    }
                    finalizeTurn('LUXURY');
                }, window.getDelay(500));
            }
        };

        if (difficulty > 0) {
            const roll = Math.floor(Math.random() * 6) + 1;
            player.rollSum += roll;
            player.rollCount++;

            rollDiceVisual(roll, () => {
                if (player._pendingBotLuxuryRerollTelemetry) {
                    player._pendingBotLuxuryRerollTelemetry.rerollRoll = roll;
                    player._pendingBotLuxuryRerollTelemetry.rerollSucceeded = (roll >= difficulty);
                    player._pendingBotLuxuryRerollTelemetry = null;
                }

                if (roll >= difficulty) {
                    audioMgr.play('dice_success');
                    finishBuy(true);
                } else {
                    if (player.type === 'HUMAN') {
                        if (player.rerolls > 0) {
                            state.rerollPending = { type: 'LUXURY_REROLL_POWER', deckIndex };
                            document.getElementById('dice-overlay').classList.remove('hidden');
                            document.getElementById('reroll-controls').classList.remove('hidden');
                            return;
                        }
                    } else {
                        const isFull = isFullStrategicVisitor(player);
                        const isGranGran = isGranGranVisitor(player);
                        const isStrategicActive = Boolean(
                            typeof window !== 'undefined'
                                ? (window.USE_STRATEGIC_AI !== undefined ? window.USE_STRATEGIC_AI : (window.USE_STRATEGIC_FULL_BOTS !== undefined ? window.USE_STRATEGIC_FULL_BOTS : (window.USE_STRATEGIC_GRAN_GRAN !== undefined ? window.USE_STRATEGIC_GRAN_GRAN : USE_STRATEGIC_FULL_BOTS_STATE)))
                                : USE_STRATEGIC_FULL_BOTS_STATE
                        );
                        const isCommitted = Boolean(player._luxuryRerollCommitted || player._plannedLuxuryReroll);
                        const rerollDecision = resolveStrategicLuxuryRerollDecision({
                            isFull,
                            isGranGran,
                            useStrategic: isStrategicActive,
                            rerolls: player.rerolls || 0,
                            rerollCommitted: isCommitted,
                            plannedReroll: isCommitted,
                            attemptSucceeded: false
                        });

                        if (rerollDecision.shouldReroll) {
                            const rerollsBefore = player.rerolls;
                            player.rerolls = Math.max(0, player.rerolls - rerollDecision.rerollsConsumed);
                            const rerollsAfter = player.rerolls;

                            player._luxuryAttemptSequenceNumber = (player._luxuryAttemptSequenceNumber || 0) + 1;
                            const luxuryAttemptId = player._luxuryAttemptId || `turn${state.turnCount !== undefined ? state.turnCount : (state.turn || 0)}-bot${player.botId !== undefined ? player.botId : (player.botRef?.id !== undefined ? player.botRef.id : player.id)}-deck${deckIndex}`;

                            const isOpen = Boolean(deck && deck.isFlippedOpen && deck.cards && deck.cards.length > 0);
                            const topCard = (isOpen && deck.cards.length > 0) ? deck.cards[deck.cards.length - 1] : null;
                            const visiblePoints = isOpen ? (topCard?.points || null) : null;
                            const baseSuccessRate = LUXURY_SUCCESS_RATE[deckIndex] !== undefined
                                ? LUXURY_SUCCESS_RATE[deckIndex]
                                : (deckIndex === 0 ? 2 / 6 : (deckIndex === 1 ? 4 / 6 : 1.0));
                            const luxurySuccessInfo = getLuxuryAttemptSuccessRate(deckIndex, {
                                botRerolls: rerollsBefore,
                                isOpen,
                                visiblePoints
                            });

                            const telemetryEntry = {
                                turnCount: state.turnCount !== undefined ? state.turnCount : (state.turn || 0),
                                botId: player.botId !== undefined ? player.botId : (player.botRef?.id !== undefined ? player.botRef.id : player.id),
                                botName: player.name,
                                aiDepth: getBotAiDepth(player),
                                personality: getStrategicPersonality(player),
                                source: "LUXURY",
                                luxuryAttemptId,
                                attemptSequenceNumber: player._luxuryAttemptSequenceNumber,
                                rerollsBefore,
                                rerollsAfter,
                                targetId: deckIndex,
                                targetType: "LUXURY_DECK",
                                deckId: deckIndex,
                                effectiveCost: effectiveCost,
                                visiblePoints,
                                isOpen,
                                baseSuccessRate,
                                rerollAdjustedSuccessRate: luxurySuccessInfo.successRate,
                                originalRoll: roll,
                                rerollRoll: null,
                                originalRollSucceeded: false,
                                rerollSucceeded: null,
                                plannedReroll: true,
                                plannedRerollReason: player._luxuryRerollCommitReason || luxurySuccessInfo.plannedRerollReason || null,
                                decisionReason: rerollDecision.reason || "STRATEGIC_COMMITTED_LUXURY_REROLL"
                            };
                            player._pendingBotLuxuryRerollTelemetry = telemetryEntry;
                            recordBotReroll(telemetryEntry);

                            processLuxuryBuy(player, deckIndex, true);
                            return;
                        }
                    }
                    finishBuy(false);
                }
            });
        } else {
            finishBuy(true);
        }
    };

    // 2. Smart Delay (Bots wait 500ms to show target, Humans go instantly)
    if (player.type === 'BOT') {
        setTimeout(runLogic, window.getDelay(500));
    } else {
        runLogic();
    }
}

export function confirmReroll() {
    if (!state.rerollPending) return;
    const player = state.players[state.turn];
    const pending = state.rerollPending;
    state.rerollPending = null;

    if (player.type === 'HUMAN') {
        player.isExecutingReroll = true;
    }

    if (pending.type === 'REROLL_POWER' || pending.type === 'LUXURY_REROLL_POWER') {
        player.rerolls = Math.max(0, player.rerolls - 1);
    } else {
        player.counters = Math.max(0, player.counters - 1);
    }
    updateUI();

    // Hide controls so they don't persist into the new roll animation
    document.getElementById('reroll-controls').classList.add('hidden');

    if (pending.cell) {
        processMove(pending.cell);
    } else if (pending.type && pending.type.startsWith('LUXURY')) {
        processLuxuryBuy(player, pending.deckIndex, true);
    } else if (pending.deckIndex !== undefined) {
        processLuxuryBuy(player, pending.deckIndex, true);
    }
}

export function cancelReroll() {
    const pending = state.rerollPending;
    state.rerollPending = null;

    // Explicitly hide the entire dice overlay, including controls
    hideDiceOverlay();

    const player = state.players[state.turn];
    if (player && player.type === 'HUMAN') {
        player.consecutiveMissedRerolls = (player.consecutiveMissedRerolls || 0) + 1;
        if (player.consecutiveMissedRerolls >= 3) {
            if (window.AchievementManager) window.AchievementManager.unlock('MISS_3_RE_ROLLS');
        }
        player.isExecutingReroll = false;
    }

    if (pending.cell) {
        audioMgr.play('dice_fail');
        clearTargetHighlight(`cell-container-${pending.cell.id}`);
        finalizeTurn('MAP');
    } else if (pending.type && pending.type.startsWith('LUXURY')) {
        log("Luxury Buy Failed!", "fail");
        audioMgr.play('dice_fail');
        clearTargetHighlight(`deck-${pending.deckIndex}`);
        finalizeTurn('LUXURY');
    } else if (pending.deckIndex !== undefined) {
        log("Luxury Buy Failed!", "fail");
        audioMgr.play('dice_fail');
        clearTargetHighlight(`deck-${pending.deckIndex}`);
        finalizeTurn('LUXURY');
    }
}

function checkEarlyGambitWin() {
    if (!state.activeGambitId) return false;
    const human = state.players.find(p => p.type === 'HUMAN');
    if (!human) return false;
    
    const gambitData = window.GAMBIT_CAMPAIGN || [];
    const gambit = gambitData.find(g => g.id === state.activeGambitId);
    if (!gambit || !gambit.winCondition) return false;

    // Check impossibility without terminating normal play
    checkAndNotifyGambitImpossibility();

    const humanEval = evaluateGambitCondition(human, gambit.winCondition, true, []);

    // Human wins if all required objectives for a mid-game gambit are satisfied and not impossible
    if (!state.gambitImpossible && (gambit.winCondition.evaluateAt === 'MID_GAME' || gambit.winCondition.evaluateAt === 'MID_OR_END_GAME') && humanEval.met) {
         state.forcedWinnerId = human.id;
         window.app.triggerGameOver("GAMBIT OBJECTIVE COMPLETE");
         return true;
    }

    // Bots win races based on primary race conditions (Type B: Prestige sprint, Type F: Luxury Card sprint)
    if (gambit.winCondition.evaluateAt === 'MID_GAME' || gambit.winCondition.evaluateAt === 'MID_OR_END_GAME') {
        const bots = state.players.filter(p => p.type === 'BOT');
        const params = gambit.winCondition.params || {};

        // Type B Race: First to reach Prestige target
        if (params.minPrestige) {
            for (const bot of bots) {
                if ((bot.prestige || 0) >= params.minPrestige) {
                    state.forcedWinnerId = bot.id; 
                    window.app.triggerGameOver("GAMBIT FAILED: OPPONENT REACHED PRESTIGE TARGET FIRST");
                    return true;
                }
            }
        }

        // Type F Race: First to reach Luxury Card count target
        if (params.minLuxuryCards) {
            for (const bot of bots) {
                const botLuxuryCount = bot.inventory.filter(c => c.type === 'LUXURY').length;
                if (botLuxuryCount >= params.minLuxuryCards) {
                    state.forcedWinnerId = bot.id; 
                    window.app.triggerGameOver("GAMBIT FAILED: OPPONENT REACHED LUXURY CARD TARGET FIRST");
                    return true;
                }
            }
        }
    }

    return false;
}

export function nextTurn() {
    if (state.isGameOver) return;
    if (state.gameOverTriggered) return;
    if (state.mode !== 'GAME') return; // Guard against ghost timers

    // Check for impossible solo gambit objectives
    checkAndNotifyGambitImpossibility();

    if (checkEarlyGambitWin()) return;

    // Check for any pending auction before evaluating end conditions
    const pendingAuction = getPendingAuction();
    if (pendingAuction) {
        const player = state.players[state.turn];
        if (player) player.status = "Auction Pending!";
        updateUI();
        setTimeout(() => triggerAuction(pendingAuction), window.getDelay(500));
        return;
    }

    // Check End Conditions
    const allLuxuryGone = state.luxuryDecks.every(d => d.cards.length === 0);
    const mapEmpty = state.grid.every(c => c.flipped || c.empty);

    const auctionADone = !state.auctions || !state.auctions.A || !state.auctions.A.card || state.auctions.A.resolved;
    const auctionBDone = !state.auctions || !state.auctions.B || !state.auctions.B.card || state.auctions.B.resolved;
    const bothAuctionsDone = auctionADone && auctionBDone;

    // Way 1: All map cards are flipped
    if (mapEmpty) {
        window.app.triggerGameOver("MAP COMPLETED");
        return;
    }

    // Way 2: No more Prestige Points can be bought or won (All Luxury cards sold AND both auctions held)
    if (allLuxuryGone && bothAuctionsDone) {
        window.app.triggerGameOver("ALL LUXURY CARDS SOLD & AUCTIONS COMPLETED");
        return;
    }

    if (state.extraTurn) {
        state.extraTurn = false;
        startTurnCycle();
        return;
    }

    // Process general extra turn power
    if (state.extraTurnActive) {
        state.extraTurnActive = false;
        const curPlayer = state.players[state.turn];
        updateUI();
        log(`${curPlayer.name} takes an Extra Turn!`, 'success');
        flyTextAnimation(`player-card-${curPlayer.id}`, curPlayer.id, "EXTRA TURN!", null);
        startTurnCycle();
        return;
    }

    let nextPlayerIdx = (state.turn + 1) % state.players.length;
    let attempts = 0;
    while (state.players[nextPlayerIdx].skipNextTurn && attempts < state.players.length) {
        state.players[nextPlayerIdx].skipNextTurn = false;
        log(`${state.players[nextPlayerIdx].name}'s turn was skipped!`, 'fail');
        
        const skipTarget = state.players[nextPlayerIdx];
        flyTextAnimation(`player-card-${skipTarget.id}`, skipTarget.id, "SKIPPED!", null);
        
        nextPlayerIdx = (nextPlayerIdx + 1) % state.players.length;
        attempts++;
    }
    state.turn = nextPlayerIdx;
    startTurnCycle();
}

async function runBotTurn(bot) {
    if (state.isGameOver || state.gameOverTriggered) return;
    if (state.mode !== 'GAME') return; // Guard against ghost timers in draft
    if (state.mode === 'AUCTION') return;
    if (state.paused) {
        setTimeout(() => runBotTurn(bot), window.getBotTurnDelay ? window.getBotTurnDelay() : 250);
        return;
    }

    // --- AI FIREWALL: Build and validate safe knowledge snapshot ---
    const knowledge = buildBotKnowledgeState(state, bot);
    const validationReport = validateBotKnowledge(knowledge);
    if (!validationReport.valid) {
        console.error("[BOT AI] Invalid AI knowledge snapshot detected:", validationReport.errors);
    }

    const availableCells = getAvailableMapCells(knowledge);
    if (availableCells.length === 0) { nextTurn(); return; }

    let buyDeckId = null;
    let chosenCellId = null;
    let moveReason = null;
    let turnResolution = null;

    // ==========================================
    // 1. ECONOMIC DECISION (Sanitized Luxury Buying)
    // ==========================================
    const luxuryDecision = chooseLuxuryDeck(bot, knowledge);
    if (luxuryDecision && luxuryDecision.action === 'BUY_LUXURY' && luxuryDecision.deckId !== null) {
        buyDeckId = luxuryDecision.deckId;
    }

    // Capture live debug snapshot for Luxury decision on window
    if (typeof window !== 'undefined') {
        window.__lastBotLuxuryDecision = {
            botId: bot.botId !== undefined ? bot.botId : bot.id,
            botName: bot.name,
            turnCount: state.turnCount,
            action: luxuryDecision ? luxuryDecision.action : 'NO_LUXURY',
            deckId: luxuryDecision ? luxuryDecision.deckId : null,
            reason: luxuryDecision ? luxuryDecision.reason : 'NONE',
            gold: bot.gold,
            visibleDecks: (knowledge.luxuryDecks || []).map(d => ({
                id: d.id,
                cost: d.cost,
                cardsRemaining: d.cardsRemaining,
                isOpen: d.isOpen,
                visiblePoints: d.visibleCard ? d.visibleCard.points : null
            }))
        };

        if (!Array.isArray(window.__botLuxuryDecisionHistory)) {
            window.__botLuxuryDecisionHistory = [];
        }
        window.__botLuxuryDecisionHistory.push(window.__lastBotLuxuryDecision);
        if (window.__botLuxuryDecisionHistory.length > 50) {
            window.__botLuxuryDecisionHistory.shift();
        }

        console.log("[BOT LUXURY DECISION LIVE]", window.__lastBotLuxuryDecision);
    }

    // ==========================================
    // 2. SPATIAL AWARENESS (Map Picking via Sanitized AI Decision)
    // ==========================================
    if (buyDeckId === null) {
        const decision = chooseMapCell(bot, knowledge);
        chosenCellId = decision.chosenCellId;
        moveReason = decision.reason;

        // Capture live debug snapshot on window before raw resolution / move execution
        if (typeof window !== 'undefined') {
            window.__lastBotMapDecision = {
                botId: bot.botId !== undefined ? bot.botId : bot.id,
                botName: bot.name,
                turnCount: state.turnCount,
                chosenCellId: decision.chosenCellId,
                reason: decision.reason,
                finishers: Array.isArray(decision.finishers) ? [...decision.finishers] : [],
                traps: Array.isArray(decision.traps) ? [...decision.traps] : [],
                safeMoves: Array.isArray(decision.safeMoves) ? [...decision.safeMoves] : []
            };

            if (!Array.isArray(window.__botMapDecisionHistory)) {
                window.__botMapDecisionHistory = [];
            }
            window.__botMapDecisionHistory.push(window.__lastBotMapDecision);
            if (window.__botMapDecisionHistory.length > 50) {
                window.__botMapDecisionHistory.shift();
            }

            console.log("[BOT MAP DECISION LIVE]", window.__lastBotMapDecision);
        }
    }

    // ==========================================
    // 3. SHARED STRATEGIC AI EXECUTION & SHADOW CAPTURE (Phase 5B.5 / 5B.8 / 5E.2 / 5E.6)
    // ==========================================
    const isBot = bot.type === 'BOT';
    const isGranGran = isGranGranVisitor(bot);
    if (isBot) {
        try {
            const decisionIndex = isGranGran ? ++granGranShadowDecisionCounter : 0;

            const legacyAction = buyDeckId !== null ? "BUY_LUXURY" : (chosenCellId ? "MAP" : "NONE");
            const legacyTargetId = buyDeckId !== null ? buyDeckId : (chosenCellId ? chosenCellId : null);
            const legacyReason = buyDeckId !== null ? (luxuryDecision ? luxuryDecision.reason : "BUY_LUXURY") : (chosenCellId ? moveReason : "NO_MOVES");

            const strategicContext = analyzeStrategicContext(bot, knowledge);
            const evaluation = evaluateTurnActions(bot, knowledge, strategicContext);
            const comparison = compareLegacyAndStrategicDecision({
                legacyAction,
                legacyTargetId,
                legacyReason,
                evaluation
            });

            const isStrategicActive = Boolean(
                typeof window !== 'undefined'
                    ? (window.USE_STRATEGIC_AI !== undefined ? window.USE_STRATEGIC_AI : (window.USE_STRATEGIC_FULL_BOTS !== undefined ? window.USE_STRATEGIC_FULL_BOTS : (window.USE_STRATEGIC_GRAN_GRAN !== undefined ? window.USE_STRATEGIC_GRAN_GRAN : USE_STRATEGIC_FULL_BOTS_STATE)))
                    : USE_STRATEGIC_FULL_BOTS_STATE
            );

            turnResolution = resolveBotTurnExecution({
                bot,
                knowledge,
                rawState: state,
                useStrategicAI: isStrategicActive,
                useStrategicFullBots: isStrategicActive,
                useStrategicGranGran: isStrategicActive,
                legacyAction,
                legacyTargetId,
                legacyReason,
                evaluation,
                validationReport
            });

            if (turnResolution.usedFallback) {
                console.warn(`[STRATEGIC BOT FALLBACK: ${bot.name}] ${turnResolution.fallbackReason}. Reverting to legacy behavior.`);
            }

            buyDeckId = turnResolution.buyDeckId;
            chosenCellId = turnResolution.chosenCellId;
            moveReason = turnResolution.moveReason;

            // Generic strategic bot decision history on window (Phase 5E.2 Part 10)
            if (typeof window !== 'undefined') {
                if (!Array.isArray(window.__strategicBotDecisionHistory)) {
                    window.__strategicBotDecisionHistory = [];
                }
                const genericEntry = {
                    turnCount: state.turnCount,
                    botId: bot.botId !== undefined ? bot.botId : bot.id,
                    botName: bot.name,
                    aiDepth: bot.aiDepth || (bot.botRef && bot.botRef.aiDepth) || getBotAiDepth(bot),
                    executionMode: turnResolution.executionMode,
                    action: turnResolution.executedAction,
                    targetId: turnResolution.executedTargetId,
                    strategicUtility: evaluation?.recommendation?.utility !== undefined ? evaluation.recommendation.utility : 0,
                    fallback: turnResolution.usedFallback,
                    reason: turnResolution.fallbackReason || evaluation?.recommendation?.reason || legacyReason
                };
                window.__strategicBotDecisionHistory.push(genericEntry);
                if (window.__strategicBotDecisionHistory.length > 100) {
                    window.__strategicBotDecisionHistory.shift();
                }
            }

            // Dedicated Gran Gran shadow history (Gran Gran only)
            if (isGranGran) {
                const shadowEntry = {
                    timestamp: Date.now(),
                    decisionIndex,
                    turnCount: state.turnCount,
                    executionMode: turnResolution.executionMode,
                    executedAction: turnResolution.executedAction,
                    executedTargetId: turnResolution.executedTargetId,
                    usedFallback: turnResolution.usedFallback,
                    fallbackReason: turnResolution.fallbackReason,
                    bot: {
                        id: bot.id,
                        botId: bot.botId,
                        name: bot.name,
                        intelligenceLevel: bot.intelligenceLevel !== undefined ? bot.intelligenceLevel : 10
                    },
                    classification: comparison.classification,
                    agreement: comparison.agreement,
                    utilityDifference: comparison.utilityDifference,
                    legacy: {
                        action: legacyAction,
                        targetId: legacyTargetId,
                        utility: comparison.legacy?.utility !== undefined ? comparison.legacy.utility : null,
                        reason: legacyReason
                    },
                    strategic: {
                        action: evaluation?.recommendation?.action || "NONE",
                        targetId: evaluation?.recommendation?.targetId !== undefined ? evaluation.recommendation.targetId : null,
                        utility: evaluation?.recommendation?.utility !== undefined ? evaluation.recommendation.utility : 0,
                        reason: evaluation?.recommendation?.reason || null
                    },
                    bestMap: evaluation?.bestMap ? {
                        cellId: evaluation.bestMap.cellId,
                        type: evaluation.bestMap.type,
                        mapRegion: evaluation.bestMap.mapRegion,
                        difficulty: evaluation.bestMap.difficulty,
                        utility: evaluation.bestMap.totalUtility,
                        auRetentionFactor: evaluation.bestMap.auRetentionFactor,
                        effectivePrestigePerAu: evaluation.bestMap.effectivePrestigePerAu,
                        expectedSetupPrestigeEq: evaluation.bestMap.expectedSetupPrestigeEq,
                        rawSetupPrestigeEq: evaluation.bestMap.rawSetupPrestigeEq,
                        rowSetupValue: evaluation.bestMap.rowSetupValue,
                        columnSetupValue: evaluation.bestMap.columnSetupValue,
                        rowOwnedBefore: evaluation.bestMap.rowOwnedBefore,
                        columnOwnedBefore: evaluation.bestMap.columnOwnedBefore,
                        successRate: evaluation.bestMap.successRate,
                        isFinisher: Boolean(evaluation.bestMap.isFinisher),
                        isTrap: Boolean(evaluation.bestMap.isTrap),
                        waterfrontStatus: evaluation.bestMap.waterfrontStatus || "NONE",
                        auctionTriggerClassification: evaluation.bestMap.auctionTriggerClassification || null,
                        auctionHandoffClassification: evaluation.bestMap.auctionHandoffClassification || null,
                        expectedOpponentLineOpportunityPrestigeEq: evaluation.bestMap.expectedOpponentLineOpportunityPrestigeEq || 0,
                        waterfrontAuctionTimingPrestigeEq: evaluation.bestMap.waterfrontAuctionTimingPrestigeEq || 0,
                        waterfrontRemainingBefore: evaluation.bestMap.waterfrontRemainingBefore,
                        waterfrontAdvanceClassification: evaluation.bestMap.waterfrontAdvanceClassification || null,
                        auctionAdvancePrestigeEq: evaluation.bestMap.auctionAdvancePrestigeEq || 0,
                        auctionAdvanceReason: evaluation.bestMap.auctionAdvanceReason || null,
                        mapPersonalityPrestigeEq: evaluation.bestMap.mapPersonalityPrestigeEq || 0,
                        repetitionPenaltyPrestigeEq: evaluation.bestMap.repetitionPenaltyPrestigeEq || 0,
                        bonusGroup: evaluation.bestMap.bonusGroup || "NONE",
                        candidateExpectedBonusProbability: evaluation.bestMap.candidateExpectedBonusProbability || 0,
                        expectedBonusAu: evaluation.bestMap.expectedBonusAu || 0,
                        expectedBlockBonusPrestigeEq: evaluation.bestMap.expectedBlockBonusPrestigeEq || 0,
                        bonusOpportunityClassification: evaluation.bestMap.bonusOpportunityClassification || "NONE",
                        landmarkGroup: evaluation.bestMap.landmarkGroup || "NONE",
                        publicLandmarksInSourcePool: evaluation.bestMap.publicLandmarksInSourcePool || 0,
                        publicSourcePoolSize: evaluation.bestMap.publicSourcePoolSize || 0,
                        publicCardsRevealedInGroup: evaluation.bestMap.publicCardsRevealedInGroup || 0,
                        publicLandmarksRevealedInGroup: evaluation.bestMap.publicLandmarksRevealedInGroup || 0,
                        candidateLandmarkProbability: evaluation.bestMap.candidateLandmarkProbability || 0,
                        expectedLandmarkAu: evaluation.bestMap.expectedLandmarkAu || 0,
                        expectedLandmarkPrestigeEq: evaluation.bestMap.expectedLandmarkPrestigeEq || 0,
                        waterfrontAdvanceAllowed: evaluation.bestMap.waterfrontAdvanceAllowed !== false,
                        waterfrontAdvanceOverrideReason: evaluation.bestMap.waterfrontAdvanceOverrideReason || null,
                        waterfrontAdvantageOverBestNonWf: evaluation.bestMap.waterfrontAdvantageOverBestNonWf || 0,
                        waterfrontRestraintThreshold: evaluation.bestMap.waterfrontRestraintThreshold || 0,
                        botGoldAtAuctionOnSuccess: evaluation.bestMap.botGoldAtAuctionOnSuccess || null,
                        projectedOpponentGoldAtAuctionIfHandoff: evaluation.bestMap.projectedOpponentGoldAtAuctionIfHandoff || null
                    } : null,
                    bestLuxury: evaluation?.bestLuxury ? {
                        deckId: evaluation.bestLuxury.deckId,
                        cost: evaluation.bestLuxury.cost,
                        effectiveCost: evaluation.bestLuxury.effectiveCost,
                        utility: evaluation.bestLuxury.totalUtility,
                        auRetentionFactor: evaluation.bestLuxury.auRetentionFactor,
                        baseAuRetentionFactor: evaluation.bestLuxury.baseAuRetentionFactor,
                        effectivePrestigePerAu: evaluation.bestLuxury.effectivePrestigePerAu,
                        baseEffectivePrestigePerAu: evaluation.bestLuxury.baseEffectivePrestigePerAu,
                        goldOpportunityCost: evaluation.bestLuxury.goldOpportunityCost,
                        goldAfterPurchase: evaluation.bestLuxury.goldAfterPurchase,
                        projectedAuctionGold: evaluation.bestLuxury.projectedAuctionGold,
                        targetAuctionReserve: evaluation.bestLuxury.targetAuctionReserve,
                        auctionReadinessGap: evaluation.bestLuxury.auctionReadinessGap,
                        auctionReadinessClassification: evaluation.bestLuxury.auctionReadinessClassification,
                        auctionContestability: evaluation.bestLuxury.auctionContestability,
                        relevantUpcomingAuctionId: evaluation.bestLuxury.relevantUpcomingAuctionId || null,
                        relevantAuctionValueSource: evaluation.bestLuxury.relevantAuctionValueSource || null,
                        violatesPostAuctionReserve: Boolean(evaluation.bestLuxury.violatesPostAuctionReserve),
                        isStrategicallyEligible: evaluation.bestLuxury.isStrategicallyEligible !== false,
                        ineligibleReason: evaluation.bestLuxury.ineligibleReason || null,
                        successRate: evaluation.bestLuxury.successRate,
                        isOpen: Boolean(evaluation.bestLuxury.isOpen),
                        visibleCardPoints: evaluation.bestLuxury.visibleCardPoints || null,
                        visibleCardRerollsGranted: evaluation.bestLuxury.visibleCardRerollsGranted || 0,
                        expectedRerollRewardPrestigeEq: evaluation.bestLuxury.expectedRerollRewardPrestigeEq || 0,
                        noAuctionsRemaining: Boolean(evaluation.bestLuxury.noAuctionsRemaining),
                        postAuctionLuxuryPlan: evaluation.bestLuxury.postAuctionLuxuryPlan || "NONE",
                        postAuctionLuxuryPlanReason: evaluation.bestLuxury.postAuctionLuxuryPlanReason || null,
                        isOnlyLuxuryPileRemaining: Boolean(evaluation.bestLuxury.isOnlyLuxuryPileRemaining),
                        forcedPostAuctionLuxuryConversion: Boolean(evaluation.bestLuxury.forcedPostAuctionLuxuryConversion)
                    } : null,
                    strategicContextSummary: {
                        gamePhase: strategicContext?.gamePhase || 'UNKNOWN',
                        auRetentionFactor: strategicContext?.economy?.auRetentionFactor !== undefined ? strategicContext.economy.auRetentionFactor : 0.50,
                        baseAuRetentionFactor: strategicContext?.economy?.baseAuRetentionFactor !== undefined ? strategicContext.economy.baseAuRetentionFactor : 0.40,
                        effectivePrestigePerAu: strategicContext?.economy?.effectivePrestigePerAu !== undefined ? strategicContext.economy.effectivePrestigePerAu : 0.0667,
                        baseEffectivePrestigePerAu: strategicContext?.economy?.baseEffectivePrestigePerAu !== undefined ? strategicContext.economy.baseEffectivePrestigePerAu : 0.0533,
                        postAuctionReserveAu: strategicContext?.economy?.postAuctionReserveAu !== undefined ? strategicContext.economy.postAuctionReserveAu : 0,
                        boardRemainingRatio: strategicContext?.map?.boardRemainingRatio || 0,
                        reservePressure: strategicContext?.economy?.reservePressure || 0,
                        conversionPressure: strategicContext?.economy?.conversionPressure || 0,
                        remainingAuctions: strategicContext?.auctions?.remainingCount || 0,
                        relevantUpcomingAuctionId: strategicContext?.auctions?.relevantUpcomingAuctionId || null,
                        noAuctionsRemaining: Boolean(strategicContext?.auctions?.noAuctionsRemaining),
                        postAuctionLuxuryPlan: strategicContext?.luxury?.postAuctionPlan?.postAuctionLuxuryPlan || "NONE",
                        postAuctionLuxuryPlanReason: strategicContext?.luxury?.postAuctionPlan?.postAuctionLuxuryPlanReason || null,
                        isOnlyLuxuryPileRemaining: Boolean(strategicContext?.luxury?.postAuctionPlan?.isOnlyLuxuryPileRemaining),
                        forcedPostAuctionLuxuryConversion: Boolean(strategicContext?.luxury?.postAuctionPlan?.forcedPostAuctionLuxuryConversion),
                        remainingLuxuryPileCount: strategicContext?.luxury?.postAuctionPlan?.remainingLuxuryPileCount || 0,
                        affordableLuxuryPileCount: strategicContext?.luxury?.postAuctionPlan?.affordableLuxuryPileCount || 0,
                        selfGold: strategicContext?.bot?.gold || 0,
                        selfPrestige: strategicContext?.bot?.totalPrestige || 0
                    },
                    topMapCandidates: (evaluation?.mapActions || []).slice(0, 5).map(m => ({
                        cellId: m.cellId,
                        type: m.type,
                        mapRegion: m.mapRegion,
                        difficulty: m.difficulty,
                        utility: m.totalUtility,
                        auRetentionFactor: m.auRetentionFactor,
                        expectedSetupPrestigeEq: m.expectedSetupPrestigeEq,
                        rawSetupPrestigeEq: m.rawSetupPrestigeEq,
                        rowSetupValue: m.rowSetupValue,
                        columnSetupValue: m.columnSetupValue,
                        rowOwnedBefore: m.rowOwnedBefore,
                        columnOwnedBefore: m.columnOwnedBefore,
                        successRate: m.successRate,
                        isFinisher: Boolean(m.isFinisher),
                        isTrap: Boolean(m.isTrap),
                        waterfrontStatus: m.waterfrontStatus || "NONE",
                        waterfrontRemainingBefore: m.waterfrontRemainingBefore,
                        waterfrontAdvanceClassification: m.waterfrontAdvanceClassification || null,
                        waterfrontAdvanceAllowed: m.waterfrontAdvanceAllowed !== false,
                        waterfrontAdvanceOverrideReason: m.waterfrontAdvanceOverrideReason || null,
                        waterfrontAdvantageOverBestNonWf: m.waterfrontAdvantageOverBestNonWf || 0,
                        waterfrontRestraintThreshold: m.waterfrontRestraintThreshold || 0,
                        auctionAdvancePrestigeEq: m.auctionAdvancePrestigeEq || 0,
                        auctionAdvanceReason: m.auctionAdvanceReason || null,
                        mapPersonalityPrestigeEq: m.mapPersonalityPrestigeEq || 0,
                        repetitionPenaltyPrestigeEq: m.repetitionPenaltyPrestigeEq || 0,
                        bonusGroup: m.bonusGroup || "NONE",
                        candidateExpectedBonusProbability: m.candidateExpectedBonusProbability || 0,
                        expectedBonusAu: m.expectedBonusAu || 0,
                        expectedBlockBonusPrestigeEq: m.expectedBlockBonusPrestigeEq || 0,
                        bonusOpportunityClassification: m.bonusOpportunityClassification || "NONE",
                        landmarkGroup: m.landmarkGroup || "NONE",
                        publicLandmarksInSourcePool: m.publicLandmarksInSourcePool || 0,
                        publicSourcePoolSize: m.publicSourcePoolSize || 0,
                        publicCardsRevealedInGroup: m.publicCardsRevealedInGroup || 0,
                        publicLandmarksRevealedInGroup: m.publicLandmarksRevealedInGroup || 0,
                        candidateLandmarkProbability: m.candidateLandmarkProbability || 0,
                        expectedLandmarkAu: m.expectedLandmarkAu || 0,
                        expectedLandmarkPrestigeEq: m.expectedLandmarkPrestigeEq || 0,
                        auctionTriggerClassification: m.auctionTriggerClassification || null,
                        auctionHandoffClassification: m.auctionHandoffClassification || null,
                        expectedOpponentLineOpportunityPrestigeEq: m.expectedOpponentLineOpportunityPrestigeEq || 0,
                        waterfrontAuctionTimingPrestigeEq: m.waterfrontAuctionTimingPrestigeEq || 0
                    })),
                    topLuxuryCandidates: (evaluation?.luxuryActions || []).slice(0, 3).map(l => ({
                        deckId: l.deckId,
                        cost: l.cost,
                        effectiveCost: l.effectiveCost,
                        utility: l.totalUtility,
                        auRetentionFactor: l.auRetentionFactor,
                        goldOpportunityCost: l.goldOpportunityCost,
                        goldAfterPurchase: l.goldAfterPurchase,
                        violatesPostAuctionReserve: Boolean(l.violatesPostAuctionReserve),
                        isStrategicallyEligible: l.isStrategicallyEligible !== false,
                        ineligibleReason: l.ineligibleReason || null,
                        successRate: l.successRate,
                        isOpen: Boolean(l.isOpen),
                        visibleCardPoints: l.visibleCardPoints || null,
                        visibleCardRerollsGranted: l.visibleCardRerollsGranted || 0,
                        expectedRerollRewardPrestigeEq: l.expectedRerollRewardPrestigeEq || 0,
                        noAuctionsRemaining: Boolean(l.noAuctionsRemaining),
                        postAuctionLuxuryPlan: l.postAuctionLuxuryPlan || "NONE",
                        postAuctionLuxuryPlanReason: l.postAuctionLuxuryPlanReason || null,
                        isOnlyLuxuryPileRemaining: Boolean(l.isOnlyLuxuryPileRemaining),
                        forcedPostAuctionLuxuryConversion: Boolean(l.forcedPostAuctionLuxuryConversion)
                    })),
                    endgameWinLock: evaluation?.endgameWinLock ? {
                        applicable: Boolean(evaluation.endgameWinLock.applicable),
                        canLockWin: Boolean(evaluation.endgameWinLock.canLockWin),
                        currentOutcome: evaluation.endgameWinLock.currentOutcome || 'UNKNOWN',
                        finalMapCellId: evaluation.endgameWinLock.finalMapCellId || null,
                        finalMapSuccessRate: evaluation.endgameWinLock.finalMapSuccessRate !== null && evaluation.endgameWinLock.finalMapSuccessRate !== undefined ? evaluation.endgameWinLock.finalMapSuccessRate : null,
                        finalMapTriggersAuction: Boolean(evaluation.endgameWinLock.finalMapTriggersAuction),
                        triggeredAuctionId: evaluation.endgameWinLock.triggeredAuctionId || null,
                        reason: evaluation.endgameWinLock.reason || null
                    } : null
                };

                if (typeof window !== 'undefined') {
                    window.__lastGranGranShadowDecision = shadowEntry;
                    if (!Array.isArray(window.__granGranShadowHistory)) {
                        window.__granGranShadowHistory = [];
                    }
                    window.__granGranShadowHistory.push(shadowEntry);
                    if (window.__granGranShadowHistory.length > 100) {
                        window.__granGranShadowHistory.shift();
                    }
                }

                const rec = evaluation?.recommendation || {};
                const sign = (rec.utility || 0) >= 0 ? '+' : '';
                const diffText = comparison.utilityDifference !== null && comparison.utilityDifference !== undefined ? ` | diff: ${comparison.utilityDifference.toFixed(4)}` : '';
                const retFactor = strategicContext?.economy?.auRetentionFactor !== undefined ? strategicContext.economy.auRetentionFactor : 0.50;
                const setupText = evaluation?.bestMap?.expectedSetupPrestigeEq !== undefined ? ` | setupEV: ${evaluation.bestMap.expectedSetupPrestigeEq.toFixed(2)}` : '';
                const winLockText = evaluation?.endgameWinLock?.canLockWin ? ` | WinLock: YES (${evaluation.endgameWinLock.currentOutcome})` : '';
                const modeTag = turnResolution.executionMode === "STRATEGIC" ? " [LIVE STRATEGIC]" : (turnResolution.usedFallback ? " [FALLBACK -> LEGACY]" : " [LEGACY]");
                console.log(`[GRAN GRAN SHADOW #${decisionIndex}] Turn ${state.turnCount}${modeTag}: ${comparison.classification}${diffText} | AuRetention: ${retFactor}${setupText}${winLockText} (Legacy: ${legacyAction} ${legacyTargetId !== null && legacyTargetId !== undefined ? legacyTargetId : ''} vs Strategic: ${rec.action || 'NONE'} ${rec.targetId !== null && rec.targetId !== undefined ? rec.targetId : ''} [${sign}${Number(rec.utility || 0).toFixed(2)}]) -> Executed: ${turnResolution.executedAction} ${turnResolution.executedTargetId !== null && turnResolution.executedTargetId !== undefined ? turnResolution.executedTargetId : ''}`);
            }
        } catch (shadowErr) {
            console.error(`[STRATEGIC BOT DECISION ERROR: ${bot.name}] Error executing strategic decision:`, shadowErr);
        }
    }

    // Execute Decision
    if (buyDeckId !== null) {
        bot._plannedLuxuryReroll = Boolean(turnResolution?.plannedReroll);
        bot._plannedLuxuryRerollCount = turnResolution?.plannedRerollCount || 0;
        bot._plannedLuxuryRerollReason = turnResolution?.plannedRerollReason || null;
        if (state.simulationMode) console.log(`[BOT] ${bot.name} BUYING LUXURY ${buyDeckId}`);
        processLuxuryBuy(bot, buyDeckId);
    } else if (chosenCellId) {
        const rawCell = state.grid.find(c => c.id === chosenCellId);
        if (!rawCell || rawCell.flipped || rawCell.empty) {
            console.error(`[BOT MAP AI] Chosen cell ${chosenCellId} is invalid or already flipped on raw grid.`);
            nextTurn();
            return;
        }

        // Track strategic Map region attempt (Phase 5B.13 Part 9)
        let region = 'BLOCK';
        if (rawCell.type === 'LAGOON' || rawCell.c === 0) region = 'LAGOON';
        else if (rawCell.type === 'WF_L' || rawCell.type === 'WF_R' || rawCell.c === 1 || rawCell.c === 7) region = 'WATERFRONT';
        else if (rawCell.type === 'ATLANTIC' || rawCell.c === 8) region = 'ATLANTIC';
        else if (rawCell.type === 'BLOCK' || (rawCell.c >= 2 && rawCell.c <= 6)) region = 'BLOCK';

        if (!Array.isArray(bot._recentStrategicMapRegions)) {
            bot._recentStrategicMapRegions = [];
        }
        bot._recentStrategicMapRegions.unshift(region);
        if (bot._recentStrategicMapRegions.length > 5) {
            bot._recentStrategicMapRegions.pop();
        }

        if (state.simulationMode) console.log(`[BOT] ${bot.name} FLIPPING MAP ${rawCell.id} (${moveReason})`);
        processMove(rawCell);
    } else {
        nextTurn();
    }
}

export function confirmResign() {
    if (window.app && window.app.closeResignModal) {
        window.app.closeResignModal();
    }
    
    // Zero out the active human player's score so they forfeit
    if (window.state && window.state.players) {
        const activePlayer = window.state.players[window.state.turn];
        if (activePlayer && activePlayer.type === 'HUMAN') {
            activePlayer.points = 0;
            activePlayer.gold = 0;
            activePlayer.prestige = 0;
        }
        window.state.matchForfeited = true;
    }
    
    // Find a BOT to assign as winner. If 4-Human game, this is safely undefined!
    const botPlayer = state.players.find(p => p.type && p.type.toUpperCase() === 'BOT');
    if (botPlayer) {
        state.forcedWinnerId = botPlayer.id;
    }
    
    if (window.app && window.app.triggerGameOver) {
         window.app.triggerGameOver("MATCH FORFEITED");
    }
}
