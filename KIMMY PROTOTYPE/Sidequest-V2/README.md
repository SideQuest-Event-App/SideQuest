# Sidequest v2: merged wireframe

This version merges two sources into one wireframe:

- **Kimmy's clickable prototype** (`the-6ix-sense-wireframe`): its look, layout, data and flows are kept.
- **The team's Figma low-fi file** ("Sidequest — App Screens (MyCopy)", frames 01–42): every screen and every comment left on it is folded in.

Everything uses the Sidequest naming now: quests, parties, Quest Log, past quests, Quest Requests, Weekly Quests.

## Three views

| File | What it is |
|---|---|
| `index.html` | **Interactive prototype.** Tap through it like the app. The sidebar lists all 70 screens; click one to jump there. |
| `board.html` | **Screen board.** Every screen in rows like the Figma file, each with a short annotation and the team's Figma comments underneath, marked Addressed, Decision or Open. |
| `sitemap.html` | **Product sitemap.** How the app is organized: onboarding, the five attendee tabs, the five host tabs and every screen under them. Click any box to open that screen. |

Every screen has its own link, so you can share one directly: `index.html#quest`, `index.html#h-insights`, and so on. The address bar updates as you click around. On the board, a screen's frame opens it in the prototype, and in the prototype "See notes" (above the phone) jumps to that screen on the board.

## View it

No install or build step. It's plain HTML, CSS and JavaScript.

- **On your computer:** open `index.html` (or `board.html`, `sitemap.html`) in a browser.
- **On GitHub Pages:** push the repo, then **Settings → Pages → Deploy from a branch**, pick the branch and folder. The links are then `…/KIMMY%20PROTOTYPE/sidequest-v2/index.html`, `…/board.html` and `…/sitemap.html`.

## What changed from v1

**Structure**
- Attendee tabs: Discover, Parties, Sixer, Quest Requests, Quest Log. The map is now a List / Map toggle inside Discover. Profile opens from the avatar, notifications from the bell.
- Host tabs: Demand, Your quests, Sixer, Insights (with Audience), Inbox. Host profile opens from the avatar.
- Onboarding gains Sign up, Quests you've been to, host account, ticketing, team and review steps.

**Decisions you made**
- **Match score:** a 4-step tone scale plus a label (Top, Strong, Good, Maybe match), everywhere. Attendees never see a percentage. In greyscale, darker means better; the hi-fi can map it to the green-to-grey scale the team suggested.
- **Claiming requests:** several hosts can claim the same Quest Request. The request shows every host planning something like it.
- **Revenue in Insights:** comes from the host's connected ticketing (DICE, Eventbrite, Ticketmaster). Without it, hosts only see views, ticket-link taps and check-ins.
- **Group size on requests:** "Who's coming" is gone. Each person backs a request from their own account, and every account counts once.
- **Naming:** Sidequest plus gaming words. "Save to past quests" replaces "Collect this story".

**New screens from team comments:** Ticket wallet, Import ticket, Notifications, Filters, No matches, Quest Log calendar and bookmarked, Attendee chat with pinned posts and threads, Party of 6+ (podium vote), Profile editing, Switch account, Host account, Ticketing, Team, Review, Create a quest, Event day info, Quest published, Audience, Inbox.

**Still open (also listed at the top of the board):**
1. Eventbrite and other ticket platforms: check what their import and API terms allow before building ticket import.
2. Which Discover filters matter most: test the order in the next usability round.
3. Whether host verification should merge into the host account step.

## Folder structure

```
index.html          Interactive prototype: site map sidebar + phone-sized app
board.html          Screen board: every screen with annotations and Figma comments
sitemap.html        Product sitemap (information architecture)
css/app.css         Layout of every screen (from v1)
css/wireframe.css   Wireframe skin: greyscale, outlines, crossed image boxes, no motion
css/sitemap.css     Sidebar and page layout, including the phone drawer
css/merge.css       Styles for everything added in v2 (match tiers, wallet, votes, host tools…)
css/board.css       Screen board page
css/map.css         Product sitemap page
js/core.js          Icons, demo data, state, match tiers, filters
js/attendee.js      Rendering, attendee tabs and pages
js/host.js          Host tabs and pages
js/onboarding.js    Attendee and host onboarding
js/actions.js       Every tap (one click handler keyed on data-a)
js/sixer.js         Sixer, the AI guide (uses window.claude when available, built-in logic otherwise)
js/boot.js          Start-up and window.Sidequest, the navigation API
js/screens.js       Screen registry: id, Figma frame, title, how to reach it, annotation
js/comments.js      The Figma comments, keyed by frame, with how each was handled
js/sitemap.js       Sidebar and #screen links
js/board.js         Builds the screen board
```

## Editing

- **Change a screen's annotation or add a screen:** edit `js/screens.js`. The sidebar, the board and the sitemap all read from it.
- **Mark a comment resolved or add a new one:** edit `js/comments.js` (status `done`, `decision` or `open`).
- **Change the sitemap tree:** edit the `T` list in `sitemap.html`.
- The scripts are plain files loaded in order (see the bottom of `index.html`); there's nothing to compile.
- **Reset prototype** at the bottom of the sidebar clears saved progress.
