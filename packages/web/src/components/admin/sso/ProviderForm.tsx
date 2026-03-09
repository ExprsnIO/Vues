'use client';

import { useState } from 'react';
import { FormField, Input, Select, Toggle, Textarea } from '@/components/admin/ui';

type ProviderType = 'oidc' | 'saml' | 'oauth2';

interface ProviderFormData {
  name: string;
  type: ProviderType;
  enabled: boolean;
  // OIDC/OAuth2
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  userInfoUrl?: string;
  scopes?: string[];
  // SAML
  entityId?: string;
  ssoUrl?: string;
  certificate?: string;
  signRequests?: boolean;
  // Common
  attributeMapping?: {
    email: string;
    name: string;
    avatar?: string;
    groups?: string;
  };
}

interface ProviderFormProps {
  initialData?: Partial<ProviderFormData>;
  onSubmit: (data: ProviderFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  mode: 'create' | 'edit';
}

export function ProviderForm({ initialData, onSubmit, onCancel, isSubmitting, mode }: ProviderFormProps) {
  const [formData, setFormData] = useState<ProviderFormData>({
    name: initialData?.name || '',
    type: initialData?.type || 'oidc',
    enabled: initialData?.enabled ?? true,
    clientId: initialData?.clientId || '',
    clientSecret: initialData?.clientSecret || '',
    issuer: initialData?.issuer || '',
    authorizationUrl: initialData?.authorizationUrl || '',
    tokenUrl: initialData?.tokenUrl || '',
    userInfoUrl: initialData?.userInfoUrl || '',
    scopes: initialData?.scopes || ['openid', 'profile', 'email'],
    entityId: initialData?.entityId || '',
    ssoUrl: initialData?.ssoUrl || '',
    certificate: initialData?.certificate || '',
    signRequests: initialData?.signRequests ?? false,
    attributeMapping: initialData?.attributeMapping || {
      email: 'email',
      name: 'name',
    },
  });

  const [showSecret, setShowSecret] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const updateField = <K extends keyof ProviderFormData>(key: K, value: ProviderFormData[K]) => {
    setFormData({ ...formData, [key]: value });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-text-primary">Basic Information</h3>

        <FormField label="Provider Name" required>
          <Input
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="e.g., Google Workspace, Okta"
          />
        </FormField>

        <FormField label="Protocol" required>
          <Select
            value={formData.type}
            onChange={(e: any) => updateField('type', e.target.value)}
            disabled={mode === 'edit'}
          >
            <option value="oidc">OpenID Connect</option>
            <option value="saml">SAML 2.0</option>
            <option value="oauth2">OAuth 2.0</option>
          </Select>
        </FormField>

        <Toggle
          checked={formData.enabled}
          onChange={(enabled) => updateField('enabled', enabled)}
          label="Enable Provider"
          description="Allow users to authenticate using this provider"
        />
      </div>

      {/* OIDC/OAuth2 Config */}
      {(formData.type === 'oidc' || formData.type === 'oauth2') && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-text-primary">
            {formData.type === 'oidc' ? 'OpenID Connect' : 'OAuth 2.0'} Configuration
          </h3>

          <FormField label="Client ID" required>
            <Input
              value={formData.clientId || ''}
              onChange={(e) => updateField('clientId', e.target.value)}
              placeholder="Enter client ID"
            />
          </FormField>

          <FormField label="Client Secret" required>
            <div className="relative">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={formData.clientSecret || ''}
                onChange={(e) => updateField('clientSecret', e.target.value)}
                placeholder="Enter client secret"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                {showSecret ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </FormField>

          {formData.type === 'oidc' && (
            <FormField label="Issuer URL" required hint="The OIDC provider's issuer URL">
              <Input
                value={formData.issuer || ''}
                onChange={(e) => updateField('issuer', e.target.value)}
                placeholder="https://accounts.google.com"
              />
            </FormField>
          )}

          {formData.type === 'oauth2' && (
            <>
              <FormField label="Authorization URL" required>
                <Input
                  value={formData.authorizationUrl || ''}
                  onChange={(e) => updateField('authorizationUrl', e.target.value)}
                  placeholder="https://provider.com/oauth/authorize"
                />
              </FormField>

              <FormField label="Token URL" required>
                <Input
                  value={formData.tokenUrl || ''}
                  onChange={(e) => updateField('tokenUrl', e.target.value)}
                  placeholder="https://provider.com/oauth/token"
                />
              </FormField>

              <FormField label="User Info URL">
                <Input
                  value={formData.userInfoUrl || ''}
                  onChange={(e) => updateField('userInfoUrl', e.target.value)}
                  placeholder="https://provider.com/oauth/userinfo"
                />
              </FormField>
            </>
          )}

          <FormField label="Scopes" hint="Space-separated list of scopes">
            <Input
              value={formData.scopes?.join(' ') || ''}
              onChange={(e) => updateField('scopes', e.target.value.split(' ').filter(Boolean))}
              placeholder="openid profile email"
            />
          </FormField>
        </div>
      )}

      {/* SAML Config */}
      {formData.type === 'saml' && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-text-primary">SAML 2.0 Configuration</h3>

          <FormField label="Entity ID" required hint="The IdP's entity ID">
            <Input
              value={formData.entityId || ''}
              onChange={(e) => updateField('entityId', e.target.value)}
              placeholder="https://idp.example.com/entity"
            />
          </FormField>

          <FormField label="SSO URL" required hint="Single Sign-On service URL">
            <Input
              value={formData.ssoUrl || ''}
              onChange={(e) => updateField('ssoUrl', e.target.value)}
              placeholder="https://idp.example.com/sso"
            />
          </FormField>

          <FormField label="X.509 Certificate" required hint="IdP's signing certificate (PEM format)">
            <Textarea
              value={formData.certificate || ''}
              onChange={(e) => updateField('certificate', e.target.value)}
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              rows={6}
              className="font-mono text-xs"
            />
          </FormField>

          <Toggle
            checked={formData.signRequests || false}
            onChange={(sign) => updateField('signRequests', sign)}
            label="Sign Authentication Requests"
            description="Sign SAML authentication requests sent to the IdP"
          />
        </div>
      )}

      {/* Attribute Mapping */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-text-primary">Attribute Mapping</h3>
        <p className="text-xs text-text-muted">Map provider attributes to user fields</p>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Email Attribute" required>
            <Input
              value={formData.attributeMapping?.email || ''}
              onChange={(e) => updateField('attributeMapping', { ...formData.attributeMapping!, email: e.target.value })}
              placeholder="email"
            />
          </FormField>
          <FormField label="Name Attribute">
            <Input
              value={formData.attributeMapping?.name || ''}
              onChange={(e) => updateField('attributeMapping', { ...formData.attributeMapping!, name: e.target.value })}
              placeholder="name"
            />
          </FormField>
          <FormField label="Avatar Attribute">
            <Input
              value={formData.attributeMapping?.avatar || ''}
              onChange={(e) => updateField('attributeMapping', { ...formData.attributeMapping!, avatar: e.target.value })}
              placeholder="picture"
            />
          </FormField>
          <FormField label="Groups Attribute">
            <Input
              value={formData.attributeMapping?.groups || ''}
              onChange={(e) => updateField('attributeMapping', { ...formData.attributeMapping!, groups: e.target.value })}
              placeholder="groups"
            />
          </FormField>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !formData.name}
          className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : mode === 'create' ? 'Add Provider' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}

export default ProviderForm;
