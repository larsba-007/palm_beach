// Palm Beach tutorial: the lessons. TEXTS AND CLICKS COME FROM TUTORIAL_SCRIPT.md (approved by Lars, 25 Nov 2026).
// To change a bubble text, change it here AND in TUTORIAL_SCRIPT.md: a test checks that the two say the same.
//
// How to read a step:
//   who: 'SAY'       a bubble with a NEXT button.
//   who: 'YOU'       the learner must click the thing in "do". Nothing else can be clicked.
//   who: 'OPPONENT'  Roxana does the thing in "do" by herself. With a text, a bubble with NEXT comes first.
//   who: 'END'       the last bubble of the tutorial, with the buttons in "buttons".
//   on:  'EVENT'     (SAY only) show this bubble right after the game has shown this event, not at the next click.
//   do:  { card: 2 }      flip the card at this place in the row (0 = Lagoon, 1 = Waterfront, 2-6 = Block, 7 = Waterfront, 8 = Atlantic)
//        { reroll: true } press RE-ROLL        { ok: true } press OK in the Diamond trade popup
//        { bid: 7 }       bid this many Au     { pass: true } press PASS
//   point: what the bubble points at (see js/pb/tutorial_view.js). For a 'YOU' step it points at the thing to click.
//   side:  'right', 'left', 'below' or 'above': where the bubble stands, when the usual place would hide something.
//   note:  the "Board game rule" line under the text.
//
// The learner is seat 0 (Bright Shell), Roxana is seat 1. The players are named after their characters, so the
// game's own messages read well ("BRIGHT SHELL WINS THE SPORTS CAR FOR 9 Au").

const LEARNER = 0;
const ROXANA = 1;
const PLAYERS = [
    { name: 'Bright Shell', characterId: 'BRIGHT_SHELL' },
    { name: 'Roxana', characterId: 'ROXANA' }
];
const withHoldings = (you, roxana) => [{ ...PLAYERS[0], ...you }, { ...PLAYERS[1], ...roxana }];

export const TUTORIAL_LESSONS = Object.freeze([
    {
        id: 'flip-cards',
        chapter: 1,
        title: 'FLIP CARDS',
        learner: LEARNER,
        opponent: ROXANA,
        setup: {
            round: 1,
            players: withHoldings({}, {}),
            // Row 1: plain cards, except one Block card that hides a +5 circle (the fifth card of the row).
            rowBonus: { 1: [0, 0, 0, 0, 5, 0, 0, 0, 0] },
            luxury: { 1: 'Sports Car' }
        },
        // Roxana's Atlantic roll, the learner's Lagoon roll, the learner's re-roll.
        dice: [5, 2, 5],
        parts: ['START_ROUND', 'FLIPPING'],
        steps: [
            { id: '1.1', who: 'SAY', point: 'table', text: 'Welcome to Palm Beach! The player with the most Prestige Points after 8 rounds wins.' },
            { id: '1.2', who: 'SAY', point: 'row', text: 'Each round is played on one row. First you flip its cards for gold, then you bid on a Luxury Card.' },
            { id: '1.3', who: 'SAY', point: 'characters', text: 'The lowest initiative number starts the round. You have 30 and Roxana has 70: you start.' },
            { id: '1.4', who: 'YOU', do: { card: 2 }, text: 'Block cards are safe. Flip one and take 3 Au.' },
            { id: '1.5', who: 'OPPONENT', do: { card: 8 }, point: { card: 8 }, text: 'Roxana tries an Atlantic card. She needs 3 or higher on the die.' },
            { id: '1.6', who: 'SAY', point: 'character:1', text: "An Atlantic card gives 6 Au. Roxana's power gives her 5 Au extra for rolling 5 or 6." },
            { id: '1.7', who: 'YOU', do: { card: 0 }, text: 'The Lagoon pays most: 8 Au. You need 4 or higher.', note: 'At the table, say which card you want before you roll.' },
            { id: '1.8', who: 'YOU', do: { reroll: true }, text: 'A 2: missed! You have a yellow re-roll counter. Use it to roll again.' },
            { id: '1.9', who: 'SAY', point: { card: 0 }, text: 'Without a re-roll the card stays face down, and anyone can try it later.' },
            { id: '1.10', who: 'OPPONENT', do: { card: 3 } },
            { id: '1.11', who: 'YOU', do: { card: 4 }, text: 'Some cards hide a yellow circle with extra gold. Try this one.' },
            { id: '1.12', who: 'OPPONENT', do: { card: 1 }, point: { card: 1 }, text: 'Waterfront cards give a Diamond instead of gold.' },
            { id: '1.13', who: 'YOU', do: { card: 7 }, text: 'Take the other Waterfront card.' },
            { id: '1.14', who: 'OPPONENT', do: { card: 5 } },
            { id: '1.15', who: 'YOU', do: { card: 6 }, text: 'Flip the last card. When the whole row is face up, the auction begins.' }
        ]
    },
    {
        id: 'luxury-auction',
        chapter: 2,
        title: 'THE LUXURY AUCTION',
        learner: LEARNER,
        opponent: ROXANA,
        // The table as chapter 1 leaves it (a test checks that the two match).
        setup: {
            round: 1,
            rowFaceUp: true,
            players: withHoldings({ gold: 27, rerolls: 0, diamonds: 1 }, { gold: 22, diamonds: 1 }),
            rowBonus: { 1: [0, 0, 0, 0, 5, 0, 0, 0, 0] },
            luxury: { 1: 'Sports Car' }
        },
        dice: [],
        parts: ['LUXURY_AUCTIONS'],
        steps: [
            { id: '2.1', who: 'SAY', point: 'auction-card', text: 'Every round ends with an auction. The Luxury Card is turned face up: a Sports Car, worth 2 Prestige Points.' },
            { id: '2.2', who: 'YOU', do: { bid: 1 }, text: 'The start player bids first. The lowest bid is 1 Au.' },
            { id: '2.2b', who: 'OPPONENT', do: { bid: 4 } },
            { id: '2.3', who: 'SAY', point: 'auction', text: 'Roxana raises to 4 Au. Now you raise or pass. If you pass, you are out of this auction.' },
            { id: '2.4', who: 'YOU', do: { bid: 7 }, text: 'Raise by 3.' },
            { id: '2.4b', who: 'OPPONENT', do: { bid: 8 } },
            { id: '2.5', who: 'SAY', point: 'auction-bidders', text: 'Roxana raises to 8 Au. You can never bid more gold than you have, and neither can she.', note: 'In the board game your gold is secret, so nobody knows how high the others can go.' },
            { id: '2.6', who: 'YOU', do: { bid: 9 }, text: 'Raise by 1.' },
            { id: '2.6b', who: 'OPPONENT', do: { pass: true } },
            { id: '2.7', who: 'SAY', point: 'panel:0', text: 'Sold! You pay 9 Au to the Bank and take the card.' },
            { id: '2.8', who: 'SAY', point: 'prestige:0', side: 'right', text: 'Gold is only for bidding. At the end, Prestige Points decide who wins.' }
        ]
    },
    {
        id: 'diamonds',
        chapter: 3,
        title: 'DIAMONDS',
        learner: LEARNER,
        opponent: ROXANA,
        // "A few rounds later": round 5. The learner has 3 Diamonds; the hidden pile has the Tiger on top.
        setup: {
            round: 5,
            players: withHoldings({ gold: 12, rerolls: 0, diamonds: 3, luxury: ['Sports Car'] }, { gold: 10, diamonds: 1, luxury: ['Hotel'] }),
            rowBonus: { 5: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
            tradeTop: 'Tiger'
        },
        dice: [],
        parts: ['START_ROUND', 'FLIP_TURN'],
        steps: [
            { id: '3.1', who: 'SAY', point: 'diamonds:0', text: 'A few rounds later. You have 3 Diamonds.' },
            { id: '3.2', who: 'YOU', do: { card: 1 }, text: '4 Diamonds are traded for a Luxury Card, with no auction. Flip a Waterfront card.' },
            // The game's own popup says "You have 4 diamonds. Trade in for a Luxury Card."; the bubble adds the board game rule.
            { id: '3.3', who: 'YOU', do: { ok: true }, note: 'At the table, give 4 Diamonds to the Bank and take the top card of the face-down Luxury pile.' },
            { id: '3.4', who: 'SAY', point: 'won:0', text: 'A Tiger! It is worth 1 Prestige Point and gives you 2 re-roll counters.' },
            { id: '3.5', who: 'SAY', point: 'diamonds:0', text: 'The trade happens by itself every time you reach 4 Diamonds.' }
        ]
    },
    {
        id: 'the-ending',
        chapter: 4,
        title: 'THE ENDING',
        learner: LEARNER,
        opponent: ROXANA,
        // "The last round": round 8, a short row. Both players have 3 Prestige Points.
        setup: {
            round: 8,
            players: withHoldings({ gold: 14, rerolls: 2, diamonds: 0, luxury: ['Sports Car', 'Tiger'] }, { gold: 9, diamonds: 0, luxury: ['Hotel'] }),
            rowBonus: { 8: [0, 0, 0, 0, 0] },
            luxury: { 8: 'Shoes' },
            auctionMap: 'SPANISH_RIVER'
        },
        // The learner's Atlantic roll, Lagoon roll and re-roll.
        dice: [4, 3, 6],
        parts: ['START_ROUND', 'FLIPPING', 'LUXURY_AUCTIONS', 'PROPERTY_AUCTION', 'END_GAME'],
        // Row 8 has 5 cards: 0 = Lagoon, 1 = Waterfront, 2 = Block, 3 = Waterfront, 4 = Atlantic.
        steps: [
            { id: '4.1', who: 'SAY', point: 'row', text: 'The last round. Rows 7 and 8 are short, and the Auction Map Card lies at the end.' },
            { id: '4.2', who: 'SAY', point: 'properties', side: 'above', text: 'It hides which of the 3 Property Cards is sold at the very end. You and Roxana both have 3 Prestige Points.' },
            { id: '4.3', who: 'YOU', do: { card: 4 }, side: 'above', text: 'Try the Atlantic card: 3 or higher.' },
            { id: '4.4', who: 'OPPONENT', do: { card: 2 } },
            { id: '4.5', who: 'YOU', do: { card: 0 }, side: 'above', text: 'Now the Lagoon: 4 or higher.' },
            { id: '4.6', who: 'YOU', do: { reroll: true }, text: 'Missed. The Tiger gave you re-rolls: use one.' },
            { id: '4.7', who: 'OPPONENT', do: { card: 1 } },
            { id: '4.8', who: 'YOU', do: { card: 3 }, side: 'above', text: 'Flip the last card.' },
            { id: '4.9', who: 'YOU', do: { pass: true }, text: 'The last Luxury Card: Shoes, 1 Prestige Point. You may pass, and save your gold for the Property.' },
            { id: '4.9b', who: 'OPPONENT', do: { bid: 1 } },
            { id: '4.10', who: 'SAY', on: 'AUCTION_MAP_FLIPPED', point: 'auction-map', side: 'above', text: 'Now the Auction Map Card is flipped: Spanish River Park, worth 2 Prestige Points.', note: 'At the table, the other two Property Cards go back in the box.' },
            { id: '4.11', who: 'SAY', on: 'CHARACTER_GOLD', point: 'character:1', text: 'Some characters collect gold before "their" property is sold. Roxana takes 10 Au.' },
            { id: '4.12', who: 'YOU', do: { bid: 5 }, text: 'You need this card to win. Open with 5 Au.' },
            { id: '4.12b', who: 'OPPONENT', do: { bid: 10 } },
            { id: '4.13', who: 'YOU', do: { bid: 15 }, text: 'Raise by 5 again.' },
            { id: '4.13b', who: 'OPPONENT', do: { bid: 20 } },
            // Roxana has 21 Au: after this bid the rules make her pass (she cannot afford 22).
            { id: '4.14', who: 'YOU', do: { bid: 21 }, text: 'Roxana has 21 Au. Bid 21 and she cannot go higher.' },
            { id: '4.15', who: 'SAY', point: 'final', text: 'The game is over. You have 5 Prestige Points and Roxana has 4: you win!' },
            { id: '4.16', who: 'SAY', point: 'final', text: 'On a tie, the player with the Property Card wins. After that, the most gold left.' },
            { id: '4.17', who: 'END', point: 'final', text: 'That is all of Palm Beach. Gather your friends!', buttons: [{ label: 'PLAY A REAL GAME', value: 'PLAY' }, { label: 'CHAPTERS', value: 'CHAPTERS' }] }
        ]
    }
]);

export function getLesson(id) {
    const lesson = TUTORIAL_LESSONS.find(l => l.id === id);
    if (!lesson) throw new Error(`Unknown tutorial lesson: ${id}`);
    return lesson;
}

/** The lesson that follows this one, or null after the last. */
export function nextLesson(id) {
    const index = TUTORIAL_LESSONS.findIndex(l => l.id === id);
    return TUTORIAL_LESSONS[index + 1] || null;
}
