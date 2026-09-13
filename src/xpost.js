// STONK WARS -> X auto-poster (owner 2026-09-13): after every match, a card showing BOTH contestants with their final
// stats and the winner crowned, plus a short post; a champion card when a tournament ends.
//
// It only posts when the X app keys are in .env:  X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
// (an X developer app with Read and Write, OAuth 1.0a user context). Without them it runs DRY: the card PNG and the
// post text are written to data/xposts/ so the wording can be approved first. Knobs in config.js:
//   STONK_XPOST            'final' (the final only: both finalists + champion crowned, ~4 posts/day — fits X's free tier)
//                          | 'sf' (semifinals + final, ~12/day) | 'match' (every match, ~70/day — needs a paid tier)
//                          | 'champion' (champion portrait only) | 'off'
//   STONK_XPOST_MONTHLY_CAP posts per calendar month before it stops itself (X free tier is small; raise on Basic)
//   STONK_XPOST_SITE       the link in every post
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const config = require('./config');

const OUT = path.join(__dirname, '..', 'data', 'xposts');
const IMG = path.join(__dirname, '..', 'public', 'stonkwars');
const LOG = path.join(OUT, 'log.json');
const FONT = "fontfile='C\\:/Windows/Fonts/arialbd.ttf'";
const FONT_REG = "fontfile='C\\:/Windows/Fonts/arial.ttf'";

let log = { posted: {}, months: {}, last: null };
try { log = Object.assign(log, JSON.parse(fs.readFileSync(LOG, 'utf8'))); } catch { /* fresh */ }
function save() { try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(LOG, JSON.stringify(log, null, 2)); } catch { /* disk */ } }

function keys() {
  const k = { key: process.env.X_API_KEY, secret: process.env.X_API_SECRET, token: process.env.X_ACCESS_TOKEN, tokenSecret: process.env.X_ACCESS_SECRET };
  return k.key && k.secret && k.token && k.tokenSecret ? k : null;
}
function mode() { return String(config.STONK_XPOST || 'final'); }
// which matches get a card: the final (default, free tier), semis + final, or every match
function wanted(round) { const n = (round && round.matches && round.matches.length) || 0; const m = mode(); return m === 'match' || (m === 'sf' && n <= 2 && n > 0) || (m === 'final' && n === 1); }
function live() { return mode() !== 'off' && !!keys(); }
function site() { return String(config.STONK_XPOST_SITE || 'https://stonkwars.org'); }
function monthKey() { const d = new Date(); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
function underCap() { const cap = Number(config.STONK_XPOST_MONTHLY_CAP || 450); return (log.months[monthKey()] || 0) < cap; }

// ---------- card rendering (ffmpeg, args array — no shell quoting) ----------
function esc(t) { return String(t).replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/%/g, '%%').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\[/g, '\\[').replace(/\]/g, '\\]'); }
function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function signed(n) { return (n >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US'); }
function portrait(id) { const p = path.join(IMG, id + '.png'); return fs.existsSync(p) ? p : null; }
function run(args) { return new Promise((res, rej) => execFile('ffmpeg', ['-y', '-loglevel', 'error', ...args], { windowsHide: true }, (e, out, err) => (e ? rej(new Error(String(err || e.message).slice(-300))) : res()))); }

// two tiles side by side, stats under each, a gold WINNER banner across the top of the winner's portrait
async function matchCard(title, a, b, winnerId, file) {
  const TW = 800, TH = 450, LABEL = 200, TOP = 120, BOT = 130;
  const pa = portrait(a.id), pb = portrait(b.id);
  const args = [];
  const inputs = [];
  for (const [t, p] of [[a, pa], [b, pb]]) { if (p) { args.push('-i', p); inputs.push('file'); } else { args.push('-f', 'lavfi', '-i', 'color=c=#161c2e:s=' + TW + 'x' + TH); inputs.push('color'); } }
  const tile = (i, t) => {
    const won = t.id === winnerId;
    const start = Number(config.STONK_START_USD || 1000);
    const pnl = t.equity - start;
    let f = `[${i}:v]scale=${TW}:${TH}:force_original_aspect_ratio=increase,crop=${TW}:${TH},pad=${TW}:${TH + LABEL}:0:0:color=#0e1220`;
    if (won) f += `,drawbox=x=0:y=0:w=${TW}:h=64:color=#f5c542:t=fill,drawtext=${FONT}:text='WINNER':fontcolor=#07090f:fontsize=40:x=(w-text_w)/2:y=12`;
    else f += `,drawbox=x=0:y=0:w=${TW}:h=${TH}:color=#000000@0.35:t=fill`;
    f += `,drawtext=${FONT}:text='${esc(t.name.toUpperCase())}':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=${TH + 16}`;
    f += `,drawtext=${FONT}:text='${esc(money(t.equity) + '   ' + signed(pnl))}':fontcolor=${pnl >= 0 ? '#5fe89b' : '#ff6b6b'}:fontsize=40:x=(w-text_w)/2:y=${TH + 74}`;
    f += `,drawtext=${FONT_REG}:text='${esc(t.trades + ' trades  ·  ' + t.wins + 'W / ' + t.losses + 'L  ·  ' + t.statText)}':fontcolor=#7d88a6:fontsize=28:x=(w-text_w)/2:y=${TH + 132}`;
    return f + `[t${i}]`;
  };
  const parts = [tile(0, a), tile(1, b), `[t0][t1]hstack=inputs=2[g]`,
    `[g]pad=${TW * 2}:${TOP + TH + LABEL + BOT}:0:${TOP}:color=#07090f` +
    `,drawtext=${FONT}:text='${esc(title)}':fontcolor=#f5c542:fontsize=46:x=(w-text_w)/2:y=36` +
    `,drawtext=${FONT}:text='VS':fontcolor=#ff3fa4:fontsize=64:x=(w-text_w)/2:y=${TOP + TH / 2 - 32}` +
    `,drawtext=${FONT_REG}:text='${esc(site().replace(/^https?:\/\//, '') + '  ·  free picks  ·  airdrops every match')}':fontcolor=#7d88a6:fontsize=32:x=(w-text_w)/2:y=${TOP + TH + LABEL + 44}[out]`];
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-frames:v', '1', file);
  await run(args);
  return file;
}

async function championCard(title, c, file) {
  const p = portrait(c.id);
  const args = p ? ['-i', p] : ['-f', 'lavfi', '-i', 'color=c=#161c2e:s=1600x900'];
  const f = `[0:v]scale=1600:900:force_original_aspect_ratio=increase,crop=1600:900,drawbox=x=0:y=0:w=1600:h=120:color=#f5c542:t=fill` +
    `,drawtext=${FONT}:text='${esc(title)}':fontcolor=#07090f:fontsize=54:x=(w-text_w)/2:y=30` +
    `,drawbox=x=0:y=700:w=1600:h=200:color=#07090f@0.85:t=fill` +
    `,drawtext=${FONT}:text='${esc(c.name.toUpperCase() + '  ·  ' + money(c.equity))}':fontcolor=white:fontsize=60:x=(w-text_w)/2:y=724` +
    `,drawtext=${FONT_REG}:text='${esc(c.statText + '  ·  ' + site().replace(/^https?:\/\//, ''))}':fontcolor=#f5c542:fontsize=34:x=(w-text_w)/2:y=810[out]`;
  args.push('-filter_complex', f, '-map', '[out]', '-frames:v', '1', file);
  await run(args);
  return file;
}

// ---------- OAuth 1.0a + X API ----------
function enc(s) { return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
function oauthHeader(method, url, k, extra) {
  const p = Object.assign({ oauth_consumer_key: k.key, oauth_nonce: crypto.randomBytes(16).toString('hex'), oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_token: k.token, oauth_version: '1.0' }, extra || {});
  const base = [method.toUpperCase(), enc(url), enc(Object.keys(p).sort().map((x) => enc(x) + '=' + enc(p[x])).join('&'))].join('&');
  p.oauth_signature = crypto.createHmac('sha1', enc(k.secret) + '&' + enc(k.tokenSecret)).update(base).digest('base64');
  return 'OAuth ' + Object.keys(p).filter((x) => x.startsWith('oauth_')).sort().map((x) => enc(x) + '="' + enc(p[x]) + '"').join(', ');
}
async function uploadMedia(k, file) {
  const url = 'https://upload.twitter.com/1.1/media/upload.json';
  const fd = new FormData();
  fd.append('media', new Blob([fs.readFileSync(file)], { type: 'image/png' }), 'card.png');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: oauthHeader('POST', url, k) }, body: fd, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.media_id_string) throw new Error('media upload ' + r.status + ' ' + JSON.stringify(j).slice(0, 160));
  return j.media_id_string;
}
async function createPost(k, text, mediaId) {
  const url = 'https://api.x.com/2/tweets';
  const body = { text };
  if (mediaId) body.media = { media_ids: [mediaId] };
  const r = await fetch(url, { method: 'POST', headers: { Authorization: oauthHeader('POST', url, k), 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.data) throw new Error('post ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  return j.data.id;
}

// ---------- the posts ----------
function trader(state, id) {
  const sw = require('./stonkwars');
  const a = sw.BY_ID[id] || { id, name: id, statText: '' };
  const b = state.books[id] || { trades: 0, wins: 0, losses: 0 };
  return { id, name: a.name, statText: a.statText || '', trades: b.trades || 0, wins: b.wins || 0, losses: b.losses || 0, equity: 0 };
}
async function publish(key, text, cardFile) {
  const rec = { at: Date.now(), text, card: cardFile, mode: live() ? 'live' : 'dry' };
  if (live() && underCap()) {
    try {
      let mediaId = null;
      try { mediaId = await uploadMedia(keys(), cardFile); } catch (e) { rec.mediaError = String(e.message).slice(0, 160); } // text still goes out without the card
      rec.id = await createPost(keys(), text, mediaId);
      log.months[monthKey()] = (log.months[monthKey()] || 0) + 1;
    } catch (e) { rec.error = String(e.message).slice(0, 200); }
  } else if (live()) rec.error = 'monthly cap reached (' + config.STONK_XPOST_MONTHLY_CAP + ')';
  log.posted[key] = rec; log.last = rec; save();
  try { fs.writeFileSync(cardFile.replace(/\.png$/, '.txt'), text); } catch { /* disk */ }
  console.log('[xpost] ' + rec.mode + (rec.id ? ' posted ' + rec.id : rec.error ? ' FAILED ' + rec.error : ' saved ' + path.basename(cardFile)) + ': ' + text.split('\n')[0]);
  return rec;
}

async function onMatch(state, m) {
  if (mode() === 'off' || mode() === 'champion' || !m || !m.winner || !m.finalEq) return null;
  const round = state.rounds[state.roundIdx] || { matches: [m], name: '' };
  if (!wanted(round)) return null;
  const key = (state.startedAt || 0) + ':' + m.id;
  if (log.posted[key]) return log.posted[key];
  log.posted[key] = { at: Date.now(), pending: true }; // single flight
  try {
    const a = trader(state, m.a), b = trader(state, m.b);
    a.equity = m.finalEq[m.a]; b.equity = m.finalEq[m.b];
    const w = m.winner === m.a ? a : b, l = m.winner === m.a ? b : a;
    const idx = round.matches.indexOf(m) + 1, count = round.matches.length;
    const isFinal = count === 1;
    const title = isFinal ? 'STONK WARS  ·  THE FINAL  ·  CHAMPION' : 'STONK WARS  ·  ' + String(round.name || '').toUpperCase() + '  ·  MATCH ' + idx + '/' + count;
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, String(state.startedAt || 0) + '-' + m.id + '.png');
    await matchCard(title, a, b, m.winner, file);
    const start = Number(config.STONK_START_USD || 1000);
    const next = round.matches.find((x) => !x.winner);
    const sw = require('./stonkwars');
    let text = (isFinal ? '🏆 ' + w.name.toUpperCase() + ' is the STONK WARS champion — beats ' + l.name + ' in the final' : '🏆 ' + w.name + ' beats ' + l.name + ' — ' + (round.name || 'STONK WARS') + ', match ' + idx + '/' + count) + '\n' +
      w.name + ': ' + money(w.equity) + ' (' + signed(w.equity - start) + ') · ' + w.trades + ' trades · ' + w.wins + 'W/' + w.losses + 'L\n' +
      l.name + ': ' + money(l.equity) + ' (' + signed(l.equity - start) + ') · ' + l.trades + ' trades · ' + l.wins + 'W/' + l.losses + 'L\n' +
      (next ? 'Up next: ' + (sw.BY_ID[next.a] || {}).name + ' vs ' + (sw.BY_ID[next.b] || {}).name + '. ' : '') + 'Free picks: ' + site();
    if (text.length > 280) text = text.replace(/\nUp next: [^\n]*\. Free picks/, '\nFree picks');
    return await publish(key, text, file);
  } catch (e) { delete log.posted[key]; console.log('[xpost] match card failed: ' + String(e.message).slice(0, 200)); return null; }
}

async function onChampion(state, id) {
  if (mode() !== 'champion' || !id) return null; // the other modes already crown the champion on the final's card
  const key = (state.startedAt || 0) + ':champion';
  if (log.posted[key]) return log.posted[key];
  log.posted[key] = { at: Date.now(), pending: true };
  try {
    const c = trader(state, id);
    c.equity = require('./stonkwars').equityOf(state.books[id]);
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, String(state.startedAt || 0) + '-champion.png');
    await championCard('STONK WARS CHAMPION', c, file);
    const text = '🏆 ' + c.name.toUpperCase() + ' is the STONK WARS champion — ' + money(c.equity) + ' from $' + Number(config.STONK_START_USD || 1000).toLocaleString('en-US') + ', ' + c.trades + ' trades, ' + c.wins + 'W/' + c.losses + 'L.\nNext tournament starts in minutes. Free picks: ' + site();
    return await publish(key, text, file);
  } catch (e) { delete log.posted[key]; console.log('[xpost] champion card failed: ' + String(e.message).slice(0, 200)); return null; }
}

function status() { return { mode: mode(), live: live(), keys: !!keys(), month: monthKey(), postedThisMonth: log.months[monthKey()] || 0, cap: Number(config.STONK_XPOST_MONTHLY_CAP || 450), last: log.last }; }

module.exports = { onMatch, onChampion, status, matchCard, championCard };
