// "Starting from: my location", and event picks that look different from place picks.
//
//  1. A { lat, lng } origin is rounded to 2 decimals (about 1 km) on arrival, kept only in that
//     person's private answers, and never appears in any view, broadcast, analytics event, log, AI
//     prompt or the end-of-call summary (we search the serialized output for the digits).
//  2. The board says "near <neighbourhood>" (and "near you" on your own phone), travel uses the
//     nearest station, and the Google search circle centres on the rounded point.
//  3. "I'm at home" means your shared location; without one, Sidekick asks the usual card.
//  4. In the browser (Playwright): allowed, blocked, denied-at-the-prompt and no-geolocation paths,
//     and a mixed pick set renders an event card ("See tickets") and a place card ("Directions" and
//     the Google Maps attribution). Screenshots at 375 px go to SK_SHOTS (or a temp folder).
//
// The app runs in this process (so Google Places can be faked and nothing is spent).
//
//   node test/sidekick-location.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const http = require("http");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-loc-"));
const SHOTS = process.env.SK_SHOTS || path.join(tmp, "shots");
fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${err.stack || err.message}`); }
}
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Raw points (as a phone would read them) and what they round to
const ASIA_AT = { lat: 43.66432, lng: -79.41871 }; // Koreatown -> 43.66, -79.42 -> Union
const MAYA_AT = { lat: 43.77123, lng: -79.41377 }; // North York Centre -> 43.77, -79.41 -> Finch
const DIGITS = ["43.66", "79.42", "43.77", "79.41", "66432", "41871", "77123", "41377"];
const leaks = (label, text) => DIGITS.filter((d) => String(text).includes(d)).map((d) => `${label} contains ${d}`);

(async () => {
  const port = await freePort();
  Object.assign(process.env, {
    PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "",
    GOOGLE_MAPS_API_KEY: "test-key", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off",
  });
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SECRET_KEY = "";
  delete process.env.SIDEKICK_PLACES_OFF;

  // ---------- fakes and taps, before the app loads ----------
  const google = [];
  const realFetch = global.fetch;
  const evenings = { periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 16 }, close: { day: (d + 1) % 7, hour: 1 } })) };
  const fakePlace = (n, lat, lng, types, level) => ({ id: `loc_place_${n}`, displayName: { text: `Drop-in Spot ${n}` }, formattedAddress: `${n} Bloor St W, Toronto`, location: { latitude: lat, longitude: lng }, types, primaryType: types[0], priceLevel: level, rating: 4.6, userRatingCount: 210, googleMapsUri: `https://maps.google.com/?cid=${n}`, regularOpeningHours: evenings });
  global.fetch = async (url, opts = {}) => {
    if (String(url).startsWith("https://places.googleapis.com/")) {
      google.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ places: [fakePlace(1, 43.6645, -79.4175, ["bar"], "PRICE_LEVEL_INEXPENSIVE"), fakePlace(2, 43.6655, -79.412, ["karaoke", "bar"], "PRICE_LEVEL_MODERATE")] }) };
    }
    return realFetch(url, opts);
  };
  const analytics = require(path.join(ROOT, "lib", "analytics"));
  const tracked = [];
  const origTrack = analytics.track;
  analytics.track = (name, props) => { tracked.push(JSON.stringify([name, props])); return origTrack(name, props); };
  // Sidekick's AI, faked: we keep every prompt it would send; it never answers, so the line book speaks
  const claude = require(path.join(ROOT, "lib", "sidekick", "claude"));
  const prompts = [];
  claude.available = () => true;
  claude.say = async (system, user) => { prompts.push(system + "\n" + user); return ""; };
  claude.tool = async (system, user) => { prompts.push(system + "\n" + user); throw new Error("fake AI: read with keywords"); };
  const logs = [];
  for (const k of ["log", "error", "warn", "info"]) {
    const orig = console[k].bind(console);
    console[k] = (...args) => { logs.push(args.map(String).join(" ")); if (!/fake AI/.test(String(args[0]))) orig(...args); };
  }
  const say = (...a) => process.stdout.write(a.join(" ") + "\n"); // test output, not a server log

  require(path.join(ROOT, "server.js"));
  const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
  const T = R._test;
  const P = require(path.join(ROOT, "lib", "sidekick", "plan"));
  const places = require(path.join(ROOT, "lib", "sidekick", "places"));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 120; i++) { try { if ((await realFetch(`${base}/api/sk/nights`)).ok) break; } catch {} await wait(250); }
  const post = (p, body) => realFetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const nights = (await (await realFetch(`${base}/api/sk/nights`)).json()).nights;
  const sat = nights.find((n) => /^Sat/.test(n.label) && n.events > 0) || nights.find((n) => n.events > 0);
  // Live streams: everything broadcast to each phone
  const broadcasts = [];
  const streams = [];
  const listen = (room, pid) => new Promise((resolve) => {
    const req = http.get(`${base}/api/sk/rooms/${room}/stream?p=${encodeURIComponent(pid)}`, (res) => { res.on("data", (c) => broadcasts.push(c.toString())); resolve(); });
    streams.push(req);
  });

  let browser;
  try {
    // ---------- 1. A crew over the API: two shared locations and one station ----------
    const { body: made } = await post("/api/sk/rooms", { name: "Asia", crew: "Loc test", nights: [sat.date] });
    const rid = made.room;
    const asia = made.person;
    await listen(rid, asia);
    await post(`/api/sk/rooms/${rid}/answer`, { p: asia, slot: "origin", value: ASIA_AT, source: "start" });
    const { body: m } = await post(`/api/sk/rooms/${rid}/join`, { name: "Maya", mode: "text", answers: { origin: MAYA_AT, budget: "50" } });
    const maya = m.person;
    await listen(rid, maya);
    const { body: j } = await post(`/api/sk/rooms/${rid}/join`, { name: "Jay", mode: "text", answers: { origin: "kipling", budget: "50" } });
    const jay = j.person;
    await listen(rid, jay);
    const room = T.rooms.get(rid);

    await test("A { lat, lng } origin is rounded to 2 decimals on arrival, and snapped to the nearest station", async () => {
      const a = room.answers[asia], b = room.answers[maya];
      assert.deepStrictEqual([a.location.lat, a.location.lng], [43.66, -79.42]);
      assert.deepStrictEqual([b.location.lat, b.location.lng], [43.77, -79.41]);
      assert.deepStrictEqual([a.origin.value, a.origin.here], ["union", true]);
      assert.deepStrictEqual([b.origin.value, b.origin.here], ["finch", true]);
      assert.strictEqual(room.answers[jay].origin.value, "kipling");
      assert(!room.answers[jay].location, "no location for someone who picked a station");
      assert.strictEqual((await post(`/api/sk/rooms/${rid}/answer`, { p: jay, slot: "origin", value: "here" })).status, 400, "'here' needs a shared location");
      assert.strictEqual((await post(`/api/sk/rooms/${rid}/answer`, { p: jay, slot: "origin", value: { lat: "x", lng: 2 } })).status, 400, "junk coordinates are refused");
    });

    await test("The board shows 'near <neighbourhood>' to the crew and 'near you' only on your own phone", async () => {
      const row = (pid) => T.viewFor(room, pid).rows.find((r) => r.slot === "origin").value;
      assert.strictEqual(row(asia), "near you, near North York Centre, Kipling");
      assert.strictEqual(row(maya), "near Koreatown, near you, Kipling");
      assert.strictEqual(row(jay), "near Koreatown, near North York Centre, Kipling");
      assert.strictEqual(T.viewFor(room, asia).me.sharedLocation, true);
      assert.strictEqual(T.viewFor(room, jay).me.sharedLocation, false);
      // On the "Starting from" card: "My location" only for people who shared, and no initials on station chips for them
      const was = { card: room.card, mode: room.mode };
      room.mode = "lead";
      room.card = { slot: "origin", at: Date.now() };
      const mine = T.viewFor(room, asia).card.options;
      assert.deepStrictEqual(mine[0], { value: "here", label: "My location", voters: ["A"], mine: true });
      assert(mine.slice(1).every((o) => !o.voters.includes("A") && !o.voters.includes("M")), "a location-sharer's initial is never on a station");
      const jays = T.viewFor(room, jay).card.options;
      assert(!jays.some((o) => o.value === "here"));
      assert.deepStrictEqual(jays.find((o) => o.value === "kipling").voters, ["J"]);
      Object.assign(room, was);
    });

    await test("Travel uses the nearest station: the same events fit as if they'd tapped Union and Finch", async () => {
      const events = R._test.rooms && [...require(path.join(ROOT, "lib", "db")).data.events];
      const f = P.facts(room);
      assert.deepStrictEqual([...f.origin.value].sort(), ["finch", "kipling", "union"]);
      const { room: tid } = T.createRoom({ crew: "Twin", planner: "Asia", nights: [sat.date] });
      const twin = T.rooms.get(tid);
      const tm = T.addPerson(twin, { name: "Maya", mode: "text" });
      const tj = T.addPerson(twin, { name: "Jay", mode: "text" });
      T.setAnswer(twin, twin.people[0], "origin", "union", "call_card");
      T.setAnswer(twin, tm, "origin", "finch", "call_card");
      T.setAnswer(twin, tj, "origin", "kipling", "call_card");
      for (const p of [tm, tj]) T.setAnswer(twin, p, "budget", "50", "call_card"); // the same answers apart from where they start
      const ids = (r) => P.filterEvents(events, r, P.facts(r)).map((e) => e.id).sort((a, b) => a - b);
      assert.deepStrictEqual(ids(room), ids(twin));
      const fit = P.filterEvents(events, room, f);
      assert(fit.every((e) => !(e.travel && e.travel.from && e.travel.from.finch) || e.travel.from.finch.minutes <= 60), "nothing more than an hour from Finch");
      T.endRoom(twin, "test");
    });

    await test("nearCrew centres on the rounded coordinates, and the call's Google search does too", async () => {
      const one = places.nearCrew([{ lat: 43.66, lng: -79.42 }]);
      assert.deepStrictEqual(one.center, { latitude: 43.66, longitude: -79.42 });
      assert.strictEqual(one.radius, 5000);
      assert.deepStrictEqual(places.nearCrew([{ lat: 43.66, lng: -79.42 }, { lat: 43.66, lng: -79.42 }]).center, one.center, "the same point twice counts once");
      // The call: night is known (one night), vibe answered: places load, near the three of them
      for (let i = 0; i < 50 && room.mode !== "voting"; i++) await wait(100); // the check-in vote has started
      for (const pid of [asia, maya, jay]) {
        await post(`/api/sk/rooms/${rid}/answer`, { p: pid, slot: "mode", value: "lead" });
        await post(`/api/sk/rooms/${rid}/answer`, { p: pid, slot: "vibe", value: ["games", "music"] });
        await post(`/api/sk/rooms/${rid}/answer`, { p: pid, slot: "time", value: ["evening", "late"] });
      }
      await post(`/api/sk/rooms/${rid}/answer`, { p: asia, slot: "budget", value: "50" });
      for (let i = 0; i < 40 && !google.length; i++) await wait(100);
      assert(google.length, `a Google search ran (mode ${room.mode}, tried ${room.placesTried}, asked ${room.asked}, vibe ${JSON.stringify(P.facts(room).vibe.value)})`);
      const c = google[0].locationBias.circle.center;
      assert(Math.abs(c.latitude - (43.66 + 43.77 + 43.6372) / 3) < 1e-6, `centre latitude ${c.latitude}`);
      assert(Math.abs(c.longitude - (-79.42 - 79.41 - 79.5361) / 3) < 1e-6, `centre longitude ${c.longitude}`);
    });

    await test("Mixed picks: an event with a day, start time and ticket price; a place you drop into; said out loud", async () => {
      for (const pid of [asia, maya, jay]) await post(`/api/sk/rooms/${rid}/answer`, { p: pid, slot: "kind", value: "either" });
      for (let i = 0; i < 30 && room.thinking; i++) await wait(100);
      if (!room.picks) await post(`/api/sk/rooms/${rid}/ask`, { p: asia });
      assert(room.picks && room.picks.length === 2, "two picks");
      assert.deepStrictEqual(room.picks.map((p) => p.kind).sort(), ["event", "place"]);
      const ev = room.picks.find((p) => p.kind === "event"), pl = room.picks.find((p) => p.kind === "place");
      assert.match(ev.when, /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) · starts \d{1,2}(:\d\d)? (AM|PM)$/);
      assert.match(ev.price, /^(\$\d+ ticket|Free|Price not listed)$/);
      assert.match(pl.when, / · drop in any time$/);
      assert.match(pl.price, /about \$\d+ each|Free|Price not listed|\$/);
      assert.strictEqual(pl.attribution, "Google Maps");
      const line = room.said.filter((s) => s.move === "picks").pop().text;
      assert(/show/.test(line) && /drop into/.test(line), `the picks line names both kinds: ${line}`);
    });

    await test("'I'm at home' means your shared location; without one, Sidekick asks the usual card", async () => {
      const { room: kid } = T.createRoom({ crew: "Keywords", planner: "Asia", nights: [sat.date] });
      const k = T.rooms.get(kid);
      const kj = T.addPerson(k, { name: "Jay", mode: "voice" });
      k.mode = "lead";
      T.setAnswer(k, k.people[0], "origin", { lat: 43.6643, lng: -79.4187 }, "start");
      T.setAnswer(k, k.people[0], "origin", "finch", "call_card"); // changed her mind on a card
      T.addLine(k, k.people[0], "I'm leaving from home tonight", "spoken");
      await T.think(k);
      assert.deepStrictEqual([k.answers[k.people[0].id].origin.value, k.answers[k.people[0].id].origin.here], ["union", true]);
      k.lastSaidAt = 0;
      k.card = { slot: "vibe", at: Date.now() };
      T.addLine(k, kj, "wherever, from where I am", "spoken");
      await T.think(k);
      assert(!k.answers[kj.id].origin, "nothing shared, so nothing set");
      assert.strictEqual(k.card && k.card.slot, "origin", "the Starting from card is asked");
      T.endRoom(k, "test");
    });

    // ---------- 2. In the browser ----------
    let chromium;
    try { ({ chromium } = require("playwright")); } catch { chromium = null; }
    if (!chromium) throw new Error("Playwright isn't installed, so the browser checks can't run");
    browser = await chromium.launch();
    const pageErrors = [];
    const phone = async (opts = {}, init) => {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, ...opts });
      if (init) await ctx.addInitScript(init);
      const page = await ctx.newPage();
      page.on("pageerror", (e) => pageErrors.push(e.message));
      return { ctx, page };
    };
    const start = async (page, name) => {
      await page.goto(`${base}/sk?quick=1`); // the one-page start screen (the Plan tab's steps are in plan-flow.e2e.js)
      await page.waitForSelector("#go");
      await page.fill("#name", name);
      await page.fill("#crew", "Loc UI");
      if (!(await page.$('.chips[data-name="nights"] .chip[aria-pressed=true]'))) await page.click('.chips[data-name="nights"] .chip');
    };
    const pressed = (page) => page.$$eval('.chips[data-name="origin"] .chip[aria-pressed=true]', (els) => els.map((e) => e.dataset.value));
    const note = (page) => page.textContent("#originNote");
    const roomOf = (page) => T.rooms.get(new URL(page.url()).pathname.split("/")[2]);
    const WHY = "Sidekick uses it to find spots near you. Your friends only see your neighbourhood.";

    let ui = null;
    await test("Allowed: 'Use my location' is preselected, asked only on Start, rounded, and the board says 'near you'", async () => {
      const { ctx, page } = await phone({ permissions: [], geolocation: { latitude: ASIA_AT.lat, longitude: ASIA_AT.lng } });
      await ctx.addInitScript(() => {
        window.__geoAsks = 0;
        const g = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
        navigator.geolocation.getCurrentPosition = (...a) => { window.__geoAsks++; return g(...a); };
      });
      await ctx.grantPermissions(["geolocation"]);
      await ctx.setGeolocation({ latitude: ASIA_AT.lat, longitude: ASIA_AT.lng });
      await start(page, "Asia");
      assert.deepStrictEqual(await pressed(page), ["here"]);
      assert.strictEqual((await note(page)).trim(), WHY);
      assert.strictEqual(await page.evaluate(() => window.__geoAsks), 0, "never asked on page load");
      await page.screenshot({ path: path.join(SHOTS, "1-start-use-my-location.png"), fullPage: true });
      await page.click("#go");
      await page.waitForURL(/\/sk\/[\w-]+$/);
      assert.strictEqual(await page.evaluate(() => window.__geoAsks), 1);
      const r = roomOf(page);
      for (let i = 0; i < 30 && !(r.answers[r.people[0].id] || {}).origin; i++) await wait(100);
      const a = r.answers[r.people[0].id];
      assert.deepStrictEqual([a.location.lat, a.location.lng, a.origin.value, a.origin.near], [43.66, -79.42, "union", "near Koreatown"]);
      // The board's "Starting from" row, in the full plan (folded by default; the People sheet opens first for a planner alone)
      await page.waitForSelector("#planToggle");
      if (await page.$("#sheet")) await page.keyboard.press("Escape");
      if ((await page.getAttribute("#planToggle", "aria-expanded")) !== "true") await page.click("#planToggle");
      await page.waitForSelector("text=near you");
      ui = { ctx, page, room: r };
    });

    await test("A friend joins with their location: the planner's board shows 'near North York Centre'", async () => {
      const { ctx, page } = await phone({ permissions: ["geolocation"], geolocation: { latitude: MAYA_AT.lat, longitude: MAYA_AT.lng } });
      await page.goto(ui.page.url());
      await page.waitForSelector("[data-mode=text]");
      assert.deepStrictEqual(await pressed(page), ["here"]);
      await page.fill("#name", "Maya");
      await page.click("[data-mode=text]");
      await page.waitForSelector("#dock");
      await ui.page.waitForSelector("text=near North York Centre");
      await page.waitForSelector("#planToggle");
      if ((await page.getAttribute("#planToggle", "aria-expanded")) !== "true") await page.click("#planToggle");
      await page.waitForSelector("text=near Koreatown");
      ui.friend = { ctx, page };
    });

    await test("The permission explainer shows before and while the browser asks", async () => {
      // A browser that's showing its prompt: the request never answers while we look
      const { ctx, page } = await phone({}, () => {
        navigator.permissions.query = () => Promise.resolve({ state: "prompt" });
        navigator.geolocation.getCurrentPosition = () => {};
      });
      await start(page, "Asia");
      await page.click("#go");
      await page.waitForSelector("#go:disabled");
      assert.strictEqual((await page.textContent("#go")).trim(), "Finding your neighbourhood…");
      assert.strictEqual((await note(page)).trim(), WHY);
      await page.screenshot({ path: path.join(SHOTS, "2-permission-explainer.png"), fullPage: true });
      await ctx.close();
    });

    await test("Denied at the prompt: Union is selected with a short note and no error; the next tap starts", async () => {
      const { ctx, page } = await phone({}, () => {
        navigator.permissions.query = () => Promise.resolve({ state: "prompt" });
        navigator.geolocation.getCurrentPosition = (ok, fail) => setTimeout(() => fail({ code: 1, message: "User denied Geolocation" }), 700); // a person tapping "Don't allow"
      });
      await start(page, "Asia");
      await page.click("#go");
      await page.waitForSelector("#originNote.fallback");
      assert.deepStrictEqual(await pressed(page), ["union"]);
      assert.match(await note(page), /starting from Union/);
      assert(!(await page.evaluate(() => document.getElementById("toast").classList.contains("show"))), "no error toast");
      assert(/\/sk\/?(\?quick=1)?$/.test(page.url()), "still on the start screen to check it");
      await page.screenshot({ path: path.join(SHOTS, "3b-denied-at-prompt.png"), fullPage: true });
      await page.click("#go");
      await page.waitForURL(/\/sk\/[\w-]+$/);
      const r = roomOf(page);
      for (let i = 0; i < 30 && !(r.answers[r.people[0].id] || {}).origin; i++) await wait(100);
      const a = r.answers[r.people[0].id];
      assert.deepStrictEqual([a.origin.value, Boolean(a.origin.here), Boolean(a.location)], ["union", false, false]);
      await ctx.close();
    });

    await test("Refused instantly by the browser (no prompt shown): Start carries on from Union", async () => {
      const { ctx, page } = await phone(); // Playwright's default: the state reads "prompt", then it's refused at once
      await start(page, "Asia");
      await page.click("#go");
      await page.waitForURL(/\/sk\/[\w-]+$/);
      const r = roomOf(page);
      for (let i = 0; i < 30 && !(r.answers[r.people[0].id] || {}).origin; i++) await wait(100);
      assert.strictEqual(r.answers[r.people[0].id].origin.value, "union");
      await ctx.close();
    });

    await test("Location blocked for the site (no permission): Union from the start, with a note, and Start just works", async () => {
      const { ctx, page } = await phone({ permissions: [] });
      await start(page, "Asia");
      await page.waitForSelector("#originNote.fallback");
      assert.deepStrictEqual(await pressed(page), ["union"]);
      assert.match(await note(page), /starting from Union/);
      await page.screenshot({ path: path.join(SHOTS, "3-denied-fallback.png"), fullPage: true });
      await page.click("#go");
      await page.waitForURL(/\/sk\/[\w-]+$/);
      const r = roomOf(page);
      for (let i = 0; i < 30 && !(r.answers[r.people[0].id] || {}).origin; i++) await wait(100);
      assert.strictEqual(r.answers[r.people[0].id].origin.value, "union");
      assert(!r.answers[r.people[0].id].location);
      await ctx.close();
    });

    await test("No geolocation in the browser: no 'Use my location' chip, Union is picked with a note", async () => {
      const { ctx, page } = await phone({}, () => { delete Navigator.prototype.geolocation; });
      await start(page, "Asia");
      assert(!(await page.$('.chips[data-name="origin"] .chip[data-value="here"]')));
      assert.deepStrictEqual(await pressed(page), ["union"]);
      assert.match(await note(page), /isn't available here, so you're starting from Union/);
      await page.click("#go");
      await page.waitForURL(/\/sk\/[\w-]+$/);
      await ctx.close();
    });

    await test("A mixed pick set renders an event card with 'See tickets' and a place card with 'Directions' and the attribution", async () => {
      const r = ui.room;
      const ids = await Promise.all([ui.page, ui.friend.page].map((p) => p.evaluate(() => JSON.parse(localStorage.getItem(`sk:${location.pathname.split("/")[2]}`)).person)));
      for (let i = 0; i < 50 && r.mode !== "voting" && r.mode !== "lead"; i++) await wait(100);
      for (const pid of ids) {
        await post(`/api/sk/rooms/${r.id}/answer`, { p: pid, slot: "mode", value: "lead" });
        const night = r.nights.includes(sat.date) ? sat.date : r.nights[0];
        for (const [slot, value] of [["night", [night]], ["vibe", ["games", "music"]], ["time", ["evening", "late"]], ["kind", "either"], ["budget", "50"]]) await post(`/api/sk/rooms/${r.id}/answer`, { p: pid, slot, value });
      }
      for (let i = 0; i < 30 && r.thinking; i++) await wait(100);
      if (!r.picks) await post(`/api/sk/rooms/${r.id}/ask`, { p: ids[0] });
      assert(r.picks && r.picks.length === 2, `two picks (mode ${r.mode}, places ${r.places.length}, nights ${r.nights})`);
      assert.deepStrictEqual(r.picks.map((p) => p.kind).sort(), ["event", "place"]);
      const page = ui.page;
      await page.waitForSelector(".pick-card.ev");
      await page.waitForSelector(".pick-card.pl");
      assert.match(await page.textContent("#say .cap-t"), /Two good ones\. Tap the one you want\.|closest/);
      const evCard = page.locator(".pick-card.ev");
      const plCard = page.locator(".pick-card.pl");
      assert.strictEqual((await evCard.locator(".tag").textContent()).trim(), "Event");
      assert.strictEqual(await evCard.locator(".tag svg").count(), 1, "ticket icon");
      assert.match(await evCard.locator(".pk-when").textContent(), / · starts /);
      const evPick = r.picks.find((p) => p.kind === "event");
      if (evPick.url) {
        assert.match(await evCard.locator("a.pk-link").textContent(), /^See tickets/);
        assert.strictEqual(await evCard.locator("a.pk-link").getAttribute("href"), evPick.url);
      } else assert.strictEqual(await evCard.locator("a.pk-link").count(), 0, "no link when the listing has none");
      assert.strictEqual((await plCard.locator(".tag").textContent()).trim(), "Place");
      assert.match(await plCard.locator(".pk-when").textContent(), /drop in any time/);
      assert.match(await plCard.locator("a.pk-link").textContent(), /^Directions/);
      assert.match(await plCard.locator("a.pk-link").getAttribute("href"), /^https:\/\/maps\.google\.com\//);
      assert.match(await plCard.textContent(), /Place info from Google Maps/);
      assert(!/Rated|crew match/.test(await plCard.textContent()), "four plain facts, no ratings or scores");
      // 44 px targets, nothing under the dock, text no smaller than 12 px, at most 3 weights
      for (const box of [await evCard.locator("a.pk-link").boundingBox(), await plCard.locator("a.pk-link").boundingBox()].filter(Boolean)) assert(box.height >= 44, `link is ${box.height}px tall`);
      const check = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        const dock = document.getElementById("dock").getBoundingClientRect();
        const last = document.getElementById("body").getBoundingClientRect();
        const texts = [...document.querySelectorAll(".pick-card *")].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
        const sizes = texts.map((el) => parseFloat(getComputedStyle(el).fontSize));
        const weights = [...new Set(texts.map((el) => getComputedStyle(el).fontWeight))];
        const wide = document.documentElement.scrollWidth <= window.innerWidth;
        return { under: last.bottom > dock.top + 1, min: Math.min(...sizes), weights, wide };
      });
      assert(!check.under, "the last block sits above the dock");
      assert(check.min >= 12, `smallest text ${check.min}px`);
      assert(check.weights.every((w) => ["400", "500", "600"].includes(w)), `weights ${check.weights}`);
      assert(check.wide, "no sideways scroll at 375px");
      // Phone-sized shots (a full-page shot would draw the fixed dock over the middle)
      await page.evaluate(() => { const q = document.querySelector(".picks"); window.scrollTo(0, q.getBoundingClientRect().top + window.scrollY - 12); });
      await page.screenshot({ path: path.join(SHOTS, "4a-mixed-picks-event.png") });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.screenshot({ path: path.join(SHOTS, "4b-mixed-picks-place.png") });
      say(`      event pick: ${evPick.title} | ${evPick.when} | ${evPick.price} | link: ${evPick.url ? "See tickets" : "none (listing has no link)"}`);
      // Voting still works by tapping the card
      await page.locator(".pick").first().click();
      await page.waitForSelector('.pick[aria-pressed="true"]');
    });

    await test("No page errors in the browser", async () => {
      assert.deepStrictEqual(pageErrors, []);
    });

    // ---------- 3. Privacy sweep and the end of the call ----------
    await test("Coordinates never reach a view, broadcast, analytics event, log or AI prompt", async () => {
      const found = [];
      for (const r of [room, ui && ui.room].filter(Boolean)) for (const p of r.people) found.push(...leaks(`view for ${p.name}`, JSON.stringify(T.viewFor(r, p.id))));
      found.push(...leaks("broadcasts", broadcasts.join("")));
      found.push(...leaks("analytics", tracked.join("\n")));
      found.push(...leaks("logs", logs.join("\n")));
      found.push(...leaks("AI prompts", prompts.join("\n")));
      assert(broadcasts.length > 3 && tracked.length > 3 && prompts.length > 0, "the sweep saw real traffic");
      assert(/near Koreatown/.test(prompts.join("\n")) || /near Koreatown/.test(broadcasts.join("")), "the neighbourhood is what travels");
      assert.deepStrictEqual(found, []);
    });

    await test("Ending the call deletes the location; the saved summary has no coordinates", async () => {
      const summaries = path.join(ROOT, "data", "sidekick-summaries.jsonl");
      await post(`/api/sk/rooms/${rid}/end`, { p: asia });
      assert(Object.values(room.answers).every((a) => !a.location), "locations deleted with the transcript");
      const line = fs.readFileSync(summaries, "utf8").split("\n").find((l) => l.includes(`"room":"${rid}"`));
      assert(line, "a summary was saved");
      assert.deepStrictEqual(leaks("summary", line), []);
      assert.deepStrictEqual(leaks("analytics", tracked.join("\n")), []);
      if (ui) {
        const pid = ui.room.people[0].id;
        await post(`/api/sk/rooms/${ui.room.id}/end`, { p: pid });
        const l2 = fs.readFileSync(summaries, "utf8").split("\n").find((l) => l.includes(`"room":"${ui.room.id}"`));
        assert.deepStrictEqual(leaks("summary", l2), []);
        assert(Object.values(ui.room.answers).every((a) => !a.location));
      }
    });
  } catch (err) {
    failures++;
    say(`FAIL  ${err.stack || err.message}`);
  } finally {
    for (const s of streams) s.destroy();
    if (browser) await browser.close();
  }
  say(`\nScreenshots: ${SHOTS}`);
  say(failures ? `\n${failures} failed` : "\nAll passed");
  process.exit(failures ? 1 : 0);
})();
