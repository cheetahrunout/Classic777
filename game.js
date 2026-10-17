(() => {
  'use strict';

  /* ================================================================
   * Sound: everything is synthesized with Web Audio, no sample files.
   * ================================================================ */
  const Sound = (() => {
    let ctx = null, master = null, noise = null, hum = null;
    let enabled = true;

    function init() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = enabled ? 0.8 : 0;
      master.connect(comp).connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }

    const ready = () => ctx && enabled;

    function envelope(g, t, attack, peak, decay) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }

    function burst(t, dur, type, freq, q, vol) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      envelope(g, t, 0.002, vol, dur);
      src.connect(f).connect(g).connect(master);
      src.start(t, Math.random() * 0.8);
      src.stop(t + dur + 0.05);
    }

    function tone(t, type, f0, f1, dur, vol, attack = 0.003) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
      const g = ctx.createGain();
      envelope(g, t, attack, vol, dur);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + attack + dur + 0.05);
    }

    function bell(t, f, vol) {
      const partials = [[1, 1, 1.3], [2.76, 0.45, 0.8], [5.4, 0.22, 0.45], [8.93, 0.1, 0.25]];
      for (const [mult, amp, decay] of partials) tone(t, 'sine', f * mult, f * mult, decay, vol * amp, 0.002);
    }

    return {
      init,
      get enabled() { return enabled; },
      setEnabled(on) {
        enabled = on;
        if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.02);
      },
      // One tooth of the handle's ratchet.
      ratchet(vol = 1) {
        if (!ready()) return;
        const t = ctx.currentTime;
        burst(t, 0.03, 'bandpass', 2600 + Math.random() * 900, 5, 0.55 * vol);
        tone(t, 'square', 1500, 900, 0.015, 0.05 * vol);
      },
      // Handle hits the bottom stop and trips the reels.
      clunk() {
        if (!ready()) return;
        const t = ctx.currentTime;
        tone(t, 'sine', 150, 42, 0.28, 0.9);
        burst(t, 0.09, 'lowpass', 800, 1, 0.8);
        tone(t + 0.004, 'triangle', 640, 610, 0.4, 0.07);
        tone(t + 0.004, 'sine', 1330, 1300, 0.3, 0.05);
      },
      // Return spring.
      sproing(vol = 1) {
        if (!ready()) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(190, t);
        o.frequency.exponentialRampToValueAtTime(95, t + 0.7);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 26;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(70, t);
        depth.gain.exponentialRampToValueAtTime(1, t + 0.7);
        lfo.connect(depth).connect(o.frequency);
        const g = ctx.createGain();
        envelope(g, t, 0.005, 0.22 * vol, 0.7);
        o.connect(g).connect(master);
        o.start(t); lfo.start(t);
        o.stop(t + 0.8); lfo.stop(t + 0.8);
        burst(t, 0.05, 'highpass', 3000, 1, 0.25 * vol);
      },
      // A symbol passing the payline.
      tick(vol = 1) {
        if (!ready()) return;
        burst(ctx.currentTime, 0.014, 'highpass', 2200, 0.8, 0.09 * vol);
      },
      reelStop() {
        if (!ready()) return;
        const t = ctx.currentTime;
        tone(t, 'sine', 210, 60, 0.16, 0.75);
        burst(t, 0.06, 'bandpass', 1200, 2, 0.6);
        tone(t, 'square', 95, 70, 0.05, 0.06);
      },
      humStart() {
        if (!ctx || hum) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 54;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 240;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.25);
        o.connect(f).connect(g).connect(master);
        o.start(t);
        hum = { o, g };
      },
      humStop() {
        if (!hum) return;
        const t = ctx.currentTime;
        hum.g.gain.setTargetAtTime(0.0001, t, 0.08);
        hum.o.stop(t + 0.5);
        hum = null;
      },
      coin() {
        if (!ready()) return;
        const t = ctx.currentTime;
        const f = 2000 + Math.random() * 300;
        tone(t, 'sine', f, f, 0.09, 0.12);
        tone(t + 0.01, 'sine', f * 1.5, f * 1.5, 0.07, 0.07);
      },
      fanfare(level) {
        if (!ready()) return;
        const t = ctx.currentTime;
        const notes = level >= 3 ? [784, 988, 1175, 1568, 1175, 1568, 1976, 2349]
          : level === 2 ? [784, 988, 1175, 1568]
          : [988, 1319];
        const step = level >= 3 ? 0.11 : 0.13;
        notes.forEach((f, i) => bell(t + i * step, f, 0.22));
        if (level >= 3) {
          for (let i = 0; i < 6; i++) bell(t + 1 + i * 0.22, i % 2 ? 1568 : 1319, 0.2);
        }
      }
    };
  })();

  /* ================================================================
   * Symbols, reel strips and the pay table
   * ================================================================ */
  const SYM = { SEVEN: 'SEVEN', BAR3: 'BAR3', BAR2: 'BAR2', BAR1: 'BAR1', BELL: 'BELL', CHERRY: 'CHERRY', BLANK: 'BLANK' };
  const BARS = [SYM.BAR1, SYM.BAR2, SYM.BAR3];

  function barsSvg(n) {
    const h = n === 1 ? 30 : n === 2 ? 25 : 20;
    const gap = 5;
    const total = n * h + (n - 1) * gap;
    let y = (80 - total) / 2;
    let out = '';
    for (let i = 0; i < n; i++, y += h + gap) {
      out += `<rect x="9" y="${y}" width="82" height="${h}" rx="4" fill="#141113" stroke="url(#g-gold)" stroke-width="2"/>` +
        `<text x="50" y="${y + h * 0.79}" text-anchor="middle" font-family="'Alfa Slab One', Georgia, serif" font-size="${h * 0.82}" letter-spacing="2" fill="#f7f1e1">BAR</text>`;
    }
    return out;
  }

  const ART = {
    SEVEN:
      `<text x="50" y="74" text-anchor="middle" font-family="'Alfa Slab One', Georgia, serif" font-size="86" fill="none" stroke="url(#g-gold)" stroke-width="9" stroke-linejoin="round">7</text>` +
      `<text x="50" y="74" text-anchor="middle" font-family="'Alfa Slab One', Georgia, serif" font-size="86" fill="url(#g-seven)" stroke="#4d0308" stroke-width="2.5" stroke-linejoin="round">7</text>`,
    BAR3: barsSvg(3),
    BAR2: barsSvg(2),
    BAR1: barsSvg(1),
    BELL:
      `<path d="M50 8 C33 8 28 26 28 42 C28 50 24 55 19 60 L81 60 C76 55 72 50 72 42 C72 26 67 8 50 8 Z" fill="url(#g-gold)" stroke="#6b4206" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M38 20 C34 28 34 38 34 46" fill="none" stroke="#fffbe0" stroke-width="4" stroke-linecap="round" opacity=".7"/>` +
      `<rect x="16" y="58" width="68" height="7" rx="3.5" fill="url(#g-gold)" stroke="#6b4206" stroke-width="2"/>` +
      `<circle cx="50" cy="71" r="7" fill="url(#g-gold)" stroke="#6b4206" stroke-width="2"/>` +
      `<circle cx="50" cy="7" r="4.5" fill="url(#g-gold)" stroke="#6b4206" stroke-width="2"/>`,
    CHERRY:
      `<path d="M36 50 C40 32 50 18 62 10 M66 48 C64 32 63 20 62 10" fill="none" stroke="#2f6b1c" stroke-width="3.5" stroke-linecap="round"/>` +
      `<path d="M62 10 C70 2 84 4 88 12 C78 16 68 16 62 10 Z" fill="#3f9a2a" stroke="#1f4d12" stroke-width="1.5"/>` +
      `<circle cx="35" cy="59" r="16" fill="url(#g-cherry)" stroke="#4d0308" stroke-width="2"/>` +
      `<circle cx="66" cy="57" r="16" fill="url(#g-cherry)" stroke="#4d0308" stroke-width="2"/>` +
      `<ellipse cx="29" cy="53" rx="4" ry="2.6" fill="#fff" opacity=".75"/>` +
      `<ellipse cx="60" cy="51" rx="4" ry="2.6" fill="#fff" opacity=".75"/>`,
    BLANK: ''
  };

  const svgFor = (id) => `<svg viewBox="0 0 100 80" aria-hidden="true">${ART[id]}</svg>`;

  // Base pay per coin. The 3-coin 777 pays a bonus jackpot.
  const PAYS = [
    { key: 'SEVEN', icons: ['SEVEN', 'SEVEN', 'SEVEN'], pays: [300, 600, 1500], label: '' },
    { key: 'BAR3', icons: ['BAR3', 'BAR3', 'BAR3'], pays: [100, 200, 300], label: '' },
    { key: 'BAR2', icons: ['BAR2', 'BAR2', 'BAR2'], pays: [50, 100, 150], label: '' },
    { key: 'BAR1', icons: ['BAR1', 'BAR1', 'BAR1'], pays: [25, 50, 75], label: '' },
    { key: 'CHERRY3', icons: ['CHERRY', 'CHERRY', 'CHERRY'], pays: [25, 50, 75], label: '' },
    { key: 'BELL', icons: ['BELL', 'BELL', 'BELL'], pays: [20, 40, 60], label: '' },
    { key: 'ANYBAR', icons: ['BAR1', 'BAR2', 'BAR3'], pays: [10, 20, 30], label: 'Any' },
    { key: 'CHERRY2', icons: ['CHERRY', 'CHERRY'], pays: [6, 12, 18], label: 'Any 2' },
    { key: 'CHERRY1', icons: ['CHERRY'], pays: [2, 4, 6], label: 'Any 1' }
  ];
  const PAY_BY_KEY = Object.fromEntries(PAYS.map(p => [p.key, p]));

  function evaluate(line) {
    const [a, b, c] = line;
    const all = (k) => a === k && b === k && c === k;
    let key = null, reels = [];
    if (a !== SYM.BLANK && all(a)) {
      key = a === SYM.CHERRY ? 'CHERRY3' : a;
      reels = [0, 1, 2];
    } else if (line.every(s => BARS.includes(s))) {
      key = 'ANYBAR';
      reels = [0, 1, 2];
    } else {
      const cherries = line.map((s, i) => s === SYM.CHERRY ? i : -1).filter(i => i >= 0);
      if (cherries.length === 2) key = 'CHERRY2';
      if (cherries.length === 1) key = 'CHERRY1';
      reels = cherries;
    }
    return key ? { key, reels } : null;
  }

  // Deterministic shuffle so each reel has its own fixed strip order.
  function seeded(seed) {
    return () => {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeStrip(seed) {
    const symbols = ['SEVEN', 'BAR3', 'BAR2', 'BAR2', 'BAR1', 'BAR1', 'BAR1', 'BELL', 'BELL', 'CHERRY', 'CHERRY'];
    const rand = seeded(seed);
    for (let i = symbols.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
    }
    return symbols.flatMap(s => [s, SYM.BLANK]);
  }

  function randomInt(n) {
    if (window.crypto && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / n) * n;
      do crypto.getRandomValues(buf); while (buf[0] >= limit);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  /* ================================================================
   * DOM
   * ================================================================ */
  const $ = (id) => document.getElementById(id);
  const machineEl = $('machine');
  const creditsEl = $('credits');
  const betEl = $('bet');
  const winEl = $('win');
  const messageEl = $('message');
  const tickerEl = messageEl.parentElement;
  const btnSpin = $('btn-spin');
  const btnBet = $('btn-bet');
  const btnMax = $('btn-max');
  const btnSound = $('btn-sound');
  const btnRefill = $('btn-refill');
  const tray = $('tray');

  // Pay table rows
  const payBody = $('paytable-body');
  for (const p of PAYS) {
    const tr = document.createElement('tr');
    tr.dataset.key = p.key;
    if (p.key === 'SEVEN') tr.className = 'jackpot-row';
    const icons = p.icons.map(svgFor).join('');
    tr.innerHTML = `<td><span class="icons">${icons}</span>${p.label ? `<span class="row-label">${p.label}</span>` : ''}</td>` +
      p.pays.map((v, i) => `<td data-col="${i + 1}">${v}</td>`).join('');
    payBody.appendChild(tr);
  }

  // Marquee bulbs around the topper
  (function placeBulbs() {
    const host = $('bulbs');
    const W = 520, Hh = 132, inset = 7;
    const pts = [];
    const top = 17;
    for (let i = 0; i < top; i++) pts.push([inset + 46 + i * ((W - 2 * inset - 92) / (top - 1)), inset]);
    for (let i = 1; i <= 3; i++) pts.push([W - inset, inset + 30 + i * 22]);
    for (let i = top - 1; i >= 0; i--) pts.push([inset + 16 + i * ((W - 2 * inset - 32) / (top - 1)), Hh - inset]);
    for (let i = 3; i >= 1; i--) pts.push([inset, inset + 30 + i * 22]);
    // corners of the rounded top
    pts.splice(0, 0, [inset + 18, inset + 22]);
    pts.splice(top + 1, 0, [W - inset - 18, inset + 22]);
    pts.forEach(([x, y], i) => {
      const b = document.createElement('span');
      b.className = 'bulb';
      b.style.left = x + 'px';
      b.style.top = y + 'px';
      b.style.setProperty('--i', i);
      host.appendChild(b);
    });
  })();

  /* ================================================================
   * Reels
   * ================================================================ */
  const CELL = 96;
  const WINDOW = 240;
  const SPEED = 2.5;          // px per ms at full spin
  const BACK_C1 = 0.6;        // easeOutBack overshoot
  const BACK_C3 = BACK_C1 + 1;
  const BACK_SLOPE = 3 * BACK_C3 - 2 * BACK_C1; // f'(0), to match spin speed going into the stop
  const STOP_DIST = 4 * CELL;

  const easeOutBack = (t) => 1 + BACK_C3 * Math.pow(t - 1, 3) + BACK_C1 * Math.pow(t - 1, 2);
  const mod = (a, n) => ((a % n) + n) % n;

  const reelsHost = $('reels');
  const reels = [0, 1, 2].map(i => {
    const symbols = makeStrip(777 + i * 31);
    const el = document.createElement('div');
    el.className = 'reel';
    const strip = document.createElement('div');
    strip.className = 'strip';
    const cells = symbols.map(s => `<div class="cell">${svgFor(s)}</div>`).join('');
    strip.innerHTML = cells + cells + cells;
    el.appendChild(strip);
    reelsHost.appendChild(el);
    const n = symbols.length;
    const start = randomInt(n);
    return {
      el, strip, symbols, n,
      span: n * CELL,
      p: start * CELL,   // p / CELL = index of the symbol on the payline
      v: 0,
      state: 'idle',
      t0: 0,
      stopAt: Infinity,
      target: start,
      tween: null,
      lastTick: start,
      thunked: false
    };
  });

  function drawReel(r) {
    const y = WINDOW / 2 - CELL / 2 - (r.p + r.span);
    r.strip.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
    const idx = Math.floor((r.p + CELL / 2) / CELL);
    if (idx !== r.lastTick) {
      r.lastTick = idx;
      if (r.state !== 'idle') Sound.tick(r.state === 'stop' ? 0.7 : 1);
    }
  }

  function updateReel(r, now, dt) {
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
        const tw = r.tween;
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
          onReelStopped();
        }
        break;
      }
    }
    r.p = mod(r.p, r.span);
    drawReel(r);
  }

  /* ================================================================
   * Game state
   * ================================================================ */
  const STORE_KEY = 'classic777.credits';
  let credits = 100;
  try {
    const saved = parseInt(localStorage.getItem(STORE_KEY), 10);
    if (Number.isFinite(saved) && saved >= 0) credits = saved;
  } catch (e) { /* storage unavailable */ }

  let bet = 1;
  let busy = false;          // reels spinning or paying out
  let shownCredits = credits;

  function save() {
    try { localStorage.setItem(STORE_KEY, String(credits)); } catch (e) { /* ignore */ }
  }

  function setMessage(text, alert = false) {
    messageEl.textContent = text;
    tickerEl.classList.toggle('alert', alert);
  }

  function render() {
    creditsEl.textContent = shownCredits;
    betEl.textContent = bet;
    document.querySelectorAll('.paytable [data-col]').forEach(cell => {
      cell.classList.toggle('active', Number(cell.dataset.col) === bet);
    });
    btnSpin.disabled = busy;
    btnBet.disabled = busy;
    btnMax.disabled = busy;
    btnRefill.hidden = busy || credits >= 1;
  }

  function canSpin() {
    if (busy) return false;
    if (credits < 1) {
      setMessage('OUT OF CREDITS', true);
      return false;
    }
    if (credits < bet) {
      bet = credits;
      render();
    }
    return true;
  }

  function startSpin() {
    busy = true;
    credits -= bet;
    shownCredits = credits;
    save();
    winEl.textContent = '0';
    machineEl.classList.remove('winning', 'jackpot');
    document.querySelectorAll('.reel.win, tr.hit').forEach(el => el.classList.remove('win', 'hit'));
    setMessage('GOOD LUCK!');
    render();

    const now = performance.now();
    reels.forEach((r, i) => {
      r.target = randomInt(r.n);
      r.base = r.p;
      r.state = 'wait';
      // Only the first reel gets a stop time; each stopping reel schedules the next.
      r.stopAt = i === 0 ? now + 1050 : Infinity;
      // Stagger the windup so the reels release one after another.
      setTimeout(() => { r.state = 'windup'; r.t0 = performance.now(); }, i * 70);
    });
    Sound.humStart();
  }

  function onReelStopped() {
    if (reels.some(r => r.state !== 'idle')) return;
    Sound.humStop();
    const line = reels.map(r => r.symbols[r.target]);
    const result = evaluate(line);
    if (!result) {
      setMessage(credits > 0 ? 'PULL AGAIN' : 'OUT OF CREDITS', credits === 0);
      busy = false;
      render();
      return;
    }
    const pay = PAY_BY_KEY[result.key].pays[bet - 1];
    result.reels.forEach(i => reels[i].el.classList.add('win'));
    document.querySelector(`tr[data-key="${result.key}"]`).classList.add('hit');
    const level = result.key === 'SEVEN' ? 3 : pay >= 50 ? 2 : 1;
    machineEl.classList.add(level === 3 ? 'jackpot' : 'winning');
    setMessage(level === 3 ? `JACKPOT!  ${pay} CREDITS` : `WINNER  ${pay} CREDITS`, true);
    Sound.fanfare(level);
    payout(pay, level);
  }

  function payout(amount, level) {
    credits += amount;
    save();
    const steps = Math.min(amount, level === 3 ? 60 : 30);
    const interval = level === 3 ? 60 : 75;
    let paid = 0, step = 0;
    const startDelay = level === 3 ? 900 : 350;
    setTimeout(function tick() {
      step++;
      paid = Math.round(amount * step / steps);
      winEl.textContent = paid;
      shownCredits = credits - amount + paid;
      creditsEl.textContent = shownCredits;
      Sound.coin();
      if (step % 2 === 1) dropCoin();
      if (step < steps) {
        setTimeout(tick, interval);
      } else {
        shownCredits = credits;
        busy = false;
        setTimeout(() => machineEl.classList.remove('winning', 'jackpot'), 1200);
        render();
      }
    }, startDelay);
  }

  function dropCoin() {
    if (tray.childElementCount > 24) tray.children[1].remove();
    const c = document.createElement('span');
    c.className = 'coin';
    c.style.left = (12 + Math.random() * 360) + 'px';
    c.style.setProperty('--fall', (40 + Math.random() * 12) + 'px');
    c.style.setProperty('--spin', (Math.random() * 400 - 200) + 'deg');
    tray.appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }

  /* ================================================================
   * The handle
   * ================================================================ */
  const leverSvg = $('lever');
  const rod = $('lever-rod');
  const collar = $('lever-collar');
  const ballShape = $('lever-ball-shape');
  const ballShine = $('lever-ball-shine');
  const grab = $('lever-grab');

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
    mode: 'rest',   // rest | auto | hold | drag | spring
    t0: 0,
    latched: false,
    tooth: 0,
    grabOffset: 0,
    pointerId: null
  };

  const depthScale = (th) => PERSPECTIVE / (PERSPECTIVE - ARM * Math.sin(th));
  const ballY = (th) => PY - ARM * Math.cos(th) * depthScale(th);

  function angleForY(y) {
    let lo = -0.12, hi = MAX_ANGLE;
    if (y <= ballY(lo)) return lo;
    if (y >= ballY(hi)) return hi;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (ballY(mid) < y) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

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
      [PX - nx * w0, PY - ny * w0]
    ].map(p => p.map(v => v.toFixed(2)).join(',')).join(' '));

    // Chrome collar where the rod meets the ball
    const cx = bx - (dx / len) * r * 0.85;
    const cy = by - (dy / len) * r * 0.85;
    collar.setAttribute('cx', cx.toFixed(2));
    collar.setAttribute('cy', cy.toFixed(2));
    collar.setAttribute('rx', (10 * s).toFixed(2));
    collar.setAttribute('ry', (Math.max(2, 5 * s * Math.abs(Math.sin(th)) + 2)).toFixed(2));

    ballShape.setAttribute('cx', bx.toFixed(2));
    ballShape.setAttribute('cy', by.toFixed(2));
    ballShape.setAttribute('r', r.toFixed(2));
    ballShine.setAttribute('cx', (bx - r * 0.35).toFixed(2));
    ballShine.setAttribute('cy', (by - r * 0.42).toFixed(2));
    ballShine.setAttribute('rx', (r * 0.3).toFixed(2));
    ballShine.setAttribute('ry', (r * 0.18).toFixed(2));
    grab.setAttribute('cx', bx.toFixed(2));
    grab.setAttribute('cy', by.toFixed(2));
    grab.setAttribute('r', (r + 14).toFixed(2));

    leverSvg.setAttribute('aria-valuenow', Math.round(Math.max(0, th) / MAX_ANGLE * 100));
  }

  function ratchetFor(prev, next) {
    const a = Math.floor(Math.max(0, prev) / TOOTH);
    const b = Math.floor(Math.max(0, next) / TOOTH);
    if (a !== b) Sound.ratchet(next > prev ? 1 : 0.45);
  }

  function latch() {
    if (lever.latched) return;
    lever.latched = true;
    Sound.clunk();
    startSpin();
  }

  function pullHandle() {
    Sound.init();
    if (lever.mode !== 'rest' || !canSpin()) return;
    lever.mode = 'auto';
    lever.t0 = performance.now();
    lever.latched = false;
    btnSpin.classList.add('pressed');
    setTimeout(() => btnSpin.classList.remove('pressed'), 140);
  }

  function release() {
    lever.mode = 'spring';
    lever.omega = 0;
    if (lever.theta > 0.9) Sound.sproing(lever.theta / MAX_ANGLE);
  }

  function updateLever(now, dt) {
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
    }
    if (lever.mode !== 'drag') ratchetFor(prev, lever.theta);
    drawLever();
  }

  function svgPoint(evt) {
    const pt = leverSvg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(leverSvg.getScreenCTM().inverse());
  }

  grab.addEventListener('pointerdown', (e) => {
    Sound.init();
    if (lever.mode !== 'rest' && lever.mode !== 'spring') return;
    if (busy) {
      setMessage('REELS ARE SPINNING');
      return;
    }
    if (!canSpin()) return;
    e.preventDefault();
    lever.mode = 'drag';
    lever.latched = false;
    lever.omega = 0;
    lever.pointerId = e.pointerId;
    lever.grabOffset = svgPoint(e).y - ballY(lever.theta);
    leverSvg.classList.add('dragging');
    grab.setPointerCapture(e.pointerId);
  });

  grab.addEventListener('pointermove', (e) => {
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

  function endDrag(e) {
    if (lever.mode !== 'drag' || e.pointerId !== lever.pointerId) return;
    leverSvg.classList.remove('dragging');
    if (!lever.latched && lever.theta > 0.3) setMessage('PULL IT ALL THE WAY DOWN');
    release();
  }
  grab.addEventListener('pointerup', endDrag);
  grab.addEventListener('pointercancel', endDrag);

  // Keyboard on the handle itself
  leverSvg.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      pullHandle();
    }
  });

  /* ================================================================
   * Buttons & keys
   * ================================================================ */
  btnSpin.addEventListener('click', pullHandle);

  btnBet.addEventListener('click', () => {
    Sound.init();
    if (busy) return;
    bet = bet % 3 + 1;
    if (bet > Math.max(1, credits)) bet = 1;
    Sound.coin();
    render();
  });

  btnMax.addEventListener('click', () => {
    Sound.init();
    if (busy) return;
    bet = Math.max(1, Math.min(3, credits));
    Sound.coin();
    render();
    pullHandle();
  });

  btnSound.addEventListener('click', () => {
    Sound.init();
    const on = !Sound.enabled;
    Sound.setEnabled(on);
    btnSound.setAttribute('aria-pressed', String(on));
    btnSound.innerHTML = `Sound<br>${on ? 'On' : 'Off'}`;
  });

  btnRefill.addEventListener('click', () => {
    Sound.init();
    credits += 100;
    shownCredits = credits;
    save();
    for (let i = 0; i < 8; i++) setTimeout(() => { Sound.coin(); dropCoin(); }, i * 70);
    setMessage('PULL THE HANDLE');
    render();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('button, #lever')) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      pullHandle();
    }
  });

  /* ================================================================
   * Layout: scale the whole machine to the window
   * ================================================================ */
  function placeLever() {
    // Pivot sits level with the payline.
    const bezel = document.querySelector('.reel-bezel');
    let y = 0, el = bezel;
    while (el && el !== machineEl) { y += el.offsetTop; el = el.offsetParent; }
    leverSvg.style.top = (y + bezel.offsetHeight / 2 - PY) + 'px';
  }

  function fit() {
    machineEl.style.transform = 'none';
    const stage = $('stage');
    const cs = getComputedStyle(stage);
    const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const s = Math.min(availW / machineEl.offsetWidth, availH / machineEl.offsetHeight, 1.25);
    machineEl.style.transform = `scale(${s})`;
  }

  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { placeLever(); fit(); });

  /* ================================================================
   * Main loop
   * ================================================================ */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last);
    last = now;
    updateLever(now, dt);
    for (const r of reels) updateReel(r, now, dt);
    requestAnimationFrame(frame);
  }

  placeLever();
  fit();
  render();
  setMessage(credits > 0 ? 'PULL THE HANDLE' : 'OUT OF CREDITS', credits === 0);
  reels.forEach(drawReel);
  requestAnimationFrame(frame);
})();
