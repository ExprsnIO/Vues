/**
 * Verify demo data was created for did:exprsn:rickholland
 */

import { db } from '../src/db/index.js';
import { videos, likes, comments, follows, bookmarks, sounds, videoViews, videoHashtags, trendingHashtags, trendingVideos } from '../src/db/schema.js';
import { eq, count } from 'drizzle-orm';

const RICK_DID = 'did:exprsn:rickholland';

async function main() {
  console.log('\n📊 Database Verification for rickholland\n');

  const videoResults = await db
    .select({ count: count() })
    .from(videos)
    .where(eq(videos.authorDid, RICK_DID));

  const likeResults = await db
    .select({ count: count() })
    .from(likes);

  const commentResults = await db
    .select({ count: count() })
    .from(comments);

  const followingResults = await db
    .select({ count: count() })
    .from(follows)
    .where(eq(follows.followerDid, RICK_DID));

  const followersResults = await db
    .select({ count: count() })
    .from(follows)
    .where(eq(follows.followeeDid, RICK_DID));

  const bookmarkResults = await db
    .select({ count: count() })
    .from(bookmarks)
    .where(eq(bookmarks.authorDid, RICK_DID));

  const soundResults = await db
    .select({ count: count() })
    .from(sounds)
    .where(eq(sounds.authorDid, RICK_DID));

  const viewResults = await db
    .select({ count: count() })
    .from(videoViews);

  const hashtagResults = await db
    .select({ count: count() })
    .from(videoHashtags);

  const trendingHashtagResults = await db
    .select({ count: count() })
    .from(trendingHashtags);

  const trendingVideoResults = await db
    .select({ count: count() })
    .from(trendingVideos);

  console.log('  Videos:', videoResults[0]?.count || 0);
  console.log('  Likes (total):', likeResults[0]?.count || 0);
  console.log('  Comments (total):', commentResults[0]?.count || 0);
  console.log('  Following:', followingResults[0]?.count || 0);
  console.log('  Followers:', followersResults[0]?.count || 0);
  console.log('  Bookmarks:', bookmarkResults[0]?.count || 0);
  console.log('  Sounds:', soundResults[0]?.count || 0);
  console.log('  Video Views (total):', viewResults[0]?.count || 0);
  console.log('  Video Hashtags (total):', hashtagResults[0]?.count || 0);
  console.log('  Trending Hashtags:', trendingHashtagResults[0]?.count || 0);
  console.log('  Trending Videos:', trendingVideoResults[0]?.count || 0);
  console.log('');

  // Get a sample video
  const sampleVideos = await db
    .select()
    .from(videos)
    .where(eq(videos.authorDid, RICK_DID))
    .limit(3);

  if (sampleVideos.length > 0) {
    console.log('Sample Videos:');
    for (const video of sampleVideos) {
      console.log(`  - ${video.caption?.substring(0, 50)}...`);
      console.log(`    Views: ${video.viewCount}, Likes: ${video.likeCount}, Comments: ${video.commentCount}`);
    }
    console.log('');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
