// The Discover map's fixes and saved places, in a real browser against the real server (Google faked, every outside
// request blocked so the light map stands in), at 375 and 1280 px:
//  a. pins styled by list: Going (deep violet star), Saved (rose heart), Hosting (amber flag), Places (teal), each a
//     44 px target, with their list in the label;
//  b. saved places live in Sidequests now (the redesign took the "Your places" pill off Discover): Saved lists the saved
//     one, Your events the one you're going to, each row a 44 px target with AA contrast, and no sideways overflow;
//  c. pins grouped when zoomed out (a numbered 44 px button that zooms in), single pins again when zoomed in;
//  d. no pin in the lake: an event with lake (or outside-the-GTA) coordinates gets no pin but stays in the list;
//  e. "you are here" only once the browser shares the location (live, by default once allowed), and it's never stored.
//
//   NODE_PATH=/opt/node-tools/node_modules node test/map-places.e2e.js
//   MAP_SHOTS=/some/folder ... to keep screenshots

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mapplaces-"));
const SHOTS = process.env.MAP_SHOTS || path.join(tmp, "shots");
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

// A simple polygon of Lake Ontario's open water off Toronto (independent of the app's own), [lng, lat]
const SIMPLE_LAKE = [[-79.75, 43.35], [-79.55, 43.52], [-79.45, 43.6], [-79.38, 43.6], [-79.3, 43.64], [-79.15, 43.73], [-78.9, 43.82], [-78.9, 43.35]];
const inSimpleLake = (lat, lng) => {
  let inside = false;
  for (let i = 0, j = SIMPLE_LAKE.length - 1; i < SIMPLE_LAKE.length; j = i++) {
    const [xi, yi] = SIMPLE_LAKE[i], [xj, yj] = SIMPLE_LAKE[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
// WCAG contrast of two "rgb(r, g, b)" strings
function contrast(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

(async () => {
  const port = await freePort();
  Object.assign(process.env, {
    PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "",
    GOOGLE_MAPS_API_KEY: "test-key", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off",
    SIDEKICK_STUDY_FILE: path.join(tmp, "sidekick-study.json"), SIDEKICK_STUDY_KEY: "map-study-key",
  });
  for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SIDEKICK_PLACES_OFF", "FOURSQUARE_API_KEY"]) delete process.env[k];

  const realFetch = global.fetch;
  const evenings = { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 0 }, close: { day: (d + 1) % 7, hour: 1 } })) };
  const fakePlace = (n, name, lat, lng, types) => ({ id: `map_place_${n}`, displayName: { text: name }, formattedAddress: `${n} College St, Toronto`, location: { latitude: lat, longitude: lng }, types, primaryType: types[0], googleMapsUri: `https://maps.google.com/?cid=${n}`, regularOpeningHours: evenings });
  global.fetch = async (url, opts = {}) => {
    if (String(url).startsWith("https://places.googleapis.com/")) {
      return { ok: true, json: async () => ({ places: [
        fakePlace(1, "Snakes & Lattes Annex", 43.6655, -79.4105, ["cafe"]),
        fakePlace(2, "The Rex Hotel Jazz & Blues Bar", 43.6504, -79.3881, ["bar", "live_music_venue"]),
        fakePlace(3, "A Pin In The Lake", 43.6, -79.39, ["bar"]), // a bad point from a source: must never be pinned
      ] }) };
    }
    if (String(url).startsWith("http://localhost") || String(url).startsWith("http://127.0.0.1")) return realFetch(url, opts);
    throw new Error(`Unexpected outside fetch in test: ${url}`);
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
  const stamp = Date.now().toString(36);
  const { userId } = await act("signup", { name: "Map Test", email: `map-${stamp}@example.com`, username: `map_${stamp}` });
  await act("setProfile", { vibes: ["Live music", "Jazz", "Comedy", "Food & drink"], origin: "union", budget: 40, registered: true }, userId);
  // Three upcoming events on land, far enough apart to show as single pins at the default zoom
  const all = (await (await realFetch(`${base}/api/events`)).json());
  const events = (Array.isArray(all) ? all : all.events || []).filter((e) => e.startsAt && Date.parse(e.startsAt) > Date.now() + 3600000 && e.venue && Number.isFinite(e.venue.lat));
  const gta = require(path.join(ROOT, "..", "sketch-1", "lib", "gta"));
  const spread = [];
  for (const e of events) if (gta.onMap(e.venue.lat, e.venue.lng) && Math.abs(e.venue.lat - 43.65) < 0.03 && Math.abs(e.venue.lng + 79.39) < 0.04 && spread.every((x) => Math.hypot(x.venue.lat - e.venue.lat, x.venue.lng - e.venue.lng) > 0.008) && spread.length < 3) spread.push(e);
  assert.strictEqual(spread.length, 3, "found three upcoming events downtown");
  const [GO, SV, HO] = spread;
  await act("accept", { eventId: GO.id }, userId);
  await act("save", { eventId: SV.id }, userId);

  let chromium;
  try { ({ chromium } = require("playwright")); } catch { chromium = null; }
  if (!chromium) { console.log("FAIL  Playwright isn't installed (try NODE_PATH=/opt/node-tools/node_modules)"); restore(); process.exit(1); }
  const browser = await chromium.launch();

  async function phone({ width = 375, height = 812, permissions = [], geolocation } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, permissions, geolocation });
    await ctx.addInitScript(([uid]) => {
      try {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem("sq2.user", uid);
        sessionStorage.setItem("sq2.mode", "demo");
      } catch {}
    }, [userId]);
    await ctx.route("**/*", (r) => (new URL(r.request().url()).hostname !== "localhost" ? r.abort() : r.continue()));
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForFunction(() => document.querySelectorAll("#lx-sheet .lx-card").length > 0 && !document.getElementById("boot") && window.SQ && SQ.d && SQ.d.user, null, { timeout: 20000 });
    // Hosting comes from the tabs data; here the hosted quest is set on the page's copy of the account
    await page.evaluate((id) => { SQ.d.user.hosting = [{ id, guests: 3 }]; SQ.render(); }, HO.id);
    await page.waitForSelector(".map-pin2.yp.hosting", { timeout: 5000 });
    return { ctx, page };
  }

  try {
    for (const width of [375, 1280]) {
      const height = width === 375 ? 812 : 800;
      await test(`a. ${width}px: pins styled by list (Going star, Saved heart, Hosting flag, Places teal), 44 px targets`, async () => {
        const { ctx, page } = await phone({ width, height });
        await page.waitForSelector(".map-pin2.pl", { timeout: 10000 });
        const look = (sel) => page.$eval(sel, (b) => { const r = b.getBoundingClientRect(); const i = b.querySelector("i"); return { label: b.getAttribute("aria-label"), svg: b.querySelector("svg path") ? b.querySelector("svg path").getAttribute("d").slice(0, 12) : null, bg: getComputedStyle(i).backgroundColor, fg: getComputedStyle(i).color, w: r.width, h: r.height }; });
        const go = await look(".map-pin2.yp.going"), sv = await look(".map-pin2.yp.saved"), ho = await look(".map-pin2.yp.hosting"), pl = await look(".map-pin2.pl"), ev = await look(".map-pin2.ev");
        assert.strictEqual(go.label, `Going: ${GO.title}`);
        assert.strictEqual(sv.label, `Saved: ${SV.title}`);
        assert.strictEqual(ho.label, `Hosting: ${HO.title}`);
        assert.strictEqual(go.bg, "rgb(110, 61, 182)", "Going is deep violet");
        assert.strictEqual(sv.bg, "rgb(242, 122, 168)", "Saved is rose");
        assert.strictEqual(ho.bg, "rgb(242, 181, 68)", "Hosting is amber");
        assert.strictEqual(pl.bg, "rgb(92, 207, 230)", "Places stay teal");
        assert.strictEqual(ev.bg, "rgb(169, 122, 242)", "other events stay violet");
        assert(new Set([go.svg, sv.svg, ho.svg]).size === 3, "each list has its own shape");
        for (const p of [go, sv, ho]) assert(contrast(p.bg, p.fg) >= 4.5, `icon contrast ${contrast(p.bg, p.fg).toFixed(1)}`);
        for (const p of [go, sv, ho, pl, ev]) assert(p.w >= 44 && p.h >= 44, `44 px target (${p.w}x${p.h})`);
        // An event in a list is pinned once, in its list's style
        assert.strictEqual(await page.locator(`[data-arg="e${GO.id}"].map-pin2`).count(), 1);
        // The lake place from Google was dropped from the map
        assert(!(await page.$('.map-pin2[aria-label="Place: A Pin In The Lake"]')), "no pin for a point in the lake");
        await page.screenshot({ path: path.join(SHOTS, `pins-${width}.png`) });
        await ctx.close();
      });

      await test(`b. ${width}px: no Your places pill on Discover; saved places are in Sidequests (Saved, and Your events for Going)`, async () => {
        const { ctx, page } = await phone({ width, height });
        assert(!(await page.$(".lx-yp-chip, #lx-yp, .lx-loc")), "no Your places or location pill on Discover");
        await page.click('nav.tabs .tab:has-text("Sidequests")');
        await page.waitForSelector(".tb-seg");
        assert(await page.isVisible(`.sq-wallet [data-arg="${GO.id}"]`), "Going is in Your events");
        await page.click('.tb-seg button:has-text("Saved")');
        await page.waitForFunction((t) => document.querySelector(".sq-wallet").textContent.includes(t), SV.title);
        const row = await page.$eval(`.sq-wallet button[data-act="openQuest"][data-arg="${SV.id}"]`, (b) => { const r = b.getBoundingClientRect(); const card = b.closest(".tb-card"); return { h: r.height, fg: getComputedStyle(b.querySelector(".tb-t14")).color, bg: getComputedStyle(card).backgroundColor }; });
        assert(row.h >= 44, `the saved row is a 44 px target (${row.h})`);
        assert(contrast(row.fg, row.bg) >= 4.5, `text contrast ${contrast(row.fg, row.bg).toFixed(2)}`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways overflow");
        await page.screenshot({ path: path.join(SHOTS, `saved-${width}.png`) });
        await ctx.close();
      });
    }

    await test("c. Pins are grouped when zoomed out, and single again when zoomed in", async () => {
      const { ctx, page } = await phone();
      await page.waitForSelector(".map-pin2.pl", { timeout: 10000 });
      await page.evaluate(() => SQ.lx.setStop("peek")); // drag the sheet down for the map
      await page.waitForTimeout(400);
      assert.strictEqual(await page.locator(".map-cluster").count(), 0, "no groups at the default zoom");
      await page.evaluate(() => SQ.mapJump("discover", { lat: 43.66, lng: -79.39, zoom: 10 }));
      await page.waitForSelector(".map-cluster");
      const groups = await page.$$eval(".map-cluster", (cs) => cs.map((c) => ({ n: Number(c.textContent), label: c.getAttribute("aria-label"), w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height })));
      assert(groups.length >= 1 && groups.every((g) => g.n >= 2 && /pins here.*Zoom in/.test(g.label) && g.w >= 44 && g.h >= 44), JSON.stringify(groups));
      const hidden = await page.locator(".map-pin2.in-cluster").count();
      assert.strictEqual(hidden, groups.reduce((t, g) => t + g.n, 0), "every grouped pin is hidden behind its group");
      await page.screenshot({ path: path.join(SHOTS, "grouped-375.png") });
      const before = await page.evaluate(() => SQ.mapCenter("discover").zoom);
      await page.locator(".map-cluster").first().click();
      const after = await page.evaluate(() => SQ.mapCenter("discover").zoom);
      assert(after >= Math.max(12, before + 2) - 1e-9, `tapping a group zooms in (${before} -> ${after})`);
      await page.evaluate(() => SQ.mapJump("discover", { lat: 43.65, lng: -79.39, zoom: 13 }));
      await page.waitForFunction(() => !document.querySelector(".map-cluster"));
      assert.strictEqual(await page.locator(".map-pin2.in-cluster").count(), 0);
      await ctx.close();
    });

    await test("d. No pin in the lake: lake and outside-the-GTA events get no pin, and stay in the list", async () => {
      const { ctx, page } = await phone();
      const out = await page.evaluate(() => {
        const soon = new Date(Date.now() + 2 * 3600000).toISOString();
        const mk = (id, title, lat, lng) => ({ id, title, startsAt: soon, date: "Today", neighbourhood: "Harbourfront", area: "Downtown", venue: { name: "Somewhere", address: "N/A", lat, lng }, price: 0, priceNote: "Free", vibes: ["Live music"], tags: [], description: "", going: 0, friends: [], reviews: [], travel: { from: {} } });
        SQ.d.events.unshift(mk(990001, "Wet Gig", 43.6, -79.38), mk(990002, "Plus Code Picnic", 43.5747, -79.3498), mk(990003, "Buffalo Show", 42.88, -78.87), mk(990004, "No Pin Night", null, null));
        SQ.d.user.feed = null; // this week's list, soonest first, so the new ones are at the top
        SQ.lx.state().tab = "events"; // the sheet's Events pill: every event, not just the For you collections
        SQ.render();
        const pins = [...document.querySelectorAll("#screen .map-pin2, #screen .map-cluster")].map((b) => [+b.dataset.lat, +b.dataset.lng, b.getAttribute("aria-label")]);
        const list = document.querySelector("#lx-sheet .lx-list").textContent;
        return { pins, list };
      });
      const wet = out.pins.filter(([lat, lng]) => inSimpleLake(lat, lng));
      assert.deepStrictEqual(wet, [], "no pin lands in the lake");
      assert(!out.pins.some(([, , l]) => /Wet Gig|Plus Code Picnic|Buffalo Show|No Pin Night/.test(l || "")), "none of them is pinned");
      assert(out.pins.length > 5, "other pins are still there");
      for (const t of ["Wet Gig", "Plus Code Picnic", "No Pin Night"]) assert(out.list.includes(t), `${t} stays in the list`);
      await ctx.close();
    });

    await test("e. 'You are here' only once the browser shares the location (live once allowed), and it isn't stored", async () => {
      const { ctx, page } = await phone({ permissions: [], geolocation: { latitude: 43.65468, longitude: -79.40061 } });
      assert(!(await page.$(".map-you")), "no 'you' mark before sharing");
      await ctx.grantPermissions(["geolocation"]);
      await page.click(".lx-me");
      await page.waitForSelector(".map-you", { timeout: 8000 });
      const stored = await page.evaluate(() => JSON.stringify({ s: { ...sessionStorage }, l: { ...localStorage } }));
      assert(!/43\.65|79\.4/.test(stored), `no location in storage: ${stored.slice(0, 200)}`);
      // Allowed in the browser: the next visit uses the live location again, with no prompt, and still stores nothing
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll("#lx-sheet .lx-card").length > 0 && !document.getElementById("boot"), null, { timeout: 20000 });
      await page.waitForSelector(".map-you", { timeout: 8000 });
      const again = await page.evaluate(() => JSON.stringify({ s: { ...sessionStorage }, l: { ...localStorage } }));
      assert(!/43\.65|79\.4/.test(again), "still nothing stored");
      // Not allowed any more: no mark, and the chosen area (downtown here) instead
      await ctx.clearPermissions();
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll("#lx-sheet .lx-card").length > 0 && !document.getElementById("boot"), null, { timeout: 20000 });
      await page.waitForTimeout(600);
      assert(!(await page.$(".map-you")), "without permission there's no 'you' mark until they share again");
      assert.match(await page.textContent(".lx-where"), /Downtown Toronto/);
      await ctx.close();
    });
  } finally {
    await browser.close().catch(() => {});
    restore();
  }
  console.log(failures ? `\n${failures} failed` : "\nAll map and saved-places checks passed");
  process.exit(failures ? 1 : 0);
})();
