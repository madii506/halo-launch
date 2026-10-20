// HALO 98: the room, the boot on the CRT, then a dark old-school desktop where every window works.
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = matchMedia('(max-width: 760px)').matches || matchMedia('(hover: none)').matches;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ss = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch {} } };
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
const ago = t => { const s = Math.max(1, (Date.now() - new Date(t).getTime()) / 1000); return s < 60 ? `${s | 0}s` : s < 3600 ? `${s / 60 | 0}m` : s < 86400 ? `${s / 3600 | 0}h` : `${s / 86400 | 0}d`; };
const usd = n => n == null ? '—' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + n;
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1700); }
async function copy(t) { try { await navigator.clipboard.writeText(t); toast('copied'); } catch { toast('select it and copy'); } }
async function api(op, { method = 'GET', body, params } = {}) {
  const u = '/api/' + op + (params ? '?' + new URLSearchParams(params) : '');
  let r; try { r = await fetch(u, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('No connection. Check your internet and try again.'); }
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok || j.ok === false) { const e = new Error(j.error || `Request failed (${r.status}).`); e.detail = j.detail; throw e; }
  return j;
}
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b === 0) s = '1' + s; else break; } return s; }
function unb58(str) { let n = 0n; for (const c of str) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad'); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const c of str) { if (c === '1') out.unshift(0); else break; } return new Uint8Array(out); }
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const isAddr = s => { if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s || '')) return false; try { return unb58(s).length === 32; } catch { return false; } };
const WIZ_ART = "\n\n      .+++*********##############*#+-===.\n      =###%%%%%%%%%%%%%%%%%%%%%%%###****=\n      =**+===========================++*-\n      =**-                           =**-\n      =**- ...............           +**-\n      =**- . ..............          =**-\n      =**- . ................        =**-\n      =**- . .................       +**-\n      =**- . .................       +**-\n      =**-   ..................      +**-\n      =**-    ..........:......      +**-\n      =**-    ...+--=---==-- ..      +**-\n      =**-    ...**#++*=-+==-.       +**-\n      =**-     ...::::::.::.-.       +**-\n      -**-     ............. ..      +**-\n      -**-      ..............       +**:\n      -**-       ............        +**:\n      -**-        ..........         +**:\n      -**-          ......           +**:\n      -**-                           +**:\n      -**- .  . ...........          +**:\n      -****************++++++++++++++***:\n      -*************************##*+=+**:\n      :++++++++++++++++++++++++++*+==+++:\n     .=+++++++++==++++++++++=======++=====+=\n    -+++++++++++++**#####***++==++++++++++++\n  :+*+++++++++++++*********+++++++++++++++++\n.*@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@%%%%%%%%%%\n:******##########%%%%%%%%%%%%%%%%%%%%%%%%%%%\n:+++**********************************++++++\n:+****+++++****++++++***+=============+*****\n:++++*: .. -***++++++****============-+***++\n:++#*+++++++***+=++++***+=============+*++++\n:++#***********++++++***+=======------+*++++\n.====+++++++++++*************************+++\n.::::::::::::::::::::::::-----------------==";

// ================================================================ boot: room → dive → splash → desktop
async function boot() {
  const seen = ss.get('halo:seen');
  if (seen || RM) return desktop('', true);
  const canvas = $('#room');
  let started = false;
  const go = cmd => { if (go.done) return; go.done = true; ss.set('halo:seen', '1'); flashThen(() => desktop(cmd)); };
  $$('#itouch button').forEach(b => b.onclick = () => { if (window.__halo && window.__halo.go) window.__halo.go(b.dataset.go); else go(b.dataset.go); });
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) throw new Error('no webgl');
    const { run } = await import('./intro3d.js?v=3');
    const statusP = fetch('/api/status').then(r => r.json()).catch(() => null);
    window.__halo = await run({ canvas, mobile: MOBILE, onEnter: go, status: statusP, onReady: () => { $('#ihint').classList.add('on'); $('#itouch').classList.add('on'); } });
    started = true;
    requestAnimationFrame(() => { canvas.classList.add('on'); const l = $('#iload'); if (l) l.remove(); });
  } catch (e) { const l = $('#iload'); if (l) l.remove(); if (!started) fallbackBoot(go); }
}
function flashThen(fn) {
  const f = $('#iflash'); f.classList.add('go');
  setTimeout(fn, 320);
}
async function fallbackBoot(go) {
  const pre = $('#ifall'); pre.hidden = false; $('#room').remove(); $$('#intro .lb, #iskip, #icap').forEach(e => e.remove());
  const lines = ['HALO BIOS v1.98  (c) nobody', 'cpu: anonymous @ 33 MHz', 'memory test: 640K ok', '', 'detecting wallet connection ...... none', 'detecting signature request ...... none', 'detecting your name .............. not found', 'creator key ...................... born in your browser', '', 'press enter.'];
  for (const l of lines) { pre.textContent += l + '\n'; await sleep(70); }
  $('#itouch').classList.add('on');
  addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') go(''); }, { once: true });
}

async function desktop(cmd, instant) {
  const intro = $('#intro');
  if (!instant) {
    const sp = $('#splash'); sp.hidden = false; intro.remove();
    await sleep(1150); sp.remove();
  } else { intro.remove(); $('#splash').remove(); }
  document.body.classList.remove('booting');
  const d = $('#desk'); d.hidden = false; d.classList.add('in');
  initDesk();
  const app = { launch: 'launch', coins: 'coins', claim: 'claim', layers: 'privacy', docs: 'readme' }[cmd];
  if (app) WM.open(app);
  else if (ls.get('halo:nowelcome') !== '1') WM.open('welcome');
}

// ================================================================ window manager
const WM = {
  z: 10, wins: {}, order: [],
  init() {
    $$('.w[data-app]').forEach(w => {
      const app = w.dataset.app; this.wins[app] = w;
      if (!w.querySelector(':scope > .tb')) {
        const tb = document.createElement('div'); tb.className = 'tb';
        tb.innerHTML = `<img src="/assets/img/ico-${w.dataset.icon}-16.png" alt=""><span>${esc(w.dataset.title)}</span><div class="tbb"><button type="button" data-min aria-label="minimize">_</button><button type="button" data-max aria-label="maximize">□</button><button type="button" data-close aria-label="close">×</button></div>`;
        w.prepend(tb);
      }
      const tb = w.querySelector(':scope > .tb');
      tb.addEventListener('pointerdown', e => this.drag(e, w));
      tb.addEventListener('dblclick', e => { if (!e.target.closest('button')) this.max(app); });
      w.addEventListener('pointerdown', () => this.focus(app), true);
      w.querySelector('[data-min]').onclick = e => { e.stopPropagation(); this.min(app); };
      w.querySelector('[data-max]').onclick = e => { e.stopPropagation(); this.max(app); };
      w.querySelectorAll('[data-close]').forEach(b => b.onclick = e => { e.stopPropagation(); this.close(app); });
    });
  },
  place(w) {
    const area = $('#wins').getBoundingClientRect(), n = $$('.w.open').length;
    const ww = Math.min(w.offsetWidth || parseInt(getComputedStyle(w).getPropertyValue('--ww')) || 600, area.width - 20);
    const wh = Math.min(w.offsetHeight || parseInt(getComputedStyle(w).getPropertyValue('--wh')) || 420, area.height - 20);
    let x = Math.max(110, (area.width - ww) / 2 + (n % 5) * 26 - 40), y = Math.max(12, (area.height - wh) / 2 + (n % 5) * 22 - 30);
    x = Math.min(x, area.width - ww - 8); y = Math.min(y, area.height - wh - 8);
    w.style.left = Math.max(4, x) + 'px'; w.style.top = Math.max(4, y) + 'px';
  },
  open(app) {
    if (app === 'x') { if (STATUS && STATUS.x) window.open(STATUS.x, '_blank', 'noopener,noreferrer'); return; }
    const w = this.wins[app]; if (!w) return;
    closeMenus();
    if (!w.classList.contains('open')) { w.classList.add('open'); if (!w.dataset.placed) { this.place(w); w.dataset.placed = '1'; } this.task(app, true); APPS[app] && APPS[app].open && APPS[app].open(); }
    w.hidden = false; w.style.display = ''; w.classList.remove('minimized'); this.focus(app);
  },
  close(app) { const w = this.wins[app]; if (!w) return; w.classList.remove('open', 'active', 'max'); this.task(app, false); APPS[app] && APPS[app].close && APPS[app].close(); this.focusTop(); },
  min(app) { const w = this.wins[app]; w.classList.remove('open', 'active'); w.classList.add('minimized'); this.syncTasks(); this.focusTop(); },
  max(app) { if (MOBILE) return; this.wins[app].classList.toggle('max'); },
  focus(app) {
    const w = this.wins[app]; if (!w || !w.classList.contains('open')) return;
    $$('.w.active').forEach(x => x !== w && x.classList.remove('active'));
    w.classList.add('active'); w.style.zIndex = ++this.z; this.order = this.order.filter(a => a !== app); this.order.push(app); this.syncTasks();
  },
  focusTop() { const open = this.order.filter(a => this.wins[a].classList.contains('open')); if (open.length) this.focus(open[open.length - 1]); else this.syncTasks(); },
  task(app, on) {
    const t = $('#tasks'); let b = t.querySelector(`[data-task="${app}"]`);
    if (on && !b) {
      const w = this.wins[app]; b = document.createElement('button'); b.type = 'button'; b.dataset.task = app;
      b.innerHTML = `<img src="/assets/img/ico-${w.dataset.icon}-16.png" alt=""><span>${esc(w.dataset.title.split(' — ')[0])}</span>`;
      b.onclick = () => { const w2 = this.wins[app]; if (w2.classList.contains('minimized')) { w2.classList.remove('minimized'); w2.classList.add('open'); this.focus(app); } else if (w2.classList.contains('active')) this.min(app); else this.focus(app); };
      t.appendChild(b);
    }
    if (!on && b) b.remove();
    this.syncTasks();
  },
  syncTasks() { $$('#tasks button').forEach(b => b.classList.toggle('on', this.wins[b.dataset.task].classList.contains('active'))); },
  drag(e, w) {
    if (e.target.closest('button') || w.classList.contains('max') || MOBILE) return;
    e.preventDefault(); const r = w.getBoundingClientRect(), area = $('#wins').getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const mv = ev => { w.style.left = Math.min(area.width - 60, Math.max(-r.width + 80, ev.clientX - area.left - dx)) + 'px'; w.style.top = Math.min(area.height - 30, Math.max(0, ev.clientY - area.top - dy)) + 'px'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  },
};
function dialog(title, html, buttons = [['ok', true]], icon = 'warn') {
  return new Promise(res => {
    const d = $('#dlg'); $('#dlgT').textContent = title; $('#dlgB').innerHTML = html; $('#dlgI').src = `/assets/img/ico-${icon}.png`;
    const a = $('#dlgA'); a.innerHTML = '';
    buttons.forEach(([label, def], i) => { const b = document.createElement('button'); b.className = 'bt' + (def ? ' def' : ''); b.type = 'button'; b.textContent = label; b.onclick = () => { d.classList.remove('open'); d.hidden = true; res(i); }; a.appendChild(b); });
    d.hidden = false; d.classList.add('open', 'active'); d.querySelector('[data-x]').onclick = () => { d.classList.remove('open'); d.hidden = true; res(-1); };
    setTimeout(() => a.querySelector('.def') && a.querySelector('.def').focus(), 30);
  });
}

// ================================================================ desktop chrome: icons, selection, menus, tray
function closeMenus() { $('#startmenu').hidden = true; $('#startBtn').setAttribute('aria-expanded', 'false'); $('#ctx').hidden = true; }
function initDesk() {
  WM.init();
  const icons = $$('.ic');
  icons.forEach(ic => {
    ic.addEventListener('click', e => { icons.forEach(x => x.classList.toggle('sel', x === ic)); if (MOBILE) WM.open(ic.dataset.open); });
    ic.addEventListener('dblclick', () => WM.open(ic.dataset.open));
    ic.addEventListener('keydown', e => { if (e.key === 'Enter') WM.open(ic.dataset.open); });
  });
  document.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b && !b.classList.contains('ic')) WM.open(b.dataset.open); });
  // drag-select on the bare desktop
  const desk = $('#desk'), sel = $('#sel');
  desk.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.w, .ic, .taskbar, .menu, .balloon')) return;
    closeMenus(); icons.forEach(x => x.classList.remove('sel')); if (MOBILE) return;
    const x0 = e.clientX, y0 = e.clientY; sel.style.display = 'block';
    const mv = ev => { const x = Math.min(x0, ev.clientX), y = Math.min(y0, ev.clientY), w = Math.abs(ev.clientX - x0), h = Math.abs(ev.clientY - y0);
      Object.assign(sel.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      icons.forEach(ic => { const r = ic.getBoundingClientRect(); ic.classList.toggle('sel', r.right > x && r.left < x + w && r.bottom > y && r.top < y + h); }); };
    const up = () => { sel.style.display = 'none'; sel.style.width = sel.style.height = '0'; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  desk.addEventListener('contextmenu', e => {
    if (e.target.closest('.w, .taskbar')) return; e.preventDefault(); closeMenus();
    const m = $('#ctx'); m.hidden = false; m.style.left = Math.min(e.clientX, innerWidth - 190) + 'px'; m.style.top = Math.min(e.clientY, innerHeight - 180) + 'px';
  });
  $$('#ctx [data-act]').forEach(b => b.onclick = () => { closeMenus(); if (b.dataset.act === 'refresh') { status(); coins(); toast('refreshed'); } if (b.dataset.act === 'arrange') { const g = $('#icons'); [...g.children].sort((a, c) => a.textContent.localeCompare(c.textContent)).forEach(n => g.appendChild(n)); } });
  $('#startBtn').onclick = e => { e.stopPropagation(); const m = $('#startmenu'); const open = m.hidden; closeMenus(); m.hidden = !open; $('#startBtn').setAttribute('aria-expanded', String(open)); };
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.menu, #startBtn')) closeMenus(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });
  $('#shutBtn').onclick = async () => { closeMenus(); const i = await dialog('shut down halo', 'what do you want the computer to do?', [['shut down', true], ['restart', false], ['cancel', false]], 'pc');
    if (i === 0) { $('#shutdown').hidden = false; $('#shutdown').onclick = () => { try { sessionStorage.removeItem('halo:seen'); } catch {} location.reload(); }; }
    if (i === 1) { try { sessionStorage.removeItem('halo:seen'); } catch {} location.reload(); } };
  const tick = () => { const d = new Date(); $('#clock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  tick(); setInterval(tick, 15000);
  $('#balloon').onclick = e => { if (!e.target.closest('.bx')) WM.open('coins'); $('#balloon').hidden = true; };
  $('#welcomeShow').checked = ls.get('halo:nowelcome') !== '1';
  $('#welcomeShow').onchange = e => ls.set('halo:nowelcome', e.target.checked ? '0' : '1');
  wizard(); claimUi(); privacy(); readme(); cmd(); bin();
  $('#wizArt').textContent = WIZ_ART;
  $('#coinsRefresh').onclick = () => coins();
  $('#sysCopy').onclick = () => STATUS && copy(STATUS.treasury);
  status(); coins(true);
  setInterval(status, 20000); setInterval(() => coins(false), 25000);
  if (!RM) import('./ascii3d.js?v=2').then(m => m.mountAscii($('#wall'))).catch(() => {});
}

// ================================================================ live data
let STATUS = null, COINS = [], SEEN = null;
const WHY = { treasury: 'the treasury is empty right now. launches open again when it is refilled.', cap: "today's free launches are gone. it resets at 00:00 UTC.", paused: 'launches are paused for a moment.', rpc: "solana can't be reached right now." };
async function status() {
  try { STATUS = await api('status'); } catch { STATUS = null; }
  const s = STATUS;
  if (!s) { $('#trayDot').className = 'dot off'; $('#trayTxt').textContent = 'offline'; return; }
  const left = Math.max(0, Math.min(s.cap - s.today, s.launchesLeft == null ? s.cap : s.launchesLeft));
  $('#trayDot').className = 'dot ' + (s.ready ? 'live' : 'off');
  $('#trayTxt').textContent = s.ready ? `${left} free launch${left === 1 ? '' : 'es'} left` : (s.why === 'cap' ? 'limit reached' : s.why === 'treasury' ? 'treasury refilling' : 'paused');
  $('#tray').title = `treasury ${s.treasurySol == null ? '—' : s.treasurySol} SOL`;
  $('#freeLeft').textContent = s.ready ? `free launches left today: ${left}` : (WHY[s.why] || 'launches are paused.');
  $('#welcomeStatus').innerHTML = `${s.ready ? '<span class="teal">● launches open</span>' : '<span class="gold">● launches paused</span>'}<br>${left} of ${s.cap} free launches left today<br>${s.launched} coin${s.launched === 1 ? '' : 's'} launched so far<br><span class="dim">each launch costs the treasury ≈ ${s.costSol.toFixed(3)} SOL. you pay 0.</span>`;
  $('#sysLive').innerHTML = `network: <b>${esc(s.network)}</b><br>launches: <b>${s.ready ? 'open' : 'paused'}</b> · ${left} of ${s.cap} left today<br>coins launched: <b>${s.launched}</b><br>cost per launch: <b>≈ ${s.costSol.toFixed(3)} SOL</b> (treasury pays)` + (s.ca ? `<br>$HALO: <b class="gold">${esc(s.ca)}</b>` : '');
  $('#sysTre').textContent = `treasury ${short(s.treasury)} · ${s.treasurySol == null ? '—' : s.treasurySol.toFixed(3)} SOL`;
  if (s.x) $('#icX').hidden = false;
  syncLaunch();
}
async function coins(first) {
  let j; try { j = await api('coins', { params: { limit: 50 } }); } catch (e) { $('#coinsBody').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const list = j.coins || [];
  const fresh = SEEN ? list.filter(c => !SEEN.has(c.id) && c.status === 'launched') : [];
  SEEN = new Set(list.map(c => c.id)); COINS = list;
  if (fresh.length && !first) balloon(`new coin · $${fresh[0].symbol}`, `${fresh[0].name} just launched on halo. click to see it.`);
  $('#coinsMeta').textContent = `${list.length} object(s)`;
  $('#coinsSol').textContent = j.solUsd ? `SOL $${j.solUsd}` : '';
  if (!list.length) { $('#coinsBody').innerHTML = `<div class="empty"><pre>  .--------.\n  | empty_ |\n  '--------'</pre>no coins yet. the first one launched on halo shows up here.<br><br><button class="bt def" type="button" data-open="launch">launch the first</button></div>`; return; }
  const bar = p => { if (p == null) return '<span class="dim">—</span>'; const n = Math.round(p * 10); return `<span class="prog">${'█'.repeat(n)}<i>${'░'.repeat(10 - n)}</i></span> <span class="dim">${Math.round(p * 100)}%</span>`; };
  $('#coinsBody').innerHTML = `<table class="tbl"><thead><tr><th>coin</th><th>age</th><th>mcap</th><th>curve</th><th>creator</th><th></th></tr></thead><tbody>${list.map(c => `
    <tr><td><div class="coin"><img class="ci" src="${esc(c.img)}" alt="" loading="lazy"><b>${esc(c.name)}</b><span>$${esc(c.symbol)}</span></div></td>
    <td class="dim">${ago(c.at)}</td><td>${c.status === 'sending' ? '<span class="pill pend">confirming</span>' : usd(c.mcapUsd)}</td>
    <td>${c.graduated ? '<span class="pill grad">graduated</span>' : bar(c.progress)}</td>
    <td><a class="lk" href="https://solscan.io/account/${esc(c.creator)}" target="_blank" rel="noopener noreferrer">${short(c.creator)}</a></td>
    <td><a class="lk" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener noreferrer">pump.fun ↗</a></td></tr>`).join('')}</tbody></table>`;
}
function balloon(t, b) { const el = $('#balloon'); $('#balT').textContent = t; $('#balB').textContent = b; el.hidden = false; clearTimeout(balloon.t); balloon.t = setTimeout(() => el.hidden = true, 7000); }

// ================================================================ launch.exe
const W = { step: 0, image: null, key: null, own: false };
function go(s) {
  W.step = s;
  $$('#w-launch .step').forEach(el => el.classList.toggle('on', +el.dataset.s === s));
  $$('#rail div').forEach(b => { const i = +b.dataset.s; b.classList.toggle('on', i === s); b.classList.toggle('done', i < s); });
  $('#wizStatus').textContent = `step ${s + 1} of 5 · ${['coin', 'image', 'creator key', 'review', 'launch'][s]}`;
  if (s === 2 && !W.key && !W.own) newKey();
  if (s === 3) review();
}
const utf8len = s => new TextEncoder().encode(s).length;
const coinFields = () => ({ name: $('#fName').value.replace(/\s+/g, ' ').trim(), symbol: $('#fSym').value.trim().replace(/^\$/, ''), description: $('#fDesc').value.trim(), x: $('#fX').value.trim(), tg: $('#fTg').value.trim(), web: $('#fWeb').value.trim() });
function checkCoin() {
  const f = coinFields();
  if (!f.name) return 'Give the coin a name.'; if (utf8len(f.name) > 32) return 'The name is over 32 bytes (emoji count as several).';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,9}$/.test(f.symbol)) return 'The ticker needs 1 to 10 letters or numbers.';
  if (f.x && !/^(https:\/\/)?(www\.)?(x|twitter)\.com\//i.test(f.x)) return 'The X link should start with x.com/';
  if (f.tg && !/^(https:\/\/)?(t|telegram)\.me\//i.test(f.tg)) return 'The Telegram link should start with t.me/';
  return null;
}
async function cleanImage(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Use a PNG, JPG, WebP or GIF.');
  if (file.size > 12e6) throw new Error('That file is over 12 MB.');
  const bmp = await createImageBitmap(file), max = 1000, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  let blob = await new Promise(r => c.toBlob(r, 'image/png'));
  if (blob.size > 1.4e6) blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
  if (blob.size > 1.4e6) blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .75));
  const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  return { dataUrl, bytes: blob.size, w: c.width, h: c.height, origBytes: file.size };
}
function newKey() { const kp = nacl.sign.keyPair(); W.key = { pub: b58(kp.publicKey), sec: kp.secretKey }; $('#kAddr').textContent = W.key.pub; $('#kSec').textContent = b58(W.key.sec); $('#kSec').classList.remove('show'); $('#kSaved').checked = false; }
function keyFile() { const blob = new Blob([JSON.stringify(Array.from(W.key.sec))], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `halo-creator-${W.key.pub.slice(0, 6)}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const creator = () => W.own ? $('#fOwn').value.trim() : W.key && W.key.pub;
function review() {
  const f = coinFields();
  $('#rImg').src = W.image ? W.image.dataUrl : '';
  const rows = [['name', esc(f.name)], ['ticker', '$' + esc(f.symbol)], ['description', esc((f.description ? f.description + '\n\n' : '') + 'launched on halo · ' + location.host)]];
  if (f.x) rows.push(['x', esc(f.x)]); if (f.tg) rows.push(['telegram', esc(f.tg)]); if (f.web) rows.push(['website', esc(f.web)]);
  rows.push(['creator', `<span class="teal">${esc(creator())}</span> <span class="dim">${W.own ? '(your own)' : '(made in this browser)'}</span>`]);
  rows.push(['launcher', '<span class="dim">a fresh wallet, made and funded at launch</span>']);
  rows.push(['cost to you', `<b class="gold">0 SOL</b> <span class="dim">· treasury pays ≈ ${STATUS ? STATUS.costSol.toFixed(3) : '0.02'} SOL</span>`]);
  rows.push(['dev buy', '<span class="dim">none. nobody holds the coin at launch.</span>']);
  $('#rKv').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd${k === 'description' ? ' class="desc"' : ''}>${v}</dd>`).join('');
  syncLaunch();
}
function syncLaunch() { const b = $('#goLaunch'); if (!b) return; b.disabled = !(STATUS && STATUS.ready); if (W.step === 3) $('#e3').textContent = STATUS && !STATUS.ready ? (WHY[STATUS.why] || 'Launches are paused.') : (STATUS ? '' : 'Checking the treasury…'); }
const term = lines => $('#term').innerHTML = lines.join('\n');
function pow(challenge, bits, onP) { return new Promise((res, rej) => { const w = new Worker('/assets/js/pow.js'); w.onmessage = e => { if (e.data.done) { w.terminate(); res(e.data); } else onP(e.data); }; w.onerror = () => { w.terminate(); rej(new Error('Proof of work failed in this browser.')); }; w.postMessage({ challenge, bits }); }); }
async function launch() {
  const f = coinFields(), out = []; const say = s => { out.push(s); term(out); }, sayLast = s => { out[out.length - 1] = s; term(out); };
  go(4); $('#doneCard').classList.remove('show'); const oldBack = $('#termBack'); if (oldBack) oldBack.remove();
  try {
    say('<span class="m">C:\\HALO&gt;</span> launch --private');
    say('requesting a proof-of-work challenge …'); const ch = await api('pow'); sayLast(`requesting a proof-of-work challenge … <span class="ok">ok</span> <span class="m">(${ch.bits} bits)</span>`);
    say('hashing on your device …'); const t0 = performance.now();
    const res = await pow(ch.challenge, ch.bits, p => { const k = Math.min(1, p.tries / Math.pow(2, ch.bits)), n = Math.round(k * 16); sayLast(`hashing on your device <span class="bar8">[${'█'.repeat(n)}${'░'.repeat(16 - n)}]</span> <span class="m">${(p.rate / 1e6).toFixed(2)}M h/s</span>`); });
    sayLast(`hashing on your device <span class="bar8">[${'█'.repeat(16)}]</span> <span class="ok">found</span> <span class="m">${((performance.now() - t0) / 1000).toFixed(1)}s</span>`);
    say(`cleaned image ……………… <span class="ok">${Math.round(W.image.bytes / 1024)} KB</span>`);
    say(`creator ……………………… <span class="ok">${short(creator())}</span> <span class="m">(${W.own ? 'your own' : 'born in this browser'})</span>`);
    say('treasury funds a fresh launcher · pump.fun create …');
    const j = await api('launch', { method: 'POST', body: { ...f, image: W.image.dataUrl, creator: creator(), pow: { challenge: ch.challenge, nonce: res.nonce } } });
    sayLast('treasury funds a fresh launcher · pump.fun create … <span class="ok">sent</span>');
    say(`mint ……………………………… <span class="g">${j.mint}</span>`);
    let st = j.status, n = 0; say(st === 'launched' ? 'confirmed ……………………… <span class="ok">yes</span>' : 'waiting for confirmation …');
    while (st === 'sending' && n++ < 40) { await sleep(2500); try { st = (await api('launches', { params: { id: j.id } })).launch.status; } catch {} if (st === 'launched') sayLast('confirmed ……………………… <span class="ok">yes</span>'); }
    if (st === 'failed') throw new Error('The launch did not go through. Nothing was created and you spent nothing.');
    if (st !== 'launched') say('<span class="g">still confirming. check coins.db in a minute.</span>');
    say(''); say(`<span class="ok">■ ${esc(f.name)} ($${esc(f.symbol)}) is live.</span> its creator is a key nobody else has ever seen.`);
    $('#dPump').href = 'https://pump.fun/coin/' + j.mint; $('#dTx').href = 'https://solscan.io/tx/' + j.sig; $('#doneCard').classList.add('show');
    status(); coins(false);
  } catch (e) {
    say(`<span class="r">✗ ${esc(e.message)}</span>`); if (e.detail) say(`<span class="m">${esc(String(e.detail).slice(0, 200))}</span>`);
    const back = document.createElement('button'); back.id = 'termBack'; back.className = 'bt'; back.type = 'button'; back.textContent = '< back to review'; back.style.marginTop = '10px'; back.onclick = () => { back.remove(); go(3); }; $('#term').after(back);
  }
}
function wizard() {
  $$('#w-launch [data-back]').forEach(b => b.onclick = () => go(W.step - 1));
  $$('#w-launch [data-cancel]').forEach(b => b.onclick = () => WM.close('launch'));
  $('#fDesc').addEventListener('input', e => $('#descCount').textContent = `${e.target.value.length} / 600 · "launched on halo" is added at the end`);
  $('#fSym').addEventListener('input', e => { e.target.value = e.target.value.replace(/^\$/, '').replace(/\s/g, ''); });
  $('#s0').addEventListener('submit', e => { e.preventDefault(); const er = checkCoin(); $('#e0').textContent = er || ''; if (!er) go(1); });
  const pick = async file => { $('#e1').textContent = ''; $('#imgInfo').textContent = 'cleaning…';
    try { const img = await cleanImage(file); W.image = img; $('#pv').innerHTML = `<img alt="" src="${img.dataUrl}">`; $('#imgInfo').innerHTML = `<span class="teal">clean</span> · ${img.w}×${img.h} · ${Math.round(img.bytes / 1024)} KB (was ${Math.round(img.origBytes / 1024)} KB with its metadata)`; }
    catch (e) { $('#e1').textContent = e.message; $('#imgInfo').textContent = ''; } };
  $('#fImg').addEventListener('change', e => e.target.files[0] && pick(e.target.files[0]));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) pick(f); });
  $('#n1').onclick = () => { if (!W.image) { $('#e1').textContent = 'Add an image first.'; return; } go(2); };
  $('#kSec').onclick = () => $('#kSec').classList.toggle('show');
  $('#kDl').onclick = () => { keyFile(); $('#kSaved').checked = true; };
  $('#kCopy').onclick = () => copy(b58(W.key.sec));
  $('#kNew').onclick = () => newKey();
  $('#kToggle').onclick = () => { W.own = !W.own; $('#keyBox').hidden = W.own; $('#ownBox').hidden = !W.own; $('#kToggle').textContent = W.own ? 'make a fresh key in this browser instead (recommended)' : 'use an address i already have instead'; if (!W.own && !W.key) newKey(); };
  $('#n2').onclick = () => { if (W.own) { if (!isAddr($('#fOwn').value.trim())) { $('#e2').textContent = 'That is not a Solana address.'; return; } } else if (!$('#kSaved').checked) { $('#e2').textContent = 'Save your creator key first, then tick the box.'; return; } $('#e2').textContent = ''; go(3); };
  $('#goLaunch').onclick = () => { if (!$('#rOk').checked) { $('#e3').textContent = 'Tick the box to confirm.'; return; } if (!STATUS || !STATUS.ready) { syncLaunch(); return; } launch(); };
  $('#dAgain').onclick = () => { W.image = null; W.key = null; $('#s0').reset(); $('#pv').innerHTML = '<pre class="asciiprev">  drop\n  an image\n  here</pre>'; $('#imgInfo').textContent = ''; $('#rOk').checked = false; go(0); };
}

// ================================================================ claim.exe
const CL = { kp: null, addr: null, watch: false };
function loadSecret(text) { text = String(text || '').trim(); const sec = text.startsWith('[') ? Uint8Array.from(JSON.parse(text)) : unb58(text); if (sec.length === 32) return nacl.sign.keyPair.fromSeed(sec); if (sec.length !== 64) throw new Error('That does not look like a Solana secret key.'); return nacl.sign.keyPair.fromSecretKey(sec); }
function setClaimKey(kp, watchAddr) { CL.kp = kp; CL.watch = !kp; CL.addr = kp ? b58(kp.publicKey) : watchAddr; $('#eK').textContent = ''; $('#cAddr').textContent = CL.addr + (CL.watch ? '  (read-only)' : ''); $('#cRefresh').disabled = false; refreshClaim(); }
async function refreshClaim() {
  if (!CL.addr) return; $('#eC').textContent = '';
  try { const j = await api('claim', { params: { creator: CL.addr } });
    $('#cVault').textContent = `${j.vaultSol.toFixed(4)} SOL`; $('#cWallet').textContent = `${j.walletSol.toFixed(4)} SOL`;
    $('#cClaim').disabled = CL.watch || !j.canClaim; $('#cSend').disabled = CL.watch || !(j.walletSol > 0.00001);
    if (!j.canClaim && j.vaultSol > 0) $('#eC').innerHTML = `<span class="dim">claims open from ${j.minClaimSol} SOL, so the network fee is worth paying.</span>`;
  } catch (e) { $('#eC').textContent = e.message; }
}
function cterm(s) { const t = $('#cTerm'); t.hidden = false; t.innerHTML = s; t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
async function signAndSend(build, sendOp, body) { const b = await api(build, { method: 'POST', body }); const sig = nacl.sign.detached(unb64(b.message), CL.kp.secretKey); return api(sendOp, { method: 'POST', body: { message: b.message, token: b.token, signer: CL.addr, signature: b58(sig) } }); }
function claimUi() {
  const load = async f => { try { setClaimKey(loadSecret(await f.text())); } catch { $('#eK').textContent = 'That file is not a creator key.'; } };
  $('#kFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) load(f); e.target.value = ''; });
  const kd = $('#kDrop');
  ['dragenter', 'dragover'].forEach(t => kd.addEventListener(t, e => { e.preventDefault(); kd.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => kd.addEventListener(t, e => { e.preventDefault(); kd.classList.remove('over'); }));
  kd.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) load(f); });
  $('#kPaste').addEventListener('change', e => { try { setClaimKey(loadSecret(e.target.value)); e.target.value = ''; } catch (er) { $('#eK').textContent = er.message || 'That is not a secret key.'; } });
  $('#kWatch').addEventListener('change', e => { const a = e.target.value.trim(); if (!isAddr(a)) { $('#eK').textContent = 'That is not a Solana address.'; return; } setClaimKey(null, a); });
  $('#cRefresh').onclick = refreshClaim;
  $('#cClaim').onclick = async () => { $('#cClaim').disabled = true; cterm('building the claim · the treasury pays the fee …');
    try { const r = await signAndSend('claimbuild', 'claimsend', { creator: CL.addr }); cterm(`<span class="ok">claimed.</span> <a class="lk" href="https://solscan.io/tx/${r.sig}" target="_blank" rel="noopener noreferrer">transaction ↗</a>`); setTimeout(refreshClaim, 2500); }
    catch (e) { cterm(`<span class="r">✗ ${esc(e.message)}</span>`); $('#cClaim').disabled = false; } };
  $('#cSend').onclick = async () => { const to = $('#cTo').value.trim(); if (!isAddr(to)) { $('#eC').textContent = 'Enter a Solana address to send to.'; return; } $('#cSend').disabled = true; cterm('building the transfer …');
    try { const r = await signAndSend('withdrawbuild', 'withdrawsend', { from: CL.addr, to }); cterm(`<span class="ok">sent.</span> <a class="lk" href="https://solscan.io/tx/${r.sig}" target="_blank" rel="noopener noreferrer">transaction ↗</a>`); setTimeout(refreshClaim, 2500); }
    catch (e) { cterm(`<span class="r">✗ ${esc(e.message)}</span>`); $('#cSend').disabled = false; } };
}

// ================================================================ privacy.cpl
const LAYERS = [
  ['site', 'a site that tracks <b>nothing</b>', 'no analytics, no cookies, no third-party scripts or fonts. this page only talks to its own server, and its security headers forbid anything else. open devtools and check.', 'your IP reaches our host, like every website.'],
  ['connect', 'no wallet <b>connect</b>', 'you never connect a wallet, approve anything, or sign a launch. there is nothing for a drainer to hijack and no wallet of yours on the launch transaction.', 'the coin, its name, image and description.'],
  ['key', 'a creator key <b>born here</b>', "your browser makes a brand-new key, and that key becomes the coin's creator. it has no history and no funding trail. we never see it. you save it, you own the fees.", 'the creator address and the fees it earns.'],
  ['launcher', 'a fresh <b>launcher</b>', 'a new wallet signs each launch. the halo treasury funds it inside the same transaction to the lamport, so it ends empty. the dev wallet on the chart is never yours.', 'that the halo treasury paid for the launch.'],
  ['gas', 'claims without <b>gas</b>', 'funding a new wallet is how people get traced. so the creator key never needs funding: you sign the claim in your browser and the treasury pays the network fee.', 'the claim, and anything you do with the fees after.'],
  ['files', 'clean <b>files</b>', 'your image is redrawn in your browser before upload, which drops hidden data like camera, time and location. only the pixels leave your device.', 'whatever the picture itself shows.'],
];
function rings(on) {
  const labels = ['01 site', '02 connect', '03 key', '04 launcher', '05 gas', '06 files'], Wd = 40, Hd = 15, grid = Array.from({ length: Hd }, () => Array(Wd).fill([' ', -1]));
  labels.forEach((lab, i) => { const x0 = i * 3, y0 = i, x1 = Wd - 1 - i * 3, y1 = Hd - 1 - i; if (x1 - x0 < 4 || y1 <= y0) return;
    for (let x = x0; x <= x1; x++) { grid[y0][x] = ['─', i]; grid[y1][x] = ['─', i]; } for (let y = y0; y <= y1; y++) { grid[y][x0] = ['│', i]; grid[y][x1] = ['│', i]; }
    grid[y0][x0] = ['┌', i]; grid[y0][x1] = ['┐', i]; grid[y1][x0] = ['└', i]; grid[y1][x1] = ['┘', i]; });
  const cy = Hd >> 1; [...'you'].forEach((ch, k) => grid[cy][(Wd - 3 >> 1) + k] = [ch, 9]);
  return grid.map(r => r.map(([ch, i]) => i === 9 ? `<span class="core">${ch}</span>` : i === on ? `<span class="on">${esc(ch)}</span>` : esc(ch)).join('')).join('\n');
}
function privacy() {
  const tabs = $('#ptabs');
  tabs.innerHTML = LAYERS.map((l, i) => `<button type="button" role="tab" data-t="${i}">${l[0]}</button>`).join('');
  const show = i => { $$('#ptabs button').forEach(b => b.classList.toggle('on', +b.dataset.t === i)); const l = LAYERS[i];
    $('#ptab').innerHTML = `<h4>${String(i + 1).padStart(2, '0')} · ${l[1]}</h4><p>${l[2]}</p><div class="pub"><b>still public:</b> ${l[3]}</div><pre>${rings(i)}</pre>`; };
  $$('#ptabs button').forEach(b => b.onclick = () => show(+b.dataset.t)); show(0);
}
// ================================================================ readme.txt
function readme() {
  const Q = [
    ['what is halo?', 'a pump.fun launchpad built around privacy you can check. you fill in a coin, your browser makes the creator key, the halo treasury pays the creation cost and a fresh wallet signs the launch. you never connect, sign or pay.'],
    ['is it really free?', 'yes. creating a pump.fun coin costs about 0.02 SOL in account rent and network fees, and the treasury pays it. there is no dev buy, so nobody holds the coin at launch.'],
    ['why a daily limit?', 'every launch costs the treasury real SOL, so there are a set number of free launches per day (reset 00:00 UTC) and a few per visitor. instead of an account you do a few seconds of proof of work in your browser, which keeps bots out without asking who you are.'],
    ['who gets the creator fees?', 'the creator key from the wizard, and only it. pump.fun pays creator fees to that address on every trade and halo takes no cut. claim them in claim.exe: you sign with the key, the treasury pays the gas.'],
    ['can halo take my fees or my coin?', 'no. halo never sees the creator key, never buys the coin, and the launch wallet ends with zero SOL. halo holds its own treasury key, which only pays launch costs and claim fees.'],
    ['what if i lose the creator key?', 'the fees stay where they are, unclaimable. nobody can recover the key, including us.'],
    ['what can people still see?', 'everything on solana is public: the coin, trades, the creator address, the launch wallet and that the halo treasury funded it. what they cannot see is a link to you, unless you make one, for example by sending the fees to a wallet you use in public.'],
    ['does halo keep logs?', 'halo stores each launch (coin details and addresses, all public anyway) and, for the daily limit only, a salted hash of your IP that is useless the next day and then deleted. no accounts, no cookies, no analytics. the host still sees requests the way every host does.'],
    ['is this financial advice?', 'no. memecoins are extremely risky and most go to zero. halo is a tool, not affiliated with pump.fun.'],
  ];
  $('#readmeBody').innerHTML = `<h5>README.TXT  ·  halo 98</h5><p>launch with layers of privacy. every one of them real.\n</p>` + Q.map(([q, a]) => `<h5>> ${esc(q)}</h5><p>${esc(a)}</p>`).join('');
}
// ================================================================ cmd.exe
function cmd() {
  const out = $('#cmdOut'), inp = $('#cmdIn');
  const print = (h, cls) => { const d = document.createElement('div'); if (cls) d.className = cls; d.innerHTML = h; out.appendChild(d); $('#cmdBody').scrollTop = 1e9; };
  print('halo 98 [version 4.10.1998]', 'm'); print('(c) nobody. all rights unclaimed.', 'm'); print('&nbsp;'); print('type <span class="g">help</span> for commands.');
  $('#cmdBody').addEventListener('click', () => inp.focus());
  const C = {
    help: () => [['launch', 'open the launch wizard'], ['coins', 'list the newest coins'], ['claim', 'open claim.exe'], ['status', 'treasury and launches'], ['privacy', 'the six layers'], ['readme', 'open readme.txt'], ['whoami', 'who are you?'], ['ver', 'version'], ['date', 'today'], ['cls', 'clear the screen'], ['exit', 'close this window']].forEach(([a, b]) => print(`<span class="g">${a.padEnd(9, ' ')}</span><span class="m">${b}</span>`)),
    status: () => { const s = STATUS; if (!s) return print('offline.', 'm'); print(`treasury   ${s.treasurySol == null ? '—' : s.treasurySol.toFixed(3)} SOL  <span class="m">${esc(s.treasury)}</span>`); print(`launches   ${s.ready ? '<span class="ok">open</span>' : '<span class="g">paused</span>'} · ${Math.max(0, s.cap - s.today)} of ${s.cap} left today`); print(`launched   ${s.launched} coin(s) · ≈${s.costSol.toFixed(3)} SOL each, paid by the treasury`); },
    coins: () => { if (!COINS.length) return print('no coins yet. type <span class="g">launch</span> to make the first.', 'm'); COINS.slice(0, 8).forEach(c => print(`<span class="g">$${esc(c.symbol).padEnd(10, ' ')}</span>${esc(c.name).slice(0, 22).padEnd(23, ' ')}<span class="m">${ago(c.at).padEnd(5, ' ')}</span>${c.mcapUsd ? usd(c.mcapUsd) : ''}`)); },
    launch: () => { print('starting launch.exe …', 'm'); WM.open('launch'); }, claim: () => { print('starting claim.exe …', 'm'); WM.open('claim'); },
    privacy: () => WM.open('privacy'), layers: () => WM.open('privacy'), readme: () => WM.open('readme'), docs: () => WM.open('readme'),
    whoami: () => print('nobody', 'ok'), ver: () => print('halo 98 [version 4.10.1998]'), date: () => print(new Date().toString()), time: () => print(new Date().toLocaleTimeString()),
    cls: () => { out.innerHTML = ''; }, clear: () => { out.innerHTML = ''; }, exit: () => WM.close('cmd'),
    dir: () => ['launch.exe', 'coins.db', 'claim.exe', 'privacy.cpl', 'readme.txt'].forEach(f => print(`10-20-98  12:00a    ${f}`)),
    sudo: () => print('nice try. there is no root here, only nobody.', 'm'),
  };
  inp.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return; const raw = inp.value; inp.value = ''; print(`<span class="ok">C:\\HALO&gt;</span> ${esc(raw)}`);
    const [c, ...rest] = raw.trim().split(/\s+/); const k = (c || '').toLowerCase(); if (!k) return;
    if (k === 'echo') return print(esc(rest.join(' ')));
    if (k === 'start' && rest[0]) { const a = { 'launch.exe': 'launch', 'claim.exe': 'claim', 'coins.db': 'coins', 'readme.txt': 'readme', 'privacy.cpl': 'privacy' }[rest[0].toLowerCase()] || rest[0].toLowerCase(); return WM.open(a); }
    (C[k] || (() => print(`'${esc(k)}' is not recognized as an internal or external command.`, 'm')))();
  });
}
// ================================================================ recycle bin
function bin() {
  const MSG = { name: "this file is empty. we never had your name in the first place.", logs: 'nothing to restore. halo does not keep visitor logs.', dev: 'empty. launches have no dev buy, so there was never a dev bag to delete.' };
  $$('#w-bin tr[data-msg]').forEach(tr => { tr.addEventListener('dblclick', () => dialog('recycle bin', esc(MSG[tr.dataset.msg]), [['ok', true]], 'bin')); tr.addEventListener('click', () => { $$('#w-bin tr').forEach(x => x.classList.toggle('picked', x === tr)); if (MOBILE) dialog('recycle bin', esc(MSG[tr.dataset.msg]), [['ok', true]], 'bin'); }); });
}
const APPS = { cmd: { open: () => setTimeout(() => $('#cmdIn').focus(), 50) }, coins: { open: () => coins(false) }, pc: { open: () => status() }, launch: { open: () => { if (W.step === 0) setTimeout(() => $('#fName').focus(), 60); } } };

boot();
