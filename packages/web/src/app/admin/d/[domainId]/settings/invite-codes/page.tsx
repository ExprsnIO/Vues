// @ts-nocheck
'use client';

import { use } from 'react';
import { InviteCodesSection } from '@/components/admin/InviteCodes';

export default function DomainInviteCodesPage({ params }: { params: Promise<{ domainId: string }> }) {
  const { domainId } = use(params);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Invite Codes</h1>
        <p className="text-text-muted">Manage certificate-backed invite codes for this domain</p>
      </div>
      <InviteCodesSection domainId={domainId} />
    </div>
  );
}
