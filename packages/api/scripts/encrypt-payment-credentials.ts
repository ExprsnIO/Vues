#!/usr/bin/env tsx

/**
 * Script to encrypt existing payment credentials in the database
 *
 * This script:
 * 1. Reads all payment configurations from the database
 * 2. Checks if credentials are already encrypted
 * 3. Encrypts unencrypted credentials
 * 4. Updates the database with encrypted credentials
 *
 * Usage:
 *   pnpm tsx scripts/encrypt-payment-credentials.ts [--dry-run]
 *
 * Options:
 *   --dry-run  Show what would be encrypted without actually updating
 */

import { db } from '../src/db/index.js';
import { paymentConfigs } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { encryptCredentials, isEncrypted } from '../src/utils/encryption.js';

interface PaymentConfig {
  id: string;
  provider: string;
  credentials: Record<string, string> | null;
  organizationId: string | null;
  userDid: string | null;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('🔒 Payment Credentials Encryption Script');
  console.log('=========================================\n');

  if (isDryRun) {
    console.log('ℹ️  Running in DRY RUN mode - no changes will be made\n');
  }

  // Check if ENCRYPTION_KEY is set
  if (!process.env.ENCRYPTION_KEY && process.env.NODE_ENV === 'production') {
    console.error('❌ ERROR: ENCRYPTION_KEY environment variable must be set in production');
    process.exit(1);
  }

  if (!process.env.ENCRYPTION_KEY) {
    console.warn('⚠️  WARNING: ENCRYPTION_KEY not set, using development key\n');
  }

  // Fetch all payment configurations
  console.log('📋 Fetching payment configurations...');
  const configs = await db.select().from(paymentConfigs);

  console.log(`Found ${configs.length} payment configuration(s)\n`);

  if (configs.length === 0) {
    console.log('✅ No payment configurations found. Nothing to encrypt.');
    return;
  }

  let encryptedCount = 0;
  let alreadyEncryptedCount = 0;
  let skippedCount = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const config of configs) {
    const { id, provider, credentials, organizationId, userDid } = config as PaymentConfig;
    const scope = organizationId ? `org:${organizationId}` : userDid ? `user:${userDid}` : 'platform';

    console.log(`\n📦 Config ID: ${id}`);
    console.log(`   Provider: ${provider}`);
    console.log(`   Scope: ${scope}`);

    if (!credentials || Object.keys(credentials).length === 0) {
      console.log('   ⏭️  Skipping - No credentials set');
      skippedCount++;
      continue;
    }

    // Check if already encrypted
    if (isEncrypted(credentials)) {
      console.log('   ✓ Already encrypted');
      alreadyEncryptedCount++;
      continue;
    }

    // Encrypt credentials
    try {
      console.log('   🔒 Encrypting credentials...');

      if (isDryRun) {
        console.log('   ℹ️  Would encrypt:', Object.keys(credentials).join(', '));
        encryptedCount++;
        continue;
      }

      const encryptedCreds = encryptCredentials(credentials);

      // Update database
      await db
        .update(paymentConfigs)
        .set({
          credentials: encryptedCreds,
          updatedAt: new Date(),
        })
        .where(eq(paymentConfigs.id, id));

      console.log('   ✅ Successfully encrypted');
      encryptedCount++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`   ❌ Error: ${errorMessage}`);
      errors.push({ id, error: errorMessage });
    }
  }

  // Summary
  console.log('\n\n📊 Summary');
  console.log('==========');
  console.log(`Total configurations: ${configs.length}`);
  console.log(`${isDryRun ? 'Would be encrypted' : 'Encrypted'}: ${encryptedCount}`);
  console.log(`Already encrypted: ${alreadyEncryptedCount}`);
  console.log(`Skipped (no credentials): ${skippedCount}`);
  console.log(`Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    for (const { id, error } of errors) {
      console.log(`   - Config ${id}: ${error}`);
    }
    process.exit(1);
  }

  if (isDryRun && encryptedCount > 0) {
    console.log('\n✅ Dry run complete. Run without --dry-run to apply changes.');
  } else if (encryptedCount > 0) {
    console.log('\n✅ Encryption complete!');
  } else {
    console.log('\n✅ All credentials are already encrypted.');
  }
}

main()
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
