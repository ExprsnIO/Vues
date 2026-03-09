// @ts-nocheck
'use client';

import { Badge } from '@/components/admin/ui';

interface UsageData {
  totalRequests: number;
  requestsToday: number;
  requestsThisWeek: number;
  requestsThisMonth: number;
  lastUsed?: string;
  averageResponseTime: number;
  errorRate: number;
  topEndpoints: Array<{
    endpoint: string;
    count: number;
    avgLatency: number;
  }>;
  recentActivity: Array<{
    timestamp: string;
    endpoint: string;
    status: number;
    latency: number;
  }>;
  rateLimitHits: number;
  dailyUsage: Array<{
    date: string;
    requests: number;
    errors: number;
  }>;
}

interface TokenUsageStatsProps {
  usage: UsageData;
  rateLimit?: {
    requests: number;
    window: number;
  };
}

export function TokenUsageStats({ usage, rateLimit }: TokenUsageStatsProps) {
  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-500';
    if (status >= 400 && status < 500) return 'text-yellow-500';
    return 'text-red-500';
  };

  const maxDailyUsage = Math.max(...usage.dailyUsage.map(d => d.requests), 1);

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 bg-surface border border-border rounded-xl">
          <p className="text-sm text-text-muted">Total Requests</p>
          <p className="text-2xl font-bold text-text-primary">{usage.totalRequests.toLocaleString()}</p>
          {usage.lastUsed && (
            <p className="text-xs text-text-muted mt-1">
              Last: {new Date(usage.lastUsed).toLocaleString()}
            </p>
          )}
        </div>

        <div className="p-4 bg-surface border border-border rounded-xl">
          <p className="text-sm text-text-muted">Today</p>
          <p className="text-2xl font-bold text-text-primary">{usage.requestsToday.toLocaleString()}</p>
          {rateLimit && (
            <p className="text-xs text-text-muted mt-1">
              Limit: {rateLimit.requests}/{rateLimit.window}s
            </p>
          )}
        </div>

        <div className="p-4 bg-surface border border-border rounded-xl">
          <p className="text-sm text-text-muted">Avg Response Time</p>
          <p className={`text-2xl font-bold ${
            usage.averageResponseTime < 100 ? 'text-green-500' :
            usage.averageResponseTime < 500 ? 'text-yellow-500' : 'text-red-500'
          }`}>
            {usage.averageResponseTime}ms
          </p>
        </div>

        <div className="p-4 bg-surface border border-border rounded-xl">
          <p className="text-sm text-text-muted">Error Rate</p>
          <p className={`text-2xl font-bold ${
            usage.errorRate < 1 ? 'text-green-500' :
            usage.errorRate < 5 ? 'text-yellow-500' : 'text-red-500'
          }`}>
            {usage.errorRate.toFixed(2)}%
          </p>
          {usage.rateLimitHits > 0 && (
            <p className="text-xs text-yellow-500 mt-1">
              {usage.rateLimitHits} rate limit hits
            </p>
          )}
        </div>
      </div>

      {/* Usage Chart */}
      <div className="p-5 bg-surface border border-border rounded-xl">
        <h4 className="font-medium text-text-primary mb-4">Daily Usage (Last 14 Days)</h4>
        <div className="h-40 flex items-end gap-1">
          {usage.dailyUsage.map((day, index) => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col gap-0.5">
                {day.errors > 0 && (
                  <div
                    className="w-full bg-red-500 rounded-t"
                    style={{ height: `${(day.errors / maxDailyUsage) * 120}px` }}
                  />
                )}
                <div
                  className="w-full bg-accent rounded"
                  style={{ height: `${((day.requests - day.errors) / maxDailyUsage) * 120}px` }}
                />
              </div>
              <span className="text-[10px] text-text-muted">
                {new Date(day.date).toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-accent rounded" />
            <span className="text-xs text-text-muted">Successful</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded" />
            <span className="text-xs text-text-muted">Errors</span>
          </div>
        </div>
      </div>

      {/* Top Endpoints */}
      <div className="p-5 bg-surface border border-border rounded-xl">
        <h4 className="font-medium text-text-primary mb-4">Top Endpoints</h4>
        <div className="space-y-3">
          {usage.topEndpoints.map((endpoint, index) => (
            <div key={endpoint.endpoint} className="flex items-center gap-4">
              <span className="text-sm text-text-muted w-6">#{index + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono text-text-primary truncate">{endpoint.endpoint}</p>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs text-text-muted">
                    {endpoint.count.toLocaleString()} requests
                  </span>
                  <span className={`text-xs ${
                    endpoint.avgLatency < 100 ? 'text-green-500' :
                    endpoint.avgLatency < 500 ? 'text-yellow-500' : 'text-red-500'
                  }`}>
                    {endpoint.avgLatency}ms avg
                  </span>
                </div>
              </div>
              <div className="w-24 h-2 bg-surface-hover rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${(endpoint.count / usage.topEndpoints[0].count) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="p-5 bg-surface border border-border rounded-xl">
        <h4 className="font-medium text-text-primary mb-4">Recent Activity</h4>
        <div className="space-y-2">
          {usage.recentActivity.map((activity, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-surface-hover rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Badge variant={
                  activity.status >= 200 && activity.status < 300 ? 'success' :
                  activity.status >= 400 && activity.status < 500 ? 'warning' : 'danger'
                } size="sm">
                  {activity.status}
                </Badge>
                <span className="text-sm font-mono text-text-primary">{activity.endpoint}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <span className={getStatusColor(activity.status)}>{activity.latency}ms</span>
                <span>{new Date(activity.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TokenUsageStats;
