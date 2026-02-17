import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db, actorRepos, users, sessions } from '../db/index.js';

export const authRouter = new Hono();

// Domain for DID generation
const PDS_DOMAIN = process.env.PDS_DOMAIN || 'exprsn.local';

/**
 * Generate a did:web identifier
 */
function generateDid(handle: string): string {
  // Format: did:web:domain:user:handle
  const safeHandle = handle.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return `did:web:${PDS_DOMAIN}:user:${safeHandle}`;
}

/**
 * Generate ECDSA P-256 key pair for signing
 */
async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicKeyRaw = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyRaw = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: Buffer.from(publicKeyRaw).toString('base64'),
    privateKey: Buffer.from(privateKeyRaw).toString('base64'),
  };
}

/**
 * Generate JWT-like session tokens
 */
function generateTokens(): { accessToken: string; refreshToken: string } {
  return {
    accessToken: `exp_${nanoid(32)}`,
    refreshToken: `ref_${nanoid(48)}`,
  };
}

/**
 * Validate handle format
 */
function validateHandle(handle: string): { valid: boolean; error?: string; normalized?: string } {
  // Handle must be 3-20 characters, alphanumeric and underscores only
  const normalized = handle.toLowerCase().trim();

  if (normalized.length < 3) {
    return { valid: false, error: 'Handle must be at least 3 characters' };
  }

  if (normalized.length > 20) {
    return { valid: false, error: 'Handle must be at most 20 characters' };
  }

  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return { valid: false, error: 'Handle can only contain letters, numbers, and underscores' };
  }

  if (normalized.startsWith('_') || normalized.endsWith('_')) {
    return { valid: false, error: 'Handle cannot start or end with underscore' };
  }

  // Reserved handles
  const reserved = ['admin', 'api', 'app', 'auth', 'root', 'system', 'exprsn', 'support', 'help'];
  if (reserved.includes(normalized)) {
    return { valid: false, error: 'This handle is reserved' };
  }

  return { valid: true, normalized };
}

/**
 * Validate email format
 */
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// =============================================================================
// Sign Up
// =============================================================================

/**
 * Create a new account
 * POST /xrpc/io.exprsn.auth.createAccount
 */
authRouter.post('/io.exprsn.auth.createAccount', async (c) => {
  const body = await c.req.json<{
    handle: string;
    email: string;
    password: string;
    displayName?: string;
  }>();

  // Validate required fields
  if (!body.handle || !body.email || !body.password) {
    throw new HTTPException(400, {
      message: 'Missing required fields: handle, email, password',
    });
  }

  // Validate handle
  const handleValidation = validateHandle(body.handle);
  if (!handleValidation.valid) {
    throw new HTTPException(400, { message: handleValidation.error });
  }

  // Validate email
  if (!validateEmail(body.email)) {
    throw new HTTPException(400, { message: 'Invalid email format' });
  }

  // Validate password
  if (body.password.length < 8) {
    throw new HTTPException(400, { message: 'Password must be at least 8 characters' });
  }

  const handle = handleValidation.normalized!;

  // Check if handle exists in actor_repos
  const existingHandle = await db.query.actorRepos.findFirst({
    where: eq(actorRepos.handle, handle),
  });

  if (existingHandle) {
    throw new HTTPException(400, { message: 'Handle already taken' });
  }

  // Check if email exists
  const existingEmail = await db.query.actorRepos.findFirst({
    where: eq(actorRepos.email, body.email.toLowerCase()),
  });

  if (existingEmail) {
    throw new HTTPException(400, { message: 'Email already registered' });
  }

  // Generate DID and keys
  const did = generateDid(handle);
  const { publicKey, privateKey } = await generateKeyPair();
  const passwordHash = await bcrypt.hash(body.password, 10);

  // Generate session tokens
  const { accessToken, refreshToken } = generateTokens();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create account in actor_repos
  await db.insert(actorRepos).values({
    did,
    handle,
    email: body.email.toLowerCase(),
    passwordHash,
    signingKeyPublic: publicKey,
    signingKeyPrivate: privateKey,
    status: 'active',
  });

  // Also create in users table for app functionality
  await db.insert(users).values({
    did,
    handle,
    displayName: body.displayName || handle,
    avatar: null,
    bio: null,
  });

  // Create session
  await db.insert(sessions).values({
    id: nanoid(),
    did,
    accessJwt: accessToken,
    refreshJwt: refreshToken,
    expiresAt,
  });

  return c.json({
    success: true,
    accessJwt: accessToken,
    refreshJwt: refreshToken,
    handle,
    did,
    user: {
      did,
      handle,
      displayName: body.displayName || handle,
      avatar: null,
    },
  });
});

// =============================================================================
// Sign In
// =============================================================================

/**
 * Login with existing account
 * POST /xrpc/io.exprsn.auth.createSession
 */
authRouter.post('/io.exprsn.auth.createSession', async (c) => {
  const body = await c.req.json<{
    identifier: string; // handle or email
    password: string;
  }>();

  if (!body.identifier || !body.password) {
    throw new HTTPException(400, {
      message: 'Missing required fields: identifier, password',
    });
  }

  const identifier = body.identifier.toLowerCase().trim();

  // Find account by handle or email
  let account = await db.query.actorRepos.findFirst({
    where: eq(actorRepos.handle, identifier),
  });

  if (!account) {
    account = await db.query.actorRepos.findFirst({
      where: eq(actorRepos.email, identifier),
    });
  }

  if (!account) {
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  // Verify password
  const valid = await bcrypt.compare(body.password, account.passwordHash || '');
  if (!valid) {
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  // Check account status
  if (account.status !== 'active') {
    throw new HTTPException(403, { message: 'Account is not active' });
  }

  // Generate new session tokens
  const { accessToken, refreshToken } = generateTokens();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create session
  await db.insert(sessions).values({
    id: nanoid(),
    did: account.did,
    accessJwt: accessToken,
    refreshJwt: refreshToken,
    expiresAt,
  });

  // Get user profile
  const user = await db.query.users.findFirst({
    where: eq(users.did, account.did),
  });

  return c.json({
    success: true,
    accessJwt: accessToken,
    refreshJwt: refreshToken,
    handle: account.handle,
    did: account.did,
    email: account.email,
    user: user ? {
      did: user.did,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
    } : null,
  });
});

// =============================================================================
// Get Session
// =============================================================================

/**
 * Get current session info
 * GET /xrpc/io.exprsn.auth.getSession
 */
authRouter.get('/io.exprsn.auth.getSession', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Not authenticated' });
  }

  const accessToken = auth.slice(7);

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.accessJwt, accessToken),
  });

  if (!session || session.expiresAt < new Date()) {
    throw new HTTPException(401, { message: 'Invalid or expired session' });
  }

  // Get account
  const account = await db.query.actorRepos.findFirst({
    where: eq(actorRepos.did, session.did),
  });

  if (!account) {
    throw new HTTPException(401, { message: 'Account not found' });
  }

  // Get user profile
  const user = await db.query.users.findFirst({
    where: eq(users.did, session.did),
  });

  return c.json({
    handle: account.handle,
    did: account.did,
    email: account.email,
    user: user ? {
      did: user.did,
      handle: user.handle,
      displayName: user.displayName,
      avatar: user.avatar,
      bio: user.bio,
      followerCount: user.followerCount,
      followingCount: user.followingCount,
      videoCount: user.videoCount,
      verified: user.verified,
    } : null,
  });
});

// =============================================================================
// Refresh Session
// =============================================================================

/**
 * Refresh access token
 * POST /xrpc/io.exprsn.auth.refreshSession
 */
authRouter.post('/io.exprsn.auth.refreshSession', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing refresh token' });
  }

  const refreshToken = auth.slice(7);

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.refreshJwt, refreshToken),
  });

  if (!session) {
    throw new HTTPException(401, { message: 'Invalid refresh token' });
  }

  // Get account
  const account = await db.query.actorRepos.findFirst({
    where: eq(actorRepos.did, session.did),
  });

  if (!account) {
    throw new HTTPException(401, { message: 'Account not found' });
  }

  // Delete old session
  await db.delete(sessions).where(eq(sessions.id, session.id));

  // Generate new tokens
  const { accessToken: newAccessToken, refreshToken: newRefreshToken } = generateTokens();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create new session
  await db.insert(sessions).values({
    id: nanoid(),
    did: account.did,
    accessJwt: newAccessToken,
    refreshJwt: newRefreshToken,
    expiresAt,
  });

  return c.json({
    accessJwt: newAccessToken,
    refreshJwt: newRefreshToken,
    handle: account.handle,
    did: account.did,
  });
});

// =============================================================================
// Delete Session (Logout)
// =============================================================================

/**
 * Logout / delete session
 * POST /xrpc/io.exprsn.auth.deleteSession
 */
authRouter.post('/io.exprsn.auth.deleteSession', async (c) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Not authenticated' });
  }

  const accessToken = auth.slice(7);

  await db.delete(sessions).where(eq(sessions.accessJwt, accessToken));

  return c.json({ success: true });
});
