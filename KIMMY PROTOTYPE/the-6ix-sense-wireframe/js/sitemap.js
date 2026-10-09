// Clickable site map for the wireframe.
// Every entry jumps straight to one screen in the right state, and the map highlights
// whichever screen is showing as you click around inside the app.
(() => {
  'use strict';
  const X = window.SixSense;
  const A = (tab) => () => X.base('attendee', tab);
  const H = (tab) => () => X.base('host', tab);

  // [group, [id, label, go(), matches(where)]]
  const MAP = [
    ['Onboarding · shared', [
      ['onb-welcome', 'Welcome', () => X.onboarding('start', 0), (w) => w.onb === 'start:welcome'],
      ['onb-role', 'Choose your side', () => X.onboarding('start', 1), (w) => w.onb === 'start:role'],
    ]],
    ['Onboarding · attendee', [
      ['onb-sixer', 'Meet Sixer', () => X.onboarding('attendee', 0), (w) => w.onb === 'attendee:sixer'],
      ['onb-scenes', 'Pick your scenes', () => X.onboarding('attendee', 1), (w) => w.onb === 'attendee:scenes'],
      ['onb-times', 'When you go out', () => X.onboarding('attendee', 2), (w) => w.onb === 'attendee:times'],
      ['onb-areas', 'Areas', () => X.onboarding('attendee', 3), (w) => w.onb === 'attendee:areas'],
      ['onb-crew', 'Bring your crew', () => X.onboarding('attendee', 4), (w) => w.onb === 'attendee:crew'],
      ['onb-build', 'Building your 6ix Weekly', () => X.onboarding('attendee', 5), (w) => w.onb === 'attendee:build'],
    ]],
    ['Onboarding · host', [
      ['onb-htype', 'Host type', () => X.onboarding('host', 0), (w) => w.onb === 'host:htype'],
      ['onb-verify', 'Verify', () => X.onboarding('host', 1), (w) => w.onb === 'host:verify'],
      ['onb-hprofile', 'Host profile', () => X.onboarding('host', 2), (w) => w.onb === 'host:hprofile'],
      ['onb-claim', 'Claim listings', () => X.onboarding('host', 3), (w) => w.onb === 'host:claim'],
      ['onb-hbuild', 'Demand map ready', () => X.onboarding('host', 4), (w) => w.onb === 'host:hbuild'],
    ]],
    ['Discovery', [
      ['discover', 'Discover · 6ix Weekly', A('discover'), (w) => w.mode === 'attendee' && w.tab === 'discover' && !w.page && w.dayPart === 'any'],
      ['discover-day', 'Discover · Daytime filter', () => { A('discover')(); X.fire('daypart', { v: 'day' }); }, (w) => w.tab === 'discover' && !w.page && w.dayPart !== 'any'],
      ['weekly', '6ix Weekly · full list', () => { A('discover')(); X.push('mix', { id: 'weekly' }); }, (w) => w.page === 'mix' && w.id === 'weekly'],
      ['scene-mix', 'Scene Mix', () => { A('discover')(); X.push('mix', { id: 'live' }); }, (w) => w.page === 'mix' && w.id !== 'weekly'],
      ['map', 'Near You map', A('map'), (w) => w.mode === 'attendee' && w.tab === 'map' && !w.page],
    ]],
    ['Event & tickets', [
      ['event', 'Event · all ages', () => { A('discover')(); X.push('event', { id: 'vinyl' }); }, (w) => w.page === 'event' && w.id !== 'disco' && w.id !== 'rooftop'],
      ['event-19', 'Event · 19+', () => { A('discover')(); X.push('event', { id: 'disco' }); }, (w) => w.page === 'event' && (w.id === 'disco' || w.id === 'rooftop')],
      ['tickets', 'Tickets on the host\'s page', () => { A('discover')(); X.push('event', { id: 'vinyl' }); X.push('tickets', { id: 'vinyl' }); }, (w) => w.page === 'tickets'],
    ]],
    ['Age check (19+ only)', [
      ['age-check', '19+ check', () => { X.set('age', null); A('discover')(); X.push('event', { id: 'rooftop' }); X.fire('tickets', { id: 'rooftop' }); }, (w) => w.page === 'agecheck'],
      ['all-ages', 'All-ages alternatives', () => { A('discover')(); X.push('allages', { id: 'rooftop' }); }, (w) => w.page === 'allages'],
    ]],
    ['Crew Blend', [
      ['crew', 'Crew Blend', A('crew'), (w) => w.mode === 'attendee' && w.tab === 'crew' && !w.page],
      ['plan', 'Group plan', () => { A('crew')(); X.fire('plan', { id: 'vinyl' }); }, (w) => w.page === 'plan'],
    ]],
    ['Demand Signals', [
      ['signal', '"I\'d go if…"', () => { A('discover')(); X.push('signal'); }, (w) => w.page === 'signal'],
    ]],
    ['Plans & event day', [
      ['plans', 'Your plans', A('nights'), (w) => w.mode === 'attendee' && w.tab === 'nights' && !w.page && w.seg === 'upcoming'],
      ['hub', 'Event day hub', () => { A('nights')(); X.push('hub', { id: 'listening' }); }, (w) => w.page === 'hub'],
      ['checkin', 'Check-in · scan', () => { A('nights')(); X.push('hub', { id: 'listening' }); X.push('checkin', { id: 'listening' }); }, (w) => w.page === 'checkin' && !w.done],
      ['checkin-done', 'Check-in · matched attendance', () => { A('nights')(); X.push('hub', { id: 'listening' }); X.push('checkin', { id: 'listening' }); X.fire('checkin-done', { id: 'listening' }); }, (w) => w.page === 'checkin' && w.done],
    ]],
    ['Recap & Wrapped', [
      ['past', 'Past plans', () => { A('nights')(); X.fire('seg', { v: 'past' }); }, (w) => w.tab === 'nights' && !w.page && w.seg === 'past'],
      ['recap', 'Recap', () => { A('nights')(); X.fire('seg', { v: 'past' }); X.push('recap', { id: 'harbour' }); }, (w) => w.page === 'recap'],
      ['night', 'Saved record', () => { A('nights')(); X.fire('seg', { v: 'past' }); X.push('night', { id: 'ramen' }); }, (w) => w.page === 'night'],
      ['wrapped', '6ix Wrapped', () => { A('nights')(); X.fire('seg', { v: 'past' }); X.push('wrapped', { i: 0 }); }, (w) => w.page === 'wrapped'],
    ]],
    ['Sixer (AI guide)', [
      ['sixer', 'Ask Sixer', () => { A('discover')(); X.chat(); }, (w) => w.chat],
    ]],
    ['Profile & settings', [
      ['profile', 'Profile · what Sixer knows', () => { A('discover')(); X.push('profile'); }, (w) => w.page === 'profile'],
    ]],
    ['Host tools', [
      ['h-demand', 'Demand map', H('demand'), (w) => w.mode === 'host' && w.tab === 'demand' && !w.page],
      ['h-idea', 'Idea brief', () => { H('demand')(); X.push('idea', { id: 'i-ramen' }); }, (w) => w.page === 'idea'],
      ['h-draft', 'Draft test', () => { H('demand')(); X.fire('idea', { id: 'i-ramen' }); X.fire('post-draft', { id: 'i-ramen' }); }, (w) => w.page === 'draft'],
      ['h-events', 'Your events', H('events'), (w) => w.mode === 'host' && w.tab === 'events' && !w.page],
      ['h-setup', 'Event setup · QR & live updates', () => { H('events')(); X.push('hevent', { id: 'rooftop' }); }, (w) => w.page === 'hevent'],
      ['h-insights', 'Insights', H('insights'), (w) => w.mode === 'host' && w.tab === 'insights' && !w.page],
      ['h-profile', 'Host profile', H('you'), (w) => w.mode === 'host' && w.tab === 'you' && !w.page],
    ]],
  ];

  const aside = document.getElementById('sitemap');
  const head = document.getElementById('stageHead');
  const flat = MAP.flatMap(([group, items], gi) => items.map(([id, label, go, match], ii) => ({ id, label, go, match, group, num: `${String(gi + 1).padStart(2, '0')}.${ii + 1}` })));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  aside.innerHTML = `
    <div class="sm-head">
      <div class="sm-brand">The 6ix Sense</div>
      <div class="sm-sub">Low-fidelity wireframe · ${flat.length} screens</div>
    </div>
    <nav class="sm-list" aria-label="Screens">
      ${MAP.map(([group, items], gi) => `
        <section class="sm-group">
          <h2><span>${String(gi + 1).padStart(2, '0')}</span>${esc(group)}</h2>
          <ul>${items.map(([id, label]) => { const e = flat.find((f) => f.id === id); return `<li><button type="button" data-screen="${id}"><span class="sm-num">${e.num}</span><span class="sm-label">${esc(label)}</span></button></li>`; }).join('')}</ul>
        </section>`).join('')}
    </nav>
    <div class="sm-foot"><button type="button" id="smReset">Reset prototype</button></div>`;
  const toggle = document.getElementById('smToggle');

  aside.addEventListener('click', (e) => {
    const b = e.target.closest('[data-screen]');
    if (b) {
      flat.find((f) => f.id === b.dataset.screen).go();
      document.body.classList.remove('sm-open');
      toggle.textContent = 'Site map';
      sync();
      return;
    }
    if (e.target.closest('#smReset')) X.reset();
  });
  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('sm-open');
    toggle.textContent = open ? 'Close' : 'Site map';
    toggle.setAttribute('aria-label', open ? 'Close site map' : 'Open site map');
  });

  // Keep the highlight and the screen title in step with the app, however you got there.
  let last = '';
  function sync() {
    const w = X.where();
    const cur = flat.find((f) => { try { return f.match(w); } catch { return false; } });
    const key = cur ? cur.id : JSON.stringify(w);
    if (key === last) return;
    last = key;
    aside.querySelectorAll('[data-screen]').forEach((b) => b.setAttribute('aria-current', String(cur && b.dataset.screen === cur.id)));
    head.innerHTML = cur ? `<span class="sh-num">${cur.num}</span><span class="sh-group">${esc(cur.group)}</span><span class="sh-label">${esc(cur.label)}</span>` : '<span class="sh-group">In-between screen</span>';
    const active = aside.querySelector('[aria-current="true"]');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }
  document.getElementById('app').addEventListener('click', () => setTimeout(sync, 0));
  setInterval(sync, 400); // catches timed changes (onboarding finishing, crew replies)
  sync();
})();
