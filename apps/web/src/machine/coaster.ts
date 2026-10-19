// The beer coaster beside the cabinet. It lies flat on the counter; dropped on SPIN it flips up onto
// its edge, wedged between the button and the cabinet, and holds the button down (autoplay).
// Drag it out again to stop. Pure UI: what a pull does is up to the hooks.
import { Sound } from './sound.ts';

export interface CoasterHooks {
  /** The coaster now holds SPIN down. */
  onEngage(): void;
  /** The coaster came off SPIN. */
  onRelease(): void;
  hint(text: string): void;
}

/** The name on the banner: the house beer of the lounge the machine stands in. */
export const COASTER_NAME = 'Grove';

const SIZE = 116;
const R = SIZE / 2;
const DRAG_SLOP = 6;   // px of movement before a press counts as a drag

/** How the coaster sits: its bottom edge's centre (machine px), tilt back, turn, size. */
interface Pose { bx: number; by: number; tilt: number; turn: number; scale: number }

// Die-cut pulpboard is never a perfect circle: a fixed, faint wobble.
function edge(): string {
  const pts: string[] = [];
  const n = 120;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 56.4 + 0.35 * Math.sin(i * 7.3) + 0.25 * Math.sin(i * 17.9 + 1.3) + 0.15 * Math.cos(i * 31.1);
    pts.push(`${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.4 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(' ');
}

export function coasterSvg(): string {
  // The red caps: lenses cut from a circle inside the rim, leaving a cream band for the ribbon.
  const cap = (s: 1 | -1) => `M-40.4,${-19.5 * s} A45,45 0 0,${s > 0 ? 1 : 0} 40.4,${-19.5 * s} Q0,${-8.5 * s} -40.4,${-19.5 * s}Z`;
  return `
<svg viewBox="-60 -60 120 120" width="${SIZE}" height="${SIZE}" aria-hidden="true">
  <defs>
    <radialGradient id="cst-pulp" cx=".45" cy=".4" r=".72">
      <stop offset="0" stop-color="#fbf8ef"/>
      <stop offset=".75" stop-color="#f1ebdb"/>
      <stop offset="1" stop-color="#e2d8c0"/>
    </radialGradient>
    <filter id="cst-grain" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="11" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .42  0 0 0 0 .36  0 0 0 0 .26  0 0 0 .32 -.1"/>
      <feComposite in2="SourceGraphic" operator="in"/>
    </filter>
    <filter id="cst-ink" x="-5%" y="-5%" width="110%" height="110%">
      <!-- Letterpress ink on pulp: edges that wander a hair. -->
      <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="4"/>
      <feDisplacementMap in="SourceGraphic" scale=".7"/>
    </filter>
    <clipPath id="cst-clip"><path d="${edge()}"/></clipPath>
  </defs>
  <g clip-path="url(#cst-clip)">
    <rect x="-60" y="-60" width="120" height="120" fill="url(#cst-pulp)"/>
    <g filter="url(#cst-ink)">
      <circle r="49" fill="none" stroke="#151313" stroke-width="2.2"/>
      <path d="${cap(1)}" fill="#e2231a"/>
      <path d="${cap(-1)}" fill="#e2231a"/>
      <polygon points="${star(0, -31.5, 7.6)}" fill="#fbf8ef"/>
      <!-- the ribbon: tails first, folds, then the band -->
      <polygon points="-36,-6 -53,-6 -47.5,1.5 -53,9 -36,9" fill="#151313"/>
      <polygon points="36,-6 53,-6 47.5,1.5 53,9 36,9" fill="#151313"/>
      <polygon points="-36,9 -31,13 -31,9" fill="#000"/>
      <polygon points="36,9 31,13 31,9" fill="#000"/>
      <polyline points="-36,-4 -50,-4 -45.5,1.5 -50,7 -36,7" fill="none" stroke="#fbf8ef" stroke-width=".7"/>
      <polyline points="36,-4 50,-4 45.5,1.5 50,7 36,7" fill="none" stroke="#fbf8ef" stroke-width=".7"/>
      <rect x="-37" y="-12.5" width="74" height="22" rx="1.5" fill="#151313"/>
      <rect x="-34.8" y="-10.3" width="69.6" height="17.6" rx="1" fill="none" stroke="#fbf8ef" stroke-width=".8"/>
      <text y="4.6" text-anchor="middle" font-family="'Alfa Slab One', 'Rockwell', Georgia, serif" font-size="15"
            letter-spacing=".4" fill="#fbf8ef">${COASTER_NAME}</text>
      <text y="36.5" text-anchor="middle" font-family="'Yellowtail', 'Brush Script MT', cursive" font-size="19"
            fill="#fbf8ef" stroke="#fbf8ef" stroke-width=".35">bier</text>
      <text y="54.6" text-anchor="middle" font-family="'Barlow Condensed', 'Arial Narrow', sans-serif" font-weight="700"
            font-size="3.6" letter-spacing=".3" fill="#e2231a">C-7</text>
    </g>
    <!-- pulp grain and a soft, handled edge -->
    <rect x="-60" y="-60" width="120" height="120" fill="#fff" filter="url(#cst-grain)"/>
    <circle r="56.4" fill="none" stroke="#cbbd9c" stroke-opacity=".7" stroke-width="1.6"/>
  </g>
</svg>`;
}

export function createCoaster(el: HTMLElement, machine: HTMLElement, spin: HTMLElement, hooks: CoasterHooks) {
  el.innerHTML = coasterSvg();

  let engaged = false;
  let pose: Pose = { bx: 0, by: 0, tilt: 64, turn: -14, scale: 1 };
  let drag: { id: number; sx: number; sy: number; o: Pose; moved: boolean } | null = null;

  // Offsets within the machine, unaffected by its CSS scale.
  function offsetIn(node: HTMLElement) {
    let left = 0, top = 0;
    let n: HTMLElement | null = node;
    while (n && n !== machine) { left += n.offsetLeft; top += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
    return { left, top, width: node.offsetWidth, height: node.offsetHeight };
  }

  /** Flat on the counter beside the cabinet, seen in perspective. */
  function home(): Pose {
    return { bx: machine.offsetWidth - R - 6, by: machine.offsetHeight - 10, tilt: 64, turn: -14, scale: 1 };
  }

  /** Stood on its edge behind SPIN: the button covers its foot and is held down by it. */
  function standing(): Pose {
    const b = offsetIn(spin);
    return { bx: b.left + b.width / 2 + 24, by: b.top + b.height * 0.62, tilt: 0, turn: -5, scale: 0.86 };
  }

  const css = (p: Pose) =>
    `translate(${(p.bx - R).toFixed(1)}px, ${(p.by - SIZE).toFixed(1)}px) perspective(700px) ` +
    `rotateX(${p.tilt.toFixed(1)}deg) rotateZ(${p.turn.toFixed(1)}deg) scale(${p.scale})`;

  function apply(p: Pose, animate: 'none' | 'settle') {
    pose = p;
    el.classList.toggle('settling', animate === 'settle');
    el.style.transform = css(p);
  }

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function setEngaged(on: boolean) {
    if (engaged === on) return;
    engaged = on;
    el.classList.toggle('on-spin', on);
    el.setAttribute('aria-pressed', String(on));
    if (on) hooks.onEngage(); else hooks.onRelease();
  }

  function engage() {
    const from = css(pose);
    const to = standing();
    apply(to, 'none');
    if (!reducedMotion()) {
      // Lands flat on the button deck, then flips up onto its edge, rocks back once and settles.
      el.animate([
        { transform: from, offset: 0 },
        { transform: css({ ...to, by: to.by - 24, tilt: 80, turn: to.turn - 8, scale: 0.9 }), offset: 0.3, easing: 'cubic-bezier(.5, 0, .7, .4)' },
        { transform: css({ ...to, tilt: -10 }), offset: 0.72, easing: 'ease-out' },
        { transform: css({ ...to, tilt: 3 }), offset: 0.87, easing: 'ease-in-out' },
        { transform: css(to), offset: 1 },
      ], { duration: 700 });
    }
    Sound.paperLift();
    window.setTimeout(() => Sound.coasterDown(), reducedMotion() ? 0 : 480);
    setEngaged(true);
  }

  function release(animate = true) {
    apply(home(), animate ? 'settle' : 'none');
    setEngaged(false);
  }

  function scale() {
    return machine.getBoundingClientRect().width / machine.offsetWidth || 1;
  }

  /** Is the pointer over SPIN (with a forgiving margin)? */
  function pointerOverSpin(clientX: number, clientY: number) {
    const m = machine.getBoundingClientRect();
    const s = scale();
    const px = (clientX - m.left) / s, py = (clientY - m.top) / s;
    const b = offsetIn(spin);
    const pad = 30;
    return px > b.left - pad && px < b.left + b.width + pad && py > b.top - pad - 20 && py < b.top + b.height + pad;
  }

  el.addEventListener('pointerdown', e => {
    Sound.init();
    e.preventDefault();
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, o: { ...pose }, moved: false };
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
      // Pulling it out from behind SPIN lets the button up straight away.
      setEngaged(false);
    }
    const bx = Math.min(machine.offsetWidth - R / 2, Math.max(R / 2, drag.o.bx + dx));
    const by = Math.min(machine.offsetHeight + 10, Math.max(SIZE, drag.o.by + dy));
    // In the hand: half tipped towards you, turning a little with the movement.
    apply({ bx, by, tilt: 30, turn: -8 + Math.max(-10, Math.min(10, dx * 0.05)), scale: 1.04 }, 'none');
    spin.classList.toggle('coaster-target', pointerOverSpin(e.clientX, e.clientY));
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
    if (e.type === 'pointerup' && pointerOverSpin(e.clientX, e.clientY)) engage();
    else release();
  }
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  el.addEventListener('lostpointercapture', endDrag);

  // Keyboard: Enter or Space stands it on SPIN or takes it off.
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
    apply(engaged ? standing() : home(), 'none');
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
