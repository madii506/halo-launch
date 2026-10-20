// HALO API. One function, many ops: status, pow, launch, launches, coins, meta, img, claim, claimbuild,
// claimsend, withdrawbuild, withdrawsend, walletbuild, walletsend, wclaimbuild, wclaimsend, dryrun, tick.
const crypto = require('crypto');
const L = require('./_lib');
const C = require('./_chain');

const CFG = {
  cap: Math.max(0, Number(process.env.HALO_DAILY_CAP || 20)),   // launches the treasury pays for per UTC day
  perIp: Math.max(1, Number(process.env.HALO_IP_DAY || 3)),      // per visitor per day (salted hash, gone tomorrow)
  bits: Math.max(12, Math.min(26, Number(process.env.HALO_POW_BITS || 21))),
  paused: process.env.HALO_PAUSED === '1',
  ca: process.env.HALO_CA || '', x: process.env.HALO_X || '',
  minClaim: 2_000_000,                                           // 0.002 SOL: below this the network fee is not worth paying
  estCost: 24_000_000,
};
const RENT_MIN = 890_880;

function origin(req) {
  if (process.env.HALO_ORIGIN) return process.env.HALO_ORIGIN.replace(/\/$/, '');
  const h = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const p = req.headers['x-forwarded-proto'] || (/localhost|127\.0\.0\.1/.test(h) ? 'http' : 'https');
  return `${p}://${h}`;
}
const today = () => new Date().toISOString().slice(0, 10);
const sol = l => Math.round(l / 1e5) / 1e4;
const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
async function ipKey(req) { return (await L.hmac('halo:ip:' + today(), L.ip(req))).toString('hex').slice(0, 24); }
function newId() { const a = 'abcdefghijkmnpqrstuvwxyz23456789'; return Array.from(crypto.randomBytes(10), b => a[b % a.length]).join(''); }
function utf8len(s) { return Buffer.byteLength(s, 'utf8'); }
function cleanUrl(u, hosts) {
  u = String(u || '').trim(); if (!u) return null;
  if (!/^https:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '');
  try { const x = new URL(u); if (hosts && !hosts.some(h => x.hostname === h || x.hostname.endsWith('.' + h))) return false; return x.toString().slice(0, 200); } catch { return false; }
}

// ---------- proof of work: a few seconds of hashing in the browser instead of an account ----------
async function powChallenge() {
  const ts = Date.now().toString(36), r = crypto.randomBytes(9).toString('base64url');
  const h = (await L.hmac('halo:pow', ts + '.' + r)).toString('base64url').slice(0, 22);
  return { challenge: `${ts}.${r}.${h}`, bits: CFG.bits };
}
function zeroBits(buf) { let n = 0; for (const b of buf) { if (b === 0) { n += 8; continue; } n += Math.clz32(b) - 24; break; } return n; }
async function powCheck(challenge, nonce) {
  const [ts, r, h] = String(challenge || '').split('.');
  if (!ts || !r || !h) return 'missing';
  const want = (await L.hmac('halo:pow', ts + '.' + r)).toString('base64url').slice(0, 22);
  if (want !== h) return 'forged';
  if (Date.now() - parseInt(ts, 36) > 20 * 60000) return 'expired';
  const d = crypto.createHash('sha256').update(challenge + ':' + String(nonce)).digest();
  if (zeroBits(d) < CFG.bits) return 'weak';
  const used = await L.q(`INSERT INTO halo_pow (h) VALUES ($1) ON CONFLICT DO NOTHING RETURNING h`, [crypto.createHash('sha256').update(challenge).digest('hex')]);
  if (!used.length) return 'used';
  return null;
}

// ---------- status ----------
async function status() {
  await L.schema();
  const [tre, counts, last] = await Promise.all([
    C.treasury(),
    L.q(`SELECT count(*) FILTER (WHERE day = $1 AND status <> 'failed')::int AS today, count(*) FILTER (WHERE status = 'launched')::int AS launched FROM halo_launches`, [today()]),
    L.q(`SELECT name, symbol, mint, created_at FROM halo_launches WHERE status = 'launched' ORDER BY created_at DESC LIMIT 1`)]);
  let bal = null; try { bal = await L.cached('bal:' + tre, 8000, () => C.balance(tre)); } catch {}
  const avg = await L.cached('avgcost', 60000, async () => { const r = await L.q(`SELECT avg(cost)::bigint AS c FROM halo_launches WHERE status = 'launched' AND cost IS NOT NULL`); return Number(r[0] && r[0].c) || CFG.estCost; });
  const t = counts[0] || { today: 0, launched: 0 };
  let why = null;
  if (CFG.paused) why = 'paused';
  else if (bal === null) why = 'rpc';
  else if (bal < avg + 5_000_000) why = 'treasury';
  else if (t.today >= CFG.cap) why = 'cap';
  return {
    ok: true, network: 'solana mainnet', ready: !why, why,
    treasury: tre, treasurySol: bal === null ? null : sol(bal), costSol: sol(avg),
    launchesLeft: bal === null ? null : Math.max(0, Math.floor((bal - 5_000_000) / avg)),
    today: t.today, cap: CFG.cap, perIp: CFG.perIp, launched: t.launched,
    last: last[0] ? { name: last[0].name, symbol: last[0].symbol, mint: last[0].mint, at: last[0].created_at } : null,
    powBits: CFG.bits, ca: CFG.ca, x: CFG.x, mock: C.MOCK || undefined,
  };
}

// ---------- launch ----------
function parseImage(dataUrl) {
  const m = /^data:(image\/(png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const buf = Buffer.from(m[3], 'base64');
  if (buf.length < 64 || buf.length > 1_600_000) return null;
  const sig = buf.subarray(0, 12).toString('hex');
  const ok = (m[2] === 'png' && sig.startsWith('89504e47')) || (m[2] === 'jpeg' && sig.startsWith('ffd8ff')) || (m[2] === 'webp' && sig.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP') || (m[2] === 'gif' && sig.startsWith('474946'));
  return ok ? { type: m[1], b64: m[3], bytes: buf.length } : null;
}
function coinInput(b) {
  const name = String(b.name || '').replace(/\s+/g, ' ').trim(), symbol = String(b.symbol || '').trim().replace(/^\$/, '');
  if (!name || utf8len(name) > 32) throw L.err(400, 'The name needs 1 to 32 bytes.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,9}$/.test(symbol)) throw L.err(400, 'The ticker needs 1 to 10 letters or numbers.');
  const desc = String(b.description || '').replace(/\r/g, '').trim();
  if (desc.length > 600) throw L.err(400, 'Keep the description under 600 characters.');
  const x = cleanUrl(b.x, ['x.com', 'twitter.com']), tg = cleanUrl(b.tg, ['t.me', 'telegram.me']), web = cleanUrl(b.web);
  if (x === false) throw L.err(400, 'The X link should be an x.com link.');
  if (tg === false) throw L.err(400, 'The Telegram link should be a t.me link.');
  if (web === false) throw L.err(400, 'The website link does not look right.');
  const img = parseImage(b.image); if (!img) throw L.err(400, 'Add a PNG, JPG, WebP or GIF under 1.5 MB.');
  return { name, symbol, desc, x, tg, web, img };
}
// A launch the user's own wallet pays for and signs: no treasury, no daily cap, an optional dev buy.
async function walletBuild(req, b) {
  await L.schema();
  if (CFG.paused) throw L.err(503, 'Launches are paused for a moment.');
  const { name, symbol, desc, x, tg, web, img } = coinInput(b);
  const creator = String(b.creator || '').trim(), mint = String(b.mint || '').trim();
  if (!C.isAddr(creator)) throw L.err(400, 'Connect a wallet first.');
  if (!C.isAddr(mint) || mint === creator) throw L.err(400, 'The coin key is not valid. Try again.');
  const buy = Math.round(Math.max(0, Math.min(10, Number(b.buySol) || 0)) * 1e9);
  if ((await L.q(`SELECT 1 FROM halo_launches WHERE mint = $1 LIMIT 1`, [mint]))[0]) throw L.err(400, 'That coin key was already used. Try again.');
  const id = newId(), o = origin(req), ipk = await ipKey(req);
  const description = (desc ? desc + '\n\n' : '') + `launched on halo · ${o.replace(/^https?:\/\//, '')}`;
  const rec = { id, name, symbol, description, creator, uri: `${o}/m/${id}`, mint };
  await L.q(`INSERT INTO halo_launches (id, day, name, symbol, description, x, tg, web, img, img_type, uri, creator, mint, launcher, status, ipk, kind)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'preparing', $15, 'wallet')`,
    [id, today(), name, symbol, description, x, tg, web, img.b64, img.type, rec.uri, creator, mint, creator, ipk]);
  try { const t = await C.buildWalletLaunch(rec, buy); return { ok: true, id, mint, tx: t.tx, buySol: sol(buy) }; }
  catch (e) { await L.q(`DELETE FROM halo_launches WHERE id = $1`, [id]); throw e; }
}
async function walletSend(b) {
  await L.schema();
  const r = await L.q(`SELECT * FROM halo_launches WHERE id = $1 AND kind = 'wallet'`, [String(b.id || '')]);
  const row = r[0]; if (!row || row.status !== 'preparing') throw L.err(404, 'That launch expired. Start it again.');
  const s = await C.sendWalletLaunch(row, b.tx);
  await L.q(`UPDATE halo_launches SET status = 'sending', sig = $2, tx = $3, sent_at = now(), tries = 1, updated_at = now() WHERE id = $1`, [row.id, s.sig, s.raw]);
  let st = null;
  for (let i = 0; i < 6 && !st; i++) { await new Promise(res => setTimeout(res, C.MOCK ? 300 : 1800)); try { st = await C.statusOf(s.sig); } catch {} }
  if (st && !st.err) await L.q(`UPDATE halo_launches SET status = 'launched', updated_at = now() WHERE id = $1`, [row.id]);
  if (st && st.err) await L.q(`UPDATE halo_launches SET status = 'failed', err = $2, updated_at = now() WHERE id = $1`, [row.id, st.err.slice(0, 300)]);
  return { ok: true, id: row.id, mint: row.mint, sig: s.sig, status: st ? (st.err ? 'failed' : 'launched') : 'sending' };
}
async function launch(req, b) {
  await L.schema();
  if (CFG.paused) throw L.err(503, 'Launches are paused for a moment.');
  const name = String(b.name || '').replace(/\s+/g, ' ').trim(), symbol = String(b.symbol || '').trim().replace(/^\$/, '');
  if (!name || utf8len(name) > 32) throw L.err(400, 'The name needs 1 to 32 bytes.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,9}$/.test(symbol)) throw L.err(400, 'The ticker needs 1 to 10 letters or numbers.');
  let desc = String(b.description || '').replace(/\r/g, '').trim();
  if (desc.length > 600) throw L.err(400, 'Keep the description under 600 characters.');
  const x = cleanUrl(b.x, ['x.com', 'twitter.com']), tg = cleanUrl(b.tg, ['t.me', 'telegram.me']), web = cleanUrl(b.web);
  if (x === false) throw L.err(400, 'The X link should be an x.com link.');
  if (tg === false) throw L.err(400, 'The Telegram link should be a t.me link.');
  if (web === false) throw L.err(400, 'The website link does not look right.');
  const img = parseImage(b.image); if (!img) throw L.err(400, 'Add a PNG, JPG, WebP or GIF under 1.5 MB.');
  const creator = String(b.creator || '').trim();
  if (!C.isAddr(creator)) throw L.err(400, 'The creator address is not a Solana address.');
  const tre = await C.treasury(); if (creator === tre) throw L.err(400, 'Pick a different creator address.');
  const pw = await powCheck(b.pow && b.pow.challenge, b.pow && b.pow.nonce);
  if (pw) throw L.err(400, pw === 'used' ? 'That proof of work was already used. Launch again.' : 'The proof of work did not check out. Launch again.');
  const ipk = await ipKey(req), day = today();
  const [mine, all] = await Promise.all([
    L.q(`SELECT count(*)::int AS n FROM halo_launches WHERE day = $1 AND ipk = $2 AND status <> 'failed'`, [day, ipk]),
    L.q(`SELECT count(*)::int AS n FROM halo_launches WHERE day = $1 AND status <> 'failed'`, [day])]);
  if (mine[0].n >= CFG.perIp) throw L.err(429, `That is ${CFG.perIp} launches from you today. Come back tomorrow.`);
  if (all[0].n >= CFG.cap) throw L.err(429, `Today's ${CFG.cap} free launches are gone. The counter resets at 00:00 UTC.`);
  const bal = await C.balance(tre);
  if (bal < CFG.estCost + 5_000_000) throw L.err(503, 'The treasury is empty right now, so launches are paused.');

  const id = newId(), o = origin(req);
  const k = await C.keys(id);
  const stamp = `launched on halo · ${o.replace(/^https?:\/\//, '')}`;
  const description = (desc ? desc + '\n\n' : '') + stamp;
  const rec = { id, name, symbol, description, creator, uri: `${o}/m/${id}`, mint: k.mint.publicKey.toBase58(), launcher: k.launcher.publicKey.toBase58() };
  await L.q(`INSERT INTO halo_launches (id, day, name, symbol, description, x, tg, web, img, img_type, uri, creator, mint, launcher, status, ipk)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'preparing', $15)`,
    [id, day, name, symbol, description, x, tg, web, img.b64, img.type, rec.uri, creator, rec.mint, rec.launcher, ipk]);
  try {
    const s = await C.sendLaunch(rec);
    await L.q(`UPDATE halo_launches SET status = 'sending', sig = $2, tx = $3, cost = $4, sent_at = now(), tries = tries + 1, updated_at = now() WHERE id = $1`, [id, s.sig, s.raw, s.cost]);
    await C.broadcast(s.raw);
    let st = null;
    for (let i = 0; i < 6 && !st; i++) { await new Promise(r => setTimeout(r, C.MOCK ? 300 : 1800)); try { st = await C.statusOf(s.sig); } catch {} }
    if (st && !st.err) await L.q(`UPDATE halo_launches SET status = 'launched', updated_at = now() WHERE id = $1`, [id]);
    if (st && st.err) await L.q(`UPDATE halo_launches SET status = 'failed', err = $2, updated_at = now() WHERE id = $1`, [id, st.err.slice(0, 300)]);
    return { ok: true, id, mint: rec.mint, sig: s.sig, status: st ? (st.err ? 'failed' : 'launched') : 'sending', costSol: sol(s.cost) };
  } catch (e) {
    await L.q(`UPDATE halo_launches SET status = 'failed', err = $2, updated_at = now() WHERE id = $1 AND status = 'preparing'`, [id, String(e.message).slice(0, 300)]);
    throw e;
  }
}
// Follow a launch to the end: confirm it, re-send the same signed bytes while it is pending, and after the
// blockhash has surely expired, sign it again. The mint key is fixed per launch, so a coin can never be made twice.
async function follow(row) {
  if (!row || row.status !== 'sending') return row;
  let st = null; try { st = await C.statusOf(row.sig); } catch { return row; }
  if (st) {
    const s = st.err ? 'failed' : 'launched';
    await L.q(`UPDATE halo_launches SET status = $2, err = $3, updated_at = now() WHERE id = $1 AND status = 'sending'`, [row.id, s, st.err]);
    return { ...row, status: s, err: st.err };
  }
  const age = Date.now() - new Date(row.sent_at).getTime();
  if (row.kind === 'wallet') {                              // the user's wallet signed it; we can only resend the same bytes
    if (age < 90000) { try { await C.broadcast(row.tx); } catch {} return row; }
    await L.q(`UPDATE halo_launches SET status = 'failed', err = 'did not land', updated_at = now() WHERE id = $1 AND status = 'sending'`, [row.id]); return { ...row, status: 'failed' };
  }
  if (age < 75000) { try { await C.broadcast(row.tx); } catch {} return row; }
  if (row.tries >= 3) { await L.q(`UPDATE halo_launches SET status = 'failed', err = 'did not land', updated_at = now() WHERE id = $1 AND status = 'sending'`, [row.id]); return { ...row, status: 'failed' }; }
  const rec = { id: row.id, name: row.name, symbol: row.symbol, description: row.description, creator: row.creator, uri: row.uri, mint: row.mint };
  try {
    const s = await C.sendLaunch(rec);
    await L.q(`UPDATE halo_launches SET sig = $2, tx = $3, cost = $4, sent_at = now(), tries = tries + 1, updated_at = now() WHERE id = $1`, [row.id, s.sig, s.raw, s.cost]);
    await C.broadcast(s.raw);
  } catch (e) {
    if (/already in use|custom program error: 0x0\b/i.test(String(e.extra && e.extra.logs || e.message))) await L.q(`UPDATE halo_launches SET status = 'launched', updated_at = now() WHERE id = $1`, [row.id]);
  }
  return row;
}
function pub(row, o) {
  return { id: row.id, name: row.name, symbol: row.symbol, mint: row.mint, creator: row.creator, launcher: row.launcher, status: row.status, sig: row.sig,
    at: row.created_at, img: `${o}/i/${row.id}`, x: row.x, tg: row.tg, web: row.web, err: row.status === 'failed' ? (row.err || 'failed') : undefined };
}

// ---------- coins ----------
async function coins(req, qs) {
  await L.schema();
  const lim = Math.max(1, Math.min(60, Number(qs.limit) || 40)), o = origin(req);
  const creator = C.isAddr(qs.creator || '') ? qs.creator : null;
  const rows = await L.q(`SELECT id, name, symbol, mint, creator, launcher, status, sig, created_at, x, tg, web, err FROM halo_launches
    WHERE status IN ('launched', 'sending') ${creator ? 'AND creator = $2' : ''} ORDER BY created_at DESC LIMIT $1`, creator ? [lim, creator] : [lim]);
  let stats = {}; try { stats = await C.coinStats(rows.filter(r => r.status === 'launched').map(r => r.mint)); } catch {}
  const usd = await C.solUsd();
  return { ok: true, solUsd: usd, coins: rows.map(r => { const s = stats[r.mint]; return { ...pub(r, o), mcapSol: s ? sol(s.mcapLamports) : null, mcapUsd: s && usd ? Math.round(s.mcapLamports / 1e9 * usd) : null, progress: s ? s.progress : null, graduated: s ? s.complete : null }; }) };
}

// ---------- router ----------
module.exports = async (req, res) => {
  const qs = L.query(req), op = String(qs.op || '');
  if (req.method === 'OPTIONS') return L.send(res, 204, {});
  try {
    if (!L.dbReady()) return L.send(res, 503, { ok: false, error: 'The database is not connected yet.' });
    if (op === 'status') return L.send(res, 200, await status(), L.CACHE(8, 30));
    if (op === 'pow') { if (L.limited('pow:' + L.ip(req), 30, 600000)) throw L.err(429, 'Slow down a little.'); return L.send(res, 200, { ok: true, ...(await powChallenge()) }); }
    if (op === 'launch' && req.method === 'POST') {
      if (L.limited('launch:' + L.ip(req), 6, 600000)) throw L.err(429, 'Too many tries. Wait a few minutes.');
      return L.send(res, 200, await launch(req, await L.body(req)));
    }
    if (op === 'walletbuild' && req.method === 'POST') {
      if (L.limited('wb:' + L.ip(req), 12, 600000)) throw L.err(429, 'Too many tries. Wait a few minutes.');
      return L.send(res, 200, await walletBuild(req, await L.body(req)));
    }
    if (op === 'walletsend' && req.method === 'POST') {
      if (L.limited('ws:' + L.ip(req), 12, 600000)) throw L.err(429, 'Too many tries. Wait a few minutes.');
      return L.send(res, 200, await walletSend(await L.body(req)));
    }
    if (op === 'wclaimbuild' && req.method === 'POST') {
      const b = await L.body(req); const creator = String(b.creator || '');
      if (!C.isAddr(creator)) throw L.err(400, 'That is not a Solana address.');
      if (L.limited('wcb:' + L.ip(req), 10, 600000)) throw L.err(429, 'Too many claims. Wait a few minutes.');
      const c = await C.claimable(creator);
      if (c.vault < CFG.minClaim) throw L.err(400, `There is under ${sol(CFG.minClaim)} SOL to claim, which is not worth the fee yet.`);
      return L.send(res, 200, { ok: true, ...(await C.buildWalletClaim(creator)), vaultSol: sol(c.vault) });
    }
    if (op === 'wclaimsend' && req.method === 'POST') {
      const b = await L.body(req); const creator = String(b.creator || '');
      if (!C.isAddr(creator)) throw L.err(400, 'That is not a Solana address.');
      if (L.limited('wcs:' + L.ip(req), 10, 600000)) throw L.err(429, 'Too many claims. Wait a few minutes.');
      return L.send(res, 200, { ok: true, sig: await C.relayWalletClaim(creator, b.tx) });
    }
    if (op === 'launches') {
      await L.schema(); const id = String(qs.id || '');
      const r = await L.q(`SELECT * FROM halo_launches WHERE id = $1`, [id]); if (!r[0]) throw L.err(404, 'No launch with that id.');
      const row = await follow(r[0]); return L.send(res, 200, { ok: true, launch: pub(row, origin(req)) });
    }
    if (op === 'coins') return L.send(res, 200, await coins(req, qs), qs.creator ? 'no-store' : L.CACHE(15, 60));
    if (op === 'meta') {
      await L.schema(); const r = await L.q(`SELECT id, name, symbol, description, x, tg, web FROM halo_launches WHERE id = $1`, [String(qs.id || '')]);
      if (!r[0]) throw L.err(404, 'Not found.'); const o = origin(req), m = r[0];
      const j = { name: m.name, symbol: m.symbol, description: m.description, image: `${o}/i/${m.id}`, showName: true, createdOn: o };
      if (m.x) j.twitter = m.x; if (m.tg) j.telegram = m.tg; if (m.web) j.website = m.web;
      return L.send(res, 200, j, 'public, max-age=300, s-maxage=86400');
    }
    if (op === 'img') {
      await L.schema(); const r = await L.q(`SELECT img, img_type FROM halo_launches WHERE id = $1`, [String(qs.id || '')]);
      if (!r[0] || !r[0].img) throw L.err(404, 'Not found.');
      res.statusCode = 200; res.setHeader('Content-Type', r[0].img_type); res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); res.setHeader('Access-Control-Allow-Origin', '*');
      return res.end(Buffer.from(r[0].img, 'base64'));
    }
    if (op === 'claim') {
      const creator = String(qs.creator || ''); if (!C.isAddr(creator)) throw L.err(400, 'That is not a Solana address.');
      if (L.limited('claim:' + L.ip(req), 40, 600000)) throw L.err(429, 'Slow down a little.');
      const c = await C.claimable(creator);
      const first = c.wallet === 0;
      return L.send(res, 200, { ok: true, creator, vaultSol: sol(c.vault), walletSol: sol(c.wallet), canClaim: c.vault >= CFG.minClaim && (!first || c.vault >= RENT_MIN), minClaimSol: sol(CFG.minClaim) });
    }
    if (op === 'claimbuild' && req.method === 'POST') {
      const b = await L.body(req); const creator = String(b.creator || '');
      if (!C.isAddr(creator)) throw L.err(400, 'That is not a Solana address.');
      if (L.limited('cb:' + L.ip(req), 8, 600000) || L.limited('cbc:' + creator, 4, 600000)) throw L.err(429, 'Too many claims. Wait a few minutes.');
      const c = await C.claimable(creator);
      if (c.vault < CFG.minClaim) throw L.err(400, `There is under ${sol(CFG.minClaim)} SOL to claim, which is not worth the fee yet.`);
      return L.send(res, 200, { ok: true, ...(await C.buildClaim(creator)), vaultSol: sol(c.vault) });
    }
    if (op === 'claimsend' && req.method === 'POST') {
      const b = await L.body(req);
      const sig = await C.finish('halo:claim', b.message, String(b.signer || ''), b.signature, { token: b.token, treasury: true });
      return L.send(res, 200, { ok: true, sig });
    }
    if (op === 'withdrawbuild' && req.method === 'POST') {
      const b = await L.body(req); const from = String(b.from || ''), to = String(b.to || '');
      if (!C.isAddr(from) || !C.isAddr(to)) throw L.err(400, 'Both addresses need to be Solana addresses.');
      if (from === to) throw L.err(400, 'Send it to a different address.');
      const bal = await C.balance(from); const lamports = bal - 5000;
      if (lamports <= 0) throw L.err(400, 'This wallet has nothing to send yet.');
      return L.send(res, 200, { ok: true, ...(await C.buildWithdraw(from, to, lamports)), sendSol: sol(lamports) });
    }
    if (op === 'withdrawsend' && req.method === 'POST') {
      const b = await L.body(req);
      const sig = await C.finish('halo:withdraw', b.message, String(b.signer || ''), b.signature, { token: b.token, treasury: false });
      return L.send(res, 200, { ok: true, sig });
    }
    if (op === 'dryrun') {
      // Proves the launch path against mainnet without sending anything: a full create, simulated with a large public wallet as payer.
      if (L.limited('dry:' + L.ip(req), 5, 600000)) throw L.err(429, 'Slow down a little.');
      const id = 'dry' + newId(), k = await C.keys(id), o = origin(req);
      const kp = (await C.keys('dry-creator:' + id)).mint.publicKey.toBase58();
      const sim = await C.simulateLaunch({ id, name: 'halo dry run', symbol: 'DRY', uri: `${o}/m/${id}`, creator: kp }, { dry: true });
      return L.send(res, 200, { ok: true, dryRun: true, payer: sim.payer, launcher: k.launcher.publicKey.toBase58(), mint: k.mint.publicKey.toBase58(), creator: kp, result: sim, costSol: sim.ok ? sol(sim.need) : null });
    }
    if (op === 'tick') {
      await L.schema();
      const rows = await L.q(`SELECT * FROM halo_launches WHERE status = 'sending' ORDER BY sent_at LIMIT 10`);
      for (const r of rows) await follow(r);
      await L.q(`DELETE FROM halo_pow WHERE at < now() - interval '1 day'`);
      await L.q(`DELETE FROM halo_launches WHERE status = 'preparing' AND kind = 'wallet' AND created_at < now() - interval '1 hour'`);
      await L.q(`UPDATE halo_launches SET ipk = NULL WHERE ipk IS NOT NULL AND day < $1`, [today()]);
      return L.send(res, 200, { ok: true, followed: rows.length });
    }
    return L.send(res, 404, { ok: false, error: 'Unknown op.' });
  } catch (e) {
    const code = e.code && Number.isInteger(e.code) ? e.code : 500;
    if (code === 500) console.error(e);
    return L.send(res, code, { ok: false, error: code === 500 ? 'Something broke on our side. Try again.' : e.message, ...(e.extra ? { detail: e.extra.detail, logs: e.extra.logs } : {}) });
  }
};
