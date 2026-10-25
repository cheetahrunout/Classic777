# Classic 777

A three-reel, one-line slot for [Grove Casino](https://casino.grovestreet.zip), with the draggable side handle,
synthesized ratchet, clunk, spring and reel sounds, and the coin-column pay table of the original machine.

Built to the casino's integration contract and build standard, revision 0.68.0
(https://casino.grovestreet.zip/game-integration.md). Read the current copy before every release (rule 15).

## How it is put together

| Part | What it does |
| --- | --- |
| `apps/server` | Fastify. Takes the handoff, keeps the casino sessions, opens and settles a round per pull, picks the stops with the SDK's `rng`, heartbeats, serves the page. |
| `apps/server/src/casino` | The casino SDK, `casino-game.js` as shipped. `casino-game.d.ts` was written against it because the casino's own copy could not be fetched; replace it with the casino's. |
| `apps/web` | Vue 3 + Pinia for the cabinet, meters and buttons; `machine/` animates the reels and the handle; PixiJS drops the coins in the tray. The page draws state and sends intentions, nothing more. |
| `packages/shared` | Reel strips, pay table, money formatting and the page/server contract (Zod schemas under `@classic777/shared/schemas`, server only). |
| `e2e/stub-casino.mjs` | An in-memory stand-in for the casino's game API, used by the integration and browser tests. |

## Money and odds

- Currency `euro`. A bet is 1 to 3 coins (BET ONE loops 1, 2, 3) times a multiplier of 1x, 5x or 10x, so 1 to 30 coins;
  every pay is the pay table's coin column times the multiplier, so the RTP is the same at every multiplier.
  The coin value is the admin's `coin_cents` setting (5, 10, 20, 50 or 100 cents, default 10).
  The page offers only the bets that fit the casino's limits, including the jackpot (1,500 coins x the multiplier) under the maximum win:
  at € 0,10 a coin the declared limits allow every bet up to 30 coins (€ 3,00, top prize € 1.500,00).
- The pay table is the original one with "any bar" raised from 10/20/30 to 12/24/33 coins.
  Exact RTP, by enumerating every stop combination: 96.12% at 1 and 2 coins, 96.31% at 3 coins. Declared `rtp_bps`: 9620.
- Declared in `casino-game.json` (rule 4, section 6), exact by the same enumeration at 3 coins, where the machine spreads
  widest: `rtp_sd` 5.61 bets (4.10 at 1 and 2 coins), no bonus features, and `top_prizes`: the 777 jackpot at 500 times
  the bet (300 at 1 or 2 coins) and three triple bars at 100, each once in 10,648 pulls, and three double bars at 50 once
  in 1,331. No round depends on an earlier one, so no `special_outcomes`.
- `pnpm rtp` runs the 100,000-pull simulation of section 12. The jackpot makes a single run spread by about ±1.7 points (one sigma) around the exact figure.

## Develop

```sh
pnpm install
pnpm run typecheck && pnpm run lint && pnpm run test
pnpm run build
pnpm run test:e2e        # built app + stub casino in Chromium
```

Locally against the stub: `node e2e/stub-casino.mjs 9911`, then
`CASINO_URL=http://127.0.0.1:9911 GAME_KEY=stub-key pnpm start`, take a token with
`curl -XPOST localhost:9911/test/token -d '{}'` and open `http://localhost:8080/?gc_token=<token>`.

## Run

Environment: `PORT`, `CASINO_URL`, `CASINO_PUBLIC_URL`, `GAME_KEY` (section 11). `GET /health` answers
`{ ok, version, status }`; the image sets `GAME_VERSION` from the build number.
