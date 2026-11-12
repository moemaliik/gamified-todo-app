// Engine test suite — plain Node + assert, no framework dependency, run
// with: node src/engine/engine.test.cjs
//
// Covers the scenarios that matter most given data-integrity is priority
// one: restart persistence, multi-level XP crossing, shield consume/regen,
// multi-day gaps breaking the streak even with a shield available, corrupt
// data file recovery, and achievement unlock firing exactly once.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const xp = require('./xp.cjs');
const streakLib = require('./streak.cjs');
const { checkAchievements } = require('./achievements.cjs');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

// ---- Isolated engine instance per test: real module, real file I/O,
// pointed at a throwaway temp directory via a copy of the repo's engine
// files, so tests exercise the exact save/load code path (not a mock).
function freshEngine(tmpDir) {
  // Copy engine source into the temp dir under src/engine and an empty
  // data dir two levels up, matching the real __dirname-relative layout
  // (../../data from src/engine/index.cjs), then require it fresh each
  // time (bypassing require() caching) so module-level `state` resets.
  const engineSrcDir = path.join(tmpDir, 'proj', 'src', 'engine');
  fs.mkdirSync(engineSrcDir, { recursive: true });
  fs.mkdirSync(path.join(tmpDir, 'proj', 'data'), { recursive: true });
  for (const file of ['index.cjs', 'xp.cjs', 'streak.cjs', 'achievements.cjs']) {
    fs.copyFileSync(path.join(__dirname, file), path.join(engineSrcDir, file));
  }
  const modPath = path.join(engineSrcDir, 'index.cjs');
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

console.log('xp.cjs');
test('base XP with no due date is 10, no bonus', () => {
  const { xpAwarded, bonusApplied } = xp.computeXpAward({}, new Date('2024-01-01T10:00:00'));
  assert.strictEqual(xpAwarded, 10);
  assert.strictEqual(bonusApplied, false);
});

test('on-time completion gets +5 bonus', () => {
  const { xpAwarded, bonusApplied } = xp.computeXpAward(
    { dueDate: '2024-01-02T00:00:00' },
    new Date('2024-01-01T10:00:00')
  );
  assert.strictEqual(xpAwarded, 15);
  assert.strictEqual(bonusApplied, true);
});

test('late completion gets no bonus', () => {
  const { xpAwarded, bonusApplied } = xp.computeXpAward(
    { dueDate: '2024-01-01T00:00:00' },
    new Date('2024-01-02T10:00:00')
  );
  assert.strictEqual(xpAwarded, 10);
  assert.strictEqual(bonusApplied, false);
});

test('single completion crosses exactly one level at the threshold', () => {
  const { player, levelsCrossed } = xp.applyXp({ totalXp: 95, currentLevel: 1 }, 10);
  assert.strictEqual(player.currentLevel, 2);
  assert.strictEqual(player.totalXp, 5);
  assert.deepStrictEqual(levelsCrossed, [2]);
});

test('bonus XP can cross multiple levels in one completion', () => {
  // L1 needs 100, L2 needs 200. Start at L1 with 295 XP, award 15 -> 310.
  // 310 - 100 (L1->2) = 210; 210 - 200 (L2->3) = 10, stop at L3 with 10 XP.
  const { player, levelsCrossed } = xp.applyXp({ totalXp: 295, currentLevel: 1 }, 15);
  assert.strictEqual(player.currentLevel, 3);
  assert.strictEqual(player.totalXp, 10);
  assert.deepStrictEqual(levelsCrossed, [2, 3]);
});

console.log('streak.cjs');
test('no lastActiveDayKey yet -> resolveMissedDays is a no-op', () => {
  const { streak, event } = streakLib.resolveMissedDays(streakLib.initialStreakState(), '2024-01-05');
  assert.strictEqual(event, 'none');
  assert.strictEqual(streak.current, 0);
});

test('same day or next day -> no missed day detected', () => {
  const s = { ...streakLib.initialStreakState(), current: 3, lastActiveDayKey: '2024-01-05' };
  assert.strictEqual(streakLib.resolveMissedDays(s, '2024-01-05').event, 'none');
  assert.strictEqual(streakLib.resolveMissedDays(s, '2024-01-06').event, 'none');
});

test('exactly one missed day with shield available -> shield consumed, streak intact', () => {
  const s = { current: 5, lastActiveDayKey: '2024-01-05', shieldAvailable: true, activeDaysSinceShieldUse: 0 };
  const { streak, event } = streakLib.resolveMissedDays(s, '2024-01-07'); // Jan 6 missed
  assert.strictEqual(event, 'shieldConsumed');
  assert.strictEqual(streak.current, 5); // unchanged
  assert.strictEqual(streak.shieldAvailable, false);
});

test('exactly one missed day with NO shield available -> streak breaks', () => {
  const s = { current: 5, lastActiveDayKey: '2024-01-05', shieldAvailable: false, activeDaysSinceShieldUse: 2 };
  const { streak, event, previousStreak } = streakLib.resolveMissedDays(s, '2024-01-07');
  assert.strictEqual(event, 'broken');
  assert.strictEqual(previousStreak, 5);
  assert.strictEqual(streak.current, 0);
});

test('two or more missed days breaks the streak even WITH a shield available', () => {
  const s = { current: 8, lastActiveDayKey: '2024-01-01', shieldAvailable: true, activeDaysSinceShieldUse: 0 };
  const { streak, event } = streakLib.resolveMissedDays(s, '2024-01-05'); // Jan 2,3,4 missed
  assert.strictEqual(event, 'broken');
  assert.strictEqual(streak.current, 0);
  // Shield was NOT consumed by a multi-day gap it can't cover.
  assert.strictEqual(streak.shieldAvailable, true);
});

test('shield regenerates after exactly 7 consecutive active days post-consumption', () => {
  let s = { current: 5, lastActiveDayKey: '2024-01-05', shieldAvailable: false, activeDaysSinceShieldUse: 0 };
  let day = new Date('2024-01-06');
  for (let i = 0; i < 6; i++) {
    const key = streakLib.dayKey(day);
    const result = streakLib.recordCompletion(s, key);
    s = result.streak;
    assert.strictEqual(s.shieldAvailable, false, `still unavailable after ${i + 1} days`);
    day = new Date(day.getTime() + 86400000);
  }
  const result7 = streakLib.recordCompletion(s, streakLib.dayKey(day));
  assert.strictEqual(result7.streak.shieldAvailable, true, 'available again on the 7th active day');
});

test('recordCompletion only increments once per calendar day', () => {
  const s = streakLib.initialStreakState();
  const r1 = streakLib.recordCompletion(s, '2024-01-01');
  assert.strictEqual(r1.incremented, true);
  assert.strictEqual(r1.streak.current, 1);
  const r2 = streakLib.recordCompletion(r1.streak, '2024-01-01'); // same day again
  assert.strictEqual(r2.incremented, false);
  assert.strictEqual(r2.streak.current, 1);
});

console.log('achievements.cjs');
test('First Steps unlocks at 1 completed task, not before', () => {
  const statsBefore = { tasksCompletedTotal: 0, currentStreak: 0, currentLevel: 1, shieldUsedCount: 0 };
  assert.deepStrictEqual(checkAchievements(statsBefore, {}), []);
  const statsAfter = { ...statsBefore, tasksCompletedTotal: 1 };
  const unlocked = checkAchievements(statsAfter, {});
  assert.ok(unlocked.some((a) => a.id === 'first-steps'));
});

test('already-unlocked achievements are not returned again', () => {
  const stats = { tasksCompletedTotal: 1, currentStreak: 0, currentLevel: 1, shieldUsedCount: 0 };
  const unlocked = checkAchievements(stats, { 'first-steps': '2024-01-01T00:00:00Z' });
  assert.strictEqual(unlocked.some((a) => a.id === 'first-steps'), false);
});

test('crossing a big threshold unlocks multiple achievements at once', () => {
  const stats = { tasksCompletedTotal: 100, currentStreak: 30, currentLevel: 10, shieldUsedCount: 1 };
  const unlocked = checkAchievements(stats, {}).map((a) => a.id);
  for (const id of ['first-steps', 'getting-things-done', 'task-master', 'week-warrior', 'unbreakable', 'apprentice', 'adventurer', 'comeback-kid']) {
    assert.ok(unlocked.includes(id), `expected ${id} to unlock`);
  }
});

console.log('engine integration (real file I/O)');
test('state persists across a simulated restart (fresh require, same data dir)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-test-'));
  try {
    let engine = freshEngine(tmpDir);
    engine.init();
    const task = engine.createTask({ title: 'Slay the inbox dragon' });
    engine.completeTask(task.id);
    const playerBefore = engine.getPlayerState();
    assert.strictEqual(playerBefore.totalXp, 10);

    // Simulate a full process restart: fresh require of the same module
    // pointed at the same data dir, with no in-memory state carried over.
    engine = freshEngine(tmpDir);
    engine.init();
    const tasksAfter = engine.getAllTasks();
    const playerAfter = engine.getPlayerState();
    assert.strictEqual(tasksAfter.length, 1);
    assert.strictEqual(tasksAfter[0].completed, true);
    assert.strictEqual(playerAfter.totalXp, 10);
    assert.strictEqual(playerAfter.currentLevel, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('onTaskComplete and onLevelUp fire with correct payloads, once per level', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-test-'));
  try {
    const engine = freshEngine(tmpDir);
    engine.init();
    const completeEvents = [];
    const levelUpEvents = [];
    engine.on('onTaskComplete', (p) => completeEvents.push(p));
    engine.on('onLevelUp', (p) => levelUpEvents.push(p));

    // Drive totalXp to 95 first via 9 completions (10 each), then one more
    // crosses the L1 (100) threshold.
    for (let i = 0; i < 9; i++) {
      const t = engine.createTask({ title: `Task ${i}` });
      engine.completeTask(t.id);
    }
    assert.strictEqual(engine.getPlayerState().totalXp, 90);
    const last = engine.createTask({ title: 'The tenth task' });
    engine.completeTask(last.id);

    assert.strictEqual(completeEvents.length, 10);
    assert.strictEqual(levelUpEvents.length, 1);
    assert.strictEqual(levelUpEvents[0].newLevel, 2);
    assert.strictEqual(engine.getPlayerState().currentLevel, 2);
    assert.strictEqual(engine.getPlayerState().totalXp, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('a corrupt data file does not crash init and is backed up, not destroyed', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-test-'));
  try {
    const dataFile = path.join(tmpDir, 'proj', 'data', 'store.json');
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'proj', 'src', 'engine'), { recursive: true });
    for (const file of ['index.cjs', 'xp.cjs', 'streak.cjs', 'achievements.cjs']) {
      fs.copyFileSync(path.join(__dirname, file), path.join(tmpDir, 'proj', 'src', 'engine', file));
    }
    fs.writeFileSync(dataFile, '{ this is not valid json ]]]');

    const modPath = path.join(tmpDir, 'proj', 'src', 'engine', 'index.cjs');
    delete require.cache[require.resolve(modPath)];
    const engine = require(modPath);
    engine.init(); // must not throw

    assert.strictEqual(engine.getAllTasks().length, 0);
    const files = fs.readdirSync(path.join(tmpDir, 'proj', 'data'));
    assert.ok(files.some((f) => f.includes('.corrupt-')), 'expected a backup of the corrupt file');
    assert.ok(files.includes('store.json'), 'expected a fresh store.json to have been written');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('missing a day with no shield breaks the streak on next startup', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-test-'));
  try {
    let engine = freshEngine(tmpDir);
    engine.init();
    const t = engine.createTask({ title: 'Day 1 quest' });
    engine.completeTask(t.id);
    assert.strictEqual(engine.getStreakState().current, 1);

    // Manually age the persisted lastActiveDayKey back and burn the
    // shield so the next init() sees a genuine multi-day-equivalent gap.
    const dataFile = path.join(tmpDir, 'proj', 'data', 'store.json');
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    raw.streak.shieldAvailable = false;
    raw.streak.lastActiveDayKey = '2000-01-01'; // long ago, guaranteed >1 day gap
    fs.writeFileSync(dataFile, JSON.stringify(raw, null, 2));

    engine = freshEngine(tmpDir);
    const brokenEvents = [];
    engine.on('onStreakBroken', (p) => brokenEvents.push(p));
    engine.init();

    assert.strictEqual(engine.getStreakState().current, 0);
    assert.strictEqual(brokenEvents.length, 1);
    assert.strictEqual(brokenEvents[0].previousStreak, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} test(s) passed${process.exitCode ? ', some FAILED (see above)' : ''}`);
