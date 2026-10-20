// HALO 98 extras: display properties, screensavers, paint.exe (draw a coin, launch it), tracker sweeper,
// coin properties with an ASCII portrait, the tray clock, run… and tooltips. Everything runs in the browser.
const LAYER_NAMES = ['01 site', '02 connect', '03 key', '04 launcher', '05 gas', '06 files'];

export function install(X) {
  const { $, $$, esc, WM, dialog, toast, ls, MOBILE } = X;
  const hooks = {};

  // ================================================================ display properties
  const DEF = { wall: 'pc', accent: 'amber', crt: false, saver: 'layers', wait: 3 };
  let saved = DEF; try { saved = Object.assign({}, DEF, JSON.parse(ls.get('halo:display') || '{}')); } catch {}
  let D = Object.assign({}, saved);
  const apply = s => {
    document.documentElement.dataset.accent = s.accent;
    document.body.classList.toggle('crt', !!s.crt);
    X.setWall(s.wall);
  };
  apply(D);
  const dtabs = $$('#dtabs button'), panes = $$('#w-display .dpane');
  let tab = 'bg';
  const showTab = t => { tab = t; dtabs.forEach(b => b.classList.toggle('on', b.dataset.t === t)); panes.forEach(p => p.hidden = p.dataset.p !== t); preview(); };
  dtabs.forEach(b => b.onclick = () => showTab(b.dataset.t));
  const syncForm = () => {
    $$('#w-display [name=wall]').forEach(r => r.checked = r.value === D.wall);
    $('#dSaver').value = D.saver; $('#dWait').value = String(D.wait);
    $$('#w-display .sw[data-acc]').forEach(b => b.classList.toggle('on', b.dataset.acc === D.accent));
    $('#dCrt').checked = !!D.crt;
  };
  $$('#w-display [name=wall]').forEach(r => r.onchange = () => { D.wall = r.value; apply(D); preview(); });
  $('#dSaver').onchange = e => { D.saver = e.target.value; preview(); };
  $('#dWait').onchange = e => { D.wait = +e.target.value; };
  $$('#w-display .sw[data-acc]').forEach(b => b.onclick = () => { D.accent = b.dataset.acc; syncForm(); apply(D); preview(); });
  $('#dCrt').onchange = e => { D.crt = e.target.checked; apply(D); preview(); };
  $('#dTry').onclick = () => { if (D.saver !== 'none') startSaver(D.saver, true); };
  const save = () => { saved = Object.assign({}, D); ls.set('halo:display', JSON.stringify(saved)); apply(saved); };
  $('#w-display [data-ok]').onclick = () => { save(); WM.close('display'); };
  $('#w-display [data-apply]').onclick = () => { save(); toast('applied'); };
  hooks.display = { open: () => { D = Object.assign({}, saved); syncForm(); showTab(tab); }, close: () => { stopPreview(); D = Object.assign({}, saved); apply(saved); } };
  hooks.setAccent = acc => { saved = Object.assign({}, saved, { accent: acc }); D = Object.assign({}, saved); ls.set('halo:display', JSON.stringify(saved)); apply(saved); };

  // the little monitor in the dialog shows the wallpaper, the screensaver or the colours
  const pv = $('#dprev'), pg = pv.getContext('2d'); let pvRun = null;
  function stopPreview() { if (pvRun) { pvRun.stop(); pvRun = null; } }
  function preview() {
    stopPreview();
    const W = pv.width, H = pv.height, cs = getComputedStyle(document.documentElement);
    pg.fillStyle = '#070708'; pg.fillRect(0, 0, W, H);
    if (tab === 'saver') { if (D.saver !== 'none') pvRun = makeSaver(pv, D.saver, { small: true }); else { pg.fillStyle = '#3e3c38'; pg.font = '12px JBM, monospace'; pg.fillText('(none)', W / 2 - 22, H / 2); } return; }
    if (tab === 'bg') {
      if (D.wall === 'pc') { const wall = $('#wall'); try { pg.drawImage(wall, W * .42, H * .12, W * .55, H * .75); } catch {} }
      pg.fillStyle = '#d8d2c0'; for (let i = 0; i < 4; i++) { pg.fillRect(8, 8 + i * 30, 12, 12); pg.fillRect(5, 23 + i * 30, 18, 3); }
      return;
    }
    // appearance: a tiny window in the chosen colours
    const acc = cs.getPropertyValue('--gold').trim() || '#f2b84b', t1 = cs.getPropertyValue('--tb1').trim(), t2 = cs.getPropertyValue('--tb2').trim();
    pg.fillStyle = '#18181c'; pg.fillRect(22, 26, W - 44, H - 50);
    const gr = pg.createLinearGradient(22, 0, W - 22, 0); gr.addColorStop(0, t1 || '#2d1f06'); gr.addColorStop(1, t2 || '#a8731c'); pg.fillStyle = gr; pg.fillRect(25, 29, W - 50, 14);
    pg.fillStyle = '#fff2d2'; pg.font = '700 9px JBM, monospace'; pg.fillText('halo', 30, 39);
    pg.strokeStyle = acc; pg.strokeRect(W - 86, H - 46, 54, 16); pg.fillStyle = acc; pg.fillText('ok', W - 64, H - 35);
    pg.fillStyle = '#8b867a'; pg.fillText('launch with layers', 32, 62); pg.fillText('of privacy.', 32, 74);
    if (D.crt) { pg.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < H; y += 3) pg.fillRect(0, y, W, 1); }
  }

  // ================================================================ screensavers
  function liveLine() {
    const s = X.getStatus(), c = X.getCoins()[0];
    const parts = ['halo'];
    if (s) parts.push(s.ready ? 'launches open' : 'launches paused');
    if (c) parts.push(`newest: $${c.symbol}`);
    parts.push('no names', 'no keys', 'every layer real');
    return parts.join('  ·  ');
  }
  function makeSaver(canvas, kind, { small } = {}) {
    const g = canvas.getContext('2d'); let raf = 0, alive = true, last = performance.now();
    const fit = () => { if (small) return; const d = Math.min(2, devicePixelRatio || 1); canvas.width = innerWidth * d; canvas.height = innerHeight * d; };
    fit(); const onR = () => fit(); if (!small) addEventListener('resize', onR);
    const W = () => canvas.width, H = () => canvas.height, k = small ? .4 : Math.min(2, devicePixelRatio || 1);
    const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#f2b84b';
    // layers: the six privacy layers fly past in box-drawing characters
    const L = Array.from({ length: 9 }, (_, i) => ({ z: 1 + i * .55, n: i }));
    // stars: a warp field of characters
    const stars = Array.from({ length: small ? 90 : 420 }, () => ({ x: (Math.random() - .5) * 2, y: (Math.random() - .5) * 2, z: Math.random() }));
    // marquee: the live status line crossing the screen
    let mx = null, my = 0, line = liveLine(), hue = 0;
    function frame(now) {
      if (!alive) return; raf = requestAnimationFrame(frame);
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      const w = W(), h = H();
      if (kind === 'layers') {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        const cw = 9 * k, ch = 16 * k, cols = Math.floor(w / cw), rows = Math.floor(h / ch), cx = cols / 2, cy = rows / 2;
        g.font = `${14 * k}px JBM, monospace`; g.textBaseline = 'top';
        L.sort((a, b) => b.z - a.z);
        for (const l of L) {
          l.z -= dt * .42; if (l.z < .12) { l.z += L.length * .55; l.n += L.length; }
          const s = 1 / l.z, hw = Math.round(cx * .32 * s), hh = Math.round(cy * .32 * s);
          if (hw < 2 || hh < 1) continue;
          const a = Math.min(1, (5 - l.z) / 2.5) * Math.min(1, (l.z - .12) / .3); if (a <= 0) continue;
          const col = l.n % 2 ? `rgba(98,240,200,${a})` : gold;
          g.globalAlpha = l.n % 2 ? 1 : a; g.fillStyle = col;
          const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw), y0 = Math.round(cy - hh), y1 = Math.round(cy + hh);
          const top = '┌' + '─'.repeat(Math.max(0, x1 - x0 - 1)) + '┐', bot = '└' + '─'.repeat(Math.max(0, x1 - x0 - 1)) + '┘';
          if (y0 >= 0) g.fillText(top, x0 * cw, y0 * ch); if (y1 < rows + 2) g.fillText(bot, x0 * cw, y1 * ch);
          for (let y = Math.max(0, y0 + 1); y < Math.min(rows + 1, y1); y++) { g.fillText('│', x0 * cw, y * ch); g.fillText('│', x1 * cw, y * ch); }
          if (hh > 2) g.fillText(' ' + LAYER_NAMES[l.n % 6] + ' ', (x0 + 2) * cw, y0 * ch);
        }
        g.globalAlpha = 1; g.fillStyle = '#e9e1cb'; const t = 'you'; g.fillText(t, (cx - t.length / 2) * cw, cy * ch - ch / 2);
      } else if (kind === 'stars') {
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, w, h);
        g.font = `${13 * k}px JBM, monospace`; g.textBaseline = 'middle';
        for (const s of stars) {
          s.z -= dt * .32; if (s.z <= .02) { s.x = (Math.random() - .5) * 2; s.y = (Math.random() - .5) * 2; s.z = 1; }
          const px = w / 2 + s.x / s.z * w * .25, py = h / 2 + s.y / s.z * w * .25; if (px < 0 || py < 0 || px > w || py > h) { s.z = 0; continue; }
          const b = 1 - s.z; g.fillStyle = b > .8 ? '#ffffff' : b > .55 ? gold : b > .3 ? '#62f0c8' : '#4a4a55';
          g.fillText(b > .85 ? '*' : b > .6 ? '+' : b > .3 ? '·' : '.', px, py);
        }
      } else if (kind === 'marquee') {
        g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
        const fs = (small ? 30 : 92) * (small ? 1 : k); g.font = `${fs}px VT, monospace`; g.textBaseline = 'middle';
        const tw = g.measureText(line).width;
        if (mx === null || mx < -tw) { mx = w; my = h * (.25 + Math.random() * .5); line = liveLine(); hue = (hue + 1) % 3; }
        mx -= dt * w * .16;
        g.fillStyle = ['#f2b84b', '#62f0c8', '#e9e1cb'][hue]; g.shadowColor = g.fillStyle; g.shadowBlur = 18 * k; g.fillText(line, mx, my); g.shadowBlur = 0;
      }
    }
    raf = requestAnimationFrame(frame);
    return { stop() { alive = false; cancelAnimationFrame(raf); if (!small) removeEventListener('resize', onR); } };
  }
  const sv = $('#saver'); let running = null, lastInput = performance.now(), startedAt = 0, startXY = null;
  function startSaver(kind, forced) {
    if (running || kind === 'none') return;
    sv.hidden = false; document.body.classList.add('saving'); running = makeSaver(sv, kind); startedAt = performance.now(); startXY = null;
    X.pauseWall(true);
    if (forced) WM.close('display');
  }
  function stopSaver() { if (!running) return; running.stop(); running = null; sv.hidden = true; document.body.classList.remove('saving'); X.pauseWall(false); lastInput = performance.now(); }
  const wake = e => {
    if (running) {
      if (performance.now() - startedAt < 500) return;
      if (e.type === 'pointermove') { if (!startXY) { startXY = [e.clientX, e.clientY]; return; } if (Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) < 8) return; }
      stopSaver(); if (e.type !== 'pointermove') { e.preventDefault && e.preventDefault(); e.stopPropagation && e.stopPropagation(); }
      return;
    }
    lastInput = performance.now();
  };
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => addEventListener(t, wake, { capture: true, passive: t !== 'keydown' && t !== 'pointerdown' }));
  setInterval(() => {
    if (MOBILE || running || document.hidden || saved.saver === 'none' || !$('#dlg').hidden) return;
    if (performance.now() - lastInput > saved.wait * 60000) startSaver(saved.saver);
  }, 4000);
  hooks.saver = { start: k => startSaver(k || saved.saver || 'layers', true) };

  // ================================================================ paint.exe
  const N = 32, cvs = $('#pcanvas'), pc = cvs.getContext('2d');
  const PAL = ['#0b0b0e', '#f2eee2', '#9a9aa2', '#45454f', '#f2b84b', '#a8731c', '#ff6b5b', '#8a2c22', '#62f0c8', '#1c7a63', '#7aa2ff', '#2c3f7a', '#d6caa9', '#6b4a10', '#c792ea', '#ffd98a'];
  let px = new Array(N * N).fill(PAL[0]), fg = PAL[4], tool = 'pen', mirror = false, undo = [], dirtyArt = false, cell = 14;
  $('#ppal').insertAdjacentHTML('beforeend', PAL.map(c => `<button type="button" class="pc" data-c="${c}" style="background:${c}" aria-label="colour ${c}"></button>`).join(''));
  const setFg = c => { fg = c; $('#pfg').style.background = c; $$('#ppal .pc').forEach(b => b.classList.toggle('on', b.dataset.c === c)); };
  setFg(fg);
  $$('#ppal .pc').forEach(b => b.onclick = () => { setFg(b.dataset.c); if (tool === 'pick' || tool === 'erase') setTool('pen'); });
  function setTool(t) {
    if (t === 'mirror') { mirror = !mirror; $('#ptools [data-tool=mirror]').classList.toggle('on', mirror); status(); return; }
    tool = t; $$('#ptools [data-tool]').forEach(b => b.dataset.tool !== 'mirror' && b.classList.toggle('on', b.dataset.tool === t)); status();
  }
  $$('#ptools [data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  const status = (x, y) => { $('#pStat').textContent = `32 × 32 · ${{ pen: 'pencil', erase: 'eraser', fill: 'fill', pick: 'pick a colour' }[tool]}${mirror ? ' · mirror' : ''}`; if (x != null) $('#pPos').textContent = `${x}, ${y}`; };
  function draw() {
    const S = cvs.width; cell = S / N;
    for (let i = 0; i < N * N; i++) { pc.fillStyle = px[i]; pc.fillRect((i % N) * cell, ((i / N) | 0) * cell, cell, cell); }
    pc.strokeStyle = 'rgba(255,255,255,.05)'; pc.lineWidth = 1; pc.beginPath();
    for (let i = 1; i < N; i++) { pc.moveTo(i * cell + .5, 0); pc.lineTo(i * cell + .5, S); pc.moveTo(0, i * cell + .5); pc.lineTo(S, i * cell + .5); }
    pc.stroke();
    pc.strokeStyle = 'rgba(242,184,75,.16)'; pc.beginPath(); pc.moveTo(S / 2 + .5, 0); pc.lineTo(S / 2 + .5, S); pc.stroke();
  }
  const snap = () => { undo.push(px.slice()); if (undo.length > 40) undo.shift(); };
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= N || y >= N) return; px[y * N + x] = c; if (mirror) px[y * N + (N - 1 - x)] = c; };
  function fill(x, y, c) {
    const from = px[y * N + x]; if (from === c) return;
    const st = [[x, y]];
    while (st.length) { const [a, b] = st.pop(); if (a < 0 || b < 0 || a >= N || b >= N || px[b * N + a] !== from) continue; px[b * N + a] = c; st.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]); }
    if (mirror) { const mx = N - 1 - x; if (px[y * N + mx] !== c) fill(mx, y, c); }
  }
  const cellAt = e => { const r = cvs.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * N), Math.floor((e.clientY - r.top) / r.height * N)]; };
  let down = false, lastC = null, btn = 0;
  cvs.addEventListener('contextmenu', e => e.preventDefault());
  cvs.addEventListener('pointerdown', e => {
    e.preventDefault(); cvs.setPointerCapture(e.pointerId); const [x, y] = cellAt(e); btn = e.button;
    if (tool === 'pick') { setFg(px[y * N + x]); setTool('pen'); return; }
    snap(); dirtyArt = true;
    if (tool === 'fill') { fill(x, y, btn === 2 ? PAL[0] : fg); draw(); return; }
    down = true; lastC = [x, y]; put(x, y, tool === 'erase' || btn === 2 ? PAL[0] : fg); draw();
  });
  cvs.addEventListener('pointermove', e => {
    const [x, y] = cellAt(e); status(Math.max(0, Math.min(N - 1, x)), Math.max(0, Math.min(N - 1, y)));
    if (!down) return;
    const c = tool === 'erase' || btn === 2 ? PAL[0] : fg; let [x0, y0] = lastC; const dx = Math.abs(x - x0), dy = -Math.abs(y - y0), sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1; let er = dx + dy;
    for (let i = 0; i < 200; i++) { put(x0, y0, c); if (x0 === x && y0 === y) break; const e2 = 2 * er; if (e2 >= dy) { er += dy; x0 += sx; } if (e2 <= dx) { er += dx; y0 += sy; } }
    lastC = [x, y]; draw();
  });
  const up = () => { down = false; }; cvs.addEventListener('pointerup', up); cvs.addEventListener('pointercancel', up);
  const doUndo = () => { if (undo.length) { px = undo.pop(); draw(); } };
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && WM.isActive('paint')) { e.preventDefault(); doUndo(); } });
  function png(size = 512) {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), s = size / N;
    for (let i = 0; i < N * N; i++) { g.fillStyle = px[i]; g.fillRect((i % N) * s, ((i / N) | 0) * s, Math.ceil(s), Math.ceil(s)); }
    return new Promise(r => c.toBlob(r, 'image/png'));
  }
  $('#w-paint [data-pa=new]').onclick = async () => { if (dirtyArt && await dialog('paint', 'start over? the current drawing goes away.', [['start over', true], ['cancel', false]], 'paint') !== 0) return; snap(); px.fill(PAL[0]); dirtyArt = false; draw(); };
  $('#w-paint [data-pa=undo]').onclick = doUndo;
  $('#w-paint [data-pa=save]').onclick = async () => { const b = await png(512); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'halo-coin.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#pUse').onclick = async () => { const b = await png(512); X.useImage(new File([b], 'paint.png', { type: 'image/png' })); };
  // a starter so the canvas is never a blank wall: a small gold coin with an h on it
  (() => {
    const g = (x, y, c) => { px[y * N + x] = c; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const d = Math.hypot(x - 15.5, y - 15.5); if (d < 11.5) g(x, y, d > 10.2 ? '#a8731c' : '#f2b84b'); }
    const H = ['x....', 'x....', 'x....', 'xxxx.', 'x...x', 'x...x', 'x...x', 'x...x', 'x...x', 'x...x'];
    H.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'x') { g(13 + x, 11 + y, '#6b4a10'); } }));
  })();
  draw(); status();
  hooks.paint = { open: () => { draw(); } };

  // ================================================================ tracker sweeper
  const LV = { b: [9, 9, 10], i: [16, 16, 40] };
  let lv = ls.get('halo:sweepLv') === 'i' ? 'i' : 'b', G = null, timer = 0, t0 = 0, first = true, over = false, flags = 0;
  const grid = $('#swGrid');
  const led = (el, n) => el.textContent = String(Math.max(-99, Math.min(999, n))).padStart(3, '0');
  function newGame(l = lv) {
    lv = l; ls.set('halo:sweepLv', l); const [w, h, m] = LV[l];
    G = { w, h, m, mine: new Uint8Array(w * h), open: new Uint8Array(w * h), flag: new Uint8Array(w * h) };
    first = true; over = false; flags = 0; clearInterval(timer); led($('#swTime'), 0); led($('#swLeft'), m); $('#swFace').textContent = ':)';
    grid.style.gridTemplateColumns = `repeat(${w}, var(--sc))`;
    grid.innerHTML = Array.from({ length: w * h }, (_, i) => `<button type="button" class="sc" data-i="${i}" aria-label="cell"></button>`).join('');
    const win = WM.wins.sweeper; if (win && !MOBILE) { win.style.width = (w * 24 + 52) + 'px'; win.style.height = (h * 24 + 178) + 'px'; }
  }
  const nb = i => { const x = i % G.w, y = (i / G.w) | 0, out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < G.w && b < G.h) out.push(b * G.w + a); } return out; };
  const count = i => nb(i).reduce((s, j) => s + G.mine[j], 0);
  function plant(safe) {
    const ban = new Set([safe, ...nb(safe)]); let n = 0;
    while (n < G.m) { const i = (Math.random() * G.w * G.h) | 0; if (G.mine[i] || ban.has(i)) continue; G.mine[i] = 1; n++; }
  }
  function cellEl(i) { return grid.children[i]; }
  function reveal(i) {
    if (G.open[i] || G.flag[i]) return;
    const st = [i];
    while (st.length) {
      const j = st.pop(); if (G.open[j] || G.flag[j]) continue; G.open[j] = 1;
      const c = count(j), el = cellEl(j); el.classList.add('op'); el.textContent = c || ''; if (c) el.dataset.n = c;
      if (!c) nb(j).forEach(k => !G.open[k] && st.push(k));
    }
  }
  function boom(i) {
    over = true; clearInterval(timer); $('#swFace').textContent = 'x('; X.sfx && X.sfx('boom');
    for (let j = 0; j < G.w * G.h; j++) { const el = cellEl(j); if (G.mine[j] && !G.flag[j]) { el.classList.add('op', 'mine'); el.textContent = '◉'; } if (!G.mine[j] && G.flag[j]) { el.classList.add('op', 'wrong'); el.textContent = '×'; } }
    cellEl(i).classList.add('hit');
    setTimeout(() => dialog('tracker sweeper', 'a tracker found you.<br><span class="dim">that is what halo is for. try again?</span>', [['new game', true], ['close', false]], 'sweeper').then(r => r === 0 && newGame()), 450);
  }
  function check() {
    let left = 0; for (let j = 0; j < G.w * G.h; j++) if (!G.mine[j] && !G.open[j]) left++;
    if (left) return;
    over = true; clearInterval(timer); $('#swFace').textContent = 'B)'; X.sfx && X.sfx('chime');
    const secs = Math.round((performance.now() - t0) / 1000), key = 'halo:sweepBest:' + lv, best = +ls.get(key) || 0;
    const rec = !best || secs < best; if (rec) ls.set(key, String(secs));
    for (let j = 0; j < G.w * G.h; j++) if (G.mine[j]) { cellEl(j).classList.add('flag'); cellEl(j).textContent = '⚑'; }
    led($('#swLeft'), 0);
    setTimeout(() => dialog('tracker sweeper', `every tracker swept in <b class="gold">${secs}s</b>. no trace left.${rec ? '<br><span class="teal">new best time.</span>' : `<br><span class="dim">best: ${best}s</span>`}`, [['new game', true], ['close', false]], 'sweeper').then(r => r === 0 && newGame()), 300);
  }
  function act(i, flag) {
    if (over) return;
    if (flag) { if (G.open[i]) return; G.flag[i] ^= 1; flags += G.flag[i] ? 1 : -1; const el = cellEl(i); el.classList.toggle('flag', !!G.flag[i]); el.textContent = G.flag[i] ? '⚑' : ''; led($('#swLeft'), G.m - flags); return; }
    if (G.flag[i]) return;
    if (first) { first = false; plant(i); t0 = performance.now(); timer = setInterval(() => led($('#swTime'), Math.floor((performance.now() - t0) / 1000)), 250); }
    if (G.open[i]) {                                       // chord: a number with all its flags placed opens the rest
      const n = nb(i), f = n.filter(j => G.flag[j]).length; if (f !== count(i)) return;
      for (const j of n) { if (G.flag[j] || G.open[j]) continue; if (G.mine[j]) return boom(j); reveal(j); }
      return check();
    }
    if (G.mine[i]) return boom(i);
    reveal(i); check();
  }
  let press = null;
  grid.addEventListener('contextmenu', e => e.preventDefault());
  grid.addEventListener('pointerdown', e => {
    const b = e.target.closest('.sc'); if (!b || over) return;
    if (e.button === 2) { act(+b.dataset.i, true); return; }
    $('#swFace').textContent = ':O';
    press = { i: +b.dataset.i, t: setTimeout(() => { if (press) { act(press.i, true); press = null; $('#swFace').textContent = ':)'; } }, 420) };
  });
  const release = e => { if (!press) return; clearTimeout(press.t); const b = e.target.closest && e.target.closest('.sc'); const i = press.i; press = null; if (!over) $('#swFace').textContent = ':)'; if (b && +b.dataset.i === i) act(i, false); };
  grid.addEventListener('pointerup', release); grid.addEventListener('pointerleave', () => { if (press) { clearTimeout(press.t); press = null; if (!over) $('#swFace').textContent = ':)'; } });
  $('#swFace').onclick = () => newGame();
  $('#w-sweeper [data-sw=new]').onclick = () => newGame();
  $('#w-sweeper [data-sw=b]').onclick = () => newGame('b');
  $('#w-sweeper [data-sw=i]').onclick = () => newGame(MOBILE ? 'b' : 'i');
  $('#w-sweeper [data-sw=best]').onclick = () => dialog('best times', `beginner: <b>${ls.get('halo:sweepBest:b') ? ls.get('halo:sweepBest:b') + 's' : '—'}</b><br>intermediate: <b>${ls.get('halo:sweepBest:i') ? ls.get('halo:sweepBest:i') + 's' : '—'}</b><br><span class="dim">kept in this browser only.</span>`, [['ok', true]], 'sweeper');
  newGame(MOBILE ? 'b' : lv);
  hooks.sweeper = { open: () => { if (!G) newGame(); } };

  // ================================================================ coin properties
  const RAMP = ' .:-=+*#%@';
  function asciiOf(src) {
    return new Promise(res => {
      const im = new Image(); im.onload = () => {
        const cw = 44, ch = 22, c = document.createElement('canvas'); c.width = cw; c.height = ch; const g = c.getContext('2d');
        g.drawImage(im, 0, 0, cw, ch); let d; try { d = g.getImageData(0, 0, cw, ch).data; } catch { return res(null); }
        let html = '';
        for (let y = 0; y < ch; y++) { for (let x = 0; x < cw; x++) { const i = (y * cw + x) * 4, r = d[i], gg = d[i + 1], b = d[i + 2], l = (r * .299 + gg * .587 + b * .114) / 255; const k = Math.min(9, Math.round(l * 9));
          html += k ? `<i style="color:rgb(${Math.min(255, r + 30)},${Math.min(255, gg + 30)},${Math.min(255, b + 30)})">${RAMP[k]}</i>` : ' '; } html += '\n'; }
        res(html);
      };
      im.onerror = () => res(null); im.src = src;
    });
  }
  hooks.coin = {
    open: async c => {
      if (!c) return;
      WM.retitle('coin', `$${c.symbol} properties`);
      $('#cpName').innerHTML = `${esc(c.name)} <span>$${esc(c.symbol)}</span>`;
      const rows = [['mint', `<span class="teal">${esc(c.mint)}</span>`], ['creator', esc(c.creator)], ['launched', `${new Date(c.at).toLocaleString()} <span class="dim">(${X.ago(c.at)} ago)</span>`],
        ['status', c.status === 'sending' ? '<span class="gold">confirming</span>' : c.graduated ? '<span class="teal">graduated to pumpswap</span>' : 'on the bonding curve'],
        ['market cap', c.mcapUsd != null ? X.usd(c.mcapUsd) : '<span class="dim">—</span>'],
        ['curve', c.progress == null ? '<span class="dim">—</span>' : `<span class="prog">${'█'.repeat(Math.round(c.progress * 16))}<i>${'░'.repeat(16 - Math.round(c.progress * 16))}</i></span> ${Math.round(c.progress * 100)}%`]];
      $('#cpKv').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
      $('#cpPump').href = 'https://pump.fun/coin/' + c.mint; $('#cpScan').href = 'https://solscan.io/token/' + c.mint;
      $('#cpFees').onclick = () => X.openClaimWatch(c.creator);
      $('#cpCopy').onclick = () => X.copy(c.mint);
      $('#cpStat').textContent = `read live from the chain · ${X.ago(c.at)} old`;
      $('#cpImg').src = c.img; $('#cpAscii').textContent = 'rendering…';
      const html = await asciiOf(c.img); $('#cpAscii').innerHTML = html || '<span class="dim">(no image)</span>';
    },
  };

  // ================================================================ the tray clock
  const pop = $('#clockPop'); let popT = 0;
  function tickPop() {
    const d = new Date(); $('#cpLocal').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    $('#cpDate').textContent = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#cpUtc').textContent = d.toISOString().slice(11, 19);
  }
  $('#clock').addEventListener('click', e => { e.stopPropagation(); const open = pop.hidden; X.closeMenus(); pop.hidden = !open; clearInterval(popT); if (open) { tickPop(); popT = setInterval(tickPop, 1000); } });
  hooks.closeClock = () => { pop.hidden = true; clearInterval(popT); };

  // ================================================================ run…
  const RUN = { launch: 'launch', 'launch.exe': 'launch', coins: 'coins', 'coins.db': 'coins', claim: 'claim', 'claim.exe': 'claim', paint: 'paint', 'paint.exe': 'paint', mspaint: 'paint',
    sweeper: 'sweeper', 'sweeper.exe': 'sweeper', winmine: 'sweeper', minesweeper: 'sweeper', cmd: 'cmd', 'cmd.exe': 'cmd', command: 'cmd', readme: 'readme', 'readme.txt': 'readme', notepad: 'readme', help: 'readme',
    privacy: 'privacy', 'privacy.cpl': 'privacy', display: 'display', 'desk.cpl': 'display', control: 'display', sysdm: 'pc', 'sysdm.cpl': 'pc', welcome: 'welcome', bin: 'bin', recycle: 'bin', strip: 'strip', 'strip.exe': 'strip', exif: 'strip', scan: 'scan', 'scan.exe': 'scan', cd: 'cd', cdplayer: 'cd', 'cdplayer.exe': 'cd', music: 'cd' };
  $('#runList').innerHTML = Object.keys(RUN).map(k => `<option value="${k}">`).join('');
  const go = () => {
    const v = $('#runIn').value.trim().toLowerCase(); if (!v) return;
    const app = RUN[v]; WM.close('run');
    if (app) WM.open(app);
    else if (v === 'scr' || v.endsWith('.scr')) startSaver(saved.saver === 'none' ? 'layers' : saved.saver, true);
    else dialog('run', `cannot find '<b>${esc(v)}</b>'. make sure you typed the name correctly, then try again.`, [['ok', true]], 'warn');
  };
  $('#runOk').onclick = go; $('#runIn').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  hooks.run = { open: () => { $('#runIn').value = ''; setTimeout(() => $('#runIn').focus(), 60); } };

  // ================================================================ tooltips
  const tip = $('#tip'); let tipT = 0;
  document.addEventListener('pointerover', e => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const el = e.target.closest('[data-tip]'); clearTimeout(tipT); tip.hidden = true; if (!el) return;
    tipT = setTimeout(() => { tip.textContent = el.dataset.tip; tip.hidden = false; const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = Math.min(innerWidth - tw - 6, Math.max(6, r.left + r.width / 2 - tw / 2)), y = r.bottom + 8; if (y + th > innerHeight - 4) y = r.top - th - 8; tip.style.left = x + 'px'; tip.style.top = y + 'px'; }, 520);
  });
  document.addEventListener('pointerdown', () => { clearTimeout(tipT); tip.hidden = true; }, true);

  return hooks;
}
