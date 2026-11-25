

// Game Constants and Data Assets

// Helper for High-Res Assets - Threshold set to 1.25 to catch most high-DPI screens
const isHighRes = (typeof window !== 'undefined' && (window.devicePixelRatio || 1) >= 1.25);

// NOTE: To ensure Vite bundles assets correctly, we use explicit string literals inside new URL().
// We select the appropriate resolution at runtime based on the isHighRes flag.

export const GAME_SPRITE_URL = new URL(/* @vite-ignore */ "../assets/map_cards_back.webp", import.meta.url).href;

export const CARD_SPRITE_URL = new URL(/* @vite-ignore */ "../assets/map_cards_front.webp", import.meta.url).href;

export const LUXURY_CARD_SPRITE_URL = new URL(/* @vite-ignore */ "../assets/luxury_cards_front.webp", import.meta.url).href;

export const LUXURY_BACK_URL = new URL(/* @vite-ignore */ "../assets/luxury_card_back.webp", import.meta.url).href;

export const AUCTION_CARD_SPRITE_URL = new URL(/* @vite-ignore */ "../assets/auction_cards_front.webp", import.meta.url).href;

export const AUCTION_BACK_URL = new URL(/* @vite-ignore */ "../assets/auction_map_back.webp", import.meta.url).href;

export const CHARACTER_SPRITE_PRINT_URL = new URL(/* @vite-ignore */ "../assets/character_cards_print.webp", import.meta.url).href;



export const CHEAT_SHEET_URL = isHighRes
    ? new URL(/* @vite-ignore */ "../assets/cheat_sheet@2x.webp", import.meta.url).href
    : new URL(/* @vite-ignore */ "../assets/cheat_sheet.webp", import.meta.url).href;

export const TOURNAMENT_URL = isHighRes
    ? new URL(/* @vite-ignore */ "../assets/tournament@2x.webp", import.meta.url).href
    : new URL(/* @vite-ignore */ "../assets/tournament.webp", import.meta.url).href;

export const TUTORIAL_URL = isHighRes
    ? new URL(/* @vite-ignore */ "../assets/tutorial@2x.webp", import.meta.url).href
    : new URL(/* @vite-ignore */ "../assets/tutorial.webp", import.meta.url).href;

export const PLAYERMAT_URL = isHighRes
    ? new URL(/* @vite-ignore */ "../assets/playermat@2x.webp", import.meta.url).href
    : new URL(/* @vite-ignore */ "../assets/playermat.webp", import.meta.url).href;

// Property cards special case: Always load @2x for best quality
export const PROPERTY_SPRITE_URL = new URL(/* @vite-ignore */ "../assets/property_cards_front.webp", import.meta.url).href;

export const BOARD_ROWS = 8;
export const BOARD_COLS = 9;
export const CELL_SIZE = 250;
export const MAIN_BOARD_HEIGHT = 320;

import { GameConfig } from './config.js';

export const MUSIC_PLAYLIST = [
    new URL(/* @vite-ignore */ '../assets/audio/game_track_01.mp3', import.meta.url).href,
    new URL(/* @vite-ignore */ '../assets/audio/game_track_02.mp3', import.meta.url).href,
    new URL(/* @vite-ignore */ '../assets/audio/game_track_03.mp3', import.meta.url).href,
    new URL(/* @vite-ignore */ '../assets/audio/game_track_04.mp3', import.meta.url).href
];

export const MUSIC_PLAYLIST_HQ = [
    new URL(/* @vite-ignore */ '../assets/audio/game_track_01_hq.aac', import.meta.url).href,
    new URL(/* @vite-ignore */ '../assets/audio/game_track_02_hq.aac', import.meta.url).href,
    new URL(/* @vite-ignore */ '../assets/audio/game_track_03_hq.aac', import.meta.url).href,
    new URL(/* @vite-ignore */ '../assets/audio/game_track_04_hq.aac', import.meta.url).href
];

export const ASSETS = {
    AUDIO: {
        flip: new URL(/* @vite-ignore */ '../assets/audio/card_flip.mp3', import.meta.url).href,
        gold_small: new URL(/* @vite-ignore */ '../assets/audio/gold_small.mp3', import.meta.url).href,
        gold_large: new URL(/* @vite-ignore */ '../assets/audio/gold_large.mp3', import.meta.url).href,
        pay: new URL(/* @vite-ignore */ '../assets/audio/pay_gold.mp3', import.meta.url).href,
        dice_loop: new URL(/* @vite-ignore */ '../assets/audio/dice_loop.mp3', import.meta.url).href,
        dice_success: new URL(/* @vite-ignore */ '../assets/audio/dice_success.mp3', import.meta.url).href,
        dice_fail: new URL(/* @vite-ignore */ '../assets/audio/dice_fail.mp3', import.meta.url).href,
        auction_alert: new URL(/* @vite-ignore */ '../assets/audio/auction_alert.mp3', import.meta.url).href,
        bid: new URL(/* @vite-ignore */ '../assets/audio/bid_raise.mp3', import.meta.url).href,
        fold: new URL(/* @vite-ignore */ '../assets/audio/bid_fold.mp3', import.meta.url).href,
        win: new URL(/* @vite-ignore */ '../assets/audio/auction_win.mp3', import.meta.url).href,
        bonus_card: new URL(/* @vite-ignore */ '../assets/audio/bonus_card.mp3', import.meta.url).href,
        winner_song: new URL(/* @vite-ignore */ '../assets/audio/winner.mp3', import.meta.url).href,
        // Dynamic Title Theme
        title_theme: GameConfig.isElectron
            ? new URL(/* @vite-ignore */ '../assets/audio/startscreen64_hq.aac', import.meta.url).href
            : new URL(/* @vite-ignore */ '../assets/audio/startscreen64.mp3', import.meta.url).href,
        the_gong: new URL(/* @vite-ignore */ '../assets/audio/the_gong.mp3', import.meta.url).href,
        turn_switch: new URL(/* @vite-ignore */ '../assets/audio/switch_002.ogg', import.meta.url).href
    }
};

export { CHARACTERS } from './characters.js';


export const AUCTION_SLOTS = [
    { r: 1, c: 3 }, { r: 1, c: 4 }, { r: 1, c: 5 }, { r: 1, c: 6 },
    { r: 2, c: 3 }, { r: 2, c: 4 }, { r: 2, c: 5 }, { r: 2, c: 6 },
    { r: 5, c: 3 }, { r: 5, c: 4 }, { r: 5, c: 5 }, { r: 5, c: 6 },
    { r: 6, c: 3 }, { r: 6, c: 4 }, { r: 6, c: 5 }, { r: 6, c: 6 },
];

export const PROPERTY_CARDS = [
    { id: 0, name: "Mar-a-Lago", points: 4, spriteX: -500, mapY: 0 },
    { id: 1, name: "Gulf Stream", points: 3, spriteX: -250, mapY: -500 },
    { id: 2, name: "Spanish River", points: 2, spriteX: 0, mapY: -1000 }
];

export const FISCAL_TYPES = ['SAVER', 'MODERATE', 'SPENDER', 'CRAZY_SPENDER'];
export const LUXURY_PREFS = ['SAFE', 'SEMI_SAFE', 'RISKTAKER', 'RANDOM'];

export const TRAIT_DESCRIPTIONS = {
    PERSONALITY: {
        'SAVER': "Hoards gold. Won't buy Luxury cards until they have 22+ Gold. Bids very low in auctions (Value * 6 - 2).",
        'MODERATE': "Buys at 15+ Gold. Bids normally.",
        'SPENDER': "Buys at 10+ Gold. Bids aggressively (Value * 6 + 3).",
        'CRAZY_SPENDER': "Buys immediately (5+ Gold)."
    },
    LUXURY_PREF: {
        'SAFE': "Always tries the 5-cost deck (guaranteed success) first.",
        'RISKTAKER': "Goes for the 15-cost deck (high risk) first.",
        'SEMI_SAFE': "Mid-tier preference.",
        'RANDOM': "Picks a random deck every turn."
    }
};

export const GAMBIT_LEVEL_INFO = [
    {
        level: 1,
        subtitle: "INTRO",
        lead: "LEARN THE GAME",
        body: "Welcome to Gold Coast Gambits. This level teaches the core rules one system at a time before putting everything together in your first real match.",
        locals: ["BRIGHTSHELL", "LEJA"],
        visitors: ["SUPERBOY", "GOOBER"],
        expect: [
            "Learn Prestige, Luxury Cards and Map Cards.",
            "Learn Row & Column bonuses, Landmarks and Property Auctions.",
            "Learn how Local special abilities work."
        ],
        setupTags: ["GUIDED TUTORIAL", "BOCA RATON", "RED REEF", "OPEN LUXURY"],
        footer: "Finish the lessons. Then pass The Exam.",
        primaryCta: "START GAMBIT 1"
    },
    {
        level: 2,
        subtitle: "EXPANSION",
        lead: "THE BOARD OPENS UP",
        body: "The tutorial is over. More opponents, more board setups and more ways to win are now in play.",
        locals: [],
        visitors: ["SURFER DUDE"],
        expect: [
            "Race to Prestige or build a Luxury collection.",
            "Win while collecting from all three Luxury piles.",
            "Start combining Map-region objectives with the final victory."
        ],
        setupTags: ["SPANISH VARIATION", "MIZNER VARIATION", "OPEN AUCTIONS", "PICK 2"],
        footer: "Complete 4 of 5 Gambits to unlock Level 3."
    },
    {
        level: 3,
        subtitle: "CONTROL",
        lead: "WIN WITH A PLAN",
        body: "Objectives now ask you to control specific parts of the game instead of simply scoring quickly.",
        locals: ["KINGSTONE"],
        visitors: ["BOSS CAT"],
        expect: [
            "Fight for Property Auctions.",
            "Target specific Luxury Cards.",
            "Combine Lagoon and Atlantic Map goals with winning the match."
        ],
        setupTags: ["OPEN AUCTIONS", "HIDDEN BOT MONEY", "PICK 2", "MULTI-PART OBJECTIVES"],
        footer: "Complete 4 of 5 Gambits to unlock Level 4."
    },
    {
        level: 4,
        subtitle: "PRESSURE",
        lead: "MORE PLAYERS. MORE CONDITIONS.",
        body: "The challenges become busier. You will need to balance immediate goals against the full board state.",
        locals: ["SILVIANO"],
        visitors: ["ROBOT"],
        expect: [
            "Faster Prestige and Luxury races.",
            "Waterfront-specific Map objectives.",
            "Challenges that combine several requirements at once."
        ],
        setupTags: ["OPEN LUXURY", "OPEN AUCTIONS", "OPEN DRAFT", "HIDDEN BOT MONEY"],
        footer: "Complete 4 of 5 Gambits to unlock Level 5."
    },
    {
        level: 5,
        subtitle: "RESTRICTIONS",
        lead: "WIN YOUR WAY — BUT FOLLOW THE RULES",
        body: "Some Gambits now take familiar systems and place restrictions on how you are allowed to win.",
        locals: ["MS. POST"],
        visitors: ["PIRATE"],
        expect: [
            "Win while avoiding certain rewards.",
            "Push higher Prestige targets.",
            "Combine Luxury, Atlantic and each-pile requirements."
        ],
        setupTags: ["NO-PROPERTY CHALLENGE", "OPEN DRAFT", "HIDDEN BOT MONEY", "MIXED BOARD VARIATIONS"],
        footer: "Complete 4 of 5 Gambits to unlock Level 6."
    },
    {
        level: 6,
        subtitle: "SPECIALIZATION",
        lead: "BUILD A STRATEGY AROUND THE OBJECTIVE",
        body: "The campaign now expects you to specialize. Picking the right part of the board matters as much as scoring Prestige.",
        locals: ["ADDISON"],
        visitors: ["FLAMINGO QUEEN"],
        expect: [
            "Hunt specific high-value Luxury Cards.",
            "Race for Luxury sets and Prestige.",
            "Take control of the Block region."
        ],
        setupTags: ["SPANISH", "RED REEF", "MIZNER", "OPEN DRAFT", "HIDDEN BOT MONEY"],
        footer: "Complete 4 of 5 Gambits to unlock Level 7."
    },
    {
        level: 7,
        subtitle: "ADVANCED PLAY",
        lead: "THE OBJECTIVES START TO STACK",
        body: "Strong opponents meet more demanding combinations of Luxury, Map and endgame goals.",
        locals: ["ROXANA"],
        visitors: ["MAGICIAN"],
        expect: [
            "Manage several objectives at the same time.",
            "Target Lagoon and Waterfront Atlantic cards.",
            "Make Open Draft choices under heavier pressure."
        ],
        setupTags: ["OPEN LUXURY", "OPEN AUCTIONS", "OPEN DRAFT", "HIDDEN BOT MONEY"],
        footer: "Complete 4 of 5 Gambits to unlock Level 8."
    },
    {
        level: 8,
        subtitle: "ELITE PRESSURE",
        lead: "EVERY PART OF THE BOARD MATTERS",
        body: "The campaign now asks you to balance economy, Luxury collection and precise Map objectives against stronger Visitors.",
        locals: ["MR. FLAGLER"],
        visitors: ["THE TWINS"],
        expect: [
            "Waterfront Lagoon objectives.",
            "Luxury-from-every-pile endgame plans.",
            "Mixed Lagoon and Atlantic objectives with targeted Luxury Cards."
        ],
        setupTags: ["HIDDEN BOT MONEY", "OPEN DRAFT", "OPEN / CLOSED LUXURY", "OPEN / CLOSED AUCTIONS"],
        footer: "Complete 4 of 5 Gambits to unlock Level 9."
    },
    {
        level: 9,
        subtitle: "MASTERY",
        lead: "PLAY CLEAN. MISTAKES COST MORE NOW.",
        body: "The strongest Visitors begin to appear, and the objectives demand efficient use of the whole game.",
        locals: ["CARINA"],
        visitors: ["GRAN GRAN"],
        expect: [
            "Large Atlantic and Block requirements.",
            "Luxury collection under strong opposition.",
            "Complex endgame conditions with little room for wasted turns."
        ],
        setupTags: ["8 BLOCK", "OPEN DRAFT", "HIDDEN BOT MONEY", "ELITE VISITORS"],
        footer: "Complete 4 of 5 Gambits to unlock Level 10."
    },
    {
        level: 10,
        subtitle: "FINAL EXAM",
        lead: "PROVE YOU CAN PLAY EVERYTHING",
        body: "The final level introduces the last Local and then tests the systems, setups and objective combinations learned throughout the campaign.",
        locals: ["ERIC"],
        visitors: ["GRAN GRAN", "THE TWINS", "MAGICIAN"],
        visitorGroupTitle: "ELITE VISITORS RETURN",
        expect: [
            "Block, Lagoon and Waterfront objectives.",
            "Open Draft and hidden-information games.",
            "Multi-part endgame objectives against the strongest Visitor combinations."
        ],
        setupTags: ["OPEN DRAFT", "HIDDEN BOT MONEY", "ALL MAJOR BOARD VARIATIONS", "FINAL CHALLENGES"],
        footer: "Five Gambits. Finish the campaign."
    }
];