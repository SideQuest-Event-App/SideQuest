// The launch experience, end to end in a real browser against the real server:
// the S3 "City lights" loader and the L2 "Map first" Discover screen.
//
//  a. A fast load: the loader is visible for no more than 300 ms, and the map is the first screen.
//  b. A slow load (the API held back 3 s): after 1 s the loader says what's happening, then fades out.
//  c. Reduced motion: a still loader.
//  d. No location prompt on load; granting it after a tap on "my location" re-centres the map and the sheet says
//     "You · <neighbourhood>".
//  e. Event pins and place pins differ in shape and label; the sheet's For you / Events / Places pills filter them.
//  f. The posters: event tickets (when, match ring, area · price) and place tags (hours, area · price); a tapped place
//     shows its card (hours, price, Directions, Google Maps attribution) with the map.
//  g. The sheet's three heights work by drag and from the keyboard, and the last one is remembered.
//  h. Plan opens /sk; Add event is a labelled button on Sidequests.
//  i. At 375 and 1280 px: no sideways overflow, nothing under the tab bar, 44 px targets, weights 400/500/600 only.
//
// The opening flow (designs FL1, FL2, AN1 option C) and the loading system (AN2), the "flow" checks:
//  a. a brand-new visit: loader, then "Are you demoing SideQuest or testing it?", never the old start page;
//  b. the old bug: an earlier visit's sq2.mode and sq2.screen="landing", no server session -> still the question,
//     and Demoing lands on the map, signed in;
//  c. after a server restart (the demo account forgotten) Demoing still signs in; mid-visit it signs in quietly;
//  d. a reload in the same tab doesn't ask again;  e. deep links skip the question; Testing opens /study;
//  f. the zoom: lights past 1.5x, pins moving, on the map within 1.5 s;  g. a tap mid-way jumps to the end;
//  h. reduced motion: no transforms;  i. the same at 1280 px, with the desktop layout;
//  j. tabs crossfade, pushed screens slide, Back reverses;  k. slow lists: skeletons after 300 ms, none when fast;
//  l. a waiting button keeps its width;  m. an API error shows "Try again", and it works.
//
// Who sees the question, the "account" checks:
//  a. a signed-in real account opening a fresh tab goes to Discover with no question (the zoom's second half
//     still plays), and its session is unchanged; ?demo=1 never swaps it for the demo;
//  b. signed out, the question has "Sign in or create an account"; it opens the login and lands in the app signed in;
//  c. Demoing still works (after a restart too: flow c), and the sandbox note shows on its card;
//  d. Testing asks for an account after consent; the checklist's app links then use it; skipping falls back to the
//     demo; returning testers can sign in; the export has no names or emails and records the account kind, id-only.
//   ACCOUNT_SHOTS=/some/folder ... to keep the 375 px screenshots of the question, the study's account step and the note
//
// The server runs in this process so Google Places can be faked: nothing here ever calls Google. Every other
// outside request (map tiles, the MapLibre script, fonts) is blocked, so the light map stands in.
// The database file is copied first and put back afterwards.
//
//   NODE_PATH=/opt/node-tools/node_modules node test/launch.e2e.js
//   LAUNCH_SHOTS=/some/folder ... to keep the screenshots (375 px, 2x)
//   ONLY="flow" ... to run only the checks whose names contain that text

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
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return; // ONLY="flow j" runs just the checks named so
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Keep the real database and logs as they were
const DATA = path.join(ROOT, "data");
const KEEP = ["db.json", "analytics.jsonl"];
const saved = {};
for (const f of KEEP) { const p = path.join(DATA, f); if (fs.existsSync(p)) { saved[f] = path.join(tmp, f); fs.copyFileSync(p, saved[f]); } }
// The study's consent screen: the four required boxes (the optional one left alone)
async function agreeStudy(page) {
  for (const k of ["age", "gta", "phone", "agree"]) await page.check(`#c-${k}`);
}
// The study questionnaire after the account step: four parts, each skipped through with Continue
async function skipQuestions(page) {
  for (let part = 1; part <= 4; part++) {
    await page.waitForSelector(`#qPartT:has-text("Part ${part} of 4")`);
    await page.click("#qNext");
  }
}
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
    SIDEKICK_STUDY_FILE: path.join(tmp, "sidekick-study.json"), SIDEKICK_STUDY_KEY: "launch-study-key",
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
  // user: null for a new device (nobody signed in, no demo-or-test answer yet)
  // mode: null for a fresh tab of a signed-in account (no answer kept in this tab)
  async function phone({ width = 375, height = 812, reducedMotion = "no-preference", permissions = [], geolocation, init, route, sheet, user = userId, mode = "demo" } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion, permissions, geolocation, hasTouch: false });
    if (user) await ctx.addInitScript(([uid, stop, m]) => {
      try {
        if (sessionStorage.getItem("__seeded")) return; // only the first page load starts signed in this way
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem("sq2.user", uid);
        if (m) sessionStorage.setItem("sq2.mode", m); // the question was answered in this tab (these checks are about the map)
        if (stop) localStorage.setItem(`sq2.sheet.${uid}`, stop);
      } catch {}
    }, [user, sheet || null, mode]);
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
      await page.goto(base); // a first visit warms the browser; the measured load is the next one, as a returning visitor's
      await ready(page);
      const first = await page.evaluate(() => window.SQboot.doneAt);
      console.log(`      first visit: first screen in at ${Math.round(first)} ms`);
      await page.reload();
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
      assert.strictEqual((await page.textContent(".lx-where")).trim(), "Downtown Toronto", "no chosen area: downtown");
      const before = await page.evaluate(() => SQ.mapCenter("discover"));
      assert(Math.abs(before.lat - 43.6532) < 0.01 && Math.abs(before.lng + 79.3832) < 0.01, `starts downtown: ${JSON.stringify(before)}`);
      await ctx.grantPermissions(["geolocation"]);
      await page.click(".lx-me");
      await page.waitForFunction(() => /You · /.test(document.querySelector(".lx-where").textContent), null, { timeout: 8000 });
      assert.strictEqual(await page.evaluate(() => window.__geoAsks), 1);
      const named = require(path.join(ROOT, "lib", "launch")).where(43.65, -79.4).label; // Sketch 1's place() on the rounded point
      assert(named && named !== "Outside Toronto", named);
      assert.strictEqual((await page.textContent(".lx-where")).trim(), `You · ${named}`);
      const after = await page.evaluate(() => SQ.mapCenter("discover"));
      assert(Math.abs(after.lat - 43.65) < 0.001 && Math.abs(after.lng + 79.4) < 0.001, `re-centred on the rounded point: ${JSON.stringify(after)}`);
      assert(await page.isVisible(".map-you"), "a 'you' mark is on the map");
      const kept = await page.evaluate(() => sessionStorage.getItem("sq2.loc") + "|" + JSON.stringify(localStorage));
      assert(!/43\.654|79\.400[1-9]|43\.65468|40061/.test(kept), `no raw coordinates stored: ${kept.slice(0, 200)}`);
      await ctx.close();
    });

    await test("d. Location denied: the map stays on the chosen area (downtown with none) and says so", async () => {
      const { ctx, page } = await phone({ init: () => { navigator.geolocation.getCurrentPosition = (ok, fail) => setTimeout(() => fail({ code: 1, message: "denied" }), 100); } });
      await page.goto(base);
      await ready(page);
      await page.click(".lx-me");
      await page.waitForSelector(".toast.show");
      assert.match(await page.textContent(".toast"), /shows Downtown Toronto/);
      assert.strictEqual((await page.textContent(".lx-where")).trim(), "Downtown Toronto");
      await ctx.close();
    });

    // ---------- e ----------
    await test("e. Event pins (violet star) and place pins (teal dot) differ in shape and label; the For you / Events / Places pills filter them", async () => {
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
      await page.click('.dx-seg [data-arg="places"]');
      assert.deepStrictEqual(await n(), [0, 3], "Places: place pins only");
      assert.strictEqual(await page.getAttribute('.dx-seg [data-arg="places"]', "aria-pressed"), "true");
      await page.click('.dx-seg [data-arg="events"]');
      assert.deepStrictEqual(await n(), [e0, 0], "Events: event pins only");
      await page.click('.dx-seg [data-arg="foryou"]');
      assert.deepStrictEqual(await n(), [e0, 3], "For you: both");
      await page.click('.lx-me'); // even a new location doesn't search again this session
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
    await test("f. Posters: event tickets and place tags with their facts; a tapped place shows its card, Directions and the Google Maps attribution; two posters in view at 375 px", async () => {
      const { ctx, page } = await phone();
      await page.goto(base);
      await ready(page);
      await placesIn(page);
      await page.waitForSelector(".dx-rail .lx-card.pl", { timeout: 10000 });
      const ev = await page.$eval(".dx-rail .lx-card.ev", (c) => ({ text: c.innerText, ticket: c.classList.contains("ticket"), mask: getComputedStyle(c).maskImage || getComputedStyle(c).webkitMaskImage, ring: c.querySelector(".mring") && c.querySelector(".mring").getAttribute("aria-label"), badge: c.querySelector(".dx-badge").innerText, title: getComputedStyle(c.querySelector(".dx-t")) }));
      assert(ev.ticket && /radial-gradient/.test(ev.mask), "events are tickets with notched sides");
      assert.match(ev.badge, /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Today)(, (Mon|Tue|Wed|Thu|Fri|Sat|Sun|Today))* · \d{1,2}(:\d\d)? (AM|PM)$|^\d+ dates · from /, `when: ${ev.badge}`);
      assert(!ev.ring || /^\d+% match$/.test(ev.ring), `match ring: ${ev.ring}`);
      assert.strictEqual(ev.title.webkitLineClamp, "2", "titles wrap to two lines");
      assert(!/N\/A|Price not listed/.test(ev.text), "no unknown price on the poster");
      const pl = await page.$eval(".dx-rail .lx-card.pl", (c) => ({ text: c.innerText, radius: getComputedStyle(c).borderBottomRightRadius, other: getComputedStyle(c).borderTopLeftRadius }));
      assert(parseFloat(pl.radius) > parseFloat(pl.other) * 2, `places have one big rounded corner (${pl.radius} vs ${pl.other})`);
      assert.match(pl.text, /Till 1 AM/);
      assert.match(pl.text, /\$/);
      assert(await page.isVisible(".dx-rail ~ .dx-attr"), "Place info from Google Maps under a row with places");
      // Two posters fit side by side in a row
      const fit = await page.$eval(".dx-rail", (row) => [...row.querySelectorAll(".lx-card")].filter((c) => { const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }).length);
      assert(fit >= 2, `${fit} posters fully in view`);
      // From the keyboard: Tab goes from one poster to the next
      await page.focus(".dx-rail .lx-card .lx-main");
      await page.keyboard.press("Tab");
      assert(await page.evaluate(() => document.activeElement.classList.contains("lx-main")), "Tab reaches the next poster");
      // A place: the sheet drops to a peek, the map shows it, and its card has the details and the link
      await page.click(".dx-rail .lx-card.pl .lx-main");
      await page.waitForSelector(".lx-selwrap .lx-card.pl");
      assert.strictEqual(await page.$eval(".disc-map.lx", (e) => e.dataset.stop), "peek");
      const card = await page.$eval(".lx-selwrap .lx-card.pl", (c) => ({ text: c.innerText, link: c.querySelector("a.lx-link").href }));
      assert.match(card.text, /Open until 1 AM · drop in any time/);
      assert.match(card.text, /\$ · about \$15 each/);
      assert.match(card.text, /Directions/);
      assert.match(card.text, /Place info from Google Maps/);
      assert.match(card.link, /^https:\/\/maps\.google\.com\//);
      assert(await page.$(".map-pin2.pl.on"), "its pin is marked");
      await page.screenshot({ path: path.join(SHOTS, "landing-peek.png") });
      await ctx.close();
    });

    // ---------- g ----------
    await test("g. Sheet: three heights (peek, half, full) by drag and keyboard, no List / Map switch, and the last height is remembered", async () => {
      const { ctx, page } = await phone();
      await page.goto(base);
      await ready(page);
      await placesIn(page);
      const stop = () => page.$eval(".disc-map.lx", (e) => e.dataset.stop);
      const top = () => page.$eval("#lx-sheet", (e) => Math.round(e.getBoundingClientRect().top));
      assert.strictEqual(await stop(), "half", "opens at half: the list over the map");
      assert(!(await page.$(".lx-view, .lx-views")), "no List / Map switch");
      assert(await page.isVisible(".lx-list .lx-card"), "the list shows at half");
      assert(await page.isVisible(".disc-map.lx .map"), "the map is in view at half");
      const tHalf = await top();
      const drag = async (toY) => {
        const g = await page.$eval(".lx-grab", (e) => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
        await page.mouse.move(g[0], g[1]);
        await page.mouse.down();
        for (let i = 1; i <= 12; i++) { await page.mouse.move(g[0], g[1] + ((toY - g[1]) * i) / 12); await wait(30); }
        await page.mouse.up();
        await wait(450);
      };
      // Up for the list
      await drag(20);
      assert.strictEqual(await stop(), "full", "dragged up to full");
      assert((await top()) < tHalf, "higher than half");
      await page.screenshot({ path: path.join(SHOTS, "landing-full.png") });
      // Down for the map
      const H = await page.$eval(".disc-map.lx", (e) => e.getBoundingClientRect().bottom);
      await drag(H - 10);
      assert.strictEqual(await stop(), "peek", "dragged down to a peek");
      assert(!(await page.isVisible(".lx-list .lx-card")), "the list is out of the way");
      assert(await page.isVisible(".dx-seg"), "the pills stay at a peek");
      const tPeek = await top();
      assert(tPeek > tHalf, "lower than half");
      // The grabber from the keyboard
      await page.focus(".lx-grab");
      await page.keyboard.press("ArrowUp");
      await wait(350);
      assert.strictEqual(await stop(), "half", "arrow up from peek is half");
      assert(Math.abs((await top()) - tHalf) <= 2, "back to the same half height");
      await page.keyboard.press("End");
      await wait(350);
      assert.strictEqual(await stop(), "full");
      await page.keyboard.press("ArrowDown");
      await wait(350);
      assert.strictEqual(await stop(), "half", "arrow down from full is half");
      await page.keyboard.press("Home");
      await wait(350);
      assert.strictEqual(await stop(), "peek");
      assert.strictEqual(await page.evaluate((u) => localStorage.getItem(`sq2.sheet.${u}`), userId), "peek");
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll("#lx-sheet .lx-card").length > 0 && !document.getElementById("boot"), null, { timeout: 20000 });
      assert.strictEqual(await stop(), "peek", "remembered after a reload");
      await page.keyboard.press("Tab");
      await page.evaluate(() => SQ.lx.setStop("half"));
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
    await test("h. Tab bar: Discover, Squads, Plan, Sidequests, Profile; Plan opens /sk; Add event is a labelled button on Sidequests", async () => {
      const { ctx, page } = await phone();
      await page.goto(base);
      await ready(page);
      const tabs = await page.$$eval("nav.tabs .tab", (ts) => ts.map((t) => t.textContent.trim()));
      assert.deepStrictEqual(tabs, ["Discover", "Squads", "Plan", "Sidequests", "Profile"]);
      assert(!(await page.$('button:text-is("For you")')), "the For you / Map toggle is gone");
      assert(await page.$(".lx .search input"), "search is kept");
      assert(await page.$('.lx .search [data-go="filters"]'), "filters are kept");
      assert.strictEqual(await page.getAttribute('nav.tabs a.tab:has-text("Plan")', "href"), "/sk");
      await Promise.all([page.waitForURL(/\/sk\/?$/), page.click('nav.tabs .tab:has-text("Plan")')]);
      await page.goto(base);
      await ready(page);
      await page.click('nav.tabs .tab:has-text("Sidequests")');
      assert.strictEqual(await page.$eval("nav.tabs .tab.on", (t) => t.textContent.trim()), "Sidequests");
      await page.click('.tb-head button:has-text("Add event")');
      await page.waitForFunction(() => SQ.u.screen === "add-event");
      await ctx.close();
    });

    // ---------- i ----------
    for (const [w, h] of [[375, 812], [1280, 800]]) {
      await test(`i. ${w} px: no sideways overflow, nothing under the tab bar, 44 px targets, weights from the type scale, 12 px text`, async () => {
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
          assert(r.weights.every((x) => ["400", "500", "600", "700", "800"].includes(x)), `${stopAt}: weights ${r.weights.join(", ")}`); // 700/800: the redesign's titles
          assert.deepStrictEqual(r.tiny, [], `${stopAt}: text under 12px`);
        }
      });
    }

    // ---------- The opening flow (FL1, FL2, AN1 option C) and the loading system (AN2) ----------
    const mapUp = (page) => page.waitForFunction(() => window.SQ && SQ.u && SQ.u.screen === "discover" && document.querySelector(".disc-map.lx") && !document.getElementById("boot"), null, { timeout: 20000 });
    const question = (page) => page.waitForFunction(() => { const q = document.querySelector("#boot .b-q"); return q && q.getAnimations().every((a) => a.playState !== "running") && getComputedStyle(q).opacity === "1"; }, null, { timeout: 20000 });
    const demoUsers = () => Object.values(dbm.data.users).filter((u) => u.demo || /^@?demo$/i.test(String(u.handle || u.username || "")));
    const forgetDemo = () => { for (const u of demoUsers()) { delete dbm.data.users[u.id]; delete dbm.data.parties[u.id]; } }; // what a Render restart does to the demo account
    const dbm = require(path.join(ROOT, "lib", "db"));
    // Samples the zoom every frame from just before the tap: the lights' scale, the pins' transforms, the stage
    const sampleZoom = () => {
      window.__z = [];
      const t0 = performance.now();
      const tick = () => {
        const b = document.getElementById("boot"), l = b && b.querySelector(".b-lights"), q = b && b.querySelector(".b-q");
        const m = l ? new DOMMatrixReadOnly(getComputedStyle(l).transform === "none" ? undefined : getComputedStyle(l).transform) : null;
        const pins = [...document.querySelectorAll("#screen .map-pin2 > i")].slice(0, 8).map((i) => getComputedStyle(i).transform);
        window.__z.push({ t: performance.now() - t0, boot: !!b, scale: m ? m.a : null, lightsT: l ? getComputedStyle(l).transform : null, qT: q ? getComputedStyle(q).transform : null, op: b ? Number(getComputedStyle(b).opacity) : 0, pins, screen: SQ.u.screen });
        if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const moved = (t) => t && t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)";

    await test("flow a. A brand-new visit shows the loader, then the question (headline out, question rises 12 px), never the old start page", async () => {
      const { ctx, page } = await phone({ user: null, init: () => {
        window.__seen = { boot: 0, landing: 0, rise: [] };
        const tick = () => {
          if (document.querySelector("#boot .b-in")) window.__seen.boot++;
          if (document.querySelector(".landing-copy") || /Find your people in a new city/.test(document.body ? document.body.innerText : "")) window.__seen.landing++;
          const q = document.querySelector("#boot .b-q");
          if (q) { const t = getComputedStyle(q).transform; window.__seen.rise.push(t === "none" ? 0 : new DOMMatrixReadOnly(t).f); }
          if (window.__seen.rise.length < 60) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } });
      await page.goto(base);
      await question(page);
      const seen = await page.evaluate(() => window.__seen);
      assert(seen.boot > 0, "the city-lights loader showed first");
      assert.strictEqual(seen.landing, 0, "the old start page never showed");
      assert(seen.rise.some((y) => y > 2 && y <= 12.01), `the question rose from 12 px below (${seen.rise.slice(0, 8).map((y) => y.toFixed(1)).join(", ")})`);
      assert.strictEqual((await page.textContent(".mode-h")).trim(), "Are you demoing SideQuest or testing it?");
      assert(!(await page.$("#boot .b-in")), "the headline went");
      assert(await page.$("#boot .b-lights"), "on the same lights (the loader's own layer)");
      const picks = await page.$$eval(".mode-pick", (bs) => bs.map((b) => ({ t: b.querySelector(".mode-t").textContent, bg: getComputedStyle(b).backgroundImage, h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width })));
      assert.deepStrictEqual(picks.map((p) => p.t), ["Demoing", "Testing"]);
      assert(/gradient/.test(picks[0].bg) && !/gradient/.test(picks[1].bg), "the gradient is on the primary choice only");
      assert(picks.every((p) => p.h >= 44 && p.w >= 44));
      assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
      const type = await page.$$eval("#boot .b-q *", (els) => els.map((e) => getComputedStyle(e)).map((c) => [c.fontWeight, parseFloat(c.fontSize)]));
      assert(type.every(([w]) => ["400", "500", "600"].includes(w)), "weights 400/500/600");
      assert(type.every(([, px]) => px >= 12), "text 12 px or larger");
      await ctx.close();
    });

    await test("flow b. The old bug: an earlier visit's sq2.mode and sq2.screen='landing', no server session -> still the question; Demoing lands on the map, signed in", async () => {
      const { ctx, page } = await phone({ user: null, init: () => {
        try {
          if (sessionStorage.getItem("__pre")) return;
          sessionStorage.setItem("__pre", "1");
          localStorage.setItem("sq2.mode", "demo"); // answered on this device last week
          localStorage.setItem("sq2.user", "u_gone_after_restart"); // an account the server no longer has
          sessionStorage.setItem("sq2.screen", "landing"); // the old start page, saved by the earlier visit
        } catch {}
      } });
      await page.goto(base);
      await question(page);
      assert(!(await page.$(".landing-copy")), "not the old start page");
      await page.click('.mode-pick[data-pick="demo"]');
      await mapUp(page);
      assert.strictEqual(await page.evaluate(() => SQ.d.user && SQ.d.user.demo), true, "signed in to the demo");
      assert.strictEqual(await page.evaluate(() => localStorage.getItem("sq2.mode")), null, "the old per-device answer is gone");
      assert.strictEqual(await page.evaluate(() => sessionStorage.getItem("sq2.mode")), "demo", "answered for this tab");
      await ctx.close();
    });

    await test("flow c. After a server restart (the demo account forgotten), Demoing still signs in and lands on the map; mid-visit it signs in again quietly", async () => {
      const { ctx, page } = await phone({ user: null });
      await page.goto(base);
      await question(page);
      await page.click('.mode-pick[data-pick="demo"]');
      await mapUp(page);
      const first = await page.evaluate(() => SQ.userId());
      // Restart: the server no longer knows the demo account. A reload in the same tab signs in again, no start page.
      forgetDemo();
      await page.reload();
      await mapUp(page);
      assert(!(await page.$(".mode-h")), "no question on a reload");
      assert.strictEqual(await page.evaluate(() => SQ.d.user && SQ.d.user.demo), true, "signed in again");
      assert.notStrictEqual(await page.evaluate(() => SQ.userId()), first, "a new demo account");
      // Mid-visit: the next change finds the account gone, signs in again and goes through
      forgetDemo();
      const id = await page.evaluate(() => SQ.d.events.find((e) => !e.over).id);
      const r = await page.evaluate(async (eventId) => { try { return await SQ.act("save", { eventId }); } catch (e) { return { error: e.message }; } }, id);
      assert(!r.error, `the change went through: ${JSON.stringify(r)}`);
      assert.strictEqual(await page.evaluate(() => SQ.u.screen), "discover");
      // A fresh tab after another restart: the question, then the demo, on the map
      forgetDemo();
      const tab = await ctx.newPage();
      await tab.route("**/*", (rt) => (new URL(rt.request().url()).hostname === "localhost" ? rt.continue() : rt.abort()));
      await tab.goto(base);
      await question(tab);
      await tab.click('.mode-pick[data-pick="demo"]');
      await mapUp(tab);
      assert.strictEqual(await tab.evaluate(() => SQ.d.user && SQ.d.user.demo), true);
      await ctx.close();
    });

    await test("flow d. A reload in the same tab doesn't ask again; a new tab does", async () => {
      const { ctx, page } = await phone({ user: null });
      await page.goto(base);
      await question(page);
      await page.click('.mode-pick[data-pick="demo"]');
      await mapUp(page);
      await page.reload();
      await mapUp(page);
      assert(!(await page.$(".mode-h")), "not asked again");
      const tab = await ctx.newPage();
      await tab.route("**/*", (rt) => (new URL(rt.request().url()).hostname === "localhost" ? rt.continue() : rt.abort()));
      await tab.goto(base);
      await question(tab);
      // Exit the demo: the start page, with "Switch to demo / testing", which asks again
      await page.click('nav.tabs .tab:has-text("Profile")'); // the demo's Exit is on Profile, under the same five tabs
      await page.click('.pf-bottom button:has-text("Exit demo")');
      await page.waitForSelector(".mode-switch");
      await page.reload();
      await page.waitForSelector(".mode-switch"); // signed out on purpose stays signed out
      await page.click(".mode-switch");
      await question(page);
      await ctx.close();
    });

    await test("flow e. Deep links skip the question: /sk, /sk/<room>, /study?s=…, ?quest= and ?demo=1 (the demo, unless a real account is signed in)", async () => {
      const { ctx, page } = await phone({ user: null });
      const made = await (await realFetch(`${base}/api/sk/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Asia", crew: "Launch test" }) })).json();
      for (const link of ["/sk", `/sk/${made.room}`, "/study?s=nothere123"]) {
        await page.goto(base + link);
        await wait(700);
        assert(!(await page.$(".mode-h")), `${link} shows no question`);
        assert(new URL(page.url()).pathname === link.split("?")[0], `${link} stays put (${page.url()})`);
      }
      const quest = await page.evaluate(async () => (await (await fetch("/api/events")).json()).events.find((e) => !e.over).id);
      const p2 = await ctx.newPage();
      await p2.route("**/*", (rt) => (new URL(rt.request().url()).hostname === "localhost" ? rt.continue() : rt.abort()));
      await p2.goto(`${base}/?quest=${quest}`);
      await p2.waitForFunction(() => window.SQ && SQ.u && SQ.d && !document.getElementById("boot"), null, { timeout: 20000 });
      assert(!(await p2.$(".mode-h")), "a shared sidequest link shows no question");
      assert.strictEqual(await p2.evaluate(() => SQ.u.screen), "quest", "it opens the sidequest");
      // ?demo=1 signed out: the demo account
      const p4 = await ctx.newPage();
      await p4.route("**/*", (rt) => (new URL(rt.request().url()).hostname === "localhost" ? rt.continue() : rt.abort()));
      await p4.goto(`${base}/?demo=1`);
      await mapUp(p4);
      assert(!(await p4.$(".mode-h")));
      assert.strictEqual(await p4.evaluate(() => SQ.d.user && SQ.d.user.demo), true, "signed in to the demo");
      // The study's demo link, from a browser signed in to a real account: that account stays (never swapped for the demo)
      const { ctx: c3, page: p3 } = await phone({ user: userId });
      await p3.goto(`${base}/?demo=1&study=launchstudy1`);
      await mapUp(p3);
      assert(!(await p3.$(".mode-h")));
      assert.strictEqual(await p3.evaluate(() => SQ.d.user && SQ.d.user.id), userId, "still the real account");
      assert.strictEqual(await p3.evaluate(() => localStorage.getItem("sq2.user")), userId);
      assert(await p3.isVisible("#study-bar"), "with the bar back to the checklist");
      await c3.close();
      await ctx.close();
    });

    await test("flow e. Testing opens /study; its Discover step lands in the demo app with a '← Study checklist' bar", async () => {
      const { ctx, page } = await phone({ user: null });
      await page.goto(base);
      await question(page);
      await Promise.all([page.waitForURL(/\/study$/), page.click('.mode-pick[data-pick="test"]')]);
      assert.strictEqual(await page.evaluate(() => sessionStorage.getItem("sq2.mode")), "test");
      await page.waitForSelector("#c-age");
      // The start page in the same tab sends a tester back to the study
      await page.goto(base);
      await page.waitForURL(/\/study/);
      await agreeStudy(page);
      await page.click("#start");
      await page.waitForURL(/\/study\?s=/);
      const sid = new URL(page.url()).searchParams.get("s");
      await page.click("#skipAccount"); // the account step: skipped, so the app links use the demo
      await skipQuestions(page);
      await page.waitForSelector(".steps");
      await page.click('.step-h[data-step="discover"]').catch(() => {});
      if (!(await page.$('a:has-text("Open Discover")'))) await page.click('.step-h[data-step="discover"]');
      const href = await page.getAttribute('a:has-text("Open Discover")', "href");
      assert.strictEqual(href, `/?demo=1&study=${encodeURIComponent(sid)}`);
      await page.click('a:has-text("Open Discover")');
      await mapUp(page);
      assert.strictEqual(await page.evaluate(() => SQ.d.user && SQ.d.user.demo), true, "signed in to the demo");
      assert.strictEqual(new URL(page.url()).search, "", "the link's details are tidied out of the address");
      const bar = await page.$eval("#study-bar", (b) => ({ shown: !b.hidden && b.getBoundingClientRect().height, text: b.textContent.trim(), href: b.getAttribute("href") }));
      assert(bar.shown >= 44, "the bar shows, 44px tall");
      assert.strictEqual(bar.text, "← Study checklist");
      assert.strictEqual(bar.href, `/study?s=${encodeURIComponent(sid)}#discover`);
      assert.strictEqual(await page.getAttribute('nav.tabs a.tab:has-text("Plan")', "href"), `/sk?study=${encodeURIComponent(sid)}`, "Plan keeps the study");
      await ctx.close();
    });

    for (const [w, h] of [[375, 812], [1280, 800]]) {
      await test(`flow f${w === 1280 ? "/i" : ""}. ${w} px: the zoom into the city: lights past 1.5x, pins flying in, on the map within 1.5 s`, async () => {
        const { ctx, page } = await phone({ user: null, width: w, height: h });
        await page.goto(base);
        await question(page);
        if (w === 1280) {
          const r = await page.$$eval(".mode-pick", (bs) => bs.map((b) => b.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), left: r.left, right: r.right })));
          assert(r[0].top === r[1].top && r[1].left >= r[0].right, "the two choices sit side by side");
        }
        await page.evaluate(sampleZoom);
        const t0 = Date.now();
        await page.click('.mode-pick[data-pick="demo"]');
        await mapUp(page);
        const took = Date.now() - t0;
        await wait(300);
        const z = await page.evaluate(() => window.__z);
        const maxScale = Math.max(...z.filter((f) => f.scale).map((f) => f.scale));
        const end = z.find((f) => !f.boot && f.screen === "discover");
        const flying = z.filter((f) => f.boot && f.pins.some(moved));
        // Pins off the screen don't fly, so look at whichever of the first eight moved the most (not just the first in the page)
        const pinPath = { size: Math.max(0, ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => new Set(flying.map((f) => f.pins[k]).filter(Boolean)).size)) };
        console.log(`      lights to ${maxScale.toFixed(2)}x; pins moving in ${flying.length} frames; on the map at ${end ? Math.round(end.t) : "?"} ms (${took} ms by the clock)`);
        assert(maxScale > 1.5, `lights scaled ${maxScale}`);
        assert(flying.length >= 3 && pinPath.size >= 3, "the pins moved (their transforms changed frame to frame)");
        assert(end && end.t <= 1500, `on the map at ${end && end.t} ms`);
        assert(z.filter((f) => !f.boot).every((f) => f.pins.every((t) => !moved(t))), "the pins end in their real spots");
        if (w === 1280) {
          const lay = await page.evaluate(() => ({ panel: document.querySelector(".lx-sheet").getBoundingClientRect().toJSON(), map: document.querySelector(".disc-map.lx > .map").getBoundingClientRect().toJSON(), list: getComputedStyle(document.querySelector(".lx-list")).display }));
          assert(lay.panel.width >= 360 && lay.panel.width <= 440 && lay.panel.top <= 1, `a side panel: ${JSON.stringify(lay.panel)}`);
          assert(lay.map.left >= lay.panel.right - 1, "the map fills the rest");
          assert.notStrictEqual(lay.list, "none", "the list shows in the panel");
        }
        assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, "no sideways scroll");
        await ctx.close();
      });
    }

    await test("flow g. A tap during the zoom jumps to its end", async () => {
      const { ctx, page } = await phone({ user: null });
      await page.goto(base);
      await question(page);
      await page.click('.mode-pick[data-pick="demo"]');
      await wait(200);
      const t0 = Date.now();
      await page.mouse.click(180, 300);
      await mapUp(page);
      const took = Date.now() - t0;
      const still = await page.evaluate(() => [...document.querySelectorAll("#screen .map-pin2 > i")].filter((i) => i.getAnimations().length).length);
      console.log(`      on the map ${took} ms after the tap`);
      assert(took < 400, `jumped to the end (${took} ms)`);
      assert.strictEqual(still, 0, "no pin still flying");
      // And a tap during the question's rise shows it at once
      const { ctx: c2, page: p2 } = await phone({ user: null });
      await p2.goto(base);
      await p2.waitForSelector("#boot .b-q");
      await p2.mouse.click(10, 10);
      await p2.waitForFunction(() => getComputedStyle(document.querySelector("#boot .b-q")).opacity === "1", null, { timeout: 300 });
      await c2.close();
      await ctx.close();
    });

    await test("flow h. Reduced motion: crossfades only, no transforms (question, lights, pins)", async () => {
      const { ctx, page } = await phone({ user: null, reducedMotion: "reduce", init: () => {
        window.__qt = [];
        const tick = () => { const q = document.querySelector("#boot .b-q"); if (q) window.__qt.push(getComputedStyle(q).transform); if (window.__qt.length < 40) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      } });
      await page.goto(base);
      await question(page);
      assert((await page.evaluate(() => window.__qt)).every((t) => !moved(t)), "the question fades in without moving");
      await page.evaluate(sampleZoom);
      await page.click('.mode-pick[data-pick="demo"]');
      await mapUp(page);
      await wait(200);
      const z = await page.evaluate(() => window.__z);
      assert(z.some((f) => f.boot && f.op > 0.05 && f.op < 0.95), "it crossfades to the map");
      assert(z.every((f) => !moved(f.lightsT) && !moved(f.qT) && f.pins.every((t) => !moved(t))), "no transforms anywhere");
      await ctx.close();
    });

    await test("flow j. Tabs crossfade (150 ms, no slide); pushed screens slide in from the right (250 ms); Back reverses it", async () => {
      const { ctx, page } = await phone();
      await page.goto(base);
      await ready(page);
      const watch = () => page.evaluate(() => { window.__nav = []; const t0 = performance.now(); const tick = () => { const g = document.querySelector(".nav-ghost"); const s = document.querySelector("#screen > .screen"); window.__nav.push({ t: performance.now() - t0, ghost: g ? g.className : null, gOp: g ? Number(getComputedStyle(g).opacity) : null, gT: g ? getComputedStyle(g).transform : null, sT: s ? getComputedStyle(s).transform : null }); if (performance.now() - t0 < 600) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
      const xOf = (t) => { const m = /matrix\(([^)]+)\)/.exec(t || ""); return m ? Number(m[1].split(",")[4]) : 0; };
      await watch();
      await page.click('nav.tabs .tab:has-text("Squads")');
      await wait(650);
      let f = await page.evaluate(() => window.__nav);
      const fade = f.filter((x) => x.ghost && /fade/.test(x.ghost));
      assert(fade.some((x) => x.gOp > 0.05 && x.gOp < 0.95), "the old tab fades out over the new one");
      assert(f.every((x) => !moved(x.gT) && !moved(x.sT)), "no slide between tabs");
      assert(Math.max(...fade.map((x) => x.t)) < 260, "about 150 ms");
      assert.strictEqual(await page.evaluate(() => SQ.u.screen), "squads");
      // Into a sidequest: it slides in from the right
      await page.click('nav.tabs .tab:has-text("Discover")');
      await ready(page);
      await wait(250);
      const id = await page.$eval(".dx-rail .lx-card.ev .lx-main", (b) => b.dataset.arg);
      await watch();
      await page.click(`.dx-rail .lx-main[data-arg="${id}"]`);
      await wait(650);
      f = await page.evaluate(() => window.__nav);
      const push = f.filter((x) => xOf(x.sT) > 1);
      assert(push.length >= 2, "the new screen moved in from the right");
      assert(push.every((x, k) => !k || xOf(x.sT) <= xOf(push[k - 1].sT) + 0.5), "right to left");
      assert(f.some((x) => x.ghost && /push/.test(x.ghost)), "the old screen stays underneath");
      assert.strictEqual(await page.evaluate(() => SQ.u.screen), "quest");
      assert(!moved(await page.$eval("#screen > .screen", (s) => getComputedStyle(s).transform)), "and settles with no transform");
      // Back: the sidequest slides back out to the right
      await watch();
      await page.click("[data-back]");
      await wait(650);
      f = await page.evaluate(() => window.__nav);
      const back = f.filter((x) => x.ghost && /back/.test(x.ghost) && xOf(x.gT) > 1);
      assert(back.length >= 2 && back.every((x, k) => !k || xOf(x.gT) >= xOf(back[k - 1].gT) - 0.5), "Back slides it out to the right");
      assert.strictEqual(await page.evaluate(() => SQ.u.screen), "discover");
      assert(!(await page.$(".nav-ghost")), "and the copy goes away");
      await ctx.close();
    });

    await test("flow k. A slow list (search results) shows skeleton rows after 300 ms, a message at 1 s; a fast one shows none", async () => {
      let delay = 1800;
      const { ctx, page } = await phone({ route: (r, u) => (u.pathname === "/api/search" && delay ? wait(delay).then(() => r.continue()) : r.continue()) });
      await page.goto(base);
      await ready(page);
      const search = async (q) => {
        await page.fill(".lx .search input", q);
        await page.evaluate(() => {
          window.__sk = []; const t0 = performance.now();
          const tick = () => { const w = document.querySelector(".wait-sk"), m = document.querySelector(".wait-msg"); window.__sk.push({ t: performance.now() - t0, sk: w ? Number(getComputedStyle(w).opacity) : 0, rows: w ? w.querySelectorAll(".sk-row").length : 0, msg: m ? Number(getComputedStyle(m).opacity) : 0, spin: !!document.querySelector("#screen .thinking") }); if (performance.now() - t0 < 2200) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
        });
        await page.press(".lx .search input", "Enter");
        await wait(2300);
        return page.evaluate(() => window.__sk);
      };
      let f = await search("jazz");
      assert(f.filter((x) => x.t < 250).every((x) => x.sk < 0.05), "nothing in the first 300 ms");
      const shown = f.find((x) => x.sk > 0.9);
      assert(shown && shown.t >= 290 && shown.t < 700 && shown.rows >= 3, `skeleton rows from ${shown && Math.round(shown.t)} ms`);
      assert(f.filter((x) => x.t < 950).every((x) => x.msg < 0.05) && f.some((x) => x.t > 1100 && x.msg > 0.9), "the message after 1 s");
      assert(f.every((x) => !x.spin), "no spinner");
      await page.screenshot({ path: path.join(SHOTS, "k-search-results.png") });
      delay = 0;
      await page.click("[data-back]");
      await ready(page);
      f = await search("comedy");
      assert(f.every((x) => x.sk < 0.05), "a fast search never shows a skeleton");
      assert(await page.$(".search-hit, .search-end"), "the results came");
      // The status line says what the list holds (events and places found), never the size of the pool searched
      await page.waitForFunction(() => Array.isArray(SQ.u.search.places), null, { timeout: 8000 });
      await wait(200);
      const st = await page.evaluate(() => {
        const s = SQ.u.search, u = SQ.d.user;
        const nE = s.matches.filter((m) => SQ.d.events.some((e) => e.id === m.id) && !u.notForMe.includes(m.id)).length;
        return { text: document.querySelector(".search-status").textContent, nE, nP: s.places.length };
      });
      const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
      assert(st.text.startsWith(`${plural(st.nP, "place")}, ${plural(st.nE, "event")}`), `status "${st.text}" vs ${st.nP} places, ${st.nE} events`);
      assert(!/keyword matches/.test(st.text), "no pool count");
      await page.click('.search-kind button[data-arg="events"]');
      assert((await page.textContent(".search-status")).startsWith(plural(st.nE, "event")), "Events: only the events count");
      await page.click('.search-kind button[data-arg="places"]');
      assert((await page.textContent(".search-status")).startsWith(plural(st.nP, "place")), "Places: only the places count");
      await ctx.close();
    });

    await test("flow l. A waiting button changes its label in place ('Joining' with three dots, then '✓ You're in') and never changes width", async () => {
      const { ctx, page } = await phone({ route: (r, u) => (u.pathname === "/api/act" && /"type":"accept"/.test(r.request().postData() || "") ? wait(900).then(() => r.continue()) : r.continue()) });
      await page.goto(base);
      await ready(page);
      const found = await page.evaluate(async () => {
        for (const e of SQ.d.events) {
          if (e.over || SQ.is19(e) || e.price !== 0 || SQ.d.user.log[e.id]) continue;
          SQ.u.quest = e.id;
          SQ.go("quest");
          if (document.querySelector('[data-act="getTickets"][data-pending]')) return e.id;
        }
        return null;
      });
      assert(found, "a free sidequest to join");
      await wait(400);
      const sel = '[data-act="getTickets"][data-pending]';
      const before = await page.$eval(sel, (b) => b.getBoundingClientRect().width);
      await page.evaluate((s) => {
        const b = document.querySelector(s); window.__btn = [];
        const tick = () => { if (b.isConnected) { window.__btn.push({ w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height, text: b.textContent.trim(), pend: b.classList.contains("is-pending"), dots: b.querySelectorAll(".pend-dots i").length }); requestAnimationFrame(tick); } };
        requestAnimationFrame(tick);
      }, sel);
      await page.click(sel);
      await page.waitForFunction(() => SQ.u.screen === "questlog", null, { timeout: 5000 });
      const f = await page.evaluate(() => window.__btn);
      assert(f.some((x) => x.pend && x.text === "Joining" && x.dots === 3), "'Joining' with three dots");
      assert(f.some((x) => x.text === "You're in"), "then '✓ You're in'");
      assert(f.every((x) => Math.abs(x.w - before) < 0.6), `the width stayed ${before}px (${[...new Set(f.map((x) => x.w))].join(", ")})`);
      await ctx.close();
    });

    await test("flow m. An API error shows a plain sentence and 'Try again' in place of the results, keeps the words typed, and Try again works", async () => {
      let fail = true;
      const { ctx, page } = await phone({ route: (r, u) => (u.pathname === "/api/search" && fail ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }) : r.continue()) });
      await page.goto(base);
      await ready(page);
      await page.fill(".lx .search input", "live jazz tonight");
      await page.press(".lx .search input", "Enter");
      await page.waitForSelector(".err-block");
      const text = await page.textContent(".err-block");
      assert.match(text, /Couldn't load your results/);
      assert.match(text, /Try again/);
      assert(!/boom|you|your fault|invalid/i.test(text.replace(/your results|Your search/g, "")), `doesn't blame the person: ${text}`);
      assert.strictEqual(await page.inputValue(".search input"), "live jazz tonight", "what they typed stays");
      await page.screenshot({ path: path.join(SHOTS, "m-error.png") });
      fail = false;
      await page.click(".err-retry");
      await page.waitForSelector(".search-hit, .search-end", { timeout: 8000 });
      assert(!(await page.$(".err-block")), "the error is gone");
      await ctx.close();
    });

    // ---------- Who sees the question: accounts ----------
    const ACC_SHOTS = process.env.ACCOUNT_SHOTS || path.join(SHOTS, "account");
    fs.mkdirSync(ACC_SHOTS, { recursive: true });
    const tidy = (t) => t.route("**/*", (rt) => (new URL(rt.request().url()).hostname === "localhost" ? rt.continue() : rt.abort()));
    // Watches every frame for the question and the lights' scale (the zoom)
    const watchOpening = () => {
      window.__op = { asked: 0, scale: 1, frames: 0 };
      const tick = () => {
        if (document.querySelector("#boot .b-q, .mode-h")) window.__op.asked++;
        const l = document.querySelector("#boot .b-lights");
        if (l) { const t = getComputedStyle(l).transform; if (t && t !== "none") window.__op.scale = Math.max(window.__op.scale, new DOMMatrixReadOnly(t).a); }
        if (++window.__op.frames < 400) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    await test("account a. A signed-in real account opening a fresh tab goes to Discover with no question, the zoom still plays, and its session is unchanged", async () => {
      const { ctx, page } = await phone({ user: userId, mode: null, init: watchOpening });
      await page.goto(base);
      await mapUp(page);
      await wait(300);
      const op = await page.evaluate(() => window.__op);
      assert.strictEqual(op.asked, 0, "the question never showed");
      assert(op.scale > 1.5, `the zoom into the map played (lights to ${op.scale.toFixed(2)}x)`);
      assert.strictEqual(await page.evaluate(() => SQ.d.user && SQ.d.user.id), userId, "the same account");
      assert.strictEqual(await page.evaluate(() => SQ.d.user.demo), undefined, "not the demo");
      assert.strictEqual(await page.evaluate(() => localStorage.getItem("sq2.user")), userId, "the session is unchanged");
      assert(!(await page.evaluate(() => sessionStorage.getItem("sq2.demo"))), "no demo flag");
      // Another fresh tab on the same device: the same
      const tab = await ctx.newPage();
      await tidy(tab);
      await tab.addInitScript(watchOpening);
      await tab.goto(base);
      await mapUp(tab);
      assert.strictEqual(await tab.evaluate(() => window.__op.asked), 0, "no question in a new tab either");
      assert.strictEqual(await tab.evaluate(() => SQ.d.user && SQ.d.user.id), userId);
      // And a reload in it stays put, no question, no demo
      await tab.reload();
      await mapUp(tab);
      assert(!(await tab.$(".mode-h")));
      assert.strictEqual(await tab.evaluate(() => SQ.d.user && SQ.d.user.id), userId);
      await ctx.close();
    });

    await test("account a. Reduced motion: a signed-in fresh visit crossfades onto the map, no transforms", async () => {
      const { ctx, page } = await phone({ user: userId, mode: null, reducedMotion: "reduce", init: watchOpening });
      await page.goto(base);
      await mapUp(page);
      const op = await page.evaluate(() => window.__op);
      assert.strictEqual(op.asked, 0);
      assert.strictEqual(op.scale, 1, "the lights didn't scale");
      await ctx.close();
    });

    await test("account b. Signed out, the question has 'Sign in or create an account'; it opens the login and lands in the app signed in", async () => {
      const { ctx, page } = await phone({ user: null });
      await page.goto(base);
      await question(page);
      const link = await page.$eval(".mode-signin", (b) => { const r = b.getBoundingClientRect(); const c = getComputedStyle(b); return { text: b.textContent.trim(), h: r.height, w: r.width, bg: c.backgroundImage, size: parseFloat(c.fontSize), weight: c.fontWeight, below: r.top >= document.querySelector(".mode-picks").getBoundingClientRect().bottom }; });
      assert.strictEqual(link.text, "Sign in or create an account");
      assert(link.h >= 44 && link.w >= 44, "a 44 px target");
      assert(!/gradient/.test(link.bg), "no gradient: that's the primary choice's");
      assert(link.below, "under the two choices");
      assert(link.size >= 12 && ["400", "500", "600"].includes(link.weight));
      assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
      await page.screenshot({ path: path.join(ACC_SHOTS, "question-sign-in.png") });
      await page.click(".mode-signin");
      await page.waitForFunction(() => SQ.u.screen === "login" && !document.getElementById("boot"), null, { timeout: 8000 });
      const email = await page.evaluate(async (id) => (await (await fetch(`/api/state?user=${id}&host=`)).json()).user.email, userId);
      await page.fill('[data-bind="login.email"]', email);
      await page.click('button[data-act="requestCode"]');
      await page.waitForFunction(() => SQ.u.screen === "login-code" && SQ.u.login.demoCode, null, { timeout: 8000 });
      const code = await page.evaluate(() => SQ.u.login.demoCode);
      await page.fill('[data-bind="login.code"]', code);
      await page.click('button[data-act="verifyCode"]');
      await mapUp(page);
      assert.strictEqual(await page.evaluate(() => SQ.d.user && SQ.d.user.id), userId, "signed in as that account");
      assert.strictEqual(await page.evaluate(() => localStorage.getItem("sq2.user")), userId);
      // A reload, then a fresh tab: straight to the app, no question
      await page.reload();
      await mapUp(page);
      assert(!(await page.$(".mode-h")));
      const tab = await ctx.newPage();
      await tidy(tab);
      await tab.goto(base);
      await mapUp(tab);
      assert(!(await tab.$(".mode-h")), "a fresh tab doesn't ask once signed in");
      assert.strictEqual(await tab.evaluate(() => SQ.d.user && SQ.d.user.id), userId);
      // "Create an account" is one tap from there too
      const { ctx: c2, page: p2 } = await phone({ user: null });
      await p2.goto(base);
      await question(p2);
      await p2.click(".mode-signin");
      await p2.waitForFunction(() => SQ.u.screen === "login", null, { timeout: 8000 });
      await p2.click('button:has-text("New to Sidequest? Create an account")');
      await p2.waitForFunction(() => SQ.u.screen === "role");
      await c2.close();
      await ctx.close();
    });

    await test("account c. Demoing: the sandbox note shows on its card, and Demoing still lands on the map in the shared demo", async () => {
      const { ctx, page } = await phone({ user: null });
      await page.goto(base);
      await question(page);
      const note = await page.$eval('.mode-pick.pri .mode-n', (n) => { const c = getComputedStyle(n); return { text: n.textContent.trim(), shown: n.getBoundingClientRect().height > 0 && c.visibility !== "hidden", size: parseFloat(c.fontSize), weight: c.fontWeight }; });
      assert(note.shown, "the note shows");
      assert.match(note.text, /visible to everyone using it, and is reset/);
      assert(note.size >= 12 && ["400", "500", "600"].includes(note.weight));
      await page.locator(".mode-pick.pri").screenshot({ path: path.join(ACC_SHOTS, "demo-sandbox-note-card.png") });
      await page.screenshot({ path: path.join(ACC_SHOTS, "demo-sandbox-note.png") });
      await page.click('.mode-pick[data-pick="demo"]');
      await mapUp(page);
      assert.strictEqual(await page.evaluate(() => SQ.d.user && SQ.d.user.demo), true);
      assert(await page.evaluate(() => SQ.screens.profile.render().includes("Exit demo")), "Exit demo is kept (on Profile)");
      // A restart (the demo account forgotten), then a fresh tab: Demoing still works
      forgetDemo();
      const tab = await ctx.newPage();
      await tidy(tab);
      await tab.goto(base);
      await question(tab);
      await tab.click('.mode-pick[data-pick="demo"]');
      await mapUp(tab);
      assert.strictEqual(await tab.evaluate(() => SQ.d.user && SQ.d.user.demo), true);
      await ctx.close();
    });

    await test("account d. Testing: an account after consent, the checklist's app links use it, skipping falls back to the demo, and the export is anonymous", async () => {
      const stamp2 = Date.now().toString(36);
      const tester = { name: "Rowan", email: `rowan-${stamp2}@example.com` };
      // 1. Create an account
      const { ctx, page } = await phone({ user: null });
      await page.goto(base);
      await question(page);
      await Promise.all([page.waitForURL(/\/study$/), page.click('.mode-pick[data-pick="test"]')]);
      await agreeStudy(page);
      await page.click("#start");
      await page.waitForSelector("text=Create your account (1 min)");
      const sid1 = new URL(page.url()).searchParams.get("s");
      await page.waitForFunction(() => !document.documentElement.classList.contains("arrive"), null, { timeout: 5000 }); // the rows' fade-in is over
      assert(await page.isVisible("text=Already have an account? Sign in"), "sign-in for returning testers");
      assert(await page.isVisible("#skipAccount"), "and a way to skip");
      const look = await page.evaluate(() => {
        const out = { small: [], tiny: [], weights: new Set(), grad: 0, overflow: document.documentElement.scrollWidth - innerWidth };
        for (const el of document.querySelectorAll("#app button, #app input, #app a")) { const r = el.getBoundingClientRect(); if (r.width && (r.height < 43.5)) out.small.push(`${el.tagName}#${el.id}.${el.className} ${Math.round(r.height)}`); if (/gradient/.test(getComputedStyle(el).backgroundImage)) out.grad++; }
        for (const el of document.querySelectorAll("#app *")) { if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue; const c = getComputedStyle(el); out.weights.add(c.fontWeight); if (parseFloat(c.fontSize) < 12) out.tiny.push(el.textContent.trim().slice(0, 20)); }
        out.weights = [...out.weights];
        return out;
      });
      assert.deepStrictEqual(look.small, [], "44 px targets");
      assert.deepStrictEqual(look.tiny, [], "text 12 px or larger");
      assert(look.weights.every((w) => ["400", "500", "600"].includes(w)), `weights ${look.weights}`);
      assert.strictEqual(look.grad, 1, "the gradient only on the primary button");
      assert(look.overflow <= 0, "no sideways scroll");
      await page.screenshot({ path: path.join(ACC_SHOTS, "study-account-step.png"), fullPage: true });
      await page.fill("#a-name", tester.name);
      await page.fill("#a-email", tester.email);
      await page.click('[data-vibe="Live music"]');
      await page.click('[data-vibe="Comedy"]');
      await page.click('#acctCreate [type=submit]');
      await skipQuestions(page);
      await page.waitForSelector(".steps");
      const own = await page.evaluate(() => localStorage.getItem("sq2.user"));
      const made = dbm.data.users[own];
      assert(made && made.email === tester.email && made.registered && !made.demo, "a real, finished account");
      if (!(await page.$('a:has-text("Open Discover")'))) await page.click('.step-h[data-step="discover"]');
      const href = await page.getAttribute('a:has-text("Open Discover")', "href");
      assert.strictEqual(href, `/?study=${encodeURIComponent(sid1)}`, "the app link uses their account, not the demo");
      await page.click('a:has-text("Open Discover")');
      await mapUp(page);
      assert.strictEqual(await page.evaluate(() => SQ.d.user && SQ.d.user.id), own, "the app opens as their account");
      assert(!(await page.evaluate(() => SQ.d.user.demo)), "not the demo");
      assert(await page.isVisible("#study-bar"), "with the bar back to the checklist");
      // What they make is theirs and stays: a save survives a reload
      const ev = await page.evaluate(() => SQ.d.events.find((e) => !e.over).id);
      await page.evaluate((id) => SQ.act("save", { eventId: id }), ev);
      await page.reload();
      await mapUp(page);
      assert.strictEqual(await page.evaluate(() => SQ.d.user.id), own);
      // 2. Skip: the demo
      const { ctx: c2, page: p2 } = await phone({ user: null });
      await p2.goto(`${base}/study`);
      await agreeStudy(p2);
      await p2.click("#start");
      await p2.waitForSelector("#skipAccount");
      const sid2 = new URL(p2.url()).searchParams.get("s");
      await p2.click("#skipAccount");
      await skipQuestions(p2);
      await p2.waitForSelector(".steps");
      if (!(await p2.$('a:has-text("Open Discover")'))) await p2.click('.step-h[data-step="discover"]');
      assert.strictEqual(await p2.getAttribute('a:has-text("Open Discover")', "href"), `/?demo=1&study=${encodeURIComponent(sid2)}`);
      await p2.click('a:has-text("Open Discover")');
      await mapUp(p2);
      assert.strictEqual(await p2.evaluate(() => SQ.d.user && SQ.d.user.demo), true, "the demo account");
      // 3. A returning tester signs in
      const { ctx: c3, page: p3 } = await phone({ user: null });
      await p3.goto(`${base}/study`);
      await agreeStudy(p3);
      await p3.click("#start");
      await p3.click("text=Already have an account? Sign in");
      await p3.fill("#a-email", tester.email);
      await p3.click("#acctSignin [type=submit]");
      await p3.waitForSelector("#a-code");
      const code = await p3.$eval(".note b", (b) => b.textContent.trim());
      await p3.fill("#a-code", code);
      await p3.click("#acctCode [type=submit]");
      await skipQuestions(p3);
      await p3.waitForSelector(".steps");
      const sid3 = new URL(p3.url()).searchParams.get("s");
      assert.strictEqual(await p3.evaluate(() => localStorage.getItem("sq2.user")), own, "signed in as their account");
      if (!(await p3.$('a:has-text("Open Discover")'))) await p3.click('.step-h[data-step="discover"]');
      assert.strictEqual(await p3.getAttribute('a:has-text("Open Discover")', "href"), `/?study=${encodeURIComponent(sid3)}`);
      // 4. The export: account kind and internal id only, no names or emails
      await require(path.join(ROOT, "lib", "sidekick", "study")).flush();
      const json = await (await realFetch(`${base}/api/sk/study/export?key=launch-study-key&format=json`)).json();
      const csvT = await (await realFetch(`${base}/api/sk/study/export?key=launch-study-key&table=testers`)).text();
      const rows = Object.fromEntries(json.testers.map((r) => [r.session, r]));
      assert.strictEqual(rows[sid1].account_kind, "own");
      assert.strictEqual(rows[sid1].account_id, own, "linked by the internal id");
      assert.strictEqual(rows[sid2].account_kind, "demo");
      assert.strictEqual(rows[sid2].account_id, null, "the demo has no id");
      assert.strictEqual(rows[sid3].account_kind, "own");
      assert(/account_kind,account_id/.test(csvT), "the CSV has the columns");
      const all = JSON.stringify(json) + csvT;
      for (const bad of [tester.name, tester.email, "@example.com", "Launch Test", "demo@sidequest.app"]) assert(!all.includes(bad), `the export contains "${bad}"`);
      assert(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(all), "no email anywhere in the export");
      const raw = fs.readFileSync(process.env.SIDEKICK_STUDY_FILE, "utf8");
      assert(!raw.includes(tester.email) && !raw.includes(tester.name), "the study file keeps no name or email either");
      await c3.close();
      await c2.close();
      await ctx.close();
    });
  } finally {
    await browser.close();
    restore();
  }
  console.log(failures ? `\n${failures} failed` : "\nAll launch checks passed");
  console.log(`Screenshots: ${SHOTS}`);
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); restore(); process.exit(1); });
