// The core engine: Task CRUD + local persistence + XP/leveling + streaks
// (with forgiveness shield) + achievement unlocks + an event emitter.
//
// Architecture (locked by the team): this module is the SINGLE writer to
// the local data file. It has zero UI dependencies and is designed to run
// in the Electron main process; the renderer only ever talks to it over
// IPC (see src/main/main.cjs, which wires these exact function names to
// ipcMain.handle(...) and the event names to forwarded webContents.send()
// calls). Exported shape intentionally mirrors src/main/mockEngine.cjs so
// swapping it in is a one-line require() change with no renderer changes.
//
// Data integrity notes (priority one per team mandate):
// - Every mutation calls save() synchronously before returning, so a crash
//   right after a function returns can't silently lose that mutation.
// - save() writes to a temp file then renames over the real one, so a
//   crash/power-loss MID-WRITE can't leave a half-written, corrupt JSON
//   file behind — the rename is atomic on both POSIX and Windows/NTFS.
// - On load, a corrupt/unreadable data file does NOT wipe progress: we
//   back up the bad file (.corrupt-<timestamp>) and start a fresh state
//   rather than overwriting it, so a human can recover data from the
//   backup if needed instead of it being silently destroyed.

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const xp = require('./xp.cjs');
const streakLib = require('./streak.cjs');
const { checkAchievements } = require('./achievements.cjs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const emitter = new EventEmitter();

function defaultState() {
  return {
    tasks: [],
    player: { totalXp: 0, currentLevel: 1 },
    streak: streakLib.initialStreakState(),
    stats: { tasksCompletedTotal: 0, shieldUsedCount: 0 },
    achievements: { unlocked: {} }, // id -> ISO unlock date
    settings: { muted: false, volume: 0.8 },
  };
}

let state = defaultState();

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    state = defaultState();
    save();
    return;
  }
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    // Shallow-merge onto defaults so a data file from an older schema
    // version (e.g. missing `streak`/`achievements` keys pre-M2) doesn't
    // crash the app — missing sections just start fresh instead.
    state = { ...defaultState(), ...parsed };
  } catch (err) {
    const backupPath = `${DATA_FILE}.corrupt-${Date.now()}`;
    try {
      fs.copyFileSync(DATA_FILE, backupPath);
    } catch (copyErr) {
      console.error('[engine] also failed to back up corrupt data file:', copyErr);
    }
    console.error(
      `[engine] data file was corrupt/unreadable, backed up to ${backupPath} and starting fresh:`,
      err
    );
    state = defaultState();
    save();
  }
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${DATA_FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, DATA_FILE); // atomic swap — no half-written file on crash
}

/**
 * Must be called once at app startup, BEFORE the renderer is shown, since
 * it may resolve missed days from while the app was closed (shield
 * consumption or a streak break) and those events should reach the UI/audio
 * layer as soon as there's something listening, not wait for the user's
 * next completion.
 */
function init() {
  load();
  const todayKey = streakLib.dayKey(new Date());
  const { streak: nextStreak, event, previousStreak } = streakLib.resolveMissedDays(state.streak, todayKey);
  state.streak = nextStreak;

  if (event === 'shieldConsumed') {
    state.stats.shieldUsedCount += 1;
    save();
    emitter.emit('onStreakShieldConsumed', { shieldsRemaining: 0 });
    runAchievementCheck();
  } else if (event === 'broken') {
    save();
    emitter.emit('onStreakBroken', { previousStreak });
  }
}

function getAllTasks() {
  return state.tasks;
}

function createTask(input) {
  if (!input || !input.title || !input.title.trim()) {
    throw new Error('Task title is required');
  }
  const task = {
    id: crypto.randomUUID(),
    title: input.title,
    description: input.description || undefined,
    dueDate: input.dueDate || undefined,
    completed: false,
    completedAt: undefined,
    createdAt: new Date().toISOString(),
  };
  state.tasks.unshift(task);
  save();
  return task;
}

function updateTask(id, patch) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`Task not found: ${id}`);
  Object.assign(task, patch);
  save();
  return task;
}

function deleteTask(id) {
  const existed = state.tasks.some((t) => t.id === id);
  if (!existed) throw new Error(`Task not found: ${id}`);
  state.tasks = state.tasks.filter((t) => t.id !== id);
  save();
}

function runAchievementCheck() {
  const stats = {
    tasksCompletedTotal: state.stats.tasksCompletedTotal,
    currentStreak: state.streak.current,
    currentLevel: state.player.currentLevel,
    shieldUsedCount: state.stats.shieldUsedCount,
  };
  const newlyUnlocked = checkAchievements(stats, state.achievements.unlocked);
  if (newlyUnlocked.length === 0) return;

  const now = new Date().toISOString();
  for (const a of newlyUnlocked) {
    state.achievements.unlocked[a.id] = now;
  }
  save();
  for (const a of newlyUnlocked) {
    emitter.emit('onAchievementUnlocked', { id: a.id, name: a.name });
  }
}

function completeTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`Task not found: ${id}`);
  if (task.completed) throw new Error(`Task already completed: ${id}`);

  const now = new Date();
  task.completed = true;
  task.completedAt = now.toISOString();
  state.stats.tasksCompletedTotal += 1;

  const { xpAwarded, bonusApplied } = xp.computeXpAward(task, now);
  const previousLevel = state.player.currentLevel;
  const { player: nextPlayer, levelsCrossed } = xp.applyXp(state.player, xpAwarded);
  state.player = nextPlayer;

  // Streak: first completion of the local day increments it. Note this
  // intentionally runs AFTER init()'s missed-day resolution already ran at
  // startup, so "today" here can only ever be a continuation, never a gap.
  const todayKey = streakLib.dayKey(now);
  const { streak: nextStreak, incremented } = streakLib.recordCompletion(state.streak, todayKey);
  state.streak = nextStreak;

  save();

  emitter.emit('onTaskComplete', {
    task,
    xpAwarded,
    bonusApplied,
    totalXp: state.player.totalXp,
    currentLevel: state.player.currentLevel,
  });

  for (const lvl of levelsCrossed) {
    emitter.emit('onLevelUp', { previousLevel: lvl - 1, newLevel: lvl, totalXp: state.player.totalXp });
  }

  if (incremented) {
    emitter.emit('onStreakIncremented', { currentStreak: state.streak.current });
  }

  runAchievementCheck();

  return { task, xpAwarded, bonusApplied };
}

function getPlayerState() {
  return state.player;
}

function getStreakState() {
  return {
    current: state.streak.current,
    shieldAvailable: state.streak.shieldAvailable,
    activeDaysSinceShieldUse: state.streak.activeDaysSinceShieldUse,
  };
}

function getAchievements() {
  return state.achievements.unlocked;
}

function getSettings() {
  return state.settings;
}

function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
  return state.settings;
}

module.exports = {
  init,
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  getPlayerState,
  getStreakState,
  getAchievements,
  getSettings,
  updateSettings,
  on: (event, handler) => emitter.on(event, handler),
};
