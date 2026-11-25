// tests/web_edition.test.js
// Regression test for the edition flags (Steam Full, Steam Demo, Web Party Edition)
// and the Web build plumbing. Steam editions must behave exactly as before.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

// config.js reads window/navigator at import time, so mock a plain browser BEFORE importing it
global.window = { process: { versions: {} } };

// Minimal in-memory localStorage (SaveManager uses the bare global)
const store = new Map();
global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); }
};

const { resolveEdition, GameConfig } = await import('../js/config.js');
const { getSaveKey, SaveManager } = await import('../js/SaveManager.js');
const { WEB_PARTY, clampWebPlayers, applyWebPartyConfig, defaultPartyName, isSteamDefaultName,
    nextWebTutorialStep, webTutorialPrimaryLabel, pickTutorialName, isTutorialPopupId,
    webBoardOffsetY, isTextEntryElement, webSizeHint, WEB_SIZE_HINT_TEXT, usesTapToPreview } = await import('../js/web_party.js');
const { GAMBIT_CAMPAIGN } = await import('../js/gambit_data.js');
const { SUPPORT_US, isSafeSupportUrl, buildSupportUrl, getVisibleSupportOffers } = await import('../js/support_links.js');
const { CHARACTERS } = await import('../js/characters.js');
const { UnlockManager } = await import('../js/UnlockManager.js');
const { getRandomDraftPool, getPick2CandidatePool, drawPick2Candidates, resolvePick2Selection, isPick2BlockedInDemo } = await import('../js/draft_logic.js');

// The three edition configs the UnlockManager sees at runtime (window.GameConfig)
const EDITION_CONFIGS = {
    full: { isFullGame: true, isDemo: false, isWeb: false },
    demo: { isFullGame: false, isDemo: true, isWeb: false },
    web: { isFullGame: false, isDemo: false, isWeb: true }
};
const withEdition = (name, fn) => {
    const prev = { config: global.window.GameConfig, state: global.window.state };
    global.window.GameConfig = EDITION_CONFIGS[name];
    global.window.state = { activeGambitId: null };
    try { return fn(); } finally { global.window.GameConfig = prev.config; global.window.state = prev.state; }
};
const DEMO_CHARACTERS = ['BRIGHT SHELL', 'CARINA', 'MR. FLAGLER', 'ROXANA', 'SKIP'];   // Palm Beach version 1 (Lars, 25 Nov 2026)

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

console.log('Running Web Edition regression tests...\n');

// Test 1: Steam Demo is still the default when no edition is set
{
    const e = resolveEdition(undefined);
    assert.deepEqual(e, { isFullGame: false, isWeb: false, isDemo: true });
    console.log('✓ Test 1 Passed: unset edition is Steam Demo (unchanged default).');
}

// Test 2: Steam Full is unchanged
{
    const e = resolveEdition('full');
    assert.deepEqual(e, { isFullGame: true, isWeb: false, isDemo: false });
    console.log('✓ Test 2 Passed: edition "full" is Steam Full (unchanged).');
}

// Test 3: Web edition is its own edition: not Demo, not Full
{
    const e = resolveEdition('web');
    assert.deepEqual(e, { isFullGame: false, isWeb: true, isDemo: false });
    console.log('✓ Test 3 Passed: edition "web" is Web only (isFullGame false so Demo restrictions are inherited).');
}

// Test 4: Unknown edition strings fall back to the safe Demo mode, and exactly one flag is ever true
{
    for (const value of [undefined, '', 'demo', 'full', 'web', 'WEB', 'steam', null]) {
        const e = resolveEdition(value);
        const trueFlags = Object.values(e).filter(Boolean).length;
        assert.equal(trueFlags, 1, `exactly one edition flag must be true for "${value}"`);
    }
    assert.equal(resolveEdition('WEB').isDemo, true, 'unknown spelling must fall back to Demo, not Web');
    console.log('✓ Test 4 Passed: exactly one edition flag is true; unknown values fall back to Demo.');
}

// Test 5: The shipped GameConfig has the new flag and is not Electron in this environment
{
    assert.equal(typeof GameConfig.isWeb, 'boolean');
    assert.equal(GameConfig.isElectron, false);
    assert.equal([GameConfig.isFullGame, GameConfig.isDemo, GameConfig.isWeb].filter(Boolean).length, 1);
    console.log('✓ Test 5 Passed: GameConfig exposes isWeb and exactly one edition is active.');
}

// Test 6: Web build plumbing is separate from Steam builds
{
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['dev:web'], 'vite --mode web');
    assert.equal(pkg.scripts['build:web'], 'vite build --mode web --outDir dist-web');
    assert.equal(pkg.scripts['preview:web'], 'vite preview --outDir dist-web');

    // Steam scripts must keep their exact commands
    assert.equal(pkg.scripts['build'], 'vite build');
    assert.equal(pkg.scripts['dev:full'], 'vite --mode full');
    assert.equal(pkg.scripts['build:full:win'], 'vite build --mode full && electron-builder --win --x64 -c.directories.output=dist/full-game');
    assert.equal(pkg.scripts['build:demo:win'], 'vite build && electron-builder --win --x64 -c.directories.output=dist/demo-game');

    // The Web build must never write into dist/ (Electron loads dist/)
    assert.ok(!pkg.scripts['build:web'].includes('dist/'), 'web build must not write into dist/');

    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split(/\r?\n/);
    assert.ok(gitignore.includes('dist-web'), 'dist-web must be git-ignored');
    console.log('✓ Test 6 Passed: web scripts write to dist-web; Steam scripts unchanged.');
}

// Test 7: .env.web contains only the edition flag (no secrets)
{
    const env = fs.readFileSync(path.join(root, '.env.web'), 'utf8').split(/\r?\n/).filter(l => l.trim() !== '');
    assert.deepEqual(env, ['VITE_GAME_EDITION=web']);
    console.log('✓ Test 7 Passed: .env.web holds only VITE_GAME_EDITION=web.');
}

// Test 8: Web has its own save slot; Steam/Demo/browser Demo keep the original key
{
    assert.equal(getSaveKey(true), 'palmBeachWebSave');
    assert.equal(getSaveKey(false), 'palmBeachSaveGame');
    console.log('✓ Test 8 Passed: Web save key is separate; every other edition keeps "palmBeachSaveGame".');
}

// Test 9: Existing (non-web) save/load round trip still uses the original key, and wipe still clears everything
{
    store.clear();
    store.set('unrelated-key', 'x');
    await SaveManager.saveData({ progression: { highestGambitCompleted: 3 } });
    assert.ok(store.has('palmBeachSaveGame'), 'non-web save must be written to palmBeachSaveGame');
    assert.ok(!store.has('palmBeachWebSave'), 'non-web build must not touch the web save slot');
    const loaded = await SaveManager.loadData();
    assert.equal(loaded.progression.highestGambitCompleted, 3);
    assert.equal(loaded.audio.musicVolume, 0.8, 'defaults are still merged in');

    let reloaded = false;
    global.window.location = { reload: () => { reloaded = true; } };
    await SaveManager.hardWipeSaveData();
    assert.equal(store.size, 0, 'non-web hard wipe still clears localStorage completely');
    assert.ok(reloaded);
    console.log('✓ Test 9 Passed: Steam/Demo-style save, load and hard wipe behave exactly as before.');
}

// Test 10: Web wipe only removes this game's own keys (static check, the web branch cannot run in Node)
{
    const src = read('js/SaveManager.js');
    assert.match(src, /if \(GameConfig\.isWeb\) \{[\s\S]*?localStorage\.removeItem\(SAVE_KEY\);[\s\S]*?\} else \{\s*localStorage\.clear\(\);\s*\}/);
    console.log('✓ Test 10 Passed: Web hard wipe removes only its own keys; other editions still clear() everything.');
}

// Test 11: Steam-only elements are tagged and the hide rule only applies on the Web edition
{
    const html = read('index.html');
    assert.match(html, /class="[^"]*\bsteam-only\b[^"]*"\s+onclick="app\.quitToDesktop\(\)"/, 'QUIT button');
    assert.match(html, /onclick="app\.openDiscordOverlay\(\)"\s+class="[^"]*\bsteam-only\b/, 'Discord button');
    assert.match(html, /class="[^"]*\bsteam-only\b[^"]*"\s+onclick="app\.toggleSettings\(\); app\.showLocalNamePopup\(\)"/, 'Change Local Name');
    assert.match(html, /class="[^"]*\bsteam-only\b[^"]*"\s+onclick="app\.openBugReport\(\); app\.toggleSettings\(\)"/, 'Report Bug');

    const css = read('index.css');
    assert.match(css, /\.edition-web \.steam-only\s*\{\s*display:\s*none\s*!important/, 'hide rule must be scoped to .edition-web');
    assert.ok(!/(^|[^-])\.steam-only\s*\{/.test(css.replace(/\.edition-web \.steam-only/g, '')), 'no unscoped .steam-only rule');

    const main = read('js/main.js');
    assert.match(main, /if \(GameConfig\.isWeb && typeof document !== 'undefined'\) document\.documentElement\.classList\.add\('edition-web'\)/);

    const ui = read('js/ui.js');
    assert.match(ui, /class="steam-only [^"]*"[^>]*>\s*<h2[^>]*>Support the Board Game!/, 'Kickstarter banner in the compendium');
    assert.match(ui, /if \(window\.GameConfig && window\.GameConfig\.isWeb\) \{\s*container\.innerHTML = '';\s*return;/, 'news feed');
    console.log('✓ Test 11 Passed: QUIT, Discord, Change Local Name, Report Bug, Kickstarter banner and news feed are Web-hidden only.');
}

// Test 12: Promo modals, quit button and dev hotkeys are switched off only behind isWeb
{
    const main = read('js/main.js');
    const slice = (startMarker, len = 500) => {
        const i = main.indexOf(startMarker);
        assert.ok(i >= 0, `marker not found: ${startMarker}`);
        return main.slice(i, i + len);
    };

    const promo = slice('showPromoModal: (onConfirm) => {', 400);
    assert.match(promo, /if \(GameConfig\.isWeb\) \{\s*if \(onConfirm\) onConfirm\(\); else app\.exitToTitle\(true\);\s*return;\s*\}/, 'exit promo continues straight on');
    assert.ok(promo.indexOf('GameConfig.isWeb') < promo.indexOf("getElementById('promo-modal')"), 'guard comes before any promo DOM work');

    const startPromo = slice('showStartPromoModal: () => {', 300);
    assert.match(startPromo, /if \(GameConfig\.isWeb\) return;/);
    assert.ok(startPromo.indexOf('GameConfig.isWeb') < startPromo.indexOf("getElementById('start-promo-modal')"));

    assert.match(main, /btn\.style\.display = GameConfig\.isWeb \? 'none' : 'block';/, 'Quit to Desktop in Settings');
    assert.match(main, /if \(!GameConfig\.isWeb && e\.ctrlKey && e\.shiftKey && e\.key\.toLowerCase\(\) === 'd'\)/, 'god mode hotkey');
    assert.match(main, /if \(!GameConfig\.isWeb && e\.key\.toLowerCase\(\) === 'u'\)/, 'U key menu toggle');
    console.log('✓ Test 12 Passed: promos skipped, Settings quit hidden, "U" and god-mode hotkeys disabled on Web only.');
}

// Test 13: The Steam overlay ticker is skipped on Web, and the placeholder cannot match a Steam edition
{
    const html = read('index.html');
    const guard = html.indexOf(`if ('%VITE_GAME_EDITION%' === 'web') { canvas.remove(); return; }`);
    const ctx = html.indexOf(`canvas.getContext('2d'`);
    assert.ok(guard > 0 && ctx > guard, 'Web guard must run before the ticker starts');
    console.log('✓ Test 13 Passed: Steam overlay ticker is skipped only when the build edition is "web".');
}

// Test 14: Web party player count is always 2-4
{
    const cases = [[1, 2], [2, 2], [3, 3], [4, 4], [5, 4], [0, 2], [-1, 2], ['3', 3], [3.6, 4], [NaN, 2], [undefined, 2], ['abc', 2]];
    for (const [input, expected] of cases) {
        assert.equal(clampWebPlayers(input), expected, `clampWebPlayers(${String(input)})`);
    }
    assert.equal(WEB_PARTY.minPlayers, 2);
    assert.equal(WEB_PARTY.maxPlayers, 4);
    console.log('✓ Test 14 Passed: the party always has 2 to 4 players.');
}

// Test 15: Web party config never has visitors, even after a gambit left its settings behind
{
    // A tutorial gambit leaves 1 human, a visitor and visible bot money behind
    const afterGambit = { humans: 1, bots: 3, showBotMoney: true, setupMode: 'PAIR', jaegaVariation: false };
    const result = applyWebPartyConfig(afterGambit);
    assert.equal(result, afterGambit, 'mutates and returns the same config object');
    assert.equal(afterGambit.humans, 2);
    assert.equal(afterGambit.bots, 0);
    assert.equal(afterGambit.showBotMoney, false);
    assert.equal(afterGambit.setupMode, 'PAIR', 'the chosen draft mode is not touched');

    assert.equal(applyWebPartyConfig({ humans: 3, bots: 1 }).humans, 3, 'a chosen player count is kept');
    assert.equal(applyWebPartyConfig({ humans: 9, bots: 0 }).humans, 4);
    assert.equal(applyWebPartyConfig({ humans: 4, bots: 2 }).bots, 0);
    assert.equal(WEB_PARTY.variation, 'JAEGA', 'Red Reef is the only variation');
    assert.equal(WEB_PARTY.tutorialGambitId, 1);
    console.log('✓ Test 15 Passed: party config forces 0 visitors, no bot money, Red Reef; keeps count and draft mode.');
}

// Test 16: Party default names replace only the Steam-style defaults
{
    assert.deepEqual([0, 1, 2, 3].map(defaultPartyName), ['PLAYER 1', 'PLAYER 2', 'PLAYER 3', 'PLAYER 4']);
    for (const v of ['LOCAL', 'LOCAL 1', 'local 3', 'LOCAL 4', '', '   ', undefined, null]) {
        assert.equal(isSteamDefaultName(v), true, `"${v}" is a default`);
    }
    for (const v of ['Lucas', 'Lucas Uma', 'LOCALITY', 'Local Bob', 'PLAYER 1', 'Ann', 'LOCAL 12']) {
        assert.equal(isSteamDefaultName(v), false, `"${v}" must be kept as typed`);
    }
    console.log('✓ Test 16 Passed: typed names are never overwritten; defaults become PLAYER n.');
}

// Test 17: Menu flow wiring: one menu on Web, Steam flow kept verbatim
{
    const main = read('js/main.js');
    assert.match(main, /goToMainHub: \(\) => \{\s*\/\/[^\n]*\n\s*if \(GameConfig\.isWeb\) \{\s*app\.goToSetupV2\(true\);\s*return;\s*\}/, 'hub redirects to the party menu');
    assert.match(main, /if \(!bypassReminder && !GameConfig\.isWeb\) \{/, 'no tutorial-recommended popup on Web');
    assert.match(main, /if \(GameConfig\.isWeb\) \{\s*app\.clearWebTutorialUI\(\);\s*app\.restoreWebPartySnapshot\(\);\s*app\.enforceWebPartyRules\(\);\s*\} else if \(app\.customBotSelection\.every\(b => b === null\)\) \{\s*state\.config\.humans = 2;\s*state\.config\.bots = 2;/, 'Steam defaults (2 locals + 2 random visitors) kept');
    assert.match(main, /if \(!GameConfig\.isWeb && input0 && \(input0\.value === 'LOCAL 1' \|\| input0\.value === 'LOCAL'\)\)/, 'Steam local-name prefill kept');
    assert.match(main, /if \(GameConfig\.isWeb && !isGambit\) \{\s*state\.activeGambitId = null;\s*app\.enforceWebPartyRules\(\);/, 'custom matches re-apply the party rules at start');
    assert.match(main, /if \(GameConfig\.isWeb\) \{\s*state\.config\.humans = clampWebPlayers\(count\);\s*state\.config\.bots = 0;/, 'player count clamp');
    assert.match(main, /if \(count > 4 && !GameConfig\.isFullGame\) \{/, 'Steam player count rule kept');
    assert.match(main, /setBotCount: \(count\) => \{\s*\/\/[^\n]*\n\s*if \(GameConfig\.isWeb\) return;\s*state\.config\.bots = count;/, 'visitor count ignored on Web');
    assert.match(main, /enforceWebPartyRules: \(\) => \{\s*app\.setVariation\(WEB_PARTY\.variation\);\s*applyWebPartyConfig\(state\.config\);/, 'Red Reef forced');
    assert.match(main, /startWebTutorial: \(\) => \{[\s\S]*?getElementById\('panel-2-setup'\)[\s\S]*?setup\.style\.display = 'none';[\s\S]*?app\.selectGambitV2\(WEB_PARTY\.tutorialGambitId\);\s*app\.startGambit\(\);/, 'tutorial hides the party menu first, then starts Gambit 1');
    assert.equal((main.match(/GameConfig\.isWeb \? defaultPartyName\(n - 1\) : `LOCAL \$\{n\}`/g) || []).length, 2, 'name resets');

    const game = read('js/game.js');
    assert.match(game, /const fallbackName = `\$\{window\.GameConfig && window\.GameConfig\.isWeb \? 'Player' : 'Local'\} \$\{i \+ 1\}`;/);
    console.log('✓ Test 17 Passed: hub replaced by the party menu on Web; Steam setup flow untouched.');
}

// Test 18: Party menu markup: variation picker and visitors hidden, shared inputs visible, tutorial button present
{
    const html = read('index.html');
    const idTagged = (id) => new RegExp(`<div id="${id}"[^>]*class="hide-on-web `).test(html);
    for (const id of ['v3-var-jaega', 'v3-var-roxana', 'v3-var-none', 'v3-var-tournament',
                      'v3-bot-0', 'v3-bot-1', 'v3-bot-2', 'v3-bot-3',
                      'v3-visitor-img-1', 'v3-visitor-img-2', 'v3-visitor-img-3',
                      'v3-visitor-name-1', 'v3-visitor-name-2', 'v3-visitor-name-3']) {
        assert.ok(idTagged(id), `${id} must be hidden on Web`);
    }
    // Shared elements stay visible on Web (and are only repositioned by CSS)
    for (const id of ['v3-human-1', 'v3-human-2', 'v3-human-3', 'v3-human-4', 'v3-setup-random', 'v3-setup-pair', 'v3-setup-open', 'v3-start-match']) {
        assert.ok(new RegExp(`id="${id}"`).test(html), `${id} exists`);
        assert.ok(!new RegExp(`id="${id}"[^>]*hide-on-web`).test(html), `${id} must stay visible on Web`);
    }
    for (let i = 0; i < 4; i++) {
        assert.ok(!new RegExp(`id="v3-input-name-${i}"[^>]*hide-on-web`).test(html), `name box ${i + 1} must stay visible`);
    }
    assert.match(html, /<button onclick="app\.goToMainHub\(\)" class="hide-on-web /, 'setup "Main Menu" link hidden on Web');
    assert.match(html, /<div id="v3-tutorial-btn" onclick="app\.startWebTutorial\(\)" class="web-only /, 'tutorial button');
    assert.match(html, /<div id="v3-start-match" onclick="app\.startGame\(\)" class="absolute top-\[1480px\] left-\[1120px\] w-\[600px\] h-\[120px\]/, 'Steam START MATCH geometry unchanged');
    assert.match(html, /web-only[^>]*>READY TO PLAY\?</, 'heading');
    assert.match(html, /web-only[^>]*>Grab your friends\. Let the games begin\.</, 'subtitle');
    assert.match(html, /LOCAL 1/, 'Steam default names kept in the markup');
    console.log('✓ Test 18 Passed: picker/visitors hidden only on Web; names, count, draft, START kept; Tutorial button added.');
}

// Test 19: Party menu CSS is scoped to the Web edition and uses absolute coordinates only
{
    const css = read('index.css');
    assert.match(css, /\.edition-web \.hide-on-web\s*\{\s*display:\s*none\s*!important/);
    assert.match(css, /html:not\(\.edition-web\) \.web-only\s*\{\s*display:\s*none\s*!important/);
    const section = css.slice(css.indexOf('Web Party Edition: party menu'));
    const rules = section.split(/\r?\n/).filter(l => l.includes('{') && !l.trim().startsWith('/*') && !l.trim().startsWith('*'));
    assert.ok(rules.length >= 14, 'party layout rules present');
    for (const rule of rules) {
        assert.ok(/^(\.edition-web |html:not\(\.edition-web\) )/.test(rule.trim()), `rule must be scoped to the Web edition: ${rule.trim()}`);
        assert.ok(!/(flex|grid|margin|float)/.test(rule), `layout rule must use absolute coordinates only: ${rule.trim()}`);
    }
    // Four name rows, four player circles and three draft buttons are positioned
    for (const id of ['v3-human-1', 'v3-human-4', 'v3-input-name-0', 'v3-input-name-3', 'v3-setup-random', 'v3-setup-open', 'v3-start-match']) {
        assert.ok(section.includes(`#${id} {`), `${id} positioned for Web`);
    }
    console.log('✓ Test 19 Passed: party layout CSS is Web-scoped and absolute-positioned.');
}

// Test 20: Pick 2 is available on Web, and still blocked in Steam Demo custom matches
{
    assert.equal(isPick2BlockedInDemo('PAIR', false, null, true), false, 'Web: PAIR allowed');
    assert.equal(isPick2BlockedInDemo('PICK_2', false, null, true), false, 'Web: PICK_2 allowed');
    // Steam behavior, with and without the new optional argument
    assert.equal(isPick2BlockedInDemo('PAIR', false, null), true, 'Demo: PAIR blocked (3 args, as before)');
    assert.equal(isPick2BlockedInDemo('PAIR', false, null, false), true, 'Demo: PAIR blocked');
    assert.equal(isPick2BlockedInDemo('PAIR', false, 10), false, 'Demo: Gambit 10 still allowed');
    assert.equal(isPick2BlockedInDemo('PAIR', true, null), false, 'Full: allowed');
    assert.equal(isPick2BlockedInDemo('RANDOM', false, null, false), false, 'Demo: other modes never blocked');

    withEdition('web', () => {
        for (const mode of ['PAIR', 'PICK_2', 'OPEN', 'OPEN_DRAFT', 'RANDOM', 'PRE_SELECTED']) {
            assert.equal(UnlockManager.isDraftModeUnlocked(mode), true, `Web: ${mode} unlocked`);
        }
    });
    withEdition('demo', () => {
        assert.equal(UnlockManager.isDraftModeUnlocked('PAIR'), false, 'Demo: PAIR stays locked');
        assert.equal(UnlockManager.isDraftModeUnlocked('PICK_2'), false, 'Demo: PICK_2 stays locked');
        assert.equal(UnlockManager.isDraftModeUnlocked('OPEN'), true);
        assert.equal(UnlockManager.isDraftModeUnlocked('RANDOM'), true);
    });
    withEdition('full', () => {
        assert.equal(UnlockManager.isDraftModeUnlocked('PAIR'), true, 'Full: PAIR unlocked');
    });
    console.log('✓ Test 20 Passed: Pick 2 unlocked on Web only; Demo still locked, Full still open.');
}

// Test 21: Web Random draft only deals the 5 Demo characters; Steam Random is unchanged (all 10)
{
    assert.equal(CHARACTERS.length, 10);
    withEdition('web', () => {
        const pool = getRandomDraftPool(CHARACTERS, UnlockManager, true);
        assert.deepEqual(pool.map(c => c.name).sort(), DEMO_CHARACTERS);
        assert.ok(pool.length >= WEB_PARTY.maxPlayers, 'enough characters for 4 players');
    });
    withEdition('demo', () => {
        assert.equal(getRandomDraftPool(CHARACTERS, UnlockManager, false).length, 10, 'Demo Random still deals from all 10');
        assert.equal(getRandomDraftPool(CHARACTERS, UnlockManager).length, 10, 'default stays unrestricted');
    });
    withEdition('full', () => {
        assert.equal(getRandomDraftPool(CHARACTERS, UnlockManager, false).length, 10);
    });
    assert.equal(getRandomDraftPool(CHARACTERS, null, true).length, 10, 'no unlock manager: nothing filtered');
    console.log('✓ Test 21 Passed: Web Random uses the 5 Demo characters; Steam Random still uses all 10.');
}

// Test 22: Pick 2 works for 2, 3 and 4 players on the 5-character Demo pool when unpicked cards are recycled
{
    const runDraft = (humans, recycleUnpicked, chooseIndex) => {
        const state = {
            players: Array.from({ length: humans }, (_, i) => ({ id: i, name: `P${i + 1}`, type: 'HUMAN', character: null })),
            draftOrder: Array.from({ length: humans }, (_, i) => i),
            draftAvailablePool: [],
            currentDraftCandidates: [],
            activeGambitId: null
        };
        state.draftAvailablePool = getPick2CandidatePool(null, CHARACTERS, UnlockManager)
            .map(c => ({ c, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.c);
        const dealt = [];
        while (state.draftOrder.length > 0) {
            const playerId = state.draftOrder[0];
            state.currentDraftCandidates = drawPick2Candidates(state.draftAvailablePool);
            dealt.push(state.currentDraftCandidates.length);
            if (state.currentDraftCandidates.length === 0) { state.draftOrder.shift(); continue; } // starved (old behavior)
            const index = Math.min(chooseIndex(), state.currentDraftCandidates.length - 1);
            resolvePick2Selection(state, playerId, index, null, { recycleUnpicked });
        }
        return { state, dealt };
    };

    withEdition('web', () => {
        for (let round = 0; round < 300; round++) {
            for (const humans of [2, 3, 4]) {
                const { state, dealt } = runDraft(humans, true, () => Math.round(Math.random()));
                assert.ok(dealt.every(n => n === 2), `${humans} players: everyone is dealt 2 candidates (got ${dealt})`);
                const names = state.players.map(p => p.character.name);
                assert.equal(new Set(names).size, humans, `${humans} players: all characters are different (${names})`);
                assert.ok(names.every(n => DEMO_CHARACTERS.includes(n)), `${humans} players: only Demo characters (${names})`);
            }
        }

        // The first player is never offered a card the previous player rejected before fresh cards run out:
        // unpicked cards go to the bottom of the pool, so with 3+ cards left the next player draws fresh ones
        const state = { players: [{ id: 0, character: null }, { id: 1, character: null }], draftOrder: [0, 1],
            draftAvailablePool: getPick2CandidatePool(null, CHARACTERS, UnlockManager), currentDraftCandidates: [] };
        state.currentDraftCandidates = drawPick2Candidates(state.draftAvailablePool);
        const rejected = state.currentDraftCandidates[1];
        resolvePick2Selection(state, 0, 0, null, { recycleUnpicked: true });
        assert.equal(state.draftAvailablePool[0], rejected, 'rejected card sits at the bottom of the pool');
        const next = drawPick2Candidates(state.draftAvailablePool);
        assert.ok(!next.includes(rejected), 'next player is dealt fresh cards first');
    });

    // Steam behavior is unchanged: without recycling, the 4th player of a 5-character pool gets nothing
    withEdition('demo', () => {
        const { dealt } = runDraft(4, false, () => 0);
        assert.deepEqual(dealt, [2, 2, 1, 0], 'old no-recycle behavior is untouched for Steam');
    });
    console.log('✓ Test 22 Passed: 2/3/4 players always get 2 candidates and distinct Demo characters; Steam rule unchanged.');
}

// Test 23: Wiring in main.js / game.js is Web-gated
{
    const main = read('js/main.js');
    assert.match(main, /isPick2BlockedInDemo\(mode, !isDemo, state\.activeGambitId, GameConfig\.isWeb\)/);
    assert.match(main, /if \(isDemo && !GameConfig\.isWeb && key === 'PICK_2'\) \{/, 'FULL VERSION lock on Pick 2 only for Steam Demo');
    assert.match(main, /resolvePick2Selection\(state, playerId, candidateIndex, finalizePlayerSetup, \{ recycleUnpicked: GameConfig\.isWeb \}\)/);
    const game = read('js/game.js');
    assert.match(game, /getRandomDraftPool\(CHARACTERS, window\.UnlockManager, !!\(window\.GameConfig && window\.GameConfig\.isWeb\)\)/);
    const ui = read('js/ui.js');
    assert.ok(ui.includes("${window.GameConfig && window.GameConfig.isWeb ? 'FULL GAME' : `GAMBIT ${requiredGambit}`}"), 'Open Draft lock label: no campaign gambit numbers on Web');
    const um = read('js/UnlockManager.js');
    assert.match(um, /if \(!isFullGame && !isWeb && \(key\.toUpperCase\(\) === 'PAIR'/);
    console.log('✓ Test 23 Passed: Pick 2 unlock, recycling and Random pool are gated behind isWeb.');
}

// Test 24: The tutorial chain is Gambits 1 -> 2 -> 3 -> 4 -> party menu; losing retries the same lesson
{
    assert.deepEqual(WEB_PARTY.tutorialGambitIds, [1, 2, 3, 4]);
    assert.equal(WEB_PARTY.tutorialGambitIds[0], WEB_PARTY.tutorialGambitId, 'the button starts the first lesson');

    // Winning walks through every lesson and then finishes
    const walked = [];
    let current = WEB_PARTY.tutorialGambitId;
    for (let guard = 0; guard < 10; guard++) {
        walked.push(current);
        const step = nextWebTutorialStep(current, true);
        if (step.action === 'FINISH') break;
        current = step.gambitId;
    }
    assert.deepEqual(walked, [1, 2, 3, 4]);
    assert.deepEqual(nextWebTutorialStep(4, true), { action: 'FINISH' });

    // Losing retries the same lesson
    for (const id of [1, 2, 3, 4]) {
        assert.deepEqual(nextWebTutorialStep(id, false), { action: 'START', gambitId: id });
    }
    // Anything that is not a tutorial lesson never leads into the campaign: it just finishes
    for (const id of [0, 5, 6, 10, 21, null, undefined]) {
        assert.deepEqual(nextWebTutorialStep(id, true), { action: 'FINISH' }, `gambit ${id} wins finish`);
    }

    assert.equal(webTutorialPrimaryLabel(1, true), 'NEXT LESSON');
    assert.equal(webTutorialPrimaryLabel(3, true), 'NEXT LESSON');
    assert.equal(webTutorialPrimaryLabel(4, true), 'FINISH TUTORIAL');
    assert.equal(webTutorialPrimaryLabel(2, false), 'RETRY');
    assert.equal(webTutorialPrimaryLabel(4, false), 'RETRY');

    // The lessons really exist and are the solo/low-opponent tutorial gambits
    for (const id of WEB_PARTY.tutorialGambitIds) {
        assert.ok(GAMBIT_CAMPAIGN.find(g => g.id === id), `gambit ${id} exists`);
    }
    const visitors = (id) => (GAMBIT_CAMPAIGN.find(g => g.id === id).opponents || []).filter(o => o && o > 0).length;
    assert.deepEqual([1, 2, 3, 4].map(visitors), [0, 0, 1, 0], 'only lesson 3 has a (scripted) visitor');
    console.log('✓ Test 24 Passed: tutorial chain 1-2-3-4 then party menu; retry on loss; never reaches the campaign.');
}

// Test 25: The tutorial is played under player 1's name
{
    assert.equal(pickTutorialName('Ulla', 'LOCAL'), 'Ulla');
    assert.equal(pickTutorialName('  Ann  ', 'Old'), 'Ann');
    assert.equal(pickTutorialName('', 'Bob'), 'Bob', 'empty box keeps the previous name');
    assert.equal(pickTutorialName('   ', ''), 'PLAYER 1');
    assert.equal(pickTutorialName(undefined, undefined), 'PLAYER 1');
    assert.equal(pickTutorialName(null, '  '), 'PLAYER 1');
    console.log("✓ Test 25 Passed: tutorial name comes from player 1's box.");
}

// Test 26: Tutorial wiring is Web-gated and the Steam campaign flow is untouched
{
    const main = read('js/main.js');
    // Web chain comes right after the custom-match return and before any campaign/promo logic
    assert.match(main, /if \(!state\.activeGambitId\) \{\s*app\.goToSetupV2\(\);\s*return;\s*\}\s*\/\/[^\n]*\n\s*if \(GameConfig\.isWeb\) \{\s*app\.advanceWebTutorial\(isWin\);\s*return;\s*\}\s*if \(isWin\) \{/, 'Web chain before the Steam campaign logic');
    assert.match(main, /if \(isGambit\) \{\s*\/\/[^\n]*\n\s*if \(GameConfig\.isWeb\) app\.goToMainHub\(\); else app\.goToGambitsV2\(\);/, 'exit goes to the party menu on Web');
    assert.equal((main.match(/secondaryBtnText = GameConfig\.isWeb \? "PARTY MENU" : "GAMBITS SELECT";/g) || []).length, 2, 'both end screens');
    assert.match(main, /primaryBtnText = GameConfig\.isWeb \? webTutorialPrimaryLabel\(state\.activeGambitId, true\) : "NEXT GAMBIT";/);
    assert.match(main, /primaryBtnText = "RETRY";/);
    // Campaign rewards ("REWARD: Level 2", unlocked visitors) mean nothing on Web: hidden there, still shown on Steam
    assert.ok(main.includes("${GameConfig.isWeb ? '' : `<div class=\"text-white text-[32px] font-light uppercase font-overpass whitespace-nowrap mt-2\">REWARD: ${gambit.brief?.unlockReward || 'NEW ASSETS'}</div>`}"), 'reward line hidden on Web only');
    // Steam campaign logic still present
    assert.match(main, /A\. Fewer than 5 completed in current level/, 'campaign advance logic kept');
    assert.match(main, /Demo completed!/, 'Demo completion kept');
    // Name and settings snapshot
    assert.match(main, /app\.webPartySnapshot = \{ humans: state\.config\.humans, setupMode: state\.config\.setupMode \};/);
    assert.match(main, /state\.settings\.localName = pickTutorialName\(nameInput \? nameInput\.value : '', state\.settings\.localName\);/);
    assert.match(main, /restoreWebPartySnapshot: \(\) => \{\s*if \(!app\.webPartySnapshot\) return;/);
    assert.match(main, /advanceWebTutorial: \(isWin\) => \{\s*const step = nextWebTutorialStep\(state\.activeGambitId, isWin\);/);
    console.log('✓ Test 26 Passed: chain, exit, labels and settings restore are Web-only; Steam campaign flow untouched.');
}

// Test 27: Half-finished lessons cannot leave popups floating over the party menu
{
    for (const id of ['g1-intro-overlay', 'g1-step2-overlay', 'g2-intro-overlay', 'g2-bonus-overlay', 'g2-landmark-click-overlay',
                      'g2-row-bonuses-overlay', 'g2-end-overlay', 'g4-popup-overlay', 'g2-step-popup', 'g3-step-popup']) {
        assert.equal(isTutorialPopupId(id), true, `${id} is a lesson popup`);
    }
    for (const id of ['g1-intro-inner', 'g4-popup-inner', 'game-ui', 'game-over-screen', 'confirm-overlay', 'abort-match-modal',
                      'tutorial-toast', 'g-overlay', 'cinematic-winner-overlay', '', null, undefined]) {
        assert.equal(isTutorialPopupId(id), false, `${String(id)} must not be removed`);
    }

    // Every popup/overlay id the lessons create in the code is covered by the pattern
    const sources = ['js/ui.js', 'js/game.js', 'js/main.js'].map(read).join('\n');
    const lessonIds = new Set([...sources.matchAll(/['"](g[1-9]-[a-z0-9-]+-(?:overlay|popup))['"]/g)].map(m => m[1]));
    assert.ok(lessonIds.size >= 10, `found the lesson popup ids in the code (${lessonIds.size})`);
    for (const id of lessonIds) assert.equal(isTutorialPopupId(id), true, `${id} is covered`);

    const main = read('js/main.js');
    assert.match(main, /clearWebTutorialUI: \(\) => \{\s*document\.querySelectorAll\('\[id\]'\)\.forEach\(el => \{ if \(isTutorialPopupId\(el\.id\)\) el\.remove\(\); \}\);/);
    assert.match(main, /\['tutorial-toast', 'toast-dismiss-btn', 'tutorial-arrow'\]\.forEach\(id => \{/);
    console.log('✓ Test 27 Passed: lesson popups are cleared whenever the party menu opens on Web.');
}

// Test 28: The board is centered vertically when the window is taller than the 16:9 canvas
{
    const zoomFor = (w, h) => Math.max(0.1, Math.min(w / 3840, h / 2160)); // same formula as initAutoZoom
    // 16:9 windows: the board fills the height, no offset
    for (const [w, h] of [[1920, 1080], [1366, 768], [2560, 1440], [3840, 2160], [800, 450]]) {
        assert.equal(webBoardOffsetY(h, zoomFor(w, h)), 0, `${w}x${h} needs no offset`);
    }
    // 4:3 and taller windows: half of the free space goes above the board
    assert.equal(webBoardOffsetY(768, zoomFor(1024, 768)), 96, '1024x768');
    assert.equal(webBoardOffsetY(1200, zoomFor(1920, 1200)), 60, '1920x1200');
    assert.equal(webBoardOffsetY(1024, zoomFor(768, 1024)), Math.round((1024 - 2160 * (768 / 3840)) / 2), 'portrait tablet');
    // The centered board stays fully inside the window and is balanced top and bottom
    for (const [w, h] of [[1024, 768], [1280, 1024], [1920, 1200], [1440, 900], [768, 1024]]) {
        const z = zoomFor(w, h);
        const off = webBoardOffsetY(h, z);
        const bottomGap = h - (off + 2160 * z);
        assert.ok(off >= 0 && bottomGap >= -1, `${w}x${h} board stays inside the window`);
        assert.ok(Math.abs(off - bottomGap) <= 1, `${w}x${h} balanced above/below`);
    }
    // Invalid input never shifts the board
    for (const bad of [[0, 1], [768, 0], [NaN, 1], [768, NaN], [-5, 1], [undefined, undefined]]) {
        assert.equal(webBoardOffsetY(...bad), 0);
    }

    const main = read('js/main.js');
    assert.match(main, /const offsetY = GameConfig\.isWeb \? webBoardOffsetY\(window\.innerHeight, val\) : 0;\s*board\.style\.transform = offsetY > 0 \? `translateY\(\$\{offsetY\}px\) scale\(\$\{val\}\)` : `scale\(\$\{val\}\)`;/);
    console.log('✓ Test 28 Passed: Web centers the board vertically (4:3 and taller windows); Steam transform unchanged.');
}

// Test 29: A touch keyboard cannot rescale the layout while a name is typed
{
    assert.equal(isTextEntryElement({ tagName: 'INPUT', type: 'text' }), true);
    assert.equal(isTextEntryElement({ tagName: 'input', type: 'search' }), true);
    assert.equal(isTextEntryElement({ tagName: 'INPUT' }), true, 'input without type is a text box');
    assert.equal(isTextEntryElement({ tagName: 'TEXTAREA' }), true);
    assert.equal(isTextEntryElement({ tagName: 'DIV', isContentEditable: true }), true);
    for (const el of [null, undefined, { tagName: 'BODY' }, { tagName: 'BUTTON' }, { tagName: 'INPUT', type: 'checkbox' },
                      { tagName: 'INPUT', type: 'range' }, { tagName: 'INPUT', type: 'radio' }, {}]) {
        assert.equal(isTextEntryElement(el), false, `${JSON.stringify(el)} is not a text box`);
    }

    const main = read('js/main.js');
    // guard runs after the invalid-size check and before any scaling work
    const autoZoom = main.slice(main.indexOf('function initAutoZoom()'));
    const guard = autoZoom.indexOf('if (GameConfig.isWeb && isTextEntryElement(document.activeElement)) return;');
    const zoomApply = autoZoom.indexOf('app.setBoardZoom(zoom);');
    const invalidCheck = autoZoom.indexOf('// Ignore zero/invalid dimensions triggered while minimized or during Alt+Tab');
    assert.ok(invalidCheck > 0 && guard > invalidCheck && zoomApply > guard, 'guard sits between the size check and the zoom');
    assert.match(main, /if \(GameConfig\.isWeb\) document\.addEventListener\('focusout', handleResize\);/, 'rescale after the box loses focus');
    console.log('✓ Test 29 Passed: resize is ignored while a text box has focus (Web only) and re-evaluated afterwards.');
}

// Test 30: Small-window / portrait notice
{
    const cases = [[1920, 1080, null], [1366, 768, null], [1280, 1024, null], [1024, 768, null], [1024, 1023, null],
                   [1023, 768, 'SMALL'], [800, 450, 'SMALL'], [900, 900, 'SMALL'],
                   [768, 1024, 'ROTATE'], [390, 844, 'ROTATE'], [1000, 1001, 'ROTATE']];
    for (const [w, h, expected] of cases) assert.equal(webSizeHint(w, h), expected, `${w}x${h}`);
    for (const bad of [[0, 0], [NaN, 100], [100, NaN], [-1, 100], [undefined, undefined]]) assert.equal(webSizeHint(...bad), null);
    assert.ok(WEB_SIZE_HINT_TEXT.ROTATE.length > 10 && WEB_SIZE_HINT_TEXT.SMALL.length > 10);
    assert.ok(WEB_SIZE_HINT_TEXT.SMALL.includes('1024'), 'the text names the recommended width');

    const html = read('index.html');
    assert.match(html, /<div id="web-size-hint" class="web-only [^"]*" style="display:none" role="status">/, 'hint starts hidden and is Web-only');
    assert.match(html, /onclick="app\.dismissWebSizeHint\(\)"/, 'dismissible');
    const main = read('js/main.js');
    assert.match(main, /if \(GameConfig\.isWeb\) app\.updateWebSizeHint\(w, h\);/, 'evaluated on every rescale, Web only');
    assert.match(main, /if \(!kind \|\| app\.webSizeHintDismissed\) \{\s*el\.style\.display = 'none';/);
    console.log('✓ Test 30 Passed: portrait and sub-1024px windows get a dismissible hint; normal windows never do.');
}

// Test 31: Open Draft uses tap-to-preview only on Web touch screens
{
    const asked = [];
    const touch = (q) => { asked.push(q); return { matches: true }; };
    const mouse = () => ({ matches: false });
    assert.equal(usesTapToPreview(true, touch), true);
    assert.deepEqual(asked, ['(hover: none)'], 'asks whether the main input can hover');
    assert.equal(usesTapToPreview(true, mouse), false, 'mouse users pick with one click');
    assert.equal(usesTapToPreview(false, touch), false, 'Steam editions never use it');
    assert.equal(usesTapToPreview(true, null), false);
    assert.equal(usesTapToPreview(true, undefined), false);
    assert.equal(usesTapToPreview(true, () => null), false);

    const ui = read('js/ui.js');
    assert.ok(ui.includes("clickHandler = `onclick=\"app.${tapToPreview ? 'tapOpenDraftCard' : 'handleOpenDraftPick'}(${item.id})\"`;"), 'Steam still calls handleOpenDraftPick');
    const main = read('js/main.js');
    assert.match(main, /tapOpenDraftCard: \(charId\) => \{\s*const tapKey = `\$\{state\.draftOrder\[0\]\}:\$\{charId\}`;\s*if \(app\.openDraftTapKey === tapKey\) \{\s*app\.openDraftTapKey = null;\s*app\.handleOpenDraftPick\(charId\);\s*return;\s*\}/, 'second tap on the same card by the same player chooses it');
    const css = read('index.css');
    assert.match(css, /\.edition-web \.draft-previewed\s*\{\s*scale:\s*1\.75;/, 'preview matches the hover enlargement');
    console.log('✓ Test 31 Passed: tap-to-preview is Web + touch only; Steam and mouse users keep one-click picks.');
}

// Test 32: The splash button no longer wraps in small windows (Web only, unchanged from 1250px up)
{
    const css = read('index.css');
    assert.match(css, /\.edition-web #splash-screen button\s*\{\s*white-space:\s*nowrap;\s*font-size:\s*clamp\(20px, 3\.2vw, 40px\);\s*padding:\s*0\.6em 1\.6em;\s*\}/);
    // The original splash button is 40px text with 64px x 24px padding = 1.6em x 0.6em, and 3.2vw >= 40px from 1250px up
    const html = read('index.html');
    assert.ok(/id="splash-screen"[\s\S]*?text-\[40px\] px-16 py-6/.test(html), 'Steam splash button markup unchanged');
    assert.equal(64 / 40, 1.6);
    assert.equal(24 / 40, 0.6);
    assert.ok(0.032 * 1250 >= 40 && 0.032 * 1249 < 40.0001);
    console.log('✓ Test 32 Passed: splash button scales down on Web small windows, identical from 1250px up.');
}

// Test 33: The party game-over screen has ONE button back (MAIN MENU and BACK TO SETUP went to the same place)
{
    const main = read('js/main.js');
    // Web custom match: only the primary button, labelled MAIN MENU
    assert.match(main, /\} else if \(GameConfig\.isWeb\) \{\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*primaryBtnText = "MAIN MENU";\s*primaryBtnOnClick = "app\.handleCustomMatchExit\('MENU'\)";\s*\} else \{/, 'Web: one MAIN MENU button');
    // Steam custom match keeps both buttons exactly as before
    assert.match(main, /\} else \{\s*secondaryBtnText = "MAIN MENU";\s*secondaryBtnOnClick = "app\.handleCustomMatchExit\('MENU'\)";\s*primaryBtnText = "BACK TO SETUP";\s*primaryBtnOnClick = "app\.handleCustomMatchExit\('SETUP'\)";\s*\}/, 'Steam: both buttons kept');
    // The empty secondary button is hidden; with text (always the case on Steam) the markup is unchanged
    assert.ok(main.includes("<button onclick=\"${secondaryBtnOnClick}\"${secondaryBtnText ? '' : ' style=\"display:none\"'} class="), 'secondary button hidden only when it has no text');
    console.log('✓ Test 33 Passed: Web game-over screen shows one MAIN MENU button; Steam keeps both.');
}

// Test 34: Party menu background picture: right file, Web-only "cover" rule, preloaded, nothing for Steam
{
    // The picture is a 2560x1440 WebP in public/assets (read from the WebP header)
    const b = fs.readFileSync(path.join(root, 'public/assets/board_game.webp'));
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    assert.equal(b.toString('ascii', 8, 12), 'WEBP');
    const kind = b.toString('ascii', 12, 16);
    let w, h;
    if (kind === 'VP8X') { w = 1 + b.readUIntLE(24, 3); h = 1 + b.readUIntLE(27, 3); }
    else if (kind === 'VP8L') { const v = b.readUInt32LE(21); w = 1 + (v & 0x3fff); h = 1 + ((v >> 14) & 0x3fff); }
    else { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
    assert.deepEqual([w, h], [2560, 1440], `board_game.webp is ${w}x${h}`);
    assert.ok(b.length < 1024 * 1024, 'stays under 1 MB so the first visit is not slowed down');

    // CSS: scoped to the Web edition and to the open party menu, "cover", centered, no dark layer
    const css = read('index.css');
    const m = css.match(/\.edition-web #ui-v2-container:has\(#panel-2-setup:not\(\.hidden\)\)\s*\{([^}]*)\}/);
    assert.ok(m, 'party menu background rule exists');
    assert.match(m[1], /background-image:\s*url\('\/assets\/board_game\.webp'\);/);
    assert.match(m[1], /background-size:\s*cover;/);
    assert.match(m[1], /background-position:\s*center;/);
    assert.match(m[1], /background-repeat:\s*no-repeat;/);
    assert.ok(!/gradient|rgba/.test(m[1]), 'no dark layer for now');
    // The picture is only referenced from that Web-scoped rule
    const urlRefs = [...css.matchAll(/url\('\/assets\/board_game\.webp'\)/g)].length;
    assert.equal(urlRefs, 2, 'one real url() plus the example inside the comment');
    assert.equal(css.indexOf("url('/assets/board_game.webp')") > css.indexOf('Web Party Edition: party menu background picture'), true, 'only after the Web section header');

    // Preloaded while the splash screen is showing, Web only (Steam builds never request it)
    const main = read('js/main.js');
    assert.match(main, /if \(GameConfig\.isWeb && typeof Image !== 'undefined'\) new Image\(\)\.src = new URL\(\/\* @vite-ignore \*\/ '\.\.\/assets\/board_game\.webp', import\.meta\.url\)\.href;/);
    assert.ok(!read('index.html').includes('board_game.webp'), 'index.html (shared by Steam) does not mention the picture');
    console.log('✓ Test 34 Passed: party menu background is a 2560x1440 WebP, Web-only cover rule, preloaded, Steam untouched.');
}

// Test 35: Board game popup data file (design: SUPPORT_POPUP.md): texts, links, tracking, and no dead or unsafe buttons
{
    assert.equal(SUPPORT_US.buttonLabel, 'THE BOARD GAME');
    assert.equal(SUPPORT_US.title, 'PLAY IT ON YOUR TABLE');
    assert.equal(SUPPORT_US.gameOverLink, "Liked it? It's a real board game \u2192");
    assert.equal(SUPPORT_US.offers.length, 2);
    const [board, steam] = SUPPORT_US.offers;
    // 1. Kickstarter is the main action and comes first
    assert.equal(board.main, true);
    assert.ok(!steam.main, 'only one main offer');
    assert.equal(board.heading, 'COMING TO KICKSTARTER');
    assert.match(board.text, /^Palm Beach is one of two games in the box: Palm Beach \(bidding\) and Boca Raton \(push your luck\)\. 1\u20135 players, solo mode, 45\u201360 min\.$/);
    assert.equal(board.buttonLabel, 'NOTIFY ME ON LAUNCH \u2192');
    assert.match(board.url, /^https:\/\/www\.kickstarter\.com\/projects\/backhansgames\/boca-raton-and-palm-beach$/);
    // 2. The VIP link is a plain text link under the main button
    assert.equal(board.extraLink.label, 'Join the VIP list for the 15% Early Bird \u2192');
    assert.equal(board.extraLink.url, 'https://backhansgames.com/go');
    // 3. Steam is the smaller second card, and it is about Boca Raton: Palm Beach is not on Steam
    assert.equal(steam.heading, 'PLAY BOCA RATON ON STEAM');
    assert.equal(steam.text, 'The other game in the box, as Gold Coast Gambits.');
    assert.equal(steam.buttonLabel, 'VIEW ON STEAM \u2192');
    assert.equal(steam.url, 'https://store.steampowered.com/app/4307400/');
    // 4. Copy rules: no 50 % badge, no "full Steam game", no "Notify me for 10 % off"
    const allText = JSON.stringify(SUPPORT_US);
    assert.ok(SUPPORT_US.offers.every(o => !o.badge), 'no badge until the real shop page exists');
    assert.ok(!/50\s?%|10\s?%|FULL STEAM GAME|full Steam game/i.test(allText));
    assert.notEqual(steam.accent, board.accent, 'the two offers have different accent colors');

    // Tracking tags are added to every link
    const boardHref = new URL(buildSupportUrl(board.url, board.id));
    assert.equal(boardHref.hostname, 'www.kickstarter.com');
    assert.equal(boardHref.searchParams.get('utm_source'), 'web_palm_beach');
    assert.equal(boardHref.searchParams.get('utm_medium'), 'support_popup');
    assert.equal(boardHref.searchParams.get('utm_campaign'), 'board-game');
    assert.equal(new URL(buildSupportUrl(steam.url, steam.id)).searchParams.get('utm_campaign'), 'steam');
    // Tags already in a link are kept; tracking can be switched off
    assert.equal(new URL(buildSupportUrl('https://shop.example/key?utm_source=mine', 'x')).searchParams.get('utm_source'), 'mine');
    assert.equal(buildSupportUrl('https://shop.example/key', 'x', {}), 'https://shop.example/key');

    // Unsafe, empty or broken links are refused, and such offers are not shown
    for (const bad of ['', undefined, null, 'javascript:alert(1)', 'data:text/html,hi', 'not a url', '//evil.example', 'ftp://x.example']) {
        assert.equal(isSafeSupportUrl(bad), false, `"${bad}" must be refused`);
        assert.equal(buildSupportUrl(bad, 'x'), '');
    }
    const visible = getVisibleSupportOffers({ offers: [{ id: 'a', url: 'https://ok.example' }, { id: 'b', url: '' }, { id: 'c', url: 'javascript:1' }], tracking: {} });
    assert.deepEqual(visible.map(o => o.id), ['a']);
    const shown = getVisibleSupportOffers();
    assert.equal(shown.length, 2, 'both real offers are shown');
    const vip = new URL(shown[0].extraHref);
    assert.equal(vip.hostname, 'backhansgames.com');
    assert.equal(vip.searchParams.get('utm_campaign'), 'board-game-vip');
    assert.equal(shown[1].extraHref, '', 'the Steam card has no extra link');
    console.log('\u2713 Test 35 Passed: board game popup texts and links (Kickstarter first), tracking tags, and dead/unsafe offers are never shown.');
}

// Test 36: Party menu: two equal buttons in a centered row (no tutorial in version 1), Start stays the prominent one
{
    const html = read('index.html');
    const css = read('index.css');
    const btnClass = (id) => {
        const m = html.match(new RegExp(`<div id="${id}"[^>]*class="([^"]*)"`));
        assert.ok(m, `${id} exists`);
        return m[1];
    };
    const px = (cls, prefix) => Number((cls.match(new RegExp(`${prefix}-\\[(\\d+)px\\]`)) || [])[1]);

    const support = btnClass('v3-support-btn');
    const start = css.match(/\.edition-web #v3-start-match\s*\{([^}]*)\}/)[1];
    const cssPx = (prop) => Number((start.match(new RegExp(`${prop}:\\s*(\\d+)px`)) || [])[1]);

    // Same size, same row, a 60px gap, centered on the 2840px plate: THE BOARD GAME | START MATCH
    assert.deepEqual([px(support, 'w'), px(support, 'h')], [700, 150]);
    assert.deepEqual([cssPx('width'), cssPx('height')], [700, 150]);
    const lefts = [px(support, 'left'), cssPx('left')];
    assert.deepEqual(lefts, [690, 1450]);
    assert.deepEqual([px(support, 'top'), cssPx('top')], [1280, 1280]);
    assert.equal(lefts[1] - (lefts[0] + 700), 60);
    assert.equal(lefts[0], 2840 - (lefts[1] + 700), 'row is centered on the plate');
    // Start remains the only solid yellow button
    const startMarkup = html.match(/<div id="v3-start-match"[^>]*class="([^"]*)"/)[1];
    assert.ok(startMarkup.includes('bg-[#F3C80D]'));
    assert.ok(!support.includes('bg-[#F3C80D]'));
    // The button is named for what the player gets, and says the same as the data file
    assert.match(html, /<div id="v3-support-btn"[^>]*>THE BOARD GAME<\/div>/);
    assert.equal(SUPPORT_US.buttonLabel, 'THE BOARD GAME');
    // The Boca tutorial button is still in the markup (it returns in version 2) but hidden
    assert.match(css, /#v3-tutorial-btn,\s*#v3-tutorial-btn \+ div\s*\{\s*display:\s*none\s*!important/);
    // The heading no longer collides with the column labels (subtitle ends well above them)
    assert.match(html, /top-\[80px\][^>]*>READY TO PLAY\?/);
    assert.match(html, /top-\[180px\][^>]*text-\[40px\][^>]*>Grab your friends/);
    console.log('\u2713 Test 36 Passed: THE BOARD GAME | START MATCH, equal size, centered row; Start is the only solid button.');
}

// Test 37: The popup: Web only, never automatic, easy to close, links open in a new tab
{
    const html = read('index.html');
    const main = read('js/main.js');

    const modal = html.match(/<div id="support-modal" class="([^"]*)"([^>]*)>/);
    assert.ok(modal, 'popup exists');
    assert.ok(modal[1].includes('web-only') && modal[1].includes('hidden'), 'Web only and hidden from the start');
    assert.ok(modal[2].includes('onclick="if (event.target === this) app.closeSupportModal()"'), 'click outside closes');
    assert.equal((html.match(/onclick="app\.closeSupportModal\(\)"/g) || []).length, 2, 'X button and CLOSE button');
    assert.match(html, /aria-label="Close"/);
    assert.ok(html.includes('role="dialog"'));

    // Escape key, "close everything" list and click-sound list all know the popup
    assert.equal((main.match(/'promo-modal', 'start-promo-modal', 'support-modal'/g) || []).length, 2, 'Escape list and close-all list');
    assert.ok(main.includes("'#start-promo-modal', '#support-modal'"));

    // Opens only on a click, only on Web, never from a timer or promo path
    assert.match(main, /showSupportModal: \(\) => \{\s*if \(!GameConfig\.isWeb\) return;/);
    const calls = [...main.matchAll(/showSupportModal\(/g)].length;
    assert.equal(calls, 0, 'nothing in main.js calls showSupportModal (it is only defined there)');
    assert.equal([...html.matchAll(/showSupportModal\(\)/g)].length, 1, 'only the Support button opens it');
    assert.ok(!/setTimeout\([^)]*showSupportModal/.test(main), 'no timer opens it');

    // External links: new tab, safe
    assert.match(main, /link\.target = '_blank';\s*link\.rel = 'noopener noreferrer';/);
    assert.ok(main.includes('link.href = offer.href;'), 'uses the tracked link from the data file');
    // Cards are built with textContent (no HTML injection from the data file) and scaled with the window
    assert.ok(main.includes('heading.textContent = offer.heading;'));
    assert.match(main, /if \(GameConfig\.isWeb\) \{\s*const supportInner = document\.getElementById\('support-inner'\);/);

    // The popup is built from the data file only
    assert.ok(main.includes("import { SUPPORT_US, getVisibleSupportOffers } from './support_links.js';"));
    assert.ok(main.includes('SUPPORT_US.title') && main.includes('getVisibleSupportOffers()'));
    assert.ok(!/backhansgames\.com|kickstarter\.com/.test(main.replace(/\/\/[^\n]*/g, '')), 'no link is written into main.js');
    assert.ok(!/backhansgames\.com\/|kickstarter\.com\/projects/.test(html.slice(html.indexOf('id="support-modal"'), html.indexOf('START PROMO MODAL'))), 'no link in the popup markup');
    console.log('✓ Test 37 Passed: popup is Web-only, opens only on click, closes four ways, links open in a new tab from the data file.');
}

// Test 38: Support Us banner photo, close button readable on white, badge is plain text (not a button look)
{
    // The banner file: 2560x900 WebP, light enough for a popup
    const b = fs.readFileSync(path.join(root, 'public/assets/board_game_support_us.webp'));
    assert.equal(b.toString('ascii', 8, 12), 'WEBP');
    const kind = b.toString('ascii', 12, 16);
    let w, h;
    if (kind === 'VP8X') { w = 1 + b.readUIntLE(24, 3); h = 1 + b.readUIntLE(27, 3); }
    else if (kind === 'VP8L') { const v = b.readUInt32LE(21); w = 1 + (v & 0x3fff); h = 1 + ((v >> 14) & 0x3fff); }
    else { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
    assert.deepEqual([w, h], [2560, 900], `banner is ${w}x${h}`);
    assert.ok(b.length < 500 * 1024, 'banner stays under 500 KB');

    const html = read('index.html');
    const main = read('js/main.js');
    const popup = html.slice(html.indexOf('id="support-modal"'), html.indexOf('START PROMO MODAL'));

    // Banner markup: first thing in the panel, edge to edge, reserved height, no src (so nothing downloads early)
    const img = popup.match(/<img id="support-banner"[^>]*>/);
    assert.ok(img, 'banner element exists');
    assert.ok(!/\ssrc=/.test(img[0]), 'no src in the markup');
    assert.ok(img[0].includes('aspect-[2560/900]') && img[0].includes('w-[2000px]') && img[0].includes('-mt-16'), 'full popup width, reserved height, no gap above');
    assert.ok(img[0].includes('alt="'), 'has alt text');
    assert.ok(popup.indexOf('id="support-banner"') < popup.indexOf('aria-label="Close"'), 'banner comes before the close button');
    assert.match(popup, /id="support-inner" class="[^"]*overflow-hidden/, 'banner is clipped to the rounded corners');
    // Close button has a dark circle so it stays visible on the white photo
    assert.match(popup, /aria-label="Close" class="[^"]*bg-\[#26385C\]\/90[^"]*border-white\/60/);

    // Loading: Web only, on hover/touch of the button or when opened; never mentioned in the Steam-shared markup
    assert.match(main, /preloadSupportBanner: \(\) => \{\s*if \(!GameConfig\.isWeb\) return;/);
    assert.ok(main.includes("banner.src = new URL(/* @vite-ignore */ '../assets/board_game_support_us.webp', import.meta.url).href;"));
    assert.match(main, /if \(!modal \|\| !list\) return;\s*app\.preloadSupportBanner\(\);/, 'opening the popup loads the banner');
    assert.match(html, /id="v3-support-btn" onclick="app\.showSupportModal\(\)" onmouseenter="app\.preloadSupportBanner\(\)" ontouchstart="app\.preloadSupportBanner\(\)"/);
    assert.ok(!html.includes('board_game_support_us.webp'), 'index.html (shared with Steam) never requests the picture');
    assert.ok(!read('index.css').includes('board_game_support_us'), 'no CSS reference either');

    // Badge: colored text only, no filled pill / rounded shape that would look like a second button
    const badgeCode = main.slice(main.indexOf("const badge = document.createElement('div');"), main.indexOf('card.appendChild(badge);'));
    assert.ok(badgeCode.length > 50, 'badge code found');
    assert.ok(!/backgroundColor|rounded|bg-|px-8|border/.test(badgeCode), 'no background, rounding, padding or border on the badge');
    assert.ok(badgeCode.includes('badge.style.color = offer.accent;'));
    console.log('✓ Test 38 Passed: 2560x900 banner on top (loaded on demand), readable close button, badge is plain text.');
}

console.log('\nALL WEB EDITION REGRESSION TESTS PASSED.');
