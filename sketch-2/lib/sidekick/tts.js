// Sidekick's spoken lines in the ElevenLabs voices (POST /api/sk/tts): the Plan intro, the call's lines when the
// conversation agent isn't running (questions, the confirmation, the progress and still-going lines, picks...).
// Each persona has its own voice, the same ones the agents use, with the agents' fast model (eleven_flash_v2).
// Both study arms get ElevenLabs voices, so the blind A/B test still compares like with like.
//
// Every line is metered in characters (usage.js: elevenlabs_tts_chars) before it's sent, and identical lines are
// kept in memory, so the intro and other fixed lines cost nothing after the first time. When the key is missing,
// the cap is reached or ElevenLabs fails, the route answers { fallback: true } and the phone uses its own voice.
//
// Env: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_FRIEND, ELEVENLABS_VOICE_CONCIERGE, ELEVENLABS_TTS_MODEL,
// ELEVENLABS_TTS_OFF=1 (switch it off), ELEVENLABS_BASE_URL (tests).

const usage = require("./usage");
const personas = require("./personas");

const VOICES = { concierge: "Qggl4b0xRMiqOwhPtVWT", friend: "UgBBYS2sOqTuMpoF3BR0" };
const MAX_CHARS = 400;
const CACHE_MAX = 200;
const voiceFor = (persona) => {
  const p = personas.resolve(persona);
  return (p === "friend" ? process.env.ELEVENLABS_VOICE_FRIEND : process.env.ELEVENLABS_VOICE_CONCIERGE) || VOICES[p];
};
const model = () => process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2";
const base = () => (process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io").replace(/\/$/, "");
const configured = () => Boolean(process.env.ELEVENLABS_API_KEY) && process.env.ELEVENLABS_TTS_OFF !== "1" && process.env.SIDEKICK_ELEVENLABS_OFF !== "1";

const cache = new Map(); // "voice|text" -> Buffer (oldest first)
// Characters left today on the meter, for the log and the phone's voice status (never anything about the key)
async function left() {
  try {
    const st = (await usage.status()).elevenlabs_tts_chars;
    return st ? Math.max(0, Math.min(st.limits.day - st.used.day, st.limits.month - st.used.month)) : null;
  } catch { return null; }
}
// One line per request in the server log (Render): the result, the size and the meter. No key, no text.
const log = (msg) => console.log(`[voice] tts ${msg}`);
const stats = { hits: 0, misses: 0 };
const clean = (t) => String(t || "").replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);

// { audio: Buffer, cached } or { fallback: true, status, error, reason }. reason: no-key, off, limit, upstream-401,
// upstream-403, upstream-429, upstream-5xx, upstream-<status>, timeout, network, empty
async function speech(text, persona) {
  const line = clean(text);
  if (!line) return { fallback: true, status: 400, error: "Nothing to say." };
  if (!configured()) {
    const reason = process.env.ELEVENLABS_API_KEY ? "off" : "no-key";
    log(`503 reason=${reason} chars=${line.length}`);
    return { fallback: true, status: 503, error: "ElevenLabs isn't set up.", reason };
  }
  const voice = voiceFor(persona);
  const key = `${voice}|${line}`;
  if (cache.has(key)) {
    stats.hits++;
    const audio = cache.get(key);
    cache.delete(key);
    cache.set(key, audio); // most recently used last
    log(`200 chars=${line.length} cache=hit left=${await left()}`);
    return { audio, cached: true, voice };
  }
  const ok = await usage.reserve("elevenlabs_tts_chars", line.length);
  if (!ok.ok) {
    log(`blocked by the meter (${ok.reason}) chars=${line.length} left=${await left()}`);
    return { fallback: true, status: 429, error: "Sidekick's voice has hit its limit for now.", capped: true, reason: "limit" };
  }
  stats.misses++;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`${base()}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: line, model_id: model() }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (!r.ok) throw Object.assign(new Error(`ElevenLabs said ${r.status}`), { upstream: r.status });
    const audio = Buffer.from(await r.arrayBuffer());
    if (!audio.length) throw Object.assign(new Error("No audio came back"), { empty: true });
    cache.set(key, audio);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    log(`200 chars=${line.length} cache=miss left=${await left()}`);
    return { audio, cached: false, voice };
  } catch (err) {
    await usage.release("elevenlabs_tts_chars", line.length); // nothing was spoken: give the characters back
    const reason = err.upstream ? (err.upstream >= 500 ? "upstream-5xx" : `upstream-${err.upstream}`) : err.name === "AbortError" ? "timeout" : err.empty ? "empty" : "network";
    log(`502 reason=${reason}${err.upstream ? ` elevenlabs=${err.upstream}` : ""} chars=${line.length} cache=miss left=${await left()}`);
    return { fallback: true, status: 502, error: err.name === "AbortError" ? "ElevenLabs took too long." : err.message, reason, capped: err.upstream === 429 || undefined };
  }
}

async function handle(req, res, { readBody, sendJSON }) {
  if (req.method !== "POST") return sendJSON(res, 405, { error: "Use POST." });
  const body = await readBody(req);
  const out = await speech(body.text, body.persona);
  if (out.fallback) return sendJSON(res, out.status, { error: out.error, fallback: true, reason: out.reason || "error", capped: out.capped || undefined });
  res.writeHead(200, { "content-type": "audio/mpeg", "content-length": out.audio.length, "cache-control": "no-store", "x-sk-cache": out.cached ? "hit" : "miss" });
  res.end(out.audio);
}

function _reset() { cache.clear(); stats.hits = 0; stats.misses = 0; }

module.exports = { speech, handle, voiceFor, VOICES, stats, left, configured, base, _reset };
