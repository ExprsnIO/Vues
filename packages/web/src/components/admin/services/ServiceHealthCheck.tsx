// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/admin/ui';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  responseTime: number;
  lastCheck: string;
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message?: string;
    duration?: number;
  }>;
  metrics?: {
    cpu?: number;
    memory?: number;
    disk?: number;
    connections?: number;
  };
}

interface ServiceHealthCheckProps {
  serviceId: string;
  serviceName: string;
  endpoint?: string;
  onCheck?: () => Promise<HealthCheckResult>;
  initialResult?: HealthCheckResult;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function ServiceHealthCheck({
  serviceId,
  serviceName,
  endpoint,
  onCheck,
  initialResult,
  autoRefresh = false,
  refreshInterval = 30000,
}: ServiceHealthCheckProps) {
  const [result, setResult] = useState<HealthCheckResult | null>(initialResult || null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runHealthCheck = async () => {
    if (!onCheck) return;

    setIsChecking(true);
    setError(null);

    try {
      const checkResult = await onCheck();
      setResult(checkResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
      setResult({
        status: 'unknown',
        responseTime: 0,
        lastCheck: new Date().toISOString(),
        checks: [],
      });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (autoRefresh && onCheck) {
      const interval = setInterval(runHealthCheck, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, onCheck]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'pass':
        return 'bg-green-500';
      case 'degraded':
      case 'warn':
        return 'bg-yellow-500';
      case 'unhealthy':
      case 'fail':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusVariant = (status: string): 'success' | 'warning' | 'danger' | 'default' => {
    switch (status) {
      case 'healthy':
      case 'pass':
        return 'success';
      case 'degraded':
      case 'warn':
        return 'warning';
      case 'unhealthy':
      case 'fail':
        return 'danger';
      default:
        return 'default';
    }
  };

  return (
    <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${result ? getStatusColor(result.status) : 'bg-gray-500'}`} />
          <div>
            <h4 className="font-medium text-text-primary">{serviceName}</h4>
            {endpoint && (
              <p className="text-xs text-text-muted font-mono">{endpoint}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {result && (
            <Badge variant={getStatusVariant(result.status)}>
              {result.status}
            </Badge>
          )}
          {onCheck && (
            <button
              onClick={runHealthCheck}
              disabled={isChecking}
              className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      )}

      {result && (
        <>
          {/* Response Time */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Response Time:</span>
              <span className={`font-medium ${
                result.responseTime < 100 ? 'text-green-500' :
                result.responseTime < 500 ? 'text-yellow-500' : 'text-red-500'
              }`}>
                {result.responseTime}ms
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-text-muted">Last Check:</span>
              <span className="text-text-primary">
                {new Date(result.lastCheck).toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Individual Checks */}
          {result.checks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-text-muted uppercase">Health Checks</p>
              <div className="space-y-1">
                {result.checks.map((check, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-2 bg-surface-hover rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(check.status)}`} />
                      <span className="text-sm text-text-primary">{check.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {check.message && (
                        <span className="text-xs text-text-muted">{check.message}</span>
                      )}
                      {check.duration !== undefined && (
                        <span className="text-xs text-text-muted">{check.duration}ms</span>
                      )}
                      <Badge variant={getStatusVariant(check.status)} size="sm">
                        {check.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics */}
          {result.metrics && (
            <div className="grid grid-cols-4 gap-3 pt-3 border-t border-border">
              {result.metrics.cpu !== undefined && (
                <div className="text-center">
                  <p className={`text-lg font-semibold ${
                    result.metrics.cpu > 80 ? 'text-red-500' :
                    result.metrics.cpu > 60 ? 'text-yellow-500' : 'text-text-primary'
                  }`}>
                    {result.metrics.cpu.toFixed(1)}%
                  </p>
                  <p className="text-xs text-text-muted">CPU</p>
                </div>
              )}
              {result.metrics.memory !== undefined && (
                <div className="text-center">
                  <p className={`text-lg font-semibold ${
                    result.metrics.memory > 80 ? 'text-red-500' :
                    result.metrics.memory > 60 ? 'text-yellow-500' : 'text-text-primary'
                  }`}>
                    {result.metrics.memory.toFixed(1)}%
                  </p>
                  <p className="text-xs text-text-muted">Memory</p>
                </div>
              )}
              {result.metrics.disk !== undefined && (
                <div className="text-center">
                  <p className={`text-lg font-semibold ${
                    result.metrics.disk > 90 ? 'text-red-500' :
                    result.metrics.disk > 75 ? 'text-yellow-500' : 'text-text-primary'
                  }`}>
                    {result.metrics.disk.toFixed(1)}%
                  </p>
                  <p className="text-xs text-text-muted">Disk</p>
                </div>
              )}
              {result.metrics.connections !== undefined && (
                <div className="text-center">
                  <p className="text-lg font-semibold text-text-primary">
                    {result.metrics.connections}
                  </p>
                  <p className="text-xs text-text-muted">Connections</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!result && !isChecking && !error && (
        <div className="py-4 text-center">
          <p className="text-sm text-text-muted">No health check data available</p>
          {onCheck && (
            <button
              onClick={runHealthCheck}
              className="mt-2 text-sm text-accent hover:underline"
            >
              Run health check
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ServiceHealthCheck;
