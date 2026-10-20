// HALO tools: strip.exe (what a photo carries besides the picture, and a clean copy), scan.exe (everything this page
// talks to, checked live in your browser) and the cd player (the soundtrack, made by code, with a visualizer).
// Nothing here sends anything anywhere.

// ---------------------------------------------------------------- reading hidden data out of image files
export function readMeta(buf) {
  const u = new Uint8Array(buf), dv = new DataView(buf), out = { kind: 'image', items: [], blocks: [], bytes: 0, gps: null };
  const ascii = (o, n) => { let s = ''; for (let i = 0; i < n && o + i < u.length; i++) { const c = u[o + i]; if (!c) break; s += String.fromCharCode(c); } return s.trim(); };
  const add = (k, v) => { if (v != null && String(v).trim() && !out.items.some(x => x[0] === k)) out.items.push([k, String(v).trim()]); };
  function exif(t) {                                         // t: where the TIFF header starts
    if (t + 8 > u.length) return;
    const le = u[t] === 0x49, g16 = o => dv.getUint16(t + o, le), g32 = o => dv.getUint32(t + o, le);
    const val = (type, cnt, vo) => {
      const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }[type] || 1, off = size * cnt > 4 ? g32(vo) : vo;
      if (t + off >= u.length) return null;
      if (type === 2) return ascii(t + off, cnt);
      if (type === 3) return g16(off);
      if (type === 4) return g32(off);
      if (type === 5 || type === 10) { const r = []; for (let i = 0; i < Math.min(cnt, 8); i++) { const a = g32(off + i * 8), b = g32(off + i * 8 + 4); r.push(b ? a / b : 0); } return r; }
      return null;
    };
    const ifd = (o, fn) => { if (!o || t + o + 2 > u.length) return; const n = g16(o); for (let i = 0; i < n && i < 300; i++) { const e = o + 2 + i * 12; if (t + e + 12 > u.length) break; try { fn(g16(e), val(g16(e + 2), g32(e + 4), e + 8), g32(e + 8)); } catch {} } };
    let exifAt = 0, gpsAt = 0, make = '', model = '';
    ifd(g32(4), (tag, v, raw) => {
      if (tag === 0x010F) make = v; else if (tag === 0x0110) model = v; else if (tag === 0x0131) add('software', v); else if (tag === 0x0132) add('saved', v);
      else if (tag === 0x013B) add('artist', v); else if (tag === 0x8298) add('copyright', v); else if (tag === 0x8769) exifAt = raw; else if (tag === 0x8825) gpsAt = raw;
    });
    if (make || model) add('camera', (model && model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`).trim());
    ifd(exifAt, (tag, v) => {
      if (tag === 0x9003) add('taken', v); else if (tag === 0x9011) add('time zone', v); else if (tag === 0xA434) add('lens', v);
      else if (tag === 0xA431) add('camera serial no.', v); else if (tag === 0xA435) add('lens serial no.', v); else if (tag === 0xA430) add('owner', v); else if (tag === 0xA420) add('unique photo id', v);
    });
    const G = {}; ifd(gpsAt, (tag, v) => { G[tag] = v; });
    const deg = a => Array.isArray(a) ? a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600 : null;
    const lat = deg(G[2]), lon = deg(G[4]);
    if (lat != null && lon != null && (lat || lon)) {
      const la = lat * (String(G[1]).toUpperCase() === 'S' ? -1 : 1), lo = lon * (String(G[3]).toUpperCase() === 'W' ? -1 : 1);
      out.gps = [la, lo]; add('location', `${Math.abs(la).toFixed(5)}° ${la < 0 ? 'S' : 'N'}, ${Math.abs(lo).toFixed(5)}° ${lo < 0 ? 'W' : 'E'}`);
      if (Array.isArray(G[6]) && G[6][0]) add('altitude', `${Math.round(G[6][0])} m`);
    }
  }
  if (u[0] === 0xFF && u[1] === 0xD8) {
    out.kind = 'jpeg'; let o = 2;
    while (o + 4 <= u.length && u[o] === 0xFF) {
      const m = u[o + 1]; if (m === 0xDA || m === 0xD9) break;
      if (m === 0xFF || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { o += 1; continue; }
      const len = dv.getUint16(o + 2), seg = o + 4;
      if (m === 0xE1 && ascii(seg, 4) === 'Exif') { out.bytes += len + 2; out.blocks.push('exif'); exif(seg + 6); }
      else if (m === 0xE1 && ascii(seg, 29).startsWith('http://ns.adobe.com/xap')) { out.bytes += len + 2; out.blocks.push('xmp'); }
      else if (m === 0xE2 && ascii(seg, 11) === 'ICC_PROFILE') { out.icc = true; }      // a colour profile describes colours, not you: not counted
      else if (m === 0xED) { out.bytes += len + 2; out.blocks.push('photoshop / iptc'); }
      else if (m === 0xFE) { out.bytes += len + 2; out.blocks.push('comment'); add('comment', ascii(seg, Math.min(80, len - 2))); }
      else if (m >= 0xE1 && m <= 0xEF) { out.bytes += len + 2; out.blocks.push('app' + (m - 0xE0) + ' block'); }
      o = seg + len - 2;
    }
  } else if (u[0] === 0x89 && ascii(1, 3) === 'PNG') {
    out.kind = 'png'; let o = 8;
    while (o + 8 <= u.length) {
      const len = dv.getUint32(o), type = ascii(o + 4, 4), names = { tEXt: 'text', iTXt: 'text', zTXt: 'text', eXIf: 'exif', tIME: 'time' };
      if (names[type]) { out.bytes += len + 12; out.blocks.push(names[type]); if (type === 'eXIf') exif(o + 8); if (type === 'tEXt') { const k = ascii(o + 8, 79); add(k.toLowerCase() || 'text', ascii(o + 9 + k.length, Math.min(100, len - k.length - 1))); } }
      if (type === 'IEND' || len > u.length) break; o += len + 12;
    }
  } else if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    out.kind = 'webp'; let o = 12;
    while (o + 8 <= u.length) {
      const type = ascii(o, 4), len = dv.getUint32(o + 4, true);
      if (type === 'EXIF') { out.bytes += len + 8; out.blocks.push('exif'); exif(o + 8 + (ascii(o + 8, 4) === 'Exif' ? 6 : 0)); }
      else if (type === 'XMP ') { out.bytes += len + 8; out.blocks.push('xmp'); }
      o += 8 + len + (len & 1);
    }
  }
  out.blocks = [...new Set(out.blocks)];
  return out;
}

export function install(X) {
  const { $, esc, WM, toast } = X;
  const hooks = {};
  const kb = n => n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;

  // ================================================================ strip.exe
  let clean = null, cleanName = 'clean.png';
  const row = (k, v, cls = '') => `<span>${esc(k)}</span><b class="${cls}">${esc(v)}</b>`;
  function show(el, meta, after) {
    const keys = ['camera', 'lens', 'taken', 'time zone', 'location', 'altitude', 'camera serial no.', 'software', 'artist', 'owner'];
    const it = Object.fromEntries(meta.items);
    let h = keys.filter(k => after || it[k] || ['camera', 'taken', 'location'].includes(k)).map(k => row(k, it[k] || '—', it[k] ? (k === 'location' || k.includes('serial') || k === 'owner' || k === 'artist' ? 'red' : 'gold') : 'dim')).join('');
    meta.items.filter(([k]) => !keys.includes(k)).slice(0, 4).forEach(([k, v]) => { h += row(k, v.length > 40 ? v.slice(0, 40) + '…' : v, 'gold'); });
    h += row('hidden blocks', meta.blocks.length ? meta.blocks.join(', ') : 'none', meta.blocks.length ? 'gold' : 'teal');
    h += row('extra bytes', meta.bytes ? kb(meta.bytes) : '0', meta.bytes ? 'gold' : 'teal');
    el.innerHTML = h;
  }
  async function strip(file) {
    if (!file || !/^image\//.test(file.type || '') && !/\.(jpe?g|png|webp|gif|heic)$/i.test(file.name || '')) { $('#sErr').textContent = 'That is not an image.'; return; }
    $('#sErr').textContent = ''; $('#sNote').textContent = 'reading…'; $('#sSave').disabled = $('#sUse').disabled = true;
    try {
      const buf = await file.arrayBuffer(), before = readMeta(buf);
      show($('#sBefore'), before, false);
      const bmp = await createImageBitmap(file), max = 2400, k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const png = before.kind === 'png' || before.kind === 'image';
      clean = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', .92));
      cleanName = (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '-clean.' + (png ? 'png' : 'jpg');
      const after = readMeta(await clean.arrayBuffer());
      show($('#sAfter'), after, true);
      $('#sPv').innerHTML = `<img alt="" src="${URL.createObjectURL(clean)}">`;
      const found = before.items.length + before.blocks.length;
      $('#sNote').innerHTML = before.gps ? '<span class="red">this photo says where it was taken.</span> anyone with the original file can see it. the clean copy cannot.'
        : found ? `<span class="gold">${before.items.length + before.blocks.length} things rode along with this photo.</span> the clean copy has only the pixels.`
        : '<span class="teal">nothing hidden found in this file.</span> it was redrawn anyway, which is what halo does to every coin image.';
      $('#sSave').disabled = $('#sUse').disabled = false;
      X.sfx && X.sfx(before.gps || found ? 'ding' : 'chime');
    } catch (e) { $('#sErr').textContent = 'This browser could not read that image.'; $('#sNote').textContent = ''; }
  }
  $('#sFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) strip(f); e.target.value = ''; });
  const sd = $('#sDrop');
  ['dragenter', 'dragover'].forEach(t => sd.addEventListener(t, e => { e.preventDefault(); sd.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => sd.addEventListener(t, e => { e.preventDefault(); sd.classList.remove('over'); }));
  sd.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) strip(f); });
  $('#sSave').onclick = () => { if (!clean) return; const a = document.createElement('a'); a.href = URL.createObjectURL(clean); a.download = cleanName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#sUse').onclick = () => { if (clean) X.useImage(new File([clean], cleanName, { type: clean.type })); };
  hooks.strip = { open: f => { if (f instanceof File) strip(f); } };

  // ================================================================ scan.exe
  let scanning = false;
  const TRACKERS = ['ga', 'gtag', 'dataLayer', 'fbq', '_paq', 'plausible', 'posthog', 'mixpanel', 'amplitude', 'heap', 'hj', 'clarity', 'Intercom', '_hsq', 'analytics', 'umami', 'sa_event'];
  async function scan() {
    if (scanning) return; scanning = true;
    const out = $('#scanOut'), lines = [], bar = $('#scanBar'); out.innerHTML = ''; $('#scanTbl').innerHTML = ''; $('#scanAgain').disabled = true;
    const dots = (l, w = 26) => esc(l) + ' ' + '.'.repeat(Math.max(3, w - l.length)) + ' ';
    const put = (l, v, cls = 'ok', extra = '') => { lines.push(`${dots(l)}<span class="${cls}">${esc(v)}</span>${extra ? ` <span class="m">${esc(extra)}</span>` : ''}`); out.innerHTML = lines.join('\n'); };
    const wait = ms => new Promise(r => setTimeout(r, ms));
    lines.push('<span class="m">C:\\HALO&gt;</span> scan --this-page'); out.innerHTML = lines.join('\n');
    for (let i = 0; i <= 20; i++) { bar.style.width = i * 5 + '%'; await wait(28); }
    const nav = performance.getEntriesByType('navigation')[0], res = performance.getEntriesByType('resource').filter(e => /^https?:/.test(e.name));
    const all = [nav, ...res].filter(Boolean), hosts = new Map();
    all.forEach(e => { try { const h = new URL(e.name).host; hosts.set(h, (hosts.get(h) || 0) + 1); } catch {} });
    const third = [...hosts.keys()].filter(h => h !== location.host), bytes = all.reduce((a, e) => a + (e.transferSize || 0), 0);
    const cookies = document.cookie ? document.cookie.split(';').filter(s => s.trim()).length : 0;
    let keys = []; try { for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch {}
    const tracked = TRACKERS.filter(k => { try { return k in window && window[k] != null; } catch { return false; } });
    const fonts = res.filter(e => /\.(woff2?|ttf|otf)(\?|$)/i.test(e.name)), fontsOut = fonts.filter(e => new URL(e.name).host !== location.host).length;
    let csp = ''; try { const r = await fetch(location.pathname, { method: 'HEAD', cache: 'no-store' }); csp = r.headers.get('content-security-policy') || ''; } catch {}
    const steps = [
      () => put('requests this page made', String(all.length), 'ok', bytes ? kb(bytes) : ''),
      () => put('servers it talked to', String(hosts.size), hosts.size === 1 ? 'ok' : 'g', [...hosts.keys()].join(', ')),
      () => put('third parties', String(third.length), third.length ? 'r' : 'ok', third.join(', ')),
      () => put('cookies', String(cookies), cookies ? 'r' : 'ok'),
      () => put('analytics or trackers', tracked.length ? tracked.join(', ') : 'none found', tracked.length ? 'r' : 'ok'),
      () => put('fonts from elsewhere', String(fontsOut), fontsOut ? 'r' : 'ok', fonts.length ? `${fonts.length} served by this site` : ''),
      () => put('settings in this browser', `${keys.length} key${keys.length === 1 ? '' : 's'}`, 'ok', 'never sent anywhere'),
      () => put('security policy', csp ? /connect-src 'self'(;|$)/.test(csp) && /script-src 'self'(;|$)/.test(csp) ? 'only this site, enforced' : 'set' : 'not readable here', csp ? 'ok' : 'g', csp ? 'scripts, fonts and data can only come from here' : ''),
    ];
    for (const s of steps) { await wait(170); s(); X.sfx && X.sfx('tick'); }
    await wait(200);
    lines.push('', third.length || cookies || tracked.length ? '<span class="r">■ something here talks to someone else.</span>' : '<span class="ok">■ this page talks to nobody but itself.</span> <span class="m">open devtools → network to check it yourself.</span>');
    out.innerHTML = lines.join('\n');
    const byType = {}; res.forEach(e => { const t = /\/api\//.test(e.name) ? 'api' : /\.(js)(\?|$)/.test(e.name) ? 'script' : /\.(css)(\?|$)/.test(e.name) ? 'style' : /\.(woff2?|ttf)(\?|$)/.test(e.name) ? 'font' : /\.(png|jpe?g|webp|gif|svg)(\?|$)/.test(e.name) ? 'image' : e.initiatorType || 'other'; (byType[t] = byType[t] || []).push(e); });
    $('#scanTbl').innerHTML = `<table class="tbl"><thead><tr><th>kind</th><th>count</th><th>from</th><th>size</th></tr></thead><tbody>${Object.entries(byType).sort((a, b) => b[1].length - a[1].length).map(([t, l]) => `<tr><td>${esc(t)}</td><td>${l.length}</td><td class="dim">${esc([...new Set(l.map(e => new URL(e.name).host))].join(', '))}</td><td class="dim">${kb(l.reduce((a, e) => a + (e.transferSize || 0), 0))}</td></tr>`).join('')}</tbody></table>`;
    bar.style.width = '0%'; $('#scanAgain').disabled = false; scanning = false;
    X.sfx && X.sfx(third.length || cookies || tracked.length ? 'boom' : 'chime');
  }
  $('#scanAgain').onclick = scan;
  hooks.scan = { open: () => scan() };

  // ================================================================ cd player
  const S = X.sound, TR = [['01', 'the room', 'intro', 'a slow pad and a few notes. d minor, 72 bpm.'], ['02', 'the desktop', 'desk', 'the same chords with bass and a soft kick.']];
  let cur = S && S.sceneName && S.sceneName() === 'intro' ? 0 : 1, t0 = 0, raf = 0, open = false, peaks = new Array(28).fill(0);
  const cv = $('#cdViz'), g = cv.getContext('2d');
  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function label() { const [n, name, , about] = TR[cur]; $('#cdTrack').textContent = n; $('#cdName').innerHTML = `<b>${esc(name)}</b> · <span class="dim">${esc(about)}</span>`; }
  function sync() {
    const on = S && S.on && !S.muted;
    $('#cdPlay').textContent = on ? '❚❚ pause' : '▶ play'; $('#cdPlay').setAttribute('aria-label', on ? 'pause' : 'play');
    if (S) $('#cdVol').value = Math.round((S.volume || 0) * 100);
    if (on && !t0) t0 = performance.now(); if (!on) t0 = 0;
  }
  function draw() {
    if (!open) return; raf = requestAnimationFrame(draw);
    const W = cv.width, H = cv.height, a = S && S.analyser && S.analyser(), on = S && S.on && !S.muted;
    g.fillStyle = '#050506'; g.fillRect(0, 0, W, H);
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#f2b84b';
    if (a && on) {
      const d = new Uint8Array(a.frequencyBinCount); a.getByteFrequencyData(d);
      const n = peaks.length, bw = W / n;
      for (let i = 0; i < n; i++) {
        const lo = Math.floor(Math.pow(i / n, 1.7) * d.length * .7), hi = Math.max(lo + 1, Math.floor(Math.pow((i + 1) / n, 1.7) * d.length * .7));
        let v = 0; for (let j = lo; j < hi; j++) v = Math.max(v, d[j]); v /= 255;
        const h = Math.max(2, v * (H - 10)); peaks[i] = Math.max(peaks[i] - 1.2, h);
        for (let y = H - 4; y > H - 4 - h; y -= 5) { g.fillStyle = y < H * .35 ? '#ff6b5b' : y < H * .6 ? acc : '#62f0c8'; g.fillRect(i * bw + 2, y - 3, bw - 4, 3); }
        g.fillStyle = '#e6dfcb'; g.fillRect(i * bw + 2, H - 4 - peaks[i] - 4, bw - 4, 2);
      }
      $('#cdTime').textContent = fmt(t0 ? (performance.now() - t0) / 1000 : 0);
    } else {
      g.strokeStyle = '#2c2c33'; g.beginPath(); g.moveTo(0, H - 4.5); g.lineTo(W, H - 4.5); g.stroke();
      g.fillStyle = '#5d5a53'; g.font = '13px JBM, monospace'; g.fillText(S && S.on ? 'paused' : 'press play', 12, H / 2);
      $('#cdTime').textContent = '--:--';
    }
  }
  if (S) {
    S.onChange(sync);
    $('#cdPlay').onclick = () => { S.toggle(); setTimeout(sync, 60); };
    const go = d => { cur = (cur + d + TR.length) % TR.length; S.scene(TR[cur][2]); t0 = S.on && !S.muted ? performance.now() : 0; label(); X.sfx && X.sfx('click'); };
    $('#cdPrev').onclick = () => go(-1); $('#cdNext').onclick = () => go(1);
    $('#cdVol').oninput = e => S.setVolume(e.target.value / 100);
  }
  label();
  hooks.cd = { open: () => { open = true; cur = S && S.sceneName && S.sceneName() === 'intro' ? 0 : 1; label(); sync(); cancelAnimationFrame(raf); draw(); }, close: () => { open = false; cancelAnimationFrame(raf); } };
  return hooks;
}
