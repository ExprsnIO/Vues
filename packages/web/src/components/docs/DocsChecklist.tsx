interface DocsChecklistProps {
  title?: string;
  items: string[];
}

export function DocsChecklist({ title, items }: DocsChecklistProps) {
  return (
    <section className="space-y-4">
      {title ? <h3 className="text-xl font-semibold text-text-primary">{title}</h3> : null}
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary"
          >
            <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              <CheckIcon className="h-3.5 w-3.5" />
            </span>
            <span className="leading-6">{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10.5 8.5 14 15 7.5" />
    </svg>
  );
}
