<script setup>
import { onMounted, ref } from 'vue';
import { Application, Text, Graphics } from 'pixi.js';

const status = ref('...');
const message = ref('READY');
const win = ref(0);
let seat = null;
let app = null;

async function init() {
  const params = new URLSearchParams(location.search);
  const token = params.get('gc_token') || '';
  if (token) {
    try {
      const r = await fetch('/api/session/open', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (d.seat) seat = d.seat;
    } catch {}
  }
  const st = await fetch('/api/state?seat=' + encodeURIComponent(seat || '')).then(r => r.json()).catch(() => ({}));
  status.value = st.status || 'offline';
  message.value = seat ? 'SPIN' : 'OPEN FROM LOBBY';

  app = new Application();
  await app.init({ width: 360, height: 140, background: 0x111111 });
  document.getElementById('reels').appendChild(app.canvas);
  showLine(['\u2014', '\u2014', '\u2014']);
}

function showLine(line) {
  if (!app) return;
  app.stage.removeChildren();
  line.forEach((sym, i) => {
    const g = new Graphics().rect(i * 120, 10, 110, 120).fill(0x222222).stroke({ width: 2, color: 0xc9a227 });
    const t = new Text({ text: sym.slice(0, 4), style: { fill: 0xf7f1e1, fontSize: 18 } });
    t.x = i * 120 + 20;
    t.y = 50;
    app.stage.addChild(g, t);
  });
}

async function spin() {
  if (!seat) { message.value = 'NO SESSION'; return; }
  message.value = 'SPINNING';
  const r = await fetch('/api/spin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seat, betCents: 20 }),
  });
  const d = await r.json();
  if (d.line) {
    showLine(d.line);
    win.value = d.winCents || 0;
    message.value = d.win ? 'WIN ' + d.win.key : 'TRY AGAIN';
  } else {
    message.value = d.error || 'ERROR';
  }
}

onMounted(init);
</script>

<template>
  <div class="game" :style="{ padding: 'var(--grove-bar-top, 56px) var(--grove-bar-right, 0) var(--grove-bar-bottom, 0) var(--grove-bar-left, 0)' }">
    <h1>Classic 777</h1>
    <p>Status: {{ status }}</p>
    <div id="reels"></div>
    <button @click="spin">SPIN</button>
    <p>{{ message }} · Win {{ win }}¢</p>
  </div>
</template>

<style>
.game { text-align: center; color: #f7f1e1; background: #1a0505; min-height: 100vh; }
button { background: #c8141f; color: #fff; border: none; padding: 14px 40px; font-size: 20px; cursor: pointer; }
#reels { margin: 16px auto; width: 360px; }
</style>
