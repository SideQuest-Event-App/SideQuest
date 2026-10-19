// Import files in Supabase Storage: the scheduled importer (GitHub Actions) uploads the week's events here, and
// the app's server downloads them, so a fresh import needs no commit and no redeploy, and git doesn't grow.
// Files go to a private bucket ("imports", created on first use), gzipped: events.json is ~6 MB, ~1 MB gzipped.
// Needs SUPABASE_URL and SUPABASE_SECRET_KEY; without them every call does nothing (returns null / false).

const zlib = require("zlib");

const BUCKET = "imports";
const configured = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
function auth() {
  const key = process.env.SUPABASE_SECRET_KEY;
  return { apikey: key, ...(key.startsWith("eyJ") && { Authorization: `Bearer ${key}` }) };
}

let bucketReady = false;
async function put(name, value) {
  if (!configured()) return false;
  const url = process.env.SUPABASE_URL;
  if (!bucketReady) {
    // Already there is fine (a 400/409 answer); anything else shows up on the upload below
    await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers: { ...auth(), "content-type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) });
    bucketReady = true;
  }
  const body = zlib.gzipSync(JSON.stringify(value));
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${name}.gz`, { method: "POST", headers: { ...auth(), "content-type": "application/gzip", "x-upsert": "true" }, body });
  if (!res.ok) throw new Error(`Supabase Storage ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return true;
}

// The stored value, or null if there's none yet (or no Supabase)
async function get(name) {
  if (!configured()) return null;
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}.gz`, { headers: auth(), signal: AbortSignal.timeout(60000) });
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Supabase Storage ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return JSON.parse(zlib.gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8"));
}

module.exports = { put, get, configured };
