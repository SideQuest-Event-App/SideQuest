// Sidequest wireframe · onboarding: shared welcome, then an attendee path or a host path.
'use strict';
// =========================================================================
// Onboarding: shared welcome, then an attendee path or a host path
// =========================================================================
const PAST_CHOICES = [
  { id: 'p-jazz', title: 'A jazz night', scene: 'live' }, { id: 'p-market', title: 'A night market', scene: 'markets' },
  { id: 'p-comedy', title: 'A comedy show', scene: 'comedy' }, { id: 'p-workshop', title: 'A weekend workshop', scene: 'art' },
  { id: 'p-gallery', title: 'A gallery opening', scene: 'art' }, { id: 'p-trivia', title: 'Pub trivia', scene: 'games' },
];
// Team notes: let independent hosts register (house parties, casual meetups), and add "Other" with a text box.
const HOST_TYPES = [
  ['venue', 'Venue', 'A bar, club, gallery or space people come back to'],
  ['promoter', 'Promoter or organizer', 'Parties, pop-ups, markets and shows at other venues'],
  ['collective', 'Artist or collective', 'You perform, DJ or curate'],
  ['community', 'Community group', 'Clubs and meetups organized around a cause or interest'],
  ['independent', 'Independent host', 'House parties, casual meetups, no organization needed'],
  ['other', 'Other', 'Tell us in your own words'],
];
// "Top 10 most common" vibes first, then a searchable longer list.
const MORE_VIBES = ['Jazz', 'Techno', 'Indie gigs', 'Live R&B', 'Karaoke', 'Run clubs', 'Supper clubs', 'Board games', 'Pottery', 'Vintage', 'Drag shows', 'Poetry nights', 'Salsa', 'Book clubs', 'Hikes', 'Film photography'];
const SOCIALS = ['Instagram', 'TikTok', 'Website', 'Facebook', 'X'];
const VERIFY_OPTS = [
  ['ig', 'Instagram business account', 'Fastest. We check it matches your listings.'],
  ['biz', 'Business number', 'For registered venues and companies.'],
  ['site', 'Website or ticket page', 'We confirm you can edit it.'],
];
const FLOWS = { start: ['welcome', 'role'], attendee: ['signup', 'sixer', 'scenes', 'past', 'times', 'areas', 'crew', 'build'], host: ['htype', 'haccount', 'verify', 'hprofile', 'ticketing', 'team', 'claim', 'review', 'hbuild'] };
const O = { flow: 'start', i: 0, hostType: 'promoter', hostOther: '', verified: null, verifying: false, hostName: 'Loop Collective', link: 'tickets.loopcollective.example', hostScenes: new Set(['live', 'markets', 'dance']), hostAreas: new Set(['Ossington', 'Distillery', 'Downtown']), claims: new Set(['rooftop', 'distillery', 'vinyl']), agePolicy: 'all', just: null,
  vibeQ: '', tagQ: '', socials: [['Instagram', '@loopcollective']], ticketing: 'DICE', team: [['priya@loopcollective.example', 'Owner'], ['', 'Marketing']], approved: false, imported: new Set(), contactsIn: false };
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
      <div class="eyebrow st" style="--i:1;color:var(--paper)">Sidequest</div>
      <h1 class="words" style="margin-top:12px">${words('Your next <span class="hl">side</span> <span class="hl">quest</span> in Toronto.')}</h1>
      <p class="sub st" style="--i:6">Markets, workshops, live sets, food pop-ups and more. Solo, with friends or with family.</p>
      <div class="slide-btn glass st" style="--i:7;margin-top:28px" id="slide" role="button" tabindex="0" aria-label="Start exploring"><div class="knob">${icon('arrow')}</div><div class="label">Slide to explore <span class="chev"><span>›</span><span>›</span><span>›</span></span></div></div>
      <button class="login-link st" style="--i:8" data-a="onb-login">Already have an account? <b>Log in</b></button>`;
  } else if (name === 'role') {
    bg = glowBg();
    body = `${onbProgress()}<h1 class="words" style="margin-top:26px;font-size:40px">${words('How are you using <span class="hl">Sidequest?</span>')}</h1>
      <div style="flex:1;display:grid;gap:12px;align-content:center;margin-top:18px">
        <button class="role-card a st" style="--i:3" data-a="onb-role" data-v="attendee"><div><h2>I'm going out</h2><p>Quests picked for you and your party, every week.</p></div><span class="arrow">${icon('arrow')}</span></button>
        <button class="role-card b st" style="--i:4" data-a="onb-role" data-v="host"><div><h2>I host events</h2><p>See what Toronto wants before you book.</p></div><span class="arrow">${icon('arrow')}</span></button>
      </div><p class="note st" style="--i:5;text-align:center;margin-top:14px">One login for both. Switch between accounts anytime from your profile.</p>
      <button class="login-link st" style="--i:6" data-a="onb-login">Already have an account? <b>Log in</b></button>`;
  } else if (name === 'signup') {
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Create your <span class="hl">account.</span>')}</h1>
      <div class="onb-scroll"><div class="verify" style="margin-bottom:16px"><button class="st" style="--i:2" data-a="onb-next"><div class="grow" style="font-weight:700;text-align:center">Continue with Apple</div></button><button class="st" style="--i:3" data-a="onb-next"><div class="grow" style="font-weight:700;text-align:center">Continue with Google</div></button></div>
        <div class="divider st" style="--i:4"><span>or with email</span></div>
        ${[['Name', 'Alex', 'text'], ['Username', '@' + S.username, 'text'], ['Email', 'alex@email.com', 'email'], ['Phone · optional', '', 'tel'], ['Password', '', 'password']].map(([l, v, t], k) => `<label class="lab-in st" style="--i:${5 + k}"><span>${l}</span><input class="text-in" type="${t}" value="${esc(v)}" placeholder="${t === 'password' ? '8+ characters' : t === 'tel' ? 'For finding friends' : ''}"></label>`).join('')}
        <p class="note st" style="--i:10;margin-top:10px">Your username is how friends find you and how you show up in attendee chats.</p></div>
      ${foot('onb-next', { label: 'Create account' })}`;
  } else if (name === 'sixer') {
    bg = glowBg();
    body = `${onbProgress()}<div style="flex:1;display:grid;place-items:center"><span class="orb st" style="--s:150px;--i:1"></span></div>
      <h1 class="words">${words('Hi, I\'m <span class="hl">Sixer.</span>')}</h1>
      <p class="sub st" style="--i:3">I'm your taste avatar. I learn what you're into from the vibes you pick, what you bookmark and where you actually go. I'll always tell you why I picked something.</p>
      ${foot('onb-next', { label: 'Nice to meet you' })}`;
  } else if (name === 'scenes') {
    const q = O.vibeQ.trim().toLowerCase();
    const tiles = SCENE_KEYS.filter((s) => !q || SCENES[s].label.toLowerCase().includes(q));
    const more = MORE_VIBES.filter((v) => !q || v.toLowerCase().includes(q));
    const n = S.scenes.size + S.extraVibes.size;
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('What kind of quests are you <span class="hl">after?</span>')}</h1><p class="sub st" style="--i:2">Pick at least two. The top 10 most picked come first.</p>
      <div class="search-in st" style="--i:3;margin-top:14px">${icon('search')}<input id="o-vibeq" value="${esc(O.vibeQ)}" placeholder="Search vibes" aria-label="Search vibes" data-live="o-vibeq"></div>
      <div class="onb-scroll"><div class="scene-grid">${tiles.map((s, k) => `<button class="scene-tile st ${S.scenes.has(s) ? 'on' : ''} ${O.just === s ? 'just' : ''}" style="--i:${3 + k}" data-a="onb-scene" data-v="${s}" aria-pressed="${S.scenes.has(s)}">${poster('scene' + s, s, `<span class="tick">${S.scenes.has(s) ? icon('check') : icon('plus')}</span><h3>${esc(SCENES[s].label)}</h3>`)}</button>`).join('')}</div>
        ${more.length ? `<div class="eyebrow" style="margin:22px 0 10px">More vibes</div><div class="chips" style="padding:0;flex-wrap:wrap">${more.map((v) => `<button class="chip ${S.extraVibes.has(v) ? 'on' : ''}" data-a="onb-xvibe" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>` : ''}
        ${!tiles.length && !more.length ? `<p class="muted" style="margin-top:12px">No vibe called "${esc(O.vibeQ)}" yet. Sixer will learn it from what you bookmark.</p>` : ''}</div>
      ${foot('onb-next', { disabled: n < 2, label: `Continue · ${n} picked` })}`;
  } else if (name === 'past') {
    // Team notes: past quests seed taste; also import tickets for upcoming events. Eventbrite blocks imports.
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Quests you\'ve <span class="hl">been</span> <span class="hl">to</span>')}</h1><p class="sub st" style="--i:2">These seed Sixer so your first picks aren't generic.</p>
      <div class="search-in st" style="--i:3;margin-top:14px">${icon('search')}<input placeholder="Search by event or venue" aria-label="Search past events"></div>
      <div class="onb-scroll"><div class="chips" style="padding:0;flex-wrap:wrap">${PAST_CHOICES.map((p) => `<button class="chip ${S.pastEvents.has(p.id) ? 'on' : ''}" data-a="onb-past" data-v="${p.id}">${esc(p.title)}</button>`).join('')}</div>
        <div class="eyebrow" style="margin:24px 0 10px">Got tickets for something coming up?</div>
        <div class="verify">${[['DICE', 'Imports past and upcoming tickets'], ['Ticketmaster', 'Imports upcoming tickets'], ['Apple Wallet', 'Any pass you saved']].map(([k, d]) => `<button class="${O.imported.has(k) ? 'on' : ''}" data-a="onb-import" data-v="${k}"><div class="grow"><div style="font-weight:700">${k}</div><div class="muted" style="font-size:13px">${d}</div></div>${O.imported.has(k) ? `<span class="pill hot">${icon('check')}Connected</span>` : icon('arrow')}</button>`).join('')}</div>
        <p class="note" style="margin-top:10px">Eventbrite doesn't let other apps import tickets. Upload a screenshot later instead.</p></div>
      ${foot('onb-next', { label: S.pastEvents.size || O.imported.size ? 'Continue' : 'Skip for now' })}`;
  } else if (name === 'times') {
    const cards = [['morning', 'sun', 'Markets, runs, brunch'], ['afternoon', 'sunset', 'Workshops, parks, matinees'], ['evening', 'moon', 'Shows, dinners, talks'], ['late', 'spark', 'Late sets and parties']];
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('When do you like to <span class="hl">go</span> <span class="hl">out?</span>')}</h1><p class="sub st" style="--i:3">Day or night, weekday or weekend. Pick any.</p>
      <div class="chips st" style="--i:3;padding:0;margin-top:14px">${[['weekday', 'Weekdays'], ['weekend', 'Weekends']].map(([k, l]) => `<button class="chip ${S.days.has(k) ? 'on' : ''}" data-a="onb-day" data-v="${k}" aria-pressed="${S.days.has(k)}">${l}</button>`).join('')}</div>
      <div class="onb-scroll"><div class="verify">${cards.map(([k, ic, d], j) => `<button class="st ${S.times.has(k) ? 'on' : ''}" style="--i:${4 + j}" data-a="onb-time" data-v="${k}" aria-pressed="${S.times.has(k)}"><span class="icon-btn" style="background:${S.times.has(k) ? 'var(--accent)' : 'var(--surface-2)'};color:${S.times.has(k) ? 'var(--ink)' : 'var(--paper)'}">${icon(ic)}</span><div class="grow"><div style="font-weight:700;font-size:17px">${TIMES[k]}</div><div class="muted" style="font-size:13.5px">${d}</div></div>${S.times.has(k) ? `<span class="pill hot">${icon('check')}</span>` : ''}</button>`).join('')}</div>
        <p class="note st" style="--i:8;margin-top:14px">Most events are all ages. If one is 19+, we'll ask you then, not now.</p></div>
      ${foot('onb-next', { disabled: !S.times.size || !S.days.size })}`;
  } else if (name === 'areas') {
    const pts = AREA_KEYS.map((a) => { const on = S.areas.has(a) || a === HOME; return `<circle cx="${AREAS[a][0]}" cy="${AREAS[a][1]}" r="${a === HOME ? 9 : on ? 7 : 3}" fill="${a === HOME ? C.paper : on ? C.accent : 'rgba(26,26,26,.25)'}"/>${on && a !== HOME ? `<circle cx="${AREAS[a][0]}" cy="${AREAS[a][1]}" r="7" fill="none" stroke="${C.accent}" stroke-width="1.5"><animate attributeName="r" from="7" to="20" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" from=".8" to="0" dur="1.8s" repeatCount="indefinite"/></circle>` : ''}`; }).join('');
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Which areas do you <span class="hl">frequent?</span>')}</h1><p class="sub st" style="--i:3">Home is Ossington in this demo. Add the parts of the city you'd happily head to.</p>
      <div class="onb-scroll"><div class="area-map st" style="--i:4">${baseMapSvg(pts).replace(/viewBox="[^"]*"/, 'viewBox="20 90 340 250"')}</div>
        <div class="chips st" style="--i:5;padding:0;flex-wrap:wrap">${AREA_KEYS.filter((a) => a !== HOME).map((a) => `<button class="chip ${S.areas.has(a) ? 'on' : ''}" data-a="onb-area" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div></div>
      ${foot('onb-next')}`;
  } else if (name === 'crew') {
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Assemble your <span class="hl">party.</span>')}</h1><p class="sub st" style="--i:2">Crew Blend finds the quest everyone will love. Friends see group picks, never your full taste profile.</p>
      <div class="search-in st" style="--i:3;margin-top:14px">${icon('search')}<input placeholder="Find people by email, phone or username" aria-label="Find people"></div>
      <div class="onb-scroll"><button class="btn ghost block st" style="--i:3;margin-bottom:10px" data-a="onb-contacts">${icon('crew')}${O.contactsIn ? '5 friends found in your contacts' : 'Import contacts'}</button>
        ${O.contactsIn ? FRIENDS.map((f, k) => `<div class="person-row st" style="--i:${4 + k}">${avatar(f)}<div class="grow"><div style="font-weight:700">${esc(PEOPLE[f].name)}</div><div class="muted" style="font-size:13px">In your contacts</div></div>${S.crewOn ? `<span class="pill hot">${icon('check')}Invited</span>` : ''}</div>`).join('') : '<p class="note">We only match contacts who are already on Sidequest. Nobody is messaged without you.</p>'}</div>
      <div class="onb-foot st" style="--i:8">${S.crewOn && O.contactsIn ? `<button class="btn hot" data-a="onb-next">Build my Weekly Quests</button>` : `<button class="btn ghost" data-a="onb-next">Skip for now</button><button class="btn solid" data-a="${O.contactsIn ? 'onb-crew' : 'onb-contacts'}">${O.contactsIn ? 'Invite all' : 'Import contacts'}</button>`}</div>`;
  } else if (name === 'build') {
    bg = glowBg();
    const picks = weekly().slice(0, 3).map((x) => x.e);
    body = `<div style="flex:1;display:grid;place-items:center"><div class="stack3">${picks.map((e) => poster(e.id + 'deal', e.scene, `<div style="position:absolute;left:14px;right:14px;bottom:14px">${matchTag(fitFor('me', e))}<h3 style="font-size:22px;font-weight:800;line-height:1;margin-top:4px">${esc(e.title)}</h3></div>`, '', e.title.split(' ')[0], 70)).join('')}</div></div>
      <h1 class="words" style="font-size:38px">${words('Building your <span class="hl">Weekly</span> <span class="hl">Quests</span>')}</h1>
      <div class="build-steps" style="margin-top:20px" id="buildsteps">${['Reading your vibes', 'Mapping your areas', 'Checking what your party likes', 'Picking this week\'s quests'].map((s) => `<div>${icon('check')}${s}</div>`).join('')}</div>
      <p class="note" style="margin-top:14px">Change any of this later in Profile, under What Sixer knows.</p>`;
  } else if (name === 'htype') {
    bg = glowBg();
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('What kind of <span class="hl">host</span> <span class="hl">are</span> <span class="hl">you?</span>')}</h1>
      <div class="onb-scroll"><div class="verify">${HOST_TYPES.map(([k, t, d], j) => `<button class="st ${O.hostType === k ? 'on' : ''}" style="--i:${3 + j}" data-a="onb-htype" data-v="${k}"><div class="grow"><div style="font-weight:700;font-size:17px">${t}</div><div class="muted" style="font-size:13.5px">${d}</div></div>${O.hostType === k ? `<span class="pill hot">${icon('check')}</span>` : ''}</button>`).join('')}</div>
        ${O.hostType === 'other' ? `<input class="text-in" style="margin-top:12px" id="o-hother" value="${esc(O.hostOther)}" placeholder="e.g. Library, campus club, run crew" aria-label="Describe your hosting">` : ''}</div>
      ${foot('onb-next', { disabled: false })}`;
  } else if (name === 'haccount') {
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Host <span class="hl">account</span>')}</h1><p class="sub st" style="--i:2">Linked to your personal login, so you can switch between them.</p>
      <div class="onb-scroll">${[['Host or venue name', O.hostName, 'text'], ['Work email', 'events@loopcollective.example', 'email'], ['Work phone', '+1 416 555 0199', 'tel']].map(([l, v, t], k) => `<label class="lab-in st" style="--i:${3 + k}"><span>${l}</span><input class="text-in" type="${t}" value="${esc(v)}"></label>`).join('')}
        <p class="note st" style="--i:6;margin-top:10px">We ask for a phone number too: small businesses often change names and emails, and a number keeps you reachable.</p></div>
      ${foot('onb-next')}`;
  } else if (name === 'verify') {
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Let\'s <span class="hl">verify</span> <span class="hl">you.</span>')}</h1><p class="sub st" style="--i:2">Verified hosts get a badge, and attendees know the listing is really yours.</p>
      <div class="verify" style="margin-top:22px">${VERIFY_OPTS.map(([k, t, d], j) => `<button class="st ${O.verified === k ? 'on' : ''}" style="--i:${3 + j}" data-a="onb-verify" data-v="${k}" ${O.verifying ? 'disabled' : ''}><div class="grow"><div style="font-weight:700">${t}</div><div class="muted" style="font-size:13px">${d}</div></div>${O.verifying === k ? '<span class="thinking"><i></i><i></i><i></i></span>' : O.verified === k ? `<span class="pill hot">${icon('check')}Verified</span>` : icon('arrow')}</button>`).join('')}</div>
      <div style="flex:1"></div>${foot('onb-next', { disabled: !O.verified })}`;
  } else if (name === 'hprofile') {
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Build your <span class="hl">host</span> <span class="hl">profile.</span>')}</h1>
      <div class="onb-scroll">
        <div class="eyebrow st" style="--i:2;margin-bottom:8px">Host name</div><input class="text-in st" style="--i:2" id="o-hostname" value="${esc(O.hostName)}" maxlength="40">
        <div class="eyebrow st" style="--i:3;margin:20px 0 8px">Your vibes</div><div class="search-in st" style="--i:3;margin-bottom:10px">${icon('search')}<input id="o-tagq" value="${esc(O.tagQ)}" placeholder="Search tags" aria-label="Search tags" data-live="o-tagq"></div>
        <div class="chips st" style="--i:3;padding:0;flex-wrap:wrap">${SCENE_KEYS.filter((s) => !O.tagQ || SCENES[s].label.toLowerCase().includes(O.tagQ.toLowerCase())).map((s) => `<button class="chip ${O.hostScenes.has(s) ? 'on' : ''}" data-a="onb-hscene" data-v="${s}">${esc(SCENES[s].label)}</button>`).join('')}</div>
        <div class="eyebrow st" style="--i:4;margin:20px 0 8px">Areas you host in</div><div class="chips st" style="--i:4;padding:0;flex-wrap:wrap">${AREA_KEYS.map((a) => `<button class="chip ${O.hostAreas.has(a) ? 'on' : ''}" data-a="onb-harea" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div>
        <div class="eyebrow st" style="--i:5;margin:20px 0 8px">Usual age policy</div><div class="chips st" style="--i:5;padding:0;flex-wrap:wrap">${[['all', 'All ages'], ['19', '19+ (ID at the door)']].map(([k, l]) => `<button class="chip ${O.agePolicy === k ? 'on' : ''}" data-a="onb-age" data-v="${k}">${l}</button>`).join('')}</div>
        <p class="note st" style="--i:5;margin-top:8px">You can change it per event. Attendees are only asked their age for 19+ events.</p>
        <div class="eyebrow st" style="--i:5;margin:20px 0 8px">Socials · optional</div>
        ${O.socials.map(([k, v], j) => `<div class="row social st" style="--i:5"><span class="pill glass">${esc(k)}</span><input class="text-in grow" value="${esc(v)}" aria-label="${esc(k)} handle"></div>`).join('')}
        <div class="chips st" style="--i:5;padding:0;flex-wrap:wrap;margin-top:8px">${SOCIALS.filter((k) => !O.socials.some((x) => x[0] === k)).map((k) => `<button class="chip" data-a="onb-social" data-v="${k}">${icon('plus')}${k}</button>`).join('')}</div>
        <p class="note st" style="--i:5;margin-top:8px">All optional. Skip any you don't want to share.</p></div>
      ${foot('onb-next', { disabled: !O.hostScenes.size })}`;
  } else if (name === 'ticketing') {
    // Decision: hosts connect their ticketing, so sales and revenue can show up in Insights.
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('How do you sell <span class="hl">tickets?</span>')}</h1><p class="sub st" style="--i:2">Tickets stay on your page. Connecting lets Insights show sales, revenue and conversion.</p>
      <div class="onb-scroll"><div class="verify">${[['DICE', 'Sales and check-ins sync'], ['Eventbrite', 'Sales sync'], ['Ticketmaster', 'Sales sync'], ['Own website', 'Paste a link. Views and taps only'], ['Free · RSVP', 'No tickets. Attendance only']].map(([k, d], j) => `<button class="st ${O.ticketing === k ? 'on' : ''}" style="--i:${3 + j}" data-a="onb-ticketing" data-v="${k}"><div class="grow"><div style="font-weight:700">${k}</div><div class="muted" style="font-size:13px">${d}</div></div>${O.ticketing === k ? `<span class="pill hot">${icon('check')}</span>` : ''}</button>`).join('')}</div>
        <div class="eyebrow" style="margin:18px 0 8px">Default ticket link</div><input class="text-in" id="o-link" value="${esc(O.link)}" maxlength="80"></div>
      ${foot('onb-next')}`;
  } else if (name === 'team') {
    // Team note: drop "door staff"; event staff are invited per quest. Only people who run the account get access.
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Invite your <span class="hl">team</span>')}</h1><p class="sub st" style="--i:2">People who run this account: owners and marketing.</p>
      <div class="onb-scroll">${O.team.map(([em, role], j) => `<div class="team-row st" style="--i:${3 + j}"><input class="text-in" value="${esc(em)}" placeholder="teammate@email.com" aria-label="Teammate email"><div class="chips" style="padding:0;margin-top:8px">${['Owner', 'Marketing'].map((r) => `<button class="chip ${role === r ? 'on' : ''}" data-a="onb-role-set" data-v="${j}:${r}">${r}</button>`).join('')}</div></div>`).join('')}
        <div class="why st" style="--i:6;margin-top:14px"><div class="grow"><div style="font-weight:700">Door staff and crew?</div><p>Invite event staff when you create a quest. They get the scanner for that night only.</p></div></div></div>
      ${foot('onb-next', { label: 'Submit for review' })}`;
  } else if (name === 'review') {
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words(O.approved ? 'You\'re <span class="hl">approved.</span>' : 'Thanks, we\'re <span class="hl">reviewing.</span>')}</h1>
      <div class="timeline st" style="--i:3">${[['Submitted', true], ['In review · usually 1 to 2 days', O.approved], ['Approved', O.approved]].map(([t, done], j) => `<div class="${done || j === 0 ? 'done' : j === 1 ? 'cur' : ''}"><span>${done || j === 0 ? icon('check') : j + 1}</span>${t}</div>`).join('')}</div>
      <p class="sub st" style="--i:4">You can set up draft quests while you wait. They go live once you're approved.</p><div style="flex:1"></div>
      ${O.approved ? foot('onb-next', { label: 'See my demand map' }) : `<div class="onb-foot st" style="--i:6"><button class="btn ghost" data-a="onb-back" aria-label="Back">${icon('back')}</button><button class="btn solid" data-a="onb-approve">Demo: approve this host</button></div>`}`;
  } else if (name === 'claim') {
    const found = EVENTS.filter((e) => e.host === 'loop');
    body = `${onbProgress()}<h1 class="words" style="margin-top:24px;font-size:38px">${words('Are these <span class="hl">yours?</span>')}</h1><p class="sub st" style="--i:2">Sixer found ${found.length} public listings that match your name and venues. Claim them to manage them here.</p>
      <div class="onb-scroll">${found.map((e, j) => `<button class="claim st ${O.claims.has(e.id) ? 'on' : ''} ${O.just === e.id ? 'just' : ''}" style="--i:${3 + j}" data-a="onb-claim" data-v="${e.id}">${poster(e.id + 'c', e.scene)}<div class="grow"><div style="font-weight:700">${esc(e.title)}</div><div class="muted" style="font-size:13px">${esc(shortWhen(e.start))} · ${esc(e.venue)}</div></div><span class="tick">${O.claims.has(e.id) ? icon('check') : icon('plus')}</span></button>`).join('')}</div>
      ${foot('onb-next', { label: O.claims.size ? `Claim ${O.claims.size}` : 'Skip' })}`;
  } else if (name === 'hbuild') {
    bg = glowBg();
    body = `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:10px"><div class="eyebrow st" style="--i:0">Your demand map is ready</div><div class="count-up" id="countup">0</div><h2 class="st" style="--i:1;font-size:26px;line-height:1.1">people near Ossington want a <span class="hl">Sunday vinyl brunch.</span></h2></div>
      <div class="build-steps" id="buildsteps">${['Verifying ' + esc(O.hostName), 'Claiming your listings', 'Matching demand to your vibes', 'Drafting your first idea brief'].map((s) => `<div>${icon('check')}${s}</div>`).join('')}</div>`;
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
  if (EMBED) { steps.forEach((el) => el.classList.add('on')); const c = document.getElementById('countup'); if (c) c.textContent = '340'; return; } // board: hold the frame
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
  if (name === 'hprofile') { O.hostName = document.getElementById('o-hostname')?.value.trim() || 'Loop Collective'; }
  if (name === 'ticketing') { O.link = document.getElementById('o-link')?.value.trim() || O.link; }
  if (name === 'htype') { O.hostOther = document.getElementById('o-hother')?.value.trim() || O.hostOther; }
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
  toast('Your Weekly Quests are ready');
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
    case 'onb-age': O.agePolicy = v; O.hostName = document.getElementById('o-hostname')?.value || O.hostName; renderOnb(); break;
    case 'onb-htype': O.hostType = v; O.hostOther = document.getElementById('o-hother')?.value || O.hostOther; renderOnb(); break;
    case 'onb-verify': O.verifying = v; renderOnb(); setTimeout(() => { O.verifying = false; O.verified = v; if (stepName() === 'verify') renderOnb(); }, 1100); break;
    case 'onb-hscene': O.hostScenes.has(v) ? O.hostScenes.delete(v) : O.hostScenes.add(v); O.hostName = document.getElementById('o-hostname')?.value || O.hostName; renderOnb(); break;
    case 'onb-harea': O.hostAreas.has(v) ? O.hostAreas.delete(v) : O.hostAreas.add(v); O.hostName = document.getElementById('o-hostname')?.value || O.hostName; renderOnb(); break;
    case 'onb-claim': O.claims.has(v) ? O.claims.delete(v) : O.claims.add(v); O.just = v; renderOnb(); break;
    case 'onb-login': toast('Log in: email or phone, then a one-time code'); break;
    case 'onb-xvibe': S.extraVibes.has(v) ? S.extraVibes.delete(v) : S.extraVibes.add(v); renderOnb(); break;
    case 'onb-import': O.imported.has(v) ? O.imported.delete(v) : O.imported.add(v); renderOnb(); break;
    case 'onb-day': S.days.has(v) ? S.days.delete(v) : S.days.add(v); renderOnb(); break;
    case 'onb-contacts': O.contactsIn = true; renderOnb(); break;
    case 'onb-social': O.socials.push([v, '']); renderOnb(); break;
    case 'onb-ticketing': O.ticketing = v; O.link = document.getElementById('o-link')?.value || O.link; renderOnb(); break;
    case 'onb-role-set': { const [j, r] = v.split(':'); O.team[Number(j)][1] = r; renderOnb(); break; }
    case 'onb-approve': O.approved = true; renderOnb(); break;
    default: return false;
  }
  return true;
}

