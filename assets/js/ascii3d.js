// The hero: a beige 90s PC in three.js, read back every frame and redrawn as coloured characters.
import * as THREE from './vendor/three.module.min.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const RAMP = ' .,:;-=+*#%@';
const BEIGE = 0xd6caa9, BEIGE2 = 0xc6b893;

function screenTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  let on = true;
  const draw = () => {
    const r = g.createRadialGradient(128, 96, 10, 128, 96, 170); r.addColorStop(0, '#1d8f74'); r.addColorStop(1, '#062a21');
    g.fillStyle = r; g.fillRect(0, 0, 256, 192);
    g.fillStyle = '#d8fff2'; g.font = 'bold 62px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('halo' + (on ? '_' : ' '), 128, 96);
    t.needsUpdate = true; on = !on;
  };
  draw(); return { t, tick: draw };
}

export function mountAscii(canvas, { onReady } = {}) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
  const mat = (c, r = .55) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
  const plastic = mat(BEIGE), plastic2 = mat(BEIGE2, .6), dark = mat(0x1c1c1a, .7), black = mat(0x050505, .5);
  const pc = new THREE.Group(); scene.add(pc);
  const add = (geo, m, x, y, z, parent = pc) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  // case
  add(new RoundedBoxGeometry(.98, .2, .78, 3, .02), plastic, 0, .1, -.12);
  add(new THREE.BoxGeometry(.3, .018, .01), black, .2, .125, .272); add(new THREE.BoxGeometry(.3, .018, .01), black, .2, .075, .272);
  add(new THREE.BoxGeometry(.12, .03, .01), dark, -.3, .1, .272);
  const led = add(new THREE.BoxGeometry(.02, .02, .01), new THREE.MeshBasicMaterial({ color: 0x3dff8a }), -.42, .06, .274);
  for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(.005, .1, .01), dark, -.15 + i * .018, .1, .272);
  // monitor
  const mon = new THREE.Group(); mon.position.set(0, .26, -.05); pc.add(mon);
  add(new THREE.CylinderGeometry(.16, .2, .05, 24), plastic2, 0, -.035, -.05, mon);
  add(new RoundedBoxGeometry(.8, .64, .1, 4, .03), plastic, 0, .32, .06, mon);
  const back = new THREE.BoxGeometry(.74, .58, .5); const p = back.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) { p.setX(i, p.getX(i) * .66); p.setY(i, p.getY(i) * .7 + .02); }
  back.computeVertexNormals(); add(back, plastic2, 0, .32, -.2, mon);
  add(new THREE.BoxGeometry(.64, .49, .02), mat(0x141412, .4), 0, .335, .105, mon);
  const scr = screenTexture();
  add(new THREE.PlaneGeometry(.6, .45), new THREE.MeshBasicMaterial({ map: scr.t, toneMapped: false }), 0, .335, .118, mon);
  // keyboard
  const kb = new THREE.Group(); kb.position.set(0, .018, .45); kb.rotation.x = .05; pc.add(kb);
  add(new RoundedBoxGeometry(.86, .03, .27, 2, .01), plastic, 0, 0, 0, kb);
  for (let r = 0; r < 5; r++) add(new THREE.BoxGeometry(.78, .012, .03), plastic2, 0, .02, -.09 + r * .045, kb);
  // a sliver of desk so the PC has somewhere to stand
  add(new THREE.CylinderGeometry(.78, .78, .02, 48), mat(0x2b1f16, .8), 0, -.012, .1, scene);

  // light: a warm pool from above, the screen's teal, a cool rim from behind
  const top = new THREE.SpotLight(0xffc77a, 14, 0, .85, .7, 2); top.position.set(.15, 1.9, .6); top.target.position.set(0, .3, .1); scene.add(top, top.target);
  const glow = new THREE.PointLight(0x5cf0c8, 1.1, 0, 2); glow.position.set(0, .6, .7); scene.add(glow);
  const rim = new THREE.DirectionalLight(0x8aa4ff, 1.4); rim.position.set(-1.5, 1.2, -2); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x3a3f55, 0x120d08, .55));

  const cam = new THREE.PerspectiveCamera(34, 1, .05, 20);
  let cols = 0, rows = 0, cw = 0, ch = 0, font = 0, rt = null, buf = null, dpr = 1, W = 0, H = 0;
  function layout() {
    const r = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(200, r.width); H = Math.max(200, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    font = W < 420 ? 8 : W < 560 ? 9.5 : 11; cw = font * .6; ch = font * 1.08;
    cols = Math.floor(W / cw); rows = Math.floor(H / ch);
    if (rt) rt.dispose(); rt = new THREE.WebGLRenderTarget(cols, rows, { type: THREE.UnsignedByteType });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    buf = new Uint8Array(cols * rows * 4);
    renderer.setSize(cols, rows, false);
    cam.aspect = (cols * cw) / (rows * ch); cam.updateProjectionMatrix();
  }
  layout();
  let mx = 0, my = 0, tx = 0, ty = 0;
  window.addEventListener('pointermove', e => { tx = (e.clientX / innerWidth - .5) * 2; ty = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
  new ResizeObserver(() => layout()).observe(canvas);
  let visible = true, paused = false, off = false;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(canvas);

  const t0 = performance.now(); let last = 0, blink = 0, frames = 0, readyFired = false;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible || paused || off || document.hidden || now - last < 33) return; last = now;
    const t = (now - t0) / 1000;
    mx += (tx - mx) * .05; my += (ty - my) * .05;
    const az = Math.sin(t * .32) * .55 + mx * .35, el = .3 + my * .08 + Math.sin(t * .5) * .02, dist = 2.42;
    cam.position.set(Math.sin(az) * dist, .5 + el * 1.3, Math.cos(az) * dist); cam.lookAt(0, .42, -.02);
    pc.position.y = Math.sin(t * 1.1) * .012;
    led.material.color.setHex(Math.sin(t * 7) > .2 ? 0x3dff8a : 0x1a6a3a);
    if (now - blink > 520) { scr.tick(); blink = now; }
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, cols, rows, buf); renderer.setRenderTarget(null);
    draw(t);
    if (!readyFired && ++frames > 2) { readyFired = true; onReady && onReady(); }
  }
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.font = `600 ${font}px JBM, ui-monospace, monospace`; ctx.textBaseline = 'top';
    const groups = new Map(), n = RAMP.length - 1;
    const glitchRow = Math.random() < .04 ? (Math.random() * rows) | 0 : -1;
    for (let y = 0; y < rows; y++) {
      const ry = rows - 1 - y, shift = y === glitchRow ? ((Math.random() * 6) | 0) - 3 : 0;
      for (let x = 0; x < cols; x++) {
        const i = (ry * cols + x) * 4, r = buf[i], g = buf[i + 1], b = buf[i + 2];
        const l = (r * .299 + g * .587 + b * .114) / 255;
        if (l < .035) continue;
        const ci = Math.min(n, Math.max(1, Math.round(Math.pow(l, .8) * n)));
        const k = Math.min(255, r * 1.35 + 18) >> 3 << 16 | Math.min(255, g * 1.35 + 14) >> 3 << 8 | Math.min(255, b * 1.35 + 10) >> 3;
        let a = groups.get(k); if (!a) groups.set(k, a = []);
        a.push(x + shift, y, ci);
      }
    }
    for (const [k, a] of groups) {
      ctx.fillStyle = `rgb(${(k >> 16 & 31) << 3},${(k >> 8 & 31) << 3},${(k & 31) << 3})`;
      for (let j = 0; j < a.length; j += 3) ctx.fillText(RAMP[a[j + 2]], a[j] * cw, a[j + 1] * ch);
    }
  }
  requestAnimationFrame(frame);
  return { layout, pause(v) { paused = !!v; }, show(v) { off = !v; if (off) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); } } };
}
