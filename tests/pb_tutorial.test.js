// Palm Beach steps 2.2 and 2.3: the tutorial engine and the four chapters.
// Source: PLAN.md steps 2.2-2.3; TUTORIAL_SCRIPT.md (the approved script); docs/palm_beach/rules-palm-beach.md.
import fs from 'node:fs';
import { assert, R, check } from './pb_helpers.js';
import { TUTORIAL_LESSONS, getLesson, nextLesson } from '../js/pb/tutorial_lessons.js';
import { createLessonGame, createLessonGuide, playLesson, requestTypeOf } from '../js/pb/tutorial_engine.js';
import { bidChoices, diamondTradeMessage } from '../js/pb/messages.js';
import { chapterLines, CHAPTER_LIST_TEXT } from '../js/pb/tutorial_menu.js';
import { tutorBubblePosition, CANVAS } from '../js/pb/layout.js';

console.log('Palm Beach: the tutorial engine\n');

/** A screen that clicks NEXT at once and notes what it was asked to show. */
function fakeScreen(log = []) {
    return {
        log,
        say: async (step) => { log.push(['SAY', step.id]); },
        prompt: (step, answer) => { log.push(['PROMPT', step.id, answer]); },
        show: (step) => { log.push(['SHOW', step.id]); },
        pause: async () => {},
        clear: () => {},
        choose: async (step) => { log.push(['CHOOSE', step.id]); return step.buttons[0].value; }
    };
}

/** Plays a lesson to its end and returns the game, the events and what the screen showed. */
async function run(lessonId, { change = (l) => l } = {}) {
    const lesson = change(structuredClone(getLesson(lessonId)));
    const pb = createLessonGame(lesson);
    const screen = fakeScreen();
    const events = [];
    const asked = [];
    const guide = createLessonGuide(lesson, screen);
    const askOnScreen = async (request) => { asked.push(request); return true; };
    await playLesson(pb, guide, askOnScreen, { emit: (e) => { events.push(e); screen.log.push(['EVENT', e.type]); } });
    return { pb, game: pb.game, events, asked, screen, guide, lesson };
}

const holdings = (game) => game.players.map(p => ({ gold: p.gold, rerolls: p.rerolls, diamonds: p.diamonds, prestige: R.prestigePoints ? R.prestigePoints(p) : undefined }));

await check('A lesson starts from a fixed table: the same cards, gold and dice every time', () => {
    const a = createLessonGame(getLesson('flip-cards')).game;
    const b = createLessonGame(getLesson('flip-cards')).game;
    assert.deepEqual(a, b, 'two learners get exactly the same table');
    assert.deepEqual(a.players.map(p => [p.name, p.characterId, p.gold, p.rerolls, p.diamonds]),
        [['Bright Shell', 'BRIGHT_SHELL', 5, 1, 0], ['Roxana', 'ROXANA', 5, 0, 0]]);
    assert.deepEqual(a.rows[0].map(c => c.bonus), [0, 0, 0, 0, 5, 0, 0, 0, 0], 'row 1: one +5 circle, no landmark');
    assert.deepEqual(a.rows[0].map(c => c.type), ['LAGOON', 'WATERFRONT', 'BLOCK', 'BLOCK', 'BLOCK', 'BLOCK', 'BLOCK', 'WATERFRONT', 'ATLANTIC']);
    assert.equal(a.luxuryByRound[0][0].card.name, 'Sports Car');
    assert.equal(a.startPlayer, 0, 'Bright Shell (30) starts before Roxana (70)');
    // Nothing is lost or doubled when the table is arranged.
    assert.equal(new Set(a.rows.flat().map(c => c.id)).size, 64);
    a.rows.forEach((row, r) => row.forEach((c, i) => assert.deepEqual([c.row, c.position], [r + 1, i])));
    const luxury = [...a.luxuryByRound.flat().map(s => s.card.id), ...a.tradePile.map(c => c.id)];
    assert.equal(new Set(luxury).size, 17);
});

await check('The fixed table can also give cards, Diamonds, the pile\'s top card and the Auction Map Card (for chapters 3 and 4)', () => {
    const { game } = createLessonGame({
        id: 'test', learner: 0, opponent: 1, dice: [], parts: [], steps: [],
        setup: {
            round: 5,
            players: [
                { name: 'A', characterId: 'BRIGHT_SHELL', gold: 12, rerolls: 0, diamonds: 3, luxury: ['Sports Car'] },
                { name: 'B', characterId: 'ROXANA', gold: 10, diamonds: 1, luxury: ['Hotel'] }
            ],
            tradeTop: 'Tiger',
            luxury: { 5: 'Wine' },
            auctionMap: 'SPANISH_RIVER'
        }
    });
    assert.deepEqual(game.players.map(p => [p.gold, p.rerolls, p.diamonds, p.luxuryCards.map(c => c.name)]),
        [[12, 0, 3, ['Sports Car']], [10, 0, 1, ['Hotel']]]);
    assert.equal(game.tradePile.at(-1).name, 'Tiger', 'the next Diamond trade gives the Tiger');
    assert.equal(game.luxuryByRound[4][0].card.name, 'Wine');
    assert.equal(game.auctionMapCard.propertyId, 'SPANISH_RIVER');
    assert.ok(game.rows.slice(0, 4).flat().every(c => c.faceUp) && game.rows[4].every(c => !c.faceUp), 'rows 1-4 are played, row 5 is not');
    assert.ok(game.luxuryByRound.slice(0, 4).flat().every(s => s.sold) && !game.luxuryByRound[4][0].sold);
    const everywhere = [...game.players.flatMap(p => p.luxuryCards), ...game.luxuryByRound.flat().map(s => s.card), ...game.tradePile];
    assert.equal(new Set(everywhere.map(c => c.id)).size, 17, 'no Luxury Card is in two places');
    assert.equal(game.startPlayer, 0, 'round 5: Bright Shell 20, Roxana 95');
});

await check('Chapter 1 can be played to the end with the real rules, and ends exactly as the script says', async () => {
    const { game, events, pb, guide, lesson } = await run('flip-cards');
    assert.equal(guide.stepsDone(), lesson.steps.length, 'every step was used');
    assert.equal(pb.rng.rollsLeft(), 0, 'every fixed die was rolled');
    assert.ok(game.rows[0].every(c => c.faceUp), 'the whole row is face up');
    assert.deepEqual(game.players.map(p => [p.gold, p.rerolls, p.diamonds]), [[27, 0, 1], [22, 0, 1]], 'You 27 Au, Roxana 22 Au, one Diamond each');
    // The moments the script describes.
    const rolls = events.filter(e => e.type === 'ROLL' || e.type === 'REROLL').map(e => [e.type, e.playerId, e.roll, e.success]);
    assert.deepEqual(rolls, [['ROLL', 1, 5, true], ['ROLL', 0, 2, false], ['REROLL', 0, 5, true]]);
    const flips = events.filter(e => e.type === 'CARD_FLIPPED').map(e => [e.playerId, e.cardType, e.reward.gold, e.reward.diamonds]);
    assert.deepEqual(flips, [
        [0, 'BLOCK', 3, 0],            // 1.4
        [1, 'ATLANTIC', 11, 0],        // 1.5-1.6: 6 Au + Roxana's 5 Au
        [0, 'LAGOON', 8, 0],           // 1.7-1.8
        [1, 'BLOCK', 3, 0],            // 1.10
        [0, 'BLOCK', 8, 0],            // 1.11: 3 Au + the yellow circle
        [1, 'WATERFRONT', 0, 1],       // 1.12
        [0, 'WATERFRONT', 0, 1],       // 1.13
        [1, 'BLOCK', 3, 0],            // 1.14
        [0, 'BLOCK', 3, 0]             // 1.15
    ]);
    assert.equal(events.at(-1).type, 'FLIPPING_DONE');
});

await check('Chapter 2 starts where chapter 1 ends, and the learner wins the Sports Car for 9 Au', async () => {
    const one = await run('flip-cards');
    const two = createLessonGame(getLesson('luxury-auction')).game;
    assert.deepEqual(holdings(two), holdings(one.game), 'the same gold, re-rolls and Diamonds');
    assert.deepEqual(two.rows[0].map(c => [c.id, c.faceUp]), one.game.rows[0].map(c => [c.id, c.faceUp]), 'the same row, face up');
    assert.equal(nextLesson('flip-cards').id, 'luxury-auction');

    const { game, events } = await run('luxury-auction');
    const bids = events.filter(e => e.type === 'BID' || e.type === 'PASS').map(e => [e.type, e.playerId, e.amount]);
    assert.deepEqual(bids, [['BID', 0, 1], ['BID', 1, 4], ['BID', 0, 7], ['BID', 1, 8], ['BID', 0, 9], ['PASS', 1, undefined]]);
    assert.deepEqual(game.players.map(p => [p.gold, p.luxuryCards.map(c => c.name)]), [[18, ['Sports Car']], [22, []]]);
    assert.equal(game.players[0].luxuryCards[0].points, 2);
});

await check('Chapter 3: the fourth Diamond is traded for the Tiger, which gives 2 re-rolls', async () => {
    const { game, events, guide, lesson } = await run('diamonds');
    assert.equal(guide.stepsDone(), lesson.steps.length);
    const trade = events.find(e => e.type === 'DIAMOND_TRADE');
    assert.deepEqual([trade.playerId, trade.card.name, trade.cost, trade.rerollsGained], [0, 'Tiger', 4, 2]);
    const you = game.players[0];
    assert.deepEqual([you.diamonds, you.rerolls, you.gold, you.luxuryCards.map(c => c.name)], [0, 2, 12, ['Sports Car', 'Tiger']]);
    assert.equal(you.luxuryCards.reduce((sum, c) => sum + c.points, 0), 3, '3 Prestige Points');
    assert.equal(game.rows[4].filter(c => c.faceUp).length, 1, 'the chapter is one turn long');
});

await check('Chapter 4: the last round, the Property Auction and the final scoring end as the script says (5 against 4)', async () => {
    const start = createLessonGame(getLesson('the-ending')).game;
    const points = (p) => p.luxuryCards.reduce((sum, c) => sum + c.points, 0) + (p.property ? p.property.points : 0);
    assert.deepEqual(start.players.map(points), [3, 3], 'both start the chapter with 3 Prestige Points');
    assert.deepEqual(start.players.map(p => [p.gold, p.rerolls]), [[14, 2], [9, 0]]);

    const { game, events, screen, pb } = await run('the-ending');
    const rolls = events.filter(e => e.type === 'ROLL' || e.type === 'REROLL').map(e => [e.type, e.roll, e.success]);
    assert.deepEqual(rolls, [['ROLL', 4, true], ['ROLL', 3, false], ['REROLL', 6, true]]);
    const auction = events.filter(e => ['BID', 'PASS', 'AUCTION_WON', 'CHARACTER_GOLD', 'AUCTION_MAP_FLIPPED'].includes(e.type))
        .map(e => [e.type, e.playerId ?? e.propertyId, e.amount ?? e.price ?? e.gold ?? (e.forced === undefined ? undefined : e.forced)]);
    assert.deepEqual(auction, [
        ['PASS', 0, false], ['BID', 1, 1], ['AUCTION_WON', 1, 1],                       // 4.9: the Shoes
        ['AUCTION_MAP_FLIPPED', 'SPANISH_RIVER', undefined], ['CHARACTER_GOLD', 1, 10],  // 4.10-4.11
        ['BID', 0, 5], ['BID', 1, 10], ['BID', 0, 15], ['BID', 1, 20], ['BID', 0, 21],
        ['PASS', 1, true],                                                               // 4.14: Roxana cannot afford 22
        ['AUCTION_WON', 0, 21]
    ]);
    assert.deepEqual(game.players.map(p => [points(p), p.gold]), [[5, 7], [4, 21]]);
    assert.deepEqual(game.result.winners, [0]);
    assert.equal(game.result.decidedBy, 'POINTS');
    assert.equal(pb.choice, 'PLAY', 'the last bubble has buttons');
    // Bubbles that belong to a moment come right after that moment, before the auction window opens.
    const order = screen.log.map(l => l[1]);
    assert.ok(order.indexOf('AUCTION_MAP_FLIPPED') < order.indexOf('4.10') && order.indexOf('4.10') < order.indexOf('CHARACTER_GOLD'));
    assert.ok(order.indexOf('CHARACTER_GOLD') < order.indexOf('4.11') && order.indexOf('4.11') < order.lastIndexOf('AUCTION_START'));
    assert.ok(order.indexOf('GAME_OVER') < order.indexOf('4.15'));
    assert.deepEqual(screen.log.at(-1), ['CHOOSE', '4.17']);
});

await check('The four chapters follow each other, and what the learner holds never jumps backwards', () => {
    assert.deepEqual(TUTORIAL_LESSONS.map(l => [l.chapter, l.id]), [[1, 'flip-cards'], [2, 'luxury-auction'], [3, 'diamonds'], [4, 'the-ending']]);
    assert.equal(nextLesson('the-ending'), null);
    const cards = (id) => createLessonGame(getLesson(id)).game.players.map(p => p.luxuryCards.map(c => c.name));
    assert.deepEqual(cards('diamonds'), [['Sports Car'], ['Hotel']], 'chapter 3 starts with the Sports Car won in chapter 2');
    assert.deepEqual(cards('the-ending'), [['Sports Car', 'Tiger'], ['Hotel']], 'chapter 4 starts with the Tiger from chapter 3');
    // No landmark popup interrupts a lesson: the rows that are played have plain cards, except the one +5 circle.
    for (const lesson of TUTORIAL_LESSONS) {
        const game = createLessonGame(lesson).game;
        assert.ok(game.rows[lesson.setup.round - 1].every(c => c.bonus === 0 || c.bonus === 5), lesson.id);
    }
});

await check('The learner is only ever asked for one thing, and it is a thing the screen really offers', async () => {
    for (const lesson of TUTORIAL_LESSONS) {
        const { asked, screen, game } = await run(lesson.id);
        const prompts = screen.log.filter(l => l[0] === 'PROMPT');
        assert.equal(asked.length, prompts.length, `${lesson.id}: one bubble for every click`);
        asked.forEach((request, i) => {
            assert.equal(request.playerId, lesson.learner, 'the screen never waits for Roxana');
            const answer = prompts[i][2];
            if (request.type === 'BID' && answer.action === 'BID') {
                const button = bidChoices(request).find(c => c.amount === answer.amount);
                assert.ok(button && button.enabled, `${lesson.id} ${prompts[i][1]}: there is a button for ${answer.amount} Au`);
            }
            if (request.type === 'CHOOSE_CARD') assert.ok(request.options.includes(answer));
        });
        assert.ok(game, lesson.id);
    }
});

await check('A script that breaks the rules or drifts from the game is caught, not played', async () => {
    // Roxana cannot bid less than the highest bid.
    await assert.rejects(run('luxury-auction', { change: (l) => { l.steps.find(s => s.id === '2.2b').do.bid = 1; return l; } }), /2\.2b: a bid of 1 Au is not allowed/);
    // The learner cannot bid more gold than they have.
    await assert.rejects(run('luxury-auction', { change: (l) => { l.steps.find(s => s.id === '2.4').do.bid = 40; return l; } }), /2\.4: a bid of 40 Au is not allowed/);
    // A card cannot be flipped twice.
    await assert.rejects(run('flip-cards', { change: (l) => { l.steps.find(s => s.id === '1.10').do.card = 2; return l; } }), /1\.10: card 2 of row 1 cannot be flipped/);
    // A step for the wrong player.
    await assert.rejects(run('flip-cards', { change: (l) => { l.steps.find(s => s.id === '1.5').who = 'YOU'; return l; } }), /out of step at 1\.5/);
    // A missing step: the game still has a question, the script has nothing left.
    await assert.rejects(run('flip-cards', { change: (l) => { l.steps.pop(); return l; } }), /out of step at the end/);
    // An extra step, or a die that is never rolled.
    await assert.rejects(run('luxury-auction', { change: (l) => { l.steps.push({ id: '9.9', who: 'YOU', do: { pass: true } }); return l; } }), /ended before step 9\.9/);
    await assert.rejects(run('luxury-auction', { change: (l) => { l.dice = [6]; return l; } }), /1 of the fixed dice were never rolled/);
});

await check('The bubble texts are the ones in TUTORIAL_SCRIPT.md, word for word', () => {
    const script = fs.readFileSync('TUTORIAL_SCRIPT.md', 'utf8');
    const rows = new Map();
    for (const line of script.split('\n')) {
        const m = line.match(/^\| (\d+\.\d+) \| (.*?) \|/);
        if (m) rows.set(m[1], m[2]);
    }
    const notes = [...script.matchAll(/\*\*Board game rule \(shown with (\d+\.\d+)\):\*\* (.+)/g)].map(m => [m[1], m[2].trim()]);
    let compared = 0;
    for (const lesson of TUTORIAL_LESSONS) {
        for (const step of lesson.steps) {
            if (!rows.has(step.id)) { assert.ok(/b$/.test(step.id) && step.who === 'OPPONENT' && !step.text, `${step.id} is not in the script`); continue; }
            const written = rows.get(step.id);
            if (written === '(no bubble)') assert.equal(step.text, undefined, step.id);
            else if (written.startsWith("(the game's own popup) ")) {
                // The text is the game's own Diamond trade popup; the bubble only carries the board game rule.
                assert.equal(step.text, undefined, step.id);
                assert.equal(diamondTradeMessage({ cost: 4 }).text, written.replace("(the game's own popup) ", ''));
            }
            else assert.equal(step.text, written, `step ${step.id}`);
            compared += 1;
        }
        for (const [id, text] of notes.filter(([id]) => id.startsWith(`${lesson.chapter}.`))) {
            assert.equal(lesson.steps.find(s => s.id === id).note, text, `Board game rule at ${id}`);
        }
        const inScript = [...rows.keys()].filter(id => id.startsWith(`${lesson.chapter}.`));
        assert.deepEqual(lesson.steps.map(s => s.id).filter(id => rows.has(id)), inScript, `chapter ${lesson.chapter}: every step of the script, in order`);
    }
    assert.equal(compared, 15 + 8 + 5 + 17, 'all four chapters');
    assert.ok(TUTORIAL_LESSONS.every(l => l.steps.every(s => (s.who === 'SAY' || s.who === 'END') ? !s.do : !!requestTypeOf(s))));
});

await check('The bubble stands beside the thing it points at, and never leaves the table', () => {
    const size = { width: 900, height: 420 };
    const inside = (b) => b.left >= 0 && b.top >= 0 && b.left + size.width <= CANVAS.width && b.top + size.height <= CANVAS.height;
    const apart = (b, t) => b.left + size.width <= t.left || b.left >= t.left + t.width || b.top + size.height <= t.top || b.top >= t.top + t.height;
    const targets = [
        { left: 1150, top: 80, width: 250, height: 250 },        // first card of row 1
        { left: 3150, top: 80, width: 250, height: 250 },        // last card of row 1
        { left: 3490, top: 1830, width: 250, height: 250 },      // Luxury Card beside row 8
        { left: 0, top: 130, width: 265, height: 1900 },         // a player panel
        { left: 1150, top: 80, width: 2250, height: 250 },       // a whole row
        { left: 1700, top: 1900, width: 420, height: 110 },      // a button near the bottom
        { left: 1400, top: 300, width: 1700, height: 1500 }      // the auction window
    ];
    for (const t of targets) {
        const b = tutorBubblePosition(t, size);
        assert.ok(inside(b), `inside the table: ${JSON.stringify(t)}`);
        assert.ok(apart(b, t), `does not cover its target: ${JSON.stringify(t)}`);
    }
    // A step may ask for a side (2.8: to the right of the Prestige Points, so the won card stays in view).
    const stat = { left: 20, top: 700, width: 265, height: 50 };
    assert.equal(tutorBubblePosition(stat, size).side, 'below');
    assert.equal(tutorBubblePosition(stat, size, 'right').side, 'right');
    const noTarget = tutorBubblePosition(null, size);
    assert.ok(inside(noTarget));
    assert.equal(noTarget.left, Math.round((CANVAS.width - size.width) / 2), 'no target: centred');
});

await check('The tutorial uses the game through the match\'s one "ask the player" point; a normal match is unchanged', () => {
    const match = fs.readFileSync('js/pb/match.js', 'utf8');
    assert.match(match, /play = playGame, guide = null/);
    assert.match(match, /if \(!guide\) return askOnScreen\(request\);/);
    const engine = fs.readFileSync('js/pb/tutorial_engine.js', 'utf8');
    assert.ok(!/document\.|window\./.test(engine), 'the tutorial engine has no screen code');
    assert.ok(!/minRoll|START_GOLD|gold \+=|gold -=/.test(engine), 'and copies no rule');
});

await check('The way in and the way out: two choices on the start screen, TUTORIAL on the party menu, a choice at the end', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    // Lars, 25 Nov 2026 (option A): the start screen offers LEARN TO PLAY and PLAY.
    assert.match(html, /<button id="splash-learn-btn"[^>]*window\.app\.startPalmBeachTutorial\(\)">LEARN TO PLAY<span>5 minutes<\/span><\/button>/);
    assert.match(html, /<button id="splash-play-btn"[^>]*window\.app\.enterGame\(\)">PLAY</);
    assert.ok(!html.includes('START GAME\n    </button>'), 'the single START GAME button is replaced');
    // The party menu keeps a way in: it opens the chapter list.
    assert.match(html, /<div id="pb-tutorial-btn" onclick="app\.openPalmBeachChapters\(\)"[^>]*>TUTORIAL<\/div>/);
    assert.deepEqual(chapterLines().map(l => `${l.number} ${l.title}`), ['1 FLIP CARDS', '2 THE LUXURY AUCTION', '3 DIAMONDS', '4 THE ENDING']);
    assert.ok(CHAPTER_LIST_TEXT.intro.length > 20);
    const main = fs.readFileSync('js/main.js', 'utf8');
    assert.match(main, /startPalmBeachTutorial: \(lessonId\) => \{[\s\S]{0,400}enterPalmBeachTutorial\(lessonId\);/);
    // The Boca tutorial (Boca rules, Boca board) stays hidden.
    const css = fs.readFileSync('index.css', 'utf8');
    assert.match(css, /#v3-tutorial-btn,\s*#v3-tutorial-btn \+ div\s*\{\s*display:\s*none\s*!important/);
    // The end: PLAY A REAL GAME or CHAPTERS; leaving in the middle takes the bubble away.
    const last = getLesson('the-ending').steps.at(-1);
    assert.deepEqual(last.buttons.map(b => b.label), ['PLAY A REAL GAME', 'CHAPTERS']);
    const game = fs.readFileSync('js/game.js', 'utf8');
    assert.match(game, /if \(next\) \{ startPalmBeachLesson\(next\.id\); return; \}\s*leavePalmBeachTable\(false\);/);
    assert.match(game, /if \(state\.pb && state\.pb\.closeTutorial\) state\.pb\.closeTutorial\(\);\s*leavePalmBeachMatch\(\);\s*state\.pb = null;/);
    // In the tutorial the final scoring has no PLAY AGAIN button: the lesson's own bubble ends it.
    assert.match(fs.readFileSync('js/pb/match.js', 'utf8'), /if \(guide\) \{ showFinalScreen\(game, \{ buttons: false \}\); break; \}/);
});

console.log('\nAll tutorial checks passed.');
