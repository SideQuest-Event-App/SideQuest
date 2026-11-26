// Qualities: what an event is like beyond its vibe. The premise ("phones down"), the crowd ("queer", "Desi"), the rules
// ("19+", "dress code"), the format ("DJ sets", "hands-on") and the feel ("late night", "intimate"). Plain rules, no AI,
// so every import tags every listing. The AI tagger (lib/tagger.js) may add more from the same list.
//
//   qualitiesOf(e)   the labels that fit an event, from its title, categories, description, details, venue and organizer
//   wordsFor(labels) the words each label stands for, so a search for "offline" or "no phones" finds "Phone-free"
//   infoOf(e)        "thin" when the listing says too little to know what the night is like (flagged, never guessed)
//
// Each quality: label (shown on the event page), kind (premise, crowd, rules, format, feel), test (a pattern on the
// listing's words), and words (what people might type for it). A few look at more than words (price, start time,
// venue). Keep labels short: they're chips on the event page.

// Venues whose nights are queer by default (the listing often doesn't say so)
const QUEER_VENUES = /\b(black eagle|buddies in bad times|crews (and|&) tangos|woody'?s|glad day|the 519|church street|henhouse|pegasus on church|statlers?|o'?grady'?s on church|sailor bar|the drink|club 120|tallboys)\b/i;

const QUALITIES = [
  // The premise: what makes the night itself different
  { label: "Phone-free", kind: "premise", test: /\b(phones (down|off|away|free|locked|pouch(es)?)|phone (off|away|free|locked|pouch(es)?)|no[- ]phones?|phone[- ]free|without (your|a) phones?|leave (your )?phones?|yondr|offline|unplugged|disconnect(ed)? to (re)?connect|no (photos|photography|cameras)|live it in person|be (fully )?present|in the moment)\b/i, words: "phone-free no-phone no phones phones off phones down offline unplugged present in the moment no photos" },
  { label: "Silent disco", kind: "premise", test: /\bsilent (disco|party|rave)|headphone (party|disco)\b/i, words: "silent disco headphones" },
  { label: "Secret location", kind: "premise", test: /\b(secret|undisclosed|location (tba|tbd|revealed|sent)|address (sent|revealed|released))\b/i, words: "secret location surprise venue underground" },
  { label: "Warehouse & underground", kind: "premise", test: /\b(warehouse|underground|basement party|loft party|after[- ]?hours?)\b/i, words: "warehouse underground afterhours rave loft" },
  { label: "Sober & alcohol-free", kind: "premise", test: /\b(sober|alcohol[- ]free|booze[- ]free|zero[- ]proof|mocktails?|dry (party|night|january)|substance[- ]free)\b/i, words: "sober alcohol-free no alcohol mocktails dry" },
  { label: "Dress code", kind: "rules", test: /\b(dress code|dress to impress|wear (all )?(black|white|red|pink)|all[- ](black|white) attire|costumes? (encouraged|required|contest)|themed? (dress|attire|outfits?))\b/i, words: "dress code outfit costume theme" },
  { label: "Pay what you can", kind: "rules", test: /\b(pwyc|pay[- ]what[- ]you[- ]can|sliding scale|by donation|suggested donation)\b/i, words: "pwyc pay what you can sliding scale donation cheap" },
  { label: "Free", kind: "rules", test: (e) => e.price === 0, words: "free no cover" },
  { label: "19+", kind: "rules", test: /\b(19\s?\+|19 and (over|up)|19 plus|ages? 19|18\s?\+|21\s?\+|valid (government |gov'?t )?(photo )?id)\b/i, words: "19+ adults only of age" },
  { label: "All ages", kind: "rules", test: /\b(all[- ]ages|family[- ]friendly|kids? (welcome|free|under)|for (the )?(whole )?family|children)\b/i, words: "all ages family kids" },
  { label: "Accessible", kind: "rules", test: /\b(wheelchair[- ]accessible|barrier[- ]free|step[- ]free|asl[- ]interpret\w*|relaxed performance|accessible (venue|entrance|washroom))\b/i, words: "accessible wheelchair asl relaxed" },
  { label: "For vendors", kind: "rules", test: /\b(calling all vendors|vendors? (wanted|call|application|registration|spots? available)|apply to (be a )?vend(or)?|become a vendor|vendor booth)\b/i, words: "vendors booth sell apply" },

  // The crowd: who it's made by or for
  { label: "Queer & 2SLGBTQ+", kind: "crowd", test: (e, t) => /\b(queer|lgbt\w*|2slgbt\w*|gay|lesbian|dyke|trans (folks|people|joy|community)|nonbinary|non-binary|pride|drag|ballroom|vogue|bears? night|sapphic|homo\w*|qtbipoc|qtpoc)\b/i.test(t) || QUEER_VENUES.test(`${e.venue && e.venue.name} ${e.venue && e.venue.address}`), words: "queer gay lgbtq 2slgbtq lesbian trans pride" },
  { label: "Drag", kind: "crowd", test: /\b(drag (queen|king|show|brunch|bingo|race|night|performance|artists?)|drag\b.*\b(queens?|kings?)|in drag)\b/i, words: "drag queens kings show brunch" },
  { label: "Ballroom & vogue", kind: "crowd", test: /\b(vogue|voguing|ballroom|kiki ball|kiki scene|walk the ball)\b/i, words: "vogue voguing ballroom ball kiki" },
  { label: "Kink & leather", kind: "crowd", test: /\b(kink\w*|fetish|leather (night|bar|men|party|community)|bdsm|rubber|harness|puppy play|cruising|play party)\b/i, words: "kink leather fetish bdsm cruising" },
  { label: "Black community", kind: "crowd", test: /\b(all[- ]black|black[- ](owned|led|excellence|joy|history|creatives?|women|men|comedians?)|afro(beats?|centric|[- ]?caribbean)?|caribbean|dancehall|soca|carnival)\b/i, words: "black afro caribbean afrobeats dancehall soca" },
  { label: "Desi & South Asian", kind: "crowd", test: /\b(desi|bollywood|bhangra|punjabi|south asian|all indian|tamil|bengali|gujarati|garba|diwali|holi|pakistani|sri lankan)\b/i, words: "desi indian bollywood bhangra punjabi south asian" },
  { label: "East & Southeast Asian", kind: "crowd", test: /\b(k-?pop|j-?pop|c-?pop|korean|japanese|chinese|cantonese|mandarin|filipin[oa]|vietnamese|thai|asian (night|party|market|heritage)|lunar new year|soju)\b/i, words: "asian korean japanese chinese filipino kpop" },
  { label: "Latin", kind: "crowd", test: /\b(latin[oax]?\w*|reggaeton|salsa|bachata|merengue|cumbia|perreo|dembow|hispanic|mexican|colombian|brazilian|samba|baile funk)\b/i, words: "latin latino reggaeton salsa bachata perreo" },
  { label: "Women & femme", kind: "crowd", test: /\b(women[- ]only|for women|women's (night|circle|only)|ladies[- ](night|only)|femme(s)?\b|girls'? night|sisterhood)\b/i, words: "women femme ladies girls night" },
  { label: "Singles & dating", kind: "crowd", test: /\b(singles?|speed dating|dating (event|night)|matchmaking|find (love|a date))\b/i, words: "singles dating speed dating date" },
  { label: "Newcomers welcome", kind: "crowd", test: /\b(newcomers?|first[- ]timers?|new (to|in) (toronto|the city)|make (new )?friends|meet new people|solo (attendees|friendly|travellers)|come solo|beginners? welcome|no experience (needed|necessary|required)|all (skill )?levels)\b/i, words: "beginners newcomers solo make friends meet people first time" },

  // The format: what you'll actually be doing
  { label: "DJ sets", kind: "format", test: /\b(djs?\b|dj set|b2b|selectors?|turntabl\w*|club night|rave\b|line-?up\b[\s\S]{0,60}?\s(×|x|b2b|&)\s)/i, words: "dj djs set club night rave dance party" },
  { label: "Dance floor", kind: "format", test: /\b(dance (party|floor|night)|dancefloor|club night|rave|party all night|get on the floor|disco)\b/i, words: "dance party dancing club night disco" },
  { label: "Live band", kind: "format", test: /\b(live band|live music|in concert|concert|live set|gig|unplugged set|acoustic set)\b/i, words: "live band music concert gig" },
  { label: "Stand-up", kind: "format", test: /\b(stand[- ]?up|comedy (show|night|open mic)|comedians?|open mic comedy)\b/i, words: "stand-up comedy comedians jokes" },
  { label: "Open mic", kind: "format", test: /\bopen[- ]mic\b/i, words: "open mic perform sign up" },
  { label: "Hands-on", kind: "format", test: /\b(workshop|hands[- ]on|make your own|diy|craft night|paint(ing)? (night|class)|pottery|crochet|knitting|class\b)\b/i, words: "workshop hands-on make diy class craft" },
  { label: "Games & trivia", kind: "format", test: /\b(trivia|quiz|bingo|board games?|game night|karaoke|scavenger hunt|escape room|tournament)\b/i, words: "trivia bingo games karaoke quiz" },
  { label: "Talk & discussion", kind: "format", test: /\b(panel|talk|lecture|discussion|q ?& ?a|fireside chat|book (club|launch)|reading)\b/i, words: "talk panel discussion lecture book club" },
  { label: "Screening", kind: "format", test: /\b(screening|film night|movie night|premiere|short films?|cinema)\b/i, words: "screening film movie cinema" },
  { label: "Market & pop-up", kind: "format", test: /\b(market|pop[- ]?up|bazaar|vendors?|flea|craft (fair|show)|makers? (fair|market))\b/i, words: "market pop-up vendors shopping bazaar" },
  { label: "Food & tasting", kind: "format", test: /\b(tasting|omakase|supper club|dinner (party|series)|chef'?s table|prix fixe|brunch|food (crawl|festival)|wine (tasting|night)|cocktail (class|night))\b/i, words: "food tasting dinner supper club omakase brunch wine" },
  { label: "Healing & mindful", kind: "format", test: /\b(sound (bath|healing|journey)|meditation|breathwork|reiki|yoga|somatic|cacao ceremony|vision board|journaling|mindful\w*|manifest\w*|ecstatic dance)\b/i, words: "sound bath healing meditation breathwork yoga mindful vision board" },
  { label: "Outdoors", kind: "format", test: /\b(outdoors?|outside|open[- ]air|in the park|at the park|park (walk|run|picnic|cleanup|clean-up)|picnic|patio|rooftop|hike|hiking|trail (walk|run)|on the beach|beach (party|volleyball|cleanup)|island)\b/i, words: "outdoor outside park rooftop patio" },

  // The feel: when and how it runs
  { label: "Late night", kind: "feel", test: (e, t) => { const h = hourOf(e.startsAt); return (h != null && (h >= 22 || h < 4) && !placeholderTime(e.startsAt)) || /\b(till late|until late|to late|- late|– late|til (2|3|4|5) ?am|after[- ]?hours?|all night)\b/i.test(t); }, words: "late night late afterhours all night" },
  { label: "Daytime party", kind: "feel", test: (e, t) => { const h = hourOf(e.startsAt); return h != null && h >= 10 && h < 18 && /\b(party|dj|day ?party|day ?time|rave|dance)\b/i.test(t); }, words: "day party daytime afternoon" },
  { label: "Intimate", kind: "feel", test: /\b(intimate|small (group|room|venue|gathering)|limited (spots|capacity|seats|tickets)|only \d+ (spots|seats|tickets)|cozy|cosy|living room|house (show|concert))\b/i, words: "intimate small cozy limited spots" },
  { label: "Holiday", kind: "feel", test: /\b(christmas|xmas|holiday|hanukkah|chanukah|kwanzaa|new year'?s|nye|winter solstice|festive|ugly sweater|santa)\b/i, words: "christmas holiday festive new year nye winter" },
  { label: "Recurring night", kind: "feel", test: /\b(every (mon|tues|wednes|thurs|fri|satur|sun)day|weekly|monthly|bi-?weekly|(first|last|second|third) (mon|tues|wednes|thurs|fri|satur|sun)day of (the|every) month|residency)\b/i, words: "weekly monthly regular residency every week" },
];

const LABELS = QUALITIES.map((q) => q.label);
const BY_LABEL = new Map(QUALITIES.map((q) => [q.label, q]));

// 11:59 PM (or exactly midnight) is how some sources write "no time given": not a late start
function placeholderTime(iso) {
  const t = new Date(iso).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "America/Toronto" });
  return /^(23:59|24:00|00:00)$/.test(t);
}
function hourOf(iso) {
  if (!iso || isNaN(Date.parse(iso))) return null;
  return Number(new Date(iso).toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Toronto" })) % 24;
}

const textOf = (e) => [e.title, (e.tags || []).join(" "), e.description, e.details, e.venue && e.venue.name, e.organizer && (e.organizer.name || e.organizer), e.priceNote]
  .filter((x) => x && x !== "N/A").join(" \n ");

function qualitiesOf(e) {
  const t = textOf(e);
  const out = [];
  for (const q of QUALITIES) {
    try {
      if (typeof q.test === "function" ? q.test(e, t) : q.test.test(t)) out.push(q.label);
    } catch {}
  }
  // DJs at a party or late at night: there's a dance floor, even when the listing never says "dance"
  if (out.includes("DJ sets") && !out.includes("Dance floor") && (out.includes("Late night") || /\b(party|club|rave)\b/i.test(t))) out.push("Dance floor");
  // A drag, ballroom or kink night is queer even when the listing doesn't say the word
  if (out.some((l) => l === "Drag" || l === "Ballroom & vogue") && !out.includes("Queer & 2SLGBTQ+")) out.push("Queer & 2SLGBTQ+");
  return out;
}

const wordsFor = (labels) => (labels || []).map((l) => (BY_LABEL.get(l) ? `${l} ${BY_LABEL.get(l).words}` : l)).join(" ");

// Meaningful words the listing gives about the event itself (not its title, venue or date): fewer than 10, and
// no AI reading of it, means we can't honestly say what the night is like, so it's flagged instead of guessed.
const STOP = new Set("the a an and or of to in on at for with by from is are be this that it its our your we you will join us event events tickets ticket toronto night party come all more info".split(" "));
function infoOf(e) {
  const about = `${e.description && e.description !== "N/A" ? e.description : ""} ${e.details || ""}`.toLowerCase();
  const words = new Set((about.match(/[a-z][a-z'-]{2,}/g) || []).filter((w) => !STOP.has(w)));
  if (e.premise) return words.size >= 6 ? "enough" : "ai";
  return words.size >= 10 ? "enough" : "thin";
}

module.exports = { QUALITIES, LABELS, qualitiesOf, wordsFor, infoOf, QUEER_VENUES };

// An event with its qualities (the rules' plus any the AI tagger added) and how much the listing tells us
function describe(e) {
  const qualities = [...new Set([...qualitiesOf(e), ...(e.aiQualities || [])])];
  const info = e.aiThin && !e.premise ? "thin" : infoOf(e);
  return { ...e, qualities, info };
}
module.exports.describe = describe;

// The qualities a search names ("queer dance party" → Queer & 2SLGBTQ+, Dance floor; "no phones" → Phone-free):
// the same rules, run on the typed words. Time and price rules need an event, so they never fire here.
function askedQualities(text) {
  const t = String(text || "");
  const out = [];
  for (const q of QUALITIES) {
    try {
      if (typeof q.test === "function" ? q.test({}, t) : q.test.test(t)) out.push(q.label);
    } catch {}
  }
  return out;
}
module.exports.askedQualities = askedQualities;
