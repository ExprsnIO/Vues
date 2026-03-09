'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html>
      <body className="bg-[#0f0f0f] text-[#f5f5f5]">
        <div className="min-h-screen flex flex-col items-center justify-center px-4">
          <div className="text-center max-w-md">
            {/* Critical Error Icon */}
            <div className="mb-8">
              <svg
                className="w-32 h-32 mx-auto text-red-500/50"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold mb-4">
              Critical Error
            </h1>

            {/* Description */}
            <p className="text-gray-400 mb-4">
              A critical error occurred that prevented the application from loading.
              Please try refreshing the page.
            </p>

            {/* Error digest for debugging */}
            {error.digest && (
              <p className="text-xs text-gray-500 mb-6 font-mono bg-gray-800 px-3 py-2 rounded">
                Error ID: {error.digest}
              </p>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={reset}
                className="px-6 py-3 bg-pink-600 text-white font-medium rounded-lg hover:bg-pink-700 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-gray-800 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors border border-gray-700"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
