'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { BrandCampaign, InfluencerConnection } from '@exprsn/shared';

interface BrandSettingsProps {
  organizationId: string;
  enabledFeatures: string[];
  userPermissions: string[];
}

export function BrandSettings({
  organizationId,
  enabledFeatures,
  userPermissions,
}: BrandSettingsProps) {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'influencers' | 'guidelines'>('campaigns');
  const [campaigns, setCampaigns] = useState<BrandCampaign[]>([]);
  const [influencers, setInfluencers] = useState<InfluencerConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManageCampaigns = userPermissions.includes('org.campaigns.manage');
  const canViewCampaigns = userPermissions.includes('org.campaigns.view') || canManageCampaigns;
  const canManageInfluencers = userPermissions.includes('org.influencers.manage');
  const canViewInfluencers = userPermissions.includes('org.influencers.view') || canManageInfluencers;

  useEffect(() => {
    loadData();
  }, [organizationId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [campaignsRes, influencersRes] = await Promise.all([
        canViewCampaigns
          ? api.get<{ campaigns: BrandCampaign[] }>(`/xrpc/io.exprsn.org.brand.campaigns.list?organizationId=${organizationId}`)
          : Promise.resolve({ campaigns: [] as BrandCampaign[] }),
        canViewInfluencers
          ? api.get<{ connections: InfluencerConnection[] }>(`/xrpc/io.exprsn.org.brand.influencers.list?organizationId=${organizationId}`)
          : Promise.resolve({ connections: [] as InfluencerConnection[] }),
      ]);

      setCampaigns(campaignsRes.campaigns || []);
      setInfluencers(influencersRes.connections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-10 bg-surface rounded w-48" />
        <div className="animate-pulse h-64 bg-surface rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface rounded-lg w-fit">
        {(['campaigns', 'influencers', 'guidelines'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text hover:bg-surface-hover'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'campaigns' && (
        <CampaignManagement
          organizationId={organizationId}
          campaigns={campaigns}
          canManage={canManageCampaigns}
          onUpdate={loadData}
        />
      )}

      {activeTab === 'influencers' && (
        <InfluencerManagement
          organizationId={organizationId}
          influencers={influencers}
          canManage={canManageInfluencers}
          onUpdate={loadData}
        />
      )}

      {activeTab === 'guidelines' && (
        <BrandGuidelines organizationId={organizationId} />
      )}
    </div>
  );
}

function CampaignManagement({
  organizationId,
  campaigns,
  canManage,
  onUpdate,
}: {
  organizationId: string;
  campaigns: BrandCampaign[];
  canManage: boolean;
  onUpdate: () => void;
}) {
  const activeCampaigns = campaigns.filter((c) => c.status === 'active');
  const completedCampaigns = campaigns.filter((c) => c.status === 'completed');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Campaigns ({campaigns.length})</h3>
        {canManage && (
          <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
            New Campaign
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="p-4 bg-surface rounded-lg border border-border">
          <p className="text-sm text-text-muted">Active Campaigns</p>
          <p className="text-2xl font-bold">{activeCampaigns.length}</p>
        </div>
        <div className="p-4 bg-surface rounded-lg border border-border">
          <p className="text-sm text-text-muted">Completed</p>
          <p className="text-2xl font-bold">{completedCampaigns.length}</p>
        </div>
        <div className="p-4 bg-surface rounded-lg border border-border">
          <p className="text-sm text-text-muted">Total Budget</p>
          <p className="text-2xl font-bold">
            ${campaigns.reduce((sum, c) => sum + (c.budget || 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Campaign List */}
      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <div
            key={campaign.id}
            className="p-4 bg-surface rounded-lg border border-border"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium">{campaign.name}</h4>
                {campaign.description && (
                  <p className="text-sm text-text-muted mt-1 line-clamp-2">{campaign.description}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {campaign.hashtags?.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 text-xs bg-accent/20 text-accent rounded">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs ${
                  campaign.status === 'active'
                    ? 'bg-green-500/20 text-green-400'
                    : campaign.status === 'completed'
                    ? 'bg-blue-500/20 text-blue-400'
                    : campaign.status === 'paused'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}
              >
                {campaign.status}
              </span>
            </div>
            {campaign.metrics && (
              <div className="mt-3 flex gap-4 text-sm text-text-muted">
                <span>{campaign.metrics.impressions?.toLocaleString()} impressions</span>
                <span>{campaign.metrics.engagements?.toLocaleString()} engagements</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {campaigns.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No campaigns yet. {canManage && 'Create your first campaign to get started.'}
        </div>
      )}
    </div>
  );
}

function InfluencerManagement({
  organizationId,
  influencers,
  canManage,
  onUpdate,
}: {
  organizationId: string;
  influencers: InfluencerConnection[];
  canManage: boolean;
  onUpdate: () => void;
}) {
  const tierColors = {
    nano: 'bg-gray-500/20 text-gray-400',
    micro: 'bg-green-500/20 text-green-400',
    mid: 'bg-blue-500/20 text-blue-400',
    macro: 'bg-purple-500/20 text-purple-400',
    mega: 'bg-pink-500/20 text-pink-400',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Influencer Connections ({influencers.length})</h3>
        {canManage && (
          <button className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition-colors">
            Connect Influencer
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {influencers.map((conn) => (
          <div
            key={conn.id}
            className="p-4 bg-surface rounded-lg border border-border"
          >
            <div className="flex items-start gap-3">
              {conn.influencer?.avatar ? (
                <img
                  src={conn.influencer.avatar}
                  alt={conn.influencer.displayName || conn.influencer.handle}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center">
                  <span className="text-xl">@</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium truncate">
                  {conn.influencer?.displayName || conn.influencer?.handle || 'Unknown'}
                </h4>
                <p className="text-sm text-text-muted">@{conn.influencer?.handle}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded ${tierColors[conn.tier]}`}>
                    {conn.tier}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-xs rounded ${
                      conn.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {conn.status}
                  </span>
                </div>
              </div>
            </div>
            {conn.influencer?.followerCount !== undefined && (
              <p className="mt-3 text-sm text-text-muted">
                {conn.influencer.followerCount.toLocaleString()} followers
              </p>
            )}
          </div>
        ))}
      </div>

      {influencers.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          No influencer connections yet.{' '}
          {canManage && 'Connect with influencers to start collaborating.'}
        </div>
      )}
    </div>
  );
}

function BrandGuidelines({ organizationId }: { organizationId: string }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Brand Guidelines</h3>
      <div className="p-8 bg-surface rounded-lg border border-border text-center text-text-muted">
        Brand guidelines feature coming soon.
      </div>
    </div>
  );
}
