'use client';

import { useState } from 'react';
import { FormField, Input, Toggle } from '@/components/admin/ui';

interface OAuth2Config {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  revokeUrl?: string;
  scopes: string[];
  responseType: 'code' | 'token';
  grantType: 'authorization_code' | 'client_credentials' | 'refresh_token';
  usePKCE: boolean;
  clientAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'client_secret_jwt' | 'private_key_jwt';
}

interface OAuth2ConfigFormProps {
  config: Partial<OAuth2Config>;
  onChange: (config: Partial<OAuth2Config>) => void;
}

const COMMON_PRESETS = [
  {
    name: 'Google',
    config: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
      scopes: ['openid', 'profile', 'email'],
    },
  },
  {
    name: 'GitHub',
    config: {
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      scopes: ['read:user', 'user:email'],
    },
  },
  {
    name: 'Microsoft',
    config: {
      authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      scopes: ['openid', 'profile', 'email', 'User.Read'],
    },
  },
];

export function OAuth2ConfigForm({ config, onChange }: OAuth2ConfigFormProps) {
  const [showSecret, setShowSecret] = useState(false);
  const [customScope, setCustomScope] = useState('');

  const updateConfig = <K extends keyof OAuth2Config>(key: K, value: OAuth2Config[K]) => {
    onChange({ ...config, [key]: value });
  };

  const applyPreset = (preset: typeof COMMON_PRESETS[0]) => {
    onChange({ ...config, ...preset.config });
  };

  const toggleScope = (scope: string) => {
    const current = config.scopes || [];
    if (current.includes(scope)) {
      updateConfig('scopes', current.filter(s => s !== scope));
    } else {
      updateConfig('scopes', [...current, scope]);
    }
  };

  const addCustomScope = () => {
    if (customScope && !config.scopes?.includes(customScope)) {
      updateConfig('scopes', [...(config.scopes || []), customScope]);
      setCustomScope('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Presets */}
      <div className="p-4 bg-surface-hover rounded-lg">
        <p className="text-sm font-medium text-text-primary mb-3">Quick Setup</p>
        <div className="flex flex-wrap gap-2">
          {COMMON_PRESETS.map(preset => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset)}
              className="px-3 py-1.5 text-sm bg-surface hover:bg-accent/10 border border-border hover:border-accent/50 rounded-lg transition-colors"
            >
              {preset.name}
            </button>
          ))}
        </div>
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

      {/* Endpoints */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-text-primary">OAuth 2.0 Endpoints</h4>

        <FormField label="Authorization URL" required>
          <Input
            value={config.authorizationUrl || ''}
            onChange={(e) => updateConfig('authorizationUrl', e.target.value)}
            placeholder="https://provider.com/oauth/authorize"
          />
        </FormField>

        <FormField label="Token URL" required>
          <Input
            value={config.tokenUrl || ''}
            onChange={(e) => updateConfig('tokenUrl', e.target.value)}
            placeholder="https://provider.com/oauth/token"
          />
        </FormField>

        <FormField label="User Info URL" hint="Optional endpoint to fetch user profile">
          <Input
            value={config.userInfoUrl || ''}
            onChange={(e) => updateConfig('userInfoUrl', e.target.value)}
            placeholder="https://provider.com/oauth/userinfo"
          />
        </FormField>

        <FormField label="Revoke URL" hint="Optional endpoint for token revocation">
          <Input
            value={config.revokeUrl || ''}
            onChange={(e) => updateConfig('revokeUrl', e.target.value)}
            placeholder="https://provider.com/oauth/revoke"
          />
        </FormField>
      </div>

      {/* Scopes */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-text-primary">Requested Scopes</h4>

        <div className="flex flex-wrap gap-2">
          {(config.scopes || []).map(scope => (
            <button
              key={scope}
              onClick={() => toggleScope(scope)}
              className="px-3 py-1.5 text-sm rounded-lg bg-accent text-text-inverse border border-accent"
            >
              {scope}
              <span className="ml-1.5">×</span>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={customScope}
            onChange={(e) => setCustomScope(e.target.value)}
            placeholder="Add scope..."
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

      {/* OAuth Flow Options */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-text-primary">Flow Configuration</h4>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Response Type">
            <select
              value={config.responseType || 'code'}
              onChange={(e) => updateConfig('responseType', e.target.value as any)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="code">Authorization Code</option>
              <option value="token">Implicit (token)</option>
            </select>
          </FormField>

          <FormField label="Grant Type">
            <select
              value={config.grantType || 'authorization_code'}
              onChange={(e) => updateConfig('grantType', e.target.value as any)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="authorization_code">Authorization Code</option>
              <option value="client_credentials">Client Credentials</option>
              <option value="refresh_token">Refresh Token</option>
            </select>
          </FormField>
        </div>

        <FormField label="Client Authentication Method">
          <select
            value={config.clientAuthMethod || 'client_secret_basic'}
            onChange={(e) => updateConfig('clientAuthMethod', e.target.value as any)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="client_secret_basic">HTTP Basic Auth</option>
            <option value="client_secret_post">POST Body</option>
            <option value="none">None (Public Client)</option>
          </select>
        </FormField>

        <Toggle
          checked={config.usePKCE ?? true}
          onChange={(use) => updateConfig('usePKCE', use)}
          label="Use PKCE"
          description="Proof Key for Code Exchange (recommended for public clients)"
        />
      </div>
    </div>
  );
}

export default OAuth2ConfigForm;
