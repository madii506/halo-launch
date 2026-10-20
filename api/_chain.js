// HALO chain side: derived keys, launch transactions, gasless claims, withdrawals and coin stats.
// The official pump SDK builds every pump instruction; web3.js compiles, simulates and sends.
const crypto = require('crypto');
const L = require('./_lib');
const MOCK = !!process.env.HALO_MOCK;          // local dev only: no network, fake chain answers
let W3, P;
const w3 = () => W3 || (W3 = require('@solana/web3.js'));
const pump = () => P || (P = require('@pump-fun/pump-sdk'));

const RPCS = [process.env.RPC_URL, 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean);
const SIM_FUND = 60_000_000;                    // 0.06 SOL: more than any create needs; the simulation returns the exact cost
const SIM_PAYER = process.env.HALO_SIM_PAYER || '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9'; // a large public wallet, only for dry runs
const BASE_FEE = 5000;
const INITIAL_REAL_TOKENS = 793100000000000n;   // pump curve: 793.1M tokens (6 decimals) sold before graduation

function timedFetch(ms) { return (url, opt = {}) => fetch(url, { ...opt, signal: AbortSignal.timeout(ms) }); }
let conns = null;
function connections() {
  if (!conns) { const { Connection } = w3(); conns = RPCS.map(u => new Connection(u, { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: timedFetch(10000) })); }
  return conns;
}
async function rpc(fn) {
  let last;
  for (const c of connections()) { try { return await fn(c); } catch (e) { last = e; } }
  const m = String(last && last.message || last || '');
  throw L.err(502, 'Solana RPC is busy right now. Try again in a moment.', { detail: m.slice(0, 160) });
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58enc(buf) { let n = 0n; for (const b of buf) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b === 0) s = '1' + s; else break; } return s; }
function b58dec(str) { let n = 0n; for (const c of str) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); } const out = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; } for (const c of str) { if (c === '1') out.unshift(0); else break; } return Buffer.from(out); }
function isAddr(s) { if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false; try { return b58dec(s).length === 32; } catch { return false; } }
function edVerify(pub32, msg, sig64) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pub32)]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(msg), key, Buffer.from(sig64));
  } catch { return false; }
}

// ---------- keys: all derived from the master secret ----------
async function keys(id) {
  const m = await L.master(), seed = s => crypto.createHmac('sha256', m).update(s).digest();
  if (MOCK) {
    const fake = s => { const pub = crypto.createHash('sha256').update(seed(s)).digest(); return { publicKey: { toBase58: () => b58enc(pub), bytes: pub } }; };
    const o = { treasury: fake('halo:treasury') }; if (id) { o.launcher = fake('halo:launcher:' + id); o.mint = fake('halo:mint:' + id); } return o;
  }
  const { Keypair } = w3();
  const o = { treasury: Keypair.fromSeed(seed('halo:treasury')) };
  if (id) { o.launcher = Keypair.fromSeed(seed('halo:launcher:' + id)); o.mint = Keypair.fromSeed(seed('halo:mint:' + id)); }
  return o;
}
async function treasury() { return (await keys()).treasury.publicKey.toBase58(); }

// ---------- mock chain for local dev ----------
const M = { bal: new Map(), sigs: new Map(), vault: new Map() };
if (MOCK) M.bal.set('*treasury', Number(process.env.HALO_MOCK_TREASURY || 500_000_000));
function mockSig() { return b58enc(crypto.randomBytes(64)); }

async function balance(addr) {
  if (MOCK) { if (addr === await treasury()) return M.bal.get('*treasury'); return M.bal.get(addr) || 0; }
  const { PublicKey } = w3(); return rpc(c => c.getBalance(new PublicKey(addr), 'confirmed'));
}
async function priorityFee() {
  if (MOCK) return 60000;
  return L.cached('prio', 20000, async () => {
    const r = await rpc(c => c.getRecentPrioritizationFees());
    const v = r.map(x => x.prioritizationFee).filter(x => x > 0).sort((a, b) => a - b);
    const p = v.length ? v[Math.floor(v.length * .75)] : 50000;
    return Math.max(25000, Math.min(400000, p));
  });
}

// ---------- launch ----------
async function createIx(rec, k) {
  const { PublicKey } = w3();
  return pump().PUMP_SDK.createV2Instruction({ mint: k.mint.publicKey, name: rec.name, symbol: rec.symbol, uri: rec.uri, creator: new PublicKey(rec.creator), user: k.launcher.publicKey, mayhemMode: false });
}
function compile(payer, ixs, blockhash) {
  const { TransactionMessage, VersionedTransaction } = w3();
  return new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
}
// Dry run with a generous transfer to the fresh launcher; the launcher's balance afterwards tells us exactly
// what the create costs, so the real transaction can fund it to the lamport and leave it empty.
async function simulateLaunch(rec, { dry = false } = {}) {
  if (MOCK) return { ok: true, need: 21_870_000, cu: 142_000, payer: dry ? SIM_PAYER : await treasury() };
  const { PublicKey, SystemProgram, ComputeBudgetProgram } = w3();
  const k = await keys(rec.id);
  const payer = dry ? new PublicKey(SIM_PAYER) : k.treasury.publicKey;
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }), SystemProgram.transfer({ fromPubkey: payer, toPubkey: k.launcher.publicKey, lamports: SIM_FUND }), await createIx(rec, k)];
  const { blockhash } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const tx = compile(payer, ixs, blockhash);
  const sim = await rpc(c => c.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: 'processed', accounts: { encoding: 'base64', addresses: [k.launcher.publicKey.toBase58()] } }));
  const v = sim.value;
  if (v.err) return { ok: false, err: JSON.stringify(v.err), logs: (v.logs || []).slice(-8), payer: payer.toBase58() };
  const post = v.accounts && v.accounts[0] ? v.accounts[0].lamports : 0;
  return { ok: true, need: SIM_FUND - post, cu: v.unitsConsumed || 200000, bytes: tx.serialize().length, payer: payer.toBase58() };
}
async function sendLaunch(rec) {
  const sim = await simulateLaunch(rec);
  if (!sim.ok) throw L.err(400, 'pump.fun would reject this launch right now.', { detail: sim.err, logs: sim.logs });
  const price = await priorityFee(), cu = Math.min(600000, Math.ceil(sim.cu * 1.15) + 5000);
  const cost = sim.need + BASE_FEE * 3 + Math.ceil(cu * price / 1e6);
  if (MOCK) {
    const sig = mockSig(); M.sigs.set(sig, { at: Date.now() }); M.bal.set('*treasury', M.bal.get('*treasury') - cost);
    return { sig, raw: Buffer.from('mock').toString('base64'), cost };
  }
  const { SystemProgram, ComputeBudgetProgram } = w3();
  const k = await keys(rec.id);
  const ixs = [ComputeBudgetProgram.setComputeUnitLimit({ units: cu }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }),
    SystemProgram.transfer({ fromPubkey: k.treasury.publicKey, toPubkey: k.launcher.publicKey, lamports: sim.need }), await createIx(rec, k)];
  const { blockhash } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const tx = compile(k.treasury.publicKey, ixs, blockhash); tx.sign([k.treasury, k.launcher, k.mint]);
  const raw = Buffer.from(tx.serialize()), sig = b58enc(tx.signatures[0]);
  return { sig, raw: raw.toString('base64'), cost };
}
async function broadcast(rawB64) {
  if (MOCK) return true;
  const raw = Buffer.from(rawB64, 'base64');
  await rpc(c => c.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 2 }));
  return true;
}
async function statusOf(sig) {
  if (MOCK) { const s = M.sigs.get(sig); if (!s) return null; return Date.now() - s.at > 1500 ? { done: true, err: null } : null; }
  const r = await rpc(c => c.getSignatureStatuses([sig], { searchTransactionHistory: true }));
  const s = r.value[0]; if (!s) return null;
  if (s.err) return { done: true, err: JSON.stringify(s.err) };
  if (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized') return { done: true, err: null };
  return null;
}

// ---------- claims and withdrawals: we build the message, the browser signs, we co-sign only what we built ----------
async function claimable(creator) {
  if (MOCK) return { vault: M.vault.has(creator) ? M.vault.get(creator) : 12_345_678, wallet: M.bal.get(creator) || 0 };
  const { PublicKey } = w3(); const pk = new PublicKey(creator);
  const [vault, wallet] = await Promise.all([
    rpc(c => new (pump().OnlinePumpSdk)(c).getCreatorVaultBalanceBothPrograms(pk)),
    rpc(c => c.getBalance(pk, 'confirmed'))]);
  return { vault: Number(vault.toString()), wallet };
}
async function token(label, bytes) {
  const ts = Date.now().toString(36);
  return (await L.hmac(label, Buffer.concat([Buffer.from(bytes), Buffer.from(ts)]))).toString('hex') + '.' + ts;
}
async function checkToken(label, bytes, tok, maxAge = 100000) {
  const [h, ts] = String(tok || '').split('.'); if (!h || !ts) return false;
  if (Date.now() - parseInt(ts, 36) > maxAge) return false;
  const want = await L.hmac(label, Buffer.concat([Buffer.from(bytes), Buffer.from(ts)]));
  const got = Buffer.from(h, 'hex'); return got.length === want.length && crypto.timingSafeEqual(got, want);
}
async function buildClaim(creator) {
  if (MOCK) { const bytes = crypto.randomBytes(180); return { message: bytes.toString('base64'), token: await token('halo:claim', bytes), signer: creator }; }
  const { PublicKey, ComputeBudgetProgram } = w3(); const pk = new PublicKey(creator); const k = await keys();
  const ixs = await rpc(c => new (pump().OnlinePumpSdk)(c).collectCoinCreatorFeeInstructions(pk, k.treasury.publicKey));
  if (!ixs.length) throw L.err(400, 'Nothing to claim yet.');
  const all = [ComputeBudgetProgram.setComputeUnitLimit({ units: 220000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: await priorityFee() }), ...ixs];
  const { blockhash } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const tx = compile(k.treasury.publicKey, all, blockhash);
  const msg = tx.message, idx = msg.staticAccountKeys.findIndex(x => x.equals(pk));
  if (idx < 0 || idx >= msg.header.numRequiredSignatures) throw L.err(500, 'Unexpected claim layout.');
  const sim = await rpc(c => c.simulateTransaction(tx, { sigVerify: false, commitment: 'processed' }));
  if (sim.value.err) throw L.err(400, 'This claim would fail right now.', { detail: JSON.stringify(sim.value.err), logs: (sim.value.logs || []).slice(-6) });
  const bytes = Buffer.from(msg.serialize());
  return { message: bytes.toString('base64'), token: await token('halo:claim', bytes), signer: creator };
}
async function buildWithdraw(from, to, lamports) {
  if (MOCK) { const bytes = crypto.randomBytes(150); return { message: bytes.toString('base64'), token: await token('halo:withdraw', bytes), signer: from, lamports }; }
  const { PublicKey, SystemProgram } = w3(); const f = new PublicKey(from), t = new PublicKey(to);
  const { blockhash } = await rpc(c => c.getLatestBlockhash('confirmed'));
  const tx = compile(f, [SystemProgram.transfer({ fromPubkey: f, toPubkey: t, lamports })], blockhash);
  const bytes = Buffer.from(tx.message.serialize());
  return { message: bytes.toString('base64'), token: await token('halo:withdraw', bytes), signer: from, lamports };
}
// Take back a message we built, the browser's signature for it, add ours when we are the fee payer, send.
async function finish(label, messageB64, signer, sigB58, cosign) {
  const bytes = Buffer.from(String(messageB64 || ''), 'base64');
  if (!bytes.length || !(await checkToken(label, bytes, cosign.token))) throw L.err(400, 'That request expired. Try again.');
  let sig; try { sig = b58dec(String(sigB58 || '')); } catch { sig = Buffer.alloc(0); }
  if (sig.length !== 64 || !edVerify(b58dec(signer), bytes, sig)) throw L.err(400, 'The signature does not match this wallet.');
  if (MOCK) { const s = mockSig(); M.sigs.set(s, { at: Date.now() }); if (label === 'halo:claim') { M.bal.set(signer, (M.bal.get(signer) || 0) + (M.vault.has(signer) ? M.vault.get(signer) : 12_345_678)); M.vault.set(signer, 0); } else { M.bal.set(signer, 0); } return s; }
  const { VersionedMessage, VersionedTransaction, PublicKey } = w3();
  const tx = new VersionedTransaction(VersionedMessage.deserialize(bytes));
  tx.addSignature(new PublicKey(signer), sig);
  if (cosign.treasury) tx.sign([(await keys()).treasury]);
  const raw = Buffer.from(tx.serialize());
  await rpc(c => c.sendRawTransaction(raw, { skipPreflight: false, preflightCommitment: 'processed', maxRetries: 3 }));
  return b58enc(tx.signatures[0]);
}

// ---------- coin stats straight from the bonding curves ----------
async function coinStats(mints) {
  if (!mints.length) return {};
  if (MOCK) return Object.fromEntries(mints.map(m => { const h = crypto.createHash('sha256').update(m).digest(); return [m, { mcapLamports: 27_000_000_000 + h.readUInt32BE(0) % 60_000_000_000, progress: (h[4] % 100) / 100, complete: h[5] % 9 === 0 }]; }));
  return L.cached('stats:' + mints.join(','), 25000, async () => {
    const { PublicKey } = w3(); const S = pump();
    const out = {};
    for (let i = 0; i < mints.length; i += 100) {
      const part = mints.slice(i, i + 100);
      const infos = await rpc(c => c.getMultipleAccountsInfo(part.map(m => S.bondingCurvePda(new PublicKey(m))), 'confirmed'));
      infos.forEach((info, j) => {
        if (!info) return;
        try {
          const bc = S.PUMP_SDK.decodeBondingCurve(info);
          const mcap = S.bondingCurveMarketCap({ mintSupply: bc.tokenTotalSupply, virtualQuoteReserves: bc.virtualQuoteReserves, virtualTokenReserves: bc.virtualTokenReserves });
          const real = BigInt(bc.realTokenReserves.toString());
          const progress = bc.complete ? 1 : Math.max(0, Math.min(1, Number(INITIAL_REAL_TOKENS - real) / Number(INITIAL_REAL_TOKENS)));
          out[part[j]] = { mcapLamports: Number(mcap.toString()), progress, complete: !!bc.complete };
        } catch {}
      });
    }
    return out;
  });
}
async function solUsd() {
  if (MOCK) return 182.4;
  return L.cached('solusd', 60000, async () => {
    const r = await L.getJson('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {}, 5000);
    const v = r.json && r.json.solana && r.json.solana.usd; if (!v) throw new Error('no price'); return v;
  }).catch(() => null);
}

module.exports = { MOCK, SIM_PAYER, b58enc, b58dec, isAddr, keys, treasury, balance, simulateLaunch, sendLaunch, broadcast, statusOf, claimable, buildClaim, buildWithdraw, finish, coinStats, solUsd, edVerify };
