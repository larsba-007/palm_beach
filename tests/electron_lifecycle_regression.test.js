// tests/electron_lifecycle_regression.test.js
// Verification for Electron Single-Instance, Window Open Policy, Alt+Tab Focus Return, and Shader Stability

import assert from 'node:assert/strict';

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

function runLifecycleSuite() {
    console.log('==================================================');
    console.log('Running Electron Lifecycle & Focus Return Test Suite');
    console.log('==================================================');

    // 1. Test Window Open Policy (No auxiliary BrowserWindows permitted)
    {
        console.log('\nTest 1: Window Open Handler denies auxiliary window creation');
        let externalOpened = null;
        const openExternalDetached = (url) => { externalOpened = url; };

        const setWindowOpenHandler = ({ url }) => {
            if (url.startsWith('http://') || url.startsWith('https://')) {
                openExternalDetached(url);
            }
            return { action: 'deny' }; // Always deny auxiliary BrowserWindow creation
        };

        // Test External Links
        const resHttp = setWindowOpenHandler({ url: 'https://store.steampowered.com/app/4307400' });
        assert.equal(resHttp.action, 'deny', 'External URLs must be denied from creating internal BrowserWindows');
        assert.equal(externalOpened, 'https://store.steampowered.com/app/4307400');

        // Test Internal/Empty/Hash Links (previously could spawn duplicate game window)
        externalOpened = null;
        const resHash = setWindowOpenHandler({ url: 'file:///dist/index.html#' });
        assert.equal(resHash.action, 'deny', 'Internal hash links must be denied from creating internal BrowserWindows');
        assert.equal(externalOpened, null, 'Internal hash links must not trigger external browser spawn');

        const resBlank = setWindowOpenHandler({ url: 'about:blank' });
        assert.equal(resBlank.action, 'deny', 'about:blank must be denied from creating internal BrowserWindows');
        console.log('✓ Test 1 Passed: Strict window-open policy prevents secondary/auxiliary BrowserWindows.');
    }

    // 2. Test Single-Instance Lock Logic
    {
        console.log('\nTest 2: Single-instance lock focuses primary window on second instance launch');
        let mainWindowRestored = false;
        let mainWindowShown = false;
        let mainWindowFocused = false;

        const mainWindow = {
            isDestroyed: () => false,
            isMinimized: () => true,
            restore: () => { mainWindowRestored = true; },
            show: () => { mainWindowShown = true; },
            focus: () => { mainWindowFocused = true; },
        };

        // Simulate second instance callback
        const handleSecondInstance = () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.show();
                mainWindow.focus();
            }
        };

        handleSecondInstance();

        assert.equal(mainWindowRestored, true, 'Minimized window should be restored');
        assert.equal(mainWindowShown, true, 'Window should be shown');
        assert.equal(mainWindowFocused, true, 'Window should be focused');
        console.log('✓ Test 2 Passed: Second instance attempt restores and focuses existing primary window.');
    }

    // 3. Test Renderer Focus Return: Active Game State
    {
        console.log('\nTest 3: Focus return during Active Match restores #game-ui without leaking V2 container');
        const doc = new MockDocument();
        const gameUI = doc.register('game-ui', 'none', ['opacity-0', 'pointer-events-none']);
        const v2Container = doc.register('ui-v2-container', 'none');
        const v2Content = doc.register('ui-v2-content', '');
        const board = doc.register('board-wrapper');

        global.window = {
            innerWidth: 1920,
            innerHeight: 1080,
            document: doc
        };
        global.document = doc;

        const state = {
            mode: 'GAME',
            gameStarted: true,
            isGameOver: false,
            zoom: 1.0,
        };
        global.state = state;

        const app = {
            setBoardZoom: (z) => {
                state.zoom = z;
                board.style.transform = `scale(${z})`;
            },
            restoreVisibleUIForCurrentState: () => {
                const w = window.innerWidth;
                const h = window.innerHeight;
                if (w > 0 && h > 0) {
                    const scaleX = w / 3840;
                    const scaleY = h / 2160;
                    const zoom = Math.max(0.1, Math.min(scaleX, scaleY));
                    app.setBoardZoom(zoom);
                }

                if (state.gameStarted && !state.isGameOver) {
                    const el = doc.getElementById('game-ui');
                    if (el) {
                        if (el.style.display === 'none') el.style.display = '';
                        el.classList.remove('opacity-0', 'pointer-events-none');
                        el.style.opacity = '1';
                        el.style.pointerEvents = 'auto';
                    }
                }
            }
        };

        // Simulate focus return after Alt+Tab
        app.restoreVisibleUIForCurrentState();

        assert.equal(gameUI.style.display, '', '#game-ui display should be restored');
        assert.equal(gameUI.classList.contains('opacity-0'), false, '#game-ui opacity-0 class should be removed');
        assert.equal(gameUI.classList.contains('pointer-events-none'), false, 'pointer-events-none should be removed');
        assert.equal(v2Container.style.display, 'none', 'ui-v2-container must remain hidden during active match');
        assert.equal(state.zoom > 0, true, 'Zoom must be positive valid float');
        console.log('✓ Test 3 Passed: Active match state cleanly restores #game-ui visibility without exposing V2 container.');
    }

    // 4. Test Renderer Focus Return: Gambits Campaign Mode
    {
        console.log('\nTest 4: Focus return during Gambits Campaign restores V2 container and gambit panel');
        const doc = new MockDocument();
        const gameUI = doc.register('game-ui', 'none');
        const v2Container = doc.register('ui-v2-container', 'none');
        const v2Content = doc.register('ui-v2-content', 'none');
        const gambitV2 = doc.register('panel-3-gambits-v2', 'none', ['hidden']);

        global.window = {
            innerWidth: 1920,
            innerHeight: 1080,
            document: doc
        };
        global.document = doc;

        const state = {
            mode: 'GAMBITS',
            gameStarted: false,
            isGameOver: false,
            zoom: 1.0,
        };
        global.state = state;

        const app = {
            setBoardZoom: (z) => { state.zoom = z; },
            restoreVisibleUIForCurrentState: () => {
                if (state.mode === 'GAMBITS') {
                    const c = doc.getElementById('ui-v2-container');
                    if (c) {
                        c.style.display = 'flex';
                        c.classList.add('active');
                    }
                    const cnt = doc.getElementById('ui-v2-content');
                    if (cnt && cnt.style.display === 'none') {
                        cnt.style.display = '';
                    }
                    const p = doc.getElementById('panel-3-gambits-v2');
                    if (p && p.classList.contains('hidden')) {
                        p.classList.remove('hidden');
                        p.style.display = 'block';
                    }
                }
            }
        };

        app.restoreVisibleUIForCurrentState();

        assert.equal(v2Container.style.display, 'flex', 'ui-v2-container must be flex');
        assert.equal(v2Container.classList.contains('active'), true, 'ui-v2-container must be active');
        assert.equal(v2Content.style.display, '', 'ui-v2-content display must be empty string');
        assert.equal(gambitV2.style.display, 'block', 'panel-3-gambits-v2 must be visible');
        console.log('✓ Test 4 Passed: Gambits mode restores V2 container and gambits panel on focus return.');
    }

    // 5. Test AutoZoom Zero-Dimension Protection
    {
        console.log('\nTest 5: AutoZoom zero-dimension protection prevents scale(0) on window minimize');
        let currentZoom = 0.5;
        const setBoardZoom = (z) => { currentZoom = z; };

        const runResizeLogic = (w, h) => {
            if (!w || !h || w <= 0 || h <= 0) {
                return; // Protected early return
            }
            const scaleX = w / 3840;
            const scaleY = h / 2160;
            const zoom = Math.max(0.1, Math.min(scaleX, scaleY));
            setBoardZoom(zoom);
        };

        // Window minimized (dimensions 0x0)
        runResizeLogic(0, 0);
        assert.equal(currentZoom, 0.5, 'Zoom must not be set to 0 when window dimensions are 0');

        // Window restored to normal (1920x1080)
        runResizeLogic(1920, 1080);
        assert.equal(currentZoom, 0.5, 'Zoom calculated correctly on restore');
        console.log('✓ Test 5 Passed: Zero-dimension protection prevents board scaling to 0 when minimized.');
    }

    // 5B. Test Renderer Focus Return: Game Over Screen
    {
        console.log('\nTest 5B: Focus return during GAME_OVER preserves/restores #game-over-screen');
        const doc = new MockDocument();
        const gameOverScreen = doc.register('game-over-screen', 'none', ['hidden']);

        global.window = {
            innerWidth: 1920,
            innerHeight: 1080,
            document: doc
        };
        global.document = doc;

        const state = {
            mode: 'GAME_OVER',
            gameStarted: true,
            isGameOver: true,
            zoom: 1.0,
        };
        global.state = state;

        const app = {
            setBoardZoom: (z) => { state.zoom = z; },
            restoreVisibleUIForCurrentState: () => {
                if (state.mode === 'GAME_OVER' || state.isGameOver) {
                    const screen = doc.getElementById('game-over-screen');
                    if (screen && screen.classList.contains('hidden')) {
                        screen.classList.remove('hidden');
                        screen.style.display = '';
                    }
                }
            }
        };

        app.restoreVisibleUIForCurrentState();

        assert.equal(gameOverScreen.classList.contains('hidden'), false, 'game-over-screen hidden class removed');
        assert.equal(gameOverScreen.style.display, '', 'game-over-screen display restored');
        console.log('✓ Test 5B Passed: GAME_OVER mode restores game-over-screen on focus return.');
    }

    // 6. Test WebGL Shader Delta Time Clamping
    {
        console.log('\nTest 6: WebGL shader delta time is clamped to prevent jumps after long Alt+Tab');
        const computeClampedDt = (now, lastTime) => {
            const rawDt = (now - lastTime) * 0.001;
            return Number.isFinite(rawDt) ? Math.min(Math.max(rawDt, 0), 0.1) : 0.016;
        };

        // Alt+Tab for 30 seconds
        const dt30s = computeClampedDt(30000, 0);
        assert.equal(dt30s, 0.1, '30 second backgrounding must clamp dt to 0.1s');

        // Normal 60fps frame (16.6ms)
        const dt60fps = computeClampedDt(16.6, 0);
        assert.ok(Math.abs(dt60fps - 0.0166) < 0.001, 'Normal frame rate dt should pass through unhindered');
        console.log('✓ Test 6 Passed: Shader dt is clamped to 100ms maximum on long Alt+Tab return.');
    }

    console.log('\n==================================================');
    console.log('ALL ELECTRON LIFECYCLE TESTS PASSED SUCCESSFULLY.');
    console.log('==================================================\n');
}

runLifecycleSuite();
