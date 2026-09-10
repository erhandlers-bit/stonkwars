// Procedural background music for the stream (owner 2026-09-10: "something competitive and low
// volume"). No samples, no licensing: a 128 BPM four-on-the-floor arena loop synthesised from
// sines, saws and noise — kick, clap, hats, a driving minor-key saw bass and a pluck lead with
// echo. Renders a WAV; ffmpeg turns it into public/stonkwars/music.mp3 (see the npm-free
// command at the bottom). 16 bars = 30 s, bar-aligned so it loops cleanly.
//   node scripts/make-music.js [out.wav]
const fs = require('fs');
const SR = 44100, BPM = 128, BARS = 16;
const beat = 60 / BPM, sixteenth = beat / 4;
const total = Math.round(BARS * 4 * beat * SR);
const L = new Float32Array(total), R = new Float32Array(total);

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const clamp = (x) => Math.max(-1, Math.min(1, x));
function add(t0, dur, fn, gain = 1, pan = 0) { // fn(t, i) -> sample; t in seconds within the note
  const s0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  const gl = gain * (1 - Math.max(0, pan)), gr = gain * (1 + Math.min(0, pan));
  for (let i = 0; i < n && s0 + i < total; i++) { const v = fn(i / SR, i); L[s0 + i] += v * gl; R[s0 + i] += v * gr; }
}
let seed = 1337; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };

// ---- drums ----
function kick(t0) { add(t0, 0.32, (t) => { const f = 48 + 110 * Math.exp(-t * 28); return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9); }, 0.9); }
function clap(t0) { add(t0, 0.18, (t) => rnd() * Math.exp(-t * 22) * (t < 0.02 ? 0.4 : 1), 0.35); }
function hat(t0, open) { add(t0, open ? 0.16 : 0.05, (t) => { const n = rnd(); return n * Math.exp(-t * (open ? 22 : 70)); }, open ? 0.13 : 0.09, 0.25); }
// ---- bass: gated saw with a one-pole lowpass ----
function bass(t0, note, dur) {
  let lp = 0; const f = midi(note);
  add(t0, dur, (t) => { const ph = (t * f) % 1; const saw = 2 * ph - 1; const cut = 0.08 + 0.10 * Math.exp(-t * 12); lp += cut * (saw - lp); const env = Math.min(1, t / 0.004) * (t > dur - 0.03 ? (dur - t) / 0.03 : 1); return lp * env; }, 0.55);
}
// ---- pluck lead: detuned squares, fast decay, echo ----
function pluck(t0, note, dur, gain, pan) {
  const f = midi(note);
  const fn = (t) => { const a = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.5 + Math.sign(Math.sin(2 * Math.PI * f * 1.005 * t)) * 0.5; return a * Math.exp(-t * 7); };
  add(t0, dur, fn, gain, pan);
  add(t0 + sixteenth * 3, dur, fn, gain * 0.38, -pan); // echo, 3/16 later, other side
  add(t0 + sixteenth * 6, dur, fn, gain * 0.16, pan);
}

// ---- arrangement ----
const prog = [40, 40, 36, 36, 43, 43, 38, 38]; // E1 E1 C1 C1 G1 G1 D1 D1 (bars 1-8, then repeat)
const bassPat = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1]; // 16ths
const leadScale = [64, 67, 69, 71, 74, 76, 79]; // E minor pentatonic-ish, E4 up
const leadPat = [[0, 2, 4, 2], [5, 4, 2, 1], [0, 2, 4, 6], [5, 3, 2, 0]];
for (let bar = 0; bar < BARS; bar++) {
  const root = prog[bar % 8];
  for (let b = 0; b < 4; b++) {
    const tb = (bar * 4 + b) * beat;
    kick(tb);
    if (b === 1 || b === 3) clap(tb);
    hat(tb + beat / 2, false);
    if (bar >= 4) hat(tb + beat / 4, false), hat(tb + beat * 3 / 4, b === 3 && bar % 4 === 3);
    for (let s = 0; s < 4; s++) {
      const i = b * 4 + s; if (!bassPat[i]) continue;
      const n = root + (i % 8 === 7 ? 12 : 0) + (bar % 8 >= 6 && i === 14 ? 2 : 0);
      bass(tb + s * sixteenth, n, sixteenth * 0.9);
    }
  }
  if (bar >= 8) { // the lead comes in halfway, doubled an octave up on the last four bars
    const pat = leadPat[bar % 4];
    for (let e = 0; e < 8; e++) {
      const t = (bar * 4) * beat + e * beat / 2;
      const n = leadScale[pat[e % 4]] + (e >= 4 ? 2 : 0) + (root - 40); // follow the chord
      pluck(t, n, 0.35, 0.16, e % 2 ? 0.3 : -0.3);
      if (bar >= 12 && e % 2 === 0) pluck(t, n + 12, 0.3, 0.07, 0);
    }
  }
}
// riser into the loop point: a filtered noise swell over the last bar
add((BARS - 1) * 4 * beat, 4 * beat, (t) => rnd() * Math.pow(t / (4 * beat), 3) * 0.5, 0.18);

// ---- master: gentle saturation + peak normalise ----
let peak = 0; for (let i = 0; i < total; i++) { L[i] = Math.tanh(L[i] * 1.2); R[i] = Math.tanh(R[i] * 1.2); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g = 0.9 / (peak || 1);
const out = Buffer.alloc(44 + total * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + total * 4, 4); out.write('WAVE', 8); out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(total * 4, 40);
for (let i = 0; i < total; i++) { out.writeInt16LE(Math.round(clamp(L[i] * g) * 32767), 44 + i * 4); out.writeInt16LE(Math.round(clamp(R[i] * g) * 32767), 46 + i * 4); }
const file = process.argv[2] || 'music.wav';
fs.writeFileSync(file, out);
console.log('wrote', file, (total / SR).toFixed(2) + 's', BPM + ' BPM', BARS + ' bars');
// then: ffmpeg -y -i music.wav -af loudnorm=I=-16:TP=-1.5 -c:a libmp3lame -b:a 160k public/stonkwars/music.mp3
