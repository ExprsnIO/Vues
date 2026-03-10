'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface MFASettings {
  id: string;
  domainId: string;
  mfaMode: string;
  allowedMethods: string[];
  totpEnabled: boolean;
  totpIssuer?: string;
  totpDigits: number;
  totpPeriod: number;
  totpAlgorithm: string;
  webauthnEnabled: boolean;
  webauthnRpName?: string;
  webauthnRpId?: string;
  webauthnUserVerification: string;
  webauthnAttachment: string;
  smsEnabled: boolean;
  smsProvider?: string;
  smsConfig?: Record<string, unknown>;
  emailOtpEnabled: boolean;
  emailOtpExpiryMinutes: number;
  backupCodesEnabled: boolean;
  backupCodesCount: number;
  gracePeriodDays: number;
  rememberDeviceEnabled: boolean;
  rememberDeviceDays: number;
  recoveryEmailRequired: boolean;
  totalUsersEnrolled: number;
  totpEnrolledCount: number;
  webauthnEnrolledCount: number;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface MFAStats {
  totalUsers: number;
  enrolledUsers: number;
  unenrolledUsers: number;
  adoptionRate: number;
  byMethod: {
    totp: number;
    webauthn: number;
  };
  mfaMode: string;
  enabledMethods: string[];
}

export default function DomainMFAPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const queryClient = useQueryClient();

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'mfa-settings'],
    queryFn: async () => api.adminDomainMFAGet(domainId),
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'mfa-stats'],
    queryFn: async () => api.adminDomainMFAStats(domainId),
  });

  const settings = settingsData?.settings;
  const stats = statsData?.stats;

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<MFASettings>) => {
      return api.adminDomainMFAUpdate(domainId, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'mfa-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'mfa-stats'] });
    },
  });

  const handleToggleMFA = (enabled: boolean) => {
    updateMutation.mutate({ mfaMode: enabled ? 'optional' : 'disabled' });
  };

  const handleRequireMFA = (required: boolean) => {
    updateMutation.mutate({ mfaMode: required ? 'required' : 'optional' });
  };

  const handleUpdateGracePeriod = (days: number) => {
    updateMutation.mutate({ gracePeriodDays: days });
  };

  const handleUpdateRememberDevice = (days: number) => {
    updateMutation.mutate({ rememberDeviceDays: days });
  };

  const handleToggleMethod = (method: 'totp' | 'webauthn' | 'sms' | 'emailOtp', enabled: boolean) => {
    const updates: any = {};

    switch (method) {
      case 'totp':
        updates.totpEnabled = enabled;
        break;
      case 'webauthn':
        updates.webauthnEnabled = enabled;
        break;
      case 'sms':
        updates.smsEnabled = enabled;
        break;
      case 'emailOtp':
        updates.emailOtpEnabled = enabled;
        break;
    }

    updateMutation.mutate(updates);
  };

  const handleToggleBackupCodes = (enabled: boolean) => {
    updateMutation.mutate({ backupCodesEnabled: enabled });
  };

  const handleToggleRememberDevice = (enabled: boolean) => {
    updateMutation.mutate({ rememberDeviceEnabled: enabled });
  };

  if (settingsLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const mfaEnabled = settings.mfaMode !== 'disabled';
  const mfaRequired = settings.mfaMode === 'required';
  const mfaPercentage = stats ? Math.round(stats.adoptionRate) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">MFA Settings</h1>
          <p className="text-text-muted mt-1">
            Configure multi-factor authentication for this domain
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-surface p-4 rounded-lg border border-border">
            <p className="text-text-muted text-sm">MFA Adoption</p>
            <p className="text-2xl font-bold text-text-primary">{mfaPercentage}%</p>
            <p className="text-sm text-text-muted">
              {stats.enrolledUsers} of {stats.totalUsers} users
            </p>
          </div>
          <div className="bg-surface p-4 rounded-lg border border-border">
            <p className="text-text-muted text-sm">Authenticator App</p>
            <p className="text-2xl font-bold text-green-500">{stats.byMethod.totp}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg border border-border">
            <p className="text-text-muted text-sm">Security Keys</p>
            <p className="text-2xl font-bold text-text-primary">{stats.byMethod.webauthn}</p>
          </div>
          <div className="bg-surface p-4 rounded-lg border border-border">
            <p className="text-text-muted text-sm">Not Enrolled</p>
            <p className="text-2xl font-bold text-orange-500">{stats.unenrolledUsers}</p>
          </div>
        </div>
      )}

      {/* Global MFA Settings */}
      <div className="bg-surface border border-border rounded-lg p-6 space-y-6">
        <h2 className="text-lg font-semibold text-text-primary">Global Settings</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-text-primary">Enable MFA</p>
            <p className="text-sm text-text-muted">Allow users to set up MFA</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={mfaEnabled}
              onChange={(e) => handleToggleMFA(e.target.checked)}
              disabled={updateMutation.isPending}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50"></div>
          </label>
        </div>

        {mfaEnabled && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text-primary">Require MFA</p>
                <p className="text-sm text-text-muted">Force all users to set up MFA</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={mfaRequired}
                  onChange={(e) => handleRequireMFA(e.target.checked)}
                  disabled={updateMutation.isPending}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50"></div>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Grace Period (days)
              </label>
              <p className="text-sm text-text-muted mb-2">
                Time allowed for users to set up MFA when required
              </p>
              <input
                type="number"
                value={settings.gracePeriodDays}
                onChange={(e) => handleUpdateGracePeriod(parseInt(e.target.value))}
                onBlur={(e) => handleUpdateGracePeriod(parseInt(e.target.value))}
                disabled={updateMutation.isPending}
                min={0}
                max={30}
                className="w-32 px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text-primary">Remember Device</p>
                <p className="text-sm text-text-muted">Allow users to trust devices</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.rememberDeviceEnabled}
                  onChange={(e) => handleToggleRememberDevice(e.target.checked)}
                  disabled={updateMutation.isPending}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50"></div>
              </label>
            </div>

            {settings.rememberDeviceEnabled && (
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Remember Device (days)
                </label>
                <p className="text-sm text-text-muted mb-2">
                  How long to trust a device without re-verification
                </p>
                <input
                  type="number"
                  value={settings.rememberDeviceDays}
                  onChange={(e) => handleUpdateRememberDevice(parseInt(e.target.value))}
                  onBlur={(e) => handleUpdateRememberDevice(parseInt(e.target.value))}
                  disabled={updateMutation.isPending}
                  min={0}
                  max={90}
                  className="w-32 px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* MFA Methods */}
      {mfaEnabled && (
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">Authentication Methods</h2>

          {[
            {
              key: 'totp',
              name: 'Authenticator App (TOTP)',
              desc: 'Google Authenticator, Authy, etc.',
              icon: '🔐',
              enabled: settings.totpEnabled,
            },
            {
              key: 'sms',
              name: 'SMS',
              desc: 'Text message verification codes',
              icon: '📱',
              enabled: settings.smsEnabled,
            },
            {
              key: 'emailOtp',
              name: 'Email',
              desc: 'Verification codes via email',
              icon: '📧',
              enabled: settings.emailOtpEnabled,
            },
            {
              key: 'webauthn',
              name: 'Security Keys (WebAuthn)',
              desc: 'Hardware security keys and passkeys',
              icon: '🔑',
              enabled: settings.webauthnEnabled,
            },
          ].map((method) => (
            <div
              key={method.key}
              className="flex items-center justify-between p-4 bg-background rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{method.icon}</span>
                <div>
                  <p className="font-medium text-text-primary">{method.name}</p>
                  <p className="text-sm text-text-muted">{method.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={method.enabled}
                    onChange={(e) =>
                      handleToggleMethod(method.key as any, e.target.checked)
                    }
                    disabled={updateMutation.isPending}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50"></div>
                </label>
              </div>
            </div>
          ))}

          {/* Recovery Codes */}
          <div className="flex items-center justify-between p-4 bg-background rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔄</span>
              <div>
                <p className="font-medium text-text-primary">Recovery Codes</p>
                <p className="text-sm text-text-muted">
                  Backup codes for account recovery ({settings.backupCodesCount} codes)
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.backupCodesEnabled}
                onChange={(e) => handleToggleBackupCodes(e.target.checked)}
                disabled={updateMutation.isPending}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50"></div>
            </label>
          </div>
        </div>
      )}

      {/* Advanced Settings */}
      {mfaEnabled && settings.totpEnabled && (
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">TOTP Settings</h2>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Digits
              </label>
              <select
                value={settings.totpDigits}
                onChange={(e) => updateMutation.mutate({ totpDigits: parseInt(e.target.value) })}
                disabled={updateMutation.isPending}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="6">6 digits</option>
                <option value="8">8 digits</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Period (seconds)
              </label>
              <select
                value={settings.totpPeriod}
                onChange={(e) => updateMutation.mutate({ totpPeriod: parseInt(e.target.value) })}
                disabled={updateMutation.isPending}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="30">30 seconds</option>
                <option value="60">60 seconds</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Algorithm
              </label>
              <select
                value={settings.totpAlgorithm}
                onChange={(e) => updateMutation.mutate({ totpAlgorithm: e.target.value })}
                disabled={updateMutation.isPending}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="SHA1">SHA1</option>
                <option value="SHA256">SHA256</option>
                <option value="SHA512">SHA512</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Issuer Name
            </label>
            <p className="text-sm text-text-muted mb-2">
              Display name shown in authenticator apps
            </p>
            <input
              type="text"
              value={settings.totpIssuer || ''}
              onChange={(e) => updateMutation.mutate({ totpIssuer: e.target.value })}
              onBlur={(e) => updateMutation.mutate({ totpIssuer: e.target.value })}
              disabled={updateMutation.isPending}
              placeholder="Exprsn"
              className="w-full max-w-md px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {mfaEnabled && settings.webauthnEnabled && (
        <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">WebAuthn Settings</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Relying Party Name
              </label>
              <input
                type="text"
                value={settings.webauthnRpName || ''}
                onChange={(e) => updateMutation.mutate({ webauthnRpName: e.target.value })}
                onBlur={(e) => updateMutation.mutate({ webauthnRpName: e.target.value })}
                disabled={updateMutation.isPending}
                placeholder="Exprsn"
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Relying Party ID
              </label>
              <input
                type="text"
                value={settings.webauthnRpId || ''}
                onChange={(e) => updateMutation.mutate({ webauthnRpId: e.target.value })}
                onBlur={(e) => updateMutation.mutate({ webauthnRpId: e.target.value })}
                disabled={updateMutation.isPending}
                placeholder="exprsn.com"
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                User Verification
              </label>
              <select
                value={settings.webauthnUserVerification}
                onChange={(e) => updateMutation.mutate({ webauthnUserVerification: e.target.value })}
                disabled={updateMutation.isPending}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="preferred">Preferred</option>
                <option value="required">Required</option>
                <option value="discouraged">Discouraged</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Authenticator Attachment
              </label>
              <select
                value={settings.webauthnAttachment}
                onChange={(e) => updateMutation.mutate({ webauthnAttachment: e.target.value })}
                disabled={updateMutation.isPending}
                className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
              >
                <option value="cross-platform">Cross-platform</option>
                <option value="platform">Platform</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {updateMutation.isPending && (
        <div className="fixed bottom-4 right-4 bg-accent text-text-inverse px-4 py-2 rounded-lg shadow-lg">
          Saving changes...
        </div>
      )}
    </div>
  );
}
