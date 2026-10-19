'use strict';
const Fastify = require('fastify');
const { createCasino, rng } = require('./casino/casino-game');

const casino = createCasino({
  url: process.env.CASINO_URL || 'https://casino.grovestreet.zip',
  key: process.env.GAME_KEY || '',
});

const state = { status: 'closed', settings: {}, limits: null };
const sessions = new Map(); // seatId -> { session, lastSeen }

const stop = casino.watch(state, () => ({
  version: process.env.GAME_VERSION || 'dev',
  players: sessions.size,
  sessions: Array.from(sessions.values()).map(s => s.session),
}), (type, data) => {
  // balance updates etc. can be pushed to clients later
});

const app = Fastify({ logger: true });

app.get('/health', async () => ({
  ok: true,
  version: process.env.GAME_VERSION || 'dev',
  status: state.status,
}));

app.get('/', async (req, reply) => {
  reply.type('text/html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Classic 777</title>
<script src="https://casino.grovestreet.zip/bar.js" data-game="classic777"></script>
</head><body style="margin:0;background:#111;color:#eee;font-family:system-ui">
<div style="padding:var(--grove-bar-top,56px) 16px">
<h1>Classic 777</h1>
<p>Grove Casino integration scaffold. Server owns outcomes.</p>
<p>Status: <span id="st"></span></p>
</div>
<script>
fetch('/health').then(r=>r.json()).then(d=>document.getElementById('st').textContent=d.status||'unknown');
</script>
</body></html>`);
});

const port = Number(process.env.PORT || 8080);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log('classic777 listening on ' + port);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
