import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <div className="text-center max-w-md">
        {/* 404 Icon */}
        <div className="mb-8">
          <svg
            className="w-32 h-32 mx-auto text-accent/50"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-text-primary mb-4">
          Page Not Found
        </h1>

        {/* Description */}
        <p className="text-text-muted mb-8">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
          Let&apos;s get you back on track.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-accent text-text-inverse font-medium rounded-lg hover:bg-accent-hover transition-colors"
          >
            Go Home
          </Link>
          <Link
            href="/discover"
            className="px-6 py-3 bg-surface text-text-primary font-medium rounded-lg hover:bg-surface-hover transition-colors border border-border"
          >
            Discover Videos
          </Link>
        </div>

        {/* Help text */}
        <p className="mt-8 text-sm text-text-muted">
          Looking for something specific?{' '}
          <Link href="/discover" className="text-accent hover:underline">
            Try searching
          </Link>
        </p>
      </div>
    </div>
  );
}
