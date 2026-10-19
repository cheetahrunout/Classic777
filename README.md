# Classic 777

Classic three-reel one-line slot for [Grove Casino](https://casino.grovestreet.zip).

The server decides every outcome with the casino SDK's CSPRNG (`rng`). The browser only displays results and sends spin intentions. Money moves only through the casino API.

## Current branch: `grove-integration`

- `casino-game.json` manifest
- Casino SDK copy
- Server with session open, spin (openRound + settle), health, heartbeat
- Page that loads the casino bar (`/bar.js`)
- Dockerfile + CI workflow that publishes versioned GHCR images

## Next

- Port the original visual reels (handle, SVG symbols, Web Audio) to the server-driven page or a Vue + PixiJS frontend
- Proper bet ladder, limits from control, demo mode
- Real pnpm-lock.yaml and Playwright smoke tests
- RTP verification against the paytable

Open from the casino lobby with `?gc_token=` to play.
