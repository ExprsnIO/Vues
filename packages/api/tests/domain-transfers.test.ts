import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/db/index.js';
import { domains, domainTransfers, organizations, users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

describe('Domain Transfers', () => {
  let testDomain: any;
  let testOrg1: any;
  let testOrg2: any;
  let testUser: any;

  beforeAll(async () => {
    // Create test user
    const userId = `did:plc:${nanoid()}`;
    await db.insert(users).values({
      did: userId,
      handle: `test-${nanoid()}.bsky.social`,
      displayName: 'Test User',
      avatar: null,
      description: null,
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      indexedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    [testUser] = await db.select().from(users).where(eq(users.did, userId));

    // Create test organizations
    const org1Id = nanoid();
    await db.insert(organizations).values({
      id: org1Id,
      ownerDid: testUser.did,
      name: `Test Org 1`,
      type: 'team',
      status: 'active',
      memberCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    [testOrg1] = await db.select().from(organizations).where(eq(organizations.id, org1Id));

    const org2Id = nanoid();
    await db.insert(organizations).values({
      id: org2Id,
      ownerDid: testUser.did,
      name: `Test Org 2`,
      type: 'team',
      status: 'active',
      memberCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    [testOrg2] = await db.select().from(organizations).where(eq(organizations.id, org2Id));

    // Create test domain
    const domainId = nanoid();
    await db.insert(domains).values({
      id: domainId,
      name: `Test Domain ${nanoid()}`,
      domain: `test-${nanoid()}.example.com`,
      type: 'hosted',
      status: 'active',
      ownerOrgId: testOrg1.id,
      userCount: 0,
      groupCount: 0,
      certificateCount: 0,
      identityCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    [testDomain] = await db.select().from(domains).where(eq(domains.id, domainId));
  });

  afterAll(async () => {
    // Cleanup
    if (testDomain) {
      await db.delete(domains).where(eq(domains.id, testDomain.id));
    }
    if (testOrg1) {
      await db.delete(organizations).where(eq(organizations.id, testOrg1.id));
    }
    if (testOrg2) {
      await db.delete(organizations).where(eq(organizations.id, testOrg2.id));
    }
    if (testUser) {
      await db.delete(users).where(eq(users.did, testUser.did));
    }
  });

  it('should create a domain transfer', async () => {
    const transferId = nanoid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await db.insert(domainTransfers).values({
      id: transferId,
      domainId: testDomain.id,
      sourceOrganizationId: testOrg1.id,
      sourceUserDid: null,
      targetOrganizationId: testOrg2.id,
      targetUserDid: null,
      status: 'pending',
      initiatedBy: testUser.did,
      reason: 'Test transfer',
      notes: 'Testing domain transfer functionality',
      requiresApproval: true,
      notificationsSent: false,
      remindersSent: 0,
      expiresAt,
    });

    const [transfer] = await db
      .select()
      .from(domainTransfers)
      .where(eq(domainTransfers.id, transferId));

    expect(transfer).toBeDefined();
    expect(transfer.domainId).toBe(testDomain.id);
    expect(transfer.sourceOrganizationId).toBe(testOrg1.id);
    expect(transfer.targetOrganizationId).toBe(testOrg2.id);
    expect(transfer.status).toBe('pending');
    expect(transfer.initiatedBy).toBe(testUser.did);

    // Cleanup
    await db.delete(domainTransfers).where(eq(domainTransfers.id, transferId));
  });

  it('should approve and complete a domain transfer', async () => {
    const transferId = nanoid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create transfer
    await db.insert(domainTransfers).values({
      id: transferId,
      domainId: testDomain.id,
      sourceOrganizationId: testOrg1.id,
      sourceUserDid: null,
      targetOrganizationId: testOrg2.id,
      targetUserDid: null,
      status: 'pending',
      initiatedBy: testUser.did,
      reason: 'Test transfer approval',
      requiresApproval: true,
      notificationsSent: false,
      remindersSent: 0,
      expiresAt,
    });

    // Approve transfer
    await db
      .update(domainTransfers)
      .set({
        status: 'approved',
        approvedBy: testUser.did,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(domainTransfers.id, transferId));

    // Execute transfer - update domain ownership
    await db
      .update(domains)
      .set({
        ownerOrgId: testOrg2.id,
        updatedAt: new Date(),
      })
      .where(eq(domains.id, testDomain.id));

    // Complete transfer
    await db
      .update(domainTransfers)
      .set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(domainTransfers.id, transferId));

    // Verify transfer was completed
    const [transfer] = await db
      .select()
      .from(domainTransfers)
      .where(eq(domainTransfers.id, transferId));

    expect(transfer.status).toBe('completed');
    expect(transfer.approvedBy).toBe(testUser.did);
    expect(transfer.completedAt).toBeDefined();

    // Verify domain ownership changed
    const [updatedDomain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, testDomain.id));

    expect(updatedDomain.ownerOrgId).toBe(testOrg2.id);

    // Cleanup
    await db.delete(domainTransfers).where(eq(domainTransfers.id, transferId));

    // Reset domain ownership for other tests
    await db
      .update(domains)
      .set({ ownerOrgId: testOrg1.id })
      .where(eq(domains.id, testDomain.id));
  });

  it('should reject a domain transfer', async () => {
    const transferId = nanoid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create transfer
    await db.insert(domainTransfers).values({
      id: transferId,
      domainId: testDomain.id,
      sourceOrganizationId: testOrg1.id,
      sourceUserDid: null,
      targetOrganizationId: testOrg2.id,
      targetUserDid: null,
      status: 'pending',
      initiatedBy: testUser.did,
      reason: 'Test transfer rejection',
      requiresApproval: true,
      notificationsSent: false,
      remindersSent: 0,
      expiresAt,
    });

    // Reject transfer
    await db
      .update(domainTransfers)
      .set({
        status: 'rejected',
        rejectedBy: testUser.did,
        rejectedAt: new Date(),
        adminNotes: 'Rejected for testing',
        updatedAt: new Date(),
      })
      .where(eq(domainTransfers.id, transferId));

    // Verify transfer was rejected
    const [transfer] = await db
      .select()
      .from(domainTransfers)
      .where(eq(domainTransfers.id, transferId));

    expect(transfer.status).toBe('rejected');
    expect(transfer.rejectedBy).toBe(testUser.did);
    expect(transfer.rejectedAt).toBeDefined();

    // Verify domain ownership did NOT change
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, testDomain.id));

    expect(domain.ownerOrgId).toBe(testOrg1.id);

    // Cleanup
    await db.delete(domainTransfers).where(eq(domainTransfers.id, transferId));
  });

  it('should make a domain independent', async () => {
    const transferId = nanoid();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Create transfer to make domain independent
    await db.insert(domainTransfers).values({
      id: transferId,
      domainId: testDomain.id,
      sourceOrganizationId: testOrg1.id,
      sourceUserDid: null,
      targetOrganizationId: null, // null = independent
      targetUserDid: null,
      status: 'pending',
      initiatedBy: testUser.did,
      reason: 'Making domain independent',
      requiresApproval: true,
      notificationsSent: false,
      remindersSent: 0,
      expiresAt,
    });

    // Approve and complete
    await db
      .update(domainTransfers)
      .set({
        status: 'approved',
        approvedBy: testUser.did,
        approvedAt: new Date(),
      })
      .where(eq(domainTransfers.id, transferId));

    await db
      .update(domains)
      .set({
        ownerOrgId: null, // Make independent
        updatedAt: new Date(),
      })
      .where(eq(domains.id, testDomain.id));

    await db
      .update(domainTransfers)
      .set({
        status: 'completed',
        completedAt: new Date(),
      })
      .where(eq(domainTransfers.id, transferId));

    // Verify domain is independent
    const [domain] = await db
      .select()
      .from(domains)
      .where(eq(domains.id, testDomain.id));

    expect(domain.ownerOrgId).toBeNull();

    // Cleanup
    await db.delete(domainTransfers).where(eq(domainTransfers.id, transferId));

    // Reset domain ownership
    await db
      .update(domains)
      .set({ ownerOrgId: testOrg1.id })
      .where(eq(domains.id, testDomain.id));
  });
});
