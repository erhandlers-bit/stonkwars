// Soundboard for the desk (owner 2026-09-10: "a hype soundboard for reactions"). Every effect is
// synthesised here — no samples, nothing to license. Writes WAVs; the loop at the bottom of
// package's npm-free command turns them into public/stonkwars/sfx/<name>.mp3 via ffmpeg.
//   node scripts/make-sfx.js <outDir>
const fs = require('fs');
const path = require('path');
const SR = 44100;
const outDir = process.argv[2] || 'sfx';
fs.mkdirSync(outDir, { recursive: true });
let seed = 4242; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
const clamp = (x) => Math.max(-1, Math.min(1, x));
function render(name, seconds, fn) {
  const n = Math.round(seconds * SR); const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = fn(i / SR, i);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const g = 0.85 / (peak || 1);
  const out = Buffer.alloc(44 + n * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + n * 2, 4); out.write('WAVE', 8); out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) out.writeInt16LE(Math.round(clamp(buf[i] * g) * 32767), 44 + i * 2);
  fs.writeFileSync(path.join(outDir, name + '.wav'), out);
  console.log(name, seconds + 's');
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) * d));
const saw = (ph) => 2 * (ph % 1) - 1;
const sq = (ph) => (ph % 1 < 0.5 ? 1 : -1);

// AIR HORN — three detuned saws with a slow vibrato, 1.4 s, the MLG classic
render('airhorn', 1.4, (t) => { const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 6 * t); const f = 415 * vib; let v = 0; for (const d of [1, 1.005, 0.995, 2.01]) v += saw(t * f * d) * (d > 2 ? 0.3 : 1); return v * env(t, 0.02, t > 1.1 ? 12 : 0.4) * 0.3; });
// SAD TROMBONE — four descending wah notes
render('trombone', 2.6, (t) => { const notes = [233, 220, 207, 196]; const seg = t < 0.45 ? 0 : t < 0.9 ? 1 : t < 1.35 ? 2 : 3; const t0 = [0, 0.45, 0.9, 1.35][seg]; const lt = t - t0; const f = notes[seg] * (seg === 3 ? Math.pow(2, -lt * 0.35) : 1) * (1 + 0.01 * Math.sin(2 * Math.PI * 5.5 * t)); const wah = 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, lt / (seg === 3 ? 1.2 : 0.4))); let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * h * t) / h * (h <= 2 + 3 * wah ? 1 : 0.2); return v * env(lt, 0.03, seg === 3 ? 2.2 : 6) * 0.35; });
// RECORD SCRATCH — noise with a fast pitch wobble and a hard stop
render('scratch', 0.8, (t) => { const rate = 1 + 3 * Math.abs(Math.sin(2 * Math.PI * 7 * t)); const n = rnd() * (0.6 + 0.4 * Math.sin(2 * Math.PI * 900 * rate * t)); return n * (t < 0.62 ? 1 : Math.exp(-(t - 0.62) * 60)) * (0.4 + 0.6 * Math.abs(Math.sin(2 * Math.PI * 9 * t))); });
// CROWD CHEER — filtered noise swell with a few whistles
let lp1 = 0, lp2 = 0;
render('cheer', 2.4, (t) => { const n = rnd(); lp1 += 0.12 * (n - lp1); lp2 += 0.03 * (lp1 - lp2); const swell = Math.pow(Math.min(1, t / 0.5), 2) * Math.exp(-Math.max(0, t - 1.4) * 2.5); const whistle = (t > 0.6 && t < 1.3) ? 0.15 * Math.sin(2 * Math.PI * (2200 + 600 * Math.sin(2 * Math.PI * 3 * t)) * t) * Math.sin(Math.PI * (t - 0.6) / 0.7) : 0; return ((lp1 - lp2) * 3 + n * 0.15) * swell + whistle; });
// BELL — boxing-bell partials, struck twice
render('bell', 2.2, (t) => { const hit = (t0) => { const lt = t - t0; if (lt < 0) return 0; let v = 0; for (const [f, a, d] of [[880, 1, 2.2], [1320, 0.6, 3], [1760, 0.5, 4], [2640, 0.3, 6], [3520, 0.2, 8]]) v += a * Math.sin(2 * Math.PI * f * lt) * Math.exp(-lt * d); return v * Math.min(1, lt / 0.003); }; return (hit(0) + hit(0.55)) * 0.3; });
// APPLAUSE — hundreds of tiny claps
let claps = []; for (let i = 0; i < 900; i++) claps.push([Math.pow(Math.random(), 0.7) * 2.6, 0.4 + Math.random() * 0.6]);
render('applause', 3.0, (t) => { let v = 0; for (const [t0, g] of claps) { const lt = t - t0; if (lt >= 0 && lt < 0.03) v += rnd() * Math.exp(-lt * 140) * g; } return v * 0.6 * Math.exp(-Math.max(0, t - 2.2) * 3); });
// DRUM ROLL — accelerating snare hits ending on a crash
render('drumroll', 2.0, (t) => { const hits = 32; let v = 0; for (let i = 0; i < hits; i++) { const t0 = 1.6 * (1 - Math.pow(1 - i / hits, 1.6)); const lt = t - t0; if (lt >= 0 && lt < 0.05) v += rnd() * Math.exp(-lt * 90) * (0.5 + i / hits); } const lt = t - 1.62; if (lt >= 0) v += rnd() * Math.exp(-lt * 3) * 0.8 + Math.sin(2 * Math.PI * 180 * lt) * Math.exp(-lt * 12); return v * 0.5; });
// CRICKETS — two chirping crickets in the dark
render('crickets', 2.5, (t) => { const chirp = (rate, f, ph) => { const p = (t * rate + ph) % 1; return p < 0.55 ? Math.sin(2 * Math.PI * f * t) * (Math.sin(2 * Math.PI * 38 * t) > 0 ? 1 : 0) * Math.sin(Math.PI * p / 0.55) : 0; }; return (chirp(2.1, 4300, 0) + 0.7 * chirp(1.7, 4700, 0.4)) * 0.25 * Math.min(1, t / 0.2) * Math.exp(-Math.max(0, t - 2.1) * 4); });
// CHA-CHING — two register dings + a coin shimmer
render('chaching', 1.3, (t) => { const ding = (t0, f) => { const lt = t - t0; return lt < 0 ? 0 : (Math.sin(2 * Math.PI * f * lt) + 0.4 * Math.sin(2 * Math.PI * f * 2.76 * lt)) * Math.exp(-lt * 5); }; const shimmer = t > 0.25 ? rnd() * Math.exp(-(t - 0.25) * 9) * 0.25 * (Math.sin(2 * Math.PI * 6000 * t) > 0 ? 1 : 0.3) : 0; return (ding(0, 2093) + ding(0.14, 2794)) * 0.35 + shimmer; });
// BUZZER — the game-show wrong answer
render('buzzer', 0.9, (t) => (sq(t * 110) * 0.6 + sq(t * 165) * 0.4) * (0.6 + 0.4 * (Math.sin(2 * Math.PI * 30 * t) > 0 ? 1 : 0)) * env(t, 0.01, t > 0.7 ? 25 : 0) * 0.35);
// RIMSHOT — ba-dum-tss
render('rimshot', 1.1, (t) => { const tom = (t0, f) => { const lt = t - t0; return lt < 0 ? 0 : Math.sin(2 * Math.PI * (f + 60 * Math.exp(-lt * 30)) * lt) * Math.exp(-lt * 14); }; const snare = (t0) => { const lt = t - t0; return lt < 0 ? 0 : rnd() * Math.exp(-lt * 25) * 0.7 + Math.sin(2 * Math.PI * 190 * lt) * Math.exp(-lt * 30) * 0.5; }; const crash = (t0) => { const lt = t - t0; return lt < 0 ? 0 : rnd() * Math.exp(-lt * 4) * 0.5 * (Math.sin(2 * Math.PI * 5200 * lt) > 0 ? 1 : 0.5); }; return (tom(0, 140) + tom(0.17, 110) * 0.9 + snare(0.17) * 0.4 + crash(0.36)) * 0.4; });
