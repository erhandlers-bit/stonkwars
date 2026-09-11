// Offline test of the bracket pick 'em: a throwaway Solana keypair signs the
// exact message the page signs, and vote() must accept a full set of picks,
// reject tampered/foreign/stale signatures, reject picks after the bell, and
// settle a round in dry-run "owed" mode with one share per correct pick.
process.chdir(__dirname + '/..');
const crypto = require('crypto');
const { Keypair } = require('@solana/web3.js');
// fake tournament state so this needs no running server and no real bracket
const fakeRound = { name: 'Round of 16', startAt: Date.now() + 120000, endAt: Date.now() + 3720000, matches: [
  { id: 'r0m0', a: 'elephant', b: 'honeybee', winner: null }, { id: 'r0m1', a: 'goldfish', b: 'rat', winner: null }, { id: 'r0m2', a: 'dog', b: 'parrot', winner: null }] };
const fake = { status: 'running', roundIdx: 0, roundName: 'Round of 16', rounds: [fakeRound], preview: null };
require.cache[require.resolve('../src/stonkwars')] = { id: 'x', filename: 'x', loaded: true, exports: { status: () => fake } };
const config = require('../src/config');
config.STONK_BUYBACK_MINT = ''; // exercise the SOL "owed" path, not the treasury
config.STONK_HOLD_MINT = ''; config.STONK_HOLD_MIN_USD = 0; config.STONK_HOLD_MIN_TOKENS = 0; // no RPC in an offline test
config.STONK_SETTLE_PER_MATCH = false; // this file exercises the round-level settlement path
const votes = require('../src/stonkvotes');
const kp = Keypair.generate();
const wallet = kp.publicKey.toBase58();
function sign(msg) {
  // ed25519 sign with node crypto from the raw 32-byte seed (PKCS8 wrap)
  const seed = Buffer.from(kp.secretKey.slice(0, 32));
  const key = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
  return crypto.sign(null, Buffer.from(msg, 'utf8'), key).toString('base64');
}
let pass = 0, fail = 0;
const ok = (name, cond, detail) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + name.padEnd(50) + (detail || '')); cond ? pass++ : fail++; };
(async () => {
  const ts = Date.now();
  const picks = { r0m0: 'elephant', r0m1: 'rat', r0m2: 'dog' };
  const good = await votes.vote({ wallet, picks, round: 0, ts, signature: sign(votes.messageFor(wallet, 0, picks, ts)) });
  ok('valid signed pick set accepted', good.ok === true && good.count === 3, JSON.stringify(good));
  const tampered = await votes.vote({ wallet, picks: { r0m0: 'honeybee', r0m1: 'rat', r0m2: 'dog' }, round: 0, ts, signature: sign(votes.messageFor(wallet, 0, picks, ts)) });
  ok('signature for different picks rejected', tampered.ok === false, tampered.reason);
  const wrongWallet = await votes.vote({ wallet: Keypair.generate().publicKey.toBase58(), picks, round: 0, ts, signature: sign(votes.messageFor(wallet, 0, picks, ts)) });
  ok('signature from another wallet rejected', wrongWallet.ok === false, wrongWallet.reason);
  const stale = await votes.vote({ wallet, picks, round: 0, ts: ts - 10 * 60000, signature: sign(votes.messageFor(wallet, 0, picks, ts - 10 * 60000)) });
  ok('10-minute-old signature rejected', stale.ok === false, stale.reason);
  const notIn = await votes.vote({ wallet, picks: { r0m0: 'dog' }, round: 0, ts, signature: sign(votes.messageFor(wallet, 0, { r0m0: 'dog' }, ts)) });
  ok('animal not in that match rejected', notIn.ok === false, notIn.reason);
  const partial = await votes.vote({ wallet, picks: { r0m1: 'goldfish' }, round: 0, ts, signature: sign(votes.messageFor(wallet, 0, { r0m1: 'goldfish' }, ts)) });
  ok('partial re-pick accepted and replaces the set', partial.ok === true && partial.changed === true, JSON.stringify(partial));
  // put the full set back for settlement
  await votes.vote({ wallet, picks, round: 0, ts, signature: sign(votes.messageFor(wallet, 0, picks, ts)) });
  const st = await votes.status(wallet);
  ok('status shows my picks + per-match tally', st.mine && st.mine.r0m0 === 'elephant' && st.tally.r0m0.elephant === 1 && st.matches.length === 3, JSON.stringify({ mine: st.mine, tally: st.tally }));
  ok('status exposes the hold gate', st.holdGate && 'minUsd' in st.holdGate, JSON.stringify(st.holdGate));
  // idle preview: picks open on the seeded round 0 before the tournament starts
  fake.status = 'idle'; fake.roundIdx = -1; fake.rounds = []; fake.preview = fakeRound;
  const pre = await votes.status(wallet);
  ok('idle tournament: preview round is open for picks', pre.open === true && pre.preview === true && pre.roundIdx === 0, JSON.stringify({ open: pre.open, preview: pre.preview }));
  fake.status = 'running'; fake.roundIdx = 0; fake.rounds = [fakeRound]; fake.preview = null;
  // 20 minutes into every match: locked (a pick 5 minutes in would still be fine)
  fakeRound.startAt = Date.now() - 25 * 60000;
  for (const m of fakeRound.matches) m.startAt = fakeRound.startAt;
  const locked = await votes.vote({ wallet, picks, round: 0, ts: Date.now(), signature: sign(votes.messageFor(wallet, 0, picks, Date.now())) });
  ok('pick 20+ minutes into the match rejected', locked.ok === false, locked.reason);
  // settle: elephant + rat won (2 correct), parrot won (1 wrong) -> 2 shares
  fakeRound.matches[0].winner = 'elephant'; fakeRound.matches[1].winner = 'rat'; fakeRound.matches[2].winner = 'parrot';
  const rec = await votes.settle(0, fakeRound);
  ok('settlement counts one share per correct pick', rec.correct === 1 && rec.shares === 2 && rec.txs.length === 1 && rec.txs[0].shares === 2, JSON.stringify({ correct: rec.correct, shares: rec.shares, mode: rec.mode }));
  ok('dry-run records the payout as owed (no keys, no sends)', rec.mode === 'owed' && rec.txs[0].owed === true, rec.note);
  const led = votes.ledger();
  ok('ledger lists the wallet with its amount', led.rows.length === 1 && led.rows[0].wallet === wallet && led.wallets.length === 1, JSON.stringify(led.rows[0]));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  // scrub the throwaway state so a real tournament starts clean
  try { require('fs').unlinkSync(__dirname + '/../data/stonkvotes.json'); } catch { /* none */ }
  process.exit(fail ? 1 : 0);
})();
