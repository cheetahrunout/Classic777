# Classic 777

Classic three-reel slot for [Grove Casino](https://casino.grovestreet.zip).

Compliant with the casino integration contract (revision 0.24.2):

- Server owns all outcomes via the casino SDK CSPRNG (`rng`). Browser only sends intentions and renders results.
- Session handoff (`?gc_token=` → seat), openRound/settle (or void) on every spin.
- Heartbeat lists every held session; idle seats closed after 60 s.
- Vue 3 + PixiJS frontend that loads the casino bar and honours `--grove-bar-*` CSS variables.
- Manifest, build-cost.jsonl, multi-stage Dockerfile, versioned GHCR CI.
- Unit tests for the paytable evaluator.

## RTP

Target `rtp_bps` 9600. Paytable is the original credit table scaled to euro cents. Run a large simulation against the server logic before live to confirm.

## Play

Open from the casino lobby. The page at `/` is the Vue+Pixi build (or the fallback public page).
