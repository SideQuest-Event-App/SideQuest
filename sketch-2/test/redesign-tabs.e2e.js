// The redesign of the main tabs (Discover, Squads, Profile, Your Sidequesters, Sidequests), end to end in a real
// browser against the real server. Google Places is faked in this process; every other outside request is blocked,
// so the light map stands in. The database file is copied first and put back afterwards.
//
//  a. Every photo is in violet duotone (the SVG filter's table values, on posters, place photos and squad cards).
//  b. For you shows vibe collections that mix events and places (the page and /api/foryou), each with a match %;
//     repeated shows collapse into one card with their dates; prices only when known.
//  c. The sheet has three heights (peek < half < full, by height), and the map's zoom − / + are stacked vertically on
//     the right with "my location" below them; "Search this area" after a pan, and a note outside the GTA.
//  d. Squads has no Friends section and one + in the header; "💬 N new" opens the squad's chat; the squad page has
//     one "Plan a night with <squad>" button (to /sk?squad=<id>); Profile has Your Sidequesters, with friend requests
//     at the top, search and "+ Add Sidequesters".
//  e. Sidequests' Requests tab is now Invites.
//  f. Labels are centred in segmented switches and the 1 to 5 rating buttons.
//  g. The event page hides a placeholder host ("PROMOTER NOT DEFINED") and "N/A" prices, writes ALL-CAPS
//     descriptions in sentence case, shows the right category, and keeps its ＋ and Tickets buttons.
//  h. No dead ends: every screen touched here has a way back (a back button, the tab bar, or the sheet).
//  i. At 375 x 667: no sideways scroll, 44 px targets, and neither the sheet nor the tab bar covers the main button.
//  j. While a call is live (localStorage "sk:live"), the Plan tab goes back to it, with a green dot.
//
//   NODE_PATH=/opt/node-tools/node_modules node test/redesign-tabs.e2e.js
//   REDESIGN_SHOTS=/some/folder ... to keep the 375 px screenshots

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "redesign-"));
const SHOTS = process.env.REDESIGN_SHOTS || path.join(tmp, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

(async () => {
  const port = await freePort();
  Object.assign(process.env, {
    PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "",
    GOOGLE_MAPS_API_KEY: "test-key", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off",
    SIDEKICK_STUDY_FILE: path.join(tmp, "study.json"),
  });
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SIDEKICK_PLACES_OFF;

  // ---------- Google Places, faked (and counted) ----------
  const google = [];
  const realFetch = global.fetch;
  const evenings = { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 0 }, close: { day: (d + 1) % 7, hour: 1 } })) };
  const fakePlace = (n, name, lat, lng, types, level, start) => ({ id: `redesign_place_${n}`, displayName: { text: name }, formattedAddress: `${n} College St, Toronto`, location: { latitude: lat, longitude: lng }, types, primaryType: types[0], priceLevel: level, ...(start ? { priceRange: { startPrice: { units: String(start) } } } : {}), googleMapsUri: `https://maps.google.com/?cid=${n}`, regularOpeningHours: evenings });
  global.fetch = async (url, opts = {}) => {
    if (String(url).startsWith("https://places.googleapis.com/")) {
      google.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ places: [
        fakePlace(1, "Chuan Skewers House", 43.6531, -79.3977, ["chinese_restaurant", "restaurant"], "PRICE_LEVEL_INEXPENSIVE", 15),
        fakePlace(2, "The Rex Hotel Jazz & Blues Bar", 43.6504, -79.3881, ["bar", "live_music_venue"], "PRICE_LEVEL_INEXPENSIVE", 15),
        fakePlace(3, "Track & Field", 43.6532, -79.4043, ["bar"], "PRICE_LEVEL_MODERATE"),
      ] }) };
    }
    return realFetch(url, opts);
  };

  require(path.join(ROOT, "server.js"));
  const dbm = require(path.join(ROOT, "lib", "db"));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 160; i++) { try { if ((await realFetch(`${base}/api/state`)).ok) break; } catch {} await wait(250); }
  const act = async (type, args, user) => {
    const r = await realFetch(`${base}/api/act`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, type, args }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    return body.result;
  };
  const stamp = Date.now().toString(36);
  const account = async (name) => {
    const { userId } = await act("signup", { name, email: `${name.toLowerCase().replace(/\W/g, "")}-${stamp}@example.com`, username: `${name.toLowerCase().replace(/\W/g, "")}_${stamp}` });
    await act("setProfile", { vibes: ["Live music", "Jazz", "Comedy", "Food & drink"], origin: "union", budget: 40, registered: true }, userId);
    return userId;
  };
  const userId = await account("Asia Redesign");
  const jordan = await account("Jordan Redesign");
  // A friend request waiting for Asia (from another account)
  await act("addFriend", { key: `u:${userId}` }, jordan);

  // A listing as ticket sites send it: a placeholder host, no price, an ALL-CAPS description and a junk category
  const soon = new Date(Date.now() + 26 * 3600000).toISOString();
  const shout = { id: 991001, source: "Ticketmaster", sourceUrl: "https://example.com/hallmark", ticketLink: "https://example.com/hallmark", title: "The Hallmark(ish) Parody Musical", date: "Soon", startsAt: soon, endsAt: null,
    neighbourhood: "North York", area: "North York", venue: { name: "Meridian Arts Centre", address: "5040 Yonge St", lat: 43.7686, lng: -79.4135 }, scene: "Other", price: null, priceNote: "N/A",
    description: "THE MUSICAL COMEDY THAT CELEBRATES YOUR FAVOURITE HOLIDAY MOVIES. HOLLY, AN OVERWORKED BIG-CITY EXECUTIVE, RETURNS HOME.", tags: ["undefined", "theatre"], vibes: [], rating: null, reviews: [], going: 0, attendees: [],
    organizer: { name: "PROMOTER NOT DEFINED", rating: null, review: "" }, friends: [], travel: { stop: "", walkKm: null, from: {} }, image: null, dayInfo: { entrance: "N/A", home: "", coat: "N/A" } };
  dbm.data.events.push(shout);

  let chromium;
  try { ({ chromium } = require("playwright")); } catch { chromium = null; }
  if (!chromium) { console.log("FAIL  Playwright isn't installed (try NODE_PATH=/opt/node-tools/node_modules)"); restore(); process.exit(1); }
  const browser = await chromium.launch();

  async function phone({ width = 375, height = 667, init } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    await ctx.addInitScript(([uid]) => {
      try {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        localStorage.setItem("sq2.user", uid);
        sessionStorage.setItem("sq2.mode", "app");
      } catch {}
    }, [userId]);
    if (init) await ctx.addInitScript(init);
    await ctx.route("**/*", (r) => (new URL(r.request().url()).hostname !== "localhost" ? r.abort() : r.continue()));
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForFunction(() => document.querySelectorAll("#lx-sheet .lx-card").length > 0 && !document.getElementById("boot") && window.SQ && SQ.d && SQ.d.user, null, { timeout: 25000 });
    return { ctx, page };
  }
  const go = (page, screen, extra = {}) => page.evaluate(([s, x]) => { Object.assign(SQ.u, x); SQ.go(s); }, [screen, extra]);
  const at = (page, screen) => page.waitForFunction((s) => SQ.u.screen === s, screen);
  const text = (page) => page.evaluate(() => document.querySelector("#screen").innerText);
  const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
  const collectionsIn = (page) => page.waitForFunction(() => [...document.querySelectorAll(".dx-col")].some((c) => c.querySelector(".lx-card.ev") && c.querySelector(".lx-card.pl")), null, { timeout: 15000 });

  try {
    // ---------- a ----------
    await test("a. Every photo is in violet duotone: the SVG filter (#13101b to #c2a5f6) on posters, place photos and squad cards", async () => {
      const { ctx, page } = await phone();
      await collectionsIn(page);
      const f = await page.evaluate(() => {
        const q = (s) => document.querySelector(`#duoViolet ${s}`);
        return { r: q("feFuncR").getAttribute("tableValues"), g: q("feFuncG").getAttribute("tableValues"), b: q("feFuncB").getAttribute("tableValues"), sat: q("feColorMatrix").getAttribute("values") };
      });
      assert.deepStrictEqual(f, { r: "0.075 0.761", g: "0.063 0.647", b: "0.106 0.965", sat: "0" });
      const filters = await page.$$eval(".dx-img, .poster.has-img, .ph", (els) => els.map((e) => getComputedStyle(e).filter));
      assert(filters.length >= 3 && filters.every((x) => /url\("?#duoViolet"?\)/.test(x)), `filters: ${[...new Set(filters)].join(" | ")}`);
      assert(!(await page.evaluate(() => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /grayscale\(1\)/.test(r.cssText)); } catch { return false; } }))), "no greyscale photo rule left");
      await go(page, "squads");
      await at(page, "squads");
      assert(/duoViolet/.test(await page.$eval(".sq-card .ph", (e) => getComputedStyle(e).filter)), "squad photo cards too");
      await ctx.close();
    });

    // ---------- b ----------
    await test("b. For you: vibe collections that mix events and places, each with a match %; See all opens the whole row", async () => {
      const { ctx, page } = await phone();
      await collectionsIn(page);
      await shot(page, "discover-half");
      const cols = await page.$$eval(".dx-col", (cs) => cs.map((c) => ({ title: c.querySelector(".dx-h").textContent, sub: (c.querySelector(".dx-sub") || {}).textContent || "", ev: c.querySelectorAll(".lx-card.ev").length, pl: c.querySelectorAll(".lx-card.pl").length, rings: [...c.querySelectorAll(".mring")].map((r) => r.getAttribute("aria-label")) })));
      assert(cols.length >= 2, `${cols.length} collections`);
      assert(cols.some((c) => c.ev && c.pl), "at least one row mixes events and places");
      assert(cols.every((c) => /^\d+% match for you$/.test(c.sub)), `each has a match %: ${cols.map((c) => c.sub)}`);
      assert(cols.every((c) => c.rings.every((r) => /^\d+% match$/.test(r))), "match rings, not words");
      assert(!/Strong match|Close match/.test(await text(page)), "no Strong / Close words");
      // The server ranks them with the person's taste vibes (lib/search/foryou.js)
      const places = await page.evaluate(() => SQ.lx.state().places.map((p) => ({ id: p.id, title: p.title, type: p.type, vibes: p.vibes })));
      const r = await (await realFetch(`${base}/api/foryou`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, places }) })).json();
      assert(r.collections.length >= 2 && r.collections.some((c) => c.items.some((x) => x.kind === "event") && c.items.some((x) => x.kind === "place")), JSON.stringify(r.collections.map((c) => [c.title, c.items.map((x) => x.kind)])));
      const vibes = r.collections.map((c) => c.vibe);
      assert(vibes.every((v) => ["Live music", "Jazz", "Comedy", "Food & drink"].includes(v)), `built from the top vibes: ${vibes}`);
      assert.strictEqual(new Set(r.collections.flatMap((c) => c.items.filter((x) => x.kind === "event").map((x) => x.id))).size, r.collections.flatMap((c) => c.items.filter((x) => x.kind === "event")).length, "each event in one row only");
      // Pills: For you · Events · Places, and no Your places or location pill
      assert.deepStrictEqual(await page.$$eval(".dx-seg button", (bs) => bs.map((b) => b.textContent.trim())), ["✦ For you", "Events", "Places"]);
      assert(!(await page.$(".lx-yp-chip, .lx-loc, .lx-legend")), "the old pills are gone");
      // See all
      const title = cols[0].title;
      await page.click(".dx-col .dx-all");
      await at(page, "collection");
      assert((await text(page)).includes(title), "the collection's page");
      assert(await page.isVisible("[data-back]"), "with a way back");
      await page.click("[data-back]");
      await at(page, "discover");
      await ctx.close();
    });

    await test("b. Repeated shows collapse into one card with their dates; titles wrap to 2 lines; prices only when known", async () => {
      const { ctx, page } = await phone();
      const r = await page.evaluate(() => {
        const day = 864e5, base = Date.now() + 5 * 3600000;
        const mk = (id, t, price) => ({ id, title: "Twice Nightly Revue", startsAt: new Date(base + t * day).toISOString(), neighbourhood: "Annex", venue: { name: "Bad Dog Theatre", address: "N/A", lat: 43.665, lng: -79.41 }, price, vibes: ["Comedy"], tags: [], description: "", going: 0, friends: [], reviews: [], travel: { from: {} }, organizer: { name: "N/A" } });
        SQ.d.events.unshift(mk(992001, 0, null), mk(992002, 1, null), mk(992003, 2, null));
        SQ.d.user.feed = null;
        SQ.lx.state().tab = "events";
        SQ.render();
        const cards = [...document.querySelectorAll('.dx-grid .lx-card.ev')].filter((c) => /Twice Nightly Revue/.test(c.textContent));
        return { n: cards.length, badge: cards[0] && cards[0].querySelector(".dx-badge").textContent, text: cards[0] && cards[0].innerText, clamp: cards[0] && getComputedStyle(cards[0].querySelector(".dx-t")).webkitLineClamp };
      });
      assert.strictEqual(r.n, 1, "one card for the three nights");
      assert.match(r.badge, /^\w{3,5}, \w{3,5}, \w{3,5}( · .+)?$|^3 dates · from /, `its dates: ${r.badge}`);
      assert.strictEqual(r.clamp, "2");
      assert(!/N\/A|\$|Price/.test(r.text), `no unknown price: ${r.text}`);
      await ctx.close();
    });

    // ---------- c ----------
    await test("c. The sheet's three heights, the map controls stacked (+ over −, my location below), Search this area, and the GTA note", async () => {
      const { ctx, page } = await phone();
      const tops = {};
      for (const s of ["peek", "half", "full"]) {
        await page.evaluate((x) => SQ.lx.setStop(x), s);
        await wait(400);
        tops[s] = await page.$eval("#lx-sheet", (e) => e.getBoundingClientRect().top);
        assert.strictEqual(await page.$eval(".disc-map.lx", (e) => e.dataset.stop), s);
      }
      assert(tops.peek > tops.half && tops.half > tops.full, `heights: ${JSON.stringify(tops)}`);
      await page.evaluate(() => SQ.lx.setStop("peek"));
      await wait(400);
      await shot(page, "discover-peek");
      const box = (sel) => page.$eval(sel, (e) => e.getBoundingClientRect().toJSON());
      const zin = await box('.lx-zoom [data-zoom="in"]'), zout = await box('.lx-zoom [data-zoom="out"]'), me = await box(".lx-me");
      assert(zin.bottom <= zout.top + 1, "+ above −");
      assert(Math.abs(zin.left - zout.left) < 1 && Math.abs((zin.left + zin.right) / 2 - (me.left + me.right) / 2) < 2, "one column");
      assert(me.top >= zout.bottom, "my location below the zoom");
      assert(zin.right > 375 - 40, "on the right");
      // Pan: "Search this area"; places for the new area (one more search), events stay the GTA import
      assert(await page.$eval(".lx-area", (b) => b.hidden), "hidden before a pan");
      const before = google.length;
      await page.evaluate(() => { SQ.mapJump("discover", { lat: 43.7, lng: -79.45, zoom: 13 }); SQ.onMapMoved("discover"); });
      await page.waitForSelector(".lx-area:not([hidden])");
      await page.click(".lx-area");
      await page.waitForFunction(() => SQ.lx.state().placesState === "done");
      assert.strictEqual(google.length - before, 1, "one search for the new area");
      assert(!(await page.$(".dx-note")), "no note inside the GTA");
      await page.evaluate(() => { SQ.mapJump("discover", { lat: 45.42, lng: -75.69, zoom: 13 }); SQ.onMapMoved("discover"); });
      await page.click(".lx-area");
      await page.waitForFunction(() => SQ.lx.state().placesState === "done");
      await page.evaluate(() => SQ.lx.setStop("half"));
      await page.waitForSelector(".dx-note");
      assert.match(await page.textContent(".dx-note"), /Events come from our Toronto-area listings/);
      await page.click('.dx-seg [data-arg="events"]');
      assert.strictEqual(await page.locator(".map-pin2.ev").count(), 0, "no event pins out there");
      await ctx.close();
    });

    // ---------- d ----------
    await test("d. Squads: photo cards, no Friends section, one +; 💬 N new opens the chat; the squad's one Plan a night button", async () => {
      const { ctx, page } = await phone();
      await go(page, "squads");
      await at(page, "squads");
      await shot(page, "squads");
      const t = await text(page);
      assert(!/Friends ·|Fair blend/.test(t), "no Friends section, no Fair blend");
      assert.strictEqual(await page.locator(".tb-head .icon-btn").count(), 1, "one + in the header");
      assert(await page.$(".sq-hero .ph"), "the most active squad is the big photo card");
      assert.strictEqual(await page.locator(".sq-hero .sq-line").count(), 1, "one status line");
      assert(await page.$(".sq-faces .av.online"), "someone online glows");
      const main = await page.evaluate(() => SQ.d.user.squads[0]);
      await page.click(".sq-new-msgs");
      await at(page, "squad");
      // Scrolled to the chat: its top is in view, above the footer's button
      await page.waitForFunction(() => { const c = document.getElementById("sq-chat"); const s = document.querySelector("#screen .scroll"); if (!c || !s) return false; const r = c.getBoundingClientRect(), v = s.getBoundingClientRect(); return r.top >= v.top - 1 && r.top < v.bottom - 80 && (s.scrollTop > 0 || s.scrollHeight <= s.clientHeight + 1 || r.top < v.top + 160); });
      assert(await page.$(".sq-msg.fresh"), "the new messages are marked");
      const plan = await page.$$eval("a.tb-btn.grad", (as) => as.filter((a) => !a.closest(".nav-ghost")).map((a) => ({ href: a.getAttribute("href"), t: a.textContent.trim() }))); // not the old screen fading out
      assert.deepStrictEqual(plan, [{ href: `/sk?squad=${encodeURIComponent(main.id)}`, t: `Plan a night with ${main.name}` }], "one main button");
      assert(await page.$(".sq-page .sq-faces"), "members in the header");
      assert.strictEqual(await page.locator(".sq-next").count(), 1, "one what's-next state");
      await page.evaluate(() => document.querySelector("#screen .scroll").scrollTo(0, 0));
      await shot(page, "squad");
      await ctx.close();
    });

    await test("d. Profile: aura, stats in one row, the menu; Your Sidequesters has requests at the top, search and + Add Sidequesters", async () => {
      const { ctx, page } = await phone();
      await go(page, "profile");
      await at(page, "profile");
      await shot(page, "profile");
      assert(/conic-gradient/.test(await page.$eval(".pf-aura", (e) => getComputedStyle(e).backgroundImage)), "the taste aura");
      assert.strictEqual(await page.$$eval(".pf-stat3 > div", (xs) => new Set(xs.map((x) => Math.round(x.getBoundingClientRect().top))).size), 1, "stats in one row");
      const menu = await page.$$eval(".pf-menu .pf-mi > .grow", (xs) => xs.map((x) => x.textContent.trim()));
      for (const m of ["Your Sidequesters", "Your taste", "Night passport", "Settings"]) assert(menu.includes(m), `menu: ${m}`);
      assert.match(await page.textContent('.pf-menu [data-act="openFriends"]'), /1 request/);
      await page.click('.pf-menu [data-act="openFriends"]');
      await at(page, "friends");
      await shot(page, "sidequesters");
      const order = await page.evaluate(() => [".sqr-search", ".sqr-add", ".sqr-reqs"].map((s) => document.querySelector(s).getBoundingClientRect().top));
      assert(order[0] < order[1] && order[1] < order[2], "search, + Add Sidequesters, then requests, at the top");
      assert.match(await page.textContent(".sqr-reqs"), /Jordan Redesign/);
      assert(await page.$('.sqr-reqs button:has-text("Accept")'));
      assert.strictEqual(await page.textContent(".bar h1"), "Your Sidequesters");
      // Night passport: the badges as stamps
      await go(page, "night-passport");
      await at(page, "night-passport");
      assert((await page.locator(".np-stamp").count()) > 0, "stamps");
      await ctx.close();
    });

    // ---------- e ----------
    await test("e. Sidequests: Your events · Saved · Invites (no Requests), and the empty state shows For you picks", async () => {
      const { ctx, page } = await phone();
      await go(page, "questlog");
      await at(page, "questlog");
      await shot(page, "sidequests");
      const segs = await page.$$eval(".tb-seg button", (bs) => bs.map((b) => b.textContent.trim().replace(/\s*\d+$/, "")));
      assert.deepStrictEqual(segs, ["Your events", "Saved", "Invites"]);
      assert(!/Requests/.test(await page.textContent(".tb-seg")));
      assert(await page.$(".sq-picked .lx-card.ev"), "Picked for you when nothing's coming up");
      await page.click('.tb-seg button:has-text("Invites")');
      assert.strictEqual(await page.getAttribute('.tb-seg button:has-text("Invites")', "aria-selected"), "true");
      await ctx.close();
    });

    // ---------- f ----------
    await test("f. Labels are centred in segmented switches and the 1 to 5 rating buttons", async () => {
      const { ctx, page } = await phone();
      const offCentre = (sel) => page.$$eval(sel, (bs) => bs.filter((b) => b.offsetParent).map((b) => {
        const r = b.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(b);
        const t = range.getBoundingClientRect();
        return { label: b.textContent.trim(), off: Math.abs((t.left + t.right) / 2 - (r.left + r.right) / 2), align: getComputedStyle(b).textAlign };
      }).filter((x) => x.off > 2 || x.align !== "center"));
      assert.deepStrictEqual(await offCentre(".dx-seg button"), [], "Discover's pills");
      await go(page, "questlog");
      await at(page, "questlog");
      assert.deepStrictEqual(await offCentre(".tb-seg button"), [], "Sidequests' tabs");
      await go(page, "stats");
      await at(page, "stats");
      assert.deepStrictEqual(await offCentre(".tb-seg button"), [], "Stats' switch");
      // The rating buttons (Rate a quest)
      const id = await page.evaluate(() => SQ.d.events.find((e) => !e.over).id);
      await page.evaluate((i) => SQ.go(SQ.actions.openRate(i)), id);
      await at(page, "rate");
      const stars = await page.$$eval(".star-btn", (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); const i = b.firstElementChild.getBoundingClientRect(); return Math.abs((i.left + i.right) / 2 - (r.left + r.right) / 2); }));
      assert(stars.length >= 5 && stars.every((d) => d <= 2), `rating buttons: ${stars}`);
      await ctx.close();
    });

    // ---------- g ----------
    await test("g. Event page: no placeholder host, no N/A price, a calm description, the right category; ＋ and Tickets stay", async () => {
      const { ctx, page } = await phone();
      await page.evaluate((i) => { SQ.u.quest = i; SQ.go("quest"); }, shout.id);
      await at(page, "quest");
      await shot(page, "event");
      const t = await text(page);
      assert(!/PROMOTER NOT DEFINED/i.test(t) && !(await page.$(".qd-host")), "no host row for a placeholder");
      assert(!/\bN\/A\b/.test(t), "no N/A anywhere");
      assert(!(await page.$(".qd-price")), "no price block when the price isn't known");
      assert(/The musical comedy that celebrates your favourite holiday movies\. Holly, an overworked/.test(t), "sentence case");
      const tags = await page.$$eval(".qd-tags .tag", (ts) => ts.map((x) => x.textContent.trim()));
      assert(tags.includes("Theatre") && !tags.some((x) => /undefined/i.test(x)), `tags: ${tags}`);
      assert(await page.$(".qd-nav .tb-listbtn"), "the ＋ (add to a list) button stays");
      assert.match(await page.textContent(".qd-buy .btn"), /Get tickets on Ticketmaster/);
      assert.strictEqual(await page.$eval(".qd-title h1", (h) => getComputedStyle(h).fontWeight), "800", "big 800-weight title");
      // The import cleans the same way (sketch-1/import/normalize.js)
      const norm = require(path.join(ROOT, "..", "sketch-1", "import", "normalize"));
      const e = norm.toEvent({ source: "Ticketmaster", sourceId: "x1", url: "https://example.com", title: "Show", startsAt: soon, venue: { name: "Hall", address: "1 St", lat: 43.65, lng: -79.38, city: "Toronto" }, description: "A SHOUTED DESCRIPTION OF THIS SHOW THAT GOES ON.", categories: ["Undefined", "Theatre"], organizer: "PROMOTER NOT DEFINED" });
      assert.strictEqual(e.organizer.name, "N/A");
      assert.strictEqual(e.description, "A shouted description of this show that goes on.");
      assert(!e.tags.includes("undefined") && e.tags.includes("theatre"), e.tags.join());
      await ctx.close();
    });

    // ---------- h + i ----------
    const SCREENS = [
      ["discover", {}, "sheet"], ["collection", { dxCol: 0 }], ["quest", "event"], ["squads"], ["squad", "squad"], ["profile"], ["friends"], ["settings-home"],
      ["night-passport"], ["questlog", { sqTab: "events" }], ["questlog", { sqTab: "saved" }, "saved"], ["questlog", { sqTab: "invites" }, "invites"],
    ];
    await test("h + i. No dead ends; at 375 x 667 no sideways scroll, 44 px targets, and the sheet and tab bar never cover the main button", async () => {
      const { ctx, page } = await phone({ width: 375, height: 667 });
      await collectionsIn(page);
      const main = await page.evaluate(() => SQ.d.user.squads[0].id);
      const bad = [];
      for (const [screen, extraIn = {}, tag = ""] of SCREENS) {
        const extra = extraIn === "event" ? { quest: shout.id } : extraIn === "squad" ? { squad: main } : extraIn;
        await go(page, screen, extra);
        await at(page, screen);
        await wait(350);
        const r = await page.evaluate(() => {
          const out = { overflow: Math.max(document.documentElement.scrollWidth - innerWidth, ...[...document.querySelectorAll("#screen .scroll")].map((s) => s.scrollWidth - s.clientWidth)), small: [], back: false, covered: [] };
          const shown = (el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && Number(c.opacity) > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
          const onTop = (el) => { const r = el.getBoundingClientRect(); const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); const hit = document.elementFromPoint(x, y); return hit && (hit === el || el.contains(hit)); };
          // A way back: a back button, the tab bar, or (Discover) the sheet's grabber
          out.back = [...document.querySelectorAll("#screen [data-back], #screen nav.tabs .tab, #screen .lx-grab")].some((el) => shown(el) && onTop(el));
          for (const el of document.querySelectorAll("#screen button, #screen a, #screen input")) {
            if (!shown(el) || !onTop(el) || el.closest("nav.tabs")) continue;
            if (el.closest(".search, .sq-compose") && el.tagName === "INPUT") continue; // inputs fill their 52 px bar
            const r = el.getBoundingClientRect();
            if (r.width < 43.5 || r.height < 43.5) out.small.push(`${el.tagName}.${String(el.className).slice(0, 30)} "${(el.textContent || "").trim().slice(0, 16)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
          }
          // The main button: scrolled into view, nothing (sheet, tab bar) sits on it
          for (const el of document.querySelectorAll("#screen .tb-btn.grad, #screen .btn-primary, #screen .lx-search input, #screen .dx-seg button")) {
            if (!el.getBoundingClientRect().width) continue;
            el.scrollIntoView({ block: "nearest" });
            if (!onTop(el)) out.covered.push(el.className || el.tagName);
          }
          return out;
        });
        const name = `${screen}${tag ? `-${tag}` : ""}`;
        if (r.overflow > 0) bad.push(`${name}: ${r.overflow}px sideways scroll`);
        if (!r.back) bad.push(`${name}: a dead end (no back button, tab bar or sheet)`);
        if (r.small.length) bad.push(`${name}: small targets ${r.small.join("; ")}`);
        if (r.covered.length) bad.push(`${name}: main button covered ${r.covered.join(", ")}`);
      }
      // Discover at each height: the search, the pills and the tab bar stay clear of each other
      await go(page, "discover");
      await at(page, "discover");
      for (const s of ["peek", "half", "full"]) {
        await page.evaluate((x) => SQ.lx.setStop(x), s);
        await wait(400);
        const r = await page.evaluate(() => {
          const onTop = (el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return hit && (hit === el || el.contains(hit)); };
          const seg = document.querySelector(".dx-seg").getBoundingClientRect(), tabs = document.querySelector("nav.tabs").getBoundingClientRect();
          return { search: onTop(document.querySelector(".lx-search input")), pills: [...document.querySelectorAll(".dx-seg button")].every(onTop), clear: seg.bottom <= tabs.top - 4 };
        });
        if (!r.search || !r.pills || !r.clear) bad.push(`discover ${s}: ${JSON.stringify(r)}`);
        if (s === "full") await shot(page, "discover-full");
      }
      await ctx.close();
      assert.deepStrictEqual(bad, []);
    });

    // ---------- j ----------
    await test("j. While a call is live, the Plan tab returns to it with a green dot; an old or missing marker is a normal Plan tab", async () => {
      const { ctx, page } = await phone();
      assert.strictEqual(await page.getAttribute('nav.tabs a.tab:has-text("Plan")', "href"), "/sk");
      assert(!(await page.$("nav.tabs .live-dot")));
      await page.evaluate(() => { localStorage.setItem("sk:live", JSON.stringify({ room: "abc123", href: "/sk/abc123", at: Date.now(), crew: "Friday Crew" })); SQ.render(); });
      assert.strictEqual(await page.getAttribute('nav.tabs a.tab:has-text("Plan")', "href"), "/sk/abc123");
      assert(await page.isVisible("nav.tabs .tab.live .live-dot"), "a green dot");
      assert.strictEqual(await page.$eval("nav.tabs .live-dot", (d) => getComputedStyle(d).backgroundColor), "rgb(108, 196, 138)");
      assert.match(await page.getAttribute("nav.tabs a.tab.live", "aria-label"), /back to your live call/);
      await page.evaluate(() => { localStorage.setItem("sk:live", JSON.stringify({ room: "abc123", at: Date.now() - 5 * 3600000 })); SQ.render(); });
      assert.strictEqual(await page.getAttribute('nav.tabs a.tab:has-text("Plan")', "href"), "/sk", "an old marker counts as ended");
      await page.evaluate(() => { localStorage.setItem("sk:live", "javascript:alert(1)"); SQ.render(); });
      assert.strictEqual(await page.getAttribute('nav.tabs a.tab:has-text("Plan")', "href"), "/sk/javascriptalert1", "only ever a /sk link");
      await page.evaluate(() => { localStorage.removeItem("sk:live"); SQ.render(); });
      assert.strictEqual(await page.getAttribute('nav.tabs a.tab:has-text("Plan")', "href"), "/sk");
      // The page shell takes a top offset (the On call bar pushes screens down instead of covering them)
      await page.evaluate(() => document.documentElement.style.setProperty("--sq-top", "64px"));
      assert.strictEqual(await page.$eval("#screen > .screen", (s) => Math.round(s.getBoundingClientRect().top)), 64);
      await ctx.close();
    });
  } finally {
    await browser.close().catch(() => {});
    restore();
  }
  console.log(failures ? `\n${failures} failed` : "\nAll redesign checks passed");
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.log(`FAIL  ${err.stack || err.message}`); restore(); process.exit(1); });
