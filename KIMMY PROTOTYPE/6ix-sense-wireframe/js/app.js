/* The 6ix Sense wireframe: navigation and rendering.
   The current screen lives in the URL hash (index.html#weekly), so every screen has a shareable link
   and the browser's back button works. */
(function () {
  const SIX = window.SIX;
  const screens = SIX.screens;
  const $ = (id) => document.getElementById(id);

  const indexOf = (id) => screens.findIndex((s) => s.id === id);
  const currentIndex = () => Math.max(0, indexOf(location.hash.slice(1)));
  const go = (id) => { if (indexOf(id) >= 0) location.hash = id; };

  /* Sidebar: one button per screen, grouped the same way as the key-screens board. */
  function renderSitemap() {
    let lastGroup = '';
    $('sitemap').innerHTML = screens.map((s) => {
      const heading = s.group !== lastGroup ? `<p class="grp">${s.group}</p>` : '';
      lastGroup = s.group;
      return `${heading}<button type="button" class="nav" data-go="${s.id}"><span class="c">${s.code}</span><span>${s.title}</span></button>`;
    }).join('');
  }

  /* Phone, notes panel, and the active sidebar button. */
  function render() {
    const i = currentIndex();
    const s = screens[i];

    $('phone').innerHTML = s.render() + SIX.ui.tabBar(s.tabs, s.id);

    $('notes-eyebrow').textContent = `${s.code} · ${s.group}`;
    $('notes-title').textContent = s.title;
    $('notes-caption').textContent = s.caption;
    $('notes-flow').textContent = s.flowNote;
    $('notes-position').textContent = `${i + 1} / ${screens.length}`;

    document.querySelectorAll('#sitemap .nav').forEach((b) => {
      const active = b.dataset.go === s.id;
      b.classList.toggle('on', active);
      if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    document.title = `${s.title} · The 6ix Sense wireframes`;
  }

  /* Any element with data-go="screen-id" navigates, wherever it is on the page. */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go]');
    if (el) go(el.dataset.go);
  });
  $('prev').addEventListener('click', () => go(screens[(currentIndex() - 1 + screens.length) % screens.length].id));
  $('next').addEventListener('click', () => go(screens[(currentIndex() + 1) % screens.length].id));
  window.addEventListener('hashchange', render);

  renderSitemap();
  render();
})();
