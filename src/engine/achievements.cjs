// Fixed starter achievement set (8, v1 — per @ux-designer spec).
// Each definition is a pure predicate over engine stats, so this module
// has no I/O and is trivially unit-testable.

const ACHIEVEMENTS = [
  {
    id: 'first-steps',
    name: 'First Steps',
    description: 'Complete your first quest',
    check: (stats) => stats.tasksCompletedTotal >= 1,
  },
  {
    id: 'getting-things-done',
    name: 'Getting Things Done',
    description: 'Complete 10 quests',
    check: (stats) => stats.tasksCompletedTotal >= 10,
  },
  {
    id: 'task-master',
    name: 'Task Master',
    description: 'Complete 100 quests',
    check: (stats) => stats.tasksCompletedTotal >= 100,
  },
  {
    id: 'week-warrior',
    name: 'Week Warrior',
    description: 'Reach a 7-day streak',
    check: (stats) => stats.currentStreak >= 7,
  },
  {
    id: 'unbreakable',
    name: 'Unbreakable',
    description: 'Reach a 30-day streak',
    check: (stats) => stats.currentStreak >= 30,
  },
  {
    id: 'apprentice',
    name: 'Apprentice',
    description: 'Reach Level 5',
    check: (stats) => stats.currentLevel >= 5,
  },
  {
    id: 'adventurer',
    name: 'Adventurer',
    description: 'Reach Level 10',
    check: (stats) => stats.currentLevel >= 10,
  },
  {
    id: 'comeback-kid',
    name: 'Comeback Kid',
    description: 'Use a Streak Shield to save your streak',
    check: (stats) => stats.shieldUsedCount >= 1,
  },
];

/**
 * @param {object} stats { tasksCompletedTotal, currentStreak, currentLevel, shieldUsedCount }
 * @param {Record<string,string>} unlocked map of already-unlocked achievement id -> ISO unlock date
 * @returns {{id: string, name: string}[]} achievements newly met this call (not yet in `unlocked`)
 */
function checkAchievements(stats, unlocked) {
  return ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.check(stats)).map((a) => ({ id: a.id, name: a.name }));
}

module.exports = { ACHIEVEMENTS, checkAchievements };
