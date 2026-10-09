// Sketch 0 front end: Discover (solo or Crew Blend), Quest Log ("did you go?" + rating),
// Requests (Quest Requests), Hosts (Demand Insights).

const ORIGINS = {
  union: "Downtown (Union)",
  finch: "North York (Finch)",
  kennedy: "Scarborough (Kennedy)",
  kipling: "Etobicoke (Kipling)",
};
const BUDGETS = [
  { value: "0", label: "Free" },
  { value: "10", label: "$10" },
  { value: "20", label: "$20" },
  { value: "40", label: "$40" },
  { value: "", label: "Any" },
];
const WHEN = ["Weeknights", "Fridays", "Saturdays", "Sundays", "Any time"];
const CREW_SIZES = ["Solo", "2 to 4", "5+"];
const RATE_TAGS = ["The people", "The vibe", "The price", "Easy to get to", "My crew"];
const MAX_CREW = 4;
const EVENT_YEAR = 2026; // events.json dates have no year

const ICONS = {
  train: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9.5" cy="14" r=".6"/><circle cx="14.5" cy="14" r=".6"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12.5h2"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11M12 20V5M19 20v-6"/></svg>',
  thumbDown: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 15v4a2 2 0 0 0 2 2l3-7V4H7.5a2 2 0 0 0-2 1.6l-1.3 7A2 2 0 0 0 6.2 15z"/><path d="M15 4h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 0 0-6V6H3z"/><path d="M14 6v12" stroke-dasharray="2 2"/></svg>',
};

// ---------- Per-viewer storage (may be unavailable; the app works without it) ----------
function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
const KEYS = {
  log: "sidequest.going", // kept from earlier versions so saved quests survive
  me: "sidequest.me",
  myRequests: "sidequest.myRequests",
  votes: "sidequest.votes",
  seenClaims: "sidequest.seenClaims",
  host: "sidequest.host",
};

// "You" is remembered between visits, standing in for onboarding
const me = load(KEYS.me, {});
const state = {
  crew: [{ name: me.name || "You", interests: me.interests || "", budget: me.budget ?? "", origin: me.origin || "" }],
  maxMinutes: me.maxMinutes ?? "30",
  result: null, // last /api/match answer
  query: null, // the query that produced it, to spot stale results
  rejected: {}, // event id -> names who said "not for me" in this search
  requested: {}, // unmet interest -> true once requested from Discover
  log: load(KEYS.log, []),
  logFilter: "upcoming",
  rating: null, // { id, stars, tags } while rating a quest
  requests: [],
  myRequests: load(KEYS.myRequests, []),
  votes: load(KEYS.votes, []),
  seenClaims: load(KEYS.seenClaims, []),
  formOpen: false,
  draft: { text: "", origin: me.origin || "", when: "Any time", size: "Solo", budget: "" },
  host: load(KEYS.host, ""),
};

const $ = (id) => document.getElementById(id);
const crewEl = $("crew");
const maxChips = $("max-minutes");
const goBtn = $("go");
const resultsEl = $("results");

function saveMe() {
  const p = state.crew[0];
  store(KEYS.me, { name: p.name, interests: p.interests, budget: p.budget, origin: p.origin, maxMinutes: state.maxMinutes });
}

async function api(url, body) {
  let res;
  try {
    res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  } catch {
    throw new Error("Couldn't reach the app's server. Start it with `node server.js`, then open http://localhost:3000.");
  }
  let data;
  try {
    data = JSON.parse(await res.text());
  } catch {
    throw new Error(
      `The app's server didn't answer (status ${res.status}). Start it in Terminal with \`node server.js\` from the sketch-0 folder, then open http://localhost:3000 — don't open index.html directly.`
    );
  }
  if (data.error) throw new Error(data.error);
  return data;
}

// ---------- Crew ----------
function originOptions(selected, anyLabel) {
  return [`<option value="">${anyLabel}</option>`, ...Object.entries(ORIGINS).map(([v, l]) => `<option value="${v}" ${v === selected ? "selected" : ""}>${l}</option>`)].join("");
}

function renderCrew() {
  crewEl.innerHTML = state.crew
    .map(
      (p, i) => `
      <div class="person" data-index="${i}">
        <div class="person-head">
          <span class="avatar ${i === 0 ? "dark" : ""}">${escape(initial(p.name, i))}</span>
          <input type="text" class="name" value="${escape(p.name)}" placeholder="${i === 0 ? "You" : `Friend ${i + 1}`}" aria-label="Name" maxlength="30" />
          ${i > 0 ? `<button type="button" class="icon-btn remove" aria-label="Remove ${escape(p.name || "friend")}">${ICONS.close}</button>` : ""}
        </div>
        <label class="field-label" for="interests-${i}">${i === 0 ? "What are you into?" : "What are they into?"}</label>
        <textarea id="interests-${i}" class="interests" rows="2" placeholder="${i === 0 ? "e.g. jazz, climbing, zines" : "e.g. film, board games, running"}">${escape(p.interests)}</textarea>
        <div class="field-label">${i === 0 ? "Willing to spend" : "They'll spend"}</div>
        <div class="chips budget" role="radiogroup" aria-label="Budget">
          ${BUDGETS.map((b) => `<button type="button" role="radio" data-value="${b.value}" aria-checked="${String(p.budget) === b.value}">${b.label}</button>`).join("")}
        </div>
        <label class="field-label" for="origin-${i}">Starting from</label>
        <div class="select-wrap">
          <select id="origin-${i}" class="origin">${originOptions(p.origin, "Anywhere (no travel limit)")}</select>
        </div>
      </div>`
    )
    .join("");
  const n = state.crew.length;
  $("add-friend").hidden = n >= MAX_CREW;
  $("crew-hint").textContent = n === 1 ? "Just you" : `Crew Blend · ${n} people`;
  goBtn.textContent = n === 1 ? "Find your quest" : `Blend quests for ${n}`;
}

function initial(name, i) {
  return (name.trim()[0] || (i === 0 ? "Y" : String(i + 1))).toUpperCase();
}

crewEl.addEventListener("input", (ev) => {
  const card = ev.target.closest(".person");
  if (!card) return;
  const i = Number(card.dataset.index);
  if (ev.target.classList.contains("name")) {
    state.crew[i].name = ev.target.value;
    card.querySelector(".avatar").textContent = initial(ev.target.value, i);
  }
  if (ev.target.classList.contains("interests")) {
    state.crew[i].interests = ev.target.value;
    ev.target.classList.remove("invalid");
  }
  if (i === 0) saveMe();
  checkStale();
});

crewEl.addEventListener("change", (ev) => {
  const card = ev.target.closest(".person");
  if (!card || !ev.target.classList.contains("origin")) return;
  const i = Number(card.dataset.index);
  state.crew[i].origin = ev.target.value;
  if (i === 0) saveMe();
  renderTravel();
  checkStale();
});

crewEl.addEventListener("click", (ev) => {
  const card = ev.target.closest(".person");
  if (!card) return;
  const i = Number(card.dataset.index);
  const chip = ev.target.closest(".budget button");
  if (chip) {
    state.crew[i].budget = chip.dataset.value;
    card.querySelectorAll(".budget button").forEach((b) => b.setAttribute("aria-checked", b === chip));
    if (i === 0) saveMe();
    checkStale();
  }
  if (ev.target.closest(".remove")) {
    state.crew.splice(i, 1);
    renderCrew();
    renderTravel();
    checkStale();
  }
});

$("add-friend").addEventListener("click", () => {
  if (state.crew.length >= MAX_CREW) return;
  state.crew.push({ name: "", interests: "", budget: "", origin: "" });
  renderCrew();
  const inputs = crewEl.querySelectorAll(".person .name");
  inputs[inputs.length - 1].focus();
  checkStale();
});

// ---------- Travel ----------
function renderTravel() {
  maxChips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b.dataset.value === state.maxMinutes));
  const noOrigin = !state.crew.some((p) => p.origin);
  maxChips.classList.toggle("disabled", noOrigin);
  $("travel-help").hidden = !noOrigin;
}
maxChips.addEventListener("click", (ev) => {
  const chip = ev.target.closest("button");
  if (!chip) return;
  state.maxMinutes = chip.dataset.value;
  saveMe();
  renderTravel();
  checkStale();
});

// ---------- Search ----------
function currentQuery() {
  const anyOrigin = state.crew.some((p) => p.origin);
  return {
    people: state.crew.map((p, i) => ({
      name: p.name.trim() || (i === 0 ? "You" : `Friend ${i + 1}`),
      interests: p.interests.trim(),
      budget: p.budget,
      origin: p.origin,
    })),
    maxMinutes: anyOrigin ? state.maxMinutes : "",
  };
}

// Limits are applied on the server, so changing them means searching again
function checkStale() {
  const banner = $("stale");
  const stale = state.result && JSON.stringify(currentQuery()) !== state.query;
  if (stale && !banner) {
    resultsEl.insertAdjacentHTML(
      "afterbegin",
      `<div class="stale" id="stale"><span>You changed your crew or limits.</span><button type="button" id="stale-go">Update</button></div>`
    );
    $("stale-go").addEventListener("click", search);
  } else if (!stale && banner) {
    banner.remove();
  }
}

goBtn.addEventListener("click", search);

async function search() {
  const query = currentQuery();
  const missing = query.people.findIndex((p) => !p.interests);
  if (missing >= 0) {
    const field = crewEl.querySelectorAll(".interests")[missing];
    field.classList.add("invalid");
    field.focus();
    toast(missing === 0 ? "Tell us what you're into first." : `Add what ${query.people[missing].name} is into, or remove them.`);
    return;
  }

  goBtn.disabled = true;
  resultsEl.innerHTML = `<p class="loading-note">Finding quests… the AI can take 10–30 seconds.</p><div class="skeleton"></div><div class="skeleton"></div>`;
  resultsEl.scrollIntoView({ block: "start" });

  try {
    const data = await api("/api/match", query);
    state.result = data;
    state.query = JSON.stringify(query);
    state.rejected = {};
    state.requested = {};
    renderResults();
  } catch (err) {
    state.result = null;
    resultsEl.innerHTML = `<div class="error-card"><strong>Something went wrong.</strong><br>${escape(err.message)}</div>`;
  } finally {
    goBtn.disabled = false;
  }
}

// ---------- Results ----------
function renderResults() {
  const data = state.result;
  if (!data) return;
  const crew = data.people.length > 1;
  const L = data.limits;
  const n = data.matches.length;

  const pricePill = L.budget == null ? "Any price" : L.budget === 0 ? "Free only" : `Up to $${L.budget}`;
  const travelPill =
    L.origins.length && L.maxMinutes
      ? `≤ ${L.maxMinutes} min from ${L.origins.length === 1 ? ORIGINS[L.origins[0]] : `${L.origins.length} starting points`}`
      : "Any distance";
  const cut = [L.excludedPrice && `${L.excludedPrice} over budget`, L.excludedTravel && `${L.excludedTravel} too far`].filter(Boolean).join(" · ");

  let html = `
    <div class="results-head">
      <div class="eyebrow">${crew ? "Crew Blend" : "Picked for you"}</div>
      <h2>${crew ? `For ${escape(listNames(data.people))}` : n ? `${n} quest${n === 1 ? "" : "s"} worth your time` : "Nothing fits yet"}</h2>
      <p>${n ? `${crew ? `${n} pick${n === 1 ? "" : "s"} from` : "From"} the ${L.fit} of ${L.total} events that fit ${crew ? "everyone's" : "your"} limits.` : `Only ${L.fit} of ${L.total} events fit ${crew ? "everyone's" : "your"} limits, and none matched.`}</p>
      <div class="limits">
        <span class="pill">${ICONS.wallet}${escape(pricePill)}${L.budgetSetBy ? ` · ${escape(L.budgetSetBy)}'s budget` : ""}</span>
        <span class="pill">${ICONS.train}${escape(travelPill)}</span>
        ${cut ? `<span class="pill">${escape(cut)}</span>` : ""}
      </div>
    </div>`;

  if (n) {
    if (crew) html += `<button type="button" class="btn secondary share-all" id="share-all">${ICONS.share}Send all picks to the group chat</button>`;
    html += data.matches.map((e) => eventCard(e, data)).join("");
  } else {
    html += `
      <div class="card empty">
        ${ICONS.search}
        <h3>No quests fit right now</h3>
        <p>Try a higher budget, a longer trip or different interests. Or request what you're after below, so hosts know.</p>
      </div>`;
  }

  if (data.unmet && data.unmet.length) html += unmetBox(data.unmet, crew);

  html += `<p class="notice">${
    data.mode === "ai" ? "Matches are picked by an AI model and may be wrong. Tell us when one's not for you." : "No AI available: matching by simple keywords, not AI."
  } Events, prices, reviews, organizers, attendees, friends and travel times are made-up sample data. “I'd go” saves your intent; we only count it as attendance once you confirm you went.</p>`;

  resultsEl.innerHTML = html;
  const shareAll = $("share-all");
  if (shareAll) shareAll.addEventListener("click", () => share(data.matches.map((e) => planText(e, data)).join("\n\n") + `\n\nBlended on Sidequest for ${listNames(data.people)}`));
}

function tripFor(e, origin) {
  return origin && e.travel ? e.travel.from[origin] : null;
}

function minutesLabel(m) {
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

function eventCard(e, data) {
  const crew = data.people.length > 1;
  const rejected = state.rejected[e.id] || [];
  // Solo: "not for me" hides the pick. Crew: hidden once everyone has said no.
  if (rejected.length >= data.people.length) {
    return `
      <div class="event-hidden" data-id="${e.id}">
        <span><strong>${escape(e.title)}</strong> hidden. Thanks, that helps us pick better.</span>
        <button type="button" class="link-btn undo-reject" data-id="${e.id}">Undo</button>
      </div>`;
  }

  const [dow, mon, day, time] = dateParts(e.date);
  const saved = state.log.some((g) => g.id === e.id);

  const fits = crew
    ? `<ul class="fits">${data.people
        .map((name, i) => {
          const no = rejected.includes(name);
          const why = (e.fits && e.fits[name]) || "";
          const trip = tripFor(e, data.origins[name]);
          const whyText = no ? "Said not for them" : why || (i === 0 ? "Not really your thing" : "Not really their thing");
          return `<li class="${why && !no ? "" : "miss"}"><span class="avatar small">${escape(initial(name, 0))}</span><span class="who">${escape(name)}</span><span class="why">${escape(whyText)}</span>${trip ? `<span class="trip">${minutesLabel(trip.minutes)}</span>` : ""}</li>`;
        })
        .join("")}</ul>`
    : "";

  const rejectBtn = crew
    ? `<button type="button" class="link-btn reject-open" data-id="${e.id}">${ICONS.thumbDown}Not for someone?</button>
       <div class="reject-pick" id="reject-${e.id}" hidden>
         <span>Who's it not for?</span>
         ${data.people.map((name) => `<button type="button" class="chip-btn reject" data-id="${e.id}" data-person="${escape(name)}" ${rejected.includes(name) ? "disabled" : ""}>${escape(name)}</button>`).join("")}
       </div>`
    : `<button type="button" class="link-btn reject" data-id="${e.id}" data-person="${escape(data.people[0])}">${ICONS.thumbDown}Not for me</button>`;

  return `
    <article class="event">
      <div class="event-art" data-scene="${escape(e.scene)}">
        <span class="scene-tag">${escape(e.scene)}</span>
        <div class="date-tile" aria-hidden="true"><div class="mon">${escape(mon.toUpperCase())}</div><div class="day">${escape(day)}</div></div>
      </div>
      <div class="event-body">
        <div class="event-top">
          <h3>${escape(e.title)}</h3>
          <span class="price ${e.price === 0 ? "free" : ""}">${escape(priceLabel(e))}</span>
        </div>
        <div class="meta">${escape(dow)} · ${escape(time)} · ${escape(e.neighbourhood)}${e.priceNote ? ` · <span class="price-note">${escape(e.priceNote)}</span>` : ""}</div>
        ${travelLine(e, data)}
        <p class="description">${escape(e.description)}</p>
        <div class="reason"><b>Why this</b>${escape(e.reason)}</div>
        ${fits}
        ${socialProof(e)}
        <div class="actions">
          <button type="button" class="btn ${saved ? "done" : ""} going" data-id="${e.id}">${saved ? `${ICONS.check}In your Quest Log` : "I'd go"}</button>
          <button type="button" class="btn secondary share" data-id="${e.id}" aria-label="Share ${escape(e.title)}">${ICONS.share}Share</button>
        </div>
        <div class="reject-row">${rejectBtn}</div>
      </div>
    </article>`;
}

function unmetBox(unmet, crew) {
  const label = { none: "Nothing listed", price: "Over budget", travel: "Too far" };
  return `
    <div class="unmet">
      <h3>Nothing fit these</h3>
      <p>Hosts see these as Demand Signals. Request one to put it on the Requests board, where others can upvote it.</p>
      <ul>${unmet
        .map((u) => {
          const done = state.requested[u.interest];
          return `<li>
            <span class="what">${escape(u.interest)}${crew && u.person ? ` · ${escape(u.person)}` : ""}<small>${label[u.reason] || ""}</small></span>
            <button type="button" class="btn small ${done ? "done" : "secondary"} request-gap" data-interest="${escape(u.interest)}" data-person="${escape(u.person || "")}" ${done ? "disabled" : ""}>${done ? `${ICONS.check}Requested` : "Request it"}</button>
          </li>`;
        })
        .join("")}</ul>
    </div>`;
}

// "Fri Oct 2, 9 PM" -> ["Fri", "Oct", "2", "9 PM"]
function dateParts(date) {
  const [d, time = ""] = String(date).split(", ");
  const [dow = "", mon = "", day = ""] = d.split(" ");
  return [dow, mon, day, time];
}

// "Fri Oct 2, 9 PM" -> a Date (events.json has no year, so EVENT_YEAR is assumed)
function eventStart(date) {
  const [, mon, day, time] = dateParts(date);
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(mon);
  const m = time.match(/(\d+)(?::(\d+))?\s*(AM|PM)/i);
  if (month < 0 || !m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return new Date(EVENT_YEAR, month, Number(day), hour, Number(m[2] || 0));
}

// We only ask "did you go?" once the event has started (or the demo skips ahead)
function isOver(g) {
  if (g.demoPast) return true;
  const start = eventStart(g.date);
  return !start || Date.now() > start.getTime() + 2 * 60 * 60 * 1000;
}

function priceLabel(e) {
  return e.price === 0 ? "Free" : `$${e.price}`;
}

function travelLine(e, data) {
  if (!e.travel) return "";
  const trips = data.people.map((name) => tripFor(e, data.origins[name])).filter(Boolean);
  if (!trips.length) return `<div class="travel">${ICONS.train}<span>Near ${escape(e.travel.stop)}</span></div>`;
  const longest = trips.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const lead = trips.length > 1 ? `Longest trip ~${minutesLabel(longest.minutes)}` : `~${minutesLabel(longest.minutes)}`;
  const transfers = longest.transfers === 0 ? "no transfers" : `${longest.transfers} transfer${longest.transfers > 1 ? "s" : ""}`;
  const easy = trips.every((t) => t.minutes <= 30 && t.transfers === 0) ? `<span class="badge">Transit-easy</span>` : "";
  return `<div class="travel">${ICONS.train}<span>${lead} · ${transfers} · near ${escape(e.travel.stop)}</span>${easy}</div>`;
}

// A snippet of reviews (trust) and who's going (belonging)
function socialProof(e) {
  let html = "";
  if (e.reviews && e.reviews.length) {
    const top = [...e.reviews].sort((a, b) => b.rating - a.rating)[0];
    html += `<p>★ ${escape(e.rating)} <span class="quote">“${escape(top.text)}”</span></p>`;
  }
  if (e.organizer) {
    html += `<p>${escape(e.organizer.name)} ★ ${escape(e.organizer.rating)} <span class="quote">“${escape(e.organizer.review)}”</span></p>`;
  }
  if (e.going) {
    const friends = e.friends || [];
    const names = [...friends, ...(e.attendees || []).filter((n) => !friends.includes(n))];
    const stack = names.slice(0, 4).map((n) => `<span class="avatar small ${friends.includes(n) ? "dark" : ""}">${escape(n[0])}</span>`).join("");
    const lead = friends.length
      ? `<strong>${friends.map(escape).join(" and ")}</strong> ${friends.length > 1 ? "are" : "is"} going · ${escape(e.going)} total`
      : `${escape(e.going)} going`;
    html += `<div class="going-row"><span class="stack">${stack}</span><span>${lead}</span></div>`;
  }
  return html ? `<div class="social">${html}</div>` : "";
}

function planText(e, data) {
  const trips = data.people
    .map((name) => [name, tripFor(e, data.origins[name])])
    .filter(([, t]) => t)
    .map(([name, t]) => `${data.people.length > 1 ? `${name} ` : ""}~${t.minutes} min`);
  return [e.title, `${e.date} · ${e.neighbourhood}`, `${priceLabel(e)}${trips.length ? ` · ${trips.join(", ")}` : ""}`, e.reason ? `Why: ${e.reason}` : ""]
    .filter(Boolean)
    .join("\n");
}

resultsEl.addEventListener("click", async (ev) => {
  const data = state.result;
  if (!data) return;
  const findEvent = (el) => data.matches.find((m) => m.id === Number(el.dataset.id));

  const shareBtn = ev.target.closest("button.share");
  if (shareBtn) {
    const e = findEvent(shareBtn);
    if (e) share(`${planText(e, data)}\n\nFound on Sidequest. You in?`);
    return;
  }

  const openReject = ev.target.closest(".reject-open");
  if (openReject) {
    const pick = $(`reject-${openReject.dataset.id}`);
    pick.hidden = !pick.hidden;
    return;
  }

  const reject = ev.target.closest(".reject");
  if (reject) {
    const e = findEvent(reject);
    const person = reject.dataset.person;
    if (!e) return;
    state.rejected[e.id] = [...(state.rejected[e.id] || []), person];
    renderResults();
    api("/api/feedback", { id: e.id, person, interests: interestsOf(person) }).catch(() => {});
    if (data.people.length > 1 && state.rejected[e.id].length < data.people.length) toast(`Got it: not for ${person}.`);
    return;
  }

  const undo = ev.target.closest(".undo-reject");
  if (undo) {
    delete state.rejected[Number(undo.dataset.id)];
    renderResults();
    return;
  }

  const gap = ev.target.closest(".request-gap");
  if (gap && !gap.disabled) {
    gap.disabled = true;
    const person = state.crew.find((p, i) => (p.name.trim() || (i === 0 ? "You" : `Friend ${i + 1}`)) === gap.dataset.person) || state.crew[0];
    try {
      const { request, merged } = await api("/api/requests", {
        text: gap.dataset.interest,
        origin: person.origin,
        budget: data.limits.budget ?? "",
        size: data.people.length > 1 ? "2 to 4" : "Solo",
        when: "Any time",
        source: "gap",
      });
      rememberMine(request.id, merged);
      state.requested[gap.dataset.interest] = true;
      renderResults();
      toast(merged ? "Others asked for this too. Added your upvote." : "Requested. Hosts can see it now.");
    } catch (err) {
      gap.disabled = false;
      toast(err.message);
    }
    return;
  }

  const btn = ev.target.closest("button.going");
  if (!btn || btn.disabled || btn.classList.contains("done")) return;
  const e = findEvent(btn);
  if (!e) return;
  btn.disabled = true;
  try {
    await api("/api/going", { id: e.id, interests: JSON.parse(state.query).people.map((p) => p.interests).join(" | "), crewSize: data.people.length });
    state.log.unshift({ id: e.id, title: e.title, date: e.date, neighbourhood: e.neighbourhood, price: e.price, attended: null });
    saveLog();
    btn.classList.add("done");
    btn.innerHTML = `${ICONS.check}In your Quest Log`;
    toast("Added to your Quest Log. We'll ask if you went.");
  } catch {
    toast("Couldn't save. Try again.");
  } finally {
    btn.disabled = false;
  }
});

function interestsOf(name) {
  const q = state.query ? JSON.parse(state.query) : { people: [] };
  const p = q.people.find((x) => x.name === name);
  return p ? p.interests : "";
}

// Share into a group chat: the phone's share sheet if there is one, otherwise copy
async function share(text) {
  if (navigator.share && matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ text });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast("Copied. Paste it in your group chat.");
}

// ---------- Quest Log ----------
function saveLog() {
  store(KEYS.log, state.log);
  updateLogCount();
}

function updateLogCount() {
  const due = state.log.filter((g) => g.attended == null && isOver(g)).length;
  const badge = $("log-count");
  badge.hidden = !due;
  badge.textContent = due;
}

$("log-filter").addEventListener("click", (ev) => {
  const chip = ev.target.closest("button");
  if (!chip) return;
  state.logFilter = chip.dataset.value;
  $("log-filter").querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b === chip));
  renderLog();
});

function stars(n) {
  return "★".repeat(n) + `<span class="off">${"★".repeat(5 - n)}</span>`;
}

function renderLog() {
  const list = $("log-list");
  const upcoming = state.logFilter === "upcoming";
  const items = state.log.filter((g) => (upcoming ? g.attended == null : g.attended != null));
  if (!items.length) {
    list.innerHTML = upcoming
      ? `<div class="card empty">${ICONS.calendar}<h3>No quests yet</h3><p>Tap “I'd go” on a pick in Discover and it shows up here.</p></div>`
      : `<div class="card empty">${ICONS.check}<h3>No completed quests yet</h3><p>Once you confirm you went and rate it, it's collected here as a story.</p></div>`;
    return;
  }
  list.innerHTML = items
    .map((g) => {
      let foot;
      if (state.rating && state.rating.id === g.id) {
        const r = state.rating;
        foot = `
          <div class="rate">
            <div class="rate-q">How was it?</div>
            <div class="stars-input" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5]
              .map((n) => `<button type="button" role="radio" class="star ${n <= r.stars ? "on" : ""}" data-stars="${n}" aria-checked="${n === r.stars}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`)
              .join("")}</div>
            <div class="rate-q">What made it?</div>
            <div class="chips tags">${RATE_TAGS.map((t) => `<button type="button" role="checkbox" data-tag="${escape(t)}" aria-checked="${r.tags.includes(t)}">${escape(t)}</button>`).join("")}</div>
            <div class="btns"><button type="button" class="btn secondary" data-skip-rating>Skip</button><button type="button" class="btn" data-submit-rating ${r.stars ? "" : "disabled"}>Collect this story</button></div>
          </div>`;
      } else if (g.attended != null) {
        foot = `<div class="answered"><span>${g.attended ? `${ICONS.check} Quest complete${g.rating ? ` · <span class="stars">${stars(g.rating)}</span>` : ""}` : "You didn't go"}</span><button type="button" class="link-btn" data-remove>Remove</button></div>`;
      } else if (isOver(g)) {
        foot = `<div class="ask"><span>Did you go?</span><span class="btns"><button type="button" class="btn secondary" data-attended="no">No</button><button type="button" class="btn" data-attended="yes">Yes, I went</button></span></div>`;
      } else {
        foot = `
          <div class="ask later">
            <span>We'll ask if you went after it starts.</span>
            <button type="button" class="btn secondary small" data-tickets>${ICONS.ticket}Get tickets</button>
          </div>
          <div class="demo-row"><button type="button" class="link-btn" data-demo-past>Demo: skip to after the event</button><button type="button" class="link-btn" data-remove>Remove</button></div>`;
      }
      return `
        <div class="plan ${g.attended ? "story" : ""}" data-id="${g.id}">
          <h3>${escape(g.title)}</h3>
          <div class="meta">${escape(g.date)} · ${escape(g.neighbourhood)} · ${escape(priceLabel(g))}</div>
          ${g.tags && g.tags.length ? `<div class="meta">Made it: ${g.tags.map(escape).join(", ")}</div>` : ""}
          ${foot}
        </div>`;
    })
    .join("");
}

$("log-list").addEventListener("click", async (ev) => {
  const plan = ev.target.closest(".plan");
  if (!plan) return;
  const g = state.log.find((x) => x.id === Number(plan.dataset.id));
  if (!g) return;

  if (ev.target.closest("[data-remove]")) {
    state.log = state.log.filter((x) => x !== g);
    saveLog();
    renderLog();
    return;
  }
  if (ev.target.closest("[data-tickets]")) {
    toast("The real app links out to the host's ticket page. We don't sell tickets.");
    return;
  }
  if (ev.target.closest("[data-demo-past]")) {
    g.demoPast = true;
    saveLog();
    renderLog();
    return;
  }

  const star = ev.target.closest("[data-stars]");
  if (star && state.rating) {
    state.rating.stars = Number(star.dataset.stars);
    renderLog();
    return;
  }
  const tag = ev.target.closest("[data-tag]");
  if (tag && state.rating) {
    const t = tag.dataset.tag;
    state.rating.tags = state.rating.tags.includes(t) ? state.rating.tags.filter((x) => x !== t) : [...state.rating.tags, t];
    renderLog();
    return;
  }

  const submit = ev.target.closest("[data-submit-rating]");
  const skip = ev.target.closest("[data-skip-rating]");
  const answer = ev.target.closest("[data-attended]");
  if (answer && answer.dataset.attended === "yes") {
    state.rating = { id: g.id, stars: 0, tags: [] };
    renderLog();
    return;
  }
  if (!submit && !skip && !answer) return;

  const attended = !!(submit || skip);
  const body = { id: g.id, attended };
  if (submit) Object.assign(body, { rating: state.rating.stars, tags: state.rating.tags });
  try {
    await api("/api/attended", body);
    g.attended = attended;
    if (submit) Object.assign(g, { rating: state.rating.stars, tags: state.rating.tags });
    state.rating = null;
    saveLog();
    renderLog();
    toast(attended ? "Quest complete. That counts toward real attendance." : "Thanks. That helps us pick better.");
  } catch {
    toast("Couldn't save. Try again.");
  }
});

// ---------- Requests ----------
function rememberMine(id, merged) {
  if (merged) {
    if (!state.votes.includes(id)) state.votes.push(id);
    store(KEYS.votes, state.votes);
  } else {
    if (!state.myRequests.includes(id)) state.myRequests.push(id);
    store(KEYS.myRequests, state.myRequests);
  }
}

// Claimed requests you posted or upvoted, that you haven't seen yet: "you hear first"
function newClaims() {
  return state.requests.filter(
    (r) => r.status === "claimed" && (state.myRequests.includes(r.id) || state.votes.includes(r.id)) && !state.seenClaims.includes(r.id)
  );
}

function updateRequestsCount() {
  const n = newClaims().length;
  const badge = $("requests-count");
  badge.hidden = !n;
  badge.textContent = n;
}

async function loadRequests() {
  try {
    state.requests = (await api("/api/requests")).requests;
  } catch {
    state.requests = [];
  }
  updateRequestsCount();
}

function renderRequestForm() {
  const d = state.draft;
  const form = $("request-form");
  form.classList.toggle("card", state.formOpen);
  if (!state.formOpen) {
    form.innerHTML = `<button type="button" class="primary" id="open-form">Request a quest</button>`;
    return;
  }
  form.innerHTML = `
    <label class="field-label" for="req-text">I'd go to a…</label>
    <input type="text" id="req-text" maxlength="120" placeholder="e.g. Filipino indie night" value="${escape(d.text)}" />
    <label class="field-label" for="req-origin">Near</label>
    <div class="select-wrap"><select id="req-origin">${originOptions(d.origin, "Anywhere in Toronto")}</select></div>
    <div class="field-label">When</div>
    <div class="chips" data-field="when" role="radiogroup" aria-label="When">${WHEN.map((w) => `<button type="button" role="radio" data-value="${w}" aria-checked="${d.when === w}">${w}</button>`).join("")}</div>
    <div class="field-label">Who's coming</div>
    <div class="chips" data-field="size" role="radiogroup" aria-label="Who's coming">${CREW_SIZES.map((z) => `<button type="button" role="radio" data-value="${z}" aria-checked="${d.size === z}">${z}</button>`).join("")}</div>
    <div class="field-label">Willing to spend</div>
    <div class="chips" data-field="budget" role="radiogroup" aria-label="Budget">${BUDGETS.map((b) => `<button type="button" role="radio" data-value="${b.value}" aria-checked="${String(d.budget) === b.value}">${b.label}</button>`).join("")}</div>
    <div class="form-btns"><button type="button" class="btn secondary" id="cancel-request">Cancel</button><button type="button" class="btn" id="post-request">Post request</button></div>`;
}

$("request-form").addEventListener("input", (ev) => {
  if (ev.target.id === "req-text") state.draft.text = ev.target.value;
});
$("request-form").addEventListener("change", (ev) => {
  if (ev.target.id === "req-origin") state.draft.origin = ev.target.value;
});
$("request-form").addEventListener("click", async (ev) => {
  const chip = ev.target.closest(".chips button");
  if (chip) {
    state.draft[chip.parentElement.dataset.field] = chip.dataset.value;
    chip.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", b === chip));
    return;
  }
  if (ev.target.closest("#open-form, #cancel-request")) {
    state.formOpen = !!ev.target.closest("#open-form");
    renderRequestForm();
    if (state.formOpen) $("req-text").focus();
    return;
  }
  const post = ev.target.closest("#post-request");
  if (!post) return;
  if (!state.draft.text.trim()) {
    $("req-text").focus();
    toast("Say what kind of quest you'd go to.");
    return;
  }
  post.disabled = true;
  try {
    const { request, merged } = await api("/api/requests", { ...state.draft, source: "manual" });
    rememberMine(request.id, merged);
    state.draft.text = "";
    state.formOpen = false;
    await loadRequests();
    renderRequests();
    toast(merged ? "Someone asked for this already. Added your upvote." : "Posted. Hosts can see it now.");
  } catch (err) {
    toast(err.message);
  } finally {
    post.disabled = false;
  }
});

function requestMeta(r) {
  const money = r.budget == null ? "any budget" : r.budget === 0 ? "free" : `up to $${r.budget}`;
  return [r.when, r.origin ? `near ${ORIGINS[r.origin]}` : "anywhere", r.size === "Solo" ? "solo" : `groups of ${r.size}`, money].join(" · ");
}

function renderRequests() {
  renderRequestForm();
  const fresh = newClaims();
  $("claimed-news").innerHTML = fresh
    .map(
      (r) => `
      <div class="news">
        ${ICONS.flag}
        <span><strong>${escape(r.claimedBy)}</strong> is on it: “${escape(r.text)}”. You'll hear first when it's posted.</span>
      </div>`
    )
    .join("");
  // Seeing the news counts as hearing it
  if (fresh.length) {
    state.seenClaims.push(...fresh.map((r) => r.id));
    store(KEYS.seenClaims, state.seenClaims);
    updateRequestsCount();
  }

  $("request-list").innerHTML = state.requests.length
    ? state.requests
        .map((r) => {
          const mine = state.myRequests.includes(r.id);
          const voted = mine || state.votes.includes(r.id);
          return `
          <div class="request" data-id="${r.id}">
            <button type="button" class="vote ${voted ? "on" : ""}" aria-pressed="${voted}" aria-label="Upvote" ${mine ? "disabled" : ""}>▲<span>${r.votes}</span></button>
            <div class="request-body">
              <strong>${escape(r.text)}</strong>
              <div class="meta">${escape(requestMeta(r))}</div>
              <div class="tags-row">
                ${r.status === "claimed" ? `<span class="badge solid">Claimed by ${escape(r.claimedBy)}</span>` : `<span class="badge">Open</span>`}
                ${mine ? `<span class="badge">Your request</span>` : ""}
                ${r.source === "gap" ? `<span class="badge">From a search nothing fit</span>` : ""}
              </div>
            </div>
          </div>`;
        })
        .join("")
    : `<div class="card empty">${ICONS.flag}<h3>No requests yet</h3><p>Be the first to tell hosts what you want.</p></div>`;
}

$("request-list").addEventListener("click", async (ev) => {
  const vote = ev.target.closest(".vote");
  if (!vote || vote.disabled) return;
  const id = Number(vote.closest(".request").dataset.id);
  const undo = state.votes.includes(id);
  vote.disabled = true;
  try {
    await api("/api/requests/vote", { id, undo });
    state.votes = undo ? state.votes.filter((x) => x !== id) : [...state.votes, id];
    store(KEYS.votes, state.votes);
    await loadRequests();
    renderRequests();
  } catch (err) {
    vote.disabled = false;
    toast(err.message);
  }
});

// ---------- Hosts: Demand Insights ----------
async function renderDemand() {
  const el = $("demand");
  el.innerHTML = `<div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:220px"></div>`;
  let d;
  try {
    d = await api("/api/demand");
  } catch {
    el.innerHTML = `<div class="error-card">Couldn't load demand. Is <code>node server.js</code> running?</div>`;
    return;
  }
  if (!state.host || !d.hosts.includes(state.host)) state.host = d.hosts[0] || "A host";

  const reasonText = (r) =>
    [r.none && `${r.none}× nothing listed`, r.price && `${r.price}× over budget`, r.travel && `${r.travel}× too far`].filter(Boolean).join(" · ");
  const money = (n) => (n === 0 ? "free" : `$${n}`);
  const budgetText = (u) =>
    u.minBudget == null
      ? "Any budget"
      : `Budget ${u.minBudget === u.maxBudget ? money(u.minBudget) : `${money(u.minBudget)}–${money(u.maxBudget)}`}${u.anyBudget ? " (some any)" : ""}`;

  const requests = d.requests.length
    ? d.requests
        .map((r) => {
          const mine = r.claimedBy === state.host;
          const action =
            r.status === "open"
              ? `<button type="button" class="btn small claim" data-id="${r.id}">We're on it</button>`
              : mine
              ? `<span class="claimed-by">${ICONS.check}You claimed this <button type="button" class="link-btn unclaim" data-id="${r.id}">Undo</button></span>`
              : `<span class="claimed-by">Claimed by ${escape(r.claimedBy)}</span>`;
          return `
          <div class="demand-row">
            <div class="top"><span class="interest">${escape(r.text)}</span><span class="count">${r.votes} requester${r.votes === 1 ? "" : "s"}</span></div>
            <div class="detail">${escape(requestMeta(r))}</div>
            <div class="claim-row">${action}</div>
          </div>`;
        })
        .join("")
    : `<div class="empty"><h3>No requests yet</h3><p>Requests people post show up here.</p></div>`;

  const max = Math.max(1, ...d.unmet.map((u) => u.asks));
  const unmet = d.unmet.length
    ? d.unmet
        .map(
          (u) => `
        <div class="demand-row">
          <div class="top"><span class="interest">${escape(u.interest)}</span><span class="count">${u.asks} ask${u.asks === 1 ? "" : "s"}</span></div>
          <div class="bar"><span style="width:${Math.round((u.asks / max) * 100)}%"></span></div>
          ${u.alsoAs.length ? `<div class="detail">Also asked as: ${u.alsoAs.map(escape).join(", ")}</div>` : ""}
          <div class="detail">${escape(reasonText(u.reasons))}</div>
          <div class="detail">${escape(budgetText(u))}${u.topOrigin ? ` · Mostly from ${escape(ORIGINS[u.topOrigin] || u.topOrigin)}` : ""}</div>
        </div>`
        )
        .join("")
    : `<div class="empty">${ICONS.chart}<h3>No unmet demand yet</h3><p>When someone searches for something no event fits, it shows up here.</p></div>`;

  const funnel = d.events.length
    ? `<div class="funnel">
        <span class="h">Event</span><span class="h n">I'd go</span><span class="h n">Went</span><span class="h n">★</span>
        ${d.events
          .map(
            (e) => `<span class="t">${escape(e.title)}${e.notForMe ? `<small>${e.notForMe} said not for me</small>` : ""}</span><span class="n r">${e.interested}</span><span class="n r">${e.went}</span><span class="n r">${e.avgRating ?? "–"}</span>`
          )
          .join("")}
      </div>
      <p class="field-help">“I'd go” is intent. “Went” counts only people who confirmed afterwards, and ★ is their average rating.</p>`
    : `<div class="empty"><h3>No interest yet</h3><p>“I'd go” taps, confirmed attendance and ratings show up here.</p></div>`;

  el.innerHTML = `
    <div class="card host-pick">
      <label class="field-label" for="host-as">Viewing as host</label>
      <div class="select-wrap"><select id="host-as">${d.hosts.map((h) => `<option ${h === state.host ? "selected" : ""}>${escape(h)}</option>`).join("")}</select></div>
    </div>
    <div class="stats three">
      <div class="stat"><div class="num">${d.openRequests}</div><div class="label">Open requests</div></div>
      <div class="stat"><div class="num">${d.searches}</div><div class="label">Searches</div></div>
      <div class="stat"><div class="num">${d.searchesWithGaps}</div><div class="label">Had a gap</div></div>
    </div>
    <div class="section-head"><h2>Quest Requests</h2></div>
    <div class="card">${requests}</div>
    <p class="field-help pad">Claiming tells everyone who requested or upvoted it first.</p>
    <div class="section-head"><h2>Searched for, not found</h2></div>
    <div class="card">${unmet}</div>
    <div class="section-head"><h2>Interest vs. attendance</h2></div>
    <div class="card">${funnel}</div>
    <button type="button" class="btn secondary refresh" id="refresh-demand">Refresh</button>`;
  $("refresh-demand").addEventListener("click", renderDemand);
  $("host-as").addEventListener("change", (ev) => {
    state.host = ev.target.value;
    store(KEYS.host, state.host);
    renderDemand();
  });
}

$("demand").addEventListener("click", async (ev) => {
  const btn = ev.target.closest(".claim, .unclaim");
  if (!btn) return;
  btn.disabled = true;
  try {
    await api("/api/requests/claim", { id: Number(btn.dataset.id), host: state.host, undo: btn.classList.contains("unclaim") });
    if (!btn.classList.contains("unclaim")) toast("Claimed. Requesters hear about it first.");
    await loadRequests();
    renderDemand();
  } catch (err) {
    btn.disabled = false;
    toast(err.message);
  }
});

// ---------- Tabs ----------
document.querySelector(".tabbar").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-tab]");
  if (!btn) return;
  const tab = btn.dataset.tab;
  document.querySelectorAll(".tabbar [data-tab]").forEach((b) => b.setAttribute("aria-selected", b === btn));
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== `tab-${tab}`));
  $("scroll").scrollTop = 0;
  if (tab === "log") renderLog();
  if (tab === "requests") {
    await loadRequests();
    renderRequests();
  }
  if (tab === "hosts") renderDemand();
  if (tab === "discover") {
    renderResults(); // picks up Quest Log changes
    checkStale();
  }
});

// ---------- Helpers ----------
let toastTimer;
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

function listNames(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

renderCrew();
renderTravel();
updateLogCount();
loadRequests();
