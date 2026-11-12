import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const LABELS = {
  xp: 'XP Gained',
  levelUp: 'Level Up',
  streak: 'Streak',
  shield: 'Streak Shield',
  achievement: 'Achievement Unlocked',
  error: 'Error',
};

export default function ToastStack({ toasts }) {
  return (
    <div className="toast-stack">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className="toast"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
          >
            <div className="pixel">{LABELS[t.type] || t.type}</div>
            <div>{t.title}</div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
