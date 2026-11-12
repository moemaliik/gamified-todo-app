import React from 'react';
import { motion } from 'framer-motion';

// Settings slide-over per @ux-designer's spec: entered via the gear icon
// next to the level badge, same visual weight as the Add/Edit Task modal
// (wax-seal styled, parchment bg). Three control points for v1:
// Master Mute, Volume (disabled when muted), Streak-tick toggle.
// Persisted through the engine data file via settings:update IPC, same
// restart-safety test as everything else.
export default function SettingsPanel({ settings, onUpdate, onClose }) {
  const muted = !!settings.muted;
  const volume = settings.volume ?? 0.8;
  // streakTickEnabled defaults to true when absent (pre-existing data files
  // won't have this key since it's new in this change) — don't let an
  // undefined value render as "off" for an existing user.
  const streakTickEnabled = settings.streakTickEnabled !== false;

  return (
    <motion.div
      className="settings-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="settings-panel"
        onClick={(e) => e.stopPropagation()}
        initial={{ x: 320 }}
        animate={{ x: 0 }}
        exit={{ x: 320 }}
        transition={{ type: 'tween', duration: 0.25 }}
      >
        <h3>Settings</h3>

        <div className="settings-row">
          <label htmlFor="master-mute">Master Mute</label>
          <input
            id="master-mute"
            type="checkbox"
            checked={muted}
            onChange={(e) => onUpdate({ muted: e.target.checked })}
          />
        </div>

        <div className="settings-row">
          <label htmlFor="volume">Volume</label>
          <input
            id="volume"
            type="range"
            min="0"
            max="100"
            value={Math.round(volume * 100)}
            disabled={muted}
            onChange={(e) => onUpdate({ volume: Number(e.target.value) / 100 })}
          />
          <span className="volume-pct">{muted ? '—' : `${Math.round(volume * 100)}%`}</span>
        </div>

        <div className="settings-row">
          <label htmlFor="streak-tick">Streak-tick sound</label>
          <input
            id="streak-tick"
            type="checkbox"
            checked={streakTickEnabled}
            onChange={(e) => onUpdate({ streakTickEnabled: e.target.checked })}
          />
        </div>

        <button className="wax-btn" onClick={onClose} style={{ marginTop: 16 }}>Done</button>
      </motion.div>
    </motion.div>
  );
}
