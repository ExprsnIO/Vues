import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { nanoid } from 'nanoid';

/**
 * Create a Hono app with proper error handling for tests
 */
export function createTestApp(): Hono {
  const app = new Hono();

  // Error handler that properly formats HTTPException as JSON
  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json(
        { message: err.message },
        err.status
      );
    }
    return c.json(
      { message: err.message || 'Internal server error' },
      500
    );
  });

  return app;
}

/**
 * Create a mock user for testing
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const id = nanoid(8);
  return {
    did: `did:web:test.exprsn.local:user:testuser${id}`,
    handle: `testuser${id}`,
    email: `testuser${id}@test.com`,
    displayName: `Test User ${id}`,
    avatar: null,
    bio: 'Test bio',
    followerCount: 0,
    followingCount: 0,
    videoCount: 0,
    verified: false,
    ...overrides,
  };
}

export interface MockUser {
  did: string;
  handle: string;
  email: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  followerCount: number;
  followingCount: number;
  videoCount: number;
  verified: boolean;
}

/**
 * Create a mock session token
 */
export function createMockToken(did: string): string {
  return `exp_test_${nanoid(32)}`;
}

/**
 * Create mock video data
 */
export function createMockVideo(authorDid: string, overrides: Partial<MockVideo> = {}): MockVideo {
  const id = nanoid(8);
  return {
    uri: `at://${authorDid}/io.exprsn.video.post/${id}`,
    cid: `bafyrei${nanoid(32)}`,
    authorDid,
    caption: 'Test video caption',
    tags: ['test', 'video'],
    videoUrl: `https://cdn.test.com/videos/${id}.mp4`,
    thumbnailUrl: `https://cdn.test.com/thumbnails/${id}.jpg`,
    hlsPlaylist: `https://cdn.test.com/hls/${id}/playlist.m3u8`,
    duration: 30,
    width: 1080,
    height: 1920,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export interface MockVideo {
  uri: string;
  cid: string;
  authorDid: string;
  caption: string;
  tags: string[];
  videoUrl: string;
  thumbnailUrl: string;
  hlsPlaylist: string;
  duration: number;
  width: number;
  height: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: string;
}

/**
 * Create authorization header
 */
export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Helper to make JSON request body
 */
export function jsonBody(data: unknown): { body: string; headers: Record<string, string> } {
  return {
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
  };
}

/**
 * Test request helper
 */
export async function testRequest(
  app: Hono,
  method: string,
  path: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  } = {}
) {
  const url = new URL(`http://localhost${path}`);
  if (options.query) {
    Object.entries(options.query).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const init: RequestInit = {
    method,
    headers: options.headers || {},
  };

  if (options.body) {
    init.body = JSON.stringify(options.body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const req = new Request(url.toString(), init);
  return app.fetch(req);
}
