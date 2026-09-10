// STONK WARS server. Serves the stream page and a small JSON API.
//
// Public, read-only:  GET /api/stonkwars          bracket, books, tape
//                     GET /api/stonkwars/votes    pick 'em state (+ ?wallet=)
// Public, one write:  POST /api/stonkwars/vote    a wallet-signed pick (moves no money)
// Admin only:         POST /api/stonkwars/{start,pause,resume,reset}
//   Admin calls need header x-admin-token = ADMIN_TOKEN from .env. If no
//   ADMIN_TOKEN is set, admin calls are accepted from localhost only.
const path = require('path');
const express = require('express');
const config = require('./config');
const stonkwars = require('./stonkwars');
const votes = require('./stonkvotes');
const chat = require('./chat');
const feed = require('./feed');

const app = express();
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function isAdmin(req) {
  const want = process.env.ADMIN_TOKEN;
  if (want) return req.get('x-admin-token') === want;
  const ip = req.ip || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

app.get('/api/stonkwars', (_req, res) => res.json(stonkwars.status()));
// SHOWCASE feeds: commentary lines (poll with ?since=<last id>, optional
// &match=<matchId>), voice for one line, and the pump.fun launch ticker.
app.get('/api/stonkwars/commentary', (req, res) => {
  const c = require('./commentary');
  res.json({ ...c.status(), lines: c.since(Number(req.query.since) || 0, req.query.match ? String(req.query.match) : null) });
});
app.get('/api/tts/:id', async (req, res) => {
  const c = require('./commentary');
  const l = c.line(req.params.id);
  if (!l) return res.status(404).end();
  try { const buf = await c.tts(l); res.set('Content-Type', 'audio/mpeg'); res.set('Cache-Control', 'public, max-age=86400'); res.send(buf); }
  catch (e) { res.status(503).json({ error: 'tts unavailable: ' + String(e.message).slice(0, 80) }); }
});
app.get('/api/stonkwars/pumpfeed', (_req, res) => res.json(require('./pumpfeed').status()));
app.get('/api/stonkwars/treasury', async (_req, res) => res.json(await require('./treasury').status()));
app.get('/api/stonkwars/votes', async (req, res) => res.json(await votes.status(String(req.query.wallet || ''))));
app.get('/api/stonkwars/payouts', (_req, res) => res.json(votes.ledger()));
app.post('/api/stonkwars/devlogin', express.json({ limit: '2kb' }), (req, res) => res.json(chat.devLogin(req.body, ((req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '').toString()))));
app.get('/api/stonkwars/chat', (req, res) => res.json({ messages: chat.since(req.query.since), seq: chat.status().seq }));
app.post('/api/stonkwars/chat', express.json({ limit: '2kb' }), (req, res) => res.json(chat.post(req.body, ((req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '').toString()), { trusted: isAdmin(req) }))); // admin/localhost posts are the owner: DEV
app.post('/api/stonkwars/vote', express.json({ limit: '4kb' }), async (req, res) => res.json(await votes.vote(req.body)));

for (const action of ['start', 'pause', 'resume', 'reset']) {
  app.post('/api/stonkwars/' + action, (req, res) => {
    if (!isAdmin(req)) return res.status(403).json({ ok: false, reason: 'admin only' });
    if (action === 'start') {
      if (stonkwars.status().status === 'running') return res.json({ ok: false, reason: 'already running' });
      stonkwars.startTournament();
      return res.json({ ok: true });
    }
    res.json(stonkwars[action]());
  });
}

app.use(express.static(path.join(__dirname, '..', 'public')));

function start() {
  feed.start();
  stonkwars.start();
  try { require('./commentary').start(); } catch (e) { console.log('[commentary] not started: ' + e.message); }
  try { require('./desk').start(); } catch (e) { console.log('[desk] not started: ' + e.message); }             // two autonomous Claude agents at the desk
  try { require('./pumpfeed').start(); } catch (e) { console.log('[pumpfeed] not started: ' + e.message); }
  try { require('./treasury').start(); } catch (e) { console.log('[treasury] not started: ' + e.message); }
  app.listen(config.PORT, '0.0.0.0', () => {
    console.log('[stonkwars] http://localhost:' + config.PORT + '  (admin: ' + (process.env.ADMIN_TOKEN ? 'token' : 'localhost only') + ')');
  });
}

if (require.main === module) {
  // load .env without a dependency
  try {
    const fs = require('fs');
    for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env is fine — paper mode needs none */ }
  start();
}

module.exports = { app, start };
