// STONK WARS PICK 'EM (owner 2026-09-10): free-to-enter bracket picks, prize
// funded by the owner ("winners of each round get airdropped 25% of my
// creator fees instantly").
//
// Legal shape, deliberately: entry is FREE (no consideration), the prize is
// the owner's own money, so this is a sweepstakes-style promotion, not a
// betting pool. Nothing here ever takes funds from a voter.
//
// Mechanics (owner 2026-09-10, "vote on each winner"): the bracket is on the
// page before the bell. For the open round a wallet picks a winner for EVERY
// match (or as many as it likes) and locks the whole set with ONE Phantom
// signature. Picks stay open while the tournament is idle (round 1 preview)
// and during each intermission; they lock at the bell. When the round
// settles, every correct pick is one share of the round pool.
//
// PAYOUT GATE (owner 2026-09-10): "to win a payout they need to hold at least
// $10 worth of the stonkwars coin and vote". At settlement each correct
// picker's wallet is checked for STONK_HOLD_MIN_USD of STONK_HOLD_MINT (the
// coin); wallets below it are listed as ineligible and receive nothing.
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
// The exact string the wallet signs. Includes every pick + round + a timestamp
// so a captured signature cannot be replayed for a different set of picks.
function picksLine(picks) { return Object.keys(picks).sort().map((k) => k + '=' + picks[k]).join(' '); }
function messageFor(wallet, roundIdx, picks, ts) {
  return 'STONK WARS picks\nround: ' + roundIdx + '\npicks: ' + picksLine(picks) + '\nwallet: ' + wallet + '\nts: ' + ts;
}

// ---- eligibility to PICK (sybil brake; both gates default OFF) ----
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
      const held = await tokensHeld(conn, pk, mint);
      if (held < minTok) return { ok: false, reason: 'wallet needs at least ' + minTok + ' tokens to pick' };
    }
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'could not verify eligibility (' + String(e.message).slice(0, 60) + ')' }; }
}
async function tokensHeld(conn, pk, mint) {
  const res = await conn.getParsedTokenAccountsByOwner(pk, { mint: new (w3().PublicKey)(mint) });
  let held = 0;
  for (const a of res.value) held += Number(a.account.data.parsed.info.tokenAmount.uiAmount || 0);
  return held;
}

// ---- eligibility to be PAID: hold >= STONK_HOLD_MIN_USD of the coin ----
function holdMint() { return config.STONK_HOLD_MINT || config.STONK_BUYBACK_MINT || ''; }
// what the site calls the coin: Dexscreener's ticker once the mint is set, else the configured placeholder
function coinInfo() { const mint = config.STONK_BUYBACK_MINT || holdMint() || null; const live = mint && priceCache.mint === mint ? priceCache.symbol : ''; return { mint, symbol: live || config.STONK_COIN_SYMBOL || 'COIN' }; }
function holdMinUsd() { return Number(config.STONK_HOLD_MIN_USD || 0); }
function holdMinTokens() { return Number(config.STONK_HOLD_MIN_TOKENS || 0); }
const priceCache = { at: 0, mint: null, usd: 0, symbol: '' };
async function coinPrice() {
  const mint = holdMint();
  if (!mint) return { usd: 0, symbol: '' };
  if (priceCache.mint === mint && Date.now() - priceCache.at < 60_000) return priceCache;
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + mint, { signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    const p = (j.pairs || []).filter((x) => x.priceUsd).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (p) Object.assign(priceCache, { at: Date.now(), mint, usd: Number(p.priceUsd), symbol: (p.baseToken && p.baseToken.symbol) || '' });
  } catch { /* keep the last price */ }
  return priceCache;
}
const holdCache = {}; // wallet -> { at, tokens, usd }
async function holding(wallet, fresh) {
  const mint = holdMint();
  if (!mint) return { tokens: 0, usd: 0, price: 0, eligible: true, gated: false };
  const c = holdCache[wallet];
  if (!fresh && c && Date.now() - c.at < 60_000) return c;
  const price = await coinPrice();
  let tokens = 0;
  try { tokens = await tokensHeld(rpc(), new (w3().PublicKey)(wallet), mint); } catch { if (c) return c; }
  const usd = tokens * (price.usd || 0);
  const out = { at: Date.now(), tokens, usd: +usd.toFixed(2), price: price.usd, symbol: price.symbol, eligible: (holdMinTokens() ? tokens >= holdMinTokens() : true) && (holdMinUsd() ? usd >= holdMinUsd() : true), gated: holdMinUsd() > 0 || holdMinTokens() > 0 };
  holdCache[wallet] = out;
  return out;
}

// ---- rounds: which one is open for picks right now ----
// Idle tournament: the seeded round-of-16 preview is open (picks carry into
// the real round 0). Running: the current round, until its bell.
function openRound(st) {
  if (st.status === 'idle' && st.preview) return { idx: 0, round: st.preview, open: true, preview: true, locksAt: null };
  const round = st.rounds && st.rounds[st.roundIdx];
  if (st.status === 'running' && round) return { idx: st.roundIdx, round, open: Date.now() < round.startAt, preview: false, locksAt: round.startAt };
  return { idx: st.roundIdx, round: round || null, open: false, preview: false, locksAt: round ? round.startAt : null };
}
// picks stored as { matchId: animalId }; a pre-2026-09-10 single-animal vote maps onto the match it belongs to
function picksOf(v, round) {
  if (v.picks) return v.picks;
  const out = {};
  if (v.animal && round) for (const m of round.matches) if (m.a === v.animal || m.b === v.animal) out[m.id] = v.animal;
  return out;
}

async function vote(body) {
  const sw = require('./stonkwars');
  const st = sw.status();
  const { wallet, ts, signature } = body || {};
  const roundIdx = Number(body && body.round);
  const o = openRound(st);
  if (!o.round) return { ok: false, reason: 'no tournament yet' };
  if (roundIdx !== o.idx) return { ok: false, reason: 'that round is not open' };
  if (!o.open) return { ok: false, reason: 'picks are locked — the bell already rang' };
  const picks = body && body.picks && typeof body.picks === 'object' ? body.picks : null;
  if (!picks || !Object.keys(picks).length) return { ok: false, reason: 'pick at least one winner' };
  const byId = {}; for (const m of o.round.matches) byId[m.id] = m;
  for (const [mid, animal] of Object.entries(picks)) {
    const m = byId[mid];
    if (!m) return { ok: false, reason: 'unknown match ' + mid };
    if (animal !== m.a && animal !== m.b) return { ok: false, reason: 'that animal is not in match ' + mid };
  }
  if (typeof wallet !== 'string' || wallet.length < 32) return { ok: false, reason: 'bad wallet' };
  const t = Number(ts);
  if (!(t > 0) || Math.abs(Date.now() - t) > 5 * 60_000) return { ok: false, reason: 'stale signature — try again' };
  if (!verifySig(wallet, messageFor(wallet, roundIdx, picks, t), signature)) return { ok: false, reason: 'signature does not verify' };
  const el = await eligible(wallet);
  if (!el.ok) return el;
  const r = (state.rounds[roundIdx] = state.rounds[roundIdx] || { votes: {} });
  const prev = r.votes[wallet];
  r.votes[wallet] = { picks, at: Date.now(), sig: signature };
  save();
  return { ok: true, picks, count: Object.keys(picks).length, changed: !!prev };
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
  // picks made on the idle preview carry into the real round 0; settled rounds
  // belong to the previous tournament and must not count again
  for (const k of Object.keys(state.rounds)) if (state.rounds[k] && state.rounds[k].settled) delete state.rounds[k];
  save();
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
// Every correct pick is one share; the wallet must also pass the hold gate.
async function settle(roundIdx, round) {
  const r = state.rounds[roundIdx] || { votes: {} };
  if (r.settled) return r.settled;
  const winnerOf = {}; for (const m of round.matches) if (m.winner) winnerOf[m.id] = m.winner;
  const shares = [];
  for (const [wallet, v] of Object.entries(r.votes)) {
    const p = picksOf(v, round);
    const n = Object.keys(p).filter((mid) => winnerOf[mid] && p[mid] === winnerOf[mid]).length;
    if (n > 0) shares.push({ wallet, shares: n });
  }
  const ineligible = [];
  const winners = [];
  for (const s of shares) {
    const h = await holding(s.wallet, true);
    if (h.gated && !h.eligible) ineligible.push({ wallet: s.wallet, shares: s.shares, holdUsd: h.usd });
    else winners.push(s);
  }
  const totalShares = winners.reduce((a, w) => a + w.shares, 0);
  const pool = await poolNow();
  const minPer = Number(config.STONK_PAYOUT_MIN_SOL || 0.001);
  const perShare = totalShares ? pool.sol / totalShares : 0;
  const rec = { roundIdx, at: Date.now(), votes: Object.keys(r.votes).length, correct: winners.length, shares: totalShares, ineligible,
    holdGate: { mint: holdMint() || null, minUsd: holdMinUsd() },
    accruedSol: +(pool.accruedSol || 0).toFixed(6), poolSol: +pool.sol.toFixed(6), perShareSol: +perShare.toFixed(6), perWalletSol: +perShare.toFixed(6), mode: 'owed', txs: [] };
  const kp = payoutKeypair();
  // TREASURY MODE (owner 2026-09-10): when a buyback mint is configured the
  // round is settled by treasury.js — claim fees, buy the coin, send half of
  // the buyback to the correct pickers AS THAT COIN, weighted by shares.
  if (config.STONK_BUYBACK_MINT) {
    try {
      const t = await require('./treasury').settleRound(roundIdx, winners);
      rec.mode = t.mode === 'live' ? 'paid' : 'owed';
      rec.treasury = t;
      rec.poolSol = t.buybackSol; rec.perWalletSol = 0; rec.perSharePro = t.perSharePro; rec.perWalletPro = t.perWinnerPro; rec.currency = 'COIN';
      rec.txs = (t.transfers || []).map((x) => ({ wallet: x.wallet, shares: x.shares, pro: x.pro, txid: x.txid, error: x.error, owed: !x.txid }));
      if (t.notes && t.notes.length) rec.note = t.notes.join('; ');
    } catch (e) { rec.note = 'treasury failed: ' + String(e.message).slice(0, 120); }
    if (pool.cum != null) state.lastCum = pool.cum;
    r.settled = rec; state.settlements.unshift(rec); if (state.settlements.length > 50) state.settlements.length = 50; save();
    return rec;
  }
  const live = !!config.STONK_PAYOUT_ENABLED && !!kp && perShare >= minPer && winners.length > 0;
  if (live) {
    rec.mode = 'paid';
    const { SystemProgram, Transaction, PublicKey, sendAndConfirmTransaction } = w3();
    const conn = rpc();
    for (const w of winners) {
      const sol = perShare * w.shares;
      try {
        const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(w.wallet), lamports: Math.floor(sol * 1e9) }));
        const sig = await sendAndConfirmTransaction(conn, tx, [kp], { commitment: 'confirmed' });
        rec.txs.push({ wallet: w.wallet, shares: w.shares, sol, txid: sig });
      } catch (e) { rec.txs.push({ wallet: w.wallet, shares: w.shares, sol, error: String(e.message).slice(0, 100) }); }
    }
  } else {
    for (const w of winners) rec.txs.push({ wallet: w.wallet, shares: w.shares, sol: perShare * w.shares, owed: true });
    if (winners.length && perShare < minPer) rec.note = 'per-share below STONK_PAYOUT_MIN_SOL — nothing sent';
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

// ---- public ledger: every wallet ever paid (or owed), with amounts ----
function ledger() {
  const rows = [];
  for (const s of state.settlements) {
    for (const t of s.txs || []) {
      rows.push({ round: s.roundIdx, at: s.at, wallet: t.wallet, shares: t.shares || 1,
        amount: t.pro != null ? t.pro : (t.sol || 0), currency: t.pro != null ? 'COIN' : 'SOL',
        txid: t.txid || null, status: t.txid ? 'paid' : (t.error ? 'failed' : 'owed'), error: t.error || null });
    }
  }
  const totals = {};
  for (const r of rows) { const k = r.wallet + '|' + r.currency; totals[k] = totals[k] || { wallet: r.wallet, currency: r.currency, paid: 0, owed: 0, rounds: 0 }; totals[k].rounds++; if (r.status === 'paid') totals[k].paid += r.amount; else if (r.status === 'owed') totals[k].owed += r.amount; }
  return { coin: coinInfo(), rows, wallets: Object.values(totals).sort((a, b) => (b.paid + b.owed) - (a.paid + a.owed)), settlements: state.settlements.map((s) => ({ roundIdx: s.roundIdx, at: s.at, votes: s.votes, correct: s.correct, shares: s.shares, mode: s.mode, poolSol: s.poolSol, currency: s.currency || 'SOL', toWinnersPro: s.treasury ? s.treasury.toWinnersPro : undefined, ineligible: (s.ineligible || []).length, note: s.note })) };
}

async function status(wallet) {
  const sw = require('./stonkwars');
  const st = sw.status();
  const o = openRound(st);
  const idx = o.idx;
  const r = state.rounds[idx] || { votes: {} };
  const tally = {};
  for (const v of Object.values(r.votes)) for (const [mid, a] of Object.entries(picksOf(v, o.round))) { tally[mid] = tally[mid] || {}; tally[mid][a] = (tally[mid][a] || 0) + 1; }
  const pool = await poolNow();
  const mine = wallet && r.votes[wallet] ? picksOf(r.votes[wallet], o.round) : null;
  let myHold = null;
  if (wallet && holdMint()) { try { myHold = await holding(wallet, false); } catch { myHold = null; } }
  const price = holdMint() ? await coinPrice() : { usd: 0, symbol: '' };
  return {
    open: o.open, preview: o.preview,
    locksAt: o.locksAt, roundIdx: idx, roundName: o.round ? (o.round.name || st.roundName) : st.roundName,
    matches: o.round ? o.round.matches.map((m) => ({ id: m.id, a: m.a, b: m.b, winner: m.winner || null })) : [],
    totalVotes: Object.keys(r.votes).length, tally,
    mine,
    pool: { sol: +pool.sol.toFixed(4), pct: pool.pct, walletSol: +pool.walletSol.toFixed(4), address: pool.address, paying: !!config.STONK_PAYOUT_ENABLED && !!payoutKeypair() },
    gate: { minSol: Number(config.STONK_VOTE_MIN_SOL || 0), tokenMint: config.STONK_VOTE_TOKEN_MINT || null, minTokens: Number(config.STONK_VOTE_MIN_TOKENS || 0) },
    coin: coinInfo(),
    holdGate: { mint: holdMint() || null, minUsd: holdMinUsd(), minTokens: holdMinTokens(), symbol: price.symbol || coinInfo().symbol, priceUsd: price.usd || 0 },
    myHold,
    settlements: state.settlements.slice(0, 10),
  };
}

function start() { load(); }
module.exports = { start, vote, settle, status, ledger, messageFor, onTournamentStart, payoutKeypair, holding, coinInfo };
