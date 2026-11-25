// Palm Beach match on screen: connects the rules engine (js/rules/engine.js) to clicks and animations.
//
// The engine asks ("which card?", "re-roll?", "OK to trade?") through askPlayer, and tells what happened
// through emit. This file answers the questions with the players' clicks (hot seat: everyone uses the same
// screen) and turns the events into what you see and hear.
//
// Steps 1.4 and 1.5: the card flipping phase, the Luxury Auctions and the Property Auction: a complete game.

import { playGame } from '../rules/engine.js';
import {
    nameOf, diamondTradeMessage, rerollMessage, roundStartMessage, statusText,
    auctionWonText, auctionUnsoldText, forcedPassText
} from './messages.js';
import { openAuction, updateAuction, askBid, closeAuction } from './auction_view.js';
import { showFinalScreen, closeFinalScreen, closeCheatSheet, ensureCheatSheetButton } from './end_screen.js';
import { renderPalmBeachTable, paintMapCard } from './table.js';
import { renderPalmBeachPanels } from './panels.js';
import {
    wait, rollDice, hideDice, flipMapCard, flyGold, flyDiamond, showLandmark, revealLuxuryCard, revealWonCard,
    showDialog, showToast, setStatus, frameRow, playSound
} from './effects.js';

// ---- Running a match ------------------------------------------------------------------------------------

/**
 * Plays the match on screen until it ends.
 * @param {{game: object, rng: object}} pb  the Palm Beach game made in js/pb/table.js
 * @param {{isCurrent?: () => boolean}} [options]  isCurrent says whether this match is still the one on the table
 */
export async function runPalmBeachMatch(pb, { isCurrent = () => true, onFinished = () => {}, boardGameLink = '' } = {}) {
    const { game, rng } = pb;
    ensureCheatSheetButton();
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
                // The auction window asks the bidder: raise the highest bid by 1, 3 or 5 Au, or pass.
                return askBid(request, game);
            default:
                return true;
        }
    }

    async function emit(e) {
        if (!isCurrent()) return stopped();
        switch (e.type) {
            case 'ROUND_START':
                playSound('the_gong');
                renderPalmBeachTable(game);
                refreshPanels();
                frameRow(e.round);
                refreshStatus();
                await showToast(roundStartMessage(game, e.round), 1800);
                break;
            case 'TURN_START':
                playSound('turn_switch');
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
                // The round's Luxury Card is turned face up beside its row, then the auction window opens.
                frameRow(null);
                renderPalmBeachTable(game);
                refreshPanels();
                refreshStatus();
                await wait(e.kind === 'LUXURY' ? 700 : 300);
                playSound('auction_alert');
                openAuction(game, e.kind, e.card);
                break;
            case 'BID':
                playSound('bid');
                refreshPanels();
                updateAuction(game);
                await wait(250);
                break;
            case 'PASS':
                playSound('fold');
                updateAuction(game);
                if (e.forced) await showToast(forcedPassText(game, e.playerId), 1500);
                else await wait(250);
                break;
            case 'AUCTION_WON':
                await showToast(auctionWonText(game, e), 1700);
                closeAuction();
                renderPalmBeachTable(game);
                await revealWonCard(e.card, e.playerId, { kind: e.kind, hold: 900 });
                refreshPanels();
                break;
            case 'AUCTION_UNSOLD':
                await showToast(auctionUnsoldText(e), 2000);
                closeAuction();
                renderPalmBeachTable(game);
                refreshPanels();
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
                closeAuction();
                renderPalmBeachTable(game);
                refreshPanels();
                refreshStatus();
                playSound('winner_song');
                // The final scoring screen. PLAY AGAIN or PARTY MENU: the caller decides what happens next.
                const choice = await showFinalScreen(game, { boardGameLink });
                if (isCurrent()) onFinished(choice);
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

/** Takes everything a Palm Beach match put on the screen away again (when the players leave the match). */
export function leavePalmBeachMatch() {
    hideDice();
    closeAuction();
    closeFinalScreen();
    closeCheatSheet();
    frameRow(null);
    setStatus('', '');
    for (const id of ['pb-dialog-layer', 'pb-toast', 'pb-rules-btn']) document.getElementById(id)?.remove();
    document.querySelectorAll('.pb-flyer, .pb-luxury-reveal, .flip-container').forEach(el => el.remove());
    if (typeof window !== 'undefined' && window.app?.dismissLandmarkDossier) window.app.dismissLandmarkDossier();
}
