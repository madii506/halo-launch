// HALO server helpers: responses, bodies, rate limits, Postgres (Neon on Vercel, PGlite in dev), the master secret.
const crypto = require('crypto');

function send(res, code, obj, cache = 'no-store') {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (/s-maxage/.test(cache)) { res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate'); res.setHeader('CDN-Cache-Control', cache.replace(/max-age=0,\s*/, '')); }
  else res.setHeader('Cache-Control', cache);
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.end(JSON.stringify(obj));
}
const CACHE = (s, swr = s * 3) => `public, max-age=0, s-maxage=${s}, stale-while-revalidate=${swr}`;
function query(req) { if (req.query) return req.query; return Object.fromEntries(new URL(req.url, 'http://x').searchParams); }
async function body(req, max = 4 * 1024 * 1024) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; } }
  const chunks = []; let n = 0;
  for await (const c of req) { chunks.push(c); n += c.length; if (n > max) return {}; }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}
function ip(req) { return String(req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '?').split(',')[0].trim(); }
const hits = new Map();
function limited(key, n, ms) {
  const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < ms); a.push(now); hits.set(key, a);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return a.length > n;
}
function err(code, msg, extra) { const e = new Error(msg); e.code = code; e.extra = extra; return e; }
async function getJson(url, opt = {}, ms = 8000) {
  const r = await fetch(url, { ...opt, headers: { accept: 'application/json', 'user-agent': 'halo/1.0', ...(opt.headers || {}) }, signal: AbortSignal.timeout(ms) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, ok: r.ok, json: j };
}
const mem = new Map();
async function cached(key, ms, fn) {
  const c = mem.get(key);
  if (c && c.has && Date.now() - c.t < ms) return c.v;
  if (c && c.p) return c.p;
  const p = (async () => {
    try { const v = await fn(); mem.set(key, { t: Date.now(), v, has: true }); return v; }
    catch (e) { if (c && c.has) { mem.set(key, { t: c.t, v: c.v, has: true }); return c.v; } mem.delete(key); throw e; }
  })();
  mem.set(key, { ...(c || {}), p }); return p;
}

// ---------- Postgres ----------
let pg = null;
function dbUrl() {
  const e = process.env;
  for (const k of ['DATABASE_URL', 'POSTGRES_URL', 'STORAGE_URL']) if (e[k]) return e[k];
  for (const [k, v] of Object.entries(e)) if (/_URL$/.test(k) && !/UNPOOLED|NON_POOLING|NO_SSL/.test(k) && /^postgres(ql)?:\/\//.test(v || '')) return v;
  return '';
}
async function q(text, params = []) {
  if (process.env.D_PGLITE) {
    if (!pg) { const { PGlite } = require(process.env.D_PGLITE_MOD || '@electric-sql/pglite'); pg = new PGlite(); }
    return (await pg.query(text, params)).rows;
  }
  if (!pg) { const { neon } = require('@neondatabase/serverless'); pg = neon(dbUrl()); }
  return pg.query(text, params);
}
const dbReady = () => !!(process.env.D_PGLITE || dbUrl());
let schemaP = null;
function schema() {
  if (!schemaP) schemaP = (async () => {
    await q(`CREATE TABLE IF NOT EXISTS halo_meta (k text PRIMARY KEY, v text NOT NULL)`);
    await q(`CREATE TABLE IF NOT EXISTS halo_launches (
      id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      day date NOT NULL DEFAULT ((now() AT TIME ZONE 'utc')::date),
      name text NOT NULL, symbol text NOT NULL, description text NOT NULL DEFAULT '', x text, tg text, web text,
      img text, img_type text, uri text, creator text NOT NULL, mint text NOT NULL, launcher text NOT NULL,
      status text NOT NULL, sig text, err text, tx text, cost bigint, sent_at timestamptz, tries int NOT NULL DEFAULT 0, ipk text)`);
    await q(`CREATE INDEX IF NOT EXISTS halo_launches_day ON halo_launches (day)`);
    await q(`CREATE INDEX IF NOT EXISTS halo_launches_creator ON halo_launches (creator)`);
    await q(`CREATE TABLE IF NOT EXISTS halo_pow (h text PRIMARY KEY, at timestamptz NOT NULL DEFAULT now())`);
  })().catch(e => { schemaP = null; throw e; });
  return schemaP;
}
async function meta(k) { const r = await q(`SELECT v FROM halo_meta WHERE k = $1`, [k]); return r[0] ? r[0].v : null; }
async function setMeta(k, v) { await q(`INSERT INTO halo_meta (k, v) VALUES ($1, $2) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`, [k, String(v)]); }

// The master secret: made once, kept in the database, never sent anywhere. Every key the service uses
// (the treasury, each launch's launcher and mint) is derived from it, so nothing else needs storing.
let masterP = null;
function master() {
  if (!masterP) masterP = (async () => {
    if (process.env.HALO_MASTER && /^[0-9a-f]{64}$/i.test(process.env.HALO_MASTER)) return Buffer.from(process.env.HALO_MASTER, 'hex');
    await schema();
    await q(`INSERT INTO halo_meta (k, v) VALUES ('master', $1) ON CONFLICT (k) DO NOTHING`, [crypto.randomBytes(32).toString('hex')]);
    return Buffer.from(await meta('master'), 'hex');
  })().catch(e => { masterP = null; throw e; });
  return masterP;
}
async function hmac(label, data) { return crypto.createHmac('sha256', await master()).update(label).update(data || '').digest(); }

module.exports = { send, CACHE, query, body, ip, limited, err, getJson, cached, q, dbReady, schema, meta, setMeta, master, hmac };
