import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '../../db/index.js';
import {
  organizationCustomData,
  organizationActivity,
  users,
} from '../../db/schema.js';
import type { BrandCampaign, InfluencerConnection } from '@exprsn/shared';

/**
 * Brand Feature Service
 *
 * Provides functionality for brand organizations:
 * - Campaign management
 * - Influencer connections
 * - Brand guidelines
 */
export class BrandFeatureService {
  // ============================================
  // Campaign Management
  // ============================================

  /**
   * Create a new campaign
   */
  static async createCampaign(
    organizationId: string,
    data: Omit<BrandCampaign, 'id' | 'organizationId'>,
    createdBy: string
  ): Promise<BrandCampaign> {
    const campaignId = nanoid();

    await db.insert(organizationCustomData).values({
      id: campaignId,
      organizationId,
      dataType: 'campaign',
      data: { ...data, organizationId },
      status: 'active',
    });

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: createdBy,
      action: 'campaign_created',
      targetType: 'campaign',
      targetId: campaignId,
      details: { name: data.name, status: data.status },
    });

    return { id: campaignId, organizationId, ...data };
  }

  /**
   * Update campaign
   */
  static async updateCampaign(
    organizationId: string,
    campaignId: string,
    updates: Partial<BrandCampaign>,
    updatedBy: string
  ): Promise<BrandCampaign> {
    const existing = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, campaignId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'campaign')
        )
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error('Campaign not found');
    }

    const currentData = existing[0].data as BrandCampaign;
    const newData = { ...currentData, ...updates, id: campaignId };

    await db
      .update(organizationCustomData)
      .set({
        data: newData,
        updatedAt: new Date(),
      })
      .where(eq(organizationCustomData.id, campaignId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: updatedBy,
      action: 'campaign_updated',
      targetType: 'campaign',
      targetId: campaignId,
      details: { updatedFields: Object.keys(updates) },
    });

    return newData;
  }

  /**
   * Get campaign by ID
   */
  static async getCampaign(organizationId: string, campaignId: string): Promise<BrandCampaign | null> {
    const result = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, campaignId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'campaign')
        )
      )
      .limit(1);

    if (!result[0]) return null;

    return { id: result[0].id, ...(result[0].data as Omit<BrandCampaign, 'id'>) };
  }

  /**
   * List campaigns
   */
  static async getCampaigns(
    organizationId: string,
    options?: {
      status?: BrandCampaign['status'];
      limit?: number;
      offset?: number;
    }
  ): Promise<BrandCampaign[]> {
    const results = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'campaign'),
          eq(organizationCustomData.status, 'active')
        )
      )
      .orderBy(desc(organizationCustomData.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);

    let campaigns = results.map(r => ({
      id: r.id,
      ...(r.data as Omit<BrandCampaign, 'id'>),
    }));

    if (options?.status) {
      campaigns = campaigns.filter(c => c.status === options.status);
    }

    return campaigns;
  }

  /**
   * Update campaign status
   */
  static async updateCampaignStatus(
    organizationId: string,
    campaignId: string,
    status: BrandCampaign['status'],
    updatedBy: string
  ): Promise<void> {
    await this.updateCampaign(organizationId, campaignId, { status }, updatedBy);
  }

  /**
   * Update campaign metrics
   */
  static async updateCampaignMetrics(
    organizationId: string,
    campaignId: string,
    metrics: NonNullable<BrandCampaign['metrics']>,
    updatedBy: string
  ): Promise<void> {
    await this.updateCampaign(organizationId, campaignId, { metrics }, updatedBy);
  }

  /**
   * Add influencer to campaign
   */
  static async addInfluencerToCampaign(
    organizationId: string,
    campaignId: string,
    influencerConnectionId: string,
    addedBy: string
  ): Promise<void> {
    const campaign = await this.getCampaign(organizationId, campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const influencerIds = [...(campaign.influencerIds || [])];
    if (!influencerIds.includes(influencerConnectionId)) {
      influencerIds.push(influencerConnectionId);
      await this.updateCampaign(organizationId, campaignId, { influencerIds }, addedBy);
    }
  }

  /**
   * Remove influencer from campaign
   */
  static async removeInfluencerFromCampaign(
    organizationId: string,
    campaignId: string,
    influencerConnectionId: string,
    removedBy: string
  ): Promise<void> {
    const campaign = await this.getCampaign(organizationId, campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const influencerIds = (campaign.influencerIds || []).filter(
      id => id !== influencerConnectionId
    );
    await this.updateCampaign(organizationId, campaignId, { influencerIds }, removedBy);
  }

  // ============================================
  // Influencer Connections
  // ============================================

  /**
   * Connect an influencer
   */
  static async connectInfluencer(
    organizationId: string,
    data: Omit<InfluencerConnection, 'id' | 'organizationId' | 'influencer'>,
    connectedBy: string
  ): Promise<InfluencerConnection> {
    // Verify influencer exists
    const influencer = await db
      .select()
      .from(users)
      .where(eq(users.did, data.influencerDid))
      .limit(1);

    if (!influencer[0]) {
      throw new Error('Influencer user not found');
    }

    // Check for existing connection
    const existing = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'influencer_connection')
        )
      );

    const existingConnection = existing.find(
      e => (e.data as InfluencerConnection).influencerDid === data.influencerDid
    );

    if (existingConnection) {
      throw new Error('Connection already exists for this influencer');
    }

    const connectionId = nanoid();

    await db.insert(organizationCustomData).values({
      id: connectionId,
      organizationId,
      dataType: 'influencer_connection',
      data: { ...data, organizationId },
      status: 'active',
    });

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: connectedBy,
      action: 'influencer_connected',
      targetType: 'influencer',
      targetId: connectionId,
      details: { influencerDid: data.influencerDid, tier: data.tier },
    });

    return {
      id: connectionId,
      organizationId,
      ...data,
      influencer: {
        did: influencer[0].did,
        handle: influencer[0].handle,
        displayName: influencer[0].displayName || undefined,
        avatar: influencer[0].avatar || undefined,
        followerCount: influencer[0].followerCount,
      },
    };
  }

  /**
   * Update influencer connection
   */
  static async updateInfluencerConnection(
    organizationId: string,
    connectionId: string,
    updates: Partial<InfluencerConnection>,
    updatedBy: string
  ): Promise<InfluencerConnection> {
    const existing = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, connectionId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'influencer_connection')
        )
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error('Influencer connection not found');
    }

    const currentData = existing[0].data as InfluencerConnection;
    const newData = { ...currentData, ...updates, id: connectionId };

    await db
      .update(organizationCustomData)
      .set({
        data: newData,
        updatedAt: new Date(),
      })
      .where(eq(organizationCustomData.id, connectionId));

    // Log activity
    await db.insert(organizationActivity).values({
      id: nanoid(),
      organizationId,
      actorDid: updatedBy,
      action: 'influencer_connection_updated',
      targetType: 'influencer',
      targetId: connectionId,
      details: { updatedFields: Object.keys(updates) },
    });

    return newData;
  }

  /**
   * Get influencer connection by ID
   */
  static async getInfluencerConnection(
    organizationId: string,
    connectionId: string
  ): Promise<InfluencerConnection | null> {
    const result = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.id, connectionId),
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'influencer_connection')
        )
      )
      .limit(1);

    if (!result[0]) return null;

    const data = result[0].data as Omit<InfluencerConnection, 'id'>;

    // Get influencer details
    const influencer = await db
      .select()
      .from(users)
      .where(eq(users.did, data.influencerDid))
      .limit(1);

    return {
      id: result[0].id,
      ...data,
      influencer: influencer[0]
        ? {
            did: influencer[0].did,
            handle: influencer[0].handle,
            displayName: influencer[0].displayName || undefined,
            avatar: influencer[0].avatar || undefined,
            followerCount: influencer[0].followerCount,
          }
        : undefined,
    };
  }

  /**
   * List influencer connections
   */
  static async getInfluencerConnections(
    organizationId: string,
    options?: {
      status?: InfluencerConnection['status'];
      tier?: InfluencerConnection['tier'];
      limit?: number;
      offset?: number;
    }
  ): Promise<InfluencerConnection[]> {
    const results = await db
      .select()
      .from(organizationCustomData)
      .where(
        and(
          eq(organizationCustomData.organizationId, organizationId),
          eq(organizationCustomData.dataType, 'influencer_connection'),
          eq(organizationCustomData.status, 'active')
        )
      )
      .orderBy(desc(organizationCustomData.createdAt))
      .limit(options?.limit || 100)
      .offset(options?.offset || 0);

    // Get all influencer DIDs
    const influencerDids = results.map(r => (r.data as InfluencerConnection).influencerDid);

    // Batch fetch influencer details
    const influencers = influencerDids.length > 0
      ? await db.select().from(users).where(eq(users.did, influencerDids[0]))
      : [];

    // For multiple DIDs, we'd need a different approach
    // For now, map individual lookups (can be optimized with IN clause)
    const influencerMap = new Map<string, typeof users.$inferSelect>();
    for (const did of influencerDids) {
      const user = await db.select().from(users).where(eq(users.did, did)).limit(1);
      if (user[0]) influencerMap.set(did, user[0]);
    }

    let connections = results.map(r => {
      const data = r.data as Omit<InfluencerConnection, 'id'>;
      const user = influencerMap.get(data.influencerDid);
      return {
        id: r.id,
        ...data,
        influencer: user
          ? {
              did: user.did,
              handle: user.handle,
              displayName: user.displayName || undefined,
              avatar: user.avatar || undefined,
              followerCount: user.followerCount,
            }
          : undefined,
      };
    });

    // Apply filters
    if (options?.status) {
      connections = connections.filter(c => c.status === options.status);
    }
    if (options?.tier) {
      connections = connections.filter(c => c.tier === options.tier);
    }

    return connections;
  }

  /**
   * Disconnect influencer (terminate connection)
   */
  static async disconnectInfluencer(
    organizationId: string,
    connectionId: string,
    disconnectedBy: string
  ): Promise<void> {
    await this.updateInfluencerConnection(
      organizationId,
      connectionId,
      { status: 'terminated' },
      disconnectedBy
    );

    // Also archive the record
    await db
      .update(organizationCustomData)
      .set({
        status: 'archived',
        updatedAt: new Date(),
      })
      .where(eq(organizationCustomData.id, connectionId));
  }

  // ============================================
  // Statistics
  // ============================================

  /**
   * Get brand statistics
   */
  static async getBrandStats(organizationId: string): Promise<{
    totalCampaigns: number;
    activeCampaigns: number;
    completedCampaigns: number;
    totalInfluencers: number;
    activeInfluencers: number;
    campaignsByStatus: Record<string, number>;
    influencersByTier: Record<string, number>;
    totalBudget: number;
    totalSpend: number;
  }> {
    const campaigns = await this.getCampaigns(organizationId);
    const connections = await this.getInfluencerConnections(organizationId);

    const campaignsByStatus: Record<string, number> = {};
    let totalBudget = 0;
    let totalSpend = 0;

    for (const campaign of campaigns) {
      campaignsByStatus[campaign.status] = (campaignsByStatus[campaign.status] || 0) + 1;
      totalBudget += campaign.budget || 0;
      totalSpend += campaign.metrics?.spend || 0;
    }

    const influencersByTier: Record<string, number> = {};
    for (const conn of connections) {
      influencersByTier[conn.tier] = (influencersByTier[conn.tier] || 0) + 1;
    }

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: campaigns.filter(c => c.status === 'active').length,
      completedCampaigns: campaigns.filter(c => c.status === 'completed').length,
      totalInfluencers: connections.length,
      activeInfluencers: connections.filter(c => c.status === 'active').length,
      campaignsByStatus,
      influencersByTier,
      totalBudget,
      totalSpend,
    };
  }
}
