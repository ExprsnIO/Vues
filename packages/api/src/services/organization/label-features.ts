import { eq, and, desc, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import {
  organizationCustomData,
  organizationActivity,
  organizations,
  organizationMembers,
  users,
} from '../../db/schema.js';
import type { LabelArtist, CatalogEntry } from '@exprsn/shared';

/**
 * Label Feature Service
 *
 * Provides functionality for music label organizations:
 * - Artist management
 * - Catalog management
 * - Royalty tracking
 */
export class LabelFeatureService {
  // ============================================
  // Artist Management
  // ============================================

  /**
   * Add an artist to the label
   */
  static async addArtist(
    organizationId: string,
    data: Omit<LabelArtist, 'id'>,
    createdBy: string
  ): Promise<LabelArtist> {
    const artistId = nanoid();

    await db.insert(organizationCustomData).values({
      id: artistId,
      organizationId,
      dataType: 'artist',
      data: { ...data },
      status: 'active',
    });

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: createdBy,
      action: 'artist_added',
      targetType: 'artist',
      targetId: artistId,
      details: { stageName: data.stageName },
    });

    return { id: artistId, ...data };
  }

  /**
   * Update artist information
   */
  static async updateArtist(
    organizationId: string,
    artistId: string,
    updates: Partial<LabelArtist>,
    updatedBy: string
  ): Promise<LabelArtist> {
    const existing = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, artistId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'artist')
        )
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error('Artist not found');
    }

    const currentData = existing[0].data as LabelArtist;
    const newData = { ...currentData, ...updates, id: artistId };

    await db
      .update(organizationCustomData)
      .set({
        data: newData,
        updatedAt: new Date(),
      })
      .where(eq(organizationCustomData.id, artistId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: updatedBy,
      action: 'artist_updated',
      targetType: 'artist',
      targetId: artistId,
      details: { updatedFields: Object.keys(updates) },
    });

    return newData;
  }

  /**
   * Get artist by ID
   */
  static async getArtist(organizationId: string, artistId: string): Promise<LabelArtist | null> {
    const result = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, artistId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'artist')
        )
      )
      .limit(1);

    if (!result[0]) return null;

    return { id: result[0].id, ...(result[0].data as Omit<LabelArtist, 'id'>) };
  }

  /**
   * List all artists for the label
   */
  static async getArtists(
    organizationId: string,
    options?: {
      status?: LabelArtist['contractStatus'];
      limit?: number;
      offset?: number;
    }
  ): Promise<LabelArtist[]> {
    let query = db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'artist'),
          eq(organizationCustomData.status, 'active')
        )
      )
      .orderBy(desc(organizationCustomData.createdAt));

    const results = await query
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);

    let artists = results.map(r => ({
      id: r.id,
      ...(r.data as Omit<LabelArtist, 'id'>),
    }));

    // Filter by contract status if specified
    if (options?.status) {
      artists = artists.filter(a => a.contractStatus === options.status);
    }

    return artists;
  }

  /**
   * Link artist to organization member
   */
  static async linkArtistToMember(
    organizationId: string,
    artistId: string,
    memberId: string,
    linkedBy: string
  ): Promise<void> {
    const artist = await this.getArtist(organizationId, artistId);
    if (!artist) {
      throw new Error('Artist not found');
    }

    // Verify member exists
    const member = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.id, memberId),
          eq(organizationMembers.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!member[0]) {
      throw new Error('Member not found');
    }

    await this.updateArtist(
      organizationId,
      artistId,
      { memberId },
      linkedBy
    );
  }

  /**
   * Remove artist (soft delete)
   */
  static async removeArtist(
    organizationId: string,
    artistId: string,
    removedBy: string
  ): Promise<void> {
    await db
      .update(organizationCustomData)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationCustomData.id, artistId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'artist')
        )
      );

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: removedBy,
      action: 'artist_removed',
      targetType: 'artist',
      targetId: artistId,
    });
  }

  // ============================================
  // Catalog Management
  // ============================================

  /**
   * Add a catalog entry (release)
   */
  static async addCatalogEntry(
    organizationId: string,
    data: Omit<CatalogEntry, 'id' | 'organizationId'>,
    createdBy: string
  ): Promise<CatalogEntry> {
    // Verify artist exists
    const artist = await this.getArtist(organizationId, data.artistId);
    if (!artist) {
      throw new Error('Artist not found');
    }

    const entryId = nanoid();

    await db.insert(organizationCustomData).values({
      id: entryId,
      organizationId,
      dataType: 'catalog',
      data: { ...data, organizationId },
      status: 'active',
    });

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: createdBy,
      action: 'catalog_entry_added',
      targetType: 'catalog',
      targetId: entryId,
      details: { title: data.title, type: data.type, artistId: data.artistId },
    });

    return { id: entryId, organizationId, ...data };
  }

  /**
   * Update catalog entry
   */
  static async updateCatalogEntry(
    organizationId: string,
    entryId: string,
    updates: Partial<CatalogEntry>,
    updatedBy: string
  ): Promise<CatalogEntry> {
    const existing = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, entryId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'catalog')
        )
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error('Catalog entry not found');
    }

    const currentData = existing[0].data as CatalogEntry;
    const newData = { ...currentData, ...updates, id: entryId };

    await db
      .update(organizationCustomData)
      .set({
        data: newData,
        updatedAt: new Date(),
      })
      .where(eq(organizationCustomData.id, entryId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: updatedBy,
      action: 'catalog_entry_updated',
      targetType: 'catalog',
      targetId: entryId,
      details: { updatedFields: Object.keys(updates) },
    });

    return newData;
  }

  /**
   * Get catalog entry by ID
   */
  static async getCatalogEntry(organizationId: string, entryId: string): Promise<CatalogEntry | null> {
    const result = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, entryId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'catalog')
        )
      )
      .limit(1);

    if (!result[0]) return null;

    return { id: result[0].id, ...(result[0].data as Omit<CatalogEntry, 'id'>) };
  }

  /**
   * List catalog entries
   */
  static async getCatalog(
    organizationId: string,
    options?: {
      artistId?: string;
      type?: CatalogEntry['type'];
      status?: CatalogEntry['status'];
      limit?: number;
      offset?: number;
    }
  ): Promise<CatalogEntry[]> {
    const results = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'catalog'),
          eq(organizationCustomData.status, 'active')
        )
      )
      .orderBy(desc(organizationCustomData.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);

    let entries = results.map(r => ({
      id: r.id,
      ...(r.data as Omit<CatalogEntry, 'id'>),
    }));

    // Apply filters
    if (options?.artistId) {
      entries = entries.filter(e => e.artistId === options.artistId);
    }
    if (options?.type) {
      entries = entries.filter(e => e.type === options.type);
    }
    if (options?.status) {
      entries = entries.filter(e => e.status === options.status);
    }

    return entries;
  }

  /**
   * Get catalog entries for a specific artist
   */
  static async getArtistCatalog(
    organizationId: string,
    artistId: string
  ): Promise<CatalogEntry[]> {
    return this.getCatalog(organizationId, { artistId });
  }

  // ============================================
  // Royalty Tracking
  // ============================================

  /**
   * Set royalty splits for a catalog entry
   */
  static async setRoyaltySplits(
    organizationId: string,
    entryId: string,
    splits: CatalogEntry['royaltySplits'],
    setBy: string
  ): Promise<void> {
    // Validate splits total 100%
    const total = splits.reduce((sum, s) => sum + s.percentage, 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new Error('Royalty splits must total 100%');
    }

    await this.updateCatalogEntry(
      organizationId,
      entryId,
      { royaltySplits: splits },
      setBy
    );
  }

  /**
   * Get royalty summary for an artist
   */
  static async getArtistRoyaltySummary(
    organizationId: string,
    artistId: string
  ): Promise<{
    totalReleases: number;
    averageRoyaltyPercentage: number;
    releases: Array<{
      entryId: string;
      title: string;
      percentage: number;
    }>;
  }> {
    const catalog = await this.getArtistCatalog(organizationId, artistId);

    const releases: Array<{ entryId: string; title: string; percentage: number }> = [];
    let totalPercentage = 0;

    for (const entry of catalog) {
      const artistSplit = entry.royaltySplits?.find(
        s => s.recipientId === artistId && s.recipientType === 'artist'
      );
      const percentage = artistSplit?.percentage || 0;
      totalPercentage += percentage;
      releases.push({
        entryId: entry.id,
        title: entry.title,
        percentage,
      });
    }

    return {
      totalReleases: catalog.length,
      averageRoyaltyPercentage: catalog.length > 0 ? totalPercentage / catalog.length : 0,
      releases,
    };
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get label statistics
   */
  static async getLabelStats(organizationId: string): Promise<{
    totalArtists: number;
    activeArtists: number;
    totalReleases: number;
    releasesByType: Record<string, number>;
    recentActivity: Array<{
      action: string;
      targetType: string;
      createdAt: string;
    }>;
  }> {
    const artists = await this.getArtists(organizationId);
    const catalog = await this.getCatalog(organizationId);

    const releasesByType: Record<string, number> = {};
    for (const entry of catalog) {
      releasesByType[entry.type] = (releasesByType[entry.type] || 0) + 1;
    }

    // Get recent activity
    const activity = await db
      .select()
      .from(organizationActivity)
      .where(eq(organizationActivity.organizationId, organizationId))
      .orderBy(desc(organizationActivity.createdAt))
      .limit(10);

    const labelActions = activity.filter(a =>
      ['artist_added', 'artist_updated', 'artist_removed', 'catalog_entry_added', 'catalog_entry_updated'].includes(a.action)
    );

    return {
      totalArtists: artists.length,
      activeArtists: artists.filter(a => a.contractStatus === 'active').length,
      totalReleases: catalog.length,
      releasesByType,
      recentActivity: labelActions.map(a => ({
        action: a.action,
        targetType: a.targetType || '',
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
}
