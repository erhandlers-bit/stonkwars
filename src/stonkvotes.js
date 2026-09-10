// STONK WARS PICK 'EM (owner 2026-09-10): free-to-enter round picks, prize
// funded by the owner ("winners of each round get airdropped 25% of my
// creator fees instantly").
//
// Legal shape, deliberately: entry is FREE (no consideration), the prize is
// the owner's own money, so this is a sweepstakes-style promotion, not a
// betting pool. Nothing here ever takes funds from a voter.
//
// Mechanics: while a round is in its pre-bell window, a wallet picks ONE live
// animal by signing a message with its Solana key (Phantom signMessage). One
// pick per wallet per round; the pick locks at the bell. When the round
// settles, everyone whose animal won its match splits the round pool evenly.
// Pool = STONK_PAYOUT_PCT of the PAYOUT wallet's balance (the owner sweeps
// claimed creator fees into that wallet), capped per round.
//
// Payouts run only when STONK_PAYOUT_ENABLED is true AND STONK_PAYOUT_KEY is
// set — a DEDICATED wallet, never the trading key. Otherwise every settlement
// is recorded as an "owed" ledger the owner can pay by hand.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const STATE_FILE = path.join(__dirname, '..', 'data', 'stonkvotes.json');
const state = { rounds: {}, settlements: [] };
function load() { try { Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch { /* fresh */ } }
function save() { try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch { /* disk */ } }

let web3 = null;
function w3() { if (!web3) web3 = require('@solana/web3.js'); return web3; }
function rpc() { return new (w3().Connection)(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed'); }

// ---- signature check: raw ed25519 through Node's crypto, no extra deps ----
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
function verifySig(walletB58, message, sigB64) {
  try {
    const pub = new (w3().PublicKey)(walletB58).toBytes();
    const key = crypto.createPublicKey({ key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(pub)]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(sigB64, 'base64'));
  } catch { return false; }
}
// The exact string the wallet signs. Includes the pick + round + a timestamp
// so a captured signature cannot be replayed for a different pick.
function messageFor(wallet, roundIdx, animal, ts) {
  return 'STONK WARS pick\nround: ' + roundIdx + '\nanimal: ' + animal + '\nwallet: ' + wallet + '\nts: ' + ts;
}

// ---- eligibility (sybil brake; both gates default OFF) ----
async function eligible(wallet) {
  const minSol = Number(config.STONK_VOTE_MIN_SOL || 0);
  const mint = config.STONK_VOTE_TOKEN_MINT;
  const minTok = Number(config.STONK_VOTE_MIN_TOKENS || 0);
  if (!minSol && !(mint && minTok)) return { ok: true };
  try {
    const conn = rpc();
    const pk = new (w3().PublicKey)(wallet);
    if (minSol) {
      const lamports = await conn.getBalance(pk);
      if (lamports / 1e9 < minSol) return { ok: false, reason: 'wallet needs at least ' + minSol + ' SOL to pick' };
    }
    if (mint && minTok) {
      const res = await conn.getParsedTokenAccountsByOwner(pk, { mint: new (w3().PublicKey)(mint) });
      let held = 0;
      for (const a of res.value) held += Number(a.account.data.parsed.info.tokenAmount.uiAmount || 0);
      if (held < minTok) return { ok: false, reason: 'wallet needs at least ' + minTok + ' tokens to pick' };
    }
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'could not verify eligibility (' + String(e.message).slice(0, 60) + ')' }; }
}

// ---- voting ----
function liveAnimals(round) { const s = new Set(); for (const m of round.matches) { s.add(m.a); s.add(m.b); } return s; }
async function vote(body) {
  const sw = require('./stonkwars');
  const st = sw.status();
  const { wallet, animal, ts, signature } = body || {};
  const roundIdx = Number(body && body.round);
  if (st.status !== 'running') return { ok: false, reason: 'no tournament running' };
  if (roundIdx !== st.roundIdx) return { ok: false, reason: 'that round is not open' };
  const round = st.rounds[roundIdx];
  if (Date.now() >= round.startAt) return { ok: false, reason: 'picks are locked — the bell already rang' };
  if (!liveAnimals(round).has(animal)) return { ok: false, reason: 'that animal is not in this round' };
  if (typeof wallet !== 'string' || wallet.length < 32) return { ok: false, reason: 'bad wallet' };
  const t = Number(ts);
  if (!(t > 0) || Math.abs(Date.now() - t) > 5 * 60_000) return { ok: false, reason: 'stale signature — try again' };
  if (!verifySig(wallet, messageFor(wallet, roundIdx, animal, t), signature)) return { ok: false, reason: 'signature does not verify' };
  const el = await eligible(wallet);
  if (!el.ok) return el;
  const r = (state.rounds[roundIdx] = state.rounds[roundIdx] || { votes: {} });
  const prev = r.votes[wallet];
  r.votes[wallet] = { animal, at: Date.now(), sig: signature };
  save();
  return { ok: true, animal, changed: !!(prev && prev.animal !== animal) };
}

// ---- pool + settlement ----
function payoutKeypair() {
  const raw = process.env.STONK_PAYOUT_KEY;
  if (!raw) return null;
  try {
    const { Keypair } = w3();
    if (raw.trim().startsWith('[')) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    // base58 secret (Phantom export) — decode via PublicKey's bs58 path is not exposed; do it by hand
    const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let n = 0n; for (const c of raw.trim()) { const i = ALPH.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
    const bytes = []; while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
    for (const c of raw.trim()) { if (c === '1') bytes.unshift(0); else break; }
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch { return null; }
}
// ---- FEE ACCOUNTING (owner 2026-09-10: "I only want to give up 25% of my
// TOTAL creator fees while the tournament is running") ----
// Each round pays STONK_PAYOUT_PCT of the fees that ACCRUED DURING THAT ROUND,
// so the four rounds sum to exactly 25% of tournament fees — never more — and
// round 1 can still pay out instantly without knowing what rounds 2-4 will earn.
//
// "Cumulative fees" = payout-wallet balance + everything this module has
// already paid out (+ the unclaimed balance of a creator-fee vault, if one is
// configured). Claiming fees moves vault -> wallet, so the sum stays smooth;
// paying winners lowers the balance but raises totalPaid, so it does not eat
// the base. Snapshot at tournament start; each settlement pays on the delta.
function payoutAddress() {
  const kp = payoutKeypair();
  return kp ? kp.publicKey.toBase58() : (config.STONK_PAYOUT_WALLET || null);
}
async function cumulativeFees() {
  const addr = payoutAddress();
  if (!addr) return { cum: 0, walletSol: 0, vaultSol: 0, address: null };
  const conn = rpc();
  const { PublicKey } = w3();
  const walletSol = (await conn.getBalance(new PublicKey(addr))) / 1e9;
  let vaultSol = 0;
  if (config.STONK_FEE_VAULT) { try { vaultSol = (await conn.getBalance(new PublicKey(config.STONK_FEE_VAULT))) / 1e9; } catch { /* optional */ } }
  return { cum: walletSol + vaultSol + (state.totalPaidSol || 0), walletSol, vaultSol, address: addr };
}
async function onTournamentStart() {
  try {
    const f = await cumulativeFees();
    state.baselineCum = f.cum; state.lastCum = f.cum; state.tournamentStartedAt = Date.now();
    save();
  } catch { /* rpc down — first settlement will baseline itself */ }
}
async function poolNow() {
  const pct = Number(config.STONK_PAYOUT_PCT ?? 0.25);
  const reserve = Number(config.STONK_PAYOUT_RESERVE_SOL || 0.02);
  const cap = Number(config.STONK_PAYOUT_MAX_SOL_PER_ROUND || 0) || Infinity;
  try {
    const f = await cumulativeFees();
    if (!f.address) return { sol: 0, walletSol: 0, vaultSol: 0, address: null, pct, accruedSol: 0 };
    const last = state.lastCum == null ? f.cum : state.lastCum;
    const accrued = Math.max(0, f.cum - last);           // fees earned since the last settlement
    let pool = Math.min(cap, accrued * pct);
    pool = Math.min(pool, Math.max(0, f.walletSol - reserve)); // can only pay what is actually claimed into the wallet
    return { sol: pool, walletSol: f.walletSol, vaultSol: f.vaultSol, address: f.address, pct, accruedSol: accrued, cum: f.cum, tournamentFeesSol: Math.max(0, f.cum - (state.baselineCum == null ? f.cum : state.baselineCum)) };
  } catch { return { sol: 0, walletSol: 0, vaultSol: 0, address: payoutAddress(), pct, accruedSol: 0, error: 'rpc' }; }
}

// Called by stonkwars.advance() once a round's winners are known.
async function settle(roundIdx, round) {
  const r = state.rounds[roundIdx] || { votes: {} };
  if (r.settled) return r.settled;
  const winners = new Set(round.matches.map((m) => m.winner).filter(Boolean));
  const correct = Object.entries(r.votes).filter(([, v]) => winners.has(v.animal)).map(([w]) => w);
  const pool = await poolNow();
  const minPer = Number(config.STONK_PAYOUT_MIN_SOL || 0.001);
  const per = correct.length ? pool.sol / correct.length : 0;
  const rec = { roundIdx, at: Date.now(), votes: Object.keys(r.votes).length, correct: correct.length, accruedSol: +(pool.accruedSol || 0).toFixed(6), poolSol: +pool.sol.toFixed(6), perWalletSol: +per.toFixed(6), mode: 'owed', txs: [] };
  const kp = payoutKeypair();
  // TREASURY MODE (owner 2026-09-10): when a buyback mint is configured the
  // round is settled by treasury.js — claim fees, buy the coin, send half of
  // the buyback to the correct pickers AS THAT COIN. The SOL path below stays
  // for deployments without a token.
  if (config.STONK_BUYBACK_MINT) {
    try {
      const t = await require('./treasury').settleRound(roundIdx, correct);
      rec.mode = t.mode === 'live' ? 'paid' : 'owed';
      rec.treasury = t;
      rec.poolSol = t.buybackSol; rec.perWalletSol = 0; rec.perWalletPro = t.perWinnerPro; rec.currency = 'PRO';
      rec.txs = (t.transfers || []).map((x) => ({ wallet: x.wallet, pro: x.pro, txid: x.txid, error: x.error, owed: !x.txid }));
      if (t.notes && t.notes.length) rec.note = t.notes.join('; ');
    } catch (e) { rec.note = 'treasury failed: ' + String(e.message).slice(0, 120); }
    if (pool.cum != null) state.lastCum = pool.cum;
    r.settled = rec; state.settlements.unshift(rec); if (state.settlements.length > 50) state.settlements.length = 50; save();
    return rec;
  }
  const live = !!config.STONK_PAYOUT_ENABLED && !!kp && per >= minPer && correct.length > 0;
  if (live) {
    rec.mode = 'paid';
    const { SystemProgram, Transaction, PublicKey, sendAndConfirmTransaction } = w3();
    const conn = rpc();
    const lamports = Math.floor(per * 1e9);
    for (const wallet of correct) {
      try {
        const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(wallet), lamports }));
        const sig = await sendAndConfirmTransaction(conn, tx, [kp], { commitment: 'confirmed' });
        rec.txs.push({ wallet, sol: per, txid: sig });
      } catch (e) { rec.txs.push({ wallet, sol: per, error: String(e.message).slice(0, 100) }); }
    }
  } else {
    for (const wallet of correct) rec.txs.push({ wallet, sol: per, owed: true });
    if (correct.length && per < minPer) rec.note = 'per-wallet share below STONK_PAYOUT_MIN_SOL — nothing sent';
    if (!config.STONK_PAYOUT_ENABLED) rec.note = (rec.note ? rec.note + '; ' : '') + 'payouts disabled (STONK_PAYOUT_ENABLED false) — recorded as owed';
  }
  // Advance the fee baseline so next round only pays on NEW accrual, and count
  // what actually left the wallet so payouts never shrink the fee base.
  if (pool.cum != null) state.lastCum = pool.cum;
  state.totalPaidSol = (state.totalPaidSol || 0) + rec.txs.filter((t) => t.txid).reduce((a, t) => a + t.sol, 0);
  r.settled = rec;
  state.settlements.unshift(rec);
  if (state.settlements.length > 50) state.settlements.length = 50;
  save();
  return rec;
}

async function status(wallet) {
  const sw = require('./stonkwars');
  const st = sw.status();
  const idx = st.roundIdx;
  const r = state.rounds[idx] || { votes: {} };
  const tally = {};
  for (const v of Object.values(r.votes)) tally[v.animal] = (tally[v.animal] || 0) + 1;
  const pool = await poolNow();
  const round = st.rounds[idx] || null;
  return {
    open: st.status === 'running' && round && Date.now() < round.startAt,
    locksAt: round ? round.startAt : null, roundIdx: idx, roundName: st.roundName,
    live: round ? [...liveAnimals(round)] : [],
    totalVotes: Object.keys(r.votes).length, tally,
    mine: wallet && r.votes[wallet] ? r.votes[wallet].animal : null,
    pool: { sol: +pool.sol.toFixed(4), pct: pool.pct, walletSol: +pool.walletSol.toFixed(4), address: pool.address, paying: !!config.STONK_PAYOUT_ENABLED && !!payoutKeypair() },
    gate: { minSol: Number(config.STONK_VOTE_MIN_SOL || 0), tokenMint: config.STONK_VOTE_TOKEN_MINT || null, minTokens: Number(config.STONK_VOTE_MIN_TOKENS || 0) },
    settlements: state.settlements.slice(0, 10),
  };
}

function start() { load(); }
module.exports = { start, vote, settle, status, messageFor, onTournamentStart, payoutKeypair };
