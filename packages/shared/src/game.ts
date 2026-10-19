// Classic 777 rules shared by the server (which decides) and the page (which only draws).

export const SYMBOLS = ['SEVEN', 'BAR3', 'BAR2', 'BAR1', 'BELL', 'CHERRY', 'BLANK'] as const;
export type Sym = (typeof SYMBOLS)[number];

const BARS: readonly Sym[] = ['BAR1', 'BAR2', 'BAR3'];

// The original machine's fixed reel orders; every symbol is followed by a blank.
const ORDERS: readonly (readonly Sym[])[] = [
  ['CHERRY', 'BAR2', 'BAR1', 'BAR1', 'BELL', 'BAR2', 'BAR1', 'CHERRY', 'BAR3', 'SEVEN', 'BELL'],
  ['BAR1', 'CHERRY', 'BAR2', 'BAR1', 'BAR1', 'BAR3', 'SEVEN', 'BAR2', 'CHERRY', 'BELL', 'BELL'],
  ['BAR2', 'BELL', 'BELL', 'BAR3', 'BAR2', 'CHERRY', 'BAR1', 'SEVEN', 'BAR1', 'BAR1', 'CHERRY'],
];

export const STRIPS: readonly (readonly Sym[])[] = ORDERS.map(order => order.flatMap((s): Sym[] => [s, 'BLANK']));
export const STRIP_LENGTH = 22;

export const MAX_COINS = 3;
export type Coins = 1 | 2 | 3;

export type PayKey = 'SEVEN' | 'BAR3' | 'BAR2' | 'BAR1' | 'CHERRY3' | 'BELL' | 'ANYBAR' | 'CHERRY2' | 'CHERRY1';

export interface PayRow {
  key: PayKey;
  icons: Sym[];
  label: string;
  /** Coins paid for a bet of 1, 2 and 3 coins. The 3-coin 777 is the bonus jackpot. */
  pays: [number, number, number];
}

// The original pay table with "any bar" raised from 10/20/30, which takes it from 92.7% to 96.1-96.3%.
export const PAYTABLE: readonly PayRow[] = [
  { key: 'SEVEN', icons: ['SEVEN', 'SEVEN', 'SEVEN'], pays: [300, 600, 1500], label: '' },
  { key: 'BAR3', icons: ['BAR3', 'BAR3', 'BAR3'], pays: [100, 200, 300], label: '' },
  { key: 'BAR2', icons: ['BAR2', 'BAR2', 'BAR2'], pays: [50, 100, 150], label: '' },
  { key: 'BAR1', icons: ['BAR1', 'BAR1', 'BAR1'], pays: [25, 50, 75], label: '' },
  { key: 'CHERRY3', icons: ['CHERRY', 'CHERRY', 'CHERRY'], pays: [25, 50, 75], label: '' },
  { key: 'BELL', icons: ['BELL', 'BELL', 'BELL'], pays: [20, 40, 60], label: '' },
  { key: 'ANYBAR', icons: ['BAR1', 'BAR2', 'BAR3'], pays: [12, 24, 33], label: 'Any' },
  { key: 'CHERRY2', icons: ['CHERRY', 'CHERRY'], pays: [6, 12, 18], label: 'Any 2' },
  { key: 'CHERRY1', icons: ['CHERRY'], pays: [2, 4, 6], label: 'Any 1' },
];

const PAY_BY_KEY = new Map(PAYTABLE.map(p => [p.key, p]));

export interface LineResult {
  key: PayKey;
  /** Reels that take part in the win, for the glow. */
  reels: number[];
}

export function evaluate(line: readonly Sym[]): LineResult | null {
  const [a, b, c] = line;
  if (a !== 'BLANK' && a === b && b === c) {
    return { key: a === 'CHERRY' ? 'CHERRY3' : (a as PayKey), reels: [0, 1, 2] };
  }
  if (line.every(s => BARS.includes(s))) return { key: 'ANYBAR', reels: [0, 1, 2] };
  const cherries = line.flatMap((s, i) => (s === 'CHERRY' ? [i] : []));
  if (cherries.length === 2) return { key: 'CHERRY2', reels: cherries };
  if (cherries.length === 1) return { key: 'CHERRY1', reels: cherries };
  return null;
}

export function lineAt(stops: readonly number[]): Sym[] {
  return stops.map((stop, i) => STRIPS[i][stop]);
}

/** Coins paid for a result at a bet of `coins` coins. */
export function payFor(result: LineResult | null, coins: Coins): number {
  if (!result) return 0;
  return PAY_BY_KEY.get(result.key)!.pays[coins - 1];
}

export function maxPay(coins: Coins): number {
  return Math.max(...PAYTABLE.map(p => p.pays[coins - 1]));
}

/** Exact return to player for a bet of `coins`, by enumerating every stop combination. */
export function exactRtp(coins: Coins): number {
  let paid = 0;
  for (let a = 0; a < STRIP_LENGTH; a++) {
    for (let b = 0; b < STRIP_LENGTH; b++) {
      for (let c = 0; c < STRIP_LENGTH; c++) paid += payFor(evaluate(lineAt([a, b, c])), coins);
    }
  }
  return paid / (STRIP_LENGTH ** 3 * coins);
}
