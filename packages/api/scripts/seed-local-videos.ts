/**
 * Seed database with only the locally downloaded videos
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users, videos, trendingVideos } from '../src/db/schema.js';
import { sql } from 'drizzle-orm';

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

async function seedLocalVideos() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://exprsn:exprsn@localhost:5432/exprsn';
  const client = postgres(connectionString);
  const db = drizzle(client);

  const apiUrl = process.env.API_URL || 'http://localhost:3002';

  console.log('Seeding database with local videos only...\n');

  // Get existing users
  const existingUsers = await db.select().from(users).limit(13);

  if (existingUsers.length === 0) {
    console.error('No users found in database. Please run seed.ts first.');
    process.exit(1);
  }

  console.log(`Found ${existingUsers.length} users.\n`);

  for (let i = 0; i < LOCAL_VIDEOS.length; i++) {
    const video = LOCAL_VIDEOS[i];
    const user = existingUsers[i % existingUsers.length];

    const uri = `at://${user.did}/io.exprsn.video.post/local${i + 1}`;
    const cid = `bafyreig${Date.now().toString(36)}local${i.toString(36).padStart(4, '0')}`;
    const cdnUrl = `${apiUrl}/videos/${video.filename}`;

    // Insert video
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
      createdAt: new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000),
    });

    // Add to trending
    await db.insert(trendingVideos).values({
      videoUri: uri,
      score: 50000 - (i * 1000) + Math.random() * 5000,
      velocity: 3000 + Math.random() * 2000,
      rank: i + 1,
      updatedAt: new Date(),
    });

    console.log(`  Added: ${video.title} (by @${user.handle})`);
  }

  console.log(`\nSeeded ${LOCAL_VIDEOS.length} local videos.`);
  console.log(`Videos served from: ${apiUrl}/videos/`);

  await client.end();
}

seedLocalVideos().catch(console.error);
