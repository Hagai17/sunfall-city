// A tiny seeded random generator (splitmix32 style): the same seed always grows the
// same city and stages the same screenshot scenes, which is what makes the shots in
// shots.json repeatable. Two helpers ride along: range() and pick().

export function createRandom(seed) {
  let state = (seed | 0) || 1;
  function random() {
    state = (state + 0x9e3779b9) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    t = t ^ (t >>> 15);
    return ((t >>> 0) / 4294967296);
  }
  /** A float in [min, max). */
  random.range = function range(min, max) {
    return min + random() * (max - min);
  };
  /** An integer in [min, max], both ends included. */
  random.int = function int(min, max) {
    return min + Math.floor(random() * (max - min + 1));
  };
  /** One element of a non-empty array. */
  random.pick = function pick(list) {
    return list[Math.floor(random() * list.length)];
  };
  /** True with probability p. */
  random.chance = function chance(p) {
    return random() < p;
  };
  return random;
}

/** Clamp a number into [min, max]. */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation between a and b by t in [0, 1]. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** The shortest signed turn from angle `from` to angle `to`, in radians. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turn `angle` toward `target` by at most `maxStep` radians. */
export function turnToward(angle, target, maxStep) {
  const d = angleDelta(angle, target);
  if (Math.abs(d) <= maxStep) return target;
  return angle + Math.sign(d) * maxStep;
}

/** Distance between two points. */
export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}
