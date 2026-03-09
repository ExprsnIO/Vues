'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { canViewDocsSection } from '@/lib/docs/registry';
import type { DocsSection } from '@/lib/docs/types';
import { DocsLockedState } from './DocsLockedState';

interface DocsVisibilityGateProps {
  section: DocsSection;
  children: ReactNode;
}

export function DocsVisibilityGate({ section, children }: DocsVisibilityGateProps) {
  const { user, isLoading: authLoading } = useAuth();

  const { data: adminSession, isLoading: adminLoading } = useQuery({
    queryKey: ['docs', 'admin-session'],
    queryFn: () => api.getAdminSession(),
    enabled: !!user && section.visibility === 'admin',
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (section.visibility === 'public') {
    return <>{children}</>;
  }

  if (authLoading || (user && adminLoading)) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-surface-hover" />
        <div className="mt-4 h-4 w-full animate-pulse rounded bg-surface-hover" />
        <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-surface-hover" />
      </div>
    );
  }

  const canView = canViewDocsSection(
    section,
    { isAuthenticated: !!user },
    { isAdmin: !!adminSession?.admin }
  );

  if (!canView) {
    if (!user) {
      return (
        <DocsLockedState
          mode="login"
          sectionTitle={section.title}
          loginHref={`/login?redirect=/docs/${section.slug}`}
        />
      );
    }

    return <DocsLockedState mode="unauthorized" sectionTitle={section.title} />;
  }

  return <>{children}</>;
}
