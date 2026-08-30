import { buildVector, defaultMask, DIMENSIONS, type InterestVector } from '@/ai/matching';
import type { DistanceBucket } from '@/chain/midnight/types';

/**
 * The demo roster.
 *
 * Every persona carries a real bio, which is run through the real vectoriser to
 * produce a real interest vector - the matching screen is not showing
 * hand-tuned percentages. Change a bio and the ranking changes, because the
 * same code path runs in the demo as in production.
 *
 * `email` is only a Gravatar key. None of these addresses are registered, so
 * each resolves to a deterministic generated avatar.
 */

export type Person = {
  id: string;
  name: string;
  age: number;
  email: string;
  bio: string;
  tags: string[];
  area: string;
  /** Bucket their proximity proof disclosed. Never a distance. */
  bucket: DistanceBucket;
  online: boolean;
  /** Which sensitive dimensions this person opted into scoring. */
  opensUp?: (typeof DIMENSIONS)[number][];
  lastSeen: string;
};

const ROSTER: Omit<Person, 'email'>[] = [
  {
    id: 'emma',
    name: 'Emma',
    age: 27,
    bio: 'Reading in the park most Sundays, terrible at chess, will travel a long way for good coffee.',
    tags: ['reading', 'coffee', 'travel', 'chess'],
    area: 'Riverside Park',
    bucket: 0,
    online: true,
    lastSeen: '2m ago',
  },
  {
    id: 'david',
    name: 'David',
    age: 29,
    bio: 'Coffee lover, just wandering. Films on weeknights, hiking when the weather allows.',
    tags: ['coffee', 'films', 'hiking'],
    area: 'Central Park area',
    bucket: 0,
    online: false,
    lastSeen: '8m ago',
  },
  {
    id: 'alex',
    name: 'Alex',
    age: 31,
    bio: 'Engineer, building something in the evenings. Cycling, vinyl, and an ongoing argument about the best ramen in the city.',
    tags: ['tech', 'cycling', 'vinyl', 'food'],
    area: 'Lower East',
    bucket: 1,
    online: true,
    lastSeen: 'Yesterday',
  },
  {
    id: 'luisa',
    name: 'Luisa',
    age: 26,
    bio: 'Galleries, photography, long dinners. Meditation most mornings, badly.',
    tags: ['art', 'photography', 'food', 'meditation'],
    area: 'Museum Mile',
    bucket: 1,
    online: true,
    opensUp: ['spirituality'],
    lastSeen: 'Yesterday',
  },
  {
    id: 'tom',
    name: 'Tom',
    age: 26,
    bio: 'Running, board games, and a dog who runs the household. Mostly outdoors.',
    tags: ['running', 'board games', 'dog', 'outdoors'],
    area: 'Central Park area',
    bucket: 2,
    online: false,
    lastSeen: '2 days ago',
  },
  {
    id: 'anna',
    name: 'Anna',
    age: 28,
    bio: 'Music first. Concerts, festivals, guitar in the corner of the room. Vegetarian and evangelical about it.',
    tags: ['music', 'concerts', 'festival', 'vegetarian'],
    area: 'Warehouse District',
    bucket: 2,
    online: false,
    opensUp: ['health'],
    lastSeen: '2 days ago',
  },
  {
    id: 'michael',
    name: 'Michael',
    age: 30,
    bio: 'Startup founder, gym at six, novels on the train. Ambitious in a way that is either endearing or exhausting.',
    tags: ['startup', 'gym', 'books', 'career'],
    area: 'Financial District',
    bucket: 3,
    online: true,
    lastSeen: '5 days ago',
  },
  {
    id: 'nataly',
    name: 'Nataly',
    age: 25,
    bio: 'Baking, painting, and a permanent list of countries to get to. Organises for a tenants union on weekends.',
    tags: ['baking', 'painting', 'travel', 'organising'],
    area: 'Northside',
    bucket: 3,
    online: false,
    opensUp: ['politics'],
    lastSeen: '3 days ago',
  },
  {
    id: 'sophie',
    name: 'Sophie',
    age: 26,
    bio: 'Living life one coffee at a time. Films, hiking, travel, and looking for someone real, kind, and curious about things.',
    tags: ['coffee', 'films', 'hiking', 'travel', 'reading'],
    area: 'Central Park area',
    bucket: 0,
    online: true,
    lastSeen: 'now',
  },
];

export const PEOPLE: Person[] = ROSTER.map((person) => ({
  ...person,
  email: `${person.id}@halo.demo`,
}));

export const PEOPLE_BY_ID = new Map(PEOPLE.map((p) => [p.id, p]));

/** Vectors are derived, not authored - the demo runs the production path. */
export const VECTORS = new Map<string, InterestVector>(
  PEOPLE.map((p) => [p.id, buildVector(p.bio, p.tags)]),
);

/** Consent mask per person, honouring their `opensUp` list. */
export function maskFor(person: Person): number[] {
  const mask = defaultMask();
  for (const dimension of person.opensUp ?? []) {
    const index = DIMENSIONS.indexOf(dimension);
    if (index >= 0) mask[index] = 1;
  }
  return mask;
}

/** The signed-in user. Same shape as everyone else. */
export const SELF: Person = {
  id: 'self',
  name: 'You',
  age: 28,
  email: 'you@halo.demo',
  bio: 'Coffee, films, hiking and long walks with no destination. Reading whatever is on the table. Building things in tech.',
  tags: ['coffee', 'films', 'hiking', 'reading', 'tech', 'travel'],
  area: 'Central Park area',
  bucket: 0,
  online: true,
  lastSeen: 'now',
};

export const SELF_VECTOR = buildVector(SELF.bio, SELF.tags);

export type Wink = {
  personId: string;
  kind: 'sent-wink' | 'winked-back' | 'wants-chat';
  at: string;
  unread: boolean;
};

export const WINKS: Wink[] = [
  { personId: 'emma', kind: 'sent-wink', at: '2m ago', unread: true },
  { personId: 'david', kind: 'wants-chat', at: '8m ago', unread: true },
  { personId: 'luisa', kind: 'winked-back', at: '14m ago', unread: true },
  { personId: 'alex', kind: 'sent-wink', at: 'Yesterday', unread: false },
  { personId: 'tom', kind: 'sent-wink', at: 'Yesterday', unread: false },
  { personId: 'nataly', kind: 'wants-chat', at: '2d ago', unread: false },
];

export type Conversation = {
  personId: string;
  preview: string;
  at: string;
  unread: boolean;
};

export const CONVERSATIONS: Conversation[] = [
  { personId: 'emma', preview: 'Sent you a wink', at: '2m ago', unread: true },
  { personId: 'david', preview: 'Hey, how is it going?', at: '8m ago', unread: true },
  { personId: 'alex', preview: 'Coffee later?', at: 'Yesterday', unread: true },
  { personId: 'luisa', preview: 'Winked back', at: 'Yesterday', unread: false },
  { personId: 'tom', preview: 'Winked back', at: '2 days ago', unread: false },
  { personId: 'anna', preview: 'Sent a wink', at: '2 days ago', unread: false },
  { personId: 'michael', preview: 'Winked back', at: '5 days ago', unread: false },
];

export type Message = {
  id: string;
  from: 'me' | 'them';
  body: string;
  at: string;
};

export const THREADS: Record<string, Message[]> = {
  sophie: [
    { id: '1', from: 'them', body: 'Hey! I saw we were both near Riverside Park', at: '10:32 AM' },
    { id: '2', from: 'me', body: 'Ha, same! Do you go there often?', at: '10:33 AM' },
    { id: '3', from: 'them', body: 'Yeah, usually on weekends. It is my favorite spot to grab coffee and just read.', at: '10:35 AM' },
    { id: '4', from: 'me', body: 'Nice! Any good coffee shop recommendations around there?', at: '10:36 AM' },
    { id: '5', from: 'them', body: 'Definitely check out that little corner place, Daily Grind. Their espresso is amazing.', at: '10:37 AM' },
    { id: '6', from: 'me', body: 'I will have to check it out. I am kind of addicted to caffeine.', at: '10:40 AM' },
    { id: '7', from: 'them', body: 'Aren\'t we all? 😂 What are you usually reading?', at: '10:42 AM' },
    { id: '8', from: 'me', body: 'Mostly sci-fi lately, but I dabble in non-fiction. Just finished Dune.', at: '10:44 AM' },
    { id: '9', from: 'them', body: 'Oh I love Dune! The world building is just incredible.', at: '10:45 AM' },
    { id: '10', from: 'me', body: 'Right?! I could talk about it for hours. Have you seen the new movies?', at: '10:47 AM' },
    { id: '11', from: 'them', body: 'Yes! Actually saw part two in IMAX last week. So visually stunning.', at: '10:50 AM' },
    { id: '12', from: 'me', body: 'I am jealous, I missed the IMAX run. I had to settle for a regular screen.', at: '10:52 AM' },
    { id: '13', from: 'them', body: 'Well, next time there is a good sci-fi movie out, we should go! 🍿', at: '10:55 AM' },
    { id: '14', from: 'me', body: 'I would love that! Maybe grab a coffee from Daily Grind beforehand?', at: '10:58 AM' },
    { id: '15', from: 'them', body: 'It is a date. I will hold you to that coffee.', at: '11:00 AM' },
    { id: '16', from: 'me', body: 'Looking forward to it! Are you free this weekend?', at: '11:05 AM' },
    { id: '17', from: 'them', body: 'Actually yes! Sunday afternoon works best for me.', at: '11:10 AM' },
    { id: '18', from: 'me', body: 'Perfect. Let\'s say 2 PM at Daily Grind?', at: '11:15 AM' },
    { id: '19', from: 'them', body: 'Sounds like a plan. See you then! 😊', at: '11:20 AM' },
  ],
  emma: [
    { id: '1', from: 'them', body: 'Your bio says you read whatever is on the table. Dangerous.', at: '09:14 AM' },
    { id: '2', from: 'me', body: 'It has gone badly exactly twice.', at: '09:20 AM' },
    { id: '3', from: 'them', body: 'Go on then, what were they', at: '09:21 AM' },
  ],
  david: [{ id: '1', from: 'them', body: 'Hey, how is it going?', at: '08:02 AM' }],
  alex: [{ id: '1', from: 'them', body: 'Coffee later?', at: 'Yesterday' }],
};

export const ALL_EMAILS = [...PEOPLE.map((p) => p.email), SELF.email];
