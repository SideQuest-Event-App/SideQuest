/* Sidequest wireframe — screens.
   Each screen is { role, render(state) } and returns an HTML string.
   Clickable elements use:
     data-go="screen-id"        navigate to a screen
     data-act="action" data-arg  run an action from actions.js (may also navigate)
     data-back                  go back                                        */
(function () {
  const SQ = window.SQ;

  // ---------- small UI helpers ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const attr = (o = {}) => Object.entries(o).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');

  const bar = (title, { back = true, right = '' } = {}) => `
    <header class="bar">
      ${back ? '<button class="icon-btn" data-back aria-label="Back">&larr;</button>' : '<span class="icon-spacer"></span>'}
      <h1>${esc(title)}</h1>
      ${right || '<span class="icon-spacer"></span>'}
    </header>`;
  const btn = (label, a = {}, kind = 'primary') => `<button class="btn btn-${kind}" ${attr(a)}>${esc(label)}</button>`;
  const chip = (label, on, a = {}) => `<button class="chip${on ? ' on' : ''}" aria-pressed="${on ? 'true' : 'false'}" ${attr(a)}>${esc(label)}</button>`;
  const ph = (label, h = 140) => `<div class="ph" style="height:${h}px"><span>${esc(label)}</span></div>`;
  const field = (label, id, value = '', type = 'text', placeholder = '') => `
    <label class="field"><span>${esc(label)}</span>
      <input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`;
  const area = (label, id, value = '', placeholder = '') => `
    <label class="field"><span>${esc(label)}</span>
      <textarea id="${id}" rows="3" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
  const progress = (n, total) => `<div class="progress" aria-label="Step ${n} of ${total}">${
    Array.from({ length: total }, (_, i) => `<span class="${i < n ? 'done' : ''}"></span>`).join('')}</div>`;
  const avatars = (names) => `<span class="avatars">${names.map((n) => `<span class="av" title="${esc(n)}">${esc(n[0])}</span>`).join('')}</span>`;
  const meter = (pct) => `<span class="meter"><span style="width:${Math.round(pct)}%"></span></span>`;
  const viewToggle = (active) => `<div class="segmented" role="group" aria-label="View quests as">${[['discover', 'List'], ['map', 'Map']].map(([id, label]) =>
    `<button class="seg${id === active ? ' on' : ''}" ${id === active ? 'aria-pressed="true"' : `aria-pressed="false" data-go="${id}"`}>${label}</button>`).join('')}</div>`;
  const empty = (text, action = '') => `<div class="empty"><p>${esc(text)}</p>${action}</div>`;

  const ATTENDEE_TABS = [['discover', 'Discover'], ['parties', 'Parties'], ['requests', 'Requests'], ['questlog', 'Quest Log'], ['profile', 'Profile']];
  const HOST_TABS = [['host-dashboard', 'Dashboard'], ['host-quests', 'Quests'], ['host-demand', 'Requests'], ['host-audience', 'Audience'], ['host-messages', 'Inbox']];
  const tabs = (list, active) => `<nav class="tabs">${list.map(([id, label]) =>
    `<button class="tab${id === active ? ' on' : ''}" data-go="${id}"><span class="tab-ic"></span>${esc(label)}</button>`).join('')}</nav>`;
  const screen = (body, { title, back = true, right = '', tabbar = '', cls = '' } = {}) => `
    <div class="screen ${cls}">
      ${title !== undefined ? bar(title, { back, right }) : ''}
      <main class="scroll">${body}</main>
      ${tabbar}
    </div>`;

  // ---------- shared logic ----------
  const quest = (s, id) => s.quests.find((q) => q.id === id) || s.quests[0];
  const request = (s, id) => s.requests.find((r) => r.id === id) || s.requests[0];
  const hostName = (s) => s.host.name || 'Your venue';

  SQ.matchScore = (s, q) => {
    const overlap = q.tags.filter((t) => s.user.vibes.includes(t)).length;
    const friends = q.going.filter((f) => s.party.members.includes(f)).length;
    return Math.min(98, 52 + overlap * 18 + friends * 5);
  };

  SQ.crewBlend = (s) => {
    const people = [s.user.vibes, ...s.party.members.map((m) => SQ.FRIENDS[m] || [])];
    const counts = {};
    people.forEach((vs) => vs.forEach((v) => { counts[v] = (counts[v] || 0) + 1; }));
    return Object.entries(counts)
      .map(([vibe, n]) => ({ vibe, pct: (n / people.length) * 100 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4);
  };

  // ---------- map logic ----------
  // Quests published in the demo have no pos, so place them near their area's centre.
  SQ.questPos = (q) => {
    if (q.pos) return q.pos;
    const [x, y] = SQ.AREA_POS[q.area] || SQ.AREA_POS['West End'];
    const n = q.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return [x + ((n % 3) - 1) * 5, y + ((n % 2) ? 4 : -4)];
  };
  SQ.userPos = (s) => {
    const [x, y] = SQ.AREA_POS[s.user.area] || SQ.AREA_POS['West End'];
    return [x + 2, y + 3];
  };
  SQ.distanceKm = (s, q) => {
    const [ux, uy] = SQ.userPos(s);
    const [qx, qy] = SQ.questPos(q);
    return Math.round(Math.hypot(qx - ux, qy - uy) * 0.18 * 10) / 10;
  };
  SQ.MAP_RADIUS = { Walkable: 2, 'Short ride': 6 };
  SQ.MAP_DEFAULTS = SQ.defaultMapFilters();
  SQ.MAP_FILTER_KEYS = ['radius', 'who', 'interest', 'when', 'price'];
  SQ.mapActiveCount = (s) => SQ.MAP_FILTER_KEYS.filter((k) => s.map[k] !== SQ.MAP_DEFAULTS[k]).length;

  SQ.mapResults = (s) => {
    const m = s.map;
    const blend = SQ.crewBlend(s).map((b) => b.vibe);
    return s.quests.filter((q) => {
      if (q.completed) return false;
      if (SQ.MAP_RADIUS[m.radius] && SQ.distanceKm(s, q) > SQ.MAP_RADIUS[m.radius]) return false;
      if (m.who === 'Friends going' && !q.going.length) return false;
      if (m.who === 'My party going' && !q.going.some((f) => s.party.members.includes(f))) return false;
      if (m.interest === 'My vibes' && !q.tags.some((t) => s.user.vibes.includes(t))) return false;
      if (m.interest === 'Crew Blend' && !q.tags.some((t) => blend.includes(t))) return false;
      if (SQ.VIBES.includes(m.interest) && !q.tags.includes(m.interest)) return false;
      if (m.when === 'Tonight' && q.day !== 'Tonight') return false;
      if (m.when === 'This weekend' && !['Fri', 'Sat', 'Sun'].includes(q.day)) return false;
      if (m.price === 'Free' && q.price !== 'Free') return false;
      if (m.price === 'Under $20' && q.price !== 'Free' && parseFloat(q.price.replace('$', '')) >= 20) return false;
      return true;
    }).sort((a, b) => SQ.distanceKm(s, a) - SQ.distanceKm(s, b));
  };

  const discoverBell = (s) => {
    const unread = s.notifications.filter((n) => !n.read).length;
    return `<button class="icon-btn" data-go="notifications" aria-label="Notifications">&#9675;${unread ? `<span class="dot">${unread}</span>` : ''}</button>`;
  };

  // Shared by List and Map, so filters carry over when switching views.
  const filterRow = (s) => {
    const active = SQ.mapActiveCount(s);
    const quick = [['Friends going', 'who:Friends going'], ['My vibes', 'interest:My vibes'], ['Walkable', 'radius:Walkable'], ['Tonight', 'when:Tonight']];
    return `<div class="chips scroll-x">
      ${chip(`Filters${active ? ` (${active})` : ''}`, active > 0, { 'data-go': 'map-filters' })}
      ${quick.map(([label, arg]) => { const [k, v] = arg.split(':'); return chip(label, s.map[k] === v, { 'data-act': 'mapSet', 'data-arg': arg }); }).join('')}
    </div>`;
  };
  const noMatches = () => empty('No quests match these filters.', `${btn('Clear filters', { 'data-act': 'mapClear' }, 'secondary')}${btn('Request one instead', { 'data-go': 'request-new' }, 'secondary')}`);

  const questCard = (s, q, big = false) => `
    <button class="card quest-card${big ? ' big' : ''}" data-act="openQuest" data-arg="${q.id}">
      ${ph(big ? 'Event poster' : 'Poster', big ? 150 : 64)}
      <span class="qc-body">
        <span class="badge">${SQ.matchScore(s, q)}% match</span>
        <strong>${esc(q.title)}</strong>
        <span class="muted small">${esc(q.day)}, ${esc(q.time)} in ${esc(q.area)}. ${esc(q.price)}</span>
        ${q.going.length ? `<span class="small">${avatars(q.going)} ${esc(q.going.join(', '))} going</span>` : ''}
      </span>
    </button>`;

  const requestStatus = (r) => {
    if (r.status === 'live') return '<span class="badge solid">Live now</span>';
    if (r.status === 'claimed') return `<span class="badge solid">Claimed by ${esc(r.claimedBy)}</span>`;
    if (r.votes >= 100) return '<span class="badge">Heating up</span>';
    return '<span class="badge">Open</span>';
  };

  // ---------- screens ----------
  const S = {};

  /* ===== Attendee registration ===== */
  S.landing = { role: 'attendee', render: () => screen(`
    <div class="pad">
      ${ph('Hero collage: tonight\'s top match', 240)}
      <h2 class="display">Sidequest</h2>
      <p class="lead muted">Collect the stories, not just the tickets.</p>
      <div class="stack">
        ${btn('Request a quest', { 'data-go': 'signup' })}
        ${btn('Host a quest', { 'data-go': 'host-type' }, 'secondary')}
        <button class="link" data-act="demoLogin">Already on a quest? Log in</button>
      </div>
    </div>`) };

  S.signup = { role: 'attendee', render: (s) => screen(`
    <div class="pad stack">
      <h2>Create your account</h2>
      ${btn('Continue with Apple', { 'data-act': 'toast', 'data-arg': 'Social sign-in is out of scope for the wireframe.' }, 'secondary')}
      ${btn('Continue with Google', { 'data-act': 'toast', 'data-arg': 'Social sign-in is out of scope for the wireframe.' }, 'secondary')}
      <p class="divider"><span>or</span></p>
      ${field('Name', 'f-name', s.user.name, 'text', 'Alex')}
      ${field('Email', 'f-email', s.user.email, 'email', 'alex@email.com')}
      ${field('Password', 'f-pass', '', 'password', '8+ characters')}
      ${btn('Create account', { 'data-act': 'signup' })}
    </div>`, { title: 'Sign up' }) };

  S['ob-vibes'] = { role: 'attendee', render: (s) => screen(`
    <div class="pad stack">
      ${progress(1, 4)}
      <h2>What kind of quests are you after?</h2>
      <p class="muted">Pick at least 3. Your taste avatar learns from here.</p>
      <div class="chips">${SQ.VIBES.map((v) => chip(v, s.user.vibes.includes(v), { 'data-act': 'toggleVibe', 'data-arg': v })).join('')}</div>
      ${btn(`Continue (${s.user.vibes.length} picked)`, { 'data-act': 'vibesNext' })}
    </div>`, { title: 'Your vibes' }) };

  S['ob-past'] = { role: 'attendee', render: (s) => screen(`
    <div class="pad stack">
      ${progress(2, 4)}
      <h2>Add events you've been to</h2>
      <p class="muted">These seed your taste avatar so your first recommendations aren't generic.</p>
      ${field('Search past events', 'f-past', '', 'search', 'Search by event or venue')}
      <ul class="list">${SQ.PAST_EVENT_SUGGESTIONS.map((e) => `
        <li class="row"><span>${esc(e)}</span>${chip(s.user.past.includes(e) ? 'Added' : 'Add', s.user.past.includes(e), { 'data-act': 'togglePast', 'data-arg': e })}</li>`).join('')}
      </ul>
      ${btn('Import from my ticket apps', { 'data-act': 'toast', 'data-arg': 'Ticket import is a future integration.' }, 'secondary')}
      ${btn('Continue', { 'data-go': 'ob-party' })}
      <button class="link" data-go="ob-party">Skip for now</button>
    </div>`, { title: 'Past events' }) };

  S['ob-party'] = { role: 'attendee', render: (s) => screen(`
    <div class="pad stack">
      ${progress(3, 4)}
      <h2>Assemble your party</h2>
      <p class="muted">See what friends are going to and plan together.</p>
      ${s.user.contactsSynced ? `
        <p class="small muted">4 friends are already on Sidequest</p>
        <ul class="list">${Object.keys(SQ.FRIENDS).map((f) => `
          <li class="row"><span>${avatars([f])} ${esc(f)} <span class="muted small">likes ${esc(SQ.FRIENDS[f].slice(0, 2).join(', '))}</span></span>
          ${chip(s.party.members.includes(f) ? 'In party' : 'Add', s.party.members.includes(f), { 'data-act': 'toggleMember', 'data-arg': f })}</li>`).join('')}
        </ul>` : btn('Sync contacts', { 'data-act': 'syncContacts' }, 'secondary')}
      ${btn('Continue', { 'data-go': 'ob-location' })}
    </div>`, { title: 'Your party' }) };

  S['ob-location'] = { role: 'attendee', render: (s) => screen(`
    <div class="pad stack">
      ${progress(4, 4)}
      <h2>Where do you usually head out?</h2>
      <div class="chips">${SQ.AREAS.map((a) => chip(a, s.user.area === a, { 'data-act': 'setArea', 'data-arg': a })).join('')}</div>
      <h3>How do you get around?</h3>
      <div class="chips">${['TTC', 'Bike', 'Walk', 'Drive', 'Rideshare'].map((t) => chip(t, s.user.transit === t, { 'data-act': 'setTransit', 'data-arg': t })).join('')}</div>
      ${btn('Continue', { 'data-go': 'ob-avatar' })}
    </div>`, { title: 'Location' }) };

  S['ob-avatar'] = { role: 'attendee', render: (s) => {
    const top = SQ.crewBlend({ ...s, party: { ...s.party, members: [] } }).slice(0, 3);
    return screen(`
    <div class="pad stack center-text">
      <div class="avatar-xl" aria-hidden="true"></div>
      <h2>Your taste avatar is ready</h2>
      <p class="muted">It learned from ${s.user.vibes.length} vibes, ${s.user.past.length} past events, and ${s.party.members.length} friends. It keeps learning every time you rate a quest.</p>
      <div class="card stack left-text">
        <strong>Leaning toward</strong>
        ${top.length ? top.map((t) => `<div class="row"><span>${esc(t.vibe)}</span></div>`).join('') : '<span class="muted small">Pick some vibes to see this.</span>'}
      </div>
      ${btn('Start exploring', { 'data-act': 'finishOnboarding' })}
    </div>`, { title: 'All set' });
  } };

  /* ===== Attendee features ===== */
  S.discover = { role: 'attendee', render: (s) => {
    const list = SQ.mapResults(s).sort((a, b) => SQ.matchScore(s, b) - SQ.matchScore(s, a));
    const right = discoverBell(s);
    return screen(`
      <div class="pad stack">
        ${viewToggle('discover')}
        ${filterRow(s)}
        ${list.length ? questCard(s, list[0], true) : noMatches()}
        ${list.length > 1 ? `<h3>More for you</h3>${list.slice(1).map((q) => questCard(s, q)).join('')}` : ''}
      </div>`, { title: 'Discover', back: false, right, tabbar: tabs(ATTENDEE_TABS, 'discover') });
  } };

  S.quest = { role: 'attendee', render: (s) => {
    const q = quest(s, s.currentQuest);
    const why = q.tags.filter((t) => s.user.vibes.includes(t));
    const friends = q.going.filter((f) => s.party.members.includes(f));
    const following = s.user.following.includes(q.host);
    return screen(`
      ${ph('Event poster', 190)}
      <div class="pad stack">
        ${q.fromRequest ? '<span class="badge solid">Made from a Quest Request</span>' : ''}
        <h2>${esc(q.title)}</h2>
        <p class="muted">${esc(q.day)}, ${esc(q.time)} in ${esc(q.area)}, ${SQ.distanceKm(s, q)} km away. ${esc(q.price)}</p>
        <div class="card stack">
          <strong>${SQ.matchScore(s, q)}% match</strong>
          <span class="small">Why this is for you: ${why.length ? `you picked ${esc(why.join(' and '))}` : 'it\'s popular with people like you'}${friends.length ? `, and ${esc(friends.join(' and '))} from your party ${friends.length > 1 ? 'are' : 'is'} going` : ''}.</span>
        </div>
        <div class="row card">
          <span>${avatars([q.host])} Hosted by ${esc(q.host)}</span>
          ${chip(following ? 'Following' : 'Follow', following, { 'data-act': 'follow', 'data-arg': q.host })}
        </div>
        <div class="row gap">
          ${btn(q.saved ? 'Saved' : 'Save', { 'data-act': 'toggleSave' }, 'secondary')}
          ${btn('Send to party', { 'data-act': 'sendToParty' }, 'secondary')}
        </div>
        ${q.accepted
          ? `<p class="small center-text">You accepted this quest.</p>${btn('Open Quest Log', { 'data-go': 'questlog' }, 'secondary')}`
          : btn(`Accept quest (${q.price})`, { 'data-act': 'accept' })}
      </div>`, { title: 'Quest' });
  } };

  S.map = { role: 'attendee', render: (s) => {
    const m = s.map;
    const list = SQ.mapResults(s);
    const sel = list.find((q) => q.id === m.selected);
    const [ux, uy] = SQ.userPos(s);
    const km = SQ.MAP_RADIUS[m.radius];
    const at = ([x, y]) => `left:${x}%;top:${(y / 90) * 100}%`;
    const pins = list.map((q) => {
      const friends = q.going.filter((f) => SQ.FRIENDS[f]);
      return `<button class="qpin${q.id === m.selected ? ' on' : ''}" style="${at(SQ.questPos(q))}" data-act="mapSelect" data-arg="${q.id}"
        aria-pressed="${q.id === m.selected}" aria-label="${esc(q.title)}, ${SQ.matchScore(s, q)}% match${friends.length ? ', ' + esc(friends.join(' and ')) + ' going' : ''}">
        ${SQ.matchScore(s, q)}%${friends.length ? `<span class="qpin-f" aria-hidden="true">${esc(friends.map((f) => f[0]).join(''))}</span>` : ''}</button>`;
    }).join('');
    const row = (q) => `
      <button class="card row" data-act="openQuest" data-arg="${q.id}">
        <span class="stack-tight left-text"><strong class="small">${esc(q.title)}</strong>
          <span class="small muted">${SQ.distanceKm(s, q)} km. ${esc(q.day)}, ${esc(q.time)}. ${esc(q.price)}</span>
          ${q.going.length ? `<span class="small">${avatars(q.going)} ${esc(q.going.join(', '))} going</span>` : ''}</span>
        <span class="badge">${SQ.matchScore(s, q)}%</span>
      </button>`;
    return screen(`
      <div class="pad stack">
        ${viewToggle('map')}
        ${filterRow(s)}
        <div class="city-map" aria-label="Map of quests near you">
          ${Object.entries(SQ.AREA_POS).map(([a, [x, y]]) => `<span class="area-label" style="${at([x, y > 45 ? y + 9 : y])}">${esc(a)}</span>`).join('')}
          <span class="road r1"></span><span class="road r2"></span><span class="road r3"></span>
          <span class="lake">Lake Ontario</span>
          ${km ? `<span class="radius" style="${at([ux, uy])};width:${(2 * km / 0.18)}%"></span>` : ''}
          <span class="you-pin" style="${at([ux, uy])}" title="You">You</span>
          ${pins}
        </div>
        <p class="small muted">Near you in ${esc(s.user.area || 'West End')}. Pins show your match. Letters show friends who are going.</p>
        ${sel ? `
          <section class="card stack">
            <div class="row top"><span class="stack-tight left-text"><strong>${esc(sel.title)}</strong>
              <span class="small muted">${esc(sel.host)}. ${SQ.distanceKm(s, sel)} km away. ${esc(sel.day)}, ${esc(sel.time)}. ${esc(sel.price)}</span></span>
              <span class="badge solid">${SQ.matchScore(s, sel)}%</span></div>
            ${sel.going.length ? `<span class="small">${avatars(sel.going)} ${esc(sel.going.join(', '))} going</span>` : ''}
            <div class="row gap">
              ${btn('Open quest', { 'data-act': 'openQuest', 'data-arg': sel.id })}
              ${btn('Send to party', { 'data-act': 'mapSendToParty', 'data-arg': sel.id }, 'secondary')}
            </div>
          </section>` : ''}
        ${list.length
          ? `<h3>${list.length} ${list.length === 1 ? 'quest' : 'quests'}, closest first</h3>${list.map(row).join('')}`
          : noMatches()}
      </div>`, { title: 'Discover', back: false, right: discoverBell(s), tabbar: tabs(ATTENDEE_TABS, 'discover') });
  } };

  S['map-filters'] = { role: 'attendee', render: (s) => {
    const m = s.map;
    const n = SQ.mapResults(s).length;
    const group = (title, key, options, hint = '') => `
      <h3>${esc(title)}</h3>
      ${hint ? `<p class="small muted">${esc(hint)}</p>` : ''}
      <div class="chips">${options.map((o) => chip(o, m[key] === o, { 'data-act': 'mapSet', 'data-arg': key + ':' + o })).join('')}</div>`;
    return screen(`
      <div class="pad stack">
        ${group('Distance', 'radius', ['Walkable', 'Short ride', 'Anywhere'], `From your location in ${s.user.area || 'West End'}. Walkable is under 2 km, a short ride is under 6 km.`)}
        ${group('Who\'s going', 'who', ['Anyone', 'Friends going', 'My party going'])}
        ${group('Interest', 'interest', ['Any', 'My vibes', 'Crew Blend', ...SQ.VIBES], 'My vibes uses your taste avatar. Crew Blend uses your party\'s shared taste.')}
        ${group('When', 'when', ['Any time', 'Tonight', 'This weekend'])}
        ${group('Price', 'price', ['Any price', 'Free', 'Under $20'])}
        ${btn(n ? `Show ${n} ${n === 1 ? 'quest' : 'quests'}` : 'No quests match', { 'data-back': '' })}
        <button class="link" data-act="mapClear">Clear all filters</button>
      </div>`, { title: 'Filters' });
  } };

  S.tickets = { role: 'attendee', render: (s) => {
    const q = quest(s, s.currentQuest);
    return screen(`
      <div class="pad stack center-text">
        ${ph('Host ticketing page (external)', 200)}
        <h2>Get your ticket</h2>
        <p class="muted">For the MVP, Sidequest hands off to the host's ticketing link. ${esc(q.title)} is now in your Quest Log.</p>
        ${btn('I have my ticket', { 'data-act': 'gotTicket' })}
        ${btn('Back to quest', { 'data-go': 'quest' }, 'secondary')}
      </div>`, { title: 'Tickets' });
  } };

  S.parties = { role: 'attendee', render: (s) => screen(`
    <div class="pad stack">
      <button class="card row" data-go="party">
        <span class="stack-tight left-text"><strong>${esc(s.party.name)}</strong>
          <span class="small">${avatars(['You', ...s.party.members])} You, ${esc(s.party.members.join(', '))}</span></span>
        <span aria-hidden="true">&rarr;</span>
      </button>
      ${btn('Create a party', { 'data-act': 'toast', 'data-arg': 'Creating more parties works like the one above.' }, 'secondary')}
    </div>`, { title: 'Parties', back: false, tabbar: tabs(ATTENDEE_TABS, 'parties') }) };

  S.party = { role: 'attendee', render: (s) => {
    const blend = SQ.crewBlend(s);
    const blendVibes = blend.map((b) => b.vibe);
    const picks = s.quests.filter((q) => !q.completed)
      .map((q) => ({ q, score: q.tags.filter((t) => blendVibes.includes(t)).length }))
      .sort((a, b) => b.score - a.score).slice(0, 2).map((x) => x.q);
    const pollIds = Object.keys(s.party.poll);
    return screen(`
      <div class="pad stack">
        <p class="small">${avatars(['You', ...s.party.members])} You, ${esc(s.party.members.join(', '))}</p>
        <section class="card stack">
          <h3>Crew Blend</h3>
          <p class="small muted">Everyone's tastes, merged into one.</p>
          ${blend.map((b) => `<div class="stack-tight"><div class="row"><span class="small">${esc(b.vibe)}</span><strong class="small">${Math.round(b.pct)}%</strong></div>${meter(b.pct)}</div>`).join('')}
        </section>
        <h3>Blended picks</h3>
        ${picks.map((q) => `<div class="row card"><span class="stack-tight left-text"><strong class="small">${esc(q.title)}</strong><span class="small muted">${esc(q.day)}, ${esc(q.time)}</span></span>
          ${chip(pollIds.includes(q.id) ? 'In vote' : 'Add to vote', pollIds.includes(q.id), { 'data-act': 'addToPoll', 'data-arg': q.id })}</div>`).join('')}
        <section class="card stack">
          <h3>Where are we going?</h3>
          ${pollIds.map((id) => { const q = quest(s, id); const mine = s.party.myVote === id; return `
            <button class="option${mine ? ' on' : ''}" data-act="vote" data-arg="${id}" aria-pressed="${mine}">
              <span>${esc(q.title)}</span><span class="small">${s.party.poll[id]} ${s.party.poll[id] === 1 ? 'vote' : 'votes'}</span></button>`; }).join('')}
          ${s.party.locked ? `<p class="small">Locked in: <strong>${esc(quest(s, s.party.locked).title)}</strong></p>` : btn('Lock it in', { 'data-act': 'lockPoll' })}
        </section>
        <section class="card stack">
          <h3>Party chat</h3>
          ${s.party.chat.slice(-3).map((m) => `<p class="small"><strong>${esc(m.from)}:</strong> ${esc(m.text)}</p>`).join('')}
          <div class="row gap"><input id="f-chat" class="grow" placeholder="Message your party" aria-label="Message your party">${btn('Send', { 'data-act': 'partyChat' }, 'secondary')}</div>
        </section>
      </div>`, { title: s.party.name });
  } };

  S.requests = { role: 'attendee', render: (s) => {
    const list = s.requests.slice().sort((a, b) => b.votes - a.votes);
    return screen(`
      <div class="pad stack">
        <p class="muted">Tell hosts what you want. Get first dibs when it happens.</p>
        ${btn('Request a quest', { 'data-go': 'request-new' })}
        <h3>Trending near you</h3>
        ${list.map((r) => `
          <div class="card row top">
            <button class="vote${r.voted ? ' on' : ''}" data-act="upvote" data-arg="${r.id}" aria-pressed="${r.voted}" aria-label="Upvote">&#9650;<span>${r.votes}</span></button>
            <span class="stack-tight grow left-text">
              <strong class="small">${esc(r.text)}</strong>
              <span class="small muted">${esc(r.area)}, ${esc(r.when)}. ${r.parties} parties interested${r.mine ? '. Your request' : ''}</span>
              <span>${requestStatus(r)}</span>
              ${r.status === 'live' && r.questId ? `<button class="link left-text" data-act="openQuest" data-arg="${r.questId}">See the quest</button>` : ''}
            </span>
          </div>`).join('')}
      </div>`, { title: 'Quest Requests', back: false, tabbar: tabs(ATTENDEE_TABS, 'requests') });
  } };

  S['request-new'] = { role: 'attendee', render: (s) => {
    const d = s.requestDraft || { area: 'West End', when: 'Fridays', size: '2 to 4' };
    return screen(`
      <div class="pad stack">
        <h2>I'd go to a...</h2>
        ${field('What kind of night?', 'f-req', d.text || 'Filipino indie night', 'text', 'Filipino indie night')}
        <h3>Where</h3>
        <div class="chips">${SQ.AREAS.slice(0, 4).map((a) => chip(a, d.area === a, { 'data-act': 'reqSet', 'data-arg': 'area:' + a })).join('')}</div>
        <h3>When</h3>
        <div class="chips">${['Weeknights', 'Fridays', 'Saturdays', 'Sundays'].map((w) => chip(w, d.when === w, { 'data-act': 'reqSet', 'data-arg': 'when:' + w })).join('')}</div>
        <h3>Who's coming</h3>
        <div class="chips">${['Solo', '2 to 4', '5+'].map((z) => chip(z, d.size === z, { 'data-act': 'reqSet', 'data-arg': 'size:' + z })).join('')}</div>
        ${btn('Post request', { 'data-act': 'postRequest' })}
      </div>`, { title: 'Request a quest' });
  } };

  S.notifications = { role: 'attendee', render: (s) => screen(`
    <div class="pad stack">
      ${s.notifications.length ? s.notifications.slice().reverse().map((n) => `
        <div class="card stack-tight${n.read ? '' : ' unread'}">
          <strong class="small">${esc(n.title)}</strong>
          <span class="small muted">${esc(n.body)}</span>
          ${n.questId ? `<button class="link left-text" data-act="openQuest" data-arg="${n.questId}">Open quest</button>` : ''}
        </div>`).join('') : empty('No notifications yet. Requests you post or upvote will show up here when a host picks them up.')}
    </div>`, { title: 'Notifications' }) };

  S.questlog = { role: 'attendee', render: (s) => {
    const tab = s.logTab;
    let list = [];
    if (tab === 'Upcoming') list = s.quests.filter((q) => q.accepted && !q.completed);
    if (tab === 'Saved') list = s.quests.filter((q) => q.saved && !q.completed);
    if (tab === 'Completed') list = s.quests.filter((q) => q.completed);
    const rowFor = (q) => `
      <div class="card stack">
        <div class="row"><span class="stack-tight left-text"><strong>${esc(q.title)}</strong><span class="small muted">${esc(q.day)}, ${esc(q.time)} in ${esc(q.area)}</span></span>
        ${q.rating ? `<span class="small">${'&#9733;'.repeat(q.rating)}</span>` : ''}</div>
        <div class="row gap">
          ${tab === 'Upcoming' ? btn('Event day mode', { 'data-act': 'openEventDay', 'data-arg': q.id }) : ''}
          ${tab === 'Completed' && !q.rating ? btn('Rate this quest', { 'data-act': 'openRate', 'data-arg': q.id }) : ''}
          ${btn('Details', { 'data-act': 'openQuest', 'data-arg': q.id }, 'secondary')}
        </div>
        ${tab === 'Upcoming' ? `<button class="link left-text" data-act="completeQuest" data-arg="${q.id}">Demo: skip to after the event</button>` : ''}
      </div>`;
    return screen(`
      <div class="pad stack">
        <div class="chips">${['Upcoming', 'Saved', 'Completed'].map((t) => chip(t, tab === t, { 'data-act': 'setLogTab', 'data-arg': t })).join('')}</div>
        ${list.length ? list.map(rowFor).join('') : empty(tab === 'Upcoming' ? 'No quests accepted yet.' : tab === 'Saved' ? 'Nothing saved yet.' : 'No completed quests yet.', btn('Find a quest', { 'data-go': 'discover' }, 'secondary'))}
      </div>`, { title: 'Quest Log', back: false, tabbar: tabs(ATTENDEE_TABS, 'questlog') });
  } };

  S.rate = { role: 'attendee', render: (s) => {
    const q = quest(s, s.currentQuest);
    const r = s.rating;
    return screen(`
      <div class="pad stack">
        <h2>How was ${esc(q.title)}?</h2>
        <div class="stars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) =>
          `<button class="star${n <= r.stars ? ' on' : ''}" data-act="setStars" data-arg="${n}" aria-label="${n} stars">&#9733;</button>`).join('')}</div>
        <h3>What made it?</h3>
        <div class="chips">${['The music', 'The crowd', 'The venue', 'My party', 'Easy to get to'].map((t) => chip(t, r.tags.includes(t), { 'data-act': 'toggleRateTag', 'data-arg': t })).join('')}</div>
        ${ph('Add a photo to your story', 110)}
        ${btn('Collect this story', { 'data-act': 'submitRating' })}
      </div>`, { title: 'Rate your quest' });
  } };

  S.eventday = { role: 'attendee', render: (s) => {
    const q = quest(s, s.currentQuest);
    const last = s.hostMessages[s.hostMessages.length - 1];
    return screen(`
      <div class="pad stack">
        <span class="badge solid">Event day, live</span>
        <h2>${esc(q.title)}</h2>
        <p><strong>Doors open in 42 min</strong></p>
        <div class="venue-map" aria-label="Venue map">
          <span class="zone stage">Stage</span><span class="zone bar-z">Bar</span><span class="zone coats">Coats</span>
          <span class="zone door">Entrance</span>
          <span class="pin you" title="You">You</span><span class="pin p1" title="Maya">M</span><span class="pin p2" title="Jordan">J</span>
        </div>
        <div class="card stack-tight"><strong class="small">Entrance</strong><span class="small muted">${esc(q.dayInfo.entrance)}</span></div>
        <div class="card stack-tight"><strong class="small">Getting there</strong><span class="small muted">${esc(q.dayInfo.transit)}</span></div>
        <div class="card stack-tight"><strong class="small">Getting home</strong><span class="small muted">${esc(q.dayInfo.home)}</span></div>
        <div class="card stack-tight"><strong class="small">Host update</strong><span class="small muted">${esc(last ? last.text : q.dayInfo.coat)}</span></div>
        <div class="row gap">
          ${btn('Group chat', { 'data-go': 'eventday-chat' }, 'secondary')}
          ${btn('Find my party', { 'data-act': 'findParty' })}
        </div>
      </div>`, { title: 'Event day' });
  } };

  S['eventday-chat'] = { role: 'attendee', render: (s) => screen(`
    <div class="pad stack">
      <p class="small muted">Everyone with a ticket to ${esc(quest(s, s.currentQuest).title)}. The host can moderate.</p>
      ${s.eventChat.map((m) => `<p class="bubble${m.from === 'You' ? ' mine' : ''}"><strong>${esc(m.from)}</strong> ${esc(m.text)}</p>`).join('')}
      <div class="row gap"><input id="f-echat" class="grow" placeholder="Say hi" aria-label="Message attendees">${btn('Send', { 'data-act': 'eventChat' }, 'secondary')}</div>
    </div>`, { title: 'Attendee chat' }) };

  S.profile = { role: 'attendee', render: (s) => {
    const stories = s.quests.filter((q) => q.completed);
    return screen(`
      <div class="pad stack">
        <div class="row"><span class="row gap"><span class="avatar-md" aria-hidden="true"></span><span class="stack-tight left-text"><strong>${esc(s.user.name || 'Alex')}</strong><span class="small muted">${stories.length} stories collected, following ${s.user.following.length} hosts</span></span></span></div>
        <section class="card stack">
          <h3>Taste avatar</h3>
          <p class="small muted">Tap to edit what it has learned.</p>
          <div class="chips">${SQ.VIBES.map((v) => chip(v, s.user.vibes.includes(v), { 'data-act': 'toggleVibe', 'data-arg': v })).join('')}</div>
        </section>
        <h3>Collected stories</h3>
        <div class="grid2">${stories.length ? stories.map((q) => `<div class="story">${ph('Photo', 90)}<span class="small">${esc(q.title)}</span><span class="small">${q.rating ? '&#9733;'.repeat(q.rating) : 'Not rated'}</span></div>`).join('') : '<p class="small muted">Rate a completed quest to collect it.</p>'}</div>
        ${btn(s.host.registered ? 'Switch to host profile' : 'Become a host', { 'data-go': s.host.registered ? 'host-dashboard' : 'host-type' }, 'secondary')}
      </div>`, { title: 'Profile', back: false, tabbar: tabs(ATTENDEE_TABS, 'profile') });
  } };

  /* ===== Host registration ===== */
  S['host-type'] = { role: 'host', render: (s) => screen(`
    <div class="pad stack">
      ${progress(1, 6)}
      <h2>What kind of host are you?</h2>
      ${SQ.HOST_TYPES.map(([t, d]) => `
        <button class="option${s.host.type === t ? ' on' : ''}" data-act="hostType" data-arg="${esc(t)}" aria-pressed="${s.host.type === t}">
          <span class="stack-tight left-text"><strong>${esc(t)}</strong><span class="small muted">${esc(d)}</span></span></button>`).join('')}
      ${btn('Continue', { 'data-act': 'hostTypeNext' })}
    </div>`, { title: 'Host a quest' }) };

  S['host-account'] = { role: 'host', render: (s) => screen(`
    <div class="pad stack">
      ${progress(2, 6)}
      <h2>Account basics</h2>
      ${field('Host or venue name', 'h-name', s.host.name, 'text', 'The Garrison')}
      ${field('Work email', 'h-email', s.host.email, 'email', 'events@venue.com')}
      ${field('Password', 'h-pass', '', 'password', '8+ characters')}
      ${s.user.registered ? '<p class="small muted">You can also link this to your attendee account and switch between the two.</p>' : ''}
      ${btn('Continue', { 'data-act': 'hostAccount' })}
    </div>`, { title: 'Host account' }) };

  S['host-profile'] = { role: 'host', render: (s) => screen(`
    <div class="pad stack">
      ${progress(3, 6)}
      <h2>Your host profile</h2>
      ${ph('Upload logo', 90)}
      ${area('Bio', 'h-bio', s.host.bio, 'A 200-cap room for late-night electronic music.')}
      <h3>Your vibes</h3>
      <div class="chips">${SQ.VIBES.map((v) => chip(v, s.host.vibes.includes(v), { 'data-act': 'toggleHostVibe', 'data-arg': v })).join('')}</div>
      <h3>Neighbourhood</h3>
      <div class="chips">${SQ.AREAS.map((a) => chip(a, s.host.area === a, { 'data-act': 'setHostArea', 'data-arg': a })).join('')}</div>
      ${field('Instagram or website', 'h-social', '', 'text', '@thegarrison')}
      ${btn('Continue', { 'data-act': 'hostProfile' })}
    </div>`, { title: 'Profile' }) };

  S['host-verify'] = { role: 'host', render: (s) => screen(`
    <div class="pad stack">
      ${progress(4, 6)}
      <h2>Get verified</h2>
      <p class="muted">Verified hosts keep Sidequest trustworthy for attendees.</p>
      ${field('Business or organization number', 'h-biz', '', 'text', 'Optional for artists and community groups')}
      ${field('Links to past events', 'h-past', '', 'text', 'Instagram posts, ticket pages')}
      ${s.host.type === 'Venue' ? field('Venue address', 'h-addr', '', 'text', '1197 Dundas St W') + field('Capacity', 'h-cap', '', 'number', '200') : ''}
      ${ph('Upload proof (licence, lease, or press)', 80)}
      ${btn('Continue', { 'data-go': 'host-ticketing' })}
    </div>`, { title: 'Verification' }) };

  S['host-ticketing'] = { role: 'host', render: (s) => screen(`
    <div class="pad stack">
      ${progress(5, 6)}
      <h2>How do you sell tickets?</h2>
      <p class="muted">For now, Sidequest links out to your existing ticketing.</p>
      ${['Eventbrite', 'DICE', 'My own website', 'Guest list only'].map((t) => `
        <button class="option${s.host.ticketing === t ? ' on' : ''}" data-act="setTicketing" data-arg="${esc(t)}" aria-pressed="${s.host.ticketing === t}"><span>${esc(t)}</span></button>`).join('')}
      ${field('Default ticket link', 'h-link', s.host.ticketLink, 'url', 'https://')}
      ${btn('Continue', { 'data-act': 'hostTicketing' })}
    </div>`, { title: 'Ticketing' }) };

  S['host-team'] = { role: 'host', render: (s) => screen(`
    <div class="pad stack">
      ${progress(6, 6)}
      <h2>Invite your team</h2>
      ${s.host.team.map((m, i) => `
        <div class="card stack">
          ${field('Email', 'h-team-' + i, m.email, 'email', 'teammate@venue.com')}
          <div class="chips">${['Owner', 'Editor', 'Door staff'].map((r) => chip(r, m.role === r, { 'data-act': 'setRole', 'data-arg': i + ':' + r })).join('')}</div>
        </div>`).join('')}
      ${btn('Add another', { 'data-act': 'addTeam' }, 'secondary')}
      ${btn('Submit for review', { 'data-act': 'submitHost' })}
      <button class="link" data-act="submitHost">Skip and submit</button>
    </div>`, { title: 'Team' }) };

  S['host-pending'] = { role: 'host', render: (s) => {
    const approved = s.host.verification === 'approved';
    return screen(`
      <div class="pad stack">
        <h2>${approved ? 'You\'re approved' : 'Thanks, we\'re reviewing your profile'}</h2>
        <ol class="timeline">
          <li class="done">Submitted</li>
          <li class="${approved ? 'done' : 'current'}">In review (usually 1 to 2 days)</li>
          <li class="${approved ? 'done' : ''}">Approved</li>
        </ol>
        <p class="muted small">You can set up draft quests while you wait. They go live once you're approved.</p>
        ${approved ? btn('Go to dashboard', { 'data-go': 'host-dashboard' }) : btn('Demo: approve this host', { 'data-act': 'approveHost' })}
      </div>`, { title: 'Review' });
  } };

  /* ===== Host features ===== */
  S['host-dashboard'] = { role: 'host', render: (s) => {
    const mine = s.quests.filter((q) => q.host === hostName(s));
    const accepts = 380 + mine.filter((q) => q.accepted).length * 12;
    const matches = s.requests.filter((r) => r.status === 'open' && (r.area === s.host.area || s.host.vibes.some((v) => r.text.toLowerCase().includes(v.toLowerCase().split(' ')[0])))).slice(0, 2);
    const open = matches.length ? matches : s.requests.filter((r) => r.status === 'open').slice(0, 2);
    return screen(`
      <div class="pad stack">
        <div class="row"><span class="stack-tight left-text"><strong class="big">${esc(hostName(s))}</strong><span class="small muted">${esc(s.host.type || 'Venue')}${s.host.verification === 'approved' ? ', verified' : ''}</span></span></div>
        <div class="stats">
          <div class="stat"><strong>1.2k</strong><span class="small">Saves</span></div>
          <div class="stat"><strong>${accepts}</strong><span class="small">Accepts</span></div>
          <div class="stat"><strong>37</strong><span class="small">Parties</span></div>
        </div>
        <h3>Requests matching your vibe</h3>
        ${open.length ? open.map((r) => `
          <button class="card row" data-act="openRequest" data-arg="${r.id}">
            <span class="stack-tight left-text"><strong class="small">${esc(r.text)}</strong><span class="small muted">${r.votes} requesters, ${esc(r.area)}</span></span><span aria-hidden="true">&rarr;</span></button>`).join('') : empty('No open requests right now.')}
        <h3>Your quests</h3>
        ${mine.length ? mine.map((q) => `<div class="row card"><span class="small">${esc(q.title)}</span><span class="small muted">${esc(q.day)}</span></div>`).join('') : '<p class="small muted">No quests yet.</p>'}
        ${btn('Create a quest', { 'data-act': 'newDraft' })}
      </div>`, { title: 'Dashboard', back: false, tabbar: tabs(HOST_TABS, 'host-dashboard') });
  } };

  S['host-quests'] = { role: 'host', render: (s) => {
    const mine = s.quests.filter((q) => q.host === hostName(s));
    return screen(`
      <div class="pad stack">
        ${btn('Create a quest', { 'data-act': 'newDraft' })}
        ${mine.length ? mine.map((q) => `
          <div class="card stack">
            <div class="row"><strong>${esc(q.title)}</strong><span class="badge">${q.completed ? 'Past' : 'Live'}</span></div>
            <span class="small muted">${esc(q.day)}, ${esc(q.time)}. ${esc(q.price)}</span>
            <div class="row gap">
              ${q.completed ? btn('View recap', { 'data-act': 'openRecap', 'data-arg': q.id }, 'secondary') : btn('Event day tools', { 'data-act': 'openCheckin', 'data-arg': q.id }, 'secondary')}
              ${btn('Duplicate', { 'data-act': 'duplicate', 'data-arg': q.id }, 'secondary')}
            </div>
          </div>`).join('') : empty('You haven\'t published a quest yet.')}
      </div>`, { title: 'Quests', back: false, tabbar: tabs(HOST_TABS, 'host-quests') });
  } };

  S['host-create'] = { role: 'host', render: (s) => {
    const d = s.draft || {};
    const r = d.fromRequest ? request(s, d.fromRequest) : null;
    return screen(`
      <div class="pad stack">
        ${r ? `<div class="card stack-tight"><strong class="small">Linked to a Quest Request</strong><span class="small muted">"${esc(r.text)}". ${r.votes} requesters will be notified first.</span></div>` : ''}
        ${ph('Upload poster or video', 120)}
        ${field('Title', 'd-title', d.title || '', 'text', 'Name your quest')}
        <h3>Day</h3>
        <div class="chips">${SQ.DAYS.map((x) => chip(x, d.day === x, { 'data-act': 'draftSet', 'data-arg': 'day:' + x })).join('')}</div>
        <div class="row gap">${field('Start time', 'd-time', d.time || '', 'text', '10 PM')}${field('Price', 'd-price', d.price || '', 'text', '$20 or Free')}</div>
        <h3>Vibe tags</h3>
        <div class="chips">${SQ.VIBES.map((v) => chip(v, (d.tags || []).includes(v), { 'data-act': 'draftTag', 'data-arg': v })).join('')}</div>
        ${btn('Next: event day info', { 'data-act': 'draftNext' })}
      </div>`, { title: 'Create a quest' });
  } };

  S['host-create-dayinfo'] = { role: 'host', render: (s) => {
    const d = (s.draft && s.draft.dayInfo) || SQ.defaultDayInfo();
    return screen(`
      <div class="pad stack">
        <p class="muted">This powers the attendee's event day mode.</p>
        ${ph('Upload venue map', 100)}
        ${field('Entrance', 'd-entrance', d.entrance)}
        ${field('Transit tip', 'd-transit', d.transit)}
        ${field('Getting home', 'd-home', d.home)}
        ${field('Coat check and re-entry', 'd-coat', d.coat)}
        ${field('Ticket link', 'd-link', s.host.ticketLink || '', 'url', 'https://')}
        ${btn('Publish now', { 'data-act': 'publish' })}
        ${btn('Schedule for later', { 'data-act': 'toast', 'data-arg': 'Scheduling works like publishing, with a date picker.' }, 'secondary')}
      </div>`, { title: 'Event day info' });
  } };

  S['host-published'] = { role: 'host', render: (s) => {
    const q = quest(s, s.lastPublished);
    const r = q.fromRequest ? request(s, q.fromRequest) : null;
    return screen(`
      <div class="pad stack center-text">
        <div class="avatar-xl" aria-hidden="true"></div>
        <h2>Published</h2>
        <p class="muted">${esc(q.title)} is live. We're matching it to people and parties whose taste fits.</p>
        <div class="card stack left-text">
          <div class="row"><span class="small">Matched attendees</span><strong>1,480</strong></div>
          <div class="row"><span class="small">Matched parties</span><strong>212</strong></div>
          ${r ? `<div class="row"><span class="small">Requesters notified first</span><strong>${r.votes}</strong></div>` : ''}
        </div>
        ${btn('See it as an attendee', { 'data-act': 'viewAsAttendee' })}
        ${btn('Back to dashboard', { 'data-go': 'host-dashboard' }, 'secondary')}
      </div>`, { title: 'Quest published', back: false });
  } };

  S['host-demand'] = { role: 'host', render: (s) => {
    const heat = [[1, 2, 1, 3, 5, 6, 2], [1, 1, 2, 4, 5, 6, 2], [0, 1, 1, 2, 3, 4, 1]];
    const list = s.requests.filter((r) => s.demandArea === 'All' || r.area === s.demandArea).sort((a, b) => b.votes - a.votes);
    return screen(`
      <div class="pad stack">
        <div class="chips">${['All', 'West End', 'Downtown', 'East End'].map((a) => chip(a, s.demandArea === a, { 'data-act': 'setDemandArea', 'data-arg': a })).join('')}</div>
        <section class="card stack">
          <h3>When people want to go out</h3>
          <div class="heat" aria-label="Demand heatmap by day">${heat.map((row) => row.map((v) => `<span style="opacity:${0.12 + v * 0.14}"></span>`).join('')).join('')}</div>
          <div class="heat-days">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span>${d}</span>`).join('')}</div>
          <p class="small muted">Requests peak Friday and Saturday, strongest in the West End.</p>
        </section>
        <h3>Requests</h3>
        ${list.map((r) => `
          <button class="card row" data-act="openRequest" data-arg="${r.id}">
            <span class="stack-tight left-text"><strong class="small">${esc(r.text)}</strong><span class="small muted">${r.votes} requesters, ${r.parties} parties, ${esc(r.area)}</span>${requestStatus(r)}</span><span aria-hidden="true">&rarr;</span>
          </button>`).join('')}
      </div>`, { title: 'Demand Insights', back: false, tabbar: tabs(HOST_TABS, 'host-demand') });
  } };

  S['host-request'] = { role: 'host', render: (s) => {
    const r = request(s, s.currentRequest);
    const mineClaim = r.claimedBy === hostName(s);
    return screen(`
      <div class="pad stack">
        ${requestStatus(r)}
        <h2>${esc(r.text)}</h2>
        <p class="muted">${esc(r.area)}, ${esc(r.when)}. Mostly groups of ${esc(r.size)}.</p>
        <div class="stats">
          <div class="stat"><strong>${r.votes}</strong><span class="small">Requesters</span></div>
          <div class="stat"><strong>${r.parties}</strong><span class="small">Parties</span></div>
          <div class="stat"><strong>71%</strong><span class="small">Also like techno</span></div>
        </div>
        ${r.status === 'open' ? btn('Claim this request', { 'data-act': 'claim' }) : ''}
        ${r.status === 'claimed' && !mineClaim ? `<p class="small muted">Already claimed by ${esc(r.claimedBy)}. You can still host something similar.</p>` : ''}
        ${mineClaim && r.status === 'claimed' ? btn('Create a quest from this request', { 'data-act': 'draftFromRequest' }) : ''}
        ${r.status === 'live' ? '<p class="small">You fulfilled this request.</p>' : ''}
      </div>`, { title: 'Request' });
  } };

  S['host-audience'] = { role: 'host', render: () => screen(`
    <div class="pad stack">
      <div class="stats">
        <div class="stat"><strong>2,310</strong><span class="small">Followers</span></div>
        <div class="stat"><strong>34%</strong><span class="small">Come back</span></div>
      </div>
      <section class="card stack">
        <h3>Taste segments</h3>
        ${[['Underground techno', 62], ['Indie gigs', 41], ['Art openings', 28]].map(([l, p]) => `<div class="stack-tight"><div class="row"><span class="small">${l}</span><strong class="small">${p}%</strong></div>${meter(p)}</div>`).join('')}
        <p class="small muted">Aggregated and anonymized. No individual profiles.</p>
      </section>
      <section class="card stack">
        <h3>How people come</h3>
        <div class="stack-tight"><div class="row"><span class="small">With a party</span><strong class="small">58%</strong></div>${meter(58)}</div>
        <div class="stack-tight"><div class="row"><span class="small">Solo</span><strong class="small">42%</strong></div>${meter(42)}</div>
      </section>
    </div>`, { title: 'Audience', back: false, tabbar: tabs(HOST_TABS, 'host-audience') }) };

  S['host-messages'] = { role: 'host', render: (s) => screen(`
    <div class="pad stack">
      ${area('Announcement', 'm-text', '', 'Coat check is cash only tonight.')}
      <div class="chips">${['Tonight\'s attendees', 'Ticket holders', 'Followers'].map((a, i) => chip(a, i === 0, { 'data-act': 'toast', 'data-arg': 'Audience picker. Tonight\'s attendees is selected for the demo.' })).join('')}</div>
      ${btn('Send update', { 'data-act': 'hostMessage' })}
      <h3>Sent</h3>
      ${s.hostMessages.length ? s.hostMessages.slice().reverse().map((m) => `<div class="card small">${esc(m.text)}</div>`).join('') : '<p class="small muted">Nothing sent yet.</p>'}
      ${btn('Moderate attendee chat', { 'data-act': 'toast', 'data-arg': 'Hosts can pin, hide, or mute messages in the attendee chat.' }, 'secondary')}
    </div>`, { title: 'Inbox', back: false, tabbar: tabs(HOST_TABS, 'host-messages') }) };

  S['host-checkin'] = { role: 'host', render: (s) => {
    const q = quest(s, s.currentQuest);
    const inCount = s.guests.filter((g) => g.in).length;
    return screen(`
      <div class="pad stack">
        <h2>${esc(q.title)}</h2>
        <div class="stack-tight"><div class="row"><span class="small">Headcount</span><strong class="small">${inCount + 140} / 200</strong></div>${meter(((inCount + 140) / 200) * 100)}</div>
        ${btn('Scan tickets', { 'data-act': 'toast', 'data-arg': 'Opens the camera to scan tickets. Out of scope for the wireframe.' }, 'secondary')}
        <h3>Guest list</h3>
        ${s.guests.map((g, i) => `<div class="row card"><span class="small">${esc(g.name)}${g.party ? ` <span class="muted">(${esc(g.party)})</span>` : ''}</span>${chip(g.in ? 'Checked in' : 'Check in', g.in, { 'data-act': 'checkin', 'data-arg': i })}</div>`).join('')}
        ${btn('Push a live update', { 'data-go': 'host-messages' })}
        <button class="link" data-act="endEvent">Demo: end the event</button>
      </div>`, { title: 'Event day tools' });
  } };

  S['host-recap'] = { role: 'host', render: (s) => {
    const q = quest(s, s.currentQuest);
    const fulfilled = s.requests.filter((r) => r.status === 'live' && r.claimedBy === hostName(s)).length;
    return screen(`
      <div class="pad stack">
        <h2>${esc(q.title)} recap</h2>
        <div class="stats">
          <div class="stat"><strong>${140 + s.guests.filter((g) => g.in).length}</strong><span class="small">Attended</span></div>
          <div class="stat"><strong>${q.rating ? q.rating + '.0' : '4.6'}</strong><span class="small">Avg rating</span></div>
          <div class="stat"><strong>${fulfilled}</strong><span class="small">Requests fulfilled</span></div>
        </div>
        <section class="card stack">
          <h3>What people said</h3>
          <p class="small">"The music" and "My party" were the top reasons people loved it.</p>
          ${q.rating ? `<p class="small muted">Newest rating: ${'&#9733;'.repeat(q.rating)} from an attendee who requested this quest.</p>` : ''}
        </section>
        ${btn('Invite attendees to follow you', { 'data-act': 'toast', 'data-arg': 'Invites sent to attendees who rated 4 stars or more.' })}
        ${btn('Plan the next one', { 'data-act': 'newDraft' }, 'secondary')}
      </div>`, { title: 'Recap' });
  } };

  SQ.screens = S;
  SQ.ui = { esc };
})();
