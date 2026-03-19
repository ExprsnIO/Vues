/**
 * Provision Exprsn.io Service
 *
 * Creates:
 * 1. Fresh Root CA + Intermediate CA for Exprsn.io
 * 2. rickholland super_admin with did:exprsn (client + code signing certs)
 * 3. Exprsn.io enterprise organization owned by rickholland
 * 4. Domain record for exprsn.io
 * 5. Writes .env with all services enabled for localhost
 *
 * Run: cd packages/api && npx tsx scripts/provision-exprsn.ts
 */

import { db } from '../src/db/index.js';
import {
  users,
  actorRepos,
  adminUsers,
  organizations,
  organizationMembers,
  organizationRoles,
  domains,
  plcIdentities,
  exprsnDidCertificates,
  caRootCertificates,
  caIntermediateCertificates,
  caEntityCertificates,
  organizationIntermediateCAs,
  sessions,
  userSettings,
  setupState,
  systemConfig,
} from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { certificateManager } from '../src/services/ca/CertificateManager.js';
import { generateSessionTokens } from '../src/utils/session-tokens.js';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

// ════════════════════════════════════════════
// Configuration
// ════════════════════════════════════════════

const HANDLE = 'rickholland';
const EMAIL = 'me@rickholland.net';
const PASSWORD = 'exprsn2026';
const DISPLAY_NAME = 'Rick Holland';
const DID = 'did:exprsn:rickholland';

const ORG_NAME = 'Exprsn.io';
const ORG_TYPE = 'enterprise';
const ORG_DOMAIN = 'exprsn.io';

const ENV_PATH = resolve(process.cwd(), '.env');

// ════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════

function log(msg: string) { console.log(`  ${msg}`); }
function ok(msg: string) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function warn(msg: string) { console.log(`  \x1b[33m⚠\x1b[0m ${msg}`); }
function step(n: number, title: string) {
  console.log(`\n\x1b[36m━━━ Step ${n}: ${title} ━━━\x1b[0m`);
}

// ════════════════════════════════════════════
// Main
// ════════════════════════════════════════════

async function main() {
  console.log('\n\x1b[1m╔══════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[1m║   Provisioning Exprsn.io Service          ║\x1b[0m');
  console.log('\x1b[1m╚══════════════════════════════════════════╝\x1b[0m');

  // ── Step 1: Clean old certificates ──
  step(1, 'Clean Old Certificates');

  log('Deleting old entity certificates...');
  await db.delete(caEntityCertificates).execute();
  ok('Entity certificates cleared');

  log('Deleting old intermediate CAs...');
  await db.delete(caIntermediateCertificates).execute();
  ok('Intermediate CAs cleared');

  log('Deleting old org intermediate CA links...');
  await db.delete(organizationIntermediateCAs).execute();
  ok('Org CA links cleared');

  log('Deleting old exprsn DID certificates...');
  await db.delete(exprsnDidCertificates).execute();
  ok('DID certificates cleared');

  log('Deleting old root certificates...');
  await db.delete(caRootCertificates).execute();
  ok('Root certificates cleared');

  // ── Step 2: Create new Root CA ──
  step(2, 'Create Root CA for Exprsn.io');

  const rootCA = await certificateManager.ensureRootCA();
  ok(`Root CA created: ${rootCA.serialNumber}`);
  ok(`Fingerprint: ${rootCA.fingerprint}`);

  // ── Step 3: Create rickholland user (must exist before certs due to FK) ──
  step(3, 'Create rickholland User');

  // Clean existing user data
  await db.delete(sessions).where(eq(sessions.did, DID)).execute().catch(() => {});
  await db.delete(adminUsers).where(eq(adminUsers.userDid, DID)).execute().catch(() => {});
  await db.delete(plcIdentities).where(eq(plcIdentities.did, DID)).execute().catch(() => {});
  await db.delete(actorRepos).where(eq(actorRepos.did, DID)).execute().catch(() => {});
  await db.delete(users).where(eq(users.did, DID)).execute().catch(() => {});
  // Also clean old DID formats
  await db.delete(sessions).where(eq(sessions.did, 'did:plc:rickholland')).execute().catch(() => {});
  await db.delete(adminUsers).where(eq(adminUsers.userDid, 'did:plc:rickholland')).execute().catch(() => {});
  await db.delete(actorRepos).where(eq(actorRepos.did, 'did:plc:rickholland')).execute().catch(() => {});
  await db.delete(users).where(eq(users.did, 'did:plc:rickholland')).execute().catch(() => {});
  await db.delete(users).where(eq(users.handle, HANDLE)).execute().catch(() => {});
  ok('Cleaned old user records');

  // Create user record FIRST (required by FK on ca_entity_certificates)
  await db.insert(users).values({
    did: DID,
    handle: HANDLE,
    displayName: DISPLAY_NAME,
    bio: 'Founder of Exprsn',
    avatar: null,
    verified: true,
    followerCount: 0,
    followingCount: 0,
    videoCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    indexedAt: new Date(),
  }).onConflictDoNothing();
  ok('User record created');

  // Issue client certificate for rickholland
  const clientCert = await certificateManager.issueEntityCertificate({
    commonName: `@${HANDLE}.${ORG_DOMAIN}`,
    type: 'client',
    subjectDid: DID,
    email: EMAIL,
    validityDays: 365,
  });
  ok(`Client certificate: ${clientCert.serialNumber}`);

  // Issue code signing certificate
  const codeCert = await certificateManager.issueEntityCertificate({
    commonName: `@${HANDLE}.${ORG_DOMAIN} Code Signing`,
    type: 'code_signing',
    subjectDid: DID,
    validityDays: 365,
  });
  ok(`Code signing certificate: ${codeCert.serialNumber}`);

  // Extract public key for DID document
  const publicKeyDer = Buffer.from(
    clientCert.certificate
      .replace(/-----BEGIN CERTIFICATE-----/, '')
      .replace(/-----END CERTIFICATE-----/, '')
      .replace(/\s/g, ''),
    'base64'
  );
  const publicKeyMultibase = 'z' + publicKeyDer.toString('base64url');

  // Hash password
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Generate signing keys
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Create actor repo
  await db.insert(actorRepos).values({
    did: DID,
    handle: HANDLE,
    email: EMAIL,
    passwordHash,
    signingKeyPublic: publicKey,
    signingKeyPrivate: privateKey,
    didMethod: 'exprsn',
    certificateId: clientCert.id,
    status: 'active',
    isService: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();
  ok('Actor repo created');

  // Create PLC identity
  await db.insert(plcIdentities).values({
    did: DID,
    handle: `${HANDLE}.${ORG_DOMAIN}`,
    pdsEndpoint: `https://${ORG_DOMAIN}`,
    signingKey: publicKeyMultibase,
    rotationKeys: [publicKeyMultibase],
    alsoKnownAs: [`at://${HANDLE}.${ORG_DOMAIN}`],
    services: {
      atproto_pds: {
        type: 'AtprotoPersonalDataServer',
        endpoint: `https://${ORG_DOMAIN}`,
      },
    },
    certificateId: clientCert.id,
    certificateFingerprint: clientCert.fingerprint,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();
  ok('PLC identity created');

  // Create DID certificate link
  await db.insert(exprsnDidCertificates).values({
    id: nanoid(),
    did: DID,
    certificateId: clientCert.id,
    certificateType: 'platform',
    publicKeyMultibase,
    status: 'active',
    createdAt: new Date(),
  }).onConflictDoNothing();
  ok('DID certificate linked');

  // Create super_admin role
  await db.insert(adminUsers).values({
    id: nanoid(),
    userDid: DID,
    role: 'super_admin',
    permissions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();
  ok('super_admin role assigned');

  // Create session
  const { accessToken, refreshToken, accessTokenHash, refreshTokenHash } = generateSessionTokens();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(sessions).values({
    id: nanoid(),
    did: DID,
    accessJwt: accessTokenHash,
    refreshJwt: refreshTokenHash,
    expiresAt,
  });
  ok(`Session created (token: ${accessToken.slice(0, 20)}...)`);

  // Create user settings
  await db.insert(userSettings).values({
    userDid: DID,
    themeId: 'slate',
    colorMode: 'dark',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();
  ok('User settings initialized');

  // ── Step 5: Create Exprsn.io Organization ──
  step(5, 'Create Exprsn.io Organization');

  const orgId = nanoid();
  await db.insert(organizations).values({
    id: orgId,
    name: ORG_NAME,
    type: ORG_TYPE,
    description: 'The official Exprsn platform organization',
    ownerDid: DID,
    verified: true,
    memberCount: 1,
    apiAccessEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();
  ok(`Organization created: ${ORG_NAME} (${orgId})`);

  // Create owner membership
  const ownerRoleId = nanoid();
  await db.insert(organizationRoles).values({
    id: ownerRoleId,
    organizationId: orgId,
    name: 'owner',
    displayName: 'Owner',
    permissions: ['*'],
    isSystem: true,
    priority: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  await db.insert(organizationMembers).values({
    id: nanoid(),
    organizationId: orgId,
    userDid: DID,
    role: 'owner',
    roleId: ownerRoleId,
    status: 'active',
    joinedAt: new Date(),
  }).onConflictDoNothing();
  ok('rickholland added as owner');

  // ── Step 6: Create Domain ──
  step(6, 'Create exprsn.io Domain');

  const domainId = nanoid();
  await db.insert(domains).values({
    id: domainId,
    name: ORG_NAME,
    domain: ORG_DOMAIN,
    type: 'hosted',
    status: 'active',
    ownerType: 'organization',
    ownerOrganizationId: orgId,
    verifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();
  ok(`Domain created: ${ORG_DOMAIN}`);

  // ── Step 7: Create Organization Intermediate CA ──
  step(7, 'Create Organization Intermediate CA');

  // Create a proper intermediate CA (not an entity cert)
  const orgIntermediateCA = await certificateManager.createIntermediateCA({
    commonName: `${ORG_NAME} CA`,
    organization: ORG_NAME,
    organizationalUnit: 'Identity',
    validityDays: 3650,
    pathLength: 0,
  });
  ok(`Intermediate CA certificate: ${orgIntermediateCA.serialNumber}`);

  // Link org to intermediate CA
  await db.insert(organizationIntermediateCAs).values({
    id: nanoid(),
    organizationId: orgId,
    intermediateCertId: orgIntermediateCA.id,
    commonName: `${ORG_NAME} CA`,
    createdAt: new Date(),
  }).onConflictDoNothing();
  ok('Organization CA linked');

  // Update rickholland's DID cert to be issued by the org CA
  await db.update(exprsnDidCertificates)
    .set({
      issuerIntermediateId: orgIntermediateCA.id,
      certificateType: 'organization',
      organizationId: orgId,
    })
    .where(eq(exprsnDidCertificates.did, DID));
  ok('rickholland cert linked to org CA');

  // ── Step 8: Create prefetch worker service account ──
  step(8, 'Create Service Accounts');

  const prefetchDid = 'did:exprsn:prefetch-worker';
  await db.delete(actorRepos).where(eq(actorRepos.did, prefetchDid)).execute().catch(() => {});
  await db.insert(actorRepos).values({
    did: prefetchDid,
    handle: 'prefetch-worker.internal',
    email: 'prefetch@internal.exprsn.io',
    passwordHash: '',
    signingKeyPublic: '',
    signingKeyPrivate: '',
    didMethod: 'exprsn',
    status: 'active',
    isService: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  const { accessToken: prefetchToken, accessTokenHash: prefetchHash, refreshTokenHash: prefetchRefreshHash } = generateSessionTokens();
  await db.insert(sessions).values({
    id: nanoid(),
    did: prefetchDid,
    accessJwt: prefetchHash,
    refreshJwt: prefetchRefreshHash,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  });
  ok(`Prefetch worker token: ${prefetchToken}`);

  // ── Step 9: Mark setup complete ──
  step(9, 'Finalize Setup State');

  await db.delete(setupState).where(eq(setupState.id, 'singleton')).execute().catch(() => {});
  await db.insert(setupState).values({
    id: 'singleton',
    status: 'completed',
    currentStep: 5,
    completedSteps: ['prerequisites', 'certificates', 'admin', 'services', 'finalize'],
    completedAt: new Date(),
    completedBy: DID,
  }).onConflictDoNothing();
  ok('Setup marked as completed');

  // Save service config
  await db.delete(systemConfig).where(eq(systemConfig.key, 'services')).execute().catch(() => {});
  await db.insert(systemConfig).values({
    key: 'services',
    value: {
      federation: true,
      studio: true,
      render_pipeline: true,
      spark_messaging: true,
      ai_moderation: false,
      email_notifications: true,
      live_streaming: true,
      analytics: true,
      prefetch: true,
      push_notifications: true,
      search: true,
    },
    description: 'Enabled platform services',
    updatedAt: new Date(),
  }).onConflictDoNothing();
  ok('Service configuration saved');

  // ── Step 10: Write .env ──
  step(10, 'Write Environment File');

  const jwtSecret = crypto.randomBytes(32).toString('base64');
  const encryptionKey = crypto.randomBytes(32).toString('hex');

  const envContent = `# ══════════════════════════════════════════
# Exprsn.io — Generated by provision script
# ${new Date().toISOString()}
# ══════════════════════════════════════════

# Server
PORT=3002
HOST=0.0.0.0
APP_URL=http://localhost:3002
NODE_ENV=development
DEV_AUTH_BYPASS=true

# Platform
PLATFORM_NAME=Exprsn.io
PLATFORM_ACCENT_COLOR=#f83b85

# Database
DATABASE_URL=postgresql://exprsn:exprsn2026@localhost:5432/exprsn

# Redis
REDIS_URL=redis://localhost:6379

# Object Storage (MinIO)
DO_SPACES_REGION=nyc3
DO_SPACES_BUCKET=exprsn-uploads
DO_SPACES_PROCESSED_BUCKET=exprsn-processed
DO_SPACES_KEY=minioadmin
DO_SPACES_SECRET=minioadmin
DO_SPACES_ENDPOINT=http://localhost:9000
DO_SPACES_CDN=http://localhost:9000/exprsn-processed

# PDS / Federation
PDS_ENABLED=true
PDS_DOMAIN=localhost:3002
PDS_DATA_PATH=./data
RELAY_ENABLED=true
RELAY_MAX_BACKFILL=10000
PLC_URL=https://plc.directory
SERVICE_DOMAIN=localhost:3002
SERVICE_DID=did:web:localhost:3002
FEDERATION_CONSUMER_ENABLED=false

# Identity
DID_CACHE_TTL=3600
DID_STALE_TTL=86400

# Security
JWT_SECRET=${jwtSecret}
ENCRYPTION_KEY=${encryptionKey}

# Email (MailHog)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
EMAIL_FROM=noreply@exprsn.io
EMAIL_DIGEST_ENABLED=true

# Search
OPENSEARCH_URL=http://localhost:9200

# Services
PREFETCH_PRODUCER_ENABLED=true
PREFETCH_AUTH_TOKEN=${prefetchToken}
TRANSCODE_WORKER_ENABLED=true
TRANSCODE_WORKER_CONCURRENCY=2
RENDER_ENABLED=true
STREAM_EVENTS_WORKER_ENABLED=true

# OAuth (generate keys for production)
ATPROTO_SERVICE_ENDPOINT=http://localhost:3002
OAUTH_ISSUER=http://localhost:3002

# Caching
CACHE_DID_TTL=3600
CACHE_PROFILE_TTL=300
CACHE_FEED_TTL=60
CACHE_TRENDING_TTL=300
CACHE_PREFIX=exprsn:

# Blob Storage
BLOB_STORAGE_TYPE=local
BLOB_STORAGE_PATH=./data/blobs

# Logging
LOG_LEVEL=debug
`;

  await writeFile(ENV_PATH, envContent);
  ok(`.env written to ${ENV_PATH}`);

  // ── Summary ──
  console.log('\n\x1b[1m══════════════════════════════════════════\x1b[0m');
  console.log('\x1b[1m  Provisioning Complete\x1b[0m');
  console.log('\x1b[1m══════════════════════════════════════════\x1b[0m');
  console.log(`
  \x1b[36mUser:\x1b[0m
    Handle:       ${HANDLE}
    Email:        ${EMAIL}
    Password:     ${PASSWORD}
    DID:          ${DID}
    Role:         super_admin
    Client Cert:  ${clientCert.serialNumber}
    Code Sign:    ${codeCert.serialNumber}

  \x1b[36mOrganization:\x1b[0m
    Name:         ${ORG_NAME}
    Type:         ${ORG_TYPE}
    Domain:       ${ORG_DOMAIN}
    Owner:        ${HANDLE}

  \x1b[36mCertificate Authority:\x1b[0m
    Root CA:      ${rootCA.serialNumber}
    Fingerprint:  ${rootCA.fingerprint}

  \x1b[36mServices:\x1b[0m
    Federation, Studio, Render, Messaging, Email,
    Live Streaming, Analytics, Prefetch, Push, Search

  \x1b[36mLogin:\x1b[0m
    Handle: ${HANDLE}
    Password: ${PASSWORD}
    Token: ${accessToken}

  \x1b[32mRestart the API server to apply the new .env\x1b[0m
`);

  process.exit(0);
}

main().catch((err) => {
  console.error('\n\x1b[31m✗ Provisioning failed:\x1b[0m', err);
  process.exit(1);
});
