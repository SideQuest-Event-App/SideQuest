// Builds the two ElevenLabs agents (the Plugged-In Friend and the Calm Concierge) from the same
// persona prompts the app uses, so the dashboard never drifts from the code.
//
//   node tools/elevenlabs-agents.js            writes reference/elevenlabs-agents.json (no network)
//   node tools/elevenlabs-agents.js --create   creates both agents in your ElevenLabs account and prints
//                                              the two agent IDs to put in .env / Render
//   node tools/elevenlabs-agents.js --update   updates the two existing agents in place (PATCH), then reads
//                                              them back and checks the settings stuck
//   node tools/elevenlabs-agents.js --check    only reads the two agents back and compares (no changes)
//
// --create and --update need ELEVENLABS_API_KEY. --update finds the agents by ELEVENLABS_AGENT_FRIEND and
// ELEVENLABS_AGENT_CONCIERGE, or else by name in your account. Optional: ELEVENLABS_VOICE_FRIEND and
// ELEVENLABS_VOICE_CONCIERGE (voice IDs, including your own cloned voice), ELEVENLABS_LLM (the agent's
// conversation model; see GET /v1/convai/llm/list for names).
//
// Field names follow ElevenLabs' agents API (its OpenAPI schema at api.elevenlabs.io/openapi.json, read
// Nov 2026). If their API rejects a field, the error is printed; the JSON file can always be pasted into
// the dashboard by hand instead.

const fs = require("fs");
const path = require("path");

for (const envPath of [path.join(__dirname, "..", ".env"), path.join(__dirname, "..", "..", "sketch-1", ".env")]) if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const personas = require("../lib/sidekick/personas");

// How the call works, from the agent's side: the agent leads, and the app's tools keep it on the plan
const CALL = `How this call works
- You're Sidekick on a group call for {{crew_name}}. People: {{people}}. Planner: {{planner_name}}. Nights being considered: {{nights_spoken}}.
- You hear the planner's phone, so you may hear several people. Typed lines and friends on in-app audio reach you as messages like "Jay (typed): ...". Notes starting with [app] come from the SideQuest app: things you can't hear, like someone joining, a tap on a card, or picks appearing on screens.
- You lead the planning, one short question at a time, like a good host. The app holds the plan board, the private answers and the real listings, and you use its tools:
  - get_next_move: what to do now (the next question, a clash to settle, ideas to offer, picks to present). Call it after your opening, and whenever you're not sure what's next.
  - record_facts: after someone answers, record what they said (night, time, starting point, vibe, ticketed or not), with their name if you know it. It returns the next move too, so you don't need get_next_move after it.
  - get_picks: when the next move says the plan is ready, or someone asks what you'd suggest. Present both picks with one reason each and ask everyone to vote in the app.
  - show_private_card: puts the private budget card on everyone's screen.
  - accept_relax: when the crew says yes to loosening something you offered.
  - get_plan_state: the board, if you need to check what's settled.
- Ask, listen, record, move on. Don't ask a question the board already answers. One question per turn, then stop talking.
- Keep every line short: one breath, two short sentences at most, and never more than one question. Speak first, then call tools if you can; don't narrate tool calls.

How to sound like a conversation, not a form
- Say back what you heard, then ask. Every question opens by briefly confirming what was just said, with names, then links to the next ask: "Saturday after six, love it. Jay said games, Maya's leaning live music, so what about you, Asia?" Never say back a budget, an amount or a place someone wants to avoid.
- Open with the room: the crew name, who's here and the nights ("{{crew_name}}'s here! Friday or Saturday, right?").
- After the check-in, ask one open question ("What kind of night are you all after?"), take everything you can from the answers (night, time, vibe, starting point) with record_facts, and only ask about what's still missing. When something doesn't need asking, say so in a few words ("Budget's sorted, everyone's added theirs privately").
- If only one thing is unclear, ask about just that, by name: "Maya, was that Friday or Saturday?" On a split, name it: "Friday or Saturday, there's a split. Want me to find something that works both nights?"
- If someone has been quiet for a while, invite them in gently by name, once. Don't single anyone out twice.
- If people drift off topic, react in a few words, then steer back: "Leafs talk after we pick, promise."
- React to good news briefly ("Oh, everyone's free Saturday, nice"), and let small listening sounds be short.
- Present picks like a DJ, not a list: a hook, why it fits named people, one vivid detail (venue, start time, or that it's free), then invite the vote. Use clean names: never read out "w/", "Free event." or "@ venue", and if a title is just a number, add the venue ("54.40 at the Danforth Music Hall"). Say which is a show and which is a spot you can drop into.
- When the plan is locked, close warmly in one line ("That's a plan, see you Saturday!").
- Only mention events and places the tools give you. Never invent venues, prices or times.
- If people are just chatting with each other, stay quiet (skip_turn). If someone asks you to step back or sit back, say so in a few words and stay quiet until someone says "Sidekick".
- Never ask about budget or places to avoid out loud, and never say anyone's private answer or who has or hasn't answered it. Those are answered privately on screens.
- Never vote, lock the plan, book or pay. People do that in the app.`;

const VOICE_DEFAULT = "21m00Tcm4TlvDq8ikWAM"; // an ElevenLabs stock voice, used only if you don't set your own
const AGENTS = [
  { persona: "friend", name: "Sidekick · Plugged-In Friend", env: "ELEVENLABS_AGENT_FRIEND", voice: process.env.ELEVENLABS_VOICE_FRIEND, speed: 1.0 },
  { persona: "concierge", name: "Sidekick · Calm Concierge", env: "ELEVENLABS_AGENT_CONCIERGE", voice: process.env.ELEVENLABS_VOICE_CONCIERGE, speed: 0.95 },
];
const MAX_MIN = Number(process.env.ELEVENLABS_MAX_CALL_MINUTES || 10);
// A small, fast model for the agent's turns (low time to first word matters more than depth here).
// Override with ELEVENLABS_LLM; the names ElevenLabs accepts are listed by GET /v1/convai/llm/list.
const LLM = process.env.ELEVENLABS_LLM || "gemini-3.5-flash-lite";
const REASONING = process.env.ELEVENLABS_LLM_REASONING || "minimal"; // no thinking pause before speaking

// Client tools: the agent calls them, and they run in the planner's browser (public/js/sidekick.js),
// which calls our API as the planner. No public URL or shared secret is needed.
const obj = (properties, required = []) => ({ type: "object", properties, required });
const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const TOOLS = [
  { name: "get_next_move", description: "Ask the SideQuest app what to do next: the next question to ask, a clash to settle, ideas to offer, or picks to present. Returns what_to_do, an example_line in your style, and the plan board. Call it after your opening line and whenever you're unsure what comes next.", parameters: null },
  {
    name: "record_facts",
    description: "Record what people just said about the plan, so it shows on everyone's board. Only public facts: night, time, starting point (origin), vibe, and kind (ticketed event or just somewhere to go). Never budget or places to avoid. Returns the next move as well.",
    parameters: obj({
      updates: {
        type: "array",
        description: "One entry per person per fact they clearly said",
        items: obj({
          person: str("The person's first name, exactly as listed on the call. Use the planner's name if you can't tell who spoke."),
          slot: str("Which fact", { enum: ["night", "time", "origin", "vibe", "kind"] }),
          values: { type: "array", description: "What they said, using the option names from the board: e.g. 'Saturday', 'After 8', 'Union', 'Live music', 'Either works'. Several if they're fine with several.", items: str("One option") },
        }, ["person", "slot", "values"]),
      },
    }, ["updates"]),
  },
  { name: "get_picks", description: "Get two picks from the real listings that fit what the crew said. Call it when get_next_move says the plan is ready, or when someone asks what you suggest. Present both, one reason each, and ask everyone to vote in the app.", parameters: null },
  { name: "show_private_card", description: "Put the private budget card on everyone's screen. Use it when it's time to ask about budget: tell them to tap their max there, it stays private.", parameters: obj({ slot: str("Always 'budget'", { enum: ["budget"] }) }, ["slot"]) },
  { name: "accept_relax", description: "Call when the crew agrees to loosen the one thing you offered to loosen (for example another night), so the app can widen the search.", parameters: null },
  { name: "get_plan_state", description: "Read the plan board: who's on the call, what's settled, the open question and who hasn't answered it, the answer options, and the picks if there are any.", parameters: null },
].map((t) => ({
  type: "client",
  name: t.name,
  description: t.description,
  ...(t.parameters ? { parameters: t.parameters } : {}),
  expects_response: true, // the agent waits for the app's answer before it speaks about it
  response_timeout_secs: 8,
  pre_tool_speech: "auto",
  interruption_mode: "allow",
}));
// Said by people while Sidekick talks: a listening sound, so Sidekick keeps going
const BACKCHANNELS = ["yeah", "yep", "mhm", "mm-hm", "uh-huh", "right", "okay", "ok", "nice", "cool", "totally", "for sure", "true"];
// The short reaction the agent says while its reply is being written (never a question or a private answer)
const LISTEN = {
  friend: "Output only a SHORT, warm reaction (1 to 4 words) to what was just said, like a friend on a call: 'Ooh, Saturday.' 'Ha, nice.' 'Mm, love that.' Celebrate good news. Never a question, never a budget, an amount or a place someone wants to avoid.",
  concierge: "Output only a SHORT, calm acknowledgement (1 to 4 words) of what was just said: 'Mm, lovely.' 'I see.' 'Saturday, noted.' Never a question, never a budget, an amount or a place someone wants to avoid.",
};
const SKIP_TURN = { type: "system", name: "skip_turn", description: "Stay silent when people are talking among themselves and nobody needs Sidekick.", params: { system_tool_type: "skip_turn" } };

function config(a) {
  return {
    name: a.name,
    conversation_config: {
      agent: {
        // The app sends the opening line (a dynamic variable), so the agent speaks the moment it connects
        first_message: "{{opening}}",
        language: "en",
        disable_first_message_interruptions: false,
        dynamic_variables: {
          dynamic_variable_placeholders: { opening: "Hey, Sidekick here. Which night works best for everyone?", crew_name: "the crew", people: "Asia (voice), Maya (voice)", planner_name: "Asia", nights_spoken: "Friday or Saturday", room_id: "test" },
        },
        prompt: {
          prompt: `${personas.systemPrompt(a.persona)}\n\n${CALL}`,
          llm: LLM,
          reasoning_effort: REASONING,
          temperature: 0.6,
          max_tokens: 200, // room for a short line plus a tool call
          ignore_default_personality: true, // use only our persona prompt
          enable_parallel_tool_calls: true,
          // skip_turn lets Sidekick stay quiet while people talk among themselves
          built_in_tools: { skip_turn: SKIP_TURN },
          tools: [SKIP_TURN, ...TOOLS],
        },
      },
      // ElevenLabs requires a "flash v2" or "turbo v2" model for English agents
      tts: { voice_id: a.voice || VOICE_DEFAULT, model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2", stability: 0.45, similarity_boost: 0.8, speed: a.speed },
      // Turn-taking: "normal" eagerness answers about as fast as ElevenLabs' own page; speculative turns
      // start the reply during the pause. Interruptions stay on (the "interruption" client event).
      // Listening sounds: "yeah", "mhm" and friends while Sidekick talks are backchannels, not
      // interruptions (real interruptions still stop it). And while the reply is being written, a
      // 1 to 4 word reaction in the persona's voice ("Ooh, Saturday.") instead of dead air.
      turn: {
        turn_timeout: 8, turn_eagerness: "normal", speculative_turn: true, turn_model: "turn_v3", silence_end_call_timeout: -1,
        interruption_ignore_terms: BACKCHANNELS, interruption_ignore_term_languages: ["en"], merge_with_default_ignore_terms: true,
        soft_timeout_config: { timeout_seconds: 1.2, message: a.persona === "friend" ? "Mm, okay." : "Mm, I see.", use_llm_generated_message: true, llm_generated_message_prompt_override: LISTEN[a.persona], max_soft_timeouts_per_generation: 1, pause_after_filler: true, disable_until_first_user_message: true },
      },
      conversation: {
        max_duration_seconds: MAX_MIN * 60,
        // client_tool_call must be listed, or the browser never hears the agent's tool calls
        client_events: ["audio", "interruption", "agent_response", "user_transcript", "agent_response_correction", "agent_tool_response", "client_tool_call"],
      },
    },
    platform_settings: {
      auth: { enable_auth: true },
      privacy: { record_voice: false, retention_days: 1, delete_transcript_and_pii: true },
    },
  };
}

// Settings to check by hand in the dashboard (names vary between dashboard versions)
const MANUAL = [
  "Tools: skip_turn and the six client tools are set by this script. end_call stays OFF.",
  "Security: authentication ON (set by this script), and add your Render web address to the allowlist.",
  "Privacy: confirm voice recording is off and retention is as short as your plan allows (zero retention is Enterprise-only).",
  "Usage limits: set a monthly limit in ElevenLabs as well. The app stops at ELEVENLABS_MINUTES_PER_MONTH × ELEVENLABS_STOP_AT.",
];

const API = "https://api.elevenlabs.io/v1/convai";
const headers = () => ({ "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY });
async function el(method, url, body) {
  const res = await fetch(url, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`ElevenLabs ${method} ${url.replace(API, "")} failed (${res.status}): ${text.slice(0, 600)}`);
  return JSON.parse(text);
}

// The settings that make the call feel quick and safe; read back after an update to check they stuck
function check(want, got) {
  const g = got.conversation_config || {};
  const p = (g.agent || {}).prompt || {};
  const w = want.conversation_config;
  const tools = (p.tools || []).filter((t) => t.type === "client").map((t) => t.name).sort();
  const results = {
    llm: [p.llm, w.agent.prompt.llm],
    reasoning_effort: [p.reasoning_effort, w.agent.prompt.reasoning_effort],
    max_tokens: [p.max_tokens, w.agent.prompt.max_tokens],
    ignore_default_personality: [p.ignore_default_personality, true],
    skip_turn: [Boolean((p.built_in_tools || {}).skip_turn), true],
    client_tools: [tools.join(","), TOOLS.map((t) => t.name).sort().join(",")],
    tools_expect_response: [(p.tools || []).filter((t) => t.type === "client").every((t) => t.expects_response === true), true],
    first_message: [(g.agent || {}).first_message, w.agent.first_message],
    tts_model: [(g.tts || {}).model_id, w.tts ? w.tts.model_id : (g.tts || {}).model_id],
    turn_eagerness: [(g.turn || {}).turn_eagerness, w.turn.turn_eagerness],
    turn_timeout: [(g.turn || {}).turn_timeout, w.turn.turn_timeout],
    speculative_turn: [(g.turn || {}).speculative_turn, w.turn.speculative_turn],
    interruptions: [((g.conversation || {}).client_events || []).includes("interruption"), true],
    backchannels_ignored: [((g.turn || {}).interruption_ignore_terms || []).includes("mhm") && (g.turn || {}).merge_with_default_ignore_terms === true, true],
    listening_sounds: [((g.turn || {}).soft_timeout_config || {}).use_llm_generated_message === true && ((g.turn || {}).soft_timeout_config || {}).timeout_seconds > 0, true],
    reflect_then_ask_prompt: [/Say back what you heard, then ask/.test(p.prompt || ""), true],
    client_tool_call_event: [((g.conversation || {}).client_events || []).includes("client_tool_call"), true],
    auth: [((got.platform_settings || {}).auth || {}).enable_auth, true],
    record_voice: [((got.platform_settings || {}).privacy || {}).record_voice, false],
  };
  const rows = Object.entries(results).map(([k, [have, need]]) => ({ setting: k, have, need, ok: have === need }));
  // The voice model is the dashboard's call once it's been changed there by hand: report it, don't fail on it
  const tts = rows.find((r) => r.setting === "tts_model");
  if (!tts.ok || !/^eleven_flash_v2/.test(String(tts.have))) Object.assign(tts, { ok: true, note: `kept from the dashboard; this script sets eleven_flash_v2, the quickest to start speaking` });
  return rows;
}

async function findIds() {
  const ids = {};
  for (const a of AGENTS) if (process.env[a.env]) ids[a.persona] = process.env[a.env];
  if (AGENTS.every((a) => ids[a.persona])) return ids;
  const list = await el("GET", `${API}/agents?page_size=100`);
  for (const a of AGENTS) if (!ids[a.persona]) { const hit = (list.agents || []).find((x) => x.name === a.name); if (hit) ids[a.persona] = hit.agent_id; }
  return ids;
}

async function main() {
  const out = { generatedAt: new Date().toISOString(), note: "Generated from lib/sidekick/personas.js by tools/elevenlabs-agents.js", agents: AGENTS.map((a) => ({ persona: a.persona, ...config(a) })), manualSteps: MANUAL };
  const file = path.join(__dirname, "..", "reference", "elevenlabs-agents.json");
  const checkOnly = process.argv.includes("--check");
  if (!checkOnly) {
    fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
    console.log(`Wrote ${path.relative(process.cwd(), file)}`);
  }
  if (!process.argv.includes("--create") && !process.argv.includes("--update") && !checkOnly) {
    console.log("Run with --create to make the agents in ElevenLabs, or --update to update the existing ones (needs ELEVENLABS_API_KEY).");
    return;
  }
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("Set ELEVENLABS_API_KEY in .env first.");
  if (process.argv.includes("--update") || checkOnly) {
    const ids = await findIds();
    let bad = 0;
    for (const a of AGENTS) {
      const agentId = ids[a.persona];
      if (!agentId) { bad++; console.log(`No agent found for ${a.name}. Run --create, or set ${a.env}.`); continue; }
      const want = config(a);
      // Keep the voice settings chosen in the dashboard (voice, voice model, stability...) unless
      // ELEVENLABS_VOICE_* or ELEVENLABS_TTS_MODEL is set: someone may have tuned them by ear
      const before = await el("GET", `${API}/agents/${agentId}`);
      const keepTts = !a.voice && !process.env.ELEVENLABS_TTS_MODEL && before.conversation_config && before.conversation_config.tts && before.conversation_config.tts.voice_id;
      if (keepTts) { delete want.conversation_config.tts; }
      if (!checkOnly) await el("PATCH", `${API}/agents/${agentId}`, want);
      const after = checkOnly ? before : await el("GET", `${API}/agents/${agentId}`);
      const rows = check(want, after);
      // The dashboard's voice choices (voice and voice model) must come through an update untouched
      if (keepTts) {
        const was = before.conversation_config.tts, now = (after.conversation_config || {}).tts || {};
        const same = was.voice_id === now.voice_id && was.model_id === now.model_id;
        rows.push({ setting: "dashboard_voice_kept", have: `${now.voice_id} / ${now.model_id}`, need: `${was.voice_id} / ${was.model_id}`, ok: same });
      }
      bad += rows.filter((r) => !r.ok).length;
      console.log(`\n${checkOnly ? "Checked" : "Updated"} ${a.name} (${agentId}). Read back:`);
      for (const r of rows) console.log(`  ${r.ok ? "ok  " : "DIFF"} ${r.setting}: ${JSON.stringify(r.have)}${r.ok ? "" : ` (wanted ${JSON.stringify(r.need)})`}${r.note ? ` (note: ${r.note})` : ""}`);
    }
    console.log(bad ? `\n${bad} setting(s) didn't match.` : "\nBoth agents match the config.");
    if (bad) process.exitCode = 1;
    return;
  }
  const ids = {};
  for (const a of AGENTS) {
    const res = await fetch("https://api.elevenlabs.io/v1/convai/agents/create", {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY },
      body: JSON.stringify(config(a)),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ElevenLabs didn't create "${a.name}" (${res.status}): ${text.slice(0, 400)}`);
    ids[a.persona] = JSON.parse(text).agent_id;
    console.log(`Created ${a.name}: ${ids[a.persona]}`);
  }
  console.log(`\nAdd these to .env and to Render's environment settings:\nELEVENLABS_AGENT_FRIEND=${ids.friend}\nELEVENLABS_AGENT_CONCIERGE=${ids.concierge}\n\nThen check these in the ElevenLabs dashboard:\n- ${MANUAL.join("\n- ")}`);
}

if (require.main === module) main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
module.exports = { config, check, TOOLS, AGENTS, LLM };
