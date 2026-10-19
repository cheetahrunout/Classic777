'use strict';
const symbols = ['SEVEN','BAR3','BAR2','BAR1','BELL','CHERRY','BLANK'];
function label(s) { return s === 'BLANK' ? '' : s.slice(0,3); }

let seat = null;
const params = new URLSearchParams(location.search);
const token = params.get('gc_token') || '';

async function init() {
  if (token) {
    try {
      const r = await fetch('/api/session/open', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({ token })
      });
      const d = await r.json();
      if (d.seat) seat = d.seat;
    } catch (e) {}
  }
  const st = await fetch('/api/state?seat=' + encodeURIComponent(seat||'')).then(r=>r.json()).catch(()=>({}));
  document.getElementById('status').textContent = (st.status || 'offline').slice(0,6);
  document.getElementById('message').textContent = seat ? 'READY' : 'OPEN FROM LOBBY';
}

function showLine(line) {
  line.forEach((sym, i) => {
    const el = document.getElementById('strip' + i);
    el.innerHTML = `<div class="cell">${label(sym)}</div>`;
  });
}

document.getElementById('btn-spin').onclick = async () => {
  if (!seat) {
    document.getElementById('message').textContent = 'NO SESSION';
    return;
  }
  document.getElementById('message').textContent = 'SPINNING';
  const r = await fetch('/api/spin', {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify({ seat, betCents: 20 })
  });
  const d = await r.json();
  if (d.line) {
    showLine(d.line);
    document.getElementById('win').textContent = d.winCents || 0;
    document.getElementById('message').textContent = d.win ? 'WIN ' + d.win.key : 'TRY AGAIN';
  } else {
    document.getElementById('message').textContent = d.error || 'ERROR';
  }
};

init();
