// @ts-nocheck
'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import { PageHeader, Badge } from '@/components/admin/ui';
import { ProviderForm } from '@/components/admin/sso';

const PROVIDER_TEMPLATES = [
  {
    id: 'google',
    name: 'Google Workspace',
    type: 'oidc' as const,
    logo: '/logos/google.svg',
    description: 'Sign in with Google accounts',
    config: {
      issuer: 'https://accounts.google.com',
      scopes: ['openid', 'profile', 'email'],
    },
  },
  {
    id: 'microsoft',
    name: 'Microsoft Entra ID',
    type: 'oidc' as const,
    logo: '/logos/microsoft.svg',
    description: 'Sign in with Microsoft accounts',
    config: {
      issuer: 'https://login.microsoftonline.com/common/v2.0',
      scopes: ['openid', 'profile', 'email'],
    },
  },
  {
    id: 'okta',
    name: 'Okta',
    type: 'oidc' as const,
    logo: '/logos/okta.svg',
    description: 'Enterprise identity management',
    config: {
      scopes: ['openid', 'profile', 'email', 'groups'],
    },
  },
  {
    id: 'onelogin',
    name: 'OneLogin',
    type: 'saml' as const,
    logo: '/logos/onelogin.svg',
    description: 'SAML-based SSO',
    config: {},
  },
  {
    id: 'github',
    name: 'GitHub',
    type: 'oauth2' as const,
    logo: '/logos/github.svg',
    description: 'Sign in with GitHub',
    config: {
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      scopes: ['read:user', 'user:email'],
    },
  },
  {
    id: 'exprsn',
    name: 'Exprsn',
    type: 'oidc' as const,
    description: 'Connect another Exprsn instance with scope management and role mapping',
    config: {
      scopes: ['openid', 'profile', 'email'],
    },
    isExprsn: true,
  },
  {
    id: 'custom-oidc',
    name: 'Custom OIDC',
    type: 'oidc' as const,
    description: 'Configure a custom OpenID Connect provider',
    config: {
      scopes: ['openid', 'profile', 'email'],
    },
  },
  {
    id: 'custom-saml',
    name: 'Custom SAML',
    type: 'saml' as const,
    description: 'Configure a custom SAML 2.0 provider',
    config: {},
  },
  {
    id: 'custom-oauth2',
    name: 'Custom OAuth 2.0',
    type: 'oauth2' as const,
    description: 'Configure a custom OAuth 2.0 provider',
    config: {},
  },
];

export default function NewSSOProviderPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const domainId = params.domainId as string;
  const { setSelectedDomain } = useAdminDomain();
  const [selectedTemplate, setSelectedTemplate] = useState<typeof PROVIDER_TEMPLATES[0] | null>(null);

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const handleTemplateSelect = (template: typeof PROVIDER_TEMPLATES[0]) => {
    // Route Exprsn to dedicated config page with discovery, scope management, and role mapping
    if (template.id === 'exprsn') {
      router.push(`/admin/d/${domainId}/settings/sso/exprsn`);
      return;
    }
    setSelectedTemplate(template);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => api.adminDomainSSOProvidersAdd(domainId, data),
    onSuccess: (result) => {
      toast.success('Provider added successfully');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'sso'] });
      router.push(`/admin/d/${domainId}/settings/sso/providers/${result.id}`);
    },
    onError: () => {
      toast.error('Failed to add provider');
    },
  });

  if (!selectedTemplate) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Add Identity Provider"
          description="Select a provider template to get started"
        />

        <div className="grid grid-cols-3 gap-4">
          {PROVIDER_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateSelect(template)}
              className={`p-5 bg-surface hover:bg-surface-hover border rounded-xl text-left transition-all group ${
                template.id === 'exprsn'
                  ? 'border-accent/30 hover:border-accent ring-1 ring-accent/10'
                  : 'border-border hover:border-accent/50'
              }`}
            >
              <div className="flex items-start gap-4">
                {template.id === 'exprsn' ? (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent/10">
                    <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 1L3 5v6c0 5.25 3.75 10.15 9 11.35C17.25 21.15 21 16.25 21 11V5l-9-4zm-1 13l-3-3 1.41-1.41L11 11.17l4.59-4.58L17 8l-6 6z" />
                    </svg>
                  </div>
                ) : template.logo ? (
                  <img src={template.logo} alt="" className="w-10 h-10 object-contain" />
                ) : (
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    template.type === 'oidc' ? 'bg-blue-500/10' :
                    template.type === 'saml' ? 'bg-purple-500/10' : 'bg-green-500/10'
                  }`}>
                    <svg className={`w-5 h-5 ${
                      template.type === 'oidc' ? 'text-blue-500' :
                      template.type === 'saml' ? 'text-purple-500' : 'text-green-500'
                    }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-text-primary group-hover:text-accent">
                      {template.name}
                    </h4>
                    <Badge variant={
                      template.id === 'exprsn' ? 'accent' :
                      template.type === 'oidc' ? 'info' :
                      template.type === 'saml' ? 'purple' : 'success'
                    } size="sm">
                      {template.id === 'exprsn' ? 'OIDC + SCOPES' : template.type.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-text-muted mt-1">{template.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Add ${selectedTemplate.name}`}
        description="Configure the identity provider settings"
        actions={
          <button
            onClick={() => setSelectedTemplate(null)}
            className="text-sm text-text-muted hover:text-text-primary"
          >
            ← Back to templates
          </button>
        }
      />

      <div className="max-w-2xl">
        <ProviderForm
          mode="create"
          initialData={{
            name: selectedTemplate.name,
            type: selectedTemplate.type,
            enabled: true,
            ...selectedTemplate.config,
          }}
          onSubmit={createMutation.mutate}
          onCancel={() => router.push(`/admin/d/${domainId}/settings/sso/providers`)}
          isSubmitting={createMutation.isPending}
        />
      </div>
    </div>
  );
}
