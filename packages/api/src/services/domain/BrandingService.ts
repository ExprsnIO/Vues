/**
 * Domain Branding Service
 * Manages per-domain branding: logos, colors, favicons, themes
 */

import { nanoid } from 'nanoid';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../db/schema.js';

/**
 * Domain branding configuration
 */
export interface DomainBranding {
  domainId: string;
  // Logos
  logoUrl?: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  // Colors
  primaryColor: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  // Typography
  fontFamily?: string;
  headingFontFamily?: string;
  // Social
  socialPreviewImage?: string;
  socialPreviewTitle?: string;
  socialPreviewDescription?: string;
  // Custom CSS
  customCss?: string;
  // Footer
  footerText?: string;
  footerLinks?: Array<{ label: string; url: string }>;
  // Misc
  copyrightText?: string;
  supportEmail?: string;
  supportUrl?: string;
}

/**
 * Theme preset
 */
export interface ThemePreset {
  id: string;
  name: string;
  description?: string;
  colors: {
    primary: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  fontFamily?: string;
  isDefault?: boolean;
}

const DEFAULT_BRANDING: Partial<DomainBranding> = {
  primaryColor: '#6366f1', // Indigo
  accentColor: '#8b5cf6', // Purple
  backgroundColor: '#0f0f0f',
  textColor: '#ffffff',
  fontFamily: 'Inter, system-ui, sans-serif',
};

const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'The default Exprsn theme',
    colors: { primary: '#6366f1', accent: '#8b5cf6', background: '#0f0f0f', text: '#ffffff' },
    isDefault: true,
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Cool blue tones',
    colors: { primary: '#0ea5e9', accent: '#06b6d4', background: '#0c1929', text: '#e2e8f0' },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green palette',
    colors: { primary: '#22c55e', accent: '#10b981', background: '#0a1f0a', text: '#e2e8e0' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange and red tones',
    colors: { primary: '#f97316', accent: '#ef4444', background: '#1c1410', text: '#fef3e2' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep purple darkness',
    colors: { primary: '#a855f7', accent: '#ec4899', background: '#0f0515', text: '#f5e6ff' },
  },
  {
    id: 'minimal-light',
    name: 'Minimal Light',
    description: 'Clean light theme',
    colors: { primary: '#1f2937', accent: '#3b82f6', background: '#ffffff', text: '#111827' },
  },
];

export class BrandingService {
  private db: PostgresJsDatabase<typeof schema>;

  constructor(db: PostgresJsDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Get branding for a domain
   */
  async getBranding(domainId: string): Promise<DomainBranding> {
    const domain = await this.db.query.domains.findFirst({
      where: eq(schema.domains.id, domainId),
    });

    if (!domain) {
      return { domainId, ...DEFAULT_BRANDING } as DomainBranding;
    }

    // Parse branding from domain settings
    const settings = (domain.settings as Record<string, unknown>) || {};
    const branding = (settings.branding as Partial<DomainBranding>) || {};

    return {
      domainId,
      ...DEFAULT_BRANDING,
      ...branding,
    } as DomainBranding;
  }

  /**
   * Update branding for a domain
   */
  async updateBranding(
    domainId: string,
    updates: Partial<DomainBranding>
  ): Promise<DomainBranding> {
    // Get existing settings
    const domain = await this.db.query.domains.findFirst({
      where: eq(schema.domains.id, domainId),
    });

    if (!domain) {
      throw new Error('Domain not found');
    }

    const settings = (domain.settings as Record<string, unknown>) || {};
    const existingBranding = (settings.branding as Record<string, unknown>) || {};

    // Merge updates
    const newBranding = {
      ...existingBranding,
      ...updates,
    };

    // Remove undefined values
    Object.keys(newBranding).forEach((key) => {
      if (newBranding[key] === undefined) {
        delete newBranding[key];
      }
    });

    // Update domain settings
    await this.db
      .update(schema.domains)
      .set({
        settings: {
          ...settings,
          branding: newBranding,
        },
        updatedAt: new Date(),
      })
      .where(eq(schema.domains.id, domainId));

    return this.getBranding(domainId);
  }

  /**
   * Apply a theme preset to a domain
   */
  async applyThemePreset(domainId: string, presetId: string): Promise<DomainBranding> {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      throw new Error('Theme preset not found');
    }

    return this.updateBranding(domainId, {
      primaryColor: preset.colors.primary,
      secondaryColor: preset.colors.secondary,
      accentColor: preset.colors.accent,
      backgroundColor: preset.colors.background,
      textColor: preset.colors.text,
      fontFamily: preset.fontFamily,
    });
  }

  /**
   * Get available theme presets
   */
  getThemePresets(): ThemePreset[] {
    return THEME_PRESETS;
  }

  /**
   * Upload and set logo
   */
  async setLogo(
    domainId: string,
    logoType: 'logo' | 'logoLight' | 'logoDark' | 'favicon',
    url: string
  ): Promise<DomainBranding> {
    const fieldMap: Record<string, keyof DomainBranding> = {
      logo: 'logoUrl',
      logoLight: 'logoLightUrl',
      logoDark: 'logoDarkUrl',
      favicon: 'faviconUrl',
    };

    const field = fieldMap[logoType];
    if (!field) {
      throw new Error('Invalid logo type');
    }

    return this.updateBranding(domainId, {
      [field]: url,
    } as Partial<DomainBranding>);
  }

  /**
   * Set social preview metadata
   */
  async setSocialPreview(
    domainId: string,
    preview: {
      imageUrl?: string;
      title?: string;
      description?: string;
    }
  ): Promise<DomainBranding> {
    return this.updateBranding(domainId, {
      socialPreviewImage: preview.imageUrl,
      socialPreviewTitle: preview.title,
      socialPreviewDescription: preview.description,
    });
  }

  /**
   * Set custom CSS
   */
  async setCustomCss(domainId: string, css: string): Promise<DomainBranding> {
    // Basic CSS sanitization - remove potentially dangerous properties
    const sanitizedCss = this.sanitizeCss(css);
    return this.updateBranding(domainId, { customCss: sanitizedCss });
  }

  /**
   * Generate CSS variables from branding
   */
  generateCssVariables(branding: DomainBranding): string {
    const vars: Record<string, string> = {
      '--brand-primary': branding.primaryColor,
    };

    if (branding.secondaryColor) vars['--brand-secondary'] = branding.secondaryColor;
    if (branding.accentColor) vars['--brand-accent'] = branding.accentColor;
    if (branding.backgroundColor) vars['--brand-background'] = branding.backgroundColor;
    if (branding.textColor) vars['--brand-text'] = branding.textColor;
    if (branding.fontFamily) vars['--brand-font'] = branding.fontFamily;
    if (branding.headingFontFamily) vars['--brand-heading-font'] = branding.headingFontFamily;

    const cssVars = Object.entries(vars)
      .map(([key, value]) => `${key}: ${value};`)
      .join('\n  ');

    return `:root {\n  ${cssVars}\n}`;
  }

  /**
   * Reset branding to defaults
   */
  async resetBranding(domainId: string): Promise<DomainBranding> {
    const domain = await this.db.query.domains.findFirst({
      where: eq(schema.domains.id, domainId),
    });

    if (!domain) {
      throw new Error('Domain not found');
    }

    const settings = (domain.settings as Record<string, unknown>) || {};
    delete settings.branding;

    await this.db
      .update(schema.domains)
      .set({
        settings,
        updatedAt: new Date(),
      })
      .where(eq(schema.domains.id, domainId));

    return this.getBranding(domainId);
  }

  /**
   * Sanitize CSS to remove potentially dangerous properties
   */
  private sanitizeCss(css: string): string {
    // Remove JavaScript expressions
    let sanitized = css.replace(/expression\s*\([^)]*\)/gi, '');
    // Remove url() with javascript:
    sanitized = sanitized.replace(/url\s*\(\s*['"]?\s*javascript:[^)]*\)/gi, '');
    // Remove behavior property (IE)
    sanitized = sanitized.replace(/behavior\s*:[^;]*/gi, '');
    // Remove -moz-binding
    sanitized = sanitized.replace(/-moz-binding\s*:[^;]*/gi, '');
    // Remove @import with external URLs (allow data: and relative)
    sanitized = sanitized.replace(/@import\s+url\s*\(\s*['"]?https?:[^)]*\)/gi, '');

    return sanitized;
  }
}

/**
 * Create BrandingService instance
 */
export function createBrandingService(
  db: PostgresJsDatabase<typeof schema>
): BrandingService {
  return new BrandingService(db);
}
