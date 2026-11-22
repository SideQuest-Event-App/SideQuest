# Sidekick: conversation design (addendum to the build brief)

This replaces the Stage 1 logic in section 3B of the brief and adds a call-first flow.

## 1. What Sidekick is

Sidekick is a facilitator, not a form. Its job is to get the crew to a plan everyone can live with, in as few questions as possible, without deciding for them.

## 2. Facts, in three tiers

| Tier | Fact | Said where |
|---|---|---|
| Must have (filters events out) | Nights and a time window | Group |
| | Who's coming | Group |
| | Each person's max spend | **Private** |
| | Each person's starting point (union / finch / kennedy / kipling) | Private or group |
| | Hard no's (area, 19+, alcohol, accessibility) | **Private** |
| Ranking (orders what's left) | Energy (chill or lively), activity type, something new or a favourite | Group |
| Never ask | Anything the event data can't check | — |

## 3. Choosing what to ask, and when to stop

- Filter the real events by the facts already known. Then ask about the unknown fact that most narrows what's left.
- Stop asking when no possible answer to the remaining questions would change the top 2 picks.
- Picks must also cover two-stop nights (for example, market, then jazz). `match()` currently returns single events.

## 4. One fact sheet, many ways in

Every answer lands in the same per-person record, whichever way it arrived:

- link form;
- private card on the join screen;
- private card pushed mid-call;
- typed in the call;
- spoken in the call.

Each answer carries a `source` and a `visibility` (private or group).

## 5. Call-first flow (no link needed)

1. The planner starts a call and rings the crew. Anyone without the app gets a browser join link.
2. Join screen: Join with voice, Join by text, or answer by form instead. A skippable private card asks for spend, starting point and no's (about 10 seconds).
3. Sidekick opens with what it already knows and gives group limits only.
4. The group talks through the public facts. Sidekick:
   - asks the question that narrows the events most;
   - invites quiet people in by name;
   - reads back what it heard;
   - names conflicts without settling them.
5. If a private fact becomes decisive, Sidekick sends a private card to that person only. It doesn't announce this out loud.
6. Once the stop rule is met, Sidekick offers 2 picks with reasons. Everyone votes and the planner locks the plan.
7. Anyone who missed the call gets a link with the picks. They can vote or flag a dealbreaker before the decide-by time.

## 6. Privacy rules for private answers

- Never say whose limit it is. Say "under $30 for the group", never "Jay's limit is $20".
- If stating the group limit would reveal one person's number, don't state it. This happens with 2 people, or when only one person answered. Just offer picks that fit.
- Never repeat a budget someone said out loud, and never ask follow-ups about it in front of the group.
- Delete private answers after the night. Delete transcripts when the call ends.

## 7. Talking on a call

- Speak only after about 1.5 to 2 seconds of silence, or when addressed (an on-screen "Sidekick" button in Stage 1).
- One sentence at a time. Never interrupt.
- Read-aloud plays from the planner's phone only, to avoid echo.
- Sidekick never votes and never picks for the group.

## 8. Schema changes

- A call is a `plan_request` with `path = call`, so both paths share one table.
- `responses` gains:
  - `source`: link_form, call_card, call_text, call_speech;
  - `visibility`: private or group.

## 9. Voice stack

**Stage 1:**
- Each browser transcribes its own mic with the Web Speech API.
- Claude Haiku runs with `update_plan_facts`.
- Updates reach everyone through server-sent events.
- Read-aloud uses the browser's built-in speech output.
- No extra services.

**Stage 2:**
- A LiveKit room, with a LiveKit agent running as its own worker.
- The agent does speech-to-text (for example Deepgram), then Claude, then text-to-speech.
- ElevenLabs is optional; Cartesia, Deepgram Aura and OpenAI are alternatives.
- Quote the cost before starting.

## 10. How we'll know it works

Write about 20 scripted group transcripts with known correct answers. They should cover:
- someone changing their mind;
- a quiet member;
- off-topic chatter;
- a budget limit given only privately;
- two people wanting different nights.

Pass marks (starting suggestions for the team to set):
- 100% of picks meet every hard constraint, checked by code against the event data;
- facts heard correctly: 90% or more;
- median questions before picks: 4 or fewer;
- in the private-limits test, every private limit surfaces.

## 11. Screen design

Five proposals and the user journey are in the "Sidekick Call Proposals" design canvas: https://claude.ai/artifact/LDK1LKHcXNNdiUMemPQViS
