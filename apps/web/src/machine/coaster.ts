// The paper coaster beside the cabinet. Rest it on SPIN and the button stays held down (autoplay);
// drag it off to stop. Pure UI: what a pull does is up to the hooks.
import { jitter } from './jitter.ts';
import { Sound } from './sound.ts';

export interface CoasterHooks {
  /** The coaster now rests on SPIN. */
  onEngage(): void;
  /** The coaster came off SPIN. */
  onRelease(): void;
  hint(text: string): void;
}

const SIZE = 116;
const R = SIZE / 2;
const DRAG_SLOP = 6;   // px of movement before a press counts as a drag

// A pulpboard edge is never a clean circle: a fixed wobble, the same on every load.
function deckledEdge(): string {
  const pts: string[] = [];
  const n = 120;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 56.2 + 0.55 * Math.sin(i * 7.3) + 0.35 * Math.sin(i * 17.9 + 1.3) + 0.25 * Math.cos(i * 31.1);
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

export function coasterSvg(): string {
  return `
<svg viewBox="-60 -60 120 120" width="${SIZE}" height="${SIZE}" aria-hidden="true">
  <defs>
    <radialGradient id="cst-pulp" cx=".42" cy=".38" r=".7">
      <stop offset="0" stop-color="#fbf4e3"/>
      <stop offset=".7" stop-color="#efe3c8"/>
      <stop offset="1" stop-color="#dccaa4"/>
    </radialGradient>
    <filter id="cst-grain" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .45  0 0 0 0 .36  0 0 0 0 .22  0 0 0 .55 -.12"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="cst-stain" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="3"/>
      <feDisplacementMap in="SourceGraphic" scale="3.2"/>
    </filter>
    <path id="cst-ring" d="M0,-38.5 a38.5,38.5 0 1,1 -0.01,0"/>
    <clipPath id="cst-clip"><path d="${deckledEdge()}"/></clipPath>
  </defs>
  <g clip-path="url(#cst-clip)">
    <rect x="-60" y="-60" width="120" height="120" fill="url(#cst-pulp)"/>
    <!-- print -->
    <circle r="50.5" fill="none" stroke="#b3121c" stroke-width="6.5"/>
    <circle r="50.5" fill="none" stroke="#e9b83a" stroke-width="1" stroke-dasharray="1.6 2.4"/>
    <circle r="45.2" fill="none" stroke="#b3121c" stroke-width=".8"/>
    <circle r="31.5" fill="none" stroke="#b3121c" stroke-width=".8"/>
    <text font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700" font-size="8.6"
          letter-spacing=".6" fill="#8c0f17" textLength="236" lengthAdjust="spacing">
      <textPath href="#cst-ring">REST ON SPIN FOR AUTOPLAY ★ CLASSIC 777 LOUNGE ★</textPath>
    </text>
    <text y="9" text-anchor="middle" font-family="'Alfa Slab One', Georgia, serif" font-size="25"
          fill="#c8141f" stroke="#e9b83a" stroke-width="1.1" paint-order="stroke">777</text>
    <text y="19" text-anchor="middle" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700"
          font-size="5.6" letter-spacing="1.4" fill="#8c0f17">LOUNGE</text>
    <text y="-13" text-anchor="middle" font-size="6" fill="#e9b83a">★ ★ ★</text>
    <!-- a glass stood here once -->
    <g filter="url(#cst-stain)" fill="none" stroke-linecap="round">
      <circle cx="9" cy="-7" r="27" stroke="#7a4b18" stroke-opacity=".16" stroke-width="2.4" stroke-dasharray="120 18 30 9"/>
      <circle cx="9" cy="-7" r="25.6" stroke="#7a4b18" stroke-opacity=".07" stroke-width="3.5"/>
    </g>
    <circle cx="-22" cy="26" r="1.6" fill="#7a4b18" fill-opacity=".1"/>
    <circle cx="-17" cy="31" r="1" fill="#7a4b18" fill-opacity=".08"/>
    <!-- pulp grain and a worn edge -->
    <rect x="-60" y="-60" width="120" height="120" fill="#fff" filter="url(#cst-grain)"/>
    <circle r="56" fill="none" stroke="#bfa678" stroke-opacity=".55" stroke-width="2.2"/>
  </g>
</svg>`;
}

export function createCoaster(el: HTMLElement, machine: HTMLElement, spin: HTMLElement, hooks: CoasterHooks) {
  el.innerHTML = coasterSvg();

  let engaged = false;
  let x = 0, y = 0, rot = -11;
  let drag: { id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null;

  // Offsets within the machine, unaffected by its CSS scale.
  function offsetIn(node: HTMLElement) {
    let left = 0, top = 0;
    let n: HTMLElement | null = node;
    while (n && n !== machine) { left += n.offsetLeft; top += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
    return { left, top, width: node.offsetWidth, height: node.offsetHeight };
  }

  /** Beside the cabinet, level with the coin tray. */
  function home() {
    return { x: machine.offsetWidth - SIZE - 4, y: machine.offsetHeight - SIZE - 6, rot: -11 };
  }

  /** Laid over SPIN, a little askew, the way someone would leave it. */
  function onSpin() {
    const b = offsetIn(spin);
    return { x: b.left + b.width / 2 - R + 8, y: b.top + b.height / 2 - R - 2, rot: 7 };
  }

  function overSpin(cx: number, cy: number) {
    const b = offsetIn(spin);
    const pad = 22;
    return cx > b.left - pad && cx < b.left + b.width + pad && cy > b.top - pad && cy < b.top + b.height + pad;
  }

  function place(p: { x: number; y: number; rot: number }, animate: boolean) {
    x = p.x; y = p.y; rot = p.rot;
    el.classList.toggle('settling', animate);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rot}deg)`;
  }

  function engage() {
    place(onSpin(), true);
    Sound.coasterDown();
    if (engaged) return;
    engaged = true;
    el.classList.add('on-spin');
    el.setAttribute('aria-pressed', 'true');
    hooks.onEngage();
  }

  function release(animate = true) {
    place(home(), animate);
    if (!engaged) return;
    engaged = false;
    el.classList.remove('on-spin');
    el.setAttribute('aria-pressed', 'false');
    hooks.onRelease();
  }

  function scale() {
    const w = machine.getBoundingClientRect().width;
    return w / machine.offsetWidth || 1;
  }

  el.addEventListener('pointerdown', e => {
    Sound.init();
    e.preventDefault();
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: x, oy: y, moved: false };
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const s = scale();
    const dx = (e.clientX - drag.sx) / s;
    const dy = (e.clientY - drag.sy) / s;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return;
      drag.moved = true;
      el.classList.add('lifted');
      Sound.paperLift();
      // Lifting it off SPIN lets the button up straight away.
      if (engaged) {
        engaged = false;
        el.classList.remove('on-spin');
        el.setAttribute('aria-pressed', 'false');
        hooks.onRelease();
      }
    }
    const nx = Math.min(machine.offsetWidth - SIZE, Math.max(-SIZE / 3, drag.ox + dx));
    const ny = Math.min(machine.offsetHeight - SIZE / 2, Math.max(0, drag.oy + dy));
    rot = -11 + (nx - drag.ox) * 0.04 + (jitter() - 0.5) * 0.2;
    place({ x: nx, y: ny, rot }, false);
    spin.classList.toggle('coaster-target', overSpin(nx + R, ny + R));
  });

  function endDrag(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    el.classList.remove('lifted');
    spin.classList.remove('coaster-target');
    if (!moved) {
      if (!engaged) hooks.hint('DRAG THE COASTER ONTO SPIN FOR AUTOPLAY');
      return;
    }
    if (overSpin(x + R, y + R)) engage();
    else release();
  }
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  el.addEventListener('lostpointercapture', endDrag);

  // Keyboard: Enter or Space puts it on SPIN or takes it off.
  el.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    Sound.init();
    if (engaged) release(); else engage();
  });

  el.addEventListener('transitionend', () => el.classList.remove('settling'));

  function layout() {
    if (drag) return;
    place(engaged ? onSpin() : home(), false);
  }

  layout();

  return {
    layout,
    /** Take it off SPIN, e.g. when autoplay has to stop. */
    release: () => release(true),
    get engaged() { return engaged; },
  };
}

export type Coaster = ReturnType<typeof createCoaster>;
