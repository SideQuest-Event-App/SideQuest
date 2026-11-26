# SideQuest sketch 2: working notes for Claude

Read this before touching sketch-2. It replaces rediscovering the layout every session. `claude.md` (lowercase) is an old
prompt, not instructions. The user-facing docs are `README.md`.

## Rules
- Work only on the session's `claude/...` branch. Never push or merge to `main`. No PRs unless asked. No force-push.
- Stage files by explicit path and check `git diff --cached --stat` before committing (agents have mixed up each other's files).
- Never commit secrets or `.env`. Keys live in Render's Environment or GitHub secrets, never in chat or code.
- Location is never stored: used live only (search circle, blue dot). Private answers (budget, avoided areas) are never
  shown with a name or said aloud.
- No model names in code, commits or docs. Commit trailers come from the session's instructions.
- Every push to the branch deploys to Render (`sidequest-sidekick`) and ends live calls: push tested work only.

## Stack
Plain Node `http` server (`server.js`), vanilla JS in `public/`, no npm runtime dependencies. Data: Supabase when
`SUPABASE_URL` + `SUPABASE_SECRET_KEY` are set (must be the secret key, not the publishable one), else `data/db.json`.
Events come from `../events` (the importer, its config and `data/events.json`; see `events/README.md`). Node 22.

## Map of the code
- `server.js`: routes, `/api/act` actions, search (`apiSearch`), feed, places proxy.
- `lib/db.js` storage · `lib/launch.js` map places (`nearby`, `forQuery`) · `lib/ai.js` matching.
- `lib/search/`: `taste.js` (taste weights, fit), `rank.js` (MMR, wildcard), `discover.js` (For you order), `want.js`
  (free-text wants like "Chinese skewers", relevance), `mixed.js` (events + places in one list), `foryou.js` (Discover's
  For you vibe collections, `/api/foryou`).
- `lib/sidekick/`: `rooms.js` (live call rooms, SSE, agent tools, picks; big), `plan.js` (slots, filtering, scoring, readiness),
  `places.js` (Google Places searches), `planflow.js` (Plan tab setup), `personas.js` / `talk.js` (spoken lines),
  `tts.js` (ElevenLabs line voice), `usage.js` (spending caps), `study.js` (A/B study, consent, deletion), `callside.js`.
- `lib/tabs/`: Squads, Profile pages, settings, notifications.
- `public/js/`: `app.js` (router, tabs, `SQ.liveCall()` reading `localStorage["sk:live"]`), `screens-attendee.js` (Discover,
  search, event pages, Your Sidequesters), `launch.js` (Discover's sheet, location, places), `screens-tabs.js`
  (Squads, Sidequests, Profile), `map.js`, `sidekick.js` (Plan flow + call screen; big), `study.js`.
- `tools/elevenlabs-agents.js --update | --check`: pushes the agent prompts to ElevenLabs (key is proxy-injected in
  Claude sessions). `reference/elevenlabs-agents.json` is its snapshot.

## Tests
Run from the repo root:
- `node sketch-2/test/run.js --quick`: fast logic tests, about 2 min. Run after every change.
- `node sketch-2/test/run.js --changed`: only the tests mapped to files changed against `origin/main`.
- `node sketch-2/test/run.js`: everything, 3 at a time in isolated copies (tests write `data/`). Run before pushing.
- `node sketch-2/test/run.js --only call-ui.e2e,picks-eval`: named files.
GitHub Actions (`.github/workflows/sketch2-tests.yml`) runs the full suite on every push: read its result instead of
rerunning everything in the chat. Timing tests (`sidekick-thinking`, `sidekick-tts`) run alone at the end; a failure of
theirs under heavy load is worth one rerun before calling it real. Playwright is preinstalled (`NODE_PATH=/opt/node-tools/node_modules`);
never run `playwright install` in a Claude session.

## Working cheaply
- Read the part of a big file you need (grep for the function, then read 50-100 lines), not the whole file.
- Delegate test runs and log reading to a cheaper model; keep design and tricky logic for the strongest one.
- Agent reports: under about 300 words, test counts per file, screenshots only when asked.
- One agent at a time on `rooms.js` / `sidekick.js`: they are the conflict hot spots.
