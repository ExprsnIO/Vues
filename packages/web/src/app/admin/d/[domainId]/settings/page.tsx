'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, API_BASE } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';
import {
  SimpleTabs,
  Modal,
  ConfirmDialog,
  FormField,
  Input,
  Badge,
  SearchInput,
  PageSkeleton,
} from '@/components/admin/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
  createdAt: string;
}

interface Permission {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  expiryDays: number;
  maxFailedAttempts: number;
  lockoutMinutes: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AVAILABLE_PERMISSIONS: Permission[] = [
  { id: 'users.view', name: 'View Users', description: 'View user profiles and lists', category: 'Users' },
  { id: 'users.manage', name: 'Manage Users', description: 'Create, edit, and delete users', category: 'Users' },
  { id: 'users.ban', name: 'Ban Users', description: 'Ban and suspend users', category: 'Users' },
  { id: 'content.view', name: 'View Content', description: 'View all content', category: 'Content' },
  { id: 'content.moderate', name: 'Moderate Content', description: 'Remove and flag content', category: 'Content' },
  { id: 'content.delete', name: 'Delete Content', description: 'Permanently delete content', category: 'Content' },
  { id: 'reports.view', name: 'View Reports', description: 'View user reports', category: 'Moderation' },
  { id: 'reports.manage', name: 'Manage Reports', description: 'Process and resolve reports', category: 'Moderation' },
  { id: 'settings.view', name: 'View Settings', description: 'View domain settings', category: 'Settings' },
  { id: 'settings.manage', name: 'Manage Settings', description: 'Modify domain settings', category: 'Settings' },
  { id: 'analytics.view', name: 'View Analytics', description: 'Access analytics data', category: 'Analytics' },
  { id: 'billing.view', name: 'View Billing', description: 'View payment information', category: 'Billing' },
  { id: 'billing.manage', name: 'Manage Billing', description: 'Modify billing settings', category: 'Billing' },
  { id: 'api.manage', name: 'Manage API', description: 'Create and manage API tokens', category: 'API' },
  { id: 'admin.full', name: 'Full Admin', description: 'Full administrative access', category: 'Admin' },
];

const TABS = [
  { id: 'access', label: 'Access Control' },
  { id: 'sso', label: 'SSO & SAML' },
  { id: 'oauth', label: 'OAuth Providers' },
  { id: 'mfa', label: 'MFA' },
  { id: 'password', label: 'Password Rules' },
  { id: 'more', label: 'Settings' },
];

// ─── Toggle helper ─────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-text-primary text-sm">{label}</p>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50" />
      </label>
    </div>
  );
}

// ─── Access Control Tab ───────────────────────────────────────────────────────

function AccessControlTab({ domainId }: { domainId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [newRole, setNewRole] = useState({ name: '', description: '', permissions: [] as string[] });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'roles'],
    queryFn: () => api.adminDomainRolesList(domainId),
    enabled: !!domainId,
  });

  const { data: permissionCatalogData } = useQuery({
    queryKey: ['admin', 'domain', 'permission-catalog'],
    queryFn: () => api.adminDomainPermissionCatalog(),
    enabled: !!domainId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.adminDomainRolesCreate(domainId, data),
    onSuccess: () => {
      toast.success('Role created');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'roles'] });
      setShowCreateModal(false);
      setNewRole({ name: '', description: '', permissions: [] });
    },
    onError: () => toast.error('Failed to create role'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & any) => api.adminDomainRolesUpdate(domainId, id, data),
    onSuccess: () => {
      toast.success('Role updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'roles'] });
      setEditingRole(null);
    },
    onError: () => toast.error('Failed to update role'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainRolesDelete(domainId, id),
    onSuccess: () => {
      toast.success('Role deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'roles'] });
      setDeleteTarget(null);
    },
    onError: () => toast.error('Failed to delete role'),
  });

  const permissionOptions = permissionCatalogData?.permissions?.map((p: any) => ({
    id: p.id,
    name: p.label,
    description: p.description,
    category: p.category,
  })) || AVAILABLE_PERMISSIONS;

  const groupedPermissions = permissionOptions.reduce((acc: Record<string, Permission[]>, perm: Permission) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const togglePermission = (permissions: string[], permission: string, setter: (p: string[]) => void) => {
    setter(permissions.includes(permission)
      ? permissions.filter(p => p !== permission)
      : [...permissions, permission]);
  };

  let roles: Role[] = data?.roles || [];
  if (search) {
    roles = roles.filter(r =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase())
    );
  }

  const RoleForm = ({
    role,
    permissions,
    onPermissionsChange,
    onSubmit,
    onCancel,
    isSubmitting,
    submitLabel,
  }: {
    role: { name: string; description: string; isSystem?: boolean };
    permissions: string[];
    onPermissionsChange: (p: string[]) => void;
    onSubmit: (e: React.FormEvent) => void;
    onCancel: () => void;
    isSubmitting: boolean;
    submitLabel: string;
  }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormField label="Role Name" required>
        <Input
          value={role.name}
          onChange={(e) => editingRole
            ? setEditingRole({ ...editingRole, name: e.target.value })
            : setNewRole({ ...newRole, name: e.target.value })}
          placeholder="e.g., Moderator"
          disabled={role.isSystem}
        />
      </FormField>

      <FormField label="Description">
        <textarea
          value={role.description}
          onChange={(e) => editingRole
            ? setEditingRole({ ...editingRole, description: e.target.value })
            : setNewRole({ ...newRole, description: e.target.value })}
          placeholder="Describe this role..."
          rows={2}
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </FormField>

      <div className="space-y-3">
        <p className="text-sm font-medium text-text-primary">Permissions</p>
        {Object.entries(groupedPermissions).map(([category, perms]) => (
          <div key={category} className="p-3 bg-surface-hover rounded-lg">
            <p className="text-xs font-medium text-text-muted uppercase mb-2">{category}</p>
            <div className="space-y-2">
              {(perms as Permission[]).map((perm) => (
                <label key={perm.id} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions.includes(perm.id)}
                    onChange={() => togglePermission(permissions, perm.id, onPermissionsChange)}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-sm text-text-primary">{perm.name}</p>
                    <p className="text-xs text-text-muted">{perm.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-text-muted hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!role.name || isSubmitting}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-muted text-sm">Manage roles and permissions for this domain</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Create Role
        </button>
      </div>

      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search roles..."
          className="w-64"
        />
      </div>

      {roles.length === 0 ? (
        <div className="p-12 bg-surface border border-border rounded-xl text-center">
          <h4 className="text-lg font-medium text-text-primary mb-2">
            {search ? 'No roles match your search' : 'No custom roles'}
          </h4>
          <p className="text-sm text-text-muted mb-4">
            {search ? 'Try a different search term' : 'Create custom roles to define permissions'}
          </p>
          {!search && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
            >
              Create First Role
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {roles.map((role) => (
            <div key={role.id} className="p-5 bg-surface border border-border rounded-xl">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-text-primary">{role.displayName || role.name}</h4>
                    {role.isSystem && <Badge variant="info" size="sm">System</Badge>}
                  </div>
                  <p className="text-sm text-text-muted mt-1">{role.description}</p>
                </div>
                {!role.isSystem && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingRole(role)}
                      className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(role)}
                      className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-text-muted mb-3">
                <span>{role.permissions.length} permissions</span>
                <span>{role.userCount} users</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {role.permissions.slice(0, 5).map((perm) => (
                  <Badge key={perm} variant="default" size="sm">{perm}</Badge>
                ))}
                {role.permissions.length > 5 && (
                  <Badge variant="default" size="sm">+{role.permissions.length - 5}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Role"
        size="lg"
      >
        <RoleForm
          role={newRole}
          permissions={newRole.permissions}
          onPermissionsChange={(p) => setNewRole({ ...newRole, permissions: p })}
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(newRole); }}
          onCancel={() => setShowCreateModal(false)}
          isSubmitting={createMutation.isPending}
          submitLabel="Create Role"
        />
      </Modal>

      <Modal
        isOpen={!!editingRole}
        onClose={() => setEditingRole(null)}
        title="Edit Role"
        size="lg"
      >
        {editingRole && (
          <RoleForm
            role={editingRole}
            permissions={editingRole.permissions}
            onPermissionsChange={(p) => setEditingRole({ ...editingRole, permissions: p })}
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate({
                id: editingRole.id,
                name: editingRole.name,
                description: editingRole.description,
                permissions: editingRole.permissions,
              });
            }}
            onCancel={() => setEditingRole(null)}
            isSubmitting={updateMutation.isPending}
            submitLabel="Update Role"
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Delete Role?"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Users with this role will lose their permissions.`}
        confirmLabel="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}

// ─── SSO & SAML Tab ───────────────────────────────────────────────────────────

function SSOTab({ domainId }: { domainId: string }) {
  const { data: configData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'config'],
    queryFn: () => api.adminDomainSSOConfigGet(domainId),
    enabled: !!domainId,
  });

  const { data: providersData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'providers'],
    queryFn: () => api.adminDomainSSOProvidersList(domainId),
    enabled: !!domainId,
  });

  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (updates: any) => api.adminDomainSSOConfigUpdate(domainId, updates),
    onSuccess: () => {
      toast.success('SSO settings saved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
    },
    onError: () => toast.error('Failed to update SSO settings'),
  });

  const config = configData?.config;
  const providers = providersData?.providers || [];

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6 space-y-1 divide-y divide-border">
        <h2 className="text-base font-semibold text-text-primary pb-4">SSO Configuration</h2>
        <ToggleRow
          label="Enable SSO"
          description="Allow users to authenticate using configured identity providers"
          checked={config?.enabled ?? false}
          onChange={(v) => updateMutation.mutate({ enabled: v })}
          disabled={updateMutation.isPending}
        />
        <ToggleRow
          label="Enforce SSO"
          description="Require all users to sign in via SSO (disables password login)"
          checked={config?.enforced ?? false}
          onChange={(v) => updateMutation.mutate({ enforced: v })}
          disabled={updateMutation.isPending}
        />
        <ToggleRow
          label="JIT Provisioning"
          description="Automatically create user accounts on first SSO login"
          checked={config?.jitProvisioning ?? false}
          onChange={(v) => updateMutation.mutate({ jitProvisioning: v })}
          disabled={updateMutation.isPending}
        />
      </div>

      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Identity Providers</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {providers.length} provider{providers.length !== 1 ? 's' : ''} configured
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/d/${domainId}/settings/sso/providers/new`}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg text-sm"
            >
              Add Provider
            </Link>
            <Link
              href={`/admin/d/${domainId}/settings/sso`}
              className="px-3 py-1.5 bg-surface-hover hover:bg-border text-text-primary rounded-lg text-sm"
            >
              Full SSO Settings
            </Link>
          </div>
        </div>

        {providers.length === 0 ? (
          <div className="py-8 text-center text-text-muted text-sm">
            No SSO providers configured.{' '}
            <Link href={`/admin/d/${domainId}/settings/sso/providers/new`} className="text-accent hover:underline">
              Add the first provider
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {providers.map((provider: any) => (
              <div key={provider.id} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
                <div>
                  <p className="text-sm font-medium text-text-primary">{provider.displayName || provider.name}</p>
                  <p className="text-xs text-text-muted">{provider.type} — {provider.status}</p>
                </div>
                <Link
                  href={`/admin/d/${domainId}/settings/sso/providers/${provider.id}`}
                  className="text-xs text-accent hover:underline"
                >
                  Configure
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-base font-semibold text-text-primary mb-3">Quick Navigation</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: `/admin/d/${domainId}/settings/sso/providers`, label: 'Manage Providers', desc: 'Configure identity providers' },
            { href: `/admin/d/${domainId}/settings/sso/email-domains`, label: 'Email Domains', desc: 'Allowed email domains' },
            { href: `/admin/d/${domainId}/settings/sso/policies`, label: 'Session Policies', desc: 'MFA and session rules' },
            { href: `/admin/d/${domainId}/settings/sso/exprsn`, label: 'Exprsn SSO', desc: 'Cross-instance SSO with scopes' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="p-3 bg-surface-hover hover:border-accent border border-border rounded-lg transition-colors"
            >
              <p className="text-sm font-medium text-text-primary">{item.label}</p>
              <p className="text-xs text-text-muted mt-0.5">{item.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── OAuth Providers Tab ──────────────────────────────────────────────────────

function OAuthTab({ domainId }: { domainId: string }) {
  const queryClient = useQueryClient();

  const { data: providersData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'oauth-providers'],
    queryFn: () => api.adminDomainOAuthList(domainId),
    enabled: !!domainId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.adminDomainOAuthToggle(id, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'oauth-providers'] });
    },
    onError: () => toast.error('Failed to toggle provider'),
  });

  const providers = providersData?.providers || [];
  const enabledCount = providers.filter((p: any) => p.enabled).length;

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-text-primary">OAuth Providers</h2>
            <p className="text-sm text-text-muted mt-0.5">
              {providers.length} configured — {enabledCount} enabled
            </p>
          </div>
          <Link
            href={`/admin/d/${domainId}/settings/oauth`}
            className="px-3 py-1.5 bg-surface-hover hover:bg-border text-text-primary rounded-lg text-sm"
          >
            Full OAuth Settings
          </Link>
        </div>

        {providers.length === 0 ? (
          <div className="py-8 text-center text-text-muted text-sm">
            No OAuth providers configured.
          </div>
        ) : (
          <div className="space-y-2">
            {providers.map((provider: any) => (
              <div key={provider.id} className="flex items-center justify-between p-3 bg-surface-hover rounded-lg">
                <div>
                  <p className="text-sm font-medium text-text-primary">{provider.displayName}</p>
                  <p className="text-xs text-text-muted font-mono">{provider.providerKey} — {provider.totalLogins} logins</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={provider.enabled}
                    onChange={() => toggleMutation.mutate({ id: provider.id, enabled: !provider.enabled })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-surface peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent" />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-3">Quick Add Provider</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { key: 'google', label: 'Google', icon: 'G' },
            { key: 'github', label: 'GitHub', icon: '' },
            { key: 'microsoft', label: 'Microsoft', icon: 'M' },
          ].map((p) => (
            <Link
              key={p.key}
              href={`/admin/d/${domainId}/settings/oauth?template=${p.key}`}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-accent hover:text-accent transition-colors"
            >
              {p.label}
            </Link>
          ))}
          <Link
            href={`/admin/d/${domainId}/settings/sso/exprsn`}
            className="px-3 py-1.5 text-sm border border-accent/30 rounded-lg hover:border-accent hover:text-accent bg-accent/5 transition-colors flex items-center gap-1.5"
          >
            Exprsn
            <span className="text-[10px] px-1 py-0.5 bg-accent/10 text-accent rounded">SSO + Scopes</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── MFA Tab ──────────────────────────────────────────────────────────────────

function MFATab({ domainId }: { domainId: string }) {
  const queryClient = useQueryClient();

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'mfa-settings'],
    queryFn: () => api.adminDomainMFAGet(domainId),
    enabled: !!domainId,
  });

  const { data: statsData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'mfa-stats'],
    queryFn: () => api.adminDomainMFAStats(domainId),
    enabled: !!domainId,
  });

  const updateMutation = useMutation({
    mutationFn: (updates: any) => api.adminDomainMFAUpdate(domainId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'mfa-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'mfa-stats'] });
    },
    onError: () => toast.error('Failed to update MFA settings'),
  });

  const settings = settingsData?.settings;
  const stats = statsData?.stats;

  if (isLoading || !settings) return <PageSkeleton />;

  const mfaEnabled = settings.mfaMode !== 'disabled';
  const mfaRequired = settings.mfaMode === 'required';

  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-surface p-4 rounded-lg border border-border">
            <p className="text-text-muted text-sm">MFA Adoption</p>
            <p className="text-2xl font-bold text-text-primary">{Math.round(stats.adoptionRate)}%</p>
            <p className="text-xs text-text-muted">{stats.enrolledUsers} of {stats.totalUsers} users</p>
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

      <div className="bg-surface border border-border rounded-lg p-6 divide-y divide-border">
        <h2 className="text-base font-semibold text-text-primary pb-4">Global MFA Settings</h2>
        <ToggleRow
          label="Enable MFA"
          description="Allow users to set up multi-factor authentication"
          checked={mfaEnabled}
          onChange={(v) => updateMutation.mutate({ mfaMode: v ? 'optional' : 'disabled' })}
          disabled={updateMutation.isPending}
        />
        {mfaEnabled && (
          <ToggleRow
            label="Require MFA for all users"
            description="Force all domain users to enroll in MFA"
            checked={mfaRequired}
            onChange={(v) => updateMutation.mutate({ mfaMode: v ? 'required' : 'optional' })}
            disabled={updateMutation.isPending}
          />
        )}
        {mfaEnabled && (
          <ToggleRow
            label="Remember Device"
            description="Allow users to skip MFA on trusted devices"
            checked={settings.rememberDeviceEnabled}
            onChange={(v) => updateMutation.mutate({ rememberDeviceEnabled: v })}
            disabled={updateMutation.isPending}
          />
        )}
      </div>

      {mfaEnabled && (
        <div className="bg-surface border border-border rounded-lg p-6 space-y-2">
          <h2 className="text-base font-semibold text-text-primary mb-4">Authentication Methods</h2>
          {[
            { key: 'totp', label: 'Authenticator App (TOTP)', desc: 'Google Authenticator, Authy, etc.', enabled: settings.totpEnabled },
            { key: 'sms', label: 'SMS', desc: 'Text message verification codes', enabled: settings.smsEnabled },
            { key: 'emailOtp', label: 'Email OTP', desc: 'Verification codes via email', enabled: settings.emailOtpEnabled },
            { key: 'webauthn', label: 'Security Keys (WebAuthn)', desc: 'Hardware security keys and passkeys', enabled: settings.webauthnEnabled },
          ].map((method) => (
            <div key={method.key} className="flex items-center justify-between p-4 bg-surface-hover rounded-lg">
              <div>
                <p className="text-sm font-medium text-text-primary">{method.label}</p>
                <p className="text-xs text-text-muted">{method.desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={method.enabled}
                  onChange={(e) => {
                    const updates: any = {};
                    if (method.key === 'totp') updates.totpEnabled = e.target.checked;
                    if (method.key === 'sms') updates.smsEnabled = e.target.checked;
                    if (method.key === 'emailOtp') updates.emailOtpEnabled = e.target.checked;
                    if (method.key === 'webauthn') updates.webauthnEnabled = e.target.checked;
                    updateMutation.mutate(updates);
                  }}
                  disabled={updateMutation.isPending}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-surface peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50" />
              </label>
            </div>
          ))}

          <div className="flex items-center justify-between p-4 bg-surface-hover rounded-lg">
            <div>
              <p className="text-sm font-medium text-text-primary">Recovery Codes</p>
              <p className="text-xs text-text-muted">Backup codes for account recovery ({settings.backupCodesCount} codes)</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.backupCodesEnabled}
                onChange={(e) => updateMutation.mutate({ backupCodesEnabled: e.target.checked })}
                disabled={updateMutation.isPending}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-surface peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent peer-disabled:opacity-50" />
            </label>
          </div>
        </div>
      )}

      <p className="text-sm text-text-muted">
        For advanced TOTP and WebAuthn settings,{' '}
        <Link href={`/admin/d/${domainId}/settings/mfa`} className="text-accent hover:underline">
          visit the full MFA settings page
        </Link>.
      </p>

      {updateMutation.isPending && (
        <div className="fixed bottom-4 right-4 bg-accent text-text-inverse px-4 py-2 rounded-lg shadow-lg text-sm">
          Saving changes...
        </div>
      )}
    </div>
  );
}

// ─── Password Rules Tab ───────────────────────────────────────────────────────

function PasswordRulesTab({ domainId }: { domainId: string }) {
  const queryClient = useQueryClient();

  const { data: domainData, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const rawPolicy = (domainData?.domain as any)?.passwordPolicy;

  const [policy, setPolicy] = useState<PasswordPolicy>({
    minLength: 8,
    requireUppercase: false,
    requireLowercase: false,
    requireNumbers: false,
    requireSpecialChars: false,
    expiryDays: 0,
    maxFailedAttempts: 5,
    lockoutMinutes: 15,
  });

  useEffect(() => {
    if (rawPolicy) {
      setPolicy({
        minLength: rawPolicy.minLength ?? 8,
        requireUppercase: rawPolicy.requireUppercase ?? false,
        requireLowercase: rawPolicy.requireLowercase ?? false,
        requireNumbers: rawPolicy.requireNumbers ?? false,
        requireSpecialChars: rawPolicy.requireSpecialChars ?? false,
        expiryDays: rawPolicy.expiryDays ?? 0,
        maxFailedAttempts: rawPolicy.maxFailedAttempts ?? 5,
        lockoutMinutes: rawPolicy.lockoutMinutes ?? 15,
      });
    }
  }, [rawPolicy]);

  const saveMutation = useMutation({
    mutationFn: () =>
      (api.adminDomainsUpdate as any)({ id: domainId, passwordPolicy: policy }),
    onSuccess: () => {
      toast.success('Password policy saved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
    },
    onError: () => toast.error('Failed to save password policy'),
  });

  if (isLoading) return <PageSkeleton />;

  const numInput = (
    label: string,
    description: string,
    field: keyof PasswordPolicy,
    min = 0,
    max = 9999
  ) => (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <input
        type="number"
        value={policy[field] as number}
        onChange={(e) => setPolicy({ ...policy, [field]: parseInt(e.target.value) || 0 })}
        min={min}
        max={max}
        className="w-24 px-3 py-1.5 bg-surface-hover border border-border rounded-lg text-text-primary text-sm text-right focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-base font-semibold text-text-primary mb-4">Complexity Requirements</h2>
        <div className="divide-y divide-border">
          {numInput('Minimum password length', 'Minimum number of characters required', 'minLength', 4, 128)}
          <ToggleRow
            label="Require uppercase letters"
            description="Password must contain at least one uppercase letter (A–Z)"
            checked={policy.requireUppercase}
            onChange={(v) => setPolicy({ ...policy, requireUppercase: v })}
          />
          <ToggleRow
            label="Require lowercase letters"
            description="Password must contain at least one lowercase letter (a–z)"
            checked={policy.requireLowercase}
            onChange={(v) => setPolicy({ ...policy, requireLowercase: v })}
          />
          <ToggleRow
            label="Require numbers"
            description="Password must contain at least one digit (0–9)"
            checked={policy.requireNumbers}
            onChange={(v) => setPolicy({ ...policy, requireNumbers: v })}
          />
          <ToggleRow
            label="Require special characters"
            description="Password must contain at least one special character (!, @, #, etc.)"
            checked={policy.requireSpecialChars}
            onChange={(v) => setPolicy({ ...policy, requireSpecialChars: v })}
          />
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-base font-semibold text-text-primary mb-4">Expiry and Lockout</h2>
        <div className="divide-y divide-border">
          {numInput('Password expiry (days)', 'Days until password must be changed. Set to 0 to never expire.', 'expiryDays', 0, 365)}
          {numInput('Max failed login attempts', 'Number of failed attempts before account lockout', 'maxFailedAttempts', 1, 100)}
          {numInput('Lockout duration (minutes)', 'How long to lock an account after too many failed attempts', 'lockoutMinutes', 1, 1440)}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50 transition-colors"
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Password Policy'}
        </button>
      </div>
    </div>
  );
}

// ─── Settings Links Tab ───────────────────────────────────────────────────────

function MoreSettingsTab({ domainId, domainType }: { domainId: string; domainType: string }) {
  const links = [
    { href: `/admin/d/${domainId}/settings/services`, label: 'Services & Features', description: 'Configure available services and features' },
    { href: `/admin/d/${domainId}/settings/identity`, label: 'Identity (PLC)', description: 'Manage PLC and identity settings' },
    { href: `/admin/d/${domainId}/settings/certificates`, label: 'Certificates', description: 'TLS and code signing certificates' },
    { href: `/admin/d/${domainId}/settings/rate-limits`, label: 'Rate Limits', description: 'Configure API rate limit tiers' },
    { href: `/admin/d/${domainId}/settings/branding`, label: 'Branding', description: 'Customize domain appearance' },
    { href: `/admin/d/${domainId}/settings/tokens`, label: 'API Tokens', description: 'Manage API access tokens' },
    { href: `/admin/d/${domainId}/settings/invite-codes`, label: 'Invite Codes', description: 'Manage user invitation codes' },
    ...(domainType === 'federated'
      ? [{ href: `/admin/d/${domainId}/settings/federation`, label: 'Federation', description: 'AT Protocol federation settings' }]
      : []),
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="bg-surface border border-border rounded-lg p-6 hover:border-accent transition-colors"
        >
          <h3 className="text-base font-semibold text-text-primary">{link.label}</h3>
          <p className="text-text-muted text-sm mt-1">{link.description}</p>
        </Link>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DomainSettingsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('access');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showTransferHistory, setShowTransferHistory] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  const { data: pendingTransfers } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'transfers', 'pending'],
    queryFn: () => api.adminDomainTransferPending({ domainId }),
    enabled: !!domainId,
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.adminDomainsVerify(domainId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('Domain verified');
    },
    onError: () => toast.error('Failed to verify domain'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const domain = data?.domain;
  if (!domain) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500/10 text-green-400 border-green-500/30';
      case 'pending':
      case 'verifying': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30';
      case 'suspended': return 'bg-red-500/10 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Domain Settings</h1>
        <p className="text-text-muted">{domain.name}</p>
      </div>

      {/* Domain Overview */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-lg font-semibold text-text-primary">{domain.domain}</h2>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(domain.status)}`}>
                {domain.status.charAt(0).toUpperCase() + domain.status.slice(1)}
              </span>
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <dt className="text-text-muted">Type</dt>
                <dd className="text-text-primary capitalize">{domain.type}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Handle Suffix</dt>
                <dd className="text-text-primary">{domain.handleSuffix || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">PDS Endpoint</dt>
                <dd className="text-text-primary truncate max-w-[200px]">{domain.pdsEndpoint || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Created</dt>
                <dd className="text-text-primary">{new Date(domain.createdAt).toLocaleDateString()}</dd>
              </div>
              {domain.verifiedAt && (
                <div>
                  <dt className="text-text-muted">Verified</dt>
                  <dd className="text-text-primary">{new Date(domain.verifiedAt).toLocaleDateString()}</dd>
                </div>
              )}
            </dl>
            {domain.dnsVerificationToken && (
              <div className="mt-4 p-3 bg-surface-hover rounded-lg">
                <dt className="text-text-muted text-sm mb-1">DNS Verification Token</dt>
                <dd className="font-mono text-sm text-text-primary break-all">
                  exprsn-verification={domain.dnsVerificationToken}
                </dd>
                <p className="text-text-muted text-xs mt-2">
                  Add this TXT record to your DNS to verify domain ownership
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg"
            >
              Edit
            </button>
            {domain.status === 'pending' && (
              <button
                onClick={() => verifyMutation.mutate()}
                disabled={verifyMutation.isPending}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg"
              >
                Verify Domain
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabbed Interface */}
      <div className="bg-surface border border-border rounded-lg">
        <div className="px-6 pt-4 border-b border-border">
          <SimpleTabs
            tabs={TABS}
            activeTab={activeTab}
            onChange={setActiveTab}
            variant="underline"
          />
        </div>
        <div className="p-6">
          {activeTab === 'access' && <AccessControlTab domainId={domainId} />}
          {activeTab === 'sso' && <SSOTab domainId={domainId} />}
          {activeTab === 'oauth' && <OAuthTab domainId={domainId} />}
          {activeTab === 'mfa' && <MFATab domainId={domainId} />}
          {activeTab === 'password' && <PasswordRulesTab domainId={domainId} />}
          {activeTab === 'more' && <MoreSettingsTab domainId={domainId} domainType={domain.type} />}
        </div>
      </div>

      {/* Domain Transfer */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Domain Transfer</h2>
            <p className="text-text-muted text-sm mt-1">Transfer domain ownership to another organization or make it independent</p>
          </div>
          <button
            onClick={() => setShowTransferHistory(!showTransferHistory)}
            className="px-3 py-1.5 bg-surface-hover hover:bg-border text-text-primary rounded-lg text-sm"
          >
            {showTransferHistory ? 'Hide History' : 'View History'}
          </button>
        </div>

        {pendingTransfers && pendingTransfers.transfers.length > 0 && (
          <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-400 mb-2">Pending Transfer</h3>
            {pendingTransfers.transfers.map((transfer: any) => (
              <div key={transfer.id} className="space-y-2">
                <p className="text-sm text-text-primary">
                  {transfer.targetOrganization ? (
                    <>Transfer to <span className="font-semibold">{transfer.targetOrganization.displayName || transfer.targetOrganization.name}</span></>
                  ) : (
                    'Making domain independent'
                  )}
                </p>
                <p className="text-xs text-text-muted">
                  Initiated {new Date(transfer.initiatedAt).toLocaleString()}
                </p>
                {transfer.reason && (
                  <p className="text-xs text-text-muted">Reason: {transfer.reason}</p>
                )}
                <div className="flex gap-2 mt-2">
                  <TransferActionButtons transfer={transfer} domainId={domainId} />
                </div>
              </div>
            ))}
          </div>
        )}

        {showTransferHistory && (
          <div className="mb-4">
            <TransferHistory domainId={domainId} />
          </div>
        )}

        <button
          onClick={() => setShowTransferModal(true)}
          disabled={pendingTransfers && pendingTransfers.transfers.length > 0}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Initiate Transfer
        </button>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium">Suspend Domain</p>
              <p className="text-text-muted text-sm">Temporarily disable this domain</p>
            </div>
            <button className="px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-lg">
              Suspend
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-text-primary font-medium">Delete Domain</p>
              <p className="text-text-muted text-sm">Permanently delete this domain and all its data</p>
            </div>
            <button className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg">
              Delete
            </button>
          </div>
        </div>
      </div>

      {showTransferModal && (
        <TransferModal
          domainId={domainId}
          domainName={domain.name}
          onClose={() => setShowTransferModal(false)}
        />
      )}

      {showEditModal && (
        <EditDomainModal
          domain={domain}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  );
}

// ─── Transfer Action Buttons ───────────────────────────────────────────────

function TransferActionButtons({ transfer, domainId }: { transfer: any; domainId: string }) {
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: () => api.adminDomainTransferApprove({ transferId: transfer.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'transfers'] });
      toast.success('Transfer approved and completed');
    },
    onError: () => toast.error('Failed to approve transfer'),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.adminDomainTransferReject({ transferId: transfer.id, reason: 'Rejected by admin' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'transfers'] });
      toast.success('Transfer rejected');
    },
    onError: () => toast.error('Failed to reject transfer'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.adminDomainTransferCancel({ transferId: transfer.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'transfers'] });
      toast.success('Transfer cancelled');
    },
    onError: () => toast.error('Failed to cancel transfer'),
  });

  return (
    <>
      <button
        onClick={() => approveMutation.mutate()}
        disabled={approveMutation.isPending}
        className="px-3 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded text-sm"
      >
        Approve
      </button>
      <button
        onClick={() => rejectMutation.mutate()}
        disabled={rejectMutation.isPending}
        className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded text-sm"
      >
        Reject
      </button>
      <button
        onClick={() => cancelMutation.mutate()}
        disabled={cancelMutation.isPending}
        className="px-3 py-1 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 rounded text-sm"
      >
        Cancel
      </button>
    </>
  );
}

// ─── Transfer History ─────────────────────────────────────────────────────────

function TransferHistory({ domainId }: { domainId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'transfers', 'history'],
    queryFn: () => api.adminDomainTransferHistory({ domainId, limit: 10 }),
  });

  if (isLoading) return <div className="text-text-muted text-sm">Loading history...</div>;
  if (!data || data.transfers.length === 0) return <div className="text-text-muted text-sm">No transfer history</div>;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-text-primary">Transfer History</h3>
      <div className="space-y-2">
        {data.transfers.map((transfer: any) => (
          <div key={transfer.id} className="p-3 bg-surface-hover rounded-lg text-sm">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-text-primary">
                  {transfer.status === 'completed' ? 'Transferred to' : 'Transfer to'}{' '}
                  {transfer.targetOrganization ? (
                    <span className="font-semibold">{transfer.targetOrganization.displayName || transfer.targetOrganization.name}</span>
                  ) : (
                    'Independent'
                  )}
                </span>
                <span
                  className={`ml-2 px-2 py-0.5 rounded text-xs ${
                    transfer.status === 'completed'
                      ? 'bg-green-500/10 text-green-400'
                      : transfer.status === 'rejected'
                      ? 'bg-red-500/10 text-red-400'
                      : transfer.status === 'cancelled'
                      ? 'bg-gray-500/10 text-gray-400'
                      : 'bg-yellow-500/10 text-yellow-400'
                  }`}
                >
                  {transfer.status}
                </span>
              </div>
              <span className="text-text-muted text-xs">{new Date(transfer.initiatedAt).toLocaleDateString()}</span>
            </div>
            {transfer.reason && <p className="text-text-muted text-xs mt-1">{transfer.reason}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Transfer Modal ───────────────────────────────────────────────────────────

function TransferModal({
  domainId,
  domainName,
  onClose,
}: {
  domainId: string;
  domainName: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [targetOrganizationId, setTargetOrganizationId] = useState('');
  const [makeIndependent, setMakeIndependent] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const { data: orgsData } = useQuery({
    queryKey: ['admin', 'organizations'],
    queryFn: () => api.getAllOrganizations({ limit: 100 }),
  });

  const initiateMutation = useMutation({
    mutationFn: () =>
      api.adminDomainTransferInitiate({
        domainId,
        targetOrganizationId: makeIndependent ? null : targetOrganizationId || null,
        reason: reason || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'transfers'] });
      toast.success('Transfer initiated');
      onClose();
    },
    onError: () => toast.error('Failed to initiate transfer'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!makeIndependent && !targetOrganizationId) {
      toast.error('Please select a target organization or make domain independent');
      return;
    }
    initiateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl p-6 max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-text-primary mb-4">Initiate Domain Transfer</h2>
        <p className="text-text-muted text-sm mb-6">
          Transfer ownership of <span className="font-semibold">{domainName}</span> to another organization or make it independent.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <input
              type="checkbox"
              id="makeIndependent"
              checked={makeIndependent}
              onChange={(e) => {
                setMakeIndependent(e.target.checked);
                if (e.target.checked) setTargetOrganizationId('');
              }}
              className="w-4 h-4"
            />
            <label htmlFor="makeIndependent" className="text-sm text-text-primary">
              Make domain independent (no organization owner)
            </label>
          </div>

          {!makeIndependent && (
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">Target Organization</label>
              <select
                value={targetOrganizationId}
                onChange={(e) => setTargetOrganizationId(e.target.value)}
                className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
                required={!makeIndependent}
              >
                <option value="">Select organization...</option>
                {orgsData?.organizations.map((org: any) => (
                  <option key={org.id} value={org.id}>{org.displayName || org.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this transfer being initiated?"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={3}
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={initiateMutation.isPending}
              className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
            >
              {initiateMutation.isPending ? 'Initiating...' : 'Initiate Transfer'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Domain Modal ────────────────────────────────────────────────────────

function EditDomainModal({ domain, onClose }: { domain: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(domain.name || '');
  const [domainName, setDomainName] = useState(domain.domain || '');
  const [handleSuffix, setHandleSuffix] = useState(domain.handleSuffix || '');
  const [pdsEndpoint, setPdsEndpoint] = useState(domain.pdsEndpoint || '');
  const [dnsVerificationToken, setDnsVerificationToken] = useState(domain.dnsVerificationToken || '');

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.adminDomainsUpdate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domain.id] });
      toast.success('Domain updated successfully');
      onClose();
    },
    onError: () => toast.error('Failed to update domain'),
  });

  const generateToken = () => {
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    setDnsVerificationToken(token);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      id: domain.id,
      name: name || undefined,
      domain: domainName !== domain.domain ? domainName : undefined,
      handleSuffix: handleSuffix || undefined,
      pdsEndpoint: pdsEndpoint || undefined,
      dnsVerificationToken: dnsVerificationToken || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-text-primary mb-4">Edit Domain Configuration</h2>
        <p className="text-text-muted text-sm mb-6">Update domain settings and DNS verification configuration.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Domain"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Domain Name</label>
            <input
              type="text"
              value={domainName}
              onChange={(e) => setDomainName(e.target.value)}
              placeholder="example.com"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
            />
            <p className="text-text-muted text-xs mt-1">The primary domain name (e.g., exprsn.io)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Handle Suffix</label>
            <input
              type="text"
              value={handleSuffix}
              onChange={(e) => setHandleSuffix(e.target.value)}
              placeholder="example.com"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
            />
            <p className="text-text-muted text-xs mt-1">The suffix used for handles (e.g., users will be @user.exprsn.io)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">PDS Endpoint</label>
            <input
              type="text"
              value={pdsEndpoint}
              onChange={(e) => setPdsEndpoint(e.target.value)}
              placeholder="https://pds.example.com"
              className="w-full px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary"
            />
            <p className="text-text-muted text-xs mt-1">The AT Protocol PDS endpoint (for local dev: {API_BASE})</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">DNS Verification Token</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={dnsVerificationToken}
                onChange={(e) => setDnsVerificationToken(e.target.value)}
                placeholder="Enter or generate a token"
                className="flex-1 px-3 py-2 bg-surface-hover border border-border rounded-lg text-text-primary font-mono text-sm"
              />
              <button
                type="button"
                onClick={generateToken}
                className="px-3 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg text-sm whitespace-nowrap"
              >
                Generate
              </button>
            </div>
            <p className="text-text-muted text-xs mt-1">
              Users must add a TXT record with "exprsn-verification=[token]" to verify domain ownership
            </p>
          </div>

          <div className="bg-surface-hover border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-text-primary mb-2">DNS Instructions</h3>
            <ol className="text-text-muted text-xs space-y-1 list-decimal list-inside">
              <li>Go to your domain's DNS management</li>
              <li>Add a TXT record for your domain</li>
              <li>Set the value to: <code className="bg-surface px-1 rounded">exprsn-verification={dnsVerificationToken || '[token]'}</code></li>
              <li>Wait for DNS propagation (up to 48 hours)</li>
              <li>Click "Verify Domain" to confirm ownership</li>
            </ol>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-hover hover:bg-border text-text-primary rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
