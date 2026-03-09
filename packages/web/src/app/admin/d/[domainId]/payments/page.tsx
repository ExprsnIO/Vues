// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import { formatCount } from '@/lib/utils';
import {
  PageHeader,
  StatsGrid,
  StatCard,
  SimpleTabs,
  DataTable,
  Column,
  Toggle,
  FormField,
  Input,
  Select,
  PageSkeleton,
  StatusBadge,
} from '@/components/admin/ui';

export default function DomainPaymentsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState('overview');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'payments'],
    queryFn: () => api.adminDomainPaymentsGet(domainId),
    enabled: !!domainId,
  });

  const updateConfigMutation = useMutation({
    mutationFn: (config: any) => api.adminDomainPaymentsUpdate(domainId, config),
    onSuccess: () => {
      toast.success('Payment settings updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'payments'] });
    },
    onError: () => {
      toast.error('Failed to update payment settings');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load payment configuration</p>
      </div>
    );
  }

  const config = data?.config || {
    enabled: false,
    provider: 'stripe',
    currency: 'USD',
    subscriptionsEnabled: false,
    tipsEnabled: false,
    creatorPayoutsEnabled: false,
  };

  const stats = data?.stats || {
    totalRevenue: 0,
    monthlyRevenue: 0,
    activeSubscriptions: 0,
    totalTransactions: 0,
    pendingPayouts: 0,
  };

  const transactions = data?.recentTransactions || [];

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'transactions', label: 'Transactions', badge: transactions.length },
    { id: 'settings', label: 'Settings' },
  ];

  const transactionColumns: Column<any>[] = [
    {
      key: 'createdAt',
      header: 'Date',
      render: (row) => (
        <div>
          <p className="text-sm text-text-primary">{new Date(row.createdAt).toLocaleDateString()}</p>
          <p className="text-xs text-text-muted">{new Date(row.createdAt).toLocaleTimeString()}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span className="capitalize text-sm">{row.type}</span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <span className="text-sm font-medium text-text-primary">
          ${(row.amount / 100).toFixed(2)} {row.currency}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <span className="text-sm text-text-muted">@{row.user?.handle || 'unknown'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description={`Payment configuration for ${selectedDomain?.name || 'this domain'}`}
      />

      <SimpleTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <StatsGrid columns={4}>
            <StatCard
              title="Total Revenue"
              value={`$${formatCount(stats.totalRevenue / 100)}`}
              variant="success"
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <StatCard
              title="Monthly Revenue"
              value={`$${formatCount(stats.monthlyRevenue / 100)}`}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            />
            <StatCard
              title="Active Subscriptions"
              value={formatCount(stats.activeSubscriptions)}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              }
            />
            <StatCard
              title="Pending Payouts"
              value={`$${formatCount(stats.pendingPayouts / 100)}`}
              variant={stats.pendingPayouts > 0 ? 'warning' : 'default'}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
            />
          </StatsGrid>

          {/* Status Card */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Payment Status</h3>
                <p className="text-sm text-text-muted mt-1">
                  {config.enabled
                    ? `Payments enabled via ${config.provider}`
                    : 'Payments are currently disabled'}
                </p>
              </div>
              <div className={`px-4 py-2 rounded-full ${config.enabled ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-400'}`}>
                {config.enabled ? 'Active' : 'Inactive'}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'transactions' && (
        <DataTable
          data={transactions}
          columns={transactionColumns}
          keyExtractor={(row) => row.id}
          emptyMessage="transactions"
        />
      )}

      {activeTab === 'settings' && (
        <div className="bg-surface border border-border rounded-xl p-6 space-y-6">
          <Toggle
            checked={config.enabled}
            onChange={(enabled) => updateConfigMutation.mutate({ ...config, enabled })}
            label="Enable Payments"
            description="Allow payment processing for this domain"
          />

          <FormField label="Payment Provider">
            <Select
              value={config.provider}
              onChange={(e: any) => updateConfigMutation.mutate({ ...config, provider: e.target.value })}
              disabled={!config.enabled}
            >
              <option value="stripe">Stripe</option>
              <option value="paypal">PayPal</option>
            </Select>
          </FormField>

          <FormField label="Currency">
            <Select
              value={config.currency}
              onChange={(e: any) => updateConfigMutation.mutate({ ...config, currency: e.target.value })}
              disabled={!config.enabled}
            >
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
            </Select>
          </FormField>

          <div className="border-t border-border pt-6 space-y-4">
            <h4 className="text-sm font-medium text-text-primary">Features</h4>

            <Toggle
              checked={config.subscriptionsEnabled}
              onChange={(subscriptionsEnabled) => updateConfigMutation.mutate({ ...config, subscriptionsEnabled })}
              label="Subscriptions"
              description="Enable subscription-based monetization"
              disabled={!config.enabled}
            />

            <Toggle
              checked={config.tipsEnabled}
              onChange={(tipsEnabled) => updateConfigMutation.mutate({ ...config, tipsEnabled })}
              label="Tips & Donations"
              description="Allow users to send tips to creators"
              disabled={!config.enabled}
            />

            <Toggle
              checked={config.creatorPayoutsEnabled}
              onChange={(creatorPayoutsEnabled) => updateConfigMutation.mutate({ ...config, creatorPayoutsEnabled })}
              label="Creator Payouts"
              description="Enable automatic payouts to creators"
              disabled={!config.enabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
