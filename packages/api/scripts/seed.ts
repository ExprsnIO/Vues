/**
 * Database seed script - Creates sample timeline feeds with 200 videos
 * from various news and social media sources
 */

import postgres from 'postgres';
import { nanoid } from 'nanoid';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://exprsn:exprsn_dev@localhost:5432/exprsn';
const sql = postgres(DATABASE_URL);

// Sample users representing various content creators and news sources
const sampleUsers = [
  // News Organizations
  { handle: 'bbcnews.exprsn.io', displayName: 'BBC News', avatar: 'https://picsum.photos/seed/bbc/200', bio: 'Breaking news, analysis, and features from around the world.', verified: true, category: 'news' },
  { handle: 'cnn.exprsn.io', displayName: 'CNN', avatar: 'https://picsum.photos/seed/cnn/200', bio: 'Go there. CNN delivers the latest breaking news and analysis.', verified: true, category: 'news' },
  { handle: 'nytimes.exprsn.io', displayName: 'The New York Times', avatar: 'https://picsum.photos/seed/nyt/200', bio: 'All the news that\'s fit to post. Video journalism from the NYT.', verified: true, category: 'news' },
  { handle: 'reuters.exprsn.io', displayName: 'Reuters', avatar: 'https://picsum.photos/seed/reuters/200', bio: 'Trusted news since 1851. Global coverage, local impact.', verified: true, category: 'news' },
  { handle: 'aljazeera.exprsn.io', displayName: 'Al Jazeera', avatar: 'https://picsum.photos/seed/alj/200', bio: 'Live news, video on demand, and in-depth coverage.', verified: true, category: 'news' },
  { handle: 'guardian.exprsn.io', displayName: 'The Guardian', avatar: 'https://picsum.photos/seed/guardian/200', bio: 'Independent journalism since 1821.', verified: true, category: 'news' },
  { handle: 'washpost.exprsn.io', displayName: 'Washington Post', avatar: 'https://picsum.photos/seed/wapo/200', bio: 'Democracy Dies in Darkness. Award-winning video journalism.', verified: true, category: 'news' },
  { handle: 'apnews.exprsn.io', displayName: 'Associated Press', avatar: 'https://picsum.photos/seed/ap/200', bio: 'The definitive source for independent journalism.', verified: true, category: 'news' },

  // Tech & Science
  { handle: 'techcrunch.exprsn.io', displayName: 'TechCrunch', avatar: 'https://picsum.photos/seed/tc/200', bio: 'Startup and technology news, funding reports, and product launches.', verified: true, category: 'tech' },
  { handle: 'theverge.exprsn.io', displayName: 'The Verge', avatar: 'https://picsum.photos/seed/verge/200', bio: 'Tech news and reviews for the modern age.', verified: true, category: 'tech' },
  { handle: 'wired.exprsn.io', displayName: 'WIRED', avatar: 'https://picsum.photos/seed/wired/200', bio: 'Ideas change everything. Exploring the future of business, culture, science.', verified: true, category: 'tech' },
  { handle: 'nasa.exprsn.io', displayName: 'NASA', avatar: 'https://picsum.photos/seed/nasa/200', bio: 'Explore the universe and discover our home planet.', verified: true, category: 'science' },
  { handle: 'natgeo.exprsn.io', displayName: 'National Geographic', avatar: 'https://picsum.photos/seed/natgeo/200', bio: 'Taking you further. Science, exploration, adventure.', verified: true, category: 'science' },
  { handle: 'spacex.exprsn.io', displayName: 'SpaceX', avatar: 'https://picsum.photos/seed/spacex/200', bio: 'Making humanity multiplanetary.', verified: true, category: 'tech' },

  // Entertainment
  { handle: 'netflix.exprsn.io', displayName: 'Netflix', avatar: 'https://picsum.photos/seed/netflix/200', bio: 'See what\'s next. Behind the scenes and exclusive clips.', verified: true, category: 'entertainment' },
  { handle: 'hbo.exprsn.io', displayName: 'HBO', avatar: 'https://picsum.photos/seed/hbo/200', bio: 'It\'s not TV. It\'s HBO.', verified: true, category: 'entertainment' },
  { handle: 'disney.exprsn.io', displayName: 'Disney', avatar: 'https://picsum.photos/seed/disney/200', bio: 'The official page for Disney magic.', verified: true, category: 'entertainment' },
  { handle: 'marvel.exprsn.io', displayName: 'Marvel Entertainment', avatar: 'https://picsum.photos/seed/marvel/200', bio: 'The official home of your favorite heroes.', verified: true, category: 'entertainment' },

  // Sports
  { handle: 'espn.exprsn.io', displayName: 'ESPN', avatar: 'https://picsum.photos/seed/espn/200', bio: 'The Worldwide Leader in Sports.', verified: true, category: 'sports' },
  { handle: 'nba.exprsn.io', displayName: 'NBA', avatar: 'https://picsum.photos/seed/nba/200', bio: 'The official page of the NBA.', verified: true, category: 'sports' },
  { handle: 'nfl.exprsn.io', displayName: 'NFL', avatar: 'https://picsum.photos/seed/nfl/200', bio: 'The official page of the National Football League.', verified: true, category: 'sports' },
  { handle: 'fifa.exprsn.io', displayName: 'FIFA', avatar: 'https://picsum.photos/seed/fifa/200', bio: 'For the Game. For the World.', verified: true, category: 'sports' },

  // Creators & Influencers
  { handle: 'mkbhd.exprsn.io', displayName: 'MKBHD', avatar: 'https://picsum.photos/seed/mkbhd/200', bio: 'Quality tech videos. Marques Brownlee.', verified: true, category: 'creator' },
  { handle: 'pewdiepie.exprsn.io', displayName: 'PewDiePie', avatar: 'https://picsum.photos/seed/pewds/200', bio: 'Just a Swedish guy on the internet.', verified: true, category: 'creator' },
  { handle: 'mrbeast.exprsn.io', displayName: 'MrBeast', avatar: 'https://picsum.photos/seed/mrbeast/200', bio: 'I want to make the world a better place before I die.', verified: true, category: 'creator' },
  { handle: 'casey.exprsn.io', displayName: 'Casey Neistat', avatar: 'https://picsum.photos/seed/casey/200', bio: 'Filmmaker, storyteller, adventurer.', verified: true, category: 'creator' },
  { handle: 'linustechtips.exprsn.io', displayName: 'Linus Tech Tips', avatar: 'https://picsum.photos/seed/ltt/200', bio: 'Tech tips, PC builds, and honest reviews.', verified: true, category: 'creator' },

  // Food & Lifestyle
  { handle: 'gordonramsay.exprsn.io', displayName: 'Gordon Ramsay', avatar: 'https://picsum.photos/seed/gordon/200', bio: 'Multi-Michelin starred chef. It\'s RAW!', verified: true, category: 'food' },
  { handle: 'bingingwithbabish.exprsn.io', displayName: 'Babish Culinary Universe', avatar: 'https://picsum.photos/seed/babish/200', bio: 'Recreating foods from fiction and teaching techniques.', verified: true, category: 'food' },
  { handle: 'tasty.exprsn.io', displayName: 'Tasty', avatar: 'https://picsum.photos/seed/tasty/200', bio: 'Recipes that\'ll make you say MMM.', verified: true, category: 'food' },

  // Music
  { handle: 'spotify.exprsn.io', displayName: 'Spotify', avatar: 'https://picsum.photos/seed/spotify/200', bio: 'Music for everyone.', verified: true, category: 'music' },
  { handle: 'billboard.exprsn.io', displayName: 'Billboard', avatar: 'https://picsum.photos/seed/billboard/200', bio: 'The authority in music news and charts.', verified: true, category: 'music' },

  // Gaming
  { handle: 'playstation.exprsn.io', displayName: 'PlayStation', avatar: 'https://picsum.photos/seed/ps/200', bio: 'Play Has No Limits.', verified: true, category: 'gaming' },
  { handle: 'xbox.exprsn.io', displayName: 'Xbox', avatar: 'https://picsum.photos/seed/xbox/200', bio: 'When everyone plays, we all win.', verified: true, category: 'gaming' },
  { handle: 'nintendo.exprsn.io', displayName: 'Nintendo', avatar: 'https://picsum.photos/seed/nintendo/200', bio: 'There\'s no play like it.', verified: true, category: 'gaming' },

  // Individual Users (non-verified)
  { handle: 'sarah_adventures.exprsn.io', displayName: 'Sarah Mitchell', avatar: 'https://picsum.photos/seed/sarah/200', bio: 'Travel enthusiast | Photography | NYC', verified: false, category: 'user' },
  { handle: 'alex_codes.exprsn.io', displayName: 'Alex Chen', avatar: 'https://picsum.photos/seed/alex/200', bio: 'Software engineer by day, content creator by night', verified: false, category: 'user' },
  { handle: 'emma_fitness.exprsn.io', displayName: 'Emma Johnson', avatar: 'https://picsum.photos/seed/emma/200', bio: 'Certified trainer | Healthy lifestyle | LA', verified: false, category: 'user' },
  { handle: 'james_photo.exprsn.io', displayName: 'James Wilson', avatar: 'https://picsum.photos/seed/james/200', bio: 'Landscape & Wildlife photographer', verified: false, category: 'user' },
  { handle: 'maya_art.exprsn.io', displayName: 'Maya Rodriguez', avatar: 'https://picsum.photos/seed/maya/200', bio: 'Digital artist | Illustrator | Dreamer', verified: false, category: 'user' },
];

// Video templates by category
const videoTemplates: Record<string, Array<{ caption: string; tags: string[] }>> = {
  news: [
    { caption: 'BREAKING: Major development in global climate talks as nations agree on new targets', tags: ['news', 'climate', 'politics', 'breaking'] },
    { caption: 'Live from the scene: Thousands gather for historic peace rally', tags: ['news', 'live', 'peace', 'rally'] },
    { caption: 'Exclusive interview with world leaders on economic recovery', tags: ['news', 'economy', 'exclusive', 'interview'] },
    { caption: 'Hurricane approaching coast - latest updates and evacuation orders', tags: ['news', 'weather', 'hurricane', 'emergency'] },
    { caption: 'Election results: Here\'s what you need to know', tags: ['news', 'election', 'politics', 'breaking'] },
    { caption: 'Market update: Tech stocks surge amid positive earnings reports', tags: ['news', 'finance', 'stocks', 'tech'] },
    { caption: 'Investigation reveals new findings in ongoing case', tags: ['news', 'investigation', 'exclusive', 'report'] },
    { caption: 'International summit concludes with historic agreement', tags: ['news', 'diplomacy', 'world', 'summit'] },
  ],
  tech: [
    { caption: 'First look at the revolutionary new smartphone that\'s changing everything', tags: ['tech', 'smartphone', 'review', 'innovation'] },
    { caption: 'AI breakthrough: This changes how we think about machine learning', tags: ['tech', 'ai', 'machinelearning', 'future'] },
    { caption: 'Inside the factory where the future is being built', tags: ['tech', 'factory', 'behindthescenes', 'innovation'] },
    { caption: 'This gadget will blow your mind - full review', tags: ['tech', 'gadget', 'review', 'unboxing'] },
    { caption: 'The truth about electric vehicles that no one talks about', tags: ['tech', 'ev', 'cars', 'truth'] },
    { caption: 'Hands-on with the latest gaming hardware', tags: ['tech', 'gaming', 'hardware', 'review'] },
    { caption: '5 apps that will change your productivity forever', tags: ['tech', 'apps', 'productivity', 'tips'] },
    { caption: 'Why this startup is valued at $10 billion', tags: ['tech', 'startup', 'business', 'valuation'] },
  ],
  science: [
    { caption: 'New discovery on Mars could change everything we know about life', tags: ['science', 'mars', 'space', 'discovery'] },
    { caption: 'Watch: Rocket launch captured in stunning 4K', tags: ['science', 'space', 'rocket', 'launch'] },
    { caption: 'Scientists discover New species in the deep ocean', tags: ['science', 'ocean', 'discovery', 'nature'] },
    { caption: 'The James Webb telescope reveals universe secrets', tags: ['science', 'telescope', 'space', 'astronomy'] },
    { caption: 'Breakthrough in renewable energy storage', tags: ['science', 'energy', 'renewable', 'breakthrough'] },
    { caption: 'Expedition to the world\'s most remote location', tags: ['science', 'expedition', 'exploration', 'nature'] },
  ],
  entertainment: [
    { caption: 'EXCLUSIVE: First trailer for the most anticipated movie of the year', tags: ['entertainment', 'movie', 'trailer', 'exclusive'] },
    { caption: 'Behind the scenes of your favorite show - you won\'t believe this', tags: ['entertainment', 'bts', 'tv', 'exclusive'] },
    { caption: 'Red carpet highlights from last night\'s premiere', tags: ['entertainment', 'redcarpet', 'premiere', 'celebrity'] },
    { caption: 'Cast interview: The secrets behind the magic', tags: ['entertainment', 'interview', 'cast', 'secrets'] },
    { caption: 'This scene took 3 months to film - here\'s why', tags: ['entertainment', 'bts', 'filming', 'movie'] },
    { caption: 'Surprise cameo in new episode has fans going wild', tags: ['entertainment', 'tv', 'surprise', 'fans'] },
  ],
  sports: [
    { caption: 'INCREDIBLE finish! Watch the last 30 seconds that decided the championship', tags: ['sports', 'championship', 'clutch', 'highlights'] },
    { caption: 'Best plays of the week - #5 will leave you speechless', tags: ['sports', 'highlights', 'topplays', 'week'] },
    { caption: 'Exclusive interview with the MVP after historic performance', tags: ['sports', 'interview', 'mvp', 'exclusive'] },
    { caption: 'Training day: Inside the routine of a pro athlete', tags: ['sports', 'training', 'athlete', 'routine'] },
    { caption: 'Rivalry game delivers everything we hoped for', tags: ['sports', 'rivalry', 'game', 'highlights'] },
    { caption: 'Record-breaking performance stuns the world', tags: ['sports', 'record', 'performance', 'history'] },
  ],
  creator: [
    { caption: 'I tried this for 30 days - here\'s what happened', tags: ['creator', 'challenge', '30days', 'experiment'] },
    { caption: 'Why I\'m leaving... (not clickbait)', tags: ['creator', 'storytime', 'announcement', 'personal'] },
    { caption: 'Reacting to my oldest videos - this is embarrassing', tags: ['creator', 'reaction', 'throwback', 'funny'] },
    { caption: 'Day in my life: You won\'t believe what happened', tags: ['creator', 'dayinmylife', 'vlog', 'lifestyle'] },
    { caption: 'I spent $10,000 on this... worth it?', tags: ['creator', 'spending', 'worth', 'review'] },
    { caption: 'Answering your questions - Q&A time!', tags: ['creator', 'qanda', 'questions', 'fans'] },
    { caption: 'Behind the scenes of how I make my videos', tags: ['creator', 'bts', 'process', 'tutorial'] },
    { caption: 'Collab with my favorite creator!', tags: ['creator', 'collab', 'surprise', 'fun'] },
  ],
  food: [
    { caption: 'The perfect steak - here\'s how to make it every time', tags: ['food', 'steak', 'cooking', 'tutorial'] },
    { caption: 'This 5-ingredient recipe will change your life', tags: ['food', 'recipe', 'easy', 'quick'] },
    { caption: 'Rating every fast food burger - honest review', tags: ['food', 'fastfood', 'review', 'burger'] },
    { caption: 'Secret restaurant technique finally revealed', tags: ['food', 'restaurant', 'secret', 'technique'] },
    { caption: 'I made a 7-course meal in 1 hour - here\'s how', tags: ['food', 'challenge', 'cooking', 'timelapse'] },
    { caption: 'Street food tour - the best city for foodies', tags: ['food', 'streetfood', 'travel', 'tour'] },
  ],
  music: [
    { caption: 'This song is breaking every streaming record', tags: ['music', 'streaming', 'record', 'viral'] },
    { caption: 'Live performance that gave everyone chills', tags: ['music', 'live', 'performance', 'concert'] },
    { caption: 'The making of the #1 hit - exclusive studio footage', tags: ['music', 'bts', 'studio', 'exclusive'] },
    { caption: 'Unreleased track preview - what do you think?', tags: ['music', 'preview', 'unreleased', 'new'] },
  ],
  gaming: [
    { caption: 'First gameplay of the most anticipated game of the year', tags: ['gaming', 'gameplay', 'firstlook', 'new'] },
    { caption: 'Speedrun world record - watch how it\'s done', tags: ['gaming', 'speedrun', 'worldrecord', 'impressive'] },
    { caption: 'Easter eggs you definitely missed in this game', tags: ['gaming', 'eastereggs', 'secrets', 'hidden'] },
    { caption: 'Rage quit compilation - I can\'t with this game', tags: ['gaming', 'ragequit', 'funny', 'compilation'] },
    { caption: 'New update changes everything - full breakdown', tags: ['gaming', 'update', 'patch', 'breakdown'] },
  ],
  user: [
    { caption: 'Just another day in paradise', tags: ['lifestyle', 'travel', 'vibes', 'mood'] },
    { caption: 'POV: You found the perfect sunset spot', tags: ['pov', 'sunset', 'nature', 'aesthetic'] },
    { caption: 'My morning routine that changed my life', tags: ['routine', 'morning', 'lifestyle', 'tips'] },
    { caption: 'When the lighting hits just right', tags: ['photography', 'lighting', 'aesthetic', 'mood'] },
    { caption: 'This view was worth the hike', tags: ['hiking', 'nature', 'adventure', 'travel'] },
    { caption: 'Trying this viral trend - did it work?', tags: ['viral', 'trend', 'trying', 'experiment'] },
    { caption: 'Home workout that actually works', tags: ['fitness', 'workout', 'home', 'health'] },
    { caption: 'What I eat in a day - honest edition', tags: ['food', 'whatieatinaday', 'healthy', 'lifestyle'] },
  ],
};

// Sample HLS playlist URLs (using picsum for thumbnails, fake HLS for demo)
const sampleHlsBase = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const sampleCdnBase = 'https://stream.mux.com';

function generateTid(): string {
  const timestamp = Date.now();
  const clockId = Math.floor(Math.random() * 1024);
  const combined = BigInt(timestamp) * 1024n + BigInt(clockId);
  const chars = '234567abcdefghijklmnopqrstuvwxyz';
  let result = '';
  let value = combined;
  for (let i = 0; i < 13; i++) {
    result = chars[Number(value % 32n)] + result;
    value = value / 32n;
  }
  return result;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBack: number): Date {
  const now = new Date();
  const past = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return new Date(past.getTime() + Math.random() * (now.getTime() - past.getTime()));
}

async function seed() {
  console.log('Starting database seed...\n');

  // Clear existing data
  console.log('Clearing existing data...');
  await sql`TRUNCATE TABLE trending_videos, user_interactions, video_embeddings, comments, likes, follows, videos, sounds, user_settings, sessions, repo_records, repo_commits, repo_blocks, blobs, actor_repos, upload_jobs, users CASCADE`;

  // Insert users
  console.log(`Inserting ${sampleUsers.length} users...`);
  const insertedUsers: Array<{ did: string; handle: string; category: string }> = [];

  for (const user of sampleUsers) {
    const did = `did:web:${user.handle}`;
    await sql`
      INSERT INTO users (did, handle, display_name, avatar, bio, follower_count, following_count, video_count, verified, created_at, updated_at, indexed_at)
      VALUES (
        ${did},
        ${user.handle},
        ${user.displayName},
        ${user.avatar},
        ${user.bio},
        ${randomInt(1000, 10000000)},
        ${randomInt(10, 1000)},
        ${randomInt(10, 500)},
        ${user.verified},
        ${randomDate(365).toISOString()},
        ${new Date().toISOString()},
        ${new Date().toISOString()}
      )
    `;
    insertedUsers.push({ did, handle: user.handle, category: user.category });
  }

  // Insert sounds (for video associations)
  console.log('Inserting sample sounds...');
  const sounds = [
    { id: 'sound-trending-1', title: 'Viral Dance Beat', artist: 'DJ Producer', duration: 30 },
    { id: 'sound-trending-2', title: 'Epic Cinematic', artist: 'Film Composer', duration: 45 },
    { id: 'sound-trending-3', title: 'Lo-Fi Chill', artist: 'ChillBeats', duration: 60 },
    { id: 'sound-trending-4', title: 'News Theme', artist: 'NewsMusic', duration: 15 },
    { id: 'sound-trending-5', title: 'Sports Hype', artist: 'HypeProducer', duration: 20 },
    { id: 'sound-original', title: 'Original Audio', artist: 'Various', duration: 60 },
  ];

  for (const sound of sounds) {
    await sql`
      INSERT INTO sounds (id, title, artist, duration, use_count, created_at)
      VALUES (${sound.id}, ${sound.title}, ${sound.artist}, ${sound.duration}, ${randomInt(100, 100000)}, ${randomDate(90).toISOString()})
    `;
  }

  // Insert 200 videos
  console.log('Inserting 200 videos...');
  const videos: Array<{ uri: string; authorDid: string; createdAt: Date }> = [];

  for (let i = 0; i < 200; i++) {
    // Pick a random user
    const user = insertedUsers[randomInt(0, insertedUsers.length - 1)];
    const templates = videoTemplates[user.category] || videoTemplates.user;
    const template = templates[randomInt(0, templates.length - 1)];

    const tid = generateTid();
    const uri = `at://${user.did}/io.exprsn.video.post/${tid}`;
    const cid = `bafyrei${nanoid(52).toLowerCase()}`;
    const createdAt = randomDate(30);

    const duration = randomInt(15, 180);
    const viewCount = randomInt(100, 5000000);
    const likeCount = Math.floor(viewCount * (randomInt(1, 15) / 100));
    const commentCount = Math.floor(likeCount * (randomInt(5, 30) / 100));
    const shareCount = Math.floor(likeCount * (randomInt(1, 10) / 100));

    const soundId = sounds[randomInt(0, sounds.length - 1)].id;

    await sql`
      INSERT INTO videos (
        uri, cid, author_did, caption, tags, sound_uri, cdn_url, hls_playlist,
        thumbnail_url, duration, aspect_ratio, visibility, allow_duet, allow_stitch,
        allow_comments, view_count, like_count, comment_count, share_count, indexed_at, created_at
      ) VALUES (
        ${uri},
        ${cid},
        ${user.did},
        ${template.caption + ` #${i + 1}`},
        ${JSON.stringify(template.tags)},
        ${soundId},
        ${`${sampleCdnBase}/${nanoid(10)}.mp4`},
        ${sampleHlsBase},
        ${`https://picsum.photos/seed/${nanoid(8)}/720/1280`},
        ${duration},
        ${JSON.stringify({ width: 9, height: 16 })},
        'public',
        ${Math.random() > 0.2},
        ${Math.random() > 0.3},
        ${Math.random() > 0.1},
        ${viewCount},
        ${likeCount},
        ${commentCount},
        ${shareCount},
        ${new Date().toISOString()},
        ${createdAt.toISOString()}
      )
    `;

    videos.push({ uri, authorDid: user.did, createdAt });

    if ((i + 1) % 50 === 0) {
      console.log(`  Inserted ${i + 1}/200 videos...`);
    }
  }

  // Insert follows (create social graph)
  console.log('Creating social graph with follows...');
  let followCount = 0;
  for (const user of insertedUsers) {
    // Each user follows 5-15 other users
    const numFollows = randomInt(5, 15);
    const shuffled = [...insertedUsers].filter(u => u.did !== user.did).sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(numFollows, shuffled.length); i++) {
      const followee = shuffled[i];
      const tid = generateTid();
      const uri = `at://${user.did}/app.bsky.graph.follow/${tid}`;
      const cid = `bafyrei${nanoid(52).toLowerCase()}`;

      await sql`
        INSERT INTO follows (uri, cid, follower_did, followee_did, created_at, indexed_at)
        VALUES (${uri}, ${cid}, ${user.did}, ${followee.did}, ${randomDate(60).toISOString()}, ${new Date().toISOString()})
        ON CONFLICT DO NOTHING
      `;
      followCount++;
    }
  }
  console.log(`  Created ${followCount} follow relationships`);

  // Insert likes
  console.log('Adding likes to videos...');
  let likeCount = 0;
  for (const video of videos.slice(0, 100)) {
    // Add 3-10 likes per video from random users
    const numLikes = randomInt(3, 10);
    const shuffled = [...insertedUsers].sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(numLikes, shuffled.length); i++) {
      const user = shuffled[i];
      const tid = generateTid();
      const uri = `at://${user.did}/app.bsky.feed.like/${tid}`;
      const cid = `bafyrei${nanoid(52).toLowerCase()}`;

      await sql`
        INSERT INTO likes (uri, cid, video_uri, author_did, created_at, indexed_at)
        VALUES (${uri}, ${cid}, ${video.uri}, ${user.did}, ${randomDate(14).toISOString()}, ${new Date().toISOString()})
        ON CONFLICT DO NOTHING
      `;
      likeCount++;
    }
  }
  console.log(`  Created ${likeCount} likes`);

  // Insert comments
  console.log('Adding comments to videos...');
  const commentTemplates = [
    'This is amazing!', 'So good!', 'Love this content', 'More please!',
    'Incredible work', 'Mind blown', 'This is exactly what I needed',
    'Best thing I\'ve seen today', 'Subscribed!', 'How do you do this?',
    'Wow just wow', 'This deserves more views', 'Legend', 'Fire content',
    'Keep it up!', 'Quality content right here', 'I learned so much',
    'This changed my perspective', 'Sharing with everyone', 'Brilliant!',
  ];

  let commentCount = 0;
  for (const video of videos.slice(0, 80)) {
    const numComments = randomInt(2, 8);
    const shuffled = [...insertedUsers].sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(numComments, shuffled.length); i++) {
      const user = shuffled[i];
      const tid = generateTid();
      const uri = `at://${user.did}/io.exprsn.video.comment/${tid}`;
      const cid = `bafyrei${nanoid(52).toLowerCase()}`;
      const text = commentTemplates[randomInt(0, commentTemplates.length - 1)];

      await sql`
        INSERT INTO comments (uri, cid, video_uri, author_did, text, like_count, reply_count, created_at, indexed_at)
        VALUES (${uri}, ${cid}, ${video.uri}, ${user.did}, ${text}, ${randomInt(0, 50)}, ${randomInt(0, 5)}, ${randomDate(14).toISOString()}, ${new Date().toISOString()})
      `;
      commentCount++;
    }
  }
  console.log(`  Created ${commentCount} comments`);

  // Insert trending videos
  console.log('Setting up trending videos...');
  const sortedByViews = [...videos].sort((a, b) => Math.random() - 0.5).slice(0, 50);
  for (let i = 0; i < sortedByViews.length; i++) {
    const video = sortedByViews[i];
    await sql`
      INSERT INTO trending_videos (video_uri, score, velocity, rank, updated_at)
      VALUES (${video.uri}, ${1000 - i * 15 + randomInt(-10, 10)}, ${randomInt(1, 100) / 10}, ${i + 1}, ${new Date().toISOString()})
    `;
  }
  console.log(`  Set ${sortedByViews.length} trending videos`);

  // Insert user interactions
  console.log('Recording user interactions...');
  let interactionCount = 0;
  for (const video of videos.slice(0, 100)) {
    const numInteractions = randomInt(5, 20);
    const shuffled = [...insertedUsers].sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(numInteractions, shuffled.length); i++) {
      const user = shuffled[i];
      const interactionTypes = ['view', 'like', 'watch_complete', 'share'];
      const type = interactionTypes[randomInt(0, interactionTypes.length - 1)];

      await sql`
        INSERT INTO user_interactions (id, user_did, video_uri, interaction_type, watch_duration, completion_rate, created_at)
        VALUES (${nanoid()}, ${user.did}, ${video.uri}, ${type}, ${randomInt(5, 120)}, ${randomInt(10, 100) / 100}, ${randomDate(7).toISOString()})
      `;
      interactionCount++;
    }
  }
  console.log(`  Created ${interactionCount} user interactions`);

  console.log('\n--- Seed Summary ---');
  console.log(`Users: ${insertedUsers.length}`);
  console.log(`Videos: ${videos.length}`);
  console.log(`Sounds: ${sounds.length}`);
  console.log(`Follows: ${followCount}`);
  console.log(`Likes: ${likeCount}`);
  console.log(`Comments: ${commentCount}`);
  console.log(`Trending: ${sortedByViews.length}`);
  console.log(`Interactions: ${interactionCount}`);
  console.log('\nSeed completed successfully!');

  await sql.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
