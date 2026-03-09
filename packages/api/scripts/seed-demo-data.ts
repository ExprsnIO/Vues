/**
 * Comprehensive demo data seed script
 * Creates test users of all types and populates all tables
 *
 * Run with: cd packages/api && npx tsx scripts/seed-demo-data.ts
 */

import { db } from '../src/db/index.js';
import {
  users,
  actorRepos,
  videos,
  comments,
  follows,
  likes,
  sounds,
  organizations,
  organizationMembers,
  organizationRoles,
  sessions,
  userSettings,
  trendingVideos,
  trendingSounds,
} from '../src/db/schema.js';
import { nanoid } from 'nanoid';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// ============================================================================
// Test Data Definitions
// ============================================================================

interface TestUser {
  handle: string;
  displayName: string;
  email: string;
  bio: string;
  type: 'personal' | 'creator' | 'business' | 'admin';
  verified?: boolean;
  avatar?: string;
}

interface TestOrganization {
  name: string;
  type: 'team' | 'enterprise' | 'nonprofit' | 'business' | 'agency' | 'network';
  description: string;
  ownerHandle: string;
  memberHandles?: string[];
}

// Personal Users (5)
const PERSONAL_USERS: TestUser[] = [
  {
    handle: 'alex_viewer',
    displayName: 'Alex Thompson',
    email: 'alex@example.com',
    bio: 'Just here for the content. Love watching funny videos!',
    type: 'personal',
  },
  {
    handle: 'jamie_casual',
    displayName: 'Jamie Chen',
    email: 'jamie@example.com',
    bio: 'Casual user. Coffee enthusiast.',
    type: 'personal',
  },
  {
    handle: 'sam_explorer',
    displayName: 'Sam Wilson',
    email: 'sam@example.com',
    bio: 'Exploring the world one video at a time',
    type: 'personal',
  },
  {
    handle: 'taylor_music',
    displayName: 'Taylor Rivers',
    email: 'taylor@example.com',
    bio: 'Music lover. Always looking for new tracks.',
    type: 'personal',
  },
  {
    handle: 'morgan_fitness',
    displayName: 'Morgan Blake',
    email: 'morgan@example.com',
    bio: 'Fitness journey. Motivation seeker.',
    type: 'personal',
  },
];

// Creator Users (6)
const CREATOR_USERS: TestUser[] = [
  {
    handle: 'creator_emma',
    displayName: 'Emma Creates',
    email: 'emma.creator@example.com',
    bio: 'Full-time content creator. Dance, lifestyle, and fun!',
    type: 'creator',
    verified: true,
    avatar: 'https://i.pravatar.cc/300?u=emma',
  },
  {
    handle: 'chef_marcus',
    displayName: 'Chef Marcus',
    email: 'marcus.chef@example.com',
    bio: 'Professional chef sharing quick recipes. 1M+ followers on other platforms.',
    type: 'creator',
    verified: true,
    avatar: 'https://i.pravatar.cc/300?u=marcus',
  },
  {
    handle: 'comedy_jake',
    displayName: 'Jake Comedy',
    email: 'jake.comedy@example.com',
    bio: 'Making you laugh daily. Sketches & impressions.',
    type: 'creator',
    verified: true,
    avatar: 'https://i.pravatar.cc/300?u=jake',
  },
  {
    handle: 'tech_sarah',
    displayName: 'Sarah Tech',
    email: 'sarah.tech@example.com',
    bio: 'Tech reviewer and gadget enthusiast. Honest reviews.',
    type: 'creator',
    avatar: 'https://i.pravatar.cc/300?u=sarah',
  },
  {
    handle: 'travel_mike',
    displayName: 'Mike Travels',
    email: 'mike.travel@example.com',
    bio: 'Exploring 100 countries. Travel tips & hidden gems.',
    type: 'creator',
    verified: true,
    avatar: 'https://i.pravatar.cc/300?u=mike',
  },
  {
    handle: 'diy_lisa',
    displayName: 'Lisa DIY',
    email: 'lisa.diy@example.com',
    bio: 'DIY projects, home decor, and crafts. Make it yourself!',
    type: 'creator',
    avatar: 'https://i.pravatar.cc/300?u=lisa',
  },
];

// Business/Brand Users (5)
const BUSINESS_USERS: TestUser[] = [
  {
    handle: 'acme_brand',
    displayName: 'ACME Corporation',
    email: 'social@acme.example.com',
    bio: 'Official ACME brand account. Quality products since 1950.',
    type: 'business',
    verified: true,
    avatar: 'https://ui-avatars.com/api/?name=ACME&background=0D8ABC&color=fff',
  },
  {
    handle: 'stellar_coffee',
    displayName: 'Stellar Coffee Co',
    email: 'hello@stellarcoffee.example.com',
    bio: 'Artisan coffee roasters. Fair trade & organic.',
    type: 'business',
    avatar: 'https://ui-avatars.com/api/?name=SC&background=8B4513&color=fff',
  },
  {
    handle: 'nova_fashion',
    displayName: 'Nova Fashion',
    email: 'info@novafashion.example.com',
    bio: 'Sustainable fashion for the modern world.',
    type: 'business',
    verified: true,
    avatar: 'https://ui-avatars.com/api/?name=NF&background=FF69B4&color=fff',
  },
  {
    handle: 'pixel_games',
    displayName: 'Pixel Games Studio',
    email: 'community@pixelgames.example.com',
    bio: 'Indie game developer. Making fun games since 2018.',
    type: 'business',
    avatar: 'https://ui-avatars.com/api/?name=PG&background=9932CC&color=fff',
  },
  {
    handle: 'green_eats',
    displayName: 'Green Eats Kitchen',
    email: 'hello@greeneats.example.com',
    bio: 'Plant-based recipes and healthy living.',
    type: 'business',
    avatar: 'https://ui-avatars.com/api/?name=GE&background=228B22&color=fff',
  },
];

// Admin Users (2)
const ADMIN_USERS: TestUser[] = [
  {
    handle: 'admin_global',
    displayName: 'Global Admin',
    email: 'admin@exprsn.example.com',
    bio: 'Platform administrator',
    type: 'admin',
  },
  {
    handle: 'mod_team',
    displayName: 'Moderation Team',
    email: 'moderation@exprsn.example.com',
    bio: 'Content moderation team',
    type: 'admin',
  },
];

// Organizations (8 - various types)
const TEST_ORGANIZATIONS: TestOrganization[] = [
  {
    name: 'Startup Labs',
    type: 'team',
    description: 'Small startup team building cool stuff',
    ownerHandle: 'tech_sarah',
    memberHandles: ['alex_viewer', 'jamie_casual'],
  },
  {
    name: 'Enterprise Media Corp',
    type: 'enterprise',
    description: 'Large enterprise media company with multiple departments',
    ownerHandle: 'admin_global',
    memberHandles: ['creator_emma', 'chef_marcus', 'comedy_jake', 'tech_sarah'],
  },
  {
    name: 'Save The Planet Foundation',
    type: 'nonprofit',
    description: 'Environmental nonprofit organization',
    ownerHandle: 'morgan_fitness',
    memberHandles: ['sam_explorer', 'taylor_music'],
  },
  {
    name: 'ACME Industries',
    type: 'business',
    description: 'Leading industrial solutions provider',
    ownerHandle: 'acme_brand',
    memberHandles: ['stellar_coffee', 'nova_fashion'],
  },
  {
    name: 'Creative Agency Pro',
    type: 'agency',
    description: 'Full-service digital marketing and creative agency',
    ownerHandle: 'creator_emma',
    memberHandles: ['diy_lisa', 'travel_mike'],
  },
  {
    name: 'Influencer Network Global',
    type: 'network',
    description: 'Multi-channel creator network connecting talent with brands',
    ownerHandle: 'comedy_jake',
    memberHandles: ['chef_marcus', 'travel_mike', 'tech_sarah'],
  },
  {
    name: 'Gaming Guild Alliance',
    type: 'team',
    description: 'Esports and gaming content team',
    ownerHandle: 'pixel_games',
    memberHandles: ['alex_viewer', 'jamie_casual'],
  },
  {
    name: 'Health & Wellness Network',
    type: 'nonprofit',
    description: 'Community health and wellness initiative',
    ownerHandle: 'green_eats',
    memberHandles: ['morgan_fitness'],
  },
];

// Content Data
const VIDEO_CAPTIONS = [
  'POV: when the beat drops',
  'Had to share this moment',
  'Can you relate?',
  'Wait for it...',
  'Just vibing',
  'Late night thoughts',
  'Tutorial you asked for',
  'Day in my life',
  'Hot take incoming',
  'Storytime: what happened next',
  'This changed everything',
  'You need to try this',
  'Unpopular opinion but...',
  'Life hack that actually works',
  'Behind the scenes',
];

const HASHTAGS = [
  'fyp', 'foryou', 'viral', 'trending', 'comedy', 'dance', 'music',
  'food', 'fitness', 'travel', 'tech', 'diy', 'tutorial', 'pets',
  'fashion', 'beauty', 'gaming', 'art', 'motivation', 'life',
];

const COMMENT_TEXTS = [
  'This is amazing!',
  'Love this content!',
  'Great video!',
  'Pure gold!',
  'Best thing today',
  'Legend',
  'So talented!',
  'Obsessed',
  'This is fire',
  'Need more of this',
  'Underrated creator',
  'Following now!',
  'How do you do this?',
  'Wow just wow',
  'Perfection',
];

const SOUND_DATA = [
  { title: 'Viral Beat 2024', artist: 'DJ Trending' },
  { title: 'Summer Vibes', artist: 'The Vibes' },
  { title: 'Dance Mix Pro', artist: 'BeatMaker' },
  { title: 'Lo-Fi Dreams', artist: 'Chill Studio' },
  { title: 'Epic Cinematic', artist: 'Sound Wave' },
  { title: 'Original Sound', artist: null },
  { title: 'Acoustic Feel', artist: 'Music Lab' },
  { title: 'Electronic Drop', artist: 'Mix Master' },
];

// ============================================================================
// Helper Functions
// ============================================================================

function generateDid(): string {
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
  return new Date(Date.now() - randomInt(1, daysBack) * 24 * 60 * 60 * 1000);
}

function generateKeyPair(): { publicKey: string; privateKey: string } {
  // Generate simple stub keys for demo purposes
  const randomPart = crypto.randomBytes(32).toString('base64');
  return {
    publicKey: `demo_pub_${randomPart}`,
    privateKey: `demo_priv_${randomPart}`,
  };
}

// ============================================================================
// Seed Functions
// ============================================================================

async function createUser(user: TestUser): Promise<{ did: string; handle: string }> {
  // Check if user already exists
  const existing = await db.select().from(users).where(eq(users.handle, user.handle)).limit(1);
  if (existing[0]) {
    return { did: existing[0].did, handle: user.handle };
  }

  const did = generateDid();
  const { publicKey, privateKey } = generateKeyPair();
  const passwordHash = await bcrypt.hash('demo1234', 10);
  const now = new Date();

  // Create actor_repos entry
  await db.insert(actorRepos).values({
    did,
    handle: user.handle,
    email: user.email,
    passwordHash,
    signingKeyPublic: publicKey,
    signingKeyPrivate: privateKey,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Create users entry
  await db.insert(users).values({
    did,
    handle: user.handle,
    displayName: user.displayName,
    bio: user.bio,
    avatar: user.avatar || `https://i.pravatar.cc/300?u=${user.handle}`,
    verified: user.verified || false,
    followerCount: randomInt(10, 10000),
    followingCount: randomInt(5, 500),
    videoCount: randomInt(0, 50),
    createdAt: randomDate(365),
    updatedAt: now,
    indexedAt: now,
  }).onConflictDoNothing();

  // Create user settings
  await db.insert(userSettings).values({
    userDid: did,
    themeId: 'slate',
    colorMode: randomElement(['dark', 'light', 'system']),
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
      emailDigest: 'never',
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

  return { did, handle: user.handle };
}

async function createOrganization(
  org: TestOrganization,
  userMap: Map<string, string>
): Promise<string> {
  const ownerDid = userMap.get(org.ownerHandle);
  if (!ownerDid) {
    console.log(`   Skipping org ${org.name} - owner not found`);
    return '';
  }

  const orgId = nanoid();
  const now = new Date();

  // Use raw SQL to avoid drizzle type issues
  const createdAt = randomDate(180).toISOString();
  const updatedAt = now.toISOString();
  await db.execute(sql`
    INSERT INTO organizations (id, owner_did, name, type, description, member_count, verified, created_at, updated_at)
    VALUES (${orgId}, ${ownerDid}, ${org.name}, ${org.type}, ${org.description}, ${1 + (org.memberHandles?.length || 0)}, ${org.type === 'enterprise'}, ${createdAt}::timestamp, ${updatedAt}::timestamp)
    ON CONFLICT DO NOTHING
  `);

  // Add owner as member using raw SQL
  const ownerId = nanoid();
  await db.execute(sql`
    INSERT INTO organization_members (id, organization_id, user_did, role, permissions, joined_at)
    VALUES (${ownerId}, ${orgId}, ${ownerDid}, 'owner', '["bulk_import", "manage_members", "edit_settings", "delete_org", "admin"]'::jsonb, NOW())
    ON CONFLICT DO NOTHING
  `);

  // Add other members
  if (org.memberHandles) {
    for (const memberHandle of org.memberHandles) {
      const memberDid = userMap.get(memberHandle);
      if (memberDid) {
        const memberId = nanoid();
        const memberRole = randomElement(['admin', 'member', 'member', 'member']);
        await db.execute(sql`
          INSERT INTO organization_members (id, organization_id, user_did, role, permissions, joined_at)
          VALUES (${memberId}, ${orgId}, ${memberDid}, ${memberRole}, '["view_content"]'::jsonb, NOW())
          ON CONFLICT DO NOTHING
        `);
      }
    }
  }

  // Create default roles using raw SQL
  const defaultRoles = [
    { name: 'admin', displayName: 'Administrator', permissions: '["manage_members", "edit_settings", "moderate"]', color: '#ef4444' },
    { name: 'moderator', displayName: 'Moderator', permissions: '["moderate", "view_reports"]', color: '#f59e0b' },
    { name: 'member', displayName: 'Member', permissions: '["view_content", "post_content"]', color: '#3b82f6' },
  ];

  for (let i = 0; i < defaultRoles.length; i++) {
    const role = defaultRoles[i]!;
    const roleId = nanoid();
    await db.execute(sql`
      INSERT INTO organization_roles (id, organization_id, name, display_name, permissions, color, is_system, priority)
      VALUES (${roleId}, ${orgId}, ${role.name}, ${role.displayName}, ${role.permissions}::jsonb, ${role.color}, true, ${i})
      ON CONFLICT DO NOTHING
    `);
  }

  return orgId;
}

async function createVideosForUser(userDid: string, count: number): Promise<string[]> {
  const videoUris: string[] = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const uri = `at://${userDid}/io.exprsn.video.post/${nanoid()}`;
    const tags = HASHTAGS.sort(() => Math.random() - 0.5).slice(0, randomInt(2, 5));
    const caption = `${randomElement(VIDEO_CAPTIONS)} #${tags.join(' #')}`;

    const viewCount = randomInt(100, 100000);
    const likeCount = Math.floor(viewCount * (Math.random() * 0.1 + 0.02));
    const commentCount = Math.floor(likeCount * (Math.random() * 0.15 + 0.05));

    await db.insert(videos).values({
      uri,
      cid: nanoid(),
      authorDid: userDid,
      caption,
      tags,
      cdnUrl: `/videos/sample_${randomInt(1, 6)}.mp4`,
      thumbnailUrl: `https://picsum.photos/seed/${nanoid()}/270/480`,
      duration: randomInt(15, 180),
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
    }).onConflictDoNothing();

    videoUris.push(uri);
  }

  return videoUris;
}

async function createFollows(followers: string[], followees: string[]): Promise<void> {
  for (const follower of followers) {
    const toFollow = followees.sort(() => Math.random() - 0.5).slice(0, randomInt(3, 8));
    for (const followee of toFollow) {
      if (follower !== followee) {
        const uri = `at://${follower}/app.bsky.graph.follow/${nanoid()}`;
        await db.insert(follows).values({
          uri,
          cid: nanoid(),
          followerDid: follower,
          followeeDid: followee,
          createdAt: randomDate(60),
          indexedAt: new Date(),
        }).onConflictDoNothing();
      }
    }
  }
}

async function createComments(videoUris: string[], userDids: string[]): Promise<void> {
  for (const videoUri of videoUris) {
    const numComments = randomInt(2, 10);
    for (let i = 0; i < numComments; i++) {
      const commenter = randomElement(userDids);
      await db.insert(comments).values({
        uri: `at://${commenter}/io.exprsn.video.comment/${nanoid()}`,
        cid: nanoid(),
        videoUri,
        authorDid: commenter,
        text: randomElement(COMMENT_TEXTS),
        likeCount: randomInt(0, 50),
        loveCount: randomInt(0, 20),
        dislikeCount: randomInt(0, 3),
        replyCount: 0,
        hotScore: Math.random() * 10,
        createdAt: randomDate(14),
        indexedAt: new Date(),
      }).onConflictDoNothing();
    }
  }
}

async function createLikes(videoUris: string[], userDids: string[]): Promise<void> {
  for (const videoUri of videoUris) {
    const likers = userDids.sort(() => Math.random() - 0.5).slice(0, randomInt(5, 15));
    for (const liker of likers) {
      await db.insert(likes).values({
        uri: `at://${liker}/app.bsky.feed.like/${nanoid()}`,
        cid: nanoid(),
        videoUri,
        authorDid: liker,
        createdAt: randomDate(7),
        indexedAt: new Date(),
      }).onConflictDoNothing();
    }
  }
}

async function createSounds(): Promise<string[]> {
  const soundIds: string[] = [];
  for (let i = 0; i < SOUND_DATA.length; i++) {
    const sound = SOUND_DATA[i]!;
    const soundId = nanoid();
    await db.insert(sounds).values({
      id: soundId,
      title: sound.title,
      artist: sound.artist,
      duration: randomInt(15, 180),
      audioUrl: `/audio/sound_${i + 1}.mp3`,
      coverUrl: `https://picsum.photos/seed/sound${i}/200/200`,
      useCount: randomInt(100, 50000),
      createdAt: randomDate(90),
    }).onConflictDoNothing();
    soundIds.push(soundId);
  }
  return soundIds;
}

async function createTrendingSounds(soundIds: string[]): Promise<void> {
  for (let i = 0; i < soundIds.length; i++) {
    const soundId = soundIds[i]!;
    await db.insert(trendingSounds).values({
      soundId,
      score: (soundIds.length - i) * 100 + Math.random() * 50,
      velocity: Math.random() * 10 - 2, // -2 to 8 (mostly positive)
      rank: i + 1,
      recentUseCount: randomInt(50, 5000),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
}

async function createTrendingVideos(videoUris: string[]): Promise<void> {
  const trending = videoUris.sort(() => Math.random() - 0.5).slice(0, 20);
  for (let i = 0; i < trending.length; i++) {
    await db.insert(trendingVideos).values({
      videoUri: trending[i]!,
      score: (20 - i) * 100 + Math.random() * 50,
      velocity: Math.random() * 100,
      rank: i + 1,
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
}

// ============================================================================
// Main Function
// ============================================================================

async function main() {
  console.log('='.repeat(60));
  console.log('COMPREHENSIVE DEMO DATA SEEDING');
  console.log('='.repeat(60) + '\n');

  const userMap = new Map<string, string>(); // handle -> did
  const allDids: string[] = [];
  const allVideoUris: string[] = [];

  // 1. Create Personal Users
  console.log('1. Creating Personal Users...');
  for (const user of PERSONAL_USERS) {
    try {
      const { did, handle } = await createUser(user);
      userMap.set(handle, did);
      if (!allDids.includes(did)) allDids.push(did);
      console.log(`   OK: ${handle} (${did.slice(0, 20)}...)`);
    } catch (e: any) {
      console.error(`   Error creating ${user.handle}:`, e.message);
    }
  }

  // 2. Create Creator Users
  console.log('\n2. Creating Creator Users...');
  for (const user of CREATOR_USERS) {
    try {
      const { did, handle } = await createUser(user);
      userMap.set(handle, did);
      if (!allDids.includes(did)) allDids.push(did);
      console.log(`   OK: ${handle} (${did.slice(0, 20)}...) ${user.verified ? '[VERIFIED]' : ''}`);
    } catch (e: any) {
      console.error(`   Error creating ${user.handle}:`, e.message);
    }
  }

  // 3. Create Business Users
  console.log('\n3. Creating Business Users...');
  for (const user of BUSINESS_USERS) {
    try {
      const { did, handle } = await createUser(user);
      userMap.set(handle, did);
      if (!allDids.includes(did)) allDids.push(did);
      console.log(`   OK: ${handle} (${did.slice(0, 20)}...) ${user.verified ? '[VERIFIED]' : ''}`);
    } catch (e: any) {
      console.error(`   Error creating ${user.handle}:`, e.message);
    }
  }

  // 4. Create Admin Users
  console.log('\n4. Creating Admin Users...');
  for (const user of ADMIN_USERS) {
    try {
      const { did, handle } = await createUser(user);
      userMap.set(handle, did);
      if (!allDids.includes(did)) allDids.push(did);
      console.log(`   OK: ${handle} (${did.slice(0, 20)}...)`);
    } catch (e: any) {
      console.error(`   Error creating ${user.handle}:`, e.message);
    }
  }

  console.log(`\n   Total users in map: ${userMap.size}`);

  // 5. Create Organizations
  console.log('\n5. Creating Organizations...');
  for (const org of TEST_ORGANIZATIONS) {
    try {
      const orgId = await createOrganization(org, userMap);
      if (orgId) {
        console.log(`   Created: ${org.name} (${org.type}) - ID: ${orgId.slice(0, 10)}...`);
      }
    } catch (e: any) {
      if (e.code === '23505') {
        console.log(`   Skipped: ${org.name} (already exists)`);
      } else {
        console.error(`   Error creating ${org.name}:`, e.message);
      }
    }
  }

  // 6. Create Sounds
  console.log('\n6. Creating Sounds...');
  const soundIds = await createSounds();
  console.log(`   Created ${soundIds.length} sounds`);

  // 6b. Create Trending Sounds
  console.log('\n6b. Creating Trending Sounds...');
  await createTrendingSounds(soundIds);
  console.log(`   Created ${soundIds.length} trending sounds`);

  // 7. Create Videos for Creators
  console.log('\n7. Creating Videos for Creators...');
  for (const creator of CREATOR_USERS) {
    const did = userMap.get(creator.handle);
    if (did) {
      const uris = await createVideosForUser(did, randomInt(5, 10));
      allVideoUris.push(...uris);
      console.log(`   Created ${uris.length} videos for ${creator.handle}`);
    }
  }

  // 8. Create Videos for Business Accounts
  console.log('\n8. Creating Videos for Business Accounts...');
  for (const business of BUSINESS_USERS) {
    const did = userMap.get(business.handle);
    if (did) {
      const uris = await createVideosForUser(did, randomInt(3, 6));
      allVideoUris.push(...uris);
      console.log(`   Created ${uris.length} videos for ${business.handle}`);
    }
  }

  // 9. Create Follows
  console.log('\n9. Creating Follow Relationships...');
  await createFollows(allDids, allDids);
  console.log('   Created follow relationships');

  // 10. Create Comments
  console.log('\n10. Creating Comments...');
  await createComments(allVideoUris, allDids);
  console.log(`   Created comments on ${allVideoUris.length} videos`);

  // 11. Create Likes
  console.log('\n11. Creating Likes...');
  await createLikes(allVideoUris, allDids);
  console.log('   Created likes');

  // 12. Create Trending Videos
  console.log('\n12. Creating Trending List...');
  await createTrendingVideos(allVideoUris);
  console.log('   Created trending videos list');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SEEDING COMPLETE');
  console.log('='.repeat(60));
  console.log(`
Summary:
  - Personal Users: ${PERSONAL_USERS.length}
  - Creator Users:  ${CREATOR_USERS.length}
  - Business Users: ${BUSINESS_USERS.length}
  - Admin Users:    ${ADMIN_USERS.length}
  - Organizations:  ${TEST_ORGANIZATIONS.length}
  - Videos:         ${allVideoUris.length}
  - Sounds:         ${SOUND_DATA.length}

All test accounts use password: demo1234
  `);

  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
