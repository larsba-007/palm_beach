// Palm Beach rules: chance (shuffling and the die).
// All randomness in the rules goes through one "rng" object, so a game can be replayed exactly
// from its seed, and tests can decide every die roll.

/** A repeatable random source: the same seed always gives the same shuffles and rolls. */
export function createRng(seed = Date.now()) {
    let a = (Number(seed) >>> 0) || 1;
    const next = () => {                       // mulberry32
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        seed,
        next,
        /** A whole number from 0 to n-1. */
        int: (n) => Math.floor(next() * n),
        /** One roll of the die: 1 to 6. */
        die: () => 1 + Math.floor(next() * 6),
        /** A new shuffled copy of the list. */
        shuffle: (list) => {
            const copy = list.slice();
            for (let i = copy.length - 1; i > 0; i--) {
                const j = Math.floor(next() * (i + 1));
                [copy[i], copy[j]] = [copy[j], copy[i]];
            }
            return copy;
        }
    };
}

/**
 * For tests and the tutorial: a random source whose die rolls are given in advance.
 * When the list runs out it falls back to the seeded source.
 */
export function createScriptedRng(rolls = [], seed = 1) {
    const base = createRng(seed);
    const queue = rolls.slice();
    return {
        ...base,
        die: () => (queue.length ? queue.shift() : base.die()),
        rollsLeft: () => queue.length
    };
}
