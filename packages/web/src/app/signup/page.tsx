'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CertificateDownloadModal } from '@/components/auth/CertificateDownloadModal';

type AccountType = 'personal' | 'creator' | 'business' | 'organization';
type OrganizationType = 'team' | 'enterprise' | 'nonprofit' | 'agency' | 'network';

interface AccountTypeOption {
  id: AccountType;
  name: string;
  tagline: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  badge?: string;
  usesOnboarding?: boolean;
}

interface OrgTypeOption {
  id: OrganizationType;
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  usesFullOnboarding: boolean;
}

const ACCOUNT_TYPES: AccountTypeOption[] = [
  {
    id: 'personal',
    name: 'Personal',
    tagline: 'For individuals',
    description: 'Share and discover content with a personal identity',
    features: ['Personal profile', 'Follow creators', 'Save favorites', 'Join communities'],
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    id: 'creator',
    name: 'Creator',
    tagline: 'For content creators',
    description: 'Advanced tools for creators who want to grow their audience',
    features: ['Creator analytics', 'Monetization tools', 'Audience insights', 'Priority support'],
    badge: 'Popular',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    ),
  },
  {
    id: 'business',
    name: 'Business',
    tagline: 'For brands & companies',
    description: 'Connect your brand with audiences and manage your presence',
    features: ['Brand profile', 'Team collaboration', 'Analytics dashboard', 'API access'],
    usesOnboarding: true,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    id: 'organization',
    name: 'Organization',
    tagline: 'For teams & enterprises',
    description: 'Full control for organizations with multiple members and advanced features',
    features: ['Multi-user teams', 'Role management', 'Federation options', 'Self-hosting'],
    usesOnboarding: true,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
];

const ORGANIZATION_TYPES: OrgTypeOption[] = [
  {
    id: 'team',
    name: 'Team',
    description: 'Small team or startup with simple needs',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
    features: ['Up to 10 members', 'Basic roles', 'Shared content'],
    usesFullOnboarding: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Large organization with multiple departments',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
      </svg>
    ),
    features: ['Unlimited members', 'Custom roles', 'SSO & federation', 'Self-hosting options'],
    usesFullOnboarding: true,
  },
  {
    id: 'nonprofit',
    name: 'Nonprofit',
    description: 'Charitable organization or community group',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
    features: ['Discounted pricing', 'Grant resources', 'Community tools'],
    usesFullOnboarding: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    description: 'Manage multiple client brands',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
      </svg>
    ),
    features: ['Multi-brand management', 'Client workspaces', 'White-label options'],
    usesFullOnboarding: true,
  },
  {
    id: 'network',
    name: 'Network',
    description: 'Creator network or MCN',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    features: ['Creator management', 'Revenue sharing', 'Talent dashboard'],
    usesFullOnboarding: true,
  },
];

interface CertificateData {
  pem: string;
  privateKey: string;
  fingerprint: string;
  validUntil: string;
}

interface SignUpResult {
  did: string;
  handle: string;
  certificate?: CertificateData;
}

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [step, setStep] = useState<'type' | 'org-type' | 'details' | 'certificate-download'>('type');
  const [accountType, setAccountType] = useState<AccountType>('personal');
  const [organizationType, setOrganizationType] = useState<OrganizationType>('team');
  const [formData, setFormData] = useState({
    handle: '',
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    organizationName: '',
    website: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const [signUpResult, setSignUpResult] = useState<SignUpResult | null>(null);

  // Calculate password strength
  useEffect(() => {
    const password = formData.password;
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    setPasswordStrength(strength);
  }, [formData.password]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (formData.handle.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if ((accountType === 'organization' || accountType === 'business') && !formData.organizationName) {
      setError('Organization name is required');
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Create the user account with account type info
      const result = await signUp({
        handle: formData.handle,
        email: formData.email,
        password: formData.password,
        displayName: formData.displayName || formData.handle,
        accountType: accountType,
      });

      // Check if we received a certificate (for creator/business accounts using did:exprsn)
      if (result?.certificate) {
        setSignUpResult({
          did: result.did,
          handle: result.handle,
          certificate: result.certificate,
        });
        setStep('certificate-download');
        setIsLoading(false);
        return;
      }

      // Step 2: Handle different account types
      if (accountType === 'organization' || accountType === 'business') {
        const orgType = accountType === 'business' ? 'business' : organizationType;
        const selectedOrgType = ORGANIZATION_TYPES.find(t => t.id === organizationType);
        const needsFullOnboarding = accountType === 'organization' && selectedOrgType?.usesFullOnboarding;

        // Store setup data
        localStorage.setItem('pendingAccountSetup', JSON.stringify({
          accountType,
          organizationType: orgType,
          organizationName: formData.organizationName,
          website: formData.website || undefined,
        }));

        // Redirect to onboarding wizard for enterprise/agency/network/nonprofit orgs
        if (needsFullOnboarding || accountType === 'business') {
          const params = new URLSearchParams({
            name: formData.organizationName,
            type: orgType,
          });
          router.push(`/onboarding?${params.toString()}`);
          return;
        }

        // For simple team accounts, create org directly
        try {
          await api.createOrganization({
            name: formData.organizationName,
            type: orgType,
            website: formData.website || undefined,
          });
          localStorage.removeItem('pendingAccountSetup');
        } catch (orgError) {
          console.error('Failed to create organization:', orgError);
        }
      } else if (accountType === 'creator') {
        localStorage.setItem('pendingAccountSetup', JSON.stringify({ accountType }));
      }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
      setIsLoading(false);
    }
  };

  const handleCertificateContinue = () => {
    // After certificate download, continue with org setup or go home
    if (accountType === 'organization' || accountType === 'business') {
      const orgType = accountType === 'business' ? 'business' : organizationType;
      const selectedOrgType = ORGANIZATION_TYPES.find(t => t.id === organizationType);
      const needsFullOnboarding = accountType === 'organization' && selectedOrgType?.usesFullOnboarding;

      localStorage.setItem('pendingAccountSetup', JSON.stringify({
        accountType,
        organizationType: orgType,
        organizationName: formData.organizationName,
        website: formData.website || undefined,
      }));

      if (needsFullOnboarding || accountType === 'business') {
        const params = new URLSearchParams({
          name: formData.organizationName,
          type: orgType,
        });
        router.push(`/onboarding?${params.toString()}`);
        return;
      }

      // For simple team accounts, create org directly
      api.createOrganization({
        name: formData.organizationName,
        type: orgType,
        website: formData.website || undefined,
      }).then(() => {
        localStorage.removeItem('pendingAccountSetup');
        router.push('/');
      }).catch((orgError) => {
        console.error('Failed to create organization:', orgError);
        router.push('/');
      });
    } else {
      router.push('/');
    }
  };

  const selectedAccountType = ACCOUNT_TYPES.find(t => t.id === accountType);
  const selectedOrgType = ORGANIZATION_TYPES.find(t => t.id === organizationType);

  const continueFromType = () => {
    if (accountType === 'organization') {
      setStep('org-type');
    } else {
      setStep('details');
    }
  };

  const continueFromOrgType = () => {
    setStep('details');
  };

  const goBack = () => {
    if (step === 'details' && accountType === 'organization') {
      setStep('org-type');
    } else if (step === 'org-type') {
      setStep('type');
    } else {
      setStep('type');
    }
  };

  return (
    <>
      {/* Certificate Download Modal */}
      {signUpResult?.certificate && (
        <CertificateDownloadModal
          isOpen={step === 'certificate-download'}
          onContinue={handleCertificateContinue}
          certificate={signUpResult.certificate}
          did={signUpResult.did}
          handle={signUpResult.handle}
          requireDownload={true}
        />
      )}

      <div className="min-h-screen bg-background flex">
        {/* Left side - Form */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-lg">
            {/* Logo */}
            <div className="mb-8">
              <Link href="/" className="inline-flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-accent to-accent-hover rounded-xl flex items-center justify-center">
                  <span className="text-text-inverse font-bold text-xl">E</span>
                </div>
                <span className="text-2xl font-bold text-text-primary">exprsn</span>
              </Link>
            </div>

            {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            <div className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
              step === 'type' ? 'bg-accent text-text-inverse' : 'bg-accent/20 text-accent'
            )}>
              1
            </div>
            <div className={cn('flex-1 h-0.5 transition-colors', step !== 'type' ? 'bg-accent' : 'bg-border')} />
            {accountType === 'organization' && (
              <>
                <div className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
                  step === 'org-type' ? 'bg-accent text-text-inverse' : step === 'details' ? 'bg-accent/20 text-accent' : 'bg-border text-text-muted'
                )}>
                  2
                </div>
                <div className={cn('flex-1 h-0.5 transition-colors', step === 'details' ? 'bg-accent' : 'bg-border')} />
              </>
            )}
            <div className={cn(
              'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
              step === 'details' ? 'bg-accent text-text-inverse' : 'bg-border text-text-muted'
            )}>
              {accountType === 'organization' ? '3' : '2'}
            </div>
          </div>

          {step === 'type' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <h1 className="text-2xl font-bold text-text-primary mb-2">Choose your account type</h1>
              <p className="text-text-muted mb-6">Select the option that best describes how you'll use Exprsn</p>

              <div className="space-y-3">
                {ACCOUNT_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setAccountType(type.id)}
                    className={cn(
                      'w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left group',
                      accountType === type.id
                        ? 'border-accent bg-accent/5 shadow-lg shadow-accent/10'
                        : 'border-border hover:border-accent/50 bg-surface hover:bg-surface-hover'
                    )}
                  >
                    <div className={cn(
                      'p-2.5 rounded-xl transition-colors',
                      accountType === type.id ? 'bg-accent text-text-inverse' : 'bg-background text-text-muted group-hover:text-accent'
                    )}>
                      {type.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-text-primary">{type.name}</h3>
                        {type.badge && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-accent/20 text-accent rounded-full">
                            {type.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-muted mt-0.5">{type.description}</p>
                      {accountType === type.id && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {type.features.map((feature, i) => (
                            <span key={i} className="px-2 py-1 text-xs bg-background rounded-md text-text-secondary">
                              {feature}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-colors',
                      accountType === type.id ? 'border-accent bg-accent' : 'border-border group-hover:border-accent/50'
                    )}>
                      {accountType === type.id && (
                        <svg className="w-3 h-3 text-text-inverse" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Onboarding hint */}
              {(accountType === 'organization' || accountType === 'business') && (
                <div className="mt-4 p-3 bg-accent/5 border border-accent/20 rounded-lg flex items-start gap-3">
                  <svg className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm">
                    <p className="text-text-primary font-medium">Setup wizard included</p>
                    <p className="text-text-muted mt-0.5">
                      After signup, you'll configure team members, roles, federation, and moderation settings.
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={continueFromType}
                className="w-full mt-6 py-3 bg-accent hover:bg-accent-hover text-text-inverse font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Continue
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          )}

          {step === 'org-type' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <button
                onClick={goBack}
                className="flex items-center gap-2 text-text-muted hover:text-text-primary mb-4 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back
              </button>

              <h1 className="text-2xl font-bold text-text-primary mb-2">What type of organization?</h1>
              <p className="text-text-muted mb-6">This helps us customize your experience and features</p>

              <div className="space-y-3">
                {ORGANIZATION_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setOrganizationType(type.id)}
                    className={cn(
                      'w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left group',
                      organizationType === type.id
                        ? 'border-accent bg-accent/5 shadow-lg shadow-accent/10'
                        : 'border-border hover:border-accent/50 bg-surface hover:bg-surface-hover'
                    )}
                  >
                    <div className={cn(
                      'p-2 rounded-lg transition-colors',
                      organizationType === type.id ? 'bg-accent text-text-inverse' : 'bg-background text-text-muted group-hover:text-accent'
                    )}>
                      {type.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-text-primary">{type.name}</h3>
                        {type.usesFullOnboarding && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400 rounded-full">
                            Full setup
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-text-muted mt-0.5">{type.description}</p>
                      {organizationType === type.id && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {type.features.map((feature, i) => (
                            <span key={i} className="px-2 py-1 text-xs bg-background rounded-md text-text-secondary">
                              {feature}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={cn(
                      'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 transition-colors',
                      organizationType === type.id ? 'border-accent bg-accent' : 'border-border group-hover:border-accent/50'
                    )}>
                      {organizationType === type.id && (
                        <svg className="w-3 h-3 text-text-inverse" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <button
                onClick={continueFromOrgType}
                className="w-full mt-6 py-3 bg-accent hover:bg-accent-hover text-text-inverse font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                Continue
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          )}

          {step === 'details' && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <button
                onClick={goBack}
                className="flex items-center gap-2 text-text-muted hover:text-text-primary mb-4 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Back
              </button>

              {/* Selected type badge */}
              <div className="flex items-center gap-3 mb-6 p-3 bg-surface rounded-xl border border-border">
                <div className="p-2 rounded-lg bg-accent/20 text-accent">
                  {selectedAccountType?.icon}
                </div>
                <div>
                  <p className="font-medium text-text-primary text-sm">{selectedAccountType?.name} Account</p>
                  {accountType === 'organization' && (
                    <p className="text-xs text-text-muted">{selectedOrgType?.name}</p>
                  )}
                </div>
              </div>

              <h1 className="text-2xl font-bold text-text-primary mb-2">Create your account</h1>
              <p className="text-text-muted mb-6">Enter your details to get started</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Organization Name */}
                {(accountType === 'organization' || accountType === 'business') && (
                  <div>
                    <label htmlFor="organizationName" className="block text-sm font-medium text-text-secondary mb-2">
                      {accountType === 'business' ? 'Business Name' : 'Organization Name'}
                    </label>
                    <input
                      id="organizationName"
                      name="organizationName"
                      type="text"
                      value={formData.organizationName}
                      onChange={handleChange}
                      placeholder={accountType === 'business' ? 'Acme Inc.' : 'My Organization'}
                      className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
                      disabled={isLoading}
                      required
                    />
                  </div>
                )}

                {/* Username */}
                <div>
                  <label htmlFor="handle" className="block text-sm font-medium text-text-secondary mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">@</span>
                    <input
                      id="handle"
                      name="handle"
                      type="text"
                      value={formData.handle}
                      onChange={handleChange}
                      placeholder="yourname"
                      className="w-full pl-8 pr-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
                      disabled={isLoading}
                      required
                      autoComplete="username"
                    />
                  </div>
                  <p className="text-xs text-text-muted mt-1.5">
                    3-20 characters, letters, numbers, and underscores
                  </p>
                </div>

                {/* Display Name */}
                <div>
                  <label htmlFor="displayName" className="block text-sm font-medium text-text-secondary mb-2">
                    Display Name <span className="text-text-muted font-normal">(optional)</span>
                  </label>
                  <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    value={formData.displayName}
                    onChange={handleChange}
                    placeholder="Your Name"
                    className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
                    disabled={isLoading}
                    autoComplete="name"
                  />
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-text-secondary mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
                    disabled={isLoading}
                    required
                    autoComplete="email"
                  />
                </div>

                {/* Website (for org/business) */}
                {(accountType === 'organization' || accountType === 'business') && (
                  <div>
                    <label htmlFor="website" className="block text-sm font-medium text-text-secondary mb-2">
                      Website <span className="text-text-muted font-normal">(optional)</span>
                    </label>
                    <input
                      id="website"
                      name="website"
                      type="url"
                      value={formData.website}
                      onChange={handleChange}
                      placeholder="https://yourwebsite.com"
                      className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
                      disabled={isLoading}
                    />
                  </div>
                )}

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="At least 8 characters"
                      className="w-full px-4 py-3 pr-12 bg-surface border border-border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
                      disabled={isLoading}
                      required
                      autoComplete="new-password"
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {/* Password strength indicator */}
                  {formData.password && (
                    <div className="mt-2">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <div
                            key={level}
                            className={cn(
                              'h-1 flex-1 rounded-full transition-colors',
                              passwordStrength >= level
                                ? passwordStrength <= 2 ? 'bg-error' : passwordStrength <= 3 ? 'bg-warning' : 'bg-success'
                                : 'bg-border'
                            )}
                          />
                        ))}
                      </div>
                      <p className={cn(
                        'text-xs mt-1',
                        passwordStrength <= 2 ? 'text-error' : passwordStrength <= 3 ? 'text-warning' : 'text-success'
                      )}>
                        {passwordStrength <= 2 ? 'Weak' : passwordStrength <= 3 ? 'Fair' : passwordStrength <= 4 ? 'Good' : 'Strong'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-secondary mb-2">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Re-enter your password"
                    className={cn(
                      'w-full px-4 py-3 bg-surface border rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow',
                      formData.confirmPassword && formData.password !== formData.confirmPassword
                        ? 'border-error'
                        : 'border-border'
                    )}
                    disabled={isLoading}
                    required
                    autoComplete="new-password"
                  />
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-xs text-error mt-1">Passwords don't match</p>
                  )}
                </div>

                {/* Error message */}
                {error && (
                  <div className="p-3 bg-error/10 border border-error/30 rounded-xl text-error text-sm flex items-start gap-2">
                    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    {error}
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading || (formData.password !== formData.confirmPassword && !!formData.confirmPassword)}
                  className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-text-inverse font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-text-inverse/30 border-t-text-inverse rounded-full animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create Account
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </>
                  )}
                </button>

                {/* Next steps hint for org accounts */}
                {(accountType === 'organization' || accountType === 'business') && selectedOrgType?.usesFullOnboarding && (
                  <p className="text-xs text-text-muted text-center">
                    After signup, you'll be guided through team and settings configuration
                  </p>
                )}
              </form>

              {/* Divider */}
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-border" />
                <span className="text-text-muted text-sm">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Sign in link */}
              <p className="text-center text-text-muted text-sm">
                Already have an account?{' '}
                <Link href="/login" className="text-accent hover:text-accent-hover font-medium">
                  Sign in
                </Link>
              </p>
            </div>
          )}

          {/* Protocol info - shown on first step */}
          {step === 'type' && (
            <>
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-border" />
                <span className="text-text-muted text-sm">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <p className="text-center text-text-muted text-sm mb-6">
                Already have an account?{' '}
                <Link href="/login" className="text-accent hover:text-accent-hover font-medium">
                  Sign in
                </Link>
              </p>

              <div className="p-4 bg-surface rounded-xl border border-border">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-text-primary font-medium">Your data, your identity</h3>
                    <p className="text-text-muted text-sm mt-1">
                      Built on AT Protocol - own your identity and move between services freely.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right side - Feature preview (hidden on mobile) */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-accent/10 via-background to-accent/5 items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-64 h-64 bg-accent/20 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-md">
          {selectedAccountType && (
            <div className="animate-in fade-in duration-500">
              <div className="p-3 inline-flex rounded-2xl bg-accent/20 text-accent mb-6">
                {selectedAccountType.icon}
              </div>
              <h2 className="text-3xl font-bold text-text-primary mb-3">{selectedAccountType.name}</h2>
              <p className="text-lg text-text-muted mb-8">{selectedAccountType.description}</p>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider">Features included</h3>
                {selectedAccountType.features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <span className="text-text-primary">{feature}</span>
                  </div>
                ))}
              </div>

              {selectedAccountType.usesOnboarding && (
                <div className="mt-8 p-4 bg-surface/50 backdrop-blur rounded-xl border border-border">
                  <div className="flex items-center gap-2 text-accent mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    <span className="font-medium">Guided Setup</span>
                  </div>
                  <p className="text-sm text-text-muted">
                    Configure team members, roles, federation settings, and moderation policies with our step-by-step wizard.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
