/**
 * Creator Monetization Settings
 * Allows creators to set up payment accounts and view earnings
 */

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/Sidebar';

type PaymentProvider = 'stripe' | 'paypal' | 'authorize_net';

interface PaymentConfig {
  id: string;
  provider: PaymentProvider;
  providerAccountId?: string;
  isActive: boolean;
  testMode: boolean;
  createdAt: string;
}

interface EarningsSummary {
  totalEarnings: number;
  pendingPayout: number;
  lastPayout?: {
    amount: number;
    date: string;
  };
  thisMonth: number;
  lastMonth: number;
}

interface Transaction {
  id: string;
  type: 'tip' | 'subscription' | 'purchase';
  amount: number;
  currency: string;
  status: 'completed' | 'pending' | 'failed';
  fromUser?: {
    handle: string;
    avatar?: string;
  };
  createdAt: string;
}

export default function MonetizationPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'setup' | 'history'>('overview');
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>('stripe');
  const [showSetupModal, setShowSetupModal] = useState(false);

  // Fetch payment config
  const { data: paymentConfig, isLoading: configLoading } = useQuery({
    queryKey: ['payment-config', user?.did],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/io.exprsn.payments.getConfig`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('session')}` },
      });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch config');
      }
      return res.json() as Promise<PaymentConfig>;
    },
    enabled: !!user,
  });

  // Fetch earnings summary
  const { data: earnings, isLoading: earningsLoading } = useQuery({
    queryKey: ['earnings', user?.did],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/io.exprsn.payments.getEarnings`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('session')}` },
      });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch earnings');
      }
      return res.json() as Promise<EarningsSummary>;
    },
    enabled: !!user && !!paymentConfig,
  });

  // Fetch transaction history
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', user?.did],
    queryFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/io.exprsn.payments.listTransactions?limit=20`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('session')}` },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.transactions as Transaction[];
    },
    enabled: !!user && !!paymentConfig,
  });

  // Create Stripe connect link
  const createConnectLink = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/io.exprsn.payments.createConnectLink`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('session')}`,
        },
        body: JSON.stringify({ provider: 'stripe' }),
      });
      if (!res.ok) throw new Error('Failed to create connect link');
      return res.json() as Promise<{ url: string }>;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  // Create payment config
  const createConfig = useMutation({
    mutationFn: async (provider: PaymentProvider) => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/io.exprsn.payments.createConfig`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('session')}`,
        },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error('Failed to create config');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-config'] });
      setShowSetupModal(false);
    },
  });

  // Request payout
  const requestPayout = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/io.exprsn.payments.requestPayout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('session')}`,
        },
      });
      if (!res.ok) throw new Error('Failed to request payout');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['earnings'] });
    },
  });

  const formatCurrency = (amount: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isLoading = configLoading || earningsLoading || transactionsLoading;

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-0 lg:ml-60 pt-14 lg:pt-0 pb-16 lg:pb-0">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text-primary">Monetization</h1>
            <p className="text-text-muted mt-1">
              Manage your creator earnings and payment settings
            </p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-surface p-1 rounded-lg w-fit">
            {(['overview', 'setup', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-accent text-white'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !paymentConfig ? (
            // Setup prompt
            <div className="bg-surface rounded-xl p-8 text-center">
              <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <MoneyIcon className="w-8 h-8 text-accent" />
              </div>
              <h2 className="text-xl font-semibold text-text-primary mb-2">
                Start Earning Money
              </h2>
              <p className="text-text-muted mb-6 max-w-md mx-auto">
                Connect your payment account to receive tips, enable subscriptions, and monetize your content.
              </p>
              <button
                onClick={() => setShowSetupModal(true)}
                className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors"
              >
                Set Up Monetization
              </button>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && earnings && (
                <div className="space-y-6">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-surface rounded-xl p-6">
                      <p className="text-text-muted text-sm mb-1">Total Earnings</p>
                      <p className="text-3xl font-bold text-text-primary">
                        {formatCurrency(earnings.totalEarnings)}
                      </p>
                    </div>
                    <div className="bg-surface rounded-xl p-6">
                      <p className="text-text-muted text-sm mb-1">Pending Payout</p>
                      <p className="text-3xl font-bold text-green-500">
                        {formatCurrency(earnings.pendingPayout)}
                      </p>
                      {earnings.pendingPayout >= 1000 && (
                        <button
                          onClick={() => requestPayout.mutate()}
                          disabled={requestPayout.isPending}
                          className="mt-2 text-sm text-accent hover:underline disabled:opacity-50"
                        >
                          {requestPayout.isPending ? 'Processing...' : 'Request Payout'}
                        </button>
                      )}
                    </div>
                    <div className="bg-surface rounded-xl p-6">
                      <p className="text-text-muted text-sm mb-1">This Month</p>
                      <p className="text-3xl font-bold text-text-primary">
                        {formatCurrency(earnings.thisMonth)}
                      </p>
                      <p className="text-xs text-text-muted mt-1">
                        vs {formatCurrency(earnings.lastMonth)} last month
                      </p>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  <div className="bg-surface rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-text-primary mb-4">
                      Recent Activity
                    </h3>
                    {transactions && transactions.length > 0 ? (
                      <div className="space-y-3">
                        {transactions.slice(0, 5).map((tx) => (
                          <div
                            key={tx.id}
                            className="flex items-center justify-between py-2 border-b border-border last:border-0"
                          >
                            <div className="flex items-center gap-3">
                              {tx.fromUser?.avatar ? (
                                <img
                                  src={tx.fromUser.avatar}
                                  alt=""
                                  className="w-8 h-8 rounded-full"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center">
                                  <UserIcon className="w-4 h-4 text-text-muted" />
                                </div>
                              )}
                              <div>
                                <p className="text-sm text-text-primary">
                                  {tx.type === 'tip' ? 'Tip' : tx.type === 'subscription' ? 'Subscription' : 'Purchase'}
                                  {tx.fromUser && (
                                    <span className="text-text-muted"> from @{tx.fromUser.handle}</span>
                                  )}
                                </p>
                                <p className="text-xs text-text-muted">{formatDate(tx.createdAt)}</p>
                              </div>
                            </div>
                            <p className="font-medium text-green-500">
                              +{formatCurrency(tx.amount, tx.currency)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center py-8 text-text-muted">
                        No transactions yet
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Setup Tab */}
              {activeTab === 'setup' && (
                <div className="space-y-6">
                  {/* Current Provider */}
                  <div className="bg-surface rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-text-primary mb-4">
                      Payment Provider
                    </h3>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center">
                          {paymentConfig.provider === 'stripe' && (
                            <svg viewBox="0 0 60 25" className="w-10">
                              <path fill="#6772e5" d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.02 1.04-.06 1.48zm-6.04-5.26c-1.04 0-1.72.8-1.87 2.08h3.8c-.06-1.3-.73-2.08-1.93-2.08zm-13.53 10.6V5.9H44l.22 1.36c.73-1.01 1.8-1.6 3.17-1.6 2.83 0 4.42 2.1 4.42 5.01v8.95h-3.93v-8.14c0-1.53-.63-2.39-1.85-2.39-1.25 0-2.04.92-2.04 2.5v7.03h-3.93zm-5.62 0V5.9h3.93v13.72h-3.93zm1.96-15.67c-1.33 0-2.42-1.08-2.42-2.4 0-1.32 1.1-2.39 2.42-2.39 1.32 0 2.43 1.07 2.43 2.4 0 1.31-1.1 2.39-2.43 2.39zM25.26 19.62V12.5c0-1.33-.56-1.92-1.63-1.92-1.1 0-1.86.7-1.86 1.97v7.07H17.8V12.5c0-1.33-.57-1.92-1.63-1.92-1.1 0-1.85.7-1.85 1.97v7.07h-3.96V5.9h3.96l.02 1.42c.73-1.08 1.77-1.68 3.22-1.68 1.45 0 2.6.6 3.2 1.82.93-1.21 2.14-1.82 3.7-1.82 2.58 0 4.2 1.56 4.2 4.65v9.33h-3.4zM5.9 19.62V.95H1.93v18.67H5.9z"/>
                            </svg>
                          )}
                          {paymentConfig.provider === 'paypal' && (
                            <svg viewBox="0 0 24 24" className="w-8 h-8">
                              <path fill="#00457C" d="M20.067 8.478c.492.88.556 2.014.3 3.327-.74 3.806-3.276 5.12-6.514 5.12h-.5a.805.805 0 0 0-.794.68l-.04.22-.63 4.073-.024.156a.805.805 0 0 1-.794.679H8.086l.008-.04.187-1.177.197-1.244.235-1.485.005-.031h.063c3.74 0 6.673-1.524 7.529-5.933.31-1.601.144-2.937-.433-3.945z"/>
                              <path fill="#0079BE" d="M6.687 6.2c.222-1.413 1.253-1.93 2.42-1.93h4.93c.568 0 1.093.04 1.567.14.473.097.907.254 1.293.478.253.147.478.324.675.532.62-.4.025-2.632-.025-2.851C17.065.927 15.156 0 12.28 0H5.867c-.58 0-1.085.423-1.17 1.013L1.868 18.9c-.052.333.195.632.537.632h3.7l1.032-6.535.55-3.485.545-3.484z"/>
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-text-primary capitalize">
                            {paymentConfig.provider}
                          </p>
                          <p className="text-sm text-text-muted">
                            {paymentConfig.isActive ? (
                              <span className="text-green-500">Active</span>
                            ) : (
                              <span className="text-yellow-500">Setup Required</span>
                            )}
                            {paymentConfig.testMode && (
                              <span className="ml-2 text-yellow-500">(Test Mode)</span>
                            )}
                          </p>
                        </div>
                      </div>
                      {!paymentConfig.isActive && paymentConfig.provider === 'stripe' && (
                        <button
                          onClick={() => createConnectLink.mutate()}
                          disabled={createConnectLink.isPending}
                          className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                        >
                          {createConnectLink.isPending ? 'Loading...' : 'Complete Setup'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Monetization Options */}
                  <div className="bg-surface rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-text-primary mb-4">
                      Monetization Options
                    </h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between p-4 bg-background rounded-lg cursor-pointer">
                        <div>
                          <p className="font-medium text-text-primary">Tips</p>
                          <p className="text-sm text-text-muted">
                            Allow viewers to send you tips on your content
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          defaultChecked
                          className="w-5 h-5 accent-accent"
                        />
                      </label>
                      <label className="flex items-center justify-between p-4 bg-background rounded-lg cursor-pointer">
                        <div>
                          <p className="font-medium text-text-primary">Subscriptions</p>
                          <p className="text-sm text-text-muted">
                            Offer exclusive content to subscribers
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          defaultChecked
                          className="w-5 h-5 accent-accent"
                        />
                      </label>
                      <label className="flex items-center justify-between p-4 bg-background rounded-lg cursor-pointer">
                        <div>
                          <p className="font-medium text-text-primary">Paid Content</p>
                          <p className="text-sm text-text-muted">
                            Sell individual videos or content packs
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          className="w-5 h-5 accent-accent"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Payout Settings */}
                  <div className="bg-surface rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-text-primary mb-4">
                      Payout Settings
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-text-muted mb-1">
                          Minimum Payout Amount
                        </label>
                        <select className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary">
                          <option>$10.00</option>
                          <option>$25.00</option>
                          <option>$50.00</option>
                          <option>$100.00</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-text-muted mb-1">
                          Payout Schedule
                        </label>
                        <select className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary">
                          <option>Weekly</option>
                          <option>Bi-weekly</option>
                          <option>Monthly</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* History Tab */}
              {activeTab === 'history' && (
                <div className="bg-surface rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-background-alt">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">
                          Date
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">
                          From
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-text-muted">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-text-muted">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {transactions && transactions.length > 0 ? (
                        transactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-surface-hover">
                            <td className="px-4 py-3 text-sm text-text-primary">
                              {formatDate(tx.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-sm text-text-primary capitalize">
                              {tx.type}
                            </td>
                            <td className="px-4 py-3 text-sm text-text-muted">
                              {tx.fromUser ? `@${tx.fromUser.handle}` : '-'}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`px-2 py-1 text-xs rounded-full ${
                                  tx.status === 'completed'
                                    ? 'bg-green-500/20 text-green-500'
                                    : tx.status === 'pending'
                                    ? 'bg-yellow-500/20 text-yellow-500'
                                    : 'bg-red-500/20 text-red-500'
                                }`}
                              >
                                {tx.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-green-500">
                              +{formatCurrency(tx.amount, tx.currency)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-text-muted">
                            No transactions found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Setup Modal */}
        {showSetupModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-surface rounded-xl p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-semibold text-text-primary mb-4">
                Choose Payment Provider
              </h2>
              <div className="space-y-3">
                <label
                  className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedProvider === 'stripe'
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-border-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value="stripe"
                    checked={selectedProvider === 'stripe'}
                    onChange={() => setSelectedProvider('stripe')}
                    className="sr-only"
                  />
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                    <svg viewBox="0 0 60 25" className="w-8">
                      <path fill="#6772e5" d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.02 1.04-.06 1.48zm-6.04-5.26c-1.04 0-1.72.8-1.87 2.08h3.8c-.06-1.3-.73-2.08-1.93-2.08z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">Stripe</p>
                    <p className="text-sm text-text-muted">
                      Fast payouts, low fees (2.9% + $0.30)
                    </p>
                  </div>
                </label>
                <label
                  className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedProvider === 'paypal'
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-border-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="provider"
                    value="paypal"
                    checked={selectedProvider === 'paypal'}
                    onChange={() => setSelectedProvider('paypal')}
                    className="sr-only"
                  />
                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-6 h-6">
                      <path fill="#00457C" d="M20.067 8.478c.492.88.556 2.014.3 3.327-.74 3.806-3.276 5.12-6.514 5.12h-.5a.805.805 0 0 0-.794.68l-.04.22-.63 4.073-.024.156a.805.805 0 0 1-.794.679H8.086l.008-.04.187-1.177z"/>
                      <path fill="#0079BE" d="M6.687 6.2c.222-1.413 1.253-1.93 2.42-1.93h4.93c.568 0 1.093.04 1.567.14.473.097.907.254 1.293.478z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">PayPal</p>
                    <p className="text-sm text-text-muted">
                      Trusted worldwide (2.9% + $0.30)
                    </p>
                  </div>
                </label>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowSetupModal(false)}
                  className="flex-1 px-4 py-2 text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createConfig.mutate(selectedProvider)}
                  disabled={createConfig.isPending}
                  className="flex-1 px-4 py-2 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {createConfig.isPending ? 'Setting up...' : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Icons
function MoneyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}
