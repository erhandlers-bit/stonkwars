// Build the commentary-desk frame: two Stonks Men (the exact meme cut-out, one
// mirrored so they face each other) behind a broadcast desk in the studio
// backdrop, STONK WARS logo plate on the desk front.
//   node scripts/desk-composite.js            -> public/stonkwars/desk.png (1344x768)
// Layers, back to front: studio-2.png, stonks-cut.png x2, desk-2-cut.png, logo.png
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, '..', 'public', 'stonkwars');
const f = (n) => path.join(dir, n);

(async () => {
  const bg = sharp(f('studio-2.png'));
  const { width: W, height: H } = await bg.metadata(); // 1344x768

  // the two men — heads near the top, arms crossed just above the desk top
  const manH = Math.round(H * 0.74);
  const left = await sharp(f('stonks-cut.png')).trim().resize({ height: manH }).png().toBuffer();
  const right = await sharp(f('stonks-cut.png')).trim().flop().resize({ height: manH }).png().toBuffer();
  const lm = await sharp(left).metadata();
  const topY = Math.round(H * 0.05);
  const lx = Math.round(W * 0.30 - lm.width / 2);
  const rx = Math.round(W * 0.70 - lm.width / 2);

  // the desk — wide, top edge at ~68% so the crossed arms stay visible
  const deskW = Math.round(W * 0.86);
  const desk = await sharp(f('desk-2-cut.png')).trim().resize({ width: deskW }).png().toBuffer();
  const dm = await sharp(desk).metadata();
  const deskX = Math.round((W - deskW) / 2);
  const deskY = Math.round(H * 0.66);
  // clip the desk to the canvas (sharp refuses overlays that hang off the edge)
  const deskVisible = await sharp(desk).extract({ left: 0, top: 0, width: dm.width, height: Math.min(dm.height, H - deskY) }).png().toBuffer();

  // logo plate on the desk front, rounded corners
  const plateH = Math.round(H * 0.20);
  const plate = await sharp(f('logo.png')).resize({ height: plateH }).png().toBuffer();
  const pm = await sharp(plate).metadata();
  const r = Math.round(plateH * 0.12);
  const mask = Buffer.from(`<svg width="${pm.width}" height="${pm.height}"><rect x="0" y="0" width="${pm.width}" height="${pm.height}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
  const rounded = await sharp(plate).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const plateX = Math.round((W - pm.width) / 2);
  const plateY = Math.min(H - pm.height - 10, deskY + Math.round(dm.height * 0.30));

  await bg
    .composite([
      { input: left, left: lx, top: topY },
      { input: right, left: rx, top: topY },
      { input: deskVisible, left: deskX, top: deskY },
      { input: rounded, left: plateX, top: plateY },
    ])
    .png()
    .toFile(f('desk.png'));
  console.log(`desk.png ${W}x${H}: men ${lm.width}x${lm.height} @ ${lx}/${rx},${topY}; desk ${dm.width}x${dm.height} @ ${deskX},${deskY}; plate ${pm.width}x${pm.height} @ ${plateX},${plateY}`);
})();
