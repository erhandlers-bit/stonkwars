// Drop the Stonks cutout bottom-right (looking left) onto the banner and the
// square logos, and make the host avatar. Source faces the viewer's right, so
// it is mirrored to look left toward the wordmark.
const sharp = require('sharp');
const path = require('path');
const A = path.join(__dirname, '..', 'public', 'stonkwars');
(async () => {
  const cut = await sharp(path.join(A, 'stonks-cut.png')).flop().trim().toBuffer();
  const meta = await sharp(cut).metadata();
  async function stamp(src, out, heightFrac, marginFrac) {
    const base = sharp(path.join(A, src));
    const m = await base.metadata();
    const h = Math.round(m.height * heightFrac);
    const guy = await sharp(cut).resize({ height: h }).toBuffer();
    const g = await sharp(guy).metadata();
    const margin = Math.round(m.width * marginFrac);
    await base.composite([{ input: guy, left: m.width - g.width - margin, top: m.height - g.height }]).toFile(path.join(A, out));
    console.log(out + ': ' + m.width + 'x' + m.height + ' with stonks ' + g.width + 'x' + g.height + ' bottom-right');
  }
  await stamp('banner-4.png', 'banner-stonks.png', 0.62, 0.02);
  await stamp('logo-4.png', 'logo-stonks.png', 0.55, 0.0);
  await stamp('logo-5.png', 'logo5-stonks.png', 0.55, 0.0);
  // host avatar: square, dark studio backdrop, him centered
  const side = 1024;
  const guy = await sharp(cut).resize({ height: Math.round(side * 0.95) }).toBuffer();
  const g = await sharp(guy).metadata();
  await sharp({ create: { width: side, height: side, channels: 4, background: { r: 14, g: 18, b: 32, alpha: 1 } } })
    .composite([{ input: guy, left: Math.round((side - g.width) / 2), top: side - g.height }])
    .png().toFile(path.join(A, 'stonks.png'));
  console.log('stonks.png: host avatar ' + side + 'x' + side + ' (source cutout ' + meta.width + 'x' + meta.height + ', mirrored to look left)');
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
