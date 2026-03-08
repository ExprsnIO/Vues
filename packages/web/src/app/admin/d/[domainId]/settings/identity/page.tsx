// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

type DidMethod = 'plc' | 'web' | 'exprn';
type PlcMode = 'standalone' | 'external';

interface PlcConfigState {
  enabled: boolean;
  mode: PlcMode;
  didMethod: DidMethod;
  selfHostedPlc: {
    enabled: boolean;
    url: string;
    rotationKey: string;
    adminKey: string;
  };
  externalPlcUrl: string;
  allowCustomHandles: boolean;
  requireInviteCode: boolean;
  defaultPdsEndpoint: string;
  handleSuffix: string;
}

export default function DomainIdentityPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const { data: identitiesData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'identities'],
    queryFn: () => api.adminDomainIdentitiesList(domainId),
    enabled: !!domainId,
  });

  const { data: reservationsData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'handle-reservations'],
    queryFn: () => api.adminDomainHandlesReservationsList(domainId),
    enabled: !!domainId,
  });

  const domain = data?.domain;
  const plcConfig = domain?.plcConfig || {};
  const identities = identitiesData?.identities || [];
  const reservations = reservationsData?.reservations || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Determine display values
  const didMethodDisplay = plcConfig.didMethod || 'plc';
  const plcModeDisplay = plcConfig.selfHostedPlc?.enabled
    ? 'Self-Hosted'
    : plcConfig.mode === 'external'
      ? 'External'
      : 'Standalone';
  const plcServerUrl = plcConfig.selfHostedPlc?.enabled
    ? plcConfig.selfHostedPlc.url
    : plcConfig.externalPlcUrl || 'https://plc.directory';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Identity (PLC)</h1>
        <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
      </div>

      {/* PLC Configuration */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">PLC Directory Configuration</h2>
          <button
            onClick={() => setShowConfigModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse text-sm rounded-lg"
          >
            Configure
          </button>
        </div>
        <dl className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <dt className="text-text-muted text-sm">DID Method</dt>
            <dd className="text-text-primary font-medium">
              <span className="inline-flex items-center gap-2">
                <span className="px-2 py-0.5 bg-accent/20 text-accent text-xs rounded font-mono">
                  did:{didMethodDisplay}
                </span>
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted text-sm">PLC Mode</dt>
            <dd className="text-text-primary font-medium">
              <span className={`inline-flex items-center gap-1 ${
                plcConfig.selfHostedPlc?.enabled ? 'text-success' : ''
              }`}>
                {plcConfig.selfHostedPlc?.enabled && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                )}
                {plcModeDisplay}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted text-sm">Handle Suffix</dt>
            <dd className="text-text-primary font-medium">@*.{plcConfig.handleSuffix || domain?.handleSuffix || domain?.domain}</dd>
          </div>
          <div>
            <dt className="text-text-muted text-sm">Identity Count</dt>
            <dd className="text-text-primary font-medium">{domain?.identityCount || 0}</dd>
          </div>
          <div>
            <dt className="text-text-muted text-sm">PLC Server</dt>
            <dd className="text-text-primary font-mono text-sm truncate" title={plcServerUrl}>
              {plcServerUrl}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted text-sm">Service Endpoint</dt>
            <dd className="text-text-primary font-mono text-sm truncate" title={plcConfig.defaultPdsEndpoint || `https://${domain?.domain}`}>
              {plcConfig.defaultPdsEndpoint || `https://${domain?.domain}`}
            </dd>
          </div>
        </dl>

        {/* Status indicators */}
        <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            plcConfig.enabled !== false ? 'bg-success/20 text-success' : 'bg-text-muted/20 text-text-muted'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${plcConfig.enabled !== false ? 'bg-success' : 'bg-text-muted'}`} />
            PLC {plcConfig.enabled !== false ? 'Enabled' : 'Disabled'}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            plcConfig.allowCustomHandles ? 'bg-accent/20 text-accent' : 'bg-text-muted/20 text-text-muted'
          }`}>
            Custom Handles {plcConfig.allowCustomHandles ? 'Allowed' : 'Disabled'}
          </span>
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            plcConfig.requireInviteCode ? 'bg-warning/20 text-warning' : 'bg-text-muted/20 text-text-muted'
          }`}>
            Invite Code {plcConfig.requireInviteCode ? 'Required' : 'Not Required'}
          </span>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Identities</h2>
          <span className="text-sm text-text-muted">{identities.length} identities</span>
        </div>
        {identities.length === 0 ? (
          <p className="text-text-muted text-sm">No identities have been provisioned for this domain yet.</p>
        ) : (
          <div className="space-y-3">
            {identities.map((identity) => (
              <div key={identity.did} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
                <div>
                  <p className="text-text-primary font-medium">{identity.handle}</p>
                  <p className="text-text-muted text-xs font-mono">{identity.did}</p>
                </div>
                <div className="text-right">
                  <p className="text-text-primary text-sm capitalize">{identity.status}</p>
                  <p className="text-text-muted text-xs">{new Date(identity.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-surface border border-border rounded-lg p-6 text-left hover:border-accent transition-colors"
        >
          <h3 className="text-lg font-semibold text-text-primary">Create Identity</h3>
          <p className="text-text-muted text-sm mt-1">Create a new DID for this domain</p>
        </button>
        <button
          onClick={() => setShowReserveModal(true)}
          className="bg-surface border border-border rounded-lg p-6 text-left hover:border-accent transition-colors"
        >
          <h3 className="text-lg font-semibold text-text-primary">Reserve Handle</h3>
          <p className="text-text-muted text-sm mt-1">Reserve a handle for future use</p>
        </button>
      </div>

      {/* Reserved Handles */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Reserved Handles</h2>
        {reservations.length === 0 ? (
          <p className="text-text-muted text-sm">No handles reserved yet.</p>
        ) : (
          <div className="space-y-3">
            {reservations.map((reservation) => (
              <div key={reservation.id} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
                <div>
                  <p className="text-text-primary font-medium">{reservation.handle}</p>
                  <p className="text-text-muted text-xs capitalize">{reservation.handleType}</p>
                </div>
                <div className="text-right text-xs text-text-muted">
                  <p>Reserved {new Date(reservation.createdAt).toLocaleDateString()}</p>
                  {reservation.expiresAt && <p>Expires {new Date(reservation.expiresAt).toLocaleDateString()}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateIdentityModal domainId={domainId} domain={domain?.domain} onClose={() => setShowCreateModal(false)} />
      )}

      {showReserveModal && (
        <ReserveHandleModal domainId={domainId} domain={domain?.domain} onClose={() => setShowReserveModal(false)} />
      )}

      {showConfigModal && (
        <PlcConfigModal
          domainId={domainId}
          currentConfig={plcConfig}
          domain={domain?.domain}
          onClose={() => setShowConfigModal(false)}
        />
      )}
    </div>
  );
}

function CreateIdentityModal({ domainId, domain, onClose }: { domainId: string; domain?: string; onClose: () => void }) {
  const [handle, setHandle] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: { domainId: string; handle: string }) =>
      api.adminDomainIdentityCreate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'identities'] });
      toast.success('Identity created');
      onClose();
    },
    onError: () => toast.error('Failed to create identity'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Create Identity</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Handle</label>
            <div className="flex">
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="username"
                className="flex-1 px-4 py-2 bg-surface border border-border rounded-l-lg text-text-primary"
              />
              <span className="px-4 py-2 bg-surface-hover border border-l-0 border-border rounded-r-lg text-text-muted">
                .{domain}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => createMutation.mutate({ domainId, handle })}
            disabled={!handle || createMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReserveHandleModal({ domainId, domain, onClose }: { domainId: string; domain?: string; onClose: () => void }) {
  const [handle, setHandle] = useState('');
  const queryClient = useQueryClient();

  const reserveMutation = useMutation({
    mutationFn: (data: { domainId: string; handle: string }) =>
      api.adminDomainHandleReserve({ ...data, handleType: 'user' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'handle-reservations'] });
      toast.success('Handle reserved');
      onClose();
    },
    onError: () => toast.error('Failed to reserve handle'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-text-primary mb-4">Reserve Handle</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Handle to Reserve</label>
            <div className="flex">
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="username"
                className="flex-1 px-4 py-2 bg-surface border border-border rounded-l-lg text-text-primary"
              />
              <span className="px-4 py-2 bg-surface-hover border border-l-0 border-border rounded-r-lg text-text-muted">
                .{domain}
              </span>
            </div>
          </div>
          <p className="text-text-muted text-sm">
            Reserved handles cannot be claimed by regular users until released.
          </p>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg">
            Cancel
          </button>
          <button
            onClick={() => reserveMutation.mutate({ domainId, handle })}
            disabled={!handle || reserveMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {reserveMutation.isPending ? 'Reserving...' : 'Reserve'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlcConfigModal({
  domainId,
  currentConfig,
  domain,
  onClose,
}: {
  domainId: string;
  currentConfig: any;
  domain?: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [config, setConfig] = useState<PlcConfigState>({
    enabled: currentConfig.enabled !== false,
    mode: currentConfig.mode || 'standalone',
    didMethod: currentConfig.didMethod || 'plc',
    selfHostedPlc: {
      enabled: currentConfig.selfHostedPlc?.enabled || false,
      url: currentConfig.selfHostedPlc?.url || '',
      rotationKey: currentConfig.selfHostedPlc?.rotationKey || '',
      adminKey: currentConfig.selfHostedPlc?.adminKey || '',
    },
    externalPlcUrl: currentConfig.externalPlcUrl || 'https://plc.directory',
    allowCustomHandles: currentConfig.allowCustomHandles || false,
    requireInviteCode: currentConfig.requireInviteCode || false,
    defaultPdsEndpoint: currentConfig.defaultPdsEndpoint || `https://${domain}`,
    handleSuffix: currentConfig.handleSuffix || domain || 'exprsn',
  });

  const updateMutation = useMutation({
    mutationFn: (plcConfig: PlcConfigState) =>
      api.adminDomainsUpdate({ id: domainId, plcConfig }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('PLC configuration saved');
      onClose();
    },
    onError: () => toast.error('Failed to save configuration'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl p-6 w-full max-w-2xl my-8">
        <h2 className="text-xl font-bold text-text-primary mb-6">PLC Directory Configuration</h2>

        <div className="space-y-6">
          {/* Enable/Disable PLC */}
          <div className="flex items-center justify-between p-4 bg-surface-hover rounded-lg">
            <div>
              <p className="text-text-primary font-medium">Enable PLC</p>
              <p className="text-text-muted text-sm">Use PLC directory for identity management</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-border peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
            </label>
          </div>

          {/* DID Method Selection */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              DID Method
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'plc', label: 'did:plc', desc: 'Standard AT Protocol' },
                { value: 'web', label: 'did:web', desc: 'Legacy Web-based' },
                { value: 'exprn', label: 'did:exprn', desc: 'Exprsn Native (Future)' },
              ].map((method) => (
                <button
                  key={method.value}
                  onClick={() => setConfig({ ...config, didMethod: method.value as DidMethod })}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    config.didMethod === method.value
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50'
                  }`}
                >
                  <p className="font-mono text-sm text-text-primary">{method.label}</p>
                  <p className="text-xs text-text-muted mt-0.5">{method.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* PLC Mode */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              PLC Mode
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setConfig({
                  ...config,
                  mode: 'standalone',
                  selfHostedPlc: { ...config.selfHostedPlc, enabled: false },
                })}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  config.mode === 'standalone' && !config.selfHostedPlc.enabled
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <p className="font-medium text-text-primary">Standalone</p>
                <p className="text-sm text-text-muted mt-1">Use built-in PLC implementation</p>
              </button>
              <button
                onClick={() => setConfig({
                  ...config,
                  mode: 'external',
                  selfHostedPlc: { ...config.selfHostedPlc, enabled: false },
                })}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  config.mode === 'external' && !config.selfHostedPlc.enabled
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                <p className="font-medium text-text-primary">External</p>
                <p className="text-sm text-text-muted mt-1">Connect to external PLC (e.g., plc.directory)</p>
              </button>
            </div>
          </div>

          {/* Self-Hosted PLC */}
          <div className="p-4 bg-surface-hover rounded-lg border border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-text-primary font-medium flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                  </svg>
                  Self-Hosted PLC Server
                </p>
                <p className="text-text-muted text-sm">Run your own PLC directory for full control</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.selfHostedPlc.enabled}
                  onChange={(e) => setConfig({
                    ...config,
                    selfHostedPlc: { ...config.selfHostedPlc, enabled: e.target.checked },
                  })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-border peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
              </label>
            </div>

            {config.selfHostedPlc.enabled && (
              <div className="space-y-4 pt-4 border-t border-border">
                <div>
                  <label className="block text-sm text-text-muted mb-1">PLC Server URL</label>
                  <input
                    type="url"
                    value={config.selfHostedPlc.url}
                    onChange={(e) => setConfig({
                      ...config,
                      selfHostedPlc: { ...config.selfHostedPlc, url: e.target.value },
                    })}
                    placeholder="https://plc.yourdomain.com"
                    className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1">Rotation Key (Multibase)</label>
                  <input
                    type="text"
                    value={config.selfHostedPlc.rotationKey}
                    onChange={(e) => setConfig({
                      ...config,
                      selfHostedPlc: { ...config.selfHostedPlc, rotationKey: e.target.value },
                    })}
                    placeholder="did:key:z6Mk..."
                    className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary font-mono text-sm"
                  />
                  <p className="text-xs text-text-muted mt-1">Server's rotation key for signing PLC operations</p>
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1">Admin Key (Optional)</label>
                  <input
                    type="password"
                    value={config.selfHostedPlc.adminKey}
                    onChange={(e) => setConfig({
                      ...config,
                      selfHostedPlc: { ...config.selfHostedPlc, adminKey: e.target.value },
                    })}
                    placeholder="Admin API key"
                    className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* External PLC URL (when mode is external and not self-hosted) */}
          {config.mode === 'external' && !config.selfHostedPlc.enabled && (
            <div>
              <label className="block text-sm text-text-muted mb-1">External PLC Directory URL</label>
              <input
                type="url"
                value={config.externalPlcUrl}
                onChange={(e) => setConfig({ ...config, externalPlcUrl: e.target.value })}
                placeholder="https://plc.directory"
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
              />
            </div>
          )}

          {/* Handle Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-text-muted mb-1">Handle Suffix</label>
              <input
                type="text"
                value={config.handleSuffix}
                onChange={(e) => setConfig({ ...config, handleSuffix: e.target.value })}
                placeholder="exprsn"
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
              />
              <p className="text-xs text-text-muted mt-1">Users will get @username.{config.handleSuffix || 'suffix'}</p>
            </div>
            <div>
              <label className="block text-sm text-text-muted mb-1">Default PDS Endpoint</label>
              <input
                type="url"
                value={config.defaultPdsEndpoint}
                onChange={(e) => setConfig({ ...config, defaultPdsEndpoint: e.target.value })}
                placeholder="https://pds.yourdomain.com"
                className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
              />
            </div>
          </div>

          {/* Additional Settings */}
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 bg-surface-hover rounded-lg cursor-pointer">
              <div>
                <p className="text-text-primary font-medium">Allow Custom Handles</p>
                <p className="text-text-muted text-sm">Users can bring their own domain handles</p>
              </div>
              <input
                type="checkbox"
                checked={config.allowCustomHandles}
                onChange={(e) => setConfig({ ...config, allowCustomHandles: e.target.checked })}
                className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
              />
            </label>
            <label className="flex items-center justify-between p-3 bg-surface-hover rounded-lg cursor-pointer">
              <div>
                <p className="text-text-primary font-medium">Require Invite Code</p>
                <p className="text-text-muted text-sm">New users need an invite code to register</p>
              </div>
              <input
                type="checkbox"
                checked={config.requireInviteCode}
                onChange={(e) => setConfig({ ...config, requireInviteCode: e.target.checked })}
                className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
              />
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-8 pt-6 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => updateMutation.mutate(config)}
            disabled={updateMutation.isPending}
            className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}
