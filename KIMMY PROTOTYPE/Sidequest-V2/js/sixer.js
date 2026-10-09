// Sidequest wireframe · Sixer, the AI guide (scripted here; uses Claude when available).
'use strict';
// =========================================================================
// Sixer chat: an agent that can act in the app
// =========================================================================
const chatEl = document.getElementById('chat');
const ai = { sample: undefined, tools: false, turns: [], busy: false, ctl: null, steps: [], picks: [], live: '', error: null, openId: null };
(async () => {
  try { const s = await window.claude?.use?.('sample'); ai.sample = s || null; if (s) ai.tools = !!(await s.limits().catch(() => null))?.tools; } catch { ai.sample = null; }
  if (!chatEl.hidden) renderChat();
})();
function openChat(prefill) { chatEl.hidden = false; chatEl.className = 'chat enter'; renderChat(); if (prefill) send(prefill); else setTimeout(() => document.getElementById('chat-in')?.focus(), 200); }
function closeChat() { chatEl.hidden = true; if (ai.openId) { const id = ai.openId; ai.openId = null; push('event', { id }); } }

function compactEvent(e, members) {
  const out = { id: e.id, title: e.title, age: e.age19 ? '19+' : 'All ages', time_of_day: slotOf(e.start), scene: SCENES[e.scene].label + (e.scene2 ? ' + ' + SCENES[e.scene2].label : ''), when: whenLabel(e.start), area: e.area, distance_from_home: distStr(distFromHome(e)), price: money(e.price), host: HOSTS[e.host].name, rating: e.rating, your_fit: fitFor('me', e), friends_going: (FRIENDS_GOING[e.id] || []).map((f) => PEOPLE[f].short), saved: S.saved.has(e.id), booked_from_demand: e.demandBooked };
  if (members) { const b = blend(members).find((x) => x.e.id === e.id); out.crew_score = b.score; out.crew_fits = Object.fromEntries(b.fits.map((x) => [PEOPLE[x.m].short, x.f])); }
  return out;
}
function searchEvents({ text, scene, area, when, max_price, time_of_day, all_ages_only } = {}) {
  let list = upcoming();
  if (time_of_day && TIMES[time_of_day]) list = list.filter((e) => slotOf(e.start) === time_of_day);
  if (all_ages_only) list = list.filter((e) => !e.age19);
  const sc = scene && SCENE_KEYS.find((k) => k === scene || SCENES[k].label.toLowerCase().includes(String(scene).toLowerCase()));
  if (sc) list = list.filter((e) => e.scene === sc || e.scene2 === sc);
  if (area) list = list.filter((e) => e.area.toLowerCase().includes(String(area).toLowerCase()) || distFromHome(e) < 2 && /near|close|home/.test(String(area)));
  if (when === 'tonight' || when === 'today') list = list.filter((e) => dayDiff(e.start) === 0);
  else if (when === 'tomorrow') list = list.filter((e) => dayDiff(e.start) === 1);
  else if (when === 'weekend') list = list.filter((e) => [5, 6, 0].includes(e.start.getDay()) && dayDiff(e.start) < 7);
  if (max_price != null && max_price !== '') list = list.filter((e) => e.price <= Number(max_price));
  if (text) { const words = String(text).toLowerCase().split(/\s+/).filter((w) => w.length > 2); const hit = list.filter((e) => words.some((w) => `${e.title} ${e.blurb} ${SCENES[e.scene].label} ${e.area}`.toLowerCase().includes(w))); if (hit.length) list = hit; }
  const t = taste();
  return list.sort((a, b) => fitFor('me', b, t) - fitFor('me', a, t)).slice(0, 8);
}
function step(s) { ai.steps.push(s); renderChat(true); }
const TOOLS = [
  { name: 'search_events', description: 'Search upcoming Toronto events. Results are ranked by the user\'s personal fit and include id, time, area, distance from home, price, host, rating, fit (0-100, shown to users only as a match tier) and friends going.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, scene: { type: 'string', enum: SCENE_KEYS }, area: { type: 'string' }, when: { type: 'string', enum: ['tonight', 'tomorrow', 'weekend', 'week'] }, time_of_day: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'late'] }, all_ages_only: { type: 'boolean', description: 'Only events open to all ages, e.g. for families or under-19s' }, max_price: { type: 'number' } } },
    execute(i) { step(`Searching${i.scene ? ' ' + SCENES[i.scene]?.label : ''}${i.when ? ' · ' + i.when : ''}${i.text ? ' · "' + i.text + '"' : ''}`); return searchEvents(i).map((e) => compactEvent(e)); } },
  { name: 'crew_blend', description: 'Rank events for a friend group. Pass friend first names (from Maya, Kai, Leila, Sam, Jordan). Returns the top events with a group score and each person\'s fit.',
    inputSchema: { type: 'object', properties: { friends: { type: 'array', items: { type: 'string' } } }, required: ['friends'] },
    execute({ friends }) { const ids = (friends || []).map((n) => FRIENDS.find((f) => PEOPLE[f].short.toLowerCase() === String(n).toLowerCase())).filter(Boolean); const members = ['me', ...new Set(ids)]; step(`Blending taste for ${members.map((m) => PEOPLE[m].short).join(', ')}`); return blend(members).slice(0, 5).map((b) => compactEvent(b.e, members)); } },
  { name: 'show_picks', description: 'Show 1-3 events as cards under your reply so the user can tap them. Call this with your shortlist before answering.',
    inputSchema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] },
    execute({ ids }) { ai.picks = (ids || []).map(String).filter((x) => EV.has(x)).slice(0, 3); step('Lining up your picks'); return ai.picks.length ? 'ok' : 'none of those ids exist'; } },
  { name: 'open_event', description: 'Open one event\'s page when the chat closes. Use for a clear top recommendation.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute({ id }) { if (!EV.has(String(id))) throw new Error('Unknown id'); ai.openId = String(id); step(`Opening ${EV.get(String(id)).title} when you close this`); return 'ok'; } },
  { name: 'save_event', description: 'Save an event to the user\'s nights. Only when they ask. Easy to undo. You cannot buy tickets.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute({ id }) { if (!EV.has(String(id))) throw new Error('Unknown id'); S.saved.add(String(id)); persist(); step(`Saved ${EV.get(String(id)).title}`); return 'saved'; } },
  { name: 'send_id_go_if', description: 'Post a quest request to hosts, only when the user asks for something that doesn\'t exist yet and agrees to send it.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, scene: { type: 'string', enum: SCENE_KEYS }, area: { type: 'string', enum: AREA_KEYS }, when: { type: 'string' }, budget: { type: 'number' } }, required: ['text'] },
    execute(i) { const others = 60 + (hash(String(i.text)) % 260); S.signals.push({ id: 'sig' + Date.now(), text: String(i.text), scene: i.scene || 'live', area: i.area || HOME, when: i.when || 'Any night', budget: i.budget || 0, others, status: 'open' }); persist(); step('Sent "I\'d go if…" to hosts'); return { others_who_asked: others }; } },
];
function rules() {
  const t = taste();
  const top = SCENE_KEYS.slice().sort((a, b) => t[b] - t[a]).slice(0, 4).map((s) => SCENES[s].label).join(', ');
  return `You are Sixer, the AI guide and taste avatar inside Sidequest, a Toronto events app. Events are called quests, friend groups are parties. You help people pick something to do, day or night, solo, with friends or with family, and you always explain why.
Today: ${NOW.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${timeStr(NOW)}. The user lives in ${HOME}. Their top scenes: ${top}. Areas they go to: ${[...S.areas].join(', ')}.
Friends on the app: ${S.crewOn ? FRIENDS.map((f) => PEOPLE[f].short).join(', ') : 'not connected'}. Saved: ${[...S.saved].map((id) => EV.get(id)?.title).filter(Boolean).join(', ') || 'nothing'}.
${S.mode === 'host' ? 'They are currently in host mode as Priya from Loop Collective. Top demand: ' + IDEAS.map((d) => `${d.text} (${d.count} near ${d.area})`).join('; ') + '.' : ''}
How to work:
- Use search_events or crew_blend. Never invent events. Call show_picks with your 1-3 best before answering, and open_event for a clear winner.
- Explain picks the Sixer way: match tier (Top, Strong, Good or Maybe match; never say a percentage), distance from home, timing, friends going, price. Recommend one.
- Under 80 words, warm and direct, Toronto voice without slang overload. Short lists start with "- ". Use exact event titles.
- You cannot buy tickets. Tickets are on the host's page.
- Most events are all ages. Events marked 19+ ask the user to confirm their age before tickets; never ask their age yourself. ${S.age === 'under' ? 'This user is under 19: only suggest all-ages events.' : ''}
- They usually like ${[...S.times].map((x) => TIMES[x].toLowerCase()).join(', ') || 'any time'}.`;
}
async function send(text) {
  if (ai.busy || !text.trim()) return;
  ai.turns.push({ role: 'user', content: text.trim() });
  ai.busy = true; ai.steps = []; ai.picks = []; ai.live = ''; ai.error = null;
  renderChat();
  if (!ai.sample) return localSixer(text);
  ai.ctl = new AbortController();
  const input = [{ role: 'user', content: rules() }, ...ai.turns.slice(-8).map(({ role, content }) => ({ role, content }))];
  try {
    let reply;
    if (ai.tools) {
      reply = (await ai.sample(input, { tools: TOOLS, modelTier: 'quick', signal: ai.ctl.signal, onText: ({ text: t }) => { ai.live = t; renderChat(true); } })).text;
    } else {
      const cands = searchEvents({}).map((e) => compactEvent(e));
      const res = await ai.sample.json([...input.slice(0, -1), { role: 'user', content: `${text}\n\nEvents (JSON): ${JSON.stringify(cands)}\n\nReply with only JSON: {"reply": string, "pick_ids": [up to 3 ids], "open_id": id or null}` }], { modelTier: 'quick', signal: ai.ctl.signal, cache: false });
      reply = String(res?.reply || ''); ai.picks = (res?.pick_ids || []).filter((x) => EV.has(x)).slice(0, 3); if (res?.open_id && EV.has(res.open_id)) ai.openId = res.open_id;
    }
    done(reply);
  } catch (e) {
    ai.busy = false;
    if (e?.code === 'cancelled') ai.turns.push({ role: 'assistant', content: e.text || 'Stopped.' });
    else if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable'].includes(e?.code)) { ai.sample = null; ai.turns.pop(); return send(text); }
    else { ai.error = e?.code === 'rate_limited' ? 'Too many questions at once. Give it a minute and try again.' : e?.code === 'session_expired' ? 'Your Claude session expired. Sign in again to keep chatting.' : e?.code === 'refused' ? 'I can\'t help with that one. Ask me about events.' : 'Couldn\'t reach Claude just now. Try again.'; if (e?.text) ai.turns.push({ role: 'assistant', content: e.text }); }
    renderChat();
  }
}
function done(reply) { ai.busy = false; ai.turns.push({ role: 'assistant', content: reply || 'Here are my picks.', picks: [...ai.picks] }); renderChat(); render(); }
function localSixer(text) {
  const q = text.toLowerCase();
  const tod = /morning/.test(q) ? 'morning' : /afternoon/.test(q) ? 'afternoon' : /late/.test(q) ? 'late' : undefined;
  const allAges = /famil|kid|child|all.ages|under 19|teen/.test(q);
  const when = /tonight|today/.test(q) ? 'tonight' : /tomorrow/.test(q) ? 'tomorrow' : /weekend|saturday|friday|sunday/.test(q) ? 'weekend' : undefined;
  const scene = SCENE_KEYS.find((s) => q.includes(s) || q.includes(SCENES[s].label.toLowerCase().split(' ')[0].toLowerCase()));
  const named = FRIENDS.filter((f) => q.includes(PEOPLE[f].short.toLowerCase()));
  const crew = named.length || /crew|friends|group/.test(q);
  const price = (q.match(/under \$?(\d+)/) || [])[1];
  let list;
  if (crew) { const members = ['me', ...(named.length ? named : FRIENDS.filter((f) => S.crewSel.has(f)))]; step(`Blending taste for ${members.map((m) => PEOPLE[m].short).join(', ')}`); list = blend(members).map((b) => b.e).filter((e) => !when || searchEvents({ when }).includes(e)).slice(0, 3); var membersUsed = members; }
  else {
    step('Searching events that fit you');
    list = searchEvents({ scene, when, max_price: price, time_of_day: tod, all_ages_only: allAges });
    if (!list.length && (tod || when)) list = searchEvents({ scene, when, all_ages_only: allAges });
    if (/near|close|walk/.test(q)) { const near = list.filter((e) => distFromHome(e) < 3); list = (near.length ? near : list).sort((a, b) => distFromHome(a) - distFromHome(b)); }
    list = list.slice(0, 3);
  }
  if (!list.length) list = searchEvents({}).slice(0, 3);
  ai.picks = list.map((e) => e.id); ai.openId = list[0]?.id || null;
  const top = list[0];
  const why = (e) => { const bits = [shortWhen(e.start), distStr(distFromHome(e)) + ' from home', money(e.price)]; const fg = FRIENDS_GOING[e.id] || []; if (fg.length) bits.push(fg.map((f) => PEOPLE[f].short).join(' + ') + ' going'); return bits.join(', '); };
  const scoreTxt = crew ? `${matchWord(blend(membersUsed).find((b) => b.e.id === top.id).score)} for the party` : `${matchWord(fitFor('me', top))} for you`;
  const reply = `My pick: **${top.title}** (${scoreTxt}; ${why(top)}).` + (list.length > 1 ? `\n\nAlso good:\n${list.slice(1).map((e) => `- ${e.title}: ${why(e)}`).join('\n')}` : '') + `\n\nClose this and I'll open ${top.title} for you.`;
  setTimeout(() => done(reply), 500);
}
function fmt(text) {
  const titles = [...EV.values()].sort((a, b) => b.title.length - a.title.length);
  const link = (h) => { for (const e of titles) { const t = esc(e.title); if (h.includes(t)) h = h.split(t).join(`\u0000${e.id}\u0001`); } return h.replace(/\u0000([\w-]+)\u0001/g, (_, id) => `<button class="evlink" data-chat-open="${id}">${esc(EV.get(id).title)}</button>`); };
  return esc(text).split(/\n{2,}/).map((b) => { const ls = b.split('\n'); if (ls.every((l) => /^\s*[-•*]\s+/.test(l))) return `<ul>${ls.map((l) => `<li>${link(l.replace(/^\s*[-•*]\s+/, ''))}</li>`).join('')}</ul>`; return `<p>${link(b).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')}</p>`; }).join('');
}
function picksHtml(ids) { return ids?.length ? `<div class="picks">${ids.map((id) => { const e = EV.get(id); return `<button class="pick" data-chat-open="${id}">${poster(id + 'p', e.scene, `${matchTag(fitFor('me', e), 'sm')}<h3>${esc(e.title)}</h3><div class="muted" style="font-size:12px">${esc(shortWhen(e.start))} · ${esc(e.area)}</div>`, '', '', 0).replace('style="', 'style="height:100%;border-radius:20px;')}</button>`; }).join('')}</div>` : ''; }
function logHtml() {
  if (!ai.turns.length) {
    const sug = S.mode === 'host' ? ['What should I book next?', 'Which request has the most people asking?'] : ['Something chill today near me', 'A family-friendly Saturday morning', 'Plan Friday for me, Maya and Kai', 'I\'m new here and going solo. Where do I start?'];
    return `<div style="display:grid;gap:14px;padding-top:30px"><span class="orb" style="--s:84px"></span><h1 style="font-size:30px;line-height:1.05">Hey, I'm Sixer. What are you up for?</h1><p class="muted">I'll search what's on, blend your party's taste and tell you exactly why I picked it.</p>
      ${ai.sample === null ? '<p class="note">Wireframe: Sixer answers with simple built-in logic. In the product this is the AI agent.</p>' : ''}
      <div class="suggest">${sug.map((s) => `<button class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
  }
  let h = ai.turns.map((t) => t.role === 'user' ? `<div class="msg me">${esc(t.content)}</div>` : `<div class="msg ai">${fmt(t.content)}${picksHtml(t.picks)}</div>`).join('');
  if (ai.busy) h += `<div class="msg ai">${ai.steps.length ? `<div class="tsteps">${ai.steps.map((s) => `<span>✓ ${esc(s)}</span>`).join('')}</div>` : ''}${ai.live ? fmt(ai.live) : '<span class="thinking" aria-label="Sixer is thinking"><i></i><i></i><i></i></span>'}</div>`;
  if (ai.error) h += `<p class="note" role="alert">${esc(ai.error)}</p>`;
  return h;
}
function renderChat(partial) {
  const log = chatEl.querySelector('.chat-log');
  if (partial && log) { log.innerHTML = logHtml(); log.scrollTop = log.scrollHeight; return; }
  chatEl.innerHTML = `<div class="chat-head"><span class="orb" style="--s:40px"></span><h2>Sixer</h2><button class="icon-btn glass" data-chat="close" aria-label="Close">${icon('x')}</button></div>
    <div class="chat-log">${logHtml()}</div>
    <form class="chat-form" id="chat-form"><input id="chat-in" autocomplete="off" placeholder="Ask Sixer anything" aria-label="Message Sixer" ${ai.busy ? 'disabled' : ''}>
      ${ai.busy ? `<button type="button" class="icon-btn solid" style="width:52px;height:52px;border-radius:26px" data-chat="stop" aria-label="Stop">${icon('stop')}</button>` : `<button class="icon-btn solid" style="width:52px;height:52px;border-radius:26px" aria-label="Send">${icon('send')}</button>`}</form>`;
  const l = chatEl.querySelector('.chat-log'); l.scrollTop = l.scrollHeight;
}
chatEl.addEventListener('click', (e) => {
  const s = e.target.closest('[data-suggest]'); if (s) return send(s.dataset.suggest);
  const o = e.target.closest('[data-chat-open]'); if (o) { ai.openId = o.dataset.chatOpen; if (S.mode === 'host') { S.mode = 'attendee'; } closeChat(); return; }
  const c = e.target.closest('[data-chat]')?.dataset.chat;
  if (c === 'close') closeChat(); else if (c === 'stop') ai.ctl?.abort();
});
chatEl.addEventListener('submit', (e) => { e.preventDefault(); const i = document.getElementById('chat-in'); const v = i.value; i.value = ''; send(v); });

