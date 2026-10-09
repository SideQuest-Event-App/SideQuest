// Sidequest wireframe · sidebar site map and hash links.
// Built from js/screens.js. Every entry jumps straight to one screen in the right state.
// The address bar tracks the current screen (index.html#quest), so any screen can be linked or bookmarked.
(() => {
  'use strict';
  const X = window.Sidequest;
  const { GROUPS, flat, byId } = window.SQ_SCREENS;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const aside = document.getElementById('sitemap');
  const head = document.getElementById('stageHead');

  let last = '';
  let lock = false;
  function open(id) {
    const s = byId[id];
    if (!s) return false;
    lock = true;
    try { s.go(); } finally { lock = false; }
    last = '';
    sync(id);
    return true;
  }

  // Embedded on the board: just show the screen named in the hash, no sidebar.
  if (EMBED) {
    const id = location.hash.slice(1);
    if (id) open(id);
    return;
  }

  aside.innerHTML = `
    <div class="sm-head">
      <div class="sm-brand">Sidequest</div>
      <div class="sm-sub">Interactive wireframe · ${flat.length} screens</div>
      <div class="sm-links"><a href="board.html">Screen board</a><a href="sitemap.html">Product sitemap</a></div>
    </div>
    <nav class="sm-list" aria-label="Screens">
      ${GROUPS.map(([gid, gtitle, side, items], gi) => `
        <section class="sm-group">
          <h2><span>${String(gi + 1).padStart(2, '0')}</span>${esc(gtitle)}</h2>
          <ul>${items.map((s) => `<li><button type="button" data-screen="${s.id}"><span class="sm-num">${s.num}</span><span class="sm-label">${esc(s.title)}</span>${s.fig ? `<span class="sm-fig" title="Figma frame">${esc(s.fig)}</span>` : ''}</button></li>`).join('')}</ul>
        </section>`).join('')}
    </nav>
    <div class="sm-foot"><button type="button" id="smReset">Reset prototype</button></div>`;
  const toggle = document.getElementById('smToggle');

  aside.addEventListener('click', (e) => {
    const b = e.target.closest('[data-screen]');
    if (b) {
      open(b.dataset.screen);
      document.body.classList.remove('sm-open');
      toggle.textContent = 'Site map';
      return;
    }
    if (e.target.closest('#smReset')) X.reset();
  });
  toggle.addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('sm-open');
    toggle.textContent = isOpen ? 'Close' : 'Site map';
    toggle.setAttribute('aria-label', isOpen ? 'Close site map' : 'Open site map');
  });

  // Keep the highlight, the title above the phone and the URL in step with the app.
  function current() {
    const w = X.where();
    return flat.find((s) => { try { return s.is(w); } catch { return false; } });
  }
  function sync(prefer) {
    if (lock) return;
    const cur = (prefer && byId[prefer]) || current();
    const key = cur ? cur.id : '?';
    if (key === last) return;
    last = key;
    aside.querySelectorAll('[data-screen]').forEach((b) => b.setAttribute('aria-current', String(!!cur && b.dataset.screen === cur.id)));
    head.innerHTML = cur
      ? `<span class="sh-num">${cur.num}</span><span class="sh-group">${esc(cur.groupTitle)}</span><span class="sh-label">${esc(cur.title)}</span>${cur.fig ? `<span class="sh-fig">Figma ${esc(cur.fig)}</span>` : ''}<a class="sh-board" href="board.html#${cur.id}">See notes</a>`
      : '<span class="sh-group">In-between screen</span>';
    if (cur && location.hash.slice(1) !== cur.id) history.replaceState(null, '', '#' + cur.id);
    const active = aside.querySelector('[aria-current="true"]');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }
  document.getElementById('app').addEventListener('click', () => setTimeout(() => sync(), 0));
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (id && id !== last) open(id); });
  setInterval(() => sync(), 400); // catches timed changes (onboarding finishing, party replies)

  const start = location.hash.slice(1);
  if (!(start && open(start))) sync();
})();
