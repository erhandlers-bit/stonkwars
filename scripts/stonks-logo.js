// Composite the exact Stonks meme cut-out (stonks-cut.png) onto the 1x1 logos WITHOUT hiding the tagline:
//  - Meme Man mirrored to look left, bottom-right, ~44% of canvas height
//  - the original tagline strip is cropped, scaled down and re-centred in the space left of him
// Usage: node scripts/stonks-logo.js
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, '..', 'public', 'stonkwars');
const CUT = path.join(dir, 'stonks-cut.png');

// tagline bbox per base logo (measured from the white text pixels)
const JOBS = [
  { base: 'logo-4.png', out: 'logo-stonks.png',  tag: { x0: 353, x1: 1677, y0: 1635, y1: 1665 }, pad: 22, fill: { r: 2, g: 0, b: 6 } },
  { base: 'logo-5.png', out: 'logo5-stonks.png', tag: { x0: 498, x1: 1563, y0: 1482, y1: 1510 }, pad: 22, fill: { r: 18, g: 1, b: 45 } },
];
const SCALE = 0.44;   // Meme Man height as a fraction of the canvas
const MARGIN = 0.02;  // bottom/right margin

(async () => {
  const cut = await sharp(CUT).flop().trim().png().toBuffer();
  for (const j of JOBS) {
    const base = sharp(path.join(dir, j.base));
    const { width: W, height: H } = await base.metadata();
    const man = await sharp(cut).resize({ height: Math.round(H * SCALE) }).png().toBuffer();
    const mm = await sharp(man).metadata();
    const mx = W - mm.width - Math.round(W * MARGIN), my = H - mm.height - Math.round(H * MARGIN);

    // 1) lift the original tagline strip (with a little padding so the anti-aliasing comes along)
    const t = j.tag, p = j.pad;
    const strip = { left: t.x0 - p, top: t.y0 - p, width: (t.x1 - t.x0) + 2 * p, height: (t.y1 - t.y0) + 2 * p };
    const stripBuf = await sharp(path.join(dir, j.base)).extract(strip).png().toBuffer();
    // 2) blank the old strip, then scale the strip so it ends before Meme Man's left edge, centred in that space
    const avail = (mx - 30) - t.x0;                                  // room from original text start to the man
    const scale = Math.min(1, avail / strip.width);
    const small = await sharp(stripBuf).resize({ width: Math.round(strip.width * scale) }).png().toBuffer();
    const sm = await sharp(small).metadata();
    const sx = Math.round(t.x0 + (avail - sm.width) / 2) - Math.round(p * scale);
    const sy = Math.round((t.y0 + t.y1) / 2 - sm.height / 2);
    const blank = await sharp({ create: { width: strip.width, height: strip.height, channels: 3, background: j.fill } }).png().toBuffer();

    await base
      .composite([
        { input: blank, left: strip.left, top: strip.top },
        { input: small, left: sx, top: sy },
        { input: man, left: mx, top: my },
      ])
      .png()
      .toFile(path.join(dir, j.out));
    console.log(j.out, `man ${mm.width}x${mm.height} @ ${mx},${my}; tagline scaled ${(scale * 100).toFixed(0)}% -> ${sm.width}px @ ${sx},${sy}`);
  }
})();
