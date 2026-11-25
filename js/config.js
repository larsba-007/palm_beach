/**
 * Resolves the three edition flags from the Vite edition string.
 * - 'full' -> Steam Full
 * - 'web'  -> Web Party Edition (inherits Demo restrictions, opts out via explicit isWeb checks)
 * - anything else (unset) -> Steam Demo (the default, isolated safe mode)
 * Exactly one of isFullGame / isDemo / isWeb is true.
 */
export function resolveEdition(edition) {
    return {
        isFullGame: edition === 'full',
        isWeb: edition === 'web',
        isDemo: edition !== 'full' && edition !== 'web'
    };
}

const edition = resolveEdition(import.meta.env?.VITE_GAME_EDITION);

export const GameConfig = {
    // Detect Electron via nodeIntegration presence
    isElectron: typeof navigator !== 'undefined' && (
        navigator.userAgent.toLowerCase().indexOf(' electron/') > -1 ||
        !!(window.process && window.process.versions && window.process.versions.electron) ||
        !!(window.require && window.require('electron'))
    ),

    // Check Vite environment variables for edition (default isolated safe Demo mode)
    isFullGame: edition.isFullGame,
    isDemo: edition.isDemo,

    // Web Party Edition (browser build, no Steam/Electron). Steam builds never set this.
    isWeb: edition.isWeb
};
