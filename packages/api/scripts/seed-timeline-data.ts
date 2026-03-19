/**
 * Seed timeline data for testing prefetch integration
 *
 * Creates:
 * - 35 demo users (if not already present)
 * - Follow relationships (rickholland follows 25 users)
 * - 50 videos from rickholland
 * - ~150 videos from followed users (5-8 each) — THIS IS KEY for timeline
 * - Likes, comments, trending data
 * - Updates user video counts
 *
 * Run: cd packages/api && npx tsx scripts/seed-timeline-data.ts
 */

import { db } from '../src/db/index.js';
import {
  users,
  videos,
  likes,
  comments,
  follows,
  trendingVideos,
  videoViews,
} from '../src/db/schema.js';
import { nanoid } from 'nanoid';
import { eq, sql, inArray } from 'drizzle-orm';
import crypto from 'crypto';

const RICK_DID = 'did:exprsn:rickholland';
const RICK_HANDLE = 'rickholland';

const VIDEO_CAPTIONS = [
  'POV: when the beat drops', 'Had to share this', 'Can you relate?',
  'Wait for it...', 'Just vibing', 'Late night thoughts',
  'Tutorial you asked for!', 'Day in my life', 'Hot take incoming',
  'This changed everything', 'Life hack that works', 'Behind the scenes',
  'Morning routine', 'Coding tips nobody tells you', 'Workspace tour 2026',
  'React tips from the trenches', 'The secret to productivity',
  'Before vs After', 'My honest review', 'Things I wish I knew earlier',
  'Quick tip for beginners', 'Building something cool', 'My thoughts on AI',
  'Why I switched to this', 'The truth about tech', 'Follow for more',
  'Unpopular opinion', 'You NEED to try this', 'Storytime',
  'This is a game changer', 'Just dropped this', 'New project reveal',
  'How I built this', 'Design process walkthrough', 'Debugging session',
  'Deploy day vibes', 'Code review gone wrong', 'Open source contribution',
  'Side project update', 'Learning in public', 'Weekend project',
  'Stack I use in 2026', 'Performance optimization', 'Testing strategies',
  'CI/CD pipeline setup', 'Docker tips', 'Kubernetes basics',
  'GraphQL vs REST', 'TypeScript tricks', 'CSS magic',
];

const HASHTAGS = [
  'fyp', 'foryou', 'viral', 'trending', 'tech', 'coding', 'developer',
  'webdev', 'react', 'typescript', 'programming', 'productivity',
  'tutorial', 'tips', 'design', 'ui', 'ux', 'startup', 'ai', 'nextjs',
];

const COMMENT_TEXTS = [
  'This is amazing!', 'Love this content!', 'Great video!',
  'Pure gold!', 'Best thing I saw today', 'Legend!',
  'So talented!', 'Obsessed with this', 'This is fire',
  'Need more of this', 'Underrated!', 'How do you do this?',
  'Wow just wow', 'Perfection', 'Saving this for later',
  'Finally someone said it!', 'Genius!', 'Take my follow!',
  'This needs to go viral', 'Bookmarked',
];

const DEMO_USERS = [
  { handle: 'sarah_dev', name: 'Sarah Chen' },
  { handle: 'mike_designer', name: 'Mike Rivera' },
  { handle: 'alex_product', name: 'Alex Kim' },
  { handle: 'jamie_founder', name: 'Jamie Patel' },
  { handle: 'taylor_growth', name: 'Taylor Morgan' },
  { handle: 'casey_eng', name: 'Casey Brooks' },
  { handle: 'jordan_pm', name: 'Jordan Lee' },
  { handle: 'morgan_ux', name: 'Morgan Walsh' },
  { handle: 'riley_data', name: 'Riley Foster' },
  { handle: 'avery_mobile', name: 'Avery Chang' },
  { handle: 'quinn_backend', name: 'Quinn Davis' },
  { handle: 'dakota_frontend', name: 'Dakota Martinez' },
  { handle: 'reese_devops', name: 'Reese Thompson' },
  { handle: 'cameron_security', name: 'Cameron Park' },
  { handle: 'skyler_ml', name: 'Skyler Nguyen' },
  { handle: 'drew_cloud', name: 'Drew Wilson' },
  { handle: 'charlie_api', name: 'Charlie Adams' },
  { handle: 'sam_ios', name: 'Sam Garcia' },
  { handle: 'pat_android', name: 'Pat Johnson' },
  { handle: 'peyton_web', name: 'Peyton Turner' },
  { handle: 'blake_systems', name: 'Blake Anderson' },
  { handle: 'sage_network', name: 'Sage Robinson' },
  { handle: 'phoenix_db', name: 'Phoenix Cruz' },
  { handle: 'river_qa', name: 'River James' },
  { handle: 'rowan_designer', name: 'Rowan Ellis' },
  { handle: 'kai_founder', name: 'Kai Tanaka' },
  { handle: 'finley_growth', name: 'Finley Graves' },
  { handle: 'elliott_sales', name: 'Elliott Sharp' },
  { handle: 'sawyer_marketing', name: 'Sawyer Lane' },
  { handle: 'harley_support', name: 'Harley Quinn' },
  { handle: 'oakley_analytics', name: 'Oakley Stone' },
  { handle: 'emerson_ops', name: 'Emerson Blake' },
  { handle: 'lennon_hr', name: 'Lennon Wright' },
  { handle: 'dakota_legal', name: 'Dakota Reed' },
  { handle: 'remy_finance', name: 'Remy Hart' },
];

function generateDid(handle: string): string {
  const hash = crypto.createHash('sha256').update(handle + 'salt').digest();
  const base32 = 'abcdefghijklmnopqrstuvwxyz234567';
  let result = '';
  for (let i = 0; i < 24; i++) result += base32[hash[i % hash.length]! % 32];
  return `did:plc:${result}`;
}

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]!; }
function randInt(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randDate(daysBack: number): Date { return new Date(Date.now() - Math.random() * daysBack * 86400000); }
function genCid(): string { return `bafyrei${crypto.randomBytes(32).toString('base64url').slice(0, 52)}`; }
function randTags(n: number): string[] { return [...HASHTAGS].sort(() => Math.random() - 0.5).slice(0, n); }

async function main() {
  console.log('='.repeat(60));
  console.log('SEEDING TIMELINE DATA FOR PREFETCH TESTING');
  console.log('='.repeat(60));

  // ── 1. Create demo users ──
  console.log('\n1. Creating demo users...');
  const userDids: Record<string, string> = {};

  for (const u of DEMO_USERS) {
    const existing = await db.select({ did: users.did }).from(users).where(eq(users.handle, u.handle)).limit(1);
    if (existing.length > 0) {
      userDids[u.handle] = existing[0]!.did;
      continue;
    }
    const did = generateDid(u.handle);
    await db.insert(users).values({
      did,
      handle: u.handle,
      displayName: u.name,
      bio: `${u.name} on Exprsn`,
      avatar: `https://i.pravatar.cc/300?u=${u.handle}`,
      verified: Math.random() > 0.7,
      followerCount: randInt(100, 10000),
      followingCount: randInt(50, 500),
      videoCount: 0,
      createdAt: randDate(180),
      updatedAt: new Date(),
      indexedAt: new Date(),
    }).onConflictDoNothing();
    userDids[u.handle] = did;
  }
  console.log(`  Created/found ${Object.keys(userDids).length} users`);

  // ── 2. Create follows (rick follows 25 users) ──
  console.log('\n2. Creating follow relationships...');
  const followedHandles = Object.keys(userDids).sort(() => Math.random() - 0.5).slice(0, 25);
  const followedDids = followedHandles.map(h => userDids[h]!);
  let followsCreated = 0;

  for (const followeeDid of followedDids) {
    await db.insert(follows).values({
      uri: `at://${RICK_DID}/app.bsky.graph.follow/${nanoid()}`,
      cid: genCid(),
      followerDid: RICK_DID,
      followeeDid,
      createdAt: randDate(60),
      indexedAt: new Date(),
    }).onConflictDoNothing();
    followsCreated++;
  }
  // Some follow rick back
  for (const followerDid of Object.values(userDids).slice(0, 30)) {
    await db.insert(follows).values({
      uri: `at://${followerDid}/app.bsky.graph.follow/${nanoid()}`,
      cid: genCid(),
      followerDid,
      followeeDid: RICK_DID,
      createdAt: randDate(60),
      indexedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log(`  Rick follows ${followsCreated} users`);
  console.log(`  ~30 users follow Rick`);

  // ── 3. Create videos FROM rickholland (50) ──
  console.log('\n3. Creating 50 videos from rickholland...');
  const rickVideoUris: string[] = [];

  for (let i = 0; i < 50; i++) {
    const videoId = nanoid();
    const uri = `at://${RICK_DID}/io.exprsn.video/${videoId}`;
    const tags = randTags(randInt(2, 4));
    const viewCount = randInt(500, 100000);

    await db.insert(videos).values({
      uri,
      cid: genCid(),
      authorDid: RICK_DID,
      caption: `${rand(VIDEO_CAPTIONS)} #${tags.join(' #')}`,
      tags,
      cdnUrl: `https://cdn.exprsn.app/videos/${RICK_HANDLE}/${videoId}.mp4`,
      hlsPlaylist: `https://cdn.exprsn.app/videos/${RICK_HANDLE}/${videoId}/playlist.m3u8`,
      thumbnailUrl: `https://picsum.photos/seed/${videoId}/360/640`,
      duration: randInt(10, 60),
      aspectRatio: { width: 9, height: 16 },
      visibility: 'public',
      allowDuet: true,
      allowStitch: true,
      allowComments: true,
      viewCount,
      likeCount: Math.floor(viewCount * (Math.random() * 0.08 + 0.02)),
      commentCount: randInt(5, 200),
      shareCount: randInt(0, 50),
      repostCount: randInt(0, 20),
      bookmarkCount: randInt(0, 30),
      moderationStatus: 'approved',
      createdAt: randDate(30),
      indexedAt: new Date(),
    }).onConflictDoNothing();
    rickVideoUris.push(uri);
  }
  console.log(`  Created ${rickVideoUris.length} videos`);

  // ── 4. Create videos FROM FOLLOWED USERS (~150 total, 5-8 each) ──
  console.log('\n4. Creating ~150 videos from followed users (KEY for timeline)...');
  const followedVideoUris: string[] = [];
  let totalFollowedVideos = 0;

  for (const handle of followedHandles) {
    const authorDid = userDids[handle]!;
    const numVideos = randInt(5, 8);

    for (let i = 0; i < numVideos; i++) {
      const videoId = nanoid();
      const uri = `at://${authorDid}/io.exprsn.video/${videoId}`;
      const tags = randTags(randInt(2, 4));
      const viewCount = randInt(200, 50000);

      await db.insert(videos).values({
        uri,
        cid: genCid(),
        authorDid,
        caption: `${rand(VIDEO_CAPTIONS)} #${tags.join(' #')}`,
        tags,
        cdnUrl: `https://cdn.exprsn.app/videos/${handle}/${videoId}.mp4`,
        hlsPlaylist: `https://cdn.exprsn.app/videos/${handle}/${videoId}/playlist.m3u8`,
        thumbnailUrl: `https://picsum.photos/seed/${videoId}/360/640`,
        duration: randInt(10, 60),
        aspectRatio: { width: 9, height: 16 },
        visibility: 'public',
        allowDuet: true,
        allowStitch: true,
        allowComments: true,
        viewCount,
        likeCount: Math.floor(viewCount * (Math.random() * 0.06 + 0.01)),
        commentCount: randInt(2, 100),
        shareCount: randInt(0, 30),
        repostCount: randInt(0, 10),
        bookmarkCount: randInt(0, 15),
        moderationStatus: 'approved',
        createdAt: randDate(14), // Recent — within last 2 weeks
        indexedAt: new Date(),
      }).onConflictDoNothing();
      followedVideoUris.push(uri);
      totalFollowedVideos++;
    }

    // Update user's video count
    await db.update(users).set({
      videoCount: sql`${users.videoCount} + ${numVideos}`,
    }).where(eq(users.did, authorDid));
  }
  console.log(`  Created ${totalFollowedVideos} videos from ${followedHandles.length} followed users`);

  // ── 5. Create likes on rick's videos ──
  console.log('\n5. Creating likes...');
  let likesCreated = 0;
  const allVideoUris = [...rickVideoUris, ...followedVideoUris];

  for (let i = 0; i < 300; i++) {
    const videoUri = rand(allVideoUris);
    const likerDid = rand(Object.values(userDids));
    await db.insert(likes).values({
      uri: `at://${likerDid}/app.bsky.feed.like/${nanoid()}`,
      cid: genCid(),
      videoUri,
      authorDid: likerDid,
      createdAt: randDate(14),
      indexedAt: new Date(),
    }).onConflictDoNothing();
    likesCreated++;
  }
  // Rick likes some followed videos
  for (let i = 0; i < 50; i++) {
    await db.insert(likes).values({
      uri: `at://${RICK_DID}/app.bsky.feed.like/${nanoid()}`,
      cid: genCid(),
      videoUri: rand(followedVideoUris),
      authorDid: RICK_DID,
      createdAt: randDate(14),
      indexedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log(`  Created ${likesCreated + 50} likes`);

  // ── 6. Create comments ──
  console.log('\n6. Creating comments...');
  for (let i = 0; i < 150; i++) {
    const videoUri = rand(allVideoUris);
    const commenterDid = rand(Object.values(userDids));
    await db.insert(comments).values({
      uri: `at://${commenterDid}/io.exprsn.video.comment/${nanoid()}`,
      cid: genCid(),
      videoUri,
      authorDid: commenterDid,
      text: rand(COMMENT_TEXTS),
      likeCount: randInt(0, 50),
      loveCount: randInt(0, 10),
      dislikeCount: 0,
      replyCount: randInt(0, 5),
      hotScore: Math.random() * 10,
      createdAt: randDate(14),
      indexedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log('  Created 150 comments');

  // ── 7. Trending videos ──
  console.log('\n7. Creating trending entries...');
  const trendingUris = [...allVideoUris].sort(() => Math.random() - 0.5).slice(0, 20);
  for (let i = 0; i < trendingUris.length; i++) {
    await db.insert(trendingVideos).values({
      videoUri: trendingUris[i]!,
      score: (20 - i) * 100 + Math.random() * 50,
      velocity: Math.random() * 100,
      rank: i + 1,
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log(`  Added ${trendingUris.length} trending videos`);

  // ── 8. Update rick's counts ──
  console.log('\n8. Updating rickholland counts...');
  await db.update(users).set({
    videoCount: 50,
    followerCount: 30,
    followingCount: followsCreated,
  }).where(eq(users.did, RICK_DID));

  // ── Summary ──
  console.log('\n' + '='.repeat(60));
  console.log('SEEDING COMPLETE');
  console.log('='.repeat(60));
  console.log(`
  Rick's videos:        50
  Followed users:       ${followedHandles.length}
  Videos FROM followed: ${totalFollowedVideos}
  Total videos:         ${allVideoUris.length}
  Likes:                ${likesCreated + 50}
  Comments:             150
  Trending:             ${trendingUris.length}

  Timeline test:
    GET /xrpc/io.exprsn.feed.getTimeline should return ~${totalFollowedVideos} videos
    from ${followedHandles.length} followed users.
  `);

  process.exit(0);
}

main().catch(err => { console.error('Failed:', err); process.exit(1); });
