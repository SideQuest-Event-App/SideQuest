/* Sidequest wireframe — guided flows.
   Each flow is a scripted path through the screens. Steps advance automatically
   when you tap the matching button inside the phone, or with Next in the notes panel.
   Feature IDs match docs/product-spec.md (A = attendee, H = host). */
(function () {
  const SQ = window.SQ;

  SQ.FEATURES = {
    A1: 'Vibe picker', A2: 'Past event import', A3: 'Contact sync', A4: 'Taste avatar', A5: 'For You feed',
    A6: 'Match score', A7: 'Browse and filters', A8: 'Crew Blend', A9: 'Group plan polls', A10: 'Party chat',
    A11: 'Quest Requests', A12: 'Request notifications', A13: 'Quest Log', A14: 'Venue map and entrances',
    A15: 'Transit there and home', A16: 'Attendee group chat', A17: 'Find my party', A18: 'Rate a quest',
    A19: 'Collected stories', A20: 'Follow hosts', A23: 'Map with location, social, and interest filters',
    H1: 'Host type and profile', H2: 'Verification', H3: 'External ticketing link', H4: 'Team roles',
    H5: 'Create and publish a quest', H6: 'Event day info setup', H7: 'Duplicate a quest', H8: 'Demand Insights',
    H9: 'Demand heatmap', H10: 'Claim a request', H11: 'Followers and taste segments', H12: 'Party vs. solo attendance',
    H13: 'Announcements and live updates', H14: 'Chat moderation', H15: 'Guest list and check-in', H16: 'Live headcount',
    H17: 'Ratings and recap'
  };

  const step = (screen, title, note, features = []) => ({ screen, title, note, features });

  SQ.flows = [
    /* ---------- Attendee ---------- */
    {
      id: 'attendee-registration', group: 'Attendee', label: 'Attendee registration',
      summary: 'A new attendee signs up, teaches their taste avatar, assembles a party, and lands on a personalized feed.',
      setup: (s) => { Object.assign(s.user, SQ.initialState().user); },
      steps: [
        step('landing', 'Landing', 'Two doors in: attendees tap Request a quest, hosts tap Host a quest.'),
        step('signup', 'Create an account', 'Social sign-in or email. Kept short so people get to the fun part fast.'),
        step('ob-vibes', 'Pick vibes', 'The first signal for the taste avatar. At least 3 picks are required.', ['A1', 'A4']),
        step('ob-past', 'Add past events', 'Solves cold start: past events tell the avatar what someone actually goes to.', ['A2', 'A4']),
        step('ob-party', 'Assemble your party', 'Contact sync finds friends already on Sidequest and seeds the first party.', ['A3']),
        step('ob-location', 'Location and transit', 'Used for distance filters and event day transit tips.', ['A15']),
        step('ob-avatar', 'Taste avatar ready', 'Shows what the avatar learned, so recommendations feel explainable.', ['A4']),
        step('discover', 'Personalized feed', 'The For You feed is ranked by match score from the start.', ['A5', 'A6'])
      ]
    },
    {
      id: 'attendee-discover', group: 'Attendee', label: 'Discover and accept a quest',
      summary: 'Browse the For You feed, understand why a quest matches, and accept it.',
      setup: (s) => { SQ.ensureAttendee(s); s.currentQuest = 'q1'; },
      steps: [
        step('discover', 'For You feed', 'Filters narrow by time or price. Match scores combine your vibes with friends who are going.', ['A5', 'A6', 'A7']),
        step('quest', 'Quest detail', 'Why this is for you explains the match. Save, send to party, follow the host, or accept.', ['A6', 'A20']),
        step('tickets', 'Get tickets', 'For the MVP, tickets hand off to the host\'s ticketing link (open question in the spec).'),
        step('questlog', 'Quest Log', 'Accepted quests land in Upcoming, with event day mode ready.', ['A13'])
      ]
    },
    {
      id: 'attendee-map', group: 'Attendee', label: 'Find quests on the map',
      summary: 'See quests around you on a map and narrow them by distance, friends who are going, interests, time, and price.',
      setup: (s) => { SQ.ensureAttendee(s); s.map = SQ.defaultMapFilters(); },
      steps: [
        step('discover', 'List view', 'Discover has two views of the same quests: List (ranked by match) and Map. Both share the same filter chips, so a filter stays on when you switch views. Tap Map at the top.', ['A5', 'A7', 'A23']),
        step('map', 'Quests near you', 'Pins sit around your location. Each shows your match score, and letters show friends who are going. Quick chips filter by friends, your vibes, walking distance, or tonight.', ['A7', 'A23']),
        step('map-filters', 'All filters', 'Distance from you, who\'s going (friends or your party), interest (your vibes, Crew Blend, or one vibe), when, and price. The button shows how many quests match.', ['A23', 'A3', 'A4', 'A8']),
        step('map', 'Filtered map', 'Only matching quests stay on the map. Tap a pin to preview it, then open it or send it to your party.', ['A23']),
        step('quest', 'Quest detail', 'The quest page shows how far away it is. Back returns to the map, and List switches back to the feed.', ['A6'])
      ]
    },
    {
      id: 'attendee-party', group: 'Attendee', label: 'Parties and Crew Blend',
      summary: 'Plan a night with friends: blended taste, shared picks, a group vote, and chat.',
      setup: (s) => { SQ.ensureAttendee(s); },
      steps: [
        step('parties', 'Your parties', 'A party is a friend group that plans together.'),
        step('party', 'Crew Blend and vote', 'Crew Blend merges everyone\'s taste. Add picks to the vote, cast yours, then lock it in.', ['A8', 'A9', 'A10']),
        step('questlog', 'Locked in', 'Once the party locks a quest, it lands in everyone\'s Quest Log.', ['A13'])
      ]
    },
    {
      id: 'attendee-requests', group: 'Attendee', label: 'Quest Requests',
      summary: 'Ask for the events you wish existed, upvote others, and get notified when a host acts.',
      setup: (s) => { SQ.ensureAttendee(s); },
      steps: [
        step('requests', 'Trending requests', 'Upvote requests you\'d go to. Status shows open, heating up, claimed, or live.', ['A11']),
        step('request-new', 'Request a quest', 'A structured "I\'d go to a..." sentence so hosts get clean, comparable demand data.', ['A11']),
        step('requests', 'Posted', 'Your request joins similar ones. Try the Host flows to see it from the other side.', ['A11']),
        step('notifications', 'Notifications', 'When a host claims or fulfills your request, you hear first.', ['A12'])
      ]
    },
    {
      id: 'attendee-eventday', group: 'Attendee', label: 'Event day and after',
      summary: 'Everything on the night itself, then rating the quest and collecting the story.',
      setup: (s) => { SQ.ensureAttendee(s); s.quests[0].accepted = true; s.quests[0].completed = false; s.currentQuest = 'q1'; s.logTab = 'Upcoming'; },
      steps: [
        step('questlog', 'Upcoming quest', 'Open event day mode from the Quest Log.', ['A13']),
        step('eventday', 'Event day mode', 'Venue map, entrance, transit there and home, and live host updates.', ['A14', 'A15', 'A17']),
        step('eventday-chat', 'Attendee chat', 'A group chat for everyone at the quest, moderated by the host.', ['A16']),
        step('rate', 'Rate the quest', 'Use "Demo: skip to after the event" in the Quest Log. Ratings retrain the taste avatar.', ['A18', 'A4']),
        step('profile', 'Collected stories', 'Rated quests become collected stories on the profile.', ['A19'])
      ]
    },

    /* ---------- Host ---------- */
    {
      id: 'host-registration', group: 'Host', label: 'Host registration',
      summary: 'A venue, promoter, or collective signs up, gets verified, and unlocks host tools.',
      setup: (s) => { Object.assign(s.host, SQ.initialState().host); },
      steps: [
        step('host-type', 'Host type', 'Venue, promoter, artist or collective, community group, or brand. Shapes later questions.', ['H1']),
        step('host-account', 'Account basics', 'Hosts can link to an existing attendee account and switch between them.', ['H1']),
        step('host-profile', 'Host profile', 'Vibes and neighbourhood decide which requests and audiences a host sees.', ['H1']),
        step('host-verify', 'Verification', 'Keeps the platform curated and safe for attendees.', ['H2']),
        step('host-ticketing', 'Ticketing', 'Link existing ticketing for the MVP.', ['H3']),
        step('host-team', 'Team', 'Invite teammates as Owner, Editor, or Door staff.', ['H4']),
        step('host-pending', 'Review', 'Approval is manual for now. Use the demo button to approve.', ['H2']),
        step('host-dashboard', 'Dashboard', 'Stats, matching requests, and quests at a glance.', ['H8'])
      ]
    },
    {
      id: 'host-create', group: 'Host', label: 'Create and publish a quest',
      summary: 'A host creates a quest, adds event day info, and publishes it to matched attendees.',
      setup: (s) => { SQ.ensureHost(s); },
      steps: [
        step('host-dashboard', 'Dashboard', 'Start from Create a quest.'),
        step('host-create', 'Quest details', 'Title, day, time, price, and vibe tags. Tags drive matching.', ['H5']),
        step('host-create-dayinfo', 'Event day info', 'Entrance, transit, and coat check feed the attendee\'s event day mode.', ['H6']),
        step('host-published', 'Published', 'The quest goes to matched attendees and parties.', ['H5']),
        step('quest', 'Attendee view', 'The same quest as an attendee sees it.', ['A6'])
      ]
    },
    {
      id: 'host-demand', group: 'Host', label: 'Demand Insights and claiming',
      summary: 'A host reads demand, claims a request, and turns it into a quest.',
      setup: (s) => { SQ.ensureHost(s); s.demandArea = 'All'; },
      steps: [
        step('host-demand', 'Demand Insights', 'A heatmap of when people want to go out, and requests filtered by area.', ['H8', 'H9']),
        step('host-request', 'Request detail', 'Size of demand and who wants it. Claiming tells requesters a host is on it.', ['H10']),
        step('host-create', 'Quest from request', 'The draft is prefilled from the request and linked to it.', ['H5'])
      ]
    },
    {
      id: 'host-eventday', group: 'Host', label: 'Event day, audience, and recap',
      summary: 'Running the night: live updates, check-in, then the recap and audience insights.',
      setup: (s) => { SQ.ensureHost(s); s.currentQuest = 'q1'; s.quests[0].completed = false; },
      steps: [
        step('host-messages', 'Live updates', 'Send an update. It appears in the attendee\'s event day mode and chat.', ['H13', 'H14']),
        step('host-checkin', 'Check-in', 'Guest list with parties shown together, and live headcount against capacity.', ['H15', 'H16']),
        step('host-recap', 'Recap', 'Use "Demo: end the event". Attendance, ratings, and requests fulfilled.', ['H17']),
        step('host-audience', 'Audience', 'Aggregated taste segments and party vs. solo attendance.', ['H11', 'H12'])
      ]
    },

    /* ---------- End to end ---------- */
    {
      id: 'demand-loop', group: 'Full loop', label: 'Demand Signal loop',
      summary: 'The core two-sided loop: an attendee requests a quest, a host claims and publishes it, the requester goes with their party, rates it, and the host sees the result.',
      setup: (s) => { SQ.ensureAttendee(s); SQ.ensureHost(s); s.logTab = 'Upcoming'; },
      steps: [
        step('request-new', 'Attendee requests', 'Post the request as the attendee.', ['A11']),
        step('requests', 'Request is live', 'It sits alongside similar demand. Now switch to the host side.', ['A11']),
        step('host-demand', 'Host sees demand', 'Your new request shows up in Demand Insights. Open it.', ['H8', 'H9']),
        step('host-request', 'Host claims', 'Claim it. The attendee gets notified.', ['H10', 'A12']),
        step('host-create', 'Quest from request', 'The draft is prefilled. Continue to event day info.', ['H5']),
        step('host-create-dayinfo', 'Event day info', 'Publish now.', ['H6']),
        step('host-published', 'Published', 'Requesters are notified first. Switch back to the attendee.', ['H5', 'A12']),
        step('notifications', 'Attendee notified', 'Open the quest from the notification.', ['A12']),
        step('quest', 'Quest from request', 'Marked as made from a Quest Request. Accept it.', ['A6']),
        step('tickets', 'Tickets', 'Hand off to ticketing.'),
        step('questlog', 'Quest Log', 'Use "Demo: skip to after the event".', ['A13']),
        step('rate', 'Rate it', 'The rating feeds the taste avatar and the host\'s recap.', ['A18']),
        step('profile', 'Story collected', 'Now see the host\'s side of the result.', ['A19']),
        step('host-recap', 'Host recap', 'Requests fulfilled and the new rating close the loop.', ['H17'])
      ]
    }
  ];

  // Free exploration entry points
  SQ.freeModes = [
    { id: 'free-attendee', label: 'Attendee app', screen: 'discover', setup: (s) => SQ.ensureAttendee(s) },
    { id: 'free-host', label: 'Host app', screen: 'host-dashboard', setup: (s) => SQ.ensureHost(s) }
  ];
})();
