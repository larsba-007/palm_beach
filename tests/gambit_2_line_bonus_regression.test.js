// tests/gambit_2_line_bonus_regression.test.js
// Comprehensive regression test suite for Gambit 2 tutorial presentation, board sequencing, and Line Bonus improvements

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup minimal mock DOM & browser environment
function createMockElement(id, initialDisplay = '', initialClasses = []) {
    const classList = new Set(initialClasses);
    const listeners = new Map();
    return {
        id,
        style: {
            display: initialDisplay,
            opacity: '',
            pointerEvents: '',
            transform: '',
            zIndex: '',
        },
        classList: {
            add: (...cls) => cls.forEach(c => classList.add(c)),
            remove: (...cls) => cls.forEach(c => classList.delete(c)),
            contains: (c) => classList.has(c),
        },
        children: [],
        innerHTML: '',
        innerText: '',
        appendChild: function(child) { this.children.push(child); },
        remove: function() {},
        querySelector: function(sel) { return null; },
        focus: () => {},
        addEventListener: function(event, callback) {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(callback);
        },
        removeEventListener: function(event, callback) {
            if (!listeners.has(event)) return;
            const arr = listeners.get(event).filter(cb => cb !== callback);
            listeners.set(event, arr);
        },
        dispatchEvent: function(event) {
            const list = listeners.get(event.type) || [];
            list.forEach(cb => cb(event));
        }
    };
}

class MockDocument {
    constructor() {
        this.elements = new Map();
        this.body = {
            appendChild: () => {},
            classList: {
                add: () => {},
                remove: () => {},
                contains: () => false,
            }
        };
    }

    createElement(tagName) {
        return createMockElement(`element-${Math.random().toString(36).substr(2, 9)}`);
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

async function runGambit2LineBonusRegressionSuite() {
    console.log('--- Running Gambit 2 Tutorial & Line Bonus Regression Suite (Direct Production Logic) ---');

    // Dynamic imports of actual production code
    const { state } = await import('../js/state.js');
    const { audioMgr } = await import('../js/audio.js');
    const { checkLineBonuses, handleGambit2Step10Progress } = await import('../js/game.js');
    const { resetGambit2MapCards, triggerWaveAnimation } = await import('../js/ui.js');

    // Attach to global window
    global.window.state = state;
    global.window.audioMgr = audioMgr;
    global.window.checkLineBonuses = checkLineBonuses;
    global.window.handleGambit2Step10Progress = handleGambit2Step10Progress;
    global.window.resetGambit2MapCards = resetGambit2MapCards;

    // Helper to generate full 8x9 grid
    function createGrid() {
        const grid = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                grid.push({
                    id: `${r}-${c}`,
                    r,
                    c,
                    empty: false,
                    isBonus: (r !== 4 ? (c >= 2 && c <= 6) : (c === 2 || c === 3)),
                    spriteIndex: (r * 8) + c,
                    flipped: false
                });
            }
        }
        return grid;
    }

    // -------------------------------------------------------------
    // Test 1: Bonus + Landmark showcase keeps cards open, then Step 10 restores practice row only
    // -------------------------------------------------------------
    {
        console.log('Test 1: Showcase keeps both open, Step 10 restores only practice row 4');
        globalDoc.elements.clear();
        globalDoc.register('tutorial-arrow');
        globalDoc.register('g2-bonus-overlay');
        globalDoc.register('g2-landmark-overlay');
        globalDoc.register('g2-compendium-overlay');
        globalDoc.register('g2-step-popup');

        state.activeGambitId = 2;
        state.tutorialStep = 6;
        state.grid = createGrid();
        state.players = [{ id: 0, name: 'Local', type: 'HUMAN', gold: 0, totalGold: 0 }];

        // Practice row: row 4 cells (some already flipped in steps 1-5)
        const practiceCells = state.grid.filter(cell => cell.r === 4 && [0, 1, 2, 3, 8].includes(cell.c));
        practiceCells.forEach(cell => cell.flipped = true);

        // 1a. Step 6 -> Reveal bonus cards
        state.grid.forEach(cell => {
            if (cell.c >= 2 && cell.c <= 6 && cell.isBonus) {
                cell.flipped = true;
            }
        });

        // 1b. Step 7 -> Reveal landmark cards
        const landmarkCells = state.grid.filter(c => (c.r === 0 && c.c === 0) || (c.r === 1 && c.c === 1));
        landmarkCells.forEach(cell => cell.flipped = true);

        // Verify BOTH bonus cards and landmark cards are open together
        const openShowcaseCardsNonRow4 = state.grid.filter(c => c.r !== 4 && c.flipped);
        assert.ok(openShowcaseCardsNonRow4.length > 5, 'Bonus and Landmark cards must both be open during showcase');

        // 1c. Finish compendium -> move to Step 10 using production resetGambit2MapCards(4)
        resetGambit2MapCards(4);

        // Verify all non-row 4 cards are closed
        const remainingNonRow4Open = state.grid.filter(c => c.r !== 4 && c.flipped);
        assert.equal(remainingNonRow4Open.length, 0, 'All cards outside row 4 must be face-down when Step 10 begins');

        // Verify practice cards in row 4 remained flipped
        const practiceRemaining = state.grid.filter(c => c.r === 4 && c.flipped);
        assert.equal(practiceRemaining.length, 5, 'Practice row 4 cards must remain open for row completion exercise');

        console.log('✓ Test 1 Passed: Both groups shown together, and Step 10 explicitly restores only row 4 practice state.');
    }

    // -------------------------------------------------------------
    // Test 2: Manual Row Completion Advances to Step 11 via Production Logic
    // -------------------------------------------------------------
    {
        console.log('Test 2: Manual completion of row index 4 awards Row Bonus and advances to Step 11 via production functions');
        globalDoc.elements.clear();
        globalDoc.register('tutorial-arrow');
        const overlay = globalDoc.register('g2-row-bonus-overlay');
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                globalDoc.register(`cell-container-${r}-${c}`);
                globalDoc.register(`cell-front-${r}-${c}`);
            }
        }

        state.activeGambitId = 2;
        state.tutorialStep = 10;
        state.grid = createGrid();
        state.mode = 'GAME';
        state.turn = 0;
        state.players = [{ id: 0, name: 'Local', type: 'HUMAN', gold: 10, totalGold: 10 }];

        // Row 4 has columns 0..7 flipped, column 8 unflipped
        state.grid.filter(c => c.r === 4 && c.c !== 8).forEach(c => c.flipped = true);

        let step11Ran = false;
        global.window.app = {
            runTutorialStep: () => {
                if (state.tutorialStep === 11) step11Ran = true;
            },
            resetGambit2MapCards: () => {}
        };

        const lastCell = state.grid.find(c => c.r === 4 && c.c === 8);
        lastCell.flipped = true;

        // Execute real production checkLineBonuses
        let checkCompleted = false;
        await new Promise(resolve => {
            checkLineBonuses(state.players[0], lastCell, () => {
                checkCompleted = true;
                // Execute real production handleGambit2Step10Progress
                const advanced = handleGambit2Step10Progress(state, 'MAP');
                assert.equal(advanced, true, 'handleGambit2Step10Progress must return true on row 4 completion');
                resolve();
            });
        });

        assert.equal(checkCompleted, true, 'checkLineBonuses callback must execute');
        assert.equal(state.players[0].hasRowBonus, true, 'player.hasRowBonus must be set by checkLineBonuses');
        assert.equal(state.players[0].hasLineBonus, true, 'player.hasLineBonus must be set by checkLineBonuses');
        assert.equal(state.players[0].gold, 15, 'player.gold must receive +5 Au line bonus');
        assert.equal(state.tutorialStep, 11, 'Tutorial step must advance to 11 on row 4 completion');
        assert.equal(step11Ran, true, 'runTutorialStep must be called for Step 11');

        console.log('✓ Test 2 Passed: Manual row completion uses real checkLineBonuses & handleGambit2Step10Progress.');
    }

    // -------------------------------------------------------------
    // Test 3: COMPLETE FOR ME Calls Real Production executeGambit2Step10Continue
    // -------------------------------------------------------------
    {
        console.log('Test 3: COMPLETE FOR ME executes production executeGambit2Step10Continue and avoids duplicate awards');
        globalDoc.elements.clear();
        globalDoc.register('tutorial-arrow');
        globalDoc.register('g2-row-bonus-overlay');
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                globalDoc.register(`cell-container-${r}-${c}`);
                globalDoc.register(`cell-front-${r}-${c}`);
            }
        }

        state.activeGambitId = 2;
        state.tutorialStep = 10;
        state.grid = createGrid();
        state.players = [{ id: 0, name: 'Local', type: 'HUMAN', gold: 20, totalGold: 20 }];

        // Row 4 has columns 0..4 flipped, columns 5..8 unflipped
        state.grid.filter(c => c.r === 4 && c.c <= 4).forEach(c => c.flipped = true);

        let step11Ran = false;
        global.window.app = {
            runTutorialStep: () => {
                if (state.tutorialStep === 11) step11Ran = true;
            },
            resetGambit2MapCards: () => {}
        };

        const rowCells = state.grid.filter(cell => cell.r === 4 && !cell.empty);
        const uncompleted = rowCells.filter(c => !c.flipped);
        assert.equal(uncompleted.length, 4, '4 cards missing before autocomplete');

        // Dynamically import executeGambit2Step10Continue from production ui.js
        const { executeGambit2Step10Continue } = await import('../js/ui.js');

        // Verify window.checkLineBonuses is defined in production runtime
        assert.equal(typeof global.window.checkLineBonuses, 'function', 'window.checkLineBonuses must exist in runtime');

        // Call the real production autocomplete function
        executeGambit2Step10Continue();

        // Wait for wave animation to complete
        await new Promise(resolve => setTimeout(resolve, 2600));

        assert.equal(state.players[0].hasRowBonus, true, 'player.hasRowBonus must be set by checkLineBonuses');
        assert.equal(state.players[0].hasLineBonus, true, 'player.hasLineBonus must be set by checkLineBonuses');
        assert.equal(state.players[0].gold, 25, 'player.gold must be 25 Au (+5 Au)');
        assert.equal(state.tutorialStep, 11, 'state.tutorialStep must be 11');
        assert.equal(step11Ran, true, 'runTutorialStep must be called for Step 11');

        // Test calling executeGambit2Step10Continue again when ALREADY complete
        executeGambit2Step10Continue();

        // Gold must remain unchanged at 25
        assert.equal(state.players[0].gold, 25, 'Gold must NOT increase on repeated COMPLETE FOR ME execution');

        console.log('✓ Test 3 Passed: Real executeGambit2Step10Continue shares authoritative checkLineBonuses pipeline without duplication.');
    }

    // -------------------------------------------------------------
    // Test 4: Pre-Render Board Resets for Step 11 and Step 12
    // -------------------------------------------------------------
    {
        console.log('Test 4: Pre-render board resets ensure clean face-down map before Step 11 and Step 12 popups');
        const uiPath = path.resolve(__dirname, '../js/ui.js');
        const uiContent = fs.readFileSync(uiPath, 'utf8');

        // Verify Step 11 resets map before rendering overlay
        const step11BlockMatch = uiContent.match(/if\s*\(state\.tutorialStep\s*===\s*11\)\s*\{([\s\S]*?)overlay\.innerHTML/);
        assert.ok(step11BlockMatch, 'Step 11 popup logic must exist');
        assert.ok(step11BlockMatch[1].includes('resetGambit2MapCards'), 'Step 11 must call resetGambit2MapCards BEFORE rendering overlay');

        // Verify Step 12 resets map before rendering overlay
        const step12BlockMatch = uiContent.match(/if\s*\(state\.tutorialStep\s*===\s*12\)\s*\{([\s\S]*?)overlay\.innerHTML/);
        assert.ok(step12BlockMatch, 'Step 12 popup logic must exist');
        assert.ok(step12BlockMatch[1].includes('resetGambit2MapCards'), 'Step 12 must call resetGambit2MapCards BEFORE rendering overlay');

        // Verify Step 11 continuation resets map before step 12 transition
        const step11ContMatch = uiContent.match(/showNextRowBonus[\s\S]*?index\s*>=\s*rowIndices\.length[\s\S]*?runTutorialStep/);
        assert.ok(step11ContMatch, 'showNextRowBonus completion must exist');
        assert.ok(step11ContMatch[0].includes('resetGambit2MapCards'), 'showNextRowBonus must reset cards when row demo finishes');

        console.log('✓ Test 4 Passed: Map is explicitly reset face-down before Step 11 and Step 12 overlays are displayed.');
    }

    // -------------------------------------------------------------
    // Test 5: Line-Bonus Banner Synchronization & Pacing
    // -------------------------------------------------------------
    {
        console.log('Test 5: Line-bonus banner synchronizes via animationend with fixed 1400ms fallback');
        const uiPath = path.resolve(__dirname, '../js/ui.js');
        const uiContent = fs.readFileSync(uiPath, 'utf8');
        const cssPath = path.resolve(__dirname, '../index.css');
        const cssContent = fs.readFileSync(cssPath, 'utf8');

        // Verify triggerWaveAnimation synchronizes via animationend
        assert.ok(uiContent.includes("staticText.addEventListener('animationend'"), 'triggerWaveAnimation must listen for animationend');

        // Verify fallback is fixed 1400ms (NOT using window.getDelay)
        assert.ok(uiContent.includes('setTimeout(onBannerComplete, 1400);'), 'Fallback timeout must be fixed 1400ms without getDelay scaling');
        assert.ok(!uiContent.includes('const textDuration = (typeof window !== \'undefined\' && window.getDelay) ? window.getDelay(1400) : 1400;'), 'Old getDelay textDuration must be removed');

        // Verify CSS animation duration is 1.4s
        const cssMatch = cssContent.match(/\.animate-line-bonus-banner\s*\{([^}]+)\}/);
        assert.ok(cssMatch, '.animate-line-bonus-banner must exist');
        assert.ok(cssMatch[1].includes('1.4s'), 'CSS duration must be 1.4s');

        // Verify Gambit 2 demo pacing uses 200ms
        assert.ok(uiContent.includes('window.getDelay(200)'), 'Demo rows and columns must use 200ms inter-example delay');

        console.log('✓ Test 5 Passed: Line-bonus banner is precisely synchronized and immune to animation-speed drift.');
    }

    console.log('\n==================================================');
    console.log('ALL GAMBIT 2 & LINE BONUS REGRESSION TESTS PASSED.');
    console.log('==================================================\n');
}

await runGambit2LineBonusRegressionSuite();
