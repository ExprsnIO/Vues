// @ts-nocheck
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
  SearchInput,
  ConfirmDialog,
  Modal,
  FormField,
  Input,
  Toggle,
  PageSkeleton,
} from '@/components/admin/ui';

interface EmailDomain {
  id: string;
  domain: string;
  verified: boolean;
  verificationMethod: 'dns' | 'email' | 'manual';
  verificationToken?: string;
  autoJoin: boolean;
  defaultRole?: string;
  providerId?: string;
  providerName?: string;
  createdAt: string;
  verifiedAt?: string;
}

export default function SSOEmailDomainsPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmailDomain | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<EmailDomain | null>(null);
  const [newDomain, setNewDomain] = useState({
    domain: '',
    autoJoin: false,
    defaultRole: 'member',
    providerId: '',
  });

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'email-domains', search],
    queryFn: () => api.adminDomainSSOEmailDomainsList(domainId),
    enabled: !!domainId,
  });

  const { data: providersData } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'sso', 'providers'],
    queryFn: () => api.adminDomainSSOProvidersList(domainId),
    enabled: !!domainId,
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => api.adminDomainSSOEmailDomainsAdd(domainId, data),
    onSuccess: () => {
      toast.success('Email domain added');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'email-domains'] });
      setShowAddModal(false);
      setNewDomain({ domain: '', autoJoin: false, defaultRole: 'member', providerId: '' });
    },
    onError: () => {
      toast.error('Failed to add email domain');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainSSOEmailDomainsVerify(domainId, id),
    onSuccess: () => {
      toast.success('Domain verified');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'email-domains'] });
      setVerifyTarget(null);
    },
    onError: () => {
      toast.error('Verification failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.adminDomainSSOEmailDomainsRemove(domainId, id),
    onSuccess: () => {
      toast.success('Email domain removed');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'email-domains'] });
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error('Failed to remove email domain');
    },
  });

  const toggleAutoJoinMutation = useMutation({
    mutationFn: ({ id, autoJoin }: { id: string; autoJoin: boolean }) =>
      api.adminDomainSSOEmailDomainsUpdate(domainId, id, { autoJoin }),
    onSuccess: () => {
      toast.success('Auto-join updated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso', 'email-domains'] });
    },
    onError: () => {
      toast.error('Failed to update auto-join');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  let emailDomains: EmailDomain[] = data?.domains || [];
  const providers = providersData?.providers || [];

  if (search) {
    emailDomains = emailDomains.filter(d =>
      d.domain.toLowerCase().includes(search.toLowerCase())
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email Domains"
        description={`Allowed email domains for ${selectedDomain?.name || 'this domain'}`}
        actions={
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Add Domain
          </button>
        }
      />

      {/* Info Banner */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-500">Email Domain Restrictions</p>
            <p className="text-sm text-text-muted mt-1">
              Only users with email addresses from verified domains can sign in via SSO.
              Enable auto-join to automatically add new users when they sign in.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search domains..."
          className="w-64"
        />
      </div>

      {/* Domains List */}
      {emailDomains.length === 0 ? (
        <div className="p-12 bg-surface border border-border rounded-xl text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-surface-hover rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
          <h4 className="text-lg font-medium text-text-primary mb-2">
            {search ? 'No domains match your search' : 'No email domains configured'}
          </h4>
          <p className="text-sm text-text-muted mb-4">
            {search ? 'Try a different search term' : 'Add email domains to restrict SSO access'}
          </p>
          {!search && (
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
            >
              Add First Domain
            </button>
          )}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-hover">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Domain</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Auto-Join</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Default Role</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {emailDomains.map((domain) => (
                <tr key={domain.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">@{domain.domain}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {domain.verified ? (
                      <Badge variant="success">Verified</Badge>
                    ) : (
                      <button
                        onClick={() => setVerifyTarget(domain)}
                        className="inline-flex items-center gap-1"
                      >
                        <Badge variant="warning">Pending</Badge>
                        <span className="text-xs text-accent hover:underline">Verify</span>
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {domain.providerName || 'Any provider'}
                  </td>
                  <td className="px-4 py-3">
                    <Toggle
                      checked={domain.autoJoin}
                      onChange={(autoJoin) => toggleAutoJoinMutation.mutate({ id: domain.id, autoJoin })}
                      size="sm"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="default">{domain.defaultRole || 'member'}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setDeleteTarget(domain)}
                      className="text-sm text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Domain Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Email Domain"
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addMutation.mutate(newDomain);
          }}
          className="space-y-4"
        >
          <FormField label="Domain" required hint="e.g., company.com">
            <Input
              value={newDomain.domain}
              onChange={(e) => setNewDomain({ ...newDomain, domain: e.target.value })}
              placeholder="example.com"
            />
          </FormField>

          <FormField label="Link to Provider" hint="Optionally restrict to a specific provider">
            <select
              value={newDomain.providerId}
              onChange={(e) => setNewDomain({ ...newDomain, providerId: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Any Provider</option>
              {providers.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Default Role" hint="Role assigned to auto-joined users">
            <select
              value={newDomain.defaultRole}
              onChange={(e) => setNewDomain({ ...newDomain, defaultRole: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
              <option value="contributor">Contributor</option>
            </select>
          </FormField>

          <Toggle
            checked={newDomain.autoJoin}
            onChange={(autoJoin) => setNewDomain({ ...newDomain, autoJoin })}
            label="Enable Auto-Join"
            description="Automatically create accounts for users from this domain"
          />

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newDomain.domain || addMutation.isPending}
              className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              {addMutation.isPending ? 'Adding...' : 'Add Domain'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Verification Modal */}
      <Modal
        isOpen={!!verifyTarget}
        onClose={() => setVerifyTarget(null)}
        title="Verify Domain"
        size="md"
      >
        {verifyTarget && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              To verify ownership of <strong>@{verifyTarget.domain}</strong>, add one of the following DNS records:
            </p>

            <div className="p-4 bg-surface-hover rounded-lg space-y-3">
              <div>
                <p className="text-xs font-medium text-text-muted uppercase mb-1">TXT Record</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-surface rounded text-sm font-mono text-text-primary">
                    _exprsn-verification={verifyTarget.verificationToken || 'LOADING...'}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`_exprsn-verification=${verifyTarget.verificationToken}`);
                      toast.success('Copied to clipboard');
                    }}
                    className="p-2 text-text-muted hover:text-text-primary"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-border">
                <p className="text-xs text-text-muted">
                  Add this TXT record to your domain's DNS settings. Verification may take up to 24 hours to propagate.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setVerifyTarget(null)}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => verifyMutation.mutate(verifyTarget.id)}
                disabled={verifyMutation.isPending}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
              >
                {verifyMutation.isPending ? 'Checking...' : 'Check Verification'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        title="Remove Email Domain?"
        message={`Are you sure you want to remove @${deleteTarget?.domain}? Users from this domain will no longer be able to sign in via SSO.`}
        confirmLabel="Remove"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
