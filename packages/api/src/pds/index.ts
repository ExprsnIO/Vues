import { Hono } from 'hono';
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { createPdsRouter, PdsDependencies, PdsServerConfig } from '@exprsn/pds';
import { createDidService, DidWebConfig } from '@exprsn/pds';
import { createLocalBlobStore, createS3BlobStore } from '@exprsn/pds';
import { db } from '../db/index.js';
import { actorRepos, repoCommits, repoRecords, blobs, repoBlocks, sessions } from '../db/schema.js';

/**
 * PDS configuration from environment
 */
export interface PdsConfig {
  enabled: boolean;
  domain: string;
  dataPath: string;
  blobStorage: 'local' | 's3';
  s3Endpoint?: string;
  s3AccessKey?: string;
  s3SecretKey?: string;
  s3Bucket?: string;
}

/**
 * Get PDS config from environment
 */
export function getPdsConfig(): PdsConfig {
  return {
    enabled: process.env.PDS_ENABLED === 'true',
    domain: process.env.PDS_DOMAIN || 'localhost:3000',
    dataPath: process.env.PDS_DATA_PATH || './data',
    blobStorage: (process.env.BLOB_STORAGE_TYPE as 'local' | 's3') || 'local',
    s3Endpoint: process.env.DO_SPACES_ENDPOINT,
    s3AccessKey: process.env.DO_SPACES_KEY,
    s3SecretKey: process.env.DO_SPACES_SECRET,
    s3Bucket: process.env.DO_SPACES_BUCKET,
  };
}

/**
 * Account store implementation using database
 * Implements AccountStore & AccountLookup interfaces
 */
function createAccountStore() {
  return {
    async createAccount(account: {
      did: string;
      handle: string;
      email: string;
      passwordHash: string;
      signingKeyPublic: string;
      signingKeyPrivate: string;
    }) {
      await db.insert(actorRepos).values({
        did: account.did,
        handle: account.handle,
        email: account.email,
        passwordHash: account.passwordHash,
        signingKeyPublic: account.signingKeyPublic,
        signingKeyPrivate: account.signingKeyPrivate,
        status: 'active',
      });
    },

    async getAccountByHandle(handle: string) {
      const result = await db.select().from(actorRepos).where(eq(actorRepos.handle, handle)).limit(1);
      return result[0] || null;
    },

    async getAccountByDid(did: string) {
      const result = await db.select().from(actorRepos).where(eq(actorRepos.did, did)).limit(1);
      return result[0] || null;
    },

    async handleExists(handle: string) {
      const result = await db.select({ did: actorRepos.did }).from(actorRepos).where(eq(actorRepos.handle, handle)).limit(1);
      return result.length > 0;
    },

    async emailExists(email: string) {
      const result = await db.select({ did: actorRepos.did }).from(actorRepos).where(eq(actorRepos.email, email)).limit(1);
      return result.length > 0;
    },

    // AccountLookup interface methods
    async getDidByHandle(handle: string) {
      const result = await db.select({ did: actorRepos.did }).from(actorRepos).where(eq(actorRepos.handle, handle)).limit(1);
      return result[0]?.did || null;
    },

    async getHandleByDid(did: string) {
      const result = await db.select({ handle: actorRepos.handle }).from(actorRepos).where(eq(actorRepos.did, did)).limit(1);
      return result[0]?.handle || null;
    },
  };
}

/**
 * Session store implementation
 * Implements SessionStore interface
 */
function createSessionStore() {
  return {
    async createSession(did: string): Promise<{ accessJwt: string; refreshJwt: string }> {
      const accessJwt = `exp_${crypto.randomUUID().replace(/-/g, '')}`;
      const refreshJwt = `exp_refresh_${crypto.randomUUID().replace(/-/g, '')}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await db.insert(sessions).values({
        id: crypto.randomUUID(),
        did,
        accessJwt,
        refreshJwt,
        expiresAt,
      });

      return { accessJwt, refreshJwt };
    },

    async validateAccessToken(token: string): Promise<{ did: string } | null> {
      const result = await db.select().from(sessions).where(eq(sessions.accessJwt, token)).limit(1);
      if (!result[0] || result[0].expiresAt < new Date()) return null;
      return { did: result[0].did };
    },

    async validateRefreshToken(token: string): Promise<{ did: string } | null> {
      const result = await db.select().from(sessions).where(eq(sessions.refreshJwt, token)).limit(1);
      if (!result[0]) return null;
      return { did: result[0].did };
    },

    async deleteSession(did: string, _token: string) {
      await db.delete(sessions).where(eq(sessions.did, did));
    },
  };
}

/**
 * Repo store manager implementation
 * Implements RepoStoreManager & SyncRepoManager interfaces
 */
function createRepoManager() {
  return {
    // RepoStoreManager interface
    async getRepo(_did: string) {
      // Full repository implementation requires MST/BlockStore
      // Return null to indicate repo doesn't exist (will trigger creation)
      return null;
    },

    async createRepo(_did: string) {
      // Creating a full Repository requires MST/BlockStore/signing functions
      // This is a stub - full PDS functionality requires complete implementation
      throw new Error('Full PDS repository creation not implemented');
    },

    // SyncRepoManager interface
    async getBlockStore(_did: string) {
      // Return null as block stores require full implementation
      return null;
    },

    // Legacy methods for compatibility
    async getRepoRoot(did: string) {
      const result = await db.select({ rootCid: actorRepos.rootCid, rev: actorRepos.rev })
        .from(actorRepos).where(eq(actorRepos.did, did)).limit(1);
      if (!result[0]?.rootCid) return null;
      return { root: result[0].rootCid, rev: result[0].rev || '' };
    },

    async createRecord(uri: string, cid: string, did: string, collection: string, rkey: string, record: unknown) {
      await db.insert(repoRecords).values({
        uri,
        cid,
        did,
        collection,
        rkey,
        record,
      });
    },

    async getRecord(did: string, collection: string, rkey: string) {
      const uri = `at://${did}/${collection}/${rkey}`;
      const result = await db.select().from(repoRecords).where(eq(repoRecords.uri, uri)).limit(1);
      if (!result[0]) return null;
      return {
        uri: result[0].uri,
        cid: result[0].cid,
        value: result[0].record,
      };
    },

    async listRecords(did: string, collection: string, limit: number, cursor?: string) {
      // Simple implementation - could be optimized with proper pagination
      const results = await db.select().from(repoRecords)
        .where(eq(repoRecords.did, did))
        .limit(limit);

      const filtered = results.filter(r => r.collection === collection);
      return {
        records: filtered.map(r => ({
          uri: r.uri,
          cid: r.cid,
          value: r.record,
        })),
        cursor: undefined,
      };
    },

    async deleteRecord(did: string, collection: string, rkey: string) {
      const uri = `at://${did}/${collection}/${rkey}`;
      await db.delete(repoRecords).where(eq(repoRecords.uri, uri));
    },

    async putBlock(did: string, cid: string, content: Uint8Array) {
      const contentBase64 = Buffer.from(content).toString('base64');
      await db.insert(repoBlocks).values({
        cid,
        did,
        content: contentBase64,
      }).onConflictDoNothing();
    },

    async getBlock(did: string, cid: string) {
      const result = await db.select().from(repoBlocks).where(eq(repoBlocks.cid, cid)).limit(1);
      if (!result[0]) return null;
      return Buffer.from(result[0].content, 'base64');
    },

    async putCommit(did: string, cid: string, rev: string, data: Uint8Array, prev?: string) {
      const dataBase64 = Buffer.from(data).toString('base64');
      await db.insert(repoCommits).values({
        cid,
        did,
        rev,
        data: dataBase64,
        prev,
      });

      await db.update(actorRepos).set({ rootCid: cid, rev, updatedAt: new Date() }).where(eq(actorRepos.did, did));
    },

    // SyncRepoManager
    async getLatestCommit(did: string) {
      const result = await db.select({ rootCid: actorRepos.rootCid, rev: actorRepos.rev })
        .from(actorRepos).where(eq(actorRepos.did, did)).limit(1);
      if (!result[0]?.rootCid) return null;
      return { cid: result[0].rootCid, rev: result[0].rev || '' };
    },

    async getBlocks(did: string, cids: string[]) {
      const blocks: Map<string, Uint8Array> = new Map();
      for (const cid of cids) {
        const result = await db.select().from(repoBlocks).where(eq(repoBlocks.cid, cid)).limit(1);
        if (result[0]) {
          blocks.set(cid, Buffer.from(result[0].content, 'base64'));
        }
      }
      return blocks;
    },

    async getAllBlocks(did: string) {
      const results = await db.select().from(repoBlocks).where(eq(repoBlocks.did, did));
      const blocks: Map<string, Uint8Array> = new Map();
      for (const block of results) {
        blocks.set(block.cid, Buffer.from(block.content, 'base64'));
      }
      return blocks;
    },

    async recordBlob(did: string, cid: string, mimeType: string, size: number, storagePath: string) {
      await db.insert(blobs).values({
        cid,
        did,
        mimeType,
        size,
        storagePath,
      });
    },

    async getBlob(did: string, cid: string) {
      const result = await db.select().from(blobs).where(eq(blobs.cid, cid)).limit(1);
      if (!result[0]) return null;
      return {
        cid: result[0].cid,
        mimeType: result[0].mimeType,
        size: result[0].size,
        storagePath: result[0].storagePath,
      };
    },

    async listBlobs(did: string, since?: string, limit?: number) {
      const results = await db.select({ cid: blobs.cid }).from(blobs)
        .where(eq(blobs.did, did))
        .limit(limit || 100);
      return results.map(r => r.cid);
    },
  };
}

/**
 * Generate key pair for account signing
 */
async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  // Use Web Crypto API for key generation
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
 * Get session from request
 */
async function getSession(c: { req: { header(name: string): string | undefined } }) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const sessionStore = createSessionStore();
  const session = await sessionStore.validateAccessToken(token);

  if (!session) {
    return null;
  }

  return { did: session.did };
}

/**
 * Create PDS router with all dependencies wired up
 */
export function createPdsApp(config: PdsConfig): Hono {
  const serverConfig: PdsServerConfig = {
    domain: config.domain,
    serviceEndpoint: `https://${config.domain}`,
    availableUserDomains: [config.domain],
    inviteCodeRequired: false,
    phoneVerificationRequired: false,
  };

  const accountStore = createAccountStore();
  const sessionStore = createSessionStore();
  const repoManager = createRepoManager();

  // Create blob store based on config
  const blobStore = config.blobStorage === 's3' && config.s3Endpoint
    ? createS3BlobStore({
        endpoint: config.s3Endpoint,
        accessKeyId: config.s3AccessKey || '',
        secretAccessKey: config.s3SecretKey || '',
        bucket: config.s3Bucket || 'blobs',
      })
    : createLocalBlobStore(`${config.dataPath}/blobs`);

  const deps = {
    config: serverConfig,
    accountStore,
    sessionStore,
    repoManager,
    blobStore,
    hashPassword: (password: string) => bcrypt.hash(password, 10),
    verifyPassword: (password: string, hash: string) => bcrypt.compare(password, hash),
    generateKeyPair,
    getSession,
  } as PdsDependencies;

  const pdsRouter = createPdsRouter(deps);
  const didServiceConfig: DidWebConfig = {
    domain: config.domain,
    pdsEndpoint: `https://${config.domain}`,
  };
  const didService = createDidService(didServiceConfig);

  const app = new Hono();

  // Mount XRPC routes
  app.route('/xrpc', pdsRouter);

  // Serve DID documents for did:web resolution
  app.get('/:handle/did.json', async (c) => {
    const handle = c.req.param('handle');
    const account = await accountStore.getAccountByHandle(handle);

    if (!account) {
      return c.json({ error: 'NotFound', message: 'Handle not found' }, 404);
    }

    const didDoc = didService.createDocument(account.did, account.signingKeyPublic, handle);
    return c.json(didDoc, 200, { 'Content-Type': 'application/did+json' });
  });

  // Serve blobs
  app.get('/blob/:did/:cid', async (c) => {
    const did = c.req.param('did');
    const cid = c.req.param('cid');

    const blobMeta = await repoManager.getBlob(did, cid);
    if (!blobMeta) {
      return c.json({ error: 'NotFound', message: 'Blob not found' }, 404);
    }

    // Read blob from storage path
    let blob: Buffer | null = null;
    if (blobMeta.storagePath && existsSync(blobMeta.storagePath)) {
      try {
        blob = await readFile(blobMeta.storagePath);
      } catch {
        // If read fails, blob will be null
      }
    }
    if (!blob) {
      return c.json({ error: 'NotFound', message: 'Blob data not found' }, 404);
    }

    return new Response(blob, {
      status: 200,
      headers: { 'Content-Type': blobMeta.mimeType },
    });
  });

  // Well-known DID resolution
  app.get('/.well-known/did.json', async (c) => {
    const serviceDid = `did:web:${config.domain}`;
    const didDoc = {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: serviceDid,
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: `https://${config.domain}`,
        },
      ],
    };
    return c.json(didDoc, 200, { 'Content-Type': 'application/did+json' });
  });

  return app;
}
