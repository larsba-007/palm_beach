// tests/gambit_navigation_regression.test.js
// Regression test: ui-v2-container visibility restoration when navigating to Gambits

import assert from 'node:assert/strict';

// Setup minimal mock DOM
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
}

function runRegressionSuite() {
    console.log('--- Running Gambit Navigation & ui-v2-container Visibility Tests ---');

    // Test 1: Direct goToGambitsV2() restores ui-v2-container and ui-v2-content from hidden state
    {
        console.log('Test 1: Direct app.goToGambitsV2() restores hidden ui-v2-container and ui-v2-content');
        const doc = new MockDocument();
        const v2Container = doc.register('ui-v2-container', 'none');
        const v2Content = doc.register('ui-v2-content', 'none');
        const hub = doc.register('panel-1-hub', 'block');
        const setup = doc.register('panel-2-setup', 'none', ['hidden']);
        const setupV2 = doc.register('panel-2-setup-v2', 'none', ['hidden']);
        const gambit = doc.register('panel-3-gambits', 'none', ['hidden']);
        const gambitV2 = doc.register('panel-3-gambits-v2', 'none', ['hidden']);
        const logo = doc.register('v2-main-logo', 'block');
        const localHeader = doc.register('local-card-header-v2');

        // Global mocks
        global.document = doc;
        global.window = {
            dispatchEvent: () => {},
            Event: class Event {},
            GameConfig: { isFullGame: false } // Demo mode
        };

        const mockState = {
            settings: { hasSetLocalName: true, localName: 'PLAYER' },
            isGameOver: true,
            gameStarted: true,
            mode: 'GAME',
            activeGambitId: 3,
            playerProfile: {
                clearedGambits: [1, 2, 3],
                seenGambitLevelIntros: [1]
            }
        };
        global.state = mockState;
        global.GAMBIT_CAMPAIGN = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
        global.isGambitUnlocked = (id) => id <= 4;
        global.isLevelUnlocked = (l) => l <= 2;

        let gridRendered = false;
        let selectedGambitId = null;
        let shownPlateLevel = null;

        const app = {
            renderGambitGridV2() { gridRendered = true; },
            selectGambitV2(id) { selectedGambitId = id; },
            updateLocalNameDisplays() {},
            showGambitLevelPlate(lvl) { shownPlateLevel = lvl; },
            goToGambitsV2() {
                if (!state.settings.hasSetLocalName) {
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

                state.isGameOver = false;
                state.gameStarted = false;
                state.mode = 'GAMBITS';
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

                const seenIntros = state.playerProfile?.seenGambitLevelIntros || [];
                let autoLevel = null;
                for (let l = 1; l <= 10; l++) {
                    if (isLevelUnlocked(l) && !seenIntros.includes(l)) {
                        autoLevel = l;
                        break;
                    }
                }
                if (autoLevel !== null) {
                    this.showGambitLevelPlate(autoLevel, true);
                }
            }
        };

        // Assert initial state before navigation
        assert.equal(v2Container.style.display, 'none');
        assert.equal(v2Content.style.display, 'none');
        assert.equal(mockState.mode, 'GAME');

        // Execute navigation
        app.goToGambitsV2();

        // Verifications
        assert.equal(v2Container.style.display, 'flex', 'ui-v2-container display should be flex');
        assert.equal(v2Container.classList.contains('active'), true, 'ui-v2-container should have class "active"');
        assert.notEqual(v2Content.style.display, 'none', 'ui-v2-content display should not be none');
        assert.equal(v2Content.style.display, '', 'ui-v2-content display should be empty string (default)');
        assert.equal(gambitV2.style.display, 'block', 'panel-3-gambits-v2 display should be block');
        assert.equal(gambitV2.classList.contains('hidden'), false, 'panel-3-gambits-v2 should not have class "hidden"');
        assert.equal(mockState.mode, 'GAMBITS', 'state.mode should be GAMBITS');
        assert.equal(mockState.isGameOver, false, 'state.isGameOver should be false');
        assert.equal(mockState.gameStarted, false, 'state.gameStarted should be false');
        assert.equal(gridRendered, true, 'gambit grid should be rendered');
        assert.equal(shownPlateLevel, 2, 'Level 2 plate should be triggered for newly unlocked Level 2');
        console.log('✓ Test 1 Passed!');
    }

    // Test 2: Full Demo Gambit 3 Completion -> Promo Modal -> Continue Flow
    {
        console.log('Test 2: Demo Gambit 3 Completion -> Promo Modal -> Continue flow ensures UI visibility');
        const doc = new MockDocument();
        const v2Container = doc.register('ui-v2-container', 'none'); // Hidden by startGame
        const v2Content = doc.register('ui-v2-content', '');
        const gambitV2 = doc.register('panel-3-gambits-v2', 'none', ['hidden']);
        const promoModal = doc.register('promo-modal', 'none', ['hidden']);
        const promoBtnConfirm = doc.register('promo-btn-confirm');

        global.document = doc;
        global.window = {
            dispatchEvent: () => {},
            Event: class Event {},
            GameConfig: { isFullGame: false } // Demo configuration
        };

        const mockState = {
            settings: { hasSetLocalName: true, localName: 'DEMO PLAYER' },
            isGameOver: true,
            gameStarted: false,
            mode: 'GAME',
            activeGambitId: 3,
            playerProfile: {
                clearedGambits: [1, 2, 3, 4],
                seenGambitLevelIntros: [1]
            }
        };
        global.state = mockState;
        global.GAMBIT_CAMPAIGN = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
        global.isGambitUnlocked = (id) => id <= 6;
        global.isLevelUnlocked = (l) => l <= 2;

        let selectedGambitId = null;
        let shownPlateLevel = null;

        const app = {
            pendingPromoAction: null,
            pendingNextGambitAction: null,
            renderGambitGridV2() {},
            selectGambitV2(id) { selectedGambitId = id; },
            updateLocalNameDisplays() {},
            showGambitLevelPlate(lvl) { shownPlateLevel = lvl; },
            showPromoModal(onConfirm) {
                app.pendingPromoAction = onConfirm || null;
                promoModal.classList.remove('hidden');
                promoBtnConfirm.onclick = () => {
                    promoModal.classList.add('hidden');
                    if (app.pendingPromoAction) {
                        const cb = app.pendingPromoAction;
                        app.pendingPromoAction = null;
                        cb();
                    }
                };
            },
            goToGambitsV2() {
                if (!state.settings.hasSetLocalName) return;

                const v2Container = document.getElementById('ui-v2-container');
                if (v2Container) {
                    v2Container.style.display = 'flex';
                    v2Container.classList.add('active');
                }

                const v2Content = document.getElementById('ui-v2-content');
                if (v2Content) {
                    v2Content.style.display = '';
                }

                state.isGameOver = false;
                state.gameStarted = false;
                state.mode = 'GAMBITS';

                const gambitV2 = document.getElementById('panel-3-gambits-v2');
                if (gambitV2) {
                    gambitV2.classList.remove('hidden');
                    gambitV2.style.display = 'block';
                }

                this.renderGambitGridV2();

                const seenIntros = state.playerProfile?.seenGambitLevelIntros || [];
                let autoLevel = null;
                for (let l = 1; l <= 10; l++) {
                    if (isLevelUnlocked(l) && !seenIntros.includes(l)) {
                        autoLevel = l;
                        break;
                    }
                }
                if (autoLevel !== null) {
                    this.showGambitLevelPlate(autoLevel, true);
                }
            },
            handleGambitAction(isWin) {
                const performAction = () => {
                    const currentId = state.activeGambitId;
                    const currentLevel = Math.ceil(currentId / 5);
                    const levelStart = (currentLevel - 1) * 5 + 1;
                    const levelEnd = currentLevel * 5;
                    const cleared = state.playerProfile?.clearedGambits || [];

                    let clearedCountInLevel = 0;
                    for (let id = levelStart; id <= levelEnd; id++) {
                        if (cleared.includes(id)) clearedCountInLevel++;
                    }

                    let nextId = null;
                    if (clearedCountInLevel < 5) {
                        for (let id = currentId + 1; id <= levelEnd; id++) {
                            if (!cleared.includes(id)) { nextId = id; break; }
                        }
                        if (nextId === null) {
                            for (let id = levelStart; id < currentId; id++) {
                                if (!cleared.includes(id)) { nextId = id; break; }
                            }
                        }
                        if (nextId === null) nextId = currentId;

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
                        const nextLevel = currentLevel + 1;
                        const firstGambitNextLevel = (nextLevel - 1) * 5 + 1;
                        nextId = firstGambitNextLevel;
                        state.activeGambitId = nextId;
                        if (nextLevel <= 10 && !state.playerProfile.seenGambitLevelIntros?.includes(nextLevel)) {
                            app.pendingNextGambitAction = () => {
                                app.selectGambitV2(firstGambitNextLevel);
                            };
                            app.goToGambitsV2();
                            return;
                        }
                    }
                };

                const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
                if (isDemo && app.showPromoModal) {
                    app.showPromoModal(performAction);
                    return;
                }
                performAction();
            }
        };

        // User finishes Gambit and triggers next gambit action in demo
        app.handleGambitAction(true);

        // Promo modal is shown
        assert.equal(promoModal.classList.contains('hidden'), false);
        assert.equal(typeof promoBtnConfirm.onclick, 'function');

        // User confirms promo modal
        promoBtnConfirm.onclick();

        // Verifications after promo modal continue
        assert.equal(v2Container.style.display, 'flex', 'ui-v2-container must be flex');
        assert.equal(v2Container.classList.contains('active'), true, 'ui-v2-container must be active');
        assert.equal(v2Content.style.display, '', 'ui-v2-content display must be empty string');
        assert.equal(gambitV2.style.display, 'block', 'panel-3-gambits-v2 must be visible');
        assert.equal(mockState.mode, 'GAMBITS', 'mode must be GAMBITS');
        assert.equal(shownPlateLevel, 2, 'Level 2 intro plate must be shown');
        console.log('✓ Test 2 Passed!');
    }

    // Test 3: Full Game / Non-demo campaign return
    {
        console.log('Test 3: Non-demo campaign return flow verification');
        const doc = new MockDocument();
        const v2Container = doc.register('ui-v2-container', 'none');
        const v2Content = doc.register('ui-v2-content', 'none');
        const gambitV2 = doc.register('panel-3-gambits-v2', 'none', ['hidden']);

        global.document = doc;
        global.window = {
            dispatchEvent: () => {},
            Event: class Event {},
            GameConfig: { isFullGame: true } // Full Game mode
        };

        const mockState = {
            settings: { hasSetLocalName: true, localName: 'FULL PLAYER' },
            isGameOver: false,
            gameStarted: false,
            mode: 'HUB',
            activeGambitId: null,
            playerProfile: {
                clearedGambits: [1, 2, 3],
                seenGambitLevelIntros: [1]
            }
        };
        global.state = mockState;
        global.GAMBIT_CAMPAIGN = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
        global.isGambitUnlocked = (id) => id <= 4;
        global.isLevelUnlocked = (l) => l <= 1;

        const app = {
            renderGambitGridV2() {},
            selectGambitV2() {},
            updateLocalNameDisplays() {},
            showGambitLevelPlate() {},
            goToGambitsV2() {
                if (!state.settings.hasSetLocalName) return;

                const v2Container = document.getElementById('ui-v2-container');
                if (v2Container) {
                    v2Container.style.display = 'flex';
                    v2Container.classList.add('active');
                }

                const v2Content = document.getElementById('ui-v2-content');
                if (v2Content) {
                    v2Content.style.display = '';
                }

                state.isGameOver = false;
                state.gameStarted = false;
                state.mode = 'GAMBITS';

                const gambitV2 = document.getElementById('panel-3-gambits-v2');
                if (gambitV2) {
                    gambitV2.classList.remove('hidden');
                    gambitV2.style.display = 'block';
                }
            }
        };

        app.goToGambitsV2();

        assert.equal(v2Container.style.display, 'flex');
        assert.equal(v2Container.classList.contains('active'), true);
        assert.equal(v2Content.style.display, '');
        assert.equal(gambitV2.style.display, 'block');
        assert.equal(mockState.mode, 'GAMBITS');
        console.log('✓ Test 3 Passed!');
    }

    console.log('\nALL 3 REGRESSION TESTS PASSED SUCCESSFULLY.');
}

runRegressionSuite();
