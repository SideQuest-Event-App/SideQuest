// The redesigned tabs, end to end in a real browser against the real server (designs TB2 Squads, TB2 Sidequests,
// TB3 Profile D1 "Bento"):
//  a. tab names: Discover · Squads · Plan · Sidequests · Profile, for real and demo accounts;
//  b. Squads: the list, one squad's space (members, open vote with its pink deadline, fair blend, chat), creating a
//     squad, and "Start a plan with this squad" linking to /sk?squad=<id>;
//  c. Sidequests: Your events · Saved · Invites (was Requests); going (violet event, teal place) and hosting (amber, ★ Hosting,
//     guests, Manage) look different; Add to calendar downloads a valid .ics file;
//  d. Profile: settings save and survive a reload, Download your data, and Delete account (real accounts only)
//     behind its type-DELETE step;
//  e. Stats: the numbers match the seeded attendance, with no streak or goal language;
//  f. Taste: edits change Discover's ranking order, "Don't count this", Start fresh and its undo, Quick retune;
//  g. the rating bug: a 4-5 star rating no longer adds vibes to the sign-up picks, and older accounts are fixed;
//  h. 375 and 1280 px: no sideways scroll, nothing under the tab bar, 44 px targets, weights 400/500/600, 12 px text.
//
// The server runs in this process; every outside request is blocked. The database file is copied and put back.
//   NODE_PATH=/opt/node-tools/node_modules node test/tabs.e2e.js
//   TABS_SHOTS=/some/folder ... saves 375 and 1280 px screenshots of each tab and subpage
//   ONLY="c." ... runs only the checks whose names contain that text

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tabs-"));
const SHOTS = process.env.TABS_SHOTS || "";
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let failures = 0;
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
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
  Object.assign(process.env, { PORT: String(port), AI: "off", ANTHROPIC_API_KEY: "", SIDEKICK_PLACES_OFF: "1", SIDEKICK_ELEVENLABS_OFF: "1", SIDEKICK_STUN_URL: "off", SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), SIDEKICK_STUDY_FILE: path.join(tmp, "study.json") });
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.GOOGLE_MAPS_API_KEY;
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => { if (!String(url).startsWith("http://localhost")) throw new Error("offline in tests"); return realFetch(url, opts); };

  require(path.join(ROOT, "server.js"));
  const dbm = require(path.join(ROOT, "lib", "db"));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 160; i++) { try { if ((await realFetch(`${base}/api/state`)).ok) break; } catch {} await wait(250); }
  const act = async (type, args, user) => {
    const r = await realFetch(`${base}/api/act`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, type, args }) });
    const body = await r.json();
    if (!r.ok) throw new Error(`${type}: ${body.error}`);
    return body;
  };
  const state = async (user) => (await (await realFetch(`${base}/api/state?user=${encodeURIComponent(user)}`)).json()).user;
  const feedOrder = async (user) => (await (await realFetch(`${base}/api/feed`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: user, force: true }) })).json()).order;
  const events = dbm.data.events; // every listing, past ones too (the app only downloads past ones in someone's log)
  const now = Date.now();
  const nowISO = new Date(now).toISOString();

  // ---------- Seeding: an account with real nights out ----------
  const stamp = now.toString(36);
  async function account(name, vibes = ["Live music", "Jazz", "Comedy", "Food & drink"]) {
    const { result: { userId } } = await act("signup", { name, email: `${name.toLowerCase().replace(/\W/g, "")}-${stamp}@example.com`, username: `${name.toLowerCase().replace(/\W/g, "")}_${stamp}` });
    await act("setProfile", { vibes, origin: "union", contactsSynced: true, registered: true }, userId);
    return userId;
  }
  const userId = await account("Asia Park");
  // Past nights this season, in different venues and neighbourhoods, each with a venue and vibes
  const seasonStart = (() => { const d = new Date(now); const m = d.getUTCMonth() + 1; const first = [12, 1, 2].includes(m) ? 12 : [3, 4, 5].includes(m) ? 3 : [6, 7, 8].includes(m) ? 6 : 9; return Date.UTC(first === 12 && m !== 12 ? d.getUTCFullYear() - 1 : d.getUTCFullYear(), first - 1, 2); })();
  const pastPool = events.filter((e) => e.type !== "place" && Date.parse(e.startsAt) > seasonStart && Date.parse(e.startsAt) < now - 2 * 86400000 && (e.vibes || []).length && e.venue && e.venue.name && e.venue.name !== "N/A");
  const seen = new Set();
  const nights = pastPool.filter((e) => { if (seen.has(e.venue.name)) return false; seen.add(e.venue.name); return true; }).slice(0, 4);
  assert(nights.length === 4, "the data has four past nights this season to seed");
  for (const [i, e] of nights.entries()) {
    await act("accept", { eventId: e.id }, userId);
    if (i < 3) await act("attended", { eventId: e.id, attended: true }, userId);
    if (i < 2) await act("rate", { eventId: e.id, stars: 5, tags: ["My crew"], with: ["Maya"] }, userId);
    if (i === 3) await act("checkIn", { eventId: e.id, how: "qr" }, userId); // the fourth: a check-in only
  }
  // One accepted night that never got confirmed: must not count
  const unconfirmed = pastPool.find((e) => !nights.includes(e));
  await act("accept", { eventId: unconfirmed.id }, userId);
  // Upcoming: one event going, one saved, and one they're hosting (added from a link)
  const upcoming = events.filter((e) => e.type !== "place" && Date.parse(e.startsAt) > now + 86400000 && Date.parse(e.startsAt) < now + 20 * 86400000 && (e.vibes || []).length);
  const goingTo = upcoming[0];
  await act("accept", { eventId: goingTo.id }, userId);
  const savedOne = upcoming[3];
  await act("save", { eventId: savedOne.id }, userId);
  const hostDay = new Date(now + 9 * 86400000).toISOString().slice(0, 10);
  const { result: { eventId: hostedId } } = await act("importEvent", { draft: { title: "Zine swap at the Tranzac", date: hostDay, time: "14:00", endTime: "17:00", venue: "Tranzac Club", address: "292 Brunswick Ave", area: "Downtown", price: "0", organizer: "Asia Park", description: "Bring five zines, take five.", sourceUrl: `https://example.com/zine-swap-${stamp}`, source: "Instagram", vibes: ["Zines & print"] } }, userId);
  const expected = { nights: 4, attended: 4, hosted: 0, venues: new Set(nights.map((e) => e.venue.name)).size };

  let chromium;
  try { ({ chromium } = require("playwright")); } catch { chromium = null; }
  if (!chromium) { console.log("FAIL  Playwright isn't installed (try NODE_PATH=/opt/node-tools/node_modules)"); restore(); process.exit(1); }
  const browser = await chromium.launch();
  async function phone({ width = 375, height = 812, user = userId } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, acceptDownloads: true });
    await ctx.addInitScript(([uid]) => {
      try {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        if (uid) localStorage.setItem("sq2.user", uid);
        sessionStorage.setItem("sq2.mode", "app");
      } catch {}
    }, [user]);
    await ctx.route("**/*", (r) => (new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort()));
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("      pageerror:", e.message));
    await page.goto(base);
    await page.waitForFunction(() => window.SQ && SQ.d && SQ.u && !document.getElementById("boot"), null, { timeout: 20000 });
    return { ctx, page };
  }
  const go = (page, screen, extra = {}) => page.evaluate(([s, x]) => { Object.assign(SQ.u, x); SQ.go(s); }, [screen, extra]);
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); };
  const text = (page) => page.evaluate(() => document.querySelector("#screen").innerText);

  try {
    // ---------- a ----------
    await test("a. Tab names: Discover, Squads, Plan, Sidequests, Profile, for a real account and the demo", async () => {
      const { ctx, page } = await phone();
      const tabs = await page.$$eval("nav.tabs .tab", (ts) => ts.map((t) => t.textContent.trim()));
      assert.deepStrictEqual(tabs, ["Discover", "Squads", "Plan", "Sidequests", "Profile"]);
      await page.click('nav.tabs .tab:has-text("Squads")');
      assert.strictEqual(await page.evaluate(() => SQ.u.screen), "squads");
      assert(!(await text(page)).includes("Community"), "no Community label");
      await ctx.close();
      const demo = await act("demoLogin", {}, null);
      const d = await phone({ user: demo.result.userId });
      await d.page.evaluate(() => SQ.demoSession(true));
      const dtabs = await d.page.$$eval("nav.tabs .tab", (ts) => ts.map((t) => t.textContent.trim()));
      assert.deepStrictEqual(dtabs, ["Discover", "Squads", "Plan", "Sidequests", "Profile"]);
      await d.page.click('nav.tabs .tab:has-text("Profile")');
      assert.strictEqual(await d.page.evaluate(() => SQ.u.screen), "profile", "the demo opens Profile");
      assert(await d.page.$('.pf-bottom button:has-text("Exit demo")'), "the demo's Profile has Exit demo");
      await d.ctx.close();
    });

    // ---------- b ----------
    await test("b. Squads: list, one squad's space with open vote (pink deadline), create a squad, start-a-plan link", async () => {
      const u = await state(userId);
      const main = u.squads[0];
      await act("sendToParty", { eventId: upcoming[1].id }, userId);
      await act("sendToParty", { eventId: upcoming[2].id }, userId);
      const { ctx, page } = await phone();
      await go(page, "squads");
      await page.waitForSelector(".sq-card");
      assert((await text(page)).includes("Friday Crew"), "the first squad is listed");
      assert(/Vote open · closes (Mon|Tue|Wed|Thu|Fri|Sat|Sun) /.test(await page.textContent(".sq-card .sq-line")), "the open vote and its deadline are the card's one status line");
      assert(!/Fair blend/.test(await text(page)), "no Fair blend on the list");
      await shot(page, "squads-375");
      await page.click(`.sq-open[data-arg="${main.id}"]`);
      await page.waitForSelector(".sq-next, .sq-opt");
      const t = await text(page);
      assert(/You, Maya, Kai/.test(t), "members");
      assert(!/Fair blend/.test(t), "no fair blend % (one status, one button)");
      assert.strictEqual(await page.$$eval(".sq-opt", (xs) => xs.length), 2, "two picks in the vote");
      assert(await page.$('.tb-pill.pink:has-text("Closes")'), "pink deadline in the space");
      const bg = await page.$eval('.tb-pill.pink', (el) => getComputedStyle(el).backgroundColor);
      assert.strictEqual(bg, "rgb(117, 41, 82)", "pink means the deadline (hot tint)");
      await page.click(`.sq-opt button[data-act="squadVote"]`);
      await page.waitForSelector('.sq-opt button[aria-pressed="true"]');
      assert.strictEqual(await page.$$eval("a.tb-btn.grad", (as) => as.filter((a) => !a.closest(".nav-ghost")).length), 1, "one main button");
      assert.strictEqual(await page.getAttribute('a.tb-btn.grad', "href"), `/sk?squad=${encodeURIComponent(main.id)}`);
      assert((await page.textContent("a.tb-btn.grad")).includes("Plan a night with Friday Crew"));
      await page.fill('.sq-compose input', "Sat works if we eat first");
      await page.click('.sq-compose button[type="submit"]');
      await page.waitForFunction(() => document.querySelector("#screen").innerText.includes("Sat works if we eat first"));
      await shot(page, "squad-375");
      // Create a squad
      await go(page, "squads");
      await page.click('button[data-act="newSquad"]');
      await page.waitForSelector('input[data-bind="newSquad.name"]');
      await page.fill('input[data-bind="newSquad.name"]', "Thursday climbers");
      await page.click('.sq-pick[data-arg="Leila"]');
      await page.click('.sq-pick[data-arg="Sam"]');
      assert((await page.textContent('button[data-act="createSquad"]')).includes("Create squad · 3 people"));
      await shot(page, "squad-new-375");
      await page.click('button[data-act="createSquad"]');
      await page.waitForFunction(() => SQ.u.screen === "squad" && document.querySelector("#screen").innerText.includes("Thursday climbers"));
      const after = await state(userId);
      const made = after.squads.find((s) => s.name === "Thursday climbers");
      assert(made && made.members.join() === "Leila,Sam", "saved on the server with its members");
      assert.strictEqual(await page.getAttribute('a.tb-btn.grad', "href"), `/sk?squad=${encodeURIComponent(made.id)}`);
      // Friends moved to Profile: Your Sidequesters (no Friends section on Squads, one + in the header)
      await go(page, "squads");
      assert(!/Friends ·/.test(await text(page)) && !(await page.$('.tb-head button[data-act="openFriends"]')), "no Friends on Squads");
      assert.strictEqual(await page.locator(".tb-head .icon-btn").count(), 1, "one + in the header");
      await go(page, "profile");
      await page.click('.pf-menu button[data-act="openFriends"]');
      await page.waitForFunction(() => SQ.u.screen === "friends");
      await ctx.close();
    });

    // ---------- c ----------
    await test("c. Sidequests: segments, going vs hosting styles, and Add to calendar gives a valid .ics", async () => {
      const { ctx, page } = await phone();
      await go(page, "questlog");
      await page.waitForSelector(".tb-seg");
      const segs = await page.$$eval(".tb-seg button", (bs) => bs.map((b) => b.textContent.trim()));
      assert.deepStrictEqual(segs.map((s) => s.replace(/\s*\d+$/, "")), ["Your events", "Saved", "Invites"]);
      assert(await page.$('.tb-head button:has-text("Add event")'), "Add event is a labelled button");
      // The going ticket is violet; the hosted one is amber with ★ Hosting, a guest count and Manage
      const going = await page.$(`.tk-big.violet, .tk-stub.violet`);
      assert(going, "a violet going ticket");
      const hosted = await page.$(".tk-stub.amber, .tk-big.amber");
      assert(hosted, "an amber hosted ticket");
      const ht = await hosted.innerText();
      assert(ht.includes("★ Hosting") && /\d+ going/.test(ht) && ht.includes("Manage"), `hosted shows the badge, guests and Manage: ${ht}`);
      const amberEdge = await hosted.evaluate((el) => getComputedStyle(el).borderTopColor);
      assert.strictEqual(amberEdge, "rgb(138, 109, 31)", "amber outline");
      const violetEdge = await going.evaluate((el) => getComputedStyle(el).borderTopColor);
      assert.notStrictEqual(violetEdge, amberEdge, "going and hosting look different");
      assert(!(await text(page)).match(/Apple Wallet|Google Wallet|Add to wallet/i), "no wallet buttons");
      await shot(page, "sidequests-375");
      // Add to calendar: an in-page .ics download
      // "Ask each time" (the default) shows the chooser; Apple Calendar downloads the file
      await page.click(`.tk-big button[data-act="addCal"]`);
      await page.waitForSelector('.tb-sheet button[data-act="calWith"][data-arg^="apple|"]');
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click('.tb-sheet button[data-act="calWith"][data-arg^="apple|"]')]);
      const file = path.join(tmp, "event.ics");
      await dl.saveAs(file);
      const ics = fs.readFileSync(file, "utf8");
      assert(/\.ics$/.test(dl.suggestedFilename()), "an .ics file");
      for (const line of ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "END:VEVENT", "END:VCALENDAR"]) assert(ics.split("\r\n").includes(line), `has ${line}`);
      assert(/\r\nDTSTART:\d{8}T\d{6}Z\r\n/.test(ics) && /\r\nDTEND:\d{8}T\d{6}Z\r\n/.test(ics) && /\r\nUID:sidequest-\d+@sidequest\.app\r\n/.test(ics), "UTC start, end and a UID");
      const first = await page.evaluate(() => SQ.ev(Number(document.querySelector('.tk-big button[data-act="addCal"]').dataset.arg)));
      const unfolded = ics.replace(/\r\n /g, "");
      assert(unfolded.includes(`SUMMARY:${first.title.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")}`), "summary is the event title");
      assert.strictEqual(unfolded.match(/DTSTART:(\d{8}T\d{6})Z/)[1], new Date(first.startsAt).toISOString().replace(/[-:]/g, "").slice(0, 15), "start time matches the event");
      assert(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75), "lines folded at 75 octets");
      // Saved and Requests
      await page.click('.tb-seg button:has-text("Saved")');
      await page.waitForSelector(`a[href="/sk?pick=${savedOne.id}"]`);
      assert((await text(page)).includes(savedOne.title));
      await shot(page, "sidequests-saved-375");
      await page.click('.tb-seg button:has-text("Invites")');
      await page.waitForFunction(() => document.querySelector("#screen").innerText.includes("Ask for something"));
      await shot(page, "sidequests-requests-375");
      // Manage the hosted event
      await page.click('.tb-seg button:has-text("Your events")');
      await page.click(`button[data-act="manageHosted"][data-arg="${hostedId}"]`);
      await page.waitForFunction(() => SQ.u.screen === "host-manage");
      assert(/going ·/i.test(await text(page)), "guest count");
      await ctx.close();
    });

    // ---------- d ----------
    await test("d. Profile: settings save and reload, Download your data, Delete account with the type-DELETE step", async () => {
      const { ctx, page } = await phone();
      await go(page, "profile");
      await page.waitForSelector(".pf-strip");
      const menu = await page.$$eval(".pf-menu .pf-mi > .grow", (xs) => xs.map((x) => x.textContent.trim()));
      for (const m of ["Your Sidequesters", "Your taste", "Night passport", "Settings"]) assert(menu.includes(m), `Profile menu has ${m}`);
      assert(await page.$(".pf-aura"), "the taste aura behind the avatar");
      assert.strictEqual(await page.$$eval(".pf-stat3 > div", (xs) => new Set(xs.map((x) => Math.round(x.getBoundingClientRect().top))).size), 1, "stats in one row");
      await page.click('.pf-menu button[data-go="settings-home"]');
      await page.waitForFunction(() => SQ.u.screen === "settings-home");
      const pt = await text(page);
      for (const g of ["Notifications", "Privacy and data", "Calendar", "Display and accessibility", "Help, feedback and terms"]) assert(pt.includes(g), `settings group ${g}`);
      assert(!pt.includes("Language"), "Language is hidden for now (features.e2e.js checks it)");
      await go(page, "profile");
      assert(await page.$('.pf-bottom button:has-text("Log out")') && await page.$('.pf-bottom button:has-text("Edit profile")') && await page.$('.pf-bottom [aria-label="Delete account"]'), "bottom row");
      await shot(page, "profile-375");
      await go(page, "settings-home");
      await page.click('button[data-act="openSettings"][data-arg="notifications"]');
      await page.click('button[data-arg^="notifications.hosts="]');
      await page.waitForFunction(() => SQ.d.user.settings.notifications.hosts === true);
      await page.goto(base);
      await page.waitForFunction(() => window.SQ && SQ.d && SQ.d.user);
      assert.strictEqual(await page.evaluate(() => SQ.d.user.settings.notifications.hosts), true, "kept after a reload");
      await go(page, "settings", { setGroup: "privacy" });
      await page.waitForSelector('button[data-arg="privacy.seeGoing=\\"squads\\""]');
      await page.click('button[data-arg="privacy.seeGoing=\\"squads\\""]');
      await page.waitForFunction(() => SQ.d.user.settings.privacy.seeGoing === "squads");
      const pv = await text(page);
      for (const x of ["Who sees what you're going to", "Who sees what you're hosting", "Who can add you to squads", "Blocked people", "Download your data", "Delete call history", "SideQuest doesn't save your location"]) assert(pv.includes(x), `privacy has ${x}`);
      await shot(page, "settings-privacy-375");
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click('button[data-act="downloadData"]')]);
      const json = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
      assert.strictEqual(json.account.id, userId, "your own data");
      assert(json.account.log && !json.account.feed, "your log, not the app's caches");
      await page.reload();
      await page.waitForFunction(() => window.SQ && SQ.d && SQ.d.user);
      await go(page, "settings-home");
      assert((await text(page)).includes("Your squads see your plans"), "the card shows the saved value");
      await ctx.close();
      assert.strictEqual(dbm.data.users[userId].settings.privacy.seeGoing, "squads", "stored on the account");

      // Delete: a second real account
      const doomed = await account("Delete Me");
      await act("createSquad", { name: "Doomed squad", members: ["Maya"] }, doomed);
      const d = await phone({ user: doomed });
      await go(d.page, "profile");
      await d.page.click('.pf-bottom [aria-label="Delete account"]');
      await d.page.waitForSelector('input[data-bind="deleteText"]');
      assert(await d.page.$('button[data-act="deleteAccount"][disabled]'), "disabled before typing DELETE");
      await d.page.fill('input[data-bind="deleteText"]', "delete");
      assert(await d.page.$('button[data-act="deleteAccount"][disabled]'), "lowercase isn't enough");
      await shot(d.page, "delete-account-375");
      await d.page.fill('input[data-bind="deleteText"]', "DELETE");
      await d.page.waitForSelector('button[data-act="deleteAccount"]:not([disabled])');
      await d.page.click('button[data-act="deleteAccount"]');
      await d.page.waitForFunction(() => !SQ.d.user, null, { timeout: 10000 });
      assert(!dbm.data.users[doomed] && !dbm.data.parties[doomed], "account and its first squad removed");
      assert(!Object.values(dbm.data.squads || {}).some((s) => s.owner === doomed), "squads they made removed");
      assert(!dbm.data.logs.going.some((g) => g.userId === doomed), "their activity removed");
      assert(!JSON.parse(fs.readFileSync(path.join(DATA, "db.json"), "utf8")).users[doomed], "gone from the saved database");
      await d.ctx.close();
      // The demo can't be deleted
      const demo = await act("demoLogin", {}, null);
      await assert.rejects(act("deleteAccount", { confirm: "DELETE" }, demo.result.userId), /demo account can't be deleted/);
    });

    // ---------- e ----------
    await test("e. Stats: numbers match the seeded attendance; no streaks, goals or x/y", async () => {
      const st = (await state(userId)).stats;
      assert.strictEqual(st.season.nights, expected.nights, "confirmed nights this season (the unconfirmed one isn't counted)");
      assert.strictEqual(st.season.attended, expected.attended);
      assert.strictEqual(st.season.hosted, 0, "the hosted event hasn't happened yet");
      assert.strictEqual(st.season.newVenues, expected.venues);
      assert.strictEqual(st.stamps.length, expected.venues, "a passport stamp per venue");
      assert(st.badges.find((b) => b.id === "first").earned, "first night out badge");
      assert(st.badges.find((b) => b.id === "door").earned, "checked in badge");
      const { ctx, page } = await phone();
      await go(page, "stats");
      await page.waitForSelector(".st-hero");
      const t = await text(page);
      assert(t.includes(`you went out ${expected.nights} times`), "sentence hero");
      assert(t.includes(`${expected.attended} attended`) && t.includes("0 hosted"), "split of attended and hosted");
      const ringNums = await page.$$eval(".st-ring-n", (xs) => xs.map((x) => Number(x.textContent)));
      assert.deepStrictEqual(ringNums.slice(0, 2), [expected.nights, expected.venues], "rings: nights out and new venues as plain counts");
      const monthBars = await page.$$eval(".st-bar", (xs) => xs.map((x) => Number(x.querySelector(".st-vpill").textContent)));
      assert.strictEqual(monthBars.reduce((a, b) => a + b, 0), expected.nights, "bar values add up to the nights");
      assert(await page.$(".st-vpill.top"), "the busiest month is marked");
      const marked = await page.$$eval(".st-day.event, .st-day.place", (xs) => xs.length);
      const thisMonth = nights.filter((e) => new Date(e.startsAt).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 7) === new Date(now).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }).slice(0, 7));
      assert.strictEqual(marked, new Set(thisMonth.map((e) => new Date(e.startsAt).toLocaleDateString("en-CA", { timeZone: "America/Toronto" }))).size, "calendar marks the dates out this month");
      assert(!/streak/i.test(t), "no streaks");
      assert(!/\bdaily goal|\byour goal|goal:|\bgoals? (left|to go)/i.test(t), "no goals");
      assert(!/\b\d+\s*\/\s*\d+\b/.test(t), "no x/y counters");
      assert(!/\d+ (more )?to (go|unlock)/i.test(t), "no counters on unearned badges");
      await shot(page, "stats-375");
      await page.click('button[data-act="openRewind"]');
      await page.waitForSelector(".rw-card");
      assert((await text(page)).includes(String(expected.nights)), "Rewind leads with the nights");
      await shot(page, "rewind-375");
      for (let i = 0; i < 5 && (await page.$(".rw-tap")); i++) await page.click(".rw-tap");
      assert(await page.$('button[data-act="shareRewind"]'), "the last card has Share (opt-in)");
      await ctx.close();
      // Little data: a friendly empty state
      const fresh = await account("New Person");
      const f = await phone({ user: fresh });
      await go(f.page, "stats");
      assert((await text(f.page)).includes("Nothing to count yet"), "empty state");
      await f.ctx.close();
    });

    // ---------- f ----------
    await test("f. Taste: edits change Discover's ranking order; Don't count this; Start fresh and undo; Quick retune", async () => {
      const before = (await feedOrder(userId)).slice(0, 15);
      const { ctx, page } = await phone();
      await go(page, "taste");
      await page.waitForSelector(".tt-hero");
      const tt = await text(page);
      assert(/Based on \d+ nights? out, \d+ saves? and \d+ "not for me"/.test(tt), "what the donut is based on");
      for (const x of ["Your top vibes", "Compare with", "Your go-tos", "Lists · ", "Going", "Saved", "Following", "Dealbreakers", "Picks feeling off?"]) assert(tt.includes(x), `taste page has ${x}`);
      assert(!/\d\.\d\d/.test(tt), "no exact weights");
      await shot(page, "taste-375");
      // Edit: Wild energy, weekends after 9 only, Comedy to Less
      await go(page, "taste-edit");
      await page.waitForSelector(".te-vibe");
      await page.$eval('input[data-change="tasteEnergy"]', (el) => { el.value = "100"; el.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.waitForSelector(".tb-undo");
      assert((await page.textContent(".tb-undo")).includes("Energy set to wild"), "undo toast after a change");
      for (const d of ["Sat", "Sun"]) {
        await page.click(`button[data-act="tasteDay"][data-arg="${d}"]`);
        await page.waitForFunction((x) => SQ.d.user.tastePage.prefs.days.includes(x), d);
      }
      await page.click('button[data-act="tasteTime"][data-arg="After 9"]');
      await page.waitForFunction(() => SQ.d.user.tastePage.prefs.times.includes("After 9"));
      await page.click('button[data-act="tasteLevel"][data-arg="Comedy|Less"]');
      await page.waitForFunction(() => (SQ.d.user.tastePage.vibes.find((v) => v.vibe === "Comedy") || {}).edited === 1);
      await shot(page, "taste-edit-375");
      const after = (await feedOrder(userId)).slice(0, 15);
      assert.notDeepStrictEqual(after, before, "Discover's order changed");
      const late = (id) => { const e = events.find((x) => x.id === id); const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }).format(new Date(e.startsAt))); const dow = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", weekday: "short" }).format(new Date(e.startsAt)); return (h >= 21 ? 1 : 0) + (["Sat", "Sun"].includes(dow) ? 1 : 0); };
      const fitScore = (ids) => ids.slice(0, 10).reduce((a, id) => a + late(id), 0);
      assert(fitScore(after) > fitScore(before), "more weekend, after-9 picks at the top");
      // Undo the last change from the toast
      await page.click('button[data-act="tasteLevel"][data-arg="Comedy|Lots"]');
      await page.waitForSelector(".tb-undo");
      await page.click('.tb-undo button');
      await page.waitForFunction(() => (SQ.d.user.tastePage.vibes.find((v) => v.vibe === "Comedy") || {}).edited === 1);
      // Where this came from, and Don't count this
      const tp = (await state(userId)).tastePage;
      const vibe = tp.vibes.find((v) => v.sources.some((s) => s.t != null && /^Rated 5★/.test(s.label)));
      assert(vibe, "a vibe learned from a 5-star night");
      const countBefore = dbm.data.users[userId].taste.events.length;
      await go(page, "taste", { tasteWhere: { type: "vibe", key: vibe.vibe } });
      await page.waitForSelector(".wh-sheet");
      const sheet = await page.textContent(".wh-sheet");
      assert(sheet.includes("Where this came from") && sheet.includes("Reset to automatic"), "provenance sheet");
      await shot(page, "taste-where-375");
      await page.click('.wh-sheet button[data-act="tasteForget"]');
      await page.waitForFunction((n) => SQ.d.user.tastePage.actions === n - 1, countBefore);
      assert.strictEqual(dbm.data.users[userId].taste.events.length, countBefore - 1, "one action no longer counts");
      assert(dbm.data.users[userId].log[nights[0].id] && dbm.data.users[userId].log[nights[1].id].rating === 5, "the night stays in their history");
      await page.click('.wh-sheet button[data-act="closeWhere"]');
      // Start fresh, then undo it
      await go(page, "taste-edit");
      await page.click('button[data-act="freshAsk"]');
      await page.click('button[data-act="tasteFresh"]');
      await page.waitForFunction(() => SQ.d.user.tastePage.actions === 0);
      const u = dbm.data.users[userId];
      assert(u.following !== undefined && u.saved.includes(savedOne.id) && u.log[goingTo.id], "follows, saves and tickets kept");
      assert(await page.$('button[data-act="tasteFreshUndo"]'), "24-hour undo offered");
      await page.click('button[data-act="tasteFreshUndo"]');
      await page.waitForFunction((n) => SQ.d.user.tastePage.actions === n - 1, countBefore);
      // Quick retune
      await go(page, "taste");
      await page.click('button[data-act="openRetune"]');
      await page.waitForSelector(".rt-card", { timeout: 10000 });
      const pairs = await page.evaluate(() => SQ.u.retune.pairs.length);
      assert(pairs >= 5 && pairs <= 6, `5 or 6 pairs (got ${pairs})`);
      const ids = await page.evaluate(() => SQ.u.retune.pairs.flatMap((p) => [p.a, p.b]));
      assert(ids.every((id) => { const e = events.find((x) => x.id === id); return e && Date.parse(e.startsAt) > now; }), "real upcoming events");
      await shot(page, "retune-375");
      for (let i = 0; i < pairs; i++) await page.click('.rt-card >> nth=0');
      await page.waitForFunction(() => SQ.u.retune.result);
      assert(/\d+ of your picks changed/.test(await text(page)), "N picks changed");
      await ctx.close();
    });

    // ---------- g ----------
    await test("g. Rating bug: 4-5 stars no longer add vibes to the sign-up picks; older accounts are fixed", async () => {
      const id = await account("Rating Check", ["Jazz", "Comedy"]);
      const e = pastPool.find((x) => !(x.vibes || []).some((v) => ["Jazz", "Comedy"].includes(v)));
      await act("accept", { eventId: e.id }, id);
      await act("rate", { eventId: e.id, stars: 5, tags: [] }, id);
      const u = await state(id);
      assert.deepStrictEqual(u.vibes, ["Jazz", "Comedy"], "sign-up picks unchanged");
      const loves = dbm.data.users[id].taste.events.filter((x) => x.k === "love" && x.id === e.id);
      assert.strictEqual(loves.length, 1, "one fading love signal, with the event id");
      const row = u.tastePage.vibes.find((v) => v.vibe === e.vibes[0]);
      assert(row && !row.picked && !/sign-up/.test(row.source), `"${e.vibes[0]}" says where it came from honestly (${row && row.source})`);
      assert(row.sources.some((s) => /^Rated 5★/.test(s.label)) && !row.sources.some((s) => s.kind === "signup"), "provenance is the rating, not sign-up");
      // Re-rating doesn't stack
      await act("rate", { eventId: e.id, stars: 4, tags: [] }, id);
      assert.strictEqual(dbm.data.users[id].taste.events.filter((x) => x.id === e.id && (x.k === "love" || x.k === "went")).length, 1);
      // An account from before the fix: the vibe was pushed into user.vibes and no fading signal recorded
      const old = dbm.data.users[await account("Old Account", ["Jazz", "Comedy"])];
      old.log[e.id] = { status: "went", rating: 5, tags: [], ratedAt: new Date(now - 10 * 86400000).toISOString() };
      old.vibes = ["Jazz", "Comedy", ...e.vibes.filter((v) => !["Jazz", "Comedy"].includes(v))];
      old.taste = { events: [], edits: {} };
      delete old.migrations;
      const fixed = await state(old.id);
      assert.deepStrictEqual(fixed.vibes, ["Jazz", "Comedy"], "the pushed vibes are taken back out");
      assert(old.taste.events.some((x) => x.k === "love" && x.id === e.id), "and the fading signal is there instead");
      const r2 = fixed.tastePage.vibes.find((v) => v.vibe === e.vibes[0]);
      assert(r2 && !/sign-up/.test(r2.source), "the Taste page no longer says From sign-up");
      // In the browser: the where-this-came-from sheet shows the rating, not "Picked at sign-up"
      const { ctx, page } = await phone({ user: old.id });
      await go(page, "taste", { tasteWhere: { type: "vibe", key: e.vibes[0] } });
      await page.waitForSelector(".wh-sheet");
      const s = await page.textContent(".wh-sheet");
      assert(/Rated 5★/.test(s) && !/Picked at sign-up/.test(s), s);
      await ctx.close();
    });

    // ---------- h ----------
    const SCREENS = [["squads"], ["squad", { squad: null }], ["questlog", { sqTab: "events" }], ["questlog", { sqTab: "saved" }, "saved"], ["questlog", { sqTab: "invites" }, "invites"], ["profile"], ["friends"], ["settings-home"], ["night-passport"], ["settings", { setGroup: "privacy" }], ["stats"], ["badges"], ["taste"], ["taste-edit"], ["retune"], ["rewind", { rewindStep: 0 }], ["squad-new"]];
    for (const [w, h] of [[375, 812], [1280, 800]]) {
      await test(`h. ${w} px: no sideways overflow, nothing under the tab bar, 44 px targets, weights from the type scale, 12 px text`, async () => {
        const { ctx, page } = await phone({ width: w, height: h });
        const main = (await state(userId)).squads[0].id;
        const bad = [];
        for (const [screen, extra = {}, tag = ""] of SCREENS) {
          if (screen === "retune") await page.evaluate(() => SQ.actions.openRetune());
          await go(page, screen, screen === "squad" ? { squad: main } : extra);
          await page.waitForFunction((s) => SQ.u.screen === s, screen);
          if (screen === "retune") await page.waitForSelector(".rt-card, .tb-empty", { timeout: 10000 });
          await wait(300);
          const r = await page.evaluate(() => {
            const out = { overflow: document.documentElement.scrollWidth - innerWidth, inner: 0, under: [], small: [], weights: new Set(), tiny: [] };
            const sc = document.querySelector("#screen .scroll");
            if (sc) out.inner = sc.scrollWidth - sc.clientWidth;
            const tabs = document.querySelector("#screen nav.tabs");
            const tabTop = tabs ? tabs.getBoundingClientRect().top : innerHeight;
            const phone = innerWidth < 1100;
            const shown = (el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && Number(c.opacity) > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
            const onTop = (el) => { const r = el.getBoundingClientRect(); const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); const hit = document.elementFromPoint(x, y); return hit && (hit === el || el.contains(hit)); };
            for (const el of document.querySelectorAll("#screen button, #screen a, #screen input, #screen summary")) {
              if (!shown(el) || !onTop(el) || el.closest("nav.tabs")) continue;
              const r = el.getBoundingClientRect();
              let bottom = r.bottom;
              for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const c = getComputedStyle(a); if (c.overflowY !== "visible" || c.overflowX !== "visible") bottom = Math.min(bottom, a.getBoundingClientRect().bottom); }
              if (phone && tabs && bottom > tabTop + 1) out.under.push(el.className || el.tagName);
              if (el.type === "range" || el.closest(".sq-compose, .search")) continue; // inputs inside their 52 px bar
              if (r.width < 43.5 || r.height < 43.5) out.small.push(`${el.tagName}.${String(el.className).slice(0, 40)} "${(el.textContent || "").trim().slice(0, 16)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
            for (const el of document.querySelectorAll("#screen *")) {
              if (!shown(el) || el.closest("nav.tabs")) continue;
              if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
              const c = getComputedStyle(el);
              out.weights.add(c.fontWeight);
              if (parseFloat(c.fontSize) < 12) out.tiny.push(`${el.tagName}.${el.className} ${c.fontSize} "${el.textContent.trim().slice(0, 20)}"`);
            }
            out.weights = [...out.weights].sort();
            return out;
          });
          const name = `${screen}${tag ? `-${tag}` : ""}`;
          if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-${w}.png`) });
          if (r.overflow > 0 || r.inner > 0) bad.push(`${name}: ${Math.max(r.overflow, r.inner)}px sideways scroll`);
          if (r.under.length) bad.push(`${name}: under the tab bar ${r.under.join(", ")}`);
          if (r.small.length) bad.push(`${name}: small targets ${r.small.join("; ")}`);
          if (!r.weights.every((x) => ["400", "500", "600", "700", "800"].includes(x))) bad.push(`${name}: weights ${r.weights.join(", ")}`); // 700/800: the redesign's titles
          if (r.tiny.length) bad.push(`${name}: tiny text ${r.tiny.join("; ")}`);
        }
        await ctx.close();
        assert.deepStrictEqual(bad, []);
      });
    }
    await test("h. Reduced motion: no slides between screens, and the undo toast doesn't move", async () => {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" });
      await ctx.addInitScript(([uid]) => { try { if (!sessionStorage.getItem("__s")) { sessionStorage.setItem("__s", "1"); localStorage.setItem("sq2.user", uid); sessionStorage.setItem("sq2.mode", "app"); } } catch {} }, [userId]);
      await ctx.route("**/*", (r) => (new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort()));
      const page = await ctx.newPage();
      await page.goto(base);
      await page.waitForFunction(() => window.SQ && SQ.d && !document.getElementById("boot"));
      await go(page, "settings-home");
      await page.click('button[data-act="openSettings"][data-arg="privacy"]');
      const moving = await page.evaluate(() => document.getAnimations().some((a) => a.effect && a.effect.getKeyframes().some((k) => k.transform && k.transform !== "none" && k.transform !== "translateX(0)")));
      assert(!moving, "no transform animations with reduced motion");
      await ctx.close();
    });
  } finally {
    await browser.close();
    restore();
    console.log(failures ? `${failures} tab check(s) failed` : "All tab checks passed");
    process.exit(failures ? 1 : 0);
  }
})().catch((err) => {
  console.log(`FAIL  ${err.stack || err.message}`);
  restore();
  process.exit(1);
});
