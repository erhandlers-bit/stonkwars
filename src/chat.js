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
  return String(s || '').replace(/<[^>]*>/g, '').replace(/https?:\/\/\S+/gi, '[link]').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}
function push(m) { msgs.push(m); if (msgs.length > MAX) msgs.shift(); return m; }

function post(body, ip) {
  const name = clean(body && body.name, 20);
  const text = clean(body && body.text, 200);
  if (name.length < 2) return { ok: false, reason: 'pick a name (2-20 characters)' };
  if (!text) return { ok: false, reason: 'say something' };
  if (/stonks\s*man/i.test(name)) return { ok: false, reason: 'that seat is taken' };
  const now = Date.now();
  const key = ip || 'anon';
  if (now - (lastByIp[key] || 0) < 4000) return { ok: false, reason: 'slow down — one message every 4 seconds' };
  if (now - (lastByName[name.toLowerCase()] || 0) < 2000) return { ok: false, reason: 'slow down' };
  lastByIp[key] = now; lastByName[name.toLowerCase()] = now;
  const m = push({ id: ++seq, at: now, name, text, bot: false });
  return { ok: true, id: m.id };
}
// a commentator's reply, mirrored into the chat
function botSay(who, name, text) { return push({ id: ++seq, at: Date.now(), name, text, bot: true, who }); }
function since(id) { const n = Number(id || 0); return msgs.filter((m) => m.id > n).slice(-80); }
// what the desk has not answered yet (viewer messages only)
function unanswered() { return msgs.filter((m) => !m.bot && m.id > lastAnswered).slice(-15); }
function markAnswered() { lastAnswered = seq; }
function status() { return { count: msgs.length, seq }; }

module.exports = { post, since, botSay, unanswered, markAnswered, status };
