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

# Sketch 2 changelog: 2026-10-19

## Home (Discover)
- Removed "Monday · Toronto" above "Your week, picked." and "Fresh every Monday" under Weekly Sidequests.

## Filters
- New order: Category, Date, Time of day, Price, Distance from home, Who's going, Amenities.
- Date (new): Any day, Today, Tomorrow, This weekend, Custom. Custom shows From and To date pickers (either can be left empty).
- Time of day: added Custom, with From and To time pickers. A range that ends before it starts runs past midnight (8 PM to 2 AM).
- Who's going: "Friends going" is now "Friends" (the chip and the active-filter chip).
- Removed "Starts after" (Custom time of day covers it).
- Active filters show as chips: "This weekend", "Oct 22 to Oct 23", "8 PM to 2 AM", etc.

## Search
- Result rows are unchanged (match tag, the AI's reason, "Not for me").
- The big boxes at the end are replaced by "That's everything for now", a short line naming what wasn't found, "Request this sidequest" and "Know one? Add an event". With no results the heading is "Nothing fit that yet".
- The last search stays until a new one: leaving Search keeps its results, searching the same words again reopens them without asking the AI again, and a reload of the tab keeps them.
- The top line is now "1346 matches with Claude API" (or "… keyword matches (no AI)") in the same small grey text; the AI tag and the "of 3748 sidequests fit … trip" wording are gone.
- Search results have the tab bar. While a search is open, the Discover tab goes back to its results; the back arrow on Search closes it and Discover shows For you again.

## Community
- Removed the "Plan with friends" overline.
- Friends' highlights hidden (`SHOW_HIGHLIGHTS` in `screens-attendee.js` brings it back).

## Add Event
- Removed the "Tell hosts what you want" overline.

## Sidequests
- Sidequest Wrapped cards hidden (`SHOW_WRAPPED` in `screens-attendee.js` brings them back). The Wrapped screen itself still exists.