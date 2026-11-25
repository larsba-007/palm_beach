// tests/gambit_progression.test.js
// Targeted Progression Tests for 4/5 Level Unlocks vs 5/5 Automatic Progression

import assert from 'node:assert/strict';

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

function isLevelUnlocked(level, state) {
    if (level === 1) return true;
    const isDemo = !global.window.GameConfig || !global.window.GameConfig.isFullGame;
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

function isGambitUnlocked(gambitId, state) {
    const level = Math.ceil(gambitId / 5);
    return isLevelUnlocked(level, state);
}

function createMockApp(doc, state) {
    return {
        selectedGambitId: null,
        pendingNextGambitAction: null,
        pendingPromoAction: null,
        startGambitCalled: false,
        levelPlateShownLevel: null,
        levelPlateIsAuto: false,

        selectGambitV2(id) {
            this.selectedGambitId = id;
            state.activeGambitId = id;
        },

        startGambit() {
            this.startGambitCalled = true;
        },

        showGambitLevelPlate(level, isAuto = false) {
            this.levelPlateShownLevel = level;
            this.levelPlateIsAuto = isAuto;
            const modal = doc.getElementById('gambit-level-modal');
            if (modal) modal.classList.remove('hidden');
        },

        closeGambitLevelPlate() {
            const modal = doc.getElementById('gambit-level-modal');
            if (modal) modal.classList.add('hidden');
            if (this.pendingNextGambitAction) {
                const action = this.pendingNextGambitAction;
                this.pendingNextGambitAction = null;
                action();
            }
        },

        renderGambitGridV2() {},
        updateLocalNameDisplays() {},

        goToGambitsV2() {
            const v2Container = doc.getElementById('ui-v2-container');
            if (v2Container) {
                v2Container.style.display = 'flex';
                v2Container.classList.add('active');
            }
            const v2Content = doc.getElementById('ui-v2-content');
            if (v2Content) {
                v2Content.style.display = '';
            }

            state.isGameOver = false;
            state.gameStarted = false;
            state.mode = 'GAMBITS';

            const gambitV2 = doc.getElementById('panel-3-gambits-v2');
            if (gambitV2) {
                gambitV2.classList.remove('hidden');
                gambitV2.style.display = 'block';
            }

            this.renderGambitGridV2();

            const cleared = state.playerProfile.clearedGambits || [];
            let activeId = 1;
            const nextGambit = global.GAMBIT_CAMPAIGN.find(g => !cleared.includes(g.id) && isGambitUnlocked(g.id, state));
            if (nextGambit) {
                activeId = nextGambit.id;
            } else {
                const highestUnlocked = global.GAMBIT_CAMPAIGN.filter(g => isGambitUnlocked(g.id, state)).pop();
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
                if (isLevelUnlocked(l, state) && !seenIntros.includes(l)) {
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
                state.isGameOver = false;
                if (!state.activeGambitId) {
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

                    let clearedCountInLevel = 0;
                    for (let id = levelStart; id <= levelEnd; id++) {
                        if (cleared.includes(id)) {
                            clearedCountInLevel++;
                        }
                    }

                    let nextId = null;

                    if (clearedCountInLevel < 5) {
                        for (let id = currentId + 1; id <= levelEnd; id++) {
                            if (!cleared.includes(id)) {
                                nextId = id;
                                break;
                            }
                        }
                        if (nextId === null) {
                            for (let id = levelStart; id < currentId; id++) {
                                if (!cleared.includes(id)) {
                                    nextId = id;
                                    break;
                                }
                            }
                        }
                        if (nextId === null) {
                            nextId = currentId;
                        }

                        const nextLevel = currentLevel + 1;
                        const isDemo = !global.window.GameConfig || !global.window.GameConfig.isFullGame;
                        const isNextLevelValid = !isDemo || nextLevel <= 4;
                        if (nextLevel <= 10 && isNextLevelValid && isLevelUnlocked(nextLevel, state) && !state.playerProfile.seenGambitLevelIntros?.includes(nextLevel)) {
                            state.activeGambitId = nextId;
                            this.pendingNextGambitAction = () => {
                                this.selectGambitV2(nextId);
                            };
                            this.goToGambitsV2();
                            return;
                        }
                    } else {
                        const nextLevel = currentLevel + 1;
                        const isDemo = !global.window.GameConfig || !global.window.GameConfig.isFullGame;

                        if (isDemo && nextLevel > 4) {
                            this.goToGambitsV2();
                            return;
                        }

                        const firstGambitNextLevel = (nextLevel - 1) * 5 + 1;
                        const maxGambits = global.GAMBIT_CAMPAIGN.length;

                        if (firstGambitNextLevel > maxGambits) {
                            this.goToGambitsV2();
                            return;
                        }

                        nextId = firstGambitNextLevel;
                        state.activeGambitId = nextId;

                        if (nextLevel <= 10 && !state.playerProfile.seenGambitLevelIntros?.includes(nextLevel)) {
                            this.pendingNextGambitAction = () => {
                                this.selectGambitV2(firstGambitNextLevel);
                            };
                            this.goToGambitsV2();
                            return;
                        }
                    }

                    state.activeGambitId = nextId;
                }
                this.selectGambitV2(state.activeGambitId);
                this.startGambit();
            };

            performAction();
        }
    };
}

function runSuite() {
    console.log('==================================================');
    console.log('Running Campaign Progression Test Suite');
    console.log('==================================================');

    global.GAMBIT_CAMPAIGN = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));

    // Case A: 4 OF 5 COMPLETE (Level 1: 1,2,3,4 cleared, 5 incomplete)
    {
        console.log('\nCase A: 4 OF 5 COMPLETE (Level 1: 1, 2, 3, 4 cleared, 5 uncleared)');
        const doc = new MockDocument();
        doc.register('ui-v2-container', 'none');
        doc.register('ui-v2-content', '');
        doc.register('panel-3-gambits-v2', 'none', ['hidden']);
        doc.register('gambit-level-modal', 'none', ['hidden']);

        global.window = { GameConfig: { isFullGame: true } };

        const state = {
            settings: { hasSetLocalName: true, localName: 'PLAYER' },
            isGameOver: true,
            gameStarted: false,
            mode: 'GAME',
            activeGambitId: 4,
            playerProfile: {
                clearedGambits: [1, 2, 3, 4],
                seenGambitLevelIntros: [1]
            }
        };

        const app = createMockApp(doc, state);

        // 1. Verify Level 2 is unlocked
        assert.equal(isLevelUnlocked(2, state), true, 'Level 2 should be unlocked at 4/5 completion');

        // 2. Trigger NEXT GAMBIT action
        app.handleGambitAction(true);

        // Level 2 intro plate opens
        assert.equal(app.levelPlateShownLevel, 2, 'Level 2 intro plate must trigger');
        assert.equal(typeof app.pendingNextGambitAction, 'function', 'Continuation action must be queued');

        // Close level plate
        app.closeGambitLevelPlate();

        // Verify Gambit 5 is selected (NOT 6)
        assert.equal(app.selectedGambitId, 5, 'NEXT GAMBIT must select remaining Gambit 5 in current level');
        assert.notEqual(app.selectedGambitId, 6, 'NEXT GAMBIT must NOT skip to Gambit 6');
        assert.equal(state.mode, 'GAMBITS', 'Must return to GAMBITS mode');
        console.log('✓ Case A Passed: Level 2 unlocked, intro plate triggered, NEXT GAMBIT selected 5 (not 6).');
    }

    // Case B: 5 OF 5 COMPLETE (Level 1: 1,2,3,4,5 cleared)
    {
        console.log('\nCase B: 5 OF 5 COMPLETE (Level 1: 1, 2, 3, 4, 5 cleared)');
        const doc = new MockDocument();
        doc.register('ui-v2-container', 'none');
        doc.register('ui-v2-content', '');
        doc.register('panel-3-gambits-v2', 'none', ['hidden']);
        doc.register('gambit-level-modal', 'none', ['hidden']);

        global.window = { GameConfig: { isFullGame: true } };

        const state = {
            settings: { hasSetLocalName: true, localName: 'PLAYER' },
            isGameOver: true,
            gameStarted: false,
            mode: 'GAME',
            activeGambitId: 5,
            playerProfile: {
                clearedGambits: [1, 2, 3, 4, 5],
                seenGambitLevelIntros: [1, 2] // Level 2 intro already seen
            }
        };

        const app = createMockApp(doc, state);

        app.handleGambitAction(true);

        // Verify Gambit 6 is selected and game is started
        assert.equal(app.selectedGambitId, 6, 'NEXT GAMBIT on 5/5 complete must select Gambit 6');
        assert.equal(app.startGambitCalled, true, 'startGambit must be called automatically');
        console.log('✓ Case B Passed: NEXT GAMBIT at 5/5 automatically advances to Gambit 6.');
    }

    // Case C: DIFFERENT MISSING GAMBIT (Level 3: 11, 12, 14, 15 complete, 13 incomplete)
    {
        console.log('\nCase C: DIFFERENT MISSING GAMBIT (Level 3: 11, 12, 14, 15 cleared, 13 uncleared)');
        const doc = new MockDocument();
        doc.register('ui-v2-container', 'none');
        doc.register('ui-v2-content', '');
        doc.register('panel-3-gambits-v2', 'none', ['hidden']);
        doc.register('gambit-level-modal', 'none', ['hidden']);

        global.window = { GameConfig: { isFullGame: true } };

        const state = {
            settings: { hasSetLocalName: true, localName: 'PLAYER' },
            isGameOver: true,
            gameStarted: false,
            mode: 'GAME',
            activeGambitId: 15, // Just finished 15
            playerProfile: {
                clearedGambits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15],
                seenGambitLevelIntros: [1, 2, 3]
            }
        };

        const app = createMockApp(doc, state);

        // Level 4 is unlocked (4 of 5 in Level 3 cleared)
        assert.equal(isLevelUnlocked(4, state), true, 'Level 4 should be unlocked');

        app.handleGambitAction(true);

        // Level 4 plate opens
        assert.equal(app.levelPlateShownLevel, 4, 'Level 4 plate should trigger');

        // Close plate
        app.closeGambitLevelPlate();

        // Verify Gambit 13 is selected (wrapped around to uncleared in current Level)
        assert.equal(app.selectedGambitId, 13, 'NEXT GAMBIT must wrap around and select remaining uncleared Gambit 13');
        assert.notEqual(app.selectedGambitId, 16, 'NEXT GAMBIT must NOT skip to Gambit 16');
        console.log('✓ Case C Passed: NEXT GAMBIT selected missing Gambit 13, did not skip to 16.');
    }

    // Case D: PLAYER MANUALLY CHOOSES NEXT LEVEL (With Level 4 unlocked at 4/5, click Gambit 16)
    {
        console.log('\nCase D: PLAYER MANUALLY CHOOSES NEXT LEVEL (Click Gambit 16 when unlocked at 4/5)');
        const doc = new MockDocument();
        doc.register('ui-v2-container', 'none');
        doc.register('ui-v2-content', '');
        doc.register('panel-3-gambits-v2', 'none', ['hidden']);

        global.window = { GameConfig: { isFullGame: true } };

        const state = {
            settings: { hasSetLocalName: true, localName: 'PLAYER' },
            isGameOver: false,
            gameStarted: false,
            mode: 'GAMBITS',
            activeGambitId: 13,
            playerProfile: {
                clearedGambits: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15],
                seenGambitLevelIntros: [1, 2, 3, 4]
            }
        };

        const app = createMockApp(doc, state);

        // Player clicks Gambit 16 node
        assert.equal(isGambitUnlocked(16, state), true, 'Gambit 16 must be unlocked');
        app.selectGambitV2(16);

        assert.equal(app.selectedGambitId, 16, 'Player manual selection of Gambit 16 succeeds');
        assert.equal(state.activeGambitId, 16, 'state.activeGambitId updated to 16');
        console.log('✓ Case D Passed: Player can freely click and select unlocked Gambit 16 manually.');
    }

    // Case E: LEVEL PLATE CONTINUATION (Closing plate preserves remaining uncleared Gambit)
    {
        console.log('\nCase E: LEVEL PLATE CONTINUATION (Closing plate preserves selection of uncleared Gambit)');
        const doc = new MockDocument();
        doc.register('ui-v2-container', 'none');
        doc.register('ui-v2-content', '');
        doc.register('panel-3-gambits-v2', 'none', ['hidden']);
        doc.register('gambit-level-modal', 'none', ['hidden']);

        global.window = { GameConfig: { isFullGame: true } };

        const state = {
            settings: { hasSetLocalName: true, localName: 'PLAYER' },
            isGameOver: true,
            gameStarted: false,
            mode: 'GAME',
            activeGambitId: 2,
            playerProfile: {
                clearedGambits: [1, 2, 3, 4], // 5 is uncleared
                seenGambitLevelIntros: [1]
            }
        };

        const app = createMockApp(doc, state);
        app.handleGambitAction(true);

        assert.equal(app.levelPlateShownLevel, 2);
        app.closeGambitLevelPlate();

        assert.equal(app.selectedGambitId, 5, 'Continuation on plate close preserves remaining Gambit 5');
        console.log('✓ Case E Passed: Plate continuation cleanly selects remaining Gambit 5.');
    }

    // Demo Mode Check: Demo restricts to Levels <= 4, 4/5 unlock and progression rules remain consistent
    {
        console.log('\nDemo Check: Demo mode restricts to level 4 but maintains identical progression mechanics');
        const doc = new MockDocument();
        doc.register('ui-v2-container', 'none');
        doc.register('ui-v2-content', '');
        doc.register('panel-3-gambits-v2', 'none', ['hidden']);
        doc.register('gambit-level-modal', 'none', ['hidden']);

        global.window = { GameConfig: { isFullGame: false } }; // Demo mode

        const state = {
            settings: { hasSetLocalName: true, localName: 'DEMO PLAYER' },
            isGameOver: true,
            gameStarted: false,
            mode: 'GAME',
            activeGambitId: 4,
            playerProfile: {
                clearedGambits: [1, 2, 3, 4],
                seenGambitLevelIntros: [1]
            }
        };

        const app = createMockApp(doc, state);

        assert.equal(isLevelUnlocked(2, state), true, 'Level 2 unlocks in demo at 4/5');
        assert.equal(isLevelUnlocked(5, state), false, 'Level 5 remains locked in demo');

        app.handleGambitAction(true);
        app.closeGambitLevelPlate();

        assert.equal(app.selectedGambitId, 5, 'Demo NEXT GAMBIT at 4/5 selects Gambit 5 (no skipping)');
        console.log('✓ Demo Check Passed: Demo progression honors 4/5 unlock and selects remaining Gambit 5 without skipping.');
    }

    console.log('\n==================================================');
    console.log('ALL PROGRESSION TESTS PASSED SUCCESSFULLY.');
    console.log('==================================================\n');
}

runSuite();
