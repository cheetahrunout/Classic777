// The odds check of section 12: simulate the real game loop with the SDK rng and compare with the exact figure.
// pnpm rtp
import { exactRtp, type Coins } from '@classic777/shared';
import { rng } from './casino/casino-game.js';
import { pull } from './game.ts';

export function simulate(n: number, coins: Coins) {
  let paid = 0;
  for (let i = 0; i < n; i++) paid += pull(rng, coins).winCoins;
  return { pulls: n, coins, rtp: paid / (n * coins), exact: exactRtp(coins) };
}

if (process.argv[1]?.endsWith('rtp-sim.ts')) {
  for (const coins of [1, 2, 3] as Coins[]) {
    const r = simulate(100_000, coins);
    console.log(JSON.stringify({ ...r, rtp: +(r.rtp * 100).toFixed(2), exact: +(r.exact * 100).toFixed(2) }));
  }
}
