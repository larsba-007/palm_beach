// Palm Beach rules: the card flipping phase (rulebook p8-9).
// Pure functions: they answer questions about a flip and apply its result. No screen code, no dice thrown here.

import { CARD_RULES, getCharacter } from './data.js';

/** The cards of a round's row (round 1 = row 1). */
export function rowCards(game, round = game.round) {
    return game.rows[round - 1];
}

/** The cards a player may choose this turn: every face-down card in the current row. */
export function faceDownCards(game, round = game.round) {
    return rowCards(game, round).filter(c => !c.faceUp);
}

/** The flipping phase ends when every card in the row is face up. */
export function isRowComplete(game, round = game.round) {
    return faceDownCards(game, round).length === 0;
}

export function findCard(game, cardId, round = game.round) {
    const card = rowCards(game, round).find(c => c.id === cardId);
    if (!card) throw new Error(`Card ${cardId} is not in row ${round}.`);
    return card;
}

/**
 * The roll this player needs for this card, or null if no roll is needed.
 * Lagoon 4-6, Atlantic 3-6, Block and Waterfront no roll. Skip flips Atlantic cards without rolling.
 */
export function rollNeeded(player, card) {
    const character = getCharacter(player.characterId);
    if (character.noRollTypes?.includes(card.type)) return null;
    return CARD_RULES[card.type].minRoll;
}

/** True if this roll flips the card. */
export function rollSucceeds(player, card, roll) {
    const needed = rollNeeded(player, card);
    return needed === null || roll >= needed;
}

/**
 * What a player gets for flipping a card.
 * @param {number|null} roll  the die roll that was kept, or null when no die was rolled
 * @returns {{gold: number, diamonds: number, parts: {reason: string, gold?: number, diamonds?: number}[]}}
 */
export function flipReward(player, card, roll = null) {
    const character = getCharacter(player.characterId);
    const base = CARD_RULES[card.type];
    const parts = [];
    if (base.gold) parts.push({ reason: card.type, gold: base.gold });
    if (base.diamonds) parts.push({ reason: card.type, diamonds: base.diamonds });

    // The yellow circle: +5 (Block Bonus Card), +2 or +1 (landmarks). Paid only when the card is flipped.
    if (card.bonus) {
        if (card.isBlockBonus && character.blockBonusGold) {
            parts.push({ reason: 'BLOCK_BONUS_POWER', gold: character.blockBonusGold });   // Eric: 10 instead of 5
        } else {
            parts.push({ reason: card.isBlockBonus ? 'BLOCK_BONUS' : 'LANDMARK', gold: card.bonus });
        }
    }

    // Character powers that pay extra on a high roll (Roxana, Carina, Addison). No die rolled = no roll bonus.
    const rb = character.rollBonus;
    if (rb && roll !== null && rb.types.includes(card.type) && roll >= rb.minRoll) {
        parts.push({ reason: 'ROLL_POWER', gold: rb.gold });
    }

    return {
        gold: parts.reduce((sum, p) => sum + (p.gold || 0), 0),
        diamonds: parts.reduce((sum, p) => sum + (p.diamonds || 0), 0),
        parts
    };
}

/** Turns the card face up and pays the player. Returns the reward. */
export function applyFlip(game, player, card, roll = null) {
    if (card.faceUp) throw new Error(`Card ${card.id} is already face up.`);
    if (card.row !== game.round) throw new Error(`Card ${card.id} is in row ${card.row}, but round ${game.round} is being played.`);
    if (!rollSucceeds(player, card, roll ?? 0)) throw new Error(`A roll of ${roll} does not flip a ${card.type} card.`);
    const reward = flipReward(player, card, roll);
    card.faceUp = true;
    card.flippedBy = player.id;
    player.gold += reward.gold;
    player.diamonds += reward.diamonds;
    return reward;
}

/**
 * Re-rolls (yellow counters). Lars, 25 Nov 2026: the player is offered a re-roll only after a failed
 * Lagoon or Atlantic roll, only with a yellow counter left, and may always say no.
 */
export function canReroll(player, card, roll) {
    return player.rerolls > 0 && rollNeeded(player, card) !== null && !rollSucceeds(player, card, roll);
}

/** Spends one yellow counter. The new roll must be kept. */
export function spendReroll(player) {
    if (player.rerolls <= 0) throw new Error('No re-roll counters left.');
    player.rerolls -= 1;
}
