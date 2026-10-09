// Sidequest wireframe · core: icons, utilities, Toronto data, state and Sixer's match model.
// Plain scripts share one global scope, in this load order: core, attendee, host, onboarding, actions, sixer, boot.
'use strict';
// =========================================================================
// Icons
// =========================================================================
const P = {
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  crew: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M21.5 20a6.5 6.5 0 0 0-4.5-6.2"/>',
  ticket: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2.5"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  out: '<path d="M7 17 17 7M8 7h9v9"/>',
  heart: '<path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  heartFill: '<path fill="currentColor" d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  pin: '<path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  near: '<path d="M3 11 21 3l-8 18-2-8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  host: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4"/>',
  door: '<path d="M4 21h16M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"/><circle cx="14.5" cy="12" r=".8" fill="currentColor"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-4M14 21v-3"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  camera: '<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 5V5L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8a5 5 0 0 1 0 8"/>',
  loc: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sunset: '<path d="M17 18a5 5 0 0 0-10 0"/><path d="M12 9V3M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M6 16a3 3 0 0 1 6 0M14 10h4M14 13h4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
  bookmarkFill: '<path fill="currentColor" d="M6 3h12v18l-6-4.5L6 21z"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/><path d="M6 6V4h11v2"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  bubble: '<path d="M4 5h16v11H9l-5 4z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8l2 8M14 5h3"/>',
  car: '<path d="M4 16v-4l2-5h12l2 5v4z"/><circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="16" r="1.6"/><path d="M4 12h16"/>',
  card: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  tap: '<path d="M7 9a5 5 0 0 1 10 0M4 9a8 8 0 0 1 16 0"/><rect x="9" y="11" width="6" height="10" rx="1.5"/>',
  access: '<circle cx="12" cy="4.5" r="1.8"/><path d="M5 8.5l7 1.5 7-1.5M12 10v5l-3 6M12 15l3 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  pinned: '<path d="M9 3h6l-1 6 3 3H7l3-3z"/><path d="M12 12v9"/>',
  thread: '<path d="M5 4v10a3 3 0 0 0 3 3h11"/><path d="M15 13l4 4-4 4"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  vote: '<path d="M4 13l4 4 12-12"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>',
};
const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

// =========================================================================
// Utilities
// =========================================================================
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
// Embedded copies (the static board) run with fresh demo data and never touch saved progress.
const EMBED = new URLSearchParams(location.search).has('embed');
const store = {
  get(k, d) { if (EMBED) return d; try { const v = localStorage.getItem('sidequest-wireframe.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { if (EMBED) return; try { localStorage.setItem('sidequest-wireframe.' + k, JSON.stringify(v)); } catch {} },
};
const DAY = 864e5;
const NOW = new Date();
const TODAY = (() => { const d = new Date(NOW); d.setHours(0, 0, 0, 0); return d; })();
const dayDiff = (d) => Math.round((new Date(d).setHours(0, 0, 0, 0) - TODAY) / DAY);
const timeStr = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
function whenLabel(d) {
  const diff = dayDiff(d);
  if (diff === 0) return (d.getHours() >= 18 ? 'Tonight' : 'Today') + ' · ' + timeStr(d);
  if (diff === 1) return 'Tomorrow · ' + timeStr(d);
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' }) + ' · ' + timeStr(d);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' · ' + timeStr(d);
}
const shortWhen = (d) => { const diff = dayDiff(d); return diff === 0 ? (d.getHours() >= 18 ? 'Tonight' : 'Today') : diff === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' }); };
const money = (p) => (p === 0 ? 'Free' : '$' + p);
let toastT;
function toast(msg) { if (EMBED) return; const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

// =========================================================================
// Toronto: scenes, areas, hosts, events, people
// =========================================================================
// Wireframe palette: white ground, near-black lines and text, one mid grey for emphasis.
const C = { ink: '#ffffff', paper: '#1a1a1a', accent: '#8a8a8a' };
const SCENES = {
  live: { label: 'Live Sets' }, food: { label: 'Food Pop-ups' }, art: { label: 'Art Nights' }, markets: { label: 'Markets' },
  comedy: { label: 'Comedy' }, dance: { label: 'Dance Nights' }, wellness: { label: 'Wellness' }, film: { label: 'Film' },
  games: { label: 'Trivia & Games' }, outdoors: { label: 'Outdoors' },
};
const SCENE_KEYS = Object.keys(SCENES);
const sceneColor = () => C.accent;

// Positions on a stylized map (x east, y south). 1 unit ≈ 55 m.
const AREAS = {
  'The Junction':   [40, 118], 'High Park': [66, 232], 'Roncesvalles': [98, 262], 'Ossington': [150, 212],
  'Queen West':     [176, 246], 'Kensington': [203, 224], 'Chinatown': [214, 238], 'The Annex': [192, 150],
  'Downtown':       [246, 268], 'Distillery': [292, 276], 'Leslieville': [326, 250], 'The Danforth': [302, 168],
  'Liberty Village': [150, 292], 'Harbourfront': [236, 306],
};
const AREA_KEYS = Object.keys(AREAS);
const HOME = 'Ossington';
const km = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) * 0.055;
const distStr = (k) => (k < 1 ? `${Math.round(k * 20) * 50} m` : `${k.toFixed(1)} km`);

const HOSTS = {
  loop:    { name: 'Loop Collective', who: 'Priya Nair', followers: 4210, scenes: ['live', 'markets', 'dance'] },
  kitchen: { name: 'Night Kitchen TO', followers: 6120, scenes: ['food'] },
  blue:    { name: 'Blue Room Sessions', followers: 2890, scenes: ['live'] },
  grooves: { name: 'Sunday Grooves', followers: 5300, scenes: ['dance'] },
  makers:  { name: 'Kensington Makers', followers: 1980, scenes: ['markets', 'art'] },
  laugh:   { name: 'Laugh Track Comedy', followers: 3740, scenes: ['comedy'] },
  roncy:   { name: 'Roncy Picture House', followers: 2410, scenes: ['film'] },
  brick:   { name: 'Brickyard Games', followers: 1560, scenes: ['games'] },
  still:   { name: 'Still Hours', followers: 1320, scenes: ['wellness'] },
  run:     { name: 'Run the 6ix', followers: 3980, scenes: ['outdoors'] },
  flea:    { name: 'East End Flea', followers: 4470, scenes: ['markets'] },
  studios: { name: 'West Queen Studios', followers: 2150, scenes: ['art'] },
};

// [id, title, scene, scene2, area, venue, host, weekday(0=Sun), hour, price, blurb]
const EVENT_DEFS = [
  ['vinyl', 'Sunday Vinyl Brunch', 'live', 'food', 'Ossington', 'The Parlour Room', 'loop', 0, 11, 22, 'Two DJs spin soul and jazz records while the kitchen does shakshuka and bottomless coffee. Booked because 340 of you asked for it.'],
  ['disco', 'Warehouse Disco', 'dance', 'live', 'Liberty Village', 'Unit 9', 'grooves', 6, 22, 30, 'A four-hour disco and house set in a converted warehouse. Doors at 10, peak at 1.'],
  ['kamayan', 'Kamayan Night', 'food', null, 'Kensington', 'Night Kitchen Loft', 'kitchen', 5, 19, 35, 'A Filipino feast served on banana leaves, eaten with your hands at long shared tables.'],
  ['kmarket', 'Kensington After Dark', 'markets', 'food', 'Kensington', 'Augusta Ave', 'makers', 6, 18, 0, 'Forty makers, three food trucks and a DJ under string lights on Augusta.'],
  ['studio', 'Open Studio Night', 'art', null, 'Queen West', 'West Queen Studios', 'studios', 4, 19, 0, 'Twelve artists open their studios. Wander, chat, buy prints straight from the maker.'],
  ['laugh', 'Laugh Track Live', 'comedy', null, 'The Annex', 'The Bloor Backroom', 'laugh', 5, 21, 18, 'Six comics, one host, a two-drink vibe and no phones on the front row.'],
  ['rooftop', 'Rooftop Deep House', 'dance', 'live', 'Downtown', 'Level 22 Rooftop', 'loop', 5, 21, 25, 'Sunset-to-midnight deep house above King West. Dress for the wind.'],
  ['jazz', 'Jazz on Ossington', 'live', null, 'Ossington', 'Blue Room', 'blue', 3, 20, 15, 'A trio plays standards, then the jam opens at 10. Bring your horn.'],
  ['dumpling', 'Dumpling Social', 'food', null, 'Chinatown', 'Golden Lantern Hall', 'kitchen', 4, 19, 28, 'Fold, pleat and pan-fry three kinds of dumplings with a chef, then eat everything.'],
  ['flea', 'Leslieville Flea', 'markets', null, 'Leslieville', 'Queen St E lot', 'flea', 0, 10, 0, 'Vintage, records and furniture from 60 East End vendors.'],
  ['midnight', 'Midnight Cult Classics', 'film', null, 'Roncesvalles', 'Roncy Picture House', 'roncy', 6, 23, 14, 'A cult favourite on 35mm, with a costume contest before the lights go down.'],
  ['trivia', 'Trivia at The Crow', 'games', null, 'The Danforth', 'The Crow', 'brick', 2, 19, 0, 'Six rounds, teams of up to six, and a notoriously hard music round.'],
  ['lockin', 'Board Game Lock-in', 'games', null, 'The Annex', 'Brickyard Café', 'brick', 5, 19, 10, 'Three hundred games, friendly rule teachers and solo players matched to tables.'],
  ['sunrise', 'Sunrise Run + Coffee', 'outdoors', 'wellness', 'High Park', 'Grenadier Pond gate', 'run', 6, 8, 0, 'A no-drop 6K loop with a faster group, then coffee by the pond.'],
  ['soundbath', 'Sound Bath', 'wellness', null, 'Leslieville', 'Still Hours Studio', 'still', 3, 19, 30, 'An hour of gongs and singing bowls. Mats and blankets provided.'],
  ['paddle', 'Island Sunset Paddle', 'outdoors', null, 'Harbourfront', 'Harbourfront Dock', 'run', 0, 17, 45, 'Paddle out to the islands and watch the skyline light up. Boards included.'],
  ['afro', 'Afrobeats Night', 'dance', null, 'Queen West', 'The Garrison Room', 'grooves', 6, 22, 20, 'Afrobeats and amapiano until close. The dance floor fills by 11.'],
  ['crawl', 'Junction Gallery Crawl', 'art', null, 'The Junction', 'Dundas St W', 'studios', 4, 18, 0, 'Seven galleries open late along Dundas West, with a map and a drink ticket.'],
  ['taco', 'Taco Takeover', 'food', 'markets', 'Distillery', 'Trinity Square', 'kitchen', 6, 13, 15, 'Six taco pop-ups compete. Vote for the best with your empty plates.'],
  ['lakeeffect', 'Live Set: Lake Effect', 'live', null, 'The Danforth', 'Danforth Music Room', 'blue', 5, 20, 25, 'A local shoegaze band plays their new record front to back.'],
  ['improv', 'Improv Jam', 'comedy', null, 'Leslieville', 'The Little Stage', 'laugh', 3, 20, 8, 'Watch or jump in. Warm-ups at 7:30 for anyone who wants to play.'],
  ['riso', 'Riso Print Workshop', 'art', null, 'Kensington', 'Kensington Makers', 'makers', 0, 14, 40, 'Design and print a two-colour zine on a risograph. Take ten copies home.'],
  ['distillery', 'Distillery Night Market', 'markets', 'food', 'Distillery', 'Distillery Lanes', 'loop', 5, 17, 0, 'Makers, food stalls and a live set on cobblestone lanes.'],
  ['yogavinyl', 'Yoga + Vinyl', 'wellness', 'live', 'Ossington', 'The Parlour Room', 'still', 0, 9, 20, 'A slow flow set to records, then coffee with the room.'],
  ['shorts', 'Short Film Night', 'film', 'art', 'The Annex', 'Bloor Hot Docs Annex', 'roncy', 4, 19, 12, 'Eight local shorts and a Q&A with the directors.'],
  ['listening', 'Lo-fi Listening Session', 'live', null, 'Ossington', 'Blue Room', 'blue', -1, 18, 15, 'A record played start to finish on a big hi-fi, then a DJ keeps it low and warm. All ages; the bar is in a separate room.'],
  ['farmers', 'Junction Farmers\' Market', 'markets', 'food', 'The Junction', 'Junction Commons', 'flea', 6, 9, 0, 'Ontario growers, bakers and a kids\' corner. Bring a tote and come hungry.'],
  ['familyart', 'Family Art Morning', 'art', null, 'The Annex', 'West Queen Studios Annex', 'studios', 0, 10, 12, 'Paint, collage and clay for every age. Grown-ups are welcome to join in.'],
  ['picnic', 'Picnic Concert in High Park', 'live', 'outdoors', 'High Park', 'High Park Amphitheatre', 'blue', 6, 14, 0, 'An afternoon of folk and soul on the lawn. Bring a blanket and snacks.'],
  ['birding', 'Morning Bird Walk', 'outdoors', 'wellness', 'Harbourfront', 'Ferry docks meeting point', 'run', 0, 8, 0, 'A slow two-hour walk with a guide and spare binoculars. Beginners welcome.'],
  ['libgames', 'Library Game Afternoon', 'games', null, 'Kensington', 'Kensington Branch Library', 'brick', 3, 15, 0, 'Board games for every age after school. Staff teach the rules.'],
  ['pottery', 'Saturday Pottery Drop-in', 'art', 'wellness', 'Leslieville', 'Kiln East', 'makers', 6, 11, 30, 'Try the wheel with a teacher beside you. Aprons and clay included.'],
];
// Events that serve alcohol as the main draw or run late in bars and clubs. Only these ask for age.
const AGE_19 = new Set(['disco', 'rooftop', 'afro', 'trivia', 'midnight']);
const slotOf = (d) => { const h = d.getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'late'; };
const TIMES = { morning: 'Mornings', afternoon: 'Afternoons', evening: 'Evenings', late: 'Late nights' };
function nextOn(weekday, hour) {
  const d = new Date(TODAY);
  if (weekday < 0) { // later today, always at least an hour from now
    d.setHours(Math.max(NOW.getHours() + 1, hour), 30, 0, 0);
    return d;
  }
  let add = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + add); d.setHours(hour, 0, 0, 0);
  if (d < NOW) d.setDate(d.getDate() + 7);
  return d;
}
const EVENTS = EVENT_DEFS.map(([id, title, scene, scene2, area, venue, host, wd, hr, price, blurb], i) => {
  const start = nextOn(wd, hr);
  const r = rng(hash(id));
  return {
    id, title, scene, scene2, area, venue, host, price, blurb, start, age19: AGE_19.has(id),
    end: new Date(start.getTime() + (scene === 'dance' ? 4 : 2.5) * 3600e3),
    going: 40 + Math.floor(r() * 260), isNew: i % 4 === 1, demandBooked: id === 'vinyl',
    rating: i % 5 === 3 ? null : Math.round((4 + r() * 0.9) * 10) / 10, reviews: 8 + Math.floor(r() * 120),
    updates: id === 'listening' ? [{ t: '4:40 PM', text: 'Doors 30 minutes before start. Use the laneway door; the front is the bar.' }, { t: '5:05 PM', text: 'Today\'s record: a 1977 jazz-funk classic. Bring questions for the Q&A.' }] : [],
    entrances: id === 'listening' ? ['Laneway door (tickets)', 'Front door (bar only)'] : ['Main entrance'],
  };
});
const EV = new Map(EVENTS.map((e) => [e.id, e]));
HOSTS.loop.name = store.get('hostName', HOSTS.loop.name);

const PEOPLE = {
  me:    { name: 'You', short: 'You', hue: 200 },
  maya:  { name: 'Maya Chen', short: 'Maya', hue: 14, taste: { food: .95, markets: .9, live: .7, art: .5, comedy: .4, dance: .45, wellness: .3, film: .3, games: .35, outdoors: .4 }, budget: 35, area: 'Kensington' },
  kai:   { name: 'Kai Okafor', short: 'Kai', hue: 262, taste: { live: .95, dance: .9, markets: .5, food: .55, art: .4, comedy: .35, wellness: .2, film: .45, games: .3, outdoors: .3 }, budget: 30, area: 'Queen West' },
  leila: { name: 'Leila Haddad', short: 'Leila', hue: 320, taste: { art: .95, film: .85, comedy: .7, live: .55, food: .6, markets: .6, dance: .3, wellness: .55, games: .4, outdoors: .35 }, budget: 25, area: 'The Annex' },
  sam:   { name: 'Sam Ito', short: 'Sam', hue: 150, taste: { games: .95, outdoors: .85, comedy: .75, food: .5, live: .45, markets: .4, art: .3, dance: .25, wellness: .45, film: .5 }, budget: 20, area: 'The Danforth' },
  jordan:{ name: 'Jordan Reyes', short: 'Jordan', hue: 40, taste: { wellness: .8, art: .7, outdoors: .7, food: .55, live: .5, markets: .5, comedy: .5, film: .45, games: .45, dance: .35 }, budget: 25, area: 'Leslieville' },
  noor:  { name: 'Noor Aziz', short: 'Noor', hue: 90, taste: { live: .7, food: .8, markets: .75, art: .5, comedy: .6, dance: .55, wellness: .4, film: .35, games: .5, outdoors: .45 }, budget: 30, area: 'Chinatown' },
  theo:  { name: 'Theo Martin', short: 'Theo', hue: 230, taste: { dance: .8, live: .75, comedy: .5, food: .5, markets: .4, art: .35, wellness: .3, film: .55, games: .6, outdoors: .5 }, budget: 25, area: 'Downtown' },
  ari:   { name: 'Ari Cohen', short: 'Ari', hue: 350 },
};
const FRIENDS = ['maya', 'kai', 'leila', 'sam', 'jordan'];
const avatar = (id, cls = 'avatar') => { const p = PEOPLE[id]; return `<span class="${cls}${id === 'me' ? ' me' : ''}" title="${esc(p.name)}">${esc(id === 'me' ? 'Y' : p.short[0])}</span>`; };
const faceOf = (id) => avatar(id, 'face');
// Friends who are already going (for social proof on cards).
const FRIENDS_GOING = { vinyl: ['maya', 'kai'], kmarket: ['maya'], disco: ['kai'], studio: ['leila'], laugh: ['leila', 'sam'], trivia: ['sam'], listening: ['kai'], distillery: ['maya', 'jordan'] };
// Special guests the host lists, shown with friends under "Who's going".
const GUESTS = { vinyl: 'DJ Kemi (guest set)', listening: 'Producer Q&A with Ana Lua', laugh: 'Headliner: Dev Rao', lakeeffect: 'Opening: The Pines' };

// Quest facts the comments asked for: payments accepted, amenities, ratings by host / venue / this quest.
const PAY_ALL = ['card', 'cash', 'tap'];
const payments = (e) => e.price === 0 ? ['free'] : PAY_ALL.filter((_, i) => (hash(e.id) >> i) % 4 !== 0);
const PAY_LABEL = { card: 'Card', cash: 'Cash', tap: 'Tap', free: 'Free entry' };
function amenities(e) {
  const r = rng(hash(e.id + 'am'));
  const a = [];
  if (r() > .25) a.push('Step-free access');
  if (['food', 'markets'].includes(e.scene) || e.scene2 === 'food' || r() > .5) a.push('Food');
  if (e.age19 || r() > .55) a.push('Drinks');
  a.push(e.going > 200 ? 'Big room · 200+' : 'Small room · under 120');
  if (r() > .6) a.push('Coat check');
  return a;
}
function ratingsOf(e) {
  const r = rng(hash(e.id + 'rt'));
  const f = (b) => Math.round((b + r() * .7) * 10) / 10;
  return { host: f(4.2), venue: f(4), quest: e.rating ? e.rating : null, recurring: !!e.rating };
}
// Tickets live on the host's own page. Hosts connect one of these.
const TICKETING = { loop: 'DICE', kitchen: 'Tock', blue: 'DICE', grooves: 'Ticketmaster', makers: 'Own site', laugh: 'DICE', roncy: 'Own site', brick: 'Free · RSVP', still: 'Own site', run: 'Free · RSVP', flea: 'Free · RSVP', studios: 'Free · RSVP' };

// Parties: saved friend groups. Crew Blend runs inside a party.
const PARTIES = [
  { id: 'friday', name: 'Friday Crew', members: ['me', 'maya', 'kai', 'leila'] },
  { id: 'brunch', name: 'Sunday Brunch Club', members: ['me', 'maya', 'kai', 'leila', 'sam', 'jordan', 'noor'] },
];
const PARTY_CHAT = {
  friday: [['maya', 'Friday? I need a dance floor.'], ['kai', 'Down if it runs late.'], ['leila', 'Can we eat first though']],
  brunch: [['sam', 'Who is hosting snacks this time'], ['noor', 'I can do Sunday, not Saturday']],
};

// Quest Requests that attendees can browse and back with "Me too". Each account counts once.
const REQ_STATUS = { 'i-vinyl': 'live', 'i-ramen': 'planning', 'i-queer': 'heating', 'i-rooftop': 'open', 'i-run': 'open', 'i-family': 'heating', 'i-comedy': 'open' };
// Hosts already planning a request. Several hosts can plan the same idea.
const PLANNING = { 'i-ramen': [{ host: 'Night Kitchen TO', when: '2 days ago' }], 'i-family': [{ host: 'East End Flea', when: 'yesterday' }] };

const NOTIFS = [
  { k: 'change', icon: 'clock', t: 'Doors moved to 9:30', d: 'Rooftop Deep House · Level 22 Rooftop', when: '12 min', id: 'rooftop' },
  { k: 'invite', icon: 'crew', t: 'Maya invited you', d: 'Kensington After Dark with Friday Crew', when: '1 h', id: 'kmarket' },
  { k: 'friend', icon: 'user', t: 'Noor Aziz wants to connect', d: 'You were both at Late Ramen Pop-up', when: '3 h', person: 'noor' },
  { k: 'request', icon: 'bulb', t: 'A host is planning your request', d: 'Night Kitchen TO is planning "Late-night ramen pop-up"', when: '2 d' },
  { k: 'asked', icon: 'spark', t: 'You asked, it\'s happening', d: 'Sunday Vinyl Brunch is booked', when: '4 d', id: 'vinyl' },
];

// Past nights (history for recap + Wrapped). One is waiting for its recap.
const lastSat = (() => { const d = new Date(TODAY); d.setDate(d.getDate() - ((d.getDay() + 1) % 7 || 7)); d.setHours(22, 0, 0, 0); return d; })();
const PAST = [
  { id: 'harbour', title: 'Harbour Lights DJ Set', scene: 'dance', area: 'Harbourfront', host: 'grooves', date: lastSat, crew: ['kai', 'maya'], met: ['noor', 'theo'], recap: null },
  { id: 'ramen', title: 'Late Ramen Pop-up', scene: 'food', area: 'Kensington', host: 'kitchen', date: new Date(lastSat.getTime() - 9 * DAY), crew: ['maya'], met: ['ari'], recap: { rating: 5, tags: ['maya', 'ari'], confirmed: ['maya', 'ari'], note: 'Best broth in the city.' } },
  { id: 'zine', title: 'Zine Fair', scene: 'art', area: 'Kensington', host: 'makers', date: new Date(lastSat.getTime() - 16 * DAY), crew: ['leila'], met: [], recap: { rating: 4, tags: ['leila'], confirmed: ['leila'], note: '' } },
];

// Demand signals, aggregated for hosts.
const IDEAS = [
  { id: 'i-vinyl', text: 'Sunday vinyl brunch', scene: 'live', area: 'Ossington', budget: 25, when: 'Sunday daytime', count: 340, crew: .59, booked: 'vinyl' },
  { id: 'i-ramen', text: 'Late-night ramen pop-up', scene: 'food', area: 'Kensington', budget: 25, when: 'Friday late', count: 268, crew: .64 },
  { id: 'i-queer', text: 'Weeknight queer dance party', scene: 'dance', area: 'Queen West', budget: 20, when: 'Thursday', count: 221, crew: .71 },
  { id: 'i-rooftop', text: 'Rooftop outdoor movie', scene: 'film', area: 'Liberty Village', budget: 20, when: 'Saturday', count: 187, crew: .66 },
  { id: 'i-run', text: 'Beginner run club + brunch', scene: 'outdoors', area: 'High Park', budget: 15, when: 'Sunday morning', count: 164, crew: .38 },
  { id: 'i-family', text: 'All-ages Saturday craft market', scene: 'markets', area: 'Leslieville', budget: 10, when: 'Saturday morning', count: 156, crew: .74 },
  { id: 'i-comedy', text: 'Bilingual comedy night', scene: 'comedy', area: 'The Annex', budget: 20, when: 'Friday', count: 132, crew: .55 },
];

// =========================================================================
// State
// =========================================================================
const S = {
  onboarded: store.get('onboarded', false),
  hostOnboarded: store.get('hostOnboarded', false),
  age: store.get('age', null), // null: never asked · 'adult': confirmed 19+ · 'under': all-ages only
  times: new Set(store.get('times', ['afternoon', 'evening'])),
  dayPart: 'any',
  scenes: new Set(store.get('scenes', ['live', 'food', 'markets'])),
  pastEvents: new Set(store.get('pastEvents', [])),
  areas: new Set(store.get('areas', ['Ossington', 'Queen West', 'Kensington'])),
  crewOn: store.get('crewOn', true),
  saved: new Set(store.get('saved', ['kmarket'])),
  tickets: new Set(store.get('tickets', ['listening'])),
  following: new Set(store.get('following', ['blue'])),
  checkins: new Set(store.get('checkins', [])),
  tasteAdj: store.get('tasteAdj', {}),
  signals: store.get('signals', [{ id: 'sig1', text: 'Sunday vinyl brunch', scene: 'live', area: 'Ossington', when: 'Sunday daytime', budget: 25, others: 340, status: 'happening', eventId: 'vinyl' }]),
  recaps: store.get('recaps', {}),
  plans: {},
  mode: 'attendee',
  tab: 'discover',
  hostTab: 'demand',
  stack: [],
  crewSel: new Set(['me', 'maya', 'kai', 'leila']),
  sceneFilter: null,
  mapSel: null,
  nightsSeg: 'upcoming',
  host: { drafts: {}, published: [], promoted: {}, sentAlerts: {}, moderators: {}, claims: new Set(), questSeg: 'live', insightSeg: 'performance', range: '30d', evFilter: 'all', venueFilter: 'all', announcements: [{ text: 'Doors at 10. Laneway entrance for tickets.', to: 'Tonight\'s ticket holders', at: 'Sent 4:40 PM' }], schedule: false, checked: new Set(['g1', 'g2', 'g5']), duplicated: [] },
  // Merged from the Figma wireframe
  days: new Set(store.get('days', ['weekend'])),
  extraVibes: new Set(store.get('extraVibes', [])),
  wallet: new Set(store.get('wallet', ['listening'])),
  metoo: new Set(store.get('metoo', [])),
  filters: { price: null, dist: null, friends: false, vibe: null, amen: new Set(), start: null, end: null },
  logView: 'list',
  partyId: 'friday',
  votes: { friday: { vinyl: ['maya', 'kai'], kmarket: ['leila'] }, brunch: { vinyl: ['maya', 'noor', 'sam'], taco: ['kai', 'jordan'], flea: ['leila'] } },
  editProfile: false,
  room: 'general',
  notifSeen: false,
  friendReq: null,
  username: store.get('username', 'alex.out'),
};
function persist() {
  store.set('scenes', [...S.scenes]); store.set('pastEvents', [...S.pastEvents]); store.set('areas', [...S.areas]);
  store.set('crewOn', S.crewOn); store.set('saved', [...S.saved]); store.set('tickets', [...S.tickets]);
  store.set('following', [...S.following]); store.set('checkins', [...S.checkins]); store.set('tasteAdj', S.tasteAdj);
  store.set('signals', S.signals); store.set('age', S.age); store.set('times', [...S.times]);
  store.set('days', [...S.days]); store.set('extraVibes', [...S.extraVibes]); store.set('wallet', [...S.wallet]); store.set('metoo', [...S.metoo]); store.set('recaps', Object.fromEntries(Object.entries(S.recaps).map(([k, v]) => [k, { ...v, photos: [] }])));
}

// =========================================================================
// Sixer's model: taste, fit, reasons
// =========================================================================
function taste() {
  const t = {};
  for (const s of SCENE_KEYS) t[s] = S.scenes.has(s) ? 0.82 : 0.22;
  for (const id of S.pastEvents) { const p = PAST_CHOICES.find((x) => x.id === id); if (p) t[p.scene] = Math.min(1, t[p.scene] + 0.08); }
  for (const id of S.saved) { const e = EV.get(id); if (e) t[e.scene] = Math.min(1, t[e.scene] + 0.04); }
  for (const id of S.checkins) { const e = EV.get(id); if (e) t[e.scene] = Math.min(1, t[e.scene] + 0.08); }
  for (const p of PAST) { const r = S.recaps[p.id] || p.recap; if (r) t[p.scene] = clamp(t[p.scene] + (r.rating - 3) * 0.03, 0, 1); }
  for (const [s, v] of Object.entries(S.tasteAdj)) t[s] = clamp(t[s] + v, 0.05, 1);
  return t;
}
const myAreas = () => [HOME, ...S.areas];
function areaFit(area, areas = myAreas()) { return Math.max(...areas.map((a) => Math.max(0, 1 - km(AREAS[a], AREAS[area]) / 6))); }
// Each event sits a little off its area's centre, so distances and pins don't collapse to one point.
function evPos(e) { const r = rng(hash(e.id)); return [AREAS[e.area][0] + (r() - .5) * 22, AREAS[e.area][1] + (r() - .5) * 18]; }
const distFromHome = (e) => Math.max(0.15, km(AREAS[HOME], evPos(e)));
function fitFor(pid, e, t) {
  if (pid === 'me') {
    t = t || taste();
    const s2 = e.scene2 ? t[e.scene2] : t[e.scene];
    let f = 0.58 * t[e.scene] + 0.12 * s2 + 0.2 * areaFit(e.area) + 0.1 * (e.price <= 40 ? 1 : 0.4);
    if (S.following.has(e.host)) f += 0.05;
    if ((FRIENDS_GOING[e.id] || []).length) f += 0.04;
    if (S.times.has(slotOf(e.start))) f += 0.06;
    return clamp(Math.round(42 + 56 * f), 40, 99);
  }
  const p = PEOPLE[pid];
  const s2 = e.scene2 ? p.taste[e.scene2] : p.taste[e.scene];
  const f = 0.58 * Math.max(p.taste[e.scene], s2 * 0.9) + 0.1 * s2 + 0.2 * areaFit(e.area, [p.area]) + 0.12 * (e.price <= p.budget ? 1 : 0.35);
  return clamp(Math.round(42 + 56 * f), 40, 99);
}
function reasons(e) {
  const r = [];
  const t = taste();
  const savedSame = [...S.saved].map((id) => EV.get(id)).filter((x) => x && x.id !== e.id && (x.scene === e.scene || x.scene2 === e.scene)).length;
  if (e.demandBooked && S.signals.some((s) => s.eventId === e.id)) r.push('You requested this quest');
  if (S.scenes.has(e.scene)) r.push(`You picked <b>${esc(SCENES[e.scene].label)}</b>`);
  else if (t[e.scene] > 0.5) r.push(`You've been into <b>${esc(SCENES[e.scene].label)}</b> lately`);
  if (savedSame) r.push(`You saved ${savedSame === 1 ? 'a similar event' : savedSame + ' similar events'}`);
  if (S.times.has(slotOf(e.start)) && r.length < 2) r.push(`You like <b>${TIMES[slotOf(e.start)].toLowerCase()}</b>`);
  if (S.following.has(e.host)) r.push(`You follow <b>${esc(HOSTS[e.host].name)}</b>`);
  const fg = FRIENDS_GOING[e.id] || [];
  if (fg.length) r.push(`<b>${esc(fg.map((f) => PEOPLE[f].short).join(' and '))}</b> ${fg.length > 1 ? 'are' : 'is'} going`);
  r.push(`${distStr(distFromHome(e))} from home`);
  return r.slice(0, 3);
}
// Match is shown as a 4-step tone scale with a word, never as a percentage (team comment on the map).
// In the high-fidelity design the steps run green to grey; in this wireframe they run dark to light grey.
const TIERS = [[88, 4, 'Top match'], [78, 3, 'Strong match'], [64, 2, 'Good match'], [0, 1, 'Maybe']];
const tierOf = (f) => { const t = TIERS.find(([min]) => f >= min); return { n: t[1], label: t[2] }; };
const TIER_TONE = { 4: '#1a1a1a', 3: '#545454', 2: '#8f8f8f', 1: '#c4c4c4' };
function matchTag(f, cls = '') {
  const t = tierOf(f);
  return `<span class="match t${t.n} ${cls}" title="${t.label}"><span class="steps" aria-hidden="true">${[1, 2, 3, 4].map((k) => `<i class="${k <= t.n ? 'on' : ''}"></i>`).join('')}</span>${t.label}</span>`;
}
const matchWord = (f) => tierOf(f).label;
const allowed = (e) => !(S.age === 'under' && e.age19);
const upcoming = () => EVENTS.filter((e) => e.end > NOW && allowed(e)).concat(S.host.published.map((id) => EV.get(id)).filter((e) => e && allowed(e))).filter((e, i, a) => a.indexOf(e) === i);
const inDayPart = (e) => S.dayPart === 'any' || (S.dayPart === 'day' ? e.start.getHours() < 17 : e.start.getHours() >= 17);
const filtersOn = () => { const f = S.filters; return [f.price, f.dist, f.friends, f.vibe, f.amen.size, f.start].filter(Boolean).length; };
function passesFilters(e) {
  const f = S.filters;
  if (f.price === 'free' && e.price !== 0) return false;
  if (f.price === 'u20' && e.price >= 20) return false;
  if (f.dist === 'walk' && distFromHome(e) > 2) return false;
  if (f.dist === 'ride' && distFromHome(e) > 6) return false;
  if (f.friends && !(FRIENDS_GOING[e.id] || []).length) return false;
  if (f.vibe && e.scene !== f.vibe && e.scene2 !== f.vibe) return false;
  if (f.start && e.start.getHours() < f.start) return false;
  const am = amenities(e).join(' ');
  if (f.amen.has('access') && !am.includes('Step-free')) return false;
  if (f.amen.has('allages') && e.age19) return false;
  if (f.amen.has('food') && !am.includes('Food')) return false;
  if (f.amen.has('drinks') && !am.includes('Drinks')) return false;
  if (f.amen.has('small') && !am.includes('Small')) return false;
  return true;
}
function weekly(useDayPart = true) { const t = taste(); return upcoming().filter((e) => dayDiff(e.start) < 7 && (!useDayPart || inDayPart(e)) && passesFilters(e)).map((e) => ({ e, fit: fitFor('me', e, t) })).sort((a, b) => b.fit - a.fit).slice(0, 8); }

// =========================================================================
// Posters: generative "photos" per event
// =========================================================================
// Drop real photos in here (event id -> image URL or data URI). They render as violet duotones so the palette holds.
const PHOTOS = {};
const posterBase = (seed) => [...EV.keys()].filter((k) => String(seed).startsWith(k)).sort((a, b) => b.length - a.length)[0] || String(seed);
function posterStyle(seed) {
  const r = rng(hash(String(seed)));
  const p = () => `${Math.round(r() * 100)}% ${Math.round(r() * 100)}%`;
  const tone = hash(posterBase(seed)) % 3;
  const A = 'rgba(120,120,120,', W = 'rgba(26,26,26,', K = 'rgba(255,255,255,';
  let bg, blobs;
  if (tone === 0) { bg = C.ink; blobs = [`radial-gradient(60% 55% at ${p()}, ${A}1) 0%, transparent 70%)`, `radial-gradient(40% 40% at ${p()}, ${W}.45) 0%, transparent 70%)`, `radial-gradient(70% 60% at ${p()}, ${A}.55) 0%, transparent 75%)`]; }
  else if (tone === 1) { bg = C.accent; blobs = [`radial-gradient(65% 60% at ${p()}, ${K}.85) 0%, transparent 70%)`, `radial-gradient(40% 40% at ${p()}, ${W}.5) 0%, transparent 70%)`]; }
  else { bg = C.ink; blobs = [`radial-gradient(45% 45% at ${p()}, ${W}.4) 0%, transparent 70%)`, `radial-gradient(65% 60% at ${p()}, ${A}.85) 0%, transparent 72%)`]; }
  return `--bg:${bg};--blobs:${blobs.join(',')}`;
}
// Wireframe image placeholder: a crossed box labelled with the scene, content laid over it.
function poster(seed, scene, inner = '', cls = '') {
  const label = scene && SCENES[scene] ? SCENES[scene].label : 'Image';
  return `<div class="poster ${cls}"><span class="img-tag">IMG · ${esc(label)}</span><div class="inner">${inner}</div></div>`;
}

