// The features that finish the tabs, end to end in a real browser against the real server:
//  a. Settings > Language is hidden (and its code stays, dormant);
//  b. a squad's live Sidekick call: "Live call · N in" on its card and in its space, and Join opens the call;
//  c. Taste > Lists: "+ New", rename, privacy (Private or Friends), add and remove from the event page and cards,
//     delete with a named confirm, counts under Lists, and friends see only lists shared with Friends;
//  d. quiet hours: notifications are held (in the inbox, no badge) and delivered when quiet hours end;
//  e. the Start fresh confirm: what resets and what's kept, the 24-hour undo, no typing, one clear button;
//  f. "Asking to join" on hosted events: ask, the host approves or declines in Manage, the guest is notified;
//  g. Delete account also removes the Supabase Auth user (a fake Supabase here), and skips it when not set up;
//  h. the winter start-time bug: add-from-a-link keeps 2 PM as 2 PM in winter and in summer;
//  i. Settings > Calendar: Google and Outlook links, Apple's .ics, and the "ask each time" chooser;
//  j. 375 and 1280 px: no sideways scroll, 44 px targets, weights 400/500/600, 12 px text, on the new screens and sheets.
//
// The server runs in this process; every outside request is blocked. The database file is copied and put back.
//   NODE_PATH=/opt/node-tools/node_modules node test/features.e2e.js
//   FEATURES_SHOTS=/some/folder ... saves screenshots; ONLY="c." runs only the checks whose names contain that text

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const http = require("http");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "features-"));
const SHOTS = process.env.FEATURES_SHOTS || "";
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

// A fake Supabase Auth admin API: lists users, deletes by id, and records every request
function fakeSupabase(users) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, apikey: req.headers.apikey, auth: req.headers.authorization || null });
    const u = new URL(req.url, "http://x");
    if (req.method === "GET" && u.pathname === "/auth/v1/admin/users") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ users, aud: "authenticated" }));
    }
    const m = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(u.pathname);
    if (req.method === "DELETE" && m) {
      const i = users.findIndex((x) => x.id === decodeURIComponent(m[1]));
      if (i < 0) { res.writeHead(404, { "content-type": "application/json" }); return res.end('{"msg":"User not found"}'); }
      users.splice(i, 1);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end("{}");
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => srv.listen(0, "127.0.0.1", () => resolve({ url: `http://localhost:${srv.address().port}`, seen, users, close: () => srv.close() })));
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
  const time = require(path.join(ROOT, "lib", "tabs", "time"));
  const notifyLib = require(path.join(ROOT, "lib", "tabs", "notify"));
  const authuser = require(path.join(ROOT, "lib", "tabs", "authuser"));
  const base = `http://localhost:${port}`;
  for (let i = 0; i < 160; i++) { try { if ((await realFetch(`${base}/api/state`)).ok) break; } catch {} await wait(250); }
  const act = async (type, args, user) => {
    const r = await realFetch(`${base}/api/act`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, type, args }) });
    const body = await r.json();
    if (!r.ok) throw new Error(`${type}: ${body.error}`);
    return body;
  };
  const state = async (user) => (await (await realFetch(`${base}/api/state?user=${encodeURIComponent(user)}`)).json()).user;
  const events = dbm.data.events;
  const now = Date.now();
  const stamp = now.toString(36);
  async function account(name, vibes = ["Live music", "Jazz", "Comedy", "Food & drink"]) {
    const handle = `${name.toLowerCase().replace(/\W/g, "")}_${stamp}`;
    const { result: { userId } } = await act("signup", { name, email: `${handle}@example.com`, username: handle });
    await act("setProfile", { vibes, origin: "union", contactsSynced: true, registered: true }, userId);
    await act("saveSettings", { change: { notifications: { quiet: false } } }, userId); // quiet hours on only where a check wants them
    return userId;
  }
  const friends = async (a, b) => { await act("addFriend", { key: `u:${b}` }, a); await act("answerFriend", { id: a, accept: true }, b); };
  // Toronto "HH:MM", minutes from now
  const torontoHM = (ms) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));

  const asia = await account("Asia Park");
  const ben = await account("Ben Ortiz");
  const cleo = await account("Cleo Diaz");
  await friends(asia, ben);
  await friends(asia, cleo);
  const upcoming = events.filter((e) => e.type !== "place" && Date.parse(e.startsAt) > now + 86400000 && Date.parse(e.startsAt) < now + 20 * 86400000 && (e.vibes || []).length);
  const place = events.find((e) => e.type === "place" && Date.parse(e.startsAt) > now);
  const goingTo = upcoming[0];
  await act("accept", { eventId: goingTo.id }, asia);
  const savedOne = upcoming[3];
  await act("save", { eventId: savedOne.id }, asia);
  const hostDay = new Date(now + 9 * 86400000).toISOString().slice(0, 10);
  const { result: { eventId: hostedId } } = await act("importEvent", { draft: { title: "Zine swap at the Tranzac", date: hostDay, time: "14:00", endTime: "17:00", venue: "Tranzac Club", address: "292 Brunswick Ave", area: "Downtown", price: "0", organizer: "Asia Park", description: "Bring five zines, take five.", sourceUrl: `https://example.com/zine-swap-${stamp}`, source: "Instagram", vibes: ["Zines & print"] } }, asia);

  let chromium;
  try { ({ chromium } = require("playwright")); } catch { chromium = null; }
  if (!chromium) { console.log("FAIL  Playwright isn't installed (try NODE_PATH=/opt/node-tools/node_modules)"); restore(); process.exit(1); }
  const browser = await chromium.launch();
  async function phone({ width = 375, height = 812, user = asia } = {}) {
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
  const shot = async (page, name) => { if (SHOTS) { await wait(500); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
  const text = (page) => page.evaluate(() => document.querySelector("#screen").innerText);
  const refresh = (page) => page.evaluate(async () => { await SQ.refresh(); SQ.render(); });

  const streams = [];
  try {
    // ---------- a ----------
    await test("a. Settings: the Language row and group are hidden, French labels stay off, and the code is still there", async () => {
      await act("saveSettings", { change: { language: "fr" } }, asia); // an account that picked French before
      const { ctx, page } = await phone();
      await go(page, "profile");
      await page.waitForSelector(".pf-strip");
      const t = await text(page);
      assert(!t.includes("Language") && !t.includes("Langue") && !t.includes("Français"), "no Language row on Profile");
      await go(page, "settings-home");
      await page.waitForFunction(() => SQ.u.screen === "settings-home");
      assert(!/Language|Langue|Français/.test(await text(page)), "no Language row in Settings");
      assert(!(await page.$('button[data-act="openSettings"][data-arg="language"]')), "no Language settings card");
      const tabs = await page.$eval("nav.tabs", (n) => [...n.querySelectorAll(".tab")].map((x) => x.textContent.trim()));
      assert.deepStrictEqual(tabs, ["Discover", "Squads", "Plan", "Sidequests", "Profile"], "labels stay English");
      assert.strictEqual(await page.evaluate(() => document.documentElement.lang), "en");
      // An old link to the Language screen falls back to Notifications
      await go(page, "settings", { setGroup: "language" });
      assert(!(await text(page)).includes("Français"), "the Language screen isn't reachable");
      assert(await page.$('button[data-arg^="notifications.plans="]'), "fell back to Notifications");
      // Dormant: the server still keeps the setting, so it can come back
      assert.strictEqual(dbm.data.users[asia].settings.language, "fr");
      await act("saveSettings", { change: { language: "en" } }, asia);
      await ctx.close();
    });

    // ---------- b ----------
    await test("b. Squads: a live call shows \"Live call · N in\" with Join on the card and in the space; Join opens the call", async () => {
      const { result: { squadId } } = await act("createSquad", { name: "Board game Sundays", members: [`u:${ben}`] }, asia);
      const before = await state(asia);
      assert(before.squads.every((s) => !s.live), "no live call yet");
      // Asia starts a call from the squad, and her phone joins the stream
      const room = await (await realFetch(`${base}/api/sk/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Asia", crew: "Board game Sundays", squad: squadId, members: ["Ben"], path: "squad" }) })).json();
      const ac = new AbortController();
      streams.push(ac);
      realFetch(`${base}/api/sk/rooms/${room.room}/stream?p=${room.person}`, { signal: ac.signal }).then((r) => r.body.getReader().read()).catch(() => {});
      let live = null;
      for (let i = 0; i < 40 && !live; i++) { await wait(100); live = (await state(asia)).squads.find((s) => s.id === squadId).live; }
      assert(live && live.id === room.room && live.on === 1, `live call on the squad: ${JSON.stringify(live)}`);
      assert(!(await state(asia)).squads.find((s) => s.id !== squadId && s.live), "only that squad");
      const benSq = (await state(ben)).squads.find((s) => s.id === squadId);
      assert(benSq && benSq.live && benSq.live.on === 1, "Ben, in the squad, sees the call too");
      assert(!(await state(cleo)).squads.some((s) => s.live), "Cleo, not in it, doesn't");
      // A second person in: the count follows
      const join = await (await realFetch(`${base}/api/sk/rooms/${room.room}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Ben", mode: "voice" }) })).json();
      const ac2 = new AbortController();
      streams.push(ac2);
      realFetch(`${base}/api/sk/rooms/${room.room}/stream?p=${join.person}`, { signal: ac2.signal }).then((r) => r.body.getReader().read()).catch(() => {});
      for (let i = 0; i < 40 && live.on !== 2; i++) { await wait(100); live = (await state(asia)).squads.find((s) => s.id === squadId).live; }
      assert.strictEqual(live.on, 2, "2 in");

      const { ctx, page } = await phone({ user: ben });
      await go(page, "squads");
      await page.waitForSelector(".sq-card.live");
      const card = await page.$eval(".sq-card.live", (el) => el.innerText);
      assert(/Live call · 2 in/.test(card) && /Board game Sundays/.test(card), `the card: ${card}`);
      assert.strictEqual(await page.$eval(".sq-list .sq-card", (el) => el.classList.contains("live")), true, "the live squad sits on top");
      assert.strictEqual(await page.getAttribute(".sq-card.live a.sq-join", "href"), `/sk/${room.room}`);
      await shot(page, "squads-live-375");
      await page.click(`.sq-card.live .sq-open`);
      await page.waitForFunction(() => SQ.u.screen === "squad");
      assert(/Live call · 2 in/.test(await text(page)), "the space shows it too");
      await shot(page, "squad-live-375");
      await Promise.all([page.waitForURL(`**/sk/${room.room}`), page.click("a.sq-join")]);
      assert(new URL(page.url()).pathname === `/sk/${room.room}`, "Join opens the call");
      await ctx.close();
      // The call ends: the card goes back to normal
      ac.abort();
      ac2.abort();
      for (let i = 0; i < 60 && (await state(asia)).squads.find((s) => s.id === squadId).live; i++) await wait(100);
      assert(!(await state(asia)).squads.find((s) => s.id === squadId).live, "no one on the call: no live card");
    });

    // ---------- c ----------
    await test("c. Lists: + New, rename, privacy, add and remove from the event page and cards, delete; counts; friends see only shared lists", async () => {
      const { ctx, page } = await phone();
      await go(page, "taste");
      await page.waitForSelector(".tt-hero");
      assert((await text(page)).includes("Lists · 4"), "the four built-in lists");
      await page.click('button[data-act="listNew"]');
      await page.waitForSelector('.tb-sheet input[data-bind="tbSheet.name"]');
      assert(await page.$("#ln-create[disabled]"), "Make the list waits for a name");
      await page.fill('.tb-sheet input[data-bind="tbSheet.name"]', "Rainy Sundays");
      assert(await page.$("#ln-create:not([disabled])"), "a name turns it on");
      await shot(page, "list-new-375");
      await page.click("#ln-create");
      await page.waitForFunction(() => SQ.u.screen === "taste-list");
      let lists = (await state(asia)).lists;
      assert.strictEqual(lists.length, 1);
      const id = lists[0].id;
      assert.deepStrictEqual({ name: lists[0].name, privacy: lists[0].privacy }, { name: "Rainy Sundays", privacy: "private" }, "private by default");
      // Rename
      await page.fill('input[data-bind="listName"]', "Rainy Sundays");
      await page.fill('input[data-bind="listName"]', "Rainy days");
      await page.evaluate(() => SQ.render());
      await page.click('form[data-act="listRename"] button');
      await page.waitForFunction(() => SQ.d.user.lists[0].name === "Rainy days");
      // Privacy: Friends
      await page.click(`button[data-act="listPrivacy"][data-arg="${id}|friends"]`);
      await page.waitForFunction(() => SQ.d.user.lists[0].privacy === "friends");
      // Add from the event page: the list button opens Add to a list
      await page.evaluate((e) => { SQ.u.quest = e; SQ.go("quest"); }, goingTo.id);
      await page.waitForSelector('.qd-nav button[data-act="listPick"]');
      await page.click('.qd-nav button[data-act="listPick"]');
      await page.waitForSelector(".tb-sheet .lp-row");
      await shot(page, "list-pick-375");
      await page.click(`.tb-sheet .lp-row[data-arg="${id}|${goingTo.id}"]`);
      await page.waitForSelector(`.tb-sheet .lp-row[aria-checked="true"]`);
      // And a new list straight from the sheet, with this event on it
      await page.fill('.tb-sheet input[data-bind="tbSheet.name"]', "Date night");
      await page.click("#lp-create");
      await page.waitForFunction(() => SQ.d.user.lists.length === 2);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector(".tb-sheet"));
      assert.strictEqual(await page.getAttribute('.qd-nav button[data-act="listPick"]', "aria-pressed"), "true", "the button shows it's on a list");
      // Add a place from a card (Saved), via the API for the place, and the saved event from its card
      if (place) await act("listItem", { list: id, eventId: place.id, on: true }, asia);
      await go(page, "questlog", { sqTab: "saved" });
      await page.click(`button[data-act="listPick"][data-arg="${savedOne.id}"]`);
      await page.click(`.tb-sheet .lp-row[data-arg="${id}|${savedOne.id}"]`);
      await page.waitForFunction(([l, e]) => SQ.d.user.lists.find((x) => x.id === l).items.includes(e), [id, savedOne.id]);
      await page.click('.tb-sheet button[data-act="closeSheet"]');
      lists = (await state(asia)).lists;
      const rainy = lists.find((l) => l.id === id);
      assert.deepStrictEqual({ events: rainy.events, places: rainy.places }, { events: 2, places: place ? 1 : 0 }, "counts of events and places");
      assert.deepStrictEqual(lists.find((l) => l.name === "Date night").items, [goingTo.id]);
      // Under Lists on Taste, with counts and privacy
      await go(page, "taste");
      const t = await text(page);
      assert(t.includes("Lists · 6"), "4 built-in + 2 of yours");
      assert(new RegExp(`Rainy days\\s*Friends · 2 events${place ? ", 1 place" : ""}`).test(t), `Rainy days row: ${t.slice(t.indexOf("Lists"), t.indexOf("Lists") + 200)}`);
      assert(/Date night\s*Private · 1 event/.test(t), "Date night row");
      await shot(page, "taste-lists-375");
      // Ben (a friend) sees the Friends list, not the private one; Cleo, after Asia unfriends her, sees neither
      const benState = await state(ben);
      assert.deepStrictEqual(benState.friendLists.map((l) => l.name), ["Rainy days"], "friends see shared lists only");
      await act("removeFriend", { key: `u:${cleo}` }, asia);
      assert.deepStrictEqual((await state(cleo)).friendLists, [], "not friends: nothing");
      await act("listPrivacy", { list: id, privacy: "private" }, asia);
      assert.deepStrictEqual((await state(ben)).friendLists, [], "private again: hidden from friends");
      await act("listPrivacy", { list: id, privacy: "friends" }, asia);
      // Remove from the list screen, then delete with a named confirm
      await page.click(`button[data-act="openList"][data-arg="${id}"]`);
      await page.waitForFunction(() => SQ.u.screen === "taste-list");
      await page.click(`button[data-act="listRemoveItem"][data-arg="${id}|${savedOne.id}"]`);
      await page.waitForFunction(([l, e]) => !SQ.d.user.lists.find((x) => x.id === l).items.includes(e), [id, savedOne.id]);
      await page.click('button[data-act="listDelAsk"]');
      await page.waitForSelector('button[data-act="listDelete"]');
      assert((await page.textContent('button[data-act="listDelete"]')).includes("Delete Rainy days"), "the confirm names the list");
      assert(/stay on SideQuest/.test(await text(page)), "says the events stay");
      await shot(page, "list-delete-375");
      await page.click('button[data-act="listDelete"]');
      await page.waitForFunction(() => SQ.u.screen === "taste" && SQ.d.user.lists.length === 1);
      // Mistakes are caught
      await assert.rejects(act("listCreate", { name: "date NIGHT" }, asia), /already have a list called/);
      await assert.rejects(act("listCreate", { name: "   " }, asia), /Give the list a name/);
      assert.strictEqual(dbm.data.users[asia].lists.length, 1, "stored on the account");
      await ctx.close();
    });

    // ---------- d ----------
    await test("d. Quiet hours: held in the inbox without a badge, then delivered when they end", async () => {
      // The rule, with a clock: quiet 23:00-09:00 Toronto; a 2 AM notification waits until 9 AM, across the winter change too
      const u = { notifications: [], settings: { notifications: { quiet: true, quietFrom: "23:00", quietTo: "09:00" } } };
      const at2am = time.torontoDate("2026-12-03", "02:00").getTime();
      const n = notifyLib.notify(u, { title: "Test" }, { now: at2am });
      assert(n.held && n.deliverAt === time.torontoDate("2026-12-03", "09:00").toISOString(), `held until 9 AM: ${n.deliverAt}`);
      assert.strictEqual(notifyLib.forApp(u.notifications)[0].read, true, "the app sees it as read: no badge");
      assert.strictEqual(notifyLib.deliver(u, { now: at2am + 3600000 }), 0, "still quiet at 3 AM");
      assert.strictEqual(notifyLib.deliver(u, { now: time.torontoDate("2026-12-03", "09:00").getTime() }), 1, "delivered at 9 AM");
      assert(!u.notifications[0].held && notifyLib.forApp(u.notifications)[0].read === false, "now it badges");
      const fallBack = notifyLib.notify(u, { title: "DST" }, { now: time.torontoDate("2026-11-01", "00:30").getTime() });
      assert.strictEqual(fallBack.deliverAt, time.torontoDate("2026-11-01", "09:00").toISOString(), "the fall-back night still ends at 9 AM local");
      assert(!notifyLib.notify(u, { title: "Day" }, { now: time.torontoDate("2026-12-03", "12:00").getTime() }).held, "outside quiet hours: straight through");

      // For real: Cleo's quiet hours cover now; a friend request arrives held
      await act("readNotifications", {}, cleo); // start from an empty badge
      await act("saveSettings", { change: { notifications: { quiet: true, quietFrom: torontoHM(now - 3600000), quietTo: torontoHM(Date.now() + 3600000) } } }, cleo);
      const dave = await account("Dave Kim");
      await act("addFriend", { key: `u:${cleo}` }, dave);
      let mine = (await state(cleo)).notifications.filter((x) => x.friendFrom === dave);
      assert(mine.length === 1 && mine[0].held && mine[0].read === true, `held, shown as read: ${JSON.stringify(mine)}`);
      assert(dbm.data.users[cleo].notifications.find((x) => x.friendFrom === dave).read === false, "still unread underneath");
      const { ctx, page } = await phone({ user: cleo });
      await go(page, "profile");
      await page.waitForSelector(".pf-head");
      assert(!(await page.$(".pf-bell .count-badge")), "no badge during quiet hours");
      await go(page, "notifications");
      assert((await text(page)).includes("Friend request"), "it's in the inbox");
      await go(page, "settings", { setGroup: "notifications" });
      assert(/1 notification waiting in your inbox, no badge/.test(await text(page)), "Settings says what's held");
      await shot(page, "quiet-held-375");
      // Quiet hours end (here: moved to finish a minute ago) and it's delivered, with the badge
      await act("saveSettings", { change: { notifications: { quietFrom: torontoHM(Date.now() - 7200000), quietTo: torontoHM(Date.now() - 60000) } } }, cleo);
      mine = (await state(cleo)).notifications.filter((x) => x.friendFrom === dave);
      assert(!mine[0].held && mine[0].read === false && mine[0].deliveredAt, "delivered");
      await refresh(page);
      await go(page, "profile");
      await page.waitForSelector(".pf-bell .count-badge");
      await ctx.close();
      await act("saveSettings", { change: { notifications: { quiet: false } } }, cleo);
    });

    // ---------- e ----------
    await test("e. Start fresh: a confirm sheet with what resets and what's kept, the 24-hour undo, no typing, one clear button", async () => {
      await act("tasteFollow", { name: "Tranzac Club", kind: "venue", on: true }, asia);
      const { ctx, page } = await phone();
      await go(page, "taste-edit");
      await page.waitForSelector('button[data-act="freshAsk"]');
      const before = dbm.data.users[asia].taste.events.length;
      assert(before > 0, "there's learned taste to clear");
      await page.click('button[data-act="freshAsk"]');
      await page.waitForSelector(".fr-sheet[role=dialog]");
      const s = await page.textContent(".fr-sheet");
      for (const x of ["Start fresh?", "Resets", "Kept", "Follows", "Saves", "Tickets", "Learned vibes", "Undo from the banner on Taste until"]) assert(s.includes(x), `the sheet says ${x}`);
      assert(!(await page.$(".fr-sheet input")), "no typing to confirm");
      const go2 = await page.$('.fr-sheet button[data-act="tasteFresh"]');
      assert(go2 && (await go2.textContent()).trim() === "Start fresh", "one clear primary button");
      const bg = await go2.evaluate((el) => getComputedStyle(el).backgroundColor);
      assert(bg !== "rgba(0, 0, 0, 0)", "filled, not outlined");
      assert.strictEqual(await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim()), "Keep my taste", "focus starts on the safe choice");
      await shot(page, "start-fresh-375");
      // Escape, and Keep my taste, both leave it alone
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector(".fr-sheet"));
      await page.click('button[data-act="freshAsk"]');
      await page.click('.fr-sheet button[data-act="freshCancel"]');
      assert.strictEqual(dbm.data.users[asia].taste.events.length, before, "nothing cleared");
      // Start fresh: cleared, kept, and undoable
      await page.click('button[data-act="freshAsk"]');
      await page.click('.fr-sheet button[data-act="tasteFresh"]');
      await page.waitForFunction(() => SQ.d.user.tastePage.actions === 0 && !document.querySelector(".fr-sheet"));
      const u = dbm.data.users[asia];
      assert(u.following.includes("Tranzac Club") && u.saved.includes(savedOne.id) && u.log[goingTo.id], "follows, saves and tickets kept");
      assert(await page.$('button[data-act="tasteFreshUndo"]'), "the undo banner");
      await page.click('button[data-act="tasteFreshUndo"]');
      await page.waitForFunction((n) => SQ.d.user.tastePage.actions === n, before);
      await ctx.close();
    });

    // ---------- f ----------
    await test("f. Asking to join: the host turns approval on; ask, approve and decline in Manage; both sides notified", async () => {
      // Before approval is on, there's nothing to ask
      await assert.rejects(act("askJoin", { eventId: hostedId }, ben), /No need to ask/);
      const host = await phone();
      await host.page.evaluate((id) => SQ.actions.manageHosted(id), hostedId);
      await host.page.evaluate(() => SQ.go("host-manage"));
      await host.page.waitForSelector(`button[data-act="hostApproval"][data-arg="${hostedId}|1"]`);
      await host.page.click(`button[data-act="hostApproval"][data-arg="${hostedId}|1"]`);
      await host.page.waitForFunction((id) => SQ.d.user.hosting.find((h) => h.id === id).approval === true, hostedId);
      assert(events.find((e) => e.id === hostedId).approval, "stored on the event");
      // Ben: "Ask to join" in place of I'm going; tapping going directly is refused
      const g = await phone({ user: ben });
      await refresh(g.page);
      await g.page.evaluate((id) => { SQ.u.quest = id; SQ.go("quest"); }, hostedId);
      await g.page.waitForSelector('button[data-act="askJoin"]');
      assert(!(await g.page.$('.qd-buy button:has-text("I\'m going")')), "no I'm going");
      await assert.rejects(act("accept", { eventId: hostedId }, ben), /needs the host's OK/);
      await shot(g.page, "ask-to-join-375");
      await g.page.click('button[data-act="askJoin"]');
      await g.page.waitForSelector('button[data-act="cancelJoin"]');
      assert(/Asked to join/.test(await g.page.textContent(".qd-buy")), "waiting for the host");
      const ev = events.find((e) => e.id === hostedId);
      assert.deepStrictEqual(ev.joinRequests.map((r) => [r.userId, r.status]), [[ben, "asking"]], "stored on the event");
      const feed = await (await realFetch(`${base}/api/events`)).json();
      assert(!feed.events.find((e) => e.id === hostedId).joinRequests, "requests aren't in the public events feed");
      assert((await state(asia)).notifications.some((n) => n.title === "Ben is asking to join" && n.eventId === hostedId && !n.held), "the host is notified");
      // Cleo asks too, with quiet hours on: the host declines, and her notice waits
      await act("addFriend", { key: `u:${asia}` }, cleo).catch(() => {});
      await act("askJoin", { eventId: hostedId }, cleo);
      await act("saveSettings", { change: { notifications: { quiet: true, quietFrom: torontoHM(Date.now() - 3600000), quietTo: torontoHM(Date.now() + 3600000) } } }, cleo);
      // The host's Manage: both, with Accept and Decline and a pink reply-by
      await refresh(host.page);
      await host.page.waitForSelector(`button[data-act="joinDecide"][data-arg="${hostedId}|${ben}|1"]`);
      const m = await text(host.page);
      assert(/Asking to join · 2/i.test(m) && m.includes("Ben") && m.includes("Cleo"), "Manage lists both");
      assert(await host.page.$('.tb-pill.pink:has-text("Reply by")'), "pink reply-by");
      await shot(host.page, "manage-asking-375");
      await host.page.click(`button[data-act="joinDecide"][data-arg="${hostedId}|${ben}|1"]`);
      await host.page.waitForFunction(([id, b]) => SQ.d.user.hosting.find((h) => h.id === id).requests.find((r) => r.userId === b).status === "approved", [hostedId, ben]);
      await host.page.click(`button[data-act="joinDecide"][data-arg="${hostedId}|${cleo}|0"]`);
      await host.page.waitForFunction(([id, c]) => SQ.d.user.hosting.find((h) => h.id === id).requests.find((r) => r.userId === c).status === "declined", [hostedId, cleo]);
      assert(/In: Ben/.test(await text(host.page)) && /Declined: Cleo/.test(await text(host.page)), "decided ones listed");
      // Ben: notified and in his Sidequests; Cleo: told no (held by her quiet hours)
      const b = await state(ben);
      assert(b.notifications.some((n) => n.title === "You're in: Zine swap at the Tranzac" && !n.held), "Ben is told yes");
      assert(b.log[hostedId] && b.log[hostedId].status === "going", "Ben is going");
      const c = await state(cleo);
      const no = c.notifications.find((n) => n.title === "No room at Zine swap at the Tranzac");
      assert(no && no.held && no.read === true, "Cleo is told no, held for her quiet hours");
      assert(!c.log[hostedId], "Cleo isn't going");
      await refresh(g.page);
      assert(!(await g.page.$('button[data-act="askJoin"]')) && !(await g.page.$('button[data-act="cancelJoin"]')), "Ben's event page moved on: he's going");
      await host.ctx.close();
      await g.ctx.close();
      await act("saveSettings", { change: { notifications: { quiet: false } } }, cleo);
      await assert.rejects(act("joinDecide", { eventId: hostedId, userId: ben, approve: false }, cleo), /Only the host/);
    });

    // ---------- g ----------
    await test("g. Delete account removes the Supabase Auth user (fake Supabase), and skips it when Supabase isn't set up", async () => {
      // The helper on its own: not configured, stored id, lookup by email, and a server error that doesn't throw
      assert.deepStrictEqual(await authuser.deleteAuthUser({ id: "x", email: "a@b.c" }, { env: {} }), { skipped: "not configured" });
      const fake = await fakeSupabase([{ id: "auth-stored", email: "stored@example.com" }, { id: "auth-zed", email: "zed@example.com" }]);
      const env = { SUPABASE_URL: fake.url, SUPABASE_SECRET_KEY: "sb_secret_test" };
      assert.deepStrictEqual(await authuser.deleteAuthUser({ id: "1", authId: "auth-stored" }, { env }), { deleted: "auth-stored" });
      assert.deepStrictEqual(fake.seen.map((r) => `${r.method} ${r.url}`), ["DELETE /auth/v1/admin/users/auth-stored"], "a stored id needs no lookup");
      assert.strictEqual(fake.seen[0].apikey, "sb_secret_test", "the secret key goes in apikey");
      assert.deepStrictEqual(await authuser.deleteAuthUser({ id: "2", email: "nobody@example.com" }, { env }), { skipped: "no auth user" });
      const quiet = { error() {} };
      assert(/ECONNREFUSED|fetch failed/.test((await authuser.deleteAuthUser({ id: "3", authId: "z" }, { env: { SUPABASE_URL: "http://localhost:1", SUPABASE_SECRET_KEY: "k" }, log: quiet })).error || ""), "an unreachable Supabase reports, never throws");

      // Through the app: a real account deleted while Supabase is "set up" (pointing at the fake)
      const doomed = await account("Zed Gone");
      const email = dbm.data.users[doomed].email;
      fake.users.push({ id: "auth-doomed", email, user_metadata: { sidequest_id: doomed } });
      fake.seen.length = 0;
      process.env.SUPABASE_URL = fake.url;
      process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
      let r;
      try { r = (await act("deleteAccount", { confirm: "DELETE" }, doomed)).result; } finally { delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY; }
      assert.deepStrictEqual(r, { deleted: true, auth: { deleted: "auth-doomed" } });
      assert(!dbm.data.users[doomed], "the account row is gone first");
      assert(fake.seen.some((x) => x.method === "DELETE" && x.url === "/auth/v1/admin/users/auth-doomed" && x.apikey === "sb_secret_test"), `DELETE /auth/v1/admin/users/{id} with the secret key: ${JSON.stringify(fake.seen)}`);
      assert(!fake.users.some((x) => x.id === "auth-doomed"), "the Auth user is gone from the fake");
      // Not set up: the account goes and Supabase is skipped, quietly
      const doomed2 = await account("Yan Gone");
      fake.seen.length = 0;
      r = (await act("deleteAccount", { confirm: "DELETE" }, doomed2)).result;
      assert.deepStrictEqual(r, { deleted: true, auth: { skipped: "not configured" } });
      assert.strictEqual(fake.seen.length, 0, "no call to Supabase");
      assert(!dbm.data.users[doomed2]);
      fake.close();
    });

    // ---------- h ----------
    await test("h. Winter start-time bug: add-from-a-link keeps 2 PM as 2 PM in winter and in summer (America/Toronto)", async () => {
      // The conversion itself, on both sides of daylight saving and on the change days
      const iso = (d, t) => time.torontoDate(d, t).toISOString();
      assert.strictEqual(iso("2027-01-15", "14:00"), "2027-01-15T19:00:00.000Z", "winter: EST, -05:00");
      assert.strictEqual(iso("2027-07-15", "14:00"), "2027-07-15T18:00:00.000Z", "summer: EDT, -04:00");
      assert.strictEqual(iso("2026-12-05", "14:00"), "2026-12-05T19:00:00.000Z");
      assert.strictEqual(iso("2027-03-14", "12:00"), "2027-03-14T16:00:00.000Z", "spring-forward day, afternoon: EDT");
      assert.strictEqual(iso("2027-03-14", "02:30"), "2027-03-14T07:30:00.000Z", "a skipped time reads as clocks do (3:30 AM)");
      assert.strictEqual(iso("2026-11-01", "01:30"), "2026-11-01T05:30:00.000Z", "fall-back night: the first 1:30");
      assert.strictEqual(iso("2026-11-01", "14:00"), "2026-11-01T19:00:00.000Z", "fall-back day, afternoon: EST");
      // Through the add-event form's action, with winter and summer dates
      const add = async (date, title) => (await act("importEvent", { draft: { title, date, time: "14:00", endTime: "16:30", venue: "The Garrison", address: "1197 Dundas St W", area: "West End", price: "15", organizer: "Test Host", description: "A matinee.", sourceUrl: `https://example.com/${title.replace(/\W/g, "")}-${stamp}`, source: "Eventbrite", vibes: ["Live music"] } }, asia)).result.eventId;
      const wid = await add("2027-01-15", "Winter matinee");
      const sid = await add("2027-07-15", "Summer matinee");
      const we = events.find((e) => e.id === wid);
      const se = events.find((e) => e.id === sid);
      assert.strictEqual(we.startsAt, "2027-01-15T19:00:00.000Z", `winter 2 PM saved as ${we.startsAt}`);
      assert.strictEqual(we.endsAt, "2027-01-15T21:30:00.000Z", "winter end");
      assert.strictEqual(se.startsAt, "2027-07-15T18:00:00.000Z", `summer 2 PM saved as ${se.startsAt}`);
      assert(/, 2 PM$/.test(we.date) && /, 2 PM$/.test(se.date), `labels: ${we.date} / ${se.date}`);
      // And the app shows 2 PM for both
      const { ctx, page } = await phone();
      await refresh(page);
      const shown = await page.evaluate(([a, b]) => [SQ.tbTimeLabel(SQ.ev(a).startsAt), SQ.tbTimeLabel(SQ.ev(b).startsAt)], [wid, sid]);
      assert.deepStrictEqual(shown, ["2 PM", "2 PM"]);
      // The client's helper (host drafts, scheduled publishing) agrees with the server's
      const client = await page.evaluate(() => [SQ.torontoISO("2027-01-15", "14:00"), SQ.torontoISO("2027-07-15", "14:00"), SQ.torontoISO("2026-11-01", "01:30")]);
      assert.deepStrictEqual(client, ["2027-01-15T19:00:00.000Z", "2027-07-15T18:00:00.000Z", "2026-11-01T05:30:00.000Z"]);
      await ctx.close();
    });

    // ---------- i ----------
    await test("i. Calendar choice: Google and Outlook add links, Apple's .ics, and a chooser for Ask each time", async () => {
      const { ctx, page } = await phone();
      await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
      const e = await page.evaluate((id) => SQ.ev(id), goingTo.id);
      const start = Date.parse(e.startsAt);
      const end = e.endsAt ? Date.parse(e.endsAt) : start + 2 * 3600000;
      const ics = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      const setApp = async (app) => {
        await go(page, "settings", { setGroup: "calendar" });
        await page.click(`button[data-arg='calendar.app="${app}"']`);
        await page.waitForFunction((a) => SQ.d.user.settings.calendar.app === a, app);
        await go(page, "questlog", { sqTab: "events" });
        await page.waitForSelector(`.tk-big button[data-act="addCal"][data-arg="${goingTo.id}"]`);
      };
      // Google
      await setApp("google");
      await page.click(`.tk-big button[data-act="addCal"][data-arg="${goingTo.id}"]`);
      let url = new URL(await page.evaluate(() => window.__opened.pop()));
      assert.strictEqual(`${url.origin}${url.pathname}`, "https://calendar.google.com/calendar/render");
      assert.strictEqual(url.searchParams.get("action"), "TEMPLATE");
      assert.strictEqual(url.searchParams.get("text"), e.title);
      assert.strictEqual(url.searchParams.get("dates"), `${ics(start)}/${ics(end)}`, "UTC start/end");
      assert(url.searchParams.get("details").includes("On SideQuest"), "details");
      assert(!(await page.$(".tb-sheet")), "no chooser");
      // Outlook
      await setApp("outlook");
      await page.click(`.tk-big button[data-act="addCal"][data-arg="${goingTo.id}"]`);
      url = new URL(await page.evaluate(() => window.__opened.pop()));
      assert.strictEqual(`${url.origin}${url.pathname}`, "https://outlook.live.com/calendar/0/action/compose");
      assert.strictEqual(url.searchParams.get("rru"), "addevent");
      assert.strictEqual(url.searchParams.get("subject"), e.title);
      assert.strictEqual(url.searchParams.get("startdt"), new Date(start).toISOString());
      assert.strictEqual(url.searchParams.get("enddt"), new Date(end).toISOString());
      // Apple: the .ics
      await setApp("apple");
      const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`.tk-big button[data-act="addCal"][data-arg="${goingTo.id}"]`)]);
      assert(/\.ics$/.test(dl.suggestedFilename()));
      const file = fs.readFileSync(await dl.path(), "utf8");
      assert(file.includes(`DTSTART:${ics(start)}`) && file.includes("BEGIN:VEVENT"), "a valid .ics for the event");
      assert.strictEqual(await page.evaluate(() => window.__opened.length), 0, "nothing opened");
      // Ask each time: a small chooser with all three
      await setApp("ask");
      await page.click(`.tk-big button[data-act="addCal"][data-arg="${goingTo.id}"]`);
      await page.waitForSelector(".tb-sheet[role=dialog]");
      const opts = await page.$$eval('.tb-sheet button[data-act="calWith"]', (bs) => bs.map((b) => b.dataset.arg.split("|")[0]));
      assert.deepStrictEqual(opts, ["google", "apple", "outlook"]);
      await shot(page, "calendar-chooser-375");
      await page.click('.tb-sheet button[data-act="calWith"][data-arg^="outlook|"]');
      assert(/^https:\/\/outlook\.live\.com\//.test(await page.evaluate(() => window.__opened.pop())), "the chooser's pick opens");
      assert(!(await page.$(".tb-sheet")), "and closes");
      await ctx.close();
    });

    // ---------- j ----------
    const { result: { squadId: liveSquad } } = await act("createSquad", { name: "Layout check", members: [`u:${ben}`] }, asia);
    const room = await (await realFetch(`${base}/api/sk/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Asia", crew: "Layout check", squad: liveSquad, path: "squad" }) })).json();
    const lac = new AbortController();
    streams.push(lac);
    realFetch(`${base}/api/sk/rooms/${room.room}/stream?p=${room.person}`, { signal: lac.signal }).then((r) => r.body.getReader().read()).catch(() => {});
    const { result: { listId } } = await act("listCreate", { name: "Layout list with a fairly long name", privacy: "friends", eventId: goingTo.id }, asia);
    await act("askJoin", { eventId: hostedId }, (await account("Eve Long")));
    await act("saveSettings", { change: { notifications: { quiet: true, quietFrom: torontoHM(Date.now() - 3600000), quietTo: torontoHM(Date.now() + 3600000) } } }, asia);
    await act("addFriend", { key: `u:${asia}` }, await account("Finn Held"));
    const SCREENS = [
      ["squads"], ["squad", { squad: liveSquad }], ["taste"], ["taste-list", { listId }], ["host-manage", { quest: hostedId }],
      ["settings", { setGroup: "notifications" }, "notifications"], ["settings", { setGroup: "calendar" }, "calendar"],
      ["quest", { quest: goingTo.id, tbSheet: { kind: "list-pick", screen: "quest", id: goingTo.id, name: "", privacy: "private" } }, "list-pick", ".tb-sheet"], // the event page itself isn't this work's; its sheet is
      ["questlog", { sqTab: "events", tbSheet: { kind: "cal", screen: "questlog", id: goingTo.id } }, "cal-sheet"],
      ["taste", { tbSheet: { kind: "list-new", screen: "taste", name: "", privacy: "private" } }, "list-new"],
      ["taste-edit", { tbSheet: { kind: "fresh", screen: "taste-edit" } }, "fresh"],
    ];
    for (const [w, h] of [[375, 812], [1280, 800]]) {
      await test(`j. ${w} px: new screens and sheets have no sideways scroll, 44 px targets, weights from the type scale, 12 px text`, async () => {
        const { ctx, page } = await phone({ width: w, height: h });
        const bad = [];
        for (const [screen, extra = {}, tag = "", scope = "#screen"] of SCREENS) {
          await go(page, screen, { tbSheet: null, ...extra });
          await page.waitForFunction((s) => SQ.u.screen === s, screen);
          await wait(250);
          const r = await page.evaluate((scope) => {
            const out = { overflow: document.documentElement.scrollWidth - innerWidth, inner: 0, small: [], weights: new Set(), tiny: [] };
            for (const sc of document.querySelectorAll("#screen .scroll, #screen .tb-sheet")) out.inner = Math.max(out.inner, sc.scrollWidth - sc.clientWidth);
            const shown = (el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 0 && r.height > 0 && c.visibility !== "hidden" && Number(c.opacity) > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
            const onTop = (el) => { const r = el.getBoundingClientRect(); const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); const hit = document.elementFromPoint(x, y); return hit && (hit === el || el.contains(hit)); };
            for (const el of document.querySelectorAll(["button", "a", "input", "summary"].map((t) => `${scope} ${t}`).join(", "))) {
              if (!shown(el) || !onTop(el) || el.closest("nav.tabs") || el.classList.contains("tb-scrim") || el.classList.contains("wh-scrim")) continue;
              if (el.type === "range" || el.closest(".sq-compose, .search")) continue;
              const r = el.getBoundingClientRect();
              if (r.width < 43.5 || r.height < 43.5) out.small.push(`${el.tagName}.${String(el.className).slice(0, 40)} "${(el.textContent || "").trim().slice(0, 16)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
            for (const el of document.querySelectorAll(`${scope} *`)) {
              if (!shown(el) || el.closest("nav.tabs")) continue;
              if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
              const c = getComputedStyle(el);
              out.weights.add(c.fontWeight);
              if (parseFloat(c.fontSize) < 12) out.tiny.push(`${el.tagName}.${el.className} ${c.fontSize} "${el.textContent.trim().slice(0, 20)}"`);
            }
            out.weights = [...out.weights].sort();
            return out;
          }, scope);
          const name = `${screen}${tag ? `-${tag}` : ""}`;
          if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}-${w}.png`) });
          if (r.overflow > 0 || r.inner > 0) bad.push(`${name}: ${Math.max(r.overflow, r.inner)}px sideways scroll`);
          if (r.small.length) bad.push(`${name}: small targets ${r.small.join("; ")}`);
          if (!r.weights.every((x) => ["400", "500", "600", "700", "800"].includes(x))) bad.push(`${name}: weights ${r.weights.join(", ")}`); // 700/800: the redesign's titles
          if (r.tiny.length) bad.push(`${name}: tiny text ${r.tiny.join("; ")}`);
        }
        // The live card and the sheets are really there
        await go(page, "squads", { tbSheet: null });
        assert(await page.$(".sq-card.live"), "the live card is on the list");
        await ctx.close();
        assert.deepStrictEqual(bad, []);
      });
    }
    await test("j. Reduced motion: the live orb and the sheets don't animate", async () => {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: "reduce" });
      await ctx.addInitScript(([uid]) => { try { if (!sessionStorage.getItem("__s")) { sessionStorage.setItem("__s", "1"); localStorage.setItem("sq2.user", uid); sessionStorage.setItem("sq2.mode", "app"); } } catch {} }, [asia]);
      await ctx.route("**/*", (r) => (new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort()));
      const page = await ctx.newPage();
      await page.goto(base);
      await page.waitForFunction(() => window.SQ && SQ.d && !document.getElementById("boot"));
      await go(page, "squads");
      await page.waitForSelector(".sq-live-orb");
      assert.strictEqual(await page.$eval(".sq-live-orb", (el) => getComputedStyle(el).animationName), "none", "orb still");
      await go(page, "taste-edit", { tbSheet: { kind: "fresh", screen: "taste-edit" } });
      await page.waitForSelector(".fr-sheet");
      assert.strictEqual(await page.$eval(".fr-sheet", (el) => getComputedStyle(el).animationName), "none", "sheet appears without sliding");
      await ctx.close();
    });
    lac.abort();
  } finally {
    for (const s of streams) s.abort();
    await browser.close();
    restore();
    console.log(failures ? `${failures} feature check(s) failed` : "All feature checks passed");
    process.exit(failures ? 1 : 0);
  }
})().catch((err) => {
  console.log(`FAIL  ${err.stack || err.message}`);
  restore();
  process.exit(1);
});
