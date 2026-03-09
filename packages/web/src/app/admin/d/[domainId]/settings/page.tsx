'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

export default function DomainSettingsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
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

  const settingsLinks = [
    { href: `/admin/d/${domainId}/settings/services`, label: 'Services & Features', description: 'Configure available services and features' },
    { href: `/admin/d/${domainId}/settings/identity`, label: 'Identity (PLC)', description: 'Manage PLC and identity settings' },
    { href: `/admin/d/${domainId}/settings/sso`, label: 'SSO', description: 'Single sign-on configuration' },
    { href: `/admin/d/${domainId}/settings/certificates`, label: 'Certificates', description: 'TLS and code signing certificates' },
    { href: `/admin/d/${domainId}/settings/branding`, label: 'Branding', description: 'Customize domain appearance' },
    { href: `/admin/d/${domainId}/settings/federation`, label: 'Federation', description: 'AT Protocol federation settings', show: domain.type === 'federated' },
  ];

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
          </div>
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

      {/* Settings Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settingsLinks
          .filter(link => link.show !== false)
          .map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="bg-surface border border-border rounded-lg p-6 hover:border-accent transition-colors"
            >
              <h3 className="text-lg font-semibold text-text-primary">{link.label}</h3>
              <p className="text-text-muted text-sm mt-1">{link.description}</p>
            </Link>
          ))}
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
    </div>
  );
}
