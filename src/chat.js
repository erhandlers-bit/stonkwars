// STONK WARS STREAM CHAT (owner 2026-09-10): "the commentators read the chat
// and interact with it in funny back-and-forth banter".
//
// A tiny in-memory chat for the stream page. Anyone can post with a display
// name (no wallet). The desk (commentary.js) reads what came in since it last
// answered and talks back, by name, on air — the reply lands here too, so the
// chat shows the conversation. Nothing here is persisted or trusted: text is
// stripped of tags and links, rate-limited per viewer, and the commentators
// are told chat is untrusted input.
const MAX = 300;
const msgs = [];
let seq = 0;
let lastAnswered = 0;
const lastByIp = {};
const lastByName = {};

function clean(s, n) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/https?:\/\/\S+/gi, '[link]').replace(/[\u0000-\u001f\u007f\ufffd]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}
function push(m) { msgs.push(m); if (msgs.length > MAX) msgs.shift(); return m; }

// opts.trusted = the request came through the owner's own dashboard (local app / admin); a matching
// STONK_CHAT_DEV_KEY in the body does the same from anywhere. Either way the owner posts as DEV.
const DEV = 'DEV';
function post(body, ip, opts) {
  const key = process.env.STONK_CHAT_DEV_KEY;
  const isDev = !!(opts && opts.trusted) || !!(key && body && typeof body.key === 'string' && body.key === key);
  let name = isDev ? DEV : clean(body && body.name, 20);
  if (!isDev && /^\s*dev\s*$/i.test(name)) return { ok: false, reason: 'DEV is the dev. Pick another name' };
  const text = clean(body && body.text, 200);
  if (name.length < 2) return { ok: false, reason: 'pick a name (2-20 characters)' };
  if (!text) return { ok: false, reason: 'say something' };
  if (!isDev && /stonks\s*man/i.test(name)) return { ok: false, reason: 'that seat is taken' };
  const now = Date.now();
  const ipKey = ip || 'anon';
  if (now - (lastByIp[ipKey] || 0) < 4000) return { ok: false, reason: 'slow down — one message every 4 seconds' };
  if (now - (lastByName[name.toLowerCase()] || 0) < 2000) return { ok: false, reason: 'slow down' };
  lastByIp[ipKey] = now; lastByName[name.toLowerCase()] = now;
  const m = push({ id: ++seq, at: now, name, text, bot: false, dev: isDev });
  return { ok: true, id: m.id };
}
// a commentator's reply, mirrored into the chat
function botSay(who, name, text) { return push({ id: ++seq, at: Date.now(), name, text, bot: true, who }); }
function since(id) { const n = Number(id || 0); return msgs.filter((m) => m.id > n).slice(-80); }
// what the desk has not answered yet (viewer messages only)
function unanswered() { return msgs.filter((m) => !m.bot && m.id > lastAnswered).slice(-15); }
function markAnswered() { lastAnswered = seq; }
function status() { return { count: msgs.length, seq }; }
// DEV login: the site checks the key once and the browser keeps it; every chat post then carries it
const loginTries = {}; // ip -> [timestamps]; five wrong guesses per 15 minutes, then the door is shut for that ip
function devLogin(body, ip) { const key = process.env.STONK_CHAT_DEV_KEY; if (!key) return { ok: false, reason: 'no dev key configured' }; const now = Date.now(); const t = (loginTries[ip || 'anon'] = (loginTries[ip || 'anon'] || []).filter((x) => now - x < 15 * 60_000)); if (t.length >= 5) return { ok: false, reason: 'too many attempts — try again later' }; const k = body && typeof body.key === 'string' ? body.key.trim() : ''; if (k && k.length === key.length && require('crypto').timingSafeEqual(Buffer.from(k), Buffer.from(key))) { loginTries[ip || 'anon'] = []; return { ok: true }; } t.push(now); return { ok: false, reason: 'wrong key' }; }

module.exports = { post, since, botSay, unanswered, markAnswered, status, devLogin };
