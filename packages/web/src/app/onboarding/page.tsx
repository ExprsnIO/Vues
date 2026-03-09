'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import toast from 'react-hot-toast';

// Types
type OrganizationType = 'team' | 'enterprise' | 'nonprofit' | 'business';
type HostingType = 'cloud' | 'self-hosted' | 'hybrid';
type PlcProvider = 'exprsn' | 'bluesky' | 'self-hosted';

interface OnboardingData {
  // Step 1: Basic Info (passed from signup)
  organizationName: string;
  organizationType: OrganizationType;
  website?: string;
  organizationId?: string;

  // Step 2: Infrastructure
  hostingType: HostingType;
  plcProvider: PlcProvider;
  selfHostedPlcUrl?: string;
  customDomain?: string;
  handleSuffix?: string;

  // Step 3: Team Members
  initialMembers: Array<{
    email: string;
    role: 'admin' | 'moderator' | 'member';
    name?: string;
  }>;

  // Step 4: Roles & Groups
  roles: Array<{
    name: string;
    displayName: string;
    permissions: string[];
    color: string;
  }>;
  groups: Array<{
    name: string;
    description?: string;
  }>;

  // Step 5: Federation
  federationEnabled: boolean;
  federationSettings: {
    inboundEnabled: boolean;
    outboundEnabled: boolean;
    allowedDomains: string[];
    blockedDomains: string[];
    syncPosts: boolean;
    syncLikes: boolean;
    syncFollows: boolean;
  };

  // Step 6: Moderation
  moderationSettings: {
    autoModerationEnabled: boolean;
    aiModerationEnabled: boolean;
    requireReviewNewUsers: boolean;
    newUserReviewDays: number;
    shadowBanEnabled: boolean;
    appealEnabled: boolean;
    contentPolicies: string[];
  };
}

const WIZARD_STEPS = [
  { id: 'infrastructure', title: 'Infrastructure', icon: ServerIcon },
  { id: 'domain', title: 'Domain & Identity', icon: GlobeIcon },
  { id: 'team', title: 'Team Members', icon: UsersIcon },
  { id: 'roles', title: 'Roles & Groups', icon: ShieldIcon },
  { id: 'federation', title: 'Federation', icon: NetworkIcon },
  { id: 'moderation', title: 'Moderation', icon: ModIcon },
  { id: 'review', title: 'Review', icon: CheckIcon },
];

const DEFAULT_ROLES = [
  { name: 'admin', displayName: 'Administrator', permissions: ['*'], color: '#ef4444' },
  { name: 'moderator', displayName: 'Moderator', permissions: ['moderation.*', 'content.review'], color: '#f59e0b' },
  { name: 'member', displayName: 'Member', permissions: ['content.create', 'content.edit.own'], color: '#3b82f6' },
];

const CONTENT_POLICIES = [
  { id: 'no_nsfw', label: 'No NSFW Content', description: 'Prohibit adult or explicit content' },
  { id: 'no_hate', label: 'No Hate Speech', description: 'Prohibit discriminatory or hateful content' },
  { id: 'no_harassment', label: 'No Harassment', description: 'Prohibit targeted harassment or bullying' },
  { id: 'no_violence', label: 'No Violence', description: 'Prohibit violent or graphic content' },
  { id: 'no_spam', label: 'No Spam', description: 'Prohibit spam and promotional content' },
  { id: 'no_misinfo', label: 'No Misinformation', description: 'Prohibit false or misleading information' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize onboarding data
  const [data, setData] = useState<OnboardingData>(() => {
    // Try to get pending setup from localStorage
    const pending = typeof window !== 'undefined'
      ? localStorage.getItem('pendingAccountSetup')
      : null;
    const pendingData = pending ? JSON.parse(pending) : {};

    return {
      organizationName: pendingData.organizationName || searchParams.get('name') || '',
      organizationType: pendingData.organizationType || searchParams.get('type') || 'team',
      website: pendingData.website || '',
      organizationId: searchParams.get('orgId') || undefined,

      hostingType: 'cloud',
      plcProvider: 'exprsn',
      selfHostedPlcUrl: '',
      customDomain: '',
      handleSuffix: '',

      initialMembers: [],

      roles: DEFAULT_ROLES,
      groups: [],

      federationEnabled: true,
      federationSettings: {
        inboundEnabled: true,
        outboundEnabled: true,
        allowedDomains: [],
        blockedDomains: [],
        syncPosts: true,
        syncLikes: true,
        syncFollows: true,
      },

      moderationSettings: {
        autoModerationEnabled: true,
        aiModerationEnabled: true,
        requireReviewNewUsers: false,
        newUserReviewDays: 7,
        shadowBanEnabled: true,
        appealEnabled: true,
        contentPolicies: ['no_hate', 'no_harassment', 'no_spam'],
      },
    };
  });

  const updateData = (updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    setError('');

    try {
      let orgId = data.organizationId;

      // Create organization if not already created
      if (!orgId) {
        const orgResult = await api.createOrganization({
          name: data.organizationName,
          type: data.organizationType,
          website: data.website,
        });
        orgId = orgResult.organization.id;
      }

      // Use setupOrganization API for complete setup in one call
      const setupResult = await api.setupOrganization(orgId, {
        hostingType: data.hostingType,
        plcProvider: data.plcProvider,
        selfHostedPlcUrl: data.selfHostedPlcUrl,
        customDomain: data.customDomain,
        handleSuffix: data.handleSuffix,
        initialMembers: data.initialMembers,
        roles: data.roles.filter(r => !['admin', 'moderator', 'member'].includes(r.name)),
        groups: data.groups,
        federationEnabled: data.federationEnabled,
        federationSettings: data.federationSettings,
        moderationSettings: data.moderationSettings,
      });

      // Clear pending setup
      localStorage.removeItem('pendingAccountSetup');

      const { membersInvited, rolesCreated, groupsCreated } = setupResult.setup;
      const summaryParts = [];
      if (membersInvited > 0) summaryParts.push(`${membersInvited} members invited`);
      if (rolesCreated > 0) summaryParts.push(`${rolesCreated} roles created`);
      if (groupsCreated > 0) summaryParts.push(`${groupsCreated} groups created`);

      toast.success(
        summaryParts.length > 0
          ? `Organization setup complete! ${summaryParts.join(', ')}.`
          : 'Organization setup complete!'
      );
      router.push(`/o/${orgId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete setup');
      toast.error('Setup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const currentStepConfig = WIZARD_STEPS[currentStep];
  const StepIcon = currentStepConfig?.icon || CheckIcon;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-accent to-accent-hover rounded-xl flex items-center justify-center">
              <span className="text-text-inverse font-bold text-lg">E</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-text-primary">Organization Setup</h1>
              <p className="text-sm text-text-muted">{data.organizationName || 'New Organization'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="border-b border-border bg-surface/50">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {WIZARD_STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === currentStep;
              const isComplete = index < currentStep;

              return (
                <button
                  key={step.id}
                  onClick={() => index < currentStep && setCurrentStep(index)}
                  disabled={index > currentStep}
                  className={`flex flex-col items-center gap-1 transition-all ${
                    isActive
                      ? 'text-accent'
                      : isComplete
                        ? 'text-success cursor-pointer'
                        : 'text-text-muted cursor-not-allowed'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isActive
                        ? 'bg-accent text-text-inverse'
                        : isComplete
                          ? 'bg-success/20 text-success'
                          : 'bg-surface-hover text-text-muted'
                    }`}
                  >
                    {isComplete ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <Icon className="w-5 h-5" />
                    )}
                  </div>
                  <span className="text-xs font-medium hidden sm:block">{step.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-error/10 border border-error/50 rounded-lg text-error">
            {error}
          </div>
        )}

        {currentStep === 0 && (
          <InfrastructureStep data={data} updateData={updateData} />
        )}
        {currentStep === 1 && (
          <DomainStep data={data} updateData={updateData} />
        )}
        {currentStep === 2 && (
          <TeamStep data={data} updateData={updateData} />
        )}
        {currentStep === 3 && (
          <RolesStep data={data} updateData={updateData} />
        )}
        {currentStep === 4 && (
          <FederationStep data={data} updateData={updateData} />
        )}
        {currentStep === 5 && (
          <ModerationStep data={data} updateData={updateData} />
        )}
        {currentStep === 6 && (
          <ReviewStep data={data} />
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            className="px-6 py-2 text-text-muted hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="px-6 py-2 text-text-muted hover:text-text-primary"
            >
              Skip for now
            </button>
            {currentStep < WIZARD_STEPS.length - 1 ? (
              <button
                onClick={nextStep}
                className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={isLoading}
                className="px-6 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
              >
                {isLoading ? 'Setting up...' : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 1: Infrastructure
function InfrastructureStep({
  data,
  updateData,
}: {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Infrastructure Setup</h2>
        <p className="text-text-muted">
          Choose how you want to host your organization's data and identity.
        </p>
      </div>

      {/* Hosting Type */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">Hosting</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              id: 'cloud',
              title: 'Exprsn Cloud',
              description: 'Fully managed hosting with automatic updates and backups',
              icon: CloudIcon,
              recommended: true,
            },
            {
              id: 'self-hosted',
              title: 'Self-Hosted',
              description: 'Run on your own infrastructure with full control',
              icon: ServerIcon,
            },
            {
              id: 'hybrid',
              title: 'Hybrid',
              description: 'Self-hosted PDS with Exprsn services for discovery',
              icon: HybridIcon,
            },
          ].map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                onClick={() => updateData({ hostingType: option.id as HostingType })}
                className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                  data.hostingType === option.id
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-accent/50'
                }`}
              >
                {option.recommended && (
                  <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-accent text-text-inverse text-xs rounded-full">
                    Recommended
                  </span>
                )}
                <Icon className="w-8 h-8 text-accent mb-3" />
                <h4 className="font-semibold text-text-primary">{option.title}</h4>
                <p className="text-sm text-text-muted mt-1">{option.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* PLC Provider */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-2">Identity Provider (PLC)</h3>
        <p className="text-text-muted text-sm mb-4">
          The PLC directory manages your organization's decentralized identities.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              id: 'exprsn',
              title: 'Exprsn PLC',
              description: 'Managed by Exprsn with full AT Protocol compatibility',
              endpoint: 'plc.exprsn.io',
            },
            {
              id: 'bluesky',
              title: 'Bluesky PLC',
              description: 'Use the main AT Protocol PLC directory',
              endpoint: 'plc.directory',
            },
            {
              id: 'self-hosted',
              title: 'Self-Hosted PLC',
              description: 'Run your own PLC directory server',
              endpoint: 'Custom',
            },
          ].map((option) => (
            <button
              key={option.id}
              onClick={() => updateData({ plcProvider: option.id as PlcProvider })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                data.plcProvider === option.id
                  ? 'border-accent bg-accent/5'
                  : 'border-border hover:border-accent/50'
              }`}
            >
              <h4 className="font-semibold text-text-primary">{option.title}</h4>
              <p className="text-sm text-text-muted mt-1">{option.description}</p>
              <p className="text-xs font-mono text-accent mt-2">{option.endpoint}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Self-hosted PLC URL */}
      {data.plcProvider === 'self-hosted' && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">
            PLC Server URL
          </label>
          <input
            type="url"
            value={data.selfHostedPlcUrl}
            onChange={(e) => updateData({ selfHostedPlcUrl: e.target.value })}
            placeholder="https://plc.yourdomain.com"
            className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>
      )}

      {/* Self-hosted notice */}
      {data.hostingType === 'self-hosted' && (
        <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
          <h4 className="font-medium text-warning flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Self-Hosting Requirements
          </h4>
          <ul className="mt-2 text-sm text-text-muted space-y-1">
            <li>- Docker or Kubernetes cluster</li>
            <li>- PostgreSQL database</li>
            <li>- Redis for caching</li>
            <li>- S3-compatible storage</li>
            <li>- Valid SSL certificate</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// Step 2: Domain & Identity
function DomainStep({
  data,
  updateData,
}: {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Domain & Identity</h2>
        <p className="text-text-muted">
          Configure your organization's domain and handle namespace.
        </p>
      </div>

      {/* Custom Domain */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Custom Domain <span className="text-text-muted">(optional)</span>
        </label>
        <input
          type="text"
          value={data.customDomain}
          onChange={(e) => updateData({ customDomain: e.target.value })}
          placeholder="videos.yourcompany.com"
          className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary"
        />
        <p className="text-xs text-text-muted mt-1">
          Point your domain to Exprsn for a branded experience
        </p>
      </div>

      {/* Handle Suffix */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">
          Handle Suffix
        </label>
        <div className="flex items-center gap-2">
          <span className="text-text-muted">@username.</span>
          <input
            type="text"
            value={data.handleSuffix}
            onChange={(e) => updateData({ handleSuffix: e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, '') })}
            placeholder="yourorg.exprsn"
            className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-text-primary"
          />
        </div>
        <p className="text-xs text-text-muted mt-1">
          Members will have handles like @alice.{data.handleSuffix || 'yourorg.exprsn'}
        </p>
      </div>

      {/* Preview */}
      <div className="p-4 bg-surface-hover rounded-lg">
        <h4 className="text-sm font-medium text-text-secondary mb-3">Preview</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-sm">Handle:</span>
            <span className="font-mono text-text-primary">
              @{data.organizationName?.toLowerCase().replace(/\s+/g, '') || 'org'}.{data.handleSuffix || 'exprsn'}
            </span>
          </div>
          {data.customDomain && (
            <div className="flex items-center gap-2">
              <span className="text-text-muted text-sm">URL:</span>
              <span className="font-mono text-accent">https://{data.customDomain}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-text-muted text-sm">DID:</span>
            <span className="font-mono text-text-primary text-sm">did:plc:xxx...</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step 3: Team Members
function TeamStep({
  data,
  updateData,
}: {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [newMember, setNewMember] = useState({ email: '', role: 'member' as const, name: '' });

  const addMember = () => {
    if (newMember.email) {
      updateData({
        initialMembers: [...data.initialMembers, newMember],
      });
      setNewMember({ email: '', role: 'member', name: '' });
    }
  };

  const removeMember = (index: number) => {
    updateData({
      initialMembers: data.initialMembers.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Invite Team Members</h2>
        <p className="text-text-muted">
          Add your initial team members. You can add more later.
        </p>
      </div>

      {/* Add Member Form */}
      <div className="flex gap-3">
        <input
          type="email"
          value={newMember.email}
          onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
          placeholder="team@example.com"
          className="flex-1 px-4 py-3 bg-surface border border-border rounded-lg text-text-primary"
        />
        <select
          value={newMember.role}
          onChange={(e) => setNewMember({ ...newMember, role: e.target.value as any })}
          className="px-4 py-3 bg-surface border border-border rounded-lg text-text-primary"
        >
          <option value="admin">Admin</option>
          <option value="moderator">Moderator</option>
          <option value="member">Member</option>
        </select>
        <button
          onClick={addMember}
          disabled={!newMember.email}
          className="px-4 py-3 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {/* Member List */}
      {data.initialMembers.length > 0 ? (
        <div className="space-y-2">
          {data.initialMembers.map((member, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg"
            >
              <div>
                <p className="text-text-primary">{member.email}</p>
                <p className="text-sm text-text-muted capitalize">{member.role}</p>
              </div>
              <button
                onClick={() => removeMember(index)}
                className="p-2 text-text-muted hover:text-error rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-text-muted">
          <UsersIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No team members added yet</p>
          <p className="text-sm">You can always invite members later</p>
        </div>
      )}

      {/* Bulk invite */}
      <div className="p-4 bg-surface-hover rounded-lg">
        <h4 className="text-sm font-medium text-text-secondary mb-2">Bulk Invite</h4>
        <p className="text-xs text-text-muted mb-3">
          Paste multiple email addresses (one per line or comma-separated)
        </p>
        <textarea
          placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
          className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary h-24 resize-none"
          onBlur={(e) => {
            const emails = e.target.value
              .split(/[,\n]/)
              .map((email) => email.trim())
              .filter((email) => email && email.includes('@'));
            if (emails.length > 0) {
              updateData({
                initialMembers: [
                  ...data.initialMembers,
                  ...emails.map((email) => ({ email, role: 'member' as const })),
                ],
              });
              e.target.value = '';
            }
          }}
        />
      </div>
    </div>
  );
}

// Step 4: Roles & Groups
function RolesStep({
  data,
  updateData,
}: {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const [newRole, setNewRole] = useState({ name: '', displayName: '', color: '#6366f1' });
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });

  const addRole = () => {
    if (newRole.name && newRole.displayName) {
      updateData({
        roles: [...data.roles, { ...newRole, permissions: [] }],
      });
      setNewRole({ name: '', displayName: '', color: '#6366f1' });
    }
  };

  const addGroup = () => {
    if (newGroup.name) {
      updateData({
        groups: [...data.groups, newGroup],
      });
      setNewGroup({ name: '', description: '' });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Roles & Groups</h2>
        <p className="text-text-muted">
          Define custom roles and groups for your organization.
        </p>
      </div>

      {/* Roles */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">Roles</h3>
        <div className="space-y-2 mb-4">
          {data.roles.map((role, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: role.color }}
                />
                <div>
                  <p className="text-text-primary font-medium">{role.displayName}</p>
                  <p className="text-sm text-text-muted">@{role.name}</p>
                </div>
              </div>
              {!['admin', 'moderator', 'member'].includes(role.name) && (
                <button
                  onClick={() => updateData({
                    roles: data.roles.filter((_, i) => i !== index),
                  })}
                  className="p-2 text-text-muted hover:text-error"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add Role Form */}
        <div className="flex gap-3">
          <input
            type="text"
            value={newRole.displayName}
            onChange={(e) => setNewRole({
              ...newRole,
              displayName: e.target.value,
              name: e.target.value.toLowerCase().replace(/\s+/g, '_'),
            })}
            placeholder="Role name"
            className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
          <input
            type="color"
            value={newRole.color}
            onChange={(e) => setNewRole({ ...newRole, color: e.target.value })}
            className="w-12 h-10 bg-surface border border-border rounded-lg cursor-pointer"
          />
          <button
            onClick={addRole}
            disabled={!newRole.displayName}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            Add Role
          </button>
        </div>
      </div>

      {/* Groups */}
      <div>
        <h3 className="text-lg font-semibold text-text-primary mb-4">Groups</h3>
        {data.groups.length > 0 && (
          <div className="space-y-2 mb-4">
            {data.groups.map((group, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg"
              >
                <div>
                  <p className="text-text-primary font-medium">{group.name}</p>
                  {group.description && (
                    <p className="text-sm text-text-muted">{group.description}</p>
                  )}
                </div>
                <button
                  onClick={() => updateData({
                    groups: data.groups.filter((_, i) => i !== index),
                  })}
                  className="p-2 text-text-muted hover:text-error"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add Group Form */}
        <div className="flex gap-3">
          <input
            type="text"
            value={newGroup.name}
            onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
            placeholder="Group name"
            className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
          <input
            type="text"
            value={newGroup.description}
            onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
            placeholder="Description (optional)"
            className="flex-1 px-4 py-2 bg-surface border border-border rounded-lg text-text-primary"
          />
          <button
            onClick={addGroup}
            disabled={!newGroup.name}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg disabled:opacity-50"
          >
            Add Group
          </button>
        </div>
      </div>
    </div>
  );
}

// Step 5: Federation
function FederationStep({
  data,
  updateData,
}: {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const updateFederation = (updates: Partial<OnboardingData['federationSettings']>) => {
    updateData({
      federationSettings: { ...data.federationSettings, ...updates },
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Federation Settings</h2>
        <p className="text-text-muted">
          Configure how your organization connects with the AT Protocol network.
        </p>
      </div>

      {/* Enable Federation */}
      <label className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg cursor-pointer">
        <div>
          <p className="text-text-primary font-medium">Enable Federation</p>
          <p className="text-sm text-text-muted">Connect with other AT Protocol services</p>
        </div>
        <input
          type="checkbox"
          checked={data.federationEnabled}
          onChange={(e) => updateData({ federationEnabled: e.target.checked })}
          className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
        />
      </label>

      {data.federationEnabled && (
        <>
          {/* Direction */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg cursor-pointer">
              <div>
                <p className="text-text-primary font-medium">Inbound</p>
                <p className="text-sm text-text-muted">Receive content from other servers</p>
              </div>
              <input
                type="checkbox"
                checked={data.federationSettings.inboundEnabled}
                onChange={(e) => updateFederation({ inboundEnabled: e.target.checked })}
                className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
              />
            </label>
            <label className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg cursor-pointer">
              <div>
                <p className="text-text-primary font-medium">Outbound</p>
                <p className="text-sm text-text-muted">Share content to other servers</p>
              </div>
              <input
                type="checkbox"
                checked={data.federationSettings.outboundEnabled}
                onChange={(e) => updateFederation({ outboundEnabled: e.target.checked })}
                className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
              />
            </label>
          </div>

          {/* Sync Options */}
          <div>
            <h4 className="text-sm font-medium text-text-secondary mb-3">Sync Options</h4>
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: 'syncPosts', label: 'Posts' },
                { key: 'syncLikes', label: 'Likes' },
                { key: 'syncFollows', label: 'Follows' },
              ].map((option) => (
                <label
                  key={option.key}
                  className="flex items-center gap-2 p-3 bg-surface border border-border rounded-lg cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={data.federationSettings[option.key as keyof typeof data.federationSettings] as boolean}
                    onChange={(e) => updateFederation({ [option.key]: e.target.checked })}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-text-primary">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Domain Allow/Block Lists */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Allowed Domains <span className="text-text-muted">(leave empty for all)</span>
              </label>
              <textarea
                value={data.federationSettings.allowedDomains.join('\n')}
                onChange={(e) => updateFederation({
                  allowedDomains: e.target.value.split('\n').filter(Boolean),
                })}
                placeholder="bsky.social&#10;exprsn.io"
                className="w-full h-24 px-4 py-3 bg-surface border border-border rounded-lg text-text-primary resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Blocked Domains
              </label>
              <textarea
                value={data.federationSettings.blockedDomains.join('\n')}
                onChange={(e) => updateFederation({
                  blockedDomains: e.target.value.split('\n').filter(Boolean),
                })}
                placeholder="spam.example.com"
                className="w-full h-24 px-4 py-3 bg-surface border border-border rounded-lg text-text-primary resize-none"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Step 6: Moderation
function ModerationStep({
  data,
  updateData,
}: {
  data: OnboardingData;
  updateData: (updates: Partial<OnboardingData>) => void;
}) {
  const updateModeration = (updates: Partial<OnboardingData['moderationSettings']>) => {
    updateData({
      moderationSettings: { ...data.moderationSettings, ...updates },
    });
  };

  const togglePolicy = (policyId: string) => {
    const policies = data.moderationSettings.contentPolicies;
    if (policies.includes(policyId)) {
      updateModeration({ contentPolicies: policies.filter((p) => p !== policyId) });
    } else {
      updateModeration({ contentPolicies: [...policies, policyId] });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Moderation Settings</h2>
        <p className="text-text-muted">
          Configure content moderation and safety policies for your organization.
        </p>
      </div>

      {/* Auto Moderation */}
      <div className="space-y-3">
        <label className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg cursor-pointer">
          <div>
            <p className="text-text-primary font-medium">Auto-Moderation</p>
            <p className="text-sm text-text-muted">Automatically filter content based on rules</p>
          </div>
          <input
            type="checkbox"
            checked={data.moderationSettings.autoModerationEnabled}
            onChange={(e) => updateModeration({ autoModerationEnabled: e.target.checked })}
            className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
          />
        </label>

        <label className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg cursor-pointer">
          <div>
            <p className="text-text-primary font-medium">AI-Powered Moderation</p>
            <p className="text-sm text-text-muted">Use AI to detect policy violations</p>
          </div>
          <input
            type="checkbox"
            checked={data.moderationSettings.aiModerationEnabled}
            onChange={(e) => updateModeration({ aiModerationEnabled: e.target.checked })}
            className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
          />
        </label>

        <label className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg cursor-pointer">
          <div>
            <p className="text-text-primary font-medium">Allow Appeals</p>
            <p className="text-sm text-text-muted">Users can appeal moderation decisions</p>
          </div>
          <input
            type="checkbox"
            checked={data.moderationSettings.appealEnabled}
            onChange={(e) => updateModeration({ appealEnabled: e.target.checked })}
            className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
          />
        </label>

        <label className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg cursor-pointer">
          <div>
            <p className="text-text-primary font-medium">Shadow Ban Support</p>
            <p className="text-sm text-text-muted">Silently restrict problematic users</p>
          </div>
          <input
            type="checkbox"
            checked={data.moderationSettings.shadowBanEnabled}
            onChange={(e) => updateModeration({ shadowBanEnabled: e.target.checked })}
            className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
          />
        </label>
      </div>

      {/* New User Review */}
      <div>
        <label className="flex items-center justify-between p-4 bg-surface border border-border rounded-lg cursor-pointer">
          <div>
            <p className="text-text-primary font-medium">Review New Users</p>
            <p className="text-sm text-text-muted">Require review for new user content</p>
          </div>
          <input
            type="checkbox"
            checked={data.moderationSettings.requireReviewNewUsers}
            onChange={(e) => updateModeration({ requireReviewNewUsers: e.target.checked })}
            className="w-5 h-5 rounded border-border text-accent focus:ring-accent"
          />
        </label>
        {data.moderationSettings.requireReviewNewUsers && (
          <div className="mt-3 ml-4">
            <label className="text-sm text-text-muted">Review period (days)</label>
            <input
              type="number"
              value={data.moderationSettings.newUserReviewDays}
              onChange={(e) => updateModeration({ newUserReviewDays: parseInt(e.target.value) || 7 })}
              className="ml-3 w-20 px-3 py-1 bg-surface border border-border rounded text-text-primary"
              min={1}
              max={90}
            />
          </div>
        )}
      </div>

      {/* Content Policies */}
      <div>
        <h4 className="text-sm font-medium text-text-secondary mb-3">Content Policies</h4>
        <div className="space-y-2">
          {CONTENT_POLICIES.map((policy) => (
            <label
              key={policy.id}
              className="flex items-center gap-3 p-3 bg-surface border border-border rounded-lg cursor-pointer"
            >
              <input
                type="checkbox"
                checked={data.moderationSettings.contentPolicies.includes(policy.id)}
                onChange={() => togglePolicy(policy.id)}
                className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
              />
              <div>
                <p className="text-text-primary">{policy.label}</p>
                <p className="text-xs text-text-muted">{policy.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// Step 7: Review
function ReviewStep({ data }: { data: OnboardingData }) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">Review Your Setup</h2>
        <p className="text-text-muted">
          Review your organization configuration before completing setup.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Infrastructure */}
        <div className="p-4 bg-surface border border-border rounded-lg">
          <h4 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
            <ServerIcon className="w-5 h-5 text-accent" />
            Infrastructure
          </h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Hosting</dt>
              <dd className="text-text-primary capitalize">{data.hostingType}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">PLC Provider</dt>
              <dd className="text-text-primary capitalize">{data.plcProvider}</dd>
            </div>
          </dl>
        </div>

        {/* Identity */}
        <div className="p-4 bg-surface border border-border rounded-lg">
          <h4 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
            <GlobeIcon className="w-5 h-5 text-accent" />
            Identity
          </h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Handle Suffix</dt>
              <dd className="text-text-primary font-mono">.{data.handleSuffix || 'exprsn'}</dd>
            </div>
            {data.customDomain && (
              <div className="flex justify-between">
                <dt className="text-text-muted">Custom Domain</dt>
                <dd className="text-text-primary">{data.customDomain}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Team */}
        <div className="p-4 bg-surface border border-border rounded-lg">
          <h4 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-accent" />
            Team
          </h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Members to Invite</dt>
              <dd className="text-text-primary">{data.initialMembers.length}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Custom Roles</dt>
              <dd className="text-text-primary">{data.roles.length - 3}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-muted">Groups</dt>
              <dd className="text-text-primary">{data.groups.length}</dd>
            </div>
          </dl>
        </div>

        {/* Federation */}
        <div className="p-4 bg-surface border border-border rounded-lg">
          <h4 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
            <NetworkIcon className="w-5 h-5 text-accent" />
            Federation
          </h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-muted">Status</dt>
              <dd className={data.federationEnabled ? 'text-success' : 'text-text-muted'}>
                {data.federationEnabled ? 'Enabled' : 'Disabled'}
              </dd>
            </div>
            {data.federationEnabled && (
              <>
                <div className="flex justify-between">
                  <dt className="text-text-muted">Inbound</dt>
                  <dd className="text-text-primary">{data.federationSettings.inboundEnabled ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-muted">Outbound</dt>
                  <dd className="text-text-primary">{data.federationSettings.outboundEnabled ? 'Yes' : 'No'}</dd>
                </div>
              </>
            )}
          </dl>
        </div>

        {/* Moderation */}
        <div className="p-4 bg-surface border border-border rounded-lg md:col-span-2">
          <h4 className="font-semibold text-text-primary mb-3 flex items-center gap-2">
            <ModIcon className="w-5 h-5 text-accent" />
            Moderation
          </h4>
          <div className="flex flex-wrap gap-2">
            {data.moderationSettings.autoModerationEnabled && (
              <span className="px-2 py-1 bg-accent/20 text-accent text-xs rounded">Auto-Moderation</span>
            )}
            {data.moderationSettings.aiModerationEnabled && (
              <span className="px-2 py-1 bg-accent/20 text-accent text-xs rounded">AI-Powered</span>
            )}
            {data.moderationSettings.appealEnabled && (
              <span className="px-2 py-1 bg-accent/20 text-accent text-xs rounded">Appeals</span>
            )}
            {data.moderationSettings.contentPolicies.map((policy) => (
              <span key={policy} className="px-2 py-1 bg-surface-hover text-text-muted text-xs rounded capitalize">
                {policy.replace('no_', 'No ').replace('_', ' ')}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 bg-success/10 border border-success/30 rounded-lg">
        <p className="text-success font-medium">Ready to complete setup!</p>
        <p className="text-sm text-text-muted mt-1">
          Click "Complete Setup" to create your organization with these settings.
          You can modify any of these settings later in the admin dashboard.
        </p>
      </div>
    </div>
  );
}

// Icons
function ServerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
    </svg>
  );
}

function CloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
    </svg>
  );
}

function HybridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function NetworkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function ModIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
