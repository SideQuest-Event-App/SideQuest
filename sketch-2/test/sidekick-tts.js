// Sidekick's lines in the ElevenLabs voices (lib/sidekick/tts.js, POST /api/sk/tts), against a fake ElevenLabs:
//  (a) each persona gets its own voice id, with the agents' model (eleven_flash_v2), and the audio comes back
//  (b) the same line again comes from memory: no second request, no characters counted
//  (c) the characters meter stops at its cap, and the route answers { fallback: true }
//  (d) an ElevenLabs failure gives the characters back and answers { fallback: true }; no key means no request
//  (e) in the browser: a call line plays the ElevenLabs audio (mocked route), and when the route fails the
//      phone's own voice says it instead (needs Playwright)
//
//   NODE_PATH=/opt/node-tools/node_modules node test/sidekick-tts.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const net = require("net");
const assert = require("assert");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-tts-"));
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A short silent WAV: what the fake ElevenLabs (and the mocked route) answer with
function wav(ms = 300) {
  const n = Math.round(8 * ms);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVEfmt ", 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return b;
}

(async () => {
  // ---------- the fake ElevenLabs ----------
  const calls = [];
  let failNext = false;
  const fake = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      calls.push({ url: req.url, key: req.headers["xi-api-key"], body: JSON.parse(body || "{}") });
      if (failNext) { failNext = false; res.writeHead(500); return res.end("boom"); }
      res.writeHead(200, { "content-type": "audio/mpeg" });
      res.end(wav());
    });
  });
  const fakePort = await freePort();
  await new Promise((r) => fake.listen(fakePort, r));

  Object.assign(process.env, {
    SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), ELEVENLABS_API_KEY: "dummy-key", ELEVENLABS_BASE_URL: `http://localhost:${fakePort}`,
    ELEVENLABS_TTS_CHARS_PER_MONTH: "10000", ELEVENLABS_TTS_DAILY_CHARS: "200",
  });
  delete process.env.ELEVENLABS_VOICE_FRIEND;
  delete process.env.ELEVENLABS_VOICE_CONCIERGE;
  delete process.env.SIDEKICK_ELEVENLABS_OFF;
  const usage = require(path.join(ROOT, "lib", "sidekick", "usage"));
  const tts = require(path.join(ROOT, "lib", "sidekick", "tts"));
  usage._reset();
  const chars = async () => (await usage.status()).elevenlabs_tts_chars.used.day;

  await test("(a) Each persona speaks in its own ElevenLabs voice, with the agents' model", async () => {
    const f = await tts.speech("Hey Asia. Your calendar's looking suspiciously free.", "friend");
    const c = await tts.speech("Welcome back, Asia.", "concierge");
    assert(f.audio && f.audio.length > 44 && c.audio, "audio came back");
    assert.strictEqual(calls[0].url.split("?")[0], "/v1/text-to-speech/UgBBYS2sOqTuMpoF3BR0", "the friend's voice");
    assert.strictEqual(calls[1].url.split("?")[0], "/v1/text-to-speech/Qggl4b0xRMiqOwhPtVWT", "the concierge's voice");
    assert.strictEqual(calls[0].body.model_id, "eleven_flash_v2");
    assert.strictEqual(calls[0].key, "dummy-key");
    assert.strictEqual(await chars(), "Hey Asia. Your calendar's looking suspiciously free.".length + "Welcome back, Asia.".length, "characters are counted");
    // The old persona names and an env voice id work too
    process.env.ELEVENLABS_VOICE_FRIEND = "voice_from_env";
    assert.strictEqual(tts.voiceFor("host"), "voice_from_env");
    delete process.env.ELEVENLABS_VOICE_FRIEND;
  });

  await test("(b) The same line again comes from memory: no request, nothing counted", async () => {
    const before = { n: calls.length, chars: await chars() };
    const again = await tts.speech("Hey Asia.  Your calendar's looking suspiciously free.", "friend");
    assert.strictEqual(again.cached, true);
    assert.strictEqual(calls.length, before.n, "no second request");
    assert.strictEqual(await chars(), before.chars, "no characters counted");
    assert(tts.stats.hits >= 1);
  });

  await test("(c) The meter stops at its cap and the route says to fall back", async () => {
    const n = calls.length;
    let out;
    for (let i = 0; i < 10; i++) { out = await tts.speech(`A brand new line number ${i} that nobody has said before, padded out.`, "concierge"); if (out.fallback) break; }
    assert(out.fallback && out.capped && out.status === 429, "capped");
    assert((await chars()) <= 200, `never past the daily cap (${await chars()})`);
    const sent = calls.length - n;
    assert(sent >= 1 && sent < 10, `requests stop at the cap (${sent})`);
  });

  await test("(d) A failure gives the characters back; no key, no request", async () => {
    usage._reset();
    failNext = true;
    const out = await tts.speech("This one fails.", "friend");
    assert(out.fallback && out.status === 502, JSON.stringify(out));
    assert.strictEqual(await chars(), 0, "characters given back");
    const n = calls.length;
    delete process.env.ELEVENLABS_API_KEY;
    const none = await tts.speech("No key here.", "friend");
    assert(none.fallback && none.status === 503);
    assert.strictEqual(calls.length, n, "nothing sent without a key");
    process.env.ELEVENLABS_API_KEY = "dummy-key";
  });

  // ---------- (e) the browser ----------
  let chromium;
  try { ({ chromium } = require("playwright")); } catch { try { ({ chromium } = require(path.join("/opt/node-tools/node_modules", "playwright"))); } catch {} }
  if (!chromium) console.log("SKIP  (e) Playwright isn't installed");
  else {
    const DB = path.join(ROOT, "data", "db.json");
    const backup = fs.existsSync(DB) ? fs.readFileSync(DB) : null;
    const port = await freePort();
    const server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
      env: { ...process.env, PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage2.json"), AI: "off", ANTHROPIC_API_KEY: "", SUPABASE_URL: "", SUPABASE_SECRET_KEY: "", SIDEKICK_PLACES_OFF: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    server.stdout.on("data", (d) => (log += d));
    server.stderr.on("data", (d) => (log += d));
    const base = `http://localhost:${port}`;
    const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
    try {
      for (let i = 0; i < 100; i++) { try { if ((await fetch(`${base}/api/sk/nights`)).ok) break; } catch {} await wait(200); }
      const page0 = async (route) => {
        const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
        await ctx.route("**/*", (rt) => (new URL(rt.request().url()).hostname === "localhost" ? rt.continue() : rt.abort()));
        // Record what the phone's own voice says
        await ctx.addInitScript(() => {
          window.__spoken = [];
          if (window.speechSynthesis) { speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 10); }; }
        });
        const page = await ctx.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const asked = [];
        await page.route("**/api/sk/tts", (rt) => { asked.push(rt.request().postDataJSON()); return route(rt); });
        return { ctx, page, asked, errors };
      };
      // (The Plan tab's spoken intro went with the redesign; the call's lines take the same path.)
      const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      const nights = (await (await fetch(`${base}/api/sk/nights`)).json()).nights;
      const callPage = async (persona, route) => {
        const made = await post("/api/sk/rooms", { name: "Asia", crew: "Tts crew", nights: [nights[2].date], persona });
        const ph = await page0(route);
        await ph.ctx.addInitScript(([r, p]) => { localStorage.setItem(`sk:${r}`, JSON.stringify({ person: p, mode: "text" })); localStorage.setItem("sk:agentVoice", "false"); }, [made.room, made.person]);
        await ph.page.goto(`${base}/sk/${made.room}`);
        await ph.page.waitForSelector("#dock .ctrls");
        await post(`/api/sk/rooms/${made.room}/join`, { name: "Ravi", mode: "text", answers: {} }); // the call opens with a line
        return ph;
      };
      await test("(e) The call's lines play in the ElevenLabs voice; when that fails, the phone's voice says them", async () => {
        const ok = await callPage("friend", (rt) => rt.fulfill({ status: 200, contentType: "audio/mpeg", body: wav(400) }));
        await ok.page.waitForFunction(() => window.__skTts >= 1, null, { timeout: 8000 });
        assert.strictEqual(ok.asked[0].persona, "friend", "the A/B persona's voice");
        assert(ok.asked[0].text.length > 10, "a whole line");
        assert.deepStrictEqual(await ok.page.evaluate(() => window.__spoken.filter(Boolean)), [], "the built-in voice stayed quiet");
        assert.deepStrictEqual(ok.errors, []);
        await ok.ctx.close();
        const bad = await callPage("concierge", (rt) => rt.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "nope", fallback: true }) }));
        await bad.page.waitForFunction(() => window.__spoken.some((t) => t && t.length > 10), null, { timeout: 8000 });
        assert.strictEqual(bad.asked[0].persona, "concierge");
        assert(!(await bad.page.evaluate(() => window.__skTts)), "no ElevenLabs audio played");
        assert.deepStrictEqual(bad.errors, []);
        await bad.ctx.close();
      });
    } finally {
      await browser.close();
      server.kill();
      await wait(300);
      if (backup) fs.writeFileSync(DB, backup);
      if (process.env.DEBUG) console.log(log);
    }
  }
  fake.close();
  console.log(failures ? `${failures} failed` : "All passed");
  process.exit(failures ? 1 : 0);
})();
