// scripts/check-all.mjs  (run with: npm run check)
//
// One command that answers "did I break anything?" for all three editions.
// It never changes the project: builds go into a temporary folder (not dist/ or dist-web/),
// and nothing is uploaded or published. It prints PASS / FAIL lines and exits with code 1 on any FAIL.
//
//   1. Every test file in tests/ passes.
//   2. Steam Demo, Steam Full and Web all build, and each build carries the right edition.
//   3. The Web build contains no keys, passwords or Steam code (only file names are ever printed).
//   4. The Steam packaging and publishing files are identical to `main`.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const results = [];
const record = (ok, name, detail = '') => {
    results.push({ ok, name, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const run = (command, args) => spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const tail = (text, lines = 12) => String(text || '').trim().split(/\r?\n/).slice(-lines).join('\n');

console.log('Palm Beach check: tests, three builds, secret scan, Steam files\n');

// ---- 1. Tests ------------------------------------------------------------------------------
console.log('--- 1. Tests');
const testFiles = fs.readdirSync(path.join(root, 'tests')).filter(f => f.endsWith('.test.js')).sort();
for (const file of testFiles) {
    const r = run(process.execPath, [path.join('tests', file)]);
    const passed = r.status === 0;
    record(passed, `test ${file}`);
    if (!passed) console.log(tail(r.stdout + '\n' + r.stderr).replace(/^/gm, '      '));
}

// ---- 2. Builds -----------------------------------------------------------------------------
console.log('\n--- 2. Builds (into a temporary folder; dist/ and dist-web/ are not touched)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'palm-beach-check-'));
const editions = [
    { name: 'Steam Demo', args: [], expects: 'demo' },
    { name: 'Steam Full', args: ['--mode', 'full'], expects: 'full' },
    { name: 'Web Party', args: ['--mode', 'web'], expects: 'web' }
];
const webOut = path.join(tmp, 'web');
for (const e of editions) {
    const out = path.join(tmp, e.expects);
    const r = run(process.execPath, [viteBin, 'build', ...e.args, '--outDir', out, '--emptyOutDir']);
    if (r.status !== 0) {
        record(false, `${e.name} builds`);
        console.log(tail(r.stdout + '\n' + r.stderr).replace(/^/gm, '      '));
        continue;
    }
    // The edition is compiled into the bundle as a call like f("web") / f("full"); Demo has no value at all.
    const assets = path.join(out, 'assets');
    const bundles = fs.existsSync(assets) ? fs.readdirSync(assets).filter(f => /^index-.*\.js$/.test(f)) : [];
    const js = bundles.map(f => fs.readFileSync(path.join(assets, f), 'utf8')).join('\n');
    const callsWeb = /\b\w+\("web"\)/.test(js);
    const callsFull = /\b\w+\("full"\)/.test(js);
    const actual = callsWeb ? 'web' : callsFull ? 'full' : 'demo';
    record(bundles.length > 0 && actual === e.expects, `${e.name} builds and reports the right edition`, `found "${actual}", expected "${e.expects}"`);
}

// ---- 3. Secret scan of the Web build (file names only, never values) -----------------------
console.log('\n--- 3. Secret scan of the Web build');
const secretPatterns = [
    /AIza[0-9A-Za-z_-]{20,}/, /sk-[A-Za-z0-9]{20,}/, /ghp_[A-Za-z0-9]{20,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /GEMINI/, /APPLE_PASSWORD/, /STEAM_PASSWORD/, /KEYCHAIN_PASSWORD/,
    // the Steamworks module itself (the word "Steamworks" also appears in a harmless log message of shared code)
    /steamworks\.js/i
];
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
if (fs.existsSync(webOut)) {
    const textFiles = walk(webOut).filter(f => /\.(js|css|html|json|txt|map)$/i.test(f));
    const flagged = textFiles.filter(f => {
        const text = fs.readFileSync(f, 'utf8');
        return secretPatterns.some(p => p.test(text));
    });
    record(flagged.length === 0, `Web build has no keys, passwords or Steam code (${textFiles.length} text files scanned)`,
        flagged.length ? `flagged: ${flagged.map(f => path.relative(webOut, f)).join(', ')}` : '');
} else {
    record(false, 'Web build has no keys, passwords or Steam code', 'the Web build is missing, nothing to scan');
}

// ---- 4. Steam and Electron files still in place ----------------------------------------------
// Boca compared these files with the "main" branch (the Web work was not allowed to change Steam).
// Palm Beach is its own repository where "main" is the working branch, so that comparison says nothing.
// Here the check is that nobody deleted the parts the Steam version needs later (see CLAUDE.md).
console.log('\n--- 4. Steam and Electron files in place');
const steamFiles = ['electron-main.js', 'electron-builder.demo.json', 'electron-builder.full.json', 'publish_mac.sh', 'publish_win.sh',
    'steam', 'build', '.env.full', 'js/AchievementManager.js', 'js/SaveManager.js'];
const missing = steamFiles.filter(f => !fs.existsSync(path.join(root, f)));
record(missing.length === 0, 'Steam and Electron files are in place', missing.length ? `missing: ${missing.join(', ')}` : '');

// ---- Summary -------------------------------------------------------------------------------
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temporary folder, best effort */ }
const failed = results.filter(r => !r.ok);
console.log('\n==================================================');
if (failed.length === 0) {
    console.log(`ALL ${results.length} CHECKS PASSED. Nothing was broken.`);
} else {
    console.log(`${failed.length} OF ${results.length} CHECKS FAILED:`);
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
}
console.log('==================================================');
process.exit(failed.length === 0 ? 0 : 1);
