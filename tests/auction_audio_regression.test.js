// tests/auction_audio_regression.test.js
// Regression tests to ensure BGM is never ducked or altered during auctions

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
        },
        classList: {
            add: (...cls) => cls.forEach(c => classList.add(c)),
            remove: (...cls) => cls.forEach(c => classList.delete(c)),
            contains: (c) => classList.has(c),
        },
        children: [],
        innerHTML: '',
        innerText: '',
        scrollTop: 0,
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

async function runAuctionAudioRegressionSuite() {
    console.log('--- Running Auction Audio & BGM Ducking Regression Suite ---');

    // Test 1: Static code inspection of game.js to guarantee duckBGM is not in triggerAuction or auction paths
    {
        console.log('Test 1: Source audit ensures no duckBGM calls in auction flows');
        const gamePath = path.resolve(__dirname, '../js/game.js');
        const gameContent = fs.readFileSync(gamePath, 'utf8');

        // Verify duckBGM is completely absent from game.js
        assert.ok(!gameContent.includes('duckBGM'), 'game.js must not call duckBGM anywhere in auction or gameplay flows');
        console.log('✓ Test 1 Passed: duckBGM is completely removed from all auction code in game.js.');
    }

    // Test 2: Runtime verification that triggerAuction plays alert SFX but NEVER alters music gain/volume or calls duckBGM
    {
        console.log('Test 2: triggerAuction preserves music volume, mute state, and plays alert SFX');
        globalDoc.elements.clear();
        globalDoc.register('board-container');
        globalDoc.register('central-auction-ui', '', ['hidden']);
        globalDoc.register('game-ui');
        globalDoc.register('ui-v2-container');

        const { state } = await import('../js/state.js');
        const { audioMgr } = await import('../js/audio.js');

        // Spy on audioMgr
        let duckBGMCallCount = 0;
        let originalDuckBGM = audioMgr.duckBGM;
        audioMgr.duckBGM = function(active) {
            duckBGMCallCount++;
            if (originalDuckBGM) originalDuckBGM.call(this, active);
        };

        let sfxPlayed = [];
        let originalPlay = audioMgr.play;
        audioMgr.play = function(key) {
            sfxPlayed.push(key);
        };

        audioMgr.musicVolume = 0.8;
        audioMgr.config.music = true;

        state.mode = 'GAME';
        state.turn = 0;
        state.players = [
            { id: 0, name: 'Local', type: 'HUMAN', gold: 50, inventory: [], prestige: 0, cards: 0 }
        ];
        state.auctions = {
            A: { card: { id: 1, name: 'Whitehall Mansion', points: 3, spriteX: 0 }, triggered: false, flipped: false, resolved: false },
            B: { card: { id: 2, name: 'Boca Raton Resort', points: 3, spriteX: 250 }, triggered: false, flipped: false, resolved: false }
        };
        state.activeAuction = null;

        global.window.state = state;
        global.window.audioMgr = audioMgr;
        global.window.app = {
            closeSideAbilityPopup: () => {},
            setupAuctionVisuals: () => {},
            triggerGameOver: () => {},
            updateUI: () => {}
        };

        // Dynamically import game.js triggerAuction
        const { triggerAuction } = await import('../js/game.js');

        // Trigger auction A
        triggerAuction('A');

        assert.equal(state.mode, 'AUCTION', 'Game state mode must be AUCTION');
        assert.equal(duckBGMCallCount, 0, 'audioMgr.duckBGM must NOT be called when an auction triggers');
        assert.equal(audioMgr.musicVolume, 0.8, 'Music volume must remain at exact pre-auction level');
        assert.equal(audioMgr.config.music, true, 'Music enabled state must remain unchanged');
        assert.ok(sfxPlayed.includes('auction_alert'), 'SFX auction_alert must still be played');

        console.log('✓ Test 2 Passed: Auction triggers without ducking BGM while preserving volume, mute state, and playing SFX.');
    }

    console.log('\n==================================================');
    console.log('ALL AUCTION AUDIO REGRESSION TESTS PASSED.');
    console.log('==================================================\n');
}

await runAuctionAudioRegressionSuite();
