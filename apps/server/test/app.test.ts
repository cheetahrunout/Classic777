// The round lifecycle against a stub casino over HTTP, through the real SDK.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCasino, rng } from '../src/casino/casino-game.js';
import { buildApp } from '../src/app.ts';
import { createStubCasino, type StubCasino } from '../../../e2e/stub-casino.mjs';

let stub: StubCasino;
let stubUrl: string;
let game: ReturnType<typeof buildApp>;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(cond: () => boolean | Promise<boolean>, ms = 3000) {
  const t0 = Date.now();
  while (!(await cond())) {
    if (Date.now() - t0 > ms) throw new Error('timed out');
    await sleep(10);
  }
}

async function token(username = 'tester', tokens_micro = 50_000_000): Promise<string> {
  const r = await fetch(`${stubUrl}/test/token`, { method: 'POST', body: JSON.stringify({ username, tokens_micro }) });
  return ((await r.json()) as { token: string }).token;
}

async function setControl(patch: object) {
  await fetch(`${stubUrl}/test/control`, { method: 'POST', body: JSON.stringify(patch) });
  await until(async () => (await game.app.inject('/health')).json().status === (patch as { status?: string }).status || !('status' in patch));
}

async function seat(username?: string, prior?: string, tokensMicro?: number) {
  const r = await game.app.inject({ method: 'POST', url: '/api/seat', payload: { token: await token(username, tokensMicro), seat: prior } });
  return { code: r.statusCode, body: r.json() };
}

async function spin(seatId: string, coins = 1, id: string = rng.id(), multiplier?: number) {
  const r = await game.app.inject({ method: 'POST', url: '/api/spin', payload: { seat: seatId, coins, multiplier, spin: id } });
  return { code: r.statusCode, body: r.json() };
}

beforeEach(async () => {
  stub = createStubCasino({ key: 'k' });
  stubUrl = await stub.listen();
  game = buildApp({
    casino: createCasino({ url: stubUrl, key: 'k' }),
    rng,
    version: '1.0.42',
    publicUrl: 'https://casino.example',
    slug: 'classic777',
    staticRoot: null,
    logger: false,
    graceMs: 50,
    sweepMs: 20,
    settleRetryMs: [5, 5],
    pendingRetryMs: 60_000,
  });
  await game.start(0, '127.0.0.1');
  await until(async () => (await game.app.inject('/health')).json().status === 'open');
});

afterEach(async () => {
  await game.stop();
  await stub.close();
});

describe('health and lobby', () => {
  it('answers /health with the version and the control state', async () => {
    expect((await game.app.inject('/health')).json()).toEqual({ ok: true, version: '1.0.42', status: 'open' });
  });

  it('sends a visitor without a seat back to the casino', async () => {
    const r = await game.app.inject('/lobby');
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('https://casino.example/play/classic777');
  });

  it('serves the page with a CSP that allows the casino bar', async () => {
    const r = await game.app.inject('/health');
    expect(r.headers['content-security-policy']).toContain('frame-src https://casino.grovestreet.zip');
  });
});

describe('the handoff', () => {
  it('opens a seat and never hands the casino session to the page', async () => {
    const { code, body } = await seat();
    expect(code).toBe(200);
    expect(body.seat).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(body)).not.toContain('gs_');
    expect(body.player).toEqual({ username: 'tester', tokensMicro: 50_000_000, tokensValueCents: 5332 });
    expect(body.view).toMatchObject({ status: 'open', coinCents: 10, coinsAllowed: [1, 2, 3], rateMicro: 1_066_400 });
  });

  it('refuses a used token and points to the lobby', async () => {
    const t = await token();
    await game.app.inject({ method: 'POST', url: '/api/seat', payload: { token: t } });
    const r = await game.app.inject({ method: 'POST', url: '/api/seat', payload: { token: t } });
    expect(r.statusCode).toBe(401);
    expect(r.json().lobby).toBe(true);
  });

  it('closes the old casino session when a known seat comes back with a new token', async () => {
    const first = (await seat()).body.seat;
    const again = await seat('tester', first);
    expect(again.code).toBe(200);
    expect(again.body.seat).not.toBe(first);
    await until(() => [...stub.sessions.values()].filter(s => s.open).length === 1);
    expect((await spin(first)).code).toBe(401);
  });

  it('shows the seat cap the casino enforces', async () => {
    stub.control.limits.sessions_per_player = 1;
    await seat();
    const { code, body } = await seat();
    expect(code).toBe(409);
    expect(body.error).toBe('seat_limit');
  });
});

describe('a spin', () => {
  it('opens a round, settles what the stops pay and moves the balance', async () => {
    const s = (await seat()).body.seat;
    const { code, body } = await spin(s, 3);
    expect(code).toBe(200);
    expect(body.betCents).toBe(30);
    expect(body.stops).toHaveLength(3);
    expect(body.winCents).toBe(body.winCoins * 10);
    const [round] = [...stub.rounds.values()];
    expect(round).toMatchObject({ status: 'settled', bet_cents: 30, win_cents: body.winCents });
    const bet = Math.floor(30 * 1e10 / 1_066_400);
    const win = Math.floor(body.winCents * 1e10 / 1_066_400);
    expect(body.player.tokensMicro).toBe(50_000_000 - bet + win);
  });

  it('stakes coins x multiplier and pays the multiplied table', async () => {
    const s = (await seat()).body.seat;
    const { code, body } = await spin(s, 3, rng.id(), 10);
    expect(code).toBe(200);
    expect(body).toMatchObject({ coins: 3, multiplier: 10, betCents: 300 });
    expect(body.winCents).toBe(body.winCoins * 10);
    expect(body.winCoins % 10).toBe(0);
    const [round] = [...stub.rounds.values()];
    expect(round).toMatchObject({ status: 'settled', bet_cents: 300, win_cents: body.winCents });
  });

  it('refuses a multiplied bet above the max bet', async () => {
    const s = (await seat()).body.seat;
    stub.control.limits.max_bet_cents = 150;
    await setControl({});
    // € 1,50 max: 1-3 coins at 1x and 5x, only 1 coin at 10x
    await until(async () => (await game.app.inject(`/api/seat/${s}`)).json().view.betsAllowed.length === 7);
    expect((await spin(s, 2, rng.id(), 10)).body.error).toBe('bet_not_allowed');
    expect((await spin(s, 3, rng.id(), 5)).code).toBe(200);
  });

  it('answers a repeated pull once: one round, the same result', async () => {
    const s = (await seat()).body.seat;
    const id = rng.id();
    const [a, b] = await Promise.all([spin(s, 1, id), spin(s, 1, id)]);
    expect(a.body).toEqual(b.body);
    expect(stub.rounds.size).toBe(1);
  });

  it('refuses a bet outside the limits', async () => {
    const s = (await seat()).body.seat;
    stub.control.limits.max_bet_cents = 20;
    await setControl({});
    await until(async () => (await game.app.inject(`/api/seat/${s}`)).json().view.coinsAllowed.length === 2);
    expect((await spin(s, 3)).body.error).toBe('bet_not_allowed');
    expect(stub.rounds.size).toBe(0);
  });

  it('says so when the player cannot afford the bet', async () => {
    const s = (await seat('broke', undefined, 0)).body.seat;
    const { code, body } = await spin(s);
    expect(code).toBe(402);
    expect(body.error).toBe('insufficient_tokens');
  });

  it('rejects malformed requests', async () => {
    const r = await game.app.inject({ method: 'POST', url: '/api/spin', payload: { seat: 'x', coins: 9 } });
    expect(r.statusCode).toBe(400);
  });
});

describe('settles', () => {
  it('retries a failed settle with the same round', async () => {
    const s = (await seat()).body.seat;
    stub.knobs.failSettles = 2;
    const { body } = await spin(s);
    expect(body.pending).toBe(false);
    expect([...stub.rounds.values()][0].status).toBe('settled');
  });

  it('keeps retrying in the background and never shows an unconfirmed payout', async () => {
    const s = (await seat()).body.seat;
    stub.knobs.failSettles = 3;
    const { body } = await spin(s);
    expect(body.pending).toBe(true);
    expect(body.winCents).toBe(0);
    expect(game.pending.size).toBe(1);
    await game.retryPending();
    expect(game.pending.size).toBe(0);
    expect([...stub.rounds.values()][0].status).toBe('settled');
  });

  it('tells the player when the casino refunded the stake instead', async () => {
    const s = (await seat()).body.seat;
    stub.knobs.refundSettles = true;
    const { body } = await spin(s);
    expect(body.refunded).toBe(true);
    expect(body.player.tokensMicro).toBe(50_000_000);
  });
});

describe('control states', () => {
  it('maintenance: no new players, no new spins', async () => {
    const s = (await seat()).body.seat;
    await setControl({ status: 'maintenance', status_reason: 'update to 1.0.43' });
    expect((await spin(s)).body).toMatchObject({ error: 'not_open', message: 'Maintenance: update to 1.0.43. No new spins for now.' });
    expect((await seat()).code).toBe(409);
  });

  it('demo: plays exactly as open and marks the view', async () => {
    await setControl({ status: 'demo' });
    const { body } = await seat();
    expect(body.view.demo).toBe(true);
    expect((await spin(body.seat)).code).toBe(200);
  });

  it('closed: the seats end and the page is sent back to the lobby', async () => {
    const s = (await seat()).body.seat;
    await setControl({ status: 'closed' });
    const { code, body } = await spin(s);
    expect(code).toBe(401);
    expect(body.lobby).toBe(true);
  });
});

describe('heartbeat and seats', () => {
  it('heartbeats the version, the player count and every session held', async () => {
    await seat('ann');
    await seat('ann');
    await seat('bob');
    const extra = game.heartbeatExtra();
    expect(extra.version).toBe('1.0.42');
    // idle seats are no players (rule 17): nobody has a pull in progress
    expect(extra.players).toBe(0);
    expect(extra.sessions).toHaveLength(3);
    expect(stub.heartbeats.at(-1)).toMatchObject({ version: '1.0.42' });
  });

  it('frees a seat once its page has been gone for the grace period', async () => {
    await seat();
    expect(game.seats.size).toBe(1);
    await until(() => game.seats.size === 0);
    await until(() => [...stub.sessions.values()].every(s => !s.open));
    expect(game.heartbeatExtra().sessions).toEqual([]);
  });
});
