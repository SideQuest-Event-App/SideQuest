// Sketch 1 AI: the same three-way setup as Sketch 0.
// Uses, in order: the Anthropic API if .env has a key, otherwise Claude Code (`claude` on your PATH,
// using your Claude subscription), otherwise simple keyword matching (not AI).
// Four jobs: the For You feed (taste avatar), Discover search, Crew Blend, and drafting a quest from a request.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile, execFileSync } = require("child_process");

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-haiku-4-5-20251001";
const ORIGIN_NAMES = { union: "Downtown (Union)", finch: "North York (Finch)", kennedy: "Scarborough (Kennedy)", kipling: "Etobicoke (Kipling)" };

// Is the `claude` command installed? (checked once at startup)
let claudeCodeAvailable = false;
try {
  execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 15000 });
  claudeCodeAvailable = true;
} catch {}

function mode() {
  if (process.env.AI === "off") return "keywords"; // `AI=off node server.js` skips the AI entirely
  if (API_KEY) return "api";
  if (claudeCodeAvailable) return "claude-code";
  return "keywords";
}

// The team's product strategy, re-read on every request so edits apply without a restart
const strategyPath = path.join(__dirname, "..", "strategy.md");
function strategyBlock() {
  try {
    const s = fs.readFileSync(strategyPath, "utf8").trim();
    return s ? `You are part of our app, Sidequest. Our product strategy is below; let it guide what you pick and how you explain it.\n<strategy>\n${s}\n</strategy>\n\n` : "";
  } catch {
    return "";
  }
}

// ---------- The two AI backends ----------
function askClaudeCode(prompt) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "claude",
      ["-p", prompt, "--output-format", "json"],
      { cwd: os.tmpdir(), timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let out = null;
        try {
          out = JSON.parse(stdout);
        } catch {}
        if (err || (out && out.is_error)) {
          if (err && err.code === "ENOENT") claudeCodeAvailable = false;
          const cleanStderr = (stderr || "").split("\n").filter((l) => l.trim() && !l.includes("no stdin data received")).join(" ");
          const reason = (out && out.result) || cleanStderr || (stdout || "").trim() || (err && err.killed ? "it took longer than 2 minutes" : err && err.message) || "unknown error";
          console.error("Claude Code error details:", { code: err && err.code, stdout, stderr });
          return reject(new Error(`Claude Code failed: ${reason}`));
        }
        resolve(out && typeof out.result === "string" ? out.result : stdout);
      }
    );
    child.stdin.end(); // so Claude Code doesn't wait for piped input
  });
}

async function askAPI(prompt, maxTokens) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.content.map((c) => c.text || "").join("");
}

// Ask whichever AI is available and parse its JSON answer. Throws if there's no AI or it fails.
async function askJSON(prompt, maxTokens = 2000) {
  const m = mode();
  if (m === "keywords") throw new Error("No AI available");
  const text = m === "api" ? await askAPI(prompt, maxTokens) : await askClaudeCode(prompt);
  try {
    return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch {
    throw new Error("The AI's answer wasn't in the expected format.");
  }
}

// Run an AI job, falling back to keywords if the AI isn't there or fails, and say which was used
async function withFallback(aiJob, keywordJob) {
  if (mode() === "keywords") return { mode: "keywords", ...keywordJob() };
  try {
    return { mode: mode(), ...(await aiJob()) };
  } catch (err) {
    console.error(err.message);
    return { mode: "keywords", error: err.message, ...keywordJob() };
  }
}

// ---------- Text helpers (shared with the server for merging similar requests) ----------
const STOPWORDS = new Set(["and", "the", "for", "with", "into", "like", "love", "stuff", "things", "anything", "really", "some", "want", "something"]);
function wordsOf(text) {
  return [...new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w)))];
}
// Words that describe the format, not the interest: "vegan food" and "vegan" are the same ask
const GENERIC = new Set(["food", "night", "nights", "event", "events", "class", "classes", "music", "show", "shows", "session", "sessions", "meetup", "meetups", "club", "group", "scene", "local", "toronto"]);
function coreWords(text) {
  const words = wordsOf(text).map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  const core = words.filter((w) => !GENERIC.has(w));
  return core.length ? core : words;
}
// "jazz, climbing and zines" -> ["jazz", "climbing", "zines"]
function phrasesOf(text) {
  return String(text).split(/,|;|\n|\/|\band\b|&/i).map((p) => p.trim().toLowerCase()).filter((p) => p.length > 1);
}
function haystack(e) {
  return `${e.title} ${e.description} ${e.tags.join(" ")} ${(e.vibes || []).join(" ")} ${e.scene}`.toLowerCase();
}
// Vibe names hit if any of their words appear ("Zines & print" hits "zines")
function vibeWords(vibes) {
  return vibes.flatMap((v) => wordsOf(v));
}

// What the AI sees for each event: enough to judge fit, without padding the prompt
function compact(e, origins) {
  const from = {};
  for (const o of origins) if (e.travel && e.travel.from[o]) from[o] = e.travel.from[o];
  return {
    id: e.id,
    title: e.title,
    date: e.date,
    neighbourhood: e.neighbourhood,
    venue: e.venue && e.venue.name,
    listedOn: e.source,
    price: e.price,
    description: String(e.description || "").slice(0, 220),
    vibes: e.vibes,
    tags: e.tags,
    rating: e.rating || undefined,
    reviews: (e.reviews || []).length ? e.reviews.map((r) => r.text) : undefined,
    organizer: e.organizer && { name: e.organizer.name, rating: e.organizer.rating || undefined, review: e.organizer.review || undefined },
    friends: (e.friends || []).length ? e.friends : undefined,
    goingCount: e.going || undefined,
    travel: e.travel && { stop: e.travel.stop, from },
  };
}

// ---------- 1. For You feed: the taste avatar scores every eligible event ----------
// profile: { name, vibes, past, loved: [{title, tags}], disliked: [title], party: [names], origin, budget }
function feed(profile, pool) {
  const origins = profile.origin ? [profile.origin] : [];
  const prompt = `${strategyBlock()}You are Sidequest's "taste avatar" for one person in Toronto. What you know about them:
- Vibes they picked: ${profile.vibes.join(", ") || "none yet"}
- Events they've been to before joining: ${profile.past.join(", ") || "none listed"}
- Quests they rated 4 or 5 stars: ${profile.loved.map((l) => `${l.title}${l.tags.length ? ` (loved ${l.tags.join(", ")})` : ""}`).join("; ") || "none yet"}
- Quests they said "not for me" to, or rated low: ${profile.disliked.join("; ") || "none"}
- Friends in their party: ${profile.party.join(", ") || "none"} (each event's "friends" field lists friends who are going)
${profile.origin ? `- Starting from ${ORIGIN_NAMES[profile.origin]}; their trip is travel.from.${profile.origin}` : ""}
${profile.budget != null ? `- Budget: up to $${profile.budget} (0 means free only)` : ""}

These upcoming events already fit their budget and travel limits (JSON, prices in CAD):
${JSON.stringify(pool.map((e) => compact(e, origins)))}

Give every event a "match" score from 0 to 100 for how much this person would enjoy it. Be discerning: use the full range, and only give 85+ to strong fits.
For each, write "reason": one short, specific sentence (under 20 words) starting the way a friend would ("You picked jazz, and Aiko is going.").
Work in a detail from the event data where it helps: price, an easy trip, a friend going, or a review. Never invent reviews, people or facts.
Also write "avatar": one sentence (under 25 words), in second person, describing their taste as you understand it.
Respond with JSON only, no other text, in this shape:
{"avatar": "<sentence>", "picks": [{"id": <event id>, "match": <0-100>, "reason": "<sentence>"}]}`;

  return withFallback(
    async () => {
      const json = await askJSON(prompt, 3000);
      const picks = {};
      for (const p of json.picks || []) {
        const e = pool.find((x) => x.id === p.id);
        const match = Math.round(Number(p.match));
        if (e && Number.isFinite(match)) picks[e.id] = { match: Math.max(0, Math.min(99, match)), reason: String(p.reason || "").slice(0, 200) };
      }
      return { picks, avatar: String(json.avatar || "").slice(0, 240) };
    },
    () => feedKeywords(profile, pool)
  );
}

function feedKeywords(profile, pool) {
  const picks = {};
  const lovedWords = profile.loved.flatMap((l) => l.vibes || []);
  for (const e of pool) {
    const vibeHits = (e.vibes || []).filter((v) => profile.vibes.includes(v));
    const loved = (e.vibes || []).filter((v) => lovedWords.includes(v)).length;
    const friends = (e.friends || []).filter((f) => profile.party.includes(f));
    const disliked = profile.disliked.includes(e.title);
    let match = 40 + vibeHits.length * 22 + loved * 6 + friends.length * 7 + (e.price === 0 ? 3 : 0) + Math.round(((e.rating || 4) - 4) * 6);
    if (disliked) match -= 30;
    match = Math.max(5, Math.min(97, match));
    const parts = [];
    if (vibeHits.length) parts.push(`you picked ${vibeHits.join(" and ").toLowerCase()}`);
    if (friends.length) parts.push(`${friends.join(" and ")} ${friends.length > 1 ? "are" : "is"} going`);
    if (e.price === 0) parts.push("it's free");
    const reason = parts.length ? parts.join(", ").replace(/^./, (c) => c.toUpperCase()) + "." : "Outside your usual vibes, but well reviewed.";
    picks[e.id] = { match, reason };
  }
  const avatar = profile.vibes.length ? `You lean toward ${profile.vibes.slice(0, 3).join(", ").toLowerCase()}. (Keyword estimate, not AI.)` : "";
  return { picks, avatar };
}

// ---------- 2 + 3. Search and Crew Blend: interests in (one person or a party), picks out ----------
// people: [{ name, interests, origin }]. Same prompt as Sketch 0, so the two sketches stay comparable.
function match(people, pool) {
  const crew = people.length > 1;
  const origins = [...new Set(people.map((p) => p.origin).filter(Boolean))];
  const who = people.map((p) => `- ${p.name}: "${p.interests}"${p.origin ? ` (starting from ${ORIGIN_NAMES[p.origin]}; their trip is travel.from.${p.origin})` : ""}`).join("\n");
  const prompt = `${strategyBlock()}${crew ? `A party of ${people.length} friends in Toronto want to go out together. Each described their interests:` : "A person in Toronto described what they're looking for as:"}
${who}

Here are the upcoming events that already fit ${crew ? "the group's" : "their"} budget and travel limits (JSON). "price" is in Canadian dollars; 0 means free.
${JSON.stringify(pool.map((e) => compact(e, origins)))}

Pick up to 5 events that best match${crew ? " the whole group. Prefer events every person would enjoy over ones that suit only one person" : " what they asked for"}. For each, write one short, specific sentence explaining why it's a good pick, and a "match" score from 0 to 100.
Each event's "friends" field lists friends who are going, and "organizer" has the organizer's rating and a review.
Where it helps, work in a detail from the reviews, the price, the trip, or who's going (e.g. "it's free, and your friend Priya is going").${crew && origins.length > 1 ? `
Friends start from different places. Prefer events that are an easy trip for everyone, not a short trip for one and a long one for another.` : ""}
Only use reviews, organizer and attendee details that appear in the event data; never invent any.
Only choose from the list. If fewer than 5 are a genuine fit, return fewer.${crew ? `
For each pick, also give "fits": an object with one key per person (${people.map((p) => JSON.stringify(p.name)).join(", ")}) whose value is a few words on why it suits them, or "" if it doesn't really suit them.` : ""}
Finally, list in "unmet" every interest (copy the person's own wording, as a short phrase) that none of these events fits well.
Respond with JSON only, no other text, in this shape:
{"matches": [{"id": <event id>, "match": <0-100>, "reason": "<one sentence>"${crew ? `, "fits": {"<name>": "<few words>"}` : ""}}], "unmet": [{"person": "<name>", "interest": "<phrase>"}]}`;

  return withFallback(
    async () => {
      const json = await askJSON(prompt, 1800);
      const matches = (json.matches || [])
        .map((m) => {
          const e = pool.find((x) => x.id === m.id);
          return e && { id: e.id, match: Math.max(0, Math.min(99, Math.round(Number(m.match) || 70))), reason: String(m.reason || ""), fits: m.fits || undefined };
        })
        .filter(Boolean);
      const unmet = (json.unmet || [])
        .filter((u) => u && typeof u.interest === "string" && u.interest.trim())
        .map((u) => ({ person: String(u.person || ""), interest: u.interest.trim().toLowerCase() }));
      return { matches, unmet };
    },
    () => matchKeywords(people, pool)
  );
}

// Plain keyword overlap (NOT AI). For a crew, events that match more people rank first.
function matchKeywords(people, pool) {
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
      const reason = crew ? `Matches ${fitCount} of ${people.length} of you by keyword.` : `Mentions: ${[...new Set(allHits)].join(", ")}`;
      const score = Math.min(95, 45 + Math.round((fitCount / people.length) * 35) + hitTotal * 4);
      return { id: e.id, match: score, reason, fits: crew ? fits : undefined, fitCount, hitTotal, e };
    })
    .filter((m) => m.fitCount > 0)
    // Ties go to events with friends going, then cheaper, then better-reviewed, then busier ones
    .sort((a, b) => b.fitCount - a.fitCount || b.hitTotal - a.hitTotal || (b.e.friends || []).length - (a.e.friends || []).length || a.e.price - b.e.price || (b.e.rating || 0) - (a.e.rating || 0) || (b.e.going || 0) - (a.e.going || 0))
    .slice(0, 5)
    .map(({ fitCount, hitTotal, e, ...m }) => m);

  // An interest is unmet when none of its words appear in any event that fits the limits
  const unmet = [];
  for (const p of people) {
    for (const phrase of phrasesOf(p.interests)) {
      const words = wordsOf(phrase);
      if (words.length && !pool.some((e) => words.some((w) => haystack(e).includes(w)))) unmet.push({ person: p.name, interest: phrase });
    }
  }
  return { matches, unmet };
}

// ---------- 4. Hosts: draft a quest from a Quest Request ----------
function draft(request, host, vibes) {
  const prompt = `${strategyBlock()}A host on Sidequest is turning an attendee Quest Request into a real event. Help them draft it.
Host: ${host.name} (${host.type || "host"}${host.area ? `, ${host.area}` : ""}). Their vibes: ${(host.vibes || []).join(", ") || "not set"}. Bio: ${host.bio || "none"}.
The request: "${request.text}". Wanted on: ${request.when}. Usually groups of: ${request.size}.${request.budget != null ? ` Requesters' budget: up to $${request.budget}.` : ""} ${request.votes} people asked for it.

Write a draft that answers the request exactly and fits the host. Keep the price within the requesters' budget.
"vibes" must only use names from this list: ${JSON.stringify(vibes)}.
Respond with JSON only, no other text, in this shape:
{"title": "<catchy event name, under 40 characters>", "description": "<one or two sentences>", "vibes": ["<vibe>"], "price": <number in CAD, 0 for free>, "time": "<HH:MM 24-hour start time>"}`;

  return withFallback(
    async () => {
      const json = await askJSON(prompt, 600);
      return {
        title: String(json.title || request.text).slice(0, 60),
        description: String(json.description || "").slice(0, 300),
        vibes: (json.vibes || []).filter((v) => vibes.includes(v)).slice(0, 4),
        price: Number.isFinite(Number(json.price)) ? Math.max(0, Math.round(Number(json.price))) : null,
        time: /^\d{2}:\d{2}$/.test(json.time) ? json.time : "20:00",
      };
    },
    () => {
      const words = wordsOf(request.text);
      return {
        title: request.text.replace(/^\w/, (c) => c.toUpperCase()),
        description: `${request.votes} ${request.votes === 1 ? "person" : "people"} asked for this on Sidequest. ${host.name} is making it happen.`,
        vibes: vibes.filter((v) => vibeWords([v]).some((w) => words.includes(w))).slice(0, 3),
        price: request.budget != null ? request.budget : 15,
        time: request.when === "Sundays" ? "14:00" : "20:00",
      };
    }
  );
}

module.exports = { mode, MODEL, feed, match, draft, wordsOf, coreWords, phrasesOf, haystack };
