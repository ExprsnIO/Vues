import { BrowserOAuthClient } from '@atproto/oauth-client-browser';

const CLIENT_ID =
  process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'https://exprsn.io/client-metadata.json';
const REDIRECT_URI =
  process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || 'https://exprsn.io/oauth/callback';
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

// Session storage keys
const SESSION_KEY = 'exprsn_session';
const USER_KEY = 'exprsn_user';

// =============================================================================
// Local Auth Types
// =============================================================================

export interface LocalUser {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

export interface LocalSession {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
  user?: LocalUser;
}

export interface CertificateData {
  pem: string;
  privateKey: string;
  fingerprint: string;
  validUntil: string;
}

export interface CreateAccountResult extends LocalSession {
  didMethod?: string;
  certificate?: CertificateData;
}

// =============================================================================
// Local Auth Functions
// =============================================================================

export type AccountType = 'personal' | 'creator' | 'business' | 'organization';

/**
 * Create a new local account
 */
export async function createAccount(data: {
  handle: string;
  email: string;
  password: string;
  displayName?: string;
  accountType?: AccountType;
}): Promise<CreateAccountResult> {
  const response = await fetch(`${API_BASE}/xrpc/io.exprsn.auth.createAccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to create account');
  }

  const result = await response.json();
  const session: LocalSession = {
    accessJwt: result.accessJwt,
    refreshJwt: result.refreshJwt,
    did: result.did,
    handle: result.handle,
    user: result.user,
  };

  // Store session
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  if (result.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  }

  // Return result including certificate if present
  return {
    ...session,
    didMethod: result.didMethod,
    certificate: result.certificate,
  };
}

/**
 * Sign in with local account
 */
export async function signInLocal(identifier: string, password: string): Promise<LocalSession> {
  const response = await fetch(`${API_BASE}/xrpc/io.exprsn.auth.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Invalid credentials');
  }

  const result = await response.json();
  const session: LocalSession = {
    accessJwt: result.accessJwt,
    refreshJwt: result.refreshJwt,
    did: result.did,
    handle: result.handle,
    user: result.user,
  };

  // Store session
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  if (result.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
  }

  return session;
}

/**
 * Get stored local session
 */
export function getLocalSession(): LocalSession | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Get stored local user
 */
export function getLocalUser(): LocalUser | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Sign out from local session
 */
export async function signOutLocal(): Promise<void> {
  const session = getLocalSession();

  if (session) {
    try {
      await fetch(`${API_BASE}/xrpc/io.exprsn.auth.deleteSession`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.accessJwt}`,
        },
      });
    } catch {
      // Ignore errors during sign out
    }
  }

  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Refresh local session
 */
export async function refreshLocalSession(): Promise<LocalSession | null> {
  const session = getLocalSession();
  if (!session?.refreshJwt) return null;

  try {
    const response = await fetch(`${API_BASE}/xrpc/io.exprsn.auth.refreshSession`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.refreshJwt}`,
      },
    });

    if (!response.ok) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    const result = await response.json();
    const newSession: LocalSession = {
      accessJwt: result.accessJwt,
      refreshJwt: result.refreshJwt,
      did: result.did,
      handle: result.handle,
      user: session.user,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
    return newSession;
  } catch {
    return null;
  }
}

/**
 * Get access token for API calls
 */
export function getAccessToken(): string | null {
  const session = getLocalSession();
  return session?.accessJwt || null;
}

let oauthClientInstance: BrowserOAuthClient | null = null;

export function getOAuthClient(): BrowserOAuthClient {
  if (!oauthClientInstance) {
    oauthClientInstance = new BrowserOAuthClient({
      clientMetadata: {
        client_id: CLIENT_ID,
        redirect_uris: [REDIRECT_URI],
        scope: 'atproto',
        token_endpoint_auth_method: 'none', // Public client (browser-based)
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        dpop_bound_access_tokens: true,
      },
      handleResolver: 'https://bsky.social',
    });
  }
  return oauthClientInstance;
}

export async function signIn(handle: string): Promise<void> {
  const client = getOAuthClient();
  const url = await client.authorize(handle, {
    scope: 'atproto',
  });
  window.location.href = url.toString();
}

export async function handleOAuthCallback(): Promise<{
  did: string;
  handle: string;
} | null> {
  const client = getOAuthClient();
  const params = new URLSearchParams(window.location.search);

  if (!params.has('code')) {
    return null;
  }

  try {
    const result = await client.callback(params);
    return {
      did: result.session.did,
      handle: result.session.did, // ATProto OAuth doesn't provide handle directly
    };
  } catch (error) {
    console.error('OAuth callback error:', error);
    throw error;
  }
}

export async function getSession() {
  const client = getOAuthClient();
  try {
    const result = await client.init();
    if (result) {
      return {
        did: result.session.did,
        handle: result.session.did, // ATProto OAuth doesn't provide handle directly
        session: result.session,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  const client = getOAuthClient();
  const result = await client.init();
  if (result) {
    await result.session.signOut();
  }
  window.location.href = '/';
}
