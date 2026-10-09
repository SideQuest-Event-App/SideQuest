// Sidequest wireframe · start-up and the navigation API the site map and the board use.
'use strict';
// =========================================================================
// Boot
// =========================================================================
render();
// The board (board.html) loads each screen with ?embed=1#screen-id, so it never auto-opens onboarding.
if (!S.onboarded && !EMBED && !location.hash) openOnboarding();
if (EMBED) document.documentElement.classList.add('embed');

// =========================================================================
// Navigation API used by js/sitemap.js and js/screens.js
// =========================================================================
function closeOverlays() { buildRun++; closeOnb(); chatEl.hidden = true; ai.openId = null; }
window.Sidequest = {
  // Jump to a tab with a clean stack. mode: 'attendee' | 'host'.
  base(mode = 'attendee', tab = 'discover') {
    closeOverlays();
    S.mode = mode; S.stack = []; S.sceneFilter = null; S.dayPart = 'any'; S.nightsSeg = 'upcoming'; S.logView = 'list'; S.mapSel = null; S.editProfile = false;
    Object.assign(S.filters, { price: null, dist: null, friends: false, vibe: null, start: null, end: null }); S.filters.amen.clear();
    S.host.questSeg = 'live'; S.host.insightSeg = 'performance';
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
  // Change state directly, then redraw (used for states that need several taps to reach).
  mut(fn) { fn(S); render(); },
  onboarding(flow, i, setup) { closeOverlays(); O.flow = flow; O.i = i; if (setup) setup(O); onbEl.hidden = false; renderOnb(EMBED ? null : 'fwd'); },
  chat() { closeOverlays(); openChat(); },
  set(k, v) { S[k] = v; persist(); },
  // Where the viewer is right now, so the site map can highlight it.
  where() {
    if (!onbEl.hidden) return { onb: O.flow + ':' + stepName() };
    if (!chatEl.hidden) return { chat: true };
    const top = S.stack[S.stack.length - 1];
    return { mode: S.mode, tab: S.mode === 'host' ? S.hostTab : S.tab, page: top ? top.v : null, id: top?.id, seg: S.nightsSeg, dayPart: S.dayPart, done: !!top?.done,
      logView: S.logView, mapSel: S.mapSel, filters: filtersOn(), empty: !!document.querySelector('#root .empty-state'), edit: S.editProfile, qseg: S.host.questSeg, iseg: S.host.insightSeg, depth: S.stack.length };
  },
  reset() { try { Object.keys(localStorage).filter((k) => k.startsWith('sidequest-wireframe.')).forEach((k) => localStorage.removeItem(k)); } catch {} location.hash = ''; location.reload(); },
};
window.SixSense = window.Sidequest; // old name, kept so older links keep working
