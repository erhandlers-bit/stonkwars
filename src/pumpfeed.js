// PUMP.FUN LIVE LAUNCHES — the ticker on the showcase view. Streams every new
// token creation from PumpPortal's free websocket (no key). Display only: the
// animals trade the Dexscreener fresh-coin market (feed.js), because a
// bonding-curve token seconds old has no pool depth to price a fill against.
const URL = 'wss://pumpportal.fun/api/data';
const KEEP = 60;

let ws = null;
let launches = [];   // newest first
let connectedAt = 0;
let backoff = 2000;

function connect() {
  if (typeof WebSocket === 'undefined') { console.log('[pumpfeed] no WebSocket in this Node — skipping'); return; }
  try {
    ws = new WebSocket(URL);
  } catch (e) { console.log('[pumpfeed] connect failed: ' + e.message); return schedule(); }
  ws.onopen = () => {
    connectedAt = Date.now(); backoff = 2000;
    ws.send(JSON.stringify({ method: 'subscribeNewToken' }));
    console.log('[pumpfeed] streaming pump.fun launches');
  };
  ws.onmessage = (m) => {
    try {
      const j = JSON.parse(typeof m.data === 'string' ? m.data : String(m.data));
      if (!j.mint || j.txType !== 'create') return;
      launches.unshift({
        at: Date.now(), mint: j.mint, name: j.name || '', symbol: j.symbol || '',
        creator: j.traderPublicKey || '', devBuySol: Number(j.solAmount) || 0,
        mcapSol: Number(j.marketCapSol) || 0, uri: j.uri || '',
        url: 'https://pump.fun/coin/' + j.mint,
      });
      if (launches.length > KEEP) launches.length = KEEP;
    } catch { /* not for us */ }
  };
  ws.onclose = () => { ws = null; schedule(); };
  ws.onerror = () => { try { ws && ws.close(); } catch { /* */ } };
}
function schedule() {
  setTimeout(connect, backoff);
  backoff = Math.min(60000, backoff * 2);
}

function start() { connect(); }
function status() {
  return { connected: !!ws && ws.readyState === 1, since: connectedAt, launches: launches.slice(0, 40) };
}
module.exports = { start, status };
