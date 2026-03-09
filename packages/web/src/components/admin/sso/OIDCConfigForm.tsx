'use client';

import { useState } from 'react';
import { FormField, Input, Toggle, Badge } from '@/components/admin/ui';

interface OIDCConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  responseType: 'code' | 'id_token' | 'code id_token';
  responseMode?: 'query' | 'fragment' | 'form_post';
  useNonce: boolean;
  usePKCE: boolean;
  discoveryEnabled: boolean;
  jwksUri?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userInfoEndpoint?: string;
  endSessionEndpoint?: string;
}

interface OIDCConfigFormProps {
  config: Partial<OIDCConfig>;
  onChange: (config: Partial<OIDCConfig>) => void;
  onDiscover?: (issuer: string) => void;
  isDiscovering?: boolean;
}

const DEFAULT_SCOPES = ['openid', 'profile', 'email'];
const ADDITIONAL_SCOPES = ['groups', 'offline_access', 'phone', 'address'];

export function OIDCConfigForm({ config, onChange, onDiscover, isDiscovering }: OIDCConfigFormProps) {
  const [showSecret, setShowSecret] = useState(false);
  const [customScope, setCustomScope] = useState('');

  const updateConfig = <K extends keyof OIDCConfig>(key: K, value: OIDCConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const toggleScope = (scope: string) => {
    const current = config.scopes || DEFAULT_SCOPES;
    if (current.includes(scope)) {
      updateConfig('scopes', current.filter(s => s !== scope));
    } else {
      updateConfig('scopes', [...current, scope]);
    }
  };

  const addCustomScope = () => {
    if (customScope && !config.scopes?.includes(customScope)) {
      updateConfig('scopes', [...(config.scopes || DEFAULT_SCOPES), customScope]);
      setCustomScope('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Discovery */}
      <div className="p-4 bg-surface-hover rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium text-text-primary">OpenID Connect Discovery</p>
            <p className="text-xs text-text-muted">Automatically configure endpoints from the issuer</p>
          </div>
          <Toggle
            checked={config.discoveryEnabled ?? true}
            onChange={(enabled) => updateConfig('discoveryEnabled', enabled)}
          />
        </div>

        {config.discoveryEnabled !== false && (
          <div className="flex gap-2">
            <Input
              value={config.issuer || ''}
              onChange={(e) => updateConfig('issuer', e.target.value)}
              placeholder="https://accounts.google.com"
              className="flex-1"
            />
            <button
              onClick={() => config.issuer && onDiscover?.(config.issuer)}
              disabled={!config.issuer || isDiscovering}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              {isDiscovering ? 'Discovering...' : 'Discover'}
            </button>
          </div>
        )}
      </div>

      {/* Client Credentials */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-text-primary">Client Credentials</h4>

        <FormField label="Client ID" required>
          <Input
            value={config.clientId || ''}
            onChange={(e) => updateConfig('clientId', e.target.value)}
            placeholder="your-client-id"
          />
        </FormField>

        <FormField label="Client Secret" required>
          <div className="relative">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={config.clientSecret || ''}
              onChange={(e) => updateConfig('clientSecret', e.target.value)}
              placeholder="your-client-secret"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {showSecret ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                ) : (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </FormField>
      </div>

      {/* Scopes */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-text-primary">Requested Scopes</h4>

        <div className="flex flex-wrap gap-2">
          {DEFAULT_SCOPES.map(scope => (
            <button
              key={scope}
              onClick={() => toggleScope(scope)}
              disabled={scope === 'openid'}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                (config.scopes || DEFAULT_SCOPES).includes(scope)
                  ? 'bg-accent text-text-inverse border-accent'
                  : 'bg-surface border-border hover:border-accent/50'
              } ${scope === 'openid' ? 'opacity-75 cursor-not-allowed' : ''}`}
            >
              {scope}
              {scope === 'openid' && <span className="ml-1 text-xs">(required)</span>}
            </button>
          ))}
          {ADDITIONAL_SCOPES.map(scope => (
            <button
              key={scope}
              onClick={() => toggleScope(scope)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                (config.scopes || []).includes(scope)
                  ? 'bg-accent text-text-inverse border-accent'
                  : 'bg-surface border-border hover:border-accent/50'
              }`}
            >
              {scope}
            </button>
          ))}
          {(config.scopes || []).filter(s => !DEFAULT_SCOPES.includes(s) && !ADDITIONAL_SCOPES.includes(s)).map(scope => (
            <button
              key={scope}
              onClick={() => toggleScope(scope)}
              className="px-3 py-1.5 text-sm rounded-lg bg-accent text-text-inverse border border-accent"
            >
              {scope}
              <span className="ml-1">×</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={customScope}
            onChange={(e) => setCustomScope(e.target.value)}
            placeholder="Add custom scope..."
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomScope())}
          />
          <button
            onClick={addCustomScope}
            disabled={!customScope}
            className="px-4 py-2 text-sm bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Advanced Options */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-text-primary">Advanced Options</h4>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Response Type">
            <select
              value={config.responseType || 'code'}
              onChange={(e) => updateConfig('responseType', e.target.value as any)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="code">Authorization Code (code)</option>
              <option value="id_token">Implicit (id_token)</option>
              <option value="code id_token">Hybrid (code id_token)</option>
            </select>
          </FormField>

          <FormField label="Response Mode">
            <select
              value={config.responseMode || 'query'}
              onChange={(e) => updateConfig('responseMode', e.target.value as any)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="query">Query</option>
              <option value="fragment">Fragment</option>
              <option value="form_post">Form Post</option>
            </select>
          </FormField>
        </div>

        <div className="flex gap-6">
          <Toggle
            checked={config.useNonce ?? true}
            onChange={(use) => updateConfig('useNonce', use)}
            label="Use Nonce"
            description="Include nonce in authorization request"
          />
          <Toggle
            checked={config.usePKCE ?? true}
            onChange={(use) => updateConfig('usePKCE', use)}
            label="Use PKCE"
            description="Use Proof Key for Code Exchange"
          />
        </div>
      </div>

      {/* Manual Endpoints (when discovery disabled) */}
      {config.discoveryEnabled === false && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-text-primary">Endpoints</h4>

          <FormField label="Authorization Endpoint" required>
            <Input
              value={config.authorizationEndpoint || ''}
              onChange={(e) => updateConfig('authorizationEndpoint', e.target.value)}
              placeholder="https://provider.com/oauth2/authorize"
            />
          </FormField>

          <FormField label="Token Endpoint" required>
            <Input
              value={config.tokenEndpoint || ''}
              onChange={(e) => updateConfig('tokenEndpoint', e.target.value)}
              placeholder="https://provider.com/oauth2/token"
            />
          </FormField>

          <FormField label="UserInfo Endpoint">
            <Input
              value={config.userInfoEndpoint || ''}
              onChange={(e) => updateConfig('userInfoEndpoint', e.target.value)}
              placeholder="https://provider.com/oauth2/userinfo"
            />
          </FormField>

          <FormField label="JWKS URI">
            <Input
              value={config.jwksUri || ''}
              onChange={(e) => updateConfig('jwksUri', e.target.value)}
              placeholder="https://provider.com/.well-known/jwks.json"
            />
          </FormField>

          <FormField label="End Session Endpoint">
            <Input
              value={config.endSessionEndpoint || ''}
              onChange={(e) => updateConfig('endSessionEndpoint', e.target.value)}
              placeholder="https://provider.com/oauth2/logout"
            />
          </FormField>
        </div>
      )}
    </div>
  );
}

export default OIDCConfigForm;
