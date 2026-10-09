/* Sketch 1 — host screens: registration, dashboard, quests, Demand Insights, audience, inbox, event day, recap. */
(function () {
  const SQ = window.SQ;
  const { esc, icon, poster, avatar, avatars, btn, chip, field, textarea, progress, meter, empty, stars, tabs, screen, thinking, aiTag, ev, req, whenLabel, priceLabel } = SQ;

  const V = () => SQ.d.vocab;
  const U = () => SQ.u;
  const H = () => SQ.d.host;
  const R = () => SQ.report; // host report from /api/host-report (null while loading)
  const ORIGIN_SHORT = { union: "Downtown", finch: "North York", kennedy: "Scarborough", kipling: "Etobicoke" };
  const hostName = () => (H() && H().name) || "Your venue";
  const myEvents = () => (H() ? SQ.d.events.filter((e) => e.organizer && e.organizer.name === H().name).sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : []);
  const isDone = (e) => e.over || e.ended;
  const statOf = (id) => (R() ? R().events.find((x) => x.id === id) : null);

  const hostTabs = (active) => tabs([["host-dashboard", "Dashboard", "grid"], ["host-quests", "Quests", "ticket"], ["host-demand", "Requests", "flame"], ["host-audience", "Audience", "chart"], ["host-messages", "Inbox", "inbox"]], active);
  const loading = () => `<div class="skeleton" style="height:84px"></div><div class="skeleton" style="height:160px"></div>`;
  const HOST_ICONS = { Venue: "home", "Promoter or organizer": "megaphone", "Artist or collective": "music", "Community group": "users", Brand: "sparkle" };

  const S = {};

  /* ===================== Registration ===================== */
  S["host-type"] = { role: "host", label: "Host: type", render: () => {
    const type = (H() && H().type) || "";
    return screen(`
      <div class="pad stack">
        ${progress(1, 6)}
        <h2 class="display-l">What kind of host are you?</h2>
        <div class="stack-sm">${V().HOST_TYPES.map(([t, d]) => `
          <button class="option${type === t ? " on" : ""}" data-act="hostType" data-arg="${esc(t)}" aria-pressed="${type === t}">
            <span class="row start" style="gap:12px"><span class="ic-box" style="width:38px;height:38px;border-radius:12px;background:var(--sq-bg-elevated);display:grid;place-items:center">${icon(HOST_ICONS[t])}</span>
            <span class="stack-xs"><strong>${esc(t)}</strong><span class="small muted">${esc(d)}</span></span></span>
            <span class="tick">${type === t ? icon("check") : ""}</span></button>`).join("")}</div>
        <button class="link center" data-go="host-login">Demo: sign in as a host from the sample events</button>
      </div>`, { title: "Host a quest", footer: `<div class="action-bar">${btn("Continue", { "data-act": "hostTypeNext", disabled: !type })}</div>` });
  } };

  S["host-login"] = { role: "host", label: "Host: demo sign in", render: () => screen(`
    <div class="pad stack-sm">
      <p class="muted" style="margin-bottom:8px">Every organizer in the sample events. Pick one to see their dashboard, requests and recaps.</p>
      ${SQ.d.organizers.map((o) => `<button class="list-row" data-act="hostLoginAs" data-arg="${esc(o)}">${avatar(o, "lg")}<span class="grow"><strong>${esc(o)}</strong></span>${icon("chev")}</button>`).join("")}
    </div>`, { title: "Sign in as a host" }) };

  S["host-account"] = { role: "host", label: "Host: account", render: () => {
    const r = U().hostReg;
    return screen(`
      <div class="pad stack">
        ${progress(2, 6)}
        <h2 class="display-l">Account basics</h2>
        ${field("Host or venue name", "hostReg.name", r.name, "text", "The Garrison")}
        ${field("Work email", "hostReg.email", r.email, "email", "events@venue.com")}
        ${field("Password", "hostReg.password", "", "password", "8+ characters")}
        ${SQ.me() ? '<p class="small muted">This links to your attendee account, so you can switch between the two.</p>' : ""}
      </div>`, { title: "Host account", footer: `<div class="action-bar">${btn("Continue", { "data-act": "hostAccount" })}</div>` });
  } };

  S["host-profile"] = { role: "host", label: "Host: profile", render: () => {
    const h = H() || { vibes: [] };
    const r = U().hostReg;
    return screen(`
      <div class="pad stack">
        ${progress(3, 6)}
        <h2 class="display-l">Your host profile</h2>
        <div class="row start" style="gap:14px"><button class="upload" style="width:84px;height:84px;border-radius:24px" data-act="toast" data-arg="Logo upload is out of scope for this sketch.">${icon("upload")}Logo</button>
          <span class="stack-xs"><strong>${esc(hostName())}</strong><span class="small muted">${esc(h.type || "")}</span></span></div>
        ${textarea("Bio", "hostReg.bio", r.bio, "A 200-cap room for late-night electronic music.")}
        <h3 class="section-title">Your vibes</h3>
        <div class="chips">${V().VIBES.map((v) => chip(v, h.vibes.includes(v), { "data-act": "hostVibe", "data-arg": v }, SQ.VIBE_ICON[v])).join("")}</div>
        <h3 class="section-title">Neighbourhood</h3>
        <div class="chips">${V().AREAS.map((a) => chip(a, h.area === a, { "data-act": "hostArea", "data-arg": a }, "pin")).join("")}</div>
        ${field("Instagram or website", "hostReg.social", r.social, "text", "@thegarrison")}
      </div>`, { title: "Profile", footer: `<div class="action-bar">${btn("Continue", { "data-act": "hostProfile" })}</div>` });
  } };

  S["host-verify"] = { role: "host", label: "Host: verification", render: () => {
    const h = H() || {};
    const r = U().hostReg;
    return screen(`
      <div class="pad stack">
        ${progress(4, 6)}
        <h2 class="display-l">Get verified</h2>
        <div class="notice">${icon("shield")}<span>Verified hosts keep Sidequest trustworthy for attendees. Takes 1 to 2 days.</span></div>
        ${field("Business or organization number", "hostReg.biz", r.biz, "text", "Optional for artists and community groups")}
        ${field("Links to past events", "hostReg.pastLinks", r.pastLinks, "text", "Instagram posts, ticket pages")}
        ${h.type === "Venue" ? field("Venue address", "hostReg.address", r.address, "text", "1197 Dundas St W") + field("Capacity", "hostReg.capacity", r.capacity, "number", "200") : ""}
        <button class="upload" style="height:90px" data-act="toast" data-arg="Document upload is out of scope for this sketch.">${icon("upload", "lg")}Upload proof (licence, lease, or press)</button>
      </div>`, { title: "Verification", footer: `<div class="action-bar">${btn("Continue", { "data-go": "host-ticketing" })}</div>` });
  } };

  S["host-ticketing"] = { role: "host", label: "Host: ticketing", render: () => {
    const h = H() || {};
    return screen(`
      <div class="pad stack">
        ${progress(5, 6)}
        <h2 class="display-l">How do you sell tickets?</h2>
        <p class="muted">For now, Sidequest links out to your existing ticketing.</p>
        <div class="stack-sm">${["Eventbrite", "DICE", "My own website", "Guest list only"].map((t) => `
          <button class="option${h.ticketing === t ? " on" : ""}" data-act="hostTicketing" data-arg="${esc(t)}" aria-pressed="${h.ticketing === t}"><span class="row start">${icon("ticket")}${esc(t)}</span><span class="tick">${h.ticketing === t ? icon("check") : ""}</span></button>`).join("")}</div>
        ${field("Default ticket link", "hostReg.ticketLink", U().hostReg.ticketLink, "url", "https://")}
      </div>`, { title: "Ticketing", footer: `<div class="action-bar">${btn("Continue", { "data-act": "hostTicketingNext" })}</div>` });
  } };

  S["host-team"] = { role: "host", label: "Host: team", render: () => {
    const team = U().hostReg.team;
    return screen(`
      <div class="pad stack">
        ${progress(6, 6)}
        <h2 class="display-l">Invite your team</h2>
        ${team.map((m, i) => `
          <div class="card stack-sm">
            ${field("Email", `hostReg.team.${i}.email`, m.email, "email", "teammate@venue.com")}
            <div class="chips">${["Owner", "Editor", "Door staff"].map((r) => chip(r, m.role === r, { "data-act": "teamRole", "data-arg": `${i}:${r}` })).join("")}</div>
          </div>`).join("")}
        ${btn("Add another", { "data-act": "teamAdd" }, "outline", "plus")}
      </div>`, { title: "Team", footer: `<div class="action-bar" style="flex-direction:column;gap:6px">${btn("Submit for review", { "data-act": "hostSubmit" })}<button class="link center" data-act="hostSubmit">Skip and submit</button></div>` });
  } };

  S["host-pending"] = { role: "host", label: "Host: review", render: () => {
    const approved = H() && H().verification === "approved";
    return screen(`
      <div class="pad stack">
        <span class="ic-box" style="width:64px;height:64px;border-radius:22px;background:${approved ? "var(--sq-accent-primary)" : "var(--sq-bg-elevated)"};color:${approved ? "var(--sq-text-on-accent)" : "var(--sq-text-primary)"};display:grid;place-items:center">${icon(approved ? "check" : "shield", "lg")}</span>
        <h2 class="display-l">${approved ? "You're approved" : "Thanks, we're reviewing your profile"}</h2>
        <ol class="timeline">
          <li class="done">Submitted</li>
          <li class="${approved ? "done" : "current"}">In review (usually 1 to 2 days)</li>
          <li class="${approved ? "done" : ""}">Approved</li>
        </ol>
        <p class="muted small">You can set up draft quests while you wait. They go live once you're approved.</p>
      </div>`, { title: "Review", back: false, footer: `<div class="action-bar">${approved ? btn("Go to dashboard", { "data-go": "host-dashboard" }) : btn("Demo: approve this host", { "data-act": "hostApprove" }, "violet", "shield")}</div>` });
  } };

  /* ===================== Dashboard and quests ===================== */
  S["host-dashboard"] = { role: "host", label: "Host: dashboard", render: () => {
    const h = H();
    const r = R();
    const upcoming = myEvents().filter((e) => !isDone(e));
    const matching = r ? r.matching.map(req).filter(Boolean).slice(0, 3) : [];
    return screen(`
      <div class="pad stack" style="padding-top:12px">
        <div class="row">
          <span class="row start" style="gap:12px">${avatar(hostName(), "lg")}<span class="stack-xs"><h1 class="title">${esc(hostName())}</h1>
            <span class="small muted">${esc(h.type || "Host")}${h.verification === "approved" ? ` · <span class="accent-text">${icon("shield", "sm")} Verified</span>` : " · In review"}</span></span></span>
          <button class="icon-btn" data-act="switchToAttendee" aria-label="Switch to attendee app">${icon("user")}</button>
        </div>
        ${r ? `<div class="stats">
          <div class="stat"><strong>${r.totals.interested}</strong><span>Accepts</span></div>
          <div class="stat"><strong>${r.totals.crews}</strong><span>Parties</span></div>
          <div class="stat hl"><strong>${r.totals.went}</strong><span>Went</span></div>
        </div>
        <p class="caption muted">Accepts are intent. "Went" only counts people who told us they actually went.</p>` : loading()}
        <div class="row"><h3 class="section-title">Requests matching your vibe</h3><button class="link" data-go="host-demand">All</button></div>
        ${r ? (matching.length ? matching.map((x) => `
          <button class="card tight row" data-act="openRequest" data-arg="${x.id}">
            <span class="vote" style="pointer-events:none">${icon("up")}<span>${x.votes}</span></span>
            <span class="stack-xs grow"><strong>${esc(x.text)}</strong><span class="small muted">${SQ.requestMeta(x)}</span></span>${icon("chev")}</button>`).join("") : `<p class="small muted">No open requests match your vibes yet. Add vibes to your profile to see more.</p>`) : ""}
        <div class="row"><h3 class="section-title">Upcoming quests</h3><button class="link" data-go="host-quests">All</button></div>
        ${upcoming.length ? upcoming.slice(0, 3).map((e) => SQ.questRow(e, "", { host: true })).join("") : '<p class="small muted">Nothing coming up. Create a quest.</p>'}
      </div>`, { tabbar: hostTabs("host-dashboard"), footer: `<div class="action-bar">${btn("Create a quest", { "data-act": "newDraft" }, "primary", "plus")}</div>` });
  } };

  S["host-quests"] = { role: "host", label: "Host: quests", render: () => {
    const list = myEvents();
    return screen(`
      <div class="pad stack">
        ${btn("Create a quest", { "data-act": "newDraft" }, "primary", "plus")}
        ${list.length ? list.map((e) => {
          const st = statOf(e.id);
          return `<div class="card tight stack-sm">
            <div class="row start" style="gap:12px">${poster(e, "thumb")}
              <span class="stack-xs grow">${SQ.whenRow(e)}
              <strong>${esc(e.title)}</strong><span class="small muted">${priceLabel(e)}${st ? ` · ${st.interested} accepted · ${st.went} went` : ""}</span></span></div>
            <div class="btn-row">
              ${isDone(e) ? btn("View recap", { "data-act": "openRecap", "data-arg": e.id }, "secondary sm", "chart") : btn("Event day tools", { "data-act": "openCheckin", "data-arg": e.id }, "secondary sm", "door")}
              ${btn("Duplicate", { "data-act": "duplicate", "data-arg": e.id }, "outline sm", "copy")}
            </div>
          </div>`;
        }).join("") : empty("ticket", "You haven't published a quest yet.")}
      </div>`, { title: "Quests", large: true, tabbar: hostTabs("host-quests") });
  } };

  function nextDays(n) {
    const out = [];
    const base = SQ.now();
    for (let i = 0; i < n; i++) {
      const d = new Date(base.getTime() + i * 86400000);
      out.push({ key: d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" }), dow: i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Toronto" }), num: d.toLocaleDateString("en-US", { day: "numeric", timeZone: "America/Toronto" }) });
    }
    return out;
  }

  S["host-create"] = { role: "host", label: "Host: create a quest", render: () => {
    const d = U().hostDraft;
    const r = d.fromRequest ? req(d.fromRequest) : null;
    const preview = { id: "draft", title: d.title || "Your quest", scene: "New on Sidequest", vibes: d.vibes };
    return screen(`
      <div class="pad stack">
        ${r ? `<div class="card hot stack-sm">
          <span class="label">${icon("megaphone", "sm")} Linked to a Quest Request</span>
          <strong>"${esc(r.text)}"</strong>
          <span class="small muted">${SQ.requestMeta(r)}. ${r.votes} requesters are told first when you publish.</span>
          ${U().drafting ? thinking("Drafting from the request…") : btn("Draft it with AI", { "data-act": "aiDraft" }, "violet sm", "sparkle")}
          ${d.aiMode ? aiTag(d.aiMode) : ""}
        </div>` : ""}
        <div style="position:relative">${poster(preview, "", { style: "height:170px" })}
          <button class="btn btn-secondary sm" style="position:absolute;right:12px;top:12px" data-act="toast" data-arg="Poster upload is out of scope. Sidequest generates art from your title and vibes.">${icon("upload")}Upload poster</button></div>
        ${field("Title", "hostDraft.title", d.title, "text", "Name your quest")}
        ${textarea("Description", "hostDraft.description", d.description, "What will people do, see or hear?")}
        <h3 class="section-title">Day</h3>
        <div class="day-strip">${nextDays(21).map((x) => `<button class="day${d.date === x.key ? " on" : ""}" data-act="draftSet" data-arg="date:${x.key}" aria-pressed="${d.date === x.key}">${esc(x.dow)}<strong>${esc(x.num)}</strong></button>`).join("")}</div>
        <div class="btn-row">${field("Start time", "hostDraft.time", d.time, "time")}${field("Price (CAD, 0 = free)", "hostDraft.price", d.price, "number", "15", { min: 0, inputmode: "numeric" })}</div>
        <h3 class="section-title">Vibe tags</h3>
        <p class="small muted">These decide whose For You feed it lands in.</p>
        <div class="chips">${V().VIBES.map((v) => chip(v, d.vibes.includes(v), { "data-act": "draftVibe", "data-arg": v }, SQ.VIBE_ICON[v])).join("")}</div>
      </div>`, { title: "Create a quest", footer: `<div class="action-bar">${btn("Next: event day info", { "data-act": "draftNext" })}</div>` });
  } };

  S["host-create-dayinfo"] = { role: "host", label: "Host: event day info", render: () => {
    const d = U().hostDraft;
    return screen(`
      <div class="pad stack">
        <p class="muted">This powers the attendee's Event Day Mode: one place for the door, the trip and the ride home.</p>
        <button class="upload" style="height:100px" data-act="toast" data-arg="Venue map upload is out of scope. Attendees see a standard layout.">${icon("map", "lg")}Upload venue map</button>
        ${field("Entrance", "hostDraft.dayInfo.entrance", d.dayInfo.entrance, "text", "North door, ticket line on the left")}
        ${field("Transit tip", "hostDraft.dayInfo.transit", d.dayInfo.transit, "text", "505 streetcar stops right outside")}
        ${field("Getting home", "hostDraft.dayInfo.home", d.dayInfo.home, "text", "Last subway 1:30 AM, Blue Night buses after")}
        ${field("Coat check and re-entry", "hostDraft.dayInfo.coat", d.dayInfo.coat, "text", "Coat check $3, cash only")}
        ${field("Ticket link", "hostDraft.ticketLink", d.ticketLink, "url", "https://")}
      </div>`, { title: "Event day info", footer: `<div class="action-bar" style="flex-direction:column;gap:8px">${btn("Publish now", { "data-act": "publish" }, "primary", "send")}${btn("Schedule for later", { "data-act": "toast", "data-arg": "Scheduling works like publishing, with a date picker. Not built in this sketch." }, "ghost")}</div>` });
  } };

  S["host-published"] = { role: "host", label: "Host: published", render: () => {
    const e = ev(U().hostQuest) || myEvents()[0] || SQ.d.events[0];
    const res = U().published || {};
    const fits = Object.entries(SQ.d.friends).filter(([, p]) => p.vibes.some((v) => (e.vibes || []).includes(v))).length;
    return screen(`
      <div class="pad stack center" style="padding-top:20px">
        <span class="ic-box" style="width:72px;height:72px;border-radius:24px;background:var(--sq-accent-primary);color:var(--sq-text-on-accent);display:grid;place-items:center;box-shadow:var(--sq-glow)">${icon("send", "lg")}</span>
        <h2 class="display-l">Published</h2>
        <p class="muted">${esc(e.title)} is live. It now shows in the For You feed of people whose taste fits.</p>
        ${poster(e, "", { style: "height:150px;width:100%" })}
        <div class="card stack-sm" style="text-align:left">
          ${res.requesters ? `<div class="row"><span class="small">Requesters notified first</span><strong class="hot-text">${res.requesters}</strong></div>` : ""}
          <div class="row"><span class="small">Followers notified</span><strong>${res.followers || 0}</strong></div>
          <div class="row"><span class="small">Sample friends whose vibes fit</span><strong>${fits}</strong></div>
        </div>
      </div>`, { title: "Quest published", back: false, footer: `<div class="action-bar" style="flex-direction:column;gap:8px">${btn("See it as an attendee", { "data-act": "viewAsAttendee", "data-arg": e.id })}${btn("Back to dashboard", { "data-go": "host-dashboard" }, "ghost")}</div>` });
  } };

  /* ===================== Demand Insights ===================== */
  S["host-demand"] = { role: "host", label: "Host: Demand Insights", render: () => {
    const r = R();
    const area = U().demandArea;
    const list = SQ.d.requests.filter((x) => area === "All" || x.origin === area);
    let heat = "";
    if (r) {
      const max = Math.max(1, ...r.heat.flatMap((h) => h.days));
      const peak = r.heat.map((h) => ({ o: h.origin, v: h.days[4] + h.days[5] })).sort((a, b) => b.v - a.v)[0];
      heat = `<section class="card stack-sm">
        <h3 class="section-title">When people want to go out</h3>
        <div class="heat" role="img" aria-label="Request votes by starting point and day">
          <span></span>${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span class="hd">${d}</span>`).join("")}
          ${r.heat.filter((h) => area === "All" || h.origin === area).map((h) => `<span class="hl">${esc(ORIGIN_SHORT[h.origin])}</span>${h.days.map((v) => `<span class="cell" style="opacity:${(0.08 + (v / max) * 0.92).toFixed(2)}" title="${Math.round(v)} votes"></span>`).join("")}`).join("")}
        </div>
        <p class="small muted">Built from request votes. ${peak && peak.v ? `Weekend demand is strongest from ${esc(ORIGIN_SHORT[peak.o])}.` : ""}</p>
      </section>`;
    }
    return screen(`
      <div class="pad stack">
        <div class="chips scroll-x">${[["All", "All of Toronto"], ...Object.entries(ORIGIN_SHORT)].map(([k, l]) => chip(l, area === k, { "data-act": "setDemandArea", "data-arg": k })).join("")}</div>
        ${r ? heat : loading()}
        <div class="row"><h3 class="section-title">Quest Requests</h3><span class="small muted">${list.filter((x) => x.status === "open").length} open</span></div>
        ${list.length ? list.map((x) => `
          <button class="card tight row" data-act="openRequest" data-arg="${x.id}">
            <span class="vote" style="pointer-events:none">${icon("up")}<span>${x.votes}</span></span>
            <span class="stack-xs grow"><strong>${esc(x.text)}</strong><span class="small muted">${SQ.requestMeta(x)}</span><span style="margin-top:4px">${SQ.requestStatus(x)}</span></span>${icon("chev")}
          </button>`).join("") : empty("megaphone", "No requests from here yet.")}
        ${r && r.unmet.length ? `<section class="card hot stack-sm">
          <h3 class="section-title">Searched for, couldn't find</h3>
          <p class="small muted">From ${r.searches} searches on Sidequest. Similar wording is merged.</p>
          ${r.unmet.map((u) => `<div class="stack-xs" style="padding:6px 0"><div class="row"><strong class="small">${esc(u.interest)}</strong><span class="small"><strong>${u.asks}</strong> ${u.asks === 1 ? "ask" : "asks"}</span></div>
            <span class="caption muted">${[u.reasons.none && `${u.reasons.none} nothing listed`, u.reasons.price && `${u.reasons.price} over budget`, u.reasons.travel && `${u.reasons.travel} too far`].filter(Boolean).join(" · ")}${u.alsoAs.length ? ` · also "${esc(u.alsoAs.slice(0, 2).join('", "'))}"` : ""}</span></div>`).join("")}
        </section>` : ""}
      </div>`, { title: "Demand Insights", large: true, tabbar: hostTabs("host-demand") });
  } };

  S["host-request"] = { role: "host", label: "Host: request detail", render: () => {
    const r = req(U().hostRequest) || SQ.d.requests[0];
    const mine = r.claimedBy === hostName();
    let actions = "";
    if (r.status === "open") actions = btn("Claim this request", { "data-act": "claim", "data-arg": r.id }, "primary", "flame");
    else if (r.status === "claimed" && mine) actions = `${btn("Create a quest from this request", { "data-act": "draftFromRequest", "data-arg": r.id }, "primary", "sparkle")}<button class="link muted center" data-act="unclaim" data-arg="${r.id}">Release this claim</button>`;
    else if (r.status === "claimed") actions = `<p class="small muted center">Already claimed by ${esc(r.claimedBy)}. You can still host something similar.</p>`;
    else actions = r.eventId ? btn("See the quest", { "data-act": "openHostQuest", "data-arg": r.eventId }, "secondary") : "";
    return screen(`
      <div class="pad stack">
        <span class="row start" style="gap:6px">${SQ.requestStatus(r)}${r.source === "gap" ? '<span class="badge">From a search nothing fit</span>' : ""}</span>
        <h2 class="display-l">${esc(r.text)}</h2>
        <p class="muted">${SQ.requestMeta(r)}</p>
        <div class="stats">
          <div class="stat hl"><strong>${r.votes}</strong><span>Requesters</span></div>
          <div class="stat"><strong>${r.parties || 0}</strong><span>Parties</span></div>
          <div class="stat"><strong>${r.budget == null ? "Any" : r.budget ? `$${r.budget}` : "Free"}</strong><span>Budget</span></div>
        </div>
        <div class="notice">${icon("megaphone")}<span>Claiming tells all ${r.votes} requesters you're on it. When you publish, they hear first.</span></div>
      </div>`, { title: "Request", footer: `<div class="action-bar" style="flex-direction:column;gap:6px">${actions}</div>` });
  } };

  /* ===================== Audience and inbox ===================== */
  S["host-audience"] = { role: "host", label: "Host: audience", render: () => {
    const r = R();
    if (!r) return screen(`<div class="pad stack">${loading()}</div>`, { title: "Audience", large: true, tabbar: hostTabs("host-audience") });
    const a = r.audience;
    return screen(`
      <div class="pad stack">
        <div class="stats two">
          <div class="stat"><strong>${a.baseFollowers + a.followers}</strong><span>Followers</span></div>
          <div class="stat hl"><strong>${a.repeat}</strong><span>Came back</span></div>
        </div>
        <section class="card violet stack-sm">
          <h3 class="section-title">Taste segments</h3>
          ${a.segments.length ? a.segments.map((s) => `<div class="stack-xs"><div class="row small"><span>${icon(SQ.VIBE_ICON[s.vibe], "sm")} ${esc(s.vibe)}</span><strong>${s.pct}%</strong></div>${meter(s.pct)}</div>`).join("") : '<p class="small muted">No one has shown interest yet.</p>'}
          <p class="caption muted">From ${a.people} people who accepted, followed, or are friends going. Aggregated and anonymized.</p>
        </section>
        <section class="card stack-sm">
          <h3 class="section-title">How people come</h3>
          ${a.partyShare == null ? '<p class="small muted">No accepts yet.</p>' : `
          <div class="stack-xs"><div class="row small"><span>With a party</span><strong>${a.partyShare}%</strong></div>${meter(a.partyShare)}</div>
          <div class="stack-xs"><div class="row small"><span>Solo</span><strong>${100 - a.partyShare}%</strong></div>${meter(100 - a.partyShare, "lime")}</div>`}
        </section>
      </div>`, { title: "Audience", large: true, tabbar: hostTabs("host-audience") });
  } };

  S["host-messages"] = { role: "host", label: "Host: inbox", render: () => {
    const m = U().msg;
    const upcoming = myEvents().filter((e) => !isDone(e) || e.id === m.eventId);
    const sent = SQ.d.hostMessages.filter((x) => x.host === hostName()).slice().reverse();
    return screen(`
      <div class="pad stack">
        <span class="label">Quest</span>
        ${upcoming.length ? `<div class="chips scroll-x">${upcoming.map((e) => chip(e.title, m.eventId === e.id, { "data-act": "msgEvent", "data-arg": e.id })).join("")}</div>` : '<p class="small muted">Publish a quest to message its attendees.</p>'}
        <span class="label">Send to</span>
        <div class="chips">${[["attendees", "People going"], ["followers", "Followers"]].map(([k, l]) => chip(l, m.audience === k, { "data-act": "msgAudience", "data-arg": k })).join("")}</div>
        ${textarea("Update", "msg.text", m.text, "Doors delayed 30 min. Coat check is cash only.")}
        ${btn("Send update", { "data-act": "hostMessage", disabled: !upcoming.length }, "primary", "send")}
        <h3 class="section-title">Sent</h3>
        ${sent.length ? sent.map((x) => `<div class="card tight stack-xs"><span class="caption muted">${esc((ev(x.eventId) || {}).title)} · ${x.audience === "followers" ? "Followers" : "People going"}</span><span class="small">${esc(x.text)}</span></div>`).join("") : '<p class="small muted">Nothing sent yet.</p>'}
        ${btn("Moderate attendee chat", { "data-act": "toast", "data-arg": "Hosts can pin, hide, or mute messages in the attendee chat. Not built in this sketch." }, "outline", "chat")}
      </div>`, { title: "Inbox", large: true, tabbar: hostTabs("host-messages") });
  } };

  /* ===================== Event day and recap ===================== */
  S["host-checkin"] = { role: "host", label: "Host: event day tools", render: () => {
    const e = ev(U().hostQuest) || myEvents()[0];
    if (!e) return screen(empty("ticket", "No quest selected."), { title: "Event day tools" });
    const me = SQ.me();
    const guests = [...new Set([...(me && me.log[e.id] ? [me.name || "You"] : []), ...(e.friends || []), ...(e.attendees || [])])];
    const inList = SQ.d.checkins[e.id] || [];
    const expected = Math.max(guests.length, e.going || 0);
    return screen(`
      <div class="pad stack">
        <div class="row"><span class="badge live">Event day</span><span class="small muted">${esc(whenLabel(e))}</span></div>
        <h2 class="display-l">${esc(e.title)}</h2>
        <div class="card stack-xs"><div class="row small"><span>Checked in</span><strong>${inList.length} / ${expected}</strong></div>${meter((inList.length / expected) * 100, "lime")}</div>
        ${btn("Scan tickets", { "data-act": "toast", "data-arg": "Opens the camera to scan tickets. Out of scope for this sketch." }, "outline", "scan")}
        <h3 class="section-title">Guest list</h3>
        ${guests.length ? "" : '<p class="small muted">No one has accepted this quest on Sidequest yet. Ticket holders from the listing site would appear here.</p>'}
        <div>${guests.map((g) => `<div class="list-row">${avatar(g)}<span class="grow">${esc(g)}${me && g === (me.name || "You") ? ' <span class="badge violet">Sidequest</span>' : ""}</span>${chip(inList.includes(g) ? "Checked in" : "Check in", inList.includes(g), { "data-act": "checkin", "data-arg": g }, inList.includes(g) ? "check" : "")}</div>`).join("")}</div>
        ${btn("Push a live update", { "data-act": "msgEvent", "data-arg": e.id, "data-then": "host-messages" }, "violet", "megaphone")}
        <button class="link muted center" data-act="endEvent" data-arg="${e.id}">Demo: end the event</button>
      </div>`, { title: "Event day tools" });
  } };

  S["host-recap"] = { role: "host", label: "Host: recap", render: () => {
    const e = ev(U().hostQuest) || myEvents()[0];
    const st = e && statOf(e.id);
    if (!e || !st) return screen(`<div class="pad stack">${loading()}</div>`, { title: "Recap" });
    const fulfilled = SQ.d.requests.filter((r) => r.status === "live" && r.eventId === e.id).length;
    const answered = st.went + st.didntGo;
    return screen(`
      <div class="pad stack">
        ${poster(e, "", { style: "height:140px" })}
        <h2 class="display-l">${esc(e.title)}</h2>
        <div class="stats">
          <div class="stat hl"><strong>${st.went}</strong><span>Went</span></div>
          <div class="stat"><strong>${st.avgRating || "–"}</strong><span>Avg rating</span></div>
          <div class="stat"><strong>${fulfilled}</strong><span>Requests met</span></div>
        </div>
        <section class="card stack-sm">
          <h3 class="section-title">From interest to attendance</h3>
          <div class="stack-xs"><div class="row small"><span>Accepted ("I'd go")</span><strong>${st.interested}</strong></div>${meter(100)}</div>
          <div class="stack-xs"><div class="row small"><span>Confirmed they went</span><strong>${st.went}</strong></div>${meter(st.interested ? (st.went / st.interested) * 100 : 0, "lime")}</div>
          <p class="caption muted">${answered ? `${st.didntGo} said they didn't make it.` : "No one has answered \"Did you go?\" yet."} ${st.checkedIn ? `${st.checkedIn} checked in at the door.` : ""} ${st.notForMe ? `${st.notForMe} said "not for me" in their feed.` : ""}</p>
        </section>
        <section class="card violet stack-sm">
          <h3 class="section-title">What made it</h3>
          ${st.topTags.length ? `<div class="chips">${st.topTags.map((t) => `<span class="chip static">${esc(t)}</span>`).join("")}</div><p class="small muted">Top reasons from ${st.rated} rating${st.rated === 1 ? "" : "s"}.</p>` : '<p class="small muted">No ratings yet.</p>'}
        </section>
      </div>`, { title: "Recap", footer: `<div class="action-bar" style="flex-direction:column;gap:8px">${btn("Invite attendees to follow you", { "data-act": "toast", "data-arg": "Invites go to attendees who rated 4 stars or more. Not built in this sketch." })}${btn("Plan the next one", { "data-act": "duplicate", "data-arg": e.id }, "ghost", "copy")}</div>` });
  } };

  SQ.screens = Object.assign(SQ.screens || {}, S);
})();
