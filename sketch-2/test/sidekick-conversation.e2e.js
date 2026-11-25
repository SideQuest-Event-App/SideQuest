// Sidekick as a conversation, in the browser at 375 px:
//   (a) "what I heard" chips appear when a fact lands from speech, with an undo that takes the answer back
//       (and never show a private answer)
//   (b) voice first: in lead mode a voice phone sees the question card only after about 5 s with no
//       spoken answer; a text phone sees it straight away
//   (c) typing reads like a group chat: Sidekick's replies in a thread, with quick replies that answer
//   (d) progress follows the conversation ("Night ✓ · Vibe · Picks"), and the full board is one tap away
//   (e) a closing recap: the plan, "Add to calendar" (a real .ics built in the page) and "Share to chat"
// Also checks the accessibility basics on each view and takes screenshots.
//
//   NODE_PATH=/opt/node-tools/node_modules node test/sidekick-conversation.e2e.js
//   SHOTS=/some/dir to choose where the screenshots go

const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const assert = require("assert");

let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(path.join("/opt/node-tools/node_modules", "playwright"))); }

const ROOT = path.join(__dirname, "..");
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), "sk-convo-shots");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sk-convo-"));
let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS  ${name}`); } catch (err) { failures++; console.log(`FAIL  ${name}\n      ${String(err.stack || err.message).split("\n").slice(0, 4).join("\n      ")}`); }
}
const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (err) { last = err.message; } await wait(25); }
  throw new Error(`Timed out waiting for ${what} (last: ${JSON.stringify(last)})`);
}

// Layout and accessibility basics for whatever is on screen
async function a11y(page, where) {
  const m = await page.evaluate(() => {
    window.scrollTo(0, document.scrollingElement.scrollHeight);
    const dock = document.getElementById("dock");
    const dockTop = dock && !dock.hidden ? dock.getBoundingClientRect().top : window.innerHeight;
    // The full-screen call's card area scrolls inside itself: measure the area, not what's inside it
    const content = [...document.querySelectorAll(document.body.classList.contains("sk-live") ? "#body" : "#body > *, #ticks > *")].filter((e) => e.offsetParent);
    const bottom = Math.max(0, ...content.map((e) => e.getBoundingClientRect().bottom));
    const els = [...document.querySelectorAll("#app *")].filter((e) => e.offsetParent && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest(".sr"));
    const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
    const weights = [...new Set(els.map((e) => getComputedStyle(e).fontWeight))];
    const small = [...document.querySelectorAll(".hc-x, .chips.quick .chip, #planToggle, #addCal, #sharePlanBtn, .ans")].filter((b) => b.offsetParent).map((b) => { const r = b.getBoundingClientRect(); const pad = b.classList.contains("hc-x") ? 8 : 0; return Math.min(r.width, r.height) + pad; });
    window.scrollTo(0, 0);
    return { overflow: document.scrollingElement.scrollWidth - window.innerWidth, bottom, dockTop, minSize: Math.min(...sizes), weights, minTarget: small.length ? Math.min(...small) : 44 };
  });
  assert(m.overflow <= 0, `${where}: no sideways scroll (${m.overflow}px)`);
  assert(m.bottom <= m.dockTop + 0.5, `${where}: nothing under the dock (${m.bottom} vs ${m.dockTop})`);
  assert(m.minSize >= 12, `${where}: text 12px or larger (${m.minSize})`);
  assert(m.weights.every((w) => ["400", "500", "600"].includes(w)), `${where}: weights 400/500/600 (${m.weights})`);
  assert(m.minTarget >= 44, `${where}: 44px targets (${m.minTarget})`);
}

(async () => {
  const port = await freePort();
  Object.assign(process.env, { PORT: String(port), SIDEKICK_USAGE_FILE: path.join(tmp, "usage.json"), AI: "off", ANTHROPIC_API_KEY: "", SIDEKICK_STUN_URL: "off", SIDEKICK_PLACES_OFF: "1", SIDEKICK_ELEVENLABS_OFF: "1" });
  delete process.env.SUPABASE_URL;
  delete process.env.ELEVENLABS_API_KEY;
  for (const k of ["log", "error", "warn", "info"]) {
    const orig = console[k].bind(console);
    console[k] = (...args) => { const t = args.map(String).join(" "); if (/^(PASS|FAIL|All passed|\d+ failed|\s)/.test(t)) orig(...args); };
  }
  require(path.join(ROOT, "server.js"));
  const R = require(path.join(ROOT, "lib", "sidekick", "rooms"));
  const T = R._test;
  const P = require(path.join(ROOT, "lib", "sidekick", "plan"));
  const base = `http://localhost:${port}`;
  await until(() => fetch(`${base}/api/sk/nights`).then((r) => r.ok), 30000, "the server");
  const post = (p, body) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
  const nights = (await (await fetch(`${base}/api/sk/nights`)).json()).nights.filter((n) => n.events > 0);
  const FRI = (nights.find((n) => /^Fri/.test(n.label)) || nights[0]).date;
  const SAT = (nights.find((n) => /^Sat/.test(n.label)) || nights[1]).date;

  // A call in lead mode: Asia (planner, voice), Maya (voice, private budget $20), Jay (typing)
  const made = (await post("/api/sk/rooms", { name: "Asia", crew: "Sat squad", nights: [FRI, SAT], persona: "friend" })).body;
  const rid = made.room;
  const room = T.rooms.get(rid);
  const maya = (await post(`/api/sk/rooms/${rid}/join`, { name: "Maya", mode: "voice", answers: { budget: "20", nos: ["Etobicoke"], origin: "union" } })).body.person;
  const jay = (await post(`/api/sk/rooms/${rid}/join`, { name: "Jay", mode: "text", answers: { budget: "50", origin: "union" } })).body.person;
  T.setAnswer(room, room.people[0], "budget", "50", "call_card");
  T.setAnswer(room, room.people[0], "origin", "union", "call_card");
  await wait(400);
  await until(() => !room.thinking, 3000, "the engine to settle");
  clearTimeout(room.timer);
  clearTimeout(room.modeTimer);
  room.mode = "lead";
  room.modeSetAt = Date.now();
  room.card = null;
  room.said = [];

  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const errors = [];
  const open = async (pid, mode) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, permissions: ["microphone"], acceptDownloads: true });
    await ctx.addInitScript(([r, p, m]) => {
      localStorage.setItem(`sk:${r}`, JSON.stringify({ person: p, mode: m }));
      if (window.speechSynthesis) { window.speechSynthesis.speak = () => {}; window.speechSynthesis.cancel = () => {}; }
    }, [rid, pid, mode]);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${base}/sk/${rid}`);
    await page.waitForSelector("#dock .ctrls", { timeout: 8000 });
    return page;
  };
  try {
    const asia = await open(made.person, "voice");
    const jayPage = await open(jay, "text");
    // Sidekick opens with the room and one open question; its card goes up now
    await T.think(room);
    const asked = Date.now();

    await test("(b) Voice first: the voice phone waits about 5 s for a spoken answer; the text phone sees the card straight away", async () => {
      assert(room.card && room.card.slot === "night", `the night card is up (${JSON.stringify(room.card)})`);
      await jayPage.waitForSelector(".q [data-answer]", { timeout: 2000 });
      const jayAt = Date.now() - asked;
      await asia.waitForSelector(".q.listen", { timeout: 2000 });
      assert.strictEqual(await asia.locator(".q [data-answer]").count(), 0, "no tap options yet on the voice phone");
      await asia.waitForSelector(".q [data-answer]", { timeout: 8000 });
      const asiaAt = Date.now() - asked;
      assert(jayAt < 2000, `text phone: ${jayAt} ms`);
      assert(asiaAt >= 4500 && asiaAt <= 7500, `voice phone: ${asiaAt} ms (about 5 s)`);
    });

    await test("(d) Progress follows the conversation, and the full board is one tap away", async () => {
      const prog = await asia.textContent(".bh .prog");
      assert(/Night\s*·\s*Vibe\s*·\s*Picks/.test(prog.replace(/\s+/g, " ")), `progress: ${prog}`);
      assert.strictEqual(await asia.locator(".bh .dots").count(), 0, "no slot checklist dots");
      // Folded by default in the full-screen call, one tap away
      assert(await asia.locator("#planRows").isHidden(), "the full board starts folded");
      assert.strictEqual(await asia.getAttribute("#planToggle", "aria-expanded"), "false");
      await asia.click("#planToggle");
      assert(await asia.locator("#planRows").isVisible(), "it opens");
      await asia.click("#planToggle");
      assert(await asia.locator("#planRows").isHidden(), "and folds away again");
    });

    await test("(a) A spoken fact shows as a chip ('Maya: Saturday') with an undo that takes Maya's answer back", async () => {
      await post(`/api/sk/rooms/${rid}/line`, { p: maya, text: "Saturday works for me, I'm broke till then", kind: "spoken" });
      await until(() => room.answers[maya].night, 4000, "Maya's night");
      await asia.waitForSelector(".hc", { timeout: 4000 });
      const chip = (await asia.textContent(".hc")).replace(/\s+/g, " ").trim();
      assert(/Maya: Saturday/.test(chip), `chip: ${chip}`);
      const all = await asia.evaluate(() => document.body.innerText);
      assert(!/\$\s?20|Etobicoke/.test(all.replace(/Under \$\d+ for the group/g, "")), "no private answer on screen (a group limit is fine)");
      fs.mkdirSync(SHOTS, { recursive: true });
      await wait(400); // past the chip's short fade-in
      await asia.screenshot({ path: path.join(SHOTS, "mid-call-heard-chips.png") });
      await a11y(asia, "mid-call board");
      await asia.click(".hc-x");
      await until(() => !room.answers[maya].night, 3000, "Maya's night taken back");
      await asia.waitForFunction(() => !document.querySelector(".hc"), null, { timeout: 3000 });
      // A chip fades on its own after about 6 s
      await post(`/api/sk/rooms/${rid}/line`, { p: maya, text: "ok saturday", kind: "spoken" });
      await asia.waitForSelector(".hc", { timeout: 4000 });
      await asia.waitForFunction(() => !document.querySelector(".hc"), null, { timeout: 9000 });
    });

    await test("(c) Typing reads like a group chat: Sidekick's replies in the chat sheet (messages only), answers on the card", async () => {
      await jayPage.click("#chatBtn");
      await jayPage.waitForSelector("#chatSheet .chat .thread .msg.sk", { timeout: 4000 });
      assert.strictEqual(await jayPage.locator("#chatSheet .chip").count(), 0, "no answer chips in the chat");
      const sk = await jayPage.locator(".chat .msg.sk .msg-t").last().textContent();
      const spoken = room.said.filter((x) => !x.system).slice(-1)[0];
      assert(sk.split(/\s+/).length <= spoken.text.split(/\s+/).length, `text version is no longer than the spoken one: "${sk}" vs "${spoken.text}"`);
      // Jay types his answer; it counts and lands in the thread
      await jayPage.fill("#chatLine", "Saturday works for me");
      await jayPage.press("#chatLine", "Enter");
      await until(() => room.answers[jay].night && room.answers[jay].night.value.includes(SAT), 6000, "Jay's typed answer to count");
      await jayPage.waitForFunction(() => [...document.querySelectorAll(".msg.me .msg-t")].some((m) => /Saturday/.test(m.textContent)), null, { timeout: 4000 });
      // Jay types; Sidekick's next line lands in the thread
      await post(`/api/sk/rooms/${rid}/line`, { p: maya, text: "saturday after 6 for me", kind: "spoken" });
      room.lastSaidAt = 0;
      await until(() => room.card && room.card.slot !== "night", 6000, "the next question");
      await jayPage.waitForFunction((n) => document.querySelectorAll(".chat .msg.sk").length >= n, 2, { timeout: 5000 });
      await jayPage.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
      await wait(400);
      await jayPage.screenshot({ path: path.join(SHOTS, "chat-thread.png") });
      await a11y(jayPage, "chat thread");
    });

    await test("(e) The closing moment: a recap card with a working .ics and share to chat, and one warm goodbye", async () => {
      for (const p of room.people) {
        T.setAnswer(room, p, "night", [SAT], "call_card");
        T.setAnswer(room, p, "time", ["evening", "late"], "call_card");
        T.setAnswer(room, p, "vibe", ["music"], "call_card");
      }
      await post(`/api/sk/rooms/${rid}/ask`, { p: made.person });
      await until(() => room.picks && room.picks.length === 2, 15000, "the picks");
      await post(`/api/sk/rooms/${rid}/vote`, { p: maya, eventId: room.picks[0].id });
      await post(`/api/sk/rooms/${rid}/lock`, { p: made.person, eventId: room.picks[0].id });
      await asia.waitForSelector(".recap #addCal", { timeout: 6000 });
      const title = room.locked.title;
      assert((await asia.textContent("#recapTitle")).trim() === title, "the recap names the plan");
      assert(/3 going/.test(await asia.textContent("#doneMeta")), "who's going");
      const [dl] = await Promise.all([asia.waitForEvent("download", { timeout: 5000 }), asia.click("#addCal")]);
      const file = path.join(tmp, "plan.ics");
      await dl.saveAs(file);
      const ics = fs.readFileSync(file, "utf8");
      assert(/\.ics$/.test(dl.suggestedFilename()), `file name: ${dl.suggestedFilename()}`);
      for (const want of [/^BEGIN:VCALENDAR\r\n/, /BEGIN:VEVENT/, /DTSTART[:;]/, /DTEND[:;]/, /END:VCALENDAR\r\n$/]) assert(want.test(ics), `ics has ${want}`);
      const summary = (ics.match(/SUMMARY:(.*)\r\n/) || [])[1] || "";
      assert(summary.replace(/\\([,;\\])/g, "$1") === title, `SUMMARY is the plan: ${summary}`);
      if (room.locked.startsAt) {
        const d = new Date(room.locked.startsAt);
        const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}00Z`;
        assert(ics.includes(`DTSTART:${stamp}`), `starts at the event time (${stamp})`);
      }
      assert(!/\$\s?20\b|Etobicoke/.test(ics), "no private answer in the calendar file");
      assert(await asia.locator("#planShare").isHidden(), "share options start folded");
      await asia.click("#sharePlanBtn");
      assert(await asia.locator("#planShare").isVisible(), "share options open");
      const wa = await asia.getAttribute('#planShare a[href^="https://wa.me/"]', "href");
      assert(decodeURIComponent(wa).includes(title), "the WhatsApp share carries the plan");
      await until(() => room.said.some((x) => x.move === "wrap"), 9000, "the goodbye line");
      const bye = room.said.filter((x) => x.move === "wrap").pop().text;
      assert(/see you|have the best|enjoy|lovely/i.test(bye), `a warm goodbye: ${bye}`);
      await asia.waitForFunction((t) => document.getElementById("doneSay").textContent.includes(t.slice(0, 20)), bye, { timeout: 4000 });
      await asia.screenshot({ path: path.join(SHOTS, "recap.png") });
      await asia.screenshot({ path: path.join(SHOTS, "recap-full.png"), fullPage: true });
      await a11y(asia, "recap");
    });

    await test("No page errors", async () => {
      assert.deepStrictEqual(errors, []);
    });
    console.log(`      screenshots: ${SHOTS}`);
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(failures ? `\n${failures} failed` : "\nAll passed");
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
})();
