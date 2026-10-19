// The authoritative side of the machine: stops come from the casino SDK's CSPRNG, pays from the shared table.
import { MULTIPLIERS, STRIPS, evaluate, lineAt, maxPay, payFor, type Bet, type Coins, type LineResult, type Multiplier, type Sym } from '@classic777/shared';
import type { CasinoLimits } from './casino/casino-game.js';

export interface Rng {
  int(min: number, maxExclusive: number): number;
}

export interface Pull {
  stops: number[];
  line: Sym[];
  result: LineResult | null;
  winCoins: number;
}

export function pull(rng: Rng, coins: Coins, multiplier: Multiplier = 1): Pull {
  const stops = STRIPS.map(strip => rng.int(0, strip.length));
  const line = lineAt(stops);
  const result = evaluate(line);
  return { stops, line, result, winCoins: payFor(result, coins, multiplier) };
}

export const COIN_OPTIONS = [5, 10, 20, 50, 100] as const;
export const DEFAULT_COIN_CENTS = 10;

export function coinCentsFrom(settings: Record<string, unknown>): number {
  const v = Number(settings.coin_cents);
  return (COIN_OPTIONS as readonly number[]).includes(v) ? v : DEFAULT_COIN_CENTS;
}

/** The bets that fit the admin's limits: the stake within min and max, the top prize within the max win. */
export function betsAllowed(limits: CasinoLimits | null, coinCents: number): Bet[] {
  if (!limits) return [];
  return MULTIPLIERS.flatMap(multiplier => ([1, 2, 3] as Coins[])
    .filter(coins => {
      const bet = coins * multiplier * coinCents;
      return bet >= limits.min_bet_cents && bet <= limits.max_bet_cents
        && maxPay(coins, multiplier) * coinCents <= limits.max_win_cents;
    })
    .map(coins => ({ coins, multiplier })));
}

/** The bets at 1x, in coins. */
export function coinsAllowed(limits: CasinoLimits | null, coinCents: number): Coins[] {
  return betsAllowed(limits, coinCents).filter(b => b.multiplier === 1).map(b => b.coins);
}
