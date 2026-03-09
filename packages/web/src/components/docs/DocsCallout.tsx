import type { ReactNode } from 'react';

interface DocsCalloutProps {
  title?: string;
  tone?: 'info' | 'success' | 'warning' | 'neutral';
  children: ReactNode;
}

const toneClasses = {
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
  neutral: 'border-border bg-surface-hover text-text-secondary',
};

export function DocsCallout({ title, tone = 'neutral', children }: DocsCalloutProps) {
  return (
    <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      {title ? <h3 className="text-sm font-semibold text-text-primary">{title}</h3> : null}
      <div className={title ? 'mt-2 space-y-2 text-sm leading-6' : 'space-y-2 text-sm leading-6'}>
        {children}
      </div>
    </div>
  );
}
