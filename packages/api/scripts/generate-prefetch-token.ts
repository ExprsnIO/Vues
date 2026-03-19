/**
 * Generate a service token for the prefetch worker
 *
 * Creates a long-lived session token for the prefetch worker to use
 * when calling authenticated API endpoints (like getTimeline).
 *
 * Usage:
 *   cd packages/api && npx tsx scripts/generate-prefetch-token.ts
 *
 * Then set PREFETCH_AUTH_TOKEN in your .env or environment.
 */

import { db } from '../src/db/index.js';
import { actorRepos, sessions } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generateSessionTokens } from '../src/utils/session-tokens.js';

const SERVICE_DID = 'did:exprsn:prefetch-worker';
const SERVICE_HANDLE = 'prefetch-worker.internal';

async function main() {
  console.log('Generating prefetch worker service token...\n');

  // Check if service account exists
  let [account] = await db
    .select()
    .from(actorRepos)
    .where(eq(actorRepos.did, SERVICE_DID))
    .limit(1);

  if (!account) {
    // Create service account
    await db.insert(actorRepos).values({
      did: SERVICE_DID,
      handle: SERVICE_HANDLE,
      email: 'prefetch@internal.exprsn.io',
      passwordHash: '', // No password — token-only access
      signingKeyPublic: '',
      signingKeyPrivate: '',
      didMethod: 'exprsn',
      status: 'active',
      isService: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
    console.log('Created service account:', SERVICE_DID);
  } else {
    console.log('Service account exists:', SERVICE_DID);
  }

  // Generate long-lived session (365 days)
  const { accessToken, accessTokenHash, refreshTokenHash } = generateSessionTokens();
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: nanoid(),
    did: SERVICE_DID,
    accessJwt: accessTokenHash,
    refreshJwt: refreshTokenHash,
    expiresAt,
  });

  console.log('\n' + '='.repeat(60));
  console.log('PREFETCH WORKER SERVICE TOKEN');
  console.log('='.repeat(60));
  console.log(`\nPREFETCH_AUTH_TOKEN=${accessToken}\n`);
  console.log('Add this to your .env file or environment variables.');
  console.log(`Expires: ${expiresAt.toISOString()}`);
  console.log('='.repeat(60));

  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
