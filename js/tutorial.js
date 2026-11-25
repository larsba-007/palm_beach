


import { initGame } from './game.js';
import { state } from './state.js';
import { updateUI, getCharacterCardStyle, initPlayerCards } from './ui.js';
import { CHARACTERS, CHARACTER_SPRITE_PRINT_URL } from './data.js';

export const TUTORIAL_STEPS = [
    {
        id: 'INTRO',
        text: "<h2 class='text-[#DA795A] text-2xl font-black mb-4 uppercase tracking-widest'>GETTING STARTED</h2>Each player draws 2 cards and picks 1 to play with.<br><br><strong>Variations:</strong><br>• <strong>Random:</strong> Deal 1 card to everyone.<br>• <strong>Action:</strong> Click on <span class='tut-text-highlight'>LEJA</span> to select her for this tutorial.",
        type: 'INTERACTIVE',
        getHighlights: () => []
    },
    {
        id: 'LAGOON',
        text: "<h2 class='text-[#DA795A] text-2xl font-black mb-4 uppercase tracking-widest'>THE LAGOON</h2>High Risk, Big Reward. Roll <span class='tut-text-highlight'>4-6</span> on a die to win <span class='tut-text-highlight'>8 Au</span>.<br><br><strong>Character Abilities:</strong><br>Bright Shell can Re-roll dice here.<br><br><span class='tut-text-rule'>BOARD GAME RULE:</span><br><span class='tut-text-rule'>Declare your target first. If you roll 1-3, you miss and the turn passes.</span>",
        getHighlights: () => {
            const els = [];
            for (let i = 0; i < 8; i++) {
                const cell = document.getElementById(`cell-container-r${i}c0`);
                if (cell) els.push(cell);
            }
            return els;
        }
    },
    {
        id: 'ATLANTIC',
        text: "<h2 class='text-[#DA795A] text-2xl font-black mb-4 uppercase tracking-widest'>THE ATLANTIC</h2>Medium Risk. Roll <span class='tut-text-highlight'>3-6</span> on a die to win <span class='tut-text-highlight'>6 Au</span>.<br><br><strong>Character Abilities:</strong><br>Bright Shell can Re-roll dice here.<br><br><span class='tut-text-rule'>BOARD GAME RULE:</span><br><span class='tut-text-rule'>Declare the card you intend to flip, then roll. If you roll 1-2, you miss and the card remains unflipped.</span>",
        getHighlights: () => {
            const els = [];
            for (let i = 0; i < 8; i++) {
                const cell = document.getElementById(`cell-container-r${i}c8`);
                if (cell) els.push(cell);
            }
            return els;
        }
    },
    {
        id: 'BLOCK',
        text: "<h2 class='text-[#DA795A] text-2xl font-black mb-4 uppercase tracking-widest'>BLOCK</h2>Safe Zones. Automatic success. Win <span class='tut-text-highlight'>3 Au</span>.<br>Watch out for hidden <span class='tut-text-highlight animate-pulse'>BONUS CARDS</span> that instantly award <span class='tut-text-highlight'>5 Au</span>!<br><br><span class='tut-text-rule'>BOARD GAME RULE:</span><br><span class='tut-text-rule'>Simply flip the card. No rolling required.</span>",
        getHighlights: () => {
            const els = [];
            for (let r = 0; r < 8; r++) {
                for (let c = 2; c <= 6; c++) {
                    const el = document.getElementById(`cell-container-r${r}c${c}`);
                    if (el) els.push(el);
                }
            }
            return els;
        }
    },
    {
        id: 'WATERFRONT',
        text: "<h2 class='text-[#DA795A] text-2xl font-black mb-4 uppercase tracking-widest'>WATERFRONT</h2>Safe Income (<span class='tut-text-highlight'>4 Au</span>).<br><span class='tut-text-highlight'>WARNING:</span> Flipping the <em>last</em> card in a Waterfront column triggers an <span class='tut-text-highlight'>AUCTION</span> for a Property Card! Waterfront Lagoon triggers the top auction and Waterfront Atlantic the bottom auction.<br><br><strong>Properties:</strong> Spanish River (2 pts), Gulf Stream (3 pts), Mar-a-Lago (4 pts).<br><br><strong>Character Abilities:</strong><br>Kingstone earns +1 Au here. Eric can flip up to 3 Waterfront Cards in one turn. If one of those flips triggers an Auction, his power ends and any remaining flips are lost.",
        getHighlights: () => {
            const els = [];
            for (let r = 0; r < 8; r++) {
                const el1 = document.getElementById(`cell-container-r${r}c1`);
                const el2 = document.getElementById(`cell-container-r${r}c7`);
                if (el1) els.push(el1);
                if (el2) els.push(el2);
            }
            return els;
        }
    },
    {
        id: 'PRACTICE',
        text: "<h2 class='text-[#DA795A] text-2xl font-black mb-4 uppercase tracking-widest'>TRY IT NOW!</h2>Click any map card to earn your first Gold.",
        type: 'INTERACTIVE',
        getHighlights: () => []
    },
    {
        id: 'LUXURY',
        text: "<h2 class='text-[#DA795A] text-2xl font-black mb-4 uppercase tracking-widest'>SPEND YOUR GOLD</h2>Buy Luxury Cards to gain <span class='tut-text-highlight'>Prestige Points (Stars)</span>.<br><br>• <strong>5 Au Deck:</strong> High Risk (Roll 5-6)<br>• <strong>10 Au Deck:</strong> Medium Risk (Roll 3-6)<br>• <strong>15 Au Deck:</strong> Guaranteed Success<br><br><span class='tut-text-rule'>BOARD GAME RULE:</span><br><span class='tut-text-rule'>If you fail the roll, you lose the gold and get nothing.</span>",
        type: 'INTERACTIVE',
        getHighlights: () => {
            return [
                document.getElementById('deck-0'),
                document.getElementById('deck-1'),
                document.getElementById('deck-2')
            ].filter(e => e);
        }
    },
    {
        id: 'PATTERNS',
        text: "<h2 class='text-[#DA795A] text-2xl font-black mb-4 uppercase tracking-widest'>ROW AND COLUMN BONUS</h2>If you flip every card in a <span class='tut-text-highlight'>Row</span> or <span class='tut-text-highlight'>Column</span>, you get a <span class='tut-text-highlight'>+5 Gold Bonus</span>.<br><br><strong>Character Abilities:</strong><br>Addizon earns <span class='tut-text-highlight'>9 Au</span> (instead of 5) for pattern bonuses.",
        getHighlights: () => {
            const els = [];
            for (let c = 0; c < 9; c++) {
                const el = document.getElementById(`cell-container-r3c${c}`);
                if (el) els.push(el);
            }
            for (let r = 0; r < 8; r++) {
                const el = document.getElementById(`cell-container-r${r}c1`);
                if (el) els.push(el);
            }
            return els;
        }
    },
    {
        id: 'CHEAT_SHEET',
        text: "<h2 class='text-[#DA795A] text-2xl font-black mb-4 uppercase tracking-widest'>QUICK REFERENCE</h2>Click the red <span class='text-red-500'>CHEAT SHEET</span> button anytime to see a summary of card values.<br><br><span class='tut-text-rule'>BOARD GAME RULE:</span><br><span class='tut-text-rule'>Keep the reference card handy to check card values, setup rules, and bonuses.</span>",
        getHighlights: () => {
            const btn = document.querySelector('button[onclick="app.toggleCheatSheet()"]');
            return btn ? [btn] : [];
        }
    },
    {
        id: 'VICTORY',
        text: "<h2 class='text-[#DA795A] text-2xl font-black mb-4 uppercase tracking-widest'>HOW TO WIN</h2>The game ends when all Map Cards are flipped (including both Property Auctions) OR when all Luxury Cards are sold AND both Property Auctions are held.<br><br>The player with the most <span class='tut-text-highlight'>Prestige Points</span> wins.<br><strong>Tie Breaker:</strong><br>1. Owner of Mar-a-Lago<br>2. Most Gold.",
        getHighlights: () => [],
        isFinal: true
    }
];

export const TutorialManager = {
    stepIndex: 0,
    isActive: false,

    start: () => {
        TutorialManager.isActive = true;
        TutorialManager.stepIndex = 0;
        window.app.selectTutorialCharacter = TutorialManager.selectTutorialCharacter;

        state.mode = 'TUTORIAL';
        state.config.humans = 1;
        state.players = [{
            id: 0, name: "LOCAL", type: 'HUMAN',
            gold: 0, totalGold: 0, prestige: 0, prestigePoints: 0, cards: 0, inventory: [], lastBid: 0,
            character: null, counters: 0, status: 'Picking Character',
            rollSum: 0, rollCount: 0,
            rerolls: 2, extraTurns: 1
        }];

        document.getElementById('ui-v2-container').style.display = 'none';
        document.getElementById('game-ui').classList.remove('opacity-0', 'pointer-events-none');

        // Show the panel
        document.getElementById('tutorial-panel').classList.remove('hidden');

        initGame();

        setTimeout(() => {
            TutorialManager.showStep(0);
        }, 500);
    },

    showStep: (index) => {
        const step = TUTORIAL_STEPS[index];
        if (!step) return;
        state.tutorialStep = step.id;

        document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));

        const introCards = document.getElementById('tutorial-intro-cards');
        if (introCards) introCards.remove();

        const textEl = document.getElementById('tutorial-text');
        const nextBtn = document.getElementById('tutorial-next-btn');
        const finishBtn = document.getElementById('tutorial-finish-btn');

        if (textEl) textEl.innerHTML = step.text;

        if (step.id === 'INTRO') {
            nextBtn?.classList.add('hidden');
            TutorialManager.renderIntroCards();
        } else if (step.id === 'LUXURY') {
            const p = state.players[0];
            if (p && p.gold < 50) {
                p.gold = 50;
                updateUI();
            }
            nextBtn?.classList.add('hidden');
        } else if (step.id === 'PRACTICE') {
            nextBtn?.classList.add('hidden');
            state.grid.forEach(c => {
                if (!c.flipped && !c.empty) {
                    const el = document.getElementById(`cell-container-${c.id}`);
                    if (el) el.classList.add('tutorial-highlight');
                }
            });
        } else if (step.isFinal) {
            nextBtn?.classList.add('hidden');
            finishBtn?.classList.remove('hidden');
        } else {
            nextBtn?.classList.remove('hidden');
            finishBtn?.classList.add('hidden');
        }

        if (step.getHighlights && step.id !== 'PRACTICE') {
            const elements = step.getHighlights();
            elements.forEach(el => {
                if (el) el.classList.add('tutorial-highlight');
            });
        }
    },

    renderIntroCards: () => {
        const box = document.getElementById('tutorial-panel');
        if (!box) return;
        const container = document.createElement('div');
        container.id = 'tutorial-intro-cards';
        container.className = 'flex gap-2 justify-center mt-4';

        const leja = CHARACTERS.find(c => c.name === 'LEJA') || CHARACTERS[0];
        const flagler = CHARACTERS.find(c => c.name === 'MR. FLAGLER') || CHARACTERS[3];

        const lejaId = leja.id;
        const lejaX = (lejaId % 5) * 25;
        const lejaY = Math.floor(lejaId / 5) * 75;

        const flaglerId = flagler.id;
        const flaglerX = (flaglerId % 5) * 25;
        const flaglerY = Math.floor(flaglerId / 5) * 75;

        container.innerHTML = `
             <div onclick="app.selectTutorialCharacter()" class="relative w-[100px] h-[114px] rounded-lg border-2 border-yellow-400 bg-slate-900 cursor-pointer hover:scale-105 hover:shadow-[0_0_20px_#facc15] transition-all overflow-hidden group">
                 <div class="absolute inset-0 bg-no-repeat" style="background-image: url('${CHARACTER_SPRITE_PRINT_URL}'); background-size: 500% 300%; background-position: ${lejaX}% ${lejaY}%;"></div>
                 <div class="absolute bottom-0 w-full bg-black/80 text-white font-black text-[10px] text-center py-1 font-overpass">SELECT LEJA</div>
             </div>
             <div class="relative w-[100px] h-[114px] rounded-lg border-2 border-slate-600 bg-slate-900 opacity-50 grayscale overflow-hidden">
                 <div class="absolute inset-0 bg-no-repeat" style="background-image: url('${CHARACTER_SPRITE_PRINT_URL}'); background-size: 500% 300%; background-position: ${flaglerX}% ${flaglerY}%;"></div>
                 <div class="absolute bottom-0 w-full bg-black/80 text-white font-black text-[10px] text-center py-1 font-overpass">MR. FLAGLER</div>
             </div>
        `;
        // Insert after text
        const textEl = document.getElementById('tutorial-text');
        textEl.parentNode.insertBefore(container, textEl.nextSibling);
    },

    selectTutorialCharacter: () => {
        const p = state.players[0];
        if (p) {
            p.character = CHARACTERS.find(c => c.name === 'LEJA') || CHARACTERS[0];
            p.counters = p.character.startPowers;
            p.rerolls = p.character.startRerolls;
            p.extraTurns = p.character.startExtraTurns;
            p.status = 'Ready';
        }
        initPlayerCards();
        updateUI();
        TutorialManager.next();
    },

    next: () => {
        TutorialManager.stepIndex++;
        if (TutorialManager.stepIndex < TUTORIAL_STEPS.length) {
            TutorialManager.showStep(TutorialManager.stepIndex);
        } else {
            TutorialManager.end();
        }
    },

    handleInteractionSuccess: () => {
        if (state.tutorialStep === 'PRACTICE' || state.tutorialStep === 'LUXURY') {
            setTimeout(() => {
                TutorialManager.next();
            }, 1500);
        }
    },

    end: () => {
        if (window.app && window.app.exitToTitle) {
            // Exit without confirmation warning
            window.app.exitToTitle(true);
        } else {
            window.location.reload(true);
        }
    }
};