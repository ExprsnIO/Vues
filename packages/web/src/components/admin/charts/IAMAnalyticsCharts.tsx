'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

type Period = '7d' | '30d' | '90d';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
];

interface IAMOverviewProps {
  domainId?: string;
  organizationId?: string;
  className?: string;
}

/** IAM analytics overview with session, login, and role distribution stats */
export function IAMAnalyticsOverview({ domainId, organizationId, className = '' }: IAMOverviewProps) {
  const [period, setPeriod] = useState<Period>('30d');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'iam', 'overview', domainId, organizationId, period],
    queryFn: () =>
      api.getAdminTimeSeries({
        metric: 'users',
        period,
        domainId,
      }),
    staleTime: 60000,
  });

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Identity & Access Analytics</h3>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                period === opt.value
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface-hover text-text-muted hover:text-text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <IAMStatCard
          label="Active Sessions"
          value={stats?.datasets?.[0]?.data?.slice(-1)?.[0] ?? 0}
          trend={calculateTrend(stats?.datasets?.[0]?.data)}
          icon={<SessionIcon className="w-4 h-4" />}
          color="blue"
          isLoading={isLoading}
        />
        <IAMStatCard
          label="Login Attempts"
          value={stats?.datasets?.[0]?.data?.reduce((a: number, b: number) => a + b, 0) ?? 0}
          icon={<LoginIcon className="w-4 h-4" />}
          color="green"
          isLoading={isLoading}
        />
        <IAMStatCard
          label="Unique Roles"
          value="--"
          icon={<RoleIcon className="w-4 h-4" />}
          color="purple"
          isLoading={isLoading}
        />
        <IAMStatCard
          label="Permission Changes"
          value="--"
          icon={<PermissionIcon className="w-4 h-4" />}
          color="amber"
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

function calculateTrend(data?: number[]): number | undefined {
  if (!data || data.length < 2) return undefined;
  const recent = data.slice(-7);
  const prev = data.slice(-14, -7);
  if (prev.length === 0) return undefined;
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
  if (prevAvg === 0) return undefined;
  return Math.round(((recentAvg - prevAvg) / prevAvg) * 100);
}

interface IAMStatCardProps {
  label: string;
  value: number | string;
  trend?: number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'amber';
  isLoading?: boolean;
}

const COLOR_MAP = {
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
  green: { bg: 'bg-green-500/10', text: 'text-green-500' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-500' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-500' },
};

function IAMStatCard({ label, value, trend, icon, color, isLoading }: IAMStatCardProps) {
  const colors = COLOR_MAP[color];

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg ${colors.bg} flex items-center justify-center ${colors.text}`}>
          {icon}
        </div>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      {isLoading ? (
        <div className="h-7 w-16 bg-surface-hover rounded animate-pulse" />
      ) : (
        <div className="flex items-end gap-2">
          <span className="text-xl font-bold text-text-primary">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </span>
          {trend !== undefined && (
            <span
              className={`text-xs font-medium ${
                trend >= 0 ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {trend >= 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Role distribution display using CSS bars (no chart.js dependency) */
interface RoleDistributionProps {
  domainId: string;
  className?: string;
}

export function RoleDistributionChart({ domainId, className = '' }: RoleDistributionProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'roles'],
    queryFn: () => api.getDomainRoles(domainId),
    staleTime: 120000,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles: any[] = data?.roles || [];
  const totalUsers = roles.reduce((sum: number, r: any) => sum + (r.userCount || 0), 0);

  return (
    <div className={`bg-surface border border-border rounded-xl p-6 ${className}`}>
      <h3 className="text-sm font-medium text-text-primary mb-4">Role Distribution</h3>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1">
              <div className="h-3 w-20 bg-surface-hover rounded animate-pulse" />
              <div className="h-5 bg-surface-hover rounded animate-pulse" />
            </div>
          ))}
        </div>
      ) : roles.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-4">No roles configured</p>
      ) : (
        <div className="space-y-3">
          {roles.map((role: { id: string; name: string; displayName?: string; color?: string; userCount?: number }) => {
            const count = role.userCount || 0;
            const pct = totalUsers > 0 ? (count / totalUsers) * 100 : 0;
            return (
              <div key={role.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-text-primary">
                    {role.displayName || role.name}
                  </span>
                  <span className="text-xs text-text-muted">{count} users</span>
                </div>
                <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(pct, 1)}%`,
                      backgroundColor: role.color || 'var(--color-accent)',
                    }}
                  />
                </div>
              </div>
            );
          })}
          {totalUsers > 0 && (
            <p className="text-xs text-text-muted mt-2">{totalUsers} total assigned users</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Domain comparison chart - shows multiple domains side by side */
interface DomainComparisonProps {
  domainIds: string[];
  domainNames: Record<string, string>;
  metric: 'users' | 'videos' | 'views';
  className?: string;
}

export function DomainComparisonChart({
  domainIds,
  domainNames,
  metric,
  className = '',
}: DomainComparisonProps) {
  const [period, setPeriod] = useState<Period>('30d');

  const queries = domainIds.map((id) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: ['admin', 'stats', 'timeSeries', metric, period, id],
      queryFn: () => api.getAdminTimeSeries({ metric, period, domainId: id }),
      staleTime: 60000,
    })
  );

  const isLoading = queries.some((q) => q.isLoading);

  // Build comparison data
  const comparisonData = domainIds.map((id, i) => {
    const total = queries[i]?.data?.datasets?.[0]?.data?.reduce((a: number, b: number) => a + b, 0) ?? 0;
    return {
      id,
      name: domainNames[id] || id,
      total,
    };
  });

  const maxTotal = Math.max(...comparisonData.map((d) => d.total), 1);

  const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  return (
    <div className={`bg-surface border border-border rounded-xl p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-text-primary">Domain Comparison: {metric}</h3>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                period === opt.value
                  ? 'bg-accent text-text-inverse'
                  : 'bg-surface-hover text-text-muted hover:text-text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {domainIds.map((id) => (
            <div key={id} className="h-8 bg-surface-hover rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {comparisonData.map((domain, i) => (
            <div key={domain.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-text-primary">{domain.name}</span>
                <span className="text-xs text-text-muted">{domain.total.toLocaleString()}</span>
              </div>
              <div className="h-3 bg-surface-hover rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${(domain.total / maxTotal) * 100}%`,
                    backgroundColor: COLORS[i % COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Icons
function SessionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function LoginIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
}

function RoleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function PermissionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}
