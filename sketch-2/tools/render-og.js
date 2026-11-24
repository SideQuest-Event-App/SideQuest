// Renders the Sidekick invite card (public/og/invite.html) to the PNGs messaging apps show under a
// call link. Dev-only: uses Playwright, which the app itself doesn't need.
//
//   node tools/render-og.js                 # writes public/og/invite.jpg and invite-square.jpg
//   node tools/render-og.js path/to/other-card.html   # try another design (same sizes, same outputs)
//
// Messaging apps need PNG or JPG (not SVG). JPG keeps the soft city-light gradients small; WhatsApp
// skips images over ~300 KB. smallerPng() is kept for flat designs that suit PNG better.
// Fonts load from Google Fonts; if that's blocked, the card falls back to Inter or a system sans.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { chromium } = require("playwright");

const OUT = path.join(__dirname, "..", "public", "og");
const template = path.resolve(process.argv[2] || path.join(OUT, "invite.html"));
const SIZES = [
  { file: "invite.jpg", width: 1200, height: 630, query: "" },
  { file: "invite-square.jpg", width: 1200, height: 1200, query: "?square" },
];

// Re-encodes Chromium's PNG without the alpha channel, with the best filter per row and maximum
// compression. Same pixels, roughly a third smaller, still no dependencies.
function smallerPng(buf) {
  let pos = 8;
  let width, height, colorType;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; if (data[8] !== 8 || data[12] !== 0) return buf; }
    if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) return buf;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(width * height * 3);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) { // undo PNG filters
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
    }
    for (let x = 0; x < width; x++) line.copy(px, (y * width + x) * 3, x * bpp, x * bpp + 3);
    prev = line;
  }
  const s3 = width * 3;
  const out = Buffer.alloc((s3 + 1) * height);
  for (let y = 0; y < height; y++) { // pick the filter with the smallest sum per row
    const cur = px.subarray(y * s3, (y + 1) * s3);
    const up = y ? px.subarray((y - 1) * s3, y * s3) : Buffer.alloc(s3);
    let best = null, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const row = Buffer.alloc(s3 + 1);
      row[0] = f;
      let sum = 0;
      for (let i = 0; i < s3; i++) {
        const a = i >= 3 ? cur[i - 3] : 0, b = up[i], c = i >= 3 ? up[i - 3] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const v = (cur[i] - [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255;
        row[i + 1] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = row; }
    }
    best.copy(out, y * (s3 + 1));
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type, "latin1"); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([buf.subarray(0, 8), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(out, { level: 9, memLevel: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const s of SIZES) {
      const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1 });
      await page.goto(`file://${template}${s.query}`, { waitUntil: "load", timeout: 15000 }).catch((err) => console.warn(`Page load: ${err.message.split("\n")[0]}`));
      const fonts = await page.evaluate(() => Promise.race([document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`)), new Promise((r) => setTimeout(() => r(null), 5000))]));
      if (!fonts || !fonts.some((f) => /Geist/.test(f))) console.warn("Geist didn't load (no network?); using the fallback font.");
      const file = path.join(OUT, s.file);
      const shot = await page.screenshot({ type: "jpeg", quality: 86, clip: { x: 0, y: 0, width: s.width, height: s.height } });
      fs.writeFileSync(file, shot);
      console.log(`${path.relative(process.cwd(), file)}  ${s.width}x${s.height}  ${Math.round(fs.statSync(file).size / 1024)} KB`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
