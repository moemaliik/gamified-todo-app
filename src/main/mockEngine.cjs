// TEMPORARY placeholder engine — mirrors the locked IPC contract so the UI
// (ui-m1) is runnable end-to-end before @game-logic-engineer's real engine
// (engine-m1: full streak/shield/achievement logic, integration-tested
// restart safety) merges to develop. DELETE this file and swap the require()
// in main.cjs once that lands — nothing else should need to change.
//
// Implements: Task CRUD + XP/leveling (10 XP/task, +5 on-time bonus,
// level-up threshold = 100 * currentLevel, multi-level-crossing supported).
// Streak/shield/achievement logic is intentionally NOT implemented here
// (out of M1 scope) — those IPC channels/events exist as no-ops so UI code
// wiring against them doesn't crash, but will never fire from this mock.

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

const emitter = new EventEmitter();

let state = {
  tasks: [],
  player: { totalXp: 0, currentLevel: 1 },
  settings: { muted: false, volume: 0.8 },
};

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      state = { ...state, ...JSON.parse(raw) };
    } else {
      save();
    }
  } catch (err) {
    console.error('[mockEngine] failed to load data file, starting fresh:', err);
  }
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function init() {
  load();
}

function getAllTasks() {
  return state.tasks;
}

function createTask(input) {
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
  state.tasks = state.tasks.filter((t) => t.id !== id);
  save();
}

function xpThresholdFor(level) {
  return 100 * level;
}

function completeTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`Task not found: ${id}`);
  if (task.completed) throw new Error(`Task already completed: ${id}`);

  const now = new Date();
  task.completed = true;
  task.completedAt = now.toISOString();

  let bonusApplied = false;
  if (task.dueDate) {
    bonusApplied = now <= new Date(task.dueDate);
  }
  const xpAwarded = 10 + (bonusApplied ? 5 : 0);

  const previousLevel = state.player.currentLevel;
  state.player.totalXp += xpAwarded;

  // Drain remaining XP against successive thresholds so multi-level jumps
  // from bonus XP are handled and onLevelUp fires once per level crossed.
  let remaining = state.player.totalXp;
  let runningLevel = previousLevel;
  // NOTE: mock uses a simple running total (not cumulative-vs-incremental
  // bookkeeping) — fine for M1 display purposes; real engine owns the
  // authoritative formula per @ux-designer's spec.
  while (remaining >= xpThresholdFor(runningLevel)) {
    remaining -= xpThresholdFor(runningLevel);
    runningLevel += 1;
  }
  state.player.currentLevel = runningLevel;
  state.player.totalXp = remaining;

  save();

  const completePayload = {
    task,
    xpAwarded,
    bonusApplied,
    totalXp: state.player.totalXp,
    currentLevel: state.player.currentLevel,
  };
  emitter.emit('onTaskComplete', completePayload);

  for (let lvl = previousLevel + 1; lvl <= runningLevel; lvl++) {
    emitter.emit('onLevelUp', { previousLevel: lvl - 1, newLevel: lvl, totalXp: state.player.totalXp });
  }

  return { task, xpAwarded, bonusApplied };
}

function getPlayerState() {
  return state.player;
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
  getSettings,
  updateSettings,
  on: (event, handler) => emitter.on(event, handler),
};
