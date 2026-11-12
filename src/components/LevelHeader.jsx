import React from 'react';

export default function LevelHeader({ player }) {
  const threshold = 100 * player.currentLevel;
  const pct = Math.min(100, Math.round((player.totalXp / threshold) * 100));

  return (
    <div className="header">
      <div className="level-badge pixel">{player.currentLevel}</div>
      <div style={{ flex: 1 }}>
        <div className="xp-bar-track">
          <div className="xp-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="xp-label">{player.totalXp}/{threshold} XP</div>
      </div>
    </div>
  );
}
