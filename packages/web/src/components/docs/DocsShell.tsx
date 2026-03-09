import type { ReactNode } from 'react';
import { Sidebar } from '@/components/Sidebar';
import type { DocsSection, DocsTocItem } from '@/lib/docs/types';
import { DocsOnThisPage } from './DocsOnThisPage';
import { DocsSidebarNav } from './DocsSidebarNav';

interface DocsShellProps {
  sections: DocsSection[];
  activeSlug?: string;
  title: string;
  summary: string;
  children: ReactNode;
  toc?: DocsTocItem[];
}

export function DocsShell({
  sections,
  activeSlug,
  title,
  summary,
  children,
  toc = [],
}: DocsShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 pb-16 pt-14 lg:ml-60 lg:pb-0 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-6 lg:hidden">
            <DocsSidebarNav sections={sections} activeSlug={activeSlug} compact />
          </div>

          <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_220px]">
            <aside className="hidden lg:block">
              <DocsSidebarNav sections={sections} activeSlug={activeSlug} />
            </aside>

            <div className="min-w-0">
              <header className="mb-8 rounded-3xl border border-border bg-surface p-6 sm:p-8">
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-text-muted">
                  Exprsn Docs
                </p>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
                  {title}
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-text-secondary">{summary}</p>
              </header>

              <div className="min-w-0">{children}</div>
            </div>

            <aside className="hidden xl:block">
              <DocsOnThisPage items={toc} />
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
