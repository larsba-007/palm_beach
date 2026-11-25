// Palm Beach tutorial: the lessons. TEXTS AND CLICKS COME FROM TUTORIAL_SCRIPT.md (approved by Lars, 25 Nov 2026).
// To change a bubble text, change it here AND in TUTORIAL_SCRIPT.md: a test checks that the two say the same.
//
// How to read a step:
//   who: 'SAY'       a bubble with a NEXT button.
//   who: 'YOU'       the learner must click the thing in "do". Nothing else can be clicked.
//   who: 'OPPONENT'  Roxana does the thing in "do" by herself. With a text, the bubble is shown while she plays.
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
