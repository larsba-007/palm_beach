

// debug.js - Debugging, AI Monitoring, and God Mode Tools

export function setupVisualConsole() {
    const consoleEl = document.getElementById('debug-console');

    function printToScreen(args, type) {
        if (!consoleEl) return;
        const line = document.createElement('div');
        line.className = `log-line log-${type}`;

        const text = args.map(a => {
            if (a instanceof Error) return a.stack || a.message;
            if (typeof a === 'object') return JSON.stringify(a);
            return String(a);
        }).join(' ');

        if (text.includes('[SIM]')) line.className = `log-line log-sim`;
        if (text.toLowerCase().includes('audio')) line.className = `log-line log-audio`;

        line.innerText = `[${type.toUpperCase()}] ${text}`;
        consoleEl.appendChild(line);

        while (consoleEl.children.length > 80) {
            consoleEl.removeChild(consoleEl.firstChild);
        }
        consoleEl.scrollTop = consoleEl.scrollHeight;
    }

    const origLog = console.log;
    console.log = (...args) => {
        origLog(...args);
        printToScreen(args, 'normal');
    };

    const origErr = console.error;
    console.error = (...args) => {
        origErr(...args);
        printToScreen(args, 'error');
    };

    const origWarn = console.warn;
    console.warn = (...args) => {
        origWarn(...args);
        printToScreen(args, 'warn');
    };
}

export function switchTab(tab) {
    const logsTab = document.getElementById('tab-logs');
    const aiTab = document.getElementById('tab-ai');
    const logsPanel = document.getElementById('panel-logs');
    const aiPanel = document.getElementById('panel-ai');

    if (tab === 'logs') {
        logsTab.classList.add('text-yellow-400', 'border-yellow-400', 'bg-slate-900/50');
        logsTab.classList.remove('text-slate-400');
        aiTab.classList.remove('text-yellow-400', 'border-yellow-400', 'bg-slate-900/50');
        aiTab.classList.add('text-slate-400');

        logsPanel.classList.remove('hidden');
        aiPanel.classList.add('hidden');
    } else {
        aiTab.classList.add('text-yellow-400', 'border-yellow-400', 'bg-slate-900/50');
        aiTab.classList.remove('text-slate-400');
        logsTab.classList.remove('text-yellow-400', 'border-yellow-400', 'bg-slate-900/50');
        logsTab.classList.add('text-slate-400');

        aiPanel.classList.remove('hidden');
        logsPanel.classList.add('hidden');
    }
}

export function toggleDebugPanel() {
    const el = document.getElementById('unified-debug-panel');
    if (!el) return;
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) {
        renderAIMonitorStats();
    }
}

export function logAI(botName, category, message) {
    if (category === 'THINK') return;

    const feed = document.getElementById('ai-monitor-feed');
    if (!feed) return;
    const div = document.createElement('div');
    div.className = 'p-1.5 border-l-2 mb-1 bg-white/5 rounded-r';

    let borderColor = 'border-blue-400';
    let textColor = 'text-blue-200';

    switch (category) {
        case 'STRATEGY': borderColor = 'border-purple-400'; textColor = 'text-purple-200'; break;
        case 'SUCCESS': borderColor = 'border-green-400'; textColor = 'text-green-200'; break;
        case 'FAIL': borderColor = 'border-red-400'; textColor = 'text-red-200'; break;
        case 'ACTION': borderColor = 'border-yellow-400'; textColor = 'text-yellow-200'; break;
    }

    div.className += ` ${borderColor} ${textColor}`;
    div.innerText = `[${botName}] ${message}`;
    feed.appendChild(div);

    if (feed.children.length > 40) feed.removeChild(feed.firstChild);
    feed.scrollTop = feed.scrollHeight;
}

export function renderAIMonitorStats() {
    if (!window.state) return;
    const tbody = document.getElementById('ai-monitor-stats');
    if (!tbody) return;
    tbody.innerHTML = '';
    window.state.players.forEach(p => {
        if (p.type === 'BOT') {
            tbody.innerHTML += `
                <tr class="border-b border-white/5 text-[9px]">
                    <td class="py-1 font-bold text-white">${p.name}</td>
                    <td class="py-1 text-slate-400">${p.character ? p.character.name : '???'}</td>
                    <td class="py-1 text-yellow-400">${p.personality || '-'}</td>
                    <td class="py-1 text-teal-400">${p.luxuryPreference || '-'}</td>
                </tr>
            `;
        }
    });
}

export function toggleGodMode() {
    const godOverlay = document.getElementById('god-mode-overlay');
    if (godOverlay && !godOverlay.classList.contains('hidden')) {
        closeGodMode();
    } else {
        openGodMode();
    }
}

export function openGodMode() {
    const pauseMenu = document.getElementById('pause-menu');
    const godOverlay = document.getElementById('god-mode-overlay');
    if (pauseMenu) pauseMenu.classList.add('hidden');
    if (godOverlay) godOverlay.classList.remove('hidden');
    if (window.state) window.state.paused = true;
}

export function closeGodMode() {
    const godOverlay = document.getElementById('god-mode-overlay');
    if (godOverlay) godOverlay.classList.add('hidden');
    if (window.state) window.state.paused = false;
    window.startTurnCycle();
}

export function godRevealMap() {
    let changed = false;
    if (!window.state) return;
    window.state.grid.forEach(cell => {
        if (!cell.flipped && !cell.empty) {
            cell.flipped = true;
            window.updateCardVisuals(cell);
            changed = true;
        }
    });
    if (changed) console.warn("GOD MODE: All map cards revealed.");
}

export function godForceAuction(id) {
    if (window.state && window.state.players) {
        window.state.players.forEach(p => {
            p.gold += 40;
            p.totalGold += 40;
        });
        window.updateUI();
    }
    closeGodMode();
    setTimeout(() => {
        if (window.state && window.state.auctions[id] && !window.state.auctions[id].triggered) {
            window.triggerAuction(id);
        }
    }, 500);
}

export function godSuperBoost() {
    if (!window.state || window.state.mode !== 'GAME') return;
    const p = window.state.players[window.state.turn];
    if (p) {
        p.gold += 100;
        p.totalGold += 100;
        console.log("God Mode: +100 Au granted.");
    }
    window.updateUI();
    closeGodMode();
}

export function toggleMapEditMode() {
    if (!window.state) return;
    window.state.godMode = !window.state.godMode;
    const btn = document.getElementById('btn-map-edit');
    const board = document.getElementById('game-board');
    if (window.state.godMode) {
        if (btn) {
            btn.innerText = "Edit Map Mode: ON";
            btn.classList.add('bg-red-600', 'text-white');
            btn.classList.remove('bg-slate-700', 'text-slate-300');
        }
        if (board) board.classList.add('god-mode-active');
    } else {
        if (btn) {
            btn.innerText = "Edit Map Mode: OFF";
            btn.classList.remove('bg-red-600', 'text-white');
            btn.classList.add('bg-slate-700', 'text-slate-300');
        }
        if (board) board.classList.remove('god-mode-active');
    }
}

export function godDistributeLuxury() {
    if (!window.state) return;
    const input = document.getElementById('god-lux-amount');
    const amt = parseInt(input ? input.value : 6) || 6;
    let pIdx = 0;
    for (let i = 0; i < amt; i++) {
        let deckIdx = -1;
        if (window.state.luxuryDecks[2].cards.length > 0) deckIdx = 2;
        else if (window.state.luxuryDecks[1].cards.length > 0) deckIdx = 1;
        else if (window.state.luxuryDecks[0].cards.length > 0) deckIdx = 0;

        if (deckIdx !== -1) {
            const card = window.state.luxuryDecks[deckIdx].cards.pop();
            const p = window.state.players[pIdx];
            p.inventory.push(card); p.prestige += card.points; p.cards++;
            if (card.spriteIndex === 2) {
                p.rerolls = (p.rerolls || 0) + 1;
            } else if (card.spriteIndex === 3) {
                p.rerolls = (p.rerolls || 0) + 1;
            } else if (card.spriteIndex === 4) {
                p.rerolls = (p.rerolls || 0) + 2;
            }
            pIdx = (pIdx + 1) % window.state.players.length;
        } else { break; }
    }
    window.updateUI();
}

export function godSetTurn(id) {
    if (!window.state || !window.state.players[id]) return;
    window.state.turn = id;
    window.state.isProcessing = false;
    window.state.players.forEach(p => p.status = 'Waiting');
    window.updateUI();
}

export function godForceGameOver() {
    if (!window.state) return;
    window.state.gameOverTriggered = true;
    if (window.app && window.app.triggerGameOver) {
        window.app.triggerGameOver("FORCE GAME OVER");
    }
}

window.debugSetGambitLevel = function(level) {
    level = parseInt(level, 10);
    if (isNaN(level) || level < 0 || level > 50) {
        return alert("Please enter a valid level between 0 and 50.");
    }
    
    // Ensure the state object exists
    if (!window.state) window.state = {};
    if (!window.state.playerProfile) window.state.playerProfile = { clearedGambits: [] };
    
    // Generate an array of cleared gambits [1, 2, 3 ... level]
    window.state.playerProfile.clearedGambits = Array.from({length: level}, (_, i) => i + 1);
    
    // Persist the change
    if (window.SaveManager) {
        window.SaveManager.saveData(window.state);
    }
    
    console.log(`[Debug] Highest cleared gambit successfully set to ${level}`);
    alert(`Progression set to Gambit ${level}. Navigate to the main menu or refresh to see UI changes.`);
};