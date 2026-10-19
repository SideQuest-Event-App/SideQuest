// Instagram: recent posts from Toronto venues' and promoters' business accounts (Instagram Graph API,
// Business Discovery). The AI reads each post's poster (OCR, the first slides of a carousel) together with its
// caption and pulls out the events they announce.
//
// Two halves, because reading posts takes the AI:
//   - buildInstagram (run by hand: `node import/instagram.js`, using Claude Code) downloads new posts, reads them,
//     and saves the events to instagram-events.json and to Supabase Storage.
//   - fetchInstagram (the scheduled import) just picks up those saved events. It never calls the AI.
//
// The accounts are the list in sketch-2/reference/instagram-accounts.md (add a row to add one). Each venue's
// address and coordinates are remembered in instagram-accounts.json, found by name the first time.
// Needs INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN in .env. Posts are saved to instagram-raw.json, so an
// expired token still builds from the last snapshot. Instagram's image links expire within days, so the poster
// of each post that announces an event is kept as a copy (lib/posters.js) for the app to show; the downloaded
// images are deleted once read.
//
// Guardrails on AI use: each post is read once; at most IG_MAX_CALLS AI calls a run (the rest wait for the next
// run); 2 images a post; and an account is paused once 20 of its posts have been read with no event in them.
//
// Posts aren't listings, so this source is looser than the others: relative dates ("this Friday") are worked
// out from the post date, and the venue is the account's own unless the post names another one we know.
// What a post doesn't say (price, end time) stays N/A. Extractions are kept in instagram-extracted.json
// (by post id), so each post is read by the AI once (posts read before posters were, are read again once
// their images are downloaded).

const fs = require("fs");
const path = require("path");
const { get } = require("../fetch");
const { mode } = require("../../lib/ai");
const { readPosters, savePoster, torontoISO, asLink } = require("../../lib/posters");
const { geocode } = require("../../lib/geocode");
const store = require("../../lib/store");

const DIR = path.join(__dirname, "..");
const LIST = path.join(DIR, "..", "..", "sketch-2", "reference", "instagram-accounts.md");
const ACCOUNTS = path.join(DIR, "instagram-accounts.json");
const EVENTS = path.join(DIR, "instagram-events.json");
const RAW = path.join(DIR, "instagram-raw.json");
const EXTRACTED = path.join(DIR, "instagram-extracted.json");
const IMAGES = path.join(DIR, "instagram-images");
const POST_DAYS = 60; // older posts are about events that have already happened
const IMAGES_PER_POST = 2; // a carousel's first slides carry the poster and the lineup
const MAX_CALLS = Number(process.env.IG_MAX_CALLS || 40); // AI calls per run, at most
const PAUSE_AFTER = 20; // posts read with no event in them before an account is paused
const STALE_DAYS = 8; // the scheduled import warns when the Instagram events are older than this
const BATCH_POSTS = 12; // per AI call: up to 12 posts or 12 images, whichever comes first
const BATCH_IMAGES = 12;
const PARALLEL = 3;
const READ_VERSION = 2; // 2: read with the posters, not just the caption

const readJSON = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};
const norm = (s) => String(s || "").toLowerCase().replace(/^the /, "").replace(/[^a-z0-9]/g, "");
const sameVenue = (a, b) => !!norm(a) && !!norm(b) && (norm(a).includes(norm(b)) || norm(b).includes(norm(a)));

const FIELDS = "username,name,biography,followers_count,media.limit(40){caption,timestamp,permalink,media_type,media_url,children{media_type,media_url}}";
const FIELDS_PLAIN = "username,name,biography,followers_count,media.limit(40){caption,timestamp,permalink,media_type,media_url}";

async function download(accounts, log) {
  const user = process.env.INSTAGRAM_USER_ID;
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const raw = readJSON(RAW, {});
  if (!user || !token) {
    log("  instagram: no INSTAGRAM_USER_ID / INSTAGRAM_ACCESS_TOKEN in .env, using the saved snapshot");
    return raw;
  }
  let fields = FIELDS;
  let fresh = 0;
  for (const handle of Object.keys(accounts)) {
    const fetchAccount = () => get(`https://graph.facebook.com/v21.0/${user}?${new URLSearchParams({ fields: `business_discovery.username(${handle}){${fields}}`, access_token: token })}`, { json: true });
    try {
      let data;
      try {
        data = await fetchAccount();
      } catch (err) {
        // Carousel slides aren't available to every app; fall back to each post's first image
        if (fields !== FIELDS || !/\b400\b/.test(err.message) || /expired|session|token/i.test(err.message)) throw err;
        fields = FIELDS_PLAIN;
        data = await fetchAccount();
      }
      const bd = data.business_discovery;
      raw[handle] = { ...raw[handle], ...bd, media: (bd.media && bd.media.data) || [] };
      fresh++;
    } catch (err) {
      log(`  instagram @${handle}: ${err.message.replace(token, "***").slice(0, 120)}`);
      if (/\b(400|401|403)\b/.test(err.message) && !fresh) {
        log("  instagram: token rejected (expired or rate-limited), using the saved snapshot");
        break;
      }
    }
  }
  fs.writeFileSync(RAW, JSON.stringify(raw, null, 0));
  log(`  instagram: ${fresh} accounts downloaded, ${Object.keys(raw).length} in the snapshot`);
  return raw;
}

// A post's images on disk (downloaded earlier), in slide order
const imagesOf = (id) => {
  try {
    return fs.readdirSync(IMAGES).filter((f) => f.startsWith(`${id}-`)).sort((a, b) => parseInt(a.split("-")[1]) - parseInt(b.split("-")[1])).map((f) => path.join(IMAGES, f));
  } catch {
    return [];
  }
};

// Save the images of recent posts while their links still work (videos have none we can read)
async function downloadImages(posts, log) {
  fs.mkdirSync(IMAGES, { recursive: true });
  let saved = 0;
  let failed = 0;
  for (const p of posts) {
    if (imagesOf(p.id).length) continue;
    const m = p.media;
    const urls = (m.media_type === "CAROUSEL_ALBUM" && m.children ? m.children.data.filter((c) => c.media_type === "IMAGE").map((c) => c.media_url) : m.media_type === "IMAGE" ? [m.media_url] : []).filter(Boolean).slice(0, IMAGES_PER_POST);
    for (const [n, url] of urls.entries()) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(String(res.status));
        fs.writeFileSync(path.join(IMAGES, `${p.id}-${n + 1}.jpg`), Buffer.from(await res.arrayBuffer()));
        saved++;
      } catch {
        failed++; // an expired link (an old snapshot): this post is read from its caption only
      }
    }
  }
  if (saved || failed) log(`  instagram: ${saved} post images saved${failed ? `, ${failed} couldn't be downloaded (links expire after a few days)` : ""}`);
}

// Posts not yet read, or read before their posters were, go to the AI with their images
async function extract(posts, log) {
  const done = readJSON(EXTRACTED, {});
  const todo = posts.filter((p) => !done[p.id] || (done[p.id].v !== READ_VERSION && imagesOf(p.id).length));
  if (todo.length && mode() === "keywords") {
    log(`  instagram: no AI available, ${todo.length} posts can't be read (set ANTHROPIC_API_KEY or install Claude Code)`);
    return done;
  }
  const batches = [];
  let cur = [];
  let images = 0;
  for (const p of todo) {
    const n = imagesOf(p.id).length;
    if (cur.length && (cur.length >= BATCH_POSTS || images + n > BATCH_IMAGES)) {
      batches.push(cur);
      cur = [];
      images = 0;
    }
    cur.push(p);
    images += n;
  }
  if (cur.length) batches.push(cur);
  const later = batches.splice(MAX_CALLS);
  log(`  instagram: ${posts.length - todo.length} posts already read, ${todo.length} to read (with their posters) in ${batches.length} AI calls${later.length ? `; ${later.reduce((n, b) => n + b.length, 0)} more wait for the next run (IG_MAX_CALLS=${MAX_CALLS})` : ""}`);
  let next = 0;
  let finished = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const answer = await readPosters(batch.map(({ id, account, homeVenue, postedAt, caption }) => ({ id, account, homeVenue, postedAt, caption, images: imagesOf(id) })));
        for (const [id, r] of Object.entries(answer)) done[id] = { v: imagesOf(id).length ? READ_VERSION : 1, posterText: r.posterText, events: r.events };
        fs.writeFileSync(EXTRACTED, JSON.stringify(done, null, 0));
      } catch (err) {
        log(`  instagram: an AI batch failed (${err.message.slice(0, 100)}); those posts will be retried next run`);
      }
      finished++;
      if (finished % 10 === 0) log(`  instagram: ${finished}/${batches.length} AI calls done`);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  return done;
}

// A copy of the post's first image, for the posts that announce events (kept in the extraction cache)
async function keepPosters(posts, done, log) {
  let kept = 0;
  for (const p of posts) {
    const d = done[p.id];
    if (!d || !d.events.length || d.image) continue;
    const [first] = imagesOf(p.id);
    if (!first) continue;
    try {
      d.image = await savePoster(fs.readFileSync(first));
      kept++;
    } catch (err) {
      log(`  instagram: poster for ${p.url} not kept (${err.message.slice(0, 80)})`);
    }
  }
  if (kept) {
    fs.writeFileSync(EXTRACTED, JSON.stringify(done, null, 0));
    log(`  instagram: ${kept} posters kept for the app to show`);
  }
}

// ---------- The account list (sketch-2/reference/instagram-accounts.md) ----------
// Each table row is "| [@handle](link) | Venue | …": the venue's name, or "Promoter" for an account with no venue
function readList() {
  const rows = [];
  for (const line of fs.readFileSync(LIST, "utf8").split("\n")) {
    const m = line.match(/^\|\s*\[?@([A-Za-z0-9._]+)\]?(?:\([^)]*\))?\s*\|\s*([^|]*?)\s*\|/);
    if (m) rows.push({ handle: m[1], venue: /^promoter$/i.test(m[2]) || !m[2] ? null : m[2] });
  }
  return rows;
}
// handle → { venue, address, lat, lng } (venue null for a promoter). A venue new to the list is looked up by name.
async function loadAccounts(log) {
  const known = readJSON(ACCOUNTS, {});
  const out = {};
  let added = 0;
  for (const { handle, venue } of readList()) {
    const k = known[handle];
    if (!venue) out[handle] = { venue: null };
    else if (k && k.venue && sameVenue(k.venue, venue) && Number.isFinite(k.lat)) out[handle] = k;
    else {
      const g = await geocode(venue);
      if (!g) {
        log(`  instagram @${handle}: couldn't find "${venue}" on the map, so its posts need to name a venue we know`);
        out[handle] = { venue: null };
        continue;
      }
      out[handle] = { venue, address: g.address, lat: g.lat, lng: g.lng };
      added++;
    }
  }
  if (added) fs.writeFileSync(ACCOUNTS, JSON.stringify({ ...known, ...out }, null, 1));
  return out;
}
// Posts read and events found per account, from what's been read so far
function accountStats(raw, done) {
  const stats = {};
  for (const [handle, a] of Object.entries(raw)) {
    const read = (a.media || []).filter((m) => done[m.id]);
    stats[handle] = { read: read.length, events: read.reduce((n, m) => n + done[m.id].events.length, 0) };
  }
  return stats;
}
const paused = (st) => st && st.read >= PAUSE_AFTER && !st.events;
// Rewrite the list with each account's numbers (keeping its accounts, venues and order)
function writeList(accounts, stats, builtAt) {
  const rows = readList().map(({ handle, venue }) => {
    const st = stats[handle];
    const note = !st ? "Not downloaded yet" : paused(st) ? "Paused: no events in its posts" : "";
    return `| [@${handle}](https://www.instagram.com/${handle}/) | ${venue || "Promoter"} | ${st ? st.read : 0} | ${st ? st.events : 0} | ${note} |`;
  });
  fs.writeFileSync(LIST, `# Instagram accounts

The business accounts the Instagram import reads. To add one, add a row with its handle and its venue's name (or "Promoter" if it has no single venue); to drop one, delete its row. The numbers are filled in by \`node sketch-1/import/instagram.js\` (last run ${builtAt.slice(0, 10)}).

- **Venue**: events from the account's posts are placed here, unless a post names another venue. A new venue is found on the map by its name.
- **Posts read**: how many of its recent posts (the last 40, up to 60 days old) the AI has read.
- **Events found**: events the AI found in those posts, before the date window and the duplicate check.
- **Paused**: ${PAUSE_AFTER} of its recent posts were read with no event in them, so its new posts aren't read. It picks up again by itself as those posts drop out of its last 40.

| Account | Venue | Posts read | Events found | Note |
|---|---|---:|---:|---|
${rows.join("\n")}
`);
}

// ---------- By hand: download, read, save (node import/instagram.js) ----------
async function buildInstagram({ start, end, log }) {
  const accounts = await loadAccounts(log);
  if (!Object.keys(accounts).length) throw new Error(`No accounts in ${LIST}`);
  const raw = await download(accounts, log);
  let done = readJSON(EXTRACTED, {});
  const stats = accountStats(raw, done);
  const skip = Object.keys(accounts).filter((h) => paused(stats[h]));
  if (skip.length) log(`  instagram: ${skip.length} accounts paused (${PAUSE_AFTER}+ posts read, no events): ${skip.map((h) => `@${h}`).join(", ")}`);

  // Venues we already know (from the last import and the accounts list), to place events at other venues
  const known = new Map();
  const last = (await store.get("events.json").catch(() => null)) || readJSON(path.join(DIR, "..", "seed", "events.json"), { events: [] });
  for (const e of last.events) if (e.venue.name !== "N/A") known.set(norm(e.venue.name), e.venue);
  for (const a of Object.values(accounts)) if (a.venue) known.set(norm(a.venue), { name: a.venue, address: a.address, lat: a.lat, lng: a.lng });

  const since = Date.now() - POST_DAYS * 86400000;
  const posts = [];
  for (const [handle, acct] of Object.entries(accounts)) {
    const a = raw[handle];
    if (!a) continue;
    for (const m of a.media || []) {
      if (Date.parse(m.timestamp) < since || (!m.caption && m.media_type === "VIDEO")) continue;
      posts.push({ id: m.id, handle, paused: skip.includes(handle), account: `${a.name} (@${handle})`, homeVenue: acct.venue, postedAt: m.timestamp, caption: (m.caption || "").slice(0, 1500), url: m.permalink, media: m });
    }
  }
  const toRead = posts.filter((p) => !p.paused && !done[p.id]);
  await downloadImages(toRead, log);
  done = await extract(posts.filter((p) => !p.paused && (p.caption || imagesOf(p.id).length)), log);
  await keepPosters(posts, done, log);

  // The images were only needed for reading: delete them once a post is read (or too old to be)
  const live = new Set(posts.map((p) => p.id));
  let freed = 0;
  for (const f of fs.existsSync(IMAGES) ? fs.readdirSync(IMAGES) : []) {
    const id = f.split("-")[0];
    if (done[id] || !live.has(id)) {
      fs.unlinkSync(path.join(IMAGES, f));
      freed++;
    }
  }
  if (freed) log(`  instagram: ${freed} downloaded images deleted (already read)`);
  // Readings of posts that have dropped out of every account's recent posts are never needed again
  const recent = new Set(Object.values(raw).flatMap((a) => (a.media || []).map((m) => m.id)));
  for (const id of Object.keys(done)) if (!recent.has(id)) delete done[id];
  fs.writeFileSync(EXTRACTED, JSON.stringify(done, null, 0));

  const out = [];
  let unplaced = 0;
  for (const p of posts) {
    const acct = accounts[p.handle];
    for (const [i, ev] of ((done[p.id] && done[p.id].events) || []).entries()) {
      const startsAt = torontoISO(ev.start);
      if (!ev.title || !startsAt || Date.parse(startsAt) < start.getTime() || Date.parse(startsAt) > end.getTime()) continue;
      // The account's own venue, another venue we already know, or one the poster gives an address for
      const home = acct.venue && (!ev.venue || sameVenue(ev.venue, acct.venue)) ? { name: acct.venue, address: acct.address, lat: acct.lat, lng: acct.lng } : null;
      let venue = home || known.get(norm(ev.venue));
      if (!venue && ev.venue && ev.address) {
        const g = await geocode(`${ev.venue}, ${ev.address}`) || (await geocode(ev.address));
        if (g) venue = { name: ev.venue, address: ev.address || g.address, lat: g.lat, lng: g.lng };
      }
      if (!venue) {
        unplaced++;
        continue;
      }
      out.push({
        source: "Instagram",
        sourceId: `${p.id}:${i}`,
        url: p.url,
        title: ev.title,
        startsAt,
        endsAt: torontoISO(ev.end),
        venue: { name: venue.name, address: venue.address, lat: venue.lat, lng: venue.lng },
        price: ev.price == null || ev.price === "" ? null : Number(ev.price),
        description: ev.description || "",
        categories: [],
        organizer: ev.organizer || raw[p.handle].name,
        ticketUrl: asLink(ev.ticketUrl) || undefined,
        image: done[p.id].image || null, // our copy of the poster (Instagram's own links expire)
      });
    }
  }
  if (unplaced) log(`  instagram: ${unplaced} events left out (no venue or address we can place on the map)`);
  const file = { builtAt: new Date().toISOString(), events: out };
  fs.writeFileSync(EVENTS, JSON.stringify(file));
  const uploaded = await store.put("instagram-events.json", file);
  writeList(accounts, accountStats(raw, done), file.builtAt);
  log(`  instagram: ${out.length} events saved to import/instagram-events.json${uploaded ? " and Supabase Storage" : ""}`);
  return file;
}

// ---------- Scheduled import: the events the last by-hand run saved (no AI) ----------
async function fetchInstagram({ start, end, max, log }) {
  let file = null;
  try {
    file = await store.get("instagram-events.json");
  } catch (err) {
    log(`  instagram: couldn't read Supabase Storage (${err.message}), using the local file`);
  }
  file = file || readJSON(EVENTS, null);
  if (!file) return { skipped: "No Instagram events saved yet: run `node import/instagram.js`" };
  const days = (Date.now() - Date.parse(file.builtAt)) / 86400000;
  if (days > STALE_DAYS) log(`  instagram: the saved events are ${Math.floor(days)} days old; run \`node import/instagram.js\` to read new posts`);
  return file.events.filter((e) => Date.parse(e.startsAt) >= start.getTime() && Date.parse(e.startsAt) <= end.getTime()).slice(0, max);
}

module.exports = { fetchInstagram, buildInstagram };
