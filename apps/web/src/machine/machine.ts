// The reels and the side handle: pure animation. Where the reels stop is the server's answer.
import { STRIPS, type Sym } from '@classic777/shared';
import { svgFor } from './art.ts';
import { jitter } from './jitter.ts';
import { Sound } from './sound.ts';

export interface MachineHooks {
  /** Asked before the handle may move; false keeps it still (the store says why). */
  canPull(): boolean;
  /** The handle hit the bottom stop: the reels are going, ask the server for the result. */
  onLatch(): void;
  /** Shown on the ticker for handle hints. */
  hint(text: string): void;
}

export interface MachineEls {
  machine: HTMLElement;
  stage: HTMLElement;
  reels: HTMLElement;
  bezel: HTMLElement;
  lever: SVGSVGElement;
}

const CELL = 96;
const WINDOW = 240;
const SPEED = 2.5;          // px per ms at full spin
const BACK_C1 = 0.6;        // easeOutBack overshoot
const BACK_C3 = BACK_C1 + 1;
const BACK_SLOPE = 3 * BACK_C3 - 2 * BACK_C1; // f'(0), to match spin speed going into the stop
const STOP_DIST = 4 * CELL;
const MIN_SPIN_MS = 1050;

const easeOutBack = (t: number) => 1 + BACK_C3 * Math.pow(t - 1, 3) + BACK_C1 * Math.pow(t - 1, 2);
const mod = (a: number, n: number) => ((a % n) + n) % n;

type ReelState = 'idle' | 'wait' | 'windup' | 'accel' | 'spin' | 'stop';

interface Reel {
  el: HTMLElement;
  strip: HTMLElement;
  symbols: readonly Sym[];
  n: number;
  span: number;
  p: number;
  base: number;
  v: number;
  state: ReelState;
  t0: number;
  stopAt: number;
  target: number;
  tween: { from: number; d: number; T: number; start: number } | null;
  lastTick: number;
  thunked: boolean;
}

export function bulbPositions(): { x: number; y: number }[] {
  const W = 520, Hh = 132, inset = 7, top = 17;
  const pts: [number, number][] = [];
  for (let i = 0; i < top; i++) pts.push([inset + 46 + i * ((W - 2 * inset - 92) / (top - 1)), inset]);
  for (let i = 1; i <= 3; i++) pts.push([W - inset, inset + 30 + i * 22]);
  for (let i = top - 1; i >= 0; i--) pts.push([inset + 16 + i * ((W - 2 * inset - 32) / (top - 1)), Hh - inset]);
  for (let i = 3; i >= 1; i--) pts.push([inset, inset + 30 + i * 22]);
  // corners of the rounded top
  pts.splice(0, 0, [inset + 18, inset + 22]);
  pts.splice(top + 1, 0, [W - inset - 18, inset + 22]);
  return pts.map(([x, y]) => ({ x, y }));
}

export function createMachine(els: MachineEls, hooks: MachineHooks) {
  /* ---------------- Reels ---------------- */
  const reels: Reel[] = STRIPS.map(symbols => {
    const el = document.createElement('div');
    el.className = 'reel';
    const strip = document.createElement('div');
    strip.className = 'strip';
    const cells = symbols.map(s => `<div class="cell">${svgFor(s)}</div>`).join('');
    strip.innerHTML = cells + cells + cells;
    el.appendChild(strip);
    els.reels.appendChild(el);
    const n = symbols.length;
    const start = Math.floor(jitter() * n);
    return {
      el, strip, symbols, n, span: n * CELL, p: start * CELL, base: 0, v: 0, state: 'idle', t0: 0,
      stopAt: Infinity, target: start, tween: null, lastTick: start, thunked: false,
    };
  });

  let landed: (() => void) | null = null;
  let spinStarted = 0;

  function drawReel(r: Reel) {
    const y = WINDOW / 2 - CELL / 2 - (r.p + r.span);
    r.strip.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    const idx = Math.floor((r.p + CELL / 2) / CELL);
    if (idx !== r.lastTick) {
      r.lastTick = idx;
      if (r.state !== 'idle') Sound.tick(r.state === 'stop' ? 0.7 : 1);
    }
  }

  function updateReel(r: Reel, now: number, dt: number) {
    switch (r.state) {
      case 'windup': {
        // A little kick upward before the reels let go.
        const t = (now - r.t0) / 160;
        if (t >= 1) {
          r.p = r.base;
          r.state = 'accel';
          r.t0 = now;
        } else {
          r.p = r.base + 0.28 * CELL * Math.sin(Math.PI * t);
        }
        break;
      }
      case 'accel': {
        r.v = Math.min(SPEED, SPEED * (now - r.t0) / 260);
        r.p -= r.v * dt;
        if (r.v >= SPEED) r.state = 'spin';
        if (r.v > SPEED * 0.6) r.strip.classList.add('blur');
        break;
      }
      case 'spin': {
        r.p -= SPEED * dt;
        if (now >= r.stopAt) {
          const remaining = mod(r.p - r.target * CELL, r.span);
          if (remaining <= STOP_DIST && remaining >= STOP_DIST - CELL * 1.5) {
            r.state = 'stop';
            r.tween = { from: r.p, d: remaining, T: BACK_SLOPE * remaining / SPEED, start: now };
            r.thunked = false;
            const next = reels[reels.indexOf(r) + 1];
            if (next) next.stopAt = now + 360;
          }
        }
        break;
      }
      case 'stop': {
        const tw = r.tween!;
        const t = Math.min(1, (now - tw.start) / tw.T);
        r.p = tw.from - tw.d * easeOutBack(t);
        if (t > 0.35) r.strip.classList.remove('blur');
        if (!r.thunked && t >= 1 - BACK_C1 / BACK_C3) {
          r.thunked = true;
          Sound.reelStop();
        }
        if (t >= 1) {
          r.p = r.target * CELL;
          r.state = 'idle';
          r.v = 0;
          if (reels.every(x => x.state === 'idle')) {
            Sound.humStop();
            const done = landed;
            landed = null;
            done?.();
          }
        }
        break;
      }
    }
    r.p = mod(r.p, r.span);
    drawReel(r);
  }

  function startReels() {
    spinStarted = performance.now();
    for (const r of reels) r.el.classList.remove('win');
    reels.forEach((r, i) => {
      r.base = r.p;
      r.state = 'wait';
      r.stopAt = Infinity;
      // Stagger the windup so the reels release one after another.
      setTimeout(() => { r.state = 'windup'; r.t0 = performance.now(); }, i * 70);
    });
    Sound.humStart();
  }

  /** Stop the reels on the server's stops; resolves when the last one has landed. */
  function land(stops: number[]): Promise<void> {
    return new Promise(resolve => {
      landed = resolve;
      reels.forEach((r, i) => { r.target = stops[i]; });
      // Only the first reel gets a stop time; each stopping reel schedules the next.
      reels[0].stopAt = Math.max(performance.now(), spinStarted + MIN_SPIN_MS);
    });
  }

  /** No answer to show (the spin was refused): stop wherever the reels are. */
  function landAnywhere(): Promise<void> {
    return land(reels.map(r => mod(Math.floor(r.p / CELL) - 3, r.n)));
  }

  function markWin(winReels: number[]) {
    winReels.forEach(i => reels[i].el.classList.add('win'));
  }

  /* ---------------- The handle ---------------- */
  const leverSvg = els.lever;
  const q = <T extends Element>(sel: string) => leverSvg.querySelector(sel) as T;
  const rod = q<SVGPolygonElement>('#lever-rod');
  const collar = q<SVGEllipseElement>('#lever-collar');
  const ballShape = q<SVGCircleElement>('#lever-ball-shape');
  const ballShine = q<SVGEllipseElement>('#lever-ball-shine');
  const grab = q<SVGCircleElement>('#lever-grab');

  const PX = 62, PY = 250;       // pivot
  const ARM = 200;               // pivot to ball centre
  const BALL_R = 27;
  const PERSPECTIVE = 700;
  const MAX_ANGLE = 160 * Math.PI / 180;
  const LATCH_ANGLE = MAX_ANGLE * 0.93;
  const TOOTH = 9 * Math.PI / 180; // ratchet tooth spacing

  const lever = {
    theta: 0,
    omega: 0,
    mode: 'rest' as 'rest' | 'auto' | 'hold' | 'drag' | 'spring',
    t0: 0,
    latched: false,
    grabOffset: 0,
    pointerId: -1,
  };

  const depthScale = (th: number) => PERSPECTIVE / (PERSPECTIVE - ARM * Math.sin(th));
  const ballY = (th: number) => PY - ARM * Math.cos(th) * depthScale(th);

  function angleForY(y: number) {
    let lo = -0.12, hi = MAX_ANGLE;
    if (y <= ballY(lo)) return lo;
    if (y >= ballY(hi)) return hi;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (ballY(mid) < y) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  const set = (el: Element, attrs: Record<string, number>) => {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v.toFixed(2));
  };

  function drawLever() {
    const th = lever.theta;
    const s = depthScale(th);
    const bx = PX + (s - 1) * 55;
    const by = ballY(th);
    const r = BALL_R * s;

    // Rod: a tapered bar from the hub to the ball.
    const dx = bx - PX, dy = by - PY;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const w0 = 8, w1 = 6 * s;
    rod.setAttribute('points', [
      [PX + nx * w0, PY + ny * w0],
      [bx + nx * w1, by + ny * w1],
      [bx - nx * w1, by - ny * w1],
      [PX - nx * w0, PY - ny * w0],
    ].map(p => p.map(v => v.toFixed(2)).join(',')).join(' '));

    // Chrome collar where the rod meets the ball
    set(collar, {
      cx: bx - (dx / len) * r * 0.85,
      cy: by - (dy / len) * r * 0.85,
      rx: 10 * s,
      ry: Math.max(2, 5 * s * Math.abs(Math.sin(th)) + 2),
    });
    set(ballShape, { cx: bx, cy: by, r });
    set(ballShine, { cx: bx - r * 0.35, cy: by - r * 0.42, rx: r * 0.3, ry: r * 0.18 });
    set(grab, { cx: bx, cy: by, r: r + 14 });
    leverSvg.setAttribute('aria-valuenow', String(Math.round(Math.max(0, th) / MAX_ANGLE * 100)));
  }

  function ratchetFor(prev: number, next: number) {
    const a = Math.floor(Math.max(0, prev) / TOOTH);
    const b = Math.floor(Math.max(0, next) / TOOTH);
    if (a !== b) Sound.ratchet(next > prev ? 1 : 0.45);
  }

  function latch() {
    if (lever.latched) return;
    lever.latched = true;
    Sound.clunk();
    startReels();
    hooks.onLatch();
  }

  /** SPIN, Max Bet, Space: the handle pulls itself. */
  function pull() {
    Sound.init();
    if (lever.mode !== 'rest' || !hooks.canPull()) return;
    lever.mode = 'auto';
    lever.t0 = performance.now();
    lever.latched = false;
  }

  function release() {
    lever.mode = 'spring';
    lever.omega = 0;
    if (lever.theta > 0.9) Sound.sproing(lever.theta / MAX_ANGLE);
  }

  function updateLever(now: number, dt: number) {
    const prev = lever.theta;
    switch (lever.mode) {
      case 'auto': {
        const t = Math.min(1, (now - lever.t0) / 420);
        // easeInOutSine: the arm starts heavy, speeds up, then lands
        lever.theta = MAX_ANGLE * (0.5 - Math.cos(Math.PI * t) / 2);
        if (t >= 1) {
          latch();
          lever.mode = 'hold';
          lever.t0 = now;
        }
        break;
      }
      case 'hold':
        if (now - lever.t0 > 140) release();
        break;
      case 'spring': {
        // Damped spring back to upright, bouncing off the top stop.
        const sec = Math.min(dt, 32) / 1000;
        const K = 95, C = 11, STOP = -0.1;
        lever.omega += (-K * lever.theta - C * lever.omega) * sec;
        lever.theta += lever.omega * sec;
        if (lever.theta < STOP) {
          lever.theta = STOP;
          if (lever.omega < -1.5) Sound.ratchet(0.35);
          lever.omega = -lever.omega * 0.35;
        }
        if (Math.abs(lever.theta) < 0.002 && Math.abs(lever.omega) < 0.02) {
          lever.theta = 0;
          lever.omega = 0;
          lever.mode = 'rest';
        }
        break;
      }
      default:
        break;
    }
    if (lever.mode !== 'drag') ratchetFor(prev, lever.theta);
    drawLever();
  }

  function svgPoint(evt: PointerEvent) {
    const pt = leverSvg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(leverSvg.getScreenCTM()!.inverse());
  }

  grab.addEventListener('pointerdown', e => {
    Sound.init();
    if (lever.mode !== 'rest' && lever.mode !== 'spring') return;
    if (!hooks.canPull()) return;
    e.preventDefault();
    lever.mode = 'drag';
    lever.latched = false;
    lever.omega = 0;
    lever.pointerId = e.pointerId;
    lever.grabOffset = svgPoint(e).y - ballY(lever.theta);
    leverSvg.classList.add('dragging');
    grab.setPointerCapture(e.pointerId);
  });

  grab.addEventListener('pointermove', e => {
    if (lever.mode !== 'drag' || e.pointerId !== lever.pointerId) return;
    const y = svgPoint(e).y - lever.grabOffset;
    const prev = lever.theta;
    lever.theta = angleForY(y);
    // Once tripped the handle stays at the bottom until released.
    if (lever.latched) lever.theta = Math.max(lever.theta, prev);
    ratchetFor(prev, lever.theta);
    if (lever.theta >= LATCH_ANGLE && !lever.latched) {
      lever.theta = MAX_ANGLE;
      latch();
    }
  });

  function endDrag(e: PointerEvent) {
    if (lever.mode !== 'drag' || e.pointerId !== lever.pointerId) return;
    leverSvg.classList.remove('dragging');
    if (!lever.latched && lever.theta > 0.3) hooks.hint('PULL IT ALL THE WAY DOWN');
    release();
  }
  grab.addEventListener('pointerup', endDrag);
  grab.addEventListener('pointercancel', endDrag);

  // Keyboard on the handle itself
  leverSvg.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      pull();
    }
  });

  /* ---------------- Layout: scale the whole machine to the space left by the casino bar ---------------- */
  function placeLever() {
    // Pivot sits level with the payline.
    let y = 0;
    let el: HTMLElement | null = els.bezel;
    while (el && el !== els.machine) { y += el.offsetTop; el = el.offsetParent as HTMLElement | null; }
    leverSvg.style.top = (y + els.bezel.offsetHeight / 2 - PY) + 'px';
  }

  function fit() {
    els.machine.style.transform = 'none';
    const cs = getComputedStyle(els.stage);
    const availW = els.stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = els.stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const s = Math.max(0.2, Math.min(availW / els.machine.offsetWidth, availH / els.machine.offsetHeight, 1.25));
    els.machine.style.transform = `scale(${s})`;
  }

  function layout() {
    placeLever();
    fit();
  }

  /* ---------------- Main loop ---------------- */
  let last = performance.now();
  let raf = 0;
  function frame(now: number) {
    const dt = Math.min(50, now - last);
    last = now;
    updateLever(now, dt);
    for (const r of reels) updateReel(r, now, dt);
    raf = requestAnimationFrame(frame);
  }

  // The casino bar moves its panes by changing the --grove-bar-* variables on <html>: refit when it does.
  const barWatch = new MutationObserver(fit);
  barWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  const resize = new ResizeObserver(fit);
  resize.observe(els.stage);
  if (document.fonts?.ready) void document.fonts.ready.then(layout);

  layout();
  reels.forEach(drawReel);
  raf = requestAnimationFrame(frame);

  return {
    pull,
    land,
    landAnywhere,
    markWin,
    layout,
    destroy() {
      cancelAnimationFrame(raf);
      barWatch.disconnect();
      resize.disconnect();
    },
  };
}

export type Machine = ReturnType<typeof createMachine>;
