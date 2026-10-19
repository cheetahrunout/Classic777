// Everything is synthesized with Web Audio, no sample files.
import { jitter } from './jitter.ts';

let ctx: AudioContext | null = null;
let master: GainNode;
let noise: AudioBuffer;
let hum: { o: OscillatorNode; g: GainNode } | null = null;
let enabled = true;

function init() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  for (let i = 0; i < d.length; i++) d[i] = jitter() * 2 - 1;
}

const ready = (): AudioContext | null => (ctx && enabled ? ctx : null);

function envelope(g: GainNode, t: number, attack: number, peak: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function burst(c: AudioContext, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  envelope(g, t, 0.002, vol, dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, jitter() * 0.8);
  src.stop(t + dur + 0.05);
}

function tone(c: AudioContext, t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.003) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
  const g = c.createGain();
  envelope(g, t, attack, vol, dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function bell(c: AudioContext, t: number, f: number, vol: number) {
  const partials = [[1, 1, 1.3], [2.76, 0.45, 0.8], [5.4, 0.22, 0.45], [8.93, 0.1, 0.25]];
  for (const [mult, amp, decay] of partials) tone(c, t, 'sine', f * mult, f * mult, decay, vol * amp, 0.002);
}

export const Sound = {
  init,
  get enabled() { return enabled; },
  setEnabled(on: boolean) {
    enabled = on;
    if (ctx) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.02);
  },
  /** One tooth of the handle's ratchet. */
  ratchet(vol = 1) {
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    burst(c, t, 0.03, 'bandpass', 2600 + jitter() * 900, 5, 0.55 * vol);
    tone(c, t, 'square', 1500, 900, 0.015, 0.05 * vol);
  },
  /** Handle hits the bottom stop and trips the reels. */
  clunk() {
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    tone(c, t, 'sine', 150, 42, 0.28, 0.9);
    burst(c, t, 0.09, 'lowpass', 800, 1, 0.8);
    tone(c, t + 0.004, 'triangle', 640, 610, 0.4, 0.07);
    tone(c, t + 0.004, 'sine', 1330, 1300, 0.3, 0.05);
  },
  /** Return spring. */
  sproing(vol = 1) {
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(95, t + 0.7);
    const lfo = c.createOscillator();
    lfo.frequency.value = 26;
    const depth = c.createGain();
    depth.gain.setValueAtTime(70, t);
    depth.gain.exponentialRampToValueAtTime(1, t + 0.7);
    lfo.connect(depth).connect(o.frequency);
    const g = c.createGain();
    envelope(g, t, 0.005, 0.22 * vol, 0.7);
    o.connect(g).connect(master);
    o.start(t); lfo.start(t);
    o.stop(t + 0.8); lfo.stop(t + 0.8);
    burst(c, t, 0.05, 'highpass', 3000, 1, 0.25 * vol);
  },
  /** A symbol passing the payline. */
  tick(vol = 1) {
    const c = ready(); if (!c) return;
    burst(c, c.currentTime, 0.014, 'highpass', 2200, 0.8, 0.09 * vol);
  },
  reelStop() {
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    tone(c, t, 'sine', 210, 60, 0.16, 0.75);
    burst(c, t, 0.06, 'bandpass', 1200, 2, 0.6);
    tone(c, t, 'square', 95, 70, 0.05, 0.06);
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
    if (!ctx || !hum) return;
    const t = ctx.currentTime;
    hum.g.gain.setTargetAtTime(0.0001, t, 0.08);
    hum.o.stop(t + 0.5);
    hum = null;
  },
  coin() {
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    const f = 2000 + jitter() * 300;
    tone(c, t, 'sine', f, f, 0.09, 0.12);
    tone(c, t + 0.01, 'sine', f * 1.5, f * 1.5, 0.07, 0.07);
  },
  fanfare(level: number) {
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    const notes = level >= 3 ? [784, 988, 1175, 1568, 1175, 1568, 1976, 2349]
      : level === 2 ? [784, 988, 1175, 1568]
      : [988, 1319];
    const step = level >= 3 ? 0.11 : 0.13;
    notes.forEach((f, i) => bell(c, t + i * step, f, 0.22));
    if (level >= 3) {
      for (let i = 0; i < 6; i++) bell(c, t + 1 + i * 0.22, i % 2 ? 1568 : 1319, 0.2);
    }
  },
};
