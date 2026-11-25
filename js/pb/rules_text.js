// Palm Beach: the short rules shown in the Compendium (RULES tab).
// A summary of docs/palm_beach/rules-palm-beach.md. The numbers come from the rules engine, so they cannot drift.
// The printed rulebook is the full text.

import { CARD_RULES, DIAMOND_TRADE_COST, START_GOLD, ROUNDS, MIN_BID, PROPERTY_CARDS, getCharacter } from '../rules/data.js';

/** The rules as sections of plain text (also read by the tests). */
export function palmBeachRules() {
    const need = (type) => `Roll ${CARD_RULES[type].minRoll}–6`;
    return [
        { heading: 'OBJECTIVE', paragraphs: [
            'Collect the most Prestige Points. Eight rounds, ten auctions, one property: bid wisely.',
            'Luxury Cards are worth 1–3 Prestige Points: win them in the 10 Luxury Auctions, or trade in Diamonds.',
            `The Property Card is worth ${Math.min(...PROPERTY_CARDS.map(p => p.points))}–${Math.max(...PROPERTY_CARDS.map(p => p.points))} Prestige Points: win it at the final Property Auction.`,
            `Everyone starts with ${START_GOLD} Au.`
        ] },
        { heading: 'A ROUND', paragraphs: [
            `The game has ${ROUNDS} rounds. Round 1 is played on row 1, round 2 on row 2, and so on.`,
            '1. Initiative: everyone checks the number for the round (R1–R8) on their character card. The lowest number starts the round and bids first in the auction.',
            '2. Card flipping: starting with the start player and going clockwise, each player chooses one face-down card in the row and tries to flip it. The phase ends when the whole row is face up.',
            '3. Luxury Auction: the round\'s Luxury Card is auctioned. Rounds 4 and 6 have two cards, auctioned one after the other.'
        ] },
        { heading: 'MAP CARDS', list: [
            `LAGOON: ${need('LAGOON')}. ${CARD_RULES.LAGOON.gold} Au. High risk, big reward.`,
            `ATLANTIC: ${need('ATLANTIC')}. ${CARD_RULES.ATLANTIC.gold} Au. Medium risk.`,
            `WATERFRONT: no roll. ${CARD_RULES.WATERFRONT.diamonds} Diamond.`,
            `BLOCK: no roll. ${CARD_RULES.BLOCK.gold} Au.`
        ], paragraphs: [
            'On a failed roll you get nothing and the card stays face down. Anyone can try it again later.',
            'A yellow circle on a card shows extra gold, paid when the card is flipped: +5 Au on the 9 Block Bonus Cards, +2 Au or +1 Au on the 12 landmarks.'
        ] },
        { heading: 'DIAMONDS', paragraphs: [
            `The moment you have ${DIAMOND_TRADE_COST} Diamonds (Mr. Flagler: ${getCharacter('FLAGLER').diamondTradeCost}), they go back to the Bank and you take a new Luxury Card.`
        ] },
        { heading: 'RE-ROLLS', paragraphs: [
            'After a failed roll on a Lagoon or Atlantic card you may spend a yellow counter and roll again. You must keep the new roll.',
            'Three of the 1-point Luxury Cards give new re-rolls: the tiger 2, the watch and the handbag 1 each.'
        ] },
        { heading: 'AUCTIONS', paragraphs: [
            `The start player bids first or passes. Going clockwise, each player raises or passes. The lowest bid is ${MIN_BID} Au and each raise is at least 1 Au more.`,
            'Once you pass, you are out of that auction. You can never bid more gold than you have.',
            'The last bidder pays the Bank and takes the card. If nobody bids, the card is removed from the game.'
        ] },
        { heading: 'THE PROPERTY AUCTION', paragraphs: [
            'After the Luxury Auction in round 8, the Auction Map Card is flipped. It shows which Property Card is auctioned: Mar-a-Lago (4 points), Gulf Stream Golf Course (3) or Spanish River Park (2).',
            'Characters who collect gold before that property\'s auction take it now. Then the property is auctioned like a Luxury Card, and the game ends.'
        ] },
        { heading: 'WINNING', paragraphs: [
            'The player with the most Prestige Points wins.',
            'Tie: the tied player holding the Property Card wins. If no tied player has it, the tied player with the most gold left wins. Still tied: the victory is shared.'
        ] }
    ];
}

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The same rules as HTML for the Compendium, in its usual look. */
export function palmBeachRulesHtml() {
    const sections = palmBeachRules().map(s => `
        <section>
            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">${esc(s.heading)}</h3>
            ${s.list ? `<ul class="space-y-4 list-none mb-8">${s.list.map(item => `<li class="v2-glass-plate p-8 border-l-8 border-[#F3C80D]">${esc(item)}</li>`).join('')}</ul>` : ''}
            <div class="space-y-6">${s.paragraphs.map(p => `<p class="opacity-95">${esc(p)}</p>`).join('')}</div>
        </section>`).join('');
    return `<div class="max-w-[1800px] mx-auto text-left space-y-16 pb-20 text-[36px] leading-snug font-overpass">${sections}</div>`;
}
