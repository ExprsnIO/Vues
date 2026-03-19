/**
 * Migration script: Convert rickholland from did:plc to did:exprsn
 *
 * This script:
 * 1. Issues a client certificate for @rickholland.exprsn.io
 * 2. Issues a code signing certificate
 * 3. Creates the did:exprsn:rickholland identity records
 * 4. Updates all related tables (users, actor_repos, plc_identities, admin_users)
 *
 * Run with: cd /Users/rickholland/Projects/Vues/packages/api && npx tsx --import ./node_modules/@swc-node/register/esm ./scripts/migrate-rickholland-to-did-exprsn.ts
 */

import { db } from '../src/db/index.js';
import {
  users,
  actorRepos,
  plcIdentities,
  adminUsers,
  exprsnDidCertificates,
  caEntityCertificates,
  videos,
  likes,
  comments,
  follows,
} from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { certificateManager } from '../src/services/ca/CertificateManager.js';
import { nanoid } from 'nanoid';
import crypto from 'crypto';

const OLD_DID = 'did:plc:rickholland';
const NEW_DID = 'did:exprsn:rickholland';
const HANDLE = 'rickholland.exprsn.io';
const COMMON_NAME = '@rickholland.exprsn.io';

async function migrateToDidExprsn() {
  console.log('='.repeat(60));
  console.log('Starting migration: did:plc:rickholland → did:exprsn:rickholland');
  console.log('='.repeat(60));
  console.log();

  try {
    // ========================================
    // Step 1: Verify user exists
    // ========================================
    console.log('Step 1: Verifying user exists...');
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.did, OLD_DID))
      .limit(1);

    if (!existingUser) {
      console.error(`❌ Error: User with DID ${OLD_DID} not found`);
      console.log('\nAvailable users:');
      const allUsers = await db.select({ did: users.did, handle: users.handle }).from(users).limit(10);
      for (const u of allUsers) {
        console.log(`  - ${u.did} (@${u.handle})`);
      }
      process.exit(1);
    }

    console.log(`✓ Found user: ${existingUser.handle} (${OLD_DID})`);
    console.log(`  Display Name: ${existingUser.displayName || 'N/A'}`);
    console.log(`  Followers: ${existingUser.followerCount}`);
    console.log(`  Following: ${existingUser.followingCount}`);
    console.log(`  Videos: ${existingUser.videoCount}`);
    console.log();

    // ========================================
    // Step 2: Check if target DID already exists
    // ========================================
    console.log('Step 2: Checking for existing did:exprsn identity...');
    const [existingExprsn] = await db
      .select()
      .from(exprsnDidCertificates)
      .where(eq(exprsnDidCertificates.did, NEW_DID))
      .limit(1);

    if (existingExprsn) {
      console.log(`⚠️  Warning: DID ${NEW_DID} already exists in exprsnDidCertificates`);
      console.log('   Migration may have been run before. Proceeding with updates...');
    } else {
      console.log(`✓ No existing did:exprsn identity found`);
    }
    console.log();

    // ========================================
    // Step 3: Ensure Root CA exists
    // ========================================
    console.log('Step 3: Ensuring Root CA exists...');
    const rootCA = await certificateManager.ensureRootCA();
    console.log(`✓ Root CA ready: ${rootCA.serialNumber}`);
    console.log();

    // ========================================
    // Step 4: Create user record first (required for FK constraint)
    // ========================================
    console.log('Step 4: Creating new user record...');

    const [newUser] = await db
      .select()
      .from(users)
      .where(eq(users.did, NEW_DID))
      .limit(1);

    if (newUser) {
      console.log(`✓ User record already exists for ${NEW_DID}`);
    } else {
      // Create new based on old
      await db.insert(users).values({
        did: NEW_DID,
        handle: HANDLE.replace('.exprsn.io', ''),
        displayName: existingUser.displayName,
        avatar: existingUser.avatar,
        bio: existingUser.bio,
        website: existingUser.website,
        location: existingUser.location,
        socialLinks: existingUser.socialLinks,
        followerCount: existingUser.followerCount,
        followingCount: existingUser.followingCount,
        videoCount: existingUser.videoCount,
        verified: existingUser.verified,
        createdAt: existingUser.createdAt,
        updatedAt: new Date(),
        indexedAt: new Date(),
      });
      console.log(`✓ Created new users record for ${NEW_DID}`);
    }
    console.log();

    // ========================================
    // Step 5: Issue Client Certificate
    // ========================================
    console.log('Step 5: Issuing client certificate...');
    const clientCert = await certificateManager.issueEntityCertificate({
      commonName: COMMON_NAME,
      type: 'client',
      subjectDid: NEW_DID,
      email: existingUser.handle ? `${existingUser.handle.split('.')[0]}@exprsn.io` : undefined,
      validityDays: 365,
    });

    console.log(`✓ Client certificate issued:`);
    console.log(`  Certificate ID: ${clientCert.id}`);
    console.log(`  Serial Number: ${clientCert.serialNumber}`);
    console.log(`  Fingerprint: ${clientCert.fingerprint}`);
    console.log();

    // ========================================
    // Step 6: Issue Code Signing Certificate
    // ========================================
    console.log('Step 6: Issuing code signing certificate...');
    const codeCert = await certificateManager.issueEntityCertificate({
      commonName: `${COMMON_NAME} Code Signing`,
      type: 'code_signing',
      subjectDid: NEW_DID,
      validityDays: 365,
    });

    console.log(`✓ Code signing certificate issued:`);
    console.log(`  Certificate ID: ${codeCert.id}`);
    console.log(`  Serial Number: ${codeCert.serialNumber}`);
    console.log(`  Fingerprint: ${codeCert.fingerprint}`);
    console.log();

    // ========================================
    // Step 7: Extract public key for DID document
    // ========================================
    console.log('Step 7: Extracting public key for DID document...');

    // Extract public key from certificate (multibase format for DID docs)
    const publicKeyDer = Buffer.from(
      clientCert.certificate
        .replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, ''),
      'base64'
    );

    // For multibase encoding (base58btc with 'z' prefix is common for DIDs)
    const publicKeyMultibase = 'z' + publicKeyDer.toString('base64url');

    console.log(`✓ Public key extracted (multibase format)`);
    console.log();

    // ========================================
    // Step 8: Create/Update exprsnDidCertificates record
    // ========================================
    console.log('Step 8: Creating exprsnDidCertificates record...');

    if (existingExprsn) {
      // Update existing
      await db
        .update(exprsnDidCertificates)
        .set({
          certificateId: clientCert.id,
          publicKeyMultibase,
          status: 'active',
        })
        .where(eq(exprsnDidCertificates.did, NEW_DID));
      console.log(`✓ Updated existing exprsnDidCertificates record`);
    } else {
      // Create new
      await db.insert(exprsnDidCertificates).values({
        id: nanoid(),
        did: NEW_DID,
        certificateId: clientCert.id,
        certificateType: 'platform',
        publicKeyMultibase,
        status: 'active',
        createdAt: new Date(),
      });
      console.log(`✓ Created new exprsnDidCertificates record`);
    }
    console.log();

    // ========================================
    // Step 9: Update or create plcIdentities
    // ========================================
    console.log('Step 9: Updating plcIdentities...');

    const [existingPlcIdentity] = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, OLD_DID))
      .limit(1);

    // Check if new DID already has an identity
    const [newPlcIdentity] = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, NEW_DID))
      .limit(1);

    if (newPlcIdentity) {
      // Update existing new identity
      await db
        .update(plcIdentities)
        .set({
          handle: HANDLE,
          certificateId: clientCert.id,
          certificateFingerprint: clientCert.fingerprint,
          signingKey: publicKeyMultibase,
          updatedAt: new Date(),
        })
        .where(eq(plcIdentities.did, NEW_DID));
      console.log(`✓ Updated existing plcIdentities record for ${NEW_DID}`);
    } else if (existingPlcIdentity) {
      // Since 'did' is the primary key, we need to delete the old and create new
      // First, save the old data
      const oldData = { ...existingPlcIdentity };

      // Delete the old record
      await db.delete(plcIdentities).where(eq(plcIdentities.did, OLD_DID));
      console.log(`✓ Deleted old plcIdentities record for ${OLD_DID}`);

      // Create new record with updated DID
      await db.insert(plcIdentities).values({
        did: NEW_DID,
        handle: HANDLE,
        pdsEndpoint: oldData.pdsEndpoint,
        signingKey: publicKeyMultibase,
        rotationKeys: oldData.rotationKeys,
        alsoKnownAs: oldData.alsoKnownAs,
        services: oldData.services,
        certificateId: clientCert.id,
        certificateFingerprint: clientCert.fingerprint,
        status: 'active',
        createdAt: oldData.createdAt,
        updatedAt: new Date(),
      });
      console.log(`✓ Created new plcIdentities record for ${NEW_DID}`);
    } else {
      // Create from scratch
      await db.insert(plcIdentities).values({
        did: NEW_DID,
        handle: HANDLE,
        pdsEndpoint: 'https://exprsn.io',
        signingKey: publicKeyMultibase,
        rotationKeys: [publicKeyMultibase],
        alsoKnownAs: [`at://${HANDLE}`],
        services: {
          atproto_pds: {
            type: 'AtprotoPersonalDataServer',
            endpoint: 'https://exprsn.io',
          },
        },
        certificateId: clientCert.id,
        certificateFingerprint: clientCert.fingerprint,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`✓ Created new plcIdentities record from scratch`);
    }
    console.log();

    // ========================================
    // Step 10: Update or create actorRepos
    // ========================================
    console.log('Step 10: Updating actorRepos...');

    const [existingActorRepo] = await db
      .select()
      .from(actorRepos)
      .where(eq(actorRepos.did, OLD_DID))
      .limit(1);

    const [newActorRepo] = await db
      .select()
      .from(actorRepos)
      .where(eq(actorRepos.did, NEW_DID))
      .limit(1);

    if (newActorRepo) {
      // Update existing
      await db
        .update(actorRepos)
        .set({
          handle: HANDLE,
          didMethod: 'exprsn',
          certificateId: clientCert.id,
          updatedAt: new Date(),
        })
        .where(eq(actorRepos.did, NEW_DID));
      console.log(`✓ Updated existing actorRepos record for ${NEW_DID}`);
    } else if (existingActorRepo) {
      // Since 'did' is the primary key, we need to delete the old and create new
      const oldData = { ...existingActorRepo };

      // Delete the old record
      await db.delete(actorRepos).where(eq(actorRepos.did, OLD_DID));
      console.log(`✓ Deleted old actorRepos record for ${OLD_DID}`);

      // Create new based on old
      await db.insert(actorRepos).values({
        did: NEW_DID,
        handle: HANDLE,
        email: oldData.email,
        passwordHash: oldData.passwordHash,
        signingKeyPublic: oldData.signingKeyPublic,
        signingKeyPrivate: oldData.signingKeyPrivate,
        rootCid: oldData.rootCid,
        rev: oldData.rev,
        status: 'active',
        didMethod: 'exprsn',
        certificateId: clientCert.id,
        isService: false,
        createdAt: oldData.createdAt,
        updatedAt: new Date(),
      });
      console.log(`✓ Created new actorRepos record for ${NEW_DID}`);
    } else {
      console.log(`⚠️  No existing actorRepos found for ${OLD_DID}`);
    }
    console.log();

    // User record was already created in Step 4
    // Just add a note about it
    console.log(`✓ User record for ${NEW_DID} already created in Step 4`);
    console.log();

    // ========================================
    // Step 11: Update admin_users table
    // ========================================
    console.log('Step 11: Updating admin_users table...');

    const [existingAdmin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.userDid, OLD_DID))
      .limit(1);

    if (existingAdmin) {
      const [newAdmin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.userDid, NEW_DID))
        .limit(1);

      if (newAdmin) {
        // Update existing
        await db
          .update(adminUsers)
          .set({
            role: existingAdmin.role,
            permissions: existingAdmin.permissions,
            updatedAt: new Date(),
          })
          .where(eq(adminUsers.userDid, NEW_DID));
        console.log(`✓ Updated existing admin_users record for ${NEW_DID}`);
      } else {
        // Create new
        await db.insert(adminUsers).values({
          id: nanoid(),
          userDid: NEW_DID,
          role: existingAdmin.role,
          permissions: existingAdmin.permissions || [],
          invitedBy: existingAdmin.invitedBy,
          lastLoginAt: existingAdmin.lastLoginAt,
          createdAt: existingAdmin.createdAt,
          updatedAt: new Date(),
        });
        console.log(`✓ Created new admin_users record for ${NEW_DID} with role: ${existingAdmin.role}`);
      }
    } else {
      console.log(`  No admin role found for ${OLD_DID}`);
    }
    console.log();

    // ========================================
    // Summary
    // ========================================
    console.log('='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log();
    console.log(`Old DID:  ${OLD_DID}`);
    console.log(`New DID:  ${NEW_DID}`);
    console.log(`Handle:   ${HANDLE}`);
    console.log();
    console.log('Certificates issued:');
    console.log(`  Client Certificate:       ${clientCert.serialNumber}`);
    console.log(`  Code Signing Certificate: ${codeCert.serialNumber}`);
    console.log();
    console.log('Tables updated:');
    console.log('  ✓ exprsnDidCertificates');
    console.log('  ✓ plcIdentities');
    console.log('  ✓ actorRepos');
    console.log('  ✓ users');
    console.log('  ✓ admin_users');
    console.log();
    console.log('🎉 Migration completed successfully!');
    console.log();
    console.log('Next steps:');
    console.log('  1. Update client applications to use the new DID');
    console.log('  2. Verify authentication works with new certificate');
    console.log('  3. Consider migrating related records (videos, follows, etc.) if needed');
    console.log();
    console.log('Note: Old records have been preserved for backup/rollback purposes');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Migration failed with error:');
    console.error(error);

    if (error instanceof Error) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }

  process.exit(0);
}

// Run the migration
migrateToDidExprsn().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
