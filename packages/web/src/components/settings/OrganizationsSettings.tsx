'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { OrganizationWithMembershipView, OrganizationRoleView } from '@/lib/api';

interface OrganizationsSettingsProps {
  onNavigateToOrg?: (orgId: string) => void;
}

export function OrganizationsSettings({ onNavigateToOrg }: OrganizationsSettingsProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteOrg, setDeleteOrg] = useState<OrganizationWithMembershipView | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user-organizations'],
    queryFn: () => api.getUserOrganizations(),
  });

  const organizations = data?.organizations || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-error-muted rounded-lg text-error">
        Failed to load organizations. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Your Organizations</h3>
          <p className="text-sm text-text-muted mt-1">
            Manage your team and organization memberships
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          <span>Create Organization</span>
        </button>
      </div>

      {/* Organizations list */}
      {organizations.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-lg border border-border">
          <OrgIcon className="w-12 h-12 mx-auto text-text-muted mb-4" />
          <h4 className="text-lg font-medium text-text-primary mb-2">No organizations yet</h4>
          <p className="text-sm text-text-muted mb-4">
            Create an organization to collaborate with your team
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors"
          >
            Create your first organization
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {organizations.map((org) => (
            <OrganizationCard
              key={org.id}
              organization={org}
              onManage={() => onNavigateToOrg?.(org.id)}
              onDelete={() => setDeleteOrg(org)}
            />
          ))}
        </div>
      )}

      {/* Create Organization Modal */}
      {showCreateModal && (
        <CreateOrganizationModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            refetch();
          }}
        />
      )}

      {/* Delete Organization Modal */}
      {deleteOrg && (
        <DeleteOrganizationModal
          organization={deleteOrg}
          onClose={() => setDeleteOrg(null)}
          onDeleted={() => {
            setDeleteOrg(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

interface OrganizationCardProps {
  organization: OrganizationWithMembershipView;
  onManage: () => void;
  onDelete: () => void;
}

function OrganizationCard({ organization, onManage, onDelete }: OrganizationCardProps) {
  const role = organization.membership.role;
  const roleName = typeof role === 'object' && 'displayName' in role ? role.displayName : role.name;
  const roleColor = typeof role === 'object' && 'color' in role ? role.color : undefined;
  const isOwner = roleName === 'Owner' || roleName === 'owner' || (typeof role === 'object' && role.name === 'owner');

  return (
    <div className="flex items-center gap-4 p-4 bg-surface rounded-lg border border-border hover:border-accent/50 transition-colors">
      {/* Avatar */}
      <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center overflow-hidden">
        {organization.avatar ? (
          <img
            src={organization.avatar}
            alt={organization.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-lg font-bold text-accent">
            {organization.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-text-primary truncate">
            {organization.displayName || organization.name}
          </h4>
          {organization.verified && (
            <VerifiedBadge className="w-4 h-4 text-accent flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {organization.handle && (
            <span className="text-sm text-text-muted">@{organization.handle}</span>
          )}
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: roleColor ? `${roleColor}20` : 'var(--color-surface-hover)',
              color: roleColor || 'var(--color-text-muted)',
            }}
          >
            {roleName}
          </span>
          <span className="text-xs text-text-muted capitalize">{organization.type}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onManage}
          className="px-3 py-1.5 text-sm font-medium text-text-primary bg-surface-hover rounded-lg hover:bg-border transition-colors"
        >
          Manage
        </button>
        {isOwner && (
          <button
            onClick={onDelete}
            className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10 transition-colors"
            title="Delete organization"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

interface CreateOrganizationModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateOrganizationModal({ onClose, onCreated }: CreateOrganizationModalProps) {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [type, setType] = useState<string>('team');
  const [bio, setBio] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin-specific fields
  const [domainId, setDomainId] = useState('');
  const [parentOrgId, setParentOrgId] = useState('');
  const [ownerHandle, setOwnerHandle] = useState('');

  // Check if user is admin
  const { data: adminSession } = useQuery({
    queryKey: ['admin-session'],
    queryFn: () => api.getAdminSession(),
    retry: false,
  });

  const isAdmin = !!adminSession?.admin;
  const canCreateForOthers = adminSession?.admin?.permissions?.includes('admin.orgs.create');

  // Fetch domains for admin
  const { data: domainsData } = useQuery({
    queryKey: ['admin-domains'],
    queryFn: () => api.adminDomainsList(),
    enabled: isAdmin,
  });

  // Fetch organizations for parent selection
  const { data: orgsData } = useQuery({
    queryKey: ['user-organizations'],
    queryFn: () => api.getUserOrganizations(),
  });

  const domains = domainsData?.domains || [];
  const availableParents = orgsData?.organizations || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isAdmin && canCreateForOthers && (domainId || parentOrgId || ownerHandle)) {
        // Use admin endpoint
        await api.adminCreateOrganization({
          name,
          type: type as 'team' | 'enterprise' | 'nonprofit' | 'business',
          domainId: domainId || undefined,
          parentOrganizationId: parentOrgId || undefined,
          ownerDid: ownerHandle ? `did:web:exprsn.local:user:${ownerHandle}` : undefined,
        });
      } else {
        await api.createOrganization({
          name,
          type: type as 'team' | 'enterprise' | 'nonprofit' | 'business',
        });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-background-alt rounded-xl shadow-2xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">Create Organization</h2>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-hover transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-error-muted text-error text-sm rounded-lg">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Organization Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Team"
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Handle (optional)
            </label>
            <div className="flex items-center">
              <span className="px-3 py-2 bg-surface-hover border border-r-0 border-border rounded-l-lg text-text-muted">
                @
              </span>
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                placeholder="myteam"
                className="flex-1 px-3 py-2 bg-surface border border-border rounded-r-lg text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <p className="text-xs text-text-muted mt-1">
              Used for your organization's public profile URL
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Organization Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="team">Team</option>
              <option value="enterprise">Enterprise</option>
              <option value="nonprofit">Nonprofit</option>
              <option value="business">Business</option>
            </select>
          </div>

          {/* Admin-only options */}
          {isAdmin && canCreateForOthers && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2 text-sm text-accent">
                <ShieldIcon className="w-4 h-4" />
                <span className="font-medium">Admin Options</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Domain (optional)
                </label>
                <select
                  value={domainId}
                  onChange={(e) => setDomainId(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value="">No domain association</option>
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.name} ({domain.domain})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-muted mt-1">
                  Associate this organization with a domain
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Parent Organization (optional)
                </label>
                <select
                  value={parentOrgId}
                  onChange={(e) => setParentOrgId(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary focus:border-accent focus:outline-none"
                >
                  <option value="">No parent (root organization)</option>
                  {availableParents.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.displayName || org.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-muted mt-1">
                  Create as a child of another organization
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-primary mb-1.5">
                  Owner Handle (optional)
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-2 bg-surface-hover border border-r-0 border-border rounded-l-lg text-text-muted">
                    @
                  </span>
                  <input
                    type="text"
                    value={ownerHandle}
                    onChange={(e) => setOwnerHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="username"
                    className="flex-1 px-3 py-2 bg-surface border border-border rounded-r-lg text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
                  />
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Create organization for another user (leave empty for yourself)
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Bio (optional)
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about your organization..."
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-accent focus:outline-none resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPublic(!isPublic)}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                isPublic ? 'bg-accent' : 'bg-surface-hover'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm',
                  isPublic ? 'left-[22px]' : 'left-0.5'
                )}
              />
            </button>
            <span className="text-sm text-text-primary">
              Public profile - visible to everyone
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name || isSubmitting}
              className="px-4 py-2 bg-accent text-text-inverse rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DeleteOrganizationModalProps {
  organization: OrganizationWithMembershipView;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteOrganizationModal({ organization, onClose, onDeleted }: DeleteOrganizationModalProps) {
  const [confirmName, setConfirmName] = useState('');
  const [childAction, setChildAction] = useState<'orphan' | 'reparent' | 'cascade'>('orphan');
  const [newParentId, setNewParentId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch child organizations
  const { data: childrenData } = useQuery({
    queryKey: ['org-children', organization.id],
    queryFn: () => api.getOrganizationChildren(organization.id),
  });

  // Fetch other organizations for reparenting
  const { data: orgsData } = useQuery({
    queryKey: ['user-organizations'],
    queryFn: () => api.getUserOrganizations(),
    enabled: childAction === 'reparent',
  });

  const childOrgs = childrenData?.organizations || [];
  const availableParents = (orgsData?.organizations || []).filter(
    (org) => org.id !== organization.id && !childOrgs.some((c) => c.id === org.id)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await api.deleteOrganization({
        organizationId: organization.id,
        confirmName,
        childAction: childOrgs.length > 0 ? childAction : undefined,
        newParentId: childAction === 'reparent' ? newParentId : undefined,
      });
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete organization');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = confirmName === (organization.displayName || organization.name) &&
    (childAction !== 'reparent' || newParentId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-background-alt rounded-xl shadow-2xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-error">Delete Organization</h2>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-hover transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-error-muted text-error text-sm rounded-lg">{error}</div>
          )}

          <div className="p-4 bg-error/10 border border-error/20 rounded-lg">
            <p className="text-sm text-text-primary">
              This action <strong>cannot be undone</strong>. This will permanently delete the
              <strong> {organization.displayName || organization.name}</strong> organization,
              including all settings, roles, and member associations.
            </p>
          </div>

          {/* Child organizations warning */}
          {childOrgs.length > 0 && (
            <div className="space-y-3">
              <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                <p className="text-sm text-text-primary">
                  This organization has <strong>{childOrgs.length} child organization(s)</strong>.
                  Choose how to handle them:
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 bg-surface rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
                  <input
                    type="radio"
                    name="childAction"
                    value="orphan"
                    checked={childAction === 'orphan'}
                    onChange={() => setChildAction('orphan')}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-text-primary">Make them root organizations</p>
                    <p className="text-xs text-text-muted">Child organizations will become independent</p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 bg-surface rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
                  <input
                    type="radio"
                    name="childAction"
                    value="reparent"
                    checked={childAction === 'reparent'}
                    onChange={() => setChildAction('reparent')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">Move to another organization</p>
                    <p className="text-xs text-text-muted mb-2">Transfer children to a new parent</p>
                    {childAction === 'reparent' && (
                      <select
                        value={newParentId}
                        onChange={(e) => setNewParentId(e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-text-primary text-sm focus:border-accent focus:outline-none"
                      >
                        <option value="">Select new parent...</option>
                        {availableParents.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.displayName || org.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 bg-surface rounded-lg cursor-pointer hover:bg-surface-hover transition-colors">
                  <input
                    type="radio"
                    name="childAction"
                    value="cascade"
                    checked={childAction === 'cascade'}
                    onChange={() => setChildAction('cascade')}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-medium text-error">Delete all children</p>
                    <p className="text-xs text-text-muted">All child organizations will be permanently deleted</p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Confirm name */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">
              Type <strong>{organization.displayName || organization.name}</strong> to confirm
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={organization.displayName || organization.name}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:border-error focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="px-4 py-2 bg-error text-white rounded-lg hover:bg-error/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Deleting...' : 'Delete Organization'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Icons
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function OrgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  );
}

function VerifiedBadge({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}
