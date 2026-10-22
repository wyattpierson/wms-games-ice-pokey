import { sidePlayers } from './campaign';
/** The six stats in display order. */
export const POACH_STATS = [
    { key: 'hp', label: 'HP' },
    { key: 'attack', label: 'ATK' },
    { key: 'specialAttack', label: 'SPA' },
    { key: 'defense', label: 'DEF' },
    { key: 'specialDefense', label: 'SDF' },
    { key: 'speed', label: 'SPD' },
];
export function compareStats(taken, dropped) {
    return POACH_STATS.map(({ key, label }) => ({
        key,
        label,
        taken: taken.stats[key],
        dropped: dropped.stats[key],
        diff: taken.stats[key] - dropped.stats[key],
    }));
}
/** +1 per stat that improves, -1 per stat that gets worse. Positive = net upgrade. */
export function netUpgrade(deltas) {
    return deltas.reduce((n, d) => n + (d.diff > 0 ? 1 : d.diff < 0 ? -1 : 0), 0);
}
/** One player's overall rating: the mean of its six stats, rounded. */
export function overall(player) {
    const total = POACH_STATS.reduce((sum, { key }) => sum + player.stats[key], 0);
    return Math.round(total / POACH_STATS.length);
}
/** Mean overall rating of a group (e.g. a whole roster). 0 for an empty group. */
export function averageOverall(group) {
    if (group.length === 0)
        return 0;
    return Math.round(group.reduce((sum, p) => sum + overall(p), 0) / group.length);
}
/** A team's players in display order: the field players, then the goalie. */
export function rosterEntries(team) {
    return ['field', 'goalie'].flatMap((side) => sidePlayers(team, side).map((player, sideIdx) => ({ player, side, sideIdx })));
}
/**
 * The default "drop" suggestion once a player has been picked to take: the weakest (lowest
 * overall) player of the same side, first on a tie. Returns an index into `own`, or -1 if
 * there is nobody on that side.
 */
export function suggestDrop(own, side) {
    let best = -1;
    own.forEach((e, i) => {
        if (e.side !== side)
            return;
        if (best < 0 || overall(e.player) < overall(own[best].player))
            best = i;
    });
    return best;
}
