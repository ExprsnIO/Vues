/**
 * Feed Optimization Tests
 *
 * These tests verify that the N+1 query optimizations work correctly
 * and that feed endpoints return the expected data structure.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { testClient } from 'hono/testing';
import { feedRouter } from '../feed.js';
import { db, users, videos, likes, reposts, bookmarks, follows, challenges, challengeEntries } from '../../db/index.js';
import { eq, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';

describe('Feed Optimization Tests', () => {
  const testUserDid = `did:plc:${nanoid()}`;
  const testUser2Did = `did:plc:${nanoid()}`;
  const testVideoUris: string[] = [];

  beforeAll(async () => {
    // Create test users
    await db.insert(users).values([
      {
        did: testUserDid,
        handle: 'testuser.test',
        displayName: 'Test User',
        avatar: 'https://example.com/avatar.jpg',
        verified: true,
      },
      {
        did: testUser2Did,
        handle: 'testuser2.test',
        displayName: 'Test User 2',
        avatar: 'https://example.com/avatar2.jpg',
        verified: false,
      },
    ]);

    // Create test videos
    const videoPromises = [];
    for (let i = 0; i < 20; i++) {
      const videoUri = `at://${testUser2Did}/video/${nanoid()}`;
      testVideoUris.push(videoUri);

      videoPromises.push(
        db.insert(videos).values({
          uri: videoUri,
          cid: nanoid(),
          authorDid: testUser2Did,
          caption: `Test video ${i + 1}`,
          tags: ['test', `tag${i % 5}`],
          thumbnailUrl: `https://example.com/thumb${i}.jpg`,
          cdnUrl: `https://example.com/video${i}.mp4`,
          duration: 15 + i,
          aspectRatio: { width: 9, height: 16 },
          viewCount: 100 + i * 10,
          likeCount: 10 + i,
          commentCount: 5 + i,
          shareCount: 2 + i,
          visibility: 'public',
          moderationStatus: 'approved',
          createdAt: new Date(Date.now() - i * 60000), // Stagger by 1 minute
        })
      );
    }
    await Promise.all(videoPromises);

    // Create test follow relationship
    await db.insert(follows).values({
      uri: `at://${testUserDid}/follow/${nanoid()}`,
      cid: nanoid(),
      followerDid: testUserDid,
      followeeDid: testUser2Did,
      createdAt: new Date(),
    });

    // Create test engagement
    if (testVideoUris[0]) {
      await db.insert(likes).values({
        uri: `at://${testUserDid}/like/${nanoid()}`,
        cid: nanoid(),
        videoUri: testVideoUris[0],
        authorDid: testUserDid,
        createdAt: new Date(),
      });
    }

    if (testVideoUris[1]) {
      await db.insert(reposts).values({
        uri: `at://${testUserDid}/repost/${nanoid()}`,
        cid: nanoid(),
        videoUri: testVideoUris[1],
        authorDid: testUserDid,
        createdAt: new Date(),
      });
    }

    if (testVideoUris[2]) {
      await db.insert(bookmarks).values({
        uri: `at://${testUserDid}/bookmark/${nanoid()}`,
        cid: nanoid(),
        videoUri: testVideoUris[2],
        authorDid: testUserDid,
        createdAt: new Date(),
      });
    }
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(bookmarks).where(eq(bookmarks.authorDid, testUserDid));
    await db.delete(reposts).where(eq(reposts.authorDid, testUserDid));
    await db.delete(likes).where(eq(likes.authorDid, testUserDid));
    await db.delete(follows).where(eq(follows.followerDid, testUserDid));
    await db.delete(videos).where(eq(videos.authorDid, testUser2Did));
    await db.delete(users).where(or(eq(users.did, testUserDid), eq(users.did, testUser2Did)));
  });

  describe('Timeline Feed', () => {
    it('should return timeline with proper structure', async () => {
      const client = testClient(feedRouter);

      // Mock auth middleware by setting did in context
      const res = await client['io.exprsn.feed.getTimeline'].$get(
        { query: { limit: '10' } },
        {
          headers: {
            'x-test-did': testUserDid // This would come from auth middleware
          }
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('feed');
      expect(data).toHaveProperty('cursor');
      expect(Array.isArray(data.feed)).toBe(true);

      if (data.feed.length > 0) {
        const firstItem = data.feed[0];
        expect(firstItem).toHaveProperty('post');
        expect(firstItem.post).toHaveProperty('uri');
        expect(firstItem.post).toHaveProperty('author');
        expect(firstItem.post).toHaveProperty('video');
        expect(firstItem.post).toHaveProperty('viewCount');
        expect(firstItem.post).toHaveProperty('likeCount');

        // Check viewer engagement is included
        expect(firstItem.post).toHaveProperty('viewer');
        if (firstItem.post.viewer) {
          expect(firstItem.post.viewer).toHaveProperty('liked');
          expect(firstItem.post.viewer).toHaveProperty('reposted');
          expect(firstItem.post.viewer).toHaveProperty('bookmarked');
        }
      }
    });

    it('should batch fetch authors and engagement data', async () => {
      // This test verifies that we're not making N+1 queries
      // by checking that the response time is reasonable for multiple videos
      const client = testClient(feedRouter);
      const startTime = Date.now();

      const res = await client['io.exprsn.feed.getTimeline'].$get(
        { query: { limit: '20' } },
        { headers: { 'x-test-did': testUserDid } }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(res.status).toBe(200);
      const data = await res.json();

      // Should return videos
      expect(data.feed.length).toBeGreaterThan(0);

      // Should complete reasonably fast (< 500ms for 20 videos with batched queries)
      // If this was N+1, it would take much longer
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Actor Likes Feed', () => {
    it('should return liked videos with proper structure', async () => {
      const client = testClient(feedRouter);

      const res = await client['io.exprsn.feed.getActorLikes'].$get(
        { query: { did: testUserDid, limit: '10' } }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('feed');
      expect(Array.isArray(data.feed)).toBe(true);

      // Should include the video we liked in beforeAll
      expect(data.feed.length).toBeGreaterThanOrEqual(1);

      const firstVideo = data.feed[0];
      expect(firstVideo).toHaveProperty('uri');
      expect(firstVideo).toHaveProperty('author');
      expect(firstVideo.author).toHaveProperty('did');
      expect(firstVideo.author).toHaveProperty('handle');
    });
  });

  describe('Actor Feed', () => {
    it('should return posts and reposts with proper structure', async () => {
      const client = testClient(feedRouter);

      const res = await client['io.exprsn.feed.getActorFeed'].$get(
        {
          query: {
            did: testUser2Did,
            filter: 'posts_and_reposts',
            limit: '10'
          }
        }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('feed');
      expect(Array.isArray(data.feed)).toBe(true);

      if (data.feed.length > 0) {
        const firstItem = data.feed[0];
        expect(firstItem).toHaveProperty('post');

        // May have a repost reason
        if (firstItem.reason) {
          expect(firstItem.reason).toHaveProperty('$type');
          expect(firstItem.reason).toHaveProperty('by');
        }
      }
    });
  });

  describe('Suggested Feed', () => {
    it('should return suggested videos for anonymous users', async () => {
      const client = testClient(feedRouter);

      const res = await client['io.exprsn.feed.getSuggestedFeed'].$get(
        { query: { limit: '10' } }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('feed');
      expect(data).toHaveProperty('_meta');
      expect(data._meta).toHaveProperty('personalized');
      expect(data._meta.personalized).toBe(false);
    });

    it('should return personalized feed for authenticated users', async () => {
      const client = testClient(feedRouter);

      const res = await client['io.exprsn.feed.getSuggestedFeed'].$get(
        { query: { limit: '10' } },
        { headers: { 'x-test-did': testUserDid } }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('feed');
      expect(data).toHaveProperty('_meta');
      // Should use personalization for authenticated users
      expect(data._meta).toHaveProperty('personalized');
    });
  });

  describe('Explore Feed', () => {
    it('should return diverse trending content', async () => {
      const client = testClient(feedRouter);

      const res = await client['io.exprsn.feed.getExplore'].$get(
        { query: { limit: '10' } }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('feed');
      expect(data).toHaveProperty('_meta');
      expect(data._meta).toHaveProperty('uniqueTags');

      // Should ensure diversity (max 2 per author)
      if (data.feed.length > 2) {
        const authorCounts = new Map();
        for (const video of data.feed) {
          const count = authorCounts.get(video.author.did) || 0;
          authorCounts.set(video.author.did, count + 1);
        }

        // No author should have more than 2 videos
        for (const count of authorCounts.values()) {
          expect(count).toBeLessThanOrEqual(2);
        }
      }
    });
  });

  describe('Following Blend Feed', () => {
    it('should blend following and discovery content', async () => {
      const client = testClient(feedRouter);

      const res = await client['io.exprsn.feed.getFollowingBlend'].$get(
        { query: { limit: '12' } },
        { headers: { 'x-test-did': testUserDid } }
      );

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('feed');
      expect(data).toHaveProperty('_meta');
      expect(data._meta).toHaveProperty('followingCount');
      expect(data._meta).toHaveProperty('discoveryCount');

      // Should contain both following and discovery
      const sources = data.feed.map((item: any) => item._source);
      const hasFollowing = sources.includes('following');
      const hasDiscovery = sources.includes('discovery');

      // At least one source type should be present
      expect(hasFollowing || hasDiscovery).toBe(true);
    });
  });

  describe('Challenge Feed', () => {
    it('should return challenges with top entries efficiently', async () => {
      // Create test challenge
      const challengeId = nanoid();
      await db.insert(challenges).values({
        id: challengeId,
        name: 'Test Challenge',
        description: 'A test challenge',
        hashtag: 'testchallenge',
        status: 'active',
        participantCount: 3,
        startAt: new Date(Date.now() - 86400000),
        endAt: new Date(Date.now() + 86400000),
        prizes: { first: '$100' },
      });

      // Create challenge entries
      for (let i = 0; i < 3; i++) {
        const videoUri = testVideoUris[i];
        if (videoUri) {
          await db.insert(challengeEntries).values({
            id: nanoid(),
            challengeId,
            videoUri,
            participantDid: testUser2Did,
            engagementScore: 100 - i * 10,
            rank: i + 1,
          });
        }
      }

      const client = testClient(feedRouter);
      const startTime = Date.now();

      const res = await client['io.exprsn.feed.getChallenges'].$get(
        { query: { limit: '10' } }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data).toHaveProperty('challenges');
      expect(Array.isArray(data.challenges)).toBe(true);

      if (data.challenges.length > 0) {
        const firstChallenge = data.challenges[0];
        expect(firstChallenge).toHaveProperty('challenge');
        expect(firstChallenge).toHaveProperty('entries');
        expect(Array.isArray(firstChallenge.entries)).toBe(true);

        // Should have max 3 entries per challenge
        expect(firstChallenge.entries.length).toBeLessThanOrEqual(3);

        if (firstChallenge.entries.length > 0) {
          const firstEntry = firstChallenge.entries[0];
          expect(firstEntry).toHaveProperty('entry');
          expect(firstEntry).toHaveProperty('video');
          expect(firstEntry.video).toHaveProperty('author');
        }
      }

      // Should complete efficiently with batched queries
      // Even with multiple challenges and entries
      expect(duration).toBeLessThan(500);

      // Cleanup
      await db.delete(challengeEntries).where(eq(challengeEntries.challengeId, challengeId));
      await db.delete(challenges).where(eq(challenges.id, challengeId));
    });
  });

  describe('Cursor Pagination', () => {
    it('should handle cursor pagination correctly', async () => {
      const client = testClient(feedRouter);

      // Get first page
      const firstRes = await client['io.exprsn.feed.getTimeline'].$get(
        { query: { limit: '5' } },
        { headers: { 'x-test-did': testUserDid } }
      );

      expect(firstRes.status).toBe(200);
      const firstData = await firstRes.json();

      if (firstData.cursor) {
        // Get second page with cursor
        const secondRes = await client['io.exprsn.feed.getTimeline'].$get(
          { query: { limit: '5', cursor: firstData.cursor } },
          { headers: { 'x-test-did': testUserDid } }
        );

        expect(secondRes.status).toBe(200);
        const secondData = await secondRes.json();

        // Should return different videos
        const firstUris = new Set(firstData.feed.map((item: any) => item.post.uri));
        const secondUris = new Set(secondData.feed.map((item: any) => item.post.uri));

        // No overlap between pages
        for (const uri of secondUris) {
          expect(firstUris.has(uri)).toBe(false);
        }
      }
    });
  });
});
