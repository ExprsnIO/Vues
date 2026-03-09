// @ts-nocheck
'use client';

import { Badge, StatusIndicator } from '@/components/admin/ui';

interface SSOProvider {
  id: string;
  name: string;
  type: 'oidc' | 'saml' | 'oauth2';
  status: 'active' | 'inactive' | 'error';
  isPrimary: boolean;
  issuer?: string;
  clientId?: string;
  entityId?: string;
  lastSync?: string;
  userCount?: number;
  logo?: string;
}

interface ProviderCardProps {
  provider: SSOProvider;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onSetPrimary?: () => void;
  compact?: boolean;
}

export function ProviderCard({ provider, onClick, onToggle, onSetPrimary, compact }: ProviderCardProps) {
  const typeLabels: Record<string, string> = {
    oidc: 'OpenID Connect',
    saml: 'SAML 2.0',
    oauth2: 'OAuth 2.0',
  };

  const typeColors: Record<string, string> = {
    oidc: 'bg-blue-500/10 text-blue-500',
    saml: 'bg-purple-500/10 text-purple-500',
    oauth2: 'bg-green-500/10 text-green-500',
  };

  const typeIcons: Record<string, React.ReactNode> = {
    oidc: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
    saml: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    oauth2: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
      </svg>
    ),
  };

  if (compact) {
    return (
      <div
        onClick={onClick}
        className="flex items-center gap-3 p-3 bg-surface hover:bg-surface-hover border border-border rounded-lg cursor-pointer transition-colors"
      >
        <div className={`p-2 rounded-lg ${typeColors[provider.type]}`}>
          {typeIcons[provider.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-text-primary truncate">{provider.name}</p>
            {provider.isPrimary && <Badge variant="info" size="sm">Primary</Badge>}
          </div>
          <p className="text-xs text-text-muted">{typeLabels[provider.type]}</p>
        </div>
        <StatusIndicator
          status={provider.status === 'active' ? 'online' : provider.status === 'error' ? 'error' : 'offline'}
          showLabel={false}
        />
      </div>
    );
  }

  return (
    <div className="p-5 bg-surface border border-border rounded-xl hover:border-accent/50 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {provider.logo ? (
            <img src={provider.logo} alt="" className="w-10 h-10 rounded-lg object-contain bg-surface-hover p-1" />
          ) : (
            <div className={`p-2.5 rounded-lg ${typeColors[provider.type]}`}>
              {typeIcons[provider.type]}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-text-primary">{provider.name}</h3>
              {provider.isPrimary && <Badge variant="info" size="sm">Primary</Badge>}
            </div>
            <p className="text-sm text-text-muted">{typeLabels[provider.type]}</p>
          </div>
        </div>
        <StatusIndicator
          status={provider.status === 'active' ? 'online' : provider.status === 'error' ? 'error' : 'offline'}
          label={provider.status}
        />
      </div>

      <div className="space-y-2 text-sm mb-4">
        {provider.issuer && (
          <div className="flex justify-between">
            <span className="text-text-muted">Issuer</span>
            <span className="text-text-primary font-mono text-xs truncate max-w-[200px]">{provider.issuer}</span>
          </div>
        )}
        {provider.clientId && (
          <div className="flex justify-between">
            <span className="text-text-muted">Client ID</span>
            <span className="text-text-primary font-mono text-xs">{provider.clientId.slice(0, 20)}...</span>
          </div>
        )}
        {provider.entityId && (
          <div className="flex justify-between">
            <span className="text-text-muted">Entity ID</span>
            <span className="text-text-primary font-mono text-xs truncate max-w-[200px]">{provider.entityId}</span>
          </div>
        )}
        {provider.userCount !== undefined && (
          <div className="flex justify-between">
            <span className="text-text-muted">Linked Users</span>
            <span className="text-text-primary">{provider.userCount}</span>
          </div>
        )}
        {provider.lastSync && (
          <div className="flex justify-between">
            <span className="text-text-muted">Last Sync</span>
            <span className="text-text-primary">{new Date(provider.lastSync).toLocaleString()}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-4 border-t border-border">
        <button
          onClick={onClick}
          className="flex-1 px-3 py-2 text-sm text-accent hover:bg-accent/10 rounded-lg transition-colors"
        >
          Configure
        </button>
        {!provider.isPrimary && provider.status === 'active' && (
          <button
            onClick={(e) => { e.stopPropagation(); onSetPrimary?.(); }}
            className="px-3 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            Set as Primary
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle?.(provider.status !== 'active'); }}
          className={`px-3 py-2 text-sm rounded-lg transition-colors ${
            provider.status === 'active'
              ? 'text-red-500 hover:bg-red-500/10'
              : 'text-green-500 hover:bg-green-500/10'
          }`}
        >
          {provider.status === 'active' ? 'Disable' : 'Enable'}
        </button>
      </div>
    </div>
  );
}

export default ProviderCard;
