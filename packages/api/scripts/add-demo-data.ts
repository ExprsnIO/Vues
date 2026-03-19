/**
 * Add comprehensive demo data for did:exprsn:rickholland
 *
 * This script populates all major tables with realistic data for a single user.
 * Run with: cd packages/api && npx tsx scripts/add-demo-data.ts
 *
 * Database: postgresql://rickholland:exprsn2026@localhost:5432/exprsn
 */

import { db } from '../src/db/index.js';
import {
  users,
  videos,
  likes,
  comments,
  follows,
  bookmarks,
  sounds,
  userSettings,
  userPreferences,
  trendingVideos,
  videoViews,
  videoHashtags,
  trendingHashtags,
} from '../src/db/schema.js';
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

// ============================================================================
// Configuration
// ============================================================================

const RICK_DID = 'did:exprsn:rickholland';
const RICK_HANDLE = 'rickholland';

const NUM_VIDEOS = 50;
const NUM_LIKES = 200;
const NUM_COMMENTS = 100;
const NUM_FOLLOWS_FOLLOWING = 25;
const NUM_FOLLOWS_FOLLOWERS = 35;
const NUM_BOOKMARKS = 30;
const NUM_SOUNDS = 10;

// ============================================================================
// Sample Data Arrays
// ============================================================================

const VIDEO_CAPTIONS = [
  'POV: when the beat drops 🎵',
  'Had to share this moment with you all',
  'Can you relate? 😅',
  'Wait for it... 🔥',
  'Just vibing on a Tuesday',
  'Late night thoughts hit different',
  'Tutorial you guys asked for!',
  'Day in my life as a developer',
  'Hot take incoming ⚡',
  'Storytime: what happened next will shock you',
  'This changed everything for me',
  'You NEED to try this life hack',
  'Unpopular opinion but hear me out...',
  'Life hack that actually works 💡',
  'Behind the scenes of my setup',
  'Morning routine that changed my life',
  'Coding tips nobody tells you',
  'My workspace tour 2026',
  'React tips from the trenches',
  'Why I switched to this workflow',
  'The secret to productivity',
  'Before vs After 🎨',
  'My honest review of...',
  'Things I wish I knew earlier',
  'This is a game changer',
  'Quick tip for beginners',
  'The truth about...',
  'Follow for more tech content',
  'Building something cool 🚀',
  'My thoughts on AI in 2026',
];

const HASHTAGS = [
  'fyp', 'foryou', 'viral', 'trending', 'tech', 'coding', 'developer',
  'webdev', 'react', 'typescript', 'programming', 'productivity',
  'tutorial', 'tips', 'lifehack', 'design', 'ui', 'ux', 'startup',
  'entrepreneurship', 'motivation', 'learning', 'javascript', 'nextjs',
];

const COMMENT_TEXTS = [
  'This is amazing! 🔥',
  'Love this content!',
  'Great video, very helpful!',
  'Pure gold! Thanks for sharing',
  'Best thing I saw today',
  'Legend! Keep it up',
  'So talented! 🙌',
  'Obsessed with your content',
  'This is fire 🔥🔥',
  'Need more of this ASAP',
  'Underrated creator alert!',
  'Following now! Don\'t stop posting',
  'How do you do this? Tutorial please!',
  'Wow just wow 😱',
  'Perfection ✨',
  'Exactly what I needed to see',
  'Saving this for later',
  'Finally someone said it!',
  'This changed my perspective',
  'Genius! Why didn\'t I think of that',
  'Sending this to everyone',
  'Where have you been all my life?',
  'Take my follow! 👏',
  'This needs to go viral',
  'Bookmarking for future reference',
];

const SOUND_TITLES = [
  'Original Sound - Rick Holland',
  'Lo-Fi Coding Beats',
  'Epic Motivational Background',
  'Chill Vibes for Deep Work',
  'Upbeat Tech Montage',
  'Ambient Focus Music',
  'Synth Wave 2026',
  'Coffee Shop Jazz Loop',
  'Energetic Startup Anthem',
  'Minimal Piano Study Session',
];

const DEMO_USER_HANDLES = [
  'sarah_dev', 'mike_designer', 'alex_product', 'jamie_founder',
  'taylor_growth', 'casey_eng', 'jordan_pm', 'morgan_ux',
  'riley_data', 'avery_mobile', 'quinn_backend', 'dakota_frontend',
  'reese_devops', 'cameron_security', 'skyler_ml', 'drew_cloud',
  'charlie_api', 'sam_ios', 'pat_android', 'peyton_web',
  'blake_systems', 'sage_network', 'phoenix_db', 'river_qa',
  'rowan_designer', 'kai_founder', 'finley_growth', 'elliott_sales',
  'sawyer_marketing', 'harley_support', 'oakley_analytics', 'emerson_ops',
  'lennon_hr', 'dakota_legal', 'remy_finance',
];

// ============================================================================
// Helper Functions
// ============================================================================

function generateDid(handle: string): string {
  const randomBytes = crypto.randomBytes(16);
  const base32Chars = 'abcdefghijklmnopqrstuvwxyz234567';
  let result = '';
  for (let i = 0; i < 24; i++) {
    const byte = randomBytes[i % randomBytes.length];
    if (byte !== undefined) {
      result += base32Chars[byte % 32];
    }
  }
  return `did:plc:${result}`;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBack: number): Date {
  const now = Date.now();
  const randomMs = Math.random() * daysBack * 24 * 60 * 60 * 1000;
  return new Date(now - randomMs);
}

function generateCid(): string {
  const bytes = crypto.randomBytes(32);
  return `bafyrei${bytes.toString('base64url').slice(0, 52)}`;
}

function selectRandomTags(count: number): string[] {
  const shuffled = [...HASHTAGS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ============================================================================
// Data Creation Functions
// ============================================================================

async function ensureDemoUsers(): Promise<string[]> {
  console.log('Ensuring demo users exist...');
  const dids: string[] = [];
  const now = new Date();

  for (const handle of DEMO_USER_HANDLES) {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.handle, handle))
      .limit(1);

    if (existing.length > 0) {
      dids.push(existing[0]!.did);
      continue;
    }

    const did = generateDid(handle);
    await db.insert(users).values({
      did,
      handle,
      displayName: handle.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      bio: `Demo user account for testing`,
      avatar: `https://i.pravatar.cc/300?u=${handle}`,
      verified: false,
      followerCount: randomInt(50, 5000),
      followingCount: randomInt(30, 500),
      videoCount: randomInt(0, 20),
      createdAt: randomDate(180),
      updatedAt: now,
      indexedAt: now,
    }).onConflictDoNothing();

    dids.push(did);
  }

  console.log(`  ✓ Ensured ${dids.length} demo users exist`);
  return dids;
}

async function createVideos(): Promise<string[]> {
  console.log(`\nCreating ${NUM_VIDEOS} videos for ${RICK_HANDLE}...`);
  const videoUris: string[] = [];
  const now = new Date();

  // Insert in batches of 10 for better performance
  const batchSize = 10;
  for (let i = 0; i < NUM_VIDEOS; i += batchSize) {
    const batch = [];
    const remaining = Math.min(batchSize, NUM_VIDEOS - i);

    for (let j = 0; j < remaining; j++) {
      const videoId = nanoid();
      const uri = `at://${RICK_DID}/io.exprsn.video/${videoId}`;
      const tags = selectRandomTags(randomInt(2, 5));
      const caption = `${randomElement(VIDEO_CAPTIONS)} #${tags.join(' #')}`;

      const viewCount = randomInt(100, 50000);
      const likeCount = Math.floor(viewCount * (Math.random() * 0.08 + 0.02)); // 2-10% engagement
      const commentCount = Math.floor(likeCount * (Math.random() * 0.15 + 0.05)); // 5-20% of likes

      batch.push({
        uri,
        cid: generateCid(),
        authorDid: RICK_DID,
        caption,
        tags,
        cdnUrl: `https://cdn.exprsn.app/videos/${RICK_HANDLE}/${videoId}.mp4`,
        hlsPlaylist: `https://cdn.exprsn.app/videos/${RICK_HANDLE}/${videoId}/playlist.m3u8`,
        thumbnailUrl: `https://cdn.exprsn.app/thumbnails/${RICK_HANDLE}/${videoId}.jpg`,
        duration: randomInt(15, 60),
        aspectRatio: { width: 9, height: 16 },
        visibility: 'public',
        allowDuet: true,
        allowStitch: true,
        allowComments: true,
        viewCount,
        likeCount,
        commentCount,
        shareCount: Math.floor(likeCount * 0.03),
        repostCount: Math.floor(likeCount * 0.01),
        bookmarkCount: Math.floor(likeCount * 0.05),
        moderationStatus: 'approved',
        createdAt: randomDate(30),
        indexedAt: now,
      });

      videoUris.push(uri);
    }

    await db.insert(videos).values(batch).onConflictDoNothing();
    console.log(`  ✓ Created batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(NUM_VIDEOS / batchSize)}`);
  }

  console.log(`  ✓ Created ${videoUris.length} videos total`);
  return videoUris;
}

async function createLikes(videoUris: string[], demoUserDids: string[]): Promise<void> {
  console.log(`\nCreating ${NUM_LIKES} likes...`);
  const batch = [];
  const now = new Date();

  for (let i = 0; i < NUM_LIKES; i++) {
    const videoUri = randomElement(videoUris);
    const likerDid = randomElement(demoUserDids);
    const likeId = nanoid();

    batch.push({
      uri: `at://${likerDid}/app.bsky.feed.like/${likeId}`,
      cid: generateCid(),
      videoUri,
      authorDid: likerDid,
      createdAt: randomDate(30),
      indexedAt: now,
    });
  }

  // Insert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < batch.length; i += batchSize) {
    const chunk = batch.slice(i, i + batchSize);
    await db.insert(likes).values(chunk).onConflictDoNothing();
  }

  console.log(`  ✓ Created ${NUM_LIKES} likes`);
}

async function createComments(videoUris: string[], demoUserDids: string[]): Promise<void> {
  console.log(`\nCreating ${NUM_COMMENTS} comments...`);
  const batch = [];
  const now = new Date();

  for (let i = 0; i < NUM_COMMENTS; i++) {
    const videoUri = randomElement(videoUris);
    const commenterDid = randomElement(demoUserDids);
    const commentId = nanoid();

    batch.push({
      uri: `at://${commenterDid}/io.exprsn.video.comment/${commentId}`,
      cid: generateCid(),
      videoUri,
      authorDid: commenterDid,
      text: randomElement(COMMENT_TEXTS),
      likeCount: randomInt(0, 100),
      loveCount: randomInt(0, 30),
      dislikeCount: randomInt(0, 5),
      replyCount: randomInt(0, 10),
      hotScore: Math.random() * 10,
      createdAt: randomDate(30),
      indexedAt: now,
    });
  }

  // Insert in batches of 50
  const batchSize = 50;
  for (let i = 0; i < batch.length; i += batchSize) {
    const chunk = batch.slice(i, i + batchSize);
    await db.insert(comments).values(chunk).onConflictDoNothing();
  }

  console.log(`  ✓ Created ${NUM_COMMENTS} comments`);
}

async function createFollows(demoUserDids: string[]): Promise<void> {
  console.log(`\nCreating follow relationships...`);
  const batch = [];
  const now = new Date();

  // Rick following others
  const following = [...demoUserDids]
    .sort(() => Math.random() - 0.5)
    .slice(0, NUM_FOLLOWS_FOLLOWING);

  for (const followeeDid of following) {
    const followId = nanoid();
    batch.push({
      uri: `at://${RICK_DID}/app.bsky.graph.follow/${followId}`,
      cid: generateCid(),
      followerDid: RICK_DID,
      followeeDid,
      createdAt: randomDate(60),
      indexedAt: now,
    });
  }

  // Others following Rick
  const followers = [...demoUserDids]
    .sort(() => Math.random() - 0.5)
    .slice(0, NUM_FOLLOWS_FOLLOWERS);

  for (const followerDid of followers) {
    const followId = nanoid();
    batch.push({
      uri: `at://${followerDid}/app.bsky.graph.follow/${followId}`,
      cid: generateCid(),
      followerDid,
      followeeDid: RICK_DID,
      createdAt: randomDate(60),
      indexedAt: now,
    });
  }

  await db.insert(follows).values(batch).onConflictDoNothing();
  console.log(`  ✓ Rick following: ${NUM_FOLLOWS_FOLLOWING} users`);
  console.log(`  ✓ Rick followed by: ${NUM_FOLLOWS_FOLLOWERS} users`);
}

async function createBookmarks(videoUris: string[]): Promise<void> {
  console.log(`\nCreating ${NUM_BOOKMARKS} bookmarks...`);
  const batch = [];
  const now = new Date();

  const bookmarkedVideos = [...videoUris]
    .sort(() => Math.random() - 0.5)
    .slice(0, NUM_BOOKMARKS);

  for (const videoUri of bookmarkedVideos) {
    const bookmarkId = nanoid();
    batch.push({
      uri: `at://${RICK_DID}/io.exprsn.bookmark/${bookmarkId}`,
      cid: generateCid(),
      videoUri,
      authorDid: RICK_DID,
      folder: null,
      createdAt: randomDate(30),
      indexedAt: now,
    });
  }

  await db.insert(bookmarks).values(batch).onConflictDoNothing();
  console.log(`  ✓ Created ${NUM_BOOKMARKS} bookmarks`);
}

async function createSounds(): Promise<string[]> {
  console.log(`\nCreating ${NUM_SOUNDS} sounds...`);
  const soundIds: string[] = [];
  const batch = [];
  const now = new Date();

  for (let i = 0; i < NUM_SOUNDS; i++) {
    const soundId = nanoid();
    const title = SOUND_TITLES[i] || `Sound ${i + 1}`;

    batch.push({
      id: soundId,
      authorDid: RICK_DID,
      title,
      artist: i === 0 ? RICK_HANDLE : randomElement(['Various Artists', 'Unknown', 'Production Music']),
      audioUrl: `https://cdn.exprsn.app/sounds/${RICK_HANDLE}/${soundId}.mp3`,
      coverUrl: `https://cdn.exprsn.app/sounds/${RICK_HANDLE}/${soundId}.jpg`,
      duration: randomInt(15, 180),
      useCount: randomInt(10, 5000),
      createdAt: randomDate(90),
    });

    soundIds.push(soundId);
  }

  await db.insert(sounds).values(batch).onConflictDoNothing();
  console.log(`  ✓ Created ${NUM_SOUNDS} sounds`);
  return soundIds;
}

async function createUserPreferences(): Promise<void> {
  console.log(`\nCreating user preferences...`);

  // Check if preferences already exist
  const existing = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userDid, RICK_DID))
    .limit(1);

  if (existing.length > 0) {
    console.log('  ⚠ User preferences already exist, skipping');
    return;
  }

  const now = new Date();

  // Create multiple preference entries following AT Protocol pattern
  const preferences = [
    {
      id: nanoid(),
      userDid: RICK_DID,
      prefType: 'io.exprsn.actor.getPreferences#feedViewPref',
      prefData: {
        $type: 'io.exprsn.actor.getPreferences#feedViewPref',
        feed: 'for-you',
        hideReplies: false,
        hideReposts: false,
        hideQuotePosts: false,
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nanoid(),
      userDid: RICK_DID,
      prefType: 'io.exprsn.actor.getPreferences#interestsPref',
      prefData: {
        $type: 'io.exprsn.actor.getPreferences#interestsPref',
        tags: ['tech', 'coding', 'startup', 'design', 'productivity'],
      },
      createdAt: now,
      updatedAt: now,
    },
    {
      id: nanoid(),
      userDid: RICK_DID,
      prefType: 'io.exprsn.actor.getPreferences#contentFilterPref',
      prefData: {
        $type: 'io.exprsn.actor.getPreferences#contentFilterPref',
        mutedWords: ['spam', 'clickbait'],
        blockedHashtags: [],
        hideAdultContent: false,
      },
      createdAt: now,
      updatedAt: now,
    },
  ];

  await db.insert(userPreferences).values(preferences).onConflictDoNothing();

  console.log(`  ✓ Created ${preferences.length} user preferences`);
}

async function createUserSettings(): Promise<void> {
  console.log(`\nCreating user settings...`);

  // Check if settings already exist
  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userDid, RICK_DID))
    .limit(1);

  if (existing.length > 0) {
    console.log('  ⚠ User settings already exist, skipping');
    return;
  }

  const now = new Date();
  await db.insert(userSettings).values({
    userDid: RICK_DID,
    themeId: 'slate',
    colorMode: 'dark',
    accessibility: {
      reducedMotion: false,
      highContrast: false,
      largeText: false,
      screenReaderOptimized: false,
    },
    playback: {
      autoplay: true,
      defaultQuality: 'auto',
      defaultMuted: false,
      loopVideos: true,
      dataSaver: false,
    },
    notifications: {
      likes: true,
      comments: true,
      follows: true,
      mentions: true,
      directMessages: true,
      emailDigest: 'weekly',
    },
    privacy: {
      privateAccount: false,
      showActivityStatus: true,
      allowDuets: true,
      allowStitches: true,
      allowComments: 'everyone',
      allowMessages: 'everyone',
    },
    content: {
      language: 'en',
      contentWarnings: true,
      sensitiveContent: false,
    },
    layout: {
      commentsPosition: 'side',
    },
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  console.log('  ✓ Created user settings');
}

async function createTrendingVideos(videoUris: string[]): Promise<void> {
  console.log(`\nAdding videos to trending...`);

  const trendingCount = Math.min(15, videoUris.length);
  const trendingUris = [...videoUris]
    .sort(() => Math.random() - 0.5)
    .slice(0, trendingCount);

  const batch = [];
  const now = new Date();

  for (let i = 0; i < trendingUris.length; i++) {
    batch.push({
      videoUri: trendingUris[i]!,
      score: (trendingCount - i) * 100 + Math.random() * 50,
      velocity: Math.random() * 100,
      rank: i + 1,
      updatedAt: now,
    });
  }

  await db.insert(trendingVideos).values(batch).onConflictDoNothing();
  console.log(`  ✓ Added ${trendingCount} videos to trending`);
}

async function createVideoViews(videoUris: string[], demoUserDids: string[]): Promise<void> {
  console.log(`\nCreating video views...`);

  const numViews = randomInt(300, 500);
  const batch = [];

  for (let i = 0; i < numViews; i++) {
    const videoUri = randomElement(videoUris);
    const viewerDid = Math.random() > 0.3 ? randomElement(demoUserDids) : null; // 30% anonymous views

    batch.push({
      id: nanoid(),
      videoUri,
      viewerDid,
      watchDuration: randomInt(5, 60), // seconds watched
      completionRate: Math.random(), // 0-1
      viewedAt: randomDate(30),
    });
  }

  // Insert in batches
  const batchSize = 50;
  for (let i = 0; i < batch.length; i += batchSize) {
    const chunk = batch.slice(i, i + batchSize);
    await db.insert(videoViews).values(chunk).onConflictDoNothing();
  }

  console.log(`  ✓ Created ${numViews} video views`);
}

async function createVideoHashtags(videoUris: string[]): Promise<void> {
  console.log(`\nCreating video hashtag relationships...`);

  const batch = [];
  const now = new Date();

  for (const videoUri of videoUris) {
    const hashtagCount = randomInt(2, 5);
    const selectedTags = selectRandomTags(hashtagCount);

    for (const tag of selectedTags) {
      batch.push({
        id: nanoid(),
        videoUri,
        tag: tag,
        createdAt: now,
      });
    }
  }

  // Insert in batches
  const batchSize = 100;
  for (let i = 0; i < batch.length; i += batchSize) {
    const chunk = batch.slice(i, i + batchSize);
    await db.insert(videoHashtags).values(chunk).onConflictDoNothing();
  }

  console.log(`  ✓ Created ${batch.length} video-hashtag relationships`);
}

async function createTrendingHashtags(): Promise<void> {
  console.log(`\nCreating trending hashtags...`);

  const trendingTags = selectRandomTags(12);
  const batch = [];
  const now = new Date();

  for (let i = 0; i < trendingTags.length; i++) {
    const videoCount = randomInt(50, 5000);
    batch.push({
      tag: trendingTags[i]!,
      videoCount: videoCount,
      viewCount: videoCount * randomInt(100, 1000),
      velocity: Math.random() * 10 - 2, // -2 to 8
      rank: i + 1,
      calculatedAt: now,
    });
  }

  await db.insert(trendingHashtags).values(batch).onConflictDoNothing();
  console.log(`  ✓ Created ${trendingTags.length} trending hashtags`);
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('  DEMO DATA SCRIPT FOR did:exprsn:rickholland');
  console.log('='.repeat(70));
  console.log(`\nTarget DID: ${RICK_DID}`);
  console.log(`Target Handle: ${RICK_HANDLE}\n`);

  try {
    // 1. Ensure demo users exist
    const demoUserDids = await ensureDemoUsers();

    // 2. Create videos
    const videoUris = await createVideos();

    // 3. Create likes
    await createLikes(videoUris, demoUserDids);

    // 4. Create comments
    await createComments(videoUris, demoUserDids);

    // 5. Create follows
    await createFollows(demoUserDids);

    // 6. Create bookmarks
    await createBookmarks(videoUris);

    // 7. Create sounds
    const soundIds = await createSounds();

    // 8. Create user preferences
    await createUserPreferences();

    // 9. Create user settings
    await createUserSettings();

    // 10. Create trending videos
    await createTrendingVideos(videoUris);

    // 11. Create video views
    await createVideoViews(videoUris, demoUserDids);

    // 12. Create video hashtags
    await createVideoHashtags(videoUris);

    // 13. Create trending hashtags
    await createTrendingHashtags();

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('  SEEDING COMPLETE ✓');
    console.log('='.repeat(70));
    console.log(`
Summary:
  • Videos:              ${videoUris.length}
  • Likes:               ${NUM_LIKES}
  • Comments:            ${NUM_COMMENTS}
  • Follows (Following): ${NUM_FOLLOWS_FOLLOWING}
  • Follows (Followers): ${NUM_FOLLOWS_FOLLOWERS}
  • Bookmarks:           ${NUM_BOOKMARKS}
  • Sounds:              ${soundIds.length}
  • Video Views:         ~${randomInt(300, 500)}
  • Video Hashtags:      ~${videoUris.length * 3}
  • Trending Videos:     15
  • Trending Hashtags:   12
  • User Preferences:    ✓
  • User Settings:       ✓
  • Demo Users:          ${demoUserDids.length}

All data created for: ${RICK_DID} (${RICK_HANDLE})
    `);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error during seeding:', error);
    throw error;
  }
}

// Run the script
main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
