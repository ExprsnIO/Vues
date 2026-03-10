'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DataTable } from '@/components/admin/ui/DataTable';

interface OAuthProvider {
  id: string;
  domainId: string;
  providerKey: string;
  displayName: string;
  description?: string;
  type: string;
  clientId: string;
  clientSecret?: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint?: string;
  jwksUri?: string;
  issuer?: string;
  scopes: string[];
  claimMapping: Record<string, string>;
  iconUrl?: string;
  buttonColor?: string;
  buttonText?: string;
  enabled: boolean;
  priority: number;
  autoProvisionUsers: boolean;
  defaultRole: string;
  requiredEmailDomain?: string;
  allowedEmailDomains?: string[];
  requirePkce: boolean;
  totalLogins: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_ICONS: Record<string, string> = {
  google: '🔵',
  github: '⚫',
  apple: '🍎',
  microsoft: '🟦',
  twitter: '🐦',
  discord: '🎮',
  oidc: '🔐',
  custom: '⚙️',
};

const PROVIDER_TEMPLATES: Record<string, Partial<OAuthProvider>> = {
  google: {
    type: 'oidc',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userinfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    issuer: 'https://accounts.google.com',
    scopes: ['openid', 'profile', 'email'],
    buttonColor: '#4285f4',
  },
  github: {
    type: 'oauth2',
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userinfoEndpoint: 'https://api.github.com/user',
    scopes: ['read:user', 'user:email'],
    buttonColor: '#24292e',
  },
  microsoft: {
    type: 'oidc',
    authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userinfoEndpoint: 'https://graph.microsoft.com/v1.0/me',
    jwksUri: 'https://login.microsoftonline.com/common/discovery/v2.0/keys',
    issuer: 'https://login.microsoftonline.com/common/v2.0',
    scopes: ['openid', 'profile', 'email'],
    buttonColor: '#00a4ef',
  },
};

export default function DomainOAuthPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<OAuthProvider | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const queryClient = useQueryClient();

  const { data: providersData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'oauth-providers'],
    queryFn: async () => api.adminDomainOAuthList(domainId),
  });

  const providers = providersData?.providers || [];

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return api.adminDomainOAuthToggle(id, enabled);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'oauth-providers'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (providerId: string) => {
      return api.adminDomainOAuthDelete(providerId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'oauth-providers'] });
    },
  });

  const handleEdit = async (provider: OAuthProvider) => {
    const fullProvider = await api.adminDomainOAuthGet(provider.id);
    setSelectedProvider(fullProvider.provider as OAuthProvider);
    setShowEditModal(true);
  };

  const handleDelete = async (providerId: string) => {
    if (confirm('Are you sure you want to delete this OAuth provider?')) {
      deleteMutation.mutate(providerId);
    }
  };

  const handleQuickAdd = (providerType: string) => {
    setSelectedTemplate(providerType);
    setShowAddModal(true);
  };

  const columns = [
    {
      key: 'provider',
      header: 'Provider',
      render: (provider: OAuthProvider) => (
        <div className="flex items-center gap-3">
          <span className="text-2xl">{PROVIDER_ICONS[provider.providerKey] || PROVIDER_ICONS.custom}</span>
          <div>
            <div className="font-medium text-text-primary">{provider.displayName}</div>
            <div className="text-sm text-text-muted">{provider.clientId}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'enabled',
      header: 'Status',
      render: (provider: OAuthProvider) => (
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={provider.enabled}
            onChange={() =>
              toggleMutation.mutate({ id: provider.id, enabled: !provider.enabled })
            }
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
        </label>
      ),
    },
    {
      key: 'totalLogins',
      header: 'Logins',
      render: (provider: OAuthProvider) => (
        <span className="text-text-secondary">{provider.totalLogins}</span>
      ),
    },
    {
      key: 'lastUsedAt',
      header: 'Last Login',
      render: (provider: OAuthProvider) => (
        <span className="text-text-muted text-sm">
          {provider.lastUsedAt ? new Date(provider.lastUsedAt).toLocaleDateString() : 'Never'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (provider: OAuthProvider) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleEdit(provider)}
            className="px-3 py-1 text-sm text-accent hover:text-accent-hover"
          >
            Configure
          </button>
          <button
            onClick={() => handleDelete(provider.id)}
            className="px-3 py-1 text-sm text-red-500 hover:text-red-400"
          >
            Remove
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">OAuth Providers</h1>
          <p className="text-text-muted mt-1">
            Configure OAuth authentication providers for this domain
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
        >
          Add Provider
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Providers</p>
          <p className="text-2xl font-bold text-text-primary">{providers.length}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Enabled</p>
          <p className="text-2xl font-bold text-green-500">
            {providers.filter((p) => p.enabled).length}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Total Logins</p>
          <p className="text-2xl font-bold text-text-primary">
            {providers.reduce((sum, p) => sum + p.totalLogins, 0)}
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Most Popular</p>
          <p className="text-2xl font-bold text-text-primary">
            {providers.length > 0
              ? providers.reduce((a, b) => (a.totalLogins > b.totalLogins ? a : b)).displayName
              : '-'}
          </p>
        </div>
      </div>

      {/* Available Providers */}
      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="font-medium text-text-primary mb-3">Quick Add</h3>
        <div className="flex flex-wrap gap-2">
          {['google', 'github', 'microsoft'].map((name) => (
            <button
              key={name}
              onClick={() => handleQuickAdd(name)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-accent hover:text-accent transition-colors flex items-center gap-2"
            >
              <span>{PROVIDER_ICONS[name]}</span>
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <DataTable
        data={providers}
        columns={columns}
        keyExtractor={(provider) => provider.id}
        isLoading={isLoading}
        emptyMessage="No OAuth providers configured"
      />

      {/* Add Modal */}
      {showAddModal && (
        <OAuthProviderModal
          domainId={domainId}
          template={selectedTemplate}
          onClose={() => {
            setShowAddModal(false);
            setSelectedTemplate('');
          }}
          onSuccess={() => {
            setShowAddModal(false);
            setSelectedTemplate('');
            queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'oauth-providers'] });
          }}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && selectedProvider && (
        <OAuthProviderModal
          domainId={domainId}
          provider={selectedProvider}
          onClose={() => {
            setShowEditModal(false);
            setSelectedProvider(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setSelectedProvider(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'oauth-providers'] });
          }}
        />
      )}
    </div>
  );
}

function OAuthProviderModal({
  domainId,
  provider,
  template,
  onClose,
  onSuccess,
}: {
  domainId: string;
  provider?: OAuthProvider;
  template?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!provider;
  const templateData = template ? PROVIDER_TEMPLATES[template] : {};

  const [formData, setFormData] = useState({
    providerKey: provider?.providerKey || template || '',
    displayName: provider?.displayName || (template ? template.charAt(0).toUpperCase() + template.slice(1) : ''),
    description: provider?.description || '',
    type: provider?.type || templateData.type || 'oidc',
    clientId: provider?.clientId || '',
    clientSecret: provider?.clientSecret || '',
    authorizationEndpoint: provider?.authorizationEndpoint || templateData.authorizationEndpoint || '',
    tokenEndpoint: provider?.tokenEndpoint || templateData.tokenEndpoint || '',
    userinfoEndpoint: provider?.userinfoEndpoint || templateData.userinfoEndpoint || '',
    jwksUri: provider?.jwksUri || templateData.jwksUri || '',
    issuer: provider?.issuer || templateData.issuer || '',
    scopes: provider?.scopes?.join(', ') || templateData.scopes?.join(', ') || 'openid, profile, email',
    buttonColor: provider?.buttonColor || templateData.buttonColor || '#4285f4',
    buttonText: provider?.buttonText || '',
    enabled: provider?.enabled ?? true,
    autoProvisionUsers: provider?.autoProvisionUsers ?? true,
    defaultRole: provider?.defaultRole || 'member',
    requirePkce: provider?.requirePkce ?? true,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => api.adminDomainOAuthCreate(data),
    onSuccess,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => api.adminDomainOAuthUpdate(provider!.id, data),
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      domainId,
      providerKey: formData.providerKey,
      displayName: formData.displayName,
      description: formData.description,
      type: formData.type,
      clientId: formData.clientId,
      clientSecret: formData.clientSecret,
      authorizationEndpoint: formData.authorizationEndpoint,
      tokenEndpoint: formData.tokenEndpoint,
      userinfoEndpoint: formData.userinfoEndpoint || undefined,
      jwksUri: formData.jwksUri || undefined,
      issuer: formData.issuer || undefined,
      scopes: formData.scopes.split(',').map(s => s.trim()),
      buttonColor: formData.buttonColor,
      buttonText: formData.buttonText || undefined,
      enabled: formData.enabled,
      autoProvisionUsers: formData.autoProvisionUsers,
      defaultRole: formData.defaultRole,
      requirePkce: formData.requirePkce,
    };

    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold text-text-primary">
            {isEdit ? 'Edit OAuth Provider' : 'Add OAuth Provider'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Provider Key *
              </label>
              <input
                type="text"
                required
                disabled={isEdit}
                value={formData.providerKey}
                onChange={(e) => setFormData({ ...formData, providerKey: e.target.value })}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                placeholder="google"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Display Name *
              </label>
              <input
                type="text"
                required
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Google"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Description
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Sign in with Google"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Type *
              </label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="oidc">OpenID Connect</option>
                <option value="oauth2">OAuth 2.0</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Default Role *
              </label>
              <select
                required
                value={formData.defaultRole}
                onChange={(e) => setFormData({ ...formData, defaultRole: e.target.value })}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="member">Member</option>
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Client ID *
              </label>
              <input
                type="text"
                required
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="your-client-id"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Client Secret *
              </label>
              <input
                type="password"
                required={!isEdit}
                value={formData.clientSecret}
                onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder={isEdit ? "Leave blank to keep current" : "your-client-secret"}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Authorization Endpoint *
            </label>
            <input
              type="url"
              required
              value={formData.authorizationEndpoint}
              onChange={(e) => setFormData({ ...formData, authorizationEndpoint: e.target.value })}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="https://provider.com/oauth/authorize"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Token Endpoint *
            </label>
            <input
              type="url"
              required
              value={formData.tokenEndpoint}
              onChange={(e) => setFormData({ ...formData, tokenEndpoint: e.target.value })}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="https://provider.com/oauth/token"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              UserInfo Endpoint
            </label>
            <input
              type="url"
              value={formData.userinfoEndpoint}
              onChange={(e) => setFormData({ ...formData, userinfoEndpoint: e.target.value })}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="https://provider.com/oauth/userinfo"
            />
          </div>

          {formData.type === 'oidc' && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  JWKS URI
                </label>
                <input
                  type="url"
                  value={formData.jwksUri}
                  onChange={(e) => setFormData({ ...formData, jwksUri: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="https://provider.com/.well-known/jwks.json"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Issuer
                </label>
                <input
                  type="text"
                  value={formData.issuer}
                  onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
                  className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  placeholder="https://provider.com"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Scopes (comma-separated) *
            </label>
            <input
              type="text"
              required
              value={formData.scopes}
              onChange={(e) => setFormData({ ...formData, scopes: e.target.value })}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="openid, profile, email"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Button Color
              </label>
              <input
                type="color"
                value={formData.buttonColor}
                onChange={(e) => setFormData({ ...formData, buttonColor: e.target.value })}
                className="w-full h-10 px-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Button Text
              </label>
              <input
                type="text"
                value={formData.buttonText}
                onChange={(e) => setFormData({ ...formData, buttonText: e.target.value })}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder="Sign in with Google"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="w-4 h-4 text-accent bg-background border-border rounded focus:ring-accent"
              />
              <span className="text-sm text-text-secondary">Enabled</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.autoProvisionUsers}
                onChange={(e) => setFormData({ ...formData, autoProvisionUsers: e.target.checked })}
                className="w-4 h-4 text-accent bg-background border-border rounded focus:ring-accent"
              />
              <span className="text-sm text-text-secondary">Auto-provision users</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.requirePkce}
                onChange={(e) => setFormData({ ...formData, requirePkce: e.target.checked })}
                className="w-4 h-4 text-accent bg-background border-border rounded focus:ring-accent"
              />
              <span className="text-sm text-text-secondary">Require PKCE</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="flex-1 px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : isEdit ? 'Update Provider' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
