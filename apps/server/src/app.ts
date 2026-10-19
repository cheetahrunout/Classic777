// The game server: owns seats, rounds and outcomes; the page only draws and sends intentions.
import Fastify, { type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import {
  formatEuro, statusMessage,
  type Coins, type ErrorAnswer, type GameStatus, type PlayerView, type SeatAnswer, type SpinAnswer, type View,
} from '@classic777/shared';
import { OpenSeatBody, SeatId, SpinBody } from '@classic777/shared/schemas';
import { CasinoError, type Casino, type CasinoControl, type CasinoPlayer, type CasinoRound, type WatchState } from './casino/casino-game.js';
import { coinCentsFrom, coinsAllowed, pull, type Rng } from './game.ts';

export interface AppOptions {
  casino: Casino;
  rng: Rng & { id(): string };
  version: string;
  /** CASINO_PUBLIC_URL, for sending players back to the lobby. */
  publicUrl: string;
  slug: string;
  /** The built page; null serves no files (tests). */
  staticRoot: string | null;
  logger?: boolean;
  /** How long a seat outlives its page (rule 9): a minute. */
  graceMs?: number;
  sweepMs?: number;
  /** Waits between settle attempts inside a spin request, then the round goes to the background queue. */
  settleRetryMs?: number[];
  pendingRetryMs?: number;
}

interface Seat {
  id: string;
  session: string;
  player: CasinoPlayer;
  lastSeen: number;
  /** Ended by the casino (closed state, idle, ban): kept only so the page can still show why. */
  ended: boolean;
  spinning: boolean;
  streams: Set<Send>;
  spins: Map<string, Promise<Answer>>;
}

interface PendingSettle {
  args: Parameters<Casino['settle']>[0];
  seat: string;
  since: number;
}

type Send = (event: string, data: unknown) => void;
type Answer = { code: number; body: SpinAnswer | ErrorAnswer };
type Settled = { kind: 'ok'; round: CasinoRound } | { kind: 'refunded' } | { kind: 'pending' };

const PENDING_GIVE_UP_MS = 6 * 3600 * 1000; // the casino voids rounds left open this long
const SPIN_MEMORY = 20;

export function playerView(p: CasinoPlayer): PlayerView {
  return { username: p.username, tokensMicro: p.tokens_micro, tokensValueCents: p.tokens_value_cents };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function buildApp(opts: AppOptions) {
  const { casino, rng } = opts;
  const graceMs = opts.graceMs ?? 60_000;
  const settleRetryMs = opts.settleRetryMs ?? [500, 1000, 2000, 4000];
  const pendingRetryMs = opts.pendingRetryMs ?? 30_000;

  const state: WatchState = { status: 'closed', settings: {}, limits: null };
  let control: CasinoControl | null = null;
  const seats = new Map<string, Seat>();
  const pending = new Map<string, PendingSettle>();
  let stopping = false;
  let inFlight = 0;
  let lastView = '';
  const timers: NodeJS.Timeout[] = [];
  const streamEnds = new Set<() => void>();
  const hits = new Map<string, { n: number; t: number }>();
  let stopWatch: (() => void) | null = null;

  // The SDK keeps status, settings and limits; the rate and the reason the page needs come with the same
  // control answers, so read them on the way past without touching the SDK file.
  const capture = <T>(c: T): T => {
    if (c && typeof c === 'object' && 'status' in c) {
      control = c as unknown as CasinoControl;
      setImmediate(publishView);
    }
    return c;
  };
  const sdk = { heartbeat: casino.heartbeat, control: casino.control, events: casino.events };
  casino.heartbeat = a => sdk.heartbeat(a).then(capture);
  casino.control = () => sdk.control().then(capture);
  casino.events = (handler, st) => sdk.events((type, data) => {
    handler(type, data);
    if (type === 'control' || type === 'hello') capture(data);
  }, st);

  function view(): View {
    const c = control;
    const status: GameStatus = state.status === 'offline' ? 'offline' : ((c?.status ?? state.status) as GameStatus);
    const coinCents = coinCentsFrom(c?.settings ?? state.settings);
    return {
      status,
      reason: c?.status_reason ?? '',
      demo: status === 'demo' || (!!c?.demo && status !== 'closed'),
      coinCents,
      coinsAllowed: coinsAllowed(c?.limits ?? state.limits, coinCents),
      rateMicro: c?.rate_micro ?? null,
    };
  }
  const playing = (v: View) => v.status === 'open' || v.status === 'demo';

  function publishView() {
    const v = view();
    const key = JSON.stringify(v);
    if (key === lastView) return;
    lastView = key;
    if (v.status === 'closed') {
      // The casino has refunded every open round and closed every session.
      for (const s of seats.values()) s.ended = true;
    }
    for (const s of seats.values()) {
      for (const send of s.streams) {
        send('view', v);
        if (s.ended && playing(v)) send('gone', { message: 'The machine is open again.' });
      }
    }
  }

  function activeSeats() {
    return [...seats.values()].filter(s => !s.ended);
  }

  function heartbeatExtra() {
    const active = activeSeats();
    return {
      version: opts.version,
      players: new Set(active.map(s => s.player.id)).size,
      sessions: active.map(s => s.session),
    };
  }

  function onCasinoEvent(type: string, data: { session?: string; player?: CasinoPlayer }) {
    if (type !== 'balance' || !data?.session || !data.player) return;
    for (const s of seats.values()) {
      if (s.session !== data.session) continue;
      s.player = data.player;
      for (const send of s.streams) send('player', playerView(s.player));
    }
  }

  function endSeat(s: Seat, closeAtCasino: boolean) {
    seats.delete(s.id);
    if (closeAtCasino && !s.ended) {
      casino.closeSession(s.session).catch(e => app.log.warn({ event: 'session_close_failed', error: e.message }));
    }
  }

  function sweep() {
    const now = Date.now();
    for (const [ip, h] of hits) if (now - h.t > 10_000) hits.delete(ip);
    for (const s of seats.values()) {
      if (s.streams.size === 0 && !s.spinning && now - s.lastSeen > graceMs) endSeat(s, true);
    }
  }

  function fail(code: number, error: string, message: string, extra: Partial<ErrorAnswer> = {}): Answer {
    return { code, body: { error, message, ...extra } };
  }

  /** Turns a casino refusal into an answer for the page. */
  function casinoFailure(e: unknown, seat?: Seat): Answer {
    if (!(e instanceof CasinoError)) return fail(502, 'casino_unreachable', 'The casino did not answer. Try again in a moment.');
    const data = e.data ?? {};
    if (e.status === 401) {
      if (seat) seat.ended = true;
      return fail(401, 'session_ended', 'Your seat has ended. Back to the lobby for a new one.', { lobby: true });
    }
    if (e.status === 402) return fail(402, 'insufficient_tokens', 'Not enough tokens for this bet. Top up from the casino bar.');
    if (e.status === 409 && data.sessions !== undefined) {
      return fail(409, 'seat_limit', `You already hold ${data.sessions} seats at Classic 777, the most the casino allows. Close one, then come back from the lobby.`);
    }
    if (e.status === 409 || e.status === 503) {
      const status = (data.game_status ?? (e.status === 503 ? 'maintenance' : view().status)) as GameStatus;
      return fail(409, 'not_open', statusMessage(status, '') || e.message);
    }
    return fail(e.status >= 500 ? 502 : 400, 'casino_refused', e.message);
  }

  async function refreshPlayer(seat: Seat) {
    try {
      seat.player = (await casino.session(seat.session)).player;
      for (const send of seat.streams) send('player', playerView(seat.player));
    } catch { /* the next balance event brings it */ }
  }

  async function settleWithRetry(args: PendingSettle['args'], seat: Seat): Promise<Settled> {
    for (let attempt = 0; ; attempt++) {
      try {
        return { kind: 'ok', round: await casino.settle(args) };
      } catch (e) {
        if (e instanceof CasinoError && e.status === 409 && e.data?.refunded) return { kind: 'refunded' };
        if (e instanceof CasinoError && e.status >= 400 && e.status < 500) {
          // Refused for good: give the stake back rather than leave it hanging.
          app.log.error({ event: 'settle_refused', status: e.status, error: e.message });
          await casino.voidRound({ round: args.round, reason: 'settle_refused' }).catch(() => {});
          return { kind: 'refunded' };
        }
        if (attempt >= settleRetryMs.length) {
          pending.set(args.round, { args, seat: seat.id, since: Date.now() });
          app.log.warn({ event: 'settle_pending', round: args.round });
          return { kind: 'pending' };
        }
        await sleep(settleRetryMs[attempt]);
      }
    }
  }

  async function retryPending() {
    for (const [round, p] of pending) {
      try {
        const r = await casino.settle(p.args);
        pending.delete(round);
        app.log.info({ event: 'settle_recovered', round, late: !!r.late });
        const seat = seats.get(p.seat);
        if (seat) {
          if (r.player) seat.player = r.player;
          for (const send of seat.streams) {
            send('notice', { message: `Payout confirmed: ${formatEuro(r.win_cents)}.`, winCents: r.win_cents });
            send('player', playerView(seat.player));
          }
        }
      } catch (e) {
        const refunded = e instanceof CasinoError && e.status === 409 && e.data?.refunded;
        const final = e instanceof CasinoError && e.status >= 400 && e.status < 500;
        if (refunded || final || Date.now() - p.since > PENDING_GIVE_UP_MS) {
          pending.delete(round);
          const seat = seats.get(p.seat);
          if (seat) for (const send of seat.streams) send('notice', { message: 'The casino gave your stake back for that spin.' });
        }
      }
    }
  }

  async function runSpin(seat: Seat, coins: Coins): Promise<Answer> {
    if (stopping) return fail(503, 'restarting', 'The machine is restarting. Pull again in a moment.');
    const v = view();
    if (!playing(v)) return fail(409, 'not_open', statusMessage(v.status, v.reason));
    if (!v.coinsAllowed.includes(coins)) return fail(400, 'bet_not_allowed', 'That bet is outside the casino limits.');
    if (seat.spinning) return fail(429, 'busy', 'The reels are still spinning.');

    const betCents = coins * v.coinCents;
    const round = rng.id();
    seat.spinning = true;
    inFlight++;
    try {
      try {
        const opened = await casino.openRound({
          session: seat.session, round, hand: round, betCents, meta: { coins, coin_cents: v.coinCents },
        });
        if (opened.player) seat.player = opened.player;
      } catch (e) {
        // A lost answer may still have debited the player: void the round to be sure.
        if (!(e instanceof CasinoError) || e.status >= 500) {
          casino.voidRound({ round, reason: 'open_unconfirmed' }).catch(() => {});
        }
        return casinoFailure(e, seat);
      }

      const p = pull(rng, coins);
      const settled = await settleWithRetry({
        round,
        winCents: p.winCoins * v.coinCents,
        outcome: p.result ? p.result.key : 'lose',
        meta: { stops: p.stops, line: p.line, coins, win_coins: p.winCoins },
      }, seat);

      if (settled.kind === 'ok' && settled.round.player) seat.player = settled.round.player;
      else await refreshPlayer(seat);
      app.log.info({ event: 'spin', coins, bet_cents: betCents, outcome: p.result?.key ?? 'lose', settle: settled.kind });

      const body: SpinAnswer = {
        stops: p.stops,
        line: p.line,
        result: p.result,
        coins,
        betCents,
        winCoins: p.winCoins,
        winCents: settled.kind === 'ok' ? settled.round.win_cents : 0,
        pending: settled.kind === 'pending',
        refunded: settled.kind === 'refunded',
        player: playerView(seat.player),
      };
      for (const send of seat.streams) send('player', body.player);
      return { code: 200, body };
    } finally {
      seat.spinning = false;
      inFlight--;
    }
  }

  // A small per-address limit on actions; a pull takes seconds, so honest pages never meet it.
  function limited(ip: string): boolean {
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || now - h.t > 10_000) { hits.set(ip, { n: 1, t: now }); return false; }
    return ++h.n > 120;
  }

  const app = Fastify({
    logger: opts.logger === false ? false : {
      // Never log a handoff token, a seat or a casino session: drop query strings.
      serializers: { req: req => ({ method: req.method, url: req.url.split('?')[0] }) },
    },
    trustProxy: true,
  });

  const CSP = [
    "default-src 'self'",
    "script-src 'self' https://casino.grovestreet.zip",
    "frame-src https://casino.grovestreet.zip",
    "style-src 'self' 'unsafe-inline' https://casino.grovestreet.zip https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    "img-src 'self' data:",
    "connect-src 'self'",
  ].join('; ');

  app.addHook('onSend', async (_req, reply) => {
    reply.header('content-security-policy', CSP);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
  });

  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'POST' && limited(req.ip)) {
      return reply.code(429).send({ error: 'rate_limited', message: 'Easy on the handle. Try again in a moment.' });
    }
  });

  if (opts.staticRoot) {
    app.register(fastifyStatic, {
      root: opts.staticRoot,
      setHeaders(res, file) {
        res.setHeader('cache-control', file.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
  }

  app.get('/health', async () => ({ ok: true, version: opts.version, status: view().status }));

  // Players without a seat go back through the casino, which logs them in and hands out a fresh token.
  app.get('/lobby', async (_req, reply) => reply.redirect(`${opts.publicUrl.replace(/\/+$/, '')}/play/${opts.slug}`));

  const send = (reply: FastifyReply, a: Answer) => reply.code(a.code).send(a.body);

  app.post('/api/seat', async (req, reply) => {
    const body = OpenSeatBody.safeParse(req.body);
    if (!body.success) return send(reply, fail(400, 'bad_request', 'Bad request.'));
    const v = view();
    if (!playing(v)) return send(reply, fail(409, 'not_open', statusMessage(v.status, v.reason)));

    let opened;
    try {
      opened = await casino.openSession(body.data.token);
    } catch (e) {
      return send(reply, casinoFailure(e));
    }
    // A known seat back with a new token: free the old casino session first.
    const old = body.data.seat ? seats.get(body.data.seat) : undefined;
    if (old && old.player.id === opened.player.id) {
      for (const s of old.streams) s('gone', { message: 'This seat was replaced.' });
      endSeat(old, true);
    }
    const seat: Seat = {
      id: rng.id(), session: opened.session, player: opened.player, lastSeen: Date.now(),
      ended: false, spinning: false, streams: new Set(), spins: new Map(),
    };
    seats.set(seat.id, seat);
    app.log.info({ event: 'seat_open', sessions: opened.sessions });
    const answer: SeatAnswer = { seat: seat.id, player: playerView(seat.player), view: view() };
    return answer;
  });

  function seatFrom(raw: unknown): Seat | Answer {
    const id = SeatId.safeParse(raw);
    const seat = id.success ? seats.get(id.data) : undefined;
    if (!seat || seat.ended) {
      return fail(401, 'no_seat', 'This seat is gone. Back to the lobby for a new one.', { lobby: true });
    }
    seat.lastSeen = Date.now();
    return seat;
  }
  const isAnswer = (x: Seat | Answer): x is Answer => 'code' in x;

  app.get<{ Params: { seat: string } }>('/api/seat/:seat', async (req, reply) => {
    const seat = seatFrom(req.params.seat);
    if (isAnswer(seat)) return send(reply, seat);
    try {
      seat.player = (await casino.session(seat.session)).player;
    } catch (e) {
      if (e instanceof CasinoError && e.status === 401) return send(reply, casinoFailure(e, seat));
    }
    const answer: SeatAnswer = { seat: seat.id, player: playerView(seat.player), view: view() };
    return answer;
  });

  app.post('/api/spin', async (req, reply) => {
    const body = SpinBody.safeParse(req.body);
    if (!body.success) return send(reply, fail(400, 'bad_request', 'Bad request.'));
    const seat = seatFrom(body.data.seat);
    if (isAnswer(seat)) return send(reply, seat);

    // The same pull sent twice (a retry after a network hiccup) gets the same answer.
    let answer = seat.spins.get(body.data.spin);
    if (!answer) {
      answer = runSpin(seat, body.data.coins);
      seat.spins.set(body.data.spin, answer);
      if (seat.spins.size > SPIN_MEMORY) seat.spins.delete(seat.spins.keys().next().value!);
    }
    return send(reply, await answer);
  });

  // Server-Sent Events to the page: the control view, the player's balance, notices.
  app.get<{ Querystring: { seat?: string } }>('/api/events', (req, reply) => {
    const id = SeatId.safeParse(req.query.seat);
    const seat = id.success ? seats.get(id.data) : undefined;
    if (!seat) return send(reply, fail(401, 'no_seat', 'This seat is gone.', { lobby: true }));
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const push: Send = (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    push('view', view());
    push('player', playerView(seat.player));
    if (seat.ended && playing(view())) push('gone', { message: 'Back to the lobby for a new seat.' });
    seat.streams.add(push);
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
    const end = () => { closeStream(); res.end(); };
    const closeStream = () => {
      clearInterval(keepAlive);
      seat.streams.delete(push);
      streamEnds.delete(end);
      seat.lastSeen = Date.now();
    };
    req.raw.on('close', closeStream);
    streamEnds.add(end);
  });

  async function start(port: number, host = '0.0.0.0') {
    stopWatch = casino.watch(state, heartbeatExtra, onCasinoEvent);
    timers.push(setInterval(sweep, opts.sweepMs ?? 15_000));
    timers.push(setInterval(publishView, 5_000)); // the SDK flips to offline on its own clock
    timers.push(setInterval(() => { void retryPending(); }, pendingRetryMs));
    await app.listen({ port, host });
    app.log.info({ event: 'listen', port, version: opts.version });
  }

  /** SIGTERM: no new rounds, let the ones in flight settle, stop the watch, then close. */
  async function stop() {
    stopping = true;
    const t0 = Date.now();
    while (inFlight > 0 && Date.now() - t0 < 15_000) await sleep(50);
    await retryPending();
    stopWatch?.();
    timers.forEach(clearInterval);
    for (const end of streamEnds) end();
    await app.close();
  }

  return { app, start, stop, seats, pending, view, heartbeatExtra, sweep, retryPending };
}
