import { SaveManager } from './SaveManager.js';

export const state = {
    turn: 0,
    mode: 'GAME',
    players: [],
    luxuryDecks: [],
    grid: [],
    auctions: { A: {}, B: {} },
    activeAuction: {},
    isProcessing: false,
    debugExtraTurns: 0,
    simulationMode: false,
    turnCount: 0,
    startTime: 0,
    aiMonitorVisible: false,
    abilityActive: false,
    rerollPending: null,
    ericMode: null,
    draftOrder: [],
    draftCandidates: {},
    openDraftPool: [],
    openDraftTaken: {},
    godMode: false,
    paused: false,
    tutorialStep: 0,
    actionUsedThisTurn: false,
    extraTurnActive: false,
    selectedPopupAction: null,
     JaegaRevealed: false,
    roxanaRevealed: false,
    gameOverTriggered: false,
    isGameOver: false,
    zoom: 1.0, // Added for reliable animation scaling
    luxuryTaxCounters: [0, 0, 0],
    carinaLockedCells: {},
    tournamentRound: 0,
    miznerVariations: [],
    settings: {
        fastAnimations: false,
        musicVolume: 0.8,
        sfxVolume: 1.0,
        isMuted: false,
        isSfxMuted: false,
        animationSpeed: 3,
        botTurnSpeed: 3,
        diceSpeed: 3,
        landmarkManualClose: false,
        landmarkDisplayDuration: 2,
        localName: 'LOCAL',
        hasSetLocalName: false
    },
    config: {
        humans: 1,
        bots: 3,
        difficulty: 'HARD',
        setupMode: 'RANDOM',
        showBotMoney: true,
        jaegaVariation: true,
        roxanaVariation: false,
        miznerVariation: false
    },
    playerProfile: {
        clearedGambits: [],
        seenGambitLevelIntros: [],
        unlockedCharacters: ['LEJA'],
        unlockedBots: ['ROXANA']
    },
    stats: {
        totalGamesPlayed: 0,
        totalWins: 0,
        totalLosses: 0,
        highestPrestigeScore: 0,
        totalAuEarned: 0,
        characterStats: {},
        highScores: [], // Migrated from localStorage
        unlockedAchievements: []
    }
};

export const saveProfile = async () => {
    const data = {
        progression: {
            highestGambitCompleted: state.playerProfile.clearedGambits.length > 0 ? Math.max(...state.playerProfile.clearedGambits) : 0,
            clearedGambits: state.playerProfile.clearedGambits,
            seenGambitLevelIntros: state.playerProfile.seenGambitLevelIntros || [],
            unlockedCharacters: state.playerProfile.unlockedCharacters,
            unlockedBots: state.playerProfile.unlockedBots
        },
        settings: {
            isFullscreen: !!document.fullscreenElement,
            animationSpeed: state.settings.animationSpeed ?? 3,
            botTurnSpeed: state.settings.botTurnSpeed ?? 3,
            diceSpeed: state.settings.diceSpeed ?? 3,
            landmarkManualClose: !!state.settings.landmarkManualClose,
            landmarkDisplayDuration: state.settings.landmarkDisplayDuration ?? 2,
            gameSpeed: state.settings.animationSpeed ?? 3, // Legacy backward compatibility
            localName: state.settings.localName || 'LOCAL',
            hasSetLocalName: !!state.settings.hasSetLocalName
        },
        audio: {
            musicVolume: state.settings.musicVolume,
            sfxVolume: state.settings.sfxVolume,
            isMusicMuted: !!state.settings.isMuted,
            isSfxMuted: !!state.settings.isSfxMuted
        },
        stats: state.stats
    };
    await SaveManager.saveData(data);
};

export const loadProfile = async () => {
    // 1. Try to load from SaveManager (File)
    const data = await SaveManager.loadData();
    
    // 2. Migration (inherited from Boca Raton): switched off for Palm Beach.
    // Palm Beach must never read Boca Raton saves ('bocaRatonProfile', 'boca_scores') in the same browser.
    const legacy = null;
    const legacyScores = null;

    if (data.progression.highestGambitCompleted === 0 && (legacy || legacyScores)) {
        try {
            console.log("[Profile] Migrating from localStorage...");
            if (legacy) {
                const parsed = JSON.parse(legacy);
                state.playerProfile = { ...state.playerProfile, ...parsed };
            }
            if (legacyScores) {
                state.stats.highScores = JSON.parse(legacyScores);
            }
            await saveProfile(); // Save the migrated data to the new file system
            return;
        } catch (e) {
            console.warn("[Profile] Migration failed:", e);
        }
    }

    // 3. Apply loaded data to state
    if (data) {
        state.playerProfile = {
            clearedGambits: data.progression.clearedGambits || [],
            seenGambitLevelIntros: data.progression.seenGambitLevelIntros || [],
            unlockedCharacters: data.progression.unlockedCharacters || ['LEJA'],
            unlockedBots: data.progression.unlockedBots || ['ROXANA']
        };
        
        // Handle audio settings loading (with migration path for older saves)
        if (data.audio) {
            state.settings.musicVolume = data.audio.musicVolume ?? 0.8;
            state.settings.sfxVolume = data.audio.sfxVolume ?? 1.0;
            state.settings.isMuted = !!data.audio.isMusicMuted;
            state.settings.isSfxMuted = !!data.audio.isSfxMuted;
        } else if (data.settings) {
            state.settings.musicVolume = data.settings.musicVolume !== undefined ? (data.settings.musicVolume / 100) : 0.8;
            state.settings.sfxVolume = data.settings.sfxVolume !== undefined ? (data.settings.sfxVolume / 100) : 1.0;
            state.settings.isMuted = !!data.settings.isMuted;
            state.settings.isSfxMuted = !!data.settings.isSfxMuted;
        } else {
            state.settings.musicVolume = 0.8;
            state.settings.sfxVolume = 1.0;
            state.settings.isMuted = false;
            state.settings.isSfxMuted = false;
        }

        if (data.settings) {
            // Pacing settings with graceful migration from old gameSpeed
            if (data.settings.animationSpeed !== undefined) {
                state.settings.animationSpeed = data.settings.animationSpeed ?? 3;
                state.settings.botTurnSpeed = data.settings.botTurnSpeed ?? 3;
                state.settings.diceSpeed = data.settings.diceSpeed ?? 3;
            } else if (data.settings.gameSpeed !== undefined) {
                // Migration: old 1 -> 2 (Very Fast), old 2 -> 3 (Snappy), old 3 -> 4 (Relaxed)
                const oldSpeed = data.settings.gameSpeed;
                const migrated = oldSpeed === 1 ? 2 : (oldSpeed === 2 ? 3 : 4);
                state.settings.animationSpeed = migrated;
                state.settings.botTurnSpeed = migrated;
                state.settings.diceSpeed = migrated;
            } else {
                state.settings.animationSpeed = 3;
                state.settings.botTurnSpeed = 3;
                state.settings.diceSpeed = 3;
            }

            state.settings.landmarkManualClose = !!data.settings.landmarkManualClose;
            state.settings.landmarkDisplayDuration = data.settings.landmarkDisplayDuration ?? 2;

            state.settings.localName = data.settings.localName || 'LOCAL';
            state.settings.hasSetLocalName = !!data.settings.hasSetLocalName;
        }
        
        if (data.stats) {
            state.stats = { ...state.stats, ...data.stats };
        }
        
        console.log("[Profile] Loaded progress from SaveManager");
    }
};