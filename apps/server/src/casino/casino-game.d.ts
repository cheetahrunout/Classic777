// Types for casino-game.js. Written against the SDK as shipped here because the casino's own
// casino-game.d.ts could not be fetched; replace with the casino's copy when it is at hand.

export interface CasinoPlayer {
  id: string;
  username: string;
  tokens_micro: number;
  tokens_value_cents: number;
  bankruptcies?: number;
}

export interface CasinoLimits {
  min_bet_cents: number;
  max_bet_cents: number;
  max_win_cents: number;
  min_bet_micro: number;
  max_bet_micro: number;
  max_win_micro: number;
  sessions_per_player?: number;
}

export interface CasinoControl {
  status: 'open' | 'demo' | 'maintenance' | 'closed';
  status_reason?: string;
  demo?: boolean;
  currency?: string;
  unit?: unknown;
  settings?: Record<string, unknown>;
  limits?: CasinoLimits;
  rate_micro?: number;
  rtp_bps?: number;
  multiplayer?: unknown;
  seats?: number;
  server_time?: string;
}

export interface CasinoSession {
  session: string;
  table: string | null;
  player: CasinoPlayer;
  expires_ts?: string;
  sessions?: number;
  demo?: boolean;
  demo_grant?: unknown;
}

export interface CasinoRound {
  round: string;
  status: 'open' | 'settled' | 'void';
  bet_cents: number;
  bet_micro: number;
  win_cents: number;
  win_micro: number;
  rate_micro: number;
  outcome?: string | null;
  table?: string | null;
  hand?: string | null;
  player?: CasinoPlayer;
  replay?: boolean;
  late?: boolean;
  refunded?: boolean;
}

export interface WatchState {
  status: string;
  settings: Record<string, unknown>;
  limits: CasinoLimits | null;
  rtp_bps?: number;
  demo?: boolean;
  link?: 'up' | 'down';
  link_ts?: number;
  updated?: number;
}

export interface HeartbeatExtra {
  version?: string;
  players?: number;
  sessions?: string[];
  tables?: unknown[];
}

export declare class CasinoError extends Error {
  constructor(msg: string, status: number, data?: unknown);
  status: number;
  data: any;
}

export interface Casino {
  openSession(token: string): Promise<CasinoSession>;
  session(id: string): Promise<CasinoSession>;
  closeSession(id: string): Promise<{ closed: boolean }>;
  openRound(a: {
    session: string; round: string; table?: string; hand?: string; meta?: unknown;
    betCents?: number; betMicro?: number; betTokens?: number | string;
  }): Promise<CasinoRound>;
  settle(a: {
    round: string; outcome?: string; meta?: unknown;
    winCents?: number; winMicro?: number; winTokens?: number | string;
  }): Promise<CasinoRound>;
  voidRound(a: { round: string; reason: string }): Promise<CasinoRound>;
  table(a: { table: string; seatsMax: number; seatsUsed: number; status: string; players: string[]; meta?: unknown }): Promise<unknown>;
  heartbeat(a: HeartbeatExtra): Promise<CasinoControl>;
  control(): Promise<CasinoControl>;
  score(a: { session: string; score: number; meta?: unknown }): Promise<unknown>;
  events(handler: (type: string, data: any) => void, state?: { stop: boolean }): () => void;
  watch(state: WatchState, extra: HeartbeatExtra | (() => HeartbeatExtra), onEvent?: (type: string, data: any) => void): () => void;
  url: string;
  CasinoError: typeof CasinoError;
}

export declare function createCasino(opts: { url?: string; key?: string; timeoutMs?: number }): Casino;

export declare const rng: {
  int(min: number, maxExclusive: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  weighted<T>(table: readonly [T, number][]): T;
  id(): string;
};

export declare function expectedRtp(outcomes: { p: number; payout: number }[]): number;
