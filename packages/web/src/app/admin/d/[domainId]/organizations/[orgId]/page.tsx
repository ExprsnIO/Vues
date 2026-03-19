'use client';

import { redirect } from 'next/navigation';
import { use } from 'react';

export default function DomainOrganizationDetailPage({
  params,
}: {
  params: Promise<{ domainId: string; orgId: string }>;
}) {
  const { orgId } = use(params);
  // Redirect to the global organization detail page which has the full UI
  redirect(`/admin/organizations/${orgId}`);
}
