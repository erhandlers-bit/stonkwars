// STONK WARS (owner 2026-09-10): 16 animals, single-elimination bracket, one
// hour per match, every match in a round runs at the same time on the same
// live coin feed. Each animal is a paper-trading agent whose "brain" is
// parameterised from its estimated neuron count and known behaviour: how many
// coins it can hold in mind, how fast it reacts, how many positions it can
// juggle, how impulsive it is, how deep its pattern recognition goes, and one
// signature quirk. Same $1,000, same fill model, deterministic per-animal
// randomness — so a match is fair and replayable.
//
// PAPER ONLY. Reads a public Dexscreener feed of fresh coins (src/feed.js);
// never touches a key or sends a transaction.
const fs = require('fs');
const path = require('path');
const config = require('./config');

const STATE_FILE = path.join(__dirname, '..', 'data', 'stonkwars.json');
const IMG_DIR = path.join(__dirname, '..', 'public', 'stonkwars');

// Neuron counts are published estimates (Herculano-Houzel et al. and
// follow-ups); they seed the bracket and scale the brain. Elephants really do
// out-count humans — most of it is cerebellum, which is the joke.
const ANIMALS = [
  { id: 'elephant', name: 'Elephant', emoji: '🐘', neurons: 257e9, brain: { memory: 50, reactionMs: 20000, maxPositions: 4, sizeFrac: 0.15, impulsivity: 0.35, threshold: 0.62, depth: 0.85, stopPct: 0.15, takePct: 0.50, trailPct: 0.25, maxHoldMin: 45, quirk: 'grudge' }, blurb: 'Never forgets a rug. Slow to act, refuses to be fooled twice.' },
  { id: 'orca', name: 'Orca', emoji: '🐋', neurons: 43e9, brain: { memory: 40, reactionMs: 8000, maxPositions: 5, sizeFrac: 0.15, impulsivity: 0.60, threshold: 0.55, depth: 0.90, stopPct: 0.12, takePct: 0.40, trailPct: 0.20, maxHoldMin: 30, quirk: 'hunt' }, blurb: 'Apex pattern-hunter. Chases momentum and strikes fast.' },
  { id: 'gorilla', name: 'Gorilla', emoji: '🦍', neurons: 33e9, brain: { memory: 30, reactionMs: 15000, maxPositions: 3, sizeFrac: 0.25, impulsivity: 0.50, threshold: 0.60, depth: 0.75, stopPct: 0.20, takePct: 0.60, trailPct: 0.30, maxHoldMin: 50, quirk: 'conviction' }, blurb: 'Big positions, holds through the noise. Strength over speed.' },
  { id: 'chimp', name: 'Chimpanzee', emoji: '🐵', neurons: 28e9, brain: { memory: 35, reactionMs: 10000, maxPositions: 5, sizeFrac: 0.12, impulsivity: 0.55, threshold: 0.55, depth: 0.85, stopPct: 0.12, takePct: 0.35, trailPct: 0.20, maxHoldMin: 30, quirk: 'adaptive' }, blurb: 'Learns mid-match: tightens up after a loss, loosens after a win.' },
  { id: 'dolphin', name: 'Dolphin', emoji: '🐬', neurons: 13e9, brain: { memory: 35, reactionMs: 8000, maxPositions: 5, sizeFrac: 0.12, impulsivity: 0.60, threshold: 0.55, depth: 0.85, stopPct: 0.12, takePct: 0.35, trailPct: 0.20, maxHoldMin: 25, quirk: 'echolocate' }, blurb: 'Reads the flow. Bails the moment the volume goes quiet.' },
  { id: 'dog', name: 'Dog', emoji: '🐕', neurons: 2.3e9, brain: { memory: 15, reactionMs: 10000, maxPositions: 4, sizeFrac: 0.15, impulsivity: 0.70, threshold: 0.50, depth: 0.50, stopPct: 0.15, takePct: 0.40, trailPct: 0.25, maxHoldMin: 40, quirk: 'pack' }, blurb: 'Runs with the pack. Buys what the others hold, stays loyal to winners.' },
  { id: 'pig', name: 'Pig', emoji: '🐷', neurons: 2.2e9, brain: { memory: 12, reactionMs: 12000, maxPositions: 4, sizeFrac: 0.25, impulsivity: 0.70, threshold: 0.45, depth: 0.45, stopPct: 0.25, takePct: 1.00, trailPct: 0, maxHoldMin: 60, quirk: 'greedy' }, blurb: 'Wants the whole 2x. No trailing stop. Pigs get fed, hogs get…' },
  { id: 'raccoon', name: 'Raccoon', emoji: '🦝', neurons: 2.1e9, brain: { memory: 15, reactionMs: 9000, maxPositions: 5, sizeFrac: 0.12, impulsivity: 0.75, threshold: 0.45, depth: 0.50, stopPct: 0.15, takePct: 0.30, trailPct: 0.20, maxHoldMin: 25, quirk: 'shiny' }, blurb: 'Loves shiny things. Paid promotions look like treasure to him.' },
  { id: 'parrot', name: 'Parrot', emoji: '🦜', neurons: 1.6e9, brain: { memory: 12, reactionMs: 10000, maxPositions: 4, sizeFrac: 0.12, impulsivity: 0.70, threshold: 0.50, depth: 0.40, stopPct: 0.15, takePct: 0.30, trailPct: 0.20, maxHoldMin: 30, quirk: 'mimic' }, blurb: 'Copies whoever is winning. Original thoughts not included.' },
  { id: 'crow', name: 'Crow', emoji: '🐦‍⬛', neurons: 1.5e9, brain: { memory: 20, reactionMs: 10000, maxPositions: 4, sizeFrac: 0.12, impulsivity: 0.55, threshold: 0.55, depth: 0.70, stopPct: 0.12, takePct: 0.35, trailPct: 0.20, maxHoldMin: 30, quirk: 'tools' }, blurb: 'Uses tools. Small brain, extra indicators, scary accurate.' },
  { id: 'horse', name: 'Horse', emoji: '🐎', neurons: 1.2e9, brain: { memory: 12, reactionMs: 15000, maxPositions: 3, sizeFrac: 0.08, impulsivity: 0.45, threshold: 0.55, depth: 0.50, stopPct: 0.10, takePct: 0.25, trailPct: 0.15, maxHoldMin: 40, quirk: 'steady' }, blurb: 'Small bets, tight stops, never spooked. Boring on purpose.' },
  { id: 'cat', name: 'Cat', emoji: '🐈', neurons: 760e6, brain: { memory: 10, reactionMs: 12000, maxPositions: 3, sizeFrac: 0.12, impulsivity: 0.40, threshold: 0.50, depth: 0.55, stopPct: 0.12, takePct: 0.30, trailPct: 0.20, maxHoldMin: 30, quirk: 'contrarian' }, blurb: 'Does the opposite of the room. Buys what they just sold.' },
  { id: 'octopus', name: 'Octopus', emoji: '🐙', neurons: 500e6, brain: { memory: 16, reactionMs: 8000, maxPositions: 8, sizeFrac: 0.08, impulsivity: 0.65, threshold: 0.50, depth: 0.60, stopPct: 0.15, takePct: 0.30, trailPct: 0.20, maxHoldMin: 30, quirk: 'multi' }, blurb: 'Eight arms, eight positions. Never all-in on anything.' },
  { id: 'rat', name: 'Rat', emoji: '🐀', neurons: 200e6, brain: { memory: 8, reactionMs: 5000, maxPositions: 5, sizeFrac: 0.10, impulsivity: 0.90, threshold: 0.40, depth: 0.35, stopPct: 0.10, takePct: 0.20, trailPct: 0.15, maxHoldMin: 15, quirk: 'twitchy' }, blurb: 'Fastest reaction in the bracket. Thinks later, if at all.' },
  { id: 'goldfish', name: 'Goldfish', emoji: '🐟', neurons: 10e6, brain: { memory: 3, reactionMs: 7000, maxPositions: 3, sizeFrac: 0.20, impulsivity: 0.80, threshold: 0.35, depth: 0.15, stopPct: 0.20, takePct: 0.30, trailPct: 0, maxHoldMin: 20, quirk: 'forget' }, blurb: 'Three-second memory. Forgets it owns a coin. Buys it again.' },
  { id: 'honeybee', name: 'Honeybee', emoji: '🐝', neurons: 1e6, brain: { memory: 4, reactionMs: 6000, maxPositions: 12, sizeFrac: 0.03, impulsivity: 0.85, threshold: 0.40, depth: 0.30, stopPct: 0.10, takePct: 0.08, trailPct: 0, maxHoldMin: 10, quirk: 'swarm' }, blurb: 'A million neurons, a thousand tiny trades. Death by nectar.' },
];
const BY_ID = Object.fromEntries(ANIMALS.map((a) => [a.id, a]));

// ---------- deterministic randomness ----------
function fnv(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function rngFor(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- state ----------
const state = {
  status: 'idle', // idle | running | paused | done
  startedAt: null, roundIdx: -1, rounds: [], champion: null,
  books: {}, feed: [], pausedAt: null, pauseOffsetMs: 0,
};
function load() { try { Object.assign(state, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch { /* fresh */ } }
let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch { /* disk */ } }, 300);
}
const listeners = [];
function onEvent(fn) { listeners.push(fn); }
function event(kind, text, extra) {
  const e = { at: Date.now(), kind, text, ...(extra || {}) };
  state.feed.unshift(e);
  if (state.feed.length > 300) state.feed.length = 300;
  for (const fn of listeners) { try { fn(e, state); } catch { /* a commentator crash never touches the bracket */ } }
}

// ---------- the coin feed (shared, fair) ----------
function feedCoins() {
  try {
    const coins = require('./feed').coins();
    const chains = config.STONK_CHAINS || config.RH_CHAINS || ['robinhood', 'solana', 'base', 'bsc'];
    return coins.filter((c) => c.priceUsd > 0 && c.liqUsd > 0 && (!c.chainId || chains.includes(c.chainId)));
  } catch { return []; }
}

// ---------- fill model (same shape as the RH book: fee + depth impact) ----------
function feeFor(chain) { const m = config.RH_FEE_BY_CHAIN || {}; return m[chain] != null ? m[chain] : 0.015; }
function impactOf(usd, liq) { return liq > 0 ? Math.min(0.5, usd / (liq + usd)) : 0.10; }

// ---------- signals ----------
// Each signal has a "cost" — the pattern depth an animal needs to perceive it.
const SIGNALS = [
  { key: 'momentum', cost: 0.10, w: 1.0, f: (c) => { const g = c.chgH24 || 0; if (g <= 0) return 0.1; if (g > 200) return 0.25; if (g >= 60) return 1; return 0.3 + (g / 60) * 0.7; } },
  { key: 'pool', cost: 0.30, w: 1.2, f: (c) => (c.liqUsd >= 20000 ? 1 : c.liqUsd >= 8000 ? 0.5 : 0) },
  { key: 'boost', cost: 0.40, w: 0.6, f: (c, a) => (c.boosted ? (a.brain.quirk === 'shiny' ? 1 : 0.2) : 0.7) },
  { key: 'churn', cost: 0.50, w: 1.4, f: (c) => { const x = c.liqUsd ? c.volH24 / c.liqUsd : 0; if (x >= 3 && x <= 12) return 1; if (x >= 1 && x < 3) return 0.5; return 0.2; } },
  { key: 'age', cost: 0.60, w: 0.8, f: (c) => { const h = (Date.now() - (c.pairCreatedAt || Date.now())) / 3600000; if (h >= 1 && h <= 12) return 1; if (h < 1) return 0.5; if (h <= 24) return 0.6; return 0.2; } },
  { key: 'mcapLiq', cost: 0.80, w: 0.8, f: (c) => { const r = c.liqUsd ? (c.mcapUsd || 0) / c.liqUsd : 999; return r <= 30 ? 1 : r <= 100 ? 0.5 : 0; } },
];
// Human-readable value of a signal for the commentary / showcase view.
function describe(key, coin) {
  const churn = coin.liqUsd ? coin.volH24 / coin.liqUsd : 0;
  const ageH = (Date.now() - (coin.pairCreatedAt || Date.now())) / 3600000;
  switch (key) {
    case 'momentum': return (coin.chgH24 >= 0 ? '+' : '') + Math.round(coin.chgH24 || 0) + '% today';
    case 'pool': return '$' + Math.round((coin.liqUsd || 0) / 1000) + 'k pool';
    case 'boost': return coin.boosted ? 'paid promo' : 'no promo';
    case 'churn': return churn.toFixed(1) + 'x churn';
    case 'age': return (ageH < 1 ? Math.round(ageH * 60) + 'm' : ageH.toFixed(1) + 'h') + ' old';
    case 'mcapLiq': return 'mcap ' + Math.round(coin.liqUsd ? (coin.mcapUsd || 0) / coin.liqUsd : 0) + 'x pool';
    default: return key;
  }
}

// `out`, if given, is filled with WHY the score came out the way it did —
// which signals this brain could see, what each said, the social nudges and
// the noise. The showcase view reads this to explain every buy.
function score(animal, coin, ctx, out) {
  const b = animal.brain;
  const depth = b.quirk === 'tools' ? Math.max(b.depth, 0.9) : b.depth; // the crow's tools
  let num = 0, den = 0;
  const seen = [], blind = [];
  for (const s of SIGNALS) {
    if (s.cost > depth) { blind.push(s.key); continue; }
    let w = s.w;
    if (b.quirk === 'hunt' && s.key === 'momentum') w *= 2;
    if (b.quirk === 'echolocate' && (s.key === 'churn' || s.key === 'momentum')) w *= 1.5;
    const v = s.f(coin, animal);
    num += w * v; den += w;
    seen.push({ key: s.key, value: +v.toFixed(2), text: describe(s.key, coin), good: v >= 0.6 });
  }
  let sc = den ? num / den : 0.5;
  const nudges = [];
  const holders = ctx.holders[coin.address] || 0;
  if (b.quirk === 'pack' && holders >= 2) { sc += 0.15; nudges.push(holders + ' others hold it — pack instinct'); }
  if (b.quirk === 'contrarian') {
    if (holders >= 2) { sc -= 0.2; nudges.push('too crowded — cat is not impressed'); }
    if (ctx.recentlySold[coin.address]) { sc += 0.2; nudges.push('someone just dumped it — contrarian likes that'); }
  }
  if (b.quirk === 'mimic' && ctx.leaderLastBuy === coin.address) { sc += 0.3; nudges.push('the leader just bought this — parrot copies'); }
  if (b.quirk === 'shiny' && coin.boosted) nudges.push('shiny paid promo — raccoon cannot resist');
  if (b.quirk === 'grudge' && ctx.grudges[animal.id] && ctx.grudges[animal.id][coin.address]) { if (out) out.veto = 'burned by this coin before — never again'; return -1; }
  const noise = (ctx.rng() * 2 - 1) * (1 - depth) * 0.4;
  sc += noise;
  if (out) Object.assign(out, { score: +sc.toFixed(2), signals: seen, blind, nudges, noise: +noise.toFixed(2) });
  return sc;
}

// ---------- books ----------
function newBook(animalId) {
  return { animalId, cashUsd: config.STONK_START_USD || 1000, positions: {}, closed: [], realized: 0, trades: 0, wins: 0, losses: 0, grudges: {}, forgotten: {}, threshAdj: 0, lastTickAt: 0, lastBuy: null };
}
function equityOf(book) { let e = book.cashUsd; for (const p of Object.values(book.positions)) e += p.tokens * (p.priceUsd || p.entryPriceUsd); return e; }
function buy(animal, book, coin, matchId, why) {
  const eq = equityOf(book);
  let usd = Math.min(book.cashUsd, Math.max(10, animal.brain.sizeFrac * eq));
  if (usd < 10) return false;
  const fee = feeFor(coin.chainId), imp = impactOf(usd, coin.liqUsd);
  const tokens = (usd * (1 - fee) * (1 - imp)) / coin.priceUsd;
  book.cashUsd -= usd;
  const existing = book.positions[coin.address];
  if (existing) { // goldfish rebuying what it forgot; averages in
    existing.tokens += tokens; existing.investedUsd += usd; existing.entryPriceUsd = existing.investedUsd / existing.tokens;
  } else {
    book.positions[coin.address] = { address: coin.address, chainId: coin.chainId, symbol: coin.symbol, url: coin.url, tokens, investedUsd: usd, entryPriceUsd: coin.priceUsd, priceUsd: coin.priceUsd, peakPriceUsd: coin.priceUsd, entryLiqUsd: coin.liqUsd, liqUsd: coin.liqUsd, volH24: coin.volH24, openedAt: Date.now() };
  }
  book.trades++; book.lastBuy = coin.address;
  if (why) book.positions[coin.address].why = why;
  // The reason, in words: which signals it could see and what they said.
  const w = why || {};
  const liked = (w.signals || []).filter((s) => s.good).map((s) => s.text);
  const disliked = (w.signals || []).filter((s) => !s.good).map((s) => s.text);
  const reason = [
    liked.length ? 'liked ' + liked.join(', ') : null,
    disliked.length ? 'ignored ' + disliked.join(', ') : null,
    (w.blind || []).length ? 'cannot even perceive ' + w.blind.join('/') : null,
    ...(w.nudges || []),
    w.score != null ? 'score ' + w.score + ' vs threshold ' + w.threshold : null,
  ].filter(Boolean).join(' · ');
  event('buy', animal.emoji + ' ' + animal.name + ' bought $' + coin.symbol + ' for $' + usd.toFixed(0) + (existing ? ' (again — it forgot it already owned it)' : '') + (reason ? ' — ' + reason : ''),
    { animalId: animal.id, matchId, symbol: coin.symbol, usd, chainId: coin.chainId, why: w, url: coin.url });
  return true;
}
function sell(animal, book, pos, frac, reason, matchId) {
  frac = Math.min(1, Math.max(0, frac));
  const tokens = pos.tokens * frac, price = pos.priceUsd || pos.entryPriceUsd;
  const gross = tokens * price;
  const returned = gross * (1 - feeFor(pos.chainId)) * (1 - impactOf(gross, pos.liqUsd || pos.entryLiqUsd));
  const cost = pos.investedUsd * frac;
  const pnl = returned - cost;
  book.cashUsd += returned; book.realized += pnl; book.trades++;
  if (pnl >= 0) book.wins++; else book.losses++;
  book.closed.unshift({ symbol: pos.symbol, address: pos.address, pnlUsd: +pnl.toFixed(2), investedUsd: +cost.toFixed(2), reason, closedAt: Date.now() });
  if (book.closed.length > 60) book.closed.length = 60;
  if (frac >= 1) delete book.positions[pos.address]; else { pos.tokens -= tokens; pos.investedUsd -= cost; }
  if (animal.brain.quirk === 'grudge' && pnl < 0) book.grudges[pos.address] = true;
  if (animal.brain.quirk === 'adaptive') book.threshAdj = Math.max(-0.1, Math.min(0.15, book.threshAdj + (pnl < 0 ? 0.05 : -0.03)));
  const heldMin = Math.round((Date.now() - pos.openedAt) / 60000);
  const movePct = Math.round((price / pos.entryPriceUsd - 1) * 100);
  event('sell', animal.emoji + ' ' + animal.name + ' sold ' + (frac >= 1 ? '' : Math.round(frac * 100) + '% of ') + '$' + pos.symbol + ' — ' + reason + ' (' + (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) + ', ' + (movePct >= 0 ? '+' : '') + movePct + '% after ' + heldMin + 'm)',
    { animalId: animal.id, matchId, symbol: pos.symbol, pnlUsd: pnl, movePct, heldMin, reason, frac, url: pos.url });
}

// ---------- one animal, one tick ----------
function act(animal, book, matchId, ctx, now) {
  const b = animal.brain;
  const rng = ctx.rngs[animal.id];
  ctx.rng = rng;
  // goldfish: forget / remember
  if (b.quirk === 'forget') {
    for (const a of Object.keys(book.positions)) {
      if (!book.forgotten[a] && rng() < 0.25) { book.forgotten[a] = true; event('quirk', '🐟 Goldfish forgot it owns $' + book.positions[a].symbol, { animalId: animal.id, matchId }); }
      else if (book.forgotten[a] && rng() < 0.35) { delete book.forgotten[a]; }
    }
  }
  // manage positions
  for (const pos of Object.values(book.positions)) {
    if (book.forgotten[pos.address]) continue; // unmanaged while forgotten
    const px = pos.priceUsd || pos.entryPriceUsd;
    if (px > pos.peakPriceUsd) pos.peakPriceUsd = px;
    const mult = px / pos.entryPriceUsd;
    const heldMin = (now - pos.openedAt) / 60000;
    if (pos.entryLiqUsd && pos.liqUsd && pos.liqUsd < pos.entryLiqUsd * 0.5 && b.depth >= 0.5) { sell(animal, book, pos, 1, 'pool draining — out', matchId); continue; }
    if (b.quirk === 'echolocate' && pos.liqUsd && pos.volH24 / pos.liqUsd < 1 && heldMin > 5) { sell(animal, book, pos, 1, 'the flow went quiet', matchId); continue; }
    const stop = b.quirk === 'conviction' ? Math.max(b.stopPct, 0.2) : b.stopPct;
    if (mult <= 1 - stop) { sell(animal, book, pos, 1, 'stop -' + Math.round(stop * 100) + '%', matchId); continue; }
    if (b.takePct > 0 && mult >= 1 + b.takePct) { sell(animal, book, pos, b.quirk === 'greedy' ? 1 : 0.5, 'took profit at +' + Math.round(b.takePct * 100) + '%', matchId); if (!book.positions[pos.address]) continue; }
    if (b.trailPct > 0 && pos.peakPriceUsd >= pos.entryPriceUsd * 1.15 && px <= pos.peakPriceUsd * (1 - b.trailPct)) { sell(animal, book, pos, 1, 'trailed out -' + Math.round(b.trailPct * 100) + '% from peak', matchId); continue; }
    const patience = b.quirk === 'pack' && mult > 1 ? b.maxHoldMin * 1.5 : b.maxHoldMin;
    if (heldMin >= patience) { sell(animal, book, pos, 1, 'lost interest after ' + Math.round(heldMin) + 'm', matchId); continue; }
  }
  // consider a buy
  const open = Object.keys(book.positions).length;
  if (open >= b.maxPositions) return;
  const coins = feedCoins().slice(0, b.memory); // what it can hold in mind
  let best = null, bestScore = -1, bestWhy = null;
  ctx.grudges = { [animal.id]: book.grudges };
  for (const c of coins) {
    if (book.positions[c.address] && !book.forgotten[c.address]) continue; // already owns it (and remembers)
    const why = {};
    const s = score(animal, c, ctx, why);
    if (s > bestScore) { bestScore = s; best = c; bestWhy = why; }
  }
  const threshold = b.threshold + (book.threshAdj || 0);
  if (best && bestScore >= threshold) {
    if (rng() < b.impulsivity) buy(animal, book, best, matchId, { ...bestWhy, threshold: +threshold.toFixed(2) });
    else if (rng() < 0.15) event('pass', animal.emoji + ' ' + animal.name + ' eyed $' + best.symbol + ' (score ' + bestWhy.score + ') and… did not pull the trigger', { animalId: animal.id, matchId, symbol: best.symbol });
  }
}

// ---------- prices for held coins (chain-matched, every 15s) ----------
let refreshing = false;
async function refreshPrices() {
  if (refreshing) return; refreshing = true;
  try {
    const wanted = new Map();
    for (const book of Object.values(state.books)) for (const p of Object.values(book.positions)) wanted.set(p.address, p.chainId);
    const addrs = [...wanted.keys()];
    for (let i = 0; i < addrs.length; i += 15) {
      const chunk = addrs.slice(i, i + 15);
      let j; try { j = await (await fetch('https://api.dexscreener.com/latest/dex/tokens/' + chunk.join(','), { signal: AbortSignal.timeout(10000) })).json(); } catch { continue; }
      const best = {};
      for (const p of j.pairs || []) {
        const a = p.baseToken && p.baseToken.address; if (!a) continue;
        const want = wanted.get(a) || wanted.get(a.toLowerCase()); if (!want || p.chainId !== want) continue;
        if (!best[a] || ((p.liquidity && p.liquidity.usd) || 0) > ((best[a].liquidity && best[a].liquidity.usd) || 0)) best[a] = p;
      }
      for (const book of Object.values(state.books)) for (const pos of Object.values(book.positions)) {
        const p = best[pos.address]; if (!p) continue;
        const px = Number(p.priceUsd) || 0; if (!(px > 0)) continue;
        if (pos.priceUsd && px > pos.priceUsd * 8) continue; // two-tick rule, cheap version: ignore an 8x print
        pos.priceUsd = px; pos.liqUsd = (p.liquidity && p.liquidity.usd) || pos.liqUsd; pos.volH24 = (p.volume && p.volume.h24) || pos.volH24;
      }
    }
  } finally { refreshing = false; }
}

// ---------- bracket ----------
const ROUND_NAMES = ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
function seedOrder() { return ANIMALS.slice().sort((a, b) => b.neurons - a.neurons).map((a) => a.id); }
function makeRound(idx, ids, startAt) {
  const dur = config.STONK_MATCH_MS || 3600000;
  const matches = [];
  if (idx === 0) { // 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
    const order = [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]];
    for (const [x, y] of order) matches.push({ id: 'r' + idx + 'm' + matches.length, a: ids[x - 1], b: ids[y - 1] });
  } else {
    for (let i = 0; i < ids.length; i += 2) matches.push({ id: 'r' + idx + 'm' + (i / 2), a: ids[i], b: ids[i + 1] });
  }
  for (const m of matches) { m.startAt = startAt; m.endAt = startAt + dur; m.winner = null; m.finalEq = null; }
  return { idx, name: ROUND_NAMES[idx], matches, startAt, endAt: startAt + dur };
}
function startTournament() {
  Object.assign(state, { status: 'running', startedAt: Date.now(), roundIdx: 0, rounds: [], champion: null, books: {}, feed: [], pauseOffsetMs: 0, pausedAt: null });
  for (const a of ANIMALS) state.books[a.id] = newBook(a.id);
  // Pre-bell window: the first round starts after one intermission so the
  // crowd can lock in their picks (stonkvotes.js) before anyone trades.
  const pre = config.STONK_INTERMISSION_MS || 180000;
  state.rounds.push(makeRound(0, seedOrder(), Date.now() + pre));
  event('round', '🏟️ STONK WARS — picks are OPEN. Round of 16 bell rings in ' + Math.round(pre / 60000) + ' min. 16 brains, $1,000 each, one hour.');
  try { require('./stonkvotes').onTournamentStart().catch(() => {}); } catch { /* optional */ } // snapshot the creator-fee baseline
  save();
}
function settleRound(round) {
  for (const m of round.matches) {
    if (m.winner) continue;
    const ea = equityOf(state.books[m.a]), eb = equityOf(state.books[m.b]);
    m.finalEq = { [m.a]: +ea.toFixed(2), [m.b]: +eb.toFixed(2) };
    m.winner = ea > eb ? m.a : eb > ea ? m.b : (state.books[m.a].realized >= state.books[m.b].realized ? m.a : m.b);
    const w = BY_ID[m.winner], l = BY_ID[m.winner === m.a ? m.b : m.a];
    event('result', w.emoji + ' ' + w.name + ' beats ' + l.emoji + ' ' + l.name + ' — $' + m.finalEq[m.winner].toFixed(0) + ' vs $' + m.finalEq[l.id].toFixed(0), { matchId: m.id, winner: m.winner });
  }
}
function advance() {
  const round = state.rounds[state.roundIdx];
  settleRound(round);
  // Pick 'em settlement: who called the winners, what the pool pays. Runs in
  // the background — a payout hiccup must never stall the bracket.
  try {
    require('./stonkvotes').settle(state.roundIdx, round)
      .then((rec) => { if (rec && rec.votes) event('picks', '🎟️ ' + rec.correct + ' of ' + rec.votes + ' picks called it — ' + (rec.mode === 'paid' ? 'airdropped ' : 'pool ') + rec.poolSol.toFixed(3) + ' SOL' + (rec.correct ? ' (' + rec.perWalletSol.toFixed(4) + ' SOL each)' : '') + (rec.mode === 'owed' ? ' · recorded as owed' : '')); save(); })
      .catch((e) => event('error', 'pick settlement failed: ' + String(e.message).slice(0, 80)));
  } catch { /* votes module optional */ }
  const winners = round.matches.map((m) => m.winner);
  if (winners.length === 1) {
    state.champion = winners[0]; state.status = 'done';
    const c = BY_ID[state.champion];
    event('champion', '🏆 ' + c.emoji + ' ' + c.name.toUpperCase() + ' IS THE STONK WARS CHAMPION — ' + c.neurons.toExponential(1) + ' neurons of pure alpha.');
    save(); return;
  }
  // winners keep their book (cash + open positions) — it is one continuous hour-by-hour run
  const startAt = Date.now() + (config.STONK_INTERMISSION_MS || 180000);
  state.roundIdx++;
  state.rounds.push(makeRound(state.roundIdx, winners, startAt));
  event('round', '⏸️ Intermission. ' + ROUND_NAMES[state.roundIdx] + ' starts in ' + Math.round((config.STONK_INTERMISSION_MS || 180000) / 60000) + ' min.');
  save();
}

// ---------- master loop ----------
let lastRefresh = 0;
const rngCache = {};
async function tick() {
  if (state.status !== 'running') return;
  const now = Date.now();
  const round = state.rounds[state.roundIdx];
  if (!round) return;
  if (now >= round.endAt) { advance(); return; }
  if (now < round.startAt) return; // intermission
  if (now - lastRefresh > 15000) { lastRefresh = now; refreshPrices().catch(() => {}); }
  // shared context: who holds what, who leads, what was just sold
  const holders = {}, recentlySold = {};
  let leader = null, leaderEq = -1;
  const live = new Set(); for (const m of round.matches) { live.add(m.a); live.add(m.b); }
  for (const id of live) {
    const book = state.books[id];
    for (const a of Object.keys(book.positions)) holders[a] = (holders[a] || 0) + 1;
    for (const c of book.closed.slice(0, 3)) if (now - c.closedAt < 120000) recentlySold[c.address] = true;
    const eq = equityOf(book); if (eq > leaderEq) { leaderEq = eq; leader = id; }
  }
  const ctx = { holders, recentlySold, leaderLastBuy: leader ? state.books[leader].lastBuy : null, rngs: {} };
  for (const m of round.matches) {
    for (const id of [m.a, m.b]) {
      const animal = BY_ID[id], book = state.books[id];
      if (now - (book.lastTickAt || 0) < animal.brain.reactionMs) continue;
      book.lastTickAt = now;
      const key = id + ':' + m.id;
      if (!rngCache[key]) rngCache[key] = rngFor(fnv(key));
      ctx.rngs[id] = rngCache[key];
      try { act(animal, book, m.id, ctx, now); } catch (e) { event('error', animal.name + ' brain fault: ' + String(e.message).slice(0, 80)); }
    }
  }
  save();
}

// ---------- controls + status ----------
function reset() { Object.assign(state, { status: 'idle', startedAt: null, roundIdx: -1, rounds: [], champion: null, books: {}, feed: [], pausedAt: null, pauseOffsetMs: 0 }); save(); return { ok: true }; }
function pause() { if (state.status !== 'running') return { ok: false }; state.status = 'paused'; state.pausedAt = Date.now(); save(); return { ok: true }; }
function resume() {
  if (state.status !== 'paused') return { ok: false };
  const off = Date.now() - state.pausedAt; // shift every clock so nobody loses time
  for (const r of state.rounds) { r.startAt += off; r.endAt += off; for (const m of r.matches) { m.startAt += off; m.endAt += off; } }
  state.status = 'running'; state.pausedAt = null; save(); return { ok: true };
}
function imageFor(id) { try { return fs.existsSync(path.join(IMG_DIR, id + '.png')) ? '/stonkwars/' + id + '.png' : (fs.existsSync(path.join(IMG_DIR, id + '.jpg')) ? '/stonkwars/' + id + '.jpg' : null); } catch { return null; } }
function status() {
  const now = Date.now();
  const round = state.rounds[state.roundIdx] || null;
  const books = {};
  for (const [id, b] of Object.entries(state.books)) {
    const eq = equityOf(b);
    books[id] = { equity: +eq.toFixed(2), cash: +b.cashUsd.toFixed(2), realized: +b.realized.toFixed(2), trades: b.trades, wins: b.wins, losses: b.losses,
      positions: Object.values(b.positions).map((p) => ({ symbol: p.symbol, chainId: p.chainId, url: p.url, investedUsd: +p.investedUsd.toFixed(2), valueUsd: +(p.tokens * (p.priceUsd || p.entryPriceUsd)).toFixed(2), pnlPct: +(((p.priceUsd || p.entryPriceUsd) / p.entryPriceUsd - 1) * 100).toFixed(1), forgotten: !!b.forgotten[p.address] })),
      closed: b.closed.slice(0, 8) };
  }
  return {
    status: state.status, startedAt: state.startedAt, now, champion: state.champion,
    roundIdx: state.roundIdx, roundName: round ? round.name : null, roundStartAt: round ? round.startAt : null, roundEndAt: round ? round.endAt : null,
    rounds: state.rounds, books, feed: state.feed.slice(0, 80),
    animals: ANIMALS.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji, neurons: a.neurons, brain: a.brain, blurb: a.blurb, image: imageFor(a.id), seed: seedOrder().indexOf(a.id) + 1 })),
    config: { matchMs: config.STONK_MATCH_MS || 3600000, intermissionMs: config.STONK_INTERMISSION_MS || 180000, startUsd: config.STONK_START_USD || 1000, feedCoins: feedCoins().length },
    // the live market every animal is choosing from — for the showcase ticker
    market: feedCoins().slice(0, 24).map((c) => ({ symbol: c.symbol, chainId: c.chainId, priceUsd: c.priceUsd, liqUsd: Math.round(c.liqUsd), volH24: Math.round(c.volH24), chgH24: Math.round(c.chgH24 || 0), ageMin: Math.round((now - c.pairCreatedAt) / 60000), boosted: !!c.boosted, url: c.url })),
  };
}
function start() {
  load();
  try { require('./stonkvotes').start(); } catch (e) { console.log('[stonkwars] picks module not loaded: ' + e.message); }
  try { fs.mkdirSync(IMG_DIR, { recursive: true }); } catch { /* exists */ }
  setInterval(() => tick().catch(() => {}), 1000).unref();
  console.log('[stonkwars] PAPER · 16-animal bracket · ' + state.status + (state.status === 'running' ? ' (' + (ROUND_NAMES[state.roundIdx] || '?') + ')' : ''));
}

module.exports = { start, status, startTournament, reset, pause, resume, ANIMALS, onEvent, equityOf, BY_ID, _state: state };
