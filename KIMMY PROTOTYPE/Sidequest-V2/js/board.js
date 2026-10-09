// Sidequest · screen board (board.html).
// Lays every screen out in rows like the Figma file, each a live frame of the prototype,
// with a short annotation and the team's Figma comments underneath.
(() => {
  'use strict';
  const { GROUPS, flat } = window.SQ_SCREENS;
  const C = window.SQ_COMMENTS;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const STATUS = { done: 'Addressed', decision: 'Decision', open: 'Open' };

  // Several screens can come from one Figma frame. Its comments sit under the first of them; the others point there.
  const home = {};
  flat.forEach((s) => { if (s.fig && C[s.fig] && !home[s.fig]) home[s.fig] = s.id; });
  const commentsOf = (s) => (s.fig && home[s.fig] === s.id ? C[s.fig] : []);

  // Summary: totals, then every open item so the team can work through them.
  const all = Object.entries(C).flatMap(([fig, list]) => list.map((c) => ({ ...c, fig })));
  const count = (k) => all.filter((c) => c.s === k).length;
  const figTitle = (fig) => { const s = flat.find((x) => x.id === home[fig]); return s ? s.title : fig; };
  document.getElementById('summary').innerHTML = `
    <div class="b-stats">
      <div><b>${flat.length}</b><span>screens</span></div>
      <div><b>${all.length}</b><span>team comments</span></div>
      <div><b>${count('done')}</b><span>addressed</span></div>
      <div><b>${count('decision')}</b><span>decisions made</span></div>
      <div class="open"><b>${count('open')}</b><span>still open</span></div>
    </div>
    <div class="b-open"><h2>Still open</h2><ul>${all.filter((c) => c.s === 'open').map((c) => `<li><a href="#card-${home[c.fig]}"><span class="fig">${esc(c.fig)}</span>${esc(figTitle(c.fig))}</a><p>${esc(c.r)}</p></li>`).join('')}</ul></div>`;

  const card = (s) => {
    const cs = commentsOf(s);
    const elsewhere = s.fig && C[s.fig] && home[s.fig] !== s.id ? flat.find((x) => x.id === home[s.fig]) : null;
    const text = [s.title, s.note, s.fig, ...cs.flatMap((c) => [c.t, c.r])].join(' ').toLowerCase();
    return `<article class="card" id="card-${s.id}" data-side="${s.side}" data-has="${cs.length ? 1 : 0}" data-open="${cs.some((c) => c.s === 'open') ? 1 : 0}" data-text="${esc(text)}">
      <a class="frame" href="index.html#${s.id}" aria-label="Open ${esc(s.title)} in the prototype">
        <iframe tabindex="-1" title="${esc(s.title)}" data-src="index.html?embed=1#${s.id}"></iframe>
      </a>
      <div class="meta">
        <div class="code"><span>${s.num}</span>${s.fig ? `<span class="fig">${s.fig === 'New' ? 'New screen' : 'Figma ' + esc(s.fig)}</span>` : '<span class="fig ghost">From prototype</span>'}</div>
        <h3>${esc(s.title)}</h3>
        <p class="note">${esc(s.note)}</p>
        ${cs.length ? `<details class="comments" open><summary>Team comments · ${cs.length}</summary><ol>${cs.map((c) => `<li class="${c.s}"><q>${esc(c.t)}</q><div class="resp"><span class="st ${c.s}">${STATUS[c.s]}</span>${esc(c.r)}</div></li>`).join('')}</ol></details>` : ''}
        ${elsewhere ? `<p class="see">Figma ${esc(s.fig)} comments are under <a href="#card-${elsewhere.id}">${esc(elsewhere.title)}</a>.</p>` : ''}
      </div>
    </article>`;
  };

  document.getElementById('board').innerHTML = GROUPS.map(([gid, gtitle, side, list], gi) => `
    <section class="row" data-side="${side}" aria-labelledby="g-${gid}">
      <h2 id="g-${gid}"><span>${String(gi + 1).padStart(2, '0')}</span>${esc(gtitle)}<small>${list.length} screen${list.length === 1 ? '' : 's'}</small></h2>
      <div class="cards">${list.map(card).join('')}</div>
    </section>`).join('');

  // Load frames only as they come near the viewport, a few at a time, so 70 live frames don't stall the page.
  const queue = [];
  let busy = 0;
  const pump = () => {
    while (busy < 4 && queue.length) {
      const f = queue.shift();
      busy++;
      const done = () => { busy--; pump(); };
      f.addEventListener('load', done, { once: true });
      setTimeout(done, 4000);
      f.src = f.dataset.src;
    }
  };
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { io.unobserve(en.target); queue.push(en.target); pump(); }
  }), { rootMargin: '600px 0px' });
  document.querySelectorAll('iframe[data-src]').forEach((f) => io.observe(f));

  // Filters
  const state = { side: 'all', notes: 'all', q: '' };
  const apply = () => {
    document.querySelectorAll('.card').forEach((c) => {
      const ok = (state.side === 'all' || c.dataset.side === state.side)
        && (state.notes === 'all' || (state.notes === 'comments' ? c.dataset.has === '1' : c.dataset.open === '1'))
        && (!state.q || c.dataset.text.includes(state.q));
      c.hidden = !ok;
    });
    document.querySelectorAll('section.row').forEach((r) => { r.hidden = !r.querySelector('.card:not([hidden])'); });
  };
  const seg = (id, key) => document.getElementById(id).addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    state[key] = b.dataset[key];
    b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply();
  });
  seg('sideSeg', 'side'); seg('noteSeg', 'notes');
  document.getElementById('q').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); apply(); });

  // Arriving from the prototype with board.html#screen-id: scroll to that card.
  const target = location.hash.slice(1);
  if (target && document.getElementById('card-' + target)) {
    const el = document.getElementById('card-' + target);
    el.classList.add('hit');
    requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
  }
})();
