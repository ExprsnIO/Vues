import type { DocsTocItem } from '@/lib/docs/types';

interface DocsOnThisPageProps {
  items: DocsTocItem[];
}

export function DocsOnThisPage({ items }: DocsOnThisPageProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="sticky top-24 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">
        On This Page
      </h2>
      <nav className="mt-4 space-y-2">
        {items.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="block text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            {item.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
