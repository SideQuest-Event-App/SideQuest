// The 6ix Sense: low-fidelity wireframe. Same screens, data and flows as the prototype.
// Plain JavaScript, no build step. Loaded by index.html after the markup.

(() => {
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
};
const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

// =========================================================================
// Utilities
// =========================================================================
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const store = {
  get(k, d) { try { const v = localStorage.getItem('6ix-wireframe.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('6ix-wireframe.' + k, JSON.stringify(v)); } catch {} },
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
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); }

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
  noor:  { name: 'Noor Aziz', short: 'Noor', hue: 90 },
  theo:  { name: 'Theo Martin', short: 'Theo', hue: 230 },
  ari:   { name: 'Ari Cohen', short: 'Ari', hue: 350 },
};
const FRIENDS = ['maya', 'kai', 'leila', 'sam', 'jordan'];
const avatar = (id, cls = 'avatar') => { const p = PEOPLE[id]; return `<span class="${cls}${id === 'me' ? ' me' : ''}" title="${esc(p.name)}">${esc(id === 'me' ? 'Y' : p.short[0])}</span>`; };
const faceOf = (id) => avatar(id, 'face');
// Friends who are already going (for social proof on cards).
const FRIENDS_GOING = { vinyl: ['maya', 'kai'], kmarket: ['maya'], disco: ['kai'], studio: ['leila'], laugh: ['leila', 'sam'], trivia: ['sam'], listening: ['kai'], distillery: ['maya', 'jordan'] };

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
  host: { drafts: {}, published: [], promoted: {}, sentAlerts: {}, moderators: {} },
};
function persist() {
  store.set('scenes', [...S.scenes]); store.set('pastEvents', [...S.pastEvents]); store.set('areas', [...S.areas]);
  store.set('crewOn', S.crewOn); store.set('saved', [...S.saved]); store.set('tickets', [...S.tickets]);
  store.set('following', [...S.following]); store.set('checkins', [...S.checkins]); store.set('tasteAdj', S.tasteAdj);
  store.set('signals', S.signals); store.set('age', S.age); store.set('times', [...S.times]); store.set('recaps', Object.fromEntries(Object.entries(S.recaps).map(([k, v]) => [k, { ...v, photos: [] }])));
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
  if (e.demandBooked && S.signals.some((s) => s.eventId === e.id)) r.push('You asked for this with "I\'d go if…"');
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
const allowed = (e) => !(S.age === 'under' && e.age19);
const upcoming = () => EVENTS.filter((e) => e.end > NOW && allowed(e)).concat(S.host.published.map((id) => EV.get(id)).filter((e) => e && allowed(e))).filter((e, i, a) => a.indexOf(e) === i);
const inDayPart = (e) => S.dayPart === 'any' || (S.dayPart === 'day' ? e.start.getHours() < 17 : e.start.getHours() >= 17);
function weekly(useDayPart = true) { const t = taste(); return upcoming().filter((e) => dayDiff(e.start) < 7 && (!useDayPart || inDayPart(e))).map((e) => ({ e, fit: fitFor('me', e, t) })).sort((a, b) => b.fit - a.fit).slice(0, 8); }

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

// =========================================================================
// Rendering
// =========================================================================
const root = document.getElementById('root');
const nav = document.getElementById('nav');
let lastStackLen = 0;
function render() {
  const scrollers = {};
  root.querySelectorAll('[data-scroll]').forEach((el) => (scrollers[el.dataset.scroll] = el.scrollTop));
  const top = S.stack[S.stack.length - 1];
  let html = `<div class="screen" data-scroll="tab-${S.mode}-${S.mode === 'host' ? S.hostTab : S.tab}">${S.mode === 'host' ? hostTab() : tabHtml()}</div>`;
  if (top) html += `<div class="page ${S.stack.length > lastStackLen ? 'enter' : ''}" data-scroll="page-${S.stack.length}-${top.v}">${pageHtml(top)}</div>`;
  lastStackLen = S.stack.length;
  root.innerHTML = html;
  root.querySelectorAll('[data-scroll]').forEach((el) => { if (scrollers[el.dataset.scroll]) el.scrollTop = scrollers[el.dataset.scroll]; });
  nav.hidden = !!top;
  renderNav();
  if (S.mode === 'attendee' && S.tab === 'map' && !top) mountMap();
}
function renderNav() {
  const items = S.mode === 'host'
    ? [['demand', 'bulb', 'Demand'], ['events', 'ticket', 'Your events'], ['sixer'], ['insights', 'chart', 'Insights'], ['you', 'host', 'Profile']]
    : [['discover', 'home', 'Discover'], ['map', 'map', 'Map'], ['sixer'], ['crew', 'crew', 'Crew Blend'], ['nights', 'ticket', 'Your plans']];
  const cur = S.mode === 'host' ? S.hostTab : S.tab;
  nav.innerHTML = items.map(([k, ic, label]) => k === 'sixer'
    ? `<button data-a="sixer" aria-label="Ask Sixer"><span class="orb" style="--s:46px"></span></button>`
    : `<button class="${cur === k ? 'on' : ''}" data-a="tab" data-v="${k}" aria-label="${label}" aria-current="${cur === k ? 'page' : 'false'}">${icon(ic)}${k === 'nights' && needsRecap() ? '<span class="badge"></span>' : ''}</button>`).join('');
}
const needsRecap = () => PAST.some((p) => !p.recap && !S.recaps[p.id]);
function push(v, params = {}) { S.stack.push({ v, ...params }); render(); }
function pop() { S.stack.pop(); render(); }

function tabHtml() {
  if (S.tab === 'map') return mapTab();
  if (S.tab === 'crew') return crewTab();
  if (S.tab === 'nights') return nightsTab();
  return discoverTab();
}

// ---------------- Discover ----------------
function friendsLine(e) {
  const fg = FRIENDS_GOING[e.id] || [];
  return fg.length ? `<span class="faces">${fg.map(faceOf).join('')}</span>` : '';
}
function weeklyCard({ e, fit }) {
  const inner = `<div class="row" style="justify-content:space-between"><span class="row" style="gap:6px"><span class="pill glass">${icon('near')}${distStr(distFromHome(e))}</span>${e.age19 ? '<span class="pill hot">19+</span>' : ''}</span>
      <span class="icon-btn glass" data-a="save" data-id="${e.id}" role="button" aria-label="${S.saved.has(e.id) ? 'Unsave' : 'Save'}">${icon(S.saved.has(e.id) ? 'heartFill' : 'heart')}</span></div>
    <div><div class="fit">${fit}% your vibe</div><h3 style="margin-top:6px">${esc(e.title)}</h3>
      <div class="card-foot" style="margin-top:12px"><div class="grow muted" style="font-size:13.5px">${esc(shortWhen(e.start))} · ${esc(e.area)}</div>${friendsLine(e)}
      <span class="icon-btn solid">${icon('out')}</span></div></div>`;
  return `<button class="weekly" data-a="event" data-id="${e.id}" aria-label="${esc(e.title)}">${poster(e.id, e.scene, inner, '', e.title.split(' ')[0], 104)}</button>`;
}
function discoverTab() {
  const wk = weekly();
  const t = taste();
  const happening = S.signals.find((s) => s.status === 'happening' && EV.get(s.eventId));
  const hEv = happening && EV.get(happening.eventId);
  const mixes = SCENE_KEYS.filter((s) => S.scenes.has(s)).slice(0, 5);
  const inWeekly = new Set(wk.slice(0, 4).map((x) => x.e.id));
  const near = upcoming().filter((e) => !inWeekly.has(e.id) && inDayPart(e) && distFromHome(e) < 3 && (S.scenes.has(e.scene) || t[e.scene] > .5)).sort((a, b) => distFromHome(a) - distFromHome(b)).slice(0, 3);
  return `<div class="top-safe"></div>
    <div class="hello"><div class="grow"><div class="eyebrow">${esc(NOW.toLocaleDateString(undefined, { weekday: 'long' }))} · Toronto</div><h1 style="margin-top:8px">Your week,<br><span style="color:var(--accent)">picked.</span></h1></div>
      <button data-a="profile" aria-label="Your profile">${avatar('me')}</button></div>
    <button class="search" data-a="sixer"><span class="orb" style="--s:36px"></span><span class="q">Ask Sixer what to do today</span>${icon('arrow')}</button>
    <div class="chips" style="margin-top:14px" role="group" aria-label="Time of day">${[['any', 'Anytime', 'clock'], ['day', 'Daytime', 'sun'], ['evening', 'Evening', 'moon']].map(([k, l, ic]) => `<button class="chip ${S.dayPart === k ? 'on' : ''}" data-a="daypart" data-v="${k}" aria-pressed="${S.dayPart === k}">${icon(ic)}${l}</button>`).join('')}</div>
    ${hEv ? `<button class="asked" data-a="event" data-id="${hEv.id}">${poster(hEv.id + 'a', hEv.scene)}<div class="grow"><div class="eyebrow hot">You asked, it's happening</div><div style="font-weight:700;margin-top:2px">${esc(hEv.title)} · ${esc(shortWhen(hEv.start))}</div></div>${icon('arrow')}</button>` : ''}
    <div class="sec-head"><div><h2>6ix Weekly</h2><div class="muted" style="font-size:13px;margin-top:2px">Fresh every Monday</div></div><button data-a="mix" data-v="weekly">See all</button></div>
    <div class="hscroll">${wk.map(weeklyCard).join('') || '<p class="muted">Nothing in this time slot this week. Try Anytime.</p>'}</div>
    <div class="sec-head"><h2>Scene Mixes</h2></div>
    <div class="hscroll">${mixes.map((s) => `<button class="mix" data-a="mix" data-v="${s}">${poster('mix' + s, s, `<h3>${esc(SCENES[s].label)}</h3>`, '', SCENES[s].label.split(' ')[0], 60)}<div class="sub">${upcoming().filter((e) => e.scene === s || e.scene2 === s).length} this week</div></button>`).join('')}</div>
    ${near.length ? `<div class="sec-head"><h2>Near you</h2><span class="muted" style="font-size:13px">around ${esc(HOME)}</span></div>${near.map((e) => listItem(e, t)).join('')}` : ''}
    <div class="idgo"><h2>Don't see it?<br>Ask for it.</h2><p>Tell hosts "I'd go if…". When enough people ask, they book it, and you hear first.</p><button class="btn" data-a="signal">I'd go if…</button></div>`;
}
function sceneFilterList() {
  const t = taste();
  const list = upcoming().filter((e) => e.scene === S.sceneFilter || e.scene2 === S.sceneFilter).sort((a, b) => fitFor('me', b, t) - fitFor('me', a, t));
  return `<div class="sec-head"><h2>${esc(SCENES[S.sceneFilter].label)}</h2><span class="muted">${list.length} events</span></div>
    ${list.map((e) => listItem(e, t)).join('') || '<p class="lede">Nothing this week yet.</p>'}`;
}
function listItem(e, t) {
  return `<button class="list-item" data-a="event" data-id="${e.id}">${poster(e.id + 'l', e.scene)}<div class="grow"><div class="t">${esc(e.title)}</div>
    <div class="m">${esc(whenLabel(e.start))}</div><div class="m">${esc(e.area)} · ${distStr(distFromHome(e))} · ${money(e.price)}${e.age19 ? ' · 19+' : ''}</div></div>
    <div style="text-align:right"><div class="fit">${fitFor('me', e, t || taste())}%</div><div style="margin-top:6px">${friendsLine(e)}</div></div></button>`;
}

// ---------------- Map ----------------
function mapTab() {
  return `<div class="map-wrap" id="mapwrap"></div>
    <div class="map-top"><button class="search" style="margin:0 20px" data-a="sixer">${icon('search')}<span class="q">What are you up for?</span></button>
      <div class="chips">${[['', 'Your scenes'], ...SCENE_KEYS.map((s) => [s, SCENES[s].label])].map(([k, l]) => `<button class="chip ${(S.sceneFilter || '') === k ? 'on' : ''}" data-a="scene-filter" data-v="${k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="map-ctl"><button class="icon-btn glass-dark" data-a="map-zoom" data-v="in" aria-label="Zoom in">${icon('plus')}</button><button class="icon-btn glass-dark" data-a="map-zoom" data-v="out" aria-label="Zoom out">${icon('minus')}</button><button class="icon-btn glass-dark" data-a="map-home" aria-label="Center on home">${icon('loc')}</button></div>
    <div class="map-cards"><div class="hscroll" id="mapcards"></div></div>`;
}
const mapView = { x: 60, y: 90, w: 300, h: 300 };
function mapEvents() {
  const t = taste();
  return upcoming().filter((e) => (S.sceneFilter ? e.scene === S.sceneFilter || e.scene2 === S.sceneFilter : (S.scenes.has(e.scene) || (e.scene2 && S.scenes.has(e.scene2)) || t[e.scene] > .5)));
}
function baseMapSvg(extra = '') {
  const lake = 'M-40 318 C 40 300, 110 312, 170 318 S 260 322, 300 300 S 360 290, 420 296 L 420 460 L -40 460 Z';
  const islands = '<path d="M205 342c20-8 50-8 70 0-12 10-52 12-70 0z" fill="rgba(120,120,120,.24)"/><path d="M285 338c10-4 24-4 32 2-8 6-24 6-32-2z" fill="rgba(120,120,120,.24)"/>';
  const streets = [
    ['Bloor St', 'M0 150 L400 142'], ['Dundas St', 'M20 196 C 120 210, 200 214, 330 232'], ['Queen St', 'M0 250 L400 256'], ['King St', 'M40 272 L380 276'],
    ['Ossington Ave', 'M150 120 L152 300'], ['Spadina Ave', 'M204 110 L210 310'], ['Yonge St', 'M250 40 L252 312'], ['Bathurst St', 'M178 100 L182 312'], ['Gardiner', 'M20 300 C 120 294, 250 296, 390 286'],
  ];
  return `<svg class="map" viewBox="${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}" preserveAspectRatio="xMidYMid slice" aria-label="Map of Toronto">
    <rect x="-100" y="-100" width="600" height="600" fill="${C.ink}"/>
    <path d="M40 200 C 60 190, 90 200, 88 240 C 80 262, 50 262, 42 240 Z" fill="rgba(26,26,26,.05)"/>
    <path d="M270 60 C 262 120, 290 170, 276 230 C 272 260, 290 280, 286 300" stroke="rgba(26,26,26,.05)" stroke-width="14" fill="none"/>
    ${streets.map(([, d]) => `<path d="${d}" stroke="rgba(26,26,26,.08)" stroke-width="3.2" fill="none" stroke-linecap="round"/>`).join('')}
    <path d="${lake}" fill="rgba(120,120,120,.14)"/>${islands}
    <text x="120" y="350" fill="rgba(120,120,120,.8)" font-size="11" font-style="italic" font-family="Figtree, sans-serif">Lake Ontario</text>
    <g font-family="DM Mono, monospace" font-size="6.5" fill="rgba(26,26,26,.32)" letter-spacing=".6">${AREA_KEYS.map((a) => `<text x="${AREAS[a][0]}" y="${AREAS[a][1] - 12}" text-anchor="middle">${esc(a.toUpperCase())}</text>`).join('')}</g>
    <g transform="translate(250 290)"><path d="M-1.4 0 L-0.6 -34 L0.6 -34 L1.4 0 Z" fill="rgba(26,26,26,.22)"/><ellipse cx="0" cy="-24" rx="3.2" ry="1.8" fill="rgba(26,26,26,.3)"/></g>
    ${extra}</svg>`;
}
function mountMap() {
  const wrap = document.getElementById('mapwrap');
  if (!wrap) return;
  const list = mapEvents();
  const sel = S.mapSel && list.some((e) => e.id === S.mapSel) ? S.mapSel : null;
  const k = mapView.w / 300;
  const home = AREAS[HOME];
  const jit = evPos;
  const pins = list.map((e) => { const [x, y] = jit(e); const on = e.id === sel; return `<g data-a="map-pin" data-id="${e.id}" style="cursor:pointer" role="button" aria-label="${esc(e.title)}">
      <circle cx="${x}" cy="${y}" r="${(on ? 16 : 11) * k}" fill="${sceneColor(e.scene)}" opacity=".22"/>
      <circle cx="${x}" cy="${y}" r="${(on ? 7.5 : 5) * k}" fill="${on ? C.paper : C.accent}" stroke="${C.ink}" stroke-width="${1.4 * k}"/></g>`; }).join('');
  const homePin = `<circle cx="${home[0]}" cy="${home[1]}" r="${14 * k}" fill="${C.paper}" opacity=".2"/><circle cx="${home[0]}" cy="${home[1]}" r="${5 * k}" fill="${C.paper}" stroke="#fff" stroke-width="${2 * k}"/>`;
  wrap.innerHTML = baseMapSvg(homePin + pins);
  const cards = document.getElementById('mapcards');
  const t = taste();
  const ordered = sel ? [EV.get(sel), ...list.filter((e) => e.id !== sel)] : list.sort((a, b) => distFromHome(a) - distFromHome(b));
  cards.innerHTML = ordered.map((e) => `<button class="map-card" data-a="event" data-id="${e.id}">${poster(e.id + 'm', e.scene)}<div class="body"><div><span class="pill glass" style="height:26px;font-size:11.5px">${icon('near')}${distStr(distFromHome(e))}</span><h3 style="margin-top:8px">${esc(e.title)}</h3></div>
    <div class="muted" style="font-size:12.5px">${esc(shortWhen(e.start))} · ${esc(e.area)}<br><span class="fit">${fitFor('me', e, t)}% your vibe</span></div></div></button>`).join('');
  if (!wrap._bound) bindMapGestures(wrap);
}
function bindMapGestures(wrap) {
  wrap._bound = true;
  const pts = new Map(); let start = null;
  const svgScale = () => mapView.w / wrap.clientWidth * Math.max(1, wrap.clientWidth / wrap.clientHeight);
  wrap.addEventListener('pointerdown', (e) => { wrap.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); start = { v: { ...mapView }, pts: new Map(pts), moved: false }; });
  wrap.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    const svg = wrap.querySelector('svg');
    if (pts.size === 1) {
      const [sx, sy] = start.pts.get(e.pointerId) || [e.clientX, e.clientY];
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) > 4) start.moved = true;
      const s = svgScale();
      mapView.x = start.v.x - dx * s; mapView.y = start.v.y - dy * s;
    } else if (pts.size === 2 && start.pts.size === 2) {
      const [a0, b0] = [...start.pts.values()], [a1, b1] = [...pts.values()];
      const f = Math.hypot(a0[0] - b0[0], a0[1] - b0[1]) / Math.max(20, Math.hypot(a1[0] - b1[0], a1[1] - b1[1]));
      zoomMap(f, start.v); start.moved = true;
    }
    clampMap(); svg.setAttribute('viewBox', `${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}`);
  });
  const end = (e) => {
    pts.delete(e.pointerId);
    if (start && !start.moved) {
      const g = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest && el.closest('[data-a="map-pin"]')).find(Boolean);
      if (g) { S.mapSel = g.dataset.id; mountMap(); document.getElementById('mapcards').scrollLeft = 0; }
    } else if (start) mountMap();
    start = pts.size ? { v: { ...mapView }, pts: new Map(pts), moved: true } : null;
  };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  wrap.addEventListener('wheel', (e) => { e.preventDefault(); zoomMap(Math.exp(e.deltaY * 0.0015), { ...mapView }); clampMap(); mountMap(); }, { passive: false });
}
function zoomMap(f, from) {
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  const w = clamp(from.w * f, 90, 420);
  mapView.w = w; mapView.h = w; mapView.x = cx - w / 2; mapView.y = cy - w / 2;
}
function clampMap() { mapView.x = clamp(mapView.x, -60, 400 - mapView.w); mapView.y = clamp(mapView.y, -20, 400 - mapView.h); }

// ---------------- Crew Blend ----------------
function blend(members = [...S.crewSel]) {
  return upcoming().map((e) => {
    const fits = members.map((m) => ({ m, f: fitFor(m, e) }));
    const avg = fits.reduce((a, x) => a + x.f, 0) / fits.length;
    const min = fits.reduce((a, x) => (x.f < a.f ? x : a));
    return { e, fits, score: Math.round(0.7 * avg + 0.3 * min.f), min };
  }).sort((a, b) => b.score - a.score);
}
function topScene(pid) { const t = pid === 'me' ? taste() : PEOPLE[pid].taste; return SCENE_KEYS.reduce((a, b) => (t[b] > t[a] ? b : a)); }
function explain(b) {
  const { e, fits, min } = b;
  if (e.scene2) {
    const a = fits.find((x) => x.m !== 'me' && topScene(x.m) === e.scene);
    const c = fits.find((x) => x.m !== 'me' && topScene(x.m) === e.scene2 && x !== a) || fits.find((x) => x.m !== 'me' && x !== a && (PEOPLE[x.m].taste?.[e.scene2] || 0) > .7);
    if (a && c) return `<b>${PEOPLE[a.m].short}</b> loves ${SCENES[e.scene].label.toLowerCase()}, <b>${PEOPLE[c.m].short}</b> prefers ${SCENES[e.scene2].label.toLowerCase()}, so this has both.`;
  }
  const fan = fits.filter((x) => x.m !== 'me').sort((a, b2) => b2.f - a.f)[0];
  const cheap = fits.every((x) => x.m === 'me' || e.price <= PEOPLE[x.m].budget);
  return `${fan ? `<b>${PEOPLE[fan.m].short}</b> is the biggest fan. ` : ''}<b>${PEOPLE[min.m].short}</b> is lowest at ${min.f}%${cheap ? ', but it\'s inside everyone\'s budget' : ''}.`;
}
function crewTab() {
  if (!S.crewOn) return `<div class="top-safe"></div><h1 class="big-title">Crew Blend</h1><p class="lede">Find the plan your whole group will love. Connect friends to blend your tastes. They only ever see the group score, never your full profile.</p><div class="pad" style="margin-top:20px"><button class="btn solid block" data-a="crew-connect">Connect friends</button></div>`;
  const members = [...S.crewSel];
  const res = blend(members).slice(0, 3);
  const t = taste();
  const sums = SCENE_KEYS.map((s) => [s, members.reduce((a, m) => a + (m === 'me' ? t[s] : PEOPLE[m].taste[s]), 0)]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = sums.reduce((a, x) => a + x[1], 0);
  return `<div class="top-safe"></div><div class="eyebrow pad">Taste for the whole group</div><h1 class="big-title" style="padding-top:6px">Crew Blend</h1>
    <div class="crew-pick" style="margin-top:18px" role="group" aria-label="Who's coming">${['me', ...FRIENDS].map((id) => `<button class="${S.crewSel.has(id) ? 'on' : ''}" data-a="crew-toggle" data-id="${id}" aria-pressed="${S.crewSel.has(id)}">${avatar(id)}${esc(PEOPLE[id].short)}</button>`).join('')}</div>
    <p class="lede" style="margin-top:14px">Your crew is into <b style="color:var(--paper)">${sums.slice(0, 3).map(([s]) => esc(SCENES[s].label)).join(', ')}</b>.</p>
    <div class="sec-head"><h2>Best for the crew</h2></div>
    ${members.length < 2 ? '<p class="lede">Pick at least one friend to blend.</p>' : res.map((b) => `<div class="blend-card">
      <button data-a="event" data-id="${b.e.id}" style="display:block;width:100%;text-align:left">${poster(b.e.id + 'b', b.e.scene, `<div class="row"><span class="pill glass">${esc(shortWhen(b.e.start))} · ${esc(b.e.area)}</span><span class="grow"></span><span class="pill glass">${money(b.e.price)}</span></div><h3>${esc(b.e.title)}</h3>`, '', b.e.title.split(' ')[0], 80)}</button>
      <div class="blend-body"><div class="row"><div class="score">${b.score}%</div><div class="grow muted" style="font-size:13px">for the crew · ${esc(PEOPLE[b.min.m].short)} lowest at ${b.min.f}%</div></div>
        <div class="fits">${b.fits.map((x) => `<div class="fitrow"><span>${esc(PEOPLE[x.m].short)}</span><span class="bar"><i style="width:${x.f}%;--c:${x.m === 'me' ? C.paper : C.accent}"></i></span><span class="n">${x.f}%</span></div>`).join('')}</div>
        <p class="explain">${explain(b)}</p>
        <button class="btn solid block" data-a="plan" data-id="${b.e.id}">Start group plan</button></div></div>`).join('')}`;
}

// ---------------- Nights ----------------
function nightsTab() {
  const up = upcoming().filter((e) => S.tickets.has(e.id) || S.saved.has(e.id) || S.plans[e.id]).sort((a, b) => a.start - b.start);
  const nightCard = (e) => {
    const tonight = dayDiff(e.start) === 0;
    const status = S.checkins.has(e.id) ? 'Checked in' : S.tickets.has(e.id) ? 'Got tickets' : S.plans[e.id] ? 'Group plan' : 'Saved';
    return `<button class="night-card" data-a="${S.tickets.has(e.id) ? 'hub' : 'event'}" data-id="${e.id}">${poster(e.id + 'n', e.scene, `<div class="row">${tonight ? '<span class="pill hot"><span class="live-dot" style="box-shadow:none;background:var(--ink)"></span>Tonight</span>' : `<span class="pill glass">${esc(shortWhen(e.start))}</span>`}<span class="grow"></span><span class="pill glass">${esc(status)}</span></div><h3>${esc(e.title)}</h3>`, '', e.title.split(' ')[0], 70)}
      <div class="body"><div class="grow"><div style="font-weight:600">${esc(whenLabel(e.start))}</div><div class="muted" style="font-size:13px">${esc(e.venue)} · ${esc(e.area)}</div></div>${S.tickets.has(e.id) ? `<span class="btn sm solid">Event day hub</span>` : icon('arrow')}</div></button>`;
  };
  const pastHtml = PAST.map((p) => {
    const r = S.recaps[p.id] || p.recap;
    return `<button class="night-card" data-a="${r ? 'night' : 'recap'}" data-id="${p.id}">${poster(p.id, p.scene, `<div class="row"><span class="pill glass">${esc(p.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))}</span><span class="grow"></span>${r ? `<span class="pill glass">${'★'.repeat(r.rating)}</span>` : '<span class="pill hot">Add your recap</span>'}</div><h3>${esc(p.title)}</h3>`, '', p.title.split(' ')[0], 70)}
      <div class="body"><span class="faces">${p.crew.map(faceOf).join('')}</span><div class="grow muted" style="font-size:13px">${esc(p.area)} · ${esc(HOSTS[p.host].name)}</div>${icon('arrow')}</div></button>`;
  }).join('');
  return `<div class="top-safe"></div><h1 class="big-title">Your plans</h1>
    <div class="seg" style="margin-top:18px"><button class="${S.nightsSeg === 'upcoming' ? 'on' : ''}" data-a="seg" data-v="upcoming">Upcoming</button><button class="${S.nightsSeg === 'past' ? 'on' : ''}" data-a="seg" data-v="past">Past</button></div>
    <div style="margin-top:18px">${S.nightsSeg === 'upcoming' ? (up.map(nightCard).join('') || '<p class="lede">Nothing booked yet. Save events from Discover and they land here.</p>') : `
      <button class="night-card" data-a="wrapped" style="background:none">${poster('wrapped', 'dance', `<div class="eyebrow" style="color:var(--paper)">6ix Wrapped · preview</div><h3 style="font-size:30px">Your ${NOW.getFullYear()} so far</h3>`, '', '2026', 120)}</button>${pastHtml}`}</div>`;
}

// =========================================================================
// Pushed pages
// =========================================================================
function pageHtml(p) {
  switch (p.v) {
    case 'event': return eventPage(EV.get(p.id));
    case 'mix': return mixPage(p.id);
    case 'signal': return signalPage();
    case 'plan': return planPage(p.id);
    case 'hub': return hubPage(EV.get(p.id));
    case 'checkin': return checkinPage(EV.get(p.id), p.done);
    case 'recap': return recapPage(p.id);
    case 'night': return nightPage(p.id);
    case 'wrapped': return wrappedPage(p.i || 0);
    case 'profile': return profilePage();
    case 'tickets': return ticketsPage(EV.get(p.id));
    case 'agecheck': return ageCheckPage(p);
    case 'allages': return allAgesPage(p.id);
    case 'idea': return ideaPage(p.id);
    case 'draft': return draftPage(p.id);
    case 'hevent': return hostEventPage(EV.get(p.id));
    default: return '';
  }
}
const backBtn = (extra = '') => `<button class="icon-btn glass" data-a="back" aria-label="Back">${icon('back')}</button>${extra}`;

function eventPage(e) {
  const fit = fitFor('me', e);
  const h = HOSTS[e.host];
  const fg = FRIENDS_GOING[e.id] || [];
  const plan = S.plans[e.id];
  const heroInner = `<div class="row">${backBtn()}<span class="grow"></span><button class="icon-btn glass" data-a="save" data-id="${e.id}" aria-label="${S.saved.has(e.id) ? 'Unsave' : 'Save'}">${icon(S.saved.has(e.id) ? 'heartFill' : 'heart')}</button></div>
    <div><div class="row" style="gap:8px;margin-bottom:12px"><span class="pill glass">${icon('near')}${distStr(distFromHome(e))} from home</span>${e.age19 ? '<span class="pill hot">19+</span>' : '<span class="pill glass">All ages</span>'}${e.demandBooked ? '<span class="pill hot">Booked from demand</span>' : ''}</div>
      <h1>${esc(e.title)}</h1><div class="row" style="margin-top:10px;font-size:14px" ><span class="muted">${icon('pin')}</span><span class="muted grow">${esc(e.venue)}, ${esc(e.area)}</span>${e.rating ? `<span>★ ${e.rating} <span class="muted">(${e.reviews})</span></span>` : '<span class="muted">First edition</span>'}</div></div>`;
  return `${poster(e.id, e.scene, heroInner, 'hero', e.title.split(' ')[0], 110)}
    <div class="detail">
      <div class="why"><div class="ring" style="--p:${fit}"><span>${fit}</span></div><div><div style="font-weight:700;margin-bottom:4px">Why Sixer picked this</div><p>${reasons(e).join(' · ')}</p></div></div>
      <div class="facts">
        <div class="fact">${icon('clock')}<span><b>${esc(whenLabel(e.start))}</b> – ${esc(timeStr(e.end))}</span></div>
        <div class="fact">${icon('cash')}<span><b>${money(e.price)}</b> · tickets on the host's own page</span></div>
        <div class="fact">${icon('id')}<span>${e.age19 ? `<b>19+</b> · ID checked at the door${S.age === 'adult' ? '. You confirmed your age.' : '. We\'ll ask once before tickets.'}` : '<b>All ages</b> · families and under-19s welcome'}</span></div>
        <div class="fact">${icon('host')}<span class="grow">Hosted by <b>${esc(h.name)}</b></span><button class="btn sm ${S.following.has(e.host) ? 'ghost' : 'solid'}" data-a="follow" data-id="${e.host}">${S.following.has(e.host) ? 'Following' : 'Follow'}</button></div>
        <div class="fact">${icon('crew')}<span><b>${e.going}</b> going${fg.length ? ` · including ${esc(fg.map((f) => PEOPLE[f].short).join(', '))}` : ''}</span>${fg.length ? `<span class="faces">${fg.map(faceOf).join('')}</span>` : ''}</div>
      </div>
      <p class="muted" style="font-size:15.5px">${esc(e.blurb)}</p>
      ${S.crewOn ? `<div class="why"><div class="grow"><div style="font-weight:700">Going with friends?</div><p>${plan ? `Group plan started · ${Object.values(plan.replies).filter((x) => x === 'in').length} of ${plan.members.length} in` : `Crew Blend says ${blend(['me', ...FRIENDS.filter((f) => S.crewSel.has(f))]).find((b) => b.e.id === e.id)?.score ?? '–'}% for your crew.`}</p></div><button class="btn sm solid" data-a="plan" data-id="${e.id}">${plan ? 'Open plan' : 'Plan it'}</button></div>` : ''}
      ${e.updates.length ? `<div class="why"><div class="grow"><div class="row" style="gap:8px;font-weight:700"><span class="live-dot"></span>Live from the host</div><p style="margin-top:6px">${esc(e.updates[e.updates.length - 1].text)}</p></div></div>` : ''}
    </div>
    <div class="sticky-cta">${S.tickets.has(e.id) ? `<button class="btn solid" data-a="hub" data-id="${e.id}">Open event day hub</button>` : `<button class="btn solid" data-a="tickets" data-id="${e.id}">${e.price ? 'Get tickets' : 'I\'m going'}</button>`}<button class="icon-btn glass" style="width:52px;height:52px;border-radius:26px" data-a="ask-about" data-id="${e.id}" aria-label="Ask Sixer about this">${icon('spark')}</button></div>`;
}
function ticketsPage(e) {
  return `<div class="page-head">${backBtn()}<h2>Tickets</h2></div>
    <div class="pad" style="display:grid;gap:16px;margin-top:10px">${poster(e.id, e.scene, '', '', e.title, 60).replace('style="', 'style="height:180px;')}
      <h1 style="font-size:30px">${esc(e.title)}</h1>
      <p class="muted">${e.price ? `Tickets are ${money(e.price)} on ${esc(HOSTS[e.host].name)}'s own ticket page. We don't sell tickets, so our picks stay neutral.` : 'This one is free. Tell us you\'re going so your crew and Sixer know.'}</p>
      <div class="why"><div class="grow"><div style="font-weight:700">Ticket page</div><p class="mono" style="margin-top:4px">tickets.${esc(e.host)}.example/${esc(e.id)}</p></div></div>
      <p class="note">In this demo the host's page is a placeholder. Once you've bought, tap the button below.</p>
      <button class="btn solid block" data-a="got-tickets" data-id="${e.id}">${e.price ? 'I got tickets' : 'I\'m going'}</button>
    </div>`;
}
function ageCheckPage(p) {
  const e = EV.get(p.id);
  return `<div class="page-head">${backBtn()}<h2></h2></div>
    <div class="pad" style="display:grid;gap:16px;margin-top:24px">
      <div class="big-check" style="font-family:var(--f-display);font-weight:800;font-size:38px">19+</div>
      <h1 style="font-size:34px;text-align:center">${esc(e.title)} is 19+</h1>
      <p class="muted" style="text-align:center">${esc(e.venue)} checks ID at the door. Confirm once and we won't ask again.</p>
      <button class="btn hot block" data-a="age-yes" data-id="${e.id}" data-v="${p.next}">I'm 19 or older</button>
      <button class="btn ghost block" data-a="age-no" data-id="${e.id}">I'm under 19</button>
      <p class="note" style="text-align:center">We only ask for events that require it. Everything else on The 6ix Sense is open to all ages.</p>
    </div>`;
}
function allAgesPage(id) {
  const e = EV.get(id);
  const t = taste();
  const alts = upcoming().filter((x) => x.scene === e.scene || x.scene2 === e.scene || x.scene === e.scene2).sort((a, b) => fitFor('me', b, t) - fitFor('me', a, t)).slice(0, 4);
  const more = alts.length < 3 ? upcoming().filter((x) => !alts.includes(x)).sort((a, b) => fitFor('me', b, t) - fitFor('me', a, t)).slice(0, 4 - alts.length) : [];
  return `<div class="page-head">${backBtn()}<h2></h2></div>
    <h1 class="big-title">All-ages picks for you</h1>
    <p class="lede">That one's 19+, so here are events like it that everyone can go to. We'll keep your picks all-ages from now on. You can change this in your profile.</p>
    <div style="margin-top:14px">${[...alts, ...more].map((x) => listItem(x, t)).join('')}</div>`;
}
function mixPage(id) {
  const t = taste();
  const list = id === 'weekly' ? weekly().map((x) => x.e) : upcoming().filter((e) => e.scene === id || e.scene2 === id).sort((a, b) => fitFor('me', b, t) - fitFor('me', a, t));
  const title = id === 'weekly' ? 'Your 6ix Weekly' : SCENES[id].label + ' Mix';
  return `${poster('mixh' + id, id === 'weekly' ? 'dance' : id, `<div class="row">${backBtn()}</div><div><div class="eyebrow" style="color:var(--paper)">${id === 'weekly' ? 'Refreshed every Monday' : 'Scene Mix · rotates daily'}</div><h1 style="font-size:40px;margin-top:6px">${esc(title)}</h1><div class="muted" style="margin-top:6px">${list.length} events picked for you</div></div>`, 'hero', title, 90).replace('style="', 'style="height:330px;')}
    <div style="padding:14px 0">${list.map((e) => listItem(e, t)).join('')}</div>`;
}

// "I'd go if…"
const sig = { scene: 'food', area: 'Ossington', when: 'Friday late', budget: 25, text: '' };
function signalPage() {
  const whenOpts = ['Weeknight', 'Friday late', 'Saturday', 'Sunday daytime'];
  const budgets = [15, 25, 40, 0];
  const others = 60 + (hash(sig.scene + sig.area + sig.when) % 260);
  return `<div class="page-head">${backBtn()}<h2>I'd go if…</h2></div>
    <div class="idea-line">I'd go to <em>${esc(sig.text || SCENES[sig.scene].label.toLowerCase())}</em>, <em>${esc(sig.when.toLowerCase())}</em>, near <em>${esc(sig.area)}</em>, ${sig.budget ? `under <em>$${sig.budget}</em>` : 'at <em>any price</em>'}.</div>
    <div class="field"><div class="label">What</div><input class="text-in" id="sig-text" placeholder="e.g. vinyl brunch, ramen pop-up" value="${esc(sig.text)}" maxlength="60" aria-label="What would you go to"></div>
    <div class="field"><div class="label">Scene</div><div class="chips">${SCENE_KEYS.map((s) => `<button class="chip ${sig.scene === s ? 'on' : ''}" data-a="sig" data-k="scene" data-v="${s}">${esc(SCENES[s].label)}</button>`).join('')}</div></div>
    <div class="field"><div class="label">When</div><div class="chips">${whenOpts.map((w) => `<button class="chip ${sig.when === w ? 'on' : ''}" data-a="sig" data-k="when" data-v="${w}">${w}</button>`).join('')}</div></div>
    <div class="field"><div class="label">Where</div><div class="chips">${AREA_KEYS.map((a) => `<button class="chip ${sig.area === a ? 'on' : ''}" data-a="sig" data-k="area" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>
    <div class="field"><div class="label">Budget</div><div class="chips">${budgets.map((b) => `<button class="chip ${sig.budget === b ? 'on' : ''}" data-a="sig" data-k="budget" data-v="${b}">${b ? 'Under $' + b : 'Any'}</button>`).join('')}</div></div>
    <div class="field" style="margin:26px 0 30px"><p class="muted" style="margin-bottom:12px">${others} matched people near ${esc(sig.area)} want something similar. Hosts see the total, never your name.</p><button class="btn solid block" data-a="sig-send">Send to hosts</button></div>`;
}

// Group plan
function planPage(id) {
  const e = EV.get(id);
  const plan = S.plans[id];
  const inCount = Object.values(plan.replies).filter((x) => x === 'in').length;
  const all = inCount === plan.members.length;
  return `${poster(e.id + 'plan', e.scene, `<div class="row">${backBtn()}</div><div><div class="eyebrow" style="color:var(--paper)">Group plan</div><h1 style="font-size:36px;margin-top:6px">${esc(e.title)}</h1><div class="muted" style="margin-top:6px">${esc(whenLabel(e.start))} · ${esc(e.area)}</div></div>`, 'hero', e.title.split(' ')[0], 100).replace('style="', 'style="height:320px;')}
    <div class="detail">
      <div class="row"><div class="score">${plan.score}%</div><div class="grow muted">crew fit · ${inCount} of ${plan.members.length} in</div></div>
      <div style="display:grid;gap:4px">${plan.members.map((m) => `<div class="row" style="padding:8px 0">${avatar(m)}<div class="grow"><div style="font-weight:600">${esc(PEOPLE[m].name)}</div><div class="muted" style="font-size:13px">${m === 'me' ? 'You started this plan' : plan.replies[m] === 'in' ? 'Tapped "I\'m in"' : 'Waiting for reply…'}</div></div>
        ${plan.replies[m] === 'in' ? `<span class="pill hot">${icon('check')}In</span>` : '<span class="thinking"><i></i><i></i><i></i></span>'}</div>`).join('')}</div>
      ${all ? `<div class="why"><div class="grow"><div style="font-weight:700">Plan locked</div><p>Everyone's in. Each "I'm in" becomes a matched attendance when you check in at the door.</p></div></div>
        <button class="btn solid block" data-a="${S.tickets.has(id) ? 'hub' : 'tickets'}" data-id="${id}">${S.tickets.has(id) ? 'Open event day hub' : 'Get tickets'}</button>` : '<p class="note">Your crew gets a notification. Replies show up here as they come in.</p>'}
    </div>`;
}

// Event day hub + check-in
function hubPage(e) {
  const mins = Math.round((e.start - NOW) / 60000);
  const startsIn = mins > 0 ? (mins >= 60 ? `Starts in ${Math.floor(mins / 60)}h ${mins % 60}m` : `Starts in ${mins} min`) : 'Happening now';
  const d = distFromHome(e);
  const route = e.area === 'Ossington' ? '505 Dundas streetcar west, 3 stops, then 4 min walk' : d < 3 ? `${Math.round(d / 4.8 * 60)} min walk` : `Line 2 or the 501 Queen streetcar · about ${Math.round(d * 3 + 8)} min`;
  const crew = (FRIENDS_GOING[e.id] || []).concat(S.plans[e.id] ? S.plans[e.id].members.filter((m) => m !== 'me') : []).filter((v, i, a) => a.indexOf(v) === i);
  return `${poster(e.id + 'hub', e.scene, `<div class="row">${backBtn()}<span class="grow"></span><span class="pill glass"><span class="live-dot"></span>Event day</span></div><div><h1 style="font-size:34px">${esc(e.title)}</h1><div class="muted" style="margin-top:6px">${esc(startsIn)} · ${esc(e.venue)}</div></div>`, 'hero', shortWhen(e.start), 100).replace('style="', 'style="height:300px;')}
    <div style="padding:18px 0 8px">
      <div class="hub-block"><div class="row">${icon('train')}<h3 class="grow">Getting there</h3><span class="muted" style="font-size:13px">${distStr(d)}</span></div><p class="muted">${esc(route)}. GO and rideshare options open in your maps app.</p></div>
      <div class="hub-block"><div class="row">${icon('door')}<h3>Entrances</h3></div>${e.entrances.map((x) => `<div class="muted">· ${esc(x)}</div>`).join('')}</div>
      <div class="hub-block"><div class="row"><span class="live-dot"></span><h3>Live updates</h3></div>${e.updates.length ? [...e.updates].reverse().map((u) => `<div class="update"><span class="t">${esc(u.t)}</span><span>${esc(u.text)}</span></div>`).join('') : '<p class="muted">The host hasn\'t posted yet.</p>'}</div>
      ${crew.length ? `<div class="hub-block"><div class="row">${icon('crew')}<h3 class="grow">Your crew</h3><span class="faces">${crew.map(faceOf).join('')}</span></div><p class="muted">${esc(crew.map((c) => PEOPLE[c].short).join(', '))} ${crew.length > 1 ? 'are' : 'is'} going. Attendee chat opens an hour before doors (moderated by the host).</p></div>` : ''}
    </div>
    <div class="sticky-cta">${S.checkins.has(e.id) ? `<button class="btn ghost" style="flex:1" disabled>${icon('check')} Checked in</button>` : `<button class="btn solid" data-a="checkin" data-id="${e.id}">${icon('qr')} Check in at the door</button>`}</div>`;
}
function checkinPage(e, done) {
  if (done) {
    return `<div class="page-head">${backBtn()}<h2></h2></div><div class="pad" style="text-align:center;display:grid;gap:18px;margin-top:40px">
      <div class="big-check">${icon('check')}</div><h1 style="font-size:34px">You're in.</h1>
      <p class="muted">Checked in at ${esc(e.venue)}. That's a matched attendance: Sixer picked it and you showed up. It counts toward your 6ix Wrapped.</p>
      <p class="note">Afterwards we'll ask how it went.</p><button class="btn solid block" data-a="back">Back to the hub</button></div>`;
  }
  return `<div class="page-head">${backBtn()}<h2>Check in</h2></div>
    <div class="scanner">${poster(e.id + 'scan', e.scene, '').replace('style="', 'style="position:absolute;inset:0;border-radius:0;')}<div class="frame"></div></div>
    <p class="lede" style="text-align:center;margin:0 auto">Point your camera at the door QR. In this demo the camera is off, so use the button.</p>
    <div class="pad" style="display:grid;gap:10px;margin-top:20px"><button class="btn solid block" data-a="checkin-done" data-id="${e.id}">${icon('qr')} Simulate scan</button><button class="btn ghost block" data-a="checkin-done" data-id="${e.id}">${icon('pin')} Check in by location</button></div>`;
}

// Morning recap
let recapDraft = null;
function recapPage(id) {
  const p = PAST.find((x) => x.id === id);
  if (!recapDraft || recapDraft.id !== id) recapDraft = { id, rating: 0, tags: new Set(p.crew), photos: [], note: '' };
  const r = recapDraft;
  const people = [...p.crew, ...p.met];
  return `${poster(p.id, p.scene, `<div class="row">${backBtn()}</div><div><div class="eyebrow" style="color:var(--paper)">Recap</div><h1 style="font-size:34px;margin-top:6px">How was ${esc(p.title)}?</h1></div>`, 'hero', 'Last night', 90).replace('style="', 'style="height:300px;')}
    <div class="detail">
      <div class="stars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button class="${r.rating >= n ? 'on' : ''}" data-a="recap-star" data-v="${n}" aria-label="${n} stars">★</button>`).join('')}</div>
      <div><div class="eyebrow" style="margin-bottom:10px">Who were you with?</div><div class="chips" style="padding:0;flex-wrap:wrap">${people.map((id2) => `<button class="chip ${r.tags.has(id2) ? 'on' : ''}" data-a="recap-tag" data-id="${id2}">${faceOf(id2)}${esc(PEOPLE[id2].name)}${p.met.includes(id2) ? ' <span class="muted-2" style="font-weight:500">· met there</span>' : ''}</button>`).join('')}</div>
        <p class="note" style="margin-top:8px">Tagged people get a request. Nothing is shared until they accept.</p></div>
      <div><div class="eyebrow" style="margin-bottom:10px">Photos</div><div class="photos">${r.photos.map((u) => `<div class="ph" style="background-image:url('${u}')"></div>`).join('')}<label class="ph" style="cursor:pointer">${icon('camera')}<input type="file" id="recap-photos" accept="image/*" multiple hidden></label></div></div>
      <textarea id="recap-note" class="text-in" style="height:90px;padding:14px 20px;border-radius:22px;resize:none" placeholder="Anything to remember? (optional)">${esc(r.note)}</textarea>
      <button class="btn solid block" data-a="recap-save" ${r.rating ? '' : 'disabled'}>Save it</button>
    </div>`;
}
function nightPage(id) {
  const p = PAST.find((x) => x.id === id);
  const r = S.recaps[id] || p.recap;
  return `${poster(p.id, p.scene, `<div class="row">${backBtn()}</div><div><div class="eyebrow" style="color:var(--paper)">${esc(p.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div><h1 style="font-size:34px;margin-top:6px">${esc(p.title)}</h1><div style="margin-top:8px;color:var(--gold)">${'★'.repeat(r.rating)}</div></div>`, 'hero', p.title.split(' ')[0], 100).replace('style="', 'style="height:320px;')}
    <div class="detail"><div class="facts"><div class="fact">${icon('pin')}<span><b>${esc(p.area)}</b> · ${esc(HOSTS[p.host].name)}</span></div></div>
      ${r.photos?.length ? `<div class="photos">${r.photos.map((u) => `<div class="ph" style="background-image:url('${u}')"></div>`).join('')}</div>` : ''}
      ${r.note ? `<p style="font-size:17px">"${esc(r.note)}"</p>` : ''}
      <div><div class="eyebrow" style="margin-bottom:10px">People</div>${[...r.tags].map((t) => `<div class="row" style="padding:6px 0">${avatar(t)}<div class="grow" style="font-weight:600">${esc(PEOPLE[t].name)}</div><span class="muted" style="font-size:13px">${(r.confirmed || []).includes(t) ? 'Confirmed' : 'Pending'}</span></div>`).join('')}</div>
      <p class="note">Saved to your record. Sixer used it to update your taste.</p></div>`;
}

// 6ix Wrapped
function wrappedPage(i) {
  const t = taste();
  const topS = SCENE_KEYS.slice().sort((a, b) => t[b] - t[a]).slice(0, 3);
  const nights = 31 + S.checkins.size + Object.keys(S.recaps).length;
  const slides = [
    { scene: 'dance', eyebrow: `6ix Wrapped ${NOW.getFullYear()} · so far`, big: String(nights), h: 'days and nights out in the 6ix', p: 'Half with your crew, half solo. Weekend mornings are your new thing.' },
    { scene: topS[0], eyebrow: 'Your top scene', big: '', h: SCENES[topS[0]].label, p: `Then ${SCENES[topS[1]].label} and ${SCENES[topS[2]].label}. You're in the top 8% of ${SCENES[topS[0]].label.toLowerCase()} fans in Toronto.` },
    { scene: 'markets', eyebrow: 'Your neighbourhood', big: '', h: 'Kensington', p: '11 outings within 600 m of Augusta Ave. Ossington is a close second.' },
    { scene: 'live', eyebrow: 'Crew MVP', big: '', h: 'Maya', p: 'Maya was there for 14 of your outings. You also met 9 new people who confirmed the tag.' },
  ];
  const s = slides[clamp(i, 0, slides.length - 1)];
  return `<div class="wrapped" data-a="wrapped-next" data-i="${i}">${poster('wr' + i, s.scene, `<div><div class="bars-top">${slides.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div><div class="row" style="margin-top:14px"><span class="eyebrow grow" style="color:var(--paper)">${esc(s.eyebrow)}</span><button class="icon-btn glass" data-a="back" aria-label="Close">${icon('x')}</button></div></div>
    <div>${s.big ? `<div class="huge">${esc(s.big)}</div>` : ''}<h2 style="${s.big ? '' : 'font-size:64px;line-height:.9'}">${esc(s.h)}</h2><p style="margin-top:14px;font-size:17px;max-width:30ch;color:var(--paper)">${esc(s.p)}</p></div>
    <div class="note" style="color:var(--dim)">${i < slides.length - 1 ? 'Tap for next' : 'Your full Wrapped arrives in December. Share it when it lands.'}</div>`, '', s.h, 150)}</div>`;
}

// Profile
function profilePage() {
  const t = taste();
  return `<div class="page-head">${backBtn()}<h2>You</h2></div>
    <div class="row pad" style="margin-top:6px"><span class="orb" style="--s:64px"></span><div><h1 style="font-size:26px">What Sixer knows</h1><p class="muted" style="font-size:14px">Everything here shapes your picks. Change anything.</p></div></div>
    <div style="margin-top:18px">${SCENE_KEYS.slice().sort((a, b) => t[b] - t[a]).map((s) => `<div class="taste-row"><span style="font-weight:600">${esc(SCENES[s].label)}</span><span class="bar"><i style="width:${Math.round(t[s] * 100)}%;--c:${sceneColor(s)}"></i></span>
      <span class="ctl"><button data-a="taste" data-id="${s}" data-v="-1" aria-label="Less ${esc(SCENES[s].label)}">${icon('minus')}</button><button data-a="taste" data-id="${s}" data-v="1" aria-label="More ${esc(SCENES[s].label)}">${icon('plus')}</button></span></div>`).join('')}</div>
    <div class="sec-head"><h2 style="font-size:18px">When you go out</h2></div><div class="chips" style="flex-wrap:wrap">${Object.entries(TIMES).map(([k, l]) => `<button class="chip ${S.times.has(k) ? 'on' : ''}" data-a="time-toggle" data-v="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="sec-head"><h2 style="font-size:18px">Areas</h2></div><div class="chips" style="flex-wrap:wrap">${[HOME, ...S.areas].map((a, i) => `<span class="chip ${i === 0 ? 'on' : ''}">${i === 0 ? 'Home · ' : ''}${esc(a)}</span>`).join('')}</div>
    <div class="sec-head"><h2 style="font-size:18px">Your "I'd go if…" signals</h2></div>
    ${S.signals.map((s) => `<div class="setting"><span class="icon-btn" style="background:var(--night-3)">${icon('bulb')}</span><div class="grow">${esc(s.text)}<span>${esc(s.area)} · ${esc(s.when)} · ${s.status === 'happening' ? 'Booked! ' + esc(EV.get(s.eventId)?.title || '') : `${s.others} others asked`}</span></div></div>`).join('')}
    <div class="sec-head"><h2 style="font-size:18px">Settings</h2></div>
    <button class="setting" data-a="crew-connect">${icon('crew')}<div class="grow">Friends and Crew Blend<span>${S.crewOn ? 'On. Friends see group scores only.' : 'Off'}</span></div><span class="switch ${S.crewOn ? 'on' : ''}"></span></button>
    <button class="setting" data-a="age-reset" ${S.age ? '' : 'disabled'}>${icon('id')}<div class="grow">Age for 19+ events<span>${S.age === 'adult' ? '19+ confirmed. Tap to clear.' : S.age === 'under' ? 'Under 19: showing all-ages events only. Tap to clear.' : 'Not asked. We only ask when an event is 19+.'}</span></div></button>
    <button class="setting" data-a="mode-host">${icon('swap')}<div class="grow">Switch to host mode<span>${S.hostOnboarded ? esc(HOSTS.loop.name) : 'Set up your host profile'}</span></div>${icon('arrow')}</button>
    <button class="setting" data-a="replay">${icon('refresh')}<div class="grow">Replay onboarding<span>Start fresh with new scenes and areas</span></div>${icon('arrow')}</button>
    <div style="height:40px"></div>`;
}

// =========================================================================
// Host mode
// =========================================================================
function hostTab() {
  if (S.hostTab === 'events') return hostEventsTab();
  if (S.hostTab === 'insights') return hostInsightsTab();
  if (S.hostTab === 'you') return `<div class="top-safe"></div><h1 class="big-title">${esc(HOSTS.loop.name)}</h1><p class="lede">Verified host · ${esc(HOSTS.loop.scenes.map((s) => SCENES[s].label).join(', '))}</p>
    <div class="pad" style="margin-top:20px"><button class="btn solid block" data-a="mode-attendee">${icon('swap')} Back to attendee mode</button></div>`;
  const heat = IDEAS.map((d) => { const [x, y] = AREAS[d.area]; const r = 14 + d.count / 14; return `<circle cx="${x}" cy="${y}" r="${r}" fill="${sceneColor(d.scene)}" opacity=".32"/><circle cx="${x}" cy="${y}" r="${r * .45}" fill="${C.accent}"/><text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.ink}" font-family="DM Mono, monospace">${d.count}</text>`; }).join('');
  return `<div class="top-safe"></div><div class="eyebrow pad">${esc(HOSTS.loop.name)} · host</div><h1 class="big-title" style="padding-top:6px">What Toronto wants</h1>
    <p class="lede">Live "I'd go if…" demand from matched, active people. Book what's wanted, then test it with a draft.</p>
    <div class="demand-map" style="margin-top:18px">${baseMapSvg(heat).replace(`viewBox="${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}"`, 'viewBox="20 90 340 250"')}</div>
    <div class="sec-head"><h2>Top requests</h2><span class="muted" style="font-size:13px">last 30 days</span></div>
    ${IDEAS.map((d) => `<button class="idea" data-a="idea" data-id="${d.id}"><div class="count">${d.count}</div><div class="grow"><div class="t">${esc(d.text)}</div><div class="m">${esc(d.area)} · ${esc(d.when)} · under $${d.budget}</div></div>${d.booked || S.host.drafts[d.id] ? `<span class="pill ${d.booked || S.host.drafts[d.id]?.status === 'alerted' ? 'hot' : 'glass'}">${d.booked ? 'Booked' : S.host.drafts[d.id].status === 'alerted' ? 'Live' : 'Draft'}</span>` : icon('arrow')}</button>`).join('')}`;
}
function ideaPage(id) {
  const d = IDEAS.find((x) => x.id === id);
  const cap = Math.round(d.count * 0.45 / 10) * 10;
  const price = Math.max(10, d.budget - 5);
  return `${poster(id, d.scene, `<div class="row">${backBtn()}</div><div><div class="eyebrow" style="color:var(--paper)">Idea brief · drafted by Sixer</div><h1 style="font-size:36px;margin-top:6px">${esc(d.text)}</h1></div>`, 'hero', d.text.split(' ')[0], 100).replace('style="', 'style="height:300px;')}
    <div class="detail">
      <div class="kpis" style="padding:0"><div class="kpi"><div class="v">${d.count}</div><div class="l">matched people asked near ${esc(d.area)}</div></div><div class="kpi"><div class="v">${Math.round(d.crew * 100)}%</div><div class="l">want to come as a crew</div></div></div>
      <div class="why"><span class="orb" style="--s:40px"></span><div><div style="font-weight:700;margin-bottom:4px">Sixer's suggestion</div><p>${esc(d.when)}, ${esc(d.area)}. Price around <b>$${price}</b> (their budget is under $${d.budget}). Capacity <b>${cap}</b>. People who asked also love ${esc(SCENES[d.scene === 'live' ? 'food' : 'live'].label)}, so a crossover would widen it.</p></div></div>
      <p class="muted">Post a draft to test it before you book anything. Everyone who asked sees it first and can save it.</p>
      ${d.booked ? `<button class="btn ghost block" data-a="event" data-id="${d.booked}">Already booked: see the event</button>` : `<button class="btn solid block" data-a="post-draft" data-id="${id}">${S.host.drafts[id] ? 'Open draft' : 'Post draft to test'}</button>`}
    </div>`;
}
function draftPage(id) {
  const d = IDEAS.find((x) => x.id === id);
  const dr = S.host.drafts[id];
  const pct = clamp(dr.interest / dr.threshold * 100, 0, 100);
  const passed = dr.interest >= dr.threshold;
  const stepsHtml = [
    ['Venue and talent booked', 'Outside the app, on your own terms', 'venue', dr.venue],
    ['Publish with your ticket link', 'Tickets stay on your page', 'publish', dr.status === 'published' || dr.status === 'alerted'],
    ['Promote (optional)', 'Shown with a "Promoted" label. Never changes rank.', 'promote', dr.promoted],
    [`Send "You asked, it's happening"`, `${dr.interest} people who saved the draft hear first`, 'alert', dr.status === 'alerted'],
  ];
  return `<div class="page-head">${backBtn()}<h2>Draft test</h2></div>
    <div class="idea-line" style="padding-top:4px">${esc(d.text)}</div><p class="lede">${esc(d.area)} · ${esc(d.when)} · $${dr.price} · ${dr.age19 ? '19+' : 'All ages'}</p>
    <div class="pad" style="margin-top:22px;display:grid;gap:10px">
      <div class="row"><span class="grow" style="font-weight:700;font-size:18px">${dr.interest} interested</span><span class="muted mono" style="font-size:12.5px">threshold ${dr.threshold}</span></div>
      <div class="meter"><i style="width:${pct}%"></i><b style="left:${clamp(100, 0, 99.5)}%"></b></div>
      <p class="muted" style="font-size:13.5px">${passed ? 'Interest passed the threshold. Go ahead and book.' : `Matched attendees are saving the draft. You need ${dr.threshold - dr.interest} more before it's worth booking.`}</p>
      ${!passed ? `<button class="btn ghost block" data-a="simulate" data-id="${id}">Simulate 3 days of interest</button>` : ''}
      ${!passed && dr.sims >= 1 ? `<div class="why"><span class="orb" style="--s:36px"></span><div class="grow"><div style="font-weight:700">Sixer suggests a tweak</div><p>Move it to Saturday and drop the price to $${Math.max(10, dr.price - 5)}. Matched demand goes up about 35%.</p><button class="btn sm solid" style="margin-top:10px" data-a="tweak" data-id="${id}">Apply tweak</button></div></div>` : ''}
    </div>
    ${passed ? `<div class="pad steps" style="margin-top:20px">${stepsHtml.map(([t, dsc, a, done], i) => `<button class="step ${done ? 'done' : ''}" data-a="hstep" data-k="${a}" data-id="${id}"><span class="n">${done ? icon('check') : i + 1}</span><div class="grow"><div class="t">${t}</div><div class="d">${dsc}</div></div></button>`).join('')}</div>` : ''}
    ${dr.status === 'alerted' ? `<div class="pad" style="margin:18px 0 30px"><div class="why"><div class="grow"><div style="font-weight:700">It's live</div><p>Alerts went to ${dr.interest} people. It now shows up in 6ix Weekly for matched attendees.</p></div></div></div>` : '<div style="height:30px"></div>'}`;
}
function hostEventsTab() {
  const mine = EVENTS.filter((e) => e.host === 'loop').concat(S.host.published.map((id) => EV.get(id)));
  return `<div class="top-safe"></div><h1 class="big-title">Your events</h1><p class="lede">Set up event day, post live updates and see who's coming.</p><div style="margin-top:16px">
    ${mine.map((e) => `<button class="night-card" data-a="hevent" data-id="${e.id}">${poster(e.id + 'h', e.scene, `<div class="row"><span class="pill glass">${esc(shortWhen(e.start))}</span><span class="grow"></span>${e.demandBooked ? '<span class="pill hot">From demand</span>' : ''}</div><h3>${esc(e.title)}</h3>`, '', e.title.split(' ')[0], 70)}
      <div class="body"><div class="grow"><div style="font-weight:600">${e.going} going</div><div class="muted" style="font-size:13px">${Math.round(e.going * 0.72)} matched by Sixer</div></div><span class="btn sm solid">Manage</span></div></button>`).join('')}</div>`;
}
function hostEventPage(e) {
  const mods = S.host.moderators[e.id] || new Set(['Priya']);
  return `<div class="page-head">${backBtn()}<h2>${esc(e.title)}</h2></div>
    <div style="padding:8px 0 40px">
      <div class="hub-block"><h3>Door QR</h3><div class="qr">${qrSvg(e.id)}</div><p class="muted" style="text-align:center;font-size:13px">Print it or show it on a tablet at each entrance.</p></div>
      <div class="hub-block"><h3>Entrances</h3>${e.entrances.map((x) => `<div class="muted">· ${esc(x)}</div>`).join('')}</div>
      <div class="hub-block"><h3>Chat moderators</h3><div class="chips" style="padding:0;flex-wrap:wrap">${['Priya', 'Dev', 'Sasha'].map((m) => `<button class="chip ${mods.has(m) ? 'on' : ''}" data-a="mod" data-id="${e.id}" data-v="${m}">${esc(m)}</button>`).join('')}</div></div>
      <div class="hub-block"><h3>Post a live update</h3><p class="muted" style="font-size:13px">Set times, delays, entrance changes. Attendees see it in their event day hub.</p>
        <input class="text-in" id="upd-${e.id}" placeholder="e.g. Doors pushed to 11:15" maxlength="140"><button class="btn solid block" data-a="post-update" data-id="${e.id}">Post update</button>
        ${[...e.updates].reverse().map((u) => `<div class="update"><span class="t">${esc(u.t)}</span><span>${esc(u.text)}</span></div>`).join('')}</div>
    </div>`;
}
function qrSvg(seed) {
  const r = rng(hash(seed)); const n = 21; let cells = '';
  const finder = (x, y) => (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && r() > 0.52) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  const f = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="var(--ink)"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="var(--ink)"/>`;
  return `<svg viewBox="0 0 21 21" width="100%" height="100%" shape-rendering="crispEdges" role="img" aria-label="Door QR code"><g fill="var(--ink)">${cells}</g>${f(0, 0)}${f(14, 0)}${f(0, 14)}</svg>`;
}
function hostInsightsTab() {
  return `<div class="top-safe"></div><div class="eyebrow pad">Last edition · Sunday Vinyl Brunch</div><h1 class="big-title" style="padding-top:6px">How it went</h1>
    <div class="kpis" style="margin-top:20px">
      <div class="kpi hot"><div class="v">164</div><div class="l">matched guests of 212 check-ins</div></div>
      <div class="kpi"><div class="v">71%</div><div class="l">came from demand signals</div></div>
      <div class="kpi"><div class="v">4.7★</div><div class="l">average recap rating</div></div>
      <div class="kpi"><div class="v">38%</div><div class="l">came back within a month</div></div></div>
    <div class="sec-head"><h2 style="font-size:18px">Solo vs crew</h2></div>
    <div class="split"><i style="background:var(--paper);width:38%"></i><i style="background:var(--accent);width:62%"></i></div>
    <div class="pad row muted" style="font-size:13px;margin-top:8px"><span class="grow">Solo 38%</span><span>Crews 62% · average crew of 3.4</span></div>
    <div class="sec-head"><h2 style="font-size:18px">What guests asked for next</h2></div>
    ${[['Evening edition on Saturdays', 118], ['Add a record swap table', 86], ['Bigger room, 150+ capacity', 64]].map(([t, n]) => `<div class="idea"><div class="count" style="font-size:22px">${n}</div><div class="grow t">${t}</div></div>`).join('')}
    <div class="pad" style="margin-top:18px"><button class="btn solid block" data-a="tab" data-v="demand">Plan next from the demand map</button></div>`;
}

// =========================================================================
// Onboarding: shared welcome, then an attendee path or a host path
// =========================================================================
const PAST_CHOICES = [
  { id: 'p-jazz', title: 'A jazz night', scene: 'live' }, { id: 'p-market', title: 'A night market', scene: 'markets' },
  { id: 'p-comedy', title: 'A comedy show', scene: 'comedy' }, { id: 'p-workshop', title: 'A weekend workshop', scene: 'art' },
  { id: 'p-gallery', title: 'A gallery opening', scene: 'art' }, { id: 'p-trivia', title: 'Pub trivia', scene: 'games' },
];
const HOST_TYPES = [
  ['promoter', 'Promoter', 'Parties, pop-ups, markets and shows'],
  ['venue', 'Venue', 'A room people come back to'],
  ['community', 'Community group', 'Clubs, collectives and meetups'],
];
const VERIFY_OPTS = [
  ['ig', 'Instagram business account', 'Fastest. We check it matches your listings.'],
  ['biz', 'Business number', 'For registered venues and companies.'],
  ['site', 'Website or ticket page', 'We confirm you can edit it.'],
];
const FLOWS = { start: ['welcome', 'role'], attendee: ['sixer', 'scenes', 'times', 'areas', 'crew', 'build'], host: ['htype', 'verify', 'hprofile', 'claim', 'hbuild'] };
const O = { flow: 'start', i: 0, hostType: 'promoter', verified: null, verifying: false, hostName: 'Loop Collective', link: 'tickets.loopcollective.example', hostScenes: new Set(['live', 'markets', 'dance']), hostAreas: new Set(['Ossington', 'Distillery', 'Downtown']), claims: new Set(['rooftop', 'distillery', 'vinyl']), agePolicy: 'all', just: null };
const onbEl = document.getElementById('onb');

function openOnboarding(flow = 'start') {
  O.flow = flow; O.i = 0; onbEl.hidden = false; renderOnb('fwd');
}
const stepName = () => FLOWS[O.flow][O.i];
function onbProgress() {
  const hostOnly = S.onboarded && O.flow === 'host';
  const total = hostOnly ? FLOWS.host.length : 2 + FLOWS[O.flow === 'start' ? 'attendee' : O.flow].length;
  const offset = O.flow === 'start' || hostOnly ? 0 : 2;
  const n = offset + O.i;
  return `<div class="progress-pill glass st" style="--i:0"><span class="mono" style="font-size:13px">${n + 1} of ${total}</span><div class="dots">${Array.from({ length: total }, (_, k) => `<i class="${k === n ? 'on' : ''}"></i>`).join('')}</div></div>`;
}
const words = (html) => html.split(/(<span class="hl">.*?<\/span>|\s+)/).filter((w) => w && !/^\s+$/.test(w)).map((w, k) => `<span class="w"><span style="--i:${k}">${w}</span></span>`).join(' ');

function posterWall() {
  const ids = EVENTS.map((e) => e.id);
  const col = (offset) => {
    const list = Array.from({ length: 6 }, (_, k) => EV.get(ids[(offset + k * 3) % ids.length]));
    const tiles = list.map((e) => poster(e.id + 'w', e.scene, '', '', e.title.split(' ')[0], 54)).join('');
    return `<div class="col">${tiles}${tiles}</div>`;
  };
  return `<div class="onb-bg"><div class="wall">${col(0)}${col(1)}${col(2)}</div><div class="wall-fade"></div></div>`;
}
function glowBg() {
  return `<div class="onb-bg build"><div class="blob" style="width:300px;height:300px;left:-60px;top:80px;background:${C.accent};opacity:.55"></div><div class="blob" style="width:220px;height:220px;right:-70px;top:320px;background:${C.paper};opacity:.12;animation-delay:-3s"></div></div>`;
}

function renderOnb(dir) {
  const keep = onbEl.querySelector('.onb-scroll')?.scrollTop;
  const name = stepName();
  let bg = '', body = '';
  const foot = (next, { back = true, disabled = false, label = 'Continue', cls = 'solid' } = {}) =>
    `<div class="onb-foot st" style="--i:6">${back ? `<button class="btn ghost" data-a="onb-back" aria-label="Back">${icon('back')}</button>` : ''}<button class="btn ${cls}" data-a="${next}" ${disabled ? 'disabled' : ''}>${label}</button></div>`;

  if (name === 'welcome') {
    bg = posterWall();
    body = `${onbProgress()}<div style="flex:1"></div>
      <div class="eyebrow st" style="--i:1;color:var(--paper)">The 6ix Sense</div>
      <h1 class="words" style="margin-top:12px">${words('Toronto, day and night, <span class="hl">picked</span> <span class="hl">for</span> <span class="hl">you.</span>')}</h1>
      <p class="sub st" style="--i:6">Markets, workshops, live sets, food pop-ups and more. Solo, with friends or with family.</p>
      <div class="slide-btn glass st" style="--i:7;margin-top:28px" id="slide" role="button" tabindex="0" aria-label="Start exploring"><div class="knob">${icon('arrow')}</div><div class="label">Slide to explore <span class="chev"><span>›</span><span>›</span><span>›</span></span></div></div>`;
  } else if (name === 'role') {
    bg = glowBg();
    body = `${onbProgress()}<h1 class="words" style="margin-top:26px;font-size:40px">${words('How are you using <span class="hl">the</span> <span class="hl">6ix?</span>')}</h1>
      <div style="flex:1;display:grid;gap:12px;align-content:center;margin-top:18px">
        <button class="role-card a st" style="--i:3" data-a="onb-role" data-v="attendee"><div><h2>I'm going out</h2><p>Nights picked for you and your crew, every week.</p></div><span class="arrow">${icon('arrow')}</span></button>
        <button class="role-card b st" style="--i:4" data-a="onb-role" data-v="host"><div><h2>I host events</h2><p>See what Toronto wants before you book.</p></div><span class="arrow">${icon('arrow')}</span></button>
      </div><p class="note st" style="--i:5;text-align:center;margin-top:14px">You can switch anytime from your profile.</p>`;
  } else if (name === 'sixer') {
    bg = glowBg();
    body = `${onbProgress()}<div style="flex:1;display:grid;place-items:center"><span class="orb st" style="--s:150px;--i:1"></span></div>
      <h1 class="words">${words('Hi, I\'m <span class="hl">Sixer.</span>')}</h1>
      <p class="sub st" style="--i:3">I learn what you're into from the scenes you pick, what you save and where you actually go. I'll always tell you why I picked something.</p>
      ${foot('onb-next', { label: 'Nice to meet you' })}`;
  } else if (name === 'scenes') {
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('What\'s your <span class="hl">scene?</span>')}</h1><p class="sub st" style="--i:2">Pick at least two. Each one becomes a Scene Mix.</p>
      <div class="onb-scroll"><div class="scene-grid">${SCENE_KEYS.map((s, k) => `<button class="scene-tile st ${S.scenes.has(s) ? 'on' : ''} ${O.just === s ? 'just' : ''}" style="--i:${3 + k}" data-a="onb-scene" data-v="${s}" aria-pressed="${S.scenes.has(s)}">${poster('scene' + s, s, `<span class="tick">${S.scenes.has(s) ? icon('check') : icon('plus')}</span><h3>${esc(SCENES[s].label)}</h3>`).replace('style="', 'style="height:100%;border-radius:22px;')}</button>`).join('')}</div>
        <div class="eyebrow" style="margin:24px 0 10px">Been to any of these lately?</div>
        <div class="chips" style="padding:0;flex-wrap:wrap">${PAST_CHOICES.map((p) => `<button class="chip ${S.pastEvents.has(p.id) ? 'on' : ''}" data-a="onb-past" data-v="${p.id}">${esc(p.title)}</button>`).join('')}</div></div>
      ${foot('onb-next', { disabled: S.scenes.size < 2, label: `Continue · ${S.scenes.size} picked` })}`;
  } else if (name === 'times') {
    const cards = [['morning', 'sun', 'Markets, runs, brunch'], ['afternoon', 'sunset', 'Workshops, parks, matinees'], ['evening', 'moon', 'Shows, dinners, talks'], ['late', 'spark', 'Late sets and parties']];
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('When do you like to <span class="hl">go</span> <span class="hl">out?</span>')}</h1><p class="sub st" style="--i:3">Pick any. Sixer leans your picks toward these times.</p>
      <div class="onb-scroll"><div class="verify">${cards.map(([k, ic, d], j) => `<button class="st ${S.times.has(k) ? 'on' : ''}" style="--i:${4 + j}" data-a="onb-time" data-v="${k}" aria-pressed="${S.times.has(k)}"><span class="icon-btn" style="background:${S.times.has(k) ? 'var(--accent)' : 'var(--surface-2)'};color:${S.times.has(k) ? 'var(--ink)' : 'var(--paper)'}">${icon(ic)}</span><div class="grow"><div style="font-weight:700;font-size:17px">${TIMES[k]}</div><div class="muted" style="font-size:13.5px">${d}</div></div>${S.times.has(k) ? `<span class="pill hot">${icon('check')}</span>` : ''}</button>`).join('')}</div>
        <p class="note st" style="--i:8;margin-top:14px">Most events are all ages. If one is 19+, we'll ask you then, not now.</p></div>
      ${foot('onb-next', { disabled: !S.times.size })}`;
  } else if (name === 'areas') {
    const pts = AREA_KEYS.map((a) => { const on = S.areas.has(a) || a === HOME; return `<circle cx="${AREAS[a][0]}" cy="${AREAS[a][1]}" r="${a === HOME ? 9 : on ? 7 : 3}" fill="${a === HOME ? C.paper : on ? C.accent : 'rgba(26,26,26,.25)'}"/>${on && a !== HOME ? `<circle cx="${AREAS[a][0]}" cy="${AREAS[a][1]}" r="7" fill="none" stroke="${C.accent}" stroke-width="1.5"><animate attributeName="r" from="7" to="20" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" from=".8" to="0" dur="1.8s" repeatCount="indefinite"/></circle>` : ''}`; }).join('');
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Where do you <span class="hl">go</span> <span class="hl">out?</span>')}</h1><p class="sub st" style="--i:3">Home is Ossington in this demo. Add the areas you'd happily travel to.</p>
      <div class="onb-scroll"><div class="area-map st" style="--i:4">${baseMapSvg(pts).replace(/viewBox="[^"]*"/, 'viewBox="20 90 340 250"')}</div>
        <div class="chips st" style="--i:5;padding:0;flex-wrap:wrap">${AREA_KEYS.filter((a) => a !== HOME).map((a) => `<button class="chip ${S.areas.has(a) ? 'on' : ''}" data-a="onb-area" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>
      ${foot('onb-next')}`;
  } else if (name === 'crew') {
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Bring your <span class="hl">crew.</span>')}</h1><p class="sub st" style="--i:2">Crew Blend finds the plan everyone will love. Friends see the group score, never your full taste profile.</p>
      <div class="onb-scroll">${FRIENDS.map((f, k) => `<div class="person-row st" style="--i:${3 + k}">${avatar(f)}<div class="grow"><div style="font-weight:700">${esc(PEOPLE[f].name)}</div><div class="muted" style="font-size:13px">In your contacts</div></div>${S.crewOn ? `<span class="pill hot">${icon('check')}Invited</span>` : ''}</div>`).join('')}</div>
      <div class="onb-foot st" style="--i:8">${S.crewOn ? `<button class="btn hot" data-a="onb-next">Build my 6ix Weekly</button>` : `<button class="btn ghost" data-a="onb-next">Skip for now</button><button class="btn solid" data-a="onb-crew">Connect friends</button>`}</div>`;
  } else if (name === 'build') {
    bg = glowBg();
    const picks = weekly().slice(0, 3).map((x) => x.e);
    body = `<div style="flex:1;display:grid;place-items:center"><div class="stack3">${picks.map((e) => poster(e.id + 'deal', e.scene, `<div style="position:absolute;left:14px;right:14px;bottom:14px"><div class="fit">${fitFor('me', e)}% your vibe</div><h3 style="font-size:22px;font-weight:800;line-height:1;margin-top:4px">${esc(e.title)}</h3></div>`, '', e.title.split(' ')[0], 70)).join('')}</div></div>
      <h1 class="words" style="font-size:38px">${words('Building your <span class="hl">6ix</span> <span class="hl">Weekly</span>')}</h1>
      <div class="build-steps" style="margin-top:20px" id="buildsteps">${['Reading your scenes', 'Mapping your areas', 'Checking what your crew likes', 'Picking this week\'s events'].map((s) => `<div>${icon('check')}${s}</div>`).join('')}</div>`;
  } else if (name === 'htype') {
    bg = glowBg();
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('What kind of <span class="hl">host</span> <span class="hl">are</span> <span class="hl">you?</span>')}</h1>
      <div class="verify" style="margin-top:22px">${HOST_TYPES.map(([k, t, d], j) => `<button class="st ${O.hostType === k ? 'on' : ''}" style="--i:${3 + j}" data-a="onb-htype" data-v="${k}"><div class="grow"><div style="font-weight:700;font-size:17px">${t}</div><div class="muted" style="font-size:13.5px">${d}</div></div>${O.hostType === k ? `<span class="pill hot">${icon('check')}</span>` : ''}</button>`).join('')}</div>
      <div style="flex:1"></div>${foot('onb-next')}`;
  } else if (name === 'verify') {
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Let\'s <span class="hl">verify</span> <span class="hl">you.</span>')}</h1><p class="sub st" style="--i:2">Verified hosts get a badge, and attendees know the listing is really yours.</p>
      <div class="verify" style="margin-top:22px">${VERIFY_OPTS.map(([k, t, d], j) => `<button class="st ${O.verified === k ? 'on' : ''}" style="--i:${3 + j}" data-a="onb-verify" data-v="${k}" ${O.verifying ? 'disabled' : ''}><div class="grow"><div style="font-weight:700">${t}</div><div class="muted" style="font-size:13px">${d}</div></div>${O.verifying === k ? '<span class="thinking"><i></i><i></i><i></i></span>' : O.verified === k ? `<span class="pill hot">${icon('check')}Verified</span>` : icon('arrow')}</button>`).join('')}</div>
      <div style="flex:1"></div>${foot('onb-next', { disabled: !O.verified })}`;
  } else if (name === 'hprofile') {
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Build your <span class="hl">host</span> <span class="hl">profile.</span>')}</h1>
      <div class="onb-scroll">
        <div class="eyebrow st" style="--i:2;margin-bottom:8px">Host name</div><input class="text-in st" style="--i:2" id="o-hostname" value="${esc(O.hostName)}" maxlength="40">
        <div class="eyebrow st" style="--i:3;margin:20px 0 8px">Your scenes</div><div class="chips st" style="--i:3;padding:0;flex-wrap:wrap">${SCENE_KEYS.map((s) => `<button class="chip ${O.hostScenes.has(s) ? 'on' : ''}" data-a="onb-hscene" data-v="${s}">${esc(SCENES[s].label)}</button>`).join('')}</div>
        <div class="eyebrow st" style="--i:4;margin:20px 0 8px">Areas you host in</div><div class="chips st" style="--i:4;padding:0;flex-wrap:wrap">${AREA_KEYS.map((a) => `<button class="chip ${O.hostAreas.has(a) ? 'on' : ''}" data-a="onb-harea" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div>
        <div class="eyebrow st" style="--i:5;margin:20px 0 8px">Usual age policy</div><div class="chips st" style="--i:5;padding:0;flex-wrap:wrap">${[['all', 'All ages'], ['19', '19+ (ID at the door)']].map(([k, l]) => `<button class="chip ${O.agePolicy === k ? 'on' : ''}" data-a="onb-age" data-v="${k}">${l}</button>`).join('')}</div>
        <p class="note st" style="--i:5;margin-top:8px">You can change it per event. Attendees are only asked their age for 19+ events.</p>
        <div class="eyebrow st" style="--i:5;margin:20px 0 8px">Default ticket link</div><input class="text-in st" style="--i:5" id="o-link" value="${esc(O.link)}" maxlength="80">
        <p class="note st" style="--i:5;margin-top:8px">Tickets stay on your own page. We never sell them.</p></div>
      ${foot('onb-next', { disabled: !O.hostScenes.size })}`;
  } else if (name === 'claim') {
    const found = EVENTS.filter((e) => e.host === 'loop');
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Are these <span class="hl">yours?</span>')}</h1><p class="sub st" style="--i:2">Sixer found ${found.length} public listings that match your name and venues. Claim them to manage them here.</p>
      <div class="onb-scroll">${found.map((e, j) => `<button class="claim st ${O.claims.has(e.id) ? 'on' : ''} ${O.just === e.id ? 'just' : ''}" style="--i:${3 + j}" data-a="onb-claim" data-v="${e.id}">${poster(e.id + 'c', e.scene)}<div class="grow"><div style="font-weight:700">${esc(e.title)}</div><div class="muted" style="font-size:13px">${esc(shortWhen(e.start))} · ${esc(e.venue)}</div></div><span class="tick">${O.claims.has(e.id) ? icon('check') : icon('plus')}</span></button>`).join('')}</div>
      ${foot('onb-next', { label: O.claims.size ? `Claim ${O.claims.size}` : 'Skip' })}`;
  } else if (name === 'hbuild') {
    bg = glowBg();
    body = `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:10px"><div class="eyebrow st" style="--i:0">Your demand map is ready</div><div class="count-up" id="countup">0</div><h2 class="st" style="--i:1;font-size:26px;line-height:1.1">people near Ossington want a <span class="hl">Sunday vinyl brunch.</span></h2></div>
      <div class="build-steps" id="buildsteps">${['Verifying ' + esc(O.hostName), 'Claiming your listings', 'Matching demand to your scenes', 'Drafting your first idea brief'].map((s) => `<div>${icon('check')}${s}</div>`).join('')}</div>`;
  }

  onbEl.className = 'onb' + (dir ? '' : ' static');
  onbEl.innerHTML = `${bg}<div class="onb-layer ${dir || ''}">${body}</div>`;
  const sc = onbEl.querySelector('.onb-scroll');
  if (sc && keep != null && !dir) sc.scrollTop = keep;
  O.just = null;
  if (name === 'welcome') bindSlide();
  if (name === 'build' || name === 'hbuild') runBuild(name);
}
let buildRun = 0;
function runBuild(name) {
  const run = ++buildRun;
  const steps = onbEl.querySelectorAll('#buildsteps div');
  const t0 = name === 'hbuild' ? 600 : 900;
  steps.forEach((el, k) => setTimeout(() => el.classList.add('on'), t0 + k * 450));
  if (name === 'hbuild') {
    const el = document.getElementById('countup'); const target = 340; const start = performance.now();
    const tick = (now) => { const k = Math.min(1, (now - start) / 1400); el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))); if (k < 1 && document.body.contains(el)) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }
  setTimeout(() => { if (run === buildRun && stepName() === name) (name === 'hbuild' ? finishHost() : finishAttendee()); }, t0 + steps.length * 450 + 700);
}
function bindSlide() {
  const el = document.getElementById('slide'); const knob = el.querySelector('.knob');
  let startX = null, dx = 0;
  const max = () => el.clientWidth - knob.clientWidth - 12;
  const go = () => { O.i = 1; renderOnb('fwd'); };
  el.addEventListener('pointerdown', (e) => { startX = e.clientX; el.setPointerCapture(e.pointerId); knob.style.transition = 'none'; });
  el.addEventListener('pointermove', (e) => { if (startX == null) return; dx = clamp(e.clientX - startX, 0, max()); knob.style.transform = `translateX(${dx}px)`; });
  const up = () => { if (startX == null) return go(); knob.style.transition = ''; if (dx > max() * 0.55 || dx < 6) { knob.style.transform = `translateX(${max()}px)`; setTimeout(go, 200); } else knob.style.transform = ''; startX = null; dx = 0; };
  el.addEventListener('pointerup', up);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
}
function onbNext() {
  const name = stepName();
  if (name === 'hprofile') { O.hostName = document.getElementById('o-hostname')?.value.trim() || 'Loop Collective'; O.link = document.getElementById('o-link')?.value.trim() || O.link; }
  if (O.i < FLOWS[O.flow].length - 1) { O.i++; renderOnb('fwd'); }
}
function onbBack() {
  if (O.i > 0) { O.i--; renderOnb('back'); return; }
  if (O.flow !== 'start') { O.flow = 'start'; O.i = 1; renderOnb('back'); }
}
function closeOnb() { onbEl.hidden = true; onbEl.innerHTML = ''; }
function finishAttendee() {
  if (onbEl.hidden) return;
  S.onboarded = true; store.set('onboarded', true); persist();
  closeOnb(); S.mode = 'attendee'; S.tab = 'discover'; S.stack = []; render();
  toast('Your 6ix Weekly is ready');
}
function finishHost() {
  if (onbEl.hidden) return;
  HOSTS.loop.name = O.hostName;
  HOSTS.loop.scenes = [...O.hostScenes];
  S.hostOnboarded = true; store.set('hostOnboarded', true); store.set('hostName', O.hostName); store.set('agePolicy', O.agePolicy);
  S.onboarded = true; store.set('onboarded', true); persist();
  closeOnb(); S.mode = 'host'; S.hostTab = 'demand'; S.stack = []; render();
  toast(`Welcome, ${O.hostName}`);
}
function onbAction(a, v) {
  switch (a) {
    case 'onb-role': O.flow = v; O.i = 0; renderOnb('fwd'); break;
    case 'onb-next': onbNext(); break;
    case 'onb-back': onbBack(); break;
    case 'onb-scene': S.scenes.has(v) ? S.scenes.delete(v) : S.scenes.add(v); O.just = v; renderOnb(); break;
    case 'onb-past': S.pastEvents.has(v) ? S.pastEvents.delete(v) : S.pastEvents.add(v); renderOnb(); break;
    case 'onb-area': S.areas.has(v) ? S.areas.delete(v) : S.areas.add(v); renderOnb(); break;
    case 'onb-crew': S.crewOn = true; renderOnb(); break;
    case 'onb-time': S.times.has(v) ? S.times.delete(v) : S.times.add(v); renderOnb(); break;
    case 'onb-age': O.agePolicy = v; O.hostName = document.getElementById('o-hostname')?.value || O.hostName; O.link = document.getElementById('o-link')?.value || O.link; renderOnb(); break;
    case 'onb-htype': O.hostType = v; renderOnb(); break;
    case 'onb-verify': O.verifying = v; renderOnb(); setTimeout(() => { O.verifying = false; O.verified = v; if (stepName() === 'verify') renderOnb(); }, 1100); break;
    case 'onb-hscene': O.hostScenes.has(v) ? O.hostScenes.delete(v) : O.hostScenes.add(v); O.hostName = document.getElementById('o-hostname')?.value || O.hostName; O.link = document.getElementById('o-link')?.value || O.link; renderOnb(); break;
    case 'onb-harea': O.hostAreas.has(v) ? O.hostAreas.delete(v) : O.hostAreas.add(v); O.hostName = document.getElementById('o-hostname')?.value || O.hostName; O.link = document.getElementById('o-link')?.value || O.link; renderOnb(); break;
    case 'onb-claim': O.claims.has(v) ? O.claims.delete(v) : O.claims.add(v); O.just = v; renderOnb(); break;
    default: return false;
  }
  return true;
}

// =========================================================================
// Actions
// =========================================================================
document.getElementById('app').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a, id = el.dataset.id, v = el.dataset.v;
  if (a === 'map-pin') return; // handled by the map gesture code
  if (a.startsWith('onb-')) { ev.stopPropagation(); onbAction(a, v); return; }
  ev.stopPropagation();
  switch (a) {
    case 'tab': S.stack = []; if (S.mode === 'host') S.hostTab = v; else { S.tab = v; S.sceneFilter = null; } render(); root.querySelector('.screen').scrollTop = 0; break;
    case 'back': pop(); break;
    case 'event': push('event', { id }); break;
    case 'mix': push('mix', { id: v }); break;
    case 'profile': push('profile'); break;
    case 'scene-filter': S.sceneFilter = v || null; S.mapSel = null; render(); break;
    case 'save': if (S.saved.has(id)) { S.saved.delete(id); toast('Removed from saved'); } else { S.saved.add(id); toast('Saved to your plans'); } persist(); render(); break;
    case 'follow': if (S.following.has(id)) S.following.delete(id); else { S.following.add(id); toast(`Following ${HOSTS[id].name}. You'll hear when they announce.`); } persist(); render(); break;
    case 'tickets': if (EV.get(id).age19 && S.age !== 'adult') push('agecheck', { id, next: 'tickets' }); else push('tickets', { id }); break;
    case 'age-yes': S.age = 'adult'; persist(); S.stack[S.stack.length - 1] = null; S.stack.pop(); if (v === 'plan') startPlan(id); else push('tickets', { id }); toast('Thanks. We won\'t ask again.'); break;
    case 'age-no': S.age = 'under'; persist(); S.stack.pop(); if (S.stack.at(-1)?.v === 'event' && S.stack.at(-1).id === id) S.stack.pop(); push('allages', { id }); break;
    case 'age-reset': S.age = null; persist(); render(); toast('Age cleared. We\'ll ask again only for 19+ events.'); break;
    case 'daypart': S.dayPart = v; render(); break;
    case 'time-toggle': S.times.has(v) ? S.times.delete(v) : S.times.add(v); persist(); render(); break;
    case 'got-tickets': S.tickets.add(id); S.saved.add(id); persist(); S.stack.pop(); render(); toast(EV.get(id).price ? 'Tickets added to your plans' : 'You\'re going'); break;
    case 'signal': sig.text = ''; push('signal'); break;
    case 'sig': { const inp = document.getElementById('sig-text'); if (inp) sig.text = inp.value.trim(); sig[el.dataset.k] = el.dataset.k === 'budget' ? Number(v) : v; render(); break; }
    case 'sig-send': {
      const inp = document.getElementById('sig-text'); if (inp) sig.text = inp.value.trim();
      const others = 60 + (hash(sig.scene + sig.area + sig.when) % 260);
      S.signals.push({ id: 'sig' + Date.now(), text: sig.text || SCENES[sig.scene].label, scene: sig.scene, area: sig.area, when: sig.when, budget: sig.budget, others, status: 'open' });
      persist(); S.stack.pop(); render(); toast(`Sent. You and ${others} others want this. We'll tell you if a host books it.`); break;
    }
    case 'crew-toggle': if (id === 'me') break; if (S.crewSel.has(id)) S.crewSel.delete(id); else S.crewSel.add(id); render(); break;
    case 'crew-connect': S.crewOn = !S.crewOn; persist(); render(); toast(S.crewOn ? 'Crew Blend is on' : 'Crew Blend is off'); break;
    case 'plan': startPlan(id); break;
    case 'hub': if (S.stack[S.stack.length - 1]?.v === 'tickets') S.stack.pop(); push('hub', { id }); break;
    case 'checkin': push('checkin', { id }); break;
    case 'checkin-done': S.checkins.add(id); persist(); S.stack[S.stack.length - 1] = { v: 'checkin', id, done: true }; render(); break;
    case 'recap': push('recap', { id }); break;
    case 'recap-star': recapDraft.rating = Number(v); saveRecapInputs(); render(); break;
    case 'recap-tag': recapDraft.tags.has(id) ? recapDraft.tags.delete(id) : recapDraft.tags.add(id); saveRecapInputs(); render(); break;
    case 'recap-save': saveRecap(); break;
    case 'night': push('night', { id }); break;
    case 'seg': S.nightsSeg = v; render(); break;
    case 'wrapped': push('wrapped', { i: 0 }); break;
    case 'wrapped-next': { const i = Number(el.dataset.i); if (i >= 3) pop(); else { S.stack[S.stack.length - 1].i = i + 1; render(); } break; }
    case 'taste': S.tasteAdj[id] = clamp((S.tasteAdj[id] || 0) + Number(v) * 0.1, -0.8, 0.8); persist(); render(); break;
    case 'replay': S.stack = []; openOnboarding(); break;
    case 'mode-host': S.stack = []; if (!S.hostOnboarded) { openOnboarding('host'); break; } S.mode = 'host'; S.hostTab = 'demand'; render(); toast(`Host mode: ${HOSTS.loop.name}`); break;
    case 'mode-attendee': S.mode = 'attendee'; S.stack = []; S.tab = 'discover'; render(); break;
    case 'map-zoom': zoomMap(v === 'in' ? 0.7 : 1.4, { ...mapView }); clampMap(); mountMap(); break;
    case 'map-home': Object.assign(mapView, { x: AREAS[HOME][0] - 110, y: AREAS[HOME][1] - 110, w: 220, h: 220 }); clampMap(); mountMap(); break;
    case 'sixer': openChat(); break;
    case 'ask-about': openChat(`Is ${EV.get(id).title} a good pick for me and my crew? Compare it with one alternative.`); break;
    case 'idea': push('idea', { id }); break;
    case 'post-draft': {
      const d = IDEAS.find((x) => x.id === id);
      if (!S.host.drafts[id]) S.host.drafts[id] = { age19: store.get('agePolicy', 'all') === '19', interest: Math.round(d.count * 0.18), threshold: Math.round(d.count * 0.55 / 10) * 10, price: Math.max(10, d.budget - 5), sims: 0, status: 'testing', venue: false, promoted: false };
      S.stack.pop(); push('draft', { id }); break;
    }
    case 'simulate': { const dr = S.host.drafts[id]; const d = IDEAS.find((x) => x.id === id); dr.sims++; dr.interest = Math.min(d.count, dr.interest + Math.round(d.count * (dr.tweaked ? 0.28 : 0.12))); render(); break; }
    case 'tweak': { const dr = S.host.drafts[id]; dr.tweaked = true; dr.price = Math.max(10, dr.price - 5); dr.interest = Math.round(dr.interest * 1.35); toast('Moved to Saturday, price lowered'); render(); break; }
    case 'hstep': hostStep(id, el.dataset.k); break;
    case 'hevent': push('hevent', { id }); break;
    case 'mod': { const m = S.host.moderators[id] || (S.host.moderators[id] = new Set(['Priya'])); m.has(v) ? m.delete(v) : m.add(v); render(); break; }
    case 'post-update': {
      const inp = document.getElementById('upd-' + id); const text = inp?.value.trim();
      if (!text) { toast('Write an update first'); break; }
      EV.get(id).updates.push({ t: timeStr(new Date()), text }); render(); toast('Posted to the event day hub'); break;
    }
  }
});
document.getElementById('app').addEventListener('change', (e) => {
  if (e.target.id === 'recap-photos') {
    for (const f of e.target.files) recapDraft.photos.push(URL.createObjectURL(f));
    saveRecapInputs(); render();
  }
});
function saveRecapInputs() { const n = document.getElementById('recap-note'); if (n && recapDraft) recapDraft.note = n.value; }
function saveRecap() {
  saveRecapInputs();
  const r = recapDraft;
  S.recaps[r.id] = { rating: r.rating, tags: [...r.tags], photos: r.photos, note: r.note, confirmed: [] };
  persist();
  const p = PAST.find((x) => x.id === r.id);
  S.stack[S.stack.length - 1] = { v: 'night', id: r.id }; render();
  toast(`Saved. Sixer learned: ${r.rating >= 4 ? 'more' : 'less'} ${SCENES[p.scene].label}.`);
  [...r.tags].forEach((t, i) => setTimeout(() => { S.recaps[r.id].confirmed.push(t); if (S.stack.at(-1)?.v === 'night') render(); if (i === 0) toast(`${PEOPLE[t].short} confirmed the tag`); }, 1500 + i * 1200));
}
function startPlan(id) {
  if (EV.get(id).age19 && S.age !== 'adult') { push('agecheck', { id, next: 'plan' }); return; }
  if (!S.crewOn) { toast('Turn on Crew Blend in your profile first'); return; }
  if (!S.plans[id]) {
    const members = ['me', ...FRIENDS.filter((f) => S.crewSel.has(f))];
    const b = blend(members).find((x) => x.e.id === id);
    S.plans[id] = { members, score: b ? b.score : 80, replies: { me: 'in' } };
    members.filter((m) => m !== 'me').forEach((m, i) => setTimeout(() => { S.plans[id].replies[m] = 'in'; if (S.stack.at(-1)?.v === 'plan') render(); if (i === members.length - 2) toast('Everyone\'s in. Plan locked.'); }, 1100 + i * 900));
  }
  push('plan', { id });
}
function hostStep(id, k) {
  const dr = S.host.drafts[id];
  const d = IDEAS.find((x) => x.id === id);
  if (k === 'venue') { dr.venue = true; toast('Marked as booked'); }
  else if (k === 'publish') {
    if (!dr.venue) { toast('Book the venue first'); return; }
    if (dr.status === 'testing') {
      dr.status = 'published';
      const evId = 'pub-' + id;
      const start = nextOn(6, 20);
      const e = { age19: !!dr.age19, id: evId, title: d.text.replace(/^./, (c) => c.toUpperCase()), scene: d.scene, scene2: null, area: d.area, venue: 'Loop Collective pop-up space', host: 'loop', price: dr.price, blurb: `Booked because ${d.count} people asked for it on The 6ix Sense.`, start, end: new Date(start.getTime() + 3 * 3600e3), going: dr.interest, isNew: true, demandBooked: true, rating: null, reviews: 0, updates: [], entrances: ['Main entrance'] };
      EVENTS.push(e); EV.set(evId, e); S.host.published.push(evId); dr.eventId = evId;
      toast('Published with your ticket link');
    }
  } else if (k === 'promote') { if (dr.status === 'testing') { toast('Publish first'); return; } dr.promoted = !dr.promoted; toast(dr.promoted ? 'Promoted, with a clear label' : 'Promotion off'); }
  else if (k === 'alert') {
    if (dr.status !== 'published') { toast(dr.status === 'alerted' ? 'Alerts already sent' : 'Publish first'); return; }
    dr.status = 'alerted'; toast(`"You asked, it's happening" sent to ${dr.interest} people`);
  }
  render();
}

// =========================================================================
// Sixer chat: an agent that can act in the app
// =========================================================================
const chatEl = document.getElementById('chat');
const ai = { sample: undefined, tools: false, turns: [], busy: false, ctl: null, steps: [], picks: [], live: '', error: null, openId: null };
(async () => {
  try { const s = await window.claude?.use?.('sample'); ai.sample = s || null; if (s) ai.tools = !!(await s.limits().catch(() => null))?.tools; } catch { ai.sample = null; }
  if (!chatEl.hidden) renderChat();
})();
function openChat(prefill) { chatEl.hidden = false; chatEl.className = 'chat enter'; renderChat(); if (prefill) send(prefill); else setTimeout(() => document.getElementById('chat-in')?.focus(), 200); }
function closeChat() { chatEl.hidden = true; if (ai.openId) { const id = ai.openId; ai.openId = null; push('event', { id }); } }

function compactEvent(e, members) {
  const out = { id: e.id, title: e.title, age: e.age19 ? '19+' : 'All ages', time_of_day: slotOf(e.start), scene: SCENES[e.scene].label + (e.scene2 ? ' + ' + SCENES[e.scene2].label : ''), when: whenLabel(e.start), area: e.area, distance_from_home: distStr(distFromHome(e)), price: money(e.price), host: HOSTS[e.host].name, rating: e.rating, your_fit: fitFor('me', e), friends_going: (FRIENDS_GOING[e.id] || []).map((f) => PEOPLE[f].short), saved: S.saved.has(e.id), booked_from_demand: e.demandBooked };
  if (members) { const b = blend(members).find((x) => x.e.id === e.id); out.crew_score = b.score; out.crew_fits = Object.fromEntries(b.fits.map((x) => [PEOPLE[x.m].short, x.f])); }
  return out;
}
function searchEvents({ text, scene, area, when, max_price, time_of_day, all_ages_only } = {}) {
  let list = upcoming();
  if (time_of_day && TIMES[time_of_day]) list = list.filter((e) => slotOf(e.start) === time_of_day);
  if (all_ages_only) list = list.filter((e) => !e.age19);
  const sc = scene && SCENE_KEYS.find((k) => k === scene || SCENES[k].label.toLowerCase().includes(String(scene).toLowerCase()));
  if (sc) list = list.filter((e) => e.scene === sc || e.scene2 === sc);
  if (area) list = list.filter((e) => e.area.toLowerCase().includes(String(area).toLowerCase()) || distFromHome(e) < 2 && /near|close|home/.test(String(area)));
  if (when === 'tonight' || when === 'today') list = list.filter((e) => dayDiff(e.start) === 0);
  else if (when === 'tomorrow') list = list.filter((e) => dayDiff(e.start) === 1);
  else if (when === 'weekend') list = list.filter((e) => [5, 6, 0].includes(e.start.getDay()) && dayDiff(e.start) < 7);
  if (max_price != null && max_price !== '') list = list.filter((e) => e.price <= Number(max_price));
  if (text) { const words = String(text).toLowerCase().split(/\s+/).filter((w) => w.length > 2); const hit = list.filter((e) => words.some((w) => `${e.title} ${e.blurb} ${SCENES[e.scene].label} ${e.area}`.toLowerCase().includes(w))); if (hit.length) list = hit; }
  const t = taste();
  return list.sort((a, b) => fitFor('me', b, t) - fitFor('me', a, t)).slice(0, 8);
}
function step(s) { ai.steps.push(s); renderChat(true); }
const TOOLS = [
  { name: 'search_events', description: 'Search upcoming Toronto events. Results are ranked by the user\'s personal fit and include id, time, area, distance from home, price, host, rating, fit %, and friends going.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, scene: { type: 'string', enum: SCENE_KEYS }, area: { type: 'string' }, when: { type: 'string', enum: ['tonight', 'tomorrow', 'weekend', 'week'] }, time_of_day: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'late'] }, all_ages_only: { type: 'boolean', description: 'Only events open to all ages, e.g. for families or under-19s' }, max_price: { type: 'number' } } },
    execute(i) { step(`Searching${i.scene ? ' ' + SCENES[i.scene]?.label : ''}${i.when ? ' · ' + i.when : ''}${i.text ? ' · "' + i.text + '"' : ''}`); return searchEvents(i).map((e) => compactEvent(e)); } },
  { name: 'crew_blend', description: 'Rank events for a friend group. Pass friend first names (from Maya, Kai, Leila, Sam, Jordan). Returns the top events with a group score and each person\'s fit.',
    inputSchema: { type: 'object', properties: { friends: { type: 'array', items: { type: 'string' } } }, required: ['friends'] },
    execute({ friends }) { const ids = (friends || []).map((n) => FRIENDS.find((f) => PEOPLE[f].short.toLowerCase() === String(n).toLowerCase())).filter(Boolean); const members = ['me', ...new Set(ids)]; step(`Blending taste for ${members.map((m) => PEOPLE[m].short).join(', ')}`); return blend(members).slice(0, 5).map((b) => compactEvent(b.e, members)); } },
  { name: 'show_picks', description: 'Show 1-3 events as cards under your reply so the user can tap them. Call this with your shortlist before answering.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
    execute({ ids }) { ai.picks = (ids || []).map(String).filter((x) => EV.has(x)).slice(0, 3); step('Lining up your picks'); return ai.picks.length ? 'ok' : 'none of those ids exist'; } },
  { name: 'open_event', description: 'Open one event\'s page when the chat closes. Use for a clear top recommendation.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute({ id }) { if (!EV.has(String(id))) throw new Error('Unknown id'); ai.openId = String(id); step(`Opening ${EV.get(String(id)).title} when you close this`); return 'ok'; } },
  { name: 'save_event', description: 'Save an event to the user\'s nights. Only when they ask. Easy to undo. You cannot buy tickets.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute({ id }) { if (!EV.has(String(id))) throw new Error('Unknown id'); S.saved.add(String(id)); persist(); step(`Saved ${EV.get(String(id)).title}`); return 'saved'; } },
  { name: 'send_id_go_if', description: 'Send an "I\'d go if…" demand signal to hosts, only when the user asks for something that doesn\'t exist yet and agrees to send it.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, scene: { type: 'string', enum: SCENE_KEYS }, area: { type: 'string', enum: AREA_KEYS }, when: { type: 'string' }, budget: { type: 'number' } }, required: ['text'] },
    execute(i) { const others = 60 + (hash(String(i.text)) % 260); S.signals.push({ id: 'sig' + Date.now(), text: String(i.text), scene: i.scene || 'live', area: i.area || HOME, when: i.when || 'Any night', budget: i.budget || 0, others, status: 'open' }); persist(); step('Sent "I\'d go if…" to hosts'); return { others_who_asked: others }; } },
];
function rules() {
  const t = taste();
  const top = SCENE_KEYS.slice().sort((a, b) => t[b] - t[a]).slice(0, 4).map((s) => SCENES[s].label).join(', ');
  return `You are Sixer, the AI guide inside The 6ix Sense, a Toronto events app. You help people pick something to do, day or night, solo, with friends or with family, and you always explain why.
Today: ${NOW.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${timeStr(NOW)}. The user lives in ${HOME}. Their top scenes: ${top}. Areas they go to: ${[...S.areas].join(', ')}.
Friends on the app: ${S.crewOn ? FRIENDS.map((f) => PEOPLE[f].short).join(', ') : 'not connected'}. Saved: ${[...S.saved].map((id) => EV.get(id)?.title).filter(Boolean).join(', ') || 'nothing'}.
${S.mode === 'host' ? 'They are currently in host mode as Priya from Loop Collective. Top demand: ' + IDEAS.map((d) => `${d.text} (${d.count} near ${d.area})`).join('; ') + '.' : ''}
How to work:
- Use search_events or crew_blend. Never invent events. Call show_picks with your 1-3 best before answering, and open_event for a clear winner.
- Explain picks the Sixer way: fit %, distance from home, timing, friends going, price. Recommend one.
- Under 80 words, warm and direct, Toronto voice without slang overload. Short lists start with "- ". Use exact event titles.
- You cannot buy tickets. Tickets are on the host's page.
- Most events are all ages. Events marked 19+ ask the user to confirm their age before tickets; never ask their age yourself. ${S.age === 'under' ? 'This user is under 19: only suggest all-ages events.' : ''}
- They usually like ${[...S.times].map((x) => TIMES[x].toLowerCase()).join(', ') || 'any time'}.`;
}
async function send(text) {
  if (ai.busy || !text.trim()) return;
  ai.turns.push({ role: 'user', content: text.trim() });
  ai.busy = true; ai.steps = []; ai.picks = []; ai.live = ''; ai.error = null;
  renderChat();
  if (!ai.sample) return localSixer(text);
  ai.ctl = new AbortController();
  const input = [{ role: 'user', content: rules() }, ...ai.turns.slice(-8).map(({ role, content }) => ({ role, content }))];
  try {
    let reply;
    if (ai.tools) {
      reply = (await ai.sample(input, { tools: TOOLS, modelTier: 'quick', signal: ai.ctl.signal, onText: ({ text: t }) => { ai.live = t; renderChat(true); } })).text;
    } else {
      const cands = searchEvents({}).map((e) => compactEvent(e));
      const res = await ai.sample.json([...input.slice(0, -1), { role: 'user', content: `${text}\n\nEvents (JSON): ${JSON.stringify(cands)}\n\nReply with only JSON: {"reply": string, "pick_ids": [up to 3 ids], "open_id": id or null}` }], { modelTier: 'quick', signal: ai.ctl.signal, cache: false });
      reply = String(res?.reply || ''); ai.picks = (res?.pick_ids || []).filter((x) => EV.has(x)).slice(0, 3); if (res?.open_id && EV.has(res.open_id)) ai.openId = res.open_id;
    }
    done(reply);
  } catch (e) {
    ai.busy = false;
    if (e?.code === 'cancelled') ai.turns.push({ role: 'assistant', content: e.text || 'Stopped.' });
    else if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable'].includes(e?.code)) { ai.sample = null; ai.turns.pop(); return send(text); }
    else { ai.error = e?.code === 'rate_limited' ? 'Too many questions at once. Give it a minute and try again.' : e?.code === 'session_expired' ? 'Your Claude session expired. Sign in again to keep chatting.' : e?.code === 'refused' ? 'I can\'t help with that one. Ask me about events.' : 'Couldn\'t reach Claude just now. Try again.'; if (e?.text) ai.turns.push({ role: 'assistant', content: e.text }); }
    renderChat();
  }
}
function done(reply) { ai.busy = false; ai.turns.push({ role: 'assistant', content: reply || 'Here are my picks.', picks: [...ai.picks] }); renderChat(); render(); }
function localSixer(text) {
  const q = text.toLowerCase();
  const tod = /morning/.test(q) ? 'morning' : /afternoon/.test(q) ? 'afternoon' : /late/.test(q) ? 'late' : undefined;
  const allAges = /famil|kid|child|all.ages|under 19|teen/.test(q);
  const when = /tonight|today/.test(q) ? 'tonight' : /tomorrow/.test(q) ? 'tomorrow' : /weekend|saturday|friday|sunday/.test(q) ? 'weekend' : undefined;
  const scene = SCENE_KEYS.find((s) => q.includes(s) || q.includes(SCENES[s].label.toLowerCase().split(' ')[0].toLowerCase()));
  const named = FRIENDS.filter((f) => q.includes(PEOPLE[f].short.toLowerCase()));
  const crew = named.length || /crew|friends|group/.test(q);
  const price = (q.match(/under \$?(\d+)/) || [])[1];
  let list;
  if (crew) { const members = ['me', ...(named.length ? named : FRIENDS.filter((f) => S.crewSel.has(f)))]; step(`Blending taste for ${members.map((m) => PEOPLE[m].short).join(', ')}`); list = blend(members).map((b) => b.e).filter((e) => !when || searchEvents({ when }).includes(e)).slice(0, 3); var membersUsed = members; }
  else {
    step('Searching events that fit you');
    list = searchEvents({ scene, when, max_price: price, time_of_day: tod, all_ages_only: allAges });
    if (!list.length && (tod || when)) list = searchEvents({ scene, when, all_ages_only: allAges });
    if (/near|close|walk/.test(q)) { const near = list.filter((e) => distFromHome(e) < 3); list = (near.length ? near : list).sort((a, b) => distFromHome(a) - distFromHome(b)); }
    list = list.slice(0, 3);
  }
  if (!list.length) list = searchEvents({}).slice(0, 3);
  ai.picks = list.map((e) => e.id); ai.openId = list[0]?.id || null;
  const top = list[0];
  const why = (e) => { const bits = [shortWhen(e.start), distStr(distFromHome(e)) + ' from home', money(e.price)]; const fg = FRIENDS_GOING[e.id] || []; if (fg.length) bits.push(fg.map((f) => PEOPLE[f].short).join(' + ') + ' going'); return bits.join(', '); };
  const scoreTxt = crew ? `${blend(membersUsed).find((b) => b.e.id === top.id).score}% for the crew` : `${fitFor('me', top)}% your vibe`;
  const reply = `My pick: **${top.title}** (${scoreTxt}; ${why(top)}).` + (list.length > 1 ? `\n\nAlso good:\n${list.slice(1).map((e) => `- ${e.title}: ${why(e)}`).join('\n')}` : '') + `\n\nClose this and I'll open ${top.title} for you.`;
  setTimeout(() => done(reply), 500);
}
function fmt(text) {
  const titles = [...EV.values()].sort((a, b) => b.title.length - a.title.length);
  const link = (h) => { for (const e of titles) { const t = esc(e.title); if (h.includes(t)) h = h.split(t).join(`\u0000${e.id}\u0001`); } return h.replace(/\u0000([\w-]+)\u0001/g, (_, id) => `<button class="evlink" data-chat-open="${id}">${esc(EV.get(id).title)}</button>`); };
  return esc(text).split(/\n{2,}/).map((b) => { const ls = b.split('\n'); if (ls.every((l) => /^\s*[-•*]\s+/.test(l))) return `<ul>${ls.map((l) => `<li>${link(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('')}</ul>`; return `<p>${link(b).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</p>`; }).join('');
}
function picksHtml(ids) { return ids?.length ? `<div class="picks">${ids.map((id) => { const e = EV.get(id); return `<button class="pick" data-chat-open="${id}">${poster(id + 'p', e.scene, `<div class="fit">${fitFor('me', e)}% your vibe</div><h3>${esc(e.title)}</h3><div class="muted" style="font-size:12px">${esc(shortWhen(e.start))} · ${esc(e.area)}</div>`, '', '', 0).replace('style="', 'style="height:100%;border-radius:20px;')}</button>`; }).join('')}</div>` : ''; }
function logHtml() {
  if (!ai.turns.length) {
    const sug = S.mode === 'host' ? ['What should I book next?', 'Which idea has the most crews asking?'] : ['Something chill today near me', 'A family-friendly Saturday morning', 'Plan Friday for me, Maya and Kai', 'I\'m new here and going solo. Where do I start?'];
    return `<div style="display:grid;gap:14px;padding-top:30px"><span class="orb" style="--s:84px"></span><h1 style="font-size:30px;line-height:1.05">Hey, I'm Sixer. What are you up for?</h1><p class="muted">I'll search what's on, blend your crew's taste and tell you exactly why I picked it.</p>
      ${ai.sample === null ? '<p class="note">Wireframe: Sixer answers with simple built-in logic. In the product this is the AI agent.</p>' : ''}
      <div class="suggest">${sug.map((s) => `<button class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
  }
  let h = ai.turns.map((t) => t.role === 'user' ? `<div class="msg me">${esc(t.content)}</div>` : `<div class="msg ai">${fmt(t.content)}${picksHtml(t.picks)}</div>`).join('');
  if (ai.busy) h += `<div class="msg ai">${ai.steps.length ? `<div class="tsteps">${ai.steps.map((s) => `<span>✓ ${esc(s)}</span>`).join('')}</div>` : ''}${ai.live ? fmt(ai.live) : '<span class="thinking" aria-label="Sixer is thinking"><i></i><i></i><i></i></span>'}</div>`;
  if (ai.error) h += `<p class="note" role="alert">${esc(ai.error)}</p>`;
  return h;
}
function renderChat(partial) {
  const log = chatEl.querySelector('.chat-log');
  if (partial && log) { log.innerHTML = logHtml(); log.scrollTop = log.scrollHeight; return; }
  chatEl.innerHTML = `<div class="chat-head"><span class="orb" style="--s:40px"></span><h2>Sixer</h2><button class="icon-btn glass" data-chat="close" aria-label="Close">${icon('x')}</button></div>
    <div class="chat-log">${logHtml()}</div>
    <form class="chat-form" id="chat-form"><input id="chat-in" autocomplete="off" placeholder="Ask Sixer anything" aria-label="Message Sixer" ${ai.busy ? 'disabled' : ''}>
      ${ai.busy ? `<button type="button" class="icon-btn solid" style="width:52px;height:52px;border-radius:26px" data-chat="stop" aria-label="Stop">${icon('stop')}</button>` : `<button class="icon-btn solid" style="width:52px;height:52px;border-radius:26px" aria-label="Send">${icon('send')}</button>`}</form>`;
  const l = chatEl.querySelector('.chat-log'); l.scrollTop = l.scrollHeight;
}
chatEl.addEventListener('click', (e) => {
  const s = e.target.closest('[data-suggest]'); if (s) return send(s.dataset.suggest);
  const o = e.target.closest('[data-chat-open]'); if (o) { ai.openId = o.dataset.chatOpen; if (S.mode === 'host') { S.mode = 'attendee'; } closeChat(); return; }
  const c = e.target.closest('[data-chat]')?.dataset.chat;
  if (c === 'close') closeChat(); else if (c === 'stop') ai.ctl?.abort();
});
chatEl.addEventListener('submit', (e) => { e.preventDefault(); const i = document.getElementById('chat-in'); const v = i.value; i.value = ''; send(v); });

// =========================================================================
// Boot
// =========================================================================
render();
if (!S.onboarded) openOnboarding();

// =========================================================================
// Navigation API used by the site map (js/sitemap.js)
// =========================================================================
function closeOverlays() { buildRun++; closeOnb(); chatEl.hidden = true; ai.openId = null; }
window.SixSense = {
  // Jump to a tab with a clean stack. mode: 'attendee' | 'host'.
  base(mode = 'attendee', tab = 'discover') {
    closeOverlays();
    S.mode = mode; S.stack = []; S.sceneFilter = null; S.dayPart = 'any'; S.nightsSeg = 'upcoming';
    if (mode === 'host') S.hostTab = tab; else S.tab = tab;
    render();
    root.querySelector('.screen').scrollTop = 0;
  },
  // Run any in-app action, exactly as if its button had been tapped.
  fire(a, attrs = {}) {
    const b = document.createElement('button');
    b.dataset.a = a; for (const [k, v] of Object.entries(attrs)) b.dataset[k] = v;
    b.hidden = true; document.getElementById('app').appendChild(b); b.click(); b.remove();
  },
  push(v, params = {}) { push(v, params); },
  onboarding(flow, i) { closeOverlays(); O.flow = flow; O.i = i; onbEl.hidden = false; renderOnb('fwd'); },
  chat() { closeOverlays(); openChat(); },
  set(k, v) { S[k] = v; persist(); },
  // Where the viewer is right now, so the site map can highlight it.
  where() {
    if (!onbEl.hidden) return { onb: O.flow + ':' + stepName() };
    if (!chatEl.hidden) return { chat: true };
    const top = S.stack[S.stack.length - 1];
    return { mode: S.mode, tab: S.mode === 'host' ? S.hostTab : S.tab, page: top ? top.v : null, id: top?.id, seg: S.nightsSeg, dayPart: S.dayPart, done: !!top?.done };
  },
  reset() { try { Object.keys(localStorage).filter((k) => k.startsWith('6ix-wireframe.')).forEach((k) => localStorage.removeItem(k)); } catch {} location.reload(); },
};
})();
