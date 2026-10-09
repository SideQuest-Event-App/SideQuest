// Sidequest wireframe · team comments from the Figma file "Sidequest — App Screens (MyCopy)", low-fi page.
// Each comment is keyed by Figma frame number. status: done (changed in this version),
// decision (a call was made, the reason is in `r`), open (still needs the team).
'use strict';
window.SQ_COMMENTS = {
  '01': [
    { t: 'Wording of this is a little confusing. Are you requesting to see other quests?', s: 'done', r: 'Rewritten as a plain sign-in link.' },
    { t: 'Should be reworded to "Already have an account?"', s: 'done', r: '"Already have an account? Log in" on Landing and on Going out or hosting.' },
  ],
  '02': [{ t: 'New input for user name', s: 'done', r: 'Username field added. Also used for finding friends and in attendee chat.' }],
  '03': [{ t: 'ADD: either as a list + search tool. Top 10 most common sort.', s: 'done', r: 'Top vibes as tiles, a "More vibes" list, and search across both.' }],
  '04': [
    { t: 'Should we only have been to (past tense)? Or are we also looking for them to import tickets for events that are coming up in the future?', s: 'done', r: 'Both: past quests seed taste, and upcoming tickets can be imported on the same screen.' },
    { t: 'NOTE: check the constraints that other ticket apps may have. Eventbrite seems to be the most restrictive.', s: 'open', r: 'Placeholder only. Needs a check of each platform\'s import and API terms before build.' },
    { t: 'OUST Eventbrite', s: 'done', r: 'Eventbrite is not an import option. A note offers a screenshot upload instead.' },
  ],
  '05': [
    { t: 'Include an "import contacts" feature', s: 'done', r: 'Import contacts is the main action. Only contacts already on Sidequest are shown.' },
    { t: 'ADD FUNCTIONALITY: can search for people by email or phone number within the app', s: 'done', r: 'Search by email, phone or username.' },
    { t: 'PROFILE data: email, phone number, user name, password, profile name, photo', s: 'done', r: 'All collected on Sign up; photo is set in Profile.' },
  ],
  '06': [
    { t: 'Add LOADING TRANSITION', s: 'done', r: 'Kept the animated step transitions from Kimmy\'s prototype.' },
    { t: 'WORDING needs to be clear, something like "which area of the city do you frequent?"', s: 'done', r: '"Which areas do you frequent?"' },
    { t: 'Remove "how do you get around"', s: 'done', r: 'Removed. Routes on the quest page cover transit, bike and car.' },
    { t: 'Add time of day (i.e. art events could be in the daytime), rename location to details.', s: 'done', r: 'Time of day is its own step, before Areas.' },
    { t: 'When do you like to go to events: day time, night time, weekday, weekend', s: 'done', r: 'Day / night chips plus Weekdays / Weekends.' },
  ],
  '07': [{ t: 'Should we include a verification step where the user can remove some of these taste tags? Or just say they can edit in the menu after? → They can edit in the menu after.', s: 'decision', r: 'No extra step. A note points to Profile, under What Sixer knows.' }],
  '08': [
    { t: 'PRICE filter, event category', s: 'done', r: 'Price and vibe are quick filters on Discover.' },
    { t: 'For usability: what filters or decision criteria are the most important?', s: 'open', r: 'Current order is price, distance, friends, vibe. Worth testing in the next usability round.' },
    { t: 'Category tags (based on default filter tags): event type, interest, distance, price, friends', s: 'done', r: 'Those are the quick filter chips.' },
  ],
  '09': [
    { t: 'Instead of percentage, maybe use color to show that hierarchy', s: 'done', r: 'Match is a 4-step tone scale with a label (Top, Strong, Good, Maybe), everywhere.' },
    { t: 'VISUALLY COMMUNICATE MATCH RATE: colour scale for match rate, icons', s: 'done', r: 'Step marks plus tone. In this greyscale wireframe dark means best; the hi-fi can map it to a colour scale.' },
    { t: 'Green to grey scale', s: 'decision', r: 'Shown as black to light grey here. Green comes in at hi-fi.' },
  ],
  '10': [{ t: 'What does this "send to party" CTA do? If it\'s just share, remove it and add it to the full page.', s: 'done', r: 'Removed from the map card. Share sits at the top of the quest page.' }],
  '11': [{ t: 'CHOICES HERE: start + end time / amenities: accessible, 18+, drinks/food available, attendee capacity, etc.', s: 'done', r: 'Start time plus amenities: step-free, all ages, food, drinks, small crowd.' }],
  '13': [
    { t: 'FOR REFERENCE: look at existing event ticket apps / Airbnb for experiences and locations', s: 'decision', r: 'Layout follows the Airbnb experience pattern: hero, quick facts, host, then details.' },
    { t: 'Add start and end time', s: 'done', r: 'Start and end time in the facts row.' },
    { t: 'RATING: event (if recurring), host (default), location (default)', s: 'done', r: 'Ratings row with host and venue, plus the quest when it repeats.' },
    { t: 'Ticket: button links to platform', s: 'done', r: '"Get tickets on DICE" (or the host\'s platform).' },
    { t: 'Show me how to get here: parking, biking hubs, transit etc.', s: 'done', r: 'How to get here: transit, Bike Share and parking.' },
    { t: 'Types of payments accepted at event? Maybe show as a card/cash icon', s: 'done', r: 'Payment icons: card, cash, tap.' },
    { t: 'Show who\'s going (friends as well as special guests)', s: 'done', r: 'Friends going and special guests sections.' },
    { t: '"Save": change to a bookmark icon instead, add to the top + share at the top', s: 'done', r: 'Bookmark and Share icons in the header.' },
  ],
  '14': [{ t: 'Perhaps have an "Import ticket" CTA? When the user clicks "I have my ticket", the next screen is "import ticket"', s: 'done', r: '"I have my ticket" opens Import ticket.' }],
  '15': [{ t: 'Notifications: event changes / friends inviting you to an event / friend request', s: 'done', r: 'All three, plus "you asked, it\'s happening".' }],
  'New': [
    { t: 'Separate screen here', s: 'done', r: 'Ticket wallet is its own screen.' },
    { t: 'NEW FEATURE: event wallet, show the list of all events you plan to attend + ability to scan or access tickets in the app', s: 'done', r: 'Wallet lists upcoming quests with a scannable ticket each.' },
    { t: 'Show as list or calendar (Partiful reference)', s: 'done', r: 'Quest Log has a list / calendar toggle.' },
  ],
  '16': [{ t: 'Not meant to be a UVP. A general group page to see what themes and interests can be created from everyone\'s avatar.', s: 'decision', r: 'Parties stays a plain group list; each party page leads with shared themes.' }],
  '17': [
    { t: 'Instead of percentage, put icons of the people who voted, so ties are easy to read', s: 'done', r: 'Vote rows show voter faces.' },
    { t: 'Settings work for groups of 2–5. For larger groups consider pie charts, podium of top 3, etc.', s: 'done', r: 'Parties of 6+ get a top-3 podium.' },
    { t: '"In-vote" is confusing, could it be pending? "Blended pick" is confusing, use "group pick"', s: 'done', r: '"Your vote is pending" and "Group picks".' },
  ],
  '19': [{ t: 'Is this like a petition? Better to drop "who\'s coming" and have people pre-register. Hosts trust multiple accounts more than one user saying 5 friends are coming. Party size is still useful for hosts.', s: 'decision', r: 'Your call: each person pre-registers. "Who\'s coming" is gone; every account counts once. Party size shows to hosts in Audience.' }],
  '21': [
    { t: 'Floor plan is based on what the hosts send in', s: 'done', r: 'Floor plan is uploaded in the host\'s Event day info.' },
    { t: 'Event details should be in one single box. The single boxes look like buttons.', s: 'done', r: 'One box with sections.' },
  ],
  '22': [
    { t: 'Add "pinned" and "thread" features hosts can set up? (like Discord threads/forums)', s: 'done', r: 'Pinned host post and thread chips.' },
    { t: 'Use profile icons rather than names', s: 'done', r: 'Faces only in the chat list.' },
  ],
  '23': [
    { t: 'Wording is confusing. Split rating into categories like Google Maps: host, ambience, location/venue, accessibility, vibes', s: 'done', r: 'Overall stars, then the five categories (optional).' },
    { t: '"Collect this story" is confusing, use plain English like "save to past quests"', s: 'done', r: '"Save to past quests".' },
  ],
  '24': [
    { t: 'Add an edit button so the user doesn\'t edit by accident', s: 'done', r: 'Profile is read-only until Edit.' },
    { t: 'We\'ve been using "quest" as a keyword. Why the change to story?', s: 'done', r: 'Quest everywhere: Quest Log, past quests.' },
    { t: 'Maybe "Switch to host account" instead, like Instagram quick switch', s: 'done', r: 'Switch account screen with both accounts.' },
  ],
  '25': [
    { t: 'Are we letting independent hosts register too? (house parties, casual meetups)', s: 'done', r: 'Independent host and Artist / collective added.' },
    { t: 'Make this an input box, or add "Other" and let them specify', s: 'done', r: '"Other" opens a text box.' },
  ],
  '26': [{ t: 'Also ask for work phone number. Small businesses switch names and emails often.', s: 'done', r: 'Work phone added.' }],
  '27': [
    { t: 'Same as user profile, add a search bar', s: 'done', r: 'Tag search on host vibes.' },
    { t: 'Should we ask for all socials? An "Add social" button where they pick the platform', s: 'done', r: '"Add social" chips per platform.' },
    { t: 'Allow skipping social media', s: 'done', r: 'Marked optional.' },
    { t: 'These are typically optional fields, keep that practice', s: 'done', r: 'All socials optional.' },
  ],
  '28': [
    { t: 'Also include socials/website of host', s: 'done', r: 'Website is a verification option; socials live on Host profile.' },
    { t: '→ This can be blended into the page for host account', s: 'open', r: 'Kept as its own step for now so the flow stays short per screen. Merge if testing shows it drags.' },
  ],
  '30': [{ t: 'Door staff depends on the org. Drop that option; say "you can invite event staff when creating an event". Who on the host side needs the app? Probably just the host and marketing.', s: 'done', r: 'Owner and Marketing roles only, with a note about inviting event staff per quest.' }],
  '32': [{ t: 'Stats per event or in total? Organizers want attendees per event, revenue per event (and vendor revenue), views to purchase. Should work like Google Analytics: filter by events, venue and dates.', s: 'done', r: 'Filters for quest, venue and range. KPIs: average attendees, revenue, vendor revenue, conversion. Revenue needs connected ticketing (your call).' }],
  '34': [
    { t: 'Add end time here as well', s: 'done', r: 'Start and end time.' },
    { t: 'Search bar for these tags', s: 'done', r: 'Tag search.' },
  ],
  '35': [{ t: 'Too many routes attendees can take. This should be server-generated, not host-generated. Same with Getting Home.', s: 'done', r: 'Routes and getting home are automatic per attendee.' }],
  '38': [{ t: 'Limit how long one host can claim a request? Or let multiple hosts claim it and show "hosts planning an event like this".', s: 'decision', r: 'Your call: several hosts can claim. The request shows every host planning one.' }],
  '40': [{ t: 'A way to put out a last-minute update ("We can\'t wait to see you in 2 hours"), with the option to schedule it', s: 'done', r: 'Templates, audience, send now or schedule.' }],
};
