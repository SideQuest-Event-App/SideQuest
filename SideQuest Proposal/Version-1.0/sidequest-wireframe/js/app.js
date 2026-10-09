/* Sidequest wireframe — app shell: navigation, guided flows, rendering. */
(function () {
  const SQ = window.SQ;
  const esc = SQ.ui.esc;

  let state = SQ.initialState();
  const ui = { flow: null, step: 0, screen: 'landing', history: [], offPath: false };

  const phone = document.getElementById('phone-screen');
  const notes = document.getElementById('notes');
  const nav = document.getElementById('flow-nav');
  const toastEl = document.getElementById('toast');
  const roleEl = document.getElementById('phone-role');

  // ---------- context passed to actions ----------
  let toastTimer;
  const toast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
  };
  const notify = (title, body, questId) => state.notifications.push({ title, body, questId, read: false });
  const ctx = {
    val: (id) => { const el = phone.querySelector('#' + id); return el ? el.value.trim() : null; },
    toast, notify
  };

  const currentFlow = () => SQ.flows.find((f) => f.id === ui.flow);

  // ---------- navigation ----------
  function syncStep() {
    const f = currentFlow();
    if (!f) { ui.offPath = false; return; }
    const steps = f.steps;
    if (steps[ui.step] && steps[ui.step].screen === ui.screen) { ui.offPath = false; return; }
    let idx = -1;
    for (let i = ui.step + 1; i < steps.length; i++) if (steps[i].screen === ui.screen) { idx = i; break; }
    if (idx < 0) idx = steps.findIndex((st) => st.screen === ui.screen);
    if (idx >= 0) { ui.step = idx; ui.offPath = false; } else { ui.offPath = true; }
  }

  function go(id) {
    if (!SQ.screens[id]) { console.warn('Unknown screen:', id); return; }
    if (ui.screen !== id) ui.history.push(ui.screen);
    ui.screen = id;
    syncStep();
    render(true);
  }

  function back() {
    if (!ui.history.length) return;
    ui.screen = ui.history.pop();
    syncStep();
    render(true);
  }

  function jumpToStep(i) {
    const f = currentFlow();
    if (!f || !f.steps[i]) return;
    ui.step = i;
    if (ui.screen !== f.steps[i].screen) ui.history.push(ui.screen);
    ui.screen = f.steps[i].screen;
    ui.offPath = false;
    render(true);
  }

  function startFlow(id) {
    const f = SQ.flows.find((x) => x.id === id);
    if (!f) return;
    if (f.setup) f.setup(state);
    ui.flow = id; ui.step = 0; ui.history = []; ui.screen = f.steps[0].screen; ui.offPath = false;
    render(true);
    phone.focus();
  }

  function startFree(id) {
    const m = SQ.freeModes.find((x) => x.id === id);
    m.setup(state);
    ui.flow = null; ui.step = 0; ui.history = []; ui.screen = m.screen; ui.offPath = false;
    render(true);
  }

  // ---------- rendering ----------
  function render(resetScroll) {
    const scrollEl = phone.querySelector('.scroll');
    const prevScroll = scrollEl ? scrollEl.scrollTop : 0;
    const scr = SQ.screens[ui.screen];
    phone.innerHTML = scr.render(state);
    const next = phone.querySelector('.scroll');
    if (next && !resetScroll) next.scrollTop = prevScroll;
    roleEl.textContent = scr.role === 'host' ? 'Host app' : 'Attendee app';
    if (ui.screen === 'notifications') state.notifications.forEach((n) => { n.read = true; });
    renderNotes();
    renderNav();
  }

  function featureTags(ids) {
    if (!ids || !ids.length) return '';
    return `<ul class="tags" aria-label="Features shown">${ids.map((id) => `<li><strong>${id}</strong> ${esc(SQ.FEATURES[id] || '')}</li>`).join('')}</ul>`;
  }

  function screenPicker() {
    const opts = Object.keys(SQ.screens).map((id) =>
      `<option value="${id}"${id === ui.screen ? ' selected' : ''}>${SQ.screens[id].role === 'host' ? 'Host' : 'Attendee'}: ${id}</option>`).join('');
    return `<label class="picker"><span>Jump to any screen</span><select id="screen-picker">${opts}</select></label>`;
  }

  function renderNotes() {
    const f = currentFlow();
    if (!f) {
      notes.innerHTML = `
        <p class="notes-kicker">Free exploration</p>
        <h2>Tap around</h2>
        <p>You're using the ${SQ.screens[ui.screen].role === 'host' ? 'host' : 'attendee'} app without a script. Everything you do changes the shared demo state, so actions on one side show up on the other.</p>
        <p>Pick a flow on the left for a guided walkthrough.</p>
        ${screenPicker()}`;
      return;
    }
    const st = f.steps[ui.step];
    notes.innerHTML = `
      <p class="notes-kicker">${esc(f.group)} flow</p>
      <h2>${esc(f.label)}</h2>
      <p class="muted">${esc(f.summary)}</p>
      <div class="current">
        <p class="step-count">Step ${ui.step + 1} of ${f.steps.length}</p>
        <h3>${esc(st.title)}</h3>
        ${ui.offPath ? '<p class="offpath">You\'ve stepped off the scripted path. Keep exploring, or jump back to a step below.</p>' : ''}
        <p>${esc(st.note)}</p>
        ${featureTags(st.features)}
        <div class="notes-actions">
          <button class="btn btn-secondary" data-nav="prev" ${ui.step === 0 ? 'disabled' : ''}>Previous</button>
          <button class="btn btn-primary" data-nav="next" ${ui.step === f.steps.length - 1 ? 'disabled' : ''}>Next</button>
        </div>
      </div>
      <ol class="step-list">${f.steps.map((x, i) => `
        <li><button data-step="${i}" class="${i === ui.step ? 'on' : ''}${i < ui.step ? ' done' : ''}" ${i === ui.step ? 'aria-current="step"' : ''}>${esc(x.title)}</button></li>`).join('')}
      </ol>
      ${screenPicker()}`;
  }

  function renderNav() {
    const groups = [...new Set(SQ.flows.map((f) => f.group))];
    nav.innerHTML = groups.map((g) => `
      <section>
        <h2>${esc(g)}</h2>
        ${SQ.flows.filter((f) => f.group === g).map((f) =>
          `<button class="flow-btn${ui.flow === f.id ? ' on' : ''}" data-flow="${f.id}" ${ui.flow === f.id ? 'aria-current="true"' : ''}>${esc(f.label)}<span>${f.steps.length} steps</span></button>`).join('')}
      </section>`).join('') + `
      <section>
        <h2>Explore freely</h2>
        ${SQ.freeModes.map((m) => `<button class="flow-btn${!ui.flow && SQ.screens[ui.screen].role === (m.id === 'free-host' ? 'host' : 'attendee') ? ' on' : ''}" data-free="${m.id}">${esc(m.label)}</button>`).join('')}
      </section>`;
  }

  // ---------- events ----------
  phone.addEventListener('click', (e) => {
    const el = e.target.closest('[data-go],[data-act],[data-back]');
    if (!el || el.disabled) return;
    if (el.hasAttribute('data-back')) { back(); return; }
    const act = el.getAttribute('data-act');
    if (act) {
      const fn = SQ.actions[act];
      if (!fn) { console.warn('Unknown action:', act); return; }
      const next = fn(state, el.getAttribute('data-arg'), ctx);
      if (next) go(next); else render(false);
      return;
    }
    go(el.getAttribute('data-go'));
  });

  phone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('input')) {
      const send = e.target.closest('.row') && e.target.closest('.row').querySelector('[data-act]');
      if (send) send.click();
    }
  });

  notes.addEventListener('click', (e) => {
    const n = e.target.closest('[data-nav]');
    if (n) { jumpToStep(ui.step + (n.dataset.nav === 'next' ? 1 : -1)); return; }
    const s = e.target.closest('[data-step]');
    if (s) jumpToStep(Number(s.dataset.step));
  });
  notes.addEventListener('change', (e) => {
    if (e.target.id === 'screen-picker') go(e.target.value);
  });

  nav.addEventListener('click', (e) => {
    const f = e.target.closest('[data-flow]');
    if (f) { startFlow(f.dataset.flow); return; }
    const m = e.target.closest('[data-free]');
    if (m) startFree(m.dataset.free);
  });

  document.getElementById('reset').addEventListener('click', () => {
    state = SQ.initialState();
    ui.flow = null; ui.step = 0; ui.history = []; ui.screen = 'landing';
    render(true);
    toast('Demo reset');
  });

  // Start on the landing screen with the registration flow ready
  startFlow('attendee-registration');
})();
