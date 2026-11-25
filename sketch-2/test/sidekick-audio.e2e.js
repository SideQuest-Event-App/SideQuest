// End-to-end check for Sidekick's in-app audio (WebRTC mesh, signalled through our server).
//
//   node test/sidekick-audio.e2e.js          # three people
//   node test/sidekick-audio.e2e.js 2        # two people
//
// What it does: starts the app on a free local port (no AI, no Google, no STUN), then opens three
// separate browser contexts with Chromium's fake microphone. The planner starts a call from /sk, two
// friends join from the link with "Join with voice", everyone taps "Talk in the app", and the test
// waits until every phone reports RTCPeerConnection.connectionState === "connected" with every
// other phone (window.__skAudioState()). It also checks that turning audio off drops the peer.
//
// Needs Playwright with Chromium (dev only; the app itself has no dependencies). Real phones on
// mobile networks may also need a TURN server; see the README.

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { chromium } = require("playwright");

const N = Math.max(2, Math.min(6, Number(process.argv[2]) || 3));
const ROOT = path.join(__dirname, "..");

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
async function waitFor(fn, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (err) { last = err.message; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

(async () => {
  const port = await freePort();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-audio-"));
  const server = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    env: { ...process.env, PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "", SIDEKICK_PLACES_OFF: "1", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const base = `http://localhost:${port}`;
  let browser;
  let failed = false;
  try {
    await waitFor(() => fetch(`${base}/api/sk/nights`).then((r) => r.ok), 20000, "the server");
    browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-features=WebRtcHideLocalIpsWithMdns"] });
    const pages = [];
    const errors = [];
    for (let i = 0; i < N; i++) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["microphone"] });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errors.push(`phone ${i + 1}: ${e.message}`));
      pages.push(page);
    }
    // The planner starts a call
    const [planner, ...friends] = pages;
    await planner.goto(`${base}/sk?quick=1`); // the one-page start screen (the Plan tab's steps are in plan-flow.e2e.js)
    await planner.fill("#name", "Asia");
    await planner.fill("#crew", "Audio test");
    if (!(await planner.$('.chips[data-name="nights"] .chip[aria-pressed=true]'))) await planner.click('.chips[data-name="nights"] .chip');
    await planner.click("#go");
    await planner.waitForURL(/\/sk\/[\w-]+$/);
    const link = planner.url();
    console.log(`Call: ${link}`);
    // Friends join from the link
    const names = ["Maya", "Jay", "Sam", "Lee", "Kai"];
    for (const [i, f] of friends.entries()) {
      await f.goto(link);
      await f.fill("#name", names[i]);
      await f.click("[data-mode=voice]");
      await f.waitForSelector("#dock #orbBtn");
    }
    await planner.waitForSelector("#dock #orbBtn");
    // Everyone turns on in-app audio (the "Talk in the app" switch is in the Sidekick orb's sheet)
    const audioSwitch = async (p) => {
      if (!(await p.$("#orbSheet"))) await p.click("#orbBtn");
      await p.click("#orbSheet #audioBtn");
    };
    for (const p of pages) await audioSwitch(p);
    const ids = await Promise.all(pages.map((p) => p.evaluate(() => JSON.parse(localStorage.getItem(`sk:${location.pathname.split("/")[2]}`)).person)));
    const states = await waitFor(async () => {
      const all = await Promise.all(pages.map((p) => p.evaluate(() => window.__skAudioState && window.__skAudioState())));
      const ok = all.every((s, i) => s && s.on && ids.filter((_, j) => j !== i).every((id) => s.peers[id] === "connected"));
      return ok ? all : null;
    }, 30000, "every pair to connect");
    states.forEach((s, i) => console.log(`phone ${i + 1}: ${Object.values(s.peers).join(", ")}`));
    console.log(`PASS  ${N} phones, ${(N * (N - 1)) / 2} audio connections, all "connected"`);
    // Remote audio is actually arriving (the fake mic plays a tone)
    const bytes = await planner.evaluate(async () => {
      const pcs = [...document.querySelectorAll("#skAudio audio")].map((a) => a.srcObject).filter(Boolean);
      return pcs.length;
    });
    if (bytes !== N - 1) throw new Error(`expected ${N - 1} remote audio streams on the planner's phone, got ${bytes}`);
    console.log(`PASS  the planner's phone plays ${bytes} remote audio streams`);
    // Turning audio off drops that person for everyone
    await audioSwitch(friends[0]);
    await waitFor(async () => {
      const s = await planner.evaluate(() => window.__skAudioState());
      return !s.peers[ids[1]];
    }, 10000, "the planner to drop the friend who left audio");
    console.log("PASS  leaving audio closes the connection on the other phones");
    if (errors.length) throw new Error(`Page errors:\n${errors.join("\n")}`);
  } catch (err) {
    failed = true;
    console.log(`FAIL  ${err.message}`);
    if (process.env.DEBUG) console.log(log);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  console.log(failed ? "\nFailed" : "\nAll passed");
  process.exit(failed ? 1 : 0);
})();
