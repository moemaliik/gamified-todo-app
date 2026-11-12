import React from 'react';

// Grid of 8 wax-seal slots. Locked = greyed silhouette + unlock condition
// text visible (clarity over mystery, per @ux-designer). Unlocked = full
// color + unlock date.
export default function AchievementsGallery({ definitions, unlocked }) {
  if (!definitions || definitions.length === 0) {
    return <p className="empty-state">Loading achievements…</p>;
  }

  return (
    <div className="achievements-grid">
      {definitions.map((def) => {
        const unlockDate = unlocked[def.id];
        const isUnlocked = !!unlockDate;
        return (
          <div key={def.id} className={`achievement-slot ${isUnlocked ? 'unlocked' : 'locked'}`}>
            <div className="achievement-seal">🏅</div>
            <div className="achievement-name">{def.name}</div>
            {isUnlocked ? (
              <div className="achievement-date">
                Unlocked {new Date(unlockDate).toLocaleDateString()}
              </div>
            ) : (
              <div className="achievement-condition">{def.description}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
