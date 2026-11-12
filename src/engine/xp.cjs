// Pure XP/leveling math — no I/O, no state, easy to unit test in isolation.
//
// Rules (per @ux-designer spec):
// - 10 XP per completed task, +5 bonus if completed on/before its due date
//   (tasks with no due date only ever get the base 10).
// - Level-up threshold is INCREMENTAL, not cumulative: XP needed to go from
//   level N to N+1 is 100 * N. So L1->2 = 100, L2->3 = 200, etc.
// - A single completion's XP (base + bonus) can cross more than one
//   threshold at once; callers must fire onLevelUp once per level crossed.

function xpThresholdFor(level) {
  return 100 * level;
}

/**
 * @param {{ dueDate?: string }} task
 * @param {Date} completedAt
 * @returns {{ xpAwarded: number, bonusApplied: boolean }}
 */
function computeXpAward(task, completedAt) {
  let bonusApplied = false;
  if (task.dueDate) {
    bonusApplied = completedAt.getTime() <= new Date(task.dueDate).getTime();
  }
  return { xpAwarded: 10 + (bonusApplied ? 5 : 0), bonusApplied };
}

/**
 * Applies an XP award to a player, draining it against successive
 * incremental thresholds, and reports every level crossed (in order) so the
 * caller can fire onLevelUp once per level rather than once per completion.
 *
 * @param {{ totalXp: number, currentLevel: number }} player  current player
 *   state; NOT mutated — a new object is returned.
 * @param {number} xpAwarded
 * @returns {{ player: { totalXp: number, currentLevel: number }, levelsCrossed: number[] }}
 */
function applyXp(player, xpAwarded) {
  let remaining = player.totalXp + xpAwarded;
  let level = player.currentLevel;
  const levelsCrossed = [];

  while (remaining >= xpThresholdFor(level)) {
    remaining -= xpThresholdFor(level);
    level += 1;
    levelsCrossed.push(level);
  }

  return { player: { totalXp: remaining, currentLevel: level }, levelsCrossed };
}

module.exports = { xpThresholdFor, computeXpAward, applyXp };
