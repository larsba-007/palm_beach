
import { state } from './state.js';

export function getProfileHtml() {
    const stats = state.stats || {};
    const winRate = stats.totalGamesPlayed > 0 ? Math.round((stats.totalWins / stats.totalGamesPlayed) * 100) : 0;
    
    let charStatsHtml = '';
    if (stats.characterStats) {
        Object.entries(stats.characterStats).forEach(([name, data]) => {
            const rate = (data.wins + data.losses) > 0 ? Math.round((data.wins / (data.wins + data.losses)) * 100) : 0;
            charStatsHtml += `
                <div class="flex justify-between items-center v2-glass-plate p-10 border-l-8 border-[#88C9CC]">
                    <span class="text-white font-black uppercase text-[48px]">${name}</span>
                    <span class="text-[#88C9CC] font-black text-[48px]">${data.wins}W / ${data.losses}L (${rate}%)</span>
                </div>
            `;
        });
    }

    return `
    <div class="max-w-[1800px] mx-auto text-left space-y-16 pb-20 text-[36px] leading-snug font-overpass">
        <section>
            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">GLOBAL PERFORMANCE</h3>
            <div class="grid grid-cols-4 gap-12">
                <div class="v2-glass-plate p-12 flex flex-col items-center">
                    <div class="text-white/50 text-[24px] uppercase font-bold tracking-widest mb-2">Total Games</div>
                    <div class="text-white text-[80px] font-black leading-none">${stats.totalGamesPlayed || 0}</div>
                </div>
                <div class="v2-glass-plate p-12 flex flex-col items-center">
                    <div class="text-white/50 text-[24px] uppercase font-bold tracking-widest mb-2">Victories</div>
                    <div class="text-[#F3C80D] text-[80px] font-black leading-none">${stats.totalWins || 0}</div>
                </div>
                <div class="v2-glass-plate p-12 flex flex-col items-center">
                    <div class="text-white/50 text-[24px] uppercase font-bold tracking-widest mb-2">Win Rate</div>
                    <div class="text-white text-[80px] font-black leading-none">${winRate}%</div>
                </div>
                <div class="v2-glass-plate p-12 flex flex-col items-center">
                    <div class="text-white/50 text-[24px] uppercase font-bold tracking-widest mb-2">High Score</div>
                    <div class="text-[#F3C80D] text-[80px] font-black leading-none">${stats.highestPrestigeScore || 0} <span class="text-[30px]">VP</span></div>
                </div>
            </div>
        </section>

        <section>
            <h3 class="text-[60px] text-[#F3C80D] font-black mb-6">ECONOMY & PROGRESSION</h3>
            <div class="grid grid-cols-3 gap-12">
                <div class="v2-glass-plate p-12 flex flex-col items-center">
                    <div class="text-white/50 text-[24px] uppercase font-bold tracking-widest mb-2">Total Gold</div>
                    <div class="text-[#F3C80D] text-[80px] font-black leading-none">${stats.totalAuEarned || 0} <span class="text-[40px]">Au</span></div>
                </div>
                <div class="v2-glass-plate p-12 flex flex-col items-center">
                    <div class="text-white/50 text-[24px] uppercase font-bold tracking-widest mb-2">Gambits Done</div>
                    <div class="text-[#88C9CC] text-[80px] font-black leading-none">${state.playerProfile?.clearedGambits?.length || 0} <span class="text-[40px]">/ 50</span></div>
                </div>
                <div class="v2-glass-plate p-12 flex flex-col items-center">
                    <div class="text-white/50 text-[24px] uppercase font-bold tracking-widest mb-2">Achievements</div>
                    <div class="text-[#F3C80D] text-[80px] font-black leading-none">${stats.unlockedAchievements?.length || 0}</div>
                </div>
            </div>
        </section>

        <section>
            <h3 class="text-[60px] text-[#F3C80D] font-black mb-10">CHARACTER MASTERY</h3>
            <div class="flex flex-col gap-8">
                ${charStatsHtml || '<div class="text-white/30 italic text-[40px]">No character data yet. Begin your career to see performance stats.</div>'}
            </div>
        </section>
    </div>
    `;
}
