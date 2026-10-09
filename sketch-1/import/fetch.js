// Polite fetching for the importer: identifies itself honestly, waits between requests to the
// same site, retries once, and caches every response in import/.cache so re-runs don't re-download.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const UA = "SidequestSketch/1.0 (university student prototype; low-volume event import)";
const CACHE_DIR = path.join(__dirname, ".cache");
const CACHE_HOURS = Number(process.env.CACHE_HOURS || 12);
const GAP_MS = Number(process.env.GAP_MS || 900); // between requests to the same host

const lastHit = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// extract: optional (body) => JSON-able value. Only that value is cached, so big pages we read
// thousands of (Eventbrite and Meetup event pages) don't fill the disk.
async function get(url, { json = false, headers = {}, extract = null, timeoutMs = 30000 } = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash("sha1").update(url).digest("hex") + (extract ? ".x" : ""));
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < CACHE_HOURS * 3600 * 1000) {
      const body = fs.readFileSync(file, "utf8");
      return extract || json ? JSON.parse(body) : body;
    }
  } catch {}

  // OFFLINE=1: build from what's already cached (e.g. after stopping a long run), never download
  if (process.env.OFFLINE) throw new Error(`not cached (offline): ${url}`);

  const host = new URL(url).host;
  const wait = (lastHit[host] || 0) + (HOST_GAP[host] || GAP_MS) - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit[host] = Date.now();

  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-CA,en;q=0.8", ...headers }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 429) {
        lastErr = new Error(`429 rate limited: ${url}`);
        await sleep(30000);
        continue;
      }
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      const body = await res.text();
      if (extract) {
        const value = extract(body);
        fs.writeFileSync(file, JSON.stringify(value === undefined ? null : value));
        return value;
      }
      fs.writeFileSync(file, body);
      return json ? JSON.parse(body) : body;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      await sleep(2000);
    }
  }
  throw lastErr || new Error(`Failed: ${url}`);
}

// All schema.org Event objects in a page's JSON-LD (handles arrays, @graph and ItemLists)
function jsonLdEvents(html) {
  const out = [];
  const visit = (j) => {
    if (!j || typeof j !== "object") return;
    if (Array.isArray(j)) return j.forEach(visit);
    if (typeof j["@type"] === "string" && /Event$/.test(j["@type"])) out.push(j);
    if (j["@graph"]) visit(j["@graph"]);
    if (j.itemListElement) visit(j.itemListElement.map((x) => x.item || x));
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      visit(JSON.parse(m[1]));
    } catch {}
  }
  return out;
}

// Pull a `window.X = {...}` object out of a page by matching braces
function embeddedObject(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  const start = html.indexOf("{", i);
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(html.slice(start, j + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// schema.org Place objects (DICE venue pages list their upcoming events inside one)
jsonLdEvents.places = (html) => {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const j = JSON.parse(m[1]);
      if (j && j["@type"] === "Place") out.push(j);
    } catch {}
  }
  return out;
};

// Slower pace for sites that rate-limit (Eventbrite's listing pages)
const HOST_GAP = { "www.eventbrite.ca": Number(process.env.EVENTBRITE_LIST_GAP_MS || 6000), "www.eventbrite.com": Number(process.env.EVENTBRITE_PAGE_GAP_MS || 800) };

// Next.js pages: the __NEXT_DATA__ JSON
function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  try {
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
}

module.exports = { get, jsonLdEvents, embeddedObject, nextData, sleep };
