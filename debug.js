
// debug.js - Debugging, AI Monitoring, and God Mode Tools

// Initialize Visual Console Override
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
        if (consoleEl.children.length > 100) consoleEl.removeChild(consoleEl.firstChild);
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

export function toggleDebugLogs() { 
    const el = document.getElementById('debug-console'); 
    if (el) el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'flex' : 'none'; 
}

export function logAI(botName, category, message) {
    const feed = document.getElementById('ai-monitor-feed');
    if (!feed) return;
    const div = document.createElement('div');
    div.className = 'ai-log-entry';
    switch(category) {
        case 'STRATEGY': div.classList.add('ai-log-strategy'); break;
        case 'SUCCESS': div.classList.add('ai-log-success'); break;
        case 'FAIL': div.classList.add('ai-log-fail'); break;
        case 'ACTION': div.classList.add('ai-log-action'); break;
        default: break;
    }
    div.innerText = `[${botName}] ${message}`;
    feed.appendChild(div);
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
                <tr class="border-b border-slate-700/50">
                    <td class="py-1 font-bold text-white">${p.name}</td>
                    <td class="py-1 text-slate-400">${p.character ? p.character.name : '???'}</td>
                    <td class="py-1 text-yellow-400">${p.personality ? p.personality.substring(0,8) : '-'}</td>
                    <td class="py-1 text-teal-400">${p.luxuryPreference ? p.luxuryPreference.substring(0,8) : '-'}</td>
                </tr>
            `;
        }
    });
}

export function toggleAIMonitor() { 
    const el = document.getElementById('ai-monitor'); 
    if (!window.state || !el) return;
    window.state.aiMonitorVisible = !window.state.aiMonitorVisible; 
    if(window.state.aiMonitorVisible) el.classList.add('visible'); 
    else el.classList.remove('visible'); 
}

export function debugSimulateEnd() {
    if (!window.state) return;
    window.state.simulationMode = true; 
    window.state.config.humans = 0; 
    window.state.players.forEach(p => p.type = 'BOT'); 
    window.state.turnCount = 0;
    const indicator = document.getElementById('auto-pilot-indicator');
    if (indicator) indicator.style.display = 'block'; 
    console.warn("AUTO-PILOT STARTED. Enjoy the show."); 
    if (!window.state.isProcessing) window.startTurnCycle();
    closeGodMode();
}

export function openGodMode() {
    const pauseMenu = document.getElementById('pause-menu');
    const godOverlay = document.getElementById('god-mode-overlay');
    if (pauseMenu) pauseMenu.classList.add('hidden');
    if (godOverlay) godOverlay.classList.remove('hidden');
    window.state.paused = true;
}

export function closeGodMode() {
    const godOverlay = document.getElementById('god-mode-overlay');
    if (godOverlay) godOverlay.classList.add('hidden');
    window.state.paused = false;
    window.startTurnCycle();
}

export function godRevealMap() {
    let changed = false;
    if (!window.state) return;
    window.state.grid.forEach(cell => {
        if(!cell.flipped && !cell.empty) {
            cell.flipped = true;
            window.updateCardVisuals(cell);
            changed = true;
        }
    });
    if(changed) console.warn("GOD MODE: All map cards revealed.");
}

export function godForceAuction(id) {
    if(window.state && window.state.players) {
        window.state.players.forEach(p => {
            p.gold += 40; p.totalGold += 40;
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
    if(!window.state || window.state.mode !== 'GAME') return;
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
            pIdx = (pIdx + 1) % window.state.players.length;
        } else { break; }
    }
    window.updateUI();
}

export function godSetTurn(id) {
    if (!window.state || !window.state.players[id]) return;
    window.state.turn = id;
    window.state.isProcessing = false;
    window.updateUI();
}
