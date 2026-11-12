import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TaskList from './components/TaskList.jsx';
import TaskForm from './components/TaskForm.jsx';
import LevelHeader from './components/LevelHeader.jsx';
import StreakDisplay from './components/StreakDisplay.jsx';
import AchievementsGallery from './components/AchievementsGallery.jsx';
import ToastStack from './components/ToastStack.jsx';
import useToastQueue from './state/useToastQueue.js';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [player, setPlayer] = useState({ totalXp: 0, currentLevel: 1 });
  const [streak, setStreak] = useState(null);
  const [achievementDefs, setAchievementDefs] = useState([]);
  const [unlockedAchievements, setUnlockedAchievements] = useState({});
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [view, setView] = useState('quests'); // 'quests' | 'achievements'
  const [justBroken, setJustBroken] = useState(false);
  const { toasts, pushToast } = useToastQueue();

  const refresh = useCallback(async () => {
    const [t, p, s] = await Promise.all([
      window.api.getTasks(),
      window.api.getPlayerState(),
      window.api.getStreakState(),
    ]);
    setTasks(t);
    setPlayer(p);
    setStreak(s);
  }, []);

  const refreshAchievements = useCallback(async () => {
    const unlocked = await window.api.getUnlockedAchievements();
    setUnlockedAchievements(unlocked);
  }, []);

  useEffect(() => {
    refresh();
    refreshAchievements();
    window.api.getAchievementDefinitions().then(setAchievementDefs);

    // Engine event listeners, matching the locked contract from
    // @game-logic-engineer (now the real engine, swapped in for M2).
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
        refresh();
      }),
      window.api.on('onStreakBroken', () => {
        // Per @ux-designer: silent, visual-only. No toast queued here on
        // purpose. Brief crimson-flash + "Fresh start" copy, then settle.
        setJustBroken(true);
        refresh();
        setTimeout(() => setJustBroken(false), 600);
      }),
      window.api.on('onAchievementUnlocked', (payload) => {
        pushToast({ type: 'achievement', title: `Achievement: ${payload.name}` });
        refreshAchievements();
      }),
    ];

    return () => unsubs.forEach((u) => u && u());
  }, [refresh, refreshAchievements, pushToast]);

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
      <div className="header-row">
        <LevelHeader player={player} />
        <StreakDisplay streak={streak} justBroken={justBroken} />
      </div>

      <nav className="main-nav">
        <button
          className={view === 'quests' ? 'nav-tab active' : 'nav-tab'}
          onClick={() => setView('quests')}
        >
          Quest Log
        </button>
        <button
          className={view === 'achievements' ? 'nav-tab active' : 'nav-tab'}
          onClick={() => setView('achievements')}
        >
          Achievements
        </button>
      </nav>

      {view === 'quests' ? (
        <div className="quest-log">
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
      ) : (
        <AchievementsGallery definitions={achievementDefs} unlocked={unlockedAchievements} />
      )}

      {view === 'quests' && (
        <button className="fab" onClick={() => { setEditingTask(null); setFormOpen(true); }} aria-label="New Quest">
          +
        </button>
      )}

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
