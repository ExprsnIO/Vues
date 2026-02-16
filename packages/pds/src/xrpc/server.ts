import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { generateDidWeb, generateDidDocument, DidWebConfig } from '../identity/did.js';
import { validateHandleForRegistration } from '../identity/handle.js';

/**
 * PDS server configuration
 */
export interface PdsServerConfig {
  /** Domain name */
  domain: string;
  /** PDS service endpoint */
  serviceEndpoint: string;
  /** Available user domains */
  availableUserDomains: string[];
  /** Require invite codes */
  inviteCodeRequired: boolean;
  /** Require phone verification */
  phoneVerificationRequired: boolean;
  /** Terms of service URL */
  termsOfServiceUrl?: string;
  /** Privacy policy URL */
  privacyPolicyUrl?: string;
}

/**
 * Account store interface
 */
export interface AccountStore {
  createAccount(params: {
    did: string;
    handle: string;
    email: string;
    passwordHash: string;
    signingKeyPublic: string;
    signingKeyPrivate: string;
  }): Promise<void>;

  getAccountByHandle(handle: string): Promise<{
    did: string;
    handle: string;
    email: string;
    passwordHash: string;
  } | null>;

  getAccountByDid(did: string): Promise<{
    did: string;
    handle: string;
    email: string;
  } | null>;

  handleExists(handle: string): Promise<boolean>;
  emailExists(email: string): Promise<boolean>;
}

/**
 * Session store interface
 */
export interface SessionStore {
  createSession(did: string): Promise<{
    accessJwt: string;
    refreshJwt: string;
  }>;

  validateAccessToken(token: string): Promise<{ did: string } | null>;
  validateRefreshToken(token: string): Promise<{ did: string } | null>;
  deleteSession(did: string, token: string): Promise<void>;
}

/**
 * Create server XRPC router
 */
export function createServerRouter(
  config: PdsServerConfig,
  accountStore: AccountStore,
  sessionStore: SessionStore,
  hashPassword: (password: string) => Promise<string>,
  verifyPassword: (password: string, hash: string) => Promise<boolean>,
  generateKeyPair: () => Promise<{ publicKey: string; privateKey: string }>
) {
  const router = new Hono();

  /**
   * GET com.atproto.server.describeServer
   * Returns server description and capabilities
   */
  router.get('/com.atproto.server.describeServer', (c) => {
    const did = generateDidWeb(config.domain);

    return c.json({
      did,
      availableUserDomains: config.availableUserDomains,
      inviteCodeRequired: config.inviteCodeRequired,
      phoneVerificationRequired: config.phoneVerificationRequired,
      links: {
        termsOfService: config.termsOfServiceUrl,
        privacyPolicy: config.privacyPolicyUrl,
      },
    });
  });

  /**
   * POST com.atproto.server.createAccount
   * Create a new account
   */
  router.post('/com.atproto.server.createAccount', async (c) => {
    const body = await c.req.json<{
      handle: string;
      email: string;
      password: string;
      inviteCode?: string;
    }>();

    // Validate required fields
    if (!body.handle || !body.email || !body.password) {
      throw new HTTPException(400, {
        message: 'Missing required fields: handle, email, password',
      });
    }

    // Validate handle
    const handleValidation = validateHandleForRegistration(body.handle, config.domain);
    if (!handleValidation.valid) {
      throw new HTTPException(400, {
        message: handleValidation.error || 'Invalid handle',
      });
    }

    // Check if handle exists
    if (await accountStore.handleExists(body.handle)) {
      throw new HTTPException(400, {
        message: 'Handle already taken',
      });
    }

    // Check if email exists
    if (await accountStore.emailExists(body.email)) {
      throw new HTTPException(400, {
        message: 'Email already registered',
      });
    }

    // Generate DID
    const did = generateDidWeb(config.domain, 'user', body.handle.split('.')[0]);

    // Generate key pair
    const { publicKey, privateKey } = await generateKeyPair();

    // Hash password
    const passwordHash = await hashPassword(body.password);

    // Create account
    await accountStore.createAccount({
      did,
      handle: handleValidation.normalized!,
      email: body.email,
      passwordHash,
      signingKeyPublic: publicKey,
      signingKeyPrivate: privateKey,
    });

    // Create session
    const { accessJwt, refreshJwt } = await sessionStore.createSession(did);

    // Generate DID document
    const didConfig: DidWebConfig = {
      domain: config.domain,
      pdsEndpoint: config.serviceEndpoint,
    };
    const didDoc = generateDidDocument(did, publicKey, didConfig, body.handle);

    return c.json({
      accessJwt,
      refreshJwt,
      handle: handleValidation.normalized,
      did,
      didDoc,
    });
  });

  /**
   * POST com.atproto.server.createSession
   * Login and create session
   */
  router.post('/com.atproto.server.createSession', async (c) => {
    const body = await c.req.json<{
      identifier: string; // handle or email
      password: string;
    }>();

    if (!body.identifier || !body.password) {
      throw new HTTPException(400, {
        message: 'Missing required fields: identifier, password',
      });
    }

    // Find account
    const account = await accountStore.getAccountByHandle(body.identifier);
    if (!account) {
      throw new HTTPException(401, {
        message: 'Invalid identifier or password',
      });
    }

    // Verify password
    const valid = await verifyPassword(body.password, account.passwordHash);
    if (!valid) {
      throw new HTTPException(401, {
        message: 'Invalid identifier or password',
      });
    }

    // Create session
    const { accessJwt, refreshJwt } = await sessionStore.createSession(account.did);

    return c.json({
      accessJwt,
      refreshJwt,
      handle: account.handle,
      did: account.did,
      email: account.email,
    });
  });

  /**
   * POST com.atproto.server.refreshSession
   * Refresh access token
   */
  router.post('/com.atproto.server.refreshSession', async (c) => {
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing refresh token' });
    }

    const refreshToken = auth.slice(7);
    const session = await sessionStore.validateRefreshToken(refreshToken);

    if (!session) {
      throw new HTTPException(401, { message: 'Invalid refresh token' });
    }

    const account = await accountStore.getAccountByDid(session.did);
    if (!account) {
      throw new HTTPException(401, { message: 'Account not found' });
    }

    // Create new session
    const { accessJwt, refreshJwt } = await sessionStore.createSession(session.did);

    return c.json({
      accessJwt,
      refreshJwt,
      handle: account.handle,
      did: account.did,
    });
  });

  /**
   * GET com.atproto.server.getSession
   * Get current session info
   */
  router.get('/com.atproto.server.getSession', async (c) => {
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing access token' });
    }

    const accessToken = auth.slice(7);
    const session = await sessionStore.validateAccessToken(accessToken);

    if (!session) {
      throw new HTTPException(401, { message: 'Invalid access token' });
    }

    const account = await accountStore.getAccountByDid(session.did);
    if (!account) {
      throw new HTTPException(401, { message: 'Account not found' });
    }

    return c.json({
      handle: account.handle,
      did: account.did,
      email: account.email,
    });
  });

  /**
   * POST com.atproto.server.deleteSession
   * Logout / delete session
   */
  router.post('/com.atproto.server.deleteSession', async (c) => {
    const auth = c.req.header('Authorization');
    if (!auth?.startsWith('Bearer ')) {
      throw new HTTPException(401, { message: 'Missing access token' });
    }

    const accessToken = auth.slice(7);
    const session = await sessionStore.validateAccessToken(accessToken);

    if (!session) {
      throw new HTTPException(401, { message: 'Invalid access token' });
    }

    await sessionStore.deleteSession(session.did, accessToken);

    return c.json({ success: true });
  });

  return router;
}
