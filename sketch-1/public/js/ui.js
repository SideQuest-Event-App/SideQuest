/* Sketch 1 — shared UI helpers: icons, posters, avatars, components, and lookups into app data. */
window.SQ = window.SQ || {};
(function () {
  const SQ = window.SQ;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const attr = (o = {}) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== false).map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(" ");

  // ---------- Icons (24px line icons) ----------
  const P = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
    megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h3l7 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M18 8.5a5 5 0 0 1 0 7"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
    map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ticket: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 0 0-6V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2"/>',
    train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12.5h2M3 10h18"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    send: '<path d="m4 12 16-8-6 16-2-6z"/><path d="m12 14 8-10"/>',
    share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev: '<path d="m9 5 7 7-7 7"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
    flame: '<path d="M12 21c-3.9 0-7-2.7-7-6.5 0-3 2-5.2 3.5-6.8.3 1.8 1.2 3 2.5 3.3C11 7.5 12.5 5 15 3c0 3 4 5.5 4 11 0 4-3.1 7-7 7z"/>',
    chart: '<path d="M5 20V11M12 20V5M19 20v-6"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    door: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18"/><circle cx="14.5" cy="12" r="1"/>',
    home: '<path d="M4 11 12 4l8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
    chat: '<path d="M5 18V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9z"/>',
    thumbDown: '<path d="M10 15v4a2 2 0 0 0 2 2l3-7V4H7.5a2 2 0 0 0-2 1.6l-1.3 7A2 2 0 0 0 6.2 15z"/><path d="M15 4h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
    logout: '<path d="M10 5H5v14h5M15 8l4 4-4 4M19 12H9"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v6H4V6h6"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    tree: '<path d="M12 21v-5"/><path d="M12 3 5 16h14z"/>',
    bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16 10 8h5l3 8M9 8h3"/>',
    peak: '<path d="m3 20 6-11 4 6 3-4 5 9z"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".8"/><circle cx="15" cy="15" r=".8"/><circle cx="15" cy="9" r=".8"/><circle cx="9" cy="15" r=".8"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/>',
    wave: '<path d="M3 12h3l2-6 4 12 3-9 2 3h4"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    scan: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    coat: '<path d="M9 3 6 6 3 9l3 3v9h12v-9l3-3-3-3-3-3"/><path d="M9 3a3 3 0 0 0 6 0"/>',
    moon: '<path d="M20 15A8 8 0 1 1 9 4a7 7 0 0 0 11 11z"/>',
  };
  const icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ""}</svg>`;

  // Each vibe gets an icon for posters and chips
  const VIBE_ICON = {
    "Live music": "music", Jazz: "music", "Indie gigs": "music", Comedy: "smile", Dance: "sparkle", Electronic: "wave", "Records & vinyl": "disc",
    "Film nights": "film", "Zines & print": "book", "Art & making": "palette", Photography: "camera", "Writing & poetry": "pen", "Tech & coding": "code",
    "Anime & cosplay": "star", Outdoors: "tree", "Run & ride": "bike", Climbing: "peak", "Games & social": "dice",
  };

  // ---------- Posters: the listing's own photo or poster, in colour; "N/A" when it has none ----------
  const hash = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  function poster(e, cls = "", { style = "" } = {}) {
    if (e.image) return `<div class="poster has-img ${cls}" style="background-image:url('${esc(e.image)}');${style}" role="img" aria-label="${esc(`Image for ${e.title}`)}"></div>`;
    return `<div class="poster no-img ${cls}" style="${style}"><span class="na">Image: N/A</span></div>`;
  }

  // ---------- Avatars ----------
  // Light greys with dark letters: every one is above 9:1 contrast
  const AV_COLORS = ["#f2f2f2", "#d4d4d4", "#bdbdbd", "#e3e3e3", "#c9c9c9"];
  const avatar = (name, cls = "") => `<span class="av ${cls}" style="background:${AV_COLORS[hash(name) % AV_COLORS.length]}" title="${esc(name)}">${esc(String(name)[0] || "?")}</span>`;
  const avatars = (names, max = 4) => names.length ? `<span class="avs">${names.slice(0, max).map((n) => avatar(n)).join("")}${names.length > max ? `<span class="av more">+${names.length - max}</span>` : ""}</span>` : "";

  // ---------- Components ----------
  const bar = (title, { back = true, right = "", large = false } = {}) => large
    ? `<header class="bar large"><h1>${esc(title)}</h1><div class="actions">${right}</div></header>`
    : `<header class="bar">${back ? `<button class="icon-btn" data-back aria-label="Back">${icon("back")}</button>` : "<span></span>"}<h1>${esc(title)}</h1>${right || "<span></span>"}</header>`;
  const btn = (label, a = {}, kind = "primary", ic = "") => `<button class="btn btn-${kind}" ${attr(a)}>${ic ? icon(ic) : ""}${esc(label)}</button>`;
  const chip = (label, on, a = {}, ic = "") => `<button class="chip${on ? " on" : ""}" aria-pressed="${on ? "true" : "false"}" ${attr(a)}>${ic ? icon(ic) : ""}${esc(label)}</button>`;
  const field = (label, bind, value = "", type = "text", placeholder = "", extra = {}) => `
    <label class="field"><span>${esc(label)}</span><input type="${type}" data-bind="${bind}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${attr(extra)}></label>`;
  const textarea = (label, bind, value = "", placeholder = "", rows = 3) => `
    <label class="field"><span>${esc(label)}</span><textarea data-bind="${bind}" rows="${rows}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
  const progress = (n, total) => `<div class="progress" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${total}" aria-label="Step ${n} of ${total}">${Array.from({ length: total }, (_, i) => `<span class="${i < n ? "done" : ""}"></span>`).join("")}</div>`;
  const meter = (pct, cls = "") => `<span class="meter ${cls}"><span style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></span></span>`;
  const empty = (ic, text, action = "") => `<div class="empty"><span class="ic-box">${icon(ic, "lg")}</span><p>${esc(text)}</p>${action}</div>`;
  const stars = (n) => `<span class="stars-inline" aria-label="${n} stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
  const tabs = (list, active, dots = {}) => `<nav class="tabs" aria-label="Sections">${list.map(([id, label, ic]) => `
    <button class="tab${id === active ? " on" : ""}" data-go="${id}" ${id === active ? 'aria-current="page"' : ""}><span class="tab-ic">${icon(ic)}</span>${esc(label)}${dots[id] ? `<span class="dot">${dots[id]}</span>` : ""}</button>`).join("")}</nav>`;
  const screen = (body, { title, back = true, right = "", tabbar = "", footer = "", large = false, cls = "" } = {}) => `
    <div class="screen ${title !== undefined ? "has-bar" : ""} ${cls}">
      ${title !== undefined ? bar(title, { back, right, large }) : ""}
      <main class="scroll">${body}</main>
      ${footer}${tabbar}
    </div>`;
  const thinking = (text) => `<div class="thinking" role="status"><span class="orb"></span><span>${esc(text)}</span></div>`;
  const aiLabel = (mode) => ({ api: "Claude API", "claude-code": "Claude Code", keywords: "Keyword match, not AI" }[mode] || "");
  const aiTag = (mode) => mode ? `<span class="ai-tag">${icon(mode === "keywords" ? "search" : "sparkle")}${esc(aiLabel(mode))}</span>` : "";

  // ---------- Lookups into app data ----------
  const D = () => SQ.d || {};
  const me = () => D().user;
  const ev = (id) => (D().events || []).find((e) => e.id === Number(id));
  const req = (id) => (D().requests || []).find((r) => r.id === Number(id));
  const now = () => new Date(D().now || Date.now());
  const TZ = "America/Toronto";
  const dayKey = (d) => d.toLocaleDateString("en-CA", { timeZone: TZ });

  function whenLabel(e, { short = false } = {}) {
    const start = new Date(e.startsAt);
    const diff = Math.round((new Date(dayKey(start)) - new Date(dayKey(now()))) / 86400000);
    const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }).replace(":00", "");
    const day = diff === 0 ? (start.getHours() >= 17 ? "Tonight" : "Today") : diff === 1 ? "Tomorrow" : start.toLocaleDateString("en-US", short ? { weekday: "short", day: "numeric" } : { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
    return `${day} · ${time}`;
  }
  const isToday = (e) => dayKey(new Date(e.startsAt)) === dayKey(now());
  function isWeekend(e) {
    const start = new Date(e.startsAt);
    const days = (start - now()) / 86400000;
    const dow = new Date(dayKey(start)).getUTCDay(); // 0 Sun .. 6 Sat
    return days > -0.2 && days < 7.5 && (dow === 5 || dow === 6 || dow === 0);
  }
  const priceLabel = (e) => (e.price == null ? "N/A" : e.price === 0 ? "Free" : `$${e.price}`);
  const trip = (e, origin) => (origin && e.travel && e.travel.from[origin] ? { ...e.travel.from[origin], stop: e.travel.stop } : null);
  const tripLabel = (t) => t ? `${t.minutes} min · ${t.transfers ? `${t.transfers} transfer${t.transfers > 1 ? "s" : ""}` : "no transfers"}` : "";
  const originShort = (o) => ((D().vocab || {}).ORIGINS || {})[o] || "";

  // The taste avatar's pick for an event (match score and reason), if it has scored it
  function pick(e) {
    const u = me();
    return u && u.feed && u.feed.picks ? u.feed.picks[e.id] || null : null;
  }
  const partyNames = () => ((D().party || {}).members || []);
  const partyGoing = (e) => (e.friends || []).filter((f) => partyNames().includes(f));
  // A quest is over 2 hours after it starts, when the host ends it, or when you skip ahead (demo)
  function isPast(e) {
    const l = me() && me().log[e.id];
    return e.over || e.ended || !!(l && l.over);
  }
  // Three states: past, happening now (started but not over), or upcoming (the default, no badge)
  const eventStatus = (e) => (isPast(e) ? "past" : Date.parse(e.startsAt) <= now().getTime() ? "now" : "upcoming");
  const statusBadge = (e) => ({ past: '<span class="badge">Past</span>', now: '<span class="badge live">Happening now</span>' })[eventStatus(e)] || "";
  // The date label with its status badge beside it
  const whenRow = (e) => `<span class="row start" style="gap:8px;flex-wrap:wrap"><span class="label" style="letter-spacing:.04em">${esc(whenLabel(e))}</span>${statusBadge(e)}</span>`;

  Object.assign(SQ, { esc, attr, icon, VIBE_ICON, poster, avatar, avatars, bar, btn, chip, field, textarea, progress, meter, empty, stars, tabs, screen, thinking, aiLabel, aiTag, me, ev, req, now, whenLabel, isToday, isWeekend, priceLabel, trip, tripLabel, originShort, pick, partyNames, partyGoing, isPast, eventStatus, statusBadge, whenRow, hash });
})();
