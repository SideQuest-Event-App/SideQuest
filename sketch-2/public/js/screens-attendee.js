/* Sketch 1 — attendee screens. Each screen is { role, render() } and returns HTML.
   Clickable elements use data-go="screen", data-act="action" data-arg="…", or data-back.
   Inputs use data-bind="path" to write straight into SQ.u (UI state), so typing survives re-renders. */
(function () {
  const SQ = window.SQ;
  const { esc, icon, iconBtn, ph, poster, avatar, avatars, btn, chip, field, textarea, progress, meter, empty, stars, tabs, screen, thinking, aiTag, me, ev, req, whenLabel, isToday, isWeekend, priceLabel, trip, tripLabel, originShort, pick, partyGoing, isPast, statusBadge } = SQ;

  const V = () => SQ.d.vocab;
  const U = () => SQ.u;
  const BUDGETS = [["0", "Free"], ["10", "$10"], ["20", "$20"], ["40", "$40"], ["", "Any"]];
  const MINUTES = [["15", "15 min"], ["30", "30 min"], ["45", "45 min"], ["60", "1 hr"], ["", "Any"]];
  const ORIGIN_SHORT = { union: "Downtown", finch: "North York", kennedy: "Scarborough", kipling: "Etobicoke" };

  function attendeeTabs(active) {
    const u = me();
    const pending = u ? Object.entries(u.log).filter(([id, l]) => l.status === "going" && ev(id) && isPast(ev(id))).length : 0;
    const unread = u ? u.notifications.filter((n) => !n.read && n.requestId).length : 0;
    return tabs([["discover", "Discover", "home2"], ["parties", "Community", "crew"], ["requests", "Add Event", "plus"], ["questlog", "Sidequests", "ticket"], ["profile", "Profile", "user"]], active, { questlog: pending, requests: unread });
  }
  SQ.attendeeTabs = attendeeTabs;


  const friendsLine = (e) => {
    const party = partyGoing(e);
    const others = (e.friends || []).filter((f) => !party.includes(f));
    const names = [...party, ...others];
    if (!names.length) return e.going ? `<span class="small muted">${e.going} going</span>` : "";
    return `<span class="row start small" style="gap:8px">${avatars(names, 3)}<span class="muted">${esc(names.slice(0, 2).join(" and "))}${party.length ? " from your party" : ""} ${names.length > 1 ? "are" : "is"} going</span></span>`;
  };

  // Events attendees added from a screenshot: anyone else who opens the listing (the ticket button) can say if it's real
  function verifyCard(e) {
    const v = e.verification;
    if (!v) return "";
    const u = me();
    const n = (k) => `${v[k].length} ${v[k].length === 1 ? "person" : "people"}`;
    const [title, text] = {
      unverified: ["Unverified", "Someone on Sidequest added this from a screenshot. Nobody has confirmed the listing yet."],
      verified: ["Verified", `${n("real")} opened the listing and confirmed it's real.`],
      reported: ["Reported", `${n("fake")} opened the listing and said it isn't real, so it's hidden from feeds.`],
    }[v.status];
    const vote = v.real.includes(u.id) ? "real" : v.fake.includes(u.id) ? "fake" : null;
    let body;
    if (e.importedBy === u.id) body = '<p class="small muted">You added this one, so someone else has to verify it.</p>';
    else if (!v.opened.includes(u.id)) body = `${btn(`Get tickets on ${e.source}`, { "data-act": "openTicket", "data-arg": e.id }, "outline", "external")}<span class="caption muted">Opens the original listing. Come back after to tell us if it's real.</span>`;
    else body = `<span class="small">You opened the listing. Is this event real?</span>
      <div class="btn-row">${btn("It's real", { "data-act": "verifyReal", "data-arg": e.id, "aria-pressed": String(vote === "real") }, vote === "real" ? "primary" : "secondary", "check")}${btn("Not real", { "data-act": "verifyFake", "data-arg": e.id, "aria-pressed": String(vote === "fake") }, vote === "fake" ? "primary" : "secondary", "x")}</div>
      <button class="link muted" data-act="openTicket" data-arg="${e.id}">${icon("external", "sm")}Open the listing again</button>`;
    return `<div class="card${v.status === "unverified" ? " hot" : ""} stack-sm"><span class="label row start" style="gap:6px">${icon("shield", "sm")}${title}</span><p class="small muted">${esc(text)}</p>${body}</div>`;
  }
  // Anyone can flag wrong info on any event; flags show to everyone who opens it
  function flagSection(e) {
    const f = U().flag && U().flag.eventId === e.id ? U().flag : null;
    const flags = e.flags || [];
    const list = flags.length ? `<div class="card stack-sm"><span class="label">Flagged as incorrect</span>
      ${flags.slice(-5).map((x) => `<p class="small"><strong>${esc(x.field)}:</strong> ${esc(x.note)}</p>`).join("")}
      ${flags.length > 5 ? `<span class="caption muted">and ${flags.length - 5} earlier</span>` : ""}</div>` : "";
    const form = f ? `<form class="card stack-sm" data-act="sendFlag">
        <span class="label">What's wrong?</span>
        <div class="chips">${V().FLAG_FIELDS.map((x) => chip(x, f.field === x, { "data-act": "flagField", "data-arg": x })).join("")}</div>
        ${SQ.textarea("Details", "flag.note", f.note, "It starts at 9, not 8", 2)}
        <div class="btn-row">${btn("Send flag", { type: "submit" })}${btn("Cancel", { "data-act": "openFlag", "data-arg": e.id }, "ghost")}</div>
      </form>` : `<button class="link muted center" data-act="openFlag" data-arg="${e.id}">${icon("edit", "sm")}Flag incorrect info</button>`;
    return list + form;
  }


  const S = {};

  /* ===================== Log in and onboarding (Figma: 01 and 02 Onboarding) ===================== */
  // The design's ten vibe tiles; each stands for the vibes the matching and AI read
  const TILES = [
    ["Live Sets", "sax", ["Live music", "Jazz", "Indie gigs"]], ["Food Pop-ups", "cheers", ["Food & drink"]],
    ["Art Nights", "bokeh-2", ["Art & making", "Photography"]], ["Markets", "lanterns", ["Markets", "Zines & print", "Records & vinyl"]],
    ["Comedy", "bokeh-1", ["Comedy"]], ["Dance Nights", "performer", ["Dance", "Electronic"]],
    ["Wellness", "blur", ["Wellness", "Run & ride", "Climbing"]], ["Film", "hall", ["Film nights"]],
    ["Trivia & Games", "bokeh-3", ["Games & social", "Tech & coding", "Anime & cosplay"]], ["Outdoors", "dragon-boat", ["Outdoors"]],
  ];
  SQ.TILES = TILES;
  const tileOn = (u, t) => t[2].some((v) => u.vibes.includes(v));
  SQ.pickedTiles = (u) => TILES.filter((t) => tileOn(u, t)).map((t) => t[0]);
  const PAST = [["Toronto Jazz Festival", "Summer · Nathan Phillips Sq", "jazz-band"], ["Night It Up! Market", "Summer · Markham", "lanterns"], ["TIFF Midnight Madness", "Fall · Royal Alexandra", "hall"], ["Leslieville Flea", "Monthly · Queen St E", "beer-garden"]];
  const WHEN_TILES = [["Mornings", "sun", "Before noon"], ["Afternoons", "sunset", "12 to 5 PM"], ["Evenings", "moon", "5 to 9 PM"], ["Late nights", "spark", "After 9 PM"]];
  const STEPS = 7;
  // Back, progress and "2/7", then the title block
  const obHead = (n, title, sub, back = true, steps = STEPS) => `<div class="ob-head">
      <div class="ob-nav">${back ? iconBtn("back", { "data-back": "", "aria-label": "Back" }, "s") : ""}${n ? `${progress(n, steps)}<span class="step">${n}/${steps}</span>` : ""}</div>
      ${title ? `<div class="title-block"><h1 class="t-display-l">${esc(title)}</h1>${sub ? `<p class="t-body-l">${esc(sub)}</p>` : ""}</div>` : ""}
    </div>`;
  const footer = (main, note = "") => `<div class="footer-bar">${main}${note}</div>`;
  Object.assign(SQ, { obHead, obFooter: footer });
  const note = (text, a = {}) => `<${a["data-go"] || a["data-act"] ? "button" : "p"} class="note" ${SQ.attr(a)}>${esc(text)}</${a["data-go"] || a["data-act"] ? "button" : "p"}>`;

  S.landing = { role: "attendee", label: "Landing", render: () => screen(`
    <div class="landing-hero">
      <div class="col">${ph("sax")}<div style="flex:none;height:200px">${ph("lanterns", "", "height:100%")}</div></div>
      <div class="col"><div style="flex:none;height:170px">${ph("string-lights", "", "height:100%")}</div>${ph("cheers")}</div>
      <div class="scrim"></div>
    </div>
    <div class="landing-copy">
      ${SQ.logo()}
      <h1 class="t-display-xl">Find your people in a new city.</h1>
      <p class="t-body-l c-secondary">Events picked for your taste, friends to go with, and a guide for the night itself.</p>
    </div>
    <div class="landing-actions">
      <div class="slider" data-slide="role" role="button" tabindex="0" aria-label="Slide to explore">
        <span class="handle">${icon("arrow")}</span><span class="text">Slide to explore</span>${icon("chevR", "chev")}
      </div>
      <p class="login-line">Already have an account?<button class="link" data-go="login">Log in</button></p>
    </div>`, { cls: "bleed" }) };

  S.role = { role: "attendee", label: "Going out or hosting", render: () => {
    const r = U().role || "attendee";
    const card = (id, title, sub, photo, ic) => `<button class="role-card${r === id ? " on" : ""}" data-act="setRole" data-arg="${id}" aria-pressed="${r === id}">
        ${ph(photo)}<span class="scrim"></span>
        <span class="role-ic">${icon(ic)}</span>${r === id ? `<span class="role-check">${icon("check")}</span>` : ""}
        <span class="t-display-m">${esc(title)}</span><span class="t-body-m">${esc(sub)}</span>
      </button>`;
    return screen(`
      <div class="ob-body" style="gap:24px;padding-top:16px">
        <div class="title-block"><h1 class="t-display-l">How are you using Sidequest?</h1><p class="t-body-l">One login for both sides. You can switch between accounts any time, like Instagram.</p></div>
        ${card("attendee", "I’m going out", "Sidequests picked for my taste, friends to go with.", "performer", "near")}
        ${card("host", "I host events", "See what people near me want, then plan it.", "bokeh-1", "megaphone")}
      </div>`, { title: "", footer: footer(btn("Continue", { "data-act": "roleNext" })) });
  } };

  S.login = { role: "attendee", label: "Log in: email", render: () => {
    const l = U().login;
    return screen(`
      ${obHead(0, "Welcome back", "Enter the email on your account and we’ll send you a 6-digit code. No password needed.")}
      <form class="ob-body" data-act="requestCode">
        ${field("Email", "login.email", l.email, "email", "you@example.com", { icon: "mail", autocomplete: "email", inputmode: "email", help: "Works for both attendee and host accounts.", error: l.error })}
      </form>`, { footer: footer(btn("Send code", { "data-act": "requestCode" }), note("New to Sidequest? Create an account", { "data-go": "role" })) });
  } };

  const maskEmail = (e) => e.replace(/^(.)(.*)(.)@/, (m, a, mid, z) => `${a}${"*".repeat(Math.min(mid.length, 6))}${z}@`);
  S["login-code"] = { role: "attendee", label: "Log in: code", render: () => {
    const l = U().login;
    const digits = l.code.replace(/\D/g, "").slice(0, 6);
    const left = Math.max(0, Math.ceil((l.resendAt - Date.now()) / 1000));
    return screen(`
      ${obHead(0, "Check your email", `We sent a 6-digit code to ${maskEmail(l.email)}. It expires in 10 minutes.`)}
      <form class="ob-body" style="gap:14px" data-act="verifyCode">
        <label class="code${l.error ? " invalid" : ""}" aria-label="6-digit code">
          ${Array.from({ length: 6 }, (_, i) => `<span class="${i === Math.min(digits.length, 5) ? "on" : ""}">${esc(digits[i] || "")}</span>`).join("")}
          <input data-bind="login.code" data-live value="${esc(digits)}" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" aria-label="Code" autofocus>
        </label>
        ${l.error ? `<p class="field-help error">${esc(l.error)}</p>` : ""}
        <div class="resend">${left ? `<span data-until="${l.resendAt}">Resend code in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}</span>` : `<button type="button" data-act="requestCode">Resend code</button>`}<button type="button" data-go="login">Use a different email</button></div>
      </form>`, { footer: footer(btn("Log in", { "data-act": "verifyCode" }), note("Didn’t get it? Check spam, or resend after the timer.")) });
  } };

  // The username field: checked when you leave it; a taken one turns red with three free ones to tap
  const handleField = (bind, value, placeholder, extra = {}) => {
    const t = U().handleTaken && U().handleTaken.bind === bind && U().handleTaken.list;
    return `${field("Username", bind, value, "text", placeholder, { autocapitalize: "off", spellcheck: "false", "data-change": "checkHandle", ...extra, error: t && "That username is taken. Try one of these:" })}
      ${t ? `<div class="chips">${t.map((h) => `<button type="button" class="chip outline" data-act="pickHandle" data-arg="${esc(h)}">${esc(h)}</button>`).join("")}</div>` : ""}`;
  };

  S.signup = { role: "attendee", label: "Sign up", render: () => {
    const f = U().signup;
    return screen(`
      ${obHead(1, "Make your account")}
      <form class="ob-body" style="gap:14px" data-act="signup">
        ${field("Name", "signup.name", f.name, "text", "Alex Morgan", { autocomplete: "name" })}
        ${handleField("signup.username", f.username, "alex.out", { autocomplete: "username", help: "Friends find you by your username." })}
        ${field("Email", "signup.email", f.email, "email", "alex@example.com", { icon: "mail", autocomplete: "email", inputmode: "email", help: "Use an email you can open. Your login codes are sent there, and you can't log back in without it.", error: f.bad && f.bad.email && "Invalid email format" })}
        ${field("Phone", "signup.phone", f.phone, "tel", "(416) 555-0144", { icon: "phone", autocomplete: "tel", error: f.bad && f.bad.phone && "Invalid phone number" })}
      </form>
      ${f.linked ? `<div class="pop-scrim"><div class="pop" role="alertdialog" aria-labelledby="pop-t">
        <h2 id="pop-t" class="t-title-l">${f.linked === "email" ? "Email" : "Phone"} already linked to an account</h2>
        <p class="t-body-m c-secondary">Please log in using those credentials.</p>
        <div class="stack-sm" style="gap:10px">${btn("Log in", { "data-act": "loginLinked" })}${btn("Not now", { "data-act": "closeLinked" }, "ghost")}</div>
      </div></div>` : ""}`, { footer: footer(btn("Continue", { "data-act": "signup" }), note("By continuing you agree to the Terms and Privacy Policy.")) });
  } };

  S["ob-vibes"] = { role: "attendee", label: "Onboarding: vibes", render: () => {
    const u = me() || { vibes: [] };
    const n = TILES.filter((t) => tileOn(u, t)).length;
    const extra = u.vibes.filter((v) => !TILES.some((t) => t[2].includes(v)));
    return screen(`
      ${obHead(2, "What’s your vibe?", "Pick two or more. These are the ten most picked.")}
      <div class="ob-body" style="gap:10px">
        <div class="tiles">${TILES.map((t) => `<button class="tile${tileOn(u, t) ? " on" : ""}" data-act="toggleTile" data-arg="${esc(t[0])}" aria-pressed="${tileOn(u, t)}">${ph(t[1])}<span class="scrim"></span>${esc(t[0])}${tileOn(u, t) ? `<span class="tick">${icon("check")}</span>` : ""}</button>`).join("")}</div>
        <form class="search" data-act="addVibe">${icon("search")}<input data-bind="vibeText" value="${esc(U().vibeText)}" placeholder="More vibes: jazz, ramen, pottery…" aria-label="Add another vibe" enterkeyhint="done"></form>
        ${extra.length ? `<div class="chips">${extra.map((v) => chip(v, true, { "data-act": "toggleVibe", "data-arg": v }, "x")).join("")}</div>` : ""}
      </div>`, { footer: footer(btn(n + extra.length < 2 ? "Pick two or more" : `Continue · ${n + extra.length} picked`, { "data-act": "vibesNext", disabled: n + extra.length < 2 })) });
  } };

  S["ob-past"] = { role: "attendee", label: "Onboarding: quests you've been to", render: () => {
    const u = me() || { past: [] };
    return screen(`
      ${obHead(3, "Been to any of these?", "Tap the ones you’ve been to. It seeds your taste so your first week already fits.")}
      <div class="ob-body" style="gap:4px;padding-top:16px">
        ${PAST.map(([t, meta, photo]) => `<button class="pick-row" data-act="togglePast" data-arg="${esc(t)}" aria-pressed="${u.past.includes(t)}">${ph(photo)}<span class="text"><span>${esc(t)}</span><span>${esc(meta)}</span></span><span class="checkbox${u.past.includes(t) ? " on" : ""}">${u.past.includes(t) ? icon("check") : ""}</span></button>`).join("")}
        <div class="stack-sm" style="gap:10px;padding-top:18px">
          <span class="t-overline">Got tickets for something coming up?</span>
          <div class="btn-row" style="gap:10px">${btn("DICE", { "data-act": "toast", "data-arg": "DICE imports aren't connected in this sketch. Upload a screenshot of the ticket instead." }, "outline m", "link")}${btn("Ticketmaster", { "data-act": "toast", "data-arg": "Ticketmaster imports aren't connected in this sketch. Upload a screenshot of the ticket instead." }, "outline m", "link")}</div>
          <div class="notice">${icon("info")}<span>Eventbrite doesn’t allow imports. Add a screenshot of the ticket instead.</span><button class="action" data-go="wallet-add">Upload</button></div>
        </div>
      </div>`, { footer: footer(btn("Continue", { "data-go": "ob-when" })) });
  } };

  S["ob-when"] = { role: "attendee", label: "Onboarding: when you go out", render: () => {
    const u = me() || {};
    const w = u.whenOut || [];
    return screen(`
      ${obHead(4, "When do you go out?", "Pick any. We weigh start times by these.")}
      <div class="ob-body" style="gap:12px">
        <div class="when-grid">${WHEN_TILES.map(([t, ic, sub]) => `<button class="when${w.includes(t) ? " on" : ""}" data-act="toggleWhen" data-arg="${t}" aria-pressed="${w.includes(t)}">${icon(ic)}<strong>${t}</strong><span>${sub}</span></button>`).join("")}</div>
        <div class="stack-sm" style="gap:10px;padding-top:12px"><span class="t-overline">Which days</span>
          <div class="chips">${V().DAYS.map((d) => chip(d, u.days === d, { "data-act": "setDays", "data-arg": d })).join("")}</div></div>
      </div>`, { footer: footer(btn("Continue", { "data-go": "ob-areas" })) });
  } };

  S["ob-areas"] = { role: "attendee", label: "Onboarding: areas you frequent", render: () => {
    const u = me() || {};
    const mine = u.areas || [];
    const shown = [...new Set([...mine, ...SQ.HOODS.map((h) => h[0])])].slice(0, Math.max(6, mine.length + 3));
    const q = U().areaText.trim().toLowerCase();
    const found = q ? SQ.HOODS.filter((h) => h[0].toLowerCase().includes(q)).slice(0, 4) : [];
    return screen(`
      ${obHead(5, "Which areas do you frequent?")}
      <div class="ob-body" style="gap:14px;padding-top:16px">
        ${SQ.mapView("areas", { view: { lat: 43.6502, lng: -79.4103, zoom: 12.6 }, labels: mine, style: "height:250px;border-radius:20px",
          pins: SQ.HOODS.filter((h) => shown.includes(h[0])).map(([n, lat, lng]) => ({ lat, lng, tier: mine.includes(n) ? "strong" : "low", selected: mine.includes(n), act: "toggleArea", arg: n, label: n })),
          circles: SQ.HOODS.filter((h) => shown.includes(h[0])).map(([n, lat, lng, , km]) => ({ lat, lng, km, on: mine.includes(n) })) })}
        <p class="t-caption c-secondary" style="margin-top:-6px">Each circle shows roughly how far an area reaches.</p>
        <form class="search" data-act="addArea">${icon("search")}<input data-bind="areaText" data-live value="${esc(U().areaText)}" placeholder="Add a neighbourhood" aria-label="Add a neighbourhood" enterkeyhint="done"></form>
        ${found.length ? `<div class="chips">${found.map(([n]) => chip(n, mine.includes(n), { "data-act": "toggleArea", "data-arg": n }, "plus")).join("")}</div>` : ""}
        <div class="chips">${shown.map((n) => `<button class="chip ${mine.includes(n) ? "on" : "outline"}" data-act="toggleArea" data-arg="${esc(n)}" aria-pressed="${mine.includes(n)}">${esc(n)}</button>`).join("")}</div>
      </div>`, { footer: footer(btn("Continue", { "data-go": "ob-party" })) });
  } };

  S["ob-party"] = { role: "attendee", label: "Onboarding: assemble your party", render: () => {
    const u = me() || {};
    const members = SQ.partyNames();
    const q = U().friendText.trim().toLowerCase();
    const people = Object.entries(SQ.d.friends).filter(([n, f]) => !q || [n, f.full, f.handle].some((x) => String(x || "").toLowerCase().includes(q.replace(/^@/, ""))));
    return screen(`
      ${obHead(6, "Assemble your party", "Find friends by email, phone or username. Nobody is messaged without you.")}
      <div class="ob-body" style="gap:8px;padding-top:18px">
        <form class="search" data-act="findFriend">${icon("search")}<input data-bind="friendText" data-live value="${esc(U().friendText)}" placeholder="Email, phone or @username" aria-label="Find a friend"></form>
        ${btn(`${Object.keys(SQ.d.friends).length} friends found in your contacts`, { "data-act": "syncContacts" }, "social m", "crew")}
        ${u.contactsSynced || q ? `<div style="padding-top:8px">${people.map(([n, f]) => `<div class="person">${avatar(n)}<span class="text"><span>${esc(f.full || n)}</span><span>${esc(f.handle || "")}</span></span>
          ${members.includes(n) ? btn("Added", { "data-act": "toggleMember", "data-arg": n, "aria-pressed": "true" }, "ghost s", "check") : btn("Add", { "data-act": "toggleMember", "data-arg": n }, "secondary s", "plus")}</div>`).join("") || `<p class="caption c-tertiary">Nobody on Sidequest matches that yet.</p>`}</div>` : ""}
      </div>`, { footer: footer(btn("Build my Weekly Sidequests", { "data-go": "ob-avatar" }), btn("Skip for now", { "data-go": "ob-avatar" }, "ghost m")) });
  } };

  S["ob-avatar"] = { role: "attendee", label: "Onboarding: taste avatar", render: () => {
    const u = me() || { vibes: [], past: [] };
    const tiles = SQ.pickedTiles(u).concat(u.vibes.filter((v) => !TILES.some((t) => t[2].includes(v))));
    const feed = u.feed;
    const n = feed && feed.picks ? Object.keys(feed.picks).length : 12;
    // Where each pick floats, as the design places them
    const spots = [["signature", "left:24px;top:40px", tiles[0]], ["hot", "right:36px;top:60px", tiles[1]], ["social", "left:30px;top:250px", tiles[2]],
      ["", "right:46px;top:250px", u.homeArea], ["", "left:150px;top:290px", (u.whenOut || [])[0]], ["", "left:140px;top:12px", u.days && u.days !== "Both" ? u.days : (u.whenOut || [])[1]]];
    return screen(`
      ${obHead(7, "")}
      <div class="avatar-stage"><span class="glow"></span><span class="orb">${SQ.SIXER_MARK}</span>${spots.filter((x) => x[2]).map(([tone, pos, t]) => `<span class="pill ${tone}" style="${pos}">${esc(t)}</span>`).join("")}</div>
      <div class="ob-body" style="gap:16px;padding-top:0">
        <h1 class="t-display-l">Your taste avatar is ready.</h1>
        ${U().feedLoading && !feed ? `<div class="sixer-msg">${SQ.sixer()}<div class="bubble-s">${thinking("Reading your picks…")}</div></div>` : SQ.sixerMsg(`I built ${n} Weekly Sidequests from your picks. They refresh every Monday, and you can edit your tags any time in Profile.`)}
      </div>`, { footer: footer(btn("See my Weekly Sidequests", { "data-act": "finishOnboarding" }, "primary", "arrow")) });
  } };

  /* ===================== Discover (Figma: 03 Discover) ===================== */
  const TZ = "America/Toronto";
  const hourOf = (e) => Number(new Date(e.startsAt).toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: TZ }));
  // "Wed 8 PM", or "Today 6:30 PM"
  const dayTime = (e) => {
    const d = new Date(e.startsAt);
    const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(":00", "");
    return `${isToday(e) ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ })} ${t}`;
  };
  // Straight-line distance from home (the home neighbourhood, else the trip-time origin)
  const ORIGIN_LL = { union: [43.6453, -79.3806], finch: [43.7806, -79.4155], kennedy: [43.7323, -79.2637], kipling: [43.6372, -79.5361] };
  const homeLL = (u) => {
    const h = u.homeArea && SQ.HOODS.find((x) => x[0] === u.homeArea);
    return h ? [h[1], h[2]] : ORIGIN_LL[u.origin] || ORIGIN_LL.union;
  };
  const kmFrom = (e, u = me()) => {
    if (!e.venue || e.venue.lat == null) return null;
    const [la, ln] = homeLL(u);
    const r = Math.PI / 180;
    const x = (e.venue.lng - ln) * r * Math.cos(((e.venue.lat + la) / 2) * r), y = (e.venue.lat - la) * r;
    return 6371 * Math.hypot(x, y);
  };
  const distLabel = (e) => {
    const k = kmFrom(e);
    return k == null ? e.neighbourhood : k < 1 ? `${Math.max(50, Math.round(k * 20) * 50)} m` : `${k.toFixed(1)} km`;
  };
  const qMeta = (e) => [dayTime(e), e.price == null ? "" : priceLabel(e), distLabel(e)].filter(Boolean).join(" · ");
  const matchOf = (e) => (pick(e) ? pick(e).match : 0);
  const pillFor = (e) => (pick(e) ? SQ.matchPill(pick(e).match) : "");
  SQ.qMeta = qMeta;
  SQ.distLabel = distLabel;

  // Filters (Figma: 11 Filters). Amenities aren't in listings, so they match words in the tags and description.
  const CAT_TILES = ["Live Sets", "Food Pop-ups", "Art Nights", "Markets", "Comedy", "Dance Nights", "Film"];
  // Price and distance are sliders. Price: the most you'll pay, Free ($0) to $100+ (no limit, stored as "").
  // Distance: within 1 to 10 km of home; "" means no limit until the slider is moved.
  const PRICE_MAX = 100, DIST_MIN = 1, DIST_MAX = 10;
  const priceCap = (f) => (typeof f.price === "number" && f.price < PRICE_MAX ? f.price : null);
  const distCap = (f) => (typeof f.dist === "number" ? f.dist : null);
  SQ.priceCapLabel = (p) => (p >= PRICE_MAX ? "$100+" : p ? `Up to $${p}` : "Free");
  SQ.distCapLabel = (k) => `Within ${k} km`;
  const AFTER = [["5 PM", 17], ["8 PM", 20], ["10 PM", 22]];
  const AMEN = [["Step-free access", /accessib|wheelchair|step[- ]free/i, "access"], ["All ages", /all ages|all-ages|family|kids/i], ["Food", /food|eat|dinner|brunch|snack/i], ["Drinks", /drink|bar\b|beer|wine|cocktail/i], ["Small room", /intimate|small|cozy|limited/i]];
  const TODS = [["Anytime", "clock"], ["Daytime", "sun"], ["Evening", "moon"]];
  const DF = () => U().df;
  const tileVibes = (label) => (TILES.find((t) => t[0] === label) || [, , []])[2];
  function passes(e, f = DF()) {
    const h = hourOf(e);
    if (f.tod === "Daytime" && h >= 17) return false;
    if (f.tod === "Evening" && h < 17) return false;
    if (f.cats.length && !f.cats.some((c) => tileVibes(c).some((v) => (e.vibes || []).includes(v)))) return false;
    const p = priceCap(f);
    if (p != null && !(e.price != null && e.price <= p)) return false;
    const d = distCap(f);
    if (d != null && !(kmFrom(e) <= d)) return false;
    if (f.friends && !(e.friends || []).length) return false;
    const a = AFTER.find((x) => x[0] === f.after);
    if (a && h < a[1]) return false;
    const text = `${(e.tags || []).join(" ")} ${e.description || ""} ${e.title}`;
    return f.amen.every((n) => AMEN.find((x) => x[0] === n)[1].test(text));
  }
  // The filters that are on, as [label shown on the chip, how to turn it off]
  const activeFilters = (f = DF()) => [
    ...(f.tod !== "Anytime" ? [[f.tod, ["dfTod", "Anytime"]]] : []),
    ...f.cats.map((c) => [c, ["dfCat", c]]),
    ...(priceCap(f) != null ? [[SQ.priceCapLabel(priceCap(f)), ["dfPrice", ""]]] : []),
    ...(distCap(f) != null ? [[SQ.distCapLabel(distCap(f)), ["dfDist", ""]]] : []),
    ...(f.friends ? [["Friends going", ["dfFriends", ""]]] : []),
    ...(f.after ? [[`After ${f.after}`, ["dfSet", "after:"]]] : []),
    ...f.amen.map((n) => [n, ["dfAmen", n]]),
  ];
  // Search sends the ids that pass the filters (null when none are on), and searches again when they change
  SQ.filterSig = () => JSON.stringify(DF());
  SQ.filteredIds = () => (activeFilters().length ? SQ.d.events.filter((e) => passes(e)).map((e) => e.id) : null);

  // This week's sidequests: the taste avatar's picks in the next 7 days, best match first
  const inWeek = (e) => {
    const t = Date.parse(e.startsAt) - SQ.now().getTime();
    return t > -3 * 36e5 && t < 7 * 864e5;
  };
  const live = (e, u = me()) => !e.over && !e.ended && !u.notForMe.includes(e.id) && inWeek(e) && !(u.adult === false && SQ.is19(e));
  const weekly = () => SQ.d.events.filter((e) => live(e) && pick(e)).sort((a, b) => matchOf(b) - matchOf(a) || a.startsAt.localeCompare(b.startsAt));
  // A Vibe Mix: everything this week in a tile's vibes that fits your budget and trip time, ranked by match
  const MIX_PHOTO = { "Live Sets": "jazz-band", "Food Pop-ups": "string-lights", Markets: "beer-garden" };
  function mixEvents(label) {
    const u = me();
    const ok = new Set((u.feed && u.feed.eligible) || []);
    const vibes = tileVibes(label);
    return SQ.d.events.filter((e) => live(e, u) && (ok.has(e.id) || pick(e)) && (e.vibes || []).some((v) => vibes.includes(v)))
      .sort((a, b) => matchOf(b) - matchOf(a) || a.startsAt.localeCompare(b.startsAt));
  }
  const mixes = () => {
    const mine = SQ.pickedTiles(me());
    return TILES.map((t) => [t[0], MIX_PHOTO[t[0]] || t[1], mixEvents(t[0]).length]).filter((m) => m[2])
      .sort((a, b) => mine.includes(b[0]) - mine.includes(a[0]) || b[2] - a[2]);
  };

  // Figma: Quest card (250 x 340, photo, scrim, match, save, info)
  function questCard(e) {
    const saved = me().saved.includes(e.id);
    return `<div class="qcard" role="button" tabindex="0" data-act="openQuest" data-arg="${e.id}" aria-label="${esc(e.title)}">
      ${poster(e)}<span class="scrim"></span>
      <div class="qcard-top">${pillFor(e).replace('class="match', 'class="match on-photo')}
        <button class="icon-btn glass qsave" data-act="save" data-arg="${e.id}" aria-label="${saved ? "Saved" : "Save"}" aria-pressed="${saved}">${icon(saved ? "bookmarkFill" : "bookmark")}</button></div>
      <div class="qcard-info">
        ${isToday(e) ? SQ.tag(hourOf(e) >= 17 ? "Tonight" : "Today", "hot") : ""}
        <span class="t-title-l ellipsis">${esc(e.title)}</span>
        <span class="t-data">${esc(qMeta(e))}</span>
      </div>
    </div>`;
  }
  // Figma: Quest row (64 photo, title, data line, match). host: true shows the plain listing and opens the host's tools.
  function questRow(e, extra = "", { host = false } = {}) {
    return `<button class="quest-row" data-act="${host ? "openHostQuest" : "openQuest"}" data-arg="${e.id}">
      ${poster(e)}
      <span class="text"><span>${esc(e.title)}</span><span>${esc(qMeta(e))}</span>${extra}</span>
      ${host ? "" : pillFor(e)}
    </button>`;
  }
  SQ.questRow = questRow;
  SQ.questCard = questCard;

  const bell = () => {
    const n = me().notifications.filter((x) => !x.read).length;
    return `<button class="icon-btn" data-go="notifications" aria-label="Notifications${n ? `, ${n} unread` : ""}">${icon("bell")}${n ? `<span class="count-badge">${n}</span>` : ""}</button>`;
  };
  const viewToggle = (on) => `<div class="seg">
    <button class="${on === "list" ? "on" : ""}" data-go="discover" aria-pressed="${on === "list"}">For you</button>
    <button class="${on === "map" ? "on" : ""}" data-go="discover-map" aria-pressed="${on === "map"}">Map</button></div>`;
  // The search bar, with Filters at its end (a count shows when any are on). Used on For you, Map and Search.
  const searchBar = () => {
    const n = activeFilters().length;
    return `<form class="search" data-act="search">${icon("search")}<input data-bind="search.q" value="${esc(U().search.q)}" placeholder="What are you up for?" aria-label="Search sidequests" enterkeyhint="search">
      <button type="button" class="icon-btn search-filters${n ? " on" : ""}" data-go="filters" aria-label="Filters${n ? `, ${n} on` : ""}">${icon("sliders")}${n ? `<span class="count-badge">${n}</span>` : ""}</button></form>`;
  };
  // Each filter that's on, as a chip that turns it off (nothing shows when none are on)
  const filterChips = () => {
    const on = activeFilters();
    return on.length ? `<div class="chips scroll-x">${on.map(([l, [act, arg]]) => chip(l, true, { "data-act": act, "data-arg": arg }, "x")).join("")}</div>` : "";
  };
  // The top of Discover, the same on For you and Map: the view switch and bell, the search bar, then any filters
  const discoverTop = (on) => `<div class="row" style="gap:10px">${viewToggle(on)}${bell()}</div>${searchBar()}${filterChips()}`;

  S.discover = { role: "attendee", label: "Discover · list", render: () => {
    const u = me();
    const all = weekly();
    const list = all.filter((e) => passes(e));
    let body;
    if (!u.feed && U().feedLoading) body = `<div class="pad stack"><div class="sixer-msg">${SQ.sixer()}<div class="bubble-s">${thinking("Picking this week's sidequests…")}</div></div><div class="skeleton" style="height:340px"></div></div>`;
    else if (!list.length) body = `<div class="empty-state">
        <span class="illo">${icon("search")}</span>
        <p class="t-title-l">${all.length ? "No sidequests match these filters." : "No sidequests picked yet."}</p>
        <p class="t-body-l c-secondary">Loosen a filter, or ask hosts to put this on. When enough people ask, you hear first.</p>
        <div class="btn-row">${btn("Clear filters", { "data-act": "dfClear" }, "outline m")}${btn("Request it", { "data-go": "request-new" }, "primary m", "bulb")}</div>
      </div>`;
    else {
      const m = mixes();
      body = `<section class="disc-sec">
          <div class="pad-x stack" style="gap:2px"><div class="section-header"><h2>Weekly Sidequests</h2><button data-go="weekly">See all (${all.length})</button></div><span class="t-caption c-secondary">Fresh every Monday</span></div>
          <div class="hscroll">${list.slice(0, 12).map(questCard).join("")}</div>
        </section>
        ${m.length ? `<section class="disc-sec">
          <div class="pad-x section-header"><h2>Vibe Mixes</h2></div>
          <div class="hscroll">${m.map(([l, p, n]) => `<button class="mix" data-act="openMix" data-arg="${esc(l)}" aria-label="${esc(l)}, ${n} sidequest${n === 1 ? "" : "s"} this week"><span class="mix-cover">${ph(p)}<span class="scrim"></span><span class="mix-count">${n}</span><span class="t-title-m">${esc(l)}</span></span></button>`).join("")}</div>
        </section>` : ""}`;
    }
    const day = SQ.now().toLocaleDateString("en-US", { weekday: "long", timeZone: TZ });
    return screen(`<div class="disc-top">${discoverTop("list")}</div>
      <div class="disc-body">
        <div class="disc-title pad-x"><span class="overline">${day} · Toronto</span><span class="t-display-xl">Your week,</span><span class="t-display-xl c-accent">picked.</span></div>
        ${U().feedError ? `<div class="pad-x"><div class="notice hot">${icon("x")}<span>${esc(U().feedError)}</span></div></div>` : ""}
        ${body}
      </div>`, { tabbar: attendeeTabs("discover") });
  } };

  // Figma: 09 Discover · map and 10 Map · pin selected
  S["discover-map"] = { role: "attendee", label: "Discover · map", render: () => {
    const u = me();
    const list = weekly().filter((e) => passes(e) && e.venue && e.venue.lat != null);
    const sel = list.find((e) => e.id === U().mapSel);
    const pins = list.map((e) => ({ lat: e.venue.lat, lng: e.venue.lng, tier: SQ.matchTier(matchOf(e)), selected: sel === e, act: "mapPin", arg: e.id, label: e.title }));
    const home = u.homeArea || homeLL(u);
    const going = sel ? [...partyGoing(sel), ...(sel.friends || []).filter((x) => !partyGoing(sel).includes(x))] : [];
    return screen(`<div class="disc-map">
      ${SQ.mapView("discover", { pins, home, labels: ["Kensington", "Queen West", ...(u.areas || [])] })}
      <div class="map-ctrls">
        ${discoverTop("map")}
      </div>
      <div class="map-zoom-at">${SQ.mapZoom("discover")}</div>
      ${sel ? `<div class="sheet">
          <span class="grabber"></span>
          <div class="row start" style="gap:14px">${poster(sel, "", { style: "width:96px;height:96px;border-radius:16px" })}
            <div class="stack grow" style="gap:5px;min-width:0">${pillFor(sel)}<span class="t-title-l">${esc(sel.title)}</span><span class="t-data c-secondary">${esc(qMeta(sel))}</span>
              ${going.length ? `<span class="row start t-caption c-secondary" style="gap:8px">${avatars(going, 3, "xs")}${esc(going.slice(0, 2).join(" and "))} ${going.length > 1 ? "are" : "is"} going</span>` : ""}</div></div>
          <div class="row" style="gap:10px">${btn("View sidequest", { "data-act": "openQuest", "data-arg": sel.id }, "primary m", "arrow")}
            ${iconBtn(u.saved.includes(sel.id) ? "bookmarkFill" : "bookmark", { "data-act": "save", "data-arg": sel.id, "aria-label": "Save" }, "outline")}${iconBtn("share", { "data-act": "share", "data-arg": sel.id, "aria-label": "Share" }, "outline")}</div>
        </div>` : `<div class="map-legend-at">${SQ.mapLegend()}</div>
        <div class="hscroll map-cards">${list.slice(0, 12).map((e) => `<button class="map-card" data-act="mapPin" data-arg="${e.id}">${poster(e)}<span class="stack grow" style="gap:4px;min-width:0"><span class="t-title-m ellipsis">${esc(e.title)}</span><span class="t-data c-secondary ellipsis">${esc(`${dayTime(e)} · ${e.neighbourhood}`)}</span>${pillFor(e)}</span></button>`).join("")}</div>`}
    </div>`, { tabbar: attendeeTabs("discover"), cls: "bleed" });
  } };

  S.filters = { role: "attendee", label: "Filters", render: () => {
    const f = DF();
    const n = weekly().filter((e) => passes(e)).length;
    const group = (title, chips) => `<div class="stack" style="gap:10px"><h2 class="t-title-m">${title}</h2><div class="chips">${chips}</div></div>`;
    // A slider shows its value while sliding (data-out), and applies it on release (data-change)
    const slider = (title, key, value, min, max, step, format, act, [lo, hi], shown = "") => `<div class="stack" style="gap:10px">
        <div class="section-head"><h2 class="t-title-m">${title}</h2><span class="t-data c-accent" data-out="df.${key}">${esc(shown || SQ[format](value))}</span></div>
        <input type="range" class="range" style="--fill:${((value - min) / (max - min)) * 100}%" min="${min}" max="${max}" step="${step}" value="${value}" data-bind="df.${key}" data-format="${format}" data-change="${act}" aria-label="${title}">
        <div class="section-head"><span class="t-data c-secondary">${lo}</span><span class="t-data c-secondary">${hi}</span></div>
      </div>`;
    const set = (key, list) => list.map(([v, l = v]) => chip(l, f[key] === v, { "data-act": "dfSet", "data-arg": `${key}:${v}` })).join("");
    const fromSearch = U().history[U().history.length - 1] === "search";
    return screen(`<div class="pad stack" style="gap:20px;padding-top:8px">
      ${group("Time of day", TODS.map(([l, ic]) => chip(l, f.tod === l, { "data-act": "dfTod", "data-arg": l }, ic)).join(""))}
      <hr class="divider">${group("Category", chip("Any", !f.cats.length, { "data-act": "dfCats", "data-arg": "" }) + CAT_TILES.map((c) => chip(c, f.cats.includes(c), { "data-act": "dfCat", "data-arg": c })).join(""))}
      <hr class="divider">${slider("Price", "price", priceCap(f) ?? PRICE_MAX, 0, PRICE_MAX, 5, "priceCapLabel", "dfPrice", ["Free", "$100+"])}
      <hr class="divider">${slider("Distance from home", "dist", distCap(f) ?? DIST_MAX, DIST_MIN, DIST_MAX, 1, "distCapLabel", "dfDist", ["1 km", "Within 10 km"], distCap(f) == null ? "Anywhere" : "")}
      <hr class="divider">${group("Who’s going", chip("Anyone", !f.friends, { "data-act": "dfFriends", "data-arg": "" }) + chip("Friends going", f.friends, { "data-act": "dfFriends", "data-arg": "1" }, "crew"))}
      <hr class="divider">${group("Starts after", set("after", [["", "Any time"], ...AFTER.map((a) => [a[0]])]))}
      <hr class="divider">${group("Amenities", AMEN.map(([l, , ic]) => chip(l, f.amen.includes(l), { "data-act": "dfAmen", "data-arg": l }, ic || "")).join(""))}
    </div>`, { title: "Filters", close: true, footer: `<div class="footer-bar row">${btn("Clear", { "data-act": "dfClear", style: "width:110px;flex:none" }, "outline")}${btn(fromSearch ? "Show results" : `Show ${n} sidequest${n === 1 ? "" : "s"}`, { "data-back": "" })}</div>` });
  } };

  // Figma: Weekly Quests · full list
  const WEEK_TABS = [["All", () => true], ["Tonight", (e) => isToday(e) && hourOf(e) >= 17], ["Weekend", isWeekend], ["Free", (e) => e.price === 0]];
  const rows = (list, divided) => list.map((e) => questRow(e)).join(divided ? '<hr class="divider">' : "");
  S.weekly = { role: "attendee", label: "Weekly Sidequests", render: () => {
    const all = weekly();
    const tab = U().weekTab || "All";
    const list = all.filter(WEEK_TABS.find((t) => t[0] === tab)[1]);
    const monday = new Date(SQ.now());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return screen(`<div class="pad stack" style="gap:14px;padding-top:4px">
      <div class="title-block stack-sm"><span class="overline">Week of ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span><h1 class="t-display-l">Weekly Sidequests</h1>
        <p class="t-body-l c-secondary">This week’s picks, refreshed every Monday. Ranked by how well they match you.</p></div>
      <div class="chips scroll-x">${WEEK_TABS.map(([l]) => chip(l === "All" ? `All ${all.length}` : l, tab === l, { "data-act": "setWeekTab", "data-arg": l })).join("")}</div>
      <div class="stack" style="gap:14px;padding-top:6px">${list.length ? rows(list, true) : empty("search", "Nothing in this week's picks for that.")}</div>
    </div>`, { title: "", right: iconBtn("share", { "data-act": "shareWeek", "aria-label": "Share" }) });
  } };

  // Figma: Vibe Mix · art style A (greyscale)
  S.mix = { role: "attendee", label: "Vibe Mix", render: () => {
    const label = U().mix || "Live Sets";
    const t = TILES.find((x) => x[0] === label) || TILES[0];
    const list = mixEvents(label);
    return screen(`<div class="mix-hero">${ph(MIX_PHOTO[label] || t[1])}<span class="scrim"></span>
        <div class="mix-nav">${iconBtn("back", { "data-back": "", "aria-label": "Back" }, "glass s")}${iconBtn("share", { "data-act": "shareMix", "aria-label": "Share" }, "glass s")}</div>
        ${SQ.tag("Vibe Mix · rotates daily", "solid")}<h1 class="t-display-xl c-white">${esc(label)}</h1><p class="t-body-m c-white" style="opacity:.85">${list.length} sidequest${list.length === 1 ? "" : "s"} this week, ranked by match</p></div>
      <div class="pad stack" style="gap:14px;padding-top:18px">${list.length ? rows(list) : empty("search", "Nothing in this mix this week.")}</div>`, { cls: "bleed" });
  } };

  // Search results: the AI's picks within your filters, revealed 5 at a time as you scroll (see A.searchMore)
  S.search = { role: "attendee", label: "Search results", render: () => {
    const s = U().search;
    const u = me();
    const r = s.result;
    // A filter changed (here, in the Filters sheet, or on Discover) since these results: search again with it
    if (s.ran && !s.loading && s.sig !== SQ.filterSig()) setTimeout(() => SQ.actions.search(null, null, true));
    let body = "";
    if (s.loading) body = thinking(`Finding sidequests for "${s.ran}"…`);
    else if (s.error) body = `<div class="notice hot">${icon("x")}<span>${esc(s.error)}</span></div>`;
    else if (r) {
      const hits = s.matches.filter((m) => ev(m.id) && !u.notForMe.includes(m.id));
      const shown = hits.slice(0, s.shown);
      const done = !s.loadingMore && s.shown >= hits.length && !s.more;
      const l = r.limits;
      const hit = (m) => {
        const e = ev(m.id);
        return `<div class="search-hit">
          <button class="quest-row" data-act="openQuest" data-arg="${e.id}">${poster(e)}<span class="text"><span>${esc(e.title)}</span><span>${esc(qMeta(e))}</span></span>${SQ.matchPill(m.match)}</button>
          ${m.reason ? `<p class="hit-reason">${icon("sparkle")}<span>${esc(m.reason)}</span></p>` : ""}
          <button class="hit-not" data-act="notForMe" data-arg="${e.id}">${icon("thumbDown")}Not for me</button>
        </div>`;
      };
      body = `
        <div class="stack-sm">${aiTag(r.mode)}<span class="t-caption c-tertiary">${l.fit} of ${l.total} sidequests fit${u.budget != null ? ` your ${u.budget ? `$${u.budget}` : "free-only"} budget` : ""}${u.origin && u.maxMinutes ? ` and ${u.maxMinutes}-min trip` : ""}</span></div>
        ${r.error ? `<div class="notice">${icon("sparkle")}<span>The AI didn't answer, so these are keyword matches.</span></div>` : ""}
        ${shown.length ? `<div class="stack" style="gap:16px">${shown.map(hit).join('<hr class="divider">')}</div>` : empty("search", "Nothing fit that. Hosts can see this gap.")}
        ${s.loadingMore ? thinking("Finding more sidequests…") : !done ? '<div class="reveal-more" data-reveal="searchMore" aria-hidden="true"></div>' : ""}
        ${done && r.unmet.length ? r.unmet.map((x) => `<div class="notice hot">${icon("bulb")}<span>Nothing fit <strong>${esc(x.interest)}</strong>${x.reason === "price" ? ", over your budget" : x.reason === "travel" ? ", too far for your trip time" : ", nothing listed yet"}. Hosts see requests, and you hear first if one puts it on.</span><button class="action" data-act="requestGap" data-arg="${esc(x.interest)}">Request it</button></div>`).join("") : ""}
        ${done ? `<div class="notice signature">${icon("plus")}<span>Know of an event like this? Add it to Sidequest from its link, a screenshot, or by typing it in.</span><button class="action" data-act="addEvent">Add event</button></div>` : ""}`;
    }
    return screen(`<div class="pad stack" style="gap:14px;padding-top:4px">
        ${searchBar()}${filterChips()}
        ${body}
      </div>`, { title: "Search" });
  } };

  /* ===================== Quest detail and tickets (Figma: 13 Quest detail, 14 Tickets, 19+ check, All-ages, Import ticket) ===================== */
  const tilesOf = (e) => TILES.filter((t) => t[2].some((v) => (e.vibes || []).includes(v))).map((t) => t[0]);
  const isTonight = (e) => isToday(e) && hourOf(e) >= 17;
  const clock = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(":00", "");
  // "Sunday · 11 AM to 1:30 PM"
  const whenLong = (e) => `${isToday(e) ? (hourOf(e) >= 17 ? "Tonight" : "Today") : new Date(e.startsAt).toLocaleDateString("en-US", { weekday: "long", timeZone: TZ })} · ${clock(e.startsAt)}${e.endsAt ? ` to ${clock(e.endsAt)}` : ""}`;
  const andList = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
  // Stacked 40px faces with a ring (Figma: Faces)
  const faces = (names, max = 4, meFirst = false) => `<span class="faces">${names.slice(0, max).map((n, i) => (meFirst && !i ? `<span class="av">${esc(n[0])}</span>` : avatar(n))).join("")}</span>`;
  const rateCard = (label, value, caption) => `<div class="rate-card"><span class="overline c-tertiary">${esc(label)}</span><span class="row start" style="gap:4px">${icon("starFill")}<span class="t-title-l">${esc(value)}</span></span><span class="t-caption c-secondary">${esc(caption)}</span></div>`;
  const sourceOf = (e) => e.source || "the host's site";
  const ticketsSold = (e) => e.price !== 0 && !!(e.ticketLink || e.sourceUrl);

  S.quest = { role: "attendee", label: "Quest detail", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const u = me();
    const party = partyGoing(e);
    const friends = e.friends || [];
    const going = [...new Set([...friends, ...(e.attendees || [])])];
    const following = u.following.includes(e.organizer.name);
    const saved = u.saved.includes(e.id);
    const logged = u.log[e.id];
    const fromReq = e.fromRequest && req(e.fromRequest);
    const adult = SQ.is19(e);
    const v = e.verification;
    const venueName = e.venue && e.venue.name;
    const ratings = [
      e.rating && rateCard("Sidequest", e.rating, e.recurring ? "recurring" : `${(e.reviews || []).length} reviews`),
      e.organizer.rating && rateCard("Host", e.organizer.rating, e.organizer.reviews ? `${e.organizer.reviews} reviews` : "host rating"),
      e.venue && e.venue.rating && rateCard("Venue", e.venue.rating, e.venue.reviews ? `${e.venue.reviews} reviews` : "venue rating"),
    ].filter(Boolean);
    const others = Math.max(0, (e.going || going.length) - 2);
    const cta = isPast(e) && !logged ? `<span class="t-body-m c-secondary grow">This sidequest has ended.</span>`
      : logged ? btn("In your Sidequests", { "data-go": "questlog" }, "secondary", "check")
      : ticketsSold(e) ? btn(`Get tickets on ${sourceOf(e)}`, { "data-act": "getTickets", "data-arg": e.id }, "primary", "external")
      : btn("I'm going", { "data-act": "getTickets", "data-arg": e.id }, "primary", "check");
    const footer = `<div class="footer-bar row qd-buy">
        ${isPast(e) && !logged ? "" : `<span class="qd-price"><span class="t-title-l">${esc(priceLabel(e))}</span><span class="t-caption c-tertiary">${e.price === 0 ? "no ticket needed" : e.price == null ? "see listing" : "per ticket"}</span></span>`}
        ${cta}
      </div>`;
    return screen(`
      <div class="qd-hero">
        ${poster(e)}<span class="qd-scrim"></span>
        <div class="qd-nav">
          ${iconBtn("back", { "data-back": "", "aria-label": "Back" }, "raised")}
          <span class="grow"></span>
          ${iconBtn("share", { "data-act": "share", "data-arg": e.id, "aria-label": "Share" }, "raised")}
          ${iconBtn(saved ? "bookmarkFill" : "bookmark", { "data-act": "save", "data-arg": e.id, "aria-label": saved ? "Saved" : "Save", "aria-pressed": String(saved) }, "raised")}
        </div>
      </div>
      <div class="qd-sheet">
        <div class="qd-tags">
          ${pillFor(e)}
          ${adult ? SQ.tag("19+", "warning", "id") : ""}
          ${tilesOf(e).slice(0, 2).map((t) => SQ.tag(t)).join("")}
          ${friends.length ? SQ.tag("Friends going", "social", "crew") : ""}
          ${isTonight(e) ? SQ.tag("Tonight", "hot") : ""}
          ${v && v.status === "unverified" ? SQ.tag("Unverified", "unverified") : ""}
        </div>
        <div class="qd-title">
          <h1 class="t-display-m">${esc(e.title)}</h1>
          <span class="t-body-l c-secondary">${esc(whenLong(e))}</span>
          <span class="t-data c-secondary">${esc([venueName, e.neighbourhood, distLabel(e)].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(" · "))}</span>
        </div>
        ${friends.length ? `<div class="qd-group">
          <span class="overline">Friends interested</span>
          <div class="row start" style="gap:12px">${faces(friends)}
            <span class="qd-faces-text"><span class="t-title-m">${esc(andList(friends.slice(0, 4)))}${friends.length > 4 ? ` +${friends.length - 4}` : ""}</span><span class="t-caption c-secondary">${friends.length > 1 ? "are" : "is"} interested${party.length ? ` · ${party.length} from your party` : ""}</span></span>
          </div>
        </div>` : ""}
        ${fromReq ? `<div class="notice primary">${icon("spark")}<span>You asked, it's happening. Booked because ${fromReq.votes} of you asked for it.</span></div>` : ""}
        ${adult ? `<div class="notice warning">${icon("alert")}<span>19+ sidequest. ID is checked at the door; we only ask you once.</span></div>` : ""}
        ${ratings.length ? `<div class="row start" style="gap:8px">${ratings.join("")}</div>` : ""}
        ${e.organizer.name && e.organizer.name !== "N/A" ? `<div class="row start" style="gap:12px">
          ${avatar(e.organizer.name, "neutral")}
          <span class="qd-faces-text"><span class="t-title-m">${esc(e.organizer.name)}</span><span class="t-caption c-secondary">${e.organizer.followers ? `${Number(e.organizer.followers).toLocaleString("en-US")} followers` : "Host"}</span></span>
          ${btn(following ? "Following" : "Follow", { "data-act": "follow", "data-arg": e.organizer.name, "aria-pressed": String(following) }, "secondary s")}
        </div>` : ""}
        ${going.length || e.going ? `<div class="qd-group">
          <span class="overline">Who's going</span>
          <div class="row start" style="gap:10px">${going.length ? faces(going, 3) : ""}<span class="t-body-m c-secondary grow">${going.length ? `${esc(andList(going.slice(0, 2)))}${others > 0 && (e.going || 0) > 2 ? ` and ${others} others` : ""}` : `${e.going} going`}</span></div>
          ${e.guest ? `<span class="row start t-body-m" style="gap:8px">${icon("music")}Guest set: ${esc(e.guest)}</span>` : ""}
        </div>` : ""}
        ${e.description ? `<div class="qd-group"><span class="overline">About</span><p class="t-body-m c-secondary">${esc(e.description)}</p></div>` : ""}
        ${verifyCard(e)}
        ${flagSection(e)}
        ${!logged ? `<button class="btn btn-ghost m" data-act="notForMe" data-arg="${e.id}">${icon("thumbDown")}Not for me</button>` : ""}
      </div>`, { footer, cls: "bleed" });
  } };

  // 19+ check (Figma: 19+ check): asked once, the first time a 19+ sidequest's tickets are opened
  S["age-check"] = { role: "attendee", label: "19+ check", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    return screen(`
      <div class="age-check">
        <span class="age-ic">${icon("id")}</span>
        <h1 class="t-display-m">${esc(e.title)} is 19+</h1>
        <p class="t-body-l c-secondary">We only ask for 19+ sidequests, then remember your answer. The door still checks ID.</p>
      </div>`, { title: "", close: true, footer: `<div class="footer-bar">${btn("I'm 19 or older", { "data-act": "adultYes" }, "hot")}${btn("I'm under 19", { "data-act": "adultNo" }, "outline")}</div>` });
  } };

  // All-ages alternatives (Figma: All-ages alternatives): like the 19+ one, but everyone can go
  S["all-ages"] = { role: "attendee", label: "All-ages alternatives", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const tiles = tilesOf(e);
    const like = SQ.d.events.filter((x) => x.id !== e.id && live(x) && !SQ.is19(x))
      .map((x) => [x, tilesOf(x).filter((t) => tiles.includes(t)).length])
      .sort((a, b) => b[1] - a[1] || matchOf(b[0]) - matchOf(a[0]) || a[0].startsAt.localeCompare(b[0].startsAt))
      .slice(0, 8).map(([x]) => x);
    return screen(`
      <div class="pad-x stack" style="gap:16px;padding-bottom:24px">
        <div class="title-block"><h1 class="t-display-l">All-ages picks for you</h1>
          <p class="t-body-l c-secondary">That one's 19+, so here are sidequests like it that everyone can go to. We'll keep your picks all-ages from now on.</p></div>
        <div class="notice">${icon("info")}<span>You can change this any time in Profile › Settings.</span></div>
        <div class="stack" style="gap:14px">${like.map((x) => questRow(x)).join("") || '<p class="t-body-m c-secondary">Nothing all-ages this week yet.</p>'}</div>
      </div>`, { title: "", back: "discover" });
  } };

  // Tickets (Figma: 14 Tickets): tickets are sold on the host's site; we hand off and bring you back
  S.tickets = { role: "attendee", label: "Tickets", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const src = sourceOf(e);
    const money = (n) => `$${Number(n).toFixed(2)}`;
    const party = (SQ.d.party || {}).name || "Your party";
    return screen(`
      <div class="pad-x stack" style="gap:18px;padding-top:8px;padding-bottom:24px">
        <div class="row start" style="gap:14px">${poster(e, "tk-photo")}
          <span class="stack" style="gap:4px;min-width:0"><span class="t-title-l">${esc(e.title)}</span><span class="t-data c-secondary">${esc([dayTime(e).replace(/^(\w+) /, "$1 · "), e.venue && e.venue.name].filter(Boolean).join(" · "))}</span></span></div>
        <div class="tk-card">
          <div class="tk-line"><span class="t-body-l">General admission</span><span class="t-data">${e.price == null ? "N/A" : money(e.price)}</span></div>
          <div class="tk-line fee"><span class="t-body-m">Fees (set by ${esc(src)})</span><span class="t-data">At checkout</span></div>
          <div class="tk-line total t-title-m"><span>Total</span><span>${e.price == null ? "See listing" : `From ${money(e.price)}`}</span></div>
        </div>
        <div class="notice">${icon("info")}<span>Tickets are sold by the host on ${esc(src)}. We'll open their page, then bring you back here.</span></div>
        ${btn(`Open ${src} ticket page`, { "data-act": "openTicket", "data-arg": e.id }, "outline", "external")}
        <div class="stack" style="gap:10px;padding-top:8px">
          <span class="overline">After you buy</span>
          <div class="list-row tk-why"><span class="lead-ic">${icon("wallet")}</span><span class="text"><span>Keep it in your wallet</span><span>Import the ticket so it sits next to the event day info.</span></span></div>
          <button class="list-row tk-why" data-act="sendToParty" data-arg="${e.id}"><span class="lead-ic">${icon("crew")}</span><span class="text"><span>Tell your party</span><span>${esc(party)} sees you're in, nothing else.</span></span>${icon("chevR")}</button>
        </div>
        ${verifyCard(e)}
      </div>`, { title: "Tickets", footer: `<div class="footer-bar">${btn("I have my ticket", { "data-act": "haveTicket", "data-arg": e.id })}${btn("Not yet", { "data-back": "" }, "ghost m")}</div>` });
  } };

  // Import ticket (Figma: 14 Import ticket). Scan and upload both read the file in the browser (wallet.js).
  const WALLET_TYPES = "image/*,application/pdf,.pdf,.pkpass,application/vnd.apple.pkpass";
  S["ticket-import"] = { role: "attendee", label: "Import ticket", render: () => {
    const row = (ic, title, sub, inner) => `<label class="list-row" style="cursor:pointer"><span class="lead-ic">${icon(ic)}</span><span class="text"><span>${title}</span><span>${sub}</span></span>${inner || ""}${icon("chevR")}</label>`;
    const link = (name) => `<button class="list-row" data-act="connectTickets" data-arg="${name}"><span class="lead-ic">${icon("link")}</span><span class="text"><span>Connect ${name}</span><span>Tickets import automatically</span></span>${icon("chevR")}</button>`;
    return screen(`
      <div class="pad-x stack" style="gap:16px;padding-bottom:24px">
        <div class="title-block"><h1 class="t-display-m">Add your ticket to your wallet</h1>
          <p class="t-body-m c-secondary">Keep it next to the event day info, so you're not digging through email at the door.</p></div>
        <div class="stack" style="gap:4px">
          ${row("qr", "Scan the QR code", "Point your camera at the ticket", `<input type="file" accept="image/*" capture="environment" data-wallet-file class="sr-only">`)}
          ${row("image", "Upload a screenshot", "From your photos", `<input type="file" accept="${WALLET_TYPES}" data-wallet-file class="sr-only">`)}
          ${link("DICE")}${link("Ticketmaster")}
        </div>
        <div class="notice">${icon("info")}<span>Eventbrite doesn't allow imports. A screenshot works just as well at the door.</span></div>
      </div>`, { title: "Import ticket", close: true, footer: `<div class="footer-bar">${btn("Not now", { "data-act": "gotTicket" }, "ghost m")}</div>` });
  } };

  /* ===================== Add an event: from a link, a screenshot, or typed in ===================== */
  S["add-event"] = { role: "attendee", label: "Add an event", render: () => {
    const s = U().shot || (U().shot = SQ.emptyShot());
    const d = s.draft;
    const form = s.open && !s.loading ? `
        <div class="row"><span class="label">${s.mode ? "Check every field" : "Event details"}</span>${s.mode === "listing" ? `<span class="ai-tag">${icon("external")}From the listing</span>` : aiTag(s.mode)}</div>
        <p class="small muted">Every field is needed, and at least one vibe, so the listing has no gaps.</p>
        ${field("Event name", "shot.draft.title", d.title)}
        ${field("Date", "shot.draft.date", d.date, "date")}
        <div class="btn-row">${field("Starts", "shot.draft.time", d.time, "time")}${field("Ends", "shot.draft.endTime", d.endTime, "time")}</div>
        ${field("Venue", "shot.draft.venue", d.venue)}
        ${field("Address", "shot.draft.address", d.address)}
        <span class="label">Area</span>
        <div class="chips" data-req="shot.draft.area">${V().AREAS.map((a) => chip(a, d.area === a, { "data-act": "shotArea", "data-arg": a })).join("")}</div>
        <div class="btn-row">${field("Price from (CAD)", "shot.draft.price", d.price, "number", "0 if free", { min: 0, inputmode: "decimal" })}${field("Price to (optional)", "shot.draft.priceTo", d.priceTo, "number", "Top of the range", { min: 0, inputmode: "decimal" })}</div>
        ${field("Organizer", "shot.draft.organizer", d.organizer)}
        ${SQ.textarea("Description", "shot.draft.description", d.description, "", 3)}
        <span class="label">Vibes (pick at least one)</span>
        <div class="chips" data-req="shot.draft.vibes">${V().VIBES.map((v) => chip(v, d.vibes.includes(v), { "data-act": "shotVibe", "data-arg": v }, SQ.VIBE_ICON[v])).join("")}</div>
        ${field("Link to the original listing", "shot.draft.sourceUrl", d.sourceUrl, "url", "https://", { required: true, "data-change": "loadCover" })}
        <span class="label">Cover image</span>
        ${s.coverLoading ? '<p class="small muted">Looking for the listing\'s photo…</p>'
          : s.cover ? `<img src="${esc(s.cover)}" alt="Cover image from the listing" style="width:100%;max-height:220px;object-fit:cover;border-radius:14px" onerror="this.nextElementSibling.textContent='The listing has a photo, but it can\\'t be previewed here. It will still be used.';this.remove()"><p class="caption muted">From the listing</p>`
          : s.preview ? `<img src="${s.preview}" alt="Cover image from your screenshot" style="width:100%;max-height:220px;object-fit:cover;border-radius:14px"><p class="caption muted">Your screenshot${d.sourceUrl ? ", since the listing has no photo we can use" : ""}</p>`
          : '<p class="small muted">No cover image yet. Add the listing\'s link or use a screenshot.</p>'}
        ${field("Found on", "shot.draft.source", d.source, "text", "Eventbrite, Instagram…")}` : "";
    return screen(`
      <div class="pad stack">
        <h2 class="display-l">Add an event</h2>
        <p class="muted">Paste a link from Eventbrite, Instagram or anywhere, or use a screenshot, and we'll fill in what we can. Or type it in yourself. It goes up as unverified until someone else opens the listing and confirms it's real.</p>
        <form class="search" data-act="readLink">
          ${icon("external")}<input type="url" data-bind="shot.link" value="${esc(s.link)}" placeholder="Paste the event's link" aria-label="Event link" enterkeyhint="go">
          <button class="icon-btn" type="submit" aria-label="Fill in from link">${icon("sparkle")}</button>
        </form>
        <label class="btn btn-outline">${icon("camera")}${s.preview ? "Use a different screenshot" : "Use a screenshot"}<input type="file" accept="image/*" data-file="readShot" hidden></label>
        ${s.open ? "" : btn("Enter it yourself", { "data-act": "manualEvent" }, "ghost", "edit")}
        ${s.preview ? `<img src="${s.preview}" alt="Your screenshot" style="width:100%;max-height:240px;object-fit:contain;border-radius:14px">` : ""}
        ${s.loading ? thinking(`Reading your ${s.preview ? "screenshot" : "link"} and looking up the listing${SQ.d.mode === "claude-code" ? " (Claude Code can take a minute)" : ""}…`) : ""}
        ${s.error ? `<div class="notice hot">${icon("x")}<span>${esc(s.error)}</span></div>` : ""}
        ${form}
      </div>`, { title: "Add an event", footer: `<div class="action-bar">${btn("Add as unverified event", { "data-act": "importEvent", disabled: !s.open || s.loading })}</div>` });
  } };

  /* ===================== Community: Parties, Crew Blend, group plan (Figma: 16, 17 Party) ===================== */
  const myName = () => me().name || "You";
  const crew = () => [myName(), ...SQ.d.party.members];
  // Shared themes: the design's tiles, by how many people in the party are into each
  function sharedTiles() {
    const people = [me().vibes, ...SQ.partyNames().map((m) => (SQ.d.friends[m] || {}).vibes || [])];
    return TILES.map((t) => [t[0], people.filter((vs) => t[2].some((v) => vs.includes(v))).length])
      .filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }
  function tally() {
    const p = SQ.d.party;
    const t = {};
    for (const [voter, id] of Object.entries(p.votes)) if (voter === myName() || p.members.includes(voter)) (t[id] = t[id] || []).push(voter);
    return t;
  }
  // What's up for a vote: anything sent to the party, then the blend's top picks
  const voteOptions = () => {
    const p = SQ.d.party;
    const top = ((p.blend && p.blend.matches) || []).slice(0, 3).map((m) => m.id);
    return [...new Set([...p.poll, ...top])].map(ev).filter((e) => e && !isPast(e));
  };
  const short = (e) => `${dayTime(e)} · ${e.neighbourhood}`;
  const tierWord = (pct) => ({ strong: "Strong match", close: "Close match", low: "Worth a look" })[SQ.matchTier(pct)];
  const xsFaces = (names) => (names.length ? `<span class="faces xs">${names.slice(0, 4).map((n) => avatar(n, "xs")).join("")}</span>` : "");
  const COVERS = ["cheers", "string-lights", "lanterns", "jazz-band", "beer-garden", "bokeh-2"];

  S.parties = { role: "attendee", label: "Parties", render: () => {
    const p = SQ.d.party;
    const people = crew();
    const opts = voteOptions().length;
    const status = p.locked && ev(p.locked) ? SQ.tag(`Locked in · ${ev(p.locked).title}`, "social", "check")
      : SQ.tag(opts ? `Vote open · ${opts} pick${opts === 1 ? "" : "s"} nominated` : "No picks yet", "social", "check");
    const friends = me().friendList;
    const hl = me().highlights.filter((h) => ev(h.eventId));
    return screen(`
      <div class="page-head"><span class="overline">Plan with friends</span>
        <div class="row" style="align-items:flex-end"><h1 class="t-display-xl">Community</h1>${iconBtn("userPlus", { "data-act": "openFriends", "aria-label": "Add friends" })}</div></div>
      <div class="comm-sec"><div class="section-header pad-x"><span>Friends</span>${friends.length ? `<button data-act="openFriends">See all ${friends.length}</button>` : ""}</div>
        ${friends.length ? `<div class="hscroll friend-row">${friends.map((f) => `<button class="friend-chip" data-act="openFriend" data-arg="${esc(f.key)}">${friendAv(f, "fr")}${esc(f.name)}</button>`).join("")}</div>`
          : `<p class="pad-x t-caption c-tertiary">No friends yet. Find people with the add button above.</p>`}</div>
      <div class="comm-sec"><div class="pad-x"><div class="section-header"><span>Friends’ highlights</span>${hl.length > 2 ? `<button data-act="openFriends">See all</button>` : ""}</div>
          <p class="t-body-m c-secondary">Quests your friends rated 4 stars and up</p></div>
        ${hl.length ? `<div class="hscroll">${hl.map((h) => {
          const e = ev(h.eventId);
          return `<button class="hl-card" data-act="openQuest" data-arg="${e.id}"><span class="hl-img">${poster(e)}${SQ.tag(isPast(e) ? "Rated" : isWeekend(e) ? "This week" : "Coming up", "photo")}</span>
            <span class="t-title-m ellipsis">${esc(e.title)}</span><span class="t-data c-secondary ellipsis">${esc(whenLabel(e))} · ${esc(e.neighbourhood || "")}</span>
            <span class="row start" style="gap:6px">${avatar(h.friend, "xs")}<span class="t-caption">${esc(h.friend)}</span><span class="hl-stars">${"★".repeat(h.stars)}</span></span></button>`;
        }).join("")}</div>` : `<p class="pad-x t-caption c-tertiary">When a friend rates a sidequest 4 stars or more, it shows up here.</p>`}</div>
      <div class="pad-x stack" style="gap:14px;padding-top:28px;padding-bottom:24px">
        <div class="section-header"><span>Parties</span><button data-act="toast" data-arg="One party per person for now. Change who's in it from the party's settings.">New party</button></div>
        <button class="party-card" data-go="party">
          <span class="row start" style="gap:8px">${faces(people, 5, true)}${people.length > 5 ? `<span class="av neutral more-n">+${people.length - 5}</span>` : ""}<span class="grow"></span>${icon("arrow")}</span>
          <span class="t-title-l">${esc(p.name)}</span>
          <span class="t-body-m c-secondary">${people.length} ${people.length === 1 ? "person" : "people"}${sharedTiles().length ? ` · into ${esc(sharedTiles().slice(0, 3).join(", "))}` : ""}</span>
          ${status}
        </button>
      </div>`, { tabbar: attendeeTabs("parties") });
  } };

  // Friends (Figma: 05 Parties · Friends): requests waiting on you, search people on Sidequest, and your friends
  const friendAv = (f, cls = "") => f.photo ? `<span class="av photo-av ${cls}" style="background-image:url('${f.photo}')" title="${esc(f.name)}"></span>` : avatar(f.name, cls);
  S.friends = { role: "attendee", label: "Friends", render: () => {
    const fr = U().friendsPage;
    const u = me();
    const q = fr.q.trim().toLowerCase().replace(/^@/, "");
    const list = u.friendList.filter((f) => !q || [f.full, f.handle].some((x) => String(x || "").toLowerCase().includes(q)));
    const party = SQ.d.party.members;
    const found = (fr.found || []).filter((p) => !p.friend);
    const row = (p, action, open) => `<div class="person divided">${open ? `<button class="person-open" data-act="openFriend" data-arg="${esc(p.key)}">` : ""}${friendAv(p)}<span class="text"><span>${esc(p.full || p.name)}</span><span>${esc(p.handle || "")}</span></span>${open ? "</button>" : ""}${action}</div>`;
    const section = (label, items) => (items.length ? `<div><span class="overline">${label} · ${items.length}</span>${items.join("")}</div>` : "");
    return screen(`
      <div class="pad-x stack" style="gap:14px;padding-top:4px;padding-bottom:24px">
        <form class="search" data-act="findPeople">${icon("search")}<input data-bind="friendsPage.q" data-live value="${esc(fr.q)}" placeholder="Search name or @username" aria-label="Search name or @username" autocapitalize="off"></form>
        ${btn("Search", { "data-act": "findPeople" }, "primary", "search")}
        ${fr.searched ? `<div><span class="overline">On Sidequest</span>${found.length ? found.map((p) => row(p, p.pending ? SQ.tag("Pending", "social") : btn("Add", { "data-act": "addFriend", "data-arg": p.key }, "secondary s", "plus"))).join("") : `<p class="t-caption c-tertiary" style="padding-top:8px">Nobody new on Sidequest matches “${esc(fr.searched)}”. Try their exact email or @username.</p>`}</div>` : ""}
        ${section("Friend requests", u.friendRequests.map((p) => row(p, `<span class="row" style="gap:6px">${btn("Accept", { "data-act": "answerFriend", "data-arg": `${p.key.slice(2)}|1` }, "primary s")}${btn("Decline", { "data-act": "answerFriend", "data-arg": `${p.key.slice(2)}|0` }, "secondary s")}</span>`)))}
        ${section("Pending", u.pendingFriends.map((p) => row(p, SQ.tag("Pending", "social"))))}
        <div><span class="overline">Your friends · ${list.length}</span>
          ${list.map((f) => row(f, party.includes(f.key) ? SQ.tag("In your party", "social") : icon("chevR"), true)).join("") || `<p class="t-caption c-tertiary" style="padding-top:8px">${q ? "None of your friends match that." : "No friends yet. Search for someone above."}</p>`}</div>
      </div>`, { title: "Friends", tabbar: attendeeTabs("parties") });
  } };

  // A friend's profile: their recent sidequests, and remove friend
  S.friend = { role: "attendee", label: "Friend", render: () => {
    const f = U().friendProfile;
    const recent = f.recent.map((r) => ({ ...r, e: ev(r.eventId) })).filter((r) => r.e);
    return screen(`
      <div class="pad-x stack" style="gap:20px;padding-top:8px;padding-bottom:24px">
        <div class="identity">${friendAv(f, "xl")}<h1 class="t-display-m">${esc(f.full || f.name)}</h1><span class="t-data c-secondary">${esc(f.handle || "")}</span></div>
        <div class="stack" style="gap:0"><div class="section-head"><span class="t-title-l">Recent sidequests</span></div>
          ${recent.map(({ e, status }) => `<button class="log-row" data-act="openQuest" data-arg="${e.id}">${poster(e)}
            <span class="text"><span class="t-title-m ellipsis">${esc(e.title)}</span><span class="t-data c-secondary ellipsis">${esc([dayTime(e), e.venue ? e.venue.name : e.neighbourhood].join(" · "))}</span>
              ${SQ.tag(status === "went" ? "Went" : "Going", status === "went" ? "success" : "social")}</span>${icon("chevR")}</button>`).join("") || `<p class="t-body-m c-secondary">No sidequests yet.</p>`}</div>
        ${btn("Remove friend", { "data-act": "removeFriend" }, "secondary", "x")}
      </div>`, { title: "" });
  } };

  S.party = { role: "attendee", label: "Party: Crew Blend + vote", render: () => {
    const p = SQ.d.party;
    const u = me();
    const people = crew();
    const big = people.length >= 6;
    const b = p.blend;
    const t = tally();
    const opts = voteOptions();
    const myVote = p.votes[myName()];
    const editing = U().editMembers;
    const settings = iconBtn("sliders", { "data-act": "editMembers", "aria-label": "Who's in", "aria-pressed": String(!!editing) }, big ? "" : "glass");
    const who = `<div class="stack" style="gap:12px">
        <span class="overline">Who's in this time${big ? ` · ${people.length}` : ""}</span>
        <div class="who-in">${people.map((n, i) => `<span class="who"><span class="av ${i ? SQ.avTone(n) : ""}">${esc(n[0])}</span><span class="t-caption">${i ? esc(n) : "You"}</span></span>`).join("")}</div>
        ${editing ? `<div class="chips wrap">${Object.keys(SQ.d.friends).map((f) => chip(f, p.members.includes(f), { "data-act": "toggleMember", "data-arg": f }, p.members.includes(f) ? "check" : "plus")).join("")}</div>` : ""}
      </div>`;
    const themes = sharedTiles().slice(0, 4);
    let picks;
    if (!p.members.length) picks = `<p class="t-body-m c-secondary">Add friends to get group picks.</p>`;
    else if (!b) picks = thinking(`Blending ${people.length} tastes…`);
    else picks = `${U().blendLoading ? thinking("Re-blending for the new line-up…") : ""}
      ${b.matches.length ? b.matches.slice(0, 3).map((m, i) => {
        const e = ev(m.id);
        if (!e) return "";
        return `<button class="ranked${i ? "" : " first"}" data-act="openQuest" data-arg="${e.id}"><span class="rank t-display-m">${i + 1}</span>${poster(e)}
          <span class="text"><span class="t-title-m ellipsis">${esc(e.title)}</span><span class="t-body-m c-secondary ellipsis">${tierWord(m.match)}${i ? "" : ` for all ${people.length}`}${e.price == null ? "" : ` · ${esc(priceLabel(e))}`}</span></span></button>
          ${i === 0 && m.reason ? `<div class="reason-box t-body-m">${esc(m.reason)}</div>` : ""}`;
      }).join("") : `<p class="t-body-m c-secondary">Nothing suits everyone within these limits.</p>`}
      ${b.unmet && b.unmet.length ? `<div class="notice hot">${icon("bulb")}<span>Nothing fit ${esc(b.unmet[0].person)}'s ${esc(b.unmet[0].interest)}.</span><button class="action" data-act="requestGap" data-arg="${esc(b.unmet[0].interest)}">Request it</button></div>` : ""}`;
    const voteRow = (e) => {
      const mine = myVote === e.id;
      return `<div class="vote-row">
        <button class="text" data-act="openQuest" data-arg="${e.id}"><span class="t-title-m ellipsis">${esc(e.title)}</span><span class="t-data c-secondary">${esc(short(e))}</span></button>
        ${xsFaces(t[e.id] || [])}
        ${btn(mine ? "Voted" : "Vote", { "data-act": "vote", "data-arg": e.id, "aria-pressed": String(mine) }, mine ? "primary s" : "secondary s", mine ? "check" : "")}
      </div>`;
    };
    const ranked = [...opts].sort((a, b2) => (t[b2.id] || []).length - (t[a.id] || []).length);
    const podium = big && ranked.length >= 3 ? `<div class="podium">${[1, 0, 2].map((i) => {
        const e = ranked[i];
        return `<button class="step s${i + 1}" data-act="openQuest" data-arg="${e.id}">${xsFaces(t[e.id] || [])}${poster(e)}<span class="t-caption name">${esc(e.title)}</span><span class="block t-display-m">${i + 1}</span></button>`;
      }).join("")}</div><p class="t-caption c-secondary">Big parties see a podium of the top three, so ties stay readable.</p>` : "";
    const vote = `<div class="stack" style="gap:4px">
        <div class="section-head"><span class="t-title-l">Where are we going?</span><span class="t-caption c-secondary">${big && ranked.length >= 3 ? `Top 3 of ${ranked.length}` : myVote ? "Your vote is in" : opts.length ? "Pick one" : ""}</span></div>
        ${podium}
        ${(big ? ranked : opts).map(voteRow).join("") || `<p class="t-body-m c-secondary">Send a sidequest to the party to start the vote.</p>`}
      </div>
      ${p.locked && ev(p.locked) ? btn(`See the plan for ${ev(p.locked).title}`, { "data-go": "group-plan" }, "social", "crew")
        : Object.keys(t).length ? btn("Lock in the plan", { "data-act": "lockPoll" }, "primary", "check") : ""}`;
    const chat = `<div class="stack" style="gap:10px">
        <div class="section-head"><span class="t-title-l">Party chat</span></div>
        <div class="bubbles">${p.chat.slice(-6).map((m) => m.from === "Sidequest" ? `<p class="bubble system">${esc(m.text)}</p>` : `<p class="bubble${m.from === myName() ? " mine" : ""}"><b>${esc(m.from)}</b>${esc(m.text)}</p>`).join("")}</div>
        <form class="composer" data-act="partyChat"><input data-bind="partyMsg" value="${esc(U().partyMsg)}" placeholder="Message ${esc(p.name)}" aria-label="Message your party"><button class="icon-btn" type="submit" aria-label="Send">${icon("send")}</button></form>
      </div>`;
    const body = `<div class="pad-x stack" style="gap:20px;padding-top:20px;padding-bottom:24px">
        ${who}
        ${big ? vote : `<div class="stack" style="gap:10px"><div class="section-head"><span class="t-title-l">Shared themes</span></div>
          <div class="chips wrap">${themes.map((x, i) => `<span class="chip${i ? "" : " on"}">${i ? "" : icon("trophy")}${esc(x)}</span>`).join("")}</div></div>
        <div class="stack" style="gap:10px"><div class="section-head"><span class="t-title-l">Group picks</span>${b && !U().blendLoading ? `<button class="t-caption c-secondary" data-act="reblend">Crew Blend</button>` : '<span class="t-caption c-secondary">Crew Blend</span>'}</div>${picks}</div>
        ${vote}`}
        ${chat}
      </div>`;
    if (big) return screen(body, { title: p.name, right: settings });
    const cover = p.cover || "cheers";
    return screen(`
      <div class="group-header">
        ${ph(cover)}<span class="scrim-top"></span><span class="scrim-bottom"></span>
        <div class="gh-nav">${iconBtn("back", { "data-back": "", "aria-label": "Back" }, "glass")}<span class="grow"></span>
          <button class="glass-pill" data-act="partyCover" data-arg="${COVERS[(COVERS.indexOf(cover) + 1) % COVERS.length]}">${icon("camera")}Cover</button>${settings}</div>
        <div class="gh-info">
          <span class="overline c-white" style="opacity:.85">Party · ${people.length} ${people.length === 1 ? "person" : "people"}${p.coverBy ? ` · cover picked by ${esc(p.coverBy === myName() ? "you" : p.coverBy)}` : ""}</span>
          <h1 class="t-display-m c-white">${esc(p.name)}</h1>
          ${faces(people, 6, true)}
        </div>
      </div>${body}`, { cls: "bleed" });
  } };

  // Figma: Group plan. Locked in: who's in, where to meet, and your answer.
  S["group-plan"] = { role: "attendee", label: "Group plan", render: () => {
    const p = SQ.d.party;
    const e = ev(p.locked);
    if (!e) return screen(empty("crew", "Lock in a plan from your party first."), { title: "Group plan" });
    const u = me();
    const mine = u.log[e.id];
    const out = U().planOut === e.id;
    const isIn = (n, i) => (i === 0 ? !!mine && !out : p.votes[n] === e.id || (e.friends || []).includes(n));
    const people = crew();
    const inCount = people.filter(isIn).length;
    const meet = U().meetAt || (e.venue && e.venue.address ? e.venue.address.split(",")[0] : e.venue ? e.venue.name : e.neighbourhood);
    const meetTime = clock(new Date(Date.parse(e.startsAt) - 10 * 6e4).toISOString());
    return screen(`
      <div class="group-header plan">
        ${poster(e)}<span class="scrim-top"></span><span class="scrim-bottom"></span>
        <div class="gh-nav">${iconBtn("back", { "data-back": "", "aria-label": "Back" }, "ghost c-white")}</div>
        <div class="gh-info">
          <span class="overline c-white" style="opacity:.85">Group plan · ${esc(p.name)}</span>
          <h1 class="t-display-m c-white">${esc(e.title)}</h1>
          <span class="t-data c-white">${esc([new Date(e.startsAt).toLocaleDateString("en-US", { weekday: "long", timeZone: TZ }), clock(e.startsAt), e.venue && e.venue.address ? e.venue.address.split(",")[0] : e.neighbourhood, e.price == null ? "" : priceLabel(e)].filter(Boolean).join(" · "))}</span>
        </div>
      </div>
      <div class="pad-x stack" style="gap:16px;padding-top:20px;padding-bottom:24px">
        <div class="notice">${icon("info")}<span>${inCount === people.length ? "Everyone's in. The plan is locked." : `The plan locks when everyone replies. ${inCount} of ${people.length} are in.`}</span></div>
        <div class="stack" style="gap:0">${people.map((n, i) => `<div class="list-row"><span class="av ${i ? SQ.avTone(n) : ""}">${esc(n[0])}</span><span class="text"><span>${i ? esc(n) : "You"}</span></span>${isIn(n, i) ? SQ.tag("In", "success") : SQ.tag(i === 0 && out ? "Out" : "Pending", i === 0 && out ? "danger" : "")}</div>`).join("")}</div>
        <div class="list-row"><span class="lead-ic">${icon("pin")}</span><span class="text"><span>Meet at ${esc(meet)}</span><span class="t-caption">${esc(meetTime)} · 10 min before it starts</span></span><button class="t-label-s c-accent" data-act="changeMeet">Change</button></div>
      </div>`, { cls: "bleed", footer: `<div class="footer-bar row">${btn("Can't make it", { "data-act": "planOut", "data-arg": e.id }, "outline")}${btn(mine && !out ? "You're in" : "I'm in", { "data-act": "planIn", "data-arg": e.id }, "primary", "check")}</div>` });
  } };

  /* ===================== Sidequest Requests (Figma: Quest Requests, Request a quest) ===================== */
  const requestStatus = (r) => (r.status === "live" ? "live now" : r.status === "claimed" ? `${esc(r.claimedBy)} planning` : r.votes >= 10 ? "heating up" : "");
  SQ.requestStatus = (r) => (r.status === "live" ? SQ.tag("Booked", "success", "check") : r.status === "claimed" ? SQ.tag(`Claimed by ${r.claimedBy}`, "signature") : r.votes >= 10 ? SQ.tag("Heating up", "hot") : SQ.tag("Open"));
  const requestMeta = (r) => [r.area || ORIGIN_SHORT[r.origin], r.when, requestStatus(r)].filter(Boolean).map(esc).join(" · ");
  SQ.requestMeta = (r) => [r.area || ORIGIN_SHORT[r.origin], r.when, r.size, r.budget != null ? (r.budget ? `up to $${r.budget}` : "free") : ""].filter(Boolean).map(esc).join(" · ");
  function requestCard(r) {
    const u = me();
    const mine = u.myRequests.includes(r.id);
    const voted = mine || u.votedRequests.includes(r.id);
    const action = r.status === "live" ? `<button data-act="openQuest" data-arg="${r.eventId}" class="tag-btn">${SQ.tag("Booked", "success", "check")}</button>`
      : voted ? btn(mine ? "Yours" : "Interested", { "data-act": "upvote", "data-arg": r.id, "aria-pressed": "true", disabled: mine }, "primary s", "check")
      : btn("I’m interested", { "data-act": "upvote", "data-arg": r.id, "aria-pressed": "false" }, "secondary s", "plus");
    return `<div class="req-card">
      <span class="req-count"><span class="t-display-m">${r.votes}</span><span class="t-caption c-secondary">asked</span></span>
      <span class="stack" style="gap:4px;flex:1;min-width:0"><span class="t-title-m">${esc(r.text)}</span><span class="t-body-m c-secondary">${requestMeta(r)}</span><span style="margin-top:6px">${action}</span></span>
    </div>`;
  }

  S.requests = { role: "attendee", label: "Quest Requests", render: () => {
    const list = [...SQ.d.requests].sort((a, b) => b.votes - a.votes);
    return screen(`
      <div class="page-head"><span class="overline">Tell hosts what you want</span><h1 class="t-display-xl">Sidequest Requests</h1>
        <p class="t-body-l c-secondary">Back the sidequests you'd go to. Every account counts once, so hosts can trust the number.</p></div>
      <div class="pad-x stack" style="gap:14px;padding-top:22px;padding-bottom:24px">
        ${btn("Request a sidequest", { "data-act": "newRequest" }, "primary", "plus")}
        ${btn("Found an event? Add it to Sidequest", { "data-act": "addEvent" }, "ghost m", "link")}
        <div class="section-head" style="margin-top:6px"><span class="t-title-l">Trending near you</span><span class="t-caption c-secondary">last 30 days</span></div>
        ${list.map(requestCard).join("")}
      </div>`, { tabbar: attendeeTabs("requests") });
  } };

  SQ.budgetLabel = (b) => (b >= 60 ? "Any" : b ? `Under $${b}` : "Free");
  const REQ_WHEN = ["Weeknights", "Friday night", "Weekend days"];
  S["request-new"] = { role: "attendee", label: "Request a quest", render: () => {
    const d = U().reqDraft;
    const u = me();
    // Vibe tags: search them, pick as many as fit; yours come first
    const vq = d.vibeQ.trim().toLowerCase();
    const vibes = [...new Set([...d.vibe, ...u.vibes, ...V().VIBES])].filter((v) => d.vibe.includes(v) || (vq ? v.toLowerCase().includes(vq) : true)).slice(0, vq ? 12 : Math.max(6, d.vibe.length));
    const hood = SQ.HOODS.find((h) => h[0] === d.area);
    const wheres = [...new Set([u.homeArea, ...(u.areas || []), "Kensington"].filter(Boolean))].slice(0, 2).concat("Anywhere");
    const budget = d.budget === "" ? 60 : Number(d.budget);
    const words = (s) => (s.toLowerCase().match(/[a-z]{5,}/g) || []).filter((w) => !["night", "nights", "party", "event", "class"].includes(w));
    const mineWords = words(d.text);
    const asked = mineWords.length ? SQ.d.requests.filter((r) => r.status !== "live" && words(r.text).some((w) => mineWords.includes(w))).sort((a, b) => b.votes - a.votes)[0] : null;
    const chips = (list, key) => `<div class="chips wrap">${list.map((x) => chip(x, [].concat(d[key]).includes(x), { "data-act": "reqSet", "data-arg": `${key}:${x}` })).join("")}</div>`;
    const group = (label, list, key) => `<span class="overline">${label}</span>${chips(list, key)}`;
    return screen(`
      <div class="pad-x stack" style="gap:16px;padding-top:4px;padding-bottom:24px">
        ${field("What would you go to?", "reqDraft.text", d.text, "text", "Late-night ramen pop-up", { "data-change": "render" })}
        ${d.source === "gap" ? `<div class="notice">${icon("search")}<span>From your search: nothing listed fit this yet.</span></div>` : ""}
        <div class="section-head"><span class="overline">Vibe</span><span class="t-caption c-secondary">Pick any</span></div>
        <div class="search">${icon("search")}<input data-bind="reqDraft.vibeQ" data-live value="${esc(d.vibeQ)}" placeholder="Search tags" aria-label="Search vibe tags"></div>
        ${vibes.length ? chips(vibes, "vibe") : `<p class="t-caption c-tertiary">No tags match that.</p>`}
        <div class="section-head"><span class="overline">When</span><span class="t-caption c-secondary">Pick any</span></div>
        ${chips(REQ_WHEN, "when")}
        ${group("Where", wheres, "area")}
        ${SQ.mapView("req-where", { labels: hood ? [hood[0]] : true, style: "height:180px;border-radius:20px",
          view: hood ? { lat: hood[1], lng: hood[2], zoom: 13.2 } : { lat: 43.6532, lng: -79.3832, zoom: 10.8 },
          pins: hood ? [{ lat: hood[1], lng: hood[2], tier: "strong", selected: true, label: hood[0] }] : [],
          circles: hood ? [{ lat: hood[1], lng: hood[2], km: hood[4], on: true }] : [] })}
        <div class="stack" style="gap:10px">
          <div class="section-head"><span class="overline">Budget</span><span class="t-data" data-out="reqDraft.budget">${SQ.budgetLabel(budget)}</span></div>
          <input type="range" class="range" style="--fill:${(budget / 60) * 100}%" min="0" max="60" step="5" value="${budget}" data-bind="reqDraft.budget" data-format="budgetLabel" aria-label="Budget">
          <div class="section-head"><span class="t-data c-secondary">$0</span><span class="t-data c-secondary">$60</span></div>
        </div>
        ${asked ? `<span class="overline">Already asked · back one instead</span>${requestCard(asked)}` : ""}
      </div>`, { title: "Request a sidequest", close: true, footer: `<div class="footer-bar">${btn("Post request", { "data-act": "postRequest" })}</div>` });
  } };

  // Add an event someone spotted: a poster on a pole, a screenshot of a story. The AI fills the form in.
  S.spot = { role: "attendee", label: "Add an event from a poster", render: () => {
    const d = U().spotDraft || (U().spotDraft = SQ.emptySpotDraft());
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
    return screen(`
      <div class="pad stack">
        <p class="muted">Saw a poster on a pole, in a café, or on someone's story? Add it so people looking for nights like it can find it.</p>
        ${SQ.posterPanel("attendee", "posterSpot")}
        ${SQ.posterDuplicate("attendee")}
        ${d.image ? poster({ id: "spot", title: d.title || "Your poster", image: d.image }, "", { style: "height:220px" }) : ""}
        ${field("Title", "spotDraft.title", d.title, "text", "Neon Moths with Cold Lake")}
        ${field("Date", "spotDraft.date", d.date, "date", "", { min: today })}
        <div class="btn-row">${field("Start time", "spotDraft.time", d.time, "time")}${field("End time", "spotDraft.endTime", d.endTime, "time")}</div>
        ${field("Venue", "spotDraft.venue.name", d.venue.name, "text", "The Garrison")}
        ${field("Street address", "spotDraft.venue.address", d.venue.address, "text", "1197 Dundas St W")}
        ${field("Price (CAD, 0 = free)", "spotDraft.price", d.price, "number", "", { min: 0, inputmode: "numeric" })}
        ${field("Who's putting it on", "spotDraft.organizer", d.organizer, "text", "")}
        ${field("Ticket or info link", "spotDraft.ticketLink", d.ticketLink, "url", "https://")}
        ${textarea("Description", "spotDraft.description", d.description, "Lineup, what to expect")}
        <h3 class="section-title">Vibes (pick at least one)</h3>
        <div class="chips" data-req="spotDraft.vibes">${V().VIBES.map((v) => chip(v, d.vibes.includes(v), { "data-act": "spotVibe", "data-arg": v }, SQ.VIBE_ICON[v])).join("")}</div>
        <p class="small muted">It's listed as added by a Sidequest member. If it's already on Sidequest, your poster fills in the gaps of that listing instead of making a copy.</p>
      </div>`, { title: "Add an event", footer: `<div class="action-bar">${btn("Add to Sidequest", { "data-act": "submitSpot" }, "primary", "plus")}</div>` });
  } };

  // Figma: 15 Notifications. Today, then Earlier; each row opens what it's about.
  const ago = (iso) => {
    const m = Math.max(1, Math.round((SQ.now() - new Date(iso)) / 6e4));
    return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
  };
  const notifIcon = (n) => (n.friendFrom ? "userPlus" : n.requestId ? "bulb" : n.rate ? "star" : /^Update/.test(n.title) ? "clock" : n.eventId ? "spark" : "bell");
  S.notifications = { role: "attendee", label: "Notifications", render: () => {
    const list = me().notifications.slice().reverse();
    const today = SQ.now().toDateString();
    const row = (n) => `<button class="list-row divided notif-row" data-act="openNotif" data-arg="${n.id}">
        <span class="lead-ic">${icon(notifIcon(n))}</span>
        <span class="text"><span>${esc(n.title)}</span><span>${esc(n.body)}</span><span class="t-data c-tertiary">${ago(n.time)}</span></span>
        ${/booked|is on|it.s happening/i.test(n.title) ? SQ.tag("Booked", "hot") : icon("chevR")}
      </button>`;
    const group = (label, items) => (items.length ? `<span class="overline${label === "Earlier" ? " notif-gap" : ""}">${label}</span>${items.map(row).join("")}` : "");
    return screen(`<div class="pad" style="padding-top:8px">
      ${list.length ? group("Today", list.filter((n) => new Date(n.time).toDateString() === today)) + group("Earlier", list.filter((n) => new Date(n.time).toDateString() !== today))
        : empty("bell", "No notifications yet. Requests you post or upvote show up here when a host picks them up.")}
    </div>`, { title: "Notifications", right: iconBtn("settings", { "data-go": "profile", "aria-label": "Notification settings" }) });
  } };

  /* ===================== Sidequests (Quest Log), event day, check-in, rating, memories, Wrapped (Figma: 20 to 27) ===================== */
  const LOG_TABS = [["Upcoming", "Upcoming"], ["Saved", "Bookmarked"], ["Completed", "Past"]];
  const logEntries = () => Object.entries(me().log).map(([id, l]) => ({ e: ev(id), l })).filter((x) => x.e);
  const longDate = (e) => new Date(e.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
  const withWho = (e, l) => [...new Set([...(l.with || []), ...partyGoing(e)])];
  const planTag = (e) => {
    const p = SQ.d.party;
    if (p.locked !== e.id) return "";
    const people = crew();
    const n = people.filter((x, i) => (i ? p.votes[x] === e.id || (e.friends || []).includes(x) : !!me().log[e.id])).length;
    return SQ.tag(`Group plan · ${n} of ${people.length} in`, "social");
  };
  // A sidequest you're going to, as a card row (Figma: 20 Quest Log rows)
  const logRow = (e, act = "openQuest") => `<button class="log-row" data-act="${act}" data-arg="${e.id}">${poster(e)}
      <span class="text"><span class="t-title-m ellipsis">${esc(e.title)}</span><span class="t-data c-secondary ellipsis">${esc([dayTime(e), e.venue ? e.venue.name : e.neighbourhood].join(" · "))}</span>
        ${SQ.ticketFor(e.id) ? SQ.tag("Got tickets", "success") : planTag(e)}</span>${icon("chevR")}</button>`;
  const stars5 = (n, cls = "") => `<span class="stars5 ${cls}" aria-label="${n} of 5 stars">${[1, 2, 3, 4, 5].map((i) => icon(i <= n ? "starFill" : "star", i <= n ? "on" : "")).join("")}</span>`;
  const yearCount = () => logEntries().filter(({ e, l }) => l.status === "went" && new Date(e.startsAt).getFullYear() === SQ.now().getFullYear()).length;
  const wrappedCard = (title) => `<button class="wrapped-card" data-go="wrapped"><span class="overline">Sidequest Wrapped${title.preview ? " · preview" : ""}</span><span class="t-title-l">${esc(title.text)}</span></button>`;

  function calendar(entries) {
    const base = SQ.now();
    const off = U().calMonth || 0;
    const first = new Date(base.getFullYear(), base.getMonth() + off, 1, 12);
    const key = (d) => SQ.dayKey(d);
    const todayKey = SQ.dayKey(base);
    const sel = U().calDay || todayKey;
    const days = new Set(entries.map((e) => SQ.dayKey(new Date(e.startsAt))));
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12));
    const rows = cells[35].getMonth() !== first.getMonth() ? cells.slice(0, 35) : cells;
    const onDay = entries.filter((e) => SQ.dayKey(new Date(e.startsAt)) === sel).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const selDate = new Date(`${sel}T12:00:00`);
    return `<div class="cal">
        <div class="cal-head"><span class="t-title-l">${first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
          <span class="row start" style="gap:4px">${iconBtn("back", { "data-act": "calMonth", "data-arg": -1, "aria-label": "Previous month" }, "ghost s")}${iconBtn("chevR", { "data-act": "calMonth", "data-arg": 1, "aria-label": "Next month" }, "ghost s")}</span></div>
        <div class="cal-grid">${"SMTWTFS".split("").map((d) => `<span class="overline dow">${d}</span>`).join("")}
          ${rows.map((d) => { const k = key(d); return `<button class="day${d.getMonth() !== first.getMonth() ? " out" : ""}${k === todayKey ? " today" : ""}${k === sel ? " sel" : ""}" data-act="calDay" data-arg="${k}"><span>${d.getDate()}</span>${days.has(k) ? "<i></i>" : ""}</button>`; }).join("")}</div>
      </div>
      <span class="overline">${esc(`${selDate.toLocaleDateString("en-US", { weekday: "long" })} ${selDate.getDate()}`)}</span>
      ${onDay.map((e) => logRow(e)).join("") || '<p class="t-body-m c-secondary">Nothing planned that day.</p>'}`;
  }

  S.questlog = { role: "attendee", label: "Quest Log", render: () => {
    const u = me();
    const tab = U().logTab;
    const cal = U().logCal && tab === "Upcoming";
    const entries = logEntries();
    let body = "";
    if (tab === "Upcoming") {
      const up = entries.filter((x) => x.l.status === "going" && !isPast(x.e)).map((x) => x.e).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      if (cal) body = calendar([...up, ...u.saved.map(ev).filter((e) => e && !isPast(e))]);
      else if (!up.length) body = `<div class="empty-state"><span class="illo">${icon("ticket")}</span><p class="t-body-l c-secondary">No sidequests coming up yet.</p>${btn("Find a sidequest", { "data-go": "discover" }, "secondary m", "search")}</div>`;
      else {
        const [next, ...rest] = up;
        body = `${questCard(next).replace('class="qcard"', 'class="qcard log-hero"')}
          ${btn("Open event day", { "data-act": "openEventDay", "data-arg": next.id }, "primary m", "ticket")}
          ${rest.length ? `<span class="overline">This week</span>${rest.map((e) => logRow(e)).join("")}` : ""}`;
      }
      if (!cal) body += wrappedCard({ preview: true, text: `${yearCount()} sidequest${yearCount() === 1 ? "" : "s"} so far this year` });
    }
    if (tab === "Saved") {
      const saved = u.saved.map(ev).filter((e) => e && !u.log[e.id]);
      body = `<p class="t-body-m c-secondary">Everything you bookmarked, with no plan or ticket yet.</p>
        ${saved.length ? saved.map((e) => `<div class="row start saved-row" style="gap:14px">${questRow(e).replace(pillFor(e), "")}${iconBtn("bookmarkFill", { "data-act": "save", "data-arg": e.id, "aria-label": "Remove bookmark", "aria-pressed": "true" }, "ghost accent")}</div>`).join("")
          : '<p class="t-body-m c-secondary">Nothing bookmarked yet. Tap the bookmark on a sidequest.</p>'}`;
    }
    if (tab === "Completed") {
      const ask = entries.filter((x) => x.l.status === "going" && isPast(x.e));
      const done = entries.filter((x) => x.l.status !== "going").sort((a, b) => b.e.startsAt.localeCompare(a.e.startsAt));
      body = `<p class="t-body-m c-secondary">Your sidequest memory book. Unrated sidequests are flagged.</p>
        ${ask.map(({ e }) => `<div class="past-card flag">
          <div class="row start" style="gap:14px">${poster(e)}<span class="text"><span class="t-title-m ellipsis">${esc(e.title)}</span><span class="t-data c-secondary">${esc(longDate(e))}</span></span></div>
          <span class="t-title-m">Did you go?</span><span class="t-caption c-secondary">Only nights you actually went count. It also trains your taste avatar.</span>
          <div class="btn-row">${btn("Yes, I went", { "data-act": "didGo", "data-arg": e.id }, "primary m")}${btn("No", { "data-act": "didntGo", "data-arg": e.id }, "secondary m")}</div></div>`).join("")}
        ${done.map(({ e, l }) => `<button class="past-card${l.status === "went" && !l.rating ? " flag" : ""}" data-act="${l.status === "went" && !l.rating ? "openRate" : "openMemory"}" data-arg="${e.id}">
          <span class="row start" style="gap:14px">${poster(e)}<span class="text"><span class="t-title-m ellipsis">${esc(e.title)}</span>
            <span class="t-data c-secondary ellipsis">${esc([longDate(e).replace(/^(\w+),/, "$1"), withWho(e, l).length ? `with ${withWho(e, l).join(", ")}` : ""].filter(Boolean).join(" · "))}</span>
            ${l.status === "missed" ? SQ.tag("Didn't go") : l.rating ? stars5(l.rating) : SQ.tag("Rate this sidequest", "warning", "star")}</span></span></button>`).join("")}
        ${!ask.length && !done.length ? '<p class="t-body-m c-secondary">Nothing here yet. After a sidequest, tell us if you went.</p>' : ""}
        ${done.some((x) => x.l.status === "went") ? wrappedCard({ text: "Your year in sidequests is ready to preview" }) : ""}`;
    }
    return screen(`
      <div class="page-head" style="gap:14px">
        <div class="row start" style="gap:8px"><h1 class="t-display-xl grow">Sidequests</h1>
          ${iconBtn("wallet", { "data-act": "openWallet", "aria-label": "Ticket wallet" })}
          ${iconBtn(cal ? "list" : "cal", { "data-act": "toggleLogCal", "aria-label": cal ? "Show as a list" : "Show a calendar" })}</div>
        <div class="seg surface">${LOG_TABS.map(([k, label]) => `<button class="${tab === k ? "on" : ""}" data-act="setLogTab" data-arg="${k}" aria-pressed="${tab === k}">${label}</button>`).join("")}</div>
      </div>
      <div class="pad-x stack" style="gap:14px;padding-top:18px;padding-bottom:24px">${body}</div>`, { tabbar: attendeeTabs("questlog") });
  } };

  // Figma: 22 Event day. Getting there, entrances, the floor plan (tap a spot), live host updates.
  const ZONES = [["bar", "Bar", "Drinks and the bar"], ["stage", "Main room", "Where it's happening"], ["front", "Front", "Up front, by the stage"], ["door", "Door", "Entrance and coat check"]];
  S.eventday = { role: "attendee", label: "Event day mode", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const u = me();
    const t = trip(e, u.origin);
    const msgs = SQ.d.hostMessages.filter((m) => m.eventId === e.id).slice().reverse();
    const party = [...new Set([...partyGoing(e), ...(SQ.d.party.locked === e.id ? SQ.d.party.members : [])])];
    const zone = U().zone;
    const leave = t ? clock(new Date(Date.parse(e.startsAt) - (t.minutes + 5) * 6e4).toISOString()) : "";
    const ticket = SQ.ticketFor(e.id);
    const checked = u.log[e.id] && u.log[e.id].checkedIn;
    const where = (i) => ZONES[[1, 0, 2, 3][i % 4]][0]; // where each friend is standing
    const card = (ic, title, inner) => `<div class="day-card"><span class="row start" style="gap:10px">${icon(ic)}<span class="t-title-m">${title}</span></span>${inner}</div>`;
    return screen(`
      <div class="pad-x stack" style="gap:14px;padding-bottom:24px">
        <div class="stack" style="gap:6px">
          <div class="row start" style="gap:8px">${isToday(e) ? SQ.tag(hourOf(e) >= 17 ? "Tonight" : "Today", "hot") : SQ.tag(longDate(e))}${SQ.tag(SQ.is19(e) ? "19+" : "All ages")}${checked ? SQ.tag("Checked in", "success", "check") : ""}</div>
          <h1 class="t-display-m">${esc(e.title)}</h1>
          <span class="t-data c-secondary">${esc([`Starts ${clock(e.startsAt)}`, e.endsAt ? `Ends ${clock(e.endsAt)}` : "", e.venue ? e.venue.name : e.neighbourhood].filter(Boolean).join(" · "))}</span>
        </div>
        ${card("walk", "Getting there", `<p class="t-body-m c-secondary">${esc([distLabel(e), t ? tripLabel(t) : `nearest stop ${e.travel.stop}`].join(" · "))}.${leave ? ` Leave by ${esc(leave)} to make the start.` : ""}${e.dayInfo.transit ? ` ${esc(e.dayInfo.transit)}` : ""}</p>`)}
        ${card("door", "Entrances", `<div class="stack" style="gap:8px">
          <span class="row start" style="gap:8px">${SQ.matchPill(90)}<span class="t-body-m">${esc(e.dayInfo.entrance)}</span></span>
          <span class="row start" style="gap:8px">${SQ.matchPill(30)}<span class="t-body-m c-secondary">Coat check · ${esc(e.dayInfo.coat)}</span></span>
          ${(e.dayInfo.entrances || []).slice(1).map((x) => `<span class="row start" style="gap:8px">${SQ.matchPill(30)}<span class="t-body-m c-secondary">${esc(x)}</span></span>`).join("")}
          ${[["stepFree", "Step-free entrance"], ["reentry", "Re-entry"], ["quietRoom", "Quiet room"]].filter(([k]) => e.dayInfo[k] && e.dayInfo[k].on).map(([k, l]) => `<span class="t-body-m c-secondary">${esc(l)}${e.dayInfo[k].note ? ` · ${esc(e.dayInfo[k].note)}` : ""}</span>`).join("")}
          ${(e.dayInfo.payments || []).length ? `<span class="t-body-m c-secondary">At the door: ${esc(e.dayInfo.payments.join(", ").toLowerCase())}</span>` : ""}
          <span class="t-caption c-secondary">Getting home: ${esc(e.dayInfo.home)}</span></div>`)}
        ${e.dayInfo.floorPlan ? card("map", "Floor plan", `<img class="floor-img" src="${e.dayInfo.floorPlan}" alt="Floor plan from the host">`) : ""}
        ${e.dayInfo.floorPlan ? "" : card("map", "Floor plan", `<div class="floor" role="group" aria-label="Floor plan, tap a spot">
            ${ZONES.map(([k, label]) => `<button class="zone z-${k}${zone === k ? " on" : ""}" data-act="pickZone" data-arg="${k}" aria-pressed="${zone === k}">${label}
              ${party.map((n, i) => (where(i) === k ? avatar(n, "xs") : "")).join("")}</button>`).join("")}
          </div>
          <p class="t-caption c-secondary">${zone ? esc(`${ZONES.find((z) => z[0] === zone)[2]}.${party.filter((n, i) => where(i) === zone).length ? ` ${andList(party.filter((n, i) => where(i) === zone))} ${party.filter((n, i) => where(i) === zone).length > 1 ? "are" : "is"} here.` : ""}`) : party.length ? `Tap a spot to see who from your party is there.` : "Tap a spot to see what's there."}</p>`)}
        ${card("megaphone", "Live updates", msgs.length ? msgs.slice(0, 3).map((m) => `<div class="row start top" style="gap:12px"><span class="t-data c-secondary">${clock(m.time)}</span><span class="t-body-m">${esc(m.text)}</span></div>`).join("")
          : `<p class="t-body-m c-secondary">No updates from ${esc(e.organizer.name)} yet. They'll show up here live.</p>`)}
        ${isPast(e) ? "" : `<button class="btn btn-ghost m" data-act="skipToAfter" data-arg="${e.id}">Demo: skip to after the event</button>`}
      </div>`, { title: "Event day", right: iconBtn("share", { "data-act": "share", "data-arg": e.id, "aria-label": "Share" }),
      footer: `<div class="footer-bar row" style="gap:10px">${checked ? btn("You're checked in", { "data-go": "checkin-done" }, "secondary", "check") : btn("Check in at the door", { "data-go": "checkin" }, "primary", "qr")}
        ${iconBtn("wallet", ticket ? { "data-act": "openWalletTicket", "data-arg": ticket.id, "aria-label": "Show my ticket" } : { "data-act": "addTicket", "data-arg": e.id, "aria-label": "Add my ticket" })}
        ${iconBtn("bubble", { "data-go": "eventday-chat", "aria-label": "Attendee chat" })}</div>` });
  } };

  // Figma: 22 Attendee chat. Channels, the host's pinned note, then the room.
  const CHANNELS = ["general", "record requests", "meet up first"];
  S["eventday-chat"] = { role: "attendee", label: "Event day: attendee chat", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const ch = U().chatCh || "general";
    const chat = (SQ.d.eventChat[e.id] || []).filter((m) => (m.channel || "general") === ch);
    const pinned = SQ.d.hostMessages.filter((m) => m.eventId === e.id).slice(-1)[0];
    const mine = myName();
    return screen(`
      <div class="pad-x stack" style="gap:14px;padding-bottom:16px">
        <div class="chips scroll-x">${CHANNELS.map((c) => chip(`# ${c}`, c === ch, { "data-act": "chatChannel", "data-arg": c })).join("")}</div>
        <div class="pinned"><span class="overline row start" style="gap:6px">${icon("pinned")}Pinned by the host</span><p class="t-body-m">${esc(pinned ? pinned.text : `Entrance: ${String(e.dayInfo.entrance).replace(/\.+$/, "")}. Coat check: ${String(e.dayInfo.coat).replace(/\.+$/, "")}.`)}</p></div>
        ${chat.map((m) => m.from === mine ? `<p class="msg mine">${esc(m.text)}</p>` : `<div class="msg-group"><span class="row start" style="gap:8px">${avatar(m.from, "xs")}<span class="t-caption c-secondary">${esc(m.from)}</span>${m.host ? SQ.tag("Host", "solid") : ""}</span><p class="msg${m.host ? " host" : ""}">${esc(m.text)}</p></div>`).join("")
          || `<p class="t-body-m c-secondary center">No messages in # ${esc(ch)} yet. Say hi.</p>`}
      </div>`, { title: e.title, right: iconBtn("more", { "data-act": "toast", "data-arg": `${e.organizer.name} moderates this chat.`, "aria-label": "More" }),
      footer: `<div class="footer-bar"><form class="composer" data-act="eventChat"><input data-bind="eventMsg" value="${esc(U().eventMsg)}" placeholder="Message # ${esc(ch)}" aria-label="Message attendees">${icon("image")}<button class="icon-btn" type="submit" aria-label="Send">${icon("arrow")}</button></form></div>` });
  } };

  // Figma: Check-in scan and Check-in done. The camera reads the venue's QR if the browser can; tapping the frame or location works too.
  S.checkin = { role: "attendee", label: "Check-in scan", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    return screen(`
      <div class="checkin">${poster(e)}<span class="checkin-dim"></span>
        <label class="scan-frame" aria-label="Scan the door QR">${["tl", "tr", "bl", "br"].map((c) => `<i class="${c}"></i>`).join("")}<span class="qr-box">${icon("qr")}</span>
          <input type="file" accept="image/*" capture="environment" data-upload="scanCheckIn" class="sr-only"></label>
        <p class="t-label c-white center">Point at the QR by the ${esc(String(e.dayInfo.entrance).length <= 24 ? String(e.dayInfo.entrance).toLowerCase() : "door")}</p>
      </div>`, { title: "Check in", close: true, cls: "bleed dark-bar", footer: `<div class="footer-bar">${btn("Check in by location instead", { "data-act": "checkInHere", "data-arg": e.id }, "outline", "pin")}</div>` });
  } };
  S["checkin-done"] = { role: "attendee", label: "Check-in done", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const at = (me().log[e.id] || {}).checkedIn;
    return screen(`<div class="age-check"><span class="done-ic"><span>${icon("check")}</span></span><h1 class="t-display-l">You're in.</h1>
        <span class="t-data c-secondary">${esc([at ? `Checked in at ${clock(at)}` : "Checked in", e.venue ? e.venue.name : e.neighbourhood].join(" · "))}</span></div>`,
      { title: "", back: "eventday", close: true, footer: `<div class="footer-bar">${btn("Back to event day", { "data-go": "eventday" })}</div>` });
  } };

  // Figma: 24 Rate. Overall, the details, who you were with, photos.
  const DETAILS = ["Host", "Ambience", "Venue", "Accessibility", "Vibes"];
  S.rate = { role: "attendee", label: "Rate a quest", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const r = U().rating;
    const starBtns = (n, act, arg = "") => [1, 2, 3, 4, 5].map((i) => `<button class="star-btn" data-act="${act}" data-arg="${arg}${i}" aria-label="${i} star${i > 1 ? "s" : ""}" aria-pressed="${i <= n}">${icon(i <= n ? "starFill" : "star")}</button>`).join("");
    const people = [...new Set([...SQ.d.party.members, ...r.with])];
    return screen(`
      <div class="pad-x stack" style="gap:16px;padding-bottom:24px">
        <div class="stack" style="gap:8px"><span class="overline">Rate your sidequest · ${esc(longDate(e).replace(",", ""))}</span><h1 class="t-display-m">How was ${esc(e.title)}?</h1></div>
        <div class="overall"><span class="overline">Overall</span><span class="stars-big">${starBtns(r.stars, "setStars")}</span></div>
        <div class="stack" style="gap:4px"><span class="overline">Rate the details · optional</span>
          ${DETAILS.map((d) => `<div class="detail-row"><span class="t-body-l">${d}</span><span class="stars-sm">${starBtns(r.details[d] || 0, "setDetail", `${d}:`)}</span></div>`).join("")}</div>
        <div class="stack" style="gap:10px"><span class="overline">Who were you with?</span>
          <div class="chips">${people.map((n) => chip(n, r.with.includes(n), { "data-act": "rateWith", "data-arg": n })).join("")}<button class="chip outline" data-act="rateSomeone">+ Someone new</button></div></div>
        <div class="stack" style="gap:10px"><span class="overline">Photos</span>
          <div class="photo-row">${r.photos.map((p, i) => `<button class="shot" style="background-image:url('${p}')" data-act="removeRatePhoto" data-arg="${i}" aria-label="Remove photo"></button>`).join("")}
            ${r.photos.length < 3 ? `<label class="shot add">${icon("camera")}<span class="t-caption">Add</span><input type="file" accept="image/*" data-upload="addRatePhoto" class="sr-only"></label>` : ""}</div></div>
      </div>`, { title: "", close: true, footer: `<div class="footer-bar">${btn("Save to past sidequests", { "data-act": "submitRating", disabled: !r.stars })}</div>` });
  } };

  // Figma: Saved quest. A past sidequest in your memory book.
  S.memory = { role: "attendee", label: "Saved quest", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const l = me().log[e.id] || {};
    const who = withWho(e, l);
    const photos = l.photos && l.photos.length ? l.photos : [];
    const met = who.filter((n) => !SQ.d.friends[n]);
    return screen(`
      <div class="group-header plan">${poster(e)}<span class="scrim-top"></span><span class="scrim-bottom"></span>
        <div class="gh-nav">${iconBtn("back", { "data-back": "", "aria-label": "Back" }, "ghost c-white")}</div>
        <div class="gh-info"><span class="overline c-white" style="opacity:.85">${esc(new Date(e.startsAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ }))}</span>
          <h1 class="t-display-m c-white">${esc(e.title)}</h1>${l.rating ? stars5(l.rating) : ""}</div></div>
      <div class="pad-x stack" style="gap:16px;padding-top:20px;padding-bottom:24px">
        <div class="photo-strip">${photos.length ? photos.map((p) => `<span class="shot" style="background-image:url('${p}')"></span>`).join("") : poster(e, "shot")}</div>
        <div class="qd-tags">${who.length ? SQ.tag(`With ${andList(who.slice(0, 2))}`, "social", "crew") : ""}${tilesOf(e).slice(0, 1).map((x) => SQ.tag(x, "signature")).join("")}${l.rating >= 4 ? SQ.tag("Would go again", "success", "heart") : ""}</div>
        ${met.length ? `<span class="overline">People you met</span>${met.map((n) => `<div class="list-row">${avatar(n)}<span class="text"><span>${esc(n)}</span><span class="t-caption">Also at ${esc(e.title)}</span></span>${btn("Connect", { "data-act": "toast", "data-arg": `Sent ${n} a connect request.` }, "secondary s")}</div>`).join("")}` : ""}
        ${l.status === "went" ? btn(l.rating ? "Change my rating" : "Rate this sidequest", { "data-act": "openRate", "data-arg": e.id }, "secondary m", "star") : ""}
      </div>`, { cls: "bleed" });
  } };

  // Figma: 27 Wrapped. Your year, a few slides; tap to go on.
  S.wrapped = { role: "attendee", label: "Sidequest Wrapped", render: () => {
    const went = logEntries().filter(({ e, l }) => l.status === "went" && new Date(e.startsAt).getFullYear() === SQ.now().getFullYear());
    const n = went.length;
    const count = (arr) => Object.entries(arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0];
    const topVibe = count(went.flatMap(({ e }) => tilesOf(e).slice(0, 1)));
    const most = count(went.flatMap(({ e, l }) => withWho(e, l)));
    const hood = count(went.map(({ e }) => e.neighbourhood).filter(Boolean));
    const best = went.filter((x) => x.l.rating).sort((a, b) => b.l.rating - a.l.rating)[0];
    const day = SQ.now().getTime() - new Date(SQ.now().getFullYear(), 0, 1).getTime();
    const every = n ? Math.max(1, Math.round(day / 864e5 / n)) : 0;
    const slides = [
      `<span class="t-title-m">You went out</span><span class="wr-big">${n}</span><span class="wr-line">${n === 1 ? "time" : "times"} this year.${every ? ` That's a sidequest every ${every} day${every === 1 ? "" : "s"}.` : ""}</span>
       <div class="row start" style="gap:10px"><span class="wr-stat"><span class="overline">Top vibe</span><span class="t-title-l">${esc(topVibe ? topVibe[0] : "Still exploring")}</span></span><span class="wr-stat"><span class="overline">Most with</span><span class="t-title-l">${esc(most ? `${most[0]} · ${most[1]}` : "Solo")}</span></span></div>`,
      `<span class="t-title-m">Your neighbourhood</span><span class="wr-line big">${esc(hood ? hood[0] : "All over town")}</span><span class="wr-line">${hood ? `${hood[1]} sidequest${hood[1] === 1 ? "" : "s"} there this year.` : "Go out a few times and we'll find your spot."}</span>`,
      `<span class="t-title-m">Your best night</span><span class="wr-line big">${esc(best ? best.e.title : "Yet to come")}</span>${best ? stars5(best.l.rating, "dark") : '<span class="wr-line">Rate your sidequests and your favourite shows up here.</span>'}`,
    ];
    const i = Math.min(U().wrapStep || 0, slides.length - 1);
    return `<div class="screen wrapped">
      <div class="wr-bars">${slides.map((_, k) => `<span class="${k <= i ? "on" : ""}"></span>`).join("")}</div>
      <div class="wr-top"><span class="overline">Sidequest Wrapped · ${SQ.now().getFullYear()}</span><button class="icon-btn ghost" data-back aria-label="Close">${icon("x")}</button></div>
      <button class="wr-tap" data-act="wrapStep" data-arg="${i + 1 < slides.length ? i + 1 : 0}" aria-label="Next">${slides[i]}</button>
      <div class="wr-foot">${btn("Share my Wrapped", { "data-act": "shareWrapped", "data-arg": `${n}|${topVibe ? topVibe[0] : ""}` }, "outline wr-share", "share")}</div>
    </div>`;
  } };

  /* ===================== Profile (Figma: 24 Profile, Profile editing, Switch account) ===================== */
  const meAvatar = (u, cls = "xl") => (u.photo ? `<span class="av ${cls} photo-av" style="background-image:url('${u.photo}')" role="img" aria-label="Your photo"></span>` : `<span class="av ${cls}">${esc((u.name || "You")[0].toUpperCase())}</span>`);
  const handleOf = (u) => u.handle || `@${String(u.name || "you").toLowerCase().replace(/[^a-z0-9]+/g, ".")}`;
  const settingRow = (ic, title, sub, a) => `<button class="list-row" ${Object.entries(a).map(([k, v]) => `${k}="${esc(v)}"`).join(" ")}><span class="lead-ic">${icon(ic)}</span><span class="text"><span>${esc(title)}</span><span>${esc(sub)}</span></span>${icon("chevR")}</button>`;
  const DAYS_LABEL = { weekends: "Weekends", weeknights: "Weeknights", both: "Any day" };

  S.profile = { role: "attendee", label: "Profile", render: () => {
    const u = me();
    const went = Object.values(u.log).filter((l) => l.status === "went").length;
    const checkins = Object.values(u.log).filter((l) => l.checkedIn).length;
    const tiles = SQ.pickedTiles(u);
    const since = new Date(u.createdAt || SQ.now()).toLocaleDateString("en-US", { month: "short", year: "numeric" }).replace(/^Sep /, "Sept ");
    const whens = WHEN_TILES.filter((w) => (u.when || []).includes(w[0]));
    const theme = U().theme;
    const host = SQ.hostId() && SQ.d.host;
    return screen(`
      <div class="pad-x stack" style="gap:20px;padding-top:8px;padding-bottom:24px">
        <div class="identity">${meAvatar(u)}<h1 class="t-display-m">${esc(u.name || "You")}</h1>
          <span class="t-data c-secondary">${esc([handleOf(u), u.homeArea, `since ${since}`].filter(Boolean).join(" · "))}</span>
          <div class="row" style="gap:8px;width:100%;padding-top:8px">
            <span class="stat-tile"><span class="t-title-l">${went}</span><span class="t-caption c-secondary">Sidequests</span></span>
            <button class="stat-tile" data-go="parties"><span class="t-title-l">${SQ.d.party && SQ.d.party.members.length ? 1 : 0}</span><span class="t-caption c-secondary">Parties</span></button>
            <button class="stat-tile" data-go="requests"><span class="t-title-l">${u.myRequests.length}</span><span class="t-caption c-secondary">Requests</span></button>
          </div></div>
        <div class="stack" style="gap:10px"><div class="section-head"><span class="t-title-l">What your taste avatar knows</span></div>
          <div class="chips">${[...tiles, ...TILES.map((t) => t[0]).filter((t) => !tiles.includes(t))].slice(0, Math.max(4, tiles.length + 1)).map((t) => chip(t, tiles.includes(t), { "data-act": "toggleTile", "data-arg": t })).join("")}</div>
          <p class="t-caption c-tertiary">${U().feedLoading ? "Updating what it knows… " : u.feed && u.feed.avatar ? `${esc(u.feed.avatar)} ` : ""}Based on ${went} sidequest${went === 1 ? "" : "s"}, ${checkins} check-in${checkins === 1 ? "" : "s"} and your ratings. Friends never see this.</p></div>
        <div class="stack" style="gap:10px"><div class="section-head"><span class="t-title-l">When you go out</span></div>
          <div class="chips">${whens.map(([w, ic]) => `<span class="chip">${icon(ic)}${esc(w)}</span>`).join("")}${u.days ? `<span class="chip">${esc(DAYS_LABEL[u.days] || u.days)}</span>` : ""}${!whens.length && !u.days ? '<span class="t-body-m c-secondary">Not set yet. Edit your profile to add it.</span>' : ""}</div></div>
        <div class="stack" style="gap:0"><div class="section-head"><span class="t-title-l">Settings</span></div>
          ${settingRow("bell", "Notifications", "Sidequest changes, invites, requests", { "data-go": "notifications" })}
          ${settingRow("id", "Age", u.adult === true ? "19+ confirmed" : u.adult === false ? "Under 19 · all-ages picks" : "We'll ask the first time it matters", { "data-act": "ageSetting" })}
          ${settingRow("swap", "Switch account", host ? `${SQ.d.host.name || "Your host account"} · host` : "Add a host account", { "data-go": "switch-account" })}
          ${settingRow("train", "Getting around", [originShort(u.origin) ? `From ${originShort(u.origin)}` : "", u.budget != null ? (u.budget ? `up to $${u.budget}` : "free only") : "any budget", u.maxMinutes ? `${u.maxMinutes} min max` : ""].filter(Boolean).join(" · "), { "data-go": "prefs" })}
          ${settingRow("wallet", "Ticket wallet", `${(u.tickets || []).length} ticket${(u.tickets || []).length === 1 ? "" : "s"}`, { "data-act": "openWallet" })}
          ${settingRow("sun", "Appearance", { dark: "Dark", light: "Light", system: "Match my phone" }[theme] || "Dark", { "data-act": "cycleTheme" })}
          ${settingRow("out", "Sign out", u.email || "This device", { "data-act": "signOut" })}
        </div>
        <p class="t-caption c-tertiary">Matching: ${esc(SQ.aiLabel(SQ.d.mode))}${SQ.d.mode === "api" ? ` (${esc(SQ.d.model)})` : ""}</p>
      </div>`, { title: "Profile", back: U().history.length ? true : "discover", right: iconBtn("edit", { "data-act": "editProfile", "aria-label": "Edit profile" }), tabbar: attendeeTabs("profile") });
  } };

  // Trip-time settings from sketch 1: where trips start, budget, longest trip
  S.prefs = { role: "attendee", label: "Getting around", render: () => {
    const u = me();
    const group = (label, items) => `<div class="stack" style="gap:10px"><span class="overline">${label}</span><div class="chips">${items}</div></div>`;
    return screen(`<div class="pad-x stack" style="gap:20px;padding-top:8px;padding-bottom:24px">
        ${group("Trips start from", Object.entries(ORIGIN_SHORT).map(([k, l]) => chip(l, u.origin === k, { "data-act": "setOrigin", "data-arg": k })).join(""))}
        ${group("Budget", BUDGETS.map(([v, l]) => chip(l, String(u.budget == null ? "" : u.budget) === v, { "data-act": "setBudget", "data-arg": v })).join(""))}
        ${group("Longest trip", MINUTES.map(([v, l]) => chip(l, String(u.maxMinutes || "") === v, { "data-act": "setMaxMinutes", "data-arg": v })).join(""))}
        <p class="t-caption c-tertiary">Picks and Crew Blend stay inside these.</p>
      </div>`, { title: "Getting around" });
  } };

  S["profile-edit"] = { role: "attendee", label: "Profile editing", render: () => {
    const u = me();
    const d = U().profileDraft;
    const tiles = SQ.pickedTiles(u);
    const areas = u.areas || [];
    const add = U().profileAdd;
    return screen(`
      <div class="pad-x stack" style="gap:16px;padding-top:4px;padding-bottom:24px">
        <div class="row start" style="gap:14px">${meAvatar(u, "l")}<label class="btn btn-secondary s" style="cursor:pointer">${icon("camera")}Change photo<input type="file" accept="image/*" data-upload="profilePhoto" class="sr-only"></label></div>
        ${field("Name", "profileDraft.name", d.name, "text", "Your name", { autocomplete: "name" })}
        ${handleField("profileDraft.handle", d.handle, "you")}
        <span class="overline">Your vibes · tap to remove</span>
        <div class="chips">${tiles.map((t) => chip(t, true, { "data-act": "toggleTile", "data-arg": t }, "x")).join("")}<button class="chip outline" data-act="profileAdd" data-arg="vibes" aria-pressed="${add === "vibes"}">${icon(add === "vibes" ? "x" : "plus")}${add === "vibes" ? "Done adding" : "Add vibe"}</button></div>
        ${add === "vibes" ? `<div class="chips">${TILES.map((t) => t[0]).filter((t) => !tiles.includes(t)).map((t) => chip(t, false, { "data-act": "toggleTile", "data-arg": t }, "plus")).join("")}</div>` : ""}
        <span class="overline">Areas you frequent</span>
        <div class="chips">${areas.map((a) => chip(a, true, { "data-act": "toggleArea", "data-arg": a }, "x")).join("")}<button class="chip outline" data-act="profileAdd" data-arg="areas" aria-pressed="${add === "areas"}">${icon(add === "areas" ? "x" : "plus")}${add === "areas" ? "Done adding" : "Add area"}</button></div>
        ${add === "areas" ? `<div class="chips">${SQ.HOODS.map((h) => h[0]).filter((a) => !areas.includes(a)).map((a) => chip(a, false, { "data-act": "toggleArea", "data-arg": a }, "plus")).join("")}</div>` : ""}
        <span class="overline">When you go out</span>
        <div class="chips">${WHEN_TILES.map(([w, ic]) => chip(w, (u.when || []).includes(w), { "data-act": "toggleWhen", "data-arg": w }, ic)).join("")}</div>
      </div>`, { title: "Edit profile", close: true, footer: `<div class="footer-bar">${btn("Done", { "data-act": "saveProfile" })}</div>` });
  } };

  S["switch-account"] = { role: "attendee", label: "Switch account", render: () => {
    const u = me();
    const h = SQ.hostId() && SQ.d.host;
    const v = h && ({ approved: SQ.tag("Verified", "success", "shieldCheck"), pending: SQ.tag("Verification pending", "warning", "shield") }[h.verification] || SQ.tag("Unverified", "unverified", "shield"));
    return screen(`
      <div class="pad-x stack" style="gap:12px;padding-top:4px;padding-bottom:24px">
        <p class="t-body-m c-secondary">One login, two sides. Switch any time, like Instagram.</p>
        <button class="acct on" aria-pressed="true">${meAvatar(u, "")}<span class="text"><span class="t-title-m">${esc(u.name || "You")}</span><span class="t-caption c-secondary">${esc(handleOf(u))} · personal</span></span><span class="radio on"></span></button>
        ${h ? `<button class="acct" data-act="switchToHost" aria-pressed="false">${avatar(h.name || "Host", "neutral")}<span class="text"><span class="t-title-m">${esc(h.name || "Your host account")}</span><span class="t-caption c-secondary">Host account</span>${v}</span><span class="radio"></span></button>` : ""}
        ${btn(h ? "Add an account" : "Add a host account", { "data-act": h ? "toast" : "switchToHost", "data-arg": "One personal and one host account per login for now." }, "outline", "plus")}
      </div>`, { title: "Switch account", close: true });
  } };

  SQ.screens = Object.assign(SQ.screens || {}, S);
})();
