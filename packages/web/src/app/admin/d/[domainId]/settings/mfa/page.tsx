'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface MFASettings {
  enabled: boolean;
  required: boolean;
  methods: {
    totp: { enabled: boolean; required: boolean };
    sms: { enabled: boolean; required: boolean };
    email: { enabled: boolean; required: boolean };
    webauthn: { enabled: boolean; required: boolean };
    recovery: { enabled: boolean; codesCount: number };
  };
  gracePeriodDays: number;
  rememberDeviceDays: number;
  stats: {
    totalUsers: number;
    mfaEnabled: number;
    byMethod: {
      totp: number;
      sms: number;
      email: number;
      webauthn: number;
    };
  };
}

export default function DomainMFAPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<MFASettings>({
    queryKey: ['admin', 'domain', domainId, 'mfa-settings'],
    queryFn: async () => {
      // TODO: Replace with actual API call
      return {
        enabled: true,
        required: false,
        methods: {
          totp: { enabled: true, required: false },
          sms: { enabled: true, required: false },
          email: { enabled: true, required: false },
          webauthn: { enabled: true, required: false },
          recovery: { enabled: true, codesCount: 10 },
        },
        gracePeriodDays: 7,
        rememberDeviceDays: 30,
        stats: {
          totalUsers: 1500,
          mfaEnabled: 450,
          byMethod: {
            totp: 300,
            sms: 100,
            email: 30,
            webauthn: 20,
          },
        },
      };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<MFASettings>) => {
      // TODO: Replace with actual API call
      await new Promise((resolve) => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'mfa-settings'] });
    },
  });

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const mfaPercentage = Math.round((settings.stats.mfaEnabled / settings.stats.totalUsers) * 100);

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">MFA Adoption</p>
          <p className="text-2xl font-bold text-text-primary">{mfaPercentage}%</p>
          <p className="text-sm text-text-muted">
            {settings.stats.mfaEnabled} of {settings.stats.totalUsers} users
          </p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Authenticator App</p>
          <p className="text-2xl font-bold text-green-500">{settings.stats.byMethod.totp}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">SMS</p>
          <p className="text-2xl font-bold text-text-primary">{settings.stats.byMethod.sms}</p>
        </div>
        <div className="bg-surface p-4 rounded-lg border border-border">
          <p className="text-text-muted text-sm">Security Keys</p>
          <p className="text-2xl font-bold text-text-primary">{settings.stats.byMethod.webauthn}</p>
        </div>
      </div>

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
              checked={settings.enabled}
              onChange={() => updateMutation.mutate({ enabled: !settings.enabled })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-text-primary">Require MFA</p>
            <p className="text-sm text-text-muted">Force all users to set up MFA</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.required}
              onChange={() => updateMutation.mutate({ required: !settings.required })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
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
            onChange={(e) =>
              updateMutation.mutate({ gracePeriodDays: parseInt(e.target.value) })
            }
            min={0}
            max={30}
            className="w-32 px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

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
            onChange={(e) =>
              updateMutation.mutate({ rememberDeviceDays: parseInt(e.target.value) })
            }
            min={0}
            max={90}
            className="w-32 px-4 py-2 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      </div>

      {/* MFA Methods */}
      <div className="bg-surface border border-border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-text-primary">Authentication Methods</h2>

        {[
          {
            key: 'totp',
            name: 'Authenticator App (TOTP)',
            desc: 'Google Authenticator, Authy, etc.',
            icon: '🔐',
          },
          {
            key: 'sms',
            name: 'SMS',
            desc: 'Text message verification codes',
            icon: '📱',
          },
          {
            key: 'email',
            name: 'Email',
            desc: 'Verification codes via email',
            icon: '📧',
          },
          {
            key: 'webauthn',
            name: 'Security Keys (WebAuthn)',
            desc: 'Hardware security keys and passkeys',
            icon: '🔑',
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
                  checked={settings.methods[method.key as keyof typeof settings.methods].enabled}
                  onChange={() => {
                    const methodSettings =
                      settings.methods[method.key as keyof typeof settings.methods];
                    updateMutation.mutate({
                      methods: {
                        ...settings.methods,
                        [method.key]: {
                          ...methodSettings,
                          enabled: !methodSettings.enabled,
                        },
                      },
                    });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
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
                Backup codes for account recovery ({settings.methods.recovery.codesCount} codes)
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.methods.recovery.enabled}
              onChange={() => {
                updateMutation.mutate({
                  methods: {
                    ...settings.methods,
                    recovery: {
                      ...settings.methods.recovery,
                      enabled: !settings.methods.recovery.enabled,
                    },
                  },
                });
              }}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
          </label>
        </div>
      </div>
    </div>
  );
}
