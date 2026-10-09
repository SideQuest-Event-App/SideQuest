// Sidequest wireframe · attendee app: tabs and pushed pages.
'use strict';
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
    ? [['demand', 'bulb', 'Demand'], ['quests', 'ticket', 'Your quests'], ['sixer'], ['insights', 'chart', 'Insights'], ['inbox', 'megaphone', 'Inbox']]
    : [['discover', 'home', 'Discover'], ['parties', 'crew', 'Parties'], ['sixer'], ['requests', 'bulb', 'Quest Requests'], ['log', 'ticket', 'Quest Log']];
  const cur = S.mode === 'host' ? S.hostTab : (S.tab === 'map' ? 'discover' : S.tab);
  nav.innerHTML = items.map(([k, ic, label]) => k === 'sixer'
    ? `<button data-a="sixer" aria-label="Ask Sixer"><span class="orb" style="--s:46px"></span></button>`
    : `<button class="${cur === k ? 'on' : ''}" data-a="tab" data-v="${k}" aria-label="${label}" aria-current="${cur === k ? 'page' : 'false'}">${icon(ic)}${k === 'log' && needsRecap() ? '<span class="badge"></span>' : ''}</button>`).join('');
}
const needsRecap = () => PAST.some((p) => !p.recap && !S.recaps[p.id]);
function push(v, params = {}) { S.stack.push({ v, ...params }); render(); }
function pop() { S.stack.pop(); render(); }

function tabHtml() {
  if (S.tab === 'map') return mapTab();
  if (S.tab === 'parties') return partiesTab();
  if (S.tab === 'requests') return requestsTab();
  if (S.tab === 'log') return logTab();
  return discoverTab();
}

// ---------------- Discover ----------------
function friendsLine(e) {
  const fg = FRIENDS_GOING[e.id] || [];
  return fg.length ? `<span class="faces">${fg.map(faceOf).join('')}</span>` : '';
}
function weeklyCard({ e, fit }) {
  const inner = `<div class="row" style="justify-content:space-between"><span class="row" style="gap:6px"><span class="pill glass">${icon('near')}${distStr(distFromHome(e))}</span>${e.age19 ? '<span class="pill hot">19+</span>' : ''}</span>
      <span class="icon-btn glass" data-a="save" data-id="${e.id}" role="button" aria-label="${S.saved.has(e.id) ? 'Remove bookmark' : 'Bookmark'}">${icon(S.saved.has(e.id) ? 'bookmarkFill' : 'bookmark')}</span></div>
    <div>${matchTag(fit)}<h3 style="margin-top:6px">${esc(e.title)}</h3>
      <div class="card-foot" style="margin-top:12px"><div class="grow muted" style="font-size:13.5px">${esc(shortWhen(e.start))} · ${esc(e.area)} · ${money(e.price)}</div>${friendsLine(e)}
      <span class="icon-btn solid">${icon('out')}</span></div></div>`;
  return `<button class="weekly" data-a="event" data-id="${e.id}" aria-label="${esc(e.title)}">${poster(e.id, e.scene, inner)}</button>`;
}
const viewToggle = (on) => `<div class="seg view-toggle" role="group" aria-label="View quests as"><button class="${on === 'list' ? 'on' : ''}" data-a="tab" data-v="discover" aria-pressed="${on === 'list'}">${icon('list')}List</button><button class="${on === 'map' ? 'on' : ''}" data-a="tab" data-v="map" aria-pressed="${on === 'map'}">${icon('map')}Map</button></div>`;
function filterRow() {
  const f = S.filters, n = filtersOn();
  const quick = [['price', 'u20', 'Under $20'], ['dist', 'walk', 'Walkable'], ['friends', true, 'Friends going']];
  return `<div class="chips" style="margin-top:14px" role="group" aria-label="Filters">
    <button class="chip ${n ? 'on' : ''}" data-a="filters">${icon('sliders')}Filters${n ? ` · ${n}` : ''}</button>
    ${[['any', 'Anytime', 'clock'], ['day', 'Daytime', 'sun'], ['evening', 'Evening', 'moon']].map(([k, l, ic]) => `<button class="chip ${S.dayPart === k ? 'on' : ''}" data-a="daypart" data-v="${k}" aria-pressed="${S.dayPart === k}">${icon(ic)}${l}</button>`).join('')}
    ${quick.map(([k, v, l]) => `<button class="chip ${f[k] === v ? 'on' : ''}" data-a="quick-filter" data-k="${k}" data-v="${v}" aria-pressed="${f[k] === v}">${l}</button>`).join('')}</div>`;
}
const unread = () => !S.notifSeen;
function discoverTab() {
  const wk = weekly();
  const t = taste();
  const happening = S.signals.find((s) => s.status === 'happening' && EV.get(s.eventId));
  const hEv = happening && EV.get(happening.eventId);
  const mixes = SCENE_KEYS.filter((s) => S.scenes.has(s)).slice(0, 5);
  const inWeekly = new Set(wk.slice(0, 4).map((x) => x.e.id));
  const near = upcoming().filter((e) => !inWeekly.has(e.id) && inDayPart(e) && passesFilters(e) && distFromHome(e) < 3 && (S.scenes.has(e.scene) || t[e.scene] > .5)).sort((a, b) => distFromHome(a) - distFromHome(b)).slice(0, 3);
  const empty = !wk.length && filtersOn();
  return `<div class="top-safe"></div>
    <div class="hello"><div class="grow"><div class="eyebrow">${esc(NOW.toLocaleDateString(undefined, { weekday: 'long' }))} · Toronto</div><h1 style="margin-top:8px">Your week,<br><span style="color:var(--accent)">picked.</span></h1></div>
      <button class="icon-btn ghost-btn" data-a="notifs" aria-label="Notifications${unread() ? ', new' : ''}">${icon('bell')}${unread() ? '<span class="dot"></span>' : ''}</button>
      <button data-a="profile" aria-label="Your profile">${avatar('me')}</button></div>
    ${viewToggle('list')}
    <button class="search" data-a="sixer"><span class="orb" style="--s:36px"></span><span class="q">Ask Sixer what to do today</span>${icon('arrow')}</button>
    ${filterRow()}
    ${hEv && !filtersOn() ? `<button class="asked" data-a="event" data-id="${hEv.id}">${poster(hEv.id + 'a', hEv.scene)}<div class="grow"><div class="eyebrow hot">You asked, it's happening</div><div style="font-weight:700;margin-top:2px">${esc(hEv.title)} · ${esc(shortWhen(hEv.start))}</div></div>${icon('arrow')}</button>` : ''}
    ${empty ? `<div class="empty-state"><h2>No quests match these filters.</h2><p class="muted">Loosen a filter, or ask hosts to put this on.</p><div class="row" style="gap:10px;flex-wrap:wrap"><button class="btn ghost sm" data-a="clear-filters">Clear filters</button><button class="btn solid sm" data-a="signal">Request one instead</button></div></div>` : `
    <div class="sec-head"><div><h2>Weekly Quests</h2><div class="muted" style="font-size:13px;margin-top:2px">Fresh every Monday</div></div><button data-a="mix" data-v="weekly">See all</button></div>
    <div class="hscroll">${wk.map(weeklyCard).join('') || '<p class="muted">Nothing in this time slot this week. Try Anytime.</p>'}</div>`}
    <div class="sec-head"><h2>Vibe Mixes</h2></div>
    <div class="hscroll">${mixes.map((s) => `<button class="mix" data-a="mix" data-v="${s}">${poster('mix' + s, s, `<h3>${esc(SCENES[s].label)}</h3>`)}<div class="sub">${upcoming().filter((e) => e.scene === s || e.scene2 === s).length} this week</div></button>`).join('')}</div>
    ${near.length ? `<div class="sec-head"><h2>Near you</h2><span class="muted" style="font-size:13px">around ${esc(HOME)}</span></div>${near.map((e) => listItem(e, t)).join('')}` : ''}
    <div class="idgo"><h2>Don't see it?<br>Request a quest.</h2><p>Tell hosts what you'd go to. Every account counts once, and when enough people ask, you hear first.</p><button class="btn" data-a="signal">Request a quest</button></div>`;
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
    <div class="li-side">${matchTag(fitFor('me', e, t || taste()), 'sm')}<div style="margin-top:6px">${friendsLine(e)}</div></div></button>`;
}

// Filters: the decision criteria the team listed (price, category, distance, friends, time, amenities).
function filtersPage() {
  const f = S.filters;
  const group = (label, key, opts) => `<div class="field"><div class="label">${label}</div><div class="chips">${opts.map(([v, l]) => `<button class="chip ${f[key] === v ? 'on' : ''}" data-a="filter-set" data-k="${key}" data-v="${v}" aria-pressed="${f[key] === v}">${l}</button>`).join('')}</div></div>`;
  const amen = [['access', 'Step-free access'], ['allages', 'All ages'], ['food', 'Food'], ['drinks', 'Drinks'], ['small', 'Small room']];
  const n = upcoming().filter((e) => dayDiff(e.start) < 7 && passesFilters(e)).length;
  return `<div class="page-head">${backBtn()}<h2>Filters</h2><button class="btn sm ghost" data-a="clear-filters">Clear</button></div>
    ${group('Category', 'vibe', [['', 'Any'], ...SCENE_KEYS.map((s) => [s, SCENES[s].label])])}
    ${group('Price', 'price', [['', 'Any price'], ['free', 'Free'], ['u20', 'Under $20']])}
    ${group('Distance from home', 'dist', [['', 'Anywhere'], ['walk', 'Walkable · 2 km'], ['ride', 'Short ride · 6 km']])}
    <div class="field"><div class="label">Who's going</div><div class="chips"><button class="chip ${!f.friends ? 'on' : ''}" data-a="filter-set" data-k="friends" data-v="">Anyone</button><button class="chip ${f.friends ? 'on' : ''}" data-a="filter-set" data-k="friends" data-v="true">Friends going</button></div></div>
    <div class="field"><div class="label">Starts after</div><div class="chips">${[['', 'Any time'], [12, '12 PM'], [17, '5 PM'], [20, '8 PM'], [22, '10 PM']].map(([v, l]) => `<button class="chip ${String(f.start || '') === String(v) ? 'on' : ''}" data-a="filter-set" data-k="start" data-v="${v}">${l}</button>`).join('')}</div><p class="note" style="margin-top:8px">Every quest shows its start and end time.</p></div>
    <div class="field"><div class="label">Amenities</div><div class="chips">${amen.map(([k, l]) => `<button class="chip ${f.amen.has(k) ? 'on' : ''}" data-a="filter-amen" data-v="${k}" aria-pressed="${f.amen.has(k)}">${l}</button>`).join('')}</div></div>
    <div class="pad" style="margin:28px 0 30px"><button class="btn solid block" data-a="back" ${n ? '' : 'aria-describedby="nomatch"'}>${n ? `Show ${n} quest${n === 1 ? '' : 's'}` : 'Show results'}</button>${n ? '' : '<p class="note" id="nomatch" style="margin-top:8px;text-align:center">Nothing matches yet. Discover will offer to request one.</p>'}</div>`;
}

// Notifications: event changes, friend invites, friend requests, request updates.
function notifsPage() {
  return `<div class="page-head">${backBtn()}<h2>Notifications</h2></div>
    <div style="padding:6px 0 30px">${NOTIFS.map((n) => {
      const action = n.k === 'friend'
        ? (S.friendReq ? `<span class="pill glass">${S.friendReq === 'yes' ? 'Connected' : 'Declined'}</span>` : `<span class="row" style="gap:6px"><button class="btn sm solid" data-a="friend-req" data-v="yes">Accept</button><button class="btn sm ghost" data-a="friend-req" data-v="no">Decline</button></span>`)
        : n.id ? icon('arrow') : '';
      return `<${n.id ? `button data-a="event" data-id="${n.id}"` : 'div'} class="notif">${n.person ? avatar(n.person) : `<span class="icon-btn n-ic">${icon(n.icon)}</span>`}<div class="grow"><div class="t">${esc(n.t)}</div><div class="m">${esc(n.d)}</div><div class="m">${esc(n.when)} ago</div></div>${action}</${n.id ? 'button' : 'div'}>`;
    }).join('')}</div>`;
}

// ---------------- Map ----------------
function mapTab() {
  return `<div class="map-wrap" id="mapwrap"></div>
    <div class="map-top">${viewToggle('map')}<button class="search" style="margin:0 20px" data-a="sixer">${icon('search')}<span class="q">What are you up for?</span></button>
      <div class="chips">${[['', 'Your vibes'], ...SCENE_KEYS.map((s) => [s, SCENES[s].label])].map(([k, l]) => `<button class="chip ${(S.sceneFilter || '') === k ? 'on' : ''}" data-a="scene-filter" data-v="${k}">${esc(l)}</button>`).join('')}</div></div>
    <div class="map-ctl"><button class="icon-btn glass-dark" data-a="map-zoom" data-v="in" aria-label="Zoom in">${icon('plus')}</button><button class="icon-btn glass-dark" data-a="map-zoom" data-v="out" aria-label="Zoom out">${icon('minus')}</button><button class="icon-btn glass-dark" data-a="map-home" aria-label="Center on home">${icon('loc')}</button></div>
    <div class="map-legend" aria-label="Match scale">${TIERS.map(([, n, l]) => `<span><i style="background:${TIER_TONE[n]}"></i>${l.replace(' match', '')}</span>`).join('')}</div>
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
  const t = taste();
  // Pins are toned by match tier, so the best fits read darkest at a glance.
  const pins = list.map((e) => { const [x, y] = evPos(e); const on = e.id === sel; const tone = TIER_TONE[tierOf(fitFor('me', e, t)).n]; return `<g data-a="map-pin" data-id="${e.id}" style="cursor:pointer" role="button" aria-label="${esc(e.title)}, ${matchWord(fitFor('me', e, t))}">
      <circle cx="${x}" cy="${y}" r="${(on ? 16 : 11) * k}" fill="${tone}" opacity=".18"/>
      <circle cx="${x}" cy="${y}" r="${(on ? 7.5 : 5.5) * k}" fill="${tone}" stroke="${on ? C.paper : C.ink}" stroke-width="${(on ? 2.2 : 1.4) * k}"/></g>`; }).join('');
  const homePin = `<rect x="${home[0] - 5 * k}" y="${home[1] - 5 * k}" width="${10 * k}" height="${10 * k}" fill="${C.ink}" stroke="${C.paper}" stroke-width="${2 * k}"/><text x="${home[0]}" y="${home[1] - 9 * k}" text-anchor="middle" font-size="${6.5 * k}" font-family="ui-monospace, monospace" fill="${C.paper}">HOME</text>`;
  wrap.innerHTML = baseMapSvg(homePin + pins);
  const cards = document.getElementById('mapcards');
  const ordered = sel ? [EV.get(sel), ...list.filter((e) => e.id !== sel)] : list.sort((a, b) => distFromHome(a) - distFromHome(b));
  cards.innerHTML = ordered.map((e) => `<button class="map-card" data-a="event" data-id="${e.id}">${poster(e.id + 'm', e.scene)}<div class="body"><div><span class="pill glass" style="height:26px;font-size:11.5px">${icon('near')}${distStr(distFromHome(e))}</span><h3 style="margin-top:8px">${esc(e.title)}</h3></div>
    <div class="muted" style="font-size:12.5px">${esc(shortWhen(e.start))} · ${esc(e.area)}<div style="margin-top:4px">${matchTag(fitFor('me', e, t))}</div></div></div></button>`).join('');
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

// ---------------- Parties + Crew Blend ----------------
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
  return `${fan ? `<b>${PEOPLE[fan.m].short}</b> is the biggest fan. ` : ''}It's a weaker match for <b>${PEOPLE[min.m].short}</b>${cheap ? ', but it\'s inside everyone\'s budget' : ''}.`;
}
const partyOf = (id) => PARTIES.find((p) => p.id === id) || PARTIES[0];
function themes(members) {
  const t = taste();
  return SCENE_KEYS.map((s) => [s, members.reduce((a, m) => a + (m === 'me' ? t[s] : PEOPLE[m].taste[s]), 0) / members.length]).sort((a, b) => b[1] - a[1]);
}
// A party is a general group page: who's in it and what the group is into. Crew Blend lives inside.
function partiesTab() {
  if (!S.crewOn) return `<div class="top-safe"></div><h1 class="big-title">Parties</h1><p class="lede">Assemble your party to plan quests together. Crew Blend merges everyone's taste. Friends only ever see the group's picks, never your full profile.</p><div class="pad" style="margin-top:20px"><button class="btn solid block" data-a="crew-connect">Connect friends</button></div>`;
  return `<div class="top-safe"></div><div class="eyebrow pad">Plan with friends</div><h1 class="big-title" style="padding-top:6px">Parties</h1>
    <p class="lede">Each party blends everyone's taste into shared themes and group picks.</p>
    <div style="margin-top:18px">${PARTIES.map((p) => `<button class="party-card" data-a="party" data-id="${p.id}">
      <div class="row"><span class="faces">${p.members.slice(0, 5).map(faceOf).join('')}${p.members.length > 5 ? `<span class="face more">+${p.members.length - 5}</span>` : ''}</span><span class="grow"></span>${icon('arrow')}</div>
      <h3>${esc(p.name)}</h3><div class="muted" style="font-size:13px">${p.members.length} people · into ${themes(p.members).slice(0, 3).map(([s]) => esc(SCENES[s].label)).join(', ')}</div>
      ${Object.keys(S.votes[p.id] || {}).length ? `<div class="pill glass" style="margin-top:10px">${icon('vote')}Vote open · ${Object.keys(S.votes[p.id]).length} picks nominated</div>` : ''}</button>`).join('')}
      <div class="pad"><button class="btn ghost block" data-a="new-party">${icon('plus')}New party</button></div></div>`;
}
function partyPage(id) {
  const p = partyOf(id);
  const members = p.members.filter((m) => S.crewSel.has(m) || m === 'me');
  const res = blend(members).slice(0, 3);
  const th = themes(members).slice(0, 5);
  const votes = S.votes[p.id] || (S.votes[p.id] = {});
  const opts = Object.entries(votes).map(([eid, who]) => ({ e: EV.get(eid), who })).filter((o) => o.e).sort((a, b) => b.who.length - a.who.length);
  const mine = opts.find((o) => o.who.includes('me'));
  const big = p.members.length > 5;
  const voteRow = (o) => `<div class="vote-row"><div class="grow"><div style="font-weight:700">${esc(o.e.title)}</div><div class="muted" style="font-size:12.5px">${esc(shortWhen(o.e.start))} · ${esc(o.e.area)}</div></div>
      <span class="faces" aria-label="Voted: ${esc(o.who.map((m) => PEOPLE[m].short).join(', ') || 'nobody yet')}">${o.who.map(faceOf).join('') || '<span class="muted" style="font-size:12px">No votes yet</span>'}</span>
      <button class="btn sm ${o.who.includes('me') ? 'solid' : 'ghost'}" data-a="vote" data-id="${o.e.id}" data-v="${p.id}" aria-pressed="${o.who.includes('me')}">${o.who.includes('me') ? 'Voted' : 'Vote'}</button></div>`;
  const podium = () => { const top = opts.slice(0, 3); const order = [top[1], top[0], top[2]].filter(Boolean); return `<div class="podium">${order.map((o) => { const place = top.indexOf(o) + 1; return `<div class="place p${place}"><span class="faces">${o.who.slice(0, 3).map(faceOf).join('')}${o.who.length > 3 ? `<span class="face more">+${o.who.length - 3}</span>` : ''}</span><div class="block"><b>${place}</b><span>${o.who.length} vote${o.who.length === 1 ? '' : 's'}</span></div><div class="pt">${esc(o.e.title)}</div></div>`; }).join('')}</div>`; };
  return `<div class="page-head">${backBtn()}<h2>${esc(p.name)}</h2><button class="icon-btn glass" data-a="toast" data-v="Party settings: rename, add people, leave" aria-label="Party settings">${icon('sliders')}</button></div>
    <div class="eyebrow pad" style="margin-top:6px">Who's in this time</div>
    <div class="crew-pick" style="margin-top:12px" role="group" aria-label="Who's coming">${p.members.map((m) => `<button class="${S.crewSel.has(m) || m === 'me' ? 'on' : ''}" data-a="crew-toggle" data-id="${m}" aria-pressed="${S.crewSel.has(m) || m === 'me'}">${avatar(m)}${esc(PEOPLE[m].short)}</button>`).join('')}</div>
    <div class="sec-head"><h2>Shared themes</h2><span class="muted" style="font-size:13px">from everyone's taste</span></div>
    <div class="chips" style="flex-wrap:wrap">${th.map(([s, v], i) => `<span class="chip theme w${Math.min(3, Math.floor(v * 4))}">${i === 0 ? icon('trophy') : ''}${esc(SCENES[s].label)}</span>`).join('')}</div>
    <div class="sec-head"><h2>Group picks</h2><span class="muted" style="font-size:13px">Crew Blend</span></div>
    ${members.length < 2 ? '<p class="lede">Pick at least one friend to blend.</p>' : res.map((b) => `<div class="blend-card">
      <button data-a="event" data-id="${b.e.id}" style="display:block;width:100%;text-align:left">${poster(b.e.id + 'b', b.e.scene, `<div class="row"><span class="pill glass">${esc(shortWhen(b.e.start))} · ${esc(b.e.area)}</span><span class="grow"></span><span class="pill glass">${money(b.e.price)}</span></div><h3>${esc(b.e.title)}</h3>`)}</button>
      <div class="blend-body"><div class="row">${matchTag(b.score, 'lg')}<div class="grow muted" style="font-size:13px">for the party</div></div>
        <div class="fits">${b.fits.map((x) => `<div class="fitrow"><span>${esc(PEOPLE[x.m].short)}</span><span class="bar"><i style="width:${x.f}%;--c:${x.m === 'me' ? C.paper : C.accent}"></i></span><span class="n">${matchWord(x.f).replace(' match', '')}</span></div>`).join('')}</div>
        <p class="explain">${explain(b)}</p>
        <div class="row" style="gap:10px"><button class="btn ghost" style="flex:1" data-a="nominate" data-id="${b.e.id}" data-v="${p.id}" ${votes[b.e.id] ? 'disabled' : ''}>${votes[b.e.id] ? 'In the vote' : 'Add to vote'}</button><button class="btn solid" style="flex:1" data-a="plan" data-id="${b.e.id}">Start group plan</button></div></div></div>`).join('')}
    <div class="sec-head"><h2>Where are we going?</h2><span class="muted" style="font-size:13px">${mine ? 'You voted' : 'Your vote is pending'}</span></div>
    ${big && opts.length >= 2 ? podium() : ''}
    <div class="pad votes">${opts.map(voteRow).join('') || '<p class="muted">Add a group pick to start the vote.</p>'}</div>
    ${big ? '<p class="note pad" style="margin-top:8px">Big parties see a podium of the top three, so ties stay readable.</p>' : ''}
    <div class="sec-head"><h2>Party chat</h2></div>
    <div class="pad party-chat">${(PARTY_CHAT[p.id] || []).map(([m, text]) => `<div class="cmsg">${faceOf(m)}<div class="bubble">${esc(text)}</div></div>`).join('')}
      <div class="row" style="margin-top:6px"><input class="text-in" placeholder="Message ${esc(p.name)}" aria-label="Message your party"><button class="icon-btn solid" data-a="toast" data-v="Sent to ${esc(p.name)}" aria-label="Send">${icon('send')}</button></div></div>
    <div style="height:40px"></div>`;
}

// ---------------- Quest Requests ----------------
const reqCount = (d) => d.count + (S.metoo.has(d.id) ? 1 : 0);
function reqStatus(d) {
  const st = REQ_STATUS[d.id];
  const planners = (PLANNING[d.id] || []).length + (S.host.claims.has(d.id) ? 1 : 0);
  if (st === 'live' || d.booked) return '<span class="pill hot">Live · see the quest</span>';
  if (planners) return `<span class="pill hot">${planners} host${planners > 1 ? 's' : ''} planning</span>`;
  if (st === 'heating') return '<span class="pill glass">Heating up</span>';
  return '<span class="pill glass">Open</span>';
}
function requestsTab() {
  return `<div class="top-safe"></div><div class="eyebrow pad">Tell hosts what you want</div><h1 class="big-title" style="padding-top:6px">Quest Requests</h1>
    <p class="lede">Back the quests you'd go to. Every account counts once, so hosts can trust the number.</p>
    <div class="pad" style="margin-top:16px"><button class="btn solid block" data-a="signal">${icon('plus')}Request a quest</button></div>
    <div class="sec-head"><h2>Trending near you</h2><span class="muted" style="font-size:13px">last 30 days</span></div>
    ${IDEAS.map((d) => `<div class="req-row"><button class="metoo ${S.metoo.has(d.id) ? 'on' : ''}" data-a="metoo" data-id="${d.id}" aria-pressed="${S.metoo.has(d.id)}" aria-label="Me too">${icon(S.metoo.has(d.id) ? 'check' : 'plus')}<b>${reqCount(d)}</b></button>
      <${d.booked ? `button data-a="event" data-id="${d.booked}"` : 'div'} class="grow req-body"><div class="t">${esc(d.text)}</div><div class="m">${esc(d.area)} · ${esc(d.when)} · under $${d.budget}</div><div style="margin-top:6px">${reqStatus(d)}</div></${d.booked ? 'button' : 'div'}></div>`).join('')}
    <div class="sec-head"><h2>Your requests</h2></div>
    ${S.signals.map((s) => `<div class="setting"><span class="icon-btn" style="background:var(--night-3)">${icon('bulb')}</span><div class="grow">${esc(s.text)}<span>${esc(s.area)} · ${esc(s.when)} · ${s.status === 'happening' ? 'Booked! ' + esc(EV.get(s.eventId)?.title || '') : `${s.others} accounts asked`}</span></div></div>`).join('')}`;
}

// ---------------- Quest Log ----------------
function calendarHtml(list) {
  const first = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  const days = new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0).getDate();
  const byDay = {};
  list.forEach((e) => { if (e.start.getMonth() === TODAY.getMonth()) (byDay[e.start.getDate()] = byDay[e.start.getDate()] || []).push(e); });
  const cells = Array.from({ length: first.getDay() }, () => '<span></span>').concat(Array.from({ length: days }, (_, i) => { const d = i + 1; const has = byDay[d]; return `<span class="${d === TODAY.getDate() ? 'today' : ''} ${has ? 'has' : ''}">${d}${has ? `<i>${has.length > 1 ? has.length : ''}</i>` : ''}</span>`; }));
  return `<div class="cal"><div class="cal-head">${esc(TODAY.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}</div><div class="cal-grid">${'SMTWTFS'.split('').map((d) => `<b>${d}</b>`).join('')}${cells.join('')}</div></div>`;
}
function logTab() {
  const up = upcoming().filter((e) => S.tickets.has(e.id) || S.plans[e.id]).sort((a, b) => a.start - b.start);
  const saved = upcoming().filter((e) => S.saved.has(e.id) && !S.tickets.has(e.id) && !S.plans[e.id]).sort((a, b) => a.start - b.start);
  const nightCard = (e) => {
    const tonight = dayDiff(e.start) === 0;
    const status = S.checkins.has(e.id) ? 'Checked in' : S.tickets.has(e.id) ? (S.wallet.has(e.id) ? 'Ticket in wallet' : 'Got tickets') : S.plans[e.id] ? 'Group plan' : 'Bookmarked';
    return `<button class="night-card" data-a="${S.tickets.has(e.id) ? 'hub' : 'event'}" data-id="${e.id}">${poster(e.id + 'n', e.scene, `<div class="row">${tonight ? '<span class="pill hot"><span class="live-dot" style="box-shadow:none;background:var(--ink)"></span>Tonight</span>' : `<span class="pill glass">${esc(shortWhen(e.start))}</span>`}<span class="grow"></span><span class="pill glass">${esc(status)}</span></div><h3>${esc(e.title)}</h3>`)}
      <div class="body"><div class="grow"><div style="font-weight:600">${esc(whenLabel(e.start))} – ${esc(timeStr(e.end))}</div><div class="muted" style="font-size:13px">${esc(e.venue)} · ${esc(e.area)}</div></div>${S.tickets.has(e.id) ? `<span class="btn sm solid">Event day</span>` : icon('arrow')}</div></button>`;
  };
  const pastHtml = PAST.map((p) => {
    const r = S.recaps[p.id] || p.recap;
    return `<button class="night-card" data-a="${r ? 'night' : 'recap'}" data-id="${p.id}">${poster(p.id, p.scene, `<div class="row"><span class="pill glass">${esc(p.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))}</span><span class="grow"></span>${r ? `<span class="pill glass">${'★'.repeat(r.rating)}</span>` : '<span class="pill hot">Rate this quest</span>'}</div><h3>${esc(p.title)}</h3>`)}
      <div class="body"><span class="faces">${p.crew.map(faceOf).join('')}</span><div class="grow muted" style="font-size:13px">${esc(p.area)} · ${esc(HOSTS[p.host].name)}</div>${icon('arrow')}</div></button>`;
  }).join('');
  const seg = S.nightsSeg;
  const list = seg === 'upcoming' ? up : saved;
  const body = seg === 'past'
    ? `<button class="night-card" data-a="wrapped" style="background:none">${poster('wrapped', 'dance', `<div class="eyebrow" style="color:var(--paper)">Sidequest Wrapped · preview</div><h3 style="font-size:30px">Your ${NOW.getFullYear()} so far</h3>`)}</button>${pastHtml}`
    : S.logView === 'calendar' && seg === 'upcoming'
      ? `${calendarHtml(up)}${up.map(nightCard).join('')}`
      : (list.map(nightCard).join('') || `<p class="lede">${seg === 'upcoming' ? 'No quests booked yet. Get tickets or start a group plan and they land here.' : 'Nothing bookmarked. Tap the bookmark on any quest to keep it here.'}</p>`);
  return `<div class="top-safe"></div><div class="hello"><h1 class="grow" style="font-size:38px">Quest Log</h1>
      <button class="icon-btn ghost-btn" data-a="wallet" aria-label="Ticket wallet">${icon('wallet')}</button>
      ${seg === 'upcoming' ? `<button class="icon-btn ghost-btn" data-a="log-view" aria-label="${S.logView === 'list' ? 'Calendar view' : 'List view'}">${icon(S.logView === 'list' ? 'cal' : 'list')}</button>` : ''}</div>
    <div class="seg" style="margin-top:18px"><button class="${seg === 'upcoming' ? 'on' : ''}" data-a="seg" data-v="upcoming">Upcoming</button><button class="${seg === 'saved' ? 'on' : ''}" data-a="seg" data-v="saved">Bookmarked</button><button class="${seg === 'past' ? 'on' : ''}" data-a="seg" data-v="past">Past quests</button></div>
    <div style="margin-top:18px">${body}</div>`;
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
    case 'room': return roomPage(EV.get(p.id));
    case 'checkin': return checkinPage(EV.get(p.id), p.done);
    case 'recap': return recapPage(p.id);
    case 'night': return nightPage(p.id);
    case 'wrapped': return wrappedPage(p.i || 0);
    case 'profile': return profilePage();
    case 'accounts': return accountsPage();
    case 'tickets': return ticketsPage(EV.get(p.id));
    case 'import': return importPage(EV.get(p.id));
    case 'wallet': return walletPage();
    case 'agecheck': return ageCheckPage(p);
    case 'allages': return allAgesPage(p.id);
    case 'filters': return filtersPage();
    case 'notifs': return notifsPage();
    case 'party': return partyPage(p.id);
    case 'idea': return ideaPage(p.id);
    case 'draft': return draftPage(p.id);
    case 'create': return createPage(p);
    case 'dayinfo': return dayInfoPage(p);
    case 'hevent': return hostEventPage(EV.get(p.id));
    case 'hrecap': return hostRecapPage(p.id);
    case 'published': return publishedPage(p.id);
    case 'hprofile': return hostProfilePage();
    default: return '';
  }
}
const backBtn = (extra = '') => `<button class="icon-btn glass" data-a="back" aria-label="Back">${icon('back')}</button>${extra}`;

// Quest detail. Team notes: start + end time, ratings by host / venue / quest, how to get there,
// payments accepted, who's going (friends and special guests), bookmark + share at the top.
function eventPage(e) {
  const fit = fitFor('me', e);
  const h = HOSTS[e.host];
  const fg = FRIENDS_GOING[e.id] || [];
  const plan = S.plans[e.id];
  const rt = ratingsOf(e);
  const pay = payments(e);
  const d = distFromHome(e);
  const heroInner = `<div class="row">${backBtn()}<span class="grow"></span><button class="icon-btn glass" data-a="share" data-id="${e.id}" aria-label="Share">${icon('share')}</button><button class="icon-btn glass" data-a="save" data-id="${e.id}" aria-label="${S.saved.has(e.id) ? 'Remove bookmark' : 'Bookmark'}">${icon(S.saved.has(e.id) ? 'bookmarkFill' : 'bookmark')}</button></div>
    <div><div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap"><span class="pill glass">${icon('near')}${distStr(d)} from home</span>${e.age19 ? '<span class="pill hot">19+</span>' : '<span class="pill glass">All ages</span>'}${e.demandBooked ? '<span class="pill hot">Made from a Quest Request</span>' : ''}</div>
      <h1>${esc(e.title)}</h1><div class="row" style="margin-top:10px;font-size:14px" ><span class="muted">${icon('pin')}</span><span class="muted grow">${esc(e.venue)}, ${esc(e.area)}</span></div></div>`;
  return `${poster(e.id, e.scene, heroInner, 'hero')}
    <div class="detail">
      <div class="why">${matchTag(fit, 'lg stack')}<div><div style="font-weight:700;margin-bottom:4px">Why Sixer picked this</div><p>${reasons(e).join(' · ')}</p></div></div>
      <div class="facts">
        <div class="fact">${icon('clock')}<span><b>${esc(whenLabel(e.start))} – ${esc(timeStr(e.end))}</b></span></div>
        <div class="fact">${icon('cash')}<span class="grow"><b>${money(e.price)}</b> · tickets on ${esc(TICKETING[e.host] || 'the host\'s page')}</span><span class="pay">${pay.map((k) => `<span class="pay-ic" title="${PAY_LABEL[k]}">${icon(k === 'free' ? 'check' : k)}<small>${PAY_LABEL[k]}</small></span>`).join('')}</span></div>
        <div class="fact">${icon('id')}<span>${e.age19 ? `<b>19+</b> · ID checked at the door${S.age === 'adult' ? '. You confirmed your age.' : '. We\'ll ask once before tickets.'}` : '<b>All ages</b> · families and under-19s welcome'}</span></div>
        <div class="fact">${icon('host')}<span class="grow">Hosted by <b>${esc(h.name)}</b></span><button class="btn sm ${S.following.has(e.host) ? 'ghost' : 'solid'}" data-a="follow" data-id="${e.host}">${S.following.has(e.host) ? 'Following' : 'Follow'}</button></div>
      </div>
      <div class="ratings"><div><b>★ ${rt.host}</b><span>Host</span></div><div><b>★ ${rt.venue}</b><span>Venue</span></div><div><b>${rt.quest ? '★ ' + rt.quest : 'New'}</b><span>${rt.recurring ? 'This quest · recurring' : 'First edition'}</span></div></div>
      <div><div class="eyebrow" style="margin-bottom:10px">Who's going</div>
        <div class="row">${fg.length ? `<span class="faces">${fg.map(faceOf).join('')}</span>` : ''}<span class="muted grow" style="font-size:14px"><b style="color:var(--paper)">${e.going}</b> going${fg.length ? ` · including ${esc(fg.map((f) => PEOPLE[f].short).join(', '))}` : ''}</span></div>
        ${GUESTS[e.id] ? `<div class="guest">${icon('star')}<span>${esc(GUESTS[e.id])}</span></div>` : ''}</div>
      <p class="muted" style="font-size:15.5px">${esc(e.blurb)}</p>
      <div class="chips" style="padding:0;flex-wrap:wrap">${amenities(e).map((a) => `<span class="chip static">${a.startsWith('Step') ? icon('access') : ''}${esc(a)}</span>`).join('')}</div>
      <div class="hub-block" style="margin:0"><div class="row">${icon('train')}<h3 class="grow">How to get here</h3><span class="muted" style="font-size:13px">${distStr(d)}</span></div>
        <div class="route"><span>${icon('train')}</span><p>${esc(routeTo(e))}</p></div>
        <div class="route"><span>${icon('bike')}</span><p>Bike Share dock ${d < 3 ? '2 min' : '4 min'} walk from the door</p></div>
        <div class="route"><span>${icon('car')}</span><p>${e.area === 'Downtown' || e.area === 'Kensington' ? 'Street parking is tight. Green P lot 6 min away.' : 'Street parking nearby. Green P lot 4 min away.'}</p></div></div>
      ${S.crewOn ? `<div class="why"><div class="grow"><div style="font-weight:700">Going with your party?</div><p>${plan ? `Group plan started · ${Object.values(plan.replies).filter((x) => x === 'in').length} of ${plan.members.length} in` : `Crew Blend: ${matchWord(blend(['me', ...FRIENDS.filter((f) => S.crewSel.has(f))]).find((b) => b.e.id === e.id)?.score ?? 60).toLowerCase()} for Friday Crew.`}</p></div><button class="btn sm solid" data-a="plan" data-id="${e.id}">${plan ? 'Open plan' : 'Plan it'}</button></div>` : ''}
      ${e.updates.length ? `<div class="why"><div class="grow"><div class="row" style="gap:8px;font-weight:700"><span class="live-dot"></span>Live from the host</div><p style="margin-top:6px">${esc(e.updates[e.updates.length - 1].text)}</p></div></div>` : ''}
    </div>
    <div class="sticky-cta">${S.tickets.has(e.id) ? `<button class="btn solid" data-a="hub" data-id="${e.id}">Open event day</button>` : `<button class="btn solid" data-a="tickets" data-id="${e.id}">${e.price ? `Get tickets on ${esc(TICKETING[e.host] || 'host page')} ${icon('out')}` : 'Accept quest · RSVP'}</button>`}<button class="icon-btn glass" style="width:52px;height:52px;border-radius:26px" data-a="ask-about" data-id="${e.id}" aria-label="Ask Sixer about this">${icon('spark')}</button></div>`;
}
function routeTo(e) {
  const d = distFromHome(e);
  return e.area === 'Ossington' ? '505 Dundas streetcar west, 3 stops, then 4 min walk' : d < 3 ? `${Math.round(d / 4.8 * 60)} min walk from home` : `Line 2 or the 501 Queen streetcar · about ${Math.round(d * 3 + 8)} min`;
}
function ticketsPage(e) {
  const where = TICKETING[e.host] || 'the host\'s page';
  return `<div class="page-head">${backBtn()}<h2>Tickets</h2></div>
    <div class="pad" style="display:grid;gap:16px;margin-top:10px">${poster(e.id, e.scene, '', 'tall')}
      <h1 style="font-size:30px">${esc(e.title)}</h1>
      <p class="muted">${e.price ? `Tickets are ${money(e.price)} on ${esc(where)}, ${esc(HOSTS[e.host].name)}'s ticketing. We don't sell tickets, so our picks stay neutral.` : 'This one is free. RSVP so your party and Sixer know you\'re going.'}</p>
      <div class="why"><div class="grow"><div style="font-weight:700">${esc(where)}</div><p class="mono" style="margin-top:4px">${esc(where.toLowerCase().replace(/[^a-z]/g, '') || 'tickets')}.example/${esc(e.id)}</p></div>${icon('out')}</div>
      <p class="note">In this demo the ticket page is a placeholder. Once you've bought, tap the button below and add the ticket to your wallet.</p>
      <button class="btn solid block" data-a="got-tickets" data-id="${e.id}">${e.price ? 'I have my ticket' : 'I\'m going'}</button>
    </div>`;
}
// After "I have my ticket", the ticket comes into the app so it can be scanned at the door.
function importPage(e) {
  const opts = [['qr', 'Scan the ticket QR', 'Point your camera at the code in your email.'], ['upload', 'Upload a PDF or screenshot', 'We read the barcode and the date.'], ['link', 'Connect DICE or Ticketmaster', 'New tickets come in on their own.']];
  return `<div class="page-head">${backBtn()}<h2>Import ticket</h2></div>
    <h1 class="big-title" style="font-size:32px">Add your ticket to your wallet</h1>
    <p class="lede">Keep it next to the event day info, so you're not digging through email at the door.</p>
    <div class="pad verify" style="margin-top:18px">${opts.map(([k, t, d]) => `<button data-a="import-ticket" data-id="${e.id}" data-v="${k}"><span class="icon-btn" style="background:var(--surface-2)">${icon(k)}</span><div class="grow"><div style="font-weight:700">${t}</div><div class="muted" style="font-size:13px">${d}</div></div>${icon('arrow')}</button>`).join('')}</div>
    <p class="note pad" style="margin-top:12px">Eventbrite doesn't let other apps import tickets. For Eventbrite events, upload a screenshot.</p>
    <div class="pad" style="margin:18px 0 30px"><button class="btn ghost block" data-a="back">Not now</button></div>`;
}
function walletPage() {
  const list = upcoming().filter((e) => S.tickets.has(e.id)).sort((a, b) => a.start - b.start);
  return `<div class="page-head">${backBtn()}<h2>Ticket wallet</h2></div>
    <p class="lede" style="padding-top:0">Every quest you've got a ticket for, ready to scan.</p>
    <div style="margin-top:16px;padding-bottom:30px">${list.map((e) => `<div class="ticket">
      <div class="row"><div class="grow"><div class="eyebrow">${esc(shortWhen(e.start))} · ${esc(timeStr(e.start))}</div><h3 style="margin-top:4px">${esc(e.title)}</h3><div class="muted" style="font-size:13px">${esc(e.venue)} · ${esc(TICKETING[e.host] || '')}</div></div></div>
      ${S.wallet.has(e.id) ? `<div class="qr sm">${qrSvg('tk' + e.id)}</div><p class="note" style="text-align:center">Show this at the door. Brightness up.</p>` : `<button class="btn ghost block" data-a="import" data-id="${e.id}">${icon('upload')}Import this ticket</button>`}</div>`).join('') || '<p class="lede">No tickets yet.</p>'}</div>`;
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
      <p class="note" style="text-align:center">We only ask for events that require it. Everything else on Sidequest is open to all ages.</p>
    </div>`;
}
function allAgesPage(id) {
  const e = EV.get(id);
  const t = taste();
  const alts = upcoming().filter((x) => x.scene === e.scene || x.scene2 === e.scene || x.scene === e.scene2).sort((a, b) => fitFor('me', b, t) - fitFor('me', a, t)).slice(0, 4);
  const more = alts.length < 3 ? upcoming().filter((x) => !alts.includes(x)).sort((a, b) => fitFor('me', b, t) - fitFor('me', a, t)).slice(0, 4 - alts.length) : [];
  return `<div class="page-head">${backBtn()}<h2></h2></div>
    <h1 class="big-title">All-ages picks for you</h1>
    <p class="lede">That one's 19+, so here are quests like it that everyone can go to. We'll keep your picks all-ages from now on. You can change this in your profile.</p>
    <div style="margin-top:14px">${[...alts, ...more].map((x) => listItem(x, t)).join('')}</div>`;
}
function mixPage(id) {
  const t = taste();
  const list = id === 'weekly' ? weekly().map((x) => x.e) : upcoming().filter((e) => e.scene === id || e.scene2 === id).sort((a, b) => fitFor('me', b, t) - fitFor('me', a, t));
  const title = id === 'weekly' ? 'Weekly Quests' : SCENES[id].label + ' Mix';
  return `${poster('mixh' + id, id === 'weekly' ? 'dance' : id, `<div class="row">${backBtn()}</div><div><div class="eyebrow" style="color:var(--paper)">${id === 'weekly' ? 'Refreshed every Monday' : 'Vibe Mix · rotates daily'}</div><h1 style="font-size:40px;margin-top:6px">${esc(title)}</h1><div class="muted" style="margin-top:6px">${list.length} quests picked for you</div></div>`, 'hero mid')}
    <div style="padding:14px 0">${list.map((e) => listItem(e, t)).join('')}</div>`;
}

// Request a quest. Team note: no "who's coming" question. Each account pre-registers on its own,
// so hosts trust the count; friends add their own "Me too".
const sig = { scene: 'food', area: 'Ossington', when: 'Friday late', budget: 25, text: '' };
function signalPage() {
  const whenOpts = ['Weeknight', 'Friday late', 'Saturday', 'Sunday daytime'];
  const budgets = [15, 25, 40, 0];
  const others = 60 + (hash(sig.scene + sig.area + sig.when) % 260);
  const similar = IDEAS.filter((d) => d.scene === sig.scene || d.area === sig.area).slice(0, 2);
  return `<div class="page-head">${backBtn()}<h2>Request a quest</h2></div>
    <div class="idea-line">I'd go to <em>${esc(sig.text || SCENES[sig.scene].label.toLowerCase())}</em>, <em>${esc(sig.when.toLowerCase())}</em>, near <em>${esc(sig.area)}</em>, ${sig.budget ? `under <em>$${sig.budget}</em>` : 'at <em>any price</em>'}.</div>
    <div class="field"><div class="label">What</div><input class="text-in" id="sig-text" placeholder="e.g. vinyl brunch, ramen pop-up" value="${esc(sig.text)}" maxlength="60" aria-label="What would you go to"></div>
    <div class="field"><div class="label">Vibe</div><div class="chips">${SCENE_KEYS.map((s) => `<button class="chip ${sig.scene === s ? 'on' : ''}" data-a="sig" data-k="scene" data-v="${s}">${esc(SCENES[s].label)}</button>`).join('')}</div></div>
    <div class="field"><div class="label">When</div><div class="chips">${whenOpts.map((w) => `<button class="chip ${sig.when === w ? 'on' : ''}" data-a="sig" data-k="when" data-v="${w}">${w}</button>`).join('')}</div></div>
    <div class="field"><div class="label">Where</div><div class="chips">${AREA_KEYS.map((a) => `<button class="chip ${sig.area === a ? 'on' : ''}" data-a="sig" data-k="area" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>
    <div class="field"><div class="label">Budget</div><div class="chips">${budgets.map((b) => `<button class="chip ${sig.budget === b ? 'on' : ''}" data-a="sig" data-k="budget" data-v="${b}">${b ? 'Under $' + b : 'Any'}</button>`).join('')}</div></div>
    ${similar.length ? `<div class="field"><div class="label">Already asked · back one instead</div>${similar.map((d) => `<div class="req-row" style="padding:8px 0"><button class="metoo ${S.metoo.has(d.id) ? 'on' : ''}" data-a="metoo" data-id="${d.id}" aria-pressed="${S.metoo.has(d.id)}" aria-label="Me too">${icon(S.metoo.has(d.id) ? 'check' : 'plus')}<b>${reqCount(d)}</b></button><div class="grow"><div class="t">${esc(d.text)}</div><div class="m">${esc(d.area)} · ${esc(d.when)}</div></div></div>`).join('')}</div>` : ''}
    <div class="field" style="margin:26px 0 30px"><p class="muted" style="margin-bottom:12px">${others} accounts near ${esc(sig.area)} want something similar. Hosts see the total, never your name. Bringing friends? They tap "Me too" from their own account.</p><button class="btn solid block" data-a="sig-send">Post request</button></div>`;
}

// Group plan
function planPage(id) {
  const e = EV.get(id);
  const plan = S.plans[id];
  const inCount = Object.values(plan.replies).filter((x) => x === 'in').length;
  const all = inCount === plan.members.length;
  return `${poster(e.id + 'plan', e.scene, `<div class="row">${backBtn()}</div><div><div class="eyebrow" style="color:var(--paper)">Group plan</div><h1 style="font-size:36px;margin-top:6px">${esc(e.title)}</h1><div class="muted" style="margin-top:6px">${esc(whenLabel(e.start))} – ${esc(timeStr(e.end))} · ${esc(e.area)}</div></div>`, 'hero mid')}
    <div class="detail">
      <div class="row">${matchTag(plan.score, 'lg')}<div class="grow muted">for the party · ${inCount} of ${plan.members.length} in</div></div>
      <div style="display:grid;gap:4px">${plan.members.map((m) => `<div class="row" style="padding:8px 0">${avatar(m)}<div class="grow"><div style="font-weight:600">${esc(PEOPLE[m].name)}</div><div class="muted" style="font-size:13px">${m === 'me' ? 'You started this plan' : plan.replies[m] === 'in' ? 'Accepted the quest' : 'Pending'}</div></div>
        ${plan.replies[m] === 'in' ? `<span class="pill hot">${icon('check')}In</span>` : '<span class="thinking"><i></i><i></i><i></i></span>'}</div>`).join('')}</div>
      ${all ? `<div class="why"><div class="grow"><div style="font-weight:700">Quest accepted</div><p>Everyone's in. It's in each person's Quest Log, and every check-in at the door counts as a matched attendance.</p></div></div>
        <button class="btn solid block" data-a="${S.tickets.has(id) ? 'hub' : 'tickets'}" data-id="${id}">${S.tickets.has(id) ? 'Open event day' : 'Get tickets'}</button>` : '<p class="note">Your party gets a notification. Replies show up here as they come in.</p>'}
    </div>`;
}

// Event day. Team notes: details in one box, not separate button-like boxes; floor plan comes from the host.
function hubPage(e) {
  const mins = Math.round((e.start - NOW) / 60000);
  const startsIn = mins > 0 ? (mins >= 60 ? `Starts in ${Math.floor(mins / 60)}h ${mins % 60}m` : `Starts in ${mins} min`) : 'Happening now';
  const d = distFromHome(e);
  const crew = (FRIENDS_GOING[e.id] || []).concat(S.plans[e.id] ? S.plans[e.id].members.filter((m) => m !== 'me') : []).filter((v, i, a) => a.indexOf(v) === i);
  return `${poster(e.id + 'hub', e.scene, `<div class="row">${backBtn()}<span class="grow"></span><span class="pill glass"><span class="live-dot"></span>Event day</span></div><div><h1 style="font-size:34px">${esc(e.title)}</h1><div class="muted" style="margin-top:6px">${esc(startsIn)} · ends ${esc(timeStr(e.end))} · ${esc(e.venue)}</div></div>`, 'hero mid')}
    <div style="padding:18px 0 8px">
      <div class="hub-block one-box">
        <section><div class="row">${icon('train')}<h3 class="grow">Getting there</h3><span class="muted" style="font-size:13px">${distStr(d)}</span></div><p class="muted">${esc(routeTo(e))}. Bike Share and rideshare open in your maps app.</p><p class="muted">Getting home: last streetcar 1:48 AM, Blue Night 305 after.</p></section>
        <section><div class="row">${icon('door')}<h3>Entrances</h3></div>${e.entrances.map((x) => `<div class="muted">· ${esc(x)}</div>`).join('')}</section>
        <section><div class="row">${icon('map')}<h3 class="grow">Floor plan</h3><span class="muted" style="font-size:12px">from the host</span></div><div class="floor">${['Stage', 'Bar', 'Coats', 'Entrance'].map((z) => `<span class="z-${z.toLowerCase()}">${z}</span>`).join('')}</div></section>
        <section><div class="row"><span class="live-dot"></span><h3>Live updates</h3></div>${e.updates.length ? [...e.updates].reverse().map((u) => `<div class="update"><span class="t">${esc(u.t)}</span><span>${esc(u.text)}</span></div>`).join('') : '<p class="muted">The host hasn\'t posted yet.</p>'}</section>
      </div>
      <button class="hub-block chat-entry" data-a="room" data-id="${e.id}"><div class="row">${icon('bubble')}<h3 class="grow">Attendee chat</h3>${crew.length ? `<span class="faces">${crew.map(faceOf).join('')}</span>` : ''}${icon('arrow')}</div><p class="muted">${crew.length ? `${esc(crew.map((c) => PEOPLE[c].short).join(', '))} ${crew.length > 1 ? 'are' : 'is'} going. ` : ''}Pinned host info, threads for set times and rides home. Moderated by the host.</p></button>
    </div>
    <div class="sticky-cta">${S.checkins.has(e.id) ? `<button class="btn ghost" style="flex:1" disabled>${icon('check')} Checked in</button>` : `<button class="btn solid" data-a="checkin" data-id="${e.id}">${icon('qr')} Check in at the door</button>`}${S.wallet.has(e.id) ? `<button class="icon-btn glass" style="width:52px;height:52px;border-radius:26px" data-a="wallet" aria-label="Show ticket">${icon('wallet')}</button>` : ''}</div>`;
}
// Attendee chat. Team notes: host-pinned posts and threads (like Discord), profile icons instead of names.
const ROOM = {
  general: [['host', 'Doors 30 minutes before start. Use the laneway door; the front is the bar.', true], ['kai', 'Grabbing a spot near the speakers'], ['noor', 'Is there coat check?'], ['host', 'Yes, $3 cash or tap, by the bar.'], ['theo', 'First time here, anyone else solo?'], ['ari', 'Me! Front left']],
  times: [['host', '6:30 doors · 7:00 side A · 7:25 side B · 8:00 Q&A · 8:30 DJ', true]],
  rides: [['maya', 'Splitting a ride west after, 2 seats'], ['sam', 'Streetcar crew meeting at 9 by the door']],
  lost: [['host', 'Found: a green scarf near the bar. Ask at coats.', true]],
};
function roomPage(e) {
  const threads = [['general', 'General'], ['times', 'Set times'], ['rides', 'Rides home'], ['lost', 'Lost & found']];
  const msgs = ROOM[S.room] || [];
  const pinned = ROOM.general.find((m) => m[2]);
  return `<div class="page-head">${backBtn()}<h2>${esc(e.title)}</h2><span class="pill glass">${e.going} going</span></div>
    <div class="pinned">${icon('pinned')}<div class="grow"><div class="eyebrow">Pinned by the host</div><p>${esc(pinned[1])}</p></div></div>
    <div class="chips" style="margin-top:12px" role="tablist" aria-label="Threads">${threads.map(([k, l]) => `<button class="chip ${S.room === k ? 'on' : ''}" role="tab" aria-selected="${S.room === k}" data-a="room-thread" data-v="${k}">${icon('thread')}${l}</button>`).join('')}</div>
    <div class="room">${msgs.map(([who, text, pin]) => who === 'host'
      ? `<div class="cmsg host"><span class="face host-face" title="${esc(HOSTS[e.host].name)}">${icon('host')}</span><div class="bubble">${pin ? `<span class="pin-tag">${icon('pinned')}Pinned</span>` : ''}${esc(text)}</div></div>`
      : `<div class="cmsg ${who === 'me' ? 'mine' : ''}">${faceOf(who)}<div class="bubble">${esc(text)}</div></div>`).join('')}</div>
    <div class="chat-form"><input placeholder="Message #${esc(threads.find((t) => t[0] === S.room)[1].toLowerCase())}" aria-label="Message attendees"><button class="icon-btn solid" style="width:52px;height:52px;border-radius:26px" data-a="toast" data-v="Posted to the thread" aria-label="Send">${icon('send')}</button></div>
    <p class="note pad" style="padding-bottom:20px">Long-press a message to report it. The host and their moderators can pin, hide or mute.</p>`;
}
function checkinPage(e, done) {
  if (done) {
    return `<div class="page-head">${backBtn()}<h2></h2></div><div class="pad" style="text-align:center;display:grid;gap:18px;margin-top:40px">
      <div class="big-check">${icon('check')}</div><h1 style="font-size:34px">You're in.</h1>
      <p class="muted">Checked in at ${esc(e.venue)}. That's a matched attendance: Sixer picked it and you showed up. It counts toward your Sidequest Wrapped.</p>
      <p class="note">Tomorrow we'll ask you to rate the quest.</p><button class="btn solid block" data-a="back">Back to event day</button></div>`;
  }
  return `<div class="page-head">${backBtn()}<h2>Check in</h2></div>
    <div class="scanner">${poster(e.id + 'scan', e.scene, '', 'fill')}<div class="frame"></div></div>
    <p class="lede" style="text-align:center;margin:0 auto">Point your camera at the door QR. In this demo the camera is off, so use the button.</p>
    <div class="pad" style="display:grid;gap:10px;margin-top:20px"><button class="btn solid block" data-a="checkin-done" data-id="${e.id}">${icon('qr')} Simulate scan</button><button class="btn ghost block" data-a="checkin-done" data-id="${e.id}">${icon('pin')} Check in by location</button></div>`;
}

// Rate your quest. Team notes: rate by category (like Google Maps), plain-English save button.
let recapDraft = null;
const CATS = ['Host', 'Ambience', 'Venue', 'Accessibility', 'Vibes'];
function recapPage(id) {
  const p = PAST.find((x) => x.id === id);
  if (!recapDraft || recapDraft.id !== id) recapDraft = { id, rating: 0, cats: {}, tags: new Set(p.crew), photos: [], note: '' };
  const r = recapDraft;
  const people = [...p.crew, ...p.met];
  return `${poster(p.id, p.scene, `<div class="row">${backBtn()}</div><div><div class="eyebrow" style="color:var(--paper)">Rate your quest</div><h1 style="font-size:34px;margin-top:6px">How was ${esc(p.title)}?</h1></div>`, 'hero mid')}
    <div class="detail">
      <div><div class="eyebrow" style="margin-bottom:10px;text-align:center">Overall</div><div class="stars" role="group" aria-label="Overall rating">${[1, 2, 3, 4, 5].map((n) => `<button class="${r.rating >= n ? 'on' : ''}" data-a="recap-star" data-v="${n}" aria-label="${n} stars">★</button>`).join('')}</div></div>
      <div class="cat-rates"><div class="eyebrow" style="margin-bottom:6px">Rate the details · optional</div>${CATS.map((c) => `<div class="cat-row"><span>${c}</span><span class="mini-stars" role="group" aria-label="${c} rating">${[1, 2, 3, 4, 5].map((n) => `<button class="${(r.cats[c] || 0) >= n ? 'on' : ''}" data-a="recap-cat" data-id="${c}" data-v="${n}" aria-label="${c} ${n} stars">★</button>`).join('')}</span></div>`).join('')}</div>
      <div><div class="eyebrow" style="margin-bottom:10px">Who were you with?</div><div class="chips" style="padding:0;flex-wrap:wrap">${people.map((id2) => `<button class="chip ${r.tags.has(id2) ? 'on' : ''}" data-a="recap-tag" data-id="${id2}">${faceOf(id2)}${esc(PEOPLE[id2].name)}${p.met.includes(id2) ? ' <span class="muted-2" style="font-weight:500">· met there</span>' : ''}</button>`).join('')}</div>
        <p class="note" style="margin-top:8px">Tagged people get a request. Nothing is shared until they accept.</p></div>
      <div><div class="eyebrow" style="margin-bottom:10px">Photos</div><div class="photos">${r.photos.map((u) => `<div class="ph" style="background-image:url('${u}')"></div>`).join('')}<label class="ph" style="cursor:pointer">${icon('camera')}<input type="file" id="recap-photos" accept="image/*" multiple hidden></label></div></div>
      <textarea id="recap-note" class="text-in" style="height:90px;padding:14px 20px;border-radius:22px;resize:none" placeholder="Anything to remember? (optional)">${esc(r.note)}</textarea>
      <button class="btn solid block" data-a="recap-save" ${r.rating ? '' : 'disabled'}>Save to past quests</button>
    </div>`;
}
function nightPage(id) {
  const p = PAST.find((x) => x.id === id);
  const r = S.recaps[id] || p.recap;
  return `${poster(p.id, p.scene, `<div class="row">${backBtn()}</div><div><div class="eyebrow" style="color:var(--paper)">${esc(p.date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</div><h1 style="font-size:34px;margin-top:6px">${esc(p.title)}</h1><div style="margin-top:8px;color:var(--gold)">${'★'.repeat(r.rating)}</div></div>`, 'hero mid')}
    <div class="detail"><div class="facts"><div class="fact">${icon('pin')}<span><b>${esc(p.area)}</b> · ${esc(HOSTS[p.host].name)}</span></div></div>
      ${r.cats && Object.keys(r.cats).length ? `<div class="ratings">${Object.entries(r.cats).map(([c, v]) => `<div><b>★ ${v}</b><span>${esc(c)}</span></div>`).join('')}</div>` : ''}
      ${r.photos?.length ? `<div class="photos">${r.photos.map((u) => `<div class="ph" style="background-image:url('${u}')"></div>`).join('')}</div>` : ''}
      ${r.note ? `<p style="font-size:17px">"${esc(r.note)}"</p>` : ''}
      <div><div class="eyebrow" style="margin-bottom:10px">People</div>${[...r.tags].map((t) => `<div class="row" style="padding:6px 0">${avatar(t)}<div class="grow" style="font-weight:600">${esc(PEOPLE[t].name)}</div><span class="muted" style="font-size:13px">${(r.confirmed || []).includes(t) ? 'Confirmed' : 'Pending'}</span></div>`).join('')}</div>
      <p class="note">Saved to your past quests. Sixer used it to update your taste.</p></div>`;
}

// Sidequest Wrapped
function wrappedPage(i) {
  const t = taste();
  const topS = SCENE_KEYS.slice().sort((a, b) => t[b] - t[a]).slice(0, 3);
  const nights = 31 + S.checkins.size + Object.keys(S.recaps).length;
  const slides = [
    { scene: 'dance', eyebrow: `Sidequest Wrapped ${NOW.getFullYear()} · so far`, big: String(nights), h: 'quests completed in Toronto', p: 'Half with your party, half solo. Weekend mornings are your new thing.' },
    { scene: topS[0], eyebrow: 'Your top vibe', big: '', h: SCENES[topS[0]].label, p: `Then ${SCENES[topS[1]].label} and ${SCENES[topS[2]].label}. You're in the top 8% of ${SCENES[topS[0]].label.toLowerCase()} fans in Toronto.` },
    { scene: 'markets', eyebrow: 'Your neighbourhood', big: '', h: 'Kensington', p: '11 quests within 600 m of Augusta Ave. Ossington is a close second.' },
    { scene: 'live', eyebrow: 'Party MVP', big: '', h: 'Maya', p: 'Maya was there for 14 of your quests. You also met 9 new people who confirmed the tag.' },
  ];
  const s = slides[clamp(i, 0, slides.length - 1)];
  return `<div class="wrapped" data-a="wrapped-next" data-i="${i}">${poster('wr' + i, s.scene, `<div><div class="bars-top">${slides.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div><div class="row" style="margin-top:14px"><span class="eyebrow grow" style="color:var(--paper)">${esc(s.eyebrow)}</span><button class="icon-btn glass" data-a="back" aria-label="Close">${icon('x')}</button></div></div>
    <div>${s.big ? `<div class="huge">${esc(s.big)}</div>` : ''}<h2 style="${s.big ? '' : 'font-size:64px;line-height:.9'}">${esc(s.h)}</h2><p style="margin-top:14px;font-size:17px;max-width:30ch;color:var(--paper)">${esc(s.p)}</p></div>
    <div class="note" style="color:var(--dim)">${i < slides.length - 1 ? 'Tap for next' : 'Your full Wrapped arrives in December. Share it when it lands.'}</div>`)}</div>`;
}

// Profile. Team notes: edit button so taste isn't changed by accident; profile data; quick account switch.
function profilePage() {
  const t = taste();
  const ed = S.editProfile;
  const pastN = PAST.length;
  return `<div class="page-head">${backBtn()}<h2>Profile</h2><button class="btn sm ${ed ? 'solid' : 'ghost'}" data-a="edit-profile">${ed ? 'Done' : `${icon('edit')}Edit`}</button></div>
    <div class="profile-head pad"><div class="ph-photo">${ed ? icon('camera') : 'A'}</div><div class="grow"><h1 style="font-size:26px">Alex</h1><div class="muted mono" style="font-size:13px">@${esc(S.username)}</div><div class="muted" style="font-size:13px;margin-top:4px">${pastN} past quests · following ${S.following.size} host${S.following.size === 1 ? '' : 's'}</div></div></div>
    ${ed ? `<div class="pad" style="display:grid;gap:10px;margin-top:14px">${[['Name', 'Alex'], ['Username', '@' + S.username], ['Email', 'alex@email.com'], ['Phone', '+1 416 555 0134']].map(([l, v]) => `<label class="lab-in"><span>${l}</span><input class="text-in" value="${esc(v)}"></label>`).join('')}</div>` : ''}
    <div class="sec-head"><div><h2 style="font-size:18px">What Sixer knows</h2><div class="muted" style="font-size:13px;margin-top:2px">${ed ? 'Adjust any vibe with − and +.' : 'Tap Edit to change your vibes.'}</div></div></div>
    <div>${SCENE_KEYS.slice().sort((a, b) => t[b] - t[a]).map((s) => `<div class="taste-row ${ed ? '' : 'ro'}"><span style="font-weight:600">${esc(SCENES[s].label)}</span><span class="bar"><i style="width:${Math.round(t[s] * 100)}%;--c:${sceneColor(s)}"></i></span>
      ${ed ? `<span class="ctl"><button data-a="taste" data-id="${s}" data-v="-1" aria-label="Less ${esc(SCENES[s].label)}">${icon('minus')}</button><button data-a="taste" data-id="${s}" data-v="1" aria-label="More ${esc(SCENES[s].label)}">${icon('plus')}</button></span>` : '<span></span>'}</div>`).join('')}</div>
    <div class="sec-head"><h2 style="font-size:18px">When you go out</h2></div><div class="chips" style="flex-wrap:wrap">${Object.entries(TIMES).map(([k, l]) => `<button class="chip ${S.times.has(k) ? 'on' : ''}" ${ed ? `data-a="time-toggle" data-v="${k}"` : 'disabled'}>${esc(l)}</button>`).join('')}${[['weekday', 'Weekdays'], ['weekend', 'Weekends']].map(([k, l]) => `<button class="chip ${S.days.has(k) ? 'on' : ''}" ${ed ? `data-a="day-toggle" data-v="${k}"` : 'disabled'}>${l}</button>`).join('')}</div>
    <div class="sec-head"><h2 style="font-size:18px">Areas you frequent</h2></div><div class="chips" style="flex-wrap:wrap">${[HOME, ...S.areas].map((a, i) => `<span class="chip ${i === 0 ? 'on' : ''}">${i === 0 ? 'Home · ' : ''}${esc(a)}</span>`).join('')}</div>
    <div class="sec-head"><h2 style="font-size:18px">Your Quest Requests</h2></div>
    ${S.signals.map((s) => `<div class="setting"><span class="icon-btn" style="background:var(--night-3)">${icon('bulb')}</span><div class="grow">${esc(s.text)}<span>${esc(s.area)} · ${esc(s.when)} · ${s.status === 'happening' ? 'Booked! ' + esc(EV.get(s.eventId)?.title || '') : `${s.others} accounts asked`}</span></div></div>`).join('')}
    <div class="sec-head"><h2 style="font-size:18px">Settings</h2></div>
    <button class="setting" data-a="accounts">${icon('swap')}<div class="grow">Switch to host account<span>${S.hostOnboarded ? esc(HOSTS.loop.name) + ' · one tap, like switching Instagram accounts' : 'Add a host account'}</span></div>${icon('arrow')}</button>
    <button class="setting" data-a="crew-connect">${icon('crew')}<div class="grow">Friends and Crew Blend<span>${S.crewOn ? 'On. Friends see group picks only.' : 'Off'}</span></div><span class="switch ${S.crewOn ? 'on' : ''}"></span></button>
    <button class="setting" data-a="age-reset" ${S.age ? '' : 'disabled'}>${icon('id')}<div class="grow">Age for 19+ quests<span>${S.age === 'adult' ? '19+ confirmed. Tap to clear.' : S.age === 'under' ? 'Under 19: showing all-ages quests only. Tap to clear.' : 'Not asked. We only ask when a quest is 19+.'}</span></div></button>
    <button class="setting" data-a="replay">${icon('refresh')}<div class="grow">Replay onboarding<span>Start fresh with new vibes and areas</span></div>${icon('arrow')}</button>
    <div style="height:40px"></div>`;
}
function accountsPage() {
  const rows = [['me', 'Alex', '@' + S.username + ' · personal', S.mode === 'attendee', 'mode-attendee'], ...(S.hostOnboarded ? [['host', HOSTS.loop.name, 'Host account · verified', S.mode === 'host', 'mode-host']] : [])];
  return `<div class="page-head">${backBtn()}<h2>Switch account</h2></div>
    <p class="lede" style="padding-top:0">One login, two accounts. Switch any time, like on Instagram.</p>
    <div class="pad verify" style="margin-top:16px">${rows.map(([k, n, d, on, a]) => `<button class="${on ? 'on' : ''}" data-a="${a}">${k === 'me' ? avatar('me') : `<span class="avatar">${icon('host')}</span>`}<div class="grow"><div style="font-weight:700">${esc(n)}</div><div class="muted" style="font-size:13px">${esc(d)}</div></div>${on ? `<span class="pill hot">${icon('check')}</span>` : icon('arrow')}</button>`).join('')}
      ${S.hostOnboarded ? '' : `<button data-a="mode-host"><span class="avatar">${icon('plus')}</span><div class="grow"><div style="font-weight:700">Add a host account</div><div class="muted" style="font-size:13px">Venue, promoter, collective or independent host</div></div>${icon('arrow')}</button>`}</div>`;
}
