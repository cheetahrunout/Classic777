import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { coinsAllowed, coinCentsFrom, pull } from '../src/game.ts';
import { simulate } from '../src/rtp-sim.ts';
import { STRIP_LENGTH } from '@classic777/shared';

const manifest = JSON.parse(readFileSync(new URL('../../../casino-game.json', import.meta.url), 'utf8'));
const limits = {
  min_bet_cents: 5, max_bet_cents: 300, max_win_cents: 150000, min_bet_micro: 0, max_bet_micro: 0, max_win_micro: 0,
};

describe('a pull', () => {
  it('takes every stop from the SDK rng', () => {
    const int = vi.fn((min: number, max: number) => max - 1);
    const p = pull({ int }, 1);
    expect(int).toHaveBeenCalledTimes(3);
    for (const call of int.mock.calls) expect(call).toEqual([0, STRIP_LENGTH]);
    expect(p.stops).toEqual([21, 21, 21]);
  });

  // The exact figure is proven by enumeration in packages/shared; this checks the real loop and rng agree.
  // The 1,500-coin jackpot makes one pull's spread wide: 400,000 pulls sit within 3 points at about 5 sigma.
  it('lands near the declared RTP over 400,000 real pulls', () => {
    const { rtp } = simulate(400_000, 1);
    expect(Math.abs(rtp * 10000 - manifest.rtp_bps)).toBeLessThan(300);
  });
});

describe('bets and limits', () => {
  it('reads the coin value from the admin settings', () => {
    expect(coinCentsFrom({ coin_cents: 20 })).toBe(20);
    expect(coinCentsFrom({ coin_cents: 7 })).toBe(10);
    expect(coinCentsFrom({})).toBe(10);
  });

  it('offers only the bets that fit min, max and the top prize', () => {
    expect(coinsAllowed(limits, 10)).toEqual([1, 2, 3]);
    expect(coinsAllowed({ ...limits, max_bet_cents: 20 }, 10)).toEqual([1, 2]);
    expect(coinsAllowed({ ...limits, min_bet_cents: 25 }, 10)).toEqual([3]);
    // 1,500 coins of € 1,00 is above a € 1.000,00 max win
    expect(coinsAllowed({ ...limits, max_win_cents: 100000 }, 100)).toEqual([1, 2]);
    expect(coinsAllowed(null, 10)).toEqual([]);
  });
});
