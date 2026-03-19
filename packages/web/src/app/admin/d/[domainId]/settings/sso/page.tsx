// @ts-nocheck
'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import {
  PageHeader,
  StatCard,
  Badge,
  PageSkeleton,
} from '@/components/admin/ui';
import { ProviderCard } from '@/components/admin/sso';

export default function SSOOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const isDev = process.env.NODE_ENV !== 'production';
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'config'],
    queryFn: () => api.adminDomainSSOConfigGet(domainId),
    enabled: !!domainId,
  });

  const { data: providersData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'providers'],
    queryFn: () => api.adminDomainSSOProvidersList(domainId),
    enabled: !!domainId,
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  const config = data?.config;
  const providers = providersData?.providers || [];
  const stats = {
    totalProviders: providers.length,
    activeProviders: providers.filter((p: any) => p.status === 'active').length,
    ssoLogins24h: data?.stats?.logins24h || 0,
    linkedUsers: data?.stats?.linkedUsers || 0,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Single Sign-On"
        description={`SSO configuration for ${selectedDomain?.name || 'this domain'}`}
        actions={
          <button
            onClick={() => router.push(`/admin/d/${domainId}/settings/sso/providers/new`)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Add Provider
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Identity Providers"
          value={stats.totalProviders}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
        />
        <StatCard
          title="Active"
          value={stats.activeProviders}
          variant="success"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="SSO Logins (24h)"
          value={stats.ssoLogins24h}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
          }
        />
        <StatCard
          title="Linked Users"
          value={stats.linkedUsers}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => router.push(`/admin/d/${domainId}/settings/sso/providers`)}
          className="p-4 bg-surface hover:bg-surface-hover border border-border rounded-xl text-left transition-colors group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-text-primary group-hover:text-accent">
              Manage Providers
            </span>
          </div>
          <p className="text-xs text-text-muted">Configure identity providers</p>
        </button>

        <button
          onClick={() => router.push(`/admin/d/${domainId}/settings/sso/email-domains`)}
          className="p-4 bg-surface hover:bg-surface-hover border border-border rounded-xl text-left transition-colors group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            <span className="text-sm font-medium text-text-primary group-hover:text-accent">
              Email Domains
            </span>
          </div>
          <p className="text-xs text-text-muted">Manage allowed email domains</p>
        </button>

        <button
          onClick={() => router.push(`/admin/d/${domainId}/settings/sso/policies`)}
          className="p-4 bg-surface hover:bg-surface-hover border border-border rounded-xl text-left transition-colors group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <span className="text-sm font-medium text-text-primary group-hover:text-accent">
              Session Policies
            </span>
          </div>
          <p className="text-xs text-text-muted">Configure MFA and session rules</p>
        </button>

        <button
          onClick={() => router.push(`/admin/d/${domainId}/settings/sso/exprsn`)}
          className="p-4 bg-surface hover:bg-surface-hover border border-border rounded-xl text-left transition-colors group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-accent/10 rounded-lg">
              <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.35C17.25 21.15 21 16.25 21 11V5l-9-4zm-1 13l-3-3 1.41-1.41L11 11.17l4.59-4.58L17 8l-6 6z" />
              </svg>
            </div>
            <span className="text-sm font-medium text-text-primary group-hover:text-accent">
              Exprsn SSO
            </span>
          </div>
          <p className="text-xs text-text-muted">Connect Exprsn instances with scopes &amp; roles</p>
        </button>
      </div>

      {/* Development Mode Default OAuth Info */}
      {isDev && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-400">Development OAuth Configuration</h3>
              <div className="mt-2 space-y-2 text-sm text-blue-300">
                <div>
                  <span className="font-medium">OAuth Endpoint:</span>{' '}
                  <code className="px-1.5 py-0.5 bg-blue-500/20 rounded font-mono text-xs">
                    {API_BASE}/oauth
                  </code>
                </div>
                <div>
                  <span className="font-medium">Authorization:</span>{' '}
                  <code className="px-1.5 py-0.5 bg-blue-500/20 rounded font-mono text-xs">
                    {API_BASE}/oauth/authorize
                  </code>
                </div>
                <div>
                  <span className="font-medium">Token:</span>{' '}
                  <code className="px-1.5 py-0.5 bg-blue-500/20 rounded font-mono text-xs">
                    {API_BASE}/oauth/token
                  </code>
                </div>
                <div>
                  <span className="font-medium">OIDC Discovery:</span>{' '}
                  <code className="px-1.5 py-0.5 bg-blue-500/20 rounded font-mono text-xs">
                    {API_BASE}/.well-known/openid-configuration
                  </code>
                </div>
              </div>
              <p className="text-xs text-blue-300/70 mt-3">
                Use these endpoints when configuring external OAuth clients to authenticate with your local development server.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Providers */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">Identity Providers</h3>
          <button
            onClick={() => router.push(`/admin/d/${domainId}/settings/sso/providers`)}
            className="text-sm text-accent hover:underline"
          >
            View all
          </button>
        </div>

        {providers.length === 0 ? (
          <div className="p-8 bg-surface border border-border rounded-xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-surface-hover rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h4 className="text-lg font-medium text-text-primary mb-2">No providers configured</h4>
            <p className="text-sm text-text-muted mb-4">
              Add an identity provider to enable SSO for your users
            </p>
            <button
              onClick={() => router.push(`/admin/d/${domainId}/settings/sso/providers/new`)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
            >
              Add First Provider
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {providers.slice(0, 4).map((provider: any) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                onClick={() => router.push(`/admin/d/${domainId}/settings/sso/providers/${provider.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* SSO Status */}
      <div className="p-6 bg-surface border border-border rounded-xl">
        <h3 className="text-lg font-semibold text-text-primary mb-4">SSO Configuration Status</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${config?.enabled ? 'bg-green-500' : 'bg-yellow-500'}`} />
              <span className="text-sm text-text-primary">SSO Authentication</span>
            </div>
            <Badge variant={config?.enabled ? 'success' : 'warning'}>
              {config?.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${config?.enforced ? 'bg-green-500' : 'bg-gray-500'}`} />
              <span className="text-sm text-text-primary">SSO Enforcement</span>
            </div>
            <Badge variant={config?.enforced ? 'info' : 'default'}>
              {config?.enforced ? 'Required' : 'Optional'}
            </Badge>
          </div>
          <div className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${config?.jitProvisioning ? 'bg-green-500' : 'bg-gray-500'}`} />
              <span className="text-sm text-text-primary">JIT Provisioning</span>
            </div>
            <Badge variant={config?.jitProvisioning ? 'success' : 'default'}>
              {config?.jitProvisioning ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
