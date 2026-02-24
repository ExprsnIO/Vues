'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCount } from '@/lib/utils';
import { ExportButton } from '@/components/admin/ExportModal';

type TransactionStatus = 'all' | 'completed' | 'pending' | 'failed' | 'refunded';
type PaymentProvider = 'all' | 'stripe' | 'paypal' | 'authorizenet';

interface Transaction {
  id: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  fromDid: string;
  toDid: string;
  provider: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface PaymentConfig {
  id: string;
  organizationId?: string;
  userDid?: string;
  provider: string;
  testMode: boolean;
  isActive: boolean;
  createdAt: string;
}

export default function PaymentsAdmin() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TransactionStatus>('all');
  const [providerFilter, setProviderFilter] = useState<PaymentProvider>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  // Fetch payment stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'payments', 'stats'],
    queryFn: async () => {
      // This would call a real API endpoint
      return {
        totalVolume: 125000,
        totalTransactions: 1250,
        pendingPayouts: 15000,
        activeConfigs: 45,
        providerBreakdown: {
          stripe: { volume: 75000, count: 800 },
          paypal: { volume: 35000, count: 350 },
          authorizenet: { volume: 15000, count: 100 },
        },
      };
    },
  });

  // Fetch transactions
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['admin', 'payments', 'transactions', statusFilter, providerFilter],
    queryFn: async () => {
      // This would call a real API endpoint
      const mockTransactions: Transaction[] = [
        {
          id: 'txn_001',
          type: 'tip',
          status: 'completed',
          amount: 500,
          currency: 'usd',
          fromDid: 'did:web:user1.exprsn.io',
          toDid: 'did:web:creator1.exprsn.io',
          provider: 'stripe',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'txn_002',
          type: 'subscription',
          status: 'pending',
          amount: 999,
          currency: 'usd',
          fromDid: 'did:web:user2.exprsn.io',
          toDid: 'did:web:creator2.exprsn.io',
          provider: 'paypal',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: 'txn_003',
          type: 'purchase',
          status: 'failed',
          amount: 1999,
          currency: 'usd',
          fromDid: 'did:web:user3.exprsn.io',
          toDid: 'did:web:store.exprsn.io',
          provider: 'authorizenet',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
        },
      ];
      return mockTransactions;
    },
  });

  // Fetch payment configs
  const { data: configs, isLoading: configsLoading } = useQuery({
    queryKey: ['admin', 'payments', 'configs'],
    queryFn: async () => {
      const mockConfigs: PaymentConfig[] = [
        {
          id: 'cfg_001',
          organizationId: 'org_123',
          provider: 'stripe',
          testMode: false,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'cfg_002',
          userDid: 'did:web:creator1.exprsn.io',
          provider: 'paypal',
          testMode: true,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ];
      return mockConfigs;
    },
  });

  // Refund mutation
  const refundMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      // This would call api.refundTransaction(transactionId)
      await new Promise((resolve) => setTimeout(resolve, 1000));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] });
      setSelectedTransaction(null);
    },
  });

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-500/10 text-green-500',
      pending: 'bg-yellow-500/10 text-yellow-500',
      failed: 'bg-red-500/10 text-red-500',
      refunded: 'bg-gray-500/10 text-gray-500',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {status}
      </span>
    );
  };

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

  if (statsLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-surface rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">Payment Management</h1>
        <ExportButton
          exportType="payments"
          filters={{
            status: statusFilter !== 'all' ? statusFilter : undefined,
            type: providerFilter !== 'all' ? providerFilter : undefined,
          }}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          label="Total Volume"
          value={formatCurrency(stats?.totalVolume || 0, 'usd')}
          icon={DollarIcon}
          trend="+12.5%"
        />
        <StatCard
          label="Transactions"
          value={formatCount(stats?.totalTransactions || 0)}
          icon={TransactionIcon}
          trend="+8.2%"
        />
        <StatCard
          label="Pending Payouts"
          value={formatCurrency(stats?.pendingPayouts || 0, 'usd')}
          icon={ClockIcon}
          highlight
        />
        <StatCard
          label="Active Configs"
          value={(stats?.activeConfigs || 0).toString()}
          icon={ConfigIcon}
        />
      </div>

      {/* Provider Breakdown */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Provider Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(stats?.providerBreakdown || {}).map(([provider, data]) => (
            <div key={provider} className="flex items-center gap-4 p-4 bg-surface-hover rounded-lg">
              {getProviderIcon(provider)}
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary capitalize">{provider}</p>
                <p className="text-xs text-text-muted">
                  {formatCurrency(data.volume, 'usd')} • {data.count} txns
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <input
          type="text"
          placeholder="Search transactions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TransactionStatus)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <select
          value={providerFilter}
          onChange={(e) => setProviderFilter(e.target.value as PaymentProvider)}
          className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
        >
          <option value="all">All Providers</option>
          <option value="stripe">Stripe</option>
          <option value="paypal">PayPal</option>
          <option value="authorizenet">Authorize.Net</option>
        </select>
      </div>

      {/* Transactions Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Recent Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-hover">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions?.map((txn) => (
                <tr key={txn.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3 text-sm font-mono text-text-primary">{txn.id}</td>
                  <td className="px-4 py-3 text-sm text-text-primary capitalize">{txn.type}</td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {formatCurrency(txn.amount, txn.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getProviderIcon(txn.provider)}
                      <span className="text-sm text-text-primary capitalize">{txn.provider}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(txn.status)}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {new Date(txn.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedTransaction(txn)}
                      className="text-accent hover:underline text-sm"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Configs */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Payment Configurations</h2>
          <button className="text-sm text-accent hover:underline">View All</button>
        </div>
        <div className="space-y-3">
          {configs?.map((config) => (
            <div key={config.id} className="flex items-center justify-between p-4 bg-surface-hover rounded-lg">
              <div className="flex items-center gap-4">
                {getProviderIcon(config.provider)}
                <div>
                  <p className="text-sm font-medium text-text-primary capitalize">{config.provider}</p>
                  <p className="text-xs text-text-muted">
                    {config.organizationId ? `Org: ${config.organizationId}` : `User: ${config.userDid}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {config.testMode && (
                  <span className="px-2 py-1 bg-yellow-500/10 text-yellow-500 rounded-full text-xs">Test Mode</span>
                )}
                <span className={`px-2 py-1 rounded-full text-xs ${config.isActive ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'}`}>
                  {config.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Transaction Details</h3>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="text-text-muted hover:text-text-primary"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-text-muted">Transaction ID</p>
                <p className="text-sm font-mono text-text-primary">{selectedTransaction.id}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Amount</p>
                  <p className="text-sm font-medium text-text-primary">
                    {formatCurrency(selectedTransaction.amount, selectedTransaction.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Status</p>
                  {getStatusBadge(selectedTransaction.status)}
                </div>
              </div>
              <div>
                <p className="text-xs text-text-muted">From</p>
                <p className="text-sm text-text-primary truncate">{selectedTransaction.fromDid}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">To</p>
                <p className="text-sm text-text-primary truncate">{selectedTransaction.toDid}</p>
              </div>
              {selectedTransaction.status === 'completed' && (
                <button
                  onClick={() => refundMutation.mutate(selectedTransaction.id)}
                  disabled={refundMutation.isPending}
                  className="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {refundMutation.isPending ? 'Processing...' : 'Issue Refund'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: React.FC<{ className?: string }>;
  trend?: string;
  highlight?: boolean;
}

function StatCard({ label, value, icon: Icon, trend, highlight }: StatCardProps) {
  return (
    <div className={`bg-surface border rounded-xl p-6 ${highlight ? 'border-accent' : 'border-border'}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-muted mb-1">{label}</p>
          <p className={`text-2xl font-bold ${highlight ? 'text-accent' : 'text-text-primary'}`}>{value}</p>
          {trend && <p className="text-xs text-green-500 mt-1">{trend} from last month</p>}
        </div>
        <div className={`p-3 rounded-lg ${highlight ? 'bg-accent/10' : 'bg-surface-hover'}`}>
          <Icon className={`w-6 h-6 ${highlight ? 'text-accent' : 'text-text-muted'}`} />
        </div>
      </div>
    </div>
  );
}

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function TransactionIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ConfigIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
