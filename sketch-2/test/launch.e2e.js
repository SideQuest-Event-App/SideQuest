// The launch experience, end to end in a real browser against the real server:
// the S3 "City lights" loader and the L2 "Map first" Discover screen.
//
//  a. A fast load: the loader is visible for no more than 300 ms, and the map is the first screen.
//  b. A slow load (the API held back 3 s): after 1 s the loader says what's happening, then fades out.
//  c. Reduced motion: a still loader.
//  d. No location prompt on load; granting it after a tap re-centres the map and shows "You · <neighbourhood>".
//  e. Event pins and place pins differ in shape and label; the legend chips toggle them.
//  f. The cards: event (ticket, "Sat · starts 7:30 PM", price, See tickets) and place (hours, price,
//     Directions, Google Maps attribution).
//  g. The sheet's stops work by drag and by the List and Map buttons, and the last stop is remembered.
//  h. Plan opens /sk; Add Event is reachable from Sidequests.
//  i. At 375 and 1280 px: no sideways overflow, nothing under the tab bar, 44 px targets, weights 400/500/600 only.
//
// The server runs in this process so Google Places can be faked: nothing here ever calls Google. Every other
// outside request (map tiles, the MapLibre script, fonts) is blocked, so the light map stands in.
// The database file is copied first and put back afterwards.
//
//   NODE_PATH=/opt/node-tools/node_modules node test/launch.e2e.js
//   LAUNCH_SHOTS=/some/folder ... to keep the screenshots (375 px, 2x)

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "launch-"));
const SHOTS = process.env.LAUNCH_SHOTS || path.join(tmp, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Keep the real database and logs as they were
const DATA = path.join(ROOT, "data");
const KEEP = ["db.json", "analytics.jsonl"];
const saved = {};
for (const f of KEEP) { const p = path.join(DATA, f); if (fs.existsSync(p)) { saved[f] = path.join(tmp, f); fs.copyFileSync(p, saved[f]); } }
function restore() {
  for (const f of KEEP) {
    const p = path.join(DATA, f);
    if (saved[f]) fs.copyFileSync(saved[f], p);
    else if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

const SPOT = { latitude: 43.65468, longitude: -79.40061 }; // by Kensington Market; rounds to 43.65, -79.40

(async () => {
  const port = await freePort();
  Object.assign(process.env, {
    PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "",
    GOOGLE_MAPS_API_KEY: "test-key", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off",
  });
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SIDEKICK_PLACES_OFF;

  // ---------- Google Places, faked (and counted) ----------
  const google = [];
  const realFetch = global.fetch;
  const evenings = { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 0 }, close: { day: (d + 1) % 7, hour: 1 } })) }; // open 0:00 to 1 AM next day: always open, "until 1 AM"
  const fakePlace = (n, name, lat, lng, types, level, start) => ({ id: `launch_place_${n}`, displayName: { text: name }, formattedAddress: `${n} College St, Toronto`, location: { latitude: lat, longitude: lng }, types, primaryType: types[0], priceLevel: level, ...(start ? { priceRange: { startPrice: { units: String(start) } } } : {}), rating: 4.5, userRatingCount: 300, googleMapsUri: `https://maps.google.com/?cid=${n}`, regularOpeningHours: evenings });
  global.fetch = async (url, opts = {}) => {
    if (String(url).startsWith("https://places.googleapis.com/")) {
      google.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ places: [
        fakePlace(1, "Snakes & Lattes Annex", 43.6655, -79.4105, ["cafe"], "PRICE_LEVEL_INEXPENSIVE", 15),
        fakePlace(2, "The Rex Hotel Jazz & Blues Bar", 43.6504, -79.3881, ["bar", "live_music_venue"], "PRICE_LEVEL_INEXPENSIVE", 15),
        fakePlace(3, "Track & Field", 43.6532, -79.4043, ["bar"], "PRICE_LEVEL_MODERATE"),
      ] }) };
    }
    return realFetch(url, opts);
  };

  require(path.join(ROOT, "server.js"));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 160; i++) { try { if ((await realFetch(`${base}/api/state`)).ok) break; } catch {} await wait(250); }
  const act = async (type, args, user) => {
    const r = await realFetch(`${base}/api/act`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, type, args }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    return body.result;
  };
  // A finished account: signed up, two or more vibes, onboarding done
  const stamp = Date.now().toString(36);
  const { userId } = await act("signup", { name: "Launch Test", email: `launch-${stamp}@example.com`, username: `launch_${stamp}` });
  await act("setProfile", { vibes: ["Live music", "Jazz", "Comedy", "Food & drink"], origin: "union", budget: 40, registered: true }, userId);

  let chromium;
  try { ({ chromium } = require("playwright")); } catch { chromium = null; }
  if (!chromium) { console.log("FAIL  Playwright isn't installed (try NODE_PATH=/opt/node-tools/node_modules)"); restore(); process.exit(1); }
  const browser = await chromium.launch();

  // A signed-in phone. Outside requests are blocked (so no tile, CDN or Google call ever leaves the browser).
  async function phone({ width = 375, height = 812, reducedMotion = "no-preference", permissions = [], geolocation, init, route, sheet } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion, permissions, geolocation, hasTouch: false });
    await ctx.addInitScript(([uid, stop]) => {
      try {
        localStorage.setItem("sq2.user", uid);
        if (stop) localStorage.setItem(`sq2.sheet.${uid}`, stop);
      } catch {}
    }, [userId, sheet || null]);
    if (init) await ctx.addInitScript(init);
    await ctx.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== "localhost") return r.abort();
      return route ? route(r, u) : r.continue();
    });
    const page = await ctx.newPage();
    return { ctx, page };
  }
  const ready = (page) => page.waitForFunction(() => document.querySelectorAll("#lx-sheet .lx-card").length > 0 && !document.getElementById("boot"), null, { timeout: 20000 });
  const placesIn = (page) => page.waitForSelector(".map-pin2.pl", { timeout: 10000 });
  // Watches the loader every frame: when it first painted and the last frame it was still visible
  const watchLoader = () => {
    window.__boot = { frames: [] };
    const tick = () => {
      const b = document.getElementById("boot");
      const op = b && b.isConnected ? Number(getComputedStyle(b).opacity) : 0;
      window.__boot.frames.push([performance.now(), op, b ? b.classList.contains("slow") : false, b ? getComputedStyle(b.querySelector(".b-hl")).opacity : null]);
      if (op > 0 || performance.now() < 200) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  try {
    // ---------- a ----------
    await test("a. Fast load: the loader is visible at most 300 ms, opacity-only fade, and the map is the first screen", async () => {
      // Warm the server's events cache, as a returning visit would find it
      await realFetch(`${base}/api/events`);
      const { ctx, page } = await phone({ init: watchLoader });
      await page.goto(base);
      await ready(page);
      await page.waitForFunction(() => !document.getElementById("boot"), null, { timeout: 5000 });
      const frames = await page.evaluate(() => window.__boot.frames);
      const visible = frames.filter((f) => f[1] > 0.05);
      const firstPaint = await page.evaluate(() => (performance.getEntriesByName("first-paint")[0] || { startTime: 0 }).startTime);
      const span = visible.length ? visible[visible.length - 1][0] - Math.max(firstPaint, visible[0][0]) : 0;
      console.log(`      loader visible for ${Math.round(span)} ms after first paint (done at ${Math.round(await page.evaluate(() => window.SQboot.doneAt))} ms)`);
      assert(span <= 300, `loader visible for ${Math.round(span)} ms`);
      assert(!frames.some((f) => f[2]), "the slow-load line never showed");
      assert(frames.every((f) => f[3] == null || Number(f[3]) < 0.5), "the headline never got past half opacity (no text flash)");
      assert.strictEqual(await page.evaluate(() => SQ.u.screen), "discover");
      assert(await page.isVisible(".disc-map.lx .map"), "the map is on screen");
      assert.strictEqual(await page.$eval('meta[name="theme-color"]', (m) => m.content), "#13101b", "theme colour hands over to the app's");
      await ctx.close();
    });

    await test("a. The theme colour matches the loader's sky, and the loader's CSS is inline (it paints on the first frame)", async () => {
      const html = await (await realFetch(base)).text();
      assert(/<style>[\s\S]*#boot \{[^}]*background: #0e0b15/.test(html), "inline loader CSS with its background");
      assert(/<meta name="theme-color" content="#0e0b15"/.test(html));
      assert(html.indexOf('id="boot"') < html.indexOf("<script src="), "the loader is in the page before any script");
      const kf = html.match(/@keyframes b-rise \{([^}]*\})/)[1];
      assert(!/(width|height|top|left|margin|filter)/.test(kf), "the headline animates opacity and transform only");
      assert(/transition: opacity \.15s/.test(html), "the loader fades out with opacity only");
    });

    // ---------- b ----------
    await test("b. Slow load (API held 3 s): 'Finding what's on…' after 1 s, real counts, then it fades out", async () => {
      // The state (with the events count) comes back after 2 s, the listings after 3 s
      const hold = (r, u) => (u.pathname.startsWith("/api/state") ? wait(2000).then(() => r.continue()) : u.pathname === "/api/events" ? wait(3000).then(() => r.continue()) : r.continue());
      const { ctx, page } = await phone({ route: hold, init: watchLoader });
      const t0 = Date.now();
      await page.goto(base, { waitUntil: "commit" });
      await page.waitForSelector("#boot", { state: "attached" });
      await wait(600);
      assert(!(await page.$eval("#boot", (b) => b.classList.contains("slow"))), "no message before 1 s");
      await page.waitForSelector("#boot.slow", { timeout: 2500 });
      const at = Date.now() - t0;
      await wait(350);
      assert(at >= 900, `message showed at ${at} ms`);
      assert.match(await page.$eval("#boot .b-line", (e) => e.textContent), /Finding what's on near you…/);
      assert.strictEqual(await page.$eval("#boot .b-st", (e) => getComputedStyle(e).opacity), "1");
      // The events count arrives with the state, before the listings themselves
      await page.waitForFunction(() => { const e = document.querySelector("#boot .b-ev"); return e && !e.hidden; }, null, { timeout: 4000 });
      assert.match(await page.$eval("#boot .b-ev", (e) => e.textContent), /^[\d,]+ events?$/);
      await page.screenshot({ path: path.join(SHOTS, "loader-slow.png") });
      await ready(page);
      await page.waitForFunction(() => !document.getElementById("boot"), null, { timeout: 3000 });
      const frames = await page.evaluate(() => window.__boot.frames);
      const fade = frames.filter((f) => f[1] > 0.02 && f[1] < 0.98);
      assert(fade.length >= 1, "it faded (opacity in between) rather than vanishing");
      await ctx.close();
    });

    // ---------- c ----------
    await test("c. Reduced motion: the loader is still (headline shown at once, no animation or transition)", async () => {
      const hold = (r, u) => (u.pathname.startsWith("/api/state") ? wait(1500).then(() => r.continue()) : r.continue());
      const { ctx, page } = await phone({ reducedMotion: "reduce", route: hold });
      await page.goto(base, { waitUntil: "commit" });
      await page.waitForSelector("#boot .b-hl");
      const s = await page.$eval("#boot .b-hl", (e) => { const c = getComputedStyle(e); return { op: c.opacity, anim: c.animationName, tr: c.transform }; });
      assert.strictEqual(s.op, "1");
      assert.strictEqual(s.anim, "none");
      assert(s.tr === "none" || s.tr === "matrix(1, 0, 0, 1, 0, 0)", s.tr);
      assert.match(await page.$eval("#boot", (e) => getComputedStyle(e).transitionDuration), /^0s/);
      await page.screenshot({ path: path.join(SHOTS, "loader.png") });
      await ready(page);
      await ctx.close();
    });

    // ---------- d ----------
    await test("d. No location prompt on load; after a tap, the map re-centres and says 'You · <neighbourhood>'", async () => {
      const { ctx, page } = await phone({ geolocation: SPOT, init: () => {
        window.__geoAsks = 0;
        const g = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
        navigator.geolocation.getCurrentPosition = (...a) => { window.__geoAsks++; return g(...a); };
        const w = navigator.geolocation.watchPosition.bind(navigator.geolocation);
        navigator.geolocation.watchPosition = (...a) => { window.__geoAsks++; return w(...a); };
      } });
      await page.goto(base);
      await ready(page);
      await wait(800);
      assert.strictEqual(await page.evaluate(() => window.__geoAsks), 0, "nothing asked on load");
      assert.match(await page.textContent(".lx-loc"), /Downtown Toronto · change/);
      const before = await page.evaluate(() => SQ.mapCenter("discover"));
      assert(Math.abs(before.lat - 43.6532) < 0.01 && Math.abs(before.lng + 79.3832) < 0.01, `starts downtown: ${JSON.stringify(before)}`);
      await ctx.grantPermissions(["geolocation"]);
      await page.click(".lx-loc");
      await page.waitForFunction(() => /You · /.test(document.querySelector(".lx-loc").textContent), null, { timeout: 8000 });
      assert.strictEqual(await page.evaluate(() => window.__geoAsks), 1);
      const named = require(path.join(ROOT, "lib", "launch")).where(43.65, -79.4).label; // Sketch 1's place() on the rounded point
      assert(named && named !== "Outside Toronto", named);
      assert.strictEqual((await page.textContent(".lx-loc")).trim(), `You · ${named}`);
      const after = await page.evaluate(() => SQ.mapCenter("discover"));
      assert(Math.abs(after.lat - 43.65) < 0.001 && Math.abs(after.lng + 79.4) < 0.001, `re-centred on the rounded point: ${JSON.stringify(after)}`);
      assert(await page.isVisible(".map-you"), "a 'you' mark is on the map");
      const kept = await page.evaluate(() => sessionStorage.getItem("sq2.loc") + "|" + JSON.stringify(localStorage));
      assert(!/43\.654|79\.400[1-9]|43\.65468|40061/.test(kept), `no raw coordinates stored: ${kept.slice(0, 200)}`);
      await ctx.close();
    });

    await test("d. Location denied: the map stays downtown and says 'Downtown Toronto · change'", async () => {
      const { ctx, page } = await phone({ init: () => { navigator.geolocation.getCurrentPosition = (ok, fail) => setTimeout(() => fail({ code: 1, message: "denied" }), 100); } });
      await page.goto(base);
      await ready(page);
      await page.click(".lx-loc");
      await page.waitForSelector(".toast.show");
      assert.match(await page.textContent(".lx-loc"), /Downtown Toronto · change/);
      await ctx.close();
    });

    // ---------- e ----------
    await test("e. Event pins (violet star) and place pins (teal dot) differ in shape and label; the legend chips filter them", async () => {
      const { ctx, page } = await phone();
      const searches = google.length;
      await page.goto(base);
      await ready(page);
      await placesIn(page);
      const look = (sel) => page.$eval(sel, (b) => ({ label: b.getAttribute("aria-label"), star: !!b.querySelector("svg"), bg: getComputedStyle(b.querySelector("i")).backgroundColor, w: b.querySelector("i").getBoundingClientRect().width }));
      const ev = await look(".map-pin2.ev"), pl = await look(".map-pin2.pl");
      assert.match(ev.label, /^Event: /);
      assert.match(pl.label, /^Place: /);
      assert(ev.star && !pl.star, "a star on events, a dot on places");
      assert.notStrictEqual(ev.bg, pl.bg);
      assert.strictEqual(ev.bg, "rgb(169, 122, 242)", "events are violet");
      assert.strictEqual(pl.bg, "rgb(92, 207, 230)", "places are teal");
      assert(ev.w !== pl.w, "different sizes too");
      const n = async () => [await page.locator(".map-pin2.ev").count(), await page.locator(".map-pin2.pl").count()];
      const [e0, p0] = await n();
      assert(e0 > 0 && p0 === 3, `pins: ${e0} events, ${p0} places`);
      await page.click('.lx-key.ev');
      assert.deepStrictEqual(await n(), [0, 3], "Events off");
      assert.strictEqual(await page.getAttribute(".lx-key.ev", "aria-pressed"), "false");
      await page.click('.lx-key.pl');
      assert.deepStrictEqual(await n(), [0, 0], "both off");
      await page.click('.lx-key.ev');
      await page.click('.lx-key.pl');
      assert.deepStrictEqual(await n(), [e0, 3], "both back");
      await page.click('.lx-loc'); // even a new location doesn't search again this session
      await wait(300);
      await page.evaluate(() => SQ.render());
      assert.strictEqual(google.length - searches, 1, "one Places search for the map session");
      // Pins work from the keyboard: focus one, press Enter, its card is chosen
      await page.focus(".map-pin2.pl");
      await page.keyboard.press("Enter");
      await page.waitForSelector(".map-pin2.pl.on");
      assert(await page.$(".lx-card.pl.on"), "its card is marked");
      await ctx.close();
    });

    await test("e. Places stay to one search per map session, and none when the usage cap is near", async () => {
      const launch = require(path.join(ROOT, "lib", "launch"));
      const r1 = await launch.nearby({ sessionId: "abcdef123", lat: 43.65, lng: -79.4 });
      const r2 = await launch.nearby({ sessionId: "abcdef123", lat: 43.7, lng: -79.4 });
      assert.strictEqual(r1, r2, "the same session gets the same answer");
      const was = google.length;
      process.env.GOOGLE_PLACES_DAILY_MAX = String(was + 3); // 3 left today: under the headroom kept for planning calls
      const r3 = await launch.nearby({ sessionId: "zzzzzz999", lat: 43.65, lng: -79.4 });
      delete process.env.GOOGLE_PLACES_DAILY_MAX;
      assert.deepStrictEqual(r3.places, []);
      assert.strictEqual(r3.reason, "capped");
      assert.strictEqual(google.length, was, "no search near the cap");
      const raw = JSON.stringify(r1);
      assert(!/rating|userRatingCount|formattedAddress/.test(raw), "only what the card shows is sent");
    });

    await test("e. Places unavailable: events only, and no error", async () => {
      process.env.SIDEKICK_PLACES_OFF = "1";
      const { ctx, page } = await phone();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base);
      await ready(page);
      await wait(800);
      delete process.env.SIDEKICK_PLACES_OFF;
      assert.strictEqual(await page.locator(".map-pin2.pl").count(), 0);
      assert((await page.locator(".map-pin2.ev").count()) > 0);
      assert(!(await page.isVisible(".toast.show")), "no error toast");
      assert.deepStrictEqual(errors, []);
      await ctx.close();
    });

    // ---------- f ----------
    await test("f. Cards: event and place details, links, and Google Maps attribution on places; two cards in view at 375 px", async () => {
      const { ctx, page } = await phone();
      await page.goto(base);
      await ready(page);
      await placesIn(page);
      const ev = await page.$eval(".lx-cards .lx-card.ev", (c) => ({ text: c.innerText, link: c.querySelector("a.lx-link") && c.querySelector("a.lx-link").href, tag: c.querySelector(".kt.ev").innerText, icon: !!c.querySelector(".kt.ev svg") }));
      assert.strictEqual(ev.tag.trim(), "Event");
      assert(ev.icon, "ticket icon");
      assert.match(ev.text, /(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Today) · starts \d{1,2}(:\d\d)? (AM|PM)/);
      assert.match(ev.text, /(\$\d+ ticket|Free|Price on the listing)/);
      assert.match(ev.text, /See tickets/);
      assert(ev.link && /^https?:/.test(ev.link), "See tickets links to the listing");
      const pl = await page.$eval(".lx-cards .lx-card.pl", (c) => ({ text: c.innerText, link: c.querySelector("a.lx-link").href, tag: c.querySelector(".kt.pl").innerText, icon: !!c.querySelector(".kt.pl svg") }));
      assert.strictEqual(pl.tag.trim(), "Place");
      assert(pl.icon, "pin icon");
      assert.match(pl.text, /Open until 1 AM · drop in any time/);
      assert.match(pl.text, /\$ · about \$15 each/);
      assert.match(pl.text, /Directions/);
      assert.match(pl.text, /Place info from Google Maps/);
      assert.match(pl.link, /^https:\/\/maps\.google\.com\//);
      // Two cards fit side by side in the row
      const fit = await page.$$eval(".lx-cards .lx-card", (cs) => cs.filter((c) => { const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }).length);
      assert.strictEqual(fit, 2, `${fit} cards fully in view`);
      // Cards work from the keyboard: Tab reaches the card's button and its link
      await page.focus(".lx-cards .lx-card.ev .lx-main");
      await page.keyboard.press("Tab");
      assert.strictEqual(await page.evaluate(() => document.activeElement.className), "lx-link");
      await page.screenshot({ path: path.join(SHOTS, "landing-peek.png") });
      await ctx.close();
    });

    // ---------- g ----------
    await test("g. Sheet: drag to half and full, List and Map buttons, and the last stop is remembered", async () => {
      const { ctx, page } = await phone();
      await page.goto(base);
      await ready(page);
      await placesIn(page);
      const stop = () => page.$eval(".disc-map.lx", (e) => e.dataset.stop);
      const top = () => page.$eval("#lx-sheet", (e) => Math.round(e.getBoundingClientRect().top));
      assert.strictEqual(await stop(), "peek");
      const t0 = await top();
      // Drag the grabber up slowly to about the middle: half
      const g = await page.$eval(".lx-grab", (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      const H = await page.$eval(".disc-map.lx", (e) => e.clientHeight);
      await page.mouse.move(g[0], g[1]);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) { await page.mouse.move(g[0], g[1] - (i * (H * 0.55 - (H - t0))) / 12); await wait(30); }
      await page.mouse.up();
      await wait(450);
      assert.strictEqual(await stop(), "half", "dragged to half");
      assert(await page.isVisible(".lx-list .lx-card"), "the list shows at half");
      assert(await page.isVisible(".disc-map.lx .map"), "the map is still in view at half");
      await page.screenshot({ path: path.join(SHOTS, "landing-half.png") });
      // Drag up again to the top: full
      const g2 = await page.$eval(".lx-grab", (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
      await page.mouse.move(g2[0], g2[1]);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) { await page.mouse.move(g2[0], g2[1] - (i * g2[1]) / 12); await wait(30); }
      await page.mouse.up();
      await wait(450);
      assert.strictEqual(await stop(), "full", "dragged to full");
      await page.screenshot({ path: path.join(SHOTS, "landing-full.png") });
      // The buttons
      await page.click('.lx-view[data-lx-stop="peek"]');
      await wait(400);
      assert.strictEqual(await stop(), "peek", "Map button");
      assert(Math.abs((await top()) - t0) <= 2, "back to the same peek height");
      await page.click('.lx-view[data-lx-stop="full"]');
      await wait(400);
      assert.strictEqual(await stop(), "full", "List button");
      // The grabber from the keyboard
      await page.focus(".lx-grab");
      await page.keyboard.press("ArrowDown");
      await wait(350);
      assert.strictEqual(await stop(), "half", "arrow down from full is half");
      assert.strictEqual(await page.evaluate((u) => localStorage.getItem(`sq2.sheet.${u}`), userId), "half");
      await page.reload();
      await ready(page);
      assert.strictEqual(await stop(), "half", "remembered after a reload");
      await page.click('.lx-view[data-lx-stop="peek"]');
      await ctx.close();
    });

    await test("g. Storage blocked: the sheet still works (it just isn't remembered)", async () => {
      const { ctx, page } = await phone({ init: () => {
        const no = () => { throw new Error("blocked"); };
        Object.defineProperty(window, "localStorage", { get: no });
      } });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base);
      await page.waitForSelector(".disc-map, .screen", { timeout: 20000 });
      await wait(500);
      assert.deepStrictEqual(errors, []);
      await ctx.close();
    });

    // ---------- h ----------
    await test("h. Tab bar: Discover, Community, Plan, Sidequests, Profile; Plan opens /sk; Add Event is the + on Sidequests", async () => {
      const { ctx, page } = await phone();
      await page.goto(base);
      await ready(page);
      const tabs = await page.$$eval("nav.tabs .tab", (ts) => ts.map((t) => t.textContent.trim()));
      assert.deepStrictEqual(tabs, ["Discover", "Community", "Plan", "Sidequests", "Profile"]);
      assert(!(await page.$('button:text-is("For you")')), "the For you / Map toggle is gone");
      assert(await page.$(".lx .search input"), "search is kept");
      assert(await page.$('.lx .search [data-go="filters"]'), "filters are kept");
      assert.strictEqual(await page.getAttribute('nav.tabs a.tab:has-text("Plan")', "href"), "/sk");
      await Promise.all([page.waitForURL(/\/sk\/?$/), page.click('nav.tabs .tab:has-text("Plan")')]);
      await page.goto(base);
      await ready(page);
      await page.click('nav.tabs .tab:has-text("Sidequests")');
      await page.click('[data-go="requests"]');
      await page.waitForSelector("text=Found an event? Add it to Sidequest");
      assert.strictEqual(await page.evaluate(() => SQ.u.screen), "requests");
      assert.strictEqual(await page.$eval("nav.tabs .tab.on", (t) => t.textContent.trim()), "Sidequests");
      await ctx.close();
    });

    // ---------- i ----------
    for (const [w, h] of [[375, 812], [1280, 800]]) {
      await test(`i. ${w} px: no sideways overflow, nothing under the tab bar, 44 px targets, weights 400/500/600, 12 px text`, async () => {
        for (const stopAt of ["peek", "half", "full"]) {
          const { ctx, page } = await phone({ width: w, height: h, sheet: stopAt });
          await page.goto(base);
          await ready(page);
          await placesIn(page);
          await wait(400);
          const r = await page.evaluate(() => {
            const out = { overflow: document.documentElement.scrollWidth - innerWidth, under: [], small: [], weights: new Set(), tiny: [] };
            const tabs = document.querySelector("nav.tabs").getBoundingClientRect();
            const phone = innerWidth < 1100;
            const shown = (el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && Number(c.opacity) > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
            // Is it really on top where it is (not clipped away under the sheet or out of a scroller)?
            const onTop = (el) => { const r = el.getBoundingClientRect(); const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); const hit = document.elementFromPoint(x, y); return hit && (hit === el || el.contains(hit)); };
            for (const el of document.querySelectorAll("#screen button, #screen a, #screen input, #screen [role=button], #screen [tabindex='0']")) {
              if (!shown(el) || !onTop(el)) continue;
              const r = el.getBoundingClientRect();
              // What actually shows of it: clipped by any scrolling or overflow-hidden box it sits in
              let bottom = r.bottom;
              for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
                const c = getComputedStyle(a);
                if (c.overflowY !== "visible" || c.overflowX !== "visible") bottom = Math.min(bottom, a.getBoundingClientRect().bottom);
              }
              if (el.closest("nav.tabs") === null && phone && bottom > tabs.top + 1) out.under.push(el.className || el.tagName);
              if (el.closest(".search") && el.tagName === "INPUT") continue; // the input fills the 52px search bar
              if (r.width < 43.5 || r.height < 43.5) out.small.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
            for (const el of document.querySelectorAll("#screen *")) {
              if (!shown(el)) continue;
              const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
              if (!own) continue;
              const c = getComputedStyle(el);
              out.weights.add(c.fontWeight);
              if (parseFloat(c.fontSize) < 12) out.tiny.push(`${el.tagName}.${el.className} ${c.fontSize} "${el.textContent.trim().slice(0, 20)}"`);
            }
            out.weights = [...out.weights].sort();
            return out;
          });
          if (w === 375 && stopAt === "peek") await page.screenshot({ path: path.join(SHOTS, `i-${w}-${stopAt}.png`) });
          if (w === 1280) await page.screenshot({ path: path.join(SHOTS, `i-${w}-${stopAt}.png`) });
          await ctx.close();
          assert(r.overflow <= 0, `${stopAt}: page is ${r.overflow}px wider than the window`);
          assert.deepStrictEqual(r.under, [], `${stopAt}: under the tab bar`);
          assert.deepStrictEqual(r.small, [], `${stopAt}: targets under 44px`);
          assert(r.weights.every((x) => ["400", "500", "600"].includes(x)), `${stopAt}: weights ${r.weights.join(", ")}`);
          assert.deepStrictEqual(r.tiny, [], `${stopAt}: text under 12px`);
        }
      });
    }
  } finally {
    await browser.close();
    restore();
  }
  console.log(failures ? `\n${failures} failed` : "\nAll launch checks passed");
  console.log(`Screenshots: ${SHOTS}`);
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); restore(); process.exit(1); });
