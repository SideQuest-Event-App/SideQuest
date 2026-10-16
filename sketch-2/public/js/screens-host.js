/* Sketch 2 — host screens: onboarding, demand, request detail, draft test, create, your sidequests, event day tools, insights, audience, inbox, host profile. */
(function () {
  const SQ = window.SQ;
  const { esc, icon, iconBtn, tag, poster, avatar, btn, chip, field, empty, tabs, screen, thinking, ev, req, priceLabel } = SQ;

  const V = () => SQ.d.vocab;
  const U = () => SQ.u;
  const H = () => SQ.d.host;
  const R = () => SQ.report; // host report from /api/host-report (null while loading)
  const hostName = () => (H() && H().name) || "Your venue";
  const myEvents = () => (H() ? SQ.d.events.filter((e) => e.organizer && e.organizer.name === H().name).sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : []);
  const isDone = (e) => e.over || e.ended;
  const statOf = (id) => (R() ? R().events.find((x) => x.id === id) : null);

  const hostTabs = (active) => tabs([["host-demand", "Demand", "bulb"], ["host-quests", "Sidequests", "ticket"], ["host-insights", "Insights", "chart"], ["host-messages", "Inbox", "megaphone"]], active);
  const loading = () => `<div class="skeleton" style="height:84px"></div><div class="skeleton" style="height:160px"></div>`;

  const S = {};

  /* ===================== Registration (Figma: 25 to 33, Host onboarding) ===================== */
  const HSTEPS = 8;
  const head = (n, title, sub) => SQ.obHead(n, title, sub, true, HSTEPS);
  const foot = (main, extra = "") => SQ.obFooter(main, extra);
  const HOST_ICONS = { "Promoter or collective": "music", Venue: "door", "Independent artist": "user", "Community group": "crew", Business: "cash" };
  // Figma: Option card. An icon tile, a title and a line, and a radio
  const optCard = (on, ic, title, sub, a) => `<button class="acct opt${on ? " on" : ""}" ${SQ.attr(a)} aria-pressed="${on}">
      <span class="opt-ic">${icon(ic)}</span><span class="text"><span class="t-title-m">${esc(title)}</span>${sub ? `<span class="t-caption c-secondary">${esc(sub)}</span>` : ""}</span><span class="radio${on ? " on" : ""}"></span></button>`;
  const hostLogo = (h, cls = "l") => (h && h.logo ? `<span class="av ${cls} photo-av" style="background-image:url('${h.logo}')" role="img" aria-label="Logo"></span>` : avatar(hostName(), cls));
  SQ.hostLogo = hostLogo;

  S["host-type"] = { role: "host", label: "Host: type", render: () => {
    const type = (H() && H().type) || "";
    return screen(`
      ${head(1, "What do you host?", "This shapes your demand map and how attendees see you.")}
      <div class="ob-body" style="gap:10px">
        ${V().HOST_TYPES.map(([t, d]) => optCard(type === t, HOST_ICONS[t], t, d, { "data-act": "hostType", "data-arg": t })).join("")}
        <button class="note" data-go="host-login">Demo: sign in as a host from the sample events</button>
      </div>`, { footer: foot(btn("Continue", { "data-act": "hostTypeNext", disabled: !type })) });
  } };

  S["host-login"] = { role: "host", label: "Host: demo sign in", render: () => screen(`
    <div class="pad stack-sm">
      <p class="t-body-m c-secondary" style="margin-bottom:8px">Every organizer in the sample events. Pick one to see their dashboard, requests and recaps.</p>
      ${SQ.d.organizers.map((o) => `<button class="list-row divided" data-act="hostLoginAs" data-arg="${esc(o)}">${avatar(o)}<span class="text"><span>${esc(o)}</span></span>${icon("chevR")}</button>`).join("")}
    </div>`, { title: "Sign in as a host" }) };

  S["host-account"] = { role: "host", label: "Host: account", render: () => {
    const r = U().hostReg;
    return screen(`
      ${head(2, "Your host account", "Separate from your personal account. Switch between them any time.")}
      <form class="ob-body" style="gap:14px" data-act="hostAccount">
        ${field("Host name", "hostReg.name", r.name, "text", "Loop Collective", { autocomplete: "organization" })}
        ${field("Work email", "hostReg.email", r.email, "email", "you@yourcollective.ca", { icon: "mail", autocomplete: "email", inputmode: "email" })}
        ${field("Website", "hostReg.website", r.website, "url", "yourcollective.ca", { icon: "globe", inputmode: "url" })}
        ${field("Your role", "hostReg.role", r.role, "text", "Founder", { autocomplete: "organization-title" })}
      </form>`, { footer: foot(btn("Continue", { "data-act": "hostAccount" })) });
  } };

  const DOCS = [["Business registration", "id", "Master Business Licence, Articles of Incorporation or CRA business number letter"],
    ["Government photo ID", "link", "Driver’s licence, passport or Ontario Photo Card of the account owner"],
    ["Proof of venue or address", "door", "Lease, utility bill or venue booking dated in the last 90 days"]];
  S["host-verify"] = { role: "host", label: "Host: verification", render: () => {
    const r = U().hostReg;
    return screen(`
      ${head(3, "Get verified", "Upload one document for each item you select. Verified hosts rank higher and can reply to Quest Requests.")}
      <div class="ob-body" style="gap:10px">
        ${DOCS.map(([k, ic, d]) => optCard(r.docKind === k, ic, k, d, { "data-act": "hostDoc", "data-arg": k })).join("")}
        <label class="doc-drop">${icon(r.docFile ? "check" : "upload")}<span>${r.docFile ? esc(r.docFile) : "Upload PDF, JPG or PNG · up to 10 MB each"}</span>
          <input type="file" accept="application/pdf,image/jpeg,image/png" data-upload="hostDocFile" class="sr-only"></label>
        <p class="unverified-note">${SQ.tag("Unverified", "unverified", "shield")}<span>shows on your sidequests until approved</span></p>
      </div>`, { footer: foot(btn("Continue", { "data-act": "hostVerifyNext" })) });
  } };

  S["host-profile"] = { role: "host", label: "Host: profile", render: () => {
    const h = H() || { vibes: [], areas: [] };
    const areas = h.areas || [];
    const shown = [...new Set([...areas, ...SQ.HOODS.map((x) => x[0])])].slice(0, Math.max(3, areas.length + 1));
    const age = h.agePolicy || "It depends";
    return screen(`
      ${head(4, "Set up your profile")}
      <div class="ob-body" style="gap:24px;padding-top:16px">
        <div class="row start" style="gap:14px">${hostLogo(h)}<label class="btn btn-secondary s" style="cursor:pointer">${icon("camera")}${h.logo ? "Change logo" : "Add logo"}<input type="file" accept="image/*" data-upload="hostLogo" class="sr-only"></label></div>
        <div class="stack-sm" style="gap:10px"><span class="t-overline">Your vibes</span>
          <div class="chips">${SQ.TILES.map((t) => chip(t[0], t[2].some((v) => h.vibes.includes(v)), { "data-act": "hostTile", "data-arg": t[0] })).join("")}</div></div>
        <div class="stack-sm" style="gap:10px"><span class="t-overline">Areas you host in</span>
          <div class="chips">${shown.map((n) => chip(n, areas.includes(n), { "data-act": "hostArea", "data-arg": n })).join("")}<button class="chip outline" data-act="hostAddArea">${icon("plus")}Add</button></div></div>
        <div class="stack-sm" style="gap:10px"><span class="t-overline">Usual age policy</span>
          <div class="seg base">${["All ages", "19+", "It depends"].map((a) => `<button class="${age === a ? "on" : ""}" data-act="hostAge" data-arg="${a}" aria-pressed="${age === a}">${a}</button>`).join("")}</div></div>
        ${field("Instagram · optional", "hostReg.social", U().hostReg.social, "text", "@yourcollective", { icon: "link" })}
      </div>`, { footer: foot(btn("Continue", { "data-act": "hostProfile" })) });
  } };

  const SELLERS = [["DICE", "ticket"], ["Ticketmaster", "ticket"], ["Eventbrite", "ticket"], ["Our own site", "globe"], ["Free RSVP in Sidequest", "check"]];
  S["host-ticketing"] = { role: "host", label: "Host: ticketing", render: () => {
    const h = H() || {};
    return screen(`
      ${head(5, "Where do you sell tickets?", "Attendees buy on your platform. Sidequest links out and brings them back.")}
      <div class="ob-body" style="gap:10px">
        ${SELLERS.map(([t, ic]) => optCard(h.ticketing === t, ic, t, "", { "data-act": "hostTicketing", "data-arg": t })).join("")}
        ${h.ticketing === "Free RSVP in Sidequest" ? "" : `<div style="padding-top:4px">${field("Default ticket link", "hostReg.ticketLink", U().hostReg.ticketLink, "url", "dice.fm/yourcollective", { icon: "link", inputmode: "url" })}</div>`}
      </div>`, { footer: foot(btn("Continue", { "data-act": "hostTicketingNext", disabled: !h.ticketing })) });
  } };

  const ROLES = [["Admin", ""], ["Door staff", "qr"], ["Chat moderator", "bubble"]];
  const nameOfEmail = (e) => e.split("@")[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  S["host-team"] = { role: "host", label: "Host: team", render: () => {
    const r = U().hostReg;
    const owner = (SQ.me() && SQ.me().name) || hostName();
    return screen(`
      ${head(6, "Add your team", "Give door staff and chat moderators their own access.")}
      <div class="ob-body" style="gap:14px">
        <form class="invite" data-act="teamAdd">${field("Invite by email", "hostReg.invite", r.invite, "email", "teammate@yourcollective.ca", { inputmode: "email" })}${iconBtn("plus", { "data-act": "teamAdd", "aria-label": "Invite" }, "primary")}</form>
        <div class="chips">${ROLES.map(([k, ic]) => chip(k, r.inviteRole === k, { "data-act": "teamRole", "data-arg": k }, ic)).join("")}</div>
        <div style="padding-top:10px">
          <div class="person">${SQ.me() && SQ.me().photo ? `<span class="av photo-av" style="background-image:url('${SQ.me().photo}')"></span>` : avatar(owner)}<span class="text"><span>${esc(owner)}</span><span class="t-caption c-secondary">Owner · you</span></span></div>
          ${r.team.map((m, i) => `<div class="person">${avatar(nameOfEmail(m.email))}<span class="text"><span>${esc(nameOfEmail(m.email))}</span><span class="t-caption c-secondary">${esc(m.role)}</span></span>
            <button class="tag-btn" data-act="teamRemove" data-arg="${i}" aria-label="Remove ${esc(m.email)}">${SQ.tag(m.status || "Invited", m.status === "Joined" ? "success" : "")}</button></div>`).join("")}
        </div>
      </div>`, { footer: foot(btn("Continue", { "data-act": "hostTeamNext" }), btn("Skip for now", { "data-go": "host-claim" }, "ghost m")) });
  } };

  // Listings already on Sidequest that look like this host's: their name as organizer, or their venue
  const lookAlike = (h) => {
    const words = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const mine = new Set(words(h.name));
    return SQ.d.events.filter((e) => !e.publishedBy && [e.organizer && e.organizer.name, e.venue && e.venue.name].some((n) => words(n).some((w) => mine.has(w)))).slice(0, 6);
  };
  const shortWhen = (e) => {
    const d = new Date(e.startsAt);
    return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/Toronto" })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" }).replace(":00", "")}`;
  };
  S["host-claim"] = { role: "host", label: "Host: claim listings", render: () => {
    const list = lookAlike(H() || {});
    const r = U().hostReg;
    if (!r.claim) r.claim = list.map((e) => e.id);
    const n = list.filter((e) => r.claim.includes(e.id)).length;
    return screen(`
      ${head(7, "Claim your listings", "We found sidequests that look like yours. Claimed listings move to your account with their ratings.")}
      <div class="ob-body" style="gap:4px;padding-top:16px">
        ${list.length ? list.map((e) => `<button class="pick-row" data-act="claimToggle" data-arg="${e.id}" aria-pressed="${r.claim.includes(e.id)}">${poster(e, "thumb")}<span class="text"><span>${esc(e.title)}</span><span>${esc(shortWhen(e))} · ${esc((e.venue && e.venue.name) || e.neighbourhood || "")}</span></span><span class="checkbox${r.claim.includes(e.id) ? " on" : ""}">${r.claim.includes(e.id) ? icon("check") : ""}</span></button>`).join("")
          : `<p class="t-body-m c-secondary">Nothing on Sidequest looks like yours yet. Listings you publish will show up here.</p>`}
        ${list.length ? `<div class="notice" style="margin-top:14px">${icon("info")}<span>Not yours? Leave it unticked and we’ll ask the right host.</span></div>` : ""}
      </div>`, { footer: foot(btn(n ? `Claim ${n} listing${n === 1 ? "" : "s"}` : "Continue", { "data-act": "claimListings" })) });
  } };

  const DOC_SHORT = { "Business registration": "Business number", "Government photo ID": "Photo ID", "Proof of venue or address": "Proof of address" };
  S["host-pending"] = { role: "host", label: "Host: review", render: () => {
    const h = H() || {};
    const sum = (ic, title, sub, go) => `<div class="sum-row"><span class="opt-ic">${icon(ic)}</span><span class="text"><span class="t-body-l">${esc(title)}</span><span class="t-body-m c-secondary">${esc(sub)}</span></span><button class="t-body-m c-secondary" data-go="${go}">Edit</button></div>`;
    const people = 1 + (h.team || []).length;
    const step = (cls, mark, title, sub) => `<li class="${cls}"><span class="mark">${mark}</span><span class="text"><span class="t-title-m">${title}</span><span class="t-body-m c-secondary">${sub}</span></span></li>`;
    return screen(`
      ${head(8, "Ready for review")}
      <div class="ob-body" style="gap:24px;padding-top:24px">
        <div class="sum-card">
          ${sum(HOST_ICONS[h.type] || "host", hostName(), h.type || "Host", "host-type")}
          ${sum("id", "Verification", h.verifyDoc ? DOC_SHORT[h.verifyDoc.kind] : "Not added yet", "host-verify")}
          ${sum("ticket", "Ticketing", h.ticketing || "Not set", "host-ticketing")}
          ${sum("crew", "Team", `${people} ${people === 1 ? "person" : "people"}`, "host-team")}
        </div>
        <ol class="steps">
          ${step("done", icon("check"), "Submitted", "Just now")}
          ${step("current", "2", "In review", "Usually under a day")}
          ${step("", "3", "Approved", "Your badge turns verified")}
        </ol>
      </div>`, { footer: foot(btn("Submit for review", { "data-act": "hostSubmit" })) });
  } };

  // Singular of a vibe tile, for the sentence: "Live Sets" -> "live set"
  const oneOf = (label) => label.toLowerCase().replace(/s$/, "").replace(/s( |$)/, "$1");
  S["host-ready"] = { role: "host", label: "Host: demand map ready", render: () => {
    const h = H() || { vibes: [], areas: [] };
    const area = (h.areas || [])[0] || h.area || "Toronto";
    const hood = SQ.HOODS.find((x) => x[0] === area);
    const tile = SQ.TILES.find((t) => t[2].some((v) => h.vibes.includes(v)));
    const vibes = tile ? tile[2] : h.vibes;
    // Demand: request votes that fit, plus attendees whose taste fits
    const fits = SQ.d.requests.filter((r) => r.status === "open");
    const people = fits.reduce((n, r) => n + r.votes, 0) + Object.values(SQ.d.friends).filter((f) => f.vibes.some((v) => vibes.includes(v))).length;
    const near = (e) => (hood ? Math.hypot(e.venue.lat - hood[1], e.venue.lng - hood[2]) : 0);
    const pins = SQ.d.events.filter((e) => e.venue && e.venue.lat != null && !SQ.isPast(e)).sort((a, b) => near(a) - near(b))
      .reduce((keep, e) => (keep.length < 10 && keep.every((x) => Math.hypot(x.venue.lat - e.venue.lat, x.venue.lng - e.venue.lng) > 0.004) ? [...keep, e] : keep), []) // spread out, so one busy venue doesn't hide the rest
      .map((e) => ({ lat: e.venue.lat, lng: e.venue.lng, tier: (e.vibes || []).some((v) => vibes.includes(v)) ? "strong" : "close", label: e.title }));
    return screen(`
      ${SQ.mapView("host-ready", { pins, home: hood ? area : null, labels: true, view: hood ? { x: SQ.projMap(hood[1], hood[2])[0] + 80, y: SQ.projMap(hood[1], hood[2])[1] + 70, z: 1 } : undefined, style: "height:360px" })}
      <div class="ob-body" style="gap:14px;padding-top:24px">
        <span class="t-overline">Your demand map is ready</span>
        <span class="big-num">${people.toLocaleString("en-US")}</span>
        <p class="t-display-m">people near ${esc(area)} want ${tile ? `${/^[aeiou]/.test(oneOf(tile[0])) ? "an" : "a"} ${esc(oneOf(tile[0]))}` : "a sidequest like yours"} this month.</p>
        ${h.verification === "approved" ? `<div class="notice success">${icon("check")}<span>Approved. Your sidequests now show a verified badge.</span></div>` : `<div class="notice warning">${icon("clock")}<span>In review. Your sidequests show Unverified until approved.</span></div>`}
      </div>`, { cls: "bleed", footer: foot(btn("Open demand insights", { "data-go": "host-demand" }, "primary", "arrow")) });
  } };

  /* ===================== Host tools (Figma: 34 to 46) ===================== */
  const TZ = "America/Toronto";
  const DOW = ["M", "T", "W", "T", "F", "S", "S"];
  const PHOTOS = ["cheers", "string-lights", "lanterns", "jazz-band", "beer-garden", "bokeh-2"];
  const photoFor = (n) => PHOTOS[Number(n) % PHOTOS.length];
  const dayTime = (iso) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ })} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(":00", "")}`;
  };
  const monthDay = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
  const daysAgo = (iso) => {
    const n = Math.floor((SQ.now() - new Date(iso)) / 86400000);
    return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`;
  };
  // Figma: Stat card. Overline, a big number, and a trend tag
  const up = (text) => tag(text, "success", "chevU");
  const flat = (text) => tag(text, "", "minus");
  const metric = (label, value, trend = "", a = null) => `<${a ? "button" : "div"} class="metric" ${a ? SQ.attr(a) : ""}><span class="t-overline">${esc(label)}</span><span class="metric-num">${esc(value)}</span>${trend}</${a ? "button" : "div"}>`;
  // A labelled bar: Figma "Interest from requesters", "Views", "Host 4.9"
  const hbar = (label, value, pct, tone = "") => `<div class="hbar-row"><div class="row"><span class="t-body-m">${esc(label)}</span><span class="t-data c-secondary">${esc(value)}</span></div><span class="hbar ${tone}"><i style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></i></span></div>`;
  const hostTop = (title, sub = "") => `<div class="page-head" style="gap:14px">
      <button class="host-who" data-go="host-profile-view">${hostLogo(H(), "xs")}<span class="t-overline">${esc(hostName())} · Host</span></button>
      <h1 class="t-display-xl">${esc(title)}</h1>${sub ? `<p class="t-body-l c-secondary">${esc(sub)}</p>` : ""}</div>`;
  const nf = (n) => Number(n || 0).toLocaleString("en-US");
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  /* ---------- Demand (Figma: 34 Demand insights) ---------- */
  const reqPin = (r) => {
    const h = SQ.HOODS.find((x) => x[0] === r.area);
    const o = { union: [43.6453, -79.3806], finch: [43.7806, -79.4155], kennedy: [43.7323, -79.2637], kipling: [43.6372, -79.5361] }[r.origin];
    const ll = h ? [h[1], h[2]] : o;
    // spread requests in the same area a little, so each pin can be tapped
    const j = ((r.id * 37) % 11) / 11 - 0.5;
    return ll && { lat: ll[0] + j * 0.004, lng: ll[1] + (((r.id * 53) % 13) / 13 - 0.5) * 0.006, tier: r.status === "claimed" ? "low" : r.votes >= 10 ? "strong" : "close", act: "openRequest", arg: r.id, label: r.text };
  };
  S["host-demand"] = { role: "host", label: "Host: demand insights", render: () => {
    const r = R();
    const open = SQ.d.requests.filter((x) => x.status !== "live");
    const asks = open.reduce((n, x) => n + x.votes, 0);
    const days = r ? DOW.map((_, i) => r.heat.reduce((n, h) => n + h.days[i], 0)) : DOW.map(() => 0);
    const max = Math.max(1, ...days);
    const order = days.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
    const tone = (i) => (!days[i] ? "" : i === order[0][1] ? "top" : i === order[1][1] ? "next" : "");
    const showMap = U().demandMap;
    const area = (H() && ((H().areas || [])[0] || H().area)) || "Ossington";
    const hood = SQ.HOODS.find((x) => x[0] === area);
    return screen(`
      ${hostTop("Toronto wants", "Live Sidequest Requests from real, active accounts.")}
      <div class="pad stack" style="gap:24px;padding-top:20px">
        <div class="metrics">
          ${metric("Requests near you", nf(asks), r && r.week.votes ? up(`+${r.week.votes} this week`) : flat("steady this week"))}
          ${metric("Hosts planning", nf(r ? r.week.planning : 0), flat(`${r ? r.week.planningNew : 0} new`))}
        </div>
        <div class="stack-sm" style="gap:12px"><span class="t-overline">When people want to go out</span>
          <div class="week-bars" role="img" aria-label="Requests by day of the week">${days.map((v, i) => `<span class="wb"><i class="${tone(i)}" style="height:${Math.max(12, (v / max) * 130)}px" title="${Math.round(v)} asks"></i><span class="t-data c-tertiary">${DOW[i]}</span></span>`).join("")}</div></div>
        <div class="stack-sm" style="gap:4px">
          <div class="section-header"><span>Top requests</span><button data-act="toggleDemandMap">${showMap ? "List" : "Map"}</button></div>
          ${showMap ? `<div style="position:relative;margin-top:10px">${SQ.mapView("demand", { pins: open.map(reqPin).filter(Boolean), home: hood ? area : null, labels: true, view: hood ? { x: SQ.projMap(hood[1], hood[2])[0], y: SQ.projMap(hood[1], hood[2])[1], z: 0.8 } : undefined, style: "height:320px;border-radius:20px" })}${SQ.mapZoom("demand")}</div>${SQ.mapLegend()}` : ""}
          ${open.slice(0, showMap ? 3 : 12).map((x) => `<button class="top-req" data-act="openRequest" data-arg="${x.id}">
            <span class="n">${nf(x.votes)}</span><span class="text"><span class="t-title-m">${esc(x.text.replace(/^\w/, (c) => c.toUpperCase()))}</span><span class="t-body-m c-secondary">${SQ.requestMeta(x)}</span></span>
            ${x.status === "claimed" ? SQ.tag(x.claimedBy === hostName() ? "You're on it" : "Planning", "hot") : icon("chevR")}</button>`).join("") || `<p class="t-body-m c-secondary">No open requests yet.</p>`}
        </div>
      </div>`, { tabbar: hostTabs("host-demand") });
  } };

  /* ---------- Request detail (Figma: 35 Request detail) ---------- */
  const brief = (r) => {
    const parts = [`${r.when === "Any time" ? "Any day" : r.when}${r.area ? ` in ${r.area}` : ""}${r.budget != null ? (r.budget ? `, under $${r.budget}` : ", free") : ""}.`];
    if (r.votes > 1) parts.push(`${pct(r.parties || 0, r.votes)}% of requesters go out in a group${r.size && r.size !== "Solo" ? ` of ${r.size}` : ""}.`);
    if (r.vibe) parts.push(`They tagged it ${r.vibe}.`);
    return parts.join(" ");
  };
  S["host-request"] = { role: "host", label: "Host: request detail", render: () => {
    const r = req(U().hostRequest) || SQ.d.requests[0];
    const rep = R();
    const names = rep ? rep.askers[r.id] || [] : [];
    const week = rep ? rep.week.byRequest[r.id] || 0 : 0;
    const mine = r.claimedBy === hostName();
    return screen(`
      <div class="rq-hero">${SQ.ph(photoFor(r.id))}<span class="rq-scrim"></span>
        <div class="qd-nav">${iconBtn("back", { "data-back": "", "aria-label": "Back" }, "ghost")}<span class="grow"></span>${iconBtn("map", { "data-act": "requestOnMap", "aria-label": "See on the demand map" }, "ghost")}</div>
        <div class="rq-title"><span class="t-overline">Quest request · ${nf(r.votes)} asked</span><h1 class="t-display-l">${esc(r.text.replace(/^\w/, (c) => c.toUpperCase()))}</h1>${names.length ? `<span class="faces">${names.map((n) => avatar(n)).join("")}</span>` : ""}</div>
      </div>
      <div class="pad stack" style="gap:20px;padding-top:20px">
        <div class="metrics">
          ${metric("Asked", nf(r.votes), week ? up(`+${week} this week`) : flat("steady"))}
          ${metric("In parties", `${pct(r.parties || 0, r.votes)}%`, flat(r.size && r.size !== "Solo" ? `groups of ${r.size}` : "mostly solo"))}
        </div>
        <div class="idea-brief"><span class="t-title-l">Idea brief</span><p class="t-body-l">${esc(brief(r))}</p></div>
        <div class="stack-sm" style="gap:12px"><span class="t-overline">Hosts planning something like this</span>
          ${r.status === "claimed" ? `<div class="sum-row"><span class="opt-ic">${icon("user")}</span><span class="text"><span class="t-title-m">${esc(mine ? `${r.claimedBy} (you)` : r.claimedBy)}</span><span class="t-body-m c-secondary">Started planning ${r.claimedAt ? daysAgo(r.claimedAt) : "recently"}</span></span></div>` : `<p class="t-body-m c-secondary">Nobody yet. Be the first.</p>`}
        </div>
      </div>`, { cls: "bleed", footer: `<div class="footer-bar">
        ${r.status === "open" ? btn("We’re on it · tell the requesters", { "data-act": "claim", "data-arg": r.id }) : mine && r.status === "claimed" ? btn("Release this request", { "data-act": "unclaim", "data-arg": r.id }, "outline") : ""}
        <div class="btn-row" style="gap:10px">${btn("Create sidequest", { "data-act": "draftFromRequest", "data-arg": r.id }, "secondary m")}${btn("Test a draft", { "data-act": "testFromRequest", "data-arg": r.id }, "outline m")}</div></div>` });
  } };

  /* ---------- Draft test (Figma: 36 Draft test) ---------- */
  const draftOf = (id) => ((H() && H().drafts) || []).find((d) => d.id === id);
  const draftMeta = (d) => [d.venue && d.venue.name ? d.venue.name : (req(d.fromRequest) || {}).area, d.date ? dayTime(`${d.date}T${d.time || "20:00"}:00-04:00`) : "", d.price !== "" && d.price != null ? (Number(d.price) ? `$${d.price}` : "Free") : "", d.age || ""].filter(Boolean).join(" · ");
  const fmt12 = (t) => {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
  };
  // The one change most likely to lift interest, from the request it answers
  SQ.tweakFor = (d) => {
    const r = req(d.fromRequest);
    if (r && r.budget != null && d.price !== "" && Number(d.price) > r.budget) return { text: `Drop the price to $${r.budget}. Most requesters asked for under $${r.budget}.`, set: { price: String(r.budget) } };
    if (d.time && d.time >= "22:00") return { text: `Start at 9 PM instead of ${fmt12(d.time).replace(" PM", "")}. Requesters who go out ${r && r.when !== "Any time" ? `on ${r.when.replace(/ late$/, "")}s`.replace(/ss$/, "s") : "late"} mostly arrive before ${fmt12(d.time).replace(" PM", "")}.`, set: { time: "21:00" } };
    if (!(d.vibes || []).length) return { text: "Add vibe tags so it reaches people whose taste fits.", go: "host-create" };
    return null;
  };
  S["host-draft-test"] = { role: "host", label: "Host: draft test", render: () => {
    const d = draftOf(U().hostDraftId);
    if (!d) return screen(empty("sparkle", "That draft is gone."), { title: "Draft test" });
    const t = d.test || { shownTo: 0, saves: 0, wouldGo: 0, fromRequesters: 0, fromOthers: 0 };
    const day = d.test ? Math.min(3, 1 + Math.floor((SQ.now() - new Date(d.test.startedAt)) / 86400000)) : 0;
    const tw = SQ.tweakFor(d);
    return screen(`
      <div class="pad stack" style="gap:16px;padding-top:8px">
        <div class="stack-xs"><h1 class="t-display-l">${esc(d.title || "Untitled draft")}</h1><p class="t-body-l c-secondary">${esc(draftMeta(d))}</p></div>
        <div class="row start" style="gap:8px">${tag(d.test ? `Draft test · day ${day} of 3` : "Not tested", d.test ? "signature" : "", "spark")}<span class="t-caption c-secondary">${d.test ? `shown to ${nf(t.shownTo)} matching people` : "Start a test to show it to people whose taste fits"}</span></div>
        <div class="metrics">${metric("Saves", nf(t.saves), (t.saves ? up : flat)(`${pct(t.saves, t.shownTo)}%`))}${metric("Would go", nf(t.wouldGo), (t.wouldGo ? up : flat)(`${(t.shownTo ? (t.wouldGo / t.shownTo) * 100 : 0).toFixed(1)}%`))}</div>
        ${hbar("Interest from requesters", `${t.fromRequesters}%`, t.fromRequesters)}
        ${hbar("Interest from non-users", `${t.fromOthers}%`, t.fromOthers, "social")}
        ${tw ? `<div class="idea-brief"><span class="t-title-l">Suggested tweak</span><p class="t-body-l">${esc(tw.text)}</p>${btn("Apply tweak", { "data-act": "applyTweak" }, "primary s")}</div>` : ""}
      </div>`, { title: "Draft test", right: iconBtn("more", { "data-act": "deleteDraft", "data-arg": d.id, "aria-label": "Delete draft" }), footer: `<div class="footer-bar">${btn("Publish as a sidequest", { "data-act": "openDraft", "data-arg": d.id })}${d.test ? (d.test.simulated ? "" : btn("Simulate 3 days of interest", { "data-act": "simulateDraft" }, "ghost m")) : btn("Start a 3-day test", { "data-act": "testDraft" }, "ghost m")}</div>` });
  } };

  /* ---------- Create (Figma: 37 Create a sidequest, 38 Event day info) ---------- */
  S["host-create"] = { role: "host", label: "Host: create a quest", render: () => {
    const d = U().hostDraft;
    const st = U().poster && U().poster.for === "host" ? U().poster : null;
    const tileOn = (t) => t[2].some((v) => d.vibes.includes(v));
    return screen(`
      <div class="pad stack" style="gap:14px;padding-top:4px">
        ${st && st.loading ? `<div class="cover-drop">${thinking("Reading your photo…")}</div>`
          : `<label class="cover-drop${d.image ? " has" : ""}"${d.image ? ` style="background-image:url('${esc(d.image)}')"` : ""}>${d.image ? `<span class="tag photo">${icon("image")}Change cover</span>` : `${icon("image")}<span>Add a cover photo</span>`}<input type="file" accept="image/*" data-upload="posterHost" class="sr-only"></label>`}
        ${st && st.error && !d.image ? `<p class="field-help">${esc(st.error)}</p>` : ""}
        ${field("Title", "hostDraft.title", d.title, "text", "Name your sidequest")}
        <div class="field-row">${field("Day", "hostDraft.date", d.date, "date")}${field("Starts", "hostDraft.time", d.time, "time")}${field("Ends", "hostDraft.endTime", d.endTime, "time")}</div>
        <div class="field-row two">${field("Price", "hostDraft.price", d.price, "number", "$0", { min: 0, inputmode: "numeric" })}
          <div class="field"><span>Age</span><div class="seg base tall">${["All ages", "19+"].map((a) => `<button class="${d.age === a ? "on" : ""}" data-act="draftSet" data-arg="age:${a}" aria-pressed="${d.age === a}">${a}</button>`).join("")}</div></div></div>
        ${field("Venue", "hostDraft.venue.name", d.venue.name, "text", "Where it’s on", { icon: "pin" })}
        ${field("", "hostDraft.venue.address", d.venue.address, "text", "Street address, for the map")}
        <div class="stack-sm" style="gap:10px;padding-top:4px"><span class="t-overline">Vibe tags</span>
          <div class="chips">${SQ.TILES.map((t) => chip(t[0], tileOn(t), { "data-act": "draftVibe", "data-arg": t[0] })).join("")}</div></div>
        <div class="stack-sm" style="gap:10px"><span class="t-overline">Payments at the door</span>
          <div class="chips">${[["Card", "card"], ["Tap", "tap"], ["Cash", "cash"]].map(([p, ic]) => chip(p, d.dayInfo.payments.includes(p), { "data-act": "draftPay", "data-arg": p }, ic)).join("")}</div></div>
      </div>`, { title: `${d.eventId ? "Edit sidequest" : "Create a sidequest"} · 1/2`, close: true, back: "host-quests", cls: "wide-bar", footer: `<div class="footer-bar">${btn("Next: event day info", { "data-act": "draftNext" }, "primary", "arrow")}</div>` });
  } };

  const nextMonday9 = () => {
    const n = SQ.now();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(n.getTime() + i * 86400000);
      if (d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ }) === "Mon") return `${SQ.dayKey(d)}T09:00:00-04:00`;
    }
  };
  SQ.nextMonday9 = nextMonday9;
  const swRow = (key, title, ic = "") => {
    const x = U().hostDraft.dayInfo[key];
    return `<div class="sw-row">${ic ? `<span class="opt-ic">${icon(ic)}</span>` : ""}<button class="text" data-act="dayNote" data-arg="${key}"><span class="t-title-m">${esc(title)}</span>${x.note ? `<span class="t-body-m c-secondary">${esc(x.note)}</span>` : x.on && key !== "quietRoom" ? `<span class="t-body-m c-tertiary">Add a detail</span>` : ""}</button>
      <button class="toggle${x.on ? " on" : ""}" data-act="dayToggle" data-arg="${key}" aria-pressed="${x.on}" aria-label="${esc(title)}"></button></div>`;
  };
  S["host-create-dayinfo"] = { role: "host", label: "Host: event day info", render: () => {
    const d = U().hostDraft;
    const di = d.dayInfo;
    return screen(`
      <div class="pad stack" style="gap:16px;padding-top:4px">
        <p class="t-body-m c-secondary">Attendees see this on their event day screen.</p>
        <div class="stack-sm" style="gap:10px"><span class="t-overline">Entrances</span>
          ${di.entrances.map((x, i) => field("", `hostDraft.dayInfo.entrances.${i}`, x, "text", i ? "Another door" : "Laneway door · tickets", { icon: "door" })).join("")}
          ${di.entrances.length < 4 ? `<button class="btn btn-ghost s" data-act="addEntrance" style="align-self:flex-start">${icon("plus")}Add entrance</button>` : ""}</div>
        <div class="stack-sm" style="gap:0"><span class="t-overline">Coat check and re-entry</span>${swRow("coatCheck", "Coat check")}${swRow("reentry", "Re-entry")}</div>
        <div class="stack-sm" style="gap:0"><span class="t-overline">Accessibility</span>${swRow("stepFree", "Step-free entrance", "access")}${swRow("quietRoom", "Quiet room", "moon")}</div>
        <label class="doc-drop${di.floorPlan ? " plan" : ""}"${di.floorPlan ? ` style="background-image:url('${di.floorPlan}')"` : ""}>${di.floorPlan ? `<span class="tag photo">${icon("upload")}Change floor plan</span>` : `${icon("upload")}<span>Upload a floor plan</span>`}<input type="file" accept="image/*" data-upload="floorPlan" class="sr-only"></label>
      </div>`, { title: `Event day info · 2/2`, cls: "wide-bar", footer: `<div class="footer-bar">${btn(d.eventId ? "Save changes" : "Publish now", { "data-act": "publish" })}${d.eventId ? "" : btn(`Schedule for Monday 9 AM`, { "data-act": "schedulePublish" }, "ghost m", "clock")}</div>` });
  } };

  /* ---------- Published (Figma: 39 Quest published) ---------- */
  S["host-published"] = { role: "host", label: "Host: published", render: () => {
    const e = ev(U().hostQuest);
    const res = U().published || {};
    if (!e) return screen(empty("ticket", "Publishing…"), { title: "" });
    const fits = res.fits || 0;
    return screen(`
      <div class="pad stack" style="gap:20px;padding-top:4px">
        <div class="pub-card">${poster(e)}<span class="qd-scrim"></span>
          <span class="tl">${SQ.matchPill(90)}</span><span class="tr">${icon("bookmark")}</span>
          <span class="bl">${tag("Live", "hot")}<span class="t-title-l">${esc(e.title)}</span><span class="t-data">${esc(monthDay(e.startsAt).replace(/^/, `${new Date(e.startsAt).toLocaleDateString("en-US", { weekday: "short", timeZone: TZ })} `))} · ${esc(dayTime(e.startsAt).split(" ").slice(1).join(" "))} · ${esc(priceLabel(e))}</span></span></div>
        <div class="stack-sm"><h1 class="t-display-l">Your sidequest is live.</h1>
          <p class="t-body-l c-secondary">It’s in Weekly Sidequests for ${nf(fits)} matching ${fits === 1 ? "person" : "people"} from Monday.</p></div>
        ${res.requesters || res.followers ? `<div class="notice success">${icon("check")}<span>${res.requesters ? `${nf(res.requesters)} requesters were told you’re on it.` : ""}${res.followers ? ` ${nf(res.followers)} followers heard first.` : ""}</span></div>` : ""}
        <div class="btn-row" style="gap:10px">${btn("Copy link", { "data-act": "copyLink", "data-arg": e.id }, "outline m", "link")}${btn("Share", { "data-act": "share", "data-arg": e.id }, "outline m", "share")}</div>
      </div>`, { title: "", close: true, back: "host-quests", right: iconBtn("share", { "data-act": "share", "data-arg": e.id, "aria-label": "Share" }), footer: `<div class="footer-bar">${btn("Open event day tools", { "data-act": "openCheckin", "data-arg": e.id })}${btn("Back to your sidequests", { "data-go": "host-quests" }, "ghost m")}</div>` });
  } };

  /* ---------- Your sidequests (Figma: 40 Live, 41 Drafts, 42 Past) ---------- */
  const QTABS = ["Live", "Drafts", "Past"];
  const soonTag = (e) => {
    const diff = Math.round((new Date(SQ.dayKey(new Date(e.startsAt))) - new Date(SQ.dayKey(SQ.now()))) / 86400000);
    return diff === 0 ? tag("Tonight", "hot") : diff > 0 && diff < 7 ? tag(new Date(e.startsAt).toLocaleDateString("en-US", { weekday: "short", timeZone: TZ }), "hot") : "";
  };
  const draftTag = (d) => (d.publishAt ? tag("Scheduled", "signature", "clock") : d.kind === "test" && d.test ? tag(`Draft test · day ${Math.min(3, 1 + Math.floor((SQ.now() - new Date(d.test.startedAt)) / 86400000))}`, "signature", "spark") : d.kind === "duplicate" ? tag("Duplicated", "social", "spark") : tag("Not tested", "", "spark"));
  const draftLine = (d) => (d.publishAt ? `Scheduled for ${dayTime(d.publishAt)}` : d.test && d.test.simulated ? `${nf(d.test.wouldGo)} would go · ${nf(d.test.saves)} saves` : d.kind === "duplicate" ? (d.date ? "Ready to publish" : "Pick a new day") : "");
  S["host-quests"] = { role: "host", label: "Host: your sidequests", render: () => {
    const t = U().hostTab || "Live";
    const list = myEvents();
    const live = list.filter((e) => !isDone(e) && !SQ.isPast(e));
    const past = list.filter((e) => isDone(e) || SQ.isPast(e)).reverse();
    const drafts = (H() && H().drafts) || [];
    let body = "";
    if (t === "Live") body = live.map((e) => {
      const st = statOf(e.id);
      const going = Math.max(e.going || 0, st ? st.interested : 0);
      const cap = e.capacity || 0;
      return `<div class="hq-card"><button class="hq-head" data-act="openCheckin" data-arg="${e.id}">${poster(e, "thumb")}<span class="text"><span class="t-title-m">${esc(e.title)}</span><span class="t-data c-secondary">${esc(dayTime(e.startsAt))} · ${esc((e.venue && e.venue.name !== "N/A" && e.venue.name) || e.neighbourhood)}</span></span>${soonTag(e)}</button>
        ${hbar(cap ? `${nf(going)} of ${nf(cap)} tickets` : `${nf(going)} going`, cap ? `${pct(going, cap)}%` : `${nf(st ? st.saves : 0)} saves`, cap ? pct(going, cap) : Math.min(100, going))}
        <div class="btn-row" style="gap:10px">${btn("Event day tools", { "data-act": "openCheckin", "data-arg": e.id }, "secondary s")}${btn("Edit", { "data-act": "editQuest", "data-arg": e.id }, "outline s")}</div></div>`;
    }).join("") || empty("ticket", "Nothing live yet. Tap + to create a sidequest.");
    if (t === "Drafts") body = drafts.map((d) => `<div class="hq-card"><div class="row">${draftTag(d)}${iconBtn("more", { "data-act": "deleteDraft", "data-arg": d.id, "aria-label": "Delete draft" }, "ghost s")}</div>
        <button class="hq-draft" data-act="openDraft" data-arg="${d.id}"><span class="t-title-l">${esc(d.title || "Untitled draft")}</span><span class="t-data c-secondary">${esc(draftMeta(d))}</span>${draftLine(d) ? `<span class="t-body-m">${esc(draftLine(d))}</span>` : ""}</button></div>`).join("") || empty("spark", "No drafts. Duplicate a past sidequest or test an idea from a request.");
    if (t === "Past") body = past.map((e) => {
      const st = statOf(e.id);
      const n = st ? Math.max(st.went, st.checkedIn) : 0;
      const avg = st && st.avgRating;
      return `<div class="hq-card"><div class="hq-head">${poster(e, "thumb")}<span class="text"><span class="t-title-m">${esc(e.title)}</span><span class="t-data c-secondary">${esc(monthDay(e.startsAt))} · ${nf(n)} attended</span></span>${avg ? `<span class="stars5 sm" aria-label="${avg} of 5 stars">${[1, 2, 3, 4, 5].map((i) => icon(i <= Math.round(avg) ? "starFill" : "star", i <= Math.round(avg) ? "on" : "")).join("")}</span>` : ""}</div>
        <div class="btn-row" style="gap:10px">${btn("See recap", { "data-act": "openRecap", "data-arg": e.id }, "outline s")}${btn("Duplicate", { "data-act": "duplicate", "data-arg": e.id }, "secondary s", "plus")}</div></div>`;
    }).join("") || empty("ticket", "Past sidequests and their recaps show up here.");
    return screen(`
      <div class="page-head row" style="flex-direction:row;align-items:center;padding-top:12px"><h1 class="t-display-xl grow">Your sidequests</h1>${iconBtn("plus", { "data-act": "newDraft", "aria-label": "Create a sidequest" }, "primary")}</div>
      <div class="pad stack" style="gap:16px;padding-top:16px">
        <div class="seg base">${QTABS.map((x) => `<button class="${t === x ? "on" : ""}" data-act="hostTab" data-arg="${x}" aria-pressed="${t === x}">${x}</button>`).join("")}</div>
        ${body}
      </div>`, { tabbar: hostTabs("host-quests") });
  } };

  /* ---------- Event day tools (Figma: 43) ---------- */
  const QUICK = ["Doors open", "Line is short", "Running late"];
  S["host-checkin"] = { role: "host", label: "Host: event day tools", render: () => {
    const e = ev(U().hostQuest) || myEvents()[0];
    if (!e) return screen(empty("ticket", "No sidequest picked."), { title: "Event day tools" });
    const me = SQ.me();
    const guests = [...new Set([...(me && me.log[e.id] ? [me.name || "You"] : []), ...(e.friends || []), ...(e.attendees || [])])];
    const inList = SQ.d.checkins[e.id] || [];
    const expected = Math.max(guests.length, e.going || 0, inList.length);
    const crewOf = (g) => (me && g === (me.name || "You") && me.log[e.id] && me.log[e.id].crewSize) || 1;
    const live = !isDone(e) && SQ.eventStatus(e) === "now";
    return screen(`
      <div class="pad stack" style="gap:20px;padding-top:4px">
        <div class="headcount"><div class="row"><span class="t-overline">Headcount</span>${isDone(e) ? tag("Ended") : live ? tag("Live", "hot") : tag(dayTime(e.startsAt), "signature")}</div>
          <div class="row start" style="align-items:baseline;gap:10px"><span class="hc-num">${inList.length}</span><span class="t-body-l c-secondary">/ ${nf(expected)} checked in</span></div>
          <span class="hbar success"><i style="width:${pct(inList.length, expected)}%"></i></span>
          <div class="btn-row" style="gap:10px"><label class="btn btn-primary m" style="cursor:pointer">${icon("qr")}Scan tickets<input type="file" accept="image/*" capture="environment" data-upload="scanGuest" class="sr-only"></label>${btn("Edit day info", { "data-act": "editDayInfo", "data-arg": e.id }, "outline m")}</div></div>
        <div class="stack-sm" style="gap:0"><div class="section-header" style="padding-bottom:6px"><span>Guest list</span><span class="t-caption c-secondary">${Math.max(0, expected - inList.length)} to go</span></div>
          ${guests.length ? guests.map((g) => `<div class="person divided">${avatar(g, "s")}<span class="text"><span>${esc(g)}</span><span>GA × ${crewOf(g)}</span></span>${inList.includes(g) ? btn("In", { "data-act": "checkin", "data-arg": g, "aria-pressed": "true" }, "primary s", "check") : btn("Check in", { "data-act": "checkin", "data-arg": g }, "outline s")}</div>`).join("")
            : `<p class="t-body-m c-secondary">No one has accepted this on Sidequest yet. People who bought on ${esc(SQ.d.host.ticketing || "your ticketing site")} check in there.</p>`}</div>
        <div class="stack-sm" style="gap:12px"><span class="t-title-l">Post a live update</span>
          <div class="chips">${QUICK.map((q) => `<button class="chip outline" data-act="quickUpdate" data-arg="${esc(q)}">${esc(q)}</button>`).join("")}</div></div>
      </div>`, { title: e.title, right: iconBtn("more", { "data-act": "endEvent", "data-arg": e.id, "aria-label": "End the event" }) });
  } };

  /* ---------- Insights: Overview and Recap (Figma: 44, 45) ---------- */
  const insightTabs = (t) => `<div class="line-tabs">${["Overview", "Recap"].map((x) => `<button class="${t === x ? "on" : ""}" data-act="insightTab" data-arg="${x}" aria-pressed="${t === x}">${x}</button>`).join("")}</div>`;
  S["host-insights"] = { role: "host", label: "Host: insights", render: () => {
    const t = U().insightTab || "Overview";
    const r = R();
    if (!r) return screen(`${hostTop("Insights")}<div class="pad stack">${loading()}</div>`, { tabbar: hostTabs("host-insights") });
    let body = "";
    if (t === "Overview") {
      const win = U().insightDays || 30;
      const f = r.funnel[win];
      const top = Math.max(1, f.views, f.saves, f.tickets, f.checkedIn);
      const a = r.audience;
      body = `<div class="seg base">${[7, 30, 90].map((n) => `<button class="${win === n ? "on" : ""}" data-act="insightDays" data-arg="${n}" aria-pressed="${win === n}">${n} days</button>`).join("")}</div>
        <div class="stack-sm" style="gap:14px"><span class="t-overline">From views to the door</span>
          ${hbar("Views", nf(f.views), (f.views / top) * 100, "muted")}${hbar("Saves", nf(f.saves), (f.saves / top) * 100, "social")}${hbar("Tickets", nf(f.tickets), (f.tickets / top) * 100)}${hbar("Checked in", nf(f.checkedIn), (f.checkedIn / top) * 100, "hot")}</div>
        <div class="metrics">${metric("Repeat attendees", `${pct(a.repeat, Math.max(1, a.people))}%`, flat(`${a.repeat} came back`), { "data-go": "host-audience" })}${metric("Came as a party", a.partyShare == null ? "–" : `${a.partyShare}%`, flat(a.partyShare == null ? "no accepts yet" : "with friends"), { "data-go": "host-audience" })}</div>
        ${btn("Plan next from the demand map", { "data-act": "planFromMap" }, "secondary", "bulb")}`;
    } else {
      const past = myEvents().filter((e) => isDone(e) || SQ.isPast(e));
      const e = ev(U().hostQuest) && past.includes(ev(U().hostQuest)) ? ev(U().hostQuest) : past[past.length - 1];
      const st = e && statOf(e.id);
      if (!st) body = empty("chart", "Your first recap shows up here after a sidequest ends.");
      else {
        const prev = past[past.indexOf(e) - 1];
        const pst = prev && statOf(prev.id);
        const delta = pst && pst.avgRating && st.avgRating ? Math.round((st.avgRating - pst.avgRating) * 10) / 10 : null;
        const went = Math.max(st.went, st.checkedIn);
        const dets = Object.entries(st.details || {});
        body = `<div class="stack-xs"><span class="t-overline">Last edition · ${esc(e.title)}</span><h2 class="t-display-l">How it went</h2></div>
          <div class="metrics">${metric("Attended", nf(went), st.interested ? up(`${pct(went, st.interested)}% of accepts`) : flat("no accepts on Sidequest"))}${metric("Rating", st.avgRating || "–", delta != null ? (delta >= 0 ? up(`+${delta} vs ${monthDay(prev.startsAt).split(" ")[0]}`) : flat(`${delta} vs ${monthDay(prev.startsAt).split(" ")[0]}`)) : flat(`${st.rated} rating${st.rated === 1 ? "" : "s"}`))}</div>
          <div class="stack-sm" style="gap:14px"><span class="t-overline">Ratings by category</span>${dets.length ? dets.map(([k, v], i) => hbar(k, v.toFixed(1), (v / 5) * 100, i === dets.length - 1 && v < 4 ? "muted" : "")).join("") : `<p class="t-body-m c-secondary">No one has rated the details yet.</p>`}</div>
          <div class="stack-sm" style="gap:12px"><span class="t-overline">What guests asked for next</span>${st.asksNext.length ? `<div class="chips">${st.asksNext.map((x) => `<span class="chip static">${esc(x.replace(/^\w/, (c) => c.toUpperCase()))}</span>`).join("")}</div>` : `<p class="t-body-m c-secondary">Nothing yet. Requests from people who went show up here.</p>`}</div>
          ${btn("Invite guests to follow you", { "data-act": "inviteFollow", "data-arg": e.id })}`;
      }
    }
    return screen(`${hostTop("Insights")}<div class="pad stack" style="gap:20px;padding-top:12px">${insightTabs(t)}${body}</div>`, { tabbar: hostTabs("host-insights") });
  } };
  /* ---------- Audience (Figma: 46) ---------- */
  const SEG_TONES = ["", "hot", "social", "muted"];
  S["host-audience"] = { role: "host", label: "Host: audience", render: () => {
    const r = R();
    if (!r) return screen(`<div class="pad stack">${loading()}</div>`, { title: "Audience" });
    const a = r.audience;
    const followers = a.followers;
    return screen(`
      <div class="pad stack" style="gap:20px;padding-top:4px">
        <div class="metrics">${metric("Followers", nf(followers), flat(followers ? "on Sidequest" : "none yet"))}${metric("Solo attendees", a.partyShare == null ? "–" : `${100 - a.partyShare}%`, flat("came on their own"))}</div>
        <div class="stack-sm" style="gap:14px"><span class="t-overline">Taste segments</span>${a.segments.length ? a.segments.map((s, i) => hbar(s.vibe, `${s.pct}%`, s.pct, SEG_TONES[i % 4])).join("") : `<p class="t-body-m c-secondary">No one has shown interest yet.</p>`}</div>
        <div class="stack-sm" style="gap:12px"><span class="t-overline">Top areas</span>${a.topAreas.length ? `<div class="chips">${a.topAreas.map((x) => `<span class="chip static">${esc(x.area)} · ${x.pct}%</span>`).join("")}</div>` : `<p class="t-body-m c-secondary">Shows once attendees with a home area accept.</p>`}</div>
        <div class="stack-sm" style="gap:12px"><span class="t-overline">Regulars</span>${a.regulars.length ? `<div class="row start" style="gap:14px"><span class="faces">${a.regulars.slice(0, 5).map((n) => avatar(n)).join("")}</span><span class="t-body-m c-secondary">${a.regulars.length > 5 ? `+${a.regulars.length - 5} ` : ""}came 3 times or more</span></div>` : `<p class="t-body-m c-secondary">People who come 3 times or more show up here.</p>`}</div>
        <p class="t-caption c-tertiary">From ${nf(a.people)} people who accepted, followed, or are friends going. Aggregated and anonymized.</p>
      </div>`, { title: "Audience" });
  } };

  /* ---------- Inbox (Figma: 47) ---------- */
  const QUICK_IN = ["Doors open", "Running late", "Line is short", "Last call", "Coat check is full"];
  S["host-messages"] = { role: "host", label: "Host: inbox", render: () => {
    const m = U().msg;
    const upcoming = myEvents().filter((e) => !isDone(e) && !SQ.isPast(e));
    if (!m.audience) m.audience = "attendees";
    if (m.audience === "attendees" && !upcoming.some((e) => e.id === m.eventId) && upcoming[0]) m.eventId = upcoming[0].id;
    const sent = SQ.d.hostMessages.filter((x) => x.host === hostName()).slice().reverse();
    const sched = m.when === "later";
    return screen(`
      ${hostTop("Inbox", "Announcements go to attendees’ notifications and their event day screen.")}
      <div class="pad stack" style="gap:24px;padding-top:20px">
        <div class="compose-card">
          <div class="stack-sm" style="gap:10px"><span class="t-overline">To</span>
            <div class="chips scroll-x">${upcoming.map((e) => chip(`${e.title} · ${nf(Math.max(e.going || 0, (statOf(e.id) || {}).interested || 0))}`, m.audience === "attendees" && m.eventId === e.id, { "data-act": "msgEvent", "data-arg": e.id })).join("")}${chip("Followers", m.audience === "followers", { "data-act": "msgAudience", "data-arg": "followers" })}</div></div>
          <div class="stack-sm" style="gap:10px"><span class="t-overline">Quick updates</span>
            <div class="chips scroll-x">${QUICK_IN.map((q) => `<button class="chip outline" data-act="msgQuick" data-arg="${esc(q)}">${esc(q)}</button>`).join("")}</div></div>
          <textarea class="compose" data-bind="msg.text" rows="2" placeholder="Doors at 10:30. Laneway entrance." aria-label="Update">${esc(m.text)}</textarea>
          ${sched ? field("Send at", "msg.sendAt", m.sendAt || "", "datetime-local", "", { min: new Date(SQ.now() - SQ.now().getTimezoneOffset() * 60000).toISOString().slice(0, 16) }) : ""}
          <div class="row" style="gap:10px"><div class="seg base" style="width:auto;flex:1">${[["now", "Now"], ["later", "Schedule"]].map(([k, l]) => `<button class="${(m.when || "now") === k ? "on" : ""}" data-act="msgWhen" data-arg="${k}" aria-pressed="${(m.when || "now") === k}">${l}</button>`).join("")}</div>
            ${btn(sched ? "Schedule" : "Send now", { "data-act": "hostMessage" }, "primary m", sched ? "clock" : "arrow")}</div>
        </div>
        <div class="stack-sm" style="gap:0"><span class="t-overline" style="padding-bottom:6px">Sent and scheduled</span>
          ${sent.length ? sent.map((x) => `<div class="list-row divided"><span class="lead-ic">${icon(x.sentAt || !x.sendAt ? "megaphone" : "clock")}</span><span class="text"><span>${esc(x.text)}</span><span>${x.sendAt && !x.sentAt ? `Scheduled ${esc(dayTime(x.sendAt))}` : `Sent ${esc(dayTime(x.sentAt || x.time))}${x.reached != null ? ` · ${nf(x.reached)} reached` : ""}`}</span></span></div>`).join("") : `<p class="t-body-m c-secondary">Nothing sent yet.</p>`}</div>
      </div>`, { tabbar: hostTabs("host-messages") });
  } };

  /* ---------- Host profile (Figma: 48) ---------- */
  S["host-profile-view"] = { role: "host", label: "Host: profile", render: () => {
    const h = H() || {};
    const r = R();
    const team = h.team || [];
    const owner = (SQ.me() && SQ.me().name) || "You";
    const people = [owner, ...team.map((m) => m.email.split("@")[0])].map((n) => n.split(/[ ._-]/)[0].replace(/^\w/, (c) => c.toUpperCase()));
    const link = (ic, title, sub, a) => `<button class="list-row" ${SQ.attr(a)}><span class="lead-ic">${icon(ic)}</span><span class="text"><span>${esc(title)}</span><span>${esc(sub)}</span></span>${icon("chevR")}</button>`;
    const site = h.website ? (/^https?:/.test(h.website) ? h.website : `https://${h.website}`) : "";
    const ig = h.social ? `https://instagram.com/${h.social.replace(/^@/, "")}` : "";
    return screen(`
      <div class="pad stack" style="gap:24px;padding-top:4px">
        <div class="identity">${hostLogo(h, "xl")}<h1 class="t-display-m">${esc(hostName())}</h1>
          ${h.verification === "approved" ? tag("Verified host", "success", "shieldCheck") : tag("Unverified", "unverified", "shield")}
          ${h.bio ? `<p class="t-body-m c-secondary center">${esc(h.bio)}</p>` : ""}</div>
        <div class="metrics">${metric("Followers", nf(r ? r.audience.followers : 0), flat("on Sidequest"))}${metric("Host rating", r && r.rating.avg ? r.rating.avg : "–", flat(`${r ? r.rating.count : 0} reviews`))}</div>
        <div class="stack-sm" style="gap:0"><span class="t-overline">Socials and website</span>
          ${h.social ? link("link", h.social, "Instagram", { "data-act": "openUrl", "data-arg": ig }) : ""}
          ${site ? link("globe", h.website, "Website", { "data-act": "openUrl", "data-arg": site }) : ""}
          ${!h.social && !site ? link("plus", "Add your Instagram or website", "Attendees tap through from your sidequests", { "data-go": "host-account" }) : ""}</div>
        <div class="stack-sm" style="gap:0"><span class="t-overline">Team and ticketing</span>
          ${link("crew", `${people.length} ${people.length === 1 ? "person" : "people"}`, people.slice(0, 3).join(", "), { "data-go": "host-team" })}
          ${link("ticket", h.ticketing || "Not set", "Ticketing", { "data-go": "host-ticketing" })}</div>
      </div>`, { title: "Host profile", right: iconBtn("edit", { "data-go": "host-account", "aria-label": "Edit profile" }), footer: `<div class="footer-bar">${btn("Switch to personal account", { "data-act": "switchToAttendee" }, "outline", "swap")}</div>` });
  } };

  SQ.screens = Object.assign(SQ.screens || {}, S);
})();
