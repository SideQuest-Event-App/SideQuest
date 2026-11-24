// Invite links and in-app audio signalling, against a real local server.
//  - /sk/<room> has Open Graph and Twitter tags (crew name and nights only), with absolute https URLs
//    built from Render's x-forwarded-* headers, and og:image is a 1200x630 JPEG (square one 1200x1200).
//  - /api/sk/rooms/<id>/signal only works for people in the call, checks sizes, and delivers on the
//    target's live stream as a "signal" event.
//
//   node test/sidekick-share.js

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const http = require("http");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.message}`); }
}
// Reads width and height from a JPEG's start-of-frame marker
function jpegSize(buf) {
  assert.strictEqual(buf.subarray(0, 2).toString("hex"), "ffd8", "not a JPEG");
  for (let i = 2; i < buf.length; ) {
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  throw new Error("no frame header");
}
const metaOf = (html) => {
  const out = {};
  for (const m of html.matchAll(/<meta (property|name)="([^"]+)" content="([^"]*)">/g)) (out[m[2]] = out[m[2]] || []).push(m[3].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
  return out;
};

(async () => {
  const port = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-share-"));
  const server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "", SIDEKICK_PLACES_OFF: "1", SIDEKICK_ELEVENLABS_OFF: "1" },
    stdio: "ignore",
  });
  const base = `http://localhost:${port}`;
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  try {
    for (let i = 0; i < 80; i++) { try { if ((await fetch(`${base}/api/sk/nights`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
    const nights = (await (await fetch(`${base}/api/sk/nights`)).json()).nights;
    const fri = nights.find((n) => /^Fri/.test(n.label)) || nights[0];
    const sat = nights.find((n) => /^Sat/.test(n.label)) || nights[1];
    const { body: made } = await post("/api/sk/rooms", { name: "Asia", crew: "Sat squad", nights: [fri.date, sat.date] });
    const { body: joined } = await post(`/api/sk/rooms/${made.room}/join`, { name: "Maya", mode: "voice", answers: { budget: "20", nos: ["Scarborough"] } });
    const page = (p, headers = {}) => fetch(base + p, { headers }).then((r) => r.text());

    await test("A room link has Open Graph and Twitter tags with the crew name and nights", async () => {
      const html = await page(`/sk/${made.room}`, { "x-forwarded-host": "sidequest-sk.onrender.com", "x-forwarded-proto": "https" });
      const m = metaOf(html);
      assert.strictEqual(m["og:title"][0], "Sat squad: help plan our next night");
      assert.match(m["og:description"][0], new RegExp(`^Sidekick's planning ${fri.label.slice(0, 3)} or ${sat.label.slice(0, 3)}\\. Join the call or answer in 30 seconds\\. No app needed\\.$`));
      assert.strictEqual(m["og:url"][0], `https://sidequest-sk.onrender.com/sk/${made.room}`);
      assert.strictEqual(m["og:image"][0], "https://sidequest-sk.onrender.com/og/invite.jpg");
      assert.strictEqual(m["og:image:width"][0], "1200");
      assert.strictEqual(m["og:image:height"][0], "630");
      assert.strictEqual(m["og:image"][1], "https://sidequest-sk.onrender.com/og/invite-square.jpg");
      assert.strictEqual(m["twitter:card"][0], "summary_large_image");
      assert.strictEqual(m["twitter:image"][0], m["og:image"][0]);
      assert.match(html, /<title>Sat squad: help plan our next night · Sidekick<\/title>/);
      console.log(`        "${m["og:title"][0]}" / "${m["og:description"][0]}"`);
    });

    await test("Previews never include people's names or private answers", async () => {
      const head = (await page(`/sk/${made.room}`)).split("</head>")[0];
      for (const bad of ["Asia", "Maya", "Scarborough", "$20", "Under $20"]) assert(!head.includes(bad), `found "${bad}" in the preview`);
    });

    await test("og:image is a 1200x630 JPEG and the square one is 1200x1200", async () => {
      for (const [file, w, h] of [["/og/invite.jpg", 1200, 630], ["/og/invite-square.jpg", 1200, 1200]]) {
        const r = await fetch(base + file);
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.headers.get("content-type"), "image/jpeg");
        const buf = Buffer.from(await r.arrayBuffer());
        assert.deepStrictEqual(jpegSize(buf), { width: w, height: h });
        assert(buf.length < 300 * 1024, `${file} is ${Math.round(buf.length / 1024)} KB; WhatsApp skips images over ~300 KB`);
      }
    });

    await test("An unknown or ended room gets generic text, and plain http locally", async () => {
      const m = metaOf(await page("/sk/doesnotexist"));
      assert.strictEqual(m["og:title"][0], "Help plan our next night");
      assert.match(m["og:image"][0], /^http:\/\/localhost:\d+\/og\/invite\.jpg$/);
      const start = metaOf(await page("/sk"));
      assert.strictEqual(start["og:title"][0], "Plan a night with Sidekick");
    });

    await test("A crew name can't break out of the tags", async () => {
      const { body } = await post("/api/sk/rooms", { name: "X", crew: '"><script>alert(1)</script>', nights: [fri.date] });
      const html = await page(`/sk/${body.room}`);
      assert(!html.includes("<script>alert(1)"), "unescaped crew name");
    });

    await test("Signal: only people in the call, known kinds, limited size", async () => {
      const url = `/api/sk/rooms/${made.room}/signal`;
      assert.strictEqual((await post(url, { p: "nobody", to: joined.person, kind: "offer", data: {} })).status, 403);
      assert.strictEqual((await post(url, { p: made.person, to: "nobody", kind: "offer", data: {} })).status, 400);
      assert.strictEqual((await post(url, { p: made.person, to: made.person, kind: "offer", data: {} })).status, 400);
      assert.strictEqual((await post(url, { p: made.person, to: joined.person, kind: "hack", data: {} })).status, 400);
      assert.strictEqual((await post(url, { p: made.person, to: joined.person, kind: "offer", data: { sdp: "x".repeat(30000) } })).status, 413);
    });

    await test("Signal: delivered on the target's stream (queued while they're away)", async () => {
      const url = `/api/sk/rooms/${made.room}/signal`;
      // Maya isn't connected yet: this one waits in the queue
      assert.strictEqual((await post(url, { p: made.person, to: joined.person, kind: "offer", data: { type: "offer", sdp: "v=0 test" } })).status, 200);
      const got = await new Promise((resolve, reject) => {
        const req = http.get(`${base}/api/sk/rooms/${made.room}/stream?p=${joined.person}`, (res) => {
          let buf = "";
          res.on("data", (d) => {
            buf += d;
            const m = buf.match(/event: signal\ndata: (.+)\n\n/);
            if (m) { req.destroy(); resolve(JSON.parse(m[1])); }
          });
        });
        req.on("error", (e) => (e.code === "ECONNRESET" ? null : reject(e)));
        setTimeout(() => reject(new Error("no signal on the stream")), 4000);
      });
      assert.deepStrictEqual(got, { from: made.person, kind: "offer", data: { type: "offer", sdp: "v=0 test" } });
    });

    await test("Audio: joining returns ICE servers (STUN by default)", async () => {
      const { status, body } = await post(`/api/sk/rooms/${made.room}/audio`, { p: joined.person, on: true });
      assert.strictEqual(status, 200);
      assert(body.iceServers.some((s) => s.urls.includes("stun:stun.l.google.com:19302")));
      assert(!body.iceServers.some((s) => s.username), "no TURN unless it's set");
    });

    await test("A gone room says so, with the server's boot id (so phones can tell a restart)", async () => {
      const r = await fetch(`${base}/api/sk/rooms/zzzzzz/info`);
      const body = await r.json();
      assert.strictEqual(r.status, 404);
      assert.strictEqual(body.gone, true);
      assert(body.boot);
    });
  } finally {
    server.kill();
  }
  console.log(failures ? `\n${failures} failed` : "\nAll passed");
  process.exit(failures ? 1 : 0);
})();
