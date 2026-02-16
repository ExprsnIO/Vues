import { NodeOAuthClient, NodeSavedSession, NodeSavedState } from '@atproto/oauth-client-node';
import { JoseKey } from '@atproto/jwk-jose';
import { redis, CACHE_TTL } from '../cache/redis.js';

// Redis-based state store for OAuth
class RedisStateStore {
  async get(key: string): Promise<NodeSavedState | undefined> {
    const data = await redis.get(`oauth:state:${key}`);
    return data ? JSON.parse(data) : undefined;
  }

  async set(key: string, state: NodeSavedState): Promise<void> {
    // OAuth states are short-lived (10 minutes)
    await redis.setex(`oauth:state:${key}`, 600, JSON.stringify(state));
  }

  async del(key: string): Promise<void> {
    await redis.del(`oauth:state:${key}`);
  }
}

// Redis-based session store for OAuth
class RedisSessionStore {
  async get(key: string): Promise<NodeSavedSession | undefined> {
    const data = await redis.get(`session:${key}`);
    return data ? JSON.parse(data) : undefined;
  }

  async set(key: string, session: NodeSavedSession): Promise<void> {
    await redis.setex(`session:${key}`, CACHE_TTL.SESSION, JSON.stringify(session));
  }

  async del(key: string): Promise<void> {
    await redis.del(`session:${key}`);
  }
}

export interface OAuthConfig {
  clientId: string;
  privateKey: string;
  redirectUri: string;
  appUrl: string;
}

let oauthClientInstance: NodeOAuthClient | null = null;

export async function createOAuthClient(config: OAuthConfig): Promise<NodeOAuthClient> {
  if (oauthClientInstance) {
    return oauthClientInstance;
  }

  // Import the private key for signing
  const keyset = await Promise.all([JoseKey.fromImportable(config.privateKey, 'key1')]);

  oauthClientInstance = new NodeOAuthClient({
    clientMetadata: {
      client_id: config.clientId,
      client_name: 'Exprsn',
      client_uri: config.appUrl,
      redirect_uris: [config.redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: 'atproto',
      token_endpoint_auth_method: 'private_key_jwt',
      dpop_bound_access_tokens: true,
      jwks: { keys: keyset.map((k) => k.publicJwk) },
    },
    keyset,
    stateStore: new RedisStateStore(),
    sessionStore: new RedisSessionStore(),
  });

  return oauthClientInstance;
}

export function getOAuthClient(): NodeOAuthClient {
  if (!oauthClientInstance) {
    throw new Error('OAuth client not initialized. Call createOAuthClient first.');
  }
  return oauthClientInstance;
}

export type OAuthSession = Awaited<ReturnType<NodeOAuthClient['restore']>>;
