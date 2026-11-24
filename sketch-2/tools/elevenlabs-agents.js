// Builds the two ElevenLabs agents (the Plugged-In Friend and the Calm Concierge) from the same
// persona prompts the app uses, so the dashboard never drifts from the code.
//
//   node tools/elevenlabs-agents.js            writes reference/elevenlabs-agents.json (no network)
//   node tools/elevenlabs-agents.js --create   creates both agents in your ElevenLabs account and prints
//                                              the two agent IDs to put in .env / Render
//
// --create needs ELEVENLABS_API_KEY. Optional: ELEVENLABS_VOICE_FRIEND and ELEVENLABS_VOICE_CONCIERGE
// (voice IDs from your ElevenLabs voice library, including your own cloned voice).
//
// The fields below follow ElevenLabs' published API types (Nov 2026). If their API rejects a field,
// the error is printed; the JSON file can always be pasted into the dashboard by hand instead.

const fs = require("fs");
const path = require("path");

for (const envPath of [path.join(__dirname, "..", ".env"), path.join(__dirname, "..", "..", "sketch-1", ".env")]) if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const personas = require("../lib/sidekick/personas");

// How the call works, from the agent's side: the app is the brain and sends cues
const CALL = `How this call works
- You're Sidekick on a group call for {{crew_name}}. People: {{people}}. Planner: {{planner_name}}. Nights being considered: {{nights_spoken}}.
- You hear the planner's phone. Other people's words arrive as context notes like "Jay (typed): ...". Treat them as things said on the call.
- Messages that start with [app] come from the SideQuest app, not a person. Each one is your next move: do exactly that move, in your own words and your persona's voice, in one breath. Use the details it gives (questions, options, picks). The example line is a guide, not a script.
- The app decides what to ask and when to suggest picks, from the real listings. Don't ask your own planning questions and don't invent venues, prices or times.
- If people are just chatting with each other, stay quiet (skip_turn). Speak when an [app] message arrives, or when someone talks to you directly ("Sidekick, ...").
- Never ask about budget or dealbreakers out loud. Those are answered privately on people's screens.
- Never vote, lock the plan, book or pay. People do that in the app.`;

const VOICE_DEFAULT = "21m00Tcm4TlvDq8ikWAM"; // an ElevenLabs stock voice, used only if you don't set your own
const AGENTS = [
  { persona: "friend", name: "Sidekick · Plugged-In Friend", voice: process.env.ELEVENLABS_VOICE_FRIEND, speed: 1.0 },
  { persona: "concierge", name: "Sidekick · Calm Concierge", voice: process.env.ELEVENLABS_VOICE_CONCIERGE, speed: 0.95 },
];
const MAX_MIN = Number(process.env.ELEVENLABS_MAX_CALL_MINUTES || 10);

function config(a) {
  return {
    name: a.name,
    conversation_config: {
      agent: {
        first_message: "", // stays quiet until the app cues the welcome
        language: "en",
        prompt: {
          prompt: `${personas.systemPrompt(a.persona)}\n\n${CALL}`,
          llm: process.env.ELEVENLABS_LLM || "claude-haiku-4-5",
          temperature: 0.6,
          max_tokens: 120,
          ignore_default_personality: true, // use only our persona prompt
          // skip_turn lets Sidekick stay quiet while people talk among themselves
          built_in_tools: { skip_turn: { type: "system", name: "skip_turn", description: "Stay silent when people are talking among themselves and nobody needs Sidekick.", params: { system_tool_type: "skip_turn" } } },
        },
      },
      // ElevenLabs requires a "flash v2" or "turbo v2" model for English agents
      tts: { voice_id: a.voice || VOICE_DEFAULT, model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2", stability: 0.45, similarity_boost: 0.8, speed: a.speed },
      turn: { turn_timeout: 7, turn_eagerness: "patient" },
      conversation: { max_duration_seconds: MAX_MIN * 60 },
    },
    platform_settings: {
      auth: { enable_auth: true },
      privacy: { record_voice: false, retention_days: 1, delete_transcript_and_pii: true },
    },
  };
}

// Settings to check by hand in the dashboard after creating (names vary between dashboard versions)
const MANUAL = [
  "Tools: check skip_turn is ON (set by this script) and end_call is OFF.",
  "Interruptions: ON (Sidekick stops talking when someone talks over it).",
  "Security: authentication ON, and add your app's web address to the allowlist.",
  "Privacy: confirm voice recording is off and retention is as short as your plan allows (zero retention is Enterprise-only).",
  "Usage limits: set a monthly limit in ElevenLabs as well. The app stops at ELEVENLABS_MINUTES_PER_MONTH × ELEVENLABS_STOP_AT.",
];

async function main() {
  const out = { generatedAt: new Date().toISOString(), note: "Generated from lib/sidekick/personas.js by tools/elevenlabs-agents.js", agents: AGENTS.map((a) => ({ persona: a.persona, ...config(a) })), manualSteps: MANUAL };
  const file = path.join(__dirname, "..", "reference", "elevenlabs-agents.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
  if (!process.argv.includes("--create")) {
    console.log("Run with --create to make the agents in ElevenLabs (needs ELEVENLABS_API_KEY).");
    return;
  }
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("Set ELEVENLABS_API_KEY in .env first.");
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

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
