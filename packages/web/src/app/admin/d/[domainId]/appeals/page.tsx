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
  originalActionId: string;
  originalActionType: 'report' | 'sanction' | 'content_removal' | 'account_action';
  userId: string;
  domainId: string;
  reason: string;
  evidence?: string;
  status: 'pending' | 'in_review' | 'awaiting_info' | 'resolved' | 'withdrawn';
  priority: 'critical' | 'high' | 'medium' | 'low';
  assignedTo?: string;
  reviewedBy?: string;
  outcome?: 'upheld' | 'overturned' | 'partially_overturned' | 'dismissed';
  outcomeReason?: string;
  originalModerator?: string;
  originalDecision?: string;
  originalDecisionAt?: string;
  createdAt: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  updatedAt: string;
  user?: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  moderator?: {
    handle: string;
    displayName?: string;
  };
}

interface AppealHistoryEntry {
  id: string;
  appealId: string;
  action: string;
  actor: string;
  actorType: 'user' | 'moderator' | 'system';
  details: Record<string, any>;
  createdAt: string;
}

type ViewMode = 'list' | 'detail';

export default function DomainAppealsPage() {
  const params = useParams();
  const domainId = params.domainId as string;
  const { setSelectedDomain, selectedDomain } = useAdminDomain();
  const [activeTab, setActiveTab] = useState('pending');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedAppeal, setSelectedAppeal] = useState<Appeal | null>(null);
  const [decision, setDecision] = useState<'upheld' | 'overturned' | 'partially_overturned' | 'dismissed'>('overturned');
  const [decisionReason, setDecisionReason] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [reinstateContent, setReinstateContent] = useState(true);
  const [removeAction, setRemoveAction] = useState(true);
  const [requestInfoModal, setRequestInfoModal] = useState(false);
  const [infoQuestion, setInfoQuestion] = useState('');
  const [escalateModal, setEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
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
        limit: 100,
      }),
    enabled: !!domainId,
  });

  const { data: appealDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'appeal', selectedAppeal?.id],
    queryFn: () => api.adminDomainAppealGet(domainId, selectedAppeal!.id),
    enabled: !!selectedAppeal && viewMode === 'detail',
  });

  const { data: appealHistory } = useQuery({
    queryKey: ['admin', 'domain', domainId, 'appeal', selectedAppeal?.id, 'history'],
    queryFn: () => api.adminDomainAppealHistory(domainId, selectedAppeal!.id),
    enabled: !!selectedAppeal && viewMode === 'detail',
  });

  const decideMutation = useMutation({
    mutationFn: (data: {
      outcome: string;
      reason: string;
      reinstateContent?: boolean;
      removeAction?: boolean;
      internalNotes?: string;
    }) =>
      api.adminDomainAppealDecide(domainId, selectedAppeal!.id, data),
    onSuccess: () => {
      toast.success('Appeal decision recorded');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'appeals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'appeal', selectedAppeal?.id] });
      setViewMode('list');
      setSelectedAppeal(null);
      resetForm();
    },
    onError: () => {
      toast.error('Failed to process appeal decision');
    },
  });

  const requestInfoMutation = useMutation({
    mutationFn: (question: string) =>
      api.adminDomainAppealRequestInfo(domainId, selectedAppeal!.id, { question }),
    onSuccess: () => {
      toast.success('Information requested from user');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'appeals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'appeal', selectedAppeal?.id] });
      setRequestInfoModal(false);
      setInfoQuestion('');
    },
    onError: () => {
      toast.error('Failed to request information');
    },
  });

  const escalateMutation = useMutation({
    mutationFn: (reason: string) =>
      api.adminDomainAppealEscalate(domainId, selectedAppeal!.id, { reason }),
    onSuccess: () => {
      toast.success('Appeal escalated to senior moderator');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'appeals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'appeal', selectedAppeal?.id] });
      setEscalateModal(false);
      setEscalateReason('');
    },
    onError: () => {
      toast.error('Failed to escalate appeal');
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: (note: string) =>
      api.adminDomainAppealAddNote(domainId, selectedAppeal!.id, { note }),
    onSuccess: () => {
      toast.success('Note added');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'appeal', selectedAppeal?.id, 'history'] });
      setInternalNotes('');
    },
    onError: () => {
      toast.error('Failed to add note');
    },
  });

  const assignToMeMutation = useMutation({
    mutationFn: () => api.adminDomainAppealAssignToMe(domainId, selectedAppeal!.id),
    onSuccess: () => {
      toast.success('Appeal assigned to you');
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'appeals'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'domain', domainId, 'appeal', selectedAppeal?.id] });
    },
    onError: () => {
      toast.error('Failed to assign appeal');
    },
  });

  const resetForm = () => {
    setDecision('overturned');
    setDecisionReason('');
    setInternalNotes('');
    setReinstateContent(true);
    setRemoveAction(true);
  };

  const handleViewAppeal = (appeal: Appeal) => {
    setSelectedAppeal(appeal);
    setViewMode('detail');
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedAppeal(null);
    resetForm();
  };

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
    in_review: 0,
    awaiting_info: 0,
    resolved: 0,
    withdrawn: 0,
  };

  const tabs = [
    { id: 'pending', label: 'Pending', badge: stats.pending },
    { id: 'in_review', label: 'In Review', badge: stats.in_review },
    { id: 'awaiting_info', label: 'Awaiting Info', badge: stats.awaiting_info },
    { id: 'resolved', label: 'Resolved', badge: stats.resolved },
    { id: 'withdrawn', label: 'Withdrawn', badge: stats.withdrawn },
    { id: 'all', label: 'All Appeals' },
  ];

  const appealTypeLabels: Record<string, string> = {
    report: 'Report Decision',
    sanction: 'Account Sanction',
    content_removal: 'Content Removal',
    account_action: 'Account Action',
  };

  const priorityColors: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-500 border-red-500/20',
    high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  };

  const outcomeLabels: Record<string, string> = {
    upheld: 'Upheld',
    overturned: 'Overturned',
    partially_overturned: 'Partially Overturned',
    dismissed: 'Dismissed',
  };

  if (viewMode === 'detail' && selectedAppeal) {
    const detail = appealDetail?.appeal || selectedAppeal;
    const history = appealHistory?.history || [];

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBackToList}
            className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <PageHeader
            title="Appeal Detail"
            description={`Appeal ID: ${detail.id}`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Appeal Info */}
            <div className="bg-surface border border-border rounded-lg p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-surface-hover overflow-hidden">
                    {detail.user?.avatar ? (
                      <img src={detail.user.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-text-muted text-lg">
                        {detail.user?.handle?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-lg font-medium text-text-primary">
                      {detail.user?.displayName || detail.user?.handle || 'Unknown User'}
                    </p>
                    <p className="text-sm text-text-muted">@{detail.user?.handle || 'unknown'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={
                    detail.priority === 'critical' ? 'error' :
                    detail.priority === 'high' ? 'warning' :
                    'info'
                  }>
                    {detail.priority.toUpperCase()}
                  </Badge>
                  <Badge variant={
                    detail.status === 'resolved' ? 'success' :
                    detail.status === 'in_review' ? 'info' :
                    detail.status === 'awaiting_info' ? 'warning' :
                    'default'
                  }>
                    {detail.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
              </div>

              {/* Original Action */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-text-primary mb-2">Original Moderation Action</h4>
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <Badge variant="error">
                      {appealTypeLabels[detail.originalActionType]}
                    </Badge>
                    {detail.originalDecisionAt && (
                      <p className="text-xs text-text-muted">
                        {new Date(detail.originalDecisionAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <p className="text-sm text-text-primary mt-2">
                    {detail.originalDecision || 'No decision details available'}
                  </p>
                  {detail.originalModerator && (
                    <p className="text-xs text-text-muted mt-2">
                      Moderator: {detail.originalModerator}
                    </p>
                  )}
                </div>
              </div>

              {/* Appeal Reason */}
              <div className="mb-6">
                <h4 className="text-sm font-medium text-text-primary mb-2">User's Appeal</h4>
                <div className="p-4 bg-surface-hover rounded-lg">
                  <p className="text-sm text-text-primary whitespace-pre-wrap">{detail.reason}</p>
                  {detail.evidence && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs font-medium text-text-muted mb-1">Additional Evidence:</p>
                      <p className="text-sm text-text-primary whitespace-pre-wrap">{detail.evidence}</p>
                    </div>
                  )}
                  <p className="text-xs text-text-muted mt-3">
                    Submitted {new Date(detail.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Decision Section (if not resolved) */}
              {detail.status !== 'resolved' && detail.status !== 'withdrawn' && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-text-primary">Make Decision</h4>

                  <FormField label="Outcome">
                    <RadioGroup
                      name="outcome"
                      value={decision}
                      onChange={(value) => setDecision(value as any)}
                      options={[
                        {
                          value: 'overturned',
                          label: 'Overturn',
                          description: 'Appeal approved - reverse the original action',
                        },
                        {
                          value: 'upheld',
                          label: 'Uphold',
                          description: 'Appeal denied - original action stands',
                        },
                        {
                          value: 'partially_overturned',
                          label: 'Partially Overturn',
                          description: 'Modify the original action',
                        },
                        {
                          value: 'dismissed',
                          label: 'Dismiss',
                          description: 'Appeal is invalid or frivolous',
                        },
                      ]}
                    />
                  </FormField>

                  {(decision === 'overturned' || decision === 'partially_overturned') && (
                    <div className="space-y-3 p-4 bg-surface-hover rounded-lg">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={reinstateContent}
                          onChange={(e) => setReinstateContent(e.target.checked)}
                          className="rounded border-border"
                        />
                        <span className="text-sm text-text-primary">Reinstate removed content</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={removeAction}
                          onChange={(e) => setRemoveAction(e.target.checked)}
                          className="rounded border-border"
                        />
                        <span className="text-sm text-text-primary">Remove original sanction</span>
                      </label>
                    </div>
                  )}

                  <FormField label="Decision Reason" hint="This will be sent to the user" required>
                    <Textarea
                      value={decisionReason}
                      onChange={(e) => setDecisionReason(e.target.value)}
                      placeholder="Explain your decision to the user..."
                      rows={4}
                      required
                    />
                  </FormField>

                  <div className="flex gap-3">
                    <button
                      onClick={() => decideMutation.mutate({
                        outcome: decision,
                        reason: decisionReason,
                        reinstateContent: decision === 'overturned' || decision === 'partially_overturned' ? reinstateContent : undefined,
                        removeAction: decision === 'overturned' || decision === 'partially_overturned' ? removeAction : undefined,
                      })}
                      disabled={decideMutation.isPending || !decisionReason.trim()}
                      className={`px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${
                        decision === 'overturned' || decision === 'partially_overturned'
                          ? 'bg-green-500 hover:bg-green-600 text-white'
                          : 'bg-red-500 hover:bg-red-600 text-white'
                      }`}
                    >
                      {decideMutation.isPending ? 'Processing...' : `Submit ${outcomeLabels[decision]}`}
                    </button>
                    <button
                      onClick={() => setRequestInfoModal(true)}
                      className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                    >
                      Request More Info
                    </button>
                    <button
                      onClick={() => setEscalateModal(true)}
                      className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
                    >
                      Escalate
                    </button>
                  </div>
                </div>
              )}

              {/* Outcome (if resolved) */}
              {detail.status === 'resolved' && detail.outcome && (
                <div className="p-4 bg-surface-hover rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={
                      detail.outcome === 'overturned' || detail.outcome === 'partially_overturned'
                        ? 'success'
                        : 'error'
                    }>
                      {outcomeLabels[detail.outcome]}
                    </Badge>
                    {detail.resolvedAt && (
                      <p className="text-xs text-text-muted">
                        Resolved {new Date(detail.resolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  {detail.outcomeReason && (
                    <p className="text-sm text-text-primary mt-2">{detail.outcomeReason}</p>
                  )}
                  {detail.reviewedBy && (
                    <p className="text-xs text-text-muted mt-2">Reviewed by: {detail.reviewedBy}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            {detail.status === 'pending' && (
              <div className="bg-surface border border-border rounded-lg p-4">
                <h4 className="text-sm font-medium text-text-primary mb-3">Actions</h4>
                <div className="space-y-2">
                  <button
                    onClick={() => assignToMeMutation.mutate()}
                    disabled={assignToMeMutation.isPending}
                    className="w-full px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
                  >
                    {assignToMeMutation.isPending ? 'Assigning...' : 'Assign to Me'}
                  </button>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary mb-4">Timeline</h4>
              <div className="space-y-3">
                {history.map((entry: AppealHistoryEntry, index: number) => (
                  <div key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full ${
                        entry.actorType === 'system' ? 'bg-gray-500' :
                        entry.actorType === 'moderator' ? 'bg-blue-500' :
                        'bg-green-500'
                      }`} />
                      {index < history.length - 1 && (
                        <div className="w-0.5 h-full bg-border mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-3">
                      <p className="text-xs font-medium text-text-primary">
                        {entry.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        by {entry.actorType === 'system' ? 'System' : entry.actor}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {new Date(entry.createdAt).toLocaleString()}
                      </p>
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <div className="mt-2 p-2 bg-surface-hover rounded text-xs">
                          {entry.details.reason && <p className="text-text-muted">{entry.details.reason}</p>}
                          {entry.details.question && <p className="text-text-muted">Q: {entry.details.question}</p>}
                          {entry.details.response && <p className="text-text-muted mt-1">A: {entry.details.response}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Internal Notes */}
            <div className="bg-surface border border-border rounded-lg p-4">
              <h4 className="text-sm font-medium text-text-primary mb-3">Internal Notes</h4>
              <Textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Add internal notes (not visible to user)..."
                rows={3}
                className="mb-2"
              />
              <button
                onClick={() => addNoteMutation.mutate(internalNotes)}
                disabled={!internalNotes.trim() || addNoteMutation.isPending}
                className="w-full px-3 py-1.5 text-sm bg-surface-hover hover:bg-border text-text-primary rounded-lg transition-colors disabled:opacity-50"
              >
                {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
              </button>
            </div>
          </div>
        </div>

        {/* Request Info Modal */}
        <Modal
          isOpen={requestInfoModal}
          onClose={() => setRequestInfoModal(false)}
          title="Request Additional Information"
        >
          <ModalBody>
            <FormField label="Question for User" required>
              <Textarea
                value={infoQuestion}
                onChange={(e) => setInfoQuestion(e.target.value)}
                placeholder="What additional information do you need from the user?"
                rows={4}
                required
              />
            </FormField>
          </ModalBody>
          <ModalFooter>
            <button
              onClick={() => setRequestInfoModal(false)}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => requestInfoMutation.mutate(infoQuestion)}
              disabled={!infoQuestion.trim() || requestInfoMutation.isPending}
              className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors disabled:opacity-50"
            >
              {requestInfoMutation.isPending ? 'Sending...' : 'Send Request'}
            </button>
          </ModalFooter>
        </Modal>

        {/* Escalate Modal */}
        <Modal
          isOpen={escalateModal}
          onClose={() => setEscalateModal(false)}
          title="Escalate Appeal"
        >
          <ModalBody>
            <FormField label="Escalation Reason" required>
              <Textarea
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                placeholder="Why does this appeal need senior moderator review?"
                rows={4}
                required
              />
            </FormField>
          </ModalBody>
          <ModalFooter>
            <button
              onClick={() => setEscalateModal(false)}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => escalateMutation.mutate(escalateReason)}
              disabled={!escalateReason.trim() || escalateMutation.isPending}
              className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {escalateMutation.isPending ? 'Escalating...' : 'Escalate to Senior Moderator'}
            </button>
          </ModalFooter>
        </Modal>
      </div>
    );
  }

  // List view
  const columns: Column<Appeal>[] = [
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => (
        <div className={`px-2 py-1 rounded text-xs font-medium border ${priorityColors[row.priority]}`}>
          {row.priority.toUpperCase()}
        </div>
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-hover overflow-hidden">
            {row.user?.avatar ? (
              <img src={row.user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
                {row.user?.handle?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {row.user?.displayName || row.user?.handle || 'Unknown'}
            </p>
            <p className="text-xs text-text-muted">@{row.user?.handle || 'unknown'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <Badge variant="info">
          {appealTypeLabels[row.originalActionType]}
        </Badge>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
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
            row.status === 'resolved'
              ? 'success'
              : row.status === 'in_review'
              ? 'info'
              : row.status === 'awaiting_info'
              ? 'warning'
              : 'default'
          }
          dot
        >
          {row.status.replace('_', ' ').charAt(0).toUpperCase() + row.status.replace('_', ' ').slice(1)}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      render: (row) => (
        <span className="text-sm text-text-muted">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (row) => (
        <button
          onClick={() => handleViewAppeal(row)}
          className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-text-inverse rounded-lg transition-colors"
        >
          {row.status === 'pending' || row.status === 'in_review' ? 'Review' : 'View'}
        </button>
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
        emptyMessage="No appeals found"
      />
    </div>
  );
}
