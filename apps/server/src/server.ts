// Entry point: settings come from the stack environment (section 11), never from the image.
import path from 'node:path';
import { existsSync } from 'node:fs';
import { createCasino, rng } from './casino/casino-game.js';
import { buildApp } from './app.ts';

const env = process.env;
const casino = createCasino({ url: env.CASINO_URL, key: env.GAME_KEY });

// Bundled to apps/server/dist/server.cjs; the page is built to apps/web/dist.
const staticRoot = env.STATIC_DIR ?? path.resolve(__dirname, '../../web/dist');
if (!existsSync(staticRoot)) console.warn(JSON.stringify({ event: 'no_static_root', staticRoot }));

const game = buildApp({
  casino,
  rng,
  version: env.GAME_VERSION || 'dev',
  publicUrl: env.CASINO_PUBLIC_URL || 'https://casino.grovestreet.zip',
  slug: 'classic777',
  staticRoot: existsSync(staticRoot) ? staticRoot : null,
});

game.start(Number(env.PORT || 8080)).catch(err => {
  console.error(err);
  process.exit(1);
});

let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    game.stop().then(() => process.exit(0), () => process.exit(1));
  });
}
