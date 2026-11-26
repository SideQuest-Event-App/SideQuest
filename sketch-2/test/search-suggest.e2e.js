// Search suggestions while typing (like Eventbrite's), in a real browser against the real server:
//  a. typing a venue's first letters shows "Search for …", that venue under Venues (with its upcoming count) and
//     events under Events; one letter shows nothing;
//  b. tapping the venue lists everything coming up there, soonest first, and only there;
//  c. tapping an event suggestion opens that event;
//  d. "Search for …" (and Enter) still runs the normal keyword search, and leaves the venue view;
//  e. Escape closes the suggestions; at 375 px the box fits on screen;
//  f. a host shows under Hosts; tapping it lists only their upcoming events, and an event page's host name does the same.
//
// Events come from events/data/events.json (no Supabase keys here), so the venue is picked from it: one with two or
// more upcoming events. The database file is copied first and put back afterwards. AI is off.
//
//   NODE_PATH=/opt/node-tools/node_modules node test/search-suggest.e2e.js
//   SUGGEST_SHOTS=/some/folder ... to keep a 375 px screenshot of the open suggestions

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suggest-"));
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
    SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off", SIDEKICK_PLACES_OFF: "1",
    SIDEKICK_STUDY_FILE: path.join(tmp, "sidekick-study.json"),
  });
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_SECRET_KEY = "";
  delete process.env.GOOGLE_MAPS_API_KEY;

  require(path.join(ROOT, "server.js"));
  // Never the real database: stop here if the keys came back from .env
  if (process.env.SUPABASE_URL || process.env.SUPABASE_SECRET_KEY) { console.log("FAIL  Supabase keys are set: refusing to run against the real database"); restore(); process.exit(1); }
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 160; i++) { try { if ((await fetch(`${base}/api/state`)).ok) break; } catch {} await wait(250); }
  const act = async (type, args, user) => {
    const r = await fetch(`${base}/api/act`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, type, args }) });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    return body.result;
  };
  const stamp = Date.now().toString(36);
  const { userId } = await act("signup", { name: "Suggest Test", email: `suggest-${stamp}@example.com`, username: `suggest_${stamp}` });
  await act("setProfile", { vibes: ["Live music", "Comedy"], origin: "union", registered: true }, userId);

  let chromium;
  try { ({ chromium } = require("playwright")); } catch { chromium = null; }
  if (!chromium) { console.log("FAIL  Playwright isn't installed (try NODE_PATH=/opt/node-tools/node_modules)"); restore(); process.exit(1); }
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}); // PW_CHANNEL=chrome uses the installed Chrome
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  await ctx.addInitScript((uid) => {
    try {
      if (sessionStorage.getItem("__seeded")) return;
      sessionStorage.setItem("__seeded", "1");
      localStorage.setItem("sq2.user", uid);
      sessionStorage.setItem("sq2.mode", "demo");
    } catch {}
  }, userId);
  await ctx.route("**/*", (r) => (new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort()));
  const page = await ctx.newPage();

  try {
    await page.goto(`${base}/#search`);
    await page.waitForFunction(() => window.SQ && SQ.d && (SQ.d.events || []).length > 0 && document.querySelector('form.search input[data-bind="search.q"]'), null, { timeout: 20000 });
    // A venue with 2+ upcoming events, by the app's own idea of "upcoming"
    const venue = await page.evaluate(() => {
      const counts = new Map();
      for (const e of SQ.d.events) {
        const n = e.venue && e.venue.name;
        if (!n || /^(location tba|tba|online)/i.test(n) || !/^[A-Za-z]{4}/.test(n)) continue;
        if (SQ.venueEvents(n).length >= 2) counts.set(n, SQ.venueEvents(n).length);
      }
      const [name, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [];
      return name ? { name, n } : null;
    });
    assert(venue, "the seed has a venue with two or more upcoming events");
    const typed = venue.name.replace(/^the /i, "").slice(0, 5).trim();
    const input = 'form.search input[data-bind="search.q"]';

    await test("a. Typing shows Search for, the venue under Venues with its count, and events; one letter shows nothing", async () => {
      await page.click(input);
      await page.fill(input, typed[0]);
      await wait(100);
      assert.strictEqual(await page.locator(".sg-list").count(), 0, "no box for one letter");
      await page.fill(input, typed);
      await page.waitForSelector(".sg-list");
      const text = await page.locator(".sg-list").innerText();
      assert(text.includes(`Search for “${typed}”`), text);
      assert(text.includes("Venues"), text);
      const row = page.locator(`.sg-row[data-act="searchVenue"][data-arg="${venue.name.replace(/"/g, '\\"')}"]`);
      assert.strictEqual(await row.count(), 1, `${venue.name} is suggested`);
      assert((await row.innerText()).includes(`${venue.n} upcoming`), await row.innerText());
    });

    await test("b. Tapping the venue lists only what's coming up there, soonest first", async () => {
      await page.click(`.sg-row[data-act="searchVenue"][data-arg="${venue.name.replace(/"/g, '\\"')}"]`);
      await page.waitForSelector(".search-status");
      assert((await page.locator(".search-status").innerText()).includes(`${venue.n} upcoming at ${venue.name}`));
      const ids = await page.$$eval(".search-list .quest-row", (b) => b.map((x) => Number(x.dataset.arg)));
      assert.strictEqual(ids.length, venue.n);
      const ok = await page.evaluate(([ids, name]) => {
        const es = ids.map((id) => SQ.d.events.find((e) => e.id === id));
        return es.every((e) => e.venue.name === name) && es.every((e, i) => !i || String(es[i - 1].startsAt) <= String(e.startsAt));
      }, [ids, venue.name]);
      assert(ok, "all at that venue, in date order");
      assert.strictEqual(await page.locator(".sg-list").count(), 0, "the box closed");
    });

    await test("c. Tapping an event suggestion opens that event", async () => {
      const title = await page.evaluate((n) => SQ.venueEvents(n)[0].title, venue.name);
      await page.click(input);
      await page.fill(input, title.slice(0, 12));
      await page.waitForSelector('.sg-row[data-act="openQuest"]');
      const id = await page.locator('.sg-row[data-act="openQuest"]').first().getAttribute("data-arg");
      await page.locator('.sg-row[data-act="openQuest"]').first().click();
      await page.waitForFunction((id) => SQ.u.screen !== "search" && String(SQ.u.questId || SQ.u.quest || location.hash).includes(id) || document.body.innerText.includes("Listing details"), id, { timeout: 5000 });
    });

    await test("d. Search for … runs the keyword search and leaves the venue view", async () => {
      await page.evaluate(() => SQ.go("search")); // back from the event page
      await page.waitForFunction(() => SQ.u.screen === "search" && !document.querySelector(".qd-scrim"), null, { timeout: 5000 });
      await page.click(input);
      await page.fill(input, "comedy");
      await page.waitForSelector('.sg-row[data-act="search"]');
      await page.click('.sg-row[data-act="search"]');
      await page.waitForFunction(() => SQ.u.search.ran === "comedy" && !SQ.u.search.venue && !SQ.u.search.loading, null, { timeout: 15000 });
      assert(!(await page.locator(".search-status").innerText()).includes("upcoming at"));
    });

    await test("e. Escape closes the box; at 375 px it fits on screen", async () => {
      await page.click(input);
      await page.fill(input, typed);
      await page.waitForSelector(".sg-list");
      const box = await page.locator(".sg-list").boundingBox();
      if (process.env.SUGGEST_SHOTS) await page.screenshot({ path: path.join(process.env.SUGGEST_SHOTS, "suggest-375.png") });
      assert(box.x >= 0 && box.x + box.width <= 375, JSON.stringify(box));
      await page.keyboard.press("Escape");
      assert.strictEqual(await page.locator(".sg-list").count(), 0);
    });

    await test("f. Hosts: a host suggestion and the event page's host name both list that host's upcoming events", async () => {
      const host = await page.evaluate(() => {
        const n = new Map();
        for (const e of SQ.d.events) if (SQ.realHost(e) && SQ.hostEvents(e.organizer.name).length) n.set(e.organizer.name, SQ.hostEvents(e.organizer.name).length);
        const venues = new Set(SQ.d.events.map((e) => e.venue && String(e.venue.name).toLowerCase()));
        const [name] = [...n.entries()].filter(([h]) => /^[A-Za-z]{4}/.test(h) && !venues.has(h.toLowerCase())).sort((a, b) => b[1] - a[1])[0] || [];
        return name || null;
      });
      assert(host, "the events have a host");
      await page.evaluate(() => SQ.go("search"));
      await page.click(input);
      await page.fill(input, host.slice(0, 6));
      await page.waitForSelector('.sg-row[data-act="searchHost"]');
      await page.click(`.sg-row[data-act="searchHost"][data-arg="${host.replace(/"/g, '\\"')}"]`);
      await page.waitForFunction((h) => SQ.u.search.host === h, host);
      const shown = await page.$$eval(".search-list .quest-row", (rows) => rows.map((r) => Number(r.dataset.arg)));
      const want = await page.evaluate((h) => SQ.hostEvents(h).map((e) => e.id), host);
      assert.deepStrictEqual(shown, want);
      // From one of their event pages, the host's name leads back to the same list
      await page.evaluate((id) => { SQ.u.search.host = null; const r = SQ.actions.openQuest(id); if (typeof r === "string") SQ.go(r); }, want[0]);
      await page.waitForSelector(".qd-host-name");
      await page.click(".qd-host-name");
      await page.waitForFunction((h) => SQ.u.screen === "search" && SQ.u.search.host === h, host);
    });
  } finally {
    await browser.close();
    restore();
  }
  console.log(failures ? `\n${failures} failed` : "\nAll passed");
  process.exit(failures ? 1 : 0);
})().catch((err) => { console.error(err); restore(); process.exit(1); });
