/* Sketch 2 — actions. Each is (arg, el) => optional next screen id (may be async).
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

  SQ.defaultReqDraft = () => ({ text: "", origin: (me() && me().origin) || "union", when: "Friday late", vibe: "", area: (me() && me().homeArea) || "", size: "2 to 4", budget: me() && me().budget != null ? String(me().budget) : "", source: "manual" });
  SQ.emptyHostDraft = (over = {}) => ({ title: "", description: "", date: "", time: "20:00", endTime: "", price: "", vibes: [], venue: { name: SQ.d.host && SQ.d.host.type === "Venue" ? SQ.d.host.name : "", address: "" }, image: null, ticketLink: (SQ.d.host && SQ.d.host.ticketLink) || "", dayInfo: { entrance: "", transit: "", home: "", coat: "" }, fromRequest: null, aiMode: null, ...over });
  SQ.emptySpotDraft = () => ({ title: "", description: "", date: "", time: "20:00", endTime: "", price: "", vibes: [], venue: { name: "", address: "" }, organizer: "", ticketLink: "", image: null });

  // ---------- general ----------
  A.toast = (msg) => toast(msg);

  // ---------- attendee account and onboarding ----------
  A.demoLogin = async () => {
    await SQ.act("demoLogin");
    toast("Signed in as Alex, a sample attendee.");
    return "discover";
  };
  A.signup = async () => {
    await SQ.act("signup", U().signup);
    return "ob-vibes";
  };
  // Log in: email -> 6-digit code -> whichever account (attendee or host) uses that email
  A.requestCode = async () => {
    const l = U().login;
    l.error = null;
    try {
      const r = await SQ.post("/api/act", { type: "requestCode", args: { email: l.email } }).then((x) => x.result);
      Object.assign(l, { code: "", demoCode: r.demoCode || null, resendAt: Date.now() + 60000 });
      SQ.render();
      return "login-code";
    } catch (err) {
      l.error = err.message;
    }
  };
  A.verifyCode = async () => {
    const l = U().login;
    l.error = null;
    try {
      const r = (await SQ.post("/api/act", { type: "verifyCode", args: { email: l.email, code: l.code } })).result;
      SQ.setIds({ user: r.userId, host: r.hostId });
      await SQ.refresh();
      Object.assign(l, { code: "", demoCode: null });
      return r.role === "host" ? "host-dashboard" : me() && me().registered ? "discover" : "ob-vibes";
    } catch (err) {
      l.error = err.message;
    }
  };
  A.setRole = (r) => {
    U().role = r;
  };
  A.roleNext = () => (U().role === "host" ? "host-type" : "signup");
  // A vibe tile stands for several vibes: picking it adds them all, unpicking removes them
  A.toggleTile = (label) => {
    const t = SQ.TILES.find((x) => x[0] === label);
    const v = me().vibes;
    const on = t[2].some((x) => v.includes(x));
    return SQ.act("setProfile", { vibes: on ? v.filter((x) => !t[2].includes(x)) : [...v, ...t[2]] });
  };
  A.toggleVibe = (v) => SQ.act("setProfile", { vibes: me().vibes.includes(v) ? me().vibes.filter((x) => x !== v) : [...me().vibes, v] });
  A.addVibe = async () => {
    const t = U().vibeText.trim();
    if (!t) return;
    for (const v of t.split(/,\s*/).filter(Boolean)) await SQ.act("setProfile", { addVibe: v });
    U().vibeText = "";
  };
  A.vibesNext = () => (me().vibes.length < 2 ? toast("Pick two or more to continue.") : "ob-past");
  A.togglePast = (v) => SQ.act("setProfile", { togglePast: v });
  A.toggleWhen = (w) => SQ.act("setProfile", { toggleWhen: w });
  A.setDays = (d) => SQ.act("setProfile", { days: d });
  // The first area picked is home; trip times start from the station nearest it
  A.toggleArea = (name) => {
    const u = me();
    const areas = u.areas || [];
    const rest = areas.filter((a) => a !== name);
    const home = areas.includes(name) ? (u.homeArea === name ? rest[0] || "" : u.homeArea) : u.homeArea || name;
    const h = SQ.HOODS.find((x) => x[0] === home);
    return SQ.act("setProfile", { toggleArea: name, homeArea: home, origin: h ? h[3] : u.origin });
  };
  A.addArea = async () => {
    const q = U().areaText.trim().toLowerCase();
    const h = q && SQ.HOODS.find((x) => x[0].toLowerCase().includes(q));
    if (!h) return q && toast("That neighbourhood isn't on the map yet.");
    U().areaText = "";
    if (!(me().areas || []).includes(h[0])) await A.toggleArea(h[0]);
  };
  A.findFriend = () => {};
  A.syncContacts = async () => {
    await SQ.act("setProfile", { contactsSynced: true });
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
  // Discover filters (UI state; the feed itself stays the taste avatar's picks)
  const DF = () => U().df;
  A.dfTod = (v) => { DF().tod = v; };
  A.dfSet = (kv) => {
    const [k, v] = kv.split(/:(.*)/s);
    DF()[k] = DF()[k] === v ? "" : v;
  };
  A.dfCat = (c) => toggle(DF().cats, c);
  A.dfCats = (c) => { DF().cats = c ? [c] : []; };
  A.dfFriends = (v) => { DF().friends = !!v; };
  A.dfAmen = (n) => toggle(DF().amen, n);
  A.dfClear = () => { U().df = { tod: "Anytime", cats: [], price: "", dist: "", friends: false, after: "", amen: [] }; };
  A.setWeekTab = (t) => { U().weekTab = t; };
  A.openMix = (l) => {
    U().mix = l;
    return "mix";
  };
  A.mapPin = (id) => {
    U().mapSel = U().mapSel === Number(id) ? null : Number(id);
    const e = SQ.ev(id);
    const v = U().maps.discover;
    // bring the picked pin into view, above the sheet
    if (U().mapSel && v && e.venue) [v.x, v.y] = SQ.projMap(e.venue.lat, e.venue.lng).map((n, i) => n + (i ? 120 / v.z : 0));
    if (U().screen !== "discover-map") return "discover-map";
  };
  const shareText = async (text) => {
    try {
      if (navigator.share) await navigator.share({ title: "Sidequest", text });
      else {
        await navigator.clipboard.writeText(text);
        toast("Copied. Paste it in your group chat.");
      }
    } catch {}
  };
  A.shareWeek = () => shareText("My Weekly Sidequests on Sidequest, picked for my taste.");
  A.shareMix = () => shareText(`The ${U().mix || "Live Sets"} Vibe Mix on Sidequest this week.`);
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
  // Get tickets: 19+ sidequests ask your age once; free ones just go in your Sidequests; the rest hand off to the host's ticket page
  A.getTickets = async (id) => {
    const e = SQ.ev(id), u = SQ.me();
    U().quest = e.id;
    if (SQ.is19(e) && u.adult !== true) return u.adult === false ? "all-ages" : "age-check";
    if (e.price !== 0 && (e.ticketLink || e.sourceUrl)) return "tickets";
    await SQ.act("accept", { eventId: e.id });
    toast("You're in. It's in your Sidequests.");
    return A.gotTicket();
  };
  A.adultYes = async () => {
    await SQ.act("setProfile", { adult: true });
    SQ.u.history = SQ.u.history.filter((s) => s !== "age-check");
    return A.getTickets(U().quest);
  };
  A.adultNo = async () => {
    await SQ.act("setProfile", { adult: false });
    return "all-ages";
  };
  A.haveTicket = async (id) => {
    await SQ.act("accept", { eventId: Number(id) });
    SQ.startWallet(id);
    return "ticket-import";
  };
  A.connectTickets = (name) => toast(`${name} can't connect yet. A screenshot of the ticket works just as well.`);
  A.gotTicket = () => {
    U().logTab = "Upcoming";
    return "questlog";
  };
  A.addQuestTicket = () => A.addTicket(U().quest);
  A.notForMe = async (id) => {
    await SQ.act("notForMe", { eventId: Number(id) });
    toast("Got it. Your taste avatar will skip things like that.");
    if (U().screen === "quest") SQ.back();
  };

  // ---------- events found by attendees: a link, a screenshot, or typed in -> draft -> unverified event ----------
  // open: the draft form is showing; mode: what filled it ("listing" = the page's own event data, or the AI)
  SQ.emptyShot = () => ({ link: "", open: false, preview: "", loading: false, error: null, mode: null, draft: { title: "", date: "", time: "", endTime: "", venue: "", address: "", area: "", price: "", priceTo: "", organizer: "", description: "", vibes: [], sourceUrl: "", source: "" } });
  A.addEvent = () => {
    U().shot = SQ.emptyShot();
    return "add-event";
  };
  // Shrink the screenshot to at most 1600px (JPEG) so uploads are quick and fit the AI's image limits
  const shrink = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("That file isn't an image we can read."));
    img.src = URL.createObjectURL(file);
  });
  // A fresh form that keeps the link they already pasted (after "we can't read that link")
  function freshShot() {
    const link = ((U().shot || {}).link || "").trim();
    const s = { ...SQ.emptyShot(), link };
    if (link) {
      s.draft.sourceUrl = link;
      try {
        s.draft.source = SQ.siteName(link);
      } catch {}
    }
    return (U().shot = s);
  }
  A.readShot = async (_, input) => {
    const file = input.files && input.files[0];
    if (!file) return;
    const s = freshShot();
    s.loading = true;
    try {
      s.preview = await shrink(file);
      SQ.render();
      const r = await SQ.post("/api/extract", { userId: SQ.userId(), image: s.preview });
      s.mode = r.mode;
      s.error = r.error || null;
      if (r.draft) Object.assign(s.draft, r.draft, { sourceUrl: r.draft.sourceUrl || s.draft.sourceUrl, source: r.draft.source || s.draft.source });
      if (s.draft.sourceUrl) A.loadCover(s.draft.sourceUrl).then(() => SQ.render());
    } catch (err) {
      s.error = err.message;
    }
    s.loading = false;
    s.open = true;
  };
  A.readLink = async () => {
    const url = U().shot.link.trim();
    if (!url) return toast("Paste the event's link first.");
    const s = (U().shot = { ...SQ.emptyShot(), link: url, loading: true });
    SQ.render();
    try {
      const r = await SQ.post("/api/from-link", { userId: SQ.userId(), url });
      if (r.existingId) {
        U().shot = null;
        U().quest = r.existingId;
        toast("That event is already on Sidequest. Here it is.");
        return "quest";
      }
      s.mode = r.mode;
      s.error = r.error || null;
      Object.assign(s.draft, r.draft || { sourceUrl: url });
      s.cover = (r.draft && r.draft.image) || null;
      if (r.mode === "unsupported") {
        s.loading = false; // no form: the message points to the screenshot and "Enter it yourself" buttons
        return;
      }
    } catch (err) {
      s.error = err.message;
      s.draft.sourceUrl = url;
    }
    s.loading = false;
    s.open = true;
  };
  // The cover preview: the listing's photo for the link in "Link to the original listing"
  A.loadCover = async (url) => {
    const s = U().shot;
    s.cover = null;
    if (!/^https?:\/\/\S+\.\S+/.test(url.trim())) return;
    s.coverLoading = true;
    SQ.render();
    try {
      const r = await SQ.post("/api/cover", { userId: SQ.userId(), url: url.trim() });
      if (s.draft.sourceUrl.trim() === url.trim()) s.cover = r.image;
    } catch {}
    s.coverLoading = false;
  };
  A.manualEvent = () => {
    const s = freshShot();
    s.open = true;
    if (s.link) A.loadCover(s.link).then(() => SQ.render());
  };
  A.shotArea = (a) => {
    U().shot.draft.area = U().shot.draft.area === a ? "" : a;
  };
  A.shotVibe = (v) => toggle(U().shot.draft.vibes, v);
  // Fields of an add-event form (paths into UI state) that are still empty; the form shows them in red
  SQ.missing = (paths) => paths.filter((p) => {
    const v = p.split(".").reduce((o, k) => o && o[k], U());
    return Array.isArray(v) ? !v.length : !String(v == null ? "" : v).trim();
  });
  const SHOT_FIELDS = ["shot.draft.title","shot.draft.date","shot.draft.time","shot.draft.endTime","shot.draft.venue","shot.draft.address","shot.draft.area","shot.draft.price","shot.draft.organizer","shot.draft.description","shot.draft.vibes","shot.draft.sourceUrl","shot.draft.source"];
  const SPOT_FIELDS = ["spotDraft.title","spotDraft.date","spotDraft.time","spotDraft.endTime","spotDraft.venue.name","spotDraft.venue.address","spotDraft.price","spotDraft.organizer","spotDraft.ticketLink","spotDraft.description","spotDraft.vibes"];
  function checkFilled(paths) {
    U().invalid = SQ.missing(paths);
    if (U().invalid.length) toast("Fill in the fields marked in red.");
    return !U().invalid.length;
  }
  A.importEvent = async () => {
    if (!checkFilled(SHOT_FIELDS)) return;
    const r = await SQ.act("importEvent", { draft: U().shot.draft, screenshot: U().shot.preview || null });
    U().shot = null;
    U().quest = r.eventId;
    toast(r.existing ? "That event is already on Sidequest. Here it is." : "Added as unverified. It's verified once someone else checks the listing.");
    return "quest";
  };
  // The purchase-ticket button: open the original listing, and remember this person has seen it so they can verify.
  // window.open goes first, before any await, or the browser blocks it as a popup.
  A.openTicket = async (id) => {
    const e = SQ.ev(id);
    window.open(e.ticketLink || e.sourceUrl, "_blank", "noopener");
    if (e.verification) await SQ.act("openTicket", { eventId: e.id });
  };
  A.verifyReal = async (id) => {
    await SQ.act("verify", { eventId: Number(id), real: true });
    toast("Thanks. You confirmed this event is real.");
  };
  A.verifyFake = async (id) => {
    const r = await SQ.act("verify", { eventId: Number(id), real: false });
    toast(r.status === "reported" ? "Thanks. It's hidden from feeds while it's reported." : "Thanks. Your report is in.");
  };
  A.openFlag = (id) => {
    U().flag = U().flag && U().flag.eventId === Number(id) ? null : { eventId: Number(id), field: "", note: "" };
  };
  A.flagField = (f) => {
    U().flag.field = f;
  };
  A.sendFlag = async () => {
    const f = U().flag;
    await SQ.act("flagInfo", f);
    U().flag = null;
    toast("Flagged. Everyone looking at this event will see it.");
  };

  // ---------- parties ----------
  A.sendToParty = async (id) => {
    await SQ.act("sendToParty", { eventId: Number(id) });
    toast(`Sent to ${SQ.d.party.name}. It's in the group vote.`);
    return "party";
  };
  A.addToVote = (id) => SQ.act("sendToParty", { eventId: Number(id) });
  A.vote = async (id) => {
    if (!SQ.d.party.poll.includes(Number(id))) await SQ.act("sendToParty", { eventId: Number(id) });
    return SQ.act("vote", { eventId: Number(id) });
  };
  A.partyCover = (cover) => SQ.act("partyCover", { cover });
  A.planIn = async (id) => {
    if (U().planOut === Number(id)) U().planOut = null;
    if (!SQ.me().log[id]) await SQ.act("accept", { eventId: Number(id) });
    toast("You're in. Your party can see it.");
  };
  A.planOut = (id) => {
    U().planOut = Number(id);
    toast("Got it. Your party will see you can't make it.");
  };
  A.changeMeet = () => {
    const v = prompt("Where should everyone meet?", U().meetAt || "");
    if (v && v.trim()) U().meetAt = v.trim();
  };
  A.noop = () => {};
  A.lockPoll = async () => {
    const r = await SQ.act("lockPoll");
    toast(`${SQ.d.party.name} is going to ${SQ.ev(r.eventId).title}.`);
    return "group-plan";
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

  // ---------- Add from a poster (hosts and attendees) ----------
  // Fill a form from one of the events read off the poster
  function fillFrom(target, draft) {
    const keep = target === "host" ? U().hostDraft : U().spotDraft;
    const d = JSON.parse(JSON.stringify(draft));
    if (target === "host") {
      if (!d.venue.name) d.venue = keep.venue; // a poster without a venue is at the host's own
      Object.assign(keep, { title: d.title, description: d.description, date: d.date, time: d.time || keep.time, endTime: d.endTime, price: d.price, vibes: d.vibes.length ? d.vibes : keep.vibes, venue: d.venue, image: d.image, ticketLink: d.ticketLink || keep.ticketLink });
    } else Object.assign(keep, d);
  }
  async function readPoster(target, file) {
    const st = (U().poster = { for: target, loading: true, error: null, result: null, pick: 0 });
    SQ.render();
    try {
      const image = await SQ.readImage(file);
      st.result = await SQ.post("/api/poster", { userId: SQ.userId(), hostId: SQ.hostId(), image });
      if (!st.result.events.length) st.error = "We couldn't find an event with a date on that image. You can still fill the form in yourself.";
      else fillFrom(target, st.result.events[0].draft);
      if (!st.result.events.length && target === "host") U().hostDraft.image = st.result.image; // still use it as the quest's poster
    } catch (err) {
      st.error = err.message;
    }
    st.loading = false;
  }
  A.posterHost = (file) => readPoster("host", file);
  A.posterSpot = (file) => readPoster("attendee", file);
  A.posterPick = (i) => {
    const st = U().poster;
    st.pick = Number(i);
    fillFrom(st.for, st.result.events[st.pick].draft);
  };
  A.spotEvent = () => {
    U().poster = null;
    U().spotDraft = SQ.emptySpotDraft();
    return "spot";
  };
  A.spotVibe = (v) => toggle(U().spotDraft.vibes, v);
  A.submitSpot = async () => {
    const d = U().spotDraft;
    if (!checkFilled(SPOT_FIELDS)) return;
    const r = await SQ.act("submitEvent", { draft: d });
    toast(r.merged ? "It was already on Sidequest. We added what your poster had that the listing didn't." : "Added. Thanks for sharing it with Toronto.");
    U().poster = null;
    U().spotDraft = SQ.emptySpotDraft();
    U().quest = r.eventId;
    SQ.u.history = [];
    return "quest";
  };
  A.claimListing = async (id) => {
    await SQ.act("claimListing", { eventId: Number(id) });
    toast("It's yours now: it shows in your quests, and you can message the people going.");
    U().poster = null;
    U().hostDraft = SQ.emptyHostDraft();
    U().hostQuest = Number(id);
    SQ.u.history = [];
    return "host-quests";
  };

  // ---------- host: create and publish ----------
  A.newDraft = () => {
    U().hostDraft = SQ.emptyHostDraft();
    U().poster = null;
    return "host-create";
  };
  A.duplicate = (id) => {
    const e = SQ.ev(id);
    const start = new Date(e.startsAt);
    const time = start.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
    U().hostDraft = SQ.emptyHostDraft({ title: `${e.title} (next one)`, description: e.description === "N/A" ? "" : e.description, time, price: e.price == null ? "" : String(e.price), vibes: [...(e.vibes || [])], ...(e.venue && { venue: { name: e.venue.name === "N/A" ? "" : e.venue.name, address: e.venue.address === "N/A" ? "" : e.venue.address } }), ticketLink: e.ticketLink || "", dayInfo: { entrance: e.dayInfo.entrance || "", transit: e.dayInfo.transit || "", home: e.dayInfo.home || "", coat: e.dayInfo.coat || "" } });
    U().poster = null;
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
    if (r.merged) toast("That event was already listed, so we merged your details into it. It's yours now.");
    U().hostQuest = r.eventId;
    U().published = r;
    U().hostDraft = SQ.emptyHostDraft();
    U().poster = null;
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
    U().poster = null;
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
