// Pure streak/shield math — no I/O, no state, easy to unit test in isolation.
//
// Rules (per @ux-designer spec, "forgiveness over punishment"):
// - Streak increments once per LOCAL calendar day on the day's first task
//   completion (not once per task).
// - Each user holds up to 1 "Streak Shield". If exactly one whole calendar
//   day is missed (zero completions), the shield auto-consumes instead of
//   breaking the streak, and the streak count carries forward unchanged.
// - If the shield is unavailable (already consumed), missing a day breaks
//   the streak to 0.
// - If TWO OR MORE consecutive days are missed, the streak always breaks to
//   0 even if a shield is available — the shield only covers a single
//   missed day, never a multi-day gap. (Confirmed design call, posted to
//   the team: a shield is not a multi-day buffer.)
// - The shield regenerates after 7 consecutive active days following the
//   day it was consumed (the missed day itself doesn't count). CONFIRMED
//   by @ux-designer: if another day is missed before hitting 7 and a
//   shield is available, it just consumes again and the counter restarts
//   at 0; if a real break happens instead, the regen counter also resets
//   to 0 (no partial credit carried on a dead streak). Hard-capped at 1
//   shield held — progress never banks toward a second one while already
//   holding one (recordCompletion only advances the counter when
//   shieldAvailable is false).
//
// Dates are represented as "day keys" — YYYY-MM-DD strings in LOCAL time —
// so callers control timezone handling explicitly instead of this module
// silently assuming UTC.

/** @param {Date} date */
function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Whole-day difference between two day keys (b - a), in days. */
function dayKeyDiff(aKey, bKey) {
  const a = new Date(`${aKey}T00:00:00`);
  const b = new Date(`${bKey}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * @typedef {Object} StreakState
 * @property {number} current               current streak length in days
 * @property {string|null} lastActiveDayKey last day a completion happened
 * @property {boolean} shieldAvailable      whether the shield can be consumed
 * @property {number} activeDaysSinceShieldUse  count toward shield regen
 */

function initialStreakState() {
  return { current: 0, lastActiveDayKey: null, shieldAvailable: true, activeDaysSinceShieldUse: 0 };
}

/**
 * Call once per app startup (and safe to call redundantly elsewhere) BEFORE
 * the user completes anything today, to detect and resolve days that were
 * missed while the app was closed. Does nothing if today is already the
 * last active day or the very next day after it (no full day missed yet).
 *
 * @param {StreakState} streak
 * @param {string} todayKey
 * @returns {{ streak: StreakState, event: 'none'|'shieldConsumed'|'broken', previousStreak?: number }}
 */
function resolveMissedDays(streak, todayKey) {
  if (!streak.lastActiveDayKey) {
    return { streak, event: 'none' };
  }
  const diff = dayKeyDiff(streak.lastActiveDayKey, todayKey);

  if (diff <= 1) {
    // Same day, or the very next day with no gap yet — nothing missed.
    return { streak, event: 'none' };
  }

  const missedDays = diff - 1; // days strictly between lastActive and today

  if (missedDays === 1 && streak.shieldAvailable) {
    const next = { ...streak, shieldAvailable: false, activeDaysSinceShieldUse: 0 };
    return { streak: next, event: 'shieldConsumed' };
  }

  // Either more than one day was missed (shield can't cover a multi-day
  // gap), or exactly one day was missed but no shield was available.
  // Per @ux-designer's clarification: a real break also zeroes any
  // in-progress shield-regen credit — a user isn't left owing partial
  // shield progress on a dead streak. (shieldAvailable is left as-is:
  // if it was already true going into this break, it stays true.)
  const previousStreak = streak.current;
  const next = { ...streak, current: 0, activeDaysSinceShieldUse: 0 };
  return { streak: next, event: 'broken', previousStreak };
}

/**
 * Call when a task is completed. Increments the streak at most once per
 * calendar day and advances shield-regeneration progress.
 *
 * @param {StreakState} streak
 * @param {string} todayKey
 * @returns {{ streak: StreakState, incremented: boolean }}
 */
function recordCompletion(streak, todayKey) {
  if (streak.lastActiveDayKey === todayKey) {
    return { streak, incremented: false }; // already counted today
  }

  let current = streak.current + 1;
  let shieldAvailable = streak.shieldAvailable;
  let activeDaysSinceShieldUse = streak.activeDaysSinceShieldUse;

  if (!shieldAvailable) {
    activeDaysSinceShieldUse += 1;
    if (activeDaysSinceShieldUse >= 7) {
      shieldAvailable = true;
      activeDaysSinceShieldUse = 0;
    }
  }

  return {
    streak: { current, lastActiveDayKey: todayKey, shieldAvailable, activeDaysSinceShieldUse },
    incremented: true,
  };
}

module.exports = { dayKey, dayKeyDiff, initialStreakState, resolveMissedDays, recordCompletion };
