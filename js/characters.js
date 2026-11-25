// characters.js - The 10 Palm Beach characters, in the shape the menus, the draft and the Compendium expect.
//
// The RULES of each character (power, counters, Diamonds, initiative numbers) come from js/rules/data.js,
// so they are written in one place only. This file adds what the screens need: display name, hometown and story.
//
// id = the card's place in public/assets/character_cards_print.webp (5 x 2 cards):
//   0 Edith, 1 Roxana, 2 Addison, 3 Mr. Flagler, 4 Kingston / 5 Ms. Post, 6 Eric, 7 Bright Shell, 8 Carina, 9 Skip.
// (Edith sits where Boca's Leja was, Skip where Silviano was.)
//
// The stories are short versions of docs/palm_beach/compendium-lore-draft.md, fitted to the Palm Beach powers.
// DRAFT: Lars approves the final texts.

import { CHARACTERS as RULES_CHARACTERS } from './rules/data.js';

const DISPLAY = {
    EDITH: {
        hometown: 'Palm Beach',
        description: 'Hostess of the most talked-about garden parties on the island, always in pink. She knows what is coming before anyone else, because she has already peeked at the guest list.'
    },
    ROXANA: {
        hometown: 'Highland Beach',
        description: 'A screen star who spends the winter season on the coast, far from the studios. She loves the beach at Spanish River Park, and the Atlantic loves her back.'
    },
    ADDISON: {
        hometown: 'Palm Beach',
        description: 'In 1925, Palm Beach society architect Addison Mizner set out to turn Boca Raton into "the world\'s most architecturally beautiful playground". His Mediterranean style still shapes the coast.'
    },
    FLAGLER: {
        hometown: 'Palm Beach',
        description: 'Henry Flagler, co-founder of Standard Oil, brought his Florida East Coast Railway to the shores of Lake Worth in 1894 and opened the Royal Poinciana Hotel the same year. Palm Beach became America\'s winter playground.'
    },
    KINGSTON: {
        hometown: 'Gulf Stream',
        description: 'A former champion who now plays the club courts by the ocean. He always seems to know which property is coming up for sale.'
    },
    POST: {
        hometown: 'Palm Beach',
        description: 'Inspired by Marjorie Merriweather Post, heiress to her father\'s cereal business and builder of Mar-a-Lago. She collected art, gave grand parties and knew the value of everything.'
    },
    ERIC: {
        hometown: 'Boca Raton',
        description: 'Boca Raton has a tech history: the old IBM campus is today the Boca Raton Innovation Campus. Eric made his fortune in software and has an eye for the best blocks in town.'
    },
    BRIGHT_SHELL: {
        hometown: 'Boca Raton',
        description: 'Long before the mansions, the Jaega people lived on these barrier islands and along the lagoon, living from the sea. Bright Shell walks the shoreline at first light, before anyone else is up.'
    },
    CARINA: {
        hometown: 'Jupiter',
        description: 'A tour professional who knows every green between Palm Beach and Boca Raton. She is at her best by the lagoon, and she is always invited to the Gulf Stream auction.'
    },
    SKIP: {
        hometown: 'Palm Beach',
        description: 'Skip surfs Reef Road in Palm Beach, known since the 1960s as Florida\'s big-wave spot. Where everyone else hesitates at the Atlantic, he just paddles out.'
    }
};

export const CHARACTERS = RULES_CHARACTERS
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map(c => ({
        id: c.slot,
        pbId: c.id,                              // the character's id in the rules engine (js/rules/data.js)
        name: c.name.toUpperCase(),              // the menus compare names in capitals: "MR. FLAGLER", "BRIGHT SHELL"
        title: c.title.toUpperCase(),
        ability: c.ability,
        startPowers: c.powers,
        startRerolls: c.rerolls,
        startDiamonds: c.diamonds,
        startExtraTurns: 0,                      // Palm Beach has no Extra Turns (a Boca Raton rule)
        initiative: c.initiative,
        type: 'BALANCED',                        // inherited field (Boca AI temperament); not used in Palm Beach
        unlockGambit: 0,                         // inherited field (Boca campaign); not used in Palm Beach
        hometown: DISPLAY[c.id].hometown,
        description: DISPLAY[c.id].description
    }));
