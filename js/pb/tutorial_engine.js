// Palm Beach tutorial engine (step 2.2). No screen code: the tests run every lesson with this file alone.
//
// A lesson (js/pb/tutorial_lessons.js) is three things:
//   1. a fixed table ("setup"): who plays, which cards lie where, how much gold everyone has;
//   2. fixed dice ("dice"): every roll is decided in advance;
//   3. a script ("steps"): what the bubble says, what the learner must click, what the opponent does.
//
// The real rules engine (js/rules/engine.js) plays the lesson. It asks its questions through the same
// "ask the player" point as a normal match. Here a GUIDE answers them from the script, so no rule is copied:
// if the script asks for something the rules do not allow, the lesson stops with an error (and its test fails).

import { createGame } from '../rules/setup.js';
import { createRng, createScriptedRng } from '../rules/rng.js';
import { AUCTION_MAP_CARDS, ROUNDS } from '../rules/data.js';
import { startPlayerForRound } from '../rules/initiative.js';
import { giveLuxuryCard } from '../rules/diamonds.js';
import { startRound, playFlippingPhase, playFlipTurn, playLuxuryAuctions, playPropertyAuction, endGame } from '../rules/engine.js';

// ---- 1. The fixed table --------------------------------------------------------------------------------

/**
 * Builds the game a lesson starts from.
 * setup = {
 *   round,                        the round the lesson is in (earlier rows are face up, their Luxury Cards gone)
 *   rowFaceUp,                    true: the lesson's own row is already face up (a lesson that starts at the auction)
 *   players: [{ name, characterId, gold?, rerolls?, diamonds?, luxury?: [card names] }]   in seating order
 *   rowBonus: { [round]: [yellow-circle gold per position] }     which cards lie in a row (0 = a plain card)
 *   luxury: { [round]: card name }                               the Luxury Card beside a row
 *   tradeTop: card name                                          the top card of the hidden pile for Diamond trades
 *   auctionMap: property id                                      what the Auction Map Card hides
 * }
 */
export function createLessonGame(lesson) {
    const setup = lesson.setup;
    const game = createGame({ players: setup.players.map(p => ({ name: p.name, characterId: p.characterId })), rng: createRng(1) });

    // Map Cards: put the wanted cards in the wanted rows, by swapping with cards of the same back in other rows.
    for (const [round, wanted] of Object.entries(setup.rowBonus || {})) {
        const row = game.rows[Number(round) - 1];
        if (wanted.length !== row.length) throw new Error(`Lesson ${lesson.id}: row ${round} has ${row.length} cards, the setup lists ${wanted.length}.`);
        wanted.forEach((bonus, position) => {
            const here = row[position];
            if (here.bonus === bonus) return;
            const fixed = (card) => card.row === Number(round) && card.position < position;
            const other = game.rows.flat().find(c => c.deck === here.deck && c.bonus === bonus && !fixed(c) && c !== here);
            if (!other) throw new Error(`Lesson ${lesson.id}: no ${here.deck} card with +${bonus} is left for row ${round}.`);
            swapPlaces(game, here, other);
        });
    }
    for (const row of game.rows) {
        const round = row[0].row;
        if (round < setup.round || (round === setup.round && setup.rowFaceUp)) row.forEach(card => { card.faceUp = true; });
    }

    // Luxury Cards: the ones the players already own, the ones beside the rows, and the hidden pile.
    const slots = game.luxuryByRound.flat();
    const pool = [...slots.map(s => s.card), ...game.tradePile];
    const take = (name) => {
        const index = pool.findIndex(c => c.name === name);
        if (index < 0) throw new Error(`Lesson ${lesson.id}: the Luxury Card "${name}" is used twice or does not exist.`);
        return pool.splice(index, 1)[0];
    };
    setup.players.forEach((p, seat) => {
        for (const name of p.luxury || []) giveLuxuryCard(game.players[seat], take(name), 'AUCTION');
    });
    const beside = {};
    for (const [round, name] of Object.entries(setup.luxury || {})) beside[round] = take(name);
    const top = setup.tradeTop ? take(setup.tradeTop) : null;
    for (const slot of slots) {
        const first = slot.slotId.endsWith('-1');
        slot.card = (first && beside[slot.round]) || pool.shift();
        slot.sold = slot.round < setup.round;        // earlier rounds: already auctioned
        slot.faceUp = false;
    }
    game.tradePile = top ? [...pool, top] : pool;     // the top card is the last one (see tradeDiamonds)
    if (game.tradePile.length < 1) throw new Error(`Lesson ${lesson.id}: the hidden Luxury pile is empty.`);

    if (setup.auctionMap) {
        const card = AUCTION_MAP_CARDS.find(c => c.propertyId === setup.auctionMap);
        if (!card) throw new Error(`Lesson ${lesson.id}: unknown property ${setup.auctionMap}.`);
        game.auctionMapCard = { ...card, faceUp: false };
    }

    // What the players hold at the start of the lesson.
    setup.players.forEach((p, seat) => {
        const player = game.players[seat];
        for (const key of ['gold', 'rerolls', 'diamonds']) if (p[key] !== undefined) player[key] = p[key];
    });

    if (setup.round < 1 || setup.round > ROUNDS) throw new Error(`Lesson ${lesson.id}: round ${setup.round}?`);
    game.round = setup.round;
    game.startPlayer = startPlayerForRound(game, setup.round);
    game.phase = setup.rowFaceUp ? 'LUXURY_AUCTION' : 'FLIPPING';

    const rng = createScriptedRng(lesson.dice || [], 1);
    return { game, rng, lesson, isTutorial: true };
}

function swapPlaces(game, a, b) {
    const rowA = game.rows[a.row - 1];
    const rowB = game.rows[b.row - 1];
    const [posA, posB] = [a.position, b.position];
    rowA[posA] = b;
    rowB[posB] = a;
    [a.row, b.row] = [b.row, a.row];
    a.position = posB;
    b.position = posA;
}

// ---- 2. Playing the lesson's part of the game -----------------------------------------------------------

/**
 * Plays the parts of a game this lesson is about, with the real rules.
 * lesson.parts lists them in order: START_ROUND, FLIPPING (the whole row), FLIP_TURN (one turn of the start
 * player), LUXURY_AUCTIONS, PROPERTY_AUCTION, END_GAME.
 */
export async function playLessonParts(pb, askPlayer, { emit = () => {} } = {}) {
    const { game, rng, lesson } = pb;
    const ctx = { game, askPlayer, rng, emit };
    for (const part of lesson.parts) {
        switch (part) {
            case 'START_ROUND': await startRound(ctx, game.round); break;
            case 'FLIPPING': await playFlippingPhase(ctx); break;
            case 'FLIP_TURN':
                game.phase = 'FLIPPING';
                game.currentPlayer = game.startPlayer;
                await playFlipTurn(ctx, game.players[game.startPlayer]);
                break;
            case 'LUXURY_AUCTIONS':
                await playLuxuryAuctions(ctx);
                await emit({ type: 'ROUND_END', round: game.round }, game);
                break;
            case 'PROPERTY_AUCTION': await playPropertyAuction(ctx); break;
            case 'END_GAME': await endGame(ctx); break;
            default: throw new Error(`Lesson ${lesson.id}: unknown part "${part}".`);
        }
    }
    return game;
}

// ---- 3. The guide: follows the script ---------------------------------------------------------------------

/** Which question of the rules engine a script step answers. */
export function requestTypeOf(step) {
    const d = step.do || {};
    if (d.card !== undefined) return 'CHOOSE_CARD';
    if (d.reroll !== undefined) return 'REROLL';
    if (d.ok !== undefined) return 'DIAMOND_TRADE';
    if (d.bid !== undefined || d.pass !== undefined) return 'BID';
    return null;
}

/** The answer the rules engine gets for a step. A card is given by its position in the row (0 = the Lagoon card). */
export function answerOf(step, request, game) {
    const d = step.do;
    switch (request.type) {
        case 'CHOOSE_CARD': {
            const card = game.rows[game.round - 1][d.card];
            if (!card || !request.options.includes(card.id)) throw new Error(`Tutorial step ${step.id}: card ${d.card} of row ${game.round} cannot be flipped now.`);
            return card.id;
        }
        case 'REROLL': return !!d.reroll;
        case 'DIAMOND_TRADE': return true;
        case 'BID':
            if (d.pass) return { action: 'PASS' };
            if (d.bid < request.minBid || d.bid > request.maxBid) throw new Error(`Tutorial step ${step.id}: a bid of ${d.bid} Au is not allowed now (${request.minBid}-${request.maxBid}).`);
            return { action: 'BID', amount: d.bid };
        default: throw new Error(`Tutorial step ${step.id}: the game asked "${request.type}".`);
    }
}

/**
 * Creates the guide for one lesson.
 * @param {object} lesson
 * @param {object} screen  what the guide needs from the screen (js/pb/tutorial_view.js; the tests give a fake one):
 *   say(step, game)          shows a bubble with a NEXT button; resolves when the learner clicks it
 *   prompt(step, answer, game)  shows a bubble and lets the learner click only the thing the step is about
 *   show(step, game)         shows a bubble while the opponent plays (no click)
 *   pause(ms)                a short wait, so the learner can follow the opponent
 *   choose(step, game)       the last bubble, with the step's buttons; resolves with the chosen button's value
 *   clear()                  takes the bubble away
 */
export function createLessonGuide(lesson, screen) {
    let index = 0;
    const steps = lesson.steps;
    const outOfStep = (step, request) => new Error(
        `Tutorial ${lesson.id} is out of step at ${step ? step.id : 'the end'}: the script ${step ? `expects ${step.who} to answer ${requestTypeOf(step)}` : 'has no more steps'}, `
        + `but the game asked player ${request.playerId} for ${request.type}.`);

    // Bubbles with a NEXT button. A bubble marked "on: EVENT" belongs right after that event (see onEvent);
    // if its event did not come, it is shown at the next question instead, so no text is ever lost.
    async function sayAll(game) {
        while (index < steps.length && steps[index].who === 'SAY') {
            const step = steps[index++];
            await screen.say(step, game);
        }
    }

    return {
        /** Answers one question of the rules engine. askOnScreen(request) waits for the learner's click. */
        async ask(request, game, askOnScreen) {
            await sayAll(game);
            const step = steps[index];
            const seat = step && (step.who === 'YOU' ? lesson.learner : lesson.opponent);
            if (!step || requestTypeOf(step) !== request.type || seat !== request.playerId) throw outOfStep(step, request);
            index += 1;
            const answer = answerOf(step, request, game);
            if (step.who === 'YOU') {
                const clicked = askOnScreen(request);       // the game's own cards, buttons and popups
                screen.prompt(step, answer, game);          // ... of which only the right one can be clicked
                await clicked;
                screen.clear();
            } else {
                if (step.text) screen.show(step, game);
                await screen.pause(step.text ? 2400 : 900);
            }
            return answer;
        },
        /** Called after the screen has shown an event: shows the bubbles that belong to that moment. */
        async onEvent(event, game) {
            while (index < steps.length && steps[index].who === 'SAY' && steps[index].on === event.type) {
                const step = steps[index++];
                await screen.say(step, game);
            }
        },
        /**
         * After the last part of the game: the closing bubbles. Returns the learner's choice if the lesson
         * ends with buttons (who: 'END'), otherwise null.
         */
        async finish(game) {
            await sayAll(game);
            let choice = null;
            if (index < steps.length && steps[index].who === 'END') choice = await screen.choose(steps[index++], game);
            screen.clear();
            if (index < steps.length) throw new Error(`Tutorial ${lesson.id} ended before step ${steps[index].id}.`);
            return choice;
        },
        stepsDone: () => index
    };
}

/**
 * Plays a whole lesson: the guide answers, the rules engine plays. Used by the screen (through js/pb/match.js)
 * and by the tests.
 */
export async function playLesson(pb, guide, askOnScreen = async () => true, { emit = () => {} } = {}) {
    const askPlayer = (request, game) => guide.ask(request, game, askOnScreen);
    const emitAndGuide = async (event, game) => { await emit(event, game); await guide.onEvent(event, game); };
    await playLessonParts(pb, askPlayer, { emit: emitAndGuide });
    pb.choice = await guide.finish(pb.game);
    if (pb.rng.rollsLeft() > 0) throw new Error(`Tutorial ${pb.lesson.id}: ${pb.rng.rollsLeft()} of the fixed dice were never rolled.`);
    return pb.game;
}
