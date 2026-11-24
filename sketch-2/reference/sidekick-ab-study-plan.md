# Sidekick voice A/B study plan (INF2573)

The study page is `/study`. The code is `lib/sidekick/study.js`, `public/study.html`, `public/js/study.js` and `test/sidekick-study.js`. Results are at `/study/results`.

## Question and hypothesis

Which call voice helps a crew plan a night out better: the calm, unhurried Calm Concierge, or the warm, casual Plugged-In Friend?

- **H1 (main):** on a crew's first call, the two voices differ in how natural the call feels and how much it helps the crew decide (Likert, 1 to 5). We have no strong prior on the direction, so tests are two-sided.
- **H2:** after hearing both voices, testers prefer one voice to the other (more than 50/50).
- **Secondary:** time to picks, questions asked, whether the picks are accepted (plan locked), and which check-in mode the crew picks (lead or sit back).

## Arms

| Arm | Persona | Persona id |
|---|---|---|
| A | Calm Concierge | `concierge` |
| B | Plugged-In Friend | `friend` |

Note: `lib/sidekick/personas.js` and `reference/sidekick-personas.md` use the letters the other way round. For this study, A and B mean what the table says, and the export always carries the persona id next to the letter.

Only the voice changes between arms: the persona's lines (the line book, or AI lines in that persona's style) and the browser voice that reads them aloud (each persona gets its own voice, rate and pitch). Everything else is the same: the plan engine, the question order, the cards, the timing, the practice friends and the checklist. Study calls hide the optional ElevenLabs voice button, so every tester hears the built-in voice. It's capped at a few minutes a month and only the planner can turn it on, so some testers would hear it and others wouldn't.

## Design

- **Unit of assignment: the crew.** A call room has one persona, so everyone on a call hears the same voice. A study session is one crew; its arm comes from the room the study creates.
- **Within-subjects, with a clean first exposure.** Call 1 uses the crew's assigned voice. This is the main, between-groups comparison: nobody has heard the other voice yet. Call 2 is short (one night, about one or two questions) and uses the other voice. Then each tester says which voice they'd keep.
- **Counterbalanced order.** Sessions are assigned in alternating blocks: AB, BA, AB, BA... (the counter is stored in the study file). This keeps the arms 50/50 among the crews that start, and balances order for the preference question.
- **Blind testers.** Testers only see "Voice 1" and "Voice 2". Persona names exist only in the export and the results page, which need the study key.
- **One guided path for everyone,** with a checklist testers can move around in:
  1. Consent and intro (what is recorded and what isn't)
  2. Discover
  3. Open Plan (the study links to `/sk`; the tab-bar Plan button isn't built yet)
  4. Share the call link (Copy, Share, WhatsApp, Messages, Messenger, Telegram, Instagram)
  5. Call 1: the check-in vote, the live plan board, the private budget card, picks, vote and lock
  6. "Just answer, no call" (the form), in a practice call with the voice the crew already heard
  7. Call 2 with the other voice
  8. The comparison survey
  Steps 6 and 7 open only after Call 1, so the first Sidekick lines a tester ever meets are their crew's voice.
- **Solo testers** tap "Add 2 practice friends". These are server-side bots that join the room the way a phone does and tap plausible answers and votes: they go along with the human's answers (sometimes adding one option), never pick a tighter budget than the human, follow the human's check-in vote, and wait for the human before answering (up to 25 seconds). They behave the same in both arms, are flagged `practice`, and are never counted as testers. In Call 2 they come back with Call 1's time, a budget and a start point already in, which is why Call 2 needs only a question or two.

## Features in the path, and what was left out

Taken from `server.js`, `public/`, `lib/` and the README.

Included (meaningfully testable on a phone in a few minutes):
- **Discover** (demo account): For you rows, Map, search with filters, a sidequest's details. This is the home screen people come from.
- **Plan start screen:** picking candidate nights, with event counts.
- **Invite link card and share buttons,** and the link preview, which testers can see by sending the link to themselves.
- **The call:** check-in vote with its countdown, plan board, question cards (say it or tap it), captions or typing, Sidekick read aloud, the private budget card, clash and "not sure" help when they come up, the Sidekick button for picks, the leads / sits-back switch, the two picks with reasons, voting and locking.
- **Form mode** ("Answer without calling").
- **In-app audio** ("Talk in the app") works for crews testing together, but the checklist doesn't require it, because a solo tester can't use it.

Left out, and why:
- Sign-up and onboarding (7 to 8 steps). The demo account skips them, and they're not part of planning.
- Host tools, ticket import, wallet, Wrapped, ratings. They're a different part of the product and need a real event or host account.
- The ElevenLabs voice agent. It isn't the same in both arms (see Arms).
- Reconnects and restarts. They can't be triggered on purpose in a test session.
- The call's own two-question survey. In study calls the study's questions replace it, to keep the surveys under 90 seconds.

## Measures

Per call, logged with the arm, the order and the call number (one row per call):

| Measure | How |
|---|---|
| Questions asked | Question cards Sidekick put up before the picks (`room.asked`) |
| Time to picks | Seconds from the start of the check-in to the picks |
| Picks accepted | The plan was locked (also which pick, and whether each was an event or a place) |
| Check-in mode | lead or sit back, and whether it came from a vote or the 3-second default; any later switch |
| Persona | Arm letter and persona id |
| Crew | Humans, practice friends, and how people joined (voice, text, form) |
| Manipulation check | How many of Sidekick's lines came from the assigned persona's line book and how many from the other (should be 0) |
| Survey (after each call, 1 to 5) | Felt natural · Helped us decide · Trust the picks · Would use again |

After both calls, per tester: which voice they'd keep (Voice 1 or 2, stored as the arm), why (optional free text; names and amounts are removed before saving), and the SEQ ease item (1 to 7, "Overall, how easy or hard was planning with Sidekick?").

The questions take about 45 to 60 seconds in all.

**Privacy:** no names, transcripts, voices or private answers are stored or exported. Transcripts are deleted when each call ends, and the study ends a call as soon as its planner answers the questions. Private answers are never shown with names (the app's existing rule). The export needs `SIDEKICK_STUDY_KEY`.

## Sample size guidance

This is a class project, so expect roughly 10 to 30 crews. Plan for what that can and can't show:

- **Preference (H2), exact binomial test against 50/50, α = .05, 80% power:** about 29 testers to detect a 75/25 split, about 47 for 70/30, and about 85 for 65/35. With 20 testers, only a split of about 80/20 or stronger will be significant.
- **First-call comparison (H1), between crews:** about 25 crews per arm for a large effect (d = 0.8), and about 63 per arm for a medium one (d = 0.5).
- So with a class-sized sample, report the numbers and the direction, and treat significance as a bonus. Aim for an even number of crews, so AB and BA stay balanced.

## Analysis (keep it simple)

1. **First-call metrics, A vs B** (rows with `call = 1` only): compare the means of the four Likert items, seconds to picks and questions asked, and the share of crews that locked a plan or chose "lead". Use a Welch t-test or a Mann-Whitney U, or just report means and differences if the groups are small. If a crew has several testers, average its survey answers first, so each crew counts once.
2. **Preference:** count testers who kept A vs B, and run an exact two-sided binomial test against 0.5. `/study/results` does this for you.
3. **Order as a check:** did people tend to keep the voice they heard first (or second)? `/study/results` shows a binomial test on "kept the first voice heard", and the preference split within AB and within BA. If the two orders disagree strongly, report preference by order instead of pooled.
4. **Manipulation check:** `lines_from_other_book` should be 0 on every row.
5. Use SEQ (1 to 7) as overall ease. Call 2 numbers are context only: those testers had already heard the other voice and had a shorter call.

## Getting the data

- `/study/results`: enter the key to see the summary and download CSVs.
- `/api/sk/study/export?key=...`: calls CSV, one row per call. Add `&table=preferences` for one row per tester, or `&format=json` for both.
- `/api/sk/study/summary?key=...`: the numbers on the results page, as JSON.
- The raw file is `data/sidekick-study.json` (or `SIDEKICK_STUDY_FILE`), mirrored to Supabase Storage when Supabase is set up, because Render's disk is wiped on every deploy.
