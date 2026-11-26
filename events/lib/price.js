// Prices from listings, in one place so every source reads them the same way.
//   parsePrice("CA$25.00") -> 25, parsePrice("Free") -> 0, parsePrice("TBA") -> null
//   offersPrice(jsonLdOffers) -> { low, high, currency } from schema.org Offer / AggregateOffer (nested too)
//   ticketmasterPrice(event) -> { low, high, currency } from a Discovery API event's priceRanges
//   saysFree(text) -> true only when the listing itself says entry is free ("Free admission", "Free event")
// Nothing here guesses: a price is only filled in when the listing states it.

const USD_TO_CAD = 1.37; // Eventbrite sometimes shows prices converted to USD

// A number from whatever shape a site uses: 25, "25", "25.00", "CA$25.00", "$25 - $40" (the low end), "Free"
function parsePrice(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  // Eventbrite's money objects: major_value is dollars ("15.00"); value is cents (1500); display is "CA$15.00"
  if (typeof v === "object") return v.major_value != null ? parsePrice(v.major_value) : v.amount != null ? parsePrice(v.amount) : v.value != null ? parsePrice(Number(v.value) / 100) : parsePrice(v.display);
  const s = String(v).trim();
  if (/^(free|gratuit|no charge|\$?0(\.0+)?)$/i.test(s)) return 0;
  const m = s.replace(/,(\d{3})\b/g, "$1").match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n < 10000 ? n : null;
}

// schema.org offers: an Offer, an AggregateOffer (lowPrice/highPrice, maybe with its own offers), or a list of either
function offersPrice(offers) {
  const lows = [];
  const highs = [];
  let currency = null;
  let free = false;
  const visit = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(visit);
    if (o.priceCurrency && !currency) currency = String(o.priceCurrency).toUpperCase();
    if (o.isAccessibleForFree === true || o.isAccessibleForFree === "True") free = true;
    const low = parsePrice(o.lowPrice != null ? o.lowPrice : o.price);
    const high = parsePrice(o.highPrice != null ? o.highPrice : o.price);
    if (low != null) lows.push(low);
    if (high != null) highs.push(high);
    if (o.priceSpecification) visit(o.priceSpecification);
    if (o.offers) visit(o.offers);
  };
  visit(offers);
  if (!lows.length && free) return { low: 0, high: 0, currency };
  if (!lows.length) return null;
  return { low: Math.min(...lows), high: Math.max(...(highs.length ? highs : lows)), currency };
}

// Converted to CAD when the site showed USD; { price, priceHigh, priceNote } ready for a raw listing
function toCad(p) {
  if (!p) return { price: null, priceHigh: null, priceNote: null };
  const usd = p.currency === "USD";
  const k = usd ? USD_TO_CAD : 1;
  const price = p.low * k;
  const priceHigh = p.high * k;
  const priceNote = usd && price > 0 ? `About $${Math.ceil(price)}${priceHigh > price + 1 ? "+" : ""} (converted)` : null;
  return { price, priceHigh, priceNote };
}

// Ticketmaster: every price range (standard, with fees, platinum...). The lowest "standard" range when there is one,
// since platinum and resale ranges start far above what most tickets cost.
function ticketmasterPrice(e) {
  const ranges = ((e && e.priceRanges) || []).filter((r) => r && (parsePrice(r.min) != null || parsePrice(r.max) != null));
  if (!ranges.length) return null;
  const standard = ranges.filter((r) => !r.type || /standard/i.test(r.type));
  const use = standard.length ? standard : ranges;
  const lows = use.map((r) => parsePrice(r.min != null ? r.min : r.max)).filter((n) => n != null);
  const highs = use.map((r) => parsePrice(r.max != null ? r.max : r.min)).filter((n) => n != null);
  return { low: Math.min(...lows), high: Math.max(...highs), currency: (use[0].currency || "CAD").toUpperCase() };
}

// The listing says it's free, in so many words. "Free entry before 11" or "free for members" don't count.
const FREE = /\b(free (admission|entry|event|entrance|to attend|for everyone|for all|and open to (the public|all|everyone))|admission is free|entry is free|this (event|program) is free|no cover( charge)?)\b/i;
const NOT_REALLY = /\b(before \d|until \d|with (rsvp|ticket|purchase)|for members|members only|for (kids|children|seniors) under|first \d+|early ?bird)/i;
function saysFree(text) {
  const s = String(text || "");
  const m = s.match(FREE);
  if (!m) return false;
  const around = s.slice(Math.max(0, m.index - 30), m.index + m[0].length + 40);
  return !NOT_REALLY.test(around);
}

module.exports = { parsePrice, offersPrice, toCad, ticketmasterPrice, saysFree, USD_TO_CAD };
