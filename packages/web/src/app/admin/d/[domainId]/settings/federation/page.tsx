// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

interface FederationConfig {
  enabled: boolean;
  syncPosts: boolean;
  syncLikes: boolean;
  syncFollows: boolean;
  allowedDomains: string[];
  blockedDomains: string[];
}

export default function DomainFederationPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();

  const [config, setConfig] = useState<FederationConfig>({
    enabled: false,
    syncPosts: true,
    syncLikes: true,
    syncFollows: true,
    allowedDomains: [],
    blockedDomains: [],
  });

  const [newAllowedDomain, setNewAllowedDomain] = useState('');
  const [newBlockedDomain, setNewBlockedDomain] = useState('');

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  useEffect(() => {
    if (data?.domain?.federationConfig) {
      setConfig(data.domain.federationConfig);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (federationConfig: FederationConfig) =>
      api.adminDomainsUpdate({ id: domainId, federationConfig }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('Federation settings saved');
    },
    onError: () => toast.error('Failed to save federation settings'),
  });

  const domain = data?.domain;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (domain?.type !== 'federated') {
    return (
      <div className="text-center py-12">
        <FederationIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
        <p className="text-text-muted">Federation is only available for federated domains</p>
      </div>
    );
  }

  const addAllowedDomain = () => {
    if (newAllowedDomain && !config.allowedDomains.includes(newAllowedDomain)) {
      setConfig(prev => ({
        ...prev,
        allowedDomains: [...prev.allowedDomains, newAllowedDomain],
      }));
      setNewAllowedDomain('');
    }
  };

  const removeAllowedDomain = (domain: string) => {
    setConfig(prev => ({
      ...prev,
      allowedDomains: prev.allowedDomains.filter(d => d !== domain),
    }));
  };

  const addBlockedDomain = () => {
    if (newBlockedDomain && !config.blockedDomains.includes(newBlockedDomain)) {
      setConfig(prev => ({
        ...prev,
        blockedDomains: [...prev.blockedDomains, newBlockedDomain],
      }));
      setNewBlockedDomain('');
    }
  };

  const removeBlockedDomain = (domain: string) => {
    setConfig(prev => ({
      ...prev,
      blockedDomains: prev.blockedDomains.filter(d => d !== domain),
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Federation</h1>
        <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
      </div>

      {/* Enable Federation */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <label className="flex items-center justify-between cursor-pointer">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Enable Federation</h2>
            <p className="text-text-muted text-sm">Connect with other AT Protocol domains</p>
          </div>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig(prev => ({ ...prev, enabled: e.target.checked }))}
            className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
          />
        </label>
      </div>

      {config.enabled && (
        <>
          {/* Sync Settings */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Sync Settings</h2>
            <div className="space-y-3">
              {[
                { key: 'syncPosts', label: 'Sync Posts', description: 'Federate video posts to other domains' },
                { key: 'syncLikes', label: 'Sync Likes', description: 'Federate like interactions' },
                { key: 'syncFollows', label: 'Sync Follows', description: 'Federate follow relationships' },
              ].map(({ key, label, description }) => (
                <label key={key} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg cursor-pointer">
                  <div>
                    <p className="text-text-primary font-medium">{label}</p>
                    <p className="text-text-muted text-sm">{description}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config[key as keyof FederationConfig] as boolean}
                    onChange={(e) => setConfig(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Allowed Domains */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Allowed Domains</h2>
            <p className="text-text-muted text-sm mb-4">
              If specified, only these domains can federate with this domain. Leave empty to allow all.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newAllowedDomain}
                onChange={(e) => setNewAllowedDomain(e.target.value)}
                placeholder="example.com"
                className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
              />
              <button
                onClick={addAllowedDomain}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.allowedDomains.map(domain => (
                <span key={domain} className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-400 rounded-full">
                  {domain}
                  <button onClick={() => removeAllowedDomain(domain)} className="hover:text-green-300">
                    <XIcon className="w-4 h-4" />
                  </button>
                </span>
              ))}
              {config.allowedDomains.length === 0 && (
                <span className="text-text-muted text-sm">All domains allowed</span>
              )}
            </div>
          </div>

          {/* Blocked Domains */}
          <div className="bg-surface border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Blocked Domains</h2>
            <p className="text-text-muted text-sm mb-4">
              Domains that are blocked from federating with this domain.
            </p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newBlockedDomain}
                onChange={(e) => setNewBlockedDomain(e.target.value)}
                placeholder="example.com"
                className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
              />
              <button
                onClick={addBlockedDomain}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg"
              >
                Block
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {config.blockedDomains.map(domain => (
                <span key={domain} className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-full">
                  {domain}
                  <button onClick={() => removeBlockedDomain(domain)} className="hover:text-red-300">
                    <XIcon className="w-4 h-4" />
                  </button>
                </span>
              ))}
              {config.blockedDomains.length === 0 && (
                <span className="text-text-muted text-sm">No domains blocked</span>
              )}
            </div>
          </div>
        </>
      )}

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={() => updateMutation.mutate(config)}
          disabled={updateMutation.isPending}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function FederationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
