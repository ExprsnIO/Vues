'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import {
  PageHeader,
  DataTable,
  Column,
  Badge,
  StatCard,
  StatusIndicator,
  FormField,
  Input,
  Toggle,
  PageSkeleton,
} from '@/components/admin/ui';

interface OCSPResponder {
  id: string;
  url: string;
  status: 'online' | 'offline' | 'degraded';
  issuer: string;
  lastCheck: string;
  responseTime: number;
  requestsToday: number;
  errorRate: number;
}

interface OCSPRequest {
  id: string;
  serialNumber: string;
  status: 'good' | 'revoked' | 'unknown';
  responseTime: number;
  requestedAt: string;
  clientIP?: string;
}

export default function OCSPStatusPage() {
  const queryClient = useQueryClient();
  const [testSerial, setTestSerial] = useState('');
  const [testResult, setTestResult] = useState<{
    status: 'good' | 'revoked' | 'unknown';
    responseTime: number;
    thisUpdate: string;
    nextUpdate: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'ca', 'ocsp'],
    queryFn: () => api.caGetOCSPStatus(),
    refetchInterval: 30000, // Refresh every 30s
  });

  const { data: recentRequests } = useQuery({
    queryKey: ['admin', 'ca', 'ocsp', 'requests'],
    queryFn: () => api.caGetOCSPRequests({ limit: 10 }),
  });

  const testMutation = useMutation({
    mutationFn: (serialNumber: string) => api.caOCSPCheck(serialNumber),
    onSuccess: (result) => {
      setTestResult(result);
      toast.success('OCSP check completed');
    },
    onError: () => {
      toast.error('OCSP check failed');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (data: { responderId: string; enabled: boolean }) =>
      api.caToggleOCSPResponder(data.responderId, data.enabled),
    onSuccess: () => {
      toast.success('OCSP responder updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'ca', 'ocsp'] });
    },
    onError: () => {
      toast.error('Failed to update OCSP responder');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  const responders = data?.responders || [];
  const stats = data?.stats || {
    totalResponders: 0,
    online: 0,
    avgResponseTime: 0,
    requestsToday: 0,
    errorRate: 0,
  };

  const responderColumns: Column<OCSPResponder>[] = [
    {
      key: 'url',
      header: 'Responder URL',
      render: (row) => (
        <div>
          <p className="text-sm font-mono text-text-primary">{row.url}</p>
          <p className="text-xs text-text-muted">Issuer: {row.issuer}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusIndicator
          status={row.status === 'online' ? 'online' : row.status === 'degraded' ? 'warning' : 'offline'}
          label={row.status}
        />
      ),
    },
    {
      key: 'responseTime',
      header: 'Response Time',
      render: (row) => (
        <span className={`text-sm ${row.responseTime > 500 ? 'text-warning' : 'text-text-primary'}`}>
          {row.responseTime}ms
        </span>
      ),
    },
    {
      key: 'requests',
      header: 'Requests Today',
      render: (row) => (
        <span className="text-sm text-text-muted">{row.requestsToday.toLocaleString()}</span>
      ),
    },
    {
      key: 'errorRate',
      header: 'Error Rate',
      render: (row) => (
        <span className={`text-sm ${row.errorRate > 1 ? 'text-error' : 'text-text-muted'}`}>
          {row.errorRate.toFixed(2)}%
        </span>
      ),
    },
    {
      key: 'lastCheck',
      header: 'Last Check',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {new Date(row.lastCheck).toLocaleTimeString()}
        </span>
      ),
    },
  ];

  const requestColumns: Column<OCSPRequest>[] = [
    {
      key: 'serial',
      header: 'Serial Number',
      render: (row) => (
        <span className="text-sm font-mono text-text-muted">{row.serialNumber.slice(0, 16)}...</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge
          variant={row.status === 'good' ? 'success' : row.status === 'revoked' ? 'error' : 'warning'}
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'responseTime',
      header: 'Response',
      render: (row) => (
        <span className="text-sm text-text-muted">{row.responseTime}ms</span>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {new Date(row.requestedAt).toLocaleTimeString()}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="OCSP Status"
        description="Monitor Online Certificate Status Protocol responders"
      />

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard
          title="Responders"
          value={stats.totalResponders}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
          }
        />
        <StatCard
          title="Online"
          value={stats.online}
          variant="success"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          }
        />
        <StatCard
          title="Avg Response"
          value={`${stats.avgResponseTime}ms`}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          title="Requests Today"
          value={stats.requestsToday.toLocaleString()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          }
        />
        <StatCard
          title="Error Rate"
          value={`${stats.errorRate.toFixed(2)}%`}
          variant={stats.errorRate > 1 ? 'error' : 'default'}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* OCSP Test */}
      <div className="p-6 bg-surface border border-border rounded-xl">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Test OCSP Response</h3>
        <div className="flex gap-4">
          <div className="flex-1">
            <FormField label="Certificate Serial Number">
              <Input
                value={testSerial}
                onChange={(e) => setTestSerial(e.target.value)}
                placeholder="Enter certificate serial number..."
                className="font-mono"
              />
            </FormField>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => testMutation.mutate(testSerial)}
              disabled={!testSerial || testMutation.isPending}
              className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              {testMutation.isPending ? 'Checking...' : 'Check Status'}
            </button>
          </div>
        </div>

        {testResult && (
          <div className="mt-4 p-4 bg-surface-hover rounded-lg">
            <div className="flex items-center gap-4">
              <Badge
                variant={testResult.status === 'good' ? 'success' : testResult.status === 'revoked' ? 'error' : 'warning'}
                size="lg"
              >
                {testResult.status.toUpperCase()}
              </Badge>
              <div className="text-sm text-text-muted">
                <span>Response time: {testResult.responseTime}ms</span>
                <span className="mx-2">•</span>
                <span>Valid until: {new Date(testResult.nextUpdate).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Responders Table */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">OCSP Responders</h3>
        <DataTable
          data={responders}
          columns={responderColumns}
          keyExtractor={(row) => row.id}
          emptyMessage="OCSP responders"
        />
      </div>

      {/* Recent Requests */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">Recent Requests</h3>
        <DataTable
          data={recentRequests?.requests || []}
          columns={requestColumns}
          keyExtractor={(row) => row.id}
          emptyMessage="OCSP requests"
        />
      </div>

      {/* OCSP Configuration */}
      <div className="p-6 bg-surface border border-border rounded-xl">
        <h3 className="text-lg font-semibold text-text-primary mb-4">OCSP Configuration</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-surface-hover rounded-lg">
            <div>
              <p className="text-sm font-medium text-text-primary">OCSP Stapling</p>
              <p className="text-xs text-text-muted">Enable OCSP stapling for improved performance</p>
            </div>
            <Toggle
              checked={data?.config?.staplingEnabled ?? true}
              onChange={(enabled) => {
                // Handle toggle
              }}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-surface-hover rounded-lg">
            <div>
              <p className="text-sm font-medium text-text-primary">Response Caching</p>
              <p className="text-xs text-text-muted">Cache OCSP responses for faster lookups</p>
            </div>
            <Toggle
              checked={data?.config?.cachingEnabled ?? true}
              onChange={(enabled) => {
                // Handle toggle
              }}
            />
          </div>
          <div className="flex items-center justify-between p-4 bg-surface-hover rounded-lg">
            <div>
              <p className="text-sm font-medium text-text-primary">OCSP Must-Staple</p>
              <p className="text-xs text-text-muted">Require OCSP stapling for all certificates</p>
            </div>
            <Toggle
              checked={data?.config?.mustStaple ?? false}
              onChange={(enabled) => {
                // Handle toggle
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
