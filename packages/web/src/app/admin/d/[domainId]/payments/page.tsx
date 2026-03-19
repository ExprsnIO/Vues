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

type PaymentProvider = 'stripe' | 'paypal' | 'authorizenet';

interface PaymentConfig {
  id: string;
  provider: PaymentProvider;
  providerAccountId?: string;
  testMode: boolean;
  isActive: boolean;
  hasCredentials: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CredentialField {
  field: string;
  label: string;
  description: string;
  placeholder?: string;
}

interface ProviderMetadata {
  provider: PaymentProvider;
  displayName: string;
  description: string;
  requiredCredentials: string[];
  optionalCredentials: string[];
  requiredFields: CredentialField[];
  optionalFields: CredentialField[];
}

export default function DomainPaymentsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState('overview');
  const queryClient = useQueryClient();
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>('stripe');
  const [testConnection, setTestConnection] = useState<string | null>(null);

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  // Fetch domain payment data
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'payments'],
    queryFn: async () => {
      const response = await fetch(`/xrpc/io.exprsn.admin.payments.providers.list?organizationId=${domainId}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch payment config');
      return response.json();
    },
    enabled: !!domainId,
  });

  // Fetch provider metadata
  const { data: metadata } = useQuery({
    queryKey: ['admin', 'payments', 'metadata'],
    queryFn: async () => {
      const response = await fetch('/xrpc/io.exprsn.admin.payments.providers.metadata', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch metadata');
      return response.json();
    },
  });

  // Create provider mutation
  const createProviderMutation = useMutation({
    mutationFn: async (providerData: {
      provider: PaymentProvider;
      credentials: Record<string, string>;
      testMode: boolean;
      providerAccountId?: string;
    }) => {
      const response = await fetch('/xrpc/io.exprsn.admin.payments.providers.create', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...providerData,
          organizationId: domainId,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create provider');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Payment provider added successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'payments'] });
      setShowAddProvider(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update provider mutation
  const updateProviderMutation = useMutation({
    mutationFn: async (updateData: {
      id: string;
      isActive?: boolean;
      testMode?: boolean;
      credentials?: Record<string, string>;
    }) => {
      const response = await fetch('/xrpc/io.exprsn.admin.payments.providers.update', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) throw new Error('Failed to update provider');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Provider updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'payments'] });
    },
    onError: () => {
      toast.error('Failed to update provider');
    },
  });

  // Delete provider mutation
  const deleteProviderMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/xrpc/io.exprsn.admin.payments.providers.delete?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete provider');
      }
      return response.json();
    },
    onSuccess: () => {
      toast.success('Provider deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'payments'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch('/xrpc/io.exprsn.admin.payments.providers.test', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Connection test failed');
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Connection test successful');
      setTestConnection(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
      setTestConnection(null);
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

  const configs = data?.providers || [];
  const recentTransactions = data?.transactions || [];

  // Calculate stats from transactions
  const stats = {
    totalRevenue: recentTransactions
      .filter((t: any) => t.status === 'completed')
      .reduce((sum: number, t: any) => sum + t.amount, 0),
    totalTransactions: recentTransactions.length,
    activeConfigs: configs.filter((c: PaymentConfig) => c.isActive).length,
    pendingTransactions: recentTransactions.filter((t: any) => t.status === 'pending').length,
  };

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'providers', label: 'Providers', badge: configs.length },
    { id: 'transactions', label: 'Transactions', badge: recentTransactions.length },
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
      render: (row) => <span className="capitalize text-sm">{row.type}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <span className="text-sm font-medium text-text-primary">
          ${(row.amount / 100).toFixed(2)} {row.currency.toUpperCase()}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'stripe':
        return <StripeIcon className="w-5 h-5" />;
      case 'paypal':
        return <PayPalIcon className="w-5 h-5" />;
      case 'authorizenet':
        return <AuthorizeNetIcon className="w-5 h-5" />;
      default:
        return null;
    }
  };

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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
            <StatCard
              title="Transactions"
              value={formatCount(stats.totalTransactions)}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                  />
                </svg>
              }
            />
            <StatCard
              title="Active Providers"
              value={formatCount(stats.activeConfigs)}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
              }
            />
            <StatCard
              title="Pending"
              value={formatCount(stats.pendingTransactions)}
              variant={stats.pendingTransactions > 0 ? 'warning' : 'default'}
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
          </StatsGrid>

          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">Payment Status</h3>
                <p className="text-sm text-text-muted mt-1">
                  {configs.length > 0
                    ? `${configs.length} provider${configs.length > 1 ? 's' : ''} configured`
                    : 'No payment providers configured'}
                </p>
              </div>
              <div
                className={`px-4 py-2 rounded-full ${
                  stats.activeConfigs > 0
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-gray-500/10 text-gray-400'
                }`}
              >
                {stats.activeConfigs > 0 ? 'Active' : 'Inactive'}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'providers' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Payment Providers</h2>
              <p className="text-sm text-text-muted mt-1">Configure payment gateways for this domain</p>
            </div>
            <button
              onClick={() => setShowAddProvider(true)}
              className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors"
            >
              Add Provider
            </button>
          </div>

          <div className="space-y-3">
            {configs.length === 0 ? (
              <div className="text-center py-8 text-text-muted">
                <p>No payment providers configured for this domain</p>
                <button onClick={() => setShowAddProvider(true)} className="mt-2 text-accent hover:underline text-sm">
                  Add your first provider
                </button>
              </div>
            ) : (
              configs.map((config: PaymentConfig) => (
                <div key={config.id} className="flex items-center justify-between p-4 bg-surface-hover rounded-lg">
                  <div className="flex items-center gap-4">
                    {getProviderIcon(config.provider)}
                    <div>
                      <p className="text-sm font-medium text-text-primary capitalize">{config.provider}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {config.providerAccountId && (
                          <p className="text-xs text-text-muted font-mono">{config.providerAccountId}</p>
                        )}
                        {config.testMode && (
                          <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded text-xs">
                            Test Mode
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setTestConnection(config.id);
                        testConnectionMutation.mutate(config.id);
                      }}
                      disabled={testConnection === config.id}
                      className="text-xs text-accent hover:underline disabled:opacity-50"
                    >
                      {testConnection === config.id ? 'Testing...' : 'Test'}
                    </button>
                    <button
                      onClick={() => updateProviderMutation.mutate({ id: config.id, isActive: !config.isActive })}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        config.isActive
                          ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                          : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20'
                      }`}
                    >
                      {config.isActive ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete ${config.provider} configuration?`)) {
                          deleteProviderMutation.mutate(config.id);
                        }
                      }}
                      className="text-red-500 hover:text-red-600 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'transactions' && (
        <DataTable
          data={recentTransactions}
          columns={transactionColumns}
          keyExtractor={(row) => row.id}
          emptyMessage="No transactions yet"
        />
      )}

      {/* Add Provider Modal */}
      {showAddProvider && (
        <AddProviderModal
          metadata={metadata}
          selectedProvider={selectedProvider}
          onProviderChange={setSelectedProvider}
          onSubmit={(data) => createProviderMutation.mutate(data)}
          onClose={() => setShowAddProvider(false)}
          isSubmitting={createProviderMutation.isPending}
        />
      )}
    </div>
  );
}

interface AddProviderModalProps {
  metadata: { providers: ProviderMetadata[] } | undefined;
  selectedProvider: PaymentProvider;
  onProviderChange: (provider: PaymentProvider) => void;
  onSubmit: (data: any) => void;
  onClose: () => void;
  isSubmitting: boolean;
}

function AddProviderModal({
  metadata,
  selectedProvider,
  onProviderChange,
  onSubmit,
  onClose,
  isSubmitting,
}: AddProviderModalProps) {
  const [testMode, setTestMode] = useState(true);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [providerAccountId, setProviderAccountId] = useState('');

  const providerMeta = metadata?.providers.find((p) => p.provider === selectedProvider);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      provider: selectedProvider,
      credentials,
      testMode,
      providerAccountId: providerAccountId || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-text-primary">Add Payment Provider</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => onProviderChange(e.target.value as PaymentProvider)}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="stripe">Stripe</option>
              <option value="paypal">PayPal</option>
              <option value="authorizenet">Authorize.Net</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Provider Account ID (optional)
            </label>
            <input
              type="text"
              value={providerAccountId}
              onChange={(e) => setProviderAccountId(e.target.value)}
              placeholder="e.g., acct_1234567890"
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="testMode"
              checked={testMode}
              onChange={(e) => setTestMode(e.target.checked)}
              className="w-4 h-4 text-accent bg-surface border-border rounded focus:ring-accent"
            />
            <label htmlFor="testMode" className="text-sm text-text-primary">
              Test Mode
            </label>
          </div>

          <div className="border-t border-border pt-4 space-y-4">
            <h4 className="text-sm font-medium text-text-primary">Credentials</h4>
            {providerMeta && (
              <p className="text-sm text-text-muted">{providerMeta.description}</p>
            )}

            {providerMeta?.requiredFields?.map((fieldMeta) => (
              <div key={fieldMeta.field}>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  {fieldMeta.label} <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-text-muted mb-2">{fieldMeta.description}</p>
                <input
                  type="password"
                  required
                  value={credentials[fieldMeta.field] || ''}
                  onChange={(e) => setCredentials({ ...credentials, [fieldMeta.field]: e.target.value })}
                  placeholder={fieldMeta.placeholder}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent font-mono text-sm"
                />
              </div>
            ))}

            {providerMeta?.optionalFields && providerMeta.optionalFields.length > 0 && (
              <>
                <h5 className="text-xs text-text-muted uppercase tracking-wide mt-4">Optional</h5>
                {providerMeta.optionalFields.map((fieldMeta) => (
                  <div key={fieldMeta.field}>
                    <label className="block text-sm font-medium text-text-primary mb-1">
                      {fieldMeta.label}
                    </label>
                    <p className="text-xs text-text-muted mb-2">{fieldMeta.description}</p>
                    <input
                      type="password"
                      value={credentials[fieldMeta.field] || ''}
                      onChange={(e) => setCredentials({ ...credentials, [fieldMeta.field]: e.target.value })}
                      placeholder={fieldMeta.placeholder}
                      className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent font-mono text-sm"
                    />
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-surface-hover hover:bg-surface border border-border text-text-primary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function StripeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
    </svg>
  );
}

function PayPalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.076 21.337H2.47a.641.641 0 01-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 00-.607-.541c-.013.076-.026.175-.041.254-.59 3.025-2.566 6.082-8.558 6.082h-2.19c-1.187 0-2.196.865-2.378 2.037l-1.417 8.98a.64.64 0 00.633.74h3.584c.524 0 .968-.382 1.05-.9l.86-5.456a1.073 1.073 0 011.05-.901h.691c4.298 0 7.664-1.746 8.647-6.797.396-2.037-.024-3.592-1.324-4.498z" />
    </svg>
  );
}

function AuthorizeNetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
        strokeWidth="2"
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
