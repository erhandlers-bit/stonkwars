// TREASURY — what happens to the creator fees at the end of every round.
// Owner 2026-09-10: "instantly claim all my creator fees. then 50% of the
// fees after each match buys my proscrim coin. then 50% of my buyback is
// split and given to the winners."
//
// Per round:
//   1. CLAIM   all unclaimed pump.fun creator fees into the dev wallet
//   2. BUYBACK swap STONK_BUYBACK_PCT (50%) of what was claimed into the coin
//   3. AIRDROP send STONK_WINNER_SHARE (50%) of the the coin bought, split evenly,
//              to every wallet that picked a winner this round
//   4. the rest of the the coin and the rest of the SOL stay in the dev wallet
//
// LIVE only when STONK_TREASURY_ENABLED is true AND STONK_PAYOUT_KEY holds the
// dev wallet's key — the claim has to be signed by the token creator, so this
// cannot run from a separate payout wallet. Otherwise it DRY-RUNS: reads the
// vault, gets a real Jupiter quote, and records exactly what it would have
// done. Nothing here ever takes anything from a voter.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const STATE_FILE = path.join(__dirname, '..', 'data', 'treasury.json');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const JUP = 'https://lite-api.jup.ag/swap/v1';

const state = { rounds: [], totals: { claimedSol: 0, boughtPro: 0, sentPro: 0, winnersPaid: 0 } };
function load() { try { Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch { /* fresh */ } }
function save() { try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch { /* disk */ } }

let web3 = null;
function w3() { if (!web3) web3 = require('@solana/web3.js'); return web3; }
function rpc() { return new (w3().Connection)(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed'); }
function keypair() { try { return require('./stonkvotes').payoutKeypair(); } catch { return null; } }
function devPubkey() { const kp = keypair(); return kp ? kp.publicKey : (config.STONK_PAYOUT_WALLET ? new (w3().PublicKey)(config.STONK_PAYOUT_WALLET) : null); }
function isLive() { return !!config.STONK_TREASURY_ENABLED && !!keypair(); }

function creatorVault(dev) {
  const { PublicKey } = w3();
  return PublicKey.findProgramAddressSync([Buffer.from('creator-vault'), dev.toBytes()], new PublicKey(PUMP_PROGRAM))[0];
}
function ata(owner, mint) {
  const { PublicKey } = w3();
  return PublicKey.findProgramAddressSync([owner.toBytes(), new PublicKey(TOKEN_PROGRAM).toBytes(), mint.toBytes()], new PublicKey(ATA_PROGRAM))[0];
}
async function tokenBalance(conn, owner, mint) {
  try { const r = await conn.getTokenAccountBalance(ata(owner, mint)); return BigInt(r.value.amount); } catch { return 0n; }
}
async function confirmSig(conn, sig) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
}

// ---- 1. CLAIM ----
async function claim(conn, kp) {
  const { VersionedTransaction } = w3();
  const r = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: kp.publicKey.toBase58(), action: 'collectCreatorFee', priorityFee: Number(config.STONK_CLAIM_PRIORITY_FEE || 0.00005) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error('claim tx build failed: ' + r.status + ' ' + (await r.text()).slice(0, 100));
  const tx = VersionedTransaction.deserialize(Buffer.from(await r.arrayBuffer()));
  tx.sign([kp]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmSig(conn, sig);
  return sig;
}

// ---- 2. BUYBACK ----
async function quote(lamports) {
  const mint = config.STONK_BUYBACK_MINT;
  const q = await (await fetch(JUP + '/quote?inputMint=' + SOL_MINT + '&outputMint=' + mint + '&amount=' + lamports + '&slippageBps=' + (config.STONK_SWAP_SLIPPAGE_BPS || 300), { signal: AbortSignal.timeout(20000) })).json();
  if (!q.outAmount) throw new Error('no route: ' + JSON.stringify(q).slice(0, 120));
  return q;
}
async function buyback(conn, kp, lamports) {
  const { VersionedTransaction, PublicKey } = w3();
  const mint = new PublicKey(config.STONK_BUYBACK_MINT);
  const before = await tokenBalance(conn, kp.publicKey, mint);
  const q = await quote(lamports);
  const s = await (await fetch(JUP + '/swap', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quoteResponse: q, userPublicKey: kp.publicKey.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: 'auto' }),
    signal: AbortSignal.timeout(20000),
  })).json();
  if (!s.swapTransaction) throw new Error('swap build failed: ' + JSON.stringify(s).slice(0, 120));
  const tx = VersionedTransaction.deserialize(Buffer.from(s.swapTransaction, 'base64'));
  tx.sign([kp]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmSig(conn, sig);
  const after = await tokenBalance(conn, kp.publicKey, mint);
  return { sig, received: after - before, quotedOut: BigInt(q.outAmount) };
}

// ---- 3. AIRDROP the coin ----
function u64le(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }
async function airdrop(conn, kp, winners, perShare) {
  const { PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } = w3();
  const mint = new PublicKey(config.STONK_BUYBACK_MINT);
  const src = ata(kp.publicKey, mint);
  const out = [];
  for (let i = 0; i < winners.length; i += 5) { // ATA creates are chunky; 5 per tx stays under limits
    const batch = winners.slice(i, i + 5);
    const tx = new Transaction();
    const amounts = {};
    for (const e of batch) {
      const w = typeof e === 'string' ? e : e.wallet; const shares = typeof e === 'string' ? 1 : (e.shares || 1);
      const amt = perShare * BigInt(shares); amounts[w] = { amt, shares };
      let owner; try { owner = new PublicKey(w); } catch { out.push({ wallet: w, shares, error: 'bad address' }); continue; }
      const dest = ata(owner, mint);
      // create the recipient's token account if missing (idempotent: instruction data [1])
      tx.add(new TransactionInstruction({ programId: new PublicKey(ATA_PROGRAM), data: Buffer.from([1]), keys: [
        { pubkey: kp.publicKey, isSigner: true, isWritable: true }, { pubkey: dest, isSigner: false, isWritable: true },
        { pubkey: owner, isSigner: false, isWritable: false }, { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: new PublicKey(TOKEN_PROGRAM), isSigner: false, isWritable: false },
      ] }));
      // SPL transfer (instruction 3)
      tx.add(new TransactionInstruction({ programId: new PublicKey(TOKEN_PROGRAM), data: Buffer.concat([Buffer.from([3]), u64le(amt)]), keys: [
        { pubkey: src, isSigner: false, isWritable: true }, { pubkey: dest, isSigner: false, isWritable: true }, { pubkey: kp.publicKey, isSigner: true, isWritable: false },
      ] }));
    }
    if (!tx.instructions.length) continue;
    try {
      const sig = await sendAndConfirmTransaction(conn, tx, [kp], { commitment: 'confirmed' });
      for (const e of batch) { const w = typeof e === 'string' ? e : e.wallet; if (amounts[w]) out.push({ wallet: w, shares: amounts[w].shares, pro: Number(amounts[w].amt) / 1e6, txid: sig }); }
    } catch (e) {
      for (const en of batch) { const w = typeof en === 'string' ? en : en.wallet; if (amounts[w]) out.push({ wallet: w, shares: amounts[w].shares, pro: Number(amounts[w].amt) / 1e6, error: String(e.message).slice(0, 100) }); }
    }
  }
  return out;
}

// ---- the round ----
async function settleRound(roundIdx, winners) {
  const conn = rpc();
  const dev = devPubkey();
  const rec = { roundIdx, at: Date.now(), mode: isLive() ? 'live' : 'dry', winners: winners.length, claimedSol: 0, buybackSol: 0, boughtPro: 0, toWinnersPro: 0, perWinnerPro: 0, txs: {}, transfers: [], notes: [] };
  if (!dev || !config.STONK_BUYBACK_MINT) { rec.notes.push('no dev wallet / buyback mint configured'); return finish(rec); }
  const vault = creatorVault(dev);
  let unclaimed = (await conn.getBalance(vault)) / 1e9;
  if (process.env.STONK_TREASURY_SIMULATE_SOL && !isLive()) unclaimed = Number(process.env.STONK_TREASURY_SIMULATE_SOL); // rehearsal only
  const minSol = Number(config.STONK_TREASURY_MIN_SOL || 0.01);
  if (unclaimed < minSol) { rec.notes.push('unclaimed fees ' + unclaimed.toFixed(4) + ' SOL below minimum ' + minSol); return finish(rec); }
  rec.claimedSol = +unclaimed.toFixed(6);
  const buybackLamports = Math.floor(unclaimed * 1e9 * Number(config.STONK_BUYBACK_PCT ?? 0.5));
  rec.buybackSol = +(buybackLamports / 1e9).toFixed(6);
  try {
    if (isLive()) {
      const kp = keypair();
      rec.txs.claim = await claim(conn, kp);
      const b = await buyback(conn, kp, buybackLamports);
      rec.txs.swap = b.sig;
      rec.boughtPro = Number(b.received) / 1e6;
      const toWinners = (b.received * BigInt(Math.round(Number(config.STONK_WINNER_SHARE ?? 0.5) * 10000))) / 10000n;
      rec.toWinnersPro = Number(toWinners) / 1e6;
      if (winners.length && toWinners > 0n) {
        const totalShares = BigInt(winners.reduce((a, w) => a + (typeof w === 'string' ? 1 : (w.shares || 1)), 0) || 1);
        const per = toWinners / totalShares; // one share per correct pick
        rec.perSharePro = Number(per) / 1e6; rec.perWinnerPro = rec.perSharePro;
        rec.transfers = await airdrop(conn, kp, winners, per);
      } else rec.notes.push(winners.length ? 'nothing to send' : 'no correct pickers this round — the the coin stays in the dev wallet');
    } else {
      const q = await quote(buybackLamports);
      rec.boughtPro = Number(q.outAmount) / 1e6;
      rec.toWinnersPro = rec.boughtPro * Number(config.STONK_WINNER_SHARE ?? 0.5);
      const totalShares = winners.reduce((a, w) => a + (typeof w === 'string' ? 1 : (w.shares || 1)), 0);
      rec.perSharePro = totalShares ? rec.toWinnersPro / totalShares : 0; rec.perWinnerPro = rec.perSharePro;
      rec.transfers = winners.map((w) => { const shares = typeof w === 'string' ? 1 : (w.shares || 1); return { wallet: typeof w === 'string' ? w : w.wallet, shares, pro: rec.perSharePro * shares, owed: true }; });
      rec.notes.push('DRY RUN — would claim ' + rec.claimedSol + ' SOL, buy ~' + Math.round(rec.boughtPro).toLocaleString() + ' PRO with ' + rec.buybackSol + ' SOL, send ' + Math.round(rec.toWinnersPro).toLocaleString() + ' PRO to ' + winners.length + ' winners');
    }
  } catch (e) { rec.notes.push('FAILED: ' + String(e.message).slice(0, 160)); }
  return finish(rec);
}
function finish(rec) {
  state.rounds.unshift(rec); if (state.rounds.length > 40) state.rounds.length = 40;
  if (rec.mode === 'live') {
    state.totals.claimedSol += rec.claimedSol; state.totals.boughtPro += rec.boughtPro;
    state.totals.sentPro += rec.transfers.filter((t) => t.txid).reduce((a, t) => a + t.pro, 0);
    state.totals.winnersPaid += rec.transfers.filter((t) => t.txid).length;
  }
  save();
  return rec;
}

async function status() {
  let unclaimed = null, dev = null;
  try { const d = devPubkey(); if (d) { dev = d.toBase58(); unclaimed = (await rpc().getBalance(creatorVault(d))) / 1e9; } } catch { /* rpc */ }
  return {
    live: isLive(), dev, unclaimedSol: unclaimed == null ? null : +unclaimed.toFixed(4),
    buybackPct: Number(config.STONK_BUYBACK_PCT ?? 0.5), winnerShare: Number(config.STONK_WINNER_SHARE ?? 0.5), mint: config.STONK_BUYBACK_MINT || null,
    totals: state.totals, rounds: state.rounds.slice(0, 8),
  };
}
function start() { load(); }
module.exports = { start, settleRound, status, quote };
