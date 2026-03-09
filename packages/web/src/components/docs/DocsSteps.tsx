interface DocsStepsProps {
  title?: string;
  items: Array<{
    title: string;
    body: string;
  }>;
}

export function DocsSteps({ title, items }: DocsStepsProps) {
  return (
    <section className="space-y-4">
      {title ? <h3 className="text-xl font-semibold text-text-primary">{title}</h3> : null}
      <ol className="space-y-4">
        {items.map((item, index) => (
          <li key={item.title} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                {index + 1}
              </span>
              <div className="min-w-0">
                <h4 className="text-base font-semibold text-text-primary">{item.title}</h4>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{item.body}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
