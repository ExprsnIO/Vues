'use client';

import { FormField, Input, Toggle, Select } from '@/components/admin/ui';

interface JITConfig {
  enabled: boolean;
  createUsers: boolean;
  updateOnLogin: boolean;
  defaultRole: string;
  defaultGroups: string[];
  requireEmailVerified: boolean;
  allowedDomains: string[];
  attributeMapping: {
    email: string;
    displayName?: string;
    avatar?: string;
    groups?: string;
  };
  groupMapping: Array<{
    idpGroup: string;
    localGroup: string;
  }>;
}

interface JITProvisioningConfigProps {
  config: Partial<JITConfig>;
  onChange: (config: Partial<JITConfig>) => void;
  availableRoles: Array<{ value: string; label: string }>;
  availableGroups: Array<{ id: string; name: string }>;
}

export function JITProvisioningConfig({
  config,
  onChange,
  availableRoles,
  availableGroups,
}: JITProvisioningConfigProps) {
  const updateConfig = <K extends keyof JITConfig>(key: K, value: JITConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  const addGroupMapping = () => {
    updateConfig('groupMapping', [
      ...(config.groupMapping || []),
      { idpGroup: '', localGroup: '' },
    ]);
  };

  const updateGroupMapping = (index: number, field: 'idpGroup' | 'localGroup', value: string) => {
    const mappings = [...(config.groupMapping || [])];
    mappings[index] = { ...mappings[index], [field]: value };
    updateConfig('groupMapping', mappings);
  };

  const removeGroupMapping = (index: number) => {
    updateConfig('groupMapping', (config.groupMapping || []).filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* Enable JIT */}
      <Toggle
        checked={config.enabled ?? false}
        onChange={(enabled) => updateConfig('enabled', enabled)}
        label="Enable Just-in-Time Provisioning"
        description="Automatically create and update user accounts on first login"
      />

      {config.enabled && (
        <>
          {/* User Creation */}
          <div className="space-y-4 p-4 bg-surface-hover rounded-lg">
            <h4 className="text-sm font-medium text-text-primary">User Creation</h4>

            <Toggle
              checked={config.createUsers ?? true}
              onChange={(create) => updateConfig('createUsers', create)}
              label="Create New Users"
              description="Create accounts for users who don't exist locally"
            />

            <Toggle
              checked={config.updateOnLogin ?? true}
              onChange={(update) => updateConfig('updateOnLogin', update)}
              label="Update on Login"
              description="Update user attributes from IdP on each login"
            />

            <Toggle
              checked={config.requireEmailVerified ?? true}
              onChange={(require) => updateConfig('requireEmailVerified', require)}
              label="Require Verified Email"
              description="Only provision users with verified email addresses"
            />
          </div>

          {/* Default Role & Groups */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-text-primary">Default Assignments</h4>

            <FormField label="Default Role" hint="Role assigned to new users">
              <Select
                value={config.defaultRole || ''}
                onChange={(e: any) => updateConfig('defaultRole', e.target.value)}
              >
                <option value="">Select a role...</option>
                {availableRoles.map(role => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </Select>
            </FormField>

            <FormField label="Default Groups" hint="Groups assigned to new users">
              <div className="flex flex-wrap gap-2">
                {availableGroups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => {
                      const current = config.defaultGroups || [];
                      if (current.includes(group.id)) {
                        updateConfig('defaultGroups', current.filter(g => g !== group.id));
                      } else {
                        updateConfig('defaultGroups', [...current, group.id]);
                      }
                    }}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      (config.defaultGroups || []).includes(group.id)
                        ? 'bg-accent text-text-inverse border-accent'
                        : 'bg-surface border-border hover:border-accent/50'
                    }`}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            </FormField>
          </div>

          {/* Domain Restrictions */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-text-primary">Domain Restrictions</h4>
            <FormField label="Allowed Email Domains" hint="Leave empty to allow all domains">
              <Input
                value={(config.allowedDomains || []).join(', ')}
                onChange={(e) => updateConfig('allowedDomains', e.target.value.split(',').map(d => d.trim()).filter(Boolean))}
                placeholder="example.com, company.org"
              />
            </FormField>
          </div>

          {/* Attribute Mapping */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-text-primary">Attribute Mapping</h4>
            <p className="text-xs text-text-muted">Map IdP attributes to local user fields</p>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Email Attribute" required>
                <Input
                  value={config.attributeMapping?.email || 'email'}
                  onChange={(e) => updateConfig('attributeMapping', {
                    ...config.attributeMapping!,
                    email: e.target.value,
                  })}
                  placeholder="email"
                />
              </FormField>
              <FormField label="Display Name Attribute">
                <Input
                  value={config.attributeMapping?.displayName || ''}
                  onChange={(e) => updateConfig('attributeMapping', {
                    ...config.attributeMapping!,
                    displayName: e.target.value,
                  })}
                  placeholder="name or displayName"
                />
              </FormField>
              <FormField label="Avatar Attribute">
                <Input
                  value={config.attributeMapping?.avatar || ''}
                  onChange={(e) => updateConfig('attributeMapping', {
                    ...config.attributeMapping!,
                    avatar: e.target.value,
                  })}
                  placeholder="picture or avatar"
                />
              </FormField>
              <FormField label="Groups Attribute">
                <Input
                  value={config.attributeMapping?.groups || ''}
                  onChange={(e) => updateConfig('attributeMapping', {
                    ...config.attributeMapping!,
                    groups: e.target.value,
                  })}
                  placeholder="groups or memberOf"
                />
              </FormField>
            </div>
          </div>

          {/* Group Mapping */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-text-primary">Group Mapping</h4>
                <p className="text-xs text-text-muted">Map IdP groups to local groups</p>
              </div>
              <button
                onClick={addGroupMapping}
                className="px-3 py-1.5 text-sm text-accent hover:bg-accent/10 rounded-lg transition-colors"
              >
                + Add Mapping
              </button>
            </div>

            {(config.groupMapping || []).length > 0 ? (
              <div className="space-y-2">
                {(config.groupMapping || []).map((mapping, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <Input
                      value={mapping.idpGroup}
                      onChange={(e) => updateGroupMapping(index, 'idpGroup', e.target.value)}
                      placeholder="IdP Group Name"
                      className="flex-1"
                    />
                    <svg className="w-4 h-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                    <Select
                      value={mapping.localGroup}
                      onChange={(e: any) => updateGroupMapping(index, 'localGroup', e.target.value)}
                      className="flex-1"
                    >
                      <option value="">Select local group...</option>
                      {availableGroups.map(group => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </Select>
                    <button
                      onClick={() => removeGroupMapping(index)}
                      className="p-2 text-text-muted hover:text-red-500 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted text-center py-4">
                No group mappings configured
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default JITProvisioningConfig;
