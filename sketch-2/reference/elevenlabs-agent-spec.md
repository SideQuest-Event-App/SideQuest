# Sidekick on ElevenLabs: what to set up, and what stays in our code

## As built (Nov 2026): set-up checklist

The connection is built. It works by **cues**: our engine decides every move, as it already does, and sends it to the agent as an `[app] …` message that includes a suggested line from the line book. The agent says it in the persona's voice. The tools in section 4.5 also exist (`/api/sk/agent/<tool>`), but they're optional: the cues work without them, so ElevenLabs doesn't need to reach our server at all.

1. **Get an ElevenLabs API key.** Put it in `.env` and on Render as `ELEVENLABS_API_KEY`.
2. **Optional: choose voices.** Set `ELEVENLABS_VOICE_FRIEND` and `ELEVENLABS_VOICE_CONCIERGE`, for example to your own cloned voice.
3. **Create the agents.** Run `node tools/elevenlabs-agents.js --create`. It builds both agents from `lib/sidekick/personas.js` and prints two IDs. Without `--create`, it only writes `reference/elevenlabs-agents.json`, which you can paste into the dashboard instead.
4. **Save the IDs.** Put them in `.env` and on Render as `ELEVENLABS_AGENT_FRIEND` and `ELEVENLABS_AGENT_CONCIERGE`.
5. **Check the dashboard.** The script prints the settings to confirm: turn `skip_turn` on, interruptions on, authentication on with an allowlist, privacy settings, and a monthly usage limit.
6. **Know the spending stop.** Each voice session reserves `ELEVENLABS_MAX_CALL_MINUTES` (default 10) up front and gives back what it didn't use. No new sessions start past `ELEVENLABS_MINUTES_PER_MONTH × ELEVENLABS_STOP_AT` (default 15 × 0.8 = 12 minutes) or `ELEVENLABS_DAILY_MINUTES`. Raise these to match your plan.
7. **Use it.** In a call, the planner taps **Turn on Sidekick's voice**. If ElevenLabs fails or the cap is reached, the call carries on with the built-in voice.

The sections below are the original plan, kept for the reasoning.


This is a plan for moving Sidekick's voice and conversation onto the ElevenLabs Agents platform while keeping the in-call design: the plan board, question cards, private answers, picks and voting.

Facts about ElevenLabs come from its published SDK types (`@elevenlabs/client` 1.38, `@elevenlabs/elevenlabs-js` 2.79) and search results quoting its docs, checked in November 2026. Its docs site couldn't be opened from here. Items marked *(check)* need confirming in the dashboard or on elevenlabs.io before you rely on them.

## 1. Native or connected? Both

| Lives in ElevenLabs (set up in their dashboard) | Stays in our code (`sketch-2`) |
|---|---|
| The voice (stock or your own clone) | The call room: who's on it, and how each person joined |
| Listening to the planner's mic, turn-taking, stopping when talked over | The plan board, question cards and private cards (the Proposal 6 design) |
| The persona prompt and first line | The plan engine: what to ask next, when to stop, picks from real listings |
| Calling our tools | Private answers and the rules that keep them private |
| Post-call analysis (optional) | Votes, the lock, the survey, analytics and A/B assignment |

ElevenLabs can't hold the plan by itself. The listings, the private answers and the shared board all live in our app, and other people's taps and typed lines arrive at our server, not at ElevenLabs. So the agent is **connected to our server through tools**: web addresses it calls to read the board, record what people said, and get the next move and the picks.

## 2. The big limit: one listener, not a group

An ElevenLabs agent conversation is one person talking to one agent. Its transcripts only say "user" or "agent", with no speaker names, and there's no built-in group-call support (only phone integrations like Twilio and SIP). The design has to work around that:

- **The planner's phone runs the ElevenLabs session.** Sidekick speaks from that phone, which already matches our rule that read-aloud happens there only. It hears whoever is near that phone.
- **Everyone else's words reach the agent as text.** Typed lines, captions from their own phones, and form answers already go to our server. The planner's phone passes them into the session with `sendContextualUpdate("Jay (typed): fri is bad for me")`, which gives the agent context without making it reply. A line addressed to Sidekick goes in with `sendUserMessage` instead, so it answers.
- **Taps keep names attached.** Question cards and private cards stay as they are, so the board always knows who chose what, even when the mic can't tell voices apart.
- **True multi-phone audio comes later.** A shared audio room (for example LiveKit) with the agent as a participant is the "Stage 2" in the brief. It isn't needed to test the design.

## 3. Two ways to connect the brain

**A. ElevenLabs runs the conversation model and calls our tools (recommended to start).**
- Pick a Claude model in the agent settings; Claude Haiku 4.5 and Sonnet are on their list.
- The prompt tells the agent to ask our engine what to do (`get_next_move`) and to report what it heard (`record_facts`).
- Our engine still decides the next question and the stop rule, and our server still enforces privacy, because tools only ever return public data.
- Least code on our side.

**B. ElevenLabs only listens and speaks; our server writes every line ("custom LLM").**
- Set the agent's model to `custom-llm` and point it at a chat-completions-compatible address on our server.
- ElevenLabs sends the conversation, and our server runs the plan engine and the persona prompt we already have, then replies with the line to say.
- Most control, and the A/B code stays exactly as it is.
- More work: we have to build that endpoint, and handle streaming and timeouts.

Start with A. Move to B if the agent drifts from the engine's moves, for example asking two questions at once or offering picks too early.

## 4. What to enter in ElevenLabs: two agents, one per persona

Make **two agents**, "Sidekick · Plugged-In Friend" (persona A, replacing the host) and "Sidekick · Calm Concierge" (persona B, replacing the facilitator). Our server already assigns a persona at random when a call starts, so it simply asks for a session token for that persona's agent. That keeps the A/B assignment and logging in one place. (ElevenLabs can also split traffic between branches of one agent, but then our server wouldn't know which persona a call got without asking ElevenLabs afterwards.)

### 4.1 Agent basics (both agents)

| Setting | Value |
|---|---|
| Language | English |
| LLM | `claude-haiku-4-5` (fastest). Try `claude-sonnet-4-6` or newer if lines feel flat |
| Temperature | 0.6 |
| Max tokens | 120 |
| Voice | Plugged-In Friend: relaxed and smiling, or your own clone. Calm Concierge: soft and grounded, or a teammate's clone |
| Voice model | `eleven_flash_v2_5` for speed, or `eleven_v4_turbo` for more expression *(check which your plan offers)* |
| Speed | Plugged-In Friend 1.0, Calm Concierge 0.95 |
| Turn eagerness | **Patient**. In a group, waiting is better than cutting in |
| Turn timeout | About 7 seconds, so it doesn't jump in during short pauses |
| Interruptions | On. It stops talking when someone talks over it |
| Silence end-call timeout | Off. The planner ends the call |
| Max duration | 1,200 seconds (20 minutes) |
| System tools | `skip_turn` **on** (it can stay quiet). `end_call` **off**. Language detection off |
| Authentication | **On** (a private agent). Add the app's web address to the allowlist |
| Overrides allowed (Security tab) | None needed. Everything per call goes in as dynamic variables |

### 4.2 Dynamic variables (sent by our app when the session starts)

| Variable | Example | Notes |
|---|---|---|
| `room_id` | `kBMONY1n` | Passed to every tool so it knows which call |
| `crew_name` | `Sat squad` | |
| `planner_name` | `Asia` | |
| `people` | `Asia (voice, here), Maya (voice), Jay (text), Sam (form)` | Names and how each joined. No private answers, ever |
| `nights_spoken` | `Friday or Saturday` | |

### 4.3 First message

- **Plugged-In Friend:** `Hey, {{crew_name}}! Let's get a night on the calendar. {{nights_spoken}}?`
- **Calm Concierge:** `Hi everyone, I'm Sidekick. I'll keep track, so you can just talk. Which night works best, {{nights_spoken}}?`

### 4.4 System prompt

Paste the persona prompt from `lib/sidekick/personas.js` (shared rules, writing for the ear, local knowledge, style and example lines). The two personas are being rewritten as the Plugged-In Friend and the Calm Concierge, using the reviewed line book. Then add this block to both agents:

```
How this call works
- You're on a group call for {{crew_name}}. People: {{people}}. You hear the planner's phone.
  Other people's words arrive as context notes like "Jay (typed): ...". Treat them as things said on the call.
- You don't keep the plan in your head. The app does. Use your tools:
  - When anyone says something about the night, time, where they're starting, the vibe, budget or places to avoid,
    call record_facts with who said it. If you can't tell who said it, leave it out; they can tap it instead.
  - Before you ask anything or suggest anything, call get_next_move and do exactly that one move:
    ask = ask that one question; conflict = name it and offer a way forward; nudge = invite that person in;
    private = tell that person to check their screen (never say what it's about); relax = offer to loosen it, using
    the words given; picks = call get_picks and present both, with one local detail, then ask everyone to vote;
    wait = say nothing (use skip_turn).
  - Only call accept_relax after the group clearly says yes.
- One question at a time. Never ask about budget or dealbreakers out loud. Those go on people's own screens.
- Never vote, never lock the plan, never book or pay. The planner locks it in the app.
- If nobody needs you, stay quiet (skip_turn). Speak after a real pause, or when someone says "Sidekick".
```

### 4.5 Tools (webhook tools pointing at our server)

Every tool:
- **Address:** `https://<your-render-app>.onrender.com/api/sk/agent/<tool>`, method POST.
- **Header:** `X-Sidekick-Secret`, stored as an ElevenLabs workspace secret. Our server rejects calls without it.
- **`room_id` parameter:** filled from the dynamic variable `{{room_id}}`.
- **Response timeout:** 10 seconds.

| Tool | What it does | Body (JSON Schema, short form) | Returns (public data only) |
|---|---|---|---|
| `get_plan_state` | Reads the board | `{room_id}` | People and how they joined, each board row (value, who, state), the open question and its options, conflicts, the group budget label |
| `record_facts` | Records what people said (the `update_plan_facts` schema we already use) | `{room_id, updates: [{person, slot: night\|time\|origin\|vibe\|budget\|nos, values: [string], confidence: number}]}` | Updated board plus `next_move` |
| `get_next_move` | Asks the plan engine what to do | `{room_id}` | `{move: ask\|conflict\|nudge\|private\|relax\|picks\|wait, slot, question, options, person, conflict, relax_words, options_count}` |
| `get_picks` | Gets the two picks and shows them on everyone's screen | `{room_id}` | `[{title, when_spoken, price_spoken, where, reason, fits_by_person, local_details}]` |
| `send_private_card` | Shows a private card on one phone | `{room_id, person, slot: budget\|nos}` | `{sent: true}` |
| `accept_relax` | Loosens one limit after the group agrees | `{room_id}` | `{loosened, options_count}` |

There are deliberately **no** tools for voting, locking, booking or paying. People do those in the app, as the governance rules require.

No client tools (browser functions) are needed. The board updates through our existing live connection when the tools change it.

### 4.6 Privacy settings (each agent's Privacy tab)

Our rule is that raw call transcripts are never kept. On the ElevenLabs side:
- **Turn off** voice recording.
- **Set retention** to the shortest period allowed.
- **Turn on** "delete transcript and PII".

True zero retention is an **Enterprise-only** setting *(check)*. On lower plans, ElevenLabs keeps transcripts for the retention period. Say this openly in the governance section of the project, or stay on our own Stage 1 stack for the class test.

### 4.7 Analysis (optional)

- **Evaluation criteria**, judged by ElevenLabs after each call:
  - "Asked one question at a time."
  - "Never said anyone's budget or dealbreakers out loud."
  - "Didn't decide or vote for the group."
  - "Stayed quiet when not needed."
- **Post-call webhook:** `https://<your-render-app>.onrender.com/api/sk/agent/webhook`. ElevenLabs signs it with an `ElevenLabs-Signature` header that our server checks. We log only the pass/fail results with the persona; we don't keep the transcript it sends.

## 5. What changes in our code

| Where | Change |
|---|---|
| `lib/sidekick/rooms.js` | Add the six tool endpoints (they wrap `plan.js` and the existing room functions), a route that gets a session token for the room's persona agent, and the signed post-call webhook. When ElevenLabs mode is on, our server stops writing its own spoken lines. |
| `public/js/sidekick.js` | On the planner's phone, load `@elevenlabs/client`, start the session with the token and dynamic variables, pass other people's lines in with `sendContextualUpdate`, and send lines addressed to Sidekick with `sendUserMessage`. Turn off the browser voice on that phone. Everyone else's phone stays as it is. |
| Settings (`.env` and Render) | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_HOST`, `ELEVENLABS_AGENT_FACILITATOR`, `SIDEKICK_TOOL_SECRET`, `ELEVENLABS_WEBHOOK_SECRET` |
| Hosting | The tools need a public HTTPS address, so the branch must run on Render. ElevenLabs can't reach `localhost`. |
| Fallback | If the session can't start, the call carries on with today's browser voice and engine lines. |

## 6. Cost (third-party figures, check elevenlabs.io/pricing)

- **Agent time:** about $0.08 per minute, plus the Claude model's usage, which is billed separately.
- **Included minutes:** 15 on the free plan; 75 on Starter.
- **Example:** 100 calls of 10 minutes is 1,000 minutes, about $80 plus model usage. A class test of about 10 calls fits in Starter.

## 7. Order of work

1. **Dashboard set-up (you):** the two agents, voices, prompts and settings above. Copy the two agent IDs.
2. **Server tools (me):** add the six tool endpoints, the session-token route and the webhook.
3. **Deploy:** put the branch on Render with the five settings, then paste the tool addresses and the secret into both agents.
4. **Test:** a test call with 2 to 3 phones, then the scripted test calls in `test/sidekick-eval.js` against the tool endpoints.
