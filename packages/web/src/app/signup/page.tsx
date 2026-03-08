'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type AccountType = 'user' | 'organization' | 'business' | 'creator';
type OrganizationType = 'team' | 'enterprise' | 'nonprofit';

interface AccountTypeOption {
  id: AccountType;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const ACCOUNT_TYPES: AccountTypeOption[] = [
  {
    id: 'user',
    name: 'Personal',
    description: 'For individuals who want to share and discover content',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    id: 'creator',
    name: 'Creator',
    description: 'For content creators with advanced analytics and monetization',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    ),
  },
  {
    id: 'business',
    name: 'Business',
    description: 'For brands and businesses to connect with audiences',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    id: 'organization',
    name: 'Organization',
    description: 'For teams, communities, and groups with multiple members',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
];

const ORGANIZATION_TYPES: { id: OrganizationType; name: string; description: string }[] = [
  { id: 'team', name: 'Team', description: 'Small team or startup' },
  { id: 'enterprise', name: 'Enterprise', description: 'Large organization with multiple departments' },
  { id: 'nonprofit', name: 'Nonprofit', description: 'Charitable organization or community group' },
];

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [accountType, setAccountType] = useState<AccountType>('user');
  const [organizationType, setOrganizationType] = useState<OrganizationType>('team');
  const [formData, setFormData] = useState({
    handle: '',
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
    // Organization-specific fields
    organizationName: '',
    website: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
      setError('Handle must be at least 3 characters');
      return;
    }

    if ((accountType === 'organization' || accountType === 'business') && !formData.organizationName) {
      setError('Organization name is required');
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Create the user account
      await signUp({
        handle: formData.handle,
        email: formData.email,
        password: formData.password,
        displayName: formData.displayName || formData.handle,
      });

      // Step 2: Create organization for business/organization accounts
      if (accountType === 'organization' || accountType === 'business') {
        try {
          // Determine organization type
          const orgType = accountType === 'business'
            ? 'business'
            : organizationType; // 'team' | 'enterprise' | 'nonprofit'

          await api.createOrganization({
            name: formData.organizationName,
            type: orgType,
            website: formData.website || undefined,
          });
        } catch (orgError) {
          // Log the error but don't block signup - user can create org later
          console.error('Failed to create organization:', orgError);
          // Store pending setup for retry
          localStorage.setItem('pendingAccountSetup', JSON.stringify({
            accountType,
            organizationType: accountType === 'organization' ? organizationType : undefined,
            organizationName: formData.organizationName || undefined,
            website: formData.website || undefined,
          }));
        }
      } else if (accountType === 'creator') {
        // Store creator metadata for profile setup
        localStorage.setItem('pendingAccountSetup', JSON.stringify({
          accountType,
        }));
      }

      // Redirect to home on success
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
      setIsLoading(false);
    }
  };

  const continueToDetails = () => {
    setStep('details');
  };

  const goBackToType = () => {
    setStep('type');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-accent to-accent-hover rounded-xl flex items-center justify-center">
              <span className="text-text-inverse font-bold text-2xl">E</span>
            </div>
            <span className="text-3xl font-bold text-text-primary">exprsn</span>
          </div>
          <p className="text-text-muted mt-4">
            {step === 'type' ? 'Choose your account type' : 'Create your account'}
          </p>
        </div>

        {step === 'type' ? (
          <>
            {/* Account Type Selection */}
            <div className="space-y-3 mb-6">
              {ACCOUNT_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setAccountType(type.id)}
                  className={cn(
                    'w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left',
                    accountType === type.id
                      ? 'border-accent bg-accent/10'
                      : 'border-border hover:border-accent/50 bg-surface'
                  )}
                >
                  <div className={cn(
                    'p-2 rounded-lg',
                    accountType === type.id ? 'bg-accent text-text-inverse' : 'bg-background text-text-muted'
                  )}>
                    {type.icon}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-text-primary">{type.name}</h3>
                    <p className="text-sm text-text-muted mt-0.5">{type.description}</p>
                  </div>
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                    accountType === type.id ? 'border-accent bg-accent' : 'border-border'
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

            {/* Organization Type (shown for organization accounts) */}
            {accountType === 'organization' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-text-secondary mb-3">
                  Organization Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {ORGANIZATION_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setOrganizationType(type.id)}
                      className={cn(
                        'p-3 rounded-lg border-2 text-center transition-all',
                        organizationType === type.id
                          ? 'border-accent bg-accent/10'
                          : 'border-border hover:border-accent/50 bg-surface'
                      )}
                    >
                      <p className="font-medium text-text-primary text-sm">{type.name}</p>
                      <p className="text-xs text-text-muted mt-0.5">{type.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Continue Button */}
            <button
              onClick={continueToDetails}
              className="w-full py-3 bg-accent hover:bg-accent-hover text-text-inverse font-medium rounded-lg transition-colors"
            >
              Continue
            </button>
          </>
        ) : (
          <>
            {/* Back button */}
            <button
              onClick={goBackToType}
              className="flex items-center gap-2 text-text-muted hover:text-text-primary mb-4"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Change account type
            </button>

            {/* Selected account type badge */}
            <div className="flex items-center gap-2 mb-6 p-3 bg-surface rounded-lg border border-border">
              <div className="p-1.5 rounded-lg bg-accent/20 text-accent">
                {ACCOUNT_TYPES.find(t => t.id === accountType)?.icon}
              </div>
              <div>
                <p className="font-medium text-text-primary text-sm">
                  {ACCOUNT_TYPES.find(t => t.id === accountType)?.name} Account
                </p>
                {accountType === 'organization' && (
                  <p className="text-xs text-text-muted">
                    {ORGANIZATION_TYPES.find(t => t.id === organizationType)?.name}
                  </p>
                )}
              </div>
            </div>

            {/* Sign up form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Organization Name (for org/business accounts) */}
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
                    placeholder={accountType === 'business' ? 'Your Company' : 'Your Organization'}
                    className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    disabled={isLoading}
                    required
                  />
                </div>
              )}

              {/* Handle */}
              <div>
                <label htmlFor="handle" className="block text-sm font-medium text-text-secondary mb-2">
                  Username
                </label>
                <input
                  id="handle"
                  name="handle"
                  type="text"
                  value={formData.handle}
                  onChange={handleChange}
                  placeholder="yourname"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  disabled={isLoading}
                  required
                  autoComplete="username"
                />
                <p className="text-xs text-text-muted mt-1">
                  3-20 characters, letters, numbers, and underscores only
                </p>
              </div>

              {/* Display Name */}
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-text-secondary mb-2">
                  Display Name <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  value={formData.displayName}
                  onChange={handleChange}
                  placeholder="Your Name"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
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
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  disabled={isLoading}
                  required
                  autoComplete="email"
                />
              </div>

              {/* Website (for org/business accounts) */}
              {(accountType === 'organization' || accountType === 'business') && (
                <div>
                  <label htmlFor="website" className="block text-sm font-medium text-text-secondary mb-2">
                    Website <span className="text-text-muted">(optional)</span>
                  </label>
                  <input
                    id="website"
                    name="website"
                    type="url"
                    value={formData.website}
                    onChange={handleChange}
                    placeholder="https://yourwebsite.com"
                    className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                    disabled={isLoading}
                  />
                </div>
              )}

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-text-secondary mb-2">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  disabled={isLoading}
                  required
                  autoComplete="new-password"
                  minLength={8}
                />
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-secondary mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Re-enter your password"
                  className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  disabled={isLoading}
                  required
                  autoComplete="new-password"
                />
              </div>

              {/* Error message */}
              {error && (
                <div className="p-3 bg-error-muted border border-error/50 rounded-lg text-error text-sm">
                  {error}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-text-inverse font-medium rounded-lg transition-colors"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-text-inverse/30 border-t-text-inverse rounded-full animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  'Create Account'
                )}
              </button>
            </form>
          </>
        )}

        {/* Divider */}
        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-text-muted text-sm">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Sign in link */}
        <div className="text-center">
          <p className="text-text-muted text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-accent hover:text-accent-hover font-medium">
              Sign in
            </Link>
          </p>
        </div>

        {/* Info */}
        <div className="mt-6 p-4 bg-surface rounded-lg border border-border">
          <h3 className="text-text-primary font-medium mb-2 flex items-center gap-2">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            Your data, your identity
          </h3>
          <p className="text-text-muted text-sm">
            Your account is built on AT Protocol - a decentralized network where you
            own your identity and can move between services freely.
          </p>
        </div>

        {/* Back link */}
        <button
          onClick={() => router.push('/')}
          className="mt-6 text-text-muted hover:text-text-primary text-sm flex items-center gap-2 mx-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Back to feed
        </button>
      </div>
    </div>
  );
}
