// Palm Beach rules: Luxury Cards a player receives, and the Automatic Diamond Trade (rulebook p9 and p12).

import { DIAMOND_TRADE_COST, getCharacter } from './data.js';

/** Diamonds this player needs for a trade: 4, Mr. Flagler 3. */
export function diamondTradeCost(player) {
    return getCharacter(player.characterId).diamondTradeCost ?? DIAMOND_TRADE_COST;
}

/**
 * Gives a Luxury Card to a player (won at auction or from a Diamond trade).
 * A card that shows re-rolls gives that many yellow counters at once.
 */
export function giveLuxuryCard(player, card, source) {
    player.luxuryCards.push({ ...card, source });
    player.rerolls += card.rerolls || 0;
}

/**
 * True when the automatic trade must happen now: the player has enough Diamonds.
 * (Lars, 25 Nov 2026: the pile of 7 Luxury Cards never runs out. If it ever is empty, no trade happens.)
 */
export function mustTradeDiamonds(game, player) {
    return player.diamonds >= diamondTradeCost(player) && game.tradePile.length > 0;
}

/** The trade: Diamonds back to the Bank, the top card of the face-down pile to the player. Returns the card. */
export function tradeDiamonds(game, player) {
    if (!mustTradeDiamonds(game, player)) throw new Error('This player cannot trade Diamonds now.');
    const cost = diamondTradeCost(player);
    player.diamonds -= cost;
    const card = game.tradePile.pop();
    giveLuxuryCard(player, card, 'DIAMOND_TRADE');
    return { card, cost };
}
