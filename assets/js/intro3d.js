// The way in: a dark room at night, a beige PC on the desk, and the boot running on its CRT.
// The screen is a real terminal: type a command or press enter, and the camera dives into the glass.
import * as THREE from './vendor/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { EffectComposer } from './vendor/EffectComposer.js';
import { RenderPass } from './vendor/RenderPass.js';
import { UnrealBloomPass } from './vendor/UnrealBloomPass.js';
import { OutputPass } from './vendor/OutputPass.js';

let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const BEIGE = 0xd2c6a6, BEIGE2 = 0xc2b590;
const SCREEN_C = new THREE.Vector3(0, .595, .07);
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeIn = k => k * k * k;

function tex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// ---------------------------------------------------------------- the terminal on the CRT
const GLYPHS = {
  h: ['XX....', 'XX....', 'XX....', 'XXXXX.', 'XXX.XX', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX'],
  a: ['......', '......', '......', '.XXXX.', '....XX', '.XXXXX', 'XX..XX', 'XX..XX', '.XXXXX'],
  l: ['XX.', 'XX.', 'XX.', 'XX.', 'XX.', 'XX.', 'XX.', 'XX.', '.XX'],
  o: ['......', '......', '......', '.XXXX.', 'XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', '.XXXX.'],
};
class Terminal {
  constructor() {
    this.c = document.createElement('canvas'); this.c.width = 1024; this.c.height = 768; this.g = this.c.getContext('2d');
    this.t = new THREE.CanvasTexture(this.c); this.t.colorSpace = THREE.SRGBColorSpace; this.t.anisotropy = 4;
    this.lines = []; this.input = ''; this.prompt = false; this.logo = 0; this.power = 0; this.dirty = true; this.blink = true;
    this.LH = 34; this.X = 56; this.Y = 58; this.max = 19;
  }
  // a line is an array of [text, colour] runs
  push(runs) { this.lines.push(runs); while (this.lines.length > this.max) this.lines.shift(); this.dirty = true; }
  set(i, runs) { this.lines[i] = runs; this.dirty = true; }
  clear() { this.lines = []; this.dirty = true; }
  draw(now) {
    const blink = Math.floor(now / 530) % 2 === 0;
    if (!this.dirty && blink === this.blink && this.power >= 1) return;
    this.blink = blink; this.dirty = false;
    const g = this.g, W = 1024, H = 768;
    const r = g.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * .7); r.addColorStop(0, '#0b2a24'); r.addColorStop(1, '#020a08');
    g.fillStyle = r; g.fillRect(0, 0, W, H);
    if (this.power < 1) {                                  // CRT power-on: a line of light that opens into the picture
      const k = this.power, hh = Math.max(2, H * Math.max(0, (k - .25) / .75));
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      g.fillStyle = `rgba(220,255,240,${k < .25 ? k * 4 : 1 - (k - .25) * .6})`; g.fillRect(W * (.5 - Math.min(.5, k * 2)), H / 2 - hh / 2, W * Math.min(1, k * 4), hh);
      this.t.needsUpdate = true; return;
    }
    g.textBaseline = 'top'; g.font = `${this.LH}px VT, monospace`;
    let y = this.Y;
    const run = (runs, x0, yy) => { let x = x0; for (const [s, c] of runs) { g.fillStyle = c || '#e9e1cb'; g.shadowColor = g.fillStyle; g.shadowBlur = 10; g.fillText(s, x, yy); x += g.measureText(s).width; } g.shadowBlur = 0; return x; };
    if (this.logo) {
      const px = 19, rows = Array(9).fill('');
      for (const ch of 'halo') GLYPHS[ch].forEach((row, i) => rows[i] += row + '..');
      const k = Math.min(1, this.logo), x0 = this.X + 6, y0 = y + 6;
      g.shadowColor = '#f2b84b'; g.shadowBlur = 22;
      rows.forEach((row, ry) => [...row].forEach((c, rx) => {
        if (c !== 'X') return;
        const on = k >= 1 || Math.random() < k * 1.3 - rx / row.length * .4;
        g.fillStyle = on ? '#f2b84b' : 'rgba(242,184,75,.35)';
        if (on) g.fillRect(x0 + rx * px, y0 + ry * px, px - 1, px - 1); else g.fillText('░▒▓#%'[(Math.random() * 5) | 0], x0 + rx * px, y0 + ry * px - 8);
      }));
      g.shadowBlur = 0; y += 9 * px + 34;
      if (this.logo < 1) this.dirty = true;
    }
    for (const ln of this.lines) { run(ln, this.X, y); y += this.LH; }
    if (this.prompt) {
      const x = run([['C:\\HALO> ', '#62f0c8'], [this.input, '#ffffff']], this.X, y);
      if (blink) { g.fillStyle = '#e9e1cb'; g.fillRect(x + 2, y + 6, 15, this.LH - 8); }
    }
    g.fillStyle = 'rgba(0,0,0,.22)'; for (let yy = 0; yy < H; yy += 3) g.fillRect(0, yy, W, 1);   // scanlines
    const v = g.createRadialGradient(W / 2, H / 2, W * .32, W / 2, H / 2, W * .74); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.72)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    const gl = g.createLinearGradient(0, 0, W * .55, H * .7); gl.addColorStop(0, 'rgba(255,255,255,.07)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.fillRect(0, 0, W, H);
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
  // window: a city at night with rain sliding down the glass
  const win = new THREE.Group(); win.position.set(1.18, 1.28, -.65); scene.add(win);
  const city = tex(1024, 768, (g, w, h) => {
    const s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#0a0e22'); s.addColorStop(.55, '#191d44'); s.addColorStop(1, '#3a2850'); g.fillStyle = s; g.fillRect(0, 0, w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const q = c.getContext('2d'); let x = -10;
    while (x < w) { const bw = 60 + rnd() * 120, bh = 220 + rnd() * 460, top = h - bh; q.fillStyle = '#080a16'; q.fillRect(x, top, bw, bh);
      for (let wy = top + 14; wy < h - 10; wy += 28) for (let wx = x + 10; wx < x + bw - 10; wx += 24) if (rnd() < .26) { const k = rnd(); q.fillStyle = k < .6 ? `rgba(255,${185 + rnd() * 50 | 0},110,${.6 + rnd() * .4})` : k < .8 ? 'rgba(110,235,210,.9)' : 'rgba(205,215,255,.85)'; q.fillRect(wx, wy, 13, 17); }
      x += bw + rnd() * 14; }
    g.filter = 'blur(2.5px)'; g.drawImage(c, 0, 0); g.filter = 'none'; g.globalAlpha = .55; g.drawImage(c, 0, 0); g.globalAlpha = 1;
  });
  const rainT = tex(512, 1024, (g, w, h) => { g.clearRect(0, 0, w, h); for (let i = 0; i < 300; i++) { const x = rnd() * w, y = rnd() * h, L = 14 + rnd() * 60; g.strokeStyle = `rgba(190,210,255,${.07 + rnd() * .2})`; g.lineWidth = 1 + rnd() * 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x - L * .06, y + L); g.stroke(); } for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(210,225,255,${.1 + rnd() * .25})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * 3.5, 0, 7); g.fill(); } }, [2, 1]);
  const cm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.12), new THREE.MeshBasicMaterial({ map: city, toneMapped: false, color: 0xbdbdbd })); cm.position.z = .004; win.add(cm);
  const rm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.12), new THREE.MeshBasicMaterial({ map: rainT, transparent: true, opacity: .9, depthWrite: false })); rm.position.z = .008; win.add(rm);
  const fm = std({ color: 0x15161b, roughness: .6 });
  [[0, .58, 1.6, .06], [0, -.58, 1.6, .08], [-.78, 0, .06, 1.22], [.78, 0, .06, 1.22], [0, 0, .035, 1.12], [0, .02, 1.5, .03]].forEach(([x, y, w, h]) => mesh(new THREE.BoxGeometry(w, h, .06), fm, x, y, .02, win));
  mesh(new THREE.BoxGeometry(1.75, .04, .16), fm, 1.18, .68, -.58);
  // the PC
  const pc = new THREE.Group(); scene.add(pc);
  mesh(new RoundedBoxGeometry(.98, .2, .78, 4, .02), plastic, 0, .1, -.12, pc);
  const front = (w, h, x, y, m = black) => mesh(new THREE.BoxGeometry(w, h, .01), m, x, y, .272, pc);
  front(.3, .016, .2, .12); front(.3, .016, .2, .07); front(.12, .03, -.3, .1, dark);
  const led = mesh(new THREE.BoxGeometry(.014, .014, .01), new THREE.MeshBasicMaterial({ color: 0x3dff8a, toneMapped: false }), -.42, .06, .274, pc);
  const hdd = mesh(new THREE.BoxGeometry(.014, .014, .01), new THREE.MeshBasicMaterial({ color: 0xffb648, toneMapped: false }), -.39, .06, .274, pc);
  for (let i = 0; i < 7; i++) front(.004, .1, -.15 + i * .018, .1, dark);
  const mon = new THREE.Group(); mon.position.set(0, .26, -.05); pc.add(mon);
  mesh(new THREE.CylinderGeometry(.16, .2, .05, 32), plastic2, 0, -.035, -.05, mon);
  mesh(new RoundedBoxGeometry(.8, .64, .1, 5, .03), plastic, 0, .32, .06, mon);
  const back = new THREE.BoxGeometry(.74, .58, .5); const p = back.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) { p.setX(i, p.getX(i) * .66); p.setY(i, p.getY(i) * .7 + .02); }
  back.computeVertexNormals(); mesh(back, plastic2, 0, .32, -.2, mon);
  mesh(new THREE.BoxGeometry(.64, .49, .02), std({ color: 0x1a1a18, roughness: .4 }), 0, .335, .105, mon);
  const term = new Terminal();
  const sg = new THREE.PlaneGeometry(.6, .45, 24, 18); const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) { const x = sp.getX(i) / .3, y = sp.getY(i) / .225; sp.setZ(i, .016 * (1 - .5 * (x * x + y * y))); }
  sg.computeVertexNormals();
  const screen = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: term.t, toneMapped: false })); screen.position.set(0, .335, .118); mon.add(screen);
  const note = tex(256, 256, (g, w, h) => { g.fillStyle = '#e9d36b'; g.fillRect(0, 0, w, h); g.fillStyle = '#2b3a8f'; g.font = 'italic 46px sans-serif'; g.fillText('no keys', 24, 110); g.fillText('no names', 24, 175); });
  const nm = mesh(new THREE.PlaneGeometry(.11, .11), std({ map: note, roughness: .9 }), .355, .6, .124, mon); nm.rotation.z = -.12;
  // desk things
  const kb = new THREE.Group(); kb.position.set(0, .018, .43); kb.rotation.x = .05; scene.add(kb);
  mesh(new RoundedBoxGeometry(.86, .03, .27, 3, .01), plastic, 0, 0, 0, kb);
  const keys = new THREE.InstancedMesh(new THREE.BoxGeometry(.034, .014, .034), plastic2, 120); let n = 0; const M = new THREE.Matrix4();
  for (let r = 0; r < 6; r++) for (let c = 0; c < 20; c++) { if (r === 5 && c > 3 && c < 12) continue; M.makeTranslation(-.38 + c * .04, .021, -.1 + r * .042); keys.setMatrixAt(n++, M); }
  M.makeScale(8, 1, 1).setPosition(-.06, .021, .11); keys.setMatrixAt(n++, M); keys.count = n; keys.castShadow = keys.receiveShadow = !mobile; kb.add(keys);
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
  mesh(new THREE.CylinderGeometry(.09, .075, .15, 24), std({ color: 0x8a4a32, roughness: .8 }), -1.18, .075, -.3);
  mesh(new RoundedBoxGeometry(.08, .26, .08, 4, .036), std({ color: 0x2f5a35, roughness: .7 }), -1.18, .27, -.3);
  // light: a warm pool from above, the screen's glow, moonlight through the window
  const top = new THREE.SpotLight(0xffc06a, 12, 0, .62, .9, 2); top.position.set(.15, 2.15, .55); top.target.position.set(0, .2, .1);
  top.castShadow = !mobile; top.shadow.mapSize.set(1024, 1024); top.shadow.bias = -.0015; top.shadow.radius = 4; scene.add(top, top.target);
  const glow = new THREE.PointLight(0x62f0c8, .5, 0, 2); glow.position.set(0, .45, .7); scene.add(glow);
  const moon = new THREE.DirectionalLight(0x7f97de, .55); moon.position.set(2.2, 2.6, -2.5); moon.target.position.set(-.2, 0, .3); scene.add(moon, moon.target);
  scene.add(new THREE.HemisphereLight(0x27304a, 0x0d0a08, .3));
  const fill = new THREE.SpotLight(0xffd9a8, 1.3, 0, .32, .9, 2); fill.position.set(-1.4, 1.5, 1.9); fill.target.position.set(.05, .45, 0); scene.add(fill, fill.target);
  // dust drifting through the light
  const dg = new THREE.BufferGeometry(), N = mobile ? 60 : 160, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - .5) * 1.4; pos[i * 3 + 1] = rnd() * 1.2; pos[i * 3 + 2] = (rnd() - .5) * 1.2 + .1; }
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe2b0, size: .006, transparent: true, opacity: .55, depthWrite: false })); scene.add(dust);
  return { term, rainT, led, hdd, glow, dust };
}

// ---------------------------------------------------------------- run
export async function run({ canvas, onEnter, mobile }) {
  try { await Promise.race([document.fonts.load('34px VT'), new Promise(r => setTimeout(r, 1500))]); } catch {}
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const dpr = Math.min(mobile ? 1.5 : 1.75, devicePixelRatio || 1);
  renderer.setPixelRatio(dpr); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x05060a); scene.fog = new THREE.FogExp2(0x05060a, .08);
  const parts = build(scene, mobile), term = parts.term;
  const cam = new THREE.PerspectiveCamera(30, 1, .02, 40);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .62, .5, .9); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // camera path: a wide shot of the room, a slow push in to the screen, then the dive through the glass
  const portrait = () => innerWidth / innerHeight < .9;
  const shots = () => portrait()
    ? { wide: [new THREE.Vector3(.05, 1.0, 5.2), new THREE.Vector3(0, .62, 0)], near: [new THREE.Vector3(0, .62, 2.55), SCREEN_C] }
    : { wide: [new THREE.Vector3(-.35, 1.05, 3.9), new THREE.Vector3(.08, .62, -.1)], near: [new THREE.Vector3(.02, .64, 1.62), SCREEN_C] };
  function resize() {
    const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2); cam.aspect = w / h; cam.fov = portrait() ? 44 : 30; cam.updateProjectionMatrix();
  }
  resize(); addEventListener('resize', resize);

  const state = { t0: performance.now(), phase: 'boot', dive: 0, diveT: 0, cmd: '', done: false, sway: 0, push: 0 };
  const C = { ink: '#e9e1cb', ok: '#62f0c8', gold: '#f2b84b', dim: '#6f8a83' };
  const say = runs => term.push(Array.isArray(runs[0]) ? runs : [[runs[0], runs[1]]]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let skip = false;

  async function boot() {
    for (let k = 0; k <= 1.0001; k += .05) { term.power = k; await sleep(18); }
    term.power = 1;
    say([['HALO BIOS v1.98  ', C.ink], ['(c) nobody', C.dim]]); await sleep(skip ? 0 : 160);
    say(['cpu: anonymous @ 33 MHz', C.ink]); await sleep(skip ? 0 : 120);
    term.push([['memory test: ', C.ink], ['0K', C.ok]]); const mi = term.lines.length - 1;
    for (let m = 0; m <= 640; m += 64) { term.set(mi, [['memory test: ', C.ink], [m + 'K' + (m === 640 ? ' ok' : ''), C.ok]]); await sleep(skip ? 0 : 22); }
    say(['', C.ink]);
    for (const [a, b] of [['detecting wallet connection', 'none'], ['detecting signature request', 'none'], ['detecting your name', 'not found'], ['creator key', 'born in your browser'], ['launcher wallet', 'fresh']]) {
      const dots = ' ' + '.'.repeat(Math.max(3, 32 - a.length)) + ' ';
      say([[a + dots, C.ink], [b, C.ok]]); parts.hdd.material.color.setHex(0xffd27a); await sleep(skip ? 0 : 150); parts.hdd.material.color.setHex(0x6a4a1a);
    }
    say(['', C.ink]); term.push([['loading layers  ', C.ink], ['[            ]', C.gold]]); const li = term.lines.length - 1;
    for (let i = 0; i <= 12; i++) { term.set(li, [['loading layers  ', C.ink], ['[' + '█'.repeat(i) + ' '.repeat(12 - i) + ']', C.gold], [i === 12 ? '  6/6 ok' : `  ${Math.round(i / 2)}/6`, i === 12 ? C.ok : C.dim]]); await sleep(skip ? 0 : 45); }
    await sleep(skip ? 0 : 380);
    term.clear(); term.logo = .01;
    for (let k = .01; k <= 1; k += .06) { term.logo = k; term.dirty = true; await sleep(16); }
    term.logo = 1;
    say(['launch with layers of privacy.', C.ink]);
    say([['every one of them ', C.ink], ['real.', C.gold]]);
    say(['', C.ink]);
    say([['type ', C.dim], ['launch', C.gold], [', ', C.dim], ['coins', C.gold], [', ', C.dim], ['claim', C.gold], [', ', C.dim], ['help', C.gold], [' or press enter.', C.dim]]);
    say(['', C.ink]);
    term.prompt = true; state.phase = 'ready';
  }
  const HELP = [[['launch ', C.gold], ['launch a coin, free', C.dim]], [['coins  ', C.gold], ['every coin launched on halo', C.dim]], [['claim  ', C.gold], ['claim creator fees, no gas', C.dim]], [['layers ', C.gold], ['what stays private, and what does not', C.dim]], [['enter  ', C.gold], ['go in', C.dim]]];
  function command(raw) {
    const c = raw.trim().toLowerCase();
    say([['C:\\HALO> ', C.ok], [raw, '#ffffff']]); term.input = '';
    if (!c || c === 'enter' || c === 'exit' || c === 'go' || c === 'cd halo') return dive('');
    if (['launch', 'coins', 'claim', 'layers', 'docs'].includes(c)) return dive(c);
    if (c === 'help' || c === '?' || c === 'dir') { HELP.forEach(h => say(h)); return; }
    if (c === 'whoami') { say(['nobody', C.ok]); return; }
    if (c === 'cls' || c === 'clear') { term.clear(); term.logo = 1; return; }
    if (c === 'sudo' || c.startsWith('sudo ')) { say(['nice try. there is no root here, only nobody.', C.dim]); return; }
    say(['bad command or file name. type help.', C.dim]);
  }
  function dive(cmd) {
    if (state.phase === 'dive') return; state.phase = 'dive'; state.cmd = cmd; state.diveT = performance.now(); term.prompt = false;
    say([['entering halo', C.gold], [' …', C.dim]]);
  }
  function key(e) {
    if (state.done) return;
    if (e.key === 'Escape') { e.preventDefault(); skip = true; if (state.phase !== 'ready') { state.phase = 'ready'; } dive(''); return; }
    if (state.phase !== 'ready') { if (e.key === 'Enter') skip = true; return; }
    if (e.key === 'Enter') { e.preventDefault(); command(term.input); }
    else if (e.key === 'Backspace') { e.preventDefault(); term.input = term.input.slice(0, -1); term.dirty = true; }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && term.input.length < 34) { term.input += e.key; term.dirty = true; }
  }
  addEventListener('keydown', key);
  canvas.addEventListener('click', () => { if (state.phase === 'ready') dive(''); else skip = true; });

  let last = performance.now();
  const api = { go: c => { if (state.phase === 'ready') dive(c); else { skip = true; state.pending = c; } }, phase: () => state.phase };
  function frame(now) {
    if (state.done) return;
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    const t = (now - state.t0) / 1000, S = shots();
    if (state.pending !== undefined && state.phase === 'ready') { const c = state.pending; state.pending = undefined; dive(c); }
    state.push = Math.min(1, (now - state.t0) / 5600);
    const k = ease(state.push);
    const pos = S.wide[0].clone().lerp(S.near[0], k), look = S.wide[1].clone().lerp(S.near[1], k);
    pos.x += Math.sin(t * .35) * .03; pos.y += Math.sin(t * .5) * .012;
    if (state.phase === 'dive') {
      const d = Math.min(1, (now - state.diveT) / 1100), e = easeIn(d);
      pos.lerp(new THREE.Vector3(SCREEN_C.x, SCREEN_C.y, SCREEN_C.z + .2), e); look.lerp(SCREEN_C, e);
      bloom.strength = .62 + e * 2.4; renderer.toneMappingExposure = 1.05 + e * 1.8;
      if (d >= 1 && !state.done) { state.done = true; cleanup(); onEnter(state.cmd); return; }
    }
    cam.position.copy(pos); cam.lookAt(look);
    parts.rainT.offset.y = (parts.rainT.offset.y + dt * .12) % 1;
    parts.led.material.color.setHex(Math.sin(t * 9) > .3 ? 0x3dff8a : 0x0f4a26);
    parts.glow.intensity = .45 + Math.sin(t * 13) * .03 + (term.power < 1 ? term.power : .1);
    parts.dust.rotation.y += dt * .03; parts.dust.position.y = Math.sin(t * .2) * .02;
    term.draw(now);
    composer.render();
  }
  function cleanup() { removeEventListener('keydown', key); removeEventListener('resize', resize); setTimeout(() => { renderer.dispose(); composer.dispose && composer.dispose(); }, 1200); }
  requestAnimationFrame(frame);
  boot();
  return api;
}
