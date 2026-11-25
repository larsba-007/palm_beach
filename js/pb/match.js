// Palm Beach match on screen: connects the rules engine (js/rules/engine.js) to clicks and animations.
//
// The engine asks ("which card?", "re-roll?", "OK to trade?") through askPlayer, and tells what happened
// through emit. This file answers the questions with the players' clicks (hot seat: everyone uses the same
// screen) and turns the events into what you see and hear.
//
// Step 1.4: the card flipping phase of all 8 rounds. The auctions are step 1.5: until then nobody bids,
// so every card goes unsold.

import { playGame } from '../rules/engine.js';
import { nameOf, diamondTradeMessage, rerollMessage, roundStartMessage, statusText } from './messages.js';
import { renderPalmBeachTable, paintMapCard } from './table.js';
import { renderPalmBeachPanels } from './panels.js';
import {
    wait, rollDice, hideDice, flipMapCard, flyGold, flyDiamond, showLandmark, revealLuxuryCard,
    showDialog, showToast, setStatus, frameRow
} from './effects.js';

// ---- Running a match ------------------------------------------------------------------------------------

/**
 * Plays the match on screen until it ends.
 * @param {{game: object, rng: object}} pb  the Palm Beach game made in js/pb/table.js
 * @param {{isCurrent?: () => boolean}} [options]  isCurrent says whether this match is still the one on the table
 */
export async function runPalmBeachMatch(pb, { isCurrent = () => true } = {}) {
    const { game, rng } = pb;
    const cardEl = (cardId) => document.getElementById(`pb-card-${cardId}`);
    // If the players left this match (RESIGN, new match), it simply stops where it is.
    const stopped = () => new Promise(() => {});
    const refreshPanels = () => renderPalmBeachPanels(game);
    const refreshStatus = () => { const s = statusText(game); setStatus(s.left, s.right); };

    function chooseCard(request) {
        refreshPanels();
        refreshStatus();
        return new Promise(resolve => {
            const els = request.options.map(cardEl).filter(Boolean);
            const done = (cardId) => {
                els.forEach(el => { el.classList.remove('pb-clickable'); el.onclick = null; });
                resolve(cardId);
            };
            els.forEach(el => {
                el.classList.add('pb-clickable');
                el.onclick = () => done(el.dataset.cardId);
            });
        });
    }

    async function askPlayer(request) {
        if (!isCurrent()) return stopped();
        switch (request.type) {
            case 'CHOOSE_CARD':
                return chooseCard(request);
            case 'REROLL': {
                const card = game.rows[game.round - 1].find(c => c.id === request.cardId);
                const m = rerollMessage(request, card.type);
                const again = await showDialog({ title: m.title, text: m.text, buttons: [{ label: m.yes, value: true, primary: true }, { label: m.no, value: false }] });
                hideDice();
                return again;
            }
            case 'DIAMOND_TRADE': {
                const m = diamondTradeMessage(request);
                return showDialog({ title: m.title, text: m.text, buttons: [{ label: m.ok, value: true, primary: true }] });
            }
            case 'BID':
                // Step 1.4: no auctions yet. Everyone passes, so the card goes unsold. Step 1.5 replaces this.
                return { action: 'PASS' };
            default:
                return true;
        }
    }

    async function emit(e) {
        if (!isCurrent()) return stopped();
        switch (e.type) {
            case 'ROUND_START':
                renderPalmBeachTable(game);
                refreshPanels();
                frameRow(e.round);
                refreshStatus();
                await showToast(roundStartMessage(game, e.round), 1800);
                break;
            case 'TURN_START':
                refreshPanels();
                refreshStatus();
                break;
            case 'ROLL':
            case 'REROLL':
                refreshPanels();
                await rollDice(e.roll);
                await wait(e.success ? 500 : 250);
                // After a miss the die stays in view while the player decides about a re-roll.
                if (e.success || game.players[e.playerId].rerolls === 0) hideDice();
                break;
            case 'FLIP_FAILED':
                hideDice();
                await showToast(`${nameOf(game, e.playerId).toUpperCase()} ROLLED ${e.roll}: THE CARD STAYS FACE DOWN`, 1400);
                break;
            case 'CARD_FLIPPED': {
                hideDice();
                const el = cardEl(e.cardId);
                const card = game.rows[game.round - 1].find(c => c.id === e.cardId);
                if (el) {
                    await flipMapCard(el, card);
                    paintMapCard(el, card);
                    const flights = [];
                    if (e.reward.diamonds) flights.push(flyDiamond(el, e.playerId));
                    if (e.reward.gold) flights.push(flyGold(el, e.playerId, e.reward.gold));
                    await Promise.all(flights);
                }
                refreshPanels();
                if (card.bonus && !card.isBlockBonus) await showLandmark(card);
                break;
            }
            case 'DIAMOND_TRADE':
                refreshPanels();
                await revealLuxuryCard(e.card, e.playerId);
                refreshPanels();
                break;
            case 'FLIPPING_DONE':
                frameRow(null);
                refreshStatus();
                await showToast(`ROW ${e.round} IS COMPLETE`, 1200);
                break;
            case 'AUCTION_START':
                refreshStatus();
                break;
            case 'AUCTION_UNSOLD':
                // Step 1.4 only: the auctions are not built yet.
                renderPalmBeachTable(game);
                refreshPanels();
                await showToast(e.kind === 'PROPERTY' ? 'THE PROPERTY AUCTION COMES IN STEP 1.5' : `${e.card.name.toUpperCase()}: THE AUCTION COMES IN STEP 1.5`, 1500);
                break;
            case 'AUCTION_MAP_FLIPPED':
                renderPalmBeachTable(game);
                await showToast(`THE AUCTION MAP CARD SHOWS ${e.property.name.toUpperCase()}`, 2000);
                break;
            case 'CHARACTER_GOLD':
                refreshPanels();
                await showToast(`${nameOf(game, e.playerId).toUpperCase()} COLLECTS ${e.gold} Au`, 1600);
                break;
            case 'GAME_OVER': {
                renderPalmBeachTable(game);
                refreshPanels();
                refreshStatus();
                const lines = e.result.scores.map(s => `${s.name}: ${s.prestige} Prestige Points, ${s.gold} Au`).join('  ·  ');
                await showDialog({ title: 'ALL 8 ROUNDS PLAYED', text: `${lines}. The final scoring screen comes in step 1.6.`, buttons: [{ label: 'OK', value: true, primary: true }] });
                break;
            }
            default:
        }
        return undefined;
    }

    try {
        return await playGame(game, askPlayer, { rng, emit });
    } catch (error) {
        console.error('[Palm Beach] The match stopped on an error:', error);
        throw error;
    }
}
