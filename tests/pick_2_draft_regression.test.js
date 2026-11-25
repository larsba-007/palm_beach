// tests/pick_2_draft_regression.test.js
// Regression test suite for Pick 2 (PAIR) Draft Behavior using shared production logic

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup minimal mock DOM & browser environment BEFORE importing modules that depend on window/document
function createMockElement(id, initialDisplay = '', initialClasses = []) {
    const classList = new Set(initialClasses);
    return {
        id,
        style: {
            display: initialDisplay,
            opacity: '',
            pointerEvents: '',
            transform: '',
        },
        classList: {
            add: (...cls) => cls.forEach(c => classList.add(c)),
            remove: (...cls) => cls.forEach(c => classList.delete(c)),
            contains: (c) => classList.has(c),
        },
        children: [],
        innerHTML: '',
        innerText: '',
        value: '',
        focus: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
    };
}

class MockDocument {
    constructor() {
        this.elements = new Map();
        this.body = {
            classList: {
                add: () => {},
                remove: () => {},
                contains: () => false,
            }
        };
    }

    register(id, initialDisplay = '', initialClasses = []) {
        const el = createMockElement(id, initialDisplay, initialClasses);
        this.elements.set(id, el);
        return el;
    }

    getElementById(id) {
        return this.elements.get(id) || null;
    }

    querySelector(selector) {
        return null;
    }

    querySelectorAll(selector) {
        return [];
    }
}

// Global browser polyfill for Node test runner
const globalDoc = new MockDocument();
global.document = globalDoc;
global.window = {
    document: globalDoc,
    GameConfig: { isFullGame: true },
    process: { versions: {} },
    getDelay: (ms) => ms
};

// Dynamic imports of actual production code
const { CHARACTERS } = await import('../js/characters.js');
const { UnlockManager } = await import('../js/UnlockManager.js');
const {
    getPick2CandidatePool,
    drawPick2Candidates,
    resolvePick2Selection,
    isPick2BlockedInDemo
} = await import('../js/draft_logic.js');

async function runPick2RegressionSuite() {
    console.log('--- Running Pick 2 (PAIR) Draft Regression Suite (Direct Production Logic) ---');

    // Register necessary DOM IDs for draft & UI
    const registerCoreElements = () => {
        globalDoc.elements.clear();
        globalDoc.register('ui-v2-container', 'block');
        globalDoc.register('game-ui', '', ['opacity-0', 'pointer-events-none']);
        globalDoc.register('draft-overlay', '', ['hidden']);
        globalDoc.register('draft-header', '');
        globalDoc.register('draft-cards-container', '');
        globalDoc.register('draft-scale-wrapper', '');
        globalDoc.register('panel-2-setup', 'block');
    };

    const shuffleFn = (arr) => [...arr]; // Deterministic shuffle for testing

    // Helper to assemble draft environment wire-up directly invoking shared production helpers
    function createDraftContext() {
        registerCoreElements();

        let assignBotCharactersCallCount = 0;
        let showStartPromoModalCalled = false;
        let showCustomMatchLockedModalCalled = false;

        const state = {
            mode: 'SETUP',
            activeGambitId: null,
            players: [],
            draftOrder: [],
            draftAvailablePool: [],
            currentDraftCandidates: [],
            isProcessing: false,
            config: {
                setupMode: 'RANDOM',
                humans: 1,
                bots: 1
            },
            playerProfile: {
                clearedGambits: []
            }
        };

        const app = {
            showStartPromoModal: () => {
                showStartPromoModalCalled = true;
            },
            showCustomMatchLockedModal: (msg) => {
                showCustomMatchLockedModalCalled = true;
            },
            updateSetupUI: () => {},
            initPlayerCards: () => {},
            animateDraftChoice: (playerId, charId, index, callback) => {
                if (callback) callback();
            },
            // Direct invocation of production getPick2CandidatePool
            startDraftPhase: () => {
                state.mode = 'DRAFT';
                state.draftOrder = state.players.filter(p => p.type === 'HUMAN').map(p => p.id);
                state.isProcessing = false;

                const available = getPick2CandidatePool(state.activeGambitId, CHARACTERS, global.window.UnlockManager);

                state.draftAvailablePool = shuffleFn(available);
                state.currentDraftCandidates = [];

                const v2 = document.getElementById('ui-v2-container');
                if (v2) v2.style.display = 'none';
                const gameUI = document.getElementById('game-ui');
                if (gameUI) gameUI.classList.remove('opacity-0', 'pointer-events-none');
                app.initPlayerCards();
                app.nextDraftTurn();
            },
            // Direct invocation of production drawPick2Candidates
            nextDraftTurn: () => {
                if (state.draftOrder.length === 0) {
                    const overlay = document.getElementById('draft-overlay');
                    if (overlay) overlay.classList.add('hidden');
                    app.assignBotCharacters();
                    return;
                }

                const playerId = state.draftOrder[0];
                const player = state.players[playerId];

                state.currentDraftCandidates = drawPick2Candidates(state.draftAvailablePool);

                const overlay = document.getElementById('draft-overlay');
                const header = document.getElementById('draft-header');
                if (header && player) {
                    header.innerText = `${player.name.toUpperCase()} IS DRAFTING`;
                }

                if (overlay) {
                    overlay.classList.remove('hidden');
                    overlay.classList.add('flex', 'items-center', 'justify-center');
                }
            },
            // Direct invocation of production resolvePick2Selection
            selectDraftCharacter: (playerId, candidateIndex) => {
                if (state.isProcessing) return;
                state.isProcessing = true;

                const char = resolvePick2Selection(state, playerId, candidateIndex, app.finalizePlayerSetup);

                app.animateDraftChoice(playerId, char.id, candidateIndex, () => {
                    state.isProcessing = false;
                    app.initPlayerCards();
                    app.nextDraftTurn();
                });
            },
            assignBotCharacters: () => {
                assignBotCharactersCallCount++;
                state.mode = 'GAME';
            },
            finalizePlayerSetup: (player) => {
                player.setupFinalized = true;
            },
            // Direct invocation of production isPick2BlockedInDemo
            setSetupMode: (mode) => {
                const isDemo = !global.window.GameConfig || !global.window.GameConfig.isFullGame;
                if (isPick2BlockedInDemo(mode, !isDemo, state.activeGambitId)) {
                    if (app.showStartPromoModal) app.showStartPromoModal();
                    return;
                }

                const setupPanel = document.getElementById('panel-2-setup');
                const inSetupUI = setupPanel && !setupPanel.classList.contains('hidden');

                if (inSetupUI) {
                    if (!global.window.UnlockManager.isDraftModeUnlocked(mode)) {
                        const data = global.window.UnlockManager.getDraftModeData(mode);
                        app.showCustomMatchLockedModal(`Clear Gambit ${data.unlockGambit} to unlock ${data.name}.`);
                        return;
                    }
                }

                state.config.setupMode = mode;
                if (inSetupUI) app.updateSetupUI();
            },
            setBoardZoom: (val) => {
                const draftScale = document.getElementById('draft-scale-wrapper');
                if (draftScale) draftScale.style.transform = `scale(${val})`;
            }
        };

        global.window.UnlockManager = UnlockManager;
        global.window.state = state;
        global.window.app = app;

        return {
            state,
            app,
            getAssignBotCalls: () => assignBotCharactersCallCount,
            wasPromoModalShown: () => showStartPromoModalCalled,
            wasLockedModalShown: () => showCustomMatchLockedModalCalled
        };
    }

    // -------------------------------------------------------------
    // Test Scenario 1: Gambit 10 Pool & Candidates
    // -------------------------------------------------------------
    {
        console.log('Scenario 1: Gambit 10 produces a candidate pool with only LEJA and BRIGHT SHELL');
        
        // 1a. Direct pure helper test
        const rawPool = getPick2CandidatePool(10, CHARACTERS, UnlockManager);
        assert.deepEqual(rawPool.map(c => c.name).sort(), ['BRIGHT SHELL', 'EDITH']);

        // 1b. Draft flow test
        const ctx = createDraftContext();
        ctx.state.activeGambitId = 10;
        ctx.state.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', character: null },
            { id: 1, name: 'Bot 1', type: 'BOT', character: null }
        ];

        ctx.app.startDraftPhase();

        const candidateNames = ctx.state.currentDraftCandidates.map(c => c.name).sort();
        assert.deepEqual(candidateNames, ['BRIGHT SHELL', 'EDITH']);
        assert.equal(ctx.state.currentDraftCandidates.length, 2);
        console.log('✓ Scenario 1 Passed: Exactly LEJA and BRIGHT SHELL dealt in Gambit 10.');
    }

    // -------------------------------------------------------------
    // Test Scenario 2: Gambit 15 Pool & Candidates
    // -------------------------------------------------------------
    {
        console.log('Scenario 2: Gambit 15 produces a candidate pool with only KINGSTON and BRIGHT SHELL');
        
        // 2a. Direct pure helper test
        const rawPool = getPick2CandidatePool(15, CHARACTERS, UnlockManager);
        assert.deepEqual(rawPool.map(c => c.name).sort(), ['BRIGHT SHELL', 'KINGSTON']);

        // 2b. Draft flow test
        const ctx = createDraftContext();
        ctx.state.activeGambitId = 15;
        ctx.state.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', character: null },
            { id: 1, name: 'Bot 1', type: 'BOT', character: null }
        ];

        ctx.app.startDraftPhase();

        const candidateNames = ctx.state.currentDraftCandidates.map(c => c.name).sort();
        assert.deepEqual(candidateNames, ['BRIGHT SHELL', 'KINGSTON']);
        assert.equal(ctx.state.currentDraftCandidates.length, 2);
        console.log('✓ Scenario 2 Passed: Exactly KINGSTON and BRIGHT SHELL dealt in Gambit 15.');
    }

    // -------------------------------------------------------------
    // Test Scenario 3: Normal Multi-Human Pick 2 (Discard Verification)
    // -------------------------------------------------------------
    {
        console.log('Scenario 3: Multi-Human Pick 2 discards unselected card without recycling');
        const ctx = createDraftContext();
        ctx.state.activeGambitId = null; // Custom / full match
        ctx.state.players = [
            { id: 0, name: 'Human 1', type: 'HUMAN', character: null },
            { id: 1, name: 'Human 2', type: 'HUMAN', character: null },
            { id: 2, name: 'Bot 1', type: 'BOT', character: null }
        ];

        ctx.app.startDraftPhase();

        // 10 characters unlocked in full game
        const initialPoolSize = ctx.state.draftAvailablePool.length;
        assert.equal(initialPoolSize, 8); // 10 total minus 2 popped for Player 1

        const p1Candidates = [...ctx.state.currentDraftCandidates];
        assert.equal(p1Candidates.length, 2);
        const p1ChoiceIndex = 0;
        const p1Selected = p1Candidates[p1ChoiceIndex];
        const p1Discarded = p1Candidates[1];

        // Player 1 picks via resolvePick2Selection
        ctx.app.selectDraftCharacter(0, p1ChoiceIndex);

        assert.equal(ctx.state.players[0].character.id, p1Selected.id);

        // Pool must NOT have grown back by 1 (unselected card must be discarded)
        assert.ok(!ctx.state.draftAvailablePool.some(c => c.id === p1Discarded.id), 'Discarded card must NOT be in draftAvailablePool');
        assert.ok(!ctx.state.draftAvailablePool.some(c => c.id === p1Selected.id), 'Selected card must NOT be in draftAvailablePool');

        // Player 2's turn starts automatically
        const p2Candidates = [...ctx.state.currentDraftCandidates];
        assert.equal(p2Candidates.length, 2);

        // Verify Player 2 received cards disjoint from Player 1's options
        const p2CandidateIds = p2Candidates.map(c => c.id);
        assert.ok(!p2CandidateIds.includes(p1Selected.id), 'P2 must not receive P1 selected character');
        assert.ok(!p2CandidateIds.includes(p1Discarded.id), 'P2 must not receive P1 discarded character');

        console.log('✓ Scenario 3 Passed: Dealt cards are strictly unique and unselected cards are discarded.');
    }

    // -------------------------------------------------------------
    // Test Scenario 4: Draft Completion Lifecycle
    // -------------------------------------------------------------
    {
        console.log('Scenario 4: Draft completion assigns characters, clears queue, calls assignBotCharacters');
        const ctx = createDraftContext();
        ctx.state.activeGambitId = null;
        ctx.state.players = [
            { id: 0, name: 'Human 1', type: 'HUMAN', character: null },
            { id: 1, name: 'Human 2', type: 'HUMAN', character: null }
        ];

        ctx.app.startDraftPhase();
        assert.equal(ctx.state.draftOrder.length, 2);

        // P1 selects index 0
        const p1Chosen = ctx.state.currentDraftCandidates[0];
        ctx.app.selectDraftCharacter(0, 0);

        // P2 selects index 1
        const p2Chosen = ctx.state.currentDraftCandidates[1];
        ctx.app.selectDraftCharacter(1, 1);

        assert.equal(ctx.state.draftOrder.length, 0);
        assert.equal(ctx.state.players[0].character.id, p1Chosen.id);
        assert.equal(ctx.state.players[1].character.id, p2Chosen.id);
        assert.equal(ctx.getAssignBotCalls(), 1, 'assignBotCharacters must be called exactly once at draft completion');
        assert.equal(ctx.state.mode, 'GAME');
        console.log('✓ Scenario 4 Passed: Draft completes cleanly and invokes assignBotCharacters exactly once.');
    }

    // -------------------------------------------------------------
    // Test Scenario 5: Demo Gating
    // -------------------------------------------------------------
    {
        console.log('Scenario 5: Demo gating blocks PAIR in custom match, but permits Gambit 10/15');
        
        // 5a. Direct test of production isPick2BlockedInDemo
        assert.equal(isPick2BlockedInDemo('PAIR', false, null), true, 'PAIR custom match in demo is blocked');
        assert.equal(isPick2BlockedInDemo('PICK_2', false, null), true, 'PICK_2 custom match in demo is blocked');
        assert.equal(isPick2BlockedInDemo('PAIR', false, 10), false, 'PAIR in gambit 10 is permitted in demo');
        assert.equal(isPick2BlockedInDemo('PAIR', false, 15), false, 'PAIR in gambit 15 is permitted in demo');
        assert.equal(isPick2BlockedInDemo('PAIR', true, null), false, 'PAIR in full game is permitted');

        // 5b. Flow test
        const ctx = createDraftContext();
        global.window.GameConfig = { isFullGame: false }; // Demo mode

        ctx.state.activeGambitId = null;
        ctx.app.setSetupMode('PAIR');
        assert.equal(ctx.wasPromoModalShown(), true, 'Custom match PAIR in Demo must trigger promo modal');
        assert.notEqual(ctx.state.config.setupMode, 'PAIR', 'state.config.setupMode must not be set to PAIR in Demo custom match');

        // UnlockManager unit check
        assert.equal(UnlockManager.isDraftModeUnlocked('PAIR'), false, 'UnlockManager must report PAIR locked in Demo custom match');
        assert.equal(UnlockManager.isDraftModeUnlocked('PICK_2'), false, 'UnlockManager must report PICK_2 locked in Demo custom match');

        // 5c. Campaign Gambits 10 and 15 in Demo
        ctx.state.activeGambitId = 10;
        ctx.state.players = [
            { id: 0, name: 'Local 1', type: 'HUMAN', character: null }
        ];
        ctx.app.startDraftPhase();
        assert.equal(ctx.state.currentDraftCandidates.length, 2);
        assert.deepEqual(ctx.state.currentDraftCandidates.map(c => c.name).sort(), ['BRIGHT SHELL', 'EDITH']);

        ctx.state.activeGambitId = 15;
        ctx.app.startDraftPhase();
        assert.equal(ctx.state.currentDraftCandidates.length, 2);
        assert.deepEqual(ctx.state.currentDraftCandidates.map(c => c.name).sort(), ['BRIGHT SHELL', 'KINGSTON']);

        console.log('✓ Scenario 5 Passed: Demo gating correctly isolates custom match while preserving campaign Gambits 10 & 15.');
    }

    // -------------------------------------------------------------
    // Test Scenario 6: Viewport & Responsive Scaling Layout Guard
    // -------------------------------------------------------------
    {
        console.log('Scenario 6: Viewport containment & responsive scaling architecture');
        const htmlPath = path.resolve(__dirname, '../index.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Verify #draft-overlay is fixed inset-0 overflow-hidden without scrollbar classes or outer padding
        const draftOverlayMatch = htmlContent.match(/<div\s+id="draft-overlay"[^>]*class="([^"]*)"/);
        assert.ok(draftOverlayMatch, '#draft-overlay must be defined in index.html');
        const overlayClasses = draftOverlayMatch[1].split(/\s+/);
        assert.ok(overlayClasses.includes('fixed'), '#draft-overlay must be fixed');
        assert.ok(overlayClasses.includes('inset-0'), '#draft-overlay must cover full viewport (inset-0)');
        assert.ok(overlayClasses.includes('overflow-hidden'), '#draft-overlay must specify overflow-hidden to prevent scrollbars');
        assert.ok(!overlayClasses.includes('overflow-y-auto'), '#draft-overlay must not have overflow-y-auto');
        assert.ok(!overlayClasses.includes('p-8'), '#draft-overlay must not have p-8 (padding causes layout shifts)');

        // Verify #draft-scale-wrapper keeps 3840x2160 virtual canvas and center origin
        const draftScaleMatch = htmlContent.match(/<div\s+id="draft-scale-wrapper"[^>]*class="([^"]*)"/);
        assert.ok(draftScaleMatch, '#draft-scale-wrapper must be defined in index.html');
        const scaleClasses = draftScaleMatch[1].split(/\s+/);
        assert.ok(scaleClasses.includes('w-[3840px]'), '#draft-scale-wrapper must maintain 3840px width');
        assert.ok(scaleClasses.includes('h-[2160px]'), '#draft-scale-wrapper must maintain 2160px height');
        assert.ok(scaleClasses.includes('origin-center'), '#draft-scale-wrapper must use origin-center');

        // Verify responsive zoom applies scale transform correctly
        const ctx = createDraftContext();
        ctx.app.setBoardZoom(0.75);
        const draftScaleEl = globalDoc.getElementById('draft-scale-wrapper');
        assert.equal(draftScaleEl.style.transform, 'scale(0.75)', 'setBoardZoom must scale draft-scale-wrapper');

        console.log('✓ Scenario 6 Passed: #draft-overlay is non-scrollable and #draft-scale-wrapper preserves 4K zoom scaling.');
    }

    // -------------------------------------------------------------
    // Test Scenario 7: Responsive Timing & Delay Synchronization Audit
    // -------------------------------------------------------------
    {
        console.log('Scenario 7: Timing audit ensures flyer transition and JS timer are precisely synchronized at 350ms');
        const mainPath = path.resolve(__dirname, '../js/main.js');
        const mainContent = fs.readFileSync(mainPath, 'utf8');
        const cssPath = path.resolve(__dirname, '../index.css');
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const gamePath = path.resolve(__dirname, '../js/game.js');
        const gameContent = fs.readFileSync(gamePath, 'utf8');

        // Extract CSS transition duration for .draft-flyer
        const cssFlyerMatch = cssContent.match(/\.draft-flyer\s*\{([^}]+)\}/);
        assert.ok(cssFlyerMatch, '.draft-flyer rule must exist in index.css');
        const cssDurationMatch = cssFlyerMatch[1].match(/transition:\s*all\s+([0-9.]+)s/);
        assert.ok(cssDurationMatch, '.draft-flyer must have a transition duration in seconds');
        const cssSeconds = parseFloat(cssDurationMatch[1]);
        const cssMs = Math.round(cssSeconds * 1000);

        // Extract JS timeout delay for animateDraftChoice
        const jsDelayMatch = mainContent.match(/animateDraftChoice[\s\S]*?setTimeout\(\(\)\s*=>\s*\{[\s\S]*?callback\(\);[\s\S]*?\},\s*([0-9]+)\);/);
        assert.ok(jsDelayMatch, 'animateDraftChoice must have a numeric setTimeout callback duration');
        const jsMs = parseInt(jsDelayMatch[1], 10);

        // Assert exact synchronization
        assert.equal(jsMs, 350, 'JS flyer timeout must be fixed at 350ms');
        assert.equal(cssMs, 350, 'CSS flyer transition duration must be fixed at 350ms (0.35s)');
        assert.equal(jsMs, cssMs, 'JS completion callback timer and CSS transition duration must match exactly without drift');

        // Verify normal game startup in game.js does not wait 2500ms
        assert.ok(!gameContent.includes('const startDelay = 2500;'), 'Standard game startup must not use legacy 2500ms delay');

        console.log('✓ Scenario 7 Passed: Draft flyer CSS and JS timer are precisely synchronized at 350ms.');
    }

    console.log('\n==================================================');
    console.log('ALL PICK 2 REGRESSION TESTS PASSED SUCCESSFULLY.');
    console.log('==================================================\n');
}

await runPick2RegressionSuite();
