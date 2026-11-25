// Palm Beach tutorial on screen (step 2.2): the bubble, the ring around the thing it points at, and the click lock.
// The script and the rules are elsewhere (tutorial_lessons.js, tutorial_engine.js); this file only shows and waits.
// Everything is placed with absolute pixels inside the scaled table (3840 x 2160 canvas).

import { tutorBubblePosition } from './layout.js';
import { createLessonGuide, playLessonParts } from './tutorial_engine.js';
import { runPalmBeachMatch } from './match.js';
import { renderPalmBeachTable } from './table.js';
import { renderPalmBeachPanels } from './panels.js';

const BUBBLE_WIDTH = 900;
// While a lesson runs, clicks on the game's own cards, popups and auction buttons are locked,
// except for the one thing the learner is asked to click.
const LOCKED_AREAS = '#grid-container, #pb-dialog-layer, #pb-auction-layer, #pb-luxury-column';

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/** The element a script step points at. */
export function targetSelector(point, game) {
    if (!point || point === 'table') return null;
    if (typeof point === 'object' && point.card !== undefined) return `#pb-card-${game.rows[game.round - 1][point.card].id}`;
    const [what, seat] = String(point).split(':');
    switch (what) {
        case 'row': return '#pb-row-frame';
        case 'characters': return '#left-panel-cards .pb-panel-card';
        case 'character': return `#pb-panel-${seat} .pb-panel-card`;
        case 'panel': return `#pb-panel-${seat}`;
        case 'diamonds': return `#pb-panel-${seat} .pb-panel-diamonds`;
        case 'gold': return `#pb-gold-${seat}`;
        case 'prestige': return `#pb-prestige-${seat}`;
        case 'luxury': return `.pb-luxury-card[data-round="${game.round}"]`;
        case 'auction': return '#pb-auction';
        case 'auction-card': return '#pb-auction-card';
        case 'auction-bidders': return '#pb-auction-bidders';
        case 'auction-map': return '#pb-auction-map';
        default: return null;
    }
}

/** The one thing the learner may click for this answer. */
export function clickSelector(step, answer) {
    const d = step.do;
    if (d.card !== undefined) return `#pb-card-${answer}`;
    if (d.reroll !== undefined || d.ok !== undefined) return '#pb-dialog .pb-dialog-btn-primary';
    if (d.pass) return '#pb-auction-buttons [data-action="PASS"]';
    return `#pb-auction-buttons [data-amount="${d.bid}"]`;
}

/** Creates the tutorial's screen parts for one lesson. Call close() when the lesson ends or is left. */
export function createTutorialScreen(lesson, doc = document) {
    const wrapper = doc.getElementById('board-wrapper');
    let allowed = null;         // the element the learner may click now
    let closed = false;

    const ring = doc.createElement('div');
    ring.id = 'pb-tutor-ring';
    const bubble = doc.createElement('div');
    bubble.id = 'pb-tutor';
    bubble.className = 'v2-panel';
    bubble.style.width = `${BUBBLE_WIDTH}px`;
    const hide = () => { bubble.style.display = 'none'; ring.style.display = 'none'; };
    hide();
    wrapper.appendChild(ring);
    wrapper.appendChild(bubble);

    const lock = (event) => {
        if (closed) return;
        const el = event.target;
        if (!el.closest || !el.closest(LOCKED_AREAS)) return;      // menus, RESIGN, settings and the bubble stay free
        if (allowed && (el === allowed || allowed.contains(el))) return;
        event.stopPropagation();
        event.preventDefault();
    };
    doc.addEventListener('click', lock, true);

    /** An element's place in table pixels (the table is scaled as a whole to fit the window). */
    function rectOf(el) {
        const w = wrapper.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const scale = w.width / wrapper.offsetWidth || 1;
        return { left: (r.left - w.left) / scale, top: (r.top - w.top) / scale, width: r.width / scale, height: r.height / scale };
    }

    function unionOf(rects) {
        const left = Math.min(...rects.map(r => r.left));
        const top = Math.min(...rects.map(r => r.top));
        return {
            left, top,
            width: Math.max(...rects.map(r => r.left + r.width)) - left,
            height: Math.max(...rects.map(r => r.top + r.height)) - top
        };
    }

    function draw(step, selector, { nextButton }) {
        if (closed) return null;
        bubble.innerHTML = '';
        const head = doc.createElement('div');
        head.className = 'pb-tutor-head';
        head.textContent = `TUTORIAL ${lesson.chapter} · ${lesson.title}`;
        const text = doc.createElement('div');
        text.className = 'pb-tutor-text';
        text.textContent = step.text;
        bubble.appendChild(head);
        bubble.appendChild(text);
        if (step.note) {
            const note = doc.createElement('div');
            note.className = 'pb-tutor-note';
            const label = doc.createElement('span');
            label.className = 'pb-tutor-note-label';
            label.textContent = 'BOARD GAME RULE ';
            note.appendChild(label);
            note.appendChild(doc.createTextNode(step.note));
            bubble.appendChild(note);
        }
        let button = null;
        if (nextButton) {
            button = doc.createElement('button');
            button.type = 'button';
            button.id = 'pb-tutor-next';
            button.textContent = 'NEXT';
            bubble.appendChild(button);
        }
        bubble.dataset.step = step.id;
        bubble.style.display = 'block';

        // A selector may match several things (both character cards): the ring goes around all of them.
        const els = selector ? [...doc.querySelectorAll(selector)] : [];
        const el = els[0] || null;
        const target = els.length ? unionOf(els.map(rectOf)) : null;
        const place = tutorBubblePosition(target, { width: BUBBLE_WIDTH, height: bubble.offsetHeight }, step.side);
        bubble.style.left = `${place.left}px`;
        bubble.style.top = `${place.top}px`;
        if (target) {
            const pad = 10;
            ring.style.left = `${Math.round(target.left - pad)}px`;
            ring.style.top = `${Math.round(target.top - pad)}px`;
            ring.style.width = `${Math.round(target.width + 2 * pad)}px`;
            ring.style.height = `${Math.round(target.height + 2 * pad)}px`;
            ring.style.display = 'block';
        } else {
            ring.style.display = 'none';
        }
        return { el, button };
    }

    return {
        /** A bubble with a NEXT button. */
        say(step, game) {
            allowed = null;
            const drawn = draw(step, targetSelector(step.point, game), { nextButton: true });
            if (!drawn) return new Promise(() => {});
            return new Promise(resolve => { drawn.button.onclick = () => { hide(); resolve(); }; });
        },
        /** A bubble that points at the one thing the learner may click. */
        prompt(step, answer) {
            const selector = clickSelector(step, answer);
            const drawn = draw(step, selector, { nextButton: false });
            allowed = drawn ? drawn.el : null;
            if (drawn && !drawn.el) console.error(`[Palm Beach tutorial] Step ${step.id}: nothing to click (${selector}).`);
        },
        /** A bubble shown while the opponent plays. */
        show(step, game) {
            allowed = null;
            draw(step, targetSelector(step.point, game), { nextButton: false });
        },
        pause: (ms) => wait(ms),
        clear() { allowed = null; hide(); },
        close() {
            closed = true;
            doc.removeEventListener('click', lock, true);
            bubble.remove();
            ring.remove();
        }
    };
}

/**
 * Plays one lesson on screen, through the same match code as a normal game.
 * @param {{game: object, rng: object, lesson: object}} pb  from createLessonGame (tutorial_engine.js)
 * @returns {Promise<void>} resolves when the lesson is finished
 */
export async function runPalmBeachLesson(pb, { isCurrent = () => true } = {}) {
    const screen = createTutorialScreen(pb.lesson);
    pb.closeTutorial = () => screen.close();
    const guide = createLessonGuide(pb.lesson, screen);
    renderPalmBeachTable(pb.game);
    renderPalmBeachPanels(pb.game);
    // If the learner leaves in the middle (RESIGN), the match simply stops and never comes back here:
    // the one who leaves calls pb.closeTutorial() (see leavePalmBeachTable in js/game.js).
    await runPalmBeachMatch(pb, {
        isCurrent,
        guide,
        play: async (game, askPlayer, { emit }) => {
            await playLessonParts(pb, askPlayer, { emit });
            await guide.finish(game);
        }
    });
    screen.close();
}
