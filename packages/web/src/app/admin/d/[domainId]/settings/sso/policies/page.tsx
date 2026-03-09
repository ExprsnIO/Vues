'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import {
  PageHeader,
  Badge,
  Toggle,
  FormField,
  Input,
  PageSkeleton,
} from '@/components/admin/ui';
import { SessionPolicyEditor } from '@/components/admin/sso';

interface SSOPolicies {
  // Session
  sessionTimeout: number;
  sessionTimeoutUnit: 'minutes' | 'hours' | 'days';
  idleTimeout: number;
  idleTimeoutUnit: 'minutes' | 'hours';
  maxConcurrentSessions: number;
  singleSessionEnforcement: boolean;

  // MFA
  mfaRequired: boolean;
  mfaGracePeriod: number;
  mfaMethods: string[];

  // Device Trust
  deviceTrustEnabled: boolean;
  allowUnknownDevices: boolean;
  requireDeviceApproval: boolean;

  // IP Restrictions
  ipRestrictionEnabled: boolean;
  allowedIPs: string[];
  blockedIPs: string[];

  // Risk-Based
  riskBasedAuthEnabled: boolean;
  highRiskActions: string[];

  // SSO Enforcement
  ssoEnforced: boolean;
  passwordLoginAllowed: boolean;
  passwordLoginAdminsOnly: boolean;
}

export default function SSOPoliciesPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [hasChanges, setHasChanges] = useState(false);
  const [policies, setPolicies] = useState<Partial<SSOPolicies>>({});

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'policies'],
    queryFn: () => api.adminDomainSSOPoliciesGet(domainId),
    enabled: !!domainId,
  });

  useEffect(() => {
    if (data?.policies) {
      setPolicies(data.policies);
    }
  }, [data?.policies]);

  const saveMutation = useMutation({
    mutationFn: (policies: Partial<SSOPolicies>) =>
      api.adminDomainSSOPoliciesUpdate(domainId, policies),
    onSuccess: () => {
      toast.success('Policies saved');
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
    },
    onError: () => {
      toast.error('Failed to save policies');
    },
  });

  const updatePolicy = <K extends keyof SSOPolicies>(key: K, value: SSOPolicies[K]) => {
    setPolicies(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Session Policies"
        description={`Authentication and session policies for ${selectedDomain?.name || 'this domain'}`}
        actions={
          <button
            onClick={() => saveMutation.mutate(policies)}
            disabled={!hasChanges || saveMutation.isPending}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        }
      />

      {hasChanges && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-sm text-yellow-500">You have unsaved changes</p>
        </div>
      )}

      {/* SSO Enforcement */}
      <div className="p-6 bg-surface border border-border rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">SSO Enforcement</h3>
            <p className="text-sm text-text-muted mt-1">Control how users can authenticate</p>
          </div>
          <Badge variant={policies.ssoEnforced ? 'info' : 'default'}>
            {policies.ssoEnforced ? 'Required' : 'Optional'}
          </Badge>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <Toggle
            checked={policies.ssoEnforced ?? false}
            onChange={(v) => updatePolicy('ssoEnforced', v)}
            label="Require SSO"
            description="Users must authenticate via SSO to access this domain"
          />

          {!policies.ssoEnforced && (
            <>
              <Toggle
                checked={policies.passwordLoginAllowed ?? true}
                onChange={(v) => updatePolicy('passwordLoginAllowed', v)}
                label="Allow Password Login"
                description="Users can sign in with email and password"
              />

              {policies.passwordLoginAllowed && (
                <Toggle
                  checked={policies.passwordLoginAdminsOnly ?? false}
                  onChange={(v) => updatePolicy('passwordLoginAdminsOnly', v)}
                  label="Password Login for Admins Only"
                  description="Only administrators can use password login"
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Session Settings */}
      <div className="p-6 bg-surface border border-border rounded-xl space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Session Settings</h3>
          <p className="text-sm text-text-muted mt-1">Configure session timeouts and limits</p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
          <FormField label="Session Timeout">
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={policies.sessionTimeout || 24}
                onChange={(e) => updatePolicy('sessionTimeout', parseInt(e.target.value))}
                className="flex-1"
              />
              <select
                value={policies.sessionTimeoutUnit || 'hours'}
                onChange={(e) => updatePolicy('sessionTimeoutUnit', e.target.value as any)}
                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          </FormField>

          <FormField label="Idle Timeout">
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={policies.idleTimeout || 30}
                onChange={(e) => updatePolicy('idleTimeout', parseInt(e.target.value))}
                className="flex-1"
              />
              <select
                value={policies.idleTimeoutUnit || 'minutes'}
                onChange={(e) => updatePolicy('idleTimeoutUnit', e.target.value as any)}
                className="px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>
          </FormField>

          <FormField label="Max Concurrent Sessions" hint="0 for unlimited">
            <Input
              type="number"
              min={0}
              value={policies.maxConcurrentSessions || 0}
              onChange={(e) => updatePolicy('maxConcurrentSessions', parseInt(e.target.value))}
            />
          </FormField>

          <div className="flex items-end pb-2">
            <Toggle
              checked={policies.singleSessionEnforcement ?? false}
              onChange={(v) => updatePolicy('singleSessionEnforcement', v)}
              label="Single Session Only"
              description="Terminate other sessions on new login"
            />
          </div>
        </div>
      </div>

      {/* MFA Settings */}
      <div className="p-6 bg-surface border border-border rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Multi-Factor Authentication</h3>
            <p className="text-sm text-text-muted mt-1">Configure MFA requirements</p>
          </div>
          <Badge variant={policies.mfaRequired ? 'success' : 'default'}>
            {policies.mfaRequired ? 'Required' : 'Optional'}
          </Badge>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <Toggle
            checked={policies.mfaRequired ?? false}
            onChange={(v) => updatePolicy('mfaRequired', v)}
            label="Require MFA"
            description="All users must set up multi-factor authentication"
          />

          {policies.mfaRequired && (
            <FormField label="Grace Period (days)" hint="Days before MFA becomes mandatory for existing users">
              <Input
                type="number"
                min={0}
                value={policies.mfaGracePeriod || 7}
                onChange={(e) => updatePolicy('mfaGracePeriod', parseInt(e.target.value))}
                className="w-32"
              />
            </FormField>
          )}

          <div>
            <p className="text-sm font-medium text-text-primary mb-3">Allowed MFA Methods</p>
            <div className="flex flex-wrap gap-2">
              {['totp', 'sms', 'email', 'webauthn', 'backup_codes'].map((method) => (
                <button
                  key={method}
                  onClick={() => {
                    const current = policies.mfaMethods || ['totp', 'backup_codes'];
                    if (current.includes(method)) {
                      updatePolicy('mfaMethods', current.filter(m => m !== method));
                    } else {
                      updatePolicy('mfaMethods', [...current, method]);
                    }
                  }}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    (policies.mfaMethods || ['totp', 'backup_codes']).includes(method)
                      ? 'bg-accent text-text-inverse border-accent'
                      : 'bg-surface border-border hover:border-accent/50'
                  }`}
                >
                  {method === 'totp' ? 'Authenticator App' :
                   method === 'sms' ? 'SMS' :
                   method === 'email' ? 'Email' :
                   method === 'webauthn' ? 'Security Key' : 'Backup Codes'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Device Trust */}
      <div className="p-6 bg-surface border border-border rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Device Trust</h3>
            <p className="text-sm text-text-muted mt-1">Manage trusted devices and access</p>
          </div>
          <Badge variant={policies.deviceTrustEnabled ? 'success' : 'default'}>
            {policies.deviceTrustEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <Toggle
            checked={policies.deviceTrustEnabled ?? false}
            onChange={(v) => updatePolicy('deviceTrustEnabled', v)}
            label="Enable Device Trust"
            description="Track and manage trusted devices"
          />

          {policies.deviceTrustEnabled && (
            <>
              <Toggle
                checked={policies.allowUnknownDevices ?? true}
                onChange={(v) => updatePolicy('allowUnknownDevices', v)}
                label="Allow Unknown Devices"
                description="Users can sign in from new devices"
              />

              <Toggle
                checked={policies.requireDeviceApproval ?? false}
                onChange={(v) => updatePolicy('requireDeviceApproval', v)}
                label="Require Device Approval"
                description="New devices require admin approval"
              />
            </>
          )}
        </div>
      </div>

      {/* IP Restrictions */}
      <div className="p-6 bg-surface border border-border rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">IP Restrictions</h3>
            <p className="text-sm text-text-muted mt-1">Restrict access by IP address</p>
          </div>
          <Badge variant={policies.ipRestrictionEnabled ? 'warning' : 'default'}>
            {policies.ipRestrictionEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <Toggle
            checked={policies.ipRestrictionEnabled ?? false}
            onChange={(v) => updatePolicy('ipRestrictionEnabled', v)}
            label="Enable IP Restrictions"
            description="Limit access to specific IP addresses or ranges"
          />

          {policies.ipRestrictionEnabled && (
            <>
              <FormField label="Allowed IP Addresses" hint="One IP or CIDR range per line">
                <textarea
                  value={(policies.allowedIPs || []).join('\n')}
                  onChange={(e) => updatePolicy('allowedIPs', e.target.value.split('\n').filter(Boolean))}
                  placeholder="192.168.1.0/24&#10;10.0.0.1"
                  rows={4}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </FormField>

              <FormField label="Blocked IP Addresses" hint="One IP or CIDR range per line">
                <textarea
                  value={(policies.blockedIPs || []).join('\n')}
                  onChange={(e) => updatePolicy('blockedIPs', e.target.value.split('\n').filter(Boolean))}
                  placeholder="1.2.3.4&#10;5.6.7.0/24"
                  rows={4}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </FormField>
            </>
          )}
        </div>
      </div>

      {/* Risk-Based Authentication */}
      <div className="p-6 bg-surface border border-border rounded-xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Risk-Based Authentication</h3>
            <p className="text-sm text-text-muted mt-1">Adaptive authentication based on risk signals</p>
          </div>
          <Badge variant={policies.riskBasedAuthEnabled ? 'info' : 'default'}>
            {policies.riskBasedAuthEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <Toggle
            checked={policies.riskBasedAuthEnabled ?? false}
            onChange={(v) => updatePolicy('riskBasedAuthEnabled', v)}
            label="Enable Risk-Based Auth"
            description="Require additional verification for high-risk actions"
          />

          {policies.riskBasedAuthEnabled && (
            <div>
              <p className="text-sm font-medium text-text-primary mb-3">High-Risk Actions (Require Re-auth)</p>
              <div className="flex flex-wrap gap-2">
                {['password_change', 'email_change', 'mfa_change', 'api_key_create', 'admin_action', 'data_export'].map((action) => (
                  <button
                    key={action}
                    onClick={() => {
                      const current = policies.highRiskActions || ['password_change', 'mfa_change'];
                      if (current.includes(action)) {
                        updatePolicy('highRiskActions', current.filter(a => a !== action));
                      } else {
                        updatePolicy('highRiskActions', [...current, action]);
                      }
                    }}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      (policies.highRiskActions || ['password_change', 'mfa_change']).includes(action)
                        ? 'bg-accent text-text-inverse border-accent'
                        : 'bg-surface border-border hover:border-accent/50'
                    }`}
                  >
                    {action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Button (bottom) */}
      {hasChanges && (
        <div className="flex justify-end">
          <button
            onClick={() => saveMutation.mutate(policies)}
            disabled={saveMutation.isPending}
            className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
