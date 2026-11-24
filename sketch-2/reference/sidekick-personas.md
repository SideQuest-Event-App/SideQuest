# Sidekick personas and the A/B test

Sidekick has two personas, the Plugged-In Friend and the Calm Concierge, chosen from the persona board with the team's edited lines. The full line book is in `LINES` in `personas.js`. Both also follow GUIDE rules: when answers are vague or missing, Sidekick offers ideas from what's actually on. Both share the same rules and the same local knowledge. They differ only in how they talk.

The plan engine (`lib/sidekick/plan.js`) decides **what** Sidekick does next: ask about time, name a conflict, offer picks. The persona decides **how** it sounds. So the test compares voices, not two different planners.

The prompts are in `lib/sidekick/personas.js`.

## Shared by both

**Rules:**
- **It's an AI.** It never pretends to be a person, never says it'll come along, and never claims feelings.
- **Short.** One or two sentences, 25 words at most, ending on a question or a clear choice.
- **No filler.** No flattery or stock phrases ("Great question!", "As an AI", "I'd be happy to"). A reply that uses one is swapped for a safe fallback line.
- **Private stays private.** It never mentions anyone's budget or dealbreakers, or who gave them. Money amounts are also removed from the transcript before the persona sees it.
- **People decide.** It never votes, never pushes a pick, and never jokes at anyone's expense.

**Local knowledge:**
- It talks like a friend who knows Toronto's neighbourhoods and transit: neighbourhood, price, rating, a line from a review, trip time.
- It can only use details found in the event listings it's given. It never invents venues, reviews, ratings, prices or times.

## The two personas

| | The Plugged-In Friend (B) | The Calm Concierge (A) |
|---|---|---|
| Feel | Warm, casual, lightly funny, honest, low-key confident, like a voice note from your best friend | Unhurried, reassuring and precise, like a great hotel concierge in your pocket |
| Signature | Every pick comes with a reason | Gives people time and lays out the choice ("Either works well." "Take your time.") |
| Hello | "Hey, y'all, let's get the ball rolling for our next side quest. What day works best for everyone?" | "Hi everyone, I'm Sidekick. I'll keep track, so you can just talk. Which night works best?" |
| Clash | "Half of you want loud, half want to talk. Lemme find two spots close together, so nobody loses." | "Two of you lean toward live music, and one toward games. Either works well. Would you like a place with both?" |
| Guide | "No stress if you're not sure. Saturday has live music, comedy, or a games night. Any of those sound good?" | "Some ideas, if you'd like: live music, comedy, or a games night. Which sounds closest?" |
| Picks | "Found two. The jazz trio in Leslieville, low-key live music for about fifteen bucks. Or the free night market. Which one?" | "I've found two that suit everyone. A jazz trio in Leslieville, quiet and seated. Or the night market, which is free. Take your time." |
| Read-aloud | Relaxed (rate 1.02, pitch 1.04) | Slower and steady (rate 0.95, pitch 1.0) |

## How it sounds

Both personas follow rules for writing for the ear (`EAR` in `personas.js`), drawn from Google's, Amazon's and Apple's voice-design guides:
- **One breath:** about 20 words.
- **Spoken numbers:** "about twenty bucks", "Saturday", not "$20.00" or "Sat, Nov 28".
- **Varied openers:** the model is shown its last three lines so it doesn't start the same way, and the fallback lines come in several versions.
- **Small linking words:** "So", "Alright". Never "um".
- **Clear handoff:** each line ends with a question to someone.

**On the planner's phone:**
- **Best voice first:** Sidekick uses the most natural voice the device has. In order: Edge's "Online (Natural)" voices, then Apple's "Premium"/"Enhanced" voices, then Google's.
- **A voice per persona:** the host and the facilitator get different voices.
- **Clean-up before speaking:** brackets are dropped, and abbreviations are read out in full.
- **Stops for people:** Sidekick stops talking as soon as anyone else starts.

A planner can choose the voice for each persona; the choice is saved on that phone. The browser demo has a voice picker for trying them. Paid voices from OpenAI or ElevenLabs would be a server-side step on top of this.

## How the A/B test works

- **Assignment:** each new call is randomly given one persona, 50/50.
- **Blind:** the persona is never shown to anyone on the call.
- **Forcing one for a demo:** start the call from `/sk?persona=friend` or `/sk?persona=concierge` (the old names `host` and `facilitator` still work).
- **Survey:** after the plan is locked, everyone answers two questions from 1 to 5: "Did Sidekick feel like a friend on the call?" and "Did your input count?"
- **Logging:** every event below carries `persona`. Events hold ids and numbers only, never names or what anyone said.

| Event | When | Useful properties |
|---|---|---|
| `plan_started` | A call is created | `path: "call"`, `persona`, `nights` |
| `sk_joined` | Someone joins | `mode` (voice, text or form), `crewSize` |
| `response_submitted` | Any answer lands | `slot`, `source` (call_card, call_speech, call_text or link_form), `visibility` |
| `sk_question_asked` | Sidekick opens a question | `slot`, `pool` (events still fitting), `n` |
| `sk_said` | Sidekick speaks | `move`, `ai` (true if the model wrote it), `words` |
| `sk_relaxed` | The crew agrees to loosen a limit | `kind` |
| `call_facts_complete` / `picks_shown` | Picks appear | `secs`, `questions`, `pool` |
| `sk_vote` / `plan_locked` | Votes and lock | `secs`, `votes` |
| `sk_survey` | Survey answered | `friend`, `heard`, `mode` |
| `sk_call_ended` | Call ends | `why`, `secs`, `locked` |

Each ended call also adds one line to `data/sidekick-summaries.jsonl`. It holds the persona, crew size, how people joined, seconds taken, questions asked, the group facts, the pick ids and the survey scores. There are no names and no transcript.

## Comparing the two

Run the same scripted tasks with both personas (see the usability test plan in `sidekick-conversation-design.md`), then compare:

1. **Did Sidekick feel like a friend?** Average of `friend`.
2. **Did your input count?** Average of `heard`, especially from text and form joiners and the quietest person.
3. **Time to a locked plan:** `plan_locked.secs`.
4. **Questions before picks:** `call_facts_complete.questions`. Both personas use the same engine, so this should match. If it doesn't, people answered differently.
5. **How often it fell back:** `sk_said` with `ai: false`. That's the share of lines where the model was slow or broke a rule.

Pick the persona that's friendlier **without** being slower. With 5 or more crews per persona, look at the spread as well as the average. A difference of less than 0.5 on a 1 to 5 scale is probably noise.

Supabase query (the `analytics_events` table):

```sql
select props->>'persona' as persona,
       count(*) as answers,
       round(avg((props->>'friend')::numeric), 2) as felt_like_a_friend,
       round(avg((props->>'heard')::numeric), 2) as input_counted
from analytics_events
where name = 'sk_survey'
group by 1;
```
