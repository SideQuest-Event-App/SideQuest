/* Sketch 1 — actions. Each is (arg, el) => optional next screen id (may be async).
   Anything that changes data goes to the server with SQ.act(type, args); the rest is UI state in SQ.u. */
(function () {
  const SQ = window.SQ;
  const A = {};
  const U = () => SQ.u;
  const toast = (m) => SQ.toast(m);
  const me = () => SQ.d.user;
  const toggle = (arr, v) => {
    const i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(v);
  };

  SQ.defaultReqDraft = () => ({ text: "", origin: (me() && me().origin) || "union", when: "Fridays", size: "2 to 4", budget: me() && me().budget != null ? String(me().budget) : "", source: "manual" });
  SQ.emptyHostDraft = (over = {}) => ({ title: "", description: "", date: "", time: "20:00", price: "", vibes: [], ticketLink: (SQ.d.host && SQ.d.host.ticketLink) || "", dayInfo: { entrance: "", transit: "", home: "", coat: "" }, fromRequest: null, aiMode: null, ...over });

  // ---------- general ----------
  A.toast = (msg) => toast(msg);

  // ---------- attendee account and onboarding ----------
  A.demoLogin = async () => {
    await SQ.act("demoLogin");
    toast("Signed in as Alex, a sample attendee.");
    return "discover";
  };
  A.signup = async () => {
    if (!U().signup.name.trim()) return toast("Add your name to continue.");
    await SQ.act("signup", U().signup);
    return "ob-vibes";
  };
  A.toggleVibe = (v) => SQ.act("setProfile", { toggleVibe: v });
  A.vibesNext = () => (me().vibes.length < 3 ? toast("Pick at least 3 vibes to continue.") : "ob-past");
  A.togglePast = (v) => SQ.act("setProfile", { togglePast: v });
  A.addPast = async () => {
    const t = U().pastText.trim();
    if (!t) return;
    if (!me().past.includes(t)) await SQ.act("setProfile", { togglePast: t });
    U().pastText = "";
  };
  A.syncContacts = async () => {
    await SQ.act("setProfile", { contactsSynced: true });
    toast(`Contacts synced. ${Object.keys(SQ.d.friends).length} friends found.`);
  };
  A.toggleMember = (name) => SQ.act("toggleMember", { name });
  A.setOrigin = (o) => SQ.act("setProfile", { origin: o });
  A.setTransit = (t) => SQ.act("setProfile", { transit: t });
  A.setBudget = (v) => SQ.act("setProfile", { budget: v });
  A.setMaxMinutes = (v) => SQ.act("setProfile", { maxMinutes: v });
  A.finishOnboarding = async () => {
    await SQ.act("setProfile", { registered: true });
    return "discover";
  };

  // ---------- discover ----------
  A.setFilter = (f) => {
    U().filter = f;
  };
  A.search = async () => {
    const s = U().search;
    const q = s.q.trim();
    if (!q) return toast("Say what you're in the mood for, like \"jazz and cheap eats\".");
    Object.assign(s, { ran: q, loading: true, result: null, error: null });
    SQ.go("search");
    try {
      s.result = await SQ.post("/api/search", { userId: SQ.userId(), query: q });
    } catch (err) {
      s.error = err.message;
    }
    s.loading = false;
  };
  A.openQuest = (id) => {
    U().quest = Number(id);
    return "quest";
  };
  A.follow = async (host) => {
    const r = await SQ.act("follow", { host });
    toast(r.following ? `Following ${host}. You'll hear about their next quest.` : `Unfollowed ${host}.`);
  };
  A.save = async (id) => {
    const r = await SQ.act("save", { eventId: Number(id) });
    toast(r.saved ? "Saved to your Quest Log." : "Removed from saved.");
  };
  A.share = async (id) => {
    const e = SQ.ev(id);
    const text = `${e.title}, ${e.date} in ${e.neighbourhood}. ${SQ.priceLabel(e)}. Found on Sidequest.`;
    try {
      if (navigator.share) await navigator.share({ title: e.title, text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied. Paste it in your group chat.");
      }
    } catch {}
  };
  A.accept = async (id) => {
    await SQ.act("accept", { eventId: Number(id) });
    U().quest = Number(id);
    return "tickets";
  };
  A.gotTicket = () => {
    U().logTab = "Upcoming";
    return "questlog";
  };
  A.notForMe = async (id) => {
    await SQ.act("notForMe", { eventId: Number(id) });
    toast("Got it. Your taste avatar will skip things like that.");
    if (U().screen === "quest") SQ.back();
  };

  // ---------- parties ----------
  A.sendToParty = async (id) => {
    await SQ.act("sendToParty", { eventId: Number(id) });
    toast(`Sent to ${SQ.d.party.name}. It's in the group vote.`);
    return "party";
  };
  A.addToVote = (id) => SQ.act("sendToParty", { eventId: Number(id) });
  A.vote = (id) => SQ.act("vote", { eventId: Number(id) });
  A.lockPoll = async () => {
    const r = await SQ.act("lockPoll");
    toast(`${SQ.d.party.name} is going to ${SQ.ev(r.eventId).title}.`);
  };
  A.partyChat = async () => {
    const text = U().partyMsg.trim();
    if (!text) return;
    U().partyMsg = "";
    await SQ.act("partyChat", { text });
  };
  A.editMembers = () => {
    U().editMembers = !U().editMembers;
  };
  A.reblend = () => SQ.loadBlend(true);

  // ---------- Quest Requests ----------
  A.upvote = (id) => SQ.act("upvote", { requestId: Number(id) });
  A.newRequest = () => {
    U().reqDraft = SQ.defaultReqDraft();
    return "request-new";
  };
  A.requestGap = (interest) => {
    U().reqDraft = { ...SQ.defaultReqDraft(), text: interest, source: "gap" };
    return "request-new";
  };
  A.reqSet = (arg) => {
    const i = arg.indexOf(":");
    U().reqDraft[arg.slice(0, i)] = arg.slice(i + 1);
  };
  A.postRequest = async () => {
    const d = U().reqDraft;
    if (!d.text.trim()) return toast("Say what kind of quest you'd go to.");
    const r = await SQ.act("postRequest", d);
    toast(r.merged ? `Someone already asked for that. Your vote makes it ${r.votes}.` : "Request posted. If a host picks it up, you hear first.");
    U().reqDraft = SQ.defaultReqDraft();
    return "requests";
  };
  A.openNotif = (id) => {
    const n = me().notifications.find((x) => x.id === id);
    if (!n) return;
    if (n.rate && n.eventId) return A.openRate(n.eventId);
    if (n.eventId) return A.openQuest(n.eventId);
    if (n.requestId) {
      SQ.act("readNotifications");
      return "requests";
    }
  };

  // ---------- Quest Log, rating, event day ----------
  A.setLogTab = (t) => {
    U().logTab = t;
  };
  A.openEventDay = (id) => {
    U().quest = Number(id);
    return "eventday";
  };
  A.skipToAfter = (id) => SQ.act("skipToAfter", { eventId: Number(id) });
  A.didGo = async (id) => {
    await SQ.act("attended", { eventId: Number(id), attended: true });
    return A.openRate(id);
  };
  A.didntGo = async (id) => {
    await SQ.act("attended", { eventId: Number(id), attended: false });
    toast("Thanks for being honest. We only count nights people really went.");
  };
  A.openRate = (id) => {
    U().quest = Number(id);
    U().rating = { stars: 0, tags: [] };
    return "rate";
  };
  A.setStars = (n) => {
    U().rating.stars = Number(n);
  };
  A.toggleRateTag = (t) => toggle(U().rating.tags, t);
  A.submitRating = async () => {
    const r = U().rating;
    if (!r.stars) return toast("Tap a star rating first.");
    const res = await SQ.act("rate", { eventId: U().quest, stars: r.stars, tags: r.tags });
    toast(res.learned && res.learned.length ? `Story collected. Your taste avatar learned: ${res.learned.join(", ")}.` : "Story collected. Your taste avatar just updated.");
    U().logTab = "Completed";
    return "profile";
  };
  A.findParty = (id) => {
    const e = SQ.ev(id);
    const crew = [...new Set([...SQ.partyGoing(e), ...(SQ.d.party.locked === e.id ? SQ.d.party.members : [])])];
    const spots = ["near the stage", "at the bar", "by the coat check", "out front"];
    toast(crew.length ? crew.map((n, i) => `${n} is ${spots[i % spots.length]}`).join(". ") + "." : "No one from your party is at this one. Send it to them?");
  };
  A.eventChat = async () => {
    const text = U().eventMsg.trim();
    if (!text) return;
    U().eventMsg = "";
    await SQ.act("eventChat", { eventId: U().quest, text });
  };

  // ---------- profile and switching ----------
  A.setTheme = (t) => SQ.setTheme(t);
  A.switchToHost = () => (SQ.d.host ? "host-dashboard" : "host-type");
  A.switchToAttendee = () => (me() ? (me().registered ? "discover" : "ob-vibes") : "landing");
  A.signOut = () => {
    SQ.setIds({ user: null });
    SQ.u.history = [];
    toast("Signed out.");
    return SQ.refresh().then(() => "landing");
  };

  // ---------- host registration ----------
  A.hostType = (t) => SQ.act("hostSet", { type: t });
  A.hostTypeNext = () => {
    const r = U().hostReg;
    if (SQ.d.host && SQ.d.host.name && !r.name) Object.assign(r, { name: SQ.d.host.name, email: SQ.d.host.email });
    return "host-account";
  };
  A.hostLoginAs = async (name) => {
    await SQ.act("hostLoginAs", { name });
    toast(`Signed in as ${name}.`);
    SQ.u.history = [];
    return "host-dashboard";
  };
  A.hostAccount = async () => {
    const r = U().hostReg;
    if (!r.name.trim()) return toast("Add your host or venue name.");
    await SQ.act("hostSet", { name: r.name, email: r.email });
    return "host-profile";
  };
  A.hostVibe = (v) => SQ.act("hostSet", { toggleVibe: v });
  A.hostArea = (a) => SQ.act("hostSet", { area: a });
  A.hostProfile = async () => {
    const r = U().hostReg;
    await SQ.act("hostSet", { bio: r.bio, social: r.social });
    return "host-verify";
  };
  A.hostTicketing = (t) => SQ.act("hostSet", { ticketing: t });
  A.hostTicketingNext = async () => {
    await SQ.act("hostSet", { ticketLink: U().hostReg.ticketLink });
    return "host-team";
  };
  A.teamRole = (arg) => {
    const [i, role] = arg.split(":");
    U().hostReg.team[Number(i)].role = role;
  };
  A.teamAdd = () => {
    U().hostReg.team.push({ email: "", role: "Door staff" });
  };
  A.hostSubmit = async () => {
    await SQ.act("hostSet", { team: U().hostReg.team.filter((m) => m.email.trim()), submit: true });
    return "host-pending";
  };
  A.hostApprove = async () => {
    await SQ.act("hostApprove");
    toast("Approved. Your host tools are unlocked.");
  };

  // ---------- host: create and publish ----------
  A.newDraft = () => {
    U().hostDraft = SQ.emptyHostDraft();
    return "host-create";
  };
  A.duplicate = (id) => {
    const e = SQ.ev(id);
    const start = new Date(e.startsAt);
    const time = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
    U().hostDraft = SQ.emptyHostDraft({ title: `${e.title} (next one)`, description: e.description, time, price: String(e.price), vibes: [...(e.vibes || [])], ticketLink: e.ticketLink || "", dayInfo: { entrance: e.dayInfo.entrance || "", transit: e.dayInfo.transit || "", home: e.dayInfo.home || "", coat: e.dayInfo.coat || "" } });
    toast("Copied. Pick a new day.");
    return "host-create";
  };
  A.draftSet = (arg) => {
    const i = arg.indexOf(":");
    U().hostDraft[arg.slice(0, i)] = arg.slice(i + 1);
  };
  A.draftVibe = (v) => toggle(U().hostDraft.vibes, v);
  A.draftNext = () => {
    const d = U().hostDraft;
    if (!d.title.trim() || !d.date) return toast("Add a title and pick a day to continue.");
    return "host-create-dayinfo";
  };
  A.aiDraft = async () => {
    const d = U().hostDraft;
    if (!d.fromRequest) return;
    U().drafting = true;
    SQ.render();
    try {
      const r = await SQ.post("/api/draft", { hostId: SQ.hostId(), requestId: d.fromRequest });
      Object.assign(d, { title: r.title, description: r.description, vibes: r.vibes.length ? r.vibes : d.vibes, price: r.price == null ? d.price : String(r.price), time: r.time || d.time, aiMode: r.mode });
      if (r.error) toast("The AI didn't answer, so this is a simple draft.");
    } catch (err) {
      toast(err.message);
    }
    U().drafting = false;
  };
  A.publish = async () => {
    const r = await SQ.act("publish", { draft: U().hostDraft });
    U().hostQuest = r.eventId;
    U().published = r;
    U().hostDraft = SQ.emptyHostDraft();
    SQ.u.history = [];
    return "host-published";
  };
  A.viewAsAttendee = (id) => {
    if (!me()) return toast("Sign up as an attendee (Profile > Request a quest) to see it in a feed.");
    U().quest = Number(id);
    return "quest";
  };

  // ---------- host: Demand Insights ----------
  A.setDemandArea = (a) => {
    U().demandArea = a;
  };
  A.openRequest = (id) => {
    U().hostRequest = Number(id);
    return "host-request";
  };
  A.claim = async (id) => {
    const r = await SQ.act("claim", { requestId: Number(id) });
    toast(`Claimed. ${r.told} requesters were told you're on it.`);
  };
  A.unclaim = (id) => SQ.act("unclaim", { requestId: Number(id) });
  // The next Friday / Saturday / Sunday / weeknight, for a request's "when"
  function nextDateFor(when) {
    const target = { Fridays: [5], Saturdays: [6], Sundays: [0], Weeknights: [1, 2, 3, 4] }[when];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(SQ.now().getTime() + i * 86400000);
      const key = d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
      if (!target || target.includes(new Date(key).getUTCDay())) return key;
    }
    return "";
  }
  A.draftFromRequest = (id) => {
    const r = SQ.req(id);
    U().hostDraft = SQ.emptyHostDraft({ fromRequest: r.id, title: r.text.replace(/^\w/, (c) => c.toUpperCase()), date: nextDateFor(r.when), price: r.budget == null ? "" : String(r.budget) });
    setTimeout(() => A.aiDraft().then(SQ.render), 0); // draft with AI straight away
    return "host-create";
  };

  // ---------- host: event day, messages, recap ----------
  A.openHostQuest = (id) => {
    U().hostQuest = Number(id);
    const e = SQ.ev(id);
    return e && (e.over || e.ended) ? "host-recap" : "host-checkin";
  };
  A.openCheckin = (id) => {
    U().hostQuest = Number(id);
    return "host-checkin";
  };
  A.openRecap = (id) => {
    U().hostQuest = Number(id);
    return "host-recap";
  };
  A.checkin = (name) => SQ.act("checkin", { eventId: U().hostQuest, name });
  A.endEvent = async (id) => {
    await SQ.act("endEvent", { eventId: Number(id) });
    toast("Event ended. Attendees are asked if they went and how it was.");
    U().hostQuest = Number(id);
    return "host-recap";
  };
  A.msgEvent = (id) => {
    U().msg.eventId = Number(id);
  };
  A.msgAudience = (k) => {
    U().msg.audience = k;
  };
  A.hostMessage = async () => {
    const m = U().msg;
    if (!m.eventId) return toast("Pick which quest this is about.");
    if (!m.text.trim()) return toast("Write an update first.");
    const r = await SQ.act("hostMessage", m);
    m.text = "";
    toast(`Update sent${r.reached ? ` to ${r.reached} ${r.reached === 1 ? "person" : "people"}` : ""}. It's pinned in Event Day Mode too.`);
  };

  SQ.actions = A;
})();
