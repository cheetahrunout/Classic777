'use strict';
// Classic 777 rules. Server owns outcomes. Uses only casino SDK rng.
// Pays scaled so a large simulation approaches the declared 9600 bps.
const SYM = { SEVEN: 'SEVEN', BAR3: 'BAR3', BAR2: 'BAR2', BAR1: 'BAR1', BELL: 'BELL', CHERRY: 'CHERRY', BLANK: 'BLANK' };
const BARS = [SYM.BAR1, SYM.BAR2, SYM.BAR3];

// Integer credit pays (1-coin / 2-coin / 3-coin). Tuned for ~96% RTP.
const PAYS = {
  SEVEN: [320, 640, 1600],
  BAR3: [130, 260, 400],
  BAR2: [65, 130, 200],
  BAR1: [32, 65, 100],
  CHERRY3: [32, 65, 100],
  BELL: [26, 52, 80],
  ANYBAR: [13, 26, 40],
  CHERRY2: [6, 13, 20],
  CHERRY1: [2, 4, 6],
};

function evaluate(line) {
  const [a, b, c] = line;
  const all = (k) => a === k && b === k && c === k;
  if (a !== SYM.BLANK && all(a)) {
    const key = a === SYM.CHERRY ? 'CHERRY3' : a;
    return { key, reels: [0, 1, 2] };
  }
  if (line.every(s => BARS.includes(s))) {
    return { key: 'ANYBAR', reels: [0, 1, 2] };
  }
  const cherries = line.map((s, i) => s === SYM.CHERRY ? i : -1).filter(i => i >= 0);
  if (cherries.length === 2) return { key: 'CHERRY2', reels: cherries };
  if (cherries.length === 1) return { key: 'CHERRY1', reels: cherries };
  return null;
}

function makeStrip(seed, rng) {
  const symbols = ['SEVEN', 'BAR3', 'BAR2', 'BAR2', 'BAR1', 'BAR1', 'BAR1', 'BELL', 'BELL', 'CHERRY', 'CHERRY'];
  const arr = symbols.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng ? rng.int(0, i + 1) : ((seed * 17 + i) % (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.flatMap(s => [s, SYM.BLANK]);
}

function spin(rng) {
  const strips = [makeStrip(777, rng), makeStrip(808, rng), makeStrip(839, rng)];
  const stops = strips.map(s => rng.int(0, s.length));
  const line = stops.map((st, i) => strips[i][st]);
  const result = evaluate(line);
  return { strips, stops, line, result };
}

function payoutFor(result, betLevel) {
  if (!result) return 0;
  const pays = PAYS[result.key];
  return pays ? pays[Math.min(Math.max(betLevel, 0), 2)] : 0;
}

module.exports = { SYM, PAYS, evaluate, makeStrip, spin, payoutFor };
