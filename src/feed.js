// FRESH-COIN FEED. The shared, public market every animal trades against.
// Pulls Dexscreener's latest token profiles + paid boosts, keeps the chains in
// config.STONK_CHAINS, resolves each token to its deepest pair ON ITS OWN
// CHAIN, and keeps the youngest 50 pairs under 48h old.
//
// Fairness is the point: every brain sees the same list at the same time;
// they differ only in how much of it they can hold in mind and what they do.
const config = require('./config');

const POLL_MS = Number(process.env.FEED_POLL_MS) || 60_000;
const KEEP = 50;
let coins = [];
let polling = false;
let lastPollAt = 0;

async function fetchJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  return r.json();
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const chains = config.STONK_CHAINS || ['solana', 'base', 'bsc'];
    const wanted = new Map(); // address -> { chainId, boosted }
    for (const [url, isBoost] of [
      ['https://api.dexscreener.com/token-profiles/latest/v1', false],
      ['https://api.dexscreener.com/token-boosts/latest/v1', true],
    ]) {
      try {
        const j = await fetchJson(url);
        for (const e of (Array.isArray(j) ? j : [])) {
          if (!e.tokenAddress || !chains.includes(e.chainId)) continue;
          const prev = wanted.get(e.tokenAddress) || { chainId: e.chainId, boosted: false };
          wanted.set(e.tokenAddress, { chainId: e.chainId, boosted: prev.boosted || isBoost });
        }
      } catch { /* feed nap — try next poll */ }
    }
    const list = [...wanted.keys()];
    const fresh = new Map(coins.map((c) => [c.address, c]));
    const now = Date.now();
    for (let i = 0; i < list.length; i += 15) {
      const chunk = list.slice(i, i + 15);
      let j;
      try { j = await fetchJson('https://api.dexscreener.com/latest/dex/tokens/' + chunk.join(',')); } catch { continue; }
      const best = {};
      for (const p of j.pairs || []) {
        const a = p.baseToken && p.baseToken.address;
        if (!a) continue;
        const meta = wanted.get(a);
        // CHAIN-MATCHED: the same address can exist on several chains. Only the
        // pair on the chain the feed listed it for counts.
        if (!meta || p.chainId !== meta.chainId) continue;
        if (!best[a] || ((p.liquidity && p.liquidity.usd) || 0) > ((best[a].liquidity && best[a].liquidity.usd) || 0)) best[a] = p;
      }
      for (const addr of chunk) {
        const p = best[addr];
        if (!p || !p.pairCreatedAt) continue;
        const meta = wanted.get(addr);
        fresh.set(addr, {
          address: addr, pairAddress: p.pairAddress, chainId: p.chainId,
          symbol: (p.baseToken && p.baseToken.symbol) || addr.slice(0, 6),
          name: (p.baseToken && p.baseToken.name) || '',
          priceUsd: Number(p.priceUsd) || 0, mcapUsd: p.marketCap || p.fdv || 0,
          liqUsd: (p.liquidity && p.liquidity.usd) || 0,
          volH24: (p.volume && p.volume.h24) || 0,
          chgH24: (p.priceChange && p.priceChange.h24) || 0,
          pairCreatedAt: p.pairCreatedAt, boosted: !!(meta && meta.boosted),
          url: 'https://dexscreener.com/' + p.chainId + '/' + p.pairAddress,
        });
      }
    }
    coins = [...fresh.values()]
      .filter((c) => (now - c.pairCreatedAt) / 3600_000 <= 48)
      .sort((a, b) => b.pairCreatedAt - a.pairCreatedAt)
      .slice(0, KEEP);
    lastPollAt = now;
  } finally { polling = false; }
}

function start() {
  poll().catch(() => {});
  setInterval(() => poll().catch(() => {}), POLL_MS).unref();
}

module.exports = { start, coins: () => coins, lastPollAt: () => lastPollAt };
