'use strict';
// Rough RTP check. Run: node apps/server/src/rtp-sim.js
// Original credit pays are large relative to symbol frequency; scale and verify before live.
const crypto = require('crypto');
const { spin, payoutFor } = require('./game-logic');
const rng = { int: (a, b) => crypto.randomInt(a, b) };

const N = 200000;
let betUnits = 0, winUnits = 0;
for (let i = 0; i < N; i++) {
  const r = spin(rng);
  const credits = payoutFor(r.result, 1);
  betUnits += 100;
  winUnits += credits;
}
const rtp = (winUnits / betUnits) * 100;
console.log(JSON.stringify({ spins: N, rtp_pct: Number(rtp.toFixed(2)), target: 96 }));
process.exit(rtp > 0 ? 0 : 1);
