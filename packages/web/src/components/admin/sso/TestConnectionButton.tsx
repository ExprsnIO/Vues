'use client';

import { useState } from 'react';
import { Badge } from '@/components/admin/ui';

interface TestResult {
  success: boolean;
  message: string;
  details?: {
    responseTime?: number;
    issuer?: string;
    endpoints?: Record<string, string>;
    certificate?: {
      subject: string;
      issuer: string;
      validUntil: string;
      isValid: boolean;
    };
    scopes?: string[];
    claims?: string[];
  };
  errors?: string[];
}

interface TestConnectionButtonProps {
  providerId: string;
  providerType: 'oidc' | 'saml' | 'oauth2';
  onTest: (providerId: string) => Promise<TestResult>;
  disabled?: boolean;
  compact?: boolean;
}

export function TestConnectionButton({
  providerId,
  providerType,
  onTest,
  disabled,
  compact,
}: TestConnectionButtonProps) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const testResult = await onTest(providerId);
      setResult(testResult);
    } catch (error) {
      setResult({
        success: false,
        message: 'Connection test failed',
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
    } finally {
      setTesting(false);
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleTest}
        disabled={disabled || testing}
        className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
          result
            ? result.success
              ? 'bg-green-500/10 text-green-500'
              : 'bg-red-500/10 text-red-500'
            : 'bg-surface hover:bg-surface-hover text-text-muted'
        } disabled:opacity-50`}
      >
        {testing ? (
          <span className="flex items-center gap-1.5">
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Testing...
          </span>
        ) : result ? (
          result.success ? '✓ Connected' : '✗ Failed'
        ) : (
          'Test'
        )}
      </button>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handleTest}
          disabled={disabled || testing}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-text-inverse rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {testing ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Testing Connection...
            </span>
          ) : (
            'Test Connection'
          )}
        </button>

        {result && (
          <Badge variant={result.success ? 'success' : 'error'}>
            {result.success ? 'Connection Successful' : 'Connection Failed'}
          </Badge>
        )}
      </div>

      {result && (
        <div className={`p-4 rounded-lg border ${
          result.success
            ? 'bg-green-500/10 border-green-500/20'
            : 'bg-red-500/10 border-red-500/20'
        }`}>
          <div className="flex items-start gap-3">
            {result.success ? (
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${result.success ? 'text-green-500' : 'text-red-500'}`}>
                {result.message}
              </p>

              {result.errors && result.errors.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {result.errors.map((error, i) => (
                    <li key={i} className="text-sm text-red-400">• {error}</li>
                  ))}
                </ul>
              )}

              {result.details && (
                <>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="mt-2 text-sm text-text-muted hover:text-text-primary transition-colors"
                  >
                    {showDetails ? 'Hide Details' : 'Show Details'}
                  </button>

                  {showDetails && (
                    <div className="mt-3 space-y-3">
                      {result.details.responseTime && (
                        <div className="flex justify-between text-sm">
                          <span className="text-text-muted">Response Time</span>
                          <span className="text-text-primary">{result.details.responseTime}ms</span>
                        </div>
                      )}

                      {result.details.issuer && (
                        <div className="flex justify-between text-sm">
                          <span className="text-text-muted">Issuer</span>
                          <span className="text-text-primary font-mono text-xs">{result.details.issuer}</span>
                        </div>
                      )}

                      {result.details.endpoints && (
                        <div>
                          <p className="text-sm text-text-muted mb-2">Discovered Endpoints</p>
                          <div className="space-y-1">
                            {Object.entries(result.details.endpoints).map(([key, value]) => (
                              <div key={key} className="flex justify-between text-xs">
                                <span className="text-text-muted">{key}</span>
                                <span className="text-text-primary font-mono truncate max-w-[200px]">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {result.details.certificate && (
                        <div className="p-3 bg-surface rounded-lg">
                          <p className="text-sm font-medium text-text-primary mb-2">Certificate Info</p>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-text-muted">Subject</span>
                              <span className="text-text-primary">{result.details.certificate.subject}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-muted">Issuer</span>
                              <span className="text-text-primary">{result.details.certificate.issuer}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-muted">Valid Until</span>
                              <span className={result.details.certificate.isValid ? 'text-green-500' : 'text-red-500'}>
                                {new Date(result.details.certificate.validUntil).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {result.details.scopes && result.details.scopes.length > 0 && (
                        <div>
                          <p className="text-sm text-text-muted mb-2">Supported Scopes</p>
                          <div className="flex flex-wrap gap-1">
                            {result.details.scopes.map(scope => (
                              <span key={scope} className="px-2 py-0.5 text-xs bg-surface rounded">
                                {scope}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {result.details.claims && result.details.claims.length > 0 && (
                        <div>
                          <p className="text-sm text-text-muted mb-2">Available Claims</p>
                          <div className="flex flex-wrap gap-1">
                            {result.details.claims.map(claim => (
                              <span key={claim} className="px-2 py-0.5 text-xs bg-surface rounded">
                                {claim}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TestConnectionButton;
