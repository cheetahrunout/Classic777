// A stub Grove Casino for tests: the game API of section 3, in memory, with knobs under /test.
// Never the real casino (architecture rule 9). Run alone: node e2e/stub-casino.mjs [port]
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const RATE_MICRO = 1_066_400; // micro-euro per token: 1 token = € 1,0664

export function createStubCasino({ key = 'stub-key' } = {}) {
  const control = {
    status: 'open', status_reason: '', demo: false, currency: 'euro', unit: null,
    settings: { coin_cents: 10 },
    limits: {
      min_bet_cents: 5, max_bet_cents: 300, max_win_cents: 150000,
      min_bet_micro: 0, max_bet_micro: 0, max_win_micro: 0, sessions_per_player: 3,
    },
    rate_micro: RATE_MICRO, rtp_bps: 9620, multiplayer: false, seats: 1,
  };
  const players = new Map();   // id -> player
  const tokens = new Map();    // handoff token -> player id
  const sessions = new Map();  // session -> { player, open }
  const rounds = new Map();
  const streams = new Set();
  const heartbeats = [];
  const knobs = { failSettles: 0, refundSettles: false };

  const centsToMicro = c => Math.floor((c * 1e10) / control.rate_micro);
  const pub = p => ({ ...p, tokens_value_cents: Math.floor((p.tokens_micro * control.rate_micro) / 1e10) });
  const ctl = () => {
    const l = control.limits;
    return {
      ...control,
      demo: control.status === 'demo',
      limits: { ...l, min_bet_micro: centsToMicro(l.min_bet_cents), max_bet_micro: centsToMicro(l.max_bet_cents), max_win_micro: centsToMicro(l.max_win_cents) },
      server_time: new Date().toISOString(),
    };
  };
  const emit = (event, data) => { for (const s of streams) s.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const balance = player => {
    for (const [session, s] of sessions) if (s.open && s.player === player.id) emit('balance', { session, player: pub(player) });
  };
  const roundView = r => ({ ...r, player: pub(players.get(sessions.get(r.session).player)) });

  async function body(req) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }

  const routes = {
    'POST /api/game/session/open': ({ token }) => {
      const id = tokens.get(token);
      if (!id) return [401, { error: 'bad or used token' }];
      tokens.delete(token);
      if (!['open', 'demo'].includes(control.status)) return [409, { error: 'game not open', game_status: control.status }];
      const open = [...sessions.values()].filter(s => s.open && s.player === id).length;
      if (open >= control.limits.sessions_per_player) return [409, { error: 'too many sessions', sessions: open }];
      const session = 'gs_' + randomUUID();
      sessions.set(session, { player: id, open: true });
      return [200, { session, table: null, player: pub(players.get(id)), sessions: open + 1, demo: control.status === 'demo' }];
    },
    'POST /api/game/session/close': ({ session }) => {
      const s = sessions.get(session);
      if (s) s.open = false;
      return [200, { closed: !!s }];
    },
    'POST /api/game/round/open': ({ session, round, bet_cents }) => {
      const s = sessions.get(session);
      if (!s || !s.open) return [401, { error: 'session ended' }];
      const prior = rounds.get(round);
      if (prior) return prior.bet_cents === bet_cents ? [200, { ...roundView(prior), replay: true }] : [409, { error: 'round id reused' }];
      if (!['open', 'demo'].includes(control.status)) return [409, { error: 'not open', game_status: control.status }];
      if (!(bet_cents >= control.limits.min_bet_cents && bet_cents <= control.limits.max_bet_cents)) return [400, { error: 'bet outside limits' }];
      const p = players.get(s.player);
      const bet_micro = centsToMicro(bet_cents);
      if (p.tokens_micro < bet_micro) return [402, { error: 'cannot afford', balance: p.tokens_micro }];
      p.tokens_micro -= bet_micro;
      const r = { round, session, status: 'open', bet_cents, bet_micro, win_cents: 0, win_micro: 0, rate_micro: control.rate_micro };
      rounds.set(round, r);
      balance(p);
      return [200, roundView(r)];
    },
    'POST /api/game/round/settle': ({ round, win_cents = 0, outcome }) => {
      const r = rounds.get(round);
      if (!r) return [404, { error: 'no such round' }];
      if (knobs.failSettles > 0) { knobs.failSettles--; return [500, { error: 'stub settle failure' }]; }
      if (knobs.refundSettles && r.status === 'open') { r.status = 'void'; players.get(sessions.get(r.session).player).tokens_micro += r.bet_micro; }
      if (r.status === 'void') return [409, { error: 'refunded', refunded: true }];
      if (r.status === 'settled') return r.win_cents === win_cents ? [200, { ...roundView(r), replay: true }] : [409, { error: 'settled differently' }];
      if (win_cents > control.limits.max_win_cents) return [400, { error: 'win above limit' }];
      const p = players.get(sessions.get(r.session).player);
      r.status = 'settled'; r.win_cents = win_cents; r.win_micro = Math.floor((win_cents * 1e10) / r.rate_micro); r.outcome = outcome;
      p.tokens_micro += r.win_micro;
      balance(p);
      return [200, roundView(r)];
    },
    'POST /api/game/round/void': ({ round }) => {
      const r = rounds.get(round);
      if (!r) return [404, { error: 'no such round' }];
      if (r.status === 'open') { r.status = 'void'; players.get(sessions.get(r.session).player).tokens_micro += r.bet_micro; }
      return [200, roundView(r)];
    },
    'POST /api/game/heartbeat': hb => { heartbeats.push({ ...hb, ts: Date.now() }); return [200, ctl()]; },
    'GET /api/game/control': () => [200, ctl()],
    // Knobs for the tests.
    'POST /test/token': ({ username = 'tester', tokens_micro = 50_000_000 }) => {
      let p = [...players.values()].find(x => x.username === username);
      if (!p) { p = { id: 'p_' + randomUUID(), username, tokens_micro, bankruptcies: 0 }; players.set(p.id, p); }
      const token = 'gh_' + randomUUID();
      tokens.set(token, p.id);
      return [200, { token, player: pub(p) }];
    },
    'POST /test/control': patch => {
      Object.assign(control, patch);
      if (control.status === 'closed') {
        for (const r of rounds.values()) if (r.status === 'open') { r.status = 'void'; players.get(sessions.get(r.session).player).tokens_micro += r.bet_micro; }
        for (const s of sessions.values()) s.open = false;
      }
      emit('control', ctl());
      return [200, ctl()];
    },
    'POST /test/knobs': patch => { Object.assign(knobs, patch); return [200, knobs]; },
    'GET /test/state': () => [200, {
      heartbeats, rounds: [...rounds.values()], sessions: [...sessions].map(([id, s]) => ({ id, ...s })), players: [...players.values()],
    }],
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://stub');
    const reply = (code, data) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (url.pathname.startsWith('/api/') && req.headers.authorization !== 'Bearer ' + key) return reply(401, { error: 'bad key' });
    if (req.method === 'GET' && url.pathname === '/api/game/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.write(`event: hello\ndata: ${JSON.stringify(ctl())}\n\n`);
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }
    const m = url.pathname.match(/^\/api\/game\/session\/(gs_[\w-]+)$/);
    if (req.method === 'GET' && m) {
      const s = sessions.get(m[1]);
      if (!s || !s.open) return reply(401, { error: 'session ended' });
      return reply(200, { session: m[1], table: null, player: pub(players.get(s.player)) });
    }
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return reply(404, { error: 'not found' });
    const [code, data] = route(await body(req));
    reply(code, data);
  });

  return {
    server, control, knobs, heartbeats, rounds, sessions, players,
    listen: (port = 0) => new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise(resolve => { for (const s of streams) s.end(); server.closeAllConnections?.(); server.close(() => resolve()); }),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const stub = createStubCasino({ key: process.env.GAME_KEY || 'stub-key' });
  stub.listen(Number(process.argv[2] || 9911)).then(url => console.log(JSON.stringify({ event: 'stub_casino', url })));
}
