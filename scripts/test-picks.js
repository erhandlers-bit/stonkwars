// Offline test of the pick 'em: a throwaway Solana keypair signs the exact
// message the page signs, and vote() must accept it, reject a tampered one,
// reject a locked round, and settle a round in dry-run "owed" mode.
process.chdir(__dirname + '/..');
const crypto = require('crypto');
const { Keypair } = require('@solana/web3.js');
// fake tournament state so this needs no running server and no real bracket
const fakeRound = { startAt: Date.now() + 120000, endAt: Date.now() + 3720000, matches: [{ a: 'elephant', b: 'honeybee', winner: null }, { a: 'goldfish', b: 'rat', winner: null }] };
require.cache[require.resolve('../src/stonkwars')] = { id: 'x', filename: 'x', loaded: true, exports: { status: () => ({ status: 'running', roundIdx: 0, roundName: 'Round of 16', rounds: [fakeRound] }) } };
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
const ok = (name, cond, detail) => { console.log((cond ? '  PASS  ' : '  FAIL  ') + name.padEnd(46) + (detail || '')); cond ? pass++ : fail++; };
(async () => {
  const ts = Date.now();
  const good = await votes.vote({ wallet, animal: 'elephant', round: 0, ts, signature: sign(votes.messageFor(wallet, 0, 'elephant', ts)) });
  ok('valid signed pick accepted', good.ok === true, JSON.stringify(good));
  const tampered = await votes.vote({ wallet, animal: 'honeybee', round: 0, ts, signature: sign(votes.messageFor(wallet, 0, 'elephant', ts)) });
  ok('signature for a different animal rejected', tampered.ok === false, tampered.reason);
  const wrongWallet = await votes.vote({ wallet: Keypair.generate().publicKey.toBase58(), animal: 'elephant', round: 0, ts, signature: sign(votes.messageFor(wallet, 0, 'elephant', ts)) });
  ok('signature from another wallet rejected', wrongWallet.ok === false, wrongWallet.reason);
  const stale = await votes.vote({ wallet, animal: 'elephant', round: 0, ts: ts - 10 * 60000, signature: sign(votes.messageFor(wallet, 0, 'elephant', ts - 10 * 60000)) });
  ok('10-minute-old signature rejected', stale.ok === false, stale.reason);
  const notLive = await votes.vote({ wallet, animal: 'orca', round: 0, ts, signature: sign(votes.messageFor(wallet, 0, 'orca', ts)) });
  ok('animal not in this round rejected', notLive.ok === false, notLive.reason);
  const change = await votes.vote({ wallet, animal: 'goldfish', round: 0, ts: ts + 1, signature: sign(votes.messageFor(wallet, 0, 'goldfish', ts + 1)) });
  ok('changing a pick before the bell allowed', change.ok === true && change.changed === true, JSON.stringify(change));
  const st = await votes.status(wallet);
  ok('status shows my pick + tally', st.mine === 'goldfish' && st.tally.goldfish === 1 && st.totalVotes === 1, JSON.stringify({ mine: st.mine, tally: st.tally, open: st.open }));
  fakeRound.startAt = Date.now() - 1000; // bell rings
  const locked = await votes.vote({ wallet, animal: 'rat', round: 0, ts: Date.now(), signature: sign(votes.messageFor(wallet, 0, 'rat', Date.now())) });
  ok('pick after the bell rejected', locked.ok === false, locked.reason);
  fakeRound.matches[0].winner = 'elephant'; fakeRound.matches[1].winner = 'goldfish';
  const rec = await votes.settle(0, fakeRound);
  ok('settlement runs in dry-run "owed" mode', rec.mode === 'owed' && rec.correct === 1 && rec.txs.length === 1 && rec.txs[0].owed === true, JSON.stringify({ mode: rec.mode, correct: rec.correct, pool: rec.poolSol, note: rec.note }));
  ok('nothing was sent (no payout key, payouts disabled)', !rec.txs.some((t) => t.txid));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
