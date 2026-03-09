/**
 * Comprehensive seed script for all database tables
 * Run with: cd packages/api && npx tsx scripts/seed-full-data.ts
 */

import { db } from '../src/db/index.js';
import {
  users,
  videos,
  comments,
  commentReactions,
  follows,
  trendingVideos,
  sounds,
  likes,
  bookmarks,
  reposts,
  lists,
  listItems,
  userSettings,
  notifications,
  conversations,
  messages,
  conversationParticipants,
} from '../src/db/schema.js';
import { nanoid } from 'nanoid';
import { eq, and, sql } from 'drizzle-orm';

// Sample data arrays
const HASHTAGS = [
  'fyp', 'foryou', 'viral', 'trending', 'foryoupage', 'explore', 'comedy',
  'funny', 'dance', 'music', 'art', 'beauty', 'fashion', 'food', 'fitness',
  'travel', 'pets', 'nature', 'gaming', 'tech', 'diy', 'tutorial', 'life',
  'motivation', 'love', 'friends', 'family', 'summer', 'winter', 'weekend'
];

const SOUND_NAMES = [
  'Viral Beat 2024', 'Summer Vibes', 'Trending Dance Mix', 'Lo-Fi Chill',
  'Epic Cinematic', 'Acoustic Feel', 'Electronic Drop', 'Hip Hop Flow',
  'Original Sound', 'Remix Master', 'Pop Hit', 'Rock Anthem',
  'Jazz Mood', 'Classical Touch', 'Country Roads'
];

const ARTIST_NAMES = [
  'DJ Trending', 'The Vibes', 'BeatMaker Pro', 'Sound Studio',
  'Music Lab', 'Audio King', 'Mix Master', 'Sound Wave',
  null, null, null // Some are original sounds
];

const VIDEO_FILES = [
  'BigBuckBunny.mp4', 'MuxSample.mp4', 'NatureVideo1.mp4',
  'SampleVideo1.mp4', 'SampleVideo2.mp4', 'Sintel.mp4'
];

const CAPTIONS = [
  'POV: when the beat drops 🎵',
  'Had to share this moment ✨',
  'Can you relate? 😂',
  'Wait for it...',
  'Just vibing',
  'Late night thoughts 💭',
  'Tutorial you didn\'t ask for',
  'Day in my life',
  'Hot take',
  'Storytime'
];

const COMMENTS = [
  'This is amazing! 🔥',
  'Love this content!',
  'Great video!',
  'Can\'t stop watching',
  'Pure gold! 💯',
  'Best thing I\'ve seen today',
  'Legend',
  'You\'re so talented!',
  'Obsessed with this',
  'This is fire 🔥🔥🔥'
];

const LIST_NAMES = [
  'Favorites', 'Watch Later', 'Comedy Gold', 'Dance Inspiration',
  'Music Vibes', 'Tutorials', 'Motivation', 'Food Ideas'
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log('=== Starting comprehensive data seeding ===\n');

  // Get rickholland
  const [rickholland] = await db.select().from(users).where(eq(users.handle, 'rickholland')).limit(1);
  if (!rickholland) {
    console.error('rickholland not found. Please ensure the user exists.');
    process.exit(1);
  }
  console.log(`Found rickholland: ${rickholland.did}\n`);

  // Get all users
  const allUsers = await db.select().from(users);
  const otherUsers = allUsers.filter(u => u.did !== rickholland.did);
  console.log(`Found ${allUsers.length} total users, ${otherUsers.length} other users\n`);

  // 1. Create user settings for rickholland if not exists
  console.log('1. Ensuring user settings exist...');
  const [existingSettings] = await db.select().from(userSettings).where(eq(userSettings.userDid, rickholland.did)).limit(1);
  if (!existingSettings) {
    await db.insert(userSettings).values({
      userDid: rickholland.did,
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('   Created settings for rickholland');
  } else {
    console.log('   Settings already exist for rickholland');
  }

  // 2. Make rickholland follow some users
  console.log('\n2. Making rickholland follow users...');
  const usersToFollow = otherUsers.slice(0, 20); // Follow first 20 users
  let followsAdded = 0;
  for (const user of usersToFollow) {
    const uri = `at://${rickholland.did}/app.bsky.graph.follow/${nanoid()}`;
    try {
      await db.insert(follows).values({
        uri,
        cid: nanoid(),
        followerDid: rickholland.did,
        followeeDid: user.did,
        createdAt: new Date(),
        indexedAt: new Date(),
      }).onConflictDoNothing();
      followsAdded++;
    } catch (e) {
      // Already following
    }
  }
  // Update following count
  await db.update(users).set({ followingCount: usersToFollow.length }).where(eq(users.did, rickholland.did));
  console.log(`   Added ${followsAdded} follows, rickholland now following ${usersToFollow.length} users`);

  // 3. Create sounds
  console.log('\n3. Creating sounds...');
  const existingSounds = await db.select().from(sounds).limit(1);
  if (existingSounds.length === 0) {
    for (let i = 0; i < SOUND_NAMES.length; i++) {
      await db.insert(sounds).values({
        id: nanoid(),
        title: SOUND_NAMES[i]!,
        artist: randomElement(ARTIST_NAMES),
        duration: randomInt(15, 180),
        audioUrl: `/audio/sound_${i + 1}.mp3`,
        coverUrl: `https://picsum.photos/seed/sound${i}/200/200`,
        useCount: randomInt(100, 50000),
        createdAt: new Date(Date.now() - randomInt(1, 90) * 24 * 60 * 60 * 1000),
      });
    }
    console.log(`   Created ${SOUND_NAMES.length} sounds`);
  } else {
    console.log('   Sounds already exist');
  }

  // 4. Ensure videos exist and have proper data
  console.log('\n4. Checking videos...');
  const existingVideos = await db.select().from(videos);
  if (existingVideos.length === 0) {
    console.log('   No videos found, creating videos...');
    for (let i = 0; i < 30; i++) {
      const authorDid = randomElement(allUsers).did;
      const videoFile = VIDEO_FILES[i % VIDEO_FILES.length]!;
      const uri = `at://${authorDid}/io.exprsn.video.post/${nanoid()}`;
      const tags = HASHTAGS.sort(() => Math.random() - 0.5).slice(0, randomInt(2, 5));

      const viewCount = randomInt(1000, 500000);
      const likeCount = Math.floor(viewCount * (Math.random() * 0.1 + 0.02));
      const commentCount = Math.floor(likeCount * (Math.random() * 0.15 + 0.05));

      await db.insert(videos).values({
        uri,
        cid: nanoid(),
        authorDid,
        caption: `${randomElement(CAPTIONS)} #${tags.join(' #')}`,
        tags,
        cdnUrl: `/videos/${videoFile}`,
        thumbnailUrl: `https://picsum.photos/seed/video${i}/270/480`,
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
      }).onConflictDoNothing();
    }
    console.log('   Created 30 videos');
  } else {
    console.log(`   ${existingVideos.length} videos already exist`);
  }

  // 5. Create videos for the users rickholland is following (so Following feed has content)
  console.log('\n5. Ensuring followed users have videos...');
  const followedUsers = usersToFollow;
  const allVideosNow = await db.select().from(videos);

  for (const followedUser of followedUsers.slice(0, 10)) {
    // Check if this user has videos
    const userVideos = allVideosNow.filter(v => v.authorDid === followedUser.did);
    if (userVideos.length === 0) {
      const videoFile = randomElement(VIDEO_FILES);
      const uri = `at://${followedUser.did}/io.exprsn.video.post/${nanoid()}`;
      const tags = HASHTAGS.sort(() => Math.random() - 0.5).slice(0, 3);

      await db.insert(videos).values({
        uri,
        cid: nanoid(),
        authorDid: followedUser.did,
        caption: `${randomElement(CAPTIONS)} #${tags.join(' #')}`,
        tags,
        cdnUrl: `/videos/${videoFile}`,
        thumbnailUrl: `https://picsum.photos/seed/fv${nanoid()}/270/480`,
        duration: randomInt(15, 60),
        aspectRatio: { width: 9, height: 16 },
        visibility: 'public',
        allowDuet: true,
        allowStitch: true,
        allowComments: true,
        viewCount: randomInt(1000, 50000),
        likeCount: randomInt(100, 5000),
        commentCount: randomInt(10, 500),
        shareCount: randomInt(5, 100),
        repostCount: randomInt(1, 50),
        bookmarkCount: randomInt(10, 200),
        createdAt: new Date(Date.now() - randomInt(1, 7) * 24 * 60 * 60 * 1000),
        indexedAt: new Date(),
      });
    }
  }
  console.log('   Ensured followed users have videos');

  // 6. Create lists for rickholland
  console.log('\n6. Creating lists...');
  const existingLists = await db.select().from(lists).where(eq(lists.authorDid, rickholland.did)).limit(1);
  if (existingLists.length === 0) {
    for (const listName of LIST_NAMES.slice(0, 4)) {
      const listUri = `at://${rickholland.did}/app.bsky.graph.list/${nanoid()}`;
      await db.insert(lists).values({
        uri: listUri,
        cid: nanoid(),
        authorDid: rickholland.did,
        name: listName,
        description: `My ${listName.toLowerCase()} collection`,
        purpose: 'curatelist',
        memberCount: 0,
        createdAt: new Date(),
        indexedAt: new Date(),
      });
    }
    console.log(`   Created ${LIST_NAMES.slice(0, 4).length} lists`);
  } else {
    console.log('   Lists already exist');
  }

  // 7. Create some notifications for rickholland
  console.log('\n7. Creating notifications...');
  const existingNotifs = await db.select().from(notifications).where(eq(notifications.userDid, rickholland.did)).limit(1);
  if (existingNotifs.length === 0) {
    const notifTypes: ('like' | 'comment' | 'follow' | 'mention')[] = ['like', 'comment', 'follow', 'mention'];
    for (let i = 0; i < 20; i++) {
      const actor = randomElement(otherUsers);
      const reason = randomElement(notifTypes);
      await db.insert(notifications).values({
        id: nanoid(),
        userDid: rickholland.did,
        actorDid: actor.did,
        reason,
        reasonSubject: reason === 'follow' ? undefined : `at://${rickholland.did}/io.exprsn.video.post/${nanoid()}`,
        isRead: Math.random() > 0.5,
        createdAt: new Date(Date.now() - randomInt(1, 168) * 60 * 60 * 1000),
        indexedAt: new Date(),
      });
    }
    console.log('   Created 20 notifications');
  } else {
    console.log('   Notifications already exist');
  }

  // 8. Create a conversation for rickholland
  console.log('\n8. Creating conversations...');
  const existingConvos = await db.select().from(conversations).limit(1);
  if (existingConvos.length === 0) {
    const chatPartner = otherUsers[0]!;
    const convoId = nanoid();

    await db.insert(conversations).values({
      id: convoId,
      participant1Did: rickholland.did,
      participant2Did: chatPartner.did,
      lastMessageAt: new Date(),
      lastMessageText: 'Hey, love your content!',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add participants
    await db.insert(conversationParticipants).values([
      {
        id: nanoid(),
        conversationId: convoId,
        participantDid: rickholland.did,
        muted: false,
        createdAt: new Date(),
      },
      {
        id: nanoid(),
        conversationId: convoId,
        participantDid: chatPartner.did,
        muted: false,
        createdAt: new Date(),
      },
    ]);

    // Add messages
    const messageTexts = [
      'Hey! Love your videos!',
      'Thanks so much! Really appreciate it 😊',
      'Keep up the great work!',
      'Will do! Any suggestions for content?',
    ];

    for (let i = 0; i < messageTexts.length; i++) {
      await db.insert(messages).values({
        id: nanoid(),
        conversationId: convoId,
        senderDid: i % 2 === 0 ? chatPartner.did : rickholland.did,
        text: messageTexts[i]!,
        createdAt: new Date(Date.now() - (messageTexts.length - i) * 60 * 60 * 1000),
      });
    }
    console.log('   Created conversation with messages');
  } else {
    console.log('   Conversations already exist');
  }

  // 9. Add some likes and bookmarks for rickholland
  console.log('\n9. Adding likes and bookmarks...');
  const videosForLikes = await db.select().from(videos).limit(10);
  for (const video of videosForLikes.slice(0, 5)) {
    const likeUri = `at://${rickholland.did}/app.bsky.feed.like/${nanoid()}`;
    try {
      await db.insert(likes).values({
        uri: likeUri,
        cid: nanoid(),
        videoUri: video.uri,
        authorDid: rickholland.did,
        createdAt: new Date(),
        indexedAt: new Date(),
      }).onConflictDoNothing();
    } catch (e) {}
  }

  for (const video of videosForLikes.slice(5, 8)) {
    const bookmarkUri = `at://${rickholland.did}/io.exprsn.video.bookmark/${nanoid()}`;
    try {
      await db.insert(bookmarks).values({
        uri: bookmarkUri,
        cid: nanoid(),
        videoUri: video.uri,
        authorDid: rickholland.did,
        createdAt: new Date(),
        indexedAt: new Date(),
      }).onConflictDoNothing();
    } catch (e) {}
  }
  console.log('   Added likes and bookmarks');

  // 10. Create comments if none exist
  console.log('\n10. Ensuring comments exist...');
  const existingComments = await db.select().from(comments).limit(1);
  if (existingComments.length === 0) {
    const videosForComments = await db.select().from(videos).limit(20);
    for (const video of videosForComments) {
      for (let i = 0; i < randomInt(2, 8); i++) {
        const commenter = randomElement(allUsers);
        await db.insert(comments).values({
          uri: `at://${commenter.did}/io.exprsn.video.comment/${nanoid()}`,
          cid: nanoid(),
          videoUri: video.uri,
          authorDid: commenter.did,
          text: randomElement(COMMENTS),
          likeCount: randomInt(0, 100),
          loveCount: randomInt(0, 20),
          dislikeCount: randomInt(0, 5),
          replyCount: 0,
          hotScore: Math.random() * 10,
          createdAt: new Date(Date.now() - randomInt(1, 168) * 60 * 60 * 1000),
          indexedAt: new Date(),
        });
      }
    }
    console.log('   Created comments');
  } else {
    console.log('   Comments already exist');
  }

  console.log('\n=== Seeding complete! ===');
  console.log('\nSummary:');
  console.log('  - User settings created/verified');
  console.log('  - rickholland following 20 users');
  console.log('  - Sounds created');
  console.log('  - Videos created with thumbnails');
  console.log('  - Lists created');
  console.log('  - Notifications created');
  console.log('  - Conversations/messages created');
  console.log('  - Likes and bookmarks added');
  console.log('  - Comments created');

  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
