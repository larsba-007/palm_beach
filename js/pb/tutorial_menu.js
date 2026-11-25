// Palm Beach tutorial: the chapter list on the party menu (step 2.3).
// Opens from the TUTORIAL button. Choosing a chapter starts the tutorial there; it then plays on to the end.
// Placed with absolute pixels inside the party menu (which is scaled as a whole, like the table).

import { TUTORIAL_LESSONS } from './tutorial_lessons.js';

export const CHAPTER_LIST_TEXT = Object.freeze({
    title: 'TUTORIAL',
    intro: 'Learn Palm Beach by playing a short game against Roxana. About 5 minutes.',
    hint: 'The tutorial starts at the chapter you choose and plays on to the end.',
    close: 'CLOSE'
});

/** The lines of the list: "1  FLIP CARDS" ... */
export function chapterLines(lessons = TUTORIAL_LESSONS) {
    return lessons.map(l => ({ id: l.id, number: l.chapter, title: l.title }));
}

export function closeChapterList(doc = document) {
    doc.getElementById('pb-chapters-layer')?.remove();
}

/**
 * @param {HTMLElement} host   the party menu panel
 * @param {(lessonId: string) => void} onPick
 */
export function openChapterList(host, onPick, doc = document) {
    closeChapterList(doc);
    if (!host) return;
    const lines = chapterLines();
    const width = 1500;
    const rowHeight = 150;
    const height = 430 + lines.length * rowHeight + 210;

    const layer = doc.createElement('div');
    layer.id = 'pb-chapters-layer';
    layer.onclick = (event) => { if (event.target === layer) closeChapterList(doc); };
    const box = doc.createElement('div');
    box.id = 'pb-chapters';
    box.className = 'v2-panel';
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    box.style.left = `${Math.round((host.offsetWidth - width) / 2)}px`;
    box.style.top = `${Math.max(20, Math.round((host.offsetHeight - height) / 2))}px`;

    const add = (className, text, top) => {
        const e = doc.createElement('div');
        e.className = className;
        e.textContent = text;
        e.style.top = `${top}px`;
        box.appendChild(e);
        return e;
    };
    add('pb-chapters-title', CHAPTER_LIST_TEXT.title, 60);
    add('pb-chapters-intro', CHAPTER_LIST_TEXT.intro, 190);
    add('pb-chapters-hint', CHAPTER_LIST_TEXT.hint, 320);
    lines.forEach((line, i) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = `pb-chapters-row${i === 0 ? ' pb-chapters-row-first' : ''}`;
        b.dataset.lessonId = line.id;
        b.style.top = `${430 + i * rowHeight}px`;
        const n = doc.createElement('span');
        n.className = 'pb-chapters-number';
        n.textContent = String(line.number);
        b.appendChild(n);
        b.appendChild(doc.createTextNode(line.title));
        b.onclick = () => { closeChapterList(doc); onPick(line.id); };
        box.appendChild(b);
    });
    const close = doc.createElement('button');
    close.type = 'button';
    close.id = 'pb-chapters-close';
    close.textContent = CHAPTER_LIST_TEXT.close;
    close.style.top = `${430 + lines.length * rowHeight + 50}px`;
    close.onclick = () => closeChapterList(doc);
    box.appendChild(close);

    layer.appendChild(box);
    host.appendChild(layer);
}
