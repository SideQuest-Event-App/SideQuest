// What an event is like beyond its vibe: its qualities ("Phone-free", "Queer & 2SLGBTQ+", "19+", "DJ sets"…), the
// AI tagger's one-line premise and keywords, and whether the listing is too thin to say (events/lib/qualities.js).
// The import stores these on new listings; this works them out for any event that doesn't have them yet, so search,
// recommendations and event pages use them right away.
//
//   traits(e)  { qualities, info: "enough" | "ai" | "thin", premise, words }   words: what search matches against

const { describe, wordsFor } = require("../../../events/lib/qualities");

const cache = new Map(); // by event id and a fingerprint of what the rules read
function traits(e) {
  if (!e || typeof e !== "object") return { qualities: [], info: "thin", premise: null, words: "" };
  const key = `${e.id}|${e.title}|${String(e.description || "").length}|${String(e.details || "").length}|${e.startsAt}|${(e.aiQualities || []).join()}`;
  let t = cache.get(key);
  if (!t) {
    const d = describe(e);
    t = {
      qualities: d.qualities,
      info: d.info,
      premise: e.premise || null,
      words: [wordsFor(d.qualities), e.premise || "", (e.keywords || []).join(" "), e.details || ""].join(" ").toLowerCase(),
    };
    if (cache.size > 20000) cache.clear();
    cache.set(key, t);
  }
  return t;
}

module.exports = { traits };
