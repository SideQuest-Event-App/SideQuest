// Instagram: recent posts from Toronto venues' and promoters' business accounts (Instagram Graph API,
// Business Discovery). The AI reads each post's poster (OCR, every slide of a carousel) together with its
// caption and pulls out the events they announce.
// Needs INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN in .env. The accounts are in instagram-accounts.json
// (handle → home venue and coordinates, or venue null for promoters with no single venue).
// Every download is also saved (posts to instagram-raw.json, images to instagram-images/), so an expired
// token still imports the last snapshot. Instagram's image links expire within days, so the poster of each
// post that announces an event is kept as a copy (lib/posters.js) for the app to show.
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

const DIR = path.join(__dirname, "..");
const ACCOUNTS = path.join(DIR, "instagram-accounts.json");
const RAW = path.join(DIR, "instagram-raw.json");
const EXTRACTED = path.join(DIR, "instagram-extracted.json");
const IMAGES = path.join(DIR, "instagram-images");
const POST_DAYS = 60; // older posts are about events that have already happened
const IMAGES_PER_POST = 4; // a carousel's first slides carry the poster and the lineup
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
  log(`  instagram: ${posts.length - todo.length} posts already read, ${todo.length} to read (with their posters) in ${batches.length} AI calls`);
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

async function fetchInstagram({ start, max, log }) {
  const accounts = readJSON(ACCOUNTS, {});
  if (!Object.keys(accounts).length) return { skipped: "No accounts in import/instagram-accounts.json" };
  const raw = await download(accounts, log);

  // Venues we already know (from the other sources and the accounts list), to place events at other venues
  const known = new Map();
  for (const e of readJSON(path.join(DIR, "..", "seed", "events.json"), { events: [] }).events) if (e.venue.name !== "N/A") known.set(norm(e.venue.name), e.venue);
  for (const a of Object.values(accounts)) if (a.venue) known.set(norm(a.venue), { name: a.venue, address: a.address, lat: a.lat, lng: a.lng });

  const since = Date.now() - POST_DAYS * 86400000;
  const posts = [];
  for (const [handle, acct] of Object.entries(accounts)) {
    const a = raw[handle];
    if (!a) continue;
    for (const m of a.media || []) {
      if (Date.parse(m.timestamp) < since || (!m.caption && m.media_type === "VIDEO")) continue;
      posts.push({ id: m.id, handle, account: `${a.name} (@${handle})`, homeVenue: acct.venue, postedAt: m.timestamp, caption: (m.caption || "").slice(0, 1500), url: m.permalink, media: m });
    }
  }
  await downloadImages(posts, log);
  const done = await extract(posts.filter((p) => p.caption || imagesOf(p.id).length), log);
  await keepPosters(posts, done, log);

  const out = [];
  let unplaced = 0;
  for (const p of posts) {
    const acct = accounts[p.handle];
    for (const [i, ev] of ((done[p.id] && done[p.id].events) || []).entries()) {
      const startsAt = torontoISO(ev.start);
      if (!ev.title || !startsAt || Date.parse(startsAt) < start.getTime()) continue;
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
  return out.slice(0, max);
}

module.exports = { fetchInstagram };
