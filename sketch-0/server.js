// Sketch 0 — interests in (yours, or your whole crew's), matching Toronto events out.
// Zero dependencies: needs Node 18+ only. Run with `node server.js`.

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

// --- Load .env (so the API key never lives in the code) ---
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-haiku-4-5-20251001";
const events = JSON.parse(fs.readFileSync(path.join(__dirname, "events.json"), "utf8"));

// Local logs (not committed). One JSON object per line.
const goingLogPath = path.join(__dirname, "going-log.jsonl"); // "I'd go" taps: intent, not attendance
const attendedLogPath = path.join(__dirname, "attended-log.jsonl"); // "Did you go?" answers
const searchLogPath = path.join(__dirname, "search-log.jsonl"); // every search, with interests nothing matched
const feedbackLogPath = path.join(__dirname, "feedback-log.jsonl"); // "Not for me" taps on picks
const requestsPath = path.join(__dirname, "requests.json"); // Quest Requests, upvotes and host claims
const sampleRequestsPath = path.join(__dirname, "sample-requests.json"); // starting requests for a fresh sketch

const MAX_CREW = 4;
const ORIGINS = ["union", "finch", "kennedy", "kipling"];

// Is the `claude` command installed? (checked once at startup)
let claudeCodeAvailable = false;
try {
  require("child_process").execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 15000 });
  claudeCodeAvailable = true;
} catch {}

// --- The instructions we give the AI ---
// The team's product strategy lives in strategy.md so it can be edited without touching code.
// Read on every request, so edits apply without restarting the server.
const strategyPath = path.join(__dirname, "strategy.md");
function loadStrategy() {
  try {
    return fs.readFileSync(strategyPath, "utf8").trim();
  } catch {
    console.warn("strategy.md not found — matching without it");
    return "";
  }
}

// --- Budget and travel limits are applied here, before any matching ---
// So nothing over budget or too far away can be picked, by the AI or by keywords.
// Each person can start from a different place; an event has to be within reach for all of them.
function applyLimits({ budget, origins, maxMinutes }) {
  const excluded = {}; // event id -> "price" | "travel"
  const pool = events.filter((e) => {
    if (budget != null && e.price > budget) {
      excluded[e.id] = "price";
      return false;
    }
    if (origins.length && maxMinutes) {
      const tooFar = origins.some((o) => {
        const trip = e.travel && e.travel.from[o];
        return !trip || trip.minutes > maxMinutes;
      });
      if (tooFar) {
        excluded[e.id] = "travel";
        return false;
      }
    }
    return true;
  });
  return { pool, excluded };
}

const STOPWORDS = new Set(["and", "the", "for", "with", "into", "like", "love", "stuff", "things", "anything", "really"]);

function wordsOf(text) {
  return [...new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)))];
}

// Words that describe the format, not the interest: "vegan food" and "vegan" are the same ask
const GENERIC = new Set(["food", "night", "nights", "event", "events", "class", "classes", "music", "show", "shows", "session", "sessions", "meetup", "meetups", "club", "group", "scene", "local", "toronto"]);

// The words that identify an interest, singular and without format words, for merging similar asks
function coreWords(text) {
  const words = wordsOf(text).map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  const core = words.filter((w) => !GENERIC.has(w));
  return core.length ? core : words;
}

function haystack(e) {
  return `${e.title} ${e.description} ${e.tags.join(" ")} ${e.scene}`.toLowerCase();
}

// "jazz, climbing and zines" -> ["jazz", "climbing", "zines"]
function phrasesOf(text) {
  return text
    .split(/,|;|\n|\/|\band\b|&/i)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 1);
}

function buildPrompt(people, pool) {
  const strategy = loadStrategy();
  const crew = people.length > 1;
  const ORIGIN_NAMES = { union: "Union", finch: "Finch", kennedy: "Kennedy", kipling: "Kipling" };
  const who = people
    .map((p) => `- ${p.name}: "${p.interests}"${p.origin ? ` (starting from ${ORIGIN_NAMES[p.origin] || p.origin}; their trip is travel.from.${p.origin})` : ""}`)
    .join("\n");
  return `${strategy ? `You are the event-matching step of our app. Our product strategy is below; let it guide which events you pick and how you explain them.
<strategy>
${strategy}
</strategy>

` : ""}${crew ? `A group of ${people.length} friends in Toronto want to go out together. Each described their interests:` : "A person in Toronto described their interests as:"}
${who}

Here are the upcoming events that already fit ${crew ? "the group's" : "their"} budget and travel limits (JSON). "price" is in Canadian dollars; 0 means free.
${JSON.stringify(pool)}

Pick up to 5 events that best match${crew ? " the whole group. Prefer events every person would enjoy over ones that suit only one person" : " their interests"}. For each, write one short, specific sentence explaining why it's a good pick.
Each event's "friends" field lists friends who are going, and "organizer" has the organizer's rating and a review.
Where it helps, work in a detail from the reviews, the price, the trip, or who's going (e.g. "it's free, and your friend Priya is going").${crew && people.some((p) => p.origin) ? `
Friends start from different places. Prefer events that are an easy trip for everyone, not a short trip for one and a long one for another.` : ""}
Only use reviews, organizer and attendee details that appear in the event data; never invent any.
Only choose from the list. If fewer than 5 are a genuine fit, return fewer.${crew ? `
For each pick, also give "fits": an object with one key per person (${people.map((p) => JSON.stringify(p.name)).join(", ")}) whose value is a few words on why it suits them, or "" if it doesn't really suit them.` : ""}
Finally, list in "unmet" every interest (copy the person's own wording, as a short phrase) that none of these events fits well.
Respond with JSON only, no other text, in this shape:
{"matches": [{"id": <event id>, "reason": "<one sentence>"${crew ? `, "fits": {"<name>": "<few words>"}` : ""}}], "unmet": [{"person": "<name>", "interest": "<phrase>"}]}`;
}

// Turn the AI's text answer into full event objects. Only events in the pool count,
// so the AI can't sneak in something over budget or too far away.
function parseAnswer(text, pool) {
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  const matches = (json.matches || [])
    .map((m) => {
      const event = pool.find((e) => e.id === m.id);
      return event && { ...event, reason: m.reason, fits: m.fits };
    })
    .filter(Boolean);
  const unmet = (json.unmet || [])
    .filter((u) => u && typeof u.interest === "string" && u.interest.trim())
    .map((u) => ({ person: String(u.person || ""), interest: u.interest.trim().toLowerCase() }));
  return { matches, unmet };
}

// --- Option A (default): ask Claude Code, using your Claude subscription ---
function matchWithClaudeCode(people, pool) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      ["-p", buildPrompt(people, pool), "--output-format", "json"],
      { cwd: os.tmpdir(), timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let out = null;
        try {
          out = JSON.parse(stdout);
        } catch {}

        if (err || (out && out.is_error)) {
          if (err && err.code === "ENOENT") claudeCodeAvailable = false;
          // Show the real reason, not just the first warning line
          const cleanStderr = (stderr || "")
            .split("\n")
            .filter((l) => l.trim() && !l.includes("no stdin data received"))
            .join(" ");
          const reason =
            (out && out.result) ||
            cleanStderr ||
            (stdout || "").trim() ||
            (err && err.killed ? "it took longer than 2 minutes" : err && err.message) ||
            "unknown error";
          console.error("Claude Code error details:", { code: err && err.code, stdout, stderr });
          return reject(new Error(`Claude Code failed: ${reason}`));
        }
        try {
          resolve(parseAnswer(out && typeof out.result === "string" ? out.result : stdout, pool));
        } catch {
          reject(new Error("The AI's answer wasn't in the expected format. Try again."));
        }
      }
    );
    // Close stdin so Claude Code doesn't wait for piped input
    child.stdin.end();
  });
}

// --- Option B: call the Anthropic API directly (only if a key is in .env) ---
async function matchWithAPI(people, pool) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: buildPrompt(people, pool) }],
    }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const text = data.content.map((c) => c.text || "").join("");
  try {
    return parseAnswer(text, pool);
  } catch {
    throw new Error("The AI's answer wasn't in the expected format. Try again.");
  }
}

// --- Fallback when there's no AI: plain keyword overlap (NOT AI) ---
// For a crew, events that match more people rank first.
function matchWithKeywords(people, pool) {
  const crew = people.length > 1;
  const matches = pool
    .map((e) => {
      const hay = haystack(e);
      const fits = {};
      let fitCount = 0;
      let hitTotal = 0;
      const allHits = [];
      for (const p of people) {
        const hits = wordsOf(p.interests).filter((w) => hay.includes(w));
        fits[p.name] = hits.length ? `Mentions ${hits.join(", ")}` : "";
        if (hits.length) fitCount++;
        hitTotal += hits.length;
        allHits.push(...hits);
      }
      const reason = crew
        ? `Matches ${fitCount} of ${people.length} of you by keyword.`
        : `Mentions: ${[...new Set(allHits)].join(", ")}`;
      return { ...e, fitCount, hitTotal, reason, fits: crew ? fits : undefined };
    })
    .filter((e) => e.fitCount > 0)
    // Ties go to events with friends going, then cheaper, then better-reviewed, then busier ones
    .sort(
      (a, b) =>
        b.fitCount - a.fitCount ||
        b.hitTotal - a.hitTotal ||
        (b.friends || []).length - (a.friends || []).length ||
        a.price - b.price ||
        (b.rating || 0) - (a.rating || 0) ||
        (b.going || 0) - (a.going || 0)
    )
    .slice(0, 5);

  // An interest is unmet when none of its words appear in any event that fits the limits
  const unmet = [];
  for (const p of people) {
    for (const phrase of phrasesOf(p.interests)) {
      const words = wordsOf(phrase);
      if (words.length && !pool.some((e) => words.some((w) => haystack(e).includes(w)))) {
        unmet.push({ person: p.name, interest: phrase });
      }
    }
  }
  return { matches, unmet };
}

// Why was an interest unmet? If matching events exist but were cut by the limits,
// hosts learn the demand is there and the barrier is price or distance.
function unmetReason(interest, excluded) {
  const words = wordsOf(interest);
  const cut = events.filter((e) => excluded[e.id] && words.some((w) => haystack(e).includes(w)));
  if (!cut.length) return "none";
  return cut.some((e) => excluded[e.id] === "price") ? "price" : "travel";
}

// Read the request's people list into a clean shape
function readPeople(raw) {
  const people = (Array.isArray(raw) ? raw : [])
    .slice(0, MAX_CREW)
    .map((p, i) => ({
      name: String((p && p.name) || "").trim().slice(0, 30) || (i === 0 ? "You" : `Friend ${i + 1}`),
      interests: String((p && p.interests) || "").trim().slice(0, 300),
      budget: p && p.budget !== "" && p.budget != null && Number.isFinite(Number(p.budget)) ? Number(p.budget) : null,
      origin: p && typeof p.origin === "string" && ORIGINS.includes(p.origin) ? p.origin : "",
    }));
  if (!people.length || people.some((p) => !p.interests)) {
    throw new Error(people.length > 1 ? "Add interests for everyone in your crew, or remove someone." : "Please enter some interests.");
  }
  // Two friends with the same name would collide in "fits"
  const seen = new Set();
  for (const p of people) {
    let name = p.name;
    for (let n = 2; seen.has(name); n++) name = `${p.name} ${n}`;
    p.name = name;
    seen.add(name);
  }
  return people;
}

async function handleMatch(body) {
  const people = readPeople(body.people);
  const origins = [...new Set(people.map((p) => p.origin).filter(Boolean))];
  const maxMinutes = Number(body.maxMinutes) || null;

  // The group's budget is the lowest budget anyone set
  const budgeted = people.filter((p) => p.budget != null);
  const budget = budgeted.length ? Math.min(...budgeted.map((p) => p.budget)) : null;
  const budgetSetBy =
    people.length > 1 && budgeted.length && new Set(people.map((p) => p.budget)).size > 1
      ? budgeted.find((p) => p.budget === budget).name
      : null;

  const { pool, excluded } = applyLimits({ budget, origins, maxMinutes });
  const excludedPrice = Object.values(excluded).filter((r) => r === "price").length;

  let mode, result;
  if (!pool.length) {
    mode = API_KEY || claudeCodeAvailable ? "ai" : "keywords";
    const unmet = people.flatMap((p) => phrasesOf(p.interests).map((interest) => ({ person: p.name, interest })));
    result = { matches: [], unmet };
  } else if (API_KEY) {
    mode = "ai";
    result = await matchWithAPI(people, pool);
  } else if (claudeCodeAvailable) {
    mode = "ai";
    result = await matchWithClaudeCode(people, pool);
  } else {
    mode = "keywords";
    result = matchWithKeywords(people, pool);
  }

  const unmet = result.unmet.map((u) => ({ ...u, reason: unmetReason(u.interest, excluded) }));

  fs.appendFileSync(
    searchLogPath,
    JSON.stringify({
      time: new Date().toISOString(),
      mode,
      people: people.map((p) => ({ interests: p.interests, budget: p.budget, origin: p.origin })),
      budget,
      origins,
      maxMinutes,
      matchedIds: result.matches.map((m) => m.id),
      unmet,
    }) + "\n"
  );

  return {
    mode,
    matches: result.matches,
    unmet,
    people: people.map((p) => p.name),
    origins: Object.fromEntries(people.map((p) => [p.name, p.origin])),
    limits: {
      budget,
      budgetSetBy,
      origins,
      maxMinutes,
      fit: pool.length,
      total: events.length,
      excludedPrice,
      excludedTravel: Object.keys(excluded).length - excludedPrice,
    },
  };
}

function readLog(file) {
  try {
    return fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

// --- Quest Requests: explicit asks, upvotes and host claims ---
// Stored in requests.json (local, not committed), started from sample-requests.json.
function loadRequests() {
  for (const file of [requestsPath, sampleRequestsPath]) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {}
  }
  return [];
}
function saveRequests(list) {
  fs.writeFileSync(requestsPath, JSON.stringify(list, null, 2) + "\n");
}

const WHEN = ["Weeknights", "Fridays", "Saturdays", "Sundays", "Any time"];
const CREW_SIZES = ["Solo", "2 to 4", "5+"];

function createRequest(body) {
  const text = String(body.text || "").trim().slice(0, 120);
  if (!text) throw new Error("Say what kind of quest you'd go to.");
  const list = loadRequests();
  // Asking for something already requested counts as an upvote, so demand isn't split
  const key = coreWords(text).sort().join(" ");
  const same = list.find((r) => r.status !== "live" && coreWords(r.text).sort().join(" ") === key);
  if (same) {
    same.votes++;
    saveRequests(list);
    return { request: same, merged: true };
  }
  const budget = body.budget !== "" && body.budget != null && Number.isFinite(Number(body.budget)) ? Number(body.budget) : null;
  const request = {
    id: list.reduce((m, r) => Math.max(m, r.id), 0) + 1,
    time: new Date().toISOString(),
    text,
    origin: ORIGINS.includes(body.origin) ? body.origin : "",
    when: WHEN.includes(body.when) ? body.when : "Any time",
    size: CREW_SIZES.includes(body.size) ? body.size : "Solo",
    budget,
    source: body.source === "gap" ? "gap" : "manual", // "gap" = came from a search nothing fit
    votes: 1,
    status: "open", // open -> claimed
    claimedBy: null,
  };
  list.push(request);
  saveRequests(list);
  return { request, merged: false };
}

// --- Demand Signals: what hosts would see ---
function demandReport() {
  const searches = readLog(searchLogPath);

  // Merge similar wording: "vegan food", "vegan" and "vegans" are one ask
  const byInterest = new Map();
  for (const s of searches) {
    const searchOrigins = s.origins || (s.origin ? [s.origin] : []);
    for (const u of s.unmet || []) {
      const key = coreWords(u.interest).sort().join(" ") || u.interest;
      const row = byInterest.get(key) || { key, wordings: {}, asks: 0, reasons: { none: 0, price: 0, travel: 0 }, budgets: [], origins: {} };
      row.asks++;
      row.wordings[u.interest] = (row.wordings[u.interest] || 0) + 1;
      row.reasons[u.reason] = (row.reasons[u.reason] || 0) + 1;
      if (s.budget != null) row.budgets.push(s.budget);
      for (const o of searchOrigins) row.origins[o] = (row.origins[o] || 0) + 1;
      byInterest.set(key, row);
    }
  }
  const unmet = [...byInterest.values()]
    .sort((a, b) => b.asks - a.asks)
    .slice(0, 15)
    .map(({ key, wordings, budgets, origins, ...row }) => {
      const phrasings = Object.entries(wordings).sort((a, b) => b[1] - a[1]).map(([w]) => w);
      return {
        ...row,
        interest: phrasings[0],
        alsoAs: phrasings.slice(1),
        minBudget: budgets.length ? Math.min(...budgets) : null,
        maxBudget: budgets.length ? Math.max(...budgets) : null,
        anyBudget: budgets.length < row.asks,
        topOrigin: Object.entries(origins).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
      };
    });

  // Intent ("I'd go") next to confirmed attendance and satisfaction, so hosts see honest numbers
  const perEvent = new Map();
  const row = (id) => {
    if (!perEvent.has(id)) {
      const e = events.find((x) => x.id === id);
      perEvent.set(id, { id, title: e ? e.title : `Event ${id}`, organizer: e && e.organizer ? e.organizer.name : "", interested: 0, went: 0, didntGo: 0, ratings: [], notForMe: 0 });
    }
    return perEvent.get(id);
  };
  for (const g of readLog(goingLogPath)) row(g.eventId).interested++;
  for (const a of readLog(attendedLogPath)) {
    if (a.attended) {
      row(a.eventId).went++;
      if (a.rating) row(a.eventId).ratings.push(a.rating);
    } else row(a.eventId).didntGo++;
  }
  for (const f of readLog(feedbackLogPath)) row(f.eventId).notForMe++;

  const requests = loadRequests().sort((a, b) => b.votes - a.votes);
  return {
    searches: searches.length,
    searchesWithGaps: searches.filter((s) => (s.unmet || []).length).length,
    openRequests: requests.filter((r) => r.status === "open").length,
    unmet,
    requests,
    events: [...perEvent.values()]
      .map(({ ratings, ...e }) => ({ ...e, rated: ratings.length, avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null }))
      .sort((a, b) => b.interested - a.interested),
    hosts: [...new Set(events.map((e) => e.organizer && e.organizer.name).filter(Boolean))].sort(),
  };
}

// --- Tiny web server ---
function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/match") {
    try {
      sendJSON(res, 200, await handleMatch(await readBody(req)));
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: err.message });
    }
    return;
  }

  // "I'd go" taps: a first signal of intent (not attendance)
  if (req.method === "POST" && req.url === "/api/going") {
    const { id, interests, crewSize } = await readBody(req);
    const event = events.find((e) => e.id === id);
    if (!event) return sendJSON(res, 400, { error: "Unknown event." });
    const entry = { time: new Date().toISOString(), eventId: id, title: event.title, interests: String(interests || ""), crewSize: Number(crewSize) || 1 };
    fs.appendFileSync(goingLogPath, JSON.stringify(entry) + "\n");
    return sendJSON(res, 200, { ok: true });
  }

  // "Did you go?" answers: the attendance our north star actually counts, plus a satisfaction rating
  if (req.method === "POST" && req.url === "/api/attended") {
    const { id, attended, rating, tags } = await readBody(req);
    const event = events.find((e) => e.id === id);
    if (!event) return sendJSON(res, 400, { error: "Unknown event." });
    const stars = Number(rating);
    const entry = { time: new Date().toISOString(), eventId: id, attended: !!attended };
    if (attended && stars >= 1 && stars <= 5) entry.rating = Math.round(stars);
    if (attended && Array.isArray(tags)) entry.tags = tags.map(String).slice(0, 6);
    fs.appendFileSync(attendedLogPath, JSON.stringify(entry) + "\n");
    return sendJSON(res, 200, { ok: true });
  }

  // "Not for me" on a pick: the person correcting the AI
  if (req.method === "POST" && req.url === "/api/feedback") {
    const { id, person, interests } = await readBody(req);
    const event = events.find((e) => e.id === id);
    if (!event) return sendJSON(res, 400, { error: "Unknown event." });
    const entry = { time: new Date().toISOString(), eventId: id, title: event.title, person: String(person || "").slice(0, 30), interests: String(interests || "").slice(0, 300) };
    fs.appendFileSync(feedbackLogPath, JSON.stringify(entry) + "\n");
    return sendJSON(res, 200, { ok: true });
  }

  // Quest Requests
  if (req.method === "GET" && req.url === "/api/requests") {
    return sendJSON(res, 200, { requests: loadRequests().sort((a, b) => b.votes - a.votes) });
  }
  if (req.method === "POST" && req.url === "/api/requests") {
    try {
      return sendJSON(res, 200, createRequest(await readBody(req)));
    } catch (err) {
      return sendJSON(res, 400, { error: err.message });
    }
  }
  // Upvote (or take back an upvote)
  if (req.method === "POST" && req.url === "/api/requests/vote") {
    const { id, undo } = await readBody(req);
    const list = loadRequests();
    const r = list.find((x) => x.id === id);
    if (!r) return sendJSON(res, 400, { error: "Unknown request." });
    r.votes = Math.max(0, r.votes + (undo ? -1 : 1));
    saveRequests(list);
    return sendJSON(res, 200, { request: r });
  }
  // A host claims a request ("We're on it"); requesters see it first
  if (req.method === "POST" && req.url === "/api/requests/claim") {
    const { id, host, undo } = await readBody(req);
    const list = loadRequests();
    const r = list.find((x) => x.id === id);
    if (!r) return sendJSON(res, 400, { error: "Unknown request." });
    if (undo) Object.assign(r, { status: "open", claimedBy: null, claimedAt: null });
    else if (r.status === "open") Object.assign(r, { status: "claimed", claimedBy: String(host || "A host").slice(0, 60), claimedAt: new Date().toISOString() });
    saveRequests(list);
    return sendJSON(res, 200, { request: r });
  }

  if (req.method === "GET" && req.url === "/api/demand") {
    return sendJSON(res, 200, demandReport());
  }

  const file = req.url === "/" ? "index.html" : req.url.split("?")[0].replace(/^\/+/, "");
  const filePath = path.join(__dirname, "public", path.normalize(file));
  if (!filePath.startsWith(path.join(__dirname, "public")) || !fs.existsSync(filePath)) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
  res.writeHead(200, { "content-type": types[path.extname(filePath)] || "text/plain" });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Sketch 0 running at http://localhost:${PORT}`);
  if (API_KEY) console.log(`Matching with AI via the Anthropic API (${MODEL})`);
  else if (claudeCodeAvailable) console.log("Matching with AI via Claude Code (your Claude subscription)");
  else console.log("Claude Code not found and no API key — using keyword matching (not AI)");
});
