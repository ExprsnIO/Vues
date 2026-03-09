import Link from 'next/link';

interface DocsLockedStateProps {
  mode: 'login' | 'unauthorized';
  sectionTitle: string;
  loginHref?: string;
}

export function DocsLockedState({
  mode,
  sectionTitle,
  loginHref = '/login',
}: DocsLockedStateProps) {
  const isLogin = mode === 'login';

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-hover text-text-muted">
          <LockIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-text-primary">
            {isLogin ? `Sign in to view ${sectionTitle}` : `${sectionTitle} requires admin access`}
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {isLogin
              ? 'This section contains operational documentation that is only shown to signed-in admins.'
              : 'You are signed in, but the current account does not have an active admin session for this documentation section.'}
          </p>
          {isLogin ? (
            <div className="mt-4">
              <Link
                href={loginHref}
                className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-accent-hover"
              >
                Sign In
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V7.875a4.5 4.5 0 1 0-9 0V10.5m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Z"
      />
    </svg>
  );
}
