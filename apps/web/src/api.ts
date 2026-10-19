// The page's only line out: our own server. Never the casino, never a key.
import type { Coins, ErrorAnswer, PlayerView, SeatAnswer, SpinAnswer, View } from '@classic777/shared';

export class ApiError extends Error {
  constructor(public status: number, public body: ErrorAnswer) {
    super(body.message || body.error);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({ error: 'bad_answer', message: 'The machine did not answer.' }));
  if (!r.ok) throw new ApiError(r.status, data as ErrorAnswer);
  return data as T;
}

export const openSeat = (token: string, seat?: string) => call<SeatAnswer>('POST', '/api/seat', { token, seat });
export const getSeat = (seat: string) => call<SeatAnswer>('GET', `/api/seat/${encodeURIComponent(seat)}`);
export const spin = (seat: string, coins: Coins, id: string) => call<SpinAnswer>('POST', '/api/spin', { seat, coins, spin: id });

/** Back through the casino for a fresh handoff token. */
export function toLobby() {
  location.href = '/lobby';
}

export interface StreamHandlers {
  view(v: View): void;
  player(p: PlayerView): void;
  notice(message: string): void;
  gone(message: string): void;
}

export function listen(seat: string, h: StreamHandlers): () => void {
  const es = new EventSource(`/api/events?seat=${encodeURIComponent(seat)}`);
  const on = <T>(name: string, fn: (d: T) => void) =>
    es.addEventListener(name, e => fn(JSON.parse((e as MessageEvent).data) as T));
  on<View>('view', h.view);
  on<PlayerView>('player', h.player);
  on<{ message: string }>('notice', d => h.notice(d.message));
  on<{ message: string }>('gone', d => { es.close(); h.gone(d.message); });
  return () => es.close();
}

/*
 * The seat lives per tab (rule 9): sessionStorage, which a duplicated tab copies. Before using a stored
 * seat, ask the other tabs whether one of them already holds it; if so this tab needs a seat of its own.
 */
const SEAT_KEY = 'classic777.seat';
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('classic777-seats');
let mySeat: string | null = null;
channel?.addEventListener('message', e => {
  if (mySeat && e.data?.ask === mySeat) channel.postMessage({ mine: mySeat });
});

export function rememberSeat(seat: string | null) {
  mySeat = seat;
  try {
    if (seat) sessionStorage.setItem(SEAT_KEY, seat);
    else sessionStorage.removeItem(SEAT_KEY);
  } catch { /* storage blocked: the seat lives in memory only */ }
}

export async function storedSeat(): Promise<string | null> {
  let seat: string | null = null;
  try { seat = sessionStorage.getItem(SEAT_KEY); } catch { /* blocked */ }
  if (!seat || !channel) return seat;
  const taken = await new Promise<boolean>(resolve => {
    const onMsg = (e: MessageEvent) => { if (e.data?.mine === seat) done(true); };
    const done = (v: boolean) => { channel.removeEventListener('message', onMsg); clearTimeout(t); resolve(v); };
    const t = setTimeout(() => done(false), 200);
    channel.addEventListener('message', onMsg);
    channel.postMessage({ ask: seat });
  });
  return taken ? null : seat;
}
