/**
 * Admin Themes Routes
 * WYSIWYG Theme configuration for platform branding
 */

import { Hono } from 'hono';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { themes, adminAuditLog, type ThemeConfig, type Theme } from '../db/schema.js';
import {
  adminAuthMiddleware,
  requirePermission,
  ADMIN_PERMISSIONS,
} from '../auth/middleware.js';

export const adminThemesRouter = new Hono();

// Apply admin auth to all routes
adminThemesRouter.use('*', adminAuthMiddleware);

// ============================================
// Helper Functions
// ============================================

async function logAudit(
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown>,
  c: { req: { header: (name: string) => string | undefined } }
) {
  await db.insert(adminAuditLog).values({
    id: nanoid(),
    adminId,
    action,
    targetType,
    targetId,
    details,
    ipAddress: c.req.header('x-forwarded-for') || c.req.header('x-real-ip'),
    userAgent: c.req.header('user-agent'),
  });
}

// Default theme configurations
const DEFAULT_LIGHT_THEME: ThemeConfig = {
  colors: {
    background: '#ffffff',
    surface: '#f9fafb',
    surfaceHover: '#f3f4f6',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    textInverse: '#ffffff',
    accent: '#3b82f6',
    accentHover: '#2563eb',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#06b6d4',
    border: '#e5e7eb',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    headingFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    monoFontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", "Droid Sans Mono", monospace',
    baseFontSize: '16px',
  },
  spacing: {
    borderRadius: '8px',
    containerPadding: '16px',
  },
};

const DEFAULT_DARK_THEME: ThemeConfig = {
  colors: {
    background: '#09090b',
    surface: '#18181b',
    surfaceHover: '#27272a',
    textPrimary: '#fafafa',
    textSecondary: '#a1a1aa',
    textMuted: '#71717a',
    textInverse: '#09090b',
    accent: '#3b82f6',
    accentHover: '#2563eb',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#06b6d4',
    border: '#27272a',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    headingFontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    monoFontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", "Droid Sans Mono", monospace',
    baseFontSize: '16px',
  },
  spacing: {
    borderRadius: '8px',
    containerPadding: '16px',
  },
};

// ============================================
// THEME MANAGEMENT
// ============================================

/**
 * List all themes
 */
adminThemesRouter.get(
  '/io.exprsn.admin.themes.list',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const domainId = c.req.query('domainId');
    const includeGlobal = c.req.query('includeGlobal') !== 'false';
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    let query = db.select().from(themes);

    const conditions = [];
    if (domainId) {
      if (includeGlobal) {
        conditions.push(
          sql`${themes.domainId} = ${domainId} OR ${themes.domainId} IS NULL`
        );
      } else {
        conditions.push(eq(themes.domainId, domainId));
      }
    } else if (!includeGlobal) {
      conditions.push(sql`${themes.domainId} IS NULL`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query
      .orderBy(desc(themes.isDefault), desc(themes.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: count() })
      .from(themes)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    return c.json({
      themes: results.map((theme) => ({
        id: theme.id,
        name: theme.name,
        description: theme.description,
        domainId: theme.domainId,
        isDefault: theme.isDefault,
        isDark: theme.isDark,
        config: theme.config,
        createdBy: theme.createdBy,
        createdAt: theme.createdAt.toISOString(),
        updatedAt: theme.updatedAt.toISOString(),
      })),
      total: countResult?.count || 0,
    });
  }
);

/**
 * Get a single theme by ID
 */
adminThemesRouter.get(
  '/io.exprsn.admin.themes.get',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    const id = c.req.query('id');

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing theme id' }, 400);
    }

    const [theme] = await db
      .select()
      .from(themes)
      .where(eq(themes.id, id))
      .limit(1);

    if (!theme) {
      return c.json({ error: 'NotFound', message: 'Theme not found' }, 404);
    }

    return c.json({
      id: theme.id,
      name: theme.name,
      description: theme.description,
      domainId: theme.domainId,
      isDefault: theme.isDefault,
      isDark: theme.isDark,
      config: theme.config,
      createdBy: theme.createdBy,
      createdAt: theme.createdAt.toISOString(),
      updatedAt: theme.updatedAt.toISOString(),
    });
  }
);

/**
 * Create a new theme
 */
adminThemesRouter.post(
  '/io.exprsn.admin.themes.create',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      name: string;
      description?: string;
      domainId?: string;
      isDark?: boolean;
      config: ThemeConfig;
      setAsDefault?: boolean;
    }>();

    if (!body.name || !body.config) {
      return c.json(
        { error: 'InvalidRequest', message: 'Missing name or config' },
        400
      );
    }

    // Validate config structure
    if (
      !body.config.colors ||
      !body.config.typography ||
      !body.config.spacing
    ) {
      return c.json(
        {
          error: 'InvalidRequest',
          message: 'Invalid theme config structure',
        },
        400
      );
    }

    const id = nanoid();

    // If setting as default, unset other defaults for this domain
    if (body.setAsDefault) {
      await db
        .update(themes)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          body.domainId
            ? eq(themes.domainId, body.domainId)
            : sql`${themes.domainId} IS NULL`
        );
    }

    await db.insert(themes).values({
      id,
      name: body.name,
      description: body.description,
      domainId: body.domainId || null,
      isDark: body.isDark ?? true,
      isDefault: body.setAsDefault ?? false,
      config: body.config,
      createdBy: adminUser.userDid,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await logAudit(adminUser.id, 'theme_created', 'theme', id, { name: body.name }, c);

    const [theme] = await db
      .select()
      .from(themes)
      .where(eq(themes.id, id))
      .limit(1);

    return c.json(theme);
  }
);

/**
 * Update an existing theme
 */
adminThemesRouter.post(
  '/io.exprsn.admin.themes.update',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const body = await c.req.json<{
      id: string;
      name?: string;
      description?: string;
      isDark?: boolean;
      config?: ThemeConfig;
    }>();

    if (!body.id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing theme id' }, 400);
    }

    const [existingTheme] = await db
      .select()
      .from(themes)
      .where(eq(themes.id, body.id))
      .limit(1);

    if (!existingTheme) {
      return c.json({ error: 'NotFound', message: 'Theme not found' }, 404);
    }

    // Validate config structure if provided
    if (body.config) {
      if (
        !body.config.colors ||
        !body.config.typography ||
        !body.config.spacing
      ) {
        return c.json(
          {
            error: 'InvalidRequest',
            message: 'Invalid theme config structure',
          },
          400
        );
      }
    }

    const updates: Partial<Theme> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.isDark !== undefined) updates.isDark = body.isDark;
    if (body.config !== undefined) updates.config = body.config;

    await db.update(themes).set(updates).where(eq(themes.id, body.id));

    await logAudit(adminUser.id, 'theme_updated', 'theme', body.id, updates, c);

    const [theme] = await db
      .select()
      .from(themes)
      .where(eq(themes.id, body.id))
      .limit(1);

    return c.json(theme);
  }
);

/**
 * Delete a theme
 */
adminThemesRouter.post(
  '/io.exprsn.admin.themes.delete',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing theme id' }, 400);
    }

    const [theme] = await db
      .select()
      .from(themes)
      .where(eq(themes.id, id))
      .limit(1);

    if (!theme) {
      return c.json({ error: 'NotFound', message: 'Theme not found' }, 404);
    }

    if (theme.isDefault) {
      return c.json(
        {
          error: 'InvalidRequest',
          message: 'Cannot delete default theme. Set another theme as default first.',
        },
        400
      );
    }

    await db.delete(themes).where(eq(themes.id, id));

    await logAudit(adminUser.id, 'theme_deleted', 'theme', id, { name: theme.name }, c);

    return c.json({ success: true });
  }
);

/**
 * Set a theme as default
 */
adminThemesRouter.post(
  '/io.exprsn.admin.themes.setDefault',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { id } = await c.req.json<{ id: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing theme id' }, 400);
    }

    const [theme] = await db
      .select()
      .from(themes)
      .where(eq(themes.id, id))
      .limit(1);

    if (!theme) {
      return c.json({ error: 'NotFound', message: 'Theme not found' }, 404);
    }

    // Unset other defaults for this domain
    await db
      .update(themes)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        theme.domainId
          ? eq(themes.domainId, theme.domainId)
          : sql`${themes.domainId} IS NULL`
      );

    // Set this theme as default
    await db
      .update(themes)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(themes.id, id));

    await logAudit(
      adminUser.id,
      'theme_set_default',
      'theme',
      id,
      { name: theme.name },
      c
    );

    return c.json({ success: true });
  }
);

/**
 * Get default themes (light and dark templates)
 */
adminThemesRouter.get(
  '/io.exprsn.admin.themes.getDefaults',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_VIEW),
  async (c) => {
    return c.json({
      light: DEFAULT_LIGHT_THEME,
      dark: DEFAULT_DARK_THEME,
    });
  }
);

/**
 * Duplicate an existing theme
 */
adminThemesRouter.post(
  '/io.exprsn.admin.themes.duplicate',
  requirePermission(ADMIN_PERMISSIONS.CONFIG_EDIT),
  async (c) => {
    const adminUser = c.get('adminUser');
    const { id, name } = await c.req.json<{ id: string; name?: string }>();

    if (!id) {
      return c.json({ error: 'InvalidRequest', message: 'Missing theme id' }, 400);
    }

    const [sourceTheme] = await db
      .select()
      .from(themes)
      .where(eq(themes.id, id))
      .limit(1);

    if (!sourceTheme) {
      return c.json({ error: 'NotFound', message: 'Source theme not found' }, 404);
    }

    const newId = nanoid();
    const newName = name || `${sourceTheme.name} (Copy)`;

    await db.insert(themes).values({
      id: newId,
      name: newName,
      description: sourceTheme.description,
      domainId: sourceTheme.domainId,
      isDark: sourceTheme.isDark,
      isDefault: false, // Never duplicate as default
      config: sourceTheme.config,
      createdBy: adminUser.userDid,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await logAudit(
      adminUser.id,
      'theme_duplicated',
      'theme',
      newId,
      { sourceId: id, name: newName },
      c
    );

    const [newTheme] = await db
      .select()
      .from(themes)
      .where(eq(themes.id, newId))
      .limit(1);

    return c.json(newTheme);
  }
);

export default adminThemesRouter;
