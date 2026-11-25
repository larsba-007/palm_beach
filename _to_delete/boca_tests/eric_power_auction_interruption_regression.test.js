// tests/eric_power_auction_interruption_regression.test.js
// Regression test suite for Eric's Waterfront power and Auction interruption mechanics

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup minimal mock DOM & browser environment
function createMockElement(id, initialDisplay = '', initialClasses = []) {
    const classList = new Set(initialClasses);
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
        addEventListener: () => {},
        removeEventListener: () => {},
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100 }),
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
        this.reset();
    }

    reset() {
        this.elements.clear();
        const standardIds = [
            'reroll-controls', 'turn-instruction', 'player-name-display', 'dice-modal',
            'side-ability-popup', 'board-container', 'game-ui', 'central-auction-ui',
            'auction-title', 'auction-item-title', 'auction-item-desc', 'auction-lore-text',
            'auction-highest-bid', 'auction-current-bidder', 'auction-turn-timer',
            'auction-turn-text', 'auction-pass-btn', 'auction-bid-btn', 'auction-bid-amount-display'
        ];
        standardIds.forEach(id => this.register(id));
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

async function runEricPowerRegressionSuite() {
    console.log('--- Running Eric Power & Auction Interruption Regression Suite ---');

    // -------------------------------------------------------------
    // Test 1: Authoritative Ability & Tutorial Text
    // -------------------------------------------------------------
    {
        console.log("Test 1: Verify Eric's authoritative ability text in characters.js and tutorial.js");
        const { CHARACTERS } = await import('../js/characters.js');
        const eric = CHARACTERS.find(c => c.name === 'ERIC');

        assert.ok(eric, 'Eric must exist in CHARACTERS');
        assert.equal(
            eric.ability,
            "On your turn, flip up to 3 Waterfront Cards and receive 8 Au (counts as your turn action). If a flip triggers an Auction, your power ends immediately and any remaining flips are lost."
        );

        const tutorialPath = path.resolve(__dirname, '../js/tutorial.js');
        const tutorialContent = fs.readFileSync(tutorialPath, 'utf8');
        assert.ok(
            tutorialContent.includes("Eric can flip up to 3 Waterfront Cards in one turn. If one of those flips triggers an Auction, his power ends and any remaining flips are lost."),
            'Waterfront tutorial must explain the auction-interruption rule'
        );

        console.log("✓ Test 1 Passed: Eric's ability and tutorial wording accurately communicate the Auction-interruption rule.");
    }

    // -------------------------------------------------------------
    // Test 2: Runtime Auction Interruption Cancels Remaining Flips
    // -------------------------------------------------------------
    {
        console.log('Test 2: Triggering an Auction during Eric power immediately cancels remaining flips and awards 8 Au');
        
        const { state } = await import('../js/state.js');
        const { handleFlip } = await import('../js/game.js');

        // Create 8x9 grid
        const grid = [];
        globalDoc.reset();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                globalDoc.register(`cell-container-${r}-${c}`);
                globalDoc.register(`cell-front-${r}-${c}`);
                let type = 'BLOCK';
                if (c === 0) type = 'LAGOON';
                else if (c === 1) type = 'WF_L';
                else if (c === 7) type = 'WF_R';
                else if (c === 8) type = 'ATLANTIC';
                grid.push({
                    id: `${r}-${c}`,
                    r,
                    c,
                    type,
                    empty: false,
                    flipped: (c === 1 && r < 7) // In column 1, rows 0..6 are flipped, row 7 is last card!
                });
            }
        }

        let auctionTriggeredId = null;
        global.window.triggerAuction = (id) => { auctionTriggeredId = id; };
        global.window.updateUI = () => {};
        global.window.audioMgr = { play: () => {} };

        state.grid = grid;
        state.mode = 'GAME';
        state.settings = { animationSpeed: 1 };
        state.turn = 0;
        state.isProcessing = false;
        state.abilityActive = true;
        state.ericMode = { remaining: 3 };
        state.auctions = {
            A: { triggered: false, flipped: false, card: { name: 'Spanish River Land Company', points: 2, image: '' } },
            B: { triggered: false, flipped: false, card: { name: 'Gulf Stream Golf Club', points: 3, image: '' } }
        };
        global.window.state = state;
        state.players = [
            { id: 0, name: 'Eric Player', type: 'HUMAN', character: { name: 'ERIC' }, gold: 10, totalGold: 10, counters: 0 },
            // inventory/prestige/cards: the bot takes a real turn after Eric's power ends (a timer in game.js), and a luxury
            // purchase pushes onto player.inventory. Without these fields the timer threw a TypeError in about half of the runs.
            { id: 1, name: 'Bot 1', type: 'BOT', gold: 10, totalGold: 10, inventory: [], prestige: 0, cards: 0 }
        ];

        // Eric flips the last Waterfront card in column 1 (r=7, c=1), which triggers the top Waterfront Lagoon Auction (id=1)
        const lastWaterfrontCell = grid.find(c => c.r === 7 && c.c === 1);
        handleFlip(lastWaterfrontCell);

        // Wait for wave animation and auction trigger timeout to complete
        await new Promise(resolve => setTimeout(resolve, 3200));

        // Verification
        assert.equal(lastWaterfrontCell.flipped, true, 'Target cell must be flipped');
        assert.equal(state.ericMode, null, 'state.ericMode must be set to null immediately when an auction triggers');
        assert.equal(state.abilityActive, false, 'state.abilityActive must be set to false');
        assert.equal(state.players[0].gold, 23, 'Eric must receive +8 Au for power and +5 Au for column line bonus (10 + 8 + 5 = 23)');
        assert.equal(state.mode, 'AUCTION', 'state.mode must transition to AUCTION');
        assert.equal(state.auctions.A.triggered, true, 'Auction A must be triggered');

        console.log('✓ Test 2 Passed: Auction interruption clears ericMode, awards 8 Au, and triggers the property auction.');
    }

    // -------------------------------------------------------------
    // Test 3: Normal 3-Flip Completion Without Auction
    // -------------------------------------------------------------
    {
        console.log('Test 3: Completing 3 Waterfront flips without an auction decrements cleanly and ends power');

        const { state } = await import('../js/state.js');
        const { handleFlip } = await import('../js/game.js');

        // Create 8x9 grid where column 7 (WF_R) has all cards unflipped
        const grid = [];
        globalDoc.reset();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 9; c++) {
                globalDoc.register(`cell-container-${r}-${c}`);
                globalDoc.register(`cell-front-${r}-${c}`);
                let type = 'BLOCK';
                if (c === 0) type = 'LAGOON';
                else if (c === 1) type = 'WF_L';
                else if (c === 7) type = 'WF_R';
                else if (c === 8) type = 'ATLANTIC';
                grid.push({
                    id: `${r}-${c}`,
                    r,
                    c,
                    type,
                    empty: false,
                    flipped: false
                });
            }
        }

        let nextTurnCalls = 0;
        global.window.nextTurn = () => { nextTurnCalls++; };
        global.window.updateUI = () => {};
        global.window.audioMgr = { play: () => {} };
        global.window.app = { triggerGameOver: () => {}, updateUI: () => {} };

        state.grid = grid;
        state.mode = 'GAME';
        state.settings = { animationSpeed: 1 };
        state.turn = 0;
        state.isProcessing = false;
        state.abilityActive = true;
        state.ericMode = { remaining: 3 };
        state.luxuryDecks = [{ cards: [{ id: 1 }] }];
        state.auctions = {
            A: { triggered: false, flipped: false, card: { name: 'Spanish River Land Company', points: 2, image: '' } },
            B: { triggered: false, flipped: false, card: { name: 'Gulf Stream Golf Club', points: 3, image: '' } }
        };
        global.window.state = state;
        state.players = [
            { id: 0, name: 'Eric Player', type: 'HUMAN', character: { name: 'ERIC' }, gold: 20, totalGold: 20, counters: 0 },
            // inventory/prestige/cards: the bot takes a real turn after Eric's power ends (a timer in game.js), and a luxury
            // purchase pushes onto player.inventory. Without these fields the timer threw a TypeError in about half of the runs.
            { id: 1, name: 'Bot 1', type: 'BOT', gold: 10, totalGold: 10, inventory: [], prestige: 0, cards: 0 }
        ];

        // Flip 1
        const cell1 = grid.find(c => c.r === 0 && c.c === 7);
        handleFlip(cell1);
        assert.equal(cell1.flipped, true);
        assert.ok(state.ericMode !== null && state.ericMode.remaining === 2, 'Remaining flips should be 2 after flip 1');
        assert.equal(state.players[0].gold, 20, 'Gold not yet granted until power completes');

        // Flip 2
        state.isProcessing = false;
        const cell2 = grid.find(c => c.r === 1 && c.c === 7);
        handleFlip(cell2);
        assert.equal(cell2.flipped, true);
        assert.ok(state.ericMode !== null && state.ericMode.remaining === 1, 'Remaining flips should be 1 after flip 2');
        assert.equal(state.players[0].gold, 20, 'Gold not yet granted until power completes');

        // Flip 3 (final)
        state.isProcessing = false;
        const cell3 = grid.find(c => c.r === 2 && c.c === 7);
        handleFlip(cell3);
        assert.equal(cell3.flipped, true);
        assert.equal(state.ericMode, null, 'state.ericMode must be null after 3 flips');
        assert.equal(state.abilityActive, false, 'state.abilityActive must be false');
        assert.equal(state.players[0].gold, 28, 'Eric must receive +8 Au on 3rd flip completion');
        assert.equal(state.turn, 1, 'Turn must advance to player 1 (next player) after Eric power completes');

        console.log('✓ Test 3 Passed: 3-flip completion cleanly uses all 3 charges, awards 8 Au, and passes turn.');
    }

    console.log('\n==================================================');
    console.log('ALL ERIC POWER & AUCTION REGRESSION TESTS PASSED.');
    console.log('==================================================\n');
}

await runEricPowerRegressionSuite();
