'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import { formatCount } from '@/lib/utils';
import toast from 'react-hot-toast';
import { AdminChart } from '@/components/admin/charts/AdminChart';

export default function DomainDashboardPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();
  const [showDnsDetails, setShowDnsDetails] = useState(false);
  const [showHealthDetails, setShowHealthDetails] = useState(false);

  // Sync URL param with context
  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const { data: dnsData, isLoading: isDnsLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'dns'],
    queryFn: () => api.adminDomainsDnsStatus(domainId),
    enabled: !!domainId,
  });

  const { data: healthHistoryData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'health-history'],
    queryFn: () => api.adminDomainsHealthHistory(domainId, { limit: 50 }),
    enabled: !!domainId,
    refetchInterval: 60000, // Refetch every minute
  });

  const runHealthCheckMutation = useMutation({
    mutationFn: () => api.adminDomainsHealthCheck(domainId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'health-history'] });
      toast.success('Health check completed');
    },
    onError: () => {
      toast.error('Health check failed');
    },
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Domain not found</p>
        <Link href="/admin/domains" className="text-accent hover:underline mt-2 inline-block">
          Back to domains
        </Link>
      </div>
    );
  }

  const domain = data.domain;
  const userStats = data.userStats || {};
  const groupCount = data.groupCount || 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'pending':
      case 'verifying':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'suspended':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary">{domain.name}</h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(
                domain.status
              )}`}
            >
              {domain.status.charAt(0).toUpperCase() + domain.status.slice(1)}
            </span>
          </div>
          <p className="text-text-muted mt-1">{domain.domain}</p>
        </div>
        <Link
          href={`/admin/d/${domainId}/settings`}
          className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
        >
          Domain Settings
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Users"
          value={formatCount(userStats.total || 0)}
          subValue={userStats.active ? `${userStats.active} active` : undefined}
          icon={UsersIcon}
          href={`/admin/d/${domainId}/users`}
        />
        <StatCard
          label="Groups"
          value={groupCount.toString()}
          icon={GroupsIcon}
          href={`/admin/d/${domainId}/groups`}
        />
        <StatCard
          label="Pending Moderation"
          value="0"
          icon={ModerationIcon}
          href={`/admin/d/${domainId}/moderation`}
          highlight
        />
        <StatCard
          label="Reports"
          value="0"
          icon={ReportsIcon}
          href={`/admin/d/${domainId}/reports`}
        />
      </div>

      {/* Growth Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminChart
          title="User Growth"
          metric="users"
          domainId={domainId}
          fill
          color="#3b82f6"
        />
        <AdminChart
          title="Video Uploads"
          metric="videos"
          domainId={domainId}
          fill
          color="#8b5cf6"
        />
      </div>

      {/* Health & DNS Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DNS Status Card */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">DNS Configuration</h2>
            <button
              onClick={() => setShowDnsDetails(!showDnsDetails)}
              className="text-sm text-accent hover:underline"
            >
              {showDnsDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>

          {isDnsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : dnsData ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  dnsData.dnsStatus === 'valid' ? 'bg-green-500' :
                  dnsData.dnsStatus === 'partial' ? 'bg-yellow-500' :
                  dnsData.dnsStatus === 'invalid' ? 'bg-red-500' :
                  'bg-gray-500'
                }`} />
                <span className="text-text-primary font-medium">
                  {dnsData.dnsStatus === 'valid' ? 'All DNS records valid' :
                   dnsData.dnsStatus === 'partial' ? 'Some DNS records missing' :
                   dnsData.dnsStatus === 'invalid' ? 'DNS configuration invalid' :
                   'DNS status unknown'}
                </span>
              </div>

              {dnsData.lastChecked && (
                <p className="text-sm text-text-muted">
                  Last checked: {new Date(dnsData.lastChecked).toLocaleString()}
                </p>
              )}

              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-400">{dnsData.summary.valid}</p>
                  <p className="text-xs text-text-muted">Valid</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-400">{dnsData.summary.missing}</p>
                  <p className="text-xs text-text-muted">Missing</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">{dnsData.summary.invalid}</p>
                  <p className="text-xs text-text-muted">Invalid</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-400">{dnsData.summary.error}</p>
                  <p className="text-xs text-text-muted">Error</p>
                </div>
              </div>

              {showDnsDetails && dnsData.records.length > 0 && (
                <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                  {dnsData.records.map((record, idx) => (
                    <div key={idx} className="p-3 bg-surface-hover rounded-lg text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-text-primary">{record.recordType}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          record.status === 'valid' ? 'bg-green-500/10 text-green-400' :
                          record.status === 'missing' ? 'bg-yellow-500/10 text-yellow-400' :
                          record.status === 'invalid' ? 'bg-red-500/10 text-red-400' :
                          'bg-gray-500/10 text-gray-400'
                        }`}>
                          {record.status}
                        </span>
                      </div>
                      <p className="text-text-muted text-xs">{record.name}</p>
                      {record.actualValue && (
                        <p className="text-text-secondary text-xs mt-1 font-mono">{record.actualValue}</p>
                      )}
                      {record.errorMessage && (
                        <p className="text-red-400 text-xs mt-1">{record.errorMessage}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-text-muted text-sm">No DNS data available</p>
          )}
        </div>

        {/* Health Status Card */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Service Health</h2>
            <button
              onClick={() => runHealthCheckMutation.mutate()}
              disabled={runHealthCheckMutation.isPending}
              className="text-sm px-3 py-1 bg-accent hover:bg-accent-hover text-text-inverse rounded transition-colors disabled:opacity-50"
            >
              {runHealthCheckMutation.isPending ? 'Checking...' : 'Run Check'}
            </button>
          </div>

          {healthHistoryData ? (
            <div className="space-y-4">
              {healthHistoryData.stats && Object.keys(healthHistoryData.stats).length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(healthHistoryData.stats).map(([type, stat]: [string, any]) => (
                      <div key={type} className="p-3 bg-surface-hover rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-text-muted uppercase">{type}</span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            stat.uptime >= 99 ? 'bg-green-500/10 text-green-400' :
                            stat.uptime >= 95 ? 'bg-yellow-500/10 text-yellow-400' :
                            'bg-red-500/10 text-red-400'
                          }`}>
                            {stat.uptime}% uptime
                          </span>
                        </div>
                        <p className="text-sm text-text-muted">
                          {stat.healthy}/{stat.total} checks healthy
                        </p>
                      </div>
                    ))}
                  </div>

                  {showHealthDetails && healthHistoryData.history.length > 0 && (
                    <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                      {healthHistoryData.history.slice(0, 10).map((check) => (
                        <div key={check.id} className="p-3 bg-surface-hover rounded-lg text-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-text-primary uppercase text-xs">{check.checkType}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              check.status === 'healthy' ? 'bg-green-500/10 text-green-400' :
                              check.status === 'degraded' ? 'bg-yellow-500/10 text-yellow-400' :
                              'bg-red-500/10 text-red-400'
                            }`}>
                              {check.status}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-text-muted">
                            <span>{new Date(check.checkedAt).toLocaleString()}</span>
                            {check.responseTime && <span>{check.responseTime}ms</span>}
                          </div>
                          {check.errorMessage && (
                            <p className="text-red-400 text-xs mt-1">{check.errorMessage}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => setShowHealthDetails(!showHealthDetails)}
                    className="w-full text-sm text-accent hover:underline"
                  >
                    {showHealthDetails ? 'Hide' : 'Show'} History
                  </button>
                </>
              ) : (
                <div className="text-center py-4">
                  <p className="text-text-muted text-sm mb-3">No health check data available</p>
                  <button
                    onClick={() => runHealthCheckMutation.mutate()}
                    disabled={runHealthCheckMutation.isPending}
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
                  >
                    Run First Health Check
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Domain Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Domain Information</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-text-muted">Domain</dt>
              <dd className="text-text-primary font-medium">{domain.domain}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Type</dt>
              <dd className="text-text-primary font-medium capitalize">{domain.type}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Handle Suffix</dt>
              <dd className="text-text-primary font-medium">{domain.handleSuffix || 'N/A'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Created</dt>
              <dd className="text-text-primary font-medium">
                {new Date(domain.createdAt).toLocaleDateString()}
              </dd>
            </div>
            {domain.verifiedAt && (
              <div className="flex justify-between">
                <dt className="text-text-muted">Verified</dt>
                <dd className="text-text-primary font-medium">
                  {new Date(domain.verifiedAt).toLocaleDateString()}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Quick Actions */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/admin/d/${domainId}/users`}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
            >
              Manage Users
            </Link>
            <Link
              href={`/admin/d/${domainId}/moderation`}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
            >
              Moderation Queue
            </Link>
            <Link
              href={`/admin/d/${domainId}/settings/identity`}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
            >
              Identity Settings
            </Link>
            <Link
              href={`/admin/d/${domainId}/settings/branding`}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors"
            >
              Branding
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {data.recentActivity && data.recentActivity.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Recent Activity</h2>
          <div className="space-y-3">
            {data.recentActivity.slice(0, 5).map((activity: any, index: number) => (
              <div key={index} className="flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover">
                <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center text-text-muted">
                  <ActivityIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-primary truncate">{activity.description}</p>
                  <p className="text-xs text-text-muted">
                    {new Date(activity.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: React.FC<{ className?: string }>;
  href: string;
  highlight?: boolean;
}

function StatCard({ label, value, subValue, icon: Icon, href, highlight }: StatCardProps) {
  return (
    <Link
      href={href}
      className={`block bg-surface border rounded-xl p-6 hover:border-accent transition-colors ${
        highlight ? 'border-accent' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted mb-1">{label}</p>
          <p className={`text-3xl font-bold ${highlight ? 'text-accent' : 'text-text-primary'}`}>
            {value}
          </p>
          {subValue && <p className="text-xs text-text-muted mt-1">{subValue}</p>}
        </div>
        <div className={`p-3 rounded-lg ${highlight ? 'bg-accent/10' : 'bg-surface-hover'}`}>
          <Icon className={`w-6 h-6 ${highlight ? 'text-accent' : 'text-text-muted'}`} />
        </div>
      </div>
    </Link>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function GroupsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function ModerationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
