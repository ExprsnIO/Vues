/**
 * Seed script for community data
 * Creates: 50 users, 50 videos, 200 comments, 500 reactions, follows, and view counts
 */

import { db, users, videos, comments, commentReactions, follows, trendingVideos } from '../src/db/index.js';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';

// Sample data for generation
const ADJECTIVES = [
  'happy', 'creative', 'bold', 'swift', 'bright', 'cosmic', 'digital', 'epic',
  'fierce', 'golden', 'hidden', 'iconic', 'jolly', 'keen', 'lunar', 'mystic',
  'noble', 'ocean', 'prime', 'quantum', 'radiant', 'stellar', 'turbo', 'ultra',
  'vibrant', 'wild', 'zen', 'atomic', 'blazing', 'cyber'
];

const NOUNS = [
  'fox', 'wolf', 'eagle', 'tiger', 'dragon', 'phoenix', 'panther', 'falcon',
  'lion', 'hawk', 'bear', 'raven', 'shark', 'cobra', 'viper', 'storm',
  'thunder', 'blaze', 'frost', 'shadow', 'spark', 'wave', 'flame', 'star',
  'moon', 'sun', 'sky', 'cloud', 'river', 'mountain'
];

const FIRST_NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Quinn', 'Avery',
  'Skyler', 'Dakota', 'Hayden', 'Jamie', 'Kendall', 'Peyton', 'Reese', 'Sage',
  'Cameron', 'Drew', 'Emery', 'Finley', 'Harper', 'Lennon', 'Marley', 'Parker',
  'River', 'Rowan', 'Spencer', 'Sydney', 'Tatum', 'Blake'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Lewis', 'Robinson', 'Walker'
];

const COMMENT_TEMPLATES = [
  'This is amazing! 🔥',
  'Love this content!',
  'Great video, keep it up!',
  'This made my day 😊',
  'Incredible work!',
  'Can\'t stop watching this',
  'Pure gold! 💯',
  'This deserves more views',
  'Absolutely brilliant',
  'Best thing I\'ve seen today',
  'How is this so good?!',
  'Wow, just wow',
  'I need more of this',
  'Sharing this with everyone',
  'This is exactly what I needed',
  'Underrated content right here',
  'You\'re so talented!',
  'This hits different',
  'Legend',
  'Instant follow!',
  'The vibes are immaculate',
  'This is fire 🔥🔥🔥',
  'Obsessed with this',
  'Why is this so perfect?',
  'Crying this is too good',
  'Main character energy',
  'You ate and left no crumbs',
  'This deserves an award',
  'Living for this content',
  'Adding to my favorites'
];

const REPLY_TEMPLATES = [
  'Totally agree!',
  'Right?! So good',
  'Same here!',
  'Facts 💯',
  'This comment wins',
  'Couldn\'t have said it better',
  'You get it',
  'Exactly what I was thinking',
  'fr fr',
  'real',
  'no cap',
  'big facts',
  'this is the way',
  'I felt that',
  'periodt',
  'say it louder',
  'someone finally said it',
  'underrated comment',
  'you spilled',
  'preach'
];

const VIDEO_CAPTIONS = [
  'POV: when the beat drops 🎵',
  'Had to share this moment ✨',
  'Can you relate? 😂',
  'This took me forever to make',
  'Tag someone who needs to see this',
  'Wait for it...',
  'Surprise at the end! 😱',
  'My best work yet',
  'This is my sign to go viral',
  'Just vibing',
  'Late night thoughts 💭',
  'Finally learned this!',
  'Transformation check ✓',
  'Before vs After',
  'Day in my life',
  'Reply to @someone - here you go!',
  'Tutorial you didn\'t ask for',
  'Things that just make sense',
  'Hot take: this is underrated',
  'Storytime: you won\'t believe this',
];

const HASHTAGS = [
  'fyp', 'foryou', 'viral', 'trending', 'foryoupage', 'explore', 'comedy',
  'funny', 'dance', 'music', 'art', 'beauty', 'fashion', 'food', 'fitness',
  'travel', 'pets', 'nature', 'gaming', 'tech', 'diy', 'tutorial', 'life',
  'motivation', 'love', 'friends', 'family', 'summer', 'winter', 'weekend'
];

const VIDEO_FILES = [
  'BigBuckBunny.mp4', 'MuxSample.mp4', 'NatureVideo1.mp4', 'NatureVideo2.mp4',
  'NatureVideo3.mp4', 'SampleVideo1.mp4', 'SampleVideo2.mp4', 'SampleVideo3.mp4',
  'SampleVideo4.mp4', 'SampleVideo5.mp4', 'Sintel.mp4', 'TestVideo1.mp4', 'TestVideo2.mp4'
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateHandle(): string {
  const patterns = [
    () => `${randomElement(ADJECTIVES)}_${randomElement(NOUNS)}_${randomInt(1, 999)}`,
    () => `${randomElement(ADJECTIVES)}${randomElement(NOUNS)}${randomInt(10, 99)}`,
    () => `${randomElement(FIRST_NAMES).toLowerCase()}_official`,
    () => `the_real_${randomElement(FIRST_NAMES).toLowerCase()}`,
    () => `${randomElement(FIRST_NAMES).toLowerCase()}${randomElement(LAST_NAMES).toLowerCase()}`,
    () => `x${randomElement(ADJECTIVES)}${randomElement(NOUNS)}x`,
  ];
  return randomElement(patterns)();
}

function generateDisplayName(): string {
  const firstName = randomElement(FIRST_NAMES);
  const lastName = randomElement(LAST_NAMES);
  const patterns = [
    () => `${firstName} ${lastName}`,
    () => firstName,
    () => `${firstName} ${lastName.charAt(0)}.`,
    () => `${firstName} 🌟`,
    () => `${firstName} ✨`,
  ];
  return randomElement(patterns)();
}

function generateTags(): string[] {
  const numTags = randomInt(2, 5);
  const tags: string[] = [];
  while (tags.length < numTags) {
    const tag = randomElement(HASHTAGS);
    if (!tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return tags;
}

function generateCaption(): string {
  const caption = randomElement(VIDEO_CAPTIONS);
  const tags = generateTags().map(t => `#${t}`).join(' ');
  return `${caption} ${tags}`;
}

async function clearExistingData() {
  console.log('Clearing existing data...');
  await db.delete(commentReactions);
  await db.delete(comments);
  await db.delete(trendingVideos);
  await db.delete(follows);
  await db.delete(videos);
  await db.delete(users);
  console.log('Existing data cleared.');
}

async function seedUsers(): Promise<string[]> {
  console.log('Creating 50 users...');
  const userDids: string[] = [];
  const usedHandles = new Set<string>();

  for (let i = 0; i < 50; i++) {
    let handle = generateHandle();
    while (usedHandles.has(handle)) {
      handle = generateHandle();
    }
    usedHandles.add(handle);

    const did = `did:plc:${nanoid(24)}`;
    userDids.push(did);

    const displayName = generateDisplayName();
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=random&size=200`;

    await db.insert(users).values({
      did,
      handle,
      displayName,
      avatar,
      bio: Math.random() > 0.5 ? `Just vibing ✨ | ${randomElement(HASHTAGS)} enthusiast` : null,
      followerCount: randomInt(100, 500000),
      followingCount: randomInt(50, 2000),
      videoCount: randomInt(1, 50),
      verified: Math.random() > 0.9,
      createdAt: new Date(Date.now() - randomInt(1, 365) * 24 * 60 * 60 * 1000),
      updatedAt: new Date(),
      indexedAt: new Date(),
    });
  }

  console.log(`Created ${userDids.length} users.`);
  return userDids;
}

async function seedFollows(userDids: string[]): Promise<void> {
  console.log('Creating follows...');
  let followCount = 0;

  for (const followerDid of userDids) {
    const numFollows = randomInt(5, 20);
    const followeeDids = userDids
      .filter(d => d !== followerDid)
      .sort(() => Math.random() - 0.5)
      .slice(0, numFollows);

    for (const followeeDid of followeeDids) {
      await db.insert(follows).values({
        uri: `at://${followerDid}/app.bsky.graph.follow/${nanoid()}`,
        cid: nanoid(),
        followerDid,
        followeeDid,
        createdAt: new Date(Date.now() - randomInt(1, 180) * 24 * 60 * 60 * 1000),
        indexedAt: new Date(),
      }).onConflictDoNothing();
      followCount++;
    }
  }

  console.log(`Created ${followCount} follows.`);
}

async function seedVideos(userDids: string[]): Promise<string[]> {
  console.log('Creating 50 videos...');
  const videoUris: string[] = [];

  for (let i = 0; i < 50; i++) {
    const authorDid = randomElement(userDids);
    const videoFile = VIDEO_FILES[i % VIDEO_FILES.length]!;
    const uri = `at://${authorDid}/io.exprsn.video.post/${nanoid()}`;
    videoUris.push(uri);

    const viewCount = randomInt(1000, 500000);
    const likeCount = Math.floor(viewCount * (Math.random() * 0.1 + 0.02)); // 2-12% like rate
    const commentCount = Math.floor(likeCount * (Math.random() * 0.15 + 0.05)); // 5-20% comment rate
    const shareCount = Math.floor(likeCount * (Math.random() * 0.05 + 0.01)); // 1-6% share rate

    await db.insert(videos).values({
      uri,
      cid: nanoid(),
      authorDid,
      caption: generateCaption(),
      tags: generateTags(),
      cdnUrl: `/videos/${videoFile}`,
      thumbnailUrl: null,
      duration: randomInt(15, 180),
      aspectRatio: Math.random() > 0.3 ? { width: 9, height: 16 } : { width: 16, height: 9 },
      visibility: 'public',
      viewCount,
      likeCount,
      commentCount,
      shareCount,
      createdAt: new Date(Date.now() - randomInt(1, 30) * 24 * 60 * 60 * 1000),
      indexedAt: new Date(),
    });

    // Add to trending
    const score = (viewCount * 0.3 + likeCount * 0.5 + commentCount * 0.2) / 1000;
    await db.insert(trendingVideos).values({
      videoUri: uri,
      score,
      velocity: Math.random() * 100,
      rank: i + 1,
      updatedAt: new Date(),
    });
  }

  console.log(`Created ${videoUris.length} videos.`);
  return videoUris;
}

async function seedComments(userDids: string[], videoUris: string[]): Promise<string[]> {
  console.log('Creating 200 comments...');
  const commentUris: string[] = [];
  const topLevelComments: { uri: string; videoUri: string }[] = [];

  // Create 140 top-level comments (70%)
  for (let i = 0; i < 140; i++) {
    const authorDid = randomElement(userDids);
    const videoUri = randomElement(videoUris);
    const uri = `at://${authorDid}/io.exprsn.video.comment/${nanoid()}`;
    commentUris.push(uri);
    topLevelComments.push({ uri, videoUri });

    const createdAt = new Date(Date.now() - randomInt(1, 168) * 60 * 60 * 1000); // Last 7 days
    const likeCount = randomInt(0, 500);
    const loveCount = randomInt(0, Math.floor(likeCount * 0.2));
    const dislikeCount = randomInt(0, Math.floor(likeCount * 0.05));

    // Calculate hot score
    const positive = likeCount + loveCount * 2;
    const negative = dislikeCount;
    const total = positive + negative;
    let hotScore = 0;
    if (total > 0) {
      const z = 1.96;
      const phat = positive / total;
      const wilson =
        (phat + (z * z) / (2 * total) - z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total)) /
        (1 + (z * z) / total);
      const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      const timeDecay = Math.pow(0.5, ageHours / 24);
      hotScore = wilson * Math.log(total + 1) * timeDecay;
    }

    await db.insert(comments).values({
      uri,
      cid: nanoid(),
      videoUri,
      parentUri: null,
      authorDid,
      text: randomElement(COMMENT_TEMPLATES),
      likeCount,
      loveCount,
      dislikeCount,
      replyCount: 0,
      hotScore,
      createdAt,
      indexedAt: new Date(),
    });
  }

  // Create 60 reply comments (30%)
  for (let i = 0; i < 60; i++) {
    const authorDid = randomElement(userDids);
    const parent = randomElement(topLevelComments);
    const uri = `at://${authorDid}/io.exprsn.video.comment/${nanoid()}`;
    commentUris.push(uri);

    const createdAt = new Date(Date.now() - randomInt(1, 72) * 60 * 60 * 1000); // Last 3 days
    const likeCount = randomInt(0, 100);
    const loveCount = randomInt(0, Math.floor(likeCount * 0.15));
    const dislikeCount = randomInt(0, Math.floor(likeCount * 0.03));

    await db.insert(comments).values({
      uri,
      cid: nanoid(),
      videoUri: parent.videoUri,
      parentUri: parent.uri,
      authorDid,
      text: randomElement(REPLY_TEMPLATES),
      likeCount,
      loveCount,
      dislikeCount,
      replyCount: 0,
      hotScore: 0,
      createdAt,
      indexedAt: new Date(),
    });

    // Update parent reply count
    await db.update(comments)
      .set({ replyCount: sql`${comments.replyCount} + 1` })
      .where(sql`${comments.uri} = ${parent.uri}`);
  }

  console.log(`Created ${commentUris.length} comments.`);
  return commentUris;
}

async function seedReactions(userDids: string[], commentUris: string[]): Promise<void> {
  console.log('Creating ~500 reactions...');
  let reactionCount = 0;
  const reactionTypes: ('like' | 'love' | 'dislike')[] = ['like', 'love', 'dislike'];
  const reactionWeights = [0.7, 0.25, 0.05]; // 70% like, 25% love, 5% dislike

  for (const commentUri of commentUris) {
    const numReactions = randomInt(0, 20);
    const reactingUsers = userDids
      .sort(() => Math.random() - 0.5)
      .slice(0, numReactions);

    for (const authorDid of reactingUsers) {
      const rand = Math.random();
      let reactionType: 'like' | 'love' | 'dislike';
      if (rand < reactionWeights[0]!) {
        reactionType = 'like';
      } else if (rand < reactionWeights[0]! + reactionWeights[1]!) {
        reactionType = 'love';
      } else {
        reactionType = 'dislike';
      }

      await db.insert(commentReactions).values({
        id: nanoid(),
        commentUri,
        authorDid,
        reactionType,
        createdAt: new Date(Date.now() - randomInt(1, 168) * 60 * 60 * 1000),
      }).onConflictDoNothing();
      reactionCount++;
    }
  }

  console.log(`Created ${reactionCount} reactions.`);
}

async function main() {
  console.log('Starting community data seeding...\n');

  await clearExistingData();
  const userDids = await seedUsers();
  await seedFollows(userDids);
  const videoUris = await seedVideos(userDids);
  const commentUris = await seedComments(userDids, videoUris);
  await seedReactions(userDids, commentUris);

  console.log('\n✅ Community data seeding complete!');
  console.log('Summary:');
  console.log('  - 50 users');
  console.log('  - 50 videos');
  console.log('  - 200 comments (140 top-level, 60 replies)');
  console.log('  - ~500 comment reactions');
  console.log('  - ~500 follows');

  process.exit(0);
}

main().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
