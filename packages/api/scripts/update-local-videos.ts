/**
 * Update videos to use local files and add new sample videos
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users, videos, trendingVideos } from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';

const LOCAL_VIDEOS = [
  {
    filename: 'BigBuckBunny.mp4',
    title: 'Big Buck Bunny',
    description: 'Big Buck Bunny tells the story of a giant rabbit with a heart bigger than himself. A Blender Foundation film.',
    duration: 596,
    tags: ['animation', 'blender', 'creative-commons', 'comedy'],
  },
  {
    filename: 'Sintel.mp4',
    title: 'Sintel Trailer',
    description: 'Sintel is an independently produced short film by the Blender Foundation. A story of a young girl and her dragon.',
    duration: 52,
    tags: ['animation', 'blender', 'fantasy', 'trailer'],
  },
  {
    filename: 'MuxSample.mp4',
    title: 'Sample Reel',
    description: 'High quality sample video reel showcasing various scenes and transitions.',
    duration: 120,
    tags: ['sample', 'demo', 'showcase'],
  },
  {
    filename: 'SampleVideo1.mp4',
    title: 'Quick Clip 1',
    description: 'Short video clip perfect for testing video playback.',
    duration: 5,
    tags: ['sample', 'test', 'short'],
  },
  {
    filename: 'SampleVideo2.mp4',
    title: 'Quick Clip 2',
    description: 'Ten second video sample for testing purposes.',
    duration: 10,
    tags: ['sample', 'test', 'short'],
  },
  {
    filename: 'SampleVideo3.mp4',
    title: 'Quick Clip 3',
    description: 'Fifteen second video sample with various content.',
    duration: 15,
    tags: ['sample', 'test', 'medium'],
  },
  {
    filename: 'SampleVideo4.mp4',
    title: 'Quick Clip 4',
    description: 'Twenty second video sample showcasing different scenes.',
    duration: 20,
    tags: ['sample', 'test', 'medium'],
  },
  {
    filename: 'SampleVideo5.mp4',
    title: 'Quick Clip 5',
    description: 'Thirty second video sample - the longest quick clip.',
    duration: 30,
    tags: ['sample', 'test', 'long'],
  },
  {
    filename: 'NatureVideo1.mp4',
    title: 'Nature Scene 1',
    description: 'Beautiful nature footage from Big Buck Bunny scenes.',
    duration: 10,
    tags: ['nature', 'animation', '360p'],
  },
  {
    filename: 'NatureVideo2.mp4',
    title: 'Nature Scene 2',
    description: 'More nature footage perfect for a relaxing viewing experience.',
    duration: 10,
    tags: ['nature', 'animation', '360p'],
  },
  {
    filename: 'NatureVideo3.mp4',
    title: 'Jellyfish',
    description: 'Mesmerizing jellyfish floating through the ocean depths.',
    duration: 10,
    tags: ['nature', 'ocean', 'jellyfish', 'relaxing'],
  },
  {
    filename: 'TestVideo1.mp4',
    title: 'Test Pattern 1',
    description: 'Video test pattern for checking playback compatibility.',
    duration: 10,
    tags: ['test', 'pattern', 'w3schools'],
  },
  {
    filename: 'TestVideo2.mp4',
    title: 'Test Pattern 2',
    description: 'Another video test pattern for compatibility testing.',
    duration: 6,
    tags: ['test', 'pattern', 'w3schools'],
  },
];

async function updateLocalVideos() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://exprsn:exprsn@localhost:5432/exprsn';
  const client = postgres(connectionString);
  const db = drizzle(client);

  const apiUrl = process.env.API_URL || 'http://localhost:3002';

  console.log('Updating videos to use local files...\n');

  // Get existing users
  const existingUsers = await db.select().from(users).limit(13);

  if (existingUsers.length === 0) {
    console.error('No users found in database. Please run seed.ts first.');
    process.exit(1);
  }

  console.log(`Found ${existingUsers.length} users.\n`);

  // First, remove old sample videos that used remote URLs
  await db.delete(trendingVideos).where(
    sql`video_uri IN (SELECT uri FROM videos WHERE cdn_url LIKE '%commondatastorage%')`
  );
  await db.delete(videos).where(sql`cdn_url LIKE '%commondatastorage%'`);
  console.log('Removed old sample videos with remote URLs.\n');

  let addedCount = 0;

  for (let i = 0; i < LOCAL_VIDEOS.length; i++) {
    const video = LOCAL_VIDEOS[i];
    const user = existingUsers[i % existingUsers.length];

    const uri = `at://${user.did}/io.exprsn.video.post/local${i + 1}`;
    const cid = `bafyreig${Date.now().toString(36)}local${i.toString(36).padStart(4, '0')}`;
    const cdnUrl = `${apiUrl}/videos/${video.filename}`;

    // Check if video already exists
    const existing = await db.select().from(videos).where(eq(videos.uri, uri)).limit(1);
    if (existing.length > 0) {
      // Update existing
      await db.update(videos).set({ cdnUrl }).where(eq(videos.uri, uri));
      console.log(`  Updated: ${video.title}`);
    } else {
      // Create new
      await db.insert(videos).values({
        uri,
        cid,
        authorDid: user.did,
        caption: `${video.title}\n\n${video.description}`,
        tags: video.tags,
        cdnUrl,
        thumbnailUrl: `https://picsum.photos/seed/${video.filename}/720/1280`,
        duration: video.duration,
        aspectRatio: { width: 16, height: 9 },
        visibility: 'public',
        viewCount: Math.floor(Math.random() * 500000) + 10000,
        likeCount: Math.floor(Math.random() * 50000) + 1000,
        commentCount: Math.floor(Math.random() * 2000) + 50,
        shareCount: Math.floor(Math.random() * 500) + 10,
        createdAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000), // Random time in last 3 days
      });

      console.log(`  Added: ${video.title} (by @${user.handle})`);
      addedCount++;
    }
  }

  // Add all local videos to trending
  console.log('\nAdding local videos to trending...');
  for (let i = 0; i < LOCAL_VIDEOS.length; i++) {
    const user = existingUsers[i % existingUsers.length];
    const uri = `at://${user.did}/io.exprsn.video.post/local${i + 1}`;

    await db.insert(trendingVideos).values({
      videoUri: uri,
      score: 40000 + Math.random() * 30000,
      velocity: 3000 + Math.random() * 2000,
      rank: i + 1,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: trendingVideos.videoUri,
      set: {
        score: sql`EXCLUDED.score`,
        velocity: sql`EXCLUDED.velocity`,
        rank: sql`EXCLUDED.rank`,
        updatedAt: sql`EXCLUDED.updated_at`,
      },
    });
  }

  console.log(`\nAdded ${addedCount} local videos to the database.`);
  console.log(`Videos are served from: ${apiUrl}/videos/`);
  console.log('\nThese videos will now appear in the feed at http://localhost:3001');

  await client.end();
}

updateLocalVideos().catch(console.error);
