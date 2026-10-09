/* Sidequest wireframe — mock data and demo state.
   Everything lives in memory; "Reset demo" restores this state. */
window.SQ = window.SQ || {};

SQ.VIBES = [
  'Techno', 'Indie gigs', 'Comedy', 'Art openings', 'Supper clubs', 'Jazz bars',
  'Run clubs', 'Film nights', 'Warehouse raves', 'Night markets', 'Karaoke', 'Live R&B'
];

SQ.AREAS = ['West End', 'Downtown', 'East End', 'Midtown', 'North York', 'Scarborough'];
SQ.DAYS = ['Tonight', 'Fri', 'Sat', 'Sun'];

// Rough neighbourhood centres on the map, in a 100 x 90 grid (1 unit is about 180 m)
SQ.AREA_POS = {
  'North York': [50, 12], 'Scarborough': [85, 20], 'Midtown': [50, 36],
  'West End': [22, 56], 'Downtown': [50, 62], 'East End': [77, 56]
};

SQ.defaultMapFilters = () => ({
  radius: 'Anywhere', who: 'Anyone', interest: 'Any', when: 'Any time', price: 'Any price', selected: null
});

// Friends found through contact sync, with their taste profiles (used by Crew Blend)
SQ.FRIENDS = {
  Maya:   ['Techno', 'Indie gigs', 'Art openings', 'Warehouse raves'],
  Jordan: ['Techno', 'Jazz bars', 'Film nights'],
  Priya:  ['Indie gigs', 'Supper clubs', 'Art openings'],
  Sam:    ['Comedy', 'Karaoke', 'Night markets']
};

SQ.PAST_EVENT_SUGGESTIONS = [
  'Nuit Blanche 2025', 'Boiler Room Toronto', 'Hot Docs screening',
  'Night market at Stackt', 'Comedy Bar open mic', 'Field Trip Festival'
];

SQ.HOST_TYPES = [
  ['Venue', 'You run a bar, club, gallery, or space'],
  ['Promoter or organizer', 'You put on nights at other venues'],
  ['Artist or collective', 'You perform, DJ, or curate'],
  ['Community group', 'You organize for a community or cause'],
  ['Brand', 'You host activations and pop-ups']
];

SQ.defaultDayInfo = () => ({
  entrance: 'Main door, ticket line on the left',
  transit: '505 Dundas streetcar, 12 min from you',
  home: 'Last streetcar 1:48 AM, Blue Night 305 after',
  coat: 'Coat check $3, cash only'
});

SQ.initialState = () => ({
  user: {
    name: '', email: '', registered: false,
    vibes: [], past: [], contactsSynced: false,
    area: '', transit: '', following: []
  },
  host: {
    type: '', name: '', email: '', bio: '', vibes: [], area: '',
    verification: 'none', ticketing: '', ticketLink: '',
    team: [{ email: '', role: 'Editor' }], registered: false
  },
  quests: [
    { id: 'q1', title: 'Basement Frequencies', host: 'The Garrison', day: 'Fri', time: '11 PM', area: 'West End', price: '$25', pos: [19, 52],
      tags: ['Techno', 'Warehouse raves'], going: ['Maya', 'Jordan'], dayInfo: SQ.defaultDayInfo() },
    { id: 'q2', title: 'Hand-Me-Down Records Night', host: 'Tranzac Club', day: 'Sat', time: '8 PM', area: 'Downtown', price: '$12', pos: [48, 60],
      tags: ['Indie gigs', 'Live R&B'], going: ['Priya'], dayInfo: SQ.defaultDayInfo() },
    { id: 'q3', title: 'Rooftop Film Night', host: 'Open Roof', day: 'Sun', time: '7:30 PM', area: 'Downtown', price: '$18', pos: [55, 66],
      tags: ['Film nights'], going: [], dayInfo: SQ.defaultDayInfo() },
    { id: 'q4', title: 'Kamayan Supper Club', host: 'Lamesa Collective', day: 'Sat', time: '7 PM', area: 'East End', price: '$45', pos: [70, 49],
      tags: ['Supper clubs'], going: ['Priya'], dayInfo: SQ.defaultDayInfo() },
    { id: 'q5', title: 'Late Jazz and Dance', host: 'Blue Room', day: 'Tonight', time: '10 PM', area: 'East End', price: 'Free', pos: [80, 60],
      tags: ['Jazz bars', 'Live R&B'], going: ['Jordan'], dayInfo: SQ.defaultDayInfo() },
    { id: 'q6', title: 'Open Studio Crawl', host: 'Junction Arts', day: 'Sat', time: '2 PM', area: 'West End', price: 'Free', pos: [28, 62],
      tags: ['Art openings'], going: ['Maya', 'Priya'], dayInfo: SQ.defaultDayInfo(),
      accepted: true, completed: true }
  ],
  party: {
    name: 'Friday Crew',
    members: ['Maya', 'Jordan', 'Priya'],
    poll: { q1: 2, q2: 1 },
    myVote: null,
    locked: null,
    chat: [
      { from: 'Maya', text: 'Friday? I need a dance floor.' },
      { from: 'Jordan', text: 'Down if it runs late.' }
    ]
  },
  requests: [
    { id: 'r1', text: 'Late-night jazz with a dance floor', area: 'East End', when: 'Fridays', size: '2 to 4',
      votes: 214, parties: 38, voted: false, mine: false, status: 'claimed', claimedBy: 'Blue Room', questId: null },
    { id: 'r2', text: 'Sunday listening bar for new vinyl', area: 'West End', when: 'Sundays', size: 'Solo',
      votes: 126, parties: 19, voted: false, mine: false, status: 'open', claimedBy: null, questId: null },
    { id: 'r3', text: 'Techno in a warehouse, not a club', area: 'West End', when: 'Saturdays', size: '5+',
      votes: 97, parties: 22, voted: false, mine: false, status: 'open', claimedBy: null, questId: null }
  ],
  notifications: [],
  hostMessages: [],
  guests: [
    { name: 'Maya', party: 'Friday Crew', in: false },
    { name: 'Jordan', party: 'Friday Crew', in: false },
    { name: 'Priya', party: 'Friday Crew', in: false },
    { name: 'Sam', party: '', in: false },
    { name: 'Alex', party: '', in: false }
  ],
  eventChat: [
    { from: 'Host', text: 'Doors at 11. North door only tonight.' },
    { from: 'Lee', text: 'Anyone else in the ticket line?' }
  ],
  currentQuest: 'q1',
  currentRequest: 'r2',
  map: SQ.defaultMapFilters(),
  logTab: 'Upcoming',
  demandArea: 'All',
  draft: null,
  lastPublished: null,
  rating: { stars: 0, tags: [] }
});
