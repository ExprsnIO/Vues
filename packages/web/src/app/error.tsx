'use client';

import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* Error Icon */}
        <div className="mb-8">
          <svg
            className="w-32 h-32 mx-auto text-error/50"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-text-primary mb-4">
          Something Went Wrong
        </h1>

        {/* Description */}
        <p className="text-text-muted mb-4">
          We encountered an unexpected error. Don&apos;t worry, our team has been notified.
        </p>

        {/* Error digest for debugging */}
        {error.digest && (
          <p className="text-xs text-text-muted mb-6 font-mono bg-surface px-3 py-2 rounded">
            Error ID: {error.digest}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-accent text-text-inverse font-medium rounded-lg hover:bg-accent-hover transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-surface text-text-primary font-medium rounded-lg hover:bg-surface-hover transition-colors border border-border"
          >
            Go Home
          </button>
        </div>

        {/* Help text */}
        <p className="mt-8 text-sm text-text-muted">
          If this keeps happening,{' '}
          <a
            href="https://github.com/exprsn/exprsn/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            report the issue
          </a>
        </p>
      </div>
    </div>
  );
}
