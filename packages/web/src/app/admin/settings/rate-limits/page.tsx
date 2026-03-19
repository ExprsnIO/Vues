'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

// ─── Types ──────────────────────────────────────────────────

interface AuthRateLimit {
  name: string;
  key: string;
  maxAttempts: number;
  windowSeconds: number;
  blockDurationSeconds: number;
  description: string;
}

interface DomainRateLimits {
  requestsPerMinute: number;
  requestsPerHour: number;
  dailyUploadLimit: number;
  storageQuotaGb: number;
}

interface RateLimitStatus {
  key: string;
  currentCount: number;
  isBlocked: boolean;
  ttl: number;
}

// Hard-coded auth rate limits (these are defined in security-middleware.ts)
const AUTH_RATE_LIMITS: AuthRateLimit[] = [
  {
    name: 'Login',
    key: 'login',
    maxAttempts: 5,
    windowSeconds: 15 * 60,
    blockDurationSeconds: 30 * 60,
    description: 'Login attempts per IP address',
  },
  {
    name: 'Signup',
    key: 'signup',
    maxAttempts: 3,
    windowSeconds: 60 * 60,
    blockDurationSeconds: 60 * 60,
    description: 'Account creation per IP address',
  },
  {
    name: 'Token Refresh',
    key: 'refresh',
    maxAttempts: 30,
    windowSeconds: 60,
    blockDurationSeconds: 5 * 60,
    description: 'Session refresh per user',
  },
  {
    name: 'Password Reset',
    key: 'passwordReset',
    maxAttempts: 3,
    windowSeconds: 60 * 60,
    blockDurationSeconds: 60 * 60,
    description: 'Password reset requests per IP/email',
  },
];

const API_RATE_TIERS = [
  { tier: 'Anonymous', requestsPerMinute: 30, description: 'Unauthenticated requests' },
  { tier: 'Authenticated', requestsPerMinute: 60, description: 'Logged-in users' },
  { tier: 'Admin', requestsPerMinute: 120, description: 'Admin/moderator users' },
  { tier: 'API Token', requestsPerMinute: 60, description: 'Requests via API token' },
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

// ─── Component ──────────────────────────────────────────────

export default function RateLimitsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'auth' | 'api' | 'domain' | 'active'>('auth');

  // Fetch domain rate limits (from the first/default domain)
  const { data: domains } = useQuery<{ domains: Array<{ id: string; domain: string; rateLimits: DomainRateLimits }> }>({
    queryKey: ['admin', 'domains-ratelimits'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.listDomains?limit=10`, {
        credentials: 'include',
      });
      if (!res.ok) return { domains: [] };
      return res.json();
    },
  });

  // Fetch active rate limit keys from Redis
  const { data: activeKeys, refetch: refetchActive } = useQuery<RateLimitStatus[]>({
    queryKey: ['admin', 'rate-limit-active'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.settings.getRateLimitStatus`, {
        credentials: 'include',
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.entries || [];
    },
    refetchInterval: 10000,
  });

  // Unblock mutation
  const unblockMutation = useMutation({
    mutationFn: async (key: string) => {
      const res = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.settings.unblockRateLimit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error('Failed to unblock');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Rate limit unblocked');
      refetchActive();
    },
    onError: () => toast.error('Failed to unblock'),
  });

  const tabs = [
    { id: 'auth' as const, label: 'Authentication' },
    { id: 'api' as const, label: 'API Tiers' },
    { id: 'domain' as const, label: 'Domain Limits' },
    { id: 'active' as const, label: 'Active Blocks' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Rate Limits</h1>
        <p className="text-text-muted mt-1">
          View and manage rate limiting rules across authentication, API, and domain endpoints
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface border border-border rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-accent text-white'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Auth Rate Limits */}
      {activeTab === 'auth' && (
        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-border">
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold text-text-primary">Authentication Rate Limits</h3>
              <p className="text-sm text-text-muted mt-1">
                IP-based limits for authentication endpoints. These are enforced server-side and configured in code.
              </p>
            </div>
            <div className="divide-y divide-border">
              {AUTH_RATE_LIMITS.map((limit) => (
                <div key={limit.key} className="p-5 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium text-text-primary">{limit.name}</h4>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-mono">
                        {limit.key}
                      </span>
                    </div>
                    <p className="text-sm text-text-muted mt-1">{limit.description}</p>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-right">
                      <p className="text-text-muted">Limit</p>
                      <p className="font-medium text-text-primary">
                        {limit.maxAttempts} / {formatDuration(limit.windowSeconds)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-text-muted">Block Duration</p>
                      <p className="font-medium text-text-primary">
                        {formatDuration(limit.blockDurationSeconds)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-sm text-text-muted">
            Authentication rate limits are defined in <code className="text-text-primary bg-surface px-1.5 py-0.5 rounded">security-middleware.ts</code> and
            require a code change + restart to modify. Failed logins also trigger progressive delays after 10 consecutive failures.
          </div>
        </div>
      )}

      {/* API Rate Tiers */}
      {activeTab === 'api' && (
        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-border">
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold text-text-primary">API Rate Limit Tiers</h3>
              <p className="text-sm text-text-muted mt-1">
                Per-endpoint rate limits based on authentication tier. Applied to all XRPC endpoints.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-muted">
                  <th className="text-left p-4 font-medium">Tier</th>
                  <th className="text-left p-4 font-medium">Requests / Minute</th>
                  <th className="text-left p-4 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {API_RATE_TIERS.map((tier) => (
                  <tr key={tier.tier} className="hover:bg-surface-elevated/30">
                    <td className="p-4">
                      <span className="font-medium text-text-primary">{tier.tier}</span>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-accent">{tier.requestsPerMinute}</span>
                      <span className="text-text-muted"> req/min</span>
                    </td>
                    <td className="p-4 text-text-muted">{tier.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-sm text-text-muted">
            API tier limits are enforced per-endpoint using a 1-minute sliding window in Redis.
            Exceeding the limit returns HTTP 429 with a <code className="text-text-primary bg-surface px-1.5 py-0.5 rounded">Retry-After</code> header.
          </div>
        </div>
      )}

      {/* Domain Rate Limits */}
      {activeTab === 'domain' && (
        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-border">
            <div className="p-5 border-b border-border">
              <h3 className="font-semibold text-text-primary">Domain Rate Limits</h3>
              <p className="text-sm text-text-muted mt-1">
                Per-domain resource limits. Configure via domain settings.
              </p>
            </div>

            {(!domains?.domains || domains.domains.length === 0) ? (
              <div className="p-8 text-center text-text-muted">
                No domains configured. Domain rate limits are set per-domain in domain settings.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {domains.domains.map((d) => (
                  <div key={d.id} className="p-5">
                    <h4 className="font-medium text-text-primary mb-3">{d.domain}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-text-muted">Requests / Min</p>
                        <p className="text-lg font-medium text-text-primary">
                          {d.rateLimits?.requestsPerMinute ?? 60}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted">Requests / Hour</p>
                        <p className="text-lg font-medium text-text-primary">
                          {d.rateLimits?.requestsPerHour ?? 1000}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted">Daily Uploads</p>
                        <p className="text-lg font-medium text-text-primary">
                          {d.rateLimits?.dailyUploadLimit ?? 100}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted">Storage Quota</p>
                        <p className="text-lg font-medium text-text-primary">
                          {d.rateLimits?.storageQuotaGb ?? 10} GB
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl text-sm text-text-muted">
            Domain rate limits default to 60 req/min, 1000 req/hr, 100 daily uploads, and 10 GB storage.
            Modify them via each domain's settings page.
          </div>
        </div>
      )}

      {/* Active Blocks */}
      {activeTab === 'active' && (
        <div className="space-y-4">
          <div className="bg-surface rounded-xl border border-border">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-text-primary">Active Rate Limit Blocks</h3>
                <p className="text-sm text-text-muted mt-1">
                  Currently blocked IPs and identifiers. Blocks expire automatically.
                </p>
              </div>
              <button
                onClick={() => refetchActive()}
                className="px-3 py-1.5 text-sm bg-surface-elevated text-text-primary rounded-lg hover:bg-surface-elevated/80 transition-colors"
              >
                Refresh
              </button>
            </div>

            {(!activeKeys || activeKeys.length === 0) ? (
              <div className="p-8 text-center text-text-muted">
                <svg className="w-12 h-12 mx-auto mb-3 text-text-muted/30" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <p className="font-medium">No active blocks</p>
                <p className="text-sm mt-1">All rate limits are within thresholds</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="text-left p-4 font-medium">Key</th>
                    <th className="text-left p-4 font-medium">Count</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">TTL</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {activeKeys.map((entry) => (
                    <tr key={entry.key} className="hover:bg-surface-elevated/30">
                      <td className="p-4 font-mono text-xs text-text-primary">{entry.key}</td>
                      <td className="p-4 text-text-primary">{entry.currentCount}</td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          entry.isBlocked
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-yellow-500/10 text-yellow-400'
                        }`}>
                          {entry.isBlocked ? 'Blocked' : 'Tracking'}
                        </span>
                      </td>
                      <td className="p-4 text-text-muted">{formatDuration(entry.ttl)}</td>
                      <td className="p-4 text-right">
                        {entry.isBlocked && (
                          <button
                            onClick={() => unblockMutation.mutate(entry.key)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Unblock
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
