// Sidekick's voice status, end to end: the pill in the call's top row, the "Tap to turn on sound" bar, the
// "Sidekick's voice" sheet, and the "[voice]" lines in the server log (what Render shows).
//
//   NODE_PATH=/opt/node-tools/node_modules node test/voice-status.e2e.js
//
// The app runs in this process with a fake ElevenLabs API (switchable per case), the browser gets a fake
// ElevenLabs SDK, a fake phone voice and a fake audio element, so each failure can be made on purpose:
//   a. the natural voice connects: "Connecting voice…", then "Voice on", which shrinks to a dot after 3 s
//   b. the agent can't connect (ElevenLabs 401): "Backup voice · Why?", the sheet says "No permission for this key"
//   c. ElevenLabs refuses the backup voice (401): "Backup voice", the sheet's backup row says why
//   d. ElevenLabs says the limit is reached (429): "Voice limit reached · Why?"
//   e. no key on the server and the phone's voice blocked: "No sound · Tap to fix", every row says why
//   f. the phone blocks play(): "No sound" and the "Tap to turn on sound" bar; one tap plays the line, the bar goes
//   g. POST /voice-report logs one line, cleaned; no log line holds the key, a name, a line said or a location
// Screenshots (375 px) go to VOICE_SHOTS (or a temp folder): voice-on, voice-backup, voice-nosound, voice-sheet.

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");

let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join("/opt/node-tools/node_modules", "playwright"))); }

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-voicestatus-"));
const SHOTS = process.env.VOICE_SHOTS || path.join(tmp, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
let failures = 0;
async function test(name, fn) {
  try { await fn(); out(`PASS  ${name}`); } catch (err) { failures++; out(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}
const out = console.log.bind(console);
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (err) { last = err.message; } await wait(50); }
  throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

const KEY = "sk-test-SECRET-key-7781";
const FAKE_SDK = `
const el = (window.__el = window.__el || { sessions: [] });
export const Conversation = {
  async startSession(opts) {
    const s = { opts, sendContextualUpdate() {}, sendUserMessage() {}, async endSession() {} };
    el.sessions.push(s);
    return s;
  },
};`;
// Before any page script: a phone voice and an audio element the test controls
const INIT = () => {
  window.__phone = "ok"; // "ok" speaks, "blocked" never starts (the way a locked-down phone behaves)
  window.__playBlock = false; // true: audio.play() rejects with NotAllowedError, as iPhones do before a tap
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = (u) => { if (window.__phone === "ok") setTimeout(() => { u.onstart && u.onstart(); setTimeout(() => u.onend && u.onend(), 20); }, 5); };
    window.speechSynthesis.cancel = () => {};
  }
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (/^data:audio\/wav/.test(this.src || "")) return Promise.resolve(); // the silent unlock
    if (window.__playBlock) return Promise.reject(new DOMException("play() needs a tap", "NotAllowedError"));
    setTimeout(() => this.dispatchEvent(new Event("ended")), 60);
    return Promise.resolve();
  };
  void play;
};

(async () => {
  const port = await freePort();
  Object.assign(process.env, {
    PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "",
    SIDEKICK_PLACES_OFF: "1", SIDEKICK_STUN_URL: "off",
    ELEVENLABS_API_KEY: KEY, ELEVENLABS_AGENT_FRIEND: "agent_friend", ELEVENLABS_AGENT_CONCIERGE: "agent_concierge",
    ELEVENLABS_MINUTES_PER_MONTH: "100", ELEVENLABS_STOP_AT: "1", ELEVENLABS_DAILY_MINUTES: "100", ELEVENLABS_MAX_CALL_MINUTES: "10",
  });
  for (const k of ["SUPABASE_URL", "SIDEKICK_ELEVENLABS_OFF", "ELEVENLABS_TTS_OFF", "ELEVENLABS_BASE_URL"]) delete process.env[k];

  // ---------- the fake ElevenLabs API: each case sets how it answers ----------
  const mode = { tts: 200, agent: 200 };
  const realFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    url = String(url);
    if (url.startsWith("https://api.elevenlabs.io/")) {
      if (url.includes("/convai/conversation/")) {
        if (mode.agent !== 200) return { ok: false, status: mode.agent, json: async () => ({}), text: async () => "no" };
        return { ok: true, json: async () => (url.includes("/token") ? { token: "fake-token" } : { signed_url: "wss://example.test/x" }) };
      }
      if (url.includes("/text-to-speech/")) {
        if (mode.tts !== 200) return { ok: false, status: mode.tts, arrayBuffer: async () => new ArrayBuffer(0) };
        return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]).buffer };
      }
    }
    return realFetch(url, opts);
  };
  // Every server log line, kept here (and not printed)
  const logs = [];
  for (const k of ["log", "error", "warn", "info"]) console[k] = (...args) => logs.push(args.map(String).join(" "));
  const ai = require(path.join(ROOT, "lib", "ai"));
  ai.match = async () => ({ matches: [] });

  require(path.join(ROOT, "server.js"));
  const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
  const T = R._test;
  const tts = require(path.join(ROOT, "lib", "sidekick", "tts"));
  const base = `http://localhost:${port}`;
  await until(() => realFetch(`${base}/api/sk/nights`).then((r) => r.ok), 30000, "the server");
  const post = (p, body) => realFetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const pageErrors = [];
  // The planner's phone, through the one-page start screen; then a friend joins so Sidekick speaks
  async function call({ agent = false, before } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, permissions: ["microphone"] });
    await ctx.route(/cdn\.jsdelivr\.net\/npm\/@elevenlabs\/client/, (route) => route.fulfill({ status: 200, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" }, body: FAKE_SDK }));
    await ctx.addInitScript(INIT);
    await ctx.addInitScript((a) => { try { localStorage.setItem("sk:agentVoice", a ? "true" : "false"); } catch {} }, agent);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.goto(`${base}/sk?quick=1`);
    if (before) await page.evaluate(before);
    await page.fill("#name", "Asia");
    await page.fill("#crew", "Voice crew");
    if (!(await page.$('.chips[data-name="nights"] .chip[aria-pressed=true]'))) await page.click('.chips[data-name="nights"] .chip');
    await page.click('.chips[data-name="origin"] .chip[data-value="union"]');
    await page.click("#go");
    await page.waitForURL(/\/sk\/[\w-]+$/);
    const rid = page.url().split("/sk/")[1];
    await page.waitForSelector("#dock .ctrls");
    if (before) await page.evaluate(before);
    // The People sheet a planner sees on starting alone: close it
    if (await page.waitForSelector("#sheet [role=dialog]", { timeout: 3000 }).catch(() => null)) await page.keyboard.press("Escape");
    return { ctx, page, rid, room: T.rooms.get(rid) };
  }
  const friend = (rid) => post(`/api/sk/rooms/${rid}/join`, { name: "Maya", mode: "text", answers: {} });
  const pill = (page) => page.evaluate(() => { const p = document.getElementById("voicePill"); return p ? p.dataset.vstate + (p.classList.contains("dot") ? ":dot" : "") : null; });
  const rowText = (page, path) => page.$eval(`#voiceSheet [data-vpath="${path}"]`, (e) => e.textContent.replace(/\s+/g, " ").trim());
  const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });
  const roomTag = (rid) => `room=${rid.slice(0, 4)}`;

  try {
    await test("a. The natural voice connects: Connecting voice…, then Voice on, then a green dot after 3 s", async () => {
      mode.agent = 200; mode.tts = 200;
      const c = await call({ agent: true });
      await until(async () => /^(connecting|on)/.test((await pill(c.page)) || ""), 6000, "the pill");
      await until(async () => (await pill(c.page)) === "on", 8000, "Voice on");
      assert.strictEqual((await c.page.textContent("#voicePill")).trim(), "Voice on");
      const fit = await c.page.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
      assert(fit.sh <= fit.ih && fit.sw <= fit.iw, `no scroll at 375 with the pill (${JSON.stringify(fit)})`);
      await shot(c.page, "voice-on.png");
      await until(async () => (await pill(c.page)) === "on:dot", 5000, "the dot after 3 s");
      assert(logs.some((l) => l.includes(`[voice] ${roomTag(c.rid)} agent requested key=yes agent=yes`)), "agent requested, logged");
      assert(logs.some((l) => l.includes(`[voice] ${roomTag(c.rid)} agent session token=ok signed_url=ok`)), "session result, logged");
      await until(() => logs.some((l) => l.includes(`[voice] ${roomTag(c.rid)} agent live`)), 4000, "agent live, logged");
      // Turning the natural voice off ends the session
      await c.page.click("#orbBtn");
      await c.page.click("#orbSheet #agent");
      await until(() => logs.some((l) => l.includes(`[voice] ${roomTag(c.rid)} agent ended secs=`)), 6000, "agent ended, logged");
      await c.ctx.close();
    });

    await test("b. The agent can't connect (401): Backup voice · Why?, and the sheet says why", async () => {
      mode.agent = 401; mode.tts = 200;
      const c = await call({ agent: true });
      await friend(c.rid);
      await until(async () => (await pill(c.page)) === "backup", 10000, "Backup voice");
      assert.match((await c.page.textContent("#voicePill")).replace(/\s+/g, " "), /Backup voice\s*Why\?/);
      await wait(300);
      await shot(c.page, "voice-backup.png");
      await c.page.click("#voicePill");
      await c.page.waitForSelector("#voiceSheet [role=dialog]");
      assert.match(await rowText(c.page, "agent"), /^No permission for this key/);
      assert.match(await rowText(c.page, "backup"), /^Working/);
      assert(await c.page.evaluate(() => document.getElementById("voiceSheet").contains(document.activeElement)), "focus in the sheet");
      for (let i = 0; i < 4; i++) await c.page.keyboard.press("Tab");
      assert(await c.page.evaluate(() => document.getElementById("voiceSheet").contains(document.activeElement)), "Tab stays in the sheet");
      await wait(300);
      await shot(c.page, "voice-sheet.png");
      await c.page.keyboard.press("Escape");
      assert.strictEqual(await c.page.locator("#voiceSheet").count(), 0, "Escape closes it");
      assert.strictEqual(await c.page.evaluate(() => document.activeElement.id), "voicePill", "focus back on the pill");
      assert(logs.some((l) => l.includes(`[voice] ${roomTag(c.rid)} agent session token=401 signed_url=401`)), "the ElevenLabs status, logged");
      await until(() => logs.some((l) => l.includes(`[voice] ${roomTag(c.rid)} report path=agent reason=failed:upstream-401`)), 4000, "the phone's report, logged");
      assert(logs.some((l) => /\[voice\] tts 200 chars=\d+ cache=(hit|miss) left=\d+/.test(l)), "each TTS request, logged with the meter");
      await c.ctx.close();
    });

    await test("c. ElevenLabs refuses the backup voice (401): Backup voice, and the sheet's backup row says why", async () => {
      mode.agent = 200; mode.tts = 401;
      tts._reset();
      const c = await call({ agent: false });
      await friend(c.rid);
      await until(async () => (await pill(c.page)) === "backup", 10000, "Backup voice (the phone's voice carries on)");
      await c.page.click("#voicePill");
      await c.page.waitForSelector("#voiceSheet [role=dialog]");
      assert.match(await rowText(c.page, "backup"), /^No permission for this key/);
      assert.match(await rowText(c.page, "phone"), /^Working/);
      assert(logs.some((l) => /\[voice\] tts 502 reason=upstream-401 elevenlabs=401 chars=\d+ cache=miss/.test(l)), "the 401, logged");
      await c.ctx.close();
    });

    await test("d. ElevenLabs says the limit is reached (429): Voice limit reached · Why?", async () => {
      mode.tts = 429;
      tts._reset();
      const c = await call({ agent: false });
      await friend(c.rid);
      await until(async () => (await pill(c.page)) === "limit", 10000, "Voice limit reached");
      assert.match((await c.page.textContent("#voicePill")).replace(/\s+/g, " "), /Voice limit reached\s*Why\?/);
      await c.page.click("#voicePill");
      await c.page.waitForSelector("#voiceSheet [role=dialog]");
      assert.match(await rowText(c.page, "backup"), /^Daily limit reached/);
      await c.ctx.close();
    });

    await test("e. No key on the server and the phone's voice blocked: No sound · Tap to fix, and every row says why", async () => {
      mode.tts = 200;
      process.env.ELEVENLABS_API_KEY = "";
      const c = await call({ agent: true, before: () => { window.__phone = "blocked"; } });
      await friend(c.rid);
      await until(async () => (await pill(c.page)) === "nosound", 12000, "No sound");
      assert.match((await c.page.textContent("#voicePill")).replace(/\s+/g, " "), /No sound\s*Tap to fix/);
      await c.page.click("#voicePill");
      await c.page.waitForSelector("#voiceSheet [role=dialog]");
      assert.match(await rowText(c.page, "agent"), /^Not set up/);
      assert.match(await rowText(c.page, "backup"), /^Not set up/);
      assert.match(await rowText(c.page, "phone"), /^Blocked by/);
      assert(/missing the ElevenLabs settings/.test(await c.page.textContent("#voiceSheet")), "the tip for Not set up");
      assert(logs.some((l) => /\[voice\] tts 503 reason=no-key chars=\d+/.test(l)), "no key, logged");
      await until(() => logs.some((l) => l.includes(`[voice] ${roomTag(c.rid)} report path=phone reason=blocked`)), 4000, "the phone's report");
      process.env.ELEVENLABS_API_KEY = KEY;
      await c.ctx.close();
    });

    await test("f. The phone blocks play(): No sound and the Tap to turn on sound bar; one tap plays the line and the bar goes", async () => {
      mode.tts = 200;
      tts._reset();
      const c = await call({ agent: false, before: () => { window.__playBlock = true; window.__phone = "blocked"; } });
      await friend(c.rid);
      await c.page.waitForSelector("#soundBar", { timeout: 12000 });
      assert.strictEqual(await pill(c.page), "nosound");
      assert.match(await c.page.textContent("#soundBar"), /Tap to turn on sound/);
      const fit = await c.page.evaluate(() => ({ sh: document.scrollingElement.scrollHeight, ih: innerHeight }));
      assert(fit.sh <= fit.ih, `no page scroll with the bar (${fit.sh} > ${fit.ih})`);
      await wait(300);
      await shot(c.page, "voice-nosound.png");
      await until(() => logs.some((l) => l.includes(`[voice] ${roomTag(c.rid)} report path=play reason=NotAllowedError ua="`)), 4000, "the blocked play, reported");
      const before = await c.page.evaluate(() => window.__skTts || 0);
      await c.page.evaluate(() => { window.__playBlock = false; });
      await c.page.click("#soundBar");
      await until(() => c.page.evaluate((n) => (window.__skTts || 0) > n, before), 6000, "the line played again");
      await c.page.waitForFunction(() => !document.getElementById("soundBar"));
      await c.ctx.close();
    });

    await test("g. The voice-report endpoint logs one cleaned line; no log line holds the key, a name or a line said", async () => {
      const c = await call({ agent: false });
      const r = await post(`/api/sk/rooms/${c.rid}/voice-report`, { p: c.room.people[0].id, path: "backup", reason: "refused:401 <script>", ua: "iPhone Safari; Asia's phone at 43.65,-79.38" });
      assert.strictEqual(r.status, 200);
      const line = logs.find((l) => l.includes(`[voice] ${roomTag(c.rid)} report path=backup`));
      assert(line, "logged");
      assert(!/<script>|;|,/.test(line.split("report ")[1]), `cleaned: ${line}`);
      assert.strictEqual((await post(`/api/sk/rooms/${c.rid}/voice-report`, { p: "nobody", path: "agent", reason: "x" })).status, 403, "only people on the call");
      await c.ctx.close();
      const voice = logs.filter((l) => l.includes("[voice]"));
      assert(voice.length >= 10, `voice lines logged (${voice.length})`);
      for (const l of voice) {
        assert(!l.includes(KEY) && !/xi-api-key|sk-test/i.test(l), `no key: ${l}`);
        assert(!/\b(Asia|Maya|Voice crew)\b/.test(l), `no names: ${l}`);
        assert(!/what are you in the mood|Saturday|after 8/i.test(l), `no transcript: ${l}`);
      }
      assert(!logs.some((l) => l.includes(KEY)), "the key appears in no log line at all");
    });

    assert.deepStrictEqual(pageErrors, [], "page errors");
  } catch (err) {
    failures++;
    out(`FAIL  ${err.stack || err.message}`);
  } finally {
    await browser.close();
    out(`Screenshots: ${SHOTS}`);
    out(failures ? `${failures} failed` : "All passed");
    process.exit(failures ? 1 : 0);
  }
})();
