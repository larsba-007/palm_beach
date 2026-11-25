/**
 * SaveManager.js
 * Phase 1: Backend utility for handling game saves in Electron.
 */

import { GameConfig } from './config.js';

/**
 * The browser save slot. The Web Party Edition uses its own key so it can never
 * read or overwrite a save of another edition hosted on the same domain.
 */
export function getSaveKey(isWeb) {
    return isWeb ? 'bocaRatonWebSave' : 'bocaRatonSaveGame';
}
const SAVE_KEY = getSaveKey(GameConfig.isWeb);

// Detect environment
const isElectron = typeof window.require !== 'undefined';
const fs = isElectron ? window.require('fs').promises : null;
const path = isElectron ? window.require('path') : null;
const electron = isElectron ? window.require('electron') : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;

const DEFAULT_PAYLOAD = {
    progression: { 
        highestGambitCompleted: 0 
    },
    settings: { 
        isFullscreen: false 
    },
    audio: {
        musicVolume: 0.8,
        sfxVolume: 1.0,
        isMusicMuted: false,
        isSfxMuted: false
    },
    stats: { 
        totalGamesPlayed: 0, 
        totalWins: 0, 
        totalLosses: 0, 
        highestPrestigeScore: 0, 
        totalAuEarned: 0, 
        characterStats: {} 
    }
};

let cachedSavePath = null;

/**
 * Resolves the absolute path to the save file.
 * Uses app.getPath('userData') via IPC handler in main process.
 */
async function getSavePath() {
    if (!isElectron) return null;
    if (cachedSavePath) return cachedSavePath;
    try {
        const userDataPath = await ipcRenderer.invoke('app:get-path', 'userData');
        cachedSavePath = path.join(userDataPath, 'profile.json');
        return cachedSavePath;
    } catch (error) {
        console.error("[SaveManager] Failed to resolve save path:", error);
        throw error;
    }
}

export const SaveManager = {
    /**
     * Asynchronously read the file. 
     * If it doesn't exist, create it using the default payload and return the defaults. 
     * If it does exist, parse and return the data.
     */
    async loadData() {
        const mergeDefaults = (parsed) => {
            if (!parsed) return DEFAULT_PAYLOAD;
            return {
                ...DEFAULT_PAYLOAD,
                ...parsed,
                progression: { ...DEFAULT_PAYLOAD.progression, ...parsed.progression },
                settings: { ...DEFAULT_PAYLOAD.settings, ...parsed.settings },
                audio: { ...DEFAULT_PAYLOAD.audio, ...parsed.audio },
                stats: { ...DEFAULT_PAYLOAD.stats, ...parsed.stats }
            };
        };

        if (!isElectron) {
            console.log("[SaveManager] Running in web browser. Loading from localStorage...");
            try {
                const data = localStorage.getItem(SAVE_KEY);
                if (data) {
                    return mergeDefaults(JSON.parse(data));
                }
            } catch (e) {
                console.error("[SaveManager] Error loading from localStorage:", e);
            }
            return DEFAULT_PAYLOAD;
        }

        try {
            const savePath = await getSavePath();
            let rawData;
            try {
                rawData = await fs.readFile(savePath, 'utf8');
            } catch (readError) {
                // If profile.json is not found, try to migrate from savegame.json
                if (readError.code === 'ENOENT') {
                    const legacySavePath = path.join(path.dirname(savePath), 'savegame.json');
                    try {
                        rawData = await fs.readFile(legacySavePath, 'utf8');
                        console.log("[SaveManager] Found legacy savegame.json. Migrating to profile.json...");
                        // Write to new path
                        await fs.writeFile(savePath, rawData, 'utf8');
                        // Delete legacy savegame.json
                        await fs.unlink(legacySavePath).catch(err => {
                            console.error("[SaveManager] Failed to delete legacy savegame.json:", err);
                        });
                    } catch (legacyError) {
                        // If legacy savegame.json is also not found, rethrow the original ENOENT
                        if (legacyError.code === 'ENOENT') {
                            throw readError;
                        }
                        throw legacyError;
                    }
                } else {
                    throw readError;
                }
            }
            return mergeDefaults(JSON.parse(rawData));
        } catch (error) {
            // ENOENT means file doesn't exist
            if (error.code === 'ENOENT') {
                console.log("[SaveManager] Save file not found, creating defaults...");
                await this.saveData(DEFAULT_PAYLOAD);
                return DEFAULT_PAYLOAD;
            }
            console.error("[SaveManager] Error loading save data:", error);
            return DEFAULT_PAYLOAD;
        }
    },

    /**
     * Asynchronously stringify and write the provided data object to profile.json.
     * @param {Object} data - The data object to save.
     */
    async saveData(data) {
        if (!isElectron) {
            console.log("[SaveManager] Running in web browser. Saving to localStorage...");
            try {
                localStorage.setItem(SAVE_KEY, JSON.stringify(data));
            } catch (e) {
                console.error("[SaveManager] Error saving to localStorage:", e);
            }
            return;
        }

        try {
            const savePath = await getSavePath();
            const json = JSON.stringify(data, null, 2);
            await fs.writeFile(savePath, json, 'utf8');
        } catch (error) {
            console.error("[SaveManager] Error saving data:", error);
        }
    },

    /**
     * Wipes save data physically from disk and from localStorage, then triggers a hard window reload.
     */
    async hardWipeSaveData() {
        console.log("[SaveManager] Initiating hard wipe of save data...");

        // 1. Wipe localStorage
        try {
            if (GameConfig.isWeb) {
                // Web: only wipe this game's own keys (the domain may host other things)
                localStorage.removeItem(SAVE_KEY);
                localStorage.removeItem('dontShowTutorialRecommended');
            } else {
                localStorage.clear();
            }
            console.log("[SaveManager] localStorage cleared.");
        } catch (e) {
            console.error("[SaveManager] Error clearing localStorage:", e);
        }

        // 2. Physically delete profile.json from OS hard drive using Electron's fs
        if (isElectron) {
            try {
                const savePath = await getSavePath();
                if (savePath) {
                    await fs.unlink(savePath);
                    console.log("[SaveManager] Physically deleted save file:", savePath);
                }
            } catch (error) {
                // ENOENT means file wasn't there, which is fine
                if (error.code !== 'ENOENT') {
                    console.error("[SaveManager] Error physically deleting save file:", error);
                } else {
                    console.log("[SaveManager] Save file did not exist on disk.");
                }
            }
        }

        // 3. Trigger hard window reload
        console.log("[SaveManager] Hard reload triggered.");
        window.isSafeExit = true;
        window.location.reload();
    }
};
