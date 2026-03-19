'use client';

import { redirect } from 'next/navigation';
import { use } from 'react';

export default function AccessControlRedirect({
  params,
}: {
  params: Promise<{ domainId: string }>;
}) {
  const { domainId } = use(params);
  redirect(`/admin/d/${domainId}/settings`);
}
