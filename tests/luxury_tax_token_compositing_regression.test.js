// tests/luxury_tax_token_compositing_regression.test.js
// Regression test suite for Ms. Post's Luxury tax token compositing, DOM structure, and layer hierarchy

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
            backgroundImage: '',
            backgroundSize: '',
            backgroundPosition: '',
            animationDelay: '',
        },
        classList: {
            add: (...cls) => cls.forEach(c => classList.add(c)),
            remove: (...cls) => cls.forEach(c => classList.delete(c)),
            contains: (c) => classList.has(c),
            toggle: (c) => classList.has(c) ? classList.delete(c) : classList.add(c),
        },
        get className() {
            return Array.from(classList).join(' ');
        },
        set className(val) {
            classList.clear();
            if (val) {
                val.split(/\s+/).filter(Boolean).forEach(c => classList.add(c));
            }
        },
        children: [],
        innerHTML: '',
        innerText: '',
        parentNode: null,
        appendChild: function(child) {
            child.parentNode = this;
            this.children.push(child);
        },
        removeChild: function(child) {
            const idx = this.children.indexOf(child);
            if (idx >= 0) {
                this.children.splice(idx, 1);
                child.parentNode = null;
            }
        },
        remove: function() {
            if (this.parentNode) {
                this.parentNode.removeChild(this);
            }
        },
        querySelector: function(sel) {
            if (sel === '.luxury-tax-token') {
                return this.children.find(c => c.classList?.contains('luxury-tax-token')) || null;
            }
            if (sel === '.deck-lock-overlay') {
                return this.children.find(c => c.classList?.contains('deck-lock-overlay')) || null;
            }
            return null;
        },
        querySelectorAll: function(sel) {
            if (sel === '.luxury-tax-token') {
                return this.children.filter(c => c.classList?.contains('luxury-tax-token'));
            }
            return [];
        },
        focus: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 250, height: 250 }),
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

// Global browser polyfill
const globalDoc = new MockDocument();
global.document = globalDoc;
global.window = {
    document: globalDoc,
    GameConfig: { isFullGame: true },
    process: { versions: {} },
    getDelay: (ms) => ms
};

async function runLuxuryTaxCompositingRegressionSuite() {
    console.log('--- Running Luxury Tax Token Compositing & Hierarchy Regression Suite ---');

    // -------------------------------------------------------------
    // Test 1: Verify index.html contains deck-slot-* wrappers enclosing deck-*
    // -------------------------------------------------------------
    {
        console.log('Test 1: Verify index.html structure has stable #deck-slot-* containers');
        const indexPath = path.resolve(__dirname, '../index.html');
        const html = fs.readFileSync(indexPath, 'utf8');

        for (let i = 0; i < 3; i++) {
            assert.ok(
                html.includes(`id="deck-slot-${i}"`),
                `index.html must contain #deck-slot-${i} for deck index ${i}`
            );
            assert.ok(
                html.includes(`id="deck-${i}"`),
                `index.html must contain #deck-${i}`
            );
        }

        console.log('✓ Test 1 Passed: index.html contains stable #deck-slot-0/1/2 positioning wrappers.');
    }

    // -------------------------------------------------------------
    // Test 2: updateUI mounts .luxury-tax-token in #deck-slot-*, NOT inside #deck-*
    // -------------------------------------------------------------
    {
        console.log('Test 2: updateUI mounts .luxury-tax-token into stable deck-slot sibling container, escaping deck transform');
        const { state } = await import('../js/state.js');
        const { updateUI } = await import('../js/ui.js');

        globalDoc.reset();
        for (let i = 0; i < 3; i++) {
            const container = globalDoc.register(`deck-container-${i}`, '', ['flex', 'flex-col']);
            const slot = globalDoc.register(`deck-slot-${i}`, '', ['relative', 'w-[250px]', 'h-[250px]']);
            const deck = globalDoc.register(`deck-${i}`, '', ['relative', 'w-[250px]', 'h-[250px]']);
            const count = globalDoc.register(`deck-count-${i}`, '', []);
            
            container.appendChild(slot);
            slot.appendChild(deck);
            deck.appendChild(count);
        }

        state.players = [
            { id: 0, name: 'Ms Post', type: 'HUMAN', character: { name: 'MS. POST' }, gold: 50, totalGold: 50, counters: 2, inventory: [] }
        ];
        state.turn = 0;
        state.mode = 'GAME';
        state.activeGambitId = null;
        state.config = {};
        state.luxuryTaxCounters = [1, 2, 0]; // Deck 0 has 1 tax (+2 Au), Deck 1 has 2 tax (+4 Au), Deck 2 has 0 tax
        state.luxuryDecks = [
            { id: 0, cost: 5, cards: [{ id: 101, spriteIndex: 0 }] },
            { id: 1, cost: 10, cards: [{ id: 102, spriteIndex: 1 }] },
            { id: 2, cost: 15, cards: [{ id: 103, spriteIndex: 2 }] },
        ];

        global.window.state = state;
        updateUI();

        // Check Deck 0
        const slot0 = globalDoc.getElementById('deck-slot-0');
        const deck0 = globalDoc.getElementById('deck-0');
        const token0 = slot0.querySelector('.luxury-tax-token');
        assert.ok(token0, 'Deck 0 must have a tax token in #deck-slot-0');
        assert.equal(token0.innerText, '+2 Au', 'Deck 0 with 1 counter must display +2 Au');
        assert.equal(deck0.querySelector('.luxury-tax-token'), null, 'Deck 0 (#deck-0) must NOT contain the tax token inside its wiggling body');
        assert.ok(token0.classList.contains('z-50'), 'Tax token must have z-50 for guaranteed top stacking');
        assert.ok(token0.classList.contains('pointer-events-none'), 'Tax token should have pointer-events-none');

        // Check Deck 1
        const slot1 = globalDoc.getElementById('deck-slot-1');
        const deck1 = globalDoc.getElementById('deck-1');
        const token1 = slot1.querySelector('.luxury-tax-token');
        assert.ok(token1, 'Deck 1 must have a tax token in #deck-slot-1');
        assert.equal(token1.innerText, '+4 Au', 'Deck 1 with 2 counters must display +4 Au');
        assert.equal(deck1.querySelector('.luxury-tax-token'), null, 'Deck 1 (#deck-1) must NOT contain the tax token inside its wiggling body');

        // Check Deck 2 (0 tax)
        const slot2 = globalDoc.getElementById('deck-slot-2');
        const deck2 = globalDoc.getElementById('deck-2');
        assert.equal(slot2.querySelector('.luxury-tax-token'), null, 'Deck 2 with 0 tax must have no tax token');
        assert.equal(deck2.querySelector('.luxury-tax-token'), null, 'Deck 2 must have no tax token in #deck-2');

        console.log('✓ Test 2 Passed: Tax tokens are rendered in #deck-slot-* siblings with z-50 and correct amounts.');
    }

    // -------------------------------------------------------------
    // Test 3: Tax token resets and buy/empty cleanup
    // -------------------------------------------------------------
    {
        console.log('Test 3: Resetting tax counters or buying out a luxury pile cleanly removes the tax token');
        const { state } = await import('../js/state.js');
        const { updateUI } = await import('../js/ui.js');

        // Reset tax on Deck 0 to 0
        state.luxuryTaxCounters[0] = 0;
        updateUI();

        const slot0 = globalDoc.getElementById('deck-slot-0');
        assert.equal(slot0.querySelector('.luxury-tax-token'), null, 'Deck 0 tax token must be removed when tax count is 0');

        // Empty Deck 1 (cards = [])
        state.luxuryDecks[1].cards = [];
        updateUI();

        const slot1 = globalDoc.getElementById('deck-slot-1');
        assert.equal(slot1.querySelector('.luxury-tax-token'), null, 'Deck 1 tax token must be removed when cards are exhausted');

        console.log('✓ Test 3 Passed: Stale and exhausted tax tokens are thoroughly cleaned up without orphan elements.');
    }

    console.log('\n================================================================');
    console.log('ALL LUXURY TAX TOKEN COMPOSITING REGRESSION TESTS PASSED.');
    console.log('================================================================\n');
}

await runLuxuryTaxCompositingRegressionSuite();
