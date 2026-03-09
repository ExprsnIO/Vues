import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsBlockRenderer, DocsShell, DocsVisibilityGate } from '@/components/docs';
import { getDocsSectionBySlug, getDocsSections } from '@/lib/docs/registry';

type PageProps = {
  params: Promise<{
    section: string;
  }>;
};

export function generateStaticParams() {
  return getDocsSections().map((section) => ({
    section: section.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { section } = await params;
  const docsSection = getDocsSectionBySlug(section);

  if (!docsSection) {
    return {
      title: 'Documentation | Exprsn',
    };
  }

  return {
    title: `${docsSection.title} | Exprsn`,
    description: docsSection.summary,
  };
}

export default async function DocsSectionPage({ params }: PageProps) {
  const { section } = await params;
  const docsSection = getDocsSectionBySlug(section);

  if (!docsSection) {
    notFound();
  }

  return (
    <DocsShell
      sections={getDocsSections()}
      activeSlug={docsSection.slug}
      title={docsSection.title}
      summary={docsSection.summary}
      toc={docsSection.toc}
    >
      <DocsVisibilityGate section={docsSection}>
        <DocsBlockRenderer blocks={docsSection.blocks} />
      </DocsVisibilityGate>
    </DocsShell>
  );
}
