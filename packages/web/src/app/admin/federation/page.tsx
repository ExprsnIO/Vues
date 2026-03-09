'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

interface Relay {
  id: string;
  endpoint: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  cursor?: string;
  lastSync?: string;
  errorCount: number;
  lastError?: string;
  createdAt: string;
}

interface FederationStatus {
  relays: Relay[];
  summary: {
    totalRelays: number;
    activeRelays: number;
    totalEventsProcessed: number;
    consumerRunning: boolean;
  };
  recentActivity: Array<{
    type: string;
    timestamp: string;
    details?: string;
  }>;
}

export default function FederationAdminPage() {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRelayEndpoint, setNewRelayEndpoint] = useState('');

  const { data: status, isLoading, error, refetch } = useQuery<FederationStatus>({
    queryKey: ['federation-status'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.federationStatus`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch federation status');
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  const addRelayMutation = useMutation({
    mutationFn: async (endpoint: string) => {
      const res = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.addRelay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ endpoint }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add relay');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Relay added successfully');
      setShowAddModal(false);
      setNewRelayEndpoint('');
      queryClient.invalidateQueries({ queryKey: ['federation-status'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const removeRelayMutation = useMutation({
    mutationFn: async (relayId: string) => {
      const res = await fetch(`${API_BASE}/xrpc/io.exprsn.admin.removeRelay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ relayId }),
      });
      if (!res.ok) throw new Error('Failed to remove relay');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Relay removed');
      queryClient.invalidateQueries({ queryKey: ['federation-status'] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-500">
        Error loading federation status: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Federation</h1>
          <p className="text-gray-400 mt-1">
            Manage federated relay connections and sync status
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
          >
            Add Relay
          </button>
        </div>
      </div>

      {/* Consumer Status */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4">Consumer Status</h2>
        <div className="flex items-center gap-4">
          <div
            className={`w-3 h-3 rounded-full ${
              status?.summary?.consumerRunning ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-white">
            {status?.summary?.consumerRunning ? 'Running' : 'Stopped'}
          </span>
          <span className="text-gray-400">
            ({status?.summary?.activeRelays || 0} active relays)
          </span>
        </div>
        {!status?.summary?.consumerRunning && (
          <p className="text-yellow-400 text-sm mt-2">
            Set FEDERATION_CONSUMER_ENABLED=true to enable inbound federation
          </p>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Total Relays</p>
          <p className="text-2xl font-bold text-white mt-1">
            {status?.summary?.totalRelays?.toLocaleString() || 0}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Active Relays</p>
          <p className="text-2xl font-bold text-white mt-1">
            {status?.summary?.activeRelays?.toLocaleString() || 0}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <p className="text-gray-400 text-sm">Events Processed</p>
          <p className="text-2xl font-bold text-white mt-1">
            {status?.summary?.totalEventsProcessed?.toLocaleString() || 0}
          </p>
        </div>
      </div>

      {/* Connected Relays */}
      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Connected Relays</h2>
        </div>

        {!status?.relays || status.relays.length === 0 ? (
          <div className="p-6 text-center text-gray-400">
            No relays connected. Add a relay to enable federation.
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {status.relays.map((relay) => (
              <div key={relay.id} className="p-6 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        relay.status === 'healthy'
                          ? 'bg-green-500'
                          : relay.status === 'unhealthy'
                            ? 'bg-red-500'
                            : 'bg-yellow-500'
                      }`}
                    />
                    <span className="text-white font-medium">{relay.endpoint}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        relay.status === 'healthy'
                          ? 'bg-green-500/20 text-green-400'
                          : relay.status === 'unhealthy'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                      }`}
                    >
                      {relay.status}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-6 text-sm text-gray-400">
                    {relay.cursor && (
                      <span>
                        Cursor: <code className="text-gray-300">{relay.cursor.substring(0, 20)}...</code>
                      </span>
                    )}
                    {relay.lastSync && (
                      <span>
                        Last sync: {new Date(relay.lastSync).toLocaleString()}
                      </span>
                    )}
                    {relay.errorCount > 0 && (
                      <span className="text-red-400">
                        {relay.errorCount} errors
                      </span>
                    )}
                  </div>

                  {relay.lastError && (
                    <div className="mt-2 text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded">
                      {relay.lastError}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (confirm('Remove this relay?')) {
                      removeRelayMutation.mutate(relay.id);
                    }
                  }}
                  className="px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Relay Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setShowAddModal(false)}
          />
          <div className="relative bg-gray-900 rounded-2xl w-full max-w-md mx-4 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Add Relay</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Relay Endpoint URL
                </label>
                <input
                  type="url"
                  value={newRelayEndpoint}
                  onChange={(e) => setNewRelayEndpoint(e.target.value)}
                  placeholder="wss://relay.example.com"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter the WebSocket URL of the AT Protocol relay
                </p>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => addRelayMutation.mutate(newRelayEndpoint)}
                  disabled={!newRelayEndpoint || addRelayMutation.isPending}
                  className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {addRelayMutation.isPending ? 'Adding...' : 'Add Relay'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
