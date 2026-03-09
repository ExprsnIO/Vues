'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAdminDomain } from '@/lib/admin-domain-context';
import {
  PageHeader,
  SimpleTabs,
  DataTable,
  Column,
  Badge,
  Modal,
  ModalBody,
  ModalFooter,
  FormField,
  Textarea,
  RadioGroup,
  PageSkeleton,
} from '@/components/admin/ui';

interface Appeal {
  id: string;
  type: 'sanction' | 'content_removal' | 'account_suspension';
  status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  reason: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewer?: { handle: string };
  user: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  originalAction: {
    type: string;
    reason: string;
    date: string;
  };
}

export default function DomainAppealsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState('pending');
  const [reviewingAppeal, setReviewingAppeal] = useState<Appeal | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [responseNote, setResponseNote] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (domainId) {
      setSelectedDomain(domainId);
    }
  }, [domainId, setSelectedDomain]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'appeals', activeTab],
    queryFn: () =>
      api.adminDomainAppealsList(domainId, {
        status: activeTab !== 'all' ? activeTab : undefined,
        limit: 50,
      }),
    enabled: !!domainId,
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: string; note: string }) =>
      api.adminDomainAppealReview(domainId, id, { decision, note }),
    onSuccess: () => {
      toast.success(`Appeal ${decision}`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'appeals'] });
      setReviewingAppeal(null);
      setDecision('approved');
      setResponseNote('');
    },
    onError: () => {
      toast.error('Failed to process appeal');
    },
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Failed to load appeals</p>
      </div>
    );
  }

  const appeals = data?.appeals || [];
  const stats = data?.stats || {
    pending: 0,
    reviewing: 0,
    approved: 0,
    rejected: 0,
  };

  const tabs = [
    { id: 'pending', label: 'Pending', badge: stats.pending },
    { id: 'reviewing', label: 'Reviewing', badge: stats.reviewing },
    { id: 'approved', label: 'Approved', badge: stats.approved },
    { id: 'rejected', label: 'Rejected', badge: stats.rejected },
    { id: 'all', label: 'All Appeals' },
  ];

  const appealTypeLabels: Record<string, string> = {
    sanction: 'Account Sanction',
    content_removal: 'Content Removal',
    account_suspension: 'Account Suspension',
  };

  const columns: Column<Appeal>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-hover overflow-hidden">
            {row.user.avatar ? (
              <img src={row.user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
                {row.user.handle?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {row.user.displayName || row.user.handle}
            </p>
            <p className="text-xs text-text-muted">@{row.user.handle}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Appeal Type',
      render: (row) => (
        <Badge variant="info">
          {appealTypeLabels[row.type] || row.type}
        </Badge>
      ),
    },
    {
      key: 'reason',
      header: 'Appeal Reason',
      render: (row) => (
        <span className="text-sm text-text-muted truncate max-w-[250px] block">
          {row.reason}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge
          variant={
            row.status === 'approved'
              ? 'success'
              : row.status === 'rejected'
              ? 'error'
              : row.status === 'reviewing'
              ? 'info'
              : 'warning'
          }
          dot
        >
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'submittedAt',
      header: 'Submitted',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {new Date(row.submittedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (row) => (
        row.status === 'pending' || row.status === 'reviewing' ? (
          <button
            onClick={() => setReviewingAppeal(row)}
            className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
          >
            Review
          </button>
        ) : (
          <button
            onClick={() => setReviewingAppeal(row)}
            className="px-3 py-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            View
          </button>
        )
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Moderation Appeals"
        description={`Review appeals for ${selectedDomain?.name || 'this domain'}`}
        badge={
          stats.pending > 0 && (
            <Badge variant="warning">{stats.pending} pending</Badge>
          )
        }
      />

      <SimpleTabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <DataTable
        data={appeals}
        columns={columns}
        keyExtractor={(row) => row.id}
        emptyMessage="appeals"
      />

      {/* Review Modal */}
      <Modal
        isOpen={!!reviewingAppeal}
        onClose={() => {
          setReviewingAppeal(null);
          setDecision('approved');
          setResponseNote('');
        }}
        title="Review Appeal"
        size="lg"
      >
        {reviewingAppeal && (
          <>
            <ModalBody className="space-y-6">
              {/* User Info */}
              <div className="flex items-center gap-4 p-4 bg-surface-hover rounded-lg">
                <div className="w-12 h-12 rounded-full bg-surface overflow-hidden">
                  {reviewingAppeal.user.avatar ? (
                    <img src={reviewingAppeal.user.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-text-muted text-lg">
                      {reviewingAppeal.user.handle?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-lg font-medium text-text-primary">
                    {reviewingAppeal.user.displayName || reviewingAppeal.user.handle}
                  </p>
                  <p className="text-sm text-text-muted">@{reviewingAppeal.user.handle}</p>
                </div>
              </div>

              {/* Original Action */}
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Original Action</h4>
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-500 font-medium">
                    {appealTypeLabels[reviewingAppeal.type]}
                  </p>
                  <p className="text-sm text-text-muted mt-1">{reviewingAppeal.originalAction.reason}</p>
                  <p className="text-xs text-text-muted mt-2">
                    {new Date(reviewingAppeal.originalAction.date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Appeal Reason */}
              <div>
                <h4 className="text-sm font-medium text-text-primary mb-2">Appeal Reason</h4>
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-sm text-text-primary">{reviewingAppeal.reason}</p>
                  <p className="text-xs text-text-muted mt-2">
                    Submitted {new Date(reviewingAppeal.submittedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Decision */}
              {(reviewingAppeal.status === 'pending' || reviewingAppeal.status === 'reviewing') && (
                <>
                  <FormField label="Decision">
                    <RadioGroup
                      name="decision"
                      value={decision}
                      onChange={(value) => setDecision(value as 'approved' | 'rejected')}
                      options={[
                        {
                          value: 'approved',
                          label: 'Approve Appeal',
                          description: 'Reverse the original action and restore the user/content',
                        },
                        {
                          value: 'rejected',
                          label: 'Reject Appeal',
                          description: 'Uphold the original action',
                        },
                      ]}
                    />
                  </FormField>

                  <FormField label="Response Note" hint="This will be sent to the user">
                    <Textarea
                      value={responseNote}
                      onChange={(e) => setResponseNote(e.target.value)}
                      placeholder="Enter your response to the user..."
                      rows={4}
                    />
                  </FormField>
                </>
              )}
            </ModalBody>
            <ModalFooter>
              <button
                onClick={() => {
                  setReviewingAppeal(null);
                  setDecision('approved');
                  setResponseNote('');
                }}
                className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              {(reviewingAppeal.status === 'pending' || reviewingAppeal.status === 'reviewing') && (
                <button
                  onClick={() => reviewMutation.mutate({
                    id: reviewingAppeal.id,
                    decision,
                    note: responseNote,
                  })}
                  disabled={reviewMutation.isPending}
                  className={`px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                    decision === 'approved'
                      ? 'bg-green-500 hover:bg-green-600 text-white'
                      : 'bg-red-500 hover:bg-red-600 text-white'
                  }`}
                >
                  {reviewMutation.isPending
                    ? 'Processing...'
                    : decision === 'approved'
                    ? 'Approve Appeal'
                    : 'Reject Appeal'}
                </button>
              )}
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  );
}
