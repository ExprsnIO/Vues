'use client';

import { useState } from 'react';
import { FormField, Input, Toggle, Badge } from '@/components/admin/ui';
import { TokenPermissionsEditor } from './TokenPermissionsEditor';
import { RateLimitConfig } from './RateLimitConfig';

interface CreateTokenFormProps {
  onSubmit: (data: {
    name: string;
    description?: string;
    scopes: string[];
    expiresIn?: number;
    rateLimit?: { requests: number; window: number };
  }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  availableScopes?: Array<{
    scope: string;
    label: string;
    description: string;
    category: string;
  }>;
}

const DEFAULT_SCOPES = [
  { scope: 'read:profile', label: 'Read Profile', description: 'Read user profile information', category: 'Users' },
  { scope: 'write:profile', label: 'Write Profile', description: 'Update user profile', category: 'Users' },
  { scope: 'read:content', label: 'Read Content', description: 'Read posts and media', category: 'Content' },
  { scope: 'write:content', label: 'Write Content', description: 'Create and edit posts', category: 'Content' },
  { scope: 'delete:content', label: 'Delete Content', description: 'Delete posts and media', category: 'Content' },
  { scope: 'read:followers', label: 'Read Followers', description: 'Read follower lists', category: 'Social' },
  { scope: 'write:follows', label: 'Write Follows', description: 'Follow/unfollow users', category: 'Social' },
  { scope: 'read:notifications', label: 'Read Notifications', description: 'Read notifications', category: 'Notifications' },
  { scope: 'read:analytics', label: 'Read Analytics', description: 'Access analytics data', category: 'Analytics' },
  { scope: 'admin:users', label: 'Admin Users', description: 'User administration', category: 'Admin' },
  { scope: 'admin:content', label: 'Admin Content', description: 'Content moderation', category: 'Admin' },
  { scope: 'admin:settings', label: 'Admin Settings', description: 'Domain settings', category: 'Admin' },
];

export function CreateTokenForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
  availableScopes = DEFAULT_SCOPES,
}: CreateTokenFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresIn, setExpiresIn] = useState<number | undefined>(90);
  const [hasExpiry, setHasExpiry] = useState(true);
  const [hasRateLimit, setHasRateLimit] = useState(false);
  const [rateLimit, setRateLimit] = useState({ requests: 1000, window: 60 });
  const [step, setStep] = useState<'info' | 'scopes' | 'limits'>('info');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      scopes,
      expiresIn: hasExpiry ? expiresIn : undefined,
      rateLimit: hasRateLimit ? rateLimit : undefined,
    });
  };

  const canProceed = () => {
    if (step === 'info') return name.length >= 3;
    if (step === 'scopes') return scopes.length > 0;
    return true;
  };

  const nextStep = () => {
    if (step === 'info') setStep('scopes');
    else if (step === 'scopes') setStep('limits');
  };

  const prevStep = () => {
    if (step === 'limits') setStep('scopes');
    else if (step === 'scopes') setStep('info');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {['info', 'scopes', 'limits'].map((s, index) => (
          <div key={s} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(s as any)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step === s
                  ? 'bg-accent text-text-inverse'
                  : index < ['info', 'scopes', 'limits'].indexOf(step)
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-surface-hover text-text-muted'
              }`}
            >
              {index < ['info', 'scopes', 'limits'].indexOf(step) ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                index + 1
              )}
            </button>
            {index < 2 && (
              <div className={`w-12 h-0.5 ${
                index < ['info', 'scopes', 'limits'].indexOf(step) ? 'bg-green-500' : 'bg-border'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Basic Info */}
      {step === 'info' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">Token Information</h3>

          <FormField label="Token Name" required hint="A descriptive name for this token">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My API Token"
              autoFocus
            />
          </FormField>

          <FormField label="Description" hint="Optional description for reference">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this token used for?"
              rows={3}
              className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </FormField>
        </div>
      )}

      {/* Step 2: Scopes */}
      {step === 'scopes' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">Permissions</h3>
          <p className="text-sm text-text-muted">Select the permissions this token should have</p>

          <TokenPermissionsEditor
            availableScopes={availableScopes}
            selectedScopes={scopes}
            onChange={setScopes}
          />
        </div>
      )}

      {/* Step 3: Limits */}
      {step === 'limits' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">Expiration & Limits</h3>

          <div className="p-4 bg-surface border border-border rounded-xl space-y-4">
            <Toggle
              checked={hasExpiry}
              onChange={setHasExpiry}
              label="Set Expiration"
              description="Token will automatically expire after the specified time"
            />

            {hasExpiry && (
              <FormField label="Expires In">
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>1 year</option>
                </select>
              </FormField>
            )}
          </div>

          <div className="p-4 bg-surface border border-border rounded-xl space-y-4">
            <Toggle
              checked={hasRateLimit}
              onChange={setHasRateLimit}
              label="Custom Rate Limit"
              description="Override default rate limits for this token"
            />

            {hasRateLimit && (
              <RateLimitConfig
                config={rateLimit}
                onChange={setRateLimit}
              />
            )}
          </div>

          {/* Summary */}
          <div className="p-4 bg-surface-hover rounded-xl">
            <h4 className="text-sm font-medium text-text-primary mb-3">Token Summary</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Name:</span>
                <span className="text-text-primary font-medium">{name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Scopes:</span>
                <span className="text-text-primary font-medium">{scopes.length} permissions</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Expires:</span>
                <span className="text-text-primary font-medium">
                  {hasExpiry ? `In ${expiresIn} days` : 'Never'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Rate Limit:</span>
                <span className="text-text-primary font-medium">
                  {hasRateLimit ? `${rateLimit.requests}/${rateLimit.window}s` : 'Default'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <button
          type="button"
          onClick={step === 'info' ? onCancel : prevStep}
          className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
        >
          {step === 'info' ? 'Cancel' : 'Back'}
        </button>
        {step !== 'limits' ? (
          <button
            type="button"
            onClick={nextStep}
            disabled={!canProceed()}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            Continue
          </button>
        ) : (
          <button
            type="submit"
            disabled={isSubmitting || !canProceed()}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Token'}
          </button>
        )}
      </div>
    </form>
  );
}

export default CreateTokenForm;
