# Sidekick personas and the A/B test

Sidekick has two personas. Both share the same rules and the same local knowledge. They differ only in how they talk.

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

| | The host | The facilitator |
|---|---|---|
| Feel | Warm, upbeat, a bit playful, like a radio host who knows the crew | Calm, friendly and inclusive, like the friend who's great at running a group chat |
| Moves it leans on | Welcomes people by name, keeps the energy up, makes the picks feel like a fun reveal | Invites quieter people in, reads back what it heard, names disagreements gently |
| Welcome | "Welcome back, Sat squad! It's been three weeks, so let's fix that. Which night are we going for?" | "Hey everyone, I'm Sidekick. I'll keep track so you can just talk. Which night works for you?" |
| Conflict | "Plot twist: Asia wants live music, Jay wants games. One spot with both, or one of each?" | "Sounds like two ideas: live music and games. Jay, what matters most to you?" |
| Picks | "And the contenders are: jazz in Leslieville at $15, or the free night market. Vote away." | "Here are two that fit everyone: jazz in Leslieville, or the night market. What feels right?" |
| Local detail | "Leslieville's a quick streetcar ride east, and people say the jazz trio there is properly cosy." | "The jazz trio's in Leslieville, about 15 minutes east of Union, and reviews say it's relaxed." |
| Read-aloud | Slightly faster and higher (rate 1.06, pitch 1.1) | Steady (rate 0.97, pitch 1.0) |

## How the A/B test works

- **Assignment:** each new call is randomly given one persona, 50/50.
- **Blind:** the persona is never shown to anyone on the call.
- **Forcing one for a demo:** start the call from `/sk?persona=host` or `/sk?persona=facilitator`.
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
