/* Sketch 2 — Profile's subpages (TB3, direction D1 "Bento"): Stats, Badges, Passport, Rewind, Taste, Edit taste,
   "Where this came from" and Quick retune. Every number is from real data (lib/tabs/stats.js, lib/tabs/tastepage.js):
   counts, never goals; no streaks, no "x of y". Taste never shows exact weights, logs, friends' data or location. */
(function () {
  const SQ = window.SQ;
  const { esc, icon, avatar, screen, me, ev } = SQ;
  const S = {};
  const A = SQ.actions;
  const U = () => SQ.u;
  const ix = (n, c) => SQ.ix(n, c);
  const tbtn = (...a) => SQ.tbtn(...a);
  const pill = (...a) => SQ.tbPill(...a);
  const lab = (...a) => SQ.tbLab(...a);
  const stack = (...a) => SQ.tbStack(...a);
  const TZ = "America/Toronto";
  const DONUT = ["#c2a5f6", "#82dcec", "#f5a8d3", "#f6dd8f", "#8fe3a8"];
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const desk = () => document.documentElement.dataset.layout === "desktop";

  // ---------- Charts (inline SVG; labels are text beside them, so nothing relies on colour alone) ----------
  SQ.donutSvg = (parts, size = 124, label = "", sub = "") => {
    let off = 0;
    const total = parts.reduce((a, p) => a + p.share, 0) || 1;
    const arcs = parts.length ? parts.map((p, i) => {
      const len = (100 * p.share) / total;
      const a = `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${DONUT[i % DONUT.length]}" stroke-width="5.5" stroke-dasharray="${Math.max(0.5, len - 1.5)} ${100 - Math.max(0.5, len - 1.5)}" stroke-dashoffset="${25 - off}"/>`;
      off += len;
      return a;
    }).join("") : '<circle cx="21" cy="21" r="15.9" fill="none" stroke="#2a2340" stroke-width="5.5"/>';
    // The middle label is HTML over the ring (so it stays real text at a readable size)
    return `<span class="tb-donut" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 42 42" role="img" aria-label="${esc(parts.map((p) => `${p.vibe} ${p.share}%`).join(", ") || "No vibes yet")}">${arcs}</svg>${label !== "" ? `<span class="tb-donut-l" style="font-size:${Math.max(14, Math.round(size * 0.22))}px">${esc(label)}${sub && size >= 96 ? `<small>${esc(sub)}</small>` : ""}</span>` : ""}</span>`;
  };
  // Three rings as plain counts: no grey track, so nothing looks unfinished; the longest ring is the biggest count
  const rings = (vals, size = 132) => {
    const max = Math.max(1, ...vals.map((v) => v.n));
    const cols = ["#c2a5f6", "#82dcec", "#f5a8d3"];
    return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">${vals.map((v, i) => {
      const r = 18 - i * 4;
      const c = 2 * Math.PI * r;
      return v.n ? `<circle cx="24" cy="24" r="${r}" fill="none" stroke="${cols[i]}" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="${((c * 0.8 * v.n) / max).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 24 24)"/>` : "";
    }).join("")}</svg>`;
  };

  /* ===================== Stats ===================== */
  const nameOf = () => (me().name || "You").split(" ")[0];
  function hero(st, p, key) {
    const word = key === "season" ? `this ${st.seasonName}` : "this year";
    const title = key === "season" ? `Statistics · ${st.seasonLabel}` : `Statistics · ${st.year}`;
    const sentence = p.nights
      ? `${esc(nameOf())}, you went out <b>${plural(p.nights, "time")}</b> ${word}${p.busiest ? `, your <b>busiest season</b> yet` : p.first && key === "season" ? ", your first season on SideQuest" : ""}.`
      : `${esc(nameOf())}, no confirmed nights out ${word} yet. After a night out, tell us you went and it shows up here.`;
    return `<div class="st-hero"><span class="st-kicker">${esc(title)}</span><p class="st-sentence">${sentence}</p>
      <div class="row start" style="gap:6px;flex-wrap:wrap">${pill(`${p.attended} attended`, "white")}${pill(`${p.hosted} hosted`, "white")}</div></div>`;
  }
  function ringsCard(p, key) {
    const vals = [{ n: p.nights, t: "Nights out", c: "lav" }, { n: p.newVenues, t: "New venues", c: "aqua" }, { n: p.withSquads, t: "With squads", c: "pink" }];
    return `<div class="tb-card st-rings"><span class="tb-t14">${key === "season" ? "This season" : "This year"}</span>
      <div class="row start" style="gap:16px">${rings(vals)}<div class="stack" style="gap:8px">${vals.map((v) => `<div><span class="tb-s">${v.t}</span><b class="st-ring-n ${v.c}">${v.n}</b></div>`).join("")}</div></div>
      <span class="tb-s">Counts, not goals. Nothing to close.</span></div>`;
  }
  const split = (p) => `<div class="st-split"><div class="a"><span class="st-split-n">${p.nights}</span><span>Nights<br>out</span></div><div class="b"><span class="st-split-n">${p.squadsWent}</span><span>Squad${p.squadsWent === 1 ? "" : "s"}<br>you went with</span></div></div>`;
  function bars(p) {
    const max = Math.max(1, ...p.months.map((m) => m.n));
    return `<div class="st-bars-card"><div class="row"><span class="st-dark-t">Nights out by month</span>${p.busiestMonth ? `<span class="st-dark-s">${esc(p.busiestMonth)}: busiest so far</span>` : ""}</div>
      <div class="st-bars" role="list">${p.months.map((m) => `<div class="st-bar" role="listitem" aria-label="${esc(m.label)}: ${m.n}"><span class="st-vpill${m.top ? " top" : ""}">${m.n}</span><i class="${m.top ? "top" : ""}" style="height:${Math.round(6 + (96 * m.n) / max)}px"></i><span class="st-mlab">${esc(m.label)}</span></div>`).join("")}</div></div>`;
  }
  const KCOL = ["#a97af2", "#f5a8d3", "#82dcec", "#f6dd8f"];
  const kinds = (p) => p.kinds.length ? `<div class="row"><span class="tb-t16">Kinds of nights</span><span class="tb-s">share of your ${p.nights}</span></div>
      ${p.kinds.map((k, i) => `<div class="st-fill"><i style="width:${Math.max(k.pct, 38)}%;background:${KCOL[i]}"></i><span class="st-fill-t">${esc(k.name)}</span><span class="st-fill-n">${k.pct}<small>%</small></span></div>`).join("")}` : "";
  function calendar(st) {
    const base = SQ.now();
    const off = U().statsMonth || 0;
    const first = new Date(base.getFullYear(), base.getMonth() + off, 1, 12);
    const monthKey = SQ.dayKey(first).slice(0, 7);
    const marks = {};
    for (const d of st.days) if (d.date.startsWith(monthKey)) marks[d.date] = marks[d.date] === "event" || d.kind === "event" ? "event" : "place";
    const lead = (first.getDay() + 6) % 7; // weeks start on Monday
    const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells = [...Array(lead).fill('<span></span>'), ...Array.from({ length: daysIn }, (_, i) => {
      const key = `${monthKey}-${String(i + 1).padStart(2, "0")}`;
      const k = marks[key];
      return `<span class="st-day${k ? ` ${k}` : ""}"${k ? ` aria-label="${i + 1}: ${k} night"` : ""}>${i + 1}</span>`;
    })];
    return `<div class="tb-card st-cal"><div class="row"><span class="tb-t14">${esc(first.toLocaleDateString("en-US", { month: "long", year: off ? "numeric" : undefined }))}</span>
        <span class="row start" style="gap:4px"><span class="tb-s"><i class="tb-dot c0"></i> event <i class="tb-dot c1"></i> place</span>
        <button class="icon-btn ghost s44" data-act="statsMonth" data-arg="-1" aria-label="Previous month">${icon("back")}</button><button class="icon-btn ghost s44" data-act="statsMonth" data-arg="1" aria-label="Next month" ${off >= 0 ? "disabled" : ""}>${icon("chevR")}</button></span></div>
      <div class="st-grid">${"MTWTFSS".split("").map((d) => `<span class="st-dow">${d}</span>`).join("")}${cells.join("")}</div></div>`;
  }
  function insights(p) {
    const out = [];
    if (p.topSquad) out.push(["aqua", `Shared with ${p.topSquad.name}`, `${p.topSquad.n} of your ${p.nights} nights`]);
    if (p.topDay && p.nights >= 2) out.push(["amber", "Your top night", `${p.topDay.day} · ${p.topDay.n} of ${p.nights}`]);
    if (p.hoods.length) out.push(["pink", "Top neighbourhoods", p.hoods.join(" · ")]);
    return out.map(([c, t, v]) => `<div class="st-blk ${c}"><span>${esc(t)}</span><b>${esc(v)}</b></div>`).join("") + (p.hoods.length ? '<p class="tb-s">Neighbourhoods come from the event listings, never your location.</p>' : "");
  }
  const orb = (size = 56) => `<span class="st-orb" style="width:${size}px;height:${size}px">${ix("moon")}</span>`;
  const badgeDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
  const latestAndRewind = (st) => `<div class="st-two">
      ${st.latest ? `<button class="tb-card st-latest" data-go="badges">${orb()}<b class="tb-t14">${esc(st.latest.name)}</b><span class="tb-s">Latest badge · ${esc(badgeDate(st.latest.earned))}</span></button>` : `<button class="tb-card st-latest" data-go="badges">${orb()}<b class="tb-t14">No badges yet</b><span class="tb-s">They come from nights out</span></button>`}
      <div class="st-rewind"><b class="tb-t14">Your ${esc(st.seasonName)} Rewind</b>${tbtn("Play", { "data-act": "openRewind" }, "v")}</div></div>`;
  function cabinet(st) {
    const got = st.badges.filter((b) => b.earned).sort((a, b) => b.earned.localeCompare(a.earned));
    const not = st.badges.filter((b) => !b.earned);
    return `<div class="stack" style="gap:10px" id="badges"><span class="tb-t16">Badges</span>
      ${got.length ? `<div class="st-badges">${got.map((b) => `<div class="st-badge">${orb(48)}<b class="tb-t14">${esc(b.name)}</b><span class="tb-s">${esc(badgeDate(b.earned))}</span></div>`).join("")}</div>` : '<p class="tb-s">Your first badge comes with your first confirmed night out.</p>'}
      ${not.length ? `${lab("Still to find")}<div class="stack" style="gap:6px">${not.map((b) => `<div class="st-not"><b class="tb-t14">${esc(b.name)}</b><span class="tb-s">${esc(b.how)}</span></div>`).join("")}</div><p class="tb-s">Badges never expire, and nothing counts down.</p>` : ""}</div>`;
  }
  S.stats = { role: "attendee", label: "Stats", render: () => {
    const st = me().stats;
    const key = U().statsP === "year" ? "year" : "season";
    const p = key === "year" ? st.yearly : st.season;
    const seg = `<div class="tb-seg st-seg">${[["season", "This season"], ["year", "This year"]].map(([k, l]) => `<button class="${key === k ? "on" : ""}" data-act="statsPeriod" data-arg="${k}" aria-pressed="${key === k}">${l}</button>`).join("")}</div>`;
    const links = `<div class="row start" style="gap:8px;flex-wrap:wrap"><button class="tb-pill-btn white" data-go="badges">Badges</button><button class="tb-pill-btn lav" data-act="openRewind">Rewind</button><button class="tb-pill-btn aqua" data-go="passport">Passport</button></div>`;
    const body = p.nights
      ? `<div class="st-bento">
          <div class="st-a">${hero(st, p, key)}</div>
          <div class="st-b">${split(p)}</div>
          <div class="st-c">${ringsCard(p, key)}</div>
          <div class="st-d">${bars(p)}</div>
          <div class="st-e stack" style="gap:10px">${kinds(p)}${links}</div>
          <div class="st-f">${calendar(st)}</div>
          <div class="st-g stack" style="gap:10px">${insights(p)}</div>
          <div class="st-h">${latestAndRewind(st)}</div>
        </div>${cabinet(st)}`
      : `${hero(st, p, key)}<div class="tb-empty"><p class="tb-t">Nothing to count yet</p><p class="tb-s">Go to something, then answer "Did you go?" on Sidequests. Stats only count nights you confirm.</p>${tbtn("Find a sidequest", { "data-go": "discover" }, "v", "search")}</div>${st.days.length ? calendar(st) : ""}${cabinet(st)}`;
    return screen(`<div class="tb-pad stack" style="gap:14px">${seg}${body}</div>`, { title: "Stats", right: "", cls: "tb-screen" });
  } };
  A.statsPeriod = (k) => { U().statsP = k; };
  A.statsMonth = (d) => { U().statsMonth = Math.min(0, (U().statsMonth || 0) + Number(d)); };

  S.badges = { role: "attendee", label: "Badges", render: () => screen(`<div class="tb-pad stack" style="gap:14px">${cabinet(me().stats)}</div>`, { title: "Badges", cls: "tb-screen" }) };
  S.passport = { role: "attendee", label: "Passport", render: () => {
    const stamps = me().stats.stamps;
    return screen(`<div class="tb-pad stack" style="gap:10px"><p class="tb-s13">A stamp for every venue you've been to on a confirmed night out.</p>
      ${stamps.length ? `<div class="pp-grid">${stamps.map((s) => `<div class="pp-stamp ${s.kind}"><b class="tb-t14">${esc(s.venue)}</b><span class="tb-s">${esc([s.hood, `first ${badgeDate(s.first)}`].filter(Boolean).join(" · "))}</span></div>`).join("")}</div>` : '<div class="tb-empty"><p class="tb-t">No stamps yet</p><p class="tb-s">Your first comes with your first confirmed night out.</p></div>'}</div>`, { title: "Passport", cls: "tb-screen" });
  } };

  /* ===================== Rewind (S1 style: one pastel per card, tap through, share is opt-in) ===================== */
  function rewindCards() {
    const st = me().stats;
    const p = st.season;
    const season = st.seasonName;
    if (!p.nights) return [`<div class="rw-card lav"><span class="rw-k">Your ${esc(season)}</span><span class="grow"></span><span class="rw-line">Your Rewind fills in after your first confirmed night out.</span></div>`];
    const cards = [`<div class="rw-card lav"><span class="rw-k">Your ${esc(season)}</span><span class="grow"></span><span class="rw-huge">${p.nights}</span><b class="rw-t">night${p.nights === 1 ? "" : "s"} out</b><span class="rw-line">Every one confirmed.</span></div>`];
    if (p.topSquad) cards.push(`<div class="rw-card aqua"><span class="rw-k">Your top squad</span><span class="grow"></span>${stack(["You", ...p.topSquad.members], "l rw-av")}<b class="rw-big">${esc(p.topSquad.name)}</b><span class="rw-line">${plural(p.topSquad.n, "night")} together</span></div>`);
    if (p.topDay) cards.push(`<div class="rw-card pink"><span class="rw-k">Your night</span><span class="grow"></span><b class="rw-big">${esc(p.topDay.day)}${p.afterEight > p.nights / 2 ? " after 8" : ""}</b><span class="rw-line">${p.topDay.n} of your ${plural(p.nights, "night")}</span></div>`);
    cards.push(`<div class="rw-card amber"><b class="rw-big sm">Your ${esc(season)}</b><div class="rw-grid">
        <div><span>Nights</span><b>${p.nights}</b></div><div><span>New venues</span><b>${p.newVenues}</b></div>
        <div><span>Squad</span><b>${esc(p.topSquad ? p.topSquad.name : "Solo")}</b></div><div><span>Vibe</span><b>${esc(p.topKind || "Still exploring")}</b></div></div>
      <span class="rw-line">Only you see this.</span><span class="grow"></span>
      <div class="row" style="gap:8px"><button class="rw-btn line" data-act="shareRewind">Share…</button><button class="rw-btn dark" data-act="closeRewind">Done</button></div></div>`);
    return cards;
  }
  S.rewind = { role: "attendee", label: "Rewind", render: () => {
    const cards = rewindCards();
    const i = Math.min(U().rewindStep || 0, cards.length - 1);
    const last = i === cards.length - 1;
    return `<div class="screen rw-screen tb-screen">
      <div class="rw-top"><div class="rw-dots" aria-label="Card ${i + 1} of ${cards.length}">${cards.map((_, k) => `<span class="${k <= i ? "on" : ""}"></span>`).join("")}</div><button class="icon-btn ghost" data-act="closeRewind" aria-label="Close">${icon("x")}</button></div>
      <div class="rw-stage">${last ? cards[i] : `<button class="rw-tap" data-act="rewindStep" data-arg="${i + 1}" aria-label="Next card">${cards[i]}</button>`}</div>
      <p class="tb-s" style="text-align:center;padding:8px 20px 24px">${last ? "Nothing is shared unless you tap Share." : "Tap for the next card"}</p>
    </div>`;
  } };
  A.openRewind = () => { U().rewindStep = 0; return "rewind"; };
  A.rewindStep = (i) => { U().rewindStep = Number(i); };
  A.closeRewind = () => SQ.back();
  A.shareRewind = async () => {
    const p = me().stats.season;
    const text = `My ${me().stats.seasonName} on SideQuest: ${plural(p.nights, "night")} out, ${plural(p.newVenues, "new venue")}${p.topKind ? `, mostly ${p.topKind.toLowerCase()}` : ""}.`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        SQ.toast("Copied. Paste it wherever you like.");
      }
    } catch {}
  };

  /* ===================== Taste ===================== */
  const TP = () => me().tastePage;
  // The undo toast after every taste change (about 8 seconds)
  const undoToast = () => {
    const t = U().undoToast;
    if (!t || Date.now() - t.at > 8000) return "";
    return `<div class="tb-undo" role="status"><span class="grow">${esc(t.label)}</span><button data-act="tasteUndoNow">${ix("undo")}<span>Undo</span></button></div>`;
  };
  let undoTimer = null;
  const changed = (r, fallback) => {
    U().undoToast = { label: (r && r.label) || fallback, at: Date.now() };
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { U().undoToast = null; SQ.render(); }, 8200);
  };
  async function tasteAct(type, args, fallback) {
    const r = await SQ.act(type, args);
    changed(r, fallback);
    return r;
  }
  A.tasteUndoNow = async () => {
    const r = await SQ.act("tasteUndo");
    U().undoToast = null;
    SQ.toast(r.label);
  };

  function whereSheet() {
    const w = U().tasteWhere;
    if (!w) return "";
    const tp = TP();
    let title = "", level = "", line = "", rows = [], reset = "";
    if (w.type === "vibe") {
      const r = tp.vibes.find((x) => x.vibe === w.key);
      if (!r) return "";
      title = r.vibe;
      level = r.paused ? "Paused" : r.level;
      line = r.source ? `Where this came from: ${r.source.replace(/^from /, "")}.` : "Where this came from:";
      rows = r.sources;
      reset = tbtn("Reset to automatic", { "data-act": "tasteLevel", "data-arg": `${r.vibe}|Auto` }, "o");
    } else {
      const h = tp.hosts.find((x) => `${x.kind}:${x.name}` === w.key);
      if (!h) return "";
      title = h.name;
      level = h.kind === "venue" ? "Venue" : "Organiser";
      line = `Where this came from: ${[h.nights ? plural(h.nights, "night") : "", h.followed ? "you follow them" : ""].filter(Boolean).join(" and ")}.`;
      rows = h.sources;
      reset = h.followed ? tbtn("Unfollow", { "data-act": "tasteForget", "data-arg": `follow|${h.name}` }, "o") : "";
    }
    const seg = w.type === "vibe" ? `<div class="wh-meter" aria-hidden="true">${[0, 1, 2, 3, 4, 5].map((i) => `<i class="${i < Math.round(Math.min(6, (tp.vibes.find((x) => x.vibe === w.key) || {}).weight || 0)) ? "on" : ""}"></i>`).join("")}</div>` : "";
    const rowHtml = (s) => {
      const btnFor = s.t != null ? tbtn("Don't count this", { "data-act": "tasteForget", "data-arg": `${s.t}|${s.id == null ? "" : s.id}` }, "o sm")
        : s.kind === "signup" ? tbtn("Remove", { "data-act": "tasteLevel", "data-arg": `${w.key}|Off` }, "o sm")
        : s.kind === "follow" ? tbtn("Unfollow", { "data-act": "tasteForget", "data-arg": `follow|${title}` }, "o sm") : "";
      return `<div class="wh-row"><span class="grow" style="min-width:0"><b class="tb-t13">${esc(s.label)}</b><span class="tb-s">${esc(s.date || "")}</span></span>${btnFor}</div>`;
    };
    return `<button class="wh-scrim" data-act="closeWhere" aria-label="Close"></button>
      <div class="wh-sheet" role="dialog" aria-modal="true" aria-label="Where ${esc(title)} came from"><span class="wh-grab"></span>
        <div class="row"><b class="tb-t18">${esc(title)}</b><span class="tb-s">${esc(level)}</span></div>${seg}
        <span class="tb-s13">${esc(line)}</span>
        <div class="wh-list">${rows.length ? rows.map(rowHtml).join("") : '<p class="tb-s">Nothing recent. It may have faded.</p>'}</div>
        <div class="row" style="gap:8px">${reset}${tbtn("Done", { "data-act": "closeWhere" }, "v grow")}</div></div>`;
  }
  A.openWhere = (arg) => {
    const [type, ...rest] = String(arg).split("|");
    U().tasteWhere = { type, key: rest.join("|") };
  };
  A.closeWhere = () => { U().tasteWhere = null; };

  const legend = (parts, n = 4) => parts.slice(0, n).map((p, i) => `<button class="tt-leg" data-act="openWhere" data-arg="vibe|${esc(p.vibe)}"><i style="background:${DONUT[i % DONUT.length]}"></i><span class="ellipsis">${esc(p.vibe)}</span></button>`).join("");
  function tasteHero(tp) {
    const more = U().tasteMore;
    return `<div class="tt-hero"><div class="row"><b class="tb-t14">Your taste</b>${tbtn("Edit", { "data-go": "taste-edit" }, "glass sm")}</div>
      <div class="row start tt-hero-in" style="gap:12px">${SQ.donutSvg(tp.donut, 124, tp.counts.nights, tp.counts.nights === 1 ? "night" : "nights")}
        <div class="stack" style="gap:6px;min-width:0;flex:1"><b class="tt-h">Your top vibes</b>${legend(tp.donut, more ? 5 : 4) || '<span class="tb-s">Pick a few vibes in Edit to start.</span>'}${tp.donut.length > 4 ? `<button class="tb-link light" data-act="tasteMore">${more ? "Show less" : "Show more ›"}</button>` : ""}</div></div>
      <span class="tb-s light">Based on ${plural(tp.counts.nights, "night")} out, ${plural(tp.counts.saves, "save")} and ${tp.counts.notForMe} "not for me"</span></div>`;
  }
  function compare(tp) {
    if (!tp.compare.length) return "";
    const sel = tp.compare.find((c) => c.id === U().tasteCompare) || tp.compare[0];
    const open = U().tasteCompareOpen;
    const mine = new Set(tp.donut.map((d) => d.vibe));
    const shared = sel.themes.filter((t) => mine.has(t));
    return `<div class="tb-card tt-compare"><button class="row start tb-plain" data-act="tasteCompareToggle" style="gap:12px;width:100%">${stack(["You", ...sel.names], "s")}<span class="grow" style="min-width:0"><span class="tb-t14 ellipsis">Compare with ${esc(sel.name)}</span><span class="tb-s ellipsis">${sel.fair != null ? `${sel.fair}% fair blend` : "No blend yet"}${shared.length ? ` · you all like ${esc(shared[0].toLowerCase())}` : ""}</span></span>${icon(open ? "chevU" : "chevR")}</button>
      ${open ? `<div class="stack" style="gap:8px;margin-top:10px">${tp.compare.length > 1 ? `<div class="chips">${tp.compare.map((c) => `<button class="tb-chip${c.id === sel.id ? " on" : ""}" data-act="tasteCompare" data-arg="${esc(c.id)}" aria-pressed="${c.id === sel.id}">${esc(c.name)}</button>`).join("")}</div>` : ""}
        <span class="tb-s13">Shared: ${shared.length ? esc(shared.join(", ")) : "nothing strong yet"}</span><span class="tb-s13">Only you: ${esc(tp.donut.map((d) => d.vibe).filter((v) => !sel.themes.includes(v)).slice(0, 3).join(", ") || "nothing")}</span>
        <span class="tb-s">Taste overlap only. Nobody's budget, saves or answers are shown.</span></div>` : ""}</div>`;
  }
  function gotos(tp) {
    if (!tp.hosts.length) return `<div class="row"><span class="tb-t16">Your go-tos</span></div><p class="tb-s">Hosts and venues you keep going back to show up here.</p>`;
    return `<div class="row"><span class="tb-t16">Your go-tos</span><span class="tb-s">Hosts you keep coming back to</span></div>
      <div class="tt-gotos hscroll">${tp.hosts.map((h, i) => `<div class="tt-go"><div class="tt-go-ph c${i % 3}"><button class="icon-btn tt-heart" data-act="tasteFollowToggle" data-arg="${esc(h.kind)}|${esc(h.name)}|${h.followed ? 0 : 1}" aria-pressed="${h.followed}" aria-label="${h.followed ? `Unfollow ${esc(h.name)}` : `Follow ${esc(h.name)}`}">${icon(h.followed ? "heart" : "heart")}</button>${icon(h.kind === "venue" ? "pin" : "crew", "lg")}</div>
        <button class="tt-go-b" data-act="openWhere" data-arg="host|${esc(h.kind)}:${esc(h.name)}"><b class="tb-t14 ellipsis">${esc(h.name)}</b><span class="tb-s">${h.kind === "venue" ? "Venue" : "Organiser"}${h.nights ? ` · ${plural(h.nights, "night")}` : " · following"}</span></button></div>`).join("")}</div>`;
  }
  const SEE = { everyone: "Everyone", friends: "Friends", squads: "Your squads", nobody: "Only you" };
  function lists(tp) {
    const s = me().settings;
    const k = tp.lists.followKinds;
    const fk = [k.artist ? plural(k.artist, "artist") : "", k.venue ? plural(k.venue, "venue") : "", k.organiser ? plural(k.organiser, "organiser") : ""].filter(Boolean).join(", ");
    const row = (tone, ic, title, sub, a) => `<button class="tt-list" ${SQ.attr(a)}><span class="tb-rnd ${tone}">${SQ.ix(ic)}</span><span class="grow" style="min-width:0"><span class="tb-t14">${esc(title)}</span><span class="tb-s ellipsis">${esc(sub)}</span></span>${icon("chevR")}</button>`;
    return `<div class="row"><span class="tb-t16">Lists · 4</span></div><div>
      ${row("iv", "ticket", "Going", `${SEE[s.privacy.seeGoing]} · ${plural(tp.lists.going, "event")}`, { "data-act": "sqTabGo", "data-arg": "events" })}
      ${row("it", "bookmark", "Saved", `Private · ${plural(tp.lists.saved, "event or place", "events and places")}`, { "data-act": "sqTabGo", "data-arg": "saved" })}
      ${row("ia", "heart", "Following", `${SEE[s.privacy.seeGoing] === "Only you" ? "Only you" : "Friends"} · ${fk || "nobody yet"}`, { "data-act": "tasteEditAt", "data-arg": "follows" })}
      ${row("in", "x", "Dealbreakers", `Private · ${tp.lists.dealbreakers} · only used to filter`, { "data-act": "tasteEditAt", "data-arg": "deal" })}</div>`;
  }
  const freshBanner = (tp) => (tp.fresh ? `<div class="tb-card amber-edge row"><span class="tb-s13 grow">You started fresh. Undo until ${esc(new Date(tp.fresh.until).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }))} tomorrow.</span>${tbtn("Undo", { "data-act": "tasteFreshUndo", "data-pending": "Undoing" }, "o sm", "undo")}</div>` : "");
  S.taste = { role: "attendee", label: "Taste", render: () => {
    const tp = TP();
    const patterns = tp.patterns.length ? `${lab("What we've learned")}${tp.patterns.map((p) => `<div class="tt-pat"><span class="tb-sq ${p.icon === "crew" ? "ip" : "iv"}">${icon(p.icon)}</span><span class="grow" style="min-width:0"><b class="tb-t13">${esc(p.text)}</b><span class="tb-s">${esc(p.from)}</span></span></div>`).join("")}` : `${lab("What we've learned")}<p class="tb-s">Patterns show up after a couple of nights out.</p>`;
    const retune = `<div class="tb-card violet-edge row"><span class="grow" style="min-width:0"><b class="tb-t14">Picks feeling off?</b><span class="tb-s" style="display:block">Six quick this-or-that picks</span></span>${tbtn("Retune", { "data-act": "openRetune" }, "v")}</div>`;
    return screen(`<div class="tb-pad tt">
        ${freshBanner(tp)}
        <div class="tt-cols"><div class="stack" style="gap:14px">${tasteHero(tp)}${desk() ? "" : compare(tp)}${gotos(tp)}${patterns}</div>
        <div class="stack" style="gap:14px">${desk() ? compare(tp) : ""}${lists(tp)}${retune}</div></div>
      </div>${whereSheet()}${undoToast()}`, { title: "Your taste", cls: "tb-screen" });
  } };
  A.tasteMore = () => { U().tasteMore = !U().tasteMore; };
  A.tasteCompareToggle = () => { U().tasteCompareOpen = !U().tasteCompareOpen; };
  A.tasteCompare = (id) => { U().tasteCompare = id; };
  A.sqTabGo = (t) => { U().sqTab = t; return "questlog"; };
  A.tasteEditAt = (where) => { U().tasteEditAt = where; return "taste-edit"; };

  // ---------- Edit taste ----------
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const TIMES = ["Before 7", "7–9 PM", "After 9"];
  const chipBtn = (label, on, a) => `<button class="tb-chip${on ? " on" : ""}" aria-pressed="${on}" ${SQ.attr(a)}>${esc(label)}</button>`;
  function vibeRow(r) {
    const lv = r.edited === 0 ? "Off" : r.level;
    return `<div class="te-vibe"><div class="row"><button class="tb-plain tb-t14" data-act="openWhere" data-arg="vibe|${esc(r.vibe)}">${esc(r.vibe)}</button><span class="tb-s">${esc(r.paused ? "paused for a month" : r.source || "")}</span></div>
      <div class="te-seg" role="group" aria-label="${esc(r.vibe)}">${["Less", "Some", "Lots"].map((l) => `<button class="${lv === l && !r.paused ? "on" : ""}" data-act="tasteLevel" data-arg="${esc(r.vibe)}|${l}" aria-pressed="${lv === l && !r.paused}">${l}</button>`).join("")}
        <button class="te-pause${r.paused ? " on" : ""}" data-act="tastePause" data-arg="${esc(r.vibe)}|${r.paused ? 0 : 1}" aria-pressed="${!!r.paused}" aria-label="${r.paused ? `Unpause ${esc(r.vibe)}` : `Pause ${esc(r.vibe)} for a month`}">${ix("pause")}</button></div></div>`;
  }
  const slider = (name, lo, mid, hi, val, src, act, min, max) => `<div class="te-slider"><div class="row"><b class="tb-t14">${esc(name)}</b><span class="tb-s">${esc(src)}</span></div>
      <input type="range" min="${min}" max="${max}" step="1" value="${val}" data-change="${act}" aria-label="${esc(name)}" style="--fill:${((val - min) / (max - min)) * 100}%">
      <div class="row"><span class="tb-s">${lo}</span><span class="tb-s">${mid}</span><span class="tb-s">${hi}</span></div></div>`;
  S["taste-edit"] = { role: "attendee", label: "Edit taste", render: () => {
    const tp = TP();
    const p = tp.prefs;
    const shown = tp.vibes.filter((r) => r.weight > 0 || r.edited != null || r.paused || r.picked);
    const others = SQ.d.vocab.VIBES.filter((v) => !shown.some((r) => r.vibe === v));
    const addOpen = U().vibeAdd;
    const open = U().tasteOpen || {};
    const vibes = `<div class="stack" style="gap:12px">${lab("Vibes · pause one for a month with ❚❚")}${shown.map(vibeRow).join("") || '<p class="tb-s">No vibes yet. Add one below.</p>'}
      <button class="tb-link" data-act="vibeAddToggle" style="align-self:flex-start">${addOpen ? "Done adding" : "+ Add a vibe"}</button>
      ${addOpen ? `<div class="chips">${others.map((v) => chipBtn(v, false, { "data-act": "tasteLevel", "data-arg": `${v}|Some` })).join("")}</div>` : ""}</div>`;
    const sliders = `<div class="stack" style="gap:14px">${slider("Energy", "Chill", "Mixed", "Wild", Math.round((p.energy == null ? 0 : p.energy) * 100), p.energySet ? "you set this" : p.energy != null ? "from your nights" : "not set yet", "tasteEnergy", -100, 100)}
      ${slider("Surprise me", "Familiar", "Some new", "Lots new", Math.round(p.surprise * 100), p.surpriseSet ? "you set this" : "automatic", "tasteSurprise", 0, 100)}</div>`;
    const when = `<div class="stack" style="gap:8px" id="te-when">${lab("When you go out")}<div class="chips">${DAYS.map((d) => chipBtn(d, p.days.includes(d), { "data-act": "tasteDay", "data-arg": d })).join("")}</div>
      <div class="chips">${TIMES.map((t) => chipBtn(t, p.times.includes(t), { "data-act": "tasteTime", "data-arg": t })).join("")}</div><span class="tb-s">None picked means any day or time.</span></div>`;
    const travel = `<div class="stack" style="gap:8px">${lab("Travel limit")}<div class="chips">${[15, 30, 45, 60].map((m) => chipBtn(`${m} min`, p.maxMinutes === m, { "data-act": "tasteTravel", "data-arg": p.maxMinutes === m ? "" : m })).join("")}</div>
      <span class="tb-s">${p.travelUsual ? `You usually go up to about ${p.travelUsual} min. Just a suggestion.` : "Trips longer than this are left out of your picks."}${me().origin ? "" : ' Set where trips start in <button class="tb-link sm" data-go="prefs">Getting around</button>.'}</span></div>`;
    const BUD = [["0", "Free"], ["10", "$10"], ["20", "$20"], ["40", "$40"], ["", "Any"]];
    const ACCESS = ["Step-free entrance", "Seating", "Quiet room", "Captions or ASL", "Gender-neutral washroom"];
    const lockRow = (k, t, v, inner) => `<div class="te-lock"><button class="row start tb-plain" data-act="tasteOpen" data-arg="${k}" aria-expanded="${!!open[k]}" style="gap:12px;width:100%"><span class="tb-sq in">${ix("lock")}</span><span class="grow" style="min-width:0"><b class="tb-t14">${esc(t)}</b><span class="tb-s" style="display:block">${esc(v)}</span></span>${icon(open[k] ? "chevU" : "chevR")}</button>${open[k] ? `<div style="padding-top:10px">${inner}</div>` : ""}</div>`;
    const priv = `${lockRow("budget", "Budget", `Only you see this · ${p.budget == null ? "any price" : p.budget ? `up to $${p.budget}` : "free only"}`, `<div class="chips">${BUD.map(([v, l]) => chipBtn(l, String(p.budget == null ? "" : p.budget) === v, { "data-act": "tasteBudget", "data-arg": v })).join("")}</div>`)}
      ${lockRow("access", "Access needs", `Private · ${p.access.length ? p.access.join(", ") : "used only to filter"}`, `<div class="chips">${ACCESS.map((a) => chipBtn(a, p.access.includes(a), { "data-act": "tasteAccess", "data-arg": a })).join("")}</div><p class="tb-s" style="margin-top:6px">Never shown to anyone. Listings without access info say "Access not listed" instead of disappearing.</p>`)}`;
    const deal = `<div class="stack" style="gap:8px" id="te-deal">${lab("Dealbreakers · private")}<div class="chips">${tp.dealbreakers.map((d) => `<button class="tb-chip" data-act="tasteDeal" data-arg="${esc(d.kind)}|${esc(d.value)}" aria-label="Remove ${esc(d.label)} from dealbreakers">${esc(d.label)}${icon("x", "xs")}</button>`).join("") || '<span class="tb-s">None. "Not for me" on a host, or Off on a vibe, adds one.</span>'}</div>
      <form class="sq-compose" data-act="tasteNever"><input data-bind="neverText" value="${esc(U().neverText || "")}" placeholder="Add one, like Big clubs" aria-label="Add a dealbreaker"><button class="icon-btn" type="submit" aria-label="Add dealbreaker">${icon("plus")}</button></form></div>`;
    const fk = U().followKind || "artist";
    const follows = `<div class="stack" style="gap:8px" id="te-follows">${lab("Following")}<div class="chips">${tp.follows.map((f) => `<button class="tb-chip on" data-act="tasteFollowToggle" data-arg="${esc(f.kind)}|${esc(f.name)}|0" aria-label="Unfollow ${esc(f.name)}">${esc(f.name)}${icon("x", "xs")}</button>`).join("") || '<span class="tb-s">Follow artists, venues and organisers to see more of them.</span>'}</div>
      <div class="chips">${[["artist", "Artist"], ["venue", "Venue"], ["organiser", "Organiser"]].map(([k, l]) => chipBtn(l, fk === k, { "data-act": "followKind", "data-arg": k })).join("")}</div>
      <form class="sq-compose" data-act="tasteFollowAdd"><input data-bind="followText" value="${esc(U().followText || "")}" placeholder="+ Follow ${fk === "artist" ? "an artist" : fk === "venue" ? "a venue" : "a host"}" aria-label="Name to follow"><button class="icon-btn" type="submit" aria-label="Follow">${icon("plus")}</button></form></div>`;
    const fresh = U().freshConfirm
      ? `<div class="tb-card danger-edge stack" style="gap:8px"><b class="tb-t14">Clear learned taste?</b><span class="tb-s13">Your learned vibes and every signal go. Follows, saves, tickets, history and private settings stay. Picks will feel more general for a while. You can undo this for 24 hours.</span>
        <div class="row" style="gap:8px">${tbtn("Clear learned taste", { "data-act": "tasteFresh", "data-pending": "Clearing" }, "danger")}${tbtn("Cancel", { "data-act": "freshCancel" }, "o")}</div></div>`
      : tbtn("Start fresh", { "data-act": "freshAsk" }, "danger-line");
    const right = `<button class="tb-btn o sm" data-back>Done</button>`;
    const cols = desk() ? `<div class="te-cols"><div class="stack" style="gap:18px">${vibes}</div><div class="stack" style="gap:18px">${sliders}${when}${travel}</div><div class="stack" style="gap:18px">${priv}${deal}${follows}${fresh}</div></div>`
      : `<div class="stack" style="gap:22px">${vibes}${sliders}${when}${travel}${priv}${deal}${follows}${fresh}</div>`;
    return screen(`<div class="tb-pad">${freshBanner(tp)}${cols}</div>${whereSheet()}${undoToast()}`, { title: "Edit taste", right, cls: "tb-screen" });
  } };
  // After the edit screen draws, jump to the section a list row asked for
  const after = SQ.afterRender;
  SQ.afterRender = (root) => {
    if (after) after(root);
    if (U().screen === "taste-edit" && U().tasteEditAt) {
      const el = root.querySelector(`#te-${U().tasteEditAt}`);
      U().tasteEditAt = null;
      if (el) el.scrollIntoView({ block: "center" });
    }
    if (me() && SQ.applySettings) SQ.applySettings();
  };
  const arg2 = (a) => {
    const i = String(a).lastIndexOf("|");
    return [a.slice(0, i), a.slice(i + 1)];
  };
  A.tasteLevel = (a) => {
    const [vibe, level] = arg2(a);
    return tasteAct("tasteLevel", { vibe, level });
  };
  A.tastePause = (a) => {
    const [vibe, on] = arg2(a);
    return tasteAct("tastePause", { vibe, on: on === "1" });
  };
  A.tasteEnergy = (v) => tasteAct("tastePrefs", { energy: Number(v) / 100, label: `Energy set to ${Number(v) < -33 ? "chill" : Number(v) > 33 ? "wild" : "mixed"}` });
  A.tasteSurprise = (v) => tasteAct("tastePrefs", { surprise: Number(v) / 100, label: `Surprise me set to ${Number(v) < 25 ? "familiar" : Number(v) > 66 ? "lots new" : "some new"}` });
  const toggleIn = (list, x) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  A.tasteDay = (d) => tasteAct("tastePrefs", { days: toggleIn(TP().prefs.days, d), label: `${d} ${TP().prefs.days.includes(d) ? "off" : "on"}` });
  A.tasteTime = (t) => tasteAct("tastePrefs", { times: toggleIn(TP().prefs.times, t), label: `${t} ${TP().prefs.times.includes(t) ? "off" : "on"}` });
  A.tasteTravel = (m) => tasteAct("tastePrefs", { maxMinutes: m === "" ? null : Number(m), label: m === "" ? "No travel limit" : `Travel limit set to ${m} min` });
  A.tasteBudget = (b) => tasteAct("tastePrefs", { budget: b, label: b === "" ? "Budget: any" : `Budget set` });
  A.tasteAccess = (a) => tasteAct("tastePrefs", { access: toggleIn(TP().prefs.access, a), label: "Access needs updated" });
  A.tasteOpen = (k) => { U().tasteOpen = { ...(U().tasteOpen || {}), [k]: !(U().tasteOpen || {})[k] }; };
  A.vibeAddToggle = () => { U().vibeAdd = !U().vibeAdd; };
  A.tasteDeal = (a) => {
    const i = a.indexOf("|");
    return tasteAct("tasteDealbreaker", { kind: a.slice(0, i), value: a.slice(i + 1) });
  };
  A.tasteNever = () => {
    const x = (U().neverText || "").trim();
    if (!x) return;
    U().neverText = "";
    return tasteAct("tastePrefs", { never: [...TP().prefs.never, x], label: `${x} added to dealbreakers` });
  };
  A.followKind = (k) => { U().followKind = k; };
  A.tasteFollowToggle = (a) => {
    const [kind, ...rest] = String(a).split("|");
    const on = rest.pop() === "1";
    return tasteAct("tasteFollow", { name: rest.join("|"), kind, on });
  };
  A.tasteFollowAdd = () => {
    const n = (U().followText || "").trim();
    if (!n) return;
    U().followText = "";
    return tasteAct("tasteFollow", { name: n, kind: U().followKind || "artist", on: true });
  };
  A.tasteForget = (a) => {
    const [t, ...rest] = String(a).split("|");
    if (t === "follow") return tasteAct("tasteForget", { follow: rest.join("|") });
    return tasteAct("tasteForget", { t: Number(t), id: rest[0] === "" ? null : Number(rest[0]) });
  };
  A.freshAsk = () => { U().freshConfirm = true; };
  A.freshCancel = () => { U().freshConfirm = false; };
  A.tasteFresh = async () => {
    const r = await SQ.act("tasteFresh");
    U().freshConfirm = false;
    SQ.toast(r.label);
  };
  A.tasteFreshUndo = async () => {
    const r = await SQ.act("tasteFreshUndo");
    SQ.toast(r.label);
  };

  // ---------- Quick retune: 5 or 6 "this or that" pairs of real upcoming events ----------
  async function loadPairs() {
    const R = (U().retune = { loading: true, since: Date.now(), pairs: [], i: 0, answers: [], error: null, result: null });
    SQ.render();
    try {
      const r = await SQ.act("retunePairs");
      Object.assign(R, { loading: false, pairs: r.pairs });
    } catch (err) {
      Object.assign(R, { loading: false, error: err.message });
    }
    SQ.render();
  }
  A.openRetune = () => {
    loadPairs();
    return "retune";
  };
  A.retuneRetry = () => loadPairs();
  const pickCard = (e, side) => {
    const place = e.type === "place";
    return `<button class="rt-card ${place ? "teal" : "violet"}" data-act="retunePick" data-arg="${side}"><span class="row start">${pill(place ? "Place" : "Event", place ? "teal" : "violet", place ? "pin" : "ticket")}</span>
      <b class="rt-t">${esc(e.title)}</b><span class="tb-s13">${esc([SQ.tbDayLabel(e.startsAt), SQ.tbTimeLabel(e.startsAt), e.venue && e.venue.name !== "N/A" ? e.venue.name : e.neighbourhood].filter(Boolean).join(" · "))}</span></button>`;
  };
  S.retune = { role: "attendee", label: "Quick retune", render: () => {
    const R = U().retune || { loading: true, pairs: [], i: 0, answers: [] };
    const n = R.pairs.length;
    let body;
    if (R.loading) body = SQ.waiting(R.since, { skeleton: `<div class="stack" style="gap:12px">${SQ.sk.line("70%", 28)}${SQ.sk.line("100%", 110)}${SQ.sk.line("100%", 110)}</div>`, message: "Finding real events to compare…" });
    else if (R.error) body = SQ.errorBlock("Couldn't load the picks", "That didn't go through. Your taste hasn't changed.", "retuneRetry");
    else if (R.result) body = `<div class="tb-empty"><p class="tb-t">${esc(R.result.label)}</p><p class="tb-s">Your Discover picks use these answers straight away.</p>
        <div class="row" style="gap:8px">${tbtn("Undo", { "data-act": "retuneUndo", "data-pending": "Undoing" }, "o", "undo")}${tbtn("Done", { "data-act": "retuneDoneNav" }, "v")}</div></div>`;
    else if (!n) body = `<div class="tb-empty"><p class="tb-t">Not enough to compare right now</p><p class="tb-s">There aren't enough upcoming events in your picks to make fair pairs. Try again later in the week.</p>${tbtn("Back to your taste", { "data-back": "" }, "o")}</div>`;
    else {
      const pr = R.pairs[Math.min(R.i, n - 1)];
      const a = ev(pr.a), b = ev(pr.b);
      body = `<div class="rt-prog" aria-hidden="true">${R.pairs.map((_, k) => `<i class="${k <= R.i ? "on" : ""}"></i>`).join("")}</div>
        <h1 class="rt-h">Which would you rather?</h1><p class="tb-s13" style="text-align:center">${esc(pr.why)} Real events coming up.</p>
        ${a ? pickCard(a, "a") : ""}${b ? pickCard(b, "b") : ""}
        <div class="row" style="gap:8px">${tbtn("Both", { "data-act": "retunePick", "data-arg": "both" }, "o grow")}${tbtn("Neither", { "data-act": "retunePick", "data-arg": "neither" }, "o grow")}${tbtn("Skip", { "data-act": "retunePick", "data-arg": "skip" }, "o grow")}</div>`;
    }
    const count = n && !R.result ? `<span class="tb-s">${Math.min(R.i + 1, n)} / ${n}</span>` : "";
    return screen(`<div class="tb-pad stack rt" style="gap:14px">${body}</div>`, { title: "Quick retune", right: count, cls: "tb-screen" });
  } };
  A.retunePick = async (choice) => {
    const R = U().retune;
    const pr = R.pairs[R.i];
    R.answers.push({ a: pr.a, b: pr.b, choice });
    if (R.i + 1 < R.pairs.length) {
      R.i++;
      return;
    }
    R.result = await SQ.act("retuneDone", { answers: R.answers });
  };
  A.retuneUndo = async () => {
    await SQ.act("tasteUndo");
    U().retune.result = { label: "Undone. Your picks are back as they were." };
  };
  A.retuneDoneNav = () => SQ.back();

  SQ.screens = Object.assign(SQ.screens || {}, S);
})();
