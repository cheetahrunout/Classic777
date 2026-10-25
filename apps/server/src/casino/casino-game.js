'use strict';
// ---------------------------------------------------------------------------------------------
// Grove Casino game SDK (Node 18+, no dependencies). Copy this file into your game and read
// game-integration.md. Everything a game needs: the session handoff, rounds (bet, settle, void), tables for
// multiplayer games, the control stream (last bets, halt, settings), heartbeat, scores, and the
// only random numbers a casino game may use.
//
//   const { createCasino, rng } = require('./casino-game');
//   const casino = createCasino({ url: process.env.CASINO_URL, key: process.env.GAME_KEY });
//   const s = await casino.openSession(gcToken);                    // from ?gc_token= on the player's first request
//   const r = await casino.openRound({ session: s.session, round: id, betCents: 100 });
//   await casino.settle({ round: id, winCents: 200, outcome: 'heads' });
//   // a game with its own credits bets in casino tokens instead; the ledger moves exactly these
//   await casino.openRound({ session: s.session, round: id, betTokens: 0.25 });   // or betMicro: 250000
//   await casino.settle({ round: id, winTokens: 0.5 });
// ---------------------------------------------------------------------------------------------
const crypto = require('crypto');

const LINK_DOWN_MS = 90000;   // no good heartbeat answer for this long: the game is 'offline' and refuses new rounds

class CasinoError extends Error { constructor(msg, status, data) { super(msg); this.status = status; this.data = data || null; } }

function createCasino(opts) {
    const url = String((opts && opts.url) || process.env.CASINO_URL || '').replace(/\/+$/, '');
    const key = String((opts && opts.key) || process.env.GAME_KEY || '');
    const timeoutMs = (opts && opts.timeoutMs) || 10000;
    if (!url || !key) throw new Error('createCasino needs url and key (CASINO_URL and GAME_KEY)');
    async function call(method, path, body) {
        const r = await fetch(url + path, { method, headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
        const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { /* not json */ }
        if (!r.ok) throw new CasinoError((j && j.error) || ('casino answered ' + r.status), r.status, j);
        return j;
    }
    const api = {
        // the player arrives with ?gc_token=...; exchange it once for a game session
        openSession: token => call('POST', '/api/game/session/open', { token }),
        session: id => call('GET', '/api/game/session/' + encodeURIComponent(id)),
        closeSession: id => call('POST', '/api/game/session/close', { session: id }),
        // one round per player per bet; the round id is yours and must be unique for this game (a uuid is fine)
        // the bet in euro cents (betCents, converted at this moment's rate) or in tokens (betMicro or betTokens); the win likewise
        openRound: a => call('POST', '/api/game/round/open', Object.assign({ session: a.session, round: a.round, table: a.table, hand: a.hand, meta: a.meta }, a.betCents !== undefined ? { bet_cents: a.betCents } : a.betMicro !== undefined ? { bet_micro: a.betMicro } : { bet_tokens: a.betTokens })),
        settle: a => call('POST', '/api/game/round/settle', Object.assign({ round: a.round, outcome: a.outcome, meta: a.meta }, a.winMicro !== undefined ? { win_micro: a.winMicro } : a.winTokens !== undefined ? { win_tokens: a.winTokens } : { win_cents: a.winCents || 0 })),
        voidRound: a => call('POST', '/api/game/round/void', { round: a.round, reason: a.reason }),
        // multiplayer: report every table whenever its seats or status change (and in the heartbeat)
        table: a => call('POST', '/api/game/table', { table: a.table, seats_max: a.seatsMax, seats_used: a.seatsUsed, status: a.status, players: a.players, meta: a.meta }),
        // sessions: every casino session the game holds, seated or within its grace period; the list is complete, the
        // casino closes a session the heartbeats leave out for GAME_SESSION_GRACE_S (a browser that went away)
        heartbeat: a => call('POST', '/api/game/heartbeat', { version: a && a.version, players: a && a.players, sessions: a && a.sessions, tables: a && a.tables }),
        control: () => call('GET', '/api/game/control'),
        score: a => call('POST', '/api/game/score', { session: a.session, score: a.score, meta: a.meta }),
        // the control stream: 'control' events carry {status, settings, limits}; call handler(type, data)
        events(handler, state) {
            const st = state || { stop: false };
            (async () => {
                let delay = 1000;
                while (!st.stop) {
                    try {
                        const r = await fetch(url + '/api/game/events', { headers: { Authorization: 'Bearer ' + key, Accept: 'text/event-stream' } });
                        if (!r.ok || !r.body) throw new CasinoError('events ' + r.status, r.status);
                        delay = 1000;
                        const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
                        while (!st.stop) {
                            const { value, done } = await reader.read(); if (done) break;
                            buf += dec.decode(value, { stream: true });
                            let i;
                            while ((i = buf.indexOf('\n\n')) >= 0) {
                                const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
                                let type = 'message', data = '';
                                for (const line of chunk.split('\n')) { if (line.startsWith('event:')) type = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
                                let parsed = null; try { parsed = JSON.parse(data); } catch { parsed = data; }
                                try { handler(type, parsed); } catch (e) { console.error('[casino] handler error', e); }
                            }
                        }
                    } catch (e) { if (!st.stop) console.error('[casino] events stream down, retrying in ' + delay + ' ms:', e.message); }
                    if (!st.stop) { await new Promise(r => setTimeout(r, delay)); delay = Math.min(30000, delay * 2); }
                }
            })();
            return () => { st.stop = true; };
        },
        // a small loop that keeps `state` current: status, settings, limits; heartbeat every 30 s; other events
        // (balance: {session, player} whenever a player's tokens change) go to onEvent(type, data)
        watch(state, extra, onEvent) {
            state.status = state.status || 'closed'; state.settings = state.settings || {}; state.limits = state.limits || null;
            state.link = 'down'; state.link_ts = 0;   // the heartbeat is the liveness signal both ways
            const apply = c => { if (!c) return; state.status = c.status; state.demo = !!c.demo; state.settings = c.settings || {}; state.limits = c.limits || state.limits; state.rtp_bps = c.rtp_bps; state.updated = Date.now(); state.link = 'up'; state.link_ts = Date.now(); };
            const beat = () => api.heartbeat(Object.assign({}, typeof extra === 'function' ? extra() : extra)).then(apply).catch(e => {
                console.error('[casino] heartbeat:', e.message);
                // the casino is not answering: after LINK_DOWN_MS refuse new rounds (status 'offline') until it answers again;
                // the casino refunds the rounds it cannot hear about from its side, so the player never waits for us
                if (Date.now() - state.link_ts > LINK_DOWN_MS) { state.link = 'down'; state.status = 'offline'; }
            });
            api.control().then(apply).catch(e => console.error('[casino] control:', e.message));
            const stop = api.events((type, data) => { if (type === 'control' || type === 'hello') apply(data); else if (typeof onEvent === 'function') onEvent(type, data); });
            beat();   // at once: the casino refuses rounds from a game it has not heard from
            const timer = setInterval(beat, 30000);
            if (timer.unref) timer.unref();
            return () => { stop(); clearInterval(timer); };
        },
        url, CasinoError,
    };
    return api;
}

// the only randomness a casino game may use: the operating system's CSPRNG through node:crypto
const rng = {
    int: (min, maxExclusive) => crypto.randomInt(min, maxExclusive),          // uniform integer in [min, maxExclusive)
    chance: p => crypto.randomInt(0, 1000000) < Math.round(p * 1000000),       // true with probability p (6 decimals)
    pick: arr => arr[crypto.randomInt(0, arr.length)],
    shuffle: arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    // a weighted pick: table = [['cherry', 50], ['bar', 10], ['seven', 1]]
    weighted: table => { const total = table.reduce((s, [, w]) => s + w, 0); let x = crypto.randomInt(0, total); for (const [v, w] of table) { if (x < w) return v; x -= w; } return table[table.length - 1][0]; },
    id: () => crypto.randomUUID(),
};
// a quick check of your own odds before you ship: expected return per unit bet, from your paytable
function expectedRtp(outcomes) { return outcomes.reduce((s, o) => s + o.p * o.payout, 0); }   // [{p: 0.48, payout: 2}] -> 0.96

module.exports = { createCasino, CasinoError, rng, expectedRtp };
