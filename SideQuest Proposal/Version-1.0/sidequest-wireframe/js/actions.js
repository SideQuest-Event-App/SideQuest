/* Sidequest wireframe — actions.
   Each action is (state, arg, ctx) => optional next screen id.
   ctx.val(id) reads an input on the current screen, ctx.toast(msg) shows a message,
   ctx.notify(title, body, questId) sends an in-app notification to the attendee. */
(function () {
  const SQ = window.SQ;
  const A = {};
  const quest = (s, id) => s.quests.find((q) => q.id === id);
  const request = (s, id) => s.requests.find((r) => r.id === id);
  const toggle = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };
  const hostName = (s) => s.host.name || 'The Garrison';
  const dayFromWhen = { Fridays: 'Fri', Saturdays: 'Sat', Sundays: 'Sun', Weeknights: 'Tonight' };

  // ----- demo setup helpers (used when jumping straight into a flow) -----
  SQ.ensureAttendee = (s) => {
    if (s.user.registered) return;
    Object.assign(s.user, {
      name: s.user.name || 'Alex', email: s.user.email || 'alex@email.com', registered: true,
      vibes: s.user.vibes.length ? s.user.vibes : ['Techno', 'Indie gigs', 'Art openings', 'Warehouse raves'],
      past: s.user.past.length ? s.user.past : ['Nuit Blanche 2025', 'Boiler Room Toronto'],
      contactsSynced: true, area: s.user.area || 'West End', transit: s.user.transit || 'TTC'
    });
  };
  SQ.ensureHost = (s) => {
    if (s.host.registered) return;
    Object.assign(s.host, {
      type: s.host.type || 'Venue', name: s.host.name || 'The Garrison', email: s.host.email || 'events@thegarrison.ca',
      vibes: s.host.vibes.length ? s.host.vibes : ['Techno', 'Warehouse raves', 'Indie gigs'],
      area: s.host.area || 'West End', verification: 'approved', ticketing: s.host.ticketing || 'DICE', registered: true
    });
  };

  // ----- general -----
  A.toast = (s, arg, ctx) => { ctx.toast(arg); };
  A.demoLogin = (s) => { SQ.ensureAttendee(s); return 'discover'; };

  // ----- attendee registration -----
  A.signup = (s, arg, ctx) => {
    s.user.name = ctx.val('f-name') || 'Alex';
    s.user.email = ctx.val('f-email') || 'alex@email.com';
    return 'ob-vibes';
  };
  A.toggleVibe = (s, v) => { toggle(s.user.vibes, v); };
  A.vibesNext = (s, arg, ctx) => {
    if (s.user.vibes.length < 3) { ctx.toast('Pick at least 3 vibes to continue.'); return; }
    return 'ob-past';
  };
  A.togglePast = (s, e) => { toggle(s.user.past, e); };
  A.syncContacts = (s, arg, ctx) => { s.user.contactsSynced = true; ctx.toast('Contacts synced. 4 friends found.'); };
  A.toggleMember = (s, f) => { toggle(s.party.members, f); };
  A.setArea = (s, a) => { s.user.area = a; };
  A.setTransit = (s, t) => { s.user.transit = t; };
  A.finishOnboarding = (s) => { s.user.registered = true; if (!s.user.name) s.user.name = 'Alex'; return 'discover'; };

  // ----- discover and quests -----
  A.openQuest = (s, id) => { s.currentQuest = id; return 'quest'; };
  A.follow = (s, h, ctx) => { toggle(s.user.following, h); ctx.toast(s.user.following.includes(h) ? `Following ${h}` : `Unfollowed ${h}`); };
  A.toggleSave = (s, arg, ctx) => { const q = quest(s, s.currentQuest); q.saved = !q.saved; ctx.toast(q.saved ? 'Saved to your Quest Log' : 'Removed from saved'); };
  A.accept = (s, arg, ctx) => { quest(s, s.currentQuest).accepted = true; ctx.toast('Quest accepted'); return 'tickets'; };
  A.gotTicket = (s) => { s.logTab = 'Upcoming'; return 'questlog'; };
  A.sendToParty = (s, arg, ctx) => {
    if (!(s.currentQuest in s.party.poll)) s.party.poll[s.currentQuest] = 0;
    s.party.locked = null;
    ctx.toast(`Sent to ${s.party.name}. It's in the group vote.`);
    return 'party';
  };

  // ----- map -----
  // Tapping an active filter again turns it back off.
  A.mapSet = (s, arg) => {
    const i = arg.indexOf(':');
    const k = arg.slice(0, i), v = arg.slice(i + 1);
    s.map[k] = s.map[k] === v ? SQ.defaultMapFilters()[k] : v;
    s.map.selected = null;
  };
  A.mapClear = (s, arg, ctx) => { s.map = SQ.defaultMapFilters(); ctx.toast('Filters cleared'); };
  A.mapSelect = (s, id) => { s.map.selected = s.map.selected === id ? null : id; };
  A.mapSendToParty = (s, id, ctx) => { s.currentQuest = id; return A.sendToParty(s, null, ctx); };

  // ----- parties -----
  A.addToPoll = (s, id) => { if (!(id in s.party.poll)) s.party.poll[id] = 0; s.party.locked = null; };
  A.vote = (s, id) => {
    const p = s.party;
    if (p.myVote) p.poll[p.myVote] = Math.max(0, p.poll[p.myVote] - 1);
    if (p.myVote === id) { p.myVote = null; return; }
    p.myVote = id; p.poll[id] += 1;
  };
  A.lockPoll = (s, arg, ctx) => {
    const [top] = Object.entries(s.party.poll).sort((a, b) => b[1] - a[1]);
    if (!top) return;
    s.party.locked = top[0];
    quest(s, top[0]).accepted = true;
    ctx.toast(`${s.party.name} is going to ${quest(s, top[0]).title}. Added to everyone's Quest Log.`);
  };
  A.partyChat = (s, arg, ctx) => { const t = ctx.val('f-chat'); if (t) s.party.chat.push({ from: 'You', text: t }); };

  // ----- quest requests (attendee) -----
  A.upvote = (s, id) => { const r = request(s, id); r.voted = !r.voted; r.votes += r.voted ? 1 : -1; };
  A.reqSet = (s, arg, ctx) => {
    const [k, v] = arg.split(':');
    s.requestDraft = Object.assign({ area: 'West End', when: 'Fridays', size: '2 to 4' }, s.requestDraft || {});
    s.requestDraft.text = ctx.val('f-req') || s.requestDraft.text;
    s.requestDraft[k] = v;
  };
  A.postRequest = (s, arg, ctx) => {
    const d = Object.assign({ area: 'West End', when: 'Fridays', size: '2 to 4' }, s.requestDraft || {});
    const text = ctx.val('f-req') || d.text || 'Filipino indie night';
    const id = 'r' + (s.requests.length + 1) + Date.now().toString().slice(-3);
    s.requests.push({ id, text, area: d.area, when: d.when, size: d.size, votes: 88, parties: 21, voted: true, mine: true, status: 'open', claimedBy: null, questId: null });
    s.currentRequest = id;
    s.requestDraft = null;
    ctx.toast('Request posted. 87 others want this too. We\'ll tell you first if a host picks it up.');
    return 'requests';
  };

  // ----- quest log, rating, event day -----
  A.setLogTab = (s, t) => { s.logTab = t; };
  A.openEventDay = (s, id) => { s.currentQuest = id; return 'eventday'; };
  A.completeQuest = (s, id) => { quest(s, id).completed = true; s.currentQuest = id; s.rating = { stars: 0, tags: [] }; return 'rate'; };
  A.openRate = (s, id) => { s.currentQuest = id; s.rating = { stars: 0, tags: [] }; return 'rate'; };
  A.setStars = (s, n) => { s.rating.stars = Number(n); };
  A.toggleRateTag = (s, t) => { toggle(s.rating.tags, t); };
  A.submitRating = (s, arg, ctx) => {
    if (!s.rating.stars) { ctx.toast('Tap a star rating first.'); return; }
    const q = quest(s, s.currentQuest);
    q.rating = s.rating.stars; q.completed = true;
    if (s.rating.stars >= 4) q.tags.forEach((t) => { if (!s.user.vibes.includes(t)) s.user.vibes.push(t); });
    ctx.toast('Story collected. Your taste avatar just updated.');
    return 'profile';
  };
  A.findParty = (s, arg, ctx) => { ctx.toast('Maya is near the stage. Jordan is at the bar.'); };
  A.eventChat = (s, arg, ctx) => { const t = ctx.val('f-echat'); if (t) s.eventChat.push({ from: 'You', text: t }); };

  // ----- host registration -----
  A.hostType = (s, t) => { s.host.type = t; };
  A.hostTypeNext = (s, arg, ctx) => { if (!s.host.type) { ctx.toast('Choose a host type to continue.'); return; } return 'host-account'; };
  A.hostAccount = (s, arg, ctx) => { s.host.name = ctx.val('h-name') || 'The Garrison'; s.host.email = ctx.val('h-email') || 'events@thegarrison.ca'; return 'host-profile'; };
  A.toggleHostVibe = (s, v) => { toggle(s.host.vibes, v); };
  A.setHostArea = (s, a) => { s.host.area = a; };
  A.hostProfile = (s, arg, ctx) => {
    s.host.bio = ctx.val('h-bio') || s.host.bio;
    if (!s.host.area) s.host.area = 'West End';
    if (!s.host.vibes.length) s.host.vibes = ['Techno', 'Warehouse raves'];
    return 'host-verify';
  };
  A.setTicketing = (s, t) => { s.host.ticketing = t; };
  A.hostTicketing = (s, arg, ctx) => { s.host.ticketLink = ctx.val('h-link'); if (!s.host.ticketing) s.host.ticketing = 'DICE'; return 'host-team'; };
  const captureTeam = (s, ctx) => s.host.team.forEach((m, i) => { m.email = ctx.val('h-team-' + i) || m.email; });
  A.setRole = (s, arg, ctx) => { captureTeam(s, ctx); const [i, role] = arg.split(':'); s.host.team[Number(i)].role = role; };
  A.addTeam = (s, arg, ctx) => { captureTeam(s, ctx); s.host.team.push({ email: '', role: 'Door staff' }); };
  A.submitHost = (s, arg, ctx) => { captureTeam(s, ctx); s.host.verification = 'pending'; return 'host-pending'; };
  A.approveHost = (s, arg, ctx) => { s.host.verification = 'approved'; s.host.registered = true; ctx.toast('Approved. Your host tools are unlocked.'); };

  // ----- host: create and publish -----
  const captureDraft = (s, ctx) => {
    if (!s.draft) return;
    ['title', 'time', 'price'].forEach((k) => { const v = ctx.val('d-' + k); if (v !== null) s.draft[k] = v; });
  };
  A.newDraft = (s) => { SQ.ensureHost(s); s.draft = { title: '', day: '', time: '', price: '', tags: [], fromRequest: null }; return 'host-create'; };
  A.duplicate = (s, id) => {
    const q = quest(s, id);
    s.draft = { title: q.title + ' (next one)', day: q.day, time: q.time, price: q.price, tags: q.tags.slice(), fromRequest: null, dayInfo: Object.assign({}, q.dayInfo) };
    return 'host-create';
  };
  A.draftSet = (s, arg, ctx) => { captureDraft(s, ctx); const [k, v] = arg.split(':'); s.draft[k] = v; };
  A.draftTag = (s, v, ctx) => { captureDraft(s, ctx); toggle(s.draft.tags, v); };
  A.draftNext = (s, arg, ctx) => {
    captureDraft(s, ctx);
    if (!s.draft.title || !s.draft.day) { ctx.toast('Add a title and pick a day to continue.'); return; }
    return 'host-create-dayinfo';
  };
  A.publish = (s, arg, ctx) => {
    SQ.ensureHost(s);
    const d = s.draft || { title: 'Untitled quest', day: 'Fri', time: '10 PM', price: '$20', tags: [] };
    const dayInfo = {
      entrance: ctx.val('d-entrance') || SQ.defaultDayInfo().entrance,
      transit: ctx.val('d-transit') || SQ.defaultDayInfo().transit,
      home: ctx.val('d-home') || SQ.defaultDayInfo().home,
      coat: ctx.val('d-coat') || SQ.defaultDayInfo().coat
    };
    const id = 'q' + (s.quests.length + 1) + Date.now().toString().slice(-3);
    s.quests.push({ id, title: d.title, host: hostName(s), day: d.day, time: d.time || '9 PM', area: s.host.area || 'West End',
      price: d.price || 'Free', tags: d.tags.length ? d.tags : ['Indie gigs'], going: ['Maya'], dayInfo, fromRequest: d.fromRequest });
    if (d.fromRequest) {
      const r = request(s, d.fromRequest);
      r.status = 'live'; r.questId = id;
      if (r.mine || r.voted) ctx.notify('Your Quest Request is live', `${hostName(s)} made "${r.text}" happen. You get first dibs.`, id);
    }
    s.lastPublished = id; s.draft = null;
    return 'host-published';
  };
  A.viewAsAttendee = (s) => { SQ.ensureAttendee(s); s.currentQuest = s.lastPublished; return 'quest'; };

  // ----- host: demand insights -----
  A.setDemandArea = (s, a) => { s.demandArea = a; };
  A.openRequest = (s, id) => { s.currentRequest = id; return 'host-request'; };
  A.claim = (s, arg, ctx) => {
    SQ.ensureHost(s);
    const r = request(s, s.currentRequest);
    r.status = 'claimed'; r.claimedBy = hostName(s);
    if (r.mine || r.voted) ctx.notify(`${hostName(s)} is on it`, `A host claimed your request "${r.text}". You'll hear first when it's live.`);
    ctx.toast(`Claimed. ${r.votes} requesters were told you're on it.`);
  };
  A.draftFromRequest = (s) => {
    const r = request(s, s.currentRequest);
    const tags = SQ.VIBES.filter((v) => r.text.toLowerCase().includes(v.toLowerCase().split(' ')[0]));
    s.draft = { title: r.text.replace(/^\w/, (c) => c.toUpperCase()), day: dayFromWhen[r.when] || 'Fri', time: '9 PM', price: '$15',
      tags: tags.length ? tags : ['Indie gigs'], fromRequest: r.id };
    return 'host-create';
  };

  // ----- host: messaging and event day -----
  A.hostMessage = (s, arg, ctx) => {
    const text = ctx.val('m-text') || 'Coat check is cash only tonight.';
    s.hostMessages.push({ text });
    s.eventChat.push({ from: 'Host', text });
    ctx.notify(`Update from ${hostName(s)}`, text);
    ctx.toast('Update sent to tonight\'s attendees.');
  };
  A.openCheckin = (s, id) => { s.currentQuest = id; return 'host-checkin'; };
  A.openRecap = (s, id) => { s.currentQuest = id; return 'host-recap'; };
  A.checkin = (s, i) => { const g = s.guests[Number(i)]; g.in = !g.in; };
  A.endEvent = (s) => { quest(s, s.currentQuest).completed = true; return 'host-recap'; };

  SQ.actions = A;
})();
