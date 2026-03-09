import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { DocsSection } from '@/lib/docs/types';

interface DocsSidebarNavProps {
  sections: DocsSection[];
  activeSlug?: string;
  compact?: boolean;
}

export function DocsSidebarNav({ sections, activeSlug, compact = false }: DocsSidebarNavProps) {
  return (
    <nav
      className={cn(
        compact
          ? 'flex gap-2 overflow-x-auto pb-2'
          : 'sticky top-24 rounded-2xl border border-border bg-surface p-4'
      )}
    >
      {!compact ? (
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
          Documentation
        </h2>
      ) : null}
      <div className={cn(compact ? 'flex gap-2' : 'space-y-2')}>
        {sections.map((section) => {
          const isActive = section.slug === activeSlug;

          return (
            <Link
              key={section.slug}
              href={`/docs/${section.slug}`}
              className={cn(
                'transition-colors',
                compact
                  ? 'whitespace-nowrap rounded-full border px-3 py-2 text-sm'
                  : 'block rounded-xl border px-3 py-3',
                isActive
                  ? 'border-accent/40 bg-accent/10 text-text-primary'
                  : 'border-border bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{section.title}</span>
                {section.visibility === 'admin' ? (
                  <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">
                    Admin
                  </span>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
