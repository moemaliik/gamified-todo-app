import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TaskList from './components/TaskList.jsx';
import TaskForm from './components/TaskForm.jsx';
import LevelHeader from './components/LevelHeader.jsx';
import ToastStack from './components/ToastStack.jsx';
import useToastQueue from './state/useToastQueue.js';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [player, setPlayer] = useState({ totalXp: 0, currentLevel: 1 });
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const { toasts, pushToast } = useToastQueue();

  const refresh = useCallback(async () => {
    const [t, p] = await Promise.all([window.api.getTasks(), window.api.getPlayerState()]);
    setTasks(t);
    setPlayer(p);
  }, []);

  useEffect(() => {
    refresh();

    // Engine event listeners, matching the locked contract. Streak/
    // achievement events are wired now even though the M1 mock engine never
    // fires them, so this is ready the moment engine-m1 (real logic) merges.
    const unsubs = [
      window.api.on('onTaskComplete', (payload) => {
        pushToast({
          type: 'xp',
          title: `+${payload.xpAwarded} XP${payload.bonusApplied ? ' (on-time bonus!)' : ''}`,
        });
        refresh();
      }),
      window.api.on('onLevelUp', (payload) => {
        pushToast({ type: 'levelUp', title: `Level Up! → Lv.${payload.newLevel}` });
      }),
      window.api.on('onStreakIncremented', (payload) => {
        pushToast({ type: 'streak', title: `Streak: Day ${payload.currentStreak}` });
      }),
      window.api.on('onStreakShieldConsumed', () => {
        pushToast({ type: 'shield', title: 'Shield used — streak saved!' });
      }),
      window.api.on('onStreakBroken', () => {
        // Per @ux-designer: silent, visual-only. No toast queued here on
        // purpose — see LevelHeader streak counter fade-to-0 treatment.
      }),
      window.api.on('onAchievementUnlocked', (payload) => {
        pushToast({ type: 'achievement', title: `Achievement: ${payload.name}` });
      }),
    ];

    return () => unsubs.forEach((u) => u && u());
  }, [refresh, pushToast]);

  const handleComplete = async (id) => {
    // Optimistic update: strike through immediately, revert on failure.
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: true } : t)));
    try {
      await window.api.completeTask(id);
    } catch (err) {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: false } : t)));
      pushToast({ type: 'error', title: 'Could not complete quest — try again' });
    }
  };

  const handleSaveTask = async (data) => {
    if (editingTask) {
      await window.api.updateTask(editingTask.id, data);
    } else {
      await window.api.createTask(data);
    }
    setFormOpen(false);
    setEditingTask(null);
    refresh();
  };

  const handleDelete = async (id) => {
    await window.api.deleteTask(id);
    refresh();
  };

  return (
    <div className="app-shell">
      <LevelHeader player={player} />

      <div className="quest-log">
        <h2>Quest Log</h2>
        <TaskList
          tasks={tasks}
          onComplete={handleComplete}
          onEdit={(task) => {
            setEditingTask(task);
            setFormOpen(true);
          }}
          onDelete={handleDelete}
        />
      </div>

      <button className="fab" onClick={() => { setEditingTask(null); setFormOpen(true); }} aria-label="New Quest">
        +
      </button>

      <AnimatePresence>
        {formOpen && (
          <TaskForm
            key="task-form"
            initial={editingTask}
            onSave={handleSaveTask}
            onCancel={() => { setFormOpen(false); setEditingTask(null); }}
          />
        )}
      </AnimatePresence>

      <ToastStack toasts={toasts} />
    </div>
  );
}
