// Sidequest wireframe · host app.
'use strict';
// =========================================================================
// Host mode: Demand · Your quests · Sixer · Insights · Inbox
// =========================================================================
function hostTab() {
  if (S.hostTab === 'quests') return hostQuestsTab();
  if (S.hostTab === 'insights') return hostInsightsTab();
  if (S.hostTab === 'inbox') return hostInboxTab();
  return hostDemandTab();
}
const hostAvatar = () => `<button class="avatar host-av" data-a="hprofile" aria-label="Host profile">${icon('host')}</button>`;

// Demand map. The "when" strip adds the Figma heatmap of the days people want to go out.
function hostDemandTab() {
  const heat = IDEAS.map((d) => { const [x, y] = AREAS[d.area]; const r = 14 + d.count / 14; return `<circle cx="${x}" cy="${y}" r="${r}" fill="${sceneColor(d.scene)}" opacity=".32"/><circle cx="${x}" cy="${y}" r="${r * .45}" fill="${C.accent}"/><text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="${C.ink}" font-family="DM Mono, monospace">${d.count}</text>`; }).join('');
  const week = [['M', 1], ['T', 1], ['W', 2], ['T', 3], ['F', 5], ['S', 6], ['S', 4]];
  return `<div class="top-safe"></div><div class="hello"><div class="grow"><div class="eyebrow">${esc(HOSTS.loop.name)} · host</div><h1 style="margin-top:8px;font-size:38px">What Toronto wants</h1></div>${hostAvatar()}</div>
    <p class="lede">Live Quest Requests from real, active accounts. Plan what's wanted, then test it with a draft.</p>
    <div class="demand-map" style="margin-top:18px">${baseMapSvg(heat).replace(`viewBox="${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}"`, 'viewBox="20 90 340 250"')}</div>
    <div class="week-heat pad"><div class="eyebrow">When people want to go out</div><div class="wh">${week.map(([d, v]) => `<div><i style="opacity:${.12 + v * .14}"></i><span>${d}</span></div>`).join('')}</div></div>
    <div class="sec-head"><h2>Top requests</h2><span class="muted" style="font-size:13px">last 30 days</span></div>
    ${IDEAS.map((d) => { const planners = (PLANNING[d.id] || []).length + (S.host.claims.has(d.id) ? 1 : 0); const badge = d.booked ? '<span class="pill hot">Booked</span>' : S.host.drafts[d.id] ? `<span class="pill ${S.host.drafts[d.id].status === 'alerted' ? 'hot' : 'glass'}">${S.host.drafts[d.id].status === 'alerted' ? 'Live' : 'Draft'}</span>` : S.host.claims.has(d.id) ? '<span class="pill hot">You\'re planning</span>' : planners ? `<span class="pill glass">${planners} planning</span>` : icon('arrow');
      return `<button class="idea" data-a="idea" data-id="${d.id}"><div class="count">${d.count}</div><div class="grow"><div class="t">${esc(d.text)}</div><div class="m">${esc(d.area)} · ${esc(d.when)} · under $${d.budget}</div></div>${badge}</button>`; }).join('')}`;
}

// Request detail. Decision: several hosts can plan the same request; requesters hear from each one.
function ideaPage(id) {
  const d = IDEAS.find((x) => x.id === id);
  const cap = Math.round(d.count * 0.45 / 10) * 10;
  const price = Math.max(10, d.budget - 5);
  const mine = S.host.claims.has(id);
  const others = PLANNING[id] || [];
  return `${poster(id, d.scene, `<div class="row">${backBtn()}</div><div><div class="eyebrow" style="color:var(--paper)">Quest Request · idea brief by Sixer</div><h1 style="font-size:36px;margin-top:6px">${esc(d.text)}</h1></div>`, 'hero mid')}
    <div class="detail">
      <div class="kpis" style="padding:0"><div class="kpi"><div class="v">${d.count}</div><div class="l">accounts asked near ${esc(d.area)}</div></div><div class="kpi"><div class="v">${Math.round(d.crew * 100)}%</div><div class="l">want to come with their party</div></div></div>
      <div class="why"><span class="orb" style="--s:40px"></span><div><div style="font-weight:700;margin-bottom:4px">Sixer's suggestion</div><p>${esc(d.when)}, ${esc(d.area)}. Price around <b>$${price}</b> (their budget is under $${d.budget}). Capacity <b>${cap}</b>. People who asked also love ${esc(SCENES[d.scene === 'live' ? 'food' : 'live'].label)}, so a crossover would widen it.</p></div></div>
      <div><div class="eyebrow" style="margin-bottom:10px">Hosts planning something like this</div>
        ${others.map((o) => `<div class="row planner"><span class="avatar">${icon('host')}</span><div class="grow"><div style="font-weight:600">${esc(o.host)}</div><div class="muted" style="font-size:13px">Planning · ${esc(o.when)}</div></div></div>`).join('')}
        ${mine ? `<div class="row planner"><span class="avatar me">${icon('host')}</span><div class="grow"><div style="font-weight:600">${esc(HOSTS.loop.name)} (you)</div><div class="muted" style="font-size:13px">Planning · just now</div></div></div>` : ''}
        ${!others.length && !mine ? '<p class="muted" style="font-size:14px">Nobody yet. Be the first.</p>' : ''}
        <p class="note" style="margin-top:8px">More than one host can plan the same idea. Requesters hear from each of you, and the quests compete on fit, not on who claimed first.</p></div>
      ${d.booked ? `<button class="btn ghost block" data-a="event" data-id="${d.booked}">Already booked: see the quest</button>` : `
        ${mine ? '' : `<button class="btn solid block" data-a="claim" data-id="${id}">We're on it · tell the requesters</button>`}
        <button class="btn ${mine ? 'solid' : 'ghost'} block" data-a="create" data-id="${id}">Create a quest from this request</button>
        <button class="btn ghost block" data-a="post-draft" data-id="${id}">${S.host.drafts[id] ? 'Open draft test' : 'Test it with a draft first'}</button>`}
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
    ${dr.status === 'alerted' ? `<div class="pad" style="margin:18px 0 30px"><div class="why"><div class="grow"><div style="font-weight:700">It's live</div><p>Alerts went to ${dr.interest} people. It now shows up in Weekly Quests for matched attendees.</p></div></div></div>` : '<div style="height:30px"></div>'}`;
}

// Your quests: drafts, live and past, with duplicate for recurring nights.
function hostQuestsTab() {
  const live = EVENTS.filter((e) => e.host === 'loop').concat(S.host.published.map((id) => EV.get(id))).filter((e, i, a) => e && a.indexOf(e) === i);
  const drafts = Object.entries(S.host.drafts).filter(([, dr]) => dr.status === 'testing').map(([id]) => IDEAS.find((x) => x.id === id)).concat(S.host.duplicated);
  const past = PAST.filter((p) => p.host === 'grooves').concat([{ id: 'vinyl-last', title: 'Sunday Vinyl Brunch', scene: 'live', date: new Date(TODAY.getTime() - 7 * DAY), area: 'Ossington' }]);
  const seg = S.host.questSeg;
  const card = (e) => `<button class="night-card" data-a="hevent" data-id="${e.id}">${poster(e.id + 'h', e.scene, `<div class="row"><span class="pill glass">${esc(shortWhen(e.start))}</span><span class="grow"></span>${e.demandBooked ? '<span class="pill hot">From a request</span>' : ''}</div><h3>${esc(e.title)}</h3>`)}
      <div class="body"><div class="grow"><div style="font-weight:600">${e.going} going</div><div class="muted" style="font-size:13px">${Math.round(e.going * 0.72)} matched by Sixer</div></div><span class="btn sm solid">Event day tools</span></div></button>`;
  const body = seg === 'drafts'
    ? (drafts.map((d) => `<button class="night-card" data-a="${d.dup ? 'create' : 'draft-open'}" data-id="${d.id}"><div class="body"><div class="grow"><div class="eyebrow">${d.dup ? 'Duplicated' : 'Draft test'}</div><div style="font-weight:700;font-size:17px;margin-top:4px">${esc(d.text || d.title)}</div><div class="muted" style="font-size:13px">${esc(d.area || '')}</div></div>${icon('arrow')}</div></button>`).join('') || '<p class="lede">No drafts. Start one from a Quest Request.</p>')
    : seg === 'past'
      ? past.map((p) => `<div class="night-card"><button style="display:block;width:100%;text-align:left" data-a="hrecap" data-id="${p.id}">${poster(p.id + 'hp', p.scene, `<div class="row"><span class="pill glass">${esc(p.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span></div><h3>${esc(p.title)}</h3>`)}</button>
          <div class="body"><button class="btn sm ghost" data-a="hrecap" data-id="${p.id}">See recap</button><span class="grow"></span><button class="btn sm solid" data-a="duplicate" data-id="${p.id}">${icon('plus')}Duplicate</button></div></div>`).join('')
      : live.map(card).join('');
  return `<div class="top-safe"></div><div class="hello"><h1 class="grow" style="font-size:38px">Your quests</h1>${hostAvatar()}</div>
    <div class="pad" style="margin-top:14px"><button class="btn solid block" data-a="create">${icon('plus')}Create a quest</button></div>
    <div class="seg" style="margin-top:16px">${[['drafts', 'Drafts'], ['live', 'Live'], ['past', 'Past']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-a="hseg" data-v="${k}">${l}</button>`).join('')}</div>
    <div style="margin-top:16px">${body}</div>`;
}

// Create a quest. Team notes: start AND end time, a search bar for tags; plus payments and amenities attendees asked about.
const draftQ = { title: '', day: 'Sat', start: '8 PM', end: '11 PM', price: 20, age: 'all', tags: new Set(['food']), tagQ: '', amen: new Set(['Step-free access', 'Food']), pay: new Set(['card', 'tap']), fromRequest: null };
function createPage(p) {
  const d = p.id && IDEAS.find((x) => x.id === p.id);
  if (d && draftQ.fromRequest !== d.id) { Object.assign(draftQ, { title: d.text.replace(/^./, (c) => c.toUpperCase()), tags: new Set([d.scene]), price: Math.max(10, d.budget - 5), fromRequest: d.id }); }
  const tagList = SCENE_KEYS.filter((s) => !draftQ.tagQ || SCENES[s].label.toLowerCase().includes(draftQ.tagQ.toLowerCase()));
  const times = ['10 AM', '12 PM', '2 PM', '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM', '1 AM'];
  return `<div class="page-head">${backBtn()}<h2>Create a quest</h2><span class="muted mono" style="font-size:12px">1 of 2</span></div>
    ${d ? `<div class="why" style="margin:6px 20px 0"><div class="grow"><div style="font-weight:700">Linked to a Quest Request</div><p>"${esc(d.text)}" · ${d.count} requesters are told first when it's live.</p></div></div>` : ''}
    <div class="pad" style="margin-top:16px">${poster('create', [...draftQ.tags][0] || 'live', `<div class="upload-hint">${icon('upload')}Poster, photos or video</div>`, 'tall')}</div>
    <div class="field"><div class="label">Title</div><input class="text-in" id="cq-title" value="${esc(draftQ.title)}" placeholder="Name your quest"></div>
    <div class="field"><div class="label">Day</div><div class="chips">${['Thu', 'Fri', 'Sat', 'Sun'].map((x) => `<button class="chip ${draftQ.day === x ? 'on' : ''}" data-a="cq" data-k="day" data-v="${x}">${x}</button>`).join('')}</div></div>
    <div class="field two"><div><div class="label">Starts</div><div class="chips">${times.slice(0, 8).map((x) => `<button class="chip ${draftQ.start === x ? 'on' : ''}" data-a="cq" data-k="start" data-v="${x}">${x}</button>`).join('')}</div></div></div>
    <div class="field"><div class="label">Ends</div><div class="chips">${times.slice(3).map((x) => `<button class="chip ${draftQ.end === x ? 'on' : ''}" data-a="cq" data-k="end" data-v="${x}">${x}</button>`).join('')}</div></div>
    <div class="field"><div class="label">Price</div><div class="chips">${[0, 10, 15, 20, 30, 45].map((x) => `<button class="chip ${draftQ.price === x ? 'on' : ''}" data-a="cq" data-k="price" data-v="${x}">${x ? '$' + x : 'Free'}</button>`).join('')}</div></div>
    <div class="field"><div class="label">Age</div><div class="chips"><button class="chip ${draftQ.age === 'all' ? 'on' : ''}" data-a="cq" data-k="age" data-v="all">All ages</button><button class="chip ${draftQ.age === '19' ? 'on' : ''}" data-a="cq" data-k="age" data-v="19">19+ · ID at the door</button></div></div>
    <div class="field"><div class="label">Vibe tags</div><div class="search-in">${icon('search')}<input id="cq-tagq" value="${esc(draftQ.tagQ)}" placeholder="Search tags" aria-label="Search tags" data-live="cq-tagq"></div>
      <div class="chips" style="margin-top:10px">${tagList.map((s) => `<button class="chip ${draftQ.tags.has(s) ? 'on' : ''}" data-a="cq-tag" data-v="${s}">${esc(SCENES[s].label)}</button>`).join('') || '<span class="muted">No tag matches. Press return to add it.</span>'}</div><p class="note" style="margin-top:8px">Tags decide who Sixer matches this quest to.</p></div>
    <div class="field"><div class="label">Payments accepted at the door</div><div class="chips">${['card', 'cash', 'tap'].map((k) => `<button class="chip ${draftQ.pay.has(k) ? 'on' : ''}" data-a="cq-pay" data-v="${k}">${icon(k)}${PAY_LABEL[k]}</button>`).join('')}</div></div>
    <div class="field"><div class="label">Amenities</div><div class="chips">${['Step-free access', 'Food', 'Drinks', 'Coat check', 'Gender-neutral washrooms', 'Quiet room'].map((a) => `<button class="chip ${draftQ.amen.has(a) ? 'on' : ''}" data-a="cq-amen" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>
    <div class="field"><div class="label">Tickets</div><div class="why" style="padding:12px 14px"><div class="grow"><div style="font-weight:700">DICE · connected</div><p>The ticket button links here. Sales show up in Insights.</p></div>${icon('link')}</div></div>
    <div class="pad" style="margin:26px 0 30px"><button class="btn solid block" data-a="cq-next" data-id="${p.id || ''}">Next: event day info</button></div>`;
}
// Event day info. Team note: routes and "getting home" are generated for each attendee, not typed by the host.
function dayInfoPage(p) {
  return `<div class="page-head">${backBtn()}<h2>Event day info</h2><span class="muted mono" style="font-size:12px">2 of 2</span></div>
    <p class="lede" style="padding-top:0">This powers each attendee's event day screen.</p>
    <div class="pad" style="margin-top:16px">${poster('floor', 'markets', `<div class="upload-hint">${icon('upload')}Upload a floor plan</div>`, 'tall')}</div>
    <div class="field"><div class="label">Entrances</div><input class="text-in" value="Laneway door (tickets) · Front door (bar only)"></div>
    <div class="field"><div class="label">Coat check and re-entry</div><input class="text-in" value="Coat check $3 · no re-entry after 11"></div>
    <div class="field"><div class="label">Accessibility</div><input class="text-in" value="Step-free from the laneway. Accessible washroom on main floor."></div>
    <div class="field"><div class="why"><span class="orb" style="--s:36px"></span><div class="grow"><div style="font-weight:700">Getting there and home: automatic</div><p>Sixer builds each attendee's route from where they are, with transit, Bike Share and parking, plus the last streetcar home. You don't have to write it.</p></div></div></div>
    <div class="pad" style="display:grid;gap:10px;margin:26px 0 30px"><button class="btn solid block" data-a="cq-publish" data-id="${p.id || ''}">Publish now</button><button class="btn ghost block" data-a="toast" data-v="Scheduled for Monday 9 AM, when Weekly Quests refresh">Schedule for later</button></div>`;
}

// Event day tools: door QR, guest list with parties together, live headcount, moderators, live updates.
const GUEST_LIST = [['g1', 'Maya Chen', 'Friday Crew'], ['g2', 'Kai Okafor', 'Friday Crew'], ['g3', 'Leila Haddad', 'Friday Crew'], ['g4', 'Sam Ito', ''], ['g5', 'Noor Aziz', 'Sunday Brunch Club'], ['g6', 'Theo Martin', ''], ['g7', 'Ari Cohen', '']];
function hostEventPage(e) {
  const mods = S.host.moderators[e.id] || new Set(['Priya']);
  const cap = e.going > 200 ? 260 : 150;
  const inCount = Math.round(e.going * .55) + S.host.checked.size;
  return `<div class="page-head">${backBtn()}<h2>${esc(e.title)}</h2></div>
    <div style="padding:8px 0 40px">
      <div class="hub-block"><div class="row"><h3 class="grow">Headcount</h3><span class="mono">${inCount} / ${cap}</span></div><div class="meter"><i style="width:${clamp(inCount / cap * 100, 0, 100)}%"></i></div>
        <div class="row" style="gap:10px"><button class="btn sm solid" data-a="toast" data-v="Camera opens to scan tickets">${icon('qr')}Scan tickets</button><button class="btn sm ghost" data-a="dayinfo" data-id="${e.id}">Edit event day info</button></div></div>
      <div class="hub-block"><h3>Guest list</h3><p class="muted" style="font-size:13px">Parties are listed together, so you can wave a group in at once.</p>
        ${GUEST_LIST.map(([gid, n, party]) => `<div class="row guest-row"><div class="grow"><div style="font-weight:600">${esc(n)}</div>${party ? `<div class="muted" style="font-size:12.5px">${esc(party)}</div>` : '<div class="muted" style="font-size:12.5px">Solo</div>'}</div><button class="btn sm ${S.host.checked.has(gid) ? 'solid' : 'ghost'}" data-a="guest" data-id="${gid}" aria-pressed="${S.host.checked.has(gid)}">${S.host.checked.has(gid) ? 'Checked in' : 'Check in'}</button></div>`).join('')}</div>
      <div class="hub-block"><h3>Door QR</h3><div class="qr">${qrSvg(e.id)}</div><p class="muted" style="text-align:center;font-size:13px">Print it or show it on a tablet at each entrance. Attendees scan it to check in.</p></div>
      <div class="hub-block"><h3>Chat moderators</h3><div class="chips" style="padding:0;flex-wrap:wrap">${['Priya', 'Dev', 'Sasha'].map((m) => `<button class="chip ${mods.has(m) ? 'on' : ''}" data-a="mod" data-id="${e.id}" data-v="${m}">${esc(m)}</button>`).join('')}</div></div>
      <div class="hub-block"><h3>Post a live update</h3><p class="muted" style="font-size:13px">Set times, delays, entrance changes. Attendees see it on their event day screen.</p>
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

// Insights. Team note: per-quest or total, filterable like Google Analytics (quest, venue, dates);
// attendees per quest, revenue per quest (with vendors), and views-to-purchase conversion.
// Decision: revenue needs connected ticketing (DICE etc.); without it, only views, ticket taps and check-ins.
const INSIGHT_ROWS = [
  { id: 'vinyl', t: 'Sunday Vinyl Brunch', venue: 'The Parlour Room', att: 212, rev: 4664, vendor: 1180, views: 4820, taps: 1210, buys: 640 },
  { id: 'rooftop', t: 'Rooftop Deep House', venue: 'Level 22 Rooftop', att: 248, rev: 6200, vendor: 0, views: 6110, taps: 1460, buys: 248 },
  { id: 'distillery', t: 'Distillery Night Market', venue: 'Distillery Lanes', att: 930, rev: 0, vendor: 8400, views: 9900, taps: 2310, buys: 0 },
];
function hostInsightsTab() {
  const h = S.host;
  const rows = INSIGHT_ROWS.filter((r) => (h.evFilter === 'all' || r.id === h.evFilter) && (h.venueFilter === 'all' || r.venue === h.venueFilter));
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const n = Math.max(1, rows.length);
  const funnel = [['Quest page views', sum('views')], ['Ticket button taps', sum('taps')], ['Tickets bought', sum('buys')], ['Checked in', Math.round(sum('att') * .82)]];
  const top = funnel[0][1] || 1;
  const filterChip = (k, v, l) => `<button class="chip ${h[k] === v ? 'on' : ''}" data-a="hfilter" data-k="${k}" data-v="${esc(v)}">${esc(l)}</button>`;
  const perf = `
    <div class="chips" style="margin-top:6px">${filterChip('evFilter', 'all', 'All quests')}${INSIGHT_ROWS.map((r) => filterChip('evFilter', r.id, r.t)).join('')}</div>
    <div class="chips" style="margin-top:8px">${filterChip('venueFilter', 'all', 'All venues')}${[...new Set(INSIGHT_ROWS.map((r) => r.venue))].map((v) => filterChip('venueFilter', v, v)).join('')}</div>
    <div class="chips" style="margin-top:8px">${[['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['yr', 'This year']].map(([k, l]) => filterChip('range', k, l)).join('')}</div>
    <div class="kpis" style="margin-top:18px">
      <div class="kpi hot"><div class="v">${Math.round(sum('att') / n)}</div><div class="l">avg attendees per quest</div></div>
      <div class="kpi"><div class="v">$${Math.round(sum('rev') / n).toLocaleString()}</div><div class="l">ticket revenue per quest · via DICE</div></div>
      <div class="kpi"><div class="v">$${sum('vendor').toLocaleString()}</div><div class="l">vendor revenue · entered by vendors</div></div>
      <div class="kpi"><div class="v">${Math.round(sum('buys') / Math.max(1, sum('views')) * 1000) / 10}%</div><div class="l">views to tickets bought</div></div></div>
    <div class="sec-head"><h2 style="font-size:18px">From views to the door</h2></div>
    <div class="pad funnel">${funnel.map(([l, v]) => `<div class="f-row"><span class="grow">${l}</span><span class="mono">${v.toLocaleString()}</span><div class="f-bar"><i style="width:${Math.max(2, v / top * 100)}%"></i></div></div>`).join('')}</div>
    <div class="sec-head"><h2 style="font-size:18px">Per quest</h2></div>
    <div class="pad"><table class="tbl"><thead><tr><th>Quest</th><th>People</th><th>Revenue</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.t)}</td><td>${r.att}</td><td>${r.rev ? '$' + r.rev.toLocaleString() : '–'}</td></tr>`).join('')}</tbody></table>
      <p class="note" style="margin-top:8px">Revenue comes from your connected ticketing. Free quests and RSVPs show attendance only.</p></div>
    <div class="pad" style="margin-top:18px"><button class="btn solid block" data-a="tab" data-v="demand">Plan next from the demand map</button></div>`;
  const aud = `
    <div class="kpis" style="margin-top:6px"><div class="kpi"><div class="v">4,210</div><div class="l">followers</div></div><div class="kpi"><div class="v">34%</div><div class="l">come back within a month</div></div></div>
    <div class="sec-head"><h2 style="font-size:18px">Taste segments</h2><span class="muted" style="font-size:12.5px">aggregated, anonymous</span></div>
    <div class="pad" style="display:grid;gap:10px">${[['Live Sets', 62], ['Food Pop-ups', 48], ['Markets', 41], ['Dance Nights', 28]].map(([l, v]) => `<div class="fitrow" style="grid-template-columns:110px 1fr 38px"><span>${l}</span><span class="bar"><i style="width:${v}%"></i></span><span class="n">${v}%</span></div>`).join('')}</div>
    <div class="sec-head"><h2 style="font-size:18px">Solo vs party</h2></div>
    <div class="split"><i style="background:var(--paper);width:38%"></i><i style="background:var(--accent);width:62%"></i></div>
    <div class="pad row muted" style="font-size:13px;margin-top:8px"><span class="grow">Solo 38%</span><span>Parties 62% · average party of 3.4</span></div>
    <div class="sec-head"><h2 style="font-size:18px">Repeat attendees</h2></div>
    <div class="pad row" style="gap:10px"><span class="faces">${['maya', 'kai', 'noor', 'theo'].map(faceOf).join('')}</span><span class="muted" style="font-size:14px">118 people came to 3+ of your quests</span></div>`;
  return `<div class="top-safe"></div><div class="hello"><h1 class="grow" style="font-size:38px">Insights</h1>${hostAvatar()}</div>
    <div class="seg" style="margin-top:16px"><button class="${h.insightSeg === 'performance' ? 'on' : ''}" data-a="iseg" data-v="performance">Performance</button><button class="${h.insightSeg === 'audience' ? 'on' : ''}" data-a="iseg" data-v="audience">Audience</button></div>
    <div style="margin-top:14px">${h.insightSeg === 'audience' ? aud : perf}</div>`;
}
// Per-quest recap (what was "How it went").
function hostRecapPage() {
  return `<div class="page-head">${backBtn()}<h2>Recap</h2></div><div class="eyebrow pad">Last edition · Sunday Vinyl Brunch</div><h1 class="big-title" style="padding-top:6px">How it went</h1>
    <div class="kpis" style="margin-top:20px">
      <div class="kpi hot"><div class="v">164</div><div class="l">matched guests of 212 check-ins</div></div>
      <div class="kpi"><div class="v">71%</div><div class="l">came from Quest Requests</div></div>
      <div class="kpi"><div class="v">4.7★</div><div class="l">average rating</div></div>
      <div class="kpi"><div class="v">$4,664</div><div class="l">ticket revenue · via DICE</div></div></div>
    <div class="sec-head"><h2 style="font-size:18px">Ratings by category</h2></div>
    <div class="ratings pad" style="margin:0 20px">${[['Host', 4.8], ['Ambience', 4.6], ['Venue', 4.4], ['Access', 4.1], ['Vibes', 4.9]].map(([c, v]) => `<div><b>★ ${v}</b><span>${c}</span></div>`).join('')}</div>
    <div class="sec-head"><h2 style="font-size:18px">What guests asked for next</h2></div>
    ${[['Evening edition on Saturdays', 118], ['Add a record swap table', 86], ['Bigger room, 150+ capacity', 64]].map(([t, n]) => `<div class="idea"><div class="count" style="font-size:22px">${n}</div><div class="grow t">${t}</div></div>`).join('')}
    <div class="pad" style="display:grid;gap:10px;margin:18px 0 30px"><button class="btn solid block" data-a="toast" data-v="Invites sent to guests who rated 4 stars or more">Invite guests to follow you</button><button class="btn ghost block" data-a="duplicate" data-id="vinyl-last">${icon('plus')}Duplicate for next time</button></div>`;
}

// Inbox. Team note: a quick last-minute update ("See you in 2 hours") and scheduling.
const annDraft = { to: 'Tonight\'s ticket holders', when: 'now', text: '' };
function hostInboxTab() {
  const h = S.host;
  const templates = ['We can\'t wait to see you in 2 hours!', 'Doors are open. Laneway entrance for tickets.', 'Running 15 minutes late. Thanks for your patience.', 'Last call for tickets tonight.'];
  return `<div class="top-safe"></div><div class="hello"><h1 class="grow" style="font-size:38px">Inbox</h1>${hostAvatar()}</div>
    <p class="lede">Announcements go to attendees' notifications and their event day screen.</p>
    <div class="field"><div class="label">To</div><div class="chips">${['Tonight\'s ticket holders', 'All ticket holders', 'Followers'].map((x) => `<button class="chip ${annDraft.to === x ? 'on' : ''}" data-a="ann" data-k="to" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
    <div class="field"><div class="label">Quick updates</div><div class="chips">${templates.map((x) => `<button class="chip" data-a="ann-tpl" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div></div>
    <div class="field"><textarea id="ann-text" class="text-in" style="height:96px;padding:14px 20px;border-radius:22px;resize:none" placeholder="Write an announcement">${esc(annDraft.text)}</textarea></div>
    <div class="field"><div class="label">Send</div><div class="chips">${[['now', 'Now'], ['2h', '2 hours before doors'], ['morning', 'Morning of'], ['custom', 'Pick a time']].map(([k, l]) => `<button class="chip ${annDraft.when === k ? 'on' : ''}" data-a="ann" data-k="when" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="pad" style="margin-top:18px"><button class="btn solid block" data-a="ann-send">${annDraft.when === 'now' ? 'Send now' : 'Schedule'}</button></div>
    <div class="sec-head"><h2 style="font-size:18px">Sent and scheduled</h2></div>
    ${h.announcements.map((a) => `<div class="setting"><span class="icon-btn" style="background:var(--night-3)">${icon(a.at.startsWith('Sched') ? 'clock' : 'megaphone')}</span><div class="grow">${esc(a.text)}<span>${esc(a.to)} · ${esc(a.at)}</span></div></div>`).join('')}
    <button class="setting" data-a="room" data-id="listening">${icon('bubble')}<div class="grow">Moderate attendee chat<span>Pin, hide or mute messages in tonight's chat</span></div>${icon('arrow')}</button>
    <div style="height:40px"></div>`;
}
// Figma 36 · Quest published: confirmation with who gets told.
function publishedPage(id) {
  const e = EV.get(id) || EVENTS[0];
  const d = e.fromRequest && IDEAS.find((x) => x.id === e.fromRequest);
  return `<div class="page-head">${backBtn()}<h2>Quest published</h2><button class="icon-btn glass" data-a="share" data-id="${e.id}" aria-label="Share">${icon('share')}</button></div>
    <div class="pad">${poster(e.id + 'pub', e.scene, `<div class="pub-meta"><span class="pill glass">${esc(shortWhen(e.start))} · ${esc(e.area)}</span><h3>${esc(e.title)}</h3></div>`, 'tall')}</div>
    <h1 class="big-title" style="padding-top:18px">Your quest is live.</h1>
    <div class="pad" style="display:grid;gap:10px;margin-top:14px">
      ${d ? `<div class="why"><div class="grow"><div style="font-weight:700">${d.count} people who requested it</div><p>Get a "You asked, it's happening" alert now.</p></div>${icon('bell')}</div>` : ''}
      <div class="why"><div class="grow"><div style="font-weight:700">Weekly Quests</div><p>Shown to people whose taste matches, from Monday.</p></div>${icon('spark')}</div>
      <div class="why"><div class="grow"><div style="font-weight:700">Your followers</div><p>${HOSTS.loop.followers || 340} people get a notification.</p></div>${icon('crew')}</div></div>
    <div class="pad" style="display:grid;gap:10px;margin:24px 0 30px"><button class="btn solid block" data-a="hevent" data-id="${e.id}">Open event day tools</button><button class="btn ghost block" data-a="tab" data-v="quests">Back to your quests</button></div>`;
}
function hostProfilePage() {
  return `<div class="page-head">${backBtn()}<h2>Host profile</h2></div>
    <div class="profile-head pad"><div class="ph-photo">${icon('host')}</div><div class="grow"><h1 style="font-size:26px">${esc(HOSTS.loop.name)}</h1><div class="muted" style="font-size:13px">Verified host · ${esc(HOSTS.loop.scenes.map((s) => SCENES[s].label).join(', '))}</div></div></div>
    <div class="sec-head"><h2 style="font-size:18px">Socials and website</h2></div>
    ${[['Instagram', '@loopcollective'], ['Website', 'loopcollective.example']].map(([k, v]) => `<div class="setting">${icon('link')}<div class="grow">${k}<span>${esc(v)}</span></div></div>`).join('')}
    <div class="sec-head"><h2 style="font-size:18px">Team</h2></div>
    ${[['Priya Nair', 'Owner'], ['Dev Shah', 'Marketing']].map(([n, r]) => `<div class="setting">${icon('user')}<div class="grow">${n}<span>${r}</span></div></div>`).join('')}
    <p class="note pad">Event staff (door, security) are invited per quest when you create it.</p>
    <div class="sec-head"><h2 style="font-size:18px">Ticketing</h2></div>
    <div class="setting">${icon('link')}<div class="grow">DICE<span>Connected · sales flow into Insights</span></div></div>
    <div class="pad" style="margin:20px 0 40px"><button class="btn solid block" data-a="mode-attendee">${icon('swap')} Switch to personal account</button></div>`;
}
