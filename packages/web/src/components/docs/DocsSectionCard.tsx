import Link from 'next/link';
import type { DocsSection } from '@/lib/docs/types';

interface DocsSectionCardProps {
  section: DocsSection;
}

export function DocsSectionCard({ section }: DocsSectionCardProps) {
  return (
    <Link
      href={`/docs/${section.slug}`}
      className="group rounded-2xl border border-border bg-surface p-6 transition-colors hover:border-accent/40 hover:bg-surface-hover"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-text-primary">{section.title}</h2>
            {section.visibility === 'admin' ? (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-text-muted">
                Admin only
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{section.summary}</p>
        </div>
        <ArrowIcon className="h-5 w-5 flex-shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text-primary" />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <span className="rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-text-muted">
          {section.audience}
        </span>
        <span className="rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-text-muted">
          {section.status === 'available'
            ? 'Available now'
            : section.status === 'mvp'
              ? 'MVP'
              : 'Planned'}
        </span>
      </div>
    </Link>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
    </svg>
  );
}
