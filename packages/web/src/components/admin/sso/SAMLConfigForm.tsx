'use client';

import { useState } from 'react';
import { FormField, Input, Toggle, Textarea, Badge } from '@/components/admin/ui';

interface SAMLConfig {
  entityId: string;
  ssoUrl: string;
  sloUrl?: string;
  certificate: string;
  signRequests: boolean;
  signatureAlgorithm: 'rsa-sha256' | 'rsa-sha512';
  digestAlgorithm: 'sha256' | 'sha512';
  nameIdFormat: string;
  assertionConsumerServiceUrl?: string;
  wantAssertionsSigned: boolean;
  wantResponseSigned: boolean;
  allowUnsolicitedResponse: boolean;
}

interface SAMLConfigFormProps {
  config: Partial<SAMLConfig>;
  onChange: (config: Partial<SAMLConfig>) => void;
  spMetadata?: {
    entityId: string;
    acsUrl: string;
    sloUrl: string;
    certificate: string;
  };
}

const NAME_ID_FORMATS = [
  { value: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress', label: 'Email Address' },
  { value: 'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified', label: 'Unspecified' },
  { value: 'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent', label: 'Persistent' },
  { value: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient', label: 'Transient' },
];

export function SAMLConfigForm({ config, onChange, spMetadata }: SAMLConfigFormProps) {
  const [showMetadata, setShowMetadata] = useState(false);

  const updateConfig = <K extends keyof SAMLConfig>(key: K, value: SAMLConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      {/* SP Metadata */}
      {spMetadata && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-blue-500">Service Provider Metadata</p>
              <p className="text-xs text-text-muted">Configure your IdP with these values</p>
            </div>
            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className="text-sm text-blue-500 hover:underline"
            >
              {showMetadata ? 'Hide' : 'Show'}
            </button>
          </div>

          {showMetadata && (
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between p-2 bg-surface rounded">
                <div>
                  <p className="text-xs text-text-muted">Entity ID</p>
                  <p className="text-sm font-mono text-text-primary">{spMetadata.entityId}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(spMetadata.entityId)}
                  className="p-1.5 hover:bg-surface-hover rounded transition-colors"
                >
                  <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center justify-between p-2 bg-surface rounded">
                <div>
                  <p className="text-xs text-text-muted">ACS URL</p>
                  <p className="text-sm font-mono text-text-primary">{spMetadata.acsUrl}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(spMetadata.acsUrl)}
                  className="p-1.5 hover:bg-surface-hover rounded transition-colors"
                >
                  <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <button
                onClick={() => window.open(`/api/sso/saml/metadata`, '_blank')}
                className="w-full px-3 py-2 text-sm text-blue-500 hover:bg-blue-500/10 rounded transition-colors"
              >
                Download SP Metadata XML
              </button>
            </div>
          )}
        </div>
      )}

      {/* IdP Configuration */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-text-primary">Identity Provider Configuration</h4>

        <FormField label="IdP Entity ID" required hint="The Identity Provider's unique identifier">
          <Input
            value={config.entityId || ''}
            onChange={(e) => updateConfig('entityId', e.target.value)}
            placeholder="https://idp.example.com/metadata"
          />
        </FormField>

        <FormField label="SSO URL" required hint="Single Sign-On service endpoint">
          <Input
            value={config.ssoUrl || ''}
            onChange={(e) => updateConfig('ssoUrl', e.target.value)}
            placeholder="https://idp.example.com/sso"
          />
        </FormField>

        <FormField label="SLO URL" hint="Single Logout service endpoint (optional)">
          <Input
            value={config.sloUrl || ''}
            onChange={(e) => updateConfig('sloUrl', e.target.value)}
            placeholder="https://idp.example.com/slo"
          />
        </FormField>

        <FormField label="IdP Certificate" required hint="X.509 certificate in PEM format">
          <Textarea
            value={config.certificate || ''}
            onChange={(e) => updateConfig('certificate', e.target.value)}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            rows={6}
            className="font-mono text-xs"
          />
        </FormField>
      </div>

      {/* NameID Format */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-text-primary">NameID Configuration</h4>

        <FormField label="NameID Format">
          <select
            value={config.nameIdFormat || NAME_ID_FORMATS[0].value}
            onChange={(e) => updateConfig('nameIdFormat', e.target.value)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {NAME_ID_FORMATS.map(format => (
              <option key={format.value} value={format.value}>{format.label}</option>
            ))}
          </select>
        </FormField>
      </div>

      {/* Signing Configuration */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-text-primary">Signing & Security</h4>

        <Toggle
          checked={config.signRequests ?? false}
          onChange={(sign) => updateConfig('signRequests', sign)}
          label="Sign Authentication Requests"
          description="Sign SAML AuthnRequest messages sent to the IdP"
        />

        {config.signRequests && (
          <div className="grid grid-cols-2 gap-4 pl-6">
            <FormField label="Signature Algorithm">
              <select
                value={config.signatureAlgorithm || 'rsa-sha256'}
                onChange={(e) => updateConfig('signatureAlgorithm', e.target.value as any)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="rsa-sha256">RSA-SHA256</option>
                <option value="rsa-sha512">RSA-SHA512</option>
              </select>
            </FormField>
            <FormField label="Digest Algorithm">
              <select
                value={config.digestAlgorithm || 'sha256'}
                onChange={(e) => updateConfig('digestAlgorithm', e.target.value as any)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="sha256">SHA-256</option>
                <option value="sha512">SHA-512</option>
              </select>
            </FormField>
          </div>
        )}

        <Toggle
          checked={config.wantAssertionsSigned ?? true}
          onChange={(want) => updateConfig('wantAssertionsSigned', want)}
          label="Require Signed Assertions"
          description="Require the IdP to sign SAML assertions"
        />

        <Toggle
          checked={config.wantResponseSigned ?? true}
          onChange={(want) => updateConfig('wantResponseSigned', want)}
          label="Require Signed Responses"
          description="Require the IdP to sign SAML responses"
        />

        <Toggle
          checked={config.allowUnsolicitedResponse ?? false}
          onChange={(allow) => updateConfig('allowUnsolicitedResponse', allow)}
          label="Allow IdP-Initiated SSO"
          description="Accept unsolicited SAML responses from the IdP"
        />
      </div>
    </div>
  );
}

export default SAMLConfigForm;
