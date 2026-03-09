import type { DocsBlock } from '@/lib/docs/types';
import { DocsCallout } from './DocsCallout';
import { DocsChecklist } from './DocsChecklist';
import { DocsKeyValueTable } from './DocsKeyValueTable';
import { DocsSteps } from './DocsSteps';

interface DocsBlockRendererProps {
  blocks: DocsBlock[];
}

export function DocsBlockRenderer({ blocks }: DocsBlockRendererProps) {
  return (
    <div className="space-y-8">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'lead':
            return (
              <section key={index} className="space-y-3">
                {block.title ? (
                  <h2 className="text-2xl font-semibold text-text-primary">{block.title}</h2>
                ) : null}
                {block.body.map((paragraph) => (
                  <p key={paragraph} className="text-base leading-7 text-text-secondary">
                    {paragraph}
                  </p>
                ))}
              </section>
            );
          case 'callout':
            return (
              <DocsCallout key={index} title={block.title} tone={block.tone}>
                {block.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </DocsCallout>
            );
          case 'checklist':
            return (
              <div key={index} id={block.id} className="scroll-mt-24">
                <DocsChecklist title={block.title} items={block.items} />
              </div>
            );
          case 'steps':
            return (
              <div key={index} id={block.id} className="scroll-mt-24">
                <DocsSteps title={block.title} items={block.items} />
              </div>
            );
          case 'definition-list':
            return (
              <section key={index} id={block.id} className="scroll-mt-24 space-y-4">
                {block.title ? (
                  <h3 className="text-xl font-semibold text-text-primary">{block.title}</h3>
                ) : null}
                <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
                  {block.items.map((item) => (
                    <div
                      key={item.term}
                      className="border-b border-border pb-3 last:border-b-0 last:pb-0"
                    >
                      <dt className="text-sm font-semibold uppercase tracking-wide text-text-muted">
                        {item.term}
                      </dt>
                      <dd className="mt-1 text-sm leading-6 text-text-secondary">
                        {item.definition}
                      </dd>
                    </div>
                  ))}
                </div>
              </section>
            );
          case 'table':
            return (
              <div key={index} id={block.id} className="scroll-mt-24">
                <DocsKeyValueTable title={block.title} columns={block.columns} rows={block.rows} />
              </div>
            );
          case 'link-grid':
            return (
              <section key={index} id={block.id} className="scroll-mt-24 space-y-4">
                {block.title ? (
                  <h3 className="text-xl font-semibold text-text-primary">{block.title}</h3>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  {block.links.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-surface-hover"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-base font-semibold text-text-primary">
                          {link.label}
                        </span>
                        <ArrowUpRightIcon className="h-4 w-4 text-text-muted" />
                      </div>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        {link.description}
                      </p>
                    </a>
                  ))}
                </div>
              </section>
            );
          case 'section-divider':
            return (
              <section key={index} id={block.id} className="scroll-mt-24 space-y-3 pt-2">
                <h2 className="text-2xl font-semibold text-text-primary">{block.title}</h2>
                {block.body?.map((paragraph) => (
                  <p key={paragraph} className="text-base leading-7 text-text-secondary">
                    {paragraph}
                  </p>
                ))}
              </section>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

function ArrowUpRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7m0 0H8m9 0v9" />
    </svg>
  );
}
