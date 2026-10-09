# Asia's Logbook
 
**Rubric**
 
- **Reading → decision:** Each reading tied to a real team decision with insight
- **What I did:** Honest, specific account of your own role and growth
- **Systemic reflection:** Reasons about socio-technical and macro-economic implications of the project
- **An honest doubt:** Candid about uncertainty, mistakes, disagreement
- **AI use (disclose):** AI use for research or thinking is allowed and must be disclosed per entry.

 
---
 
## Week 1 – Sept 10
 
### Reading → decision
 
Cagan's *Inspired* (Part III) gave me the two lines I kept returning to: "fall in love with the problem, not the solution," and focus on one target market or persona at a time. 

The Google PAIR guidebook added an AI-specific filter. Don't ask "can we use AI to ___?"; ask "how might we solve ___, and can AI solve it in a unique way?" PAIR lists **personalization, meaning recommending different content to different users**, as a place where AI is better. That is a big reason the event-discovery idea survived our team's brainstorm and the other concepts didn't. 

Recommending events is a real ranking problem that gets better the more the system learns about someone, not just AI bolted onto a static list. PAIR's automate-vs-augment table also shaped an early principle for me: the app should *suggest* where to go, but the person (and their friends) should decide. Choosing how to spend a night out is exactly the kind of thing people enjoy doing and want to own.
 
### What I did
 
[Set up my paid AI tier, GitHub account and access to the team repo.] In the team idea storm each member pitched their own ideas and we eventually converged on an app for finding local Toronto events.
 
### Systemic reflection
 
The lecture's point that "an AI product is always a 2.0–4.0 object wearing 1.0 clothing" changed how I saw our idea. On the surface, an event app is a feed and some filters. Underneath, it sits in a system of venues, promoters, ticketing companies, city nightlife rules and people's budgets. Whatever we rank at the top gets more foot traffic, so a recommendation engine is also quietly deciding which small venues and hosts get seen. That makes "what counts as a good recommendation" a question about fairness and local economies, not only about UX.

This inspired the idea of a clear tagging system for recommendations - show the sources/decision making factors clearly by highlighting recommendations based on: Friend's interests/likes, Your previous events, Ratings from (SOURCE PLATFORM - i.e Google, Reddit, etc.), and others.
 
### An honest doubt
 
I'm used to designing inside a large organization, where research, strategy and build are separate phases with separate owners. Building something before we've validated the problem feels backwards to me. I'm also worried event discovery is a crowded space, and "another events app" might be the least interesting thing we could build.
 
### AI use (disclose)
 
I used CLAUDE to brainstorm candidate concepts and to explain the stack diagram from the lecture (build time → ship time → run time) in plain terms. We also used it for enhancing and iterating on other ideas while we did our individual brainstorms (i.e how can this be enhanced or what are the weakpoints of this idea, etc.)
 
---
 
## Week 2 – Sept 17
 
### Reading → decision
 
Three readings shaped our strategy work this week:
 
- **North Star Playbook:** the idea that a North Star is "a hypothesis, not a scoreboard" gave us permission to draft a metric in class without getting it perfect.
- **Vanity metrics:** the Playbook's vanity-metric test ("if this number doubled overnight, would something good have happened?") made me push against the idea of counting downloads/saves and instead shifting towards event attendance/match rate and inter-user event conversion (i.e how often are people sharing events on the platform to their friends and having those friends also attend those events.
- **Dunford's Positioning Canvas:** listing our *true* competitive alternatives shaped the problem statement. For most people that isn't another app; it's the status quo of checking Instagram, Google and several hubs. That gave us the framing we used: EDMtrain is too niche, and Google is too broad and forces people to search several hubs.
- **Verbeek:** his question "is a human better off, or just more engaged?" became my test for our metric. An events app shouldn't reward people for scrolling; it should reward them for actually going out.


### What I did

I helped our team fill in the North Star template in studio and describing some aspects of our product vision and CX experience.. I wrote down our problem statement and the first version of the solution: an app that shows events in your area filtered by your interests.
 
### Systemic reflection
 
The guest lecture's "Growth = Acquisition × Retention × Monetization" made me realize events are a low-frequency, seasonal behaviour. People might go out once or twice a week at most. Retention can't come from daily habit the way Duolingo's streaks do, so the product needs a reason to come back that doesn't turn into notification spam. The monetization point about AI costs also stuck with me. Every personalized ranking costs tokens, so our most engaged users could be our least profitable, especially if attendees won't pay.
 
### An honest doubt

If our first North Star draft was close to "events saved," I now think it fails the vanity test. Saving an event says nothing about whether someone went or had a good time. I'm also unsure about positioning. Dunford says to earn the category bottom-up, but we keep describing ourselves by comparison to other apps before we know what we uniquely do.
 
### AI use (disclose)
N/A
 
---
 
## Week 3 – Sept 24
 
### Reading → decision
 
- **Torres's opportunity solution tree:** her "opportunity vs. solution" test changed how I see our concept. "An app to find events" is a solution in disguise; there's more than one way to address the need underneath it. Asking *why* people struggle to go out surfaced better opportunities: "I hear about things the day after," "my friends can't agree, so the plan dies in the group chat," and, on the other side, "I don't know what people want before I book it." We have only just started interviewing, though (see my doubt below), so these are still hypotheses.

That reframing led to our biggest decision this week: we narrowed from "a better events feed" to two differentiating features.
    - **Crew Blend** combines a friend group's tastes to find the event everyone will like.
    - **Demand Signals** let attendees say "I'd go if…" so hosts can see demand before they book.

- **Dorst:** his idea that designers first hunt for the **central paradox** helped explain *why* this was a better frame. Attendees don't know what's worth going to, and hosts don't know what people want. Both sides are guessing about each other. Framing the product as two-sided, with attendees *and* hosts as users, is what Dorst calls frame creation: a new standpoint that made solutions visible that weren't there when we only thought about attendees.

  
### What I did
 
This was my heaviest week so far. I:
 
- **Figma deck:** drafted a product overview and a competitor analysis of Fever, DICE and Eventbrite, and built them into a 17-slide Figma deck using each competitor's logo only, with links to their sites. I later added Motivez, a Toronto group-planning app, to the analysis.
- **Product decisions:** proposed the name options. I also added an AI avatar that learns from interests, past events attended and friends' events, and made onboarding capture past events so recommendations aren't blank on day one.
- **Event day hub:** added support for the night itself: venue maps, entrances, attendee chats and transit.
- **Pushed back on my own work:** after reviewing the proposal, I said it "doesn't seem any different from other apps." That led to choosing Crew Blend and Demand Signals and adding hosts as a second user group.
- **North Star:** revised it three times in one week. It went from group attendances plus recommendation hit rate, to a version covering both solo and group attendees *and* hosts: "Connect every Torontonian, solo or with their crew, to events they'll love, and help hosts create the events Toronto wants."
- **Repo:** wrote the repo README (team, meeting times, structure) and started a `research/` folder with a sourced industry analysis and competitor analysis.


### Systemic reflection
 TBD


### An honest doubt
 
I have two:
 
- **Crew Blend isn't interview-backed yet.** The Week 3 rule is "no quote, no branch," and I have to admit Crew Blend came out of a brainstorming session with AI, not from a participant's words. It *feels* right, and there's outside evidence that "can't convince my friends" keeps people home. But until one of our own interviewees says it, it belongs on the tree as an **assumption**, not an opportunity.
- **I got attached to a tagline too early.** I asked for "the Spotify for local events" before checking the market, and the research then showed Spotify already runs a *Concerts Near You* playlist and a local events feed. We have to retire that line publicly.
I'm also not sure hosts will pay for Demand Signals. Until we interview a few promoters or venue managers, "hosts pay" is our business model's biggest untested bet.
 
### AI use (disclose)
 
I used Claude (Cowork) heavily this week:
 
- **Research:** web research on competitors and the industry, with every finding linked to a source I could check.
- **Build:** building the Figma deck through the Figma connector, and drafting the product overview, proposal doc, README and research files.
- **Ideas:** generating options for names, North Star metrics and differentiating features.
The decisions were mine and the team's: choosing Crew Blend and Demand Signals, adding hosts as a user group, and the final North Star wording. I pushed back when the AI output felt generic. [Confirm: I spot-checked key figures against the linked sources before putting them in the repo.] I still need to trace Crew Blend to real interview quotes.
 
