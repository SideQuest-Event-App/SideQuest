/* Sketch 1 — attendee screens. Each screen is { role, render() } and returns HTML.
   Clickable elements use data-go="screen", data-act="action" data-arg="…", or data-back.
   Inputs use data-bind="path" to write straight into SQ.u (UI state), so typing survives re-renders. */
(function () {
  const SQ = window.SQ;
  const { esc, icon, poster, avatar, avatars, btn, chip, field, progress, meter, empty, stars, tabs, screen, thinking, aiTag, me, ev, req, whenLabel, isToday, isWeekend, priceLabel, trip, tripLabel, originShort, pick, partyGoing, isPast, statusBadge, whenRow } = SQ;

  const V = () => SQ.d.vocab;
  const U = () => SQ.u;
  const BUDGETS = [["0", "Free"], ["10", "$10"], ["20", "$20"], ["40", "$40"], ["", "Any"]];
  const MINUTES = [["15", "15 min"], ["30", "30 min"], ["45", "45 min"], ["60", "1 hr"], ["", "Any"]];
  const ORIGIN_SHORT = { union: "Downtown", finch: "North York", kennedy: "Scarborough", kipling: "Etobicoke" };

  function attendeeTabs(active) {
    const u = me();
    const pending = u ? Object.entries(u.log).filter(([id, l]) => l.status === "going" && ev(id) && isPast(ev(id))).length : 0;
    const unread = u ? u.notifications.filter((n) => !n.read && n.requestId).length : 0;
    return tabs([["discover", "Discover", "compass"], ["parties", "Parties", "users"], ["requests", "Requests", "megaphone"], ["questlog", "Quest Log", "calendar"], ["profile", "Profile", "user"]], active, { questlog: pending, requests: unread });
  }
  SQ.attendeeTabs = attendeeTabs;

  const matchBadge = (e) => {
    const p = pick(e);
    return p ? `<span class="badge match">${p.match}% match</span>` : "";
  };
  const metaLine = (e) => {
    const t = trip(e, me() && me().origin);
    return [e.neighbourhood, priceLabel(e), t ? `${t.minutes} min away` : ""].filter(Boolean).map(esc).join(" · ");
  };
  const friendsLine = (e) => {
    const party = partyGoing(e);
    const others = (e.friends || []).filter((f) => !party.includes(f));
    const names = [...party, ...others];
    if (!names.length) return e.going ? `<span class="small muted">${e.going} going</span>` : "";
    return `<span class="row start small" style="gap:8px">${avatars(names, 3)}<span class="muted">${esc(names.slice(0, 2).join(" and "))}${party.length ? " from your party" : ""} ${names.length > 1 ? "are" : "is"} going</span></span>`;
  };

  // Everything the listing says, with "N/A" for what it doesn't
  const fmtTime = (iso) => new Date(iso).toLocaleString("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });
  const listingFacts = (e) => [
    ["Starts", fmtTime(e.startsAt)],
    ["Ends", e.endsAt ? fmtTime(e.endsAt) : "N/A"],
    ...(e.runsUntil ? [["Runs until", fmtTime(e.runsUntil)]] : []),
    ["Venue", e.venue ? e.venue.name : "N/A"],
    ["Address", e.venue ? e.venue.address : "N/A"],
    ["Price", e.priceNote || priceLabel(e)],
    ["Organizer", e.organizer.name],
    ["Image", e.image ? "From the listing" : "N/A"],
    ["Source", [e.source, ...(e.alsoOn || []).map((o) => o.source)].join(", ")],
  ];

  function featureCard(e) {
    const p = pick(e);
    return `<button class="feature-card" data-act="openQuest" data-arg="${e.id}">
      <div style="position:relative">${poster(e)}
        <div class="fc-top">${matchBadge(e)}${statusBadge(e)}<span class="badge" style="background:rgba(0,0,0,.85);color:#fff">${esc(whenLabel(e))}</span></div></div>
      <div class="fc-body">
        <h2 class="title">${esc(e.title)}</h2>
        <span class="small muted">${metaLine(e)}</span>
        ${p ? `<p class="reason">${icon("sparkle", "sm")}${esc(p.reason)}</p>` : ""}
        ${friendsLine(e)}
      </div>
    </button>`;
  }
  // host: true shows the plain listing (no personal match) and opens the host's tools
  function questRow(e, extra = "", { host = false } = {}) {
    const p = host ? null : pick(e);
    return `<button class="quest-row" data-act="${host ? "openHostQuest" : "openQuest"}" data-arg="${e.id}">
      ${poster(e, "thumb")}
      <span class="stack-xs grow">
        ${whenRow(e)}
        <strong class="ellipsis">${esc(e.title)}</strong>
        <span class="small muted ellipsis">${p ? esc(p.reason) : metaLine(e)}</span>
        ${extra}
      </span>
      ${p ? `<span class="match-num">${p.match}%</span>` : ""}
    </button>`;
  }
  SQ.questRow = questRow;

  const S = {};

  /* ===================== Registration ===================== */
  S.landing = { role: "attendee", label: "Landing", render: () => {
    const evs = SQ.d.events;
    const withArt = evs.filter((e) => e.image && !e.over);
    const [a, b, c] = [0, 1, 2].map((i) => withArt[i * 7] || withArt[i] || evs[i] || evs[0]);
    return screen(`
      <div class="pad stack" style="min-height:100%;justify-content:space-between">
        <div class="brand-mark" style="margin-top:4px"><i></i>Sidequest</div>
        <div class="landing-collage">
          ${poster(a, "p1")}${poster(b, "p2")}${poster(c, "p3")}
          <span class="badge match" style="left:150px;top:6px">96% match</span>
          <span class="badge lime" style="right:30px;top:280px">${icon("ticket")}${evs.filter((e) => !e.over).length} real GTA events</span>
        </div>
        <div class="stack-sm">
          <h1 class="display-xl">Sidequest</h1>
          <p class="lead">Collect the stories, not just the tickets.</p>
          <p class="muted">Toronto's events, tuned to you and your crew.</p>
        </div>
        <div class="stack-sm">
          ${btn("Request a quest", { "data-go": "signup" })}
          ${btn("Host a quest", { "data-go": "host-type" }, "secondary")}
          <button class="link center" data-act="demoLogin" style="padding:8px">Already on a quest? Log in</button>
        </div>
      </div>`);
  } };

  S.signup = { role: "attendee", label: "Sign up", render: () => screen(`
    <div class="pad stack">
      <h2 class="display-l">Create your account</h2>
      <p class="muted">Takes a minute. Then your taste avatar gets to work.</p>
      ${btn("Continue with Apple", { "data-act": "toast", "data-arg": "Social sign-in isn't part of this sketch. Use your name below." }, "outline")}
      ${btn("Continue with Google", { "data-act": "toast", "data-arg": "Social sign-in isn't part of this sketch. Use your name below." }, "outline")}
      <p class="or">or</p>
      ${field("Name", "signup.name", U().signup.name, "text", "Alex", { autocomplete: "given-name" })}
      ${field("Email", "signup.email", U().signup.email, "email", "alex@email.com", { autocomplete: "email" })}
      ${field("Password", "signup.password", "", "password", "8+ characters")}
      ${btn("Create account", { "data-act": "signup" })}
    </div>`, { title: "Sign up" }) };

  S["ob-vibes"] = { role: "attendee", label: "Onboarding: vibes", render: () => {
    const u = me() || { vibes: [] };
    return screen(`
      <div class="pad stack">
        ${progress(1, 4)}
        <h2 class="display-l">What kind of quests are you after?</h2>
        <p class="muted">Pick at least 3. Your taste avatar learns from here.</p>
        <div class="chips">${V().VIBES.map((v) => chip(v, u.vibes.includes(v), { "data-act": "toggleVibe", "data-arg": v }, SQ.VIBE_ICON[v])).join("")}</div>
      </div>`, { title: "Your vibes", footer: `<div class="action-bar">${btn(u.vibes.length < 3 ? `Pick ${3 - u.vibes.length} more` : `Continue · ${u.vibes.length} picked`, { "data-act": "vibesNext", disabled: u.vibes.length < 3 })}</div>` });
  } };

  S["ob-past"] = { role: "attendee", label: "Onboarding: past events", render: () => {
    const u = me() || { past: [] };
    const all = [...new Set([...V().PAST_SUGGESTIONS, ...u.past])];
    return screen(`
      <div class="pad stack">
        ${progress(2, 4)}
        <h2 class="display-l">Add events you've been to</h2>
        <p class="muted">These seed your taste avatar so your first picks aren't generic.</p>
        <form class="search" data-act="addPast">
          ${icon("search")}<input data-bind="pastText" value="${esc(U().pastText)}" placeholder="Add an event or venue" aria-label="Add a past event">
          <button class="icon-btn" type="submit" aria-label="Add">${icon("plus")}</button>
        </form>
        <div>${all.map((e) => `
          <div class="list-row"><span class="grow">${esc(e)}</span>${chip(u.past.includes(e) ? "Added" : "Add", u.past.includes(e), { "data-act": "togglePast", "data-arg": e }, u.past.includes(e) ? "check" : "plus")}</div>`).join("")}
        </div>
        ${btn("Import from my ticket apps", { "data-act": "toast", "data-arg": "Ticket import (Eventbrite, DICE) is a future integration." }, "outline", "ticket")}
      </div>`, { title: "Past events", footer: `<div class="action-bar" style="flex-direction:column;gap:6px">${btn(`Continue${u.past.length ? ` · ${u.past.length} added` : ""}`, { "data-go": "ob-party" })}${u.past.length ? "" : '<button class="link center" data-go="ob-party">Skip for now</button>'}</div>` });
  } };

  S["ob-party"] = { role: "attendee", label: "Onboarding: party", render: () => {
    const u = me() || {};
    const members = SQ.partyNames();
    return screen(`
      <div class="pad stack">
        ${progress(3, 4)}
        <h2 class="display-l">Assemble your party</h2>
        <p class="muted">See what friends are going to, and let Crew Blend find nights that suit everyone. Up to 3 friends.</p>
        ${u.contactsSynced ? `
          <p class="label">${Object.keys(SQ.d.friends).length} friends already on Sidequest</p>
          <div>${Object.entries(SQ.d.friends).map(([f, p]) => `
            <div class="list-row">${avatar(f, "lg")}<span class="stack-xs grow"><strong>${esc(f)}</strong><span class="small muted ellipsis">Into ${esc(p.vibes.slice(0, 2).join(", ").toLowerCase())}</span></span>
            ${chip(members.includes(f) ? "In party" : "Add", members.includes(f), { "data-act": "toggleMember", "data-arg": f }, members.includes(f) ? "check" : "plus")}</div>`).join("")}</div>`
          : `<div class="card violet stack center" style="padding:28px 20px">
              <span class="avs">${["Aiko", "Priya", "Sam", "Leila"].map((n) => avatar(n, "lg")).join("")}</span>
              <p>Find friends from your contacts. We never message anyone for you.</p>
              ${btn("Sync contacts", { "data-act": "syncContacts" }, "violet", "users")}
            </div>`}
      </div>`, { title: "Your party", footer: `<div class="action-bar">${btn("Continue", { "data-go": "ob-location" })}</div>` });
  } };

  S["ob-location"] = { role: "attendee", label: "Onboarding: location", render: () => {
    const u = me() || {};
    return screen(`
      <div class="pad stack">
        ${progress(4, 4)}
        <h2 class="display-l">Where do you head out from?</h2>
        <p class="muted">We use this for trip times. Quests too far away don't make your feed.</p>
        <div class="stack-sm">${Object.entries(V().ORIGINS).map(([k, label]) => `
          <button class="option${u.origin === k ? " on" : ""}" data-act="setOrigin" data-arg="${k}" aria-pressed="${u.origin === k}"><span class="row start">${icon("pin")}${esc(label)}</span><span class="tick">${u.origin === k ? icon("check") : ""}</span></button>`).join("")}</div>
        <h3 class="section-title">How do you get around?</h3>
        <div class="chips">${V().TRANSIT.map((t) => chip(t, u.transit === t, { "data-act": "setTransit", "data-arg": t })).join("")}</div>
        <h3 class="section-title">Longest trip you'll take</h3>
        <div class="chips">${MINUTES.map(([v, l]) => chip(l, String(u.maxMinutes || "") === v, { "data-act": "setMaxMinutes", "data-arg": v })).join("")}</div>
        <h3 class="section-title">Usual spend on a night out</h3>
        <div class="chips">${BUDGETS.map(([v, l]) => chip(l, String(u.budget == null ? "" : u.budget) === v, { "data-act": "setBudget", "data-arg": v })).join("")}</div>
      </div>`, { title: "Location", footer: `<div class="action-bar">${btn("Continue", { "data-go": "ob-avatar" })}</div>` });
  } };

  S["ob-avatar"] = { role: "attendee", label: "Onboarding: taste avatar", render: () => {
    const u = me() || { vibes: [], past: [] };
    const feed = u.feed;
    return screen(`
      <div class="pad stack center" style="padding-top:28px">
        <div class="taste-orb"></div>
        <h2 class="display-l">Your taste avatar is ready</h2>
        <p class="muted">It learned from ${u.vibes.length} vibes, ${u.past.length} past events and ${SQ.partyNames().length} friends. It keeps learning every time you rate a quest.</p>
        <div class="card stack-sm" style="text-align:left">
          <div class="row"><span class="label">Leaning toward</span>${feed ? aiTag(feed.mode) : ""}</div>
          ${feed && feed.avatar ? `<p>${esc(feed.avatar)}</p>` : U().feedLoading ? thinking("Reading your vibes…") : ""}
          <div class="chips">${u.vibes.slice(0, 6).map((v) => `<span class="chip static">${icon(SQ.VIBE_ICON[v])}${esc(v)}</span>`).join("")}</div>
        </div>
      </div>`, { title: "All set", footer: `<div class="action-bar">${btn("Start exploring", { "data-act": "finishOnboarding" }, "primary", "sparkle")}</div>` });
  } };

  /* ===================== Discover ===================== */
  const FILTERS = [["For You", ""], ["Tonight", ""], ["This weekend", ""], ["Free", ""], ["Map", "map"]];

  // For You: the taste avatar's picks, best first. Other filters: everything within your budget and
  // trip time (the feed's eligible list), with your picks first and the rest by date.
  function feedEvents() {
    const u = me();
    const f = U().filter;
    const eligible = new Set((u.feed && u.feed.eligible) || []);
    let list = SQ.d.events.filter((e) => !e.over && !e.ended && !u.notForMe.includes(e.id) && (f === "For You" ? pick(e) : eligible.has(e.id)));
    if (f === "Tonight") list = list.filter(isToday);
    if (f === "This weekend") list = list.filter(isWeekend);
    if (f === "Free") list = list.filter((e) => e.price === 0);
    const m = (e) => (pick(e) ? pick(e).match : -1);
    return list.sort((a, b) => m(b) - m(a) || a.startsAt.localeCompare(b.startsAt)).slice(0, f === "Map" ? 80 : 60);
  }

  // Old Toronto drawn from real coordinates: Line 1 and Line 2 subways, and a pin per quest
  const MAP = { west: -79.53, east: -79.29, north: 43.712, south: 43.625 };
  const proj = (lat, lng) => [((lng - MAP.west) / (MAP.east - MAP.west)) * 100, ((MAP.north - lat) / (MAP.north - MAP.south)) * 80];
  const LINE1 = [[43.7088, -79.4407], [43.699, -79.4357], [43.684, -79.4155], [43.6749, -79.407], [43.6672, -79.4037], [43.6683, -79.3997], [43.66, -79.3905], [43.6507, -79.3868], [43.6453, -79.3806], [43.6525, -79.3793], [43.6709, -79.3857], [43.688, -79.3934], [43.7057, -79.3983], [43.73, -79.403]];
  const LINE2 = [[43.6372, -79.5361], [43.6454, -79.524], [43.6501, -79.495], [43.6557, -79.4596], [43.6602, -79.4355], [43.666, -79.4113], [43.6683, -79.3997], [43.6709, -79.3857], [43.6767, -79.3583], [43.6842, -79.3227], [43.6948, -79.2886], [43.7323, -79.2637]];
  const ORIGIN_LL = { union: [43.6453, -79.3806, "Union"], finch: [43.7806, -79.4155, "From Finch"], kennedy: [43.7323, -79.2637, "From Kennedy"], kipling: [43.6372, -79.5361, "From Kipling"] };
  const pathOf = (pts) => pts.map(([la, ln], i) => `${i ? "L" : "M"}${proj(la, ln).map((v) => v.toFixed(1)).join(" ")}`).join(" ");
  function cityMap(list) {
    const u = me();
    let outside = 0;
    const pins = list.map((e) => {
      if (!e.venue) return "";
      const [x, y] = proj(e.venue.lat, e.venue.lng);
      if (x < 1 || x > 99 || y < 1 || y > 80) {
        outside++;
        return "";
      }
      const p = pick(e);
      return `<button class="mpin${e.price === 0 ? " lime" : ""}" style="left:${x}%;top:${y}%" data-act="openQuest" data-arg="${e.id}" aria-label="${esc(e.title)}"><b>${p ? `${p.match}%` : priceLabel(e)}</b><i></i></button>`;
    }).join("");
    const o = u.origin && ORIGIN_LL[u.origin];
    const you = o && proj(o[0], o[1]).map((v, i) => Math.max(3, Math.min(i ? 78 : 92, v)));
    return `<div class="citymap">
      <svg class="base" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g stroke="var(--sq-border-subtle)" stroke-width=".35">${[12, 24, 36, 48, 60, 72, 84].map((x) => `<path d="M${x} 0V80"/>`).join("")}${[14, 28, 42, 56, 70].map((y) => `<path d="M0 ${y}H100"/>`).join("")}</g>
        <path d="M0 84 C 20 80, 40 86, 60 82 S 90 76, 100 78 L100 100 L0 100Z" fill="var(--sq-accent-secondary-soft)"/>
        <path d="${pathOf(LINE2)}" stroke="var(--sq-accent-secondary)" stroke-width="1.2" fill="none" opacity=".75"/>
        <path d="${pathOf(LINE1)}" stroke="var(--sq-accent-primary)" stroke-width="1.2" fill="none" opacity=".85"/>
      </svg>
      <span class="label" style="position:absolute;left:12px;bottom:12px">Lake Ontario</span>
      ${you ? `<span class="you" style="left:${you[0]}%;top:${you[1]}%" title="You"></span><span class="caption" style="position:absolute;left:${Math.min(you[0], 78)}%;top:calc(${you[1]}% + 12px);font-weight:700">${o[2]}</span>` : ""}
      ${pins}
    </div>
    <p class="small muted">Pink pins show your match; lime pins are free. Lines are the Line 1 and Line 2 subways.${outside ? ` ${outside} more ${outside === 1 ? "is" : "are"} outside this map.` : ""}</p>`;
  }

  S.discover = { role: "attendee", label: "Discover (For You)", render: () => {
    const u = me();
    const unread = u.notifications.filter((n) => !n.read).length;
    const feed = u.feed;
    const list = feedEvents();
    const hidden = feed && feed.eligible ? SQ.d.events.filter((e) => !e.over && !e.ended).length - feed.eligible.length : 0;
    const hour = SQ.now().getHours();
    const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const f = U().filter;

    let body;
    if (!feed && U().feedLoading) body = `<div class="skeleton" style="height:340px"></div><div class="skeleton" style="height:96px"></div><div class="skeleton" style="height:96px"></div>`;
    else if (f === "Map") body = cityMap(list);
    else if (!list.length) body = empty("compass", f === "For You" ? "Nothing fits your limits right now." : `No quests ${f === "Free" ? "are free" : `on ${f.toLowerCase()}`} in your feed yet.`, btn("Request one instead", { "data-go": "request-new" }, "secondary", "megaphone"));
    else body = `${featureCard(list[0])}
      ${list.length > 1 ? `<div class="row"><h3 class="section-title">More for you</h3><span class="small muted">${list.length - 1} quests</span></div>${list.slice(1).map((e) => questRow(e)).join("")}` : ""}`;

    return screen(`
      <div class="pad stack" style="padding-top:12px">
        <div class="row">
          <div class="stack-xs"><span class="small muted">${hello}, ${esc(u.name || "there")}</span><h1 class="display-l">For You</h1></div>
          <div class="row start" style="gap:2px">
            <button class="icon-btn" data-go="notifications" aria-label="Notifications${unread ? `, ${unread} unread` : ""}">${icon("bell")}${unread ? `<span class="dot">${unread}</span>` : ""}</button>
            <button data-go="profile" aria-label="Profile">${avatar(u.name || "You", "lg")}</button>
          </div>
        </div>
        <form class="search" data-act="search">
          ${icon("search")}<input data-bind="search.q" value="${esc(U().search.q)}" placeholder="What are you in the mood for?" aria-label="Search quests" enterkeyhint="search">
          <button class="icon-btn" type="submit" aria-label="Search">${icon("sparkle")}</button>
        </form>
        <div class="chips scroll-x">${FILTERS.map(([l, ic]) => chip(l, f === l, { "data-act": "setFilter", "data-arg": l }, ic)).join("")}</div>
        ${U().feedLoading ? thinking(feed ? "Re-tuning your feed…" : `Your taste avatar is picking your first quests${SQ.d.mode === "claude-code" ? " (Claude Code can take a minute)" : ""}…`) : ""}
        ${U().feedError ? `<div class="notice hot">${icon("x")}<span>${esc(U().feedError)}</span></div>` : ""}
        ${feed && !U().feedLoading ? `<div class="row small"><span class="muted">${aiTag(feed.mode)}</span>${hidden ? `<button class="link muted" data-go="profile">${hidden} hidden by your budget or trip time</button>` : ""}</div>` : ""}
        ${feed && feed.error ? `<div class="notice">${icon("sparkle")}<span>The AI didn't answer (${esc(feed.error.slice(0, 120))}), so these are keyword matches.</span></div>` : ""}
        ${body}
      </div>`, { tabbar: attendeeTabs("discover") });
  } };

  // Search results: Sketch 0's matching, inside the For You flow
  S.search = { role: "attendee", label: "Search results", render: () => {
    const s = U().search;
    const u = me();
    const r = s.result;
    let body = "";
    if (s.loading) body = thinking(`Finding quests for "${s.ran}"…`);
    else if (s.error) body = `<div class="notice hot">${icon("x")}<span>${esc(s.error)}</span></div>`;
    else if (r) {
      const shown = r.matches.filter((m) => ev(m.id) && !u.notForMe.includes(m.id));
      const l = r.limits;
      body = `
        <div class="row small"><span class="muted">${l.fit} of ${l.total} quests fit${u.budget != null ? ` your ${u.budget ? `$${u.budget}` : "free-only"} budget` : ""}${u.origin && u.maxMinutes ? ` and ${u.maxMinutes}-min trip` : ""}</span>${aiTag(r.mode)}</div>
        ${r.error ? `<div class="notice">${icon("sparkle")}<span>The AI didn't answer, so these are keyword matches.</span></div>` : ""}
        ${shown.length ? shown.map((m) => {
          const e = ev(m.id);
          return `<div class="card tight stack-sm">
            <button class="row start" style="gap:12px;text-align:left" data-act="openQuest" data-arg="${e.id}">${poster(e, "thumb")}
              <span class="stack-xs grow">${whenRow(e)}<strong>${esc(e.title)}</strong><span class="small muted">${metaLine(e)}</span></span>
              <span class="match-num">${m.match}%</span></button>
            <p class="reason">${icon("sparkle", "sm")}${esc(m.reason)}</p>
            <div class="row"><button class="link muted" data-act="notForMe" data-arg="${e.id}">${icon("thumbDown", "sm")}Not for me</button><button class="link" data-act="openQuest" data-arg="${e.id}">See quest ${icon("chev", "sm")}</button></div>
          </div>`;
        }).join("") : empty("search", "Nothing fit that. Hosts can see this gap.")}
        ${r.unmet.length ? `<div class="card hot stack-sm">
          <span class="label">Nothing fit</span>
          ${r.unmet.map((x) => `<div class="row"><span class="small"><strong>${esc(x.interest)}</strong> <span class="muted">${x.reason === "price" ? "· over your budget" : x.reason === "travel" ? "· too far for your trip time" : "· nothing listed yet"}</span></span>
            <button class="btn btn-secondary sm" data-act="requestGap" data-arg="${esc(x.interest)}">${icon("megaphone")}Request it</button></div>`).join("")}
          <p class="small muted">Requests go to hosts. If one puts it on, you hear first.</p>
        </div>` : ""}`;
    }
    return screen(`
      <div class="pad stack">
        <form class="search" data-act="search">
          ${icon("search")}<input data-bind="search.q" value="${esc(s.q)}" placeholder="What are you in the mood for?" aria-label="Search quests" enterkeyhint="search">
          <button class="icon-btn" type="submit" aria-label="Search">${icon("sparkle")}</button>
        </form>
        ${body}
      </div>`, { title: "Search" });
  } };

  /* ===================== Quest detail ===================== */
  S.quest = { role: "attendee", label: "Quest detail", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const u = me();
    const p = pick(e);
    const t = trip(e, u.origin);
    const party = partyGoing(e);
    const going = [...new Set([...(e.friends || []), ...(e.attendees || [])])];
    const following = u.following.includes(e.organizer.name);
    const saved = u.saved.includes(e.id);
    const logged = u.log[e.id];
    const fromReq = e.fromRequest && req(e.fromRequest);
    const footer = isPast(e) && !logged
      ? `<div class="action-bar"><span class="grow muted">This quest has ended.</span></div>`
      : `<div class="action-bar">
          <span class="stack-xs"><span class="price">${priceLabel(e)}</span><span class="caption muted">${esc(e.price == null ? "Price" : e.price === 0 ? (e.priceNote && e.priceNote !== "Free" ? e.priceNote : "No ticket needed") : e.priceNote || "per person")}</span></span>
          ${logged ? btn("In your Quest Log", { "data-go": "questlog" }, "secondary", "check") : btn("Accept quest", { "data-act": "accept", "data-arg": e.id }, "primary", "sparkle")}
        </div>`;
    return screen(`
      <div class="hero">
        ${poster(e, "", { word: false })}
        <div class="hero-nav">
          <button class="icon-btn glass" data-back aria-label="Back">${icon("back")}</button>
          <span class="row start" style="gap:8px">
            <button class="icon-btn glass" data-act="save" data-arg="${e.id}" aria-label="${saved ? "Saved" : "Save"}" aria-pressed="${saved}">${icon("bookmark", saved ? "fill" : "")}</button>
            <button class="icon-btn glass" data-act="share" data-arg="${e.id}" aria-label="Share">${icon("share")}</button>
          </span>
        </div>
        <div class="poster-overlay stack-sm">
          <span class="row start" style="gap:6px">${p ? `<span class="badge match">${p.match}% match</span>` : ""}${statusBadge(e)}<span class="badge" style="background:rgba(0,0,0,.85);color:#fff">${esc(e.scene)}</span></span>
          <h1>${esc(e.title)}</h1>
        </div>
      </div>
      <div class="pad stack">
        ${fromReq ? `<div class="notice">${icon("megaphone")}<span><strong>Made from a Quest Request.</strong> ${fromReq.votes} people asked for "${esc(fromReq.text)}".</span></div>` : ""}
        ${p ? `<div class="card hot stack-sm">
          <div class="row"><span class="label">Why this is for you</span>${aiTag(u.feed && u.feed.mode)}</div>
          <p>${esc(p.reason)}</p>
        </div>` : ""}
        <div class="stack">
          <div class="meta-row"><span class="ic-box">${icon("calendar")}</span><span><strong>${esc(whenLabel(e))}</strong><span class="small muted">${esc(e.date)}</span></span></div>
          <div class="meta-row"><span class="ic-box">${icon("pin")}</span><span><strong>${esc(e.venue ? e.venue.name : e.neighbourhood)}</strong><span class="small muted">${esc(e.venue && e.venue.address ? e.venue.address.split(",")[0] + " · " : "")}${esc(e.neighbourhood)} · nearest stop ${esc(e.travel.stop)}</span></span></div>
          ${t ? `<div class="meta-row"><span class="ic-box">${icon("train")}</span><span><strong>${tripLabel(t)}</strong><span class="small muted">From ${esc(originShort(u.origin))}${e.travel.estimated ? " · estimated by Sidequest" : ""}</span></span></div>` : ""}
        </div>
        <p>${esc(e.description)}</p>
        ${e.source ? `<div class="card stack-sm">
          <span class="label">Listing details</span>
          <dl class="facts">${listingFacts(e).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
        </div>
        <a class="link" href="${esc(e.sourceUrl)}" target="_blank" rel="noopener">${icon("external", "sm")}Full listing on ${esc(e.source)}</a>
        ${(e.alsoOn || []).map((o) => `<a class="link" href="${esc(o.url)}" target="_blank" rel="noopener">${icon("external", "sm")}Also listed on ${esc(o.source)}</a>`).join("")}` : ""}
        ${going.length || e.going ? `<div class="card stack-sm">
          <span class="label">Who's going</span>
          ${going.length ? `<div class="row start" style="gap:10px">${avatars(going, 5)}<span class="small">${party.length ? `<strong>${esc(party.join(" and "))}</strong> from your party, ` : (e.friends || []).length ? `<strong>${esc(e.friends.join(", "))}</strong>, ` : ""}${e.going} going</span></div>` : `<span class="small muted">${e.going} on Sidequest said they'd go.</span>`}
        </div>` : ""}
        ${e.reviews && e.reviews.length ? `<div class="stack-sm">
          <div class="row"><h3 class="section-title">Reviews</h3><span class="small"><strong>${e.rating}</strong> ${stars(Math.round(e.rating))}</span></div>
          ${e.reviews.map((r) => `<div class="card tight"><p class="small">"${esc(r.text)}"</p><span class="caption muted">${stars(r.rating)}</span></div>`).join("")}
        </div>` : ""}
        <div class="card stack-sm">
          <div class="row">
            <span class="row start" style="gap:10px">${avatar(e.organizer.name, "lg")}<span class="stack-xs"><span class="caption muted">Hosted by</span><strong>${esc(e.organizer.name)}</strong>${e.organizer.rating ? `<span class="caption muted">★ ${e.organizer.rating} host rating</span>` : ""}</span></span>
            ${e.organizer.name === "N/A" ? "" : chip(following ? "Following" : "Follow", following, { "data-act": "follow", "data-arg": e.organizer.name }, following ? "check" : "plus")}
          </div>
          ${e.organizer.review ? `<p class="small muted">"${esc(e.organizer.review)}"</p>` : ""}
        </div>
        <div class="btn-row">
          ${btn("Send to party", { "data-act": "sendToParty", "data-arg": e.id }, "secondary", "users")}
          ${logged && logged.status === "going" ? btn("Event day", { "data-act": "openEventDay", "data-arg": e.id }, "secondary", "door") : btn(saved ? "Saved" : "Save", { "data-act": "save", "data-arg": e.id }, "secondary", "bookmark")}
        </div>
        ${!logged ? `<button class="link muted center" data-act="notForMe" data-arg="${e.id}">${icon("thumbDown", "sm")}Not for me</button>` : ""}
      </div>`, { footer, cls: "immersive" });
  } };

  S.tickets = { role: "attendee", label: "Tickets", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const link = e.ticketLink;
    return screen(`
      <div class="pad stack center" style="padding-top:20px">
        <span class="ic-box" style="width:72px;height:72px;border-radius:24px;background:var(--sq-accent-primary);color:var(--sq-text-on-accent);display:grid;place-items:center;box-shadow:var(--sq-glow)">${icon("check", "lg")}</span>
        <h2 class="display-l">Quest accepted</h2>
        <p class="muted">${esc(e.title)} is in your Quest Log. After the night we'll ask if you went. That's what counts, not the tap.</p>
        <div class="card stack-sm" style="text-align:left">
          ${poster(e, "", { style: "height:120px;border-radius:14px" })}
          <strong>${esc(e.title)}</strong>
          <span class="small muted">${esc(whenLabel(e))} · ${esc(e.neighbourhood)}</span>
          ${link ? `<a class="btn btn-outline" href="${esc(link)}" target="_blank" rel="noopener">${icon("external")}Get tickets on ${esc(e.source || "the host's site")} · ${priceLabel(e)}</a>
            <span class="caption muted">Sidequest links out to the real listing; prices can change there.</span>` : `<div class="notice">${icon("ticket")}<span>No ticket needed. Just show up.</span></div>`}
        </div>
      </div>`, { title: "Tickets", footer: `<div class="action-bar" style="flex-direction:column;gap:8px">${btn(link ? "I have my ticket" : "Got it", { "data-act": "gotTicket" })}${btn("Tell my party", { "data-act": "sendToParty", "data-arg": e.id }, "ghost", "users")}</div>` });
  } };

  /* ===================== Parties and Crew Blend ===================== */
  function blendVibes() {
    const u = me();
    const people = [u.vibes, ...SQ.partyNames().map((m) => (SQ.d.friends[m] || {}).vibes || [])];
    const counts = {};
    people.forEach((vs) => vs.forEach((v) => (counts[v] = (counts[v] || 0) + 1)));
    return Object.entries(counts).map(([vibe, n]) => ({ vibe, pct: (n / people.length) * 100 })).sort((a, b) => b.pct - a.pct).slice(0, 4);
  }
  function tally() {
    const p = SQ.d.party;
    const me_ = me().name || "You";
    const t = {};
    for (const [voter, id] of Object.entries(p.votes)) if (voter === me_ || p.members.includes(voter)) (t[id] = t[id] || []).push(voter);
    return t;
  }

  S.parties = { role: "attendee", label: "Parties", render: () => {
    const p = SQ.d.party;
    const u = me();
    const top = blendVibes()[0];
    const t = tally();
    const voters = Object.values(t).flat().length;
    return screen(`
      <div class="pad stack">
        <button class="card violet stack-sm" data-go="party">
          <div class="row"><span class="avs">${[u.name || "You", ...p.members].map((n) => avatar(n, "lg")).join("")}</span>${icon("chev")}</div>
          <h2 class="title">${esc(p.name)}</h2>
          <span class="small muted">You, ${esc(p.members.join(", ") || "no one yet")}</span>
          <div class="row small"><span>${top ? `Crew Blend: <strong>${Math.round(top.pct)}% ${esc(top.vibe.toLowerCase())}</strong>` : "Add friends to blend"}</span>
            <span class="badge ${p.locked ? "lime" : "violet"}">${p.locked ? "Locked in" : `${voters}/${p.members.length + 1} voted`}</span></div>
        </button>
        ${btn("Create a party", { "data-act": "toast", "data-arg": "One party per person in this sketch. Edit who's in it from the party page." }, "outline", "plus")}
        <div class="notice">${icon("sparkle")}<span><strong>Crew Blend</strong> merges everyone's tastes, budgets and trip times into picks the whole party will actually enjoy.</span></div>
      </div>`, { title: "Parties", large: true, tabbar: attendeeTabs("parties") });
  } };

  S.party = { role: "attendee", label: "Party: Crew Blend + vote", render: () => {
    const p = SQ.d.party;
    const u = me();
    const myName = u.name || "You";
    const blend = blendVibes();
    const b = p.blend && p.blend.key === p.blendKey ? p.blend : p.blend; // show the last blend while a new one loads
    const t = tally();
    const totalVotes = Object.values(t).flat().length || 1;
    const editing = U().editMembers;

    let picks;
    if (!p.members.length) picks = `<p class="small muted">Add friends to get blended picks.</p>`;
    else if (U().blendLoading && !b) picks = thinking(`Blending ${p.members.length + 1} tastes…`);
    else if (b) picks = `
      ${U().blendLoading ? thinking("Re-blending for the new line-up…") : ""}
      <div class="row small"><span class="muted">${b.limits.budget != null ? `Up to ${b.limits.budget ? `$${b.limits.budget}` : "free"}${b.limits.budgetSetBy ? ` (${esc(b.limits.budgetSetBy)}'s budget)` : ""}` : "Any budget"}${u.maxMinutes ? ` · ${u.maxMinutes} min max for everyone` : ""}</span>${aiTag(b.mode)}</div>
      ${b.matches.length ? b.matches.map((m) => {
        const e = ev(m.id);
        if (!e) return "";
        const inVote = p.poll.includes(e.id);
        return `<div class="card tight stack-sm">
          <button class="row start" style="gap:12px;text-align:left" data-act="openQuest" data-arg="${e.id}">${poster(e, "mini")}
            <span class="stack-xs grow"><strong class="ellipsis">${esc(e.title)}</strong><span class="small muted">${esc(whenLabel(e))} · ${priceLabel(e)}</span>${statusBadge(e)}</span><span class="match-num">${m.match}%</span></button>
          <p class="reason">${icon("sparkle", "sm")}${esc(m.reason)}</p>
          ${m.fits ? `<div class="stack-xs">${Object.entries(m.fits).map(([who, why]) => { const tr = trip(e, who === myName ? u.origin : (SQ.d.friends[who] || {}).origin); return `<span class="row start small" style="gap:8px">${avatar(who)}<span class="${why ? "" : "muted"}">${esc(why || "Not really their thing")}${tr ? ` <span class="muted">· ${tr.minutes} min</span>` : ""}</span></span>`; }).join("")}</div>` : ""}
          ${chip(inVote ? "In the vote" : "Add to vote", inVote, { "data-act": "addToVote", "data-arg": e.id }, inVote ? "check" : "plus")}
        </div>`;
      }).join("") : empty("users", "Nothing suits everyone within these limits.")}
      ${b.unmet && b.unmet.length ? `<div class="notice hot">${icon("megaphone")}<span>Nothing fit ${b.unmet.slice(0, 3).map((x) => `${esc(x.person)}'s <strong>${esc(x.interest)}</strong>`).join(", ")}. <button class="link" data-act="requestGap" data-arg="${esc(b.unmet[0].interest)}">Request it</button></span></div>` : ""}`;
    else picks = thinking("Getting ready to blend…");

    return screen(`
      <div class="pad stack">
        <div class="row">
          <span class="row start" style="gap:10px"><span class="avs">${[myName, ...p.members].map((n) => avatar(n, "lg")).join("")}</span></span>
          <button class="btn btn-secondary sm" data-act="editMembers">${icon(editing ? "check" : "edit")}${editing ? "Done" : "Edit"}</button>
        </div>
        ${editing ? `<div class="chips">${Object.keys(SQ.d.friends).map((f) => chip(f, p.members.includes(f), { "data-act": "toggleMember", "data-arg": f }, p.members.includes(f) ? "check" : "plus")).join("")}</div>` : ""}
        <section class="card violet stack-sm">
          <div class="row"><h3 class="section-title">Crew Blend</h3><span class="caption muted">${p.members.length + 1} people</span></div>
          <p class="small muted">Everyone's tastes, merged into one.</p>
          ${blend.map((x) => `<div class="stack-xs"><div class="row small"><span>${icon(SQ.VIBE_ICON[x.vibe], "sm")} ${esc(x.vibe)}</span><strong>${Math.round(x.pct)}%</strong></div>${meter(x.pct)}</div>`).join("")}
        </section>
        <div class="row"><h3 class="section-title">Blended picks</h3>${b && !U().blendLoading ? `<button class="link" data-act="reblend">${icon("sparkle", "sm")}Re-blend</button>` : ""}</div>
        ${picks}
        <section class="card stack-sm">
          <h3 class="section-title">Where are we going?</h3>
          ${p.poll.length ? p.poll.map((id) => {
            const e = ev(id);
            if (!e) return "";
            const v = t[id] || [];
            const mine = p.votes[myName] === id;
            return `<button class="option poll-opt${mine ? " on" : ""}" data-act="vote" data-arg="${id}" aria-pressed="${mine}">
              <span class="fill" style="width:${(v.length / totalVotes) * 100}%"></span>
              <span class="stack-xs grow"><strong class="ellipsis">${esc(e.title)}</strong><span class="caption muted">${esc(whenLabel(e))}</span></span>
              <span class="row start" style="gap:6px">${avatars(v, 4)}<span class="tick">${mine ? icon("check") : ""}</span></span>
            </button>`;
          }).join("") : `<p class="small muted">Add a pick to start the vote.</p>`}
          ${p.locked ? `<div class="notice">${icon("check")}<span>Locked in: <strong>${esc((ev(p.locked) || {}).title)}</strong>. It's in everyone's Quest Log.</span></div>${btn("Open event day", { "data-act": "openEventDay", "data-arg": p.locked }, "secondary", "door")}` : p.poll.length ? btn("Lock it in", { "data-act": "lockPoll" }) : ""}
        </section>
        <section class="card stack-sm">
          <h3 class="section-title">Party chat</h3>
          <div class="bubbles">${p.chat.slice(-6).map((m) => m.from === "Sidequest" ? `<p class="bubble system">${esc(m.text)}</p>` : `<p class="bubble${m.from === myName ? " mine" : ""}"><b>${esc(m.from)}</b>${esc(m.text)}</p>`).join("")}</div>
          <form class="composer" data-act="partyChat"><input data-bind="partyMsg" value="${esc(U().partyMsg)}" placeholder="Message ${esc(p.name)}" aria-label="Message your party"><button class="icon-btn" type="submit" aria-label="Send">${icon("send")}</button></form>
        </section>
      </div>`, { title: p.name });
  } };

  /* ===================== Quest Requests ===================== */
  function requestStatus(r) {
    if (r.status === "live") return `<span class="badge lime">${icon("check")}Live now</span>`;
    if (r.status === "claimed") return `<span class="badge violet">Claimed by ${esc(r.claimedBy)}</span>`;
    if (r.votes >= 10) return `<span class="badge hot">${icon("flame")}Heating up</span>`;
    return `<span class="badge">Open</span>`;
  }
  SQ.requestStatus = requestStatus;
  const requestMeta = (r) => [ORIGIN_SHORT[r.origin], r.when, r.size, r.budget != null ? (r.budget ? `up to $${r.budget}` : "free") : ""].filter(Boolean).map(esc).join(" · ");
  SQ.requestMeta = requestMeta;

  function requestCard(r) {
    const u = me();
    const mine = u.myRequests.includes(r.id);
    const voted = mine || u.votedRequests.includes(r.id);
    return `<div class="card tight row top">
      <button class="vote${voted ? " on" : ""}" data-act="upvote" data-arg="${r.id}" aria-pressed="${voted}" aria-label="Upvote, ${r.votes} votes" ${mine ? "disabled" : ""}>${icon("up")}<span>${r.votes}</span></button>
      <span class="stack-xs grow">
        <strong>${esc(r.text)}</strong>
        <span class="small muted">${requestMeta(r)}</span>
        <span class="row start" style="gap:6px;margin-top:4px;flex-wrap:wrap">${requestStatus(r)}${mine ? '<span class="badge">Yours</span>' : ""}${r.source === "gap" ? '<span class="badge">From a search</span>' : ""}</span>
        ${r.status === "live" && r.eventId ? `<button class="link" style="margin-top:4px" data-act="openQuest" data-arg="${r.eventId}">See the quest ${icon("chev", "sm")}</button>` : ""}
      </span>
    </div>`;
  }

  S.requests = { role: "attendee", label: "Quest Requests", render: () => {
    const u = me();
    const news = u.notifications.filter((n) => !n.read && n.requestId);
    const list = SQ.d.requests;
    const mine = list.filter((r) => u.myRequests.includes(r.id));
    const rest = list.filter((r) => !u.myRequests.includes(r.id));
    return screen(`
      <div class="pad stack">
        <p class="muted">Tell hosts what you want. Upvote what you'd go to. If a host puts it on, you hear first.</p>
        ${news.map((n) => `<button class="notice hot" style="width:100%;text-align:left" data-act="openNotif" data-arg="${n.id}">${icon("flame")}<span><strong>${esc(n.title)}.</strong> ${esc(n.body)}</span></button>`).join("")}
        ${btn("Request a quest", { "data-act": "newRequest" }, "primary", "megaphone")}
        ${mine.length ? `<h3 class="section-title">Your requests</h3>${mine.map(requestCard).join("")}` : ""}
        <div class="row"><h3 class="section-title">Trending in Toronto</h3><span class="small muted">${rest.length}</span></div>
        ${rest.map(requestCard).join("")}
      </div>`, { title: "Requests", large: true, tabbar: attendeeTabs("requests") });
  } };

  S["request-new"] = { role: "attendee", label: "Request a quest", render: () => {
    const d = U().reqDraft;
    return screen(`
      <div class="pad stack">
        <label class="stack-sm"><span class="display-l">I'd go to a…</span>
          <input class="big-input" data-bind="reqDraft.text" value="${esc(d.text)}" placeholder="Filipino indie night" aria-label="What kind of quest"></label>
        ${d.source === "gap" ? `<div class="notice">${icon("search")}<span>From your search: nothing listed fit this yet.</span></div>` : ""}
        <h3 class="section-title">Near</h3>
        <div class="chips">${Object.entries(ORIGIN_SHORT).map(([k, l]) => chip(l, d.origin === k, { "data-act": "reqSet", "data-arg": "origin:" + k }, "pin")).join("")}</div>
        <h3 class="section-title">When</h3>
        <div class="chips">${V().WHEN.map((w) => chip(w, d.when === w, { "data-act": "reqSet", "data-arg": "when:" + w })).join("")}</div>
        <h3 class="section-title">Who's coming</h3>
        <div class="chips">${V().CREW_SIZES.map((z) => chip(z, d.size === z, { "data-act": "reqSet", "data-arg": "size:" + z }, "users")).join("")}</div>
        <h3 class="section-title">Budget</h3>
        <div class="chips">${BUDGETS.map(([v, l]) => chip(l, String(d.budget) === v, { "data-act": "reqSet", "data-arg": "budget:" + v })).join("")}</div>
        <p class="small muted">If someone already asked for the same thing, your request adds to theirs so hosts see one strong signal.</p>
      </div>`, { title: "Request a quest", footer: `<div class="action-bar">${btn("Post request", { "data-act": "postRequest" }, "primary", "send")}</div>` });
  } };

  S.notifications = { role: "attendee", label: "Notifications", render: () => {
    const list = me().notifications.slice().reverse();
    return screen(`
      <div class="pad stack-sm">
        ${list.length ? list.map((n) => `
          <button class="notif${n.read ? "" : " unread"}" data-act="openNotif" data-arg="${n.id}">
            <span class="ic-box">${icon(n.requestId ? "megaphone" : n.rate ? "star" : n.eventId ? "sparkle" : "bell")}</span>
            <span class="stack-xs grow"><strong class="small">${esc(n.title)}</strong><span class="small muted">${esc(n.body)}</span></span>
          </button>`).join("") : empty("bell", "No notifications yet. Requests you post or upvote show up here when a host picks them up.")}
      </div>`, { title: "Notifications" });
  } };

  /* ===================== Quest Log, rating, event day ===================== */
  S.questlog = { role: "attendee", label: "Quest Log", render: () => {
    const u = me();
    const tab = U().logTab;
    const entries = Object.entries(u.log).map(([id, l]) => ({ e: ev(id), l })).filter((x) => x.e);
    let list = "";
    if (tab === "Upcoming") {
      const up = entries.filter((x) => x.l.status === "going").sort((a, b) => a.e.startsAt.localeCompare(b.e.startsAt));
      list = up.length ? up.map(({ e }) => isPast(e)
        ? `<div class="card hot stack-sm">
            <div class="row start" style="gap:12px">${poster(e, "mini")}<span class="stack-xs grow"><strong>${esc(e.title)}</strong><span class="small muted">${esc(e.date)}</span></span></div>
            <p class="section-title">Did you go?</p>
            <p class="small muted">Only nights you actually went count. It also trains your taste avatar.</p>
            <div class="btn-row">${btn("Yes, I went", { "data-act": "didGo", "data-arg": e.id })}${btn("No", { "data-act": "didntGo", "data-arg": e.id }, "secondary")}</div>
          </div>`
        : `<div class="card tight stack-sm">
            <button class="row start" style="gap:12px;text-align:left" data-act="openQuest" data-arg="${e.id}">${poster(e, "thumb")}
              <span class="stack-xs grow">${whenRow(e)}<strong>${esc(e.title)}</strong><span class="small muted">${esc(e.neighbourhood)}${partyGoing(e).length ? ` · with ${esc(partyGoing(e).join(", "))}` : ""}</span></span></button>
            <div class="btn-row">${btn("Event day", { "data-act": "openEventDay", "data-arg": e.id }, "primary sm", "door")}${btn("Details", { "data-act": "openQuest", "data-arg": e.id }, "secondary sm")}</div>
            <button class="link muted" data-act="skipToAfter" data-arg="${e.id}">Demo: skip to after the event</button>
          </div>`).join("") : empty("calendar", "No quests accepted yet.", btn("Find a quest", { "data-go": "discover" }, "secondary", "compass"));
    }
    if (tab === "Saved") {
      const saved = u.saved.map(ev).filter(Boolean);
      list = saved.length ? saved.map((e) => questRow(e)).join("") : empty("bookmark", "Nothing saved yet. Tap the bookmark on a quest.");
    }
    if (tab === "Completed") {
      const done = entries.filter((x) => x.l.status !== "going").sort((a, b) => b.e.startsAt.localeCompare(a.e.startsAt));
      list = done.length ? done.map(({ e, l }) => `
        <div class="card tight row">
          <button class="row start grow" style="gap:12px;text-align:left" data-act="openQuest" data-arg="${e.id}">${poster(e, "mini")}<span class="stack-xs grow"><strong class="ellipsis">${esc(e.title)}</strong><span class="small muted">${esc(e.date)}</span></span></button>
          ${l.status === "missed" ? '<span class="badge">Didn\'t go</span>' : l.rating ? stars(l.rating) : `<button class="btn btn-primary sm" data-act="openRate" data-arg="${e.id}">Rate</button>`}
        </div>`).join("") : empty("star", "No completed quests yet. After a quest, tell us if you went.");
    }
    return screen(`
      <div class="pad stack">
        <div class="chips">${["Upcoming", "Saved", "Completed"].map((t) => chip(t, tab === t, { "data-act": "setLogTab", "data-arg": t })).join("")}</div>
        ${list}
      </div>`, { title: "Quest Log", large: true, tabbar: attendeeTabs("questlog") });
  } };

  S.rate = { role: "attendee", label: "Rate a quest", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const r = U().rating;
    return screen(`
      <div class="pad stack center">
        ${poster(e, "", { style: "height:150px;width:100%" })}
        <h2 class="display-l">How was ${esc(e.title)}?</h2>
        <div class="stars" role="group" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button class="star${n <= r.stars ? " on" : ""}" data-act="setStars" data-arg="${n}" aria-label="${n} star${n > 1 ? "s" : ""}" aria-pressed="${n <= r.stars}">${icon("star", n <= r.stars ? "fill" : "")}</button>`).join("")}</div>
        <h3 class="section-title">What made it?</h3>
        <div class="chips" style="justify-content:center">${V().RATE_TAGS.map((t) => chip(t, r.tags.includes(t), { "data-act": "toggleRateTag", "data-arg": t })).join("")}</div>
        <button class="upload" style="height:96px" data-act="toast" data-arg="Photo upload is out of scope for this sketch.">${icon("camera", "lg")}Add a photo to your story</button>
      </div>`, { title: "Rate your quest", footer: `<div class="action-bar">${btn("Collect this story", { "data-act": "submitRating", disabled: !r.stars }, "primary", "sparkle")}</div>` });
  } };

  S.eventday = { role: "attendee", label: "Event day mode", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const u = me();
    const t = trip(e, u.origin);
    const msgs = SQ.d.hostMessages.filter((m) => m.eventId === e.id);
    const last = msgs[msgs.length - 1];
    const mins = Math.round((new Date(e.startsAt) - SQ.now()) / 60000);
    const status = isPast(e) ? "It's over. How was it?" : mins > 0 ? (mins < 120 ? `Doors in ${mins} min` : mins < 48 * 60 ? `Starts in ${Math.round(mins / 60)} hours` : `Starts in ${Math.round(mins / 1440)} days`) : "Happening now";
    const crew = [...new Set([...partyGoing(e), ...(SQ.d.party.locked === e.id ? SQ.d.party.members : [])])];
    const PINS = [[18, 44], [72, 30], [30, 70], [60, 64]];
    return screen(`
      <div class="pad stack">
        <div class="row"><span class="badge live">Event day</span><span class="small muted">${esc(e.date)}</span></div>
        <div class="stack-xs"><h2 class="display-l">${esc(e.title)}</h2><p class="lead accent-text">${status}</p></div>
        <div class="venue" aria-label="Venue map">
          <span class="zone stage">Stage</span><span class="zone bar-z">Bar</span><span class="zone coats">Coats</span><span class="zone door">Entrance</span>
          <span class="pin you" title="You">You</span>
          ${crew.slice(0, 4).map((n, i) => `<span class="pin" style="left:${PINS[i][0]}%;top:${PINS[i][1]}%;background:${["#f2f2f2", "#d4d4d4", "#bdbdbd", "#e3e3e3"][i]}" title="${esc(n)}">${esc(n[0])}</span>`).join("")}
        </div>
        <div class="meta-row"><span class="ic-box">${icon("door")}</span><span><strong>Entrance</strong><span class="small muted">${esc(e.dayInfo.entrance)}</span></span></div>
        <div class="meta-row"><span class="ic-box">${icon("train")}</span><span><strong>Getting there</strong><span class="small muted">${t ? `TTC to ${esc(e.travel.stop)}: ${tripLabel(t)} from ${esc(originShort(u.origin))}.` : `Nearest stop: ${esc(e.travel.stop)}.`}${e.dayInfo.transit ? ` ${esc(e.dayInfo.transit)}` : ""}</span></span></div>
        <div class="meta-row"><span class="ic-box">${icon("home")}</span><span><strong>Getting home</strong><span class="small muted">${esc(e.dayInfo.home)}</span></span></div>
        <div class="meta-row"><span class="ic-box">${icon("coat")}</span><span><strong>Coat check and re-entry</strong><span class="small muted">${esc(e.dayInfo.coat)}</span></span></div>
        <div class="card ${last ? "hot" : ""} stack-xs"><span class="row"><span class="label">${icon("megaphone", "sm")} Host update</span>${last ? `<span class="caption muted">${new Date(last.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>` : ""}</span>
          <p class="small">${last ? esc(last.text) : `No updates from ${esc(e.organizer.name)} yet. They'll show up here live.`}</p></div>
        <div class="btn-row">${btn("Group chat", { "data-go": "eventday-chat" }, "secondary", "chat")}${btn("Find my party", { "data-act": "findParty", "data-arg": e.id }, "primary", "users")}</div>
      </div>`, { title: "Event day" });
  } };

  S["eventday-chat"] = { role: "attendee", label: "Event day: attendee chat", render: () => {
    const e = ev(U().quest) || SQ.d.events[0];
    const chat = SQ.d.eventChat[e.id] || [];
    const myName = me().name || "You";
    return screen(`
      <div class="pad stack">
        <p class="small muted">Everyone going to ${esc(e.title)}. ${esc(e.organizer.name)} can moderate.</p>
        <div class="bubbles">${chat.length ? chat.map((m) => `<p class="bubble${m.from === myName ? " mine" : m.host ? " host" : ""}"><b>${esc(m.from)}${m.host ? " · Host" : ""}</b>${esc(m.text)}</p>`).join("") : '<p class="bubble system">No messages yet. Say hi.</p>'}</div>
      </div>`, { title: "Attendee chat", footer: `<div class="action-bar"><form class="composer grow" data-act="eventChat"><input data-bind="eventMsg" value="${esc(U().eventMsg)}" placeholder="Say hi" aria-label="Message attendees"><button class="icon-btn" type="submit" aria-label="Send">${icon("send")}</button></form></div>` });
  } };

  /* ===================== Profile ===================== */
  S.profile = { role: "attendee", label: "Profile", render: () => {
    const u = me();
    const stories = Object.entries(u.log).filter(([, l]) => l.status === "went").map(([id, l]) => ({ e: ev(id), l })).filter((x) => x.e);
    const feed = u.feed;
    const theme = U().theme;
    return screen(`
      <div class="pad stack">
        <div class="row start" style="gap:14px">
          ${avatar(u.name || "You", "xl")}
          <span class="stack-xs"><h2 class="title">${esc(u.name || "You")}</h2><span class="small muted">${esc(originShort(u.origin) || "Toronto")}${u.transit ? ` · ${esc(u.transit)}` : ""}</span></span>
        </div>
        <div class="stats">
          <div class="stat hl"><strong>${stories.length}</strong><span>Stories</span></div>
          <div class="stat"><strong>${u.following.length}</strong><span>Following</span></div>
          <div class="stat"><strong>${u.myRequests.length}</strong><span>Requests</span></div>
        </div>
        <section class="card violet stack-sm">
          <div class="row"><h3 class="section-title">Taste avatar</h3>${feed ? aiTag(feed.mode) : ""}</div>
          ${U().feedLoading ? thinking("Updating what it knows…") : feed && feed.avatar ? `<p>${esc(feed.avatar)}</p>` : ""}
          <p class="small muted">Tap to edit what it has learned. Rating quests 4+ stars teaches it too.</p>
          <div class="chips">${V().VIBES.map((v) => chip(v, u.vibes.includes(v), { "data-act": "toggleVibe", "data-arg": v })).join("")}</div>
        </section>
        <div class="row"><h3 class="section-title">Collected stories</h3><span class="small muted">${stories.length}</span></div>
        ${stories.length ? `<div class="grid2">${stories.map(({ e, l }) => `<button class="story" data-act="openQuest" data-arg="${e.id}">${poster(e, "", { word: false })}<strong class="small ellipsis">${esc(e.title)}</strong>${l.rating ? stars(l.rating) : '<span class="caption muted">Not rated</span>'}</button>`).join("")}</div>` : `<p class="small muted">Go to a quest, then tell us you went and rate it to collect it here.</p>`}
        ${u.following.length ? `<h3 class="section-title">Following</h3><div>${u.following.map((h) => `<div class="list-row">${avatar(h)}<span class="grow">${esc(h)}</span>${chip("Following", true, { "data-act": "follow", "data-arg": h }, "check")}</div>`).join("")}</div>` : ""}
        <section class="card stack-sm">
          <h3 class="section-title">Settings</h3>
          <span class="label">Starting point</span>
          <div class="chips">${Object.entries(ORIGIN_SHORT).map(([k, l]) => chip(l, u.origin === k, { "data-act": "setOrigin", "data-arg": k })).join("")}</div>
          <span class="label">Budget</span>
          <div class="chips">${BUDGETS.map(([v, l]) => chip(l, String(u.budget == null ? "" : u.budget) === v, { "data-act": "setBudget", "data-arg": v })).join("")}</div>
          <span class="label">Longest trip</span>
          <div class="chips">${MINUTES.map(([v, l]) => chip(l, String(u.maxMinutes || "") === v, { "data-act": "setMaxMinutes", "data-arg": v })).join("")}</div>
          <span class="label">Appearance</span>
          <div class="chips">${[["dark", "Dark"], ["light", "Light"], ["system", "System"]].map(([v, l]) => chip(l, theme === v, { "data-act": "setTheme", "data-arg": v })).join("")}</div>
          <span class="small muted">Matching: ${esc(SQ.aiLabel(SQ.d.mode))}${SQ.d.mode === "api" ? ` (${esc(SQ.d.model)})` : ""}</span>
        </section>
        ${btn(SQ.hostId() && SQ.d.host ? "Switch to host profile" : "Become a host", { "data-act": "switchToHost" }, "outline", "grid")}
        <button class="link muted center" data-act="signOut">${icon("logout", "sm")}Sign out</button>
      </div>`, { title: "Profile", large: true, tabbar: attendeeTabs("profile") });
  } };

  SQ.screens = Object.assign(SQ.screens || {}, S);
})();
