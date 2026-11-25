/* Sketch 2 — the redesigned tabs: Squads (TB2), the Sidequests ticket wallet (TB2) and Profile with its settings
   (TB3, direction D1 "Bento"). Stats, Taste and Rewind are in screens-taste.js. Server side: lib/tabs.
   Colours: violet for events and Sidekick, teal for places and social, pink for deadlines, amber only for hosting. */
(function () {
  const SQ = window.SQ;
  const { esc, icon, btn, avatar, screen, me, ev, poster } = SQ;
  const S = {};
  const A = SQ.actions;
  const U = () => SQ.u;
  const TZ = "America/Toronto";
  const L = (k) => (SQ.t ? SQ.t(k) : k);
  // Settings > Language is hidden for now (French is skipped). Everything behind it stays: the stored setting, the
  // server's "fr" choice, the French labels below and the Language screen. Set this to true to bring it back.
  const LANGUAGE_ON = false;

  // ---------- Small parts shared by the tabs ----------
  // Icons the shared set doesn't have, in the same 24-unit, 1.75 stroke style
  const X = {
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    undo: '<path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    rewind: '<path d="M11 6 4 12l7 6zM20 6l-7 6 7 6z"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5M12 17v.5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    calAdd: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M12 13v5M9.5 15.5h5"/>',
    passport: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM8 7h7"/>',
    spark4: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>',
    warn: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4M12 17v.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    moon: '<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>',
    link2: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    listAdd: '<path d="M4 6h12M4 12h12M4 18h7M18 14v7M14.5 17.5h7"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  };
  const ix = (name, cls = "") => (X[name] ? `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><g stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${X[name]}</g></svg>` : icon(name, cls));
  SQ.ix = ix;
  const lab = (text, extra = "") => `<p class="tb-lab"${extra}>${esc(text)}</p>`;
  const isPlace = (e) => e && e.type === "place";
  const venueOf = (e) => (e.venue && e.venue.name && e.venue.name !== "N/A" ? e.venue.name : e.neighbourhood || "");
  const dayLabel = (iso, opts = { weekday: "short", month: "short", day: "numeric" }) => new Date(iso).toLocaleDateString("en-US", { ...opts, timeZone: TZ }).replace(",", "");
  const timeLabel = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(":00", "");
  const dayDiff = (iso) => Math.round((new Date(SQ.dayKey(new Date(iso))) - new Date(SQ.dayKey(SQ.now()))) / 86400000);
  const soonTag = (iso) => {
    const d = dayDiff(iso);
    return d === 0 ? (Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(new Date(iso))) >= 17 ? "Tonight" : "Today") : d === 1 ? "Tomorrow" : "";
  };
  const people = (keys) => keys.map((k) => (String(k).startsWith("u:") ? ((me().friendList || []).find((f) => f.key === k) || { name: "Friend" }).name : k));
  // "You" shows as your own initial, as the boards draw it
  const stack = (names, cls = "s") => (names.length ? `<span class="tb-stack">${names.slice(0, 5).map((n) => (n === "You" ? avatar((me() && me().name) || "You", cls) : avatar(n, cls))).join("")}${names.length > 5 ? `<span class="av more ${cls}">+${names.length - 5}</span>` : ""}</span>` : "");
  const tbtn = (label, a = {}, kind = "o", ic = "") => `<button class="tb-btn ${kind}" ${SQ.attr(a)}>${ic ? ix(ic) : ""}<span>${esc(label)}</span></button>`;
  const pill = (label, kind = "", ic = "") => `<span class="tb-pill ${kind}">${ic ? ix(ic, "xs") : ""}${esc(label)}</span>`;
  Object.assign(SQ, { tbtn, tbPill: pill, tbLab: lab, tbStack: stack, tbDayLabel: dayLabel, tbTimeLabel: timeLabel });
  // "2026-12-05", "14:00" in Toronto -> an ISO instant, EST or EST-with-daylight-saving as that day has it (lib/tabs/time.js)
  const torontoClock = (t) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t));
  const offsetAt = (t) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(t / 60000) * 60000;
  };
  SQ.torontoISO = (date, time = "00:00") => {
    const [y, mo, d] = String(date).split("-").map(Number);
    const [h, mi] = String(time).split(":").map(Number);
    const wall = Date.UTC(y, mo - 1, d, h, mi);
    const want = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    const before = wall - offsetAt(wall - 86400000), after = wall - offsetAt(wall + 86400000);
    const ok = [before, after].filter((c) => torontoClock(c) === want).sort((a, b) => a - b);
    return new Date(ok.length ? ok[0] : before).toISOString();
  };

  // ---------- Add to calendar: a standard .ics file made in the page (works in any calendar app, no account) ----------
  const icsDate = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  // Lines over 75 octets are folded (RFC 5545 3.1)
  const fold = (line) => {
    const out = [];
    let cur = "";
    for (const ch of line) {
      if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
        out.push(cur);
        cur = "";
      }
      cur += ch;
    }
    out.push(cur);
    return out.join("\r\n ");
  };
  SQ.icsFor = (e) => {
    const start = Date.parse(e.startsAt);
    const end = e.endsAt ? Date.parse(e.endsAt) : start + 2 * 3600000;
    const where = [e.venue && e.venue.name !== "N/A" ? e.venue.name : "", e.venue && e.venue.address && e.venue.address !== "N/A" ? e.venue.address : ""].filter(Boolean).join(", ");
    const rem = (((me() || {}).settings || {}).calendar || {}).reminder || "2h";
    const alarm = { "1h": "-PT1H", "2h": "-PT2H", "1d": "-P1D" }[rem];
    const link = e.ticketLink || e.sourceUrl || `${location.origin}/?quest=${e.id}`;
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SideQuest//Sidequests//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT", `UID:sidequest-${e.id}@sidequest.app`, `DTSTAMP:${icsDate(Date.now())}`, `DTSTART:${icsDate(start)}`, `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsText(e.title)}`, ...(where ? [`LOCATION:${icsText(where)}`] : []),
      `DESCRIPTION:${icsText([e.description && e.description !== "N/A" ? e.description.slice(0, 300) : "", `On SideQuest: ${link}`].filter(Boolean).join("\n\n"))}`,
      `URL:${icsText(link)}`,
      ...(alarm ? ["BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(e.title)}`, `TRIGGER:${alarm}`, "END:VALARM"] : []),
      "END:VEVENT", "END:VCALENDAR",
    ];
    return lines.map(fold).join("\r\n") + "\r\n";
  };
  SQ.download = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  const slug = (s) => String(s || "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "event";
  // Settings > Calendar picks what "Add to calendar" does: Google and Outlook open their add-event page with the
  // details filled in, Apple downloads the .ics (Apple Calendar opens it), and "Ask each time" shows a small chooser.
  const calParts = (e) => {
    const start = Date.parse(e.startsAt);
    const end = e.endsAt ? Date.parse(e.endsAt) : start + 2 * 3600000;
    const where = [e.venue && e.venue.name !== "N/A" ? e.venue.name : "", e.venue && e.venue.address && e.venue.address !== "N/A" ? e.venue.address : ""].filter(Boolean).join(", ");
    const link = e.ticketLink || e.sourceUrl || `${location.origin}/?quest=${e.id}`;
    const details = [e.description && e.description !== "N/A" ? e.description.slice(0, 300) : "", `On SideQuest: ${link}`].filter(Boolean).join("\n\n");
    return { start, end, where, details };
  };
  SQ.calUrl = (kind, e) => {
    const p = calParts(e);
    const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    if (kind === "google") return `https://calendar.google.com/calendar/render?${q({ action: "TEMPLATE", text: e.title, dates: `${icsDate(p.start)}/${icsDate(p.end)}`, details: p.details, location: p.where, ctz: TZ })}`;
    if (kind === "outlook") return `https://outlook.live.com/calendar/0/action/compose?${q({ rru: "addevent", path: "/calendar/action/compose", subject: e.title, startdt: new Date(p.start).toISOString(), enddt: new Date(p.end).toISOString(), body: p.details, location: p.where })}`;
    return null;
  };
  const CAL_NAME = { google: "Google Calendar", outlook: "Outlook", apple: "Apple Calendar" };
  function calWith(kind, e) {
    if (kind === "apple") {
      SQ.download(`${slug(e.title)}.ics`, SQ.icsFor(e), "text/calendar");
      return SQ.toast("Calendar file downloaded. Open it to add the event.");
    }
    window.open(SQ.calUrl(kind, e), "_blank", "noopener");
    SQ.toast(`Opening ${CAL_NAME[kind]} to add it.`);
  }
  A.addCal = (id) => {
    const e = ev(id);
    if (!e) return SQ.toast("That event isn't on SideQuest anymore.");
    const app = (((me() || {}).settings || {}).calendar || {}).app || "ask";
    if (app === "ask") return void SQ.openSheet("cal", { id: e.id });
    calWith(app, e);
  };
  A.calWith = (arg) => {
    const [kind, id] = String(arg).split("|");
    const e = ev(id);
    SQ.closeSheet();
    if (e) calWith(kind, e);
  };

  /* ===================== Squads (TB2-Squads) ===================== */
  const squadsOf = () => (me() && me().squads) || [];
  const squadById = (id) => squadsOf().find((s) => s.id === id) || null;
  const planLink = (s) => `/sk?squad=${encodeURIComponent(s.id)}`;
  const closesLabel = (iso) => `${dayLabel(iso, { weekday: "short" })} ${timeLabel(iso)}`;
  const crewNames = (s) => ["You", ...s.names];
  // A Sidekick call going on now for this squad: "Live call · N in", who's on it, and Join (opens the call)
  const liveMins = (l) => Math.max(1, Math.round((SQ.now().getTime() - (l.startedAt || SQ.now().getTime())) / 60000));
  const liveRow = (s) => (s.live ? `<div class="sq-live" role="group" aria-label="Live call"><span class="sq-live-orb" aria-hidden="true"></span>
      <span class="grow" style="min-width:0"><b class="tb-t14">Live call · ${s.live.on} in</b><span class="tb-s ellipsis">${esc([s.live.names.join(", "), `${liveMins(s.live)} min`].filter(Boolean).join(" · "))}</span></span>
      <a class="tb-btn v sm sq-join" href="/sk/${esc(s.live.id)}" data-join-call="${esc(s.live.id)}" aria-label="Join ${esc(s.name)}'s call">${ix("phone")}<span>Join</span></a></div>` : "");

  // Each squad gets its own photo from public/assets/photos, picked from its id so it never changes
  const SQUAD_PHOTOS = ["cheers", "beer-garden", "string-lights", "lanterns", "jazz-band", "bokeh-2", "pinwheels", "sax", "dragon-boat", "hall", "performer", "bokeh-1"];
  const squadPhoto = (s) => SQUAD_PHOTOS[SQ.hash(s.id) % SQUAD_PHOTOS.length];
  SQ.squadPhoto = squadPhoto;
  // Faces in the tag style; anyone online (on the squad's call, or chatting in the last half hour) glows
  const faces = (s, cls = "s", max = 5) => {
    const on = new Set(s.online || []);
    const names = crewNames(s);
    return `<span class="sq-faces">${names.slice(0, max).map((n) => {
      const a = n === "You" ? avatar((me() && me().name) || "You", cls) : avatar(n, cls);
      return on.has(n) ? a.replace('class="av ', 'class="av online ').replace(/title="([^"]*)"/, 'title="$1, online"') : a;
    }).join("")}${names.length > max ? `<span class="av more ${cls}">+${names.length - max}</span>` : ""}</span>`;
  };
  const ago = (iso) => {
    const d = Math.max(0, Math.round((SQ.now().getTime() - Date.parse(iso)) / 86400000));
    return d === 0 ? "today" : d === 1 ? "yesterday" : d < 14 ? `${d} days ago` : `${Math.round(d / 7)} weeks ago`;
  };
  // One status line: live call, who's online, the next plan, an open vote, or nothing yet (no blend %)
  function statusLine(s) {
    const next = s.next && ev(s.next);
    if (s.live) return `● Live call · ${s.live.on} in`;
    const on = (s.online || [])[0];
    const what = next ? `${dayLabel(next.startsAt, { weekday: "short" })} ${timeLabel(next.startsAt)} · ${next.title}` : s.options.length ? `Vote open${s.closes ? ` · closes ${closesLabel(s.closes)}` : ""}` : s.lastAt ? `Last chat ${ago(s.lastAt)}` : "Nothing planned yet";
    return on ? `● ${on}${(s.online || []).length > 1 ? ` and ${(s.online || []).length - 1} more` : ""}${(s.online || []).length > 1 ? " are" : "'s"} online · ${next || s.options.length ? what : "nothing planned yet"}` : what;
  }
  SQ.squadStatus = statusLine;
  // The most active squad: a live call first, then new messages, an open vote, and the latest chat
  const activity = (s) => (s.live ? 1e15 : 0) + (s.fresh || 0) * 1e13 + (s.options.length ? 1e12 : 0) + (s.lastAt ? Date.parse(s.lastAt) : 0) / 1e3;
  function squadHero(s) {
    return `<div class="sq-card sq-hero${s.live ? " live" : ""}" data-squad="${esc(s.id)}">
      ${SQ.ph(squadPhoto(s), "sq-img")}<span class="sq-fade" aria-hidden="true"></span>
      ${liveRow(s)}
      <button class="sq-open sq-hero-open" data-act="openSquad" data-arg="${esc(s.id)}" aria-label="Open ${esc(s.name)}">
        ${faces(s, "s")}
        <span class="sq-hero-t">${esc(s.name)}</span>
        <span class="sq-line ellipsis">${esc(statusLine(s)).replace(/^● /, '<i class="sq-dot" aria-hidden="true"></i>')}</span>
      </button>
      <span class="row start sq-hero-acts" style="gap:8px">
        <a class="tb-btn grad sm sq-plan" href="${planLink(s)}" data-plan-squad="${esc(s.id)}">Plan a night</a>
        ${s.fresh ? `<button class="tb-btn o sm sq-new-msgs" data-act="openSquadChat" data-arg="${esc(s.id)}" aria-label="${s.fresh} new message${s.fresh === 1 ? "" : "s"} in ${esc(s.name)}"><span aria-hidden="true">💬</span><span>${s.fresh} new</span></button>` : ""}
      </span>
    </div>`;
  }
  function squadRow(s) {
    return `<div class="sq-card sq-row${s.live ? " live" : ""}" data-squad="${esc(s.id)}">
      ${SQ.ph(squadPhoto(s), "sq-img")}<span class="sq-fadeL" aria-hidden="true"></span>
      ${liveRow(s)}
      <button class="sq-open" data-act="openSquad" data-arg="${esc(s.id)}" aria-label="Open ${esc(s.name)}">
        ${faces(s, "s", 3)}
        <span class="grow" style="min-width:0"><span class="sq-name ellipsis">${esc(s.name)}</span><span class="sq-line ellipsis">${esc(statusLine(s)).replace(/^● /, '<i class="sq-dot" aria-hidden="true"></i>')}</span></span>
        ${s.fresh ? `<span class="sq-badge" aria-label="${s.fresh} new">${s.fresh}</span>` : ""}
      </button>
    </div>`;
  }
  // Kept for the desktop list (one squad open beside it)
  const squadCard = squadRow;
  function squadList() {
    const list = squadsOf();
    const order = [...list].sort((a, b) => activity(b) - activity(a));
    const [top, ...rest] = order;
    return `<div class="tb-head row sq-head"><h1 class="dx-title">${esc(L("Your"))}<br>${esc(L("squads"))}</h1>
        <button class="icon-btn sq-add" data-act="newSquad" aria-label="New squad">${icon("plus")}</button></div>
      <div class="stack sq-list" style="gap:10px">
        ${list.length ? `${squadsDesk() ? order.map(squadCard).join("") : squadHero(top) + rest.map(squadRow).join("")}` : `<div class="tb-empty"><p class="tb-t">Make your first squad</p><p class="tb-s">Squads are the friends you go out with. Each one gets its own chat and plans.</p>${tbtn("Make a squad", { "data-act": "newSquad" }, "v", "plus")}<a class="tb-btn o" href="/sk">Start a plan with anyone</a></div>`}
      </div>`;
  }
  // One squad: members in the header, one "what's next" state (a live call, the next plan, the open vote, or nothing
  // yet), the chat, and one button: Plan a night with <squad>
  function whatsNext(s) {
    const next = s.next && ev(s.next);
    const opts = s.options.map((o) => ({ ...o, e: ev(o.id) })).filter((o) => o.e);
    const hasVotes = opts.some((o) => o.voters.length);
    const suits = s.themes.length ? `${s.themes.slice(0, 2).join(" and ")} suit${s.themes.length === 1 ? "s" : ""} ${s.names.length > 1 ? `all ${s.names.length + 1} of you` : "you both"}.` : "Start a plan and Sidekick finds something for everyone.";
    if (next) return `<button class="sq-next" data-act="openQuest" data-arg="${next.id}"><span class="dx-mono">${s.locked === next.id ? "Locked in" : "Next up"}</span>
        <span class="sq-next-t">${esc(next.title)}</span><span class="tb-s">${esc([dayLabel(next.startsAt), timeLabel(next.startsAt), venueOf(next), next.going ? `${next.going} going` : ""].filter(Boolean).join(" · "))}</span></button>`;
    if (opts.length) return `<div class="sq-next vote stack" style="gap:8px"><div class="row"><span class="dx-mono">Vote open${opts.length ? ` · ${dayLabel(opts[0].e.startsAt, { weekday: "long" })}` : ""}</span>${s.closes ? pill(`Closes ${closesLabel(s.closes)}`, "pink") : ""}</div>
        ${opts.map((o) => {
          const mine = s.myVote === o.id;
          return `<div class="sq-opt"><button class="sq-opt-open" data-act="openQuest" data-arg="${o.e.id}"><span class="tb-ico ${isPlace(o.e) ? "teal" : "violet"}">${icon(isPlace(o.e) ? "pin" : "ticket")}</span>
            <span class="grow" style="min-width:0"><span class="tb-t14 ellipsis">${esc(o.e.title)}</span><span class="tb-s ellipsis">${esc([venueOf(o.e), timeLabel(o.e.startsAt)].filter(Boolean).join(" · "))}</span></span></button>
            ${stack(o.voters, "xs")}<button class="tb-btn ${mine ? "v" : "o"} sm" data-act="squadVote" data-arg="${esc(s.id)}|${o.e.id}" aria-pressed="${mine}">${mine ? `${icon("check")}<span>Voted</span>` : "<span>Vote</span>"}</button></div>`;
        }).join("")}
        ${hasVotes && !s.locked ? tbtn("Lock in the top pick", { "data-act": "squadLock", "data-arg": s.id, "data-pending": "Locking it in", "data-done": "Locked in" }, "o", "check") : ""}</div>`;
    return `<div class="sq-next none"><span class="sq-next-t">Nothing planned yet</span><span class="tb-s">${esc(suits)}</span></div>`;
  }
  function squadChat(s, { desktop = false } = {}) {
    return `<div class="stack sq-chat" id="sq-chat" style="gap:8px"><div class="row"><span class="dx-mono">Chat</span>${s.fresh ? `<span class="tb-s">${s.fresh} new</span>` : ""}</div>
        ${s.chat.length ? s.chat.slice(desktop ? -4 : -4).map((m, i, arr) => m.from === "Sidequest" ? `<p class="sq-sys">${esc(m.text)}</p>` : `<div class="sq-msg${m.from === "You" ? " me" : ""}${U().squadChatOpen === s.id && i >= arr.length - (s.fresh || 0) && m.from !== "You" ? " fresh" : ""}">${avatar(m.from === "You" ? me().name || "You" : m.from, "xs")}<span>${m.from === "You" ? "" : `<b>${esc(m.from)}</b> `}${esc(m.text)}</span></div>`).join("") : '<p class="tb-s">No messages yet.</p>'}
        <form class="sq-compose" data-act="squadChat" data-arg="${esc(s.id)}"><input data-bind="squadMsg" value="${esc(U().squadMsg || "")}" placeholder="Message ${esc(s.name)}" aria-label="Message ${esc(s.name)}"><button class="icon-btn" type="submit" aria-label="Send">${icon("send")}</button></form>
        <p class="tb-s">Private call answers (budgets, no-gos) never show here.</p></div>`;
  }
  function squadSpace(s, { desktop = false } = {}) {
    if (!s) return `<div class="tb-empty"><p class="tb-t">That squad isn't here anymore</p>${tbtn("Back to squads", { "data-go": "squads" }, "o")}</div>`;
    const plan = `<a class="tb-btn grad sq-plan-main" href="${planLink(s)}" data-plan-squad="${esc(s.id)}">Plan a night with ${esc(s.name)}</a>`;
    const more = `<div class="row start" style="gap:8px">${s.main ? tbtn("Who's in", { "data-act": "squadMembers", "data-arg": s.id }, "o", "crew") : tbtn("Leave squad", { "data-act": "leaveSquad", "data-arg": s.id }, "o", "out")}</div>`;
    if (desktop) return `<div class="sq-mid stack" style="gap:14px"><div class="row"><h2 class="tb-h2">${esc(s.name)}</h2>${faces(s, "s")}</div>${liveRow(s)}${whatsNext(s)}${plan}${more}</div>
      <div class="sq-side stack" style="gap:14px">${squadChat(s, { desktop })}</div>`;
    return `${liveRow(s)}${whatsNext(s)}${squadChat(s)}${more}`;
  }
  const squadsDesk = () => document.documentElement.dataset.layout === "desktop";
  S.squads = { role: "attendee", label: "Squads", render: () => {
    const list = squadsOf();
    if (squadsDesk() && list.length) {
      const sel = squadById(U().squad) || list[0];
      U().squad = sel.id;
      return screen(`<div class="sq-desk"><div class="sq-left">${squadList()}</div>${squadSpace(sel, { desktop: true })}</div>`, { tabbar: SQ.attendeeTabs("squads"), cls: "tb-screen" });
    }
    return screen(`<div class="tb-pad">${squadList()}</div>`, { tabbar: SQ.attendeeTabs("squads"), cls: "tb-screen" });
  } };
  S.squad = { role: "attendee", label: "Squad", render: () => {
    const s = squadById(U().squad);
    if (!s) return screen(`<div class="tb-pad">${squadSpace(null)}</div>`, { title: "Squad", tabbar: SQ.attendeeTabs("squads"), cls: "tb-screen" });
    // The squad's photo behind the top, in duotone; back and the members in the header
    return screen(`<div class="sq-top-photo" aria-hidden="true">${SQ.ph(squadPhoto(s), "sq-img")}<span class="sq-fade"></span></div>
      <div class="tb-pad stack sq-page" style="gap:14px">
        <div class="row sq-top"><button class="icon-btn raised" data-back aria-label="Back">${icon("back")}</button><span class="grow"></span>${s.main ? "" : ""}</div>
        <div class="stack" style="gap:8px;margin-top:56px">${faces(s, "s", 8)}<h1 class="dx-title">${esc(s.name)}</h1><span class="tb-s ellipsis">${esc(crewNames(s).join(", "))}</span></div>
        ${squadSpace(s)}
        ${U().squadEdit === s.id ? `<div class="stack" style="gap:8px">${lab("Who's in")}<div class="chips">${Object.keys(SQ.d.friends).map((f) => SQ.chip(f, s.members.includes(f), { "data-act": "toggleMember", "data-arg": f }, s.members.includes(f) ? "check" : "plus")).join("")}</div></div>` : ""}
      </div>`, { tabbar: SQ.attendeeTabs("squads"), cls: "tb-screen bleed", footer: `<div class="footer-bar sq-foot-bar"><a class="tb-btn grad sq-plan-main" href="${planLink(s)}" data-plan-squad="${esc(s.id)}">Plan a night with ${esc(s.name)}</a></div>` });
  } };
  S["squad-new"] = { role: "attendee", label: "New squad", render: () => {
    const d = U().newSquad || (U().newSquad = { name: "", q: "", picked: [] });
    const friends = (me().friendList || []);
    const q = d.q.trim().toLowerCase();
    const shown = friends.filter((f) => !q || [f.full, f.name, f.handle].some((x) => String(x || "").toLowerCase().includes(q)));
    const n = d.picked.length + 1;
    return screen(`<div class="tb-pad stack sq-new-form" style="gap:14px">
        <div class="row"><button class="icon-btn" data-back aria-label="Close">${icon("x")}</button><h1 class="tb-h2 grow" style="text-align:center">New squad</h1><span style="width:44px"></span></div>
        <label class="tb-field"><span>Name</span><input data-bind="newSquad.name" data-live value="${esc(d.name)}" placeholder="Thursday climbers" maxlength="40" autofocus></label>
        <div class="stack" style="gap:8px"><span class="tb-flab">Who's in?</span>
          <label class="search">${icon("search")}<input data-bind="newSquad.q" data-live value="${esc(d.q)}" placeholder="Search friends" aria-label="Search friends"></label>
          ${d.picked.length ? `<div class="chips">${d.picked.map((k) => `<button class="tb-chip on" data-act="squadPick" data-arg="${esc(k)}" aria-label="Remove ${esc(people([k])[0])}">${esc(people([k])[0])}${icon("x", "xs")}</button>`).join("")}</div>` : ""}
          <div>${shown.map((f) => `<button class="sq-pick" data-act="squadPick" data-arg="${esc(f.key)}" aria-pressed="${d.picked.includes(f.key)}">${avatar(f.name, "s")}<span class="grow">${esc(f.full || f.name)}</span><span class="checkbox${d.picked.includes(f.key) ? " on" : ""}">${d.picked.includes(f.key) ? icon("check") : ""}</span></button>`).join("") || `<p class="tb-s" style="padding:8px 0">${q ? "No friends match that." : "Add friends first, from the add-friend button on Squads."}</p>`}</div>
        </div>
        <button class="sq-invite" data-act="squadInvite">${ix("link2")}<span class="grow"><b>Invite with a link</b><span class="tb-s" style="display:block">For people not on SideQuest yet</span></span></button>
        ${tbtn(`Create squad · ${n} ${n === 1 ? "person" : "people"}`, { "data-act": "createSquad", "data-pending": "Creating", "data-done": "Made", disabled: !d.name.trim() || !d.picked.length }, "grad")}
      </div>`, { tabbar: SQ.attendeeTabs("squads"), cls: "tb-screen" });
  } };
  S.parties = { role: "attendee", label: "Squads (old link)", render: () => S.squads.render() };

  A.openSquad = (id) => {
    U().squad = id;
    U().squadEdit = null;
    return squadsDesk() ? undefined : "squad";
  };
  // "💬 2 new" on a squad card: the squad, scrolled to its chat, the new messages marked
  A.openSquadChat = (id) => {
    U().squad = id;
    U().squadEdit = null;
    U().squadChatOpen = id;
    setTimeout(() => { const c = document.getElementById("sq-chat"); if (c) c.scrollIntoView({ block: "start" }); const i = c && c.querySelector("input"); if (i) i.focus({ preventScroll: true }); }, 30);
    return squadsDesk() ? undefined : "squad";
  };
  A.newSquad = () => {
    U().newSquad = { name: "", q: "", picked: [] };
    return "squad-new";
  };
  A.squadPick = (key) => {
    const d = U().newSquad;
    d.picked = d.picked.includes(key) ? d.picked.filter((k) => k !== key) : [...d.picked, key];
  };
  A.squadInvite = async () => {
    const link = `${location.origin}/?invite=${encodeURIComponent((me().handle || "").replace(/^@/, "") || me().id)}`;
    try {
      await navigator.clipboard.writeText(link);
      SQ.toast("Invite link copied. Send it to anyone.");
    } catch {
      SQ.toast(`Invite link: ${link}`);
    }
  };
  A.createSquad = async () => {
    const d = U().newSquad;
    const r = await SQ.act("createSquad", { name: d.name, members: d.picked });
    U().squad = r.squadId;
    U().newSquad = null;
    SQ.toast(`${d.name.trim()} is ready.`);
    U().history = ["squads"];
    return squadsDesk() ? "squads" : "squad";
  };
  A.squadVote = (arg) => {
    const [squad, id] = String(arg).split("|");
    return SQ.act("vote", { eventId: Number(id), squad });
  };
  A.squadLock = async (squad) => {
    const r = await SQ.act("lockPoll", { squad });
    SQ.toast(`Locked in: ${(ev(r.eventId) || {}).title || "the top pick"}.`);
  };
  A.squadChat = async (squad) => {
    const text = (U().squadMsg || "").trim();
    if (!text) return;
    U().squadMsg = "";
    await SQ.act("partyChat", { text, squad: squad || U().squad });
  };
  A.squadMembers = (id) => {
    U().squadEdit = U().squadEdit === id ? null : id;
  };
  A.leaveSquad = async (id) => {
    if (!confirm("Leave this squad?")) return;
    await SQ.act("leaveSquad", { squad: id });
    U().squad = null;
    return "squads";
  };

  /* ===================== Sidequests: the ticket wallet (TB2-Sidequests) ===================== */
  const hostingIds = () => new Set(((me() && me().hosting) || []).map((h) => h.id));
  const hostedOf = (id) => ((me() && me().hosting) || []).find((h) => h.id === id) || { guests: 0, asking: 0, requests: [], approval: false };
  const guestsOf = (id) => hostedOf(id).guests || 0;
  const askingTxt = (id) => (hostedOf(id).asking ? ` · ${hostedOf(id).asking} asking` : "");
  const leaveBy = (e) => {
    const t = SQ.trip(e, me().origin);
    return t ? timeLabel(new Date(Date.parse(e.startsAt) - (t.minutes + 5) * 60000).toISOString()) : "";
  };
  const withNames = (e) => {
    const l = me().log[e.id] || {};
    return [...new Set([...(l.with || []), ...SQ.partyGoing(e)])];
  };
  const calBtn = (e) => `<button class="icon-btn outline tb-cal" data-act="addCal" data-arg="${e.id}" aria-label="Add ${esc(e.title)} to calendar">${ix("calAdd")}</button>`;
  // The next thing: a big ticket (violet event, teal place, amber when you're hosting)
  function bigTicket(e) {
    const host = hostingIds().has(e.id);
    const place = isPlace(e);
    const tk = SQ.ticketFor(e.id);
    const soon = soonTag(e.startsAt);
    const who = withNames(e);
    const lb = leaveBy(e);
    const kind = host ? "amber" : place ? "teal" : "violet";
    return `<div class="tk-big ticket-row ${kind}">${poster(e, "tk-img")}<span class="tk-fade" aria-hidden="true"></span>
      <button class="tk-top" data-act="openQuest" data-arg="${e.id}">
        <span class="row"><span class="row start" style="gap:6px">${host ? pill("★ Hosting", "amber") : pill("Going", kind)}${pill(place ? "Place" : "Event", kind, place ? "pin" : "ticket")}</span>${soon ? pill(soon, "green") : ""}</span>
        <span class="tk-title">${esc(e.title)}</span>
        <span class="tb-s13">${esc([dayLabel(e.startsAt), `${place ? "" : "doors "}${timeLabel(e.startsAt)}`, venueOf(e)].filter(Boolean).join(" · "))}</span></button>
      <div class="tk-bottom">
        ${host ? `<span class="tb-s13">${stack(SQ.partyGoing(e), "xs")} <b class="tb-strong">${guestsOf(e.id)} going${askingTxt(e.id)}</b></span>` : lb || who.length ? `<span class="tb-s13">${icon("walk", "sm")}${lb ? `<b class="tb-strong">Leave by ${esc(lb)}</b>` : ""}${who.length ? `${lb ? " · " : ""}with ${esc(who.slice(0, 3).join(", "))}` : ""}</span>` : ""}
        <span class="row" style="gap:8px">${host ? tbtn("Manage", { "data-act": "manageHosted", "data-arg": e.id }, "amber") : tk ? tbtn("View ticket", { "data-act": "openWalletTicket", "data-arg": tk.id }, "v") : tbtn("Details", { "data-act": "openQuest", "data-arg": e.id }, "v")}${tbtn("Add to calendar", { "data-act": "addCal", "data-arg": e.id }, "o", "calAdd")}</span>
      </div></div>`;
  }
  // The rest: a stub with a date block
  function stub(e) {
    const host = hostingIds().has(e.id);
    const place = isPlace(e);
    const kind = host ? "amber" : place ? "teal" : "violet";
    const tk = SQ.ticketFor(e.id);
    const d = new Date(e.startsAt);
    const meta = host ? [venueOf(e), `${dayLabel(e.startsAt, { month: "short", day: "numeric" })} · ${timeLabel(e.startsAt)}`] : [venueOf(e), timeLabel(e.startsAt), SQ.d.party && SQ.d.party.locked === e.id ? SQ.d.party.name : ""];
    return `<div class="tk-stub ticket-row ${kind}">${poster(e, "tk-img")}<span class="tk-fade" aria-hidden="true"></span>
      <span class="tk-date"><small>${esc(d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ }).toUpperCase())}</small><b>${esc(d.toLocaleDateString("en-US", { day: "numeric", timeZone: TZ }))}</b></span>
      <button class="tk-body" data-act="openQuest" data-arg="${e.id}"><span class="row start" style="gap:6px">${host ? pill("★ Hosting", "amber") : pill("Going", kind)}${host ? "" : pill(place ? "Place" : "Event", kind, place ? "pin" : "ticket")}</span>
        <span class="tb-t14 ellipsis">${esc(e.title)}</span><span class="tb-s ellipsis">${esc(meta.filter(Boolean).join(" · "))}</span>
        ${host ? `<span class="tb-s row start" style="gap:6px">${stack(SQ.partyGoing(e), "xs")}<span class="tb-strong">${guestsOf(e.id)} going${askingTxt(e.id)}</span></span>` : ""}</button>
      <span class="tk-acts">${host ? tbtn("Manage", { "data-act": "manageHosted", "data-arg": e.id }, "amber sm") : tk ? tbtn("View ticket", { "data-act": "openWalletTicket", "data-arg": tk.id }, "v sm") : ""}${calBtn(e)}</span>
    </div>`;
  }
  const stars = (n) => `<span class="tb-stars" aria-label="${n} of 5 stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
  function yourEvents() {
    const u = me();
    const host = hostingIds();
    const entries = Object.entries(u.log).map(([id, l]) => ({ e: ev(id), l })).filter((x) => x.e);
    const up = [...new Map([...entries.filter((x) => x.l.status === "going" && !SQ.isPast(x.e)).map((x) => x.e), ...[...host].map(ev).filter((e) => e && !SQ.isPast(e))].map((e) => [e.id, e])).values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const loose = SQ.unlinkedTickets();
    const ask = entries.filter((x) => x.l.status === "going" && SQ.isPast(x.e));
    const done = entries.filter((x) => x.l.status === "went" || x.l.status === "missed").sort((a, b) => b.e.startsAt.localeCompare(a.e.startsAt)).slice(0, 6);
    let out = "";
    if (!up.length && !loose.length) out += `<div class="tb-empty"><p class="tb-t">No sidequests coming up yet</p><p class="tb-s">Tickets you're going to and events you host show up here.</p>${btn("Find a sidequest", { "data-go": "discover" }, "secondary m", "search")}</div>${pickedForYou()}`;
    else {
      const [first, ...rest] = up;
      out += first ? bigTicket(first) : "";
      out += rest.map(stub).join("");
      out += loose.map((t) => SQ.unlinkedRow(t)).join("");
    }
    if (ask.length || done.length) {
      out += `<div class="stack" style="gap:10px;margin-top:10px">${lab("Earlier")}
        ${ask.map(({ e }) => `<div class="tb-card stack" style="gap:8px"><span class="row start" style="gap:12px">${poster(e, "tb-thumb")}<span class="grow" style="min-width:0"><span class="tb-t14 ellipsis">${esc(e.title)}</span><span class="tb-s">${esc(dayLabel(e.startsAt))}</span></span></span>
          <span class="tb-t14">Did you go?</span><span class="tb-s">Only nights you really went count toward your stats.</span>
          <div class="row" style="gap:8px">${tbtn("Yes, I went", { "data-act": "didGo", "data-arg": e.id }, "v")}${tbtn("No", { "data-act": "didntGo", "data-arg": e.id }, "o")}</div></div>`).join("")}
        ${done.map(({ e, l }) => `<button class="tb-row" data-act="${l.status === "went" && !l.rating ? "openRate" : "openMemory"}" data-arg="${e.id}">${poster(e, "tb-thumb")}<span class="grow" style="min-width:0"><span class="tb-t14 ellipsis">${esc(e.title)}</span><span class="tb-s">${esc(dayLabel(e.startsAt))}</span>
          ${l.status === "missed" ? '<span class="tb-s">Didn\'t go</span>' : l.rating ? stars(l.rating) : pill("Rate it", "amberText", "star")}</span>${icon("chevR")}</button>`).join("")}
        <button class="tb-link" data-go="stats" style="align-self:flex-start">Your nights out are in Stats</button></div>`;
    }
    return out;
  }
  // The empty state's For you picks: this week's best matches, as small ticket posters
  function pickedForYou() {
    const u = me();
    const soon = SQ.d.events.filter((e) => SQ.pick(e) && !e.over && !SQ.isPast(e) && !u.log[e.id] && !u.notForMe.includes(e.id) && Date.parse(e.startsAt) - SQ.now().getTime() < 7 * 86400000)
      .sort((a, b) => SQ.pick(b).match - SQ.pick(a).match);
    const gs = SQ.groupShows ? SQ.groupShows(soon).slice(0, 6) : [];
    if (!gs.length) return "";
    return `<div class="stack sq-picked" style="gap:8px"><span class="dx-mono">Picked for you</span><div class="lx-cards dx-rail hscroll" role="list" aria-label="Picked for you">${gs.map((g) => SQ.evPoster(g)).join("")}</div></div>`;
  }
  function savedTab() {
    const u = me();
    const saved = u.saved.map(ev).filter((e) => e && !u.log[e.id] && !SQ.isPast(e)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (!saved.length) return `<div class="tb-empty"><p class="tb-t">Nothing saved yet</p><p class="tb-s">Tap the bookmark on any event or place and it waits here, with a way to plan it. Your saved places live here too.</p></div>${pickedForYou()}`;
    const card = (e) => {
      const place = isPlace(e);
      const friends = (e.friends || []).slice(0, 2);
      return `<div class="tb-card stack" style="gap:8px"><div class="row start" style="gap:12px"><span class="tb-ico ${place ? "teal" : "violet"}">${icon(place ? "pin" : "ticket")}</span>
          <button class="grow tb-plain" data-act="openQuest" data-arg="${e.id}" style="min-width:0"><span class="tb-t14 ellipsis">${esc(e.title)}</span><span class="tb-s ellipsis">${esc([dayLabel(e.startsAt), timeLabel(e.startsAt), venueOf(e), SQ.priceLabel(e) === "N/A" ? "" : SQ.priceLabel(e)].filter(Boolean).join(" · "))}</span></button>
          <button class="icon-btn ghost" data-act="save" data-arg="${e.id}" aria-label="Remove ${esc(e.title)} from saved" aria-pressed="true">${icon("bookmarkFill")}</button></div>
        <span class="tb-s">Saved${friends.length ? ` · ${esc(friends.join(" and "))} ${friends.length > 1 ? "are" : "is"} going` : ""}</span>
        <div class="row" style="gap:8px"><a class="tb-btn ${place ? "t" : "v"}" href="/sk?pick=${e.id}">Plan it</a>${tbtn("Calendar", { "data-act": "addCal", "data-arg": e.id }, "o", "calAdd")}${SQ.listBtn(e, "outline")}</div></div>`;
    };
    const wk = saved.filter(SQ.isWeekend);
    const later = saved.filter((e) => !SQ.isWeekend(e));
    return `${wk.length ? lab("This weekend", ' style="color:var(--text-accent)"') + wk.map(card).join("") : ""}${later.length ? lab("Later", ' style="color:var(--text-accent)"') + later.map(card).join("") : ""}`;
  }
  function requestsTab() {
    const u = me();
    const mine = SQ.d.requests.filter((r) => u.myRequests.includes(r.id) || u.votedRequests.includes(r.id));
    const near = SQ.d.requests.filter((r) => !u.myRequests.includes(r.id) && r.status === "open").slice(0, 5);
    const meta = (r) => [r.when, r.budget != null ? (r.budget ? `under $${r.budget}` : "free") : "", `${r.votes} ${r.votes === 1 ? "person wants" : "people want"} this`].filter(Boolean).join(" · ");
    const card = (r) => {
      const replied = r.status !== "open";
      const e = r.eventId && ev(r.eventId);
      return `<div class="tb-card stack ${replied ? "teal-edge" : ""}" style="gap:8px"><div class="row"><span class="tb-t14">${esc(r.text)}</span>${replied ? pill(r.status === "live" ? "A host replied" : "A host is on it", "teal") : pill("Waiting", "dim")}</div>
        <span class="tb-s">${esc(meta(r))}${!replied ? " · no host yet" : ""}</span>
        ${e ? `<div class="tb-reply"><b class="tb-strong">${esc(r.claimedBy || e.organizer.name)}</b> can do ${esc(dayLabel(e.startsAt))}, ${esc(timeLabel(e.startsAt))}${e.price != null ? `, ${esc(SQ.priceLabel(e))}` : ""}</div>
          <div class="row" style="gap:8px">${tbtn("See the event", { "data-act": "openQuest", "data-arg": e.id }, "t")}${tbtn("Calendar", { "data-act": "addCal", "data-arg": e.id }, "o", "calAdd")}</div>` : r.status === "claimed" ? `<span class="tb-s">${esc(r.claimedBy)} is planning it. You'll hear first.</span>` : ""}</div>`;
    };
    return `<p class="tb-s13">Things you asked hosts for. Hosts see the ask, not who you are.</p>
      ${mine.length ? mine.map(card).join("") : '<p class="tb-s">You haven\'t asked for anything yet.</p>'}
      ${near.length ? lab("Asked near you", ' style="color:var(--text-accent)"') + near.map((r) => {
        const on = u.votedRequests.includes(r.id);
        return `<div class="tb-row static"><span class="tb-ico violet">${icon("ticket")}</span><span class="grow" style="min-width:0"><span class="tb-t14 ellipsis">${esc(r.text)}</span><span class="tb-s">${r.votes} want this</span></span><button class="tb-btn ${on ? "v" : "o"} sm" data-act="upvote" data-arg="${r.id}" aria-pressed="${on}" aria-label="${on ? "You want this too" : `Add your +1 to ${esc(r.text)}`}">${on ? icon("check") : "<span>+1</span>"}</button></div>`;
      }).join("") : ""}
      ${tbtn("Ask for something", { "data-act": "newRequest" }, "o")}`;
  }
  S.questlog = { role: "attendee", label: "Sidequests", render: () => {
    const u = me();
    // "Invites" was "Requests" (friend requests live in Your Sidequesters now); the old name still opens it
    const tab = U().sqTab === "requests" ? "invites" : ["events", "saved", "invites"].includes(U().sqTab) ? U().sqTab : "events";
    const reqN = u.myRequests.length;
    const savedN = u.saved.map(ev).filter((e) => e && !u.log[e.id] && !SQ.isPast(e)).length;
    const segs = [["events", "Your events"], ["saved", `Saved${savedN ? ` ${savedN}` : ""}`], ["invites", `Invites${reqN ? ` ${reqN}` : ""}`]];
    const body = tab === "saved" ? savedTab() : tab === "invites" ? requestsTab() : yourEvents();
    return screen(`<div class="tb-pad stack" style="gap:12px">
        <div class="tb-head row"><h1 class="dx-title">Side&shy;quests</h1>${u.demo ? "" : tbtn("Add event", { "data-act": "addEvent", "aria-label": "Add event" }, "v add", "plus")}</div>
        <div class="tb-seg" role="tablist" aria-label="Sidequests">${segs.map(([k, label]) => `<button role="tab" class="${tab === k ? "on" : ""}" data-act="sqTab" data-arg="${k}" aria-selected="${tab === k}" aria-pressed="${tab === k}">${esc(label)}</button>`).join("")}</div>
        <div class="stack sq-wallet" style="gap:10px">${body}</div>
      </div>`, { tabbar: SQ.attendeeTabs("questlog"), cls: "tb-screen" });
  } };
  A.sqTab = (t) => {
    U().sqTab = t;
  };
  // Manage a hosted event: guests, calendar, a message to guests, and edit (for events published from a host account)
  S["host-manage"] = { role: "attendee", label: "Manage a hosted event", render: () => {
    const e = ev(U().quest);
    if (!e) return screen(`<div class="tb-pad">${SQ.empty("ticket", "That event isn't on SideQuest anymore.")}</div>`, { title: "Manage" });
    const guests = guestsOf(e.id);
    const chat = (SQ.d.eventChat[e.id] || []).slice(-3);
    const canEdit = SQ.d.host && e.publishedBy === SQ.d.host.id;
    return screen(`<div class="tb-pad stack" style="gap:14px">
        <div class="row start" style="gap:10px;flex-wrap:wrap"><h1 class="tb-h2">${esc(e.title)}</h1>${pill("★ Hosting", "amber")}</div>
        <p class="tb-s13">${esc([dayLabel(e.startsAt), timeLabel(e.startsAt), venueOf(e), SQ.priceLabel(e) === "N/A" ? "" : SQ.priceLabel(e), "added by you"].filter(Boolean).join(" · "))}</p>
        <div class="row" style="gap:8px">${tbtn("Calendar", { "data-act": "addCal", "data-arg": e.id }, "o", "calAdd")}${canEdit ? tbtn("Edit event", { "data-act": "editQuest", "data-arg": e.id }, "amber") : tbtn("Open the listing", { "data-act": "openQuest", "data-arg": e.id }, "amber")}</div>
        <div class="tb-card stack" style="gap:6px">${lab(`Going · ${guests}`, ' style="color:var(--amber)"')}<span class="row start" style="gap:8px">${stack(SQ.partyGoing(e), "s")}<span class="tb-s">${guests ? `${guests} ${guests === 1 ? "person has" : "people have"} said they're going.` : "Nobody has said they're going yet. Share the link."}</span></span></div>
        ${joinCard(e)}
        <div class="tb-card stack" style="gap:8px">${lab("Message guests", ' style="color:var(--amber)"')}
          ${chat.map((m) => `<p class="tb-s"><b class="tb-strong">${esc(m.from)}:</b> ${esc(m.text)}</p>`).join("")}
          <form class="sq-compose" data-act="hostedMessage"><input data-bind="eventMsg" value="${esc(U().eventMsg || "")}" placeholder="Post an update to guests" aria-label="Post an update to guests"><button class="icon-btn" type="submit" aria-label="Send">${icon("send")}</button></form></div>
        ${tbtn("Copy the event link", { "data-act": "copyLink", "data-arg": e.id }, "o", "link2")}
      </div>`, { title: "Manage", cls: "tb-screen" });
  } };
  // Asking to join: the host's switch, then each request with Accept and Decline (pink: reply before it starts)
  function joinCard(e) {
    const h = hostedOf(e.id);
    const asking = (h.requests || []).filter((r) => r.status === "asking");
    const done = (h.requests || []).filter((r) => r.status !== "asking");
    const replyBy = new Date(Date.parse(e.startsAt) - 3 * 3600000).toISOString();
    const row = (r) => `<div class="mg-ask"><span class="row start grow" style="gap:10px;min-width:0">${avatar(r.name, "s")}<span class="tb-t14 ellipsis">${esc(r.name)}</span></span>
        ${tbtn("Accept", { "data-act": "joinDecide", "data-arg": `${e.id}|${r.userId}|1`, "aria-label": `Accept ${r.name}`, "data-pending": "Accepting" }, "v sm")}${tbtn("Decline", { "data-act": "joinDecide", "data-arg": `${e.id}|${r.userId}|0`, "aria-label": `Decline ${r.name}`, "data-pending": "Declining" }, "o sm")}</div>`;
    const body = !h.approval ? '<p class="tb-s">Off: anyone can tap I\'m going. Turn it on and people ask first; you say yes or no here.</p>'
      : asking.length ? asking.map(row).join("") : '<p class="tb-s">No one is asking to join right now. Requests show up here with Accept and Decline.</p>';
    const decided = done.length ? `<p class="tb-s">${esc([done.filter((r) => r.status === "approved").map((r) => r.name).join(", ") ? `In: ${done.filter((r) => r.status === "approved").map((r) => r.name).join(", ")}` : "", done.filter((r) => r.status === "declined").length ? `Declined: ${done.filter((r) => r.status === "declined").map((r) => r.name).join(", ")}` : ""].filter(Boolean).join(" · "))}</p>` : "";
    return `<div class="tb-card stack" style="gap:8px"><div class="row">${lab(`Asking to join${asking.length ? ` · ${asking.length}` : ""}`, ' style="color:var(--amber)"')}${asking.length && !SQ.isPast(e) ? pill(`Reply by ${dayLabel(replyBy, { weekday: "short" })} ${timeLabel(replyBy)}`, "pink") : ""}</div>
      ${sw("Guests need my OK", "People ask to join, and you choose", !!h.approval, { "data-act": "hostApproval", "data-arg": `${e.id}|${h.approval ? 0 : 1}` })}
      ${body}${decided}</div>`;
  }
  A.hostApproval = async (arg) => {
    const [id, on] = String(arg).split("|");
    const r = await SQ.act("hostApproval", { eventId: Number(id), on: on === "1" });
    SQ.toast(r.label);
  };
  A.joinDecide = async (arg) => {
    const [id, userId, yes] = String(arg).split("|");
    const r = await SQ.act("joinDecide", { eventId: Number(id), userId, approve: yes === "1" });
    SQ.toast(r.label);
  };
  // On the event page: "Ask to join" in place of I'm going, when the host approves guests (screens-attendee.js)
  SQ.joinCta = (e, logged) => {
    if (!e || !e.approval || logged || SQ.isPast(e) || hostingIds().has(e.id) || !me()) return "";
    const st = (me().joins || {})[e.id];
    if (st === "asking") return `<span class="grow stack" style="gap:2px;min-width:0"><b class="tb-t14">Asked to join</b><span class="tb-s">The host will say yes or no. You'll get a notification.</span></span>${tbtn("Take back", { "data-act": "cancelJoin", "data-arg": e.id, "data-pending": "Taking back" }, "o sm")}`;
    if (st === "declined") return `<span class="grow tb-s13">The host couldn't fit you in this time.</span>`;
    return `<span class="grow stack" style="gap:2px;min-width:0"><b class="tb-t14">The host approves guests</b><span class="tb-s">Ask, and you'll hear back here.</span></span>${tbtn("Ask to join", { "data-act": "askJoin", "data-arg": e.id, "data-pending": "Asking", "data-done": "Asked" }, "v", "userPlus")}`;
  };
  A.askJoin = async (id) => {
    const r = await SQ.act("askJoin", { eventId: Number(id) });
    SQ.toast(r.label);
  };
  A.cancelJoin = async (id) => {
    const r = await SQ.act("cancelJoin", { eventId: Number(id) });
    SQ.toast(r.label);
  };
  A.manageHosted = (id) => {
    U().quest = Number(id);
    return "host-manage";
  };
  A.hostedMessage = async () => {
    const text = (U().eventMsg || "").trim();
    if (!text) return;
    U().eventMsg = "";
    await SQ.act("eventChat", { eventId: U().quest, text, channel: "general" });
    SQ.toast("Posted to your guests.");
  };

  /* ===================== Profile (TB3, D1 "Bento") ===================== */
  const meAv = (u, cls = "l") => (u.photo ? `<span class="av ${cls} photo-av" style="background-image:url('${u.photo}')" role="img" aria-label="Your photo"></span>` : `<span class="av ${cls}">${esc((u.name || "You")[0].toUpperCase())}</span>`);
  const handleOf = (u) => u.handle || `@${String(u.name || "you").toLowerCase().replace(/[^a-z0-9]+/g, ".")}`;
  const SEE = { everyone: "Everyone", friends: "Friends", squads: "Your squads", nobody: "Only you" };
  const settingValue = {
    notifications: (s) => {
      const n = s.notifications;
      const on = ["plans", "squads", "requests", "hosts"].filter((k) => n[k]).length;
      const t = (x) => { const [h, m] = x.split(":").map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`; };
      return `${on} on${n.quiet ? ` · quiet ${t(n.quietFrom)}–${t(n.quietTo)}` : ""}`;
    },
    privacy: (s) => `${SEE[s.privacy.seeGoing]} see your plans`,
    calendar: (s) => ({ ask: "Ask each time", google: "Google Calendar", apple: "Apple Calendar", outlook: "Outlook" })[s.calendar.app] + ` · remind ${({ none: "never", "1h": "1 hour before", "2h": "2 hours before", "1d": "a day before" })[s.calendar.reminder]}`,
    display: (s) => `Dark · ${s.display.textSize === "large" ? "large text" : "default text"}${s.display.captions ? " · captions on" : ""}`,
    language: (s) => (s.language === "fr" ? "Français" : "English"),
    help: () => "Version 2.0",
  };
  const ALL_GROUPS = [
    ["notifications", "Notifications", "bell", "iv"], ["privacy", "Privacy and data", "shield", "it"], ["calendar", "Calendar", "cal", "ia"],
    ["display", "Display and accessibility", "eye", "in"], ["language", "Language", "globe", "in"], ["help", "Help, feedback and terms", "help", "in"],
  ];
  const GROUPS = ALL_GROUPS.filter((g) => LANGUAGE_ON || g[0] !== "language");
  const settingCard = ([k, title, ic, tone]) => `<button class="pf-set" data-act="openSettings" data-arg="${k}"><span class="tb-sq ${tone}">${ix(ic)}</span><span class="grow" style="min-width:0"><span class="tb-t14">${esc(L(title))}</span><span class="tb-s ellipsis">${esc(settingValue[k](me().settings))}</span></span>${icon("chevR")}</button>`;
  function statsCard(st) {
    const s = st.season;
    const months = s.months;
    const max = Math.max(1, ...months.map((m) => m.n));
    return `<button class="pf-card stats" data-go="stats"><span class="row"><span class="tb-t16">Stats</span>${icon("chevR")}</span>
      <span class="tb-s13">${s.nights ? `${s.nights} night${s.nights === 1 ? "" : "s"} out this ${st.seasonName}${s.busiest ? ", your busiest season yet" : ""}` : `No confirmed nights out this ${st.seasonName} yet`}</span>
      <span class="pf-mini-bars" aria-hidden="true">${months.map((m) => `<i style="height:${Math.round(8 + (36 * m.n) / max)}px" class="${m.top ? "top" : ""}"></i>`).join("")}</span></button>`;
  }
  function tasteCard(tp) {
    const top = tp.donut.slice(0, 3);
    return `<button class="pf-card taste" data-go="taste"><span class="row"><span class="tb-t16">Taste</span>${icon("chevR")}</span>
      <span class="row start" style="gap:12px">${SQ.donutSvg ? SQ.donutSvg(tp.donut, 64, tp.counts.nights, "nights") : ""}<span class="stack" style="gap:4px;min-width:0">${top.map((d, i) => `<span class="tb-s row start" style="gap:6px"><i class="tb-dot c${i}"></i><span class="ellipsis">${esc(d.vibe)}</span></span>`).join("") || '<span class="tb-s">Pick a few vibes to start.</span>'}</span></span></button>`;
  }
  // The taste aura: a soft glow behind your photo, in the token tints of your top vibes (violet for music, pink for
  // comedy and dance, teal for social and outdoors, amber for food and markets, green for wellness)
  const AURA = [[/music|jazz|gigs|records|electronic|film/i, "var(--action-primary-tint)"], [/comedy|dance|anime/i, "var(--hot-tint)"], [/games|outdoors|run|climbing|tech|photo/i, "var(--social-tint)"], [/food|markets|zines|art|writing/i, "var(--status-warning-tint)"], [/wellness/i, "var(--status-success-tint)"]];
  const auraTint = (v) => (AURA.find(([re]) => re.test(v)) || [, "var(--action-primary-tint)"])[1];
  function auraOf(vibes) {
    const tints = (vibes.length ? vibes : ["Live music"]).slice(0, 3).map(auraTint);
    const n = tints.length;
    const stops = tints.map((t, i) => `${t} ${Math.round((i * 100) / n)}% ${Math.round(((i + 1) * 100) / n)}%`).join(", ");
    return `conic-gradient(from 200deg, ${stops})`;
  }
  SQ.auraOf = auraOf;
  S.profile = { role: "attendee", label: "Profile", render: () => {
    const u = me();
    const st = u.stats;
    const tp = u.tastePage;
    const since = new Date(u.createdAt || SQ.now()).toLocaleDateString("en-US", { month: "long", timeZone: TZ });
    const nightsAll = st.days.length;
    const friendsN = (u.friendList || []).length;
    const reqs = (u.friendRequests || []).length;
    const top = tp.donut.slice(0, 3).map((d) => d.vibe);
    const vibes = top.length ? top : (u.vibes || []).slice(0, 3);
    const unread = u.notifications.filter((n) => !n.read).length;
    const earned = st.badges.filter((b) => b.earned).length;
    const head = `<div class="pf-head">
        <div class="row pf-icons"><button class="icon-btn raised" data-go="settings-home" aria-label="Settings">${icon("settings")}</button>
          <button class="icon-btn raised pf-bell" data-go="notifications" aria-label="Notifications${unread ? `, ${unread} new` : ""}">${icon("bell")}${unread ? `<span class="count-badge">${unread}</span>` : ""}</button></div>
        <div class="pf-id">${meAv(u, "xl")}
          <h1 class="pf-name">${esc(u.name || "You")}</h1>
          <span class="tb-s13">${esc(`${handleOf(u)} · out since ${since}`)}</span>
          ${vibes.length ? `<span class="dx-mono pf-vibes">${esc(vibes.join(" · "))}</span>` : ""}${u.demo ? pill("Demo", "line") : ""}</div></div>`;
    // Stats in one row
    const strip = `<div class="pf-strip pf-stat3" role="list">
        <div role="listitem"><b class="pf-big">${nightsAll}</b><span class="tb-s">${esc(L("Nights out"))}</span></div>
        <div role="listitem"><b class="pf-big">${friendsN}</b><span class="tb-s">Sidequesters</span></div>
        <div role="listitem"><b class="pf-big">${st.stamps.length}</b><span class="tb-s">new places</span></div></div>`;
    const item = (label, sub, a) => `<button class="pf-mi" ${SQ.attr(a)}><span class="grow">${esc(label)}</span><span class="pf-mi-sub">${sub}</span>${icon("chevR")}</button>`;
    const menu = `<nav class="pf-menu" aria-label="Profile">
        ${item("Your Sidequesters", reqs ? `<span class="pf-req">${reqs} request${reqs === 1 ? "" : "s"}</span>` : esc(String(friendsN)), { "data-act": "openFriends", "aria-label": `Your Sidequesters, ${friendsN}${reqs ? `, ${reqs} friend request${reqs === 1 ? "" : "s"}` : ""}` })}
        ${item("Your taste", tp.actions ? `${tp.actions} signal${tp.actions === 1 ? "" : "s"}` : "Tune it", { "data-go": "taste" })}
        ${item("Night passport", earned ? `${earned} stamp${earned === 1 ? "" : "s"}` : "None yet", { "data-go": "night-passport" })}
        ${item("Stats", st.season.nights ? `${st.season.nights} this ${esc(st.seasonName)}` : "", { "data-go": "stats" })}
        ${item("Settings", "", { "data-go": "settings-home" })}
      </nav>`;
    const bottom = `<div class="pf-bottom">${tbtn(u.demo ? L("Exit demo") : L("Log out"), { "data-act": "signOut" }, "o", "out")}${tbtn(L("Edit profile"), { "data-act": "editProfile" }, "o grow")}
      <button class="tb-danger" data-go="delete-account" aria-label="${esc(L("Delete account"))}" title="${esc(L("Delete account"))}">${ix("warn")}</button></div>`;
    return screen(`<div class="pf-aura" style="background:${auraOf(vibes)}" aria-hidden="true"></div><div class="tb-pad pf">
        ${head}${strip}${menu}${bottom}
        <p class="tb-s" style="text-align:center">Matching: ${esc(SQ.aiLabel(SQ.d.mode))}</p>
      </div>`, { tabbar: SQ.attendeeTabs("profile"), cls: "tb-screen pf-screen" });
  } };
  // Settings, from Profile's ⚙ and its menu: the groups, each with what it's set to now
  S["settings-home"] = { role: "attendee", label: "Settings", render: () => screen(`<div class="tb-pad stack" style="gap:14px">
      <div class="stack" style="gap:8px">${lab(L("Account"))}${GROUPS.slice(0, 3).map(settingCard).join("")}</div>
      <div class="stack" style="gap:8px">${lab(L("App"))}${GROUPS.slice(3).map(settingCard).join("")}</div>
    </div>`, { title: "Settings", tabbar: SQ.attendeeTabs("profile"), cls: "tb-screen" }) };
  // Night passport: the badges as stamps (earned ones inked, the rest faint, with how to get them), then a stamp for
  // every venue of a confirmed night out
  S["night-passport"] = { role: "attendee", label: "Night passport", render: () => {
    const st = me().stats;
    const tones = ["s1", "s2", "s3"];
    const stamps = st.badges.map((b, i) => `<div class="np-stamp ${b.earned ? tones[i % 3] : "off"}" role="listitem" aria-label="${esc(`${b.name}: ${b.earned ? "earned" : b.how}`)}"><span>${esc(b.name)}</span></div>`).join("");
    const venues = st.stamps;
    return screen(`<div class="tb-pad stack" style="gap:16px">
        <p class="tb-s13">A stamp for each thing you've done on a night out. They never expire.</p>
        <div class="np-grid" role="list">${stamps}</div>
        <div class="stack" style="gap:8px">${lab("Venues")}
          ${venues.length ? `<div class="pp-grid">${venues.map((s) => `<div class="pp-stamp ${s.kind}"><b class="tb-t14">${esc(s.venue)}</b><span class="tb-s">${esc([s.hood].filter(Boolean).join(" · "))}</span></div>`).join("")}</div>` : '<p class="tb-s">Your first venue stamp comes with your first confirmed night out.</p>'}</div>
      </div>`, { title: "Night passport", tabbar: SQ.attendeeTabs("profile"), cls: "tb-screen" });
  } };

  // ---------- Settings (one screen per group, each control saved on the account) ----------
  const opt = (label, on, a) => `<button class="tb-chip${on ? " on" : ""}" aria-pressed="${on}" ${SQ.attr(a)}>${on ? icon("check", "xs") : ""}${esc(label)}</button>`;
  const sw = (label, sub, on, a) => `<button class="tb-switch-row" role="switch" aria-checked="${on}" ${SQ.attr(a)}><span class="grow" style="min-width:0"><span class="tb-t14">${esc(label)}</span>${sub ? `<span class="tb-s">${esc(sub)}</span>` : ""}</span><span class="toggle${on ? " on" : ""}" aria-hidden="true"></span></button>`;
  const set = (path, value) => `${path}=${JSON.stringify(value)}`;
  const group = (title, inner, note = "") => `<div class="tb-card stack" style="gap:10px"><span class="tb-t14">${esc(title)}</span>${inner}${note ? `<span class="tb-s">${esc(note)}</span>` : ""}</div>`;
  // Notifications held back by quiet hours: in the inbox, no badge; they arrive when quiet hours end
  const heldNote = () => {
    const held = (me().notifications || []).filter((n) => n.held);
    if (!held.length) return "";
    const at = held.map((n) => n.deliverAt).sort()[0];
    return `<p class="tb-s13 qh-held" role="status">${ix("moon")}${held.length} notification${held.length === 1 ? "" : "s"} waiting in your inbox, no badge. ${held.length === 1 ? "It arrives" : "They arrive"} at ${esc(timeLabel(at))}.</p>`;
  };
  const SETTINGS = {
    notifications: (s) => {
      const n = s.notifications;
      return `${group("What we tell you about", [["plans", "Plans and tickets", "Changes to things you're going to"], ["squads", "Squad votes and chat", "Votes, deadlines and messages"], ["requests", "Request replies", "When a host answers something you asked for"], ["hosts", "Hosts you follow", "Their new events"]].map(([k, l, sub]) => sw(l, sub, n[k], { "data-act": "setSetting", "data-arg": set(`notifications.${k}`, !n[k]) })).join(""))}
        ${group("Quiet hours", `${sw("Quiet hours", "Nothing buzzes in this window", n.quiet, { "data-act": "setSetting", "data-arg": set("notifications.quiet", !n.quiet) })}
          ${heldNote()}
          ${n.quiet ? `<div class="row" style="gap:10px"><label class="tb-field grow"><span>From</span><input type="time" value="${esc(n.quietFrom)}" data-change="setQuiet" data-key="quietFrom" aria-label="Quiet from"></label><label class="tb-field grow"><span>To</span><input type="time" value="${esc(n.quietTo)}" data-change="setQuiet" data-key="quietTo" aria-label="Quiet until"></label></div>` : ""}`)}`;
    },
    privacy: (s) => {
      const p = s.privacy;
      const choice = (k, list) => `<div class="chips">${list.map(([v, l]) => opt(l, p[k] === v, { "data-act": "setSetting", "data-arg": set(`privacy.${k}`, v) })).join("")}</div>`;
      const friends = (me().friendList || []).filter((f) => !p.blocked.includes(f.key));
      return `${group("Who sees what you're going to", choice("seeGoing", [["everyone", "Everyone"], ["friends", "Friends"], ["squads", "Your squads"], ["nobody", "Only you"]]))}
        ${group("Who sees what you're hosting", choice("seeHosting", [["everyone", "Everyone"], ["friends", "Friends"], ["nobody", "Only you"]]))}
        ${group("Who can add you to squads", choice("squadAdd", [["friends", "Friends"], ["anyone", "Anyone"], ["nobody", "Nobody"]]))}
        ${group("Blocked people", `${p.blocked.length ? p.blocked.map((k) => `<div class="row"><span class="tb-t14">${esc(people([k])[0])}</span>${tbtn("Unblock", { "data-act": "setSetting", "data-arg": set("privacy.unblock", k) }, "o sm")}</div>`).join("") : '<p class="tb-s">Nobody blocked.</p>'}
          ${friends.length ? `<details class="tb-details"><summary>Block someone</summary><div class="chips" style="margin-top:8px">${friends.map((f) => opt(f.name, false, { "data-act": "setSetting", "data-arg": set("privacy.block", f.key) })).join("")}</div></details>` : ""}`, "Blocked people can't add you to squads or see your plans.")}
        ${group("Your data", `${tbtn("Download your data", { "data-act": "downloadData", "data-pending": "Getting it ready", "data-done": "Downloaded" }, "o", "download")}
          ${tbtn("Delete call history", { "data-act": "deleteCalls", "data-pending": "Deleting", "data-done": "Deleted" }, "o", "x")}
          <p class="tb-s13 tb-strong">SideQuest doesn't save your location.</p>`, "Your data is a JSON file of everything stored about your account.")}`;
    },
    calendar: (s) => {
      const c = s.calendar;
      return `${group("Add to calendar opens", `<div class="chips">${[["ask", "Ask each time"], ["google", "Google"], ["apple", "Apple"], ["outlook", "Outlook"]].map(([v, l]) => opt(l, c.app === v, { "data-act": "setSetting", "data-arg": set("calendar.app", v) })).join("")}</div>`, ({ ask: "Add to calendar asks which app each time.", google: "Add to calendar opens Google Calendar with the event filled in.", apple: "Add to calendar downloads a .ics file, which Apple Calendar opens.", outlook: "Add to calendar opens Outlook on the web with the event filled in." })[c.app])}
        ${group("Reminder (Apple and .ics)", `<div class="chips">${[["none", "None"], ["1h", "1 hour"], ["2h", "2 hours"], ["1d", "1 day"]].map(([v, l]) => opt(l, c.reminder === v, { "data-act": "setSetting", "data-arg": set("calendar.reminder", v) })).join("")}</div>`)}`;
    },
    display: (s) => {
      const d = s.display;
      return `${group("Theme", `<div class="chips">${opt("Dark", true, { "data-act": "setSetting", "data-arg": set("display.theme", "dark") })}</div>`, "Dark is the only theme for now.")}
        ${group("Text size", `<div class="chips">${[["default", "Default"], ["large", "Large"]].map(([v, l]) => opt(l, d.textSize === v, { "data-act": "setSetting", "data-arg": set("display.textSize", v) })).join("")}</div>`)}
        ${group("Motion", `<div class="chips">${[["system", "Match my device"], ["reduce", "Reduce motion"]].map(([v, l]) => opt(l, d.motion === v, { "data-act": "setSetting", "data-arg": set("display.motion", v) })).join("")}</div>`, "Reduce motion swaps slides and zooms for simple fades.")}
        ${group("Captions", sw("Captions on Plan calls", "Shows what Sidekick says as text", d.captions, { "data-act": "setSetting", "data-arg": set("display.captions", !d.captions) }))}`;
    },
    language: (s) => group("Language", `<div class="chips">${[["en", "English"], ["fr", "Français"]].map(([v, l]) => opt(l, s.language === v, { "data-act": "setSetting", "data-arg": set("language", v) })).join("")}</div>`, "In Français, the tab bar, Profile and Settings labels switch now; other screens stay in English for this sketch."),
    help: () => `${group("Help", `<a class="tb-btn o" href="mailto:help@sidequest.app?subject=SideQuest%20help">${icon("mail")}<span>Email for help</span></a>`, "We answer within a couple of days.")}
      ${group("Feedback", `<a class="tb-btn o" href="mailto:feedback@sidequest.app?subject=SideQuest%20feedback">${icon("send")}<span>Send feedback</span></a>`)}
      ${group("Terms and privacy", `<details class="tb-details"><summary>Terms</summary><p class="tb-s">SideQuest is a class project (INF2573). Listings come from public event pages and hosts; check details with the host before you go.</p></details>
        <details class="tb-details"><summary>Privacy</summary><p class="tb-s">We keep your account, what you save, go to and rate, and your settings. We don't save your location. Friends see only what your privacy settings allow. You can download or delete your data any time.</p></details>`, "Version 2.0")}`,
  };
  S.settings = { role: "attendee", label: "Settings", render: () => {
    const k = SETTINGS[U().setGroup] && GROUPS.some((x) => x[0] === U().setGroup) ? U().setGroup : "notifications";
    const g = GROUPS.find((x) => x[0] === k);
    return screen(`<div class="tb-pad stack" style="gap:12px">${SETTINGS[k](me().settings)}</div>`, { title: L(g[1]), cls: "tb-screen" });
  } };
  A.openSettings = (k) => {
    U().setGroup = k;
    return "settings";
  };
  // data-arg "notifications.plans=true": one value into its group
  A.setSetting = async (arg) => {
    const i = arg.indexOf("=");
    const [g, k] = arg.slice(0, i).split(".");
    const v = JSON.parse(arg.slice(i + 1));
    const change = k ? { [g]: { [k]: v } } : { [g]: v };
    await SQ.act("saveSettings", { change });
    SQ.applySettings();
    SQ.toast("Saved.");
  };
  A.setQuiet = async (value, el) => {
    await SQ.act("saveSettings", { change: { notifications: { [el.dataset.key]: value } } });
    SQ.toast("Quiet hours saved.");
  };
  A.downloadData = async () => {
    const r = await SQ.act("exportData");
    SQ.download(`sidequest-data-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(r.data, null, 2), "application/json");
  };
  A.deleteCalls = async () => {
    if (!confirm("Delete your Plan call history? This can't be undone.")) throw new Error("cancelled");
    await SQ.act("deleteCallHistory");
    SQ.toast("Call history deleted.");
  };
  // Display settings that change the page: text size and reduced motion
  SQ.applySettings = () => {
    const s = (me() && me().settings) || {};
    const root = document.documentElement;
    root.dataset.text = s.display && s.display.textSize === "large" ? "large" : "";
    root.dataset.motion = s.display && s.display.motion === "reduce" ? "reduce" : "";
    root.lang = LANGUAGE_ON && s.language === "fr" ? "fr" : "en";
  };
  // Settings > Language: the labels that switch to French (the rest of the app stays English in this sketch)
  const FR = { Discover: "Découvrir", Squads: "Escouades", Sidequests: "Sidequests", Profile: "Profil", Plan: "Planifier", Account: "Compte", App: "Appli", Notifications: "Notifications", "Privacy and data": "Confidentialité et données", Calendar: "Calendrier", "Display and accessibility": "Affichage et accessibilité", Language: "Langue", "Help, feedback and terms": "Aide, avis et conditions", "Log out": "Se déconnecter", "Exit demo": "Quitter la démo", "Edit profile": "Modifier le profil", "Delete account": "Supprimer le compte", "Nights out": "Sorties", Hosted: "Organisées" };
  SQ.t = (k) => ((LANGUAGE_ON && me() && me().settings && me().settings.language === "fr" && FR[k]) || k);

  // ---------- Delete account: type DELETE to confirm (real accounts only) ----------
  S["delete-account"] = { role: "attendee", label: "Delete account", render: () => {
    const u = me();
    const typed = U().deleteText || "";
    if (u.demo) return screen(`<div class="tb-pad stack" style="gap:14px"><div class="tb-card stack" style="gap:8px"><span class="tb-t16">The demo can't be deleted</span><p class="tb-s13">Everyone trying SideQuest shares this account, so it stays. Exit the demo instead, or make your own account to try deleting one.</p></div>${tbtn("Exit demo", { "data-act": "signOut" }, "o", "out")}</div>`, { title: "Delete account", cls: "tb-screen" });
    return screen(`<div class="tb-pad stack" style="gap:14px">
        <p class="tb-s13">This deletes your account for good: your profile, squads you made, saves, tickets, ratings, taste and settings, and your activity in SideQuest's logs. Events you added stay listed, without your name.</p>
        <p class="tb-s13">Want a copy first? ${`<button class="tb-link" data-act="downloadData">Download your data</button>`}</p>
        <label class="tb-field"><span>Type DELETE to confirm</span><input data-bind="deleteText" data-live value="${esc(typed)}" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Type DELETE to confirm"></label>
        <button class="tb-btn danger" data-act="deleteAccount" data-pending="Deleting" ${typed === "DELETE" ? "" : "disabled"}>${ix("warn")}<span>Delete my account</span></button>
      </div>`, { title: "Delete account", cls: "tb-screen" });
  } };
  A.deleteAccount = async () => {
    if ((U().deleteText || "") !== "DELETE") return SQ.toast("Type DELETE to confirm.");
    await SQ.act("deleteAccount", { confirm: "DELETE" });
    U().deleteText = "";
    SQ.setIds({ user: null });
    SQ.u.history = [];
    await SQ.refresh();
    SQ.toast("Your account is deleted.");
    return "landing";
  };

  /* ===================== Sheets: one at a time, over whatever screen opened it ===================== */
  // Calendar chooser, Add to a list, New list and the Start fresh confirm (screens-taste.js adds its own kinds).
  // A sheet belongs to the screen that opened it; Escape or the scrim closes it, and focus returns to the opener.
  const SHEETS = (SQ.sheets = SQ.sheets || {});
  let opener = null;
  SQ.openSheet = (kind, data = {}) => {
    opener = document.activeElement && document.activeElement.closest ? document.activeElement.closest("[data-act]") : null;
    U().tbSheet = { kind, screen: U().screen, fresh: true, ...data };
  };
  SQ.closeSheet = () => {
    U().tbSheet = null;
  };
  A.closeSheet = () => SQ.closeSheet();
  const sheetHtml = () => {
    const sh = U().tbSheet;
    if (!sh || sh.screen !== U().screen || !SHEETS[sh.kind]) return "";
    const inner = SHEETS[sh.kind](sh);
    // Only the first draw slides up; re-draws (a tick, a new list) keep it still
    return inner ? `<button class="wh-scrim tb-scrim" data-act="closeSheet" aria-label="Close" tabindex="-1"></button>${sh.fresh ? inner : inner.replace('class="wh-sheet tb-sheet', 'class="wh-sheet tb-sheet still')}` : "";
  };
  const afterSheets = SQ.afterRender;
  SQ.afterRender = (root) => {
    if (afterSheets) afterSheets(root);
    const html = sheetHtml();
    const scr = root.querySelector(".screen");
    if (!html || !scr) return;
    scr.insertAdjacentHTML("beforeend", html);
    const sh = U().tbSheet;
    const box = scr.querySelector(".tb-sheet");
    if (box && sh.fresh) {
      sh.fresh = false;
      const first = box.querySelector("[data-autofocus]") || box.querySelector("input") || box.querySelector("button:not([disabled])");
      if (first) first.focus({ preventScroll: true });
    }
    // Typing a list name turns the Create button on and off without a re-render (which would drop the focus)
    for (const input of scr.querySelectorAll(".tb-sheet input[data-enable]")) {
      const target = scr.querySelector(input.dataset.enable);
      const sync = () => { if (target) target.disabled = !input.value.trim(); };
      input.addEventListener("input", sync);
      sync();
    }
  };
  document.addEventListener("keydown", (e) => {
    if (!U() || !U().tbSheet) return;
    if (e.key === "Escape") {
      SQ.closeSheet();
      SQ.render();
      if (opener && document.contains(opener)) opener.focus();
      return;
    }
    // Keep Tab inside the sheet
    if (e.key === "Tab") {
      const box = document.querySelector("#screen .tb-sheet");
      if (!box) return;
      const items = [...box.querySelectorAll("button:not([disabled]), a[href], input")].filter((x) => x.offsetParent);
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    }
  });
  const sheet = (title, body, { label = title, cls = "" } = {}) => `<div class="wh-sheet tb-sheet ${cls}" role="dialog" aria-modal="true" aria-label="${esc(label)}"><span class="wh-grab" aria-hidden="true"></span>
      <div class="row"><b class="tb-t18">${esc(title)}</b><button class="icon-btn ghost" data-act="closeSheet" aria-label="Close">${icon("x")}</button></div>${body}</div>`;
  SQ.tbSheet = sheet;

  // Calendar chooser ("Ask each time")
  SHEETS.cal = (sh) => {
    const e = ev(sh.id);
    if (!e) return "";
    const opt3 = (kind, title, sub, ic) => `<button class="tb-row cal-opt" data-act="calWith" data-arg="${kind}|${e.id}"><span class="tb-ico violet">${ix(ic)}</span><span class="grow" style="min-width:0"><span class="tb-t14">${esc(title)}</span><span class="tb-s">${esc(sub)}</span></span>${icon("chevR")}</button>`;
    return sheet("Add to calendar", `<span class="tb-s13 ellipsis">${esc(e.title)} · ${esc(dayLabel(e.startsAt))}, ${esc(timeLabel(e.startsAt))}</span>
      <div class="stack" style="gap:6px">${opt3("google", "Google Calendar", "Opens Google Calendar with it filled in", "calAdd")}${opt3("apple", "Apple Calendar", "Downloads a .ics file to open", "download")}${opt3("outlook", "Outlook", "Opens Outlook on the web with it filled in", "calAdd")}</div>
      <button class="tb-link" data-act="openSettings" data-arg="calendar" style="align-self:flex-start">Always use one: Settings › Calendar</button>`);
  };

  // ---------- Lists: Add to a list from the event page and cards ----------
  const myLists = () => (me() && me().lists) || [];
  const countLine = (l) => {
    const bits = [l.events ? `${l.events} event${l.events === 1 ? "" : "s"}` : "", l.places ? `${l.places} place${l.places === 1 ? "" : "s"}` : ""].filter(Boolean);
    return bits.join(", ") || "Empty";
  };
  SQ.listCount = countLine;
  SQ.listBtn = (e, style = "raised") => {
    if (!me() || me().demo) return "";
    const n = myLists().filter((l) => l.items.includes(e.id)).length;
    const label = n ? `In ${n} list${n === 1 ? "" : "s"}. Add ${e.title} to a list` : `Add ${e.title} to a list`;
    if (style === "outline") return `<button class="icon-btn outline tb-listbtn${n ? " on" : ""}" data-act="listPick" data-arg="${e.id}" aria-label="${esc(label)}" aria-pressed="${n > 0}">${ix("listAdd")}</button>`;
    return `<button class="icon-btn ${style} tb-listbtn${n ? " on" : ""}" data-act="listPick" data-arg="${e.id}" aria-label="${esc(label)}" aria-pressed="${n > 0}">${ix("listAdd")}</button>`;
  };
  A.listPick = (id) => {
    SQ.openSheet("list-pick", { id: Number(id), name: "", privacy: "private" });
  };
  const privChips = (cur, act) => `<div class="chips" role="group" aria-label="Who can see it">${[["private", "Private", "lock"], ["friends", "Friends", "crew"]].map(([v, l, ic]) => `<button class="tb-chip${cur === v ? " on" : ""}" data-act="${act}" data-arg="${v}" aria-pressed="${cur === v}">${ix(ic, "xs")}${l}</button>`).join("")}</div>`;
  SHEETS["list-pick"] = (sh) => {
    const e = ev(sh.id);
    if (!e) return "";
    const lists = myLists();
    const rows = lists.map((l) => {
      const on = l.items.includes(e.id);
      return `<button class="tb-row lp-row" data-act="listToggle" data-arg="${esc(l.id)}|${e.id}" role="checkbox" aria-checked="${on}"><span class="checkbox${on ? " on" : ""}" aria-hidden="true">${on ? icon("check") : ""}</span><span class="grow" style="min-width:0"><span class="tb-t14 ellipsis">${esc(l.name)}</span><span class="tb-s">${l.privacy === "friends" ? "Friends" : "Private"} · ${esc(countLine(l))}</span></span></button>`;
    }).join("");
    return sheet("Add to a list", `<span class="tb-s13 ellipsis">${esc(e.title)}</span>
      ${rows ? `<div class="stack lp-list" style="gap:4px">${rows}</div>` : '<p class="tb-s">No lists yet. Make one for this and anything like it.</p>'}
      <form class="stack lp-new" data-act="listCreateFrom" style="gap:8px"><label class="tb-field"><span>New list</span><input data-bind="tbSheet.name" value="${esc(sh.name || "")}" maxlength="40" placeholder="Date night ideas" data-enable="#lp-create" autocomplete="off"></label>
        ${privChips(sh.privacy, "sheetPrivacy")}
        <button class="tb-btn v" id="lp-create" type="submit" data-pending="Making it" ${(sh.name || "").trim() ? "" : "disabled"}>${icon("plus")}<span>Make the list and add this</span></button></form>`, { label: `Add ${e.title} to a list` });
  };
  A.sheetPrivacy = (v) => { U().tbSheet.privacy = v; };
  A.listToggle = async (arg) => {
    const [list, id] = String(arg).split("|");
    const r = await SQ.act("listItem", { list, eventId: Number(id) });
    SQ.toast(r.label);
  };
  A.listCreateFrom = async () => {
    const sh = U().tbSheet;
    const name = (sh.name || "").trim();
    if (!name) return SQ.toast("Give the list a name.");
    const r = await SQ.act("listCreate", { name, privacy: sh.privacy, eventId: sh.id });
    sh.name = "";
    SQ.toast(r.label);
  };
  // "+ New" on Taste > Lists
  SHEETS["list-new"] = (sh) => sheet("New list", `<form class="stack" data-act="listCreateNew" style="gap:10px"><label class="tb-field"><span>Name</span><input data-bind="tbSheet.name" value="${esc(sh.name || "")}" maxlength="40" placeholder="Rainy Sundays" data-enable="#ln-create" autocomplete="off"></label>
      <span class="tb-flab">Who can see it</span>${privChips(sh.privacy, "sheetPrivacy")}<span class="tb-s">${sh.privacy === "friends" ? "Your SideQuest friends can see this list and what's on it." : "Only you see this list."}</span>
      <button class="tb-btn v" id="ln-create" type="submit" data-pending="Making it" ${(sh.name || "").trim() ? "" : "disabled"}>${icon("plus")}<span>Make the list</span></button></form>
      <p class="tb-s">Add events and places to it from their page, or from Saved.</p>`);
  A.listNew = () => { SQ.openSheet("list-new", { name: "", privacy: "private" }); };
  A.listCreateNew = async () => {
    const sh = U().tbSheet;
    const name = (sh.name || "").trim();
    if (!name) return SQ.toast("Give the list a name.");
    const r = await SQ.act("listCreate", { name, privacy: sh.privacy });
    SQ.closeSheet();
    SQ.toast(r.label);
    U().listId = r.listId;
    return "taste-list";
  };
  // The event page gets the sheet too (its screen is in screens-attendee.js)

  SQ.screens = Object.assign(SQ.screens || {}, S);
})();
