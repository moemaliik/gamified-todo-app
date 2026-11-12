import React from 'react';

// Shield pip: filled gold shield if available, empty outline if consumed.
// Streak counter uses a torch icon per @ux-designer's spec ("torch icon +
// count + shield pips"). onStreakBroken is silent/visual-only per the
// forgiveness-over-punishment design pillar — this component just reflects
// whatever `current` the engine reports; the brief crimson-flash-then-fade
// transition on a break is handled by the `justBroken` flag passed from App.
export default function StreakDisplay({ streak, justBroken }) {
  if (!streak) return null;

  return (
    <div className={`streak-display ${justBroken ? 'streak-fresh-start' : ''}`}>
      <span className="streak-icon">🔥</span>
      <span className="streak-count">
        {justBroken ? 'Day 1' : `Day ${streak.current}`}
      </span>
      {justBroken && <span className="streak-microcopy">Fresh start</span>}
      <span
        className={`shield-pip ${streak.shieldAvailable ? 'filled' : 'empty'}`}
        title={streak.shieldAvailable ? 'Streak Shield available' : 'Streak Shield used'}
      >
        🛡
      </span>
    </div>
  );
}
