/**
 * Public Invite Code Routes
 * Handles validation and usage of invite codes
 */

import { Hono } from 'hono';
import { inviteCodeService } from '../services/invites/InviteCodeService.js';
import { authMiddleware } from '../auth/middleware.js';

export const inviteCodeRouter = new Hono();

// Validate an invite code (public endpoint)
inviteCodeRouter.post('/io.exprsn.inviteCodes.validate', async (c) => {
  const body = await c.req.json();

  if (!body.code) {
    return c.json(
      {
        error: 'InvalidRequest',
        message: 'Missing invite code',
      },
      400
    );
  }

  try {
    const validation = await inviteCodeService.validateInviteCode(body.code);

    return c.json({
      valid: validation.valid,
      reason: validation.reason,
      inviteCode: validation.inviteCode,
    });
  } catch (error) {
    console.error('Failed to validate invite code:', error);
    return c.json(
      {
        error: 'ValidationFailed',
        message: 'Failed to validate invite code',
      },
      500
    );
  }
});

// Use an invite code (requires authentication)
inviteCodeRouter.post('/io.exprsn.inviteCodes.use', authMiddleware, async (c) => {
  const did = c.get('did');
  const body = await c.req.json();

  if (!body.code) {
    return c.json(
      {
        error: 'InvalidRequest',
        message: 'Missing invite code',
      },
      400
    );
  }

  try {
    const result = await inviteCodeService.useInviteCode(body.code, did);

    if (!result.success) {
      return c.json(
        {
          error: 'UsageFailed',
          message: result.reason || 'Failed to use invite code',
        },
        400
      );
    }

    return c.json({
      success: true,
      message: 'Invite code used successfully',
    });
  } catch (error) {
    console.error('Failed to use invite code:', error);
    return c.json(
      {
        error: 'UsageFailed',
        message: 'Failed to use invite code',
      },
      500
    );
  }
});
