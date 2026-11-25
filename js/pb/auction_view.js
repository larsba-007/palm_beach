// Palm Beach table: the auction window (step 1.5).
// Shows the card that is auctioned, the highest bid, who is still in, and the buttons for the bidder
// whose turn it is. The rules of the auction are in js/rules/auction.js; this file only shows and asks.
// Everything is placed with absolute pixels inside the scaled table (3840 x 2160 canvas).

import { LUXURY_CARD_SPRITE_URL, PROPERTY_SPRITE_URL } from '../data.js';
import { luxuryFrontSprite, propertyFrontSprite } from './layout.js';
import { auctionTitle, cardLine, highBidText, bidTurnText, bidderStatuses, bidChoices } from './messages.js';

const CARD_SIZE = 640;

function el(doc, className, text) {
    const e = doc.createElement('div');
    e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
}

/** Opens the auction window for this card. */
export function openAuction(game, kind, card, doc = document) {
    closeAuction(doc);
    const wrapper = doc.getElementById('board-wrapper');
    if (!wrapper) return;
    const layer = el(doc, '');
    layer.id = 'pb-auction-layer';
    const box = el(doc, 'v2-panel');
    box.id = 'pb-auction';

    const picture = el(doc, 'pb-auction-card');
    picture.id = 'pb-auction-card';
    const f = CARD_SIZE / 250;
    const sprite = kind === 'PROPERTY' ? propertyFrontSprite(card.id) : luxuryFrontSprite(card.spriteIndex);
    const [w, h] = sprite.size.split(' ').map(v => parseFloat(v) * f);
    picture.style.backgroundImage = `url('${kind === 'PROPERTY' ? PROPERTY_SPRITE_URL : LUXURY_CARD_SPRITE_URL}')`;
    picture.style.backgroundSize = `${w}px ${h}px`;
    picture.style.backgroundPosition = `${sprite.x * f}px ${sprite.y * f}px`;
    box.appendChild(picture);

    box.appendChild(el(doc, 'pb-auction-title', auctionTitle(game, kind)));
    box.appendChild(el(doc, 'pb-auction-cardline', cardLine(card)));
    const amount = el(doc, 'pb-auction-amount'); amount.id = 'pb-auction-amount'; box.appendChild(amount);
    const who = el(doc, 'pb-auction-who'); who.id = 'pb-auction-who'; box.appendChild(who);
    const bidders = el(doc, 'pb-auction-bidders'); bidders.id = 'pb-auction-bidders'; box.appendChild(bidders);
    const turn = el(doc, 'pb-auction-turn'); turn.id = 'pb-auction-turn'; box.appendChild(turn);
    const buttons = el(doc, 'pb-auction-buttons'); buttons.id = 'pb-auction-buttons'; box.appendChild(buttons);

    layer.appendChild(box);
    wrapper.appendChild(layer);
    updateAuction(game, doc);
}

/** Shows the auction as it stands now (after a bid or a pass). */
export function updateAuction(game, doc = document) {
    const auction = game.auction?.state;
    if (!auction || !doc.getElementById('pb-auction')) return;
    const high = highBidText(game, auction);
    doc.getElementById('pb-auction-amount').textContent = high.amount;
    doc.getElementById('pb-auction-who').textContent = high.who;

    const host = doc.getElementById('pb-auction-bidders');
    host.innerHTML = '';
    const list = bidderStatuses(game, auction);
    const gap = 14;
    const width = Math.min(270, Math.floor((1120 - (list.length - 1) * gap) / list.length));
    list.forEach((b, i) => {
        const chip = el(doc, `pb-bidder pb-bidder-${b.status.toLowerCase()}${b.isTurn ? ' pb-bidder-turn' : ''}`);
        chip.style.left = `${i * (width + gap)}px`;
        chip.style.width = `${width}px`;
        chip.appendChild(el(doc, 'pb-bidder-name', b.name));
        chip.appendChild(el(doc, 'pb-bidder-status', b.status === 'HIGHEST' ? `BID ${auction.highBid}` : b.status));
        chip.appendChild(el(doc, 'pb-bidder-gold', `${b.gold} Au`));
        host.appendChild(chip);
    });
}

/**
 * Asks the bidder whose turn it is. Returns { action: 'BID', amount } or { action: 'PASS' }.
 * The buttons raise the highest bid by 1, 3 or 5 Au (the Boca system); a raise the player cannot afford is switched off.
 */
export function askBid(request, game, doc = document) {
    updateAuction(game, doc);
    const turn = doc.getElementById('pb-auction-turn');
    const buttons = doc.getElementById('pb-auction-buttons');
    if (!turn || !buttons) return Promise.resolve({ action: 'PASS' });
    turn.textContent = bidTurnText(game, request);
    buttons.innerHTML = '';
    return new Promise(resolve => {
        const answer = (value) => { buttons.innerHTML = ''; turn.textContent = ''; resolve(value); };
        bidChoices(request).forEach((choice, i) => {
            const btn = doc.createElement('button');
            btn.type = 'button';
            btn.className = 'pb-bid-btn';
            btn.style.left = `${i * 280}px`;
            btn.disabled = !choice.enabled;
            btn.dataset.amount = String(choice.amount);
            btn.appendChild(el(doc, 'pb-bid-btn-label', choice.label));
            btn.appendChild(el(doc, 'pb-bid-btn-hint', choice.hint));
            btn.onclick = () => answer({ action: 'BID', amount: choice.amount });
            buttons.appendChild(btn);
        });
        const pass = doc.createElement('button');
        pass.type = 'button';
        pass.className = 'pb-bid-btn pb-bid-btn-pass';
        pass.style.left = `${3 * 280}px`;
        pass.dataset.action = 'PASS';
        pass.appendChild(el(doc, 'pb-bid-btn-label', 'PASS'));
        pass.appendChild(el(doc, 'pb-bid-btn-hint', 'out of this auction'));
        pass.onclick = () => answer({ action: 'PASS' });
        buttons.appendChild(pass);
    });
}

export function closeAuction(doc = document) {
    doc.getElementById('pb-auction-layer')?.remove();
}
