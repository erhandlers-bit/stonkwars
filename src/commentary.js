// COMMENTARY — two animal commentators calling every match live.
//
//   ROCKY THE HYENA   hype man. Cackles at losses, screams at big buys,
//                     has never once used an indoor voice.
//   PROFESSOR SLOTH   deadpan analyst. Always reacting to the trade from five
//                     minutes ago. Dry as a bond prospectus.
//
// Two layers:
//   1. INSTANT lines — scripted pools keyed to what just happened (buy, big
//      buy, stop-out, rug, take-profit, goldfish forgetting, lead change,
//      bells, champion). Fires the moment the engine emits the event.
//   2. BANTER — every STONK_BANTER_MS a small Claude call reads the real
//      standings and the last few events and writes two fresh lines. Skipped
//      silently without ANTHROPIC_API_KEY. Haiku 4.5: four hours costs cents.
//
// Voice: free Microsoft neural TTS (msedge-tts). Each line becomes an mp3 on
// demand at /api/tts/<id>, cached on disk. No keys.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const TTS_DIR = path.join(__dirname, '..', 'data', 'tts');
const CAST = {
  hyena: { name: 'Rocky the Hyena', emoji: '🐆', voice: 'en-US-GuyNeural', rate: '+22%', pitch: '+12Hz', image: '/stonkwars/hyena.png' },
  sloth: { name: 'Professor Sloth', emoji: '🦥', voice: 'en-US-ChristopherNeural', rate: '-28%', pitch: '-8Hz', image: '/stonkwars/sloth.png' },
};

// Every trading animal gets a voice too — for the interviews. Rate/pitch are
// the character: the bee is frantic, the elephant is slow and deep, the
// goldfish is chirpy and lost.
const ANIMAL_VOICE = {
  elephant: { voice: 'en-US-RogerNeural', rate: '-25%', pitch: '-25Hz' },
  orca: { voice: 'en-US-AndrewNeural', rate: '+5%', pitch: '-10Hz' },
  gorilla: { voice: 'en-US-BrianNeural', rate: '-15%', pitch: '-30Hz' },
  chimp: { voice: 'en-US-EricNeural', rate: '+10%', pitch: '+5Hz' },
  dolphin: { voice: 'en-US-AvaNeural', rate: '+10%', pitch: '+10Hz' },
  dog: { voice: 'en-US-SteffanNeural', rate: '+15%', pitch: '+8Hz' },
  pig: { voice: 'en-US-ChristopherNeural', rate: '-15%', pitch: '-5Hz' },
  raccoon: { voice: 'en-US-GuyNeural', rate: '+12%', pitch: '+15Hz' },
  parrot: { voice: 'en-US-AriaNeural', rate: '+20%', pitch: '+25Hz' },
  crow: { voice: 'en-US-EmmaNeural', rate: '0%', pitch: '-5Hz' },
  horse: { voice: 'en-US-AndrewNeural', rate: '-10%', pitch: '-15Hz' },
  cat: { voice: 'en-US-MichelleNeural', rate: '-8%', pitch: '+5Hz' },
  octopus: { voice: 'en-US-JennyNeural', rate: '+5%', pitch: '0Hz' },
  rat: { voice: 'en-US-EricNeural', rate: '+35%', pitch: '+20Hz' },
  goldfish: { voice: 'en-US-AnaNeural', rate: '+8%', pitch: '+20Hz' },
  honeybee: { voice: 'en-US-AnaNeural', rate: '+40%', pitch: '+35Hz' },
};
// Who is talking: a commentator, or "animal:<id>" during an interview.
function speaker(who) {
  if (CAST[who]) return { ...CAST[who], id: who };
  const id = String(who).replace(/^animal:/, '');
  const a = require('./stonkwars').BY_ID[id];
  if (!a) return { ...CAST.hyena, id: 'hyena' };
  return { id: who, name: a.name, emoji: a.emoji, image: '/stonkwars/' + id + '.png', ...(ANIMAL_VOICE[id] || { voice: 'en-US-GuyNeural', rate: '0%', pitch: '0Hz' }) };
}

const lines = [];          // newest first
let seq = 0;
const lastSpoke = { hyena: 0, sloth: 0 };
const recent = [];         // last events for the banter prompt

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function fill(t, v) { return t.replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : '')); }
function say(who, text, matchId, kind) {
  const now = Date.now();
  const gap = Number(config.STONK_LINE_GAP_MS || 3500);
  const protectedKind = kind === 'champion' || kind === 'round' || kind === 'result' || kind === 'interview';
  if (now - (lastSpoke[who] || 0) < gap && !protectedKind) return null; // do not talk over yourself
  lastSpoke[who] = now;
  const sp = speaker(who);
  const l = { id: ++seq, at: now, who, name: sp.name, emoji: sp.emoji, image: sp.image, text, matchId: matchId || null, kind };
  lines.unshift(l);
  if (lines.length > 250) lines.length = 250;
  return l;
}

// ---------------- the writing ----------------
const ROAST = { // animal-specific stop-out lines
  goldfish: ['The goldfish just sold a coin it does not remember buying. Net memory: zero. Net money: also trending toward zero.', 'Goldfish stopped out. In its defense, it has no idea any of this is happening.'],
  pig: ['The pig held for the full 2x and got the full minus 25 instead. Pigs get fed, hogs get THIS.', 'Greedy pig, no trailing stop, no exit plan, no problem — until now.'],
  rat: ['The rat reacted in five seconds and was wrong in five seconds. Efficient.', 'Rat stopped out. It has already forgotten and bought something else. Do not look away.'],
  honeybee: ['The bee lost eight dollars. That is eleven percent of its entire worldview.', 'Another tiny loss for the bee. Death by a thousand nectar trades.'],
  parrot: ['The parrot copied the leader\'s trade. The leader has since sold. The parrot has not been told.', 'Parrot stopped out on a trade it did not think of. Original thoughts still sold separately.'],
  raccoon: ['Raccoon bought the shiny paid promo. The shiny paid promo bit him. Every time.', 'Raccoon down on a boosted coin. He saw the sparkle. He did not see the tax.'],
  elephant: ['The elephant lost — and it will NEVER forget this coin. Blacklisted for life. Grudge acquired.', 'Elephant stop-out. Somewhere a memory the size of a building just filed this under "never again".'],
  cat: ['The cat did the opposite of the room and the room was right. Cat is unbothered. Cat is also down twelve percent.', 'Contrarian cat stopped out, then stared at the screen like it was our fault.'],
  dog: ['The dog followed the pack. The pack walked off a cliff. Loyalty!', 'Good boy, bad trade. Dog stopped out but still wagging.'],
  horse: ['The horse lost ten dollars, which for the horse is a wild night.', 'Steady horse, tight stop, tiny loss. Boring on purpose, boring in defeat.'],
  octopus: ['One of the octopus\'s eight arms just got slapped. Seven arms unaffected. This is fine.', 'Octopus stopped out on ONE position. It has seven more. It is basically a hedge fund.'],
  crow: ['The crow used tools, indicators, and cunning, and STILL bought the top. Big brain, bad entry.', 'Crow stop-out. The tools were fine. The market was rude.'],
  dolphin: ['Dolphin read the flow and the flow lied. Even echolocation cannot see a dev wallet.', 'Dolphin stopped out. It bailed fast though — respect the reflexes.'],
  chimp: ['The chimp lost and is now tightening its threshold. Adaptive! Also poorer.', 'Chimp stop-out. Watch it get pickier — it learns. Slowly. Like us.'],
  gorilla: ['The gorilla held through the noise. The noise was the signal. Big position, big ouch.', 'Gorilla stopped out at minus twenty. Strength is not a strategy. Well — it is, just not today.'],
  orca: ['The orca chased momentum and momentum reversed. Apex predator, mid entry.', 'Orca stop-out. Even the killer whale gets killed by a killer candle.'],
};

const POOL = {
  buy: {
    hyena: ['{animal} just SENT IT on ${sym} for ${usd}! AHAHAHA LET\'S GOOO!', '${sym}?? {animal} is IN for ${usd}! Somebody check the chart, this could be the one!', 'BUY ALERT! {animal} grabs ${sym}! {why}! I love it, I have no idea what it is, I LOVE IT!'],
    sloth: ['{animal} has purchased ${sym}. Reasoning: {why}. I will have an opinion about this in approximately five minutes.', 'A buy from {animal}. ${sym}, ${usd}. The thesis, such as it is: {why}.', '{animal} bought ${sym}. I would like to note the signals it cannot see: {blind}. Bold.'],
  },
  bigbuy: {
    hyena: ['WHOA WHOA WHOA — {animal} just dropped ${usd} on ${sym}! THAT IS A STATEMENT! THE CROWD IS ON ITS FEET!', 'BIG MONEY! {animal} goes HEAVY on ${sym} — ${usd}! This is either genius or the funniest thing I see all day!', 'OH MY — ${usd} into ${sym}! {animal} did not come here to make friends!'],
    sloth: ['{animal} has committed ${usd} to ${sym}. That is a large fraction of its net worth. I admire the confidence. I do not share it.', 'A sizable position from {animal}: ${usd} in ${sym}. Statistically, this is where the highlight reel and the blooper reel diverge.'],
  },
  rebuy: {
    hyena: ['AHAHAHA THE GOLDFISH BOUGHT ${sym} AGAIN! IT FORGOT! IT LITERALLY FORGOT! I CAN\'T BREATHE!', 'Goldfish re-enters ${sym}! Third time\'s the charm! Or the fourth! It genuinely does not know!'],
    sloth: ['The goldfish has purchased ${sym} a second time, having forgotten the first. This is called averaging in, if you are generous.', 'Goldfish rebuys ${sym}. Its memory is three seconds. Its conviction, apparently, is eternal.'],
  },
  forget: {
    hyena: ['The goldfish just FORGOT it owns ${sym}! Nobody tell it! This is the best content on the internet!', 'AHAHA the goldfish is looking at its own position like a stranger! ${sym}? Never heard of her!'],
    sloth: ['The goldfish has forgotten ${sym}. The position is now unmanaged. No stop, no target, no memory. Pure diamond hands by accident.'],
  },
  stop: {
    hyena: ['OOF! {animal} stopped out on ${sym}, minus {pct} percent! AHAHAHA get REKT! {roast}', 'DOWN GOES {animal}! ${sym} bit back! {roast}', 'STOPPED OUT! {animal} eats a loss on ${sym}! Somebody play the sad trombone! {roast}'],
    sloth: ['{animal} has exited ${sym} at a loss. {roast}', 'Stop loss triggered for {animal} on ${sym}. {roast} Moving on. Slowly.', '{roast} That was {animal}, on ${sym}, {pct} percent underwater. I am told this is normal.'],
  },
  take: {
    hyena: ['CHA-CHING! {animal} BANKS profit on ${sym}! PLUS {pct} PERCENT! THAT\'S HOW YOU DO IT!', 'PAID! {animal} takes money off the table on ${sym}! Up {pct}! The animal kingdom is EATING today!', '{animal} SECURES THE BAG on ${sym}! Plus {pct} percent! I am losing my mind!'],
    sloth: ['{animal} took profit on ${sym}, up {pct} percent. A disciplined exit. I am mildly moved.', 'Profit banked by {animal} on ${sym}. Plus {pct}. Someone in this bracket read a book.'],
  },
  trail: {
    hyena: ['{animal} trails out of ${sym} for a WIN! Rode it up, gave a little back, kept the rest! SMART!', 'Trailing stop pays for {animal} on ${sym}! Plus {pct}! Let the winners run — then get OUT!'],
    sloth: ['{animal} exited ${sym} on a trailing stop, up {pct}. The trend ended. It noticed. That is the whole game.'],
  },
  rug: {
    hyena: ['RUG! RUG! RUG! The pool on ${sym} is DRAINING and {animal} is running for the exit! AHAHAHA THE DEV LEFT!', 'THE LIQUIDITY IS GONE! ${sym} just got PULLED! {animal} saw it — did it get out in time?! NOBODY GETS OUT IN TIME!'],
    sloth: ['The developer of ${sym} has, and I quote the blockchain, "left". {animal} is exiting through the gift shop.', 'Liquidity on ${sym} has departed for a better life. {animal} follows. This is why we do not name our coins after laptops.'],
  },
  flow: { hyena: ['{animal} bails on ${sym} — the volume died! Reading the room! Or the pool!'], sloth: ['{animal} left ${sym} because the flow went quiet. Echolocation confirms: nobody is home.'] },
  time: { hyena: ['{animal} got BORED of ${sym} and left! Attention span of a — well. Of an animal.'], sloth: ['{animal} exited ${sym} after {min} minutes, citing boredom. Relatable.'] },
  pass: { hyena: ['{animal} looked at ${sym}, thought about it, and… nope! Hesitation! The market punishes hesitation! Or rewards it! I forget!'], sloth: ['{animal} considered ${sym} and declined. Restraint. In this bracket. Astonishing.'] },
  lead: {
    hyena: ['LEAD CHANGE! {animal} takes over the match! {eq} versus {oppEq}! THIS IS ANYONE\'S GAME!', 'AND {animal} PULLS AHEAD! The scoreboard flips! Somebody hold the {opp} — it looks upset!'],
    sloth: ['{animal} now leads the match, {eq} to {oppEq}. For those keeping score at home: it is me. I am keeping score.'],
  },
  round: { hyena: ['HERE WE GO! THE BELL! {text} SIXTEEN BRAINS, ONE HOUR, NO MERCY!', 'IT\'S TIME! {text} Strap in!'], sloth: ['{text} I have prepared no notes. Let us begin.'] },
  result: { hyena: ['IT\'S OVER! {text} WHAT A MATCH!', '{text} And the loser walks home with nothing but a lesson!'], sloth: ['{text} A result. Someone will explain it to the loser later.'] },
  champion: { hyena: ['{text} AHAHAHAHA WE HAVE A CHAMPION! CONFETTI! SOMEBODY GET THIS ANIMAL A TROPHY AND A LAWYER!'], sloth: ['{text} Congratulations. I would like to review the tape, slowly, over the next several hours.'] },
  picks: { hyena: ['PICK \'EM RESULTS! {text} If you called it, check your wallet! If you didn\'t — there\'s always the next round!'], sloth: ['{text} The crowd, as always, was mostly wrong. That is what makes them the crowd.'] },
};

function whyText(w) {
  const liked = (w.signals || []).filter((s) => s.good).map((s) => s.text);
  return liked.length ? liked.slice(0, 3).join(', ') : ((w.nudges || [])[0] || 'vibes');
}

// ---------------- event -> lines ----------------
function reactTo(e, st, rng) {
  const a = e.animalId ? require('./stonkwars').BY_ID[e.animalId] : null;
  // spoken text: no emoji (the voice reads them out loud), no double spaces
  const clean = (s) => String(s || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s+/g, ' ').trim();
  const v = { animal: a ? a.name : '', sym: e.symbol || '', usd: e.usd != null ? Math.round(e.usd) : '', pct: Math.abs(e.movePct || 0), min: e.heldMin || '', text: clean(e.text) };
  if (e.kind === 'buy') {
    v.why = whyText(e.why || {}); v.blind = ((e.why || {}).blind || []).join(' and ') || 'nothing';
    const book = st.books[e.animalId];
    const big = book && e.usd >= 0.2 * (book.cashUsd + e.usd);
    const again = /again/.test(e.text || '');
    const kind = again ? 'rebuy' : big ? 'bigbuy' : 'buy';
    say('hyena', fill(pick(rng, POOL[kind].hyena), v), e.matchId, kind);
    if (kind !== 'buy' || rng() < 0.5) say('sloth', fill(pick(rng, POOL[kind].sloth), v), e.matchId, kind);
  } else if (e.kind === 'sell') {
    const r = e.reason || '';
    let kind = 'stop';
    if (/took profit/.test(r)) kind = 'take'; else if (/trail/.test(r)) kind = 'trail'; else if (/drain/.test(r)) kind = 'rug'; else if (/quiet/.test(r)) kind = 'flow'; else if (/interest/.test(r)) kind = 'time';
    v.roast = kind === 'stop' ? pick(rng, ROAST[e.animalId] || ['A loss is a loss.']) : '';
    say('hyena', fill(pick(rng, POOL[kind].hyena), v), e.matchId, kind);
    if (kind !== 'time' || rng() < 0.5) say('sloth', fill(pick(rng, POOL[kind].sloth), v), e.matchId, kind);
  } else if (e.kind === 'quirk') {
    say('hyena', fill(pick(rng, POOL.forget.hyena), { sym: (e.text || '').replace(/.*\$/, '') }), e.matchId, 'forget');
    if (rng() < 0.6) say('sloth', fill(pick(rng, POOL.forget.sloth), { sym: (e.text || '').replace(/.*\$/, '') }), e.matchId, 'forget');
  } else if (e.kind === 'pass') {
    if (rng() < 0.5) say(rng() < 0.5 ? 'hyena' : 'sloth', fill(pick(rng, POOL.pass[rng() < 0.5 ? 'hyena' : 'sloth']), v), e.matchId, 'pass');
  } else if (e.kind === 'round' || e.kind === 'result' || e.kind === 'champion' || e.kind === 'picks') {
    say('hyena', fill(pick(rng, POOL[e.kind].hyena), v), e.matchId, e.kind);
    say('sloth', fill(pick(rng, POOL[e.kind].sloth), v), e.matchId, e.kind);
  }
}

// lead changes are not events — detect them by watching equity each tick
const lastLeader = {};
function watchLeads(st, rng) {
  const sw = require('./stonkwars');
  const round = st.rounds[st.roundIdx];
  if (!round || st.status !== 'running' || Date.now() < round.startAt) return;
  for (const m of round.matches) {
    if (m.winner) continue;
    const ea = sw.equityOf(st.books[m.a]), eb = sw.equityOf(st.books[m.b]);
    if (Math.abs(ea - eb) < 5) continue;
    const leader = ea > eb ? m.a : m.b;
    if (lastLeader[m.id] && lastLeader[m.id] !== leader) {
      const a = sw.BY_ID[leader], o = sw.BY_ID[leader === m.a ? m.b : m.a];
      const v = { animal: a.name, opp: o.name.toLowerCase(), eq: '$' + Math.round(Math.max(ea, eb)), oppEq: '$' + Math.round(Math.min(ea, eb)) };
      say('hyena', fill(pick(rng, POOL.lead.hyena), v), m.id, 'lead');
      if (rng() < 0.5) say('sloth', fill(pick(rng, POOL.lead.sloth), v), m.id, 'lead');
    }
    lastLeader[m.id] = leader;
  }
}

// ---------------- Claude banter ----------------
async function banter() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || config.STONK_BANTER_MS === 0) return;
  const sw = require('./stonkwars');
  const st = sw.status();
  if (st.status !== 'running') return;
  const round = st.rounds[st.roundIdx];
  const standings = round.matches.map((m) => {
    const A = sw.BY_ID[m.a], B = sw.BY_ID[m.b];
    return A.name + ' $' + Math.round(st.books[m.a].equity) + ' vs ' + B.name + ' $' + Math.round(st.books[m.b].equity) + (m.winner ? ' (won by ' + sw.BY_ID[m.winner].name + ')' : '');
  }).join('\n');
  const last = recent.slice(-12).map((e) => '- ' + e.text).join('\n');
  const prompt = 'You write two animal sports commentators for STONK WARS, a live bracket where 16 animals with brains scaled to their real neuron counts trade memecoins for an hour per round.\n' +
    'ROCKY THE HYENA: unhinged hype man, ALL CAPS energy, cackles, roasts losers mercilessly, worships big buys.\n' +
    'PROFESSOR SLOTH: deadpan, slow, academic, dry one-liners, often reacting to something from several minutes ago.\n' +
    'Be genuinely funny — specific to what actually happened, never generic. Roast mistakes, hype big plays, mock rugs. Keep each line under 30 words. No hashtags, no emojis.\n\n' +
    'ROUND: ' + st.roundName + '\nSTANDINGS:\n' + standings + '\n\nLAST EVENTS:\n' + (last || '- quiet so far') +
    '\n\nReturn exactly two lines, in this format:\nHYENA: ...\nSLOTH: ...';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: config.STONK_BANTER_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 160, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    const text = (j.content || []).map((b) => b.text || '').join('');
    const h = /HYENA:\s*(.+)/i.exec(text), s = /SLOTH:\s*(.+)/i.exec(text);
    if (h) say('hyena', h[1].trim(), null, 'banter');
    if (s) say('sloth', s[1].trim(), null, 'banter');
  } catch { /* banter is optional */ }
}

// ---------------- INTERVIEWS ----------------
// A commentator grabs a random live animal mid-match. The animal answers the
// way that animal would — Claude writes it from the brain profile and the
// book; without a key, a scripted answer per animal keeps the bit alive.
const SCRIPTED_ANSWERS = {
  elephant: 'I remember every coin that has ever wronged me. I remember the block number. I remember the dev\'s wallet. I do not remember why I am here.',
  orca: 'I hunt momentum. I strike. I leave. Next question, and make it faster.',
  gorilla: 'I bought big. I am holding big. The chart is red. I do not care. I am a gorilla.',
  chimp: 'After my last loss I raised my threshold. After my next win I will lower it. This is called learning. I read it somewhere. Probably.',
  dolphin: 'I listen to the flow. When the volume goes quiet, I leave. It is quiet right now. Why are you still talking.',
  dog: 'Who is buying? Everyone? Then I am buying! Are we winning? I love winning! Is that a coin? I love coins!',
  pig: 'I am holding for the full two X. No stop. No trail. No regrets. Well. One regret. It is the one I am holding.',
  raccoon: 'Did you see the one with the paid promo? It was SHINY. It went down. But it was SHINY.',
  parrot: 'Buy what the leader buys! Buy what the leader buys! Wait — what did the leader buy? What did the leader buy?',
  crow: 'I have six indicators, a stylus, and a plan. The plan did not account for the dev selling. Adjusting the plan.',
  horse: 'Small bets. Tight stops. Nothing exciting. I am up four dollars and I would like everyone to calm down.',
  cat: 'Everyone bought it, so I sold it. Everyone sold it, so I bought it. Everyone is wrong. I am also down. Unrelated.',
  octopus: 'Eight arms, eight positions, eight opinions. One of them is losing. The other seven have not been told.',
  rat: 'Bought it sold it bought it sold it bought a different one sold that one what was the question I have to go.',
  goldfish: 'Great question. I have a great answer. It is about the coin I — what coin? Is this an interview? Hello!',
  honeybee: 'Trade trade trade trade trade eight percent take profit trade trade trade — sorry, cannot stop, the colony needs nectar.',
};
async function interview() {
  const sw = require('./stonkwars');
  const st = sw.status();
  if (st.status !== 'running') return;
  const round = st.rounds[st.roundIdx];
  if (!round || Date.now() < round.startAt) return;
  const live = round.matches.filter((m) => !m.winner).flatMap((m) => [[m.a, m.id], [m.b, m.id]]);
  if (!live.length) return;
  const [id, matchId] = live[Math.floor(Math.random() * live.length)];
  const a = sw.BY_ID[id];
  const b = st.books[id];
  const asker = Math.random() < 0.7 ? 'hyena' : 'sloth';
  const questions = [
    'What is the plan here?', 'Talk me through that last trade.', 'You are ' + (b.equity >= 1000 ? 'up' : 'down') + ' $' + Math.abs(Math.round(b.equity - 1000)) + ' — how are you feeling?',
    'Your opponent is watching. Anything to say to them?', 'Why THAT coin?', 'Do you know what you are holding right now?',
  ];
  const q = questions[Math.floor(Math.random() * questions.length)];
  const key = process.env.ANTHROPIC_API_KEY;
  let answer = null;
  if (key) {
    const held = (b.positions || []).map((p) => '$' + p.symbol + ' (' + (p.pnlPct >= 0 ? '+' : '') + p.pnlPct + '%)').join(', ') || 'nothing';
    const last = (b.closed || []).slice(0, 3).map((c) => '$' + c.symbol + ' ' + (c.pnlUsd >= 0 ? '+' : '') + Math.round(c.pnlUsd) + ' (' + c.reason + ')').join('; ') || 'no closed trades yet';
    const prompt = 'You are ' + a.name.toUpperCase() + ', a contestant in STONK WARS — an animal trading memecoins with a brain of ' + a.neurons.toExponential(1) + ' neurons. Character: ' + a.blurb + ' Quirk: ' + a.brain.quirk + '. Memory: can hold ' + a.brain.memory + ' coins in mind. Reaction time: ' + (a.brain.reactionMs / 1000) + 's. Patience: ' + a.brain.maxHoldMin + ' minutes.\n' +
      'Your book right now: equity $' + Math.round(b.equity) + ', holding ' + held + '. Recent trades: ' + last + '.\n' +
      'A commentator asks: "' + q + '"\n' +
      'Answer IN CHARACTER as this animal — its intelligence, its instincts, its quirk (a goldfish forgets mid-sentence; a rat cannot stop; an elephant holds grudges; a pig is greedy). Be funny and specific to your actual trades. One to three sentences, under 45 words. No emojis, no hashtags, no stage directions.';
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: config.STONK_BANTER_MODEL || 'claude-haiku-4-5-20251001', max_tokens: 120, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(20000),
      });
      const j = await r.json();
      answer = (j.content || []).map((x) => x.text || '').join('').trim() || null;
    } catch { answer = null; }
  }
  if (!answer) answer = SCRIPTED_ANSWERS[id] || 'No comment. I am an animal.';
  const lead = asker === 'hyena'
    ? 'WE\'RE GOING RINGSIDE! ' + a.name + ', ' + q
    : 'I have a question for ' + a.name + ', if it can hear me. ' + q;
  say(asker, lead, matchId, 'interview');
  say('animal:' + id, answer, matchId, 'interview');
  const tag = asker === 'hyena'
    ? ['AHAHAHA! Back to you, Professor!', 'You heard it here first! Or second! I wasn\'t listening!', 'THAT is a competitor! Or a cry for help!'][Math.floor(Math.random() * 3)]
    : ['Illuminating. Back to the desk.', 'I will be thinking about that answer for the rest of the round.', 'Noted. Slowly.'][Math.floor(Math.random() * 3)];
  say(asker, tag, matchId, 'interview');
}

// ---------------- TTS ----------------
let ttsLib = null;
async function tts(line) {
  try { fs.mkdirSync(TTS_DIR, { recursive: true }); } catch { /* exists */ }
  const file = path.join(TTS_DIR, crypto.createHash('md5').update(line.who + '|' + line.text).digest('hex') + '.mp3');
  if (fs.existsSync(file)) return fs.readFileSync(file);
  if (!ttsLib) ttsLib = require('msedge-tts');
  const { MsEdgeTTS, OUTPUT_FORMAT } = ttsLib;
  const c = speaker(line.who);
  const t = new MsEdgeTTS();
  await t.setMetadata(c.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = t.toStream(line.text, { rate: c.rate, pitch: c.pitch });
  const chunks = [];
  await new Promise((res, rej) => { audioStream.on('data', (d) => chunks.push(d)); audioStream.on('end', res); audioStream.on('error', rej); });
  const buf = Buffer.concat(chunks);
  try { fs.writeFileSync(file, buf); } catch { /* cache is optional */ }
  return buf;
}

// ---------------- API ----------------
function since(id, matchId) {
  const out = [];
  for (const l of lines) { if (l.id <= id) break; if (!matchId || !l.matchId || l.matchId === matchId) out.push(l); }
  return out.reverse();
}
function status() { return { cast: CAST, latest: lines.slice(0, 40), seq }; }
function line(id) { return lines.find((l) => l.id === Number(id)) || null; }

function start() {
  const sw = require('./stonkwars');
  let seed = 7;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  sw.onEvent((e, st) => { recent.push(e); if (recent.length > 40) recent.shift(); reactTo(e, st, rng); });
  setInterval(() => { try { watchLeads(sw._state, rng); } catch { /* never */ } }, 5000).unref();
  const bm = config.STONK_BANTER_MS == null ? 45000 : Number(config.STONK_BANTER_MS);
  if (bm > 0) setInterval(() => banter().catch(() => {}), bm).unref();
  const im = config.STONK_INTERVIEW_MS == null ? 240000 : Number(config.STONK_INTERVIEW_MS);
  if (im > 0) setInterval(() => interview().catch(() => {}), im).unref();
  console.log('[commentary] Rocky the Hyena + Professor Sloth on the call' + (process.env.ANTHROPIC_API_KEY && bm > 0 ? ' (+ Claude banter every ' + Math.round(bm / 1000) + 's)' : ' (scripted only)'));
}

module.exports = { start, since, status, line, tts, interview, CAST };
