import { Hono } from 'hono';
import { createServerRouter, PdsServerConfig, AccountStore, SessionStore } from './server.js';
import { createRepoRouter, RepoStoreManager } from './repo.js';
import { createSyncRouter, SyncRepoManager } from './sync.js';
import { createIdentityRouter, AccountLookup } from './identity.js';
import { BlobStore } from '../storage/blob-store.js';

export * from './server.js';
export * from './repo.js';
export * from './sync.js';
export * from './identity.js';

/**
 * Combined PDS dependencies
 */
export interface PdsDependencies {
  config: PdsServerConfig;
  accountStore: AccountStore & AccountLookup;
  sessionStore: SessionStore;
  repoManager: RepoStoreManager & SyncRepoManager;
  blobStore: BlobStore;
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
  generateKeyPair: () => Promise<{ publicKey: string; privateKey: string }>;
  getSession: (c: {
    req: { header(name: string): string | undefined };
  }) => Promise<{ did: string } | null>;
}

/**
 * Create the complete PDS XRPC router
 */
export function createPdsRouter(deps: PdsDependencies): Hono {
  const router = new Hono();

  // Mount server routes (com.atproto.server.*)
  const serverRouter = createServerRouter(
    deps.config,
    deps.accountStore,
    deps.sessionStore,
    deps.hashPassword,
    deps.verifyPassword,
    deps.generateKeyPair
  );
  router.route('/', serverRouter);

  // Mount repo routes (com.atproto.repo.*)
  const repoRouter = createRepoRouter(
    deps.repoManager,
    deps.blobStore,
    deps.getSession
  );
  router.route('/', repoRouter);

  // Mount sync routes (com.atproto.sync.*)
  const syncRouter = createSyncRouter(deps.repoManager, deps.blobStore);
  router.route('/', syncRouter);

  // Mount identity routes (com.atproto.identity.*)
  const identityRouter = createIdentityRouter(deps.accountStore);
  router.route('/', identityRouter);

  return router;
}

/**
 * Default error handler for XRPC routes
 */
export function xrpcErrorHandler(err: Error, c: { json: (data: unknown, status: number) => Response }) {
  console.error('XRPC Error:', err);

  if ('status' in err && typeof (err as { status: number }).status === 'number') {
    const httpErr = err as { status: number; message: string };
    return c.json(
      {
        error: getErrorName(httpErr.status),
        message: httpErr.message,
      },
      httpErr.status
    );
  }

  return c.json(
    {
      error: 'InternalServerError',
      message: 'An unexpected error occurred',
    },
    500
  );
}

function getErrorName(status: number): string {
  switch (status) {
    case 400:
      return 'InvalidRequest';
    case 401:
      return 'AuthenticationRequired';
    case 403:
      return 'Forbidden';
    case 404:
      return 'NotFound';
    case 409:
      return 'Conflict';
    case 413:
      return 'PayloadTooLarge';
    case 429:
      return 'RateLimitExceeded';
    case 501:
      return 'NotImplemented';
    default:
      return 'InternalServerError';
  }
}
