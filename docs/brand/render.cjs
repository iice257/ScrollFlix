const sharp = require('../../node_modules/sharp');
const o = __dirname + '/out/';
const r = (f, w, h) => sharp(o + f, { density: 400 }).resize(w, h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
(async () => {
  await sharp(o + 'favicon.svg', { density: 400 }).resize(32, 32).png().toFile(o + 'favicon-32.png');
  await sharp(o + 'app-icon-square.svg', { density: 400 }).resize(180, 180).png().toFile(o + 'apple-touch-icon.png');
  await sharp(o + 'app-icon-square.svg', { density: 400 }).resize(512, 512).png().toFile(o + 'icon-512.png');
  const W = 1600, H = 1020;
  const panel = (c) => sharp({ create: { width: 800, height: 700, channels: 3, background: c } }).png().toBuffer();
  const comp = [{ input: await panel('#0a0a0a'), left: 0, top: 0 }, { input: await panel('#f4f4f2'), left: 800, top: 0 }];
  for (const [t, ox] of [['dark', 0], ['light', 800]]) {
    comp.push({ input: await r(`logo-horizontal-${t}.svg`, 640, 190), left: ox + 80, top: 70 });
    comp.push({ input: await r(`logo-stacked-${t}.svg`, 260, 330), left: ox + 110, top: 320 });
    comp.push({ input: await r(`mark-${t}.svg`, 200, 200), left: ox + 500, top: 380 });
  }
  const sizes = [16, 32, 64];
  let x = 80;
  for (const s2 of sizes) { comp.push({ input: await sharp(o + 'favicon.svg', { density: 400 }).resize(s2, s2).png().toBuffer(), left: x, top: 800 }); x += s2 + 40; }
  comp.push({ input: await sharp(o + 'apple-touch-icon.png').toBuffer(), left: 400, top: 760 });
  comp.push({ input: await sharp(o + 'favicon.svg', { density: 400 }).resize(180, 180).png().toBuffer(), left: 640, top: 760 });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#fff' } }).composite(comp).png().toFile(__dirname + '/preview.png');
})();
