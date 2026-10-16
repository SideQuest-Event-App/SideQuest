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
  const emptyDayInfo = () => ({ entrances: [""], transit: "", home: "", coatCheck: { on: false, note: "" }, reentry: { on: false, note: "" }, stepFree: { on: false, note: "" }, quietRoom: { on: false, note: "" }, payments: [], floorPlan: null });
  SQ.emptyHostDraft = (over = {}) => ({ id: null, kind: "new", eventId: null, title: "", description: "", date: "", time: "20:00", endTime: "", price: "", age: (SQ.d.host && SQ.d.host.agePolicy === "19+") ? "19+" : "All ages", vibes: [], venue: { name: SQ.d.host && SQ.d.host.type === "Venue" ? SQ.d.host.name : "", address: "" }, image: null, ticketLink: (SQ.d.host && SQ.d.host.ticketLink) || "", dayInfo: emptyDayInfo(), fromRequest: null, aiMode: null, ...over });
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
      return r.role === "host" ? "host-demand" : me() && me().registered ? "discover" : "ob-vibes";
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
    // bring the picked pin into view, above the sheet
    if (U().mapSel && e.venue) SQ.mapCenter("discover", e.venue.lat, e.venue.lng, 120);
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
    const l = SQ.me().log[id] || {};
    U().quest = Number(id);
    U().rating = { stars: l.rating || 0, tags: l.tags || [], details: { ...(l.details || {}) }, with: [...(l.with || SQ.partyGoing(SQ.ev(id)))], photos: [...(l.photos || [])] };
    return "rate";
  };
  A.setDetail = (arg) => {
    const [k, n] = arg.split(":");
    U().rating.details[k] = U().rating.details[k] === Number(n) ? 0 : Number(n);
  };
  A.rateWith = (name) => toggle(U().rating.with, name);
  A.rateSomeone = () => {
    const n = (prompt("Who else was there?") || "").trim().slice(0, 30);
    if (n && !U().rating.with.includes(n)) U().rating.with.push(n);
  };
  // Photos are shrunk to 640px JPEGs so a few fit in the log
  A.addRatePhoto = async (file) => {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    U().rating.photos.push(c.toDataURL("image/jpeg", 0.75));
  };
  A.removeRatePhoto = (i) => U().rating.photos.splice(Number(i), 1);
  A.openMemory = (id) => {
    U().quest = Number(id);
    return "memory";
  };
  A.toggleLogCal = () => {
    U().logTab = "Upcoming";
    U().logCal = !U().logCal;
  };
  A.calMonth = (d) => {
    U().calMonth = (U().calMonth || 0) + Number(d);
  };
  A.calDay = (k) => {
    U().calDay = k;
  };
  A.pickZone = (z) => {
    U().zone = U().zone === z ? null : z;
  };
  A.chatChannel = (c) => {
    U().chatCh = c;
  };
  A.wrapStep = (i) => {
    U().wrapStep = Number(i);
  };
  A.shareWrapped = (arg) => {
    const [n, vibe] = arg.split("|");
    return shareText(`I went on ${n} sidequests this year${vibe ? `, mostly ${vibe}` : ""}. Found on Sidequest.`);
  };
  // Check in: the venue's door QR (read by the browser when it can), or being there
  const checkIn = async (id, how) => {
    await SQ.act("checkIn", { eventId: Number(id), how });
    return "checkin-done";
  };
  A.scanCheckIn = async (file) => {
    if ("BarcodeDetector" in window) {
      try {
        const codes = await new window.BarcodeDetector({ formats: ["qr_code"] }).detect(await createImageBitmap(file));
        if (!codes.length) return toast("Couldn't find a QR code in that photo. Try again, or check in by location.");
      } catch {}
    }
    return checkIn(U().quest, "qr");
  };
  A.checkInHere = (id) => new Promise((resolve) => {
    const e = SQ.ev(id);
    if (!navigator.geolocation || !e.venue || e.venue.lat == null) return resolve(checkIn(id, "location"));
    navigator.geolocation.getCurrentPosition((pos) => {
      const r = Math.PI / 180;
      const km = 6371 * Math.hypot((pos.coords.longitude - e.venue.lng) * r * Math.cos(e.venue.lat * r), (pos.coords.latitude - e.venue.lat) * r);
      if (km > 0.5) {
        toast(`You look ${km.toFixed(1)} km away. Check in once you're at the door.`);
        return resolve();
      }
      resolve(checkIn(id, "location"));
    }, () => {
      toast("Location is off, so we checked you in on your word.");
      resolve(checkIn(id, "location"));
    }, { timeout: 8000 });
  });
  A.setStars = (n) => {
    U().rating.stars = Number(n);
  };
  A.toggleRateTag = (t) => toggle(U().rating.tags, t);
  A.submitRating = async () => {
    const r = U().rating;
    if (!r.stars) return toast("Tap a star rating first.");
    const res = await SQ.act("rate", { eventId: U().quest, stars: r.stars, tags: r.tags, details: r.details, with: r.with, photos: r.photos });
    toast(res.learned && res.learned.length ? `Story collected. Your taste avatar learned: ${res.learned.join(", ")}.` : "Story collected. Your taste avatar just updated.");
    U().logTab = "Completed";
    U().logCal = false;
    return "questlog";
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
    await SQ.act("eventChat", { eventId: U().quest, text, channel: U().chatCh || "general" });
  };

  // ---------- profile and switching ----------
  A.setTheme = (t) => SQ.setTheme(t);
  A.cycleTheme = () => {
    const order = ["dark", "light", "system"];
    SQ.setTheme(order[(order.indexOf(U().theme) + 1) % order.length]);
  };
  A.ageSetting = async () => {
    const u = me();
    if (u.adult === true) {
      if (confirm("Switch to all-ages picks? 19+ sidequests will be hidden.")) await SQ.act("setProfile", { adult: false });
    } else if (confirm("Are you 19 or older? The door still checks ID.")) await SQ.act("setProfile", { adult: true });
  };
  A.editProfile = () => {
    const u = me();
    U().profileDraft = { name: u.name || "", handle: u.handle || "" };
    U().profileAdd = null;
    return "profile-edit";
  };
  A.profileAdd = (k) => {
    U().profileAdd = U().profileAdd === k ? null : k;
  };
  A.saveProfile = async () => {
    const d = U().profileDraft;
    await SQ.act("setProfile", { name: d.name, handle: d.handle });
    SQ.back();
  };
  // A small square photo, so it fits in the profile
  async function square(file) {
    const bmp = await createImageBitmap(file);
    const side = Math.min(bmp.width, bmp.height);
    const c = Object.assign(document.createElement("canvas"), { width: 256, height: 256 });
    c.getContext("2d").drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256);
    return c.toDataURL("image/jpeg", 0.8);
  }
  A.profilePhoto = async (file) => {
    await SQ.act("setProfile", { photo: await square(file) });
  };
  A.switchToHost = () => (SQ.d.host ? "host-demand" : "host-type");
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
    const h = SQ.d.host;
    if (h && h.name && !r.name) Object.assign(r, { name: h.name, email: h.email, website: h.website || "", role: h.role || "", social: h.social, ticketLink: h.ticketLink, team: (h.team || []).slice() });
    return "host-account";
  };
  A.hostLoginAs = async (name) => {
    await SQ.act("hostLoginAs", { name });
    toast(`Signed in as ${name}.`);
    SQ.u.history = [];
    return "host-demand";
  };
  A.hostAccount = async () => {
    const r = U().hostReg;
    if (!r.name.trim()) return toast("Add your host name.");
    if (r.email.trim() && !/^\S+@\S+\.\S+$/.test(r.email.trim())) return toast("Check your work email.");
    await SQ.act("hostSet", { name: r.name, email: r.email, website: r.website, role: r.role });
    return "host-verify";
  };
  A.hostDoc = (k) => {
    U().hostReg.docKind = k;
  };
  A.hostDocFile = (file) => {
    if (file.size > 10 * 1024 * 1024) return toast("That file is over 10 MB.");
    U().hostReg.docFile = file.name;
  };
  A.hostVerifyNext = async () => {
    const r = U().hostReg;
    if (!r.docFile) return toast("Upload the document first.");
    await SQ.act("hostSet", { verifyDoc: { kind: r.docKind, file: r.docFile } });
    return "host-profile";
  };
  // Your vibes: each tile stands for a few vibes, all on or all off
  A.hostTile = (label) => {
    const t = SQ.TILES.find((x) => x[0] === label);
    const now = SQ.d.host.vibes;
    const on = t[2].some((v) => now.includes(v));
    return SQ.act("hostSet", { vibes: on ? now.filter((v) => !t[2].includes(v)) : [...now, ...t[2]] });
  };
  A.hostArea = (a) => {
    const now = SQ.d.host.areas || [];
    return SQ.act("hostSet", { areas: now.includes(a) ? now.filter((x) => x !== a) : [...now, a] });
  };
  A.hostAddArea = () => {
    const q = (prompt("Which neighbourhood?") || "").trim().toLowerCase();
    if (!q) return;
    const hood = SQ.HOODS.find((x) => x[0].toLowerCase().includes(q));
    if (!hood) return toast("We don’t know that neighbourhood yet.");
    if (!(SQ.d.host.areas || []).includes(hood[0])) return A.hostArea(hood[0]);
  };
  A.hostAge = (a) => SQ.act("hostSet", { agePolicy: a });
  A.hostLogo = async (file) => {
    await SQ.act("hostSet", { logo: await square(file) });
  };
  A.hostProfile = async () => {
    const h = SQ.d.host;
    if (!h.vibes.length) return toast("Pick at least one vibe.");
    await SQ.act("hostSet", { social: U().hostReg.social, ...(!h.area && { area: "Downtown" }) });
    return "host-ticketing";
  };
  A.hostTicketing = (t) => SQ.act("hostSet", { ticketing: t });
  A.hostTicketingNext = async () => {
    await SQ.act("hostSet", { ticketLink: SQ.d.host.ticketing === "Free RSVP in Sidequest" ? "" : U().hostReg.ticketLink });
    return "host-team";
  };
  A.teamRole = (role) => {
    U().hostReg.inviteRole = role;
  };
  A.teamAdd = () => {
    const r = U().hostReg;
    const email = r.invite.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast("Enter their email.");
    if (r.team.some((m) => m.email === email)) return toast("They’re already invited.");
    r.team.push({ email, role: r.inviteRole, status: "Invited" });
    r.invite = "";
  };
  A.teamRemove = (i) => {
    U().hostReg.team.splice(Number(i), 1);
  };
  A.hostTeamNext = async () => {
    await SQ.act("hostSet", { team: U().hostReg.team });
    return "host-claim";
  };
  A.claimToggle = (id) => {
    const c = U().hostReg.claim;
    const i = c.indexOf(Number(id));
    i < 0 ? c.push(Number(id)) : c.splice(i, 1);
  };
  A.claimListings = async () => {
    const ids = U().hostReg.claim || [];
    for (const eventId of ids) await SQ.act("claimListing", { eventId });
    if (ids.length) toast(`${ids.length} listing${ids.length === 1 ? "" : "s"} moved to your account.`);
    U().hostReg.claim = null;
    return "host-pending";
  };
  // ponytail: there's no review team in this sketch, so submitting approves straight away. Drop the hostApprove call once real review exists.
  A.hostSubmit = async () => {
    await SQ.act("hostSet", { team: U().hostReg.team, submit: true });
    await SQ.act("hostApprove");
    SQ.u.history = [];
    return "host-ready";
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

  // ---------- host: create, drafts and publish ----------
  const keyOf = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const timeOf = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "America/Toronto" });
  const real = (x) => (x && x !== "N/A" ? x : "");
  // A draft from a published sidequest, for editing it or running it again
  function draftFromEvent(e, over = {}) {
    const di = e.dayInfo || {};
    const sw = (o) => ({ on: !!(o && o.on), note: (o && o.note) || "" });
    return SQ.emptyHostDraft({ title: e.title, description: real(e.description), date: keyOf(e.startsAt), time: timeOf(e.startsAt), endTime: e.endsAt ? timeOf(e.endsAt) : "", price: e.price == null ? "" : String(e.price), age: e.agePolicy === "19+" || (e.tags || []).includes("19+") ? "19+" : "All ages", vibes: [...(e.vibes || [])],
      venue: { name: real(e.venue && e.venue.name), address: real(e.venue && e.venue.address) }, image: e.image || null, ticketLink: e.ticketLink || "",
      dayInfo: { ...emptyDayInfo(), entrances: di.entrances && di.entrances.length ? [...di.entrances] : [real(di.entrance)], transit: di.transit || "", home: di.home || "", coatCheck: sw(di.coatCheck), reentry: sw(di.reentry), stepFree: sw(di.stepFree), quietRoom: sw(di.quietRoom), payments: [...(di.payments || [])], floorPlan: di.floorPlan || null }, ...over });
  }
  const saveDraft = async (d) => {
    const r = await SQ.act("saveDraft", { draft: d });
    d.id = r.draftId;
    return r.draftId;
  };
  A.newDraft = () => {
    U().hostDraft = SQ.emptyHostDraft();
    U().poster = null;
    return "host-create";
  };
  A.duplicate = async (id) => {
    const e = SQ.ev(id);
    const d = draftFromEvent(e, { kind: "duplicate", date: "" });
    // Same weekday and time, a week after the last one (or the next one from today)
    const next = new Date(Math.max(Date.parse(e.startsAt), SQ.now().getTime()) + 7 * 86400000);
    d.date = keyOf(next);
    d.title = `${e.title} · ${next.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Toronto" })}`;
    await saveDraft(d);
    toast("Duplicated to your drafts. Check the day, then publish.");
    U().hostTab = "Drafts";
    return "host-quests";
  };
  A.openDraft = (id, el) => {
    const d = ((SQ.d.host && SQ.d.host.drafts) || []).find((x) => x.id === id);
    if (!d) return;
    if (d.test && SQ.u.screen === "host-quests") {
      U().hostDraftId = d.id;
      return "host-draft-test";
    }
    U().hostDraft = { ...SQ.emptyHostDraft(), ...JSON.parse(JSON.stringify(d)), dayInfo: { ...emptyDayInfo(), ...(d.dayInfo || {}) } };
    U().poster = null;
    return "host-create";
  };
  A.deleteDraft = async (id) => {
    if (!confirm("Delete this draft?")) return;
    await SQ.act("deleteDraft", { id });
    toast("Draft deleted.");
    if (SQ.u.screen === "host-draft-test") return "host-quests";
  };
  A.editQuest = (id) => {
    U().hostDraft = draftFromEvent(SQ.ev(id), { eventId: Number(id) });
    U().poster = null;
    return "host-create";
  };
  A.editDayInfo = (id) => {
    A.editQuest(id);
    return "host-create-dayinfo";
  };
  A.draftSet = (arg) => {
    const i = arg.indexOf(":");
    U().hostDraft[arg.slice(0, i)] = arg.slice(i + 1);
  };
  // Vibe tags are the tiles attendees pick from; each stands for a few vibes
  A.draftVibe = (label) => {
    const d = U().hostDraft;
    const t = SQ.TILES.find((x) => x[0] === label);
    d.vibes = t[2].some((v) => d.vibes.includes(v)) ? d.vibes.filter((v) => !t[2].includes(v)) : [...d.vibes, ...t[2]];
  };
  A.draftPay = (p) => toggle(U().hostDraft.dayInfo.payments, p);
  A.draftNext = async () => {
    const d = U().hostDraft;
    if (!d.title.trim() || !d.date) return toast("Add a title and pick a day to continue.");
    if (!d.eventId) await saveDraft(d); // nothing is lost if they close the form now
    return "host-create-dayinfo";
  };
  A.addEntrance = () => {
    U().hostDraft.dayInfo.entrances.push("");
  };
  A.dayToggle = (k) => {
    const x = U().hostDraft.dayInfo[k];
    x.on = !x.on;
  };
  A.dayNote = (k) => {
    const x = U().hostDraft.dayInfo[k];
    if (k === "quietRoom") return A.dayToggle(k);
    const v = prompt("Add a detail attendees see", x.note || "");
    if (v == null) return;
    x.note = v.trim().slice(0, 80);
    if (x.note) x.on = true;
  };
  // The floor plan: shrunk to 1000px so it fits on the listing
  A.floorPlan = async (file) => {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    U().hostDraft.dayInfo.floorPlan = c.toDataURL("image/jpeg", 0.75);
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
  const cleanDraft = (d) => ({ ...d, dayInfo: { ...d.dayInfo, entrances: d.dayInfo.entrances.filter((x) => x.trim()) } });
  A.publish = async () => {
    const d = cleanDraft(U().hostDraft);
    const r = await SQ.act("publish", { draft: d });
    if (r.edited) {
      toast("Saved. Attendees see the changes now.");
      U().hostDraft = SQ.emptyHostDraft();
      SQ.u.history = [];
      U().hostQuest = r.eventId;
      return "host-checkin";
    }
    if (r.merged) toast("That event was already listed, so we merged your details into it. It's yours now.");
    const e = { vibes: d.vibes };
    U().hostQuest = r.eventId;
    U().published = { ...r, fits: Object.values(SQ.d.friends).filter((f) => f.vibes.some((v) => e.vibes.includes(v))).length + (me() && me().vibes.some((v) => e.vibes.includes(v)) ? 1 : 0) + (r.requesters || 0) };
    U().hostDraft = SQ.emptyHostDraft();
    U().poster = null;
    SQ.u.history = [];
    return "host-published";
  };
  A.schedulePublish = async () => {
    const r = await SQ.act("publish", { draft: cleanDraft(U().hostDraft), publishAt: SQ.nextMonday9() });
    toast("Scheduled for Monday 9 AM. It's in your drafts until then.");
    U().hostDraft = SQ.emptyHostDraft();
    U().hostTab = "Drafts";
    SQ.u.history = [];
    return r.scheduled ? "host-quests" : undefined;
  };
  // Draft test: from a request, or from a saved draft
  A.testFromRequest = async (id) => {
    A.draftFromRequest(id);
    const d = U().hostDraft;
    await A.aiDraft();
    const draftId = await saveDraft(d);
    await SQ.act("testDraft", { id: draftId });
    U().hostDraftId = draftId;
    return "host-draft-test";
  };
  A.testDraft = async () => {
    await SQ.act("testDraft", { id: U().hostDraftId });
  };
  A.simulateDraft = async () => {
    await SQ.act("simulateDraft", { id: U().hostDraftId });
    toast("Simulated 3 days of interest from people whose taste fits.");
  };
  A.applyTweak = async () => {
    const d = ((SQ.d.host && SQ.d.host.drafts) || []).find((x) => x.id === U().hostDraftId);
    const tw = d && SQ.tweakFor(d);
    if (!tw) return;
    if (tw.go) {
      A.openDraft(d.id);
      return tw.go;
    }
    await SQ.act("saveDraft", { draft: { ...d, ...tw.set } });
    toast("Tweak applied to the draft.");
  };
  A.viewAsAttendee = (id) => {
    if (!me()) return toast("Sign up as an attendee (Profile > Request a quest) to see it in a feed.");
    U().quest = Number(id);
    return "quest";
  };

  // ---------- host: Demand Insights ----------
  A.toggleDemandMap = () => {
    U().demandMap = !U().demandMap;
  };
  A.requestOnMap = () => {
    U().demandMap = true;
    return "host-demand";
  };
  A.planFromMap = () => A.requestOnMap();
  A.hostTab = (t) => {
    U().hostTab = t;
  };
  A.insightTab = (t) => {
    U().insightTab = t;
  };
  A.insightDays = (n) => {
    U().insightDays = Number(n);
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
    if (e && (e.over || e.ended)) return A.openRecap(id);
    return "host-checkin";
  };
  A.openCheckin = (id) => {
    U().hostQuest = Number(id);
    return "host-checkin";
  };
  A.openRecap = (id) => {
    U().hostQuest = Number(id);
    U().insightTab = "Recap";
    return "host-insights";
  };
  A.checkin = (name) => SQ.act("checkin", { eventId: U().hostQuest, name });
  // Scan a ticket QR at the door: a guest's name checks them in; any other ticket code counts as one more in
  A.scanGuest = async (file) => {
    if (!("BarcodeDetector" in window)) return toast("This browser can't read QR codes. Check guests in by name below.");
    const codes = await new window.BarcodeDetector({ formats: ["qr_code", "pdf417", "aztec", "code_128"] }).detect(await createImageBitmap(file)).catch(() => []);
    if (!codes.length) return toast("Couldn't find a ticket code in that photo. Try again closer up.");
    const text = codes[0].rawValue.trim();
    const e = SQ.ev(U().hostQuest);
    const guest = [...(e.friends || []), ...(e.attendees || [])].find((g) => text.toLowerCase().includes(g.toLowerCase()));
    const name = guest || `Ticket ${text.slice(-6)}`;
    if ((SQ.d.checkins[e.id] || []).includes(name)) return toast(`${name} is already in.`);
    await SQ.act("checkin", { eventId: e.id, name });
    toast(`${name} checked in.`);
  };
  A.quickUpdate = async (text) => {
    const r = await SQ.act("hostMessage", { eventId: U().hostQuest, text, audience: "attendees" });
    toast(`Posted "${text}"${r.reached ? ` to ${r.reached} ${r.reached === 1 ? "person" : "people"}` : ""}. It's pinned on their event day screen.`);
  };
  A.endEvent = async (id) => {
    if (!confirm("End the event? Attendees are asked if they went and how it was.")) return;
    await SQ.act("endEvent", { eventId: Number(id) });
    toast("Event ended. Attendees are asked if they went and how it was.");
    U().hostQuest = Number(id);
    U().insightTab = "Recap";
    return "host-insights";
  };
  A.inviteFollow = async (id) => {
    const r = await SQ.act("inviteFollow", { eventId: Number(id) });
    toast(r.asked ? `Asked ${r.asked} ${r.asked === 1 ? "guest" : "guests"} who rated it 4 or 5 stars to follow you.` : "No one who rated it 4 or 5 stars is left to ask.");
  };
  A.msgEvent = (id) => {
    Object.assign(U().msg, { eventId: Number(id), audience: "attendees" });
  };
  A.msgAudience = (k) => {
    U().msg.audience = k;
  };
  A.msgQuick = (t) => {
    U().msg.text = t;
  };
  A.msgWhen = (k) => {
    U().msg.when = k;
  };
  A.hostMessage = async () => {
    const m = U().msg;
    if (m.audience === "attendees" && !m.eventId) return toast("Pick which sidequest this is about.");
    if (!m.text.trim()) return toast("Write an update first.");
    if (m.when === "later" && !m.sendAt) return toast("Pick when to send it.");
    const r = await SQ.act("hostMessage", { eventId: m.audience === "attendees" ? m.eventId : null, text: m.text, audience: m.audience, sendAt: m.when === "later" ? new Date(m.sendAt).toISOString() : null });
    m.text = "";
    m.sendAt = "";
    toast(r.scheduled ? "Scheduled. It goes out at that time." : `Sent${r.reached ? ` to ${r.reached} ${r.reached === 1 ? "person" : "people"}` : ""}.${m.audience === "attendees" ? " It's pinned on their event day screen too." : ""}`);
  };
  A.copyLink = async (id) => {
    const url = `${location.origin}/?quest=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied.");
    } catch {
      prompt("Copy this link", url);
    }
  };
  A.openUrl = (url) => {
    if (/^https:\/\//.test(url)) window.open(url, "_blank", "noopener");
  };

  SQ.actions = A;
})();
