import { BrowserOAuthClient } from '@atproto/oauth-client-browser';

const CLIENT_ID =
  process.env.NEXT_PUBLIC_OAUTH_CLIENT_ID || 'https://exprsn.io/client-metadata.json';
const REDIRECT_URI =
  process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI || 'https://exprsn.io/oauth/callback';

let oauthClientInstance: BrowserOAuthClient | null = null;

export function getOAuthClient(): BrowserOAuthClient {
  if (!oauthClientInstance) {
    oauthClientInstance = new BrowserOAuthClient({
      clientMetadata: {
        client_id: CLIENT_ID,
        redirect_uris: [REDIRECT_URI],
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
    const session = await client.callback(params);
    return {
      did: session.did,
      handle: session.handle || session.did,
    };
  } catch (error) {
    console.error('OAuth callback error:', error);
    throw error;
  }
}

export async function getSession() {
  const client = getOAuthClient();
  try {
    const session = await client.init();
    if (session) {
      return {
        did: session.did,
        handle: session.handle || session.did,
        agent: session,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function signOut(): Promise<void> {
  const client = getOAuthClient();
  const session = await client.init();
  if (session) {
    await session.signOut();
  }
  window.location.href = '/';
}
