/**
 * Set rickholland's password and convert to did:exprsn
 *
 * Run with: cd packages/api && npx tsx scripts/set-password-and-migrate.ts
 */

import { db } from '../src/db/index.js';
import {
  users,
  actorRepos,
  plcIdentities,
  adminUsers,
  exprsnDidCertificates,
} from '../src/db/schema.js';
import { eq, like, or } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { certificateManager } from '../src/services/ca/CertificateManager.js';
import { nanoid } from 'nanoid';

const PASSWORD = 'exprsn2026';
const NEW_DID = 'did:exprsn:rickholland';
const HANDLE = 'rickholland.exprsn.io';
const COMMON_NAME = '@rickholland.exprsn.io';

async function main() {
  console.log('='.repeat(60));
  console.log('Setting password & converting rickholland to did:exprsn');
  console.log('='.repeat(60));
  console.log();

  // ─── Step 1: Find existing rickholland user ───
  console.log('Step 1: Finding rickholland user...');

  const allUsers = await db
    .select({ did: users.did, handle: users.handle, displayName: users.displayName })
    .from(users)
    .where(like(users.handle, '%rickholland%'));
  console.log('  Users found:', allUsers.map(u => `${u.handle} (${u.did})`).join(', ') || 'none');

  const allActors = await db
    .select({ did: actorRepos.did, handle: actorRepos.handle, didMethod: actorRepos.didMethod, email: actorRepos.email })
    .from(actorRepos)
    .where(like(actorRepos.handle, '%rickholland%'));
  console.log('  ActorRepos found:', allActors.map(a => `${a.handle} (${a.did}, method=${a.didMethod})`).join(', ') || 'none');

  // Find the old DID (any existing rickholland)
  const oldDid = allActors[0]?.did || allUsers[0]?.did;
  const existingUser = allUsers[0];
  const existingActor = allActors[0];

  console.log();

  // ─── Step 2: Set password ───
  console.log('Step 2: Setting password...');
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  if (existingActor) {
    await db
      .update(actorRepos)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(actorRepos.did, existingActor.did));
    console.log(`  Password set for ${existingActor.did}`);
  } else {
    console.log('  No existing actorRepos found, will create during migration');
  }
  console.log();

  // ─── Step 3: Ensure user record exists ───
  console.log('Step 3: Ensuring user record exists...');

  const [newDidUser] = await db
    .select()
    .from(users)
    .where(eq(users.did, NEW_DID))
    .limit(1);

  if (!newDidUser) {
    await db.insert(users).values({
      did: NEW_DID,
      handle: 'rickholland',
      displayName: existingUser?.displayName || 'Rick Holland',
      avatar: null,
      bio: null,
      followerCount: existingUser ? (existingUser as any).followerCount || 0 : 0,
      followingCount: existingUser ? (existingUser as any).followingCount || 0 : 0,
      videoCount: existingUser ? (existingUser as any).videoCount || 0 : 0,
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      indexedAt: new Date(),
    }).onConflictDoNothing();
    console.log(`  Created user record for ${NEW_DID}`);
  } else {
    console.log(`  User record already exists for ${NEW_DID}`);
  }
  console.log();

  // ─── Step 4: Ensure Root CA and issue certificates ───
  console.log('Step 4: Setting up certificates...');
  const rootCA = await certificateManager.ensureRootCA();
  console.log(`  Root CA ready: ${rootCA.serialNumber}`);

  // Check if certificates already exist
  const [existingCert] = await db
    .select()
    .from(exprsnDidCertificates)
    .where(eq(exprsnDidCertificates.did, NEW_DID))
    .limit(1);

  let clientCert: any;
  let codeCert: any;

  if (existingCert) {
    console.log('  Certificates already exist for did:exprsn:rickholland');
    clientCert = { id: existingCert.certificateId, fingerprint: 'existing' };
  } else {
    console.log('  Issuing client certificate...');
    clientCert = await certificateManager.issueEntityCertificate({
      commonName: COMMON_NAME,
      type: 'client',
      subjectDid: NEW_DID,
      email: 'rickholland@exprsn.io',
      validityDays: 365,
    });
    console.log(`  Client cert: ${clientCert.serialNumber}`);

    console.log('  Issuing code signing certificate...');
    codeCert = await certificateManager.issueEntityCertificate({
      commonName: `${COMMON_NAME} Code Signing`,
      type: 'code_signing',
      subjectDid: NEW_DID,
      validityDays: 365,
    });
    console.log(`  Code signing cert: ${codeCert.serialNumber}`);

    // Extract public key
    const publicKeyDer = Buffer.from(
      clientCert.certificate
        .replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, ''),
      'base64'
    );
    const publicKeyMultibase = 'z' + publicKeyDer.toString('base64url');

    // Create exprsnDidCertificates record
    await db.insert(exprsnDidCertificates).values({
      id: nanoid(),
      did: NEW_DID,
      certificateId: clientCert.id,
      certificateType: 'platform',
      publicKeyMultibase,
      status: 'active',
      createdAt: new Date(),
    }).onConflictDoNothing();
    console.log('  Created exprsnDidCertificates record');

    // Create/update plcIdentities
    const [existingPlc] = await db
      .select()
      .from(plcIdentities)
      .where(eq(plcIdentities.did, NEW_DID))
      .limit(1);

    if (!existingPlc) {
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
      }).onConflictDoNothing();
      console.log('  Created plcIdentities record');
    } else {
      console.log('  plcIdentities record already exists');
    }
  }
  console.log();

  // ─── Step 5: Create/update actorRepos for new DID ───
  console.log('Step 5: Setting up actorRepos for did:exprsn...');

  const [newActorRepo] = await db
    .select()
    .from(actorRepos)
    .where(eq(actorRepos.did, NEW_DID))
    .limit(1);

  if (newActorRepo) {
    await db
      .update(actorRepos)
      .set({
        passwordHash,
        handle: HANDLE,
        didMethod: 'exprsn',
        certificateId: clientCert.id,
        updatedAt: new Date(),
      })
      .where(eq(actorRepos.did, NEW_DID));
    console.log(`  Updated actorRepos for ${NEW_DID}`);
  } else {
    await db.insert(actorRepos).values({
      did: NEW_DID,
      handle: HANDLE,
      email: existingActor?.email || 'rickholland@exprsn.io',
      passwordHash,
      signingKeyPublic: '',
      signingKeyPrivate: '',
      didMethod: 'exprsn',
      certificateId: clientCert.id,
      status: 'active',
      isService: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
    console.log(`  Created actorRepos for ${NEW_DID}`);
  }
  console.log();

  // ─── Step 6: Ensure admin access ───
  console.log('Step 6: Ensuring admin access...');

  const [existingAdmin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.userDid, NEW_DID))
    .limit(1);

  if (!existingAdmin) {
    await db.insert(adminUsers).values({
      id: nanoid(),
      userDid: NEW_DID,
      role: 'super_admin',
      permissions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
    console.log(`  Created super_admin record for ${NEW_DID}`);
  } else {
    console.log(`  Admin record exists: role=${existingAdmin.role}`);
  }
  console.log();

  // ─── Summary ───
  console.log('='.repeat(60));
  console.log('Done!');
  console.log('='.repeat(60));
  console.log();
  console.log(`DID:      ${NEW_DID}`);
  console.log(`Handle:   ${HANDLE}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Role:     super_admin`);
  console.log(`Method:   did:exprsn (certificate-backed)`);
  console.log();
  console.log('Login with:');
  console.log(`  Handle: rickholland`);
  console.log(`  Password: ${PASSWORD}`);
  console.log('='.repeat(60));

  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
