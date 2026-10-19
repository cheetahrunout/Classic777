// The contract between the page and the game server. The page sends intentions, the server answers state.
import type { Bet, Coins, LineResult, Multiplier, Sym } from './game.ts';

export type GameStatus = 'open' | 'demo' | 'maintenance' | 'closed' | 'offline';

/** What the page needs to draw the machine; pushed on every control change. */
export interface View {
  status: GameStatus;
  reason: string;
  demo: boolean;
  /** Euro cents per coin, the admin's `coin_cents` setting. */
  coinCents: number;
  /** Bets (in coins, at 1x) that fit the casino's current limits. */
  coinsAllowed: Coins[];
  /** Every coins x multiplier bet that fits the casino's current limits. */
  betsAllowed: Bet[];
  /** Micro-euro per token, for the euro value of a token balance. */
  rateMicro: number | null;
}

export interface PlayerView {
  username: string;
  tokensMicro: number;
  tokensValueCents: number;
}

export interface SeatAnswer {
  seat: string;
  player: PlayerView;
  view: View;
}

export interface SpinAnswer {
  stops: number[];
  line: Sym[];
  result: LineResult | null;
  coins: Coins;
  multiplier: Multiplier;
  betCents: number;
  /** Coins won: the pay table times the multiplier. */
  winCoins: number;
  /** Euro cents the casino confirmed; 0 until it did. */
  winCents: number;
  /** The settle has not been confirmed yet; the server keeps retrying it. */
  pending: boolean;
  /** The casino refunded the stake instead (the game was offline or closed meanwhile). */
  refunded: boolean;
  player: PlayerView | null;
}

/** Every error answer: `lobby` means the seat is gone and the page should go back for a new token. */
export interface ErrorAnswer {
  error: string;
  message: string;
  lobby?: boolean;
}

/** What a player reads when there is nothing to play. */
export function statusMessage(status: GameStatus, reason: string): string {
  const why = reason ? `: ${reason}` : '';
  switch (status) {
    case 'maintenance': return `Maintenance${why}. No new spins for now.`;
    case 'closed': return `Classic 777 is closed${why}.`;
    case 'offline': return 'The casino cannot be reached. No new spins until it answers again.';
    default: return '';
  }
}
