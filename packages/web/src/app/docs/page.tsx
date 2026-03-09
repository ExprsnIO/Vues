import type { Metadata } from 'next';
import { DocsCallout, DocsSectionCard, DocsShell } from '@/components/docs';
import { getDocsSections } from '@/lib/docs/registry';

const sections = getDocsSections();

export const metadata: Metadata = {
  title: 'Documentation | Exprsn',
  description: 'Setup, product, moderation, administration, and backend documentation for Exprsn.',
};

export default function DocsHomePage() {
  return (
    <DocsShell
      sections={sections}
      title="Documentation"
      summary="Find setup notes, product guidance, moderation workflows, and backend operational references in one place."
    >
      <div className="space-y-8">
        <DocsCallout title="Access model" tone="info">
          <p>
            Setup, User Experience, and Moderation are available publicly. Administration and
            Backend Documentation require an active admin session.
          </p>
        </DocsCallout>

        <section className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <DocsSectionCard key={section.id} section={section} />
          ))}
        </section>
      </div>
    </DocsShell>
  );
}
