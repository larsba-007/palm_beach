// Palm Beach player panels: one per player on the left side of the table (step 1.3).
// Shows what the rules engine's game says: character card, Diamonds under the card, gold (open in the web
// version: Lars's decision), Prestige Points, re-rolls and the cards the player has won.

import { CHARACTER_SPRITE_PRINT_URL, LUXURY_CARD_SPRITE_URL, PROPERTY_SPRITE_URL } from '../data.js';
import { getCharacter } from '../rules/data.js';
import { diamondTradeCost } from '../rules/diamonds.js';
import { prestigeOf } from '../rules/scoring.js';
import { panelLayout, characterSprite, scaleSprite, luxuryFrontSprite, propertyFrontSprite } from './layout.js';

export const DIAMOND_URL = new URL(/* @vite-ignore */ '../../assets/diamond.webp', import.meta.url).href;

function box(doc, className, { left = 0, top = 0, width, height }, text) {
    const el = doc.createElement('div');
    el.className = className;
    el.style.position = 'absolute';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    if (width !== undefined) el.style.width = `${width}px`;
    if (height !== undefined) el.style.height = `${height}px`;
    if (text !== undefined) el.textContent = String(text);
    return el;
}

function paint(el, url, sprite) {
    el.style.backgroundImage = `url('${url}')`;
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = sprite.size;
    el.style.backgroundPosition = `${sprite.x}px ${sprite.y}px`;
}

/** What one panel shows, as plain values (used by the drawing below and by the tests). */
export function panelFacts(game, player) {
    const character = getCharacter(player.characterId);
    return {
        playerId: player.id,
        name: player.name,
        characterName: character.name,
        slot: character.slot,
        gold: player.gold,
        prestige: prestigeOf(player),
        rerolls: player.rerolls,
        diamonds: player.diamonds,
        diamondSlots: diamondTradeCost(player),      // 4, Mr. Flagler 3: the trade happens when all are filled
        isCurrent: game.currentPlayer === player.id,
        isStartPlayer: game.startPlayer === player.id,
        won: [
            ...(player.property ? [{ kind: 'PROPERTY', id: player.property.id, name: player.property.name, points: player.property.points }] : []),
            ...player.luxuryCards.map(c => ({ kind: 'LUXURY', id: c.id, name: c.name, points: c.points, spriteIndex: c.spriteIndex }))
        ]
    };
}

/** Draws all player panels. Call again whenever the game changes. */
export function renderPalmBeachPanels(game, doc = document) {
    const host = doc.getElementById('left-panel-cards');
    if (!host) throw new Error('The game screen is missing: cannot draw the player panels.');
    host.innerHTML = '';
    host.classList.add('pb-panels');

    const L = panelLayout(game.players.length);
    for (const player of game.players) {
        const f = panelFacts(game, player);
        const panel = box(doc, 'pb-panel', { left: L.left(player.id), top: L.top, width: L.width });
        panel.id = `pb-panel-${player.id}`;
        panel.dataset.playerId = String(player.id);
        if (f.isCurrent) panel.classList.add('pb-panel-current');
        if (f.isStartPlayer) panel.classList.add('pb-panel-start');

        panel.appendChild(box(doc, 'pb-panel-name', { top: 0, width: L.width, height: L.nameHeight }, f.name));

        const card = box(doc, 'pb-panel-card', { top: L.cardTop, width: L.width, height: L.cardHeight });
        card.title = `${f.characterName}: ${getCharacter(player.characterId).ability}`;
        paint(card, CHARACTER_SPRITE_PRINT_URL, characterSprite(f.slot, L.width, L.cardHeight));
        panel.appendChild(card);

        // Diamonds, under the character card. One place per Diamond needed for the trade; the filled ones are the player's.
        const diamondWidth = 56;
        const diamondGap = Math.min(10, Math.floor((L.width - f.diamondSlots * diamondWidth) / Math.max(1, f.diamondSlots - 1)));
        const rowWidth = f.diamondSlots * diamondWidth + (f.diamondSlots - 1) * diamondGap;
        const diamonds = box(doc, 'pb-panel-diamonds', { top: L.diamondsTop, width: L.width, height: 64 });
        diamonds.dataset.diamonds = String(f.diamonds);
        diamonds.title = `${f.diamonds} of ${f.diamondSlots} Diamonds`;
        for (let i = 0; i < f.diamondSlots; i++) {
            const d = box(doc, i < f.diamonds ? 'pb-diamond pb-diamond-held' : 'pb-diamond', {
                left: Math.round((L.width - rowWidth) / 2) + i * (diamondWidth + diamondGap), top: 12, width: diamondWidth, height: 40
            });
            d.style.backgroundImage = `url('${DIAMOND_URL}')`;
            diamonds.appendChild(d);
        }
        panel.appendChild(diamonds);

        const stats = [
            ['Gold', `${f.gold}`, 'pb-stat-gold', 'gold'],
            ['Prestige', `${f.prestige}`, 'pb-stat-prestige', 'prestige'],
            ['Re-rolls', `${f.rerolls}`, 'pb-stat-rerolls', 'rerolls']
        ];
        stats.forEach(([label, value, className, key], row) => {
            const top = L.statsTop + row * L.statRow;
            panel.appendChild(box(doc, 'pb-stat-label', { top, width: L.width, height: L.statRow }, label));
            const v = box(doc, `pb-stat-value ${className}`, { top, width: L.width, height: L.statRow }, value);
            v.id = `pb-${key}-${player.id}`;
            panel.appendChild(v);
        });

        // Cards won: the Property Card first, then Luxury Cards in the order they were won.
        f.won.forEach((card, n) => {
            const el = box(doc, 'pb-won-card', { ...L.wonCard(n), width: L.thumb, height: L.thumb });
            el.title = `${card.name}: ${card.points} Prestige Point${card.points === 1 ? '' : 's'}`;
            el.dataset.cardId = card.id;
            if (card.kind === 'PROPERTY') paint(el, PROPERTY_SPRITE_URL, scaleSprite(propertyFrontSprite(card.id), L.thumb));
            else paint(el, LUXURY_CARD_SPRITE_URL, scaleSprite(luxuryFrontSprite(card.spriteIndex), L.thumb));
            panel.appendChild(el);
        });

        host.appendChild(panel);
    }
}

export function clearPalmBeachPanels(doc = document) {
    const host = doc.getElementById('left-panel-cards');
    if (host) host.classList.remove('pb-panels');
}
