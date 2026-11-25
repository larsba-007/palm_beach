
import { ASSETS, MUSIC_PLAYLIST, MUSIC_PLAYLIST_HQ } from './data.js';
import { GameConfig } from './config.js';

class AudioManager {
    constructor() {
        this.ctx = null;
        this.buffers = {};
        this.bgmNode = null;
        this.bgmGain = null;
        this.isInit = false;
        this.diceLoopSource = null;
        this.currentBgmKey = 'title_theme';
        this.config = { sfx: true, music: true };
        this.musicVolume = 0.8; // Default volume
        this.sfxVolume = 1.0; // Default SFX volume

        // Playlist State
        this.playlistIndex = 0;
        this.isPlaylistMode = false;
        // Select playlist based on platform
        this.activePlaylist = GameConfig.isElectron ? MUSIC_PLAYLIST_HQ : MUSIC_PLAYLIST;
        console.log(`Audio System: Using ${GameConfig.isElectron ? 'HQ' : 'Standard'} Playlist`);
    }

    // Keep getter/setter for muted for backward compatibility, but don't let it block SFX
    get muted() {
        return !this.config.music;
    }
    set muted(val) {
        // no-op to prevent state-to-engine mismatch
    }

    async init() {
        if (this.isInit) {
            this.resume();
            return;
        }

        console.log("Audio System: Initializing...");
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.isInit = true;

            // Load assets in parallel for better performance
            const loadPromises = Object.entries(ASSETS.AUDIO).map(async ([key, url]) => {
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const arrayBuffer = await response.arrayBuffer();
                    if (arrayBuffer.byteLength === 0) throw new Error("Empty audio file");

                    // Modern promise-based decodeAudioData
                    const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                    this.buffers[key] = audioBuffer;
                } catch (e) {
                    // Log the failure but don't stop the whole system
                    console.warn(`Audio [${key}] load failed: ${e.message} (${url})`);
                }
            });

            await Promise.allSettled(loadPromises);
            console.log(`Audio System: Ready (${Object.keys(this.buffers).length}/${Object.keys(ASSETS.AUDIO).length} assets loaded)`);
        } catch (e) {
            console.error("Audio System: Failed to create AudioContext", e);
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(e => console.warn("Failed to resume AudioContext", e));
        }
    }

    play(key, options = {}) {
        if (!this.config.sfx || !this.ctx) return null;

        // Ensure context is active (important for Chrome/Safari)
        this.resume();

        const buffer = this.buffers[key];
        if (!buffer) {
            // Silently fail if buffer didn't load, unless in debug
            return null;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        const gainNode = this.ctx.createGain();

        if (key === 'flip') {
            source.playbackRate.value = 0.9 + Math.random() * 0.2;
            gainNode.gain.value = 0.8 + Math.random() * 0.2;
        } else {
            gainNode.gain.value = (options.volume || 1.0);
        }

        // Apply global SFX volume using cubic tapering
        gainNode.gain.value *= Math.pow(this.sfxVolume, 3);

        if (options.loop) source.loop = true;

        source.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        source.start(0);

        return source;
    }

    // Play loopable static track (like title theme)
    startBGM(key = 'title_theme') {
        this.isPlaylistMode = false;
        this.currentBgmKey = key;

        if (!this.ctx) return;

        // Wait for buffer to be available
        if (!this.buffers[key]) {
            console.warn(`BGM [${key}] not available yet or failed to load.`);
            return;
        }

        // Stop currently playing music
        this.stopBGM();

        this.bgmNode = this.ctx.createBufferSource();
        this.bgmNode.buffer = this.buffers[key];
        this.bgmNode.loop = true;

        if (!this.bgmGain) {
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.connect(this.ctx.destination);
        }

        const targetGain = this.config.music ? Math.pow(this.musicVolume, 3) * 0.2 : 0;
        this.bgmGain.gain.value = targetGain;

        this.bgmNode.connect(this.bgmGain);
        this.bgmNode.start(0);
    }

    // Play sequential playlist
    startGameMusic() {
        this.isPlaylistMode = true;
        this.playlistIndex = 0;
        this.playNextPlaylistTrack();
    }

    playNextPlaylistTrack() {
        if (!this.isPlaylistMode || !this.config.music || !this.ctx) return;

        const trackKey = `playlist_${this.playlistIndex}`;
        const url = this.activePlaylist[this.playlistIndex];

        if (!url) {
            console.warn(`No track found at playlist index ${this.playlistIndex}`);
            return;
        }

        // If already loaded, assume it's buffered and play it
        if (this.buffers[trackKey]) {
            this.playBufferDirect(this.buffers[trackKey]);
            return;
        }

        // Fetch on demand
        console.log(`Audio: Fetching track ${this.playlistIndex} from ${url}`);
        fetch(url)
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status} - Music fetch failed`);
                return response.arrayBuffer();
            })
            .then(arrayBuffer => this.ctx.decodeAudioData(arrayBuffer))
            .then(audioBuffer => {
                if (!this.isPlaylistMode) return; // Mode changed during load
                this.buffers[trackKey] = audioBuffer; // Cache the buffer

                // Check if we are still on the same index (race condition check)
                if (this.activePlaylist[this.playlistIndex] === url) {
                    this.playBufferDirect(audioBuffer);
                }
            })
            .catch(e => {
                console.warn(`Failed to play playlist track: ${url}`, e);
                // Attempt next track on failure after delay
                setTimeout(() => {
                    if (this.isPlaylistMode) {
                        this.onTrackEnded();
                    }
                }, 2000);
            });
    }

    playBufferDirect(audioBuffer, loop = false) {
        if (!this.ctx) return;

        this.stopBGM(); // Stop any currently playing BGM

        this.bgmNode = this.ctx.createBufferSource();
        this.bgmNode.buffer = audioBuffer;
        this.bgmNode.loop = loop;

        if (!this.bgmGain) {
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.connect(this.ctx.destination);
        }

        const targetGain = this.config.music ? Math.pow(this.musicVolume, 3) * 0.2 : 0;
        this.bgmGain.gain.value = targetGain;

        this.bgmNode.connect(this.bgmGain);
        this.bgmNode.start(0);

        this.bgmNode.onended = () => {
            if (this.isPlaylistMode && !loop) { // Only advance playlist if not looping
                this.onTrackEnded();
            }
        };
    }

    onTrackEnded() {
        if (!this.isPlaylistMode) return;

        this.playlistIndex++;
        if (this.playlistIndex >= this.activePlaylist.length) {
            this.playlistIndex = 0; // Loop playlist
        }
        this.playNextPlaylistTrack();
    }

    stopBGM() {
        if (this.bgmNode) {
            try {
                this.bgmNode.onended = null; // Clear callback
                this.bgmNode.stop();
            } catch (e) { }
            this.bgmNode.disconnect();
            this.bgmNode = null;
        }
    }

    duckBGM(active) {
        if (!this.bgmGain || !this.ctx) return;
        const now = this.ctx.currentTime;
        const targetLinear = active ? (this.musicVolume * 0.3) : this.musicVolume;
        const target = this.config.music ? Math.pow(targetLinear, 3) * 0.2 : 0;
        this.bgmGain.gain.setTargetAtTime(target, now, 0.5);
    }

    setMusicVolume(val) {
        this.musicVolume = Math.max(0, Math.min(1, val));
        if (this.bgmGain && this.ctx) {
            const target = this.config.music ? Math.pow(this.musicVolume, 3) * 0.2 : 0;
            this.bgmGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
        }
    }

    setSfxVolume(val) {
        this.sfxVolume = Math.max(0, Math.min(1, val));
    }

    setMusicMuted(isMuted) {
        this.config.music = !isMuted;
        if (this.ctx) {
            this.resume();
            if (this.bgmGain) {
                const target = !isMuted ? Math.pow(this.musicVolume, 3) * 0.2 : 0;
                this.bgmGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.05);
            }
            if (!isMuted && !this.bgmNode) {
                if (this.isPlaylistMode) {
                    this.playNextPlaylistTrack();
                } else {
                    this.startBGM(this.currentBgmKey);
                }
            }
        }
    }

    setSfxMuted(isMuted) {
        this.config.sfx = !isMuted;
        if (isMuted && this.diceLoopSource) {
            this.stopDiceLoop();
        }
    }

    updateConfig(sfx, music) {
        this.setSfxMuted(!sfx);
        this.setMusicMuted(!music);
    }

    startDiceLoop() {
        if (this.diceLoopSource) return;
        this.diceLoopSource = this.play('dice_loop', { loop: true, volume: 0.8 });
    }

    stopDiceLoop() {
        if (this.diceLoopSource) {
            try { this.diceLoopSource.stop(); } catch (e) { }
            this.diceLoopSource = null;
        }
    }
}

export const audioMgr = new AudioManager();