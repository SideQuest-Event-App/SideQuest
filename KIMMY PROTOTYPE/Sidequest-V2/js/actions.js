// Sidequest wireframe · every tap: one delegated click handler keyed on data-a.
'use strict';
// =========================================================================
// Actions
// =========================================================================
document.getElementById('app').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a, id = el.dataset.id, v = el.dataset.v;
  if (a === 'map-pin') return; // handled by the map gesture code
  if (a.startsWith('onb-')) { ev.stopPropagation(); onbAction(a, v); return; }
  ev.stopPropagation();
  switch (a) {
    case 'tab': S.stack = []; if (S.mode === 'host') S.hostTab = v; else { S.tab = v; S.sceneFilter = null; } render(); root.querySelector('.screen').scrollTop = 0; break;
    case 'back': pop(); break;
    case 'event': push('event', { id }); break;
    case 'mix': push('mix', { id: v }); break;
    case 'profile': push('profile'); break;
    case 'scene-filter': S.sceneFilter = v || null; S.mapSel = null; render(); break;
    case 'save': if (S.saved.has(id)) { S.saved.delete(id); toast('Bookmark removed'); } else { S.saved.add(id); toast('Bookmarked. Find it in Quest Log.'); } persist(); render(); break;
    case 'follow': if (S.following.has(id)) S.following.delete(id); else { S.following.add(id); toast(`Following ${HOSTS[id].name}. You'll hear when they announce.`); } persist(); render(); break;
    case 'tickets': if (EV.get(id).age19 && S.age !== 'adult') push('agecheck', { id, next: 'tickets' }); else push('tickets', { id }); break;
    case 'age-yes': S.age = 'adult'; persist(); S.stack[S.stack.length - 1] = null; S.stack.pop(); if (v === 'plan') startPlan(id); else push('tickets', { id }); toast('Thanks. We won\'t ask again.'); break;
    case 'age-no': S.age = 'under'; persist(); S.stack.pop(); if (S.stack.at(-1)?.v === 'event' && S.stack.at(-1).id === id) S.stack.pop(); push('allages', { id }); break;
    case 'age-reset': S.age = null; persist(); render(); toast('Age cleared. We\'ll ask again only for 19+ events.'); break;
    case 'daypart': S.dayPart = v; render(); break;
    case 'time-toggle': S.times.has(v) ? S.times.delete(v) : S.times.add(v); persist(); render(); break;
    case 'got-tickets': S.tickets.add(id); S.saved.add(id); persist(); S.stack[S.stack.length - 1] = { v: 'import', id }; render(); break;
    case 'signal': sig.text = ''; push('signal'); break;
    case 'sig': { const inp = document.getElementById('sig-text'); if (inp) sig.text = inp.value.trim(); sig[el.dataset.k] = el.dataset.k === 'budget' ? Number(v) : v; render(); break; }
    case 'sig-send': {
      const inp = document.getElementById('sig-text'); if (inp) sig.text = inp.value.trim();
      const others = 60 + (hash(sig.scene + sig.area + sig.when) % 260);
      S.signals.push({ id: 'sig' + Date.now(), text: sig.text || SCENES[sig.scene].label, scene: sig.scene, area: sig.area, when: sig.when, budget: sig.budget, others, status: 'open' });
      persist(); S.stack.pop(); render(); toast(`Sent. You and ${others} others want this. We'll tell you if a host books it.`); break;
    }
    case 'crew-toggle': if (id === 'me') break; if (S.crewSel.has(id)) S.crewSel.delete(id); else S.crewSel.add(id); render(); break;
    case 'crew-connect': S.crewOn = !S.crewOn; persist(); render(); toast(S.crewOn ? 'Crew Blend is on' : 'Crew Blend is off'); break;
    // ---- Discover: filters, notifications
    case 'filters': push('filters'); break;
    case 'notifs': S.notifSeen = true; push('notifs'); break;
    case 'quick-filter': case 'filter-set': { const k = el.dataset.k; let val = v === '' ? null : v === 'true' ? true : /^\d+$/.test(v) ? Number(v) : v; if (k === 'friends') val = !!val; S.filters[k] = S.filters[k] === val && a === 'quick-filter' ? (k === 'friends' ? false : null) : val; render(); break; }
    case 'filter-amen': S.filters.amen.has(v) ? S.filters.amen.delete(v) : S.filters.amen.add(v); render(); break;
    case 'clear-filters': Object.assign(S.filters, { price: null, dist: null, friends: false, vibe: null, start: null, end: null }); S.filters.amen.clear(); S.sceneFilter = null; S.dayPart = 'any'; if (S.stack.at(-1)?.v === 'filters') S.stack.pop(); render(); break;
    case 'friend-req': S.friendReq = v; render(); toast(v === 'yes' ? 'You and Noor are connected' : 'Request declined'); break;
    case 'share': toast('Share sheet: copy link, message, or send to a party'); break;
    case 'toast': toast(v); break;
    // ---- Parties
    case 'party': S.partyId = id; push('party', { id }); break;
    case 'new-party': toast('New party: name it, then add people by username, email or phone'); break;
    case 'nominate': { const vs = S.votes[v] || (S.votes[v] = {}); if (!vs[id]) vs[id] = []; render(); toast('Added to the vote'); break; }
    case 'vote': { const vs = S.votes[v]; Object.values(vs).forEach((who) => { const i = who.indexOf('me'); if (i >= 0) who.splice(i, 1); }); vs[id].push('me'); render(); break; }
    // ---- Quest Requests and Quest Log
    case 'metoo': S.metoo.has(id) ? S.metoo.delete(id) : S.metoo.add(id); persist(); render(); if (S.metoo.has(id)) toast('Counted. Hosts see one more person who wants this.'); break;
    case 'log-view': S.logView = S.logView === 'list' ? 'calendar' : 'list'; render(); break;
    case 'wallet': push('wallet'); break;
    case 'import': push('import', { id }); break;
    case 'import-ticket': S.tickets.add(id); S.saved.add(id); S.wallet.add(id); persist(); S.stack[S.stack.length - 1] = { v: 'tickets', id }; render(); toast(`Ticket imported from ${v}. It's in your wallet.`); break;
    // ---- Event day
    case 'room': S.room = 'general'; push('room', { id }); break;
    case 'room-thread': S.room = v; render(); break;
    case 'recap-cat': saveRecapInputs(); recapDraft.cats[id] = Number(v); render(); break;
    // ---- Profile and accounts
    case 'edit-profile': S.editProfile = !S.editProfile; render(); if (!S.editProfile) toast('Profile saved'); break;
    case 'day-toggle': S.days.has(v) ? S.days.delete(v) : S.days.add(v); persist(); render(); break;
    case 'accounts': push('accounts'); break;
    // ---- Host side
    case 'hprofile': push('hprofile'); break;
    case 'claim': if (S.host.claims.has(id)) { S.host.claims.delete(id); toast('Unclaimed'); } else { S.host.claims.add(id); toast('Claimed. Other hosts can plan this too; people who asked see every host.'); } render(); break;
    case 'create': push('create', id ? { id } : {}); break;
    case 'hseg': S.host.questSeg = v; render(); break;
    case 'duplicate': { const src = EV.get(id) || IDEAS.find((x) => x.id === id) || { title: 'Vinyl Listening Night' }; S.host.duplicated.push({ dup: true, id: 'dup' + Date.now(), text: 'Copy of ' + (src.title || src.text), scene: src.scene || 'live', count: 0 }); S.host.questSeg = 'drafts'; render(); toast('Duplicated into Drafts'); break; }
    case 'hrecap': push('hrecap', { id }); break;
    case 'draft-open': push('draft', { id }); break;
    case 'cq': { const t = document.getElementById('cq-title'); if (t) draftQ.title = t.value; const k = el.dataset.k; draftQ[k] = k === 'price' ? Number(v) : v; render(); break; }
    case 'cq-tag': case 'cq-pay': case 'cq-amen': { const t = document.getElementById('cq-title'); if (t) draftQ.title = t.value; const set = draftQ[{ 'cq-tag': 'tags', 'cq-pay': 'pay', 'cq-amen': 'amen' }[a]]; set.has(v) ? set.delete(v) : set.add(v); render(); break; }
    case 'cq-next': { const t = document.getElementById('cq-title'); if (t) draftQ.title = t.value; push('dayinfo', { id, fromCreate: true }); break; }
    case 'cq-publish': {
      const d = id && IDEAS.find((x) => x.id === id);
      const scene = [...draftQ.tags][0] || 'live';
      const start = nextOn({ Thu: 4, Fri: 5, Sat: 6, Sun: 0 }[draftQ.day] ?? 6, 20);
      const evId = 'pub-' + Date.now();
      const e = { age19: draftQ.age === '19', id: evId, title: draftQ.title || (d ? d.text : 'New quest'), scene, scene2: null, area: d ? d.area : 'Ossington', venue: 'Loop Collective pop-up space', host: 'loop', price: draftQ.price, blurb: d ? `Booked because ${d.count} people requested it on Sidequest.` : 'A new quest from Loop Collective.', start, end: new Date(start.getTime() + 3 * 3600e3), going: d ? Math.round(d.count * 0.2) : 0, isNew: true, demandBooked: !!d, rating: null, reviews: 0, updates: [], entrances: ['Laneway door'] };
      EVENTS.push(e); EV.set(evId, e); S.host.published.push(evId);
      if (d) S.host.claims.add(d.id);
      e.fromRequest = d ? d.id : null;
      S.stack = []; S.hostTab = 'quests'; S.host.questSeg = 'live'; push('published', { id: evId });
      toast(d ? `Published. ${d.count} people who requested it get an alert.` : 'Published to Weekly Quests');
      break;
    }
    case 'dayinfo': push('dayinfo', { id }); break;
    case 'guest': S.host.checked.has(id) ? S.host.checked.delete(id) : S.host.checked.add(id); render(); break;
    case 'hfilter': S.host[el.dataset.k] = v; render(); break;
    case 'iseg': S.host.insightSeg = v; render(); break;
    case 'ann': { const t = document.getElementById('ann-text'); if (t) annDraft.text = t.value; annDraft[el.dataset.k] = v; render(); break; }
    case 'ann-tpl': annDraft.text = v; render(); break;
    case 'ann-send': {
      const t = document.getElementById('ann-text'); const text = (t?.value || annDraft.text).trim();
      if (!text) { toast('Write an announcement first'); break; }
      const when = { now: 'Sent just now', '2h': 'Scheduled · 2 hours before doors', morning: 'Scheduled · morning of', custom: 'Scheduled · Sat 6 PM' }[annDraft.when];
      S.host.announcements.unshift({ to: annDraft.to, text, at: when }); annDraft.text = ''; render(); toast(annDraft.when === 'now' ? `Sent to ${annDraft.to.toLowerCase()}` : 'Scheduled'); break;
    }
    case 'plan': startPlan(id); break;
    case 'hub': if (S.stack[S.stack.length - 1]?.v === 'tickets') S.stack.pop(); push('hub', { id }); break;
    case 'checkin': push('checkin', { id }); break;
    case 'checkin-done': S.checkins.add(id); persist(); S.stack[S.stack.length - 1] = { v: 'checkin', id, done: true }; render(); break;
    case 'recap': push('recap', { id }); break;
    case 'recap-star': recapDraft.rating = Number(v); saveRecapInputs(); render(); break;
    case 'recap-tag': recapDraft.tags.has(id) ? recapDraft.tags.delete(id) : recapDraft.tags.add(id); saveRecapInputs(); render(); break;
    case 'recap-save': saveRecap(); break;
    case 'night': push('night', { id }); break;
    case 'seg': S.nightsSeg = v; render(); break;
    case 'wrapped': push('wrapped', { i: 0 }); break;
    case 'wrapped-next': { const i = Number(el.dataset.i); if (i >= 3) pop(); else { S.stack[S.stack.length - 1].i = i + 1; render(); } break; }
    case 'taste': S.tasteAdj[id] = clamp((S.tasteAdj[id] || 0) + Number(v) * 0.1, -0.8, 0.8); persist(); render(); break;
    case 'replay': S.stack = []; openOnboarding(); break;
    case 'mode-host': S.stack = []; if (!S.hostOnboarded) { openOnboarding('host'); break; } S.mode = 'host'; S.hostTab = 'demand'; render(); toast(`Host mode: ${HOSTS.loop.name}`); break;
    case 'mode-attendee': S.mode = 'attendee'; S.stack = []; S.tab = 'discover'; render(); break;
    case 'map-zoom': zoomMap(v === 'in' ? 0.7 : 1.4, { ...mapView }); clampMap(); mountMap(); break;
    case 'map-home': Object.assign(mapView, { x: AREAS[HOME][0] - 110, y: AREAS[HOME][1] - 110, w: 220, h: 220 }); clampMap(); mountMap(); break;
    case 'sixer': openChat(); break;
    case 'ask-about': openChat(`Is ${EV.get(id).title} a good pick for me and my crew? Compare it with one alternative.`); break;
    case 'idea': push('idea', { id }); break;
    case 'post-draft': {
      const d = IDEAS.find((x) => x.id === id);
      if (!S.host.drafts[id]) S.host.drafts[id] = { age19: store.get('agePolicy', 'all') === '19', interest: Math.round(d.count * 0.18), threshold: Math.round(d.count * 0.55 / 10) * 10, price: Math.max(10, d.budget - 5), sims: 0, status: 'testing', venue: false, promoted: false };
      S.stack.pop(); push('draft', { id }); break;
    }
    case 'simulate': { const dr = S.host.drafts[id]; const d = IDEAS.find((x) => x.id === id); dr.sims++; dr.interest = Math.min(d.count, dr.interest + Math.round(d.count * (dr.tweaked ? 0.28 : 0.12))); render(); break; }
    case 'tweak': { const dr = S.host.drafts[id]; dr.tweaked = true; dr.price = Math.max(10, dr.price - 5); dr.interest = Math.round(dr.interest * 1.35); toast('Moved to Saturday, price lowered'); render(); break; }
    case 'hstep': hostStep(id, el.dataset.k); break;
    case 'hevent': push('hevent', { id }); break;
    case 'mod': { const m = S.host.moderators[id] || (S.host.moderators[id] = new Set(['Priya'])); m.has(v) ? m.delete(v) : m.add(v); render(); break; }
    case 'post-update': {
      const inp = document.getElementById('upd-' + id); const text = inp?.value.trim();
      if (!text) { toast('Write an update first'); break; }
      EV.get(id).updates.push({ t: timeStr(new Date()), text }); render(); toast('Posted to event day mode'); break;
    }
  }
});
// Live search boxes (data-live): re-render on each keystroke, then put the caret back.
document.getElementById('app').addEventListener('input', (e) => {
  const k = e.target.dataset?.live; if (!k) return;
  const val = e.target.value;
  if (k === 'cq-tagq') draftQ.tagQ = val;
  else if (k === 'o-vibeq') O.vibeQ = val;
  else if (k === 'o-tagq') O.tagQ = val;
  else return;
  if (k.startsWith('o-')) renderOnb(); else render();
  const again = document.querySelector(`[data-live="${k}"]`);
  if (again) { again.focus(); again.setSelectionRange(val.length, val.length); }
});
document.getElementById('app').addEventListener('change', (e) => {
  if (e.target.id === 'recap-photos') {
    for (const f of e.target.files) recapDraft.photos.push(URL.createObjectURL(f));
    saveRecapInputs(); render();
  }
});
function saveRecapInputs() { const n = document.getElementById('recap-note'); if (n && recapDraft) recapDraft.note = n.value; }
function saveRecap() {
  saveRecapInputs();
  const r = recapDraft;
  S.recaps[r.id] = { rating: r.rating, tags: [...r.tags], photos: r.photos, note: r.note, confirmed: [] };
  persist();
  const p = PAST.find((x) => x.id === r.id);
  S.stack[S.stack.length - 1] = { v: 'night', id: r.id }; render();
  toast(`Saved. Sixer learned: ${r.rating >= 4 ? 'more' : 'less'} ${SCENES[p.scene].label}.`);
  [...r.tags].forEach((t, i) => setTimeout(() => { S.recaps[r.id].confirmed.push(t); if (S.stack.at(-1)?.v === 'night') render(); if (i === 0) toast(`${PEOPLE[t].short} confirmed the tag`); }, 1500 + i * 1200));
}
function startPlan(id) {
  if (EV.get(id).age19 && S.age !== 'adult') { push('agecheck', { id, next: 'plan' }); return; }
  if (!S.crewOn) { toast('Turn on Crew Blend in your profile first'); return; }
  if (!S.plans[id]) {
    const members = ['me', ...FRIENDS.filter((f) => S.crewSel.has(f))];
    const b = blend(members).find((x) => x.e.id === id);
    S.plans[id] = { members, score: b ? b.score : 80, replies: { me: 'in' } };
    members.filter((m) => m !== 'me').forEach((m, i) => setTimeout(() => { S.plans[id].replies[m] = 'in'; if (S.stack.at(-1)?.v === 'plan') render(); if (i === members.length - 2) toast('Everyone\'s in. Plan locked.'); }, 1100 + i * 900));
  }
  push('plan', { id });
}
function hostStep(id, k) {
  const dr = S.host.drafts[id];
  const d = IDEAS.find((x) => x.id === id);
  if (k === 'venue') { dr.venue = true; toast('Marked as booked'); }
  else if (k === 'publish') {
    if (!dr.venue) { toast('Book the venue first'); return; }
    if (dr.status === 'testing') {
      dr.status = 'published';
      const evId = 'pub-' + id;
      const start = nextOn(6, 20);
      const e = { age19: !!dr.age19, id: evId, title: d.text.replace(/^./, (c) => c.toUpperCase()), scene: d.scene, scene2: null, area: d.area, venue: 'Loop Collective pop-up space', host: 'loop', price: dr.price, blurb: `Booked because ${d.count} people requested it on Sidequest.`, start, end: new Date(start.getTime() + 3 * 3600e3), going: dr.interest, isNew: true, demandBooked: true, rating: null, reviews: 0, updates: [], entrances: ['Main entrance'] };
      EVENTS.push(e); EV.set(evId, e); S.host.published.push(evId); dr.eventId = evId;
      toast('Published with your ticket link');
    }
  } else if (k === 'promote') { if (dr.status === 'testing') { toast('Publish first'); return; } dr.promoted = !dr.promoted; toast(dr.promoted ? 'Promoted, with a clear label' : 'Promotion off'); }
  else if (k === 'alert') {
    if (dr.status !== 'published') { toast(dr.status === 'alerted' ? 'Alerts already sent' : 'Publish first'); return; }
    dr.status = 'alerted'; toast(`"You asked, it's happening" sent to ${dr.interest} people`);
  }
  render();
}

