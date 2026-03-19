import { randomBytes, createHash } from 'node:crypto';
import { db } from '../src/db/index.js';
import { apiTokens } from '../src/db/schema.js';
import { nanoid } from 'nanoid';

const TOTAL_TOKENS = 20000;
const BATCH_SIZE = 1000;
const OWNER_DID = 'did:exprsn:rickholland';

interface TokenData {
  id: string;
  tokenHash: string;
  tokenPrefix: string;
  name: string;
  description: string | null;
  ownerDid: string;
  certificateId: string | null;
  tokenType: string;
  scopes: string[];
  allowedIps: string[] | null;
  allowedOrigins: string[] | null;
  rateLimit: number | null;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  usageCount: number;
  status: string;
  createdAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokedReason: string | null;
}

function generateToken(): string {
  // Generate a cryptographically secure random token (32 bytes = 64 hex chars)
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  // Hash the token with SHA-256
  return createHash('sha256').update(token).digest('hex');
}

function createTokenData(index: number, token: string): TokenData {
  const tokenHash = hashToken(token);
  const tokenPrefix = token.substring(0, 8);

  return {
    id: nanoid(),
    tokenHash,
    tokenPrefix,
    name: `Auto-generated Token #${index + 1}`,
    description: null,
    ownerDid: OWNER_DID,
    certificateId: null,
    tokenType: 'api_key',
    scopes: ['read', 'write'],
    allowedIps: null,
    allowedOrigins: null,
    rateLimit: null,
    expiresAt: null, // Non-expiring
    lastUsedAt: null,
    lastUsedIp: null,
    usageCount: 0,
    status: 'active',
    createdAt: new Date(),
    revokedAt: null,
    revokedBy: null,
    revokedReason: null,
  };
}

async function generateAndInsertTokens() {
  console.log(`Generating ${TOTAL_TOKENS} API tokens for ${OWNER_DID}...`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log('');

  const startTime = Date.now();
  let totalInserted = 0;

  for (let batchStart = 0; batchStart < TOTAL_TOKENS; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, TOTAL_TOKENS);
    const batchCount = batchEnd - batchStart;

    console.log(`Generating batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(TOTAL_TOKENS / BATCH_SIZE)} (tokens ${batchStart + 1}-${batchEnd})...`);

    // Generate tokens for this batch
    const batch: TokenData[] = [];
    for (let i = batchStart; i < batchEnd; i++) {
      const token = generateToken();
      batch.push(createTokenData(i, token));
    }

    // Insert batch into database
    try {
      await db.insert(apiTokens).values(batch);
      totalInserted += batchCount;
      console.log(`✓ Inserted batch successfully (${totalInserted}/${TOTAL_TOKENS} total)`);
    } catch (error) {
      console.error(`✗ Failed to insert batch:`, error);
      throw error;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('');
  console.log(`Successfully generated and inserted ${totalInserted} API tokens in ${duration}s`);
  console.log(`Average: ${(totalInserted / parseFloat(duration)).toFixed(0)} tokens/second`);
}

// Run the script
generateAndInsertTokens()
  .then(() => {
    console.log('✓ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('✗ Error:', error);
    process.exit(1);
  });
