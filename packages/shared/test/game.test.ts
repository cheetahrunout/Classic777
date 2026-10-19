import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PAYTABLE, STRIPS, STRIP_LENGTH, betCoins, evaluate, exactRtp, maxPay, payFor, type Coins } from '../src/index.ts';

const manifest = JSON.parse(readFileSync(new URL('../../../casino-game.json', import.meta.url), 'utf8'));

describe('reel strips', () => {
  it('are three strips of 22 with the original symbol mix', () => {
    expect(STRIPS).toHaveLength(3);
    for (const strip of STRIPS) {
      expect(strip).toHaveLength(STRIP_LENGTH);
      const count = (s: string) => strip.filter(x => x === s).length;
      expect([count('SEVEN'), count('BAR3'), count('BAR2'), count('BAR1'), count('BELL'), count('CHERRY'), count('BLANK')])
        .toEqual([1, 1, 2, 3, 2, 2, 11]);
    }
  });
});

describe('evaluate', () => {
  it.each([
    [['SEVEN', 'SEVEN', 'SEVEN'], 'SEVEN'],
    [['BAR3', 'BAR3', 'BAR3'], 'BAR3'],
    [['BAR1', 'BAR3', 'BAR2'], 'ANYBAR'],
    [['CHERRY', 'CHERRY', 'CHERRY'], 'CHERRY3'],
    [['CHERRY', 'BLANK', 'CHERRY'], 'CHERRY2'],
    [['BELL', 'CHERRY', 'BLANK'], 'CHERRY1'],
    [['BELL', 'BELL', 'BELL'], 'BELL'],
  ] as const)('%j pays %s', (line, key) => {
    expect(evaluate(line)?.key).toBe(key);
  });

  it('pays nothing for three blanks or a mixed line', () => {
    expect(evaluate(['BLANK', 'BLANK', 'BLANK'])).toBeNull();
    expect(evaluate(['SEVEN', 'BELL', 'BAR1'])).toBeNull();
  });

  it('marks only the cherry reels for the glow', () => {
    expect(evaluate(['BLANK', 'CHERRY', 'BLANK'])?.reels).toEqual([1]);
  });

  it('pays the 3-coin jackpot bonus', () => {
    expect(payFor(evaluate(['SEVEN', 'SEVEN', 'SEVEN']), 3)).toBe(1500);
    expect(maxPay(3)).toBe(1500);
  });

  it('multiplies every pay by the coin multiplier', () => {
    expect(payFor(evaluate(['SEVEN', 'SEVEN', 'SEVEN']), 3, 10)).toBe(15000);
    expect(payFor(evaluate(['CHERRY', 'BLANK', 'BLANK']), 2, 5)).toBe(20);
    expect(payFor(null, 3, 10)).toBe(0);
    expect(maxPay(3, 10)).toBe(15000);
    expect(betCoins({ coins: 3, multiplier: 10 })).toBe(30);
  });
});

describe('return to player', () => {
  it.each([1, 2, 3] as Coins[])('at %i coin(s) sits in the slot band and within half a point of the manifest', coins => {
    const rtp = exactRtp(coins);
    expect(rtp).toBeGreaterThan(0.92);
    expect(rtp).toBeLessThan(0.97);
    expect(Math.abs(rtp * 10000 - manifest.rtp_bps)).toBeLessThan(50);
  });

  it('matches the pay table the page shows', () => {
    expect(PAYTABLE.map(p => p.key)).toEqual(['SEVEN', 'BAR3', 'BAR2', 'BAR1', 'CHERRY3', 'BELL', 'ANYBAR', 'CHERRY2', 'CHERRY1']);
  });
});
