
import { GAME_SPRITE_URL, CARD_SPRITE_URL, LUXURY_CARD_SPRITE_URL, LUXURY_BACK_URL, AUCTION_CARD_SPRITE_URL, AUCTION_BACK_URL, CHARACTER_SPRITE_PRINT_URL, PROPERTY_SPRITE_URL, BOARD_ROWS, BOARD_COLS, CELL_SIZE, MAIN_BOARD_HEIGHT, AUCTION_SLOTS, CHARACTERS, PLAYERMAT_URL } from './data.js';

import { NEWS_POSTS } from './blog.js';
import { usesTapToPreview } from './web_party.js';
import { botRoster } from './bots.js';
import { GAMBIT_CAMPAIGN } from './gambit_data.js';
import { getProfileHtml } from './StatsUI.js';
import { landmarkData } from './landmarks.js';
import { propertyLore } from './auction.js';
import { state } from './state.js';
import { audioMgr } from './audio.js';

let idleTimer = null;
let shimmerTimer = null;
let resizeListener = null;



// --- UTILS ---
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

export function showTurnBanner(playerName, isHuman) {
    // Center banner removed as per user request.
}

export function highlightTargetCell(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('target-lock-border');
}

export function clearTargetHighlight(id) {
    if (id) {
        document.getElementById(id)?.classList.remove('target-lock-border');
    } else {
        document.querySelectorAll('.target-lock-border').forEach(el => el.classList.remove('target-lock-border'));
    }
}

export function renderNewsFeed() {
    const container = document.getElementById('news-feed-container');
    if (!container) return;

    // Web Party Edition: the news posts are Kickstarter/Steam promotions
    if (window.GameConfig && window.GameConfig.isWeb) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = NEWS_POSTS.map(post => {
        // Use explicitly provided 2x image, or fallback to 1x image
        const img2x = post.image2x || post.image;
        const isLogo = post.image.includes('backhans_games_logo');
        const isSteam = post.image.includes('Steam');
        
        // Remove artificial width restrictions to allow natively sweeping images
        const imgClass = isLogo ? "w-[150px] h-auto object-contain mx-auto my-2" : 
                         isSteam ? "w-full object-contain mx-auto" : "w-full h-auto object-cover";
                         
        const extraLinkClass = isLogo ? "bg-transparent border-0" : 
                               isSteam ? "bg-white items-center justify-center p-2 shadow-inner" : "";

        return `
        <div class="mb-4 flex flex-col w-full group/news">
            <!-- Image Link -->
            <a href="${post.link}" target="_blank" class="${isSteam ? 'flex' : 'block'} w-full overflow-hidden hover:brightness-110 transition-all mb-1 relative rounded border-2 border-transparent hover:border-[#DA795A] ${extraLinkClass}">
                 <img src="${post.image}" srcset="${post.image} 1x, ${img2x} 2x" alt="${post.title}" class="${imgClass}">
            </a>
            
            <!-- Title -->
            <h3 class="text-white font-normal text-[14px] leading-[1.5] mb-0 font-overpass tracking-wide drop-shadow-md text-left">${post.title}</h3>

            <!-- Description -->
            <p class="text-slate-200 font-normal text-[13px] leading-relaxed font-overpass text-left opacity-90">
                ${post.text}
            </p>
        </div>
    `}).join('');
}

export function centerBoardView() {
    const container = document.getElementById('board-container');
    if (container) {
        const cWidth = container.clientWidth;
        const bWidth = 1240; // Fixed board wrapper width

        container.scrollLeft = (cWidth < bWidth) ? (bWidth - cWidth) / 2 : 0;
    }
}

export function getCharacterCardStyle(id) {
    return { bgX: -(id % 5 * 250), bgY: -(Math.floor(id / 5) * 375) };
}


export function getLuxuryCardStyle(i) {
    let col = 0, row = 0;
    if (i <= 4) { col = 0; row = i; } else if (i <= 11) { col = 1; row = i - 5; } else { col = 2; row = i - 12; }
    return { bgX: -(col * 250), bgY: -(row * 250) };
}

export function loadHighScores() {
    const list = document.getElementById('high-score-list');
    if (!list) return; 

    // Read from career stats instead of localStorage
    let scores = state.stats?.highScores || [];

    // Display Top 4
    const humanScores = scores.filter(s => s.type === 'HUMAN').sort((a, b) => b.vp - a.vp).slice(0, 4);

    // Render List
    let html = '';

    // Humans Section
    html += '<div class="flex justify-between items-end mb-2 pb-2 border-b border-white/10">';
    html += '<h3 class="font-bold uppercase tracking-widest text-[14px]">Hall of Fame</h3>';
    html += '</div>';

    if (humanScores.length === 0) {
        html += '<div class="text-white/50 text-[12px] italic p-2 text-center font-overpass">No Human Records</div>';
    } else {
        html += humanScores.map((s, i) => `
            <div class="flex justify-between items-center bg-[#113451] p-2 mb-1">
                <div class="flex items-center gap-2">
                    <span class="text-white font-black text-[12px] w-4 font-overpass">${i + 1}.</span>
                    <span class="text-white font-bold text-[12px] uppercase truncate max-w-[120px] font-overpass">${s.name}</span>
                </div>
                <div class="flex flex-col items-end">
                    <span class="text-white font-bold text-[12px] font-overpass">${s.vp} VP</span>
                    ${s.character ? `<span class="text-[#F3C80D] text-[9px] font-black uppercase font-overpass leading-none">${s.character}</span>` : ''}
                </div>
            </div>
        `).join('');
    }

    // Reset Button Humans
    html += '<div class="flex justify-end mt-1 mb-6">';
    html += '<button onclick="app.resetHumanScores()" class="text-[10px] font-bold text-red-400 hover:text-white uppercase tracking-wider hover:bg-red-500/20 px-2 py-1 rounded transition-colors cursor-pointer">Reset Scores</button>';
    html += '</div>';

    list.innerHTML = html;
}

export function startRandomShimmer() {
    if (shimmerTimer) clearInterval(shimmerTimer);

    shimmerTimer = setInterval(() => {
        if (!state.luxuryDecks || state.luxuryDecks.length === 0) return;
        const indices = [0, 1, 2];
        const r = indices[Math.floor(Math.random() * indices.length)];
        const deckObj = state.luxuryDecks[r];
        const el = document.getElementById(`deck-${r}`);

        if (deckObj && deckObj.cards.length > 0 && el) {
            el.classList.add('shimmer-active');
            // Ambient shimmer should NOT be sped up by the global governor
            setTimeout(() => {
                if (el) el.classList.remove('shimmer-active');
            }, 1500);
        }
    }, 5000);
}

export function startIdleAnimations() {
    if (idleTimer) clearTimeout(idleTimer);

    const scheduleNextWave = () => {
        const delay = Math.floor(Math.random() * 4000) + 1000;
        idleTimer = setTimeout(() => {
            triggerIdleWave();
            scheduleNextWave();
        }, delay);
    };

    const triggerIdleWave = () => {
        if (state.isProcessing || state.mode !== 'GAME') return;
        if (!state.grid || state.grid.length === 0) return;
        const available = state.grid.filter(c => !c.flipped && !c.empty);
        if (available.length === 0) return;
        shuffle(available);
        const selected = available.slice(0, 8);
        selected.forEach((cellData, i) => {
            const el = document.getElementById(`cell-container-${cellData.id}`);
            if (el && !el.classList.contains('bonus-pop') && !el.classList.contains('wave-anim')) {
                // Idle animations should NOT be sped up by the global governor
                setTimeout(() => {
                    el.classList.add('wave-anim');
                    setTimeout(() => el.classList.remove('wave-anim'), 1000);
                }, i * 100);
            }
        });
    };
    scheduleNextWave();
}


export function setupBoard() {
    if (state.isGameOver) return;
    if (idleTimer) clearTimeout(idleTimer);

    // Remove existing listener to prevent duplicates on restart
    if (resizeListener) {
        window.removeEventListener('resize', resizeListener);
    }

    // Add debounced resize listener
    let resizeTimeout;
    resizeListener = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            centerBoardView();
        }, window.getDelay(100));
    };
    window.addEventListener('resize', resizeListener);

    const boardWrapper = document.getElementById('board-wrapper');
    if (boardWrapper) {
        const oldSpacer = document.getElementById('board-spacer');
        if (oldSpacer) oldSpacer.remove();
    } else {
        console.warn("Board wrapper not found during setupBoard");
    }

    const getSpriteColumn = (colIndex) => {
        const deck = [];
        for (let r = 0; r < 8; r++) deck.push(r * 8 + colIndex);
        return deck;
    };
    const createShuffledDeck = (indices) => {
        const deck = [...indices];
        shuffle(deck);
        return deck;
    };

    const bonusIndices = [2, 5, 10, 19, 27, 45, 52, 60, 61]; // Palm Beach: the 9 Block Bonus Cards with a printed +5 circle (see assets_source/palm_beach_print/map_cards/_sprite_positions.csv)
    const cols = [];
    let attempts = 0;
    while (attempts < 1000) {
        cols[0] = createShuffledDeck(getSpriteColumn(0));
        cols[1] = createShuffledDeck(getSpriteColumn(1));
        cols[2] = createShuffledDeck(getSpriteColumn(2));

        const sprite5 = getSpriteColumn(5);
        const sprite5_top = sprite5.slice(0, 6);
        const sprite5_bottom = sprite5.slice(6, 8);

        let centerPool = [...getSpriteColumn(3), ...getSpriteColumn(4), ...sprite5_bottom];
        shuffle(centerPool);
        cols[3] = centerPool.splice(0, 4);
        cols[4] = centerPool.splice(0, 4);
        cols[5] = centerPool.splice(0, 4);

        cols[6] = createShuffledDeck(sprite5_top);
        cols[7] = createShuffledDeck(getSpriteColumn(6));
        cols[8] = createShuffledDeck(getSpriteColumn(7));

        if (state.activeGambitId === 2) {
            const card1 = cols[0][4];
            const card2 = cols[1][4];
            const card3 = cols[2][4];
            const card4 = cols[3][2];
            const card9 = cols[8][4];

            const isLandmark = (spriteIndex) => {
                const spriteRow = Math.floor(spriteIndex / 8);
                const spriteCol = spriteIndex % 8;
                return landmarkData.some(l => l.row === spriteRow && l.col === spriteCol);
            };

            const hasLandmark = isLandmark(card1) || isLandmark(card2) || isLandmark(card3) || isLandmark(card4) || isLandmark(card9);
            const isBonusCard3 = bonusIndices.includes(card3);

            if (!hasLandmark && !isBonusCard3) {
                break;
            }
            attempts++;
        } else {
            break;
        }
    }

    const gridEl = document.getElementById('grid-container');
    gridEl.innerHTML = '';
    state.grid = [];

    for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
            const isCovered = AUCTION_SLOTS.some(s => s.r === r && s.c === c);
            if (isCovered) {
                state.grid.push({ id: `r${r}c${c}`, r, c, type: 'EMPTY', empty: true });
                const spacer = document.createElement('div');
                spacer.className = 'invisible pointer-events-none';
                gridEl.appendChild(spacer);
                continue;
            }

            let value = 3;
            let difficulty = 0;
            let colorClass = '';
            let type = 'BLOCK';

            // Fixed logic:
            // Lagoon (Col 0 - West/Left): 8 Au, Difficulty 4 (Roll 4-6)
            // Atlantic (Col 8 - East/Right): 8 Au, Difficulty 3 (Roll 3-6)
            if (c === 0) { value = 8; difficulty = 4; type = 'LAGOON'; }
            else if (c === 1) { value = 4; type = 'WF_L'; }
            else if (c === 7) { value = 4; type = 'WF_R'; }
            else if (c === 8) { value = 6; difficulty = 3; type = 'ATLANTIC'; }


            const spriteIndex = cols[c].shift();
            let isBonus = bonusIndices.includes(spriteIndex);
            if (state.activeGambitId === 2 && r === 4) {
                isBonus = (c === 3);
            }

            const cellData = { id: `r${r}c${c}`, r, c, value, difficulty, flipped: false, empty: false, spriteIndex, isBonus, type };
            state.grid.push(cellData);

            const cell = document.createElement('div');
            cell.id = `cell-container-${cellData.id}`;
            cell.className = `relative w-[250px] h-[250px] cursor-pointer hover:scale-105 hover:z-10 transition-transform duration-200 group bg-white ${colorClass} card-reveal card-hidden border-[1px] border-[#333333]`;
            
            if (state.activeGambitId === 1 && (type === 'WF_L' || type === 'WF_R') && r === 7) {
                cell.className += ' pointer-events-none brightness-50 grayscale';
            }

            cell.style.backgroundImage = `url('${GAME_SPRITE_URL}')`;
            
            // Map Board Column to Sprite Column for the back-side
            let backCol = 2; // Default to BLOCK
            if (c === 0) backCol = 0; // Lagoon
            else if (c === 1 || c === 7) backCol = 1; // Waterfront
            else if (c === 8) backCol = 3; // Atlantic

            cell.style.backgroundPosition = `${-(backCol * CELL_SIZE)}px 0px`;
            cell.style.backgroundSize = `1000px 250px`;
            cell.style.backgroundRepeat = 'no-repeat';
            cell.onclick = () => window.app.handleFlip(cellData);
            
            // Generate Reward HTML with Desynchronized "Balatro" Drift
            let rewardHtml = '';
            const createRewardTag = (val, typeClass) => {
                const isVertical = Math.random() > 0.5;
                const animClass = isVertical ? 'animate-spark-v' : 'animate-spark-h';
                
                // Random distance between 1 and 15px
                const distAmount = Math.floor(Math.random() * 15) + 1;
                let randomDist = distAmount;
                
                // Directional logic
                if (isVertical) {
                    // Vertical: Float UP (negative translateY)
                    randomDist = -distAmount;
                } else {
                    // Horizontal: 50% chance to sway left vs right
                    if (Math.random() > 0.5) randomDist = -distAmount;
                }
                
                // 1 pixel every 2 seconds logic: duration = distance * 2
                const duration = distAmount * 2; 
                const delay = -(Math.random() * duration).toFixed(2);
                
                return `<div class="${typeClass} ${animClass}" style="animation-delay: ${delay}s; --drift-duration: ${duration}s; --drift-dist: ${randomDist}px">${val}</div>`;
            };

            if (c === 0 || c === 8) {
                rewardHtml = createRewardTag(`+${value} Au`, 'reward-base');
            } else if (c === 1 || c === 7) {
                rewardHtml = createRewardTag(`+${value} Au`, 'reward-base');
            } else if (c >= 2 && c <= 6) {
                rewardHtml = createRewardTag('+3-8 Au', 'reward-base');
                if (isBonus) {
                    rewardHtml += createRewardTag('?', 'reward-bonus');
                }
            }

            let lockHtml = '';
            if (state.activeGambitId === 1 && (type === 'WF_L' || type === 'WF_R') && r === 7) {
                lockHtml = `
                    <div class="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
                        <svg class="w-20 h-20 text-white drop-shadow-2xl" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path></svg>
                    </div>
                `;
            }

            cell.innerHTML = `
                <div id="cell-front-${cellData.id}" class="hidden w-full h-full bg-no-repeat relative"></div>
                <div class="reward-container pointer-events-none absolute inset-0 z-10">
                    ${rewardHtml}
                </div>
                ${lockHtml}
            `;
            gridEl.appendChild(cell);


        }
    }

    const cardEls = document.querySelectorAll('.card-hidden');
    const staggerTime = state.activeGambitId ? 0 : 20;
    cardEls.forEach((el, index) => {
        setTimeout(() => { el.classList.remove('card-hidden'); }, index * staggerTime);
    });

    ['A', 'B'].forEach(id => {
        const el = document.getElementById(`auction-${id}`);
        el.classList.remove('hidden');
        el.style.backgroundImage = `url('${AUCTION_BACK_URL}')`;
        el.style.backgroundSize = '1000px 500px';
        el.style.backgroundPosition = '0 0';

        const overlay = document.getElementById(`auction-overlay-${id}`);
        if (overlay) overlay.innerHTML = '';
        const existingProp = document.getElementById(`auction-prop-img-${id}`);
        if (existingProp) existingProp.remove();

        // NEW: Clear Roxana static prop
        const existingRoxana = document.getElementById(`roxana-static-prop-${id}`);
        if (existingRoxana) existingRoxana.remove();

        const existingCenter = document.getElementById('active-auction-card');
        if (existingCenter) existingCenter.remove();
    });

    // Start background animations only after board setup
    startIdleAnimations();
    startRandomShimmer();

    // Initial center alignment


    setTimeout(() => centerBoardView(), window.getDelay(100));
}

export function initPlayerCards() {
    const boardWrapper = document.getElementById('board-wrapper');
    if (boardWrapper && !document.getElementById('inline-command-popup-container')) {
        const popupContainer = document.createElement('div');
        popupContainer.id = 'inline-command-popup-container';
        popupContainer.className = 'hidden absolute inset-0 z-[1100] pointer-events-auto';
        popupContainer.innerHTML = `
            <div id="inline-command-popup-inner" class="absolute w-[1000px] h-[920px] bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col justify-between font-overpass z-[1110]">
                <!-- Close Button -->
                <button id="inline-close-btn" onclick="if(window.app && window.app.closeInlineCommandPopup){window.app.closeInlineCommandPopup();} else if(window.closeInlineCommandPopup){window.closeInlineCommandPopup();}" class="absolute top-8 right-10 z-[1200] flex items-center gap-3 text-white/80 hover:text-[#F3C80D] transition-colors cursor-pointer group select-none pointer-events-auto">
                    <svg class="w-10 h-10 pointer-events-none transition-transform group-hover:rotate-90" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                    <span class="font-overpass font-black text-[32px] uppercase tracking-widest pointer-events-none">CLOSE</span>
                </button>
                
                <!-- Top Section: Header & Description -->
                <div class="relative z-[1115] pointer-events-auto">
                    <h2 id="inline-popup-title" class="text-white font-overpass font-black uppercase tracking-[0.1em] text-[60px] drop-shadow-md leading-none mb-4 pr-36">CHARACTER NAME</h2>
                    <p id="inline-popup-desc" class="text-slate-200 font-overpass font-light leading-snug text-[40px] pr-36">Ability description.</p>
                </div>

                <!-- Action Rows (Power, Reroll, Extra Turn) -->
                <div class="flex flex-col gap-[30px]">
                    <!-- Row 1: Power -->
                    <div class="flex items-center">
                        <button id="inline-btn-power" onclick="window.app.selectPopupAction('POWER')" class="w-[300px] h-[100px] rounded-2xl border border-white/20 transition-all font-overpass font-black uppercase tracking-wider text-[48px] drop-shadow-md text-white cursor-pointer hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100" style="background: hsl(285, 55%, 40%);">POWER</button>
                        <span id="inline-label-power" class="text-white font-overpass font-light text-[40px] tracking-wider ml-12">POWERS LEFT: 0</span>
                    </div>

                    <!-- Row 2: Reroll -->
                    <div class="flex items-center">
                        <button id="inline-btn-reroll" onclick="window.app.executePopupAction('REROLL')" class="w-[300px] h-[100px] rounded-2xl border border-white/20 transition-all font-overpass drop-shadow-md text-white cursor-pointer hover:scale-[1.02] active:scale-[0.98] flex flex-col items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100" style="background: hsl(345, 60%, 45%);">
                            <span class="text-[32px] font-black uppercase tracking-wider leading-tight">REROLL</span>
                            <span class="text-[18px] font-bold uppercase tracking-widest text-white/70 leading-none">AUTOMATIC</span>
                        </button>
                        <span id="inline-label-reroll" class="text-white font-overpass font-light text-[40px] tracking-wider ml-12">REROLLS LEFT: 0</span>
                    </div>

                    <!-- Row 3: Extra Turn -->
                    <div class="flex items-center">
                        <button id="inline-btn-extraturn" onclick="window.app.selectPopupAction('EXTRA_TURN')" class="w-[300px] h-[100px] rounded-2xl border border-white/20 transition-all font-overpass font-black uppercase tracking-wider text-[40px] drop-shadow-md text-white cursor-pointer hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100" style="background: hsl(40, 75%, 45%);">EXTRA TURN</button>
                        <span id="inline-label-extraturn" class="text-white font-overpass font-light text-[40px] tracking-wider ml-12">EXTRA TURNS LEFT: 0</span>
                    </div>
                </div>

                <!-- Bottom Section: ACTIVATE Button -->
                <div class="flex justify-center mt-4">
                    <button id="inline-btn-activate" onclick="window.app.activateSelectedAction()" class="w-[450px] h-[90px] rounded-2xl border border-emerald-500/30 bg-emerald-600/80 hover:bg-emerald-500 font-overpass font-black uppercase tracking-widest text-[36px] text-white shadow-lg shadow-emerald-900/40 cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:bg-slate-700/50 disabled:border-white/10" disabled>ACTIVATE</button>
                </div>
            </div>
        `;
        popupContainer.addEventListener('click', (e) => {
            if (e.target.id === 'inline-command-popup-container') {
                window.app.closeInlineCommandPopup();
            }
        });
        boardWrapper.appendChild(popupContainer);
    }

    window.showV2AbilityModal = function(title, description) {
        window.app.openInlineCommandPopup(state.turn);
    };

    const leftPanel = document.getElementById('left-panel-cards');
    const rightPanel = document.getElementById('right-panel-cards');
    leftPanel.innerHTML = ''; rightPanel.innerHTML = '';

    state.players.forEach((player) => {
        let charName = "???", charTitle = "DRAFTING...", bgStyle = "", counters = 0, charId = -1, hasActiveAbility = false;
        if (player.character) {
            charName = player.character.name; charTitle = player.character.title; counters = player.character.startPowers; charId = player.character.id;
            
            // Responsive Percentage Scaling (5 columns, 2 rows of 700x1200 cards, cropped to show top 700x800)
            const posX = (charId % 5) * 25;
            const posY = Math.floor(charId / 5) * 75;
            bgStyle = `background-image: url('${CHARACTER_SPRITE_PRINT_URL}'); background-size: 500% 300%; background-position: ${posX}% ${posY}%;`;

            hasActiveAbility = ['LEJA', 'ERIC', 'SILVIANO'].includes(charName);
        } else { bgStyle = "background-color: #334155;"; }

        if (player.type === 'BOT' && player.botId) {
            const botData = botRoster.find(b => b.id === player.botId);
            charName = player.name;
            charTitle = botData ? botData.name : "VISITOR";
            const botSpriteURL = new URL("/assets/visitors_sprite.webp", import.meta.url).href;
            
            // Responsive Percentage Scaling for Bots (5 columns, 2 rows of 700x1200 cards, cropped to show top 700x800)
            const bIndex = player.botId - 1;
            const bX = (bIndex % 5) * 25;
            const bY = Math.floor(bIndex / 5) * 75;
            bgStyle = `background-image: url('${botSpriteURL}'); background-size: 500% 300%; background-position: ${bX}% ${bY}%;`;
        }

        let buttonsHtml = `
         <div class="flex gap-1 mt-1">
             <button id="p-status-btn-${player.id}" onclick="window.app.openInlineCommandPopup(${player.id})" class="flex-1 py-1 font-bold font-overpass uppercase tracking-wider text-[24px] rounded-none shadow-sm transition-all duration-300 cursor-pointer bg-slate-800 text-slate-300 hover:bg-slate-700">ABILITIES</button>
         </div>`;

        const html = `
        <div class="flex flex-col w-full shrink-0 relative z-20" id="player-card-${player.id}">
            <div id="p-backplate-${player.id}" class="player-info-backplate transition-colors duration-300 relative">
                <div class="board-player-name text-center font-black uppercase mb-1 tracking-widest truncate px-1 font-overpass" id="p-name-${player.id}"></div>
                <div id="p-border-${player.id}" class="relative w-full mx-auto aspect-[7/8] overflow-hidden transition-all duration-300 bg-slate-900 group rounded-none player-card-border shadow-md cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-transform" onclick="window.app.openInlineCommandPopup(${player.id})">
                    <div class="absolute inset-0 bg-no-repeat player-char-img" style="${bgStyle}"></div>
                    <div id="p-fold-overlay-${player.id}" class="hidden absolute inset-0 z-40 bg-black/60 flex items-center justify-center transition-opacity duration-300">
                        <span class="text-red-500 font-black text-[60px] -rotate-12 border-4 border-red-500 px-6 py-2 tracking-widest bg-black/50 shadow-lg font-overpass">FOLD</span>
                    </div>
                    <div id="p-winner-overlay-${player.id}" class="hidden absolute inset-0 bg-yellow-400/90 z-50 flex items-center justify-center animate-pop-in border-4 border-white"><span class="text-black font-black text-[60px] font-overpass">WINNER!</span></div>
                </div>
                ${buttonsHtml}
                <div class="mt-1 stats-panel rounded-none p-1 border border-slate-600 space-y-0">
                    <div id="p-gold-row-${player.id}" class="flex justify-between items-center font-overpass leading-none mb-0.5 transition-all duration-300 rounded">
                        <span class="stats-label text-[#F3C80D]">Gold</span>
                        <span id="p-gold-${player.id}" class="text-score font-black font-overpass drop-shadow-md">0</span>
                    </div>
                    <div class="flex justify-between items-center font-overpass leading-none">
                        <span class="stats-label">Prestige Points</span>
                        <span id="p-prestige-${player.id}" class="text-score font-black font-overpass drop-shadow-md">0</span>
                    </div>
                    <div class="flex justify-between border-t border-slate-700 pt-0.5 min-h-[16px] font-overpass mt-0.5 leading-none items-center">
                        <span class="stats-label text-slate-300">Powers</span>
                        <div id="p-powers-${player.id}" class="flex gap-1"></div>
                    </div>
                    <div class="flex justify-between border-t border-slate-700 pt-0.5 min-h-[16px] font-overpass mt-0.5 leading-none items-center">
                        <span class="stats-label text-slate-300">Rerolls</span>
                        <div id="p-rerolls-${player.id}" class="flex gap-1"></div>
                    </div>
                    <div class="flex justify-between border-t border-slate-700 pt-0.5 min-h-[16px] font-overpass mt-0.5 leading-none items-center">
                        <span class="stats-label text-slate-300">Extra Turns</span>
                        <div id="p-extra-turns-${player.id}" class="flex gap-1"></div>
                    </div>
                </div>
                <!-- SIDE PANEL AUCTION CONTROLS REMOVED -->
            </div>
            <div class="mt-1 w-full flex flex-col items-center gap-2 p-1" id="inventory-${player.id}"></div>
        </div>`;
        leftPanel.innerHTML += html;
    });
    updateUI();
}

export function updateAuctionUI() {
    const container = document.getElementById('central-auction-ui');
    const aa = state.activeAuction;

    if (state.mode !== 'AUCTION' || !aa) {
        if (container && !container.classList.contains('hidden')) {
            container.classList.add('hidden');
        }
        return;
    }

    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
    }

    // 1. Update Current Bid (Legacy check, usually removed from HTML now)
    const bidValEl = document.getElementById('auc-ui-bid-val');
    if (bidValEl) bidValEl.innerText = `${aa.currentBid} Au`;

    // 2. Update Active Bidder Card
    const bidderContainer = document.getElementById('auction-active-bidder');

    // SAFETY CHECK: Ensure participants exist and turnIndex is valid
    if (!aa.participants || aa.turnIndex === undefined || aa.turnIndex < 0 || aa.turnIndex >= aa.participants.length) {
        console.warn("Invalid auction state in updateAuctionUI", aa);
        return;
    }

    const activePlayer = state.players[aa.participants[aa.turnIndex]];

    // SAFETY CHECK: Ensure activePlayer exists
    if (!activePlayer) {
        console.warn("Active player undefined in auction UI update");
        return;
    }

    if (bidderContainer) {
        let bgStyle = '';
        let charNameStr = '???';
        let charTitleStr = '???';

        // 1. Check if the active bidder is a Bot
        if (activePlayer.type === 'BOT') {
            const botData = botRoster.find(b => b.id === activePlayer.botId);
            charNameStr = botData ? botData.name : "VISITOR";
            charTitleStr = "VISITOR";
            
            const botSpriteURL = new URL(/* @vite-ignore */ "../assets/visitors_sprite.webp", import.meta.url).href;
            
            // Coordinate Math: 5 columns, 2 rows (percentage crop to show top 700x800 of 700x1200)
            const bIndex = activePlayer.botId - 1;
            const bX = (bIndex % 5) * 25;
            const bY = Math.floor(bIndex / 5) * 75;
            
            bgStyle = `background-image: url('${botSpriteURL}'); background-size: 500% 300%; background-position: ${bX}% ${bY}%;`;
            
        // 2. Otherwise, treat as Human Local
        } else if (activePlayer.character) {
            charNameStr = activePlayer.character.name;
            charTitleStr = activePlayer.character.title;
            const charId = activePlayer.character.id;
            const posX = (charId % 5) * 25;
            const posY = Math.floor(charId / 5) * 75;
            
            bgStyle = `background-image: url('${CHARACTER_SPRITE_PRINT_URL}'); background-size: 500% 300%; background-position: ${posX}% ${posY}%;`;
        }

        // Render the Massive Bidder Card (proportions adjusted to 500x571 px for 700x800 7:8 aspect ratio)
        bidderContainer.innerHTML = `
            <div class="flex flex-col items-center gap-10">
                <div class="w-[700px] min-h-[820px] bg-[#26385C] rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.8)] border-8 border-slate-600 flex flex-col items-center p-12 relative">
                    <div class="board-player-name text-center font-black uppercase tracking-widest truncate px-1 font-overpass text-[48px] mb-8 text-white w-full border-b-4 border-white/20 pb-4">${activePlayer.name}</div>
                    
                    <div class="relative w-[500px] h-[571px] overflow-hidden bg-slate-900 rounded shadow-2xl border-8 border-[#DA795A] shrink-0">
                        <div class="absolute inset-0 bg-no-repeat" style="${bgStyle}"></div>
                    </div>
                    
                    <div class="mt-8 text-center w-full">
                        <h3 class="board-char-name font-black leading-none tracking-wider uppercase font-overpass text-[36px] text-white">${charNameStr}</h3>
                        <p class="board-char-desc font-bold uppercase tracking-widest truncate font-overpass text-[24px] text-[#88C9CC] mt-2">${charTitleStr}</p>
                    </div>
                </div>
                
                <div class="bg-black/80 backdrop-blur-xl px-16 py-6 rounded-full border-4 border-white/30 shadow-[0_0_50px_rgba(243,200,13,0.3)] mt-2">
                     <span class="text-white font-black font-overpass text-[50px]">Current Bid: <span class="text-gold" id="auc-ui-bid-val">${aa.currentBid} Au</span></span>
                </div>
            </div>
        `;
    }


    // 3. Update Buttons
    // Only enabled if it's a human turn
    const isHumanTurn = activePlayer.type === 'HUMAN';

    // Check raise availability (Total gold must cover new bid)
    const canAfford = (amt) => (activePlayer?.gold || 0) >= (aa.currentBid + amt);

    const btn1 = document.getElementById('btn-raise-1');
    const btn3 = document.getElementById('btn-raise-3');
    const btn5 = document.getElementById('btn-raise-5');
    const btnFold = document.getElementById('btn-fold-main');

    if (btn1) {
        btn1.disabled = !isHumanTurn || !canAfford(1);
    }
    if (btn3) {
        btn3.disabled = !isHumanTurn || !canAfford(3);
    }
    if (btn5) {
        btn5.disabled = !isHumanTurn || !canAfford(5);
    }
    if (btnFold) {
        btnFold.disabled = !isHumanTurn;
    }
}


export function updateUI() {
    if (state.isGameOver) return;
    if (!state.players || state.players.length === 0) return;

    // Calculate display prestige (current + bank)
    const isTournament = state.config.miznerVariation;
    const playerScores = state.players.map(p => isTournament ? (p.prestige + p.bankedPrestige) : p.prestige);
    const maxPrestige = Math.max(...playerScores);

    // Update Turn Indicator Card position
    const turnCard = document.getElementById('turn-indicator-card');
    if (turnCard && state.mode === 'GAME' && state.turn !== -1) {
        const activePlayerCard = document.getElementById(`player-card-${state.turn}`);
        if (activePlayerCard) {
            // Position relative to the #left-panel-cards grid
            const left = activePlayerCard.offsetLeft;
            // Place it exactly 1000px from the top of the left panel
            const top = 1000;
            
            turnCard.style.left = `${left}px`;
            turnCard.style.top = `${top}px`;
            turnCard.style.opacity = '1';
            
            const activePlayer = state.players[state.turn];
            if (activePlayer) {
                document.getElementById('turn-card-name').innerText = activePlayer.name;
            }
        } else {
            turnCard.style.opacity = '0';
        }
    } else if (turnCard) {
        turnCard.style.opacity = '0';
    }

    // Delegate Auction UI update
    updateAuctionUI();

    state.players.forEach(p => {
        const isActive = (p.id === state.turn);

        const goldEl = document.getElementById(`p-gold-${p.id}`);
        if (goldEl) {
            if (p.type === 'BOT' && !state.config.showBotMoney) {
                goldEl.innerText = "?";
            } else {
                goldEl.innerText = p.gold;
            }

            goldEl.style.color = '#F3C80D'; // Always gold
        }

        const prestigeEl = document.getElementById(`p-prestige-${p.id}`);
        if (prestigeEl) {
            const currentTotal = isTournament ? (p.prestige + p.bankedPrestige) : p.prestige;
            prestigeEl.innerText = currentTotal;
            if (currentTotal > 0 && currentTotal === maxPrestige) {
                prestigeEl.classList.add('leader');
            } else {
                prestigeEl.classList.remove('leader');
            }
        }

        const powersEl = document.getElementById(`p-powers-${p.id}`);
        if (powersEl) {
            powersEl.innerHTML = '';
            for (let i = 0; i < (p.counters || 0); i++) {
                const c = document.createElement('div');
                c.className = "w-3 h-3 rounded-full bg-purple-500 border border-purple-700 shadow-sm animate-pop-in";
                powersEl.appendChild(c);
            }
        }

        const rerollsEl = document.getElementById(`p-rerolls-${p.id}`);
        if (rerollsEl) {
            rerollsEl.innerHTML = '';
            for (let i = 0; i < (p.rerolls || 0); i++) {
                const c = document.createElement('div');
                c.className = "w-3 h-3 rounded-full bg-rose-500 border border-rose-700 shadow-sm animate-pop-in";
                rerollsEl.appendChild(c);
            }
        }

        const extraTurnsEl = document.getElementById(`p-extra-turns-${p.id}`);
        if (extraTurnsEl) {
            extraTurnsEl.innerHTML = '';
            for (let i = 0; i < (p.extraTurns || 0); i++) {
                const c = document.createElement('div');
                c.className = "w-3 h-3 rounded-full bg-amber-500 border border-amber-700 shadow-sm animate-pop-in";
                extraTurnsEl.appendChild(c);
            }
        }

        const statusBtn = document.getElementById(`p-status-btn-${p.id}`);
        if (statusBtn) {
            if (isActive) {
                statusBtn.innerText = "COMMANDS READY";
                statusBtn.className = "flex-1 py-1 font-black font-overpass uppercase tracking-wider text-[24px] rounded-none shadow-sm transition-all duration-300 cursor-pointer commands-ready-pulse";
            } else {
                statusBtn.innerText = "ABILITIES";
                statusBtn.className = "flex-1 py-1 font-bold font-overpass uppercase tracking-wider text-[24px] rounded-none shadow-sm transition-all duration-300 cursor-pointer bg-slate-800 text-slate-300 hover:bg-slate-700";
            }
        }

        const nameEl = document.getElementById(`p-name-${p.id}`);
        if (nameEl) {
            nameEl.innerText = p.name;
            if (isActive) {
                nameEl.classList.add('active');
            } else {
                nameEl.classList.remove('active');
            }
        }

        const backplate = document.getElementById(`p-backplate-${p.id}`);
        const cardBorder = document.getElementById(`p-border-${p.id}`);

        if (backplate) {
            backplate.classList.remove('bg-[#F3C80D]/20', 'opacity-100', 'opacity-50'); // Cleanup old classes
            
            if (isActive) {
                backplate.style.backgroundColor = "#F3C80D"; // Solid Brand Yellow
                backplate.style.color = ""; // Reverts to default CSS (no longer black)
                if (cardBorder) cardBorder.style.opacity = "1"; // Image fully visible
            } else {
                backplate.style.backgroundColor = "#1e293b"; // Default Slate 800
                backplate.style.color = ""; // Default text color
                if (cardBorder) cardBorder.style.opacity = "0.5"; // Dim inactive image
            }

            const existingSkip = backplate.querySelector('.skip-turn-token');
            if (existingSkip) existingSkip.remove();

            if (p.skipNextTurn) {
                const skipToken = document.createElement('div');
                skipToken.className = "skip-turn-token absolute -top-4 -right-4 bg-red-600 text-white border-4 border-white font-black px-4 py-2 flex items-center justify-center shadow-2xl text-[26px] z-50 font-overpass rounded-xl tracking-wider animate-pulse uppercase whitespace-nowrap";
                skipToken.style.transform = "rotate(5deg)";
                skipToken.innerText = "SKIP NEXT TURN";
                backplate.appendChild(skipToken);
            }
        }

        const invEl = document.getElementById(`inventory-${p.id}`);
        if (invEl) {
            invEl.innerHTML = '';
            const totalCards = p.inventory.length;
            if (totalCards >= 6) {
                invEl.style.position = 'relative';
                invEl.style.height = '1500px';
                invEl.style.display = 'block';
            } else {
                invEl.style.position = '';
                invEl.style.height = '';
                invEl.style.display = '';
            }
            p.inventory.forEach((card, idx) => {
                const cardDiv = document.createElement('div');
                cardDiv.className = "w-[250px] h-[250px] rounded border border-slate-600 shadow-md bg-white";
                let bgUrl = LUXURY_CARD_SPRITE_URL;
                let bgX = 0, bgY = 0;
                if (card.type === 'PROPERTY') {
                    bgUrl = PROPERTY_SPRITE_URL; bgX = card.spriteX;
                } else {
                    const s = getLuxuryCardStyle(card.spriteIndex);
                    bgX = s.bgX; bgY = s.bgY;
                }
                if (card.type === 'PROPERTY') {
                    cardDiv.style.backgroundImage = `url('${bgUrl}')`;
                    // 1:1 Scaling for 250px cards in a 250px container
                    cardDiv.style.backgroundSize = "750px 250px";
                    cardDiv.style.backgroundPosition = `${card.spriteX}px 0`;
                } else {
                    cardDiv.style.backgroundImage = `url('${bgUrl}')`;
                    // 1:1 Scaling for 250px cards in a 250px container
                    cardDiv.style.backgroundSize = "750px 1750px";
                    cardDiv.style.backgroundPosition = `${bgX}px ${bgY}px`;
                }

                if (totalCards >= 6) {
                    cardDiv.style.position = 'absolute';
                    const topPos = idx * (1250 / (totalCards - 1));
                    cardDiv.style.top = `${topPos}px`;
                    cardDiv.style.left = '50%';
                    cardDiv.style.transform = 'translateX(-50%)';
                    cardDiv.style.zIndex = `${totalCards - idx}`;
                }

                invEl.appendChild(cardDiv);
            });
        }

        const foldOverlay = document.getElementById(`p-fold-overlay-${p.id}`);
        if (foldOverlay) {
            const aa = state.activeAuction;
            if (state.mode === 'AUCTION' && aa && aa.participants && !aa.participants.includes(p.id) && !p.justWon) {
                foldOverlay.classList.remove('hidden');
            } else {
                foldOverlay.classList.add('hidden');
            }
        }
    });

    state.luxuryDecks.forEach((d, i) => {
        const countEl = document.getElementById(`deck-count-${i}`);
        const el = document.getElementById(`deck-${i}`);
        const slot = document.getElementById(`deck-slot-${i}`);
        const container = document.getElementById(`deck-container-${i}`);
        const targetSlot = slot || container || el;

        // Clean up any existing tax token from slot, container, or card element
        [slot, container, el].forEach(parent => {
            if (parent) {
                const existingTax = parent.querySelector('.luxury-tax-token');
                if (existingTax) existingTax.remove();
            }
        });

        if (d.cards.length > 0) {
            if (countEl) { countEl.innerText = d.cards.length; countEl.classList.remove('hidden'); }
            if (el) {
                const taxCount = state.luxuryTaxCounters ? state.luxuryTaxCounters[i] : 0;
                if (taxCount > 0 && targetSlot) {
                    const taxToken = document.createElement('div');
                    taxToken.className = "luxury-tax-token absolute -top-6 -right-6 bg-red-600 text-white border-4 border-white font-black px-4 py-2 flex items-center justify-center shadow-2xl text-[32px] z-50 font-overpass rounded-xl tracking-wider pointer-events-none";
                    taxToken.style.transform = "rotate(5deg)";
                    taxToken.innerText = `+${taxCount * 2} Au`;
                    targetSlot.appendChild(taxToken);
                }

                el.classList.remove('cursor-default'); 
                el.classList.add('cursor-pointer', 'shadow-lg', 'animate-card-wiggle');
                el.style.animationDelay = `${i * 4}s`;

                const isCardOpen = (state.activeGambitId === 1) || ((state.config.jaegaVariation || state.config.miznerVariation) && state.jaegaRevealed) || d.isFlippedOpen;
                if (isCardOpen) {
                    const topCard = d.cards[d.cards.length - 1];
                    const style = getLuxuryCardStyle(topCard.spriteIndex);
                    el.style.backgroundImage = `url('${LUXURY_CARD_SPRITE_URL}')`;
                    el.style.backgroundSize = "750px 1750px";
                    el.style.backgroundPosition = `${style.bgX}px ${style.bgY}px`;
                    el.classList.remove('gold-glimmer');
                } else {
                    el.style.backgroundImage = `url('${LUXURY_BACK_URL}')`;
                    el.style.backgroundSize = "100% 100%"; el.style.backgroundPosition = "";
                    el.classList.add('gold-glimmer');
                }

                let lockOverlay = el.querySelector('.deck-lock-overlay');
                if (state.activeGambitId === 2 || state.activeGambitId === 3) {
                    el.classList.add('pointer-events-none', 'grayscale');
                    el.classList.remove('gold-glimmer', 'cursor-pointer', 'shadow-lg', 'animate-card-wiggle');
                    if (container) container.classList.add('pointer-events-none');
                    if (!lockOverlay) {
                        lockOverlay = document.createElement('div');
                        lockOverlay.className = "deck-lock-overlay absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none";
                        lockOverlay.innerHTML = `
                            <svg class="w-20 h-20 text-white drop-shadow-2xl" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path></svg>
                        `;
                        el.appendChild(lockOverlay);
                    }
                } else {
                    el.classList.remove('pointer-events-none', 'grayscale');
                    if (container) container.classList.remove('pointer-events-none');
                    if (lockOverlay) {
                        lockOverlay.remove();
                    }
                }
            }

        } else {
            if (countEl) countEl.classList.add('hidden');
            if (el) { 
                el.style.backgroundImage = 'none'; 
                el.classList.add('cursor-default'); 
                el.classList.remove('cursor-pointer', 'gold-glimmer', 'shimmer-active', 'shadow-lg', 'animate-card-wiggle'); 
                const lockOverlay = el.querySelector('.deck-lock-overlay');
                if (lockOverlay) lockOverlay.remove();
            }
        }
    });

    if (state.config.roxanaVariation && state.roxanaRevealed) {
        ['A', 'B'].forEach(id => {
            const el = document.getElementById(`auction-${id}`);
            if (el) {
                const auc = state.auctions[id];
                el.style.backgroundImage = `url('${AUCTION_CARD_SPRITE_URL}')`;
                el.style.backgroundSize = '1000px 1500px';
                el.style.backgroundPosition = `0px ${auc.card.mapY}px`;
            }
        });
    }

    updateObjectiveTracker();

    // Update Carina lock tokens on board cells
    state.grid.forEach(cell => {
        const cellEl = document.getElementById(`cell-container-${cell.id}`);
        if (!cellEl) return;
        
        // Remove existing lock token if any
        const existingLock = cellEl.querySelector('.carina-lock-token');
        if (existingLock) existingLock.remove();
        
        const isLocked = state.carinaLockedCells && state.carinaLockedCells[cell.id];
        if (isLocked && !cell.flipped) {
            const lockToken = document.createElement('div');
            lockToken.className = "carina-lock-token absolute inset-0 bg-red-600/40 border-4 border-red-500 rounded-none flex flex-col items-center justify-center pointer-events-none z-[100] font-overpass";
            lockToken.innerHTML = `
                <svg class="w-16 h-16 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] mb-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"></path>
                </svg>
                <div class="text-white text-[40px] font-overpass leading-none text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" style="font-weight: 200;">
                    LOCKED<br>
                    ROLL 5-6
                </div>
            `;
            cellEl.appendChild(lockToken);
        }
    });
}

export function highlightBotButton(playerId, action) {
    const container = document.getElementById('auction-active-bidder');
    if (container) {
        const color = action === 'raise' ? 'border-green-500' : 'border-red-500';
        container.classList.add('border-4', color);
        setTimeout(() => container.classList.remove('border-4', color), window.getDelay(500));
    }
}

export function updateCardVisuals(cell) {
    const cellEl = document.getElementById(`cell-container-${cell.id}`);
    const frontEl = document.getElementById(`cell-front-${cell.id}`);
    if (!cellEl || !frontEl) return;
    cellEl.style.backgroundImage = 'none';
    cellEl.classList.add('cursor-default');
    
    // Remove white border on flip
    cellEl.classList.remove('border-2', 'border-white');

    frontEl.classList.remove('hidden');
    frontEl.className = "w-full h-full bg-no-repeat relative bg-white";
    frontEl.style.backgroundImage = `url('${CARD_SPRITE_URL}')`;
    frontEl.style.backgroundSize = '2000px 2000px';
    const spriteRow = Math.floor(cell.spriteIndex / 8);
    const spriteCol = cell.spriteIndex % 8;
    frontEl.style.backgroundPosition = `-${spriteCol * 250}px -${spriteRow * 250}px`;
    if (cell.isBonus) cellEl.classList.add('bonus-effect');

    // Hide reward container when flipped
    const rewardEl = cellEl.querySelector('.reward-container');
    if (rewardEl) {
        rewardEl.style.display = 'none';
        rewardEl.style.visibility = 'hidden';
    }
}

export function unflipCardVisuals(cell) {
    cell.flipped = false;
    const cellEl = document.getElementById(`cell-container-${cell.id}`);
    if (!cellEl) return;
    const frontEl = document.getElementById(`cell-front-${cell.id}`);
    if (frontEl) frontEl.classList.add('hidden');

    cellEl.classList.remove('cursor-default');
    cellEl.classList.add('cursor-pointer');
    cellEl.classList.remove('bonus-effect', 'animate-gold-radiate', 'animate-burst-gold');

    // Restore back-side background styling
    let backCol = 2; // Default to BLOCK
    if (cell.c === 0) backCol = 0; // Lagoon
    else if (cell.c === 1 || cell.c === 7) backCol = 1; // Waterfront
    else if (cell.c === 8) backCol = 3; // Atlantic

    cellEl.style.backgroundImage = `url('${GAME_SPRITE_URL}')`;
    cellEl.style.backgroundPosition = `-${backCol * CELL_SIZE}px 0px`;
    cellEl.style.backgroundSize = `1000px 250px`;
    cellEl.style.backgroundRepeat = 'no-repeat';

    // Show reward container when unflipped
    const rewardEl = cellEl.querySelector('.reward-container');
    if (rewardEl) {
        rewardEl.style.display = 'none';
        rewardEl.style.visibility = 'hidden';
    }
}

export function resetGambit2MapCards(keepRowIndex = null) {
    if (!state || !state.grid) return;
    state.grid.forEach(cell => {
        if (!cell.empty && cell.flipped) {
            if (keepRowIndex !== null && cell.r === keepRowIndex) {
                return;
            }
            unflipCardVisuals(cell);
        }
    });
}
if (typeof window !== 'undefined') {
    window.resetGambit2MapCards = resetGambit2MapCards;
}

export function executeGambit2Step10Continue() {
    const overlay = document.getElementById('g2-row-bonus-overlay');
    if (overlay) overlay.remove();
    
    const rowCells = state.grid.filter(cell => cell.r === 4 && !cell.empty);
    const uncompletedCells = rowCells.filter(c => !c.flipped);

    if (uncompletedCells.length === 0) {
        state.tutorialStep = 11;
        if (typeof runTutorialStep === 'function') {
            runTutorialStep();
        } else if (window.app && window.app.runTutorialStep) {
            window.app.runTutorialStep();
        }
        return;
    }

    audioMgr.play('flip');
    uncompletedCells.forEach(cell => {
        cell.flipped = true;
        updateCardVisuals(cell);
    });

    const player = state.players.find(p => p.type === 'HUMAN') || state.players[0];
    const checkFn = window.checkLineBonuses || (window.app && window.app.checkLineBonuses);
    if (typeof checkFn === 'function') {
        checkFn(player, rowCells[0], () => {
            const progressFn = window.handleGambit2Step10Progress || (window.app && window.app.handleGambit2Step10Progress);
            if (typeof progressFn === 'function') {
                progressFn(state, 'MAP');
            } else {
                state.tutorialStep = 11;
                if (typeof runTutorialStep === 'function') runTutorialStep();
                else if (window.app && window.app.runTutorialStep) window.app.runTutorialStep();
            }
        });
    } else {
        triggerWaveAnimation(rowCells, player, 'ROW', () => {
            player.hasRowBonus = true;
            player.hasLineBonus = true;
            state.tutorialStep = 11;
            if (typeof runTutorialStep === 'function') runTutorialStep();
            else if (window.app && window.app.runTutorialStep) window.app.runTutorialStep();
        });
    }
}
if (typeof window !== 'undefined') {
    window.executeGambit2Step10Continue = executeGambit2Step10Continue;
}

export function animateCellFlip(cell, earned, isBonus, callback) {
    // If on the fastest setting, bypass all DOM generation and snap instantly!
    if (window.state?.settings?.animationSpeed === 1) {
        callback();
        return;
    }

    const cellEl = document.getElementById(`cell-container-${cell.id}`);
    if (isBonus) {
        cellEl.classList.add('animate-gold-radiate');
        setTimeout(() => cellEl.classList.remove('animate-gold-radiate'), window.getAnimationDelay ? window.getAnimationDelay(2500, 'general') : window.getDelay(2500));
    }
    const rect = cellEl.getBoundingClientRect();
    const container = document.createElement('div');
    container.className = 'flip-container';

    // Fix: Apply current zoom scale to the animation container
    const currentZoom = state.zoom || 1.0;
    container.style.transform = `scale(${currentZoom})`;
    container.style.transformOrigin = 'top left';

    container.style.top = `${rect.top}px`; container.style.left = `${rect.left}px`; container.style.zIndex = "100";
    container.style.width = `${rect.width / currentZoom}px`;
    container.style.height = `${rect.height / currentZoom}px`;

    const flipper = document.createElement('div'); flipper.className = 'flipper';
    const faceBack = document.createElement('div'); faceBack.className = 'flip-face flip-face-back bg-white';
    faceBack.style.backgroundImage = `url('${GAME_SPRITE_URL}')`;
    
    // Calculate percentage-based background for back face
    let backCol = 2; // Default to BLOCK
    if (cell.c === 0) backCol = 0; // Lagoon
    else if (cell.c === 1 || cell.c === 7) backCol = 1; // Waterfront
    else if (cell.c === 8) backCol = 3; // Atlantic
    
    faceBack.style.backgroundSize = '400% 100%';
    faceBack.style.backgroundPosition = `${(backCol / 3) * 100}% 0%`;
    faceBack.style.backgroundRepeat = 'no-repeat';

    const faceFront = document.createElement('div'); faceFront.className = 'flip-face flip-face-front bg-white';
    faceFront.style.backgroundImage = `url('${CARD_SPRITE_URL}')`; 
    
    // Calculate percentage-based background for front face (8x8 grid)
    const spriteRow = Math.floor(cell.spriteIndex / 8); 
    const spriteCol = cell.spriteIndex % 8;
    faceFront.style.backgroundSize = '800% 800%';
    faceFront.style.backgroundPosition = `${(spriteCol / 7) * 100}% ${(spriteRow / 7) * 100}%`;

    if (isBonus) faceFront.classList.add('bonus-effect');
    const duration = window.getAnimationDelay ? window.getAnimationDelay(900, 'flip') : window.getDelay(900);
    const flipDelay = Math.max(25, Math.round(duration * 0.45));
    
    // Clone rewards to the flipper's back face so they are visible during the flip
    const rewardContainer = cellEl.querySelector('.reward-container');
    if (rewardContainer) {
        const rewardClone = rewardContainer.cloneNode(true);
        rewardClone.classList.remove('z-10'); // Let the flipper handle stacking
        faceBack.appendChild(rewardClone);
    }

    flipper.appendChild(faceBack); flipper.appendChild(faceFront); container.appendChild(flipper); document.body.appendChild(container);

    container.style.pointerEvents = 'none';

    setTimeout(() => {
        container.classList.add('flip'); audioMgr.play('flip');
        if (isBonus) audioMgr.play('bonus_card');
    }, window.getAnimationDelay ? window.getAnimationDelay(50, 'flip') : 50);
    setTimeout(() => {
        const target = document.getElementById(`cell-container-${cell.id}`);
        if (target) {
            target.style.transition = 'none';
            target.style.opacity = '0';
        }
    }, flipDelay);
    setTimeout(() => {
        const target = document.getElementById(`cell-container-${cell.id}`);
        if (target) {
            target.style.opacity = '1';
            setTimeout(() => { target.style.transition = ''; }, 50);
        }
        
        // Transition down to match board scale and fade out
        container.style.transform = `scale(${currentZoom})`;
        container.style.opacity = '0';

        setTimeout(() => {
            container.remove();
            callback();
        }, window.getAnimationDelay ? window.getAnimationDelay(300, 'flip') : 300);
    }, duration);
}




export function flyTextAnimation(startElId, playerId, text, onComplete) {
    const startEl = document.getElementById(startElId);
    const endEl = document.getElementById(`player-card-${playerId}`);
    if (!startEl || !endEl) { if (onComplete) onComplete(); return; }
    const startRect = startEl.getBoundingClientRect();
    const endRect = endEl.getBoundingClientRect();
    const flyer = document.createElement('div');
    const colorClass = 'text-[#F3C80D]';
    flyer.className = `flying-text ${colorClass}`;
    if (text.includes('<')) flyer.innerHTML = text; else flyer.innerText = text;
    const startX = startRect.left + (startRect.width / 2);
    const startY = startRect.top + (startRect.height / 2);

    // Fix: Apply current zoom scale
    const currentZoom = state.zoom || 1.0;
    flyer.style.transform = `translate(-50%, -50%) scale(${currentZoom})`;
    flyer.style.transformOrigin = 'center center';

    flyer.style.position = 'fixed'; flyer.style.left = `${startX}px`; flyer.style.top = `${startY}px`;
    document.body.appendChild(flyer);
    const duration = state.settings?.fastAnimations ? 0.3 : 0.8;
    requestAnimationFrame(() => {
        flyer.style.transition = `all ${duration}s cubic-bezier(0.11, 0, 0.5, 0)`;
        const endX = endRect.left + (endRect.width / 2);
        const endY = endRect.top + (endRect.height / 2);
        flyer.style.left = `${endX}px`; flyer.style.top = `${endY}px`;
        flyer.style.opacity = '1';
        // Keep the scale when moving
        flyer.style.transform = `translate(-50%, -50%) scale(${currentZoom})`;
    });
    setTimeout(() => { flyer.remove(); if (onComplete) onComplete(); }, duration * 1000 + 100);
}

export function flyCardAnimation(deckIndex, playerIndex, cardData, callback) {
    const deckEl = document.getElementById(`deck-${deckIndex}`);
    const inventoryContainer = document.getElementById(`inventory-${playerIndex}`);
    if (!deckEl || !inventoryContainer) { callback(); return; }
    try {
        const startRect = deckEl.getBoundingClientRect();
        const endRect = inventoryContainer.getBoundingClientRect();
        const flyer = document.createElement('div');
        flyer.className = 'flying-card';
        flyer.style.backgroundImage = `url('${LUXURY_CARD_SPRITE_URL}')`;
        flyer.style.backgroundSize = '750px 1750px';
        const styles = getLuxuryCardStyle(cardData.spriteIndex);
        flyer.style.backgroundPosition = `${styles.bgX}px ${styles.bgY}px`;
        // Fix: Apply current zoom scale
        const currentZoom = state.zoom || 1.0;
        flyer.style.transform = `scale(${currentZoom})`;
        flyer.style.transformOrigin = 'top left';

        flyer.style.top = `${startRect.top}px`; flyer.style.left = `${startRect.left}px`;
        document.body.appendChild(flyer);
        flyer.getBoundingClientRect();
        flyer.style.transition = 'all 0.8s ease-in-out';
        flyer.style.top = `${endRect.top}px`; flyer.style.left = `${endRect.left}px`;
        setTimeout(() => { try { flyer.remove(); } catch (e) { } callback(); }, window.getDelay(900));
    } catch (e) { callback(); }
}

export function rollDiceVisual(result, callback) {
    const overlay = document.getElementById('dice-overlay');
    const cube = document.getElementById('dice-cube');
    const msg = document.getElementById('dice-message');

    // Clear any previous transform so animation works cleanly
    cube.style.transform = '';

    overlay.classList.remove('hidden');
    cube.classList.add('spinning');
    msg.style.opacity = '0'; msg.innerText = "Rolling...";
    audioMgr.startDiceLoop();

    const diceDelay = window.getDiceDuration ? window.getDiceDuration() : 300;
    const msgDelay = Math.max(50, Math.round(diceDelay * 0.7));

    setTimeout(() => {
        cube.classList.remove('spinning'); audioMgr.stopDiceLoop();
        let x = 0, y = 0;
        switch (result) {
            case 1: x = 0; y = 0; break; case 2: x = 0; y = 180; break; case 3: x = 0; y = -90; break;
            case 4: x = 0; y = 90; break; case 5: x = -90; y = 0; break; case 6: x = 90; y = 0; break;
        }
        x += 360; y += 720;
        cube.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
        setTimeout(() => {
            msg.style.opacity = '1'; msg.innerText = result;
            setTimeout(() => {
                // Execute callback first to determine if reroll is pending
                callback();

                // Only hide and reset if no reroll is pending
                if (!state.rerollPending) {
                    overlay.classList.add('hidden');
                    cube.style.transform = 'translateZ(-50px)';
                }
            }, 100);
        }, msgDelay);
    }, diceDelay);
}

export function hideDiceOverlay() {
    const overlay = document.getElementById('dice-overlay');
    const controls = document.getElementById('reroll-controls');
    const cube = document.getElementById('dice-cube');

    if (overlay) overlay.classList.add('hidden');
    if (controls) controls.classList.add('hidden');
    if (cube) cube.style.transform = 'translateZ(-50px)';
}

export function setupAuctionVisuals(id, card, showCenter = true) {
    const el = document.getElementById(`auction-${id}`);
    if (!el) return;

    // Setup background map (Auctions A/B locations)
    el.classList.remove('hidden');
    el.style.backgroundImage = `url('${AUCTION_CARD_SPRITE_URL}')`;
    el.style.backgroundSize = '1000px 1500px';
    el.style.backgroundPosition = `0px ${card.mapY}px`;

    // Remove legacy small prop image if present
    const existing = document.getElementById(`auction-prop-img-${id}`);
    if (existing) existing.remove();

    // Cleanup any existing center stage card
    const existingCenter = document.getElementById('active-auction-card');
    if (existingCenter) existingCenter.remove();

    // Only show Center Stage card if we are actually in an AUCTION AND showCenter is true
    if (state.mode === 'AUCTION' && showCenter) {
        const propDiv = document.createElement('div');
        propDiv.id = 'active-auction-card';
        // Positioned centrally under the massive player card + bid bubble
        propDiv.className = "absolute left-1/2 -translate-x-1/2 top-[1350px] w-[500px] h-[500px] z-[60] shadow-[0_0_100px_rgba(0,0,0,0.9)] border-0 rounded-none transition-transform animate-pop-in";


        propDiv.style.backgroundImage = `url('${PROPERTY_SPRITE_URL}')`;
        // High-res 1500x500 sprite for a 500px container
        propDiv.style.backgroundSize = "1500px 500px";
        propDiv.style.backgroundPosition = `${card.spriteX * 2}px 0px`;


        const container = document.getElementById('central-auction-ui');
        if (container) container.appendChild(propDiv);
        else document.body.appendChild(propDiv); // Fallback
    }

    // Legacy text removal
    const centralText = document.getElementById('central-auction-bid');
    if (centralText) centralText.classList.add('hidden');
}

export function playAuctionBonuses(auctionId, bonuses, onComplete) {
    if (!bonuses || bonuses.length === 0) { if (onComplete) onComplete(); return; }
    const startEl = document.getElementById(`auction-${auctionId}`);
    if (!startEl) { if (onComplete) onComplete(); return; }
    const startRect = startEl.getBoundingClientRect();
    const startX = startRect.left + (startRect.width / 2);
    const startY = startRect.top + (startRect.height / 2);
    let completed = 0;
    bonuses.forEach((b, i) => {
        setTimeout(() => {
            const el = document.createElement('div');
            // Fix: Apply current zoom scale
            const currentZoom = state.zoom || 1.0;

            el.className = 'fixed z-[200] font-black text-[60px] drop-shadow-md text-center leading-none text-red-500 pointer-events-none font-overpass';
            el.innerHTML = `<span>BONUS!</span><br><span>${b.amount} Au</span>`;

            el.style.left = `${startX}px`; el.style.top = `${startY}px`;
            el.style.transform = `translate(-50%, -50%) scale(${currentZoom})`;
            el.style.transformOrigin = 'center center';
            el.style.transition = 'all 2.5s ease-in-out';
            document.body.appendChild(el);
            requestAnimationFrame(() => {
                const target = document.getElementById('player-card-' + b.player.id);
                if (target) {
                    const endRect = target.getBoundingClientRect();
                    const endX = endRect.left + (endRect.width / 2);
                    const endY = endRect.top + (endRect.height / 2);
                    el.style.left = `${endX}px`; el.style.top = `${endY}px`;
                }
            });
            setTimeout(() => {
                audioMgr.play('gold_large');
                el.remove(); completed++;
                if (completed === bonuses.length) { setTimeout(() => { if (onComplete) onComplete(); }, 500); }
            }, window.getDelay(2500));
        }, i * 1000);
    });
}

export function animateAuctionWin(auctionId, card, winnerId, onComplete) {
    const propImg = document.getElementById('active-auction-card');
    const winnerCard = document.getElementById('player-card-' + winnerId);
    const winnerOverlay = document.getElementById('p-winner-overlay-' + winnerId);

    // Remove Roxana Static Card if present (Auction ended, winner takes card)
    const staticCard = document.getElementById(`roxana-static-prop-${auctionId}`);
    if (staticCard) {
        staticCard.style.transition = 'opacity 0.5s';
        staticCard.style.opacity = '0';
        setTimeout(() => staticCard.remove(), window.getDelay(500));
    }

    if (winnerOverlay) winnerOverlay.classList.remove('hidden');

    if (propImg && winnerCard) {
        // Remove centering transforms to allow top/left animation to work from current visual position
        const startRect = propImg.getBoundingClientRect();
        propImg.style.top = `${startRect.top}px`;
        propImg.style.left = `${startRect.left}px`;
        propImg.classList.remove('-translate-x-1/2', '-translate-y-1/2', 'top-1/2', 'left-1/2', 'fixed', 'absolute', 'left-[170px]', 'top-[70px]');
        propImg.style.position = 'fixed'; // Ensure it stays fixed during animation
        propImg.style.margin = '0';

        const endRect = winnerCard.getBoundingClientRect();

        // Setup transition
        propImg.style.transition = 'all 1.0s ease-in-out';
        propImg.style.zIndex = '300';

        requestAnimationFrame(() => {
            // Fly to Winner
            // Calculate center of winner card
            const targetTop = endRect.top + (endRect.height / 2) - 50; // -50 because final height is 100
            const targetLeft = endRect.left + (endRect.width / 2) - 50; // -50 because final width is 100

            propImg.style.top = `${targetTop}px`;
            propImg.style.left = `${targetLeft}px`;

            // Shrink Dimensions: 500px -> 100px
            propImg.style.width = '100px';
            propImg.style.height = '100px';

            // Adjust Background: 1500x500 -> 300x100 for 100px container (0.2x scale from native 500px cards)
            propImg.style.backgroundSize = '300px 100px';
            propImg.style.backgroundPosition = `${card.spriteX * 0.4}px 0px`;

            propImg.style.opacity = '1';
        });

        setTimeout(() => {
            propImg.remove();
            if (winnerOverlay) winnerOverlay.classList.add('hidden');
            if (onComplete) onComplete();
        }, window.getDelay(1000));
    } else {
        if (winnerOverlay) setTimeout(() => winnerOverlay.classList.add('hidden'), window.getDelay(1000));
        if (onComplete) onComplete();
    }
}

export function triggerWaveAnimation(cells, player, type, callback) {
    state.isProcessing = true;
    cells.forEach((c, i) => {
        setTimeout(() => { document.getElementById(`cell-container-${c.id}`)?.classList.add('bonus-pop'); }, i * 110);
        setTimeout(() => { document.getElementById(`cell-container-${c.id}`)?.classList.remove('bonus-pop'); }, (i * 110) + 650);
    });
    setTimeout(() => {
        audioMgr.play('bonus_card');
        const centerCellId = cells[Math.floor(cells.length / 2)].id;
        const cellEl = document.getElementById(`cell-container-${centerCellId}`);
        
        // Temporarily boost the parent's z-index so the banner renders above all other cards
        cellEl.style.zIndex = "200";

        const bonusName = type === 'ROW' ? 'ROW BONUS' : 'COLUMN BONUS';

        // Base bonus amount
        let bonusAmount = 5;

        // Addison Ability Check (Local)
        if (player.character && player.character.name === 'ADDISON') {
            bonusAmount = 10;
        } 
        // Robot Ability Check (Visitor Hook)
        else if (player.type === 'BOT' && player.botRef?.hooks?.getLineBonus) {
            bonusAmount = player.botRef.hooks.getLineBonus(bonusAmount);
        }

        const htmlContent = `<div class="flex flex-col items-center justify-center leading-tight whitespace-nowrap"><span class="text-[#F3C80D] font-black text-[60px] drop-shadow-[0_4px_16px_rgba(0,0,0,0.85)] font-overpass">${bonusName}</span><span class="text-[#F3C80D] font-black text-[60px] drop-shadow-[0_4px_16px_rgba(0,0,0,0.85)] font-overpass">${bonusAmount} Au</span></div>`;

        const staticText = document.createElement('div');
        staticText.className = 'absolute top-1/2 left-1/2 z-[250] pointer-events-none animate-line-bonus-banner';
        staticText.innerHTML = htmlContent;
        cellEl.appendChild(staticText);

        let completed = false;
        const onBannerComplete = () => {
            if (completed) return;
            completed = true;
            staticText.remove();
            cellEl.style.zIndex = ""; // Restore original grid z-index
            audioMgr.play('gold_large');
            player.gold += bonusAmount;
            player.totalGold += bonusAmount;
            updateUI();
            if (callback) callback();
        };

        staticText.addEventListener('animationend', onBannerComplete, { once: true });
        // Fixed 1400ms fallback so animation-speed scaling does not cut the 1.4s banner short
        setTimeout(onBannerComplete, 1400);
    }, (cells.length * 110) + 150);
}

export function showVariationSplash(type, onComplete) {
    const splash = document.createElement('div');
    splash.className = "fixed inset-0 z-[1100] bg-transparent backdrop-blur-md flex flex-col items-center justify-center transition-opacity duration-1000 pointer-events-auto overflow-hidden";

    let titleText = type === 'STANDARD' ? 'STANDARD MATCH' : (type.includes('VARIATION') ? type : type + ' VARIATION');
    let objText = "OBJECTIVE: Win the game by earning the most Prestige.";

    if (state.activeGambitId) {
        const gambit = window.GAMBIT_CAMPAIGN.find(g => g.id === state.activeGambitId);
        if (gambit) {
            titleText = `GAMBIT ${gambit.id}`;
            objText = (gambit.winCondition && gambit.winCondition.uiText) ? gambit.winCondition.uiText : "OBJECTIVE: Win the match.";
        }
    }

    splash.innerHTML = `
        <div id="variation-splash-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl p-16 shadow-2xl flex flex-col items-center w-[1200px] max-w-[90vw] animate-pop-in origin-center">
            <h1 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass text-center leading-tight mb-10">
                ${titleText}
            </h1>
            <div class="w-full text-center text-white text-[60px] font-overpass font-light leading-snug max-w-[1000px]">
                ${objText}
            </div>
        </div>
    `;

    document.body.appendChild(splash);

    const inner = splash.querySelector('#variation-splash-inner');
    if (inner) {
        inner.style.transform = `scale(${state.zoom || 1.0})`;
        inner.addEventListener('animationend', () => {
            inner.classList.remove('animate-pop-in');
        }, { once: true });
    }

    setTimeout(() => {
        splash.classList.add('opacity-0');
        setTimeout(() => {
            splash.remove();
            if (onComplete) onComplete();
        }, 1000);
    }, window.getDelay(3500)); // Extended slightly so they can read the objective
}

export function animateJaegaSetup(onComplete) {
    [0, 1, 2].forEach(i => {
        const el = document.getElementById(`deck-${i}`);
        if (el) el.classList.add('jaega-pulse');
    });
    setTimeout(() => {
        [0, 1, 2].forEach(i => {
            const el = document.getElementById(`deck-${i}`);
            if (el) el.classList.remove('jaega-pulse');
        });
        if (onComplete) onComplete();
    }, window.getDelay(3000));
}

export function animateRoxanaSetup(onComplete) {
    const elA = document.getElementById(`auction-A`);
    const elB = document.getElementById(`auction-B`);
    if (elA) elA.classList.add('mizner-pulse');
    if (elB) elB.classList.add('mizner-pulse');

    // Ensure backgrounds are set
    if (state.auctions.A.card) setupAuctionVisuals('A', state.auctions.A.card, false);
    if (state.auctions.B.card) setupAuctionVisuals('B', state.auctions.B.card, false);

    // Fly Cards
    ['A', 'B'].forEach(id => {
        const auc = state.auctions[id];
        if (!auc || !auc.card) return;

        const target = document.getElementById(`auction-${id}`);
        if (!target) return;

        // Fix: Apply current zoom scale
        const currentZoom = state.zoom || 1.0;

        const flyer = document.createElement('div');
        flyer.className = 'fixed z-[200] shadow-[0_0_20px_rgba(0,0,0,0.5)] rounded border-2 border-white';
        flyer.style.width = '250px';
        flyer.style.height = '250px';
        flyer.style.backgroundImage = `url('${PROPERTY_SPRITE_URL}')`;
        flyer.style.backgroundSize = '750px 250px';
        flyer.style.backgroundPosition = `${auc.card.spriteX}px 0`;
        flyer.style.top = '50%'; flyer.style.left = '50%';
        flyer.style.transform = `translate(-50%, -50%) scale(0)`; // Initial scale 0
        flyer.style.transformOrigin = 'center center';

        flyer.style.transition = 'all 1.5s cubic-bezier(0.25, 1, 0.5, 1)';
        document.body.appendChild(flyer);

        const rect = target.getBoundingClientRect();
        const destX = rect.left + (rect.width / 2);
        const destY = rect.top + (rect.height / 2);

        requestAnimationFrame(() => {
            flyer.style.top = `${destY}px`;
            flyer.style.left = `${destX}px`;
            flyer.style.transform = `translate(-50%, -50%) scale(${currentZoom})`; // Grow to current zoom
        });

        setTimeout(() => {
            flyer.remove();
            const staticCard = document.createElement('div');
            staticCard.id = `roxana-static-prop-${id}`;
            staticCard.className = 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[250px] h-[250px] shadow-lg rounded border-2 border-white z-20 animate-pop-in';
            staticCard.style.backgroundImage = `url('${PROPERTY_SPRITE_URL}')`;
            staticCard.style.backgroundSize = '750px 250px';
            staticCard.style.backgroundPosition = `${auc.card.spriteX}px 0`;
            target.appendChild(staticCard);
            audioMgr.play('flip');
        }, window.getDelay(1500));
    });

    setTimeout(() => {
        if (elA) elA.classList.remove('mizner-pulse');
        if (elB) elB.classList.remove('mizner-pulse');
        if (onComplete) onComplete();
    }, window.getDelay(2500));
}

// --- DRAFT / GALLERY ---

export function renderV2Gallery(type) {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const header = document.getElementById('gallery-header');
    if (header && state.mode !== 'OPEN_DRAFT') {
        header.innerText = type === 'BOTS' ? "VISITORS" : "LOCALS GALLERY";
        header.className = "absolute top-[60px] left-1/2 -translate-x-1/2 text-[64px] font-black text-white uppercase tracking-[0.2em] font-overpass m-0 leading-none";
    }

    const dataset = type === 'BOTS' ? botRoster : CHARACTERS;
    const spriteURL = type === 'BOTS' 
        ? new URL(/* @vite-ignore */ '../assets/visitors_sprite.webp', import.meta.url).href 
        : CHARACTER_SPRITE_PRINT_URL;
    
    const clearedGambits = state.playerProfile?.clearedGambits || [];

    // Dynamically adjust container layout style to center the grid
    const container = document.getElementById('gallery-grid-container');
    const detailSide = document.getElementById('gallery-detail-side');
    if (container) {
        container.style.top = 'auto';
        container.style.bottom = '64px';
        container.style.left = '260px';
        container.style.width = '2320px';
        container.style.height = '1452px';
    }
    if (grid) {
        grid.style.gridTemplateRows = 'repeat(2, 686px)';
        grid.style.gap = '80px';
    }
    if (detailSide) detailSide.style.display = 'none';

    dataset.forEach((item, index) => {
        // NEW: Dynamically calculate the unlock gambit from first encounter if not already set
        if (typeof item.unlockGambit === 'undefined') {
            let requiredGambit = 0;
            // Bright Shell and Bot 1 are unlocked by default
            if (!(type === 'CHARACTERS' && item.name === 'BRIGHT SHELL') && !(type === 'BOTS' && item.id === 1)) {
                if (type === 'BOTS') {
                    const match = GAMBIT_CAMPAIGN.find(g => g.opponents && g.opponents.includes(item.id));
                    if (match) requiredGambit = match.id;
                } else {
                    const match = GAMBIT_CAMPAIGN.find(g => {
                        const rw = (g.brief?.unlockReward || "").toUpperCase();
                        const safeName = item.name.toUpperCase().replace('.', '');
                        const pa = (g.playAs || "").toUpperCase().replace('.', '');
                        return rw.includes(`LOCAL: ${safeName}`) || pa === safeName;
                    });
                    if (match) requiredGambit = match.id;
                }
            }
            item.unlockGambit = requiredGambit;
        }

        const isUnlocked = window.UnlockManager ? window.UnlockManager.isEntityUnlocked(item) : true;
        const requiredGambit = item.unlockGambit || 0;

        const posIndex = type === 'BOTS' ? item.id - 1 : index;
        const posX = (posIndex % 5) * 25;
        const posY = Math.floor(posIndex / 5) * 100;

        let overlayHtml = '';
        let lockClasses = ''; // Default: no lock classes

        const isDraftingBot = window.app && window.app.selectingBotForSlot && type === 'BOTS';
        const activeBots = isDraftingBot ? window.app.customBotSelection.slice(0, state.config.bots) : [];
        const isTaken = isDraftingBot && activeBots.includes(item.id) && window.app.customBotSelection[window.app.selectingBotForSlot - 1] !== item.id;

        let bgGrayscaleClass = '';
        if (isTaken) {
            // Keep color, just add text with strong shadow for readability
            overlayHtml = `
                <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-[18px] z-20 pointer-events-none">
                    <span class="text-white font-overpass font-black tracking-widest text-center text-[24px] uppercase drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)]">
                        ALREADY<br>SELECTED
                    </span>
                </div>
            `;
            lockClasses = ''; // Allow interaction to view details
        } else if (!isUnlocked) {
            const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
            const lockText = isDemo ? "FULL GAME" : `GAMBIT ${requiredGambit}`;
            // Pure grayscale, no brightness reduction
            overlayHtml = `
                <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-[18px] z-20 pointer-events-none">
                    <span class="text-white text-5xl mb-2 drop-shadow-lg">🔒</span>
                    <span class="text-white font-black text-[24px] tracking-widest text-center uppercase drop-shadow-md font-overpass leading-none">
                        ${lockText}
                    </span>
                </div>
            `;
            lockClasses = ''; // Allow interaction to view details
            bgGrayscaleClass = 'grayscale';
        }

        if (type === 'BOTS') {
            const intText = item.intelligence || (item.intelligenceLevel ? `LEVEL ${item.intelligenceLevel}` : 'LOW');
            let aiLevelHtml = `
                <div class="absolute top-4 right-4 bg-black/75 px-4 py-2.5 rounded border border-white/20 z-30 font-overpass font-black text-[16px] text-white tracking-widest leading-tight text-center shadow-md">
                    ${intText}
                </div>
            `;
            let clickHandler = '';
            let cursorClass = '';
            if (!isTaken && isUnlocked) {
                if (window.app && window.app.selectingBotForSlot) {
                    clickHandler = `onclick="app.confirmBotSelection(${item.id})"`;
                    cursorClass = 'cursor-pointer';
                }
            }
            const cardHtml = `
                <div id="gallery-thumb-${item.id}" ${clickHandler} class="v2-playing-card relative w-[400px] h-[686px] rounded-[18px] shrink-0 hover:scale-[1.75] hover:z-[200] z-[10] overflow-visible ${cursorClass}">
                    <div class="absolute inset-0 bg-no-repeat rounded-[18px] ${bgGrayscaleClass}" style="background-image: url('${spriteURL}'); background-size: 500% 200%; background-position: ${posX}% ${posY}%;"></div>
                    ${overlayHtml}
                    ${aiLevelHtml}
                </div>
            `;
            grid.innerHTML += cardHtml;
        } else {
            // CHARACTERS print style cards
            const cardHtml = `
                <div id="gallery-thumb-${item.id}" class="v2-playing-card relative w-[400px] h-[686px] rounded-[18px] shrink-0 hover:scale-[1.75] hover:z-[200] z-[10] overflow-visible">
                    <div class="absolute inset-0 bg-no-repeat rounded-[18px] ${bgGrayscaleClass}" style="background-image: url('${spriteURL}'); background-size: 500% 200%; background-position: ${posX}% ${posY}%;"></div>
                    ${overlayHtml}
                </div>
            `;
            grid.innerHTML += cardHtml;
        }
    });
}

/**
 * Reusable card renderer for Local / Character cards matching Compendium size and interactions.
 */
export function renderCompendiumCharacterCard(name, options = {}) {
    if (name === 'PICK 2') {
        const hoverScaleClass = options.disableHoverScale ? '' : 'hover:scale-[1.75] hover:z-[200]';
        return `
            <div class="flex flex-col items-center">
                <div class="v2-playing-card relative w-[400px] h-[686px] rounded-[18px] bg-slate-900 flex items-center justify-center font-overpass font-black text-[44px] text-white/80 uppercase shadow-2xl ${hoverScaleClass} z-[10] overflow-visible select-none">
                    PICK 2
                </div>
                <div class="text-[28px] font-black text-white uppercase mt-4 text-center tracking-wider font-overpass">PICK 2</div>
            </div>
        `;
    }
    const lookup = name === 'KINGSTONE' ? 'KINGSTON' : (name === 'BRIGHTSHELL' ? 'BRIGHT SHELL' : name);
    const char = CHARACTERS.find(c => c.name.toUpperCase() === lookup.toUpperCase());
    const charIndex = char ? CHARACTERS.indexOf(char) : 0;
    const posX = (charIndex % 5) * 25;
    const posY = Math.floor(charIndex / 5) * 100;
    const charId = char ? char.id : 0;
    const clickAttr = options.disableClick ? '' : `onclick="app.openCompendiumCharacter(${charId})"`;
    const cursorClass = options.disableClick ? '' : 'cursor-pointer';
    const hoverScaleClass = options.disableHoverScale ? '' : 'hover:scale-[1.75] hover:z-[200]';

    return `
        <div class="flex flex-col items-center">
            <div ${clickAttr} class="v2-playing-card relative w-[400px] h-[686px] rounded-[18px] shrink-0 ${hoverScaleClass} z-[10] ${cursorClass} overflow-visible">
                <div class="absolute inset-0 bg-no-repeat rounded-[18px]" style="background-image: url('${CHARACTER_SPRITE_PRINT_URL}'); background-size: 500% 200%; background-position: ${posX}% ${posY}%;"></div>
            </div>
            <div class="text-[28px] font-black text-white uppercase mt-4 text-center tracking-wider font-overpass">${name.toUpperCase()}</div>
        </div>
    `;
}

/**
 * Reusable card renderer for Visitor / Bot cards matching Compendium size and interactions.
 */
export function renderCompendiumVisitorCard(name, options = {}) {
    const bot = botRoster.find(b => b.name.toUpperCase() === name.toUpperCase());
    const bId = bot ? bot.id : 1;
    const posX = ((bId - 1) % 5) * 25;
    const posY = Math.floor((bId - 1) / 5) * 100;
    const botSpriteURL = new URL(/* @vite-ignore */ "../assets/visitors_sprite.webp", import.meta.url).href;
    const clickAttr = options.disableClick ? '' : `onclick="app.openCompendiumVisitor(${bId})"`;
    const cursorClass = options.disableClick ? '' : 'cursor-pointer';
    const hoverScaleClass = options.disableHoverScale ? '' : 'hover:scale-[1.75] hover:z-[200]';

    return `
        <div class="flex flex-col items-center">
            <div ${clickAttr} class="v2-playing-card relative w-[400px] h-[686px] rounded-[18px] shrink-0 ${hoverScaleClass} z-[10] ${cursorClass} overflow-visible">
                <div class="absolute inset-0 bg-no-repeat rounded-[18px]" style="background-image: url('${botSpriteURL}'); background-size: 500% 200%; background-position: ${posX}% ${posY}%;"></div>
            </div>
            <div class="text-[28px] font-black text-white uppercase mt-4 text-center tracking-wider font-overpass">${name.toUpperCase()}</div>
        </div>
    `;
}

export function openCompendiumCharacter(nameOrId) {
    showCompendium();
    setCompendiumTab('CHARACTERS');

    let char = null;
    if (typeof nameOrId === 'number' || (!isNaN(nameOrId) && typeof nameOrId === 'string' && nameOrId.trim() !== '')) {
        const idNum = parseInt(nameOrId, 10);
        char = CHARACTERS.find(c => c.id === idNum);
    }
    if (!char && typeof nameOrId === 'string') {
        const lookup = nameOrId === 'KINGSTONE' ? 'KINGSTON' : (nameOrId === 'BRIGHTSHELL' ? 'BRIGHT SHELL' : nameOrId);
        char = CHARACTERS.find(c => c.name.toUpperCase() === lookup.toUpperCase());
    }
    if (!char) char = CHARACTERS[0];

    const isUnlocked = window.UnlockManager ? window.UnlockManager.isEntityUnlocked(char) : true;
    selectGalleryItem('CHARACTERS', char.id, !isUnlocked);
    setTimeout(() => {
        selectGalleryItem('CHARACTERS', char.id, !isUnlocked);
    }, 50);
}

export function openCompendiumVisitor(nameOrId) {
    showCompendium();
    setCompendiumTab('BOTS');

    let bot = null;
    if (typeof nameOrId === 'number' || (!isNaN(nameOrId) && typeof nameOrId === 'string' && nameOrId.trim() !== '')) {
        const idNum = parseInt(nameOrId, 10);
        bot = botRoster.find(b => b.id === idNum);
    }
    if (!bot && typeof nameOrId === 'string') {
        bot = botRoster.find(b => b.name.toUpperCase() === nameOrId.toUpperCase());
    }
    if (!bot) bot = botRoster[0];

    const isUnlocked = window.UnlockManager ? window.UnlockManager.isEntityUnlocked(bot) : true;
    selectGalleryItem('BOTS', bot.id, !isUnlocked);
    setTimeout(() => {
        selectGalleryItem('BOTS', bot.id, !isUnlocked);
    }, 50);
}

/**
 * Specialized renderer for the Open Draft character selection grid.
 * @param {boolean} isDraft - Whether we are in draft mode
 * @param {number} playerId - The ID of the player currently drafting
 */
export function renderCharacterGrid(isDraft, playerId) {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const dataset = CHARACTERS;
    const spriteURL = CHARACTER_SPRITE_PRINT_URL;
    
    // Hide navigation menu and back button during draft
    const nav = document.querySelector('.compendium-nav');
    if (nav) nav.classList.add('hidden');
    const backBtn = document.getElementById('compendium-back-btn');
    if (backBtn) backBtn.classList.add('hidden');

    // Set header title to player name
    const player = state.players.find(p => p.id === playerId);
    const header = document.getElementById('gallery-header');
    if (header && player) {
        header.innerText = `${player.name.toUpperCase()} IS DRAFTING`;
        header.className = "absolute top-[60px] left-1/2 -translate-x-1/2 text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass m-0 leading-none";
    }

        // Apply layout style dynamically for drafting page
    const container = document.getElementById('gallery-grid-container');
    const detailSide = document.getElementById('gallery-detail-side');
    if (container) {
        container.style.top = 'auto';
        container.style.bottom = '64px';
        container.style.left = '260px';
        container.style.width = '2320px';
        container.style.height = '1452px';
    }
    if (grid) {
        grid.style.gridTemplateRows = 'repeat(2, 686px)';
        grid.style.gap = '80px';
    }
    if (detailSide) detailSide.style.display = 'none';

    dataset.forEach((item, index) => {
        const isUnlocked = window.UnlockManager ? window.UnlockManager.isEntityUnlocked(item) : true;
        const requiredGambit = item.unlockGambit || 0;
        const isTaken = state.openDraftTaken && state.openDraftTaken[item.id];

        const posX = (index % 5) * 25;
        const posY = Math.floor(index / 5) * 100;

        let overlayHtml = '';
        let lockClasses = '';
        let bgGrayscaleClass = '';

        if (isTaken) {
            const takerId = state.openDraftTaken[item.id].playerId;
            const takerName = state.players[takerId]?.name || "TAKEN";
            overlayHtml = `
                <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 rounded-[18px] z-20 pointer-events-none">
                    <span class="text-white font-overpass font-black tracking-widest text-center text-xl uppercase drop-shadow-md">
                        TAKEN BY<br>${takerName}
                    </span>
                </div>
            `;
            bgGrayscaleClass = 'grayscale';
        } else if (!isUnlocked) {
            overlayHtml = `
                <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/60 rounded-[18px] z-20 pointer-events-none">
                    <span class="text-white text-5xl mb-2 drop-shadow-lg">🔒</span>
                    <span class="text-white font-black text-[24px] tracking-widest text-center uppercase drop-shadow-md font-overpass leading-none">
                        ${window.GameConfig && window.GameConfig.isWeb ? 'FULL GAME' : `GAMBIT ${requiredGambit}`}
                    </span>
                </div>
            `;
            bgGrayscaleClass = 'grayscale';
        }

        // Clicking on the card selects the card during draft
        let clickHandler = '';
        if (!isTaken && isUnlocked) {
            // Web Party Edition on touch screens (no hover preview): first tap previews, second tap chooses
            const tapToPreview = usesTapToPreview(!!(window.GameConfig && window.GameConfig.isWeb), window.matchMedia ? window.matchMedia.bind(window) : null);
            clickHandler = `onclick="app.${tapToPreview ? 'tapOpenDraftCard' : 'handleOpenDraftPick'}(${item.id})"`;
        }

        const cardHtml = `
            <div id="gallery-thumb-${item.id}" ${clickHandler} class="v2-playing-card relative w-[400px] h-[686px] rounded-[18px] shrink-0 hover:scale-[1.75] hover:z-[200] z-[10] cursor-pointer overflow-visible">
                <div class="absolute inset-0 bg-no-repeat rounded-[18px] ${bgGrayscaleClass}" style="background-image: url('${spriteURL}'); background-size: 500% 200%; background-position: ${posX}% ${posY}%;"></div>
                ${overlayHtml}
            </div>
        `;
        grid.innerHTML += cardHtml;
    });
}

export function selectGalleryItem(type, itemId, isLocked) {
    const detailSide = document.getElementById('gallery-detail-side');
    if (detailSide) detailSide.style.display = 'flex';

    const container = document.getElementById('gallery-grid-container');
    if (container) {
        container.style.top = '430px';
        container.style.bottom = 'auto';
        container.style.left = '190px';
        container.style.width = '1450px';
        container.style.height = 'auto';
    }
    const grid = document.getElementById('gallery-grid');
    if (grid) {
        grid.style.gridTemplateRows = '';
        grid.style.gap = '50px';
    }

    // Clear previous highlight
    document.querySelectorAll('[id^="gallery-thumb-"]').forEach(el => {
        el.classList.remove('border-[#F3C80D]');
        el.classList.add('border-transparent');
    });
    
    // Highlight new
    const thumb = document.getElementById(`gallery-thumb-${itemId}`);
    if (thumb) {
        thumb.classList.remove('border-transparent');
        thumb.classList.add('border-[#F3C80D]');
    }

    const dataset = type === 'BOTS' ? botRoster : CHARACTERS;
    const item = dataset.find(i => i.id === itemId);
    if (!item) return;

    const spriteURL = type === 'BOTS' 
        ? new URL(/* @vite-ignore */ '../assets/visitors_sprite.webp', import.meta.url).href 
        : CHARACTER_SPRITE_PRINT_URL;
    const posIndex = type === 'BOTS' ? item.id - 1 : dataset.indexOf(item);
    
    const posX = (posIndex % 5) * 25;
    const posY = Math.floor(posIndex / 5) * 100;

    const detailImg = document.getElementById('gallery-detail-image');
    if (!detailImg) return;
    
    // ALWAYS set the image and position
    detailImg.style.backgroundImage = `url('${spriteURL}')`;
    detailImg.style.backgroundSize = "500% 200%";
    detailImg.style.backgroundPosition = `${posX}% ${posY}%`;
    detailImg.classList.add('relative');
    
    // ALWAYS show the name
    const displayName = item.name;
    document.getElementById('gallery-detail-name').innerText = displayName;

    // Reset detailImg overlays and grayscale
    detailImg.innerHTML = '';
    detailImg.classList.remove('grayscale');

    const isDemo = !window.GameConfig || !window.GameConfig.isFullGame;
    const isTaken = window.state && window.state.openDraftTaken && window.state.openDraftTaken[itemId];

    let prefixHtml = '';

    if (isLocked) {
        detailImg.classList.add('grayscale');
        let lockText = isDemo ? "FULL GAME" : `GAMBIT ${item.unlockGambit}`;
        prefixHtml = `<div class="text-[#DA795A] font-black text-[32px] uppercase tracking-widest font-overpass mb-6">🔒 LOCKED (${lockText})</div>`;
    } else if (isTaken) {
        const takerId = window.state.openDraftTaken[itemId].playerId;
        const takerName = window.state.players[takerId]?.name || "ANOTHER PLAYER";
        prefixHtml = `<div class="text-[#DA795A] font-black text-[32px] uppercase tracking-widest font-overpass mb-6">🔒 TAKEN BY ${takerName}</div>`;
        detailImg.innerHTML = `
            <div class="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-black/30 rounded-xl z-50">
                <span class="text-white font-black text-[36px] uppercase font-overpass tracking-widest text-center drop-shadow-2xl">TAKEN</span>
            </div>`;
    }

    let htmlContent = '';
    if (type === 'BOTS') {
        const intLabel = item.intelligence ? (item.intelligence.charAt(0) + item.intelligence.slice(1).toLowerCase()) : "Standard";
        const rerollCount = item.abilities?.maxRerolls || 0;
        let rerollHtml = '';
        if (rerollCount === 1) {
            rerollHtml = `<br><br><strong>RE-ROLLS:</strong> 1 Re-roll`;
        } else if (rerollCount > 1) {
            rerollHtml = `<br><br><strong>RE-ROLLS:</strong> ${rerollCount} Re-rolls`;
        }
        const loreText = item.description || item.lore || item.title || "";
        htmlContent = `${prefixHtml}<strong>INTELLIGENCE:</strong> ${intLabel}<br><br>${loreText.replace(/\\n/g, '<br>')}${rerollHtml}`;
    } else {
        const loreText = item.description || item.lore || item.title || "";
        const abilityText = item.ability || item.abilityDescription || "";
        htmlContent = `${prefixHtml}${loreText.replace(/\\n/g, '<br>')}<br><br><strong>POWER:</strong> ${abilityText.replace(/\\n/g, '<br>')}`;
    }
    
    // Only show select/draft buttons if NOT locked and NOT taken
    if (!isLocked && !isTaken) {
        if (window.app && window.app.selectingBotForSlot && type === 'BOTS') {
            htmlContent += `<button onclick="app.confirmBotSelection(${item.id})" class="mt-12 bg-[#F3C80D] hover:bg-[#C0684A] text-black font-black text-[32px] py-6 px-8 rounded-full uppercase w-full shadow-[0_0_30px_rgba(243,200,13,0.4)] transition-transform active:scale-95 font-overpass tracking-widest">SELECT VISITOR FOR SLOT ${window.app.selectingBotForSlot}</button>`;
        } else if (window.app && window.app.selectingLocalForSlot !== null && window.app.selectingLocalForSlot !== undefined && type === 'CHARACTERS') {
            htmlContent += `<button onclick="app.handleOpenDraftPick(${item.id})" class="mt-12 bg-[#F3C80D] hover:bg-[#C0684A] text-black font-black text-[32px] py-6 px-8 rounded-full uppercase w-full shadow-[0_0_30px_rgba(243,200,13,0.4)] transition-transform active:scale-95 font-overpass tracking-widest">DRAFT CHARACTER</button>`;
        }
    }
    
    document.getElementById('gallery-detail-ability').innerHTML = htmlContent;
}

export function openCharacterGallery() {
    showCompendium();
    setCompendiumTab('CHARACTERS');
}

export function openBotGallery() {
    showCompendium();
    setCompendiumTab('BOTS');
}
export function showAuctionBonusPopup(bonuses, propertyName, onComplete) {
    // bonuses should be an array of objects: { playerName: "Carina", amount: 10 }
    if (!bonuses || bonuses.length === 0) {
        if (onComplete) onComplete();
        return;
    }

    const messagesHtml = bonuses.map(b =>
        `<div class="text-white text-[36px] font-light font-overpass text-center mb-6 leading-tight">${b.playerName} receives <span class="text-[#F3C80D] font-black">${b.amount} Gold</span> bonus for ${propertyName}</div>`
    ).join('');

    if (window.app && window.app.openSideAbilityPopup) {
        window.app.openSideAbilityPopup("AUCTION BONUS", messagesHtml, "", onComplete, "DISMISS");
    } else {
        if (onComplete) onComplete();
    }
}

// --- GAMBIT OBJECTIVES PAGE SYSTEM ---

function getLuxuryCardInfo(name) {
    const norm = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const map = {
        winecellar: { index: 0, name: "Wine Cellar", cost: 5, pts: 1 },
        vintagewine: { index: 0, name: "Wine Cellar", cost: 5, pts: 1 },
        designershoes: { index: 1, name: "Designer Shoes", cost: 5, pts: 1 },
        designerhandbag: { index: 2, name: "Designer Handbag", cost: 5, pts: 1 },
        luxurywatch: { index: 3, name: "Luxury Watch", cost: 5, pts: 1 },
        goldwatch: { index: 3, name: "Luxury Watch", cost: 5, pts: 1 },
        tigerexperience: { index: 4, name: "Tiger Experience", cost: 5, pts: 1 },
        tiger: { index: 4, name: "Tiger Experience", cost: 5, pts: 1 },
        diamondrings: { index: 5, name: "Diamond Rings", cost: 10, pts: 2 },
        sailingyacht: { index: 6, name: "Sailing Yacht", cost: 10, pts: 2 },
        racingsailboat: { index: 6, name: "Sailing Yacht", cost: 10, pts: 2 },
        horse: { index: 7, name: "Horse", cost: 10, pts: 2 },
        sportscar: { index: 8, name: "Sports Car", cost: 10, pts: 2 },
        personaldrone: { index: 9, name: "Personal Drone", cost: 10, pts: 2 },
        helicopter: { index: 9, name: "Personal Drone", cost: 10, pts: 2 },
        privatejet: { index: 10, name: "Private Jet", cost: 10, pts: 2 },
        artgallery: { index: 11, name: "Art Gallery", cost: 10, pts: 2 },
        footballteam: { index: 12, name: "Football Team", cost: 15, pts: 3 },
        soccerteam: { index: 12, name: "Football Team", cost: 15, pts: 3 },
        luxuryhotel: { index: 13, name: "Luxury Hotel", cost: 15, pts: 3 },
        megamansion: { index: 13, name: "Luxury Hotel", cost: 15, pts: 3 },
        rocketship: { index: 14, name: "Rocket Ship", cost: 15, pts: 3 },
        rocket: { index: 14, name: "Rocket Ship", cost: 15, pts: 3 },
        submarine: { index: 15, name: "Submarine", cost: 15, pts: 3 },
        luxuryyacht: { index: 16, name: "Luxury Yacht", cost: 15, pts: 3 },
        superyacht: { index: 16, name: "Luxury Yacht", cost: 15, pts: 3 }
    };
    return map[norm] || { index: 0, name: name || "Luxury Item", cost: 5, pts: 1 };
}

function matchCardName(cName, targetName) {
    return getLuxuryCardInfo(cName).index === getLuxuryCardInfo(targetName).index;
}

function getLuxurySpriteOffset(i, size = 160) {
    let col = 0, row = 0;
    if (i <= 4) { col = 0; row = i; }
    else if (i <= 11) { col = 1; row = i - 5; }
    else { col = 2; row = i - 12; }
    return {
        bgX: -(col * size),
        bgY: -(row * size),
        sizeX: size * 3,
        sizeY: size * 7
    };
}

export function renderGambitObjectiveSections(gambit, humanPlayer, botPlayers = []) {
    if (!gambit || !gambit.winCondition) return '';
    const cond = gambit.winCondition;
    const params = cond.params || {};
    let sectionsHtml = '';

    // 1. LUXURY HUNT (Type C)
    if (params.luxuryCardOptions && Array.isArray(params.luxuryCardOptions) && params.luxuryCardOptions.length > 0) {
        const cardOptions = params.luxuryCardOptions;
        const isPlayerComplete = cardOptions.some(name =>
            humanPlayer && humanPlayer.inventory.some(c => c.type === 'LUXURY' && matchCardName(c.name, name))
        );
        const bothTakenByBots = !isPlayerComplete && cardOptions.every(name =>
            botPlayers.some(p => p.inventory.some(c => c.type === 'LUXURY' && matchCardName(c.name, name)))
        );

        let badge = `<span class="text-white/60 text-[20px] font-bold uppercase font-overpass tracking-wider px-4 py-1 bg-white/5 rounded-lg border border-white/10">ACQUIRE EITHER 1</span>`;
        if (isPlayerComplete) {
            badge = `<span class="text-emerald-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-emerald-500/20 rounded-lg border border-emerald-400">✓ COMPLETE</span>`;
        } else if (bothTakenByBots) {
            badge = `<span class="text-red-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-red-500/20 rounded-lg border border-red-400">OBJECTIVE UNAVAILABLE</span>`;
        }

        const cardsHtml = cardOptions.map(cardName => {
            const info = getLuxuryCardInfo(cardName);
            const pos = getLuxurySpriteOffset(info.index, 160);
            const playerOwns = humanPlayer && humanPlayer.inventory.some(c => c.type === 'LUXURY' && matchCardName(c.name, cardName));
            const botOwns = botPlayers.some(p => p.inventory.some(c => c.type === 'LUXURY' && matchCardName(c.name, cardName)));

            let borderClass = 'border-white/20';
            let filterStyle = 'filter: grayscale(60%) brightness(0.85);';
            let overlayHtml = '';
            let statusText = `<span class="text-[18px] font-light text-white/50 uppercase font-overpass mt-1">AVAILABLE</span>`;

            if (playerOwns) {
                borderClass = 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]';
                filterStyle = '';
                overlayHtml = `<div class="absolute inset-0 bg-emerald-950/70 backdrop-blur-[2px] flex flex-col items-center justify-center text-emerald-300 font-black font-overpass text-[24px] uppercase tracking-widest border-2 border-emerald-400 rounded-none shadow-inner">✓ OWNED</div>`;
                statusText = `<span class="text-[18px] font-bold text-emerald-400 uppercase font-overpass mt-1">✓ ACQUIRED</span>`;
            } else if (botOwns) {
                borderClass = 'border-red-500/60';
                filterStyle = 'filter: grayscale(100%) brightness(0.35);';
                overlayHtml = `<div class="absolute inset-0 bg-red-950/85 backdrop-blur-[2px] flex flex-col items-center justify-center text-red-300 font-black font-overpass text-[26px] uppercase tracking-widest border-2 border-red-500 rounded-none shadow-inner">TAKEN</div>`;
                statusText = `<span class="text-[18px] font-bold text-red-400 uppercase font-overpass mt-1">CLAIMED BY OPPONENT</span>`;
            }

            return `
                <div class="flex flex-col items-center p-4 rounded-2xl bg-white/5 border border-white/10 ${borderClass} w-[240px]">
                    <div class="relative w-[160px] h-[160px] rounded-none shadow-lg overflow-hidden border-2 ${borderClass}" style="background-image: url('${LUXURY_CARD_SPRITE_URL}'); background-size: ${pos.sizeX}px ${pos.sizeY}px; background-position: ${pos.bgX}px ${pos.bgY}px; ${filterStyle}">
                        ${overlayHtml}
                    </div>
                    <span class="text-[24px] font-bold text-white uppercase text-center mt-3 leading-tight font-overpass">${info.name}</span>
                    ${statusText}
                </div>
            `;
        }).join('');

        sectionsHtml += `
            <div class="w-full bg-[#26385C]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-8 bg-[#F3C80D] rounded-full"></span>
                        <h3 class="text-[30px] font-black text-white uppercase font-overpass tracking-widest drop-shadow-md">LUXURY HUNT</h3>
                    </div>
                    ${badge}
                </div>
                <div class="text-[24px] font-light text-white/90 font-overpass">Acquire either one:</div>
                <div class="flex items-center justify-center gap-12 w-full py-1">
                    ${cardsHtml}
                </div>
                ${bothTakenByBots ? `<div class="text-[22px] font-normal text-red-400 font-overpass text-center mt-2">Both required Luxury Cards were taken by opponents.</div>` : ''}
            </div>
        `;
    }

    // 2. LUXURY PORTFOLIO (Type D)
    if (params.requireLuxuryFromEachPile) {
        const has15 = humanPlayer && humanPlayer.inventory.some(c => c.type === 'LUXURY' && (c.sourcePile === 15 || c.deckPile === 15 || c.cost === 15 || c.tier === 3));
        const has10 = humanPlayer && humanPlayer.inventory.some(c => c.type === 'LUXURY' && (c.sourcePile === 10 || c.deckPile === 10 || c.cost === 10 || c.tier === 2));
        const has5 = humanPlayer && humanPlayer.inventory.some(c => c.type === 'LUXURY' && (c.sourcePile === 5 || c.deckPile === 5 || c.cost === 5 || c.tier === 1));

        const deck15Empty = !state.luxuryDecks || !state.luxuryDecks[2] || state.luxuryDecks[2].cards.length === 0;
        const deck10Empty = !state.luxuryDecks || !state.luxuryDecks[1] || state.luxuryDecks[1].cards.length === 0;
        const deck5Empty = !state.luxuryDecks || !state.luxuryDecks[0] || state.luxuryDecks[0].cards.length === 0;

        const is15Impossible = !has15 && deck15Empty;
        const is10Impossible = !has10 && deck10Empty;
        const is5Impossible = !has5 && deck5Empty;
        const isAnyImpossible = is15Impossible || is10Impossible || is5Impossible;

        const isComplete = has15 && has10 && has5;
        const count = (has15 ? 1 : 0) + (has10 ? 1 : 0) + (has5 ? 1 : 0);

        let badge = `<span class="text-white/60 text-[20px] font-bold uppercase font-overpass tracking-wider px-4 py-1 bg-white/5 rounded-lg border border-white/10">${count} / 3 PILES</span>`;
        if (isComplete) {
            badge = `<span class="text-emerald-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-emerald-500/20 rounded-lg border border-emerald-400">✓ COMPLETE</span>`;
        } else if (isAnyImpossible) {
            badge = `<span class="text-red-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-red-500/20 rounded-lg border border-red-400">OBJECTIVE UNAVAILABLE</span>`;
        }

        const renderRow = (label, has, isUnavail) => {
            if (isUnavail) {
                return `
                    <div class="flex items-center justify-between bg-red-950/20 border border-red-500/40 rounded-xl p-4 px-6">
                        <div class="flex items-center gap-4">
                            <div class="w-10 h-10 rounded-lg bg-red-500/20 border-2 border-red-400 text-red-400 flex items-center justify-center font-black text-[24px]">✕</div>
                            <div class="flex flex-col">
                                <span class="text-[26px] font-bold text-red-300 uppercase font-overpass tracking-wide">${label} — UNAVAILABLE</span>
                                <span class="text-[18px] font-light text-red-400/80 font-overpass">Pile empty</span>
                            </div>
                        </div>
                        <span class="text-[20px] font-bold uppercase font-overpass text-red-400">UNAVAILABLE</span>
                    </div>
                `;
            }
            return `
                <div class="flex items-center justify-between bg-white/5 border ${has ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-white/10'} rounded-xl p-4 px-6">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-lg ${has ? 'bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400' : 'bg-white/5 border-2 border-white/20 text-transparent'} flex items-center justify-center font-black text-[24px]">✓</div>
                        <span class="text-[26px] font-light text-white uppercase font-overpass tracking-wide">${label}</span>
                    </div>
                    <span class="text-[20px] font-bold uppercase font-overpass ${has ? 'text-emerald-400' : 'text-white/30'}">${has ? '✓ ACQUIRED' : 'PENDING'}</span>
                </div>
            `;
        };

        sectionsHtml += `
            <div class="w-full bg-[#26385C]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-8 bg-[#F3C80D] rounded-full"></span>
                        <h3 class="text-[30px] font-black text-white uppercase font-overpass tracking-widest drop-shadow-md">LUXURY PORTFOLIO</h3>
                    </div>
                    ${badge}
                </div>
                <div class="flex flex-col gap-3 w-full">
                    ${renderRow('15 Au — Top Pile', has15, is15Impossible)}
                    ${renderRow('10 Au — Middle Pile', has10, is10Impossible)}
                    ${renderRow('5 Au — Bottom Pile', has5, is5Impossible)}
                </div>
            </div>
        `;
    }

    // 3. MAP SPECIALIST (Type E)
    const mapReqs = [];
    if (params.minLagoon) {
        const cur = humanPlayer?.lagoonFlipped || 0;
        const rem = state.grid ? state.grid.filter(c => !c.empty && !c.flipped && c.type === 'LAGOON').length : 8;
        mapReqs.push({ label: 'Lagoon', req: params.minLagoon, cur, rem, isImpossible: (cur + rem < params.minLagoon), bgX: 0 });
    }
    if (params.minWaterfrontLagoon) {
        const cur = humanPlayer?.waterfrontLagoonFlipped || 0;
        const rem = state.grid ? state.grid.filter(c => !c.empty && !c.flipped && c.type === 'WF_L').length : 8;
        mapReqs.push({ label: 'Waterfront Lagoon', req: params.minWaterfrontLagoon, cur, rem, isImpossible: (cur + rem < params.minWaterfrontLagoon), bgX: -120 });
    }
    if (params.minBlock) {
        const cur = humanPlayer?.blockFlipped || 0;
        const rem = state.grid ? state.grid.filter(c => !c.empty && !c.flipped && c.type === 'BLOCK').length : 24;
        mapReqs.push({ label: 'Block', req: params.minBlock, cur, rem, isImpossible: (cur + rem < params.minBlock), bgX: -240 });
    }
    if (params.minWaterfrontAtlantic) {
        const cur = humanPlayer?.waterfrontAtlanticFlipped || 0;
        const rem = state.grid ? state.grid.filter(c => !c.empty && !c.flipped && c.type === 'WF_R').length : 8;
        mapReqs.push({ label: 'Waterfront Atlantic', req: params.minWaterfrontAtlantic, cur, rem, isImpossible: (cur + rem < params.minWaterfrontAtlantic), bgX: -120 });
    }
    if (params.minAtlantic) {
        const cur = humanPlayer?.atlanticFlipped || 0;
        const rem = state.grid ? state.grid.filter(c => !c.empty && !c.flipped && c.type === 'ATLANTIC').length : 8;
        mapReqs.push({ label: 'Atlantic', req: params.minAtlantic, cur, rem, isImpossible: (cur + rem < params.minAtlantic), bgX: -360 });
    }

    if (mapReqs.length > 0) {
        const isAllComplete = mapReqs.every(r => r.cur >= r.req);
        const hasAnyImpossible = mapReqs.some(r => r.isImpossible);

        let badge = `<span class="text-white/60 text-[20px] font-bold uppercase font-overpass tracking-wider px-4 py-1 bg-white/5 rounded-lg border border-white/10">MAP OBJECTIVE</span>`;
        if (isAllComplete) {
            badge = `<span class="text-emerald-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-emerald-500/20 rounded-lg border border-emerald-400">✓ COMPLETE</span>`;
        } else if (hasAnyImpossible) {
            badge = `<span class="text-red-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-red-500/20 rounded-lg border border-red-400">OBJECTIVE UNAVAILABLE</span>`;
        }

        let contentHtml = '';
        if (mapReqs.length === 1) {
            const item = mapReqs[0];
            const remaining = Math.max(0, item.req - item.cur);
            if (item.isImpossible) {
                contentHtml = `
                    <div class="flex items-center justify-between bg-red-950/20 border border-red-500/40 rounded-xl p-4 px-6 w-full">
                        <div class="flex items-center gap-6">
                            <div class="w-[100px] h-[100px] rounded-none border border-red-500/40 shadow-md shrink-0" style="background-image: url('${GAME_SPRITE_URL}'); background-size: 400px 100px; background-position: ${item.bgX * (100 / 120)}px 0px; filter: grayscale(80%) brightness(0.6);"></div>
                            <div class="flex flex-col">
                                <span class="text-[22px] font-bold text-red-300 uppercase font-overpass tracking-wider">${item.label.toUpperCase()}</span>
                                <span class="text-[34px] font-black text-red-400 font-overpass leading-none mt-1">OBJECTIVE UNAVAILABLE</span>
                                <span class="text-[20px] font-light text-red-400/90 font-overpass mt-1">Not enough eligible cards remain. (${item.cur}/${item.req} flipped, ${item.rem} left on board)</span>
                            </div>
                        </div>
                        <div class="text-[28px] font-black font-overpass text-red-400 drop-shadow-sm">
                            ✕ UNAVAILABLE
                        </div>
                    </div>
                `;
            } else {
                contentHtml = `
                    <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4 px-6 w-full">
                        <div class="flex items-center gap-6">
                            <div class="w-[100px] h-[100px] rounded-none border border-white/20 shadow-md shrink-0" style="background-image: url('${GAME_SPRITE_URL}'); background-size: 400px 100px; background-position: ${item.bgX * (100 / 120)}px 0px;"></div>
                            <div class="flex flex-col">
                                <span class="text-[22px] font-bold text-white/70 uppercase font-overpass tracking-wider">${item.label.toUpperCase()} CARDS LEFT TO FLIP</span>
                                <span class="text-[48px] font-black text-[#F3C80D] font-overpass leading-none mt-1 drop-shadow-md">${remaining}</span>
                                <span class="text-[20px] font-light text-white/60 font-overpass mt-1">${item.cur} / ${item.req} flipped</span>
                            </div>
                        </div>
                        <div class="text-[30px] font-black font-overpass ${remaining === 0 ? 'text-emerald-400' : 'text-[#F3C80D]'} drop-shadow-sm">
                            ${remaining === 0 ? 'OBJECTIVE COMPLETE' : `${remaining} NEEDED`}
                        </div>
                    </div>
                `;
            }
        } else {
            const boxes = mapReqs.map(item => {
                const remaining = Math.max(0, item.req - item.cur);
                const isDone = remaining === 0;
                if (item.isImpossible) {
                    return `
                        <div class="flex-1 flex items-center gap-4 bg-red-950/20 border border-red-500/40 rounded-xl p-4 px-5">
                            <div class="w-[80px] h-[80px] rounded-none border border-red-500/40 shadow-md shrink-0" style="background-image: url('${GAME_SPRITE_URL}'); background-size: 320px 80px; background-position: ${item.bgX * (80 / 120)}px 0px; filter: grayscale(80%) brightness(0.6);"></div>
                            <div class="flex flex-col">
                                <span class="text-[24px] font-bold text-red-300 uppercase font-overpass">${item.label}</span>
                                <span class="text-[26px] font-black text-red-400 font-overpass leading-tight drop-shadow-sm">☒ UNAVAILABLE</span>
                                <span class="text-[16px] font-light text-red-400/90 font-overpass">Not enough ${item.label} cards remain.</span>
                            </div>
                        </div>
                    `;
                }
                return `
                    <div class="flex-1 flex items-center gap-4 bg-white/5 border ${isDone ? 'border-emerald-500/40 bg-emerald-950/20' : 'border-white/10'} rounded-xl p-4 px-5">
                        <div class="w-[80px] h-[80px] rounded-none border border-white/20 shadow-md shrink-0" style="background-image: url('${GAME_SPRITE_URL}'); background-size: 320px 80px; background-position: ${item.bgX * (80 / 120)}px 0px;"></div>
                        <div class="flex flex-col">
                            <span class="text-[24px] font-bold text-white uppercase font-overpass">${item.label}</span>
                            <span class="text-[30px] font-black ${isDone ? 'text-emerald-400' : 'text-[#F3C80D]'} font-overpass leading-tight drop-shadow-sm">${isDone ? '✓ COMPLETE' : `${remaining} LEFT`}</span>
                            <span class="text-[18px] font-light text-white/60 font-overpass">${item.cur} / ${item.req} flipped</span>
                        </div>
                    </div>
                `;
            }).join('');
            contentHtml = `<div class="flex flex-row items-center gap-4 w-full">${boxes}</div>`;
        }

        sectionsHtml += `
            <div class="w-full bg-[#26385C]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-8 bg-[#F3C80D] rounded-full"></span>
                        <h3 class="text-[30px] font-black text-white uppercase font-overpass tracking-widest drop-shadow-md">MAP SPECIALIST</h3>
                    </div>
                    ${badge}
                </div>
                ${contentHtml}
            </div>
        `;
    }

    // 4. PRESTIGE SPRINT (Type B)
    if (params.minPrestige) {
        const curPrestige = humanPlayer ? (humanPlayer.prestige || 0) : 0;
        const target = params.minPrestige;
        const remaining = Math.max(0, target - curPrestige);
        const isComplete = curPrestige >= target;

        const badge = isComplete
            ? `<span class="text-emerald-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-emerald-500/20 rounded-lg border border-emerald-400">✓ COMPLETE</span>`
            : `<span class="text-[#F3C80D] text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-[#F3C80D]/15 rounded-lg border border-[#F3C80D]/40">${remaining} NEEDED</span>`;

        sectionsHtml += `
            <div class="w-full bg-[#26385C]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-8 bg-[#F3C80D] rounded-full"></span>
                        <h3 class="text-[30px] font-black text-white uppercase font-overpass tracking-widest drop-shadow-md">PRESTIGE SPRINT</h3>
                    </div>
                    ${badge}
                </div>
                <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4 px-6 w-full">
                    <div class="flex flex-col">
                        <span class="text-[22px] font-bold text-white/70 uppercase font-overpass tracking-wider">PRESTIGE POINTS PROGRESS</span>
                        <span class="text-[48px] font-black text-[#F3C80D] font-overpass leading-none mt-1 drop-shadow-md">${curPrestige} / ${target} Prestige</span>
                    </div>
                    <div class="text-[30px] font-black font-overpass ${isComplete ? 'text-emerald-400' : 'text-[#F3C80D]'} drop-shadow-sm">
                        ${isComplete ? 'OBJECTIVE COMPLETE' : `${remaining} NEEDED`}
                    </div>
                </div>
            </div>
        `;
    }

    // 5. LUXURY SPRINT (Type F)
    if (params.minLuxuryCards) {
        const curCount = humanPlayer ? humanPlayer.inventory.filter(c => c.type === 'LUXURY').length : 0;
        const target = params.minLuxuryCards;
        const remaining = Math.max(0, target - curCount);
        const isComplete = curCount >= target;

        const badge = isComplete
            ? `<span class="text-emerald-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-emerald-500/20 rounded-lg border border-emerald-400">✓ COMPLETE</span>`
            : `<span class="text-[#F3C80D] text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-[#F3C80D]/15 rounded-lg border border-[#F3C80D]/40">${remaining} REMAINING</span>`;

        sectionsHtml += `
            <div class="w-full bg-[#26385C]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-8 bg-[#F3C80D] rounded-full"></span>
                        <h3 class="text-[30px] font-black text-white uppercase font-overpass tracking-widest drop-shadow-md">LUXURY SPRINT</h3>
                    </div>
                    ${badge}
                </div>
                <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4 px-6 w-full">
                    <div class="flex items-center gap-6">
                        <div class="w-[100px] h-[100px] rounded-none border border-white/20 shadow-md shrink-0 bg-cover bg-center" style="background-image: url('${LUXURY_BACK_URL}');"></div>
                        <div class="flex flex-col">
                            <span class="text-[22px] font-bold text-white/70 uppercase font-overpass tracking-wider">LUXURY CARDS LEFT TO COLLECT</span>
                            <span class="text-[48px] font-black text-[#F3C80D] font-overpass leading-none mt-1 drop-shadow-md">${remaining}</span>
                            <span class="text-[20px] font-light text-white/60 font-overpass mt-1">${curCount} / ${target} collected</span>
                        </div>
                    </div>
                    <div class="text-[30px] font-black font-overpass ${isComplete ? 'text-emerald-400' : 'text-[#F3C80D]'} drop-shadow-sm">
                        ${isComplete ? 'OBJECTIVE COMPLETE' : `${remaining} NEEDED`}
                    </div>
                </div>
            </div>
        `;
    }

    // 6. WIN THE GAME (Type A / Standard END_GAME ranking)
    if (cond.evaluateAt === 'END_GAME' || params.minRank === 1) {
        sectionsHtml += renderStandardVictoryExplanation(true);
    }

    // 7. Special Objectives (Gambit 11, Gambit 23, Tutorial)
    if (params.minProperties) {
        const props = humanPlayer ? humanPlayer.inventory.filter(c => c.type === 'PROPERTY').length : 0;
        const botProps = botPlayers.reduce((acc, b) => acc + b.inventory.filter(c => c.type === 'PROPERTY').length, 0);
        const isDone = props >= params.minProperties;
        const isImpossible = (props + (2 - botProps - props) < params.minProperties);

        let badge = `<span class="text-[#F3C80D] text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-[#F3C80D]/15 rounded-lg border border-[#F3C80D]/40">${props} / ${params.minProperties} WON</span>`;
        if (isDone) {
            badge = `<span class="text-emerald-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-emerald-500/20 rounded-lg border border-emerald-400">✓ COMPLETE</span>`;
        } else if (isImpossible) {
            badge = `<span class="text-red-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-red-500/20 rounded-lg border border-red-400">OBJECTIVE UNAVAILABLE</span>`;
        }

        sectionsHtml += `
            <div class="w-full bg-[#26385C]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-8 bg-[#F3C80D] rounded-full"></span>
                        <h3 class="text-[30px] font-black text-white uppercase font-overpass tracking-widest drop-shadow-md">PROPERTY AUCTIONS</h3>
                    </div>
                    ${badge}
                </div>
                <div class="flex items-center justify-between bg-white/5 border ${isImpossible ? 'border-red-500/40 bg-red-950/20' : 'border-white/10'} rounded-xl p-4 px-6">
                    <div class="flex flex-col">
                        <span class="text-[26px] font-light text-white uppercase font-overpass">Win both Property Auctions</span>
                        ${isImpossible ? `<span class="text-[18px] font-light text-red-400 font-overpass">An opponent acquired a Property Card.</span>` : ''}
                    </div>
                    <span class="text-[26px] font-black ${isDone ? 'text-emerald-400' : (isImpossible ? 'text-red-400' : 'text-[#F3C80D]')} font-overpass drop-shadow-sm">${props} / ${params.minProperties} Won</span>
                </div>
            </div>
        `;
    } else if (params.maxProperties === 0) {
        const props = humanPlayer ? humanPlayer.inventory.filter(c => c.type === 'PROPERTY').length : 0;
        const isFailed = props > 0;
        sectionsHtml += `
            <div class="w-full bg-[#26385C]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-8 bg-[#F3C80D] rounded-full"></span>
                        <h3 class="text-[30px] font-black text-white uppercase font-overpass tracking-widest drop-shadow-md">AUCTION RESTRICTION</h3>
                    </div>
                    ${!isFailed ? `<span class="text-emerald-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-emerald-500/20 rounded-lg border border-emerald-400">ACTIVE</span>` : `<span class="text-red-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-red-500/20 rounded-lg border border-red-400">OBJECTIVE UNAVAILABLE</span>`}
                </div>
                <div class="flex items-center justify-between bg-white/5 border ${isFailed ? 'border-red-500/40 bg-red-950/20' : 'border-white/10'} rounded-xl p-4 px-6">
                    <div class="flex flex-col">
                        <span class="text-[26px] font-light text-white uppercase font-overpass">Win without acquiring any Property Cards</span>
                        ${isFailed ? `<span class="text-[18px] font-light text-red-400 font-overpass">Property Card acquired.</span>` : ''}
                    </div>
                    <span class="text-[22px] font-bold ${!isFailed ? 'text-emerald-400' : 'text-red-400'} font-overpass">${!isFailed ? '0 Properties (Valid)' : 'Failed (1 Property)'}</span>
                </div>
            </div>
        `;
    } else if (params.requireGulfStream) {
        const hasGulfStream = humanPlayer && humanPlayer.inventory.some(c => c.type === 'PROPERTY' && c.id === 1);
        const botHasGulfStream = botPlayers.some(p => p.inventory.some(c => c.type === 'PROPERTY' && c.id === 1));
        const status = hasGulfStream ? '✓ ACQUIRED' : (botHasGulfStream ? 'TAKEN BY BOT' : 'PENDING');
        const isDone = hasGulfStream;
        sectionsHtml += `
            <div class="w-full bg-[#26385C]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-8 bg-[#F3C80D] rounded-full"></span>
                        <h3 class="text-[30px] font-black text-white uppercase font-overpass tracking-widest drop-shadow-md">PROPERTY AUCTION</h3>
                    </div>
                    ${isDone ? `<span class="text-emerald-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-emerald-500/20 rounded-lg border border-emerald-400">✓ COMPLETE</span>` : (botHasGulfStream ? `<span class="text-red-400 text-[20px] font-black uppercase font-overpass tracking-wider px-4 py-1 bg-red-500/20 rounded-lg border border-red-400">OBJECTIVE UNAVAILABLE</span>` : `<span class="text-white/60 text-[20px] font-bold uppercase font-overpass tracking-wider px-4 py-1 bg-white/5 rounded-lg border border-white/10">ACTIVE</span>`)}
                </div>
                <div class="flex items-center justify-between bg-white/5 border ${botHasGulfStream ? 'border-red-500/40 bg-red-950/20' : 'border-white/10'} rounded-xl p-4 px-6">
                    <span class="text-[26px] font-light text-white uppercase font-overpass">Outbid opponent & win Gulf Stream Golf Club</span>
                    <span class="text-[22px] font-bold ${isDone ? 'text-emerald-400' : (botHasGulfStream ? 'text-red-400' : 'text-[#F3C80D]')} font-overpass">${status}</span>
                </div>
            </div>
        `;
    } else if (params.tutorialComplete) {
        sectionsHtml += `
            <div class="w-full bg-[#26385C]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
                <div class="flex items-center justify-between border-b border-white/10 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="w-3 h-8 bg-[#F3C80D] rounded-full"></span>
                        <h3 class="text-[30px] font-black text-white uppercase font-overpass tracking-widest drop-shadow-md">TUTORIAL</h3>
                    </div>
                    <span class="text-white/60 text-[20px] font-bold uppercase font-overpass tracking-wider px-4 py-1 bg-white/5 rounded-lg border border-white/10">IN PROGRESS</span>
                </div>
                <div class="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-4 px-6">
                    <span class="text-[26px] font-light text-white font-overpass">${(gambit.winCondition && gambit.winCondition.uiText) ? gambit.winCondition.uiText : "Complete the interactive tutorial steps."}</span>
                </div>
            </div>
        `;
    }

    return sectionsHtml;
}

/**
 * Shared helper rendering the standard game victory, game-end, and tiebreak explanation.
 */
export function renderStandardVictoryExplanation(isGambit = false) {
    const badgeHtml = isGambit
        ? `<span class="text-white/40 text-[20px] font-bold uppercase font-overpass tracking-wider px-3 py-1 bg-white/5 rounded-lg border border-white/10">MATCH OBJECTIVE</span>`
        : '';

    return `
        <div class="w-full bg-[#26385C]/60 backdrop-blur-md border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-xl">
            <div class="flex items-center justify-between border-b border-white/10 pb-3">
                <div class="flex items-center gap-3">
                    <span class="w-3 h-8 bg-[#F3C80D] rounded-full"></span>
                    <h3 class="text-[30px] font-black text-white uppercase font-overpass tracking-widest drop-shadow-md">WIN THE GAME</h3>
                </div>
                ${badgeHtml}
            </div>

            <!-- Primary Statement -->
            <div class="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-4 px-6">
                <div class="w-8 h-8 rounded-lg bg-white/5 border-2 border-white/20 flex items-center justify-center text-white/30 text-[20px]">○</div>
                <span class="text-[28px] font-bold text-white font-overpass uppercase tracking-wide">FINISH WITH THE MOST PRESTIGE</span>
            </div>

            <!-- Details Section -->
            <div class="flex flex-col gap-4 bg-white/5 border border-white/10 rounded-xl p-5 px-6 font-overpass">
                <!-- HOW TO WIN -->
                <div class="flex flex-col gap-1">
                    <span class="text-[22px] font-black text-white/80 uppercase tracking-wider">HOW TO WIN</span>
                    <span class="text-[28px] font-light text-white/90 leading-snug">The player with the most Prestige Points when the game ends wins.</span>
                </div>

                <!-- GAME END -->
                <div class="border-t border-white/10 pt-3 flex flex-col gap-1.5">
                    <span class="text-[22px] font-black text-white/80 uppercase tracking-wider">GAME END</span>
                    <span class="text-[28px] font-light text-white/90 leading-snug">The game ends when either:</span>
                    <ul class="space-y-1 text-[28px] font-light text-white/90 pl-1">
                        <li class="flex items-center gap-3">
                            <span class="text-[#F3C80D] font-black text-[22px] leading-none shrink-0">•</span>
                            <span>All Map Cards and Auction Cards are gone</span>
                        </li>
                        <li class="text-[20px] font-bold text-white/50 pl-6 uppercase tracking-widest leading-tight">
                            OR
                        </li>
                        <li class="flex items-center gap-3">
                            <span class="text-[#F3C80D] font-black text-[22px] leading-none shrink-0">•</span>
                            <span>All Map Cards have been flipped</span>
                        </li>
                    </ul>
                </div>

                <!-- TIEBREAKER -->
                <div class="border-t border-white/10 pt-3 flex flex-col gap-2">
                    <span class="text-[22px] font-black text-white/80 uppercase tracking-wider">TIEBREAKER</span>
                    <ol class="space-y-1.5 text-[28px] text-white/90 pl-1 font-light">
                        <li class="flex items-center gap-3">
                            <span class="w-7 h-7 rounded-full bg-white/10 text-[#F3C80D] font-black text-[18px] flex items-center justify-center border border-white/20 shrink-0">1</span>
                            <span class="font-bold uppercase tracking-wide text-white">MAR-A-LAGO</span>
                            <span class="text-[24px] text-white/70 font-light">(If tied on Prestige, owner wins)</span>
                        </li>
                        <li class="flex items-center gap-3">
                            <span class="w-7 h-7 rounded-full bg-white/10 text-[#F3C80D] font-black text-[18px] flex items-center justify-center border border-white/20 shrink-0">2</span>
                            <span class="font-bold uppercase tracking-wide text-white">MOST GOLD REMAINING</span>
                            <span class="text-[24px] text-white/70 font-light">(If no tied player owns Mar-a-Lago)</span>
                        </li>
                    </ol>
                </div>
            </div>
        </div>
    `;
}

export function showGambitObjectivesModal(isMatchStart = false) {
    state.isGambitObjectiveStart = isMatchStart;
    const modal = document.getElementById('gambit-objective-modal');
    if (!modal) return;

    const gambitId = state.activeGambitId;
    const gambit = (window.GAMBIT_CAMPAIGN || GAMBIT_CAMPAIGN).find(g => g.id === gambitId);
    const humanPlayer = (state.players || []).find(p => p.type === 'HUMAN');
    const botPlayers = (state.players || []).filter(p => p.type === 'BOT');

    const headerEl = document.getElementById('gambit-obj-header');
    const descEl = document.getElementById('gambit-obj-description');
    const sectionsEl = document.getElementById('gambit-obj-sections');
    const unwinnableBanner = document.getElementById('gambit-obj-unwinnable-banner');
    const unwinnableReason = document.getElementById('gambit-obj-unwinnable-reason');

    if (headerEl) {
        headerEl.innerText = gambitId ? `GAMBIT ${gambitId} OBJECTIVES` : `MATCH OBJECTIVES`;
    }

    if (unwinnableBanner) {
        if (state.gambitImpossible) {
            unwinnableBanner.classList.remove('hidden');
            if (unwinnableReason) {
                unwinnableReason.innerText = state.gambitImpossibleReason || "A mandatory objective can no longer be completed.";
            }
        } else {
            unwinnableBanner.classList.add('hidden');
        }
    }

    if (descEl) {
        let desc = "Complete all objectives and win the game.";
        if (gambit && gambit.winCondition) {
            const cond = gambit.winCondition;
            const p = cond.params || {};
            if (cond.evaluateAt === 'MID_GAME' && p.minPrestige) {
                desc = `Complete all objectives before an opponent reaches ${p.minPrestige} Prestige.`;
            } else if (cond.evaluateAt === 'MID_GAME' && p.minLuxuryCards) {
                desc = `Complete all objectives before an opponent collects ${p.minLuxuryCards} Luxury Cards.`;
            } else if (cond.evaluateAt === 'END_GAME' || p.minRank === 1) {
                if (p.maxProperties === 0) {
                    desc = `Complete all objectives and win the game without acquiring any Property Cards.`;
                } else {
                    desc = `Complete all objectives and win the game.`;
                }
            } else if (p.minProperties === 2) {
                desc = `Win both property auctions before an opponent claims one.`;
            } else if (cond.uiText) {
                desc = cond.uiText;
            }
        }
        descEl.innerText = desc;
    }

    if (sectionsEl && gambit) {
        sectionsEl.innerHTML = renderGambitObjectiveSections(gambit, humanPlayer, botPlayers);
    } else if (sectionsEl) {
        sectionsEl.innerHTML = renderStandardVictoryExplanation(false);
    }

    const inner = document.getElementById('gambit-objective-inner');
    const btn = document.getElementById('objective-btn');
    const currentZoom = state.zoom || 1.0;

    modal.classList.remove('hidden');

    if (inner && btn) {
        inner.style.transform = `scale(${currentZoom})`;
        const btnRect = btn.getBoundingClientRect();
        const innerRect = inner.getBoundingClientRect();

        // Calculate offset from inner center to button center
        const dx = (btnRect.left + btnRect.width / 2) - (innerRect.left + innerRect.width / 2);
        const dy = (btnRect.top + btnRect.height / 2) - (innerRect.top + innerRect.height / 2);

        // Expand animation from the OBJECTIVE button location to center
        inner.animate([
            { transform: `translate(${dx}px, ${dy}px) scale(0.04)`, opacity: 0 },
            { transform: `translate(0px, 0px) scale(${currentZoom})`, opacity: 1 }
        ], {
            duration: 380,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards'
        }).onfinish = () => {
            inner.style.transform = `scale(${currentZoom})`;
        };
    } else if (inner) {
        inner.style.transform = `scale(${currentZoom})`;
        inner.classList.add('animate-pop-in');
        inner.addEventListener('animationend', () => {
            inner.classList.remove('animate-pop-in');
        }, { once: true });
    }
}

export function closeGambitObjectivesModal() {
    const modal = document.getElementById('gambit-objective-modal');
    const inner = document.getElementById('gambit-objective-inner');
    const btn = document.getElementById('objective-btn');

    if (!modal || modal.classList.contains('hidden')) return;

    const wasStart = state.isGambitObjectiveStart;
    state.isGambitObjectiveStart = false;

    const finalizeClose = () => {
        modal.classList.add('hidden');
        if (inner) inner.style.transform = `scale(${state.zoom || 1.0})`;
        if (wasStart && window.app && typeof window.app.startTurnCycle === 'function') {
            window.app.startTurnCycle();
        }
    };

    if (inner && btn) {
        const currentZoom = state.zoom || 1.0;
        const btnRect = btn.getBoundingClientRect();
        const innerRect = inner.getBoundingClientRect();

        const dx = (btnRect.left + btnRect.width / 2) - (innerRect.left + innerRect.width / 2);
        const dy = (btnRect.top + btnRect.height / 2) - (innerRect.top + innerRect.height / 2);

        // Suck-in animation into the OBJECTIVE button
        inner.animate([
            { transform: `translate(0px, 0px) scale(${currentZoom})`, opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.04)`, opacity: 0 }
        ], {
            duration: 320,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            fill: 'forwards'
        }).onfinish = () => {
            finalizeClose();
        };
    } else {
        finalizeClose();
    }
}

export function showObjectiveImpossibleModal(reason) {
    const modal = document.getElementById('objective-impossible-modal');
    if (!modal) return;

    const reasonEl = document.getElementById('objective-impossible-reason');
    if (reasonEl) {
        reasonEl.innerText = reason || "The objective can no longer be completed.";
    }

    const inner = document.getElementById('objective-impossible-inner');
    if (inner) {
        inner.style.transform = `scale(${state.zoom || 1.0})`;
        inner.classList.add('animate-pop-in');
        inner.addEventListener('animationend', () => {
            inner.classList.remove('animate-pop-in');
        }, { once: true });
    }

    modal.classList.remove('hidden');
}

export function closeObjectiveImpossibleModal() {
    const modal = document.getElementById('objective-impossible-modal');
    if (modal) modal.classList.add('hidden');
}

export function quitFromImpossibleObjective() {
    closeObjectiveImpossibleModal();
    if (window.app && typeof window.app.handleGambitExit === 'function') {
        window.app.handleGambitExit();
    } else if (window.app && typeof window.app.confirmResign === 'function') {
        window.app.confirmResign();
    }
}

export function showGambitBrief() {
    showGambitObjectivesModal(false);
}

export function closeGambitBrief() {
    closeGambitObjectivesModal();
}

export function showCompendium() {
    const v2Container = document.getElementById('ui-v2-container');
    if (v2Container) v2Container.style.display = 'flex';
    
    // Hide the custom board game / main menu UI while compendium is open from a game
    if (state.gameStarted) {
        const v2Content = document.getElementById('ui-v2-content');
        if (v2Content) v2Content.style.display = 'none';
    }
    
    document.getElementById('compendium-modal')?.classList.remove('hidden');
    
    if (state.mode === 'OPEN_DRAFT') {
        const viewGallery = document.getElementById('view-gallery');
        if (viewGallery) {
            viewGallery.classList.remove('hidden');
            viewGallery.style.opacity = '1';
        }
    } else {
        setCompendiumTab('CHARACTERS');
    }
}

export function closeCompendium(force = false) {
    if (state && state.mode === 'OPEN_DRAFT' && !force) {
        return;
    }
    document.getElementById('compendium-modal')?.classList.add('hidden');
    
    // If we opened this FROM the game, we should hide the V2 container again on close
    if (state.gameStarted) {
        const v2Container = document.getElementById('ui-v2-container');
        if (v2Container) v2Container.style.display = 'none';
        
        // Restore content visibility for next time
        const v2Content = document.getElementById('ui-v2-content');
        if (v2Content) v2Content.style.display = '';
    }
}

export function setCompendiumMenuState(state) {
    const mainNav = document.getElementById('comp-nav-MAIN');
    const cardsNav = document.getElementById('comp-nav-SUB_CARDS');
    const extraNav = document.getElementById('comp-nav-SUB_EXTRA');

    if (mainNav) mainNav.classList.add('hidden');
    if (cardsNav) cardsNav.classList.add('hidden');
    if (extraNav) extraNav.classList.add('hidden');

    const target = document.getElementById(`comp-nav-${state}`);
    if (target) target.classList.remove('hidden');

    // Auto-switch to default tab for that menu
    if (state === 'SUB_CARDS') setCompendiumTab('LUXURY');
    else if (state === 'SUB_EXTRA') setCompendiumTab('PROFILE');
    else if (state === 'MAIN') setCompendiumTab('CHARACTERS');
}

export function setCompendiumTab(tabName) {
    console.log("[Compendium] Switching to tab:", tabName);
    
    // Update Nav Styling
    document.querySelectorAll('.compendium-nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(`comp-tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    // Handle View Switching
    const viewGallery = document.getElementById('view-gallery');
    const viewGeneric = document.getElementById('view-generic');
    const viewLuxury = document.getElementById('view-luxury');
    const viewLandmarks = document.getElementById('view-landmarks');
    const viewBlockBonus = document.getElementById('view-block-bonus');
    const viewProperty = document.getElementById('view-property');
    
    // Fade out everything
    if (viewGallery) viewGallery.style.opacity = '0';
    if (viewGeneric) viewGeneric.style.opacity = '0';
    if (viewLuxury) viewLuxury.style.opacity = '0';
    if (viewLandmarks) viewLandmarks.style.opacity = '0';
    if (viewBlockBonus) viewBlockBonus.style.opacity = '0';
    if (viewProperty) viewProperty.style.opacity = '0';

    setTimeout(() => {
        // Hide all
        if (viewGallery) viewGallery.classList.add('hidden');
        if (viewGeneric) viewGeneric.classList.add('hidden');
        if (viewLuxury) viewLuxury.classList.add('hidden');
        if (viewLandmarks) viewLandmarks.classList.add('hidden');
        if (viewBlockBonus) viewBlockBonus.classList.add('hidden');
        if (viewProperty) viewProperty.classList.add('hidden');

        if (tabName === 'CHARACTERS' || tabName === 'BOTS') {
            if (viewGallery) {
                viewGallery.classList.remove('hidden');
                renderV2Gallery(tabName === 'CHARACTERS' ? 'CHARACTERS' : 'BOTS');
                viewGallery.style.opacity = '1';
            }
        } else if (tabName === 'LUXURY') {
            if (viewLuxury) {
                viewLuxury.classList.remove('hidden');
                renderLuxuryCompendium();
                viewLuxury.style.opacity = '1';
            }
        } else if (tabName === 'LANDMARKS') {
            if (viewLandmarks) {
                viewLandmarks.classList.remove('hidden');
                renderLandmarksCompendium();
                viewLandmarks.style.opacity = '1';
            }
        } else if (tabName === 'BLOCK_BONUS') {
            if (viewBlockBonus) {
                viewBlockBonus.classList.remove('hidden');
                renderBlockBonusCompendium();
                viewBlockBonus.style.opacity = '1';
            }
        } else if (tabName === 'PROPERTY') {
            if (viewProperty) {
                viewProperty.classList.remove('hidden');
                renderPropertyCompendium();
                viewProperty.style.opacity = '1';
            }
        } else {
            if (viewGeneric) {
                viewGeneric.classList.remove('hidden');
                const titleEl = document.getElementById('comp-view-title');
                const bodyEl = document.getElementById('comp-view-body');
                if (titleEl) titleEl.innerText = tabName === 'PROFILE' ? 'MEMBER PROFILE' : tabName.replace('_', ' ');
                
                let content = "";
                if (tabName === 'PROFILE') {
                    content = getProfileHtml();
                }
                else if (tabName === 'LORE') {
                    titleEl.innerText = "THE WORLD OF BOCA RATON";
                    content = `<div class="v2-glass-plate max-w-[2000px] mx-auto min-h-[1000px] p-[80px] flex items-center justify-center">
                        <div class="text-white text-[64px] font-black uppercase font-overpass opacity-20">CONTENT COMING SOON</div>
                    </div>`;
                }
                else if (tabName === 'BOARD_GAME') {
                    titleEl.innerText = "PHYSICAL BOARD GAME";
                    content = `<div class="grid grid-cols-2 gap-16 w-[2064px] mx-auto pb-20 font-overpass text-white text-left items-start">
                        
                        <!-- COLUMN 1: 1000px wide -->
                        <div class="w-[1000px] space-y-16">
                            <!-- Banner image (1000px wide) -->
                            <img src="assets/boardg1.webp" alt="Boca Raton Board Game Overview" class="w-[1000px] h-auto object-contain rounded-3xl shadow-2xl border border-white/5">
                            
                            <!-- Intro Text -->
                            <div class="space-y-6">
                                <h2 class="text-[60px] font-black uppercase tracking-wider text-white">BOCA RATON and PALM BEACH</h2>
                                <p class="text-[40px] font-[200] leading-relaxed text-slate-100 mb-6">
                                    The digital game is an adaptation of the board game BOCA RATON that is to be released on KICKSTARTER.
                                </p>
                                <p class="text-[40px] font-[200] leading-relaxed text-slate-100">
                                    Play as a local along Florida's east coast in a tabletop strategy board game of luck, risk, and bidding. Choose from 10 characters, each with different abilities that alter your strategy. Flip map cards to collect gold and invest in luxury cards.
                                </p>
                                <p class="text-[40px] font-[200] leading-relaxed text-slate-300">
                                    The game features a double-sided board to switch between two variations:
                                </p>
                            </div>

                            <!-- Boca Raton Setup -->
                            <div class="space-y-6">
                                <h3 class="text-[60px] font-black uppercase border-b border-white/10 pb-4 text-white">THE BOCA RATON SETUP</h3>
                                <p class="text-[40px] font-[200] leading-relaxed text-slate-300">
                                    An open-strategy layout where you can flip all cards on the board. Two auctions occur during the game, testing your bidding limits. Purchase luxury cards with varying levels of risk. Collect row and column bonuses, and monitor the waterfront cards that trigger both auctions. The core rules can be learned by playing the free demo on Steam: <span class="font-bold text-white">GOLD COAST GAMBITS: Boca Raton & Palm Beach</span>.
                                </p>
                            </div>

                            <!-- Palm Beach Setup -->
                            <div class="space-y-6">
                                <h3 class="text-[60px] font-black uppercase border-b border-white/10 pb-4 text-white">THE PALM BEACH SETUP</h3>
                                <p class="text-[40px] font-[200] leading-relaxed text-slate-300">
                                    An 8-round challenge where each round culminates in 1 to 2 luxury auctions. Your choices determine who collects the most wealth. This setup focuses purely on bidding mechanics and decision-making under resource constraints.
                                </p>
                            </div>

                            <!-- Premium Components Section -->
                            <div class="space-y-6">
                                <h3 class="text-[60px] font-black uppercase border-b border-white/10 pb-4 text-white">Premium Components</h3>
                                <div class="space-y-8 text-[40px] font-[200] leading-relaxed text-slate-300">
                                    <p>
                                        <span class="font-bold text-white">100% Hand-Drawn Illustrations:</span> Beautifully crafted artwork with absolutely no AI generation.
                                    </p>
                                    <p>
                                        <span class="font-bold text-white">Solid Wood Gold Bars:</span> Custom-molded wooden tokens representing your gold currency.
                                    </p>
                                    <p>
                                        <span class="font-bold text-white">Gold-Foiled Cards:</span> Luxury cards finished with shimmering gold foil to.
                                    </p>
                                    <p>
                                        <span class="font-bold text-white">High-Density Cardboard:</span> Heavy-weight, durable cardboard components for all player boards and map tiles built to last.
                                    </p>
                                    <p>
                                        <span class="font-bold text-white">Smart Storage Organizer Box:</span> An internal organizer designed to house all 84 map and luxury cards. Simply place the insert directly on the table to cut your setup and cleanup time in half.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- COLUMN 2: 1000px wide -->
                        <div class="w-[1000px] space-y-16">
                            <!-- Kickstarter Banner -->
                            <div class="steam-only bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-12 flex flex-col items-center justify-center gap-8 w-full text-center">
                                <h2 class="text-[60px] font-black uppercase tracking-widest text-white">Support the Board Game!</h2>
                                <img src="assets/kickstarter-logo-green700.png" alt="Kickstarter Logo" class="h-20 w-auto object-contain">
                                <p class="text-[40px] font-[200] text-slate-200 leading-relaxed">
                                    Support the game and get to know when the game launches. Click below to back our campaign and notify us on launch!
                                </p>
                                <a href="https://www.kickstarter.com/projects/backhansgames/boca-raton-and-palm-beach" target="_blank" class="inline-flex items-center justify-center bg-[#24b47e] hover:bg-[#1f9c6c] text-white text-[40px] font-black uppercase tracking-widest px-12 py-6 rounded-full shadow-lg transition-transform hover:scale-105 select-none mt-4">
                                    NOTIFY ON LAUNCH
                                </a>
                            </div>

                            <!-- Remaining Photos stacked vertically -->
                            <img src="assets/boardg2.webp" alt="Boca Raton Setup Board" class="w-[1000px] h-auto object-contain rounded-3xl shadow-2xl border border-white/5">
                            <img src="assets/boardg3.webp" alt="Palm Beach Board Component" class="w-[1000px] h-auto object-contain rounded-3xl shadow-2xl border border-white/5">
                            <img src="assets/boardg4.webp" alt="Palm Beach Bidding Component" class="w-[1000px] h-auto object-contain rounded-3xl shadow-2xl border border-white/5">
                        </div>
                    </div>`;
                }
                else if (tabName === 'ABOUT') {
                    titleEl.innerText = "ABOUT US";
                    content = `<div class="w-full max-w-[2200px] mx-auto flex flex-row items-center justify-center gap-16 pb-10 font-overpass text-white">
                        <!-- Left: Image (1000px wide in 4K original scale) -->
                        <img src="assets/introduction_en.webp" alt="Backhans Games Cartoon" class="w-[1000px] h-auto object-contain rounded-3xl shadow-2xl border border-white/5">
                        
                        <!-- Right: Text container (aligned with image, about 1000px wide) -->
                        <div class="w-[1000px] text-left space-y-12">
                            <!-- Main Paragraph (simplified colors: white only) -->
                            <p class="text-[40px] font-[200] leading-relaxed text-slate-100">
                                Welcome! We are <span class="font-bold text-white">Backhans Games</span>, an independent studio from Stockholm. Established in 2024, we are working hard to launch both our physical board game and our digital title, <span class="font-bold text-white uppercase tracking-wide">GOLD COAST GAMBITS: Boca Raton & Palm Beach</span>, in 2026.
                            </p>
                            
                            <!-- Details (simplified colors: only the link stands out in yellow) -->
                            <div class="space-y-6 text-[40px] font-[200] leading-relaxed text-slate-300">
                                <p>
                                    <span class="font-bold text-white">100% human-made:</span> No AI is used in any of our artwork.
                                </p>
                                <p>
                                    🌐 Check out our upcoming projects at <a href="https://backhansgames.com" target="_blank" class="text-[#F3C80D] hover:text-[#ffd700] hover:underline font-bold transition-colors">backhansgames.com</a>
                                </p>
                            </div>
                            
                            <!-- Credits -->
                            <p class="pt-6 text-[40px] font-[200] italic text-white/40">
                                Cartoon by Tilda Backhans.
                            </p>
                        </div>
                    </div>`;
                }
                else if (tabName === 'RULES') {
                    content = `
                    <div class="max-w-[1800px] mx-auto text-left space-y-16 pb-20 text-[36px] leading-snug font-overpass">
                        <section>
                            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">OBJECTIVE</h3>
                            <p class="opacity-95">Collect the most Prestige Points. The game ends when all Map Cards are flipped (including both Property Auctions) or when all Luxury Cards are sold AND both Property Auctions are held.</p>
                        </section>

                        <section>
                            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">EARNING PRESTIGE POINTS</h3>
                            <div class="space-y-8">
                                <div class="v2-glass-plate p-10 border-l-8 border-[#F3C80D]">
                                    <p><strong>LUXURY CARDS:</strong> Worth 1 to 3 Prestige Points. You acquire these by using your turn to purchase them.</p>
                                </div>
                                <div class="v2-glass-plate p-10 border-l-8 border-[#F3C80D]">
                                    <p><strong>PROPERTY CARDS:</strong> Worth 2 to 4 Prestige Points. These can only be won during special Property Auctions.</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">HOW TO BUY A LUXURY CARD</h3>
                            <p class="mb-8">Instead of flipping a map card, you can attempt to buy the top card from one of three piles:</p>
                            <ul class="space-y-6 mb-8">
                                <li><strong>15 Au PILE: SAFE.</strong> Pay 15 Au. Automatic success.</li>
                                <li><strong>10 Au PILE: MEDIUM RISK.</strong> Pay 10 Au. Roll 3-6 to succeed.</li>
                                <li><strong>5 Au PILE: HIGH RISK.</strong> Pay 5 Au. Roll 5-6 to succeed.</li>
                            </ul>
                            <p class="text-red-400 font-bold uppercase tracking-widest">! Warning: If you fail the roll, you lose the Gold and do not get the card !</p>
                        </section>

                        <section>
                            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">PROPERTY AUCTIONS</h3>
                            <div class="space-y-8">
                                <p><strong>The Trigger:</strong> An auction begins immediately when a player flips the final Waterfront card in a designated row.</p>
                                <p><strong>The Bidding:</strong> The player who flipped the final card opens the bidding. On your turn, you must either raise by at least 1 Au, or pass.</p>
                                <p><strong>The Winner:</strong> Once you pass, you are out. The last remaining bidder pays their bid and claims the Property Card.</p>
                            </div>
                        </section>

                        <section>
                            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">MAP CARD TYPES</h3>
                            <ul class="space-y-4 list-none">
                                <li><strong>BLOCK (3 Au):</strong> Safe & Steady. Automatic success.</li>
                                <li><strong>WATERFRONT (4 Au):</strong> Auction Trigger. Automatic success.</li>
                                <li><strong>ATLANTIC (6 Au):</strong> Medium Risk. Roll 3-6 to succeed.</li>
                                <li><strong>LAGOON (8 Au):</strong> High Risk. Roll 4-6 to succeed.</li>
                            </ul>
                        </section>

                        <section>
                            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">BLOCK BONUS CARDS</h3>
                            <p class="mb-6 opacity-95">Certain BLOCK cards have hidden bonuses. Flipping a bonus card awards an extra <strong class="text-[#F3C80D]">+5 Au</strong> (for a total of <strong class="text-[#F3C80D]">8 Au</strong>).</p>
                            <p class="mb-4 opacity-95">The number of bonus cards distributed across the board columns is as follows:</p>
                            <ul class="space-y-4 list-disc pl-8 opacity-95 mb-6">
                                <li><strong>Column 3:</strong> 2 bonus cards (always)</li>
                                <li><strong>Columns 4-6:</strong> 0 to 5 bonus cards (shuffled)</li>
                                <li><strong>Column 7:</strong> 0 to 2 bonus cards (shuffled)</li>
                            </ul>
                        </section>

                        <section>
                            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">LANDMARK CARDS</h3>
                            <p class="mb-6 opacity-95">Landmarks are special locations spread across the board. Flipping a Landmark card grants a special bonus:</p>
                            <ul class="space-y-4 list-disc pl-8 opacity-95 mb-6">
                                <li><strong>+2 Au:</strong> Granted by landmarks in columns 1-7 & 9.</li>
                                <li><strong>+1 Au:</strong> Granted by landmarks in column 8.</li>
                            </ul>
                            <p class="mb-4 opacity-95">The number of Landmark cards distributed across the board columns is as follows:</p>
                            <ul class="space-y-4 list-disc pl-8 opacity-95">
                                <li><strong>Columns 1-3 & 9:</strong> 1 landmark card (always)</li>
                                <li><strong>Columns 4-7:</strong> 0 to 1 landmark card (shuffled)</li>
                                <li><strong>Column 8:</strong> 4 landmark cards (always)</li>
                            </ul>
                        </section>

                        <section>
                            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">CHARACTER ABILITIES</h3>
                            <div class="flex flex-col lg:flex-row gap-12 items-start justify-between">
                                <div class="space-y-6 flex-1 opacity-95">
                                    <p>Every character in the game possesses unique traits and capabilities (with the exception of low-intelligence/basic Visitor AIs):</p>
                                    <ul class="space-y-6 list-none pl-0">
                                        <li class="v2-glass-plate p-8 border-l-8 border-[#F3C80D]">
                                            <p class="mb-2"><strong>🔴 RE-ROLLS (LOCALS):</strong></p>
                                            <p>All Local characters can perform re-rolls. The number of available re-rolls is represented by **red dots** at the top of their character card. Re-rolls are offered automatically whenever a die roll is missed during gameplay.</p>
                                        </li>
                                        <li class="v2-glass-plate p-8 border-l-8 border-[#F3C80D]">
                                            <p class="mb-2"><strong>🟠 EXTRA TURNS (LOCALS):</strong></p>
                                            <p>Locals have the ability to take extra turn(s), indicated by **orange dots** on their character card.</p>
                                        </li>
                                        <li class="v2-glass-plate p-8 border-l-8 border-[#F3C80D]">
                                            <p class="mb-2"><strong>⚡ SPECIAL POWERS (LOCALS & VISITORS):</strong></p>
                                            <p>Characters feature unique active or passive powers. Active powers can be manually triggered during your turn to alter the state of play or grant bonuses.</p>
                                        </li>
                                    </ul>
                                    <div class="bg-yellow-400/10 border border-[#F3C80D]/30 p-8 rounded-2xl mt-6">
                                        <p class="text-[#F3C80D] font-bold">💡 HOW TO ACTIVATE & VIEW ABILITIES:</p>
                                        <p class="text-[30px] mt-2">Simply **click on the character portrait** of any Local or Visitor on the screen to view their ability details, check power status, or trigger active abilities.</p>
                                    </div>
                                </div>
                                <div class="flex flex-col items-center gap-4 shrink-0">
                                    <img src="assets/rulebook01.webp" class="w-[650px] rounded-[24px] border-4 border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all hover:scale-[1.02] duration-300" alt="Character Abilities Guide">
                                    <span class="text-[24px] text-white/55 font-mono italic text-center">Character Card showing dots and power indicator</span>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">WINNING & TIEBREAKERS</h3>
                            <p class="mb-6">The highest total Prestige score wins!</p>
                            <ul class="space-y-4 opacity-90 list-none">
                                <li>1. Player holding the Mar-a-Lago Property Card.</li>
                                <li>2. Player with the most remaining Gold (Au).</li>
                                <li>3. Victory is shared.</li>
                            </ul>
                        </section>
                    </div>`;
                }
                
                if (bodyEl) bodyEl.innerHTML = `<div class="w-full">${content}</div>`;
                viewGeneric.style.opacity = '1';
            }
        }
    }, window.getDelay(150));
}

export function renderLuxuryCompendium() {
    const grid1 = document.getElementById('luxury-grid-1');
    const grid2 = document.getElementById('luxury-grid-2');
    const grid3 = document.getElementById('luxury-grid-3');
    if (!grid1 || !grid2 || !grid3) return;

    grid1.innerHTML = '';
    grid2.innerHTML = '';
    grid3.innerHTML = '';

    // Tier 1 (Col 1 in Sprite, 5 cards)
    for (let i = 0; i < 5; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'relative w-[250px] h-[250px]';

        const card = document.createElement('div');
        card.className = 'luxury-comp-card';
        card.style.backgroundImage = `url('${LUXURY_CARD_SPRITE_URL}')`;
        card.style.backgroundPosition = `0px -${i * 250}px`;
        wrapper.appendChild(card);

        if (i === 2) {
            const label = document.createElement('div');
            label.className = 'absolute text-white font-overpass font-black text-[32px] whitespace-nowrap pointer-events-none drop-shadow-lg';
            label.style.right = '270px';
            label.style.top = '50%';
            label.style.transform = 'translateY(-50%)';
            label.innerText = "+1 reroll";
            wrapper.appendChild(label);
        } else if (i === 3) {
            const label = document.createElement('div');
            label.className = 'absolute text-white font-overpass font-black text-[32px] whitespace-nowrap pointer-events-none drop-shadow-lg';
            label.style.right = '270px';
            label.style.top = '50%';
            label.style.transform = 'translateY(-50%)';
            label.innerText = "+1 reroll";
            wrapper.appendChild(label);
        } else if (i === 4) {
            const label = document.createElement('div');
            label.className = 'absolute text-white font-overpass font-black text-[32px] whitespace-nowrap pointer-events-none drop-shadow-lg';
            label.style.right = '270px';
            label.style.top = '50%';
            label.style.transform = 'translateY(-50%)';
            label.innerText = "+2 rerolls";
            wrapper.appendChild(label);
        }

        grid1.appendChild(wrapper);
    }

    // Tier 2 (Col 2 in Sprite, 7 cards)
    for (let i = 0; i < 7; i++) {
        const card = document.createElement('div');
        card.className = 'luxury-comp-card';
        card.style.backgroundImage = `url('${LUXURY_CARD_SPRITE_URL}')`;
        card.style.backgroundPosition = `-250px -${i * 250}px`;
        grid2.appendChild(card);
    }

    // Tier 3 (Col 3 in Sprite, 5 cards)
    for (let i = 0; i < 5; i++) {
        const card = document.createElement('div');
        card.className = 'luxury-comp-card';
        card.style.backgroundImage = `url('${LUXURY_CARD_SPRITE_URL}')`;
        card.style.backgroundPosition = `-500px -${i * 250}px`;
        grid3.appendChild(card);
    }
}

export function renderBlockBonusCompendium() {
    const grid1 = document.getElementById('block-bonus-grid-1');
    const grid2 = document.getElementById('block-bonus-grid-2');
    const grid3 = document.getElementById('block-bonus-grid-3');
    if (!grid1 || !grid2 || !grid3) return;

    grid1.innerHTML = '';
    grid2.innerHTML = '';
    grid3.innerHTML = '';

    const col1Sprites = [2, 10];
    const col2Sprites = [3, 11, 19, 27, 35];
    const col3Sprites = [5, 13];

    const renderColumn = (sprites, grid) => {
        sprites.forEach(i => {
            const card = document.createElement('div');
            card.className = 'block-bonus-comp-card';
            const bgX = -(i % 8 * 250);
            const bgY = -(Math.floor(i / 8) * 250);
            card.style.backgroundPosition = `${bgX}px ${bgY}px`;
            grid.appendChild(card);
        });
    };

    renderColumn(col1Sprites, grid1);
    renderColumn(col2Sprites, grid2);
    renderColumn(col3Sprites, grid3);
}

export function updateObjectiveTracker() {
    const tracker = document.getElementById('gambit-objective-tracker');
    if (!tracker) return;

    if (!state.activeGambitId) {
        tracker.innerText = "GOAL: WIN THE MATCH";
        return;
    }

    const gambit = GAMBIT_CAMPAIGN.find(g => g.id === state.activeGambitId);
    if (gambit && gambit.winCondition && gambit.winCondition.uiText) {
        tracker.innerText = gambit.winCondition.uiText;
    } else {
        tracker.innerText = "GOAL: WIN THE MATCH";
    }
}

export function runTutorialStep() {
    if (![1, 2, 3, 4, 5].includes(state.activeGambitId)) return;

    // Ensure app namespace exists for dynamic HTML onclick hooks
    if (!window.app) window.app = {};

    window.app.showGambit1Intro = function(step) {
        const currentZoom = state.zoom || 1.0;

        if (step === 1) {
            let overlay = document.getElementById('g1-intro-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'g1-intro-overlay';
                overlay.className = "fixed inset-0 z-[2000] bg-transparent backdrop-blur-md flex items-center justify-center pointer-events-auto";
                document.body.appendChild(overlay);
            }
            overlay.innerHTML = `
                <div id="g1-intro-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-16 flex flex-col items-center w-[1400px] shrink-0 text-center animate-pop-in origin-center" style="transform: scale(${currentZoom})">
                    <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10">WELCOME TO THE GOLD COAST GAMBITS</h2>
                    <div class="flex flex-row items-center justify-center gap-16 text-left w-full px-8">
                        <div class="w-[300px] h-[514px] shrink-0 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] border-8 border-[#DA795A]" style="background-image: url('${CHARACTER_SPRITE_PRINT_URL}'); background-size: 500% 200%; background-position: 50% 100%;"></div>
                        <p class="text-[40px] font-light font-overpass text-white leading-snug">
                            In this game you play as 10 different locals from the area of Boca Raton and Palm Beach. Each local character has special abilities that you can use during the game.<br><br>
                            You start with <strong class="font-black text-[#F3C80D]">Bright Shell</strong>, the indigenous Indian who walked the pristine beaches of the barrier reef and collected shells. Her special ability is to do 6 rerolls. Use them wisely.
                        </p>
                    </div>
                    <button onclick="document.getElementById('g1-intro-overlay').remove(); window.app.showGambit1Intro(2);" class="mt-12 text-[60px] font-black text-white uppercase tracking-widest font-overpass hover:text-[#F3C80D] transition-colors drop-shadow-md cursor-pointer">NEXT</button>
                </div>
            `;
            const inner = document.getElementById('g1-intro-inner');
            if (inner) {
                inner.addEventListener('animationend', () => {
                    inner.classList.remove('animate-pop-in');
                }, { once: true });
            }
        } else if (step === 2) {
            // Remove full-screen overlay if it exists
            const overlay = document.getElementById('g1-intro-overlay');
            if (overlay) overlay.remove();

            let step2Overlay = document.getElementById('g1-step2-overlay');
            if (!step2Overlay) {
                step2Overlay = document.createElement('div');
                step2Overlay.id = 'g1-step2-overlay';
                step2Overlay.className = "absolute left-[310px] top-[100px] w-[800px] z-[50] pointer-events-auto flex flex-col items-center";
                const leftSidebar = document.querySelector('.left-sidebar-zone');
                if (leftSidebar) {
                    leftSidebar.appendChild(step2Overlay);
                } else {
                    document.body.appendChild(step2Overlay);
                }
            }

            step2Overlay.innerHTML = `
                <div id="g1-step2-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                    <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-8">THE GOAL</h2>
                    <p class="text-[40px] font-light font-overpass text-white leading-snug mb-6 text-center">
                        In a standard game, the player with the most Prestige Points at the end wins.
                    </p>
                    <div class="w-full border-t border-white/10 my-6"></div>
                    <p class="text-[40px] font-light font-overpass text-white leading-snug text-left px-4">
                        <span class="font-black text-[#F3C80D] uppercase tracking-wider">YOUR MISSION:</span><br>
                        You have <strong class="font-bold text-[#F3C80D]">200 Au</strong>. Buy Luxury Cards across all three tiers (5, 10, and 15 Au) to see how spending more gold increases your chances of a high-value card.<br><br>
                        Reach <strong class="font-bold text-[#F3C80D]">12 Prestige Points</strong> to advance to Gambit 2!
                    </p>
                </div>
            `;

            const inner = document.getElementById('g1-step2-inner');
            if (inner) {
                inner.addEventListener('animationend', () => {
                    inner.classList.remove('animate-pop-in');
                }, { once: true });
            }

            // Apply gold frame and pulse to Luxury Decks immediately
            [0, 1, 2].forEach(i => {
                const deck = document.getElementById(`deck-${i}`);
                if (deck) deck.classList.add('tutorial-highlight');
            });
            
            // Dim the game board
            const board = document.getElementById('game-board');
            if (board) {
                board.classList.add('opacity-30', 'pointer-events-none', 'grayscale');
            }

            // Update tutorialStep to prevent this step from triggering again
            state.tutorialStep = 4;
        }
    };

    window.app.showGambit2Intro = function() {
        let overlay = document.getElementById('g2-intro-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'g2-intro-overlay';
            overlay.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }

        overlay.innerHTML = `
            <div id="g2-intro-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">LESSON 2: GETTING MONEY</h2>
                <p class="text-[40px] font-light font-overpass text-white leading-snug mb-12 px-2">
                    Now we learn about how to get that precious gold, Au, by flipping map cards. There are 4 map card types that you will learn.
                </p>
                <button onclick="document.getElementById('g2-intro-overlay').remove(); window.app.finishGambit2Intro();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">CONTINUE</button>
            </div>
        `;

        const inner = document.getElementById('g2-intro-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
    };

    window.app.finishGambit2Intro = function() {
        state.gambit2IntroShown = true;
        runTutorialStep();
    };

    // --- NEW GAMBIT 1: THE HOOK ---
    if (state.activeGambitId === 1) {
        if (state.tutorialStep === 1) {
            state.tutorialStep = 2; // Pause execution for Modal
            window.app.showGambit1Intro(1);
        }
        return;
    }

    // --- GAMBIT 3: PROPERTY AUCTIONS ---
    if (state.activeGambitId === 3) {
        if (!window.app.advanceG3Step1) {
            // Helper to spawn/update the right sidebar step popup
            window.app.updateG3StepPopup = function(title, subtitle, bodyHtml, buttonText, onButtonClick) {
                let popup = document.getElementById('g3-step-popup');
                if (!popup) {
                    popup = document.createElement('div');
                    popup.id = 'g3-step-popup';
                    // Placed on the right side of the board
                    popup.className = "absolute left-[-270px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
                    const rightSidebar = document.querySelector('.right-sidebar-zone');
                    if (rightSidebar) {
                        rightSidebar.appendChild(popup);
                    } else {
                        document.body.appendChild(popup);
                    }
                }

                window.app.onG3PopupClick = onButtonClick;

                const subheaderHtml = subtitle 
                    ? `<h3 class="text-[40px] font-black text-[#88C9CC] uppercase tracking-wider mb-6 font-overpass leading-tight">${subtitle}</h3>`
                    : '';

                popup.innerHTML = `
                    <div id="g3-step-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                        <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-6 leading-tight">${title}</h2>
                        ${subheaderHtml}
                        <p class="text-[40px] font-light font-overpass text-white leading-snug px-2 text-left">
                            ${bodyHtml}
                        </p>
                        <button onclick="window.app.onG3PopupClick();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">${buttonText}</button>
                    </div>
                `;

                const inner = popup.querySelector('#g3-step-inner');
                if (inner) {
                    inner.addEventListener('animationend', () => {
                        inner.classList.remove('animate-pop-in');
                    }, { once: true });
                }
            };

            window.app.advanceG3Step1 = function() {
                // Play flip sound
                audioMgr.play('flip');
                // Programmatically flip left Waterfront column (c === 1)
                state.grid.forEach(cell => {
                    if (cell.c === 1 && !cell.flipped) {
                        cell.flipped = true;
                        updateCardVisuals(cell);
                    }
                });
                // Programmatically flip top auction card (Auction A)
                state.auctions.A.flipped = true;
                setupAuctionVisuals('A', state.auctions.A.card, false);

                state.tutorialStep = 2;
                runTutorialStep();
            };

            window.app.advanceG3Step2 = function() {
                // Play flip sound
                audioMgr.play('flip');
                // Programmatically flip right Waterfront column (c === 7)
                state.grid.forEach(cell => {
                    if (cell.c === 7 && !cell.flipped) {
                        cell.flipped = true;
                        updateCardVisuals(cell);
                    }
                });
                // Programmatically flip bottom auction card (Auction B)
                state.auctions.B.flipped = true;
                setupAuctionVisuals('B', state.auctions.B.card, false);

                state.tutorialStep = 3;
                runTutorialStep();
            };

            window.app.advanceG3Step3 = function() {
                // Remove the step popup
                document.getElementById('g3-step-popup')?.remove();
                state.tutorialStep = 4;
                // Start the auction
                window.triggerAuction('A');
            };
        }

        // Hide global toast if visible
        const globalToast = document.getElementById('tutorial-toast');
        if (globalToast) globalToast.classList.add('hidden');

        if (state.tutorialStep === 1) {
            window.app.updateG3StepPopup(
                "PROPERTY AUCTIONS",
                "",
                "In this tutorial, you will learn how to trigger an auction and place your bids.<br><br>There are two auctions in the game. You can start either of them by flipping a full column of Waterfront cards.<br><br>Click Continue to see how to start the top auction.",
                "CONTINUE",
                window.app.advanceG3Step1
            );
        } else if (state.tutorialStep === 2) {
            window.app.updateG3StepPopup(
                "TRIGGERING AUCTIONS",
                "",
                "Flipping the left column of Waterfront cards starts the top auction.<br><br>Consequently, flipping the right column of cards starts the bottom auction.<br><br>Click Continue to look at the bottom auction.",
                "CONTINUE",
                window.app.advanceG3Step2
            );
        } else if (state.tutorialStep === 3) {
            window.app.updateG3StepPopup(
                "WIN THE AUCTION",
                "",
                "Now, let's try to win an auction.<br><br>Your objective is to outbid your opponent and win the Gulf Stream Golf Club property card.",
                "CONTINUE",
                window.app.advanceG3Step3
            );
        }
        return;
    }

    // --- GAMBIT 4: SPECIAL ABILITIES (LEJA / RED REEF) ---
    if (state.activeGambitId === 4) {
        if (!window.app.showG4Popup1) {
            window.app.showG4Popup1 = function() {
                const currentZoom = state.zoom || 1.0;
                let overlay = document.getElementById('g4-popup-overlay');
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'g4-popup-overlay';
                    overlay.className = "fixed inset-0 z-[2000] bg-transparent flex items-center justify-center pointer-events-none";
                    document.body.appendChild(overlay);
                }
                overlay.innerHTML = `
                    <div id="g4-popup-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-16 flex flex-col items-center w-[1400px] shrink-0 text-center animate-pop-in origin-center pointer-events-auto" style="transform: scale(${currentZoom})">
                        <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">LESSON 4: SPECIAL ABILITIES</h2>
                        <div class="flex flex-row items-center justify-center gap-16 text-left w-full px-8">
                            <div class="w-[300px] h-[514px] shrink-0 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] border-8 border-[#DA795A]" style="background-image: url('${CHARACTER_SPRITE_PRINT_URL}'); background-size: 500% 200%; background-position: 0% 0%;"></div>
                            <p class="text-[40px] font-light font-overpass text-white leading-snug">
                                Every Local and Visitor has unique advantages. When it is your turn, your character card will glow and display <strong class="font-black text-[#F3C80D]">COMMANDS READY</strong>.<br><br>
                                Click your character portrait on the left to open your Command Menu.
                            </p>
                        </div>
                    </div>
                `;
                const inner = document.getElementById('g4-popup-inner');
                if (inner) {
                    inner.addEventListener('animationend', () => {
                        inner.classList.remove('animate-pop-in');
                    }, { once: true });
                }
            };

            window.app.showG4Popup2 = function() {
                const currentZoom = state.zoom || 1.0;
                let overlay = document.getElementById('g4-popup-overlay');
                if (overlay) overlay.remove();

                overlay = document.createElement('div');
                overlay.id = 'g4-popup-overlay';
                overlay.className = "fixed inset-0 z-[2000] bg-transparent flex items-center justify-center pointer-events-none";
                document.body.appendChild(overlay);

                overlay.innerHTML = `
                    <div id="g4-popup-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-[1200px] shrink-0 text-center animate-pop-in origin-center pointer-events-auto" style="transform: scale(${currentZoom})">
                        <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-6 leading-tight">THE COMMAND MENU</h2>
                        <p class="text-[40px] font-light font-overpass text-white leading-snug px-2 text-left w-full">
                            You have three tactical options:<br><br>
                            <span class="font-black text-[#F3C80D]">POWER:</span> Activate your character's unique special ability.<br><br>
                            <span class="font-black text-[#F3C80D]">REROLL:</span> Automatically offered when you fail a dice roll.<br><br>
                            <span class="font-black text-[#F3C80D]">EXTRA TURN:</span> Spend a charge to take back-to-back actions.<br><br>
                            Select <span class="font-black text-[#F3C80D]">POWER</span> and click <span class="font-black text-[#F3C80D]">ACTIVATE</span>. Because you are playing as Leja, this will sweep the current top Luxury Cards to the bottom of the deck, revealing new options. Try it now to finish the Gambit!
                        </p>
                    </div>
                `;
                const inner = document.getElementById('g4-popup-inner');
                if (inner) {
                    inner.addEventListener('animationend', () => {
                        inner.classList.remove('animate-pop-in');
                    }, { once: true });
                }
            };

            window.app.showG4Popup3 = function() {
                const currentZoom = state.zoom || 1.0;
                let overlay = document.getElementById('g4-popup-overlay');
                if (overlay) overlay.remove();

                overlay = document.createElement('div');
                overlay.id = 'g4-popup-overlay';
                overlay.className = "fixed inset-0 z-[2000] bg-transparent flex items-center justify-center pointer-events-auto";
                document.body.appendChild(overlay);

                overlay.innerHTML = `
                    <div id="g4-popup-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-16 flex flex-col items-center w-[1400px] shrink-0 text-center animate-pop-in origin-center pointer-events-auto" style="transform: scale(${currentZoom})">
                        <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">EXCELLENT COMMAND</h2>
                        <p class="text-[40px] font-light font-overpass text-white leading-snug px-6 mb-12 text-center">
                            Great! You now know how to access your special abilities. If you are ever unsure about a Local or Visitor's power, you can always check the <span class="font-black text-[#F3C80D]">? COMPENDIUM</span> at the top right of the screen.<br><br>
                            Now, let's test what you have learned in a real game.
                        </p>
                        <button onclick="window.app.finishG4Gambit();" class="mt-4 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">FINISH GAMBIT</button>
                    </div>
                `;
                const inner = document.getElementById('g4-popup-inner');
                if (inner) {
                    inner.addEventListener('animationend', () => {
                        inner.classList.remove('animate-pop-in');
                    }, { once: true });
                }
            };

            window.app.advanceG4Step3 = function() {
                document.getElementById('g4-popup-overlay')?.remove();
                state.tutorialStep = 3;
                setTimeout(() => {
                    window.app.showG4Popup3();
                }, 800);
            };

            window.app.finishG4Gambit = function() {
                document.getElementById('g4-popup-overlay')?.remove();
                state.tutorialStep = 15;
                const human = state.players.find(p => p.type === 'HUMAN');
                if (human) {
                    state.forcedWinnerId = human.id;
                }
                window.app.triggerGameOver("GAMBIT OBJECTIVE COMPLETE");
            };
        }

        const globalToast = document.getElementById('tutorial-toast');
        if (globalToast) globalToast.classList.add('hidden');

        if (state.tutorialStep === 1) {
            window.app.showG4Popup1();
        }
        return;
    }

    // --- OLD GAMBIT 1 -> NEW GAMBIT 2: MAP CLICKING ---
    if (state.activeGambitId !== 2 || state.tutorialStep > 14) return;

    if (!state.gambit2IntroShown) {
        window.app.showGambit2Intro();
        return;
    }

    const arrow = document.getElementById('tutorial-arrow');
    if (!arrow) return;

    // Helper to spawn/update the left sidebar step popup
    function updateG2StepPopup(title, subtitle, bodyHtml, showContinue = false) {
        let popup = document.getElementById('g2-step-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'g2-step-popup';
            popup.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(popup);
            } else {
                document.body.appendChild(popup);
            }
        }

        const subheaderHtml = subtitle 
            ? `<h3 class="text-[40px] font-black text-[#88C9CC] uppercase tracking-wider mb-6 font-overpass leading-tight">${subtitle}</h3>`
            : '';

        const continueBtnHtml = showContinue 
            ? `<button id="g2-step-continue-btn" onclick="document.getElementById('g2-step-popup').remove(); document.getElementById('tutorial-continue-btn')?.remove(); window.state.tutorialStep = 6; window.app.runTutorialStep();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">CONTINUE</button>`
            : '';

        popup.innerHTML = `
            <div id="g2-step-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-6 leading-tight">${title}</h2>
                ${subheaderHtml}
                <p class="text-[40px] font-light font-overpass text-white leading-snug px-2 text-left">
                    ${bodyHtml}
                </p>
                ${continueBtnHtml}
            </div>
        `;

        const inner = popup.querySelector('#g2-step-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
    }

    // Hide global toast for Gambit 2 to avoid duplicates
    const globalToast = document.getElementById('tutorial-toast');
    if (globalToast) globalToast.classList.add('hidden');

    // Define helper to reset Gambit 2 map cards face-down, optionally keeping a practice row
    window.app.resetGambit2MapCards = function(keepRowIndex = null) {
        state.grid.forEach(cell => {
            if (!cell.empty && cell.flipped) {
                if (keepRowIndex !== null && cell.r === keepRowIndex) {
                    return;
                }
                unflipCardVisuals(cell);
            }
        });
    };

    // Define reveal functions in window.app
    window.app.revealAllBonusCards = function() {
        audioMgr.play('flip');
        state.grid.forEach(cell => {
            if (cell.c >= 2 && cell.c <= 6 && cell.isBonus && !cell.flipped) {
                cell.flipped = true;
                updateCardVisuals(cell);
            }
        });
        document.getElementById('g2-bonus-overlay')?.remove();
        state.tutorialStep = 7;
        window.app.runTutorialStep();
    };

    window.app.revealAllLandmarkCards = function() {
        audioMgr.play('flip');
        state.grid.forEach(cell => {
            if (!cell.empty) {
                const spriteRow = Math.floor(cell.spriteIndex / 8);
                const spriteCol = cell.spriteIndex % 8;
                const isLandmark = landmarkData.some(l => l.row === spriteRow && l.col === spriteCol);
                if (isLandmark && !cell.flipped) {
                    cell.flipped = true;
                    updateCardVisuals(cell);
                }
            }
        });

        document.getElementById('g2-landmark-overlay')?.remove();
        state.tutorialStep = 8;
        window.app.runTutorialStep();
    };

    window.app.finishGambit2Compendium = function() {
        // Restore map for Step 10: keep only guided row index 4, close all other showcase cards
        window.app.resetGambit2MapCards(4);

        document.getElementById('g2-compendium-overlay')?.remove();
        document.getElementById('g2-step-popup')?.remove();
        state.tutorialStep = 10;
        runTutorialStep();
    };

    window.app.handleStep10Continue = executeGambit2Step10Continue;

    window.app.handleStep11Continue = function() {
        document.getElementById('g2-row-bonuses-overlay')?.remove();

        const rowIndices = [0, 3, 4, 7];
        const player = state.players.find(p => p.type === 'HUMAN') || state.players[0];

        function showNextRowBonus(index) {
            if (index >= rowIndices.length) {
                window.app.resetGambit2MapCards(null);
                state.tutorialStep = 12;
                runTutorialStep();
                return;
            }

            const r = rowIndices[index];
            const rowCells = state.grid.filter(cell => cell.r === r && !cell.empty);

            audioMgr.play('flip');
            rowCells.forEach(cell => {
                if (!cell.flipped) {
                    cell.flipped = true;
                    updateCardVisuals(cell);
                }
            });

            triggerWaveAnimation(rowCells, player, 'ROW', () => {
                const nextDelay = (typeof window !== 'undefined' && window.getDelay) ? window.getDelay(200) : 200;
                setTimeout(() => {
                    showNextRowBonus(index + 1);
                }, nextDelay);
            });
        }

        showNextRowBonus(0);
    };

    window.app.handleStep12Continue = function() {
        document.getElementById('g2-col-bonuses-overlay')?.remove();

        // Close all flipped cards before demonstration
        window.app.resetGambit2MapCards(null);

        const colIndices = [0, 1, 2, 7, 8];
        const player = state.players.find(p => p.type === 'HUMAN') || state.players[0];

        function showNextColBonus(index) {
            if (index >= colIndices.length) {
                state.tutorialStep = 13;
                runTutorialStep();
                return;
            }

            const c = colIndices[index];
            const colCells = state.grid.filter(cell => cell.c === c && !cell.empty);

            audioMgr.play('flip');
            colCells.forEach(cell => {
                if (!cell.flipped) {
                    cell.flipped = true;
                    updateCardVisuals(cell);
                }
            });

            triggerWaveAnimation(colCells, player, 'COLUMN', () => {
                const nextDelay = (typeof window !== 'undefined' && window.getDelay) ? window.getDelay(200) : 200;
                setTimeout(() => {
                    showNextColBonus(index + 1);
                }, nextDelay);
            });
        }

        showNextColBonus(0);
    };

    window.app.showFullMapExample = function() {
        audioMgr.play('flip');
        state.grid.forEach(cell => {
            if (!cell.empty && !cell.flipped) {
                cell.flipped = true;
                updateCardVisuals(cell);
            }
        });

        if (state.auctions.A.card) setupAuctionVisuals('A', state.auctions.A.card, false);
        if (state.auctions.B.card) setupAuctionVisuals('B', state.auctions.B.card, false);

        document.getElementById('g2-dynamic-maps-overlay')?.remove();
        state.tutorialStep = 14;
        runTutorialStep();
    };

    window.app.endGambit2Tutorial = function() {
        state.tutorialStep = 15;
        const human = state.players.find(p => p.type === 'HUMAN');
        if (human) {
            state.forcedWinnerId = human.id;
        }
        window.app.triggerGameOver("GAMBIT OBJECTIVE COMPLETE");
    };

    if (state.tutorialStep === 6) {
        arrow.classList.add('hidden');
        document.getElementById('g2-step-popup')?.remove();

        let overlay = document.getElementById('g2-bonus-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'g2-bonus-overlay';
            overlay.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }

        overlay.innerHTML = `
            <div id="g2-bonus-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">FINDING THE BONUS CARDS</h2>
                <p class="text-[40px] font-light font-overpass text-white leading-snug mb-12 px-2 text-center">
                    Let's see where the bonus cards are hiding. Each card awards +5 Au.
                </p>
                <button id="g2-bonus-btn" onclick="window.app.revealAllBonusCards();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">CLICK TO REVEAL</button>
            </div>
        `;

        const inner = document.getElementById('g2-bonus-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
        return;
    }

    if (state.tutorialStep === 7) {
        arrow.classList.add('hidden');
        document.getElementById('g2-bonus-overlay')?.remove();

        let overlay = document.getElementById('g2-landmark-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'g2-landmark-overlay';
            overlay.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }

        overlay.innerHTML = `
            <div id="g2-landmark-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">LANDMARK CARDS</h2>
                <p class="text-[40px] font-light font-overpass text-white leading-snug mb-12 px-2 text-center">
                    But there are also Landmark cards that award either +2 Au or +1 Au. These cards also give you some lore about these special places.
                </p>
                <button id="g2-landmark-btn" onclick="window.app.revealAllLandmarkCards();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">CLICK TO REVEAL</button>
            </div>
        `;

        const inner = document.getElementById('g2-landmark-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
        return;
    }

    if (state.tutorialStep === 8) {
        arrow.classList.add('hidden');
        document.getElementById('g2-landmark-overlay')?.remove();

        let overlay = document.getElementById('g2-landmark-click-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'g2-landmark-click-overlay';
            overlay.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }

        overlay.innerHTML = `
            <div id="g2-landmark-click-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">LANDMARKS</h2>
                <p class="text-[40px] font-light font-overpass text-white leading-snug mb-12 px-2 text-center">
                    Click on a Landmark card to see if it awards +2 Au or +1 Au, and to learn more about the landmark.
                </p>
                <button onclick="window.app.dismissLandmarkDossier(); document.getElementById('g2-landmark-click-overlay')?.remove(); window.state.tutorialStep = 9; window.app.runTutorialStep();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">CONTINUE</button>
            </div>
        `;

        const inner = document.getElementById('g2-landmark-click-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
        return;
    }

    if (state.tutorialStep === 9) {
        arrow.classList.add('hidden');
        document.getElementById('g2-landmark-click-overlay')?.remove();
        document.getElementById('g2-compendium-overlay')?.remove();

        let overlay = document.getElementById('g2-compendium-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'g2-compendium-overlay';
            overlay.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }

        overlay.innerHTML = `
            <div id="g2-compendium-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">? COMPENDIUM</h2>
                <p class="text-[40px] font-light font-overpass text-white leading-snug mb-12 px-2 text-center">
                    In the Compendium, you can find all Block Bonus and Landmark cards. Now, let's wrap this up by learning how to earn Row and Column Bonuses.
                </p>
                <button onclick="window.app.finishGambit2Compendium();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">CONTINUE</button>
            </div>
        `;

        const inner = document.getElementById('g2-compendium-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
        return;
    }

    if (state.tutorialStep === 10) {
        arrow.classList.add('hidden');
        document.getElementById('g2-compendium-overlay')?.remove();

        let overlay = document.getElementById('g2-row-bonus-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'g2-row-bonus-overlay';
            overlay.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }

        overlay.innerHTML = `
            <div id="g2-row-bonus-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">ROW BONUS</h2>
                <p class="text-[40px] font-light font-overpass text-white leading-snug mb-12 px-2 text-center">
                    Now, complete the row to earn a +5 ROW BONUS.
                </p>
                <button onclick="window.app.handleStep10Continue();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">COMPLETE FOR ME</button>
            </div>
        `;

        const inner = document.getElementById('g2-row-bonus-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
        return;
    }

    if (state.tutorialStep === 11) {
        arrow.classList.add('hidden');
        document.getElementById('g2-row-bonus-overlay')?.remove();

        // Reset map before rendering Step 11 overlay so all cards are face-down
        window.app.resetGambit2MapCards?.(null);

        let overlay = document.getElementById('g2-row-bonuses-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'g2-row-bonuses-overlay';
            overlay.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }

        overlay.innerHTML = `
            <div id="g2-row-bonuses-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">ROW BONUSES</h2>
                <p class="text-[40px] font-light font-overpass text-white leading-snug mb-12 px-2 text-center">
                    There are 4 possible ROW BONUSES.
                </p>
                <button onclick="window.app.handleStep11Continue();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">CONTINUE</button>
            </div>
        `;

        const inner = document.getElementById('g2-row-bonuses-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
        return;
    }

    if (state.tutorialStep === 12) {
        arrow.classList.add('hidden');
        document.getElementById('g2-row-bonuses-overlay')?.remove();

        // Reset map before rendering Step 12 overlay so all cards are face-down
        window.app.resetGambit2MapCards?.(null);

        let overlay = document.getElementById('g2-col-bonuses-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'g2-col-bonuses-overlay';
            overlay.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }

        overlay.innerHTML = `
            <div id="g2-col-bonuses-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">COLUMN BONUSES</h2>
                <p class="text-[40px] font-light font-overpass text-white leading-snug mb-12 px-2 text-center">
                    There are 5 possible COLUMN BONUSES.
                </p>
                <button onclick="window.app.handleStep12Continue();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">CONTINUE</button>
            </div>
        `;

        const inner = document.getElementById('g2-col-bonuses-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
        return;
    }

    if (state.tutorialStep === 13) {
        arrow.classList.add('hidden');
        document.getElementById('g2-col-bonuses-overlay')?.remove();

        let overlay = document.getElementById('g2-dynamic-maps-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'g2-dynamic-maps-overlay';
            overlay.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }

        overlay.innerHTML = `
            <div id="g2-dynamic-maps-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">DYNAMIC MAPS</h2>
                <p class="text-[40px] font-light font-overpass text-white leading-snug mb-12 px-2 text-center">
                    Every time you play a game, the cards are shuffled and a new, unique map is created. The map is inspired by the barrier reef off Florida's coast. Continue to see one example of the map.
                </p>
                <button onclick="window.app.showFullMapExample();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">CONTINUE</button>
            </div>
        `;

        const inner = document.getElementById('g2-dynamic-maps-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
        return;
    }

    if (state.tutorialStep === 14) {
        arrow.classList.add('hidden');
        document.getElementById('g2-dynamic-maps-overlay')?.remove();

        let overlay = document.getElementById('g2-end-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'g2-end-overlay';
            overlay.className = "absolute left-[50px] top-[750px] w-[650px] z-[50] pointer-events-auto flex flex-col items-center";
            const leftSidebar = document.querySelector('.left-sidebar-zone');
            if (leftSidebar) {
                leftSidebar.appendChild(overlay);
            } else {
                document.body.appendChild(overlay);
            }
        }

        overlay.innerHTML = `
            <div id="g2-end-inner" class="bg-[#26385C]/50 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl p-10 flex flex-col items-center w-full shrink-0 text-center animate-pop-in origin-center">
                <h2 class="text-[60px] font-black text-white uppercase tracking-widest drop-shadow-md font-overpass mb-10 leading-tight">END OF GAMBIT 2</h2>
                <p class="text-[40px] font-light font-overpass text-white leading-snug mb-12 px-2 text-center">
                    This is the end of GAMBIT 2. Now there is one more thing to master before we can play: the property auction. Continue to GAMBIT 3 to learn all about it.
                </p>
                <button onclick="window.app.endGambit2Tutorial();" class="mt-10 px-16 py-4 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-black text-[60px] rounded-3xl uppercase tracking-widest shadow-lg transition-all hover:scale-105 active:scale-95 font-overpass cursor-pointer drop-shadow-md">END GAMBIT 2</button>
            </div>
        `;

        const inner = document.getElementById('g2-end-inner');
        if (inner) {
            inner.addEventListener('animationend', () => {
                inner.classList.remove('animate-pop-in');
            }, { once: true });
        }
        return;
    }

    arrow.classList.remove('hidden');
    document.getElementById('toast-dismiss-btn')?.classList.add('hidden');

    let targetR = 4;
    let targetC = 0;
    let title = "";
    let subtitle = "";
    let msg = "";

    if (state.tutorialStep === 1) {
        targetC = 2;
        title = "BLOCK";
        subtitle = "SAFE & STEADY";
        msg = `• No die roll needed.<br><br>• Reward: Flip the card and gain 3 Au.<br><br>• Bonus Check: Some BLOCK cards are Bonus Cards (marked with a distinct gold design). If you flip a Bonus Card, gain an extra 5 Au.`;
    } else if (state.tutorialStep === 2) {
        targetC = 1;
        title = "WATERFRONT ZONE";
        subtitle = "AUCTION TRIGGER";
        msg = `• No die roll needed.<br><br>• Reward: Flip the card and gain 4 Au.<br><br>• If a full line of WATERFRONT cards is flipped, a Property Auction is triggered. You will learn more about this in GAMBIT 4.`;
    } else if (state.tutorialStep === 3) {
        targetC = 8;
        title = "ATLANTIC ZONE";
        subtitle = "MEDIUM RISK, MEDIUM REWARD";
        msg = `• Roll 3–6 to succeed.<br><br>• Success: Flip the card and gain 6 Au.<br><br>• Failure (Roll 1-2): You get nothing, and the card remains face down.`;
    } else if (state.tutorialStep === 4) {
        targetC = 0;
        title = "LAGOON ZONE";
        subtitle = "HIGH RISK, BIG REWARD";
        msg = `• Roll 4–6 to succeed.<br><br>• Success: Flip the card and gain 8 Au.<br><br>• Failure (Roll 1-3): You get nothing, and the card remains face down.`;
    } else if (state.tutorialStep === 5) {
        targetC = 3;
        title = "BLOCK BONUS CARDS";
        subtitle = "";
        msg = `There are Block Bonus cards that award an extra +5 Au when flipped. Click on the highlighted card—if you are lucky, it's a Bonus Card!`;
    }

    // Position the Arrow
    const targetCellEl = document.getElementById(`cell-container-r${targetR}c${targetC}`);
    if (targetCellEl) {
        arrow.style.left = `${targetCellEl.offsetLeft + 75}px`;
        arrow.style.top = `${targetCellEl.offsetTop}px`;

        // Clear any previous highlights
        document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
        // Add pulse to current target
        targetCellEl.classList.add('tutorial-highlight');
    }

    // Render the Step Popup inside left sidebar
    updateG2StepPopup(title, subtitle, msg, false);
}

export function showLandmarkDossier(landmark, cellData, isBot = false, playerName = "", onComplete = null) {
    // 1. Invalidate previous instance and cancel any previous Landmark timer
    window.landmarkInstanceToken = (window.landmarkInstanceToken || 0) + 1;
    const currentToken = window.landmarkInstanceToken;

    if (window.landmarkAutoCloseTimer) {
        clearTimeout(window.landmarkAutoCloseTimer);
        window.landmarkAutoCloseTimer = null;
    }
    const existingOverlay = document.getElementById('landmark-dossier-overlay');
    if (existingOverlay) existingOverlay.remove();
    const existingCatcher = document.getElementById('landmark-click-catcher');
    if (existingCatcher) existingCatcher.remove();

    const rightPanel = document.querySelector('.right-sidebar-zone');
    if (!rightPanel) {
        if (onComplete) onComplete();
        return;
    }

    const headerHTML = isBot 
        ? `<div class="v2-text-header text-[40px] text-white text-center mb-4 leading-tight">${playerName} discovered a Landmark!</div>`
        : ``;

    const btnHTML = `<button id="btn-dismiss-landmark" class="btn-v2-glossy w-[300px] h-[90px] mt-auto mb-[20px] text-white v2-text-secondary text-[36px] pointer-events-auto" onclick="app.dismissLandmarkDossier()">CLOSE</button>`;

    const spriteRow = Math.floor(cellData.spriteIndex / 8);
    const spriteCol = cellData.spriteIndex % 8;
    const bgPosX = spriteCol * 400;
    const bgPosY = spriteRow * 400;

    const overlay = document.createElement('div');
    overlay.id = 'landmark-dossier-overlay';
    overlay.className = 'absolute top-[160px] left-0 w-[430px] z-[600] flex flex-col pointer-events-none';

    overlay.innerHTML = `
        <div class="bg-[#26385C]/50 backdrop-blur-md rounded-xl border border-white/20 flex flex-col items-center w-[430px] h-[1625px] p-[15px] pointer-events-auto shadow-2xl animate-pop-in">
            ${isBot ? headerHTML : ''}
            <div class="w-[400px] h-[400px] shrink-0 mb-6 rounded shadow-xl border-4 border-slate-700 bg-white" style="background-image: url('${CARD_SPRITE_URL}'); background-size: 3200px 3200px; background-position: -${bgPosX}px -${bgPosY}px; background-repeat: no-repeat;"></div>
            <div class="v2-text-header text-[#F3C80D] text-[40px] text-center mb-2 leading-tight">${landmark.bonusType === "PLUS_ONE_AU" ? "+1 Au BONUS!" : landmark.bonusType === "PLUS_TWO_AU" ? "+2 Au BONUS!" : "EXTRA TURN"}</div>
            <div class="v2-text-header text-white text-[40px] text-center mb-4 leading-tight">LANDMARK</div>
            <div class="v2-text-secondary text-[36px] text-white text-center leading-tight">${landmark.name}</div>
            <div class="v2-text-secondary text-[36px] text-[#88C9CC] text-center mt-4 leading-tight">Location: ${landmark.location}</div>
            <div class="v2-text-secondary text-[36px] text-white text-center mt-4 leading-snug px-2">Description:<br>${landmark.description}</div>
            ${btnHTML}
        </div>
    `;
    
    rightPanel.appendChild(overlay);

    const catcher = document.createElement('div');
    catcher.id = 'landmark-click-catcher';
    catcher.className = 'fixed inset-0 z-[500] cursor-pointer';
    catcher.onclick = () => window.app.dismissLandmarkDossier();
    document.body.appendChild(catcher);

    window.landmarkOnComplete = onComplete;

    // 2. Set auto-close timer if manual close is disabled
    if (!state.settings?.landmarkManualClose) {
        const autoCloseMs = window.getLandmarkInfoDuration ? window.getLandmarkInfoDuration() : 2000;
        window.landmarkAutoCloseTimer = setTimeout(() => {
            if (window.landmarkInstanceToken === currentToken) {
                window.landmarkAutoCloseTimer = null;
                dismissLandmarkDossier(currentToken);
            }
        }, autoCloseMs);
    }
}

export function dismissLandmarkDossier(token = null) {
    if (token !== null && token !== window.landmarkInstanceToken) {
        return;
    }
    window.landmarkInstanceToken = (window.landmarkInstanceToken || 0) + 1;

    // Cancel pending auto-close timer
    if (window.landmarkAutoCloseTimer) {
        clearTimeout(window.landmarkAutoCloseTimer);
        window.landmarkAutoCloseTimer = null;
    }

    const overlay = document.getElementById('landmark-dossier-overlay');
    if (overlay) overlay.remove();

    const catcher = document.getElementById('landmark-click-catcher');
    if (catcher) {
        catcher.remove();
    }

    if (window.landmarkOnComplete) {
        const cb = window.landmarkOnComplete;
        window.landmarkOnComplete = null;
        cb();
    }
}

export function showResignModal() {
    const modal = document.getElementById('resign-modal');
    if (modal) {
        const inner = document.getElementById('resign-inner');
        if (inner) inner.style.transform = `scale(${state.zoom || 1.0})`;
        modal.classList.remove('hidden');
    }
}

export function closeResignModal() {
    const modal = document.getElementById('resign-modal');
    if (modal) modal.classList.add('hidden');
}

export function showAbout() {
    const modal = document.getElementById('about-modal');
    if (modal) {
        const inner = document.getElementById('about-inner');
        if (inner) inner.style.transform = `scale(${state.zoom || 1.0})`;
        modal.classList.remove('hidden');
    }
}

export function closeAbout() {
    document.getElementById('about-modal')?.classList.add('hidden');
}
export function renderLandmarksCompendium() {
    console.log("[Compendium] Rendering Landmarks using gameBoardColumn...");

    // 1. Clear all columns
    const colIds = ['1', '2', '3', '4-6', '7', '8', '9'];
    colIds.forEach(id => {
        const col = document.getElementById(`landmark-col-${id}`);
        if (col) col.innerHTML = '';
    });

    let firstLandmark = null;

    // 2. Distribute landmarkData items by gameBoardColumn
    landmarkData.forEach(landmark => {
        if (!firstLandmark) firstLandmark = landmark;

        // Map gameBoardColumn to the correct colId
        let targetId = '';
        switch(landmark.gameBoardColumn) {
            case "0": targetId = '1'; break;
            case "1": targetId = '2'; break;
            case "2": targetId = '3'; break;
            case "3-5": targetId = '4-6'; break;
            case "6": targetId = '7'; break;
            case "7": targetId = '8'; break;
            case "8": targetId = '9'; break;
        }

        const container = document.getElementById(`landmark-col-${targetId}`);
        if (container) {
            const card = document.createElement('div');
            card.className = 'landmark-comp-card';
            card.dataset.name = landmark.name;
            
            // Sprite Math
            const x = landmark.col * 250;
            const y = landmark.row * 250;
            card.style.backgroundPosition = `-${x}px -${y}px`;

            card.onclick = () => {
                document.querySelectorAll('.landmark-comp-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                updateLandmarkDetail(landmark);
            };

            container.appendChild(card);
        }
    });

    // 3. Select first landmark
    if (firstLandmark) {
        const firstCard = document.querySelector(`.landmark-comp-card[data-name="${CSS.escape(firstLandmark.name)}"]`);
        if (firstCard) firstCard.classList.add('active');
        updateLandmarkDetail(firstLandmark);
    }
}

function updateLandmarkDetail(landmark) {
    const nameEl = document.getElementById('landmark-detail-name');
    const placeEl = document.getElementById('landmark-detail-place');
    const descEl = document.getElementById('landmark-detail-desc');

    if (nameEl) nameEl.innerText = landmark.name;
    if (placeEl) placeEl.innerText = `Place: ${landmark.location}`;
    if (descEl) {
        const reward = landmark.bonusType === "PLUS_ONE_AU" ? "+1 Au" : landmark.bonusType === "PLUS_TWO_AU" ? "+2 Au" : "Extra Turn";
        descEl.innerHTML = `Description: ${landmark.description}<br><br><span class="text-[#F3C80D] font-bold">Effect: ${reward}</span>`;
    }
}

const propertyCompData = [
    {
        id: 0,
        name: "Mar-a-Lago",
        points: 4,
        spriteX: -500,
        mapY: 0,
        description: propertyLore.find(p => p.id === 0).description
    },
    {
        id: 1,
        name: "Gulf Stream",
        points: 3,
        spriteX: -250,
        mapY: -500,
        description: propertyLore.find(p => p.id === 1).description
    },
    {
        id: 2,
        name: "Spanish River",
        points: 2,
        spriteX: 0,
        mapY: -1000,
        description: propertyLore.find(p => p.id === 2).description
    }
];

export function renderPropertyCompendium() {
    console.log("[Compendium] Rendering Property Cards...");
    
    // Set thumb backgrounds
    propertyCompData.forEach(p => {
        const thumb = document.getElementById(`prop-thumb-${p.id}`);
        if (thumb) {
            thumb.style.backgroundImage = `url('${PROPERTY_SPRITE_URL}')`;
            thumb.style.backgroundSize = "750px 250px";
            thumb.style.backgroundPosition = `${p.spriteX}px 0`;
        }
    });

    // Select first (Spanish River - II)
    selectPropertyItem(2);
}

export function selectPropertyItem(id) {
    // Highlight
    document.querySelectorAll('[id^="prop-thumb-"]').forEach(el => el.classList.remove('active'));
    const activeThumb = document.getElementById(`prop-thumb-${id}`);
    if (activeThumb) activeThumb.classList.add('active');

    const data = propertyCompData.find(p => p.id === id);
    if (!data) return;

    // Update Big Auction Card
    const bigCard = document.getElementById('property-auction-card');
    if (bigCard) {
        bigCard.style.backgroundImage = `url('${AUCTION_CARD_SPRITE_URL}')`;
        bigCard.style.backgroundPosition = `0px ${data.mapY}px`;
    }

    // Update Description
    const descEl = document.getElementById('property-detail-desc');
    if (descEl) {
        // Use innerHTML and replace \n with <br><br> for proper spacing
        descEl.innerHTML = data.description.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
    }
}
