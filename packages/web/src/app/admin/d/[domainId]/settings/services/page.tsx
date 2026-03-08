// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

interface DomainFeatures {
  videoUpload: boolean;
  liveStreaming: boolean;
  directMessages: boolean;
  challenges: boolean;
  monetization: boolean;
  analytics: boolean;
}

interface RateLimits {
  uploadsPerDay: number;
  maxVideoLength: number;
  maxFileSize: number;
}

export default function DomainServicesPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const [features, setFeatures] = useState<DomainFeatures>({
    videoUpload: true,
    liveStreaming: false,
    directMessages: true,
    challenges: true,
    monetization: false,
    analytics: true,
  });

  const [rateLimits, setRateLimits] = useState<RateLimits>({
    uploadsPerDay: 10,
    maxVideoLength: 300,
    maxFileSize: 100,
  });

  useEffect(() => {
    if (data?.domain) {
      if (data.domain.features) setFeatures(data.domain.features);
      if (data.domain.rateLimits) setRateLimits(data.domain.rateLimits);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (updates: { features?: DomainFeatures; rateLimits?: RateLimits }) =>
      api.adminDomainsUpdate({ id: domainId, ...updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('Settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const domain = data?.domain;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Services & Features</h1>
        <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
      </div>

      {/* Features */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Enabled Features</h2>
        <div className="space-y-4">
          {[
            { key: 'videoUpload', label: 'Video Upload', description: 'Allow users to upload videos' },
            { key: 'liveStreaming', label: 'Live Streaming', description: 'Enable live streaming capabilities' },
            { key: 'directMessages', label: 'Direct Messages', description: 'Allow private messaging between users' },
            { key: 'challenges', label: 'Challenges', description: 'Enable hashtag challenges' },
            { key: 'monetization', label: 'Monetization', description: 'Allow creators to monetize content' },
            { key: 'analytics', label: 'Analytics', description: 'Provide analytics dashboards to users' },
          ].map(({ key, label, description }) => (
            <label key={key} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg cursor-pointer">
              <div>
                <p className="text-text-primary font-medium">{label}</p>
                <p className="text-text-muted text-sm">{description}</p>
              </div>
              <input
                type="checkbox"
                checked={features[key as keyof DomainFeatures] ?? false}
                onChange={(e) => setFeatures(prev => ({ ...prev, [key]: e.target.checked }))}
                className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Rate Limits */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Rate Limits</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Uploads per Day</label>
            <input
              type="number"
              value={rateLimits.uploadsPerDay}
              onChange={(e) => setRateLimits(prev => ({ ...prev, uploadsPerDay: parseInt(e.target.value) || 0 }))}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Max Video Length (seconds)</label>
            <input
              type="number"
              value={rateLimits.maxVideoLength}
              onChange={(e) => setRateLimits(prev => ({ ...prev, maxVideoLength: parseInt(e.target.value) || 0 }))}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Max File Size (MB)</label>
            <input
              type="number"
              value={rateLimits.maxFileSize}
              onChange={(e) => setRateLimits(prev => ({ ...prev, maxFileSize: parseInt(e.target.value) || 0 }))}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={() => updateMutation.mutate({ features, rateLimits })}
          disabled={updateMutation.isPending}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
