/**
 * Render Presets API Routes
 */

import { Hono } from 'hono';
import { db } from '../db/index.js';
import { renderPresets } from '../db/schema.js';
import { eq, and, or, isNull, desc, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireAuth } from '../auth/middleware.js';

const presetsRouter = new Hono();

// Preset settings type
interface PresetSettings {
  resolution: string;
  quality: string;
  format: string;
  fps: number;
  codec?: string;
  bitrate?: number;
}

/**
 * List all presets (system + user's custom presets)
 * GET /xrpc/io.exprsn.render.listPresets
 */
presetsRouter.get('/xrpc/io.exprsn.render.listPresets', requireAuth, async (c) => {
  const userDid = c.get('did');

  const presets = await db
    .select()
    .from(renderPresets)
    .where(
      or(
        eq(renderPresets.isSystem, true),
        eq(renderPresets.userDid, userDid)
      )
    )
    .orderBy(asc(renderPresets.sortOrder), asc(renderPresets.createdAt));

  // Group into system and user presets
  const systemPresets = presets.filter((p) => p.isSystem);
  const userPresets = presets.filter((p) => !p.isSystem && p.userDid === userDid);

  return c.json({
    systemPresets,
    userPresets,
    defaultPresetId: presets.find((p) => p.isDefault)?.id || 'preset_standard',
  });
});

/**
 * Get a specific preset
 * GET /xrpc/io.exprsn.render.getPreset
 */
presetsRouter.get('/xrpc/io.exprsn.render.getPreset', requireAuth, async (c) => {
  const userDid = c.get('did');
  const presetId = c.req.query('presetId');

  if (!presetId) {
    return c.json({ error: 'presetId is required' }, 400);
  }

  const [preset] = await db
    .select()
    .from(renderPresets)
    .where(eq(renderPresets.id, presetId))
    .limit(1);

  if (!preset) {
    return c.json({ error: 'Preset not found' }, 404);
  }

  // Check access - allow system presets or user's own presets
  if (!preset.isSystem && preset.userDid !== userDid) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  return c.json({ preset });
});

/**
 * Create a custom preset
 * POST /xrpc/io.exprsn.render.createPreset
 */
presetsRouter.post('/xrpc/io.exprsn.render.createPreset', requireAuth, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    name: string;
    description?: string;
    settings: PresetSettings;
  }>();

  if (!body.name || !body.settings) {
    return c.json({ error: 'name and settings are required' }, 400);
  }

  // Validate settings
  const { settings } = body;
  if (!settings.resolution || !settings.quality || !settings.format || !settings.fps) {
    return c.json({ error: 'settings must include resolution, quality, format, and fps' }, 400);
  }

  const presetId = `preset_${nanoid(12)}`;

  const [preset] = await db
    .insert(renderPresets)
    .values({
      id: presetId,
      userDid,
      name: body.name,
      description: body.description,
      settings: body.settings,
      isDefault: false,
      isSystem: false,
    })
    .returning();

  return c.json({ preset }, 201);
});

/**
 * Update a custom preset
 * POST /xrpc/io.exprsn.render.updatePreset
 */
presetsRouter.post('/xrpc/io.exprsn.render.updatePreset', requireAuth, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    presetId: string;
    name?: string;
    description?: string;
    settings?: PresetSettings;
  }>();

  if (!body.presetId) {
    return c.json({ error: 'presetId is required' }, 400);
  }

  // Get existing preset
  const [existing] = await db
    .select()
    .from(renderPresets)
    .where(eq(renderPresets.id, body.presetId))
    .limit(1);

  if (!existing) {
    return c.json({ error: 'Preset not found' }, 404);
  }

  // Can't edit system presets
  if (existing.isSystem) {
    return c.json({ error: 'Cannot edit system presets' }, 403);
  }

  // Can only edit own presets
  if (existing.userDid !== userDid) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const updates: Partial<typeof renderPresets.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.settings !== undefined) updates.settings = body.settings;

  const [preset] = await db
    .update(renderPresets)
    .set(updates)
    .where(eq(renderPresets.id, body.presetId))
    .returning();

  return c.json({ preset });
});

/**
 * Delete a custom preset
 * POST /xrpc/io.exprsn.render.deletePreset
 */
presetsRouter.post('/xrpc/io.exprsn.render.deletePreset', requireAuth, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{ presetId: string }>();

  if (!body.presetId) {
    return c.json({ error: 'presetId is required' }, 400);
  }

  // Get existing preset
  const [existing] = await db
    .select()
    .from(renderPresets)
    .where(eq(renderPresets.id, body.presetId))
    .limit(1);

  if (!existing) {
    return c.json({ error: 'Preset not found' }, 404);
  }

  // Can't delete system presets
  if (existing.isSystem) {
    return c.json({ error: 'Cannot delete system presets' }, 403);
  }

  // Can only delete own presets
  if (existing.userDid !== userDid) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  await db.delete(renderPresets).where(eq(renderPresets.id, body.presetId));

  return c.json({ success: true });
});

/**
 * Set default preset for user
 * POST /xrpc/io.exprsn.render.setDefaultPreset
 */
presetsRouter.post('/xrpc/io.exprsn.render.setDefaultPreset', requireAuth, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{ presetId: string }>();

  if (!body.presetId) {
    return c.json({ error: 'presetId is required' }, 400);
  }

  // Verify preset exists and user can access it
  const [preset] = await db
    .select()
    .from(renderPresets)
    .where(eq(renderPresets.id, body.presetId))
    .limit(1);

  if (!preset) {
    return c.json({ error: 'Preset not found' }, 404);
  }

  if (!preset.isSystem && preset.userDid !== userDid) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  // Clear existing default for user
  await db
    .update(renderPresets)
    .set({ isDefault: false })
    .where(and(eq(renderPresets.userDid, userDid), eq(renderPresets.isDefault, true)));

  // Set new default - for system presets, we create a user preference record
  if (preset.isSystem) {
    // Store user's preferred system preset as a simple preference (could be extended)
    // For now, we just return success as the frontend can track this
    return c.json({ success: true, defaultPresetId: body.presetId });
  }

  // Update user's custom preset
  await db
    .update(renderPresets)
    .set({ isDefault: true })
    .where(eq(renderPresets.id, body.presetId));

  return c.json({ success: true, defaultPresetId: body.presetId });
});

/**
 * Clone a preset (create user copy of system preset)
 * POST /xrpc/io.exprsn.render.clonePreset
 */
presetsRouter.post('/xrpc/io.exprsn.render.clonePreset', requireAuth, async (c) => {
  const userDid = c.get('did');
  const body = await c.req.json<{
    presetId: string;
    name?: string;
  }>();

  if (!body.presetId) {
    return c.json({ error: 'presetId is required' }, 400);
  }

  // Get source preset
  const [source] = await db
    .select()
    .from(renderPresets)
    .where(eq(renderPresets.id, body.presetId))
    .limit(1);

  if (!source) {
    return c.json({ error: 'Preset not found' }, 404);
  }

  // Check access
  if (!source.isSystem && source.userDid !== userDid) {
    return c.json({ error: 'Not authorized' }, 403);
  }

  const newPresetId = `preset_${nanoid(12)}`;
  const newName = body.name || `${source.name} (Copy)`;

  const [preset] = await db
    .insert(renderPresets)
    .values({
      id: newPresetId,
      userDid,
      name: newName,
      description: source.description,
      settings: source.settings,
      isDefault: false,
      isSystem: false,
    })
    .returning();

  return c.json({ preset }, 201);
});

export { presetsRouter };
