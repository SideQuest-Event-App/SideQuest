// What someone actually asked for, in their own words: a cuisine, a dish or a kind of venue ("Chinese skewers",
// "chuan'r", "karaoke with private rooms", "rooftop patio"). The 21 app vibes can't say any of that, so before this
// a skewer request searched Google for the vibe's fixed query ("cocktail bar") and got cocktail bars.
//
//   find(text)            the specifics said in a line or a typed search: ["Chinese skewers"] (no AI)
//   clean(text)           a want made safe to show the crew: no amounts, numbers, areas or contact details
//   plan(wants)           how to search places for it: { query, includedType, terms, food }
//   relevance(place, w)   0 to 1: how well a place (Google or Foursquare) matches the wants, from its types or
//                         categories, its name and its editorial summary. Used to filter and re-rank picks.
//
// Google types are from the Places API (New) Table A. Only long-standing ones go into includedType; if Google ever
// rejects one (400), places.js retries the search without it.

// Cuisines: the words people say -> Google's restaurant type and words that show it on a place
const CUISINES = {
  chinese: { type: "chinese_restaurant", words: ["chinese", "szechuan", "sichuan", "cantonese", "hunan", "dongbei", "xinjiang", "shanghainese", "taiwanese"], label: "Chinese" },
  japanese: { type: "japanese_restaurant", words: ["japanese", "izakaya"], label: "Japanese" },
  korean: { type: "korean_restaurant", words: ["korean"], label: "Korean" },
  thai: { type: "thai_restaurant", words: ["thai"], label: "Thai" },
  vietnamese: { type: "vietnamese_restaurant", words: ["vietnamese"], label: "Vietnamese" },
  indian: { type: "indian_restaurant", words: ["indian", "punjabi", "south indian"], label: "Indian" },
  italian: { type: "italian_restaurant", words: ["italian", "trattoria"], label: "Italian" },
  mexican: { type: "mexican_restaurant", words: ["mexican", "taqueria"], label: "Mexican" },
  greek: { type: "greek_restaurant", words: ["greek"], label: "Greek" },
  french: { type: "french_restaurant", words: ["french", "bistro"], label: "French" },
  spanish: { type: "spanish_restaurant", words: ["spanish", "tapas"], label: "Spanish" },
  lebanese: { type: "lebanese_restaurant", words: ["lebanese"], label: "Lebanese" },
  middle_eastern: { type: "middle_eastern_restaurant", words: ["middle eastern", "persian", "afghan"], label: "Middle Eastern" },
  turkish: { type: "turkish_restaurant", words: ["turkish"], label: "Turkish" },
  ethiopian: { type: "african_restaurant", words: ["ethiopian", "eritrean"], label: "Ethiopian" },
  caribbean: { type: "restaurant", words: ["caribbean", "jamaican", "trini"], label: "Caribbean" },
  filipino: { type: "restaurant", words: ["filipino"], label: "Filipino" },
  vegan: { type: "vegan_restaurant", words: ["vegan", "plant-based", "plant based"], label: "Vegan" },
  vegetarian: { type: "vegetarian_restaurant", words: ["vegetarian"], label: "Vegetarian" },
};
// Dishes: the words people say -> a Google type where one says it exactly, the cuisine it implies, and the words
// (synonyms, transliterations) that show a place serves it
const DISHES = {
  skewers: { words: ["skewers", "skewer", "chuan'r", "chuanr", "chuan", "chuan er", "yang rou chuan", "yakitori", "kushiyaki", "kebab", "kebabs", "kabob", "kabobs", "brochette", "satay", "souvlaki", "bbq skewers"], label: "skewers" },
  ramen: { type: "ramen_restaurant", cuisine: "japanese", words: ["ramen"], label: "ramen" },
  sushi: { type: "sushi_restaurant", cuisine: "japanese", words: ["sushi", "omakase", "sashimi"], label: "sushi" },
  pizza: { type: "pizza_restaurant", cuisine: "italian", words: ["pizza", "pizzeria"], label: "pizza" },
  burgers: { type: "hamburger_restaurant", words: ["burger", "burgers"], label: "burgers" },
  bbq: { type: "barbecue_restaurant", words: ["bbq", "barbecue", "smokehouse"], label: "BBQ" },
  korean_bbq: { type: "korean_restaurant", cuisine: "korean", words: ["korean bbq", "kbbq", "korean barbecue"], label: "Korean BBQ" },
  hot_pot: { cuisine: "chinese", words: ["hot pot", "hotpot", "shabu shabu", "shabu-shabu"], label: "hot pot" },
  dim_sum: { cuisine: "chinese", words: ["dim sum", "dimsum", "yum cha"], label: "dim sum" },
  dumplings: { cuisine: "chinese", words: ["dumplings", "dumpling", "xiao long bao", "xlb", "gyoza", "momo", "momos", "pierogi"], label: "dumplings" },
  noodles: { words: ["noodles", "noodle", "hand-pulled", "hand pulled", "lamian", "biang biang"], label: "noodles" },
  pho: { type: "vietnamese_restaurant", cuisine: "vietnamese", words: ["pho", "banh mi", "bánh mì", "phở"], label: "pho" },
  tacos: { type: "mexican_restaurant", cuisine: "mexican", words: ["tacos", "taco", "birria", "burrito", "burritos"], label: "tacos" },
  curry: { words: ["curry", "biryani", "butter chicken"], label: "curry" },
  shawarma: { type: "middle_eastern_restaurant", words: ["shawarma", "falafel", "doner", "döner"], label: "shawarma" },
  fried_chicken: { words: ["fried chicken", "wings", "chicken wings", "hot chicken"], label: "fried chicken" },
  seafood: { type: "seafood_restaurant", words: ["seafood", "oysters", "oyster bar", "lobster", "crab"], label: "seafood" },
  steak: { type: "steak_house", words: ["steak", "steakhouse"], label: "steak" },
  brunch: { type: "brunch_restaurant", words: ["brunch"], label: "brunch" },
  dessert: { type: "dessert_shop", words: ["dessert", "desserts", "gelato", "ice cream", "bubble tea", "boba", "cake"], label: "dessert" },
  coffee: { type: "coffee_shop", words: ["coffee", "espresso", "latte"], label: "coffee" },
  bakery: { type: "bakery", words: ["bakery", "pastries", "croissant", "croissants"], label: "bakery" },
  sandwiches: { type: "sandwich_shop", words: ["sandwich", "sandwiches", "deli"], label: "sandwiches" },
};
// Kinds of venue and features of one ("karaoke with private rooms", "rooftop patio")
const VENUES = {
  karaoke: { type: "karaoke", words: ["karaoke", "noraebang", "ktv"], label: "karaoke" },
  wine_bar: { type: "wine_bar", words: ["wine bar"], label: "wine bar" },
  cocktail_bar: { type: "bar", words: ["cocktail bar", "speakeasy", "cocktails"], label: "cocktail bar" },
  pub: { type: "pub", words: ["pub", "gastropub", "sports bar"], label: "pub" },
  brewery: { type: "bar", words: ["brewery", "brewpub", "craft beer"], label: "brewery" },
  bowling: { type: "bowling_alley", words: ["bowling"], label: "bowling" },
  arcade: { type: "video_arcade", words: ["arcade", "barcade", "pinball"], label: "arcade" },
  billiards: { words: ["pool hall", "billiards", "snooker"], label: "pool hall" },
  escape_room: { words: ["escape room", "escape rooms"], label: "escape room" },
  board_games: { type: "cafe", words: ["board game cafe", "board game café", "board games"], label: "board game cafe" },
  axe: { words: ["axe throwing", "axe-throwing"], label: "axe throwing" },
  mini_golf: { words: ["mini golf", "minigolf", "mini-golf"], label: "mini golf" },
  jazz_bar: { type: "bar", words: ["jazz bar", "jazz club"], label: "jazz bar" },
  night_club: { type: "night_club", words: ["nightclub", "night club"], label: "nightclub" },
  tea_house: { type: "tea_house", words: ["tea house", "teahouse"], label: "tea house" },
  dessert_cafe: { type: "cafe", words: ["cat cafe", "cat café"], label: "cat cafe" },
};
const FEATURES = {
  private_rooms: { words: ["private rooms", "private room", "private booth", "private booths"], label: "private rooms" },
  rooftop: { words: ["rooftop", "roof top", "roof-top"], label: "rooftop" },
  patio: { words: ["patio", "terrace", "beer garden"], label: "patio" },
  all_you_can_eat: { words: ["all you can eat", "all-you-can-eat", "ayce"], label: "all-you-can-eat" },
  halal: { words: ["halal"], label: "halal" },
  cheap_eats: { words: ["cheap eats", "hole in the wall", "hole-in-the-wall"], label: "cheap eats" },
};
const GROUPS = { cuisine: CUISINES, dish: DISHES, venue: VENUES, feature: FEATURES };
// Generic food words: on their own they're the vibe ("Food & drink"), but next to a cuisine they're part of the want
const FILLER = ["restaurant", "restaurants", "food", "place", "spot", "joint", "stall", "bar"];

// Every phrase we know, longest first, as [phrase, group, key]
const LEXICON = Object.entries(GROUPS)
  .flatMap(([g, map]) => Object.entries(map).flatMap(([k, d]) => d.words.map((w) => [w, g, k])))
  .sort((a, b) => b[0].length - a[0].length);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const norm = (s) => String(s || "").toLowerCase().replace(/[’‘`]/g, "'").replace(/[^\p{L}\p{N}' &-]+/gu, " ").replace(/\s+/g, " ").trim();
const PHRASE_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${LEXICON.map(([w]) => escRe(w)).join("|")})(?![\\p{L}\\p{N}])`, "gu");
const byWord = new Map(LEXICON.map(([w, g, k]) => [w, [g, k]]));

// Terms found in a text, in order: [{ start, end, word, group, key }]. "not X" / "no X" / "hate X" are skipped.
function terms(text) {
  const t = norm(text);
  const out = [];
  for (const m of t.matchAll(PHRASE_RE)) {
    const before = t.slice(Math.max(0, m.index - 24), m.index);
    if (/\b(not|no|never|hate|without|except|anything but|tired of|sick of)\s+(\w+\s+){0,1}$/.test(before)) continue;
    const [group, key] = byWord.get(m[1]);
    out.push({ start: m.index, end: m.index + m[1].length, word: m[1], group, key });
  }
  return { t, out };
}

// The phrases someone asked for: neighbouring terms (and "with"/"and" between a venue and a feature) join into one
// ("chinese skewers", "karaoke with private rooms", "rooftop patio"); a cuisine followed by "restaurant" keeps it.
function find(text) {
  const { t, out } = terms(text);
  if (!out.length) return [];
  const groups = [];
  let cur = null;
  for (const x of out) {
    const gap = cur ? t.slice(cur.end, x.start) : "";
    const joins = cur && (/^\s*$/.test(gap) || (/^\s+(with|and|for|on a|on the|that has|that have)\s+$/.test(gap) && (x.group === "feature" || cur.parts.some((p) => p.group === "feature"))));
    if (joins) { cur.end = x.end; cur.parts.push(x); }
    else { cur = { start: x.start, end: x.end, parts: [x] }; groups.push(cur); }
  }
  const wants = [];
  for (const g of groups) {
    let end = g.end;
    const tail = t.slice(end).match(/^\s+(restaurant|restaurants|place|spot|joint|bar)\b/);
    if (tail && g.parts.every((p) => p.group === "cuisine" || p.group === "dish")) end += tail[0].length;
    const phrase = t.slice(g.start, end).trim();
    wants.push(pretty(phrase));
  }
  return [...new Set(wants.map(clean).filter(Boolean))].slice(0, 3);
}

// Cuisines and proper names keep their capital ("Chinese skewers", "Korean BBQ")
function pretty(phrase) {
  let s = phrase;
  for (const d of Object.values(CUISINES)) for (const w of d.words) s = s.replace(new RegExp(`(?<![\\p{L}])${escRe(w)}(?![\\p{L}])`, "gu"), (m) => m.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase()));
  s = s.replace(/\bbbq\b/gi, "BBQ").replace(/\bkbbq\b/gi, "KBBQ").replace(/\bktv\b/gi, "KTV");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Safe to show on the shared board: words only, short, no amounts, numbers, emails, links or area names (an area
// someone would rather avoid is private), and nothing that's only filler
const AREAS = /\b(west end|downtown|east end|north york|scarborough|etobicoke|midtown)\b/gi;
function clean(text) {
  let s = String(text || "")
    .replace(/\S+@\S+/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\$\s?\d+(\.\d+)?|\b\d+\s?(bucks|dollars|dollar|cad)\b/gi, " ")
    .replace(/\d+/g, " ")
    .replace(AREAS, " ")
    .replace(/[^\p{L}' &-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Connector words left dangling where an amount or an area was cut ("sushi near for" -> "sushi")
  const DANGLING = /(^|\s)(under|below|budget|max|maximum|about|around|less than|than|cheap|cheaper|broke|in|near|for|at|by|not|no|and|or|with|the|a)$/i;
  while (DANGLING.test(s)) s = s.replace(DANGLING, "").trim();
  if (s.length > 48) s = s.slice(0, 48).replace(/\s+\S*$/, "");
  if (!s || FILLER.includes(s.toLowerCase())) return "";
  return s;
}

// How to search for a set of wants: the first want's words as a Text Search query, a type to narrow it when the
// want names one (a dish's own type beats its cuisine's; a venue's type when there's no food in it), and every term
// to match places against
function plan(wants) {
  const list = [].concat(wants || []).map(clean).filter(Boolean);
  if (!list.length) return null;
  const found = list.flatMap((w) => terms(w).out);
  const of = (g) => found.filter((x) => x.group === g).map((x) => GROUPS[g][x.key]);
  const dishes = of("dish"), cuisines = of("cuisine"), venues = of("venue");
  const food = Boolean(dishes.length || cuisines.length);
  const includedType = (dishes.find((d) => d.type) || {}).type
    || (cuisines.find((c) => c.type && c.type !== "restaurant") || {}).type
    || (dishes.find((d) => d.cuisine && CUISINES[d.cuisine].type !== "restaurant") ? CUISINES[dishes.find((d) => d.cuisine).cuisine].type : null)
    || (!food ? (venues.find((v) => v.type) || {}).type : null)
    || (food ? "restaurant" : null);
  const main = list[0];
  const query = food && !/\b(restaurant|place|spot|joint|bar|cafe|shop)\b/i.test(main) ? `${main} restaurant` : main;
  return { query, includedType, food, wants: list, terms: found, label: list.join(", ") };
}

// The types (Google) and words that show a place matches one term
function evidence(x) {
  const d = GROUPS[x.group][x.key];
  const types = new Set([d.type, ...(d.cuisine ? [CUISINES[d.cuisine].type] : [])].filter((t) => t && t !== "restaurant" && t !== "bar" && t !== "cafe"));
  return { types, words: d.words, group: x.group };
}
const hasWord = (hay, words) => words.some((w) => new RegExp(`(?<![\\p{L}])${escRe(w)}(?![\\p{L}])`, "u").test(hay));

// 0 to 1. Per term: an exact place type (or a Foursquare category naming it) 1, the place's name 0.9, its editorial
// summary 0.75; a want with several terms (cuisine + dish) needs the dish (or venue) to show for a high score.
// A food want and a place that's only a bar, a club or a gallery scores 0, whatever its rating.
const FOOD_TYPES = /restaurant|food|meal_|bakery|cafe|coffee|diner|deli|sandwich|steak_house|dessert|ice_cream|bistro|brasserie|eatery|noodle|dumpling|tea_house|bar_and_grill|fast_food|buffet/;
function relevance(p, wants) {
  const pl = wants && wants.terms ? wants : plan(wants);
  if (!pl || !pl.terms.length) return 1;
  const types = new Set([...(p.types || p.tags || []), p.primaryType].filter(Boolean));
  const cats = norm((p.categories || []).map((c) => (typeof c === "string" ? c : c.name || "")).join(" | "));
  const name = norm(p.title || (p.displayName && p.displayName.text) || p.name || "");
  const summary = norm(p.summary || (p.editorialSummary && p.editorialSummary.text) || "");
  const isFood = [...types].some((t) => FOOD_TYPES.test(t)) || /restaurant|food|joint|eatery|bbq|noodle|dumpling|kebab|bakery|caf/.test(cats);
  if (pl.food && !isFood) return 0;
  const score = (x) => {
    const ev = evidence(x);
    if ([...ev.types].some((t) => types.has(t))) return 1;
    if (hasWord(cats, ev.words)) return 1;
    if (hasWord(name, ev.words)) return 0.9;
    if (hasWord(summary, ev.words)) return 0.75;
    return 0;
  };
  const scores = pl.terms.map((x) => ({ x, s: score(x) }));
  // The specific part of the want (a dish, a venue kind) matters most; a cuisine or a feature alone is half a match
  const core = scores.filter((y) => y.x.group === "dish" || y.x.group === "venue");
  const side = scores.filter((y) => y.x.group === "cuisine" || y.x.group === "feature");
  const best = (arr) => (arr.length ? Math.max(...arr.map((y) => y.s)) : null);
  const c = best(core), sd = best(side);
  if (c == null) return sd;
  if (sd == null) return c;
  const mixed = Math.min(1, c * 0.8 + sd * 0.2 + (c && sd ? 0.1 : 0));
  // A food want whose cuisine the place shows by its type or category ("chinese_restaurant" for "Chinese skewers"):
  // the menu may well have the dish, so it counts as relevant (NEAR), ranked below every place that shows the dish
  // itself in its name or summary (0.75 and up)
  const cuisineType = pl.food && scores.some((y) => y.x.group === "cuisine" && y.s === 1);
  if (cuisineType && c < 0.75) return Math.max(mixed, NEAR);
  // Google or Foursquare returned it for this very want and its cuisine shows in its name: it just clears the bar
  return p.wantQuery && p.wantQuery === pl.query && sd >= 0.9 ? Math.max(mixed, 0.55) : mixed;
}
const NEAR = 0.6;
const EXACT = 0.75;

// How a place matches, for a results list: "exact" (it shows what was asked for: the dish or venue in its type,
// category, name or summary), "near" (only the cuisine matches, for a food want: "Chinese restaurants" for
// "Chinese skewers"), or null. near is the words to say what it is instead ("Chinese restaurants").
function match(p, wants) {
  const pl = wants && wants.terms ? wants : plan(wants);
  const r = relevance(p, pl);
  if (r >= EXACT) return { score: r, tier: "exact" };
  if (r >= 0.5) return { score: r, tier: "near", near: nearLabel(pl) };
  return { score: r, tier: null };
}
// "Chinese restaurants" for a want with a cuisine, else "restaurants" (food) or "places"
function nearLabel(pl) {
  const c = pl && pl.terms.find((x) => x.group === "cuisine");
  if (c) return `${CUISINES[c.key].label} restaurants`;
  return pl && pl.food ? "restaurants" : "places";
}
// What was asked for, said short ("skewer spots", "hot pot spots", "karaoke spots"), for "No skewer spots found"
function askedLabel(pl) {
  if (!pl) return "matching spots";
  const core = pl.terms.find((x) => x.group === "dish" || x.group === "venue") || pl.terms[0];
  if (!core) return `${pl.label} spots`;
  const label = GROUPS[core.group][core.key].label;
  const one = core.group === "dish" && /s$/.test(label) && !/ss$/.test(label) ? label.slice(0, -1) : label;
  return `${one} spots`;
}
const isFood = (p) => [...(p.types || p.tags || []), p.primaryType].filter(Boolean).some((t) => FOOD_TYPES.test(t));

// A short phrase that isn't in the lexicon ("poutine", "a jazz bar with a fireplace"), kept only when it reads like a
// specific ask: up to 5 words and none of the vague ones ("something fun", "whatever")
const VAGUE = /\b(something|anything|whatever|fun|chill|good|nice|night|out|cool|idk|sure|maybe|either|stuff|thing|vibe|vibes)\b/i;
function loose(text) {
  const c = clean(text);
  return c && c.split(" ").length <= 5 && !VAGUE.test(c) ? c : "";
}

module.exports = { find, clean, loose, plan, relevance, match, nearLabel, askedLabel, isFood, terms, CUISINES, DISHES, VENUES, FEATURES, MIN_RELEVANCE: 0.5, NEAR, EXACT };
