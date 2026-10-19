<script setup lang="ts">
// Vue owns the HUD (meters, ticker, buttons, pay table); machine.ts animates the reels and the handle;
// tray.ts (PixiJS) drops the coins. The server decides every spin.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { PAYTABLE, formatEuro, statusMessage, tokensValueCents, type Coins, type SeatAnswer, type SpinAnswer, type View } from '@classic777/shared';
import { ApiError, getSeat, listen, openSeat, rememberSeat, spin, storedSeat, toLobby } from './api.ts';
import { useGame } from './store.ts';
import { svgFor } from './machine/art.ts';
import { bulbPositions, createMachine, type Machine } from './machine/machine.ts';
import { createTray, type Tray } from './machine/tray.ts';
import { createCoaster, type Coaster } from './machine/coaster.ts';
import { Sound } from './machine/sound.ts';

const game = useGame();
const { view, coins, busy, message, alert, winCoins, hitKey, level, notice, playing, allowed, betCents, coinCents } = storeToRefs(game);

const stageEl = ref<HTMLElement>();
const machineEl = ref<HTMLElement>();
const reelsEl = ref<HTMLElement>();
const bezelEl = ref<HTMLElement>();
const leverEl = ref<SVGSVGElement>();
const trayEl = ref<HTMLElement>();
const spinEl = ref<HTMLButtonElement>();
const coasterEl = ref<HTMLElement>();

const bulbs = bulbPositions();
const payRows = PAYTABLE.map(p => ({ ...p, iconsHtml: p.icons.map(svgFor).join('') }));
const soundOn = ref(true);
const shownWin = ref(0);

let machine: Machine | null = null;
let tray: Tray | null = null;
let coaster: Coaster | null = null;
let machineResize: ResizeObserver | null = null;
let stopStream: (() => void) | null = null;

const IDLE = 'PULL THE HANDLE';

const statusShort = computed(() => {
  switch (view.value?.status) {
    case 'maintenance': return 'MAINTENANCE · NO NEW SPINS';
    case 'closed': return 'MACHINE CLOSED';
    case 'offline': return 'CASINO OFFLINE';
    default: return '';
  }
});

const coinLabel = (n: number) => `${n} coin${n === 1 ? '' : 's'}`;

/* ---------------- Seat and control state ---------------- */

function applyView(v: View) {
  view.value = v;
  game.fitBet();
  const open = v.status === 'open' || v.status === 'demo';
  if (game.seat) notice.value = open ? null : { text: statusMessage(v.status, v.reason), lobby: false };
  if (!busy.value) game.setMessage(open ? IDLE : statusShort.value, !open);
}

function seated(a: SeatAnswer) {
  game.seat = a.seat;
  rememberSeat(a.seat);
  game.setPlayer(a.player);
  applyView(a.view);
  stopStream?.();
  stopStream = listen(a.seat, {
    view: applyView,
    player: p => game.setPlayer(p),
    notice: text => game.setMessage(text.toUpperCase(), true),
    gone: () => leaveSeat(),
  });
}

function leaveSeat() {
  stopStream?.();
  rememberSeat(null);
  game.seat = null;
  toLobby();
}

async function connect() {
  const params = new URLSearchParams(location.search);
  const token = params.get('gc_token');
  if (token) {
    // The handoff is used once: take it out of the address bar (architecture rule 4).
    params.delete('gc_token');
    const rest = params.toString();
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
  }
  const prior = await storedSeat();
  try {
    if (token) seated(await openSeat(token, prior ?? undefined));
    else if (prior) seated(await getSeat(prior));
    else toLobby();
  } catch (e) {
    if (e instanceof ApiError && e.body.lobby && !token) return leaveSeat();
    rememberSeat(null);
    const text = e instanceof Error ? e.message : 'The machine could not seat you.';
    notice.value = { text, lobby: true };
    game.setMessage('NO SEAT', true);
  }
}

async function refresh() {
  if (!game.seat || document.visibilityState !== 'visible') return;
  try {
    const a = await getSeat(game.seat);
    game.setPlayer(a.player);
    applyView(a.view);
  } catch (e) {
    if (e instanceof ApiError && e.body.lobby) leaveSeat();
  }
}

/* ---------------- A pull ---------------- */

function canPull(): boolean {
  if (busy.value) {
    game.setMessage('REELS ARE SPINNING');
    return false;
  }
  if (!game.seat) {
    game.setMessage('NO SEAT', true);
    return false;
  }
  if (!playing.value) {
    game.setMessage(statusShort.value, true);
    return false;
  }
  if (!allowed.value.includes(coins.value)) {
    game.setMessage('BET OUTSIDE LIMITS', true);
    return false;
  }
  // The casino has the last word (402); this only spares a spin of the reels that cannot be paid for.
  const p = game.player;
  const rate = view.value?.rateMicro;
  if (p && rate && tokensValueCents(p.tokensMicro, rate) < betCents.value) {
    game.setMessage('TOP UP TOKENS FROM THE BAR', true);
    return false;
  }
  return true;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** A lost answer is retried with the same pull id, which the server answers once. */
async function spinOnce(seat: string, c: Coins): Promise<SpinAnswer> {
  const id = crypto.randomUUID();
  for (let attempt = 0; ; attempt++) {
    try {
      return await spin(seat, c, id);
    } catch (e) {
      if (e instanceof ApiError || attempt >= 3) throw e;
      await sleep(800 * (attempt + 1));
    }
  }
}

async function onLatch() {
  busy.value = true;
  level.value = 0;
  hitKey.value = null;
  shownWin.value = 0;
  winCoins.value = 0;
  game.setMessage('GOOD LUCK!');

  let answer: SpinAnswer;
  try {
    answer = await spinOnce(game.seat!, coins.value);
  } catch (e) {
    await machine!.landAnywhere();
    busy.value = false;
    game.releasePlayer();
    if (e instanceof ApiError && e.body.lobby) return leaveSeat();
    stopAutoplay();
    game.setMessage(e instanceof ApiError ? spinRefusal(e) : 'NO ANSWER · PULL AGAIN', true);
    return;
  }

  if (answer.player) game.setPlayer(answer.player);
  await machine!.land(answer.stops);
  showResult(answer);
}

function spinRefusal(e: ApiError): string {
  switch (e.body.error) {
    case 'insufficient_tokens': return 'TOP UP TOKENS FROM THE BAR';
    case 'not_open': return statusShort.value || 'MACHINE NOT OPEN';
    case 'restarting': return 'RESTARTING · PULL AGAIN SOON';
    default: return e.message.toUpperCase();
  }
}

function showResult(a: SpinAnswer) {
  const done = () => {
    busy.value = false;
    game.releasePlayer();
  };
  if (a.refunded) {
    game.setMessage('STAKE RETURNED', true);
    return done();
  }
  if (!a.result || a.winCoins === 0) {
    game.setMessage('PULL AGAIN');
    return done();
  }
  machine!.markWin(a.result.reels);
  hitKey.value = a.result.key;
  winCoins.value = a.winCoins;
  const lvl = a.result.key === 'SEVEN' ? 3 : a.winCoins >= 50 ? 2 : 1;
  level.value = lvl;
  Sound.fanfare(lvl);
  if (a.pending) {
    // Never show a payout the casino has not confirmed.
    game.setMessage(`WIN ${a.winCoins} COINS · PAYOUT PENDING`, true);
    return done();
  }
  const euro = formatEuro(a.winCents);
  game.setMessage(lvl === 3 ? `JACKPOT!  ${a.winCoins} COINS · ${euro}` : `WINNER  ${a.winCoins} COINS · ${euro}`, true);
  countUp(a.winCents, a.winCoins, lvl, done);
}

function countUp(cents: number, coinsWon: number, lvl: number, done: () => void) {
  const steps = Math.min(coinsWon, lvl === 3 ? 60 : 30);
  const interval = lvl === 3 ? 60 : 75;
  let step = 0;
  setTimeout(function tick() {
    step++;
    shownWin.value = Math.round((cents * step) / steps);
    Sound.coin();
    if (step % 2 === 1) tray?.drop();
    if (step < steps) {
      setTimeout(tick, interval);
    } else {
      done();
      setTimeout(() => { if (!busy.value) level.value = 0; }, 1200);
    }
  }, lvl === 3 ? 900 : 350);
}

/* ---------------- Autoplay: the coaster holds SPIN down ---------------- */

const autoplay = ref(false);
let autoTimer = 0;

function scheduleAuto(ms: number) {
  clearTimeout(autoTimer);
  autoTimer = window.setTimeout(autoTick, ms);
}

function autoTick() {
  if (!autoplay.value || busy.value) return; // the end of the spin schedules the next one
  if (!playing.value) {
    // Closed or in maintenance: keep the button held and try again when it opens.
    game.setMessage(statusShort.value, true);
    return scheduleAuto(2000);
  }
  if (!canPull()) return stopAutoplay();
  machine?.pull();
  // If the handle was still settling the pull was ignored: try again.
  scheduleAuto(1500);
}

function startAutoplay() {
  autoplay.value = true;
  if (!busy.value) game.setMessage('AUTOPLAY');
  scheduleAuto(250);
}

/** The coaster came off, or has to come off: stop after the spin in progress. */
function stopAutoplay() {
  if (!autoplay.value) return;
  autoplay.value = false;
  clearTimeout(autoTimer);
  if (coaster?.engaged) coaster.release();
}

// A short breather between spins, so every result is seen.
watch(busy, b => { if (!b && autoplay.value) scheduleAuto(900); });

/* ---------------- Buttons and keys ---------------- */

function pull() {
  machine?.pull();
}

function betOne() {
  Sound.init();
  if (busy.value || !allowed.value.length) return;
  const next = allowed.value.find(c => c > coins.value) ?? allowed.value[0];
  coins.value = next;
  Sound.coin();
}

function maxBet() {
  Sound.init();
  if (busy.value || !allowed.value.length) return;
  coins.value = allowed.value[allowed.value.length - 1];
  Sound.coin();
  pull();
}

function toggleSound() {
  Sound.init();
  soundOn.value = !Sound.enabled;
  Sound.setEnabled(soundOn.value);
}

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.('button, a, #lever')) return;
  if (e.code === 'Space' || e.key === 'Enter') {
    e.preventDefault();
    pull();
  }
}

onMounted(() => {
  machine = createMachine(
    { machine: machineEl.value!, stage: stageEl.value!, reels: reelsEl.value!, bezel: bezelEl.value!, lever: leverEl.value! },
    { canPull, onLatch: () => void onLatch(), hint: text => game.setMessage(text) },
  );
  void createTray(trayEl.value!).then(t => { tray = t; });
  coaster = createCoaster(coasterEl.value!, machineEl.value!, spinEl.value!, {
    onEngage: startAutoplay,
    onRelease: () => {
      const was = autoplay.value;
      autoplay.value = false;
      clearTimeout(autoTimer);
      if (was && !busy.value) game.setMessage(playing.value ? IDLE : statusShort.value, !playing.value);
    },
    hint: text => { if (!busy.value) game.setMessage(text); },
  });
  machineResize = new ResizeObserver(() => coaster?.layout());
  machineResize.observe(machineEl.value!);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', refresh);
  game.setMessage('CONNECTING');
  void connect();
});

onBeforeUnmount(() => {
  stopStream?.();
  clearTimeout(autoTimer);
  machineResize?.disconnect();
  machine?.destroy();
  tray?.destroy();
  document.removeEventListener('keydown', onKey);
  document.removeEventListener('visibilitychange', refresh);
});
</script>

<template>
  <main id="stage" ref="stageEl">
    <div id="machine" ref="machineEl" class="machine" :class="{ winning: level === 1 || level === 2, jackpot: level === 3 }">
      <header class="topper">
        <div class="bulbs" aria-hidden="true">
          <span v-for="(b, i) in bulbs" :key="i" class="bulb" :style="{ left: b.x + 'px', top: b.y + 'px', '--i': i }"></span>
        </div>
        <div class="marquee">
          <span class="marquee-small">Classic</span>
          <h1>7<span>7</span>7</h1>
          <span class="marquee-small">Jackpot</span>
        </div>
        <div v-if="view?.demo" class="demo-ribbon" role="status">Demo</div>
      </header>

      <section class="cabinet">
        <table class="paytable" aria-label="Pay table, in coins">
          <thead>
            <tr>
              <th scope="col">Pays</th>
              <th v-for="c in 3" :key="c" scope="col" :class="{ active: coins === c, off: !allowed.includes(c as Coins) }">
                {{ coinLabel(c) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in payRows" :key="p.key" :data-key="p.key" :class="{ 'jackpot-row': p.key === 'SEVEN', hit: hitKey === p.key }">
              <td><span class="icons" v-html="p.iconsHtml"></span><span v-if="p.label" class="row-label">{{ p.label }}</span></td>
              <td v-for="(v, i) in p.pays" :key="i" :class="{ active: coins === i + 1, off: !allowed.includes((i + 1) as Coins) }">{{ v }}</td>
            </tr>
          </tbody>
        </table>

        <div ref="bezelEl" class="reel-bezel">
          <div id="reels" ref="reelsEl" class="reels"></div>
          <div class="payline" aria-hidden="true"><i></i><i></i></div>
          <div class="glass" aria-hidden="true"></div>
          <div v-if="notice" class="reel-notice" role="alert">
            <p>{{ notice.text }}</p>
            <a v-if="notice.lobby" class="btn btn-amber lobby-link" href="/lobby">Back to the lobby</a>
          </div>
        </div>

        <div class="leds">
          <div class="led">
            <span class="led-label">Balance</span>
            <output class="led-digits" data-test="balance">{{ game.balanceText }}</output>
            <span class="led-sub" data-test="balance-euro">{{ game.balanceEuro }}</span>
          </div>
          <div class="led">
            <span class="led-label">Bet</span>
            <output class="led-digits" data-test="bet">{{ formatEuro(betCents) }}</output>
            <span class="led-sub">{{ coinLabel(coins) }}</span>
          </div>
          <div class="led">
            <span class="led-label">Winner Paid</span>
            <output class="led-digits" data-test="win">{{ formatEuro(shownWin) }}</output>
            <span class="led-sub">{{ winCoins ? coinLabel(winCoins) : '' }}</span>
          </div>
        </div>
        <div class="ticker" :class="{ alert }" aria-live="polite"><span data-test="message">{{ message }}</span></div>

        <div class="controls">
          <button class="btn btn-chrome" type="button" :aria-pressed="soundOn" title="Sound on/off" @click="toggleSound">
            Sound<br>{{ soundOn ? 'On' : 'Off' }}
          </button>
          <button class="btn btn-amber" type="button" :disabled="busy || !playing" @click="betOne">Bet<br>One</button>
          <button class="btn btn-amber" type="button" :disabled="busy || !playing" @click="maxBet">Max<br>Bet</button>
          <button
            ref="spinEl" class="btn btn-spin" :class="{ held: autoplay }" type="button"
            :disabled="busy || !playing" @click="pull">
            Spin
          </button>
        </div>

        <div class="plate">Model 777-C · Coin {{ formatEuro(coinCents) }} · Pays on the center line · Space to spin</div>

        <div ref="trayEl" class="tray" aria-hidden="true"><div class="tray-lip"></div></div>
      </section>

      <svg
        id="lever" ref="leverEl" class="lever" viewBox="0 0 150 540" width="150" height="540" role="slider"
        aria-label="Slot machine handle. Drag down to spin." aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">
        <g id="lever-housing">
          <rect x="6" y="196" width="84" height="108" rx="16" fill="url(#g-chrome-v)" stroke="#3b3f44" stroke-width="2" />
          <rect x="16" y="208" width="64" height="84" rx="10" fill="#1d1f22" opacity=".85" />
          <circle cx="20" cy="210" r="4" fill="url(#g-hub)" />
          <circle cx="20" cy="290" r="4" fill="url(#g-hub)" />
        </g>
        <circle cx="62" cy="250" r="30" fill="url(#g-hub)" stroke="#2a2d31" stroke-width="2" />
        <circle cx="62" cy="250" r="17" fill="#2a2d31" />
        <polygon id="lever-rod" fill="url(#g-chrome-h)" stroke="#3a3e43" stroke-width="1" />
        <ellipse id="lever-collar" fill="url(#g-chrome-h)" stroke="#3a3e43" stroke-width="1" />
        <circle id="lever-hubcap" cx="62" cy="250" r="11" fill="url(#g-hub)" />
        <g id="lever-ball">
          <circle id="lever-ball-shape" fill="url(#g-ball)" stroke="#3d0207" stroke-width="1.5" />
          <ellipse id="lever-ball-shine" fill="#fff" opacity=".75" />
        </g>
        <circle id="lever-grab" fill="transparent" />
      </svg>

      <div
        ref="coasterEl" class="coaster" role="button" tabindex="0" aria-pressed="false"
        aria-label="Paper coaster. Put it on SPIN to keep the machine spinning; take it off to stop."
        title="Drag onto SPIN for autoplay"></div>
    </div>
  </main>
</template>
