'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

type Step = 'basic' | 'verification' | 'services' | 'certificates' | 'complete';
type DomainType = 'hosted' | 'federated';

interface FormData {
  name: string;
  domain: string;
  type: DomainType;
  handleSuffix: string;
  pdsEndpoint: string;
  features: {
    videoHosting: boolean;
    liveStreaming: boolean;
    messaging: boolean;
    feedGeneration: boolean;
    customBranding: boolean;
    apiAccess: boolean;
    analytics: boolean;
  };
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    dailyUploadLimit: number;
    storageQuotaGb: number;
  };
  certificates: {
    createIntermediate: boolean;
    createServerCert: boolean;
    createCodeSigningCert: boolean;
    serverSans: string[];
    intermediateName: string;
  };
}

const DEFAULT_FEATURES = {
  videoHosting: true,
  liveStreaming: true,
  messaging: true,
  feedGeneration: true,
  customBranding: false,
  apiAccess: false,
  analytics: true,
};

const DEFAULT_RATE_LIMITS = {
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  dailyUploadLimit: 100,
  storageQuotaGb: 10,
};

const DEFAULT_CERTIFICATES = {
  createIntermediate: true,
  createServerCert: true,
  createCodeSigningCert: true,
  serverSans: [] as string[],
  intermediateName: '',
};

export default function NewDomainPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('basic');
  const [createdDomain, setCreatedDomain] = useState<{
    id: string;
    dnsVerificationToken: string;
  } | null>(null);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    domain: '',
    type: 'hosted',
    handleSuffix: '',
    pdsEndpoint: '',
    features: DEFAULT_FEATURES,
    rateLimits: DEFAULT_RATE_LIMITS,
    certificates: DEFAULT_CERTIFICATES,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.adminDomainsCreate({
        name: formData.name,
        domain: formData.domain,
        type: formData.type,
        handleSuffix: formData.handleSuffix || `.${formData.domain}`,
        pdsEndpoint: formData.type === 'federated' ? formData.pdsEndpoint : undefined,
        features: formData.features,
        rateLimits: formData.rateLimits,
      }),
    onSuccess: (data) => {
      setCreatedDomain({
        id: data.domain.id,
        dnsVerificationToken: data.domain.dnsVerificationToken,
      });
      setStep('verification');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create domain');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: () => api.adminDomainsVerify(createdDomain!.id),
    onSuccess: () => {
      toast.success('Domain verified successfully');
      setStep('complete');
    },
    onError: () => {
      toast.error('Verification failed. Please check your DNS records.');
    },
  });

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateFeature = (key: keyof FormData['features'], value: boolean) => {
    setFormData((prev) => ({
      ...prev,
      features: { ...prev.features, [key]: value },
    }));
  };

  const updateRateLimit = (key: keyof FormData['rateLimits'], value: number) => {
    setFormData((prev) => ({
      ...prev,
      rateLimits: { ...prev.rateLimits, [key]: value },
    }));
  };

  const steps: { id: Step; label: string; number: number }[] = [
    { id: 'basic', label: 'Basic Info', number: 1 },
    { id: 'verification', label: 'Verification', number: 2 },
    { id: 'services', label: 'Services', number: 3 },
    { id: 'certificates', label: 'Certificates', number: 4 },
    { id: 'complete', label: 'Complete', number: 5 },
  ];

  const updateCertificates = (key: keyof FormData['certificates'], value: any) => {
    setFormData((prev) => ({
      ...prev,
      certificates: { ...prev.certificates, [key]: value },
    }));
  };

  const currentStepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/domains"
          className="p-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Add Domain</h1>
          <p className="text-text-muted mt-1">Configure a new hosted or federated domain</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  i <= currentStepIndex
                    ? 'bg-accent text-text-inverse'
                    : 'bg-surface-hover text-text-muted'
                }`}
              >
                {s.number}
              </div>
              <span
                className={`ml-2 text-sm ${
                  i <= currentStepIndex ? 'text-text-primary' : 'text-text-muted'
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div
                  className={`w-16 h-0.5 mx-4 ${
                    i < currentStepIndex ? 'bg-accent' : 'bg-surface-hover'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-surface border border-border rounded-xl p-6">
        {step === 'basic' && (
          <BasicInfoStep
            formData={formData}
            updateField={updateField}
            onNext={() => createMutation.mutate()}
            isCreating={createMutation.isPending}
          />
        )}
        {step === 'verification' && createdDomain && (
          <VerificationStep
            domain={formData.domain}
            dnsToken={createdDomain.dnsVerificationToken}
            onVerify={() => verifyMutation.mutate()}
            onSkip={() => setStep('services')}
            isVerifying={verifyMutation.isPending}
          />
        )}
        {step === 'services' && (
          <ServicesStep
            features={formData.features}
            rateLimits={formData.rateLimits}
            updateFeature={updateFeature}
            updateRateLimit={updateRateLimit}
            onNext={() => setStep('certificates')}
            onBack={() => setStep('verification')}
          />
        )}
        {step === 'certificates' && (
          <CertificatesStep
            domain={formData.domain}
            certificates={formData.certificates}
            updateCertificates={updateCertificates}
            onNext={() => setStep('complete')}
            onBack={() => setStep('services')}
          />
        )}
        {step === 'complete' && createdDomain && (
          <CompleteStep domainId={createdDomain.id} domainName={formData.name} />
        )}
      </div>
    </div>
  );
}

// Basic Info Step
function BasicInfoStep({
  formData,
  updateField,
  onNext,
  isCreating,
}: {
  formData: FormData;
  updateField: <K extends keyof FormData>(field: K, value: FormData[K]) => void;
  onNext: () => void;
  isCreating: boolean;
}) {
  const isValid = formData.name && formData.domain;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Basic Information</h2>
        <p className="text-text-muted text-sm">Enter the basic details for your domain</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Domain Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="My Domain"
            className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="text-text-muted text-xs mt-1">A friendly name for this domain</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Domain *
          </label>
          <input
            type="text"
            value={formData.domain}
            onChange={(e) => updateField('domain', e.target.value.toLowerCase())}
            placeholder="example.com"
            className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="text-text-muted text-xs mt-1">The domain hostname (e.g., example.com)</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Domain Type *
          </label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => updateField('type', 'hosted')}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                formData.type === 'hosted'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-text-muted'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <ServerIcon className="w-5 h-5 text-accent" />
                <span className="font-medium text-text-primary">Hosted</span>
              </div>
              <p className="text-sm text-text-muted">
                Fully managed domain hosted on Exprsn infrastructure
              </p>
            </button>
            <button
              type="button"
              onClick={() => updateField('type', 'federated')}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                formData.type === 'federated'
                  ? 'border-accent bg-accent/10'
                  : 'border-border hover:border-text-muted'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <GlobeIcon className="w-5 h-5 text-purple-400" />
                <span className="font-medium text-text-primary">Federated</span>
              </div>
              <p className="text-sm text-text-muted">
                Connect to an external PDS via AT Protocol federation
              </p>
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">
            Handle Suffix
          </label>
          <div className="flex items-center gap-2">
            <span className="text-text-muted">@user</span>
            <input
              type="text"
              value={formData.handleSuffix}
              onChange={(e) => updateField('handleSuffix', e.target.value)}
              placeholder={`.${formData.domain || 'example.com'}`}
              className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <p className="text-text-muted text-xs mt-1">
            The suffix for user handles (e.g., @user.example.com)
          </p>
        </div>

        {formData.type === 'federated' && (
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              PDS Endpoint
            </label>
            <input
              type="text"
              value={formData.pdsEndpoint}
              onChange={(e) => updateField('pdsEndpoint', e.target.value)}
              placeholder="https://pds.example.com"
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="text-text-muted text-xs mt-1">
              The URL of the federated PDS server
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4 border-t border-border">
        <button
          onClick={onNext}
          disabled={!isValid || isCreating}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

// Verification Step
function VerificationStep({
  domain,
  dnsToken,
  onVerify,
  onSkip,
  isVerifying,
}: {
  domain: string;
  dnsToken: string;
  onVerify: () => void;
  onSkip: () => void;
  isVerifying: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Verify Domain Ownership</h2>
        <p className="text-text-muted text-sm">
          Add a DNS TXT record to verify you own this domain
        </p>
      </div>

      <div className="bg-background rounded-lg p-4 space-y-3">
        <div>
          <p className="text-sm text-text-muted mb-1">Record Type</p>
          <p className="text-text-primary font-mono">TXT</p>
        </div>
        <div>
          <p className="text-sm text-text-muted mb-1">Host / Name</p>
          <p className="text-text-primary font-mono">_exprsn-verify.{domain}</p>
        </div>
        <div>
          <p className="text-sm text-text-muted mb-1">Value</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-text-primary font-mono text-sm bg-surface-hover p-2 rounded break-all">
              {dnsToken}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(dnsToken);
                toast.success('Copied to clipboard');
              }}
              className="p-2 text-text-muted hover:text-text-primary transition-colors"
            >
              <CopyIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
        <p className="text-yellow-400 text-sm">
          DNS changes can take up to 24 hours to propagate. You can skip this step and verify later.
        </p>
      </div>

      <div className="flex justify-between pt-4 border-t border-border">
        <button
          onClick={onSkip}
          className="px-6 py-2 text-text-muted hover:text-text-primary transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={onVerify}
          disabled={isVerifying}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
        >
          {isVerifying ? 'Verifying...' : 'Verify DNS'}
        </button>
      </div>
    </div>
  );
}

// Services Step
function ServicesStep({
  features,
  rateLimits,
  updateFeature,
  updateRateLimit,
  onNext,
  onBack,
}: {
  features: FormData['features'];
  rateLimits: FormData['rateLimits'];
  updateFeature: (key: keyof FormData['features'], value: boolean) => void;
  updateRateLimit: (key: keyof FormData['rateLimits'], value: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const featureList: { key: keyof typeof features; label: string; description: string }[] = [
    { key: 'videoHosting', label: 'Video Hosting', description: 'Enable video uploads' },
    { key: 'liveStreaming', label: 'Live Streaming', description: 'Enable live broadcasts' },
    { key: 'messaging', label: 'Messaging', description: 'Enable direct messages' },
    { key: 'feedGeneration', label: 'Custom Feeds', description: 'Enable feed algorithms' },
    { key: 'customBranding', label: 'Custom Branding', description: 'Enable brand customization' },
    { key: 'apiAccess', label: 'API Access', description: 'Enable API usage' },
    { key: 'analytics', label: 'Analytics', description: 'Enable analytics dashboard' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Configure Services</h2>
        <p className="text-text-muted text-sm">Choose which features to enable for this domain</p>
      </div>

      <div className="space-y-3">
        {featureList.map((feature) => (
          <div
            key={feature.key}
            className="flex items-center justify-between p-3 bg-background rounded-lg"
          >
            <div>
              <p className="text-text-primary font-medium">{feature.label}</p>
              <p className="text-text-muted text-sm">{feature.description}</p>
            </div>
            <button
              onClick={() => updateFeature(feature.key, !features[feature.key])}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                features[feature.key] ? 'bg-accent' : 'bg-surface-hover'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  features[feature.key] ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-border">
        <h3 className="text-md font-medium text-text-primary mb-3">Rate Limits</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-text-muted">Requests/minute</label>
            <input
              type="number"
              value={rateLimits.requestsPerMinute}
              onChange={(e) => updateRateLimit('requestsPerMinute', parseInt(e.target.value))}
              className="w-full px-3 py-2 mt-1 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="text-sm text-text-muted">Requests/hour</label>
            <input
              type="number"
              value={rateLimits.requestsPerHour}
              onChange={(e) => updateRateLimit('requestsPerHour', parseInt(e.target.value))}
              className="w-full px-3 py-2 mt-1 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="text-sm text-text-muted">Daily uploads</label>
            <input
              type="number"
              value={rateLimits.dailyUploadLimit}
              onChange={(e) => updateRateLimit('dailyUploadLimit', parseInt(e.target.value))}
              className="w-full px-3 py-2 mt-1 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>
          <div>
            <label className="text-sm text-text-muted">Storage (GB)</label>
            <input
              type="number"
              value={rateLimits.storageQuotaGb}
              onChange={(e) => updateRateLimit('storageQuotaGb', parseInt(e.target.value))}
              className="w-full px-3 py-2 mt-1 bg-background border border-border rounded-lg text-text-primary"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t border-border">
        <button
          onClick={onBack}
          className="px-6 py-2 text-text-muted hover:text-text-primary transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// Certificates Step
function CertificatesStep({
  domain,
  certificates,
  updateCertificates,
  onNext,
  onBack,
}: {
  domain: string;
  certificates: FormData['certificates'];
  updateCertificates: (key: keyof FormData['certificates'], value: any) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [newSan, setNewSan] = useState('');

  const addSan = () => {
    if (newSan.trim() && !certificates.serverSans.includes(newSan.trim())) {
      updateCertificates('serverSans', [...certificates.serverSans, newSan.trim()]);
      setNewSan('');
    }
  };

  const removeSan = (san: string) => {
    updateCertificates('serverSans', certificates.serverSans.filter((s) => s !== san));
  };

  // Default SANs that will be included
  const defaultSans = domain ? [
    domain,
    `*.${domain}`,
    `pds.${domain}`,
    `api.${domain}`,
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Certificate Configuration</h2>
        <p className="text-text-muted text-sm">
          Configure SSL/TLS certificates and code signing for your domain
        </p>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <InfoIcon className="w-5 h-5 text-blue-400 mt-0.5" />
          <div>
            <p className="text-blue-400 font-medium text-sm">Automatic Certificate Generation</p>
            <p className="text-text-muted text-sm mt-1">
              Certificates will be automatically generated when the domain is created. You can customize the settings below.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Intermediate CA */}
        <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
          <div>
            <div className="flex items-center gap-2">
              <CertIcon className="w-5 h-5 text-purple-400" />
              <span className="font-medium text-text-primary">Intermediate CA</span>
            </div>
            <p className="text-text-muted text-sm mt-1">
              Create an intermediate certificate authority for this domain
            </p>
          </div>
          <button
            onClick={() => updateCertificates('createIntermediate', !certificates.createIntermediate)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              certificates.createIntermediate ? 'bg-accent' : 'bg-surface-hover'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                certificates.createIntermediate ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {certificates.createIntermediate && (
          <div className="ml-8 p-4 bg-surface rounded-lg border border-border">
            <label className="block text-sm font-medium text-text-primary mb-1">
              Intermediate CA Name
            </label>
            <input
              type="text"
              value={certificates.intermediateName}
              onChange={(e) => updateCertificates('intermediateName', e.target.value)}
              placeholder={`${domain} Intermediate CA`}
              className="w-full px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted"
            />
          </div>
        )}

        {/* Server Certificate */}
        <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
          <div>
            <div className="flex items-center gap-2">
              <LockIcon className="w-5 h-5 text-green-400" />
              <span className="font-medium text-text-primary">Server Certificate</span>
            </div>
            <p className="text-text-muted text-sm mt-1">
              Create SSL/TLS certificate for HTTPS connections
            </p>
          </div>
          <button
            onClick={() => updateCertificates('createServerCert', !certificates.createServerCert)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              certificates.createServerCert ? 'bg-accent' : 'bg-surface-hover'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                certificates.createServerCert ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {certificates.createServerCert && (
          <div className="ml-8 p-4 bg-surface rounded-lg border border-border space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Default Subject Alternative Names
              </label>
              <div className="flex flex-wrap gap-2">
                {defaultSans.map((san) => (
                  <span
                    key={san}
                    className="px-3 py-1 bg-surface-hover text-text-secondary text-sm rounded-full"
                  >
                    {san}
                  </span>
                ))}
              </div>
              <p className="text-text-muted text-xs mt-2">
                These SANs will be automatically included in the server certificate
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                Additional SANs (optional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSan}
                  onChange={(e) => setNewSan(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSan())}
                  placeholder="subdomain.example.com"
                  className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-muted"
                />
                <button
                  onClick={addSan}
                  className="px-4 py-2 bg-surface-hover hover:bg-background text-text-primary rounded-lg"
                >
                  Add
                </button>
              </div>
              {certificates.serverSans.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {certificates.serverSans.map((san) => (
                    <span
                      key={san}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-accent/10 text-accent text-sm rounded-full"
                    >
                      {san}
                      <button onClick={() => removeSan(san)} className="hover:text-accent-hover">
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Code Signing Certificate */}
        <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
          <div>
            <div className="flex items-center gap-2">
              <CodeIcon className="w-5 h-5 text-orange-400" />
              <span className="font-medium text-text-primary">Code Signing Certificate</span>
            </div>
            <p className="text-text-muted text-sm mt-1">
              Create certificate for signing code and packages
            </p>
          </div>
          <button
            onClick={() => updateCertificates('createCodeSigningCert', !certificates.createCodeSigningCert)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              certificates.createCodeSigningCert ? 'bg-accent' : 'bg-surface-hover'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                certificates.createCodeSigningCert ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex justify-between pt-4 border-t border-border">
        <button
          onClick={onBack}
          className="px-6 py-2 text-text-muted hover:text-text-primary transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          Complete Setup
        </button>
      </div>
    </div>
  );
}

// Complete Step
function CompleteStep({ domainId, domainName }: { domainId: string; domainName: string }) {
  const router = useRouter();

  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <CheckIcon className="w-8 h-8 text-green-400" />
      </div>
      <h2 className="text-xl font-semibold text-text-primary mb-2">Domain Created</h2>
      <p className="text-text-muted mb-6">
        "{domainName}" has been successfully created and configured.
      </p>
      <div className="flex justify-center gap-4">
        <Link
          href="/admin/domains"
          className="px-6 py-2 text-text-muted hover:text-text-primary transition-colors"
        >
          Back to Domains
        </Link>
        <button
          onClick={() => router.push(`/admin/domains/${domainId}`)}
          className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          View Domain
        </button>
      </div>
    </div>
  );
}

// Icons
function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  );
}

function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  );
}

function CertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  );
}
