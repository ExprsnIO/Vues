'use client';

import { useState } from 'react';
import { FormField, Input, Toggle } from '@/components/admin/ui';

interface PDSConfig {
  // Repository Settings
  maxRepoSize: number;
  maxRecordSize: number;
  maxBlobSize: number;
  blobStorage: 'local' | 's3' | 'r2' | 'gcs';
  blobStorageConfig: Record<string, string>;

  // Handle Settings
  handleDomain: string;
  allowCustomHandles: boolean;
  reservedHandles: string[];

  // Signing
  signingKeyType: 'secp256k1' | 'ed25519';
  rotationKeyCount: number;

  // Rate Limits
  rateLimitRequests: number;
  rateLimitWindow: number;
  rateLimitBurst: number;

  // Federation
  federationEnabled: boolean;
  allowedRelays: string[];
  blockedRelays: string[];

  // Invites
  invitesRequired: boolean;
  inviteCodeExpiry: number;
  maxInvitesPerUser: number;
}

interface PDSConfigFormProps {
  config: Partial<PDSConfig>;
  onChange: (config: Partial<PDSConfig>) => void;
}

export function PDSConfigForm({ config, onChange }: PDSConfigFormProps) {
  const [showStorageConfig, setShowStorageConfig] = useState(false);

  const updateConfig = <K extends keyof PDSConfig>(key: K, value: PDSConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div className="space-y-6">
      {/* Repository Settings */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Repository Settings</h4>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="Max Repo Size" hint="Maximum repository size in MB">
            <Input
              type="number"
              min={1}
              value={config.maxRepoSize || 1000}
              onChange={(e) => updateConfig('maxRepoSize', parseInt(e.target.value))}
            />
          </FormField>

          <FormField label="Max Record Size" hint="Maximum record size in KB">
            <Input
              type="number"
              min={1}
              value={config.maxRecordSize || 1000}
              onChange={(e) => updateConfig('maxRecordSize', parseInt(e.target.value))}
            />
          </FormField>

          <FormField label="Max Blob Size" hint="Maximum blob size in MB">
            <Input
              type="number"
              min={1}
              value={config.maxBlobSize || 100}
              onChange={(e) => updateConfig('maxBlobSize', parseInt(e.target.value))}
            />
          </FormField>
        </div>

        <FormField label="Blob Storage Backend">
          <select
            value={config.blobStorage || 'local'}
            onChange={(e) => updateConfig('blobStorage', e.target.value as any)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="local">Local Filesystem</option>
            <option value="s3">Amazon S3</option>
            <option value="r2">Cloudflare R2</option>
            <option value="gcs">Google Cloud Storage</option>
          </select>
        </FormField>

        {config.blobStorage && config.blobStorage !== 'local' && (
          <button
            onClick={() => setShowStorageConfig(!showStorageConfig)}
            className="text-sm text-accent hover:underline"
          >
            {showStorageConfig ? 'Hide' : 'Configure'} storage settings
          </button>
        )}

        {showStorageConfig && config.blobStorage === 's3' && (
          <div className="p-4 bg-surface-hover rounded-lg space-y-3">
            <FormField label="Bucket Name">
              <Input
                value={config.blobStorageConfig?.bucket || ''}
                onChange={(e) => updateConfig('blobStorageConfig', { ...config.blobStorageConfig, bucket: e.target.value })}
                placeholder="my-pds-blobs"
              />
            </FormField>
            <FormField label="Region">
              <Input
                value={config.blobStorageConfig?.region || ''}
                onChange={(e) => updateConfig('blobStorageConfig', { ...config.blobStorageConfig, region: e.target.value })}
                placeholder="us-east-1"
              />
            </FormField>
            <FormField label="Access Key ID">
              <Input
                value={config.blobStorageConfig?.accessKeyId || ''}
                onChange={(e) => updateConfig('blobStorageConfig', { ...config.blobStorageConfig, accessKeyId: e.target.value })}
                placeholder="AKIA..."
              />
            </FormField>
            <FormField label="Secret Access Key">
              <Input
                type="password"
                value={config.blobStorageConfig?.secretAccessKey || ''}
                onChange={(e) => updateConfig('blobStorageConfig', { ...config.blobStorageConfig, secretAccessKey: e.target.value })}
                placeholder="••••••••"
              />
            </FormField>
          </div>
        )}
      </div>

      {/* Handle Settings */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Handle Settings</h4>

        <FormField label="Handle Domain" hint="Domain for user handles">
          <Input
            value={config.handleDomain || ''}
            onChange={(e) => updateConfig('handleDomain', e.target.value)}
            placeholder="example.com"
          />
        </FormField>

        <Toggle
          checked={config.allowCustomHandles ?? true}
          onChange={(v) => updateConfig('allowCustomHandles', v)}
          label="Allow Custom Handles"
          description="Users can use their own domain for handles"
        />

        <FormField label="Reserved Handles" hint="One handle per line">
          <textarea
            value={(config.reservedHandles || []).join('\n')}
            onChange={(e) => updateConfig('reservedHandles', e.target.value.split('\n').filter(Boolean))}
            placeholder="admin&#10;support&#10;help"
            rows={4}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </FormField>
      </div>

      {/* Signing Keys */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Signing Keys</h4>

        <FormField label="Signing Key Type">
          <select
            value={config.signingKeyType || 'secp256k1'}
            onChange={(e) => updateConfig('signingKeyType', e.target.value as any)}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="secp256k1">secp256k1 (Recommended)</option>
            <option value="ed25519">Ed25519</option>
          </select>
        </FormField>

        <FormField label="Rotation Key Count" hint="Number of rotation keys to maintain">
          <Input
            type="number"
            min={1}
            max={10}
            value={config.rotationKeyCount || 3}
            onChange={(e) => updateConfig('rotationKeyCount', parseInt(e.target.value))}
          />
        </FormField>
      </div>

      {/* Rate Limits */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Rate Limits</h4>

        <div className="grid grid-cols-3 gap-4">
          <FormField label="Requests per Window">
            <Input
              type="number"
              min={1}
              value={config.rateLimitRequests || 1000}
              onChange={(e) => updateConfig('rateLimitRequests', parseInt(e.target.value))}
            />
          </FormField>

          <FormField label="Window (seconds)">
            <Input
              type="number"
              min={1}
              value={config.rateLimitWindow || 60}
              onChange={(e) => updateConfig('rateLimitWindow', parseInt(e.target.value))}
            />
          </FormField>

          <FormField label="Burst Limit">
            <Input
              type="number"
              min={1}
              value={config.rateLimitBurst || 100}
              onChange={(e) => updateConfig('rateLimitBurst', parseInt(e.target.value))}
            />
          </FormField>
        </div>
      </div>

      {/* Federation */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Federation</h4>

        <Toggle
          checked={config.federationEnabled ?? true}
          onChange={(v) => updateConfig('federationEnabled', v)}
          label="Enable Federation"
          description="Allow this PDS to federate with relays"
        />

        {config.federationEnabled && (
          <>
            <FormField label="Allowed Relays" hint="One relay URL per line (empty = all allowed)">
              <textarea
                value={(config.allowedRelays || []).join('\n')}
                onChange={(e) => updateConfig('allowedRelays', e.target.value.split('\n').filter(Boolean))}
                placeholder="wss://relay.example.com"
                rows={3}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </FormField>

            <FormField label="Blocked Relays" hint="One relay URL per line">
              <textarea
                value={(config.blockedRelays || []).join('\n')}
                onChange={(e) => updateConfig('blockedRelays', e.target.value.split('\n').filter(Boolean))}
                placeholder="wss://blocked-relay.example.com"
                rows={3}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </FormField>
          </>
        )}
      </div>

      {/* Invites */}
      <div className="p-5 bg-surface border border-border rounded-xl space-y-4">
        <h4 className="font-medium text-text-primary">Invites</h4>

        <Toggle
          checked={config.invitesRequired ?? false}
          onChange={(v) => updateConfig('invitesRequired', v)}
          label="Require Invites"
          description="New users must have an invite code to register"
        />

        {config.invitesRequired && (
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Invite Code Expiry (days)">
              <Input
                type="number"
                min={1}
                value={config.inviteCodeExpiry || 7}
                onChange={(e) => updateConfig('inviteCodeExpiry', parseInt(e.target.value))}
              />
            </FormField>

            <FormField label="Max Invites per User">
              <Input
                type="number"
                min={0}
                value={config.maxInvitesPerUser || 5}
                onChange={(e) => updateConfig('maxInvitesPerUser', parseInt(e.target.value))}
              />
            </FormField>
          </div>
        )}
      </div>
    </div>
  );
}

export default PDSConfigForm;
