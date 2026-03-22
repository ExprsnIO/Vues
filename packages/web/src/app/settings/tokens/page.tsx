'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';

type TokenType = 'api_key' | 'access_token' | 'personal_access_token';
type ExpiryType = 'never' | 'time' | 'uses' | 'both';
type TimeUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

interface UserToken {
  id: string;
  name: string;
  type: TokenType;
  status: 'active' | 'revoked' | 'expired' | 'exhausted';
  prefix: string;
  scopes: string[];
  // Time-based constraints
  expiresAt?: string;
  // Use-based constraints
  maxUses?: number;
  usesRemaining?: number;
  currentUses?: number;
  // Metadata
  lastUsedAt?: string;
  lastUsedIp?: string;
  createdAt: string;
  description?: string;
  // Permissions granted to others
  grantedTo?: string[];
}

interface TokenGrant {
  id: string;
  tokenId: string;
  grantedTo: string; // DID or handle
  grantedToHandle?: string;
  scopes: string[];
  expiresAt?: string;
  createdAt: string;
}

const AVAILABLE_SCOPES = [
  { id: 'read', label: 'Read', description: 'Read access to your content' },
  { id: 'write', label: 'Write', description: 'Create and edit content' },
  { id: 'delete', label: 'Delete', description: 'Delete content' },
  { id: 'profile:read', label: 'Profile Read', description: 'Read profile information' },
  { id: 'profile:write', label: 'Profile Write', description: 'Update profile information' },
  { id: 'followers:read', label: 'Followers Read', description: 'View followers/following' },
  { id: 'messages:read', label: 'Messages Read', description: 'Read direct messages' },
  { id: 'messages:write', label: 'Messages Write', description: 'Send direct messages' },
  { id: 'notifications:read', label: 'Notifications Read', description: 'Read notifications' },
  { id: 'upload', label: 'Upload', description: 'Upload media files' },
];

export default function TokensSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null);
  const [viewMode, setViewMode] = useState<'tokens' | 'grants'>('tokens');

  // Fetch user's tokens
  const { data: tokens, isLoading: tokensLoading } = useQuery({
    queryKey: ['user', 'tokens'],
    queryFn: async () => {
      // Mock data - replace with actual API call
      const mockTokens: UserToken[] = [
        {
          id: 'tok_user_001',
          name: 'Mobile App',
          type: 'personal_access_token',
          status: 'active',
          prefix: 'pat_',
          scopes: ['read', 'write', 'upload'],
          createdAt: '2024-09-15T00:00:00Z',
          lastUsedAt: '2024-10-20T14:32:00Z',
          description: 'Personal access for mobile app',
        },
        {
          id: 'tok_user_002',
          name: 'Automation Script',
          type: 'api_key',
          status: 'active',
          prefix: 'api_',
          scopes: ['read', 'write'],
          expiresAt: '2025-09-15T00:00:00Z',
          maxUses: 10000,
          usesRemaining: 8432,
          currentUses: 1568,
          createdAt: '2024-09-01T00:00:00Z',
          lastUsedAt: '2024-10-19T10:15:00Z',
          description: 'Automated posting script',
        },
        {
          id: 'tok_user_003',
          name: 'One-time Import',
          type: 'access_token',
          status: 'exhausted',
          prefix: 'tmp_',
          scopes: ['write', 'upload'],
          maxUses: 1,
          usesRemaining: 0,
          currentUses: 1,
          createdAt: '2024-10-01T00:00:00Z',
          lastUsedAt: '2024-10-01T12:00:00Z',
          description: 'Single use import token',
        },
        {
          id: 'tok_user_004',
          name: 'Expired Dev Token',
          type: 'api_key',
          status: 'expired',
          prefix: 'api_',
          scopes: ['read'],
          expiresAt: '2024-08-01T00:00:00Z',
          createdAt: '2024-06-01T00:00:00Z',
          description: 'Old development token',
        },
      ];
      return mockTokens;
    },
  });

  // Fetch grants made by user
  const { data: grants } = useQuery({
    queryKey: ['user', 'token-grants'],
    queryFn: async () => {
      const mockGrants: TokenGrant[] = [
        {
          id: 'grant_001',
          tokenId: 'tok_user_001',
          grantedTo: 'did:web:collaborator.exprsn.io',
          grantedToHandle: '@collaborator',
          scopes: ['read'],
          expiresAt: '2024-12-31T23:59:59Z',
          createdAt: '2024-10-01T00:00:00Z',
        },
      ];
      return mockGrants;
    },
  });

  // Create token mutation
  const createTokenMutation = useMutation({
    mutationFn: async (data: CreateTokenData) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      // Return mock token with generated secret (only shown once)
      return {
        id: 'tok_new_' + Date.now(),
        token: 'pat_' + generateRandomString(32),
        ...data,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user', 'tokens'] });
      setShowCreateModal(false);
      // Show the token secret to user (only time it's visible)
      alert(`Token created successfully!\n\nYour token: ${data.token}\n\nSave this token now - you won't be able to see it again.`);
    },
  });

  // Revoke token mutation
  const revokeTokenMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'tokens'] });
      setSelectedToken(null);
    },
  });

  // Modify token mutation
  const modifyTokenMutation = useMutation({
    mutationFn: async (data: { tokenId: string; updates: Partial<UserToken> }) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'tokens'] });
      setShowModifyModal(false);
      setSelectedToken(null);
    },
  });

  // Grant token access mutation
  const grantAccessMutation = useMutation({
    mutationFn: async (data: { tokenId: string; grantTo: string; scopes: string[]; expiresAt?: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'token-grants'] });
      setShowGrantModal(false);
      setSelectedToken(null);
    },
  });

  // Revoke grant mutation
  const revokeGrantMutation = useMutation({
    mutationFn: async (grantId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'token-grants'] });
    },
  });

  // Regenerate token mutation
  const regenerateTokenMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { token: 'pat_' + generateRandomString(32) };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user', 'tokens'] });
      alert(`Token regenerated!\n\nNew token: ${data.token}\n\nSave this token now - you won't be able to see it again.`);
    },
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-500/10 text-green-500',
      revoked: 'bg-red-500/10 text-red-500',
      expired: 'bg-gray-500/10 text-gray-500',
      exhausted: 'bg-yellow-500/10 text-yellow-500',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.active}`}>
        {status}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      api_key: 'bg-emerald-500/10 text-emerald-500',
      access_token: 'bg-sky-500/10 text-sky-500',
      personal_access_token: 'bg-violet-500/10 text-violet-500',
    };
    const labels: Record<string, string> = {
      api_key: 'API Key',
      access_token: 'Access Token',
      personal_access_token: 'PAT',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[type] || styles.api_key}`}>
        {labels[type] || type}
      </span>
    );
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  const daysUntilExpiry = (dateStr: string) => {
    const expiry = new Date(dateStr);
    const now = new Date();
    return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (tokensLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6 animate-pulse">
        <div className="h-8 w-48 bg-surface rounded mb-6" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-surface rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const activeTokens = tokens?.filter((t) => t.status === 'active') || [];
  const inactiveTokens = tokens?.filter((t) => t.status !== 'active') || [];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Access Tokens</h1>
          <p className="text-sm text-text-muted mt-1">
            Manage API keys and personal access tokens for your account
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Create Token
        </button>
      </div>

      {/* View Toggle */}
      <div className="flex gap-1 p-1 bg-surface border border-border rounded-lg w-fit">
        <button
          onClick={() => setViewMode('tokens')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            viewMode === 'tokens'
              ? 'bg-accent text-text-inverse'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          My Tokens
        </button>
        <button
          onClick={() => setViewMode('grants')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            viewMode === 'grants'
              ? 'bg-accent text-text-inverse'
              : 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
          }`}
        >
          Shared Access
        </button>
      </div>

      {viewMode === 'tokens' ? (
        <>
          {/* Active Tokens */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">Active Tokens ({activeTokens.length})</h2>
            {activeTokens.length === 0 ? (
              <div className="bg-surface border border-border rounded-xl p-8 text-center">
                <KeyIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
                <p className="text-text-muted">No active tokens</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 text-accent hover:underline"
                >
                  Create your first token
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeTokens.map((token) => (
                  <TokenCard
                    key={token.id}
                    token={token}
                    onView={() => setSelectedToken(token)}
                    onModify={() => {
                      setSelectedToken(token);
                      setShowModifyModal(true);
                    }}
                    onGrant={() => {
                      setSelectedToken(token);
                      setShowGrantModal(true);
                    }}
                    onRevoke={() => revokeTokenMutation.mutate(token.id)}
                    onRegenerate={() => regenerateTokenMutation.mutate(token.id)}
                    getStatusBadge={getStatusBadge}
                    getTypeBadge={getTypeBadge}
                    formatTimeAgo={formatTimeAgo}
                    daysUntilExpiry={daysUntilExpiry}
                    isRevoking={revokeTokenMutation.isPending}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Inactive Tokens */}
          {inactiveTokens.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-text-muted">Inactive Tokens ({inactiveTokens.length})</h2>
              <div className="space-y-3 opacity-60">
                {inactiveTokens.map((token) => (
                  <TokenCard
                    key={token.id}
                    token={token}
                    onView={() => setSelectedToken(token)}
                    getStatusBadge={getStatusBadge}
                    getTypeBadge={getTypeBadge}
                    formatTimeAgo={formatTimeAgo}
                    daysUntilExpiry={daysUntilExpiry}
                    disabled
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Grants View */
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Shared Access ({grants?.length || 0})</h2>
          <p className="text-sm text-text-muted">
            Users and applications you've granted access to your account
          </p>
          {!grants?.length ? (
            <div className="bg-surface border border-border rounded-xl p-8 text-center">
              <ShareIcon className="w-12 h-12 text-text-muted mx-auto mb-3" />
              <p className="text-text-muted">No shared access grants</p>
              <p className="text-sm text-text-muted mt-1">
                Grant access to collaborators from your active tokens
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {grants.map((grant) => (
                <div
                  key={grant.id}
                  className="bg-surface border border-border rounded-xl p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-surface-hover rounded-full flex items-center justify-center">
                      <UserIcon className="w-5 h-5 text-text-muted" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {grant.grantedToHandle || grant.grantedTo}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-text-muted">
                          {grant.scopes.join(', ')}
                        </span>
                        {grant.expiresAt && (
                          <span className="text-xs text-text-muted">
                            · Expires {new Date(grant.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => revokeGrantMutation.mutate(grant.id)}
                    disabled={revokeGrantMutation.isPending}
                    className="px-3 py-1.5 text-red-500 hover:bg-red-500/10 rounded-lg text-sm transition-colors"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Token Detail Modal */}
      {selectedToken && !showModifyModal && !showGrantModal && (
        <TokenDetailModal
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
          onModify={() => setShowModifyModal(true)}
          onGrant={() => setShowGrantModal(true)}
          onRevoke={() => revokeTokenMutation.mutate(selectedToken.id)}
          onRegenerate={() => regenerateTokenMutation.mutate(selectedToken.id)}
          getStatusBadge={getStatusBadge}
          getTypeBadge={getTypeBadge}
        />
      )}

      {/* Create Token Modal */}
      {showCreateModal && (
        <CreateTokenModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => createTokenMutation.mutate(data)}
          isPending={createTokenMutation.isPending}
        />
      )}

      {/* Modify Token Modal */}
      {showModifyModal && selectedToken && (
        <ModifyTokenModal
          token={selectedToken}
          onClose={() => {
            setShowModifyModal(false);
            setSelectedToken(null);
          }}
          onSubmit={(updates) =>
            modifyTokenMutation.mutate({ tokenId: selectedToken.id, updates })
          }
          isPending={modifyTokenMutation.isPending}
        />
      )}

      {/* Grant Access Modal */}
      {showGrantModal && selectedToken && (
        <GrantAccessModal
          token={selectedToken}
          onClose={() => {
            setShowGrantModal(false);
            setSelectedToken(null);
          }}
          onSubmit={(data) =>
            grantAccessMutation.mutate({ tokenId: selectedToken.id, ...data })
          }
          isPending={grantAccessMutation.isPending}
        />
      )}
    </div>
  );
}

// ============================================================================
// Token Card Component
// ============================================================================

interface TokenCardProps {
  token: UserToken;
  onView: () => void;
  onModify?: () => void;
  onGrant?: () => void;
  onRevoke?: () => void;
  onRegenerate?: () => void;
  getStatusBadge: (s: string) => React.ReactElement;
  getTypeBadge: (t: string) => React.ReactElement;
  formatTimeAgo: (d: string) => string;
  daysUntilExpiry: (d: string) => number;
  disabled?: boolean;
  isRevoking?: boolean;
}

function TokenCard({
  token,
  onView,
  onModify,
  onGrant,
  onRevoke,
  onRegenerate,
  getStatusBadge,
  getTypeBadge,
  formatTimeAgo,
  daysUntilExpiry,
  disabled,
  isRevoking,
}: TokenCardProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-surface-hover rounded-lg">
            <KeyIcon className="w-5 h-5 text-text-muted" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-text-primary">{token.name}</p>
              {getTypeBadge(token.type)}
              {getStatusBadge(token.status)}
            </div>
            {token.description && (
              <p className="text-xs text-text-muted mt-1">{token.description}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <span className="text-xs text-text-muted font-mono">{token.prefix}...</span>
              <div className="flex flex-wrap gap-1">
                {token.scopes.slice(0, 3).map((scope) => (
                  <span key={scope} className="px-1.5 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                    {scope}
                  </span>
                ))}
                {token.scopes.length > 3 && (
                  <span className="px-1.5 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                    +{token.scopes.length - 3}
                  </span>
                )}
              </div>
            </div>
            {/* Constraints */}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-text-muted">
              {token.expiresAt && (
                <span className={daysUntilExpiry(token.expiresAt) < 7 ? 'text-yellow-500' : ''}>
                  Expires: {new Date(token.expiresAt).toLocaleDateString()}
                </span>
              )}
              {token.maxUses && (
                <span className={token.usesRemaining === 0 ? 'text-red-500' : ''}>
                  Uses: {token.currentUses}/{token.maxUses}
                </span>
              )}
              {token.lastUsedAt && (
                <span>Last used: {formatTimeAgo(token.lastUsedAt)}</span>
              )}
            </div>
          </div>
        </div>
        {!disabled && (
          <div className="relative">
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
            >
              <MoreIcon className="w-5 h-5" />
            </button>
            {showActions && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowActions(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-border rounded-lg shadow-lg z-20 py-1">
                  <button
                    onClick={() => {
                      setShowActions(false);
                      onView();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
                  >
                    View Details
                  </button>
                  {onModify && (
                    <button
                      onClick={() => {
                        setShowActions(false);
                        onModify();
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
                    >
                      Modify
                    </button>
                  )}
                  {onGrant && (
                    <button
                      onClick={() => {
                        setShowActions(false);
                        onGrant();
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
                    >
                      Grant Access
                    </button>
                  )}
                  {onRegenerate && (
                    <button
                      onClick={() => {
                        setShowActions(false);
                        onRegenerate();
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-text-primary hover:bg-surface-hover"
                    >
                      Regenerate
                    </button>
                  )}
                  {onRevoke && (
                    <button
                      onClick={() => {
                        setShowActions(false);
                        onRevoke();
                      }}
                      disabled={isRevoking}
                      className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-500/10"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Create Token Modal
// ============================================================================

interface CreateTokenData {
  name: string;
  type: TokenType;
  scopes: string[];
  expiryType: ExpiryType;
  expiryValue?: number;
  expiryUnit?: TimeUnit;
  maxUses?: number;
  description?: string;
}

function CreateTokenModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (data: CreateTokenData) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState('');
  const [tokenType, setTokenType] = useState<TokenType>('personal_access_token');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['read']);
  const [expiryType, setExpiryType] = useState<ExpiryType>('never');

  // Custom time-based expiry
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [customTimeValue, setCustomTimeValue] = useState(30);
  const [customTimeUnit, setCustomTimeUnit] = useState<TimeUnit>('days');
  const [presetTimeValue, setPresetTimeValue] = useState(30);

  // Custom use-based expiry
  const [useCustomUses, setUseCustomUses] = useState(false);
  const [customUsesValue, setCustomUsesValue] = useState(100);
  const [presetUsesValue, setPresetUsesValue] = useState(100);

  const [description, setDescription] = useState('');

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateTokenData = {
      name,
      type: tokenType,
      scopes: selectedScopes,
      expiryType,
      description: description || undefined,
    };

    if (expiryType === 'time' || expiryType === 'both') {
      if (useCustomTime) {
        data.expiryValue = customTimeValue;
        data.expiryUnit = customTimeUnit;
      } else {
        data.expiryValue = presetTimeValue;
        data.expiryUnit = 'days';
      }
    }

    if (expiryType === 'uses' || expiryType === 'both') {
      data.maxUses = useCustomUses ? customUsesValue : presetUsesValue;
    }

    onSubmit(data);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-text-primary">Create Access Token</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Token Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Mobile App, Automation Script"
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Token Type</label>
              <select
                value={tokenType}
                onChange={(e) => setTokenType(e.target.value as TokenType)}
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              >
                <option value="personal_access_token">Personal Access Token (PAT)</option>
                <option value="api_key">API Key</option>
                <option value="access_token">Limited Access Token</option>
              </select>
              <p className="text-xs text-text-muted mt-1">
                {tokenType === 'personal_access_token' && 'Full access token for personal use'}
                {tokenType === 'api_key' && 'Long-lived key for applications and scripts'}
                {tokenType === 'access_token' && 'Temporary token for specific tasks'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Description (optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will this token be used for?"
                className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Scopes */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Permissions</label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_SCOPES.map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => toggleScope(scope.id)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    selectedScopes.includes(scope.id)
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-text-muted'
                  }`}
                >
                  <p className="text-sm font-medium text-text-primary">{scope.label}</p>
                  <p className="text-xs text-text-muted">{scope.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Expiry Type */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Token Constraints</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'never', label: 'Never Expires', desc: 'No automatic expiration' },
                { value: 'time', label: 'Time-Based', desc: 'Expires after duration' },
                { value: 'uses', label: 'Use-Based', desc: 'Limited number of uses' },
                { value: 'both', label: 'Time + Uses', desc: 'Both constraints apply' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setExpiryType(opt.value as ExpiryType)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    expiryType === opt.value
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-text-muted'
                  }`}
                >
                  <p className="text-sm font-medium text-text-primary">{opt.label}</p>
                  <p className="text-xs text-text-muted">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Time-Based Options */}
          {(expiryType === 'time' || expiryType === 'both') && (
            <div className="space-y-3 p-4 bg-surface-hover rounded-lg">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-primary">Expiration Time</label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useCustomTime}
                    onChange={(e) => setUseCustomTime(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-text-muted">Custom</span>
                </label>
              </div>

              {!useCustomTime ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 1, label: '1 day' },
                    { value: 7, label: '7 days' },
                    { value: 30, label: '30 days' },
                    { value: 90, label: '90 days' },
                    { value: 180, label: '6 months' },
                    { value: 365, label: '1 year' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPresetTimeValue(opt.value)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        presetTimeValue === opt.value
                          ? 'bg-accent text-text-inverse'
                          : 'bg-surface text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={customTimeValue}
                    onChange={(e) => setCustomTimeValue(Number(e.target.value))}
                    className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  />
                  <select
                    value={customTimeUnit}
                    onChange={(e) => setCustomTimeUnit(e.target.value as TimeUnit)}
                    className="px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Use-Based Options */}
          {(expiryType === 'uses' || expiryType === 'both') && (
            <div className="space-y-3 p-4 bg-surface-hover rounded-lg">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-text-primary">Maximum Uses</label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useCustomUses}
                    onChange={(e) => setUseCustomUses(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-text-muted">Custom</span>
                </label>
              </div>

              {!useCustomUses ? (
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 1, label: 'Single use' },
                    { value: 10, label: '10 uses' },
                    { value: 100, label: '100 uses' },
                    { value: 1000, label: '1K uses' },
                    { value: 10000, label: '10K uses' },
                    { value: 100000, label: '100K uses' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPresetUsesValue(opt.value)}
                      className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                        presetUsesValue === opt.value
                          ? 'bg-accent text-text-inverse'
                          : 'bg-surface text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="number"
                  min={1}
                  value={customUsesValue}
                  onChange={(e) => setCustomUsesValue(Number(e.target.value))}
                  placeholder="Enter number of uses"
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
                />
              )}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending || !name || selectedScopes.length === 0}
            className="w-full px-4 py-3 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {isPending ? 'Creating Token...' : 'Create Token'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Modify Token Modal
// ============================================================================

function ModifyTokenModal({
  token,
  onClose,
  onSubmit,
  isPending,
}: {
  token: UserToken;
  onClose: () => void;
  onSubmit: (updates: Partial<UserToken>) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(token.name);
  const [description, setDescription] = useState(token.description || '');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(token.scopes);

  const toggleScope = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-text-primary">Modify Token</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              name,
              description: description || undefined,
              scopes: selectedScopes,
            });
          }}
          className="space-y-6"
        >
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Token Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Permissions</label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_SCOPES.map((scope) => (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => toggleScope(scope.id)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    selectedScopes.includes(scope.id)
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-text-muted'
                  }`}
                >
                  <p className="text-sm font-medium text-text-primary">{scope.label}</p>
                  <p className="text-xs text-text-muted">{scope.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-sm text-yellow-600">
              Note: Expiration time and use limits cannot be modified after creation. To change these, revoke this token and create a new one.
            </p>
          </div>

          <button
            type="submit"
            disabled={isPending || !name || selectedScopes.length === 0}
            className="w-full px-4 py-3 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Grant Access Modal
// ============================================================================

function GrantAccessModal({
  token,
  onClose,
  onSubmit,
  isPending,
}: {
  token: UserToken;
  onClose: () => void;
  onSubmit: (data: { grantTo: string; scopes: string[]; expiresAt?: string }) => void;
  isPending: boolean;
}) {
  const [grantTo, setGrantTo] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([token.scopes[0] || 'read']);
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30);

  const toggleScope = (scope: string) => {
    // Only allow scopes that the token has
    if (!token.scopes.includes(scope)) return;
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const expiresAt = hasExpiry
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
    onSubmit({ grantTo, scopes: selectedScopes, expiresAt });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-text-primary">Grant Access</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Grant To (Handle or DID)
            </label>
            <input
              type="text"
              value={grantTo}
              onChange={(e) => setGrantTo(e.target.value)}
              placeholder="@username or did:web:..."
              className="w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Permissions to Grant
            </label>
            <p className="text-xs text-text-muted mb-2">
              You can only grant permissions that this token has
            </p>
            <div className="flex flex-wrap gap-2">
              {token.scopes.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => toggleScope(scope)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    selectedScopes.includes(scope)
                      ? 'bg-accent text-text-inverse'
                      : 'bg-surface-hover text-text-muted hover:text-text-primary'
                  }`}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasExpiry}
                onChange={(e) => setHasExpiry(e.target.checked)}
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-sm text-text-primary">Set expiration</span>
            </label>
            {hasExpiry && (
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                className="mt-2 w-full px-4 py-2 bg-surface-hover border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent"
              >
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>1 year</option>
              </select>
            )}
          </div>

          <button
            type="submit"
            disabled={isPending || !grantTo || selectedScopes.length === 0}
            className="w-full px-4 py-3 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {isPending ? 'Granting...' : 'Grant Access'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Token Detail Modal
// ============================================================================

function TokenDetailModal({
  token,
  onClose,
  onModify,
  onGrant,
  onRevoke,
  onRegenerate,
  getStatusBadge,
  getTypeBadge,
}: {
  token: UserToken;
  onClose: () => void;
  onModify: () => void;
  onGrant: () => void;
  onRevoke: () => void;
  onRegenerate: () => void;
  getStatusBadge: (s: string) => React.ReactElement;
  getTypeBadge: (t: string) => React.ReactElement;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-text-primary">Token Details</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-xs text-text-muted">Name</p>
            <p className="text-sm font-medium text-text-primary">{token.name}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-text-muted">Type</p>
              {getTypeBadge(token.type)}
            </div>
            <div>
              <p className="text-xs text-text-muted">Status</p>
              {getStatusBadge(token.status)}
            </div>
          </div>

          {token.description && (
            <div>
              <p className="text-xs text-text-muted">Description</p>
              <p className="text-sm text-text-primary">{token.description}</p>
            </div>
          )}

          <div>
            <p className="text-xs text-text-muted">Prefix</p>
            <p className="text-sm font-mono text-text-primary">{token.prefix}...</p>
          </div>

          <div>
            <p className="text-xs text-text-muted mb-1">Permissions</p>
            <div className="flex flex-wrap gap-1">
              {token.scopes.map((scope) => (
                <span key={scope} className="px-2 py-0.5 bg-surface-hover rounded text-xs text-text-muted">
                  {scope}
                </span>
              ))}
            </div>
          </div>

          {token.expiresAt && (
            <div>
              <p className="text-xs text-text-muted">Expires</p>
              <p className="text-sm text-text-primary">{new Date(token.expiresAt).toLocaleString()}</p>
            </div>
          )}

          {token.maxUses && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted">Uses</p>
                <p className="text-sm text-text-primary">{token.currentUses} / {token.maxUses}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Remaining</p>
                <p className={`text-sm ${token.usesRemaining === 0 ? 'text-red-500' : 'text-text-primary'}`}>
                  {token.usesRemaining}
                </p>
              </div>
            </div>
          )}

          {token.lastUsedAt && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted">Last Used</p>
                <p className="text-sm text-text-primary">{new Date(token.lastUsedAt).toLocaleString()}</p>
              </div>
              {token.lastUsedIp && (
                <div>
                  <p className="text-xs text-text-muted">Last IP</p>
                  <p className="text-sm font-mono text-text-primary">{token.lastUsedIp}</p>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-xs text-text-muted">Created</p>
            <p className="text-sm text-text-primary">{new Date(token.createdAt).toLocaleString()}</p>
          </div>
        </div>

        {token.status === 'active' && (
          <div className="flex gap-2 mt-6">
            <button
              onClick={onModify}
              className="flex-1 px-4 py-2 bg-surface-hover hover:bg-surface text-text-primary rounded-lg transition-colors"
            >
              Modify
            </button>
            <button
              onClick={onGrant}
              className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
            >
              Grant Access
            </button>
          </div>
        )}

        {token.status === 'active' && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={onRegenerate}
              className="flex-1 px-4 py-2 border border-border hover:bg-surface-hover text-text-primary rounded-lg transition-colors"
            >
              Regenerate
            </button>
            <button
              onClick={onRevoke}
              className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
            >
              Revoke
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Helper Functions & Icons
// ============================================================================

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function KeyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
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

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
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
