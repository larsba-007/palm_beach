import { state } from './state.js';

export const ACHIEVEMENTS = [
    // --- GAMBITS ---
    {
        id: 'TUTORIAL_COMPLETE',
        title: 'Level 1',
        description: 'Complete the Tutorial (Gambits 1-4).',
        condition: (s) => [1, 2, 3, 4].every(id => s.playerProfile?.clearedGambits?.includes(id))
    },
    {
        id: 'GAMBIT_LEVEL_2',
        title: 'Level 2',
        description: 'Clear Gambit Level 2.',
        condition: (s) => s.playerProfile?.clearedGambits?.includes(2)
    },
    {
        id: 'GAMBIT_LEVEL_4',
        title: 'Level 4',
        description: 'Clear Gambit Level 4.',
        condition: (s) => s.playerProfile?.clearedGambits?.includes(4)
    },
    {
        id: 'GAMBIT_LEVEL_6',
        title: 'Level 6',
        description: 'Clear Gambit Level 6.',
        condition: (s) => s.playerProfile?.clearedGambits?.includes(6)
    },
    {
        id: 'GAMBIT_LEVEL_8',
        title: 'Level 8',
        description: 'Clear Gambit Level 8.',
        condition: (s) => s.playerProfile?.clearedGambits?.includes(8)
    },
    {
        id: 'GAMBIT_LEVEL_10',
        title: 'Level 10',
        description: 'Clear Gambit Level 10.',
        condition: (s) => s.playerProfile?.clearedGambits?.includes(10)
    },
    {
        id: 'ALL_GAMBITS_CLEARED',
        title: 'All 50 Gambits',
        description: 'Clear all 50 Gambits.',
        condition: (s) => (s.playerProfile?.clearedGambits?.length || 0) >= 50
    },

    // --- ECONOMY ---
    {
        id: 'EARN_FIRST_AU',
        title: 'Earn First Au',
        description: 'Earn your first Au.',
        condition: (s) => (s.stats?.totalAuEarned > 0) || (s.players?.find(p => p.type === 'HUMAN')?.totalGold > 0)
    },
    {
        id: 'HOARD_75_AU',
        title: 'Hoard 75 Au',
        description: 'Have 75 Au at one time.',
        condition: (s) => {
            const human = s.players?.find(p => p.type === 'HUMAN');
            return human && human.gold >= 75;
        }
    },
    {
        id: 'HOARD_100_AU',
        title: 'Hoard 100 Au',
        description: 'Have 100 Au at one time.',
        condition: (s) => {
            const human = s.players?.find(p => p.type === 'HUMAN');
            return human && human.gold >= 100;
        }
    },
    {
        id: 'SPEND_50_AU',
        title: 'Spend 50 Au',
        description: 'Spend over 50 Au in a single transaction.'
    },

    // --- PRESTIGE ---
    {
        id: 'FIRST_PRESTIGE_POINT',
        title: 'First Prestige Point',
        description: 'Earn your first Prestige Point.',
        condition: (s) => {
            const human = s.players?.find(p => p.type === 'HUMAN');
            return human && human.prestige >= 1;
        }
    },
    {
        id: 'REACH_10_PRESTIGE_POINTS',
        title: 'Reach 10 Prestige Points',
        description: 'Reach 10 Prestige Points in a single game.',
        condition: (s) => {
            const human = s.players?.find(p => p.type === 'HUMAN');
            return human && human.prestige >= 10;
        }
    },
    {
        id: 'REACH_15_PRESTIGE_POINTS',
        title: 'Reach 15 Prestige Points',
        description: 'Reach 15 Prestige Points in a single game.',
        condition: (s) => {
            const human = s.players?.find(p => p.type === 'HUMAN');
            return human && human.prestige >= 15;
        }
    },
    {
        id: 'REACH_20_PRESTIGE_POINTS',
        title: 'Reach 20 Prestige Points',
        description: 'Reach 20 Prestige Points in a single game.',
        condition: (s) => {
            const human = s.players?.find(p => p.type === 'HUMAN');
            return human && human.prestige >= 20;
        }
    },

    // --- CARDS ---
    {
        id: 'FIRST_MAP_CARD',
        title: 'First Map Card',
        description: 'Flip your very first Map Card.',
        condition: (s) => {
            const human = s.players?.find(p => p.type === 'HUMAN');
            return human && human.mapCardsFlipped > 0;
        }
    },
    {
        id: 'ALL_1_POINT_LUXURY_CARDS',
        title: 'All 1-Point Luxury Cards',
        description: 'Own all 1-point Luxury Cards at the same time.',
        condition: (s) => {
            const human = s.players?.find(p => p.type === 'HUMAN');
            if (!human) return false;
            const ownedIndices = human.inventory.filter(c => c.type === 'LUXURY' && c.points === 1).map(c => c.spriteIndex);
            const hasMagician = s.players?.some(p => p.type === 'BOT' && p.botId === 5);
            const requiredIndices = hasMagician ? [1, 2, 3, 4] : [0, 1, 2, 3, 4];
            return requiredIndices.every(idx => ownedIndices.includes(idx));
        }
    },
    {
        id: 'WIN_MAR_A_LAGO',
        title: 'Win Mar-a-Lago',
        description: 'Win the Mar-a-Lago card.',
        condition: (s) => {
            const human = s.players?.find(p => p.type === 'HUMAN');
            return human && human.inventory?.some(c => c.name === 'Mar-a-Lago');
        }
    },
    {
        id: 'WIN_6_LAGOON_CARDS',
        title: 'Win 6 Lagoon Cards',
        description: 'Win 6 of the 8 Lagoon cards in a single game.',
        condition: (s) => {
            const human = s.players?.find(p => p.type === 'HUMAN');
            return human && (human.lagoonFlipped || 0) >= 6;
        }
    },
    {
        id: 'BUY_2_LUXURY_CARDS',
        title: 'Buy 2 Luxury Cards',
        description: 'Purchase two or more Luxury Cards on a single turn.'
    },

    // --- MECHANICS ---
    {
        id: 'SUCCESSFUL_RE_ROLL',
        title: 'Successful Re-Roll',
        description: 'Use a re-roll successfully.'
    },
    {
        id: 'MISS_3_RE_ROLLS',
        title: 'Miss 3 Re-rolls',
        description: 'Miss 3 re-rolls in a row.'
    },
    {
        id: 'USE_A_CHARACTER_POWER',
        title: 'Use a Character Power',
        description: "Use a character's built-in power for the first time."
    },
    {
        id: 'TAKE_AN_EXTRA_TURN',
        title: 'Take an Extra Turn',
        description: 'Take an extra turn.'
    },
    {
        id: 'SKIP_SAME_PLAYER_TWICE',
        title: 'Skip Same Player Twice',
        description: 'Skip the same player twice in a single game.'
    },
    {
        id: 'FLAGLER_DOMINATES',
        title: 'Flagler Dominates',
        description: "On Mr. Flagler's first turn, win a Luxury card worth 3 points."
    },

    // --- RIVALS ---
    {
        id: 'PLAY_FIRST_CUSTOM_MATCH',
        title: 'Play First Custom Board Game',
        description: 'Play your first Custom Board Game.'
    },
    {
        id: 'FOUR_PLAYER_LOCAL_MATCH',
        title: '4-Player Local Match',
        description: 'Play a Custom Board Game with 4 local players.'
    },
    {
        id: 'DEFEAT_GRANDMA_BOT',
        title: 'Defeat Grandma Bot',
        description: 'Defeat the Grandma Bot.',
        condition: (s) => s.stats?.defeatedBots?.includes(9)
    },
    {
        id: 'DEFEAT_PIRATE_BOT',
        title: 'Defeat Pirate Bot',
        description: 'Defeat the Pirate Bot.',
        condition: (s) => s.stats?.defeatedBots?.includes(4)
    },
    {
        id: 'DEFEAT_FLAMINGO_BOT',
        title: 'Defeat Flamingo Bot',
        description: 'Defeat the Flamingo Bot.',
        condition: (s) => s.stats?.defeatedBots?.includes(3)
    },
    {
        id: 'DEFEAT_ALL_VISITORS',
        title: 'Defeat All Visitors',
        description: 'Beat all the Visitors at least once.',
        condition: (s) => [3, 4, 9].every(id => s.stats?.defeatedBots?.includes(id))
    },
    {
        id: 'WIN_WITH_ALL_CHARACTERS',
        title: 'Win With All Characters',
        description: 'Win at least one Custom Board Game with every available character.',
        condition: (s) => (s.stats?.wonCharacters?.length || 0) >= 10
    },

    // --- TIME ---
    {
        id: 'WIN_UNDER_10_MINUTES',
        title: 'Win Under 10 Minutes',
        description: 'Win a game in under 10 minutes.'
    },
    {
        id: 'PLAY_OVER_2_HOURS',
        title: 'Play Over 2 Hours',
        description: 'Complete a grueling game that lasts over 2 hours.'
    },
    {
        id: 'PLAY_50_GAMES',
        title: 'Play 50 Games',
        description: 'Play 50 total games.',
        condition: (s) => (s.stats?.totalGamesPlayed || 0) >= 50
    }
];

export class AchievementManager {
    static check() {
        if (!state.stats) return [];
        
        if (!state.stats.unlockedAchievements) {
            state.stats.unlockedAchievements = [];
        }
        
        const newlyUnlocked = [];
        
        ACHIEVEMENTS.forEach(ach => {
            if (!state.stats.unlockedAchievements.includes(ach.id)) {
                if (ach.condition && ach.condition(state)) {
                    state.stats.unlockedAchievements.push(ach.id);
                    newlyUnlocked.push(ach);
                    this.notify(ach);
                }
            }
        });
        
        return newlyUnlocked;
    }

    static unlock(id) {
        if (!state.stats) return;
        if (!state.stats.unlockedAchievements) {
            state.stats.unlockedAchievements = [];
        }
        if (state.stats.unlockedAchievements.includes(id)) return;
        
        const ach = ACHIEVEMENTS.find(a => a.id === id);
        if (ach) {
            state.stats.unlockedAchievements.push(id);
            this.notify(ach);
            if (window.saveProfile) {
                window.saveProfile();
            }
        }
    }
    
    static notify(ach) {
        console.log(`[Achievement Unlocked] ${ach.title}: ${ach.description}`);
        
        if (typeof window !== 'undefined' && window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.send('steam:unlock-achievement', ach.id);
            } catch (e) {
                console.error("[Steamworks] IPC Achievement unlock error:", e);
            }
        }
    }

    static syncWithSteam() {
        if (!state.stats || !state.stats.unlockedAchievements) return;
        if (typeof window !== 'undefined' && window.require) {
            try {
                const { ipcRenderer } = window.require('electron');
                state.stats.unlockedAchievements.forEach(id => {
                    ipcRenderer.send('steam:unlock-achievement', id);
                });
                console.log(`[Steamworks] Synchronized ${state.stats.unlockedAchievements.length} achievements with Steam.`);
            } catch (e) {
                console.error("[Steamworks] Startup sync error:", e);
            }
        }
    }
}
