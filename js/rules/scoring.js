// Palm Beach rules: final scoring and the tiebreaker (rulebook p15).

/** Prestige Points of one player: Luxury Cards plus the Property Card. */
export function prestigeOf(player) {
    const luxury = player.luxuryCards.reduce((sum, c) => sum + c.points, 0);
    return luxury + (player.property ? player.property.points : 0);
}

/**
 * - The player with the most Prestige Points wins.
 * - Tie: the tied player holding the Property Card wins.
 * - If no tied player has it: the tied player with the most gold left wins.
 * - Still tied: those players share the victory.
 * @returns {{scores: object[], winners: number[], decidedBy: 'POINTS'|'PROPERTY'|'GOLD'|'SHARED'}}
 */
export function finalScoring(game) {
    const scores = game.players.map(p => ({
        playerId: p.id,
        name: p.name,
        characterId: p.characterId,
        prestige: prestigeOf(p),
        luxuryPoints: p.luxuryCards.reduce((sum, c) => sum + c.points, 0),
        propertyPoints: p.property ? p.property.points : 0,
        hasProperty: !!p.property,
        gold: p.gold
    }));

    const top = Math.max(...scores.map(s => s.prestige));
    let tied = scores.filter(s => s.prestige === top);
    let decidedBy = 'POINTS';

    if (tied.length > 1) {
        const withProperty = tied.filter(s => s.hasProperty);
        if (withProperty.length === 1) {
            tied = withProperty;
            decidedBy = 'PROPERTY';
        } else {
            const mostGold = Math.max(...tied.map(s => s.gold));
            tied = tied.filter(s => s.gold === mostGold);
            decidedBy = tied.length === 1 ? 'GOLD' : 'SHARED';
        }
    }

    return { scores, winners: tied.map(s => s.playerId), decidedBy };
}
