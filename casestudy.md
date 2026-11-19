# Sidequest: Designing an Event App at AI Speed, and Learning When to Subtract

> **Status:** in progress (as of Oct 20, 2026). Usability testing comes next.

| | |
|---|---|
| **Product** | Sidequest, a Toronto event discovery app for students and young professionals who want to find their scene and get their friends to come along |
| **Team** | Taylor Fergusson, Asia, Amy, Kim, Nermin |
| **My role** | Built Sketch 0, merged it with the team's wireframe into Sketch 1, built the real event data pipeline and hosting, made the pretotype site, and refined Sketch 2 |
| **Timeline** | Sept 10 – present (6 weeks so far) |
| **Tools** | Claude Code, Figma, Supabase, Render, GitHub Actions, Otter.ai |

**In one line:** in six weeks we went from a greyscale app that matched interests to events to a fully designed app with thousands of real Toronto events. Most of the design work along the way was deciding what to ground in research, what to slow down, and what to take out.

---

## 1. The problem

Finding things to do in Toronto means checking Instagram, TikTok, group chats, Eventbrite, DICE and blogTO, then convincing your friends. The smaller, niche events that make a city feel like yours are the hardest to find, because they're mostly promoted on Instagram.

**North Star:** *connecting users to other like-minded people through worthwhile events in their area.* We measure it by events people **confirm they attended** and how they rate them, not by downloads, clicks or saves. We used the North Star Playbook's vanity-metric test to rule those out: if saves doubled overnight, nothing good would necessarily have happened.

## 2. Research

We each ran one interview, then I synthesized mine and combined it with Amy's into a single opportunity tree (`week-3/merged-tree.md`). The tree's outcome was *"increase attendance at events users genuinely care about."*

| Opportunity | Evidence |
|---|---|
| **Getting there takes too much effort** (strongest, from both participants) | *"I need to take TTC, then go train, then Uber. That will be a lot."* · *"I don't want to spend too much time on the way."* |
| **Cost decides whether they go** | *"Like the ticket sells like $200. Oh no, that's a big no."* |
| **Friends decide whether they go** | *"It's usually based on if your friends are interested."* |
| **The event has to feel worth leaving home for** | *"I don't like go out, it's too much and also it's too cold most of the time."* |

**What I heard that I didn't want to hear.** My participant doesn't really go out. We didn't have time to screen participants, so neither interviewee was our ideal user: one prefers large events and the other only goes out when friends ask. I kept their insights, since distance and cost came up clearly for both, but I treated them as directional, not as proof. This doubt shaped how I approached the rest of the project: **I wanted to be able to trace every feature back to something real.**

## 3. Three iterations

![Placeholder: the same flow (search → results → "nothing fit") shown in Sketch 0, Sketch 1 and Sketch 2](images/flow-comparison.png)

| | Sketch 0 | Sketch 1 | Sketch 2 |
|---|---|---|---|
| **Question** | Can AI matching work at all? | What does the full vision look like with real data? | What survives once it's designed and pruned? |
| **Scope** | 4 tabs, 23 made-up events | 38 screens across attendee and host apps, real events from 7 sources | Every screen in the Figma file, phone/tablet/desktop layouts, real maps |
| **Visual** | Greyscale on purpose | Unstyled on purpose, with tokens ready for colour | Full visual system (Geist, the Figma tokens) |
| **Key move** | Budget and travel limits applied *before* the AI sees any events | Anything a listing doesn't give is shown as "N/A" instead of guessed | Subtraction, and moving filters into the search bar |
| **Lesson** | A feature traced to an interview quote is easy to defend | Building everything makes us look like everyone else | Our edge is crew, demand and community |

### Sketch 0: one thing, done honestly (Weeks 2–3)

**Hypothesis:** if you tell the app what you're into, your budget and where you're starting from, it can return Toronto events that fit, each with a one-line reason.

![Placeholder: Sketch 0 Discover and results](images/sketch-0.png)

What I built, with Claude Code generating the code:
- **Discover:** interests, budget and starting point for each person, with **Crew Blend** for up to 4 people. The group's budget is the lowest anyone set, and every pick must be within everyone's travel limit.
- **Constraints before AI:** limits filter the event list *before* matching, and the AI can only return events from that filtered list. So it can't recommend something too far or too expensive, or make one up.
- **Honest attendance:** "I'd go" counts as intent only. After the event, the app asks *"Did you go?"*, and only a "yes" counts toward the North Star and unlocks a rating.
- **Gaps become demand:** when nothing fits an interest, the app says so and offers **Request it**, which posts to a board hosts can see.
- **Fallback:** without an AI key, matching falls back to simple keyword matching and says so.

**Research → decision:** both interviewees cared most about distance, so in Week 3 I added transit time and transfers from four starting points, plus a maximum travel time.

**What it taught me:** the location feature felt tacked on rather than designed, because Claude did most of the integration and I hadn't decided what location should *mean* in our app. That was my first sign that speed doesn't mean progress.

### Sketch 1: the full vision, with real data (Weeks 4–5)

**Hypothesis:** if we combine the team's 38-screen wireframe with Sketch 0's working server and AI, and use real events, we'll see what the full product really is.

![Placeholder: Sketch 1 For You feed, quest page with "Listing details", host Demand Insights](images/sketch-1.png)

What I did:
- Merged Asia's wireframe (onboarding, For You, Crew Blend with group vote, Quest Requests, Quest Log, Event Day Mode, host tools, Demand Insights) with Sketch 0's server, database and AI. Everything the wireframe faked became real and shared, so a request an attendee posts appears in the host's dashboard.
- Built an importer for the next four months of in-person GTA events from **DICE, Eventbrite, Meetup, Luma, City of Toronto open data, Ticketmaster and venues' Instagram posts**, with duplicate merging and "Also listed on" links.
- **Honest data:** missing price, time, organizer or image shows as "N/A". Real listings have no reviews or "who's going," so the app doesn't invent any. Events added by users start **Unverified** until another attendee confirms them.
- Kept it **unstyled on purpose** (greyscale, no gradients or shadows, WCAG AA contrast), so we judged flows instead of looks.
- Moved the data to Supabase and put the app online at demo.sidequest.rsvp, so teammates could test it without running it locally.

**What it taught me:**
- **Bloat.** With every feature in, *"we're not offering much that's different from our competitors, especially since we are still relying on them for ticket sales."*
- **Vague prompts are expensive.** I had prompted Claude as if it already knew what I meant. Each iteration took about 30 minutes of processing and a lot of tokens, and the Eventbrite scraping ran into rate limits. I learned to work in smaller, clearer steps.
- **A disagreement worth having.** I worried that Asia's wireframe wasn't grounded in our research. When I raised it honestly, she showed me the documents she'd based it on, which I hadn't read. Since then I go through teammates' work before I question it.

### Sketch 2: design it, then subtract (Week 6 to now)

**Hypothesis:** if we code the Figma design faithfully on top of Sketch 1, then cut what doesn't serve the North Star, the product's edge becomes visible.

![Placeholder: Sketch 2 For You, search results with filter chips, Community, desktop layout](images/sketch-2.png)

What changed:
- **Coded from the Figma file**, with layouts for phone (up to 760px), tablet and desktop (a sidebar from 1100px), and interactive maps built on free OpenStreetMap data.
- **Subtraction** (my changelog, Oct 18–19):
  - Hid Sidequest Wrapped cards and friends' highlights. They're easy to bring back, but they weren't serving attendance.
  - Removed extra labels ("Plan with friends," "Tell hosts what you want," "Monday · Toronto," "Fresh every Monday") and the quick filter chips.
  - Replaced "1107 of 3748 sidequests fit …", which was misleading because it counted past events, with "1346 matches with Claude API".
- **Filters in the search bar:** one Filters button with a count, active filters shown as removable chips, and one shared set of filters for For You, Map and Search. Filters are ordered by how people decide: category, date, time of day, price, distance, who's going, amenities.
- **Honest endings:** search ends with *"That's everything for now,"* names what wasn't found, and offers **Request this sidequest** or **Know one? Add an event**. With no results, the heading is *"Nothing fit that yet."* This is Sketch 0's honesty rule surviving into the final design.
- **Privacy by default:** nothing about an account is stored until onboarding is finished, so we keep no data on people who give up partway.
- **Lasting event sourcing:** a weekly GitHub Action imports events within each site's robots.txt rules, keeps last run's events if a source fails, and never calls the AI.

## 4. Design principles that held across all three sketches

1. **Count real outcomes.** Intent ("I'd go") and attendance ("Did you go?") are kept separate everywhere, including hosts' dashboards.
2. **Never fill gaps with guesses.** Show "N/A," mark events unverified, and say which engine made the match.
3. **Constraints come before AI.** Hard limits like budget and distance are filtered in code, not left to the AI.
4. **Assist, don't automate.** The app suggests and people decide. Niche events are partly about discovering them yourself, so the app should guide that, not replace it.
5. **A gap is a signal.** "Nothing fit" becomes a request that hosts can act on.

## 5. Systems and ethics

- **Sourcing bias.** Platforms with APIs favour already-popular events, but our point is niche ones, which live on Instagram. So we added Instagram through the official Business Discovery API, with posters and captions read by AI, even though posts are messier than listings.
- **Respecting platforms.** We left out Resident Advisor, Partiful, blogTO and NOW Toronto because their terms or robots.txt rule it out. Copying listings is fine for a class prototype, but at launch, data should come from hosts and partner feeds.
- **Cost and footprint.** In Week 1 I worried about people's views of AI and its environmental cost. The guardrails we built in response: Instagram is read by hand with Claude Code, capped at 40 AI calls a run; scheduled imports use no AI; and search asks for 10 picks at a time, only fetching more when you scroll.
- **Accountability.** When AI does the dirty work, we're still responsible for what it does, which is why we review its output and set guardrails up front.

## 6. Pretotyping

Taking the "Facade" idea from the pretotyping readings, I bought **sidequest.rsvp** and made a one-page promotional site with Instagram and Facebook accounts, to gauge outside interest before launch. These accounts were also what we needed to get Instagram and Ticketmaster API access, so the facade unlocked our data sources too.

![Placeholder: sidequest.rsvp landing page](images/sidequest-rsvp.png)

## 7. Reflection so far

- **Speed hid missing decisions.** Fast, good-looking output made it easy to skip deciding what we actually wanted. I think a lot of AI-built apps will be bloated or look the same for this reason. The fix was knowing what I wanted before prompting.
- **My work shifted, but systems thinking still mattered.** Claude did a lot of the tedious work I enjoy, but systems thinking carried over into prompts, guardrails, data pipelines and deciding what to cut.
- **Traceability is a design tool.** Week 3's worry about not knowing where things came from led to strategy files, reference docs and changelogs that tie the build back to research.
- **Open questions:**
  - Is there room for Sidequest in today's ecosystem, or is community our only real edge?
  - Can we get a steady flow of events without scraping?
  - Will hosts actually use Demand Signals?

## 8. Next steps

- Usability testing on Sketch 2, focused on onboarding, search and Crew Blend.
- Test the community angle: friends, parties and requests.
- Talk to hosts to test whether Demand Signals is worth it to them.

---

*AI use: Claude Code generated most of the sketches' code and helped synthesize the interviews. Otter.ai transcribed my interview. Product decisions, what to cut, and the research synthesis direction were made by me and the team.*
