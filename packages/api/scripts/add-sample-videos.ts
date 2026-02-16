/**
 * Add sample videos from test streams to the database
 * Source: https://gist.github.com/jsturgis/3b19447b304616f18657
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { users, videos } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const SAMPLE_VIDEOS = [
  {
    title: 'Big Buck Bunny',
    description: 'Big Buck Bunny tells the story of a giant rabbit with a heart bigger than himself.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    duration: 596,
  },
  {
    title: 'Elephant Dream',
    description: 'The first Blender Open Movie from 2006.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg',
    duration: 653,
  },
  {
    title: 'For Bigger Blazes',
    description: 'HBO GO now icons Notes Notes and icons for Notes Notes.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg',
    duration: 15,
  },
  {
    title: 'For Bigger Escape',
    description: 'Introducing Chromecast. The easiest way to enjoy online video and music on your TV.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerEscapes.jpg',
    duration: 15,
  },
  {
    title: 'For Bigger Fun',
    description: 'Introducing Chromecast. The easiest way to enjoy online video and music on your TV.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerFun.jpg',
    duration: 60,
  },
  {
    title: 'For Bigger Joyrides',
    description: 'Introducing Chromecast. The easiest way to enjoy online video and music on your TV.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerJoyrides.jpg',
    duration: 15,
  },
  {
    title: 'For Bigger Meltdowns',
    description: 'Introducing Chromecast. The easiest way to enjoy online video and music on your TV.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerMeltdowns.jpg',
    duration: 15,
  },
  {
    title: 'Sintel',
    description: 'Sintel is an independently produced short film by the Blender Foundation.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg',
    duration: 888,
  },
  {
    title: 'Subaru Outback On Street And Dirt',
    description: 'Subaru Outback - Car and Driver.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/SubaruOutbackOnStreetAndDirt.jpg',
    duration: 594,
  },
  {
    title: 'Tears of Steel',
    description: 'Tears of Steel was realized with crowd-funding by the Blender Foundation.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/TearsOfSteel.jpg',
    duration: 734,
  },
  {
    title: 'Volkswagen GTI Review',
    description: 'The Smoking Tire heads out to 2014 World Cup semi-final.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/VolkswagenGTIReview.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/VolkswagenGTIReview.jpg',
    duration: 120,
  },
  {
    title: 'We Are Going On Bullrun',
    description: 'We Are Going On Bullrun adventure.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/WeAreGoingOnBullrun.jpg',
    duration: 120,
  },
  {
    title: 'What care about',
    description: 'What care about - film excerpt.',
    url: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
    thumbnail: 'http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/WhatCarCanYouGetForAGrand.jpg',
    duration: 120,
  },
];

async function addSampleVideos() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://exprsn:exprsn@localhost:5432/exprsn';
  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log('Adding sample videos from test streams...\n');

  // Get existing users to assign videos to
  const existingUsers = await db.select().from(users).limit(10);

  if (existingUsers.length === 0) {
    console.error('No users found in database. Please run seed.ts first.');
    process.exit(1);
  }

  console.log(`Found ${existingUsers.length} users to assign videos to.\n`);

  let addedCount = 0;

  for (let i = 0; i < SAMPLE_VIDEOS.length; i++) {
    const video = SAMPLE_VIDEOS[i];
    const user = existingUsers[i % existingUsers.length];

    const uri = `at://${user.did}/io.exprsn.video.post/sample${i + 1}`;
    const cid = `bafyreig${Date.now().toString(36)}${i.toString(36).padStart(4, '0')}`;

    // Check if video already exists
    const existing = await db.select().from(videos).where(eq(videos.uri, uri)).limit(1);
    if (existing.length > 0) {
      console.log(`  Video "${video.title}" already exists, skipping.`);
      continue;
    }

    await db.insert(videos).values({
      uri,
      cid,
      authorDid: user.did,
      caption: `${video.title}\n\n${video.description}`,
      tags: ['sample', 'test', 'blender', 'creative-commons'],
      cdnUrl: video.url,
      thumbnailUrl: video.thumbnail,
      duration: video.duration,
      aspectRatio: { width: 16, height: 9 },
      visibility: 'public',
      viewCount: Math.floor(Math.random() * 100000) + 1000,
      likeCount: Math.floor(Math.random() * 10000) + 100,
      commentCount: Math.floor(Math.random() * 500) + 10,
      shareCount: Math.floor(Math.random() * 200) + 5,
      createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random time in last 7 days
    });

    console.log(`  Added: ${video.title} (by @${user.handle})`);
    addedCount++;
  }

  console.log(`\nAdded ${addedCount} sample videos to the database.`);
  console.log('These videos will now appear in the feed at http://localhost:3001');

  await client.end();
}

addSampleVideos().catch(console.error);
