import { GAME_VARIATIONS, DRAFT_MODES } from './unlock_data.js';
import { CHARACTERS } from './data.js';
import { botRoster } from './bots.js';
import { V1_CHARACTER_IDS, getCharacter } from './rules/data.js';

// The names of the characters that are open in version 1, in capitals as js/characters.js writes them.
const V1_CHARACTER_NAMES = V1_CHARACTER_IDS.map(id => getCharacter(id).name.toUpperCase());

export const UnlockManager = {
  
  /**
   * 1. Get the Source of Truth
   * We rely on app.getHighestClearedGambit(), but we add a direct state fallback
   * just in case this is called before the app object is fully initialized.
   */
  getHighestCleared() {
    let highest = 0;
    if (window.app && typeof window.app.getHighestClearedGambit === 'function') {
      highest = window.app.getHighestClearedGambit();
    } else if (window.state && window.state.playerProfile && Array.isArray(window.state.playerProfile.clearedGambits)) {
      const cleared = window.state.playerProfile.clearedGambits;
      if (cleared.length > 0) highest = Math.max(...cleared);
    }
    // Ensure we always return a valid positive integer (fallback to 0)
    return (typeof highest === 'number' && !isNaN(highest) && highest !== -Infinity && highest > 0) ? highest : 0;
  },

  isLevelUnlocked(level) {
    if (level === 1) return true;
    const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
    if (isDemo && level > 4) return false;

    if (!window.state || !window.state.playerProfile || !Array.isArray(window.state.playerProfile.clearedGambits)) {
      return false;
    }

    const cleared = window.state.playerProfile.clearedGambits;
    const prevLevel = level - 1;
    const startId = (prevLevel - 1) * 5 + 1;
    const endId = prevLevel * 5;
    
    let clearedCount = 0;
    for (let id = startId; id <= endId; id++) {
      if (cleared.includes(id)) {
        clearedCount++;
      }
    }
    return clearedCount >= 4;
  },

  /**
   * 2. Gambit Progression Rules
   */
  isGambitUnlocked(gambitId) {
    const level = Math.ceil(gambitId / 5);
    return this.isLevelUnlocked(level);
  },

  /**
   * 3. Asset Rules
   */
  isEntityUnlocked(entity) {
    if (!entity || typeof entity.unlockGambit === 'undefined') return true;

    const isFullGame = window.GameConfig && window.GameConfig.isFullGame;

    if (!isFullGame) {
      // In the Demo: Whitelisted locals & visitors are ALWAYS unlocked (both in compendium, custom board game, and campaign)
      // PALM BEACH version 1 (Lars, 25 Nov 2026): Roxana, Mr. Flagler, Bright Shell, Carina, Skip. The other five are locked.
      const demoChars = V1_CHARACTER_NAMES;
      if (entity.name && demoChars.includes(entity.name.toUpperCase()) && entity.intelligenceLevel === undefined) {
        return true;
      }
      
      const isVisitor = entity.intelligenceLevel !== undefined;
      if (isVisitor && entity.id >= 1 && entity.id <= 5) {
        return true;
      }

      // Non-whitelisted entities are locked in the demo
      return false;
    }

    // Full Game:
    const inCustomMatch = !window.state.activeGambitId;
    if (inCustomMatch) return true; // Unlock everything in custom board games

    // Otherwise, unlock based on campaign progression
    return this.getHighestCleared() >= entity.unlockGambit;
  },

  getVariationData(key) {
    if (typeof key !== 'string') return { name: 'Unknown', unlockGambit: 99 };
    // Strip out "VARIATION"
    let safeKey = key.toUpperCase().replace('VARIATION', '').trim().replace(/\s+/g, '_');
    
    // Explicit Legacy Mapping
    if (safeKey === 'ROXANA') safeKey = 'SPANISH';
    if (safeKey === 'JAEGA') safeKey = 'RED_REEF';
    if (safeKey === 'TOURNAMENT') safeKey = 'MIZNER';
    if (safeKey === 'NONE') safeKey = 'BOCA_RATON';

    return GAME_VARIATIONS[safeKey] || { name: key, unlockGambit: 99 };
  },

  getDraftModeData(key) {
    if (typeof key !== 'string') return { name: 'Unknown', unlockGambit: 99 };
    // Strip out "DRAFT" or "MODE"
    let safeKey = key.toUpperCase().replace('DRAFT', '').replace('MODE', '').trim().replace(/\s+/g, '_');
    
    // Explicit Legacy Mapping
    if (safeKey === 'PAIR') safeKey = 'PICK_2';
    if (safeKey === 'OPEN') safeKey = 'OPEN_DRAFT';
    if (safeKey === 'RANDOM') safeKey = 'PRE_SELECTED';

    return DRAFT_MODES[safeKey] || { name: key, unlockGambit: 99 };
  },

  isVariationUnlocked(key) {
    const data = this.getVariationData(key);
    if (data.unlockGambit === 0) return true;

    const isFullGame = window.GameConfig && window.GameConfig.isFullGame;
    const inCustomMatch = !window.state.activeGambitId;

    // 1. Full Game Sandbox: Unlock everything
    if (isFullGame && inCustomMatch) return true;

    // 2. Demo Sandbox: Whitelist specific boards (including legacy UI keys)
    if (!isFullGame && inCustomMatch) {
        const whitelist = ['BOCA_RATON', 'SPANISH', 'RED_REEF', 'NONE', 'ROXANA', 'JAEGA'];
        if (whitelist.includes(key.toUpperCase())) return true;
    }

    // 3. Default Campaign Progression
    return this.getHighestCleared() >= data.unlockGambit;
  },

  isDraftModeUnlocked(key) {
    const data = this.getDraftModeData(key);
    if (data.unlockGambit === 0) return true; // Absolute failsafe for base assets

    const isFullGame = window.GameConfig && window.GameConfig.isFullGame;
    const inCustomMatch = !window.state.activeGambitId;

    // Demo overrides: PICK_2 is locked in Demo (the Web Party Edition keeps it available)
    const isWeb = window.GameConfig && window.GameConfig.isWeb;
    if (!isFullGame && !isWeb && (key.toUpperCase() === 'PAIR' || key.toUpperCase() === 'PICK_2')) {
        return false;
    }

    // 1. Full Game Sandbox
    if (isFullGame && inCustomMatch) return true;

    // 2. Demo Sandbox: Whitelist basic modes (and Open Draft)
    if (!isFullGame && inCustomMatch) {
        const whitelist = ['PRE_SELECTED', 'RANDOM', 'PAIR', 'PICK_2', 'OPEN', 'OPEN_DRAFT'];
        if (whitelist.includes(key.toUpperCase())) return true;
    }

    // 3. Default Campaign Progression
    return this.getHighestCleared() >= data.unlockGambit;
  },

  /**
   * 4. Feature Rules
   */
  isCustomMatchUnlocked() {
    return this.isLevelUnlocked(2); 
  },

  /**
   * 5. Progression Feedback (Celebration Helper)
   */
  getUnlocksForGambit(gambitId) {
    const id = parseInt(gambitId, 10);
    console.log('[UnlockManager] Checking unlocks for Gambit:', id);
    const unlocks = [];

    // 1. Characters (Locals)
    const newChars = CHARACTERS.filter(c => c.unlockGambit === id);
    newChars.forEach(c => unlocks.push({ type: 'Local', name: c.name, id: c.id }));

    // 2. Bots (Visitors)
    const newBots = botRoster.filter(b => b.unlockGambit === id);
    newBots.forEach(b => unlocks.push({ type: 'Visitor', name: b.name, id: b.id }));

    // 3. Variations
    Object.entries(GAME_VARIATIONS).forEach(([key, data]) => {
      if (data.unlockGambit === id) {
        unlocks.push({ type: 'Variation', name: data.name });
      }
    });

    // 4. Draft Modes
    Object.entries(DRAFT_MODES).forEach(([key, data]) => {
      if (data.unlockGambit === id) {
        unlocks.push({ type: 'Draft Mode', name: data.name });
      }
    });

    console.log('[UnlockManager] Found unlocks:', unlocks);
    return unlocks;
  },


};

// Expose to window for easy debugging in the console
window.UnlockManager = UnlockManager;
