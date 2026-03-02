import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { authMiddleware } from '../auth/middleware.js';
import {
  db,
  contentReports,
  userSanctions,
  moderationAppeals,
  users,
} from '../db/index.js';
import { eq, desc, and, or, gte, sql, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const userModerationRouter = new Hono();

// =============================================================================
// User Moderation Endpoints
// =============================================================================

/**
 * Get reports submitted by the current user
 * GET /xrpc/io.exprsn.user.moderation.getMyReports
 */
userModerationRouter.get('/io.exprsn.user.moderation.getMyReports', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const status = c.req.query('status'); // Optional filter: 'pending' | 'reviewed' | 'actioned' | 'dismissed'

  let query = db
    .select({
      id: contentReports.id,
      contentType: contentReports.contentType,
      contentUri: contentReports.contentUri,
      reason: contentReports.reason,
      description: contentReports.description,
      status: contentReports.status,
      actionTaken: contentReports.actionTaken,
      createdAt: contentReports.createdAt,
      reviewedAt: contentReports.reviewedAt,
    })
    .from(contentReports)
    .where(
      status
        ? and(eq(contentReports.reporterDid, userDid), eq(contentReports.status, status))
        : eq(contentReports.reporterDid, userDid)
    )
    .orderBy(desc(contentReports.createdAt))
    .limit(limit + 1);

  if (cursor) {
    const cursorDate = new Date(cursor);
    query = db
      .select({
        id: contentReports.id,
        contentType: contentReports.contentType,
        contentUri: contentReports.contentUri,
        reason: contentReports.reason,
        description: contentReports.description,
        status: contentReports.status,
        actionTaken: contentReports.actionTaken,
        createdAt: contentReports.createdAt,
        reviewedAt: contentReports.reviewedAt,
      })
      .from(contentReports)
      .where(
        status
          ? and(
              eq(contentReports.reporterDid, userDid),
              eq(contentReports.status, status),
              sql`${contentReports.createdAt} < ${cursorDate}`
            )
          : and(
              eq(contentReports.reporterDid, userDid),
              sql`${contentReports.createdAt} < ${cursorDate}`
            )
      )
      .orderBy(desc(contentReports.createdAt))
      .limit(limit + 1);
  }

  const reports = await query;

  const hasMore = reports.length > limit;
  const resultReports = hasMore ? reports.slice(0, limit) : reports;

  return c.json({
    reports: resultReports.map((report) => ({
      id: report.id,
      contentType: report.contentType,
      contentUri: report.contentUri,
      reason: report.reason,
      description: report.description,
      status: report.status,
      actionTaken: report.actionTaken,
      createdAt: report.createdAt?.toISOString(),
      reviewedAt: report.reviewedAt?.toISOString(),
    })),
    cursor: hasMore ? resultReports[resultReports.length - 1]?.createdAt?.toISOString() : undefined,
  });
});

/**
 * Get account status (sanctions/warnings) for the current user
 * GET /xrpc/io.exprsn.user.moderation.getAccountStatus
 */
userModerationRouter.get('/io.exprsn.user.moderation.getAccountStatus', authMiddleware, async (c) => {
  const userDid = c.get('did');

  // Get current time for filtering active sanctions
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Get all sanctions for this user (active + last 90 days)
  const sanctions = await db
    .select({
      id: userSanctions.id,
      sanctionType: userSanctions.sanctionType,
      reason: userSanctions.reason,
      expiresAt: userSanctions.expiresAt,
      appealStatus: userSanctions.appealStatus,
      createdAt: userSanctions.createdAt,
    })
    .from(userSanctions)
    .where(
      and(
        eq(userSanctions.userDid, userDid),
        or(
          // Active sanctions (not expired or no expiry)
          isNull(userSanctions.expiresAt),
          gte(userSanctions.expiresAt, now),
          // Or recent sanctions (last 90 days)
          gte(userSanctions.createdAt, ninetyDaysAgo)
        )
      )
    )
    .orderBy(desc(userSanctions.createdAt));

  // Separate active and historical sanctions
  const activeSanctions = sanctions.filter((s) => {
    if (!s.expiresAt) return true; // Permanent
    return new Date(s.expiresAt) > now;
  });

  const historicalSanctions = sanctions.filter((s) => {
    if (!s.expiresAt) return false;
    return new Date(s.expiresAt) <= now;
  });

  // Calculate account standing
  const hasActiveSanctions = activeSanctions.length > 0;
  const accountStanding = hasActiveSanctions
    ? activeSanctions.some((s) => s.sanctionType === 'ban' || s.sanctionType === 'suspend')
      ? 'restricted'
      : 'warning'
    : 'good';

  return c.json({
    accountStanding,
    activeSanctions: activeSanctions.map((s) => ({
      id: s.id,
      type: s.sanctionType,
      reason: s.reason,
      expiresAt: s.expiresAt?.toISOString(),
      appealStatus: s.appealStatus,
      createdAt: s.createdAt?.toISOString(),
      canAppeal: !s.appealStatus || s.appealStatus === 'denied', // Can re-appeal if denied
    })),
    sanctionHistory: historicalSanctions.map((s) => ({
      id: s.id,
      type: s.sanctionType,
      reason: s.reason,
      expiresAt: s.expiresAt?.toISOString(),
      appealStatus: s.appealStatus,
      createdAt: s.createdAt?.toISOString(),
    })),
  });
});

/**
 * Submit an appeal for a sanction
 * POST /xrpc/io.exprsn.user.moderation.submitAppeal
 */
userModerationRouter.post('/io.exprsn.user.moderation.submitAppeal', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const { sanctionId, reason, additionalInfo } = await c.req.json();

  if (!sanctionId) {
    throw new HTTPException(400, { message: 'sanctionId is required' });
  }

  if (!reason || reason.trim().length < 50) {
    throw new HTTPException(400, { message: 'Appeal reason must be at least 50 characters' });
  }

  // Get the sanction
  const sanction = await db.query.userSanctions.findFirst({
    where: and(
      eq(userSanctions.id, sanctionId),
      eq(userSanctions.userDid, userDid)
    ),
  });

  if (!sanction) {
    throw new HTTPException(404, { message: 'Sanction not found' });
  }

  // Check if already appealed and pending
  if (sanction.appealStatus === 'pending') {
    throw new HTTPException(400, { message: 'You already have a pending appeal for this sanction' });
  }

  // Check for existing appeals for this sanction
  const existingAppeal = await db.query.moderationAppeals.findFirst({
    where: and(
      eq(moderationAppeals.sanctionId, sanctionId),
      eq(moderationAppeals.status, 'pending')
    ),
  });

  if (existingAppeal) {
    throw new HTTPException(400, { message: 'An appeal is already pending for this sanction' });
  }

  const appealId = nanoid();
  const now = new Date();

  // Create the appeal
  await db.insert(moderationAppeals).values({
    id: appealId,
    sanctionId,
    userId: userDid,
    reason: reason.trim(),
    additionalInfo: additionalInfo?.trim() || null,
    status: 'pending',
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // Update the sanction's appeal status
  await db
    .update(userSanctions)
    .set({ appealStatus: 'pending' })
    .where(eq(userSanctions.id, sanctionId));

  return c.json({
    success: true,
    appealId,
    message: 'Your appeal has been submitted and will be reviewed.',
  });
});

/**
 * Get user's submitted appeals
 * GET /xrpc/io.exprsn.user.moderation.getMyAppeals
 */
userModerationRouter.get('/io.exprsn.user.moderation.getMyAppeals', authMiddleware, async (c) => {
  const userDid = c.get('did');
  const cursor = c.req.query('cursor');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

  let whereCondition = eq(moderationAppeals.userId, userDid);

  if (cursor) {
    const cursorDate = new Date(cursor);
    whereCondition = and(
      eq(moderationAppeals.userId, userDid),
      sql`${moderationAppeals.submittedAt} < ${cursorDate}`
    ) as typeof whereCondition;
  }

  const appeals = await db
    .select({
      id: moderationAppeals.id,
      sanctionId: moderationAppeals.sanctionId,
      reason: moderationAppeals.reason,
      additionalInfo: moderationAppeals.additionalInfo,
      status: moderationAppeals.status,
      decision: moderationAppeals.decision,
      reviewNotes: moderationAppeals.reviewNotes,
      reviewedAt: moderationAppeals.reviewedAt,
      submittedAt: moderationAppeals.submittedAt,
    })
    .from(moderationAppeals)
    .where(whereCondition)
    .orderBy(desc(moderationAppeals.submittedAt))
    .limit(limit + 1);

  const hasMore = appeals.length > limit;
  const resultAppeals = hasMore ? appeals.slice(0, limit) : appeals;

  // Get associated sanction details
  const sanctionIds = resultAppeals.filter((a) => a.sanctionId).map((a) => a.sanctionId!);
  let sanctionMap: Record<string, { type: string; reason: string }> = {};

  if (sanctionIds.length > 0) {
    const sanctionsData = await db
      .select({
        id: userSanctions.id,
        type: userSanctions.sanctionType,
        reason: userSanctions.reason,
      })
      .from(userSanctions)
      .where(sql`${userSanctions.id} IN ${sanctionIds}`);

    sanctionMap = sanctionsData.reduce((acc, s) => {
      acc[s.id] = { type: s.type, reason: s.reason };
      return acc;
    }, {} as Record<string, { type: string; reason: string }>);
  }

  return c.json({
    appeals: resultAppeals.map((appeal) => ({
      id: appeal.id,
      sanctionId: appeal.sanctionId,
      sanction: appeal.sanctionId ? sanctionMap[appeal.sanctionId] : undefined,
      reason: appeal.reason,
      additionalInfo: appeal.additionalInfo,
      status: appeal.status,
      decision: appeal.decision,
      reviewNotes: appeal.reviewNotes,
      reviewedAt: appeal.reviewedAt?.toISOString(),
      submittedAt: appeal.submittedAt?.toISOString(),
    })),
    cursor: hasMore ? resultAppeals[resultAppeals.length - 1]?.submittedAt?.toISOString() : undefined,
  });
});
