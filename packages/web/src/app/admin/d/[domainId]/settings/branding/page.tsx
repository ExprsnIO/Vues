// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import toast from 'react-hot-toast';

interface Branding {
  name: string;
  tagline?: string;
  logo?: string;
  favicon?: string;
  primaryColor: string;
  accentColor: string;
  darkMode: boolean;
  customCSS?: string;
}

export default function DomainBrandingPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const queryClient = useQueryClient();

  const [branding, setBranding] = useState<Branding>({
    name: '',
    tagline: '',
    primaryColor: '#6366f1',
    accentColor: '#8b5cf6',
    darkMode: true,
  });

  useEffect(() => {
    if (domainId) setSelectedDomain(domainId);
  }, [domainId, setSelectedDomain]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId],
    queryFn: () => api.adminDomainsGet(domainId),
    enabled: !!domainId,
  });

  useEffect(() => {
    if (data?.domain) {
      setBranding(prev => ({
        ...prev,
        name: data.domain.name,
        ...(data.domain.branding || {}),
      }));
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: (brandingConfig: Branding) =>
      api.adminDomainsUpdate({ id: domainId, branding: brandingConfig }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId] });
      toast.success('Branding saved');
    },
    onError: () => toast.error('Failed to save branding'),
  });

  const domain = data?.domain;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Branding</h1>
        <p className="text-text-muted">{domain?.name || 'Loading...'}</p>
      </div>

      {/* Basic Info */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Basic Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Display Name</label>
            <input
              type="text"
              value={branding.name}
              onChange={(e) => setBranding(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Tagline</label>
            <input
              type="text"
              value={branding.tagline || ''}
              onChange={(e) => setBranding(prev => ({ ...prev, tagline: e.target.value }))}
              className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
            />
          </div>
        </div>
      </div>

      {/* Logo & Favicon */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Logo & Favicon</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-text-muted mb-2">Logo</label>
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              {branding.logo ? (
                <img src={branding.logo} alt="Logo" className="max-h-16 mx-auto mb-2" />
              ) : (
                <div className="w-16 h-16 bg-surface-hover rounded-lg mx-auto mb-2 flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-text-muted" />
                </div>
              )}
              <button className="text-accent hover:text-accent-hover text-sm">Upload Logo</button>
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-2">Favicon</label>
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
              {branding.favicon ? (
                <img src={branding.favicon} alt="Favicon" className="w-8 h-8 mx-auto mb-2" />
              ) : (
                <div className="w-8 h-8 bg-surface-hover rounded mx-auto mb-2 flex items-center justify-center">
                  <ImageIcon className="w-4 h-4 text-text-muted" />
                </div>
              )}
              <button className="text-accent hover:text-accent-hover text-sm">Upload Favicon</button>
            </div>
          </div>
        </div>
      </div>

      {/* Colors */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Colors</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-text-muted mb-1">Primary Color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={branding.primaryColor}
                onChange={(e) => setBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="w-12 h-10 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={branding.primaryColor}
                onChange={(e) => setBranding(prev => ({ ...prev, primaryColor: e.target.value }))}
                className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Accent Color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={branding.accentColor}
                onChange={(e) => setBranding(prev => ({ ...prev, accentColor: e.target.value }))}
                className="w-12 h-10 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={branding.accentColor}
                onChange={(e) => setBranding(prev => ({ ...prev, accentColor: e.target.value }))}
                className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-muted mb-1">Dark Mode</label>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={branding.darkMode}
                onChange={(e) => setBranding(prev => ({ ...prev, darkMode: e.target.checked }))}
                className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
              />
              <span className="text-text-primary">Default to dark mode</span>
            </label>
          </div>
        </div>
      </div>

      {/* Custom CSS */}
      <div className="bg-surface border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Custom CSS</h2>
        <textarea
          value={branding.customCSS || ''}
          onChange={(e) => setBranding(prev => ({ ...prev, customCSS: e.target.value }))}
          rows={8}
          placeholder="/* Custom CSS styles */"
          className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary font-mono text-sm resize-none"
        />
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={() => updateMutation.mutate(branding)}
          disabled={updateMutation.isPending}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
        >
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
