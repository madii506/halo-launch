// The way in, told in shots: rain on the window at 23:58, the dark room, the lamp clicking on, the PC waking up,
// a full boot that loads the six layers, then a live prompt on the CRT. Enter dives through the layers into the desktop.
import * as THREE from './vendor/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { EffectComposer } from './vendor/EffectComposer.js';
import { RenderPass } from './vendor/RenderPass.js';
import { UnrealBloomPass } from './vendor/UnrealBloomPass.js';
import { OutputPass } from './vendor/OutputPass.js';

let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const BEIGE = 0xd2c6a6, BEIGE2 = 0xc2b590;
const SCREEN_C = new THREE.Vector3(0, .595, .07);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = k => Math.max(0, Math.min(1, k));
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeIn = k => k * k * k;
const sine = k => .5 - Math.cos(Math.PI * k) / 2;
const LAYERS = [['01', 'site', 'no trackers, no cookies'], ['02', 'connect', 'optional, never required'], ['03', 'key', 'creator key born here'],
  ['04', 'launcher', 'fresh wallet, every launch'], ['05', 'gas', 'claims paid by the treasury'], ['06', 'files', 'image metadata stripped']];
const C = { ink: '#e9e1cb', ok: '#62f0c8', gold: '#f2b84b', dim: '#6f8a83', red: '#ff6b5b', white: '#ffffff' };

function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// ---------------------------------------------------------------- the CRT: a real terminal drawn into a texture
const GLYPHS = {
  h: ['XX....', 'XX....', 'XX....', 'XXXXX.', 'XXX.XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX'],
  a: ['......', '......', '......', '.XXXX.', '....XX', '.XXXXX', 'XX..XX', 'XX..XX', '.XXXXX'],
  l: ['XX.', 'XX.', 'XX.', 'XX.', 'XX.', 'XX.', 'XX.', 'XX.', '.XX'],
  o: ['......', '......', '......', '.XXXX.', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', '.XXXX.'],
};
class Terminal {
  constructor() {
    this.W = 1024; this.H = 768;
    this.c = document.createElement('canvas'); this.c.width = this.W; this.c.height = this.H; this.g = this.c.getContext('2d');
    this.b = document.createElement('canvas'); this.b.width = this.W; this.b.height = this.H; this.bg = this.b.getContext('2d');
    this.t = new THREE.CanvasTexture(this.c); this.t.colorSpace = THREE.SRGBColorSpace; this.t.anisotropy = 4;
    this.lines = []; this.input = ''; this.prompt = false; this.logo = 0; this.power = 0; this.dirty = true; this.blink = true;
    this.LH = 38; this.X = 58; this.Y = 48; this.max = 18; this.mode = 'term'; this.tunnel = 0; this.wobble = 0; this.flick = 0; this.glitch = 0; this.off = true;
  }
  push(runs) { this.lines.push(runs); while (this.lines.length > this.max) this.lines.shift(); this.dirty = true; return this.lines.length - 1; }
  set(i, runs) { this.lines[i] = runs; this.dirty = true; }
  clear() { this.lines = []; this.dirty = true; this.flick = 1; }
  get busy() { return this.power < 1 || this.wobble > 0 || this.mode === 'tunnel' || (this.logo > 0 && this.logo < 1) || this.flick > 0 || this.glitch > 0; }
  draw(now, dt) {
    const blink = Math.floor(now / 530) % 2 === 0;
    if (!this.dirty && blink === this.blink && !this.busy && !this.first) return;
    this.blink = blink; this.dirty = false; this.first = false;
    const g = this.bg, W = this.W, H = this.H;
    if (this.off) { g.fillStyle = '#030505'; g.fillRect(0, 0, W, H); this.glass(g); return this.compose(0); }
    if (this.power < 1) {                                  // CRT power-on: a dot, a line of light, then the picture opens
      const k = this.power; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const hh = Math.max(2, H * Math.max(0, (k - .3) / .7)), ww = W * Math.min(1, k / .3);
      g.fillStyle = `rgba(225,255,242,${k < .3 ? .4 + k * 2 : 1 - (k - .3) * .7})`; g.shadowColor = '#bfffe9'; g.shadowBlur = 30;
      g.fillRect(W / 2 - ww / 2, H / 2 - hh / 2, ww, hh); g.shadowBlur = 0;
      return this.compose(dt);
    }
    const r = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * .7); r.addColorStop(0, '#0b2a24'); r.addColorStop(1, '#020a08');
    g.fillStyle = r; g.fillRect(0, 0, W, H);
    if (this.mode === 'tunnel') this.drawTunnel(g); else this.drawText(g, blink);
    this.glass(g);
    this.compose(dt);
  }
  drawText(g, blink) {
    g.textBaseline = 'top'; g.font = `${this.LH}px VT, monospace`;
    let y = this.Y;
    const run = (runs, x0, yy) => { let x = x0; for (const [s, c] of runs) { g.fillStyle = c || C.ink; g.shadowColor = g.fillStyle; g.shadowBlur = 10; g.fillText(s, x, yy); x += g.measureText(s).width; } g.shadowBlur = 0; return x; };
    if (this.logo) {
      const px = 21, rows = Array(9).fill('');
      for (const ch of 'halo') GLYPHS[ch].forEach((row, i) => rows[i] += row + '..');
      const k = Math.min(1, this.logo), x0 = this.X + 6, y0 = y + 6;
      g.shadowColor = C.gold; g.shadowBlur = 22;
      rows.forEach((row, ry) => [...row].forEach((c, rx) => {
        if (c !== 'X') return;
        const on = k >= 1 || Math.random() < k * 1.4 - rx / row.length * .45;
        g.fillStyle = on ? C.gold : 'rgba(242,184,75,.35)';
        if (on) g.fillRect(x0 + rx * px, y0 + ry * px, px - 1, px - 1); else g.fillText('░▒▓#%'[(Math.random() * 5) | 0], x0 + rx * px, y0 + ry * px - 8);
      }));
      g.shadowBlur = 0; y += 9 * px + 30;
      if (this.logo < 1) this.dirty = true;
    }
    for (const ln of this.lines) { run(ln, this.X, y); y += this.LH; }
    if (this.prompt) {
      const x = run([['C:\\HALO> ', C.ok], [this.input, C.white]], this.X, y);
      if (blink) { g.fillStyle = C.ink; g.fillRect(x + 2, y + 6, 15, this.LH - 8); }
    }
  }
  drawTunnel(g) {                                          // six layers rushing past, the last thing you see before the desktop
    const W = this.W, H = this.H, k = this.tunnel;
    g.fillStyle = '#010605'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'top';
    for (let i = LAYERS.length - 1; i >= 0; i--) {
      const z = 1.1 + i * .62 - k * 4.9; if (z <= .06) continue;
      const s = .3 / z, w = W * s, h = H * s, a = Math.min(1, (4.4 - z) / 2) * Math.min(1, z / .3);
      if (a <= 0) continue;
      const col = i % 2 ? '98,240,200' : '242,184,75';
      g.strokeStyle = `rgba(${col},${a})`; g.lineWidth = Math.max(2, 5 / z); g.shadowColor = `rgb(${col})`; g.shadowBlur = 26;
      g.strokeRect(W / 2 - w, H / 2 - h, w * 2, h * 2);
      g.font = `${Math.round(Math.max(16, 30 / z))}px VT, monospace`; g.fillStyle = `rgba(${col},${a})`;
      g.fillText(`${LAYERS[i][0]} ${LAYERS[i][1]}`, W / 2 - w + 10 / z, H / 2 - h + 8 / z);
    }
    g.shadowBlur = 0;
    const core = clamp01((k - .55) / .45);
    g.font = '64px VT, monospace'; g.fillStyle = `rgba(255,255,255,${.25 + core * .75})`; g.shadowColor = '#bfffe9'; g.shadowBlur = 30;
    const tw = g.measureText('you').width; g.fillText('you', W / 2 - tw / 2, H / 2 - 32); g.shadowBlur = 0;
    if (k > .82) { g.fillStyle = `rgba(232,255,246,${(k - .82) / .18})`; g.fillRect(0, 0, W, H); }
  }
  glass(g) {
    const W = this.W, H = this.H;
    g.fillStyle = 'rgba(0,0,0,.22)'; for (let yy = 0; yy < H; yy += 3) g.fillRect(0, yy, W, 1);
    const v = g.createRadialGradient(W / 2, H / 2, W * .32, W / 2, H / 2, W * .74); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.72)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    const gl = g.createLinearGradient(0, 0, W * .55, H * .7); gl.addColorStop(0, 'rgba(255,255,255,.07)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.fillRect(0, 0, W, H);
    if (this.flick > 0) { g.fillStyle = `rgba(0,0,0,${this.flick * .7})`; g.fillRect(0, 0, W, H); }
  }
  compose(dt) {                                            // copy the buffer to the screen, bent by the degauss wobble and the odd glitch
    const g = this.g, W = this.W, H = this.H;
    if (this.wobble > 0 || this.glitch > 0) {
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const t = performance.now() / 1000, band = 6;
      for (let y = 0; y < H; y += band) {
        let dx = Math.sin(y * .035 + t * 38) * this.wobble * 26;
        if (this.glitch > 0 && Math.random() < .06) dx += (Math.random() - .5) * 90 * this.glitch;
        g.drawImage(this.b, 0, y, W, band, dx, y, W, band);
      }
    } else g.drawImage(this.b, 0, 0);
    this.wobble = Math.max(0, this.wobble - (dt || 0) * 1.5); this.flick = Math.max(0, this.flick - (dt || 0) * 5); this.glitch = Math.max(0, this.glitch - (dt || 0) * 2.2);
    this.t.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- the room
function build(scene, mobile) {
  const std = o => new THREE.MeshStandardMaterial(o);
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = !mobile; parent.add(m); return m; };
  const plastic = std({ color: BEIGE, roughness: .55 }), plastic2 = std({ color: BEIGE2, roughness: .6 }), dark = std({ color: 0x2a2a26, roughness: .7 }), black = std({ color: 0x0b0b0c, roughness: .5 });
  const wood = tex(2048, 512, (g, w, h) => { g.fillStyle = '#33241a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 240; i++) { const y = rnd() * h, c = 20 + rnd() * 30 | 0; g.strokeStyle = `rgba(${c + 40},${c + 22},${c + 8},${.15 + rnd() * .35})`; g.lineWidth = .6 + rnd() * 2.4; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x / 300 + i) * 4); g.stroke(); } }, [2, 1]);
  const plaster = tex(1024, 1024, (g, w, h) => { g.fillStyle = '#20232c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 22000; i++) { const a = rnd() * .07; g.fillStyle = rnd() < .5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.6})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } }, [3, 2]);
  mesh(new THREE.BoxGeometry(6.2, .06, 1.3), std({ map: wood, roughness: .62 }), 0, -.03, 0);
  mesh(new THREE.PlaneGeometry(14, 6), std({ map: plaster, roughness: .95 }), 0, 1.6, -.66);
  // window: a city at night, rain sliding down the glass, a second slower layer of drops
  const win = new THREE.Group(); win.position.set(1.18, 1.28, -.65); scene.add(win);
  const city = tex(1024, 768, (g, w, h) => {
    const s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#0a0e22'); s.addColorStop(.55, '#191d44'); s.addColorStop(1, '#3a2850'); g.fillStyle = s; g.fillRect(0, 0, w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const q = c.getContext('2d'); let x = -10;
    while (x < w) { const bw = 60 + rnd() * 120, bh = 220 + rnd() * 460, top = h - bh; q.fillStyle = '#080a16'; q.fillRect(x, top, bw, bh);
      for (let wy = top + 14; wy < h - 10; wy += 28) for (let wx = x + 10; wx < x + bw - 10; wx += 24) if (rnd() < .26) { const k = rnd(); q.fillStyle = k < .6 ? `rgba(255,${185 + rnd() * 50 | 0},110,${.6 + rnd() * .4})` : k < .8 ? 'rgba(110,235,210,.9)' : 'rgba(205,215,255,.85)'; q.fillRect(wx, wy, 13, 17); }
      x += bw + rnd() * 14; }
    g.filter = 'blur(2.5px)'; g.drawImage(c, 0, 0); g.filter = 'none'; g.globalAlpha = .55; g.drawImage(c, 0, 0); g.globalAlpha = 1;
  });
  const streaks = (n, a0, a1) => tex(512, 1024, (g, w, h) => { g.clearRect(0, 0, w, h); for (let i = 0; i < n; i++) { const x = rnd() * w, y = rnd() * h, L = 14 + rnd() * 60; g.strokeStyle = `rgba(190,210,255,${a0 + rnd() * a1})`; g.lineWidth = 1 + rnd() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x - L * .06, y + L); g.stroke(); } for (let i = 0; i < n * .7; i++) { g.fillStyle = `rgba(210,225,255,${.1 + rnd() * .25})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * 3.5, 0, 7); g.fill(); } }, [2, 1]);
  const rainT = streaks(300, .07, .2), rainT2 = streaks(120, .05, .12);
  const cityMat = new THREE.MeshBasicMaterial({ map: city, toneMapped: false, color: 0xbdbdbd });
  const cm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.12), cityMat); cm.position.z = .004; win.add(cm);
  const rm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.12), new THREE.MeshBasicMaterial({ map: rainT, transparent: true, opacity: .9, depthWrite: false })); rm.position.z = .008; win.add(rm);
  const rm2 = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.12), new THREE.MeshBasicMaterial({ map: rainT2, transparent: true, opacity: .8, depthWrite: false })); rm2.position.z = .01; win.add(rm2);
  const fm = std({ color: 0x15161b, roughness: .6 });
  [[0, .58, 1.6, .06], [0, -.58, 1.6, .08], [-.78, 0, .06, 1.22], [.78, 0, .06, 1.22], [0, 0, .035, 1.12], [0, .02, 1.5, .03]].forEach(([x, y, w, h]) => mesh(new THREE.BoxGeometry(w, h, .06), fm, x, y, .02, win));
  mesh(new THREE.BoxGeometry(1.75, .04, .16), fm, 1.18, .68, -.58);
  // the PC
  const pc = new THREE.Group(); scene.add(pc);
  mesh(new RoundedBoxGeometry(.98, .2, .78, 4, .02), plastic, 0, .1, -.12, pc);
  const front = (w, h, x, y, m = black) => mesh(new THREE.BoxGeometry(w, h, .01), m, x, y, .272, pc);
  front(.3, .016, .2, .12); front(.3, .016, .2, .07); front(.12, .03, -.3, .1, dark);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0x0b2614, toneMapped: false }), hddMat = new THREE.MeshBasicMaterial({ color: 0x2a1c08, toneMapped: false });
  mesh(new THREE.BoxGeometry(.014, .014, .01), ledMat, -.42, .06, .274, pc); mesh(new THREE.BoxGeometry(.014, .014, .01), hddMat, -.39, .06, .274, pc);
  for (let i = 0; i < 7; i++) front(.004, .1, -.15 + i * .018, .1, dark);
  const mon = new THREE.Group(); mon.position.set(0, .26, -.05); pc.add(mon);
  mesh(new THREE.CylinderGeometry(.16, .2, .05, 32), plastic2, 0, -.035, -.05, mon);
  mesh(new RoundedBoxGeometry(.8, .64, .1, 5, .03), plastic, 0, .32, .06, mon);
  const back = new THREE.BoxGeometry(.74, .58, .5); const p = back.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) { p.setX(i, p.getX(i) * .66); p.setY(i, p.getY(i) * .7 + .02); }
  back.computeVertexNormals(); mesh(back, plastic2, 0, .32, -.2, mon);
  mesh(new THREE.BoxGeometry(.64, .49, .02), std({ color: 0x1a1a18, roughness: .4 }), 0, .335, .105, mon);
  const monLed = new THREE.MeshBasicMaterial({ color: 0x2a1c08, toneMapped: false }); mesh(new THREE.BoxGeometry(.012, .012, .01), monLed, .23, .045, .116, mon);
  const term = new Terminal(); term.first = true;
  const sg = new THREE.PlaneGeometry(.6, .45, 24, 18); const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) { const x = sp.getX(i) / .3, y = sp.getY(i) / .225; sp.setZ(i, .016 * (1 - .5 * (x * x + y * y))); }
  sg.computeVertexNormals();
  const screen = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: term.t, toneMapped: false })); screen.position.set(0, .335, .118); mon.add(screen);
  // keyboard, with every key its own instance so typing can press it
  const kb = new THREE.Group(); kb.position.set(0, .018, .43); kb.rotation.x = .05; scene.add(kb);
  mesh(new RoundedBoxGeometry(.86, .03, .27, 3, .01), plastic, 0, 0, 0, kb);
  const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(.034, .014, .034), plastic2, 120); let n = 0; const M = new THREE.Matrix4(), base = [], kidx = {};
  for (let r = 0; r < 6; r++) for (let c = 0; c < 20; c++) { if (r === 5 && c > 3 && c < 12) continue; M.makeTranslation(-.38 + c * .04, .021, -.1 + r * .042); keys.setMatrixAt(n, M); base[n] = M.clone(); kidx[r + ':' + c] = n; n++; }
  M.makeScale(8, 1, 1).setPosition(-.06, .021, .11); keys.setMatrixAt(n, M); base[n] = M.clone(); kidx.space = n; n++;
  keys.count = n; keys.castShadow = keys.receiveShadow = !mobile; kb.add(keys);
  mesh(new RoundedBoxGeometry(.12, .05, .2, 4, .024), plastic, .72, .025, .47);
  for (const sx of [-.66, .66]) { const g = new THREE.Group(); g.position.set(sx, 0, -.12); g.rotation.y = -sx * .35; scene.add(g);
    mesh(new RoundedBoxGeometry(.17, .28, .18, 3, .015), plastic2, 0, .14, 0, g);
    mesh(new THREE.CylinderGeometry(.052, .052, .01, 28), std({ color: 0x1c1c1c, roughness: .8 }), 0, .17, .092, g).rotation.x = Math.PI / 2; }
  const mug = new THREE.Group(); mug.position.set(-.8, 0, .28); mug.scale.setScalar(1.9); scene.add(mug);
  mesh(new THREE.CylinderGeometry(.045, .042, .1, 32, 1, true), std({ color: 0x6b2a24, roughness: .45, side: THREE.DoubleSide }), 0, .05, 0, mug);
  mesh(new THREE.CylinderGeometry(.042, .042, .004, 32), std({ color: 0x1a0d08, roughness: .2 }), 0, .085, 0, mug);
  mesh(new THREE.TorusGeometry(.028, .008, 10, 24, Math.PI), std({ color: 0x6b2a24, roughness: .45 }), .045, .05, 0, mug).rotation.z = -Math.PI / 2;
  [0x1b1c22, 0x23407a, 0x8a8c94].forEach((c, i) => { const f = mesh(new THREE.BoxGeometry(.18, .007, .18), std({ color: c, roughness: .5 }), -.62 + i * .01, .004 + i * .007, .5 - i * .006); f.rotation.y = .3 - i * .12; mesh(new THREE.BoxGeometry(.13, .002, .085), std({ color: 0xe9e4d8, roughness: .9 }), 0, .0045, .035, f); });
  const books = new THREE.Group(); books.position.set(-1.6, 0, -.18); books.rotation.y = .12; scene.add(books);
  [[0x5a1f22, .5, .07], [0x1d2a4a, .46, .06], [0x7a5a22, .52, .05]].reduce((y, [c, w, h], i) => { mesh(new THREE.BoxGeometry(w, h, .34), std({ color: c, roughness: .8 }), (i % 2) * .02, y + h / 2, 0, books).rotation.y = (i - 1) * .06; return y + h; }, 0);
  mesh(new THREE.CylinderGeometry(.09, .075, .15, 24), std({ color: 0x8a4a32, roughness: .8 }), -1.38, .075, -.34);
  mesh(new RoundedBoxGeometry(.08, .26, .08, 4, .036), std({ color: 0x2f5a35, roughness: .7 }), -1.38, .27, -.34);
  // the lamp hangs out of shot over the desk; only its light is seen, and the bulb material stays for the flicker math
  const head = V(-.22, 1.42, .5), aim = V(.04, .22, .06);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x241a0c, toneMapped: false });
  // light: the lamp, the CRT's glow, moonlight through the window, lightning
  const lamp = new THREE.SpotLight(0xffc06a, 0, 0, .66, .9, 2); lamp.position.copy(head).add(aim.clone().sub(head).normalize().multiplyScalar(.06)); lamp.target.position.copy(aim);
  lamp.castShadow = !mobile; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -.0015; lamp.shadow.radius = 4; scene.add(lamp, lamp.target);
  const glow = new THREE.PointLight(0x62f0c8, 0, 0, 2); glow.position.set(0, .52, .95); scene.add(glow);
  const moon = new THREE.DirectionalLight(0x7f97de, .55); moon.position.set(2.2, 2.6, -2.5); moon.target.position.set(-.2, 0, .3); scene.add(moon, moon.target);
  const hemi = new THREE.HemisphereLight(0x27304a, 0x0d0a08, .3); scene.add(hemi);
  const fill = new THREE.SpotLight(0xffd9a8, 0, 0, .32, .9, 2); fill.position.set(-1.4, 1.5, 1.9); fill.target.position.set(.05, .45, 0); scene.add(fill, fill.target);
  const bolt = new THREE.DirectionalLight(0xcfe0ff, 0); bolt.position.set(1.3, 1.6, -2.4); bolt.target.position.set(0, .3, .6); scene.add(bolt, bolt.target);
  const winGlow = new THREE.PointLight(0x8aa0ff, .25, 3.5, 2); winGlow.position.set(1.18, 1.25, -.35); scene.add(winGlow);
  // dust in the lamp's beam, steam off the mug
  const dg = new THREE.BufferGeometry(), N = mobile ? 60 : 170, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - .5) * 1.6 - .2; pos[i * 3 + 1] = rnd() * 1.2; pos[i * 3 + 2] = (rnd() - .5) * 1.2 + .1; }
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0xffe2b0, size: .006, transparent: true, opacity: 0, depthWrite: false }); const dust = new THREE.Points(dg, dustMat); scene.add(dust);
  const puff = tex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,.9)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
  const steam = Array.from({ length: 6 }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, opacity: 0, depthWrite: false, color: 0xd8d2c4 })); s.userData.o = i / 6; scene.add(s); return s; });
  return { term, rainT, rainT2, ledMat, hddMat, monLed, glow, dust, dustMat, steam, lamp, bulbMat, fill, bolt, cityMat, winGlow, keys, base, kidx, screen, hemi };
}

// ---------------------------------------------------------------- camera shots
function shots(portrait) {
  const L = portrait ? [
    [V(1.0, 1.24, .95), V(1.18, 1.27, -.65)], [V(.96, 1.2, .8), V(1.16, 1.24, -.65)], [V(1.25, 1.06, 3.0), V(.42, .72, -.3)],
    [V(-.82, 1.0, 3.3), V(-.02, .5, -.02)], [V(0, .9, 3.35), V(0, .44, .02)]]
    : [
    [V(1.02, 1.24, .64), V(1.18, 1.27, -.65)], [V(.98, 1.2, .5), V(1.16, 1.24, -.65)], [V(1.18, 1.04, 2.1), V(.55, .7, -.3)],
    [V(-.78, .92, 2.55), V(-.06, .5, -.05)], [V(.04, .84, 2.5), V(0, .5, .02)]];
  return { pos: new THREE.CatmullRomCurve3(L.map(a => a[0]), false, 'centripetal'), look: new THREE.CatmullRomCurve3(L.map(a => a[1]), false, 'centripetal'), end: L[L.length - 1] };
}
const SHOT_T = 13.4;   // seconds from the window to the ready shot

// ---------------------------------------------------------------- run
// Everything is timed against one clock and replayed from a queue, so a slow frame never stretches the film,
// and skipping simply plays the rest of the queue at once.
export async function run({ canvas, onEnter, onReady, mobile, status, audio }) {
  try { await Promise.race([document.fonts.load('34px VT'), new Promise(r => setTimeout(r, 1500))]); } catch {}
  const $ = s => document.querySelector(s);
  const intro = $('#intro'), cap = $('#icap'), skipBtn = $('#iskip');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const dpr = Math.min(mobile ? 1.3 : 1.5, devicePixelRatio || 1);
  renderer.setPixelRatio(dpr); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05060a); scene.fog = new THREE.FogExp2(0x05060a, .08);
  const P = build(scene, mobile), term = P.term;
  const cam = new THREE.PerspectiveCamera(30, 1, .02, 40);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .62, .5, .9); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const portrait = () => innerWidth / innerHeight < .9;
  let S = shots(portrait());
  function resize() {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h);
    bloom.resolution.set(w / 3, h / 3); cam.aspect = w / h; cam.fov = portrait() ? 46 : 31; cam.updateProjectionMatrix(); S = shots(portrait());
  }
  resize(); addEventListener('resize', resize);

  const st = { t0: 0, phase: 'film', skip: false, blend: null, diveT: 0, cmd: '', done: false, pending: undefined, lamp: 0, lampT: -1, crtOn: false, bolt: [],
    px: 0, py: 0, mx: 0, my: 0, pressed: [], look: null, posted: false, freeze: null, cap: null, capShown: -1, status: null, hover: false, lean: 0, hddT: 0 };
  const sfx = (n, a) => { try { audio && audio.sfx(n, a); } catch {} };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(9, 9);
  const onScreen = () => { ray.setFromCamera(ndc, cam); return ray.intersectObject(P.screen, false).length > 0; };
  let NOW = performance.now();
  Promise.resolve(status).then(s => { st.status = s; }).catch(() => {});
  const say = runs => term.push(Array.isArray(runs[0]) ? runs : [[runs[0], runs[1]]]);
  const hdd = on => { P.hddMat.color.setHex(on ? 0xffb648 : 0x2a1c08); if (on && NOW - st.hddT > 260) { st.hddT = NOW; sfx('hdd'); } };
  const lightning = (strength = 1) => { st.bolt.push([NOW, strength], [NOW + 140, strength * .6]); sfx('thunder', strength); };
  const caption = text => { st.cap = text ? { text, ms: NOW } : null; st.capShown = -1; cap.textContent = ''; cap.classList.toggle('on', !!text); };

  // ---- the queue
  const Q = []; let qi = 0;
  const ev = (ms, fn, soft) => Q.push({ ms, fn, soft });
  function flush() { const t = NOW - st.t0; while (qi < Q.length && (st.skip || Q[qi].ms <= t)) { const e = Q[qi++]; if (!(st.skip && e.soft)) e.fn(); } }

  // the film: the window, the lamp, the power button
  ev(0, () => caption('23:58 · somewhere on the other side of the web'), true);
  ev(2300, () => lightning(1), true);
  ev(5600, () => { st.lampT = NOW; sfx('click'); });
  ev(6800, () => { sfx('power'); st.crtOn = true; P.ledMat.color.setHex(0x3dff8a); P.monLed.color.setHex(0xffb648); term.off = false; term.power = 0; term.dirty = true; });
  for (let i = 1; i <= 20; i++) ev(6800 + i * 23, () => { term.power = i / 20; term.dirty = true; });
  ev(6800 + 21 * 23, () => { term.power = 1; term.wobble = st.skip ? 0 : 1; term.dirty = true; });
  // the boot, one line at a time
  let T = 7780; const at = (d, fn) => { T += d; ev(T, fn); };
  at(0, () => { hdd(true); sfx('beep'); say([['HALO BIOS v1.98  ', C.ink], ['(c) nobody', C.dim]]); });
  at(170, () => say([['cpu: ', C.dim], ['anonymous @ 33 MHz', C.ink]]));
  let mi; at(130, () => { mi = term.push([['memory test: ', C.dim], ['0K', C.ok]]); });
  for (let m = 4096; m <= 65536; m += 4096) at(26, () => term.set(mi, [['memory test: ', C.dim], [m + 'K' + (m === 65536 ? ' ok' : ''), C.ok]]));
  at(60, () => { say(['', C.ink]); hdd(false); });
  for (const [a, b, col] of [['detecting primary master', 'HALO-HD 0.8 GB', C.ink], ['detecting trackers', 'none', C.ok], ['detecting your name', 'not found', C.ok]]) {
    const dots = '.'.repeat(Math.max(3, 30 - a.length)) + ' '; let i;
    at(90, () => { i = term.push([[a + ' ', C.ink], [dots, C.dim]]); hdd(true); });
    at(210, () => { term.set(i, [[a + ' ', C.ink], [dots, C.dim], [b, col]]); hdd(false); });
  }
  at(120, () => { say(['', C.ink]); say([['press ', C.dim], ['DEL', C.ink], [' to enter setup. nobody ever does.', C.dim]]); });
  at(900, () => term.clear());
  at(220, () => say([['starting halo 98 …', C.ink]]));
  at(420, () => { say(['', C.ink]); say([['C:\\> ', C.ok], ['load layers', C.white]]); });
  for (const [num, name, what] of LAYERS) {
    const label = ` ${num} ${name} `.padEnd(13, '.') + ' ', text = what.padEnd(29, ' '); let i;
    at(260, () => { i = term.push([[label, C.ink], [text, C.dim], ['[    ]', C.dim]]); });
    for (let s = 0; s < 5; s++) at(62, () => { term.set(i, [[label, C.ink], [text, C.dim], ['[ ' + '|/-\\'[s % 4] + '  ]', C.gold]]); hdd(s % 2 === 0); });
    at(62, () => { term.set(i, [[label, C.ink], [text, C.dim], ['[ ', C.dim], ['ok', C.ok], [' ]', C.dim]]); hdd(false); });
    T -= 170;
  }
  at(260, () => { say(['', C.ink]); say([[' 6/6 layers up.', C.ok], [' nothing here knows your name.', C.dim]]); });
  at(1000, () => { term.clear(); term.glitch = st.skip ? 0 : 1; });
  for (let k = 1; k <= 22; k++) at(k === 1 ? 160 : 22, () => { term.logo = Math.min(1, k / 22); term.dirty = true; });
  at(30, () => { term.logo = 1; term.glitch = st.skip ? 0 : .5; });
  let tag; at(40, () => { tag = term.push([['', C.ink]]); });
  const T1 = 'launch with layers of privacy.', T2 = 'every one of them ';
  for (let i = 1; i <= T1.length; i++) at(24, () => term.set(tag, [[T1.slice(0, i), C.ink]]));
  let tag2; at(60, () => { tag2 = term.push([['', C.ink]]); });
  for (let i = 1; i <= T2.length; i++) at(24, () => term.set(tag2, [[T2.slice(0, i), C.ink]]));
  at(120, () => term.set(tag2, [[T2, C.ink], ['real.', C.gold]]));
  at(420, () => {
    say(['', C.ink]);
    say([['type ', C.dim], ['launch', C.gold], [', ', C.dim], ['coins', C.gold], [', ', C.dim], ['claim', C.gold], [', ', C.dim], ['help', C.gold], [' or press enter.', C.dim]]);
    say(['', C.ink]);
    term.prompt = true; st.posted = true;
  });
  Q.sort((a, b) => a.ms - b.ms);

  function ready() {
    if (st.phase !== 'film') return;
    st.phase = 'ready'; intro.classList.add('ready'); caption('');
    onReady && onReady();
    if (st.pending !== undefined) { const c = st.pending; st.pending = undefined; dive(c); }
  }
  // skip: the rest of the boot plays at once and the camera glides to the ready shot
  function skip() {
    if (st.skip || st.phase !== 'film') return;
    st.skip = true; st.blend = { t: NOW, from: cam.position.clone(), look: (st.look || S.end[1]).clone() };
    if (st.lampT < 0) st.lampT = NOW - 1000;
    caption('');
  }

  // ---- typing presses the 3D keys
  const ROWS = { 1: '`1234567890-=', 2: '\tqwertyuiop[]\\', 3: "\u0000asdfghjkl;'", 4: '\u0000zxcvbnm,./' };
  function keyCell(k) {
    if (k === ' ') return 'space'; if (k === 'Enter') return '3:13'; if (k === 'Backspace') return '1:13'; if (k === 'Escape') return '0:0'; if (k === 'Shift') return '4:0';
    const ch = (k || '').toLowerCase(); if (ch.length !== 1) return null;
    for (const r in ROWS) { const c = ROWS[r].indexOf(ch); if (c >= 0) return r + ':' + c; }
    return null;
  }
  function press(k) { const id = keyCell(k); const i = id && (id === 'space' ? P.kidx.space : P.kidx[id]); if (i != null) st.pressed.push([i, NOW]); sfx('key'); }

  function command(raw) {
    const c = raw.trim().toLowerCase();
    say([['C:\\HALO> ', C.ok], [raw, C.white]]); term.input = '';
    hdd(true); setTimeout(() => hdd(false), 120);
    if (!c || ['enter', 'exit', 'go', 'cd halo', 'win', 'halo'].includes(c)) return dive('');
    if (['launch', 'coins', 'claim', 'layers', 'docs'].includes(c)) return dive(c);
    if (c === 'help' || c === '?' || c === 'dir') { [[['launch ', C.gold], ['launch a coin, free', C.dim]], [['coins  ', C.gold], ['every coin launched on halo', C.dim]], [['claim  ', C.gold], ['claim creator fees, no gas', C.dim]], [['layers ', C.gold], ['what stays private, and what does not', C.dim]], [['lamp   ', C.gold], ['the desk lamp, on or off', C.dim]], [['enter  ', C.gold], ['go in', C.dim]]].forEach(h => say(h)); return; }
    if (c === 'whoami') { say(['nobody', C.ok]); return; }
    if (c === 'ver') { say(['halo 98 [version 4.10.1998]', C.ink]); return; }
    if (c === 'date' || c === 'time') { say([new Date().toString().slice(0, 24), C.ink]); return; }
    if (c === 'cls' || c === 'clear') { term.clear(); term.logo = 1; return; }
    if (c === 'sudo' || c.startsWith('sudo ')) { say(['nice try. there is no root here, only nobody.', C.dim]); return; }
    if (c === 'lamp' || c === 'lights') { st.lampOff = !st.lampOff; say([st.lampOff ? 'lamp off.' : 'lamp on.', C.dim]); return; }
    if (c === 'storm' || c === 'thunder') { lightning(1.2); say(['…', C.dim]); return; }
    say(['bad command or file name. type help.', C.dim]);
  }
  function dive(cmd) {
    if (st.phase === 'dive' || st.done) return;
    if (st.phase !== 'ready') { st.pending = cmd; skip(); return; }
    st.freeze = null; st.phase = 'dive'; st.cmd = cmd; st.diveT = NOW; st.diveFrom = cam.position.clone(); st.diveLook = (st.look || S.end[1]).clone(); term.prompt = false;
    say([['entering halo', C.gold], [' …', C.dim]]); hdd(true); sfx('dive'); canvas.style.cursor = 'default';
    intro.classList.add('diving');
  }
  function key(e) {
    if (st.done) return;
    if (e.key === 'Escape') { e.preventDefault(); if (st.phase === 'film') skip(); else if (st.phase === 'ready') dive(''); return; }
    if (st.phase === 'film') { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); skip(); } return; }
    if (st.phase !== 'ready') return;
    press(e.key);
    if (e.key === 'Enter') { e.preventDefault(); command(term.input); }
    else if (e.key === 'Backspace') { e.preventDefault(); term.input = term.input.slice(0, -1); term.dirty = true; }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && term.input.length < 34) { term.input += e.key; term.dirty = true; }
  }
  addEventListener('keydown', key);
  const pm = e => { st.px = e.clientX / innerWidth * 2 - 1; st.py = e.clientY / innerHeight * 2 - 1; ndc.set(st.px, -st.py); };
  addEventListener('pointermove', pm, { passive: true });
  canvas.addEventListener('click', e => {             // in the film a click skips; once ready, pressing the screen pulls you in
    ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight * 2 - 1));
    if (st.phase === 'film') return skip();
    if (st.phase === 'ready' && onScreen()) dive('');
  });
  if (skipBtn) skipBtn.onclick = e => { e.stopPropagation(); skip(); };

  let last = performance.now(), started = false;
  // seek(seconds, freeze) is for checking single frames of the film; the site never calls it
  const api = { go: c => dive(c), phase: () => st.phase, skip, seek: (sec, freeze) => { st.t0 = performance.now() - sec * 1000; st.freeze = freeze ? sec : null; }, hold: ms => { st.hold = ms == null ? null : st.diveT + ms; } };
  function frame(now) {
    if (st.done) return;
    requestAnimationFrame(frame);
    if (!started) { started = true; st.t0 = now; }
    NOW = st.hold != null ? st.hold : st.freeze != null ? st.t0 + st.freeze * 1000 : now;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const t = (NOW - st.t0) / 1000;
    flush();
    // captions type themselves in the letterbox
    if (st.cap) { const n = Math.min(st.cap.text.length, Math.floor((NOW - st.cap.ms) / 34)); if (n !== st.capShown) { st.capShown = n; cap.textContent = st.cap.text.slice(0, n); } }
    // camera: the film path (or a glide to its end when skipped), a slow breath, and the mouse once it settles
    const u = clamp01(t / SHOT_T), k = sine(u);
    let pos = S.pos.getPoint(k), look = S.look.getPoint(k);
    if (st.blend) { const b = ease(clamp01((NOW - st.blend.t) / 900)); pos = st.blend.from.clone().lerp(S.end[0], b); look = st.blend.look.clone().lerp(S.end[1], b); }
    if (st.phase === 'film' && st.posted && (u >= 1 || (st.blend && NOW - st.blend.t > 900))) ready();
    st.mx += (st.px - st.mx) * .04; st.my += (st.py - st.my) * .04;
    const settle = st.phase === 'film' && !st.skip ? clamp01((t - SHOT_T + 1.5) / 1.5) : 1;
    if (st.phase === 'ready') { const h = onScreen(); if (h !== st.hover) { st.hover = h; canvas.style.cursor = h ? 'pointer' : 'default'; } }
    st.lean += ((st.phase === 'ready' && st.hover ? 1 : 0) - st.lean) * .05;
    pos.x += Math.sin(t * .35) * .02 + st.mx * .05 * settle; pos.y += Math.sin(t * .5) * .01 - st.my * .025 * settle;
    if (st.lean > .001) { pos.lerp(SCREEN_C, st.lean * .16); look.lerp(SCREEN_C, st.lean * .3); }
    if (st.phase === 'dive') {
      const d = clamp01((NOW - st.diveT) / 2000), e = easeIn(d);
      pos = st.diveFrom.clone().lerp(V(SCREEN_C.x, SCREEN_C.y, SCREEN_C.z + .16), e); look = st.diveLook.clone().lerp(SCREEN_C, Math.min(1, e * 2));
      if (NOW - st.diveT > 880) { term.mode = 'tunnel'; term.tunnel = clamp01((NOW - st.diveT - 880) / 1080); }
      bloom.strength = .62 + e * 2.2; renderer.toneMappingExposure = 1.05 + e * 1.6;
      if (d >= 1 && !st.done) { st.done = true; cleanup(); onEnter(st.cmd); return; }
    }
    st.look = look; cam.position.copy(pos); cam.lookAt(look);
    // the lamp: a click, a stutter, then warm light
    if (st.lampT > 0) {
      const a = (NOW - st.lampT) / 1000; let L = a < .06 ? 1 : a < .14 ? .15 : a < .22 ? .9 : a < .3 ? .4 : Math.min(1, .7 + a);
      if (st.lampOff) L = 0;
      st.lamp += (L - st.lamp) * (a < .4 ? 1 : .1);
    }
    P.lamp.intensity = st.lamp * 6.5; P.fill.intensity = st.lamp * 1.1; P.bulbMat.color.setRGB(.14 + st.lamp * 1.2, .1 + st.lamp * .85, .05 + st.lamp * .35);
    P.dustMat.opacity = .5 * st.lamp;
    // lightning: a cold flash through the window, now and then
    let fl = 0; st.bolt = st.bolt.filter(([t1, s]) => { const a = (NOW - t1) / 1000; if (a < 0) return true; if (a > .35) return false; fl = Math.max(fl, s * Math.exp(-a * 14)); return true; });
    if (st.phase === 'ready' && Math.random() < dt / 18) lightning(.4 + Math.random() * .35);
    P.bolt.intensity = fl * 4; P.cityMat.color.setScalar(.74 + fl * 1.6); P.winGlow.intensity = .25 + fl * 3; P.hemi.intensity = .3 + fl * .5;
    // the rest of the room keeps breathing
    P.rainT.offset.y = (P.rainT.offset.y + dt * .12) % 1; P.rainT2.offset.y = (P.rainT2.offset.y + dt * .045) % 1;
    if (st.crtOn) P.ledMat.color.setHex(Math.sin(t * 9) > .3 ? 0x3dff8a : 0x0f4a26);
    const screenLight = term.off ? 0 : term.power < 1 ? term.power * .5 : .2 + (term.mode === 'tunnel' ? term.tunnel * 2.5 : 0);
    P.glow.intensity += (screenLight + Math.sin(t * 13) * .015 - P.glow.intensity) * .2;
    P.dust.rotation.y += dt * .03; P.dust.position.y = Math.sin(t * .2) * .02;
    P.steam.forEach(s => { const a = ((t * .22 + s.userData.o) % 1); s.position.set(-.8 + Math.sin(a * 6 + s.userData.o * 9) * .02, .2 + a * .34, .28 + Math.cos(a * 5) * .015); s.scale.setScalar(.035 + a * .08); s.material.opacity = Math.sin(a * Math.PI) * .032 * (.3 + st.lamp * .7); });
    // pressed keys sink for a moment
    if (st.pressed.length) {
      st.pressed = st.pressed.filter(([i, t1]) => { const a = (NOW - t1) / 130; const m = P.base[i].clone(); if (a < 1) m.elements[13] -= .008 * Math.sin(a * Math.PI); P.keys.setMatrixAt(i, m); return a < 1; });
      P.keys.instanceMatrix.needsUpdate = true;
    }
    term.draw(NOW, dt);
    composer.render();
  }
  function cleanup() { removeEventListener('keydown', key); removeEventListener('resize', resize); removeEventListener('pointermove', pm); setTimeout(() => { renderer.dispose(); composer.dispose && composer.dispose(); }, 1200); }
  requestAnimationFrame(frame);
  return api;
}
