// Posters: reading event details off posters, screenshots and Instagram posts (OCR, done by the AI's
// image reading), and keeping a copy of each image so the app can show it.
// Used by the Instagram importer and by "Add from a poster" in the app (hosts and attendees).
//
// Copies are named by a hash of the image itself, so the same poster always gets the same address, which
// also lets duplicate checks spot one poster listed twice. With SUPABASE_URL and SUPABASE_SECRET_KEY they go
// to a public Supabase Storage bucket ("posters", created on first use) so they survive deploys; otherwise
// they're files in data/posters/, which the server shows at /posters/.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { askJSON } = require("./ai");

const LOCAL_DIR = path.join(__dirname, "..", "data", "posters");
const BUCKET = "posters";
const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// What kind of image a file is, from its first bytes (null if it isn't one we take)
function imageType(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.slice(0, 4).toString("hex") === "89504e47") return "image/png";
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.slice(0, 3).toString() === "GIF") return "image/gif";
  return null;
}

let bucketReady = false;
async function toSupabase(name, buf, type) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const auth = { apikey: key, ...(key.startsWith("eyJ") && { Authorization: `Bearer ${key}` }) };
  if (!bucketReady) {
    // Already there is fine (a 400/409 answer); anything else shows up on the upload below
    await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }) });
    bucketReady = true;
  }
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${name}`, { method: "POST", headers: { ...auth, "content-type": type, "x-upsert": "true" }, body: buf });
  if (!res.ok) throw new Error(`Supabase Storage ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return `${url}/storage/v1/object/public/${BUCKET}/${name}`;
}

// Keep a copy of an image; returns the address the app shows it at
async function savePoster(buf) {
  const type = imageType(buf);
  if (!type) throw new Error("That file isn't a JPEG, PNG, WebP or GIF image.");
  const name = `${crypto.createHash("sha1").update(buf).digest("hex").slice(0, 20)}.${EXT[type]}`;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    try {
      return await toSupabase(name, buf, type);
    } catch (err) {
      console.error(`Poster not saved to Supabase (${err.message}); keeping it in data/posters/ instead`);
    }
  }
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_DIR, name), buf);
  return `/posters/${name}`;
}
// The file behind a /posters/ address, for the server to send (null if there's no such poster)
function localPoster(name) {
  if (!/^[0-9a-f]{20}\.(jpg|png|webp|gif)$/.test(name)) return null;
  const file = path.join(LOCAL_DIR, name);
  return fs.existsSync(file) ? file : null;
}

// "2026-10-16T21:00" in Toronto time → ISO with the right offset (EDT or EST)
function torontoISO(local) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local || "")) return null;
  for (const off of ["-04:00", "-05:00"]) {
    const d = new Date(`${local.slice(0, 16)}:00${off}`);
    const back = d.toLocaleString("sv-SE", { timeZone: "America/Toronto" }).replace(" ", "T").slice(0, 16);
    if (back === local.slice(0, 16)) return d.toISOString();
  }
  return null;
}

function prompt(items, today) {
  return `You read event posters, screenshots and Instagram posts from Toronto and pull out the in-person events they announce.
Today is ${today}.

Each item below lists image files (attached above by name, or open each one with the Read tool). Look at every one and read all the text on it: posters often carry the date, time, venue, address, price and lineup that a caption leaves out. A screenshot of a post, story or listing counts too; read the event from it and ignore the app around it (likes, buttons, the app's own timestamps). Then combine the images with the item's caption, if it has one.

For each item, list every event it announces with a specific date. Rules:
- An item can announce several events (a monthly lineup, a tour stop list); list each one.
- If the poster and the caption disagree on a detail, trust the poster.
- Work out relative dates ("this Friday", "tomorrow") from the item's postedAt date (or today if it has none). A date with no year is the next one on or after that date.
- No time given: use the venue's usual start for that kind of event if it's clear, else 20:00.
- Venue: the name on the poster or caption; else the account's homeVenue; else empty. address: the street address if one is shown, else empty.
- Recurring events ("every Wednesday trivia") count: list their dates for the 4 weeks after the post date.
- Skip items that only promote food, drinks, merch, hotel stays, contests, hiring or past events, and anything online-only.
- price: the lowest ticket or cover price in CAD as a number if one is stated, 0 if it says free or no cover, else null.
- title: the event's own name (headliner, show or party name), not a sentence. organizer: the presenter or promoter if named, else empty.
- ticketUrl: a ticket or info link shown on the poster or caption, else empty.
- description: one or two plain sentences from what's written (lineup, what to expect), no hashtags or emoji.
- posterText: the legible text on the item's images, in reading order, at most 400 characters; empty if the images have no text.

Reply with JSON only: {"items":[{"id":"<item id>","posterText":"","events":[{"title":"","start":"YYYY-MM-DDTHH:MM","end":"YYYY-MM-DDTHH:MM or null","venue":"","address":"","price":null,"organizer":"","ticketUrl":"","description":""}]}]}
Times are Toronto local time. Include every item id, with "events": [] when it announces none.

Items:
${JSON.stringify(items, null, 0)}`;
}

// "garrisontoronto.com/tickets" → "https://garrisontoronto.com/tickets"; anything that isn't a web link → ""
function asLink(s) {
  const t = String(s || "").trim();
  if (/^https?:\/\/\S+\.\S+/.test(t)) return t;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) return `https://${t}`;
  return "";
}

// items: [{ id, images: [file paths], caption?, postedAt?, account?, homeVenue? }]
// Returns { [id]: { posterText, events } } for the items the AI answered for. Throws if the AI isn't there.
async function readPosters(items) {
  const files = [];
  const listed = items.map(({ images = [], ...rest }, i) => {
    const names = images.map((p, n) => {
      const name = `item${i + 1}-image${n + 1}${path.extname(p).toLowerCase() || ".jpg"}`;
      files.push({ name, path: p });
      return name;
    });
    return { ...rest, images: names };
  });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" });
  const answer = await askJSON(prompt(listed, today), 8000, files);
  const out = {};
  for (const it of answer.items || []) {
    if (!items.some((x) => x.id === it.id)) continue;
    out[it.id] = { posterText: String(it.posterText || "").slice(0, 400), events: Array.isArray(it.events) ? it.events : [] };
  }
  return out;
}

module.exports = { readPosters, savePoster, localPoster, imageType, torontoISO, asLink };
