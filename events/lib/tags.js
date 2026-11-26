// AI tags for listings: 1 to 3 of the app's 21 vibes, plus a format and a setting, chosen by Claude from fixed lists.
// The AI step is `node tag.js`, run by hand (like instagram.js). It only reads new or changed
// listings and saves its answers to data/event-tags.json, keyed by event id with a fingerprint of the listing.
// The import applies what's saved here; lib/tagger.js (at the end of `node run.js`, or `node tag.js`) writes it.
//
// Keyword vibes (normalize.js) stay as the fallback for every listing the AI hasn't read.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { LABELS: QUALITY_LABELS } = require("./qualities");
const FILE = process.env.EVENT_TAGS_FILE || require("./paths").data("event-tags.json");

// The app's fixed vocabulary (sketch-2/server.js VIBES): the AI may only pick from these
const VIBES = ["Live music", "Jazz", "Indie gigs", "Comedy", "Dance", "Electronic", "Records & vinyl", "Film nights", "Zines & print", "Art & making", "Photography", "Writing & poetry", "Tech & coding", "Anime & cosplay", "Outdoors", "Run & ride", "Climbing", "Games & social", "Food & drink", "Markets", "Wellness"];
const FORMATS = ["show", "class", "social", "market", "party", "screening", "talk", "exhibit", "tour", "activity"];
const SETTINGS = ["small room", "club", "theatre", "arena", "bar or restaurant", "gallery or studio", "outdoors"];
const VIBE_LOWER = new Set(VIBES.map((v) => v.toLowerCase()));
// Our own keyword tags (multi-word vibe names, "meetup"), hidden from the AI so it judges the listing, not our guess;
// single words like "comedy" or "jazz" are also real site categories, so the AI still sees those
const OUR_TAGS = new Set([...[...VIBE_LOWER].filter((v) => /\s/.test(v)), "photography", "outdoors", "climbing", "wellness", "markets", "meetup"]);
const SCENE_OF = {
  "Live music": "Music & nightlife", Jazz: "Music & nightlife", "Indie gigs": "Music & nightlife", Comedy: "Music & nightlife", Dance: "Music & nightlife",
  Electronic: "Music & nightlife", "Records & vinyl": "Music & nightlife", "Film nights": "Arts & making", "Zines & print": "Arts & making", "Art & making": "Arts & making",
  Photography: "Arts & making", "Writing & poetry": "Arts & making", "Tech & coding": "Arts & making", "Anime & cosplay": "Arts & making", Outdoors: "Active & social",
  "Run & ride": "Active & social", Climbing: "Active & social", "Games & social": "Active & social", "Food & drink": "Active & social", Markets: "Active & social", Wellness: "Active & social",
};

// What the AI read: title, venue and description. A change to any of them means the listing is read again.
const fingerprint = (e) => crypto.createHash("sha1").update(`${e.title}|${(e.venue && e.venue.name) || ""}|${e.description || ""}${e.details ? `|${e.details}` : ""}`).digest("hex").slice(0, 12);

function load(file = FILE) {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return j && j.tags ? j : { tags: {} };
  } catch {
    return { tags: {} };
  }
}
function save(saved, file = FILE) {
  const out = { note: "Written by the AI tagger (lib/tagger.js: at the end of `node run.js`, or `node tag.js`), with Claude Code. Applied by every import.", updatedAt: new Date().toISOString(), tags: saved.tags };
  fs.writeFileSync(file, JSON.stringify(out, null, 0).replace(/,"(\d+)":/g, ',\n"$1":') + "\n");
}

// Keep only answers from the fixed lists; null when nothing usable is left
function validate(t) {
  if (!t || typeof t !== "object") return null;
  const vibes = [...new Set([].concat(t.vibes || []).map(String).filter((v) => VIBES.includes(v)))].slice(0, 3);
  if (!vibes.length) return null;
  const str = (x, n) => (typeof x === "string" && x.trim() ? x.trim().replace(/\s+/g, " ").slice(0, n) : null);
  // What makes it different, in one line; qualities from the fixed list; a few words people might search for.
  // Only the ones the AI gave are kept, so older saved tags look the same as before.
  const premise = str(t.premise, 160);
  const qualities = [...new Set([].concat(t.qualities || []).filter((q) => QUALITY_LABELS.includes(q)))].slice(0, 8);
  const keywords = [...new Set([].concat(t.keywords || []).map((k) => str(String(k).toLowerCase(), 30)).filter(Boolean))].slice(0, 8);
  return {
    vibes, format: FORMATS.includes(t.format) ? t.format : null, setting: SETTINGS.includes(t.setting) ? t.setting : null,
    ...(premise ? { premise } : {}), ...(qualities.length ? { qualities } : {}), ...(keywords.length ? { keywords } : {}), ...(t.info === "thin" ? { thin: true } : {}),
  };
}

// Listings the AI hasn't read yet, or that changed since it did
const needsTag = (e, saved) => {
  if (!e || e.type === "place" || e.publishedBy) return false;
  const s = saved.tags[e.id];
  return !s || s.fp !== fingerprint(e);
};

// A saved tag on an event, if it still matches the listing; otherwise the event as it is
function apply(e, saved) {
  const s = saved && saved.tags && saved.tags[e.id];
  if (!s || s.fp !== fingerprint(e)) return e;
  const t = validate(s);
  if (!t) return e;
  const tags = [...new Set([...(e.tags || []).filter((x) => !VIBE_LOWER.has(x)), ...t.vibes.map((v) => v.toLowerCase())])].slice(0, 8);
  return { ...e, vibes: t.vibes, scene: SCENE_OF[t.vibes[0]], tags, format: t.format, setting: t.setting, tagSource: "ai",
    ...(t.premise ? { premise: t.premise } : {}), ...(t.qualities ? { aiQualities: t.qualities } : {}), ...(t.keywords ? { keywords: t.keywords } : {}), ...(t.thin ? { aiThin: true } : {}) };
}

function prompt(batch) {
  const items = batch.map((e) => ({ id: e.id, title: e.title, venue: e.venue && e.venue.name, organizer: e.organizer && e.organizer.name !== "N/A" ? e.organizer.name : undefined, when: e.date, price: e.priceNote, categories: (e.tags || []).filter((t) => !OUR_TAGS.has(t)).slice(0, 5), description: String(e.description || "").slice(0, 400), details: e.details ? String(e.details).slice(0, 900) : undefined }));
  return `You tag Toronto event listings for a going-out app. For each listing choose:
- "vibes": 1 to 3 from this exact list, most important first: ${JSON.stringify(VIBES)}
  Pick a vibe only when the listing is clearly that kind of outing. A dinner is "Food & drink", not "Games & social". A drag show or burlesque night is "Comedy" or "Dance" only if the listing says so. A language class or AGM fits no vibe well: give the closest one only if it genuinely fits, otherwise use "Games & social" only for social mixers.
- "format": one of ${JSON.stringify(FORMATS)}
- "setting": one of ${JSON.stringify(SETTINGS)} ("outdoors" only when the event happens outside)
- "premise": one plain sentence, under 20 words, saying what makes this event different from other nights of its kind (its concept, crowd, rules or feel), e.g. "A phones-down club night: DJs MALIG and ESP, dress code black." Use only what the listing says. If it says too little, use null.
- "qualities": any that clearly apply, from this exact list: ${JSON.stringify(QUALITY_LABELS)}
- "keywords": up to 8 short words or phrases someone might search to find it (genres, the scene, the crowd, the concept), lowercase, from the listing only
- "info": "thin" when the listing says too little to know what the event is actually like (only a title, a date and a slogan); otherwise "enough"
Use only what the listing says; don't guess from the venue's name alone (a known queer venue may be called queer).
Listings (JSON):
${JSON.stringify(items)}
Respond with JSON only, in this shape:
{"tags": [{"id": <id>, "vibes": ["..."], "format": "...", "setting": "...", "premise": "..." or null, "qualities": ["..."], "keywords": ["..."], "info": "enough" or "thin"}]}`;
}

// Merge an AI answer into the saved tags (only ids that were asked about)
function record(saved, batch, answer) {
  const byId = new Map(batch.map((e) => [e.id, e]));
  let n = 0;
  for (const t of (answer && answer.tags) || []) {
    const e = byId.get(Number(t.id));
    const v = e && validate(t);
    if (!v) continue;
    saved.tags[e.id] = { ...v, fp: fingerprint(e), at: new Date().toISOString().slice(0, 10) };
    n++;
  }
  return n;
}

module.exports = { VIBES, FORMATS, SETTINGS, FILE, fingerprint, load, save, validate, needsTag, apply, prompt, record };
