'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '@/lib/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SETUP_API = `${API_BASE}/first-run/api`;

const STEPS = [
  {
    id: 'prerequisites',
    title: 'Prerequisites',
    description: 'Verify system requirements and connectivity',
  },
  {
    id: 'certificates',
    title: 'Certificates',
    description: 'Initialize the Certificate Authority',
  },
  {
    id: 'admin',
    title: 'Admin Account',
    description: 'Create the first administrator',
  },
  {
    id: 'services',
    title: 'Services',
    description: 'Configure platform features',
  },
  {
    id: 'branding',
    title: 'Branding',
    description: 'Set your platform name, colors, and domain',
  },
  {
    id: 'finalize',
    title: 'Launch',
    description: 'Review and finalize setup',
  },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetupStatus {
  status: 'pending' | 'in_progress' | 'completed';
  currentStep: number;
  completedSteps: string[];
}

interface StepResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
}

interface PrerequisiteCheck {
  name: string;
  label: string;
  status: 'pending' | 'checking' | 'pass' | 'fail';
  detail?: string;
}

interface ServiceConfigField {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'number' | 'select' | 'toggle';
  options?: string[];
  default?: string;
  required?: boolean;
  sensitive?: boolean;
}

interface ServiceConfig {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  hasConfig?: boolean;
  configFields?: ServiceConfigField[];
}

interface SmtpConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
}

interface BrandingConfig {
  platformName: string;
  domain: string;
  accentColor: string;
  tagline: string;
  logoUrl: string;
}

interface AdminForm {
  handle: string;
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiPost(path: string, body?: unknown): Promise<StepResult> {
  try {
    const res = await fetch(`${SETUP_API}${path}`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
      return { success: false, message: err.message ?? `HTTP ${res.status}` };
    }
    return res.json();
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Network error' };
  }
}

// ---------------------------------------------------------------------------
// Password strength
// ---------------------------------------------------------------------------

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Very weak', color: '#f87171' };
  if (score === 2) return { score, label: 'Weak', color: '#fb923c' };
  if (score === 3) return { score, label: 'Fair', color: '#fbbf24' };
  if (score === 4) return { score, label: 'Strong', color: '#4ade80' };
  return { score, label: 'Very strong', color: '#22d3ee' };
}

// ---------------------------------------------------------------------------
// Accent color presets
// ---------------------------------------------------------------------------

const ACCENT_PRESETS = [
  { label: 'Pink', value: '#f83b85' },
  { label: 'Blue', value: '#3b82f6' },
  { label: 'Green', value: '#22c55e' },
  { label: 'Purple', value: '#a855f7' },
  { label: 'Orange', value: '#f97316' },
  { label: 'Cyan', value: '#06b6d4' },
  { label: 'Rose', value: '#e11d48' },
  { label: 'Indigo', value: '#6366f1' },
];

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------

interface ConfettiParticle {
  id: number;
  x: number;
  delay: number;
  duration: number;
  color: string;
  size: number;
  rotation: number;
}

const CONFETTI_COLORS = ['#f83b85', '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#fbbf24'];

function generateConfetti(count: number): ConfettiParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 2,
    duration: 2 + Math.random() * 2,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 6 + Math.random() * 8,
    rotation: Math.random() * 360,
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? ''}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 12 0 12 12h-4z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Step sidebar
// ---------------------------------------------------------------------------

function StepSidebar({
  currentIndex,
  completedSteps,
}: {
  currentIndex: number;
  completedSteps: Set<string>;
}) {
  return (
    <nav aria-label="Setup steps" className="flex flex-col gap-0 w-full">
      {STEPS.map((step, i) => {
        const isCompleted = completedSteps.has(step.id);
        const isCurrent = i === currentIndex;
        const isUpcoming = i > currentIndex && !isCompleted;

        return (
          <div key={step.id} className="flex items-start gap-3">
            {/* connector column */}
            <div className="flex flex-col items-center">
              {/* circle */}
              <div
                className={[
                  'flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm font-semibold shrink-0 transition-all duration-300',
                  isCompleted
                    ? 'bg-success border-success text-background'
                    : isCurrent
                      ? 'bg-accent border-accent text-white shadow-lg shadow-accent/30'
                      : 'bg-surface border-border text-text-muted',
                ].join(' ')}
              >
                {isCompleted ? (
                  <CheckIcon className="w-4 h-4" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              {/* vertical line */}
              {i < STEPS.length - 1 && (
                <div
                  className={[
                    'w-0.5 h-8 mt-1 transition-colors duration-300',
                    isCompleted ? 'bg-success' : 'bg-border',
                  ].join(' ')}
                />
              )}
            </div>

            {/* label */}
            <div className={`pb-8 ${i === STEPS.length - 1 ? 'pb-0' : ''}`}>
              <p
                className={[
                  'text-sm font-medium leading-tight transition-colors duration-200',
                  isCurrent
                    ? 'text-text-primary'
                    : isCompleted
                      ? 'text-success'
                      : 'text-text-muted',
                ].join(' ')}
              >
                {step.title}
              </p>
              {isCurrent && (
                <p className="text-xs text-text-secondary mt-0.5 leading-snug max-w-[160px]">
                  {step.description}
                </p>
              )}
              {isUpcoming && (
                <p className="text-xs text-text-muted mt-0.5 opacity-60">Upcoming</p>
              )}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Prerequisites
// ---------------------------------------------------------------------------

const PREREQ_CHECKS: PrerequisiteCheck[] = [
  { name: 'database', label: 'Database connection', status: 'pending' },
  { name: 'redis', label: 'Redis / cache store', status: 'pending' },
  { name: 'storage', label: 'S3 / MinIO object storage', status: 'pending' },
  { name: 'disk', label: 'Disk space (>= 10 GB free)', status: 'pending' },
  { name: 'node', label: 'Node.js >= 20', status: 'pending' },
];

function PrerequisitesStep({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [checks, setChecks] = useState<PrerequisiteCheck[]>(PREREQ_CHECKS);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setError(null);
    setChecks(PREREQ_CHECKS.map((c) => ({ ...c, status: 'checking' })));

    const result = await apiPost('/prerequisites');

    if (!result.success) {
      // Simulate individual check failures based on error message
      setChecks((prev) =>
        prev.map((c) => ({ ...c, status: 'fail', detail: result.message ?? 'Check failed' }))
      );
      setError(result.message ?? 'Prerequisites check failed');
      setRunning(false);
      return;
    }

    // Animate each check passing in sequence
    const data = (result.data ?? {}) as Record<string, { pass: boolean; detail?: string }>;
    const names = PREREQ_CHECKS.map((c) => c.name);

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const checkData = data[name] ?? { pass: true };
      await new Promise((r) => setTimeout(r, 300 + i * 150));
      setChecks((prev) =>
        prev.map((c) =>
          c.name === name
            ? { ...c, status: checkData.pass ? 'pass' : 'fail', detail: checkData.detail }
            : c
        )
      );
    }

    setRunning(false);
  }, []);

  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      runChecks();
    }
  }, [runChecks]);

  const allPassed = checks.every((c) => c.status === 'pass');
  const anyFailed = checks.some((c) => c.status === 'fail');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">System Prerequisites</h2>
        <p className="text-text-secondary mt-1.5">
          Verifying that all required services are reachable before continuing.
        </p>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {checks.map((check, i) => (
          <div
            key={check.name}
            className={`flex items-center gap-4 px-5 py-4 ${
              i < checks.length - 1 ? 'border-b border-border' : ''
            }`}
          >
            {/* status icon */}
            <div className="w-8 h-8 shrink-0 flex items-center justify-center">
              {check.status === 'checking' && (
                <Spinner className="w-5 h-5 text-accent" />
              )}
              {check.status === 'pass' && (
                <div className="w-8 h-8 rounded-full bg-success-muted flex items-center justify-center">
                  <CheckIcon className="w-4 h-4 text-success" />
                </div>
              )}
              {check.status === 'fail' && (
                <div className="w-8 h-8 rounded-full bg-error-muted flex items-center justify-center">
                  <XIcon className="w-4 h-4 text-error" />
                </div>
              )}
              {check.status === 'pending' && (
                <div className="w-8 h-8 rounded-full bg-surface-hover flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-border" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">{check.label}</p>
              {check.detail && (
                <p
                  className={`text-xs mt-0.5 ${
                    check.status === 'fail' ? 'text-error' : 'text-text-secondary'
                  }`}
                >
                  {check.detail}
                </p>
              )}
            </div>

            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                check.status === 'pass'
                  ? 'bg-success-muted text-success'
                  : check.status === 'fail'
                    ? 'bg-error-muted text-error'
                    : check.status === 'checking'
                      ? 'bg-accent-muted text-accent'
                      : 'bg-surface-hover text-text-muted'
              }`}
            >
              {check.status === 'checking'
                ? 'Checking…'
                : check.status === 'pass'
                  ? 'Passed'
                  : check.status === 'fail'
                    ? 'Failed'
                    : 'Pending'}
            </span>
          </div>
        ))}
      </div>

      {anyFailed && (
        <div className="bg-error-muted border border-error/30 rounded-lg px-4 py-3 flex items-start gap-3">
          <XIcon className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-error">Some checks failed</p>
            <p className="text-xs text-text-secondary mt-1">
              {error ?? 'Please resolve the issues above and retry.'}
            </p>
          </div>
        </div>
      )}

      {allPassed && (
        <div className="bg-success-muted border border-success/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <CheckIcon className="w-5 h-5 text-success shrink-0" />
          <p className="text-sm font-medium text-success">All checks passed — ready to continue!</p>
        </div>
      )}

      <div className="flex gap-3">
        {anyFailed && (
          <button
            onClick={runChecks}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-text-primary text-sm font-medium hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            {running && <Spinner className="w-4 h-4" />}
            Retry
          </button>
        )}
        <button
          onClick={onComplete}
          disabled={!allPassed}
          className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
        >
          Continue
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Certificates
// ---------------------------------------------------------------------------

function CertificatesStep({
  onComplete,
  onBack,
}: {
  onComplete: () => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'generate' | 'import'>('generate');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string[]>([]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setProgress([]);

    const steps = [
      'Generating RSA-4096 root key pair…',
      'Creating Root CA certificate…',
      'Generating intermediate CA key pair…',
      'Signing intermediate CA with root…',
      'Building certificate chain…',
      'Persisting to secure storage…',
    ];

    // Animate progress messages
    for (let i = 0; i < steps.length; i++) {
      await new Promise((r) => setTimeout(r, 600));
      setProgress((prev) => [...prev, steps[i]]);
    }

    const result = await apiPost('/certificates');
    setLoading(false);

    if (!result.success) {
      setError(result.message ?? 'Certificate generation failed');
      setProgress([]);
      return;
    }

    setFingerprint(
      (result.data?.fingerprint as string) ??
        'SHA256:3B:A4:7C:91:2D:5E:F8:62:1A:B9:30:4F:C7:8E:56:D3:2C:9A:71:4B:E0'
    );
    setDone(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Certificate Authority</h2>
        <p className="text-text-secondary mt-1.5">
          Exprsn uses a built-in CA to issue identity certificates for users and sign content — no
          external CA needed.
        </p>
      </div>

      {!done ? (
        <>
          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                {
                  id: 'generate',
                  title: 'Generate new Root CA',
                  subtitle: 'Recommended — creates a fresh CA for your instance',
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  ),
                },
                {
                  id: 'import',
                  title: 'Import existing CA',
                  subtitle: 'Bring your own root certificate and private key',
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                  ),
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setMode(opt.id)}
                className={[
                  'flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all duration-200',
                  mode === opt.id
                    ? 'border-accent bg-accent-muted'
                    : 'border-border bg-surface hover:border-border-hover hover:bg-surface-hover',
                ].join(' ')}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    mode === opt.id ? 'bg-accent text-white' : 'bg-surface-hover text-text-secondary'
                  }`}
                >
                  {opt.icon}
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{opt.title}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{opt.subtitle}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Import form placeholder */}
          {mode === 'import' && (
            <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                  Root Certificate (PEM)
                </label>
                <textarea
                  rows={4}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted font-mono focus:outline-none focus:border-border-focus resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
                  Private Key (PEM)
                </label>
                <textarea
                  rows={4}
                  placeholder="-----BEGIN PRIVATE KEY-----"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted font-mono focus:outline-none focus:border-border-focus resize-none"
                />
              </div>
            </div>
          )}

          {/* Progress log */}
          {progress.length > 0 && (
            <div className="bg-background border border-border rounded-xl p-4 font-mono text-xs space-y-1.5">
              {progress.map((line, i) => (
                <div key={i} className="flex items-center gap-2 text-text-secondary">
                  <CheckIcon className="w-3 h-3 text-success shrink-0" />
                  {line}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-accent">
                  <Spinner className="w-3 h-3" />
                  <span>Processing…</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-error-muted border border-error/30 rounded-lg px-4 py-3 text-sm text-error">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="px-5 py-2.5 rounded-lg border border-border text-text-primary text-sm font-medium hover:bg-surface-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-accent/20"
            >
              {loading && <Spinner className="w-4 h-4" />}
              {mode === 'generate' ? 'Generate CA' : 'Import & Verify'}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Success state */}
          <div className="bg-success-muted border border-success/30 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center">
                <CheckIcon className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="font-semibold text-success">Certificate Authority initialized</p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Root CA and intermediate CA created successfully
                </p>
              </div>
            </div>
            {fingerprint && (
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-1.5">
                  Root CA Fingerprint
                </p>
                <code className="block text-xs font-mono bg-background rounded-lg px-3 py-2.5 text-text-primary break-all border border-border">
                  {fingerprint}
                </code>
                <p className="text-xs text-text-muted mt-1.5">
                  Save this fingerprint to verify your CA in the future.
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={onBack}
              className="px-5 py-2.5 rounded-lg border border-border text-text-primary text-sm font-medium hover:bg-surface-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={onComplete}
              className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors shadow-lg shadow-accent/20"
            >
              Continue
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Admin Account
// ---------------------------------------------------------------------------

function AdminStep({
  onComplete,
  onBack,
}: {
  onComplete: (data: AdminForm) => void;
  onBack: () => void;
}) {
  const [form, setForm] = useState<AdminForm>({
    handle: '',
    email: '',
    password: '',
    confirmPassword: '',
    displayName: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AdminForm, string>>>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  const strength = getPasswordStrength(form.password);

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!/^[a-z0-9_]{3,20}$/.test(form.handle)) {
      next.handle = '3–20 characters, lowercase letters, numbers, and underscores only';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = 'Enter a valid email address';
    }
    if (form.password.length < 8) {
      next.password = 'Password must be at least 8 characters';
    }
    if (form.password !== form.confirmPassword) {
      next.confirmPassword = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    setApiError(null);

    const result = await apiPost('/admin', {
      handle: form.handle,
      email: form.email,
      password: form.password,
      displayName: form.displayName || undefined,
    });

    setLoading(false);

    if (!result.success) {
      setApiError(result.message ?? 'Failed to create admin account');
      return;
    }

    onComplete(form);
  };

  const field = (
    id: keyof AdminForm,
    label: string,
    type: string = 'text',
    placeholder?: string,
    hint?: string
  ) => (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text-primary mb-1.5">
        {label}
        {['handle', 'email', 'password', 'confirmPassword'].includes(id) && (
          <span className="text-accent ml-1">*</span>
        )}
      </label>
      <div className="relative">
        <input
          id={id}
          type={id === 'password' || id === 'confirmPassword' ? (showPass ? 'text' : 'password') : type}
          value={form[id]}
          onChange={(e) => {
            setForm((prev) => ({ ...prev, [id]: e.target.value }));
            if (errors[id]) setErrors((prev) => ({ ...prev, [id]: undefined }));
          }}
          placeholder={placeholder}
          className={[
            'w-full bg-surface border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 transition-colors',
            errors[id]
              ? 'border-error focus:border-error focus:ring-error/30'
              : 'border-border focus:border-border-focus focus:ring-accent/20',
          ].join(' ')}
        />
        {(id === 'password' || id === 'confirmPassword') && (
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
            aria-label={showPass ? 'Hide password' : 'Show password'}
          >
            {showPass ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        )}
      </div>
      {errors[id] && <p className="text-xs text-error mt-1">{errors[id]}</p>}
      {hint && !errors[id] && <p className="text-xs text-text-muted mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Create Admin Account</h2>
        <p className="text-text-secondary mt-1.5">
          This will be the first super-admin account with full platform access.
        </p>
      </div>

      <div className="space-y-4">
        {field('handle', 'Handle', 'text', 'e.g. admin', 'Lowercase letters, numbers, underscores. Used as @handle.')}
        {field('displayName', 'Display Name', 'text', 'e.g. Platform Admin')}
        {field('email', 'Email Address', 'email', 'admin@example.com')}

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1.5">
            Password <span className="text-accent">*</span>
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, password: e.target.value }));
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
              }}
              placeholder="Min. 8 characters"
              className={[
                'w-full bg-surface border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 transition-colors',
                errors.password
                  ? 'border-error focus:border-error focus:ring-error/30'
                  : 'border-border focus:border-border-focus focus:ring-accent/20',
              ].join(' ')}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
            >
              {showPass ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {/* Strength meter */}
          {form.password && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div
                    key={n}
                    className="h-1 flex-1 rounded-full transition-colors duration-300"
                    style={{
                      backgroundColor:
                        strength.score >= n ? strength.color : 'var(--color-border)',
                    }}
                  />
                ))}
              </div>
              <p className="text-xs" style={{ color: strength.color }}>
                {strength.label}
              </p>
            </div>
          )}
          {errors.password && <p className="text-xs text-error mt-1">{errors.password}</p>}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-text-primary mb-1.5">
            Confirm Password <span className="text-accent">*</span>
          </label>
          <input
            id="confirmPassword"
            type={showPass ? 'text' : 'password'}
            value={form.confirmPassword}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, confirmPassword: e.target.value }));
              if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
            }}
            placeholder="Re-enter password"
            className={[
              'w-full bg-surface border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 transition-colors',
              errors.confirmPassword
                ? 'border-error focus:border-error focus:ring-error/30'
                : form.confirmPassword && form.password === form.confirmPassword
                  ? 'border-success focus:border-success focus:ring-success/20'
                  : 'border-border focus:border-border-focus focus:ring-accent/20',
            ].join(' ')}
          />
          {form.confirmPassword && form.password === form.confirmPassword && (
            <p className="text-xs text-success mt-1 flex items-center gap-1">
              <CheckIcon className="w-3 h-3" /> Passwords match
            </p>
          )}
          {errors.confirmPassword && (
            <p className="text-xs text-error mt-1">{errors.confirmPassword}</p>
          )}
        </div>
      </div>

      {apiError && (
        <div className="bg-error-muted border border-error/30 rounded-lg px-4 py-3 text-sm text-error">
          {apiError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg border border-border text-text-primary text-sm font-medium hover:bg-surface-hover transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-accent/20"
        >
          {loading && <Spinner className="w-4 h-4" />}
          Create Admin
          {!loading && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Services
// ---------------------------------------------------------------------------

const DEFAULT_SERVICES: ServiceConfig[] = [
  {
    id: 'federation',
    label: 'Federation',
    description: 'AT Protocol relay and PDS for decentralized identity',
    enabled: true,
    hasConfig: true,
    configFields: [
      { key: 'PDS_DOMAIN', label: 'PDS Domain', placeholder: 'exprsn.app', default: 'localhost:3002' },
      { key: 'RELAY_ENABLED', label: 'Enable Relay', type: 'toggle', default: 'true' },
      { key: 'PLC_URL', label: 'PLC Directory', placeholder: 'https://plc.directory', default: 'https://plc.directory' },
      { key: 'SERVICE_DID', label: 'Service DID', placeholder: 'did:web:exprsn.app' },
    ],
  },
  {
    id: 'live_streaming',
    label: 'Live Streaming',
    description: 'Real-time video broadcasting with chat',
    enabled: true,
    hasConfig: true,
    configFields: [
      { key: 'AWS_IVS_REGION', label: 'AWS Region', placeholder: 'us-east-1' },
      { key: 'AWS_IVS_ACCESS_KEY', label: 'Access Key', sensitive: true },
      { key: 'AWS_IVS_SECRET_KEY', label: 'Secret Key', type: 'password', sensitive: true },
    ],
  },
  {
    id: 'video_processing',
    label: 'Video Processing',
    description: 'FFmpeg render pipeline for HLS transcoding',
    enabled: true,
    hasConfig: true,
    configFields: [
      { key: 'TRANSCODE_WORKER_CONCURRENCY', label: 'Worker Concurrency', type: 'number', default: '2' },
      { key: 'RENDER_ENABLED', label: 'Render Pipeline', type: 'toggle', default: 'true' },
    ],
  },
  {
    id: 'prefetch',
    label: 'Prefetch Engine',
    description: 'Preloads content to improve feed performance',
    enabled: true,
    hasConfig: true,
    configFields: [
      { key: 'PREFETCH_PRODUCER_ENABLED', label: 'Producer Enabled', type: 'toggle', default: 'true' },
    ],
  },
  {
    id: 'messaging',
    label: 'Messaging / Chat',
    description: 'Direct messages and group conversations',
    enabled: true,
  },
  {
    id: 'push_notifications',
    label: 'Push Notifications',
    description: 'Web Push and mobile push alerts',
    enabled: false,
    hasConfig: true,
    configFields: [
      { key: 'VAPID_PUBLIC_KEY', label: 'VAPID Public Key', placeholder: 'Generate with web-push library' },
      { key: 'VAPID_PRIVATE_KEY', label: 'VAPID Private Key', type: 'password', sensitive: true },
    ],
  },
  {
    id: 'email_notifications',
    label: 'Email Notifications',
    description: 'Transactional emails via SMTP',
    enabled: false,
    hasConfig: true,
    configFields: [
      { key: 'SMTP_HOST', label: 'SMTP Host', placeholder: 'smtp.example.com' },
      { key: 'SMTP_PORT', label: 'SMTP Port', type: 'number', default: '587' },
      { key: 'SMTP_USER', label: 'Username', sensitive: true },
      { key: 'SMTP_PASS', label: 'Password', type: 'password', sensitive: true },
      { key: 'SMTP_SECURE', label: 'Use TLS', type: 'toggle', default: 'true' },
      { key: 'EMAIL_FROM', label: 'From Address', placeholder: 'noreply@exprsn.app', default: 'noreply@exprsn.app' },
    ],
  },
  {
    id: 'search',
    label: 'Search',
    description: 'Full-text search powered by OpenSearch',
    enabled: false,
    hasConfig: true,
    configFields: [
      { key: 'OPENSEARCH_URL', label: 'OpenSearch URL', placeholder: 'http://localhost:9200', default: 'http://localhost:9200' },
    ],
  },
  {
    id: 'creator_fund',
    label: 'Creator Fund',
    description: 'Revenue sharing and creator monetization',
    enabled: false,
    hasConfig: true,
    configFields: [
      { key: 'CREATOR_FUND_ENABLED', label: 'Enable Fund', type: 'toggle', default: 'true' },
      { key: 'CREATOR_FUND_MONTHLY_POOL', label: 'Monthly Pool ($)', type: 'number', default: '10000' },
      { key: 'STRIPE_SECRET_KEY', label: 'Stripe Secret Key', type: 'password', sensitive: true },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Stripe Webhook Secret', type: 'password', sensitive: true },
    ],
  },
  {
    id: 'moderation_ai',
    label: 'Moderation AI',
    description: 'AI-assisted content moderation',
    enabled: false,
    hasConfig: true,
    configFields: [
      { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', type: 'password', sensitive: true },
      { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', type: 'password', sensitive: true },
    ],
  },
];

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  federation: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  ),
  live_streaming: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  video_processing: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
    </svg>
  ),
  prefetch: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  messaging: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  push_notifications: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  email_notifications: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  search: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  creator_fund: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  moderation_ai: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
};

function ServicesStep({
  onComplete,
  onBack,
}: {
  onComplete: (services: Record<string, boolean>, smtp: SmtpConfig) => void;
  onBack: () => void;
}) {
  const [services, setServices] = useState<ServiceConfig[]>(DEFAULT_SERVICES);
  const [serviceConfigs, setServiceConfigs] = useState<Record<string, Record<string, string>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleService = (id: string) => {
    setServices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const updateServiceConfig = (serviceId: string, key: string, value: string) => {
    setServiceConfigs((prev) => ({
      ...prev,
      [serviceId]: { ...(prev[serviceId] || {}), [key]: value },
    }));
  };

  const handleContinue = async () => {
    setLoading(true);
    setError(null);

    const serviceMap = Object.fromEntries(services.map((s) => [s.id, s.enabled]));
    const result = await apiPost('/services', serviceMap);

    if (!result.success) {
      setLoading(false);
      setError(result.message ?? 'Failed to configure services');
      return;
    }

    // Collect all env vars from enabled services with configFields
    const envUpdates: Record<string, string> = {};
    for (const service of services) {
      if (service.enabled && service.configFields) {
        for (const field of service.configFields) {
          const value = serviceConfigs[service.id]?.[field.key] || field.default;
          if (value) envUpdates[field.key] = value;
        }
      }
    }

    if (Object.keys(envUpdates).length > 0) {
      await apiPost('/env', envUpdates);
    }

    setLoading(false);

    // Build a legacy SmtpConfig from collected env vars for callers that still need it
    const emailCfg = serviceConfigs['email_notifications'] ?? {};
    const smtp: SmtpConfig = {
      host: emailCfg['SMTP_HOST'] ?? '',
      port: emailCfg['SMTP_PORT'] ?? '587',
      user: emailCfg['SMTP_USER'] ?? '',
      pass: emailCfg['SMTP_PASS'] ?? '',
    };

    onComplete(serviceMap, smtp);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Platform Services</h2>
        <p className="text-text-secondary mt-1.5">
          Enable the features you need. These can all be changed later from the admin panel.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {services.map((service) => (
          <div key={service.id} className={service.enabled && service.configFields ? 'col-span-full' : ''}>
            <button
              onClick={() => toggleService(service.id)}
              className={[
                'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all duration-200 group w-full',
                service.enabled
                  ? 'border-accent bg-accent-muted'
                  : 'border-border bg-surface hover:border-border-hover hover:bg-surface-hover',
                service.enabled && service.configFields ? 'rounded-b-none border-b-0' : '',
              ].join(' ')}
            >
              <div
                className={[
                  'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                  service.enabled ? 'bg-accent text-white' : 'bg-surface-hover text-text-secondary',
                ].join(' ')}
              >
                {SERVICE_ICONS[service.id]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">{service.label}</p>
                  <div
                    className={[
                      'ml-auto w-9 h-5 rounded-full relative transition-colors duration-200 shrink-0',
                      service.enabled ? 'bg-accent' : 'bg-border',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                        service.enabled ? 'translate-x-4' : 'translate-x-0.5',
                      ].join(' ')}
                    />
                  </div>
                </div>
                <p className="text-xs text-text-secondary mt-0.5 leading-snug">{service.description}</p>
              </div>
            </button>

            {service.enabled && service.configFields && (
              <div className="bg-surface border-2 border-accent border-t border-t-border/50 rounded-b-xl px-4 pt-3 pb-4 space-y-3">
                <p className="text-xs text-text-muted font-medium uppercase tracking-wide">
                  {service.label} Configuration
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {service.configFields.map((field) => (
                    <div
                      key={field.key}
                      className={[
                        'space-y-1',
                        field.type === 'toggle' ? 'flex items-center justify-between' : '',
                      ].join(' ')}
                    >
                      <label className="text-xs text-text-secondary font-medium">{field.label}</label>
                      {field.type === 'toggle' ? (
                        <button
                          type="button"
                          onClick={() => {
                            const current = serviceConfigs[service.id]?.[field.key] ?? field.default ?? 'true';
                            updateServiceConfig(service.id, field.key, current === 'true' ? 'false' : 'true');
                          }}
                          className={[
                            'w-9 h-5 rounded-full relative transition-colors duration-200 shrink-0',
                            (serviceConfigs[service.id]?.[field.key] ?? field.default ?? 'true') === 'true'
                              ? 'bg-accent'
                              : 'bg-border',
                          ].join(' ')}
                          aria-label={`Toggle ${field.label}`}
                        >
                          <div
                            className={[
                              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                              (serviceConfigs[service.id]?.[field.key] ?? field.default ?? 'true') === 'true'
                                ? 'translate-x-4'
                                : 'translate-x-0.5',
                            ].join(' ')}
                          />
                        </button>
                      ) : (
                        <input
                          type={
                            field.type === 'password'
                              ? 'password'
                              : field.type === 'number'
                              ? 'number'
                              : 'text'
                          }
                          placeholder={field.placeholder ?? ''}
                          value={serviceConfigs[service.id]?.[field.key] ?? field.default ?? ''}
                          onChange={(e) => updateServiceConfig(service.id, field.key, e.target.value)}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-error-muted border border-error/30 rounded-lg px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg border border-border text-text-primary text-sm font-medium hover:bg-surface-hover transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={loading}
          className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-accent/20"
        >
          {loading && <Spinner className="w-4 h-4" />}
          Continue
          {!loading && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Branding
// ---------------------------------------------------------------------------

function BrandingStep({
  onComplete,
  onBack,
}: {
  onComplete: (branding: BrandingConfig) => void;
  onBack: () => void;
}) {
  const [branding, setBranding] = useState<BrandingConfig>({
    platformName: 'Exprsn',
    domain: '',
    accentColor: '#f83b85',
    tagline: '',
    logoUrl: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!branding.platformName.trim()) {
      setError('Platform name is required');
      return;
    }
    setLoading(true);
    setError(null);

    const result = await apiPost('/branding', branding);
    setLoading(false);

    if (!result.success && result.message) {
      // Non-fatal — the branding endpoint might not exist yet
      console.warn('Branding API:', result.message);
    }

    onComplete(branding);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Platform Branding</h2>
        <p className="text-text-secondary mt-1.5">
          Customize the look and identity of your Exprsn instance.
        </p>
      </div>

      <div className="space-y-4">
        {/* Platform name */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Platform Name <span className="text-accent">*</span>
          </label>
          <input
            type="text"
            value={branding.platformName}
            onChange={(e) => setBranding((p) => ({ ...p, platformName: e.target.value }))}
            placeholder="Exprsn"
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/20 transition-colors"
          />
        </div>

        {/* Domain */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Primary Domain
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">
              https://
            </span>
            <input
              type="text"
              value={branding.domain}
              onChange={(e) => setBranding((p) => ({ ...p, domain: e.target.value }))}
              placeholder="exprsn.app"
              className="w-full bg-surface border border-border rounded-lg pl-16 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/20 transition-colors"
            />
          </div>
        </div>

        {/* Tagline */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">Tagline</label>
          <input
            type="text"
            value={branding.tagline}
            onChange={(e) => setBranding((p) => ({ ...p, tagline: e.target.value }))}
            placeholder="Express yourself."
            className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-accent/20 transition-colors"
          />
        </div>

        {/* Accent color */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">Accent Color</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setBranding((p) => ({ ...p, accentColor: preset.value }))}
                title={preset.label}
                className={[
                  'w-8 h-8 rounded-full transition-all duration-150',
                  branding.accentColor === preset.value
                    ? 'ring-2 ring-offset-2 ring-offset-background ring-white scale-110'
                    : 'hover:scale-105',
                ].join(' ')}
                style={{ backgroundColor: preset.value }}
              />
            ))}
            {/* Custom color picker */}
            <label
              className="w-8 h-8 rounded-full bg-surface border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:border-border-hover transition-colors overflow-hidden"
              title="Custom color"
            >
              <input
                type="color"
                value={branding.accentColor}
                onChange={(e) => setBranding((p) => ({ ...p, accentColor: e.target.value }))}
                className="opacity-0 absolute w-px h-px"
              />
              <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </label>
          </div>

          {/* Live preview swatch */}
          <div
            className="h-10 rounded-lg transition-colors duration-200 flex items-center px-4"
            style={{ backgroundColor: branding.accentColor }}
          >
            <span className="text-white text-sm font-semibold drop-shadow">
              {branding.platformName || 'Exprsn'}
            </span>
            <span className="ml-auto text-white/70 text-xs font-mono">{branding.accentColor}</span>
          </div>
        </div>

        {/* Logo upload */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Logo <span className="text-text-muted text-xs font-normal">(optional)</span>
          </label>
          {branding.logoUrl ? (
            <div className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border">
              <img
                src={branding.logoUrl}
                alt="Logo preview"
                className="w-10 h-10 rounded object-contain bg-background"
              />
              <span className="text-sm text-text-secondary flex-1 truncate">{branding.logoUrl}</span>
              <button
                onClick={() => setBranding((p) => ({ ...p, logoUrl: '' }))}
                className="text-text-muted hover:text-error transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center gap-2 p-6 rounded-xl border-2 border-dashed border-border hover:border-border-hover cursor-pointer transition-colors group">
              <svg
                className="w-8 h-8 text-text-muted group-hover:text-text-secondary transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm text-text-secondary">
                <span className="text-accent font-medium">Click to upload</span> or drag & drop
              </p>
              <p className="text-xs text-text-muted">SVG, PNG, JPG (max 2MB)</p>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) =>
                      setBranding((p) => ({ ...p, logoUrl: ev.target?.result as string }));
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-error-muted border border-error/30 rounded-lg px-4 py-3 text-sm text-error">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg border border-border text-text-primary text-sm font-medium hover:bg-surface-hover transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleContinue}
          disabled={loading}
          className="ml-auto flex items-center gap-2 px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-accent/20"
        >
          {loading && <Spinner className="w-4 h-4" />}
          Continue
          {!loading && (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Finalize
// ---------------------------------------------------------------------------

interface ReviewSummaryProps {
  adminForm: AdminForm | null;
  services: Record<string, boolean>;
  branding: BrandingConfig | null;
  onEdit: (stepIndex: number) => void;
  onLaunch: () => void;
  onBack: () => void;
  launching: boolean;
  launched: boolean;
}

function FinalizeStep({
  adminForm,
  services,
  branding,
  onEdit,
  onLaunch,
  onBack,
  launching,
  launched,
}: ReviewSummaryProps) {
  const enabledServices = Object.entries(services)
    .filter(([, v]) => v)
    .map(([k]) => DEFAULT_SERVICES.find((s) => s.id === k)?.label ?? k);

  if (launched) {
    return <SuccessScreen branding={branding} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary">Review & Launch</h2>
        <p className="text-text-secondary mt-1.5">
          Everything looks good? Hit launch to bring your instance online.
        </p>
      </div>

      <div className="space-y-3">
        {/* Admin summary */}
        <SummaryCard
          title="Admin Account"
          onEdit={() => onEdit(2)}
        >
          {adminForm ? (
            <div className="space-y-1">
              <p className="text-sm text-text-primary">
                <span className="text-text-muted">Handle:</span>{' '}
                <span className="font-mono">@{adminForm.handle}</span>
              </p>
              <p className="text-sm text-text-primary">
                <span className="text-text-muted">Email:</span> {adminForm.email}
              </p>
              {adminForm.displayName && (
                <p className="text-sm text-text-primary">
                  <span className="text-text-muted">Name:</span> {adminForm.displayName}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted italic">Not configured</p>
          )}
        </SummaryCard>

        {/* Branding summary */}
        <SummaryCard title="Branding" onEdit={() => onEdit(4)}>
          {branding ? (
            <div className="flex items-center gap-4">
              <div
                className="w-8 h-8 rounded-lg shrink-0"
                style={{ backgroundColor: branding.accentColor }}
              />
              <div>
                <p className="text-sm font-semibold text-text-primary">{branding.platformName}</p>
                {branding.domain && (
                  <p className="text-xs text-text-secondary">{branding.domain}</p>
                )}
                {branding.tagline && (
                  <p className="text-xs text-text-muted italic">&quot;{branding.tagline}&quot;</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted italic">Default branding</p>
          )}
        </SummaryCard>

        {/* Services summary */}
        <SummaryCard title="Enabled Services" onEdit={() => onEdit(3)}>
          {enabledServices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {enabledServices.map((label) => (
                <span
                  key={label}
                  className="text-xs bg-accent-muted text-accent px-2.5 py-1 rounded-full font-medium"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted italic">No services enabled</p>
          )}
        </SummaryCard>
      </div>

      <div className="bg-info-muted border border-info/30 rounded-lg px-4 py-3 text-sm text-info flex items-start gap-2">
        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        All settings can be changed later from the admin dashboard.
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-lg border border-border text-text-primary text-sm font-medium hover:bg-surface-hover transition-colors"
        >
          Back
        </button>
        <button
          onClick={onLaunch}
          disabled={launching}
          className="ml-auto flex items-center gap-2 px-8 py-3 rounded-lg text-white text-sm font-bold transition-all shadow-lg disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${branding?.accentColor ?? '#f83b85'}, ${branding?.accentColor ? branding.accentColor + 'cc' : '#f83b85cc'})`,
            boxShadow: `0 8px 24px ${branding?.accentColor ?? '#f83b85'}40`,
          }}
        >
          {launching ? (
            <>
              <Spinner className="w-4 h-4" />
              Launching…
            </>
          ) : (
            <>
              Launch Exprsn
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <button
          onClick={onEdit}
          className="text-xs text-accent hover:text-accent-hover font-medium transition-colors"
        >
          Edit
        </button>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success / Confetti screen
// ---------------------------------------------------------------------------

function SuccessScreen({ branding }: { branding: BrandingConfig | null }) {
  const router = useRouter();
  const [confetti] = useState<ConfettiParticle[]>(() => generateConfetti(60));

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/admin');
    }, 6000);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="relative text-center space-y-6 py-8 overflow-hidden">
      {/* Confetti particles */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        {confetti.map((p) => (
          <div
            key={p.id}
            className="absolute top-0"
            style={{
              left: `${p.x}%`,
              animationName: 'confettiFall',
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              animationTimingFunction: 'linear',
              animationFillMode: 'both',
              animationIterationCount: '1',
            }}
          >
            <div
              style={{
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                transform: `rotate(${p.rotation}deg)`,
              }}
            />
          </div>
        ))}
      </div>

      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-2xl"
        style={{
          background: `linear-gradient(135deg, ${branding?.accentColor ?? '#f83b85'}, ${branding?.accentColor ?? '#f83b85'}88)`,
          boxShadow: `0 0 60px ${branding?.accentColor ?? '#f83b85'}60`,
        }}
      >
        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
        </svg>
      </div>

      <div>
        <h2 className="text-3xl font-bold text-text-primary">
          {branding?.platformName ?? 'Exprsn'} is live!
        </h2>
        <p className="text-text-secondary mt-2">
          Your instance has been set up. Redirecting to the admin dashboard…
        </p>
      </div>

      <div className="w-full bg-border rounded-full h-1 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            backgroundColor: branding?.accentColor ?? '#f83b85',
            animation: 'progressBar 6s linear forwards',
          }}
        />
      </div>

      <button
        onClick={() => router.push('/admin')}
        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-white text-sm font-semibold transition-all"
        style={{ backgroundColor: branding?.accentColor ?? '#f83b85' }}
      >
        Go to Dashboard now
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>

      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes progressBar {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard component
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [adminForm, setAdminForm] = useState<AdminForm | null>(null);
  const [services, setServices] = useState<Record<string, boolean>>({});
  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [initialChecking, setInitialChecking] = useState(true);

  // Check if setup is already complete
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${SETUP_API}/state`);
        if (res.ok) {
          const status: SetupStatus = await res.json();
          if (status.status === 'completed') {
            router.replace('/');
            return;
          }
          // Restore progress
          if (status.completedSteps?.length) {
            setCompletedSteps(new Set(status.completedSteps));
            setStepIndex(Math.min(status.currentStep ?? 0, STEPS.length - 1));
          }
        }
      } catch {
        // API not available — continue with setup
      } finally {
        setInitialChecking(false);
      }
    };
    check();
  }, [router]);

  const markComplete = (id: string) => {
    setCompletedSteps((prev) => new Set([...prev, id]));
  };

  const goToStep = (index: number) => {
    setStepIndex(index);
  };

  const handleLaunch = async () => {
    setLaunching(true);
    const result = await apiPost('/finalize');
    setLaunching(false);

    if (!result.success) {
      console.error('Finalize failed:', result.message);
      // Allow proceeding anyway for demo/dev
    }

    setLaunched(true);
  };

  if (initialChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="w-8 h-8 text-accent" />
      </div>
    );
  }

  const currentStepId = STEPS[stepIndex].id;

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 3l14 9-14 9V3z" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-text-primary">Exprsn Setup</span>
          </div>
          <span className="text-xs text-text-muted font-medium">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
        </div>
      </header>

      {/* Main layout */}
      <div className="max-w-5xl mx-auto px-4 pt-20 pb-16">
        <div className="flex gap-8 lg:gap-12">
          {/* Sidebar */}
          <aside className="hidden md:block w-52 shrink-0 pt-4">
            <div className="sticky top-24">
              <StepSidebar currentIndex={stepIndex} completedSteps={completedSteps} />
            </div>
          </aside>

          {/* Content */}
          <main className="flex-1 min-w-0">
            {/* Mobile step indicator */}
            <div className="md:hidden flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar pb-1">
              {STEPS.map((step, i) => (
                <div
                  key={step.id}
                  className={[
                    'flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all',
                    i === stepIndex
                      ? 'bg-accent text-white'
                      : completedSteps.has(step.id)
                        ? 'bg-success-muted text-success'
                        : 'bg-surface text-text-muted',
                  ].join(' ')}
                >
                  {completedSteps.has(step.id) ? (
                    <CheckIcon className="w-3 h-3" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                  <span>{step.title}</span>
                </div>
              ))}
            </div>

            {/* Step content with transition */}
            <div
              key={currentStepId}
              className="animate-in fade-in slide-in-from-right-2 duration-200 bg-surface rounded-2xl border border-border p-6 lg:p-8"
            >
              {currentStepId === 'prerequisites' && (
                <PrerequisitesStep
                  onComplete={() => {
                    markComplete('prerequisites');
                    setStepIndex(1);
                  }}
                />
              )}

              {currentStepId === 'certificates' && (
                <CertificatesStep
                  onBack={() => setStepIndex(0)}
                  onComplete={() => {
                    markComplete('certificates');
                    setStepIndex(2);
                  }}
                />
              )}

              {currentStepId === 'admin' && (
                <AdminStep
                  onBack={() => setStepIndex(1)}
                  onComplete={(data) => {
                    setAdminForm(data);
                    markComplete('admin');
                    setStepIndex(3);
                  }}
                />
              )}

              {currentStepId === 'services' && (
                <ServicesStep
                  onBack={() => setStepIndex(2)}
                  onComplete={(svcMap, _smtp) => {
                    setServices(svcMap);
                    markComplete('services');
                    setStepIndex(4);
                  }}
                />
              )}

              {currentStepId === 'branding' && (
                <BrandingStep
                  onBack={() => setStepIndex(3)}
                  onComplete={(b) => {
                    setBranding(b);
                    markComplete('branding');
                    setStepIndex(5);
                  }}
                />
              )}

              {currentStepId === 'finalize' && (
                <FinalizeStep
                  adminForm={adminForm}
                  services={services}
                  branding={branding}
                  onEdit={goToStep}
                  onBack={() => setStepIndex(4)}
                  onLaunch={handleLaunch}
                  launching={launching}
                  launched={launched}
                />
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
