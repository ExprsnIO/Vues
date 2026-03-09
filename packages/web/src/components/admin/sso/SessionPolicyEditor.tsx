'use client';

import { FormField, Input, Toggle, Select } from '@/components/admin/ui';

interface SessionPolicy {
  sessionTimeout: number;
  idleTimeout: number;
  maxConcurrentSessions: number;
  rememberMe: {
    enabled: boolean;
    duration: number;
  };
  mfa: {
    required: boolean;
    allowedMethods: ('totp' | 'sms' | 'email' | 'webauthn')[];
    rememberDevice: boolean;
    rememberDuration: number;
  };
  deviceTrust: {
    enabled: boolean;
    requireKnownDevice: boolean;
    allowNewDevices: boolean;
  };
  ipRestrictions: {
    enabled: boolean;
    allowedRanges: string[];
    denyRanges: string[];
  };
}

interface SessionPolicyEditorProps {
  policy: Partial<SessionPolicy>;
  onChange: (policy: Partial<SessionPolicy>) => void;
}

const TIME_OPTIONS = [
  { value: 900, label: '15 minutes' },
  { value: 1800, label: '30 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 7200, label: '2 hours' },
  { value: 14400, label: '4 hours' },
  { value: 28800, label: '8 hours' },
  { value: 86400, label: '24 hours' },
  { value: 604800, label: '7 days' },
  { value: 2592000, label: '30 days' },
];

const MFA_METHODS = [
  { value: 'totp', label: 'Authenticator App (TOTP)', icon: '📱' },
  { value: 'sms', label: 'SMS Code', icon: '💬' },
  { value: 'email', label: 'Email Code', icon: '📧' },
  { value: 'webauthn', label: 'Security Key (WebAuthn)', icon: '🔑' },
];

export function SessionPolicyEditor({ policy, onChange }: SessionPolicyEditorProps) {
  const updatePolicy = <K extends keyof SessionPolicy>(key: K, value: SessionPolicy[K]) => {
    onChange({ ...policy, [key]: value });
  };

  const updateMFA = <K extends keyof SessionPolicy['mfa']>(key: K, value: SessionPolicy['mfa'][K]) => {
    onChange({
      ...policy,
      mfa: { ...policy.mfa!, [key]: value },
    });
  };

  const toggleMFAMethod = (method: 'totp' | 'sms' | 'email' | 'webauthn') => {
    const current = policy.mfa?.allowedMethods || [];
    if (current.includes(method)) {
      updateMFA('allowedMethods', current.filter(m => m !== method));
    } else {
      updateMFA('allowedMethods', [...current, method]);
    }
  };

  return (
    <div className="space-y-8">
      {/* Session Timeouts */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Session Management</h3>
          <p className="text-sm text-text-muted">Configure session duration and timeout policies</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Session Timeout" hint="Maximum session duration">
            <Select
              value={policy.sessionTimeout || 86400}
              onChange={(e: any) => updatePolicy('sessionTimeout', parseInt(e.target.value))}
            >
              {TIME_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </FormField>

          <FormField label="Idle Timeout" hint="Time until inactive session expires">
            <Select
              value={policy.idleTimeout || 1800}
              onChange={(e: any) => updatePolicy('idleTimeout', parseInt(e.target.value))}
            >
              {TIME_OPTIONS.filter(o => o.value <= 28800).map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Select>
          </FormField>
        </div>

        <FormField label="Maximum Concurrent Sessions" hint="0 for unlimited">
          <Input
            type="number"
            value={policy.maxConcurrentSessions ?? 5}
            onChange={(e) => updatePolicy('maxConcurrentSessions', parseInt(e.target.value) || 0)}
            min={0}
            max={100}
          />
        </FormField>

        <div className="p-4 bg-surface-hover rounded-lg space-y-3">
          <Toggle
            checked={policy.rememberMe?.enabled ?? true}
            onChange={(enabled) => updatePolicy('rememberMe', { ...policy.rememberMe!, enabled })}
            label="Remember Me"
            description="Allow users to stay signed in across browser sessions"
          />
          {policy.rememberMe?.enabled && (
            <FormField label="Remember Duration">
              <Select
                value={policy.rememberMe?.duration || 2592000}
                onChange={(e: any) => updatePolicy('rememberMe', {
                  ...policy.rememberMe!,
                  duration: parseInt(e.target.value),
                })}
              >
                {TIME_OPTIONS.filter(o => o.value >= 86400).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Select>
            </FormField>
          )}
        </div>
      </div>

      {/* MFA Configuration */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Multi-Factor Authentication</h3>
          <p className="text-sm text-text-muted">Require additional verification for enhanced security</p>
        </div>

        <Toggle
          checked={policy.mfa?.required ?? false}
          onChange={(required) => updateMFA('required', required)}
          label="Require MFA"
          description="Require all users to set up multi-factor authentication"
        />

        {(policy.mfa?.required || (policy.mfa?.allowedMethods && policy.mfa.allowedMethods.length > 0)) && (
          <div className="space-y-4 pl-4 border-l-2 border-accent">
            <FormField label="Allowed Methods">
              <div className="grid grid-cols-2 gap-3">
                {MFA_METHODS.map(method => (
                  <button
                    key={method.value}
                    onClick={() => toggleMFAMethod(method.value as any)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                      (policy.mfa?.allowedMethods || []).includes(method.value as any)
                        ? 'bg-accent/10 border-accent'
                        : 'bg-surface border-border hover:border-accent/50'
                    }`}
                  >
                    <span className="text-xl">{method.icon}</span>
                    <span className="text-sm text-text-primary">{method.label}</span>
                  </button>
                ))}
              </div>
            </FormField>

            <div className="p-4 bg-surface-hover rounded-lg space-y-3">
              <Toggle
                checked={policy.mfa?.rememberDevice ?? true}
                onChange={(remember) => updateMFA('rememberDevice', remember)}
                label="Remember Trusted Devices"
                description="Skip MFA on recognized devices"
              />
              {policy.mfa?.rememberDevice && (
                <FormField label="Trust Duration">
                  <Select
                    value={policy.mfa?.rememberDuration || 2592000}
                    onChange={(e: any) => updateMFA('rememberDuration', parseInt(e.target.value))}
                  >
                    <option value={86400}>1 day</option>
                    <option value={604800}>7 days</option>
                    <option value={2592000}>30 days</option>
                    <option value={7776000}>90 days</option>
                  </Select>
                </FormField>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Device Trust */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Device Trust</h3>
          <p className="text-sm text-text-muted">Control access based on device recognition</p>
        </div>

        <Toggle
          checked={policy.deviceTrust?.enabled ?? false}
          onChange={(enabled) => updatePolicy('deviceTrust', { ...policy.deviceTrust!, enabled })}
          label="Enable Device Trust"
          description="Track and manage trusted devices"
        />

        {policy.deviceTrust?.enabled && (
          <div className="space-y-3 pl-4 border-l-2 border-accent">
            <Toggle
              checked={policy.deviceTrust?.requireKnownDevice ?? false}
              onChange={(require) => updatePolicy('deviceTrust', {
                ...policy.deviceTrust!,
                requireKnownDevice: require,
              })}
              label="Require Known Device"
              description="Only allow login from previously registered devices"
            />
            <Toggle
              checked={policy.deviceTrust?.allowNewDevices ?? true}
              onChange={(allow) => updatePolicy('deviceTrust', {
                ...policy.deviceTrust!,
                allowNewDevices: allow,
              })}
              label="Allow New Device Registration"
              description="Let users register new devices during login"
            />
          </div>
        )}
      </div>

      {/* IP Restrictions */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">IP Restrictions</h3>
          <p className="text-sm text-text-muted">Limit access based on IP address</p>
        </div>

        <Toggle
          checked={policy.ipRestrictions?.enabled ?? false}
          onChange={(enabled) => updatePolicy('ipRestrictions', { ...policy.ipRestrictions!, enabled })}
          label="Enable IP Restrictions"
          description="Restrict login to specific IP ranges"
        />

        {policy.ipRestrictions?.enabled && (
          <div className="space-y-4 pl-4 border-l-2 border-accent">
            <FormField label="Allowed IP Ranges" hint="CIDR notation, one per line">
              <textarea
                value={(policy.ipRestrictions?.allowedRanges || []).join('\n')}
                onChange={(e) => updatePolicy('ipRestrictions', {
                  ...policy.ipRestrictions!,
                  allowedRanges: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                })}
                placeholder="10.0.0.0/8&#10;192.168.1.0/24"
                rows={3}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </FormField>

            <FormField label="Denied IP Ranges" hint="Block specific ranges (takes precedence)">
              <textarea
                value={(policy.ipRestrictions?.denyRanges || []).join('\n')}
                onChange={(e) => updatePolicy('ipRestrictions', {
                  ...policy.ipRestrictions!,
                  denyRanges: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                })}
                placeholder="192.168.1.100/32"
                rows={2}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </FormField>
          </div>
        )}
      </div>
    </div>
  );
}

export default SessionPolicyEditor;
