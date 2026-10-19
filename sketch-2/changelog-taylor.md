# Sketch 2 changelog: 2026-10-18

## Setup
- Confirmed Sketch 2 already uses Sketch 1's Supabase project. Old `sketch2_accounts` view needs replacing with the table (SQL given; run in Supabase).
- README: added steps for deploying to Render (start `node sketch-2/server.js`, paid `ANTHROPIC_API_KEY`).

## Home (Discover)
- "Recommendations" renamed "For you". For you and Map share one header: toggle, bell, search bar.
- Removed the "N this week" line, quick filter chips and Profile avatar.
- Filters button in the search bar (shows a count); active filters show as removable chips.
- "See all (N)"; "Vibe Mixes" with a count circle on each tile; tile titles smaller than the heading.
- Save button on cards has a visible circle.
- All inputs: distinct fill, lilac border, hover and focus ring.

## Search
- Filters on the results page; changing one re-runs the search.
- Results reveal 5 at a time on scroll; the AI is asked for 10 per page, and the next page is fetched when needed.
- Rebuilt with the design's quest rows; "Not for me", Request it and Add event kept.

## Filters
- Time of day moved into the Filters sheet.
- Price is a slider: Free to $100+.
- Distance is a slider: 1 km to Within 10 km (no limit until moved).

## Onboarding
- One chevron on "Slide to explore".
- Selected cards no longer shrink (outline instead of border).
- Removed unused Apple/Google icons (sign-in buttons were already gone).

## Layout
- Old phone-frame preview removed; full screen at every size.
- Phone (≤760px), tablet (761–1099px, centred column), desktop (≥1100px, sidebar nav, wider column, two-column landing, full map).
- Sketch controls moved to a corner button on tablet and desktop.

## Map
- OpenFreeMap/OpenStreetMap credit folded into a small "i" button (licence requires the credit).

## Notes
- `concerns.md` rewritten with open issues and decisions.
- Nothing committed yet.
