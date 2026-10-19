'use strict';
const path = require('path');
const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const { createCasino, rng, CasinoError } = require('./casino/casino-game');
const { spin: doSpin, payoutFor } = require('./game-logic');

const casino = createCasino({
  url: process.env.CASINO_URL || 'https://casino.grovestreet.zip',
  key: process.env.GAME_KEY || '',
});

const state = { status: 'closed', settings: {}, limits: null, demo: false };
const seats = new Map();

const stopWatch = casino.watch(state, () => ({
  version: process.env.GAME_VERSION || 'dev',
  players: seats.size,
  sessions: Array.from(seats.values()).map(s => s.casinoSession),
}), () => {});

const app = Fastify({ logger: true });

const staticRoot = path.join(__dirname, '../../../public/dist');
const fs = require('fs');
const root = fs.existsSync(staticRoot) ? staticRoot : path.join(__dirname, '../../../public');
app.register(fastifyStatic, { root, prefix: '/' });

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of seats) {
    if (now - s.lastSeen > 60000) {
      casino.closeSession(s.casinoSession).catch(() => {});
      seats.delete(id);
    }
  }
}, 15000);

app.get('/health', async () => ({
  ok: true,
  version: process.env.GAME_VERSION || 'dev',
  status: state.status || 'closed',
}));

app.get('/api/state', async (req) => {
  const seat = req.query.seat ? seats.get(req.query.seat) : null;
  return {
    status: state.status,
    demo: !!state.demo,
    limits: state.limits,
    player: seat ? { name: seat.player && seat.player.username } : null,
  };
});

app.post('/api/session/open', async (req, reply) => {
  const { token } = req.body || {};
  if (!token) return reply.code(400).send({ error: 'missing token' });
  try {
    const opened = await casino.openSession(token);
    const seatId = rng.id();
    seats.set(seatId, { casinoSession: opened.session, lastSeen: Date.now(), player: opened.player });
    return { seat: seatId, player: opened.player, sessions: opened.sessions };
  } catch (e) {
    if (e instanceof CasinoError) return reply.code(e.status).send({ error: e.message, data: e.data });
    throw e;
  }
});

app.post('/api/spin', async (req, reply) => {
  const { seat, betCents } = req.body || {};
  const s = seats.get(seat);
  if (!s) return reply.code(401).send({ error: 'no seat' });
  s.lastSeen = Date.now();

  if (state.status !== 'open' && state.status !== 'demo') {
    return reply.code(409).send({ error: 'game not open', status: state.status });
  }

  const bet = Math.max(20, Math.min(300, Number(betCents) || 20));
  const coinLevel = Math.min(2, Math.max(0, Math.round((bet - 20) / 40)));

  const roundId = rng.id();
  try {
    await casino.openRound({ session: s.casinoSession, round: roundId, betCents: bet });
  } catch (e) {
    if (e instanceof CasinoError) return reply.code(e.status).send({ error: e.message, data: e.data });
    throw e;
  }

  const result = doSpin(rng);
  const credits = payoutFor(result.result, coinLevel);
  const winCents = Math.round(credits * (bet / 100));

  try {
    await casino.settle({
      round: roundId,
      winCents,
      outcome: result.result ? result.result.key : 'loss',
      meta: { line: result.line, stops: result.stops, credits },
    });
  } catch (e) {
    await casino.voidRound({ round: roundId, reason: 'settle_failed' }).catch(() => {});
    if (e instanceof CasinoError) return reply.code(e.status).send({ error: e.message });
    throw e;
  }

  return { round: roundId, line: result.line, stops: result.stops, win: result.result, winCents, credits };
});

app.post('/api/session/close', async (req) => {
  const { seat } = req.body || {};
  const s = seats.get(seat);
  if (s) {
    seats.delete(seat);
    await casino.closeSession(s.casinoSession).catch(() => {});
  }
  return { ok: true };
});

const port = Number(process.env.PORT || 8080);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(JSON.stringify({ event: 'listen', port, version: process.env.GAME_VERSION || 'dev' }));
}).catch(err => {
  console.error(err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  stopWatch();
  app.close().then(() => process.exit(0));
});
