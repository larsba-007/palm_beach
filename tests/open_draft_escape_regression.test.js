// tests/open_draft_escape_regression.test.js
// Regression tests for Open Draft Escape-Key State Corruption Fix & Objectives Modal ESC Hierarchy

import assert from 'node:assert/strict';

// Helper to create mock elements
function createMockElement(id, initialDisplay = '', initialClasses = []) {
    const classList = new Set(initialClasses);
    return {
        id,
        style: {
            display: initialDisplay,
            opacity: '1',
            pointerEvents: 'auto',
            transform: '',
        },
        classList: {
            add: (...cls) => cls.forEach(c => classList.add(c)),
            remove: (...cls) => cls.forEach(c => classList.delete(c)),
            contains: (c) => classList.has(c),
        },
        innerHTML: '',
        innerText: '',
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
        if (selector === '.compendium-nav') {
            return this.elements.get('compendium-nav') || null;
        }
        return null;
    }
}

// Global state and logic mocks matching implementation in main.js and ui.js

let state = null;
let app = null;
let keydownCallback = null;
let assignBotCharactersCalled = false;
let finalizePlayerSetupCalledCount = 0;
let startTurnCycleCalled = false;

const CHARACTERS = [
    { id: 1, name: 'ERIC' },
    { id: 2, name: 'MS. POST' },
    { id: 3, name: 'PIRATE' },
    { id: 4, name: 'GRAN GRAN' }
];

function assignBotCharacters() {
    assignBotCharactersCalled = true;
    state.mode = 'GAME';
}

function finalizePlayerSetup(player) {
    finalizePlayerSetupCalledCount++;
}

// The handler from js/main.js
function handleKeyDown(e) {
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

        const modals = ['unified-settings-modal', 'rulebook-modal', 'gallery-modal', 'ability-modal', 'message-modal', 'god-mode-overlay', 'resign-modal', 'confrontation-modal', 'promo-modal', 'start-promo-modal', 'about-modal', 'local-name-popup', 'abort-match-modal', 'tutorial-recommended-modal', 'level-unlocked-modal'];
        const openModal = modals.find(id => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden');
        });

        if (openModal) {
            if (openModal === 'god-mode-overlay') {
                // Debug.closeGodMode();
            } else if (openModal === 'unified-settings-modal') {
                app.toggleSettings();
            } else if (openModal === 'local-name-popup') {
                // app.closeLocalNamePopup();
            } else if (openModal === 'promo-modal') {
                // app.closePromoModal();
            } else {
                document.getElementById(openModal).classList.add('hidden');
            }
            return;
        }

        // 2. Contextual ESC Behavior (No overlay modal open)
        if (app.isMatchActive()) {
            app.togglePause();
        } else {
            if (state.mode === 'SETUP' || state.mode === 'GAMBITS') {
                app.goToMainHub();
            }
        }
    }
}

// The closeCompendium from js/ui.js
function closeCompendium(force = false) {
    if (state && state.mode === 'OPEN_DRAFT' && !force) {
        return;
    }
    const modal = document.getElementById('compendium-modal');
    if (modal) modal.classList.add('hidden');
}

// The closeGambitObjectivesModal from js/ui.js
function closeGambitObjectivesModal() {
    const modal = document.getElementById('gambit-objective-modal');
    if (!modal || modal.classList.contains('hidden')) return;

    const wasStart = state.isGambitObjectiveStart;
    state.isGambitObjectiveStart = false;

    modal.classList.add('hidden');

    if (wasStart && app && typeof app.startTurnCycle === 'function') {
        app.startTurnCycle();
    }
}

function runOpenDraftEscapeTests() {
    console.log('--- Running Escape Key & Modal Hierarchy Tests ---');

    // Initialize environment
    const doc = new MockDocument();
    global.document = doc;
    global.window = {
        addEventListener: (event, cb) => {
            if (event === 'keydown') {
                keydownCallback = cb;
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Register UI elements
    doc.register('compendium-modal', '');
    doc.register('abort-match-modal', 'none', ['hidden']);
    doc.register('unified-settings-modal', 'none', ['hidden']);
    doc.register('gambit-objective-modal', 'none', ['hidden']);
    doc.register('compendium-nav', '');
    doc.register('compendium-back-btn', '');

    // Common app flags/spies
    let goToMainHubCalled = false;
    let togglePauseCalled = false;
    let toggleSettingsCalled = false;
    let closeAbortMatchModalCalled = false;
    let closeGambitObjectivesModalCalled = false;
    startTurnCycleCalled = false;

    app = {
        closeCompendium,
        closeGambitObjectivesModal: () => {
            closeGambitObjectivesModalCalled = true;
            closeGambitObjectivesModal();
        },
        startTurnCycle: () => {
            startTurnCycleCalled = true;
        },
        nextOpenDraftTurn: () => {
            if (state.draftOrder.length === 0) {
                app.selectingLocalForSlot = null;
                app.closeCompendium(true); // Forced close
                assignBotCharacters();
                return;
            }
            const playerId = state.draftOrder[0];
            app.selectingLocalForSlot = playerId;
        },
        handleOpenDraftPick: (charId) => {
            const playerId = state.draftOrder.shift();
            state.players[playerId].character = CHARACTERS.find(c => c.id === charId);
            finalizePlayerSetup(state.players[playerId]);
            app.selectingLocalForSlot = null;
            app.nextOpenDraftTurn();
        },
        closeAbortMatchModal: () => { closeAbortMatchModalCalled = true; },
        toggleSettings: () => { toggleSettingsCalled = true; },
        isMatchActive: () => state.mode === 'GAME',
        togglePause: () => { togglePauseCalled = true; },
        goToMainHub: () => { goToMainHubCalled = true; }
    };

    // A. TEST CASE: OPEN DRAFT + ESC
    {
        console.log('Test A: OPEN DRAFT + ESC does nothing, draft remains intact');
        state = {
            mode: 'OPEN_DRAFT',
            draftOrder: [0, 1],
            players: [
                { id: 0, name: 'Player 1', type: 'HUMAN', character: null },
                { id: 1, name: 'Player 2', type: 'HUMAN', character: null }
            ],
            openDraftPool: [...CHARACTERS],
            openDraftTaken: {},
            isProcessing: false
        };
        assignBotCharactersCalled = false;

        const compModal = doc.getElementById('compendium-modal');
        compModal.classList.remove('hidden'); // Compendium is visible

        // Simulate press Escape
        const event = {
            key: 'Escape',
            defaultPrevented: false,
            propagationStopped: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this.propagationStopped = true; }
        };
        keydownCallback(event);

        // Verifications
        assert.equal(state.mode, 'OPEN_DRAFT', 'Mode should remain OPEN_DRAFT');
        assert.deepEqual(state.draftOrder, [0, 1], 'Draft order should be unchanged');
        assert.equal(compModal.classList.contains('hidden'), false, 'Compendium modal must remain visible');
        assert.equal(event.defaultPrevented, true, 'Escape key default action must be prevented');
        assert.equal(event.propagationStopped, true, 'Escape key propagation must be stopped');
        console.log('✓ Test A Passed!');
    }

    // B. TEST CASE: OPEN DRAFT AFTER FIRST PICK + ESC
    {
        console.log('Test B: Escape after first pick preserves first selection and drafting continues');
        state = {
            mode: 'OPEN_DRAFT',
            draftOrder: [0, 1],
            players: [
                { id: 0, name: 'Player 1', type: 'HUMAN', character: null },
                { id: 1, name: 'Player 2', type: 'HUMAN', character: null }
            ],
            openDraftPool: [...CHARACTERS],
            openDraftTaken: {},
            isProcessing: false
        };
        assignBotCharactersCalled = false;
        finalizePlayerSetupCalledCount = 0;

        // Perform first pick
        app.handleOpenDraftPick(2); // Player 1 picks MS. POST (ID 2)

        assert.equal(state.players[0].character.name, 'MS. POST', 'First selection must be preserved');
        assert.deepEqual(state.draftOrder, [1], 'Only Player 2 is left in draftOrder');
        assert.equal(app.selectingLocalForSlot, 1, 'Player 2 is currently drafting');

        const compModal = doc.getElementById('compendium-modal');
        compModal.classList.remove('hidden'); // Compendium remains visible

        // Press Escape
        const event = {
            key: 'Escape',
            defaultPrevented: false,
            propagationStopped: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this.propagationStopped = true; }
        };
        keydownCallback(event);

        // Verifications
        assert.equal(state.mode, 'OPEN_DRAFT', 'Mode should remain OPEN_DRAFT');
        assert.deepEqual(state.draftOrder, [1], 'Draft order should be unchanged by ESC');
        assert.equal(compModal.classList.contains('hidden'), false, 'Compendium modal must remain visible');
        console.log('✓ Test B Passed!');
    }

    // C. TEST CASE: OPEN DRAFT COMPLETION
    {
        console.log('Test C: Normal completion of draft triggers closeCompendium and starts game');
        state = {
            mode: 'OPEN_DRAFT',
            draftOrder: [1], // Only Player 2 left
            players: [
                { id: 0, name: 'Player 1', type: 'HUMAN', character: CHARACTERS[1] },
                { id: 1, name: 'Player 2', type: 'HUMAN', character: null }
            ],
            openDraftPool: [...CHARACTERS],
            openDraftTaken: { 2: { playerId: 0 } },
            isProcessing: false
        };
        assignBotCharactersCalled = false;
        const compModal = doc.getElementById('compendium-modal');
        compModal.classList.remove('hidden');

        // Complete final pick
        app.handleOpenDraftPick(3); // Player 2 picks PIRATE (ID 3)

        // Verifications
        assert.deepEqual(state.draftOrder, [], 'Draft order should be empty');
        assert.equal(state.players[1].character.name, 'PIRATE', 'Second player selection set');
        assert.equal(compModal.classList.contains('hidden'), true, 'Compendium modal should close on completion');
        assert.equal(assignBotCharactersCalled, true, 'assignBotCharacters must run');
        assert.equal(state.mode, 'GAME', 'Game should be initialized and mode set to GAME');
        console.log('✓ Test C Passed!');
    }

    // D. TEST CASE: NORMAL COMPENDIUM
    {
        console.log('Test D: Escape outside OPEN_DRAFT closes normal Compendium');
        state = { mode: 'SETUP' };
        
        const compModal = doc.getElementById('compendium-modal');
        compModal.classList.remove('hidden');

        // Press Escape
        const event = {
            key: 'Escape',
            defaultPrevented: false,
            propagationStopped: false,
            preventDefault() {},
            stopPropagation() {}
        };
        keydownCallback(event);

        assert.equal(compModal.classList.contains('hidden'), true, 'Compendium modal should close when not in OPEN_DRAFT');
        console.log('✓ Test D Passed!');
    }

    // E. TEST CASE: SETTINGS / OTHER SCREENS
    {
        console.log('Test E: Normal Escape behavior outside OPEN_DRAFT handles settings and other screens');
        
        // 1. Settings open
        state = { mode: 'SETUP' };
        const settingsModal = doc.getElementById('unified-settings-modal');
        settingsModal.classList.remove('hidden');

        const event = {
            key: 'Escape',
            defaultPrevented: false,
            propagationStopped: false,
            preventDefault() {},
            stopPropagation() {}
        };
        toggleSettingsCalled = false;
        keydownCallback(event);

        assert.equal(toggleSettingsCalled, true, 'Escape must toggle/close Settings when settings modal is open');

        // 2. No modal open, SETUP/GAMBITS mode
        settingsModal.classList.add('hidden');
        goToMainHubCalled = false;
        const event2 = {
            key: 'Escape',
            defaultPrevented: false,
            propagationStopped: false,
            preventDefault() {},
            stopPropagation() {}
        };
        keydownCallback(event2);
        assert.equal(goToMainHubCalled, true, 'Escape must return to main hub from SETUP/GAMBITS screen when no modals are open');

        console.log('✓ Test E Passed!');
    }

    // F. TEST CASE: GAMEPLAY + OBJECTIVES OPEN + ESC
    {
        console.log('Test F: ESC closes Objectives and does NOT open settings');
        state = { mode: 'GAME' };
        
        const objectiveModal = doc.getElementById('gambit-objective-modal');
        objectiveModal.classList.remove('hidden'); // Objectives open

        togglePauseCalled = false;
        closeGambitObjectivesModalCalled = false;

        const event = {
            key: 'Escape',
            preventDefault() {},
            stopPropagation() {}
        };
        keydownCallback(event);

        assert.equal(closeGambitObjectivesModalCalled, true, 'closeGambitObjectivesModal must be called');
        assert.equal(objectiveModal.classList.contains('hidden'), true, 'Objectives modal must be hidden');
        assert.equal(togglePauseCalled, false, 'Settings/Pause should NOT be opened');
        console.log('✓ Test F Passed!');
    }

    // G. TEST CASE: GAMEPLAY + OBJECTIVES CLOSED + ESC
    {
        console.log('Test G: ESC opens Settings when Objectives are closed');
        state = { mode: 'GAME' };
        
        const objectiveModal = doc.getElementById('gambit-objective-modal');
        objectiveModal.classList.add('hidden'); // Objectives closed

        togglePauseCalled = false;

        const event = {
            key: 'Escape',
            preventDefault() {},
            stopPropagation() {}
        };
        keydownCallback(event);

        assert.equal(togglePauseCalled, true, 'Settings/Pause must be opened');
        console.log('✓ Test G Passed!');
    }

    // H. TEST CASE: MATCH-START OBJECTIVES + ESC
    {
        console.log('Test H: ESC during match-start Objectives closes Objectives and runs startTurnCycle()');
        state = { mode: 'GAME', isGambitObjectiveStart: true };
        
        const objectiveModal = doc.getElementById('gambit-objective-modal');
        objectiveModal.classList.remove('hidden'); // Objectives open

        closeGambitObjectivesModalCalled = false;
        startTurnCycleCalled = false;

        const event = {
            key: 'Escape',
            preventDefault() {},
            stopPropagation() {}
        };
        keydownCallback(event);

        assert.equal(closeGambitObjectivesModalCalled, true, 'closeGambitObjectivesModal must be called');
        assert.equal(objectiveModal.classList.contains('hidden'), true, 'Objectives modal must be hidden');
        assert.equal(state.isGambitObjectiveStart, false, 'isGambitObjectiveStart must be reset to false');
        assert.equal(startTurnCycleCalled, true, 'startTurnCycle must be executed on match-start objective close');
        console.log('✓ Test H Passed!');
    }

    console.log('\nALL 8 REGRESSION TESTS PASSED SUCCESSFULLY.');
}

runOpenDraftEscapeTests();
